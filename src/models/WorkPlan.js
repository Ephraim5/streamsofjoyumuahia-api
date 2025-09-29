const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  startDate: { type: Date },
  endDate: { type: Date },
  resources: { type: [String], default: [] },
  estimatedHours: { type: Number, default: 0 },
  progressPercent: { type: Number, default: 0, min: 0, max: 100 },
  status: { type: String, enum: ['not_started','in_progress','completed'], default: 'not_started' },
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
}, { timestamps: true });

// Helper to recalc progress
WorkPlanSchema.methods.recalculateProgress = function() {
  let total = 0; let weightSum = 0;
  this.plans.forEach(plan => {
    plan.activities.forEach(act => {
      const weight = act.estimatedHours || 1;
      total += (act.progressPercent || 0) * weight;
      weightSum += weight;
    });
  });
  this.progressPercent = weightSum ? Math.round(total / weightSum) : 0;
  return this.progressPercent;
};

module.exports = mongoose.model('WorkPlan', WorkPlanSchema);