import { migrateCHQuery } from "data/migration";
import { CHQuery } from "types/sql";

export default (currentQuery: CHQuery): CHQuery => {
  const migratedQuery = migrateCHQuery(currentQuery);
  return migratedQuery === undefined ? currentQuery : migratedQuery;
}
