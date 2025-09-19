const fs = require('fs');
const path = require('path');

// Load Resend configuration without relying solely on environment variables.
// Priority order:
// 1. Explicit env vars (RESEND_API_KEY, RESEND_FROM)
// 2. Local JSON file: ./resend.local.json (gitignored) with { "apiKey": "re_...", "from": "no-reply@domain" }
// 3. Legacy EMAIL_USER as fallback for from address only.

function loadLocalFile() {
  const filePath = path.resolve(__dirname, '../../resend.local.json');
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[resendConfig] Failed to parse resend.local.json:', e.message);
    return {};
  }
}

function getResendConfig() {
  const local = loadLocalFile();
  const apiKey = process.env.RESEND_API_KEY || local.apiKey || '';
  const from = process.env.RESEND_FROM || local.from || process.env.EMAIL_USER || '';
  return { apiKey, from };
}

module.exports = { getResendConfig };
