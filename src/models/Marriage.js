const mongoose = require('mongoose');

const MarriageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  note: { type: String },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Marriage', MarriageSchema);
