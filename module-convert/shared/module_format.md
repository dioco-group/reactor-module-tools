# Module Format Specification (v2)

This document defines the format for `.module` files used by the language learning platform.

v2 organizes every activity along orthogonal axes instead of a pile of markers.
There are **five** activity types — two for *consuming* content (`$DIALOGUE`,
`$GRAMMAR`), two for *responding* (`$SELECT`, `$PRODUCE`), and `$CHAT`.

> **Monolingual rule:** A `.module` is written in a single language. Target-language
> content goes in the target language; instructions / titles / notes are written
> in `HOME_LANG_G`. **Do NOT author translations** — there are no `*_T` fields.
> Student-language translations are generated automatically downstream.

## How the App Works

Understanding the student experience helps create better modules:

### Structure
- **Module** → **Lessons** → **Activities** → **Cards**
- Students swipe through content **card-by-card**
- Each lesson should take **15–45 minutes** to complete

### Key UX Patterns
- **In `$SELECT`/`$PRODUCE`, the stimulus/answer is blurred by default** — students reveal or answer (prevents over-reliance on reading). `EXAMPLE` items are shown unblurred.
- **Audio plays automatically** — tap to replay
- **Dictionary lookups** — tap any word in target-language text to see a definition
- **INTRO is spoken** before the activity starts (narrator voice)
- **INSTRUCTION stays at the top of the screen** during the activity (brief reminder)

## Module Header (Required)

Every module starts with `$MODULE` followed by required fields:

```
$MODULE
FORMAT: 2
DIOCO_DOC_ID: lc_fsi_french_u1
TITLE: Unit 1: Greetings and Introductions
DESCRIPTION: Basic French greetings, introductions, and polite expressions.
TARGET_LANG_G: fr
HOME_LANG_G: en
```

| Field | Required | Description |
|-------|----------|-------------|
| `FORMAT` | **Yes** | Format version — always `2`. Declarative so readers never have to sniff for v2-only markers |
| `DIOCO_DOC_ID` | No | Optional identifier (moduleKey is derived from filename at runtime) |
| `TITLE` | **Yes** | Module title |
| `DESCRIPTION` | No | Single-line description of what the module teaches |
| `IMAGE` | No | Image filename for module cover |
| `TARGET_LANG_G` | **Yes** | Language being taught (`fr`, `es`, `en`, `de`, …) |
| `HOME_LANG_G` | **Yes** | Language the instructions/titles/notes are written in |

## Voice Configuration (Optional, in header)

Configure voices for TTS.

- Voice names are **case-insensitive** and must **not contain spaces** (`A-Za-z0-9_`).
- Speaker IDs used in mappings are **case-insensitive** and must **not contain spaces** (e.g. `M_Lelong`, `Mme_Durand`, `SpeakerA`).

```
VOICE_DEFAULT: aoede | Speak clearly and naturally
VOICE_INTRO: aoede | Speak like a friendly narrator
VOICE_PROMPT: achernar | For stimulus/prompt audio
VOICE_RESPONSE: achird | For model-answer audio

# Speaker mappings: map a speaker id (used as the `Id:` line prefix) to a voice
VOICE: Mme_Durand | aoede | Speak warmly in French
VOICE: M_Lelong | achernar | Speak formally
```

| Field | Description |
|-------|-------------|
| `VOICE_DEFAULT` | Fallback voice for all TTS |
| `VOICE_INTRO` | Voice for reading activity introductions (narrator) |
| `VOICE_PROMPT` | Voice for stimulus/prompt audio |
| `VOICE_RESPONSE` | Voice for model-answer audio |
| `VOICE` | Map speaker **ID** to `{voice, prompt}` (repeatable) |

**Formats:**
- `VOICE_DEFAULT / VOICE_INTRO / VOICE_PROMPT / VOICE_RESPONSE`: `VoiceName | Optional style instruction`
- `VOICE`: `SpeakerId | VoiceName | Optional style instruction`

## TTS Prompt (Optional)

An optional TTS style/tone hint passed to the TTS system prompt.

- **Module-level** (default for all activities): `TTS_PROMPT: This is a beginner course. Speak clearly.`
- **Activity-level** (Dialogue / Produce only): a `TTS_PROMPT:` line right after the marker overrides the default.

## Section Markers

Section markers have **NO colon** and the title goes on the **same line**:

