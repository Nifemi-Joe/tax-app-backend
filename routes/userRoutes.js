const express = require('express');
const router = express.Router();
const {
	registerUser,
	loginUser,
	getUserProfile,
	updateUserProfile,
	getUsers,
	getUserById,
	updateUser,
	deleteUserProfile
} = require('../controllers/userController');
// const { authenticateToken } = require('../middlewares/authMiddleware');
// const { validateRegister, validateLogin, validateProfileUpdate } = require('../middleware/validationMiddleware');

// @route   POST /api/users/register
// @desc    Register a new user
// @access  Public
router.post('/register', registerUser);

// @route   POST /api/users/login
// @desc    Authenticate a user and get token
// @access  Public
router.post('/login', loginUser);

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', getUserProfile);

router.get('/read', getUsers);

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (Admin)
router.get('/read-by-id/:id', getUserById);

// @desc    Update user details
// @route   PUT /api/users/:id
// @access  Private (Admin)
router.put('/update/:id', updateUser);

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', updateUserProfile);

// @route   DELETE /api/users/profile
// @desc    Delete user profile
// @access  Private
router.delete('/profile', deleteUserProfile);

module.exports = router;
