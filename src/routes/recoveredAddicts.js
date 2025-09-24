const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { listRecovered, createRecovered, updateRecovered, deleteRecovered } = require('../controllers/recoveredAddictsController');

router.get('/', authMiddleware, listRecovered);
router.post('/', authMiddleware, createRecovered);
router.put('/:id', authMiddleware, updateRecovered);
router.delete('/:id', authMiddleware, deleteRecovered);

module.exports = router;
