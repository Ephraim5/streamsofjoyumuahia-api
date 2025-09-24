const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createAchievement, listAchievements, updateAchievement, deleteAchievement } = require('../controllers/achievementsController');

// CRUD
router.post('/', authMiddleware, createAchievement);
router.get('/', authMiddleware, listAchievements);
router.put('/:id', authMiddleware, updateAchievement);
router.delete('/:id', authMiddleware, deleteAchievement);

module.exports = router;
