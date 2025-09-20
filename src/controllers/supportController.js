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

// Utility: seed or overwrite legal pages with provided or default structured content
async function seedLegal(req, res){
  try {
    const { overwrite } = req.body || {};
    const defaults = {
      terms: {
        title: 'Terms of Use',
        sections: [
          { heading: 'Welcome', body: 'Welcome to the Streams of Joy mobile app! By using our services, you agree to the following terms. Please read them carefully.' },
          { heading: 'Acceptable Use', body: 'Use the app responsibly and lawfully. Do not engage in any activity that could harm the app, its users, or third parties.' },
          { heading: 'Account Security', body: 'Keep your account credentials secure. You are responsible for all activities under your account.' }
        ]
      },
      privacy: {
        title: 'Privacy Policy',
        sections: [
          { heading: 'Your Privacy Matters', body: 'Your privacy is important to us. This policy explains how we collect, use, and protect your information.' },
          { heading: 'What Data We Collect', body: 'We collect information you provide, such as your name, email, and usage data. We may also collect device information and IP addresses.' },
          { heading: 'How we Use Your Data', body: 'We use your data to provide and improve our services, personalize your experience, and communicate with you. We do not sell your data to third parties.' },
          { heading: 'Data Security', body: 'We implement security measures to protect your data from unauthorized access, alteration, or disclosure. However, no method is completely secure.' }
        ]
      }
    };
    for (const type of Object.keys(defaults)){
      let existing = await LegalPage.findOne({ type });
      if(!existing){
        await LegalPage.create({ type, ...defaults[type], lastUpdated: new Date() });
      } else if (overwrite){
        existing.title = defaults[type].title;
        existing.sections = defaults[type].sections;
        existing.lastUpdated = new Date();
        await existing.save();
      }
    }
    return res.json({ ok:true, message:'Legal pages seeded', overwrite: !!overwrite });
  } catch(e){
    console.error('seedLegal error', e);
    return res.status(500).json({ ok:false, message:'Failed to seed legal content' });
  }
}

module.exports = { createTicket, listTickets, getLegal, seedLegal };
