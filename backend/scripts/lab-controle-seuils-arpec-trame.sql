/*
  Contrôle / alignement des seuils CA ARPEC (lab_arpec_questions)
  vs Trame LBC-FT CNOEC 2027-2029 (onglet « Trame questionnaire »).

  Convention LAB (lab-arpec-service.js) :
    - CA en k€ (Aggregats_FEC / 1000)
    - RE si ca_keur > seuil_re_keur
    - RM si ca_keur >= seuil_rm_keur (et pas RE)
    - Invisible si ca_keur < seuil_rm_keur (quand un seuil RM est posé)
    - Borne exacte du seuil RE incluse dans RM

  Usage :
    1. Exécuter la partie CONTRÔLE (jusqu’à SELECT … Ecart).
    2. Relire les lignes « DIFFERENT » / « MANQUANT ».
    3. Si OK : décommenter la partie UPDATE et ré-exécuter (transaction).

  Hors scope de ces 2 colonnes :
    - D2-4 (marge VO %)
    - D2-5 / D2-6 (commissions jeux/tabac : seuils en k€ mais source FEC tiers, pas CA)
*/

SET NOCOUNT ON;

------------------------------------------------------------
-- Cible trame (k€) — une ligne par code_question LAB (D2-x)
------------------------------------------------------------
IF OBJECT_ID('tempdb..#cible') IS NOT NULL DROP TABLE #cible;

CREATE TABLE #cible (
  code_question   NVARCHAR(20) NOT NULL PRIMARY KEY,
  seuil_rm_keur   DECIMAL(18, 2) NULL,
  seuil_re_keur   DECIMAL(18, 2) NULL,
  note            NVARCHAR(200) NOT NULL
);

INSERT INTO #cible (code_question, seuil_rm_keur, seuil_re_keur, note) VALUES
  (N'D2-1',  400,  1000, N'CA HT 400–1000 RM / >1000 RE'),
  (N'D2-2',  400,  1000, N'Opérations 400–1000 RM / >1000 RE'),
  (N'D2-3',  400,  1000, N'Opérations 400–1000 RM / >1000 RE'),
  -- D2-4 : marge VO % → ne pas écraser via seuil_rm/re
  (N'D2-7',    0,   200, N'CA <200 RM / >200 RE (rm=0)'),
  (N'D2-8',    0,   200, N'CA <200 RM / >200 RE (rm=0)'),
  (N'D2-9',    0,   200, N'CA <200 RM / >200 RE (rm=0)'),
  (N'D2-10', 400,  1000, N'CA HT 400–1000 RM / >1000 RE'),
  (N'D2-11',   0,   200, N'CA <200 RM / >200 RE (rm=0)'),
  (N'D2-12',   0,   200, N'CA <200 RM / >200 RE (rm=0)'),
  (N'D2-13', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-14', 400,  1000, N'CA HT 400–1000 RM / >1000 RE'),
  (N'D2-15', 400,  1000, N'CA HT 400–1000 RM / >1000 RE'),
  (N'D2-16', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-17',1500,  4000, N'CA HT 1500–4000 RM / >4000 RE'),
  (N'D2-18', 400,  1000, N'CA HT 400–1000 RM / >1000 RE'),
  (N'D2-19',   0,   200, N'CA <200 RM / >200 RE (rm=0)'),
  (N'D2-20', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-21', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-22', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-23', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-24',   0,  1000, N'CA <1000 RM / >1000 RE (rm=0)'),
  (N'D2-25',   0,   400, N'CA <400 RM / >400 RE (rm=0)'),
  (N'D2-26', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-27', NULL,  NULL, N'Tout dossier → seuils NULL'),
  (N'D2-28', NULL,  NULL, N'Tout dossier → seuils NULL');

------------------------------------------------------------
-- CONTRÔLE : écarts vs lab_arpec_questions
------------------------------------------------------------
SELECT
  c.code_question,
  c.note,
  q.id,
  q.seuil_rm_keur AS actuel_rm,
  c.seuil_rm_keur AS cible_rm,
  q.seuil_re_keur AS actuel_re,
  c.seuil_re_keur AS cible_re,
  CASE
    WHEN q.id IS NULL THEN N'MANQUANT (pas de ligne lab_arpec_questions)'
    WHEN ISNULL(q.seuil_rm_keur, -1) = ISNULL(c.seuil_rm_keur, -1)
     AND ISNULL(q.seuil_re_keur, -1) = ISNULL(c.seuil_re_keur, -1)
      THEN N'OK'
    ELSE N'DIFFERENT'
  END AS statut
FROM #cible c
LEFT JOIN lab_arpec_questions q
  ON RTRIM(LTRIM(q.code_question)) = RTRIM(LTRIM(c.code_question))
ORDER BY
  TRY_CAST(SUBSTRING(c.code_question, 4, 10) AS INT),
  c.code_question;

-- Questions D2 présentes en base mais hors cible (ex. D2-4, D2-5, D2-6)
SELECT
  RTRIM(LTRIM(q.code_question)) AS code_question,
  q.id,
  q.seuil_rm_keur,
  q.seuil_re_keur,
  q.libelle,
  N'Hors script UPDATE (vérifier manuellement)' AS note
FROM lab_arpec_questions q
WHERE RTRIM(LTRIM(q.code_question)) LIKE N'D2-%'
  AND RTRIM(LTRIM(q.code_question)) NOT IN (SELECT code_question FROM #cible)
ORDER BY q.ordre_affichage, q.id;

------------------------------------------------------------
-- UPDATE (décommenter après revue du SELECT)
-- Ne touche PAS D2-4 / D2-5 / D2-6.
------------------------------------------------------------
/*
BEGIN TRAN;

UPDATE q
SET
  q.seuil_rm_keur = c.seuil_rm_keur,
  q.seuil_re_keur = c.seuil_re_keur
FROM lab_arpec_questions q
INNER JOIN #cible c
  ON RTRIM(LTRIM(q.code_question)) = RTRIM(LTRIM(c.code_question));

-- Vérification post-update
SELECT
  c.code_question,
  q.seuil_rm_keur AS actuel_rm,
  c.seuil_rm_keur AS cible_rm,
  q.seuil_re_keur AS actuel_re,
  c.seuil_re_keur AS cible_re,
  CASE
    WHEN ISNULL(q.seuil_rm_keur, -1) = ISNULL(c.seuil_rm_keur, -1)
     AND ISNULL(q.seuil_re_keur, -1) = ISNULL(c.seuil_re_keur, -1)
      THEN N'OK'
    ELSE N'DIFFERENT'
  END AS statut
FROM #cible c
INNER JOIN lab_arpec_questions q
  ON RTRIM(LTRIM(q.code_question)) = RTRIM(LTRIM(c.code_question))
ORDER BY TRY_CAST(SUBSTRING(c.code_question, 4, 10) AS INT);

-- COMMIT;   -- si tout OK
-- ROLLBACK; -- sinon
*/

DROP TABLE #cible;
