require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    addDemoStudents();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

const studentSchema = new mongoose.Schema({
  name: String,
  studentId: String,
  email: String,
  passwordHash: String,
  dateOfBirth: Date,
  department: String,
  year: Number,
  labId: String,
});

const Student = mongoose.model('Student', studentSchema);

async function addDemoStudents() {
  try {
    const password123 = await bcrypt.hash('password123', 12);
    const demo123 = await bcrypt.hash('demo123', 12);

    const demoUsers = [
      {
        name: 'John Doe',
        studentId: '2024001',
        email: 'john@example.com',
        passwordHash: password123,
        dateOfBirth: new Date('2004-01-01'),
        department: 'CS',
        year: 2,
        labId: 'LAB-01',
      },
      {
        name: 'Jane Smith',
        studentId: '2024002',
        email: 'jane@example.com',
        passwordHash: password123,
        dateOfBirth: new Date('2004-02-01'),
        department: 'CS',
        year: 2,
        labId: 'LAB-01',
      },
      {
        name: 'Demo Student',
        studentId: 'DEMO001',
        email: 'demo@example.com',
        passwordHash: demo123,
        dateOfBirth: new Date('2004-03-01'),
        department: 'CS',
        year: 2,
        labId: 'LAB-01',
      },
    ];

    for (const user of demoUsers) {
      await Student.updateOne({ studentId: user.studentId }, user, { upsert: true });
    }

    console.log('✅ Demo students inserted/updated successfully');
  } catch (error) {
    console.error('❌ Error inserting demo students:', error);
  } finally {
    mongoose.disconnect();
  }
}
