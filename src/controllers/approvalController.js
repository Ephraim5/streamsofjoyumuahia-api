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
    const isMinistryAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
    const isMultiSuperAdmin = isSuperAdmin && !!(actor.multi);
    if (!isSuperAdmin) {
      if (isMinistryAdmin) {
        // MinistryAdmin restrictions: can approve UnitLeaders or Members whose roles fall under same church & ministry
        if ((target.roles||[]).some(r=>r.role==='SuperAdmin')) return res.status(403).json({ ok:false, message:'Cannot approve SuperAdmin' });
        // ministryAdmin role record (assume first one)
        const adminRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
        if (!adminRole) return res.status(403).json({ ok:false, message:'Ministry scope missing' });
        const targetHasMatchingMinistry = (target.roles||[]).some(r=> r.role==='UnitLeader' && r.church && adminRole.church && r.church.toString()===adminRole.church.toString()) || (target.roles||[]).some(r=> r.role==='Member');
        if (!targetHasMatchingMinistry) return res.status(403).json({ ok:false, message:'Target outside ministry scope' });
      } else {
        // UnitLeader path (legacy logic)
        const isLeader = (actor.roles||[]).some(r=>r.role==='UnitLeader');
        if (!isLeader) return res.status(403).json({ ok:false, message:'Forbidden' });
        if ((target.roles||[]).some(r=>r.role==='SuperAdmin')) return res.status(403).json({ ok:false, message:'Cannot approve SuperAdmin' });
        const can = await leaderCanApprove(actor, target);
        if (!can) return res.status(403).json({ ok:false, message:'Leader cannot approve this user' });
        const targetIsMember = (target.roles||[]).some(r=>r.role==='Member');
        if (!targetIsMember) return res.status(403).json({ ok:false, message:'Leader can only approve members' });
      }
    } else {
      // SuperAdmin path: allow approving other superadmins only if actor is multi and target has pending flag
      if ((target.roles||[]).some(r=>r.role==='SuperAdmin') && !isMultiSuperAdmin) {
        return res.status(403).json({ ok:false, message:'Only multi SuperAdmin can approve SuperAdmin' });
      }
    }
    target.approved = true;
    if ((target.roles||[]).some(r=>r.role==='SuperAdmin')) {
      target.superAdminPending = false;
    }
    await target.save();
    // Notify the approved user
    try {
      const { sendPushToUsers } = require('../utils/push');
      await sendPushToUsers([target._id], { title: 'Account Approved', body: 'You can now access all features.', data: { type:'approval' } });
    } catch {}
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
    const filterType = (req.query.type||'').toString(); // 'unit-leaders' | 'ministry-admins' etc
  let query = { approved:false, passwordHash: { $exists: true } };
    if (filterType === 'unit-leaders') query['roles.role'] = 'UnitLeader';
    if (filterType === 'ministry-admins') query['roles.role'] = 'MinistryAdmin';
  if (filterType === 'superadmins') query['roles.role'] = 'SuperAdmin';
    const isSuperAdmin = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const isMinistryAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
    if (!isSuperAdmin) {
      if (isMinistryAdmin) {
        // limit to same church or ministry scope
        const adminRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
        if (adminRole && adminRole.church) {
          query['roles.church'] = adminRole.church; // look for roles referencing same church
        }
      } else { // UnitLeader
        const units = await Unit.find({ leaders: actor._id }).select('_id members');
        const memberIds = units.flatMap(u=>u.members.map(m=>m.toString()));
        query._id = { $in: memberIds };
      }
    }
    // If actor is multi superadmin and no specific filter, include superadminPending users forcibly
    if (isSuperAdmin && actor.multi && !filterType) {
      query = { $or: [ query, { superAdminPending:true, 'roles.role':'SuperAdmin' } ] };
    }
    let users = await User.find(query)
      .populate({ path:'roles.unit', select:'name' })
      .select('firstName surname middleName roles activeRole email approved phone');

    // Map to simplified structure including unit names for UnitLeader roles
    const mapped = users.map(u => {
      const leaderRole = (u.roles||[]).find(r=>r.role==='UnitLeader');
      const ministryRole = (u.roles||[]).find(r=>r.role==='MinistryAdmin');
      return {
        _id: u._id,
        firstName: u.firstName,
        surname: u.surname,
        middleName: u.middleName||'',
        email: u.email,
        phone: u.phone,
        approved: u.approved,
        roles: (u.roles||[]).map(r=>({ role: r.role, unit: r.unit?{ _id: r.unit._id, name: r.unit.name }:null, ministryName: r.ministryName||null })),
        unitLeaderUnit: leaderRole && leaderRole.unit ? { _id: leaderRole.unit._id, name: leaderRole.unit.name } : null,
        ministryName: ministryRole ? ministryRole.ministryName : null
      };
    });
    res.json({ ok:true, users: mapped });
  } catch (e) {
    console.error('listPending error', e);
    res.status(500).json({ ok:false, message:'Failed', error:e.message });
  }
};