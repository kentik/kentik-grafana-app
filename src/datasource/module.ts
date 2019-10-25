// KentikAPI is imported to be injected by Angular
import './kentik_api';

import { KentikDatasource } from './datasource';
import { ConfigCtrl } from './config';
import { KentikQueryCtrl } from './query_editor';

export { KentikDatasource as Datasource, ConfigCtrl, KentikQueryCtrl as QueryCtrl };
