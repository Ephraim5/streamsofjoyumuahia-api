const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Unit = require('../models/Unit');

async function summary(req, res) {
  // basic aggregated info for dashboard
  const totalWorkers = await User.countDocuments();
  const totalUnits = await Unit.countDocuments();
  const attendanceCount = await Attendance.countDocuments();
  res.json({ totalWorkers, totalUnits, attendanceCount });
}

module.exports = { summary };
