-- Homologação do Physiq — hml-01 / H-02 e H-11 (07/10/2026). Idempotente. Nenhum dado muda.
--
-- H-02. Funções SECURITY DEFINER que só o servidor usa (outras funções definer, Edge Functions com a service_role, pg_cron)
-- ficam sem EXECUTE para public, anon e authenticated. Causa: os default privileges do projeto dão EXECUTE explícito a
-- authenticated em toda função nova, e as migrations tiravam só de public/anon. A contenção de 07/10 ~19:07 já tinha tirado
-- de authenticated as 12 primeiras; aqui isso fica no repo e entram as internas da W13/W14 e do WhatsApp (pg_cron) e as
-- funções de gatilho (gatilho não confere EXECUTE). Quem chama cada uma foi conferido no app, no site antigo da Nutri
-- (physiqnutri), nas Edge Functions e nas policies; ficam como estão as de conferência da própria pessoa (pode_mexer_no_acesso,
-- pode_ver_aluno, w13_pode_gerir, w14_pode_editar, diario_pode_*, pode_*_anexo) e as dos fluxos públicos (cadastro, diário,
-- pré-consulta).
-- papeis_permitidos: as 3 policies de equipe passam a usar papeis_permitidos_do_dono (sou_dono E a mesma regra — o mesmo que
-- já estava escrito nelas), e a função de base fecha como as outras internas.
--
-- H-11. Sai a policy "paciente: ler o perfil da sua nutricionista" (a linha inteira do profiles, com e-mail e situação da
-- assinatura): as telas do aluno leem o profissional pela meu_perfil_aluno, e o site antigo da Nutri não lê o perfil dela.
--
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging (depois --so public, com backup).

-- 1. internas: só service_role
revoke all on function
  {schema}.w27_conta_linha(uuid), {schema}.w27_nome(uuid), {schema}.w13_foto_do_aluno(text, uuid),
  {schema}.w13_conta_do_personal(uuid), {schema}.conta_alunos_ativos(uuid), {schema}.conta_limite_alunos(uuid),
  {schema}.conta_pode_adicionar_aluno(uuid), {schema}.conta_tem_modulo(uuid, text), {schema}.equipe_motivo_bloqueio(uuid),
  {schema}.papeis_do_plano(uuid), {schema}.w13_conta_travada(uuid), {schema}.preconsulta_autor_nutri(uuid, uuid),
  {schema}.w13_dono_do_codigo(text), {schema}.w13_erro_limite(uuid), {schema}.w13_modulos_do_aluno(uuid, uuid, text),
  {schema}.w14_matricula_da_rota(uuid), {schema}.whatsapp_enfileirar(), {schema}.whatsapp_destravar_fila(),
  {schema}.papeis_permitidos(uuid, text[])
  from public, anon, authenticated;
grant execute on function
  {schema}.w27_conta_linha(uuid), {schema}.w27_nome(uuid), {schema}.w13_foto_do_aluno(text, uuid),
  {schema}.w13_conta_do_personal(uuid), {schema}.conta_alunos_ativos(uuid), {schema}.conta_limite_alunos(uuid),
  {schema}.conta_pode_adicionar_aluno(uuid), {schema}.conta_tem_modulo(uuid, text), {schema}.equipe_motivo_bloqueio(uuid),
  {schema}.papeis_do_plano(uuid), {schema}.w13_conta_travada(uuid), {schema}.preconsulta_autor_nutri(uuid, uuid),
  {schema}.w13_dono_do_codigo(text), {schema}.w13_erro_limite(uuid), {schema}.w13_modulos_do_aluno(uuid, uuid, text),
  {schema}.w14_matricula_da_rota(uuid), {schema}.whatsapp_enfileirar(), {schema}.whatsapp_destravar_fila(),
  {schema}.papeis_permitidos(uuid, text[])
  to service_role;

-- 2. funções de gatilho: ninguém chama pela API
revoke all on function
  {schema}.agenda_tags_w2_depois(), {schema}.agendamentos_w20_avisar(), {schema}.agendamentos_w2_tag(),
  {schema}.calendarios_w2_tag(), {schema}.contas_espelho_mudou(), {schema}.formularios_preconsulta_w21(),
  {schema}.pacientes_conta_da_nutri(), {schema}.plano_precos_registrar_hist(), {schema}.respostas_preconsulta_w21(),
  {schema}.whatsapp_confirmar_agendamento()
  from public, anon, authenticated;

-- 3. papeis_permitidos nas policies: a mesma regra, só para o dono (era sempre "sou_dono(...) and papeis_permitidos(...)")
create or replace function {schema}.papeis_permitidos_do_dono(p_conta uuid, p_papeis text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.sou_dono(p_conta) and {schema}.papeis_permitidos(p_conta, p_papeis);
$$;
revoke all on function {schema}.papeis_permitidos_do_dono(uuid, text[]) from public, anon;
grant execute on function {schema}.papeis_permitidos_do_dono(uuid, text[]) to authenticated, service_role;

drop policy if exists "conta_membros: dono convida" on {schema}.conta_membros;
create policy "conta_membros: dono convida" on {schema}.conta_membros for insert to authenticated
  with check ({schema}.sou_dono(conta_id) and {schema}.papeis_permitidos_do_dono(conta_id, papeis)
              and user_id is null and treino_user_id is null and codigo_convite is null and status = 'convidado');
drop policy if exists "conta_membros: dono edita" on {schema}.conta_membros;
create policy "conta_membros: dono edita" on {schema}.conta_membros for update to authenticated
  using ({schema}.sou_dono(conta_id)) with check ({schema}.sou_dono(conta_id) and {schema}.papeis_permitidos_do_dono(conta_id, papeis));
drop policy if exists "convites: criar" on {schema}.convites;
create policy "convites: criar" on {schema}.convites for insert to authenticated
  with check (criado_por = (select auth.uid()) and (
                (tipo = 'membro' and {schema}.sou_dono(conta_id) and {schema}.papeis_permitidos_do_dono(conta_id, papeis))
             or (tipo = 'aluno' and {schema}.sou_membro(conta_id))));

-- 4. H-11
drop policy if exists "paciente: ler o perfil da sua nutricionista" on {schema}.profiles;
