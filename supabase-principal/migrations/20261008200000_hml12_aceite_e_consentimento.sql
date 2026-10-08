-- Homologação do Physiq — hml-12 / H-30 (08/10/2026): registro do aceite dos textos legais e dos consentimentos. Idempotente.
--
-- A versão vigente dos textos (Termos de Uso + Política de Privacidade; os Termos de assinatura fazem parte dos Termos de Uso) mora
-- no banco, POR SCHEMA: {schema}.app_config 'textos_legais' = {"versao": "AAAA-MM-DD"} (a mesma do VERSAO_TEXTOS do app,
-- src/publico/legal/versao.ts). Aqui o staging nasce com '2026-10-08' e o public com {"versao": null} = DESLIGADO: sem aceite, sem
-- regra de idade, sem consentimento exigido, e as funções de antes respondem igual (nada muda na produção). A virada é 1 update
-- dessa chave, numa migração própria, depois do advogado.
--   {schema}.aceites      1 linha por evento, só cresce (aceitou / revogou): os textos, o consentimento do dado de saúde (aluno sem
--                         profissional) e o do responsável (aluno de 16 ou 17 anos, registrado pelo profissional na ficha), com
--                         versão, data e hora, origem (site, apk, loja; suporte = registro do dono pelo SQL) e versão do app. Sem
--                         IP. user_id sem FK para auth.users (a prova do aceite fica depois da exclusão da conta). Ninguém lê nem
--                         grava direto: RLS sem policy e nenhum privilégio para public/anon/authenticated/service_role; só as
--                         funções abaixo (SECURITY DEFINER, search_path fixo). A matrícula apagada leva o registro do responsável.
--   respostas_preconsulta.consentimento_versao / consentimento_em   o consentimento do visitante da pré-consulta (/f/:slug).
--   minha_situacao()      ganha 'legal': {"versao": null} desligado; senão versao, aceite_pendente, saude_pendente,
--                         nascimento_pendente e menor ('menor_16' | 'sem_responsavel' | null).
--   aceitar_no_acesso(p_versao, p_origem, p_saude, p_nascimento, p_versao_app)   o aceite no próximo acesso (e, para o aluno sem
--                         profissional, o consentimento de saúde e a data de nascimento, 18+).
--   entrar_sem_profissional(p_objetivo, p_plano, p_nascimento, p_consentimento, p_origem)   nova (5 argumentos, sem default): data
--                         de nascimento (18+) e consentimento de saúde. A de 2 argumentos, com a versão ligada, pede para atualizar.
--   preconsulta_responder(…, p_consentimento)   nova (6 argumentos): grava o consentimento na resposta. A de 5, com a versão
--                         ligada, recusa (sem_consentimento).
--   aluno_responsavel / aluno_responsavel_registrar   o consentimento do responsável na ficha do aluno (a mesma guarda do
--                         "Editar dados": w14_matricula_da_rota + w14_pode_editar).
--   exportar_dados_aluno  ganha 'aceites' (os do titular e os do responsável das matrículas dele, sem quem registrou).
--   cadastro_link_enviar, aluno_pendente_decidir (aprovar) e o gatilho idade_minima_guarda (pacientes e cadastros_pendentes)
--                         menor de 16 recusado (as 2 funções devolvem o código limpo antes do gatilho); na matrícula do aluno
--                         sem profissional, menor de 18. Só com a versão ligada e só quando a data (ou a conta) muda.
-- Corpos das 6 funções que mudam gerados de pg_get_functiondef no banco vivo (08/10/2026; staging e produção conferidos iguais com o
-- marcador de schema e com o md5 do corpo igual ao do último arquivo) com trocas exatas (gerar_migracao.py do rascunho da hml-12):
-- só linhas acrescentadas. CREATE OR REPLACE mantém dono, ACL e volatilidade. Toda função nova tem REVOKE explícito (o Supabase dá
-- EXECUTE a anon e authenticated em função nova). O bloco de conferência no fim desfaz tudo se algo sair diferente.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]   (produção; backup antes)
--          (sem opções roda staging e depois public: usar --so, um schema por vez)
-- Reversa: supabase-principal/reversas/20261008200000_hml12_aceite_e_consentimento_reversa.sql

-- ============================================================================================================
-- 1. A versão vigente dos textos neste schema (null = desligado)
-- ============================================================================================================
insert into {schema}.app_config (chave, valor, publica)
values ('textos_legais', jsonb_build_object('versao', case when '{schema}' = 'staging' then '2026-10-08' end), false)
on conflict (chave) do nothing;

create or replace function {schema}.versao_dos_textos() returns text
language sql stable security definer set search_path = '' as $$
  select nullif(btrim(a.valor ->> 'versao'), '') from {schema}.app_config a where a.chave = 'textos_legais'
$$;
comment on function {schema}.versao_dos_textos() is
  'hml-12 (H-30): a versão vigente dos textos legais neste schema (app_config textos_legais); null = desligado.';
revoke all on function {schema}.versao_dos_textos() from public, anon, authenticated;

-- a idade em anos completos hoje (São Paulo)
create or replace function {schema}.idade_em(p_nascimento date) returns integer
language sql stable set search_path = '' as $$
  select case when p_nascimento is null then null
              else extract(year from age(((now() at time zone 'America/Sao_Paulo')::date)::timestamp, p_nascimento::timestamp))::integer end
$$;
revoke all on function {schema}.idade_em(date) from public, anon, authenticated;

-- ============================================================================================================
-- 2. Os aceites: 1 linha por evento; só cresce (ninguém tem UPDATE nem DELETE; a matrícula apagada leva o do responsável)
-- ============================================================================================================
create table if not exists {schema}.aceites (
  id uuid primary key default gen_random_uuid(),
  documento text not null check (documento in ('textos', 'saude', 'responsavel')),
  evento text not null default 'aceitou' check (evento in ('aceitou', 'revogou')),
  versao text not null check (versao ~ '^\d{4}-\d{2}-\d{2}$'),
  user_id uuid,                       -- o titular (textos e saúde); sem FK para auth.users: a prova fica depois da exclusão
  paciente_id uuid references {schema}.pacientes (id) on delete cascade,   -- responsável: a matrícula do aluno de 16 ou 17 anos
  conta_id uuid references {schema}.contas (id) on delete set null,        -- responsável: a conta do profissional
  registrado_por uuid not null,       -- quem fez: o próprio titular; no responsável, o profissional; origem suporte = o dono
  responsavel_nome text check (responsavel_nome is null or char_length(responsavel_nome) between 2 and 120),
  responsavel_vinculo text check (responsavel_vinculo is null or responsavel_vinculo in ('mae', 'pai', 'responsavel_legal')),
  responsavel_forma text check (responsavel_forma is null or responsavel_forma in ('presencial', 'documento_assinado', 'mensagem_escrita')),
  origem text not null check (origem in ('site', 'apk', 'loja', 'suporte')),
  versao_app text check (versao_app is null or char_length(versao_app) <= 20),
  em timestamptz not null default clock_timestamp(),
  constraint aceites_forma check (
    (documento in ('textos', 'saude') and user_id is not null and paciente_id is null and responsavel_nome is null)
    or (documento = 'responsavel' and user_id is null and paciente_id is not null
        and (evento = 'revogou' or (responsavel_nome is not null and responsavel_vinculo is not null and responsavel_forma is not null))))
);
comment on table {schema}.aceites is
  'hml-12 (H-30): aceite dos textos legais e consentimentos (saúde; responsável de 16-17), 1 linha por evento, só cresce. Sem IP. Só as funções SECURITY DEFINER leem e gravam.';
