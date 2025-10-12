const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { unitMemberSummary, ministrySummary, churchSummary } = require('../controllers/summaryController');

router.get('/unit-member', authMiddleware, unitMemberSummary);
router.get('/ministry', authMiddleware, ministrySummary);
router.get('/church', authMiddleware, churchSummary);

module.exports = router;
