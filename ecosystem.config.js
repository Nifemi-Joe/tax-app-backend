module.exports = {
	apps : [{
		name: "finance-app-backend", // Replace with your app's name
		script: "app.js",
		instances: 1, // Run only one instance
		autorestart: true, // Automatically restart if it crashes
		watch: false, // Don't watch for file changes in production
		// ... other pm2 options if needed ...
	}]
};