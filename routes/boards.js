const express = require('express');
const Board = require('../models/Board');
const Card = require('../models/Card');
const User = require('../models/User');
const { auth, checkBoardAccess } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/boards
// @desc    Create a new board
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, isPublic } = req.body;
    // console.log('Creating board:', { title, description, isPublic });

    if (!title) {
      return res.status(400).json({ message: 'Board title is required' });
    }

    const board = new Board({
      title,
      description,
      owner: req.user._id,
      settings: {
        isPublic: isPublic || false
      }
    });
    // console.log(board)
    // Add owner as admin member
    board.addMember(req.user._id, 'admin');
    
    // Log activity
    board.logActivity(req.user._id, 'board_created');

    await board.save();

    const populatedBoard = await Board.findById(board._id)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar');

    res.status(201).json({
      message: 'Board created successfully',
      board: populatedBoard
    });
  } catch (error) {
    console.error('Board creation error:', error);
    res.status(500).json({ message: 'Server error during board creation' });
  }
});

// @route   GET /api/boards
// @desc    Get user's boards
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const boards = await Board.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id },
        { 'settings.isPublic': true }
      ]
    })
    .populate('owner', 'name email avatar')
    .populate('members.user', 'name email avatar')
    .sort({ updatedAt: -1 });

    res.json({ boards });
  } catch (error) {
    console.error('Get boards error:', error);
    res.status(500).json({ message: 'Server error while fetching boards' });
  }
});

// @route   GET /api/boards/:id
// @desc    Get board by ID
// @access  Private
router.get('/:id', auth, checkBoardAccess, async (req, res) => {
  try {
    const board = await Board.findById(req.params.id)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar')
      .populate('activityLog.user', 'name email avatar');
    console.log(req.params.id)
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Get cards for this board
    const cards = await Card.find({ board: req.params.id, status: 'active' })
      .populate('assignees', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .sort({ order: 1 });

    res.json({
      board,
      cards
    });
  } catch (error) {
    console.error('Get board error:', error);
    res.status(500).json({ message: 'Server error while fetching board' });
  }
});

// @route   PUT /api/boards/:id
// @desc    Update board
// @access  Private
router.put('/:id', auth, checkBoardAccess, async (req, res) => {
  try {
    const { title, description, isPublic, columns } = req.body;
    const updates = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (isPublic !== undefined) {
      if (!updates.settings) updates.settings = {};
      updates.settings.isPublic = isPublic;
    }
    if (columns !== undefined) updates.columns = columns;

    const board = await Board.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    )
    .populate('owner', 'name email avatar')
    .populate('members.user', 'name email avatar');

    // Log activity
    board.logActivity(req.user._id, 'board_updated', updates);

    res.json({
      message: 'Board updated successfully',
      board
    });
  } catch (error) {
    console.error('Board update error:', error);
    res.status(500).json({ message: 'Server error during board update' });
  }
});

// @route   DELETE /api/boards/:id
// @desc    Delete board
// @access  Private
router.delete('/:id', auth, checkBoardAccess, async (req, res) => {
  try {
    const board = req.board;
    
    // Only owner can delete board
    if (board.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only board owner can delete the board' });
    }

    // Delete all cards in the board
    await Card.deleteMany({ board: req.params.id });

    // Delete the board
    await Board.findByIdAndDelete(req.params.id);

    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Board deletion error:', error);
    res.status(500).json({ message: 'Server error during board deletion' });
  }
});

// @route   POST /api/boards/:id/members
// @desc    Add member to board
// @access  Private
router.post('/:id/members', auth, checkBoardAccess, async (req, res) => {
  try {
    const { userId, role = 'editor' } = req.body;
    const board = req.board;
    // console.log(board)
    // Validate userId format
    if (!userId || typeof userId !== 'string' || userId.length !== 24) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only owner and admins can add members
    const userRole = board.members.find(m => m.user.toString() === req.user._id.toString())?.role;
    if (board.owner.toString() !== req.user._id.toString() && userRole !== 'admin') {
      return res.status(403).json({ message: 'Only owners and admins can add members' });
    }

    const success = board.addMember(userId, role);
    if (!success) {
      return res.status(400).json({ message: 'User is already a member of this board' });
    }

    // Log activity
    board.logActivity(req.user._id, 'member_added', { userId, role });

    await board.save();

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`board:${boardId}`).emit('member_added', {
        boardId,
        memberName: user.name,
        addedBy: {
          userId: req.user._id,
          userName: req.user.name
        },
        timestamp: new Date()
      });
    }

    const populatedBoard = await Board.findById(board._id)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar');

    res.json({
      message: 'Member added successfully',
      board: populatedBoard
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ message: 'Server error while adding member' });
  }
});

// @route   DELETE /api/boards/:id/members/:userId
// @desc    Remove member from board
// @access  Private
router.delete('/:id/members/:userId', auth, checkBoardAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const board = req.board;

    // Cannot remove owner
    if (board.owner.toString() === userId) {
      return res.status(400).json({ message: 'Cannot remove board owner' });
    }

    // Only owner and admins can remove members
    const userRole = board.members.find(m => m.user.toString() === req.user._id.toString())?.role;
    if (board.owner.toString() !== req.user._id.toString() && userRole !== 'admin') {
      return res.status(403).json({ message: 'Only owners and admins can remove members' });
    }

    board.removeMember(userId);

    // Log activity
    board.logActivity(req.user._id, 'member_removed', { userId });

    await board.save();

    const populatedBoard = await Board.findById(board._id)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar');

    res.json({
      message: 'Member removed successfully',
      board: populatedBoard
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Server error while removing member' });
  }
});

// @route   PUT /api/boards/:id/members/:userId/role
// @desc    Update member role
// @access  Private
router.put('/:id/members/:userId/role', auth, checkBoardAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const board = req.board;

    // Only owner can change roles
    if (board.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only board owner can change member roles' });
    }

    // Cannot change owner's role
    if (board.owner.toString() === userId) {
      return res.status(400).json({ message: 'Cannot change owner role' });
    }

    const member = board.members.find(m => m.user.toString() === userId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    member.role = role;

    // Log activity
    board.logActivity(req.user._id, 'member_role_changed', { userId, role });

    await board.save();

    const populatedBoard = await Board.findById(board._id)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar');

    res.json({
      message: 'Member role updated successfully',
      board: populatedBoard
    });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ message: 'Server error while updating member role' });
  }
});

module.exports = router;
