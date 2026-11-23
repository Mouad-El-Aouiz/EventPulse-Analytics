-- Mise a jour uniforme de updated_at sur les tables mutables.
--
-- La valeur explicite est respectee si elle differe de l'ancienne. Une valeur
-- identique est indistinguable d'une omission dans un trigger BEFORE UPDATE :
-- elle est donc rafraichie. Les tables immuables ne recoivent pas ce trigger.

CREATE FUNCTION "set_updated_at_if_unchanged"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."updated_at" IS NOT DISTINCT FROM OLD."updated_at" THEN
    NEW."updated_at" := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "api_keys"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "booth_reservations"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "booths"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "events"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "exhibitors"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "exports"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "imports"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "participants"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();

CREATE TRIGGER "trg_touch_updated_at" BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at_if_unchanged"();
