const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const environments = ['development', 'production', 'test'];

// Ensure the NODE_ENV is set; otherwise, default to 'development'
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!environments.includes(NODE_ENV)) {
	throw new Error(`Invalid NODE_ENV: ${NODE_ENV}. Must be one of ${environments.join(', ')}`);
}

const baseConfig = {
	app: {
		name: process.env.APP_NAME || 'Fintech Management App',
		port: process.env.PORT || 3000,
		env: NODE_ENV,
	},
	db: {
		uri: process.env.DB_URI,
		options: {
			useNewUrlParser: true,
			useUnifiedTopology: true,
			poolSize: parseInt(process.env.DB_POOL_SIZE, 10) || 10,
			ssl: NODE_ENV === 'production',
			sslValidate: NODE_ENV === 'production',
			sslCA: NODE_ENV === 'production' ? process.env.SSL_CA_PATH : undefined,
		},
	},
	security: {
		jwtSecret: process.env.JWT_SECRET || 'your-default-jwt-secret',
		jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
		bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
	},
	mail: {
		host: process.env.MAIL_HOST || 'smtp.mailtrap.io',
		port: parseInt(process.env.MAIL_PORT, 10) || 587,
		secure: process.env.MAIL_SECURE === 'true', // true for 465, false for other ports
		auth: {
			user: process.env.MAIL_USERNAME || 'your-mailtrap-username',
			pass: process.env.MAIL_PASSWORD || 'your-mailtrap-password',
		},
	},
	logging: {
		level: process.env.LOG_LEVEL || 'info',
		logFilePath: process.env.LOG_FILE_PATH || path.join(__dirname, 'logs', 'app.log'),
	},
};

// Environment-specific configurations
const environmentConfig = {
	development: {
		db: {
			debug: true, // Enable mongoose debug mode in development
		},
		security: {
			jwtSecret: 'dev-secret',
		},
		logging: {
			level: 'debug',
		},
	},
	production: {
		db: {
			debug: false,
		},
		security: {
			jwtSecret: process.env.JWT_SECRET,
		},
	},
	test: {
		app: {
			port: process.env.TEST_PORT || 4000,
		},
		db: {
			uri: process.env.TEST_DB_URI || 'mongodb://localhost:27017/fintech_app_test',
		},
		security: {
			jwtSecret: 'test-secret',
		},
		logging: {
			level: 'warn',
		},
	},
};

// Merge base config with environment-specific config
const config = { ...baseConfig, ...environmentConfig[NODE_ENV] };

// Export the configuration
module.exports = config;
