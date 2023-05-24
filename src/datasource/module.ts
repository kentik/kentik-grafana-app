import { KentikDataSource, KentikQuery } from './new_datasource';
import { DataSourcePlugin } from '@grafana/data';

import { QueryEditor } from './query_editor/QueryEditor';

export const plugin = new DataSourcePlugin<KentikDataSource, KentikQuery, {}>(KentikDataSource).setQueryEditor(
  QueryEditor
);
