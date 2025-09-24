const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { listRecovered, createRecovered, updateRecovered, deleteRecovered } = require('../controllers/recoveredAddictsController');

router.get('/', auth, listRecovered);
router.post('/', auth, createRecovered);
router.put('/:id', auth, updateRecovered);
router.delete('/:id', auth, deleteRecovered);

module.exports = router;
