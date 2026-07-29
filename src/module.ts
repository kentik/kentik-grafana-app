import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource/DataSource';
import { ConfigEditor } from './ConfigEditor';
import { MyDataSourceOptions } from './types';
import { UDEQueryTarget } from './datasource/ude_types';
import { UDEQueryEditor } from './datasource/ude_editor';

export const plugin = new DataSourcePlugin<DataSource, UDEQueryTarget, MyDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(UDEQueryEditor as any);

