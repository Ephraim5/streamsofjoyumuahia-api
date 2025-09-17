const mongoose = require('mongoose');

const AccessCodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  role: { type: String, enum: ['SuperAdmin','UnitLeader','Member'], required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AccessCode', AccessCodeSchema);
