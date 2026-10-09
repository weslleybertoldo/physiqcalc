-- Physiq hml-14b (B19 · D17, 09/10/2026) — busca de alunos SEM ACENTO e pelos DÍGITOS do CPF e do telefone. Banco principal,
-- staging + public. Idempotente. Nenhum dado muda: só a coluna gerada pacientes.busca é recalculada (20 / 79 linhas hoje).
--
-- Por quê (H-72): texto_busca_paciente era só lower(...) — "jose" não achava "José" — e guardava o CPF e o telefone como estavam
-- escritos. O que muda:
--   1. texto_busca_paciente = {schema}.texto_busca(...) (o translate dos acentos que os alimentos já usam:
--      20260919070000_alimentos.sql) + o CPF e o telefone SÓ COM OS DÍGITOS (a busca por número compara só os dígitos: a tela
--      acha "123.456.789-00" e "(82) 99999-1234");
--   2. a coluna gerada busca é recriada NA MESMA TRANSAÇÃO (o Postgres não recalcula a coluna gerada quando a função muda): sem
--      janela sem busca. Nenhum índice, view, policy ou gatilho usa a coluna; quem lê é a alunos_da_conta e a master_alunos;
--   3. alunos_da_conta (a definição mais nova: 20261002090000_h4_alunos_filtros_csv.sql) — o termo normalizado com o MESMO
--      texto_busca() e a situação nova 'ativos_e_bloqueados' (ativo = true, com ou sem bloqueio) para o seletor de aluno do
--      painel (B19: Agendamento, Movimentação e Recibo listavam ativo = true). Assinatura, padrões e resposta iguais: quem chama
--      como antes recebe o mesmo de antes (o APK antigo e a produção atual);
--   4. master_alunos (a definição mais nova: 20261002010000_w27_master.sql) — o termo normalizado do mesmo jeito e nome/e-mail
--      comparados sem acento (achar por telefone/CPF no master fica para a hml-14d).
--
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009020000_hml14b_busca_sem_acento.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009020000_hml14b_busca_sem_acento.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261009020000_hml14b_busca_sem_acento_reversa.sql

-- ============================================================================================================
-- 1. Texto de busca do aluno: sem acento e sem caixa + os dígitos do CPF e do telefone
-- ============================================================================================================
create or replace function {schema}.texto_busca_paciente(nome text, apelido text, email text, cpf text, telefone text, tags text[])
returns text language sql immutable as $$
  select {schema}.texto_busca(concat_ws(' ', nome, apelido, email,
    nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), ''),
    array_to_string(tags, ' ')));
$$;

-- quem grava em pacientes calcula a coluna (o site antigo do Nutri grava direto, como authenticated): as 2 continuam executáveis
grant execute on function {schema}.texto_busca(text), {schema}.texto_busca_paciente(text, text, text, text, text, text[])
  to authenticated, service_role;

-- ============================================================================================================
-- 2. A coluna gerada, recalculada com a função nova (mesma transação)
-- ============================================================================================================
alter table {schema}.pacientes drop column if exists busca;
alter table {schema}.pacientes add column busca text
  generated always as ({schema}.texto_busca_paciente(nome, apelido, email, cpf, telefone, tags)) stored;

