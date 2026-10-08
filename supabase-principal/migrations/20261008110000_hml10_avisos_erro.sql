-- Homologação do Physiq — hml-10 / H-26 (D4) (08/10/2026): a trava dos avisos de erro no Telegram. Idempotente.
--
-- O aviso de erro das funções (_shared/avisar-erro.ts) e a função erro-avisar chamam {schema}.registrar_aviso_erro antes de
-- mandar cada aviso ao Telegram (grupo Validação › tópico Physiq). O mesmo erro (mesma assinatura: 8 caracteres hex, o código
-- que a tela de erro mostra) avisa no máximo 1 vez a cada 10 minutos, e cada schema manda no máximo 30 avisos por hora (uma
-- enxurrada de erros não vira uma enxurrada de mensagens); o aviso seguinte diz quantos iguais foram segurados. Antes do banco
-- há a trava na memória da instância (_shared/erros.ts, criarTrava): com o banco fora do ar o aviso sai assim mesmo.
--   {schema}.avisos_erro       1 linha por assinatura: origem, lugar (a linha 📍), exemplo da mensagem (≤ 300), primeiro_em,
--                              ultimo_aviso_em, vezes (quantas chegaram ao banco) e segurados (desde o último aviso)
--   {schema}.avisos_erro_hora  quantos avisos saíram em cada hora (o teto de 30)
--   {schema}.registrar_aviso_erro(p_assinatura, p_origem, p_lugar, p_exemplo) → -1 = segura · N ≥ 0 = manda (N = iguais
--                              segurados desde o último aviso). Assinatura fora do formato → -1. Apaga o que passou de 30 dias.
-- Só a service_role (as funções) usa: RLS ligada sem policy, nada para public/anon/authenticated (o EXECUTE da função também é
-- tirado de public, anon e authenticated — os default privileges do Supabase dão EXECUTE a toda função nova). SECURITY
-- INVOKER: quem chama é a própria service_role. O que fica guardado já vem limpo (_shared/erros.ts).
-- Modelo: migração 0036 do Nativo OS (registrar_aviso_erro), com o teto por hora numa tabela própria.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]   (backup do catálogo antes)
-- Reversa: supabase-principal/reversas/20261008110000_hml10_avisos_erro_reversa.sql

create table if not exists {schema}.avisos_erro (
  assinatura text primary key check (assinatura ~ '^[0-9a-f]{8}$'),
  origem text not null default '?' check (char_length(origem) <= 20),
  lugar text not null default '' check (char_length(lugar) <= 200),
  exemplo text not null default '' check (char_length(exemplo) <= 300),
  primeiro_em timestamptz not null default now(),
  ultimo_aviso_em timestamptz,
  vezes integer not null default 0 check (vezes >= 0),
  segurados integer not null default 0 check (segurados >= 0)
);
comment on table {schema}.avisos_erro is
  'hml-10 (D4): a trava dos avisos de erro no Telegram (1 por assinatura a cada 10 min). Só a service_role; texto já limpo (_shared/erros.ts); some com 30 dias.';
alter table {schema}.avisos_erro enable row level security;
revoke all on table {schema}.avisos_erro from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.avisos_erro to service_role;

create table if not exists {schema}.avisos_erro_hora (
  hora timestamptz primary key,
  n integer not null default 0 check (n >= 0)
);
comment on table {schema}.avisos_erro_hora is
  'hml-10 (D4): quantos avisos de erro saíram em cada hora (no máximo 30 por hora neste schema). Só a service_role; some com 30 dias.';
alter table {schema}.avisos_erro_hora enable row level security;
revoke all on table {schema}.avisos_erro_hora from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.avisos_erro_hora to service_role;

-- -1 = segura · N >= 0 = manda (N = quantos iguais foram segurados desde o último aviso desta assinatura).
-- Concorrência: o update da linha da assinatura (e o da hora) trava a linha até o fim da transação — 2 chamadas iguais ao mesmo
-- tempo não mandam 2 avisos.
create or replace function {schema}.registrar_aviso_erro(p_assinatura text, p_origem text, p_lugar text, p_exemplo text)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_agora timestamptz := now();
  v_hora timestamptz := date_trunc('hour', now());
  v_ultimo timestamptz;
  v_segurados integer;
  v_n integer;
