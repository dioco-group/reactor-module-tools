# ALC → Module Format Conversion Notes

How to convert **American Language Course (ALC)** materials — the **Language
Laboratory Activities (LLA)** lab books and the **Student Texts (ST)** — into the
v2 module format (`module_format_v2_proposal.md`). This is the ALC analog of
`configs/fsi-french/prompt.md` and the basis for each `configs/<alc-course>/prompt.md`.

This document deliberately explains **why** each rule exists, not just the rule.
The whole approach was derived by reading ALC Book 4 (LLA + ST) and Book 24
figure-by-figure and validated by converting Lessons 1A, 3A, and ST Lesson 4
(`module-convert/format-comparison/`).

Audience: **Russian-speaking learners**. Modules are **monolingual English**
(format v2): `TARGET_LANG_G: en`, `HOME_LANG_G: en`. Write English only and do NOT
emit any translation (`*_T`) fields — Russian is generated automatically downstream.

---

## A. The two foundational insights

### A1. The book is a scaffold; the tape is the content (LLA)
**Rule:** convert each LLA figure from the **book markdown AND its tape transcript
together** (`data/<course>/transcripts/Lesson XX/FigureNN.txt`).

**Why:** the printed lab page is usually just pictures, blank lines, and option
rows. The actual activity — the questions asked, the model answers to repeat, the
stimuli to discriminate, the "now check your answers" keys — exists **only on the
cassette**. Converting from the book alone produces empty shells. (Concretely:
Book 4 Lesson 1A Figure 4 prints four bare statements; the question→answer drill
that makes it an exercise is entirely on the tape.)

Consequences of this insight:
- **Pull questions, model answers, and answer keys from the tape.**
- **Collapse the tape's repetition** ("Tennis. Tennis." / echoed model lines) —
  it's a recording artifact, not content.
- **Fix ASR errors using the book** ("Add your book" → "Open your book"; "J" →
  "jay"). The book is the spelling/wording authority; the tape gives *timing* and
  the spoken drill.
- **Prefer a printed answer key** (e.g. "ANSWERS FOR LESSON 1D") over parsing the
  tape's spoken "check your answers", when the book has one.

The ST is more self-contained (FSI-like), **except** its Listening-Skill sections
are scaffolds whose stimuli are only on the instructor tape — see SKIP.

### A2. A figure is presentation + task; split it into single-purpose cards
**Rule:** one source figure may become **several** activities.

**Why:** the app is a swipe-through deck of single-purpose cards. A figure that
"presents a passage, then asks comprehension questions" is two things — render it
as a `$DIALOGUE` (the passage) followed by a `$SELECT`/`$PRODUCE` (the questions).
Forcing one figure into one activity would either bloat a card or lose the task.

### A3. Convert EVERY item — never sample or truncate a list
**Rule:** emit one activity item (or `LINE`) for **every** item present in the
tape/book. If the tape counts "Number 1 … Number 15", the activity has **15**
items. If the alphabet section reads A–G, that's 7 letters. Do not stop early,
summarize, or produce a "representative" subset.

**Why:** these drills are long and repetitive, and an LLM's instinct is to show
a few and imply the rest — but the learner needs all of them. The tape's spoken
**"Number N" cues are the authoritative count**: the highest N is how many items
there must be. Before finishing a `$SELECT`/`$PRODUCE`/`$DIALOGUE`, check the
last "Number N" in its transcript and confirm your item count matches. (Concretely:
Book 1 Lesson 1A Figure 3 "identify the letter" has Number 1–15 → 15 items, not 6;
Figure 7 has 16; Figure 4 dictation has 10.)

---

## B. Why 5 types (and how to choose one)

We kept inventing markers (`$QUIZ`, `$MATCH`, `$CLOZE`, `$DICTATION`, `$RESPOND`,
`$READING`) that differed only by *input* or *grading*. The elegant model is
**type = the renderer the app must build; everything else = an attribute.** That
collapses to five:

| If the learner… | use | because |
|---|---|---|
| listens / reads / repeats | `$DIALOGUE` | one renderer for lines+audio+vocab; reading passages are just short speaker-less lines |
| reads reference/tables | `$GRAMMAR` | markdown reference renderer |
| **taps** one or more options | `$SELECT` | options grid; covers T/F, MCQ, S/D, sound-ID, categorize, **and matching** (shared option pool) |
| **produces** an answer | `$PRODUCE` | input/mic + check; covers imitation drills, cloze, dictation, open response |
| converses with the AI | `$CHAT` | chat renderer |

