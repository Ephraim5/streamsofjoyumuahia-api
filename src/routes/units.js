const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createUnit, addMember, listUnits, listUnitsPublic, listUnitsDashboard, unitSummaryById, assignAttendanceUnit, assignFinancialSecretary, assignMusicUnit, assignCardsToUnits, assignMemberDuty, listUnitAssignments, unassignFinancialSecretary } = require('../controllers/unitsController');
const Unit = require('../models/Unit');
const User = require('../models/User');

router.post('/', authMiddleware, createUnit);
router.post('/:id/members', authMiddleware, addMember);
router.get('/', authMiddleware, listUnits);
// Admin view of current assignments
router.get('/assignments', authMiddleware, listUnitAssignments);
// Public listing for registration wizard (name & _id only)
router.get('/public', listUnitsPublic);
// SuperAdmin dashboard view of all units with computed metrics
router.get('/dashboard', authMiddleware, listUnitsDashboard);
// SuperAdmin unit summary by id
router.get('/:id/summary', authMiddleware, unitSummaryById);
// Assign attendance-taking unit (SuperAdmin or MinistryAdmin within scope)
router.post('/assign-attendance', authMiddleware, assignAttendanceUnit);
// Assign financial secretary for a unit (SuperAdmin/MinistryAdmin within scope, or that unit's UnitLeader)
router.post('/:id/assign-finsec', authMiddleware, assignFinancialSecretary);
router.post('/:id/unassign-finsec', authMiddleware, unassignFinancialSecretary);
// Assign music-unit flag for a unit
router.post('/:id/assign-music', authMiddleware, assignMusicUnit);
// Assign report cards to units (bulk)
router.post('/assign-cards', authMiddleware, assignCardsToUnits);
// Assign member duty flags (approve members, create work plan)
router.post('/:id/assign-duty', authMiddleware, assignMemberDuty);

// GET /api/units/:id/members  (auth) => minimal member list
router.get('/:id/members/list', authMiddleware, async (req,res) => {
  try {
    const { id } = req.params;
    if(!id) return res.status(400).json({ ok:false, message:'unit id required' });
    const user = req.user;
    const isSuper = (user.roles||[]).some(r=>r.role==='SuperAdmin') || user.activeRole==='SuperAdmin';
    const allowedUnitIds = (user.roles||[]).filter(r=>['Member','UnitLeader'].includes(r.role) && r.unit).map(r=>String(r.unit));
    if(!isSuper && !allowedUnitIds.includes(String(id))){
      return res.status(403).json({ ok:false, message:'Forbidden for this unit' });
    }
    const unit = await Unit.findById(id).select('members');
    if(!unit) return res.status(404).json({ ok:false, message:'Unit not found' });
  const members = await User.find({ _id: { $in: unit.members } }).select('firstName middleName surname phone title gender profile.avatar roles');
    return res.json({ ok:true, members });
  } catch(e){
    console.error('list unit members error', e);
    return res.status(500).json({ ok:false, message:'Failed to list members', error:e.message });
  }
});

// GET /api/units/:id/leaders/list  (auth) => minimal leaders list
router.get('/:id/leaders/list', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ ok: false, message: 'unit id required' });
    const user = req.user;
    const isSuper = (user.roles || []).some(r => r.role === 'SuperAdmin') || user.activeRole === 'SuperAdmin';
    const allowedUnitIds = (user.roles || []).filter(r => ['Member', 'UnitLeader'].includes(r.role) && r.unit).map(r => String(r.unit));
    if (!isSuper && !allowedUnitIds.includes(String(id))) {
      return res.status(403).json({ ok: false, message: 'Forbidden for this unit' });
    }
    const unit = await Unit.findById(id).select('leaders');
    if (!unit) return res.status(404).json({ ok: false, message: 'Unit not found' });
    const leaders = await User.find({ _id: { $in: unit.leaders } }).select('firstName middleName surname phone title profile.avatar');
    return res.json({ ok: true, leaders });
  } catch (e) {
    console.error('list unit leaders error', e);
    return res.status(500).json({ ok: false, message: 'Failed to list leaders', error: e.message });
  }
});

module.exports = router;
