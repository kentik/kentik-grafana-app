import { KentikDataSource, KentikQuery } from './new_datasource';
import { QueryEditor } from './query_editor/QueryEditor';

import { DataSourcePlugin } from '@grafana/data';

export const plugin = new DataSourcePlugin<KentikDataSource, KentikQuery, {}>(KentikDataSource).setQueryEditor(
  QueryEditor
);
