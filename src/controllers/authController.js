const User = require('../models/User');
const AccessCode = require('../models/AccessCode');
const { normalizeNigeriaPhone } = require('../utils/phone');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function signToken(user, activeRole) {
  const payload = { userId: user._id, activeRole: activeRole || user.activeRole || (user.roles[0] && user.roles[0].role) || null };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

async function start(req, res) {
  const { phone, accessCode } = req.body;
  console.log(req.body)
  if (!phone && !accessCode) return res.status(400).json({ ok: false, goToPhoneNumberScreen: false, goToOtpScreen: false, error: 'phone or accessCode required' });
  let normalizedPhone = phone ? normalizeNigeriaPhone(phone, false) : null;

  if (accessCode) {
    const ac = await AccessCode.findOne({ code: accessCode });
    if (!ac) return res.status(400).json({ error: 'Invalid access code', ok: false, goToPhoneNumberScreen: false, goToOtpScreen: false });
    if (ac.used) return res.status(400).json({ error: 'Access code already used', ok: false, goToPhoneNumberScreen: false, goToOtpScreen: false });
    if (new Date() > ac.expiresAt) return res.status(400).json({ error: 'Access code expired', ok: false, goToPhoneNumberScreen: false, goToOtpScreen: false });
    return res.json({ ok: true, message: 'Proceed to verify via on client', goToPhoneNumberScreen: true, goToOtpScreen: false,role:AccessCode.role });
  }

  if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone', ok: false, goToPhoneNumberScreen: false, goToOtpScreen: false });

  // For Firebase flow: frontend will send SMS via Firebase. We still respond to help client know if number exists.
  let user = await User.findOne({
    $or: [
      { phone: normalizedPhone },
      { phone: phone },
      {phone:normalizeNigeriaPhone(phone, true)}
    ]
  }); 
  if (!user) {
    return res.status(404).json({ ok: false, error: 'Number not registered. Contact your unit head.', goToPhoneNumberScreen: false, goToOtpScreen: false });
  } else {
    return res.status(200).json({ ok: true, user,role:user.activeRole, message: 'Proceed to verify otp on client', goToPhoneNumberScreen: false, goToOtpScreen: true });
  }

}

// New verify endpoint expects firebase id token

module.exports = { start, signToken };

// Complete SuperAdmin registration after email OTP flow (unauthenticated but constrained)
// Body: { userId, email, title, firstName, middleName, surname, password }
module.exports.completeSuperAdmin = async (req, res) => {
  try {
    const { userId, email, title, firstName, middleName, surname, password } = req.body;
    if (!userId || !email || !firstName || !surname || !password) {
      return res.status(400).json({ ok: false, message: 'Missing required fields' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
    // Must be SuperAdmin role and not yet initialized with a password
    const hasSuperAdmin = (user.roles || []).some(r=>r.role==='SuperAdmin') || user.activeRole==='SuperAdmin';
    if (!hasSuperAdmin) return res.status(403).json({ ok: false, message: 'Not a SuperAdmin user' });
    if (user.isVerified) return res.status(400).json({ ok: false, message: 'Already completed registration' });
    if (user.email && user.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ ok: false, message: 'Email mismatch' });
    }
    user.email = email.toLowerCase();
    user.title = title || user.title;
    user.firstName = firstName || user.firstName;
    user.middleName = middleName || user.middleName;
    user.surname = surname || user.surname;
    const bcrypt = require('bcrypt');
    user.passwordHash = await bcrypt.hash(password, 10);
    user.isVerified = true;
    if (!user.activeRole) user.activeRole = 'SuperAdmin';
    await user.save();
  // Registration no longer returns a JWT. Client must call /api/auth/login afterwards.
  res.json({ ok: true, userId: user._id });
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Registration completion failed', error: e.message });
  }
};

// POST /api/auth/login { userId, password }
module.exports.login = async (req, res) => {
  try {
    const { userId, password } = req.body || {};
    if (!userId || !password) return res.status(400).json({ ok: false, message: 'userId and password required' });
    const user = await User.findById(userId);
    if (!user || !user.passwordHash) return res.status(400).json({ ok: false, message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ ok: false, message: 'Invalid credentials' });
    // Derive active role fallback if not set
    const activeRole = user.activeRole || (user.roles[0] && user.roles[0].role) || null;
    const token = signToken(user, activeRole);
    return res.json({
      ok: true,
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        surname: user.surname,
        activeRole,
        roles: (user.roles || []).map(r => r.role),
        approved: user.approved,
        isVerified: user.isVerified
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Login failed', error: e.message });
  }
};
