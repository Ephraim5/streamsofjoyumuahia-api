const Finance = require('../models/Finance');
async function recordFinance(req, res) {
  const { type, amount, source, description, date } = req.body;
  if (!['income','expense'].includes(type)) return res.status(400).json({ error: 'type must be income or expense' });
  const f = await Finance.create({ type, amount, source, description, date: date||new Date(), recordedBy: req.user._id });
  res.json({ ok: true, finance: f });
}
async function listFinance(req, res) {
  const q = {};
  const list = await Finance.find(q).sort({ date: -1 }).limit(500);
  res.json({ finances: list });
}
module.exports = { recordFinance, listFinance };
