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

When the idle period has passed, Mothlight collects candidate files with `workspace.findFiles` (at most 20,000), applies the `mothlight.exclude` globs and its built-in filters, then alternates between a short movement and a long stand-still until you come back:

1. Pick a random file, avoiding the last eight shown. About one time in three goes back to a roam tab that is already open instead.
2. Open it as a read-only copy and jump to a random line anywhere in the file: near the top, in the middle or near the bottom.
3. Scroll from there, up or down at random, at `mothlight.scrollLinesPerSecond` for a random time between `mothlight.moveMinSeconds` and `mothlight.moveMaxSeconds`, or until the top or the bottom of the file, whichever comes first. A file that fits on one screen does not scroll.
4. Stand still for a random time between `mothlight.pauseMinSeconds` and `mothlight.pauseMaxSeconds`. The last file stays on screen and nothing moves.
5. Go back to step 1. At most `mothlight.maxRoamTabs` roam tabs are kept, closing the oldest.

A file that cannot be read, is empty, looks binary or exceeds `mothlight.maxFileSizeKb` is skipped for the rest of the session.

### Following in the Explorer

With `mothlight.followExplorer` on, the default, every file that comes into view is also revealed in the Explorer sidebar. Mothlight calls the built-in `revealInExplorer` command with the real file and then moves keyboard focus back to the editor area. The built-in command always focuses the Explorer tree, where Delete and Enter act on files, so the second step keeps a stray keystroke from landing there.

Things to know:

- The Explorer sidebar is opened when it was hidden or showing another view, and it stays that way after roaming stops.
- Keyboard focus ends in the editor area, on the roam tab. Typing then stops roaming through the `type` command, as usual.
- Mothlight skips the reveal when the last thing you did was in a terminal: opening one, switching to one or running a command. It cannot see a terminal you only clicked into, so turn the setting off if you work that way.

### Resource use

- Watching costs one timer that wakes up at most once per idle period.
- While moving, Mothlight wakes about six times per second at the default speed, and never more than ten. While standing still it wakes once per second, which is also how quickly a scroll or tab switch of yours is noticed. Typing, clicking and selecting stop it immediately.
- The file list is built once and reused for ten minutes, or until the workspace folders or the `mothlight` settings change. A scan that is still running when you come back is cancelled.
- Only one file at a time is read, never above `mothlight.maxFileSizeKb`. At most `mothlight.maxRoamTabs` copies are kept in memory, and all of them are released when roaming stops.
- No network access, no child processes and no workspace files written.

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

Scrolling is detected by reading the top line back on every tick. While moving, a change to a line that is not near one of the last eight lines Mothlight scrolled to (three lines, or one and a half seconds of scrolling, of tolerance) means you scrolled. The tolerance is that wide because VS Code reports the top line several lines ahead of the line Mothlight asked for while scrolling up. While standing still, any change in the top line means you scrolled, after a short settling time. An editor that does not report scrolling, for example because its window is hidden, never counts as activity. The same tick notices when you switch to another tab or close the roam tab, within 100 ms. Tab events are deliberately not used while roaming, because they also fire for Mothlight's own tabs.

### Typing into a copy

Copies are read-only, so a keystroke typed into one would otherwise be lost and VS Code would show a warning. While roaming, Mothlight registers the `type` command, stops roaming, waits for the tabs to close and forwards the keystroke to `default:type`. The first character you type lands in your own editor.

If another extension already owns `type` (for example a modal editing extension), the registration fails quietly. Typing into a copy is then not noticed, while clicks, arrow keys, scrolling and tab changes still are.

## Limits

Mothlight moves things inside VS Code only. It does not generate operating system input, so screen locks, idle timers and presence indicators in other applications are unaffected.
