const mongoose = require('mongoose');
const SoulSchema = new mongoose.Schema({
  name: String,
  phone: String,
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dateWon: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Soul', SoulSchema);
