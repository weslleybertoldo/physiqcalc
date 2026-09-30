-- Physiq W13 — Painel: Alunos (+ falha F5: "Bloquear" com efeito). Banco principal, public + staging. Idempotente.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930140000_w13_alunos.sql [--so staging|public]
--
-- O que entra (spec §4.4 Alunos, §6.4, §9, C7 C27 C28 C31 C87 C96 C102 N-10 N-57 N-66, R10, P1, P7, P9, P14):
--   1. alunos_da_conta — a lista do painel (20 + "Ver mais", busca, filtros de situação, módulo, responsável, tag e pagamento,
--      selos) com a regra P1 (dono vê todos os alunos da conta; o membro só aqueles em que é responsável) e as contagens que a
--      tela mostra (o número do menu = o total da lista no filtro padrão "Ativos" — ativo, fora da lixeira e SEM bloqueio,
--      o mesmo conjunto que ocupa vaga do plano: conta_alunos_ativos);
--   2. as ações (regra nova: dono da conta, responsável pelo aluno ou master — a W14 liga desativar/remover no card):
--      criar, convidar por e-mail (o aceite é no 1º login com aquele e-mail: aceitar_convites_do_email, W3/W5), cancelar e
--      reenviar convite, bloquear/desbloquear (F5: acesso_bloqueado_em → o gatilho da W5 leva ao espelho do Treino
--      status='bloqueado' e a trava do app fecha), desativar/reativar, remover (lixeira), atribuir em lote (sem responsável),
--      aprovar/recusar o auto-cadastro do link /c/;
--   3. o LIMITE DA FAIXA no servidor (C96, spec 6.4): criar, convidar, aprovar pendente, reativar e desbloquear recusam
--      com { erro: 'limite_plano', limite, em_uso } — a mesma conta_pode_adicionar_aluno da W2 (legado Nutri sem limite;
--      legado Calc = o plano dele: Start 10 · Studio 30 · Pro 100 · Ilimitado sem limite, P9);
--   4. /c/:codigo público (N-57): o código é o do profissional (codigo_convite PROF-… do membro ou o codigo_cadastro do
--      site antigo do Nutri); a gravação só pela função alunos (captcha Turnstile conferido lá) — nenhuma escrita anônima.
-- Nada é apagado nem copiado: só funções novas e grants. Dados de cliente: intocados.

-- ============================================================================================================
-- 0. Auxiliares
-- ============================================================================================================

-- módulos do aluno = os responsáveis que ele tem numa conta com aquele módulo (spec 4.1; igual à minha_situacao)
create or replace function {schema}.w13_modulos_do_aluno(p_personal uuid, p_nutri uuid, p_plano text) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when p_personal is not null and 'treino' = any({schema}.modulos_do_plano(p_plano)) then 'treino' end,
    case when p_nutri is not null and 'nutricao' = any({schema}.modulos_do_plano(p_plano)) then 'nutricao' end
  ], null);
$$;

-- quem pode mexer no aluno (W13): master, o dono da conta ou o responsável pelo módulo (com o papel na conta)
create or replace function {schema}.w13_pode_gerir(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.pacientes p
     where p.id = p_paciente and p.conta_id is not null and (
           {schema}.sou_dono(p.conta_id)
        or (p.personal_id = auth.uid() and {schema}.tenho_papel(p.conta_id, 'personal'))
        or (p.nutricionista_id = auth.uid() and {schema}.tenho_papel(p.conta_id, 'nutricionista'))));
$$;

-- conta nova vencida/suspensa/cancelada trava convites e cadastros (spec 6.2 e 9). Legados seguem a trava de hoje, que mora
-- na tela (GatePlanoLegado: o ciclo do Calc fica no Banco do Treino até a W28).
create or replace function {schema}.w13_conta_travada(p_conta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.origem = 'nova' and not c.cobranca_legada
       and {schema}.situacao_da_conta_em(c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias, {schema}.cobranca_hoje())
           in ('vencida', 'suspensa', 'cancelada')
      from {schema}.contas c where c.id = p_conta), false);
$$;

-- recusa do limite da faixa com os números da tela ("Seu plano permite N alunos ativos" — spec 6.4 e 9)
create or replace function {schema}.w13_erro_limite(p_conta uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', false, 'erro', 'limite_plano',
    'limite', {schema}.conta_limite_alunos(p_conta), 'em_uso', {schema}.conta_alunos_ativos(p_conta),
    'sou_dono', {schema}.sou_dono(p_conta) or {schema}.eh_master(),
    'dono_nome', (select {schema}.nome_da_pessoa(c.dono_id) from {schema}.contas c where c.id = p_conta));
$$;

-- foto do aluno na lista: a da matrícula (URL) ou a do login (Google)
create or replace function {schema}.w13_foto_do_aluno(p_foto text, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when p_foto ~* '^https?://' then p_foto end,
    (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''), nullif(btrim(u.raw_user_meta_data ->> 'picture'), ''))
       from auth.users u where u.id = p_user));
$$;

