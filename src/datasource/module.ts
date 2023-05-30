import { ConfigEditor } from './ConfigEditor';
import { KentikDataSource, KentikQuery } from './datasource';
import { QueryEditor } from './QueryEditor';

import { DataSourcePlugin } from '@grafana/data';

export const plugin = new DataSourcePlugin<KentikDataSource, KentikQuery, {}>(KentikDataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
