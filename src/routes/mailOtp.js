const express = require('express');
const router = express.Router();
const { sendMailOtp, verifyMailOtp, completeRegularRegistration } = require('../controllers/mailOtpController');

router.post('/send-mail-otp', sendMailOtp);
router.post('/verify-mail-otp', verifyMailOtp);
router.post('/auth/complete-regular', completeRegularRegistration);

module.exports = router;
