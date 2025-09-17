const mongoose = require('mongoose');


const Otp = new mongoose.Schema({
  otp:{type:String},
  phone:{type:String},
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Otp', Otp);