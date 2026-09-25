# Module 2 — Formation professionnelle

Formule commerciale : **FORMATION PROFESSIONNELLE — 15 000 F CFA / mois** (126 000 F CFA / an).
Concerne les établissements de type `vocational_center` et `technical_center`
(vocabulaire « Apprenant / Session / Formateur » déjà en place). Le Module 1
(Scolaire) et les universités ne sont pas modifiés.

## 1. Analyse de l'existant (réutilisé, pas de système parallèle)

| Besoin du module | Existant réutilisé | Extension |
| --- | --- | --- |
| Formations créées librement | `programs` (kind `training`, `duration_hours`, `description`, `is_active`) | niveau, conditions d'admission, certificat délivré, coût, frais d'inscription, échéances par défaut, programme, durée affichée ; suppression contrôlée |
| Sessions | `classes` (kind `training_session`, `program_id`, `starts_on`, `ends_on`, `capacity`, `room_id`, `head_teacher_id`) | programme de session, tarif propre (facultatif), contrôle de capacité |
| Modules / cours et formateurs d'une session | `subjects` + `class_subjects` (formateur par module) | — |
| Classes / groupes **facultatifs** | — | table `training_groups`, réglage `settings.training.groups_enabled` |
| Apprenant (dossier) | `students` (matricule unique, photo, statut), `guardians` (personne à contacter), `file_objects` (pièces) | pièces du dossier par catégorie |
| Inscription | `create_enrollment_application` + `validate_enrollment` | `enrollments.group_id`, RPC `enroll_learner` (inscription + facture + échéancier + 1er versement) |
| Paiements, échéances, reliquat, reçu | `invoices`, `invoice_lines`, `installments`, `payments`, reçus PDF | — |
| Badge + QR | `staff_badges` (jeton `NEOSCOL-BADGE:<jeton>`), PDF badge | table `student_badges` (même format, même cycle de vie : générer, réimprimer, désactiver, remplacer) |
| Écran de scan | kiosque `/pointage` (caméra, douchette, saisie) | détection automatique FORMATEUR / APPRENANT, salle du poste |
| Journal des scans | `badge_scans` (acceptés et refusés, audit) | colonnes apprenant, types `entry` / `exit` |
| Pointage formateur | `scan_staff_badge` (arrivée, retard, déverrouillage du cours) | message « Bonjour … Votre cours … Salle … » |
| Entrées / sorties apprenant | — | table `learner_attendance` (plusieurs périodes par jour, retard, durée) |
| Emploi du temps | `timetable_slots` (session, module, formateur, salle, jour, heures) | `group_id` (créneau d'un groupe ou de toute la session) |
| Évaluations, examens, TP | `assessments` (kinds test/exam/practical/project…), `grades` | — |
| Compétences | — | `training_competencies`, `learner_competencies` |
| Stages | — | table `internships` |
| Documents | Document Studio, `issued_documents` (numéro + QR de vérification), `training_certificate` | attestation de formation, relevé de notes de formation, fiche de compétences |
| Statistiques | rapports, tableau de bord | RPC `training_dashboard` |
| Multi-établissement | RLS `app.permitted_org_ids`, composite FK `(organization_id, id)` | appliqué à toutes les nouvelles tables |

## 2. Fichiers concernés

**Migration** : `supabase/migrations/20260930002100_formation_professionnelle.sql` (unique, additive).

**Seed** : `supabase/seed.sql` — démonstration DEMOF enrichie (formations, sessions, formateurs, apprenants, emploi du temps, badges).

**Backend** : `src/features/training/{config.ts, queries.ts, actions.ts, scan.ts}`, `src/features/staff/actions.ts` (le scan du kiosque passe par le scan unifié pour les centres de formation), `src/features/documents/*` (nouveaux documents).

**Pages** : `/formation` (tableau du jour), `/formation/formations[/id]`, `/formation/sessions/[id]`, `/formation/inscription`, `/formation/presences`, `/formation/badges`, `/formation/statistiques`, `/formation/parametres` ; onglets du dossier apprenant dans `/eleves/[id]` ; `/pointage` ; `/emploi-du-temps` (groupe) ; routes PDF `/api/documents/badges-apprenants/[studentId]`, `/api/documents/formation/[studentId]`.

**Navigation** : `src/config/navigation.ts` (entrées réservées aux centres de formation).

**Tests** : `tests/db/formation.test.mjs`, `tests/e2e/formation-professionnelle.mjs`.

## 3. Risques de régression et parades

| Risque | Parade |
| --- | --- |
| Contrainte d'emploi du temps « une classe, un cours à la fois » | recréée avec `coalesce(group_id, …)` : identique pour les écoles (pas de groupe), deux groupes d'une même session peuvent avoir cours en même temps ; un créneau « toute la session » reste incompatible avec un créneau de groupe (déclencheur). Même nom de contrainte (messages d'erreur inchangés). |
| Kiosque du personnel des écoles | les écoles continuent d'appeler `scan_staff_badge` à l'identique ; le scan unifié ne s'utilise que pour les centres de formation, et délègue les badges du personnel à `scan_staff_badge`. |
| `badge_scans` | colonnes ajoutées nullables, `kind` élargi (valeurs existantes conservées). |
| Inscriptions | `group_id` nullable ; capacité contrôlée uniquement pour les sessions de formation. |
| Permissions | une seule nouvelle permission (`students.badges.manage`), ajoutée au catalogue TypeScript et aux rôles modèles. |
| Module Scolaire / Université | aucune table, aucun écran, aucun réglage `school` modifié ; les nouvelles entrées de menu sont masquées hors formation. |
