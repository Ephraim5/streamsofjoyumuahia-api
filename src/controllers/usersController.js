const User = require('../models/User');
const bcrypt = require('bcrypt');
const { normalizeNigeriaPhone } = require('../utils/phone');
const AccessCode = require('../models/AccessCode');

// Public minimal email lookup (used by onboarding). Returns limited safe fields.
async function lookupEmail(req, res) {
  try {
    let { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, message: 'Email required' });
    }
    email = email.trim();
    // Basic format check to fail fast (not exhaustive)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Invalid email format' });
    }
    let regex;
    try {
      // Escape special regex chars in email just in case
      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp('^' + escaped + '$', 'i');
    } catch (rxErr) {
      console.warn('lookupEmail regex build failed', rxErr);
      return res.status(400).json({ ok: false, message: 'Invalid email input' });
    }
    const user = await User.findOne({ email: regex }).lean();
    if (!user) return res.json({ ok: true, exists: false });
    const primaryRole = user.activeRole || (user.roles && user.roles[0] && user.roles[0].role) || null;
    return res.json({
      ok: true,
      exists: true,
      role: primaryRole,
      userId: user._id,
      user: {
        title: user.title || '',
        firstName: user.firstName || '',
        middleName: user.middleName || '',
        surname: user.surname || '',
        email: user.email || '',
        activeRole: user.activeRole || primaryRole,
        roles: user.roles || []
      }
    });
  } catch (e) {
    console.error('lookupEmail error', e);
    return res.status(500).json({ ok: false, message: 'Lookup failed', error: e.message });
  }
}

async function getMe(req, res) {
  const u = await User.findById(req.user._id).select('-passwordHash -__v').lean();
  res.json({ ok: true, user: u });
}

// Secure fetch by id (used for profile recovery after login)
async function getUserById(req, res) {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ ok: false, message: 'Invalid userId format' });
    }
    const user = await User.findById(id).select('-passwordHash -__v');
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
    return res.json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Lookup failed', error: e.message });
  }
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

module.exports = { getMe, updateUser, listUsers, lookupEmail, getUserById };
