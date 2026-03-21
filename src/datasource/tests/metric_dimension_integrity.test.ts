/**
 * Data Integrity Tests: Metric <-> Dimension cross-validation
 *
 * These tests verify that the wire-format values in metric_def.ts and
 * dimensions/snmp_st.ts are internally consistent and match the Kentik
 * API expectations:
 *
 *   SNMP Interface -> ktappprotocol__snmp__              + f_sum_ columns
 *   SNMP Device    -> ktappprotocol__snmp_device_metrics__  + f_avg_ columns
 *   ST Interface   -> ktappprotocol__st__                + f_sum_ columns
 *
 * Each test loops over the relevant items internally and collects failures,
 * rather than creating a separate it() per dimension/metric.
 */

import { dimensionList, allMetricOptions, metricNestedList, flattenMetricOptions } from '../metric_def';
import { DimensionCategory } from '../metric_types';

// -- Helpers ----------------------------------------------------------------

const snmpDeviceMetrics = metricNestedList.filter(
  (g) => g.compatibleCategory === DimensionCategory.SNMP_DEVICE
);
const snmpInterfaceMetrics = metricNestedList.filter(
  (g) => g.compatibleCategory === DimensionCategory.SNMP_INTERFACE
);
const stInterfaceMetrics = metricNestedList.filter(
  (g) => g.compatibleCategory === DimensionCategory.ST_INTERFACE
);

const snmpDeviceDims = dimensionList.filter(
  (d) => d.category === DimensionCategory.SNMP_DEVICE
);
const snmpInterfaceDims = dimensionList.filter(
  (d) => d.category === DimensionCategory.SNMP_INTERFACE
);
const stInterfaceDims = dimensionList.filter(
  (d) => d.category === DimensionCategory.ST_INTERFACE
);

// -- Wire format prefix rules -----------------------------------------------

