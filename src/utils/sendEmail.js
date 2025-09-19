const nodemailer = require('nodemailer');
let Resend = null;
try { Resend = require('resend').Resend; } catch (_) { /* optional */ }

let cachedTransporter = null;
let transporterVerified = false;
let cachedFallbackTransporter = null;

class EmailSendError extends Error {
  constructor(message, errorCode, original) {
    super(message);
    this.name = 'EmailSendError';
    this.errorCode = errorCode || 'SMTP_UNKNOWN';
    if (original) this.original = original.message || String(original);
  }
}

function buildTransporter(fallback = false) {
  if (!fallback) {
    if (cachedTransporter) return cachedTransporter;
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'gtxm1088.siteground.biz',
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      logger: process.env.EMAIL_DEBUG === 'true',
      debug: process.env.EMAIL_DEBUG === 'true'
    });
    return cachedTransporter;
  } else {
    if (cachedFallbackTransporter) return cachedFallbackTransporter;
    cachedFallbackTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'gtxm1088.siteground.biz',
      port: 587,
      secure: false, // STARTTLS
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      requireTLS: true,
      logger: process.env.EMAIL_DEBUG === 'true',
      debug: process.env.EMAIL_DEBUG === 'true'
    });
    return cachedFallbackTransporter;
  }
}

async function ensureVerified(transporter) {
  if (transporterVerified) return;
  try {
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP verify timeout')), 8_000))
    ]);
    transporterVerified = true;
    console.log('SMTP transporter verified.');
  } catch (e) {
    console.warn('SMTP verify failed (continuing):', e.message);
    // We let sendMail attempt anyway; some servers fail verify but still send.
  }
}

const sendEmail = async (to, subject, html) => {
  if (process.env.SKIP_EMAIL === 'true') {
    console.log(`[SKIP_EMAIL] Would send to=${to} subject="${subject}"`);
    return { skipped: true };
  }
  if (!to) throw new Error('Missing recipient');
  const primary = buildTransporter(false);
  await ensureVerified(primary);
  const attemptSend = async (transporter, isFallback = false) => {
    const sendPromise = transporter.sendMail({
      from: `"Chantal Ekabe Ministry" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    const info = await Promise.race([
      sendPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP send timeout')), 15_000))
    ]);
    console.log(`Email sent to ${to}${isFallback ? ' (fallback)' : ''}`);
    return info;
  };

  const classify = (error) => {
    if (error.message === 'SMTP send timeout') return 'SMTP_TIMEOUT';
    if (/timeout/i.test(error.message)) return 'SMTP_TIMEOUT';
    if (['EAUTH'].includes(error.code)) return 'SMTP_AUTH';
    if (['ENOTFOUND','EAI_AGAIN'].includes(error.code)) return 'SMTP_DNS';
    if (['ECONNECTION','ECONNREFUSED','EHOSTUNREACH','ETIMEDOUT'].includes(error.code)) return 'SMTP_CONNECT';
    if (/self[- ]signed/i.test(error.message)) return 'SMTP_TLS';
    return 'SMTP_UNKNOWN';
  };

  try {
    return await attemptSend(primary, false);
  } catch (err1) {
    const code1 = classify(err1);
    const fallbackEligible = ['SMTP_TIMEOUT','SMTP_CONNECT','SMTP_TLS'].includes(code1) && (process.env.SMTP_FALLBACK !== 'false');
    if (!fallbackEligible) {
      console.error('Failed to send email (no fallback):', { code: code1, err: err1.message });
      // Try Resend API if configured
      if (process.env.RESEND_API_KEY && Resend) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: `Chantal Ekabe Ministry <${process.env.RESEND_FROM || process.env.EMAIL_USER}>`,
            to,
            subject,
            html
          });
          console.log(`Email sent via Resend API to ${to}`);
          return { provider: 'resend' };
        } catch (apiErr) {
          console.error('Resend API fallback failed:', apiErr.message);
        }
      }
      throw new EmailSendError('Email delivery failed.', code1, err1);
    }
    console.warn('Primary SMTP failed, attempting fallback to 587 STARTTLS...', { code: code1 });
    try {
      const fb = buildTransporter(true);
      await ensureVerified(fb);
      return await attemptSend(fb, true);
    } catch (err2) {
      const code2 = classify(err2);
      console.error('Fallback SMTP failed:', { primaryCode: code1, fallbackCode: code2, err: err2.message });
      // Resend fallback after both SMTP attempts
      if (process.env.RESEND_API_KEY && Resend) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: `Chantal Ekabe Ministry <${process.env.RESEND_FROM || process.env.EMAIL_USER}>`,
            to,
            subject,
            html
          });
          console.log(`Email sent via Resend API to ${to} (after SMTP fallback)`);
          return { provider: 'resend' };
        } catch (apiErr) {
          console.error('Resend API fallback failed:', apiErr.message);
        }
      }
      throw new EmailSendError('Email delivery failed.', code2, err2);
    }
  }
};

module.exports = sendEmail;
