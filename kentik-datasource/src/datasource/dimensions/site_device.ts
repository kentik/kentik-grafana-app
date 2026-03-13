// Site & Device Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionClass, DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = [
  ...dims(DimensionCategory.SITE_DEVICE, DimensionClass.FLOW, [
    ['Site', 'i_device_site_name'],
    ['Device', 'i_device_id'],
    ['Site Market', 'i_site_market'],
    ['Ultimate Exit Site Market', 'i_ult_exit_site_market'],
    ['Ultimate Exit Site', 'i_ult_exit_site'],
    ['Ultimate Exit Device', 'i_ult_exit_device_name'],
  ]),
  ...dims(DimensionCategory.SITE_DEVICE, [
    ['Ultimate Exit VRF Name', 'i_ult_exit_vrf'],
    ['Ultimate Exit VRF RD', 'i_ult_exit_vrf_rd'],
    ['Host Direction', 'i_host_direction'],
    ['Device Sample Rate', 'device_sample_rate'],
  ]),
];
