# ALC DLI English Conversion Rules

## Overview

This guide explains how to convert American Language Course (ALC) DLI English units from markdown format to the structured module format (v2).

---

## Format v2 essentials

- Activity types: `$DIALOGUE`, `$GRAMMAR`, `$SELECT` (tap one or more options), `$PRODUCE` (produce an answer), `$CHAT`. There is **no `$EXERCISE`** — drills become `$PRODUCE`; multiple-choice / true-false / same-different / identification become `$SELECT`.
- **Monolingual:** do NOT write any translation (`*_T`) fields (`LINE_T`, `VOCAB_T`, `PROMPT_T`, `RESPONSE_T`). Target-language text goes in `LINE`/`PROMPT`/`RESPONSE`; instructions/intros are written in `HOME_LANG_G`. Translations are generated automatically downstream.
- `VOCAB:` takes one word/phrase per line (no `VOCAB_T`).
- `$PRODUCE` behavior: `INPUT:` (`speak` default · `type` · `either`) and `CHECK:` (`reveal` default · `exact` · `llm`). Audio-lingual repeat drills keep the defaults; use `INPUT: type` + `CHECK: exact` for cloze/dictation; use `CHECK: llm` for open answers.
- Flags (bare lines, no colon): `REPEAT` (dialogue), `MULTI` / `AUDIO_ONLY` (select), `AUDIO_ONLY` (produce dictation), `EXAMPLE` (next select/produce item).

---

## Important Conversion Rules

1. **Use "MODULE" instead of "UNIT"** in titles (e.g., "MODULE 1105" not "UNIT 1105")
2. **Preserve the unit structure/outline** at the beginning of the module
3. **Divide into lessons** based on the structure outline - each major topic should be a separate lesson
4. **Start every module from Lesson 1** (even if it's module 1105)

---

## Content Type Identification

**Identify the content type by its purpose:**

| Source Content | Convert To |
|----------------|------------|
| Main dialog / Basic sentences | `$DIALOGUE` |
| Conversational exchanges | `$DIALOGUE` |
| Example sentence lists | `$DIALOGUE` |
| Reading passages | `$DIALOGUE` (use `SPEAKER: Narrator`, short `LINE`s) |
| Substitution / transformation / repeat drills | `$PRODUCE` |
| Translation drills | `$PRODUCE` (`INPUT: type` if written) |
| Cloze / fill-in-the-blank | `$PRODUCE` (`TEMPLATE` + `CHECK: exact`) |
| Dictation | `$PRODUCE` (`INPUT: type`, `CHECK: exact`, `AUDIO_ONLY`) |
| Multiple-choice / true-false / same-different | `$SELECT` |
| Sound / minimal-pair identification | `$SELECT` (`AUDIO_ONLY`) |
| Grammar explanations / conjugation tables | `$GRAMMAR` |

---

## Example Conversions

### Dialogue

```
$DIALOGUE Basic Sentences
INTRO: These sentences introduce common greetings used in everyday English.
INSTRUCTION: Listen and repeat.
REPEAT

SPEAKER: A
LINE: Good morning.

SPEAKER: B
LINE: Good morning. How are you?
```

### Produce (drill with an example)

Use the `EXAMPLE` flag to show students how to do the drill:

```
$PRODUCE Substitution Drill
INTRO: In this drill, you'll practice replacing words in sentences.
INSTRUCTION: Replace the underlined word with the cue, then say the full sentence.

EXAMPLE
PROMPT: She is a teacher. (doctor)
RESPONSE: She is a doctor.

PROMPT: He is tall. (short)
RESPONSE: He is short.
```

### Select (multiple choice)

```
$SELECT True or False?
INSTRUCTION: Tap True or False.
OPTION: t | True
OPTION: f | False

PROMPT: A doctor works in a hospital.
ANSWER: t
```

---

## Lesson Organization

- Use lesson marker: `$LESSON Lesson X Topic Name`
- Number lessons sequentially (1, 2, 3, etc.)
- Every module MUST contain at least one `$LESSON` before its activities.

---

## Voice Configuration

Include voice configuration in the module header:

```
$MODULE MODULE 1105: Greetings and Introductions
DIOCO_DOC_ID: lc_alc_english_1105
DESCRIPTION: Basic greetings and introduction phrases in English.
TARGET_LANG_G: en
HOME_LANG_G: en

VOICE_DEFAULT: aoede | Speak clearly with a standard American accent
VOICE: A | achernar | Speak naturally with a standard American accent
VOICE: B | achird | Speak naturally with a standard American accent
VOICE_INTRO: aoede | Speak clearly and slowly
```

---

## Special Rules for ALC Content

### Outline Sections
If the original unit has an "OUTLINE AND STUDY OBJECTIVES" or similar section, include it at the very start as a `$GRAMMAR` section or as module description.

### Sound and Intonation
Sound and intonation practice sections become `$DIALOGUE` for listen-and-repeat, `$SELECT` for sound identification, or `$GRAMMAR` for explanations.

### Review Sections
Review drills covering multiple modules should be organized as a separate lesson.

---

## Content Guidelines

### DO:
- Preserve all original content
- Keep vocabulary in context (`VOCAB` entries, one word/phrase each)
- Maintain the pedagogical sequence
- Include all drill variations
- Use `EXAMPLE` for the first item in transformation drills
- Mark examples in grammar sections appropriately

### DO NOT:
- Write any translation (`*_T`) fields — modules are monolingual
- Use `$EXERCISE` — use `$PRODUCE` or `$SELECT`
- Add memory tricks or mnemonics
- Add "Practice Tips" or "Common Errors" sections
- Include meta-commentary about learning strategies
- Skip any drills or exercises
- Combine separate drills into one
