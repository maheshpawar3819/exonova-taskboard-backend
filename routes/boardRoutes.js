const express = require("express");
const router=express.Router();
const authMiddleware=require("../middleware/authMiddleware");
const {
  createBoard,
  getUsersBoards,
} = require("../controllers/boardController");


router.route("/").post(authMiddleware,createBoard);
router.route("/").get(authMiddleware,getUsersBoards);

module.exports=router;