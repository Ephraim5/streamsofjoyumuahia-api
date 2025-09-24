const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { listMarriages, createMarriage, updateMarriage, deleteMarriage } = require('../controllers/marriagesController');

router.get('/', auth, listMarriages);
router.post('/', auth, createMarriage);
router.put('/:id', auth, updateMarriage);
router.delete('/:id', auth, deleteMarriage);

module.exports = router;