-- ============================================================================================================
-- 1. Lista do painel (Alunos) — C27, N-10, P1
-- ============================================================================================================
create or replace function {schema}.alunos_da_conta(p_conta uuid, p_filtros jsonb default '{}'::jsonb,
  p_offset integer default 0, p_limite integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_membro boolean;
  v_dono boolean;
  v_sou_personal boolean;
  v_sou_nutri boolean;
  v_c {schema}.contas%rowtype;
  v_mods text[];
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_q text := lower(btrim(regexp_replace(coalesce(v_f ->> 'q', ''), '\s+', ' ', 'g')));
  v_q_dig text := regexp_replace(coalesce(v_f ->> 'q', ''), '\D', '', 'g');
  v_sit text := coalesce(nullif(v_f ->> 'situacao', ''), 'ativos');
  v_modulo text := nullif(v_f ->> 'modulo', '');
  v_resp text := nullif(v_f ->> 'responsavel', '');
  v_resp_id uuid;
  v_tag text := nullif(btrim(coalesce(v_f ->> 'tag', '')), '');
  v_pag text := nullif(v_f ->> 'pagamento', '');
  v_ordem text := coalesce(nullif(v_f ->> 'ordem', ''), 'nome');
  v_lim integer := least(greatest(coalesce(p_limite, 20), 0), 500);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_itens jsonb;
  v_contagens jsonb;
  v_responsaveis jsonb;
  v_tags jsonb;
  v_pendentes integer;
  v_convites integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  v_membro := {schema}.sou_membro(p_conta);
  if not (v_membro or v_master) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  v_dono := {schema}.sou_dono(p_conta) or v_master;
  v_sou_personal := {schema}.tenho_papel(p_conta, 'personal');
  v_sou_nutri := {schema}.tenho_papel(p_conta, 'nutricionista');
  v_mods := {schema}.modulos_do_plano(v_c.plano);
  if v_sit not in ('ativos', 'bloqueados', 'desativados', 'excluidas', 'todos') then v_sit := 'ativos'; end if;
  if v_ordem not in ('nome', 'recentes', 'modificados') then v_ordem := 'nome'; end if;
  if v_resp is not null and v_resp <> 'sem' then
    begin
      v_resp_id := v_resp::uuid;
    exception when others then
      v_resp := null;
    end;
  end if;
  -- busca literal (sem curinga do LIKE vindo da tela)
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  with base as (
    -- visíveis para quem pede (P1), fora da lixeira
    select p.id, p.treino_user_id, p.user_id, p.nome, p.email, p.telefone,
           {schema}.w13_foto_do_aluno(p.foto_url, p.user_id) as foto, coalesce(p.tags, '{}') as tags,
           p.ativo, p.acesso_bloqueado_em as bloqueado_em, p.acesso_bloqueado_msg as bloqueio_msg,
           coalesce(p.config, '{}'::jsonb) ? 'conta_excluida_em' as excluida, p.origem,
           p.created_at as criado_em, p.updated_at as atualizado_em, p.personal_id, p.nutricionista_id,
           {schema}.w13_modulos_do_aluno(p.personal_id, p.nutricionista_id, v_c.plano) as modulos,
           -- selo do pagamento (W6: só o dono vê a mensalidade — P6)
           case when v_dono and coalesce(p.mensalidade_valor, 0) > 0 and not coalesce(p.cobranca_pausada, false) then
                  case when p.mensalidade_pago_ate is not null and p.mensalidade_pago_ate > now() then 'pago' else 'pendente' end end as pag_s,
           case when v_dono and coalesce(p.mensalidade_valor, 0) > 0 and not coalesce(p.cobranca_pausada, false) then
                  coalesce(p.mensalidade_pago_ate, p.mensalidade_desde) end as pag_ate,
           exists (select 1 from {schema}.cobrancas cb where cb.paciente_id = p.id and cb.status = 'aguardando_confirmacao'
                     and (v_dono or cb.criado_por = v_uid or cb.nutricionista_id = v_uid)) as comprovante,
           coalesce(p.busca, '') as busca
      from {schema}.pacientes p
     where p.conta_id = p_conta and p.deleted_at is null
       and (v_dono or (p.personal_id = v_uid and v_sou_personal) or (p.nutricionista_id = v_uid and v_sou_nutri))
  ), filtrada as (
    -- os filtros da tela, menos a situação (as contagens dos chips usam este conjunto)
    select b.* from base b
     where (v_q = '' or b.busca like '%' || v_q || '%' or (length(v_q_dig) >= 3 and b.busca like '%' || v_q_dig || '%'))
       and (v_modulo is null or v_modulo = any(b.modulos))
       and (v_resp is null or (v_resp = 'sem' and b.personal_id is null and b.nutricionista_id is null)
            or (v_resp_id is not null and (b.personal_id = v_resp_id or b.nutricionista_id = v_resp_id)))
       and (v_tag is null or v_tag = any(b.tags))
       and (v_pag is null or (v_pag = 'comprovante' and b.comprovante) or b.pag_s = v_pag)
  ), sel as (
    select f.* from filtrada f
     where case v_sit
             when 'ativos' then f.ativo and f.bloqueado_em is null
             when 'bloqueados' then f.ativo and f.bloqueado_em is not null
             when 'desativados' then not f.ativo and not f.excluida
             when 'excluidas' then f.excluida
             else true end
  )
  select
    (select jsonb_build_object(
        'ativos', count(*) filter (where f.ativo and f.bloqueado_em is null),
        'bloqueados', count(*) filter (where f.ativo and f.bloqueado_em is not null),
        'desativados', count(*) filter (where not f.ativo and not f.excluida),
        'excluidas', count(*) filter (where f.excluida),
        'todos', count(*)) from filtrada f),
    (select count(*) from sel),
    case when v_lim = 0 then '[]'::jsonb else (
      select coalesce(jsonb_agg(x.j order by x.o1, x.o2, x.o3), '[]'::jsonb) from (
        select
          case v_ordem when 'recentes' then -extract(epoch from s.criado_em) when 'modificados' then -extract(epoch from s.atualizado_em) else 0 end as o1,
          lower(s.nome) as o2, s.id as o3,
          jsonb_build_object(
            'id', s.id,
            'rota_id', coalesce(s.treino_user_id, s.id),
            'treino_user_id', s.treino_user_id,
            'tem_login', s.user_id is not null,
            'nome', s.nome, 'email', s.email, 'telefone', s.telefone, 'foto_url', s.foto, 'tags', to_jsonb(s.tags),
            'ativo', s.ativo, 'bloqueado', s.bloqueado_em is not null, 'bloqueado_em', s.bloqueado_em, 'bloqueio_msg', s.bloqueio_msg,
            'conta_excluida', s.excluida, 'origem', s.origem, 'criado_em', s.criado_em, 'atualizado_em', s.atualizado_em,
            'modulos', to_jsonb(s.modulos),
            'personal', case when s.personal_id is null then null else jsonb_build_object('id', s.personal_id, 'nome', {schema}.nome_da_pessoa(s.personal_id)) end,
            'nutricionista', case when s.nutricionista_id is null then null else jsonb_build_object('id', s.nutricionista_id, 'nome', {schema}.nome_da_pessoa(s.nutricionista_id)) end,
            'pagamento', case when s.pag_s is null then null else jsonb_build_object('s', s.pag_s, 'ate', s.pag_ate) end,
            'comprovante', s.comprovante,
            'sou_eu', s.user_id is not distinct from v_uid
          ) as j
          from sel s
         order by 1, 2, 3
         limit v_lim offset v_off) x) end,
    (select coalesce(jsonb_agg(t.tag order by lower(t.tag)), '[]'::jsonb)
       from (select distinct unnest(b.tags) as tag from base b) t where btrim(t.tag) <> '')
  into v_contagens, v_total, v_itens, v_tags;

  -- quem pode ser responsável (filtro e "Atribuir a…"): membros ativos com papel de módulo que a conta tem
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'nome', r.nome, 'papeis', to_jsonb(r.papeis), 'eu', r.user_id = v_uid)
            order by (r.user_id = v_uid) desc, lower(r.nome)), '[]'::jsonb)
    into v_responsaveis
    from (select m.user_id, {schema}.nome_da_pessoa(m.user_id) as nome,
                 array(select x from unnest(m.papeis) x where (x = 'personal' and 'treino' = any(v_mods))
                                                        or (x = 'nutricionista' and 'nutricao' = any(v_mods))) as papeis
            from {schema}.conta_membros m
           where m.conta_id = p_conta and m.status = 'ativo' and m.user_id is not null) r
   where coalesce(array_length(r.papeis, 1), 0) > 0;

  select count(*) into v_pendentes from {schema}.cadastros_pendentes cp
   where cp.status = 'pendente'
     and (cp.conta_id = p_conta or (cp.conta_id is null and exists (
            select 1 from {schema}.conta_membros m where m.conta_id = p_conta and m.status = 'ativo' and m.user_id = cp.nutricionista_id)))
     and (v_dono or cp.nutricionista_id = v_uid);
  select count(*) into v_convites from {schema}.convites cv
   where cv.conta_id = p_conta and cv.tipo = 'aluno' and cv.status = 'pendente'
     and (v_dono or cv.criado_por = v_uid or cv.responsavel_id = v_uid);

  return jsonb_build_object(
    'ok', true, 'total', v_total, 'offset', v_off, 'limite', v_lim, 'situacao', v_sit,
    'itens', v_itens, 'contagens', v_contagens,
    'vagas', jsonb_build_object('em_uso', {schema}.conta_alunos_ativos(p_conta), 'limite', {schema}.conta_limite_alunos(p_conta),
                                'origem', v_c.origem, 'faixa', v_c.faixa),
    'conta', jsonb_build_object('id', v_c.id, 'nome', v_c.nome, 'modulos', to_jsonb(v_mods), 'origem', v_c.origem,
                                'travada', {schema}.w13_conta_travada(p_conta), 'dono_nome', {schema}.nome_da_pessoa(v_c.dono_id)),
    'eu', jsonb_build_object('id', v_uid, 'dono', v_dono, 'personal', v_sou_personal, 'nutricionista', v_sou_nutri),
    'responsaveis', v_responsaveis, 'tags', v_tags, 'pendentes', v_pendentes, 'convites_pendentes', v_convites);
