import SqlToAST from 'data/ast';
import { Format } from 'types';
import { isString } from 'lodash';

export const getFormat = (sql: string): Format => {
  // convention to format as time series
  // first field as "time" alias and requires at least 2 fields (time and metric)
  const ast = SqlToAST(sql);
  const select = ast.get('SELECT');
  if (isString(select)) {
    // remove function parms that may contain commas
    const cleanSelect = select.replace(/\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/, '');
    const fields = cleanSelect.split(',');
    if (fields.length > 1) {
      return fields[0].toLowerCase().endsWith('as time') ? Format.TIMESERIES : Format.TABLE;
    }
  }
  return Format.TABLE;
};
