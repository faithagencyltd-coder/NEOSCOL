-- =============================================================================
-- NeoScool Support Center : base de connaissances, chatbot (site public et
-- portails), transfert vers un humain, canal WhatsApp (API officielle Meta),
-- le tout piloté par le Super Admin. Réutilise les demandes d'assistance
-- existantes (support_tickets) : un seul système de suivi.
--
--  • Chatbot désactivé par défaut (module sensible) ; réponses uniquement à
--    partir des articles publiés de la base de connaissances (jamais de données
--    d'établissement, d'élève ou de finances).
--  • Visiteur sans compte : conversation reconnue par un jeton aléatoire
--    (seule son empreinte est conservée).
--  • Lecture et réponses côté plateforme : équipe Super Admin (rôles existants).
-- =============================================================================

-- 1. Demandes d'assistance : canal d'origine et demandeur sans compte -----------
alter table public.support_tickets
  add column channel text not null default 'portal' check (channel in ('portal', 'chatbot', 'site', 'whatsapp', 'email', 'platform')),
  add column requester_name text check (requester_name is null or char_length(requester_name) <= 120),
  add column requester_email text check (requester_email is null or char_length(requester_email) <= 160),
  add column requester_phone text check (requester_phone is null or char_length(requester_phone) <= 30);
update public.support_tickets set channel = 'platform' where kind = 'incident';
-- Une demande venue du chatbot, du site ou de WhatsApp peut ne concerner aucun établissement.
alter table public.support_tickets drop constraint if exists support_tickets_check;
alter table public.support_tickets add constraint support_tickets_scope_check
  check (kind = 'incident' or organization_id is not null or channel in ('chatbot', 'site', 'whatsapp', 'email'));
alter table public.support_ticket_messages drop constraint if exists support_ticket_messages_author_side_check;
alter table public.support_ticket_messages add constraint support_ticket_messages_author_side_check check (author_side in ('school', 'platform', 'visitor'));

-- 2. Réglages (lisibles par tous : aucun secret) et secrets (serveur seulement) ----
create table public.support_settings (
  id integer primary key default 1 check (id = 1),
  chatbot_enabled boolean not null default false,
  chatbot_on_site boolean not null default true,
  chatbot_in_portals boolean not null default true,
  ai_enabled boolean not null default false,
  ai_model text not null default 'claude-haiku-4-5-20251001' check (ai_model in ('claude-haiku-4-5-20251001', 'claude-opus-5')),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  welcome_message text not null default 'Bonjour ! Je suis l''assistant NeoScool. Posez votre question sur NeoScool (inscription, abonnements, portails, connexion…).'
    check (char_length(welcome_message) between 5 and 500),
  handoff_message text not null default 'Souhaitez-vous parler à notre équipe Support ?' check (char_length(handoff_message) between 5 and 300),
  whatsapp_inbound_enabled boolean not null default false,
  whatsapp_bot_replies boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.support_settings (id) values (1);
alter table public.support_settings enable row level security;
create policy support_settings_select on public.support_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.support_settings from anon, authenticated;

create table public.support_secrets (
  id integer primary key default 1 check (id = 1),
  whatsapp_verify_token_hash text check (whatsapp_verify_token_hash is null or whatsapp_verify_token_hash ~ '^[a-f0-9]{64}$'),
  whatsapp_app_secret_ciphertext text,
  updated_at timestamptz not null default now()
);
insert into public.support_secrets (id) values (1);
alter table public.support_secrets enable row level security;
revoke all on public.support_secrets from anon, authenticated;
grant select, update on public.support_secrets to service_role;

-- 3. Base de connaissances -----------------------------------------------------
create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('neoscool', 'compte', 'inscription', 'abonnement', 'fonctionnalites', 'portails', 'paiements', 'formation', 'connexion', 'technique', 'autre')),
  title text not null check (char_length(btrim(title)) between 4 and 200),
  body text not null check (char_length(btrim(body)) between 10 and 6000),
  keywords text[] not null default '{}',
  audience text not null default 'all' check (audience in ('public', 'school', 'all')),
  published boolean not null default false,
  sort_order integer not null default 100,
  views integer not null default 0,
  helpful integer not null default 0,
  not_helpful integer not null default 0,
  search tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index knowledge_articles_search_idx on public.knowledge_articles using gin (search);
