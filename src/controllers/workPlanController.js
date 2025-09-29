const WorkPlan = require('../models/WorkPlan');

// Utility to push version history
function pushHistory(doc, action, userId, meta = {}) {
  doc.versionHistory.push({ action, user: userId, meta });
}

exports.listWorkPlans = async (req, res) => {
  try {
    const { status, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.title = { $regex: q, $options: 'i' };
    if (req.user && req.user.activeRole && req.user.activeRole.unit) {
      filter.unit = req.user.activeRole.unit; // scope to unit
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      WorkPlan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      WorkPlan.countDocuments(filter)
    ]);
    res.json({ ok: true, items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.createWorkPlan = async (req, res) => {
  try {
    const body = req.body || {};
    const doc = new WorkPlan({
      title: body.title || 'Untitled Work Plan',
      owner: req.user?._id,
      unit: req.user?.activeRole?.unit,
      startDate: body.startDate,
      endDate: body.endDate,
      generalGoal: body.generalGoal,
      plans: body.plans || [],
      status: body.status || 'draft',
      notes: body.notes,
    });
    pushHistory(doc, 'created', req.user?._id);
    doc.recalculateProgress();
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.updateWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    if (doc.status !== 'draft' && doc.status !== 'rejected') {
      return res.status(400).json({ ok: false, error: 'Only draft or rejected plans can be edited' });
    }
    const body = req.body || {};
    ['title','startDate','endDate','generalGoal','notes','plans'].forEach(f => {
      if (body[f] !== undefined) doc[f] = body[f];
    });
    doc.recalculateProgress();
    pushHistory(doc, 'updated', req.user?._id);
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.submitWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    if (doc.status !== 'draft' && doc.status !== 'rejected' && doc.status !== 'pending')  return res.status(400).json({ ok: false, error: 'Only draft/rejected can be submitted' });
    doc.status = 'pending';
    doc.submittedAt = new Date();
    doc.submittedBy = req.user?._id;
    pushHistory(doc, 'submitted', req.user?._id);
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.approveWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    doc.status = 'approved';
    doc.approvedAt = new Date();
    doc.approvedBy = req.user?._id;
    pushHistory(doc, 'approved', req.user?._id);
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.rejectWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    const { reason } = req.body || {};
    doc.status = 'rejected';
    doc.rejectionReason = reason || 'No reason provided';
    pushHistory(doc, 'rejected', req.user?._id, { reason });
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.updateActivityProgress = async (req, res) => {
  try {
    const { activityId, progressPercent, completionSummary, dateOfCompletion } = req.body || {};
    const doc = await WorkPlan.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    let found;
    doc.plans.forEach(plan => {
      plan.activities.forEach(act => {
        if (String(act._id) === String(activityId)) {
          if (progressPercent !== undefined) act.progressPercent = progressPercent;
          if (completionSummary !== undefined) act.completionSummary = completionSummary;
          if (dateOfCompletion) act.dateOfCompletion = dateOfCompletion;
          if (act.progressPercent >= 100) act.status = 'completed';
          else if (act.progressPercent > 0) act.status = 'in_progress';
          found = act;
        }
      });
    });
    if (!found) return res.status(404).json({ ok: false, error: 'Activity not found' });
    doc.recalculateProgress();
    pushHistory(doc, 'progress_update', req.user?._id, { activityId, progressPercent });
    await doc.save();
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

// Delete a work plan (only allowed in draft or rejected or pending?)
exports.deleteWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:'Not found' });
    // Basic rule: cannot delete once approved
    if(doc.status === 'approved') {
      return res.status(400).json({ ok:false, error:'Approved plans cannot be deleted' });
    }
    await doc.deleteOne();
    res.json({ ok:true, deleted:true });
  } catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
};
