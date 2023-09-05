import { useState, useEffect } from 'react';
import { FullField } from 'types/queryBuilder';
import { Datasource } from 'data/CHDatasource';

const allColumn = { name: '*', label: 'ALL', type: 'string', picklistValues: [] };

export default (datasource: Datasource, database: string, table: string): FullField[] => {
  const [columns, setColumns] = useState<FullField[]>([allColumn]); 
  
  useEffect(() => {
    const fetchTableColumns = async () => {
      datasource
        .fetchFieldsFull(database, table)
        .then(columns => {
          columns.push(allColumn);
          setColumns(columns);
        }).catch((ex: any) => {
          console.error(ex);
          throw ex;
        });
      };

      if (database && table) {
        fetchTableColumns();
      }
    }, [datasource, database, table]);
    
    return columns;
}
