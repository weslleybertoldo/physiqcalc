-- Physiq W5 — equipe da conta + Configurações do profissional (Perfil, Conta, Equipe, Convite, Aplicativo), no BANCO
-- PRINCIPAL (hkxvtsbwctxkrqzkkdoz). Idempotente. Spec "Physiq Unificado - desenho aprovado" §11.3 W5, §4.1 (papéis e quem vê
-- o quê), §4.6 (Configurações), §6.4 (o plano limita os papéis), §8.1 (conta_membros, convites), §8.3 (espelho de membros),
-- §9 (membro removido) e P1–P3, P6, P11.
--
-- Aplicar (backup ANTES, ver scripts/backup/):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929120000_w05_equipe.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929120000_w05_equipe.sql --so public
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929120000_w05_equipe.sql --compartilhado
--
-- O que muda e o que NÃO muda:
--   · GATILHOS DO ESPELHO DE MEMBROS: membro entra, sai ou muda de papel → fila espelho_pendencias (a mesma da W4, que o
--     pg_cron esvazia a cada 10 min e as ações da equipe disparam na hora); aluno troca de responsável de treino, de conta, é
--     bloqueado/desbloqueado ou vai para a lixeira → idem (o Treino liga o aluno ao personal certo, ou a ninguém);
--   · funções novas da equipe (security definer, sempre pelo auth.uid()): ver a equipe, convidar por e-mail com os papéis
--     que o plano permite, cancelar convite, mudar papéis, remover membro (os alunos dele ficam "sem responsável" — ou vão para
--     quem o dono escolher) e o código do Convite de cada membro;
--   · aceitar_convites_do_email (W3) corrigida: o membro novo ganha o código dele (PROF-NOME-SOBRENOME) e quem volta depois de
--     removido fica SÓ com os papéis do convite novo (antes somava os antigos);
--   · minha_situacao (W4) + 1 detalhe: a foto do Perfil (dados_profissionais.foto_url) vale antes da do Google;
--   · avisos: tipo 'membro_removido' ("Você não faz mais parte da equipe de …");
--   · Storage (bloco compartilhado): bucket público fotos-perfil (+ -staging) para a foto do Perfil, cada um na sua pasta;
--   · até a W28 a equipe (convidar, papéis, remover) é só das contas NOVAS — as legadas (Calc e Nutri) seguem com as regras
--     de hoje, com o dono sozinho (a cobrança/o acesso delas ainda é o do app antigo);
--   · nenhum dado existente muda (só colunas/constraints novas e funções); nada apaga aluno, treino ou dieta.

-- ============================================================================================================
-- 1. avisos: o membro removido fica sabendo (spec 9)
-- ============================================================================================================
alter table {schema}.avisos drop constraint if exists avisos_tipo_check;
alter table {schema}.avisos add constraint avisos_tipo_check
  check (tipo in ('plano_atualizado', 'reacao_diario', 'pagamento_confirmado', 'pagamento_recusado', 'consulta_marcada',
                  'avaliacao_nova', 'geral', 'membro_removido'));

-- ============================================================================================================
-- 2. Gatilhos do espelho de membros (spec 8.3): só ENFILEIRAM — quem dispara é a ação (espelho_disparar, pelo pg_net) e a
--    tarefa da fila do pg_cron (a cada 10 min). A trocar-token também corrige tudo no próximo login de cada pessoa.
-- ============================================================================================================
create or replace function {schema}.conta_membros_espelho() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id or new.papeis is distinct from old.papeis
          or new.status is distinct from old.status) then
    insert into {schema}.espelho_pendencias (tipo, payload) values ('pessoa', jsonb_build_object('principal_user_id', new.user_id));
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.user_id is not null and (tg_op = 'DELETE' or old.user_id is distinct from new.user_id) then
    insert into {schema}.espelho_pendencias (tipo, payload) values ('pessoa', jsonb_build_object('principal_user_id', old.user_id));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_conta_membros_espelho on {schema}.conta_membros;
create trigger trg_conta_membros_espelho after insert or update or delete on {schema}.conta_membros
  for each row execute function {schema}.conta_membros_espelho();

-- aluno: o que o Treino espelha da matrícula (professor_id, conta_id, status — spec 8.3 linha 2)
create or replace function {schema}.pacientes_espelho_responsaveis() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and (
       new.personal_id is distinct from old.personal_id or new.conta_id is distinct from old.conta_id
    or new.ativo is distinct from old.ativo or new.deleted_at is distinct from old.deleted_at
    or new.acesso_bloqueado_em is distinct from old.acesso_bloqueado_em or new.user_id is distinct from old.user_id) then
    insert into {schema}.espelho_pendencias (tipo, payload) values ('pessoa', jsonb_build_object('principal_user_id', new.user_id));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_pacientes_espelho_responsaveis on {schema}.pacientes;
create trigger trg_pacientes_espelho_responsaveis after update on {schema}.pacientes
  for each row execute function {schema}.pacientes_espelho_responsaveis();

-- ============================================================================================================
-- 3. Regras da equipe (auxiliares)
-- ============================================================================================================

