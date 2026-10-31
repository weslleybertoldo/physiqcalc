-- Contas de teste no domínio próprio (31/10/2026) — o achado médio da 2ª revisão de segurança do restaurar-login (30/10). Idempotente.
--
-- Antes: conta de teste = teste@teste.com (domínio de outra pessoa) ou *teste*@physiqcalc.app / *teste*@physiqnutri.app (2 domínios
-- NÃO registrados). O repositório é público: quem registrasse um desses domínios entraria nas contas pelo "esqueci a senha" e passaria
-- nas travas "só conta de teste" (o staging, o so_teste do restaurar-login, a play-compras…).
-- Agora (decisão do dono, 31/10/2026): conta de teste = SÓ *teste*@physiqcalc.com.br — a parte antes do @ contém "teste" e o domínio
-- é exatamente physiqcalc.com.br (do dono). As contas de teste dos domínios velhos saíram antes, pelo "Excluir minha conta"; ficam
-- teste@physiqcalc.com.br (a do dono) e as 2 da revisão da Play (revisao.*@physiqcalc.com.br — sem "teste": não são de teste).
-- A mesma regra no código: src/nucleo/contasTeste.ts, supabase-principal/functions/_shared/{login,master,convites}-regras.ts e o Treino
-- (supabase/functions/_shared/espelho/regras.ts); src/nucleo/loginRegras.test.ts confere que as cópias concordam.
--   1. {schema}.email_de_teste(p_email): a regra nova, com a mesma assinatura e os mesmos atributos (SQL, IMMUTABLE, search_path '').
--      CREATE OR REPLACE mantém o dono e as permissões. Quem chama (aceitar_no_acesso, aluno_convidar, excluir_conta_profissional,
--      handle_new_user, restaurar_login_recusa, exigir_conta_de_teste… — conferido no banco vivo em 31/10/2026) passa a valer pela
--      regra nova sem mudar.
--   2. {schema}.criar_minha_conta: a única função com a regra escrita por extenso (W4, de antes da email_de_teste) passa a chamar
--      {schema}.email_de_teste. Corpo = pg_get_functiondef do banco vivo em 31/10/2026 (igual nos 2 schemas, fora o nome), só com a
--      condição trocada; mesmos atributos (SECURITY DEFINER, search_path '').
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]   (depois --so public; backup antes)
-- Reversa: supabase-principal/reversas/20261031150000_contas_teste_dominio_proprio_reversa.sql

select set_config('lock_timeout', '5s', true);

