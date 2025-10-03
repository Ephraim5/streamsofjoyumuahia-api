const WorkPlan = require('../models/WorkPlan');
const Unit = require('../models/Unit');

// Utility to push version history
function pushHistory(doc, action, userId, meta = {}) {
  doc.versionHistory.push({ action, user: userId, meta });
}

// Conditional auto transition helper (only run when explicitly requested e.g. completed filter)
async function applyAutoStatus(doc, userId, options = {}){
  const { allowCompletion = false } = options;
  if(!doc) return doc;
  // Only evaluate outdated pending rejection and ignored rules if explicitly allowed (still lightweight)
  // Keep minimal logic; heavy iteration removed from general fetch to avoid thread pressure
  if(allowCompletion){
    if(doc.status !== 'completed' && (doc.successRate !== undefined)){
      // New rule: any successRate 0-100 finalizes the plan (not just 100)
      doc.status = 'completed';
      pushHistory(doc,'auto_completed', userId, { reason:'success rated' });
      await doc.save();
    } else if(doc.status !== 'completed' && doc.progressPercent >= 100){
      doc.status = 'completed';
      pushHistory(doc,'auto_completed', userId, { reason:'progress 100' });
      await doc.save();
    }
  }
  return doc;
}

// Derive the active unit id for a user (mainly for UnitLeader). Priority order:
// 1. Explicit header x-active-unit (validated it belongs to a role)
// 2. First role whose role matches user.activeRole and has a unit
// 3. First UnitLeader role with a unit
function deriveActiveUnitId(user, req){
  if(!user) return null;
  // Header driven (allows client to disambiguate if multiple units)
  const headerUnit = (req.headers['x-active-unit'] || req.headers['x-unit-id'] || '').toString().trim();
  if(headerUnit && (user.roles||[]).some(r => String(r.unit) === headerUnit)) return headerUnit;
  const roles = user.roles || [];
  // Match by activeRole string (note: activeRole in schema is a string, not embedded doc)
  if(user.activeRole){
    const match = roles.find(r => r.role === user.activeRole && r.unit);
    if(match) return String(match.unit);
  }
  // Fallback: first UnitLeader role with unit
  const firstLeader = roles.find(r => r.role === 'UnitLeader' && r.unit);
  if(firstLeader) return String(firstLeader.unit);
  return null;
}

