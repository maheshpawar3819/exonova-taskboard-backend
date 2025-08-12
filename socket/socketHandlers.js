const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Board = require('../models/Board');
const Card = require('../models/Card');

const connectedUsers = new Map();
const userSockets = new Map();
const userNames = new Map();
const boardRooms = new Map();
const editingUsers = new Map();

const setupSocketHandlers = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    const userName = socket.user.name;



    connectedUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);
    userNames.set(userId, userName);

    try {
      await User.findByIdAndUpdate(userId, { 
        isOnline: true, 
        lastSeen: new Date() 
      });
    } catch (error) {
      console.error('Error updating user online status:', error);
    }

    try {
      const userBoards = await Board.find({
        $or: [
          { owner: userId },
          { 'members.user': userId },
          { 'settings.isPublic': true }
        ]
      });

      userBoards.forEach(board => {
        const boardId = board._id.toString();
        socket.join(`board:${boardId}`);
        
        if (!boardRooms.has(boardId)) {
          boardRooms.set(boardId, new Set());
        }
        boardRooms.get(boardId).add(socket.id);

        socket.to(`board:${boardId}`).emit('user_joined_board', {
          userId,
          userName,
          timestamp: new Date()
        });
      });
    } catch (error) {
      console.error('Error joining user to boards:', error);
    }

    socket.on('join_board', async (data) => {
      try {
        const { boardId } = data;
        
        if (!boardId) {
          socket.emit('error', { message: 'Board ID is required' });
          return;
        }

        const board = await Board.findById(boardId);
        if (!board) {
          socket.emit('error', { message: 'Board not found' });
          return;
        }

        const isOwner = board.owner.toString() === userId;
        const isMember = board.members.some(member => member.user.toString() === userId);
        const isPublic = board.settings && board.settings.isPublic;
        
        if (!isOwner && !isMember && !isPublic) {
          socket.emit('error', { message: 'Access denied to this board' });
          return;
        }

        socket.join(`board:${boardId}`);
        
        if (!boardRooms.has(boardId)) {
          boardRooms.set(boardId, new Set());
        }
        boardRooms.get(boardId).add(socket.id);

        socket.to(`board:${boardId}`).emit('user_joined_board', {
          userId,
          userName,
          timestamp: new Date()
        });

        const onlineUsers = getBoardUsers(boardId).map(userId => {
          const userName = userNames.get(userId);
          if (userName) {
            return {
              _id: userId,
              name: userName,
              isOnline: true
            };
          }
          return null;
        }).filter(Boolean);

        io.to(`board:${boardId}`).emit('online_users_update', {
          boardId,
          users: onlineUsers
        });

        const boardData = await Board.findById(boardId)
          .populate('owner', 'name email avatar')
          .populate('members.user', 'name email avatar')
          .populate('activityLog.user', 'name email avatar');

        const cards = await Card.find({ board: boardId, status: 'active' })
          .populate('assignees', 'name email avatar')
          .populate('comments.user', 'name email avatar')
          .sort({ order: 1 });

        socket.emit('board_joined', {
          board: boardData,
          cards,
          onlineUsers
        });

        socket.emit('online_users_update', {
          boardId,
          users: onlineUsers
        });

      } catch (error) {
        console.error('Error joining board:', error);
        socket.emit('error', { message: 'Error joining board' });
      }
    });

    socket.on('leave_board', (data) => {
      const { boardId } = data;
      
      if (boardId) {
        socket.leave(`board:${boardId}`);
        
        if (boardRooms.has(boardId)) {
          boardRooms.get(boardId).delete(socket.id);
          if (boardRooms.get(boardId).size === 0) {
            boardRooms.delete(boardId);
          }
        }

        socket.to(`board:${boardId}`).emit('user_left_board', {
          userId,
          userName,
          timestamp: new Date()
        });

        const updatedOnlineUsers = getBoardUsers(boardId).map(userId => {
          const userName = userNames.get(userId);
          if (userName) {
            return {
              _id: userId,
              name: userName,
              isOnline: true
            };
          }
          return null;
        }).filter(Boolean);

        io.to(`board:${boardId}`).emit('online_users_update', {
          boardId,
          users: updatedOnlineUsers
        });

      }
    });

    socket.on('card_created', async (data) => {
      try {
        const { boardId, card } = data;
        
        if (boardId && card) {
          io.to(`board:${boardId}`).emit('card_created', {
            boardId,
            card,
            createdBy: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting card creation:', error);
      }
    });

    socket.on('card_updated', async (data) => {
      try {
        const { boardId, card, updates } = data;
        
        if (boardId && card) {
          io.to(`board:${boardId}`).emit('card_updated', {
            boardId,
            card,
            updatedBy: {
              userId,
              userName
            },
            updates,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting card update:', error);
      }
    });

    socket.on('card_deleted', async (data) => {
      try {
        const { boardId, cardId, cardTitle } = data;
        
        if (boardId && cardId) {
          io.to(`board:${boardId}`).emit('card_deleted', {
            boardId,
            cardId,
            cardTitle,
            deletedBy: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting card deletion:', error);
      }
    });

    socket.on('card_reordered', async (data) => {
      try {
        const { boardId, cardId, sourceColumn, destinationColumn, sourceIndex, destinationIndex } = data;
        
        if (boardId && cardId) {
          io.to(`board:${boardId}`).emit('card_reordered', {
            boardId,
            cardId,
            sourceColumn,
            destinationColumn,
            sourceIndex,
            destinationIndex,
            reorderedBy: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting card reorder:', error);
      }
    });

    socket.on('comment_added', async (data) => {
      try {
        const { boardId, cardId, comment } = data;
        
        if (boardId && cardId && comment) {
          io.to(`board:${boardId}`).emit('comment_added', {
            cardId,
            comment,
            addedBy: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting comment addition:', error);
      }
    });

    socket.on('comment_removed', async (data) => {
      try {
        const { boardId, cardId, commentId } = data;
        
        if (boardId && cardId && commentId) {
          io.to(`board:${boardId}`).emit('comment_removed', {
            cardId,
            commentId,
            removedBy: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting comment removal:', error);
      }
    });

    socket.on('start_editing', async (data) => {
      try {
        const { boardId, cardId } = data;
        
        if (boardId && cardId) {
          if (!editingUsers.has(cardId)) {
            editingUsers.set(cardId, new Set());
          }
          editingUsers.get(cardId).add(userId);

          io.to(`board:${boardId}`).emit('user_started_editing', {
            cardId,
            user: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting editing start:', error);
      }
    });

    socket.on('stop_editing', async (data) => {
      try {
        const { boardId, cardId } = data;
        
        if (boardId && cardId) {
          if (editingUsers.has(cardId)) {
            editingUsers.get(cardId).delete(userId);
            if (editingUsers.get(cardId).size === 0) {
              editingUsers.delete(cardId);
            }
          }

          io.to(`board:${boardId}`).emit('user_stopped_editing', {
            cardId,
            user: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting editing stop:', error);
      }
    });

    socket.on('typing_start', (data) => {
      const { boardId, cardId } = data;
      
      if (boardId && cardId) {
        socket.to(`board:${boardId}`).emit('user_typing', {
          cardId,
          user: {
            userId,
            userName
          }
        });
      }
    });

    socket.on('typing_stop', (data) => {
      const { boardId, cardId } = data;
      
      if (boardId && cardId) {
        socket.to(`board:${boardId}`).emit('user_stopped_typing', {
          cardId,
          user: {
            userId,
            userName
          }
        });
      }
    });

    socket.on('member_added', async (data) => {
      try {
        const { boardId, memberName } = data;
        
        if (boardId && memberName) {
          io.to(`board:${boardId}`).emit('member_added', {
            boardId,
            memberName,
            addedBy: {
              userId,
              userName
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting member addition:', error);
      }
    });

    socket.on('presence_update', async (data) => {
      try {
        const { boardId, status } = data;
        
        if (boardId) {
          io.to(`board:${boardId}`).emit('presence_updated', {
            user: {
              userId,
              userName
            },
            status,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting presence update:', error);
      }
    });

    socket.on('request_online_users', async (data) => {
      try {
        const { boardId } = data;
        
        if (boardId) {
          const onlineUsers = getBoardUsers(boardId).map(userId => {
            const userName = userNames.get(userId);
            if (userName) {
              return {
                _id: userId,
                name: userName,
                isOnline: true
              };
            }
            return null;
          }).filter(Boolean);

          socket.emit('online_users_update', {
            boardId,
            users: onlineUsers
          });
        }
      } catch (error) {
        console.error('Error getting online users:', error);
      }
    });

    socket.on('disconnect', async () => {


      // Remove from connected users
      connectedUsers.delete(userId);
      userSockets.delete(socket.id);
      userNames.delete(userId);

      // Remove from board rooms
      boardRooms.forEach((socketIds, boardId) => {
        socketIds.delete(socket.id);
        if (socketIds.size === 0) {
          boardRooms.delete(boardId);
        }
      });

      // Remove from editing users
      editingUsers.forEach((userIds, cardId) => {
        userIds.delete(userId);
        if (userIds.size === 0) {
          editingUsers.delete(cardId);
        }
      });

      // Update user offline status
      try {
        await User.findByIdAndUpdate(userId, { 
          isOnline: false, 
          lastSeen: new Date() 
        });
      } catch (error) {
        console.error('Error updating user offline status:', error);
      }

      // Notify all boards that user was in
      const userBoards = await Board.find({
        $or: [
          { owner: userId },
          { 'members.user': userId },
          { 'settings.isPublic': true }
        ]
      });

      userBoards.forEach(board => {
        const boardId = board._id.toString();
        io.to(`board:${boardId}`).emit('user_disconnected', {
          userId,
          userName,
          timestamp: new Date()
        });
      });
    });
  });

  // Utility functions for other parts of the application
  const getConnectedUsers = () => {
    return Array.from(connectedUsers.keys());
  };

  const getUserSocket = (userId) => {
    return connectedUsers.get(userId);
  };

  const getBoardUsers = (boardId) => {
    const socketIds = boardRooms.get(boardId);
    if (!socketIds) return [];
    
    return Array.from(socketIds).map(socketId => userSockets.get(socketId)).filter(Boolean);
  };

  const getEditingUsers = (cardId) => {
    const userIds = editingUsers.get(cardId);
    return userIds ? Array.from(userIds) : [];
  };

  return {
    getConnectedUsers,
    getUserSocket,
    getBoardUsers,
    getEditingUsers
  };
};

module.exports = { setupSocketHandlers };
