-- =============================================================================
-- Essai gratuit : 20 jours (au lieu de 14) pour les NOUVEAUX essais.
-- Les essais déjà en cours conservent leur date de fin (aucun effet rétroactif) ;
-- aucun autre paramètre commercial n'est modifié.
-- =============================================================================
alter table public.subscription_plans alter column trial_days set default 20;
update public.subscription_plans set trial_days = 20 where trial_days = 14;
