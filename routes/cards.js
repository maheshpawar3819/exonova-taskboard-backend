const express = require('express');
const Card = require('../models/Card');
const Board = require('../models/Board');
const { auth, checkCardAccess } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/cards
// @desc    Create a new card
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, boardId, column, order, assignees, labels, priority, dueDate } = req.body;

    if (!title || !boardId || !column) {
      return res.status(400).json({ message: 'Title, board ID, and column are required' });
    }

    // Check board access
    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    const isOwner = board.owner.toString() === req.user._id.toString();
    const isMember = board.members.some(member => member.user.toString() === req.user._id.toString());
    const isPublic = board.settings && board.settings.isPublic;
    
    if (!isOwner && !isMember && !isPublic) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this board.' });
    }

    // Get the highest order in the column
    const maxOrder = await Card.findOne({ board: boardId, column, status: 'active' })
      .sort({ order: -1 })
      .select('order');
    
    const newOrder = maxOrder ? maxOrder.order + 1 : 0;

    const card = new Card({
      title,
      description,
      board: boardId,
      column,
      order: order !== undefined ? order : newOrder,
      assignees: assignees || [],
      labels: labels || [],
      priority: priority || 'medium',
      dueDate
    });

    await card.save();

    // Log activity on board
    board.logActivity(req.user._id, 'card_created', { cardId: card._id, title: card.title });

    const populatedCard = await Card.findById(card._id)
      .populate('assignees', 'name email avatar')
      .populate('comments.user', 'name email avatar');

    res.status(201).json({
      message: 'Card created successfully',
      card: populatedCard
    });
  } catch (error) {
    console.error('Card creation error:', error);
    res.status(500).json({ message: 'Server error during card creation' });
  }
});

// @route   GET /api/cards/:id
// @desc    Get card by ID
// @access  Private
router.get('/:id', auth, checkCardAccess, async (req, res) => {
  try {
    const card = await Card.findById(req.params.id)
      .populate('assignees', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .populate('activityLog.user', 'name email avatar');

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    res.json({ card });
  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({ message: 'Server error while fetching card' });
  }
});

// @route   PUT /api/cards/:id
// @desc    Update card
// @access  Private
router.put('/:id', auth, checkCardAccess, async (req, res) => {
  try {
    const { title, description, column, order, assignees, labels, priority, dueDate, status } = req.body;
    const updates = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (column !== undefined) updates.column = column;
    if (order !== undefined) updates.order = order;
    if (assignees !== undefined) updates.assignees = assignees;
    if (labels !== undefined) updates.labels = labels;
    if (priority !== undefined) updates.priority = priority;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (status !== undefined) updates.status = status;

    const card = await Card.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    )
    .populate('assignees', 'name email avatar')
    .populate('comments.user', 'name email avatar');

    // Log activity
    card.logActivity(req.user._id, 'card_updated', updates);

    // Log activity on board
    req.board.logActivity(req.user._id, 'card_updated', { cardId: card._id, title: card.title });

    res.json({
      message: 'Card updated successfully',
      card
    });
  } catch (error) {
    console.error('Card update error:', error);
    res.status(500).json({ message: 'Server error during card update' });
  }
});

// @route   DELETE /api/cards/:id
// @desc    Delete card
// @access  Private
router.delete('/:id', auth, checkCardAccess, async (req, res) => {
  try {
    const card = req.card;
    
    // Check if user has permission to delete
    const board = req.board;
    const isOwner = board.owner.toString() === req.user._id.toString();
    const userRole = board.members.find(m => m.user.toString() === req.user._id.toString())?.role;
    
    if (!isOwner && userRole !== 'admin') {
      return res.status(403).json({ message: 'Only owners and admins can delete cards' });
    }

    // Soft delete by setting status to deleted
    card.status = 'deleted';
    await card.save();

    // Log activity
    card.logActivity(req.user._id, 'card_deleted');
    board.logActivity(req.user._id, 'card_deleted', { cardId: card._id, title: card.title });

    res.json({ message: 'Card deleted successfully' });
  } catch (error) {
    console.error('Card deletion error:', error);
    res.status(500).json({ message: 'Server error during card deletion' });
  }
});

