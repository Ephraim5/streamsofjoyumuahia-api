const nodemailer = require('nodemailer');

let cachedTransporter = null;
let transporterVerified = false;

function buildTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'gtxm1088.siteground.biz',
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    // Connection timeout & greeting timeout to avoid long hangs
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  });
  return cachedTransporter;
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
  const transporter = buildTransporter();
  await ensureVerified(transporter);
  try {
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
    console.log(`Email sent to ${to}`);
    return info;
  } catch (error) {
    console.error('Failed to send email:', error.message);
    throw new Error('Email delivery failed.');
  }
};

module.exports = sendEmail;
