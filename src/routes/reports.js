const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { summary } = require('../controllers/reportsController');

router.get('/summary', authMiddleware, summary);

module.exports = router;
