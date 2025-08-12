const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  attachments: [{
    filename: String,
    url: String,
    type: String,
    size: Number
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

const cardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Card title is required'],
    trim: true,
    maxlength: [200, 'Card title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true
  },
  column: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  assignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  labels: [{
    name: String,
    color: String
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  dueDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  },
  comments: [commentSchema],
  activityLog: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    action: {
      type: String,
      required: true
    },
    details: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    timeEstimate: Number, // in minutes
    timeSpent: Number, // in minutes
    attachments: [{
      filename: String,
      url: String,
      type: String,
      size: Number,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  // Real-time collaboration fields
  editingBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastEdited: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add comment to card
cardSchema.methods.addComment = function(userId, content, attachments = [], mentions = []) {
  this.comments.push({
    user: userId,
    content,
    attachments,
    mentions
  });
  
  this.logActivity(userId, 'comment_added', { content: content.substring(0, 100) });
};

// Remove comment from card
cardSchema.methods.removeComment = function(commentId) {
  const comment = this.comments.id(commentId);
  if (comment) {
    this.logActivity(comment.user, 'comment_removed', { commentId });
    comment.remove();
    return true;
  }
  return false;
};

// Log activity on card
cardSchema.methods.logActivity = function(userId, action, details = {}) {
  this.activityLog.push({
    user: userId,
    action,
    details,
    timestamp: new Date()
  });
  
  // Keep only last 50 activities
  if (this.activityLog.length > 50) {
    this.activityLog = this.activityLog.slice(-50);
  }
};

// Set editing status
cardSchema.methods.setEditingStatus = function(userId, isEditing) {
  if (isEditing) {
    this.editingBy = userId;
    this.lastEdited = new Date();
  } else {
    this.editingBy = null;
  }
};

// Add assignee
cardSchema.methods.addAssignee = function(userId) {
  if (!this.assignees.includes(userId)) {
    this.assignees.push(userId);
    this.logActivity(userId, 'assignee_added');
    return true;
  }
  return false;
};

// Remove assignee
cardSchema.methods.removeAssignee = function(userId) {
  const index = this.assignees.indexOf(userId);
  if (index > -1) {
    this.assignees.splice(index, 1);
    this.logActivity(userId, 'assignee_removed');
    return true;
  }
  return false;
};

// Add label
cardSchema.methods.addLabel = function(name, color) {
  const existingLabel = this.labels.find(label => label.name === name);
  if (!existingLabel) {
    this.labels.push({ name, color });
    return true;
  }
  return false;
};

// Remove label
cardSchema.methods.removeLabel = function(name) {
  const index = this.labels.findIndex(label => label.name === name);
  if (index > -1) {
    this.labels.splice(index, 1);
    return true;
  }
  return false;
};

module.exports = mongoose.model('Card', cardSchema);