```
$LESSON Lesson 1 — Dialogue and Vocabulary
$DIALOGUE Dans la rue / On the street
$GRAMMAR Noun-Markers (Definite Articles)
$SELECT True or False?
$PRODUCE Answer the questions
$CHAT Practice Conversation
```

## $LESSON Marker

Divides the module into study sessions. Each lesson should be completable in **15–45 minutes**.

```
$LESSON Dialogue and Vocabulary
$LESSON Grammar — Noun Markers
```

## Orthogonal Attributes (used across types)

| Attribute | Applies to | Meaning |
|---|---|---|
| `INTRO:` | any activity | Spoken intro before the activity starts (sets the scene). Keep to 2–3 sentences. |
| `INSTRUCTION:` | any activity | Brief on-screen instruction shown during the activity. |
| `{file}` (inline) | end of a dialogue line / `PROMPT` / `RESPONSE` / `OPTION` | **An asset attached to that text**, routed by extension: `{page.jpg}` = image, `{clip.mp3}` = cassette clip played in full. See *Inline assets* below. |
| `IMAGE:` | **activity-level** in `$DIALOGUE` / `$SELECT` / `$PRODUCE` (before the first line/item); module header (cover) | Shared reference image (diagram / map / scene) shown for **all** lines/items of the activity. Per-line/per-item images are inline. |
| `REPEAT` | `$DIALOGUE` (flag, no colon) | After listening, the learner repeats each line aloud. |
| `MULTI` | `$SELECT` (flag, no colon) | More than one option may be correct. |
| `SHOW_PROMPT` | `$SELECT` / `$PRODUCE` (flag, no colon) | Show the spoken `PROMPT` text from the start (the book printed the stimulus). DEFAULT: prompt text is hidden until answered/revealed — a spoken `PROMPT` is normally tape-only. |
| `EXAMPLE` | next `$SELECT`/`$PRODUCE` item (flag, no colon) | Worked example, shown unblurred. |
| `TEMPLATE:` | `$SELECT` / `$PRODUCE` item | **On-screen text shown but never read aloud.** Two uses: a cloze gap (`____`) the learner fills/completes, or context/reading text the learner reads to form the answer (e.g. a sentence not on the audio). A `(cue)` in parentheses is shown, not spoken. A cloze stimulus with `____` must be a `TEMPLATE`, not a `PROMPT` (a `PROMPT` without a clip gets TTS). |

## Inline Assets

Images and audio are attached to a content line by appending them in **curly
braces** at the very end of the text, **routed by file extension** — image
first, audio last. Allowed on dialogue lines, `PROMPT`, `RESPONSE` (audio only),
`OPTION`, and `TEMPLATE` (image only):

```
Narrator: This is Linda. {page_012_001.jpg} {bk04-l1a-f8-01.mp3}
PROMPT: John, do you like football games? — No, I don't. {bk04-l1a-f3-01-q.mp3}
OPTION: e | soccer {page_008_005.jpg}
OPTION: b | John doesn't like football games. {bk04-l1a-f3-01-a.mp3}
RESPONSE: The children like to play ball in the afternoon. {bk04-l1a-f4-01-a.mp3}
```

- Audio extensions: `.mp3 .wav .ogg .opus .m4a`; image extensions: `.jpg .jpeg .png .gif .webp .svg`.
- The clip is played **in full**; the text before the assets is the line shown/translated/tokenized.
- At most **one image + one audio** per line.
- `TEMPLATE` is display-only — it may carry an image, **never** a clip.
- There are no `AUDIO:` / `RESPONSE_AUDIO:` / `OPTION_AUDIO:` / `OPTION_IMAGE:` /
  `PROMPT_IMAGE:` fields — assets always ride their text. `IMAGE:` survives only
  as the module cover (header) and as the **activity-level shared image** in
  `$DIALOGUE` / `$SELECT` / `$PRODUCE` (placed before the first line/item).
- **Drafts** (pre-slicing) include audio timing: `{clip.mp3@<start>-<end>}`. The slicer
  cuts that range from the figure mp3 and rewrites it to a bare `{clip.mp3}`.

## $DIALOGUE Activity

**Goal:** Listen to / read / repeat conversations, example-sentence lists,
vocabulary, and reading passages.

### How It Works in the App
- Each line is a **card** the student swipes through
- **Speaker name** shown at top; **target-language text** shown prominently
- **Audio plays automatically**; tap any word for a dictionary lookup
- **NOTES** appear in a tip box below the line
- With `REPEAT`, the learner is prompted to repeat each line aloud

