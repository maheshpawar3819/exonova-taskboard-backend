const Card = require("../models/Card");
const { STATUS } = require("../utils/statusCodes");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const addCard = async (req, res) => {
  try {
    const { title, boardId, columnId } = req.body;
    if (!title || !boardId || !columnId) {
      return errorResponse(res, STATUS.BAD_REQUEST, "Missing required fields");
    }

    const card = await Card.create({
      title,
      boardId,
      columnId,
      createdBy: req.user._id,
    });

    return successResponse(res, "Card added successfully", card);
  } catch (error) {
    return errorResponse(res, STATUS.SERVER_ERROR, error.message);
  }
};

const moveCard = async (req, res) => {
  try {
    const { cardId, newColumnId } = req.body;
    if (!cardId || !newColumnId) {
      return errorResponse(res, STATUS.BAD_REQUEST, "Missing required fields");
    }

    const updatedCard = await Card.findByIdAndUpdate(
      cardId,
      { columnId: newColumnId },
      { new: true }
    );

    return successResponse(res, "Card moved successfully", updatedCard);
  } catch (error) {
    return errorResponse(res, STATUS.SERVER_ERROR, error.message);
  }
};

module.exports={
  addCard,
  moveCard
}
