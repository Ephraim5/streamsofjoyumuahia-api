const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Unit = require('../models/Unit');
const Soul = require('../models/Soul');
const Finance = require('../models/Finance');
const Event = require('../models/Event');

async function summary(req, res) {
  // basic aggregated info for dashboard
  const totalWorkers = await User.countDocuments();
  const totalUnits = await Unit.countDocuments();
  const attendanceCount = await Attendance.countDocuments();
  res.json({ totalWorkers, totalUnits, attendanceCount });
}

// Returns stats for the authenticated user's active unit (if they have a unit leader/pastor role)
async function unitLeaderSummary(req, res){
  try {
    const user = req.user;
    if(!user) return res.status(401).json({ ok:false, message:'Unauthorized' });
    // Find unit from roles that matches activeRole or fallback first role with a unit
    let unitId = null;
    if (user.roles && user.roles.length){
      const active = user.roles.find(r => r.role === user.activeRole && r.unit);
      unitId = active?.unit || user.roles.find(r => r.unit)?.unit;
    }
    if(!unitId){
      return res.json({ ok:true, unit:null, membersCount:0, soulsWonCount:0, finance:{ income:0, expense:0, balance:0 }, upcomingEvents: [] });
    }
    const [membersCount, soulsWonCount, financeAgg, upcomingEvents] = await Promise.all([
      User.countDocuments({ roles: { $elemMatch: { unit: unitId, role: { $in: ['UnitLeader','Member'] } } } }),
      Soul.countDocuments({ unit: unitId }),
      Finance.aggregate([
        { $match: { unit: unitId } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } }
      ]),
      Event.find({ date: { $gte: new Date() } }).sort({ date:1 }).limit(5).select('title date')
    ]);
    const income = financeAgg.find(f=>f._id==='income')?.total || 0;
    const expense = financeAgg.find(f=>f._id==='expense')?.total || 0;
    const balance = income - expense;
    const unit = await Unit.findById(unitId).select('name');
    return res.json({ ok:true, unit: unit ? { _id:unit._id, name:unit.name }:null, membersCount, soulsWonCount, finance:{ income, expense, balance }, upcomingEvents });
  } catch(e){
    console.error('unitLeaderSummary error', e);
    return res.status(500).json({ ok:false, message:'Failed to load unit summary' });
  }
}

module.exports = { summary, unitLeaderSummary };
