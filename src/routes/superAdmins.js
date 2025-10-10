const express = require('express');
const router = express.Router();
// Import the auth middleware correctly (previously imported the entire module object causing TypeError)
const { authMiddleware } = require('../middleware/auth');
const ctrl = require('../controllers/superAdminRegistrationController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Public HTML (served via index.js GET but keep for consistency if needed)
router.post('/register-superadmin', upload.single('avatar'), ctrl.handleRegistration);

// Authenticated (multi superadmin only)
router.post('/superadmins/approve', authMiddleware, ctrl.approveSuperAdmin);
router.get('/superadmins/pending', authMiddleware, ctrl.listPending);
router.get('/superadmins/churches', authMiddleware, ctrl.listChurchesForSwitch);
router.post('/superadmins/switch-church', authMiddleware, ctrl.switchChurch);

module.exports = router;