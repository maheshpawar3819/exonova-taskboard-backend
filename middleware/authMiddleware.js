const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { STATUS } = require("../utils/statusCodes");
const { errorResponse } = require("../utils/responseHandler");

const authMiddleware = async (req, res, next) => {
  // extrating jwt token from headers
  let token = req.headers.authorization?.split(" ")[1];
  if (!token) return errorResponse(res, STATUS.UNAUTHORIZED, "Not authorized");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return errorResponse(res, STATUS.UNAUTHORIZED, "User not found");
    }

    next();
  } catch {
    return errorResponse(res, STATUS.UNAUTHORIZED, "Invalid token");
  }
};


module.exports=authMiddleware;