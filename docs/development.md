# Development

## Requirements

- Node.js 22.18 or newer. The unit tests run TypeScript directly through Node's type stripping.
- VS Code 1.93 or newer.

## Layout

| Path | Purpose |
| --- | --- |
| `src/controller.ts` | State machine for watching and roaming. Imports nothing from `vscode`. |
| `src/settings.ts` | Setting defaults and clamping. |
| `src/files.ts` | Rules for which files and bytes may be shown. |
| `src/extension.ts` | VS Code glue: host implementation, events, status bar, commands. |
| `test/unit` | Unit tests with a fake host and a fake clock. |
| `test/integration` | Tests that run inside a real VS Code. |

The controller talks to a small `RoamHost` interface and an injectable `Clock`, which is why the whole timing behaviour is covered by fast unit tests.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run lint` | ESLint with type-aware rules. |
| `npm run typecheck` | TypeScript without emitting. |
| `npm run test:unit` | Unit tests. |
| `npm run build` | Bundles the extension into `out/extension.js`. |
| `npm run test:integration` | Builds, downloads VS Code and runs the integration tests. |
| `npm run package` | Builds and produces the `.vsix`. |

## Integration tests

The integration tests launch a real VS Code against a generated workspace and a throwaway profile. They need a display, so run them under `xvfb-run -a` on a headless machine. GitHub Actions runs them on every push and pull request; there is no need to run them on a developer machine.

## Installing a local build

```sh
npm run package
code --install-extension mothlight-0.1.0.vsix --force
```

Reload the window afterwards.

## Continuous integration

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, integration tests and packaging, then uploads the `.vsix` as an artifact.
