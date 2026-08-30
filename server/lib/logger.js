// =============================================
// server/lib/logger.js - Environment-Aware Logging
// Full error objects are only logged in development;
// production always sees just the message.
// =============================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function logError(context, err) {
  console.error(`[${context}]`, err?.message || err);
  if (!IS_PRODUCTION) {
    console.error(`[${context}] [DEBUG]`, err);
  }
}

module.exports = { logError };
