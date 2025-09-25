const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createEvent, listEvents, updateEvent, deleteEvent } = require('../controllers/eventsController');

router.post('/', authMiddleware, createEvent);
router.get('/', authMiddleware, listEvents);
router.put('/:id', authMiddleware, updateEvent);
router.delete('/:id', authMiddleware, deleteEvent);

module.exports = router;
