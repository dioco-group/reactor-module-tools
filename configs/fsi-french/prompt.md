# FSI French Conversion Rules

## Overview

This guide explains how to convert FSI (Foreign Service Institute) French course materials from markdown format to the structured module format.

Each module corresponds to one Unit from the original FSI course (e.g., Module_01 = Unit 1).

## INTRO and INSTRUCTION fields

The book is being transformed for use in self-study software. Use your judgement to add appropriate INTRO and INSTRUCTION fields, as you consider appropriate. The exercises are pretty repative and dry.. you can occasionaly put a tongue-in-cheek comment or encouragement. Instructions should be in English only.

## FSI Source Element Conversion Guidelines

#### Main dialogue with speakers
Convert to `$DIALOGUE` using SPEAKER, LINE, and LINE_T fields.
Vocabulary items: Place as VOCAB/VOCAB_T entries before the lines that use them.

### Useful Words
Convert to `$EXERCISE`. Some lines do not have underlines.. these should be put as EXAMPLE. The prompt and the response are both the full sentences. For other lines, a part of the sentence is underlined. The underlined part is the prompt, and the full sentence is the response.

### Vocabulary Awareness tables
Convert to `$GRAMMAR`. Put the list of vocab items and their translations in a two-col table.

### Lexical drills (A-1, A-2...)
Convert to `$EXERCISE`. Some lines do not have underlines.. these should be put as EXAMPLE. The prompt and the response are both the full sentences. For other lines, a part of the sentence is underlined. The underlined part is the prompt, and the full sentence is the response.

### Questions on the dialogue
Put these as an `$EXERCISE`. Question is the prompt, answer is the response.

### Grammar explanations
Convert as `$GRAMMAR` and include the markdown content directly.

### Learning drills
Convert to `$EXERCISE`. Some lines do not have underlines.. these should be put as EXAMPLE. The prompt and the response are both the full sentences. For other lines, a part of the sentence is underlined. The underlined part is the prompt, and the full sentence is the response.

### Practice drills
These seem to have the example sentence seperately at the top, like this:
Tutor: ...
Student: ...
The prompts and the responses are written in full below.
Pretty straightforward.

### Question Drill
These appear as a list of questions in the book, without answers.
Use the $EXERCISE type. Put the question as the prompt, and put an example answer as the reponse. No example is needed.

### Response Drill
Here the student is prompted to play both sides of a conversation. The second speaker is denoted as '...'. Use an $EXERCISE type, with the prompt being the instruction for the student, and the response being the expected response. Rather than '...', use a real name. Make sure the INTRO and INSTRUCTION makes the exercise clear.

### Review Drills
These generally have the form of previously discussed formats.

### Written exercises
These can be $EXERCISE. 
You can remove any exercise where the objective is to translate to English and write down something in English.
The exercises that require the student to write down something in French are useful. Encourage the student (in INTRO/INSTRUCTION) to write down the French with a pen and paper before checking their response.

### Review drills
Convert as `$EXERCISE` (group these under a Review lesson section).

## Breaking into Lessons

An FSI unit has a lot of material. The dialogue and follow up material makes a good lesson. The grammar sections with associated exercises also group well.

## Unit-specific notes

### UNIT 1

Remove the classroom expressions, they aren't needed.

## Typical Module Structure

TODO

## Content Guidelines

### DO NOT:
- Add memory tricks or mnemonics
- Add "Practice Tips" or "Common Errors" sections
- Include meta-commentary about learning strategies
- Skip any drills or exercises
- Combine separate drills into one
- Include page markers (`#page1`, `#page2`, etc.)
- Include tape references (`Tape 1.1`, `Tape 2.3`, etc.)
- Include "(not recorded)" or "(recorded)" notes