### Speaker Lines (screenplay style)

A spoken line is written with its **speaker id as the prefix** — there is no
`SPEAKER:` field:

```
Durand: Tiens, voilà Mademoiselle Courtois. {clip-01.mp3}
```

- The id must be alnum/underscore, contain at least one lowercase letter
  (ALL-CAPS identifiers are reserved for fields), and map to a `VOICE:` id when
  voices are declared.
- A bare `LINE:` **continues the current speaker** — and is also used for
  speaker-less lists/passages (or use `Narrator:`).

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` | No | Spoken by narrator before the activity (sets the scene) |
| `INSTRUCTION` | No | Brief text shown at top of screen during the activity |
| `REPEAT` | No | Flag: listen, then repeat each line aloud |
| `VOCAB` | No | One vocabulary word/phrase (repeatable, placed before the line it belongs to) |
| `Speaker:` / `LINE` | **Yes** | Target-language line — **keep to 1–2 sentences** so audio clips stay short. Inline `{image.jpg}` / `{clip.mp3}` at the end |
| `NOTES` | No | Cultural context / grammar tip for this line |
| `IMAGE` | No | Activity-wide reference image (map / scene) shown for **all** lines. Place before the first line. An inline per-line `{image.jpg}` overrides it for that line |

A line shows its own inline `{image.jpg}`, or the activity-wide `IMAGE:` if it has
none — there is **no implicit carry-over** between lines. A narration panel that
illustrates several sentences is repeated explicitly on each of those lines.

### Example

```
$DIALOGUE Dans la rue / On the street
INTRO: Mr. Lelong and Mrs. Durand meet on the street. Listen for the formal greetings.
INSTRUCTION: Listen and repeat each line.
REPEAT

VOCAB: tiens
VOCAB: voilà
Durand: Tiens, voilà Mademoiselle Courtois.

Courtois: Bonjour, Madame. Comment allez-vous?
NOTES: "Comment allez-vous" is the formal way to ask "how are you".
```

### Vocabulary Lists / Reading Passages
Use bare `LINE:` for plain example-sentence lists. For a reading passage, use
`Narrator:` (or `LINE:` after it), short lines, and no `REPEAT`.

### Narrator (Scene Changes)
Use `Narrator:` for lines announcing scene changes or transitions —
clear visual separation, narrator voice, parallel TTS.

## $GRAMMAR Activity

**Goal:** Understand rules and patterns through reference material.

### How It Works in the App
- Displays as a **scrollable reference card** (like a textbook page)
- Content is **markdown** (headers, tables, bullet points, images)
- Phrases in `{curly braces}` become **clickable audio buttons**

**Important:** Inside `{curly braces}`, do NOT use markdown formatting. The bracketed content is extracted as plain text for audio.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` | No | Spoken introduction |
| (content) | **Yes** | Free-form markdown content |

### Example

```
$GRAMMAR Definite Articles
INTRO: Let's learn the French definite articles: le, la, and les.

In French, nouns are marked for gender and number.

**le** — masculine singular: {le restaurant}, {le frère}
**la** — feminine singular: {la rue}, {la soeur}
**les** — all plurals: {les rues}

| | Singular | Plural |
|---|---|---|
| Masculine | le | les |
| Feminine | la | les |

![Article usage diagram](articles_diagram.png)
```

## $SELECT Activity

**Goal:** Tap one or more options. Covers True/False, a/b, multiple choice,
Same/Different, sound-ID, categorize, and matching.

