const Event = require('../models/Event');

async function createEvent(req, res) {
  const { title, venue, description, date, eventType, reminder } = req.body;
  const e = await Event.create({ title, venue, description, date: date ? new Date(date) : null, eventType, reminder, createdBy: req.user._id });
  res.json({ ok: true, event: e });
}

async function listEvents(req, res) {
  const events = await Event.find().sort({ date: -1 }).limit(200);
  res.json({ events });
}

module.exports = { createEvent, listEvents };
