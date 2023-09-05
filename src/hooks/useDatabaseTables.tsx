import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, database: string): string[] => {
  const [tables, setTables] = useState<string[]>([]); 
  
  useEffect(() => {
    const fetchDatabaseTables = async () => {
      datasource.
        fetchTables(database).
        then(tables => setTables(tables)).
        catch((ex: any) => {
          console.error(ex);
          throw ex;
        });
      };

      if (database) {
        fetchDatabaseTables();
      }
    }, [datasource, database]);
    
    return tables;
}
