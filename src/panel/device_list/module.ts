import { PanelPlugin } from '@grafana/data';
import { DeviceListPanel } from '../../components/DeviceList';

export const plugin = new PanelPlugin<{}>(DeviceListPanel);