begin
  if p_assinatura is null or p_assinatura !~ '^[0-9a-f]{8}$' then
    return -1;
  end if;

  -- 30 dias: some o que ficou velho (as 2 tabelas ficam pequenas)
  delete from {schema}.avisos_erro where coalesce(ultimo_aviso_em, primeiro_em) < v_agora - interval '30 days';
  delete from {schema}.avisos_erro_hora where hora < v_agora - interval '30 days';

  insert into {schema}.avisos_erro (assinatura, origem, lugar, exemplo)
  values (p_assinatura, left(coalesce(p_origem, '?'), 20), left(coalesce(p_lugar, ''), 200), left(coalesce(p_exemplo, ''), 300))
  on conflict (assinatura) do nothing;

  update {schema}.avisos_erro set vezes = vezes + 1
   where assinatura = p_assinatura
  returning ultimo_aviso_em, segurados into v_ultimo, v_segurados;

  -- 1 aviso igual a cada 10 minutos
  if v_ultimo is not null and v_ultimo > v_agora - interval '10 minutes' then
    update {schema}.avisos_erro set segurados = segurados + 1 where assinatura = p_assinatura;
    return -1;
  end if;

  -- no máximo 30 avisos por hora neste schema
  insert into {schema}.avisos_erro_hora (hora, n) values (v_hora, 0) on conflict (hora) do nothing;
  update {schema}.avisos_erro_hora set n = n + 1 where hora = v_hora and n < 30 returning n into v_n;
  if v_n is null then
    update {schema}.avisos_erro set segurados = segurados + 1 where assinatura = p_assinatura;
    return -1;
  end if;

  update {schema}.avisos_erro
     set ultimo_aviso_em = v_agora,
         segurados = 0,
         origem = left(coalesce(p_origem, '?'), 20),
         lugar = left(coalesce(p_lugar, ''), 200),
         exemplo = left(coalesce(p_exemplo, ''), 300)
   where assinatura = p_assinatura;
  return coalesce(v_segurados, 0);
end
$$;
comment on function {schema}.registrar_aviso_erro(text, text, text, text) is
  'hml-10 (D4): -1 = segura o aviso de erro (igual há menos de 10 min ou 30 na hora) · N >= 0 = manda (N iguais segurados). Só a service_role.';
revoke all on function {schema}.registrar_aviso_erro(text, text, text, text) from public, anon, authenticated;
grant execute on function {schema}.registrar_aviso_erro(text, text, text, text) to service_role;

-- conferência: RLS ligada, nenhuma policy, nada para public/anon/authenticated, tudo para a service_role; a função só da
-- service_role, SECURITY INVOKER e com search_path vazio — senão o bloco inteiro volta
do $$
declare
  v_tabela text;
  v_funcao regprocedure := to_regprocedure('{schema}.registrar_aviso_erro(text, text, text, text)');
  v_papel text;
begin
  foreach v_tabela in array array['{schema}.avisos_erro', '{schema}.avisos_erro_hora'] loop
    if to_regclass(v_tabela) is null then
      raise exception 'hml-10: % não existe', v_tabela;
    end if;
    if not exists (select 1 from pg_catalog.pg_class c where c.oid = to_regclass(v_tabela) and c.relrowsecurity) then
      raise exception 'hml-10: % sem RLS', v_tabela;
    end if;
    if exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass(v_tabela)) then
      raise exception 'hml-10: % tem policy (não deveria ter nenhuma)', v_tabela;
    end if;
    foreach v_papel in array array['public', 'anon', 'authenticated'] loop
      if pg_catalog.has_table_privilege(v_papel, v_tabela, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
        raise exception 'hml-10: % com privilégio para %', v_tabela, v_papel;
      end if;
    end loop;
    if not (pg_catalog.has_table_privilege('service_role', v_tabela, 'SELECT')
            and pg_catalog.has_table_privilege('service_role', v_tabela, 'INSERT')
            and pg_catalog.has_table_privilege('service_role', v_tabela, 'UPDATE')
            and pg_catalog.has_table_privilege('service_role', v_tabela, 'DELETE')) then
      raise exception 'hml-10: % sem os privilégios da service_role', v_tabela;
    end if;
  end loop;

  if v_funcao is null then
    raise exception 'hml-10: registrar_aviso_erro não existe';
  end if;
  foreach v_papel in array array['public', 'anon', 'authenticated'] loop
    if pg_catalog.has_function_privilege(v_papel, v_funcao, 'EXECUTE') then
      raise exception 'hml-10: registrar_aviso_erro executável por %', v_papel;
    end if;
  end loop;
  if not pg_catalog.has_function_privilege('service_role', v_funcao, 'EXECUTE') then
    raise exception 'hml-10: registrar_aviso_erro sem EXECUTE para a service_role';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
                  where p.oid = v_funcao and not p.prosecdef and p.provolatile = 'v'
                    and p.proconfig is not null and 'search_path=""' = any (p.proconfig)) then
    raise exception 'hml-10: registrar_aviso_erro fora do esperado (SECURITY INVOKER, VOLATILE, search_path vazio)';
  end if;
end
$$;
