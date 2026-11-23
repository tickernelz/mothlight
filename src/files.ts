const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svgz', 'pdf', 'zip', 'gz', 'tgz', 'tar', '7z', 'rar',
  'jar', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi', 'wasm', 'so', 'dll', 'dylib',
  'exe', 'bin', 'class', 'o', 'a', 'pyc', 'sqlite', 'db', 'map',
]);

const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock)$/i;
const SENSITIVE_NAME = /(^|\/)(\.env(\..*)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|authorized_keys|known_hosts)$/i;
const SENSITIVE_EXTENSION = /\.(pem|key|p12|pfx|jks|keystore|kdbx|gpg|asc)$/i;
const SENSITIVE_SEGMENT = /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube|secrets?)(\/|$)/i;
const SENSITIVE_WORD = /(secret|credential|password|passwd|token|private[-_]?key)/i;
const SNIFF_BYTES = 8000;

export function isRoamablePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (BINARY_EXTENSIONS.has(extension)) return false;
  if (LOCKFILE.test(normalized)) return false;
  if (/\.min\./i.test(name)) return false;
  if (SENSITIVE_NAME.test(normalized)) return false;
  if (SENSITIVE_EXTENSION.test(name)) return false;
  if (SENSITIVE_SEGMENT.test(normalized)) return false;
  if (SENSITIVE_WORD.test(name)) return false;
  return true;
}

export function isRoamableBytes(bytes: Uint8Array, maxBytes: number): boolean {
  if (bytes.length === 0 || bytes.length > maxBytes) return false;
  return !bytes.subarray(0, SNIFF_BYTES).includes(0);
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
