const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  role: { type: String, enum: ['SuperAdmin','UnitLeader','Member'], required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  duties: { type: [String], default: [] }
});

const UserSchema = new mongoose.Schema({
  title: String,
  firstName: { type: String, required: true },
  middleName: String,
  surname: { type: String, required: true },
  phone: { type: String, required: true, unique: true }, // normalized to +234...
  email: { type: String, default: '' },
  passwordHash: { type: String },
  isVerified: { type: Boolean, default: false },
  roles: { type: [RoleSchema], default: [] },
  profile: {
    gender: String,
    dob: Date,
    address: String,
    occupation: String,
    employmentStatus: String,
    maritalStatus: String,
    education: String,
    avatar: String
  },
  approved: { type: Boolean, default: false }, // business approval separate from identity verification
  activeRole: { type: String, enum: ['SuperAdmin','UnitLeader','Member'], default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
