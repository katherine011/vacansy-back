const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: function () {
      return this.role !== "company";
    },
    trim: true,
  },
  surname: {
    type: String,
    required: function () {
      return this.role !== "company";
    },
    trim: true,
  },
  birthDate: {
    type: Date,
    required: function () {
      return this.role !== "company";
    },
  },
  phone: {
    type: String,
    required: function () {
      return this.role !== "company";
    },
    trim: true,
    match: [/^\+?[\d\s-]{10,}$/, "Please provide a valid phone number"],
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    unique: true,
    index: true,
  },
  password: { type: String, required: true, trim: true },
  profilePhoto: { type: String, trim: true },
  role: { type: String, enum: ["user", "admin", "company"], required: true },
  resume: { type: String },
  savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
  resetToken: String,
  resetTokenExpiry: Date,
});

userSchema.pre("save", async function (next) {
  if (this.role === "admin" && this.isNew) {
    const adminCount = await this.model("User").countDocuments({
      role: "admin",
    });
    if (adminCount > 0) {
      throw new Error("Only one admin is allowed");
    }
  }
  const Company = mongoose.model("Company");
  const existingCompany = await Company.findOne({
    email: this.email.toLowerCase(),
  }).lean();
  if (existingCompany) {
    return next(new Error("This email is already registered with a company"));
  }
  next();
});

module.exports = mongoose.model("User", userSchema);
