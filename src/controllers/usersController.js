const User = require('../models/User');
const bcrypt = require('bcrypt');
const Unit = require('../models/Unit');
const Soul = require('../models/Soul');
const { normalizeNigeriaPhone } = require('../utils/phone');
const AccessCode = require('../models/AccessCode');
const { normalizeNigeriaPhone: normPhone } = require('../utils/phone');

// Public phone existence check: POST /api/users/check-phone { phone }
async function checkPhone(req,res){
  try {
    let { phone } = req.body || {};
    if(!phone) return res.status(400).json({ ok:false, message:'phone required' });
    phone = normPhone(phone, true);
    const existing = await User.findOne({ phone });
    return res.json({ ok:true, exists: !!existing });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Lookup failed', error:e.message });
  }
}

// Public minimal email lookup (used by onboarding). Returns limited safe fields.
async function lookupEmail(req, res) {
  try {
    let { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, message: 'Email required' });
    }
    email = email.trim();
    // Basic format check to fail fast (not exhaustive)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Invalid email format' });
    }
    let regex;
    try {
      // Escape special regex chars in email just in case
      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp('^' + escaped + '$', 'i');
    } catch (rxErr) {
      console.warn('lookupEmail regex build failed', rxErr);
      return res.status(400).json({ ok: false, message: 'Invalid email input' });
    }
    const user = await User.findOne({ email: regex }).lean();
    if (!user) return res.json({ ok: true, exists: false });
    const primaryRole = user.activeRole || (user.roles && user.roles[0] && user.roles[0].role) || null;
    return res.json({
      ok: true,
      exists: true,
      role: primaryRole,
      userId: user._id,
      user: {
        title: user.title || '',
        firstName: user.firstName || '',
        middleName: user.middleName || '',
        surname: user.surname || '',
        email: user.email || '',
        activeRole: user.activeRole || primaryRole,
        roles: user.roles || []
      }
    });
  } catch (e) {
    console.error('lookupEmail error', e);
    return res.status(500).json({ ok: false, message: 'Lookup failed', error: e.message });
  }
}

async function getMe(req, res) {
  const u = await User.findById(req.user._id).select('-passwordHash -__v').lean();
  // derive metrics per active role
  const activeRole = u?.activeRole || null;
  let metrics = {};

  function fmtDateRange(minDate, maxDate){
    if(!minDate || !maxDate) return '—';
    const monthShort = (d)=> d.toLocaleString('en-US',{ month:'short'});
    const daySuffix = (d)=>{
      const n = d.getDate();
      if (n % 10 === 1 && n !== 11) return n+'st';
      if (n % 10 === 2 && n !== 12) return n+'nd';
      if (n % 10 === 3 && n !== 13) return n+'rd';
      return n+'th';
    };
    const left = `${monthShort(minDate)} ${daySuffix(minDate)}, ${minDate.getFullYear()}`;
    const right = `${monthShort(maxDate)} ${daySuffix(maxDate)}, ${maxDate.getFullYear()}`;
    return `${left} - ${right}`;
  }

  async function computeGlobalMetrics(){
    const [soulsWon, minSoul, maxSoul, workersTotal] = await Promise.all([
      Soul.countDocuments({}),
      Soul.findOne({}).sort({ dateWon: 1 }).select('dateWon').lean(),
      Soul.findOne({}).sort({ dateWon: -1 }).select('dateWon').lean(),
      User.countDocuments({ 'roles.role': { $in: ['UnitLeader','Member'] } })
    ]);
    return {
      soulsWon,
      soulsRange: (minSoul && maxSoul && minSoul.dateWon && maxSoul.dateWon) ? fmtDateRange(new Date(minSoul.dateWon), new Date(maxSoul.dateWon)) : '—',
      workersTotal
    };
  }

  async function computeUnitMetrics(unitId){
    if(!unitId) return { soulsWon: 0, soulsRange: '—', workersTotal: 0, unitMembers: 0 };
    const [soulsWon, minSoul, maxSoul, workersTotal] = await Promise.all([
      Soul.countDocuments({ unit: unitId }),
      Soul.findOne({ unit: unitId }).sort({ dateWon: 1 }).select('dateWon').lean(),
      Soul.findOne({ unit: unitId }).sort({ dateWon: -1 }).select('dateWon').lean(),
      User.countDocuments({ roles: { $elemMatch: { unit: unitId, role: { $in: ['UnitLeader','Member'] } } } })
    ]);
    return {
      soulsWon,
      soulsRange: (minSoul && maxSoul && minSoul.dateWon && maxSoul.dateWon) ? fmtDateRange(new Date(minSoul.dateWon), new Date(maxSoul.dateWon)) : '—',
      workersTotal,
      unitMembers: workersTotal
    };
  }

  // resolve active unit id for unit-scoped roles
  const resolveActiveUnit = (user) => {
    if(!user) return null;
    const act = user.activeRole;
    if(!act) return null;
    const roleObj = (user.roles||[]).find(r => r.role === act && r.unit);
    return roleObj ? roleObj.unit : null;
  };

  try {
    if (activeRole === 'SuperAdmin') {
      metrics = await computeGlobalMetrics();
    } else if (['UnitLeader','Member'].includes(activeRole)) {
      const unitId = resolveActiveUnit(u);
      metrics = await computeUnitMetrics(unitId);
    }
  } catch (e) {
    // Do not fail getMe if metrics fail; just log and continue
    console.warn('getMe metrics error', e?.message);
  }

  res.json({ ok: true, user: { ...u, metrics } });
}

