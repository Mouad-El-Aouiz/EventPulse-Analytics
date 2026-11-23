-- Aligne le stockage des scopes API sur la contrainte documentee.
-- Source : docs/phase-3-architecture/DATABASE_DESIGN.md §4.7.
-- Le CHECK est volontairement celui documente : il autorise un tableau vide
-- et ne rejette pas les elements NULL. La presence de "ingestion:write" reste
-- une regle de service tant qu'aucune contrainte plus stricte n'est documentee.

ALTER TABLE "api_keys"
  ALTER COLUMN "scopes" SET NOT NULL;

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_scopes_chk"
  CHECK ("scopes" <@ ARRAY['ingestion:write']::TEXT[]);
