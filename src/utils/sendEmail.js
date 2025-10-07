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

  const smtpOnly = (process.env.EMAIL_SMTP_ONLY === 'true');

  // 1. Try SMTP if configured (or if smtpOnly forced)
  if (preferSmtp || smtpOnly) {
    try {
      const rawHost = (process.env.EMAIL_HOST || '').trim();
      const portPrimary = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 465;
      const securePrimary = (process.env.EMAIL_SECURE || 'true') === 'true';
      const connTimeout = process.env.EMAIL_CONN_TIMEOUT_MS ? Number(process.env.EMAIL_CONN_TIMEOUT_MS) : 8000;
      const greetTimeout = process.env.EMAIL_GREETING_TIMEOUT_MS ? Number(process.env.EMAIL_GREETING_TIMEOUT_MS) : 8000;
      const sockTimeout = process.env.EMAIL_SOCKET_TIMEOUT_MS ? Number(process.env.EMAIL_SOCKET_TIMEOUT_MS) : 10000;
      const tryAlt = (process.env.EMAIL_TRY_ALT_PORT === 'true');
      if (process.env.EMAIL_DEBUG === 'true') {
        console.log('[email][smtp] Attempting primary transport', { host: rawHost, port: portPrimary, secure: securePrimary, connTimeout, greetTimeout, sockTimeout });
      }

      async function attemptSmtp(host, port, secure, label='primary') {
        const transport = nodemailer.createTransport({
          host,
          port,
            secure,
          service: process.env.EMAIL_SERVICE || undefined,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
          connectionTimeout: connTimeout,
          greetingTimeout: greetTimeout,
          socketTimeout: sockTimeout,
          tls: { rejectUnauthorized: false },
        });
        const info = await transport.sendMail({ from: fullFrom, to, subject, html });
        console.log(`[email] SMTP sent (${label})`, { id: info.messageId, to });
        return { provider: 'smtp', id: info.messageId, from: fullFrom };
      }

      try {
        return await attemptSmtp(rawHost, portPrimary, securePrimary, 'primary');
      } catch (primaryErr) {
        const code = classify(primaryErr);
        if (process.env.EMAIL_DEBUG === 'true') {
          console.warn('[email][smtp] Primary attempt failed', { code, message: primaryErr.message });
        }
        // Build fallback attempts list (ports / host variants)
        const attempts = [];
        const baseDomain = rawHost.replace(/^(mail\.|smtp\.)/i, '');
        const hostVariants = [rawHost];
        if (!/^(mail|smtp)\./i.test(rawHost)) {
          hostVariants.push('mail.' + baseDomain, 'smtp.' + baseDomain);
        } else {
          // If starts with mail., add smtp. variant; vice versa
          if (/^mail\./i.test(rawHost)) hostVariants.push('smtp.' + baseDomain);
          if (/^smtp\./i.test(rawHost)) hostVariants.push('mail.' + baseDomain);
        }
        // Remove duplicates
        const uniqueHosts = [...new Set(hostVariants)];
        // Always try alt 587 STARTTLS unless primary was already 587 secure=false
        const wantAltPort = portPrimary !== 587;
        uniqueHosts.forEach(h => {
          if (wantAltPort) attempts.push({ host: h, port: 587, secure: false, label: 'alt-587' });
        });
        // If explicit flag to try alt port earlier, attempts already includes alt; this broadens even without flag
        // Execute attempts sequentially
        for (const att of attempts) {
          try {
            if (process.env.EMAIL_DEBUG === 'true') {
              console.log('[email][smtp] Fallback attempt', att);
            }
            return await attemptSmtp(att.host, att.port, att.secure, att.label + ':' + att.host);
          } catch (e2) {
            if (process.env.EMAIL_DEBUG === 'true') {
              console.warn('[email][smtp] Fallback failed', { host: att.host, port: att.port, msg: e2.message });
            }
          }
        }
        throw primaryErr; // none succeeded
      }
    } catch (smtpErr) {
      const code = classify(smtpErr);
      if (smtpOnly) {
        console.error('[email] SMTP failed and SMTP-only mode enabled', { code, err: smtpErr.message });
        throw new EmailSendError('Email delivery failed (SMTP only mode).', code, smtpErr);
      } else {
        console.warn('[email] SMTP failed, falling back to Resend', { code, err: smtpErr.message });
      }
    }
  }

  if (smtpOnly) {
    throw new EmailSendError('SMTP only mode: no fallback configured.', 'EMAIL_SMTP_ONLY_MODE');
  }

  // 2. Resend fallback (skipped if smtpOnly already returned)
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