### How It Works in the App
- The student sees the stimulus (`PROMPT` and/or `TEMPLATE`, with inline assets) and taps option(s)
- `PROMPT` = the spoken stimulus (its inline clip, or TTS if none); `TEMPLATE` = display-only stimulus, never read aloud (cloze gaps, read-only context). An item needs at least one of the two
- An option's image, caption, and spoken clip all live on ONE `OPTION` line: `OPTION: e | soccer {page_008_005.jpg} {clip.mp3}` (text optional for image-only options)
- Options may be declared **once at the activity level** (a shared pool) or **per item** (overrides the pool)
- `ANSWER` lists the correct option id(s)
- `EXAMPLE` items are shown unblurred

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` / `INSTRUCTION` | No | |
| `MULTI` | No | Flag: more than one correct option may be chosen |
| `SHOW_PROMPT` | No | Flag: show the spoken stimulus text from the start (book printed it). Default: hidden until answered |
| `IMAGE` | No | Activity-level shared reference image (diagram/map), before the first item |
| `OPTION` | **Yes** (≥2) | `OPTION: <id> \| <text> {image.jpg} {clip.mp3}` — text and/or inline image, optional spoken clip. At activity level = shared pool; inside an item = overrides the pool |
| `EXAMPLE` | No | Marks the next item as a worked example |
| `PROMPT` | * | The spoken stimulus; inline `{image.jpg}` / `{clip.mp3}` at the end (text hidden by default — `SHOW_PROMPT` shows it) |
| `TEMPLATE` | * | Display-only stimulus, never read aloud — cloze gap (`____`) or read-only context; may carry an inline `{image.jpg}` |
| `ANSWER` | **Yes** | Correct option id(s), e.g. `a` or `a,c` |
| `FEEDBACK` | No | Reveal text — a fuller model and/or explanation. Omit when it would just echo the chosen option |

### Example

```
$SELECT Same or Different?
INSTRUCTION: Tap Same or Different.
OPTION: s | Same
OPTION: d | Different

PROMPT: wed ... red {bk04-l3a-f4-01.mp3}
ANSWER: d

PROMPT: wake ... wake
ANSWER: s
```

\* an item needs at least a `PROMPT` or a `TEMPLATE`.

```
# Cloze with given choices: the gapped sentence is a TEMPLATE (shown, never spoken);
# the correct option carries the spoken completed sentence.
$SELECT Comprehension Check
INSTRUCTION: Tap the correct word.

TEMPLATE: Linda works ____.
OPTION: a | all night long
OPTION: b | all week long {bk04-l1a-f8-16.mp3}
ANSWER: b
```

## $PRODUCE Activity

**Goal:** Produce an answer (typed or spoken). Covers imitation drills
(say it → reveal), cloze, dictation, transformations, and open-ended responses.

Behavior is set by two orthogonal attributes:

| Attribute | Default | Values |
|---|---|---|
| `INPUT:` | `speak` | `type` · `speak` · `either` — the **initially proposed** input mode; the learner can always switch. The app shows a typed field for checkable items (`CHECK: exact`/`llm`) regardless; spoken answers are self-checked via reveal. |
| `CHECK:` | `reveal` | `reveal` (self-check) · `exact` (normalized string match) · `llm` (graded by model) |

### How It Works in the App
- The student hears/reads the stimulus (`PROMPT` and/or `TEMPLATE`), produces an answer, then checks
- `TEMPLATE` is **on-screen text shown but never read aloud** — a cloze gap (`____`) to fill, or context/reading text the learner reads to answer. Use it for a sentence the learner must read that isn't on the audio, while `PROMPT` stays the (spoken) stimulus whose clip rides it inline.
- `EXAMPLE` items are shown unblurred

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` / `INSTRUCTION` | No | |
| `INPUT` / `CHECK` | No | Behavior attributes (see above) |
| `SHOW_PROMPT` | No | Flag: show the spoken stimulus text from the start (book printed it). Default: blurred until revealed |
| `EXAMPLE` | No | Worked example, unblurred |
| `PROMPT` | * | Spoken/read stimulus (e.g. the question); inline `{image.jpg}` / `{clip.mp3}` at the end |
| `TEMPLATE` | * | On-screen text shown but not read aloud — cloze gap (`____`) or context/reading text the learner reads to answer; may carry an inline `{image.jpg}`, never a clip |
| `RESPONSE` | **Yes** (except open `CHECK: llm`) | The model/expected answer; append `{clip.mp3}` for a spoken model answer (audio only — no images). For `CHECK: exact`, the string to match; for `reveal`/`llm`, the model/sample |
| `ACCEPT` | No | Extra accepted strings (`CHECK: exact`), `\|`-separated |
| `RUBRIC` | No | One-line grading guidance (`CHECK: llm`) |

\* an item needs at least a `PROMPT` or a `TEMPLATE`.

### Examples

```
# Audio-lingual drill (defaults: speak + reveal)
$PRODUCE Answer the questions
INSTRUCTION: Listen, then answer aloud.
EXAMPLE
PROMPT: Does Capt Collins wear his uniform to work?
RESPONSE: Capt Collins wears his uniform to work.

PROMPT: Do the children play ball in the afternoon?
RESPONSE: The children play ball in the afternoon.
```

