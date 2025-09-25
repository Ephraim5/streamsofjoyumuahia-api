const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createAnnouncement, listAnnouncements, updateAnnouncement, deleteAnnouncement } = require('../controllers/announcementsController');
router.post('/', authMiddleware, createAnnouncement);
router.get('/', authMiddleware, listAnnouncements);
router.put('/:id', authMiddleware, updateAnnouncement);
router.delete('/:id', authMiddleware, deleteAnnouncement);
module.exports = router;
