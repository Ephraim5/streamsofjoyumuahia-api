const path = require('path');
const User = require('../models/User');
const Church = require('../models/Church');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;

// Bootstrap access code for the FIRST multi SuperAdmin only.
// You can override via env SOJ_BOOTSTRAP_CODE. Default is hard-coded for initial setup.
// Format: WORD-NNNN (case-insensitive)
const BOOTSTRAP_CODE = (process.env.SOJ_BOOTSTRAP_CODE || 'JOY-4827').toUpperCase();

async function ensureFirstMultiExists(){
  // If there is already a multi superadmin, return it; else null
  return User.findOne({ multi: true, 'roles.role': 'SuperAdmin' });
}

// GET /register-superadmin (serve HTML form from public)
async function renderRegistrationForm (req,res){
  try {
    res.sendFile(path.join(__dirname, '../public/register-superadmin.html'));
  } catch(e){
    res.status(500).send('Failed to load form');
  }
}

// POST /register-superadmin { firstName, surname, middleName?, title?, phone, email, password, address? }
// - If no multi superadmin exists: create one with multi=true & approved=true.
// - Else create pending superadmin (multi=false, approved=false, superAdminPending=true) requiring approval.
async function handleRegistration (req,res){
  try {
  let { firstName, surname, middleName, title, phone, email, password, bootstrapCode, address, churchId } = req.body || {};
    if(!firstName || !surname || !phone || !email || !password){
      return res.status(400).json({ ok:false, message:'Missing required fields' });
    }
    if (typeof password === 'string' && password.length < 6) {
      return res.status(400).json({ ok:false, message:'Password must be at least 6 characters' });
    }
    email = email.trim().toLowerCase();
    // Allow continuation if a placeholder user was created during mail OTP verification step
    let existingEmail = await User.findOne({ email: new RegExp('^'+email+'$', 'i') });
    let existingPhone = await User.findOne({ phone });
    const firstMulti = await ensureFirstMultiExists();
    // Prefer selected church; fallback to any church
    let tempChurch = null;
    if (churchId) {
      tempChurch = await Church.findById(churchId).catch(()=>null);
    }
    if (!tempChurch) tempChurch = await Church.findOne({});
    const passwordHash = await bcrypt.hash(password, 10);
    const base = {
      title: title||'',
      firstName,
      middleName: middleName||'',
      surname,
      phone,
      email,
      passwordHash,
      isVerified: true,
      roles: [{ role:'SuperAdmin' }],
      activeRole: 'SuperAdmin',
      registrationCompleted: true,
      organization: tempChurch ? tempChurch.organization : null,
      church: tempChurch ? tempChurch._id : null,
      churches: tempChurch ? [tempChurch._id] : [],
    };
    // Support optional address capture
    if (address) {
      base.profile = { ...(base.profile||{}), address };
    }
    // Handle avatar upload if provided (req.file from multer)
    if (req.file && cloudinary.config().cloud_name) {
      try {
        const uploadRes = await new Promise((resolve, reject) => {
          const s = cloudinary.uploader.upload_stream({ folder: 'soj_profiles', resource_type: 'image' }, (err, result)=>{
            if (err) return reject(err); resolve(result);
          });
          s.end(req.file.buffer);
        });
        if (uploadRes?.secure_url) {
          base.profile = { ...(base.profile||{}), avatar: uploadRes.secure_url };
        }
      } catch(e){ console.warn('[superAdminRegistration] avatar upload failed:', e.message); }
    }

    if(!firstMulti){
      // Require bootstrap access code only for the FIRST multi SuperAdmin creation
      const code = (bootstrapCode || '').toString().trim().toUpperCase();
      if(!code || code !== BOOTSTRAP_CODE){
        return res.status(403).json({ ok:false, message:'Invalid bootstrap access code' });
      }
      // Block duplicates for completed users (avoid duplicate key crash)
      if (existingEmail && existingEmail.passwordHash && existingEmail.firstName !== 'Pending') {
        return res.status(400).json({ ok:false, message:'Email already exists' });
      }
      if (existingPhone && existingPhone.passwordHash && existingPhone.firstName !== 'Pending') {
        return res.status(400).json({ ok:false, message:'Phone already exists' });
      }
      // Seed first multi superadmin
      // If placeholder user exists (from OTP), update it instead of creating new
      let user;
      if (existingEmail && (!existingEmail.passwordHash || existingEmail.firstName === 'Pending')) {
        user = existingEmail;
        Object.assign(user, base);
        user.approved = true;
        user.multi = true;
        user.superAdminPending = false;
        await user.save();
      } else if (existingPhone && (!existingPhone.passwordHash || existingPhone.firstName === 'Pending')) {
        user = existingPhone;
        Object.assign(user, base);
        user.approved = true;
        user.multi = true;
        user.superAdminPending = false;
        await user.save();
      } else {
        user = await User.create({ ...base, approved:true, multi:true, superAdminPending:false });
      }
      return res.json({ ok:true, userId: user._id, multi:true, first:true });
    } else {
      // If a bootstrapCode is provided and valid, allow creating an additional multi-approved superadmin
      const code = (bootstrapCode || '').toString().trim().toUpperCase();
      if (code && code === BOOTSTRAP_CODE) {
        // Block duplicates for completed users
        if (existingEmail && existingEmail.passwordHash && existingEmail.firstName !== 'Pending') {
          return res.status(400).json({ ok:false, message:'Email already exists' });
        }
        if (existingPhone && existingPhone.passwordHash && existingPhone.firstName !== 'Pending') {
          return res.status(400).json({ ok:false, message:'Phone already exists' });
        }
        let user;
        if (existingEmail && (!existingEmail.passwordHash || existingEmail.firstName === 'Pending')) {
          user = existingEmail;
          Object.assign(user, base);
          user.approved = true;
          user.multi = true;
          user.superAdminPending = false;
          await user.save();
        } else if (existingPhone && (!existingPhone.passwordHash || existingPhone.firstName === 'Pending')) {
          user = existingPhone;
          Object.assign(user, base);
          user.approved = true;
          user.multi = true;
          user.superAdminPending = false;
          await user.save();
        } else {
          user = await User.create({ ...base, approved:true, multi:true, superAdminPending:false });
        }
        return res.json({ ok:true, userId: user._id, multi:true, first:false, pending:false });
      }
      // Otherwise create as pending single-church superadmin
      // If the email/phone already exists and is a completed user, block; else update placeholder
      if (existingEmail && existingEmail.passwordHash && existingEmail.firstName !== 'Pending') {
        return res.status(400).json({ ok:false, message:'Email already exists' });
      }
      if (existingPhone && existingPhone.passwordHash && existingPhone.firstName !== 'Pending') {
        return res.status(400).json({ ok:false, message:'Phone already exists' });
      }
      let user;
      if (existingEmail && (!existingEmail.passwordHash || existingEmail.firstName === 'Pending')) {
        user = existingEmail;
        Object.assign(user, base);
        user.approved = false;
        user.multi = false;
        user.superAdminPending = true;
        await user.save();
      } else if (existingPhone && (!existingPhone.passwordHash || existingPhone.firstName === 'Pending')) {
        user = existingPhone;
        Object.assign(user, base);
        user.approved = false;
        user.multi = false;
        user.superAdminPending = true;
        await user.save();
      } else {
        user = await User.create({ ...base, approved:false, multi:false, superAdminPending:true });
      }
      return res.json({ ok:true, userId: user._id, multi:false, first:false, pending:true });
    }
  } catch(e){
    // Handle duplicate key errors gracefully
    if (e && (e.code === 11000 || (e.message||'').includes('E11000'))) {
      const dupField = e.keyPattern ? Object.keys(e.keyPattern)[0] : undefined;
      const msg = dupField ? `${dupField} already exists` : 'Duplicate key error';
      return res.status(400).json({ ok:false, message: msg });
    }
    console.error('[superAdminRegistration] handleRegistration error', e);
    return res.status(500).json({ ok:false, message:'Registration failed', error:e.message });
  }
}

