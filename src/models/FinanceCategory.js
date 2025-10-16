const mongoose = require('mongoose');

const FinanceCategorySchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  name: { type: String, required: true, trim: true },
  nameLower: { type: String, required: true, lowercase: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

FinanceCategorySchema.pre('validate', function(next){
  if (this.name) this.nameLower = String(this.name).toLowerCase().trim();
  next();
});

FinanceCategorySchema.index({ unit: 1, type: 1, nameLower: 1 }, { unique: true });

module.exports = mongoose.model('FinanceCategory', FinanceCategorySchema);
