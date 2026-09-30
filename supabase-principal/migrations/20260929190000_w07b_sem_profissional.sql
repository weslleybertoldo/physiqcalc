-- Physiq W7b — aluno SEM profissional no BANCO PRINCIPAL (hkxvtsbwctxkrqzkkdoz). Idempotente. Regra dele (29/09 ~17:10–17:55,
-- plano mestre seção 2): "sem profissional vinculado ele paga a mensalidade do app que será pago para mim na minha conta mercado
-- pago" · "aluno sem professor terá valor único de 29,90 podendo usar treinos; se quiser incluir alimentação e treino 49,90" ·
-- 7 dias grátis · sem pagar o app bloqueia · treinos prontos e pratos prontos pelo objetivo. Muda a spec C8/C99/§4.2.
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929190000_w07b_sem_profissional.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929190000_w07b_sem_profissional.sql --so public
--
-- Desenho (reaproveita TODA a cobrança da W6 — pagamentos-aluno, mp-webhook-aluno, faixa, trava do inadimplente, Pagamentos):
--   · "conta do app" (contas.origem = 'app', uma por schema): dona = o master, isenta (o master não paga — C93), recebimento pelo
--     Mercado Pago (o MP do master é o das funções), "bloquear o app do inadimplente" LIGADO (R15);
--   · planos do app = planos_aluno da conta do app com código e módulos: Treino (R$ 29,90, módulo treino) e Treino + Alimentação
--     (R$ 49,90, treino + nutricao). Preços editáveis (o master, W27) — a matrícula guarda o valor do plano escolhido;
--   · o aluno sem profissional vira matrícula da conta do app (sem personal e sem nutricionista: os módulos vêm do plano);
--   · 7 dias grátis: app_config 'aluno_do_app'.teste_dias (padrão 7) — o teste vai até o fim do dia hoje + N (a mesma conta do
--     "14 dias grátis" da W4) e entra na cobertura da mensalidade (mensalidade_recalcular): pagar no teste soma 1 mês a partir do
--     FIM do teste; vencido e sem pagar → "vencida" → o app fecha e só Perfil › Pagamentos abre (a trava da W6);
--   · vincular a um profissional (código/link/convite): a matrícula do app encerra (ativo = false) e a função da borda cancela a
--     assinatura do app no Mercado Pago (P7: 1 conta ativa por vez; sem reembolso automático do mês pago);
--   · o profissional tirou o aluno da lista (matrícula de conta nova ou do Calc ficou inativa/na lixeira, sem outra ativa) → volta a
--     ser aluno do app com 7 dias grátis a partir dali + aviso no sino (os dados continuam dele). O Nutri antigo segue as regras de
--     hoje até a W28 (paciente de conta legado_nutri não vira aluno do app);
--   · minha_situacao(): os módulos da matrícula do app vêm do plano; o "aluno do Calc sem professor ganha o Treino de graça" (W3)
--     SAI — quem estava assim vira aluno do app pelo script 05 (7 dias grátis a partir da W7b, com aviso);
--   · pratos prontos (tabelas novas, lidas só pela função pratos_prontos_do_app — só quem está no app com Treino + Alimentação):
--     itens da tabela TACO (alimentos) com a quantidade; kcal e macros calculados na hora.
-- Nenhum dado existente muda aqui (colunas novas, 1 conta nova, 2 planos, funções). Nada apaga aluno, treino, dieta ou cobrança.

-- ============================================================================================================
-- 1. Conta do app (origem 'app') — uma por schema
-- ============================================================================================================
alter table {schema}.contas drop constraint if exists contas_origem_check;
alter table {schema}.contas add constraint contas_origem_check check (origem in ('nova', 'legado_calc', 'legado_nutri', 'app'));
create unique index if not exists contas_app_unica on {schema}.contas ((origem)) where origem = 'app';

-- planos do app: código (a tela escolhe por ele) e módulos (o que o plano libera). Os planos dos profissionais ficam sem os dois.
alter table {schema}.planos_aluno add column if not exists codigo text;
alter table {schema}.planos_aluno add column if not exists modulos text[];
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_modulos_check;
alter table {schema}.planos_aluno add constraint planos_aluno_modulos_check
  check (modulos is null or (modulos <@ array['treino', 'nutricao']::text[] and cardinality(modulos) >= 1));
alter table {schema}.planos_aluno add column if not exists descricao text;
alter table {schema}.planos_aluno add column if not exists ordem integer not null default 0;
create unique index if not exists planos_aluno_conta_codigo_uq on {schema}.planos_aluno (conta_id, codigo) where codigo is not null;

-- matrícula do aluno do app: objetivo (as listas de treinos e pratos prontos), teste grátis e o encerramento
alter table {schema}.pacientes add column if not exists objetivo_app text;
alter table {schema}.pacientes drop constraint if exists pacientes_objetivo_app_check;
alter table {schema}.pacientes add constraint pacientes_objetivo_app_check
  check (objetivo_app is null or objetivo_app in ('emagrecer', 'manter', 'ganhar_massa'));
alter table {schema}.pacientes add column if not exists app_teste_de timestamptz;
alter table {schema}.pacientes add column if not exists app_teste_ate timestamptz;
alter table {schema}.pacientes add column if not exists app_encerrada_em timestamptz;
alter table {schema}.pacientes add column if not exists app_encerrada_motivo text;
-- o profissional tirou o aluno da lista (a matrícula dele fica inativa; o aluno vai para o app)
alter table {schema}.pacientes add column if not exists desvinculado_em timestamptz;

