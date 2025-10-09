import { SelectedColumn } from 'types/queryBuilder';

export const columnFilterDateTime = (s: SelectedColumn): boolean => (s.type || '').toLowerCase().includes('date');
export const columnFilterString = (s: SelectedColumn): boolean =>
  (s.type || '').toLowerCase().includes('string') || (s.type || '').toLowerCase().includes('enum');
export const columnFilterOr = (
  s: SelectedColumn,
  ...filterFuncs: ReadonlyArray<(s: SelectedColumn) => boolean>
): boolean => {
  for (let filterFn of filterFuncs) {
    if (filterFn(s)) {
      return true;
    }
  }

  return false;
};
