const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createMinistryAdmin, listMinistryAdmins } = require('../controllers/ministryAdminsController');

router.post('/', auth, createMinistryAdmin);
router.get('/', auth, listMinistryAdmins);

module.exports = router;
