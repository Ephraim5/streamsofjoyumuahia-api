const mongoose = require('mongoose');
const FinanceSchema = new mongoose.Schema({
  type: { type: String, enum: ['income','expense'], required: true },
  amount: { type: Number, required: true },
  source: String,
  description: String,
  date: { type: Date, default: Date.now },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Context for aggregation
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', default: null },
  ministryName: { type: String, default: null }
});
module.exports = mongoose.model('Finance', FinanceSchema);
