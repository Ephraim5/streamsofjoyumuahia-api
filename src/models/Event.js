const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  title: String,
  venue: String,
  description: String,
  date: Date,
  eventType: String,
  reminder: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', EventSchema);
