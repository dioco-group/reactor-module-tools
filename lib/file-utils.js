/**
 * File Utilities Library
 * Common file system operations
 */

const fs = require('fs');
const path = require('path');

/**
 * Ensure directory exists, create if it doesn't
 * @param {string} dirPath - Path to directory
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read a text file
 * @param {string} filePath - Path to file
 * @returns {string} - File contents
 */
function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write a text file
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 */
function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Get all files in a directory matching a pattern
 * @param {string} dirPath - Directory path
 * @param {RegExp|string} pattern - File pattern (regex or extension like '.txt')
 * @returns {Array<string>} - Sorted array of filenames
 */
function getFiles(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath);
  
  let filtered;
  if (pattern instanceof RegExp) {
    filtered = files.filter(file => pattern.test(file));
  } else if (typeof pattern === 'string') {
    filtered = files.filter(file => file.endsWith(pattern));
  } else {
    filtered = files;
  }

  return filtered.sort();
}

/**
 * Check if file exists
 * @param {string} filePath - Path to file
 * @returns {boolean} - True if file exists
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Get file size in KB
 * @param {string} filePath - Path to file
 * @returns {number} - Size in KB
 */
function getFileSizeKB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / 1024;
}

/**
 * Extract number from filename (e.g., "04.md" -> 4)
 * @param {string} filename - Filename
 * @param {RegExp} pattern - Pattern to extract number (default: /(\d+)\.[^.]+$/)
 * @returns {number|null} - Extracted number or null
 */
function extractNumberFromFilename(filename, pattern = /(\d+)\.[^.]+$/) {
  const match = filename.match(pattern);
  return match ? parseInt(match[1], 10) : null;
}

module.exports = {
  ensureDir,
  readTextFile,
  writeTextFile,
  getFiles,
  fileExists,
  getFileSizeKB,
  extractNumberFromFilename
};



