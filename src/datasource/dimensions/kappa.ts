// Process-Aware Telemetry (Kappa) Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = dims(DimensionCategory.KAPPA, [
  ['Source Process-Aware Telemetry Agent Process PID', 'ktsubtype__kappa__INT01'],
  ['Source Process-Aware Telemetry Agent Process Name', 'ktsubtype__kappa__STR00'],
  ['Source Process-Aware Telemetry Agent Process Cmdline', 'ktsubtype__kappa__STR01'],
  ['Source Process-Aware Telemetry Agent Process Container ID', 'ktsubtype__kappa__STR02'],
  ['Source Process-Aware Telemetry Agent Node', 'ktsubtype__kappa__STR06'],
  ['Source Process-Aware Telemetry Agent Object Name', 'ktsubtype__kappa__STR08'],
  ['Source Process-Aware Telemetry Agent Object Namespace', 'ktsubtype__kappa__STR09'],
  ['Source Process-Aware Telemetry Agent Object Type', 'ktsubtype__kappa__STR10'],
  ['Source Process-Aware Telemetry Agent Container Name', 'ktsubtype__kappa__STR11'],
  ['Source Process-Aware Telemetry Agent Workload Name', 'ktsubtype__kappa__STR12'],
  ['Source Process-Aware Telemetry Agent Workload Namespace', 'ktsubtype__kappa__STR13'],
  ['Source Process-Aware Telemetry Agent Object Labels', 'ktsubtype__kappa__STR20'],
  ['Source Process-Aware Telemetry Agent Cloud Provider', 'ktsubtype__kappa__STR22'],
  ['Destination Process-Aware Telemetry Agent Process PID', 'ktsubtype__kappa__INT02'],
  ['Destination Process-Aware Telemetry Agent Process Name', 'ktsubtype__kappa__STR03'],
  ['Destination Process-Aware Telemetry Agent Process Cmdline', 'ktsubtype__kappa__STR04'],
  ['Destination Process-Aware Telemetry Agent Process Container ID', 'ktsubtype__kappa__STR05'],
  ['Destination Process-Aware Telemetry Agent Node', 'ktsubtype__kappa__STR07'],
  ['Destination Process-Aware Telemetry Agent Object Name', 'ktsubtype__kappa__STR14'],
  ['Destination Process-Aware Telemetry Agent Object Namespace', 'ktsubtype__kappa__STR15'],
  ['Destination Process-Aware Telemetry Agent Object Type', 'ktsubtype__kappa__STR16'],
  ['Destination Process-Aware Telemetry Agent Container Name', 'ktsubtype__kappa__STR17'],
  ['Destination Process-Aware Telemetry Agent Workload Name', 'ktsubtype__kappa__STR18'],
  ['Destination Process-Aware Telemetry Agent Workload Namespace', 'ktsubtype__kappa__STR19'],
  ['Destination Process-Aware Telemetry Agent Object Labels', 'ktsubtype__kappa__STR21'],
  ['Destination Process-Aware Telemetry Agent Cloud Provider', 'ktsubtype__kappa__STR23'],
]);
