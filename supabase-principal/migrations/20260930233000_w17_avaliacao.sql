-- Physiq W17 — Perfil do aluno › Avaliação (banco principal, staging e public; spec §11.3 W17, §4.5 Avaliação, C34–C36, C83,
-- N-34, N-35, NF7). Idempotente; NENHUM dado muda: só funções e políticas que ACRESCENTAM.
--
-- Aplicar (backup ANTES — scripts/backup/; o bloco compartilhado monta a política de Storage com as funções que já existem,
-- então dá para ir staging → produção em 2 passos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930233000_w17_avaliacao.sql --so staging
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930233000_w17_avaliacao.sql --compartilhado
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930233000_w17_avaliacao.sql --so public
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930233000_w17_avaliacao.sql --compartilhado
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
--
-- O que entra:
--   1. aluno_evolucao(aluno): as antropometrias e as fotos de evolução da MATRÍCULA (o mesmo formato da minha_evolucao da W10,
--      com a observação), para quem vê o aluno no painel (a regra do perfil do aluno: w14_matricula_da_rota — dono, personal ou
--      nutricionista responsável, master). O painel soma às avaliações do Banco do Treino (função treino-leitura) — a mesma
--      série que o aluno vê na aba Evolução (W10).
--   2. Storage "evolucao": quem vê o aluno lê o arquivo das fotos dele (assina a URL no painel). Hoje só a nutricionista que
--      subiu (pela pasta), o master e o próprio aluno (W10) leem — o personal e o dono não viam as fotos da nutri.
--   3. antropometrias e fotos_evolucao: quem muda a nutrição do aluno (a nutricionista responsável e o dono com papel de
--      nutricionista — as restritivas da W3 continuam) edita e EXCLUI também o que outra nutri da conta registrou (antes só a
--      autora). O site antigo do Nutri continua igual (as políticas de lá ficam).
--   4. aluno_avisar_avaliacao(aluno): o aviso "avaliação nova" no sino do aluno (NF9, tipo avaliacao_nova — spec §8.1), depois de
--      registrar uma avaliação física (Treino) ou uma antropometria; só quem registra avaliação do aluno; sem repetir o aviso não
--      lido dos últimos 10 minutos. Nada de WhatsApp nem e-mail.

-- ============================================================================================================
-- 1. A evolução do aluno para o painel
-- ============================================================================================================
create or replace function {schema}.aluno_evolucao(p_aluno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
begin
  return jsonb_build_object(
    'paciente_id', v_id,
    'objetivo', (select nullif(btrim(coalesce(p.objetivo, '')), '') from {schema}.pacientes p where p.id = v_id),
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
               'observacao', a.observacao,
               'autor_id', a.nutricionista_id,
               'autor_nome', {schema}.nome_da_pessoa(a.nutricionista_id),
               'criado_em', a.created_at)
             order by a.data, a.created_at)
        from {schema}.antropometrias a
       where a.paciente_id = v_id and a.deleted_at is null), '[]'::jsonb),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'data', f.data,
               'posicao', f.posicao,
               'path', f.path,
               'observacao', f.observacao,
               'autor_id', f.nutricionista_id,
               'autor_nome', {schema}.nome_da_pessoa(f.nutricionista_id),
               'criado_em', f.created_at)
             order by f.data, f.created_at)
        from {schema}.fotos_evolucao f
       where f.paciente_id = v_id and f.deleted_at is null), '[]'::jsonb));
end;
$$;
revoke execute on function {schema}.aluno_evolucao(uuid) from public, anon;
grant execute on function {schema}.aluno_evolucao(uuid) to authenticated, service_role;

-- o arquivo é de uma foto de evolução de um aluno que quem chama vê (a política de Storage do bloco compartilhado usa)
create or replace function {schema}.profissional_le_foto_evolucao(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from {schema}.fotos_evolucao f
     where f.path = p_path and f.deleted_at is null and {schema}.pode_ver_aluno(f.paciente_id));
$$;
revoke execute on function {schema}.profissional_le_foto_evolucao(text) from public, anon;
grant execute on function {schema}.profissional_le_foto_evolucao(text) to authenticated, service_role;