-- ============================================================================================================
-- 3. Lista de alunos do painel (e o seletor de aluno — B19)
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
  -- hml-14b (D17): o termo sem acento e sem caixa, do MESMO jeito que a coluna busca (texto_busca_paciente)
  v_q text := {schema}.texto_busca(btrim(regexp_replace(coalesce(v_f ->> 'q', ''), '\s+', ' ', 'g')));
  v_q_dig text := regexp_replace(coalesce(v_f ->> 'q', ''), '\D', '', 'g');
  v_sit text := coalesce(nullif(v_f ->> 'situacao', ''), 'ativos');
  v_modulo text := nullif(v_f ->> 'modulo', '');
  v_resp text := nullif(v_f ->> 'responsavel', '');
  v_resp_id uuid;
  v_tag text := nullif(btrim(coalesce(v_f ->> 'tag', '')), '');
  v_pag text := nullif(v_f ->> 'pagamento', '');
  -- H4 (N-10): gênero e os períodos de cadastro e de modificação (instantes ISO que a tela calcula: "1 mês atrás" ou as datas
  -- escolhidas); valor inválido = filtro desligado (a tela nunca quebra)
  v_genero text := nullif(v_f ->> 'genero', '');
  v_cad_de timestamptz := {schema}.h4_instante(v_f ->> 'cadastro_de');
  v_cad_ate timestamptz := {schema}.h4_instante(v_f ->> 'cadastro_ate');
  v_mod_de timestamptz := {schema}.h4_instante(v_f ->> 'modificado_de');
  v_mod_ate timestamptz := {schema}.h4_instante(v_f ->> 'modificado_ate');
  -- H4 (N-66): a exportação pede os campos do CSV do Nutri (apelido, CPF, nascimento e gênero) — a lista da tela não leva
  v_exportar boolean := coalesce(v_f ->> 'exportar', '') = 'true';
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
  -- hml-14b (B19): 'ativos_e_bloqueados' = ativo, com ou sem bloqueio de acesso (o que o Agendamento, a Movimentação e o
  -- Recibo do painel listavam: ativo = true); só o seletor de aluno pede — as telas antigas não mandam esse valor
  if v_sit not in ('ativos', 'bloqueados', 'desativados', 'excluidas', 'todos', 'ativos_e_bloqueados') then v_sit := 'ativos'; end if;
  if v_ordem not in ('nome', 'recentes', 'modificados') then v_ordem := 'nome'; end if;
  if v_genero not in ('masculino', 'feminino', 'outro') then v_genero := null; end if;
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
           p.apelido, p.cpf, p.nascimento, p.genero,
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
       and (v_genero is null or b.genero = v_genero)
       and (v_cad_de is null or b.criado_em >= v_cad_de) and (v_cad_ate is null or b.criado_em <= v_cad_ate)
       and (v_mod_de is null or b.atualizado_em >= v_mod_de) and (v_mod_ate is null or b.atualizado_em <= v_mod_ate)
  ), sel as (
    select f.* from filtrada f
     where case v_sit
             when 'ativos' then f.ativo and f.bloqueado_em is null
             when 'bloqueados' then f.ativo and f.bloqueado_em is not null
             when 'desativados' then not f.ativo and not f.excluida
             when 'excluidas' then f.excluida
             when 'ativos_e_bloqueados' then f.ativo
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
          ) || case when v_exportar then jsonb_build_object('apelido', s.apelido, 'cpf', s.cpf, 'nascimento', s.nascimento, 'genero', s.genero)
                    else '{}'::jsonb end as j
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
-- 4. Master › Alunos
-- ============================================================================================================
create or replace function {schema}.master_alunos(p_filtros jsonb default '{}'::jsonb, p_offset integer default 0, p_limite integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  -- hml-14b (D17): o termo sem acento e sem caixa, do mesmo jeito que a alunos_da_conta (nome e e-mail comparados igual)
  v_busca text := {schema}.texto_busca(btrim(regexp_replace(coalesce(v_f ->> 'busca', ''), '\s+', ' ', 'g')));
  v_conta uuid := nullif(v_f ->> 'conta_id', '')::uuid;
  v_modo text := coalesce(nullif(v_f ->> 'modo', ''), 'ativos');
  v_app uuid := {schema}.conta_do_app();
  v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_lista jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or {schema}.texto_busca(p.nome) like '%' || v_busca || '%' or {schema}.texto_busca(p.email) like '%' || v_busca || '%')
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
  )
  select count(*) into v_total from filtrada;
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or {schema}.texto_busca(p.nome) like '%' || v_busca || '%' or {schema}.texto_busca(p.email) like '%' || v_busca || '%')
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
     order by case when v_modo = 'p7' then coalesce(b.user_id::text, '') else '' end, lower(coalesce(b.nome, '')), b.created_at
     offset v_off limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', b.id, 'nome', b.nome, 'email', coalesce(lower((select u.email from auth.users u where u.id = b.user_id)), lower(b.email)),
      'user_id', b.user_id, 'tem_login', b.user_id is not null, 'ativo', b.ativo, 'criado_em', b.created_at,
      'conta', case when b.conta_id is null then null else jsonb_build_object('id', b.conta_id, 'nome', b.conta_nome, 'origem', b.conta_origem,
                                                                               'eh_app', b.conta_id = v_app) end,
      'personal', case when b.personal_id is null then null else jsonb_build_object('id', b.personal_id, 'nome', {schema}.w27_nome(b.personal_id)) end,
      'nutricionista', case when b.nutricionista_id is null then null else jsonb_build_object('id', b.nutricionista_id, 'nome', {schema}.w27_nome(b.nutricionista_id)) end,
      'modulos', to_jsonb({schema}.w13_modulos_do_aluno(b.personal_id, b.nutricionista_id, b.conta_plano)),
      'bloqueado', b.acesso_bloqueado_em is not null, 'conta_bloqueada', b.conta_bloq is not null, 'p7', b.p7,
      'app', case when b.conta_id = v_app then jsonb_build_object('plano', (select pa.nome from {schema}.planos_aluno pa where pa.id = b.plano_aluno_id),
                                                                   'valor', b.mensalidade_valor, 'teste_ate', b.app_teste_ate, 'pago_ate', b.mensalidade_pago_ate,
                                                                   'encerrada_em', b.app_encerrada_em, 'objetivo', b.objetivo_app) end)), '[]'::jsonb)
    into v_lista from filtrada b;
  return jsonb_build_object('ok', true, 'modo', v_modo, 'total', v_total, 'offset', v_off, 'limite', v_lim, 'alunos', v_lista,
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano,
                                                            'modulos', to_jsonb({schema}.modulos_do_plano(c.plano))) order by c.origem = 'app', lower(c.nome))
                          from {schema}.contas c), '[]'::jsonb),
    'contagens', jsonb_build_object(
      'ativos', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.acesso_bloqueado_em is null and p.conta_id is distinct from v_app),
      'app', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.conta_id = v_app),
      'p7', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.user_id in (
                select q.user_id from {schema}.pacientes q where q.user_id is not null and q.ativo and q.deleted_at is null and q.conta_id is not null
                   and q.conta_id is distinct from v_app group by q.user_id having count(distinct q.conta_id) > 1)),
      'sem_conta', (select count(*) from auth.users u join {schema}.profiles pr on pr.id = u.id
                     where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
                       and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
                       and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido'))));
end;
$$;

revoke execute on function {schema}.alunos_da_conta(uuid, jsonb, integer, integer), {schema}.master_alunos(jsonb, integer, integer)
  from public, anon;
grant execute on function {schema}.alunos_da_conta(uuid, jsonb, integer, integer), {schema}.master_alunos(jsonb, integer, integer)
  to authenticated, service_role;
