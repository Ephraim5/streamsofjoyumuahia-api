const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Accept either: Authorization: Bearer <backend_jwt> OR Firebase token (starts with 'FIREBASE:')
async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    req.tokenPayload = payload;
    return next();
  } catch (err) {
    console.error('auth error', err.message || err);
    return res.status(401).json({ error: 'Invalid token' ,ok:false});
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(403).json({ error: 'Forbidden',ok:false });
    const has = (u.roles || []).some(r => r.role === role);
    if (!has) return res.status(403).json({ error: 'Required role: ' + role });
    next();
  };
}

module.exports = { authMiddleware, requireRole };
