import { test, expect } from '@grafana/plugin-e2e';

test('smoke: config editor renders credential fields', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  // The config editor should show the Kentik credential fields
  await expect(page.getByText('Email')).toBeVisible();
  await expect(page.getByPlaceholder('email')).toBeVisible();
  await expect(page.getByText('API Token')).toBeVisible();
  await expect(page.getByText('US (default)')).toBeVisible();
  await expect(page.getByText('EU')).toBeVisible();
  await expect(page.getByText('Custom')).toBeVisible();
});
