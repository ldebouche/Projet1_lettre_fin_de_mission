-- ============================================================
-- MODULE LAB / KYC - SCHEMA T-SQL
-- Base : BDD_CABINET_CLIENTS (SQL Server)
-- Conventions : snake_case, FK sur clients.code_client (nchar 10)
--               PK en INT IDENTITY sauf indication contraire
-- Date        : 2026-03-23
-- ============================================================

-- ============================================================
-- 1. DOSSIER LAB PAR CLIENT
--    Enrichit la table clients existante sans la modifier
--    1 ligne par client
-- ============================================================
CREATE TABLE lab_dossier (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,   -- FK -> clients.code_client

    -- Statut du dossier LAB
    statut_dossier              NCHAR(20)           NOT NULL DEFAULT 'Actif',
        -- Valeurs : Prospect / Actif / Suspendu / Cloture

    -- Niveau de risque actuel (calculé ou overridé)
    niveau_risque               NCHAR(10)           NOT NULL DEFAULT 'Non evalue',
        -- Valeurs : Faible / Moyen / Eleve / Non evalue

    score_risque_global         DECIMAL(5,2)        NULL,       -- Score numérique calculé

    -- Responsable LAB interne
    id_responsable_lab          NCHAR(20)           NULL,       -- FK -> collaborateurs.id_sellsy

    -- Dates clés
    date_entree_relation        DATE                NULL,       -- Peut reprendre clients.date_entree_cabinet
    date_derniere_revue         DATE                NULL,
    date_prochaine_revue        DATE                NULL,
    periodicite_revue_mois      INT                 NOT NULL DEFAULT 12,

    -- Flags KYC
    statut_kyc                  NCHAR(20)           NOT NULL DEFAULT 'Incomplet',
        -- Valeurs : Complet / Incomplet / Pieces_perimees

    -- Traçabilité
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    cree_par                    NCHAR(20)           NULL,       -- FK -> collaborateurs.id_sellsy
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_dossier PRIMARY KEY (id),
    CONSTRAINT UQ_lab_dossier_client UNIQUE (code_client),
    CONSTRAINT FK_lab_dossier_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client)
);
GO

-- ============================================================
-- 2. KYC - DONNÉES STRUCTURÉES PAR CLIENT
--    Informations de connaissance client pour le scoring
-- ============================================================
CREATE TABLE lab_kyc (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,   -- FK -> clients.code_client

    -- Profil activité
    secteur_activite            NCHAR(100)          NULL,       -- Peut reprendre clients.activite
    zone_geographique_principale NCHAR(60)          NULL,
    volume_affaires_estime      NCHAR(30)           NULL,       -- Fourchette ou montant
    complexite_structure        NCHAR(20)           NULL,
        -- Valeurs : Simple / Moderee / Complexe / Tres_complexe

    -- Exposition internationale
    pays_risque                 NVARCHAR(500)       NULL,       -- Liste pays séparés par virgule
    operations_internationales  NCHAR(1)            NOT NULL DEFAULT 'N',

    -- Origine des fonds
    origine_fonds               NVARCHAR(MAX)       NULL,
    origine_patrimoine          NVARCHAR(MAX)       NULL,

    -- Statut PEP
    est_pep                     NCHAR(1)            NOT NULL DEFAULT 'N',
    detail_pep                  NVARCHAR(500)       NULL,
    lien_pep                    NCHAR(1)            NOT NULL DEFAULT 'N',
    detail_lien_pep             NVARCHAR(500)       NULL,

    -- Traçabilité
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_kyc PRIMARY KEY (id),
    CONSTRAINT UQ_lab_kyc_client UNIQUE (code_client),
    CONSTRAINT FK_lab_kyc_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client)
);
GO

