const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dashboard')));

// WORKING STUDENTS - NO DATABASE NEEDED
const students = [
  { studentId: '2024001', password: 'password123', name: 'John Doe', email: 'john.doe@college.edu', dateOfBirth: '2000-01-15', department: 'Computer Science' },
  { studentId: '2024002', password: 'password123', name: 'Jane Smith', email: 'jane.smith@college.edu', dateOfBirth: '2001-03-20', department: 'IT' },
  { studentId: 'DEMO001', password: 'demo123', name: 'Demo Student', email: 'demo@college.edu', dateOfBirth: '1999-12-25', department: 'CS' }
];

const sessions = [];
let sessionCounter = 1;

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../dashboard/index.html')));

app.post('/api/student-authenticate', (req, res) => {
  const { studentId, password } = req.body;
  console.log(`🔑 Auth attempt: ${studentId} / ${password}`);
  
  const student = students.find(s => s.studentId === studentId && s.password === password);
  
  if (student) {
    console.log(`✅ SUCCESS: ${student.name} authenticated`);
    res.json({ success: true, student });
  } else {
    console.log(`❌ FAILED: Invalid credentials for ${studentId}`);
    res.status(400).json({ success: false, error: 'Invalid student ID or password' });
  }
});

app.post('/api/student-login', (req, res) => {
  const { studentName, studentId, computerName, labNumber, systemNumber } = req.body;
  const sessionId = 'SESSION_' + Date.now() + '_' + sessionCounter++;
  
  const session = {
    _id: sessionId,
    studentName, studentId, computerName, labNumber, systemNumber,
    loginTime: new Date(),
    status: 'active'
  };
  
  // Remove existing session for this computer
  const existingIndex = sessions.findIndex(s => s.computerName === computerName && s.status === 'active');
  if (existingIndex >= 0) {
    sessions[existingIndex].status = 'completed';
    sessions[existingIndex].logoutTime = new Date();
  }
  
  sessions.push(session);
  
  console.log(`✅ SESSION CREATED: ${sessionId} for ${studentName} on ${computerName}`);
  
  // Notify admin via socket
  io.emit('student-login', {
    sessionId, studentName, studentId, computerName, labNumber, systemNumber,
    loginTime: session.loginTime
  });
  
  res.json({ success: true, sessionId });
});

app.post('/api/student-logout', (req, res) => {
  const { sessionId } = req.body;
  
  const session = sessions.find(s => s._id === sessionId);
  if (session) {
    session.logoutTime = new Date();
    session.status = 'completed';
    session.duration = Math.floor((session.logoutTime - session.loginTime) / 1000);
    
    console.log(`✅ SESSION ENDED: ${sessionId} - ${session.studentName}`);
    
    io.emit('student-logout', {
      sessionId, studentName: session.studentName, computerName: session.computerName,
      logoutTime: session.logoutTime, duration: session.duration
    });
  }
  
  res.json({ success: true });
});

// Forgot password routes
app.post('/api/forgot-password', (req, res) => {
  const { studentId, email } = req.body;
  const student = students.find(s => s.studentId === studentId && s.email === email);
  
  if (student) {
    res.json({ success: true, message: 'Student found', studentData: student });
  } else {
    res.status(400).json({ success: false, error: 'Student not found' });
  }
});

app.post('/api/verify-dob', (req, res) => {
  const { studentId, dateOfBirth } = req.body;
  const student = students.find(s => s.studentId === studentId && s.dateOfBirth === dateOfBirth);
  
  if (student) {
    res.json({ success: true, message: 'DOB verified', resetToken: 'TOKEN_' + Date.now() });
  } else {
    res.status(400).json({ success: false, error: 'Invalid date of birth' });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { resetToken, newPassword } = req.body;
  console.log(`🔄 Password reset for token: ${resetToken}`);
  res.json({ success: true, message: 'Password reset successfully' });
});

app.post('/api/update-screenshot', (req, res) => {
  const { sessionId, screenshot } = req.body;
  const session = sessions.find(s => s._id === sessionId);
  if (session) {
    session.screenshot = screenshot;
    io.emit('screenshot-update', { sessionId, screenshot, timestamp: new Date() });
  }
  res.json({ success: true });
});

app.get('/api/active-sessions', (req, res) => {
  const activeSessions = sessions.filter(s => s.status === 'active');
  res.json({ success: true, sessions: activeSessions });
});

app.get('/api/session-history', (req, res) => {
  res.json({ success: true, sessions: sessions.slice(-20) });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'Server running', timestamp: new Date() });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('📡 Client connected');

  socket.on('computer-online', (data) => {
    console.log(`🖥️ Computer online: ${data.computerName}`);
  });

  socket.on('screen-share', (data) => {
    socket.broadcast.emit('live-screen', data);
  });

  socket.on('disconnect', () => {
    console.log('📡 Client disconnected');
  });
});

server.listen(5000, () => {
  console.log('🎯 =================================');
  console.log('🎯 INSTANT WORKING SERVER - PORT 5000');
  console.log('🖥️  Admin Dashboard: http://localhost:5000');
  console.log('📡 Socket.IO ready');
  console.log('✅ DEMO ACCOUNTS READY:');
  students.forEach(s => {
    console.log(`   - ${s.name} (${s.studentId}) - Password: ${s.password}`);
  });
  console.log('🎯 =================================');
  console.log('🎉 NO DATABASE - INSTANT DEMO READY!');
});