insert into {schema}.app_config (chave, valor, publica)
values ('aluno_do_app', jsonb_build_object('teste_dias', 7), true)
on conflict (chave) do nothing;

-- a conta do app: dona = o master (o de verdade, não a conta de teste), isenta, MP, bloqueio do inadimplente ligado
insert into {schema}.contas (nome, dono_id, origem, plano, faixa, periodicidade, situacao, isenta_motivo, tolerancia_dias,
                             cobranca_legada, regra_pix, recebimento_modo, bloquear_app_inadimplente)
select 'Physiq',
       (select p.id from {schema}.profiles p join auth.users u on u.id = p.id
         where p.role = 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') = 'master' and u.email !~* 'teste'
         order by p.created_at limit 1),
       'app', 'treino_nutricao', 'livre', 'mensal', 'isenta',
       'Conta do app: os alunos sem profissional pagam a mensalidade do app ao Physiq (Mercado Pago do master). O master não paga (C93).',
       0, false, 'mes', 'mercadopago', true
 where not exists (select 1 from {schema}.contas c where c.origem = 'app');

insert into {schema}.planos_aluno (conta_id, nome, valor, ativo, codigo, modulos, descricao, ordem)
select c.id, x.nome, x.valor, true, x.codigo, x.modulos, x.descricao, x.ordem
  from {schema}.contas c,
       (values ('app_treino', 'Treino', 29.90::numeric, array['treino']::text[],
                'Monte o seu treino ou use um treino pronto pelo seu objetivo. Funciona sem internet.', 1),
               ('app_treino_alimentacao', 'Treino + Alimentação', 49.90::numeric, array['treino', 'nutricao']::text[],
                'Tudo do Treino e mais os pratos prontos pelo seu objetivo, com calorias e macros.', 2)
       ) as x(codigo, nome, valor, modulos, descricao, ordem)
 where c.origem = 'app'
on conflict do nothing;

-- ============================================================================================================
-- 2. Auxiliares
-- ============================================================================================================
create or replace function {schema}.conta_do_app() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from {schema}.contas c where c.origem = 'app' order by c.criado_em limit 1;
$$;

create or replace function {schema}.app_teste_dias() returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0, least(60, coalesce(
    (select (a.valor ->> 'teste_dias')::integer from {schema}.app_config a
      where a.chave = 'aluno_do_app' and jsonb_typeof(a.valor -> 'teste_dias') = 'number'), 7)));
$$;

