# ALC LLA → Module Format — LLA track notes (cassette audio)

How to convert **Language Laboratory Activities (LLA)** lab lessons — the ALC
books that **have cassette audio** — into the v2 module format (`module_format.md`).

**Read `alc_common.md` first** — it has the track-agnostic core (the 5 types and
how to choose, presentation+task split, convert-every-item, INTRO/INSTRUCTION,
images, SKIP/DEFER, titles/naming, output rules). This file is only the **LLA
delta**: the cassette is the real content, so it adds the audio/clip rules and the
worked tape-based examples. (The Student Text has no tape — see `st_notes.md`.)

Sections A–C are the LLA rules; D–E are worked figure-by-figure patterns; F lists
reference modules.

---

## A. The book is a scaffold; the tape is the content

Convert each LLA figure from the **book markdown AND its tape transcript together**
(`data/<course>/transcripts/Lesson XX/FigureNN.txt`). The printed lab page is
usually just pictures and option rows; the real activity — the questions, the model
answers, the stimuli, the answer keys — is **only on the cassette**, so the book
alone yields empty shells.

So:
- **Pull questions, model answers, and answer keys from the tape.**
- **Collapse the tape's repetition** ("Tennis. Tennis." / echoed model lines) —
  it's a recording artifact, not content.
- **Fix ASR errors using the book** ("Add your book" → "Open your book"; "J" →
  "jay"). The book is the spelling/wording authority; the tape gives *timing* and
  the spoken drill.
- **Prefer a printed answer key** (e.g. "ANSWERS FOR LESSON 1D") over parsing the
  tape's spoken "check your answers", when the book has one.
- **The tape's "Number N" cues are the authoritative item count** (see "convert
  EVERY item" in `alc_common.md`): the highest N is how many items there must be.

---

## B. INTRO comes from the tape framing

The tape opens most figures with framing speech ("Look at Figure 1, these are
different things to play games with. Let's repeat the new words."). **Mine it** for
the `INTRO` — re-expressed in your own words, spoken+translated, 1–3 sentences,
standing alone (see the INTRO rules in `alc_common.md`).

- **DISCARD boilerplate**: course/lesson announcements ("American Language Course,
  Book 4, Lesson 1A", "Hello, open your book to the activities…"), and **paper-only
  framing** — references to *the book*, *circling*, *writing the number on the line*,
  or *letters A/B as printed*. Re-express the intent (e.g. "circle the letter" →
  "tap the sound you hear").

---

## C. Audio / clip rules (LLA-only)

- **Audio = a cassette clip, attached INLINE** as a trailing `{clip.mp3}` on a
  `LINE`/`PROMPT`/`RESPONSE`/`OPTION` (pattern `bk<NN>-l<lesson>-f<fig>-<item>.mp3`),
  played in full. In a **draft** include the timing — `{clip.mp3@<start>-<end>}` — and
  the slicer cuts it and strips the timing. *Why:* one clip per text, no fragile in-app
  timestamping; per-line (not per-figure) keeps each clip short and tied to what's on
  screen. Use the **real cassette** audio; only use TTS (no `{}`) where we restructured
  the item so the recording no longer matches.
- **At most ONE audio clip per line — never two.** When the tape has a question AND a
  model answer, the question clip goes on the PROMPT and the answer clip goes on the
  RESPONSE (or on the correct OPTION in `$SELECT`). Never stack both on the PROMPT.
- **A clip covers ONLY the spoken text it rides** — pick the timing range tightly
  around that sentence. **Exclude** from the range: the spoken reading of `VOCAB`
  words (vocab gets TTS, not the tape), counting cues like "Number 1"/"Number 5", and
  any spoken instructions/boilerplate. *Why:* the clip must match exactly what's on the card.
- **A clip must come from the figure the item belongs to.** NEVER attach clips from
  the next figure's tape to the last item of the current activity. Don't invent timings.
- **Do NOT attach a clip to text NOT spoken on the tape** (TEMPLATE context,
  restructured prompts, `$GRAMMAR`). A cloze stimulus with `____` must be a `TEMPLATE`
  (display-only), never a `PROMPT` — a clip-less `PROMPT` gets TTS, which reads the gaps.
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
- **`ANSWER`** comes from the book key / tape "check your answers".
- When the learner reads a context sentence (not on the tape) to answer a spoken
  question (ALC 1A Fig 4): `PROMPT` = the spoken question (with its inline `{clip}`),
  `TEMPLATE` = the context sentence to read, `RESPONSE` = the answer. Do NOT fold
  the read sentence into `PROMPT` (it isn't spoken).

---

## D. Activity-shaping patterns (worked, Lesson 1A)

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
  activities the figure provides (see "presentation + task" in `alc_common.md`).
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

## E. Activity-shaping patterns (worked, Lesson 1B)

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

## F. Worked references
- `module-convert/format-comparison/1A.new.module` — LLA Lesson 1A
- `module-convert/format-comparison/3A.new.module` — LLA Lesson 3A
- `module-convert/format-comparison/ST-L4.new.module` — Student Text Lesson 4
- `data/alc-lla-4/module/lesson-1B.module` — LLA Lesson 1B (word columns, cloze
  with full-sentence responses, EXAMPLE items, per-line panel images)
