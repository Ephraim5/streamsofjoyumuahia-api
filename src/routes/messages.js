const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { sendMessage, listConversations, fetchConversation, markRead, deleteConversation, deleteMessage, addReaction, removeReaction } = require('../controllers/messagesController');

router.post('/', authMiddleware, sendMessage);
router.get('/conversations', authMiddleware, listConversations);
router.get('/conversation/:scope/:id', authMiddleware, fetchConversation); // scope in ['user','unit']
router.post('/mark-read', authMiddleware, markRead);
router.delete('/conversation', authMiddleware, deleteConversation);
router.delete('/:id', authMiddleware, deleteMessage);
router.post('/:id/reactions', authMiddleware, addReaction);
router.delete('/:id/reactions', authMiddleware, removeReaction);

module.exports = router;
