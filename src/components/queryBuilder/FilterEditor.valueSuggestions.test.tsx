import React, { useState } from 'react';
import { NEVER, Observable, of } from 'rxjs';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataQueryRequest, DataQueryResponse, dateTime, TimeRange, toDataFrame } from '@grafana/data';
import { FiltersEditor } from './FilterEditor';
import { getDefaultTraceFilters } from './defaultQueryOptions';
import { ColumnHint, Filter, FilterOperator, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { CHQuery } from 'types/sql';
import { newMockDatasource } from '__mocks__/datasource';

const mockTemplateSrv: { timeRange?: TimeRange } = {};
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual<object>('@grafana/runtime'),
  getTemplateSrv: () => mockTemplateSrv,
}));
jest.mock('react-inlinesvg', () => {
  const { createElement } = jest.requireActual<typeof React>('react');
  return {
    __esModule: true,
    default: ({ title, className, onClick }: { title?: string; className?: string; onClick?: () => void }) =>
      createElement('svg', { title, className, onClick }),
  };
});

const sizeProperties = ['offsetHeight', 'offsetWidth'] as const;
const savedDescriptors = sizeProperties.map((p) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, p));

beforeAll(() => {
  sizeProperties.forEach((p) => Object.defineProperty(HTMLElement.prototype, p, { configurable: true, value: 500 }));
});

afterAll(() => {
  sizeProperties.forEach((p, i) => {
    const descriptor = savedDescriptors[i];
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, p, descriptor);
    }
  });
});

afterEach(() => {
  Reflect.deleteProperty(mockTemplateSrv, 'timeRange');
});

const allColumns: TableColumn[] = [
  { name: 'ts', type: 'DateTime', picklistValues: [] },
  { name: 'service', type: 'String', picklistValues: [] },
];

const stringFilter = (operator: FilterOperator, value: string | string[], type = 'String', key = 'service'): Filter =>
  ({ filterType: 'custom', condition: 'AND', key, type, operator, value }) as Filter;

const frameOf = (values: unknown[]): DataQueryResponse => ({
  data: [toDataFrame({ fields: [{ name: 'v', values }] })],
});

const stubDatasource = (
  respond: (rawSql: string) => Observable<DataQueryResponse> = () => of(frameOf(['api', 'db', 'worker']))
) => {
  const datasource = newMockDatasource();
  const requests: Array<{ rawSql: string; range: TimeRange }> = [];
  const query = jest.spyOn(datasource, 'query').mockImplementation((request: DataQueryRequest<CHQuery>) => {
    requests.push(...request.targets.map((t) => ({ rawSql: t.rawSql, range: request.range })));
    const rawSql = request.targets[0]?.rawSql ?? '';
    return rawSql.includes('system.columns') ? of(frameOf([1])) : respond(rawSql);
  });
  return { datasource, requests, query };
};

const renderFilters = ({
  filters,
  selectedColumns,
  database = 'default',
  table = 'filter_values',
  datasource = stubDatasource().datasource,
  parentDelayMs,
}: {
  filters: Filter[];
  selectedColumns?: SelectedColumn[];
  database?: string;
  table?: string;
  datasource?: ReturnType<typeof stubDatasource>['datasource'];
  parentDelayMs?: number;
}) => {
  const onFiltersChange = jest.fn();
  const Harness = () => {
    const [current, setCurrent] = useState(filters);
    return (
      <>
        <FiltersEditor
          allColumns={allColumns}
          filters={current}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            if (parentDelayMs === undefined) {
              setCurrent(next);
            } else {
              setTimeout(() => setCurrent(next), parentDelayMs);
            }
          }}
          datasource={datasource}
          database={database}
          table={table}
          selectedColumns={selectedColumns}
        />
        <button>outside</button>
      </>
    );
  };
  render(<Harness />);
  return onFiltersChange;
};

const singleInput = () =>
  within(screen.getByTestId('query-builder-filters-single-string-value-container')).getByRole('combobox');
const multiInput = () =>
  within(screen.getByTestId('query-builder-filters-multi-string-value-container')).getByRole('combobox');
