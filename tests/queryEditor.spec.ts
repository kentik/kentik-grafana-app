import { test, expect } from '@grafana/plugin-e2e';

test('smoke: query editor renders the measurement selector', async ({
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

  // The UDE query editor always renders the Measurement field first. Downstream
  // fields (units/metrics, dimensions, filters, response format) only appear once
  // a measurement is selected, which requires a live dictionary API that is not
  // available in CI — so the reliable, API-independent assertion is the Measurement
  // field and its selector placeholder, both of which render immediately.
  await expect(queryRow.getByText('Measurement', { exact: true })).toBeVisible();
  await expect(queryRow.getByText('Select measurement...')).toBeVisible();
});

test('smoke: measurement selector opens and is searchable', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'kentik-e2e-test.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });

  const queryRow = panelEditPage.getQueryEditorRow('A');

  // The selector button is disabled while the dictionary loads; wait for it to
  // settle (the API call resolves or fails fast without credentials) before clicking.
  const trigger = queryRow.getByRole('button', { name: /Select measurement/ });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  // Opening the dropdown reveals the search box. With no credentials the catalog is
  // empty, so the empty-state message is shown — both are API-independent.
  await expect(queryRow.getByPlaceholder('Search measurements...')).toBeVisible();
  await expect(queryRow.getByText('No measurements found')).toBeVisible();
});