-- 1. a regra
create or replace function {schema}.email_de_teste(p_email text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select lower(btrim(coalesce(p_email, ''))) ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiqcalc\.com\.br$';
$function$;

-- 2. o criar_minha_conta (W4) passa a usar a regra
CREATE OR REPLACE FUNCTION {schema}.criar_minha_conta(p_nome text, p_tipo text, p_registro text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_nome text := left(btrim(coalesce(p_nome, '')), 80);
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_registro text := nullif(left(btrim(coalesce(p_registro, '')), 30), '');
  v_perfil_nome text;
  v_papeis text[];
  v_existente uuid;
  v_conta uuid;
  v_dias integer;
  v_teste date;
  v_codigo text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select u.email, coalesce(nullif(btrim(pr.nome), ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    into v_email, v_perfil_nome
    from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = v_uid;
  -- P26: o staging só aceita contas de teste (o Auth é o mesmo da produção)
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  -- idempotente ANTES de validar: quem já criou a conta nova recebe a mesma (clique duplo, voltar e tentar de novo)
  select c.id into v_existente from {schema}.contas c
   where c.dono_id = v_uid and c.origem = 'nova' order by c.criado_em limit 1;
  if v_existente is not null then
    return jsonb_build_object('ok', true, 'conta_id', v_existente, 'ja_existia', true);
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'nome_invalido');
  end if;
  if v_tipo not in ('personal', 'nutricionista', 'academico', 'outra_area') then
    return jsonb_build_object('ok', false, 'erro', 'tipo_invalido');
  end if;
  -- quem já é profissional de uma conta (legado ou equipe) não abre outra por aqui
  if exists (select 1 from {schema}.conta_membros m where m.user_id = v_uid and m.status = 'ativo') then
    return jsonb_build_object('ok', false, 'erro', 'ja_tem_conta');
  end if;
  v_papeis := case v_tipo
    when 'personal' then array['dono', 'personal']
    when 'outra_area' then array['dono', 'personal', 'nutricionista']
    else array['dono', 'nutricionista'] end;
  v_dias := coalesce((select (a.valor #>> '{}')::integer from {schema}.app_config a
                       where a.chave = 'teste_dias' and jsonb_typeof(a.valor) = 'number'), 14);
  v_teste := {schema}.cobranca_hoje() + v_dias;
  insert into {schema}.contas (nome, dono_id, origem, plano, faixa, periodicidade, situacao, teste_ate, tolerancia_dias,
                               cobranca_legada, regra_pix, recebimento_modo, bloquear_app_inadimplente)
  values (v_nome, v_uid, 'nova', 'treino_nutricao', 'f10', 'mensal', 'teste', v_teste, 0, false, 'mes', 'pix_manual', false)
  returning id into v_conta;
  v_codigo := {schema}.gerar_codigo_membro(coalesce(v_perfil_nome, v_nome));
  insert into {schema}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
  values (v_conta, v_uid, v_papeis, 'ativo', v_codigo);
  update {schema}.profiles
     set tipo_perfil = v_tipo,
         dados_profissionais = coalesce(dados_profissionais, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'registro', v_registro,
           'crn', case when v_tipo in ('nutricionista', 'academico') then v_registro end,
           'cref', case when v_tipo = 'personal' then v_registro end))
   where id = v_uid;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_conta, 'plano', jsonb_build_object('criada_por', 'sou_profissional', 'plano', 'treino_nutricao', 'faixa', 'f10',
                                               'teste_ate', v_teste, 'tipo_perfil', v_tipo, 'papeis', to_jsonb(v_papeis)), v_uid);
  perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', v_uid));
  return jsonb_build_object('ok', true, 'conta_id', v_conta, 'ja_existia', false, 'teste_ate', v_teste,
                            'codigo_convite', v_codigo, 'papeis', to_jsonb(v_papeis));
end;
$function$;

-- A conferência do fim (falhou → a transação inteira volta)
do $c$
begin
  if not ({schema}.email_de_teste('teste@physiqcalc.com.br') and {schema}.email_de_teste(' W5.Aluno.TESTE.Claude@PhysiqCalc.com.br ')) then
    raise exception 'contas de teste: a regra nova recusou um e-mail de teste do domínio próprio';
  end if;
  if {schema}.email_de_teste('teste@teste.com') or {schema}.email_de_teste('aluno.teste.claude@physiqnutri.app')
     or {schema}.email_de_teste('admin.teste.claude@physiqcalc.app') or {schema}.email_de_teste('revisao.aluno@physiqcalc.com.br')
     or {schema}.email_de_teste('teste@physiqcalc.com.br.evil.com') or {schema}.email_de_teste('teste@sub.physiqcalc.com.br')
     or {schema}.email_de_teste('teste@gmail.com') or {schema}.email_de_teste(null) then
    raise exception 'contas de teste: a regra nova aceitou um e-mail que não é de teste';
  end if;
  if pg_catalog.pg_get_functiondef('{schema}.criar_minha_conta(text, text, text)'::pg_catalog.regprocedure) ~ 'teste@teste|physiq\(calc' then
    raise exception 'contas de teste: o criar_minha_conta ainda tem a regra velha';
  end if;
  if not (pg_catalog.has_function_privilege('authenticated', '{schema}.email_de_teste(text)', 'execute')
          and pg_catalog.has_function_privilege('service_role', '{schema}.email_de_teste(text)', 'execute')
          and pg_catalog.has_function_privilege('authenticated', '{schema}.criar_minha_conta(text, text, text)', 'execute')
          and not pg_catalog.has_function_privilege('anon', '{schema}.criar_minha_conta(text, text, text)', 'execute')) then
    raise exception 'contas de teste: as permissões mudaram';
  end if;
end $c$;
