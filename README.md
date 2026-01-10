# Reactor Module Tools

Tools for creating language learning modules for the Language Reactor platform.

## Workflow

```
PDF Textbook → [pdf-extract] → Markdown + Images → [module-convert] → .module file
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

# 4. Run!
node pdf-extract/extract-markdown.js --input ./my-textbook.pdf --output ./extracted
```

---

## Step 1: PDF to Markdown (`pdf-extract/`)

Extracts clean markdown and images from PDF textbooks using Gemini AI.

```bash
# Extract markdown from PDF
node pdf-extract/extract-markdown.js --input /path/to/textbook.pdf --output ./extracted

# The script will print the next command to run:
# → node pdf-extract/generate-images.js --input ./extracted/textbook
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--input` | Path to PDF file | (required) |
| `--output` | Output directory | `./output` |

**Tips:**
- Large PDFs (100+ pages) take time - the script resumes if interrupted
- Check `chunks/` folder for per-section markdown if you need to re-run a section
- Page images are saved in `temp/pages/` for the image generation step

---

## Step 2: Generate Images (Optional)

```bash
node pdf-extract/generate-images.js --input ./extracted/textbook
```

Generates improved 1:1 images from the markdown placeholders. Skip this if the PDF doesn't have illustrations you want to preserve.

---

## Step 3: Markdown to Module (`module-convert/`)

Converts markdown to `.module` format.

```bash
# Using a predefined course config
node module-convert/convert-course.cjs --config courses/fsi-french/config.json
```

### Setting up a new course

```bash
# 1. Create course folder
mkdir -p module-convert/courses/my-course/input

# 2. Copy your markdown files
cp ./extracted/textbook/*.md module-convert/courses/my-course/input/

# 3. Create config.json
cat > module-convert/courses/my-course/config.json << 'EOF'
{
  "courseName": "My Course Name",
  "inputDir": "./input",
  "outputDir": "./output",
  "model": "gemini-2.5-pro",
  "maxTokens": 32000,
  "temperature": 0.3,
  "delayBetweenRequests": 3000
}
EOF

# 4. Create prompt.md with course-specific instructions (optional)
# See courses/fsi-french/prompt.md for example

# 5. Run conversion
node module-convert/convert-course.cjs --config courses/my-course/config.json
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
- Increase `delayBetweenRequests` in config
- Check your Gemini API quota at https://aistudio.google.com/

### Resuming interrupted runs
Both tools skip already-processed files:
- `extract-markdown.js` skips chunks with existing `.md` files
- `generate-images.js` skips images that exist on disk
- `convert-course.cjs` skips inputs with existing `.module` files

Just re-run the same command to resume.

---

## Project Structure

```
reactor-module-tools/
├── .env                          # Your API key (create this)
├── lib/                          # Shared utilities
├── pdf-extract/                  # Step 1: PDF → Markdown
│   ├── extract-markdown.js
│   └── generate-images.js
└── module-convert/               # Step 2: Markdown → .module
    ├── convert-course.cjs
    ├── courses/                  # Your course configs go here
    └── shared/
        ├── module_format.md      # Format specification
        └── module_format.ebnf    # Formal grammar
```

## License

TBD
