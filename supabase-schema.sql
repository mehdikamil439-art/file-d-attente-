-- ============================================================
-- Schéma de la base de données — File d'Attente CHU Psychiatrique
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. TABLE MÉDECINS
CREATE TABLE IF NOT EXISTS medecins (
  id      SERIAL PRIMARY KEY,
  nom     TEXT NOT NULL,
  prenom  TEXT NOT NULL,
  actif   BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLE SALLES
CREATE TABLE IF NOT EXISTS salles (
  id                SERIAL PRIMARY KEY,
  numero            INTEGER NOT NULL UNIQUE,
  slug              TEXT NOT NULL UNIQUE,
  type_consultation TEXT NOT NULL CHECK (type_consultation IN ('psychiatrie','psychotherapie'))
);

-- 3. TABLE AFFECTATIONS MÉDECIN ↔ SALLE (par jour)
CREATE TABLE IF NOT EXISTS medecin_salle (
  id          SERIAL PRIMARY KEY,
  medecin_id  INTEGER REFERENCES medecins(id) ON DELETE CASCADE,
  salle_id    INTEGER REFERENCES salles(id) ON DELETE CASCADE,
  date_jour   DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(salle_id, date_jour)
);

-- 4. TABLE PATIENTS (file d'attente)
CREATE TABLE IF NOT EXISTS patients (
  id                  SERIAL PRIMARY KEY,
  nom                 TEXT NOT NULL,
  prenom              TEXT NOT NULL,
  type_consultation   TEXT NOT NULL CHECK (type_consultation IN ('psychiatrie','psychotherapie')),
  medecin_id          INTEGER REFERENCES medecins(id),
  salle_id            INTEGER REFERENCES salles(id),
  numero_passage      INTEGER NOT NULL,
  prefixe             TEXT NOT NULL CHECK (prefixe IN ('P','T')),
  statut              TEXT NOT NULL DEFAULT 'en_attente'
                      CHECK (statut IN ('en_attente','appele','en_consultation','termine','annule')),
  date_consultation   DATE NOT NULL DEFAULT CURRENT_DATE,
  couleur             TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  heure_appel         TIMESTAMPTZ,
  heure_debut         TIMESTAMPTZ,
  heure_fin           TIMESTAMPTZ
);

-- ============================================================
-- ACTIVER REALTIME sur la table patients (pour écran TV)
-- ============================================================
ALTER TABLE patients REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE patients;

-- ============================================================
-- ROW LEVEL SECURITY (lecture/écriture publique sans auth)
-- ============================================================
ALTER TABLE medecins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE salles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE medecin_salle ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON medecins    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON salles      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON medecin_salle FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON patients    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- DONNÉES INITIALES — SALLES
-- ============================================================
INSERT INTO salles (numero, slug, type_consultation) VALUES
(1, 'salle01', 'psychiatrie'),
(2, 'salle02', 'psychotherapie'),
(3, 'salle03', 'psychiatrie'),
(4, 'salle04', 'psychiatrie'),
(5, 'salle05', 'psychiatrie'),
(6, 'salle06', 'psychiatrie')
ON CONFLICT (numero) DO NOTHING;

-- ============================================================
-- DONNÉES INITIALES — MÉDECINS (29 médecins)
-- ============================================================
INSERT INTO medecins (nom, prenom) VALUES
('CHATTTER',         'SARA'),
('BENHADOUCHE',      'YASSINE'),
('RASAME',           'YASSINE'),
('ESSAFI',           'AMAL'),
('TAQUI',            'AMINE'),
('RADI',             'SALAHE DINE'),
('AJOUB',            'ABDELILAH'),
('KHOUYI',           'SOUFYANE'),
('YAAGOUBI',         'CHAIMAE'),
('EL MSAADA',        'MOUNSEF'),
('GHAILAN',          'MOUNA'),
('CHERGOU',          'RADIA'),
('MASMOUDI',         'MOHAMED KARAM'),
('EL MSRRAH',        'ANOUAR'),
('EL MOKHTARI',      'ADNAN'),
('AARAB',            'HIBA'),
('AGHOUTANE',        'LINA'),
('LASRI',            'WISSAM'),
('BOUTAB',           'HAMZA'),
('CHAKIR',           'AYOUB'),
('EL GHIBOUNI',      'ABDELMOTTAIB'),
('ETTAOULI',         'AYMAN'),
('SAHLI',            'MOHAMED'),
('EL ALLOUCH',       'ABDERRAHMANE'),
('BOUSTA',           'IMANE'),
('BOUCHOCHO',        'HAMZA'),
('EDDAOUSY',         'HAMZA'),
('ODDI',             'AMINA'),
('EL OUAFI',         'OMAIMA')
ON CONFLICT DO NOTHING;
