const mongoose = require('mongoose');

// type: 'terms' | 'privacy'
const LegalPageSchema = new mongoose.Schema({
  type: { type: String, required: true, unique: true, enum: ['terms','privacy'] },
  title: { type: String, required: true },
  sections: [{ heading: String, body: String }],
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LegalPage', LegalPageSchema);
