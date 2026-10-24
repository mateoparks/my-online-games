// Node test for The Vanishing Library: runs every tests/*.test.js (each loads
// the classic scripts listed in manifest.js into node:vm via tests/harness.js).
// Run: node games/vanishing-library/game.test.js
const fs = require('node:fs');
const path = require('node:path');

const tests = path.join(__dirname, 'tests');
const { testCount } = require(path.join(tests, 'harness.js'));
for (const file of fs.readdirSync(tests).filter((name) => name.endsWith('.test.js')).sort()) {
  console.log(`\n# ${file}`);
  const before = testCount();
  require(path.join(tests, file));
  // A stub, or a merge that emptied a file, must not pass as "no failures".
  if (testCount() === before) throw new Error(`${file} ran no tests`);
}