end;
$$;

-- ============================================================================================================
-- 2. Cadastrar aluno (Novo aluno › Cadastrar) — sem login; o acesso com e-mail e senha é o card "Acesso do aluno" (W8b)
-- ============================================================================================================
create or replace function {schema}.aluno_criar(p_conta uuid, p_dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_c {schema}.contas%rowtype;
  v_mods text[];
  v_dono boolean;
  v_nome text := left(regexp_replace(btrim(coalesce(v_d ->> 'nome', '')), '\s+', ' ', 'g'), 120);
  v_email text := nullif(lower(btrim(coalesce(v_d ->> 'email', ''))), '');
  v_tel text := nullif(regexp_replace(coalesce(v_d ->> 'telefone', ''), '\D', '', 'g'), '');
  v_genero text := nullif(lower(btrim(coalesce(v_d ->> 'genero', ''))), '');
  v_nasc date;
  v_tags text[];
  v_modulos text[];
  v_personal uuid;
  v_nutri uuid;
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta for update;  -- serializa o limite da faixa
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if not ({schema}.sou_membro(p_conta) or {schema}.eh_master()) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  v_dono := {schema}.sou_dono(p_conta) or {schema}.eh_master();
  v_mods := {schema}.modulos_do_plano(v_c.plano);
  if length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 160) then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if v_tel is not null and length(v_tel) not in (10, 11) then return jsonb_build_object('ok', false, 'erro', 'telefone_invalido'); end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then v_genero := null; end if;
  if nullif(btrim(coalesce(v_d ->> 'nascimento', '')), '') is not null then
    begin
      v_nasc := (v_d ->> 'nascimento')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    end;
    if v_nasc > current_date or v_nasc < date '1900-01-01' then return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido'); end if;
  end if;
  select coalesce(array_agg(distinct left(regexp_replace(btrim(t), '\s+', ' ', 'g'), 40)) filter (where btrim(t) <> ''), '{}')
    into v_tags from jsonb_array_elements_text(coalesce(v_d -> 'tags', '[]'::jsonb)) t;
  select coalesce(array_agg(distinct m) filter (where m in ('treino', 'nutricao') and m = any(v_mods)), '{}')
    into v_modulos from jsonb_array_elements_text(coalesce(v_d -> 'modulos', '[]'::jsonb)) m;

  -- responsáveis: o dono escolhe (membro ativo com o papel); o membro só se põe como responsável do próprio módulo
  if 'treino' = any(v_modulos) then
    begin
      v_personal := nullif(v_d ->> 'personal_id', '')::uuid;
    exception when others then
      v_personal := null;
    end;
    if not v_dono or v_personal is null then v_personal := case when {schema}.tenho_papel(p_conta, 'personal') then v_uid end; end if;
    if v_personal is null or not exists (select 1 from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id = v_personal
                                            and m.status = 'ativo' and 'personal' = any(m.papeis)) then
      return jsonb_build_object('ok', false, 'erro', 'responsavel_invalido', 'modulo', 'treino');
    end if;
  end if;
  if 'nutricao' = any(v_modulos) then
    begin
      v_nutri := nullif(v_d ->> 'nutricionista_id', '')::uuid;
    exception when others then
      v_nutri := null;
    end;
    if not v_dono or v_nutri is null then v_nutri := case when {schema}.tenho_papel(p_conta, 'nutricionista') then v_uid end; end if;
    if v_nutri is null or not exists (select 1 from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id = v_nutri
                                         and m.status = 'ativo' and 'nutricionista' = any(m.papeis)) then
      return jsonb_build_object('ok', false, 'erro', 'responsavel_invalido', 'modulo', 'nutricao');
    end if;
  end if;
  if not v_dono and v_personal is null and v_nutri is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_modulo');
  end if;
  if {schema}.w13_conta_travada(p_conta) then return jsonb_build_object('ok', false, 'erro', 'conta_travada'); end if;
  if v_email is not null and exists (select 1 from {schema}.pacientes p where p.conta_id = p_conta and p.deleted_at is null
                                        and lower(p.email) = v_email) then
    return jsonb_build_object('ok', false, 'erro', 'ja_cadastrado');
  end if;
  if not {schema}.conta_pode_adicionar_aluno(p_conta) then return {schema}.w13_erro_limite(p_conta); end if;

  insert into {schema}.pacientes (nutricionista_id, personal_id, conta_id, nome, email, telefone, nascimento, genero, tags, origem, ativo)
  values (v_nutri, v_personal, p_conta, v_nome, v_email, v_tel, v_nasc, v_genero, v_tags, 'novo', true)
  returning id into v_id;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (p_conta, 'outro', jsonb_build_object('w13', 'aluno_criado', 'paciente_id', v_id, 'modulos', to_jsonb(v_modulos)), v_uid);
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'rota_id', v_id, 'modulos', to_jsonb(v_modulos));
end;
$$;

