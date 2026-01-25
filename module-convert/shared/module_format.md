# Module Format Specification

This document defines the format for `.module` files used by the language learning platform.

## How the App Works

Understanding the student experience helps create better modules:

### Structure
- **Module** → **Lessons** → **Activities** → **Cards**
- Students swipe through content **card-by-card**
- Each lesson should take **15-45 minutes** to complete

### Key UX Patterns
- **In $EXERCISE, prompts and translations are blurred by default** — students tap to reveal (prevents over-reliance on reading)
- **Audio plays automatically** — tap to replay
- **Dictionary lookups** — tap any word in target language text to see definition
- **INTRO is spoken** before the activity starts (by narrator voice)
- **INSTRUCTION stays at the top of the screen** during the activity (brief reminder)

## Module Header (Required)

Every module must start with `$MODULE` followed by required fields:

```
$MODULE
DIOCO_DOC_ID: lc_fsi_french_u1
TITLE: Unit 1: Greetings and Introductions
DESCRIPTION: This module covers basic French greetings, introductions, and polite expressions.
TARGET_LANG_G: fr
HOME_LANG_G: en
```

| Field | Required | Description |
|-------|----------|-------------|
| `DIOCO_DOC_ID` | **Yes** | Unique identifier (kebab-case, e.g., `lc_fsi_french_u1`) |
| `TITLE` | **Yes** | Module title |
| `DESCRIPTION` | No | Single line description of what the module teaches |
| `IMAGE` | No | Image filename for module cover |
| `TARGET_LANG_G` | **Yes** | Language being taught (`fr`, `es`, `en`, `de`, etc.) |
| `HOME_LANG_G` | **Yes** | Instruction/translation language |

## Voice Configuration (Optional, in header)

Configure voices for TTS.

- Voice names are **case-insensitive** and must **not contain spaces** (recommended: `A-Za-z0-9_`).
- Speaker IDs used for mappings are **case-insensitive** and must **not contain spaces** (use e.g. `M_Lelong`, `Mme_Durand`, `SpeakerA`).

```
VOICE_DEFAULT: aoede | Speak clearly and naturally
VOICE_INTRO: aoede | Speak like a friendly narrator
VOICE_PROMPT: achernar | For exercise prompts
VOICE_RESPONSE: achird | For exercise responses

# Speaker mappings (use going forward): explicit ID + human-readable display name
VOICE: Mme_Durand | Mme. Durand | aoede | Speak warmly in French
VOICE: M_Lelong | M. Lelong | achernar | Speak formally
```

| Field | Description |
|-------|-------------|
| `VOICE_DEFAULT` | Fallback voice for all TTS |
| `VOICE_INTRO` | Voice for reading activity introductions (narrator) |
| `VOICE_PROMPT` | Voice for exercise prompts |
| `VOICE_RESPONSE` | Voice for exercise responses |
| `VOICE` | Map speaker **ID** to `{displayName, voice, prompt}` (repeatable) |

**Formats:**

- `VOICE_DEFAULT / VOICE_INTRO / VOICE_PROMPT / VOICE_RESPONSE`:
  - `VoiceName | Optional style instruction`
- `VOICE`:
  - `SpeakerId | Display Name | VoiceName | Optional style instruction`

## TTS Prompt (Optional)

You can provide an optional TTS style/tone hint that will be passed to the TTS system prompt.

### Module-level

Applies as a default to all activities (unless overridden at activity-level):

```
TTS_PROMPT: This is a beginner course. Speak clearly and naturally.
```

### Activity-level (Dialogue / Exercise only)

Overrides for a specific activity:

```
$DIALOGUE Greetings
TTS_PROMPT: Speak like a casual conversation between friends.
```

## Section Markers

Section markers have **NO colon** and the title goes on the **same line**:

```
$LESSON Lesson 1 Dialogue and Vocabulary
$DIALOGUE Dans la rue / On the street
$GRAMMAR Noun-Markers (Definite Articles)
$EXERCISE Lexical A-1 Subject Substitution
$CHAT Practice Conversation
```

