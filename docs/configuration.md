# Configuration

All settings live under `mothlight.*` in the VS Code settings.

| Setting | Default | Range | Description |
| --- | --- | --- | --- |
| `mothlight.enabled` | `true` | | Browse files when the editor has been idle. |
| `mothlight.idleSeconds` | `60` | 5 to 3600 | Seconds without activity before roaming starts. |
| `mothlight.hopMinSeconds` | `8` | 2 to 600 | Shortest time spent on one file. |
| `mothlight.hopMaxSeconds` | `25` | 2 to 600 | Longest time spent on one file. Never below the minimum. |
| `mothlight.scrollLinesPerSecond` | `6` | 1 to 60 | Scroll speed in lines per second. |
| `mothlight.maxRoamTabs` | `4` | 1 to 10 | Most roam tabs kept open at once. |
| `mothlight.maxFileSizeKb` | `512` | 1 to 20480 | Larger files are never opened. |
| `mothlight.exclude` | build and vendor folders | | Glob patterns that are never opened. |

Values outside a range are clamped. Non-numeric values fall back to the default.

## Excluding more files

`mothlight.exclude` replaces its default list when you set it, so keep the entries you still want:

```json
{
  "mothlight.exclude": [
    "**/node_modules/**",
    "**/.git/**",
    "**/private/**"
  ]
}
```

Patterns are joined into one glob group, so a single pattern must not contain a comma. Environment files, keys and credentials are skipped regardless of this setting.

## Commands

| Command | Effect |
| --- | --- |
| `Mothlight: Toggle` | Turns `mothlight.enabled` on or off for the user. Also bound to the status bar icon. |
| `Mothlight: Start Now` | Starts roaming immediately, even when disabled. |
| `Mothlight: Stop` | Ends roaming and returns to your editor. |
