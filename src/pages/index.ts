import { deviceList } from './DeviceList';
import { deviceDetails } from './DeviceDetails';
// import { AddDevice } from './AddDevice';

import { AppRootProps } from '@grafana/data';

export type PageDefinition = {
  component: React.FC<AppRootProps>;
  icon: string;
  id: string;
  text: string;
};

export const pages: PageDefinition[] = [
  {
    component: deviceList,
    icon: 'file-alt',
    id: 'device-list',
    text: 'Device List',
  },
  {
    component: deviceDetails,
    icon: 'file-alt',
    id: 'device-details',
    text: 'Device Details',
  },
  // {
  //   component: AddDevice,
  //   icon: 'file-alt',
  //   id: 'add-device',
  //   text: 'Add Device',
  // }
];
