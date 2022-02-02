import sqlToAST from 'data/ast';
import { Format } from 'types';
import { isString } from 'lodash';

export const getFormat = (sql: string): Format => {
  // convention to format as time series
  // first field as "time" alias and requires at least 2 fields (time and metric)
  const ast = sqlToAST(sql);
  const selectList = ast.get('SELECT') || [];
  if (selectList.length > 0 && isString(selectList[0])) {
    // remove function parms that may contain commas
    const cleanSelect = selectList[0].replace(/\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/, '');
    const fields = cleanSelect.split(',');
    if (fields.length > 1) {
      return fields[0].toLowerCase().endsWith('as time') ? Format.TIMESERIES : Format.TABLE;
    }
  }
  return Format.TABLE;
};
