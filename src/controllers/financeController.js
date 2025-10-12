const Finance = require('../models/Finance');
async function recordFinance(req, res) {
  const { type, amount, source, description, date, unitId, churchId, ministryName } = req.body || {};
  if (!['income','expense'].includes(type)) return res.status(400).json({ error: 'type must be income or expense' });
  const actor = req.user;
  // derive context
  let ctx = { unit: null, church: null, ministryName: null };
  if (unitId) ctx.unit = unitId;
  if (churchId) ctx.church = churchId;
  if (ministryName) ctx.ministryName = ministryName;
  // If missing, infer from actor roles
  if (!ctx.church) ctx.church = actor.church || null;
  if (!ctx.ministryName) {
    const minRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
    if (minRole) ctx.ministryName = minRole.ministryName || null;
  }
  const f = await Finance.create({ type, amount, source, description, date: date||new Date(), recordedBy: req.user._id, ...ctx });
  res.json({ ok: true, finance: f });
}
async function listFinance(req, res) {
  const q = {};
  const list = await Finance.find(q).sort({ date: -1 }).limit(500);
  res.json({ finances: list });
}
module.exports = { recordFinance, listFinance };