// POST /api/superadmins/approve { userId }
// Only multi superadmin can approve pending superadmins.
async function approveSuperAdmin (req,res){
  try {
    const actor = req.user;
    const isMulti = !!(actor && actor.multi && (actor.roles||[]).some(r=>r.role==='SuperAdmin'));
    if(!isMulti) return res.status(403).json({ ok:false, message:'Forbidden' });
    const { userId } = req.body || {};
    if(!userId) return res.status(400).json({ ok:false, message:'userId required' });
    const user = await User.findById(userId);
    if(!user) return res.status(404).json({ ok:false, message:'User not found' });
    if(!(user.roles||[]).some(r=>r.role==='SuperAdmin')) return res.status(400).json({ ok:false, message:'Target not superadmin' });
    user.approved = true;
    user.superAdminPending = false;
    await user.save();
    return res.json({ ok:true, userId: user._id });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Approval failed', error:e.message });
  }
}

// GET /api/superadmins/pending  (multi superadmins list pending superadmins)
async function listPending (req,res){
  try {
    const actor = req.user;
    const isMulti = !!(actor && actor.multi && (actor.roles||[]).some(r=>r.role==='SuperAdmin'));
    if(!isMulti) return res.status(403).json({ ok:false, message:'Forbidden' });
    const users = await User.find({ superAdminPending:true, 'roles.role':'SuperAdmin' }).select('firstName surname email phone approved superAdminPending multi');
    return res.json({ ok:true, users });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed', error:e.message });
  }
}

