import { PanelPlugin } from '@grafana/data';
import { DescriptionPanel } from '../../components/DescriptionPanel';

export const plugin = new PanelPlugin<{}>(DescriptionPanel);
