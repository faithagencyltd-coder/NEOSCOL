# Site web officiel NeoScool — audit et architecture

Ce document sert de référence au site commercial. Il part du logiciel réel (code, base, écrans) ;
le domaine www.Neoscool.com n'est qu'une destination affichée, jamais une source.

## 1. Audit : ce qui existe réellement (et peut être présenté)

| Thème | Réalité dans le logiciel | Présentation sur le site |
|---|---|---|
| Module scolaire | Établissement, années, niveaux/séries/matières, classes, élèves, familles, inscriptions (formulaires personnalisables, remises), personnel, emploi du temps, appel, justifications, évaluations, saisie et import de notes, bulletins (éditeur, PDF, QR de vérification), résultats annuels, finances (frais, échéanciers, factures, reçus, impayés, dépenses), documents PDF, annonces, messagerie, portails parent/élève, rapports, audit, passage d'année, archives | Disponible |
| Université | Structure (facultés, domaines, mentions, parcours, niveaux, semestres), UE/ECUE, crédits ECTS, inscriptions, résultats, rattrapage, délibérations, relevés, stages, mémoires, soutenances, diplômes, portail étudiant | Disponible |
| Formation professionnelle | Formations, filières, promotions, groupes, modules, formateurs, apprenants, évaluations, certificats, portail apprenant | Disponible (vocabulaire des compétences/certifications : ce qui existe seulement) |
| Multi-établissements | Module 4 (groupe + espaces séparés), enseignant sur plusieurs établissements avec un seul compte, données isolées en base | Disponible |
| Badges / Smart Badge | Cartes et badges avec QR, kiosque de pointage du personnel, messages vocaux à l'arrivée ; un scan enregistre un pointage, pas une présence au cours | Disponible, formulé sans confusion avec l'appel |
| Hors ligne | File d'attente locale pour l'appel et le pointage, envoi automatique au retour du réseau | Disponible (périmètre exact : appel et pointage) |
| IA | Assistant (clé configurée par la plateforme, quota, outils sous les droits de l'utilisateur) | Disponible « lorsqu'il est activé » |
| Notifications | Dans l'application, push (clés VAPID à configurer), e-mail/SMS/WhatsApp via les intégrations configurées | Disponible selon configuration |
| Import | Excel (.xlsx) et CSV : analyse, correspondance des colonnes, détection des doublons, validation, import par lots, rejets téléchargeables | Disponible |
| Export | XLSX, CSV, PDF (documents), PNG (cartes) | Uniquement ces formats (pas de JSON ni de ZIP) |
| Sécurité | Rôles et permissions contrôlés en base (RLS), isolation par établissement, journal d'audit inaltérable, double authentification, sessions, verrouillage, anti-robot | Disponible ; aucune promesse de sauvegarde propre au logiciel |
| Pays | 13 pays configurés (devise, langues, fuseau, format de date, échelle de notes, périodes) ; Country Connect = modèles de fichiers d'import/export configurables | « Pays pris en charge par la configuration », jamais « déployés » |
| Systèmes nationaux | Aucune connexion ni API vers un système national ; aucun modèle EducMaster préconfiguré | Présentés seulement s'ils sont renseignés et vérifiés par le Super Admin, toujours « en complément » |
| Tarifs | Formules, prix mensuel/annuel, essai, codes promo, offres automatiques en base, modifiables par le Super Admin | Lus en base, jamais codés en dur |
| Témoignages, clients, statistiques | Aucun | Section masquée tant que le Super Admin n'en publie pas de réels |

## 2. Architecture du site

Pages (français par défaut, anglais sous `/en`) :

- `/` — accueil : hero (vraies captures du logiciel), acteurs connectés, vidéo, secteurs, parcours du module scolaire, « une information saisie une fois », fonctionnalités, Smart Badge, hors ligne, sécurité, import/export, multi-établissements, pays, tarifs (aperçu), CTA final.
- `/secteurs/scolaire`, `/secteurs/universite`, `/secteurs/formation` — pages détaillées.
- `/pays` — pays configurés, contexte, systèmes institutionnels vérifiés.
- `/tarifs` — existante, lue en base.
- `/demo` — reste le hub de démonstration du logiciel ; `/contact` — formulaire, demande de démonstration, coordonnées.
- `/aide`, `/conditions`, `/confidentialite` — existantes.

Administrable depuis la console (sans code) : slogan, SEO, liens des boutons, WhatsApp (numéro, activation,
message par défaut, texte, position), réseaux sociaux (ajout, ordre, activation), pays affichés et contenu par pays
(contexte éducatif, systèmes institutionnels vérifiés, statut), vidéos, témoignages réels, sections de l'accueil,
demandes reçues (contact et démonstration). Coordonnées, questions, conditions, couleur et logo : déjà en place.

Images : captures réelles du logiciel sur l'établissement de démonstration (données fictives, signalées comme telles).
Photos de personnes : aucune photo inventée ; emplacements administrables pour de vraies photos.
