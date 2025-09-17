const Announcement = require('../models/Announcement');
async function createAnnouncement(req, res) {
  const { title, body, pinned } = req.body;
  const a = await Announcement.create({ title, body, pinned: !!pinned, author: req.user._id });
  res.json({ ok: true, announcement: a });
}
async function listAnnouncements(req, res) {
  const list = await Announcement.find().sort({ pinned: -1, createdAt: -1 }).limit(200);
  res.json({ announcements: list });
}
module.exports = { createAnnouncement, listAnnouncements };
