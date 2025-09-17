const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createItem, listItems, sellItem } = require('../controllers/shopController');
router.post('/items', authMiddleware, createItem);
router.get('/items', authMiddleware, listItems);
router.post('/sell', authMiddleware, sellItem);
module.exports = router;