-- fim do teste grátis: o último instante do dia (São Paulo) hoje + N — "7 dias grátis" em 29/09 = grátis até 06/10 (a conta do
-- teste da W4: teste_ate = hoje + 14, com acesso até esse dia inclusive); bloqueia a partir do dia seguinte
create or replace function {schema}.app_fim_do_teste(p_inicio timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select ((((p_inicio at time zone 'America/Sao_Paulo')::date + {schema}.app_teste_dias() + 1)::timestamp)
           at time zone 'America/Sao_Paulo') - interval '1 second';
$$;

create or replace function {schema}.app_rotulo_objetivo(p_objetivo text) returns text
language sql immutable set search_path = '' as $$
  select case p_objetivo when 'emagrecer' then 'Emagrecer' when 'manter' then 'Manter a forma' when 'ganhar_massa' then 'Ganhar massa' end;
$$;

-- quem é master aqui: o JWT (eh_master) ou o perfil deste schema (a mesma regra da minha_situacao)
create or replace function {schema}.sou_master() returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (select 1 from {schema}.profiles pr where pr.id = auth.uid() and pr.role = 'master');
$$;

-- ============================================================================================================
-- 3. Matrícula no app (a de quem entra sozinho, a de quem o profissional tirou da lista e a da migração do Calc)
--    p_motivo: entrou (Boas-vindas) · removido (o profissional tirou da lista) · migracao_calc (script 05) · master (script 05)
-- ============================================================================================================
create or replace function {schema}.matricular_no_app(p_user uuid, p_objetivo text default null, p_plano text default null,
  p_motivo text default 'entrou', p_teste boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta uuid := {schema}.conta_do_app();
  v_obj text := nullif(lower(btrim(coalesce(p_objetivo, ''))), '');
  v_plano {schema}.planos_aluno%rowtype;
  v_mat {schema}.pacientes%rowtype;
  v_nome text;
  v_email text;
  v_id uuid;
  v_fim timestamptz;
  v_ja_era boolean := false;
  v_titulo text;
begin
  if v_conta is null then
    return jsonb_build_object('ok', false, 'erro', 'app_sem_conta');
  end if;
  if v_obj is not null and v_obj not in ('emagrecer', 'manter', 'ganhar_massa') then
    return jsonb_build_object('ok', false, 'erro', 'objetivo_invalido');
  end if;
  if p_plano is not null then
    select * into v_plano from {schema}.planos_aluno where conta_id = v_conta and codigo = p_plano and ativo;
    if not found then
      return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
    end if;
  end if;
  -- P7: com profissional (matrícula ativa em outra conta) não entra no app
  if exists (select 1 from {schema}.pacientes p where p.user_id = p_user and p.deleted_at is null and p.ativo
                and p.conta_id is distinct from v_conta) then
    return jsonb_build_object('ok', false, 'erro', 'com_profissional');
  end if;
  select coalesce(nullif(btrim(pr.nome), ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name',
                  split_part(u.email, '@', 1)), u.email
    into v_nome, v_email
    from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = p_user;
  if v_email is null then
    return jsonb_build_object('ok', false, 'erro', 'usuario_inexistente');
  end if;

  select * into v_mat from {schema}.pacientes
   where user_id = p_user and conta_id = v_conta and deleted_at is null
   order by ativo desc, created_at limit 1 for update;
  if v_mat.id is not null and v_mat.ativo then
    -- já é aluno do app: só o objetivo muda por aqui (o plano muda em Perfil › Meu plano — a assinatura do MP acompanha)
    if v_obj is not null then
      update {schema}.pacientes set objetivo_app = v_obj, objetivo = {schema}.app_rotulo_objetivo(v_obj) where id = v_mat.id;
    end if;
    return jsonb_build_object('ok', true, 'paciente_id', v_mat.id, 'ja_era', true, 'teste_ate', v_mat.app_teste_ate,
                              'plano', (select pa.codigo from {schema}.planos_aluno pa where pa.id = v_mat.plano_aluno_id));
  end if;
  if v_plano.id is null then
    -- volta com o plano de antes (se ainda existe); senão o Treino
    select * into v_plano from {schema}.planos_aluno where id = v_mat.plano_aluno_id and conta_id = v_conta and ativo;
    if not found then
      select * into v_plano from {schema}.planos_aluno where conta_id = v_conta and ativo and codigo = 'app_treino';
    end if;
    if v_plano.id is null then
      return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
    end if;
  end if;
  v_fim := case when p_teste then {schema}.app_fim_do_teste(now()) end;

  if v_mat.id is not null then
    update {schema}.pacientes set
        ativo = true, app_encerrada_em = null, app_encerrada_motivo = null,
        objetivo_app = coalesce(v_obj, objetivo_app),
        objetivo = case when v_obj is not null then {schema}.app_rotulo_objetivo(v_obj) else objetivo end,
        plano_aluno_id = v_plano.id, mensalidade_valor = v_plano.valor,
        cobranca_pausada = case when p_motivo = 'master' then true else cobranca_pausada end,
        app_teste_de = case when p_teste then now() else app_teste_de end,
        app_teste_ate = case when p_teste then v_fim else app_teste_ate end,
        mensalidade_desde = coalesce(v_fim, mensalidade_desde, now())
     where id = v_mat.id;
    v_id := v_mat.id;
    v_ja_era := true;
  else
    insert into {schema}.pacientes (nutricionista_id, personal_id, conta_id, user_id, nome, email, origem, ativo, objetivo, objetivo_app,
                                    plano_aluno_id, mensalidade_valor, mensalidade_desde, cobranca_pausada, app_teste_de, app_teste_ate)
    values (null, null, v_conta, p_user, coalesce(v_nome, 'Aluno'), v_email,
            case when p_motivo in ('migracao_calc', 'master') then 'calc' else 'novo' end, true,
            {schema}.app_rotulo_objetivo(v_obj), v_obj, v_plano.id, v_plano.valor, coalesce(v_fim, now()), p_motivo = 'master',
            case when p_teste then now() end, v_fim)
    returning id into v_id;
  end if;
  perform {schema}.mensalidade_recalcular(v_id);
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_conta, 'outro', jsonb_build_object('w07b', 'aluno_do_app', 'motivo', p_motivo, 'paciente_id', v_id, 'plano', v_plano.codigo,
                                              'teste_ate', v_fim, 'voltou', v_ja_era), p_user);
  -- sino (NF9): o aviso dentro do app (o master não recebe: ele não paga)
  if p_motivo <> 'master' then
    v_titulo := case p_motivo
        when 'removido' then 'Você agora treina por conta própria no Physiq'
        when 'migracao_calc' then 'Treino sem profissional agora é plano do Physiq'
        else 'Seus dias grátis do Physiq começaram' end
      || case when v_fim is not null then ' · grátis até ' || to_char(v_fim at time zone 'America/Sao_Paulo', 'DD/MM') else '' end;
    insert into {schema}.avisos (destino_user_id, tipo, titulo, link) values (p_user, 'geral', left(v_titulo, 160), '/perfil/meu-plano');
  end if;
  perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'ja_era', v_ja_era, 'teste_ate', v_fim, 'plano', v_plano.codigo);
end;
$$;

-- Boas-vindas › "Treinar sem profissional" (o app chama; P26: no staging só contas de teste)
create or replace function {schema}.entrar_sem_profissional(p_objetivo text, p_plano text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
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
  return {schema}.matricular_no_app(v_uid, p_objetivo, p_plano, 'entrou', true);
end;
$$;

-- o que o app mostra do plano do app: os planos (preços da tabela), os dias grátis e a matrícula no app da pessoa (se tem)
create or replace function {schema}.meu_plano_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'teste_dias', {schema}.app_teste_dias(),
    'planos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', pa.codigo, 'nome', pa.nome, 'valor', pa.valor,
                                'modulos', to_jsonb(pa.modulos), 'descricao', pa.descricao) order by pa.ordem, pa.nome), '[]'::jsonb)
                 from {schema}.planos_aluno pa where pa.conta_id = {schema}.conta_do_app() and pa.ativo and pa.codigo is not null),
    'matricula', (select jsonb_build_object(
                     'paciente_id', p.id, 'ativo', p.ativo, 'plano', pa.codigo, 'plano_nome', pa.nome, 'valor', p.mensalidade_valor,
                     'modulos', to_jsonb(coalesce(pa.modulos, array['treino']::text[])), 'objetivo', p.objetivo_app,
                     'teste_de', p.app_teste_de, 'teste_ate', p.app_teste_ate, 'pago_ate', p.mensalidade_pago_ate,
                     'pausada', p.cobranca_pausada, 'encerrada_em', p.app_encerrada_em, 'encerrada_motivo', p.app_encerrada_motivo,
                     'aguardando', exists (select 1 from {schema}.cobrancas c where c.paciente_id = p.id and c.deleted_at is null
                                             and c.status = 'aguardando_confirmacao' and c.tipo = 'mensalidade'),
                     'assinatura', (select jsonb_build_object('status', s.status, 'valor', s.valor, 'proximo_vencimento', s.proximo_vencimento)
                                      from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1))
                    from {schema}.pacientes p left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
                   where p.user_id = auth.uid() and p.conta_id = {schema}.conta_do_app() and p.deleted_at is null
                   order by p.ativo desc, p.created_at desc limit 1),
    'com_profissional', exists (select 1 from {schema}.pacientes p where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
                                   and p.conta_id is distinct from {schema}.conta_do_app()));
