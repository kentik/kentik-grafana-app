// HTTP Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = dims(DimensionCategory.HTTP, [
  ['HTTP URL', 'ktappprotocol__http__STR00'],
  ['HTTP Host', 'ktappprotocol__http__STR01'],
  ['HTTP User Agent', 'ktappprotocol__http__STR03'],
  ['HTTP Referer', 'ktappprotocol__http__STR02'],
  ['HTTP Status', 'ktappprotocol__http__INT00'],
  ['TLS Server Name', 'ktappprotocol__tls__STR00'],
  ['TLS Server Version', 'ktappprotocol__tls__INT00'],
  ['TLS Cipher Suite', 'ktappprotocol__tls__INT01'],
]);
