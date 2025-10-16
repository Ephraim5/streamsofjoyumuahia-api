const FinanceCategory = require('../models/FinanceCategory');

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

// GET /api/finance-categories?unitId=..&type=income|expense
async function listCategories(req, res){
  try{
    const { unitId, type } = req.query || {};
    if(!unitId) return res.status(400).json({ ok:false, message:'unitId required' });
    if(!['income','expense'].includes(String(type))) return res.status(400).json({ ok:false, message:'type must be income or expense' });
    const actor = req.user;
    const isSuper = (actor.roles||[]).some(r=>r.role==='SuperAdmin') || actor.activeRole==='SuperAdmin';
    const isMinAdmin = (actor.roles||[]).some(r=>r.role==='MinistryAdmin') || actor.activeRole==='MinistryAdmin';
    if(!isSuper && !isMinAdmin && !isLeaderOfUnit(actor, unitId) && !isMemberOfUnit(actor, unitId)){
      return res.status(403).json({ ok:false, message:'Forbidden' });
    }
    const list = await FinanceCategory.find({ unit: unitId, type }).sort({ nameLower: 1 });
    return res.json({ ok:true, categories: list });
  }catch(e){ return res.status(500).json({ ok:false, message:'Failed to list categories', error:e.message }); }
}

// POST /api/finance-categories { unitId, type, name }
async function createCategory(req,res){
  try{
    const { unitId, type, name } = req.body || {};
    if(!unitId) return res.status(400).json({ ok:false, message:'unitId required' });
    if(!['income','expense'].includes(String(type))) return res.status(400).json({ ok:false, message:'type must be income or expense' });
    const trimmed = String(name||'').trim();
    if(!trimmed) return res.status(400).json({ ok:false, message:'name required' });
    const actor = req.user;
    if(!hasDuty(actor, unitId, 'FinancialSecretary')) return res.status(403).json({ ok:false, message:'Only Financial Secretary can manage categories' });
    try{
      const created = await FinanceCategory.create({ unit: unitId, type, name: trimmed, createdBy: actor._id });
      return res.json({ ok:true, category: created });
    }catch(e){
      if(e && e.code === 11000){
        return res.status(409).json({ ok:false, message:'Category already exists' });
      }
      throw e;
    }
  }catch(e){ return res.status(500).json({ ok:false, message:'Failed to create category', error:e.message }); }
}

// PUT /api/finance-categories/rename { unitId, type, from, to }
async function renameCategory(req,res){
  try{
    const { unitId, type, from, to } = req.body || {};
    if(!unitId) return res.status(400).json({ ok:false, message:'unitId required' });
    if(!['income','expense'].includes(String(type))) return res.status(400).json({ ok:false, message:'type must be income or expense' });
    const src = String(from||'').trim();
    const dst = String(to||'').trim();
    if(!src || !dst) return res.status(400).json({ ok:false, message:'from and to required' });
    const actor = req.user;
    if(!hasDuty(actor, unitId, 'FinancialSecretary')) return res.status(403).json({ ok:false, message:'Only Financial Secretary can manage categories' });
    const doc = await FinanceCategory.findOne({ unit: unitId, type, nameLower: src.toLowerCase() });
    if(!doc) return res.status(404).json({ ok:false, message:'Category not found' });
    doc.name = dst; // pre-validate will set nameLower
    try{
      await doc.save();
      return res.json({ ok:true, category: doc });
    }catch(e){
      if(e && e.code === 11000){
        return res.status(409).json({ ok:false, message:'Another category with this name already exists' });
      }
      throw e;
    }
  }catch(e){ return res.status(500).json({ ok:false, message:'Failed to rename category', error:e.message }); }
}

module.exports = { listCategories, createCategory, renameCategory };
