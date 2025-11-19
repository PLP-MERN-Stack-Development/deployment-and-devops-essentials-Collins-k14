const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    if (process.env.NODE_ENV !== "production") {
      const timestamp = new Date().toISOString();
      process.stdout.write(`[${timestamp}] MongoDB connected\n`);
    }
  } catch (err) {
    const timestamp = new Date().toISOString();
    process.stderr.write(`[${timestamp}] MongoDB connection failed: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { connectDB };