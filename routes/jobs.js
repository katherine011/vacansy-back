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
const upload = multer({ storage: multer.memoryStorage() });
require("dotenv").config();
const mongoose = require("mongoose");

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

      const jobs = await Job.find({ companyId: company._id })
        .populate("userId", "name email")
        .populate("companyId", "companyName email");

      const formattedJobs = jobs.map((job) => {
        const contact = job.userId || job.companyId;
        const name = contact?.name || contact?.companyName || "უცნობი";
        const email = contact?.email || "უცნობი";

        return {
          ...job.toObject(),
          contact: { name, email },
        };
      });

      res.json(formattedJobs);
    } catch (err) {
      console.error("Error fetching my jobs:", err.message);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.get("/user/saved-jobs", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("savedJobs");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ savedJobs: user.savedJobs });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/:id/unsave", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const jobId = req.params.id;

    if (!user) return res.status(404).json({ message: "User not found" });

    user.savedJobs = user.savedJobs.filter(
      (savedId) => savedId.toString() !== jobId
    );
    await user.save();

    res.status(200).json({ message: "Job removed from saved list" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: "Status is required" });
  }

  try {
    const job = await Job.findByIdAndUpdate(jobId, { status }, { new: true });

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.status(200).json({ message: "Status updated", job });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post(
  "/:id/apply",
  authMiddleware,
  roleMiddleware(["user"]),
  upload.single("cv"),
  async (req, res) => {
    try {
      const jobId = req.params.id;
      const userId = req.user.id;

      const job = await Job.findById(jobId);
      if (!job || job.status !== "approved") {
        return res
          .status(404)
          .json({ message: "ვაკანსია ვერ მოიძებნა ან დამტკიცებული არ არის" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "CV ფაილი არ არის მოწოდებული" });
      }

      const company = await Company.findById(job.companyId);
      if (!company) {
        return res.status(404).json({ message: "კომპანია ვერ მოიძებნა" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "მომხმარებელი ვერ მოიძებნა" });
      }

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: company.email,
        subject: `ახალი განაცხადი ვაკანსიაზე: ${job.title}`,
        text: `მომხმარებელი ${user.email} გამოაგზავნა განაცხადი ვაკანსიაზე "${job.title}". მიმაგრებულია CV ფაილი.`,
        attachments: [
          {
            filename: req.file.originalname,
            content: req.file.buffer,
          },
        ],
      });

      return res.json({ message: "განცხადება წარმატებით გაგზავნილია" });
    } catch (error) {
      console.error("CV Upload Error:", error);
      return res
        .status(500)
        .json({ message: "სერვერის შეცდომა", error: error.message });
    }
  }
);

router.get("/jobs/:id/debug", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.json({ found: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const job = await Job.findById(req.params.id)
      .populate("userId", "name email")
      .populate("companyId", "companyName email");

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.status === "approved") {
      const contact = job.userId || job.companyId;
      const name = contact?.name || contact?.companyName || "უცნობი";
      const email = contact?.email || "უცნობი";

      return res.json({
        ...job.toObject(),
        contact: { name, email },
      });
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const company = await Company.findOne({ user: decoded.userId });

    const isAdmin = decoded.role === "admin";
    const isOwner =
      decoded.role === "company" &&
      company &&
      job.companyId.toString() === company._id.toString();

    if (isAdmin || isOwner) {
      const contact = job.userId || job.companyId;
      const name = contact?.name || contact?.companyName || "უცნობი";
      const email = contact?.email || "უცნობი";

      return res.json({
        ...job.toObject(),
        contact: { name, email },
      });
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "ვაკანსია არ მოიძებნა" });

    if (job.status === "approved")
      return res
        .status(403)
        .json({ message: "დადასტურებული ვაკანსია არ შეიძლება რედაქტირდეს" });

    if (job.userId.toString() !== req.user.id)
      return res
        .status(403)
        .json({ message: "თქვენ არ ხართ ამ ვაკანსიის ავტორი" });

    Object.assign(job, req.body);
    await job.save();

    res.json({ message: "ვაკანსია განახლდა", job });
  } catch (err) {
    res.status(500).json({ message: "შეცდომა", error: err.message });
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