-- ============================================================================================================
-- 3. Convite de aluno por e-mail (C7, C28, C87) — o e-mail sai pela função alunos (Resend, o remetente dos convites de hoje)
-- ============================================================================================================
create or replace function {schema}.aluno_convidar(p_conta uuid, p_email text, p_modulos text[], p_responsavel uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_c {schema}.contas%rowtype;
  v_mods text[];
  v_dono boolean;
  v_modulos text[];
  v_resp uuid := p_responsavel;
  v_convite uuid;
  v_reenvio boolean := false;
  v_meu_email text;
  v_recentes integer;
  v_abertos integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if not ({schema}.sou_membro(p_conta) or {schema}.eh_master()) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  v_dono := {schema}.sou_dono(p_conta) or {schema}.eh_master();
  v_mods := {schema}.modulos_do_plano(v_c.plano);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 160 then return jsonb_build_object('ok', false, 'erro', 'email_invalido'); end if;
  -- staging: só endereço de teste (nenhum e-mail sai do staging para pessoa real — P26)
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  select lower(u.email) into v_meu_email from auth.users u where u.id = v_uid;
  if v_email = v_meu_email then return jsonb_build_object('ok', false, 'erro', 'proprio_email'); end if;
  select coalesce(array_agg(distinct m) filter (where m = any(v_mods)), '{}') into v_modulos from unnest(coalesce(p_modulos, '{}')) m;
  if coalesce(array_length(v_modulos, 1), 0) = 0 then
    -- sem escolha: os módulos que eu atendo na conta
    v_modulos := array_remove(array[
      case when 'treino' = any(v_mods) and {schema}.tenho_papel(p_conta, 'personal') then 'treino' end,
      case when 'nutricao' = any(v_mods) and {schema}.tenho_papel(p_conta, 'nutricionista') then 'nutricao' end], null);
  end if;
  if coalesce(array_length(v_modulos, 1), 0) = 0 then return jsonb_build_object('ok', false, 'erro', 'sem_modulo'); end if;
  if not v_dono or v_resp is null then v_resp := v_uid; end if;
  -- o responsável precisa atender todos os módulos do convite (o aceite põe o mesmo responsável nos 2 — W3/W5)
  if exists (select 1 from unnest(v_modulos) m where not exists (
      select 1 from {schema}.conta_membros x where x.conta_id = p_conta and x.user_id = v_resp and x.status = 'ativo'
         and ((m = 'treino' and 'personal' = any(x.papeis)) or (m = 'nutricao' and 'nutricionista' = any(x.papeis))))) then
    return jsonb_build_object('ok', false, 'erro', 'responsavel_invalido');
  end if;
  if {schema}.w13_conta_travada(p_conta) then return jsonb_build_object('ok', false, 'erro', 'conta_travada'); end if;
  -- quem já é aluno ativo desta conta com este e-mail
  if exists (select 1 from {schema}.pacientes p left join auth.users u on u.id = p.user_id
              where p.conta_id = p_conta and p.deleted_at is null and p.ativo and (lower(p.email) = v_email or lower(u.email) = v_email)) then
    return jsonb_build_object('ok', false, 'erro', 'ja_e_aluno');
  end if;
  -- P7: aluno ativo em OUTRA conta (a conta do app não conta — W7b)
  if exists (select 1 from auth.users u join {schema}.pacientes p on p.user_id = u.id
              where lower(u.email) = v_email and p.deleted_at is null and p.ativo
                and p.conta_id is distinct from p_conta and p.conta_id is distinct from {schema}.conta_do_app()) then
    return jsonb_build_object('ok', false, 'erro', 'outro_profissional');
  end if;
  if not {schema}.conta_pode_adicionar_aluno(p_conta) then return {schema}.w13_erro_limite(p_conta); end if;
  -- freio: 20 envios por hora e 50 convites abertos por conta
  select count(*) filter (where cv.enviado_em > now() - interval '1 hour'), count(*) filter (where cv.status = 'pendente')
    into v_recentes, v_abertos
    from {schema}.convites cv where cv.conta_id = p_conta and cv.tipo = 'aluno';
  if v_recentes >= 20 or v_abertos >= 50 then return jsonb_build_object('ok', false, 'erro', 'muitos_convites'); end if;

  select cv.id into v_convite from {schema}.convites cv
   where cv.conta_id = p_conta and cv.tipo = 'aluno' and cv.status = 'pendente' and lower(cv.email) = v_email
   order by cv.enviado_em desc limit 1;
  if v_convite is not null then
    update {schema}.convites set enviado_em = now(), modulos = v_modulos, responsavel_id = v_resp where id = v_convite;
    v_reenvio := true;
  else
    insert into {schema}.convites (conta_id, tipo, email, papeis, modulos, responsavel_id, status, criado_por)
    values (p_conta, 'aluno', v_email, '{}', v_modulos, v_resp, 'pendente', v_uid)
    returning id into v_convite;
  end if;
  return jsonb_build_object('ok', true, 'convite_id', v_convite, 'reenvio', v_reenvio, 'email', v_email,
    'modulos', to_jsonb(v_modulos), 'conta_nome', v_c.nome, 'quem_convidou', {schema}.nome_da_pessoa(v_uid),
    'responsavel_nome', {schema}.nome_da_pessoa(v_resp));
end;
$$;

-- convites de aluno da conta (pendentes e os últimos aceitos) — dono vê todos; o membro, os que mandou ou em que é responsável
create or replace function {schema}.aluno_convites(p_conta uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', cv.id, 'email', cv.email, 'status', cv.status, 'modulos', to_jsonb(cv.modulos),
            'enviado_em', cv.enviado_em, 'aceito_em', cv.aceito_em,
            'responsavel', case when cv.responsavel_id is null then null else jsonb_build_object('id', cv.responsavel_id, 'nome', {schema}.nome_da_pessoa(cv.responsavel_id)) end)
          order by (cv.status = 'pendente') desc, cv.enviado_em desc), '[]'::jsonb)
    from (select * from {schema}.convites c
           where c.conta_id = p_conta and c.tipo = 'aluno' and c.status in ('pendente', 'aceito')
             and ({schema}.sou_dono(p_conta) or {schema}.eh_master() or c.criado_por = auth.uid() or c.responsavel_id = auth.uid())
           order by c.enviado_em desc limit 100) cv;
