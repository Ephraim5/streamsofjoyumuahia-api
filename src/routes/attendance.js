const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { submitAttendance } = require('../controllers/attendanceController');

router.post('/', authMiddleware, submitAttendance);

module.exports = router;
