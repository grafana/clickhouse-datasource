import { SelectedColumn } from "types/queryBuilder";
import { columnFilterDateTime, columnFilterOr, columnFilterString } from "./columnFilters";

describe('columnFilterDateTime', () => {
  it.each<{ col: SelectedColumn, expected: boolean }>([
    { col: { name: 't', type: 'Date' }, expected: true },
    { col: { name: 't', type: 'DateTime' }, expected: true },
    { col: { name: 't', type: 'Nullable(DateTime)' }, expected: true },
    { col: { name: 't', type: 'DateTime64' }, expected: true },
    { col: { name: 't', type: 'DateTime64(9)' }, expected: true },
    { col: { name: 't', type: 'date' }, expected: true },
    { col: { name: 't', type: 'datEtIME' }, expected: true },

    { col: { name: 't', type: 'String' }, expected: false },
    { col: { name: 't', type: 'Int64' }, expected: false },
    { col: { name: 't', type: 'Dat' }, expected: false },
    { col: { name: 't', type: 'DaTme' }, expected: false },
    { col: { name: 't', type: 'nullaBLE(DaTme)' }, expected: false },
  ])('returns $expected for case $# ("$col.type")', ({ col, expected }) => {
    expect(columnFilterDateTime(col)).toBe(expected);
  });
});

describe('columnFilterString', () => {
  it.each<{ col: SelectedColumn, expected: boolean }>([
    { col: { name: 't', type: 'String' }, expected: true },
    { col: { name: 't', type: 'LowCardinality(String)' }, expected: true },
    { col: { name: 't', type: 'LowCardinality(Nullable(String))' }, expected: true },
    { col: { name: 't', type: 'newFeature(nullable(string))' }, expected: true },
    { col: { name: 't', type: 'string' }, expected: true },

    { col: { name: 't', type: 'Int64' }, expected: false },
    { col: { name: 't', type: 'str' }, expected: false },
    { col: { name: 't', type: 'Date' }, expected: false },
    { col: { name: 't', type: 'DateTime' }, expected: false },
  ])('returns $expected for case $# ("$col.type")', ({ col, expected }) => {
    expect(columnFilterString(col)).toBe(expected);
  });
});

describe('columnFilterOr', () => {
  it('matches no filters using logical OR operator', () => {
    const col: SelectedColumn = { name: 't', type: 'invalid' };
    expect(
      columnFilterOr(col,
        columnFilterString,
        columnFilterDateTime,
      )
    ).toBe(false);
  });

  it('compares multiple filters using logical OR operator, matching first', () => {
    const col: SelectedColumn = { name: 't', type: 'String' };
    expect(
      columnFilterOr(col,
        columnFilterString,
        columnFilterDateTime,
      )
    ).toBe(true);
  });

  it('compares multiple filters using logical OR operator, matching last', () => {
    const col: SelectedColumn = { name: 't', type: 'String' };
    expect(
      columnFilterOr(col,
        columnFilterDateTime,
        columnFilterString,
      )
    ).toBe(true);
  });
});
