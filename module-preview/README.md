## Module Preview (lc_parser-based)

This is a lightweight reviewer for `.module` conversion output. It renders the parsed **Module → Lessons → Activities → Cards** structure using the `lc_parser` logic copied from `dioco-base`.

### Build

From repo root:

```bash
cd /home/j/projects/reactor-module-tools
npm run preview:build
```

Output is written to:

- `module-preview/dist/index.html`

### Use

- Open `module-preview/dist/index.html` in your browser
- Drag & drop a `.module` file (or use “Select .module…”)

Notes:
- The **Load demo** button works even when opened via `file://` (it falls back to an embedded demo).


