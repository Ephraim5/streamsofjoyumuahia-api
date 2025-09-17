const Attendance = require('../models/Attendance');
const Unit = require('../models/Unit');

async function submitAttendance(req, res) {
  const { unitId, date, maleCount, femaleCount, serviceType } = req.body;
  const unit = await Unit.findById(unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  // Only unit leaders of unit or superadmin or member with permission can submit
  const isSuper = req.user.roles.some(r=>r.role==='SuperAdmin');
  const isLeader = req.user.roles.some(r=>r.role==='UnitLeader' && (r.unit && r.unit.toString()===unitId));
  if (!isSuper && !isLeader) return res.status(403).json({ error: 'Only SuperAdmin or UnitLeader of this unit can submit attendance' });
  const total = (parseInt(maleCount||0)+parseInt(femaleCount||0));
  const att = await Attendance.create({ unit: unitId, date: date ? new Date(date) : new Date(), maleCount, femaleCount, total, serviceType, submittedBy: req.user._id });
  res.json({ ok: true, attendance: att });
}

module.exports = { submitAttendance };
