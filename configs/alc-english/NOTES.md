# ALC English — Extraction & Image Experiments

Source: `2012ALC-LLA-Book-1.pdf` (228 pages). Ground-truth test page: **PDF page 11**, a
12-panel "Repeat the words and sentences" grid with objectively checkable directions
(door open/close, book open/close, window up/down).

## Findings (TL;DR)

- **Extraction model matters; chunk size and temperature do not.**
- **Best extraction settings:** `gemini-3.5-flash`, `thinkingLevel: LOW`, no temperature,
  `maxTokens: 65536`, `pagesPerChunk: 20`.
- **Images: don't generate from the full page — crop + re-render.** Detect each
  illustration's bbox, crop it from the 300-DPI scan, then re-render that single crop.
  Image model: `gemini-3.1-flash-image` (Nano Banana 2); bbox model: `gemini-3.5-flash`.

## Experiment 1 — Chunk length & temperature (extraction)

Method: re-extracted page 11 under several settings, scored the 6 directional panels.
(`pdf-extract/chunk-study.js`)

| Model | pages/chunk | temp | directional score |
|---|---|---|---|
| gemini-3.1-pro-preview | 20 | 1.0 | 4/6 (books #8,#12 flipped) |
| gemini-3.1-pro-preview | 20 | 0.2 | 3/6 |
| gemini-3.1-pro-preview | 10 | 0.2 | 4/6 |
| gemini-3.1-pro-preview | 1  | 0.2 | 3/6 |
| **gemini-3.5-flash** | 20 | – | **6/6** |
| **gemini-3.5-flash** | 1  | – | **6/6** |

- The "open book / close book" flip is a **vision/spatial error**, not a context-length one:
  3.1 Pro flipped the books even with page 11 **alone** in context (n=1).
- Smaller chunks gave **no accuracy gain** and cost far more (228 calls vs 12).
  (Originally: "Keep 20." See the update below — we later lowered it to 6.)
- Lower temperature did not help (and 3.5 Flash doesn't accept temperature).

> **Update (page-numbering reliability): `PAGES_PER_CHUNK` lowered 20 → 6.**
> This study only measured *transcription/content* accuracy, which it found is
> insensitive to chunk size (even 1 page/chunk scored 6/6). It did **not** measure
> *image page-number* accuracy. Because these books are pure scans (no text layer),
> the model has to derive each page's PDF index by counting from the batch's start
> page — and the printed page numbers on the scans differ from the PDF index (cover +
> front matter). Larger batches = more pages to count across = more off-by-one drift
> in `page_XXX_YYY` filenames. Since content accuracy is chunk-size-insensitive, the
> only cost of a smaller batch is more API calls, so 6 is a cheap way to de-risk the
> numbering while keeping some cross-page context. The prompt also now lists the
> exact "file page → PDF page" mapping for the batch.
- **3.5 Flash read every arrow correctly** and was ~25–30% faster end-to-end
  (21.7 min vs 30.2 min full book). Matches the tool's original "Flash for transcription" note.

## Experiment 2 — Flash empty responses

- Some chunks returned **0 chars** with `finishReason=RECITATION` (model refuses content it
  thinks matches training data). Intermittent.
- Fix: extraction now **retries on empty** and never saves a blank chunk (would otherwise
  leave a silent hole in the book). `thinkingLevel: LOW` also reduces latency/cost.

## Experiment 3 — Image model A/B

Method: regenerated a page-11 subset (face, walking figure, doors, books) with each model,
same prompt + style context. (`pdf-extract/image-model-study.js`)

| Model | speed | fidelity (B/W line art) |
|---|---|---|
| gemini-3-pro-image (Nano Banana Pro) | ~20.1 s/img | excellent |
| **gemini-3.1-flash-image (Nano Banana 2)** | **~11.8 s/img** | on par |

- For simple line illustrations fidelity is a wash; Flash is ~1.7× faster and built for
  high volume → chosen for the 569-image run.

## Experiment 4 — Image approach: full-page generate vs crop vs crop+re-render

Both full-page generation approaches (Pro Image and Flash Image) had recurring issues:
**style drift, flipped arrows, and occasionally the wrong panel** — inherent to asking the
model to locate-and-redraw from a busy page.

| Approach | Right panel? | Arrows correct? | Style | Polish |
|---|---|---|---|---|
| Full-page -> generate | sometimes | often flipped | drifts | clean |
| Pure crop from scan | always | always | exact original | raw scan |
| **Crop + re-render (chosen)** | **always** | **always** | **faithful** | **clean** |

Key fact: each PDF page is a single full-page bilevel scan (no separately embedded
illustrations), so `pdfimages` can't isolate panels — but cropping the page raster yields the
exact original art.

**Chosen pipeline (`generate-images.js`, reworked):**
1. One vision call per page (`gemini-3.5-flash`, JSON bboxes) locates each illustration's
   drawing box, using the markdown descriptions + `#N` panel numbers.
2. Expand the box ~25% (`imageExpand`) and crop from the source PDF with `pdftoppm`.
3. Re-render that single crop with `gemini-3.1-flash-image`.
Because the model only sees the one correct illustration, panel-selection and arrow-direction
errors are structurally eliminated; it just cleans up the line art.

## Extraction prompt fix (extract-markdown.js)

- **Printed panel number marker:** descriptions are prefixed with `#N` (the printed panel
  number) when present. Used by the bbox step to identify the right panel.

## Config keys (configs/alc-english/pdf-extract.json)

- `model`, `temperature: null`, `thinkingLevel: "LOW"`, `maxTokens`, (`pagesPerChunk` default 20)
- `imageModel`, `bboxModel`, `imageExpand`

## Scripts (throwaway / reusable for future books)

- `pdf-extract/chunk-study.js` — chunk-size / temperature / model accuracy study on a page.
- `pdf-extract/image-model-study.js` — image-model A/B on a page subset.
- `pdf-extract/crop-study.js` — faithful crop POC (bbox + pdftoppm) on a page.
- `pdf-extract/crop-rerender-study.js` — crop + re-render POC on a page.
