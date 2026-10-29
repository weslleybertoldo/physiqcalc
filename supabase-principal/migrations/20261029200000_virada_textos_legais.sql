-- Physiq — a VIRADA dos textos legais (D12 da hml-11 + §10 da hml-12; 29/10/2026). Banco principal, staging + public. Idempotente.
-- Decisão do dono (29/10/2026): "Não tenho advogado" → a Política de Privacidade, os Termos de Uso e os Termos de assinatura são
-- publicados COMO ESTÃO no código ("Sim, como estão"), com o aceite no próximo acesso, o consentimento de saúde e a regra de idade
-- (16+; 16–17 com o responsável) da hml-12.
--
-- O que muda: 1 linha por schema — {schema}.app_config 'textos_legais' passa à versão publicada, a MESMA do VERSAO_TEXTOS do app
-- (src/publico/legal/versao.ts; o src/publico/legal/textos.test.ts confere que as 2 são iguais). Com a versão ligada, a
-- minha_situacao() devolve o `legal` pendente para quem não aceitou esta versão (a porta do aceite do App.tsx pede o aceite no próximo
-- acesso), o banco recusa o aceite de outra versão (versao_desatualizada), a entrar_sem_profissional de 5 argumentos pede a data (18+)
-- e o consentimento de saúde, a preconsulta_responder pede o consentimento, e a regra de idade (o gatilho idade_minima_guarda) passa a
-- valer. Nada de tabela, função, permissão ou dado de pessoa: só a chave.
--   staging: 2026-10-08 (a versão em revisão, desde a hml-12) → 2026-10-29
--   public:  {"versao": null} (desligado)                     → 2026-10-29
-- A ORDEM da virada (spec hml-12 §5 e §10; docs/textos-legais.md › A virada): o front primeiro (o PR da virada na produção: Vercel, APK
-- e AAB), DEPOIS esta migração no public, depois o e-mail. Com a versão nula, o front novo segue sem pedir nada (a porta só pede com a
-- versão ligada) e as RPCs novas agem como as de antes — não há janela em que o banco recusa e o front ainda é o velho.
-- Se a data da publicação mudar, troque a versão aqui E no src/publico/legal/versao.ts (VERSAO_TEXTOS e DATA_DOS_TEXTOS), juntas.
--
-- Aplicar (o staging antes; no public, SÓ depois do front publicado — backup antes: scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261029200000_virada_textos_legais.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261029200000_virada_textos_legais.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261029200000_virada_textos_legais.sql --so public   (a virada)
-- Conferir (SQL só leitura): select valor ->> 'versao' from {schema}.app_config where chave = 'textos_legais'  →  2026-10-29
-- Reversa: supabase-principal/reversas/20261029200000_virada_textos_legais_reversa.sql.

select set_config('lock_timeout', '5s', true);

update {schema}.app_config
   set valor = jsonb_build_object('versao', '2026-10-29')
 where chave = 'textos_legais';

-- A conferência do fim (qualquer diferença desfaz a migração inteira): a chave existe (a migração da hml-12 foi aplicada neste schema)
-- e a versão vigente lida pelo banco (a mesma função que a porta e as RPCs usam) é a publicada.
do $c$
begin
  if not exists (select 1 from {schema}.app_config where chave = 'textos_legais') then
    raise exception 'virada: {schema}.app_config sem a chave textos_legais (a migração 20261008200000 da hml-12 não foi aplicada aqui)';
  end if;
  if {schema}.versao_dos_textos() is distinct from '2026-10-29' then
    raise exception 'virada: a versão vigente dos textos em {schema} não ficou 2026-10-29';
  end if;
end $c$;
