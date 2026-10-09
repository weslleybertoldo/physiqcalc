-- Reversa da hml-14d (supabase-principal/migrations/20261009080000_hml14d_por_aluno.sql). Idempotente: roda com ou sem a migração
-- aplicada.
--   · saem a aluno_anotacoes de 3 argumentos e as 3 novas (minha_agenda_lista, exames_do_aluno, financeiro_totais_do_aluno);
--   · volta a aluno_anotacoes(p_aluno, p_limite) da W18, igual à de supabase-principal/migrations/20261001030000_w18_visibilidade.sql
--     (:142-181), com os mesmos grants (só o logado e o servidor).
-- No staging, o front da hml-14d chama as novas e a aluno_anotacoes com p_offset: reverter o front junto (a tela antiga só chama a
-- aluno_anotacoes com p_aluno e p_limite e lê as tabelas direto).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

drop function if exists {schema}.aluno_anotacoes(uuid, integer, integer);
drop function if exists {schema}.minha_agenda_lista(text, integer, integer);
drop function if exists {schema}.exames_do_aluno(uuid, text, integer, integer);
drop function if exists {schema}.financeiro_totais_do_aluno(uuid);

create or replace function {schema}.aluno_anotacoes(p_aluno uuid, p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_ve boolean := {schema}.eh_master() or {schema}.pode_ver_aluno(v_id);
  v_clinico boolean := {schema}.pode_ver_clinico(v_id);
  v_total integer := 0;
  v_lista jsonb := '[]'::jsonb;
begin
  if v_ve then
    select count(*) into v_total from {schema}.registros_prontuario r
     where r.paciente_id = v_id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico);
    select coalesce(jsonb_agg(x.j order by x.data desc, x.criado desc), '[]'::jsonb) into v_lista
      from (
        select r.data, r.created_at as criado,
               jsonb_build_object(
                 'id', r.id,
                 'data', r.data,
                 'texto', r.texto,
                 'visibilidade', r.visibilidade,
                 'autor_papel', r.autor_papel,
                 'autor_id', r.nutricionista_id,
                 'autor_nome', {schema}.nome_da_pessoa(r.nutricionista_id),
                 'autor_foto', (select coalesce(nullif(btrim(pr.dados_profissionais ->> 'foto_url'), ''),
                                               u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
                                  from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = r.nutricionista_id),
                 'minha', r.nutricionista_id = auth.uid(),
                 'created_at', r.created_at,
                 'updated_at', r.updated_at) as j
          from {schema}.registros_prontuario r
         where r.paciente_id = v_id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico)
         order by r.data desc, r.created_at desc
         limit case when p_limite is null or p_limite < 1 then null else least(p_limite, 500) end
      ) x;
  end if;
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'total', v_total, 'clinico', v_clinico, 'anotacoes', v_lista);
end;
$$;
revoke execute on function {schema}.aluno_anotacoes(uuid, integer) from public, anon;
grant execute on function {schema}.aluno_anotacoes(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