-- ============================================================
-- 3. BÉNÉFICIAIRES EFFECTIFS (table dédiée LAB)
--    Lien optionnel vers contacts existants via id_contact
-- ============================================================
CREATE TABLE lab_beneficiaires_effectifs (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,   -- FK -> clients.code_client
    id_contact                  NCHAR(30)           NULL,       -- FK optionnelle -> contacts.id

    -- Identité (dupliquée si pas de contact lié)
    nom                         NCHAR(50)           NULL,
    prenom                      NCHAR(30)           NULL,
    date_naissance              DATE                NULL,
    nationalite                 NCHAR(40)           NULL,
    pays_residence              NCHAR(40)           NULL,

    -- Détention / Contrôle
    pourcentage_detention       DECIMAL(5,2)        NULL,       -- % direct
    pourcentage_controle_total  DECIMAL(5,2)        NULL,       -- % indirect inclus
    type_controle               NCHAR(30)           NULL,
        -- Valeurs : Direct / Indirect / Mixte / Autre

    -- Statuts réglementaires
    est_pep                     NCHAR(1)            NOT NULL DEFAULT 'N',
    sous_sanctions              NCHAR(1)            NOT NULL DEFAULT 'N',
    gel_avoirs                  NCHAR(1)            NOT NULL DEFAULT 'N',
    detail_statut               NVARCHAR(500)       NULL,

    -- Validité
    actif                       NCHAR(1)            NOT NULL DEFAULT 'O',
    date_debut                  DATE                NULL,
    date_fin                    DATE                NULL,

    -- Version (historisation gérée dans lab_beneficiaires_effectifs_historique)
    version                     INT                 NOT NULL DEFAULT 1,

    -- Traçabilité
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    cree_par                    NCHAR(20)           NULL,
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_be PRIMARY KEY (id),
    CONSTRAINT FK_lab_be_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client),
    CONSTRAINT FK_lab_be_contact FOREIGN KEY (id_contact)
        REFERENCES contacts(id)
);
GO

-- Historique des modifications de bénéficiaires effectifs
CREATE TABLE lab_beneficiaires_effectifs_historique (
    id                          INT IDENTITY(1,1)   NOT NULL,
    id_be                       INT                 NOT NULL,   -- FK -> lab_beneficiaires_effectifs.id
    code_client                 NCHAR(10)           NOT NULL,
    version                     INT                 NOT NULL,
    champ_modifie               NCHAR(60)           NULL,
    ancienne_valeur             NVARCHAR(500)       NULL,
    nouvelle_valeur             NVARCHAR(500)       NULL,
    motif                       NVARCHAR(500)       NULL,
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_be_histo PRIMARY KEY (id),
    CONSTRAINT FK_lab_be_histo_be FOREIGN KEY (id_be)
        REFERENCES lab_beneficiaires_effectifs(id)
);
GO

-- ============================================================
-- 4. SCORING DE RISQUE - PARAMÉTRAGE CABINET
--    Référentiel des critères et pondérations
-- ============================================================
CREATE TABLE lab_scoring_criteres (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_critere                NCHAR(30)           NOT NULL,
        -- Ex : PAYS_RISQUE / SECTEUR / PEP / COMPLEXITE / HISTORIQUE
    libelle                     NCHAR(100)          NOT NULL,
    ponderation                 DECIMAL(5,2)        NOT NULL DEFAULT 1.00,
    actif                       NCHAR(1)            NOT NULL DEFAULT 'O',
    ordre_affichage             INT                 NULL,

    CONSTRAINT PK_lab_scoring_criteres PRIMARY KEY (id),
    CONSTRAINT UQ_lab_scoring_criteres_code UNIQUE (code_critere)
);
GO

-- Valeurs de référence par critère (ex: liste pays, liste secteurs)
CREATE TABLE lab_scoring_valeurs_ref (
    id                          INT IDENTITY(1,1)   NOT NULL,
    id_critere                  INT                 NOT NULL,   -- FK -> lab_scoring_criteres.id
    valeur                      NCHAR(100)          NOT NULL,
    libelle                     NCHAR(200)          NULL,
    niveau_risque               NCHAR(10)           NOT NULL,   -- Faible / Moyen / Eleve
    score                       DECIMAL(5,2)        NOT NULL DEFAULT 0,

    CONSTRAINT PK_lab_scoring_valeurs PRIMARY KEY (id),
    CONSTRAINT FK_lab_scoring_valeurs_critere FOREIGN KEY (id_critere)
        REFERENCES lab_scoring_criteres(id)
);
GO