**`$SELECT` vs `$PRODUCE` field names are deliberately different:** `$SELECT` has
`ANSWER` (the correct **option id**); `$PRODUCE` has `RESPONSE` (the **produced
text** / model). "Which option" and "the words you produce" are different things;
distinct names keep them from blurring.

**`$PRODUCE` is one type with two orthogonal axes** (`INPUT: type|speak`,
`CHECK: reveal|exact|llm`) **because** imitation drills, cloze, dictation, and
open answers are all "produce an answer" — they differ only in how you enter it
and how it's judged. Defaults (`speak`/`reveal`) make the dominant ALC oral drill
need *zero* attribute lines, so it reads as simply as the old `$EXERCISE`.
`INPUT` must mirror the ALC original modality — **don't use `either`**: the tape
has the learner *say* it → `INPUT: speak`; the book has them *write* it →
`INPUT: type`.

**`$MATCH` was dropped into `$SELECT`** because matching is just "tap from a
shared set of options"; declaring the option pool once at the activity level gives
`$SELECT` the same expressiveness without a second marker.

---

## C. Source element → marker (quick table)

| ALC source element | Marker |
|---|---|
| "Repeat the words/sentences" (vocab, pictures) | `$DIALOGUE` `REPEAT` |
| "Repeat" letters / numbers / lists | `$DIALOGUE` `REPEAT` |
| 2-speaker dialog ("listen… then repeat") | `$DIALOGUE` `REPEAT` (screenplay `Id:` lines) |
| Reading passage / paragraph / story | `$DIALOGUE` (`Narrator`, short LINEs, **no** `REPEAT`) |
| Grammar explanation / table | `$GRAMMAR` |
| Circle T/F · a/b · MCQ | `$SELECT` |
| Same/Different · sound-ID | `$SELECT` (shared pool; prompt hidden by default) |
| Categorize · "write A/B/C" by sound | `$SELECT` (`MULTI` if several per bucket) |
| Match sentence→picture / item→letter | `$SELECT` (shared pool) |
| "Answer the questions. Repeat the answers." (learner **says** the answer) | `$PRODUCE` (speak/reveal) |
| Listen → **choose** the correct statement/answer (even if printed "answer the questions") | `$SELECT` |
| Transformation / substitution drill | `$PRODUCE` (speak/reveal) |
| "Write the word/verb form" / cloze (one answer) | `$PRODUCE` (type/exact, `TEMPLATE`) |
| Ask & answer w/ example · picture Q&A · "what" Qs | `$PRODUCE` (speak/llm; title-line `{image}` if picture-cued) |

---

## C2. INTRO & INSTRUCTION (from the tape framing)

