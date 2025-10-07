const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
// Ensure .env is loaded from backend root regardless of current working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const connectDB = require('./config/db');
const { seedUnits } = require('../scripts/seedUnits');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const unitRoutes = require('./routes/units');
const accessCodeRoutes = require('./routes/accessCodes');
const attendanceRoutes = require('./routes/attendance');
const eventRoutes = require('./routes/events');
const reportRoutes = require('./routes/reports');
const messageRoutes = require('./routes/messages');
const announcementRoutes = require('./routes/announcements');
const testimonyRoutes = require('./routes/testimonies');
const soulsRoutes = require('./routes/souls');
const financeRoutes = require('./routes/finance');
const shopRoutes = require('./routes/shop');
const otpRoutes = require('./routes/otpRoute');
const mailOtpRoutes = require('./routes/mailOtp');
const supportRoutes = require('./routes/support');
const invitesRoutes = require('./routes/invites');
const summaryRoutes = require('./routes/summary');
const achievementsRoutes = require('./routes/achievements');
const assistsRoutes = require('./routes/assists');
const songsRoutes = require('./routes/songs');
const marriagesRoutes = require('./routes/marriages');
const recoveredAddictsRoutes = require('./routes/recoveredAddicts');
const pushRoutes = require('./routes/push');
const workPlansRoutes = require('./routes/workPlans');
const churchesRoutes = require('./routes/churches');
const ministryAdminsRoutes = require('./routes/ministryAdmins');
// path already required above

const cloudinary = require('cloudinary').v2;
// Cloudinary configuration:
// Prefer explicit vars, but allow single CLOUDINARY_URL fallback (cloudinary://key:secret@cloudname)
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET.replace(/\\n/g, '\n'),
    secure: true
  });
} else if (process.env.CLOUDINARY_URL) {
  // Let SDK parse CLOUDINARY_URL
  cloudinary.config({ secure: true });
  console.log('[cloudinary] Using CLOUDINARY_URL fallback (ensure this is not committed)');
} else {
  console.warn('[cloudinary] Missing Cloudinary credentials. Uploads will fail until env vars are set.');
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));

// Startup diagnostics (non-sensitive)
if (process.env.EMAIL_DEBUG === 'true' || process.env.EMAIL_DEBUG === true) {
  const keySet = !!process.env.RESEND_API_KEY;
  console.log('[startup] Resend key present:', keySet ? 'yes' : 'no');
  if (keySet) {
    console.log('[startup] Resend key length:', process.env.RESEND_API_KEY.length);
  }
  console.log('[startup] RESEND_FROM:', process.env.RESEND_FROM || '(not set)');
  console.log('[startup] SKIP_EMAIL:', process.env.SKIP_EMAIL);
}

connectDB().then(async () => {
  try {
    const result = await seedUnits();
    if (result?.created >= 0) {
      console.log(`[startup] Default units seeding completed. Created: ${result.created}`);
    } else if (result?.error) {
      console.warn('[startup] Default units seeding error:', result.error);
    }
  } catch (e) {
    console.warn('[startup] Failed to seed default units:', e.message);
  }
});


app.use(express.static(path.join(__dirname, 'public')));

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});


app.post('/auth/seed-admin', async (req, res) => {
  try {
    const user = await seedSuperAdmin(req.body);
    if(user.isError){
      res.status(500).json({ok:false,user})
    }
    return res.json({
      ok: true,
      message: 'Super Admin created (or already exists)',
      user:user?.user,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/', async (req, res) => {
  try {
    return res.json({
      ok: true,
      message: 'backend running smoothly',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: err.message });
  }
});


app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', otpRoutes);
app.use('/api', mailOtpRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/access-codes', accessCodeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/testimonies', testimonyRoutes);
app.use('/api/souls', soulsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/assists', assistsRoutes);
app.use('/api/songs', songsRoutes);
app.use('/api/marriages', marriagesRoutes);
app.use('/api/recovered-addicts', recoveredAddictsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/workplans', workPlansRoutes);
app.use('/api/churches', churchesRoutes);
app.use('/api/ministry-admins', ministryAdminsRoutes);

// Lightweight health endpoint to verify cloudinary configuration (non-sensitive)
app.get('/api/health/cloudinary', (req, res) => {
  try {
    const cfg = cloudinary.config();
    return res.json({
      ok: true,
      cloud_name: cfg.cloud_name ? 'set' : 'missing',
      secure: cfg.secure === true,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Cloudinary upload endpoint for profile images
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const User = require('./models/User');
const { run, seedSuperAdmin } = require('../scripts/seedAdmin');
// Helper to wrap upload_stream in a Promise
function uploadBufferToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

app.post('/api/upload/profile', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'file required' });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  try {
    if (!cloudinary.config().cloud_name) {
      return res.status(500).json({ ok: false, error: 'Cloudinary not configured on server' });
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      resource_type: 'image',
      folder: 'soj_profiles',
      transformation: [{ width: 512, height: 512, crop: 'limit' }]
    });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    user.profile = user.profile || {};
    user.profile.avatar = result.secure_url;
    await user.save();
    return res.json({ ok: true, url: result.secure_url });
  } catch (err) {
    console.error('[cloudinary] upload error', err);
    return res.status(500).json({ ok: false, error: 'Upload failed', details: err?.message });
  }
});

// Start server with socket.io
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

// store online users map
const onlineUsers = {}; // userId -> socketId
app.set('io', io);
app.set('onlineUsers', onlineUsers);

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  // client must emit 'register' with its userId after connecting
  socket.on('register', (payload) => {
    const { userId } = payload || {};
    if (userId) {
      onlineUsers[userId] = socket.id;
      app.set('onlineUsers', onlineUsers);
      // broadcast online users list
      io.emit('onlineUsers', Object.keys(onlineUsers));
    }
  });
  socket.on('sendMessage', async (payload) => {
    // expect { toUserId, text, fromUserId }
    const { toUserId, text, fromUserId } = payload || {};
    if (!toUserId || !text || !fromUserId) return;
    // create message in DB and deliver
    const Message = require('./models/Message');
    const msg = await Message.create({ from: fromUserId, to: toUserId, text });
    const recipientSocketId = onlineUsers[toUserId];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message', { message: msg });
      msg.delivered = true;
      await msg.save();
    }
    // optionally emit ack to sender
    socket.emit('messageSent', { message: msg });
  });

  socket.on('disconnect', () => {
    // remove from onlineUsers
    for (const [uid, sid] of Object.entries(onlineUsers)) {
      if (sid === socket.id) {
        delete onlineUsers[uid];
        break;
      }
    }
    io.emit('onlineUsers', Object.keys(onlineUsers));
  });
});

const PORT = process.env.PORT || 4000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
