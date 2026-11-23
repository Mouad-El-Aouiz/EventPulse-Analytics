-- Immuabilite des historiques financiers et d'audit.
--
-- Les FK acteurs de ces tables sont ON DELETE SET NULL. Une suppression
-- d'utilisateur reference tente donc un UPDATE et echoue ici. C'est conforme
-- a la regle "aucune suppression utilisateur" ; la suspension passe par
-- memberships.status.

CREATE FUNCTION "prevent_immutable_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'immutable table % does not allow %',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "trg_checkin_immutable"
  BEFORE UPDATE OR DELETE ON "check_ins"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_immutable_mutation"();

CREATE TRIGGER "trg_refund_immutable"
  BEFORE UPDATE OR DELETE ON "refunds"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_immutable_mutation"();

CREATE TRIGGER "trg_audit_immutable"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_immutable_mutation"();