-- ============================================================
-- 5. SCORE DE RISQUE PAR CLIENT (historisé)
--    Une ligne par calcul/validation de score
-- ============================================================
CREATE TABLE lab_scores_risque (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,

    -- Score
    score_global                DECIMAL(5,2)        NOT NULL,
    niveau_risque               NCHAR(10)           NOT NULL,   -- Faible / Moyen / Eleve
    est_override                NCHAR(1)            NOT NULL DEFAULT 'N',
    justification_override      NVARCHAR(MAX)       NULL,

    -- Détail par axe (snapshot JSON ou colonnes)
    detail_scores_json          NVARCHAR(MAX)       NULL,       -- JSON {critere: score, ...}

    -- Statut
    est_actif                   NCHAR(1)            NOT NULL DEFAULT 'O', -- Seul le dernier est O
    date_calcul                 DATETIME2           NOT NULL DEFAULT GETDATE(),
    valide_par                  NCHAR(20)           NULL,       -- FK -> collaborateurs.id_sellsy
    date_validation             DATETIME2           NULL,

    CONSTRAINT PK_lab_scores PRIMARY KEY (id),
    CONSTRAINT FK_lab_scores_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client)
);
GO

-- ============================================================
-- 6. ÉVÉNEMENTS LAB
--    Faits générateurs impactant la vigilance d'un dossier
-- ============================================================
CREATE TABLE lab_evenements (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,

    -- Classification
    type_evenement              NCHAR(50)           NOT NULL,
        -- Valeurs : ENTREE_RELATION / PIECE_PERIMEE / PIECE_MANQUANTE /
        --           CHANGEMENT_BE / CHANGEMENT_KYC / CHANGEMENT_RISQUE /
        --           TRANSACTION_ATYPIQUE / REVUE_ANNUELLE / AUTRE
    libelle                     NCHAR(200)          NULL,
    criticite                   NCHAR(10)           NOT NULL DEFAULT 'Normale',
        -- Valeurs : Faible / Normale / Haute / Critique

    -- Statut
    statut                      NCHAR(20)           NOT NULL DEFAULT 'Ouvert',
        -- Valeurs : Ouvert / En_cours / Cloture

    -- Dates
    date_evenement              DATE                NOT NULL DEFAULT GETDATE(),
    date_echeance               DATE                NULL,
    date_cloture                DATETIME2           NULL,

    -- Conclusion
    conclusion                  NVARCHAR(MAX)       NULL,
    tracfin_declare             NCHAR(1)            NULL,       -- O / N (pour TRANSACTION_ATYPIQUE)
    tracfin_commentaire         NVARCHAR(MAX)       NULL,

    -- Responsable
    id_responsable              NCHAR(20)           NULL,       -- FK -> collaborateurs.id_sellsy

    -- Traçabilité
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    cree_par                    NCHAR(20)           NULL,
    modifie_par                 NCHAR(20)           NULL,
    cloture_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_evenements PRIMARY KEY (id),
    CONSTRAINT FK_lab_evenements_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client)
);
GO

-- ============================================================
-- 7. DILIGENCES
--    Actions associées aux événements LAB
-- ============================================================
CREATE TABLE lab_diligences (
    id                          INT IDENTITY(1,1)   NOT NULL,
    id_evenement                INT                 NOT NULL,   -- FK -> lab_evenements.id
    code_client                 NCHAR(10)           NOT NULL,   -- Dénormalisé pour requêtes

    -- Description
    intitule                    NCHAR(200)          NOT NULL,
    type_diligence              NCHAR(50)           NULL,
        -- Ex : DEMANDE_PIECE / VERIFICATION / ANALYSE / QUESTIONNAIRE / AUTRE

    -- Responsable et planning
    id_responsable              NCHAR(20)           NULL,       -- FK -> collaborateurs.id_sellsy
    date_echeance               DATE                NULL,

    -- Statut
    statut                      NCHAR(20)           NOT NULL DEFAULT 'A_faire',
        -- Valeurs : A_faire / En_cours / Realisee / Abandonnee

    -- Réalisation
    date_realisation            DATETIME2           NULL,
    realise_par                 NCHAR(20)           NULL,
    motif_abandon               NVARCHAR(500)       NULL,
    commentaires                NVARCHAR(MAX)       NULL,

    -- Pièce justificative (chemin fichier ou référence)
    ref_piece_jointe            NVARCHAR(500)       NULL,

    -- Traçabilité
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    cree_par                    NCHAR(20)           NULL,
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_diligences PRIMARY KEY (id),
    CONSTRAINT FK_lab_diligences_evenement FOREIGN KEY (id_evenement)
        REFERENCES lab_evenements(id),
    CONSTRAINT FK_lab_diligences_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client)
);
GO

