import { getFilterDisplayName } from './FilterTagBar';
import { ColumnHint, Filter, FilterOperator, SelectedColumn } from 'types/queryBuilder';

describe('getFilterDisplayName', () => {
  const selectedColumns: SelectedColumn[] = [
    { name: 'LogAttributes', hint: ColumnHint.LogAttributes },
    { name: 'SeverityText', hint: ColumnHint.LogLevel },
  ];

  const mapKeyFilter = (overrides: Partial<Filter>): Filter =>
    ({
      condition: 'AND',
      filterType: 'custom',
      type: 'Map(String, String)',
      operator: FilterOperator.Equals,
      value: 'proxy.access',
      mapKey: 'event.name',
      ...overrides,
    }) as Filter;

  it('renders the raw column name for a hinted map-key filter (the log-view "+" path)', () => {
    const filter = mapKeyFilter({ key: '', hint: ColumnHint.LogAttributes });
    expect(getFilterDisplayName(filter, selectedColumns)).toBe('LogAttributes.event.name');
  });

  it('renders the raw column name for a key-based map-key filter (the Add filter path)', () => {
    const filter = mapKeyFilter({ key: 'LogAttributes' });
    expect(getFilterDisplayName(filter, selectedColumns)).toBe('LogAttributes.event.name');
  });

  it('renders the log-view "+" and Add filter representations identically', () => {
    const hinted = mapKeyFilter({ key: '', hint: ColumnHint.LogAttributes });
    const keyed = mapKeyFilter({ key: 'LogAttributes' });
    expect(getFilterDisplayName(hinted, selectedColumns)).toBe(getFilterDisplayName(keyed, selectedColumns));
  });

  it('falls back to the hint label when no matching column is available', () => {
    const filter = mapKeyFilter({ key: '', hint: ColumnHint.LogAttributes });
    expect(getFilterDisplayName(filter, [])).toBe('log attributes.event.name');
  });

  it('resolves a non-map hinted filter to its column name', () => {
    const filter = {
      condition: 'AND',
      filterType: 'custom',
      key: '',
      hint: ColumnHint.LogLevel,
      type: 'string',
      operator: FilterOperator.Equals,
      value: 'info',
    } as Filter;
    expect(getFilterDisplayName(filter, selectedColumns)).toBe('SeverityText');
  });
});
