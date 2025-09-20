const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createUnit, addMember, listUnits, listUnitsPublic } = require('../controllers/unitsController');

router.post('/', authMiddleware, createUnit);
router.post('/:id/members', authMiddleware, addMember);
router.get('/', authMiddleware, listUnits);
// Public listing for registration wizard (name & _id only)
router.get('/public', listUnitsPublic);

module.exports = router;
