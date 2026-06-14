import React, { useMemo } from 'react';
import { Combobox, ComboboxOption } from '@grafana/ui';
import { MeasurementDetail, MeasurementFamily } from '../dictionary_service';

interface Props {
  measurements: MeasurementDetail[];
  value: string;
  onChange: (measurement: string) => void;
  isLoading: boolean;
}

const FAMILY_LABELS: Record<number, string> = {
  [MeasurementFamily.TRAFFIC]: 'Traffic',
  [MeasurementFamily.NMS]: 'NMS',
  [MeasurementFamily.NMS_INTERFACES]: 'NMS Interfaces',
  [MeasurementFamily.SYNTHETICS]: 'Synthetics',
  [MeasurementFamily.BGP]: 'BGP',
  [MeasurementFamily.EVENTS]: 'Events',
};

const FAMILY_ORDER = [
  MeasurementFamily.TRAFFIC,
  MeasurementFamily.NMS,
  MeasurementFamily.NMS_INTERFACES,
  MeasurementFamily.SYNTHETICS,
  MeasurementFamily.BGP,
  MeasurementFamily.EVENTS,
];

export const MeasurementSelector: React.FC<Props> = ({ measurements, value, onChange, isLoading }) => {
  const options = useMemo(() => {
    const grouped = new Map<number, MeasurementDetail[]>();
    for (const m of measurements) {
      const family = m.family || MeasurementFamily.UNSPECIFIED;
      if (!grouped.has(family)) {
        grouped.set(family, []);
      }
      grouped.get(family)!.push(m);
    }

    const result: ComboboxOption[] = [];
    for (const family of FAMILY_ORDER) {
      const items = grouped.get(family);
      if (items && items.length > 0) {
        const sorted = items.sort((a, b) => a.display_name.localeCompare(b.display_name));
        for (const item of sorted) {
          result.push({
            label: item.display_name || item.name,
            value: item.name,
            description: FAMILY_LABELS[family] || 'Other',
          });
        }
      }
    }

    // Add any with unspecified family
    const unspecified = grouped.get(MeasurementFamily.UNSPECIFIED);
    if (unspecified && unspecified.length > 0) {
      for (const item of unspecified.sort((a, b) => a.display_name.localeCompare(b.display_name))) {
        result.push({
          label: item.display_name || item.name,
          value: item.name,
          description: 'Other',
        });
      }
    }

    return result;
  }, [measurements]);

  return (
    <Combobox
      options={options}
      value={value || null}
      onChange={(opt) => {
        if (opt?.value) {
          onChange(opt.value);
        }
      }}
      placeholder="Select measurement..."
      loading={isLoading}
    />
  );
};
