-- Drop the UNIQUE constraint on Instrument.name. Instruments on
-- different exchanges will share the same short asset name (e.g.
-- "Газ" for both NG@CME and NG@MOEX). Ticker + slug remain unique
-- for disambiguation.
DROP INDEX IF EXISTS "Instrument_name_key";
