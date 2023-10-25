import { useState, useEffect } from 'react';
import { TableColumn } from 'types/queryBuilder';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, database: string, table: string): readonly TableColumn[] => {
  const [columns, setColumns] = useState<readonly TableColumn[]>([]); 
  
  useEffect(() => {
    if (!datasource || !database || !table) {
      return;
    }

    datasource
      .fetchColumnsFull(database, table)
      .then(columns => setColumns(columns))
      .catch((ex: any) => {
        console.error(ex);
      });
    }, [datasource, database, table]);
    
    return columns;
}
