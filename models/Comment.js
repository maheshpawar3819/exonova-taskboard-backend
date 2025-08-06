const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Card",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, required: [true, "Comment cannot be empty"] },
  },
  {
    timestamps: true,
  }
);