create unique index if not exists aceites_textos_um_por_versao on {schema}.aceites (user_id, versao)
  where documento = 'textos' and evento = 'aceitou';
create index if not exists aceites_titular on {schema}.aceites (user_id, documento, em desc) where user_id is not null;
create index if not exists aceites_matricula on {schema}.aceites (paciente_id, em desc) where paciente_id is not null;
alter table {schema}.aceites enable row level security;
revoke all on table {schema}.aceites from public, anon, authenticated, service_role;   -- só o dono (migrações e funções)

-- ============================================================================================================
-- 3. A pré-consulta guarda o consentimento na própria resposta (o visitante não tem login)
-- ============================================================================================================
alter table {schema}.respostas_preconsulta add column if not exists consentimento_versao text,
                                           add column if not exists consentimento_em timestamptz;
alter table {schema}.respostas_preconsulta drop constraint if exists respostas_preconsulta_consentimento_formato;
alter table {schema}.respostas_preconsulta add constraint respostas_preconsulta_consentimento_formato
  check (consentimento_versao is null or consentimento_versao ~ '^\d{4}-\d{2}-\d{2}$');

-- ============================================================================================================
-- 4. Auxiliares (só as funções de dentro chamam)
-- ============================================================================================================
-- o último evento de saúde do titular é 'aceitou' (vale até ser retirado: não renova a cada versão dos textos)
create or replace function {schema}.saude_vigente(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.evento = 'aceitou' from {schema}.aceites a
                    where a.user_id = p_uid and a.documento = 'saude'
                    order by a.em desc, a.id desc limit 1), false)
$$;
revoke all on function {schema}.saude_vigente(uuid) from public, anon, authenticated;

-- o último evento do responsável da matrícula é 'aceitou'
create or replace function {schema}.responsavel_vigente(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.evento = 'aceitou' from {schema}.aceites a
                    where a.paciente_id = p_paciente and a.documento = 'responsavel'
                    order by a.em desc, a.id desc limit 1), false)
$$;
revoke all on function {schema}.responsavel_vigente(uuid) from public, anon, authenticated;

-- o que a porta do aceite precisa saber (vai no 'legal' da minha_situacao e na resposta do aceitar_no_acesso)
create or replace function {schema}.legal_da_situacao(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_versao text := {schema}.versao_dos_textos();
  v_conta_app uuid := {schema}.conta_do_app();
  v_app_id uuid;
  v_app_nasc date;
  v_menor text;
begin
  if v_versao is null then
    return jsonb_build_object('versao', null);
  end if;
  -- a matrícula ATIVA na conta do app (aluno sem profissional)
  select p.id, p.nascimento into v_app_id, v_app_nasc
    from {schema}.pacientes p
   where p.user_id = p_uid and p.conta_id = v_conta_app and p.deleted_at is null and p.ativo
   order by p.created_at desc limit 1;
  -- as matrículas ativas de profissional: menor de 16, ou 16-17 sem o consentimento do responsável
  select case when bool_or({schema}.idade_em(p.nascimento) < 16) then 'menor_16'
              when bool_or({schema}.idade_em(p.nascimento) between 16 and 17 and not {schema}.responsavel_vigente(p.id))
                then 'sem_responsavel' end
    into v_menor
    from {schema}.pacientes p
   where p.user_id = p_uid and p.deleted_at is null and p.ativo and p.nascimento is not null
     and p.conta_id is distinct from v_conta_app;
  return jsonb_build_object(
    'versao', v_versao,
    'aceite_pendente', not exists (select 1 from {schema}.aceites a
                                    where a.user_id = p_uid and a.documento = 'textos' and a.evento = 'aceitou' and a.versao = v_versao),
    'saude_pendente', v_app_id is not null and not {schema}.saude_vigente(p_uid),
    'nascimento_pendente', v_app_id is not null and v_app_nasc is null,
    'menor', v_menor);
end;
$$;
revoke all on function {schema}.legal_da_situacao(uuid) from public, anon, authenticated;

-- ============================================================================================================
-- 5. minha_situacao(): o corpo vivo + 'legal' (a porta do aceite lê daqui; o pos-login já devolve a minha_situacao)
-- ============================================================================================================
CREATE OR REPLACE FUNCTION {schema}.minha_situacao()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_conta_app uuid := {schema}.conta_do_app();
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
  select coalesce(jsonb_agg(x.j order by x.eh_app, x.tem_treino desc, x.dono desc, x.nome), '[]'::jsonb) into v_contas from (
    select c.nome, (c.origem = 'app') as eh_app, ('treino' = any({schema}.modulos_do_plano(c.plano))) as tem_treino, ('dono' = any(m.papeis)) as dono,
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
  -- antigo (sem conta) a nutricionista responsável vale como Nutrição. W7b: na conta do app, o plano manda (só a ativa).
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) into v_matriculas
  from (
    select p.created_at as criado,
      jsonb_build_object(
        'id', p.id, 'conta_id', p.conta_id, 'conta_nome', c.nome, 'conta_origem', c.origem, 'ativo', p.ativo,
        'origem', p.origem, 'modulos', to_jsonb(case
            when c.origem = 'app' then case when p.ativo then coalesce(
                (select array(select md from unnest(pa.modulos) md where md in ('treino', 'nutricao'))
                   from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id), array['treino']::text[]) else array[]::text[] end
            else array_remove(array[
              case when p.personal_id is not null and p.conta_id is not null and 'treino' = any({schema}.modulos_do_plano(c.plano)) then 'treino' end,
              case when p.nutricionista_id is not null and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))) then 'nutricao' end
            ], null) end),
        'bloqueada', p.acesso_bloqueado_em is not null, 'bloqueio_msg', p.acesso_bloqueado_msg,
        -- W14 (R12, P15): o ajuste "acesso ao app" desta matrícula (sem a chave = ligado: quem tem login)
        'acesso_app', {schema}.w14_ajuste(p.config, 'acesso_app', true),
        'bloqueado_por_pagamento', p.bloqueado_por_pagamento,
        'conta_alunos_bloqueados_em', c.alunos_bloqueados_em, 'conta_alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'personal', case when p.personal_id is null then null else jsonb_build_object('id', p.personal_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id)) end,
        'nutricionista', case when p.nutricionista_id is null then null else jsonb_build_object('id', p.nutricionista_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id)) end,
        -- W7b: aluno sem profissional (conta do app)
        'app', coalesce(c.origem = 'app', false),
        'app_plano', case when c.origem = 'app' then (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id) end,
        'objetivo_app', p.objetivo_app,
        'teste_ate', case when c.origem = 'app' then p.app_teste_ate end
      ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = v_uid and p.deleted_at is null
  ) x;
  -- módulos do aluno = a união dos módulos das matrículas
  select coalesce(array_agg(distinct m.valor), array[]::text[]) into v_modulos
    from jsonb_array_elements(v_matriculas) e, jsonb_array_elements_text(e -> 'modulos') as m(valor);

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
    -- W7b: sem conta e sem matrícula → Boas-vindas (código do profissional, "Treinar sem profissional" ou "Sou profissional")
    'sem_nada', not v_master and jsonb_array_length(v_contas) = 0 and jsonb_array_length(v_matriculas) = 0,
    'legado_nutri', v_legado_nutri,
    'aviso_mudanca', v_aviso,
    'conta_app', v_conta_app,
    -- hml-12 (H-30): os textos legais — a versão vigente e o que falta aceitar ({"versao": null} = desligado)
    'legal', {schema}.legal_da_situacao(v_uid),
    'gerado_em', now());
end;
$function$;

