const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let count = 0;
for (const folder of ['lib', 'scripts', 'config', 'tests']) {
  for (const name of fs.readdirSync(folder)) {
    if (!/\.(?:js|ajs)$/.test(name)) continue;
    const file = path.join(folder, name);
    new vm.Script(fs.readFileSync(file, 'utf8'), {filename: file});
    count++;
  }
}
console.log(`Syntax checked ${count} JavaScript/jArchi files.`);