$$;

-- cancelar (revogar) ou reenviar um convite de aluno pendente
create or replace function {schema}.aluno_convite_acao(p_convite uuid, p_acao text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cv {schema}.convites%rowtype;
  v_c {schema}.contas%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_cv from {schema}.convites where id = p_convite and tipo = 'aluno' for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'convite_inexistente'); end if;
  if not ({schema}.sou_dono(v_cv.conta_id) or {schema}.eh_master() or (({schema}.sou_membro(v_cv.conta_id))
          and (v_cv.criado_por = v_uid or v_cv.responsavel_id = v_uid))) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if v_cv.status <> 'pendente' then return jsonb_build_object('ok', false, 'erro', 'convite_nao_pendente'); end if;
  select * into v_c from {schema}.contas where id = v_cv.conta_id;
  if p_acao = 'cancelar' then
    update {schema}.convites set status = 'revogado' where id = p_convite;
    return jsonb_build_object('ok', true, 'convite_id', p_convite, 'status', 'revogado');
  elsif p_acao = 'reenviar' then
    if v_cv.enviado_em > now() - interval '2 minutes' then return jsonb_build_object('ok', false, 'erro', 'muitos_convites'); end if;
    update {schema}.convites set enviado_em = now() where id = p_convite;
    return jsonb_build_object('ok', true, 'convite_id', p_convite, 'reenvio', true, 'email', v_cv.email, 'modulos', to_jsonb(v_cv.modulos),
      'conta_nome', v_c.nome, 'quem_convidou', {schema}.nome_da_pessoa(v_uid), 'responsavel_nome', {schema}.nome_da_pessoa(v_cv.responsavel_id));
  end if;
  return jsonb_build_object('ok', false, 'erro', 'acao_invalida');
end;
$$;

-- ============================================================================================================
-- 4. Bloquear acesso (F5, C31, C102, R10): grava acesso_bloqueado_em → o gatilho da W5 enfileira o espelho → no Treino
--    physiq_profiles.status = 'bloqueado' (a trava do app lê pelo PowerSync, vale sem internet) e a vaga fica livre.
--    Desbloquear devolve o acesso — e volta a ocupar vaga (recusa no limite da faixa).
-- ============================================================================================================
create or replace function {schema}.aluno_bloquear(p_paciente uuid, p_bloquear boolean, p_msg text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p {schema}.pacientes%rowtype;
  v_msg text := nullif(left(btrim(coalesce(p_msg, '')), 300), '');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_p from {schema}.pacientes where id = p_paciente and deleted_at is null;
  if not found or v_p.conta_id is null then return jsonb_build_object('ok', false, 'erro', 'aluno_inexistente'); end if;
  if not {schema}.w13_pode_gerir(p_paciente) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  perform 1 from {schema}.contas where id = v_p.conta_id for update;  -- serializa o limite da faixa
  if coalesce(p_bloquear, true) then
    if v_p.acesso_bloqueado_em is null then
      update {schema}.pacientes set acesso_bloqueado_em = now(), acesso_bloqueado_msg = v_msg where id = p_paciente;
      insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
      values (v_p.conta_id, 'outro', jsonb_build_object('w13', 'aluno_bloqueado', 'paciente_id', p_paciente), v_uid);
    elsif v_msg is distinct from v_p.acesso_bloqueado_msg then
      update {schema}.pacientes set acesso_bloqueado_msg = v_msg where id = p_paciente;
    end if;
  else
    if v_p.acesso_bloqueado_em is not null then
      if v_p.ativo and not {schema}.conta_pode_adicionar_aluno(v_p.conta_id) then return {schema}.w13_erro_limite(v_p.conta_id); end if;
      update {schema}.pacientes set acesso_bloqueado_em = null, acesso_bloqueado_msg = null where id = p_paciente;
      insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
      values (v_p.conta_id, 'outro', jsonb_build_object('w13', 'aluno_desbloqueado', 'paciente_id', p_paciente), v_uid);
    end if;
  end if;
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'paciente_id', p_paciente, 'bloqueado', coalesce(p_bloquear, true),
                            'em_uso', {schema}.conta_alunos_ativos(v_p.conta_id), 'limite', {schema}.conta_limite_alunos(v_p.conta_id));
end;
$$;

