const mongoose = require('mongoose');
const SoulSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  gender: { type: String, enum: ['Male','Female'], required: false },
  ageRange: { type: String }, // e.g., "21 - 30"
  convertedThrough: { type: String }, // e.g., Evangelism, Crusade, Friend, Other
  location: { type: String },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dateWon: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Soul', SoulSchema);
