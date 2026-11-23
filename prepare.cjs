const fs = require('fs');
const path = require('path');
const base = __dirname;
const original = fs.readFileSync(path.join(base, 'backup/extension.js'), 'utf8');
const from = 'new o.IcarusSimulate(e).simulateFile(t)';
if (original.split(from).length !== 2) throw new Error('Unexpected Digital IDE bundle; refusing to patch.');
const changed = original.replace(from, 'require("./xsim-runner").dispatch(t,e,o.IcarusSimulate)');
fs.writeFileSync(path.join(base, 'stage/out/extension.js'), changed);
const pkg = JSON.parse(fs.readFileSync(path.join(base, 'backup/package.json'), 'utf8'));
const properties = pkg.contributes.configuration.properties;
Object.assign(properties, {
  'digital-ide.function.simulate.backend': { type: 'string', enum: ['xsim', 'icarus'], default: 'xsim', description: 'Current-module simulation backend (local XSim patch). No Vivado project required.' },
  'digital-ide.function.simulate.xsim.files': { type: 'array', items: {type:'string'}, default: [], description: 'Additional source files, relative to workspace. Useful for packages not discovered by the module parser.' },
  'digital-ide.function.simulate.xsim.includes': { type: 'array', items: {type:'string'}, default: [], description: 'Additional Verilog include directories, relative to workspace.' },
  'digital-ide.function.simulate.xsim.defines': { type: 'array', items: {type:'string'}, default: [], description: 'Preprocessor definitions, e.g. SIMULATION or WIDTH=8.' },
  'digital-ide.function.simulate.xsim.libraries': { type: 'array', items: {type:'string'}, default: [], description: 'Explicit XSim elaboration libraries.' },
  'digital-ide.function.simulate.xsim.runtime': { type: 'string', default: 'all', pattern: '^(all|[0-9]+(?:\\.[0-9]+)?\\s*(?:fs|ps|ns|us|ms|s))$', description: 'Run until $finish (all), or for a duration such as 1 us.' },
  'digital-ide.function.simulate.xsim.timeoutSeconds': { type: 'number', default: 180, minimum: 10, description: 'Maximum wall-clock time for each simulation tool; cancellation stops the process tree.' }
});
fs.writeFileSync(path.join(base, 'stage/package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log('Prepared Digital IDE 0.4.6 patch; one command dispatcher replaced.');
