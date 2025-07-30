const { default: mongoose } = require("mongoose");

require("dotenv").config();

module.exports = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Successfully connect to DB");
  } catch (error) {
    console.log("couldnt connect to DB");
  }
};
