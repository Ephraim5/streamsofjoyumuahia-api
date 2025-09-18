const mongoose = require('mongoose');

// Stores the latest OTP session information for a phone number.
// For Termii, we store pinId returned from the send endpoint.
const Otp = new mongoose.Schema({
  // Historical: raw OTP (no longer used with Termii; kept for compatibility)
  otp: { type: String },
  // MSISDN normalized (e.g., 2348012345678)
  phone: { type: String, index: true },
  // Termii pin id used for verification
  pinId: { type: String },
  // Optional attempt counter
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Otp', Otp);