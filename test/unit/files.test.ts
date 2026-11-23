import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeText, isRoamableBytes, isRoamablePath } from '../../src/files.ts';

test('ordinary source and text files are roamable', () => {
  for (const path of ['src/app.ts', '/home/user/project/README.md', 'Makefile', '.gitignore', 'docs/notes.txt']) {
    assert.equal(isRoamablePath(path), true, path);
  }
});

test('binary, minified and lock files are skipped', () => {
  for (const path of ['assets/Logo.PNG', 'dist/app.min.js', 'package-lock.json', 'a/b/yarn.lock', 'lib/native.so']) {
    assert.equal(isRoamablePath(path), false, path);
  }
});

test('environment files, keys and credentials are never roamable', () => {
  const sensitive = [
    '.env',
    'config/.env.production',
    'deploy/id_rsa',
    'deploy/id_ed25519.pub',
    'certs/server.pem',
    'certs/tls.key',
    'src/secrets/settings.ts',
    'home/.ssh/config',
    'src/authToken.ts',
    'ops/Credentials.yaml',
    'C:\\proj\\.aws\\config',
    '.npmrc',
  ];
  for (const path of sensitive) {
    assert.equal(isRoamablePath(path), false, path);
  }
});

test('content checks reject empty, oversized and binary data', () => {
  const text = new TextEncoder().encode('const a = 1;\n');
  assert.equal(isRoamableBytes(text, 1024), true);
  assert.equal(isRoamableBytes(new Uint8Array(0), 1024), false);
  assert.equal(isRoamableBytes(text, 4), false);
  assert.equal(isRoamableBytes(new Uint8Array([104, 105, 0, 106]), 1024), false);
});

test('decodeText reads utf-8 and drops a byte order mark', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69, 0xc3, 0xa9]);
  assert.equal(decodeText(bytes), 'hié');
});