-- Index de recherche tenu à jour à chaque écriture (titre et mots-clés prioritaires).
create or replace function app.knowledge_articles_search()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search := setweight(to_tsvector('french', coalesce(new.title, '')), 'A')
             || setweight(to_tsvector('french', array_to_string(new.keywords, ' ')), 'A')
             || setweight(to_tsvector('french', coalesce(new.body, '')), 'B');
  return new;
end;
$$;
create trigger knowledge_articles_search_trg before insert or update of title, body, keywords on public.knowledge_articles
  for each row execute function app.knowledge_articles_search();
alter table public.knowledge_articles enable row level security;
create policy knowledge_articles_select on public.knowledge_articles for select to anon, authenticated
  using (published or (select app.is_platform_admin()));
revoke insert, update, delete on public.knowledge_articles from anon, authenticated;

-- 4. Conversations (chatbot, WhatsApp) -----------------------------------------
create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('chatbot', 'whatsapp')),
  token_hash text unique check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  whatsapp_from text check (whatsapp_from is null or whatsapp_from ~ '^\d{6,20}$'),
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  audience text not null default 'public' check (audience in ('public', 'school')),
  status text not null default 'bot' check (status in ('bot', 'waiting_agent', 'agent', 'closed')),
  ticket_id uuid references public.support_tickets (id) on delete set null,
  page text check (page is null or char_length(page) <= 200),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_conversations_status_idx on public.support_conversations (status, updated_at desc);
create index support_conversations_whatsapp_idx on public.support_conversations (whatsapp_from, updated_at desc);

create table public.support_conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.support_conversations (id) on delete cascade,
  sender text not null check (sender in ('visitor', 'bot', 'agent', 'system')),
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 6000),
  article_ids uuid[] not null default '{}',
  answered boolean,
  created_at timestamptz not null default now()
);
create index support_conversation_messages_conv_idx on public.support_conversation_messages (conversation_id, id);

alter table public.support_conversations enable row level security;
alter table public.support_conversation_messages enable row level security;
create policy support_conversations_select on public.support_conversations for select to authenticated using ((select app.is_platform_admin()));
create policy support_conversation_messages_select on public.support_conversation_messages for select to authenticated using ((select app.is_platform_admin()));
revoke insert, update, delete on public.support_conversations, public.support_conversation_messages from anon, authenticated;

-- 5. Recherche dans la base de connaissances (articles publiés seulement) --------
create or replace function public.knowledge_search(p_query text, p_audience text, p_limit integer default 3)
returns table (id uuid, category text, title text, body text, rank real)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('french', coalesce(p_query, '')) as tsq,
                    plainto_tsquery('french', coalesce(p_query, '')) as plain)
  select a.id, a.category, a.title, a.body,
         greatest(ts_rank_cd(a.search, q.tsq), ts_rank_cd(a.search, replace(q.plain::text, '&', '|')::tsquery)) as rank
    from public.knowledge_articles a, q
   where a.published
     and (a.audience = 'all' or a.audience = coalesce(p_audience, 'public') or (p_audience = 'school' and a.audience = 'public'))
     and (a.search @@ q.tsq or a.search @@ replace(q.plain::text, '&', '|')::tsquery)
   order by rank desc, a.sort_order
   limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;
grant execute on function public.knowledge_search(text, text, integer) to anon, authenticated;

