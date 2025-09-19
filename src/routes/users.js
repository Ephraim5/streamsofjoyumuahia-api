const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getMe, updateUser, listUsers, lookupEmail, getUserById } = require('../controllers/usersController');

// Public minimal email lookup for onboarding
router.post('/lookup-email', lookupEmail);

router.get('/me', authMiddleware, getMe);
router.get('/', authMiddleware, listUsers);
router.put('/:id', authMiddleware, updateUser);
router.get('/:id', authMiddleware, getUserById);

module.exports = router;
