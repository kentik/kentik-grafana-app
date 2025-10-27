import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource/DataSource';
import { ConfigEditor } from './ConfigEditor';
import { MyDataSourceOptions } from './types';
import { QueryEditor, Query } from 'datasource/QueryEditor';

export const plugin = new DataSourcePlugin<DataSource, Query, MyDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
