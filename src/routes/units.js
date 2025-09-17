const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createUnit, addMember, listUnits } = require('../controllers/unitsController');

router.post('/', authMiddleware, createUnit);
router.post('/:id/members', authMiddleware, addMember);
router.get('/', authMiddleware, listUnits);

module.exports = router;
