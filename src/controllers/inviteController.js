const Invite = require('../models/Invite');
const Unit = require('../models/Unit');

function resolveActiveUnit(user){
  if(!user) return null;
  const active = user.activeRole;
  if(!active) return null;
  const roleObj = (user.roles||[]).find(r=>r.role===active && r.unit);
  return roleObj ? roleObj.unit : null;
}

async function createInvite(req,res){
  try {
    const { name, phone, gender, ageRange, method, note } = req.body || {};
    if(!name) return res.status(400).json({ ok:false, message:'name required' });
    const unitId = resolveActiveUnit(req.user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active role unit required to create invite' });
    const invite = await Invite.create({ name, phone, gender, ageRange, method, note, invitedBy: req.user._id, unit: unitId });
    return res.json({ ok:true, invite });
  } catch(e){
    console.error('createInvite error', e);
    return res.status(500).json({ ok:false, message:'Failed to create invite', error: e.message });
  }
}

async function listInvites(req,res){
  try {
    let { scope='mine', q='', unitId } = req.query || {};
    scope = String(scope).toLowerCase();
    const user = req.user;
    const isSuper = (user.roles||[]).some(r=>r.role==='SuperAdmin') || user.activeRole==='SuperAdmin';
    const leaderUnits = (user.roles||[]).filter(r=>r.role==='UnitLeader' && r.unit).map(r=>String(r.unit));
    const activeUnit = resolveActiveUnit(user);

    let filter = {};
    if(isSuper){
      if(scope==='unit'){
        if(unitId){ filter.unit = unitId; }
      } else { // mine
        filter.invitedBy = user._id;
      }
    } else if(leaderUnits.length){ // unit leader
      if(scope==='unit'){
        filter.unit = { $in: leaderUnits };
      } else {
        filter.invitedBy = user._id;
      }
    } else { // member
      filter.invitedBy = user._id; // force mine
    }

    if(q){
      const rx = new RegExp(q, 'i');
      filter.$or = [{ name: rx }, { phone: rx }];
    }

    const invites = await Invite.find(filter).sort({ invitedAt: -1 }).limit(500);
    return res.json({ ok:true, invites });
  } catch(e){
    console.error('listInvites error', e);
    return res.status(500).json({ ok:false, message:'Failed to list invites', error: e.message });
  }
}

module.exports = { createInvite, listInvites };
