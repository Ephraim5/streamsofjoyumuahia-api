const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createInvite, listInvites } = require('../controllers/inviteController');

router.post('/', authMiddleware, createInvite);
router.get('/', authMiddleware, listInvites);

module.exports = router;
