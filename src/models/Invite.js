const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  gender: { type: String }, // optional classification
  ageRange: { type: String },
  method: { type: String }, // how they were invited (evangelism, friend, etc.)
  note: { type: String },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  invitedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Invite', InviteSchema);
