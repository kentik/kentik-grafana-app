import { test, expect } from '@grafana/plugin-e2e';

test('smoke: query editor renders all field sections', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  // Navigate directly to a provisioned dashboard's panel edit page. This avoids the
  // brittle DashboardPage.addPanel() UI flow which has compatibility issues across
  // Grafana 11.x/12.x/13.x and the various plugin-e2e versions (the toolbar "Add"
  // button is not reliably present on a freshly-created empty dashboard with scenes).
  const dashboard = await readProvisionedDashboard({ fileName: 'kentik-e2e-test.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });

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
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'kentik-e2e-test.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });

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
