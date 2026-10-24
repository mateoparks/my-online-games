// Node test for The Vanishing Library: runs every tests/*.test.js (each loads
// the classic scripts listed in manifest.js into node:vm via tests/harness.js).
// Run: node games/vanishing-library/game.test.js
const fs = require('node:fs');
const path = require('node:path');

const tests = path.join(__dirname, 'tests');
for (const file of fs.readdirSync(tests).filter((name) => name.endsWith('.test.js')).sort()) {
  console.log(`\n# ${file}`);
  require(path.join(tests, file));
}
