import { test, expect } from '@grafana/plugin-e2e';

test('smoke: query editor renders all field sections', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  const queryRow = panelEditPage.getQueryEditorRow('A');

  // Core fields that should always render regardless of API state
  await expect(queryRow.getByText('Data Mode')).toBeVisible();
  await expect(queryRow.getByText('Sites')).toBeVisible();
  await expect(queryRow.getByText('Devices')).toBeVisible();
  await expect(queryRow.getByText('Dimensions')).toBeVisible();
  await expect(queryRow.getByText('Metric')).toBeVisible();
  await expect(queryRow.getByText('DNS Lookup')).toBeVisible();
  await expect(queryRow.getByText('Prefix')).toBeVisible();
  await expect(queryRow.getByText('Alias by')).toBeVisible();
  await expect(queryRow.getByText('Filters')).toBeVisible();
  await expect(queryRow.getByText('Visualization depth')).toBeVisible();
});

test('smoke: data mode toggle switches between graph and table', async ({
  panelEditPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  const queryRow = panelEditPage.getQueryEditorRow('A');

  // Data Mode is a Combobox — scope to its Field container to avoid matching other comboboxes
  const dataModeCombobox = queryRow.locator('div').filter({ hasText: /^Data Mode$/ }).getByRole('combobox');
  await expect(dataModeCombobox).toBeVisible();
  await expect(dataModeCombobox).toHaveValue('Graph');

  // Switch to Table via the combobox dropdown
  await dataModeCombobox.click();
  await page.getByRole('option', { name: 'Table' }).click();

  // Verify the combobox now shows "Table"
  await expect(dataModeCombobox).toHaveValue('Table');

  // Switch back to Graph
  await dataModeCombobox.click();
  await page.getByRole('option', { name: 'Graph' }).click();
  await expect(dataModeCombobox).toHaveValue('Graph');
});
