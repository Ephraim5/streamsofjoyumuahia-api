const WorkPlan = require('../models/WorkPlan');

// Utility to push version history
function pushHistory(doc, action, userId, meta = {}) {
  doc.versionHistory.push({ action, user: userId, meta });
}

// Auto transition helper
async function applyAutoStatus(doc, userId){
  if(!doc || !doc.endDate) return doc;
  const now = new Date();
  if(doc.endDate < now){
    if(doc.status === 'pending'){
      if(doc.status !== 'ignored'){
        doc.status = 'ignored';
        pushHistory(doc,'auto_ignored', userId);
        await doc.save();
      }
    } else if(!['approved','rejected','ignored'].includes(doc.status)){
      doc.status = 'rejected';
      if(!doc.rejectionReason) doc.rejectionReason = 'Automatically rejected after end date without approval';
      pushHistory(doc,'auto_rejected', userId, { reason:'endDate passed' });
      await doc.save();
    }
  }
  return doc;
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
      WorkPlan.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('unit','name')
        .populate('owner','firstName surname'),
      WorkPlan.countDocuments(filter)
    ]);
    await Promise.all(items.map(d => applyAutoStatus(d, req.user?._id)));
    res.json({ ok: true, items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id)
      .populate('reviewComments.user','firstName surname')
      .populate('plans.activities.reviewComments.user','firstName surname');
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    await applyAutoStatus(doc, req.user?._id);
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
    if (doc.status !== 'draft' && doc.status !== 'rejected' && doc.status !== 'pending' && doc.status !== 'ignored') {
      return res.status(400).json({ ok: false, error: 'Only draft, pending, rejected or ignored plans can be edited' });
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

// ---- SuperAdmin Review Extensions ----
function ensureSuperAdmin(user){
  const role = user?.activeRole || user?.activeRole?.role;
  if(role !== 'SuperAdmin') throw new Error('SuperAdmin privilege required');
}

// Approve with optional rating & comment
exports.reviewApproveWorkPlan = async (req,res)=>{
  try {
    ensureSuperAdmin(req.user);
    const { rating, comment } = req.body || {};
    const doc = await WorkPlan.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:'Not found' });
    doc.status = 'approved';
    doc.approvedAt = new Date();
    doc.approvedBy = req.user?._id;
    if(rating){ doc.reviewRating = rating; }
    if(comment){
      doc.reviewComments.push({ user: req.user?._id, message: comment });
    }
    pushHistory(doc,'approved', req.user?._id, { rating });
    await doc.save();
    res.json({ ok:true, item: doc });
  } catch(e){
    res.status(400).json({ ok:false, error:e.message });
  }
};

// Reject with reason & optional comment
exports.reviewRejectWorkPlan = async (req,res)=>{
  try {
    ensureSuperAdmin(req.user);
    const { reason, comment, rating } = req.body || {};
    const doc = await WorkPlan.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:'Not found' });
    doc.status = 'rejected';
    doc.rejectionReason = reason || 'No reason provided';
    if(rating){ doc.reviewRating = rating; }
    if(comment){ doc.reviewComments.push({ user: req.user?._id, message: comment }); }
    pushHistory(doc,'rejected', req.user?._id, { reason, rating });
    await doc.save();
    res.json({ ok:true, item: doc });
  } catch(e){
    res.status(400).json({ ok:false, error:e.message });
  }
};

// Add a general review comment (thread) without changing status
exports.addWorkPlanComment = async (req,res)=>{
  try {
    ensureSuperAdmin(req.user);
    const { message } = req.body || {};
    if(!message) return res.status(400).json({ ok:false, error:'message required' });
    const doc = await WorkPlan.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:'Not found' });
    doc.reviewComments.push({ user: req.user?._id, message });
    pushHistory(doc,'comment_added', req.user?._id);
    await doc.save();
    res.json({ ok:true, item: doc });
  } catch(e){
    res.status(400).json({ ok:false, error:e.message });
  }
};

// Approve or reject an activity with rating/comment
exports.reviewActivity = async (req,res)=>{
  try {
    ensureSuperAdmin(req.user);
    const { activityId, decision, rating, comment, reason } = req.body || {};
    if(!activityId) return res.status(400).json({ ok:false, error:'activityId required' });
    const doc = await WorkPlan.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:'Not found' });
    let target;
    doc.plans.forEach(pl=> pl.activities.forEach(a=>{ if(String(a._id)===String(activityId)) target = a; }));
    if(!target) return res.status(404).json({ ok:false, error:'Activity not found' });
    if(decision==='approve') {
      target.reviewStatus = 'approved';
      if(rating) target.reviewRating = rating;
    } else if(decision==='reject') {
      target.reviewStatus = 'rejected';
      target.reviewRejectionReason = reason || 'No reason provided';
      if(rating) target.reviewRating = rating;
    }
    if(comment){
      target.reviewComments.push({ user: req.user?._id, message: comment });
    }
    pushHistory(doc,'activity_review', req.user?._id, { activityId, decision, rating });
    await doc.save();
    res.json({ ok:true, item: doc });
  } catch(e){
    res.status(400).json({ ok:false, error:e.message });
  }
};

// Add a comment to an activity review thread
exports.addActivityComment = async (req,res)=>{
  try {
    ensureSuperAdmin(req.user);
    const { activityId, message } = req.body || {};
    if(!activityId) return res.status(400).json({ ok:false, error:'activityId required' });
    if(!message) return res.status(400).json({ ok:false, error:'message required' });
    const doc = await WorkPlan.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:'Not found' });
    let target;
    doc.plans.forEach(pl=> pl.activities.forEach(a=>{ if(String(a._id)===String(activityId)) target = a; }));
    if(!target) return res.status(404).json({ ok:false, error:'Activity not found' });
    target.reviewComments.push({ user: req.user?._id, message });
    pushHistory(doc,'activity_comment', req.user?._id, { activityId });
    await doc.save();
    res.json({ ok:true, item: doc });
  } catch(e){
    res.status(400).json({ ok:false, error:e.message });
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
