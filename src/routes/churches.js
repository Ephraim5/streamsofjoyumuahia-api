const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/churchesController');

router.get('/', auth, ctrl.listChurches);
router.post('/', auth, ctrl.createChurch);
router.get('/:id', auth, ctrl.getChurch);
router.put('/:id', auth, ctrl.updateChurch);
router.delete('/:id', auth, ctrl.deleteChurch);
router.post('/:id/ministries', auth, ctrl.addMinistry);
router.delete('/:id/ministries/:ministryId', auth, ctrl.removeMinistry);

module.exports = router;