const User = require('../models/User');
const Unit = require('../models/Unit');

// Helper to check if leader shares a unit with member
async function leaderCanApprove(leader, target) {
  if (!leader || !target) return false;
  if ((leader.roles || []).some(r=>r.role==='SuperAdmin')) return true;
  const leaderIds = (leader.roles || []).filter(r=>r.role==='UnitLeader').map(r=>leader._id.toString());
  if (!leaderIds.length) return false;
  // load units where leader is among leaders and target is among members
  const count = await Unit.countDocuments({ leaders: leader._id, members: target._id });
  return count > 0;
}

// POST /api/users/approve { userId }
module.exports.approveUser = async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ ok:false, message:'userId required' });
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ ok:false, message:'User not found' });
    const actor = req.user;
    const isSuperAdmin = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    if (!isSuperAdmin) {
      // If actor is UnitLeader they can only approve Members in their units
      const isLeader = (actor.roles||[]).some(r=>r.role==='UnitLeader');
      if (!isLeader) return res.status(403).json({ ok:false, message:'Forbidden' });
      if ((target.roles||[]).some(r=>r.role==='SuperAdmin')) return res.status(403).json({ ok:false, message:'Cannot approve SuperAdmin' });
      const can = await leaderCanApprove(actor, target);
      if (!can) return res.status(403).json({ ok:false, message:'Leader cannot approve this user' });
      // Only allow approving members, not other leaders or pastor units
      const targetIsMember = (target.roles||[]).some(r=>r.role==='Member');
      if (!targetIsMember) return res.status(403).json({ ok:false, message:'Leader can only approve members' });
    }
    target.approved = true;
    await target.save();
    return res.json({ ok:true, userId: target._id });
  } catch (e) {
    console.error('approveUser error', e);
    return res.status(500).json({ ok:false, message:'Approval failed', error:e.message });
  }
};

// GET /api/users/pending  (list pending approvals - superadmin sees all; leader sees their members)
module.exports.listPending = async (req, res) => {
  try {
    const actor = req.user;
    let query = { approved:false, passwordHash: { $exists: true } }; // only those who completed registration
    const isSuperAdmin = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    if (!isSuperAdmin) {
      // restrict to members in leader units
      const units = await Unit.find({ leaders: actor._id }).select('_id members');
      const memberIds = units.flatMap(u=>u.members.map(m=>m.toString()));
      query._id = { $in: memberIds };
    }
    const users = await User.find(query).select('firstName surname roles activeRole email approved');
    res.json({ ok:true, users });
  } catch (e) {
    console.error('listPending error', e);
    res.status(500).json({ ok:false, message:'Failed', error:e.message });
  }
};