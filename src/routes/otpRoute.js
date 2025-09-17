const { sendOtp, verifyOtp } = require("../controllers/otpController");
const router = require("express").Router();

router.post("/send-otp",sendOtp);
router.post("/verify-otp",verifyOtp);

module.exports = router;
