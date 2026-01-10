# FSI French Conversion Rules

## Overview

This guide explains how to convert FSI (Foreign Service Institute) French course materials from markdown format to the structured module format.

Each module corresponds to one Unit from the original FSI course (e.g., Module_01 = Unit 1).

---

## Key Format Rules

- Use `$LESSON Title` (no colon) - title on same line
- Use `$DIALOGUE Title`, `$EXERCISE Title`, `$GRAMMAR Title` (no colons)
- Use `LINE_T` for translations (not TRANSLATION)
- Use `VOCAB` and `VOCAB_T` for vocabulary items
- Voice names are case-insensitive and must not contain spaces (e.g., `aoede`, `achernar`)

---

## INTRO vs INSTRUCTION

**INTRO**: Shown/read to the student *before* the activity starts. Frames what they will do and why. Can set the scene for a dialogue. Keep concise - a few sentences max.

**INSTRUCTION**: Shown at the top of screen *during* the activity. Brief reminder of what to do. Keep short for mobile screens.

Example:
```
$DIALOGUE Dans la rue
INTRO: Mr. Lelong and Mrs. Durand meet on the street. Listen to their conversation and pay attention to the formal greetings.
INSTRUCTION: Listen and repeat each line.
```

---

## CRITICAL: Preserve ALL Original Instructions

**The most important rule: Copy ALL instructions EXACTLY as they appear in the source file.**

Every lesson has:
1. **Lesson-level instruction** (the **Instructions:** paragraph at the start of each lesson)
2. **Section instructions** (the *Instructions:* for dialogues, drills, grammar notes)
3. **Drill-type instructions** (for Lexical Drills, Learning Drills, Practice Drills, etc.)

**DO NOT simplify or generalize instructions.** Use the EXACT text from the source file.

---

## Content Type Mapping

| FSI Source Element | Convert To |
|-------------------|------------|
| Main dialogue with speakers | `$DIALOGUE` with SPEAKER/LINE/LINE_T |
| Vocabulary items (asterisks) | VOCAB/VOCAB_T entries before the lines using them |
| Useful Words | `$DIALOGUE` with LINE/LINE_T (no speaker, or use Narrator) |
| Vocabulary Awareness tables | `$DIALOGUE` with markdown table |
| Lexical drills (A-1, A-2...) | `$EXERCISE` with PROMPT = RESPONSE (repetition) |
| Learning drills | `$DIALOGUE` for listen-and-repeat |
| Practice drills | `$EXERCISE` with PROMPT/RESPONSE (transformation) |
| Grammar explanations | `$GRAMMAR` with markdown content |
| Written exercises | `$GRAMMAR` with INSTRUCTION + numbered list |
| Questions on dialogue | `$EXERCISE` with Q&A format |
| Review drills | `$EXERCISE` (group under Review lesson) |

---

## Example Conversions

### Dialogue with Vocabulary

Source:
```
*tiens* : (exclamation indicating surprise)
*voilà* : here is, here are

**Mme Durand:** Tiens, voilà Mademoiselle Courtois.
(Well, there's Miss Courtois.)
```

Output:
```
$DIALOGUE Dans la rue / On the street
INTRO: Mr. Lelong and Mrs. Durand meet on the street. Pay attention to formal greetings.
INSTRUCTION: Listen and repeat each line.

VOCAB: tiens
VOCAB_T: (exclamation indicating surprise)
VOCAB: voilà
VOCAB_T: here is, here are

SPEAKER: Mme Durand
LINE: Tiens, voilà Mademoiselle Courtois.
LINE_T: Well, there's Miss Courtois.
```

### Repetition Drills (PROMPT = RESPONSE)

For listen-and-repeat drills where the student simply repeats what they hear:

```
$EXERCISE Lexical A-1 Subject Substitution
INTRO: Practice these sentences with different subjects.
INSTRUCTION: Listen and repeat.

PROMPT: Je suis heureux de faire votre connaissance.
RESPONSE: Je suis heureux de faire votre connaissance.

PROMPT: Il est heureux de faire votre connaissance.
RESPONSE: Il est heureux de faire votre connaissance.
```