-- ============================================================
-- 8. PIÈCES DOCUMENTAIRES KYC
--    Référencement des pièces (fichiers stockés en réseau ou autre)
-- ============================================================
CREATE TABLE lab_pieces_kyc (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,

    -- Identification de la pièce
    type_piece                  NCHAR(50)           NOT NULL,
        -- Ex : KBIS / STATUTS / CNI_DIRIGEANT / JUSTIF_DOMICILE /
        --      ORGANIGRAMME / RIB / DECLARATION_BE / AUTRE
    libelle                     NCHAR(200)          NULL,

    -- Statut
    statut                      NCHAR(20)           NOT NULL DEFAULT 'Manquante',
        -- Valeurs : Recue / Manquante / Perimee / Non_requise

    -- Dates
    date_delivrance             DATE                NULL,
    date_echeance               DATE                NULL,

    -- Localisation du fichier (chemin réseau, URL, référence GED...)
    filepath                    NVARCHAR(500)       NULL,
    nom_fichier                 NVARCHAR(200)       NULL,

    -- Traçabilité
    date_reception              DATETIME2           NULL,
    recu_par                    NCHAR(20)           NULL,
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_pieces PRIMARY KEY (id),
    CONSTRAINT FK_lab_pieces_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client)
);
GO

-- ============================================================
-- 9. REVUES PÉRIODIQUES
--    Historique des revues annuelles par client
-- ============================================================
CREATE TABLE lab_revues (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,
    id_evenement                INT                 NULL,       -- FK -> lab_evenements.id (type REVUE_ANNUELLE)

    -- Revue
    type_revue                  NCHAR(30)           NOT NULL DEFAULT 'Annuelle',
    date_revue                  DATE                NOT NULL,
    id_responsable              NCHAR(20)           NULL,

    -- Statut
    statut                      NCHAR(20)           NOT NULL DEFAULT 'En_cours',
        -- Valeurs : En_cours / Cloturee

    -- Résultats
    conclusion_risque           NCHAR(20)           NULL,
        -- Valeurs : Maintien / Augmentation / Diminution
    commentaires_conclusion     NVARCHAR(MAX)       NULL,
    niveau_risque_avant         NCHAR(10)           NULL,
    niveau_risque_apres         NCHAR(10)           NULL,

    -- Clôture
    date_cloture                DATETIME2           NULL,
    cloture_par                 NCHAR(20)           NULL,

    -- Traçabilité
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),

    CONSTRAINT PK_lab_revues PRIMARY KEY (id),
    CONSTRAINT FK_lab_revues_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client),
    CONSTRAINT FK_lab_revues_evenement FOREIGN KEY (id_evenement)
        REFERENCES lab_evenements(id)
);
GO

-- Réponses au questionnaire de revue
CREATE TABLE lab_revues_reponses (
    id                          INT IDENTITY(1,1)   NOT NULL,
    id_revue                    INT                 NOT NULL,   -- FK -> lab_revues.id
    code_question               NCHAR(50)           NOT NULL,
        -- Ex : KYC_MAJ / PIECES_COMPLETES / RISQUE_VERIFIE / OPS_ATYPIQUES
    libelle_question            NCHAR(200)          NULL,
    reponse                     NCHAR(10)           NULL,       -- OUI / NON / NA
    commentaire                 NVARCHAR(MAX)       NULL,

    CONSTRAINT PK_lab_revues_reponses PRIMARY KEY (id),
    CONSTRAINT FK_lab_revues_reponses_revue FOREIGN KEY (id_revue)
        REFERENCES lab_revues(id)
);
GO

