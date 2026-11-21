-- Physiq — a versão nova dos textos legais de 22/12/2026 (D8 da restauração de login). Banco principal, staging + public. Idempotente.
-- Por quê: a Política de Privacidade passa a dizer o que o "entrar já logado no celular novo" guarda e onde (a chave de entrada do
-- Android, migração 20261030010000_restaurar_login.sql). É mudança relevante → versão nova dos 3 textos (uma versão só para todos),
-- com o aviso por e-mail 30 dias antes (a Política, seção 15; docs/textos-legais.md › processo 8) e o aceite no próximo acesso.
--
-- O que muda: 1 linha por schema — {schema}.app_config 'textos_legais' passa de 2026-10-29 a 2026-12-22, a MESMA do VERSAO_TEXTOS do
-- app (src/publico/legal/versao.ts; o src/publico/legal/textos.test.ts confere). Com a versão nova no banco, a minha_situacao() devolve
-- o `legal` pendente para quem não aceitou 2026-12-22 (a tela do aceite no próximo acesso) e o banco recusa o aceite de outra versão
-- (versao_desatualizada: o site diz "Recarregue"; o APK e a loja de antes dizem "Atualize o app"). Nada de tabela, função, permissão
-- ou dado de pessoa: só a chave.
--
-- A ORDEM (docs/textos-legais.md › processo 8):
--   1. O staging, para testar o PR: --so staging. O staging é de todos: depois da prova, a reversa volta o staging a 2026-10-29 e a
--      branch staging volta à main (senão o front da main fica ATRÁS do banco do staging e ninguém aceita por lá).
--   2. 30 dias antes de 22/12/2026: o e-mail (scripts/legal/avisar_textos.py prod --previo), com a versão de antes ainda no banco.
--   3. Em 22/12/2026: o merge do PR (Vercel, APK e AAB) e, DEPOIS do front publicado, esta migração no public (e de novo no staging).
--
-- Aplicar (backup antes do public: scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261121120000_versao_textos_2026_12_22.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261121120000_versao_textos_2026_12_22.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261121120000_versao_textos_2026_12_22.sql --so public   (em 22/12)
-- Conferir (SQL só leitura): select valor ->> 'versao' from {schema}.app_config where chave = 'textos_legais'  →  2026-12-22
-- Reversa: supabase-principal/reversas/20261121120000_versao_textos_2026_12_22_reversa.sql (volta a 2026-10-29).

select set_config('lock_timeout', '5s', true);

update {schema}.app_config
   set valor = jsonb_build_object('versao', '2026-12-22')
 where chave = 'textos_legais';

do $c$
begin
  if not exists (select 1 from {schema}.app_config where chave = 'textos_legais') then
    raise exception 'versão nova dos textos: {schema}.app_config sem a chave textos_legais';
  end if;
  if {schema}.versao_dos_textos() is distinct from '2026-12-22' then
    raise exception 'versão nova dos textos: a versão vigente em {schema} não ficou 2026-12-22';
  end if;
end $c$;
