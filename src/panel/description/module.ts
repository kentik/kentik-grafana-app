import { PanelPlugin } from '@grafana/data';
import { DescriptionPanel } from '../../components/Description';

export const plugin = new PanelPlugin<{}>(DescriptionPanel);
