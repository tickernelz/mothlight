# AGENTS.md

## Project

Mothlight is a VS Code extension written in TypeScript. While the editor is idle it shows read-only copies of workspace files, scrolls them and switches tabs, and it stops on the first activity.

## Layout

- `src/controller.ts`: state machine, no `vscode` imports.
- `src/settings.ts`, `src/files.ts`: pure helpers.
- `src/extension.ts`: VS Code glue.
- `test/unit`: fast tests with a fake host and clock.
- `test/integration`: tests inside a real VS Code.

## Commands

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run build`
- `npm run package`
- `npm run test:integration` runs only in GitHub Actions.

## Rules

- Documentation: all repository documentation, including the README, is written in English and lives in `docs/`. `README.md` stays a short summary with the banner. UI strings, chat and task comments are not documentation.
- No code comments. Express intent through names and structure.
- Keep `src/controller.ts` free of `vscode` imports so it stays unit-testable.
- Never open or show a real file as an editable document while roaming. Copies stay read-only.
- Never weaken the always-skipped sensitive file rules in `src/files.ts`.
- Heavy suites, such as the integration tests that launch VS Code, run in GitHub Actions and not on a developer PC.
- Commits use Conventional Commits in the form `type(scope): subject`, imperative and under 72 characters. Use the git identity that is already configured; do not override author or committer and do not add Co-Authored-By trailers.
- One pull request per feature.
