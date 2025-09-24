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

    const [ unitDoc, unitMembersCount, unitSouls, mySouls, unitInvites, myInvites, upcomingEvents ] = await Promise.all([
      Unit.findById(unitId).select('name'),
      Unit.findById(unitId).select('members').then(u=>u ? (u.members||[]).length : 0),
      Soul.countDocuments({ unit: unitId }),
      Soul.countDocuments({ addedBy: user._id }),
      Invite.countDocuments({ unit: unitId }),
      Invite.countDocuments({ invitedBy: user._id }),
      Event.find({ date: { $gte: new Date() } }).sort({ date: 1 }).limit(5).select('title date')
    ]);

    return res.json({
      ok:true,
      unit: unitDoc ? { _id: unitDoc._id, name: unitDoc.name } : null,
      counts: {
        unitMembers: unitMembersCount,
        unitSouls,
        mySouls,
        unitInvites,
        myInvites
      },
      upcomingEvents
    });
  } catch(e){
    console.error('unitMemberSummary error', e);
    return res.status(500).json({ ok:false, message:'Failed to build summary', error:e.message });
  }
}

module.exports = { unitMemberSummary };