-- ============================================================================================================
-- 3. Quem muda a nutrição do aluno edita e exclui o que outra nutri da conta registrou (soma às "as proprias" do Nutri)
-- ============================================================================================================
drop policy if exists "antropometrias: W17 editar pela conta (nutricao)" on {schema}.antropometrias;
create policy "antropometrias: W17 editar pela conta (nutricao)" on {schema}.antropometrias for update to authenticated
  using ({schema}.pode_editar_aluno(paciente_id, 'nutricao')) with check ({schema}.pode_editar_aluno(paciente_id, 'nutricao'));
drop policy if exists "antropometrias: W17 apagar pela conta (nutricao)" on {schema}.antropometrias;
create policy "antropometrias: W17 apagar pela conta (nutricao)" on {schema}.antropometrias for delete to authenticated
  using ({schema}.pode_editar_aluno(paciente_id, 'nutricao'));
drop policy if exists "fotos_evolucao: W17 editar pela conta (nutricao)" on {schema}.fotos_evolucao;
create policy "fotos_evolucao: W17 editar pela conta (nutricao)" on {schema}.fotos_evolucao for update to authenticated
  using ({schema}.pode_editar_aluno(paciente_id, 'nutricao')) with check ({schema}.pode_editar_aluno(paciente_id, 'nutricao'));
drop policy if exists "fotos_evolucao: W17 apagar pela conta (nutricao)" on {schema}.fotos_evolucao;
create policy "fotos_evolucao: W17 apagar pela conta (nutricao)" on {schema}.fotos_evolucao for delete to authenticated
  using ({schema}.pode_editar_aluno(paciente_id, 'nutricao'));

-- ============================================================================================================
-- 4. O aviso "avaliação nova" no sino do aluno (NF9)
--    Retorno: {ok, avisado, repetido, sem_login} ou {ok:false, erro:'sem_permissao'}. Erros (raise) da w14_matricula_da_rota.
-- ============================================================================================================
create or replace function {schema}.aluno_avisar_avaliacao(p_aluno uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_user uuid;
  v_titulo constant text := 'Nova avaliação no seu histórico';
begin
  if not ({schema}.pode_editar_aluno(v_id, 'treino') or {schema}.pode_editar_aluno(v_id, 'nutricao')) then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;
  select user_id into v_user from {schema}.pacientes where id = v_id;
  if v_user is null then
    return jsonb_build_object('ok', true, 'avisado', false, 'sem_login', true);
  end if;
  if exists (select 1 from {schema}.avisos a
              where a.destino_user_id = v_user and a.tipo = 'avaliacao_nova' and a.lido_em is null
                and a.criado_em > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true, 'avisado', false, 'repetido', true);
  end if;
  insert into {schema}.avisos (destino_user_id, tipo, titulo, link) values (v_user, 'avaliacao_nova', v_titulo, '/evolucao');
  return jsonb_build_object('ok', true, 'avisado', true);
end;
$$;
revoke execute on function {schema}.aluno_avisar_avaliacao(uuid) from public, anon;
grant execute on function {schema}.aluno_avisar_avaliacao(uuid) to authenticated, service_role;

-- @@ compartilhado
-- Storage (o bucket "evolucao" é um só para os 2 schemas): quem vê o aluno lê o arquivo das fotos de evolução dele. Soma às
-- políticas de hoje ("evolucao: ler as proprias ou master" da nutricionista pela pasta e a do aluno, W10). Montada com as
-- funções que já existem (staging primeiro; na produção o mesmo bloco recria a política com as 2).
do $w17$
declare
  v_expr text;
begin
  v_expr := concat_ws(' or ',
    case when to_regprocedure('staging.profissional_le_foto_evolucao(text)') is not null then 'staging.profissional_le_foto_evolucao(name)' end,
    case when to_regprocedure('public.profissional_le_foto_evolucao(text)') is not null then 'public.profissional_le_foto_evolucao(name)' end);
  if coalesce(v_expr, '') = '' then
    raise notice 'W17: nenhuma profissional_le_foto_evolucao ainda — aplique o bloco do schema antes';
    return;
  end if;
  execute 'drop policy if exists "evolucao: quem ve o aluno le as fotos" on storage.objects';
  execute format('create policy "evolucao: quem ve o aluno le as fotos" on storage.objects for select to authenticated using (bucket_id = %L and (%s))',
                 'evolucao', v_expr);
end
$w17$;
