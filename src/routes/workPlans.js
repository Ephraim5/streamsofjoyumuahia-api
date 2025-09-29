const express = require('express');
const router = express.Router();
// Import auth utilities; need the actual middleware function (authMiddleware)
const { authMiddleware } = require('../middleware/auth');
const ctrl = require('../controllers/workPlanController');

// All endpoints require auth for now
router.get('/', authMiddleware, ctrl.listWorkPlans);
router.get('/:id', authMiddleware, ctrl.getWorkPlan);
router.post('/', authMiddleware, ctrl.createWorkPlan);
router.put('/:id', authMiddleware, ctrl.updateWorkPlan);
router.post('/:id/submit', authMiddleware, ctrl.submitWorkPlan);
router.post('/:id/approve', authMiddleware, ctrl.approveWorkPlan);
router.post('/:id/reject', authMiddleware, ctrl.rejectWorkPlan);
router.post('/:id/activity-progress', authMiddleware, ctrl.updateActivityProgress);
router.delete('/:id', authMiddleware, ctrl.deleteWorkPlan);

module.exports = router;