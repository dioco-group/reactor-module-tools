# ALC → Module Format — Common Conversion Core

Focused rules for converting **American Language Course (ALC)** materials into the
current v2 module format (`module_format.md`). Applies to **both** tracks; track
extras live in `alc_conversion_notes.md` (LLA — cassette audio) and `st_notes.md`
(ST — TTS only, no tape).

Modules are **monolingual English** (`TARGET_LANG_G: en`, `HOME_LANG_G: en`): write
English only. The format has no translation fields — translations into the learner's
language (any language) are generated automatically downstream.

---

## 1. Two rules that shape everything

- **Split presentation from task.** One source figure/section usually becomes
  **several** activities: render a passage as a `$DIALOGUE`, then its comprehension
  questions as a following `$SELECT`/`$PRODUCE`. Never pack presentation + task onto
  one card.
- **Convert EVERY item — never sample or summarize.** Emit one item (or `LINE`) for
  every item in the source: "Number 1 … Number 15" → 15 items; an A–G list → 7
  letters. The source's own numbering is the authoritative count — check it before
  finishing an activity.

## 2. Pick the activity type by what the learner does

| Learner action | Type |
|---|---|
| listens / reads / repeats — dialogs, sentence lists, vocab, reading passages | `$DIALOGUE` |
| reads reference / tables | `$GRAMMAR` |
| **taps** option(s) — T/F, a/b, MCQ, Same/Different, sound-ID, categorize, matching | `$SELECT` |
| **produces** an answer (typed or spoken) — drills, cloze, dictation, transformation, open response | `$PRODUCE` |
| converses with the AI | `$CHAT` |

Decide `$SELECT` vs `$PRODUCE` by the **action, not the printed heading**: picking
among given statements/pictures → `$SELECT`; producing the words (say/type) →
`$PRODUCE`. (`$SELECT` uses `ANSWER` = correct option id; `$PRODUCE` uses `RESPONSE`
= the produced text/model.)

### `$PRODUCE` behaviour — `INPUT` and `CHECK` are independent
- `INPUT:` `speak` (default) · `type` — **mirror the source modality**: source has
  the learner *say* it → `speak`; *write* it → `type`. (Never `either`.)
- `CHECK:` `reveal` (default, self-check) · `exact` (one right string) · `llm`
  (model-graded against a `RUBRIC`).
- Use `exact` **only for a single mechanical form** (one-word/one-form cloze,
  dictation). Use `llm` whenever the answer is **longer/free**, **not a mechanical
  transformation**, or **phrasable more than one way** (`It's a pen.` / `It is a
  pen.`, a Q&A pair) — so reasonable variants pass.
- The standard oral drill is just the defaults (`speak`/`reveal`) + a `RESPONSE` model.

## 3. Source element → marker (quick reference)

| Source element | Marker |
|---|---|
| "Repeat the words/sentences", letters, numbers, lists | `$DIALOGUE REPEAT` |
| 2-speaker dialog ("listen… then repeat") | `$DIALOGUE REPEAT` (screenplay `Id:` lines) |
| Reading passage / paragraph / story | `$DIALOGUE` (`Narrator`, short LINEs, **no** `REPEAT`) |
| Grammar explanation / table | `$GRAMMAR` |
| Circle T/F · a/b · MCQ | `$SELECT` |
| Same/Different · sound-ID | `$SELECT` (shared pool; prompt hidden) |
| Categorize · "write A/B/C" by sound | `$SELECT` (`MULTI` if several per bucket) |
| Match sentence→picture / item→letter | `$SELECT` (shared pool) |
| Choose the correct statement/answer (even if printed "answer the questions") | `$SELECT` |
| "Answer the questions" where the learner **says** the answer | `$PRODUCE` (speak/reveal) |
| Transformation / substitution drill | `$PRODUCE` (speak/reveal) |
| "Write the word/verb form" / cloze (one answer) | `$PRODUCE` (type/exact, `TEMPLATE`) |
| Ask & answer · picture Q&A · "what" questions | `$PRODUCE` (speak/llm; title-line `{image}` if picture-cued) |

## 4. INTRO & INSTRUCTION

- **INTRO** — spoken (TTS, translated) context before the cards; 1–3 sentences. It
  is heard **before any content is visible**, so it must stand alone: never point at
  the screen ("These are…", "Look at Figure N"); say what's coming ("You'll see a
  map of Texas…").
- **INSTRUCTION** — one-line on-screen reminder during the activity; not read aloud.
- **Re-express print apparatus**: "circle the letter" → "tap…", "write on the line"
  → "type". Never mention the book, pages, circling, or printed A/B letters.
