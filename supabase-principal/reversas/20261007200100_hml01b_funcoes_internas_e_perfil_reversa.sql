-- Reversa da 20261007200100_hml01b_funcoes_internas_e_perfil.sql: volta ao estado de 07/10/2026 ~19:12 (depois da contenção):
-- as 12 da contenção continuam SEM EXECUTE para authenticated; as demais voltam a ter; as policies voltam a chamar
-- papeis_permitidos; a policy do H-11 volta. Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging|public

grant execute on function
  {schema}.w13_dono_do_codigo(text), {schema}.w13_erro_limite(uuid), {schema}.w13_modulos_do_aluno(uuid, uuid, text),
  {schema}.w14_matricula_da_rota(uuid), {schema}.whatsapp_enfileirar(), {schema}.whatsapp_destravar_fila(),
  {schema}.papeis_permitidos(uuid, text[])
  to authenticated;
grant execute on function
  {schema}.agenda_tags_w2_depois(), {schema}.agendamentos_w20_avisar(), {schema}.agendamentos_w2_tag(),
  {schema}.calendarios_w2_tag(), {schema}.contas_espelho_mudou(), {schema}.formularios_preconsulta_w21(),
  {schema}.pacientes_conta_da_nutri(), {schema}.plano_precos_registrar_hist(), {schema}.respostas_preconsulta_w21(),
  {schema}.whatsapp_confirmar_agendamento()
  to anon, authenticated;

drop policy if exists "conta_membros: dono convida" on {schema}.conta_membros;
create policy "conta_membros: dono convida" on {schema}.conta_membros for insert to authenticated
  with check ({schema}.sou_dono(conta_id) and {schema}.papeis_permitidos(conta_id, papeis)
              and user_id is null and treino_user_id is null and codigo_convite is null and status = 'convidado');
drop policy if exists "conta_membros: dono edita" on {schema}.conta_membros;
create policy "conta_membros: dono edita" on {schema}.conta_membros for update to authenticated
  using ({schema}.sou_dono(conta_id)) with check ({schema}.sou_dono(conta_id) and {schema}.papeis_permitidos(conta_id, papeis));
drop policy if exists "convites: criar" on {schema}.convites;
create policy "convites: criar" on {schema}.convites for insert to authenticated
  with check (criado_por = (select auth.uid()) and (
                (tipo = 'membro' and {schema}.sou_dono(conta_id) and {schema}.papeis_permitidos(conta_id, papeis))
             or (tipo = 'aluno' and {schema}.sou_membro(conta_id))));
drop function if exists {schema}.papeis_permitidos_do_dono(uuid, text[]);

drop policy if exists "paciente: ler o perfil da sua nutricionista" on {schema}.profiles;
create policy "paciente: ler o perfil da sua nutricionista" on {schema}.profiles
  for select to authenticated using (id = {schema}.minha_nutricionista_id());
