const mongoose = require('mongoose');

const RecoveredAddictSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  age: { type: Number },
  maritalStatus: { type: String },
  addictionType: { type: String, required: true },
  dateOfRecovery: { type: Date, required: true },
  phone: { type: String },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('RecoveredAddict', RecoveredAddictSchema);
