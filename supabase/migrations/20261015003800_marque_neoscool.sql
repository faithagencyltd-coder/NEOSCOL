-- ============================================================================
-- Marque officielle : « NeoScool » (écriture du logo fourni ; « .NeoScool »
-- stylé n'est utilisé que pour le logo dans l'interface).
-- Remplace « NEOSCOOL » posé par 20261014003700 dans les textes produits par la
-- base. Aucune migration existante n'est modifiée ; aucun identifiant technique
-- (préfixes QR NEOSCOL-*, noms de tables, colonnes, fonctions) n'est touché.
-- ============================================================================

update public.permissions set label = replace(label, 'NEOSCOOL', 'NeoScool')
 where code in ('billing.read', 'billing.manage') and label like '%NEOSCOOL%';
update public.subscription_plans set description = replace(description, 'NEOSCOOL', 'NeoScool') where description like '%NEOSCOOL%';
update public.payment_providers set description = replace(description, 'NEOSCOOL', 'NeoScool') where description like '%NEOSCOOL%';

comment on column public.students.origin is 'native : créé dans NeoScool ; import : migration d''un fichier ; manual_history : ancien élève saisi manuellement.';
comment on column public.students.legacy_matricule is 'Matricule attribué par l''ancien système de l''établissement (le matricule NeoScool reste permanent).';
comment on table public.subscription_plans is
  'Formules NeoScool. Les prix sont copiés sur les abonnements et les factures : les modifier n''a aucun effet rétroactif.';

-- Les 6 fonctions redéfinies par 20261014003700 : mêmes corps, seul le texte
-- visible change (CREATE OR REPLACE conserve propriétaire et droits).
do $$
declare
  f regprocedure;
  v_def text;
begin
  foreach f in array array[
    'app.billing_apply_payment(uuid, text, uuid, text)'::regprocedure,
    'app.country_connect_columns_error(jsonb, text)'::regprocedure,
    'app.require_platform_admin()'::regprocedure,
    'public.billing_cancel(uuid, text)'::regprocedure,
    'public.country_connect_import(uuid, uuid, jsonb, boolean, text)'::regprocedure,
    'public.save_message_template(uuid, uuid, text, text, text, text, uuid, text[], boolean)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(f);
    if position('NEOSCOOL' in v_def) > 0 then
      execute replace(v_def, 'NEOSCOOL', 'NeoScool');
    end if;
  end loop;
end $$;
