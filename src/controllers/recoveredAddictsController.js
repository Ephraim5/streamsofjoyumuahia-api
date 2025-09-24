const RecoveredAddict = require('../models/RecoveredAddict');

function resolveActiveUnit(user){
  if(!user) return null;
  const active = user.activeRole;
  if(!active) return null;
  const roleObj = (user.roles||[]).find(r=>r.role===active && r.unit);
  return roleObj ? roleObj.unit : null;
}

async function listRecovered(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    const q = unitId ? { unit: unitId } : {};
    const { year, month, gender, addiction, q: query } = req.query || {};
    if (year) {
      const start = new Date(`${year}-01-01T00:00:00.000Z`);
      const end = new Date(`${year}-12-31T23:59:59.999Z`);
      q.dateOfRecovery = { $gte: start, $lte: end };
    }
    if (month) {
      // Filter month by name (English). We'll add an $expr match to check month index.
      // Simpler approach: compute month number and filter with $expr.
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const idx = months.indexOf(String(month).toLowerCase());
      if (idx >= 0) {
        q.$expr = { $eq: [ { $month: "$dateOfRecovery" }, idx + 1 ] };
      }
    }
    if (gender) q.gender = String(gender);
    if (addiction) q.addictionType = { $regex: String(addiction), $options: 'i' };
    if (query) {
      q.$or = [
        { fullName: { $regex: String(query), $options: 'i' } },
        { addictionType: { $regex: String(query), $options: 'i' } }
      ];
    }
    const items = await RecoveredAddict.find(q).sort({ dateOfRecovery: -1 }).limit(500);
    return res.json({ ok:true, recovered: items });
  }catch(e){
    console.error('listRecovered error', e);
    return res.status(500).json({ ok:false, message:'Failed to list recovered addicts' });
  }
}

async function createRecovered(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active unit required' });
    const { fullName, gender, age, maritalStatus, addictionType, dateOfRecovery, phone } = req.body||{};
    if(!fullName || !gender || !addictionType || !dateOfRecovery){
      return res.status(400).json({ ok:false, message:'fullName, gender, addictionType, dateOfRecovery required' });
    }
    const doc = await RecoveredAddict.create({ fullName, gender, age, maritalStatus, addictionType, dateOfRecovery: new Date(dateOfRecovery), phone, unit: unitId, addedBy: req.user._id });
    return res.json({ ok:true, recovered: doc });
  }catch(e){
    console.error('createRecovered error', e);
    return res.status(500).json({ ok:false, message:'Failed to create recovered addict' });
  }
}

async function updateRecovered(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active unit required' });
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.dateOfRecovery) updates.dateOfRecovery = new Date(updates.dateOfRecovery);
    const doc = await RecoveredAddict.findOneAndUpdate({ _id: id, unit: unitId }, { $set: updates }, { new: true });
    if(!doc) return res.status(404).json({ ok:false, message:'Not found' });
    return res.json({ ok:true, recovered: doc });
  }catch(e){
    console.error('updateRecovered error', e);
    return res.status(500).json({ ok:false, message:'Failed to update' });
  }
}

async function deleteRecovered(req,res){
  try{
    const unitId = resolveActiveUnit(req.user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active unit required' });
    const { id } = req.params;
    const del = await RecoveredAddict.deleteOne({ _id: id, unit: unitId });
    if(del.deletedCount === 0) return res.status(404).json({ ok:false, message:'Not found' });
    return res.json({ ok:true });
  }catch(e){
    console.error('deleteRecovered error', e);
    return res.status(500).json({ ok:false, message:'Failed to delete' });
  }
}

module.exports = { listRecovered, createRecovered, updateRecovered, deleteRecovered };
