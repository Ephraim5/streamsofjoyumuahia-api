const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth, requireRole } = require('../middleware/auth');
const { createTicket, listTickets, getLegal, seedLegal } = require('../controllers/supportController');

// Create support ticket (auth optional) - attaches user if provided token
router.post('/tickets', optionalAuth, createTicket);

// Admin list (SuperAdmin only)
router.get('/admin/tickets', authMiddleware, requireRole('SuperAdmin'), listTickets);

// Legal pages
router.get('/legal/:type', getLegal); // type=terms | privacy

// Seed / overwrite legal pages (admin utility)
router.post('/legal/seed', authMiddleware, requireRole('SuperAdmin'), seedLegal);

module.exports = router;
