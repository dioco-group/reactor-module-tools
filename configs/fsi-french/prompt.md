# FSI French Conversion Rules

## Overview

This guide explains how to convert FSI (Foreign Service Institute) French course materials from markdown format to the structured module format.

Each module corresponds to one Unit from the original FSI course (e.g., Module_01 = Unit 1).

## INTRO and INSTRUCTION fields

The book is being transformed for use in self-study software. Use your judgement to add appropriate INTRO and INSTRUCTION fields, as you consider appropriate. The exercises are pretty repetitive and dry.. you can occasionaly put a tongue-in-cheek comment or encouragement. Instructions should be in English only.

## FSI Source Element Conversion Guidelines

#### Main dialogue with speakers
Convert to `$DIALOGUE` using SPEAKER, LINE, and LINE_T fields.
Vocabulary items: Place VOCAB/VOCAB_T entries **immediately before each specific LINE** they belong to. Each LINE should have its own VOCAB block — do not group vocab for multiple lines together. 

Only include vocabulary items that are listed in the source material. Do not add additional vocab items. Do not include vocab for words that only appear in the activity title.

### Dialogue Notes
These are cultural or contextual notes that appear as a separate section after the main dialogue (not attached to a specific line). They provide background information about French customs, systems, or usage.

Convert to `$GRAMMAR` with a descriptive title (e.g., "Cultural Note: French Phone Numbers", "Note: The French Postal System").

Include the full text — do not shorten or summarize.

*Note: This is different from the per-line `NOTES` field in `$DIALOGUE`, which is for brief tips attached to a specific line.*

### Useful Words
Convert to `$EXERCISE`. Some lines do not have underlines.. these should be put as EXAMPLE. The prompt and the response are both the full sentences. For other lines, a part of the sentence is underlined. The underlined part is the prompt, and the full sentence is the response.

### Vocabulary Awareness tables
Convert to $DIALOGUE. The French should be the 'LINE's, and LINE_T is the English translations.


### Some General Notes about Drills

Each numbered drill (A-1, A-2, A-3, etc.) must be a **separate `$EXERCISE`** — do not merge them into one exercise. Convert each drill to `$EXERCISE` with its own title (e.g., "Lexical A-1", "Lexical A-2").

Drills can be formatted in two formats. One is a numbered list of sentence pairs, with the PROMPT on the left, and the RESPONSE on the right.

The other drill format has a list of sentences, of which a part is underlined.
The underline generally marks the prompt part of the sentence in an exercise. It appears like this in the source material: 

Mon <u>frère</u> va bien.

This should be converted to:

PROMPT: frère
RESPONSE: Mon frère va bien.

In some review exercises however, the the response the is underlined section, and the reponse is the full sentence.

The marking of underlines in the source material is not always reliable however. They may be absent in some cases, or mark the wrong words. Use your judgement.

Drills generally include one (occassionally two) model sentences, to show the student how to perform the drill. These model sentences may be denotated by a lack of underline in the sentence, or else, a formatting like this:

Tutor: ...
Student: ...

For these model sentences, mark the items as EXAMPLE in the $EXERCISE.


### Questions on the dialogue
Put these as an `$EXERCISE`. Question is the prompt, answer is the response.

### Situations (Situation I, Situation II, etc.)
These are mini-dialogues that appear later in the unit (not at the beginning like the main dialogue). Convert each SITUATION to `$DIALOGUE` using SPEAKER and LINE fields. Don
t combine multiple situations into a single dialogue.

- The left column contains the dialogue lines with speaker labels (L., E., C., B., etc.)
- The right column has a small narrative text that sets the scene, and can include some vocabulary items.

Transform these two parts (dialogue and narrative) into a single linear $DIALOGUE. For the narrative part, use the 'Narrator' SPEAKER. Include any underlined vocabulary that is introduced as VOCAB items before the LINE.

**Naming:** Title each Situation with its original name (e.g., "Situation I") or give it a descriptive name based on the contents (e.g., "At the Real Estate Agency", "Going to the Station").

### Grammar explanations
Convert as `$GRAMMAR` and include the markdown content directly.  Do not summarize or shorten. Include ALL example pairs (statement → question, singular → plural, etc.) from the source.

### Question Drill
These appear as a list of questions in the book, without answers.
Use the $EXERCISE type. Put the question as the prompt, and add an example answer as the reponse. No EXAMPLE is needed. The intro and instuction may indicate to the user that there is no single right answer.

### Response Drill
Here the student is prompted to play both sides of a conversation. The second speaker is denoted as '...'. Use an $EXERCISE type, with the prompt being the instruction for the student, and the response being the expected response. Rather than '...', use a real name. Make sure the INTRO and INSTRUCTION makes the exercise clear.

