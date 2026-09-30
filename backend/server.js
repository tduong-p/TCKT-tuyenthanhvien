const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const Candidate = require('./models/Candidate');
const User = require('./models/User');
const Evaluation = require('./models/Evaluation');
const Message = require('./models/Message');
const candidateImporter = require('./importers/candidates');
const staffImporter = require('./importers/staff');
const { config: orgConfig, ASSETS_DIR, defaultDepartment, isValidDepartment, isValidResult, getCandidateName } = require('./config');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // admin Excel import sends a few thousand rows as JSON
// Express 5 leaves req.body undefined when nothing was parsed; handlers destructure it
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });

const jwt = require('jsonwebtoken');
const IS_PROD = process.env.NODE_ENV === 'production';
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Random per-process secret: safe, but everyone is logged out when the server restarts
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[security] JWT_SECRET is not set - using a random secret; sessions will not survive restarts.');
}
// Shared staff password for this deployment. Required in production.
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || (IS_PROD ? null : 'Abc@123');
if (!process.env.STAFF_PASSWORD) {
  console.warn(IS_PROD
    ? '[security] STAFF_PASSWORD is not set - staff login is disabled.'
    : '[security] STAFF_PASSWORD is not set - using dev default "Abc@123".');
}

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const hasRole = (u, role) => !!u && (u.role === role || (Array.isArray(u.roles) && u.roles.includes(role)));

