const Finance = require('../models/Finance');
const Unit = require('../models/Unit');

function hasDuty(user, unitId, dutyName) {
  const duties = [];
  for (const r of (user.roles || [])) {
    if ((r.role === 'Member' || r.role === 'UnitLeader') && String(r.unit) === String(unitId)) {
      for (const d of (r.duties || [])) duties.push(String(d));
    }
  }
  return duties.map(d => d.toLowerCase()).includes(String(dutyName).toLowerCase());
}
function isLeaderOfUnit(user, unitId) {
  return (user.roles || []).some(r => r.role === 'UnitLeader' && String(r.unit) === String(unitId));
}
function isMemberOfUnit(user, unitId) {
  return (user.roles || []).some(r => r.role === 'Member' && String(r.unit) === String(unitId));
}

// POST /api/finance { type, amount, source?, description?, date?, unitId }
async function recordFinance(req, res) {
  try {
    const { type, amount, source, description, date, unitId, churchId, ministryName } = req.body || {};
    if (!['income','expense'].includes(type)) return res.status(400).json({ ok:false, message: 'type must be income or expense' });
    if (!(amount > 0)) return res.status(400).json({ ok:false, message: 'amount must be > 0' });
    if (!unitId) return res.status(400).json({ ok:false, message: 'unitId required' });
    // Permissions: only Members with FinancialSecretary in this unit can create
    const actor = req.user;
    const canCreate = hasDuty(actor, unitId, 'FinancialSecretary');
    if (!canCreate) return res.status(403).json({ ok:false, message: 'Only Financial Secretary can record finance' });

    // derive context
    let ctx = { unit: unitId, church: null, ministryName: null };
    if (churchId) ctx.church = churchId; else ctx.church = actor.church || null;
    if (ministryName) ctx.ministryName = ministryName; else {
      const minRole = (actor.roles||[]).find(r=>r.role==='MinistryAdmin');
      if (minRole) ctx.ministryName = minRole.ministryName || null;
    }
    const f = await Finance.create({ type, amount, source, description, date: date||new Date(), recordedBy: actor._id, ...ctx });
    res.json({ ok: true, finance: f });
  } catch(e) {
    res.status(500).json({ ok:false, message:'Failed to record finance', error: e.message });
  }
}

// GET /api/finance?unitId=..&type=income|expense&from=iso&to=iso
async function listFinance(req, res) {
  try {
    const { unitId, type, from, to } = req.query || {};
    const q = {};
    if (unitId) q.unit = unitId;
    if (type && ['income','expense'].includes(String(type))) q.type = type;
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = new Date(from);
      if (to) q.date.$lte = new Date(to);
    }
    // Permissions: allow viewing if actor belongs to the unit as leader or member (or super/min admin)
    const actor = req.user;
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const isMinAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
    if (unitId && !isSuper && !isMinAdmin) {
      const canSee = isLeaderOfUnit(actor, unitId) || isMemberOfUnit(actor, unitId);
      if (!canSee) return res.status(403).json({ ok:false, message:'Forbidden' });
    }
    const list = await Finance.find(q).sort({ date: -1 }).limit(1000);
    res.json({ ok:true, finances: list });
  } catch(e) {
    res.status(500).json({ ok:false, message:'Failed to list finance', error: e.message });
  }
}

// PUT /api/finance/:id { amount?, source?, description?, date?, type? }
async function updateFinance(req,res){
  try{
    const { id } = req.params;
    const f = await Finance.findById(id);
    if(!f) return res.status(404).json({ ok:false, message:'Not found' });
    const actor = req.user;
    // Only Financial Secretary of the unit can edit
    if (!hasDuty(actor, f.unit, 'FinancialSecretary')) return res.status(403).json({ ok:false, message:'Forbidden' });
    const allowed = ['type','amount','source','description','date'];
    for(const k of allowed){ if(req.body[k] !== undefined) f[k] = req.body[k]; }
    await f.save();
    res.json({ ok:true, finance: f });
  }catch(e){ res.status(500).json({ ok:false, message:'Failed to update finance', error:e.message }); }
}

// DELETE /api/finance/:id
async function deleteFinance(req,res){
  try{
    const { id } = req.params; const f = await Finance.findById(id);
    if(!f) return res.status(404).json({ ok:false, message:'Not found' });
    const actor = req.user;
    if (!hasDuty(actor, f.unit, 'FinancialSecretary')) return res.status(403).json({ ok:false, message:'Forbidden' });
    await f.deleteOne();
    res.json({ ok:true, id });
  }catch(e){ res.status(500).json({ ok:false, message:'Failed to delete finance', error:e.message }); }
}

// GET /api/finance/summary?unitId=...
async function financeSummary(req,res){
  try{
    const { unitId } = req.query || {};
    if(!unitId) return res.status(400).json({ ok:false, message:'unitId required' });
    const actor = req.user;
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const isMinAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
    if(!isSuper && !isMinAdmin && !isLeaderOfUnit(actor, unitId) && !isMemberOfUnit(actor, unitId)){
      return res.status(403).json({ ok:false, message:'Forbidden' });
    }
    // Aggregate last 12 months income/expense totals for the unit
    const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth()-11, 1);
    const pipeline = [
      { $match: { unit: Unit.castObjectId ? Unit.castObjectId(unitId) : (require('mongoose').Types.ObjectId.isValid(unitId)? require('mongoose').Types.ObjectId(unitId) : unitId), date: { $gte: start } } },
      { $project: { type:1, amount:1, year: { $year: '$date' }, month: { $month: '$date' } } },
      { $group: { _id: { year:'$year', month:'$month', type:'$type' }, total: { $sum: '$amount' } } }
    ];
    const rows = await Finance.aggregate(pipeline);
    // Build monthly arrays and totals
    const byMonth = {}; // 'YYYY-MM' -> { income, expense }
    let incomeTotal=0, expenseTotal=0;
    for(const r of rows){
      const y = r._id.year, m = r._id.month; const key = `${y}-${String(m).padStart(2,'0')}`;
      if(!byMonth[key]) byMonth[key] = { income:0, expense:0 };
      byMonth[key][r._id.type] = r.total;
      if(r._id.type==='income') incomeTotal += r.total; else expenseTotal += r.total;
    }
    // Last month comparison
    const lastMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`;
    const currKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const lastIncome = (byMonth[lastKey]?.income||0); const currIncome = (byMonth[currKey]?.income||0);
    const change = lastIncome ? Math.round(((currIncome - lastIncome)/lastIncome)*100) : null;
    res.json({ ok:true, summary: { totals: { income: incomeTotal, expense: expenseTotal, net: incomeTotal-expenseTotal }, byMonth, incomeChangeVsLast: change } });
  }catch(e){ res.status(500).json({ ok:false, message:'Failed to build finance summary', error:e.message }); }
}

module.exports = { recordFinance, listFinance, updateFinance, deleteFinance, financeSummary };
