import { getFields } from 'data/ast';
import { Format } from 'types';
import { isString } from 'lodash';

export const getFormat = (sql: string, selectedFormat: Format): Format => {
  if (selectedFormat === Format.AUTO) {
    // convention to format as time series
    // first field as "time" alias and requires at least 2 fields (time and metric)
    const selectList = getFields(sql);
    // if there are more than 2 fields, index 1 will be a ','
    if (selectList.length >= 2 && isString(selectList[0])) {
      const firstProjection = selectList[0].trim().toLowerCase();
      if (firstProjection.endsWith('as time')) {
        return Format.TIMESERIES;
      }
      if (firstProjection.endsWith('as log_time')) {
        return Format.LOGS;
      }
    }
    return Format.TABLE;
  }
  return selectedFormat;
};
