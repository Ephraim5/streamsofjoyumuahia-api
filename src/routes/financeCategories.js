const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { listCategories, createCategory, renameCategory } = require('../controllers/financeCategoriesController');

router.get('/', authMiddleware, listCategories);
router.post('/', authMiddleware, createCategory);
router.put('/rename', authMiddleware, renameCategory);

module.exports = router;
