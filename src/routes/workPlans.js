const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/workPlanController');

// All endpoints require auth for now
router.get('/', auth, ctrl.listWorkPlans);
router.get('/:id', auth, ctrl.getWorkPlan);
router.post('/', auth, ctrl.createWorkPlan);
router.put('/:id', auth, ctrl.updateWorkPlan);
router.post('/:id/submit', auth, ctrl.submitWorkPlan);
router.post('/:id/approve', auth, ctrl.approveWorkPlan);
router.post('/:id/reject', auth, ctrl.rejectWorkPlan);
router.post('/:id/activity-progress', auth, ctrl.updateActivityProgress);

module.exports = router;