-- a conta pode mexer na equipe? (até a W28: só as contas NOVAS; e sem o painel travado — spec 6.2 "trava os convites")
create or replace function {schema}.equipe_motivo_bloqueio(p_conta uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then 'conta_inexistente'
    when c.origem <> 'nova' or c.cobranca_legada then 'conta_legada'
    when {schema}.situacao_da_conta_em(c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias, {schema}.cobranca_hoje())
         in ('vencida', 'suspensa', 'cancelada') then 'conta_travada'
    else null end
  from (select 1) um left join {schema}.contas c on c.id = p_conta;
$$;

-- papéis que o plano da conta permite dar a um membro (spec 6.4: personal ← Treino; nutricionista ← Nutrição)
create or replace function {schema}.papeis_do_plano(p_conta uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when {schema}.conta_tem_modulo(p_conta, 'treino') then 'personal' end,
    case when {schema}.conta_tem_modulo(p_conta, 'nutricao') then 'nutricionista' end], null);
$$;

-- papéis pedidos pela tela → lista limpa (só personal/nutricionista, sem repetir, na ordem da spec)
create or replace function {schema}.papeis_de_modulo(p_papeis text[]) returns text[]
language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when 'personal' = any(coalesce(p_papeis, '{}')) then 'personal' end,
    case when 'nutricionista' = any(coalesce(p_papeis, '{}')) then 'nutricionista' end], null);
$$;

-- nome de uma pessoa para as telas (perfil do principal, senão o cadastro do login)
create or replace function {schema}.nome_da_pessoa(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(pr.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1))
    from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = p_user;
$$;

