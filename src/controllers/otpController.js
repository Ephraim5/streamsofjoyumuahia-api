const axios = require('axios');
const dotenv = require('dotenv');
const { normalizeNigeriaPhone } = require('../utils/phone');
const Otp = require('../models/Otp'); // Your Mongoose model

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// ----------------------
// Send OTP
// ----------------------
async function sendOtp(req, res) {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });

    const normalizedPhone = normalizeNigeriaPhone(phone, false);

    try {
        const options = {
            method: 'POST',
            url: 'https://sms-verify3.p.rapidapi.com/send-numeric-verify',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': 'sms-verify3.p.rapidapi.com',
                'Content-Type': 'application/json'
            },
            data: { target: normalizedPhone }
        };

        const response = await axios.request(options);

        // The API returns verify_code even if cost is 404
        const verifyCode = response.data.verify_code;

        if (!verifyCode) {
            return res.status(500).json({ success: false, message: 'Could not retrieve OTP from API.' });
        }

        // Save OTP in DB
        await Otp.create({
            phone: normalizedPhone,
            otp: verifyCode,
            createdAt: new Date()
        });

        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully. Please check your SMS.'
        });

    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        return res.status(500).json({ success: false, message: 'Could not send OTP.' });
    }
}

// ----------------------
// Verify OTP
// ----------------------
async function verifyOtp(req, res) {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });

    const normalizedPhone = normalizeNigeriaPhone(phone, false);

    // Get the latest OTP for this phone
    const otpRecord = await Otp.findOne({ phone: normalizedPhone }).sort({ createdAt: -1 });
    if (!otpRecord) return res.status(400).json({ success: false, message: 'No OTP found for this phone number.' });

    const now = new Date();
    const otpAgeMinutes = (now - otpRecord.createdAt) / 1000 / 60; // in minutes

    if (otpAgeMinutes > 10) {
        // OTP expired
        await Otp.deleteOne({ _id: otpRecord._id });
        return res.status(400).json({ success: false, message: 'OTP has expired.' });
    }

    if (otpRecord.otp !== otp) {
        return res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }

    // OTP verified successfully
    await Otp.deleteOne({ _id: otpRecord._id });

    return res.status(200).json({
        success: true,
        ok:true,
        message: 'OTP verified successfully.'
    });
}

module.exports = {
    sendOtp,
    verifyOtp
};
