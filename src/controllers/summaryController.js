const Soul = require('../models/Soul');
const Invite = require('../models/Invite');
const Unit = require('../models/Unit');
const Event = require('../models/Event');
const Finance = require('../models/Finance');
const User = require('../models/User');

function resolveActiveUnit(user){
  if(!user) return null;
  const active = user.activeRole;
  if(!active) return null;
  const roleObj = (user.roles||[]).find(r=>r.role===active && r.unit);
  return roleObj ? roleObj.unit : null;
}

async function unitMemberSummary(req,res){
  try {
    const user = req.user;
    const unitId = resolveActiveUnit(user);
    if(!unitId){
      return res.json({ ok:true, unit:null, counts:{ unitMembers:0, unitSouls:0, mySouls:0, unitInvites:0, myInvites:0 }, upcomingEvents:[] });
    }

    const [ unitDoc, unitSouls, minSoul, maxSoul, mySouls, unitInvites, myInvites, upcomingEvents, leadersCount, membersCount ] = await Promise.all([
      Unit.findById(unitId).select('name leaders members'),
      Soul.countDocuments({ unit: unitId }),
      Soul.findOne({ unit: unitId }).sort({ dateWon: 1 }).select('dateWon').lean(),
      Soul.findOne({ unit: unitId }).sort({ dateWon: -1 }).select('dateWon').lean(),
      Soul.countDocuments({ addedBy: user._id }),
      Invite.countDocuments({ unit: unitId }),
      Invite.countDocuments({ invitedBy: user._id }),
      Event.find({ date: { $gte: new Date() } }).sort({ date: 1 }).limit(5).select('title date'),
      Unit.findById(unitId).select('leaders').then(u=>u ? (u.leaders||[]).length : 0),
      Unit.findById(unitId).select('members').then(u=>u ? (u.members||[]).length : 0)
    ]);
    const workersTotal = (leadersCount || 0) + (membersCount || 0);
    const fmtRange = (a,b)=> (a&&b&&a.dateWon&&b.dateWon)? `${new Date(a.dateWon).getFullYear()} - ${new Date(b.dateWon).getFullYear()}` : '—';

    return res.json({
      ok:true,
      unit: unitDoc ? { _id: unitDoc._id, name: unitDoc.name } : null,
      counts: {
        unitMembers: workersTotal,
        unitSouls,
        mySouls,
        unitInvites,
        myInvites
      },
      upcomingEvents,
      soulsRange: fmtRange(minSoul, maxSoul)
    });
  } catch(e){
    console.error('unitMemberSummary error', e);
    return res.status(500).json({ ok:false, message:'Failed to build summary', error:e.message });
  }
}

module.exports = { unitMemberSummary };

// Aggregate finance and counts for a ministry (by church + ministryName)
async function ministrySummary(req, res){
  try {
    const actor = req.user;
    const minRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
    // Allow SuperAdmin to query with ?churchId=&ministry=
    const canOverride = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const churchId = (canOverride && req.query.churchId) ? String(req.query.churchId) : (minRole?.church || actor.church || null);
    const ministryName = (canOverride && req.query.ministry) ? String(req.query.ministry) : (minRole?.ministryName || null);
    if(!churchId || !ministryName) return res.status(400).json({ ok:false, message:'churchId and ministry required' });

    // Units in this ministry
    const units = await Unit.find({ church: churchId, ministryName }).select('_id leaders members');
    const unitIds = units.map(u=> String(u._id));

    // Workers = leaders + members across units
    let workersTotal = 0;
    units.forEach(u=> { workersTotal += (u.leaders?.length||0) + (u.members?.length||0); });

    // Souls in ministry
    const soulsWon = await Soul.countDocuments({ unit: { $in: unitIds } });

    // Finance aggregate
    const financeAgg = await Finance.aggregate([
      { $match: { church: (require('mongoose')).Types.ObjectId.createFromHexString(String(churchId)), ministryName } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]);
    const income = financeAgg.find(f=>f._id==='income')?.total || 0;
    const expense = financeAgg.find(f=>f._id==='expense')?.total || 0;
    const balance = income - expense;
    return res.json({ ok:true, scope:{ churchId, ministryName }, totals:{ workersTotal, soulsWon }, finance:{ income, expense, balance } });
  } catch(e){
    console.error('ministrySummary error', e);
    return res.status(500).json({ ok:false, message:'Failed to build ministry summary', error:e.message });
  }
}

// Aggregate finance and counts for a church (summing all ministries in that church)
async function churchSummary(req, res){
  try {
    const actor = req.user;
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    if(!isSuper) return res.status(403).json({ ok:false, message:'Forbidden' });
    const churchId = String(req.query.churchId || actor.church || '');
    if(!churchId) return res.status(400).json({ ok:false, message:'churchId required' });
    const units = await Unit.find({ church: churchId }).select('_id leaders members');
    const unitIds = units.map(u=> String(u._id));
    let workersTotal = 0;
    units.forEach(u=> { workersTotal += (u.leaders?.length||0) + (u.members?.length||0); });
    const soulsWon = await Soul.countDocuments({ unit: { $in: unitIds } });
    const financeAgg = await Finance.aggregate([
      { $match: { church: (require('mongoose')).Types.ObjectId.createFromHexString(String(churchId)) } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]);
    const income = financeAgg.find(f=>f._id==='income')?.total || 0;
    const expense = financeAgg.find(f=>f._id==='expense')?.total || 0;
    const balance = income - expense;
    // Count MinistryAdmins in church
    const ministryAdminsCount = await User.countDocuments({ roles: { $elemMatch: { role:'MinistryAdmin', church: churchId } } });
    return res.json({ ok:true, scope:{ churchId }, totals:{ workersTotal, soulsWon, ministryAdmins: ministryAdminsCount }, finance:{ income, expense, balance } });
  } catch(e){
    console.error('churchSummary error', e);
    return res.status(500).json({ ok:false, message:'Failed to build church summary', error:e.message });
  }
}

module.exports.ministrySummary = ministrySummary;
module.exports.churchSummary = churchSummary;
