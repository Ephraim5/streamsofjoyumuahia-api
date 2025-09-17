const AccessCode = require('../models/AccessCode');
const { v4: uuidv4 } = require('uuid');

async function generateCode(req, res) {
  try{
  // Only SuperAdmin or UnitLeader (for members) can generate
  const { role, unitId } = req.body;
  if (!role) return res.status(400).json({ error: 'role required' });
  // generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours
  const rec = await AccessCode.create({ code, role, unit: unitId || null, createdBy: req.user._id, expiresAt });
  res.json({ ok: true, accessCode: rec.code, expiresAt: rec.expiresAt });
  }catch(err){
    console.log("Internal Error:",err)
    res.json({ok:false,message:"access code could not be generated", err})
  }
}

async function validateCode(req, res) {
  try{
 const { code } = req.body;
  const rec = await AccessCode.findOne({ code });
  if (!rec) return res.status(400).json({ valid: false, error: 'Invalid code' });
  if (rec.used) return res.status(400).json({ valid: false, error: 'Code used' });
  if (new Date() > rec.expiresAt) return res.status(400).json({ valid: false, error: 'Code expired' });
  res.json({ valid: true, role: rec.role, unit: rec.unit });
  }catch(err){
     console.log("Internal Error:",err)
    res.json({valid:false,message:"access code could not be generated", err,ok:false})
  }
}

module.exports = { generateCode, validateCode };
