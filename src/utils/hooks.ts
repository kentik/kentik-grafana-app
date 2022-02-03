import { AppRootProps, NavModelItem } from '@grafana/data';
import { PageDefinition } from 'pages';
import { useMemo } from 'react';
import { APP_TITLE, APP_SUBTITLE } from './consts';

type Args = {
  meta: AppRootProps['meta'];
  pages: PageDefinition[];
  path: string;
  tab: string;
};

export function useNavModel({ meta, pages, path, tab }: Args) {
  return useMemo(() => {
    const tabs: NavModelItem[] = [];

    pages.forEach(({ text, icon, id }) => {
      if (tab === id) {
        tabs.push({
          text,
          icon,
          id,
          url: `${path}?tab=${id}`,
          active: true
        });
      }
    });

    if (tabs.length === 0) {
      tabs.push({
        ...pages[0],
        active: true
      });
    }

    const node = {
      text: APP_TITLE,
      img: meta.info.logos.large,
      subTitle: APP_SUBTITLE,
      url: path,
      children: tabs,
    };

    return {
      node,
      main: node,
    };
  }, [meta.info.logos.large, pages, path, tab]);
}
