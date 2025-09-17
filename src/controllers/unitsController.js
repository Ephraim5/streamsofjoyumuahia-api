const Unit = require('../models/Unit');
const User = require('../models/User');

async function createUnit(req, res) {
  // only SuperAdmin
  if (!req.user.roles.some(r=>r.role==='SuperAdmin')) return res.status(403).json({ error: 'Requires SuperAdmin' });
  const { name, description } = req.body;
  const unit = await Unit.create({ name, description });
  res.json({ unit });
}

async function addMember(req, res) {
  const unitId = req.params.id;
  const { phone, firstName, surname, title } = req.body;
  const normalizedPhone = (require('../utils/phone').normalizeNigeriaPhone)(phone);
  let user = await User.findOne({ phone: normalizedPhone });
  if (!user) {
    user = await User.create({ title, firstName, surname, phone: normalizedPhone, isVerified: false, roles: [{ role: 'Member', unit: unitId }]});
  } else {
    // add Member role
    user.roles = user.roles || [];
    user.roles.push({ role: 'Member', unit: unitId });
    await user.save();
  }
  // add to unit
  const unit = await Unit.findById(unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  if (!unit.members.includes(user._id)) {
    unit.members.push(user._id);
    await unit.save();
  }
  res.json({ ok: true, user, unit });
}

async function listUnits(req, res) {
  const units = await Unit.find().populate('leaders members', 'firstName surname phone email');
  res.json({ units });
}

module.exports = { createUnit, addMember, listUnits };
