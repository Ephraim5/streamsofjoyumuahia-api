const express = require('express');
const router = express.Router();
const adminHtmlAuth = require('../middleware/adminHtmlAuth');
const { summary } = require('../controllers/reportsController');
const { broadcastPush } = require('../utils/push');

// Simple wrapper to reuse summary controller
router.get('/summary', adminHtmlAuth, async (req, res) => {
  try {
    // Fake user for summary; the summary controller doesn't need req.user
    req.user = null;
    return summary(req, res);
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
});

router.post('/push', adminHtmlAuth, async (req, res) => {
  try {
    const { title, body, data } = req.body || {};
    if (!title || !body) return res.status(400).json({ ok:false, error:'title and body required' });
    const out = await broadcastPush({ title, body, data });
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
});

module.exports = router;