The tape opens most figures with framing speech ("Look at Figure 1, these are
different things to play games with. Let's repeat the new words."). Mine it:

- **INTRO** = what the activity is *about* + what to do, in your own words. It is
  **spoken (TTS) and translated** to the learner's language. Keep it 1–3 sentences.
  *Why:* sets context before the cards; it's the only place spoken guidance can go
  for activities that have no per-line tape clip (e.g. sound-ID procedure).
- **INTRO is heard BEFORE any activity content is visible.** It must stand alone:
  never point at things on screen ("These are…", "Look at the map/Figure N",
  "the prices under the pictures"). Describe what's *coming* instead:
  "You're going to learn new words for…", "You'll see a map of Texas…".
- **INSTRUCTION** = a short on-screen reminder shown during the activity; **not
  read aloud**. One line ("Listen and tap the correct picture.").
- **DISCARD boilerplate**: course/lesson announcements ("American Language Course,
  Book 4, Lesson 1A", "Hello, open your book to the activities…"), and **paper-only
  framing** — references to *the book*, *circling*, *writing the number on the line*,
  or *letters A/B as printed* — none of that applies in the app. Re-express the
  intent (e.g. "circle the letter" → "tap the sound you hear").

---

## D. Per-type rules (with reasoning)

### `$DIALOGUE`
- `REPEAT` for "listen and repeat" figures; **omit** for reading passages.
  *Why:* the app needs to know whether to prompt the learner to speak back.
- **One word per `VOCAB`** line (repeatable). *Why:* each is a dictionary unit;
  the app glosses/links them individually. (Monolingual — no `VOCAB_T`; the gloss
  is generated downstream.)
- **Emit `VOCAB` ONLY when the source explicitly presents a word as new** — the
  book **underlines/bolds** it, lists it on a preview/vocabulary page, or the tape
  says "new word: …". Do NOT invent `VOCAB` for ordinary words just because they
  appear in a sentence or seem new. *Why:* `VOCAB` means "this is a vocabulary
  item being taught here"; tagging incidental words (please, classroom, name)
  with no basis creates false dictionary units. When in doubt, omit `VOCAB`.
- **One line = 1–2 sentences**; split long paragraphs; use `Narrator:` (then bare
  `LINE:`) for passages. *Why:* the inline `{clip}` is one clip per line — long
  lines make playback cumbersome and reading harder.
- **Keep one speaker's consecutive short turn on a SINGLE line — don't split it.**
  When the same speaker says two short things in a row (e.g. Aldo: "Hello." then
  "How are you?"), write them on one line (`Aldo: Hello. How are you? {clip}`),
  NOT a second bare `LINE:`. *Why:* each line is its own card; splitting a single
  natural turn makes playback "bitty". Give the line ONE clip spanning the whole
  turn (combine the slices if the tape cut them separately).
- **Drop the "now read X's lines" role-play tail.** *Why:* learner-plays-a-role is
  real software complexity for marginal gain; listen+repeat captures the value.

### `$GRAMMAR`
- Include explanations/tables verbatim; wrap target phrases in `{braces}` for
  tappable audio. *Why:* reference content shouldn't be lossy-summarized.
- **Faithful only — reproduce, don't author.** Don't *add* explanatory prose the
  source lacks (just as you don't summarize away what it has). Expanded teaching
  is layered in later at the master-combination stage. (Note the asymmetry with
  ST: the LLA **tape** narrates real intros, so mining them into `INTRO` is
  faithful; the ST has no tape, so ST `INTRO` is omitted, not invented.)

### `$SELECT`
- **Shared option pool** at activity level when options repeat (S/D, a/b, T/F, a
  picture set). Per-item `OPTION` only when choices differ. *Why:* avoids
  repeating the same six pictures on every item.
- **Hidden prompt text is the DEFAULT — follow the BOOK with `SHOW_PROMPT`.**
  A spoken stimulus (`PROMPT`) is normally tape-only, so its text stays hidden
  until answered/revealed (a **soft** hide — peeking is discouraged, not
  forbidden). Only when the book also PRINTED the stimulus text, add the
  `SHOW_PROMPT` flag to show it from the start. *Why:* this preserves each
  exercise's original difficulty — picture-ID, Q&A exchanges, and
  situation+question figures are listening tasks by design, and printed
  stimuli usually belong in `TEMPLATE` anyway.
- `ANSWER` from the book key / tape "check your answers".
- **Cloze stimulus → `TEMPLATE`, not `PROMPT`.** A gapped sentence (`Linda works
  ____.`) can't be read aloud — and a clip-less `PROMPT` gets TTS, which would
  voice the gaps. Use `TEMPLATE` (shown, never spoken); the spoken completed
  sentence rides the correct option inline. An item may also combine a spoken
  `PROMPT` (with its `{clip}`) and a read-only `TEMPLATE`.
- `FEEDBACK` **only when it explains** or gives a fuller model; **omit** if it just
  echoes the tapped option. *Why:* redundant feedback is noise.
- Instructions say **"Tap"**, never "Circle". *Why:* there is no circling in the
  app; map the print verb to the real interaction.

### `$PRODUCE`
- Defaults `INPUT: speak`, `CHECK: reveal` → the standard oral drill needs no
  attribute lines; `RESPONSE` is the model ("Repeat: …").
- `TEMPLATE` = **on-screen text shown but never read aloud**. Two uses:
  (a) a cloze gap to fill (`INPUT: type`, `CHECK: exact`, `RESPONSE` = the word,
  `ACCEPT` for alternates), and (b) **context/reading text** the learner must read
  to form the answer when it isn't on the tape. Keep `PROMPT` = the spoken
  stimulus (with its inline `{clip}`); put the read-only sentence in `TEMPLATE`.
- Open-ended: `CHECK: llm`, `INPUT: speak` (the ALC drill is oral; use `type` only
  when the book has the learner write), `RESPONSE` = a **sample**, `RUBRIC`
  optional, title-line `{image}` if picture-grounded. *Why:* there's no single right answer; the
  model judges against the rubric.
- When the learner reads a context sentence (not on the tape) to answer a spoken
  question (ALC 1A Fig 4): `PROMPT` = the spoken question (with its inline `{clip}`),
  `TEMPLATE` = the context sentence to read, `RESPONSE` = the answer. Do NOT fold
  the read sentence into `PROMPT` (it isn't spoken).

---

## E. Cross-cutting

- **Audio = a cassette clip, attached INLINE** as a trailing `{clip.mp3}` on a
  `LINE`/`PROMPT`/`RESPONSE`/`OPTION` (pattern `bk<NN>-l<lesson>-f<fig>-<item>.mp3`),
  played in full. In a **draft** include the timing — `{clip.mp3@<start>-<end>}` — and
  the slicer cuts it and strips the timing. *Why:* one clip per text, no fragile in-app
  timestamping; per-line (not per-figure) keeps each clip short and tied to what's on
  screen. Use the **real cassette** audio; only use TTS (no `{}`) where we restructured
  the item so the recording no longer matches.
- **A clip covers ONLY the spoken text it rides** — pick the timing range tightly
  around that sentence. **Exclude** from the range: the spoken reading of `VOCAB`
  words (vocab gets TTS, not the tape), counting cues like "Number 1"/"Number 5", and
  any spoken instructions/boilerplate. *Why:* the clip must match exactly what's on the card.
- **Two-pass tapes:** discrimination and Q&A figures often read the items TWICE
  (a "listen" pass, then a numbered second pass) and sometimes a third
  check-your-answers pass. Take item clips from **one pass consistently** (prefer
  the cleaner numbered pass); fall back to another pass only for an item that
  pass skips. *Why:* mixing passes invites wrong-occurrence timings on repetitive
  drill audio.
- **NEVER cut item clips from a check-your-answers pass that SPEAKS the answer**
  ("Number one **is A**, repeat, studied") — the audio gives the answer away
  (1D Fig 6). Use the test pass; if an item is missing there, trim the check-pass
  range to ONLY the content word(s), excluding the "is A, repeat" framing.
- **`$SELECT` option audio:** when the tape speaks the answer (e.g. the model answer
  after a question), attach it inline to the correct option's text (`OPTION: <id> |
  <text> {clip.mp3}`) so the app can play it after the tap. If there's no clip for an
  option, leave it without `{}` — that's fine (we don't synthesize TTS for options).
- **Images:** reference the extracted `page_XXX_YYY.jpg` by bare filename. A
  complex visual (calendar, labeled diagram, map) belongs as an **image**, not an
  HTML table.
- **Per-line vs activity-wide images:** an inline `{page.jpg}` on a line/PROMPT shows
  the image only for THAT line/item. When the figure has **one reference visual that
  every line/item refers to** (a map, calendar, scene, or labeled diagram — e.g. the
  Figure-5 Texas map), declare it once on the **activity marker title line** instead:
  `$DIALOGUE Texas Map {page_XXX_YYY.jpg}` (likewise `$SELECT …`, `$PRODUCE …`).
  It stays on screen for all lines/items, and an inline per-line `{page.jpg}` still
  overrides it for that line.
  *Why:* attaching the shared visual to only the first line makes it vanish for the
  rest of the activity, exactly when the learner needs it.
- **A per-item picture must show for BOTH the question and the answer.** When one
  item's picture is what the Q&A is about (e.g. "What's that?" → "It's a book."
  over a book drawing), put the same inline `{page.jpg}` on BOTH cards: on the
  question and the answer LINEs of a `$DIALOGUE`, and on both the `PROMPT` and the
  `RESPONSE` of a `$PRODUCE` item. *Why:* the picture is the referent for the whole
  exchange — it must stay visible while the learner hears the question, answers,
  and sees the answer; on only one card it disappears at the wrong moment.
- **No raw HTML**; flatten flex/side-by-side layouts to linear markdown.
- **Don't** emit printed page numbers, tape/figure numbers as content, or
  "(recorded)/(not recorded)" notes.

---

## F. SKIP — and why

Not converted (ship as a downloadable PDF, or drop):
- **Homework** — it's separate take-home work, not interactive study.
- **Alphabetizing**, **timed speed-reading** ("circle the word same as the key") —
  low language value, and need timers/paper, not a card UI.
- **Crossword / word-search** — grid puzzles need their own renderer for little
  gain.
- **Listening exercises whose stimuli we don't have** (most ST Listening-Skill
  blocks) — the words are only in the instructor manual.
- **Group discussion / instructor-led closed-book oral** — not self-study.
- **Character role-play** (learner plays a part) — software complexity.
- **Reading-progress / WPM charts** — learner meta, not a drill.

## G. DEFER — and why

The **writing / composition / note-taking family** (multi-sentence dictation,
paragraph composition, sentence sequencing, hierarchical outlines, passage
annotation, typed diagram labeling, punctuation editing) is concentrated in
Level-IV (Book 24), is awkward on a phone, and is out of current scope. Revisit
when we tackle the later books. *(Note: passage-comprehension MCQ, word-bank
cloze, and diagram MCQ are NOT deferred — they already map to `$SELECT`/`$PRODUCE`.)*

---

## H. Lessons, naming, completeness

- One `$LESSON` per ALC sub-lesson/tape (1A, 1B…) or sub-topic; title from the
  source ("Lesson 3A: Clothes and Uniforms").
- The module title (on the `$MODULE` line) is always descriptive — `Lesson <NX>: <short topic>`
  ("Lesson 1B: Past Tense Verbs and Vowel Sounds"), never a bare "Lesson 1B".
- A split figure keeps a shared title across its activities ("Figure 1: …").
- Preserve pedagogical order; convert **all** content except the SKIP/DEFER lists.

## J. Activity-shaping patterns (worked, Lesson 1A)

**Choose `$SELECT` vs `$PRODUCE` by what the learner does, not by the printed
"Answer the questions" heading:** if they pick among given statements/pictures →
`$SELECT`; only if they must produce the words (say/type) → `$PRODUCE`.

- **Vocab + example sentences (Fig 1).** `$DIALOGUE REPEAT`. Each picture's sentence
  is a `LINE` with its image and a clip of **just that sentence** (not the vocab
  reading). List the new words as `VOCAB` before their `LINE`. The app reads the
  vocab, pauses for the learner, then reads the line; on repeat/return it replays
  the line only.
- **Listen → identify the picture (Fig 2).** `$SELECT` (prompt hidden by default), shared image
  pool. Give each option an image **and** a short text caption on ONE line
  (`OPTION: a | ball {page_008_001.jpg}`) — captions help when words are new.
  Clips exclude "Number N".
- **A figure with an "answer my questions" production pass → an ADDITIONAL `$PRODUCE`.**
  Many tapes, after the identify pass + answer-check pass, have a third pass:
  "Now answer the questions. Number 1. What's letter B? … (pause) … It's a pencil.
  Repeat. It's a pencil." Don't drop it — emit it as a SECOND activity (`$PRODUCE`)
  after the `$SELECT`: each item's `PROMPT` is the spoken question ("What's letter
  B?", with its `{clip}` and the SINGLE relevant item's `{image}`), and `RESPONSE`
  is the model answer ("It's a pencil.", with its `{clip}`). The picture goes on
  the prompt so the learner can answer; CHECK defaults suit a guided answer. *Why:*
  the identify pass tests recognition; this pass tests production — both are real
  activities the figure provides (see A2/A3).
- **`REPEAT` on `$SELECT`/`$PRODUCE` when the tape says "Repeat" after the model.**
  ALC's drill loop is elicit → model → repeat: "What's letter B? … It's a pencil.
  **Repeat.** It's a pencil." When that reinforcement beat is present, add the
  bare `REPEAT` flag to the activity (just like `$DIALOGUE REPEAT`). It tells the
  player to replay the model answer and prompt the learner to say it back (not
  assessed). Activity-level: one flag covers all items. Omit it when the tape
  doesn't ask the learner to repeat the answer.
  Also applies to **word-recognition** `$SELECT` whose tape says "<word>.
  **Repeat: <word>.** Circle <word>." (Fig 1 style) — the learner identifies the
  word, then repeats it. Add `REPEAT` and put the spoken word on the PROMPT; the
  correct option carries the spoken model inline so it plays on the tap.
- **Letter/symbol legends → make the option TEXT the real answer, not the
  letter.** When the book says "Circle letter A for the P sound (as in put),
  letter B for the B sound (as in buy)", the A/B are just printed labels. Emit
  the legend as the option text (`OPTION: a | P sound (as in put)`) and write a
  learner-facing instruction that names the choices, NOT the letters — say "Tap
  the sound you hear", never "Tap A … Tap B …". *Why:* the player shows the
  answers as tappable choices; there are no A/B buttons, so letter references
  are dead instructions. The `a`/`b` survive only as internal option ids.
- **EXAMPLE-item clips must contain ONLY the example stimulus** — never the
  spoken instruction/lead-in that precedes it. The tape's worked example is
  introduced by apparatus ("Listen to the example.", "Number…", "Circle the
  letter."); the `EXAMPLE` clip's `@start-end` must start at the stimulus word
  itself, not at that framing. *Why:* otherwise the example plays a sentence of
  instructions before the one sound/word the learner is meant to hear. (The
  word-level refine pass trims lead cues, but pick the tightest range you can.)
- **Hear a Q&A → choose the correct statement, then repeat (Fig 3).** `$SELECT`:
  `PROMPT` = the recorded question+short answer; options = the candidate statements
  ("John likes…" / "John doesn't like…"); attach the spoken model inline to the
  correct option's text (`OPTION: <id> | <text> {clip.mp3}`). If the tape also has
  third-person model exchanges, add a following `$DIALOGUE REPEAT` that reuses that audio.
- **Read a cue/context, answer a spoken question (Fig 4).** `$PRODUCE`: `PROMPT` =
  spoken question (with its inline `{clip}`), `TEMPLATE` = the read-only cue/context,
  `RESPONSE` = the answer.
- **Numbered-picture drills → put the referent in `TEMPLATE`.** When the question
  uses a deictic ("What is **that**?" / "What's **it**?") that points at a numbered
  item in the activity-wide picture, the learner can't tell which one it is. Put
  the tape's pointer in `TEMPLATE` (`TEMPLATE: Number 3`) so the item is grounded.
  *Why:* the activity-wide title-line image shows all the numbered objects; without
  the number, "that" is ambiguous. Take the number from the tape's "Look at number N" cue.
- **Sentences about one shared visual (Fig 5).** `$DIALOGUE REPEAT` with the map/scene
  as an **activity-wide image on the title line** (`$DIALOGUE Texas Map {page_XXX.jpg}`)
  so it stays visible for every line — NOT inline on just the first line.
- **Listen to short sentences → answer a comprehension question by choosing (Fig 6).**
  `$SELECT` (not `$PRODUCE`): `PROMPT` = the spoken context+question; options = the
  candidate answers; the app can play the correct option's clip after the tap.
- **Sound discrimination / minimal pairs (Fig 7).** The *procedure and the example*
  live on the tape and reference paper actions — put the explanation in `INTRO`
  (spoken+translated; drop book/circle/letter references). Each test word is a
  `$SELECT` item with its clip inline on the `PROMPT` (hidden by default), options the two sounds.
- **Narration + comprehension (Fig 8).** Split the narration into **one `LINE` per
  sentence** (≈16). The story panels are separate images (see book markup notes);
  attach each panel inline to **every line of the span it illustrates** (repeat the
  same `{page.jpg}` — there is no carry-over between lines).
  The follow-up is a `$SELECT`: each item's gapped sentence
  is a `TEMPLATE` (display-only — never a `PROMPT`); the spoken completed sentence
  rides the correct option, so the app can replay it after the tap.

## J2. Activity-shaping patterns (worked, Lesson 1B)

- **Word lists in columns (1B Fig 1).** A figure of words grouped by category
  (e.g. -ED endings by sound: /d/, /t/, /ɪd/) becomes **one `$DIALOGUE REPEAT` per
  column** ("Figure 1: -ED Endings — the D Sound") with **ONE LINE PER WORD**, each
  with a clip of just that word from the tape's REPEAT pass. NEVER one line carrying
  a 20-second multi-word clip — the per-word pauses on the tape are repeat time, not
  content. Cross-check the lines against the book's printed column: the ASR
  transcript may silently drop a word the tape actually reads.
- **Cloze: where does the answer come from?** Two different drills share the
  gapped-sentence look — place the clip accordingly:
  - **Cue-based** (1B Figs 2–4: the book prints `(visit)` and the learner
    transforms it): the tape sentence is the *model answer* → clip rides the
    `RESPONSE` (played at reveal).
  - **Listen-and-fill** (1D Fig 2: no printed cue — the missing words exist
    ONLY on the tape): the tape sentence is the *stimulus* → clip rides a
    `PROMPT` carrying the full sentence (text hidden by default, so the audio
    plays on card entry without spoiling the gap), and the `RESPONSE` repeats
    the sentence for the reveal/exact check. A clip on the RESPONSE alone
    leaves the learner with NO source for the answer.
- **Written cloze + spoken model sentences (1B Figs 2–4).** When the book says
  "write the verb forms" and the tape "repeats the answers" as full sentences:
  `TEMPLATE` = the gapped sentence with its `(cue)`, `RESPONSE` = the **full model
  sentence** (so the revealed text matches the clip), `ACCEPT` = the bare word(s)
  the learner actually types:
    TEMPLATE: Danny ____ his friends in Dallas last year. (visit)
    RESPONSE: Danny visited his friends in Dallas last year. {clip.mp3}
    ACCEPT: visited
  Items the tape skips keep the full-sentence `RESPONSE` without a clip (TTS reads it).
- **The tape's worked example becomes an `EXAMPLE` item (1B Figs 5/7).** When the
  tape demonstrates ("Listen to the example: pot."), emit an `EXAMPLE` item with
  that clip — the app plays it and answers it automatically. Don't bury the
  demonstration in the `INTRO` text alone. An `EXAMPLE` item carries the **same
  `TEMPLATE` scaffolding as the regular items** (e.g. the `Yes, ____.` cue) so it
  demonstrates exactly what the learner will see.
- **Dictation (1D Fig 7).** `PROMPT` = the dictated sentence itself with its clip
  (the text is hidden by default, so nothing is spoiled — NEVER a placeholder
  like "Sentence 1": prompt text must always match the audio). `RESPONSE` = the
  same sentence (it is the exact-check target), `ACCEPT` for contraction
  variants ("Do not ..."). `INPUT: type`, `CHECK: exact`. The app skips the
  redundant response card when RESPONSE equals PROMPT — the reveal happens in
  place.
- **An instruction is never a spoken `PROMPT` (1D Fig 1).** When a `$SELECT` item
  has no real spoken stimulus (e.g. "tap the five languages you heard"), put the
  question as a display-only `TEMPLATE` — a clip-less `PROMPT` would be TTS-read
  as if it were content.
- **Book speaker names vs tape voices (1D Fig 4).** The book's printed dialogue
  names regularly don't match the tape's voice casting (the book's "Jim" was a
  woman on tape — renamed "Kim" with a female voice). At review time, sanity-check
  each speaker's clips against the voice gender, and pick speaker ids + `VOICE:`
  genders that match what the learner HEARS, not what the book prints.
- **Reference info the learner answers FROM must be on screen (1C Fig 5).** When
  the book prints a data table/list the items quiz (who played what, a schedule),
  that information exists ONLY in the book — never assume "the tape gives it".
  Put it in the module: a compact display-only `TEMPLATE` repeated on **every**
  item (`TEMPLATE: Margaret — soccer · Carl — soccer · …`), or the activity-wide
  image on the marker title line when it's a visual. Without it the items are unanswerable.

## I. Worked references
- `module-convert/format-comparison/1A.new.module` — LLA Lesson 1A
- `module-convert/format-comparison/3A.new.module` — LLA Lesson 3A
- `module-convert/format-comparison/ST-L4.new.module` — Student Text Lesson 4
- `data/alc-lla-4/module/lesson-1B.module` — LLA Lesson 1B (word columns, cloze
  with full-sentence responses, EXAMPLE items, per-line panel images)
