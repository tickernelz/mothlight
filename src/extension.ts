import * as vscode from 'vscode';
import {
  RoamController,
  type Geometry,
  type RoamHost,
  type RoamState,
  type RoamView,
} from './controller.ts';
import { decodeText, isRoamableBytes, isRoamablePath } from './files.ts';
import { normalizeSettings, type RoamSettings } from './settings.ts';

const SCHEME = 'mothlight';
const SECTION = 'mothlight';
const MAX_INDEXED_FILES = 20000;
const FALLBACK_VISIBLE_LINES = 30;

function readSettings(): RoamSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return normalizeSettings({
    enabled: config.get('enabled'),
    followExplorer: config.get('followExplorer'),
    idleSeconds: config.get('idleSeconds'),
    moveMinSeconds: config.get('moveMinSeconds'),
    moveMaxSeconds: config.get('moveMaxSeconds'),
    pauseMinSeconds: config.get('pauseMinSeconds'),
    pauseMaxSeconds: config.get('pauseMaxSeconds'),
    scrollLinesPerSecond: config.get('scrollLinesPerSecond'),
    maxRoamTabs: config.get('maxRoamTabs'),
    maxFileSizeKb: config.get('maxFileSizeKb'),
    exclude: config.get('exclude'),
  });
}

function toViewUri(source: vscode.Uri): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    authority: source.authority,
    path: source.path,
    query: source.scheme,
  });
}

function toSourceUri(view: vscode.Uri): vscode.Uri {
  return vscode.Uri.from({ scheme: view.query, authority: view.authority, path: view.path });
}

function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
  return tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined;
}

function viewTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tabUri(tab)?.scheme === SCHEME);
}

class ViewDocs implements vscode.TextDocumentContentProvider {
  private readonly texts = new Map<string, string>();

  set(uri: vscode.Uri, text: string): void {
    this.texts.set(uri.toString(), text);
  }

  drop(uri: vscode.Uri): void {
    this.texts.delete(uri.toString());
  }

  clear(): void {
    this.texts.clear();
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const cached = this.texts.get(uri.toString());
    if (cached !== undefined) return cached;
    try {
      return decodeText(await vscode.workspace.fs.readFile(toSourceUri(uri)));
    } catch {
      return '';
    }
  }
}

class VscodeHost implements RoamHost {
  private readonly docs: ViewDocs;
  private readonly onState: (state: RoamState, detail?: string) => void;
  private readonly editors = new Map<string, vscode.TextEditor>();
  private search: vscode.CancellationTokenSource | undefined;

  private readonly followAllowed: () => boolean;

  constructor(
    docs: ViewDocs,
    onState: (state: RoamState, detail?: string) => void,
    followAllowed: () => boolean,
  ) {
    this.docs = docs;
    this.onState = onState;
    this.followAllowed = followAllowed;
  }

  settings(): RoamSettings {
    return readSettings();
  }

  async candidates(): Promise<readonly string[]> {
    const { exclude } = readSettings();
    const pattern = exclude.length > 0 ? '{' + exclude.join(',') + '}' : undefined;
    this.search?.cancel();
    const source = new vscode.CancellationTokenSource();
    this.search = source;
    try {
      const uris = await vscode.workspace.findFiles('**/*', pattern, MAX_INDEXED_FILES, source.token);
      return source.token.isCancellationRequested
        ? []
        : uris.filter((uri) => isRoamablePath(uri.path)).map((uri) => uri.toString());
    } finally {
      if (this.search === source) this.search = undefined;
      source.dispose();
    }
  }

  async open(key: string): Promise<RoamView | undefined> {
    const source = vscode.Uri.parse(key);
    const maxBytes = readSettings().maxFileSizeKb * 1024;
    let bytes: Uint8Array;
    try {
      const stat = await vscode.workspace.fs.stat(source);
      if (stat.size > maxBytes) return undefined;
      bytes = await vscode.workspace.fs.readFile(source);
    } catch {
      return undefined;
    }
    if (!isRoamableBytes(bytes, maxBytes)) return undefined;
    const uri = toViewUri(source);
    this.docs.set(uri, decodeText(bytes));
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Active,
        preview: false,
        preserveFocus: true,
      });
      this.editors.set(uri.toString(), editor);
      return { id: uri.toString() };
    } catch {
      this.docs.drop(uri);
      return undefined;
    }
  }

  async show(view: RoamView): Promise<boolean> {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(view.id));
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Active,
        preview: false,
        preserveFocus: true,
      });
      this.editors.set(view.id, editor);
      return true;
    } catch {
      return false;
    }
  }

  async reveal(view: RoamView): Promise<void> {
    if (!this.followAllowed()) return;
    try {
      await vscode.commands.executeCommand(
        'revealInExplorer',
        toSourceUri(vscode.Uri.parse(view.id)),
      );
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    } catch {
      return;
    }
  }

  geometry(view: RoamView): Geometry | undefined {
    const editor = this.editors.get(view.id);
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!editor || !active || tabUri(active)?.toString() !== view.id) return undefined;
    const first = editor.visibleRanges[0];
    const last = editor.visibleRanges[editor.visibleRanges.length - 1];
    return {
      top: first ? first.start.line : 0,
      lineCount: editor.document.lineCount,
      visibleLines: first && last ? last.end.line - first.start.line + 1 : FALLBACK_VISIBLE_LINES,
    };
  }

  scrollTo(view: RoamView, line: number): void {
    this.editors
      .get(view.id)
      ?.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
  }

  async close(views: readonly RoamView[]): Promise<void> {
    const ids = new Set(views.map((view) => view.id));
    const tabs = viewTabs().filter((tab) => ids.has(tabUri(tab)?.toString() ?? ''));
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs, true);
    for (const id of ids) {
      this.editors.delete(id);
      this.docs.drop(vscode.Uri.parse(id));
    }
  }

  async closeAll(focusEditor: boolean): Promise<void> {
    this.search?.cancel();
    const tabs = viewTabs();
    this.editors.clear();
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs, !focusEditor);
    this.docs.clear();
  }

  stateChanged(state: RoamState, detail?: string): void {
    this.onState(state, detail);
  }
}

