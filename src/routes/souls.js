const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { addSoul, listSouls } = require('../controllers/soulsController');
router.post('/', authMiddleware, addSoul);
router.get('/', authMiddleware, listSouls);
module.exports = router;
