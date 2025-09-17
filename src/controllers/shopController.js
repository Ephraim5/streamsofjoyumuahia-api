const ShopItem = require('../models/ShopItem');
const Sale = require('../models/Sale');
async function createItem(req, res) {
  const { title, description, price, stock } = req.body;
  const it = await ShopItem.create({ title, description, price, stock });
  res.json({ ok: true, item: it });
}
async function listItems(req, res) {
  const items = await ShopItem.find().sort({ createdAt: -1 });
  res.json({ items });
}
async function sellItem(req, res) {
  const { itemId, buyerName, quantity } = req.body;
  const it = await ShopItem.findById(itemId);
  if (!it) return res.status(404).json({ error: 'Item not found' });
  if (it.stock < quantity) return res.status(400).json({ error: 'Insufficient stock' });
  it.stock -= quantity;
  await it.save();
  const total = it.price * quantity;
  const sale = await Sale.create({ item: itemId, buyerName, quantity, total, soldBy: req.user._id });
  res.json({ ok: true, sale });
}
module.exports = { createItem, listItems, sellItem };
