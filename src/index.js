const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
// Ensure .env is loaded from backend root regardless of current working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const connectDB = require('./config/db');

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
// path already required above

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET ? process.env.CLOUDINARY_API_SECRET.replace(/\\n/g, '\n') : ''
});

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

connectDB();


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


// Cloudinary upload endpoint for profile images
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const User = require('./models/User');
const { run, seedSuperAdmin } = require('../scripts/seedAdmin');
app.post('/api/upload/profile', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const result = await cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'soj_profiles' }, async (error, result) => {
      if (error) return res.status(500).json({ error: 'Cloudinary upload failed', details: error });
      // save to user
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      user.profile = user.profile || {};
      user.profile.avatar = result.secure_url;
      await user.save();
      return res.json({ ok: true, url: result.secure_url });
    });
    // pipe buffer
    const stream = result;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
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
