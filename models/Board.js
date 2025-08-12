const mongoose = require('mongoose');

const boardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Board title is required'],
    trim: true,
    maxlength: [100, 'Board title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer'],
      default: 'editor'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  columns: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    order: {
      type: Number,
      required: true
    },
    color: {
      type: String,
      default: '#007bff'
    }
  }],
  settings: {
    allowComments: {
      type: Boolean,
      default: true
    },
    allowEditing: {
      type: Boolean,
      default: true
    },
    isPublic: {
      type: Boolean,
      default: false
    }
  },
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
  }]
}, {
  timestamps: true
});

// Add default columns when creating a board
boardSchema.pre('save', function(next) {
  if (this.isNew && (!this.columns || this.columns.length === 0)) {
    this.columns = [
      { title: 'To Do', order: 0, color: '#6c757d' },
      { title: 'In Progress', order: 1, color: '#007bff' },
      { title: 'Done', order: 2, color: '#28a745' }
    ];
  }
  next();
});

// Add member to board
boardSchema.methods.addMember = function(userId, role = 'editor') {
  const existingMember = this.members.find(member => member.user.toString() === userId.toString());
  if (!existingMember) {
    this.members.push({ user: userId, role });
    return true;
  }
  return false;
};

// Remove member from board
boardSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(member => member.user.toString() !== userId.toString());
};

// Add activity log entry
boardSchema.methods.logActivity = function(userId, action, details = {}) {
  this.activityLog.push({
    user: userId,
    action,
    details,
    timestamp: new Date()
  });
  
  // Keep only last 100 activities
  if (this.activityLog.length > 100) {
    this.activityLog = this.activityLog.slice(-100);
  }
};

module.exports = mongoose.model('Board', boardSchema);
