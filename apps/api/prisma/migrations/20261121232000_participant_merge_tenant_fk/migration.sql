-- Isolation tenant de la fusion de participants.
-- La fusion ne doit referencer qu'un participant de la meme organisation.
-- ON DELETE SET NULL est impossible sur une FK composite incluant
-- organization_id NOT NULL ; RESTRICT est retenu.

ALTER TABLE "participants" DROP CONSTRAINT "participants_merge_fk";
ALTER TABLE "participants"
  ADD CONSTRAINT "participants_merge_org_fk"
  FOREIGN KEY ("organization_id", "merged_into_participant_id")
  REFERENCES "participants" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
