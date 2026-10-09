-- Reversa da hml-14b (supabase-principal/migrations/20261009030000_hml14b_lixeira_paginada.sql). Idempotente: roda com ou sem a
-- migração aplicada.
--   · saem a lixeira_da_conta de 5 argumentos e a lixeira_montar;
--   · volta a lixeira_da_conta(p_conta) da W26, igual à de supabase-principal/migrations/20261001230000_w26_lixeira.sql (até 300 por
--     tipo), com os mesmos grants (só o logado e o servidor).
-- No staging, o front da hml-14b chama a lixeira com página: reverter o front junto (a tela antiga chama só com p_conta).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

drop function if exists {schema}.lixeira_da_conta(uuid, text, text, integer, integer);
drop function if exists {schema}.lixeira_montar(uuid, boolean, boolean, text, text, integer, integer);

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

revoke all on function {schema}.lixeira_da_conta(uuid) from public, anon;
grant execute on function {schema}.lixeira_da_conta(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
