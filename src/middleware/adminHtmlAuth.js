module.exports = function adminHtmlAuth(req, res, next) {
  try {
    const provided = (req.headers['x-admin-password'] || '').toString();
    const expected = process.env.ADMIN_HTML_PASSWORD || 'Soj@2025';
    if (!provided || provided !== expected) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
};
