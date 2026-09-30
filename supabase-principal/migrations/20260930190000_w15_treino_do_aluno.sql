-- Physiq W15 — banco principal (staging e public). Idempotente; só acrescenta uma função (nenhuma tabela nem dado muda).
-- Perfil do aluno › Treino (editor da tela 8): o painel precisa achar o usuário do Banco do Treino do aluno. O vínculo que
-- vale entre os 2 bancos é o physiq_identidades do Treino (principal_user_id → treino_user_id), e a matrícula nova (aluno que
-- entrou pelo Physiq) não guarda o treino_user_id aqui. Esta função devolve o login do aluno (pacientes.user_id) para quem
-- pode abrir o perfil dele — a mesma regra do aluno_perfil (w14_matricula_da_rota) — e a função admin-semana-treinos do
-- Treino resolve o resto (confere de novo, lá, se quem chama vê aquele aluno).
create or replace function {schema}.aluno_treino(p_aluno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
begin
  select * into v_p from {schema}.pacientes where id = v_id;
  return jsonb_build_object(
    'ok', true,
    'paciente_id', v_p.id,
    'user_id', v_p.user_id,
    'treino_user_id', v_p.treino_user_id
  );
end;
$$;
revoke execute on function {schema}.aluno_treino(uuid) from public, anon;
grant execute on function {schema}.aluno_treino(uuid) to authenticated, service_role;
