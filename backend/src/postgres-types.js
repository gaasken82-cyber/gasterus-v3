// PostgreSQL built-in OID 1082 is DATE.
// Calendar dates must remain date-only strings. Converting them to JavaScript Date
// introduces process-timezone semantics and changes the member API wire contract.
export const POSTGRES_DATE_OID = 1082;

export function parsePostgresDate(value) {
  return value;
}

export function configurePostgresTypeParsers(types) {
  if (!types || typeof types.setTypeParser !== 'function') {
    throw new TypeError('PostgreSQL types registry with setTypeParser() is required');
  }
  types.setTypeParser(POSTGRES_DATE_OID, parsePostgresDate);
}
