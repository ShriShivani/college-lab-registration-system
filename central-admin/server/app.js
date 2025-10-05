require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// NEW: CSV Import Dependencies (using secure ExcelJS instead of xlsx)
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const ExcelJS = require('exceljs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../dashboard')));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://srijaaanandhan12_db_user:122007@cluster0.2kzkkpe.mongodb.net/college-lab-registration?retryWrites=true&w=majority';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;

// Enhanced MongoDB Connection with Connection Pooling
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
})
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Student Schema
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  studentId: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String },
  dateOfBirth: { type: Date, required: true },
  department: { type: String, required: true },
  year: { type: Number, required: true },
  labId: { type: String, required: true },
  isPasswordSet: { type: Boolean, default: false },
  registeredAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

studentSchema.methods.verifyPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

const Student = mongoose.model('Student', studentSchema);

// Session Schema
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

// CSV/Excel Import Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files (.csv, .xlsx, .xls) are allowed!'));
    }
  }
});

// Process CSV File
function processCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Process Excel File using ExcelJS (secure alternative to xlsx)
async function processExcelFile(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(1); // First worksheet
    const jsonData = [];
    
    // Get headers from first row
    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value ? cell.value.toString().trim() : '';
    });
    
    // Process data rows (skip header row)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row
      
      const rowData = {};
      let hasData = false;
      
      row.eachCell((cell, colNumber) => {
        if (headers[colNumber]) {
          let cellValue = '';
          if (cell.value !== null && cell.value !== undefined) {
            // Handle different cell value types
            if (cell.value instanceof Date) {
              cellValue = cell.value.toISOString().split('T')[0]; // Convert date to YYYY-MM-DD format
            } else if (typeof cell.value === 'object' && cell.value.text) {
              cellValue = cell.value.text; // Rich text
            } else {
              cellValue = cell.value.toString().trim();
            }
            hasData = true;
          }
          rowData[headers[colNumber]] = cellValue;
        }
      });
      
      // Only add row if it has data
      if (hasData && Object.values(rowData).some(val => val && val.length > 0)) {
        jsonData.push(rowData);
      }
    });
    
    return jsonData;
  } catch (error) {
    throw new Error('Error processing Excel file: ' + error.message);
  }
}

// Validate Student Data
function validateStudentData(rawData) {
  const validatedStudents = [];
  const seenIds = new Set();
  const seenEmails = new Set();
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    
    try {
      const student = {
        name: cleanString(row.name || row.Name || row.student_name || row['Student Name'] || row['Full Name']),
        studentId: cleanString(row.student_id || row.StudentID || row.id || row.ID || row['Student ID'] || row['Roll No']),
        email: cleanString(row.email || row.Email || row.email_address || row['Email Address']),
        dateOfBirth: parseDate(row.dob || row.date_of_birth || row.dateOfBirth || row['Date of Birth'] || row.DOB),
        department: cleanString(row.department || row.Department || row.dept || row.Dept || row['Department Name']),
        year: parseInt(row.year || row.Year || row.class_year || row['Year'] || row['Academic Year'] || 1),
        labId: cleanString(row.lab_id || row.labId || row.lab || row.Lab || row['Lab ID'] || 'LAB-01'),
        isPasswordSet: false,
        registeredAt: new Date(),
        updatedAt: new Date()
      };
      
      // Validate required fields
      if (!student.name || student.name.length < 2) {
        console.warn(`⚠️ Row ${i + 1}: Invalid or missing name`);
        continue;
      }
      
      if (!student.studentId || student.studentId.length < 3) {
        console.warn(`⚠️ Row ${i + 1}: Invalid or missing student ID`);
        continue;
      }
      
      if (!student.dateOfBirth || student.dateOfBirth.getFullYear() < 1980) {
        console.warn(`⚠️ Row ${i + 1}: Invalid date of birth`);
        continue;
      }
      
      if (!student.department || student.department.length < 2) {
        console.warn(`⚠️ Row ${i + 1}: Invalid or missing department`);
        continue;
      }
      
      // Check for duplicates in current batch
      if (seenIds.has(student.studentId.toUpperCase())) {
        console.warn(`⚠️ Row ${i + 1}: Duplicate student ID ${student.studentId}`);
        continue;
      }
      
      // Generate email if missing or invalid
      if (!student.email || !student.email.includes('@') || !student.email.includes('.')) {
        student.email = `${student.studentId.toLowerCase().replace(/[^a-z0-9]/g, '')}@college.edu`;
      }
      
      // Check for duplicate emails in current batch
      if (seenEmails.has(student.email.toLowerCase())) {
        // Generate unique email
        student.email = `${student.studentId.toLowerCase().replace(/[^a-z0-9]/g, '')}.${Date.now()}@college.edu`;
      }
      
      // Validate and normalize year
      if (isNaN(student.year) || student.year < 1 || student.year > 4) {
        student.year = 1;
      }
      
      // Normalize department names
      student.department = normalizeDepartment(student.department);
      
      // Normalize student ID (uppercase)
      student.studentId = student.studentId.toUpperCase();
      
      // Add to tracking sets
      seenIds.add(student.studentId);
      seenEmails.add(student.email.toLowerCase());
      
      validatedStudents.push(student);
      
    } catch (error) {
      console.warn(`⚠️ Row ${i + 1}: Validation error:`, error.message);
    }
  }
  
  return validatedStudents;
}

