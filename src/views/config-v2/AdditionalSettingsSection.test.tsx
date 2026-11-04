import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DataSourceSrv, setDataSourceSrv } from '@grafana/runtime';
import allLabels from 'labels';
import { AdditionalSettingsSection } from './AdditionalSettingsSection';
import { createTestProps } from './helpers';

const tempo = { uid: 'tempo-uid', type: 'tempo', name: 'Tempo', meta: { info: { logos: { small: '' } } } };

describe('AdditionalSettingsSection', () => {
  beforeEach(() => {
    setDataSourceSrv({
      getList: () => [tempo],
      getInstanceSettings: (ref: unknown) => (ref === tempo.uid || ref === tempo.name ? tempo : undefined),
    } as unknown as DataSourceSrv);
  });

  it('saves the "View trace" data source picked in all databases mode', () => {
    const onOptionsChange = jest.fn();
    const props = createTestProps({
      options: { jsonData: { configMode: 'classic', logs: { defaultTable: 'otel_logs' } } },
      mocks: { onOptionsChange },
    });

    render(<AdditionalSettingsSection {...props} />);
    onOptionsChange.mockClear();
    const label = allLabels.components.Config.LogsConfig.traceIdCorrelation.traceLinkDatasource.label;
    fireEvent.keyDown(screen.getByLabelText(new RegExp(`^${label}`)), { key: 'ArrowDown' });
    fireEvent.click(screen.getByText('Tempo'));

    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          logs: { defaultTable: 'otel_logs', traceLinkDatasourceUid: 'tempo-uid' },
        }),
      })
    );
  });
});