exports.listWorkPlans = async (req, res) => {
  try {
    const { status, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.title = { $regex: q, $options: 'i' };
    // Only scope by unit for non-SuperAdmin roles. Include legacy docs (missing unit) owned by the current user
    // so Unit Leaders still see their historical plans created before unit field was added.
    if (req.user && req.user.activeRole !== 'SuperAdmin') {
      const unitId = deriveActiveUnitId(req.user, req);
      if (unitId) {
        // Instead of strict filter.unit = unitId, widen scope with $or.
        // Top-level status/q filters (already on filter) will AND with this $or.
        filter.$or = [
          { unit: unitId },
            // legacy: no unit stored but owned by current user
          { unit: { $exists: false }, owner: req.user._id }
        ];
      }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      WorkPlan.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('unit','name')
        .populate('owner','firstName surname roles activeRole'),
      WorkPlan.countDocuments(filter)
    ]);
    // Backfill unit for legacy plans missing unit field (only if user is SuperAdmin so we can show originating unit)
    const missing = items.filter(it => !it.unit && it.owner && Array.isArray(it.owner.roles));
    if(missing.length){
      const neededIds = new Set();
      missing.forEach(doc => {
        const roles = (doc.owner.roles||[]);
        // Try role matching stored activeRole at creation (could be UnitLeader) else first UnitLeader
        let target = roles.find(r => r.role === doc.owner.activeRole && r.unit) || roles.find(r => r.role === 'UnitLeader' && r.unit);
        if(target && target.unit){ neededIds.add(String(target.unit)); (doc.__derivedUnitId = String(target.unit)); }
      });
      if(neededIds.size){
        const units = await Unit.find({ _id: { $in: Array.from(neededIds) } }).select('name');
        const unitMap = units.reduce((a,u)=>{ a[String(u._id)] = u; return a; }, {});
        missing.forEach(doc => {
          if(doc.__derivedUnitId && unitMap[doc.__derivedUnitId]){
            // Attach a virtual-like field so JSON includes it
            doc.unit = unitMap[doc.__derivedUnitId];
          }
        });
      }
    }
    // Only apply auto status completion if requesting completed list (ensures stale items promoted once user explicitly asks)
    if(filter.status === 'completed'){
      await Promise.all(items.map(d => applyAutoStatus(d, req.user?._id, { allowCompletion:true })));
    }
    res.json({ ok: true, items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getWorkPlan = async (req, res) => {
  try {
    const doc = await WorkPlan.findById(req.params.id)
      .populate('reviewComments.user','firstName surname')
      .populate('plans.activities.reviewComments.user','firstName surname')
      .populate('plans.activities.progressUpdates.user','firstName surname');
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    // Do not auto-complete on normal detail fetch unless client explicitly queries completed list elsewhere
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.createWorkPlan = async (req, res) => {
  try {
    const body = req.body || {};
    // Determine unit to attach
    let unitId = body.unit; // allow explicit override if provided & authorized
    if(!unitId){
      unitId = deriveActiveUnitId(req.user, req);
    }
    const doc = new WorkPlan({
      title: body.title || 'Untitled Work Plan',
      owner: req.user?._id,
      unit: unitId || undefined,
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
    // Accept multiple possible keys for the textual note
    let { message, progressMessage, note, comment } = req.body || {};
    const normalizedMessage = typeof message === 'string' && message.trim() ? message.trim()
      : (typeof progressMessage === 'string' && progressMessage.trim() ? progressMessage.trim()
        : (typeof note === 'string' && note.trim() ? note.trim()
          : (typeof comment === 'string' && comment.trim() ? comment.trim() : '')));
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
          if (normalizedMessage || progressPercent !== undefined) {
            act.progressUpdates = act.progressUpdates || [];
            act.progressUpdates.push({
              user: req.user?._id,
              progressPercent,
              message: normalizedMessage || undefined
            });
          }
          found = act;
        }
      });
    });
    if (!found) return res.status(404).json({ ok: false, error: 'Activity not found' });
    doc.recalculateProgress();
    pushHistory(doc, 'progress_update', req.user?._id, { activityId, progressPercent });
    await doc.save();
    // Return only the updated activity timeline along with aggregate to minimize payload? For now send whole doc
    res.json({ ok: true, item: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

// Set final success rate (SuperAdmin) with category auto-derivation if not provided
exports.setSuccessRate = async (req,res)=>{
  try {
    ensureSuperAdmin(req.user);
    const { rate, category, feedback } = req.body || {};
    if(rate === undefined) return res.status(400).json({ ok:false, error:'rate required' });
    if(rate < 0 || rate > 100) return res.status(400).json({ ok:false, error:'rate must be 0-100' });
    const doc = await WorkPlan.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:'Not found' });
    let cat = category;
    if(!cat){
      if(rate < 40) cat = 'low';
      else if(rate < 85) cat = 'good';
      else cat = 'perfect';
    }
    doc.successRate = rate;
    doc.successCategory = cat;
    doc.successRatedAt = new Date();
    doc.successRatedBy = req.user?._id;
    if(typeof feedback === 'string' && feedback.trim()){
      doc.successFeedback = feedback.trim();
    }
    // Immediate status finalization on rating (any value 0-100 is considered final now)
    if(doc.status !== 'completed'){
      doc.status = 'completed';
      pushHistory(doc,'auto_completed', req.user?._id, { reason:'success rated' });
    }
    pushHistory(doc,'success_rated', req.user?._id, { rate, category: cat, hasFeedback: !!(feedback && feedback.trim()) });
    await doc.save();
    res.json({ ok:true, item: doc });
  } catch(e){
    res.status(400).json({ ok:false, error:e.message });
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