// Helper Functions
function cleanString(str) {
  if (!str) return '';
  return str.toString().trim().replace(/\s+/g, ' '); // Normalize whitespace
}

function parseDate(dateString) {
  if (!dateString) return new Date('2000-01-01');
  
  // Handle Excel date serial numbers
  if (typeof dateString === 'number' && dateString > 25000 && dateString < 50000) {
    // Excel serial date to JS date
    const date = new Date((dateString - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  
  const formats = [
    dateString.toString(),
    dateString.toString().replace(/[-/]/g, '-'),
    dateString.toString().replace(/[-/]/g, '/'),
  ];
  
  for (let format of formats) {
    const parsed = new Date(format);
    if (!isNaN(parsed.getTime()) && 
        parsed.getFullYear() > 1980 && 
        parsed.getFullYear() < 2015) {
      return parsed;
    }
  }
  
  return new Date('2000-01-01');
}

function normalizeDepartment(dept) {
  if (!dept) return 'General';
  
  const deptMap = {
    'cs': 'Computer Science',
    'cse': 'Computer Science',
    'computer': 'Computer Science',
    'it': 'Information Technology',
    'information': 'Information Technology',
    'ec': 'Electronics & Communication',
    'ece': 'Electronics & Communication',
    'electronics': 'Electronics & Communication',
    'me': 'Mechanical Engineering',
    'mechanical': 'Mechanical Engineering',
    'ce': 'Civil Engineering',
    'civil': 'Civil Engineering',
    'ee': 'Electrical Engineering',
    'electrical': 'Electrical Engineering',
    'ch': 'Chemical Engineering',
    'chemical': 'Chemical Engineering',
    'bt': 'Biotechnology',
    'bio': 'Biotechnology',
    'ai': 'Artificial Intelligence',
    'ml': 'Machine Learning',
    'ds': 'Data Science',
    'data': 'Data Science'
  };
  
  const normalized = dept.toLowerCase().trim();
  return deptMap[normalized] || dept;
}

// Import Students to Database
async function importStudentsToDatabase(students) {
  let successful = 0;
  let failed = 0;
  const errors = [];
  
  for (let student of students) {
    try {
      const existing = await Student.findOne({ 
        $or: [
          { studentId: student.studentId },
          { email: student.email }
        ]
      });
      
      if (existing) {
        // Update existing student (except password fields)
        await Student.findByIdAndUpdate(existing._id, {
          name: student.name,
          email: student.email,
          dateOfBirth: student.dateOfBirth,
          department: student.department,
          year: student.year,
          labId: student.labId,
          updatedAt: new Date()
          // Keep existing passwordHash and isPasswordSet
        });
        successful++;
        console.log(`✅ Updated existing student: ${student.studentId}`);
      } else {
        const newStudent = new Student(student);
        await newStudent.save();
        successful++;
        console.log(`✅ Added new student: ${student.studentId}`);
      }
      
    } catch (error) {
      failed++;
      errors.push(`${student.studentId || 'Unknown'}: ${error.message}`);
      console.error(`❌ Failed to import ${student.studentId}:`, error.message);
    }
  }
  
  return { successful, failed, errors };
}

// Serve admin dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

// Upload and Import Students from CSV/Excel
app.post('/api/import-students', upload.single('studentFile'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    console.log(`📁 Processing file: ${req.file.originalname} (${fileExtension})`);
    
    let studentsData = [];
    
    if (fileExtension === '.csv') {
      studentsData = await processCSVFile(filePath);
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      studentsData = await processExcelFile(filePath);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Unsupported file format. Please use CSV or Excel files.' 
      });
    }
    
    console.log(`📊 Raw data extracted: ${studentsData.length} rows`);
    
    const validatedStudents = validateStudentData(studentsData);
    
    console.log(`✅ Validated students: ${validatedStudents.length} records`);
    
    if (validatedStudents.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No valid student records found in file. Please check the format and required fields.' 
      });
    }
    
    const clearExisting = req.body.clearExisting === 'true';
    if (clearExisting) {
      const deletedCount = await Student.countDocuments();
      await Student.deleteMany({});
      console.log(`🗑️ Cleared ${deletedCount} existing student records`);
    }
    
    const importResult = await importStudentsToDatabase(validatedStudents);
    
    console.log(`✅ Import completed: ${importResult.successful} successful, ${importResult.failed} failed`);
    
    res.json({
      success: true,
      message: 'Students imported successfully',
      stats: {
        totalProcessed: studentsData.length,
        validatedRecords: validatedStudents.length,
        successful: importResult.successful,
        failed: importResult.failed,
        errors: importResult.errors.slice(0, 10) // Limit error messages
      }
    });
    
  } catch (error) {
    console.error('❌ Import error:', error);
    res.status(500).json({ 
      success: false, 
      error: `Import failed: ${error.message}` 
    });
  } finally {
    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.warn('⚠️ Failed to clean up uploaded file:', cleanupError.message);
      }
    }
  }
});

