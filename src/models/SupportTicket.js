const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true },
  phone: { type: String },
  category: { type: String, required: true, enum: ['Login Issues','Performance','Bug Report','Feature Request','Data Issue','Other'] },
  description: { type: String, required: true },
  screenshotUrl: { type: String },
  status: { type: String, enum:['open','in_progress','resolved','closed'], default: 'open' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
