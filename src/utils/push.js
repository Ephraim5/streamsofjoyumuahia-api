const axios = require('axios');
const DeviceToken = require('../models/DeviceToken');

async function registerDeviceToken(userId, token, platform){
  if(!token) return null;
  const found = await DeviceToken.findOne({ token });
  if(found){
    if(userId && !found.user) { found.user = userId; await found.save(); }
    return found;
  }
  return await DeviceToken.create({ user: userId || undefined, token, platform });
}

async function broadcastPush({ title, body, data, icon }){
  const tokens = await DeviceToken.find({}, { token: 1, _id: 0 });
  if(!tokens.length) return { ok: true, sent: 0 };
  const messages = tokens.map(t => ({
    to: t.token,
    sound: 'default',
    title,
    body,
    data: data || {},
  }));
  try {
    // Chunking can be added; for simplicity send in one batch
    const res = await axios.post('https://exp.host/--/api/v2/push/send', messages, { headers: { 'Content-Type': 'application/json' } });
    return { ok: true, result: res.data };
  } catch (e) {
    return { ok: false, error: e?.message };
  }
}

module.exports = { registerDeviceToken, broadcastPush };
