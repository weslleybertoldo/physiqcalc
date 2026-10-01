-- Physiq W16b — E-MAIL e CPF ÚNICOS entre os alunos (pacientes) de pessoas diferentes, em QUALQUER conta (banco principal,
-- staging e public). Idempotente; NENHUM dado muda: os repetidos que já existem ficam como estão e continuam editáveis.
--
-- Decisão do Weslley (30/09/2026 ~22:55): "Coloca uma trava para email e CPF. Se tentar cadastrar o mesmo email ou o mesmo CPF
-- ele não permite e aparece uma mensagem vermelha abaixo do campo informando que já possui um paciente com o CPF" · "Isso já
-- resolve o conflito" · "E aí não precisa mexer na desativação da ferramenta. O correto é não ter emails e CPF iguais".
-- Causa (W16b, Parte A): em 01/10 00:10 UTC ele pôs no paciente de um login (site antigo do Nutri) o e-mail de OUTRO login; os 2
-- pacientes com o mesmo e-mail ficaram lado a lado na lista do site antigo (o master vê os pacientes de todas as contas)
-- e ele desativou a matrícula do app achando que era a repetida (PATCH {"ativo":false}, 00:10:58). Nenhuma regra desligou nada —
-- a regra da desativação NÃO muda; o que muda é que o e-mail/CPF repetido não entra mais.
--
-- Aplicar (backup ANTES, ver scripts/backup/):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930235000_w16b_email_cpf_unicos.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930235000_w16b_email_cpf_unicos.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930235000_w16b_email_cpf_unicos.sql --so public
--
-- A regra (uma linha VIVA de pacientes = sem deleted_at):
--   · e-mail = minúsculas sem espaços nas pontas; CPF = só os dígitos; vazio/nulo nunca conflita;
--   · conflita com outra linha viva que tenha o mesmo e-mail (ou CPF), MENOS:
--       - a mesma pessoa: o mesmo user_id (não nulo) — as matrículas que o sistema cria quando o aluno troca de conta (P7:
--         matricular_na_conta, aluno do app, convite aceito, código/link) continuam passando;
--       - o e-mail do PRÓPRIO login da linha (verificado no Auth): o e-mail é dele, então a linha dele nunca "tem o e-mail de outra
--         pessoa" — o aluno que entra com o e-mail dele (app, convite, código) não é barrado porque alguém cadastrou aquele e-mail
--         em outra linha; quem é barrado é a OUTRA linha (cadastrar sem login, ou no paciente de outro login, o e-mail de quem já
--         é aluno — foi o que aconteceu em 01/10 00:10:35);
--   · o gatilho (insert e update de email, cpf, deleted_at, user_id) barra SÓ o que o valor NOVO cria de conflito: editar outro
--     campo de uma linha que JÁ era repetida passa; restaurar da lixeira confere; trocar o login confere só o que a troca cria.
--   · erro identificável (o site antigo do Nutri grava direto na tabela pelo PostgREST e recebe isto; a H1 põe a mensagem lá):
--       SQLSTATE P0001 · message 'paciente_email_repetido' | 'paciente_cpf_repetido' · hint com a frase da tela.
--   · paciente_dado_livre(p_email, p_cpf, p_paciente) → { ok, email_livre, cpf_livre } (só booleanos, sem dizer de quem nem de
--     qual conta): a tela confere ao sair do campo. Só profissional (membro ativo de alguma conta) ou master; com p_paciente,
--     só quem pode editar aquele aluno.
--   · as funções das telas devolvem o erro em JSON: aluno_criar e aluno_salvar_dados → email_repetido | cpf_repetido (+ campos);
--     cadastro_link_enviar (/c/, público) → cadastro_email_existe; aluno_pendente_decidir (aprovar) → email_repetido | cpf_repetido.
--   · o convite por e-mail (aluno_convidar) não cria linha antes do aceite: não muda.

