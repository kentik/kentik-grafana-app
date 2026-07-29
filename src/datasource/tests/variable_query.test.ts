import { resolveVariableQuery } from '../variable_query';
import { DictionaryResponse, MeasurementFamily } from '../dictionary_service';

const DICT: DictionaryResponse = {
  measurements: [
    {
      name: '/traffic',
      display_name: 'Traffic',
      family: MeasurementFamily.TRAFFIC,
      description: '',
      dimensions: [
        {
          key: 'src_geo_city',
          label: 'Source City',
          data_type: 'STRING',
          category: '',
          column: '',
          direction: '',
          inverse: '',
          values: { sfo: 'San Francisco', nyc: 'New York' },
          operator_set_key: 'STRING',
          filter_only: false,
          filter_column: '',
          query_column: '',
        },
        {
          key: 'hidden_dim',
          label: 'Hidden',
          data_type: 'STRING',
          category: '',
          column: '',
          direction: '',
          inverse: '',
          values: {},
          operator_set_key: 'STRING',
          filter_only: true,
          filter_column: '',
          query_column: '',
        },
      ],
      metrics: [
        {
          key: 'avg_bits_per_sec',
          label: 'Bits/s',
          data_type: 'FLOAT',
          category: '',
          column: '',
          direction: '',
          inverse: '',
          values: {},
          window_fn: '',
          aggregate_fn: '',
          expression: '',
          depends_on: [],
          to_bits: true,
          rollup: true,
          healthy_value: '',
          family_key: '',
          base_unit: '',
        },
      ],
    },
  ],
  operator_sets: [],
  metric_families: [],
};

describe('resolveVariableQuery', () => {
  it('measurements() returns all measurements', () => {
    const r = resolveVariableQuery('measurements()', DICT);
    expect(r).toEqual([{ text: 'Traffic', value: '/traffic' }]);
  });

  it('metrics(<m>) returns metric keys', () => {
    const r = resolveVariableQuery('metrics(/traffic)', DICT);
    expect(r).toEqual([{ text: 'Bits/s', value: 'avg_bits_per_sec' }]);
  });

  it('dimensions(<m>) excludes filter_only dimensions', () => {
    const r = resolveVariableQuery('dimensions(/traffic)', DICT);
    expect(r).toEqual([{ text: 'Source City', value: 'src_geo_city' }]);
  });

  it('dimension_values(<m>, <d>) returns labeled values', () => {
    const r = resolveVariableQuery('dimension_values(/traffic, src_geo_city)', DICT);
    expect(r).toEqual([
      { text: 'San Francisco', value: 'sfo' },
      { text: 'New York', value: 'nyc' },
    ]);
  });

  it('returns [] for unknown measurement', () => {
    expect(resolveVariableQuery('metrics(/nope)', DICT)).toEqual([]);
  });

  it('returns [] for unknown function', () => {
    expect(resolveVariableQuery('bogus()', DICT)).toEqual([]);
  });

  it('returns [] for malformed query', () => {
    expect(resolveVariableQuery('not a query', DICT)).toEqual([]);
    expect(resolveVariableQuery('', DICT)).toEqual([]);
  });

  it('tolerates extra whitespace', () => {
    const r = resolveVariableQuery('  measurements( )  ', DICT);
    expect(r).toEqual([{ text: 'Traffic', value: '/traffic' }]);
  });
});
