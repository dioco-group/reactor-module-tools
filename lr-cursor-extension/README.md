# LR Course Editor

A Cursor/VS Code extension for editing, previewing, and managing [Language Reactor](https://www.languagereactor.com) courses.

## Features

- **`.module` file support** — syntax highlighting, real-time diagnostics, and document outline
- **Live preview** — rendered HTML preview of `.module` files as you type
- **Course management sidebar** — browse, download, upload, fork, and create courses directly from the editor
- **Gitea integration** — syncs with the course repository at courses.languagereactor.com
- **Permission-aware** — automatically shows the right actions based on your access level (edit, fork, PR)

## Install

1. Download the latest `.vsix` from the [Releases page](https://github.com/dioco-group/lr-cursor-extension/releases/latest)
2. Install it:
   ```
   cursor --install-extension lr-course-editor.vsix
   ```
   Or in Cursor: `Ctrl+Shift+P` → "Extensions: Install from VSIX..." → select the file.
3. The **LR Courses** icon appears in the sidebar. Click it and sign in.

The extension checks for updates automatically and will notify you when a new version is available.

## Getting started

1. **Sign in** — click the LR Courses sidebar icon, then sign in with your courses.languagereactor.com credentials
2. **Download a course** — find it in the sidebar and click the download button
3. **Edit** — open any `.module` file; the preview panel opens automatically
4. **Upload** — when you're done editing, click Upload in the sidebar to push your changes

### Contributing to a course you don't own

1. Right-click the course → **Fork Course**
2. Download and edit your fork
3. Click **Upload Changes**, then accept the prompt to **Create a Pull Request**

## Development

```bash
git clone https://github.com/dioco-group/lr-cursor-extension.git
cd lr-cursor-extension
npm install
npm run compile
```

Press `F5` in Cursor to launch the extension in a development host window.

## Releasing a new version

1. Bump the version in `package.json`
2. Commit and tag:
   ```bash
   git add -A && git commit -m "Bump to vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```
3. GitHub Actions builds the `.vsix` and creates a release automatically
4. Users with the extension installed will be notified of the update on next launch
