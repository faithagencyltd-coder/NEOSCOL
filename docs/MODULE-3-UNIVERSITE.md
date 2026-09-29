# Module 3 — Université / Enseignement supérieur

Établissements concernés : types `university` et `institute`. La nature précise
(université, institut supérieur, école supérieure, établissement privé, faculté,
autre) est un réglage (`settings.university.establishment_kind`) : aucun modèle
unique n'est imposé. Les Modules 1 (Scolaire) et 2 (Formation professionnelle)
ne sont pas modifiés fonctionnellement.

## 1. Ce qui existe déjà

| Élément | Existant | Constat |
| --- | --- | --- |
| Vocabulaire | `vocabularyFor('university')` : Étudiant / Promotion / Enseignant / Année universitaire | à compléter (UE, crédits, jury…) |
| Établissement de démo | DEMOU : année 2026-2027, Semestres 1 et 2, niveaux L1→M1, filière « Licence Informatique », promotion L1, 6 unités avec crédits ECTS, notes CC + examen, relevés publiés | les « UE » sont de simples matières : pas de hiérarchie UE → matières |
| Crédits | `subjects.credits`, seuil `settings.grading.credit_threshold`, résumé des crédits sur les relevés | pas de compensation, ni de crédits par UE / semestre / année / cycle |
| Semestres | `academic_periods` (type `semester`) | pas de sessions d'examen ni de rattrapage |
| Relevés | `report_cards` (moteur du bulletin scolaire, colonnes CC/Examen, décisions) | moteur scolaire : pas de délibération, pas d'historique des décisions du jury |
| Étudiants, inscriptions | `students`, `enrollments` (inscription validée → facture via `fee_rates`, échéancier) | inscription administrative seulement ; pas d'inscription pédagogique, pas de parcours |
| Enseignants | `staff_members` (+ badge QR) | pas de grade, ni de département |
| Salles | `rooms` (nom, bâtiment, capacité) | pas de type, numéro, équipements, disponibilité |
| Emploi du temps | `timetable_slots` (+ groupes facultatifs, vue par salle, depuis le Module 2) | pas de type d'enseignement (CM/TD/TP) |
| Badges, scan, présence | `student_badges`, `scan_badge` (profil détecté automatiquement), `learner_attendance` (entrées/sorties/retards) | réservés aux sessions de formation |
| Groupes | `training_groups` (facultatifs) | réservés aux centres de formation |
| Stages | `internships` | pas d'encadreur académique, de convention, ni de rapport |
| Diplômes | `student_diplomas` (import des données historiques) | pas de délivrance, de numérotation, ni d'historique |
| Paiements | `fee_types` / `fee_rates` / `invoices` / `installments` / `payments` / reçus | réutilisables tels quels (frais par niveau / filière) |
| Documents | Document Studio, numéro + QR de vérification, carte scolaire, certificat de scolarité | relevé LMD, PV de délibération, diplôme, attestations à ajouter |
| Portails | portail élève/parent (`/portail`), « Mes cours » et saisie des notes pour les enseignants | pas de résultats / crédits / mémoire côté étudiant |
| Sécurité | RLS `app.permitted_org_ids`, clés étrangères composites `(organization_id, id)`, audit | appliquée à toutes les nouvelles tables |

## 2. Réutilisé

Authentification, rôles et permissions, isolation entre établissements, stockage des fichiers, badges et QR, tablette
de scan, entrées/sorties, emploi du temps, groupes facultatifs, évaluations et saisie des notes, finances
(frais, échéanciers, paiements, reçus), moteur de documents PDF (numérotation, QR), notifications, composants UI.

## 3. Ajouté (données métier propres à l'université)

- **Structure** : `faculties` (facultatif), `departments` (facultatif), filières (`programs` enrichis : faculté,
  département, responsable, durée, diplôme préparé), `program_tracks` (parcours / spécialités),
  `academic_cycles` (Licence, Master, Doctorat… configurables, crédits requis), niveaux rattachés à un cycle.
- **Calendrier** : périodes d'inscription sur l'année, `exam_sessions` (session normale, rattrapage).
- **Enseignements** : `teaching_units` (UE : code, crédits, coefficient, semestre, responsable), matières
  rattachées à une UE (volume horaire CM/TD/TP, coefficient, crédits), type d'enseignement des créneaux.
- **Inscriptions** : parcours sur l'inscription administrative, `course_registrations` (inscription pédagogique
  aux UE d'un semestre).
- **Résultats** : `ue_results`, `semester_results` calculés selon les règles de l'établissement (seuil,
  compensation, pondération, règle de rattrapage), crédits par UE / semestre / année / cycle, classement facultatif.