-- P26: no staging só entram (e só são convidadas) contas de teste — a mesma regra do "Sou profissional" (W4)
create or replace function {schema}.email_de_teste(p_email text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(btrim(coalesce(p_email, ''))) = 'teste@teste.com'
      or lower(btrim(coalesce(p_email, ''))) ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$';
$$;

-- ============================================================================================================
-- 4. Aceite do convite no 1º login (W3, pelo pos-login) — corrigido na W5
-- ============================================================================================================
create or replace function {schema}.aceitar_convites_do_email(p_user uuid, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_c record;
  v_mods text[];
  v_res jsonb;
  v_aceitos integer := 0;
  v_recusados jsonb := '[]'::jsonb;
  v_nome text;
  v_membro uuid;
begin
  if v_email = '' then
    return jsonb_build_object('aceitos', 0, 'recusados', v_recusados);
  end if;
  v_nome := {schema}.nome_da_pessoa(p_user);
  -- membros convidados direto na equipe (conta_membros sem login ainda)
  for v_c in select m.* from {schema}.conta_membros m
              where m.user_id is null and m.status = 'convidado' and lower(m.email_convite) = v_email loop
    if exists (select 1 from {schema}.conta_membros x where x.conta_id = v_c.conta_id and x.user_id = p_user) then
      update {schema}.conta_membros set status = 'removido', removido_em = now() where id = v_c.id;
    else
      update {schema}.conta_membros set user_id = p_user, status = 'ativo',
          codigo_convite = coalesce(codigo_convite,
            case when papeis && array['personal', 'nutricionista'] then {schema}.gerar_codigo_membro(v_nome) end)
       where id = v_c.id;
      v_aceitos := v_aceitos + 1;
    end if;
    perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
  end loop;
  -- convites (tabela convites): membro da equipe (W5) ou aluno (W3)
  for v_c in select c.* from {schema}.convites c
              where c.status = 'pendente' and lower(c.email) = v_email order by c.enviado_em loop
    v_mods := {schema}.modulos_do_plano((select plano from {schema}.contas where id = v_c.conta_id));
    if v_c.tipo = 'membro' then
      if not {schema}.papeis_permitidos(v_c.conta_id, v_c.papeis) then
        v_recusados := v_recusados || jsonb_build_object('convite_id', v_c.id, 'erro', 'papel_sem_modulo');
        continue;
      end if;
      -- W5: o membro novo ganha o código dele (Convite); quem volta depois de removido fica SÓ com os papéis do convite novo
      insert into {schema}.conta_membros as cm (conta_id, user_id, papeis, status, codigo_convite)
      values (v_c.conta_id, p_user, v_c.papeis, 'ativo',
              case when v_c.papeis && array['personal', 'nutricionista'] then {schema}.gerar_codigo_membro(v_nome) end)
      on conflict (conta_id, user_id) where user_id is not null do update
        set papeis = case when cm.status = 'removido' then excluded.papeis
                          else (select array(select distinct unnest(cm.papeis || excluded.papeis))) end,
            status = 'ativo', removido_em = null,
            codigo_convite = coalesce(cm.codigo_convite, excluded.codigo_convite)
      returning id into v_membro;
      update {schema}.convites set status = 'aceito', aceito_em = now() where id = v_c.id;
      insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
      values (v_c.conta_id, 'membro', jsonb_build_object('acao', 'aceitou_convite', 'membro_id', v_membro, 'papeis', to_jsonb(v_c.papeis),
                                                         'convite_id', v_c.id), p_user);
      perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
      v_aceitos := v_aceitos + 1;
    else
      v_res := {schema}.matricular_na_conta(p_user, v_c.conta_id,
        case when 'treino' = any(v_c.modulos) and 'treino' = any(v_mods) then v_c.responsavel_id end,
        case when 'nutricao' = any(v_c.modulos) and 'nutricao' = any(v_mods) then v_c.responsavel_id end,
        'novo', false);
      if coalesce((v_res ->> 'ok')::boolean, false) then
        update {schema}.convites set status = 'aceito', aceito_em = now() where id = v_c.id;
        v_aceitos := v_aceitos + 1;
      else
        v_recusados := v_recusados || jsonb_build_object('convite_id', v_c.id, 'erro', v_res ->> 'erro');
      end if;
    end if;
  end loop;
  return jsonb_build_object('aceitos', v_aceitos, 'recusados', v_recusados);
end;
$$;

-- ============================================================================================================
-- 5. Funções da equipe chamadas pela tela (Configurações › Equipe e Convite). Security definer, sempre pelo auth.uid().
-- ============================================================================================================

-- a equipe da conta (só o dono e o master): membros ativos com papéis, foto e quantos alunos cada um atende; convites
-- pendentes; os papéis que o plano permite e se a conta pode mexer na equipe agora
create or replace function {schema}.equipe_da_conta(p_conta uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c {schema}.contas%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  if not ({schema}.sou_dono(p_conta) or {schema}.eh_master()) then
    return jsonb_build_object('ok', false, 'erro', 'so_dono');
  end if;
  return jsonb_build_object(
    'ok', true,
    'conta', jsonb_build_object('id', v_c.id, 'nome', v_c.nome, 'origem', v_c.origem, 'plano', v_c.plano,
                                'modulos', to_jsonb({schema}.modulos_do_plano(v_c.plano)), 'dono_id', v_c.dono_id),
    'papeis_do_plano', to_jsonb({schema}.papeis_do_plano(p_conta)),
    'bloqueio', {schema}.equipe_motivo_bloqueio(p_conta),
    'membros', coalesce((
      select jsonb_agg(x.j order by x.dono desc, x.nome) from (
        select (m.user_id = v_c.dono_id) as dono, lower(coalesce({schema}.nome_da_pessoa(m.user_id), m.email_convite, '')) as nome,
          jsonb_build_object(
            'id', m.id, 'user_id', m.user_id, 'status', m.status, 'papeis', to_jsonb(m.papeis),
            'nome', coalesce({schema}.nome_da_pessoa(m.user_id), m.email_convite),
            'email', coalesce(u.email, m.email_convite),
            'foto_url', coalesce(nullif(btrim(pr.dados_profissionais ->> 'foto_url'), ''), u.raw_user_meta_data ->> 'avatar_url',
                                 u.raw_user_meta_data ->> 'picture'),
            'dono', (m.user_id = v_c.dono_id), 'eu', (m.user_id = v_uid), 'codigo_convite', m.codigo_convite, 'desde', m.criado_em,
            'alunos_treino', (select count(*) from {schema}.pacientes p
                               where p.conta_id = p_conta and p.personal_id = m.user_id and p.deleted_at is null),
            'alunos_nutricao', (select count(*) from {schema}.pacientes p
                                 where p.conta_id = p_conta and p.nutricionista_id = m.user_id and p.deleted_at is null)) as j
          from {schema}.conta_membros m
          left join auth.users u on u.id = m.user_id
          left join {schema}.profiles pr on pr.id = m.user_id
         where m.conta_id = p_conta and m.status in ('ativo', 'convidado')) x), '[]'::jsonb),
    'convites', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email, 'papeis', to_jsonb(c.papeis), 'enviado_em', c.enviado_em,
                                          'criado_por_nome', {schema}.nome_da_pessoa(c.criado_por)) order by c.enviado_em desc)
        from {schema}.convites c where c.conta_id = p_conta and c.tipo = 'membro' and c.status = 'pendente'), '[]'::jsonb),
    'alunos_sem_responsavel', (select count(*) from {schema}.pacientes p
                                where p.conta_id = p_conta and p.deleted_at is null and p.ativo
                                  and p.personal_id is null and p.nutricionista_id is null));
end;
$$;

