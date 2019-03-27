/* Extra SQL table for nomination locks. */

CREATE TABLE IF NOT EXISTS nomination_lock (
  doc_name TEXT PRIMARY KEY NOT NULL,
  locked_by TEXT NOT NULL,
  lock_id TEXT NOT NULL
);