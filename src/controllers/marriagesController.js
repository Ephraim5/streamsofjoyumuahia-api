const Marriage = require('../models/Marriage');

function resolveActiveUnit(user){
  if(!user) return null;
  const active = user.activeRole;
  if(!active) return null;
  const roleObj = (user.roles||[]).find(r=>r.role===active && r.unit);
  return roleObj ? roleObj.unit : null;
}

async function listMarriages(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    const q = unitId ? { unit: unitId } : {};
    const { year, q: query } = req.query || {};
    if (year) {
      const start = new Date(`${year}-01-01T00:00:00.000Z`);
      const end = new Date(`${year}-12-31T23:59:59.999Z`);
      q.date = { $gte: start, $lte: end };
    }
    if (query) {
      q.name = { $regex: String(query), $options: 'i' };
    }
    const marriages = await Marriage.find(q).sort({ date: -1 }).limit(500);
    return res.json({ ok:true, marriages });
  } catch(e){
    console.error('listMarriages error', e);
    return res.status(500).json({ ok:false, message:'Failed to list marriages' });
  }
}

async function createMarriage(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active unit required' });
    const { name, date, note } = req.body||{};
    if(!name || !date) return res.status(400).json({ ok:false, message:'name and date required' });
    const doc = await Marriage.create({ name, date:new Date(date), note, unit: unitId, addedBy: req.user._id });
    return res.json({ ok:true, marriage: doc });
  } catch(e){
    console.error('createMarriage error', e);
    return res.status(500).json({ ok:false, message:'Failed to create marriage' });
  }
}

async function updateMarriage(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active unit required' });
    const { id } = req.params;
    const { name, date, note } = req.body||{};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (date !== undefined) updates.date = new Date(date);
    if (note !== undefined) updates.note = note;
    const doc = await Marriage.findOneAndUpdate({ _id: id, unit: unitId }, { $set: updates }, { new: true });
    if(!doc) return res.status(404).json({ ok:false, message:'Marriage not found' });
    return res.json({ ok:true, marriage: doc });
  }catch(e){
    console.error('updateMarriage error', e);
    return res.status(500).json({ ok:false, message:'Failed to update marriage' });
  }
}

async function deleteMarriage(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active unit required' });
    const { id } = req.params;
    const del = await Marriage.deleteOne({ _id: id, unit: unitId });
    if(del.deletedCount === 0) return res.status(404).json({ ok:false, message:'Marriage not found' });
    return res.json({ ok:true });
  }catch(e){
    console.error('deleteMarriage error', e);
    return res.status(500).json({ ok:false, message:'Failed to delete marriage' });
  }
}

module.exports = { listMarriages, createMarriage, updateMarriage, deleteMarriage };