-- convidar por e-mail (a função convites manda o e-mail depois). Mesmo e-mail pendente = reenvio (papéis atualizados).
create or replace function {schema}.convidar_membro(p_conta uuid, p_email text, p_papeis text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_papeis text[] := {schema}.papeis_de_modulo(p_papeis);
  v_c {schema}.contas%rowtype;
  v_bloqueio text;
  v_convite uuid;
  v_reenvio boolean := false;
  v_meu_email text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select * into v_c from {schema}.contas where id = p_conta for update;  -- serializa os convites da conta
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  if not ({schema}.sou_dono(p_conta) or {schema}.eh_master()) then
    return jsonb_build_object('ok', false, 'erro', 'so_dono');
  end if;
  v_bloqueio := {schema}.equipe_motivo_bloqueio(p_conta);
  if v_bloqueio is not null then
    return jsonb_build_object('ok', false, 'erro', v_bloqueio);
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  if coalesce(array_length(v_papeis, 1), 0) = 0 or cardinality(coalesce(p_papeis, '{}')) <> cardinality(
       array(select distinct x from unnest(coalesce(p_papeis, '{}')) as x where x in ('personal', 'nutricionista'))) then
    return jsonb_build_object('ok', false, 'erro', 'papeis_invalidos');
  end if;
  if not {schema}.papeis_permitidos(p_conta, v_papeis) then
    return jsonb_build_object('ok', false, 'erro', 'papel_sem_modulo', 'papeis_do_plano', to_jsonb({schema}.papeis_do_plano(p_conta)));
  end if;
  select lower(u.email) into v_meu_email from auth.users u where u.id = v_uid;
  if v_email = v_meu_email then
    return jsonb_build_object('ok', false, 'erro', 'proprio_email');
  end if;
  if exists (select 1 from {schema}.conta_membros m join auth.users u on u.id = m.user_id
              where m.conta_id = p_conta and m.status = 'ativo' and lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'erro', 'ja_e_membro');
  end if;
  -- freio: até 20 envios por hora e 30 convites pendentes por conta
  if (select count(*) from {schema}.convites c where c.conta_id = p_conta and c.tipo = 'membro'
        and c.enviado_em > now() - interval '1 hour') >= 20
     or (select count(*) from {schema}.convites c where c.conta_id = p_conta and c.tipo = 'membro' and c.status = 'pendente') >= 30 then
    return jsonb_build_object('ok', false, 'erro', 'muitos_convites');
  end if;
  select c.id into v_convite from {schema}.convites c
   where c.conta_id = p_conta and c.tipo = 'membro' and c.status = 'pendente' and lower(c.email) = v_email
   order by c.enviado_em desc limit 1;
  if v_convite is not null then
    update {schema}.convites set papeis = v_papeis, enviado_em = now(), criado_por = v_uid where id = v_convite;
    v_reenvio := true;
  else
    insert into {schema}.convites (conta_id, tipo, email, papeis, status, criado_por, enviado_em)
    values (p_conta, 'membro', v_email, v_papeis, 'pendente', v_uid, now())
    returning id into v_convite;
  end if;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (p_conta, 'membro', jsonb_build_object('acao', case when v_reenvio then 'reenviou_convite' else 'convidou' end,
                                                'convite_id', v_convite, 'email', v_email, 'papeis', to_jsonb(v_papeis)), v_uid);
  return jsonb_build_object('ok', true, 'convite_id', v_convite, 'reenvio', v_reenvio, 'email', v_email, 'papeis', to_jsonb(v_papeis),
                            'conta_nome', v_c.nome, 'quem_convidou', {schema}.nome_da_pessoa(v_uid),
                            'pessoa_existe', exists (select 1 from auth.users u where lower(u.email) = v_email));
end;
$$;

-- cancelar um convite pendente
create or replace function {schema}.cancelar_convite_membro(p_convite uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cv {schema}.convites%rowtype;
begin
  select * into v_cv from {schema}.convites where id = p_convite and tipo = 'membro';
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'convite_inexistente');
  end if;
  if not ({schema}.sou_dono(v_cv.conta_id) or {schema}.eh_master()) then
    return jsonb_build_object('ok', false, 'erro', 'so_dono');
  end if;
  if v_cv.status <> 'pendente' then
    return jsonb_build_object('ok', false, 'erro', 'convite_nao_pendente', 'status', v_cv.status);
  end if;
  update {schema}.convites set status = 'revogado' where id = p_convite;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_cv.conta_id, 'membro', jsonb_build_object('acao', 'cancelou_convite', 'convite_id', p_convite, 'email', v_cv.email), v_uid);
  return jsonb_build_object('ok', true);
end;
$$;

