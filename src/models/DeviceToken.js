const mongoose = require('mongoose');

const DeviceTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  token: { type: String, unique: true, index: true },
  platform: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DeviceToken', DeviceTokenSchema);