### Transformation Drills with Examples

Use EXAMPLE marker to show the student how to do the drill:

```
$EXERCISE Practice A-1 Singular to Plural
INTRO: In this drill, convert singular nouns to their plural forms.
INSTRUCTION: Convert singular to plural.

EXAMPLE
PROMPT: Voilà le restaurant.
PROMPT_T: Here is the restaurant.
RESPONSE: Voilà les restaurants.
RESPONSE_T: Here are the restaurants.

PROMPT: Voilà la classe.
RESPONSE: Voilà les classes.

PROMPT: Voilà le livre.
RESPONSE: Voilà les livres.
```

---

## Typical Module Structure

```
$MODULE
DIOCO_DOC_ID: lc_fsi_french_u1
TITLE: Unit 1: Meeting People
DESCRIPTION: Basic greetings, introductions, and polite expressions.
TARGET_LANG_G: fr
HOME_LANG_G: en

VOICE_DEFAULT: aoede | Speak clearly and naturally
VOICE_SPEAKER: Mme Durand = aoede | Speak warmly in French
VOICE_SPEAKER: M. Lelong = achernar | Speak formally
VOICE_SPEAKER: Narrator = aoede | Clear narration

$LESSON Lesson 1 Dialogue and Vocabulary
$DIALOGUE (main dialogue)
$DIALOGUE (useful words)
$DIALOGUE (vocabulary awareness)

$LESSON Lesson 2 Lexical Drills A
$EXERCISE (multiple drills)

$LESSON Lesson 3 Lexical Drills B
$EXERCISE (additional drills)
$EXERCISE (questions on dialogue)

$LESSON Lesson 4 Grammar 1 - Noun Markers
$GRAMMAR (explanation)
$EXERCISE (learning drills)
$EXERCISE (practice drills)
```

---

## Grammar Lessons Structure

Each Grammar lesson follows this structure:

1. **Lesson Header** with lesson-level instruction (as INTRO)
2. **Grammar Note** as `$GRAMMAR` with its content
3. **Learning Drills** as `$EXERCISE` with instruction
4. **Practice Drills** as `$EXERCISE` with instruction

**Instruction Placement Rules:**
- ONE instruction per drill type/section (at the start)
- NO individual instructions for each drill (A-1, A-2, etc.)
- When drill type changes (A → B), add new instruction

---

## Special FSI Formatting

### Vocabulary in Dialogues
FSI vocabulary items marked with asterisks (*word* : meaning) should become VOCAB entries:
```
VOCAB: tiens
VOCAB_T: (exclamation indicating surprise)
VOCAB: voilà
VOCAB_T: here is, here are
```

### Written Exercises
- Convert to `$GRAMMAR` section with INSTRUCTION
- Keep numbered lists intact
- Use markdown for French examples
- Remove French instruction variants (e.g., "Traduisez les phrases suivantes") - use English only

### Important Notes
- **Not all units have "Situations and Review Drills"** - Unit 1 does not have this section
- Check each unit's actual structure rather than assuming a fixed pattern

---

## Content Guidelines

### DO:
- Preserve ALL original FSI content and instructions
- Keep vocabulary in context (VOCAB/VOCAB_T before the lines using it)
- Maintain the pedagogical sequence
- Include all drill variations
- Use EXAMPLE for first item in transformation drills
- Use side-by-side tables for singular/plural comparisons

### DO NOT:
- Add memory tricks or mnemonics
- Add "Practice Tips" or "Common Errors" sections
- Include meta-commentary about learning strategies
- Skip any drills or exercises
- Combine separate drills into one
- Include page markers (`#page1`, `#page2`, etc.)
- Include tape references (`Tape 1.1`, `Tape 2.3`, etc.)
- Include "(not recorded)" or "(recorded)" notes
- Add individual instructions to each drill (A-1, A-2, A-3...)