-- mudar os papéis de um membro ativo. O dono da conta fica sempre com 'dono' e só larga um papel de módulo sem alunos nele;
-- o membro que perde um papel deixa os alunos daquele módulo "sem responsável" (como na remoção — spec 4.6)
create or replace function {schema}.alterar_papeis_membro(p_membro uuid, p_papeis text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_m {schema}.conta_membros%rowtype;
  v_c {schema}.contas%rowtype;
  v_bloqueio text;
  v_modulo text[] := {schema}.papeis_de_modulo(p_papeis);
  v_novos text[];
  v_eh_dono boolean;
  v_sem_treino integer := 0;
  v_sem_nutri integer := 0;
begin
  select * into v_m from {schema}.conta_membros where id = p_membro for update;
  if not found or v_m.status <> 'ativo' or v_m.user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'membro_inexistente');
  end if;
  select * into v_c from {schema}.contas where id = v_m.conta_id;
  if not ({schema}.sou_dono(v_c.id) or {schema}.eh_master()) then
    return jsonb_build_object('ok', false, 'erro', 'so_dono');
  end if;
  v_bloqueio := {schema}.equipe_motivo_bloqueio(v_c.id);
  if v_bloqueio is not null then
    return jsonb_build_object('ok', false, 'erro', v_bloqueio);
  end if;
  if cardinality(coalesce(p_papeis, '{}')) <> cardinality(
       array(select distinct x from unnest(coalesce(p_papeis, '{}')) as x where x in ('dono', 'personal', 'nutricionista'))) then
    return jsonb_build_object('ok', false, 'erro', 'papeis_invalidos');
  end if;
  v_eh_dono := v_m.user_id = v_c.dono_id;
  if not v_eh_dono and 'dono' = any(coalesce(p_papeis, '{}')) then
    return jsonb_build_object('ok', false, 'erro', 'papel_dono');
  end if;
  if not v_eh_dono and coalesce(array_length(v_modulo, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'papeis_invalidos');
  end if;
  if not {schema}.papeis_permitidos(v_c.id, v_modulo) then
    return jsonb_build_object('ok', false, 'erro', 'papel_sem_modulo', 'papeis_do_plano', to_jsonb({schema}.papeis_do_plano(v_c.id)));
  end if;
  v_novos := case when v_eh_dono then array['dono'] || v_modulo else v_modulo end;
  -- papel de módulo que sai: os alunos dele naquele módulo
  if 'personal' = any(v_m.papeis) and not ('personal' = any(v_novos)) then
    select count(*) into v_sem_treino from {schema}.pacientes where conta_id = v_c.id and personal_id = v_m.user_id and deleted_at is null;
    if v_eh_dono and v_sem_treino > 0 then
      return jsonb_build_object('ok', false, 'erro', 'tem_alunos', 'modulo', 'treino', 'alunos', v_sem_treino);
    end if;
    update {schema}.pacientes set personal_id = null where conta_id = v_c.id and personal_id = v_m.user_id;
  end if;
  if 'nutricionista' = any(v_m.papeis) and not ('nutricionista' = any(v_novos)) then
    select count(*) into v_sem_nutri from {schema}.pacientes where conta_id = v_c.id and nutricionista_id = v_m.user_id and deleted_at is null;
    if v_eh_dono and v_sem_nutri > 0 then
      return jsonb_build_object('ok', false, 'erro', 'tem_alunos', 'modulo', 'nutricao', 'alunos', v_sem_nutri);
    end if;
    update {schema}.pacientes set nutricionista_id = null where conta_id = v_c.id and nutricionista_id = v_m.user_id;
  end if;
  update {schema}.conta_membros set papeis = v_novos,
      codigo_convite = coalesce(codigo_convite,
        case when v_novos && array['personal', 'nutricionista'] then {schema}.gerar_codigo_membro({schema}.nome_da_pessoa(v_m.user_id)) end)
   where id = p_membro;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (v_c.id, 'membro', jsonb_build_object('membro_id', p_membro, 'papeis', to_jsonb(v_m.papeis)),
          jsonb_build_object('acao', 'mudou_papeis', 'membro_id', p_membro, 'papeis', to_jsonb(v_novos),
                             'alunos_sem_treino', v_sem_treino, 'alunos_sem_nutricao', v_sem_nutri), v_uid);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'papeis', to_jsonb(v_novos), 'alunos_sem_treino', v_sem_treino, 'alunos_sem_nutricao', v_sem_nutri);
end;
$$;