-- ============================================================================================================
-- 5. Desativar / reativar (N-10). Desativar libera a vaga; quem tem login numa conta nova/do Calc vai para o app (gatilho
--    da W7b). Reativar = limite da faixa + P7; com login, pela matricular_na_conta (encerra a matrícula do app).
-- ============================================================================================================
create or replace function {schema}.aluno_ativar(p_paciente uuid, p_ativo boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p {schema}.pacientes%rowtype;
  v_res jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_p from {schema}.pacientes where id = p_paciente and deleted_at is null;
  if not found or v_p.conta_id is null then return jsonb_build_object('ok', false, 'erro', 'aluno_inexistente'); end if;
  if not {schema}.w13_pode_gerir(p_paciente) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  if coalesce(p_ativo, false) = v_p.ativo then
    return jsonb_build_object('ok', true, 'paciente_id', p_paciente, 'ativo', v_p.ativo, 'ja_estava', true);
  end if;
  if not coalesce(p_ativo, false) then
    update {schema}.pacientes set ativo = false where id = p_paciente;
    insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
    values (v_p.conta_id, 'outro', jsonb_build_object('w13', 'aluno_desativado', 'paciente_id', p_paciente), v_uid);
    perform {schema}.espelho_disparar();
    return jsonb_build_object('ok', true, 'paciente_id', p_paciente, 'ativo', false);
  end if;
  if coalesce(v_p.config, '{}'::jsonb) ? 'conta_excluida_em' then return jsonb_build_object('ok', false, 'erro', 'conta_excluida'); end if;
  if {schema}.w13_conta_travada(v_p.conta_id) then return jsonb_build_object('ok', false, 'erro', 'conta_travada'); end if;
  if v_p.user_id is not null then
    v_res := {schema}.matricular_na_conta(v_p.user_id, v_p.conta_id, v_p.personal_id, v_p.nutricionista_id, coalesce(v_p.origem, 'novo'), false);
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      if v_res ->> 'erro' = 'limite_plano' then return {schema}.w13_erro_limite(v_p.conta_id); end if;
      return v_res;
    end if;
  else
    perform 1 from {schema}.contas where id = v_p.conta_id for update;
    if v_p.acesso_bloqueado_em is null and not {schema}.conta_pode_adicionar_aluno(v_p.conta_id) then
      return {schema}.w13_erro_limite(v_p.conta_id);
    end if;
    update {schema}.pacientes set ativo = true, desvinculado_em = null where id = p_paciente;
  end if;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_p.conta_id, 'outro', jsonb_build_object('w13', 'aluno_reativado', 'paciente_id', p_paciente), v_uid);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'paciente_id', p_paciente, 'ativo', true, 'app_encerrado', coalesce((v_res ->> 'app_encerrado')::boolean, false),
                            'user_id', v_p.user_id);
end;
$$;

-- ============================================================================================================
-- 6. Remover da lista (C31). Membro que não é dono e divide o aluno com outro responsável: sai só ele (o aluno fica com o
--    outro). Senão a matrícula vai para a lixeira (deleted_at; a Lixeira do Nutri restaura) — os dados do aluno continuam;
--    quem tem login numa conta nova/do Calc vai para o app (gatilho da W7b), como o "Remover da minha lista" do Calc.
-- ============================================================================================================
create or replace function {schema}.aluno_remover(p_paciente uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p {schema}.pacientes%rowtype;
  v_dono boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_p from {schema}.pacientes where id = p_paciente and deleted_at is null;
  if not found or v_p.conta_id is null then return jsonb_build_object('ok', false, 'erro', 'aluno_inexistente'); end if;
  if not {schema}.w13_pode_gerir(p_paciente) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  v_dono := {schema}.sou_dono(v_p.conta_id) or {schema}.eh_master();
  if not v_dono and v_p.personal_id is not null and v_p.nutricionista_id is not null and v_p.personal_id <> v_p.nutricionista_id then
    if v_p.personal_id = v_uid then
      update {schema}.pacientes set personal_id = null where id = p_paciente;
    else
      update {schema}.pacientes set nutricionista_id = null where id = p_paciente;
    end if;
    insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
    values (v_p.conta_id, 'outro', jsonb_build_object('w13', 'responsavel_saiu', 'paciente_id', p_paciente), v_uid);
    perform {schema}.espelho_disparar();
    return jsonb_build_object('ok', true, 'paciente_id', p_paciente, 'so_responsavel', true);
  end if;
  update {schema}.pacientes set deleted_at = now() where id = p_paciente;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_p.conta_id, 'outro', jsonb_build_object('w13', 'aluno_removido', 'paciente_id', p_paciente), v_uid);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'paciente_id', p_paciente, 'removido', true);
end;
$$;

-- ============================================================================================================
-- 7. Atribuir em lote (herdado da W5: alunos que ficaram sem responsável) — só o dono
-- ============================================================================================================
create or replace function {schema}.alunos_atribuir(p_conta uuid, p_pacientes uuid[], p_modulo text, p_responsavel uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c {schema}.contas%rowtype;
  v_n integer := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if not ({schema}.sou_dono(p_conta) or {schema}.eh_master()) then return jsonb_build_object('ok', false, 'erro', 'so_dono'); end if;
  if p_modulo not in ('treino', 'nutricao') or not (p_modulo = any({schema}.modulos_do_plano(v_c.plano))) then
    return jsonb_build_object('ok', false, 'erro', 'modulo_invalido');
  end if;
  if not exists (select 1 from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id = p_responsavel and m.status = 'ativo'
                   and ((p_modulo = 'treino' and 'personal' = any(m.papeis)) or (p_modulo = 'nutricao' and 'nutricionista' = any(m.papeis)))) then
    return jsonb_build_object('ok', false, 'erro', 'responsavel_invalido');
  end if;
  if coalesce(array_length(p_pacientes, 1), 0) = 0 or array_length(p_pacientes, 1) > 200 then
    return jsonb_build_object('ok', false, 'erro', 'selecao_invalida');
  end if;
  if p_modulo = 'treino' then
    update {schema}.pacientes set personal_id = p_responsavel
     where id = any(p_pacientes) and conta_id = p_conta and deleted_at is null and personal_id is distinct from p_responsavel;
  else
    update {schema}.pacientes set nutricionista_id = p_responsavel
     where id = any(p_pacientes) and conta_id = p_conta and deleted_at is null and nutricionista_id is distinct from p_responsavel;
  end if;
  get diagnostics v_n = row_count;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (p_conta, 'outro', jsonb_build_object('w13', 'alunos_atribuidos', 'modulo', p_modulo, 'responsavel', p_responsavel, 'quantos', v_n), v_uid);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'atualizados', v_n);
end;
$$;

-- ============================================================================================================
-- 8. Auto-cadastro pelo link /c/:codigo (N-57): fica pendente e o profissional aprova (limite da faixa) ou recusa
-- ============================================================================================================

