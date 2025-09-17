const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { generateCode, validateCode } = require('../controllers/accessCodeController');

router.post('/', authMiddleware, generateCode);
router.post('/validate', validateCode);

module.exports = router;
