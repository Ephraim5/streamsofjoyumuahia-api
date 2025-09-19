const express = require('express');
const router = express.Router();
const { start, completeSuperAdmin, login } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');

router.post('/start', start); // { phone } or { accessCode }
// Complete SuperAdmin registration (email OTP already verified on client)
router.post('/complete-superadmin', completeSuperAdmin);
// Password login (token issued here)
router.post('/login', login);

// switch role
router.post('/switch-role', authMiddleware, async (req, res) => {
  const { role } = req.body;
  const user = req.user;
  if (!role) return res.status(400).json({ error: 'role required' });
  const has = (user.roles || []).some(r => r.role === role);
  if (!has) return res.status(400).json({ error: 'User does not have this role' });
  user.activeRole = role;
  await user.save();
  res.json({ ok: true, activeRole: role });
});

module.exports = router;
