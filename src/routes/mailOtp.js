const express = require('express');
const router = express.Router();
const { sendMailOtp, verifyMailOtp } = require('../controllers/mailOtpController');

router.post('/send-mail-otp', sendMailOtp);
router.post('/verify-mail-otp', verifyMailOtp);

module.exports = router;
