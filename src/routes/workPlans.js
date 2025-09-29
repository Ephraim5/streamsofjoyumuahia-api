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
// SuperAdmin review extensions
router.post('/:id/review/approve', authMiddleware, ctrl.reviewApproveWorkPlan);
router.post('/:id/review/reject', authMiddleware, ctrl.reviewRejectWorkPlan);
router.post('/:id/review/comment', authMiddleware, ctrl.addWorkPlanComment);
router.post('/:id/review/activity', authMiddleware, ctrl.reviewActivity);
router.post('/:id/review/activity/comment', authMiddleware, ctrl.addActivityComment);
router.post('/:id/success-rate', authMiddleware, ctrl.setSuccessRate);
router.delete('/:id', authMiddleware, ctrl.deleteWorkPlan);

module.exports = router;