// Secure fetch by id (used for profile recovery after login)
async function getUserById(req, res) {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ ok: false, message: 'Invalid userId format' });
    }
    const user = await User.findById(id).select('-passwordHash -__v');
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
    return res.json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Lookup failed', error: e.message });
  }
}

async function updateUser(req, res) {
  const id = req.params.id;
  // Only allow user or super admin to update
  if (req.user._id.toString() !== id && !(req.user.roles || []).some(r => r.role === 'SuperAdmin')) {
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }
  const allowed = ['firstName', 'middleName', 'surname', 'title', 'phone'];
  const payload = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) payload[k] = req.body[k];
  }
  if (payload.phone) {
    payload.phone = normalizeNigeriaPhone(payload.phone);
  }
  const user = await User.findByIdAndUpdate(id, payload, { new: true }).select('-passwordHash -__v');
  return res.json({ ok: true, user });
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, message: 'currentPassword and newPassword required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
    const match = await bcrypt.compare(currentPassword, user.passwordHash || '');
    if (!match) {
      return res.status(400).json({ ok: false, message: 'Current password incorrect' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ ok: true, message: 'Password updated' });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Failed to change password', error: e.message });
  }
}

async function listUsers(req, res) {
  const q = req.query.q || '';
  const users = await User.find({ $or: [{ firstName: new RegExp(q, 'i') }, { surname: new RegExp(q, 'i') }, { phone: new RegExp(q, 'i') },{ email: new RegExp(q, 'i')},]}).limit(200);
  res.json({ users });
}

