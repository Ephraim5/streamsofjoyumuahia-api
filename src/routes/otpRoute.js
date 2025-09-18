const { sendOtp, verifyOtp } = require("../controllers/otpController");
const router = require("express").Router();

router.post("/send-otp",sendOtp);
router.post("/verify-otp",verifyOtp);

module.exports = router;
//check here for doc https://developers.termii.com/number and or https://developers.termii.com/messaging-api for more detail incase you need or just the route