describe('Wire Format Prefix Consistency', () => {
  it('SNMP Device metric groups use ktappprotocol__snmp_device_metrics__ prefix', () => {
    const failures: string[] = [];
    for (const group of snmpDeviceMetrics) {
      if (!/^ktappprotocol__snmp_device_metrics__/.test(group.unit)) {
        failures.push(group.label + ': unit "' + group.unit + '" missing prefix');
      }
      for (const opt of group.options) {
        if (!opt.value.includes('_ktappprotocol__snmp_device_metrics__')) {
          failures.push(opt.value + ': value missing prefix');
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('SNMP Interface metric groups use ktappprotocol__snmp__ prefix (not device or interface_metrics)', () => {
    const failures: string[] = [];
    for (const group of snmpInterfaceMetrics) {
      if (!/^ktappprotocol__snmp__/.test(group.unit)) {
        failures.push(group.label + ': unit "' + group.unit + '" missing prefix');
      }
      if (group.unit.includes('snmp_device_metrics') || group.unit.includes('snmp_interface_metrics')) {
        failures.push(group.label + ': unit "' + group.unit + '" has wrong long-form prefix');
      }
    }
    expect(failures).toEqual([]);
  });

  it('ST Interface metric groups use ktappprotocol__st__ prefix (not st_interface_metrics)', () => {
    const failures: string[] = [];
    for (const group of stInterfaceMetrics) {
      if (!/^ktappprotocol__st__/.test(group.unit)) {
        failures.push(group.label + ': unit "' + group.unit + '" missing prefix');
      }
      if (group.unit.includes('st_interface_metrics')) {
        failures.push(group.label + ': unit "' + group.unit + '" has wrong long-form prefix');
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- KDE column rules -------------------------------------------------------

describe('KDE Column Consistency', () => {
  it('SNMP Device metrics use f_avg_ columns (gauge), interface metrics use f_sum_ (counter)', () => {
    const failures: string[] = [];
    for (const group of snmpDeviceMetrics) {
      if (!/^f_avg_/.test(group.column)) {
        failures.push('SNMP Device "' + group.label + '": column "' + group.column + '" should start with f_avg_');
      }
    }
    for (const group of snmpInterfaceMetrics) {
      if (!/^f_sum_/.test(group.column)) {
        failures.push('SNMP Interface "' + group.label + '": column "' + group.column + '" should start with f_sum_');
      }
    }
    for (const group of stInterfaceMetrics) {
      if (!/^f_sum_/.test(group.column)) {
        failures.push('ST Interface "' + group.label + '": column "' + group.column + '" should start with f_sum_');
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- Dimension prefix rules -------------------------------------------------

describe('Dimension Wire Format Consistency', () => {
  it('SNMP Device dimensions use ktappprotocol__snmp_device_metrics__ prefix (excluding event/ktranslate/interface dims)', () => {
    const pureSnmpDeviceDims = snmpDeviceDims.filter(
      (d) =>
        !d.value.startsWith('ktappprotocol__event_') &&
        !d.value.startsWith('ktappprotocol__ktranslate_') &&
        !d.value.startsWith('i_')
    );
    const failures = pureSnmpDeviceDims
      .filter((d) => !/^ktappprotocol__snmp_device_metrics__/.test(d.value))
      .map((d) => d.text + ' (' + d.value + ')');
    expect(failures).toEqual([]);
  });

  it('SNMP Interface dimensions use ktappprotocol__snmp__ prefix (not device or interface_metrics)', () => {
    const failures: string[] = [];
    for (const dim of snmpInterfaceDims) {
      if (!/^ktappprotocol__snmp__/.test(dim.value)) {
        failures.push(dim.text + ' (' + dim.value + '): wrong prefix');
      }
      if (dim.value.includes('snmp_device_metrics') || dim.value.includes('snmp_interface_metrics')) {
        failures.push(dim.text + ' (' + dim.value + '): has wrong long-form prefix');
      }
    }
    expect(failures).toEqual([]);
  });

  it('ST Interface dimensions use ktappprotocol__st__ prefix', () => {
    const failures = stInterfaceDims
      .filter((d) => !/^ktappprotocol__st__/.test(d.value))
      .map((d) => d.text + ' (' + d.value + ')');
    expect(failures).toEqual([]);
  });

  it('every NMS dimension has value === field', () => {
    const nmsCategories = new Set([
      DimensionCategory.SNMP_DEVICE,
      DimensionCategory.SNMP_INTERFACE,
      DimensionCategory.ST_INTERFACE,
    ]);
    const failures = dimensionList
      .filter((d) => d.category && nmsCategories.has(d.category) && d.value !== d.field)
      .map((d) => d.text + ': value="' + d.value + '" !== field="' + d.field + '"');
    expect(failures).toEqual([]);
  });
});

// -- Cross-reference: every category with metrics has dimensions and vice versa

describe('Metric <-> Dimension Category Cross-Reference', () => {
  it('SNMP Device: at least 3 metrics and 3 dimensions exist', () => {
    expect(snmpDeviceMetrics.flatMap((g) => g.options).length).toBeGreaterThanOrEqual(3);
    expect(snmpDeviceDims.length).toBeGreaterThanOrEqual(3);
  });

  it('SNMP Interface: at least 3 metrics and 3 dimensions exist', () => {
    expect(snmpInterfaceMetrics.flatMap((g) => g.options).length).toBeGreaterThanOrEqual(3);
    expect(snmpInterfaceDims.length).toBeGreaterThanOrEqual(3);
  });

  it('ST Interface: at least 3 metrics and 3 dimensions exist', () => {
    expect(stInterfaceMetrics.flatMap((g) => g.options).length).toBeGreaterThanOrEqual(3);
    expect(stInterfaceDims.length).toBeGreaterThanOrEqual(3);
  });
});

// -- Aggregate internal consistency -----------------------------------------

describe('Aggregate Field Consistency', () => {
  const nmsGroups = [...snmpDeviceMetrics, ...snmpInterfaceMetrics, ...stInterfaceMetrics];
  const nmsResolved = flattenMetricOptions(nmsGroups);

  it('name === value, value starts with correct fn prefix, unit is value without fn prefix', () => {
    const fnPrefixes: Record<string, string> = {
      average: 'avg_',
      percentile: 'p95th_',
      max: 'max_',
    };
    const failures: string[] = [];
    for (const resolved of nmsResolved) {
      if (resolved.name !== resolved.value) {
        failures.push(resolved.value + ': name "' + resolved.name + '" !== value');
      }
      const expectedPrefix = fnPrefixes[resolved.fn];
      if (expectedPrefix && !resolved.value.startsWith(expectedPrefix)) {
        failures.push(resolved.value + ': expected prefix "' + expectedPrefix + '" for fn="' + resolved.fn + '"');
      }
      const withoutPrefix = resolved.value.replace(/^(avg|p95th|max)_/, '');
      if (resolved.unit !== withoutPrefix) {
        failures.push(resolved.value + ': unit "' + resolved.unit + '" !== "' + withoutPrefix + '"');
      }
    }
    expect(failures).toEqual([]);
  });

  it('every NMS group has a non-empty unit at the group level', () => {
    const failures = nmsGroups
      .filter((g) => !g.unit || g.unit.length === 0)
      .map((g) => g.label);
    expect(failures).toEqual([]);
  });
});

// -- No legacy prefixes remain ----------------------------------------------

describe('No Legacy Prefixes', () => {
  it('no metric in allMetricOptions uses ktsubtype__snmp/st_interface prefix', () => {
    const legacy = allMetricOptions.filter(
      (m) => m.value.includes('ktsubtype__snmp') || m.value.includes('ktsubtype__st_interface')
    );
    expect(legacy.map((m) => m.value)).toEqual([]);
  });

  it('no NMS dimension uses ktsubtype__snmp/st_interface prefix', () => {
    const allNmsDims = [...snmpDeviceDims, ...snmpInterfaceDims, ...stInterfaceDims];
    const legacy = allNmsDims.filter(
      (d) => d.value.includes('ktsubtype__snmp') || d.value.includes('ktsubtype__st_interface')
    );
    expect(legacy.map((d) => d.value)).toEqual([]);
  });

  it('no metric value or unit contains wrong long-form prefix (snmp_interface_metrics or st_interface_metrics)', () => {
    const wrong = allMetricOptions.filter(
      (m) =>
        m.value.includes('snmp_interface_metrics') || m.unit?.includes('snmp_interface_metrics') ||
        m.value.includes('st_interface_metrics') || m.unit?.includes('st_interface_metrics')
    );
    expect(wrong.map((m) => m.value)).toEqual([]);
  });
});
