-- Physiq W26 — Ferramentas › Lixeira (N-21, N-65) no BANCO PRINCIPAL, public + staging. Idempotente; só funções novas e grants.
-- Aplicar (backup das definições ANTES; nenhuma tabela, política ou dado muda):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001230000_w26_lixeira.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001230000_w26_lixeira.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001230000_w26_lixeira.sql --so public
--
-- A Lixeira continua SEM tabela própria (como a do site antigo do Nutri, 20260920050000_lixeira.sql): ela lê o que tem `deleted_at` nas
-- 5 fontes — respostas de pré-consulta, anamneses, antropometrias, planos alimentares e alunos (pacientes) —, restaura com
-- `deleted_at = null` e apaga de vez com DELETE (aluno nunca: fica até restaurar). A purga de 30 dias é o pg_cron que já existe
-- (lixeira-purga-public / lixeira-purga-staging, 03:15 UTC, lixeira_purgar()): o Physiq grava `deleted_at` nas MESMAS 4 tabelas que
-- ela apaga, então nada muda nela (sem job novo). O site antigo do Nutri continua lendo e restaurando pelo PostgREST, lado a lado.
--
-- O que entra aqui (o painel do Physiq usa só isto — a regra mora no banco):
--   lixeira_da_conta(p_conta)          os itens da CONTA ATIVA que a pessoa pode ver, com "pode restaurar" e "pode apagar":
--     · P1: o dono vê os da conta inteira; o membro, só os dele (alunos em que é responsável; respostas dos formulários dele);
--     · regra clínica da W18: anamneses, antropometrias e planos alimentares só para quem é nutricionista da conta (pode_ver_clinico /
--       pode_editar_aluno 'nutricao'); a resposta de formulário de nutri só para nutricionista (pode_ver_resposta_preconsulta, W21) —
--       personal e dono sem papel de nutri não veem nem restauram;
--   lixeira_restaurar(p_tipo, p_id)    volta EXATAMENTE o que era (só o deleted_at muda; nenhuma matrícula nova). Aluno:
--     · quem pode remover pode restaurar (w13_pode_gerir: master, dono ou o responsável com o papel);
--     · e-mail/CPF únicos (W16b): o gatilho trg_pacientes_unicos_email_cpf confere a volta da lixeira → email_repetido | cpf_repetido
--       (nada muda);
--     · P7 (1 conta por vez): ativo com login em OUTRA conta de profissional → outro_profissional; outra matrícula viva na MESMA conta
--       (voltou pelo código depois de removido) → ja_na_lista; a conta do app não conta — ela encerra, como no matricular_na_conta
--       (W7b; a assinatura do app no Mercado Pago é cancelada pela rede de segurança de sempre: pos-login, Pagamentos e o aviso do MP);
--     · limite da faixa e conta travada, como o Reativar da W13 (só quando volta ocupando vaga: ativo e sem bloqueio);
--   lixeira_apagar(p_tipo, p_id)       apaga de vez (DELETE; refeições e itens do plano caem por cascade) — nunca aluno.
-- Nada é enviado a ninguém (sem aviso, e-mail, push ou WhatsApp).

-- ============================================================================================================
-- 0. Quem pode o quê (auxiliares; só o servidor usa)
-- ============================================================================================================

