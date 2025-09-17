const Message = require('../models/Message');
const User = require('../models/User');

// Send message: stores message and returns. Real-time delivered via socket.io if recipient online.
// Assumes socket.io server will be available globally via req.app.get('io') and onlineUsers map at req.app.get('onlineUsers')
async function sendMessage(req, res) {
  const { toUserId, text } = req.body;
  if (!toUserId || !text) return res.status(400).json({ error: 'toUserId and text required' });
  const from = req.user._id;
  const toUser = await User.findById(toUserId);
  if (!toUser) return res.status(404).json({ error: 'Recipient not found' });
  const msg = await Message.create({ from, to: toUserId, text });
  // real-time deliver
  const io = req.app.get('io');
  const onlineUsers = req.app.get('onlineUsers') || {};
  const recipientSocketId = onlineUsers[toUserId];
  if (recipientSocketId && io) {
    io.to(recipientSocketId).emit('message', { message: msg });
    msg.delivered = true;
    await msg.save();
  }
  res.json({ ok: true, message: msg });
}

async function fetchConversation(req, res) {
  const otherId = req.params.userId;
  const mine = req.user._id;
  const msgs = await Message.find({ $or: [{ from: mine, to: otherId }, { from: otherId, to: mine }] }).sort({ createdAt: 1 });
  res.json({ messages: msgs });
}

module.exports = { sendMessage, fetchConversation };
