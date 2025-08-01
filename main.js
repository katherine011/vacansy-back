const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth.js");
const jobRoutes = require("./routes/jobs.js");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: "https://vercel.com/katherines-projects-a0a5fcb3/vacansy-front",
    credentials: true,
  })
);
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/auth", authRoutes);
app.use("/jobs", jobRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
