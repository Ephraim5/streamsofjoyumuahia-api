const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createUnit, addMember, listUnits, listUnitsPublic } = require('../controllers/unitsController');
const Unit = require('../models/Unit');
const User = require('../models/User');

router.post('/', authMiddleware, createUnit);
router.post('/:id/members', authMiddleware, addMember);
router.get('/', authMiddleware, listUnits);
// Public listing for registration wizard (name & _id only)
router.get('/public', listUnitsPublic);

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
    const members = await User.find({ _id: { $in: unit.members } }).select('firstName middleName surname phone title gender');
    return res.json({ ok:true, members });
  } catch(e){
    console.error('list unit members error', e);
    return res.status(500).json({ ok:false, message:'Failed to list members', error:e.message });
  }
});

module.exports = router;