// @route   POST /api/cards/:id/comments
// @desc    Add comment to card
// @access  Private
router.post('/:id/comments', auth, checkCardAccess, async (req, res) => {
  try {
    const { content, attachments, mentions } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const card = req.card;
    card.addComment(req.user._id, content, attachments || [], mentions || []);
    await card.save();

    // Log activity on board
    req.board.logActivity(req.user._id, 'comment_added', { cardId: card._id, title: card.title });

    const populatedCard = await Card.findById(card._id)
      .populate('assignees', 'name email avatar')
      .populate('comments.user', 'name email avatar');

    res.json({
      message: 'Comment added successfully',
      card: populatedCard
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error while adding comment' });
  }
});

// @route   DELETE /api/cards/:id/comments/:commentId
// @desc    Remove comment from card
// @access  Private
router.delete('/:id/comments/:commentId', auth, checkCardAccess, async (req, res) => {
  try {
    const { commentId } = req.params;
    const card = req.card;

    const comment = card.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Only comment author or admin can delete comment
    const board = req.board;
    const isOwner = board.owner.toString() === req.user._id.toString();
    const userRole = board.members.find(m => m.user.toString() === req.user._id.toString())?.role;
    const isCommentAuthor = comment.user.toString() === req.user._id.toString();
    
    if (!isOwner && userRole !== 'admin' && !isCommentAuthor) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }

    const success = card.removeComment(commentId);
    if (!success) {
      return res.status(400).json({ message: 'Failed to remove comment' });
    }

    await card.save();

    // Log activity on board
    board.logActivity(req.user._id, 'comment_removed', { cardId: card._id, title: card.title });

    const populatedCard = await Card.findById(card._id)
      .populate('assignees', 'name email avatar')
      .populate('comments.user', 'name email avatar');

    res.json({
      message: 'Comment removed successfully',
      card: populatedCard
    });
  } catch (error) {
    console.error('Remove comment error:', error);
    res.status(500).json({ message: 'Server error while removing comment' });
  }
});

// @route   PUT /api/cards/:id/assignees
// @desc    Update card assignees
// @access  Private
router.put('/:id/assignees', auth, checkCardAccess, async (req, res) => {
  try {
    const { assignees } = req.body;
    const card = req.card;

    if (!Array.isArray(assignees)) {
      return res.status(400).json({ message: 'Assignees must be an array' });
    }

    card.assignees = assignees;
    card.logActivity(req.user._id, 'assignees_updated', { assignees });
    
    await card.save();

    const populatedCard = await Card.findById(card._id)
      .populate('assignees', 'name email avatar')
      .populate('comments.user', 'name email avatar');

    res.json({
      message: 'Assignees updated successfully',
      card: populatedCard
    });
  } catch (error) {
    console.error('Update assignees error:', error);
    res.status(500).json({ message: 'Server error while updating assignees' });
  }
});

// @route   PUT /api/cards/:id/labels
// @desc    Update card labels
// @access  Private
router.put('/:id/labels', auth, checkCardAccess, async (req, res) => {
  try {
    const { labels } = req.body;
    const card = req.card;

    if (!Array.isArray(labels)) {
      return res.status(400).json({ message: 'Labels must be an array' });
    }

    card.labels = labels;
    card.logActivity(req.user._id, 'labels_updated', { labels });
    
    await card.save();

    const populatedCard = await Card.findById(card._id)
      .populate('assignees', 'name email avatar')
      .populate('comments.user', 'name email avatar');

    res.json({
      message: 'Labels updated successfully',
      card: populatedCard
    });
  } catch (error) {
    console.error('Update labels error:', error);
    res.status(500).json({ message: 'Server error while updating labels' });
  }
});

// @route   POST /api/cards/reorder
// @desc    Reorder cards (drag and drop)
// @access  Private
router.post('/reorder', auth, async (req, res) => {
  try {
    const { boardId, sourceColumn, destinationColumn, sourceIndex, destinationIndex, cardId } = req.body;

    if (!boardId || !sourceColumn || !destinationColumn || sourceIndex === undefined || destinationIndex === undefined || !cardId) {
      return res.status(400).json({ message: 'All reorder parameters are required' });
    }

    // Check board access
    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    const isOwner = board.owner.toString() === req.user._id.toString();
    const isMember = board.members.some(member => member.user.toString() === req.user._id.toString());
    const isPublic = board.settings && board.settings.isPublic;
    
    if (!isOwner && !isMember && !isPublic) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this board.' });
    }

    // Get all cards in the affected columns
    const sourceCards = await Card.find({ board: boardId, column: sourceColumn, status: 'active' }).sort({ order: 1 });
    const destCards = await Card.find({ board: boardId, column: destinationColumn, status: 'active' }).sort({ order: 1 });

    // Remove card from source
    const [movedCard] = sourceCards.splice(sourceIndex, 1);
    if (!movedCard) {
      return res.status(404).json({ message: 'Card not found at source position' });
    }

    // Update moved card
    movedCard.column = destinationColumn;
    movedCard.order = destinationIndex;

    // Insert card at destination
    destCards.splice(destinationIndex, 0, movedCard);

    // Update orders for all affected cards
    const updatePromises = [];

    // Update source column cards
    sourceCards.forEach((card, index) => {
      card.order = index;
      updatePromises.push(card.save());
    });

    // Update destination column cards
    destCards.forEach((card, index) => {
      card.order = index;
      updatePromises.push(card.save());
    });

    await Promise.all(updatePromises);

    // Log activity
    movedCard.logActivity(req.user._id, 'card_moved', { 
      fromColumn: sourceColumn, 
      toColumn: destinationColumn,
      fromIndex: sourceIndex,
      toIndex: destinationIndex
    });

    board.logActivity(req.user._id, 'card_reordered', { 
      cardId: movedCard._id, 
      title: movedCard.title,
      fromColumn: sourceColumn,
      toColumn: destinationColumn
    });

    res.json({
      message: 'Cards reordered successfully',
      card: movedCard
    });
  } catch (error) {
    console.error('Reorder cards error:', error);
    res.status(500).json({ message: 'Server error while reordering cards' });
  }
});

// @route   PUT /api/cards/:id/editing
// @desc    Set card editing status
// @access  Private
router.put('/:id/editing', auth, checkCardAccess, async (req, res) => {
  try {
    const { isEditing } = req.body;
    const card = req.card;

    card.setEditingStatus(req.user._id, isEditing);
    await card.save();

    res.json({
      message: isEditing ? 'Editing started' : 'Editing stopped',
      card
    });
  } catch (error) {
    console.error('Set editing status error:', error);
    res.status(500).json({ message: 'Server error while setting editing status' });
  }
});

module.exports = router;
