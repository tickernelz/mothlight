# How it works

## States

Mothlight is always in one of three states, shown by the status bar icon.

| State | Icon | Meaning |
| --- | --- | --- |
| off | circle-slash | Disabled by the setting. Nothing runs. |
| watching | moon | Waiting for the idle period to pass. |
| roaming | star | Browsing files. Any activity ends it. |

## Detecting activity

While watching, every activity signal only writes a timestamp. A single timer wakes up when the idle period could have elapsed, re-checks the timestamp and either starts roaming or sleeps again for the remainder. There is no polling.

Signals that count as activity:

- keyboard or mouse selection changes in any editor
- edits to the active document
- scrolling an editor
- the window gaining focus
- any tab opening, closing or becoming active
- terminal opening, closing, switching, and shell command start and end

VS Code does not report typing inside the integrated terminal that does not run a command, or activity in other applications. Mothlight can therefore start while you type in the terminal. It never takes focus when it does: tabs open with `preserveFocus`.

## Roaming

When the idle period has passed, Mothlight collects candidate files with `workspace.findFiles` (at most 20,000), applies the `mothlight.exclude` globs and its built-in filters, then repeats this loop:

1. Pick a random file, avoiding the last eight shown. About one hop in three goes back to a roam tab that is already open instead.
2. Open it as a read-only copy and scroll to the top.
3. Scroll down at `mothlight.scrollLinesPerSecond` in 100 ms ticks, accumulating fractional lines.
4. After a random time between `mothlight.hopMinSeconds` and `mothlight.hopMaxSeconds`, or two seconds after the end of the file, hop to the next file.
5. Keep at most `mothlight.maxRoamTabs` roam tabs, closing the oldest.

A file that cannot be read, is empty, looks binary or exceeds `mothlight.maxFileSizeKb` is skipped for the rest of the session.

### Read-only copies

Copies are served by a `TextDocumentContentProvider` under the `mothlight` URI scheme. The real file is read once, never written, and never opened as an editable document. Syntax highlighting follows the file extension of the original.

### Never shown

Always skipped, whatever the settings say:

- `.env` files, `.npmrc`, `.netrc`, `.git-credentials`, SSH keys and `known_hosts`
- `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `.kdbx`, `.gpg`, `.asc`
- anything under `.ssh`, `.aws`, `.gnupg`, `.kube` or a `secrets` folder
- file names containing secret, credential, password, passwd, token or private key
- binary extensions, lock files and minified files

## Stopping

Any activity signal ends roaming. Mothlight then closes every roam tab, and VS Code activates the tab you were on. The signal decides focus:

- keyboard, mouse, selection and scroll activity in an editor return focus to the editor
- window, terminal and tab activity leave focus where it is

Scrolling is detected by reading the top line back on every tick and comparing it with the line Mothlight asked for. A difference larger than two lines (or 40% of the scroll speed) means you scrolled. The same tick notices when you switch to another tab or close the roam tab, within 100 ms. Tab events are deliberately not used while roaming, because they also fire for Mothlight's own tabs.

### Typing into a copy

Copies are read-only, so a keystroke typed into one would otherwise be lost and VS Code would show a warning. While roaming, Mothlight registers the `type` command, stops roaming, waits for the tabs to close and forwards the keystroke to `default:type`. The first character you type lands in your own editor.

If another extension already owns `type` (for example a modal editing extension), the registration fails quietly. Typing into a copy is then not noticed, while clicks, arrow keys, scrolling and tab changes still are.

## Limits

Mothlight moves things inside VS Code only. It does not generate operating system input, so screen locks, idle timers and presence indicators in other applications are unaffected.
