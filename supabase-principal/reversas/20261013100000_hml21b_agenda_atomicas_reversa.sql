-- Reversa da hml-21b (supabase-principal/migrations/20261013100000_hml21b_agenda_atomicas.sql). Idempotente: roda com ou sem a
-- migração aplicada. Saem as 2 funções novas (agenda_excluir_calendario, agenda_garantir_inicio) nos 2 schemas; nada mais muda
-- (tabelas, policies, gatilhos e dados ficaram como estavam — o que as funções já gravaram são linhas comuns das pessoas e FICAM).
--
-- ATENÇÃO — reverter o FRONT e a função conta ANTES: a conta da hml-21b (v2) chama estas RPCs no excluir calendário e no 1º acesso à
-- Agenda; sem elas, essas 2 ações dão erro na tela (o resto da Agenda segue). O front de antes (gravação direta) e a conta v1 da hml-21a
-- funcionam com ou sem elas.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public

drop function if exists {schema}.agenda_excluir_calendario(uuid);
drop function if exists {schema}.agenda_garantir_inicio(uuid, text[], text[]);

notify pgrst, 'reload schema';
