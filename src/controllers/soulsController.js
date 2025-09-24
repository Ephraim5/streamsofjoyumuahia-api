const Soul = require('../models/Soul');
/**
 * POST /api/souls
 * Body: { name, phone?, unitId?, dateWon?, gender?, ageRange?, convertedThrough?, location? }
 * Creates a soul record attributing addedBy = current user.
 */
async function addSoul(req, res) {
  const { name, phone, unitId, dateWon, gender, ageRange, convertedThrough, location } = req.body;
  if (!name) return res.status(400).json({ ok:false, message:'Name required' });
  const s = await Soul.create({ name, phone, gender, ageRange, convertedThrough, location, unit: unitId, addedBy: req.user._id, dateWon: dateWon||new Date() });
  res.json({ ok: true, soul: s });
}

/**
 * GET /api/souls?scope=mine|unit|auto&unitId=<id>
 *  scope:
 *   - mine: only souls added by current user
 *   - unit: souls for the active unit (or provided unitId if permitted)
 *   - auto (default / legacy): previous behavior (unit(s) if UnitLeader else mine; SuperAdmin -> all)
 */
async function listSouls(req, res) {
  const scope = (req.query.scope||'auto').toString();
  const unitIdParam = req.query.unitId?.toString();
  const roles = req.user.roles||[];
  const isSuper = roles.some(r=>r.role==='SuperAdmin');
  const activeRoleName = req.user.activeRole;
  const activeRoleObj = roles.find(r=>r.role === activeRoleName) || roles.find(r=>r.role==='UnitLeader') || roles.find(r=>r.role==='UnitMember');

  let query = {};

  if (scope === 'mine') {
    query = { addedBy: req.user._id };
  } else if (scope === 'unit') {
    let unitId = null;
    if (unitIdParam && (isSuper || roles.some(r=>r.unit && r.unit.toString() === unitIdParam))) {
      unitId = unitIdParam;
    } else if (activeRoleObj && activeRoleObj.unit) {
      unitId = activeRoleObj.unit;
    }
    if (unitId) query = { unit: unitId }; else query = { addedBy: req.user._id }; // fallback to personal if no unit context
  } else { // auto legacy
    if (isSuper) {
      query = {};
    } else {
      const leaderUnitIds = roles.filter(r=>r.role==='UnitLeader' && r.unit).map(r=>r.unit);
      if (leaderUnitIds.length) query = { unit: { $in: leaderUnitIds } }; else query = { addedBy: req.user._id };
    }
  }

  const list = await Soul.find(query).sort({ dateWon: -1 }).limit(500);
  res.json({ ok:true, scope, souls: list });
}
module.exports = { addSoul, listSouls };