$$;

create or replace function {schema}.mudar_objetivo_app(p_objetivo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_obj text := lower(btrim(coalesce(p_objetivo, '')));
  v_n integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  if v_obj not in ('emagrecer', 'manter', 'ganhar_massa') then
    return jsonb_build_object('ok', false, 'erro', 'objetivo_invalido');
  end if;
  update {schema}.pacientes set objetivo_app = v_obj, objetivo = {schema}.app_rotulo_objetivo(v_obj)
   where user_id = auth.uid() and conta_id = {schema}.conta_do_app() and deleted_at is null and ativo;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'erro', 'sem_matricula_app');
  end if;
  return jsonb_build_object('ok', true, 'objetivo', v_obj);
end;
$$;

-- trocar de plano (a pagamentos-aluno chama e atualiza a assinatura no cartão para o valor novo): vale a partir do próximo pagamento
create or replace function {schema}.app_trocar_plano(p_paciente uuid, p_plano text, p_por uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta uuid := {schema}.conta_do_app();
  v_mat {schema}.pacientes%rowtype;
  v_plano {schema}.planos_aluno%rowtype;
  v_antes text;
begin
  select * into v_mat from {schema}.pacientes where id = p_paciente for update;
  if not found or v_mat.conta_id is distinct from v_conta or v_mat.deleted_at is not null or not v_mat.ativo then
    return jsonb_build_object('ok', false, 'erro', 'nao_e_do_app');
  end if;
  select * into v_plano from {schema}.planos_aluno where conta_id = v_conta and codigo = p_plano and ativo;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
  end if;
  select pa.codigo into v_antes from {schema}.planos_aluno pa where pa.id = v_mat.plano_aluno_id;
  if v_mat.plano_aluno_id = v_plano.id and v_mat.mensalidade_valor = v_plano.valor then
    return jsonb_build_object('ok', true, 'mudou', false, 'plano', v_plano.codigo, 'valor', v_plano.valor, 'nome', v_plano.nome);
  end if;
  update {schema}.pacientes set plano_aluno_id = v_plano.id, mensalidade_valor = v_plano.valor where id = p_paciente;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (v_conta, 'plano', jsonb_build_object('paciente_id', p_paciente, 'plano', v_antes, 'valor', v_mat.mensalidade_valor),
          jsonb_build_object('paciente_id', p_paciente, 'plano', v_plano.codigo, 'valor', v_plano.valor), p_por);
  return jsonb_build_object('ok', true, 'mudou', true, 'plano', v_plano.codigo, 'valor', v_plano.valor, 'nome', v_plano.nome);
end;
$$;

-- o profissional tirou o aluno da lista (o painel antigo do Calc — admin-delete-user do Treino, pela vincular-aluno em modo
-- servidor): a matrícula dele fica inativa (o gatilho abaixo leva o aluno para o app). Se na mesma matrícula ainda há o outro
-- módulo com outro profissional (a nutri da conta), só o personal sai.
create or replace function {schema}.desvincular_do_profissional(p_aluno uuid, p_profissional uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  v_inativas integer := 0;
  v_sem_personal integer := 0;
begin
  if p_aluno is null or p_profissional is null then
    return jsonb_build_object('ok', false, 'erro', 'parametros');
  end if;
  for r in
    select p.id, p.personal_id, p.nutricionista_id,
           exists (select 1 from {schema}.conta_membros m where m.conta_id = p.conta_id and m.user_id = p_profissional
                      and m.status = 'ativo' and 'dono' = any(m.papeis)) as dono
      from {schema}.pacientes p
     where p.user_id = p_aluno and p.deleted_at is null and p.ativo and p.conta_id is distinct from {schema}.conta_do_app()
       and (p.personal_id = p_profissional or exists (select 1 from {schema}.conta_membros m where m.conta_id = p.conta_id
              and m.user_id = p_profissional and m.status = 'ativo' and 'dono' = any(m.papeis)))
     for update
  loop
    if not r.dono and r.nutricionista_id is not null and r.nutricionista_id <> p_profissional then
      update {schema}.pacientes set personal_id = null where id = r.id;
      v_sem_personal := v_sem_personal + 1;
    else
      update {schema}.pacientes set ativo = false, desvinculado_em = now() where id = r.id;
      v_inativas := v_inativas + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'desvinculadas', v_inativas, 'so_personal', v_sem_personal);
end;
$$;

-- ============================================================================================================
-- 4. O profissional tirou o aluno da lista → aluno do app com 7 dias grátis a partir dali (os dados continuam dele)
-- ============================================================================================================
create or replace function {schema}.pacientes_app_assumir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conta uuid := {schema}.conta_do_app();
  v_origem text;
  v_obj text;
begin
  if v_conta is null or new.user_id is null or old.conta_id is not distinct from v_conta then
    return null;
  end if;
  -- só a virada de ativa para inativa/na lixeira (mudar de conta e continuar ativa = continua com profissional)
  if not (old.ativo and old.deleted_at is null) or (new.ativo and new.deleted_at is null) then
    return null;
  end if;
  if coalesce(new.config, '{}'::jsonb) ? 'conta_excluida_em' then
    return null; -- o próprio aluno excluiu a conta (W7)
  end if;
  select c.origem into v_origem from {schema}.contas c where c.id = old.conta_id;
  if v_origem is null or v_origem not in ('nova', 'legado_calc') then
    return null; -- o Nutri antigo segue as regras de hoje até a W28
  end if;
  if exists (select 1 from {schema}.pacientes p where p.user_id = new.user_id and p.id <> new.id and p.deleted_at is null and p.ativo) then
    return null; -- ainda tem outro profissional
  end if;
  if exists (select 1 from {schema}.profiles pr where pr.id = new.user_id and pr.role = 'master') then
    return null;
  end if;
  v_obj := coalesce(new.objetivo_app, (select p.objetivo_app from {schema}.pacientes p
                                        where p.user_id = new.user_id and p.conta_id = v_conta and p.objetivo_app is not null limit 1));
  perform {schema}.matricular_no_app(new.user_id, v_obj,
    case when old.nutricionista_id is not null then 'app_treino_alimentacao' else 'app_treino' end, 'removido', true);
  return null;
end;
$$;
drop trigger if exists trg_pacientes_app_assumir on {schema}.pacientes;
create trigger trg_pacientes_app_assumir after update of ativo, deleted_at, conta_id on {schema}.pacientes
  for each row execute function {schema}.pacientes_app_assumir();

-- ============================================================================================================
-- 5. matricular_na_conta (W3) + o app: quem é aluno do app pode entrar na conta de um profissional (P7 não conta a conta do app);
--    ao entrar, a matrícula do app encerra. Voltar pelo código a um profissional que tinha tirado o aluno da lista reativa a
--    matrícula de antes (respeitando o limite da faixa).
-- ============================================================================================================
create or replace function {schema}.matricular_na_conta(
  p_user uuid, p_conta uuid, p_personal uuid, p_nutricionista uuid, p_origem text default 'novo',
  p_ignorar_regras boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta {schema}.contas%rowtype;
  v_existente {schema}.pacientes%rowtype;
  v_nome text;
  v_email text;
  v_id uuid;
  v_app uuid := {schema}.conta_do_app();
  v_encerrou uuid[];
  v_reativada boolean := false;
begin
  select * into v_conta from {schema}.contas where id = p_conta for update;  -- serializa o limite da faixa
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  select * into v_existente from {schema}.pacientes
   where user_id = p_user and conta_id = p_conta and deleted_at is null order by ativo desc, created_at limit 1;
  if found then
    if not v_existente.ativo and p_conta is distinct from v_app then
      -- voltou para quem o tinha tirado da lista (ou reativou pelo código): reativa, se couber na faixa
      if not p_ignorar_regras then
        if v_conta.situacao in ('suspensa', 'cancelada') then
          return jsonb_build_object('ok', false, 'erro', 'profissional_inativo');
        end if;
        if exists (select 1 from {schema}.pacientes p where p.user_id = p_user and p.deleted_at is null and p.ativo
                      and p.conta_id is distinct from p_conta and p.conta_id is distinct from v_app) then
          return jsonb_build_object('ok', false, 'erro', 'outro_profissional');
        end if;
        if not {schema}.conta_pode_adicionar_aluno(p_conta) then
          return jsonb_build_object('ok', false, 'erro', 'limite_plano', 'limite', {schema}.conta_limite_alunos(p_conta));
        end if;
      end if;
      update {schema}.pacientes set ativo = true, desvinculado_em = null,
          personal_id = coalesce(p_personal, personal_id), nutricionista_id = coalesce(p_nutricionista, nutricionista_id)
       where id = v_existente.id;
      v_reativada := true;
    else
      -- mesma conta: completa o responsável do outro módulo (ex.: já era da nutri e agora entrou pelo código do personal)
      update {schema}.pacientes set
          personal_id = coalesce(personal_id, p_personal),
          nutricionista_id = coalesce(nutricionista_id, p_nutricionista)
       where id = v_existente.id and ((personal_id is null and p_personal is not null) or (nutricionista_id is null and p_nutricionista is not null));
    end if;
    v_id := v_existente.id;
  else
    if not p_ignorar_regras then
      if v_conta.situacao in ('suspensa', 'cancelada') then
        return jsonb_build_object('ok', false, 'erro', 'profissional_inativo');
      end if;
      -- P7: 1 conta ativa por vez — a conta do app não conta (quem treina sozinho pode entrar na lista de um profissional)
      if exists (select 1 from {schema}.pacientes p where p.user_id = p_user and p.deleted_at is null and p.ativo
                    and p.conta_id is distinct from p_conta and p.conta_id is distinct from v_app) then
        return jsonb_build_object('ok', false, 'erro', 'outro_profissional');
      end if;
      if not {schema}.conta_pode_adicionar_aluno(p_conta) then
        return jsonb_build_object('ok', false, 'erro', 'limite_plano', 'limite', {schema}.conta_limite_alunos(p_conta));
      end if;
    end if;
    select coalesce(nullif(btrim(pr.nome), ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name',
                    split_part(u.email, '@', 1)), u.email
      into v_nome, v_email
      from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = p_user;
    if v_email is null then
      return jsonb_build_object('ok', false, 'erro', 'usuario_inexistente');
    end if;
    insert into {schema}.pacientes (nutricionista_id, personal_id, conta_id, user_id, nome, email, origem, ativo)
    values (p_nutricionista, p_personal, p_conta, p_user, coalesce(v_nome, 'Aluno'), v_email, p_origem, true)
    returning id into v_id;
  end if;
  -- W7b: entrou na lista de um profissional → a matrícula do app encerra (a borda cancela a assinatura do app no Mercado Pago)
  if p_conta is distinct from v_app and v_app is not null and (v_reativada or v_existente.id is null or v_existente.ativo) then
    with enc as (
      update {schema}.pacientes set ativo = false, app_encerrada_em = now(), app_encerrada_motivo = 'vinculou_profissional'
       where user_id = p_user and conta_id = v_app and ativo and deleted_at is null
       returning id)
    select array_agg(id) into v_encerrou from enc;
    if v_encerrou is not null then
      insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
      values (v_app, 'outro', jsonb_build_object('w07b', 'app_encerrado', 'motivo', 'vinculou_profissional', 'pacientes', to_jsonb(v_encerrou),
                                                'conta_nova', p_conta), p_user);
    end if;
  end if;
  perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'ja_era', v_existente.id is not null, 'reativada', v_reativada,
                            'app_encerrado', v_encerrou is not null);
end;
$$;

-- ============================================================================================================
-- 6. Cobertura da mensalidade (W6) + o teste grátis do app: o teste cobre de app_teste_de até app_teste_ate — pagar no teste
--    soma 1 mês a partir do fim dele; sem pagar, a cobertura acaba no fim do teste (e a trava da W6 fecha o app no dia seguinte)
-- ============================================================================================================
create or replace function {schema}.mensalidade_recalcular(p_paciente uuid) returns timestamptz
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_ancora integer;
  v_cob timestamptz := null;
  v_base timestamptz;
  v_fim timestamptz;
  v_prox timestamptz;
  v_teste_de timestamptz;
  v_teste_ate timestamptz;
  v_teste_aplicado boolean;
  r record;
begin
  if p_paciente is null then
    return null;
  end if;
  select p.app_teste_de, p.app_teste_ate into v_teste_de, v_teste_ate from {schema}.pacientes p where p.id = p_paciente;
  v_teste_aplicado := v_teste_ate is null;
  -- assinatura ativa: o dia da próxima cobrança no MP manda no ciclo (o avulso de reposição cobre só até ela)
  select extract(day from a.proximo_vencimento)::integer into v_ancora
    from {schema}.aluno_assinaturas a
   where a.paciente_id = p_paciente and a.status = 'authorized' and a.proximo_vencimento is not null
   order by a.criado_em desc limit 1;
  for r in
    select c.id, c.pago_em from {schema}.cobrancas c
     where c.paciente_id = p_paciente and c.tipo = 'mensalidade' and c.status = 'paga'
       and c.deleted_at is null and c.pago_em is not null
     order by c.pago_em, c.created_at, c.id
  loop
    if not v_teste_aplicado and coalesce(v_teste_de, v_teste_ate) <= r.pago_em then
      v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
      v_teste_aplicado := true;
    end if;
    v_base := greatest(r.pago_em, coalesce(v_cob, r.pago_em));
    v_fim := v_base + interval '1 month';                       -- o Postgres trava no fim do mês (31/01 + 1 mês = 28/02)
    if v_ancora is not null then
      v_prox := {schema}.financeiro_proxima_ancora(v_base, v_ancora);
      if v_prox < v_fim then v_fim := v_prox; end if;
    end if;
    update {schema}.cobrancas set cobre_de = v_base, cobre_ate = v_fim
     where id = r.id and (cobre_de is distinct from v_base or cobre_ate is distinct from v_fim);
    v_cob := v_fim;
  end loop;
  if not v_teste_aplicado then
    v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
  end if;
  -- o que deixou de ser pago (recusa, estorno, removido) sai da cobertura
  update {schema}.cobrancas set cobre_de = null, cobre_ate = null
   where paciente_id = p_paciente and tipo = 'mensalidade' and (status <> 'paga' or deleted_at is not null)
     and (cobre_de is not null or cobre_ate is not null);
  update {schema}.pacientes set mensalidade_pago_ate = v_cob where id = p_paciente and mensalidade_pago_ate is distinct from v_cob;
  return v_cob;
end;
$$;
revoke execute on function {schema}.mensalidade_recalcular(uuid) from public, anon, authenticated;
grant execute on function {schema}.mensalidade_recalcular(uuid) to service_role;

-- ============================================================================================================
-- 7. financeiro_do_aluno() (W6) + o app: o teste grátis, o plano e "Physiq" como quem recebe (não o nome do master)
-- ============================================================================================================
create or replace function {schema}.financeiro_do_aluno() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) from (
    select p.created_at as criado, jsonb_build_object(
      'paciente_id', p.id,
      'conta_id', p.conta_id,
      'conta_nome', c.nome,
      'recebimento_modo', coalesce(c.recebimento_modo, 'pix_manual'),
      'bloquear_inadimplente', coalesce(c.bloquear_app_inadimplente, false),
      'tem_chave', exists (select 1 from {schema}.recebimento_chaves k where k.conta_id = p.conta_id and k.ativa),
      'profissional', case when c.origem = 'app' then 'Physiq' else
                        (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr
                          where pr.id = coalesce(c.dono_id, p.personal_id, p.nutricionista_id)) end,
      'mensalidade_valor', p.mensalidade_valor,
      'plano_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      'pausada', p.cobranca_pausada,
      'pago_ate', p.mensalidade_pago_ate,
      'desde', p.mensalidade_desde,
      'aguardando', exists (select 1 from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                              and a.status = 'aguardando_confirmacao' and a.tipo = 'mensalidade'),
      'assinatura_ativa', exists (select 1 from {schema}.aluno_assinaturas s where s.paciente_id = p.id and s.status = 'authorized'),
      'abertas', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'descricao', a.descricao, 'valor', a.valor,
                          'vencimento', a.vencimento) order by a.vencimento), '[]'::jsonb)
                    from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null and a.status = 'aberta'),
      'aguardando_avulsas', (select count(*) from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                               and a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa'),
      -- W7b
      'app', coalesce(c.origem = 'app', false),
      'teste_ate', case when c.origem = 'app' then p.app_teste_ate end,
      'plano_codigo', (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id)
    ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
  ) x;
