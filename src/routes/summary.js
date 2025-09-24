const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { unitMemberSummary } = require('../controllers/summaryController');

router.get('/unit-member', authMiddleware, unitMemberSummary);

module.exports = router;
