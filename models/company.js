const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "provide a valid email"],
    index: true,
  },
  registrantName: { type: String, required: true, trim: true },
  registrantSurname: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  profilePhoto: { type: String, trim: true },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^\+?[\d\s-]{10,}$/, "provide a valid number"],
  },
  personalId: { type: String, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  jobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
});

module.exports = mongoose.model("Company", companySchema);
