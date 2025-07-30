const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  companyName: { type: String, required: true, trim: true },
  location: {
    type: String,
    enum: [
      "თბილისი",
      "ბათუმი",
      "ქუთაისი",
      "რუსთავი",
      "გორი",
      "ზუგდიდი",
      "ფოთი",
      "თელავი",
      "სოხუმი",
      "ხაშური",
    ],
    required: true,
  },
  salaryRange: { type: String, trim: true },
  workType: {
    type: String,
    enum: ["ოფისი", "დისტანციური", "ჰიბრიდი", "თავისუფალი გრაფიკი"],
    required: true,
  },
  experience: {
    type: String,
    enum: ["0-2 წლამდე", "2-5 წლამდე", "5+ წელი", "გამოუცდელი"],
    required: true,
  },
  education: { type: String, required: true, trim: true },
  languages: [
    {
      type: String,
      enum: [
        "ქართული",
        "ინგლისური",
        "რუსული",
        "ესპანური",
        "იტალიური",
        "თურქული",
        "გერმანული",
        "ფრანგული",
        "კორეული",
        "ჩინური",
        "იაპონური",
      ],
    },
  ],
  jobCategory: {
    type: String,
    enum: [
      "საბანკო სფერო",
      "IT დეველოპმენტი",
      "გაყიდვები/ვაჭრობა",
      "საოფისე",
      "მომსახურე პერსონალი",
      "მედიცინა/ფარმაცევტი",
    ],
    required: true,
  },
  customId: {
    type: String,
    unique: true,
    default: () => `ID${Math.floor(100000 + Math.random() * 900000)}`,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  email: { type: String, required: true, trim: true, lowercase: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
});

jobSchema.pre("save", function (next) {
  if (this.userId && this.companyId) {
    return next(new Error("Only one of userId or companyId can be provided"));
  }
  if (!this.userId && !this.companyId) {
    return next(new Error("Either userId or companyId is required"));
  }
  next();
});

module.exports = mongoose.model("Job", jobSchema);