- INTRO source differs by track: LLA mines it from the tape; ST omits it unless the
  book prints lead-in text (see the track files).

## 5. Per-type rules

### `$DIALOGUE`
- `REPEAT` for listen-and-repeat; omit for reading passages.
- **One word/phrase per `VOCAB`** line, placed directly before the line that uses it.
- **Emit `VOCAB` only for words the source explicitly teaches** (underlined/bolded,
  on a vocab page, or "new word: …"). Don't tag incidental words; when in doubt, omit.
- **One line = 1–2 sentences**; split long paragraphs; use `Narrator:` for passages.
- **Keep a speaker's consecutive short turn on ONE line** — don't split "Hello." /
  "How are you?" into two lines.
- Drop "now read X's lines" role-play tails.

### `$GRAMMAR`
- Reproduce tables/explanations **verbatim**; wrap target phrases in `{braces}` for
  tappable audio. **Faithful only — don't author prose the source lacks.**

### `$SELECT`
- **Shared option pool** at activity level when options repeat; per-item `OPTION`
  only when choices differ.
- **Prompt text is hidden by default**; add `SHOW_PROMPT` only when the source
  printed the stimulus text (preserves the listening difficulty).
- **Cloze stimulus → `TEMPLATE`, never `PROMPT`** (a clip-less `PROMPT` is TTS-read
  and would voice the gaps).
- `FEEDBACK` only when it explains/extends; omit if it just echoes the tapped option.
- Say **"Tap"**, never "Circle".

### `$PRODUCE`
- `TEMPLATE` = on-screen text never read aloud: a cloze gap, or context the learner
  reads to answer. Keep `PROMPT` for the spoken stimulus.
- **Picture stimulus → image-only `PROMPT`** (`PROMPT: {page.jpg}`). Don't add a
  `TEMPLATE` that just restates the `INSTRUCTION` (e.g. `(Write a question and an
  answer)`).
- Open-ended → `CHECK: llm`, `RESPONSE` = a sample, optional `RUBRIC`; title-line
  `{image}` if picture-grounded.
- Reading a context sentence to answer a spoken question: `PROMPT` = the question,
  `TEMPLATE` = the context to read, `RESPONSE` = the answer — don't fold the read
  sentence into `PROMPT`.

## 6. Images & layout

- Reference extracted images by **bare filename** (`page_XXX_YYY.jpg`). A complex
  visual (map, calendar, diagram) is an **image**, not a transcribed table.
- **One shared visual for the whole activity → the marker title line**
  (`$DIALOGUE Texas Map {page.jpg}`); it stays on screen for every item. An inline
  per-line `{page.jpg}` shows only on that line and overrides the title image.
- **A per-item picture goes on BOTH the question and answer cards** — both the
  `PROMPT` and `RESPONSE` of a `$PRODUCE`, or both `LINE`s of a `$DIALOGUE` Q&A.
- **No raw HTML** — flatten side-by-side layouts to linear markdown.
- Never emit page/figure numbers or "(recorded)" notes as content.

## 7. Titles, lessons, order

- One `$LESSON` per sub-lesson/sub-topic; descriptive module title on the marker
  line: `$MODULE Lesson <NX>: <topic>` (never a bare "Lesson 1B").
- **Activity title = the source heading, same words**, normalized ALL-CAPS → Title
  Case (`HOW ARE YOU?` → `How Are You?`). Don't paraphrase, and don't use the
  instruction sentence as the title.
- **Repeated same-type heading → add a short qualifier** (`How Are You? (Formal)`),
  never a bare `(2)` — the activity id is `type + title` and would collide.
- Preserve the source order; convert everything except the SKIP/DEFER lists.

## 8. SKIP (don't convert)

Homework; alphabetizing; timed speed-reading; crossword/word-search; listening
exercises whose stimuli we don't have (most ST Listening-Skill blocks); group
discussion / instructor-led oral; learner-plays-a-role role-play; reading-progress
charts. (Ship as a PDF or drop.)

## 9. DEFER (out of current scope)

The writing / composition / note-taking family — multi-sentence dictation, paragraph
composition, sentence sequencing, outlines, passage annotation, typed diagram
labeling, punctuation editing (concentrated in Book 24). Revisit with the later
books. (Passage-comprehension MCQ, word-bank cloze, and diagram MCQ are NOT deferred.)

## 10. Output

- Prompts are STATEMENTS of what to do, never questions to the learner.
- **Strip source item numbers** from content (`LINE: 1. The boys…` → TTS reads "one").
- `TEMPLATE` is display-only; cloze gaps use `____`.
- `EXAMPLE` items carry the same `TEMPLATE` scaffolding as the regular items.
- Separate items with a blank line. Output ONLY the `.module` text.
