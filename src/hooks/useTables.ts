import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, database: string): string[] => {
  const [tables, setTables] = useState<string[]>([]); 
  
  useEffect(() => {
    if (!datasource || !database) {
      return;
    }

    datasource.
      fetchTables(database).
      then(tables => setTables(tables)).
      catch((ex: any) => {
        console.error(ex);
      });
    }, [datasource, database]);
    
    return tables;
}
