const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createMinistryAdmin, listMinistryAdmins } = require('../controllers/ministryAdminsController');

// Ensure functions exist (light guard similar to churches route could be added if desired)
router.post('/', authMiddleware, createMinistryAdmin);
router.get('/', authMiddleware, listMinistryAdmins);

module.exports = router;
