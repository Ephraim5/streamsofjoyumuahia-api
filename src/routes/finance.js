const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { recordFinance, listFinance } = require('../controllers/financeController');
router.post('/', authMiddleware, recordFinance);
router.get('/', authMiddleware, listFinance);
module.exports = router;
