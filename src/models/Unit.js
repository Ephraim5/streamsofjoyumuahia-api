const mongoose = require('mongoose');

const UnitSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: false }, // newly added hierarchy link
  ministryName: { type: String, default: null }, // optional, matches a ministry in Church.ministries
  leaders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Unit', UnitSchema);
