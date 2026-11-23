-- Index trigram documentes (DATABASE_DESIGN.md §7.2).
--
-- participants.email est citext ; l'opclasse gin_trgm_ops est definie pour
-- text. L'index porte donc sur l'expression (email)::text. Les requetes
-- doivent utiliser (email)::text ILIKE ... pour que l'index soit exploitable.

CREATE INDEX "participants_first_name_trgm_idx"
  ON "participants" USING GIN ("first_name" gin_trgm_ops);

CREATE INDEX "participants_last_name_trgm_idx"
  ON "participants" USING GIN ("last_name" gin_trgm_ops);

CREATE INDEX "participants_email_trgm_idx"
  ON "participants" USING GIN ((("email")::text) gin_trgm_ops);

CREATE INDEX "exhibitors_name_trgm_idx"
  ON "exhibitors" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "events_name_trgm_idx"
  ON "events" USING GIN ("name" gin_trgm_ops);
