const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { summary, unitLeaderSummary } = require('../controllers/reportsController');

router.get('/summary', authMiddleware, summary);
router.get('/unit-leader/summary', authMiddleware, unitLeaderSummary);

module.exports = router;
