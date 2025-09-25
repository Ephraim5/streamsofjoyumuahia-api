const Event = require('../models/Event');

async function createEvent(req, res) {
  const { title, venue, description, date, eventType, reminder, tags, status } = req.body;
  const payload = {
    title,
    venue,
    description,
    date: date ? new Date(date) : null,
    eventType,
    reminder: !!reminder,
    tags: Array.isArray(tags) ? tags : undefined,
    status: status || 'Upcoming',
    createdBy: req.user._id,
  };
  const e = await Event.create(payload);
  // Fire-and-forget push notification
  try {
    const { broadcastPush } = require('../utils/push');
    broadcastPush({
      title: 'New Event: ' + (title || 'Church Event'),
      body: `${date ? new Date(date).toLocaleString() + ' • ' : ''}${venue || ''}`.trim(),
      data: { type: 'event', id: e._id.toString() }
    }).catch(()=>{});
  } catch {}
  res.json({ ok: true, event: e });
}

async function listEvents(req, res) {
  const events = await Event.find().sort({ date: -1 }).limit(200);
  res.json({ ok: true, events });
}

async function updateEvent(req, res) {
  const { id } = req.params;
  const update = req.body || {};
  if (update.date) update.date = new Date(update.date);
  const e = await Event.findByIdAndUpdate(id, update, { new: true });
  if (!e) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, event: e });
}

async function deleteEvent(req, res) {
  const { id } = req.params;
  const e = await Event.findByIdAndDelete(id);
  if (!e) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true });
}

module.exports = { createEvent, listEvents, updateEvent, deleteEvent };
