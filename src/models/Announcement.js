const mongoose = require('mongoose');
const AnnouncementSchema = new mongoose.Schema({
  title: String,
  body: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Announcement', AnnouncementSchema);
