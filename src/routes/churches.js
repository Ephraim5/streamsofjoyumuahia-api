const express = require('express');
const router = express.Router();
// Import the actual middleware function (previously imported whole export object, causing runtime crash)
const { authMiddleware } = require('../middleware/auth');

// Destructure controller exports explicitly so a missing export surfaces clearly
const churchesController = require('../controllers/churchesController');
const {
	listChurches,
	createChurch,
	getChurch,
	updateChurch,
	deleteChurch,
	addMinistry,
	removeMinistry,
} = churchesController || {};

function ensure(fnName, fn) {
	if (typeof fn !== 'function') {
		// Log once per missing handler; provide a safe fallback to avoid process crash
		console.error(`[routes/churches] Missing controller function: ${fnName}. Export keys: ${Object.keys(churchesController || {}).join(', ')}`);
		return (req, res) => res.status(500).json({ ok: false, error: `Controller ${fnName} not implemented` });
	}
	return fn;
}

// Attach routes with guards so a missing handler does not crash the server at startup
router.get('/', authMiddleware, ensure('listChurches', listChurches));
router.post('/', authMiddleware, ensure('createChurch', createChurch));
router.get('/:id', authMiddleware, ensure('getChurch', getChurch));
router.put('/:id', authMiddleware, ensure('updateChurch', updateChurch));
router.delete('/:id', authMiddleware, ensure('deleteChurch', deleteChurch));
router.post('/:id/ministries', authMiddleware, ensure('addMinistry', addMinistry));
router.delete('/:id/ministries/:ministryId', authMiddleware, ensure('removeMinistry', removeMinistry));

module.exports = router;