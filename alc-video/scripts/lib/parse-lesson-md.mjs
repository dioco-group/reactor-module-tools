// Parse an ALC lesson activity markdown file into figures with their
// illustration references and English text items.
//
// The split markdown only exists for a subset of lessons. Mapping is by the
// numbered source files in data/alc-english/md.

import fs from "node:fs/promises";
import path from "node:path";
import { MD_SRC } from "./paths.mjs";

// Lesson id -> activity markdown filename (figures + images live here).
export const LESSON_MD_FILE = {
  "1A": "002 - LANGUAGE LABORATORY ACTIVITIES BOOK 1 LESSON 1A.md",
  "2C": "003 - LANGUAGE LABORATORY ACTIVITIES BOOK 1 LESSON 2C.md",
  "2D": "004 - LANGUAGE LABORATORY ACTIVITIES BOOK 1 LESSON 2D.md",
  "3A": "005 - LANGUAGE LABORATORY ACTIVITIES BOOK 1 LESSON 3A.md",
  "3B": "006 - LANGUAGE LABORATORY ACTIVITIES BOOK 1 LESSON 3B.md",
  "3C": "007 - LANGUAGE LABORATORY ACTIVITIES BOOK 1 LESSON 3C.md",
};

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/;
const LIST_ITEM_RE = /^(\d+)\.\s+(.*)$/;

// "#1 caption text" -> { panel: 1, caption: "caption text" }
function parseAlt(alt) {
  const m = alt.match(/^#(\d+)\s*(.*)$/);
  if (m) return { panel: parseInt(m[1], 10), caption: m[2].trim() };
  return { panel: null, caption: alt.trim() };
}

// Returns the lesson's figures for the FIRST matching lesson heading block.
// Each figure: { n, heading, instruction, images:[{index,panel,path,caption}],
//                textItems:[{index,text}] }
export async function parseLessonMd(lessonId) {
  const file = LESSON_MD_FILE[lessonId];
  if (!file) return null;
  const raw = await fs.readFile(path.join(MD_SRC, file), "utf8");
  const lines = raw.split(/\r?\n/);

  const figures = [];
  let cur = null;
  let stopAtNextLesson = false;
  let seenFirstLesson = false;

  for (const line of lines) {
    const lessonHeading = line.match(/^#\s+.*LESSON\s+([0-9]+[A-D])/i);
    if (lessonHeading) {
      if (seenFirstLesson) {
        stopAtNextLesson = true;
        break; // only the first lesson block in the file
      }
      seenFirstLesson = true;
      continue;
    }

    const figHeading = line.match(/^##\s+Figure\s+(\d+)/i);
    if (figHeading) {
      cur = {
        n: parseInt(figHeading[1], 10),
        instruction: null,
        images: [],
        textItems: [],
      };
      figures.push(cur);
      continue;
    }
    if (!cur) continue;

    // Bold instruction line directly under a figure heading.
    const bold = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (bold && cur.instruction == null) {
      cur.instruction = bold[1].trim();
      continue;
    }

    const li = line.match(LIST_ITEM_RE);
    if (li) {
      const index = parseInt(li[1], 10);
      const rest = li[2];
      const img = rest.match(IMAGE_RE);
      if (img) {
        const { panel, caption } = parseAlt(img[1]);
        cur.images.push({
          index,
          panel,
          path: img[2].trim(),
          caption,
        });
      } else {
        cur.textItems.push({ index, text: rest.trim() });
      }
    }
  }

  return { lessonId, figures };
}