-- remover um membro: perde o acesso na hora no principal (sou_membro) e no Treino pelo espelho (disparado aqui); os alunos
-- dele ficam "sem responsável" ou vão para outro membro da conta com o mesmo papel (escolha do dono); nada é apagado
create or replace function {schema}.remover_membro(p_membro uuid, p_novo_personal uuid default null, p_novo_nutri uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_m {schema}.conta_membros%rowtype;
  v_c {schema}.contas%rowtype;
  v_bloqueio text;
  v_treino integer := 0;
  v_nutri integer := 0;
  v_convites integer := 0;
begin
  select * into v_m from {schema}.conta_membros where id = p_membro for update;
  if not found or v_m.status = 'removido' then
    return jsonb_build_object('ok', false, 'erro', 'membro_inexistente');
  end if;
  select * into v_c from {schema}.contas where id = v_m.conta_id;
  if not ({schema}.sou_dono(v_c.id) or {schema}.eh_master()) then
    return jsonb_build_object('ok', false, 'erro', 'so_dono');
  end if;
  v_bloqueio := {schema}.equipe_motivo_bloqueio(v_c.id);
  if v_bloqueio = 'conta_legada' or v_bloqueio = 'conta_inexistente' then
    return jsonb_build_object('ok', false, 'erro', v_bloqueio);
  end if;
  if v_m.user_id is not distinct from v_c.dono_id or (v_m.user_id = v_uid and 'dono' = any(v_m.papeis)) then
    return jsonb_build_object('ok', false, 'erro', 'nao_remove_dono');
  end if;
  -- quem recebe os alunos (opcional) precisa ser membro ativo da conta com o papel, e a conta ter o módulo
  if p_novo_personal is not null and (p_novo_personal = v_m.user_id or not {schema}.conta_tem_modulo(v_c.id, 'treino') or not exists (
       select 1 from {schema}.conta_membros x where x.conta_id = v_c.id and x.user_id = p_novo_personal and x.status = 'ativo'
          and 'personal' = any(x.papeis))) then
    return jsonb_build_object('ok', false, 'erro', 'novo_responsavel_invalido', 'modulo', 'treino');
  end if;
  if p_novo_nutri is not null and (p_novo_nutri = v_m.user_id or not {schema}.conta_tem_modulo(v_c.id, 'nutricao') or not exists (
       select 1 from {schema}.conta_membros x where x.conta_id = v_c.id and x.user_id = p_novo_nutri and x.status = 'ativo'
          and 'nutricionista' = any(x.papeis))) then
    return jsonb_build_object('ok', false, 'erro', 'novo_responsavel_invalido', 'modulo', 'nutricao');
  end if;
  if v_m.user_id is not null then
    update {schema}.pacientes set personal_id = p_novo_personal where conta_id = v_c.id and personal_id = v_m.user_id;
    get diagnostics v_treino = row_count;
    update {schema}.pacientes set nutricionista_id = p_novo_nutri where conta_id = v_c.id and nutricionista_id = v_m.user_id;
    get diagnostics v_nutri = row_count;
    -- convites de aluno que ele mandou e ninguém aceitou: não levam mais ninguém para ele
    update {schema}.convites set status = 'revogado'
     where conta_id = v_c.id and tipo = 'aluno' and status = 'pendente' and responsavel_id = v_m.user_id;
    get diagnostics v_convites = row_count;
    insert into {schema}.avisos (destino_user_id, tipo, titulo, link)
    values (v_m.user_id, 'membro_removido', 'Você não faz mais parte da equipe de ' || v_c.nome, null);
  end if;
  update {schema}.conta_membros set status = 'removido', removido_em = now() where id = p_membro;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (v_c.id, 'membro', jsonb_build_object('membro_id', p_membro, 'papeis', to_jsonb(v_m.papeis), 'status', v_m.status),
          jsonb_build_object('acao', 'removeu', 'membro_id', p_membro, 'user_id', v_m.user_id, 'alunos_treino', v_treino,
                             'alunos_nutricao', v_nutri, 'novo_personal', p_novo_personal, 'novo_nutri', p_novo_nutri,
                             'convites_de_aluno_revogados', v_convites), v_uid);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'alunos_treino', v_treino, 'alunos_nutricao', v_nutri,
                            'novo_personal', p_novo_personal, 'novo_nutri', p_novo_nutri);
end;
$$;

-- o código do Convite (?prof=PROF-NOME-SOBRENOME) do próprio membro: cria se ainda não tem (ex.: dono vindo do Nutri)
create or replace function {schema}.garantir_meu_codigo(p_conta uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_m {schema}.conta_membros%rowtype;
  v_codigo text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select * into v_m from {schema}.conta_membros where conta_id = p_conta and user_id = v_uid and status = 'ativo' for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_membro');
  end if;
  v_codigo := v_m.codigo_convite;
  if v_codigo is null then
    v_codigo := {schema}.gerar_codigo_membro({schema}.nome_da_pessoa(v_uid));
    update {schema}.conta_membros set codigo_convite = v_codigo where id = v_m.id;
  end if;
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'papeis', to_jsonb(v_m.papeis));
end;
$$;

revoke execute on function {schema}.conta_membros_espelho(), {schema}.pacientes_espelho_responsaveis(),
  {schema}.equipe_motivo_bloqueio(uuid), {schema}.papeis_do_plano(uuid), {schema}.papeis_de_modulo(text[]),
  {schema}.nome_da_pessoa(uuid), {schema}.email_de_teste(text), {schema}.aceitar_convites_do_email(uuid, text),
  {schema}.equipe_da_conta(uuid), {schema}.convidar_membro(uuid, text, text[]), {schema}.cancelar_convite_membro(uuid),
  {schema}.alterar_papeis_membro(uuid, text[]), {schema}.remover_membro(uuid, uuid, uuid), {schema}.garantir_meu_codigo(uuid)
  from public, anon;
revoke execute on function {schema}.conta_membros_espelho(), {schema}.pacientes_espelho_responsaveis(),
  {schema}.nome_da_pessoa(uuid), {schema}.aceitar_convites_do_email(uuid, text) from authenticated;
grant execute on function {schema}.equipe_motivo_bloqueio(uuid), {schema}.papeis_do_plano(uuid), {schema}.papeis_de_modulo(text[]),
  {schema}.email_de_teste(text), {schema}.equipe_da_conta(uuid), {schema}.convidar_membro(uuid, text, text[]),
  {schema}.cancelar_convite_membro(uuid), {schema}.alterar_papeis_membro(uuid, text[]), {schema}.remover_membro(uuid, uuid, uuid),
  {schema}.garantir_meu_codigo(uuid)
  to authenticated, service_role;
grant execute on function {schema}.nome_da_pessoa(uuid), {schema}.aceitar_convites_do_email(uuid, text) to service_role;

