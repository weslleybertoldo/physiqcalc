-- Reversa da hml-10 (supabase-principal/migrations/20261008110000_hml10_avisos_erro.sql): tira a trava dos avisos de erro do
-- banco (as 2 tabelas e a registrar_aviso_erro). Idempotente.
-- Depois dela, as funções que chamam a RPC (_shared/avisar-erro.ts e a erro-avisar) seguem avisando só com a trava na memória
-- (o banco fora = o aviso sai: "trava_do_banco_fora" no log). Para silêncio total, antes: o segredo ERROS_AVISO_DESLIGADO=1 no
-- principal (sem deploy). O histórico de avisos (só assinaturas e texto já limpo) some junto.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

drop function if exists {schema}.registrar_aviso_erro(text, text, text, text);
drop table if exists {schema}.avisos_erro_hora;
drop table if exists {schema}.avisos_erro;
