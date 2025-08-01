const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendApplicationNotification = async (
  companyEmail,
  jobTitle,
  userEmail,
  cvFile 
) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: companyEmail,
    subject: `New Application for ${jobTitle}`,
    text: `A user (${userEmail}) has applied for your job: ${jobTitle}. See attached CV.`,
    attachments: [
      {
        filename: cvFile.originalname, 
        content: cvFile.buffer, 
      },
    ],
  });
};

module.exports = { sendApplicationNotification };
