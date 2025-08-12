const express = require('express');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/search
// @desc    Search users by email
// @access  Private
router.get('/search', auth, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('_id name email avatar');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ message: 'Server error while searching for user' });
  }
});

module.exports = router;