-- de quem é o código (público): membro com o código PROF-… ou o código do link de cadastro do site antigo do Nutri
create or replace function {schema}.w13_dono_do_codigo(p_codigo text) returns table (user_id uuid, conta_id uuid)
language sql stable security definer set search_path = '' as $$
  select x.user_id, x.conta_id from (
    select m.user_id, m.conta_id, 1 as ordem
      from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where upper(m.codigo_convite) = upper(btrim(coalesce(p_codigo, ''))) and m.status = 'ativo' and m.user_id is not null
       and c.situacao not in ('suspensa', 'cancelada') and c.origem <> 'app'
    union all
    select m.user_id, m.conta_id, 2
      from {schema}.profiles pr
      join {schema}.conta_membros m on m.user_id = pr.id and m.status = 'ativo'
      join {schema}.contas c on c.id = m.conta_id
     where pr.codigo_cadastro = lower(btrim(coalesce(p_codigo, ''))) and c.situacao not in ('suspensa', 'cancelada') and c.origem <> 'app'
       and (m.papeis && array['personal', 'nutricionista'])
  ) x
  where length(btrim(coalesce(p_codigo, ''))) between 4 and 60
  order by x.ordem limit 1;
$$;

create or replace function {schema}.cadastro_link_info(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('ok', true, 'profissional', {schema}.nome_da_pessoa(d.user_id), 'conta', c.nome,
             'foto_url', (select nullif(btrim(pr.dados_profissionais ->> 'foto_url'), '') from {schema}.profiles pr where pr.id = d.user_id))
      from {schema}.w13_dono_do_codigo(p_codigo) d join {schema}.contas c on c.id = d.conta_id),
    jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'));
$$;

-- grava o cadastro pendente (só a função alunos chama, depois de conferir o captcha — service_role)
create or replace function {schema}.cadastro_link_enviar(p_codigo text, p_dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_dono_user uuid;
  v_dono_conta uuid;
  v_nome text := left(regexp_replace(btrim(coalesce(v_d ->> 'nome', '')), '\s+', ' ', 'g'), 120);
  v_email text := nullif(lower(btrim(coalesce(v_d ->> 'email', ''))), '');
  v_tel text := nullif(regexp_replace(coalesce(v_d ->> 'telefone', ''), '\D', '', 'g'), '');
  v_genero text := nullif(lower(btrim(coalesce(v_d ->> 'genero', ''))), '');
  v_obs text := nullif(left(btrim(coalesce(v_d ->> 'observacoes', '')), 2000), '');
  v_nasc date;
  v_qtd integer;
  v_id uuid;
begin
  select d.user_id, d.conta_id into v_dono_user, v_dono_conta from {schema}.w13_dono_do_codigo(p_codigo) d;
  if v_dono_user is null then return jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'); end if;
  if length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  if v_email is null and v_tel is null then return jsonb_build_object('ok', false, 'erro', 'contato_obrigatorio'); end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 160) then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if v_tel is not null and length(v_tel) not in (10, 11) then return jsonb_build_object('ok', false, 'erro', 'telefone_invalido'); end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then return jsonb_build_object('ok', false, 'erro', 'genero_invalido'); end if;
  if nullif(btrim(coalesce(v_d ->> 'nascimento', '')), '') is not null then
    begin
      v_nasc := (v_d ->> 'nascimento')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    end;
    if v_nasc > current_date or v_nasc < date '1900-01-01' then return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido'); end if;
  end if;
  -- staging: só contato de teste (P26)
  if '{schema}' = 'staging' and v_email is not null and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  select count(*) into v_qtd from {schema}.cadastros_pendentes cp
   where cp.nutricionista_id = v_dono_user and cp.created_at > now() - interval '1 hour';
  if v_qtd >= 30 then return jsonb_build_object('ok', false, 'erro', 'muitos_cadastros'); end if;
  if exists (select 1 from {schema}.cadastros_pendentes cp
              where cp.nutricionista_id = v_dono_user and cp.status = 'pendente'
                and ((v_email is not null and cp.email = v_email) or (v_tel is not null and cp.telefone = v_tel and lower(cp.nome) = lower(v_nome)))) then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_repetido');
  end if;
  insert into {schema}.cadastros_pendentes (nutricionista_id, conta_id, nome, nascimento, telefone, email, genero, observacoes)
  values (v_dono_user, v_dono_conta, v_nome, v_nasc, v_tel, v_email, v_genero, v_obs)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- pendentes da conta (Alunos › Pendentes): dono vê todos; o membro, os do link dele
create or replace function {schema}.alunos_pendentes(p_conta uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', cp.id, 'nome', cp.nome, 'email', cp.email, 'telefone', cp.telefone,
            'nascimento', cp.nascimento, 'genero', cp.genero, 'observacoes', cp.observacoes, 'criado_em', cp.created_at,
            'profissional', jsonb_build_object('id', cp.nutricionista_id, 'nome', {schema}.nome_da_pessoa(cp.nutricionista_id)))
          order by cp.created_at desc), '[]'::jsonb)
    from {schema}.cadastros_pendentes cp
   where cp.status = 'pendente'
     and (cp.conta_id = p_conta or (cp.conta_id is null and exists (
            select 1 from {schema}.conta_membros m where m.conta_id = p_conta and m.status = 'ativo' and m.user_id = cp.nutricionista_id)))
     and ({schema}.sou_dono(p_conta) or {schema}.eh_master() or ({schema}.sou_membro(p_conta) and cp.nutricionista_id = auth.uid()));
$$;

