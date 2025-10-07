// Hybrid email sender: prefers Nodemailer (SMTP) if configured, else falls back to Resend API.
let Resend = null;
try { Resend = require('resend').Resend; } catch (_) { /* dependency should exist */ }
const nodemailer = require('nodemailer');
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
  if (/invalid `from` field/i.test(msg)) return 'EMAIL_FROM_INVALID';
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

  const preferSmtp = process.env.EMAIL_SERVICE || process.env.EMAIL_HOST;
  const fromName = process.env.EMAIL_FROM_NAME || 'Streams of Joy Umuahia';
  const explicitFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'onboarding@resend.dev';
  const fullFrom = /</.test(explicitFrom) ? explicitFrom : `${fromName} <${explicitFrom}>`;

  // 1. Try SMTP if configured
  if (preferSmtp) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 465,
        secure: (process.env.EMAIL_SECURE || 'true') === 'true',
        service: process.env.EMAIL_SERVICE || undefined,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
      const info = await transport.sendMail({ from: fullFrom, to, subject, html });
      console.log('[email] SMTP sent', { id: info.messageId, to });
      return { provider: 'smtp', id: info.messageId, from: fullFrom };
    } catch (smtpErr) {
      const code = classify(smtpErr);
      console.warn('[email] SMTP failed, falling back to Resend', { code, err: smtpErr.message });
      // Fall through to Resend fallback
    }
  }

  // 2. Resend fallback
  try {
    const { apiKey } = getResendConfig();
    if (!apiKey) throw new Error('Missing RESEND_API_KEY');
    const client = resendClient(apiKey);
    const primaryFrom = explicitFrom.includes('@') ? explicitFrom : 'onboarding@resend.dev';
    const attempt = async (fromAddr, label='primary') => {
      const result = await client.emails.send({ from: fullFrom.replace(explicitFrom, fromAddr), to, subject, html });
      if (result?.error) throw new Error(result.error.message || 'Unknown Resend error');
      console.log(`Email sent via Resend (${label}) to ${to}`);
      return { provider: 'resend', id: result?.data?.id, from: fromAddr };
    };
    try {
      return await attempt(primaryFrom, 'primary');
    } catch (inner) {
      const codeInner = classify(inner);
      if (codeInner === 'EMAIL_DOMAIN_UNVERIFIED' && process.env.RESEND_ALLOW_TEST_FROM === 'true') {
        console.warn('[email] Domain unverified. Retrying with test sender.');
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
