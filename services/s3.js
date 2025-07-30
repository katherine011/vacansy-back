const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const uploadCV = (file) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `cvs/${Date.now()}_${file.originalname}`,
    Body: file.buffer,
    ContentType: "application/pdf",
  };
  return s3.upload(params).promise();
};

module.exports = { uploadCV };
