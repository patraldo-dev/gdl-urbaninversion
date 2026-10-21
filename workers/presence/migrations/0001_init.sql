-- 0001: presence aggregates (D1)
--
-- Privacy invariants:
--   * counts only — no identifiers, handles, dids, IPs or positions ever
--   * time resolution is the 15-minute bucket; no per-event rows exist
--   * rows are written only by the Durable Object flush after
--     rollup-then-suppress: sparse child cells roll up to their parent
--     geohash first, and the parent row is written only if it still clears
--     K_ANON. K_ANON lives in environment config, so it is enforced in
--     worker code, not in this schema.

CREATE TABLE IF NOT EXISTS presence_metrics (
  bucket_start   INTEGER NOT NULL CHECK (bucket_start % 900 = 0),
  geohash4       TEXT    NOT NULL CHECK (length(geohash4) = 4),
  open_count     INTEGER NOT NULL CHECK (open_count     >= 0),
  quiet_count    INTEGER NOT NULL CHECK (quiet_count    >= 0),
  observer_count INTEGER NOT NULL CHECK (observer_count >= 0),
  written_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  PRIMARY KEY (bucket_start, geohash4)
) WITHOUT ROWID;
