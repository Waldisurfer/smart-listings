-- Single denormalized listings table. At ~100 read-mostly rows, normalizing
-- cities/images would be correct at scale and wrong here — one table keeps the
-- query surface flat and the code readable.
--
-- Collation utf8mb4_0900_ai_ci makes LIKE case- AND accent-insensitive, so
-- "krakow" matches "Kraków". (Polish collation would sort correctly but treat
-- ó as a distinct letter, breaking accent-insensitive search — verified on real
-- data.) Idempotent: CREATE TABLE IF NOT EXISTS, applied by db.ts on every boot,
-- so there is no separate migration step to forget.
CREATE TABLE IF NOT EXISTS listings (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source        ENUM('otodom') NOT NULL,             -- provenance; otodom is the only portal
  source_id     VARCHAR(64)  NOT NULL,              -- portal offer id → idempotent upsert key
  offer_type    ENUM('sale','rent') NOT NULL,       -- price semantics depend on this
  source_url    VARCHAR(768) NOT NULL,
  title         VARCHAR(512) NOT NULL,
  description   TEXT NULL,                          -- plain text, HTML stripped
  summary_ai    VARCHAR(600) NULL,                  -- 1-2 sentence AI summary
  price         INT UNSIGNED NULL,                  -- PLN; sale = total, rent = monthly; NULL = "ask for price"
  monthly_fee   INT UNSIGNED NULL,                  -- czynsz; appears on SALE offers too, not only rentals
  price_per_m2  INT UNSIGNED NULL,                  -- derived when missing: price / area
  area_m2       DECIMAL(7,2) NULL,
  rooms         TINYINT UNSIGNED NULL,
  floor         TINYINT NULL,                       -- "parter" → 0
  city          VARCHAR(128) NULL,
  district      VARCHAR(128) NULL,
  street        VARCHAR(256) NULL,
  image_url     VARCHAR(768) NULL,                  -- first image only
  is_incomplete BOOLEAN NOT NULL DEFAULT FALSE,     -- missing any of price/area/city → flag, never drop
  is_duplicate  BOOLEAN NOT NULL DEFAULT FALSE,     -- fuzzy dedupe hit; excluded from lists, still in DB
  dedupe_hash   CHAR(32) NULL,
  raw_json      JSON NULL,                          -- normalized source snapshot; never crosses the API boundary
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source (source, source_id),
  KEY idx_offer_type (offer_type),
  KEY idx_city (city),
  KEY idx_price (price),
  KEY idx_area (area_m2),
  KEY idx_dedupe (dedupe_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
