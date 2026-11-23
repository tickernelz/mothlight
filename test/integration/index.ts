import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const SCHEME = 'mothlight';

async function waitFor(check: () => boolean, label: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for ' + label);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
  return tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined;
}

function viewTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tabUri(tab)?.scheme === SCHEME);
}

function activeUri(): vscode.Uri | undefined {
  const active = vscode.window.tabGroups.activeTabGroup.activeTab;
  return active ? tabUri(active) : undefined;
}

async function openReal(relative: string): Promise<vscode.TextDocument> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('the test workspace is not open');
  const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, relative));
  await vscode.window.showTextDocument(document);
  return document;
}

async function reset(): Promise<void> {
  await vscode.commands.executeCommand('mothlight.stop');
  await waitFor(() => viewTabs().length === 0, 'roam tabs to close');
  for (const document of vscode.workspace.textDocuments.filter((candidate) => candidate.isDirty)) {
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.files.revert');
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

async function withSettings(values: Record<string, number>, run: () => Promise<void>): Promise<void> {
  const config = vscode.workspace.getConfiguration('mothlight');
  for (const [key, value] of Object.entries(values)) {
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
  try {
    await run();
  } finally {
    for (const key of Object.keys(values)) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    }
  }
}

const tests: [string, () => Promise<void>][] = [
  [
    'start now shows a read-only copy and stop restores the original editor',
    async () => {
      const original = await openReal('src/alpha.ts');
      const before = original.getText();
      await vscode.commands.executeCommand('mothlight.startNow');
      await waitFor(() => viewTabs().length === 1 && activeUri()?.scheme === SCHEME, 'a roam tab');
      const copy = vscode.workspace.textDocuments.find((document) => document.uri.scheme === SCHEME);
      assert.ok(copy, 'the copy is open as a document');
      const edit = new vscode.WorkspaceEdit();
      edit.insert(copy.uri, new vscode.Position(0, 0), 'x');
      let applied = false;
      try {
        applied = await vscode.workspace.applyEdit(edit);
      } catch {
        applied = false;
      }
      assert.equal(applied, false, 'the copy rejects edits');
      await vscode.commands.executeCommand('mothlight.stop');
      await waitFor(() => viewTabs().length === 0, 'roam tabs to close');
      await waitFor(() => activeUri()?.toString() === original.uri.toString(), 'the original editor');
      assert.equal(original.isDirty, false);
      assert.equal(original.getText(), before);
    },
  ],
  [
    'typing while browsing hands control back',
    async () => {
      await openReal('src/beta.ts');
      await vscode.commands.executeCommand('mothlight.startNow');
      await waitFor(() => viewTabs().length === 1, 'a roam tab');
      await vscode.commands.executeCommand('type', { text: 'z' });
      await waitFor(() => viewTabs().length === 0, 'roam tabs to close');
    },
  ],
  [
    'roaming starts on its own after the idle period',
    async () => {
      await openReal('src/gamma.ts');
      await withSettings({ idleSeconds: 5 }, async () => {
        await waitFor(() => viewTabs().length >= 1, 'automatic roaming', 20000);
      });
    },
  ],
  [
    'excluded files are never opened and several files are visited',
    async () => {
      await openReal('src/alpha.ts');
      await withSettings({ hopMinSeconds: 2, hopMaxSeconds: 2 }, async () => {
        await vscode.commands.executeCommand('mothlight.startNow');
        const seen = new Set<string>();
        const until = Date.now() + 16000;
        while (Date.now() < until) {
          for (const tab of viewTabs()) {
            const uri = tabUri(tab);
            if (uri) seen.add(uri.path);
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        assert.ok(seen.size >= 2, 'visited ' + [...seen].join(', '));
        for (const path of seen) {
          assert.ok(!path.includes('/vendor/'), path);
          assert.ok(!path.endsWith('.env'), path);
          assert.ok(!path.endsWith('.png'), path);
        }
      });
    },
  ],
];

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('tickernelz.mothlight');
  assert.ok(extension, 'the extension is installed in the test host');
  await extension.activate();
  const failures: string[] = [];
  for (const [name, test] of tests) {
    try {
      await test();
      console.log('PASS ' + name);
    } catch (error) {
      failures.push(name + ': ' + String(error));
      console.log('FAIL ' + name + ': ' + String(error));
    } finally {
      await reset().catch(() => undefined);
    }
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
}
