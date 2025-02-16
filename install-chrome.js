const { execSync } = require('child_process');

console.log('Installing Chrome...');
execSync('apt-get update && apt-get install -y wget gnupg2');
execSync('wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -');
execSync('sh -c \'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list\'');
execSync('apt-get update && apt-get install -y google-chrome-stable');
console.log('Chrome installed successfully.');