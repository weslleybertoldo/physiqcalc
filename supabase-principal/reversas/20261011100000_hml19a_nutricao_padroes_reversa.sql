-- Reversa da hml-19a (supabase-principal/migrations/20261011100000_hml19a_nutricao_padroes.sql). Idempotente: roda com ou sem a
-- migração aplicada. Sai a função nova (nutricao_garantir_padroes); nada mais muda (a migração só criou a função: tabelas, policies e
-- dados ficaram como estavam — os padrões que ela já gravou são linhas comuns das pessoas e FICAM).
--
-- ATENÇÃO — reverter o FRONT ANTES: o front da hml-19a (Anamnese, Documentos e Exames do Prontuário) pede os padrões à função
-- nutricao › padroes_garantir, que chama esta RPC; sem ela, a abertura dessas seções mostra o aviso "Tentar de novo" no lugar dos
-- modelos. O front de antes (o garantir no navegador) funciona com ou sem ela.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public

drop function if exists {schema}.nutricao_garantir_padroes(text, jsonb);

notify pgrst, 'reload schema';
