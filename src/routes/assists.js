const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createAssist, listAssists, updateAssist, deleteAssist } = require('../controllers/assistsController');

router.post('/', authMiddleware, createAssist);
router.get('/', authMiddleware, listAssists);
router.put('/:id', authMiddleware, updateAssist);
router.delete('/:id', authMiddleware, deleteAssist);

module.exports = router;
