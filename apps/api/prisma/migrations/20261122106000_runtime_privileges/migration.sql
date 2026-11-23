-- Separation proprietaire de migration / role applicatif.
--
-- Le role eventpulse_app est un groupe NOLOGIN. Le login runtime est cree
-- hors migration par l'exploitation et herite de ce groupe. Aucun mot de passe
-- ni secret n'est stocke ici.
--
-- Toute future table metier devra etre ajoutee explicitement aux grants
-- ci-dessous et au manifeste d'integrite. Aucun ALTER DEFAULT PRIVILEGES
-- n'est utilise : il accorderait aussi des droits sur de futures tables
-- immuables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eventpulse_app') THEN
    CREATE ROLE "eventpulse_app";
  END IF;
END;
$$;

ALTER ROLE "eventpulse_app"
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

REVOKE ALL ON SCHEMA "public" FROM "eventpulse_app";
GRANT USAGE ON SCHEMA "public" TO "eventpulse_app";

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "eventpulse_app";

-- Tables mutables : CRUD applicatif.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "users",
  "sessions",
  "password_reset_tokens",
  "organizations",
  "memberships",
  "invitations",
  "api_keys",
  "events",
  "tickets",
  "participants",
  "registrations",
  "transactions",
  "exhibitors",
  "booths",
  "booth_reservations",
  "imports",
  "exports"
TO "eventpulse_app";

-- Tables immuables : lecture et ajout uniquement. Aucun UPDATE, DELETE,
-- TRUNCATE, REFERENCES ou TRIGGER n'est accorde.
GRANT SELECT, INSERT ON TABLE
  "check_ins",
  "refunds",
  "audit_logs"
TO "eventpulse_app";
