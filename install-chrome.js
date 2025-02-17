const puppeteer = require('puppeteer');

async function installChromium() {
	try {
		// Puppeteer automatically downloads Chromium when installed, you can check the path here
		const executablePath = puppeteer.executablePath();
		console.log('Chromium executable path:', executablePath);
	} catch (error) {
		console.error('Error while installing Chromium:', error);
	}
}

installChromium();
