-- Reversa das contas de teste no domínio próprio (supabase-principal/migrations/20261031150000_contas_teste_dominio_proprio.sql).
-- Idempotente: roda com ou sem a migração aplicada. Devolve a regra VELHA ao banco (teste@teste.com + *teste*@physiqcalc.app /
-- *teste*@physiqnutri.app) e o criar_minha_conta com a regra escrita por extenso — os corpos de antes (pg_get_functiondef de 31/10/2026).
-- ⚠️ A regra velha é a do achado médio da revisão de segurança (domínios livres): usar só se a nova quebrar algo, e junto do revert
-- do código (as 5 cópias da regra) e das funções republicadas.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261031150000_contas_teste_dominio_proprio_reversa.sql --so staging
--          (e --so public, se a migração tiver ido ao public)

select set_config('lock_timeout', '5s', true);

create or replace function {schema}.email_de_teste(p_email text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select lower(btrim(coalesce(p_email, ''))) = 'teste@teste.com'
      or lower(btrim(coalesce(p_email, ''))) ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$';
$function$;

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
  if '{schema}' = 'staging' and not (lower(coalesce(v_email, '')) = 'teste@teste.com'
       or lower(coalesce(v_email, '')) ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$') then
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

do $c$
begin
  if not ({schema}.email_de_teste('teste@teste.com') and {schema}.email_de_teste('aluno.teste.claude@physiqnutri.app')) then
    raise exception 'reversa das contas de teste: a regra velha não voltou';
  end if;
end $c$;
