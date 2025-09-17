const Testimony = require('../models/Testimony');
async function submitTestimony(req, res) {
  const { title, body } = req.body;
  const t = await Testimony.create({ user: req.user._id, title, body, approved: false });
  res.json({ ok: true, testimony: t });
}
async function listTestimonies(req, res) {
  // superadmin sees all, others see approved or their own
  const isSuper = req.user.roles.some(r=>r.role==='SuperAdmin');
  let q = {};
  if (!isSuper) q = { $or: [{ approved: true }, { user: req.user._id }] };
  const list = await Testimony.find(q).sort({ createdAt: -1 });
  res.json({ testimonies: list });
}
module.exports = { submitTestimony, listTestimonies };
