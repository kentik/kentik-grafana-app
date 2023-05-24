import { PanelPlugin } from '@grafana/data';
import { DesriptionPanel } from '../../components/Description';

export const plugin = new PanelPlugin<{}>(DesriptionPanel);