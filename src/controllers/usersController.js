const User = require('../models/User');
const bcrypt = require('bcrypt');
const { normalizeNigeriaPhone } = require('../utils/phone');
const AccessCode = require('../models/AccessCode');

// Public minimal email lookup (used by onboarding). Returns limited safe fields.
async function lookupEmail(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, message: 'Email required' });
    const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') }).lean();
    if (!user) return res.json({ ok: true, exists: false });
    const primaryRole = user.activeRole || (user.roles[0] && user.roles[0].role) || null;
    res.json({ ok: true, exists: true, role: primaryRole, userId: user._id, user: { title: user.title || '', firstName: user.firstName || '', middleName: user.middleName || '', surname: user.surname || '', email: user.email || '', activeRole: user.activeRole, roles: user.roles } });
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Lookup failed', error: e.message });
  }
}

async function getMe(req, res) {
  const u = await User.findById(req.user._id).lean();
  res.json({ user: u });
}

async function updateUser(req, res) {
  const id = req.params.id;
  const payload = req.body;
  // Only allow user or admin to update
  if (req.user._id.toString() !== id && !(req.user.roles || []).some(r=>r.role==='SuperAdmin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (payload.phone) {
    payload.phone = normalizeNigeriaPhone(payload.phone);
  }
  if (payload.password) {
    payload.passwordHash = await bcrypt.hash(payload.password, 10);
    delete payload.password;
  }
  const user = await User.findByIdAndUpdate(id, payload, { new: true });
  res.json({ user });
}

async function listUsers(req, res) {
  const q = req.query.q || '';
  const users = await User.find({ $or: [{ firstName: new RegExp(q, 'i') }, { surname: new RegExp(q, 'i') }, { phone: new RegExp(q, 'i') },{ email: new RegExp(q, 'i')},]}).limit(200);
  res.json({ users });
}

module.exports = { getMe, updateUser, listUsers, lookupEmail };
