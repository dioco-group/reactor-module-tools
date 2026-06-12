# Module Format — v2 (orthogonal 5-type model)

**Status:** proposal, ready to ratify. Additive to v1 (`module_format.md`): the
module header, `$LESSON`, `$DIALOGUE`, `$GRAMMAR`, and `$CHAT` are unchanged. v2
**replaces** the ad-hoc drill markers (`$EXERCISE`, and the never-shipped
`$QUIZ`/`$MATCH`/`$CLOZE`/`$DICTATION`/`$RESPOND`/`$READING` sketches) with **two**
response types whose behavior is set by orthogonal attributes.

Derived from a full read of ALC Book 4 (LLA + Student Text) and Book 24, and
validated by converting Lesson 1A, Lesson 3A, and Student-Text Lesson 4
(`module-convert/format-comparison/`).

---

## 1. Design principle — axes, not a pile of markers

Every activity is a point in a small space:

- **Presentation** — prose/dialog/reference/vocab/media → a *consume* type.
- **Response** — none / select / produce / converse.
- **Grading** (if producing) — reveal (self-check) / exact (match) / llm (rubric).
- **Input** (if producing) — type / speak / either.
- **Modifiers** (orthogonal) — inline `{clip}` audio, `IMAGE`, `INTRO`, `INSTRUCTION`,
  `EXAMPLE`, `SHOW_PROMPT`, `REPEAT`, `TEMPLATE`.

A **type** exists only where the app needs a genuinely different renderer;
everything else is an attribute. That yields **five** types.

| Type | Learner does | Renderer |
|---|---|---|
| `$DIALOGUE` | listens / reads / repeats | lines + audio, tappable words |
| `$GRAMMAR` | reads reference | scrollable markdown |
| `$SELECT` | taps one or more options | options grid |
| `$PRODUCE` | produces an answer (typed/spoken) | input box / mic + check |
| `$CHAT` | converses with an AI | chat |

Old → new mapping: `$EXERCISE`→`$PRODUCE` (`CHECK: reveal`); cloze/`$CLOZE`→
`$PRODUCE` (`CHECK: exact`, `TEMPLATE`); `$DICTATION`→`$PRODUCE` (`INPUT: type`,
`CHECK: exact`); open `$RESPOND`→`$PRODUCE` (`CHECK: llm`); `$QUIZ`+`$MATCH`→
`$SELECT`; `$READING`→`$DIALOGUE` (a passage of short `LINE`s).

---

## 2. Module header & `$LESSON`

As in v1 (`$MODULE` with `TITLE`, `TARGET_LANG_G`, `HOME_LANG_G`, optional
`DESCRIPTION`/`IMAGE`/`DIOCO_DOC_ID`/`TTS_PROMPT`; voice config; `$LESSON Title`),
plus a required declarative version marker as the first header field:

```
$MODULE
FORMAT: 2
```

