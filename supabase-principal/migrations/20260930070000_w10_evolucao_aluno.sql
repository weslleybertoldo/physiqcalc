-- Physiq W10 — App do aluno: Evolução (tela 4; paridade C24–C26, N-34, N-35 do lado do aluno). Idempotente.
-- SÓ ACRESCENTA (nenhuma tabela, coluna ou dado muda; nenhuma política de tabela muda):
--   · minha_evolucao()               as antropometrias e as fotos de evolução do PRÓPRIO aluno, de TODAS as matrículas dele (P7)
--                                    com o módulo Nutrição, com o nome de quem fez (a nutricionista) e o objetivo (NF8) —
--                                    só leitura, security definer (authenticated). A observação da nutricionista NÃO vai: no
--                                    site antigo o paciente nunca via antropometria nem foto de evolução (o /app/* não tinha e
--                                    nenhuma política de leitura do paciente existe nessas 2 tabelas — continua não existindo);
--   · aluno_le_foto_evolucao(path)   true quando o arquivo do bucket privado "evolucao" é de uma foto de evolução do aluno logado
--                                    (a política de Storage do bloco compartilhado usa: o app assina a URL da própria foto).
-- O app soma isto às avaliações e fotos do Banco do Treino (physiq_avaliacoes, physiq_registros_fotos, pelo REST de lá, com a
-- regra de hoje). Nada é copiado de um banco para o outro.
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py; o bloco compartilhado monta a política com as funções que já
-- existem, então dá para ir staging → produção em 2 passos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930070000_w10_evolucao_aluno.sql --so staging
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930070000_w10_evolucao_aluno.sql --compartilhado
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930070000_w10_evolucao_aluno.sql --so public
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930070000_w10_evolucao_aluno.sql --compartilhado
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)

create or replace function {schema}.minha_evolucao() returns jsonb
language sql stable security definer set search_path = '' as $$
  with minhas as (
    select p.id
      from {schema}.pacientes p
      left join {schema}.contas c on c.id = p.conta_id
     where auth.uid() is not null
       and p.user_id = auth.uid() and p.deleted_at is null
       -- a mesma regra de módulo do Perfil (W7): nutricionista numa conta com Nutrição ou o site antigo (sem conta)
       and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano)))
  )
  select jsonb_build_object(
    'objetivo', (select btrim(p.objetivo) from {schema}.pacientes p
                  where auth.uid() is not null and p.user_id = auth.uid() and p.deleted_at is null
                    and nullif(btrim(coalesce(p.objetivo, '')), '') is not null
                  order by p.ativo desc, p.created_at limit 1),
    'antropometrias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'data', to_char(a.data at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
               'peso', a.peso,
               'altura', a.altura,
               'sexo', a.sexo,
               'idade', a.idade,
               'circunferencias', a.circunferencias,
               'dobras', a.dobras,
               'protocolo', a.protocolo,
               'resultados', a.resultados,
               'autor_id', a.nutricionista_id,
               'autor_nome', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                                from {schema}.profiles pr where pr.id = a.nutricionista_id),
               'criado_em', a.created_at)
             order by a.data, a.created_at)
        from {schema}.antropometrias a
       where a.paciente_id in (select id from minhas) and a.deleted_at is null), '[]'::jsonb),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'data', f.data,
               'posicao', f.posicao,
               'path', f.path,
               'autor_id', f.nutricionista_id,
               'autor_nome', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                                from {schema}.profiles pr where pr.id = f.nutricionista_id),
               'criado_em', f.created_at)
             order by f.data, f.created_at)
        from {schema}.fotos_evolucao f
       where f.paciente_id in (select id from minhas) and f.deleted_at is null), '[]'::jsonb));
$$;
revoke execute on function {schema}.minha_evolucao() from public, anon;
grant execute on function {schema}.minha_evolucao() to authenticated, service_role;

create or replace function {schema}.aluno_le_foto_evolucao(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
      from {schema}.fotos_evolucao f
      join {schema}.pacientes p on p.id = f.paciente_id
      left join {schema}.contas c on c.id = p.conta_id
     where f.path = p_path and f.deleted_at is null
       and p.user_id = auth.uid() and p.deleted_at is null
       and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))));
$$;
revoke execute on function {schema}.aluno_le_foto_evolucao(text) from public, anon;
grant execute on function {schema}.aluno_le_foto_evolucao(text) to authenticated, service_role;

-- @@ compartilhado
-- Storage (o bucket "evolucao" é um só para os 2 schemas): o aluno dono lê o arquivo da própria foto (é o que deixa assinar a URL).
-- Soma à política de hoje ("evolucao: ler as proprias ou master", da nutricionista pela pasta). Montada com as funções que já
-- existem (staging primeiro; na produção o mesmo bloco recria a política com as 2).
do $w10$
declare
  v_expr text;
begin
  v_expr := concat_ws(' or ',
    case when to_regprocedure('staging.aluno_le_foto_evolucao(text)') is not null then 'staging.aluno_le_foto_evolucao(name)' end,
    case when to_regprocedure('public.aluno_le_foto_evolucao(text)') is not null then 'public.aluno_le_foto_evolucao(name)' end);
  if coalesce(v_expr, '') = '' then
    raise notice 'W10: nenhuma aluno_le_foto_evolucao ainda — aplique o bloco do schema antes';
    return;
  end if;
  execute 'drop policy if exists "evolucao: o aluno le as proprias fotos" on storage.objects';
  execute format('create policy "evolucao: o aluno le as proprias fotos" on storage.objects for select to authenticated using (bucket_id = %L and (%s))',
                 'evolucao', v_expr);
end
$w10$;
