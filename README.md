# Reactor Module Tools

Tools for creating language learning modules for the Language Reactor platform.

## Workflow

```
PDF Textbook → [pdf-extract] → (combined markdown + optional split markdown + optional images) → [module-convert] → .module file
```

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd reactor-module-tools
npm install

# 2. Get a Gemini API key from https://aistudio.google.com/app/apikey
#    Create .env file:
echo "GEMINI_API_KEY=your-key-here" > .env

# 3. For PDF extraction, install poppler-utils:
#    Ubuntu/Debian: sudo apt-get install poppler-utils
#    macOS: brew install poppler

# 4. Put a PDF into data/ (example: FSI French)
cp /path/to/source.pdf data/fsi-french/source.pdf

# 5. Run extraction (includes splitting into data/<course>/md when configured)
npm run extract:fsi-french

# 6. Optional: generate improved images (if the PDF has illustrations you want)
npm run generate-images:fsi-french

# 7. Convert split markdown → .module files
npm run convert:fsi-french
```

---

## Step 1: PDF to Markdown (`pdf-extract/`)

Extracts clean markdown from PDF textbooks using Gemini AI.

```bash
# Extract markdown from PDF
node pdf-extract/extract-markdown.js configs/fsi-french/pdf-extract.json

# If `splitOutputDir` is set in the config, the script will also write split
# markdown files (using the fixed marker `<<<< SPLIT HERE >>>>`) into data/<course>/md/
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| (positional) | Path to config JSON (required) | (none) |

**Tips:**
- Large PDFs (100+ pages) take time - the script resumes if interrupted
- Check `chunks/` folder for per-section markdown if you need to re-run a section
- Page images are saved in `temp/pages/` for the image generation step
- Split markdown output will **not overwrite** existing files in `splitOutputDir` (safe for manual edits)

---

## Recommended Layout (configs + data)

Keep **configs** and **course data** separate:

- `configs/<course>/`: config files (and `prompt.md` for module-convert)
- `data/<course>/`: inputs/outputs for scripts (PDFs, extracted markdown, generated modules)

Minimal per-course layout:

- `data/<course>/source.pdf` (you provide)
- `data/<course>/pdf-extract/` (generated)
- `data/<course>/md/` (split markdown inputs to module-convert; generated and/or manually curated)
- `data/<course>/module/` (generated `.module` files)

---

## Step 2: Generate Images (Optional)

```bash
node pdf-extract/generate-images.js configs/fsi-french/pdf-extract.json
```

Generates improved 1:1 images from the markdown placeholders. Skip this if the PDF doesn't have illustrations you want to preserve.

---

## Step 3: Markdown to Module (`module-convert/`)

Converts markdown to `.module` format.

```bash
# Using a predefined course config
node module-convert/convert-course.js --config configs/fsi-french/module-convert.json
```

### Setting up a new course

```bash
# 1. Create folders
mkdir -p data/my-course/{md,module,pdf-extract}
mkdir -p configs/my-course

# 2. Copy your markdown files into data/my-course/md/
cp ./somewhere/*.md data/my-course/md/

# 3. Create module-convert config
cat > configs/my-course/module-convert.json << 'EOF'
{
  "courseName": "My Course Name",
  "inputDir": "../../data/my-course/md",
  "outputDir": "../../data/my-course/module",
  "model": "gemini-3-pro-preview",
  "maxTokens": 32000,
  "temperature": 1.0,
  "thinkingBudget": 4096,
  "delayBetweenRequests": 3000
}
EOF

# 4. Create configs/my-course/prompt.md (optional)
# See configs/fsi-french/prompt.md for example

# 5. Run conversion
node module-convert/convert-course.js --config configs/my-course/module-convert.json
```

---

## Troubleshooting

### "GEMINI_API_KEY not set"
```bash
# Make sure .env file exists in repo root with your key:
echo "GEMINI_API_KEY=your-key-here" > .env
```

### "pdftoppm: command not found"
```bash
# Install poppler-utils
sudo apt-get install poppler-utils  # Ubuntu/Debian
brew install poppler                 # macOS
```

### Rate limit errors (429)
The scripts automatically retry with backoff. If persistent:
- Check your Gemini API quota at https://aistudio.google.com/

### Resuming interrupted runs
Both tools skip already-processed files:
- `extract-markdown.js` skips chunks with existing `.md` files
- `generate-images.js` skips images that exist on disk
- `convert-course.js` skips inputs with existing `.module` files

Just re-run the same command to resume.

---

## Project Structure

```
reactor-module-tools/
├── .env                          # Your API key (create this)
├── configs/                      # Per-course configs (no generated outputs)
├── data/                         # Per-course inputs/outputs (gitignored except .gitkeep)
├── lib/                          # Shared utilities
├── pdf-extract/                  # Step 1: PDF → Markdown
│   ├── extract-markdown.js
│   └── generate-images.js
└── module-convert/               # Step 2: Markdown → .module
    ├── convert-course.js
    └── shared/
        ├── module_format.md      # Format specification
        └── module_format.ebnf    # Formal grammar
```

## License

TBD