$$;
revoke execute on function {schema}.financeiro_do_aluno() from public, anon;
grant execute on function {schema}.financeiro_do_aluno() to authenticated, service_role;

-- ============================================================================================================
-- 8. minha_situacao() (W5) + o app: módulos da matrícula do app pelo plano (só a ativa); campos do app na matrícula; sai o
--    "aluno do Calc sem matrícula ganha o Treino de graça" (quem estava assim virou aluno do app — script 05); a conta do app
--    vai por último na lista de contas de quem é membro dela (ninguém é, hoje).
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
    'gerado_em', now());
end;
$$;
revoke execute on function {schema}.minha_situacao() from public, anon;
grant execute on function {schema}.minha_situacao() to authenticated, service_role;

-- ============================================================================================================
-- 9. Pratos prontos pelo objetivo (1ª versão W7b — carga: scripts/conteudo/carregar_pratos_prontos.py; o master edita na W27)
-- ============================================================================================================
create table if not exists {schema}.pratos_prontos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null check (char_length(btrim(nome)) >= 2),
  refeicao text not null check (refeicao in ('cafe_da_manha', 'almoco', 'lanche', 'jantar', 'ceia')),
  objetivos text[] not null check (objetivos <@ array['emagrecer', 'manter', 'ganhar_massa']::text[] and cardinality(objetivos) >= 1),
  descricao text,
  modo_preparo text,
  foto_url text,                                   -- vazio = a foto padrão do tipo de refeição (P29, public/fotos/refeicoes)
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists {schema}.pratos_prontos_itens (
  id uuid primary key default gen_random_uuid(),
  prato_id uuid not null references {schema}.pratos_prontos(id) on delete cascade,
  alimento_id uuid not null references {schema}.alimentos(id) on delete restrict,
  nome text,                                       -- como aparece para o aluno (vazio = o nome da TACO)
  quantidade_g numeric(8,1) not null check (quantidade_g > 0 and quantidade_g <= 2000),
  medida text,                                     -- medida caseira ("2 unidades", "4 colheres de sopa")
  ordem integer not null default 0
);
create index if not exists pratos_prontos_itens_prato_idx on {schema}.pratos_prontos_itens (prato_id, ordem);
drop trigger if exists trg_pratos_prontos_atualizado on {schema}.pratos_prontos;
create trigger trg_pratos_prontos_atualizado before update on {schema}.pratos_prontos
  for each row execute function {schema}.set_atualizado_em();
