import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = __dirname; // module-preview/
const srcEntry = path.join(root, 'src', 'app.ts');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

function uniq(arr) {
  return Array.from(new Set(arr));
}

function extractQuotedStrings(s) {
  const out = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

function extractBlock(lines, startRule, stopRules) {
  const startIdx = lines.findIndex((l) => new RegExp(`^\\s*${startRule}\\s*=`).test(l));
  if (startIdx === -1) return '';
  const stopRe = new RegExp(`^\\s*(${stopRules.join('|')})\\s*=`);
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (stopRe.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

async function generateSpecFromEbnf() {
  const ebnfPath = path.join(root, '..', 'module-convert', 'shared', 'module_format.ebnf');
  const specOutPath = path.join(root, 'src', 'spec_from_ebnf.ts');
  let ebnf;
  try {
    ebnf = await fs.readFile(ebnfPath, 'utf8');
  } catch (e) {
    console.warn(`WARN: unable to read EBNF at ${ebnfPath}; leaving existing spec_from_ebnf.ts`);
    return;
  }

  const lines = ebnf.split(/\r?\n/);

  // Global markers (quoted strings starting with $)
  const allQuoted = extractQuotedStrings(ebnf);
  const markers = uniq(
    allQuoted
      .filter((q) => q.startsWith('$') && q.length > 1)
      .map((q) => q.slice(1))
  ).sort();

  // Activity-specific blocks (best-effort parsing)
  const dialogueBlock = extractBlock(lines, 'dialogue_activity', ['grammar_activity', 'exercise_activity', 'chat_activity', 'module_header', 'voice_config', 'lesson']);
  const grammarBlock = extractBlock(lines, 'grammar_activity', ['dialogue_activity', 'exercise_activity', 'chat_activity', 'module_header', 'voice_config', 'lesson']);
  const exerciseBlock = extractBlock(lines, 'exercise_activity', ['dialogue_activity', 'grammar_activity', 'chat_activity', 'module_header', 'voice_config', 'lesson']);
  const chatBlock = extractBlock(lines, 'chat_activity', ['dialogue_activity', 'grammar_activity', 'exercise_activity', 'module_header', 'voice_config', 'lesson']);
  const headerBlock = extractBlock(lines, 'module_header', ['dialogue_activity', 'grammar_activity', 'exercise_activity', 'chat_activity', 'voice_config', 'lesson']);
  const voiceBlock = extractBlock(lines, 'voice_config', ['dialogue_activity', 'grammar_activity', 'exercise_activity', 'chat_activity', 'module_header', 'lesson']);

  const fieldsFromBlock = (block) =>
    uniq(
      extractQuotedStrings(block)
        .filter((q) => q.endsWith(':'))
        .map((q) => q.slice(0, -1))
    ).sort();

  const headerFields = fieldsFromBlock(headerBlock);
  const voiceFields = fieldsFromBlock(voiceBlock);

  // EBNF uses shared non-terminals (intro_field, instruction_field) referenced by activities.
  // The block slices don't always include the shared rule definitions, so we add them when referenced.
  const withSharedFields = (block, fields) => {
    const f = new Set(fields);
    if (block.includes('intro_field')) f.add('INTRO');
    if (block.includes('instruction_field')) f.add('INSTRUCTION');
    return Array.from(f).sort();
  };

  const dialogueFields = withSharedFields(dialogueBlock, fieldsFromBlock(dialogueBlock));
  const exerciseFields = withSharedFields(exerciseBlock, fieldsFromBlock(exerciseBlock));
  const grammarFields = withSharedFields(grammarBlock, fieldsFromBlock(grammarBlock));
  const chatFields = withSharedFields(chatBlock, fieldsFromBlock(chatBlock));

  const exampleMarker = allQuoted.includes('EXAMPLE') ? 'EXAMPLE' : null;

  const out = `/**
 * AUTO-GENERATED (and overwritten) by \`module-preview/build.mjs\` from:
 * \`module-convert/shared/module_format.ebnf\`
 *
 * Do not hand-edit.
 */

export type EbnfSpec = {
  markers: string[];
  headerFields: string[];
  voiceFields: string[];
  dialogueFields: string[];
  exerciseFields: string[];
  grammarFields: string[];
  chatFields: string[];
  exampleMarker: string | null;
};

export const ebnfSpec: EbnfSpec = ${JSON.stringify(
    {
      markers,
      headerFields,
      voiceFields,
      dialogueFields,
      exerciseFields,
      grammarFields,
      chatFields,
      exampleMarker,
    },
    null,
    2
  )};
`;

  await fs.writeFile(specOutPath, out, 'utf8');
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (ent.isDirectory()) await copyDir(src, dst);
    else await fs.copyFile(src, dst);
  }
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await copyDir(publicDir, distDir);

// Keep diagnostics rules synced to the formal grammar.
await generateSpecFromEbnf();

// Copy a demo module for quick testing.
try {
  const demoSrc = path.resolve(root, '..', '..', 'vscode-module-lang', 'samples', 'example.module');
  await fs.copyFile(demoSrc, path.join(distDir, 'demo.module'));
} catch {
  // ignore
}

await esbuild.build({
  entryPoints: [srcEntry],
  bundle: true,
  outfile: path.join(distDir, 'bundle.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info',
});

console.log(`Built preview to: ${distDir}`);


