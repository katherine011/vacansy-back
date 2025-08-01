const express = require("express");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.js");
const Jobs = require("../models/job.js");
const Company = require("../models/company.js");
const nodemailer = require("nodemailer");
const { authMiddleware } = require("../middleware/middleware");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

router.post(
  "/register/user",
  [
    body("name").notEmpty(),
    body("surname").notEmpty(),
    body("birthDate").isISO8601(),
    body("phone").matches(/^\+?[\d\s-]{10,}$/),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("profilePhoto").optional(),
    body("role").optional().isIn(["user", "admin"]),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const {
      name,
      surname,
      birthDate,
      phone,
      email,
      password,
      profilePhoto,
      role = "user",
    } = req.body;

    try {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser)
        return res
          .status(400)
          .json({ message: "ელფოსტა უკვე რეგისტრირებულია" });

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await User.create({
        name,
        surname,
        birthDate,
        phone,
        email: email.toLowerCase(),
        password: hashedPassword,
        role,
        profilePhoto,
      });

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.status(201).json({
        message: "მომხმარებელი დარეგისტრირდა",
        userId: user._id,
        token,
      });
    } catch (err) {
      res.status(500).json({ message: err.message || "რეგისტრაცია ჩაიშალა" });
    }
  }
);

router.post(
  "/register/company",
  [
    body("companyName").notEmpty(),
    body("email").isEmail(),
    body("registrantName").notEmpty(),
    body("registrantSurname").notEmpty(),
    body("description").notEmpty(),
    body("password").isLength({ min: 6 }),
    body("phone").notEmpty(),
    body("profilePhoto").optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    console.log("Request body:", req.body);

    const {
      companyName,
      email,
      registrantName,
      registrantSurname,
      description,
      password,
      phone,
      profilePhoto,
    } = req.body;

    try {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser)
        return res
          .status(400)
          .json({ message: "This email is already registered" });

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await User.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        role: "company",
      });

      const company = await Company.create({
        companyName,
        email: email.toLowerCase(),
        registrantName,
        registrantSurname,
        description,
        phone,
        profilePhoto: profilePhoto || "https://example.com/default.jpg",
        user: user._id,
      });

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.status(201).json({
        message: "Company registered successfully",
        companyId: company._id,
        userId: user._id,
        token,
      });
    } catch (err) {
      console.error("Detailed error:", err.stack);
      res.status(500).json({ message: err.message || "Registration failed" });
    }
  }
);

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/logout", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(400).json({ message: "ტოკენი არ არის მოწოდებული" });
  }

  res.status(200).json({ message: "წარმატებით გამოხვედით" });
});

router.get("/companies", async (req, res) => {
  try {
    const companies = await Company.find().select(
      "companyName email registrantName registrantSurname description phone profilePhoto user jobs "
    );

    res.json(companies);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch companies", error: err.message });
  }
});

router.get("/", async (req, res) => {
  const { location, jobCategory, workType } = req.query;
  let query = { status: "approved" };
  if (location) query.location = location;
  if (jobCategory) query.jobCategory = jobCategory;
  if (workType) query.workType = workType;
  const jobs = await Job.find(query);
  res.json(jobs);
});

router.get("/companies/:companyId", async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId)
      .populate({
        path: "jobs",
        select: "_id title description",
        match: { status: "approved" },
      })
      .select(
        "companyName email registrantName registrantSurname description phone profilePhoto jobs"
      );
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch company", error: err.message });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    let response = {
      id: user._id,
      role: user.role,
      email: user.email,
    };

    if (user.role === "company") {
      const company = await Company.findOne({ user: user._id });
      if (company) {
        response.name = company.companyName;
      }
    } else {
      response.name = user.name || "Unnamed";
    }

    res.json(response);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = Math.random().toString(36).substring(2, 15);
    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset",
      text: `Your reset code is ${resetToken}. It expires in 1 hour.`,
    });

    res.json({ message: "Reset code sent to email" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetToken,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user)
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
