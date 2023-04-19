import { PanelPlugin, FieldColorModeId } from '@grafana/data';
import { deviceListPanel } from '../../components/DeviceList';

export const plugin = new PanelPlugin<{}>(deviceListPanel)
  .useFieldConfig({
    standardOptions: {
      color: {
        defaultValue: {
          mode: FieldColorModeId.ContinuousGrYlRd,
        },
      },
    },
  });