const clickOutside = () => userEvent.click(screen.getByText('outside'));
const lastValue = (onFiltersChange: jest.Mock) => onFiltersChange.mock.lastCall?.[0]?.[0]?.value;
const storedValues = (onFiltersChange: jest.Mock) => onFiltersChange.mock.calls.map((call) => call[0]?.[0]?.value);
const pickOperator = async (from: string, to: string) => {
  await userEvent.click(screen.getByDisplayValue(from));
  await userEvent.click(await screen.findByRole('option', { name: to }));
};

describe('FiltersEditor value suggestions (#2210)', () => {
  it('suggests distinct column values for a string = filter', async () => {
    const { datasource, requests, query } = stubDatasource();
    const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, '')], datasource });

    expect(query).not.toHaveBeenCalled();

    await userEvent.type(singleInput(), 'a');

    await waitFor(() =>
      expect(requests.map((r) => r.rawSql)).toContain(
        `SELECT DISTINCT toString("service") FROM (SELECT "service" FROM "default"."filter_values" LIMIT 100000) WHERE "service" != '' AND isValidUTF8(toString("service")) AND length(toString("service")) <= 256 AND positionCaseInsensitiveUTF8(toString("service"), 'a') > 0 LIMIT 1000`
      )
    );
    await userEvent.click(await screen.findByRole('option', { name: 'api' }));
    expect(onFiltersChange).toHaveBeenLastCalledWith([expect.objectContaining({ key: 'service', value: 'api' })]);
  });

  it.each<[string, SelectedColumn[]]>([
    [
      'typed columns',
      [
        { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'ServiceName', type: 'LowCardinality(String)', hint: ColumnHint.TraceServiceName },
      ],
    ],
    [
      'OTel columns without a type',
      [
        { name: 'Timestamp', hint: ColumnHint.Time },
        { name: 'ServiceName', hint: ColumnHint.TraceServiceName },
      ],
    ],
    [
      'an aliased value column',
      [
        { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'ServiceName', type: 'LowCardinality(String)', hint: ColumnHint.TraceServiceName, alias: 'svc' },
      ],
    ],
  ])('bounds the hinted Service Name probe to the time filter column with %s', async (_, selectedColumns) => {
    const timeRange: TimeRange = {
      from: dateTime(1700000000000),
      to: dateTime(1700003600000),
      raw: { from: 'now-1h', to: 'now' },
    };
    mockTemplateSrv.timeRange = timeRange;
    const [timeFilter, , , serviceNameFilter] = getDefaultTraceFilters();
    const { datasource, requests } = stubDatasource();
    renderFilters({
      filters: [timeFilter, { ...serviceNameFilter, operator: FilterOperator.Equals } as Filter],
      selectedColumns,
      database: 'otel',
      table: 'otel_traces',
      datasource,
    });

    await userEvent.click(singleInput());

    await waitFor(() =>
      expect(requests).toContainEqual({
        rawSql: `SELECT DISTINCT toString("ServiceName") FROM (SELECT "ServiceName" FROM "otel"."otel_traces" WHERE "Timestamp" >= $__fromTime AND "Timestamp" <= $__toTime LIMIT 100000) WHERE "ServiceName" != '' AND isValidUTF8(toString("ServiceName")) AND length(toString("ServiceName")) <= 256 LIMIT 1000`,
        range: timeRange,
      })
    );
  });

  it('appends a picked value to an IN filter without committing the leftover search text', async () => {
    const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.In, [''])] });

    await userEvent.type(multiInput(), 'a');
    await userEvent.click(await screen.findByRole('option', { name: 'api' }));
    await clickOutside();

    expect(lastValue(onFiltersChange)).toEqual(['api']);
  });

  describe('single value free text', () => {
    it('stores typed text on click outside', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, '')] });

      await userEvent.type(singleInput(), 'zzz');
      await clickOutside();

      expect(lastValue(onFiltersChange)).toBe('zzz');
    });

    it('keeps the saved value when the menu is opened and left', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, 'api')] });

      await userEvent.click(singleInput());
      await screen.findByRole('option', { name: 'db' });
      await clickOutside();

      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('stores the highlighted row on ArrowDown and Tab', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, '')] });

      await userEvent.type(singleInput(), 'ap');
      await screen.findByRole('option', { name: 'api' });
      await userEvent.keyboard('{ArrowDown}{Tab}');

      expect(lastValue(onFiltersChange)).toBe('api');
    });

    it('stores an empty value on clear', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, 'api')] });

      await userEvent.click(screen.getByTitle('Clear value'));

      expect(lastValue(onFiltersChange)).toBe('');
    });

    it('keeps the saved value when the field is focused and left by keyboard', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, 'api')] });

      act(() => singleInput().focus());
      await userEvent.tab();

      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('keeps a picked value on Escape', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, 'api')] });

      await userEvent.click(singleInput());
      await userEvent.click(await screen.findByRole('option', { name: 'db' }));
      await userEvent.keyboard('{Escape}');

      expect(storedValues(onFiltersChange)).toEqual(['db']);
      expect(singleInput()).toHaveValue('db');
    });

    it('does not commit a picked value again when the parent re-renders late', async () => {
      const onFiltersChange = renderFilters({
        filters: [stringFilter(FilterOperator.Equals, 'api')],
        parentDelayMs: 50,
      });

      await userEvent.click(singleInput());
      await userEvent.click(await screen.findByRole('option', { name: 'db' }));
      await userEvent.tab();
      await act(() => new Promise((resolve) => setTimeout(resolve, 60)));

      expect(storedValues(onFiltersChange)).toEqual(['db']);
    });

    it.each<[string, () => Promise<void>]>([
      ['focused', async () => act(() => singleInput().focus())],
      [
        'opened and closed',
        async () => {
          await userEvent.click(singleInput());
          await screen.findByRole('option', { name: 'db' });
          await userEvent.keyboard('{Escape}');
        },
      ],
    ])('keeps the saved value on Escape when the field is %s', async (_, enter) => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, 'api')] });

      await enter();
      await userEvent.keyboard('{Escape}');

      expect(onFiltersChange).not.toHaveBeenCalled();
      expect(singleInput()).toHaveValue('api');
    });

    it('stores typed text on Enter when no suggestion is highlighted', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, '')] });

      await userEvent.type(singleInput(), 'ap');
      await userEvent.hover(await screen.findByRole('option', { name: 'api' }));
      await userEvent.unhover(screen.getByRole('listbox'));
      await userEvent.keyboard('{Enter}');

      expect(lastValue(onFiltersChange)).toBe('ap');
    });

    it('stores only the highlighted row on ArrowDown and Enter', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, '')] });

      await userEvent.type(singleInput(), 'ap');
      await screen.findByRole('option', { name: 'api' });
      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(storedValues(onFiltersChange)).toEqual(['api']);
    });

    it('lists the saved value first when the menu opens', async () => {
      renderFilters({ filters: [stringFilter(FilterOperator.Equals, 'worker')] });

      await userEvent.click(singleInput());
      await screen.findByRole('option', { name: 'api' });

      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['worker', 'api', 'db']);
    });

    it('shows a saved array value as comma separated text', () => {
      renderFilters({ filters: [stringFilter(FilterOperator.Equals, ['api', 'worker'])] });

      expect(singleInput()).toHaveValue('api,worker');
    });

    it('keeps the value when the operator changes from IN to =', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.In, ['api', 'db'])] });

      await pickOperator('IN', '=');

      expect(lastValue(onFiltersChange)).toEqual(['api', 'db']);
      expect(singleInput()).toHaveValue('api,db');
    });

    it('drops the suggestions of a removed filter from the filter that takes its row', async () => {
      const { datasource } = stubDatasource((rawSql) =>
        rawSql.includes('"level"') ? NEVER : of(frameOf(['api', 'db', 'worker']))
      );
      renderFilters({
        filters: [stringFilter(FilterOperator.Equals, ''), stringFilter(FilterOperator.Equals, '', 'String', 'level')],
        datasource,
      });

      const [serviceContainer] = screen.getAllByTestId('query-builder-filters-single-string-value-container');
      await userEvent.click(within(serviceContainer).getByRole('combobox'));
      await screen.findByRole('option', { name: 'api' });
      await userEvent.keyboard('{Escape}');
      await userEvent.click(screen.getAllByTestId('query-builder-filters-remove-button')[0]);
      await userEvent.click(singleInput());

      expect(screen.queryByRole('option', { name: 'api' })).toBeNull();
    });
  });

  describe('multi value free text', () => {
    it('appends comma separated typed text on click outside', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.In, ['api'])] });

      await userEvent.type(multiInput(), 'x, y');
      await clickOutside();

      expect(lastValue(onFiltersChange)).toEqual(['api', 'x', 'y']);
    });

    it('renders duplicate saved values as one pill without changing them (the crash it avoids is before Grafana 13.1)', () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.In, ['api', 'api', ''])] });

      expect(
        within(screen.getByTestId('query-builder-filters-multi-string-value-container')).getAllByText('api')
      ).toHaveLength(1);
      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('keeps an empty entry saved next to other values', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.In, ['', 'api'])] });

      await userEvent.click(multiInput());
      await userEvent.click(await screen.findByRole('option', { name: 'db' }));

      expect(lastValue(onFiltersChange)).toEqual(['', 'api', 'db']);
    });

    it('describes comma separated input when empty', () => {
      renderFilters({ filters: [stringFilter(FilterOperator.In, [''])] });

      expect(multiInput()).toHaveAttribute('placeholder', 'comma separated values');
    });

    it('does not commit the search text left after a pick', async () => {
      const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.In, [])] });

      await userEvent.type(multiInput(), 'ap');
      await userEvent.click(await screen.findByRole('option', { name: 'api' }));
      await clickOutside();

      expect(lastValue(onFiltersChange)).toEqual(['api']);
    });
  });

  it.each<[string, Filter, string, string]>([
    ['LIKE on String', stringFilter(FilterOperator.Like, ''), 'filter_values', 'single'],
    ['= on Enum8', stringFilter(FilterOperator.Equals, '', "Enum8('a' = 1)"), 'filter_values', 'single'],
    ['= on UUID', stringFilter(FilterOperator.Equals, '', 'UUID'), 'filter_values', 'single'],
    [
      '= on a Map key',
      { ...stringFilter(FilterOperator.Equals, '', 'Map(String, String)'), mapKey: 'region' } as Filter,
      'filter_values',
      'single',
    ],
    ['= on String without a table', stringFilter(FilterOperator.Equals, ''), '', 'single'],
    ['IN on Enum8', stringFilter(FilterOperator.In, [''], "Enum8('a' = 1)"), 'filter_values', 'multi'],
  ])('keeps the plain input and sends no value probe for %s', async (_, filter, table, kind) => {
    const { datasource, query } = stubDatasource();
    renderFilters({ filters: [filter], table, datasource });
    const callsAfterMount = query.mock.calls.length;

    const input =
      kind === 'single'
        ? screen.getByTestId('query-builder-filters-single-string-value-input')
        : screen.getByPlaceholderText('comma separated values');
    await userEvent.type(input, 'a');
    await clickOutside();

    expect(query).toHaveBeenCalledTimes(callsAfterMount);
  });

  it('offers the typed text without an error row when the probe fails', async () => {
    const { datasource } = stubDatasource();
    const fetchFilterValues = jest.spyOn(datasource, 'fetchFilterValues').mockRejectedValue(new Error('boom'));
    const onFiltersChange = renderFilters({ filters: [stringFilter(FilterOperator.Equals, '')], datasource });

    await userEvent.type(singleInput(), 'q');
    await waitFor(() =>
      expect(fetchFilterValues).toHaveBeenCalledWith('service', 'default', 'filter_values', { search: 'q' })
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.queryByText(/error occurred while loading options/i)).toBeNull();
    await userEvent.keyboard('{Enter}');
    expect(lastValue(onFiltersChange)).toBe('q');
  });

  it('keeps one debounced probe while the parent re-renders on every keystroke', async () => {
    const { datasource, requests } = stubDatasource();
    const filter = stringFilter(FilterOperator.Equals, '');
    const selectedColumns: SelectedColumn[] = [{ name: 'ts', type: 'DateTime' }];
    const Harness = () => {
      const [, setTick] = useState(0);
      return (
        <div onInput={() => setTick((tick) => tick + 1)}>
          <FiltersEditor
            allColumns={allColumns}
            filters={[{ ...filter }]}
            onFiltersChange={() => {}}
            datasource={datasource}
            database="default"
            table="filter_values"
            selectedColumns={[...selectedColumns]}
          />
        </div>
      );
    };
    render(<Harness />);

    await userEvent.type(singleInput(), 'abc');
    await waitFor(() => expect(requests.some((r) => r.rawSql.includes(`'abc'`))).toBe(true));

    const searchProbes = requests.map((r) => r.rawSql).filter((sql) => sql.includes('positionCaseInsensitiveUTF8'));
    expect(searchProbes).toHaveLength(1);
    expect(searchProbes[0]).toContain(`'abc'`);
  });
});
