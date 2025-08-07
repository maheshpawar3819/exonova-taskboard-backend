const bcrypt = require("bcrypt");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { STATUS } = require("../utils/statusCodes");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const registerUser = async (req, res) => {
  try {
    const { name, email, passowrd } = req.body;
    if ((!name || !email || !passowrd)) {
      return errorResponse(res, STATUS.BAD_REQUEST, "All fields are required");
    }

    const userExist = await User.findOne({ email });
    if (userExist) {
      return errorResponse(res, STATUS.BAD_REQUEST, "User is already exists");
    }

    const hashedPassword = await bcrypt.hash(passowrd, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    return successResponse(res, "User registered successfully", {
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    return errorResponse(res, STATUS.SERVER_ERROR, error.message);
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, passowrd } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse(res, STATUS.BAD_REQUEST, "Invalid user credentials");
    }

    const isMatch = await bcrypt.compare(passowrd, user.password);
    if (!isMatch) {
      return errorResponse(res, STATUS.BAD_REQUEST, "Invalid credentials");
    }

    return successResponse(res, "Login successful", {
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    return errorResponse(res, STATUS.SERVER_ERROR, error.message);
  }
};

module.exports={
    registerUser,
    loginUser
}