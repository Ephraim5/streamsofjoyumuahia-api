const Church = require('../models/Church');
const Organization = require('../models/Organization');

function isMultiSuperAdmin(user){
  return !!(user && user.multi && (user.roles||[]).some(r=>r.role==='SuperAdmin'));
}

// GET /api/churches
exports.listChurches = async (req,res)=>{
  try {
    const q = req.query.q || '';
    const filter = q ? { name: new RegExp(q,'i') } : {};
    const churches = await Church.find(filter).select('name slug organization ministries.name createdAt');
    res.json({ ok:true, churches });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to list churches', error:e.message });
  }
};

// POST /api/churches { name, slug, organizationId }
exports.createChurch = async (req,res)=>{
  try {
    if(!isMultiSuperAdmin(req.user)) return res.status(403).json({ ok:false, message:'Forbidden' });
    let { name, slug, organizationId, ministries=[] } = req.body || {};
    if(!name || !slug) return res.status(400).json({ ok:false, message:'name and slug required' });
    if(!organizationId){
      const org = await Organization.findOne({});
      if(!org) return res.status(400).json({ ok:false, message:'No organization found; seed first' });
      organizationId = org._id;
    }
    const church = await Church.create({ organization: organizationId, name, slug, ministries: (ministries||[]).map(m=>({ name:m.name||m })) });
    res.json({ ok:true, church });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to create church', error:e.message });
  }
};

// PUT /api/churches/:id { name?, slug? }
exports.updateChurch = async (req,res)=>{
  try {
    if(!isMultiSuperAdmin(req.user)) return res.status(403).json({ ok:false, message:'Forbidden' });
    const { id } = req.params;
    const payload = {};
    ['name','slug'].forEach(f=>{ if(req.body[f]!==undefined) payload[f]=req.body[f]; });
    const church = await Church.findByIdAndUpdate(id, payload, { new:true });
    if(!church) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, church });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to update church', error:e.message });
  }
};

// DELETE /api/churches/:id
exports.deleteChurch = async (req,res)=>{
  try {
    if(!isMultiSuperAdmin(req.user)) return res.status(403).json({ ok:false, message:'Forbidden' });
    const { id } = req.params;
    await Church.findByIdAndDelete(id);
    res.json({ ok:true, id });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to delete church', error:e.message });
  }
};

// POST /api/churches/:id/ministries { name }
exports.addMinistry = async (req,res)=>{
  try {
    if(!isMultiSuperAdmin(req.user)) return res.status(403).json({ ok:false, message:'Forbidden' });
    const { id } = req.params; const { name } = req.body || {};
    if(!name) return res.status(400).json({ ok:false, message:'name required' });
    const church = await Church.findById(id);
    if(!church) return res.status(404).json({ ok:false, message:'Not found' });
    if(church.ministries.some(m=>m.name.toLowerCase()===name.toLowerCase())) return res.status(400).json({ ok:false, message:'Ministry exists' });
    church.ministries.push({ name });
    await church.save();
    res.json({ ok:true, church });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to add ministry', error:e.message });
  }
};

// DELETE /api/churches/:id/ministries/:ministryId
exports.removeMinistry = async (req,res)=>{
  try {
    if(!isMultiSuperAdmin(req.user)) return res.status(403).json({ ok:false, message:'Forbidden' });
    const { id, ministryId } = req.params;
    const church = await Church.findById(id);
    if(!church) return res.status(404).json({ ok:false, message:'Not found' });
    church.ministries = church.ministries.filter(m=> m._id.toString() !== ministryId);
    await church.save();
    res.json({ ok:true, church });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to remove ministry', error:e.message });
  }
};

// GET /api/churches/:id
exports.getChurch = async (req,res)=>{
  try {
    const { id } = req.params;
    const church = await Church.findById(id).populate('organization','name slug');
    if(!church) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, church });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to get church', error:e.message });
  }
};
