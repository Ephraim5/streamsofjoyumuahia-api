const Announcement = require('../models/Announcement');
async function createAnnouncement(req, res) {
  const { title, body, message, pinned, targetAudience } = req.body;
  const a = await Announcement.create({
    title,
    body: body || message,
    pinned: !!pinned,
    targetAudience,
    author: req.user._id
  });
  try {
    const { broadcastPush } = require('../utils/push');
    broadcastPush({
      title: 'Announcement',
      body: title || (body || message || '').slice(0, 80),
      data: { type: 'announcement', id: a._id.toString() }
    }).catch(()=>{});
  } catch {}
  res.json({ ok: true, announcement: a });
}
async function listAnnouncements(req, res) {
  const list = await Announcement.find().sort({ pinned: -1, createdAt: -1 }).limit(200);
  res.json({ ok: true, announcements: list });
}
async function updateAnnouncement(req, res) {
  const { id } = req.params;
  const update = req.body || {};
  if (update.message && !update.body) update.body = update.message;
  const a = await Announcement.findByIdAndUpdate(id, update, { new: true });
  if (!a) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, announcement: a });
}
async function deleteAnnouncement(req, res) {
  const { id } = req.params;
  const del = await Announcement.findByIdAndDelete(id);
  if (!del) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true });
}
module.exports = { createAnnouncement, listAnnouncements, updateAnnouncement, deleteAnnouncement };
