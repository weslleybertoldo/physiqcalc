-- Physiq W2 da loja — REVERSA de supabase-principal/migrations/20261006190000_w2l_exclusao_profissional.sql (só se a exclusão do
-- profissional quebrar algo). Tira as 2 funções novas e volta o CHECK e a guarda de conta_membros ao corpo da W2
-- (20260929030000_w02_nucleo.sql, copiado sem mudar uma letra). A coluna removido_motivo FICA (só informativa, sem uso fora da W2 da
-- loja) — apagar a coluna perderia a marca das linhas de quem já excluiu a conta.
--
-- O CHECK antigo volta NOT VALID: vale para toda linha nova ou alterada, sem barrar as que já têm user_id vazio (o login de uma
-- linha marcada pela exclusão já foi apagado de verdade — ex.: as contas descartáveis do teste do CHECK × FK). Para conferir:
--   select count(*) from {schema}.conta_membros where user_id is null and email_convite is null;
--
-- Aplicar (backup ANTES):
--   python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261006190000_w2l_exclusao_profissional_reversa.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261006190000_w2l_exclusao_profissional_reversa.sql --so staging
-- Depois: reverter o PR da W2 da loja e republicar a excluir-minha-conta da origin/main (sem o fluxo novo ninguém chama as funções).

drop function if exists {schema}.excluir_conta_profissional(uuid, boolean);
drop function if exists {schema}.w2l_prontuarios_para_baixar(uuid, uuid[]);
drop function if exists {schema}.w2l_limpar_perfil(uuid, text);
drop function if exists {schema}.w2l_assina_no_schema(uuid, text);

alter table {schema}.conta_membros drop constraint if exists conta_membros_pessoa_ou_convite;
alter table {schema}.conta_membros drop constraint if exists conta_membros_check;
alter table {schema}.conta_membros add constraint conta_membros_check check (user_id is not null or email_convite is not null) not valid;

create or replace function {schema}.conta_membros_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    -- o dono muda papéis, situação e o e-mail do convite; quem é a pessoa (e o vínculo com o Treino) é do servidor
    new.id := old.id; new.conta_id := old.conta_id; new.user_id := old.user_id; new.treino_user_id := old.treino_user_id;
    new.codigo_convite := old.codigo_convite; new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;
