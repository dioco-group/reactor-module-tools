# PDF Extraction Pipeline

Two-stage pipeline for extracting markdown and improved images from PDF textbooks.

## Overview

```
PDF → [extract-markdown.js] → Markdown + Page PNGs → [generate-images.js] → Improved 1:1 Images
```

## Stage 1: Markdown Extraction

```bash
node pdf-extract/extract-markdown.js --input /path/to/textbook.pdf --output ./output
```

**Options:**
- `--input` - Path to input PDF file (required)
- `--output` - Output directory (default: `./output`)

**What it does:**
1. Converts all PDF pages to PNG (300 DPI) for later use
2. Splits PDF into 20-page chunks
3. Sends each chunk to Gemini for OCR
4. Outputs markdown with image placeholders (detailed descriptions)

**Output:**
```
output/{pdfName}/
├── {pdfName}_complete.md      # Final markdown
├── chunks/                    # Per-chunk markdown (for resume)
│   ├── chunk_001-020.md
│   └── chunk_021-040.md
└── temp/pages/                # PDF pages as PNG
    ├── page_001.png
    └── page_002.png
```

**Image markers in markdown:**
```markdown
![A man points at a pencil](images/page_005_001.png)
```

**Resume:** Skips chunks that already have `.md` files.

## Stage 2: Image Generation

```bash
node pdf-extract/generate-images.js --input ./output/textbook
```

**Options:**
- `--input` - Path to extracted output directory from Stage 1 (required)

**What it does:**
1. Parses markdown for `![...](images/page_XXX_YYY.png)` references
2. For each image, loads the target page PNG + up to 2 neighboring pages with images (for style context)
3. Sends to Gemini to generate faithful 1:1 reproduction with improved quality
4. Saves generated images

**Output:**
```
output/{pdfName}/
└── images/
    ├── page_005_001.png
    ├── page_005_002.png
    └── ...
```

**Resume:** Skips images that already exist on disk.

## Environment

Set your Gemini API key:
```bash
export GEMINI_API_KEY="your-key-here"
```

Or add to `.env` file in the repo root.

## Requirements

- Node.js 18+
- `poppler-utils` installed (for `pdftoppm` command)
  ```bash
  # Ubuntu/Debian
  sudo apt-get install poppler-utils
  
  # macOS
  brew install poppler
  ```

## Research Notes

Design decisions based on research on optimal Gemini usage:

1. **PDF → PNG conversion** yields dramatically better OCR vs direct PDF
2. **20 pages per chunk** balances quality and efficiency (50+ degrades)
3. **Style context pages** - send target page + up to 2 neighboring pages with images for style consistency
4. **PDF page numbers for filenames** - reliable mapping vs printed page numbers
5. **Low temperature (0.2)** - improves consistency for transcription
6. **Faithful reproduction** - preserve original style, only improve scan quality
