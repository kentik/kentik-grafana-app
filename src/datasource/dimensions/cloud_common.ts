// Cloud Common Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = dims(DimensionCategory.CLOUD_COMMON, [
  ['Cloud Flow Log Provider', 'kt_cloud_provider'],
  ['Source Public Cloud Provider', 'src_cloud'],
  ['Source Public Cloud Service', 'src_cloud_service'],
  ['Source CDN', 'src_cdn'],
  ['Destination Public Cloud Provider', 'dst_cloud'],
  ['Destination Public Cloud Service', 'dst_cloud_service'],
  ['Destination CDN', 'dst_cdn'],
]);