```
# Cloze (type + exact); TEMPLATE is shown but not spoken
$PRODUCE The Smiths — past tense
INPUT: type
CHECK: exact
TEMPLATE: They ____ to Houston last month. (fly)
RESPONSE: flew
```

```

```
# Spoken question (inline clip) + a context sentence the learner READS (not on tape)
$PRODUCE Answer about the children
PROMPT: What do the children like to do in the afternoon? {bk04-l1a-f4-01.mp3}
TEMPLATE: The children play ball in the afternoon.
RESPONSE: The children like to play ball in the afternoon.
```

```
# Open response (graded by model), switchable input
$PRODUCE Ask and answer with "what"
INPUT: either
CHECK: llm
PROMPT: shoes
RESPONSE: What shoes did you wear yesterday? — I wore my new shoes.
RUBRIC: Accept any question + answer using "what" about shoes.
```

## $CHAT Activity

**Goal:** Practice open-ended conversation with an AI character.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` | No | Spoken introduction |
| `SCENARIO` | **Yes** | Shown to student (their role/context) |
| `INITIAL_PROMPT` | **Yes** | System prompt for the AI character (hidden from student) |

### Example

```
$CHAT Practice Saying Goodbye
INTRO: Now you'll practice a real conversation.
SCENARIO: You are leaving a shop after a purchase. Say goodbye to the owner.
INITIAL_PROMPT: You are a friendly shop owner. Respond warmly when the customer says goodbye. Keep it short and beginner-appropriate.
```

## Images

Images can appear in dialogue lines, select/produce items, grammar content, and as cover images.

### Image Folder Convention
Each module's images live in a folder named after the module file (without `.module`).
For `01-at-the-cafe.module`, images go in `01-at-the-cafe/`. In the module, use bare
filenames — the server resolves them to the matching module folder:

```
Jim: Look at this. {cafe_scene.png}   # resolves to 01-at-the-cafe/cafe_scene.png
```

A path containing `/` is used as-is relative to the repo root (`{shared/logo.png}`).

### Where Images Are Supported

| Context | Field | Example |
|---------|-------|---------|
| Course / Module header | `IMAGE:` field | `IMAGE: cover.jpg` |
| Dialogue line | inline | `Jim: Look at this. {cafe_scene.png}` |
| Select / Produce stimulus | inline | `PROMPT: What is it? {apple.png} {clip.mp3}` |
| Select option | inline | `OPTION: a \| apple {apple.png}` |
| Dialogue / Select / Produce activity | `IMAGE:` field | activity-level shared image, shown for ALL lines/items (before the first line/item) |
| Grammar content | Markdown syntax | `![alt text](diagram.png)` |

## Audio Clips

An inline `{clip.mp3}` at the end of a `LINE`/`PROMPT`/`RESPONSE`/`OPTION` references an audio clip filename **played in full**.
The format only references filenames; clips are produced/sliced by the build
pipeline (e.g. per-line/per-item cassette slices). Use a stable filename pattern.

## Output Requirements for Converters

When generating module-format output:

- Return ONLY the module-format text
- Start with `$MODULE` and required header fields
- Use section markers with NO colon (`$LESSON Title`, not `$LESSON: Title`)
- Put titles on the same line as section markers
- Ensure every module has `FORMAT: 2`, `TITLE`, `TARGET_LANG_G`, `HOME_LANG_G` (`DIOCO_DOC_ID` optional)
- **Monolingual:** never emit `*_T` translation fields — translations are generated downstream
- Use only the v2 types: `$DIALOGUE`, `$GRAMMAR`, `$SELECT`, `$PRODUCE`, `$CHAT` (no `$EXERCISE`)
- Dialogue lines are screenplay-style (`Jim: text`); `PROMPT`/`OPTION`/`ANSWER`/`RESPONSE` on separate lines; separate items with a blank line
- Flags (`REPEAT`, `MULTI`, `SHOW_PROMPT`, `EXAMPLE`) are bare lines with no colon and no value
- `$SELECT` needs ≥2 `OPTION`s (shared or per-item) and an `ANSWER` per item
- `$PRODUCE` items need a `PROMPT` or `TEMPLATE`, plus a `RESPONSE` (unless open `CHECK: llm`)
- Keep `INTRO` concise; keep `INSTRUCTION` brief (one line)
- Use `{curly braces}` around phrases in grammar content for audio playback
```