const authMiddleware = async (req, res, next) => {
  // Allow public/read-only routes without token
  if (req.path === '/login' || req.path === '/tv-board' || req.path === '/board' || req.path === '/public/config' || req.path === '/public/health') return next();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
app.use('/api', authMiddleware);

// Staff-only guard. Loads the live user from DB (roles may have changed since the token was issued)
// into req.staff. With roles given, the user needs one of them; admins pass every check.
const requireStaff = (...roles) => async (req, res, next) => {
  try {
    if (!req.user || req.user.role === 'candidate') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const dbUser = await User.findById(req.user.id);
    if (!dbUser) return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại' });
    if (roles.length && !hasRole(dbUser, 'admin') && !roles.some(r => hasRole(dbUser, r))) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    req.staff = dbUser;
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
app.use('/api/admin', requireStaff('admin'));

// Org-specific branding assets (logos, backgrounds, QR...) live next to the org config
app.use('/org-assets', express.static(ASSETS_DIR));

app.get('/api/public/config', (req, res) => {
  res.json(orgConfig);
});

// Used by the Docker HEALTHCHECK: unhealthy while MongoDB is unreachable
app.get('/api/public/health', (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ ok });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview';
mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    // Exit so the container restart policy retries; mongoose does not retry a failed first connect
    console.log('MongoDB connection error:', err);
    process.exit(1);
  });

// Auto assignment logic
const assignCandidates = async () => {
  try {
    const availableInterviewers = await User.find({ 
      role: 'interviewer', 
      status: 'active', 
      roomNumber: { $ne: null },
      tableNumber: { $ne: null },
      autoAssign: { $ne: false } // only assign if autoAssign is true
    });
    if (availableInterviewers.length === 0) return;

    for (let interviewer of availableInterviewers) {
      // Concurrency check: Ensure no candidate is currently moving or interviewing at this room/table
      const busyCandidate = await Candidate.findOne({
        department: interviewer.department,
        assignedRoom: interviewer.roomNumber,
        assignedTable: interviewer.tableNumber,
        status: { $in: ['moving', 'interviewing'] }
      });

      if (busyCandidate) {
        continue; // Skip this interviewer, the table is busy
      }

      const waitingCandidate = await Candidate.findOne({ status: 'waiting', department: interviewer.department }).sort({ checkInTime: 1 });
      if (waitingCandidate) {
        waitingCandidate.status = 'moving';
        waitingCandidate.assignedRoom = interviewer.roomNumber;
        waitingCandidate.assignedTable = interviewer.tableNumber;
        await waitingCandidate.save();

        interviewer.status = 'interviewing';
        await interviewer.save();

        io.emit('candidate_assigned', { candidate: waitingCandidate, roomNumber: interviewer.roomNumber, tableNumber: interviewer.tableNumber });
        io.emit('board_update');
      }
    }
  } catch (err) {
    console.error('Error assigning candidates:', err);
  }
};

if (orgConfig.autoAssign) setInterval(assignCandidates, 3000); // Check every 3 seconds

// Other interviewers seated at the same table (a table may have several devices/accounts)
const findTableMates = (user) => (user.tableNumber && user.roomNumber)
  ? User.find({ _id: { $ne: user._id }, role: 'interviewer', department: user.department, roomNumber: user.roomNumber, tableNumber: user.tableNumber })
  : Promise.resolve([]);
const mateNames = mates => mates.map(m => m.fullName || m.username);

const onlineSockets = new Map();

// Sockets may connect anonymously (TV / public board); actions below check socket.user
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try { socket.user = jwt.verify(token, JWT_SECRET); } catch (e) { /* treat as anonymous */ }
  }
  next();
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  let socketUsername = null;

  socket.on('user_online', () => {
    if (!socket.user || !socket.user.username) return;
    socketUsername = socket.user.username;
    onlineSockets.set(socket.id, socketUsername);
    io.emit('online_users', Array.from(new Set(onlineSockets.values())));
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socketUsername) {
      onlineSockets.delete(socket.id);
      io.emit('online_users', Array.from(new Set(onlineSockets.values())));
    }
  });

  // Candidate checks in
  socket.on('candidate_checkin', async (data) => {
    try {
      // Candidates can only check themselves in
      if (!data || !socket.user || socket.user.role !== 'candidate' || data.interviewCode !== socket.user.interviewCode) return;
      let query = { interviewCode: data.interviewCode };
      if (data.department) query.department = data.department;
      
      const candidate = await Candidate.findOne(query);
      if (!candidate) return;
      if (candidate.status === 'active' || !candidate.status) {
        candidate.status = 'waiting';
        candidate.checkInTime = new Date();
        await candidate.save();
        io.emit('board_update');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Candidate acknowledges moving
  socket.on('candidate_moving_ack', async (data) => {
    // Just a signal if needed
  });

  // Interviewer confirms candidate arrived
  socket.on('interviewer_confirm_presence', async (data) => {
    try {
      if (!data || !socket.user || socket.user.role === 'candidate') return;
      let query = { interviewCode: data.interviewCode };
      if (data.department) query.department = data.department;
      const candidate = await Candidate.findOne(query);
      if (candidate && candidate.status === 'moving') {
        candidate.status = 'interviewing';
        await candidate.save();
        io.emit('board_update');
      }
    } catch (err) {
      console.error(err);
    }
  });
});

// Unified Login API
app.post('/api/login', async (req, res) => {
  let { code, tableNumber, roomNumber, department } = req.body;
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ success: false, message: 'Thiếu mã đăng nhập' });
  }
  code = code.trim().toUpperCase();
  
  try {
    // 1. Check if Candidate
    let candidates = await Candidate.find({ interviewCode: code });
    if (candidates.length > 0) {
      if (candidates.every(c => c.status === 'completed')) {
        return res.json({ success: true, role: 'candidate_completed', message: 'Cảm ơn bạn đã tham gia phỏng vấn' });
      }
      
      let pendingCandidates = candidates.filter(c => c.status !== 'completed');
      
      if (pendingCandidates.length === 1) {
        const selectedCand = pendingCandidates[0];
        const token = jwt.sign({ id: selectedCand._id, role: 'candidate', interviewCode: selectedCand.interviewCode }, JWT_SECRET, { expiresIn: '12h' });
        return res.json({ success: true, role: 'candidate', interviewCode: selectedCand.interviewCode, department: selectedCand.department, applicationData: selectedCand.applicationData, token });
      } else if (pendingCandidates.length > 1) {
        if (!department) {
          return res.json({ success: true, requireDepartment: true, departments: pendingCandidates.map(c => c.department) });
        }
        let selectedCand = pendingCandidates.find(c => c.department === department);
        if (selectedCand) {
          const token = jwt.sign({ id: selectedCand._id, role: 'candidate', interviewCode: selectedCand.interviewCode }, JWT_SECRET, { expiresIn: '12h' });
          return res.json({ success: true, role: 'candidate', interviewCode: selectedCand.interviewCode, department: selectedCand.department, applicationData: selectedCand.applicationData, token });
        } else {
          return res.status(400).json({ success: false, message: 'Ban đã chọn không hợp lệ hoặc đã phỏng vấn xong.' });
        }
      }
    }

    // 2. Check if Staff (case-insensitive)
    const escapedCode = code.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    let user = await User.findOne({ username: { $regex: new RegExp(`^${escapedCode}$`, 'i') } });
    if (user) {
        const { password } = req.body;
        
        if (!password) {
          return res.json({ success: true, requirePassword: true });
        }
        
        if (!STAFF_PASSWORD) {
          return res.status(503).json({ success: false, message: 'Hệ thống chưa cấu hình mật khẩu nhân sự (STAFF_PASSWORD).' });
        }
        if (!safeEqual(password, STAFF_PASSWORD)) {
          return res.status(401).json({ success: false, message: 'Sai mật khẩu!' });
        }

      let tableMates = [];
      if (user.role === 'interviewer') {
        if (tableNumber) user.tableNumber = String(tableNumber).trim();
        if (roomNumber) user.roomNumber = String(roomNumber).trim();
        user.status = 'active';
        await user.save();
        io.emit('staff_update');
        tableMates = mateNames(await findTableMates(user));
      }
      
      const token = jwt.sign({ id: user._id, role: user.role, roles: user.roles, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
      return res.json({ 
        success: true, 
        role: user.role, 
        username: user.username,
        fullName: user.fullName,
        department: user.department,
        roles: user.roles,
        tableNumber: user.tableNumber,
        roomNumber: user.roomNumber,
        autoAssign: user.autoAssign,
        tableMates,
        token
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid code or user not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fields safe to show on public screens (no phone/email/answers from applicationData)
const publicCandidateFields = () => {
  const fields = { interviewCode: 1, status: 1, department: 1, assignedRoom: 1, assignedTable: 1, checkInTime: 1 };
  orgConfig.candidate.nameFields.forEach(f => { fields[`applicationData.${f}`] = 1; });
  return fields;
};

// Public route (no auth middleware): staff tokens get full candidate data, everyone else the public fields
app.get('/api/board', async (req, res) => {
  try {
    const { department } = req.query;
    const filter = department ? { department } : {};
    let isStaff = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try { isStaff = jwt.verify(authHeader.split(' ')[1], JWT_SECRET).role !== 'candidate'; } catch (e) { /* anonymous */ }
    }
    const find = (q) => {
      const query = Candidate.find({ ...q, ...filter });
      return isStaff ? query : query.select(publicCandidateFields());
    };
    const [waiting, moving, interviewing, completed] = await Promise.all([
      find({ status: 'waiting' }).sort({ checkInTime: 1 }),
      find({ status: 'moving' }),
      find({ status: 'interviewing' }),
      find({ status: 'completed' })
    ]);
    res.json({ waiting, moving, interviewing, completed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tv-board', async (req, res) => {
  const { department } = req.query;
  const filter = department ? { department } : {};
  
  const fields = publicCandidateFields();
  const waiting = await Candidate.find({ status: 'waiting', ...filter }).select(fields).sort({ checkInTime: 1 }).lean();
  const moving = await Candidate.find({ status: 'moving', ...filter }).select(fields).lean();
  const interviewing = await Candidate.find({ status: 'interviewing', ...filter }).select(fields).lean();
  res.json({ waiting, moving, interviewing });
});

app.post('/api/evaluation', requireStaff('interviewer'), async (req, res) => {
  const { interviewCode, department, scores, notes, result } = req.body;
  const interviewerUsername = req.staff.username;
  try {
    if (!isValidResult(result)) return res.status(400).json({ success: false, message: 'Kết quả đánh giá không hợp lệ' });
    const scoreList = [];
    for (const c of orgConfig.evaluation.criteria) {
      const score = Number(scores && scores[c.key]);
      if (!Number.isFinite(score) || score < c.min || score > c.max) {
        return res.status(400).json({ success: false, message: `Điểm "${c.label}" phải từ ${c.min} đến ${c.max}` });
      }
      scoreList.push({ key: c.key, label: c.label, score });
    }
    const candidate = await Candidate.findOne({ interviewCode, department });
    if (!candidate) return res.status(404).json({ success: false, message: 'Không tìm thấy ứng viên' });
    const me = req.staff;
    // Claim atomically: with two devices at one table only the first submission is accepted
    const claimed = await Candidate.findOneAndUpdate(
      { _id: candidate._id, status: { $in: ['moving', 'interviewing'] }, assignedRoom: me.roomNumber, assignedTable: me.tableNumber },
      { $set: { status: 'completed', interviewEndTime: new Date() } },
      { returnDocument: 'before' }
    );
    if (!claimed) {
      const prev = await Evaluation.findOne({ interviewCode, department }).sort({ createdAt: -1 }).lean();
      const by = prev && (await User.findOne({ username: prev.interviewerUsername }).lean());
      const message = prev
        ? `Ứng viên đã được chấm bởi ${(by && by.fullName) || prev.interviewerUsername}`
        : 'Ứng viên không còn ở bàn của bạn';
      return res.status(409).json({ success: false, message });
    }
    const averageScore = Math.round(scoreList.reduce((a, s) => a + s.score, 0) / scoreList.length * 10) / 10;
    try {
      await new Evaluation({ interviewCode, department, interviewerUsername, scores: scoreList, averageScore, notes, result }).save();
    } catch (err) {
      await Candidate.updateOne({ _id: candidate._id }, { $set: { status: claimed.status, interviewEndTime: claimed.interviewEndTime ?? null } });
      throw err;
    }

    // Free everyone at this table, not only the scorer
    await User.updateMany(
      { $or: [{ _id: me._id }, { role: 'interviewer', department: me.department, roomNumber: me.roomNumber, tableNumber: me.tableNumber, status: 'interviewing' }] },
      { $set: { status: 'active' } }
    );

    io.emit('board_update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/staff/leave', requireStaff(), async (req, res) => {
  try {
    const user = req.staff;
    // Bỏ gán ứng viên hiện tại nếu đang pv dở
    if (user.tableNumber && user.roomNumber && (await findTableMates(user)).length === 0) {
      await Candidate.updateMany(
        { assignedTable: user.tableNumber, assignedRoom: user.roomNumber, department: user.department, status: { $in: ['moving', 'interviewing'] } },
        { $set: { status: 'waiting', assignedTable: null, assignedRoom: null, checkInTime: new Date(0) } }
      );
    }
    
    user.tableNumber = null;
    user.roomNumber = null;
    user.status = 'active';
    await user.save();
    io.emit('board_update');
    io.emit('staff_update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/status', requireStaff(), async (req, res) => {
  const { status } = req.body;
  if (!['active', 'break'].includes(status)) return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
  try {
    const user = req.staff;
    user.status = status;
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/clean-data', async (req, res) => {
  const { password } = req.body;
  const expectedPassword = process.env.ADMIN_CLEAN_PASSWORD;
  if (!expectedPassword) {
    return res.status(503).json({ success: false, message: 'Chưa cấu hình ADMIN_CLEAN_PASSWORD trên server.' });
  }
  // 403, not 401: the frontend treats any 401 as "session expired" and logs the admin out
  if (!password || !safeEqual(password, expectedPassword)) {
    return res.status(403).json({ success: false, message: 'Sai mật khẩu!' });
  }
  try {
    await Evaluation.deleteMany({});
    await Candidate.updateMany({}, {
      $set: { 
        status: 'active', 
        assignedRoom: null,
        assignedTable: null,
        checkInTime: null,
        interviewEndTime: null
      }
    });
    await User.updateMany({ role: 'interviewer' }, {
      $set: { status: 'active' }
    });
    await Message.deleteMany({});
    io.emit('board_update');
    io.emit('chat_history', []);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/candidates', requireStaff('receptionist'), async (req, res) => {
  try {
    const cands = await Candidate.find().sort({ checkInTime: -1 }).lean();
    res.json(cands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/evaluations', requireStaff('admin'), async (req, res) => {
  try {
    const { department } = req.query;
    const evalFilter = department ? { department } : {};
    const candidateFilter = department ? { department } : {};

    // Run all 3 queries in parallel instead of sequentially
    const [evals, candidates, users] = await Promise.all([
      Evaluation.find(evalFilter).sort({ createdAt: -1 }).lean(),
      // Only fetch the fields needed for name lookup, skip heavy applicationData
      Candidate.find(candidateFilter).select(['interviewCode', ...orgConfig.candidate.nameFields.map(f => `applicationData.${f}`)]).lean(),
      User.find().select('username fullName').lean()
    ]);

    const candidateMap = {};
    candidates.forEach(c => {
      candidateMap[c.interviewCode] = getCandidateName(c) || c.interviewCode;
    });

    const userMap = {};
    users.forEach(u => userMap[u.username] = u.fullName || u.username);

    const enrichedEvals = evals.map(e => ({
      ...e,
      candidateName: candidateMap[e.interviewCode] || e.interviewCode,
      interviewerName: userMap[e.interviewerUsername] || e.interviewerUsername
    }));

    res.json(enrichedEvals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chat APIs
app.get('/api/staff', requireStaff(), async (req, res) => {
  try {
    const staff = await User.find({ status: { $ne: null } }).select('-password');
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', requireStaff(), async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(100);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages', requireStaff(), async (req, res) => {
  try {
    const { receiver, content } = req.body;
    const sender = req.staff.username;
    const senderRole = req.staff.role;
    if (typeof receiver !== 'string' || !receiver || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Thiếu người nhận hoặc nội dung' });
    }
    
    // Group chat requires admin privileges
    if (receiver.startsWith('group')) {
      if (!hasRole(req.staff, 'admin')) {
        return res.status(403).json({ error: 'Only admins can send group messages' });
      }
    }

    const msg = new Message({ sender, senderRole, receiver, content });
    await msg.save();
    io.emit('new_message', msg);
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/read', requireStaff(), async (req, res) => {
  try {
    const { receiver } = req.body; // what chat is being read (sender username or 'group_XYZ')
    const username = req.staff.username;
    if (typeof receiver !== 'string') return res.status(400).json({ error: 'Thiếu receiver' });
    let filter = {};
    if (receiver.startsWith('group')) {
      filter = { receiver: receiver };
    } else {
      filter = { sender: receiver, receiver: username };
    }
    
    await Message.updateMany(
      { ...filter, readBy: { $ne: username } },
      { $push: { readBy: username } }
    );
    io.emit('messages_read', { reader: username, receiver });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// New APIs for Custom Workflow
// ----------------------------------------------------

app.post('/api/interviewer/settings', requireStaff('interviewer'), async (req, res) => {
  const { autoAssign } = req.body;
  if (autoAssign && !orgConfig.autoAssign) {
    return res.status(400).json({ success: false, message: 'Chế độ tự động gọi đã bị tắt' });
  }
  try {
    const user = req.staff;
    user.autoAssign = !!autoAssign;
    await user.save();
    res.json({ success: true, autoAssign: user.autoAssign });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/interviewer/cancel', requireStaff('interviewer'), async (req, res) => {
  const { interviewCode } = req.body;
  try {
    const interviewer = req.staff;

    const candidate = await Candidate.findOneAndUpdate(
      { 
        interviewCode,
        department: interviewer.department,
        status: { $in: ['moving', 'interviewing'] } 
      },
      { 
        $set: { 
          status: 'waiting', 
          assignedTable: null, 
          assignedRoom: null, 
          checkInTime: new Date(0) 
        } 
      },
      { returnDocument: 'after' }
    );
    if (!candidate) return res.status(400).json({ success: false, message: 'Ứng viên không trong trạng thái đang gọi/phỏng vấn' });

    await User.updateOne({ _id: interviewer._id }, { status: 'active' });

    io.emit('board_update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/interviewer/call', requireStaff('interviewer'), async (req, res) => {
  const { interviewCode } = req.body;
  try {
    const interviewer = req.staff;
    if (!interviewer.tableNumber || !interviewer.roomNumber) return res.status(400).json({ success: false, message: 'Người phỏng vấn chưa có số phòng/bàn. Vui lòng đăng nhập lại và nhập số phòng, số bàn.' });
    if (interviewer.status === 'break') return res.status(400).json({ success: false, message: 'Người phỏng vấn đang tạm nghỉ. Vui lòng bật lại trạng thái sẵn sàng.' });

    // Auto-repair: if interviewer is stuck in 'interviewing' but no one is at their table, reset them
    if (interviewer.status === 'interviewing') {
      const reallyBusy = await Candidate.findOne({
        department: interviewer.department,
        assignedRoom: interviewer.roomNumber,
        assignedTable: interviewer.tableNumber,
        status: { $in: ['moving', 'interviewing'] }
      });
      if (!reallyBusy) {
        await User.updateOne({ _id: interviewer._id }, { status: 'active' });
        interviewer.status = 'active';
      }
    }

    const busyCandidate = await Candidate.findOne({
        department: interviewer.department,
        assignedRoom: interviewer.roomNumber,
        assignedTable: interviewer.tableNumber,
        status: { $in: ['moving', 'interviewing'] }
      });
    if (busyCandidate) return res.status(400).json({ success: false, message: 'Bàn này đang có người phỏng vấn!' });

    const candidate = await Candidate.findOneAndUpdate(
      { interviewCode, status: 'waiting', department: interviewer.department },
      { $set: { status: 'moving', assignedRoom: interviewer.roomNumber, assignedTable: interviewer.tableNumber } },
      { returnDocument: 'after' }
    );
    if (!candidate) return res.status(400).json({ success: false, message: 'Candidate no longer available in your department' });

    await User.updateOne({ _id: interviewer._id }, { status: 'interviewing' });

    io.emit('candidate_assigned', { candidate, roomNumber: interviewer.roomNumber, tableNumber: interviewer.tableNumber });
    io.emit('board_update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/staff/switch-role', requireStaff(), async (req, res) => {
  const { targetRole, tableNumber, roomNumber } = req.body;
  try {
    const user = req.staff;
    if (!['interviewer', 'admin', 'receptionist'].includes(targetRole)) {
      return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ' });
    }
    
    // User can switch to targetRole if they have it in their roles array (admins can switch to any role)
    if (!(user.roles && user.roles.includes(targetRole)) && !hasRole(user, 'admin')) {
      return res.status(403).json({ success: false, message: 'Not allowed to switch to this role' });
    }

    const table = String(tableNumber ?? '').trim();
    const room = String(roomNumber ?? '').trim();
    if (targetRole === 'interviewer' && (!table || !room)) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập số phòng và số bàn' });
    }

    if (user.role === 'interviewer' && targetRole !== 'interviewer') {
      // Leaving the interviewer seat: refuse mid-interview, otherwise free the table so auto-assign skips it
      const busy = (await findTableMates(user)).length === 0 && (user.status === 'interviewing' || (user.tableNumber && user.roomNumber && await Candidate.exists({
        assignedTable: user.tableNumber, assignedRoom: user.roomNumber, department: user.department, status: { $in: ['moving', 'interviewing'] },
      })));
      if (busy) return res.status(409).json({ success: false, message: 'Đang có ứng viên ở bàn, hãy hoàn tất trước khi đổi vai trò' });
      user.tableNumber = null;
      user.roomNumber = null;
      user.status = 'active';
    }

    user.role = targetRole;
    if (targetRole === 'interviewer') {
      user.tableNumber = table;
      user.roomNumber = room;
    }
    await user.save();
    io.emit('staff_update');
    io.emit('board_update');
    const newToken = jwt.sign({ id: user._id, role: user.role, roles: user.roles, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
    const tableMates = user.role === 'interviewer' ? mateNames(await findTableMates(user)) : [];
    res.json({ success: true, role: user.role, tableNumber: user.tableNumber, roomNumber: user.roomNumber, tableMates, token: newToken });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


const VALID_ROLES = ['interviewer', 'admin', 'receptionist'];

app.get('/api/users', requireStaff('admin'), async (req, res) => {
  const users = await User.find().lean();
  res.json(users);
});

app.post('/api/users/update', requireStaff('admin'), async (req, res) => {
  const { username, roles, department } = req.body;
  if (roles && (!Array.isArray(roles) || roles.some(r => !VALID_ROLES.includes(r)))) {
    return res.status(400).json({ success: false, error: 'Quyền không hợp lệ' });
  }
  const u = await User.findOne({ username });
  if (u) {
    if (roles) {
      u.roles = roles;
      if (roles.includes('admin')) u.role = 'admin';
      else if (roles.includes('receptionist')) u.role = 'receptionist';
      else if (roles.includes('interviewer')) u.role = 'interviewer';
    }
    if (department) {
      if (!isValidDepartment(department)) return res.status(400).json({ success: false, error: 'Ban không hợp lệ' });
      u.department = department;
    }
    await u.save();
  }
  res.json({ success: true });
});

app.post('/api/users/add', requireStaff('admin'), async (req, res) => {
  try {
    const { username, fullName, department, roles } = req.body;
    if (!username) return res.status(400).json({ error: "Thiếu username" });
    if (roles && (!Array.isArray(roles) || roles.some(r => !VALID_ROLES.includes(r)))) return res.status(400).json({ error: "Quyền không hợp lệ" });
    if (department && !isValidDepartment(department)) return res.status(400).json({ error: "Ban không hợp lệ" });
    
    let u = await User.findOne({ username });
    if (u) return res.status(400).json({ error: "Tài khoản đã tồn tại" });
    
    u = new User({
      username,
      fullName: fullName || username,
      department: department || defaultDepartment,
      roles: roles || ["interviewer"],
      role: staffImporter.pickRole(roles && roles.length ? roles : ["interviewer"])
    });
    await u.save();
    res.json({ success: true, user: u });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:username', requireStaff('admin'), async (req, res) => {
  try {
    const { username } = req.params;
    if (username === req.staff.username) {
      return res.status(400).json({ error: "Không thể tự xóa tài khoản của mình" });
    }
    await User.deleteOne({ username });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- Admin Excel import/export (the browser parses/builds the .xlsx, the server sees JSON rows) ---
const importError = (res, p) => res.status(p.status || 400).json({ success: false, message: p.error });
const rowsGiven = rows => Array.isArray(rows) && rows.length > 0;

app.post('/api/admin/import/candidates', async (req, res) => {
  try {
    const { department, codeColumn, rows, replace, dryRun } = req.body;
    if (!rowsGiven(rows)) return importError(res, { error: 'File không có dòng dữ liệu nào' });
    const opts = { department, codeColumn: codeColumn || undefined, rows, replace: !!replace };
    // The confirm step re-plans against the current database instead of trusting the preview
    const p = await candidateImporter.plan(opts);
    if (p.error) return importError(res, p);
    if (dryRun) {
      return res.json({
        success: true, dryRun: true,
        create: p.create.length, update: p.update.length, unchanged: p.unchanged, skipped: p.skipped, remove: p.remove,
        preview: { create: p.create.map(c => c.interviewCode), update: p.update.map(c => c.interviewCode) },
      });
    }
    const done = await candidateImporter.apply(department, p);
    io.emit('board_update');
    res.json({ success: true, ...done, unchanged: p.unchanged, skipped: p.skipped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/import/staff', async (req, res) => {
  try {
    const { rows, removeMissing, dryRun } = req.body;
    if (!rowsGiven(rows)) return importError(res, { error: 'File không có dòng dữ liệu nào' });
    const p = await staffImporter.plan({ rows, removeMissing: !!removeMissing, actor: req.staff.username });
    if (p.error) return importError(res, p);
    if (dryRun) {
      return res.json({
        success: true, dryRun: true,
        create: p.create.length, update: p.update.length, unchanged: p.unchanged, skipped: p.skipped, remove: p.remove,
        preview: { create: p.create.map(u => u.username), update: p.update.map(u => u.username) },
      });
    }
    const done = await staffImporter.apply(p);
    io.emit('staff_update');
    res.json({ success: true, ...done, unchanged: p.unchanged, skipped: p.skipped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/export/staff', async (req, res) => {
  try {
    const users = await User.find().sort({ department: 1, username: 1 }).lean();
    res.json({
      columns: ['username', 'fullName', 'department', 'roles'],
      rows: users.map(u => ({ username: u.username, fullName: u.fullName, department: u.department, roles: (u.roles || []).join(',') })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const HT = candidateImporter.SYSTEM_PREFIX;
const CANDIDATE_SYSTEM_COLUMNS = ['Đơn vị', 'Trạng thái', 'Giờ check-in', 'Phòng', 'Bàn', 'Người phỏng vấn', 'Điểm TB', 'Kết quả'].map(c => HT + c);

app.get('/api/admin/export/candidates', async (req, res) => {
  try {
    const { department } = req.query;
    const candidates = await Candidate.find(department ? { department } : {}).sort({ department: 1, interviewCode: 1 }).lean();
    const evaluations = await Evaluation.find({ interviewCode: { $in: candidates.map(c => c.interviewCode) } }).sort({ createdAt: 1 }).lean();
    const latestEval = new Map(evaluations.map(e => [`${e.department}:${e.interviewCode}`, e])); // later ones overwrite
    const names = new Map((await User.find().select('username fullName').lean()).map(u => [u.username, u.fullName]));

    // Columns in order of first appearance; the code column leads so the file re-imports as is
    const codeLabel = orgConfig.candidate.codeLabel;
    const dataColumns = [];
    for (const c of candidates) for (const k of Object.keys(c.applicationData || {})) if (!dataColumns.includes(k)) dataColumns.push(k);
    const columns = [codeLabel, ...dataColumns.filter(k => k !== codeLabel), ...CANDIDATE_SYSTEM_COLUMNS];

    const rows = candidates.map(c => {
      const e = latestEval.get(`${c.department}:${c.interviewCode}`);
      const checkIn = c.checkInTime && new Date(c.checkInTime).getTime() > 0 ? new Date(c.checkInTime).toISOString() : '';
      return {
        ...c.applicationData,
        [codeLabel]: (c.applicationData && c.applicationData[codeLabel]) || c.interviewCode,
        [HT + 'Đơn vị']: c.department,
        [HT + 'Trạng thái']: c.status,
        [HT + 'Giờ check-in']: checkIn,
        [HT + 'Phòng']: c.assignedRoom || '',
        [HT + 'Bàn']: c.assignedTable || '',
        [HT + 'Người phỏng vấn']: e ? (names.get(e.interviewerUsername) || e.interviewerUsername) : '',
        [HT + 'Điểm TB']: e ? e.averageScore : '',
        [HT + 'Kết quả']: e ? e.result : '',
      };
    });
    res.json({ columns, rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Serve static frontend files
const buildPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(buildPath));


app.post('/api/candidates/reset-checkin', requireStaff('admin'), async (req, res) => {
  const { interviewCode, department } = req.body;
  try {
    const candidate = await Candidate.findOne({ interviewCode, department });
    if (!candidate) return res.status(404).json({ success: false, message: 'Không tìm thấy ứng viên' });
    
    // Reset check-in data only - keep applicationData intact so they can re-login and check-in
    candidate.status = 'active';
    candidate.checkInTime = null;
    candidate.assignedRoom = null;
    candidate.assignedTable = null;
    await candidate.save();
    
    io.emit('board_update');
    res.json({ success: true, message: 'Đã xóa check-in thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/candidates/checkin', requireStaff('receptionist'), async (req, res) => {
  let { interviewCode, department } = req.body;
  if (interviewCode) interviewCode = interviewCode.trim().toUpperCase();

  try {
    let candidate = await Candidate.findOne({ interviewCode, department });
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Không có thông tin bạn đó trúng tuyển vào ban này!' });
    }
    if (candidate.status === 'active' || !candidate.status) {
      candidate.status = 'waiting';
      candidate.checkInTime = new Date();
      await candidate.save();
      io.emit('board_update');
      return res.json({ success: true, message: 'Check-in thành công!', candidate });
    } else {
      return res.status(400).json({ success: false, message: 'Ứng viên này đã check-in rồi!' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/candidates/add', requireStaff('receptionist'), async (req, res) => {
    try {
      const { interviewCode, fullName } = req.body;
      const department = req.body.department || defaultDepartment;
      if (!interviewCode) return res.status(400).json({ error: "Thiếu Mã Ứng Viên" });
      if (!isValidDepartment(department)) return res.status(400).json({ error: "Ban không hợp lệ" });
      
      let candidate = await Candidate.findOne({ interviewCode, department });
      if (candidate) return res.status(400).json({ error: `Mã Ứng Viên đã tồn tại trong ban ${department}` });
    
    candidate = new Candidate({
      interviewCode,
      department,
      status: "active",
      applicationData: { [orgConfig.candidate.nameFields[0]]: fullName || "" }
    });
    
    await candidate.save();
    res.json({ success: true, candidate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
