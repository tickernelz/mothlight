import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

function source(name: string, lines: number): string {
  return Array.from({ length: lines }, (_, index) => 'export const ' + name + index + ' = ' + index + ';').join('\n') + '\n';
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'mothlight-workspace-'));
  const files: Record<string, string | Uint8Array> = {
    'src/alpha.ts': source('alpha', 160),
    'src/beta.ts': source('beta', 160),
    'src/gamma.ts': source('gamma', 160),
    'docs/notes.md': Array.from({ length: 120 }, (_, index) => 'line ' + index).join('\n') + '\n',
    '.env': 'EXAMPLE=value\n',
    'vendor/lib.js': source('vendor', 80),
    'assets/pixel.png': new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]),
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '../..');
  const workspace = await createWorkspace();
  const profile = await mkdtemp(path.join(tmpdir(), 'mothlight-profile-'));
  await runTests({
    version: process.env['VSCODE_TEST_VERSION'] ?? 'stable',
    extensionDevelopmentPath: root,
    extensionTestsPath: path.resolve(__dirname, 'index.js'),
    launchArgs: [
      workspace,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--user-data-dir=' + path.join(profile, 'data'),
      '--extensions-dir=' + path.join(profile, 'extensions'),
    ],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