-- ============================================================
-- 10. TRANSACTIONS ATYPIQUES (Phase 5 optionnelle)
--     Lien avec les tables FEC existantes
-- ============================================================
CREATE TABLE lab_transactions_atypiques (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,
    id_evenement                INT                 NULL,       -- FK -> lab_evenements.id

    -- Référence à la table FEC source
    fec_annee                   INT                 NULL,       -- 2024 / 2025 / 2026
    fec_idlig                   BIGINT              NULL,       -- Idlig dans FEC_XXXX
    fec_ecriture_num            NCHAR(10)           NULL,
    fec_ecriture_date           DATE                NULL,
    fec_montant                 FLOAT               NULL,
    fec_libelle                 NVARCHAR(255)       NULL,
    fec_journal_code            NCHAR(5)            NULL,

    -- Qualification
    motif_atypique              NVARCHAR(MAX)       NULL,
    statut                      NCHAR(20)           NOT NULL DEFAULT 'A_analyser',
        -- Valeurs : A_analyser / Analyse / Ignore / Declare_tracfin

    -- Traçabilité
    signale_par                 NCHAR(20)           NULL,
    date_signalement            DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),

    CONSTRAINT PK_lab_transactions PRIMARY KEY (id),
    CONSTRAINT FK_lab_transactions_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client),
    CONSTRAINT FK_lab_transactions_evenement FOREIGN KEY (id_evenement)
        REFERENCES lab_evenements(id)
);
GO

-- ============================================================
-- 11. DOSSIERS TRACFIN
--     Centralisation des déclarations de soupçon
-- ============================================================
CREATE TABLE lab_tracfin (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_client                 NCHAR(10)           NOT NULL,
    id_evenement                INT                 NULL,

    -- Questionnaire TRACFIN
    nature_soupcon              NVARCHAR(MAX)       NULL,
    description_operations      NVARCHAR(MAX)       NULL,
    montants_concernes          NVARCHAR(500)       NULL,
    periode_concernee_debut     DATE                NULL,
    periode_concernee_fin       DATE                NULL,
    diligences_effectuees       NVARCHAR(MAX)       NULL,

    -- Statut
    statut                      NCHAR(30)           NOT NULL DEFAULT 'En_preparation',
        -- Valeurs : En_preparation / Valide / Declare / Archive

    -- Déclaration
    date_declaration            DATE                NULL,
    reference_declaration       NCHAR(50)           NULL,
    declare_par                 NCHAR(20)           NULL,

    -- Traçabilité
    date_creation               DATETIME2           NOT NULL DEFAULT GETDATE(),
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    cree_par                    NCHAR(20)           NULL,
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_tracfin PRIMARY KEY (id),
    CONSTRAINT FK_lab_tracfin_client FOREIGN KEY (code_client)
        REFERENCES clients(code_client),
    CONSTRAINT FK_lab_tracfin_evenement FOREIGN KEY (id_evenement)
        REFERENCES lab_evenements(id)
);
GO

-- ============================================================
-- 12. JOURNAL D'AUDIT
--     Traçabilité des actions significatives (exigence LCB-FT)
-- ============================================================
CREATE TABLE lab_audit_log (
    id                          BIGINT IDENTITY(1,1) NOT NULL,
    date_action                 DATETIME2           NOT NULL DEFAULT GETDATE(),
    id_utilisateur              NCHAR(20)           NULL,       -- FK -> collaborateurs.id_sellsy
    type_action                 NCHAR(50)           NOT NULL,
        -- Ex : CREATION_DOSSIER / MODIF_KYC / CHANGEMENT_RISQUE /
        --      CREATION_EVENEMENT / CLOTURE_EVENEMENT /
        --      CREATION_DILIGENCE / CLOTURE_DILIGENCE /
        --      CREATION_REVUE / CLOTURE_REVUE / MODIF_PARAMETRAGE
    entite                      NCHAR(50)           NOT NULL,   -- Nom de la table impactée
    id_entite                   NVARCHAR(50)        NULL,       -- ID de l'enregistrement
    code_client                 NCHAR(10)           NULL,       -- Pour filtrage rapide
    detail                      NVARCHAR(MAX)       NULL,       -- JSON ou texte libre

    CONSTRAINT PK_lab_audit PRIMARY KEY (id)
);
GO

