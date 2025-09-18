const axios = require('axios');
const dotenv = require('dotenv');
const { normalizeNigeriaPhone } = require('../utils/phone');
const Otp = require('../models/Otp');

dotenv.config();

const TERMI_API_KEY = process.env.TERMI_API_KEY;
const TERMI_SENDER_ID = (process.env.TERMI_SENDER_ID || '').replace(/"/g, '');
const OTP_EXPIRES_MIN = parseInt(process.env.OTP_EXPIRES_MIN || '10', 10);

// Helpers
function asIntl(msisdn) {
    // Termii expects numbers with country code; our normalize returns 234***********
    // Some Termii examples include a leading +, but API accepts numeric string.
    return normalizeNigeriaPhone(msisdn, false);
}

// ----------------------
// Send OTP via Termii
// ----------------------
async function sendOtp(req, res) {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });
        if (!TERMI_API_KEY) return res.status(500).json({ success: false, message: 'Termii API key not configured.' });

        const to = asIntl(phone);
        if (!to) return res.status(400).json({ success: false, message: 'Invalid phone number.' });

        // Termii OTP generate endpoint
        // Reference: POST https://api.ng.termii.com/api/sms/otp/generate
        // Body:
        //   { api_key, pin_type: 'numeric', phone_number, pin_attempts, pin_time_to_live, pin_length, channel, message_text, from }
        const payload = {
            api_key: TERMI_API_KEY,
            pin_type: 'numeric',
            phone_number: to,
            pin_attempts: 3,
            pin_time_to_live: OTP_EXPIRES_MIN, // minutes
            pin_length: 6,
            channel: 'generic', // or 'dnd', 'whatsapp' if enabled
            message_text: 'Use {{pin}} to verify your Streams Of Joy Mobile. Expires in {{ttl}} minutes.',
            from: TERMI_SENDER_ID || 'SOJ Mobile'
        };

        const { data } = await axios.post('https://api.ng.termii.com/api/sms/otp/generate', payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Expected success: { status: 'success', pinId: '...', to: '2348...', smsStatus: 'sent' }
        if (!data || !data.pinId) {
            return res.status(502).json({ success: false, message: 'Failed to send OTP via Termii', details: data });
        }

        // Upsert latest session for phone
        await Otp.findOneAndUpdate(
            { phone: to },
            { phone: to, pinId: data.pinId, otp: null, attempts: 0, createdAt: new Date() },
            { upsert: true }
        );

        return res.status(200).json({ success: true, ok: true, message: 'OTP sent successfully.', pinId: data.pinId });
    } catch (error) {
        const details = error.response?.data || error.message;
        console.error('Termii sendOtp error:', details);
        return res.status(500).json({ success: false, message: 'Could not send OTP.', details });
    }
}

// ----------------------
// Verify OTP via Termii
// ----------------------
async function verifyOtp(req, res) {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
        if (!TERMI_API_KEY) return res.status(500).json({ success: false, message: 'Termii API key not configured.' });

        const to = asIntl(phone);
        if (!to) return res.status(400).json({ success: false, message: 'Invalid phone number.' });

        // Fetch the latest pinId for this phone
        const otpRecord = await Otp.findOne({ phone: to }).sort({ createdAt: -1 });
        if (!otpRecord || !otpRecord.pinId) {
            return res.status(400).json({ success: false, message: 'No OTP session found for this phone. Please request a new code.' });
        }

        // Enforce TTL locally as well
        const ageMin = (Date.now() - new Date(otpRecord.createdAt).getTime()) / 60000;
        if (ageMin > OTP_EXPIRES_MIN) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new code.' });
        }

        // Verify with Termii
        // Reference: POST https://api.ng.termii.com/api/sms/otp/verify
        // Body: { api_key, pin_id, pin }
        const payload = {
            api_key: TERMI_API_KEY,
            pin_id: otpRecord.pinId,
            pin: otp
        };

        const { data } = await axios.post('https://api.ng.termii.com/api/sms/otp/verify', payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Expected success: { verified: true, ... } or { status: 'success', ... }
        const verified = data?.verified === true || data?.status === 'success';
        if (!verified) {
            // Increment attempts
            await Otp.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
            return res.status(400).json({ success: false, message: 'Invalid OTP.', details: data });
        }

        // Success: cleanup record
        await Otp.deleteOne({ _id: otpRecord._id });

        return res.status(200).json({ success: true, ok: true, message: 'OTP verified successfully.' });
    } catch (error) {
        const details = error.response?.data || error.message;
        console.error('Termii verifyOtp error:', details);
        return res.status(500).json({ success: false, message: 'Could not verify OTP.', details });
    }
}

module.exports = { sendOtp, verifyOtp };
