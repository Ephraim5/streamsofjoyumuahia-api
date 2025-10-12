const Event = require('../models/Event');

async function createEvent(req, res) {
  const { title, venue, description, date, eventType, reminder, tags, status, visibility } = req.body;
  const actor = req.user;
  const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
  const isMinAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
  let church = actor.church || null;
  let ministryName = null;
  let vis = (visibility==='ministry'||visibility==='church') ? visibility : (isMinAdmin ? 'ministry' : 'church');
  if (isMinAdmin) {
    const r = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
    ministryName = r?.ministryName || null;
  }
  const payload = {
    title,
    venue,
    description,
    date: date ? new Date(date) : null,
    eventType,
    reminder: !!reminder,
    tags: Array.isArray(tags) ? tags : undefined,
    status: status || 'Upcoming',
    createdBy: actor._id,
    church,
    ministryName: vis==='ministry' ? ministryName : null,
    visibility: vis
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
  const actor = req.user;
  const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
  const isMinAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
  const church = actor.church || null;
  let ministryName = null;
  if (isMinAdmin) {
    const r = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
    ministryName = r?.ministryName || null;
  }
  const $or = [];
  // Church-wide events for the same church
  if (church) $or.push({ visibility:'church', church });
  // Ministry-scoped events: SuperAdmin sees all ministries; MinistryAdmin and unit roles see their ministry only
  if (isSuper) {
    if (church) $or.push({ visibility:'ministry', church });
  } else if (ministryName && church) {
    $or.push({ visibility:'ministry', church, ministryName });
  }
  const query = $or.length ? { $or } : {};
  const events = await Event.find(query).sort({ date: -1 }).limit(200);
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
