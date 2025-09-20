const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://srijaaanandhan12_db_user:122007@cluster0.2kzkkpe.mongodb.net/college-lab-registration?retryWrites=true&w=majority';

console.log('🧪 Testing MongoDB connection...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB Atlas connected successfully!');
  console.log('✅ Database:', mongoose.connection.name);
  process.exit(0);
})
.catch((error) => {
  console.error('❌ MongoDB connection failed:', error.message);
  console.error('📝 Full error:', error);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Connection timeout - MongoDB may be unreachable');
  process.exit(1);
}, 10000);
