const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  startDate: { type: Date },
  endDate: { type: Date },
  resources: { type: [String], default: [] },
  estimatedHours: { type: Number, default: 0 }, // legacy weight fallback
  weight: { type: Number, default: 0 }, // optional explicit weight portion within its plan (0 means auto distribute)
  progressPercent: { type: Number, default: 0, min: 0, max: 100 },
  status: { type: String, enum: ['not_started','in_progress','completed'], default: 'not_started' },
  // Review-specific fields for SuperAdmin activity-level feedback
  reviewStatus: { type: String, enum: ['pending','approved','rejected','n/a'], default: 'pending' },
  reviewRating: { type: Number, min: 1, max: 5 },
  reviewRejectionReason: { type: String },
  reviewComments: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    createdAt: { type: Date, default: Date.now }
  }],
  comments: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    createdAt: { type: Date, default: Date.now }
  }],
  attachments: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    url: String,
    name: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  completionSummary: { type: String, default: '' },
  dateOfCompletion: { type: Date },
  submittedAt: { type: Date },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
}, { _id: false });

const PlanSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  title: { type: String, required: true, trim: true },
  activities: { type: [ActivitySchema], default: [] },
  planWeight: { type: Number, default: 0 } // optional explicit weight for this plan relative to other plans (0 => auto distribute)
}, { _id: false });

const VersionHistorySchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  action: String, // created|updated|submitted|approved|rejected|progress_update
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at: { type: Date, default: Date.now },
  meta: { type: Object, default: {} }
}, { _id: false });

const WorkPlanSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  startDate: { type: Date },
  endDate: { type: Date },
  generalGoal: { type: String, default: '' },
  status: { type: String, enum: ['draft','pending','approved','rejected','ignored'], default: 'draft' },
  submittedAt: { type: Date },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  plans: { type: [PlanSchema], default: [] },
  notes: { type: String, default: '' },
  attachments: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    url: String,
    name: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  versionHistory: { type: [VersionHistorySchema], default: [] },
  progressPercent: { type: Number, default: 0 }, // aggregated cached value
  // SuperAdmin review metadata
  reviewRating: { type: Number, min:1, max:5 },
  reviewComments: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    createdAt: { type: Date, default: Date.now }
  }],
  // Final success evaluation (set by SuperAdmin) separate from reviewRating which is more qualitative
  successRate: { type: Number, min:0, max:100 }, // percentage success evaluation
  successCategory: { type: String, enum:['low','good','perfect'], default: undefined },
  successRatedAt: { type: Date },
  successRatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // General discussion/comments thread (distinct from version history)
  comments: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Helper to recalc progress using multi-level weights
// Algorithm:
// 1. Determine plan weights: if any plan has planWeight>0 use provided set; zero weights replaced by equal share of remaining.
//    If all 0, distribute equally.
// 2. For each plan compute its internal activity progress: use activity.weight if any >0 else fallback to estimatedHours else equal.
// 3. Overall progress = sum(planProgress * planWeightPercent).
// All percentages rounded to nearest integer for cached value.
WorkPlanSchema.methods.recalculateProgress = function() {
  if(!this.plans || !this.plans.length){ this.progressPercent = 0; return 0; }
  const plans = this.plans;
  // Plan weights preparation
  const anyPlanWeights = plans.some(p => (p.planWeight||0) > 0);
  let planWeights = plans.map(p => (anyPlanWeights ? (p.planWeight||0) : 0));
  if(!anyPlanWeights){ // equal distribution
    planWeights = plans.map(()=>1);
  } else {
    // Replace zeros (if some plans weighted) with average of non-zero or 1
    const nonZero = planWeights.filter(w=>w>0);
    const filler = nonZero.length ? (nonZero.reduce((a,b)=>a+b,0) / nonZero.length) : 1;
    planWeights = planWeights.map(w=> w>0? w : filler);
  }
  const planTotalWeight = planWeights.reduce((a,b)=>a+b,0) || 1;

  let overall = 0;
  plans.forEach((plan, idx)=>{
    const acts = plan.activities || [];
    if(!acts.length) return; // skip empty plan weight effectively wasted
    const anyActWeights = acts.some(a => (a.weight||0) > 0);
    let actWeights = acts.map(a => anyActWeights ? (a.weight||0) : 0);
    if(!anyActWeights){
      // fallback to estimatedHours if present
      const anyHours = acts.some(a => (a.estimatedHours||0) > 0);
      if(anyHours){ actWeights = acts.map(a => a.estimatedHours||0); }
      else { actWeights = acts.map(()=>1); }
    } else {
      // Replace zeros with average of non-zero or 1
      const nz = actWeights.filter(w=>w>0);
      const filler = nz.length ? (nz.reduce((a,b)=>a+b,0)/nz.length) : 1;
      actWeights = actWeights.map(w=> w>0? w : filler);
    }
    const actTotalWeight = actWeights.reduce((a,b)=>a+b,0) || 1;
    let planProgress = 0;
    acts.forEach((a,aIdx)=>{
      const w = actWeights[aIdx];
      planProgress += (a.progressPercent||0) * w;
    });
    planProgress = planProgress / actTotalWeight; // 0..100
    const planWeightPercent = planWeights[idx] / planTotalWeight;
    overall += planProgress * planWeightPercent;
  });
  this.progressPercent = Math.round(overall);
  return this.progressPercent;
};

module.exports = mongoose.model('WorkPlan', WorkPlanSchema);