- **Jury** : `deliberations`, `deliberation_decisions` (historique de chaque décision conservé), PV.
- **Mémoires et soutenances** : `theses`, `defenses`.
- **Diplômes** : délivrance numérotée, statut, historique (`student_diplomas` enrichi).
- **Rôles** : Scolarité, Responsable de filière, Jury (créés pour les établissements d'enseignement supérieur).
- **Réglages** : `settings.university` (fonctionnalités activables, règles de calcul, grades des enseignants).

## 4. Risques de régression et parades

| Risque | Parade |
| --- | --- |
| Scan unifié et assiduité (Module 2) étendus aux promotions universitaires | condition ajoutée seulement pour les établissements d'enseignement supérieur ; tests Module 2 rejoués |
| Groupes (`training_groups`) ouverts aux universités | règle ajoutée pour les universités, règle des centres inchangée |
| Contraintes élargies (types d'évaluation, catégories de frais, types de documents) | valeurs existantes conservées |
| Menus | entrées universitaires réservées aux universités ; entrées scolaires masquées pour elles uniquement |
| Relevés existants de DEMOU | conservés ; le relevé universitaire est un document supplémentaire |

## 5. Réalisation

### Écrans (`/universite/…`, identité visuelle propre, responsive)

| Écran | Rôle |
|---|---|
| `/universite` | Tableau de bord universitaire (effectifs, réussite, crédits, présences du jour, bloc enseignant) |
| `/universite/structure` | Facultés, départements (facultatifs), filières, parcours / spécialités, cycles et niveaux |
| `/universite/filieres/[id]` | Fiche filière : responsable, diplôme préparé, conditions d'admission, promotions, programme d'études |
| `/universite/annees` | Années académiques, semestres, sessions d'examen (normale, rattrapage) — historique conservé |
| `/universite/ue` | UE et matières (ECUE) : crédits, coefficients, volumes CM/TD/TP, types d'enseignement, affectation promotion + enseignant |
| `/universite/enseignants`, `/universite/salles` | Grades configurables, départements, spécialités ; salles (type, capacité, équipements, disponibilité) |
| `/universite/inscription` | Inscription administrative (frais → facture en tranches) puis inscription pédagogique automatique aux UE |
| `/universite/badges`, `/universite/presences` | Badges étudiants (remplacement d'un badge perdu, historique) ; journal entrées / sorties, retards, sorties anticipées, scans refusés, enseignants présents |
| `/universite/resultats` | Moyennes matière / UE / semestre, crédits, compensation, onglet Rattrapage (note initiale conservée) |
| `/universite/deliberations` + `[id]` | Jury : décisions proposées, décisions versionnées (historique), clôture = publication, réouverture motivée, procès-verbal |
| `/universite/stages`, `/memoires`, `/soutenances`, `/diplomes` | Stages, mémoires / thèses, soutenances (jury, note, PV), diplômes numérotés (révocation motivée) |
| `/universite/statistiques`, `/universite/parametres` | Pilotage ; fonctionnalités facultatives et règles de calcul configurables |
| `/universite/mes-enseignements` | Portail enseignant : matières, promotions, emploi du temps, mémoires dirigés |
| `/eleves/[id]` (onglets) | Dossier académique permanent, inscription pédagogique, résultats et crédits, assiduité, badge |
| `/portail/resultats`, `/portail/parcours` | Portail étudiant : SES résultats publiés et son parcours (RLS) |
| `/pointage` | Tablette « SCANNER VOTRE BADGE » : ÉTUDIANT / ENSEIGNANT reconnus automatiquement, ENSEIGNANT PRÉSENT, sortie anticipée |

### Documents (numérotés, vérifiables par QR)

Relevé de notes LMD par semestre (PROVISOIRE tant que la délibération n'est pas close), procès-verbal de délibération,
diplôme (paysage ; révoquer le diplôme révoque ses documents émis — migration `20261002002300_universite_documents.sql`),
certificat de scolarité, attestation d'inscription, attestation de réussite, attestation de stage, carte étudiant, badge étudiant.
Les attestations universitaires ne sont proposées qu'aux établissements d'enseignement supérieur ; les documents de formation
professionnelle n'y apparaissent pas.

### Sécurité

Chaque page exige l'établissement d'enseignement supérieur, la permission et, le cas échéant, la fonctionnalité activée (sinon 404) ;
chaque action serveur revérifie la permission ; la base applique la RLS et les règles métier. Types d'évaluation universitaires
(contrôle continu, soutenance, rattrapage) refusés côté serveur hors enseignement supérieur. Étudiants et tablette redirigés
vers leur écran dédié.

## 6. Tests

| Suite | Résultat |
|---|---|
| Base de données (`npm run db:test`) | 140 / 140 (dont 12 tests Université : structure, inscriptions, résultats, rattrapage, délibération, portail, mémoires, diplômes, révocation en cascade, scan, isolation) |
| Tests unitaires | 9 / 9 |
| E2E Université (`tests/e2e/universite.mjs`) | 111 vérifications OK — parcours étudiant, enseignant, finance, académique, séparation des modules, sécurité, mobile ; rejouable |
| E2E Formation professionnelle | 75 OK (non-régression Module 2) |
| E2E Module Scolaire | 51 OK (non-régression Module 1) |
| E2E Abonnements | 40 OK |
| E2E 12 scénarios | 49 OK |

Données de démonstration universitaires déterministes (notes calculées à partir du nom de l'étudiant et de la matière) :
7 étudiants admis, 3 autorisés au rattrapage au semestre 1.
