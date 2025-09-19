// Resend-only implementation (SMTP removed)
let Resend = null;
try { Resend = require('resend').Resend; } catch (_) { /* dependency should exist */ }
const { getResendConfig } = require('./resendConfig');

class EmailSendError extends Error {
  constructor(message, errorCode, original) {
    super(message);
    this.name = 'EmailSendError';
    this.errorCode = errorCode || 'EMAIL_UNKNOWN';
    if (original) this.original = original.message || String(original);
  }
}

// Map Resend / fetch style errors into prior SMTP_* codes so callers need no change.
function classify(err) {
  const msg = (err && err.message) ? err.message : String(err || '');
  if (/domain is not verified/i.test(msg)) return 'EMAIL_DOMAIN_UNVERIFIED';
  if (/missing resend_api_key/i.test(msg)) return 'EMAIL_CONFIG_MISSING';
  if (/timeout|network/i.test(msg)) return 'SMTP_TIMEOUT';
  if (/dns|ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'SMTP_DNS';
  if (/unauth|forbidden|401|403/i.test(msg)) return 'SMTP_AUTH';
  if (/connect|ECONN|network/i.test(msg)) return 'SMTP_CONNECT';
  return 'SMTP_UNKNOWN';
}

const resendClient = (apiKey) => {
  if (!Resend) throw new Error('Resend library not installed');
  if (!apiKey) throw new Error('Missing RESEND_API_KEY');
  return new Resend(apiKey);
};

const sendEmail = async (to, subject, html) => {
  if (process.env.SKIP_EMAIL === 'true') {
    console.log(`[SKIP_EMAIL] Would send to=${to} subject="${subject}"`);
    return { skipped: true };
  }
  if (!to) throw new Error('Missing recipient');
  try {
    const { apiKey, from: configuredFrom } = getResendConfig();
    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY');
    }
    const client = resendClient(apiKey);
    const primaryFrom = configuredFrom || 'no-reply@example.com';
    const attempt = async (fromAddr, label='primary') => {
      const result = await client.emails.send({
        from: `Streams Of Joy Mobile <${fromAddr}>`,
        to,
        subject,
        html
      });
      if (result?.error) throw new Error(result.error.message || 'Unknown Resend error');
      console.log(`Email sent via Resend (${label}) to ${to}`);
      return { provider: 'resend', id: result?.data?.id, from: fromAddr };
    };
    try {
      return await attempt(primaryFrom, 'primary');
    } catch (inner) {
      const codeInner = classify(inner);
      if (codeInner === 'EMAIL_DOMAIN_UNVERIFIED' && process.env.RESEND_ALLOW_TEST_FROM === 'true') {
        console.warn('[email] Domain unverified. Retrying with Resend test sender.');
        return await attempt('onboarding@resend.dev', 'test-fallback');
      }
      throw inner;
    }
  } catch (err) {
    const code = classify(err);
    console.error('Resend email send failed:', { code, err: err.message });
    throw new EmailSendError('Email delivery failed.', code, err);
  }
};

module.exports = sendEmail;