function captureTyping(onType: () => Promise<void>): vscode.Disposable | undefined {
  try {
    return vscode.commands.registerCommand('type', async (args: unknown) => {
      await onType();
      await vscode.commands.executeCommand('default:type', args);
    });
  } catch {
    return undefined;
  }
}

const ICONS: Record<RoamState, string> = {
  off: '$(circle-slash)',
  watching: '$(moon)',
  roaming: '$(star-full)',
};

function describe(state: RoamState, detail: string | undefined, settings: RoamSettings): string {
  const base: Record<RoamState, string> = {
    off: 'Mothlight is off. Click to turn it on.',
    watching: 'Mothlight starts after ' + settings.idleSeconds + 's without activity. Click to turn it off.',
    roaming: 'Mothlight is browsing files. Any input stops it.',
  };
  return detail === 'no-files'
    ? base[state] + ' No browsable files were found in the workspace.'
    : base[state];
}

export interface MothlightApi {
  lastEnd(): string;
}

let controller: RoamController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<MothlightApi> {
  const docs = new ViewDocs();
  const output = vscode.window.createOutputChannel('Mothlight');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
  status.name = 'Mothlight';
  status.command = 'mothlight.toggle';
  let typeCapture: vscode.Disposable | undefined;
  let lastArea: 'editor' | 'terminal' = 'editor';

  const render = (state: RoamState, detail?: string): void => {
    status.text = ICONS[state];
    status.tooltip = describe(state, detail, readSettings());
    status.show();
    if (state === 'roaming') {
      typeCapture ??= captureTyping(async () => {
        roam.noteActivity('editor', 'typing');
        await roam.settled();
      });
    } else {
      typeCapture?.dispose();
      typeCapture = undefined;
    }
    if (detail) output.appendLine(new Date().toISOString() + ' ' + state + ' ' + detail);
  };

  const host = new VscodeHost(docs, render, () => lastArea === 'editor');
  const roam = new RoamController(host);
  controller = roam;

  context.subscriptions.push(
    output,
    status,
    { dispose: () => typeCapture?.dispose() },
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, docs),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (
        event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
        event.kind === vscode.TextEditorSelectionChangeKind.Mouse
      ) {
        lastArea = 'editor';
        roam.noteActivity('editor', 'selection');
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        event.contentChanges.length > 0 &&
        event.document.uri.scheme !== SCHEME &&
        event.document === vscode.window.activeTextEditor?.document
      ) {
        roam.noteActivity('editor', 'edit');
      }
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges(() => {
      if (roam.state !== 'roaming') roam.noteActivity('other', 'visible-ranges');
    }),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) roam.noteActivity('other', 'window-focus');
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => {
      if (roam.state !== 'roaming') roam.noteActivity('other', 'tabs');
    }),
    vscode.window.onDidChangeActiveTerminal(() => {
      lastArea = 'terminal';
      roam.noteActivity('other');
    }),
    vscode.window.onDidOpenTerminal(() => {
      lastArea = 'terminal';
      roam.noteActivity('other');
    }),
    vscode.window.onDidCloseTerminal(() => roam.noteActivity('other')),
    vscode.window.onDidStartTerminalShellExecution(() => {
      lastArea = 'terminal';
      roam.noteActivity('other');
    }),
    vscode.window.onDidEndTerminalShellExecution(() => roam.noteActivity('other')),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) {
        roam.invalidate();
        roam.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => roam.invalidate()),
    vscode.commands.registerCommand('mothlight.toggle', async () => {
      const config = vscode.workspace.getConfiguration(SECTION);
      await config.update('enabled', !config.get('enabled', true), vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('mothlight.startNow', () => roam.startNow()),
    vscode.commands.registerCommand('mothlight.stop', () => roam.stop()),
  );

  await host.closeAll(false);
  roam.start();
  return { lastEnd: () => roam.lastEnd };
}

export function deactivate(): Promise<void> | undefined {
  return controller?.dispose();
}
