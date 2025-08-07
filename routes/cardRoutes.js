const express=require("express");
const router=express.Router();
const {addCard,moveCard}=require("../controllers/cardController");
const authMiddleware = require("../middleware/authMiddleware");

router.route("/").post(authMiddleware,addCard);
router.route("/move").put(authMiddleware,moveCard);

module.exports=router;