import { DescriptionPanel } from '../../components/DescriptionPanel';

import { PanelPlugin } from '@grafana/data';

export const plugin = new PanelPlugin<{}>(DescriptionPanel);
