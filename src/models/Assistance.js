const mongoose = require('mongoose');

const AssistanceSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  memberName: { type: String, required: true },
  phone: { type: String, default: '' },
  assistedOn: { type: Date, required: true },
  reason: { type: String, default: '' },
  howHelped: { type: String, default: '' },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

AssistanceSchema.index({ unit: 1, assistedOn: -1 });

module.exports = mongoose.model('Assistance', AssistanceSchema);
