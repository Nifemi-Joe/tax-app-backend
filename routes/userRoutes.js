const express = require('express');
const router = express.Router();
const {
	userRegister,
	authUser,
	getProfileUser,
	resetUserPassword,
	registerUser,
	loginUser,
	getUserProfile,
	updateUserProfile,
	getUsers,
	getUserById,
	updateUser,
	deleteUserProfile
} = require('../controllers/userController');
const { check } = require('express-validator');
const { protect, authorize, authorizePermissions} = require('../middlewares/authMiddleware');
const {validateObjectId} = require("../middlewares/errorMiddleware");


// @route   POST /api/users/login
// @desc    Authenticate a user and get token
// @access  Public
const checkFirstLogin = (req, res, next) => {
	if (req.user.firstLogin) {
		return res.status(400).json({ message: 'You must change your password on first login' });
	}
	next();
};

router.post(
	'/register',
	[
		check('firstname', 'First Name is required').not().isEmpty(),
		check('lastname', 'Last Name is required').not().isEmpty(),
		check('email', 'Please include a valid email').isEmail(),
		check('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
		check('role').optional().isIn(['superadmin', 'admin', 'backOffice', 'frontOffice'])
	],
	protect,
	authorize('superadmin', 'admin'),
	userRegister
);

// Login Route
router.post(
	'/login',
	[
		check('email', 'Please include a valid email').isEmail(),
		check('password', 'Password is required').exists()
	],
	authUser
);

// Profile Route
router.get('/profile', protect, getProfileUser);


// router.post('/login', loginUser, checkFirstLogin);

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
// router.get('/profile', getUserProfile);

router.get('/read', protect,getUsers);
router.post(
	'/reset-password',
	protect,
	[
		check('userId', 'User ID is required').not().isEmpty(),
		check('newPassword', 'New password must be 6 or more characters').isLength({ min: 6 })
	],
	resetUserPassword
);

router.get('/read-by-id/:id', protect,  validateObjectId('id'),getUserById);

router.put(
	'/update/:id',
	protect,
	[
		check('email').optional().isEmail(),
		check('role').optional().isIn(['superadmin', 'admin', 'clientAdmin', 'employee']),
		check('permissions').optional().isArray()
	],
	validateObjectId('id'),
	updateUser
);

router.delete('/delete/:id', protect, authorize('admin', 'superadmin'),  validateObjectId('id'),deleteUserProfile);


// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (Admin)

// @desc    Update user details
// @route   PUT /api/users/:id
// @access  Private (Admin)

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private


module.exports = router;
