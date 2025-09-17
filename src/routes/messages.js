const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { sendMessage, fetchConversation } = require('../controllers/messagesController');

router.post('/', authMiddleware, sendMessage);
router.get('/conversation/:userId', authMiddleware, fetchConversation);

module.exports = router;
