// OTT Services Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = dims(DimensionCategory.OTT, [
  ['OTT Service', 'service_name'],
  ['OTT Service Category', 'service_type'],
  ['OTT Service Provider', 'service_provider'],
  ['OTT Classification Type', 'ott_classification_type'],
]);
