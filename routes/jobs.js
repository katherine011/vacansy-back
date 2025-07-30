const express = require("express");
const Job = require("../models/job.js");
const User = require("../models/user.js");
const Company = require("../models/company.js");
const {
  authMiddleware,
  adminMiddleware,
  roleMiddleware,
  cvUploadMiddleware,
  saveJobMiddleware,
  authMiddlewareOptional,
} = require("../middleware/middleware.js");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const nodemailer = require("nodemailer");

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

router.get("/", authMiddlewareOptional, async (req, res) => {
  try {
    const { location, jobCategory, workType } = req.query;

    let query = {};

    query.status = "approved";

    if (req.user && req.user.role === "admin") {
      delete query.status;
    } else if (req.user && req.user.role === "company") {
      const company = await Company.findOne({ user: req.user.id });

      if (company) {
        query.$or = [{ status: "approved" }, { companyId: company._id }];
        delete query.status;
      }
    }

    if (location) query.location = location;
    if (jobCategory) query.jobCategory = jobCategory;
    if (workType) query.workType = workType;

    const jobs = await Job.find(query);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/pending", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const jobs = await Job.find({ status: "pending" });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get(
  "/me",
  authMiddleware,
  roleMiddleware(["company"]),
  async (req, res) => {
    try {
      const company = await Company.findOne({ user: req.user.id });
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const jobs = await Job.find({ companyId: company._id });

      res.json(jobs);
    } catch (err) {
      console.error("Error fetching my jobs:", err.message);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["company"]),
  async (req, res) => {
    try {
      const {
        title,
        description,
        companyName,
        location,
        salaryRange,
        workType,
        experience,
        education,
        languages,
        jobCategory,
      } = req.body;
      const company = await Company.findOne({ user: req.user.id });
      if (!company) throw new Error("Company not found");
      const job = await Job.create({
        title,
        description,
        companyName,
        location,
        salaryRange,
        workType,
        experience,
        education,
        languages,
        jobCategory,
        customId: `ID${Math.floor(100000 + Math.random() * 900000)}`,
        companyId: company._id,
        email: company.email,
        status: "pending",
      });
      company.jobs.push(job._id);
      await company.save();

      res.status(201).json({
        message: "Job created and pending admin approval",
        jobId: job._id,
      });
    } catch (err) {
      console.error("Job creation error:", err.stack);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.put("/:id/status", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status))
      return res.status(400).json({ message: "Invalid status" });
    const job = await Job.findById(req.params.id);
    if (!job || job.status === "approved")
      return res
        .status(400)
        .json({ message: "Job not found or already approved" });
    job.status = status;
    await job.save();
    res.json({ message: `Job ${status}`, job });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post(
  "/:id/apply",
  authMiddleware,
  cvUploadMiddleware,
  multer().single("cv"),
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
      if (!job || job.status !== "approved")
        return res
          .status(404)
          .json({ message: "Job not found or not approved" });

      const streamUpload = (req) =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream((error, result) =>
            error ? reject(error) : resolve(result)
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });

      const result = await streamUpload(req);
      const cvUrl = result.secure_url;

      const user = await User.findById(req.user.id);
      if (!user) throw new Error("User not found");
      user.resume = cvUrl;
      await user.save();

      const company = await Company.findById(job.companyId);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: company.email,
        subject: "New Job Application",
        text: `A user has applied for the job "${job.title}". CV: ${cvUrl}`,
        attachments: [{ filename: "cv.pdf", path: cvUrl }],
      });

      res.json({ message: "Application submitted", cvUrl });
    } catch (err) {
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.post(
  "/:id/save",
  authMiddleware,
  saveJobMiddleware,
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
      if (!job || job.status !== "approved")
        return res
          .status(404)
          .json({ message: "Job not found or not approved" });
      const user = await User.findById(req.user.id);
      if (!user) throw new Error("User not found");
      if (!user.savedJobs) user.savedJobs = [];
      if (!user.savedJobs.includes(job._id)) {
        user.savedJobs.push(job._id);
        await user.save();
      }
      res.json({ message: "Job saved", savedJobs: user.savedJobs });
    } catch (err) {
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.get("/:id", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // ყველასთვის გამოუშვი თუ approved არის
    if (job.status === "approved") {
      return res.json(job);
    }

    // თუ არაა approved — მოითხოვე ავტორიზაცია
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const company = await Company.findOne({ user: decoded.userId });

    if (
      decoded.role === "admin" ||
      (decoded.role === "company" &&
        company &&
        job.companyId.toString() === company._id.toString())
    ) {
      return res.json(job);
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      companyName,
      location,
      salaryRange,
      workType,
      experience,
      education,
      languages,
      jobCategory,
    } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (req.user.role !== "company" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only company or admin can update this job" });
    }
    if (
      req.user.role === "company" &&
      job.companyId.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "You can only update your own jobs" });
    }
    job.title = title || job.title;
    job.description = description || job.description;
    job.companyName = companyName || job.companyName;
    job.location = location || job.location;
    job.salaryRange = salaryRange || job.salaryRange;
    job.workType = workType || job.workType;
    job.experience = experience || job.experience;
    job.education = education || job.education;
    job.languages = languages || job.languages;
    job.jobCategory = jobCategory || job.jobCategory;
    job.status = "pending";
    await job.save();
    res.json({ message: "Job updated and pending admin approval", job });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get(
  "/me/:id",
  authMiddleware,
  roleMiddleware(["company"]),
  async (req, res) => {
    try {
      const company = await Company.findOne({ user: req.user.id });
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const job = await Job.findOne({
        _id: req.params.id,
        companyId: company._id,
      });

      if (!job) {
        return res
          .status(404)
          .json({ message: "Job not found or not owned by you" });
      }

      res.json(job);
    } catch (err) {
      console.error("Error fetching specific job:", err.message);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (req.user.role !== "company" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only company or admin can delete this job" });
    }
    if (
      req.user.role === "company" &&
      job.companyId.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "You can only delete your own jobs" });
    }
    await job.remove();
    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
