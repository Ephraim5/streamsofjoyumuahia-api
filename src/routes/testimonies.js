const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { submitTestimony, listTestimonies } = require('../controllers/testimonyController');
router.post('/', authMiddleware, submitTestimony);
router.get('/', authMiddleware, listTestimonies);
module.exports = router;
