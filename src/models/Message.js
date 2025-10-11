const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  name: { type: String, default: '' },
  type: { type: String, enum: ['image','file','other'], default: 'other' },
  size: { type: Number, default: 0 }
}, { _id:false });

const MessageSchema = new mongoose.Schema({
  // direct user-to-user
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // group (unit) message
  toUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  subject: { type: String, default: '' },
  text: { type: String, default: '' },
  attachments: { type: [AttachmentSchema], default: [] },
  delivered: { type: Boolean, default: false },
  // per-user read/archive/delete tracking
  readBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  archivedFor: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  deletedFor: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  createdAt: { type: Date, default: Date.now }
});

// An index to quickly query a user's conversations and unread counts
MessageSchema.index({ from: 1, to: 1, toUnit: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
