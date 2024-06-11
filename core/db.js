const mongoose = require("mongoose");

const connectionString = process.env.DATABASE_CONNECTION_STRING;

const connectDB = async () => {
  try {
    await mongoose.connect(connectionString);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