### Written exercises
These can be $EXERCISE. 
Encourage the student (in INTRO/INSTRUCTION) to write down the answer with a pen and paper before checking their response.

### Review drills
Convert as `$EXERCISE` (group these under a Review lesson section). Note: "grouping" means placing them in the same lesson — it does NOT mean merging or shortening. Each Review drill must remain a separate `$EXERCISE`.

### Comprehension Drills (Review Units 6 and 12)
These appear in review units and are typically labeled R-36, R-37, etc. with "(Identification)" in the title. Convert to `$EXERCISE`. Note: in these drills, the PROMPT and REVERSE sections are often reversed:

- **PROMPT**: The full sentence
- **RESPONSE**: The underlined or bolded word/phrase (the part marked with `<u>...</u>` or `**...**`)


**Naming:** Title each exercise with its drill number (e.g., "Comprehension R-36") or with a descriptive name based on what is being identified (e.g., "Identify the Article", "Identify the Pronoun").

**INSTRUCTION:** Write a brief, clear instruction telling the student what to do (e.g., "Listen to the sentence and identify the article.", "Find the pronoun in each sentence.", "Identify the noun marker in each phrase."). The instruction should appear at the top of the screen during the exercise.
## Naming activities

Try to give a TITLE to the activities that matches or corresponds to the titles given in the source material. Don't change them for change sake.

### Optional: Thematic naming for drill groups

You may augment the title with an addition descriptive part:

"Practice A-3" => "Practice A-3: Seasons"

Guidelines:
- Only do this when the theme is **obvious and consistent** throughout the drill
- Keep names short and descriptive (1-3 words)
- Do NOT invent themes that aren't clearly present in the content

## Breaking into Lessons

Every module MUST use `$LESSON` markers to organize content.

You will typically group the material into lessons like this:

$LESSON Lesson 1: Dialogue and Vocabulary 
-> Main dialogue, Useful Words, Lexical drills, Questions on the dialogue

$LESSON Lesson 2: Grammar - [Topic Name]
->One lesson per grammar topic with its explanation and exercises (Lesson 3, 4, 5... for each additional grammar topic)

$LESSON Lesson N: Review and Practice
-> Review drills, Question drills, Response drills, Written exercises (final lesson)

Each lesson MUST be numbered sequentially (Lesson 1, Lesson 2, Lesson 3, etc.). Each grammar topic should be its own separate lesson.

## Unit-specific notes

### UNIT 1

Remove the classroom expressions, they aren't needed.


## CRITICAL CRITICAL CRITICAL: Do Not Skip Content

You MUST convert ALL content from the source. Do not skip, summarize, or truncate any of the following:

1. **Lexical Drills** — Every Lexical drill in the source (A-1, A-2, ..., B-1, B-2, etc.) must be a separate `$EXERCISE`. The count varies by unit — convert ALL of them, however many there are.

2. **Grammar Examples** — All example sentences, tables, and Singular/Plural pairs in Grammar sections must be preserved. Use `{curly brackets}` around French phrases for audio. **Important:** Each Grammar Note in the source often starts with example sentences that demonstrate the concept (e.g., "Comment allez-vous?", "Je suis heureux de faire votre connaissance"). These introductory examples MUST be included at the start of the `$GRAMMAR` section.

3. **Practice Drills** — Every Learning Drill, Practice Drill, and Review Drill in the source must appear in the output.

4. **Dialogue Lines** — Every line of dialogue must be converted. Do not summarize or combine lines.

5. **Learning Drills** — Every Learning drill in the source (Learning 1, Learning 2, etc.) must be a separate `$EXERCISE`. The count varies by unit — convert ALL of them, however many there are.

6. **Practice Drills (numbered)** — Every Practice drill in the source (Practice A-1, A-2, etc.) must be a separate `$EXERCISE`. The count varies by unit — convert ALL of them, however many there are.

If you run out of space, it is better to output an incomplete file than to silently skip content.

## Content Guidelines

### DO NOT:
- Add memory tricks or mnemonics
- Add "Practice Tips" or "Common Errors" sections
- Include meta-commentary about learning strategies
- Skip any drills or exercises — convert ALL Lexical A, B, Learning, Practice, and Review drills
- Combine separate drills into one — each A-1, A-2, B-1, etc. must be a separate $EXERCISE
- Combine separate Learning drills into one — each Learning 1, Learning 2, etc. must be a separate $EXERCISE
- Combine separate Practice drills into one — each Practice A-1, A-2, etc. must be a separate $EXERCISE
- Skip example sentences or tables from Grammar sections
- Include page markers (`#page1`, `#page2`, etc.)
- Include tape references (`Tape 1.1`, `Tape 2.3`, etc.)
- Include "(not recorded)" or "(recorded)" notes