-- ============================================================================================================
-- 1. Normalização e índices
-- ============================================================================================================
create or replace function {schema}.normalizar_email(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;

create or replace function {schema}.normalizar_cpf(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

create index if not exists pacientes_email_norm_idx on {schema}.pacientes ({schema}.normalizar_email(email)) where deleted_at is null;
create index if not exists pacientes_cpf_norm_idx on {schema}.pacientes ({schema}.normalizar_cpf(cpf)) where deleted_at is null;

-- ============================================================================================================
-- 2. Quem conflita (só o servidor usa: devolve ids de outras linhas)
-- ============================================================================================================
-- as linhas vivas que conflitam com (p_id, p_user, p_email, p_cpf): 'email' ou 'cpf' + o id da outra linha
create or replace function {schema}.paciente_conflitos(p_id uuid, p_user uuid, p_email text, p_cpf text)
returns table (campo text, outro uuid)
language sql stable security definer set search_path = '' as $$
  with a as (
    select {schema}.normalizar_email(p_email) as e, {schema}.normalizar_cpf(p_cpf) as c,
           -- o e-mail é o do PRÓPRIO login da linha (verificado): é dele, não é "de outra pessoa"
           coalesce(p_user is not null and {schema}.normalizar_email(p_email) =
                    (select {schema}.normalizar_email(u.email) from auth.users u where u.id = p_user), false) as proprio)
  select 'email'::text, x.id
    from a join {schema}.pacientes x on {schema}.normalizar_email(x.email) = a.e
   where a.e is not null and not a.proprio and x.deleted_at is null and x.id is distinct from p_id
     and not (p_user is not null and x.user_id is not distinct from p_user)   -- a mesma pessoa (P7)
  union all
  select 'cpf'::text, x.id
    from a join {schema}.pacientes x on {schema}.normalizar_cpf(x.cpf) = a.c
   where a.c is not null and x.deleted_at is null and x.id is distinct from p_id
     and not (p_user is not null and x.user_id is not distinct from p_user);
$$;

-- os campos ('email', 'cpf') em que o estado NOVO cria conflito que o estado de antes não tinha (p_vivo_antes = false: linha nova
-- ou saindo da lixeira → todo conflito conta)
create or replace function {schema}.paciente_conflitos_novos(p_id uuid, p_vivo_antes boolean, p_user_antes uuid, p_email_antes text,
  p_cpf_antes text, p_user uuid, p_email text, p_cpf text) returns setof text
language sql stable security definer set search_path = '' as $$
  select distinct n.campo from {schema}.paciente_conflitos(p_id, p_user, p_email, p_cpf) n
   where not coalesce(p_vivo_antes, false) or not exists (
     select 1 from {schema}.paciente_conflitos(p_id, p_user_antes, p_email_antes, p_cpf_antes) o
      where o.campo = n.campo and o.outro = n.outro);
$$;
revoke execute on function {schema}.paciente_conflitos(uuid, uuid, text, text),
  {schema}.paciente_conflitos_novos(uuid, boolean, uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function {schema}.paciente_conflitos(uuid, uuid, text, text),
  {schema}.paciente_conflitos_novos(uuid, boolean, uuid, text, text, uuid, text, text) to service_role;

-- ============================================================================================================
-- 3. O gatilho (vale para o site antigo do Nutri, que grava direto na tabela, e para tudo o mais)
-- ============================================================================================================
create or replace function {schema}.pacientes_unicos_email_cpf() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_e text;
  v_c text;
  v_vivo_antes boolean := false;
  v_user_antes uuid;
  v_email_antes text;
  v_cpf_antes text;
  v_rep text[];
begin
  if new.deleted_at is not null then
    return new;  -- na lixeira não conta
  end if;
  v_e := {schema}.normalizar_email(new.email);
  v_c := {schema}.normalizar_cpf(new.cpf);
  if v_e is null and v_c is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_vivo_antes := old.deleted_at is null;
    v_user_antes := old.user_id;
    v_email_antes := old.email;
    v_cpf_antes := old.cpf;
    if v_vivo_antes and v_e is not distinct from {schema}.normalizar_email(old.email)
       and v_c is not distinct from {schema}.normalizar_cpf(old.cpf) and new.user_id is not distinct from old.user_id then
      return new;  -- nada do que a trava olha mudou (editar outro campo de quem já era repetido passa)
    end if;
  end if;
  -- 2 gravações ao mesmo tempo com o mesmo e-mail/CPF esperam uma pela outra
  if v_e is not null then perform pg_advisory_xact_lock(hashtextextended('pacientes:email:' || v_e, 0)); end if;
  if v_c is not null then perform pg_advisory_xact_lock(hashtextextended('pacientes:cpf:' || v_c, 0)); end if;
  select coalesce(array_agg(x), '{}') into v_rep
    from {schema}.paciente_conflitos_novos(new.id, v_vivo_antes, v_user_antes, v_email_antes, v_cpf_antes, new.user_id, new.email, new.cpf) x;
  if 'email' = any(v_rep) then
    raise exception using errcode = 'P0001', message = 'paciente_email_repetido', hint = 'Já existe um aluno com este e-mail.';
  end if;
  if 'cpf' = any(v_rep) then
    raise exception using errcode = 'P0001', message = 'paciente_cpf_repetido', hint = 'Já existe um aluno com este CPF.';
  end if;
  return new;
end;
$$;
revoke execute on function {schema}.pacientes_unicos_email_cpf() from public, anon, authenticated;

-- o nome vem depois de trg_pacientes_guard_vinculos e trg_pacientes_login_acesso_app (BEFORE roda em ordem alfabética): a trava
-- confere o user_id que vai ficar (o guarda desfaz o que o app tentar mudar nele)
drop trigger if exists trg_pacientes_unicos_email_cpf on {schema}.pacientes;
create trigger trg_pacientes_unicos_email_cpf
  before insert or update of email, cpf, deleted_at, user_id on {schema}.pacientes
  for each row execute function {schema}.pacientes_unicos_email_cpf();

-- ============================================================================================================
-- 4. Pré-checagem da tela (ao sair do campo): só booleanos
-- ============================================================================================================
create or replace function {schema}.paciente_dado_livre(p_email text default null, p_cpf text default null, p_paciente uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p {schema}.pacientes%rowtype;
  v_vivo boolean := false;
  v_email_livre boolean := true;
  v_cpf_livre boolean := true;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  -- só profissional (membro ativo de alguma conta) ou master: aluno e visitante não sondam e-mail/CPF
  if not ({schema}.eh_master() or exists (select 1 from {schema}.conta_membros m where m.user_id = v_uid and m.status = 'ativo')) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if p_paciente is not null then
    select * into v_p from {schema}.pacientes where id = p_paciente;
    if not found or not ({schema}.eh_master() or {schema}.w14_pode_editar(p_paciente)) then
      return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
    end if;
    v_vivo := v_p.deleted_at is null;
  end if;
  -- editar: o que muda é só o campo conferido (o outro fica como está) e só conta o conflito que o valor novo cria
  if {schema}.normalizar_email(p_email) is not null then
    v_email_livre := not exists (select 1 from {schema}.paciente_conflitos_novos(p_paciente, v_vivo, v_p.user_id, v_p.email, v_p.cpf,
                                                                                 v_p.user_id, p_email, v_p.cpf) c where c = 'email');
  end if;
  if {schema}.normalizar_cpf(p_cpf) is not null then
    v_cpf_livre := not exists (select 1 from {schema}.paciente_conflitos_novos(p_paciente, v_vivo, v_p.user_id, v_p.email, v_p.cpf,
                                                                               v_p.user_id, v_p.email, p_cpf) c where c = 'cpf');
  end if;
  return jsonb_build_object('ok', true, 'email_livre', v_email_livre, 'cpf_livre', v_cpf_livre);
end;
$$;
revoke execute on function {schema}.paciente_dado_livre(text, text, uuid) from public, anon;
grant execute on function {schema}.paciente_dado_livre(text, text, uuid) to authenticated, service_role;

-- ============================================================================================================
-- 5. As funções das telas devolvem o erro em JSON (o mesmo corpo de antes + a conferência da W16b)
-- ============================================================================================================

-- Novo aluno › Cadastrar (W13)
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
  -- W16b: e-mail único entre os alunos de pessoas diferentes, em QUALQUER conta (o gatilho do banco confere de novo)
  if v_email is not null and exists (select 1 from {schema}.paciente_conflitos(null, null, v_email, null) c where c.campo = 'email') then
    return jsonb_build_object('ok', false, 'erro', 'email_repetido', 'campos', jsonb_build_array('email'));
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

-- Editar dados do aluno (W14)
create or replace function {schema}.aluno_salvar_dados(p_aluno uuid, p_dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_nome text;
  v_apelido text;
  v_nasc date;
  v_genero text;
  v_cpf text;
  v_tel text;
  v_email text;
  v_objetivo text;
  v_resumo text;
  v_rep text[];
begin
  if jsonb_typeof(d) <> 'object' then return jsonb_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  if not {schema}.w14_pode_editar(v_id) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  select * into v_p from {schema}.pacientes where id = v_id for update;

  v_nome := case when d ? 'nome' then left(regexp_replace(btrim(coalesce(d ->> 'nome', '')), '\s+', ' ', 'g'), 120) else v_p.nome end;
  if d ? 'nome' and (v_nome is null or length(v_nome) < 2) then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  v_apelido := case when d ? 'apelido' then nullif(left(btrim(coalesce(d ->> 'apelido', '')), 40), '') else v_p.apelido end;
  if d ? 'nascimento' then
    if nullif(btrim(coalesce(d ->> 'nascimento', '')), '') is null then
      v_nasc := null;
    elsif (d ->> 'nascimento') !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    else
      begin
        v_nasc := (d ->> 'nascimento')::date;
      exception when others then
        return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
      end;
      if v_nasc < date '1900-01-01' or v_nasc > (now() at time zone 'America/Sao_Paulo')::date then
        return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
      end if;
    end if;
  else
    v_nasc := v_p.nascimento;
  end if;
  v_genero := case when d ? 'genero' then nullif(btrim(coalesce(d ->> 'genero', '')), '') else v_p.genero end;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then
    return jsonb_build_object('ok', false, 'erro', 'genero_invalido');
  end if;
  v_cpf := case when d ? 'cpf' then nullif(regexp_replace(coalesce(d ->> 'cpf', ''), '\D', '', 'g'), '') else v_p.cpf end;
  if d ? 'cpf' and v_cpf is not null and length(v_cpf) <> 11 then return jsonb_build_object('ok', false, 'erro', 'cpf_invalido'); end if;
  v_tel := case when d ? 'telefone' then nullif(regexp_replace(coalesce(d ->> 'telefone', ''), '\D', '', 'g'), '') else v_p.telefone end;
  if d ? 'telefone' and v_tel is not null and length(v_tel) not between 10 and 13 then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  end if;
  v_email := case when d ? 'email' then nullif(lower(btrim(coalesce(d ->> 'email', ''))), '') else v_p.email end;
  if d ? 'email' and v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  v_objetivo := case when d ? 'objetivo' then nullif(left(btrim(coalesce(d ->> 'objetivo', '')), 60), '') else v_p.objetivo end;
  v_resumo := case when d ? 'resumo' then nullif(left(btrim(coalesce(d ->> 'resumo', '')), 4000), '') else v_p.resumo end;

  -- W16b: e-mail e CPF únicos entre os alunos de pessoas diferentes — só o que o valor NOVO repete (o que já era repetido antes
  -- continua editável); o gatilho do banco confere de novo
  select coalesce(array_agg(distinct c order by c), '{}') into v_rep
    from {schema}.paciente_conflitos_novos(v_id, v_p.deleted_at is null, v_p.user_id, v_p.email, v_p.cpf, v_p.user_id, v_email, v_cpf) c;
  if cardinality(v_rep) > 0 then
    return jsonb_build_object('ok', false, 'erro', case when 'email' = any(v_rep) then 'email_repetido' else 'cpf_repetido' end,
                              'campos', to_jsonb(v_rep));
  end if;
  update {schema}.pacientes
     set nome = v_nome, apelido = v_apelido, nascimento = v_nasc, genero = v_genero, cpf = v_cpf, telefone = v_tel,
         email = v_email, objetivo = v_objetivo, resumo = v_resumo
   where id = v_id;
  if v_p.user_id is not null and (v_nome is distinct from v_p.nome or v_genero is distinct from v_p.genero or v_nasc is distinct from v_p.nascimento) then
    perform {schema}.espelho_disparar();
  end if;
  return jsonb_build_object('ok', true, 'perfil', {schema}.aluno_perfil(v_id));
end;
$$;

-- /c/ — cadastro pelo link do profissional (W13; público, com captcha e limite na função alunos)
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
  -- W16b: e-mail que já é de um aluno (em qualquer conta) não vira cadastro novo — só diz que já existe (sem dizer de quem)
  if v_email is not null and exists (select 1 from {schema}.paciente_conflitos(null, null, v_email, null) c where c.campo = 'email') then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_email_existe');
  end if;
  insert into {schema}.cadastros_pendentes (nutricionista_id, conta_id, nome, nascimento, telefone, email, genero, observacoes)
  values (v_dono_user, v_dono_conta, v_nome, v_nasc, v_tel, v_email, v_genero, v_obs)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Alunos › Pendentes › Aprovar (W13)
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
$$;
