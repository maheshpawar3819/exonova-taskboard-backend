const Board = require("../models/Board");
const { STATUS } = require("../utils/statusCodes");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const createBoard = async (req, res) => {
  try {
    const { title, columns } = req.body;
    if (!title)
      return errorResponse(res, STATUS.BAD_REQUEST, "Board title is required");

    const board = await Board.create({
      title,
      columns,
      createdBy: req.user._id,
    });

    return successResponse(res, "Board created successfully",board);
  } catch (error) {
    return errorResponse(res, STATUS.SERVER_ERROR, error.message);
  }
};

const getUsersBoards=async (req,res)=> {
    try {
        const boards=await Board.find({createdBy:req.user._id});
        
        return successResponse(res,"Boards fetch successfuly",boards);
    } catch (error) {
        return errorResponse(res,STATUS.SERVER_ERROR,error.message);
    }
}

module.exports={
  createBoard,
  getUsersBoards
}