-- ============================================================================================================
-- 6. minha_situacao() (W3/W4) + a foto do Perfil antes da do Google (menu do usuário e card da conta). O resto é o da W4.
-- ============================================================================================================
create or replace function {schema}.minha_situacao() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_app jsonb;
  v_meta jsonb;
  v_perfil record;
  v_master boolean;
  v_calc boolean;
  v_contas jsonb;
  v_matriculas jsonb;
  v_modulos text[];
  v_precisa_treino boolean;
  v_nutri boolean;
  v_legado_nutri jsonb;
  v_aviso_cfg jsonb;
  v_publico text;
  v_aviso jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  select u.email, coalesce(u.raw_app_meta_data, '{}'::jsonb), coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_app, v_meta from auth.users u where u.id = v_uid;
  select p.nome, p.role, p.teste_ate, p.pago_ate, p.isento_assinatura, coalesce(p.config, '{}'::jsonb) as config,
         nullif(btrim(p.dados_profissionais ->> 'foto_url'), '') as foto  -- W5: a foto do Perfil
    into v_perfil from {schema}.profiles p where p.id = v_uid;
  v_master := coalesce(v_app ->> 'role', '') = 'master' or coalesce(v_perfil.role, '') = 'master';
  -- veio do Calc: marcado pelo script 01 (app_metadata.calc / origem = 'calc')
  v_calc := coalesce(v_app ->> 'calc', '') = 'true' or coalesce(v_app ->> 'origem', '') = 'calc';

  -- contas em que é membro ativo (as com Treino primeiro: o painel de hoje é o do Calc), com papéis e números do menu
  select coalesce(jsonb_agg(x.j order by x.tem_treino desc, x.dono desc, x.nome), '[]'::jsonb) into v_contas from (
    select c.nome, ('treino' = any({schema}.modulos_do_plano(c.plano))) as tem_treino, ('dono' = any(m.papeis)) as dono,
      jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano,
        'modulos', to_jsonb({schema}.modulos_do_plano(c.plano)), 'faixa', c.faixa, 'periodicidade', c.periodicidade,
        'situacao', c.situacao, 'teste_ate', c.teste_ate, 'vence_em', c.vence_em, 'tolerancia_dias', c.tolerancia_dias,
        'cobranca_legada', c.cobranca_legada, 'isenta_motivo', c.isenta_motivo,
        'alunos_bloqueados_em', c.alunos_bloqueados_em, 'alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'dono_id', c.dono_id,
        'dono_nome', (select coalesce(nullif(btrim(pd.nome), ''), pd.email) from {schema}.profiles pd where pd.id = c.dono_id),
        'membro_id', m.id, 'papeis', to_jsonb(m.papeis), 'codigo_convite', m.codigo_convite,
        'profissionais', (select count(*) from {schema}.conta_membros x where x.conta_id = c.id and x.status = 'ativo'),
        'alunos_ativos', {schema}.conta_alunos_ativos(c.id),
        'limite_alunos', {schema}.conta_limite_alunos(c.id),
        -- W4
        'assinatura', (select jsonb_build_object('status', a.status, 'proximo_vencimento', a.proximo_vencimento, 'valor', a.valor)
                         from {schema}.conta_assinaturas a where a.conta_id = c.id),
        'valor_mensal', {schema}.conta_preco(c.id, c.plano, c.faixa, 1)) as j
      from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = v_uid and m.status = 'ativo') x;

  -- matrículas (aluno): os módulos são os responsáveis que ele tem numa conta com aquele módulo (spec 4.1); no site
  -- antigo (sem conta) a nutricionista responsável vale como Nutrição
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) into v_matriculas
  from (
    select p.created_at as criado,
      jsonb_build_object(
        'id', p.id, 'conta_id', p.conta_id, 'conta_nome', c.nome, 'conta_origem', c.origem, 'ativo', p.ativo,
        'origem', p.origem, 'modulos', to_jsonb(array_remove(array[
            case when p.personal_id is not null and p.conta_id is not null and 'treino' = any({schema}.modulos_do_plano(c.plano)) then 'treino' end,
            case when p.nutricionista_id is not null and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))) then 'nutricao' end
          ], null)),
        'bloqueada', p.acesso_bloqueado_em is not null, 'bloqueio_msg', p.acesso_bloqueado_msg,
        'bloqueado_por_pagamento', p.bloqueado_por_pagamento,
        'conta_alunos_bloqueados_em', c.alunos_bloqueados_em, 'conta_alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'personal', case when p.personal_id is null then null else jsonb_build_object('id', p.personal_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id)) end,
        'nutricionista', case when p.nutricionista_id is null then null else jsonb_build_object('id', p.nutricionista_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id)) end
      ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = v_uid and p.deleted_at is null
  ) x;
  -- módulos do aluno = a união dos módulos das matrículas
  select coalesce(array_agg(distinct m.valor), array[]::text[]) into v_modulos
    from jsonb_array_elements(v_matriculas) e, jsonb_array_elements_text(e -> 'modulos') as m(valor);

  -- quem veio do Calc e ainda não tem matrícula (o "aluno sem professor" de hoje) continua com o treino dele
  if coalesce(jsonb_array_length(v_matriculas), 0) = 0 and v_calc and not ('treino' = any(v_modulos)) then
    v_modulos := v_modulos || array['treino'];
  end if;

  -- precisa da sessão do Banco do Treino (spec 7.4, passo 3): master, personal ou dono de conta com Treino, aluno com Treino
  -- ou quem veio do Calc (tem treino guardado lá)
  v_precisa_treino := v_master or v_calc or 'treino' = any(v_modulos) or exists (
    select 1 from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = v_uid and m.status = 'ativo' and 'treino' = any({schema}.modulos_do_plano(c.plano))
       and (m.papeis && array['dono', 'personal']));

  -- legado do Nutri: a trava de assinatura de hoje (assinaturaUtil.ts do site antigo) para quem é nutricionista/master lá
  v_nutri := coalesce(v_perfil.role, '') in ('nutricionista', 'master') or exists (
    select 1 from jsonb_array_elements(v_contas) e where e ->> 'origem' = 'legado_nutri');
  if v_nutri then
    select jsonb_build_object(
        'role', v_perfil.role, 'teste_ate', v_perfil.teste_ate, 'pago_ate', v_perfil.pago_ate,
        'isento_assinatura', coalesce(v_perfil.isento_assinatura, false),
        'assinatura', (select jsonb_build_object('status', a.status, 'valor', a.valor, 'proximo_vencimento', a.proximo_vencimento)
                         from {schema}.assinaturas a where a.nutricionista_id = v_uid order by a.updated_at desc nulls last limit 1))
      into v_legado_nutri;
  end if;

  -- aviso "o Physiq mudou" (NF14): texto do público de quem entra (Calc primeiro) — liga/desliga em app_config
  select a.valor into v_aviso_cfg from {schema}.app_config a where a.chave = 'aviso_mudanca';
  v_publico := case when v_calc then 'calc'
                    when coalesce(v_perfil.role, '') in ('nutricionista', 'paciente', 'master')
                      or exists (select 1 from jsonb_array_elements(v_matriculas) e where e ->> 'conta_origem' = 'legado_nutri' or e ->> 'origem' = 'nutri')
                      or v_nutri then 'nutri'
                    else null end;
  if v_aviso_cfg is not null and v_publico is not null then
    v_aviso := jsonb_build_object(
      'publico', v_publico,
      'ativo', coalesce((v_aviso_cfg ->> 'ativo')::boolean, false) and coalesce((v_aviso_cfg -> v_publico ->> 'ativo')::boolean, false),
      'titulo', v_aviso_cfg -> v_publico ->> 'titulo',
      'texto', v_aviso_cfg -> v_publico ->> 'texto',
      'versao', coalesce(v_aviso_cfg ->> 'versao', '1'),
      'visto', (v_perfil.config -> 'aviso_mudanca_visto' ->> coalesce(v_aviso_cfg ->> 'versao', '1')) is not null);
  end if;

  return jsonb_build_object(
    'versao', 1,
    'user_id', v_uid,
    'email', v_email,
    'nome', coalesce(nullif(btrim(v_perfil.nome), ''), v_meta ->> 'full_name', v_meta ->> 'name', split_part(coalesce(v_email, ''), '@', 1)),
    'foto_url', coalesce(v_perfil.foto, v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    'master', v_master,
    'papel_legado', v_perfil.role,
    'calc', v_calc,
    'contas', v_contas,
    'matriculas', v_matriculas,
    'modulos_aluno', to_jsonb(coalesce(v_modulos, array[]::text[])),
    'precisa_treino', v_precisa_treino,
    'sem_nada', not v_master and jsonb_array_length(v_contas) = 0 and jsonb_array_length(v_matriculas) = 0 and not v_calc,
    'legado_nutri', v_legado_nutri,
    'aviso_mudanca', v_aviso,
    'gerado_em', now());
end;
$$;
revoke execute on function {schema}.minha_situacao() from public, anon;
grant execute on function {schema}.minha_situacao() to authenticated, service_role;


-- @@ compartilhado
-- (roda 1x, depois dos 2 schemas) ------------------------------------------------------------------------------

-- Storage: foto do Perfil do profissional (Configurações › Perfil). Público (a foto aparece no menu, na equipe e para os
-- alunos), até 5 MB, JPG/PNG/WebP; cada pessoa só grava na própria pasta (<uid>/foto-<data>.<ext>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-perfil', 'fotos-perfil', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-perfil-staging', 'fotos-perfil-staging', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "fotos-perfil: gravar na propria pasta" on storage.objects;
create policy "fotos-perfil: gravar na propria pasta" on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos-perfil', 'fotos-perfil-staging') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fotos-perfil: trocar na propria pasta" on storage.objects;
create policy "fotos-perfil: trocar na propria pasta" on storage.objects for update to authenticated
  using (bucket_id in ('fotos-perfil', 'fotos-perfil-staging') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('fotos-perfil', 'fotos-perfil-staging') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fotos-perfil: apagar na propria pasta" on storage.objects;
create policy "fotos-perfil: apagar na propria pasta" on storage.objects for delete to authenticated
  using (bucket_id in ('fotos-perfil', 'fotos-perfil-staging') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fotos-perfil: ler a propria pasta" on storage.objects;
create policy "fotos-perfil: ler a propria pasta" on storage.objects for select to authenticated
  using (bucket_id in ('fotos-perfil', 'fotos-perfil-staging') and (storage.foldername(name))[1] = (select auth.uid())::text);
