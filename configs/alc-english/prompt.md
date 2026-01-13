# ALC DLI English Conversion Rules

## Overview

This guide explains how to convert American Language Course (ALC) DLI English units from markdown format to the structured module format.

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
| Practice/drill exercises | `$EXERCISE` |
| Substitution/replacement drills | `$EXERCISE` |
| Translation drills | `$EXERCISE` |
| Grammar explanations | `$GRAMMAR` |
| Conjugation tables | `$GRAMMAR` |

---

## Example Conversions

### Dialogue

```
$DIALOGUE Basic Sentences
INTRO: These sentences introduce common greetings used in everyday English.
INSTRUCTION: Listen and repeat.

SPEAKER: A
LINE: Good morning.
LINE_T: (greeting used in the morning)

SPEAKER: B
LINE: Good morning. How are you?
LINE_T: (response with follow-up question)
```

### Exercise with Examples

Use EXAMPLE marker to show students how to do the drill:

```
$EXERCISE Substitution Drill
INTRO: In this drill, you'll practice replacing words in sentences.
INSTRUCTION: Replace the underlined word with the cue.

EXAMPLE
PROMPT: She is a teacher. (doctor)
RESPONSE: She is a doctor.

PROMPT: He is tall. (short)
RESPONSE: He is short.

PROMPT: They are students. (teachers)
RESPONSE: They are teachers.
```

---

## Lesson Organization

- Use lesson marker: `$LESSON Lesson X Topic Name`
- Number lessons sequentially (1, 2, 3, etc.)
- Within each lesson, use titles like "Lesson X.Y" where:
  - X = lesson number
  - Y = section within that lesson

---

## Voice Configuration

Include voice configuration in the module header:

```
$MODULE
DIOCO_DOC_ID: lc_alc_english_1105
TITLE: MODULE 1105: Greetings and Introductions
DESCRIPTION: Basic greetings and introduction phrases in English.
TARGET_LANG_G: en
HOME_LANG_G: es

VOICE_DEFAULT: aoede | Speak clearly with standard American accent
VOICE_SPEAKER: A = achernar | Speak naturally with standard American accent
VOICE_SPEAKER: B = achird | Speak naturally with standard American accent
VOICE_INTRO: aoede | Speak clearly and slowly
```

---

## Special Rules for ALC Content

### Outline Sections
If the original unit has an "OUTLINE AND STUDY OBJECTIVES" or similar section, include it at the very start as a `$GRAMMAR` section or as module description.

### Sound and Intonation
Sound and intonation practice sections should be converted to `$DIALOGUE` for listen-and-repeat or `$GRAMMAR` for explanations.

### Review Sections
Review drills covering multiple modules should be organized as a separate lesson.

---

## Content Guidelines

### DO:
- Preserve all original content
- Keep vocabulary in context (VOCAB/VOCAB_T entries)
- Maintain the pedagogical sequence
- Include all drill variations
- Use EXAMPLE for first item in transformation drills
- Mark examples in grammar sections appropriately

### DO NOT:
- Add memory tricks or mnemonics
- Add "Practice Tips" or "Common Errors" sections
- Include meta-commentary about learning strategies
- Skip any drills or exercises
- Combine separate drills into one


