const MailOtp = require('../models/MailOtp');
const sendEmail = require('../utils/sendEmail');

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/send-mail-otp { email }
exports.sendMailOtp = async (req, res) => {
  try {
    let { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, message: 'Email required.' });
    }
    email = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Invalid email format.' });
    }

    // Simple throttle: if an OTP was created less than 45 seconds ago, block resend
    const existing = await MailOtp.findOne({ email }).lean();
    if (existing && Date.now() - new Date(existing.createdAt).getTime() < 45 * 1000) {
      return res.status(429).json({ ok: false, message: 'Please wait before requesting another code.' });
    }

    const otp = generateOtp();
    await MailOtp.findOneAndUpdate(
      { email },
      { email, otp, createdAt: new Date(), attempts: 0 },
      { upsert: true }
    );

    try {
      await sendEmail(
        email,
        'Your Streams of Joy Verification Code',
        `<div style='font-size:1.2em'>Your verification code is <b>${otp}</b>. It expires in 10 minutes.</div>`
      );
    } catch (mailErr) {
      await MailOtp.deleteOne({ email }); // rollback
      const code = mailErr && mailErr.errorCode ? mailErr.errorCode : 'SMTP_UNKNOWN';
      return res.status(502).json({ ok: false, message: 'Email delivery failed. Try again shortly.', code });
    }

    return res.json({ ok: true, message: 'OTP sent to email.' });
  } catch (e) {
    console.error('sendMailOtp error', e);
    return res.status(500).json({ ok: false, message: 'Failed to send OTP.' });
  }
};

// POST /api/verify-mail-otp { email, otp }
exports.verifyMailOtp = async (req, res) => {
  try {
    let { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ ok: false, message: 'Email and OTP required.' });
    email = email.trim().toLowerCase();
    const rec = await MailOtp.findOne({ email });
    if (!rec) return res.status(400).json({ ok: false, message: 'No OTP found for this email.' });
    const ageMin = (Date.now() - new Date(rec.createdAt).getTime()) / 60000;
    if (ageMin > 10) {
      await MailOtp.deleteOne({ _id: rec._id });
      return res.status(400).json({ ok: false, message: 'OTP expired.' });
    }
    if (rec.otp !== otp) {
      await MailOtp.updateOne({ _id: rec._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ ok: false, message: 'Invalid OTP.' });
    }
    await MailOtp.deleteOne({ _id: rec._id });
    return res.json({ ok: true, message: 'Email verified.' });
  } catch (e) {
    console.error('verifyMailOtp error', e);
    return res.status(500).json({ ok: false, message: 'Verification failed.' });
  }
};