alter table {schema}.pratos_prontos enable row level security;
alter table {schema}.pratos_prontos_itens enable row level security;
-- ninguém lê direto: o app lê pela função abaixo (só quem está no app com Treino + Alimentação); o master edita na W27
revoke all on {schema}.pratos_prontos, {schema}.pratos_prontos_itens from anon, authenticated;
grant all on {schema}.pratos_prontos, {schema}.pratos_prontos_itens to service_role;

create or replace function {schema}.pratos_prontos_do_app(p_objetivo text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mat uuid;
  v_obj_aluno text;
  v_modulos text[];
  v_obj text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select p.id, p.objetivo_app, pa.modulos into v_mat, v_obj_aluno, v_modulos
    from {schema}.pacientes p left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
   where p.user_id = auth.uid() and p.conta_id = {schema}.conta_do_app() and p.deleted_at is null and p.ativo
   order by p.created_at desc limit 1;
  if v_mat is null and not {schema}.sou_master() then
    return jsonb_build_object('ok', false, 'erro', 'sem_matricula_app');
  end if;
  if v_mat is not null and not ('nutricao' = any(coalesce(v_modulos, array[]::text[]))) and not {schema}.sou_master() then
    return jsonb_build_object('ok', false, 'erro', 'sem_plano_alimentacao');
  end if;
  v_obj := coalesce(nullif(lower(btrim(coalesce(p_objetivo, ''))), ''), v_obj_aluno, 'manter');
  if v_obj not in ('emagrecer', 'manter', 'ganhar_massa') then
    v_obj := 'manter';
  end if;
  return jsonb_build_object('ok', true, 'objetivo', v_obj, 'objetivo_do_aluno', v_obj_aluno, 'pratos', coalesce((
    select jsonb_agg(x.j order by x.ordem_ref, x.ordem, x.nome) from (
      select pp.ordem, pp.nome,
        case pp.refeicao when 'cafe_da_manha' then 1 when 'almoco' then 2 when 'lanche' then 3 when 'jantar' then 4 else 5 end as ordem_ref,
        jsonb_build_object(
          'id', pp.id, 'codigo', pp.codigo, 'nome', pp.nome, 'refeicao', pp.refeicao, 'descricao', pp.descricao,
          'modo_preparo', pp.modo_preparo, 'foto_url', pp.foto_url, 'objetivos', to_jsonb(pp.objetivos),
          'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                        'nome', coalesce(nullif(btrim(i.nome), ''), a.nome), 'medida', i.medida, 'quantidade_g', i.quantidade_g,
                        'kcal', round(coalesce(a.energia_kcal, 0) * i.quantidade_g / 100, 1),
                        'proteina_g', round(coalesce(a.proteina_g, 0) * i.quantidade_g / 100, 1),
                        'carboidrato_g', round(coalesce(a.carboidrato_g, 0) * i.quantidade_g / 100, 1),
                        'lipidio_g', round(coalesce(a.lipidio_g, 0) * i.quantidade_g / 100, 1),
                        'taco', a.codigo) order by i.ordem), '[]'::jsonb)
                      from {schema}.pratos_prontos_itens i join {schema}.alimentos a on a.id = i.alimento_id where i.prato_id = pp.id),
          'kcal', (select round(coalesce(sum(coalesce(a.energia_kcal, 0) * i.quantidade_g / 100), 0))
                     from {schema}.pratos_prontos_itens i join {schema}.alimentos a on a.id = i.alimento_id where i.prato_id = pp.id),
          'proteina_g', (select round(coalesce(sum(coalesce(a.proteina_g, 0) * i.quantidade_g / 100), 0), 1)
                           from {schema}.pratos_prontos_itens i join {schema}.alimentos a on a.id = i.alimento_id where i.prato_id = pp.id),
          'carboidrato_g', (select round(coalesce(sum(coalesce(a.carboidrato_g, 0) * i.quantidade_g / 100), 0), 1)
                              from {schema}.pratos_prontos_itens i join {schema}.alimentos a on a.id = i.alimento_id where i.prato_id = pp.id),
          'lipidio_g', (select round(coalesce(sum(coalesce(a.lipidio_g, 0) * i.quantidade_g / 100), 0), 1)
                          from {schema}.pratos_prontos_itens i join {schema}.alimentos a on a.id = i.alimento_id where i.prato_id = pp.id),
          'fibra_g', (select round(coalesce(sum(coalesce(a.fibra_g, 0) * i.quantidade_g / 100), 0), 1)
                        from {schema}.pratos_prontos_itens i join {schema}.alimentos a on a.id = i.alimento_id where i.prato_id = pp.id)
        ) as j
        from {schema}.pratos_prontos pp where pp.ativo and v_obj = any(pp.objetivos)) x), '[]'::jsonb));
