const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token. User not found.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.' });
    }
    res.status(500).json({ message: 'Server error.' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      const user = await User.findById(decoded.userId).select('-password');
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional routes
    next();
  }
};

const checkBoardAccess = async (req, res, next) => {
  try {
    const boardId = req.params.id;
    const userId = req.user._id.toString();
    console.log("board", boardId);
    const Board = require('../models/Board');
    const board = await Board.findById(boardId);
    console.log(board)
    if (!board) {
      return res.status(404).json({ message: 'Board not found.' });
    }
    
    // Check if user is owner or member
    const isOwner = board.owner.toString() === userId.toString();
    const isMember = board.members.some(member => member.user.toString() === userId.toString());
    
    if (!isOwner && !isMember && !(board.settings && board.settings.isPublic)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this board.' });
    }
    
    req.board = board;
    next();
  } catch (error) {
    console.error('checkBoardAccess error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const checkCardAccess = async (req, res, next) => {
  try {
    const { cardId } = req.params;
    const userId = req.user._id;
    
    const Card = require('../models/Card');
    const card = await Card.findById(cardId).populate('board');
    
    if (!card) {
      return res.status(404).json({ message: 'Card not found.' });
    }
    
    // Check board access
    const board = card.board;
    const isOwner = board.owner.toString() === userId.toString();
    const isMember = board.members.some(member => member.user.toString() === userId.toString());
    
    if (!isOwner && !isMember && !(board.settings && board.settings.isPublic)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this board.' });
    }
    
    req.card = card;
    req.board = board;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  auth,
  optionalAuth,
  checkBoardAccess,
  checkCardAccess
};
