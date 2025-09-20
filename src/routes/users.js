const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getMe, updateUser, listUsers, lookupEmail, getUserById, changePassword } = require('../controllers/usersController');
const { approveUser, listPending } = require('../controllers/approvalController');

// Public minimal email lookup for onboarding
router.post('/lookup-email', lookupEmail);

router.get('/me', authMiddleware, getMe);
router.get('/', authMiddleware, listUsers);
// Update basic profile fields
router.put('/:id', authMiddleware, updateUser);
// Change password for logged in user
router.post('/change-password', authMiddleware, changePassword);
router.get('/:id', authMiddleware, getUserById);
router.post('/approve', authMiddleware, approveUser);
router.get('/pending/list', authMiddleware, listPending);

module.exports = router;
