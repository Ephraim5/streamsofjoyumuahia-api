const Assistance = require('../models/Assistance');

function userUnitIds(user) {
  return (user.roles || [])
    .filter(r => ['Member','UnitLeader'].includes(r.role) && r.unit)
    .map(r => String(r.unit));
}
function isSuperAdmin(user) { return (user.roles || []).some(r => r.role === 'SuperAdmin'); }

// POST /api/assists  { memberId, assistedOn, reason, howHelped }
async function createAssist(req, res) {
  try {
    const { memberId, assistedOn, reason, howHelped } = req.body || {};
    if (!memberId) return res.status(400).json({ ok:false, error:'memberId required' });
    if (!assistedOn) return res.status(400).json({ ok:false, error:'assistedOn required' });

    // derive unit from user active role or first unit
    const allowedUnits = userUnitIds(req.user);
    let unit = null;
    const active = (req.user.roles || []).find(r => r.role === (req.user.activeRole || 'UnitLeader') && r.unit) || (req.user.roles||[]).find(r=>r.unit);
    unit = active?.unit || allowedUnits[0] || null;
    if (!unit) return res.status(400).json({ ok:false, error:'no unit context' });

    // resolve member info
    const User = require('../models/User');
    const member = await User.findById(memberId);
    if (!member) return res.status(404).json({ ok:false, error:'member not found' });
    const memberName = [member.firstName, member.middleName, member.surname].filter(Boolean).join(' ').trim() || member.phone || 'Member';
    const phone = member.phone || '';

    const doc = await Assistance.create({
      member: member._id,
      memberName,
      phone,
      assistedOn: new Date(assistedOn),
      reason: reason || '',
      howHelped: howHelped || '',
      unit,
      addedBy: req.user._id,
    });
    return res.json({ ok:true, assist: doc });
  } catch (e) {
    console.error('[assists] create error', e);
    return res.status(500).json({ ok:false, error:e.message });
  }
}

// GET /api/assists?year=&scope=unit|mine&unitId=
async function listAssists(req, res) {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const scope = (req.query.scope || 'unit').toString();
    const unitIdParam = req.query.unitId?.toString();
    const allowedUnits = userUnitIds(req.user);

    let filter = {};
    if (scope === 'mine') {
      filter.addedBy = req.user._id;
    } else {
      let unit = null;
      if (unitIdParam && (isSuperAdmin(req.user) || allowedUnits.includes(unitIdParam))) unit = unitIdParam;
      else {
        const active = (req.user.roles || []).find(r => r.role === (req.user.activeRole || 'UnitLeader') && r.unit) || (req.user.roles||[]).find(r=>r.unit);
        unit = active?.unit || allowedUnits[0] || null;
      }
      if (unit) filter.unit = unit;
    }
    if (year) {
      const start = new Date(year,0,1); const end = new Date(year+1,0,1);
      filter.assistedOn = { $gte: start, $lt: end };
    }
    const list = await Assistance.find(filter).sort({ assistedOn: -1, createdAt: -1 });
    return res.json({ ok:true, assists: list });
  } catch (e) {
    console.error('[assists] list error', e);
    return res.status(500).json({ ok:false, error:e.message });
  }
}

// PUT /api/assists/:id
async function updateAssist(req, res) {
  try {
    const { id } = req.params;
    const { assistedOn, reason, howHelped } = req.body || {};
    const doc = await Assistance.findById(id);
    if (!doc) return res.status(404).json({ ok:false, error:'not found' });
    const allowedUnits = userUnitIds(req.user);
    if (!isSuperAdmin(req.user) && !allowedUnits.includes(String(doc.unit))) return res.status(403).json({ ok:false, error:'not allowed' });
    if (assistedOn !== undefined) doc.assistedOn = new Date(assistedOn);
    if (reason !== undefined) doc.reason = reason;
    if (howHelped !== undefined) doc.howHelped = howHelped;
    await doc.save();
    return res.json({ ok:true, assist: doc });
  } catch (e) {
    console.error('[assists] update error', e);
    return res.status(500).json({ ok:false, error:e.message });
  }
}

// DELETE /api/assists/:id
async function deleteAssist(req, res) {
  try {
    const { id } = req.params;
    const doc = await Assistance.findById(id);
    if (!doc) return res.status(404).json({ ok:false, error:'not found' });
    const allowedUnits = userUnitIds(req.user);
    if (!isSuperAdmin(req.user) && !allowedUnits.includes(String(doc.unit))) return res.status(403).json({ ok:false, error:'not allowed' });
    await Assistance.deleteOne({ _id: id });
    return res.json({ ok:true });
  } catch (e) {
    console.error('[assists] delete error', e);
    return res.status(500).json({ ok:false, error:e.message });
  }
}

module.exports = { createAssist, listAssists, updateAssist, deleteAssist };
