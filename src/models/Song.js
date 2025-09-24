const mongoose = require('mongoose');

const SongSchema = new mongoose.Schema({
  title: { type: String, required: true },
  composer: { type: String },
  vocalLeads: { type: String },
  link: { type: String },
  description: { type: String },
  releaseDate: { type: Date },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Song', SongSchema);