## $LESSON Marker

Divides the module into study sessions. Each lesson should be completable in **15-45 minutes**.

```
$LESSON Dialogue and Vocabulary
$LESSON Grammar - Noun Markers
$LESSON Grammar - Adjectives
```

## $DIALOGUE Activity

**Goal:** Listen to and understand conversations or example sentences.

### How It Works in the App
- Each line is a **card** the student swipes through
- **Speaker name** shown at top of card
- **Target language text** shown prominently
- **Translation (LINE_T)** is **blurred** — student taps to reveal
- **Audio plays automatically** when card appears
- **Tap any word** to see dictionary definition
- **NOTES** appear in a tip box below the line

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` | No | Spoken by narrator before activity starts (sets the scene) |
| `INSTRUCTION` | No | Brief text shown at top of screen during activity |
| `SPEAKER` | No | Speaker ID or display name (connects to `VOICE` speaker mappings for TTS) |
| `LINE` | **Yes** | The dialogue text in target language |
| `LINE_T` | No | Translation (blurred until tapped) — place after LINE |
| `VOCAB` | No | Vocabulary word/phrase (place immediately before the LINE it belongs to) |
| `VOCAB_T` | No | Translation/definition of vocabulary — place after VOCAB |
| `NOTES` | No | Cultural context, grammar tips, or explanations for this line |

**Translation Order:** `LINE_T` should follow `LINE`, and `VOCAB_T` should follow `VOCAB`.

### INTRO vs INSTRUCTION

- **INTRO**: Spoken aloud by narrator *before* the activity. Sets the scene: "Now listen to a conversation between two friends planning a trip." Keep concise (2-3 sentences).
- **INSTRUCTION**: Text shown at top of screen *during* the activity. Brief reminder: "Listen and repeat each line." Keep short for mobile.

### Example

```
$DIALOGUE Dans la rue / On the street
INTRO: Mr. Lelong and Mrs. Durand meet on the street. Listen to their conversation and pay attention to the formal greetings.
INSTRUCTION: Listen and repeat each line.

VOCAB: tiens
VOCAB_T: (exclamation indicating surprise)
VOCAB: voilà
VOCAB_T: here is, here are
SPEAKER: Mme Durand
LINE: Tiens, voilà Mademoiselle Courtois.
LINE_T: Well, there's Miss Courtois.

VOCAB: Madame
VOCAB_T: Madam (Mrs.)
VOCAB: comment
VOCAB_T: how
SPEAKER: Mlle Courtois
LINE: Bonjour, Madame. Comment allez-vous?
LINE_T: Hello, Mrs. Durand. How are you?
NOTES: "Comment allez-vous" is the formal way to ask "how are you"

VOCAB: très
VOCAB_T: very
VOCAB: bien
VOCAB_T: well
VOCAB: merci
VOCAB_T: thank you
SPEAKER: Mme Durand
LINE: Très bien, merci.
LINE_T: Fine, thanks.
```

### Lines Without Speaker (Vocabulary Lists)

For vocabulary lists or example sentences without a speaker, omit SPEAKER:

```
$DIALOGUE Useful Words
INSTRUCTION: Study these expressions.

LINE: Mon frère va bien.
LINE_T: My brother feels fine.

LINE: Ma soeur va bien.
LINE_T: My sister feels fine.
```

## $EXERCISE Activity

**Goal:** Train oral fluency through audio-lingual drills (listen → respond → check).

### How It Works in the App
- **Audio-first design**: Student hears prompt, speaks response aloud, then checks
- Each item is a card with **PROMPT** and **RESPONSE**
- **Translations are blurred** to prevent reading reliance
- Student advances to reveal the correct response
- **EXAMPLE items** are NOT blurred and show "Example" label in UI. Examples show the model that the student should follow.

### Philosophy
These are audio-lingual drills, not flashcards. The student should:
1. **Hear** the prompt (audio plays automatically)
2. **Speak** their response out loud (training mouth and brain)
3. **Check** by revealing the correct response
4. **Repeat** the correct response for reinforcement

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` | No | Spoken introduction before activity starts |
| `INSTRUCTION` | No | Brief reminder shown during activity |
| `EXAMPLE` | No | Marks next item as example (shown unblurred with "Example" label) |
| `PROMPT` | **Yes** | The stimulus in target language |
| `PROMPT_T` | No | Translation of prompt (blurred) — place after PROMPT |
| `RESPONSE` | **Yes** | Expected answer in target language |
| `RESPONSE_T` | No | Translation of response (blurred) — place after RESPONSE |