// GET /api/superadmins/churches  (multi superadmin: list churches with their superadmins & unit leaders)
async function listChurchesForSwitch (req,res){
  try {
    const actor = req.user;
    const isMulti = !!(actor && actor.multi && (actor.roles||[]).some(r=>r.role==='SuperAdmin'));
    if(!isMulti) return res.status(403).json({ ok:false, message:'Forbidden' });
    const churches = await Church.find({}).select('name organization').lean();
    const churchIds = churches.map(c=>c._id);
    const users = await User.find({ church: { $in: churchIds } }).select('firstName surname roles church activeRole').lean();
    const perChurch = churches.map(ch => {
      const related = users.filter(u=> u.church && u.church.toString()===ch._id.toString());
      return {
        _id: ch._id,
        name: ch.name,
        superAdmins: related.filter(u=> (u.roles||[]).some(r=>r.role==='SuperAdmin')).map(m=>({ _id:m._id, firstName:m.firstName, surname:m.surname })),
        unitLeaders: related.filter(u=> (u.roles||[]).some(r=>r.role==='UnitLeader')).map(m=>({ _id:m._id, firstName:m.firstName, surname:m.surname }))
      };
    });
    return res.json({ ok:true, churches: perChurch });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed', error:e.message });
  }
}

// POST /api/superadmins/switch-church { churchId }
async function switchChurch (req,res){
  try {
    const actor = req.user;
    const isMulti = !!(actor && actor.multi && (actor.roles||[]).some(r=>r.role==='SuperAdmin'));
    if(!isMulti) return res.status(403).json({ ok:false, message:'Forbidden' });
    const { churchId } = req.body || {};
    if(!churchId) return res.status(400).json({ ok:false, message:'churchId required' });
    const church = await Church.findById(churchId);
    if(!church) return res.status(404).json({ ok:false, message:'Church not found' });
    const user = await User.findById(actor._id);
    user.church = church._id;
    // maintain churches array
    if(!(user.churches||[]).some(c=>c.toString()===church._id.toString())){
      user.churches.push(church._id);
    }
    await user.save();
    return res.json({ ok:true, churchId: church._id });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Switch failed', error:e.message });
  }
}

module.exports = {
  renderRegistrationForm,
  handleRegistration,
  approveSuperAdmin,
  listPending,
  listChurchesForSwitch,
  switchChurch
};
