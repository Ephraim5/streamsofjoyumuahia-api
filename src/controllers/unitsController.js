const Unit = require('../models/Unit');
const User = require('../models/User');
const Soul = require('../models/Soul');
const Invite = require('../models/Invite');
const Assistance = require('../models/Assistance');
const Marriage = require('../models/Marriage');
const RecoveredAddict = require('../models/RecoveredAddict');
const Song = require('../models/Song');
const Achievement = require('../models/Achievement');
const Soul = require('../models/Soul');
const Invite = require('../models/Invite');
const Achievement = require('../models/Achievement');
const Assistance = require('../models/Assistance');
const Marriage = require('../models/Marriage');
const RecoveredAddict = require('../models/RecoveredAddict');
const Song = require('../models/Song');

async function createUnit(req, res) {
  // only SuperAdmin
  if (!req.user.roles.some(r=>r.role==='SuperAdmin')) return res.status(403).json({ error: 'Requires SuperAdmin' });
  const { name, description } = req.body;
  const unit = await Unit.create({ name, description });
  res.json({ unit });
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
  const units = await Unit.find().populate('leaders members', 'firstName surname phone email');
  res.json({ units });
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

module.exports = { createUnit, addMember, listUnits, listUnitsPublic };

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

    // Load all units with leaders and members
    const units = await Unit.find().select('name leaders members')
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
        leaderName,
        membersCount,
        activeCount: activeSet.size,
        lastReportAt: last
      };
    });

    return res.json({ ok:true, units: result, days });
  } catch (e) {
    console.error('listUnitsDashboard error', e);
    return res.status(500).json({ ok:false, message:'Failed to build units dashboard', error: e.message });
  }
}

module.exports = { createUnit, addMember, listUnits, listUnitsPublic, listUnitsDashboard };

// Dashboard for SuperAdmin: per-unit leader, members count, active members in timeframe, last report date
async function listUnitsDashboard(req, res) {
  try {
    const user = req.user;
    const isSuper = (user?.roles || []).some(r => r.role === 'SuperAdmin') || user?.activeRole === 'SuperAdmin';
    if (!isSuper) return res.status(403).json({ ok: false, message: 'Requires SuperAdmin' });

    const days = Math.max(1, Math.min(60, Number(req.query.days) || 14));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Load all units with leaders/members (for counts and leader info)
    const units = await Unit.find({}).select('name leaders members')
      .populate('leaders', 'firstName middleName surname phone email title approved createdAt')
      .populate('members', '_id');

    // Helper to run aggregate on a model: return map unitId => { maxDate, activeUsers: Set<ObjectId> }
    async function agg(model, { unitField, userField, dateField }) {
      // Build pipeline computing max date (fallback to createdAt) and active users since timeframe
      const pipeline = [
        { $match: { [unitField]: { $ne: null } } },
        {
          $group: {
            _id: `$${unitField}`,
            maxDate: { $max: { $ifNull: [ `$${dateField}`, '$createdAt' ] } },
            actUsersRaw: { $addToSet: { $cond: [ { $gte: [ { $ifNull: [ `$${dateField}`, '$createdAt' ] }, since ] }, `$${userField}`, null ] } }
          }
        },
        { $project: { maxDate: 1, actUsers: { $setDifference: [ '$actUsersRaw', [ null ] ] } } }
      ];
      const rows = await model.aggregate(pipeline);
      const out = new Map();
      for (const r of rows) {
        out.set(String(r._id), { maxDate: r.maxDate ? new Date(r.maxDate) : null, activeUsers: new Set((r.actUsers || []).map(x => String(x))) });
      }
      return out;
    }

    const [
      soulsAgg,
      invitesAgg,
      achievementsAgg,
      assistsAgg,
      marriagesAgg,
      recoveredAgg,
      songsAgg
    ] = await Promise.all([
      agg(Soul, { unitField: 'unit', userField: 'addedBy', dateField: 'dateWon' }),
      agg(Invite, { unitField: 'unit', userField: 'invitedBy', dateField: 'invitedAt' }),
      agg(Achievement, { unitField: 'unit', userField: 'addedBy', dateField: 'date' }),
      agg(Assistance, { unitField: 'unit', userField: 'addedBy', dateField: 'assistedOn' }),
      agg(Marriage, { unitField: 'unit', userField: 'addedBy', dateField: 'date' }),
      agg(RecoveredAddict, { unitField: 'unit', userField: 'addedBy', dateField: 'dateOfRecovery' }),
      agg(Song, { unitField: 'unit', userField: 'addedBy', dateField: 'releaseDate' })
    ]);

    function mergeUnitActivity(unitId) {
      const key = String(unitId);
      const sources = [soulsAgg, invitesAgg, achievementsAgg, assistsAgg, marriagesAgg, recoveredAgg, songsAgg];
      let maxDate = null;
      const activeUsers = new Set();
      for (const src of sources) {
        const r = src.get(key);
        if (!r) continue;
        if (r.maxDate && (!maxDate || r.maxDate > maxDate)) maxDate = r.maxDate;
        for (const u of r.activeUsers) activeUsers.add(u);
      }
      return { maxDate, activeUsers };
    }

    const payload = units.map(u => {
      const { maxDate, activeUsers } = mergeUnitActivity(u._id);
      const leader = (u.leaders && u.leaders.length) ? u.leaders[0] : null;
      const leaderName = leader ? [leader.title, leader.firstName, leader.middleName, leader.surname].filter(Boolean).join(' ') : '_';
      const membersCount = (u.leaders?.length || 0) + (u.members?.length || 0);
      // Count active among unit workers (leaders + members)
      const unitWorkerIds = new Set([...(u.leaders || []).map(x => String(x._id || x)), ...(u.members || []).map(x => String(x._id || x))]);
      let activeCount = 0;
      for (const id of activeUsers) {
        if (unitWorkerIds.has(String(id))) activeCount++;
      }
      return {
        _id: u._id,
        name: u.name,
        leader: leader ? { _id: leader._id, firstName: leader.firstName, middleName: leader.middleName, surname: leader.surname, phone: leader.phone || '', email: leader.email || '', title: leader.title || '', approved: !!leader.approved, createdAt: leader.createdAt } : null,
        leaderName,
        membersCount,
        activeCount,
        lastReportAt: maxDate || null
      };
    });

    return res.json({ ok: true, days, units: payload });
  } catch (e) {
    console.error('listUnitsDashboard error', e);
    return res.status(500).json({ ok: false, message: 'Failed to load units dashboard', error: e.message });
  }
}

module.exports.listUnitsDashboard = listUnitsDashboard;
