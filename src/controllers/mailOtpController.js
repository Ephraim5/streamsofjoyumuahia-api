const MailOtp = require('../models/MailOtp');
const sendEmail = require('../utils/sendEmail');
const { buildOtpEmail } = require('../utils/otpEmailTemplate');
const User = require('../models/User');
const Unit = require('../models/Unit');

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

    // Sanitize: trim and strip trailing punctuation that users often add accidentally
    email = email.trim().toLowerCase().replace(/[\s]+/g, '');
    // Remove trailing characters like . , ; : if present (common copy/paste artifact)
    email = email.replace(/[\.,;:]+$/, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Invalid email format.' });
    }

    // Simple throttle: if an OTP was created less than 45 seconds ago, block resend
  const existing = await MailOtp.findOne({ email }).lean();
  const user = await User.findOne({ email });

    if (existing && Date.now() - new Date(existing.createdAt).getTime() < 45 * 1000) {
      return res.status(429).json({ ok: false, message: 'Please wait before requesting another code.' });
    }
    if (user && user.isVerified) {
      return res.status(200).json({
        ok: true, 
        message: 'Email not sent UAV',
        role: user ? user.activeRole : null,
        user,
        userId: user ? user._id : undefined
      });
    }
    const otp = generateOtp();
    await MailOtp.findOneAndUpdate(
      { email },
      { email, otp, createdAt: new Date(), attempts: 0 },
      { upsert: true }
    );
    if (process.env.EMAIL_DEBUG === 'true') {
      console.log('[mailOtp] Prepared OTP record', { email, otp, createdAt: new Date().toISOString() });
    }

    try {
      const html = buildOtpEmail({ code: otp, minutesValid: 10, supportEmail: process.env.SUPPORT_EMAIL || 'support@streamsofjoyumuahia.org' });
      const sendResult = await sendEmail(
        email,
        'Your Streams of Joy Verification Code',
        html
      );
      if (process.env.EMAIL_DEBUG === 'true') {
        console.log('[mailOtp] Email dispatch success', { email, provider: sendResult?.provider, from: sendResult?.from });
      }
    } catch (mailErr) {
      await MailOtp.deleteOne({ email }); // rollback
      const code = mailErr && mailErr.errorCode ? mailErr.errorCode : 'SMTP_UNKNOWN';
      const original = mailErr && mailErr.original ? mailErr.original : undefined;
      console.error('[mailOtp] Email dispatch failed', { email, code, err: mailErr.message, original, skip: process.env.SKIP_EMAIL, from: process.env.RESEND_FROM });
      let userMessage = 'Email delivery failed. Try again shortly.';
      if (code === 'EMAIL_CONFIG_MISSING') userMessage = 'Email service not configured. Contact support.';
      else if (code === 'EMAIL_DOMAIN_UNVERIFIED') userMessage = 'Email domain not verified. Please wait and retry.';
      else if (code === 'EMAIL_FROM_INVALID') userMessage = 'Email sender incorrectly configured. Admin please fix from address.';
      const payload = { ok: false, message: userMessage, code };
      if (process.env.EMAIL_DEBUG === 'true' && original) payload.original = original;
      return res.status(502).json(payload);
    }

    return res.json({
      ok: true,
      message: 'OTP sent to email.',
      role: user ? user.activeRole : null,
      user,
      userId: user ? user._id : undefined
    });
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
    // If a user already exists we just return its id; else create minimal pending user
    let user = await User.findOne({ email });
    if (!user) {
      // Attempt to attach default organization & church
      let orgId = null, churchId = null;
      try {
        const Org = require('../models/Organization');
        const Church = require('../models/Church');
        const org = await Org.findOne({ slug: 'streams-of-joy' });
        if (org) orgId = org._id;
        const church = await Church.findOne({ slug: 'soj-umuahia' });
        if (church) churchId = church._id;
      } catch (e) { /* non-fatal */ }
      user = await User.create({
        email,
        firstName: 'Pending',
        surname: 'User',
        phone: 'PENDING_' + Date.now(), // placeholder
        isVerified: true,
        approved: false,
        roles: [],
        activeRole: null,
        organization: orgId,
        church: churchId,
        churches: churchId ? [churchId] : [],
        multi: false
      });
    }
    return res.json({ ok: true, message: 'Email verified.', userId: user._id, existing: !!user.passwordHash, approved: user.approved });
  } catch (e) {
    console.error('verifyMailOtp error', e);
    return res.status(500).json({ ok: false, message: 'Verification failed.' });
  }
};

