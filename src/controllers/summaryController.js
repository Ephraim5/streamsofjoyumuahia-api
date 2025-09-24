const Soul = require('../models/Soul');
const Invite = require('../models/Invite');
const Unit = require('../models/Unit');
const Event = require('../models/Event');

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
