-- Homologação do Physiq — hml-09 no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) — H-23 (08/10/2026). Idempotente.
-- Nenhum dado muda (só 1 função nova, de leitura).
--
-- O Auth do Treino também é um só para os 2 schemas: a exclusão pelo staging (delete-my-account em modo servidor, a pedido da
-- excluir-minha-conta do principal com x-schema: staging) faz o "soft delete" do login do Treino, e esse login é o MESMO da
-- produção quando a pessoa usa os 2 ambientes (a trocar-token acha o usuário do Treino pelo e-mail). A cascata das 15 FKs de
-- public para auth.users (todas on delete cascade) e o login morto atingem a produção.
--   D3  staging.physiq_pegada_em_producao(p_principal, p_treino): a pessoa tem pegada na produção do Treino? Sim quando há vínculo
--       de produção (public.physiq_identidades) pelo id do principal OU pelo id do Treino, ou quando alguma coluna de public que
--       aponta para auth.users (FK, lidas do catálogo a cada chamada) tem linha com o id do Treino. O id do Treino pode vir vazio
--       (antes do vínculo no staging): aí vale só a conferência pelo principal. Formato igual ao do principal:
--       {"em_producao": bool, "colunas": ["tabela.coluna"]} — a delete-my-account recusa (403 conta_real_no_staging, motivo
--       dados_em_producao) ANTES do sem_vinculo, em conferir, excluir, conferir_profissional e excluir_profissional.
--   Nada fica de fora: o gatilho handle_new_user do Treino cria public.physiq_profiles só para o login que NÃO nasceu pelo staging
--   (a trocar-token do staging cria com ambiente=staging → staging.physiq_profiles). Medido ao vivo (08/10/2026): dos 58 logins
--   de teste, 4 têm public.physiq_profiles e os 4 também têm vínculo em public.physiq_identidades (nasceram na produção); 2 deles
--   têm vínculo no staging — são os que esta trava segura. FK de várias colunas: nenhuma hoje (as 15 são de 1 coluna).
-- Só a service_role executa (a borda). Dono postgres, como as vizinhas (physiq_excluir_aluno / physiq_excluir_profissional).
--
-- Aplicar 1 vez, SÓ no staging, na MESMA chamada da Management API (database/query):
--   set physiq.schemas = 'staging'; <este arquivo>          (dry-run: begin; set physiq.schemas = 'staging'; <este arquivo> rollback;)
-- Com outro valor (ou sem o SET) recusa: este arquivo só cria staging.* — a produção não muda.
-- Sem esta função, a delete-my-account da hml-09 falha fechada no staging (500); a produção não sente.
-- Reversa: supabase/reversas/20261008090100_hml09_exclusao_staging_reversa.sql

do $$
begin
  if coalesce(nullif(btrim(current_setting('physiq.schemas', true)), ''), '(vazio)') <> 'staging' then
    raise exception 'hml-09: este arquivo só cria staging.* — defina physiq.schemas = staging (recebi %)',
      coalesce(nullif(btrim(current_setting('physiq.schemas', true)), ''), '(vazio)');
  end if;
end
$$;

create or replace function staging.physiq_pegada_em_producao(p_principal uuid, p_treino uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v boolean;
  v_cols text[] := array[]::text[];
begin
  if p_principal is null and p_treino is null then
    raise exception 'physiq_pegada_em_producao: ids vazios';
  end if;
  -- o vínculo de produção pelo id do principal (essa coluna não tem FK: o login do principal mora no outro banco)
  if p_principal is not null
     and exists (select 1 from public.physiq_identidades i where i.principal_user_id = p_principal) then
    v_cols := v_cols || 'physiq_identidades.principal_user_id'::text;
  end if;
  -- pelo id do Treino: as FKs de public para auth.users (inclusive physiq_identidades.treino_user_id e physiq_profiles.id)
  if p_treino is not null then
    for r in
      select distinct cl.relname::text as tabela, a.attname::text as coluna
        from pg_catalog.pg_constraint c
        join pg_catalog.pg_class cl on cl.oid = c.conrelid
        cross join lateral unnest(c.conkey, c.confkey) as k(col, ref)
        join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
        join pg_catalog.pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.ref
       where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace
         and c.conparentid = 0 and fa.attname = 'id'
       order by 1, 2
    loop
      execute format('select exists (select 1 from public.%I where %I = $1)', r.tabela, r.coluna) into v using p_treino;
      if v then
        v_cols := v_cols || (r.tabela || '.' || r.coluna);
      end if;
    end loop;
  end if;
  return jsonb_build_object('em_producao', cardinality(v_cols) > 0, 'colunas', to_jsonb(v_cols));
end;
$$;
revoke all on function staging.physiq_pegada_em_producao(uuid, uuid) from public, anon, authenticated;
grant execute on function staging.physiq_pegada_em_producao(uuid, uuid) to service_role;

-- conferência: dono postgres, SECURITY DEFINER, STABLE e EXECUTE só da service_role — senão a chamada inteira volta
do $$
declare
  v_oid oid := to_regprocedure('staging.physiq_pegada_em_producao(uuid,uuid)');
begin
  if v_oid is null then
    raise exception 'hml-09: staging.physiq_pegada_em_producao(uuid, uuid) não existe';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
                  where p.oid = v_oid and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres' and p.prosecdef
                    and p.provolatile::text = 's')
     or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'hml-09: staging.physiq_pegada_em_producao com dono, SECURITY DEFINER, volatilidade ou EXECUTE fora do esperado';
  end if;
end
$$;
