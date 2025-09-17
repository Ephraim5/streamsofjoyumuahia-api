const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  date: { type: Date, required: true },
  serviceType: String,
  maleCount: Number,
  femaleCount: Number,
  total: Number,
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