For ALC, the module is authored in English and monolingual: `TARGET_LANG_G: en`,
`HOME_LANG_G: en`. Russian (the learners' language) is generated downstream.

---

## 3. Orthogonal attributes (used across types)

| Attribute | Applies to | Meaning |
|---|---|---|
| `INTRO:` | any | Spoken intro before the activity. |
| `INSTRUCTION:` | any | Brief on-screen instruction during the activity. |
| `{file}` (inline) | end of a dialogue line / `PROMPT` / `RESPONSE` / `OPTION` / `TEMPLATE` | **An asset attached to that text, routed by extension** — `{page.jpg}` = image, `{clip.mp3}` = cassette clip played in full (pattern: `bk<NN>-l<lesson>-f<fig>-<item>.mp3`). Image first, audio LAST; at most one of each per line. In a draft, include audio timing `{clip.mp3@<start>-<end>}`; the slicer cuts it and strips the timing. `TEMPLATE` may carry an image but never a clip; `RESPONSE` audio only. |
| `IMAGE:` | **activity-level** in `$DIALOGUE` / `$SELECT` / `$PRODUCE` (before the first line/item); module header (cover) | Shared reference visual (diagram / map / scene) shown for **ALL** lines/items. Use it whenever every line/item refers to ONE visual (e.g. sentences about a map); an inline per-line `{page.jpg}` overrides it for that line. Per-item/per-line images are inline. |
| `SHOW_PROMPT` | `$SELECT`/`$PRODUCE` (flag) | Show the spoken `PROMPT` text from the start (the book printed the stimulus). DEFAULT: hidden until answered/revealed (a *soft* hide, not a hard lock). |
| `REPEAT` | `$DIALOGUE` (flag) | After listening, the learner should repeat each line aloud. |
| `EXAMPLE` | next item in `$SELECT`/`$PRODUCE` | Worked example, shown unblurred. |
| `TEMPLATE:` | `$SELECT` / `$PRODUCE` item | **On-screen text shown but never read aloud** — a cloze gap (`____`) or context/reading text the learner reads to answer. A `(cue)` in parentheses is shown, not spoken. A cloze stimulus with `____` must be a `TEMPLATE`, not a `PROMPT` (a clip-less `PROMPT` gets TTS — it would read the gaps aloud). |

Blur model (from v1): in `$PRODUCE`/`$SELECT`, prompts/answers are blurred until
the learner reveals or answers; `EXAMPLE` items are unblurred.

---

## 4. The types

### 4.1 `$DIALOGUE` — listen / read / repeat
Speaker-attributed dialog, example-sentence lists, vocabulary, and **reading
passages** (use `Narrator:` / bare `LINE:`, short lines, no `REPEAT`).

Spoken lines are **screenplay-style** — the speaker id is the line prefix
(`Cole: What must I do? {clip.mp3}`). The id is alnum/underscore with at least
one lowercase letter (ALL-CAPS is reserved for fields) and maps to a `VOICE:`
id. A bare `LINE:` continues the current speaker. There is no `SPEAKER:` field.

| Field | Req | Notes |
|---|---|---|
| `REPEAT` | No | Flag: listen, then repeat each line. |
| `IMAGE:` | No | Activity-wide reference image (map/scene) shown for **all** lines; place before the first line. Use when every line refers to one shared visual — don't attach it inline to just the first line. |
| `VOCAB:` | No | **One word/phrase per `VOCAB`** (repeatable before its line). Monolingual — the gloss is generated downstream. |
| `Speaker:` / `LINE:` | **Yes** | Target-language line — **keep to 1–2 sentences** so clips stay short. Inline `{image.jpg}` / `{clip.mp3}` at the end. |
| `NOTES:` | No | Tip shown under the line. |

A line shows its own inline `{image.jpg}`, or the activity-wide `IMAGE:` if it has
none — there is **no implicit carry-over** between lines. A story/scene panel that
illustrates several sentences is repeated explicitly on each of those lines.

### 4.2 `$GRAMMAR` — reference
Free-form markdown (headings, tables, lists). Phrases in `{curly braces}` become
tappable audio. Optional `INTRO`.

### 4.3 `$SELECT` — tap one or more options
Covers: True/False, a/b, multiple choice, Same/Different, sound-ID, categorize,
matching. Options may be **text** or **image**, and may be declared **once at the
activity level** (a shared pool) or per item.

| Field | Req | Notes |
|---|---|---|
| `INTRO` / `INSTRUCTION` | No | |
| `MULTI` | No | Flag: more than one correct option may be chosen. |
| `SHOW_PROMPT` | No | Show the spoken stimulus text from the start (book printed it). Default: hidden. |
| `IMAGE:` | No | Activity-level shared reference image (diagram/map), before the first item. |
| `OPTION:` | **Yes** (≥2) | `OPTION: <id> \| <text> {image.jpg} {clip.mp3}` — text and/or inline image, optional spoken clip. At activity level = shared pool; inside an item = overrides the pool. |
| `PROMPT:` | * | The spoken stimulus; inline `{image.jpg}` / `{clip.mp3}` at the end (text hidden by default — `SHOW_PROMPT` shows it). |
| `TEMPLATE:` | * | Display-only stimulus, never read aloud — cloze gap (`____`) or read-only context; may carry an inline `{image.jpg}`. An item needs a `PROMPT` and/or a `TEMPLATE`. |
| `ANSWER:` | **Yes** | Correct option id(s), e.g. `a` or `a,c`. |
| `FEEDBACK:` | No | Reveal-text — a fuller model and/or explanation. **Omit when it would just echo the chosen option.** |

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

### 4.4 `$PRODUCE` — produce an answer
Covers: imitation drills (say it → reveal), cloze, dictation, transformations,
and open-ended responses. Behavior is set by two orthogonal attributes.

| Attribute | Default | Values |
|---|---|---|
| `INPUT:` | `speak` | `type` · `speak` · `either` — the **initially proposed** input mode; the learner can always switch. The app shows a typed field for checkable items (`CHECK: exact`/`llm`) regardless; spoken answers are self-checked via reveal. |
| `CHECK:` | `reveal` | `reveal` (self-check), `exact` (normalized string match), `llm` (graded by model). |

| Field | Req | Notes |
|---|---|---|
| `INTRO` / `INSTRUCTION` | No | |
| `EXAMPLE` | No | Worked example, unblurred. |
| `IMAGE:` | No | Activity-level shared grounding image (one visual for all items), before the first item. |
| `PROMPT:` | * | Spoken/read stimulus (e.g. the question); inline `{image.jpg}` / `{clip.mp3}` at the end. |
| `TEMPLATE:` | * | On-screen text shown but not read aloud — cloze gap or context/reading text; may carry an inline `{image.jpg}`, never a clip. |
| `RESPONSE:` | **Yes** | The model/expected answer; append `{clip.mp3}` for a spoken model answer (audio only). For `CHECK: exact`, the string to match; for `reveal`/`llm`, the model/sample. |
| `ACCEPT:` | No | Extra accepted strings (`CHECK: exact`), `\|`-separated. |
| `RUBRIC:` | No | One-line grading guidance (`CHECK: llm`). |

\* an item needs at least a `PROMPT` or a `TEMPLATE`.

```
# Audio-lingual drill (defaults: speak + reveal)
$PRODUCE Answer the questions
PROMPT: Does Capt Collins wear his uniform to work?
RESPONSE: Capt Collins wears his uniform to work.

# Cloze (type + exact); TEMPLATE shown, (cue) not spoken
$PRODUCE The Smiths — past tense
INPUT: type
CHECK: exact
TEMPLATE: They ____ to Houston last month. (fly)
RESPONSE: flew

# Open response (llm), image-grounded, switchable input
$PRODUCE Ask and answer with "what"
INPUT: either
CHECK: llm
PROMPT: shoes
RESPONSE: What shoes did you wear yesterday? — I wore my new shoes.
```

### 4.5 `$CHAT` — open conversation
Unchanged from v1 (`SCENARIO`, `INITIAL_PROMPT`).

---

## 5. EBNF additions (sketch)

```
activity        = dialogue_activity | grammar_activity | select_activity
                | produce_activity | chat_activity ;

select_activity = "$SELECT" , ws , title , nl , { meta } ,
                  { option_line } ,                         (* activity-level pool *)
                  { select_item } ;
select_item     = [ "EXAMPLE" nl ] , prompt_field , [ prompt_t ] , [ audio ] ,
                  { option_line } , answer_field , [ feedback ] ;
option_line     = "OPTION:" , ws , id , ws "|" ws , value , [ ws , inline_asset ] , nl ;

produce_activity= "$PRODUCE" , ws , title , nl , { meta } ,        (* meta: INPUT, CHECK, ... *)
                  { produce_item } ;
produce_item    = [ "EXAMPLE" nl ] , ( prompt_field | template_field ) ,
                  [ prompt_t ] , [ audio ] , [ image ] ,
                  response_field , [ response_t ] , [ accept ] , [ rubric ] ;
```

Parser stays v1-consistent: uppercase keys/markers, split on first colon, `|`
separates multi-arg fields, flag lines (`REPEAT`, `SHOW_PROMPT`, `MULTI`,
`EXAMPLE`) have no colon, unknown lines ignored.

---

## 6. Scope: deferred & skipped

**Deferred** (Book 24 / advanced; revisit when we do the later books): multi-
sentence dictation, paragraph composition, sentence-sequencing, hierarchical
note-taking/outlines, passage annotation, diagram *labeling* (typed), punctuation
editing. (Comprehension MCQ over a passage, word-bank cloze, and diagram *MCQ*
are already covered by `$SELECT`/`$PRODUCE`.)

**Skipped** (not converted; downloadable PDF or dropped): homework sections,
alphabetizing, timed speed-reading ("circle the word same as the key"),
crossword/word-search, listening exercises whose stimuli we don't have,
group-discussion, character role-play (learner plays a part), reading-progress
charts.

---

## 7. Downstream (not format)

- **Parser** (`lc_parser.ts`): add `$SELECT`/`$PRODUCE` + the attributes; map the
  old `$EXERCISE` to `$PRODUCE` defaults.
- **App renderers**: select card; produce card (input/mic + reveal/exact/llm);
  `REPEAT` affordance on dialog cards.
- **Audio**: slice the per-figure cassette mp3 into per-line/per-item clips named
  by the pattern; the format only references filenames.
```
