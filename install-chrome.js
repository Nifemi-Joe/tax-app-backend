const puppeteer = require('puppeteer');

async function installChromium() {
	console.log('Downloading Chromium...');
	const browserFetcher = puppeteer.createBrowserFetcher();
	const revision = await browserFetcher.download('1095492'); // Use a specific Chromium revision
	console.log('Chromium downloaded to:', revision.executablePath);
}

installChromium().catch(err => {
	console.error('Error downloading Chromium:', err);
	process.exit(1);
});