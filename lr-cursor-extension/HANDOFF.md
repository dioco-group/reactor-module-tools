# LR Cursor Extension - Development Handoff

## Context

This is the Cursor extension for the Language Reactor course contribution system. It provides:
- `.module` file preview, syntax highlighting, diagnostics, and outline view
- Course management sidebar (browse, download, upload, fork courses from Gitea)
- Authentication with standalone Gitea at courses.languagereactor.com

The overall system design is in `@dioco-base/docs/new-course-system.md`.
The remaining task list is in `@dioco-base/docs/gitea-todo.md`.

## Current state

All source `.ts` files have been recreated. The extension compiles cleanly.

### Source files (in src/):
- `src/parser/lang.ts` -- language code type
- `src/parser/types.ts` -- Module, Activity, DialogueLine, etc.
- `src/parser/ebnfSpec.ts` -- EBNF-derived field/marker lists
- `src/parser/moduleParser.ts` -- .module text parser (from reactor-module-tools)
- `src/parser/diagnostics.ts` -- EBNF-based linter (from reactor-module-tools)
- `src/config.ts` -- Gitea auth (standalone, not LR-brokered)
- `src/giteaClient.ts` -- Gitea API client with `canPush` permission field, org repos, single repo fetch
- `src/gitOps.ts` -- local git operations with "no workspace switching" model, local status checking
- `src/outlineProvider.ts` -- document symbol provider for Outline panel
- `src/previewPanel.ts` -- webview preview panel with styled HTML rendering
- `src/sidebarProvider.ts` -- TreeView sidebar with local copy model (NEW)
- `src/extension.ts` -- main entry point wiring everything together (NEW)

### Configuration files:
- `package.json` -- full extension manifest with all commands, language registration, menus
- `language-configuration.json` -- .module language config (comments, folding)
- `syntaxes/module.tmLanguage.json` -- TextMate grammar for syntax highlighting
- `media/icon.svg` -- sidebar icon
- `samples/sample.module` -- example course file
- `samples/.cursorrules` -- AI editing rules for course repos

## Sidebar UX (implemented)

### Mental model: "Local copies"
- `~/lr-courses/` is the local workspace. Teacher opens it once in Cursor.
- Each course is a subfolder.
- The sidebar shows remote and local state clearly.

### Status per course:
- Remote only (not downloaded) → [Download] inline button
- Up to date → [Open] inline button
- Modified / unpushed changes → [Upload] inline button (if canPush)
- Remote has newer version → [Update] inline button
- Conflict (local changes + remote ahead) → [Update] button + warning

### Permission-aware actions:
Checks `permissions.push` from Gitea API response for each repo:
- Can push → show Upload
- Can't push → show Fork (in context menu)
- After upload to a fork → prompt "Create Pull Request?" → opens Gitea PR page in browser

### Context values for menu when-clauses:
Pattern: `course_{local|remote}_{status}_{push|readonly}[_fork]`
Examples: `course_remote_remote_push`, `course_local_dirty_push_fork`, `course_local_clean_readonly`

### Tree sections:
1. **My Courses** -- user's own repos + forks
2. **LanguageReactor** -- official org courses (only shown if any exist)
3. **Community** -- other users' courses not in the org

### Key behaviors:
- "Open" reveals folder in VS Code file explorer (adds ~/lr-courses/ to workspace if needed)
- Never silently pulls or pushes
- Clear notification after every action
- Conflict handling: shows "Update first, then upload" warning
- `git fetch` runs on refresh to detect remote-ahead status

## User flows supported:

1. **Direct edit** (Elena, Maintainer): Download → Edit → Upload
2. **Suggest fix** (contributor): Fork → Download → Edit → Upload → Create PR
3. **Own course** (author): Create Course → Edit → Upload
4. **Collaborator edit**: Download → Edit → Upload (has push access via Gitea collaborator)
5. **Dev branch preview** (later): branch switching in sidebar

## Extension features:

### Working:
- Preview panel with styled HTML rendering of .module files
- EBNF diagnostics as VS Code errors/warnings
- Outline view (lesson/activity structure)
- Syntax highlighting (TextMate grammar)
- Status bar showing auth state
- Auto-open preview when .module file opened
- Sidebar with local copy model
- Permission-aware Fork vs Upload
- Post-upload PR prompt for forks
- "Open on Gitea" command

### Still TODO (from gitea-todo.md):
- Snippets -- type `$dia` + tab → dialogue template, `$ex` → exercise, `$gram` → grammar
- Gitea notifications -- badge when there are new PRs on your repos
- PR creation via API (without leaving Cursor)
- Branch switching UI in sidebar (for dev branch preview workflow)
- Course template scaffolding -- "Create New Course" clones a template repo

## Related repos and files:
- dioco-base: `/home/j/projects/alc_proto/dioco-base/`
  - `src/modules/giteaCourses.ts` -- server-side Gitea course discovery
  - `src/modules/lc.ts` -- course loading (Gitea primary)
  - `docs/new-course-system.md` -- system design
  - `docs/gitea-todo.md` -- full task list
- reactor-module-tools: `/home/j/projects/reactor-module-tools/`
  - `module-preview/src/lc_parser.ts` -- original parser
  - `module-preview/src/diagnostics.ts` -- original diagnostics
  - `module-convert/shared/module_format.md` -- format spec
- Gitea instance: https://courses.languagereactor.com
  - LanguageReactor org with Editors/Maintainers teams
  - lr-server account for server API access
