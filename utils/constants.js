const dotenv = require('dotenv');
dotenv.config(); // Load environment variables from a .env file into process.env

// Application Settings
const APP_NAME = process.env.APP_NAME || 'GlobalSJX';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const PORT = process.env.PORT || 5000;

// Database Configuration
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 6000;
const DB_NAME = process.env.DB_NAME || 'myapp';

// Security Settings
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // Must be a strong, unpredictable value
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // JWT expiration time
const PASSWORD_SALT_ROUNDS = parseInt(process.env.PASSWORD_SALT_ROUNDS, 10) || 10;

// Email Configuration
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'gmail';
const EMAIL_USER = process.env.EMAIL_USER || 'example@gmail.com';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || 'your_email_password';

// Logging Configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // Levels: 'debug', 'info', 'warn', 'error'

// API Keys and Secrets
const API_KEY = process.env.API_KEY || 'your_api_key'; // Example for third-party APIs

// File Paths
const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const TEMP_DIR = process.env.TEMP_DIR || './temp';

// App Constants
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 10 * 1024 * 1024; // Max file upload size in bytes (10MB default)
const SUPPORTED_FILE_TYPES = process.env.SUPPORTED_FILE_TYPES ? process.env.SUPPORTED_FILE_TYPES.split(',') : ['image/jpeg', 'image/png', 'application/pdf'];

// Export constants
module.exports = {
	APP_NAME,
	APP_VERSION,
	PORT,
	DB_URI,
	JWT_SECRET,
	JWT_EXPIRES_IN,
	PASSWORD_SALT_ROUNDS,
	EMAIL_SERVICE,
	EMAIL_USER,
	EMAIL_PASSWORD,
	LOG_LEVEL,
	API_KEY,
	UPLOADS_DIR,
	TEMP_DIR,
	MAX_UPLOAD_SIZE,
	SUPPORTED_FILE_TYPES
};
