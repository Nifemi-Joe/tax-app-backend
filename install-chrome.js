const puppeteer = require('puppeteer');

async function installChromium() {
	const revision = await puppeteer.downloadBrowser(); // New method to download Chromium
	console.log('Chromium downloaded:', revision);
}

installChromium();
