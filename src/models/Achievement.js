const mongoose = require('mongoose');

// Unit Achievement: records notable achievements per unit
// Fields kept minimal to match app UI. Extend if needed later (attachments, tags, etc.)
const AchievementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

AchievementSchema.index({ unit: 1, date: -1 });

module.exports = mongoose.model('Achievement', AchievementSchema);
