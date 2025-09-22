require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../dashboard')));

const MONGODB_URI = process.env.MONGODB_URI || 'your_mongodb_connection_string';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error", err));

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  studentId: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  department: { type: String, required: true },
  year: { type: Number, required: true },
  labId: { type: String, required: true }
});

studentSchema.methods.verifyPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

const Student = mongoose.model('Student', studentSchema);

const sessionSchema = new mongoose.Schema({
  studentName: String,
  studentId: String,
  computerName: String,
  labId: String,
  systemNumber: String,
  loginTime: { type: Date, default: Date.now },
  logoutTime: Date,
  duration: Number,
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  screenshot: String
});

const Session = mongoose.model('Session', sessionSchema);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

app.post('/api/student-register', async (req, res) => {
  try {
    const { name, studentId, email, password, dateOfBirth, department, year, labId } = req.body;
    if (!name || !studentId || !email || !password || !dateOfBirth || !department || !year || !labId)
      return res.status(400).json({ success: false, error: "Missing required fields." });

    const existing = await Student.findOne({ $or: [{ studentId }, { email }] });
    if (existing) return res.status(400).json({ success: false, error: "Student ID or email already exists." });

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const student = new Student({ name, studentId, email, passwordHash, dateOfBirth, department, year, labId });
    await student.save();
    res.json({ success: true, message: "Student registered successfully." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/student-authenticate', async (req, res) => {
  try {
    const { studentId, password, labId } = req.body;
    const student = await Student.findOne({ studentId, labId });
    if (!student) return res.status(400).json({ success: false, error: "Invalid student or lab" });

    const isValid = await student.verifyPassword(password);
    if (!isValid) return res.status(400).json({ success: false, error: "Incorrect password" });

    res.json({ success: true, student: { name: student.name, studentId: student.studentId, email: student.email, department: student.department, year: student.year, labId: student.labId } });
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/student-login', async (req, res) => {
  try {
    const { studentName, studentId, computerName, labId, systemNumber } = req.body;

    // Finish any existing active sessions on this computer
    await Session.updateMany({ computerName, status: 'active' }, { status: 'completed', logoutTime: new Date() });

    const newSession = new Session({ studentName, studentId, computerName, labId, systemNumber, loginTime: new Date(), status: 'active' });
    await newSession.save();

    io.emit('student-login', { sessionId: newSession._id, studentName, studentId, computerName, labId, systemNumber, loginTime: newSession.loginTime });
    res.json({ success: true, sessionId: newSession._id });
  } catch (error) {
    console.error("Session login error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/student-logout', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await Session.findById(sessionId);
    if (session) {
      session.status = 'completed';
      session.logoutTime = new Date();
      session.duration = Math.floor((session.logoutTime - session.loginTime) / 1000);
      await session.save();

      io.emit('student-logout', { sessionId, studentName: session.studentName, computerName: session.computerName, logoutTime: session.logoutTime, duration: session.duration });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Session logout error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update session screenshot and emit to all connected clients
app.post('/api/update-screenshot', async (req, res) => {
  try {
    const { sessionId, screenshot } = req.body;
    await Session.findByIdAndUpdate(sessionId, { screenshot });
    io.emit('screenshot-update', { sessionId, screenshot, timestamp: new Date() });
    res.json({ success: true });
  } catch (error) {
    console.error("Screenshot update error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active sessions filtered by lab
app.get('/api/active-sessions/:labId', async (req, res) => {
  try {
    const labIdParam = req.params.labId.toLowerCase();
    let filter = { status: 'active' };
    if (labIdParam !== 'all') {
      filter.labId = labIdParam.toUpperCase();
    }
    const sessions = await Session.find(filter).sort({ loginTime: -1 });
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebSocket events
io.on('connection', (socket) => {
  console.log("Client connected:", socket.id);

  socket.on('computer-online', (data) => { console.log("Computer online:", data); });
  socket.on('screen-share', (data) => { socket.broadcast.emit('live-screen', data); });

  socket.on('disconnect', () => { console.log("Client disconnected:", socket.id); });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