end;
$$;

-- ============================================================================================================
-- 10. Master: os alunos do app (C8 "Sem professor/Sem conta" vira "alunos do app" — a tela nova do master é da W27)
-- ============================================================================================================
create or replace function {schema}.master_alunos_do_app() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then
    return jsonb_build_object('ok', false, 'erro', 'so_master');
  end if;
  return jsonb_build_object('ok', true, 'conta_id', {schema}.conta_do_app(), 'alunos', coalesce((
    select jsonb_agg(jsonb_build_object(
        'paciente_id', p.id, 'user_id', p.user_id, 'nome', p.nome, 'email', lower(coalesce(u.email, p.email)), 'ativo', p.ativo,
        'plano', pa.codigo, 'plano_nome', pa.nome, 'valor', p.mensalidade_valor, 'objetivo', p.objetivo_app,
        'teste_ate', p.app_teste_ate, 'pago_ate', p.mensalidade_pago_ate, 'pausada', p.cobranca_pausada,
        'assinatura', (select s.status from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1),
        'encerrada_em', p.app_encerrada_em, 'encerrada_motivo', p.app_encerrada_motivo, 'criado_em', p.created_at)
      order by p.ativo desc, p.created_at desc)
      from {schema}.pacientes p
      left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
      left join auth.users u on u.id = p.user_id
     where p.conta_id = {schema}.conta_do_app() and p.deleted_at is null), '[]'::jsonb));
