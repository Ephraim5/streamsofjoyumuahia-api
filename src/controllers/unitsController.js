const Unit = require('../models/Unit');
const User = require('../models/User');
const Soul = require('../models/Soul');
const Invite = require('../models/Invite');
const Assistance = require('../models/Assistance');
const Marriage = require('../models/Marriage');
const RecoveredAddict = require('../models/RecoveredAddict');
const Song = require('../models/Song');
const Achievement = require('../models/Achievement');
const Finance = require('../models/Finance');

function actorIsSuper(user){ return (user.roles||[]).some(r=>r.role==='SuperAdmin') || user.activeRole==='SuperAdmin'; }
function actorMinRole(user){ return (user.roles||[]).find(r=>r.role==='MinistryAdmin'); }
function actorLeaderUnitIds(user){ return (user.roles||[]).filter(r=>r.role==='UnitLeader' && r.unit).map(r=>String(r.unit)); }
function unitWithinMinScope(unit, minRole, actor){
  const sameChurch = String(unit.church||'') === String(minRole?.church||actor.church||'');
  const sameMinistry = String(unit.ministryName||'') === String(minRole?.ministryName||'');
  return sameChurch && sameMinistry;
}

async function createUnit(req, res) {
  try {
    const actor = req.user;
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const isMinAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
    if (!isSuper && !isMinAdmin) return res.status(403).json({ ok:false, message: 'Forbidden' });

    let { name, description, churchId, ministryName } = req.body || {};
    if (!name) return res.status(400).json({ ok:false, message:'name required' });
    name = String(name).trim();
    if (ministryName) ministryName = String(ministryName).trim();
    if (churchId) churchId = String(churchId);

    // Scope checks for MinistryAdmin
    if (isMinAdmin && !isSuper) {
      const role = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
      if (!role) return res.status(403).json({ ok:false, message:'Ministry scope missing' });
      if (!churchId) churchId = role.church ? String(role.church) : (actor.church ? String(actor.church) : null);
      if (!churchId) return res.status(400).json({ ok:false, message:'churchId required for MinistryAdmin' });
      if (!ministryName) ministryName = role.ministryName || null;
      if (!ministryName) return res.status(400).json({ ok:false, message:'ministryName required for MinistryAdmin' });
    }

    // For SuperAdmin, if no explicit churchId provided, try active context
    if (isSuper && !churchId) churchId = actor.church ? String(actor.church) : null;

    // Optional duplicate check within church+ministry scope (still global unique by name at schema level)
    const dupFilter = {};
    if (churchId) dupFilter.church = churchId;
    if (ministryName) dupFilter.ministryName = ministryName;
    dupFilter.name = name;
    const existing = await Unit.findOne(dupFilter);
    if (existing) return res.status(400).json({ ok:false, message:'A unit with this name already exists in the selected ministry/church' });

    const unit = await Unit.create({ name, description, church: churchId || undefined, ministryName: ministryName || null });
    return res.json({ ok:true, unit });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to create unit', error:e.message });
  }
}

