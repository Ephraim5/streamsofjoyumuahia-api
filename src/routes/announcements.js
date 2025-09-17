const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createAnnouncement, listAnnouncements } = require('../controllers/announcementsController');
router.post('/', authMiddleware, createAnnouncement);
router.get('/', authMiddleware, listAnnouncements);
module.exports = router;
