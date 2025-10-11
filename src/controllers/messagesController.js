const Message = require('../models/Message');
const User = require('../models/User');
const Unit = require('../models/Unit');

// POST /api/messages  { toUserId?, toUnitId?, subject?, text?, attachments? }
async function sendMessage(req, res) {
  try {
    const { toUserId, toUnitId, subject='', text='', attachments=[] } = req.body || {};
    if (!toUserId && !toUnitId) return res.status(400).json({ ok:false, message: 'toUserId or toUnitId required' });
    if (!text && (!attachments || attachments.length===0)) return res.status(400).json({ ok:false, message:'text or attachments required' });
    const from = req.user._id;

    let payload = { from, subject: String(subject||''), text: String(text||''), attachments: Array.isArray(attachments)? attachments: [] };
    let recipients = [];

    if (toUserId) {
      const toUser = await User.findById(toUserId);
      if (!toUser) return res.status(404).json({ ok:false, message:'Recipient not found' });
      payload.to = toUserId;
      recipients = [ String(toUserId) ];
    }
    if (toUnitId) {
      const unit = await Unit.findById(toUnitId).select('leaders members');
      if (!unit) return res.status(404).json({ ok:false, message:'Unit not found' });
      payload.toUnit = unit._id;
      recipients = [ ...new Set([ ...unit.leaders.map(x=>String(x)), ...unit.members.map(x=>String(x)) ]) ];
    }

    const msg = await Message.create(payload);

    // Deliver in realtime to all recipients connected
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers') || {};
    if (io && recipients.length) {
      for (const rid of recipients) {
        const sid = onlineUsers[rid];
        if (sid) io.to(sid).emit('message', { message: msg });
      }
      if (recipients.some(rid => onlineUsers[rid])) {
        msg.delivered = true; await msg.save();
      }
    }
    return res.json({ ok:true, message: msg });
  } catch (e) {
    return res.status(500).json({ ok:false, message:'Failed to send message', error:e.message });
  }
}

// GET /api/messages/conversations  -> list latest per conversation (user or unit), with unread counts
async function listConversations(req, res){
  try {
    const me = String(req.user._id);
    const churchId = req.user.church ? String(req.user.church) : null;
    // Fetch recent messages involving the user (direct) or their units (group)
    // For group visibility we include any message to a unit the user belongs to; SuperAdmin and MinistryAdmin can see within church scope
    const myRoleUnits = (req.user.roles||[]).filter(r=>['UnitLeader','Member'].includes(r.role) && r.unit).map(r=>String(r.unit));
    const isSuper = (req.user.roles||[]).some(r=>r.role==='SuperAdmin') || req.user.activeRole==='SuperAdmin';
    const isMinAdmin = (req.user.roles||[]).some(r=>r.role==='MinistryAdmin') || req.user.activeRole==='MinistryAdmin';

    let unitFilter = { _id: { $in: myRoleUnits } };
    if ((isSuper || isMinAdmin) && churchId) {
      // Include all units within the same church for admins
      const Unit = require('../models/Unit');
      const churchUnits = await Unit.find({ church: churchId }).select('_id');
      unitFilter = { _id: { $in: churchUnits.map(u=>String(u._id)) } };
    }
    const units = await Unit.find(unitFilter).select('_id name').lean();
    const unitIds = units.map(u=>String(u._id));

    const msgs = await Message.find({
      $or: [
        { to: me },
        { from: me },
        { toUnit: { $in: unitIds } }
      ],
      deletedFor: { $ne: req.user._id }
    })
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('from', 'firstName middleName surname profile.avatar')
    .populate('to', 'firstName middleName surname profile.avatar')
    .populate('toUnit', 'name')
    .lean();

    // Collate to conversations: key by userId or unitId
    const map = new Map();
    for(const m of msgs){
      const key = m.toUnit ? `unit:${m.toUnit._id}` : `user:${m.from && String(m.from._id)!==me ? m.from._id : m.to}`;
      const entry = map.get(key) || { latest: null, unread: 0, peer: null, isUnit: !!m.toUnit };
      if(!entry.latest) entry.latest = m; // first one since sorted desc
      // unread: messages not sent by me and not in readBy
      if (String(m.from._id) !== me && !(m.readBy||[]).map(String).includes(me)) entry.unread += 1;
      // peer data
      entry.peer = m.toUnit ? { _id: m.toUnit._id, name: m.toUnit.name } : (String(m.from._id)!==me ? m.from : m.to);
      map.set(key, entry);
    }
    const conversations = Array.from(map.entries()).map(([id, v])=> ({ id, latest: v.latest, unread: v.unread, peer: v.peer, isUnit: v.isUnit }));
    return res.json({ ok:true, conversations });
  } catch(e){
    console.error('listConversations error', e);
    return res.status(500).json({ ok:false, message:'Failed to load conversations', error:e.message });
  }
}

