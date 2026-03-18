// DNS Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = dims(DimensionCategory.DNS, [
  ['DNS Query Name', 'ktappprotocol__dns__STR00'],
  ['DNS Query Type', 'ktappprotocol__dns__INT00'],
  ['DNS Reply Code', 'ktappprotocol__dns__INT01'],
  ['DNS Reply Data', 'ktappprotocol__dns__STR01'],
]);
