import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource): string[] => {
  const [databases, setDatabases] = useState<string[]>([]); 
  
  useEffect(() => {
    if (!datasource) {
      return;
    }

    datasource.
      fetchDatabases().
      then(databases => setDatabases(databases)).
      catch((ex: any) => {
        console.error(ex);
        throw ex;
      });
    }, [datasource]);
    
    return databases;
}
