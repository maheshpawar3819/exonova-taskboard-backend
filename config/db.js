const mogoose = require("mongoose");

const connectDb = async () => {
  try {
    await mogoose.connect(process.env.MONGO_URI);
    console.log("MongoDb Connected..");
  } catch (error) {
    console.error("MongoDb connection failed:", error.message);
  }
};

module.exports = connectDb;
