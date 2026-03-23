/**
 * Transform metric_def.ts to use the new centralized MetricGroup shape.
 * 
 * For each group:
 *   1. Add `column` and `unit` at the group level (from first option)
 *   2. Remove redundant fields from each option:
 *      - column, unit, group, origLabel, sample_rate (if 1), raw, name
 * 
 * Run: node scripts/transform-metrics.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'datasource', 'metric_def.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Strategy: work line by line, track group context
const lines = content.split('\n');
const result = [];
let inMetricNestedList = false;
let groupIndent = -1;
let optionIndent = -1;
let currentGroupLabelLine = -1;
let groupColumn = null;
let groupUnit = null;
let firstOptionInGroup = true;
let inOptions = false;
let groupLabelForInjection = null;
let injectedGroupFields = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Detect start of metricNestedList
  if (line.match(/^export const metricNestedList/)) {
    inMetricNestedList = true;
    result.push(line);
    continue;
  }

  if (!inMetricNestedList) {
    result.push(line);
    continue;
  }

  // Detect group start: "  {" at indent 2
  if (line.match(/^\s{2}\{$/)) {
    groupColumn = null;
    groupUnit = null;
    firstOptionInGroup = true;
    inOptions = false;
    groupLabelForInjection = null;
    injectedGroupFields = false;
    result.push(line);
    continue;
  }

  // Detect group label
  const groupLabelMatch = line.match(/^(\s{4})label:\s*'([^']+)'/);
  if (groupLabelMatch) {
    groupLabelForInjection = groupLabelMatch[2];
    result.push(line);
    continue;
  }

  // Detect options array start
  if (line.match(/^\s{4}options:\s*\[/)) {
    inOptions = true;
    firstOptionInGroup = true;
    result.push(line);
    continue;
  }

  // Detect options array end
  if (inOptions && line.match(/^\s{4}\]/)) {
    inOptions = false;
    result.push(line);
    continue;
  }

  if (inOptions) {
    // Inside options array - process option fields

    // Capture column and unit from first option to inject at group level
    const colMatch = line.match(/^\s{8}column:\s*'([^']+)'/);
    if (colMatch && firstOptionInGroup) {
      groupColumn = colMatch[1];
    }
    const unitMatch = line.match(/^\s{8}unit:\s*'([^']+)'/);
    if (unitMatch && firstOptionInGroup) {
      groupUnit = unitMatch[1];
    }

    // Detect end of first option to know we have column/unit
    if (line.match(/^\s{6}\},?$/) || line.match(/^\s{6}\}$/)) {
      if (firstOptionInGroup) {
        firstOptionInGroup = false;
        // Now inject group-level column/unit if we haven't already
        if (!injectedGroupFields && groupColumn && groupUnit) {
          // Find where to inject: right after the label line
          // Search backward in result for the group label line
          for (let j = result.length - 1; j >= 0; j--) {
            if (result[j].match(/^\s{4}label:\s*'/)) {
              // Insert column and unit lines after the label
              result.splice(j + 1, 0,
                `    column: '${groupColumn}',`,
                `    unit: '${groupUnit}',`
              );
              injectedGroupFields = true;
              break;
            }
          }
        }
      }
    }

    // Skip redundant fields
    if (line.match(/^\s{8}column:\s*'/) && groupColumn && line.includes(groupColumn)) {
      continue; // Skip - same as group level
    }
    if (line.match(/^\s{8}unit:\s*'/) && groupUnit && line.includes(groupUnit)) {
      continue; // Skip - same as group level
    }
    if (line.match(/^\s{8}group:\s*'/)) {
      continue; // Always derived from parent label
    }
    if (line.match(/^\s{8}origLabel:\s*'/)) {
      continue; // Always equals label
    }
    if (line.match(/^\s{8}name:\s*'/)) {
      continue; // Always equals value
    }
    if (line.match(/^\s{8}raw:\s*true/)) {
      continue; // Always set centrally
    }
    if (line.match(/^\s{8}sample_rate:\s*1,?\s*$/)) {
      continue; // Default value, set centrally
    }
    // Keep sample_rate: 0.01 (non-default)
  }

  result.push(line);
}

fs.writeFileSync(filePath, result.join('\n'));
console.log('Done. Transformed metric_def.ts');