-- anamnese, antropometria e plano: ver = a regra clínica da W18 (pode_ver_clinico); restaurar/apagar = escrever na nutrição do aluno
create or replace function {schema}.w26_lixeira_clinico_ve(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce({schema}.pode_ver_clinico(p_paciente), false);
$$;

create or replace function {schema}.w26_lixeira_clinico_mexe(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or coalesce({schema}.pode_editar_aluno(p_paciente, 'nutricao'), false);
$$;

-- resposta de pré-consulta: a regra da W21 (autor membro; dono, menos a de formulário de nutri quando ele não é nutricionista)
create or replace function {schema}.w26_lixeira_resposta_mexe(p_conta uuid, p_autor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce({schema}.pode_ver_resposta_preconsulta(p_conta, p_autor), false)
     and ({schema}.eh_master() or p_autor = auth.uid() or (p_conta is not null and {schema}.sou_dono(p_conta)));
$$;

revoke all on function {schema}.w26_lixeira_clinico_ve(uuid), {schema}.w26_lixeira_clinico_mexe(uuid),
  {schema}.w26_lixeira_resposta_mexe(uuid, uuid) from public, anon, authenticated;
grant execute on function {schema}.w26_lixeira_clinico_ve(uuid), {schema}.w26_lixeira_clinico_mexe(uuid),
  {schema}.w26_lixeira_resposta_mexe(uuid, uuid) to service_role;

-- ============================================================================================================
-- 1. A lista (a tela abre com isto): só a conta ativa, mais recente primeiro, até 300 por tipo
-- ============================================================================================================
create or replace function {schema}.lixeira_da_conta(p_conta uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_c {schema}.contas%rowtype;
  v_nutri boolean;
  v_itens jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if not (v_master or {schema}.sou_membro(p_conta)) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  -- as abas clínicas só existem para quem é nutricionista numa conta com Nutrição (ou o master)
  v_nutri := v_master or {schema}.tenho_papel(p_conta, 'nutricionista');

  with alunos as (
    select p.id, p.nome from {schema}.pacientes p where p.conta_id = p_conta
  ), itens as (
    -- respostas de pré-consulta (a conta é a do formulário — W21; as do site antigo sem conta: só as do próprio autor)
    (select 'resposta'::text as tipo, r.id, coalesce(nullif(btrim(r.titulo), ''), 'Pré-consulta') as titulo, nullif(btrim(r.nome), '') as quem,
            r.paciente_id, a.nome as paciente_nome, r.deleted_at, true as restaura, true as apaga
       from {schema}.respostas_preconsulta r left join alunos a on a.id = r.paciente_id
      where r.deleted_at is not null
        and (r.conta_id = p_conta or (r.conta_id is null and r.nutricionista_id = v_uid))
        and {schema}.w26_lixeira_resposta_mexe(r.conta_id, r.nutricionista_id)
      order by r.deleted_at desc limit 300)
    union all
    (select 'anamnese', x.id, coalesce(nullif(btrim(x.titulo), ''), 'Anamnese'), null, x.paciente_id, a.nome, x.deleted_at,
            {schema}.w26_lixeira_clinico_mexe(x.paciente_id), {schema}.w26_lixeira_clinico_mexe(x.paciente_id)
       from {schema}.anamneses x join alunos a on a.id = x.paciente_id
      where v_nutri and x.deleted_at is not null and {schema}.w26_lixeira_clinico_ve(x.paciente_id)
      order by x.deleted_at desc limit 300)
    union all
    (select 'antropometria', x.id, 'Antropometria', to_char(x.data at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), x.paciente_id, a.nome,
            x.deleted_at, {schema}.w26_lixeira_clinico_mexe(x.paciente_id), {schema}.w26_lixeira_clinico_mexe(x.paciente_id)
       from {schema}.antropometrias x join alunos a on a.id = x.paciente_id
      where v_nutri and x.deleted_at is not null and {schema}.w26_lixeira_clinico_ve(x.paciente_id)
      order by x.deleted_at desc limit 300)
    union all
    (select 'plano', x.id, coalesce(nullif(btrim(x.titulo), ''), 'Plano alimentar'), null, x.paciente_id, a.nome, x.deleted_at,
            {schema}.w26_lixeira_clinico_mexe(x.paciente_id), {schema}.w26_lixeira_clinico_mexe(x.paciente_id)
       from {schema}.planos_alimentares x join alunos a on a.id = x.paciente_id
      where v_nutri and x.deleted_at is not null and {schema}.w26_lixeira_clinico_ve(x.paciente_id)
      order by x.deleted_at desc limit 300)
    union all
    -- alunos (matrículas removidas da lista — aluno_remover da W13): nunca apagados de vez
    (select 'paciente', p.id, coalesce(nullif(btrim(p.nome), ''), 'Aluno'), nullif(btrim(coalesce(p.email, '')), ''), null::uuid, null::text,
            p.deleted_at, {schema}.w13_pode_gerir(p.id), false
       from {schema}.pacientes p
      where p.conta_id = p_conta and p.deleted_at is not null and (v_master or {schema}.pode_ver_aluno(p.id))
      order by p.deleted_at desc limit 300)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', i.tipo, 'id', i.id, 'titulo', i.titulo, 'detalhe', i.quem, 'paciente_id', i.paciente_id, 'paciente_nome', i.paciente_nome,
           'excluido_em', i.deleted_at, 'pode_restaurar', coalesce(i.restaura, false), 'pode_apagar', coalesce(i.apaga, false))
         order by i.deleted_at desc, i.tipo, i.id), '[]'::jsonb)
    into v_itens from itens i;

  return jsonb_build_object('ok', true, 'conta_id', p_conta, 've_clinico', v_nutri,
                            'tem_nutricao', 'nutricao' = any({schema}.modulos_do_plano(v_c.plano)), 'itens', v_itens);
end;
$$;

-- ============================================================================================================
-- 2. Restaurar o aluno (a matrícula volta como era — W13/W7b/W16b)
-- ============================================================================================================
create or replace function {schema}.w26_restaurar_aluno(p_paciente uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p {schema}.pacientes%rowtype;
  v_app uuid := {schema}.conta_do_app();
  v_encerrou uuid[];
begin
  select * into v_p from {schema}.pacientes where id = p_paciente for update;
  if not found or v_p.deleted_at is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
  if v_p.conta_id is null or not {schema}.w13_pode_gerir(p_paciente) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  if v_p.user_id is not null and exists (select 1 from {schema}.pacientes x where x.user_id = v_p.user_id and x.id <> v_p.id
                                            and x.conta_id = v_p.conta_id and x.deleted_at is null) then
    return jsonb_build_object('ok', false, 'erro', 'ja_na_lista');
  end if;
  if v_p.ativo then
    -- P7: ativo com outro profissional (a conta do app não conta: ela encerra abaixo)
    if v_p.user_id is not null and exists (select 1 from {schema}.pacientes x where x.user_id = v_p.user_id and x.id <> v_p.id
              and x.deleted_at is null and x.ativo and x.conta_id is distinct from v_p.conta_id and x.conta_id is distinct from v_app) then
      return jsonb_build_object('ok', false, 'erro', 'outro_profissional');
    end if;
    if {schema}.w13_conta_travada(v_p.conta_id) then return jsonb_build_object('ok', false, 'erro', 'conta_travada'); end if;
    perform 1 from {schema}.contas where id = v_p.conta_id for update;  -- serializa o limite da faixa
    if v_p.acesso_bloqueado_em is null and not {schema}.conta_pode_adicionar_aluno(v_p.conta_id) then
      return {schema}.w13_erro_limite(v_p.conta_id);
    end if;
  end if;
  begin
    update {schema}.pacientes set deleted_at = null where id = p_paciente;
  exception when sqlstate 'P0001' then
    -- a trava da W16b (gatilho): outro aluno vivo com o mesmo e-mail/CPF — nada muda
    if sqlerrm = 'paciente_email_repetido' then
      return jsonb_build_object('ok', false, 'erro', 'email_repetido', 'campos', jsonb_build_array('email'));
    elsif sqlerrm = 'paciente_cpf_repetido' then
      return jsonb_build_object('ok', false, 'erro', 'cpf_repetido', 'campos', jsonb_build_array('cpf'));
    end if;
    raise;
  end;
  -- W7b: voltou para a lista do profissional → a matrícula do app encerra (a mesma marca do matricular_na_conta)
  if v_p.ativo and v_p.user_id is not null and v_app is not null and v_p.conta_id is distinct from v_app then
    with enc as (
      update {schema}.pacientes set ativo = false, app_encerrada_em = now(), app_encerrada_motivo = 'vinculou_profissional'
       where user_id = v_p.user_id and conta_id = v_app and ativo and deleted_at is null
       returning id)
    select array_agg(id) into v_encerrou from enc;
    if v_encerrou is not null then
      insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
      values (v_app, 'outro', jsonb_build_object('w07b', 'app_encerrado', 'motivo', 'vinculou_profissional', 'pacientes', to_jsonb(v_encerrou),
                                                'conta_nova', v_p.conta_id, 'w26', 'restaurado_da_lixeira'), v_uid);
    end if;
  end if;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_p.conta_id, 'outro', jsonb_build_object('w26', 'aluno_restaurado', 'paciente_id', p_paciente), v_uid);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'tipo', 'paciente', 'id', p_paciente, 'ativo', v_p.ativo, 'app_encerrado', v_encerrou is not null);
end;
$$;
revoke all on function {schema}.w26_restaurar_aluno(uuid) from public, anon, authenticated;
grant execute on function {schema}.w26_restaurar_aluno(uuid) to service_role;

-- ============================================================================================================
-- 3. Restaurar / apagar de vez (a tela chama estas duas)
-- ============================================================================================================
create or replace function {schema}.lixeira_restaurar(p_tipo text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pac uuid;
  v_conta uuid;
  v_autor uuid;
  v_del timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_tipo = 'paciente' then return {schema}.w26_restaurar_aluno(p_id); end if;
  if p_tipo = 'resposta' then
    select r.conta_id, r.nutricionista_id, r.deleted_at into v_conta, v_autor, v_del from {schema}.respostas_preconsulta r where r.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_resposta_mexe(v_conta, v_autor) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    update {schema}.respostas_preconsulta set deleted_at = null where id = p_id;
  elsif p_tipo = 'anamnese' then
    select x.paciente_id, x.deleted_at into v_pac, v_del from {schema}.anamneses x where x.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_clinico_mexe(v_pac) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    update {schema}.anamneses set deleted_at = null where id = p_id;
  elsif p_tipo = 'antropometria' then
    select x.paciente_id, x.deleted_at into v_pac, v_del from {schema}.antropometrias x where x.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_clinico_mexe(v_pac) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    update {schema}.antropometrias set deleted_at = null where id = p_id;
  elsif p_tipo = 'plano' then
    select x.paciente_id, x.deleted_at into v_pac, v_del from {schema}.planos_alimentares x where x.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_clinico_mexe(v_pac) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    update {schema}.planos_alimentares set deleted_at = null where id = p_id;
  else
    return jsonb_build_object('ok', false, 'erro', 'tipo_invalido');
  end if;
  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'id', p_id, 'paciente_id', v_pac);
end;
$$;

create or replace function {schema}.lixeira_apagar(p_tipo text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pac uuid;
  v_conta uuid;
  v_autor uuid;
  v_del timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_tipo = 'paciente' then return jsonb_build_object('ok', false, 'erro', 'aluno_nao_apaga'); end if;
  if p_tipo = 'resposta' then
    select r.conta_id, r.nutricionista_id, r.deleted_at into v_conta, v_autor, v_del from {schema}.respostas_preconsulta r where r.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_resposta_mexe(v_conta, v_autor) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    delete from {schema}.respostas_preconsulta where id = p_id;
  elsif p_tipo = 'anamnese' then
    select x.paciente_id, x.deleted_at into v_pac, v_del from {schema}.anamneses x where x.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_clinico_mexe(v_pac) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    delete from {schema}.anamneses where id = p_id;
  elsif p_tipo = 'antropometria' then
    select x.paciente_id, x.deleted_at into v_pac, v_del from {schema}.antropometrias x where x.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_clinico_mexe(v_pac) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    delete from {schema}.antropometrias where id = p_id;
  elsif p_tipo = 'plano' then
    select x.paciente_id, x.deleted_at into v_pac, v_del from {schema}.planos_alimentares x where x.id = p_id for update;
    if not found or v_del is null then return jsonb_build_object('ok', false, 'erro', 'nao_esta_na_lixeira'); end if;
    if not {schema}.w26_lixeira_clinico_mexe(v_pac) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
    delete from {schema}.planos_alimentares where id = p_id;  -- refeições e itens caem por cascade
  else
    return jsonb_build_object('ok', false, 'erro', 'tipo_invalido');
  end if;
  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'id', p_id, 'apagado', true);
end;
$$;

-- os default privileges do projeto dão EXECUTE ao anon em toda função nova → revogar e dar só a quem tem login
revoke all on function {schema}.lixeira_da_conta(uuid), {schema}.lixeira_restaurar(text, uuid), {schema}.lixeira_apagar(text, uuid) from public, anon;
grant execute on function {schema}.lixeira_da_conta(uuid), {schema}.lixeira_restaurar(text, uuid), {schema}.lixeira_apagar(text, uuid)
  to authenticated, service_role;
