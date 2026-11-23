-- Plafond cumulatif des remboursements (BR-PAY-002, BR-PAY-005).
--
-- Le verrou FOR UPDATE sur la transaction serialise les inserts concurrents
-- de remboursements pour une meme transaction. Le calcul reste en numeric,
-- sans conversion flottante.

CREATE FUNCTION "enforce_refund_cap"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_amount numeric(12,2);
  v_status text;
  v_refunded numeric(12,2);
BEGIN
  SELECT t."amount", t."status"::text
    INTO v_amount, v_status
  FROM "transactions" t
  WHERE t."organization_id" = NEW."organization_id"
    AND t."id" = NEW."transaction_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'refund rejected: transaction % not found in organization %',
      NEW."transaction_id", NEW."organization_id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_status NOT IN ('PAID', 'PARTIALLY_REFUNDED') THEN
    RAISE EXCEPTION
      'refund rejected: transaction % has status %',
      NEW."transaction_id", v_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(r."amount"), 0)::numeric(12,2)
    INTO v_refunded
  FROM "refunds" r
  WHERE r."organization_id" = NEW."organization_id"
    AND r."transaction_id" = NEW."transaction_id";

  IF v_refunded + NEW."amount" > v_amount THEN
    RAISE EXCEPTION
      'refund cap exceeded for transaction %: already refunded %, requested %, paid amount %',
      NEW."transaction_id", v_refunded, NEW."amount", v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_refund_cap"
  BEFORE INSERT ON "refunds"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_refund_cap"();
