const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  role: { type: String, enum: ['SuperAdmin','MinistryAdmin','UnitLeader','Member'], required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  // For MinistryAdmin association (church + ministryName). UnitLeader/Member derive church via unit.
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', default: null },
  ministryName: { type: String, default: null },
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
  // Indicates whether the user has completed the full multi-step registration form
  registrationCompleted: { type: Boolean, default: false },
  roles: { type: [RoleSchema], default: [] },
  // Hierarchy references
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', default: null }, // primary church context
  churches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Church' }], // for multi superadmin management scope
  multi: { type: Boolean, default: false }, // SuperAdmin multi-church capability
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
  // Specific to superadmin self-registration: indicates a superadmin request awaiting approval
  superAdminPending: { type: Boolean, default: false },
  activeRole: { type: String, enum: ['SuperAdmin','MinistryAdmin','UnitLeader','Member'], default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