end;
$$;

-- ============================================================================================================
-- 11. Execução: o app entra no plano, lê o plano, muda o objetivo, lê os pratos e (master) a lista; o resto é do servidor
-- ============================================================================================================
revoke execute on function {schema}.conta_do_app(), {schema}.app_teste_dias(), {schema}.app_fim_do_teste(timestamptz),
  {schema}.sou_master(), {schema}.matricular_no_app(uuid, text, text, text, boolean), {schema}.app_trocar_plano(uuid, text, uuid),
  {schema}.desvincular_do_profissional(uuid, uuid), {schema}.pacientes_app_assumir(),
  {schema}.matricular_na_conta(uuid, uuid, uuid, uuid, text, boolean),
  {schema}.entrar_sem_profissional(text, text), {schema}.meu_plano_app(), {schema}.mudar_objetivo_app(text),
  {schema}.pratos_prontos_do_app(text), {schema}.master_alunos_do_app()
  from public, anon, authenticated;
grant execute on function {schema}.conta_do_app(), {schema}.app_teste_dias(), {schema}.app_fim_do_teste(timestamptz),
  {schema}.sou_master(), {schema}.matricular_no_app(uuid, text, text, text, boolean), {schema}.app_trocar_plano(uuid, text, uuid),
  {schema}.desvincular_do_profissional(uuid, uuid), {schema}.matricular_na_conta(uuid, uuid, uuid, uuid, text, boolean),
  {schema}.entrar_sem_profissional(text, text), {schema}.meu_plano_app(), {schema}.mudar_objetivo_app(text),
  {schema}.pratos_prontos_do_app(text), {schema}.master_alunos_do_app()
  to service_role;
grant execute on function {schema}.entrar_sem_profissional(text, text), {schema}.meu_plano_app(), {schema}.mudar_objetivo_app(text),
  {schema}.pratos_prontos_do_app(text), {schema}.master_alunos_do_app()
  to authenticated;