create or replace function {schema}.aluno_pendente_decidir(p_conta uuid, p_pendente uuid, p_aprovar boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cp {schema}.cadastros_pendentes%rowtype;
  v_c {schema}.contas%rowtype;
  v_mods text[];
  v_personal uuid;
  v_nutri uuid;
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta for update;  -- serializa o limite da faixa
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  select * into v_cp from {schema}.cadastros_pendentes where id = p_pendente for update;
  if not found or v_cp.status <> 'pendente' then return jsonb_build_object('ok', false, 'erro', 'cadastro_nao_encontrado'); end if;
  if not (v_cp.conta_id = p_conta or (v_cp.conta_id is null and exists (select 1 from {schema}.conta_membros m
            where m.conta_id = p_conta and m.status = 'ativo' and m.user_id = v_cp.nutricionista_id))) then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_nao_encontrado');
  end if;
  if not ({schema}.sou_dono(p_conta) or {schema}.eh_master() or ({schema}.sou_membro(p_conta) and v_cp.nutricionista_id = v_uid)) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if not coalesce(p_aprovar, false) then
    update {schema}.cadastros_pendentes set status = 'reprovado', decidido_em = now() where id = p_pendente;
    return jsonb_build_object('ok', true, 'pendente_id', p_pendente, 'status', 'reprovado');
  end if;
  if {schema}.w13_conta_travada(p_conta) then return jsonb_build_object('ok', false, 'erro', 'conta_travada'); end if;
  if not {schema}.conta_pode_adicionar_aluno(p_conta) then return {schema}.w13_erro_limite(p_conta); end if;
  -- o responsável é o dono do link, nos módulos que ele atende na conta
  v_mods := {schema}.modulos_do_plano(v_c.plano);
  select case when 'treino' = any(v_mods) and 'personal' = any(m.papeis) then m.user_id end,
         case when 'nutricao' = any(v_mods) and 'nutricionista' = any(m.papeis) then m.user_id end
    into v_personal, v_nutri
    from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id = v_cp.nutricionista_id and m.status = 'ativo';
  insert into {schema}.pacientes (nutricionista_id, personal_id, conta_id, nome, apelido, nascimento, telefone, cpf, email, genero, resumo, origem, ativo)
  values (v_nutri, v_personal, p_conta, v_cp.nome, v_cp.apelido, v_cp.nascimento, v_cp.telefone, v_cp.cpf, v_cp.email, v_cp.genero,
          case when v_cp.observacoes is null then null else 'Informado no cadastro pelo link: ' || v_cp.observacoes end, 'novo', true)
  returning id into v_id;
  update {schema}.cadastros_pendentes set status = 'aprovado', paciente_id = v_id, decidido_em = now(),
         conta_id = coalesce(conta_id, p_conta) where id = p_pendente;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (p_conta, 'outro', jsonb_build_object('w13', 'pendente_aprovado', 'paciente_id', v_id, 'pendente_id', p_pendente), v_uid);
  return jsonb_build_object('ok', true, 'pendente_id', p_pendente, 'status', 'aprovado', 'paciente_id', v_id, 'rota_id', v_id);
end;
$$;

-- ============================================================================================================
-- 9. Repasse do APK antigo (professor-convites do Treino → função alunos em modo servidor): a conta do personal e o
--    "como a pessoa" (o banco confere tudo pelo auth.uid() dela, como na tela nova)
-- ============================================================================================================
create or replace function {schema}.w13_conta_do_personal(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.conta_id from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
   where m.user_id = p_user and m.status = 'ativo' and 'personal' = any(m.papeis) and 'treino' = any({schema}.modulos_do_plano(c.plano))
     and c.origem <> 'app'
   order by ('dono' = any(m.papeis)) desc, m.criado_em limit 1;
$$;

create or replace function {schema}.alunos_como(p_user uuid, p_acao text, p_args jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_a jsonb := coalesce(p_args, '{}'::jsonb);
  v_conta uuid;
begin
  if p_user is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  -- o resto da transação enxerga esta pessoa como o auth.uid() (as regras são as mesmas da tela)
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  v_conta := {schema}.w13_conta_do_personal(p_user);
  if v_conta is null then return jsonb_build_object('ok', false, 'erro', 'nao_professor'); end if;
  if p_acao = 'convidar' then
    return {schema}.aluno_convidar(v_conta, v_a ->> 'email', array['treino'], p_user);
  elsif p_acao = 'convites' then
    return jsonb_build_object('ok', true, 'convites', {schema}.aluno_convites(v_conta));
  elsif p_acao in ('cancelar', 'reenviar') then
    return {schema}.aluno_convite_acao(nullif(v_a ->> 'convite_id', '')::uuid, p_acao);
  end if;
  return jsonb_build_object('ok', false, 'erro', 'acao_invalida');
end;
$$;

-- ============================================================================================================
-- 10. Grants (nenhuma leitura/escrita anônima; o público só lê de quem é o link)
-- ============================================================================================================
revoke execute on function {schema}.w13_modulos_do_aluno(uuid, uuid, text), {schema}.w13_pode_gerir(uuid), {schema}.w13_conta_travada(uuid),
  {schema}.w13_erro_limite(uuid), {schema}.w13_foto_do_aluno(text, uuid), {schema}.alunos_da_conta(uuid, jsonb, integer, integer),
  {schema}.aluno_criar(uuid, jsonb), {schema}.aluno_convidar(uuid, text, text[], uuid), {schema}.aluno_convites(uuid),
  {schema}.aluno_convite_acao(uuid, text), {schema}.aluno_bloquear(uuid, boolean, text), {schema}.aluno_ativar(uuid, boolean),
  {schema}.aluno_remover(uuid), {schema}.alunos_atribuir(uuid, uuid[], text, uuid), {schema}.w13_dono_do_codigo(text),
  {schema}.cadastro_link_info(text), {schema}.cadastro_link_enviar(text, jsonb), {schema}.alunos_pendentes(uuid),
  {schema}.aluno_pendente_decidir(uuid, uuid, boolean), {schema}.w13_conta_do_personal(uuid), {schema}.alunos_como(uuid, text, jsonb)
  from public, anon;
grant execute on function {schema}.alunos_da_conta(uuid, jsonb, integer, integer), {schema}.aluno_criar(uuid, jsonb),
  {schema}.aluno_convidar(uuid, text, text[], uuid), {schema}.aluno_convites(uuid), {schema}.aluno_convite_acao(uuid, text),
  {schema}.aluno_bloquear(uuid, boolean, text), {schema}.aluno_ativar(uuid, boolean), {schema}.aluno_remover(uuid),
  {schema}.alunos_atribuir(uuid, uuid[], text, uuid), {schema}.alunos_pendentes(uuid), {schema}.aluno_pendente_decidir(uuid, uuid, boolean),
  {schema}.w13_pode_gerir(uuid)
  to authenticated, service_role;
grant execute on function {schema}.cadastro_link_info(text) to anon, authenticated, service_role;
grant execute on function {schema}.cadastro_link_enviar(text, jsonb), {schema}.alunos_como(uuid, text, jsonb), {schema}.w13_conta_do_personal(uuid),
  {schema}.w13_dono_do_codigo(text), {schema}.w13_modulos_do_aluno(uuid, uuid, text), {schema}.w13_conta_travada(uuid), {schema}.w13_erro_limite(uuid),
  {schema}.w13_foto_do_aluno(text, uuid)
  to service_role;
