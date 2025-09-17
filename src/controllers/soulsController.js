const Soul = require('../models/Soul');
async function addSoul(req, res) {
  const { name, phone, unitId, dateWon } = req.body;
  const s = await Soul.create({ name, phone, unit: unitId, addedBy: req.user._id, dateWon: dateWon||new Date() });
  res.json({ ok: true, soul: s });
}
async function listSouls(req, res) {
  const isSuper = req.user.roles.some(r=>r.role==='SuperAdmin');
  let q = {};
  if (!isSuper) {
    // If unit leader, show souls for their unit(s)
    const unitIds = (req.user.roles||[]).filter(r=>r.role==='UnitLeader' && r.unit).map(r=>r.unit);
    if (unitIds.length) q = { unit: { $in: unitIds } };
    else q = { addedBy: req.user._id };
  }
  const list = await Soul.find(q).sort({ dateWon: -1 }).limit(500);
  res.json({ souls: list });
}
module.exports = { addSoul, listSouls };
