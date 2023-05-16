import React, { PureComponent } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { KentikDataSource, KentikQuery } from '../new_datasource';
import { VerticalGroup, HorizontalGroup, Input, Label, AsyncSelect } from '@grafana/ui';
import _ from 'lodash';

type MyDataSourceOptions = {}; 
type Props = QueryEditorProps<KentikDataSource, KentikQuery, MyDataSourceOptions>;

export class QueryEditor extends PureComponent<Props> {
  async getMetrics(): Promise<any[]> {
    return this.getMetricSegments('metrics()', '$metric');
  }

  async getDevices(): Promise<any[]> {
    return this.getMetricSegments('devices()', '$device');
  }

  async getSites(): Promise<any[]> {
    return this.getMetricSegments('sites()');
  }

  async getUnits(): Promise<any[]> {
    return this.getMetricSegments('units()', '$unit');
  }

  async getMetricSegments(query: string, variableName?: string, addTemplateVars = false): Promise<any[]> {
    let metrics = await this.datasource.metricFindQuery(query, this.target);
    if (this.templateSrv.variableExists(variableName)) {
      metrics = [{ text: variableName }, ...metrics];
    }
    return metrics;
  }

  convertToSelectableValues(values: string[]): SelectableValue<string>[] {
    return _.map(values, (value: string) => ({ value }));
  }

  render() {
    return (
      <VerticalGroup>
        <HorizontalGroup>
          <Label>Device</Label>
          <AsyncSelect
            value={}
            onChange={(e) => this.props.onChange({ ...this.props.query })}
          />
          <Label>Site</Label>
          <Input
            type="number"
            label="select site"
            value={this.props.query.device}
            onChange={(e) => this.props.onChange({ ...this.props.query })}
          />
        </HorizontalGroup>
        <HorizontalGroup>
          <Label>Mertic</Label>
          <Input
            type="number"
            label="select metric"
            value={this.props.query.device}
            onChange={(e) => this.props.onChange({ ...this.props.query })}
          />
          <Label>Unit</Label>
          <Input
            type="number"
            label="select unit"
            value={this.props.query.device}
            onChange={(e) => this.props.onChange({ ...this.props.query })}
          />
          <Label>Data mode</Label>
          <Input
            type="number"
            label="select mode"
            value={this.props.query.device}
            onChange={(e) => this.props.onChange({ ...this.props.query })}
          />
        </HorizontalGroup>
        <HorizontalGroup>
          <Label>DNS Lookup</Label>
          <Input
            type="number"
            label="select dns"
            value={this.props.query.device}
            onChange={(e) => this.props.onChange({ ...this.props.query })}
          />
          <Label>Prefix</Label>
          <Input
            type="string"
            label=""
            value={this.props.query.device}
            onChange={(e) => this.props.onChange({ ...this.props.query })}
          />
        </HorizontalGroup>
      </VerticalGroup>
    );
  }
}