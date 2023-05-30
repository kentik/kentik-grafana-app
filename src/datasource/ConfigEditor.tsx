import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import React, { PureComponent } from 'react';

interface Props extends DataSourcePluginOptionsEditorProps<{}> {}

interface State {
  text: string;
}

export class ConfigEditor extends PureComponent<Props, State> {
  render() {
    return <div></div>;
  }
}
