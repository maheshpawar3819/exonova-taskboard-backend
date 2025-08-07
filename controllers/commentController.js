const Comment = require("../models/Comment");
const { STATUS } = require("../utils/statusCodes");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const addComment = async (req, res) => {
  try {
    const { cardId, text } = req.body;
    if (!cardId || !text) {
      return errorResponse(res, STATUS.BAD_REQUEST, "Missing required fields");
    }

    const comment = await Comment.create({
      cardId,
      text,
      userId: req.user._id,
    });

    return successResponse(res, "Comment add successfully", comment);
  } catch (error) {
    return errorResponse(res, STATUS.SERVER_ERROR, err.message);
  }
};

module.exports={
  addComment
};
