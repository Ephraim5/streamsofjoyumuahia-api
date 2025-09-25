const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { registerDeviceToken, broadcastPush } = require('../utils/push');

router.post('/register', authMiddleware, async (req, res) => {
  const { token, platform } = req.body || {};
  if(!token) return res.status(400).json({ ok:false, error:'token required' });
  const saved = await registerDeviceToken(req.user?._id, token, platform);
  res.json({ ok: true, device: saved });
});

router.post('/broadcast', authMiddleware, async (req, res) => {
  const { title, body, data, icon } = req.body || {};
  if(!title || !body) return res.status(400).json({ ok:false, error:'title and body required' });
  const out = await broadcastPush({ title, body, data, icon });
  res.json(out);
});

module.exports = router;
