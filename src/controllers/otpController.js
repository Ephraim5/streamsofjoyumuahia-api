const axios = require('axios');
const dotenv = require('dotenv');
const { normalizeNigeriaPhone } = require('../utils/phone'); // Assuming you have a utility for phone number normalization

dotenv.config();

const TERMI_API_KEY = process.env.TERMI_API_KEY;
const TERMI_SENDER_ID = process.env.TERMI_SENDER_ID;
const TERMI_BASE_URL = 'https://api.ng.termii.com';

/**
 * Controller to send an OTP to a user's phone number.
 * This function should be called first.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
async function sendOtp(req, res) {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }
  
  const normalizedPhone = normalizeNigeriaPhone(phone,false);

  const payload = {
    api_key: TERMI_API_KEY,
    to: normalizedPhone,
    from: TERMI_SENDER_ID,
    channel: 'dnd', // Use 'dnd' for reliable delivery, bypassing DND restrictions.
    type: 'plain',
    message_type: 'numeric',
    pin_attempts: 3, // Number of verification attempts allowed
    pin_time_to_live: 10, // OTP validity in minutes
    pin_length: 6, // Length of the OTP
    message_text: `Your Streams Of Joy Mobile App OTP is <pin_code>. It expires in 10 minutes.`,
  };

  try {
    const response = await axios.post(`${TERMI_BASE_URL}/api/sms/otp/send`, payload);

    if (response.data.code === '1004') { // This code indicates a successful OTP send
      const pinId = response.data.pinId;
      // You should save the pinId in your session or user record in your DB
      // to retrieve it later for verification.
      return res.status(200).json({ 
        success: true, 
        message: 'OTP sent successfully.', 
        pinId: pinId 
      });
    } else {
      return res.status(400).json({ success: false, message: response.data.message });
    }
  } catch (error) {
    console.error('Termii send OTP error:', error.response ? error.response.data : error.message);
    return res.status(500).json({ success: false, message: 'Could not send OTP. Please try again.' });
  }
}

//---

/**
 * Controller to verify the OTP sent to the user.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
async function verifyOtp(req, res) {
  const { pinId, pin } = req.body;

  if (!pinId || !pin) {
    return res.status(400).json({ success: false, message: 'pinId and pin are required.' });
  }

  const payload = {
    api_key: TERMI_API_KEY,
    pin_id: pinId,
    pin: pin,
  };

  try {
    const response = await axios.post(`${TERMI_BASE_URL}/api/sms/otp/verify`, payload);

    if (response.data.verified) {
      // OTP is valid! Log the user in or proceed with the transaction.
      // Now you can generate your own JWT for the user session.
      return res.status(200).json({ 
        success: true, 
        message: 'OTP verified successfully.',
        // You would typically return a JWT token here
        // token: generateYourAppToken(userId),
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }
  } catch (error) {
    console.error('Termii verify OTP error:', error.response ? error.response.data : error.message);
    return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
};