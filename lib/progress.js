/**
 * Progress Tracking Utilities
 * Common patterns for tracking and displaying progress
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Progress tracker class
 */
class ProgressTracker {
  constructor(total) {
    this.total = total;
    this.success = 0;
    this.error = 0;
    this.skipped = 0;
  }

  incrementSuccess() {
    this.success++;
  }

  incrementError() {
    this.error++;
  }

  incrementSkipped() {
    this.skipped++;
  }

  get processed() {
    return this.success + this.error + this.skipped;
  }

  logItem(index, total, message) {
    console.log(`[${index}/${total}] ${message}`);
  }

  logSuccess(message) {
    console.log(`  ✓ ${message}`);
  }

  logError(message) {
    console.error(`  ✗ ${message}`);
  }

  logWarning(message) {
    console.log(`  ⚠ ${message}`);
  }

  logWaiting(seconds) {
    console.log(`  ⏸ Waiting ${seconds} seconds...\n`);
  }

  printSummary(labels = {}) {
    console.log('\n=== Summary ===');
    console.log(`Total: ${this.total}`);
    console.log(`Successfully processed: ${this.success}`);
    console.log(`Skipped (already done): ${this.skipped}`);
    console.log(`Errors: ${this.error}`);
    
    if (labels.outputDir) {
      console.log(`Output saved to: ${labels.outputDir}`);
    }
  }
}

/**
 * Retry handler for rate limits
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Maximum retries (default: 3)
 * @param {number} baseDelay - Base delay in ms (default: 2000)
 * @param {Function} isRetryableError - Function to check if error is retryable
 * @returns {Promise<any>} - Result of function
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000, isRetryableError = null) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      const shouldRetry = isRetryableError ? isRetryableError(error) : true;
      
      if (!shouldRetry || attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`  Retry attempt ${attempt}/${maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

export {
  sleep,
  ProgressTracker,
  retryWithBackoff,
};



