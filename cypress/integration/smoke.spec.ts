import { e2e } from '@grafana/e2e';
import dedent from 'dedent';

// @todo this actually returns type `Cypress.Chainable`
const addClickhouseDataSource = (server: string, port: string, user: string): any => {
  const fillCommonField = (name: string, newValue: string) =>
    e2e()
      .get('form')
      .find(`input[name='${name}']`)
      .scrollIntoView()
      .type(newValue);

  const toggle = (name: string) =>
    e2e()
      .get('form')
      .find(`[for='${name}']`)
      // .scrollIntoView()
      .click();

  return e2e.flows.addDataSource({
    checkHealth: false,
    expectedAlertMessage: 'Data source is working',
    form: () => {
      toggle('secure');
      fillCommonField('server', server);
      fillCommonField('port', port);
      fillCommonField('user', user);
    },
    type: 'ClickHouse',
  });
};

const addClickhousePanel = (query: string) => {
  const fillQuery = () =>
    e2e()
      // workaround - e2e selector for RefreshPicker on 8.3+ is wrong
      // adding fake button to dom
      .document()
      .then($document => {
        const toolbar = $document.querySelector('.page-toolbar');
        if (toolbar) {  // grafana 8.3+
          const f = $document.createElement('button');
          // old e2e selector looks for this
          f.setAttribute('aria-label', 'RefreshPicker run button');
          f.innerHTML = 'Refresh';
          f.style.zIndex = '5000';
          toolbar!.appendChild(f);
        }
      })
      // end workaround
      .get('.query-editor-row').contains('SQL Editor')
      .click()
      .get('.monaco-editor textarea')
      .scrollIntoView()
      // @todo https://github.com/cypress-io/cypress/issues/8044
      .type(Cypress.platform === 'darwin' ? '{cmd}a' : '{ctrl}a')
      .type('{backspace}')
      .then($elm => {
        // `.type()` caused issues with autocomplete and template variables
        // @todo fix weird whitespace issues caused by this approach
        const event = new Event('input', { bubbles: true, cancelable: true });
        const textarea = $elm.get(0) as HTMLTextAreaElement;
        textarea.value = query;
        textarea.dispatchEvent(event);
      })
      .type(Cypress.platform === 'darwin' ? '{cmd}s' : '{ctrl}s');

  // This gets auto-removed within `afterEach` of @grafana/e2e
  e2e.flows.addPanel({
    // matchScreenshot: true,
    queriesForm: () => {
      e2e.components.QueryEditorRows.rows().within(() => fillQuery());
    },
  });

  // @todo uncomment when possible (Cypress `visit()` issue)
  /*e2e.flows.explore({
    matchScreenshot: true,
    queriesForm: () => fillQuery(),
  });*/
};

e2e.scenario({
  describeName: 'Smoke tests',
  itName: 'Login, create data source, dashboard and panel',
  scenario: () => {
    e2e()
      .readProvisions([
        // Paths are relative to <project-root>/provisioning
        'datasources/clickhouse.yaml',
      ])
      .then(([provision]) => {
        const datasource = provision.datasources[0];
        // This gets auto-removed within `afterEach` of @grafana/e2e
        return addClickhouseDataSource(
          datasource.jsonData.server,
          datasource.jsonData.port,
          datasource.jsonData.username
        );
      })
      .then(() => {
        // This gets auto-removed within `afterEach` of @grafana/e2e
        e2e.flows.addDashboard({
          timeRange: {
            from: '2016-06-14 00:00:00',
            to: '2016-06-18 00:00:00',
          },
        });
        const query = dedent`
        select * from 
        (select toDateTime('2016-06-15 23:00:00') as time, 5 as value union all 
        (select toDateTime('2016-06-16 23:00:00') as time, 10 as value union all 
        (select toDateTime('2016-06-17 23:00:00') as time, 20 as value))) as foo
        order by foo.value asc
        `;

        // This gets auto-removed within `afterEach` of @grafana/e2e
        addClickhousePanel(query);
      });
  },
});
