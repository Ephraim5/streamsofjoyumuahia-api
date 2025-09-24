const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { listMarriages, createMarriage, updateMarriage, deleteMarriage } = require('../controllers/marriagesController');

router.get('/', authMiddleware, listMarriages);
router.post('/', authMiddleware, createMarriage);
router.put('/:id', authMiddleware, updateMarriage);
router.delete('/:id', authMiddleware, deleteMarriage);

module.exports = router;
