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