// POST /api/auth/complete-regular { userId, firstName, surname, middleName, activeRole, unitsLed[], unitsMember[], gender, dob, occupation, employmentStatus, maritalStatus, password }
exports.completeRegularRegistration = async (req, res) => {
  try {
    const {
      userId, firstName, surname, middleName, activeRole,
      unitsLed = [], unitsMember = [], gender, dob, occupation,
      employmentStatus, maritalStatus, password, phone
    } = req.body || {};
    if (!userId || !firstName || !surname || !activeRole || !password) {
      return res.status(400).json({ ok: false, message: 'Missing required fields' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
    if (user.passwordHash) return res.status(400).json({ ok: false, message: 'Already completed registration' });
  user.firstName = firstName;
    user.surname = surname;
    user.middleName = middleName || '';
    user.activeRole = activeRole;
    // roles assignment
    // Build roles with unit references where applicable
    const roleEntries = [];
    if (activeRole === 'UnitLeader') {
      if (unitsLed.length === 0) {
        // allow but warn via log
        console.warn('[completeRegularRegistration] UnitLeader with no unitsLed supplied', userId);
      }
      unitsLed.forEach(uId => roleEntries.push({ role: 'UnitLeader', unit: uId }));
      // Members list can also optionally be provided (dual membership)
      unitsMember.forEach(uId => roleEntries.push({ role: 'Member', unit: uId }));
    } else if (activeRole === 'Member') {
      // Plain member; allow multi-unit membership if provided
      if (unitsMember.length === 0) {
        console.warn('[completeRegularRegistration] Member with no unitsMember supplied', userId);
      }
      unitsMember.forEach(uId => roleEntries.push({ role: 'Member', unit: uId }));
    }
    // Merge with any existing roles (should be empty at this stage)
    user.roles = (user.roles || []).concat(roleEntries);
    // profile extras
    user.profile = user.profile || {};
    if (gender) user.profile.gender = gender;
    if (dob) user.profile.dob = new Date(dob);
    if (occupation) user.profile.occupation = occupation;
    if (employmentStatus) user.profile.employmentStatus = employmentStatus;
    if (maritalStatus) user.profile.maritalStatus = maritalStatus;
    // password
    user.passwordHash = await require('bcrypt').hash(password, 10);
    if (phone) {
      const existingPhone = await User.findOne({ phone: phone });
      if (existingPhone && existingPhone._id.toString() !== user._id.toString()) {
        return res.status(400).json({ ok:false, message:'Phone already in use' });
      }
      user.phone = phone; // assume normalization on client; reuse existing util if needed
    }
    // Attach default hierarchy if missing
    if (!user.organization || !user.church) {
      try {
        const Org = require('../models/Organization');
        const Church = require('../models/Church');
        const org = await Org.findOne({ slug: 'streams-of-joy' });
        const church = await Church.findOne({ slug: 'soj-umuahia' });
        if (org && !user.organization) user.organization = org._id;
        if (church && !user.church) user.church = church._id;
        if (church && !(user.churches||[]).some(c=>c.toString()===church._id.toString())) user.churches = [church._id];
      } catch (e) { /* non-fatal */ }
    }
    user.isVerified = true;
    user.approved = false; // must be approved by SuperAdmin or UnitLeader (if member)
    await user.save();

    // Update Unit documents to reflect leadership / membership
    const unitOps = [];
    unitsLed.forEach(uId => {
      unitOps.push(Unit.updateOne({ _id: uId }, { $addToSet: { leaders: user._id } }).exec());
    });
    unitsMember.forEach(uId => {
      unitOps.push(Unit.updateOne({ _id: uId }, { $addToSet: { members: user._id } }).exec());
    });
    if (unitOps.length) {
      try { await Promise.all(unitOps); } catch (e) { console.error('Unit linking failed', e.message); }
    }
    return res.json({ ok: true, userId: user._id, approved: user.approved });
  } catch (e) {
    console.error('completeRegularRegistration error', e);
    return res.status(500).json({ ok: false, message: 'Completion failed', error: e.message });
  }
};