// GET /api/messages/conversation/user/:userId
// GET /api/messages/conversation/unit/:unitId
async function fetchConversation(req, res){
  try {
    const me = String(req.user._id);
    const { scope, id } = req.params; // scope 'user' or 'unit'
    let filter = {};
    if (scope === 'user') {
      filter = { $or: [ { from: me, to: id }, { from: id, to: me } ] };
    } else if (scope === 'unit') {
      // visibility: if user is member/leader of unit OR is admin in same church
      const unit = await Unit.findById(id).select('church leaders members');
      if(!unit) return res.status(404).json({ ok:false, message:'Unit not found' });
      const inUnit = [...unit.leaders.map(String), ...unit.members.map(String)].includes(me);
      const sameChurch = req.user.church && String(req.user.church)===String(unit.church);
      const isAdmin = (req.user.roles||[]).some(r=>['SuperAdmin','MinistryAdmin'].includes(r.role)) || ['SuperAdmin','MinistryAdmin'].includes(req.user.activeRole);
      if(!inUnit && !(isAdmin && sameChurch)) return res.status(403).json({ ok:false, message:'Forbidden' });
      filter = { toUnit: id };
    } else {
      return res.status(400).json({ ok:false, message:'Invalid scope' });
    }
    const msgs = await Message.find({ ...filter, deletedFor: { $ne: req.user._id } })
      .sort({ createdAt: 1 })
      .populate('from', 'firstName middleName surname profile.avatar')
      .populate('to', 'firstName middleName surname profile.avatar')
      .lean();
    return res.json({ ok:true, messages: msgs });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to load conversation', error:e.message });
  }
}

// POST /api/messages/mark-read { scope:'user'|'unit', id }
async function markRead(req,res){
  try {
    const me = req.user._id;
    const { scope, id } = req.body || {};
    let filter = {};
    if(scope==='user') filter = { to: me, from: id };
    else if(scope==='unit') filter = { toUnit: id };
    else return res.status(400).json({ ok:false, message:'Invalid scope' });
    await Message.updateMany(filter, { $addToSet: { readBy: me } });
    return res.json({ ok:true });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to mark read', error:e.message });
  }
}

// DELETE /api/messages/conversation  { scope:'user'|'unit', id }
async function deleteConversation(req,res){
  try {
    const me = req.user._id;
    const { scope, id } = req.body || {};
    if(!scope || !id) return res.status(400).json({ ok:false, message:'scope and id required' });
    let filter = {};
    if(scope==='user') filter = { $or: [ { from: me, to: id }, { from: id, to: me } ] };
    else if(scope==='unit') filter = { toUnit: id };
    else return res.status(400).json({ ok:false, message:'Invalid scope' });
    await Message.updateMany(filter, { $addToSet: { deletedFor: me } });
    return res.json({ ok:true });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to delete conversation', error:e.message });
  }
}

module.exports = { sendMessage, listConversations, fetchConversation, markRead, deleteConversation };
