const mongoose = require('mongoose');
const FinanceSchema = new mongoose.Schema({
  type: { type: String, enum: ['income','expense'], required: true },
  amount: { type: Number, required: true },
  source: String,
  description: String,
  date: { type: Date, default: Date.now },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
module.exports = mongoose.model('Finance', FinanceSchema);
