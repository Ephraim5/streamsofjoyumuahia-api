const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getMe, updateUser, listUsers } = require('../controllers/usersController');

router.get('/me', authMiddleware, getMe);
router.get('/', authMiddleware, listUsers);
router.put('/:id', authMiddleware, updateUser);

module.exports = router;