-- 6. Écritures du chatbot (serveur, clé de service) -----------------------------
create or replace function public.support_chat_record(p_conversation uuid, p_token_hash text, p_sender text, p_body text, p_articles uuid[], p_answered boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.support_conversations;
begin
  select * into c from public.support_conversations where id = p_conversation for update;
  if c.id is null or (c.token_hash is not null and c.token_hash <> p_token_hash) then
    raise exception 'Conversation introuvable.' using errcode = 'no_data_found';
  end if;
  insert into public.support_conversation_messages (conversation_id, sender, body, article_ids, answered)
  values (p_conversation, p_sender, left(btrim(p_body), 6000), coalesce(p_articles, '{}'), p_answered);
  update public.support_conversations
     set updated_at = now(), last_inbound_at = case when p_sender = 'visitor' then now() else last_inbound_at end
   where id = p_conversation;
  -- Après transfert, les messages du visiteur rejoignent la demande d'assistance.
  if p_sender = 'visitor' and c.ticket_id is not null and c.status in ('waiting_agent', 'agent') then
    insert into public.support_ticket_messages (ticket_id, author_id, author_side, body)
    values (c.ticket_id, c.user_id, 'visitor', left(btrim(p_body), 5000));
    update public.support_tickets set updated_at = now(), status = case when status in ('waiting', 'resolved') then 'open' else status end where id = c.ticket_id;
  end if;
  if p_articles is not null and array_length(p_articles, 1) > 0 then
    update public.knowledge_articles set views = views + 1 where id = any (p_articles);
  end if;
end;
$$;
revoke all on function public.support_chat_record(uuid, text, text, text, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.support_chat_record(uuid, text, text, text, uuid[], boolean) to service_role;

-- Transfert vers un humain : crée la demande d'assistance (avec l'historique) et la lie.
create or replace function public.support_chat_handoff(p_conversation uuid, p_token_hash text, p_name text, p_email text, p_phone text, p_subject text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.support_conversations;
  v_ticket uuid;
  v_number bigint;
  v_transcript text;
begin
  select * into c from public.support_conversations where id = p_conversation for update;
  if c.id is null or (c.token_hash is not null and c.token_hash <> p_token_hash) then
    raise exception 'Conversation introuvable.' using errcode = 'no_data_found';
  end if;
  if c.ticket_id is not null then
    return jsonb_build_object('ticket_id', c.ticket_id, 'number', (select number from public.support_tickets where id = c.ticket_id));
  end if;
  if c.user_id is null and nullif(btrim(coalesce(p_email, '')), '') is null and nullif(btrim(coalesce(p_phone, '')), '') is null then
    raise exception 'Indiquez un e-mail ou un téléphone pour être recontacté.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.support_tickets where channel in ('chatbot', 'whatsapp') and created_at > now() - interval '1 hour'
        and ((c.user_id is not null and created_by = c.user_id) or (c.user_id is null and requester_email is not distinct from nullif(lower(btrim(p_email)), '')))) >= 5 then
    raise exception 'Trop de demandes en peu de temps : réessayez plus tard.' using errcode = 'check_violation';
  end if;
  select string_agg(case m.sender when 'visitor' then 'Visiteur' when 'bot' then 'Assistant' when 'agent' then 'Support' else 'Info' end || ' : ' || m.body, E'\n' order by m.id)
    into v_transcript from public.support_conversation_messages m where m.conversation_id = c.id;
  insert into public.support_tickets (organization_id, kind, category, severity, title, description, created_by, channel, requester_name, requester_email, requester_phone)
  values (c.organization_id, 'request', 'question', 'medium',
          left(coalesce(nullif(btrim(p_subject), ''), 'Demande depuis l''assistant NeoScool'), 160),
          left(coalesce(v_transcript, 'Conversation sans message.'), 5000), c.user_id, c.channel,
          nullif(left(btrim(coalesce(p_name, '')), 120), ''), nullif(left(lower(btrim(coalesce(p_email, ''))), 160), ''), nullif(left(btrim(coalesce(p_phone, '')), 30), ''))
  returning id, number into v_ticket, v_number;
  update public.support_conversations set ticket_id = v_ticket, status = 'waiting_agent', updated_at = now() where id = c.id;
  insert into public.support_conversation_messages (conversation_id, sender, body)
  values (c.id, 'system', 'Demande n° ' || v_number || ' transmise à l''équipe Support. Vous recevrez la réponse ici' ||
          case when c.channel = 'whatsapp' then ' sur WhatsApp.' else ' (gardez cette fenêtre ou revenez plus tard).' end);
  perform app.audit(c.organization_id, 'support.chat_handoff', 'support_tickets', v_ticket, 'Transfert vers le Support : demande n° ' || v_number, jsonb_build_object('channel', c.channel));
  return jsonb_build_object('ticket_id', v_ticket, 'number', v_number);
end;
$$;
revoke all on function public.support_chat_handoff(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.support_chat_handoff(uuid, text, text, text, text, text) to service_role;

-- Réponse de la plateforme sur une demande liée à une conversation : visible dans le chat.
create or replace function app.support_reply_to_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_side = 'platform' and not new.internal then
    insert into public.support_conversation_messages (conversation_id, sender, author_id, body)
    select c.id, 'agent', new.author_id, new.body from public.support_conversations c where c.ticket_id = new.ticket_id and c.status <> 'closed';
    update public.support_conversations set status = 'agent', updated_at = now() where ticket_id = new.ticket_id and status = 'waiting_agent';
  end if;
  return new;
end;
$$;
create trigger support_ticket_messages_to_conversation
  after insert on public.support_ticket_messages
  for each row execute function app.support_reply_to_conversation();

-- 7. Console : réglages, articles, conversations, statistiques -------------------
create or replace function public.platform_save_support_settings(p_settings jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  update public.support_settings set
    chatbot_enabled = coalesce((p_settings ->> 'chatbot_enabled')::boolean, chatbot_enabled),
    chatbot_on_site = coalesce((p_settings ->> 'chatbot_on_site')::boolean, chatbot_on_site),
    chatbot_in_portals = coalesce((p_settings ->> 'chatbot_in_portals')::boolean, chatbot_in_portals),
    ai_enabled = coalesce((p_settings ->> 'ai_enabled')::boolean, ai_enabled),
    ai_model = coalesce(nullif(p_settings ->> 'ai_model', ''), ai_model),
    instructions = case when p_settings ? 'instructions' then nullif(btrim(p_settings ->> 'instructions'), '') else instructions end,
    welcome_message = coalesce(nullif(btrim(p_settings ->> 'welcome_message'), ''), welcome_message),
    handoff_message = coalesce(nullif(btrim(p_settings ->> 'handoff_message'), ''), handoff_message),
    whatsapp_inbound_enabled = coalesce((p_settings ->> 'whatsapp_inbound_enabled')::boolean, whatsapp_inbound_enabled),
    whatsapp_bot_replies = coalesce((p_settings ->> 'whatsapp_bot_replies')::boolean, whatsapp_bot_replies),
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
  perform app.audit(null, 'platform.support_settings', 'support_settings', null, 'Réglages du Support Center modifiés', p_settings - 'instructions');
end;
$$;
revoke all on function public.platform_save_support_settings(jsonb) from public, anon;
grant execute on function public.platform_save_support_settings(jsonb) to authenticated;

create or replace function public.platform_save_knowledge_article(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_keywords text[] := coalesce((select array_agg(left(lower(btrim(k)), 40)) from jsonb_array_elements_text(coalesce(p_data -> 'keywords', '[]'::jsonb)) k where btrim(k) <> ''), '{}');
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_id is null then
    insert into public.knowledge_articles (category, title, body, keywords, audience, published, sort_order, updated_by)
    values (p_data ->> 'category', btrim(p_data ->> 'title'), btrim(p_data ->> 'body'), v_keywords, coalesce(p_data ->> 'audience', 'all'),
            coalesce((p_data ->> 'published')::boolean, false), coalesce((p_data ->> 'sort_order')::integer, 100), auth.uid())
    returning id into v_id;
  else
    update public.knowledge_articles
       set category = p_data ->> 'category', title = btrim(p_data ->> 'title'), body = btrim(p_data ->> 'body'), keywords = v_keywords,
           audience = coalesce(p_data ->> 'audience', 'all'), published = coalesce((p_data ->> 'published')::boolean, false),
           sort_order = coalesce((p_data ->> 'sort_order')::integer, 100), updated_at = now(), updated_by = auth.uid()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Article introuvable.' using errcode = 'no_data_found';
    end if;
  end if;
  perform app.audit(null, 'platform.knowledge_article', 'knowledge_articles', v_id, 'Article d''aide : ' || left(btrim(p_data ->> 'title'), 120), '{}'::jsonb);
  return v_id;
end;
$$;
revoke all on function public.platform_save_knowledge_article(uuid, jsonb) from public, anon;
grant execute on function public.platform_save_knowledge_article(uuid, jsonb) to authenticated;

-- Réponse d'un agent dans une conversation (avec ou sans demande liée).
create or replace function public.platform_support_reply(p_conversation uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.support_conversations;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.support_conversations where id = p_conversation for update;
  if c.id is null then
    raise exception 'Conversation introuvable.' using errcode = 'no_data_found';
  end if;
  if c.ticket_id is not null then
    -- Passe par la demande : le déclencheur recopie la réponse dans la conversation.
    perform public.add_support_message(c.ticket_id, p_body, false);
  else
    insert into public.support_conversation_messages (conversation_id, sender, author_id, body) values (c.id, 'agent', auth.uid(), left(btrim(p_body), 6000));
    update public.support_conversations set status = 'agent', updated_at = now() where id = c.id;
  end if;
  return jsonb_build_object('channel', c.channel, 'whatsapp_from', c.whatsapp_from, 'last_inbound_at', c.last_inbound_at);
end;
$$;
revoke all on function public.platform_support_reply(uuid, text) from public, anon;
grant execute on function public.platform_support_reply(uuid, text) to authenticated;

create or replace function public.platform_close_conversation(p_conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  update public.support_conversations set status = 'closed', updated_at = now() where id = p_conversation;
  insert into public.support_conversation_messages (conversation_id, sender, body) values (p_conversation, 'system', 'Conversation clôturée par l''équipe Support.');
end;
$$;
revoke all on function public.platform_close_conversation(uuid) from public, anon;
grant execute on function public.platform_close_conversation(uuid) to authenticated;

create or replace function public.platform_support_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'conversations', (select count(*) from public.support_conversations where created_at >= v_from and created_at < v_to),
    'by_channel', coalesce((select jsonb_object_agg(channel, n) from (select channel, count(*) n from public.support_conversations where created_at >= v_from and created_at < v_to group by 1) x), '{}'::jsonb),
    'handoffs', (select count(*) from public.support_conversations where ticket_id is not null and created_at >= v_from and created_at < v_to),
    'waiting', (select count(*) from public.support_conversations where status = 'waiting_agent'),
    'bot_answered', (select count(*) from public.support_conversation_messages where sender = 'bot' and answered and created_at >= v_from and created_at < v_to),
    'bot_unanswered', (select count(*) from public.support_conversation_messages where sender = 'bot' and answered = false and created_at >= v_from and created_at < v_to),
    'tickets_by_channel', coalesce((select jsonb_object_agg(channel, n) from (select channel, count(*) n from public.support_tickets where created_at >= v_from and created_at < v_to group by 1) x), '{}'::jsonb),
    'unanswered_questions', coalesce((select jsonb_agg(x) from (
        select v.body as question, v.created_at
          from public.support_conversation_messages b
          join lateral (select m.body, m.created_at from public.support_conversation_messages m
                         where m.conversation_id = b.conversation_id and m.sender = 'visitor' and m.id < b.id order by m.id desc limit 1) v on true
         where b.sender = 'bot' and b.answered = false and b.created_at >= v_from and b.created_at < v_to
         order by b.id desc limit 20) x), '[]'::jsonb),
    'top_articles', coalesce((select jsonb_agg(x) from (select id, title, views, helpful, not_helpful from public.knowledge_articles order by views desc limit 10) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.platform_support_stats(date, date) from public, anon;
grant execute on function public.platform_support_stats(date, date) to authenticated;

-- 8. Articles de départ (non publiés : le Super Admin relit puis publie) ----------
insert into public.knowledge_articles (category, title, body, keywords, audience, published, sort_order) values
  ('inscription', 'Comment inscrire mon établissement sur NeoScool ?',
   'Ouvrez la page « Inscription » du site, choisissez la formule et le type d''établissement, puis renseignez les informations demandées. Un essai gratuit est proposé selon les conditions affichées sur la page Tarifs.',
   '{inscription,créer,compte,établissement,essai}', 'public', false, 10),
  ('connexion', 'Je n''arrive pas à me connecter',
   'Vérifiez l''adresse e-mail ou le matricule et le mot de passe. Utilisez « Mot de passe oublié » sur la page de connexion. Les parents et élèves se connectent depuis le lien des portails fourni par leur établissement.',
   '{connexion,mot de passe,oublié,bloqué,accès}', 'all', false, 20),
  ('abonnement', 'Comment payer ou renouveler mon abonnement ?',
   'Dans l''application, ouvrez « Mon abonnement » : vous y trouvez la formule, les échéances, les factures et le paiement en ligne lorsque celui-ci est disponible.',
   '{abonnement,payer,renouveler,facture,formule}', 'school', false, 30);

-- 9. Lecture publique (visiteurs sans compte) : les politiques existaient, le droit
--    de lecture manquait. Réglages publics (aucun secret), articles publiés,
--    catégories d'annonces Opportunities, réglages de la mesure d'audience.
grant select on public.support_settings, public.knowledge_articles, public.opportunity_categories, public.analytics_settings to anon;
