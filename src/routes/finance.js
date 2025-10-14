const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { recordFinance, listFinance, updateFinance, deleteFinance, financeSummary } = require('../controllers/financeController');
// Create
router.post('/', authMiddleware, recordFinance);
// Read (list/filter)
router.get('/', authMiddleware, listFinance);
// Update
router.put('/:id', authMiddleware, updateFinance);
// Delete
router.delete('/:id', authMiddleware, deleteFinance);
// Summary for charts
router.get('/summary', authMiddleware, financeSummary);
module.exports = router;
