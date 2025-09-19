// Resend-only implementation (SMTP removed)
let Resend = null;
try { Resend = require('resend').Resend; } catch (_) { /* dependency should exist */ }

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
  if (/timeout|network/i.test(msg)) return 'SMTP_TIMEOUT';
  if (/dns|ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'SMTP_DNS';
  if (/unauth|forbidden|401|403/i.test(msg)) return 'SMTP_AUTH';
  if (/connect|ECONN|network/i.test(msg)) return 'SMTP_CONNECT';
  return 'SMTP_UNKNOWN';
}

const resendClient = () => {
  if (!Resend) throw new Error('Resend library not installed');
  if (!process.env.RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY');
  return new Resend(process.env.RESEND_API_KEY);
};

const sendEmail = async (to, subject, html) => {
  if (process.env.SKIP_EMAIL === 'true') {
    console.log(`[SKIP_EMAIL] Would send to=${to} subject="${subject}"`);
    return { skipped: true };
  }
  if (!to) throw new Error('Missing recipient');
  try {
    const client = resendClient();
    const fromAddress = process.env.RESEND_FROM || process.env.EMAIL_USER || 'no-reply@example.com';
    const result = await client.emails.send({
      from: `Streams Of Joy Mobile <${fromAddress}>`,
      to,
      subject,
      html
    });
    if (result?.error) {
      // Resend returns { error: { name, message } } shape sometimes
      throw new Error(result.error.message || 'Unknown Resend error');
    }
    console.log(`Email sent via Resend to ${to}`);
    return { provider: 'resend', id: result?.data?.id };
  } catch (err) {
    const code = classify(err);
    console.error('Resend email send failed:', { code, err: err.message });
    throw new EmailSendError('Email delivery failed.', code, err);
  }
};

module.exports = sendEmail;