-- ============================================================
-- 13. PARAMÉTRAGE CABINET
--     Configuration globale du module LAB
-- ============================================================
CREATE TABLE lab_parametrage (
    id                          INT IDENTITY(1,1)   NOT NULL,
    code_param                  NCHAR(50)           NOT NULL,
    libelle                     NCHAR(200)          NULL,
    valeur                      NVARCHAR(MAX)       NULL,
    version                     INT                 NOT NULL DEFAULT 1,
    actif                       NCHAR(1)            NOT NULL DEFAULT 'O',
    date_modification           DATETIME2           NOT NULL DEFAULT GETDATE(),
    modifie_par                 NCHAR(20)           NULL,

    CONSTRAINT PK_lab_parametrage PRIMARY KEY (id),
    CONSTRAINT UQ_lab_parametrage_code UNIQUE (code_param)
);
GO

-- ============================================================
-- 14. INDEX POUR LES PERFORMANCES
-- ============================================================

-- Recherches fréquentes par code_client
CREATE INDEX IX_lab_dossier_code_client         ON lab_dossier(code_client);
CREATE INDEX IX_lab_kyc_code_client             ON lab_kyc(code_client);
CREATE INDEX IX_lab_be_code_client              ON lab_beneficiaires_effectifs(code_client);
CREATE INDEX IX_lab_scores_code_client          ON lab_scores_risque(code_client);
CREATE INDEX IX_lab_evenements_code_client      ON lab_evenements(code_client);
CREATE INDEX IX_lab_diligences_code_client      ON lab_diligences(code_client);
CREATE INDEX IX_lab_pieces_code_client          ON lab_pieces_kyc(code_client);
CREATE INDEX IX_lab_revues_code_client          ON lab_revues(code_client);
CREATE INDEX IX_lab_audit_code_client           ON lab_audit_log(code_client);

-- Filtres dashboard
CREATE INDEX IX_lab_evenements_statut           ON lab_evenements(statut, date_echeance);
CREATE INDEX IX_lab_diligences_statut           ON lab_diligences(statut, date_echeance, id_responsable);
CREATE INDEX IX_lab_dossier_risque              ON lab_dossier(niveau_risque);
CREATE INDEX IX_lab_revues_prochaine            ON lab_revues(statut, date_revue);
CREATE INDEX IX_lab_scores_actif                ON lab_scores_risque(code_client, est_actif);
CREATE INDEX IX_lab_audit_date                  ON lab_audit_log(date_action, type_action);
GO

-- ============================================================
-- 15. DONNÉES INITIALES - Critères de scoring
-- ============================================================
INSERT INTO lab_scoring_criteres (code_critere, libelle, ponderation, ordre_affichage) VALUES
('PAYS_RISQUE',     'Pays / Zones géographiques à risque',          2.00, 1),
('SECTEUR',         'Secteur d''activité sensible',                  1.50, 2),
('PEP',             'Personne Politiquement Exposée ou lien PEP',    2.50, 3),
('COMPLEXITE',      'Complexité de la structure juridique',          1.50, 4),
('VOLUME_OPS',      'Volume et nature des opérations',               1.00, 5),
('HISTORIQUE',      'Historique événements / alertes LAB',           2.00, 6),
('SANCTIONS',       'Présence sous sanctions ou gel des avoirs',     3.00, 7),
('RELATIONS_INT',   'Relations internationales significatives',      1.00, 8);
GO

-- ============================================================
-- 16. DONNÉES INITIALES - Paramétrage cabinet
-- ============================================================
INSERT INTO lab_parametrage (code_param, libelle, valeur) VALUES
('SEUIL_RISQUE_FAIBLE',     'Score max pour niveau Faible',         '33'),
('SEUIL_RISQUE_MOYEN',      'Score max pour niveau Moyen',          '66'),
('PERIODICITE_REVUE_FAIBLE','Périodicité revue risque Faible (mois)','24'),
('PERIODICITE_REVUE_MOYEN', 'Périodicité revue risque Moyen (mois)', '12'),
('PERIODICITE_REVUE_ELEVE', 'Périodicité revue risque Élevé (mois)', '6'),
('DELAI_ALERTE_REVUE_JOURS','Jours avant revue pour alerte dashboard','90'),
('VERSION_SCORING',         'Version du référentiel de scoring',    '1.0');
GO

PRINT 'Schema LAB/KYC créé avec succès - 13 tables + index + données initiales';
GO
