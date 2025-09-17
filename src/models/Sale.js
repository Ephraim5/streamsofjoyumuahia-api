const mongoose = require('mongoose');
const SaleSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopItem' },
  buyerName: String,
  quantity: { type: Number, default: 1 },
  total: Number,
  soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Sale', SaleSchema);
