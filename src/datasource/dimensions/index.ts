// Dimension index - merges all category files into a single dimensionList
// To add new dimensions, edit the appropriate category file or create a new one.
import { Dimension } from '../metric_types';
import { dimensions as generalDims } from './general';
import { dimensions as interfaceDims } from './interface';
import { dimensions as site_deviceDims } from './site_device';
import { dimensions as routingDims } from './routing';
import { dimensions as geoDims } from './geo';
import { dimensions as cloud_commonDims } from './cloud_common';
import { dimensions as awsDims } from './aws';
import { dimensions as gcpDims } from './gcp';
import { dimensions as azureDims } from './azure';
import { dimensions as ociDims } from './oci';
import { dimensions as kubernetesDims } from './kubernetes';
import { dimensions as kappaDims } from './kappa';
import { dimensions as dnsDims } from './dns';
import { dimensions as httpDims } from './http';
import { dimensions as ottDims } from './ott';
import { dimensions as vendor_specificDims } from './vendor_specific';
import { dimensions as snmp_stDims } from './snmp_st';

export const dimensionList: Dimension[] = [
  ...generalDims,
  ...interfaceDims,
  ...site_deviceDims,
  ...routingDims,
  ...geoDims,
  ...cloud_commonDims,
  ...awsDims,
  ...gcpDims,
  ...azureDims,
  ...ociDims,
  ...kubernetesDims,
  ...kappaDims,
  ...dnsDims,
  ...httpDims,
  ...ottDims,
  ...vendor_specificDims,
  ...snmp_stDims,
];
