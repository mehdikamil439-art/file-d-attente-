-- ============================================================
-- reset_journalier.sql
-- Réinitialisation automatique à minuit via Supabase pg_cron
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- 1. Activer l'extension pg_cron (si pas déjà fait)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- 2. Fonction de réinitialisation
--    - Clôture les patients "appelé" ou "en consultation"
--      de la veille (sans supprimer aucune donnée)
--    - Le compteur repart automatiquement à 01 le lendemain
--      car getNextNumero() filtre par date_consultation
-- ============================================================
CREATE OR REPLACE FUNCTION reset_journalier()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Clôturer les patients restés en attente ou appelés la veille
  UPDATE patients
  SET
    statut    = 'termine',
    heure_fin = NOW()
  WHERE
    date_consultation < CURRENT_DATE
    AND statut IN ('en_attente', 'appele', 'en_consultation');

  RAISE NOTICE 'Réinitialisation journalière effectuée à %', NOW();
END;
$$;

-- ============================================================
-- 3. Planifier l'exécution tous les jours à 00:00 (minuit)
--    Fuseau horaire : Africa/Casablanca (UTC+1)
-- ============================================================
SELECT cron.schedule(
  'reset-journalier-minuit',    -- nom unique du job
  '0 23 * * *',                 -- 23:00 UTC = 00:00 Maroc (UTC+1)
  'SELECT reset_journalier()'
);

-- ============================================================
-- Pour vérifier que le job est bien planifié :
-- SELECT * FROM cron.job;
--
-- Pour tester manuellement :
-- SELECT reset_journalier();
--
-- Pour supprimer le job si besoin :
-- SELECT cron.unschedule('reset-journalier-minuit');
-- ============================================================
