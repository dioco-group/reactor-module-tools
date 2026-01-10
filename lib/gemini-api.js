/**
 * Gemini API Helper Library
 * Common functions for calling Google's Gemini AI API
 */

const path = require('path');

// Load .env file from repo root
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (e) {
  // dotenv not installed, rely on environment variables
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Call Gemini API using OpenAI-compatible endpoint
 * @param {string} prompt - The prompt/question to send
 * @param {Object} options - Optional configuration
 * @param {string} options.model - Model to use (default: gemini-2.5-pro)
 * @param {number} options.temperature - Temperature 0-1 (default: 0.3)
 * @param {number} options.maxTokens - Max tokens to generate (default: 4000)
 * @param {string} options.systemPrompt - Optional system prompt
 * @param {number} options.timeout - Timeout in ms (default: 300000 = 5 min)
 * @returns {Promise<string>} - The generated text response
 */
async function callGemini(prompt, options = {}) {
  const {
    model = 'gemini-2.5-pro',
    temperature = 0.3,
    maxTokens = 4000,
    systemPrompt = null,
    timeout = 300000
  } = options;

  const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const requestBody = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    
    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout / 1000} seconds`);
    }
    throw error;
  }
}

/**
 * Remove markdown code blocks from response if present
 * @param {string} text - Text that may contain markdown code blocks
 * @returns {string} - Clean text
 */
function stripMarkdownCodeBlocks(text) {
  let cleaned = text.trim();
  
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\n/, '').replace(/\n```$/, '');
  }
  
  return cleaned.trim();
}

/**
 * Check if an error is a rate limit error
 * @param {Error} error - The error to check
 * @returns {boolean} - True if it's a rate limit error
 */
function isRateLimitError(error) {
  const message = error.message.toLowerCase();
  return message.includes('429') || 
         message.includes('rate limit') ||
         message.includes('resource_exhausted');
}

module.exports = {
  callGemini,
  stripMarkdownCodeBlocks,
  isRateLimitError,
  GEMINI_API_KEY
};