async function addMember(req, res) {
  const unitId = req.params.id;
  const { phone, firstName, surname, title } = req.body;
  const normalizedPhone = (require('../utils/phone').normalizeNigeriaPhone)(phone);
  let user = await User.findOne({ phone: normalizedPhone });
  if (!user) {
    user = await User.create({ title, firstName, surname, phone: normalizedPhone, isVerified: false, roles: [{ role: 'Member', unit: unitId }]});
  } else {
    // add Member role
    user.roles = user.roles || [];
    user.roles.push({ role: 'Member', unit: unitId });
    await user.save();
  }
  // add to unit
  const unit = await Unit.findById(unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  if (!unit.members.includes(user._id)) {
    unit.members.push(user._id);
    await unit.save();
  }
  res.json({ ok: true, user, unit });
}

async function listUnits(req, res) {
  try {
    const actor = req.user;
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const { churchId, ministry } = req.query;
    const filter = {};
    if (churchId) filter.church = churchId;
    if (ministry) filter.ministryName = ministry;

    // Non-super users limited by their roles
    if (!isSuper) {
      // MinistryAdmin: same church/ministry
      const minRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
      if (minRole) {
        filter.church = minRole.church || actor.church || undefined;
        if (minRole.ministryName) filter.ministryName = minRole.ministryName;
      }
    }
    const units = await Unit.find(filter).populate('leaders members', 'firstName surname phone email').lean();
    return res.json({ ok:true, units });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to list units', error:e.message });
  }
}

// Public listing (no auth) for registration wizard
async function listUnitsPublic(req, res) {
  try {
    const units = await Unit.find({}, 'name').sort({ name: 1 });
    return res.json({ ok: true, units });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Failed to load units' });
  }
}

// exports are consolidated at the bottom

// GET /api/units/dashboard?days=14 (SuperAdmin only)
// Returns per-unit metrics: name, leaderName, membersCount (leaders+members),
// activeCount (unique workers active in timeframe across unit-scoped collections),
// lastReportAt (latest activity timestamp across Souls, Invites, Achievements, Assists, Marriages, RecoveredAddicts, Songs)
async function listUnitsDashboard(req, res) {
  try {
    const actor = req.user;
    const isSuperAdmin = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    if (!isSuperAdmin) return res.status(403).json({ ok:false, message:'Forbidden' });

    let days = parseInt(String(req.query.days || '14'), 10);
    if (isNaN(days)) days = 14;
    days = Math.min(Math.max(days, 1), 60); // clamp 1..60
    const cutoff = new Date(Date.now() - days*24*60*60*1000);

    // Load all units with leaders and members (optionally filter by ministry and active church)
    const filter = {};
    const filterMin = (req.query.ministry||'').toString().trim();
    if (filterMin) filter.ministryName = filterMin;
    // If actor has an active church, scope to it unless explicit override (for safety)
    const activeChurch = actor.church ? String(actor.church) : null;
    if (activeChurch) filter.church = activeChurch;

    const units = await Unit.find(filter).select('name leaders members ministryName church')
      .populate('leaders', 'firstName middleName surname')
      .lean();

    const unitIds = units.map(u => String(u._id));
    const workersByUnit = new Map(); // unitId -> Set(userId)
    units.forEach(u => {
      const set = new Set([...(u.leaders||[]).map(x=>String(x)), ...(u.members||[]).map(x=>String(x))]);
      workersByUnit.set(String(u._id), set);
    });

    // Helper maps to accumulate metrics
    const activeActors = new Map(); // unitId -> Set(userId)
    const lastReportAt = new Map(); // unitId -> Date

    const bumpActive = (unitId, userId) => {
      if (!unitId || !userId) return;
      const unitKey = String(unitId);
      const workers = workersByUnit.get(unitKey);
      if (!workers || !workers.has(String(userId))) return; // only count unit workers
      if (!activeActors.has(unitKey)) activeActors.set(unitKey, new Set());
      activeActors.get(unitKey).add(String(userId));
    };
    const bumpLast = (unitId, dateVal) => {
      if (!unitId || !dateVal) return;
      const unitKey = String(unitId);
      const prev = lastReportAt.get(unitKey) || null;
      const curr = new Date(dateVal);
      if (!prev || curr > prev) lastReportAt.set(unitKey, curr);
    };

    // Souls (use dateWon)
    const [soulsInWindow, soulsAll] = await Promise.all([
      Soul.find({ unit: { $in: unitIds }, dateWon: { $gte: cutoff } }).select('unit addedBy dateWon').lean(),
      Soul.find({ unit: { $in: unitIds } }).select('unit dateWon').lean()
    ]);
    soulsInWindow.forEach(s => bumpActive(s.unit, s.addedBy));
    soulsAll.forEach(s => bumpLast(s.unit, s.dateWon));

    // Invites (timestamps: createdAt)
    const [invInWindow, invAll] = await Promise.all([
      Invite.find({ unit: { $in: unitIds }, createdAt: { $gte: cutoff } }).select('unit invitedBy createdAt').lean(),
      Invite.find({ unit: { $in: unitIds } }).select('unit createdAt').lean()
    ]);
    invInWindow.forEach(i => bumpActive(i.unit, i.invitedBy));
    invAll.forEach(i => bumpLast(i.unit, i.createdAt));

    // Assistance (createdAt)
    const [assistInWindow, assistAll] = await Promise.all([
      Assistance.find({ unit: { $in: unitIds }, createdAt: { $gte: cutoff } }).select('unit addedBy createdAt').lean(),
      Assistance.find({ unit: { $in: unitIds } }).select('unit createdAt').lean()
    ]);
    assistInWindow.forEach(a => bumpActive(a.unit, a.addedBy));
    assistAll.forEach(a => bumpLast(a.unit, a.createdAt));

    // Marriages (createdAt)
    const [marInWindow, marAll] = await Promise.all([
      Marriage.find({ unit: { $in: unitIds }, createdAt: { $gte: cutoff } }).select('unit addedBy createdAt').lean(),
      Marriage.find({ unit: { $in: unitIds } }).select('unit createdAt').lean()
    ]);
    marInWindow.forEach(m => bumpActive(m.unit, m.addedBy));
    marAll.forEach(m => bumpLast(m.unit, m.createdAt));

    // Recovered Addicts (createdAt)
    const [recInWindow, recAll] = await Promise.all([
      RecoveredAddict.find({ unit: { $in: unitIds }, createdAt: { $gte: cutoff } }).select('unit addedBy createdAt').lean(),
      RecoveredAddict.find({ unit: { $in: unitIds } }).select('unit createdAt').lean()
    ]);
    recInWindow.forEach(r => bumpActive(r.unit, r.addedBy));
    recAll.forEach(r => bumpLast(r.unit, r.createdAt));

    // Songs (createdAt)
    const [songInWindow, songAll] = await Promise.all([
      Song.find({ unit: { $in: unitIds }, createdAt: { $gte: cutoff } }).select('unit addedBy createdAt').lean(),
      Song.find({ unit: { $in: unitIds } }).select('unit createdAt').lean()
    ]);
    songInWindow.forEach(s => bumpActive(s.unit, s.addedBy));
    songAll.forEach(s => bumpLast(s.unit, s.createdAt));

    // Achievements (createdAt)
    const [achInWindow, achAll] = await Promise.all([
      Achievement.find({ unit: { $in: unitIds }, createdAt: { $gte: cutoff } }).select('unit addedBy createdAt').lean(),
      Achievement.find({ unit: { $in: unitIds } }).select('unit createdAt').lean()
    ]);
    achInWindow.forEach(a => bumpActive(a.unit, a.addedBy));
    achAll.forEach(a => bumpLast(a.unit, a.createdAt));

    // Build response
    const result = units.map(u => {
      const leaderDoc = (u.leaders && u.leaders.length) ? u.leaders[0] : null;
      const leaderName = leaderDoc ? `${leaderDoc.firstName || ''} ${leaderDoc.surname || ''}`.trim() : '_';
      const membersCount = (u.leaders?.length || 0) + (u.members?.length || 0);
      const activeSet = activeActors.get(String(u._id)) || new Set();
      const last = lastReportAt.get(String(u._id)) || null;
      return {
        _id: u._id,
        name: u.name,
        leaderId: leaderDoc ? leaderDoc._id : null,
        leaderName,
        membersCount,
        activeCount: activeSet.size,
        lastReportAt: last,
        ministryName: u.ministryName || null,
        church: u.church || null
      };
    });

    return res.json({ ok:true, units: result, days });
  } catch (e) {
    console.error('listUnitsDashboard error', e);
    return res.status(500).json({ ok:false, message:'Failed to build units dashboard', error: e.message });
  }
}

// GET /api/units/:id/summary (SuperAdmin only)
// Returns counts for a single unit and simple finance snapshot
async function unitSummaryById(req, res) {
  try {
    const actor = req.user;
    const isSuperAdmin = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    if (!isSuperAdmin) return res.status(403).json({ ok:false, message:'Forbidden' });

    const unitId = req.params.id;
    if (!unitId) return res.status(400).json({ ok:false, message:'unitId required' });

    const [unit, membersCount, soulsCount, invitesCount, assistsCount, marriagesCount, recoveredCount, songsCount, achievementsCount, financeAgg] = await Promise.all([
      Unit.findById(unitId).select('name leaders members').lean(),
      User.countDocuments({ roles: { $elemMatch: { unit: unitId, role: { $in: ['UnitLeader','Member'] } } } }),
      Soul.countDocuments({ unit: unitId }),
      Invite.countDocuments({ unit: unitId }),
      Assistance.countDocuments({ unit: unitId }),
      Marriage.countDocuments({ unit: unitId }),
      RecoveredAddict.countDocuments({ unit: unitId }),
      Song.countDocuments({ unit: unitId }),
      Achievement.countDocuments({ unit: unitId }),
      Finance.aggregate([
        { $match: {} },
        { $group: { _id: '$type', total: { $sum: '$amount' } } }
      ])
    ]);

    // Gender counts: consider both leaders and members
    let femaleCount = 0;
    let maleCount = 0;
    if (unit) {
      const ids = [ ...(unit.leaders||[]), ...(unit.members||[]) ];
      if (ids.length) {
        const people = await User.find({ _id: { $in: ids } }).select('profile.gender').lean();
        for (const p of people) {
          const g = (p?.profile?.gender || '').toString().toLowerCase();
          if (g === 'female') femaleCount += 1;
          else if (g === 'male') maleCount += 1;
        }
      }
    }

    const income = financeAgg.find(f=>f._id==='income')?.total || 0;
    const expense = financeAgg.find(f=>f._id==='expense')?.total || 0;
    const balance = income - expense;

    return res.json({ ok:true, unit: unit ? { _id: unit._id, name: unit.name } : null, counts: { membersCount, femaleCount, maleCount, soulsCount, invitesCount, assistsCount, marriagesCount, recoveredCount, songsCount, achievementsCount }, finance: { income, expense, balance } });
  } catch (e) {
    console.error('unitSummaryById error', e);
    return res.status(500).json({ ok:false, message:'Failed to load unit summary', error: e.message });
  }
}

// Assign a unit as the attendance-taking unit
// POST /api/units/assign-attendance { unitId }
// SuperAdmin: can assign across current church context
// MinistryAdmin: can assign within their church+ministry only
async function assignAttendanceUnit(req,res){
  try{
    const actor = req.user;
    const { unitId } = req.body || {};
    if(!unitId) return res.status(400).json({ ok:false, message:'unitId required' });
    const unit = await Unit.findById(unitId);
    if(!unit) return res.status(404).json({ ok:false, message:'Unit not found' });
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const minRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
    if(!isSuper && !minRole) return res.status(403).json({ ok:false, message:'Forbidden' });
    // Scope check for MinistryAdmin
    if(minRole && !isSuper){
      const sameChurch = String(unit.church||'') === String(minRole.church||actor.church||'');
      const sameMinistry = String(unit.ministryName||'') === String(minRole.ministryName||'');
      if(!(sameChurch && sameMinistry)) return res.status(403).json({ ok:false, message:'Out of ministry scope' });
      // Clear prior attendanceTaking within ministry scope then set this one
      await Unit.updateMany({ church: minRole.church||actor.church, ministryName: minRole.ministryName }, { $set: { attendanceTaking: false } });
      unit.attendanceTaking = true;
      await unit.save();
      return res.json({ ok:true, unitId: String(unit._id), attendanceTaking: true });
    }
    // SuperAdmin: clear within church scope
    const churchId = actor.church || unit.church || null;
    if(churchId){
      await Unit.updateMany({ church: churchId }, { $set: { attendanceTaking: false } });
    }
    unit.attendanceTaking = true; await unit.save();
    return res.json({ ok:true, unitId: String(unit._id), attendanceTaking: true });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to assign attendance unit', error:e.message });
  }
}

// Assign a financial secretary for a unit (exactly one member promoted with duty)
// POST /api/units/:id/assign-finsec { userId }
async function assignFinancialSecretary(req,res){
  try{
    const actor = req.user; const unitId = req.params.id; const { userId } = req.body || {};
    if(!unitId || !userId) return res.status(400).json({ ok:false, message:'unitId and userId required' });
    const [unit, user] = await Promise.all([
      Unit.findById(unitId),
      User.findById(userId)
    ]);
    if(!unit) return res.status(404).json({ ok:false, message:'Unit not found' });
    if(!user) return res.status(404).json({ ok:false, message:'User not found' });
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const minRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
    const unitLeaderRole = (actor.roles||[]).find(r=>r.role==='UnitLeader' && String(r.unit)===String(unitId));
    if(!isSuper && !minRole && !unitLeaderRole) return res.status(403).json({ ok:false, message:'Forbidden' });
    // Scope checks for MinistryAdmin
    if(minRole && !isSuper){
      const sameChurch = String(unit.church||'') === String(minRole.church||actor.church||'');
      const sameMinistry = String(unit.ministryName||'') === String(minRole.ministryName||'');
      if(!(sameChurch && sameMinistry)) return res.status(403).json({ ok:false, message:'Out of ministry scope' });
    }
    // Ensure user is part of the unit (member or leader)
    const inUnit = (unit.members||[]).some(id=>String(id)===String(user._id)) || (unit.leaders||[]).some(id=>String(id)===String(user._id));
    if(!inUnit) return res.status(400).json({ ok:false, message:'User is not in this unit' });
    // Remove previous financial secretary duty within this unit by clearing duty flag from other users
    await User.updateMany({ roles: { $elemMatch: { unit: unitId, role: { $in: ['UnitLeader','Member'] }, duties: { $in: ['FinancialSecretary'] } } } }, { $pull: { 'roles.$[].duties': 'FinancialSecretary' } });
    // Ensure target has UnitLeader role (or add) and set duty
    const roles = user.roles||[];
    let role = roles.find(r=>String(r.unit)===String(unitId) && ['UnitLeader','Member'].includes(r.role));
    if(!role){
      roles.push({ role:'UnitLeader', unit: unitId, duties:['FinancialSecretary'] });
    } else {
      role.role = 'UnitLeader';
      role.duties = Array.from(new Set([...(role.duties||[]), 'FinancialSecretary']));
    }
    user.roles = roles; await user.save();
    return res.json({ ok:true, unitId: String(unitId), finsec: String(user._id) });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to assign financial secretary', error:e.message });
  }
}

// Toggle music unit for a given unit (SuperAdmin or MinistryAdmin in scope)
// POST /api/units/:id/assign-music { enabled:boolean }
async function assignMusicUnit(req,res){
  try{
    const actor = req.user; const { id } = req.params; const { enabled } = req.body||{};
    const unit = await Unit.findById(id);
    if(!unit) return res.status(404).json({ ok:false, message:'Unit not found' });
    const isSuper = actorIsSuper(actor); const minRole = actorMinRole(actor);
    if(!isSuper && !minRole) return res.status(403).json({ ok:false, message:'Forbidden' });
    if(minRole && !isSuper && !unitWithinMinScope(unit, minRole, actor)) return res.status(403).json({ ok:false, message:'Out of ministry scope' });
    unit.musicUnit = !!enabled; await unit.save();
    return res.json({ ok:true, unitId:String(unit._id), musicUnit: unit.musicUnit });
  } catch(e){ return res.status(500).json({ ok:false, message:'Failed to assign music unit', error:e.message }); }
}

// Assign report cards to units (multi-select). SuperAdmin can target by church/ministry.
// POST /api/units/assign-cards { cardKeys:string[], unitIds?:string[], churchId?, ministry? }
async function assignCardsToUnits(req,res){
  try{
    const actor = req.user; const isSuper = actorIsSuper(actor); const minRole = actorMinRole(actor);
    const { cardKeys=[], unitIds=[], churchId, ministry } = req.body||{};
    if(!isSuper && !minRole) return res.status(403).json({ ok:false, message:'Forbidden' });
    const filter = {};
    if(unitIds && unitIds.length){ filter._id = { $in: unitIds }; }
    if(isSuper){ if(churchId) filter.church = churchId; if(ministry) filter.ministryName = ministry; }
    if(minRole && !isSuper){ filter.church = minRole.church||actor.church; if(minRole.ministryName) filter.ministryName = minRole.ministryName; }
    const keys = Array.from(new Set((cardKeys||[]).map(k=>String(k))));
    const units = await Unit.find(filter);
    for(const u of units){ u.enabledReportCards = keys; await u.save(); }
    return res.json({ ok:true, count: units.length });
  } catch(e){ return res.status(500).json({ ok:false, message:'Failed to assign cards', error:e.message }); }
}

// Assign member duties within a unit: ApproveMembers or CreateWorkPlan (UnitLeader for own unit or Admins)
// POST /api/units/:id/assign-member-duty { userId, approveMembers?:boolean, createWorkPlan?:boolean }
async function assignMemberDuty(req,res){
  try{
    const actor = req.user; const unitId = req.params.id; const { userId, approveMembers, createWorkPlan } = req.body||{};
    if(!unitId || !userId) return res.status(400).json({ ok:false, message:'unitId and userId required' });
    const [unit, user] = await Promise.all([ Unit.findById(unitId), User.findById(userId) ]);
    if(!unit || !user) return res.status(404).json({ ok:false, message:'Not found' });
    const isSuper = actorIsSuper(actor); const minRole = actorMinRole(actor); const leaderUnitIds = actorLeaderUnitIds(actor);
    if(!isSuper && !minRole && !leaderUnitIds.includes(String(unitId))) return res.status(403).json({ ok:false, message:'Forbidden' });
    if(minRole && !isSuper && !unitWithinMinScope(unit, minRole, actor)) return res.status(403).json({ ok:false, message:'Out of ministry scope' });
    // Ensure user is a member or leader of this unit
    const inUnit = (unit.members||[]).some(id=>String(id)===String(user._id)) || (unit.leaders||[]).some(id=>String(id)===String(user._id));
    if(!inUnit) return res.status(400).json({ ok:false, message:'User is not in this unit' });
    // Update duties on the user role record for this unit
    const roles = user.roles||[];
    let role = roles.find(r=>String(r.unit)===String(unitId) && ['UnitLeader','Member'].includes(r.role));
    if(!role){ role = { role:'Member', unit: unitId, duties: [] }; roles.push(role); }
    role.duties = Array.from(new Set([
      ...(role.duties||[]),
      ...(approveMembers ? ['ApproveMembers'] : []),
      ...(createWorkPlan ? ['CreateWorkPlan'] : [])
    ]));
    user.roles = roles; await user.save();
    return res.json({ ok:true, unitId:String(unitId), userId:String(user._id), duties: role.duties });
  } catch(e){ return res.status(500).json({ ok:false, message:'Failed to assign duty', error:e.message }); }
}

// List units with leaders and assignment flags for admin UI
// GET /api/units/assignments?ministry=... (auth)
async function listUnitAssignments(req,res){
  try{
    const actor = req.user; const isSuper = actorIsSuper(actor); const minRole = actorMinRole(actor);
    const { ministry, churchId } = req.query || {};
    const filter = {};
    if(isSuper){ if(churchId) filter.church = churchId; if(ministry) filter.ministryName = ministry; else if(actor.church) filter.church = actor.church; }
    if(minRole && !isSuper){ filter.church = minRole.church||actor.church; if(minRole.ministryName) filter.ministryName = minRole.ministryName; }
    const units = await Unit.find(filter).select('name leaders members attendanceTaking musicUnit enabledReportCards ministryName')
      .populate('leaders','firstName surname')
      .lean();
    const mapped = units.map(u=>({
      _id: u._id,
      name: u.name,
      leaderName: (u.leaders && u.leaders.length) ? `${u.leaders[0].firstName||''} ${u.leaders[0].surname||''}`.trim() : '_',
      attendanceTaking: !!u.attendanceTaking,
      musicUnit: !!u.musicUnit,
      enabledReportCards: u.enabledReportCards||[],
      ministryName: u.ministryName||null
    }));
    return res.json({ ok:true, units: mapped });
  } catch(e){ return res.status(500).json({ ok:false, message:'Failed to list assignments', error:e.message }); }
}

module.exports = { createUnit, addMember, listUnits, listUnitsPublic, listUnitsDashboard, unitSummaryById, assignAttendanceUnit, assignFinancialSecretary, assignMusicUnit, assignCardsToUnits, assignMemberDuty, listUnitAssignments };
