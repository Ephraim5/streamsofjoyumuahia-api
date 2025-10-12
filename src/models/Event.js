const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  title: String,
  venue: String,
  description: String,
  date: Date,
  eventType: String,
  tags: [{ type: String }],
  status: { type: String, enum: ['Upcoming','Past'], default: 'Upcoming' },
  reminder: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // audience scoping
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church' },
  ministryName: { type: String },
  visibility: { type: String, enum: ['church','ministry'], default: 'church' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', EventSchema);
