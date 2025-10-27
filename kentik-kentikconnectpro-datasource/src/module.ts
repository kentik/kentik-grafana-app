import { DataSourcePlugin } from '@grafana/data';
import { KentikDataSource, KentikQuery } from './datasource/datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { MyDataSourceOptions } from './types';
import { QueryEditor } from 'datasource/QueryEditor';

export const plugin = new DataSourcePlugin<KentikDataSource, KentikQuery, MyDataSourceOptions>(KentikDataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
