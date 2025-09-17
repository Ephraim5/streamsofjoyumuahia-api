const User = require('../models/User');
const bcrypt = require('bcrypt');
const { normalizeNigeriaPhone } = require('../utils/phone');

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

module.exports = { getMe, updateUser, listUsers };
