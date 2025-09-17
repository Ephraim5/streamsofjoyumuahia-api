const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createEvent, listEvents } = require('../controllers/eventsController');

router.post('/', authMiddleware, createEvent);
router.get('/', authMiddleware, listEvents);

module.exports = router;