// Download Sample CSV Template
app.get('/api/download-template', (req, res) => {
  const sampleData = [
    {
      'Student ID': '2024CS001',
      'Name': 'John Doe',
      'Email': 'john.doe@college.edu',
      'Date of Birth': '2002-01-15',
      'Department': 'Computer Science',
      'Year': 3,
      'Lab ID': 'LAB-01'
    },
    {
      'Student ID': '2024IT002',
      'Name': 'Jane Smith',
      'Email': 'jane.smith@college.edu',
      'Date of Birth': '2001-08-22',
      'Department': 'Information Technology',
      'Year': 2,
      'Lab ID': 'LAB-02'
    },
    {
      'Student ID': '2024EC003',
      'Name': 'Mike Wilson',
      'Email': 'mike.wilson@college.edu',
      'Date of Birth': '2000-12-10',
      'Department': 'Electronics & Communication',
      'Year': 4,
      'Lab ID': 'LAB-03'
    },
    {
      'Student ID': '2024ME004',
      'Name': 'Sarah Johnson',
      'Email': 'sarah.johnson@college.edu',
      'Date of Birth': '2001-07-05',
      'Department': 'Mechanical Engineering',
      'Year': 2,
      'Lab ID': 'LAB-04'
    },
    {
      'Student ID': '2024CE005',
      'Name': 'David Brown',
      'Email': 'david.brown@college.edu',
      'Date of Birth': '2000-03-12',
      'Department': 'Civil Engineering',
      'Year': 4,
      'Lab ID': 'LAB-05'
    }
  ];
  
  const csvHeader = Object.keys(sampleData[0]).join(',') + '\n';
  const csvData = sampleData.map(row => 
    Object.values(row).map(val => `"${val}"`).join(',')
  ).join('\n');
  
  const csvContent = csvHeader + csvData;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="student-template.csv"');
  res.send(csvContent);
});

