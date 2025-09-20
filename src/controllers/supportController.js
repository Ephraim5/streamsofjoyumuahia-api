const SupportTicket = require('../models/SupportTicket');
const LegalPage = require('../models/LegalPage');
const cloudinary = require('cloudinary').v2;

async function createTicket(req, res){
  try {
    const { email, phone, category, description, screenshotBase64, screenshotUrl: providedUrl } = req.body || {};
    if(!email || !category || !description){
      return res.status(400).json({ ok:false, message:'email, category, description required' });
    }
    const allowed = ['Login Issues','Performance','Bug Report','Feature Request','Data Issue','Other'];
    if(!allowed.includes(category)){
      return res.status(400).json({ ok:false, message:'Invalid category'});
    }
    let screenshotUrl = undefined;

    // Support either an already hosted URL or a base64 data URI
    if (providedUrl) {
      screenshotUrl = providedUrl;
    } else if (screenshotBase64 && typeof screenshotBase64 === 'string' && screenshotBase64.startsWith('data:')) {
      try {
        const uploadRes = await new Promise((resolve, reject) => {
          const upload = cloudinary.uploader.upload_stream({ folder: 'support_screens' }, (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
          // Extract base64 body
          const base64Data = screenshotBase64.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          upload.end(buffer);
        });
        screenshotUrl = uploadRes.secure_url;
      } catch (err) {
        console.warn('Screenshot upload failed, continuing without image', err?.message);
      }
    }

    const ticket = await SupportTicket.create({
      email: email.trim().toLowerCase(),
      phone,
      category,
      description: description.trim(),
      screenshotUrl,
      user: req.user?._id
    });
    return res.json({ ok:true, ticket });
  } catch(e){
    console.error('createTicket error', e);
    return res.status(500).json({ ok:false, message:'Failed to create ticket' });
  }
}

async function listTickets(req, res){
  const tickets = await SupportTicket.find().sort({ createdAt:-1 }).limit(500);
  res.json({ ok:true, tickets });
}

async function getLegal(req,res){
  try {
    const type = req.params.type; // 'terms' | 'privacy'
    if(!['terms','privacy'].includes(type)) return res.status(400).json({ ok:false, message:'Invalid type'});
    let page = await LegalPage.findOne({ type });
    if(!page){
      // seed minimal default if missing
      page = await LegalPage.create({ type, title: type==='terms'?'Terms of Use':'Privacy Policy', sections: [{ heading: 'Coming Soon', body: 'Content will be provided shortly.' }] });
    }
    return res.json({ ok:true, page });
  } catch(e){
    return res.status(500).json({ ok:false, message:'Failed to load content' });
  }
}

module.exports = { createTicket, listTickets, getLegal };
