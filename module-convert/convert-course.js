/**
 * Universal Course Converter
 * Converts language course materials to .module format using Gemini AI
 *
 * Usage: node module-convert/convert-course.js --config configs/fsi-french/module-convert.json
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  callGemini,
  stripMarkdownCodeBlocks,
  isRateLimitError,
} from '../lib/gemini-api.js';
import {
  getFiles,
  readTextFile,
  writeTextFile,
  fileExists,
  getFileSizeKB,
  ensureDir,
} from '../lib/file-utils.js';
import { sleep, ProgressTracker } from '../lib/progress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  
  if (configIndex === -1 || !args[configIndex + 1]) {
    console.error('Usage: node module-convert/convert-course.js --config <path-to-config.json>');
    console.error('Example: node module-convert/convert-course.js --config configs/fsi-french/module-convert.json');
    process.exit(1);
  }
  
  return {
    configPath: args[configIndex + 1]
  };
}

function loadConfig(configPath) {
  // Resolve relative to the caller's working directory (repo root),
  // not relative to module-convert/ (less surprising).
  const absoluteConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);
  const configDir = path.dirname(absoluteConfigPath);
  
  const configText = readTextFile(absoluteConfigPath);
  const config = JSON.parse(configText);
  
  // Resolve paths relative to config file location
  return {
    courseName: config.courseName,
    inputDir: path.resolve(configDir, config.inputDir),
    outputDir: path.resolve(configDir, config.outputDir),
    model: config.model || 'gemini-3-pro-preview',
    maxTokens: config.maxTokens || 32000,
    temperature: config.temperature || 1.0,
    thinkingBudget: typeof config.thinkingBudget === 'number' ? config.thinkingBudget : 4096,
    delayBetweenRequests: config.delayBetweenRequests || 3000,
    configDir: configDir,
  };
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildSystemPrompt(config) {
  // Load shared module format spec
  const sharedFormatPath = path.resolve(__dirname, 'shared/module_format.md');
  const moduleFormat = readTextFile(sharedFormatPath);
  
  // Load course-specific prompt
  const coursePromptPath = path.resolve(config.configDir, 'prompt.md');
  let coursePrompt = '';
  if (fileExists(coursePromptPath)) {
    coursePrompt = readTextFile(coursePromptPath);
  }
  
  const systemPrompt = `You are converting ${config.courseName} language learning materials into a structured module format for educational software.

${moduleFormat}

${coursePrompt ? '---\n\n# Course-Specific Instructions\n\n' + coursePrompt : ''}`;

  return systemPrompt;
}

function validateModuleOutput(text) {
  const warnings = [];
  const t = String(text || '');

  if (!t.match(/^\s*\$MODULE/m)) warnings.push('Missing $MODULE header');
  if (!t.match(/^\s*DIOCO_DOC_ID:\s*\S+/m)) warnings.push('Missing DIOCO_DOC_ID in header');
  if (!t.match(/^\s*TITLE:\s*\S+/m)) warnings.push('Missing TITLE in header');
  if (!t.match(/^\s*TARGET_LANG_G:\s*\S+/m)) warnings.push('Missing TARGET_LANG_G in header');
  if (!t.match(/^\s*HOME_LANG_G:\s*\S+/m)) warnings.push('Missing HOME_LANG_G in header');

  // No-colon rule for section markers
  const colonMarkers = t.match(/^\s*\$(LESSON|DIALOGUE|EXERCISE|GRAMMAR|CHAT)\s*:/gm);
  if (colonMarkers && colonMarkers.length > 0) warnings.push('Found section markers with colon (must be `$LESSON Title`, not `$LESSON: Title`)');

  // Speaker labels in VOICE_SPEAKER mappings should not contain spaces
  const voiceSpeakerLines = t.match(/^\s*VOICE_SPEAKER:\s*.+$/gm) || [];
  const speakerLabelCaseMap = new Map(); // lower -> firstSeenOriginal
  for (const line of voiceSpeakerLines) {
    const m = line.match(/^\s*VOICE_SPEAKER:\s*([^=]+?)\s*=\s*([^\s|]+)\b/);
    if (m) {
      const speakerLabel = m[1].trim();
      if (/\s/.test(speakerLabel)) {
        warnings.push(`VOICE_SPEAKER label contains spaces ("${speakerLabel}"). Use a no-spaces label like "M_Lelong".`);
        break;
      }

      // Case-insensitive: warn if the same label appears with different casing
      const key = speakerLabel.toLowerCase();
      const prev = speakerLabelCaseMap.get(key);
      if (prev && prev !== speakerLabel) {
        warnings.push(`VOICE_SPEAKER label casing differs ("${prev}" vs "${speakerLabel}"). Labels are case-insensitive; use consistent casing.`);
        break;
      }
      if (!prev) speakerLabelCaseMap.set(key, speakerLabel);
    }
  }

  return warnings;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function convertCourse() {
  const args = parseArgs();
  const config = loadConfig(args.configPath);
  
  console.log('=== Course Converter ===');
  console.log(`Course: ${config.courseName}`);
  console.log(`Input: ${config.inputDir}`);
  console.log(`Output: ${config.outputDir}`);
  console.log(`Model: ${config.model}`);
  console.log(`Max Tokens: ${config.maxTokens}`);
  console.log('');
  
  // Ensure output directory exists
  ensureDir(config.outputDir);
  
  // Get all .md files in input directory
  const allFiles = getFiles(config.inputDir, /\.md$/);
  const inputFiles = allFiles.filter(f => !f.includes('Zone.Identifier'));
  
  if (inputFiles.length === 0) {
    console.log('No .md files found in input directory');
    return;
  }

  console.log(`Found ${inputFiles.length} files to process\n`);

  const progress = new ProgressTracker(inputFiles.length);
  const systemPrompt = buildSystemPrompt(config);

  for (let i = 0; i < inputFiles.length; i++) {
    const filename = inputFiles[i];
    const baseName = path.basename(filename, '.md');
    
    const inputPath = path.join(config.inputDir, filename);
    const outputFilename = `${baseName}.module`;
    const outputPath = path.join(config.outputDir, outputFilename);

    // Skip if already processed
    if (fileExists(outputPath)) {
      progress.logItem(i + 1, inputFiles.length, `Skipping ${filename} (already processed)`);
      progress.incrementSkipped();
      continue;
    }

    try {
      progress.logItem(i + 1, inputFiles.length, `Processing: ${filename}`);

      const markdownText = readTextFile(inputPath);
      const fileSizeKB = getFileSizeKB(inputPath);

      console.log(`  - File size: ${fileSizeKB.toFixed(1)} KB`);
      
      if (fileSizeKB > 500) {
        progress.logWarning('Large file - may take longer or hit token limits');
      }

      // Call Gemini API
      const userPrompt = `Convert this ${config.courseName} module to module format:\n\n${markdownText}`;
      const moduleResponse = await callGemini(userPrompt, {
        model: config.model,
        systemPrompt: systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        thinkingBudget: config.thinkingBudget,
      });

      // Strip markdown code blocks if present
      const cleanModule = stripMarkdownCodeBlocks(moduleResponse);

      // Validation warnings (format rules live in shared module_format.md)
      const warnings = validateModuleOutput(cleanModule);
      for (const w of warnings) progress.logWarning(w);
      
      // Save the module file
      writeTextFile(outputPath, cleanModule);

      progress.logSuccess(`Saved: ${outputFilename}`);
      const sectionCount = (cleanModule.match(/^\$(LESSON|DIALOGUE|EXERCISE|GRAMMAR|CHAT)/gm) || []).length;
      console.log(`  - Sections: ${sectionCount}`);
      progress.incrementSuccess();

      // Wait between requests
      if (i < inputFiles.length - 1) {
        progress.logWaiting(config.delayBetweenRequests / 1000);
        await sleep(config.delayBetweenRequests);
      }

    } catch (error) {
      progress.logError(`Error processing ${filename}: ${error.message}`);
      
      // Save error details
      const errorPath = path.join(config.outputDir, `${baseName}.error.txt`);
      writeTextFile(errorPath, `Error: ${error.message}\n\nStack: ${error.stack}`);
      
      progress.incrementError();

      // Handle rate limits
      if (isRateLimitError(error)) {
        console.log('  ⏸ Rate limit hit, waiting 30 seconds...\n');
        await sleep(30000);
      } else if (error.message.includes('RESOURCE_EXHAUSTED')) {
        console.log('  ⏸ Resource exhausted, waiting 60 seconds...\n');
        await sleep(60000);
      } else {
        await sleep(3000);
      }
    }
  }

  progress.printSummary({ outputDir: config.outputDir });
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  convertCourse().catch(console.error);
}

export { convertCourse };


