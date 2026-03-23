// Geography Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = dims(DimensionCategory.GEO, [
  ['Source Custom Geo', 'kt_src_market'],
  ['Source Country', 'Geography_src'],
  ['Source Region', 'src_geo_region'],
  ['Source City', 'src_geo_city'],
  ['Destination Custom Geo', 'kt_dst_market'],
  ['Destination Country', 'Geography_dst'],
  ['Destination Region', 'dst_geo_region'],
  ['Destination City', 'dst_geo_city'],
  ['Site Country', 'i_device_site_country'],
  ['Ultimate Exit Site Country', 'i_ult_exit_site_country'],
]);
