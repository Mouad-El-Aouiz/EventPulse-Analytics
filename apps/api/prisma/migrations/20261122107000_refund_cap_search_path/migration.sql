-- Durcissement de la resolution des noms dans le trigger de plafond.
--
-- PostgreSQL recherche toujours pg_temp en premier pour les noms de relations,
-- meme lorsqu'il n'apparait pas dans search_path. Un role disposant de TEMP
-- peut donc creer des tables temporaires "transactions" ou "refunds" et
-- masquer les tables permanentes utilisees par cette fonction.
--
-- Les references sont desormais qualifiees par public et le search_path de la
-- fonction est fixe. La revocation de TEMP reste une defense en profondeur
-- operee au niveau de chaque base par l'exploitation : son nom n'est pas
-- connu de la migration.

-- integrity-guard: allow CREATE FUNCTION enforce_refund_cap (qualification public et search_path fixe)
CREATE OR REPLACE FUNCTION public."enforce_refund_cap"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_amount numeric(12,2);
  v_status text;
  v_refunded numeric(12,2);
BEGIN
  SELECT t."amount", t."status"::text
    INTO v_amount, v_status
  FROM public."transactions" t
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
  FROM public."refunds" r
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
