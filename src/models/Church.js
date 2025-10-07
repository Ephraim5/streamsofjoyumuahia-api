const mongoose = require('mongoose');

const MinistrySubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  createdAt: { type: Date, default: Date.now }
},{ _id: true });

const ChurchSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  ministries: { type: [MinistrySubSchema], default: [] },
  // Future: address, geo, contact, etc.
  createdAt: { type: Date, default: Date.now }
});

ChurchSchema.index({ organization: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Church', ChurchSchema);
