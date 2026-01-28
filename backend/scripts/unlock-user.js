// Script to unlock a user account
// Usage: MONGODB_URI=your_uri node scripts/unlock-user.js user@email.com

require('dotenv').config();
const mongoose = require('mongoose');

const email = process.argv[2];

if (!email) {
  console.log('Usage: node scripts/unlock-user.js user@email.com');
  process.exit(1);
}

async function unlockUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const User = mongoose.connection.collection('users');
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`User not found: ${email}`);
      process.exit(1);
    }
    
    console.log('User found:', {
      name: user.name,
      email: user.email,
      failedLoginAttempts: user.failedLoginAttempts || 0,
      lockoutUntil: user.lockoutUntil,
      isLocked: user.lockoutUntil && new Date(user.lockoutUntil) > new Date()
    });
    
    // Unlock account
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { failedLoginAttempts: 0, lockoutUntil: null } }
    );
    
    console.log('Account unlocked!', result.modifiedCount ? 'Changes applied.' : 'No changes needed.');
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

unlockUser();