// Student Registration API
app.post('/api/student-register', async (req, res) => {
  try {
    const { name, studentId, email, password, dateOfBirth, department, year, labId } = req.body;
    
    if (!name || !studentId || !email || !password || !dateOfBirth || !department || !year || !labId) {
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }

    const existing = await Student.findOne({ $or: [{ studentId }, { email }] });
    if (existing) {
      return res.status(400).json({ success: false, error: "Student ID or email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const student = new Student({ 
      name, 
      studentId, 
      email, 
      passwordHash, 
      dateOfBirth, 
      department, 
      year, 
      labId,
      isPasswordSet: true
    });
    
    await student.save();
    console.log(`✅ Student registered: ${studentId}`);
    
    res.json({ success: true, message: "Student registered successfully." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Student Authentication API
app.post('/api/student-authenticate', async (req, res) => {
  try {
    const { studentId, password, labId } = req.body;
    
    const student = await Student.findOne({ studentId, labId });
    if (!student) {
      return res.status(400).json({ success: false, error: "Invalid student or lab" });
    }

    if (!student.isPasswordSet || !student.passwordHash) {
      return res.status(400).json({ 
        success: false, 
        error: "Password not set. Please complete first-time signin first." 
      });
    }

    const isValid = await student.verifyPassword(password);
    if (!isValid) {
      return res.status(400).json({ success: false, error: "Incorrect password" });
    }

    console.log(`✅ Authentication successful: ${studentId}`);

    res.json({ 
      success: true, 
      student: { 
        name: student.name,
        studentId: student.studentId,
        email: student.email,
        department: student.department,
        year: student.year,
        labId: student.labId
      }
    });
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// First-time signin API
app.post('/api/student-first-signin', async (req, res) => {
  try {
    const { name, studentId, dateOfBirth, password } = req.body;
    
    if (!name || !studentId || !dateOfBirth || !password) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    const student = await Student.findOne({ 
      studentId: studentId.toUpperCase(),
      name: { $regex: new RegExp(name.trim(), 'i') }
    });

    if (!student) {
      return res.status(400).json({ success: false, error: "Student details not found in database" });
    }

    if (student.isPasswordSet) {
      return res.status(400).json({ success: false, error: "Password already set for this student. Use login instead." });
    }

    const providedDOB = new Date(dateOfBirth);
    const studentDOB = new Date(student.dateOfBirth);
    
    if (providedDOB.toDateString() !== studentDOB.toDateString()) {
      return res.status(400).json({ success: false, error: "Date of birth does not match our records" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await Student.findByIdAndUpdate(student._id, { 
      passwordHash,
      isPasswordSet: true,
      updatedAt: new Date()
    });

    console.log(`✅ First-time signin completed for: ${studentId}`);
    res.json({ 
      success: true, 
      message: "Password set successfully! You can now login at kiosk.",
      student: {
        name: student.name,
        studentId: student.studentId,
        department: student.department,
        labId: student.labId
      }
    });

  } catch (error) {
    console.error("First-time signin error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check student eligibility
app.post('/api/check-student-eligibility', async (req, res) => {
  try {
    const { studentId } = req.body;
    
    const student = await Student.findOne({ studentId: studentId.toUpperCase() });
    
    if (!student) {
      return res.json({ eligible: false, reason: "Student ID not found" });
    }
    
    if (student.isPasswordSet) {
      return res.json({ eligible: false, reason: "Password already set. Use login instead." });
    }
    
    res.json({ 
      eligible: true, 
      studentName: student.name,
      department: student.department 
    });

  } catch (error) {
    console.error("Eligibility check error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Password Reset API
app.post('/api/reset-password', async (req, res) => {
  try {
    const { studentId, dateOfBirth, newPassword } = req.body;
    
    if (!studentId || !dateOfBirth || !newPassword) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const student = await Student.findOne({ studentId: studentId.toUpperCase() });
    if (!student) {
      return res.status(400).json({ success: false, error: "Student not found" });
    }

    if (!student.isPasswordSet) {
      return res.status(400).json({ 
        success: false, 
        error: "No password set yet. Please complete first-time signin first." 
      });
    }

    const providedDate = new Date(dateOfBirth);
    const studentDOB = new Date(student.dateOfBirth);
    
    if (providedDate.toDateString() !== studentDOB.toDateString()) {
      return res.status(400).json({ success: false, error: "Date of birth does not match our records" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: "New password must be at least 6 characters" });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await Student.findByIdAndUpdate(student._id, { 
      passwordHash,
      updatedAt: new Date()
    });

    console.log(`✅ Password reset successful for: ${studentId}`);
    res.json({ 
      success: true, 
      message: "Password reset successful! You can now login with your new password.",
      student: {
        name: student.name,
        studentId: student.studentId
      }
    });

  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Student Login (Create Session)
app.post('/api/student-login', async (req, res) => {
  try {
    const { studentName, studentId, computerName, labId, systemNumber } = req.body;

    await Session.updateMany(
      { computerName, status: 'active' }, 
      { status: 'completed', logoutTime: new Date() }
    );

    const newSession = new Session({ 
      studentName, 
      studentId, 
      computerName, 
      labId, 
      systemNumber, 
      loginTime: new Date(), 
      status: 'active' 
    });
    
    await newSession.save();
    
    console.log(`✅ Session created: ${newSession._id} for ${studentName}`);

    io.emit('student-login', { 
      sessionId: newSession._id, 
      studentName, 
      studentId, 
      computerName, 
      labId, 
      systemNumber, 
      loginTime: newSession.loginTime 
    });

    io.emit('start-live-stream', { sessionId: newSession._id });

    res.json({ success: true, sessionId: newSession._id });
  } catch (error) {
    console.error("Session login error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Student Logout (End Session)
app.post('/api/student-logout', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    const session = await Session.findById(sessionId);
    if (session) {
      session.status = 'completed';
      session.logoutTime = new Date();
      session.duration = Math.floor((session.logoutTime - session.loginTime) / 1000);
      await session.save();

      console.log(`✅ Session ended: ${sessionId} - Duration: ${session.duration}s`);

      io.emit('student-logout', { 
        sessionId, 
        studentName: session.studentName, 
        computerName: session.computerName, 
        logoutTime: session.logoutTime, 
        duration: session.duration 
      });

      io.emit('stop-live-stream', { sessionId });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Session logout error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update session screenshot
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

// Get active sessions
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
    console.error("Error fetching sessions:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find({}, '-passwordHash')
      .sort({ studentId: 1 });
    res.json({ success: true, students });
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get students by department
app.get('/api/students/department/:dept', async (req, res) => {
  try {
    const department = req.params.dept;
    const students = await Student.find({ department }, '-passwordHash')
      .sort({ studentId: 1 });
    res.json({ success: true, students, count: students.length });
  } catch (error) {
    console.error("Error fetching students by department:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Database statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const passwordsSet = await Student.countDocuments({ isPasswordSet: true });
    const pendingPasswords = await Student.countDocuments({ isPasswordSet: false });
    
    const departmentStats = await Student.aggregate([
      { $group: { _id: "$department", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const yearStats = await Student.aggregate([
      { $group: { _id: "$year", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalStudents,
        passwordsSet,
        pendingPasswords,
        departments: departmentStats,
        years: yearStats
      }
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search students
app.get('/api/students/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const students = await Student.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { studentId: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }, '-passwordHash').sort({ studentId: 1 }).limit(50);
    
    res.json({ success: true, students, count: students.length });
  } catch (error) {
    console.error("Error searching students:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebSocket: Socket.io WebRTC signaling
const kioskSockets = new Map();
const adminSockets = new Map();

io.on('connection', (socket) => {
  console.log("✅ Socket connected:", socket.id);

  socket.on('computer-online', (data) => { 
    console.log("💻 Computer online:", data); 
  });

  socket.on('screen-share', (data) => { 
    socket.broadcast.emit('live-screen', data); 
  });

  socket.on('register-kiosk', ({ sessionId }) => {
    console.log('📡 Kiosk registered:', sessionId, 'Socket:', socket.id);
    kioskSockets.set(sessionId, socket.id);
    socket.join(`session-${sessionId}`);
  });

  socket.on('admin-offer', ({ offer, sessionId, adminSocketId }) => {
    const kioskSocketId = kioskSockets.get(sessionId);
    console.log('📹 Admin offer for session:', sessionId, '-> Kiosk:', kioskSocketId);
    
    if (!adminSockets.has(sessionId)) {
      adminSockets.set(sessionId, []);
    }
    if (!adminSockets.get(sessionId).includes(adminSocketId)) {
      adminSockets.get(sessionId).push(adminSocketId);
    }
    
    if (kioskSocketId) {
      io.to(kioskSocketId).emit('admin-offer', { offer, sessionId, adminSocketId });
    } else {
      console.warn('⚠️ Kiosk not found for session:', sessionId);
    }
  });

  socket.on('webrtc-answer', ({ answer, adminSocketId, sessionId }) => {
    console.log('📹 WebRTC answer for admin:', adminSocketId);
    io.to(adminSocketId).emit('webrtc-answer', { answer, sessionId });
  });

  socket.on('webrtc-ice-candidate', ({ candidate, sessionId }) => {
    console.log('🧊 SERVER: ICE candidate for session:', sessionId, 'from:', socket.id);
    
    const kioskSocketId = kioskSockets.get(sessionId);
    const admins = adminSockets.get(sessionId) || [];
    
    if (socket.id === kioskSocketId) {
      console.log('🧊 SERVER: ICE from KIOSK -> sending to', admins.length, 'admin(s)');
      admins.forEach(adminId => {
        io.to(adminId).emit('webrtc-ice-candidate', { candidate, sessionId });
      });
    } else {
      console.log('🧊 SERVER: ICE from ADMIN -> sending to kiosk:', kioskSocketId);
      if (kioskSocketId) {
        io.to(kioskSocketId).emit('webrtc-ice-candidate', { candidate, sessionId });
      }
    }
  });

  socket.on('disconnect', () => { 
    console.log("❌ Socket disconnected:", socket.id); 
    
    for (const [sessionId, sId] of kioskSockets.entries()) {
      if (sId === socket.id) {
        kioskSockets.delete(sessionId);
        console.log('🧹 Cleaned up kiosk for session:', sessionId);
      }
    }
    
    for (const [sessionId, admins] of adminSockets.entries()) {
      const index = admins.indexOf(socket.id);
      if (index > -1) {
        admins.splice(index, 1);
        if (admins.length === 0) {
          adminSockets.delete(sessionId);
        }
        console.log('🧹 Cleaned up admin for session:', sessionId);
      }
    }
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔐 College Lab Registration System`);
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 Local Access: http://localhost:${PORT}`);
  console.log(`🌐 Network Access: http://10.10.46.182:${PORT}`); // CORRECT IP
  console.log(`📊 CSV/Excel Import: http://10.10.46.182:${PORT}/import.html`); // CORRECT IP
  console.log(`📚 Student Database: Import via CSV/Excel files (ExcelJS - Secure)`);
  console.log(`🔑 Password reset: Available via DOB verification`);
  console.log(`📊 API Endpoints: /api/import-students, /api/download-template, /api/stats`);
  console.log(`🛡️ Security: Using ExcelJS (no prototype pollution vulnerability)`);
  console.log(`${'='.repeat(60)}\n`);
});