// POST /api/users/:id/add-role  { role, unitId? }
async function addRole(req, res) {
  try {
    const { id } = req.params;
    const { role, unitId } = req.body || {};
    if (!id) return res.status(400).json({ ok:false, message:'id required' });
    if (!role) return res.status(400).json({ ok:false, message:'role required' });
  const allowed = ['UnitLeader','Member'];
    if (!allowed.includes(role)) return res.status(400).json({ ok:false, message:'Invalid role choice' });
    // Only allow self-modification & only if user is SuperAdmin (explicit requirement)
    if (req.user._id.toString() !== id) return res.status(403).json({ ok:false, message:'Can only add role to self' });
    const isSuperAdmin = (req.user.roles||[]).some(r=>r.role==='SuperAdmin') || req.user.activeRole==='SuperAdmin';
    if (!isSuperAdmin) return res.status(403).json({ ok:false, message:'Only SuperAdmin can add roles' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ ok:false, message:'User not found' });

    // Prevent duplicate (same role+unit) entries

    if (!unitId) return res.status(400).json({ ok:false, message:'unitId required for this role' });
    const unit = await Unit.findById(unitId);
    if (!unit) return res.status(404).json({ ok:false, message:'Unit not found' });

    const hasSame = (user.roles||[]).some(r=>r.role===role && r.unit && r.unit.toString()===unitId);
    if (hasSame) return res.status(400).json({ ok:false, message:`User already has ${role} role for this unit` });

    if (role === 'UnitLeader') {
      // Uniqueness: only one leader for a unit (unless it's this user already)
      if (unit.leaders.length && !unit.leaders.some(l=>l.toString()===user._id.toString())) {
        return res.status(400).json({ ok:false, message:'Unit already has a leader' });
      }
      // Add user to unit.leaders if not present
      if (!unit.leaders.some(l=>l.toString()===user._id.toString())) {
        unit.leaders.push(user._id);
      }
      user.roles.push({ role: 'UnitLeader', unit: unit._id });
      await unit.save();
    } else if (role === 'Member') {
      // Members can be many. Add to members array if not present.
      if (!unit.members.some(m=>m.toString()===user._id.toString())) {
        unit.members.push(user._id);
        await unit.save();
      }
      user.roles.push({ role: 'Member', unit: unit._id });
    }
    await user.save();
    const sanitized = await User.findById(id).select('-passwordHash -__v');
    return res.json({ ok:true, user: sanitized });
  } catch (e) {
    console.error('addRole error', e);
    return res.status(500).json({ ok:false, message:'Failed to add role', error:e.message });
  }
}

// Create additional Super Admin initiated by existing SuperAdmin
async function createSuperAdmin(req, res) {
  try {
    const actor = req.user;
    const isSuperAdmin = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    if (!isSuperAdmin) return res.status(403).json({ ok:false, message:'Forbidden' });
    let { email, title, firstName, middleName, surname } = req.body || {};
    if (!email || !firstName || !surname) return res.status(400).json({ ok:false, message:'email, firstName, surname required' });
    email = email.trim();
    const existing = await User.findOne({ email: new RegExp('^'+email+'$', 'i') });
    if (existing) return res.status(400).json({ ok:false, message:'Email already exists' });
    const tempPhone = `+234000${Date.now()}`.slice(0,14);
    const user = await User.create({
      email,
      title: title||'',
      firstName,
      middleName: middleName||'',
      surname,
      phone: tempPhone,
      isVerified: false,
      approved: false,
      roles: [{ role: 'SuperAdmin', unit: null }],
      activeRole: 'SuperAdmin'
    });
    return res.json({ ok:true, user: await User.findById(user._id).select('-passwordHash -__v') });
  } catch (e) {
    console.error('createSuperAdmin error', e);
    return res.status(500).json({ ok:false, message:'Failed to create super admin', error:e.message });
  }
}

// Reject (delete) a pending user (SuperAdmin only)
async function rejectUser(req, res) {
  try {
    const actor = req.user;
    const isSuperAdmin = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    if (!isSuperAdmin) return res.status(403).json({ ok:false, message:'Forbidden' });
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ ok:false, message:'userId required' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ ok:false, message:'User not found' });
    if (user.approved) return res.status(400).json({ ok:false, message:'Cannot reject an approved user' });
    const roleUnits = (user.roles||[]).filter(r=>r.unit).map(r=>r.unit);
    if (roleUnits.length) {
      await Unit.updateMany({ _id: { $in: roleUnits } }, { $pull: { leaders: user._id, members: user._id } });
    }
    await user.deleteOne();
    return res.json({ ok:true, userId });
  } catch (e) {
    console.error('rejectUser error', e);
    return res.status(500).json({ ok:false, message:'Failed to reject user', error:e.message });
  }
}

module.exports = { getMe, updateUser, listUsers, lookupEmail, getUserById, changePassword, addRole, createSuperAdmin, rejectUser, checkPhone };
