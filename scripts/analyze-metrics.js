const fs = require('fs');
const content = fs.readFileSync('src/datasource/metric_def.ts', 'utf8');

// Check if all options in the same group share the same unit
const lines = content.split('\n');
let groupLabel = null;
const groupUnits = new Map();
for (let i = 0; i < lines.length; i++) {
  const gl = lines[i].match(/^\s{4}label:\s*'([^']+)'/);
  if (gl) {groupLabel = gl[1];}
  const um = lines[i].match(/^\s{8}unit:\s*'([^']+)'/);
  if (um && groupLabel) {
    if (!groupUnits.has(groupLabel)) {groupUnits.set(groupLabel, new Set());}
    groupUnits.get(groupLabel).add(um[1]);
  }
}
let multiUnit = 0;
for (const [label, units] of groupUnits) {
  if (units.size > 1) {
    console.log('Multiple units in', label, ':', [...units]);
    multiUnit++;
  }
}
console.log('Groups with multiple units:', multiUnit, '/ Total groups:', groupUnits.size);

// Check if all options in a group share the same column
groupLabel = null;
const groupCols = new Map();
for (let i = 0; i < lines.length; i++) {
  const gl = lines[i].match(/^\s{4}label:\s*'([^']+)'/);
  if (gl) {groupLabel = gl[1];}
  const cm = lines[i].match(/^\s{8}column:\s*'([^']+)'/);
  if (cm && groupLabel) {
    if (!groupCols.has(groupLabel)) {groupCols.set(groupLabel, new Set());}
    groupCols.get(groupLabel).add(cm[1]);
  }
}
let multiCol = 0;
for (const [label, cols] of groupCols) {
  if (cols.size > 1) {
    console.log('Multiple columns in', label, ':', [...cols]);
    multiCol++;
  }
}
console.log('Groups with multiple columns:', multiCol, '/ Total groups:', groupCols.size);

// Check if value can be derived from fn + unit
// Pattern: value = fnPrefix_unit
// fn=average -> avg_, fn=percentile+rank95 -> p95th_, fn=percentile+rank99 -> p99th_, fn=max -> max_
groupLabel = null;
let derivable = 0;
let notDerivable = 0;
for (let i = 0; i < lines.length; i++) {
  const vm = lines[i].match(/^\s{8}value:\s*'([^']+)'/);
  if (!vm) {continue;}
  const value = vm[1];
  
  // Look ahead for fn, rank, unit in the same option block
  let fn = null, rank = null, unit = null;
  for (let j = i+1; j < Math.min(i+15, lines.length); j++) {
    const fm = lines[j].match(/^\s{8}fn:\s*'([^']+)'/);
    if (fm) {fn = fm[1];}
    const rm = lines[j].match(/^\s{8}rank:\s*(\d+)/);
    if (rm) {rank = parseInt(rm[1], 10);}
    const um = lines[j].match(/^\s{8}unit:\s*'([^']+)'/);
    if (um) {unit = um[1];}
    if (lines[j].match(/^\s{6}\}/)) {break;}
  }
  
  if (!fn || !unit) {continue;}
  
  let prefix;
  if (fn === 'average') {prefix = 'avg';}
  else if (fn === 'percentile' && rank === 95) {prefix = 'p95th';}
  else if (fn === 'percentile' && rank === 99) {prefix = 'p99th';}
  else if (fn === 'max') {prefix = 'max';}
  else { console.log('Unknown fn:', fn, rank); continue; }
  
  const expected = prefix + '_' + unit;
  if (value === expected) {
    derivable++;
  } else {
    console.log('NOT derivable:', value, '!= expected', expected);
    notDerivable++;
  }
}
console.log('\nvalue derivable from fn+unit:', derivable, '/ not derivable:', notDerivable);