**Translation Order:** `PROMPT_T` should follow `PROMPT`, and `RESPONSE_T` should follow `RESPONSE`.

### Example Items

Use `EXAMPLE` marker to demonstrate the drill pattern:

```
$EXERCISE Practice A-1 Singular to Plural
INTRO: In this drill, you will practice converting singular nouns to plural. Listen to the singular form, then say the plural form aloud.
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

## $GRAMMAR Activity

**Goal:** Understand rules and patterns through reference material.

### How It Works in the App
- Displays as a **scrollable reference card** (like a textbook page)
- Content is **markdown** (headers, tables, bullet points, images)
- Phrases in `{curly brackets}` become **clickable audio buttons**
- Clicking a bracketed phrase plays it aloud
- Dictionary lookups work on words inside bracketed phrases

**Important:** Inside `{curly brackets}`, do NOT use markdown formatting (no `**bold**`, `*italic*`, or list markers like `- `). The bracketed content is extracted as plain text for audio.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` | No | Spoken introduction |
| (content) | **Yes** | Free-form markdown content |

### Example

```
$GRAMMAR Definite Articles
INTRO: Let's learn about the French definite articles: le, la, and les.

In French, nouns are marked for gender and number.

### Singular Forms

**le** - masculine singular nouns beginning with a consonant:
- {le restaurant} - the restaurant
- {le frère} - the brother

**la** - feminine singular nouns beginning with a consonant:
- {la rue} - the street
- {la soeur} - the sister

**l'** - before vowels (both genders):
- {l'ami} - the friend
- {l'enfant} - the child

### Plural Form

**les** - all plural nouns:
- {les restaurants} - the restaurants
- {les rues} - the streets

### Summary Table

| | Singular | Plural |
|---|---|---|
| Masculine | le | les |
| Feminine | la | les |
| Before vowel | l' | les |

![Article usage diagram](articles_diagram.png)
```

## $CHAT Activity

**Goal:** Practice open-ended conversation with an AI character.

### How It Works in the App
- Chat interface where student talks to an AI
- AI plays a character defined by INITIAL_PROMPT
- SCENARIO tells the student their role/context

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `INTRO` | No | Spoken introduction |
| `SCENARIO` | **Yes** | Shown to student (their role/context) |
| `INITIAL_PROMPT` | **Yes** | System prompt for AI character (hidden from student) |

### Example

```
$CHAT Practice Saying Goodbye
INTRO: Now you'll practice a real conversation.
SCENARIO: You are leaving a shop after making a purchase. Say goodbye to the shop owner.
INITIAL_PROMPT: You are a friendly French shop owner. Respond naturally and warmly when the customer says goodbye. Keep responses short and appropriate for a beginner learner.
```

## Output Requirements for Converters

When generating module format output:

- Return ONLY the module format text
- Start with `$MODULE` and required header fields
- Use section markers with NO colon (`$LESSON Title` not `$LESSON: Title`)
- Put titles on the same line as section markers
- Ensure every module has `DIOCO_DOC_ID`, `TITLE`, `TARGET_LANG_G`, `HOME_LANG_G`
- Use proper blank lines between sections
- SPEAKER and LINE must be on separate lines
- PROMPT and RESPONSE must be on separate lines
- Keep INTRO concise (few sentences max)
- Keep INSTRUCTION brief (one line ideally)
- Use `{curly brackets}` around phrases in grammar content for audio playback
