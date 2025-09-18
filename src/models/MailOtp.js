const mongoose = require('mongoose');

const MailOtp = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0 }
});

// Optionally, add TTL index for auto-expiry (10 min)
MailOtp.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model('MailOtp', MailOtp);
