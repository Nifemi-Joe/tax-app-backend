const fs = require('fs');
const puppeteer = require('puppeteer');

async function installChromium() {
	const browserFetcher = puppeteer.createBrowserFetcher();
	const revisionInfo = await browserFetcher.download('900000'); // Download a specific version of Chromium

	fs.writeFileSync('./chromium', revisionInfo.executablePath); // Save the path to the browser
}

installChromium();
