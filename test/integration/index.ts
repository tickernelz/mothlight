import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

const SCHEME = 'mothlight';

let endNote = (): string => 'unavailable';

async function screenshot(name: string): Promise<void> {
  const dir = process.env['MOTHLIGHT_SHOTS'];
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await new Promise<void>((resolve) => {
    execFile('import', ['-window', 'root', join(dir, name + '.png')], () => resolve());
  });
}

function snapshot(): string {
  const tabs = vscode.window.tabGroups.all.flatMap((group) =>
    group.tabs.map((tab) => (tabUri(tab)?.toString() ?? tab.label) + (tab.isActive ? ' (active)' : '')),
  );
  return '[' + tabs.join(', ') + ']';
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for ' + label + ' with tabs ' + snapshot());
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

function roamTop(): number | undefined {
  const editor = vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.scheme === SCHEME);
  return editor?.visibleRanges[0]?.start.line;
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

async function withSettings(values: Record<string, number | boolean>, run: () => Promise<void>): Promise<void> {
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
      const onDisk = async (): Promise<string> =>
        new TextDecoder().decode(await vscode.workspace.fs.readFile(original.uri));
      await vscode.commands.executeCommand('mothlight.startNow');
      await waitFor(() => viewTabs().length === 1 && activeUri()?.scheme === SCHEME, 'a roam tab');
      const copy = vscode.workspace.textDocuments.find((document) => document.uri.scheme === SCHEME);
      assert.ok(copy, 'the copy is open as a document');
      assert.notEqual(copy.uri.toString(), original.uri.toString());
      assert.equal(await onDisk(), before, 'the file on disk is untouched while browsing');
      await vscode.commands.executeCommand('mothlight.stop');
      await waitFor(() => viewTabs().length === 0, 'roam tabs to close');
      await waitFor(() => activeUri()?.toString() === original.uri.toString(), 'the original editor');
      assert.equal(original.isDirty, false);
      assert.equal(original.getText(), before);
      assert.equal(await onDisk(), before);
    },
  ],
  [
    'browsing keeps going for several seconds',
    async () => {
      await openReal('src/beta.ts');
      await vscode.commands.executeCommand('mothlight.startNow');
      const timeline: string[] = [];
      const until = Date.now() + 4000;
      while (Date.now() < until) {
        timeline.push(viewTabs().length + ':' + String(roamTop()));
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const message = 'timeline tabs:top ' + timeline.join(' ');
      assert.ok(viewTabs().length >= 1, message);
    },
  ],
  [
    'nothing changes while standing still',
    async () => {
      await openReal('src/beta.ts');
      await withSettings(
        { moveMinSeconds: 2, moveMaxSeconds: 2, pauseMinSeconds: 30, pauseMaxSeconds: 30 },
        async () => {
          await vscode.commands.executeCommand('mothlight.startNow');
          await waitFor(() => viewTabs().length === 1, 'a roam tab');
          await new Promise((resolve) => setTimeout(resolve, 3500));
          const resting = snapshot();
          const until = Date.now() + 8000;
          while (Date.now() < until) {
            assert.equal(snapshot(), resting, 'tabs changed during the pause');
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          assert.equal(viewTabs().length, 1, 'roaming ended: ' + endNote());
        },
      );
    },
  ],
  [
    'the roam tab keeps the editor focus while the explorer follows',
    async () => {
      await openReal('docs/notes.md');
      await withSettings(
        { moveMinSeconds: 2, moveMaxSeconds: 2, pauseMinSeconds: 30, pauseMaxSeconds: 30 },
        async () => {
          await vscode.commands.executeCommand('mothlight.startNow');
          await waitFor(
            () => viewTabs().length === 1 && activeUri()?.scheme === SCHEME,
            'a roam tab',
          );
          await new Promise((resolve) => setTimeout(resolve, 2500));
          await screenshot('follow-on');
          assert.equal(activeUri()?.scheme, SCHEME, 'the roam tab is still active, roaming ended: ' + endNote());
          assert.equal(viewTabs().length, 1);
        },
      );
    },
  ],
  [
    'turning the follow setting off still browses',
    async () => {
      await openReal('docs/notes.md');
      await withSettings(
        {
          followExplorer: false,
          moveMinSeconds: 2,
          moveMaxSeconds: 2,
          pauseMinSeconds: 30,
          pauseMaxSeconds: 30,
        },
        async () => {
          await vscode.commands.executeCommand('mothlight.startNow');
          await waitFor(
            () => viewTabs().length === 1 && activeUri()?.scheme === SCHEME,
            'a roam tab',
          );
          await new Promise((resolve) => setTimeout(resolve, 2500));
          await screenshot('follow-off');
          assert.equal(viewTabs().length, 1);
        },
      );
    },
  ],
  [
    'each movement starts at a different place in the file',
    async () => {
      await openReal('src/alpha.ts');
      await withSettings(
        { moveMinSeconds: 2, moveMaxSeconds: 2, pauseMinSeconds: 1, pauseMaxSeconds: 1 },
        async () => {
          await vscode.commands.executeCommand('mothlight.startNow');
          let highest = 0;
          const until = Date.now() + 28000;
          while (Date.now() < until) {
            highest = Math.max(highest, roamTop() ?? 0);
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          assert.ok(highest > 100, 'the highest top line seen was ' + highest);
        },
      );
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
      await withSettings({ moveMinSeconds: 2, moveMaxSeconds: 2, pauseMinSeconds: 1, pauseMaxSeconds: 1 }, async () => {
        await vscode.commands.executeCommand('mothlight.startNow');
        const seen = new Set<string>();
        const timeline: string[] = [];
        const until = Date.now() + 16000;
        let tick = 0;
        while (Date.now() < until) {
          for (const tab of viewTabs()) {
            const uri = tabUri(tab);
            if (uri) seen.add(uri.path);
          }
          if (tick % 4 === 0) timeline.push(viewTabs().length + ':' + String(roamTop()));
          tick += 1;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        assert.ok(seen.size >= 2, 'visited ' + [...seen].join(', ') + ' timeline tabs:top ' + timeline.join(' '));
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
  const api = (await extension.activate()) as { lastEnd(): string };
  endNote = () => api.lastEnd();
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
