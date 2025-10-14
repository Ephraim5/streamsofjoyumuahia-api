const mongoose = require('mongoose');

const UnitSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: false }, // newly added hierarchy link
  ministryName: { type: String, default: null }, // optional, matches a ministry in Church.ministries
  leaders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Marks this unit as the designated attendance-taking unit (scoped uniqueness enforced in controller)
  attendanceTaking: { type: Boolean, default: false },
  // Marks this unit as a music unit; enables Songs Released card for its leader & members (view-only for members)
  musicUnit: { type: Boolean, default: false },
  // Optional allowlist of report card keys explicitly enabled for this unit (e.g., ['songs','recovery'])
  enabledReportCards: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Unit', UnitSchema);
