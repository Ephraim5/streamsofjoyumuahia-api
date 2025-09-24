const Achievement = require('../models/Achievement');

// Helpers
function userUnitIds(user) {
  return (user.roles || [])
    .filter(r => ['Member','UnitLeader','PastorUnit'].includes(r.role) && r.unit)
    .map(r => String(r.unit));
}

function isSuperAdmin(user) {
  return (user.roles || []).some(r => r.role === 'SuperAdmin');
}

// POST /api/achievements
// Body: { title, description?, date?, unitId? }
// If unitId not provided, derive from active role's unit (or only unit if single)
async function createAchievement(req, res) {
  try {
    const { title, description, date, unitId } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: 'title required' });

    let unit = unitId;
    const allowedUnits = userUnitIds(req.user);
    if (!unit) {
      const active = (req.user.roles || []).find(r => r.role === (req.user.activeRole || 'UnitLeader') && r.unit) || (req.user.roles||[]).find(r=>r.unit);
      if (active && active.unit) unit = active.unit;
    }
    if (!unit) return res.status(400).json({ ok:false, error: 'unitId required or inferable from user role' });

    // Access control: non-super users can only create for their allowed units
    if (!isSuperAdmin(req.user) && !allowedUnits.includes(String(unit))) {
      return res.status(403).json({ ok:false, error: 'not allowed for unit' });
    }

    const doc = await Achievement.create({
      title,
      description: description || '',
      date: date ? new Date(date) : new Date(),
      unit,
      addedBy: req.user._id,
    });
    return res.json({ ok: true, achievement: doc });
  } catch (err) {
    console.error('[achievements] create error', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}

// GET /api/achievements?year=&unitId=&scope=unit|mine
// scope defaults to unit (current active unit). SuperAdmin can pass any unitId. Members/Leaders restricted to own units.
async function listAchievements(req, res) {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const scope = (req.query.scope || 'unit').toString();
    const unitIdParam = req.query.unitId?.toString();
    const allowedUnits = userUnitIds(req.user);

    let filter = {};
    if (scope === 'mine') {
      filter.addedBy = req.user._id;
    } else { // unit scope
      let unit = null;
      if (unitIdParam && (isSuperAdmin(req.user) || allowedUnits.includes(unitIdParam))) {
        unit = unitIdParam;
      } else {
        // derive from user activeRole or first unit
        const active = (req.user.roles || []).find(r => r.role === (req.user.activeRole || 'UnitLeader') && r.unit) || (req.user.roles||[]).find(r=>r.unit);
        unit = active?.unit || allowedUnits[0] || null;
      }
      if (unit) filter.unit = unit;
    }

    if (year) {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      filter.date = { $gte: start, $lt: end };
    }

    const list = await Achievement.find(filter).sort({ date: -1, createdAt: -1 });
    return res.json({ ok: true, achievements: list });
  } catch (err) {
    console.error('[achievements] list error', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}

// PUT /api/achievements/:id
async function updateAchievement(req, res) {
  try {
    const { id } = req.params;
    const { title, description, date } = req.body;
    const doc = await Achievement.findById(id);
    if (!doc) return res.status(404).json({ ok:false, error: 'not found' });
    const allowedUnits = userUnitIds(req.user);
    if (!isSuperAdmin(req.user) && !allowedUnits.includes(String(doc.unit))) {
      return res.status(403).json({ ok:false, error: 'not allowed' });
    }
    if (title !== undefined) doc.title = title;
    if (description !== undefined) doc.description = description;
    if (date !== undefined) doc.date = new Date(date);
    await doc.save();
    return res.json({ ok:true, achievement: doc });
  } catch (err) {
    console.error('[achievements] update error', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}

// DELETE /api/achievements/:id
async function deleteAchievement(req, res) {
  try {
    const { id } = req.params;
    const doc = await Achievement.findById(id);
    if (!doc) return res.status(404).json({ ok:false, error: 'not found' });
    const allowedUnits = userUnitIds(req.user);
    if (!isSuperAdmin(req.user) && !allowedUnits.includes(String(doc.unit))) {
      return res.status(403).json({ ok:false, error: 'not allowed' });
    }
    await Achievement.deleteOne({ _id: id });
    return res.json({ ok:true });
  } catch (err) {
    console.error('[achievements] delete error', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}

module.exports = { createAchievement, listAchievements, updateAchievement, deleteAchievement };
