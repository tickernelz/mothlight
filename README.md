<p align="center">
  <picture>
    <source srcset="assets/banner.svg" type="image/svg+xml">
    <img src="assets/banner.png" alt="Mothlight" width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/tickernelz/mothlight/actions/workflows/ci.yml"><img src="https://github.com/tickernelz/mothlight/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.93-1d1b4b" alt="VS Code ^1.93">
  <img src="https://img.shields.io/badge/license-MIT-fde68a" alt="MIT license">
</p>

Mothlight keeps a quiet editor gently moving. After a minute without activity it drifts through read-only copies of your workspace files, scrolling and switching tabs. The first thing you do brings you back exactly where you were.

## Highlights

- **Your files stay untouched.** Every file is shown as a read-only copy, so nothing can be edited or saved by accident.
- **Gets out of the way.** Typing, clicking, scrolling, switching tabs or focusing the window ends the drift and restores your editor.
- **Careful about what it shows.** Environment files, keys and credentials are never opened, and neither are binaries, lock files or very large files.
- **Light.** One timer while watching and no polling. No network access, no telemetry, no child processes.

## Install

Build the package and install it:

```sh
npm ci
npm run package
code --install-extension mothlight-0.1.0.vsix
```

CI also uploads the packaged `.vsix` as a build artifact on every run.

## Use

A moon in the status bar shows that Mothlight is watching. Click it to turn Mothlight off and on. The command palette offers `Mothlight: Toggle`, `Mothlight: Start Now` and `Mothlight: Stop`.

## Documentation

- [How it works](docs/how-it-works.md)
- [Configuration](docs/configuration.md)
- [Development](docs/development.md)

## License

[MIT](LICENSE)