-- ============================================================================================================
-- 6. O aceite no próximo acesso (a porta do aceite)
-- ============================================================================================================
create or replace function {schema}.aceitar_no_acesso(p_versao text, p_origem text, p_saude boolean default false,
                                                      p_nascimento date default null, p_versao_app text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_versao text := {schema}.versao_dos_textos();
  v_legal jsonb;
  v_versao_app text := nullif(left(btrim(coalesce(p_versao_app, '')), 20), '');
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  if v_versao is null then
    return jsonb_build_object('ok', false, 'erro', 'textos_desligados');
  end if;
  -- o app manda a versão que a pessoa leu: outra (app antigo ou banco esquecido na virada) não grava
  if p_versao is distinct from v_versao then
    return jsonb_build_object('ok', false, 'erro', 'versao_desatualizada', 'versao', v_versao);
  end if;
  if p_origem is null or p_origem not in ('site', 'apk', 'loja') then
    return jsonb_build_object('ok', false, 'erro', 'origem_invalida');
  end if;
  v_legal := {schema}.legal_da_situacao(v_uid);
  if (v_legal ->> 'saude_pendente')::boolean and not coalesce(p_saude, false) then
    return jsonb_build_object('ok', false, 'erro', 'sem_consentimento_saude');
  end if;
  if (v_legal ->> 'nascimento_pendente')::boolean then
    if p_nascimento is null or p_nascimento < date '1900-01-01' or p_nascimento > (now() at time zone 'America/Sao_Paulo')::date then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    end if;
    if {schema}.idade_em(p_nascimento) < 18 then
      return jsonb_build_object('ok', false, 'erro', 'menor_de_18');
    end if;
    -- a data vai para a matrícula do app (o gatilho idade_minima_guarda confere de novo)
    update {schema}.pacientes p set nascimento = p_nascimento
     where p.user_id = v_uid and p.conta_id = {schema}.conta_do_app() and p.deleted_at is null and p.ativo and p.nascimento is null;
  end if;
  -- 2 toques = 1 linha (o índice único da versão)
  insert into {schema}.aceites (documento, evento, versao, user_id, registrado_por, origem, versao_app)
  values ('textos', 'aceitou', v_versao, v_uid, v_uid, p_origem, v_versao_app)
  on conflict (user_id, versao) where documento = 'textos' and evento = 'aceitou' do nothing;
  if (v_legal ->> 'saude_pendente')::boolean then
    insert into {schema}.aceites (documento, evento, versao, user_id, registrado_por, origem, versao_app)
    values ('saude', 'aceitou', v_versao, v_uid, v_uid, p_origem, v_versao_app);
  end if;
  return jsonb_build_object('ok', true, 'legal', {schema}.legal_da_situacao(v_uid));
end;
$$;
comment on function {schema}.aceitar_no_acesso(text, text, boolean, date, text) is
  'hml-12 (H-30): grava o aceite da versão vigente dos textos (e, do aluno sem profissional, o consentimento de saúde e a data de nascimento, 18+). Devolve {ok, legal} ou {ok: false, erro}.';
revoke all on function {schema}.aceitar_no_acesso(text, text, boolean, date, text) from public, anon;
grant execute on function {schema}.aceitar_no_acesso(text, text, boolean, date, text) to authenticated;

-- ============================================================================================================
-- 7. Treinar sem profissional: a de 2 argumentos pede para atualizar o app com a versão ligada; a de 5 (nova) pede a data
--    de nascimento (18+) e o consentimento de saúde. Sem default: o PostgREST não confunde as 2.
-- ============================================================================================================
CREATE OR REPLACE FUNCTION {schema}.entrar_sem_profissional(p_objetivo text, p_plano text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  -- hml-12 (H-30): com os textos ligados, o plano do app pede a data de nascimento e o consentimento de saúde (a de 5
  -- argumentos); o app antigo, que só manda estes 2, pede para atualizar
  if {schema}.versao_dos_textos() is not null then
    return jsonb_build_object('ok', false, 'erro', 'atualize_o_app');
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  if nullif(btrim(coalesce(p_objetivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'erro', 'objetivo_invalido');
  end if;
  if nullif(btrim(coalesce(p_plano, '')), '') is null then
    return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
  end if;
  return {schema}.matricular_no_app(v_uid, p_objetivo, p_plano, 'entrou', true);
end;
$function$;

create or replace function {schema}.entrar_sem_profissional(p_objetivo text, p_plano text, p_nascimento date, p_consentimento text,
                                                            p_origem text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_versao text := {schema}.versao_dos_textos();
  v_r jsonb;
  v_mat uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  if nullif(btrim(coalesce(p_objetivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'erro', 'objetivo_invalido');
  end if;
  if nullif(btrim(coalesce(p_plano, '')), '') is null then
    return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
  end if;
  -- versão desligada: o mesmo da de 2 argumentos, sem gravar nada novo
  if v_versao is null then
    return {schema}.matricular_no_app(v_uid, p_objetivo, p_plano, 'entrou', true);
  end if;
  if p_nascimento is null or p_nascimento < date '1900-01-01' or p_nascimento > (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
  end if;
  if {schema}.idade_em(p_nascimento) < 18 then
    return jsonb_build_object('ok', false, 'erro', 'menor_de_18');
  end if;
  if p_consentimento is distinct from v_versao then
    return jsonb_build_object('ok', false, 'erro', 'sem_consentimento_saude');
  end if;
  if p_origem is null or p_origem not in ('site', 'apk', 'loja') then
    return jsonb_build_object('ok', false, 'erro', 'origem_invalida');
  end if;
  v_r := {schema}.matricular_no_app(v_uid, p_objetivo, p_plano, 'entrou', true);
  if coalesce((v_r ->> 'ok')::boolean, false) then
    v_mat := nullif(v_r ->> 'paciente_id', '')::uuid;
    update {schema}.pacientes set nascimento = p_nascimento where id = v_mat and nascimento is distinct from p_nascimento;
    insert into {schema}.aceites (documento, evento, versao, user_id, registrado_por, origem)
    values ('saude', 'aceitou', v_versao, v_uid, v_uid, p_origem);
  end if;
  return v_r;
end;
$$;
comment on function {schema}.entrar_sem_profissional(text, text, date, text, text) is
  'hml-12 (H-30): Treinar sem profissional com a data de nascimento (18+) e o consentimento de saúde (= a versão vigente). Versão desligada = a de 2 argumentos.';
revoke all on function {schema}.entrar_sem_profissional(text, text, date, text, text) from public, anon;
grant execute on function {schema}.entrar_sem_profissional(text, text, date, text, text) to authenticated;

-- ============================================================================================================
-- 8. Pré-consulta (/f/:slug): a de 5 argumentos recusa com a versão ligada; a de 6 (nova) grava o consentimento na resposta
-- ============================================================================================================
CREATE OR REPLACE FUNCTION {schema}.preconsulta_responder(p_slug text, p_nome text, p_email text, p_telefone text, p_respostas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO '{schema}', 'public'
AS $function$
declare
  f record;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_pergunta jsonb;
  v_id text;
  v_tipo text;
  v_resp jsonb;
  v_texto text;
  v_max numeric;
  v_p numeric;
  v_idx integer;
  v_n_opcoes integer;
  v_n integer := 0;
  v_pontos numeric := 0;
  v_respostas jsonb := '{}'::jsonb;
  v_faixa jsonb;
  v_fmin numeric;
  v_fmax numeric;
  v_rotulo text := '';
  v_nivel text := '';
  v_qtd integer;
  v_novo_id uuid;
begin
  perform {schema}.limite_publico('preconsulta_responder', 20, 'muitas_respostas');  -- hml-05c: limite por IP
  -- hml-12 (H-30): com os textos ligados, a resposta só segue pela de 6 argumentos (com o consentimento do visitante)
  if {schema}.versao_dos_textos() is not null then
    raise exception 'sem_consentimento';
  end if;
  select * into f
    from formularios_preconsulta
   where slug = lower(trim(coalesce(p_slug, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception 'formulario_nao_encontrado';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email <> '' and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if length(v_telefone) > 30 then
    raise exception 'telefone_invalido';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'sem_respostas';
  end if;

  -- pontuação por tipo (mesmas regras do app, questionariosUtil.pontuarPergunta); só respostas válidas contam e são gravadas
  for v_pergunta in select value from jsonb_array_elements(f.perguntas) loop
    if jsonb_typeof(v_pergunta) <> 'object' then
      continue;
    end if;
    v_id := v_pergunta ->> 'id';
    if v_id is null or v_id = '' or not (p_respostas ? v_id) then
      continue;
    end if;
    v_tipo := coalesce(v_pergunta ->> 'tipo', 'escala');
    v_resp := p_respostas -> v_id;
    if v_tipo = 'escala' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_max := case when (v_pergunta ->> 'max') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'max')::numeric else 4 end;
      v_p := least(v_max, greatest(0, round((v_resp #>> '{}')::numeric)));
      v_respostas := v_respostas || jsonb_build_object(v_id, v_p);
      v_pontos := v_pontos + v_p;
      v_n := v_n + 1;
    elsif v_tipo = 'sim_nao' then
      if jsonb_typeof(v_resp) <> 'boolean' then
        continue;
      end if;
      if (v_resp #>> '{}')::boolean then
        v_pontos := v_pontos + case when (v_pergunta ->> 'pontos_sim') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'pontos_sim')::numeric else 1 end;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, (v_resp #>> '{}')::boolean);
      v_n := v_n + 1;
    elsif v_tipo = 'multipla' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_n_opcoes := case when jsonb_typeof(v_pergunta -> 'opcoes') = 'array' then jsonb_array_length(v_pergunta -> 'opcoes') else 0 end;
      v_idx := floor((v_resp #>> '{}')::numeric)::integer;
      if v_idx < 0 or v_idx >= v_n_opcoes or (v_resp #>> '{}')::numeric <> v_idx then
        continue;
      end if;
      v_pontos := v_pontos + case when ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos') ~ '^-?[0-9]+(\.[0-9]+)?$'
                                  then greatest(0, ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos')::numeric) else 0 end;
      v_respostas := v_respostas || jsonb_build_object(v_id, v_idx);
      v_n := v_n + 1;
    else
      if jsonb_typeof(v_resp) <> 'string' then
        continue;
      end if;
      v_texto := trim(v_resp #>> '{}');
      if v_texto = '' then
        continue;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, left(v_texto, 500));
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception 'sem_respostas';
  end if;

  -- rate limit simples por formulário: 30 respostas na última hora (conta também as da lixeira)
  select count(*) into v_qtd
    from respostas_preconsulta
   where formulario_id = f.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitas_respostas';
  end if;

  v_pontos := round(v_pontos, 2);
  for v_faixa in select value from jsonb_array_elements(f.faixas) loop
    if jsonb_typeof(v_faixa) <> 'object' then
      continue;
    end if;
    v_fmin := case when (v_faixa ->> 'min') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'min')::numeric end;
    v_fmax := case when (v_faixa ->> 'max') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'max')::numeric end;
    if v_fmin is null or v_fmax is null then
      continue;
    end if;
    if v_pontos >= least(v_fmin, v_fmax) and v_pontos <= greatest(v_fmin, v_fmax) then
      v_nivel := case when (v_faixa ->> 'nivel') in ('baixo', 'moderado', 'alto') then v_faixa ->> 'nivel' else 'baixo' end;
      v_rotulo := left(trim(coalesce(v_faixa ->> 'rotulo', '')), 60);
      if v_rotulo = '' then
        v_rotulo := initcap(v_nivel);
      end if;
      exit;
    end if;
  end loop;

  insert into respostas_preconsulta (nutricionista_id, formulario_id, titulo, perguntas, faixas, respostas, pontuacao, faixa, nivel, nome, email, telefone)
  values (f.nutricionista_id, f.id, f.titulo, f.perguntas, f.faixas, v_respostas, v_pontos, v_rotulo, v_nivel, v_nome, v_email, v_telefone)
  returning id into v_novo_id;

  return jsonb_build_object('id', v_novo_id, 'pontuacao', v_pontos, 'faixa', v_rotulo, 'nivel', v_nivel);
end;
$function$;

CREATE OR REPLACE FUNCTION {schema}.preconsulta_responder(p_slug text, p_nome text, p_email text, p_telefone text, p_respostas jsonb, p_consentimento text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO '{schema}', 'public'
AS $function$
declare
  f record;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_pergunta jsonb;
  v_id text;
  v_tipo text;
  v_resp jsonb;
  v_texto text;
  v_max numeric;
  v_p numeric;
  v_idx integer;
  v_n_opcoes integer;
  v_n integer := 0;
  v_pontos numeric := 0;
  v_respostas jsonb := '{}'::jsonb;
  v_faixa jsonb;
  v_fmin numeric;
  v_fmax numeric;
  v_rotulo text := '';
  v_nivel text := '';
  v_qtd integer;
  v_novo_id uuid;
  v_consentimento text;  -- hml-12 (H-30): a versão vigente (null = desligado)
begin
  perform {schema}.limite_publico('preconsulta_responder', 20, 'muitas_respostas');  -- hml-05c: limite por IP
  -- hml-12 (H-30): com os textos ligados, o visitante consente (a versão vigente) antes de enviar; fica gravado na resposta
  v_consentimento := {schema}.versao_dos_textos();
  if v_consentimento is not null and p_consentimento is distinct from v_consentimento then
    raise exception 'sem_consentimento';
  end if;
  select * into f
    from formularios_preconsulta
   where slug = lower(trim(coalesce(p_slug, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception 'formulario_nao_encontrado';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email <> '' and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if length(v_telefone) > 30 then
    raise exception 'telefone_invalido';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'sem_respostas';
  end if;

  -- pontuação por tipo (mesmas regras do app, questionariosUtil.pontuarPergunta); só respostas válidas contam e são gravadas
  for v_pergunta in select value from jsonb_array_elements(f.perguntas) loop
    if jsonb_typeof(v_pergunta) <> 'object' then
      continue;
    end if;
    v_id := v_pergunta ->> 'id';
    if v_id is null or v_id = '' or not (p_respostas ? v_id) then
      continue;
    end if;
    v_tipo := coalesce(v_pergunta ->> 'tipo', 'escala');
    v_resp := p_respostas -> v_id;
    if v_tipo = 'escala' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_max := case when (v_pergunta ->> 'max') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'max')::numeric else 4 end;
      v_p := least(v_max, greatest(0, round((v_resp #>> '{}')::numeric)));
      v_respostas := v_respostas || jsonb_build_object(v_id, v_p);
      v_pontos := v_pontos + v_p;
      v_n := v_n + 1;
    elsif v_tipo = 'sim_nao' then
      if jsonb_typeof(v_resp) <> 'boolean' then
        continue;
      end if;
      if (v_resp #>> '{}')::boolean then
        v_pontos := v_pontos + case when (v_pergunta ->> 'pontos_sim') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'pontos_sim')::numeric else 1 end;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, (v_resp #>> '{}')::boolean);
      v_n := v_n + 1;
    elsif v_tipo = 'multipla' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_n_opcoes := case when jsonb_typeof(v_pergunta -> 'opcoes') = 'array' then jsonb_array_length(v_pergunta -> 'opcoes') else 0 end;
      v_idx := floor((v_resp #>> '{}')::numeric)::integer;
      if v_idx < 0 or v_idx >= v_n_opcoes or (v_resp #>> '{}')::numeric <> v_idx then
        continue;
      end if;
      v_pontos := v_pontos + case when ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos') ~ '^-?[0-9]+(\.[0-9]+)?$'
                                  then greatest(0, ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos')::numeric) else 0 end;
      v_respostas := v_respostas || jsonb_build_object(v_id, v_idx);
      v_n := v_n + 1;
    else
      if jsonb_typeof(v_resp) <> 'string' then
        continue;
      end if;
      v_texto := trim(v_resp #>> '{}');
      if v_texto = '' then
        continue;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, left(v_texto, 500));
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception 'sem_respostas';
  end if;

  -- rate limit simples por formulário: 30 respostas na última hora (conta também as da lixeira)
  select count(*) into v_qtd
    from respostas_preconsulta
   where formulario_id = f.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitas_respostas';
  end if;

  v_pontos := round(v_pontos, 2);
  for v_faixa in select value from jsonb_array_elements(f.faixas) loop
    if jsonb_typeof(v_faixa) <> 'object' then
      continue;
    end if;
    v_fmin := case when (v_faixa ->> 'min') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'min')::numeric end;
    v_fmax := case when (v_faixa ->> 'max') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'max')::numeric end;
    if v_fmin is null or v_fmax is null then
      continue;
    end if;
    if v_pontos >= least(v_fmin, v_fmax) and v_pontos <= greatest(v_fmin, v_fmax) then
      v_nivel := case when (v_faixa ->> 'nivel') in ('baixo', 'moderado', 'alto') then v_faixa ->> 'nivel' else 'baixo' end;
      v_rotulo := left(trim(coalesce(v_faixa ->> 'rotulo', '')), 60);
      if v_rotulo = '' then
        v_rotulo := initcap(v_nivel);
      end if;
      exit;
    end if;
  end loop;

  insert into respostas_preconsulta (nutricionista_id, formulario_id, titulo, perguntas, faixas, respostas, pontuacao, faixa, nivel, nome, email, telefone,
                                     consentimento_versao, consentimento_em)
  values (f.nutricionista_id, f.id, f.titulo, f.perguntas, f.faixas, v_respostas, v_pontos, v_rotulo, v_nivel, v_nome, v_email, v_telefone,
          v_consentimento, case when v_consentimento is not null then now() end)
  returning id into v_novo_id;

  return jsonb_build_object('id', v_novo_id, 'pontuacao', v_pontos, 'faixa', v_rotulo, 'nivel', v_nivel);
end;
$function$;

comment on function {schema}.preconsulta_responder(text, text, text, text, jsonb, text) is
  'hml-12 (H-30): a pré-consulta pública com o consentimento do visitante (= a versão vigente), gravado na resposta. Versão desligada = a de 5 argumentos.';
revoke all on function {schema}.preconsulta_responder(text, text, text, text, jsonb, text) from public;
grant execute on function {schema}.preconsulta_responder(text, text, text, text, jsonb, text) to anon, authenticated;

-- ============================================================================================================
-- 9. Cadastro pelo link (/c/:codigo): menor de 16 volta com o código limpo para a tela (a trava de verdade é o gatilho abaixo)
-- ============================================================================================================
CREATE OR REPLACE FUNCTION {schema}.cadastro_link_enviar(p_codigo text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_dono_user uuid;
  v_dono_conta uuid;
  v_nome text := left(regexp_replace(btrim(coalesce(v_d ->> 'nome', '')), '\s+', ' ', 'g'), 120);
  v_apelido text := nullif(left(regexp_replace(btrim(coalesce(v_d ->> 'apelido', '')), '\s+', ' ', 'g'), 60), '');
  v_email text := nullif(lower(btrim(coalesce(v_d ->> 'email', ''))), '');
  v_tel text := nullif(regexp_replace(coalesce(v_d ->> 'telefone', ''), '\D', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(v_d ->> 'cpf', ''), '\D', '', 'g'), '');
  v_genero text := nullif(lower(btrim(coalesce(v_d ->> 'genero', ''))), '');
  v_obs text := nullif(left(btrim(coalesce(v_d ->> 'observacoes', '')), 2000), '');
  v_nasc date;
  v_qtd integer;
  v_id uuid;
begin
  select d.user_id, d.conta_id into v_dono_user, v_dono_conta from {schema}.w13_dono_do_codigo(p_codigo) d;
  if v_dono_user is null then return jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'); end if;
  if length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 160) then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if v_tel is not null and length(v_tel) not in (10, 11) then return jsonb_build_object('ok', false, 'erro', 'telefone_invalido'); end if;
  if v_cpf is not null and length(v_cpf) <> 11 then return jsonb_build_object('ok', false, 'erro', 'cpf_invalido'); end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then return jsonb_build_object('ok', false, 'erro', 'genero_invalido'); end if;
  if nullif(btrim(coalesce(v_d ->> 'nascimento', '')), '') is not null then
    begin
      v_nasc := (v_d ->> 'nascimento')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    end;
    if v_nasc > current_date or v_nasc < date '1900-01-01' then return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido'); end if;
  end if;
  -- hml-12 (H-30): com os textos ligados, menor de 16 volta com o código limpo para a tela (a trava é o gatilho idade_minima_guarda)
  if v_nasc is not null and {schema}.versao_dos_textos() is not null and {schema}.idade_em(v_nasc) < 16 then
    return jsonb_build_object('ok', false, 'erro', 'menor_de_16');
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
                and ((v_cpf is not null and cp.cpf = v_cpf)
                  or (v_email is not null and cp.email = v_email)
                  or (v_tel is not null and cp.telefone = v_tel and lower(cp.nome) = lower(v_nome)))) then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_repetido');
  end if;
  -- hml-05b (H-18): e-mail ou CPF que já é de um aluno vira cadastro pendente como os outros — quem preenche o link não fica
  -- sabendo se a pessoa já é aluna em alguma conta; o profissional vê o aviso ao aprovar (o gatilho pacientes_unicos_email_cpf
  -- recusa com paciente_email_repetido / paciente_cpf_repetido, que o painel já mostra).
  insert into {schema}.cadastros_pendentes (nutricionista_id, conta_id, nome, apelido, nascimento, telefone, cpf, email, genero, observacoes)
  values (v_dono_user, v_dono_conta, v_nome, v_apelido, v_nasc, v_tel, v_cpf, v_email, v_genero, v_obs)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

-- ============================================================================================================
-- 9b. Alunos › Pendentes › Aprovar: menor de 16 volta com o código limpo ({"ok": false, "erro": "menor_de_16"}), antes da matrícula
-- ============================================================================================================
CREATE OR REPLACE FUNCTION {schema}.aluno_pendente_decidir(p_conta uuid, p_pendente uuid, p_aprovar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cp {schema}.cadastros_pendentes%rowtype;
  v_c {schema}.contas%rowtype;
  v_mods text[];
  v_personal uuid;
  v_nutri uuid;
  v_id uuid;
  v_rep text[];
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
  -- hml-12 (H-30): com os textos ligados, menor de 16 não vira aluno: o erro limpo, antes de criar a matrícula (o gatilho
  -- idade_minima_guarda recusaria o insert com uma exceção, e a função alunos responderia erro_interno)
  if {schema}.versao_dos_textos() is not null and {schema}.idade_em(v_cp.nascimento) < 16 then
    return jsonb_build_object('ok', false, 'erro', 'menor_de_16');
  end if;
  -- W16b: o e-mail/CPF do cadastro não pode ser de outro aluno (alguém pode ter cadastrado a pessoa depois do pedido)
  select coalesce(array_agg(distinct c order by c), '{}') into v_rep
    from {schema}.paciente_conflitos_novos(null, false, null, null, null, null, v_cp.email, v_cp.cpf) c;
  if cardinality(v_rep) > 0 then
    return jsonb_build_object('ok', false, 'erro', case when 'email' = any(v_rep) then 'email_repetido' else 'cpf_repetido' end,
                              'campos', to_jsonb(v_rep));
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
$function$;

-- ============================================================================================================
-- 10. A trava da idade: menor de 16 em pacientes e cadastros_pendentes; menor de 18 na matrícula do aluno sem profissional.
--     Só com a versão ligada e só quando a data (ou a conta) muda: um cadastro antigo não trava outras edições.
-- ============================================================================================================
create or replace function {schema}.idade_minima_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_idade integer;
begin
  if {schema}.versao_dos_textos() is null or new.nascimento is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then   -- IF aninhado: no INSERT o OLD é nulo
    if new.nascimento is not distinct from old.nascimento and new.conta_id is not distinct from old.conta_id then
      return new;
    end if;
  end if;
  v_idade := {schema}.idade_em(new.nascimento);
  if v_idade < 16 then
    raise exception 'menor_de_16' using errcode = 'P0001';
  end if;
  if tg_table_name = 'pacientes' and new.conta_id = {schema}.conta_do_app() and v_idade < 18 then
    raise exception 'menor_de_18' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function {schema}.idade_minima_guarda() from public, anon, authenticated;
drop trigger if exists trg_pacientes_idade_minima on {schema}.pacientes;
create trigger trg_pacientes_idade_minima before insert or update of nascimento, conta_id on {schema}.pacientes
  for each row execute function {schema}.idade_minima_guarda();
drop trigger if exists trg_cadastros_pendentes_idade_minima on {schema}.cadastros_pendentes;
create trigger trg_cadastros_pendentes_idade_minima before insert or update of nascimento, conta_id on {schema}.cadastros_pendentes
  for each row execute function {schema}.idade_minima_guarda();

-- ============================================================================================================
-- 11. O consentimento do responsável (painel › ficha do aluno › Dados do aluno), a mesma guarda do "Editar dados"
-- ============================================================================================================
create or replace function {schema}.aluno_responsavel(p_aluno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
  v_idade integer;
  v_atual jsonb;
begin
  begin
    v_id := {schema}.w14_matricula_da_rota(p_aluno);
  exception when raise_exception then   -- sem_login, sem_acesso, aluno_inexistente
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end;
  select {schema}.idade_em(p.nascimento) into v_idade from {schema}.pacientes p where p.id = v_id;
  select case when a.evento = 'aceitou' then jsonb_build_object(
             'nome', a.responsavel_nome, 'vinculo', a.responsavel_vinculo, 'forma', a.responsavel_forma, 'em', a.em,
             'por', {schema}.nome_da_pessoa(a.registrado_por)) end
    into v_atual
    from {schema}.aceites a
   where a.paciente_id = v_id and a.documento = 'responsavel'
   order by a.em desc, a.id desc limit 1;
  return jsonb_build_object(
    'ok', true,
    'ligado', {schema}.versao_dos_textos() is not null,
    'faixa', case when v_idade is null then null when v_idade < 16 then 'menor_16' when v_idade < 18 then '16_17' else 'adulto' end,
    'pode_editar', {schema}.w14_pode_editar(v_id),
    'atual', v_atual);
end;
$$;
comment on function {schema}.aluno_responsavel(uuid) is
  'hml-12 (H-30): o consentimento do responsável do aluno (16-17) na ficha: {ok, ligado, faixa, pode_editar, atual} ou {ok: false, erro: sem_acesso}.';
revoke all on function {schema}.aluno_responsavel(uuid) from public, anon;
grant execute on function {schema}.aluno_responsavel(uuid) to authenticated;

create or replace function {schema}.aluno_responsavel_registrar(p_aluno uuid, p_dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_versao text := {schema}.versao_dos_textos();
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_id uuid;
  v_conta uuid;
  v_idade integer;
  v_acao text;
  v_nome text;
  v_vinculo text;
  v_forma text;
  v_origem text;
begin
  begin
    v_id := {schema}.w14_matricula_da_rota(p_aluno);
  exception when raise_exception then   -- sem_login, sem_acesso, aluno_inexistente
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end;
  if not {schema}.w14_pode_editar(v_id) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if v_versao is null then
    return jsonb_build_object('ok', false, 'erro', 'textos_desligados');
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  if jsonb_typeof(d) = 'object' then
    v_acao := d ->> 'acao';
    v_nome := regexp_replace(btrim(coalesce(d ->> 'nome', '')), '\s+', ' ', 'g');
    v_vinculo := d ->> 'vinculo';
    v_forma := d ->> 'forma';
    v_origem := d ->> 'origem';
  end if;
  select p.conta_id, {schema}.idade_em(p.nascimento) into v_conta, v_idade from {schema}.pacientes p where p.id = v_id;

  if v_acao = 'registrar' then
    if v_idade is null or v_idade not between 16 and 17 then
      return jsonb_build_object('ok', false, 'erro', 'nao_e_16_17');
    end if;
    if coalesce(char_length(v_nome), 0) not between 2 and 120 then
      return jsonb_build_object('ok', false, 'erro', 'nome_invalido');
    end if;
    if v_vinculo is null or v_vinculo not in ('mae', 'pai', 'responsavel_legal') then
      return jsonb_build_object('ok', false, 'erro', 'vinculo_invalido');
    end if;
    if v_forma is null or v_forma not in ('presencial', 'documento_assinado', 'mensagem_escrita') then
      return jsonb_build_object('ok', false, 'erro', 'forma_invalida');
    end if;
    if (d -> 'confirmo') is distinct from 'true'::jsonb then
      return jsonb_build_object('ok', false, 'erro', 'falta_confirmar');
    end if;
    if v_origem is null or v_origem not in ('site', 'apk', 'loja') then
      return jsonb_build_object('ok', false, 'erro', 'origem_invalida');
    end if;
    insert into {schema}.aceites (documento, evento, versao, paciente_id, conta_id, registrado_por,
                                  responsavel_nome, responsavel_vinculo, responsavel_forma, origem)
    values ('responsavel', 'aceitou', v_versao, v_id, v_conta, v_uid, v_nome, v_vinculo, v_forma, v_origem);
  elsif v_acao = 'retirar' then
    if not {schema}.responsavel_vigente(v_id) then
      return jsonb_build_object('ok', false, 'erro', 'sem_registro_vigente');
    end if;
    if v_origem is null or v_origem not in ('site', 'apk', 'loja') then
      return jsonb_build_object('ok', false, 'erro', 'origem_invalida');
    end if;
    insert into {schema}.aceites (documento, evento, versao, paciente_id, conta_id, registrado_por, origem)
    values ('responsavel', 'revogou', v_versao, v_id, v_conta, v_uid, v_origem);
  else
    return jsonb_build_object('ok', false, 'erro', 'acao_invalida');
  end if;
  return {schema}.aluno_responsavel(p_aluno);
end;
$$;
comment on function {schema}.aluno_responsavel_registrar(uuid, jsonb) is
  'hml-12 (H-30): registra (16-17) ou retira o consentimento do responsável; quem pode editar o aluno. Devolve o mesmo da aluno_responsavel ou {ok: false, erro}.';
revoke all on function {schema}.aluno_responsavel_registrar(uuid, jsonb) from public, anon;
grant execute on function {schema}.aluno_responsavel_registrar(uuid, jsonb) to authenticated;

-- ============================================================================================================
-- 12. Exportar meus dados: + 'aceites' (o corpo vivo + 1 consulta)
-- ============================================================================================================
CREATE OR REPLACE FUNCTION {schema}.exportar_dados_aluno(p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
  v_planos uuid[];
  v_refeicoes uuid[];
  v_login jsonb;
  v_perfil jsonb;
  v_matriculas jsonb;
  v_tabelas jsonb := '{}'::jsonb;
  v_aceites jsonb;  -- hml-12 (H-30)
begin
  if p_uid is null then
    raise exception 'exportar_dados_aluno: p_uid obrigatório';
  end if;
  select jsonb_build_object(
           'id', u.id, 'email', u.email, 'telefone', u.phone, 'criado_em', u.created_at, 'ultimo_login', u.last_sign_in_at,
           'email_confirmado_em', u.email_confirmed_at,
           'entra_com', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '[]'::jsonb),
           'nome_no_login', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
           'foto_no_login', coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'))
    into v_login from auth.users u where u.id = p_uid;
  select to_jsonb(p) - array['carimbo_url', 'recebimento', 'codigo_cadastro'] into v_perfil from {schema}.profiles p where p.id = p_uid;

  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from {schema}.pacientes p where p.user_id = p_uid and p.deleted_at is null;
  select coalesce(jsonb_agg((to_jsonb(p) - array['busca', 'resumo', 'link_codigo']) || jsonb_build_object(
           'conta_nome', c.nome,
           'personal_nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id),
           'nutricionista_nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id),
           'plano_aluno_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id))
         order by p.created_at), '[]'::jsonb)
    into v_matriculas
    from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
   where p.id = any(v_ids);

  select coalesce(array_agg(pl.id), array[]::uuid[]) into v_planos from {schema}.planos_alimentares pl where pl.paciente_id = any(v_ids) and pl.deleted_at is null;
  select coalesce(array_agg(r.id), array[]::uuid[]) into v_refeicoes from {schema}.refeicoes r where r.plano_id = any(v_planos);

  v_tabelas := jsonb_build_object(
    'agendamentos', (select coalesce(jsonb_agg(to_jsonb(t) - array['observacao'] order by t.inicio), '[]') from {schema}.agendamentos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'consultas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.consultas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'planos_alimentares', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.planos_alimentares t where t.id = any(v_planos)),
    'refeicoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.plano_id, t.ordem), '[]') from {schema}.refeicoes t where t.id = any(v_refeicoes)),
    'itens_refeicao', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('alimento', al.nome) order by t.refeicao_id, t.ordem), '[]')
                         from {schema}.itens_refeicao t left join {schema}.alimentos al on al.id = t.alimento_id where t.refeicao_id = any(v_refeicoes)),
    'orientacoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.orientacoes t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'metas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.metas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'metas_concluidas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.metas_concluidas t where t.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.refeicoes_concluidas t where t.paciente_id = any(v_ids)),
    'diario_alimentar', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.data_hora), '[]') from {schema}.diario_alimentar t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'registros_diarios', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.registros_diarios t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'antropometrias', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.antropometrias t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'calculos_energeticos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.calculos_energeticos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'fotos_evolucao', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.data), '[]') from {schema}.fotos_evolucao t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'anamneses', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.anamneses t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'respostas_questionario', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.respostas_questionario t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'respostas_preconsulta', (select coalesce(jsonb_agg(to_jsonb(t) order by t.respondido_em), '[]') from {schema}.respostas_preconsulta t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'pedidos_exame', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.pedidos_exame t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'resultados_exame', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.resultados_exame t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'suplementos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.indicacoes_produto t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'formulas_manipuladas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.formulas_manipuladas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'medicamentos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.medicamentos_paciente t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'analises_farmaco', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.analises_farmaco t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'avaliacoes_integradas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.avaliacoes_integradas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'gestacoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.gestacoes t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'registros_gestacionais', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.registros_gestacionais t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'documentos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.documentos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'anexos', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.created_at), '[]') from {schema}.anexos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'cobrancas', (select coalesce(jsonb_agg((to_jsonb(t) - array['pix_qr', 'pix_copia_cola', 'comprovante_path'])
                                             || jsonb_build_object('tem_comprovante', t.comprovante_path is not null) order by t.created_at), '[]')
                    from {schema}.cobrancas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'recibos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.recibos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'assinaturas', (select coalesce(jsonb_agg(to_jsonb(t) - array['payload'] order by t.criado_em), '[]') from {schema}.aluno_assinaturas t where t.paciente_id = any(v_ids)),
    'mensagens_whatsapp', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.mensagens_whatsapp t where t.paciente_id = any(v_ids)),
    'cadastros_pendentes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.cadastros_pendentes t where t.paciente_id = any(v_ids)),
    'avisos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em), '[]') from {schema}.avisos t where t.destino_user_id = p_uid));

  -- hml-12 (H-30): os aceites do titular e os do responsável pelas matrículas dele (sem quem registrou)
  select coalesce(jsonb_agg(to_jsonb(a) - 'registrado_por' order by a.em, a.id), '[]'::jsonb) into v_aceites
    from {schema}.aceites a where a.user_id = p_uid or a.paciente_id = any(v_ids);

  return jsonb_build_object('login', v_login, 'perfil', v_perfil, 'matriculas', v_matriculas, 'tabelas', v_tabelas,
                            'aceites', v_aceites);
end;
$function$;

-- ============================================================================================================
-- 13. Conferência: senão o bloco inteiro volta
-- ============================================================================================================
do $$
declare
  v_t regclass := to_regclass('{schema}.aceites');
  v_papel text;
  v_f text;
  v_oid regprocedure;
  v_versao text;
  v_j jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
begin
  -- a tabela: RLS ligada, nenhuma policy, nenhum privilégio da API; o índice do "1 aceite por versão"; o backup lê
  if v_t is null then
    raise exception 'hml-12: {schema}.aceites não existe';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = v_t and c.relrowsecurity) then
    raise exception 'hml-12: {schema}.aceites sem RLS';
  end if;
  if exists (select 1 from pg_catalog.pg_policy p where p.polrelid = v_t) then
    raise exception 'hml-12: {schema}.aceites tem policy (não deveria ter nenhuma)';
  end if;
  foreach v_papel in array array['public', 'anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_table_privilege(v_papel, v_t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or pg_catalog.has_any_column_privilege(v_papel, v_t, 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'hml-12: {schema}.aceites com privilégio para %', v_papel;
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indexrelid
                  where i.indrelid = v_t and i.indisunique and c.relname = 'aceites_textos_um_por_versao') then
    raise exception 'hml-12: {schema}.aceites sem o índice único aceites_textos_um_por_versao';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'physiq_backup')
     and not pg_catalog.has_table_privilege('physiq_backup', v_t, 'SELECT') then
    raise exception 'hml-12: o backup (physiq_backup) não lê {schema}.aceites';
  end if;
  if (select count(*) from pg_catalog.pg_attribute a
       where a.attrelid = '{schema}.respostas_preconsulta'::regclass and not a.attisdropped
         and a.attname in ('consentimento_versao', 'consentimento_em')) <> 2 then
    raise exception 'hml-12: faltam as colunas do consentimento em {schema}.respostas_preconsulta';
  end if;

  -- auxiliares e o gatilho: ninguém da API executa
  foreach v_f in array array['{schema}.versao_dos_textos()', '{schema}.idade_em(date)', '{schema}.saude_vigente(uuid)',
                             '{schema}.responsavel_vigente(uuid)', '{schema}.legal_da_situacao(uuid)',
                             '{schema}.idade_minima_guarda()'] loop
    v_oid := to_regprocedure(v_f);
    if v_oid is null then
      raise exception 'hml-12: % não existe', v_f;
    end if;
    foreach v_papel in array array['public', 'anon', 'authenticated'] loop
      if pg_catalog.has_function_privilege(v_papel, v_oid, 'EXECUTE') then
        raise exception 'hml-12: % executável por %', v_f, v_papel;
      end if;
    end loop;
  end loop;
  -- as RPCs com login: só authenticated (o visitante não); o exportar e o cadastro pelo link seguem só do servidor
  foreach v_f in array array['{schema}.aceitar_no_acesso(text, text, boolean, date, text)',
                             '{schema}.entrar_sem_profissional(text, text, date, text, text)',
                             '{schema}.entrar_sem_profissional(text, text)', '{schema}.minha_situacao()',
                             '{schema}.aluno_pendente_decidir(uuid, uuid, boolean)',
                             '{schema}.aluno_responsavel(uuid)', '{schema}.aluno_responsavel_registrar(uuid, jsonb)'] loop
    v_oid := to_regprocedure(v_f);
    if v_oid is null then
      raise exception 'hml-12: % não existe', v_f;
    end if;
    if pg_catalog.has_function_privilege('public', v_oid, 'EXECUTE') or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'hml-12: % fora do esperado (só authenticated)', v_f;
    end if;
  end loop;
  foreach v_f in array array['{schema}.exportar_dados_aluno(uuid)', '{schema}.cadastro_link_enviar(text, jsonb)'] loop
    v_oid := to_regprocedure(v_f);
    if v_oid is null or pg_catalog.has_function_privilege('public', v_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'hml-12: % fora do esperado (só o servidor)', v_f;
    end if;
  end loop;
  -- as 2 preconsulta_responder: visitante e logado (PUBLIC não)
  foreach v_f in array array['{schema}.preconsulta_responder(text, text, text, text, jsonb)',
                             '{schema}.preconsulta_responder(text, text, text, text, jsonb, text)'] loop
    v_oid := to_regprocedure(v_f);
    if v_oid is null or pg_catalog.has_function_privilege('public', v_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'hml-12: % fora do esperado (visitante e logado)', v_f;
    end if;
  end loop;
  -- as novas: SECURITY DEFINER (menos a idade_em, que só faz a conta), search_path fixo, dono postgres; as que gravam VOLATILE
  for r in
    select x.f, x.vol, p.oid, p.prosecdef, p.provolatile::text as provolatile, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) as dono
      from (values ('{schema}.versao_dos_textos()', 's'), ('{schema}.idade_em(date)', 's'), ('{schema}.saude_vigente(uuid)', 's'),
                   ('{schema}.responsavel_vigente(uuid)', 's'), ('{schema}.legal_da_situacao(uuid)', 's'),
                   ('{schema}.idade_minima_guarda()', 'v'), ('{schema}.aceitar_no_acesso(text, text, boolean, date, text)', 'v'),
                   ('{schema}.entrar_sem_profissional(text, text, date, text, text)', 'v'), ('{schema}.aluno_responsavel(uuid)', 's'),
                   ('{schema}.aluno_responsavel_registrar(uuid, jsonb)', 'v'),
                   ('{schema}.preconsulta_responder(text, text, text, text, jsonb, text)', 'v')) as x(f, vol)
      left join pg_catalog.pg_proc p on p.oid = to_regprocedure(x.f)
  loop
    if r.oid is null then
      raise exception 'hml-12: % não existe', r.f;
    end if;
    if r.prosecdef is distinct from (r.f <> '{schema}.idade_em(date)') or r.provolatile <> r.vol or r.dono <> 'postgres'
       or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%') then
      raise exception 'hml-12: % fora do esperado (SECURITY DEFINER, volatilidade %, search_path fixo, dono postgres)', r.f, r.vol;
    end if;
  end loop;

  -- a versão: staging ligada (= VERSAO_TEXTOS do app), public desligada
  select a.valor ->> 'versao' into v_versao from {schema}.app_config a where a.chave = 'textos_legais';
  if not found then
    raise exception 'hml-12: falta a chave textos_legais em {schema}.app_config';
  end if;
  if v_versao is distinct from (case when '{schema}' = 'staging' then '2026-10-08' end)
     or {schema}.versao_dos_textos() is distinct from v_versao then
    raise exception 'hml-12: textos_legais.versao = % (esperado: % em {schema})', coalesce(v_versao, 'null'),
      (case when '{schema}' = 'staging' then '2026-10-08' else 'null' end);
  end if;

  -- os 2 gatilhos ligados
  foreach v_f in array array['{schema}.pacientes', '{schema}.cadastros_pendentes'] loop
    if not exists (select 1 from pg_catalog.pg_trigger t
                    where t.tgrelid = v_f::regclass and t.tgfoid = '{schema}.idade_minima_guarda()'::regprocedure
                      and t.tgenabled <> 'D' and not t.tgisinternal) then
      raise exception 'hml-12: falta o gatilho da idade em %', v_f;
    end if;
  end loop;

  -- as trocas nos corpos que mudaram
  if (select count(*) from pg_catalog.pg_proc p
       where (p.oid = '{schema}.minha_situacao()'::regprocedure and position('legal_da_situacao(v_uid)' in p.prosrc) > 0)
          or (p.oid = '{schema}.exportar_dados_aluno(uuid)'::regprocedure and position('''aceites'', v_aceites' in p.prosrc) > 0)
          or (p.oid = '{schema}.entrar_sem_profissional(text, text)'::regprocedure and position('atualize_o_app' in p.prosrc) > 0)
          or (p.oid = '{schema}.preconsulta_responder(text, text, text, text, jsonb)'::regprocedure and position('sem_consentimento' in p.prosrc) > 0)
          or (p.oid = '{schema}.cadastro_link_enviar(text, jsonb)'::regprocedure and position('menor_de_16' in p.prosrc) > 0)
          or (p.oid = '{schema}.aluno_pendente_decidir(uuid, uuid, boolean)'::regprocedure and position('menor_de_16' in p.prosrc) > 0)) <> 6 then
    raise exception 'hml-12: uma das 6 funções que mudam ficou sem a troca';
  end if;

  -- as contas da idade e a situação de um login que não existe (roda os corpos): staging ligado, public desligado
  if {schema}.idade_em((v_hoje - interval '16 years')::date) <> 16 or {schema}.idade_em((v_hoje - interval '16 years')::date + 1) <> 15
     or {schema}.idade_em((v_hoje - interval '18 years')::date) <> 18 or {schema}.idade_em(null) is not null then
    raise exception 'hml-12: idade_em fora do esperado';
  end if;
  v_j := {schema}.legal_da_situacao('00000000-0000-4000-8000-0000000000aa'::uuid);
  if v_j is distinct from (case when '{schema}' = 'staging'
       then jsonb_build_object('versao', '2026-10-08', 'aceite_pendente', true, 'saude_pendente', false,
                               'nascimento_pendente', false, 'menor', null)
       else jsonb_build_object('versao', null) end) then
    raise exception 'hml-12: legal_da_situacao de um login que não existe = %', v_j;
  end if;
end
$$;
