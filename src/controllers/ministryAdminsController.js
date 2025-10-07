const User = require('../models/User');
const Church = require('../models/Church');

function isMultiSuperAdmin(user){
  return !!(user && user.multi && (user.roles||[]).some(r=>r.role==='SuperAdmin'));
}

// POST /api/ministry-admins { email, firstName, surname, churchId, ministryName, title? }
exports.createMinistryAdmin = async (req,res)=>{
  try {
    if(!isMultiSuperAdmin(req.user)) return res.status(403).json({ ok:false, message:'Forbidden' });
    let { email, firstName, surname, churchId, ministryName, title, middleName } = req.body || {};
    if(!email || !firstName || !surname || !churchId || !ministryName){
      return res.status(400).json({ ok:false, message:'Missing required fields' });
    }
    email = email.trim().toLowerCase();
    const existing = await User.findOne({ email: new RegExp('^'+email+'$', 'i') });
    if(existing) return res.status(400).json({ ok:false, message:'Email already exists' });
    const church = await Church.findById(churchId);
    if(!church) return res.status(404).json({ ok:false, message:'Church not found' });
    if(!church.ministries.some(m=>m.name.toLowerCase()===ministryName.toLowerCase())){
      return res.status(400).json({ ok:false, message:'Ministry not found in church' });
    }
    const tempPhone = `+234999${Date.now()}`.slice(0,14);
    const user = await User.create({
      email,
      title: title||'',
      firstName,
      middleName: middleName||'',
      surname,
      phone: tempPhone,
      isVerified: true, // email must still be verified on login flow; we can treat as verified for now
      approved: false,
      organization: church.organization,
      church: church._id,
      churches: [church._id],
      multi: false,
      roles: [{ role:'MinistryAdmin', church: church._id, ministryName }],
      activeRole: 'MinistryAdmin'
    });
    return res.json({ ok:true, user: await User.findById(user._id).select('-passwordHash -__v') });
  } catch(e){
    console.error('createMinistryAdmin error', e);
    return res.status(500).json({ ok:false, message:'Failed to create ministry admin', error:e.message });
  }
};

// GET /api/ministry-admins?churchId=...&ministry=...
exports.listMinistryAdmins = async (req,res)=>{
  try {
    const { churchId, ministry } = req.query;
    const filter = { 'roles.role':'MinistryAdmin' };
    if(churchId) filter['roles.church'] = churchId;
    if(ministry) filter['roles.ministryName'] = ministry;
    const users = await User.find(filter).select('firstName surname email roles church');
    res.json({ ok:true, users });
  } catch(e){
    res.status(500).json({ ok:false, message:'Failed to list ministry admins', error:e.message });
  }
};
