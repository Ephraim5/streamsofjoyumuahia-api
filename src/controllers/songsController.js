const Song = require('../models/Song');

function resolveActiveUnit(user){
  if(!user) return null;
  const active = user.activeRole;
  if(!active) return null;
  const roleObj = (user.roles||[]).find(r=>r.role===active && r.unit);
  return roleObj ? roleObj.unit : null;
}

async function listSongs(req, res){
  try {
    const user = req.user;
    const unitId = resolveActiveUnit(user);
    const q = unitId ? { unit: unitId } : {};
    const songs = await Song.find(q).sort({ releaseDate: -1, createdAt: -1 }).limit(500);
    return res.json({ ok:true, songs });
  } catch(e){
    console.error('listSongs error', e);
    return res.status(500).json({ ok:false, message:'Failed to list songs' });
  }
}

async function createSong(req,res){
  try {
    const user = req.user;
    const unitId = resolveActiveUnit(user);
    if(!unitId) return res.status(400).json({ ok:false, message:'Active unit required' });
    const { title, composer, vocalLeads, link, releaseDate } = req.body||{};
    if(!title) return res.status(400).json({ ok:false, message:'title required' });
    const doc = await Song.create({ title, composer, vocalLeads, link, releaseDate: releaseDate? new Date(releaseDate): undefined, unit: unitId, addedBy: user._id });
    return res.json({ ok:true, song: doc });
  } catch(e){
    console.error('createSong error', e);
    return res.status(500).json({ ok:false, message:'Failed to create song' });
  }
}

async function updateSong(req,res){
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if(updates.releaseDate) updates.releaseDate = new Date(updates.releaseDate);
    const doc = await Song.findByIdAndUpdate(id, updates, { new: true });
    return res.json({ ok:true, song: doc });
  } catch(e){
    console.error('updateSong error', e);
    return res.status(500).json({ ok:false, message:'Failed to update song' });
  }
}

async function deleteSong(req,res){
  try {
    const { id } = req.params;
    await Song.findByIdAndDelete(id);
    return res.json({ ok:true });
  } catch(e){
    console.error('deleteSong error', e);
    return res.status(500).json({ ok:false, message:'Failed to delete song' });
  }
}

module.exports = { listSongs, createSong, updateSong, deleteSong };
