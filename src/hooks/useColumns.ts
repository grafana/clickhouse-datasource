import { useState, useEffect } from 'react';
import { TableColumn } from 'types/queryBuilder';
import { Datasource } from 'data/CHDatasource';

const allColumn = { name: '*', label: 'ALL', type: 'string', picklistValues: [] };

export default (datasource: Datasource, database: string, table: string): TableColumn[] => {
  const [columns, setColumns] = useState<TableColumn[]>([allColumn]); 
  
  useEffect(() => {
    if (!datasource || !database || !table) {
      return;
    }

    datasource
      .fetchColumnsFull(database, table)
      .then(columns => {
        columns.push(allColumn);
        setColumns(columns);
      }).catch((ex: any) => {
        console.error(ex);
        throw ex;
      });
    }, [datasource, database, table]);
    
    return columns;
}
