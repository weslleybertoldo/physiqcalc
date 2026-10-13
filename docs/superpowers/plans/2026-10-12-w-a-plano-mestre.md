# W-A — Acessos do aluno — Plano mestre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** na ficha do aluno, depois de Financeiro, uma aba **Acessos** (o que o aluno pode no app: App, séries do Treino, Dieta "Só ver ·
Pode mexer", Diário com fotos, Envio pelo link, Rotinas sempre); a Dieta liberada deixa o aluno pôr e tirar alimentos no DIA dele (o plano da
nutri não muda); e **Rotinas** com lembrete (creatina, remédio, hábito) para todo aluno — criadas pelo aluno ou pelo profissional.

**Architecture:** 7 partes, uma por vez, cada uma = 1 worktree = 1 PR (spec §6). Banco principal primeiro (3 migrations com `{schema}`, RLS
como 2ª camada, escrita SÓ por RPC definer), depois as funções do jeito 2 (`acessos` e `aluno-dia` no principal, como a pessoa; `treino-acessos`
no Treino, no molde da `treino-leitura`), depois as telas (app das rotinas → aba Acessos → app da dieta → painel das rotinas e do dia a dia) e,
por último, o texto da Política (só staging). P1 e P2 vão para a produção escuras (nenhuma tela usa).

**Tech Stack:** Postgres (Supabase principal `hkxvtsbwctxkrqzkkdoz`, schemas `staging` e `public`; Banco do Treino `uxwpwdbbnlticxgtzcsb`), Deno
edge functions, React 18 + Vite + Capacitor (`@capacitor/local-notifications` 8.0.2), Vitest, E2E em Python + Playwright (`--canal msedge`).

**Entradas (nesta ordem de precedência):**
- Spec revisada (a fonte; NÃO mudar decisões dela): `docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md` (commit `e55f2ba`).
- Revisão: `~/projetos/physiqcalc-scratch/w-a/spec-review-w-a.md` (4 CRÍTICOS, 10 IMPORTANTES — todos aplicados na spec).
- Respostas do Weslley e o combinado com a LINUX 1: topo de `~/projetos/physiqcalc-scratch/w-a/mapeamento-e-perguntas-2026-10-12.md`.
- Quadro: `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` (as 6 regras LINUX 1 × LINUX 3 e as janelas).
- Plano detalhado da P1: `docs/superpowers/plans/2026-10-12-w-a-p1-banco.md`. P2–P7: o detalhado de cada uma é escrito NA HORA de começar
  (writing-plans), com a `origin/main` do momento — o molde da W1/W2.

**Estado em 12/10/2026 ~19:10:** spec revisada; plano mestre + plano da P1 escritos; **nada implementado**. Os rascunhos SQL e os E2E da P1 JÁ
rodaram num Postgres 18 descartável com a cadeia inteira (111 migrations): 53/53 (`sql_wa.py`), catálogo do public 8/8, reversas → catálogo
igual ao de antes, `checar-definer` 0 problema (171 definer) — detalhes no plano da P1. `origin/main` = `origin/staging` = `ed0d72e` (v3.109).

---

## 0. Regras que valem para as 7 partes

- **Ordem (spec §2.2-18 e §6):** P1 Banco → P2 Funções e contratos → P3 App: rotinas e lembretes → P4 Painel: aba Acessos → P5 App: dieta
  liberada → P6 Painel: rotinas e dia a dia → P7 Política. **A P4 sai logo antes da P5, sem parte no meio** (risco 9: o interruptor da Dieta
  grava, mas o app só muda na P5).
- **Uma worktree por vez, worktree NOVA por parte, a partir da `origin/main` do momento** (`git fetch` antes). A P1 usa esta
  (`~/projetos/physiqcalc-acessos`, branch `feat/w-a-acessos-do-aluno`, base `ed0d72e`; leva junto a spec e os planos). As outras:
  `~/projetos/physiqcalc-wa-p<N>` com a branch `feat/w-a-p<N>-<nome>` (P2 `funcoes`, P3 `rotinas`, P4 `aba-acessos`, P5 `dieta-livre`, P6
  `painel-rotinas`, P7 `politica`), `npm ci` + o `.env.local` do staging (como nas outras worktrees). A worktree de cada parte sai depois da parte
  em produção (a da P1 também: a spec e os planos entram na `main` com o PR dela).
- **Gate humano: só o G0** — a foto deste plano (todas as páginas do `andamento_worktrees.py`) + o OK do Weslley. Depois, **esteira autônoma**
  em cada parte (`Skill-wbs-ciclo-de-implementação-autonoma` + `Skill-wbs-local-stg-prod-ate-o-fim`): local → staging → produção, SEM gates;
  validação com evidência (placares, logs, catálogo) e prints conferidos (Read em cada um ANTES de mandar); erro → causa raiz e segue; para só
  em decisão de negócio impossível de inferir, ação destrutiva fora do escopo ou 3 falhas seguidas no mesmo passo.
- **Coordenação com a LINUX 1** (regras 1–6 do quadro): trava 🔒 no quadro + `SendMessage` + esperar o "pode ir" antes de: aplicar migration
  (BANCO do staging; na produção, "pausa E2E" dela), publicar função, rodar E2E pesado no staging, push no `staging`, merge na `main`. Soltou →
  "livre" + aviso. Migration só com o número RESERVADO no quadro. Nenhuma migration no staging com E2E da outra rodando.
- **Git:** nada de `--force`/`--force-with-lease` em push normal; **check anti-sobrescrita num comando ISOLADO** antes de cada push/merge:
  `cd <worktree> && git fetch origin && if ! git merge-base --is-ancestor origin/main HEAD; then echo "main andou"; exit 1; fi` (andou →
  rebase na `origin/main`, testes de novo). **1 PR por vez na `main`** (main protegida, sem skip): CI verde → `gh pr merge <n> --squash
  --delete-branch` → esperar o CI da `main` (release com o APK + `chore: bump version` do job `bump`; NUNCA bumpar à mão) → avisar a LINUX 1.
  **Realinhar `staging` = `main`**: se o `staging` recebeu a branch (partes com tela, P3–P7), as 3 condições do quadro juntas — (a) "pode ir"
  da LINUX 1; (b) `git log origin/main..origin/staging` só com os commits da branch que entrou e `git diff origin/staging <squash>^{tree}` vazio;
  (c) `git push origin origin/main:staging --force-with-lease=staging:<sha conferido>`. Se o `staging` NÃO recebeu a branch (P1 e P2: sem
  tela), o `staging` é ancestral da `main` → `git push origin origin/main:staging` (fast-forward, sem lease), também com o "pode ir".
- **Autor dos commits:** `git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit
  -m "<msg>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>` (com o `-- <arquivos>` só os da task). PR com o
  rodapé `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Máquina:** tudo pesado (build, `tipos`, `lint`, Vitest, `test:node`, E2E, `deno check`) dentro de `flock
  ~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock <cmd>`; Vitest SEMPRE `--maxWorkers=2`; `TMPDIR=~/projetos/physiqcalc-scratch/tmp`
  (o `/tmp` está quase cheio); E2E de tela local SÓ na **5173**: `npx vite preview --port 5173 --strictPort` (a 8080 é da LINUX 1).
- **E2E:** `--canal msedge`; só contas de TESTE (as da hml-17 pela base `e2e/wa/_base.py`); massa só no staging, com a marca "WA E2E" e
  limpa no fim (`python3 e2e/wa/_base.py --limpar` + sobras 0); `/health` dos 2 projetos antes de cada um (o Banco do Treino é o mesmo
  projeto da produção — incidente de 10/10); um por vez, em lotes pequenos; produção SÓ LEITURA (a Guarda); o logout é local (nunca global).
  Cada rodada de prova entra no `docs/e2e-rodadas.md` no PR da própria parte (H-50); as de produção, no PR da parte seguinte.
- **Produção:** backup das tabelas que a migration toca antes (`scripts/backup/backup_principal.py`, SÓ no notebook), `pg_stat_activity` sem
  consulta longa, dry-run, aplicar `--so public` (e o `--compartilhado` quando a migration tiver), conferência SÓ LEITURA, smoke SÓ LEITURA.
  Função: `scripts/deploy_function.sh <ref> <pasta> <slug> <verify_jwt>` (para se o verify_jwt divergir). Vercel com `git_info_fail` →
  `POST /v13/deployments` (o molde da nota da casa).
- **Não tocar (spec §5.7):** os arquivos da hml-20d (`supabase-principal/functions/financeiro/**`, `_shared/financeiro-leituras.ts` e
  `financeiro-gravar-regras.ts`, `src/financeiro/{ler,lancamentos,recibos,api,gravar}.ts`, `src/painel/financeiro/{dados,useFinanceiro,financeiroUtil,recibosUtil}.ts`
  e `telas.test.tsx`, `src/financeiro/{recibos,gravacoes}.test.ts`, `src/nutricao/semLeituraDireta.test.ts`, `semGravacaoDireta.test.ts`,
  `e2e/hml20/**`, `e2e/hml19/_base.py`), a `nutricao` e os `_shared/{nutricao-*,leitura-lote}.ts`, `src/nutricao/{leitura,servidor}.ts`,
  `src/nutricao/app/{pacienteApp,useDieta}.ts` (só importar), `src/integrations/repeticao.ts`, `admin-semana-treinos`, `treino-leitura`,
  `paciente_marcar_refeicao`, `minha_situacao`, `minha_dieta`, `pagamentos-aluno`, `src/nucleo/sessao.tsx`, o master e os GIFs.
- **Pontos de encontro com a LINUX 1 (só ACRÉSCIMO, avisando no quadro antes):** `docs/banco-permissoes.md` (P1: seção nova no FIM do
  arquivo), `docs/e2e-rodadas.md` (linhas no topo, toda parte), a Guarda dos E2E `e2e/hml17/_base.py` + `e2e/w26/prod.py`, o
  `e2e/hml19/guarda_teste.py` e o `src/lib/logsDasFuncoesPrincipal.test.ts` (P2). Quem entra depois rebaseia.
- **Segredos:** nada de chave em log, repo, `VITE_*` ou na conversa; a chave do Treino só como a automática do projeto, dentro da
  `treino-acessos` (padrão 4). Nunca nome de rotina ou alimento em log, raise ou push (dado de saúde).
- **Aviso de progresso (regra global, 06/10):** previsão `HHhMM a HHhMM (pior cenário HHhMM)` + as fases, uma por linha (✅ · 🚧 · ⏳), no
  terminal e no tópico; agente longo → a cada ~30 min. Contexto: aos 40% avisa, aos 50% migra (a seção 9 diz o que a sessão nova confere).

## 1. Resumo das 7 partes (minutos; "calibrado" = ×0,65 a ×0,68, a W2 e a W1; "pior" = o melhor caso sem calibrar, a regra da spec)

```
+-------+--------------------------------+-----------+------------+--------+---------+--------+---------------------+--------------+
| Parte | O que faz                      | Migration | Depende de | Código | Esteira | Melhor | Calibrado           | Pior         |
+-------+--------------------------------+-----------+------------+--------+---------+--------+---------------------+--------------+
| P1    | Banco: 3 migrations + reversas | 3 (wa1–3) | 5.8 (✅)    | 275    | 115     | 390    | 254–265 (4h14–4h25) | 390 (6h30)   |
|       | + sql_wa + a seção da W-A em   | RESERVADAS|            | (spec  | (spec   | (spec  |                     |              |
|       | docs/banco-permissoes.md       |           |            | 345)   | 100)    | 445)   |                     |              |
| P2    | Funções acessos, aluno-dia,    | —         | P1 staging | 395    | 110     | 505    | 328–343 (5h28–5h43) | 505 (8h25)   |
|       | treino-acessos + clientes +    |           |            |        |         |        |                     |              |
|       | listas + Guarda + api.py       |           |            |        |         |        |                     |              |
| P3    | App: rotinas e lembretes       | —         | P2         | 300    | 190     | 490    | 319–333 (5h19–5h33) | 490 (8h10)   |
| P4    | Painel: aba Acessos            | —         | P2         | 225    | 130     | 355    | 231–241 (3h51–4h01) | 355 (5h55)   |
| P5    | App: dieta liberada            | —         | P2, P3, P4 | 320    | 150     | 470    | 306–320 (5h06–5h20) | 470 (7h50)   |
| P6    | Painel: rotinas e dia a dia    | —         | P2, P3, P4 | 230    | 130     | 360    | 234–245 (3h54–4h05) | 360 (6h00)   |
| P7    | Política: as linhas novas (Q2) | —         | P6         | 30     | 40      | 70     | 46–48 (0h46–0h48)   | 70 (1h10)    |
+-------+--------------------------------+-----------+------------+--------+---------+--------+---------------------+--------------+
| TOTAL |                                |           |            | 1.775  | 865     | 2.640  | 1.716–1.795         | 2.640        |
|       |                                |           |            |        |         | (44h00)| (28h36 a 29h55)     | (44h00)      |
+-------+--------------------------------+-----------+------------+--------+---------+--------+---------------------+--------------+
```

A spec previa 2.695 (44h55) e ≈ 29h a 30h30 calibrado. A P1 caiu 55 min (445 → 390) porque os rascunhos SQL, o gerador da LGPD, as
reversas e os 2 arquivos de E2E dela já foram escritos e provados num Postgres descartável ao escrever o plano (o plano da P1 diz o quê). As
outras partes ficam com a conta da spec até o plano detalhado de cada uma. **Previsão do conjunto: 28h36 a 29h55 de trabalho (pior cenário
44h00)**, ≈ 4 a 5 dias com as janelas da LINUX 1.

## 2. Gates, perguntas e combinados

| Item | Estado | O que vale |
|---|---|---|
| G0 — a foto do plano + o OK dele | ⏳ (próximo passo) | sem o OK, nada de código |
| Q3 — o lembrete de REMÉDIO mostra o nome na tela bloqueada? | ⏳ só afeta a P3 | até a resposta, a recomendada: **não** ("Hora do seu remédio · 08:00"; o nome ao abrir; os outros tipos com o nome) |
| Q4 — a página de rotinas avisa que os profissionais veem? | ⏳ só afeta a P3 | até a resposta, a recomendada: **sim**, a linha fixa "Seus profissionais veem as suas rotinas" |
| 5.8-1 — H-43 do card de login | ✅ re-combinado 12/10 ~17:55 (mapa, l. 19): volta para a hml-21; a W-A leva ao servidor só o acesso ao app, o diário e o link | a P1 (Task 0) confere a anotação no quadro; se faltar na linha da W-A, acrescenta e pede à LINUX 1 a linha na lista dela da hml-21 (o arquivo é dela) |
| 5.8-2 — a janela do BANCO | ✅ re-combinada 18:05 (quadro, linha das janelas) | P1: BANCO do staging ~23:00 → 23:40 (só as migrations no `staging` + `sql_wa.py`); produção ~23:40 → 00:40 (BANCO + git) |
| 5.8-3 — pontos de encontro | ✅ no quadro | só acréscimo; quem entra depois rebaseia (a 20d entra antes da P1) |

As perguntas novas que aparecerem numa parte vão uma por mensagem, a recomendada primeiro; até a resposta, vale a recomendada e a parte segue.

## 3. As partes

### P1 — Banco (detalhado em `2026-10-12-w-a-p1-banco.md`)

- **Objetivo:** as 3 migrations (acessos, rotinas, dieta livre + a LGPD das tabelas novas) no `staging` e no `public`, com reversas, provadas
  por papel, sem nenhuma tela usar ainda.
- **Arquivos (spec §6):** `supabase-principal/migrations/20261012200000_wa1_acessos.sql`, `20261012210000_wa2_rotinas.sql`,
  `20261012220000_wa3_dieta_livre.sql` (RESERVADAS no quadro); `supabase-principal/reversas/20261012200000_wa1_acessos_reversa.sql`,
  `20261012210000_wa2_rotinas_reversa.sql`, `20261012220000_wa3_dieta_livre_reversa.sql` (o padrão de nome das reversas da casa);
  `e2e/wa/_base.py`, `e2e/wa/sql_wa.py`; `docs/banco-permissoes.md` (seção nova no FIM). **A mais (regras da casa, anotadas no §7):**
  `src/integrations/principal/types.ts` (os tipos regenerados depois do `public`, como na W1/W2) e as linhas das rodadas no topo do
  `docs/e2e-rodadas.md`.
- **Migration/função:** 3 migrations; nenhuma função. A wa3 tem bloco compartilhado (as 2 exclusões do `public` com o nome explícito — o molde
  da hml02b): no staging `--so staging`; na produção `--so public` e DEPOIS `--compartilhado`.
- **Depende de:** 5.8 (✅). A PR da 20d entra antes (a P1 rebaseia `docs/banco-permissoes.md`).
- **Pronto:** `checar-definer` limpo; no staging, `sql_wa.py` verde (45 casos por papel + 8 de catálogo: escrita direta = 42501; internas sem
  EXECUTE do logado; aluno não libera a própria dieta; outra conta não vê nem muda a rotina criada na conta A; a nutri apaga item, refeição
  (copiar semana) e plano (lixeira) com o que o aluno tirou/pôs — SET NULL + retrato; o login de um profissional autor sai (no local, de
  verdade; no staging, pelas regras das FKs); exportar com `'aceites'` e as tabelas novas; exclusões com `diario-staging` no staging e
  contando/apagando as tabelas novas); a reversa rodada e reaplicada no staging; produção com backup e o catálogo 8/8.
- **Prints:** nenhum (sem tela) — vale o relatório com os placares e as contagens.
- **Estimativa:** 275 de código + 115 de esteira = **390 min** (spec 445) → calibrado **4h14 a 4h25** (pior 6h30).
- **Riscos:** a cadeia do staging/public ter mudado depois de 12/10 18:30 (o gerador da LGPD PARA se um dos 6 corpos não tiver o md5
  esperado); a janela de 23:00 apertar (§5); a massa de TESTE do staging não bater com a esperada (a Task 0 confere só leitura).
- **Travas:** 🔒 BANCO do staging 23:00 → 23:40 (migrations SÓ no `staging` + `sql_wa.py` + reversa ida e volta + autoteste da massa); 🔒
  BANCO + git 23:40 → 00:40 (produção: "pausa E2E" da LINUX 1, backup, `--so public` + `--compartilhado`, tipos, PR, squash, release, bump,
  `staging` = `main` por fast-forward). Nenhuma função publicada.

### P2 — Funções e contratos

- **Objetivo:** as 3 funções do jeito 2 (POST, `{ acao, … }`, leituras sempre `acao: "ler"`) e os clientes/regras puras do front, publicadas
  e provadas no staging, escuras na produção.
- **Arquivos (spec §6):** `supabase-principal/functions/acessos/index.ts`, `supabase-principal/functions/aluno-dia/{index,rotinas,dieta,profissional,comum}.ts`,
  `supabase-principal/functions/_shared/{acessos-regras,aluno-dia-regras}.ts`, `supabase/functions/treino-acessos/index.ts`,
  `supabase/functions/_shared/treino-acessos-regras.ts`, `src/acessos/{api,tipos}.ts`, `src/aluno-dia/{api,tipos,regras}.ts` (+ testes),
  `src/aluno-dia/semBancoDireto.test.ts` (já com as pastas das partes seguintes), `src/lib/logsDasFuncoes{Principal,Treino}.test.ts`,
  `e2e/hml17/_base.py`, `e2e/w26/prod.py` e `e2e/hml19/guarda_teste.py` (só as 3 funções; avisar a LINUX 1), `e2e/wa/api.py`; + as linhas
  das rodadas no `docs/e2e-rodadas.md` (e as de produção da P1).
- **Migration/função:** nenhuma migration. Publicar: `scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions acessos true`,
  `… aluno-dia true` e `scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions treino-acessos false` (o token é do principal; o
  script para se o verify_jwt divergir). As funções servem os 2 schemas: com a P1 já no `public`, publicar = a produção também (escura).
- **Depende de:** P1 no staging (e no `public`, para publicar sem quebrar nada — a P1 vai inteira antes).
- **Pronto:** Vitest verde (regras dos 3 `_shared`, clientes, listas, `semBancoDireto`); publicadas; `api.py` P/N verde no staging (com a
  `treino-acessos`: a conta B com o Treino da conta A → 403; o aluno sem `treino_user_id` guardado acha o treino pelo vínculo) e `--so-leitura`
  na produção; `guarda_teste.py` verde; 1 erro provocado aparece no log só com o código.
- **Prints:** nenhum.
- **Estimativa:** 395 + 110 = **505 min** → calibrado **5h28 a 5h43** (pior 8h25).
- **Riscos:** a Guarda e o `guarda_teste.py` são pontos de encontro (a 20d pode ter mexido: rebasear e acrescentar); a `treino-acessos` no
  Treino (instância pequena, funções frias — risco 8); a massa persistente (`_base.Massa`: a 2ª matrícula e o dono sem papel) limpa no fim.
- **Travas:** 🔒 "publicar função" (as 3) + 🔒 BANCO do staging (o `api.py` cria massa) + 🔒 git (PR → squash → release → `staging` = `main`
  por fast-forward). Avisar a LINUX 1 antes de mexer na Guarda e no `guarda_teste.py`.

### P3 — App: rotinas e lembretes

- **Objetivo:** card "Rotinas de hoje" no Início, página `/perfil/rotinas`, item no Perfil, lembretes locais (APK: 7 ocorrências avulsas por
  rotina, faixa 40000–40299, "Feito"; site: aviso com a página aberta) e a linha "Rotinas, alimentos e receitas que você criou (N)" no resumo
  da exclusão.
- **Arquivos (spec §6):** `src/rotinas/*` (+ `lembretes.test.ts` com o plano puro; a folha com os 2 modos), `src/app-aluno/inicio/CardRotinasHoje.tsx`,
  `src/app-aluno/abas/Inicio.tsx` (+ teste), `src/app-aluno/perfil/Rotinas.tsx`, `src/app-aluno/abas/Perfil.tsx` (+ teste),
  `src/ui/avisos/LembreteDasRotinas.tsx` (+ teste), `src/app-aluno/perfil/pecas/SheetExcluir.tsx` e `src/painel/configuracoes/excluirConta/regras.ts`
  (+ testes: a linha do `rotinas_e_dieta`), `e2e/wa/telas_rotinas.py`; + as linhas das rodadas.
- **Migration/função:** nenhuma.
- **Depende de:** P2 (a `aluno-dia` em produção).
- **Pronto:** criar/mudar/apagar/marcar no site e na loja; a rotina do profissional (semeada pelo `api.py`) com o selo e apagável; no APK do CI
  (G7): o lembrete toca com o app fechado, "Feito" marca no servidor, marcar antes não toca, desmarcar volta, reiniciar mantém, o `getPending`
  tem as 7 ocorrências de cada rotina com lembrete (ids da faixa) e "Sair" esvazia a faixa. Q3/Q4 como estiverem respondidas (ou as recomendadas).
- **Prints:** `r_inicio`, `r_inicio_vazio`, `r_pagina`, `r_nova`, `r_site_aviso`, `r_apk_notificacao`, `r_apk_feito`.
- **Estimativa:** 300 + 190 = **490 min** → calibrado **5h19 a 5h33** (pior 8h10). A esteira é maior pelo G7.
- **Riscos:** alarme exato (Android 14+ "Alarmes e lembretes" não vem dado) e a economia de bateria; > 7 dias sem abrir o app param os
  lembretes (risco 2); o G7 precisa da depuração por Wi-Fi ligada (não desligar o que ele ligou); `adb install` fecha o app (avisar antes).
- **Travas:** 🔒 BANCO do staging (E2E de tela com massa) + 🔒 git (push ff no `staging` para o E2E de staging → PR → squash → release com o
  APK → bump → realinhar com as 3 condições).

### P4 — Painel: aba Acessos

- **Objetivo:** a aba Acessos (6 linhas com rádios, "Mudado por…", resumo no rodapé; Login do aluno ao lado), os cards antigos saem do Resumo
  (o de login muda para a subpasta, igual), o cadeado sai do editor do Treino, os textos que apontavam para o lugar antigo mudam.
- **Arquivos (spec §6):** `src/painel/aluno/catalogoAbas.ts` (+ aba; ORDEM_RESUMO sem `CardAcessoAluno` e com `CardRotinas` na 7ª posição) +
  teste, `abas/Acessos.tsx` (+ teste), `src/painel/aluno/acessos/*`, `resumo/CardAcessoAluno.tsx` (+ teste) → `resumo/acesso/`,
  `resumo/CardAjustesAluno.tsx` + `cardsW14.test.tsx`, `dados/regras.ts` (+ testes que acusarem), `Cabecalho.tsx`, `AlunoLayout.tsx`,
  `abas/Treino.tsx`, `src/treino/editor/EditorTreino.tsx`, `src/painel/gates/FaixaMensagensDesligadas.tsx`, os E2E que procuram o que mudou
  (`e2e/w08b/telas.py`, `e2e/w14/{telas,prod}.py`, `e2e/w15/telas.py`), `e2e/wa/telas_acessos.py`; + as linhas das rodadas.
- **Migration/função:** nenhuma.
- **Depende de:** P2. **Sai logo antes da P5** (sem parte no meio).
- **Pronto:** as 6 linhas e o card de login por papel (personal, nutri, dono sem papel, master) no site e na loja; a nutri trava as séries e o
  app mostra "O número de séries é definido pelo seu profissional"; `semLeituraDireta` intocado e verde.
- **Prints:** `a_acessos_personal`, `a_acessos_nutri`, `a_acessos_sem_login`, `a_acessos_celular`, `a_confirmar_bloqueio`, `a_resumo_depois`,
  `a_editor_sem_cadeado`.
- **Estimativa:** 225 + 130 = **355 min** → calibrado **3h51 a 4h01** (pior 5h55).
- **Riscos:** o APK velho do profissional segue com os cards antigos (o histórico pega pelo gatilho — risco 6); a guarda da hml-20 (área
  `painel-aluno`, `minimo: 100`) — o card de login muda de pasta SEM mudar as RPCs (padrão 2).
- **Travas:** 🔒 BANCO do staging (E2E de tela) + 🔒 git (as 3 condições no realinhar).

### P5 — App: dieta liberada

- **Objetivo:** com a Dieta "Pode mexer", o aluno tira itens do plano só no dia, põe alimento/receita, cria refeição extra e os próprios
  alimentos e receitas; o anel conta o que ele comeu; "Só ver" = tudo como hoje; a seção "Rotinas de hoje" na Dieta.
- **Arquivos (spec §6):** `src/app-aluno/abas/Dieta.tsx` (+ teste), `src/nutricao/app/ui/SheetRefeicao.tsx` (os botões, só liberada),
  `src/dieta-livre/*` (+ testes), `e2e/wa/telas_dieta.py`; + as linhas das rodadas.
- **Migration/função:** nenhuma.
- **Depende de:** P2, P3, P4 (a P4 imediatamente antes).
- **Pronto:** travada = prints iguais aos de hoje; liberada: pôr, tirar, voltar, extra, alimento e receita, anel certo; travar no meio → volta;
  rotinas na Dieta (nutri e pratos prontos); aluno de 2 matrículas segue a liberação da matrícula do plano ativo; APK novo e velho.
- **Prints:** `d_travada`, `d_liberada`, `d_adicionar`, `d_tirar`, `d_extra`, `d_receita`, `d_totais`, `d_rotinas`, `d_voltou_travada`.
- **Estimativa:** 320 + 150 = **470 min** → calibrado **5h06 a 5h20** (pior 7h50).
- **Riscos:** a guarda `semLeituraDireta` (área `dieta`, base 0) — a dieta livre lê só pela `aluno-dia`; o APK velho do aluno não mostra nada
  novo mas o aviso "Sua dieta foi liberada" chega (risco 13).
- **Travas:** 🔒 BANCO do staging + 🔒 git (as 3 condições).

### P6 — Painel: rotinas e dia a dia

- **Objetivo:** o card "Rotinas" no Resumo (as de hoje com o ✓ do aluno, criar/mudar/apagar as de profissional desta matrícula, "Ver tudo"
  com as apagadas e o histórico) e o "Dia a dia" na aba Dieta da ficha (a nutri e o personal, só leitura — Q1).
- **Arquivos (spec §6):** `src/painel/aluno/resumo/CardRotinas.tsx`, `src/painel/aluno/rotinas/*`, `src/painel/aluno/diaADia/*` (+ testes),
  `src/painel/aluno/abas/Dieta.tsx`, `src/nutricao/editor/lib/acesso.ts` (+ "Dia a dia" nas seções, sem leitura direta), `docs/e2e-rodadas.md`
  (a entrada da W-A), `e2e/wa/telas_painel.py`; a folha da rotina vem da P3 (só import).
- **Migration/função:** nenhuma.
- **Depende de:** P2, P3, P4.
- **Pronto:** criar rotina pelo painel → sino do aluno → aparece no app; o aluno apaga → "apagada pelo aluno em …"; a conta B não muda a rotina
  criada na conta A; o dia a dia mostra o que ele pôs/tirou e as rotinas (e o retrato de item que a nutri tirou do plano); o personal vê, só
  para ler.
- **Prints:** `p_resumo_rotinas`, `p_nova_rotina`, `p_apagada_pelo_aluno`, `p_historico`, `p_dia_a_dia`, `p_dia_a_dia_personal`, `p_sino_aluno`.
- **Estimativa:** 230 + 130 = **360 min** → calibrado **3h54 a 4h05** (pior 6h00).
- **Riscos:** `src/nutricao/editor/lib/acesso.ts` é da área `dieta` da hml-20 (base 0): o "Dia a dia" nasce pelo servidor, sem leitura direta.
- **Travas:** 🔒 BANCO do staging + 🔒 git (as 3 condições).

### P7 — Política: as linhas novas (Q2)

- **Objetivo:** a Política em revisão passa a citar as rotinas e a dieta liberada (dados, sensíveis, quem vê, o que sai ao excluir) — só no
  build de staging; a produção não muda.
- **Arquivos (spec §6):** `src/publico/legal/politica.ts` (as linhas da tabela de dados `:97`, a lista dos sensíveis `:113-118`, quem vê
  `:149`, o que sai ao excluir `:212`), `src/publico/legal/textos.test.ts` (+ "a Política cita as rotinas e a dieta liberada"),
  `docs/textos-legais.md` (a linha em "Revisões"); + as linhas das rodadas. **Sem trocar a `VERSAO_TEXTOS`.**
- **Migration/função:** nenhuma.
- **Depende de:** P6.
- **Pronto:** Vitest verde; `/privacidade` do staging com as linhas; `sem-texto-legal-novo.sh` verde no build de produção.
- **Prints:** `t_politica_staging`.
- **Estimativa:** 30 + 40 = **70 min** → calibrado **46 a 48 min** (pior 1h10).
- **Riscos:** trocar a versão sem querer (o `textos.test.ts:62-63` acusa).
- **Travas:** 🔒 git (as 3 condições). Sem BANCO.

## 4. A esteira autônoma de cada parte (o molde; o plano detalhado da parte põe os comandos exatos)

1. **Preparar:** `git fetch`; worktree nova da `origin/main` (a P1 usa esta); `npm ci`; `.env.local` do staging; quadro (linha da parte,
   arquivos, travas pedidas); o plano detalhado (writing-plans) commitado na branch; a foto da parte em 🚧.
2. **Local (TDD):** teste antes (vermelho) → código → verde; `flock` em tudo pesado; Vitest `--maxWorkers=2`, `tipos`, `lint`, `test:node`,
   `node scripts/ci/checar-definer.mjs`, `build` + `checar-chunks` (e o `build:loja` quando houver tela); E2E de tela local na 5173 contra o
   staging (com a trava do BANCO quando cria massa); prints conferidos.
3. **Staging:** check anti-sobrescrita isolado → 🔒 → (migration / funções / push ff no `staging`) → Vercel do staging READY +
   `https://physiqcalc-staging.vercel.app/health.json` com o sha → E2E de staging um por vez (`/health` antes) → massa limpa (sobras 0) → 🔓.
4. **Produção:** check isolado → 🔒 (+ "pausa E2E" se mexe no banco) → backup → migration/funções → PR → CI → squash → release + bump →
   realinhar → `https://physiqcalc.com.br/health.json` com a versão nova → smoke SÓ LEITURA (a Guarda) → logs das funções sem erro novo (só
   contagens e códigos) → 🔓 + "pode voltar".
5. **Fechar:** a foto (`andamento_worktrees.py <json> <pasta> --atual`), o JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-acessos-do-aluno.json`
   (status, `duracao_min`, tag `PR #… · v3.xx`), o quadro (✅ com a hora), o resumo no grupo Validação (`remoto_validacao`, tópico do Physiq)
   com os prints, `claude-orfaos.sh` (órfã → perguntar), a memória do projeto. Depois, a próxima parte.

## 5. Hoje (12/10): a P1 e as janelas

Quadro (linha das janelas, revisada 18:05–18:11): **LINUX 1 (hml-20d)** 🔒 BANCO ~18:45 → ~20:45 (pegou 18:37) e 🔒 git ~20:15 → ~21:30
(a PR da 20d entra antes da P1). A linha da tabela ainda diz 19:45 → 21:40 / 21:15 → 22:30 (o horário de antes de adiantar) — vale o
adiantado; as janelas da W-A não mudam. **LINUX 3 (W-A P1):** só código local até as 23:00; 🔒 BANCO ~23:00 → 23:40 (migrations SÓ no
`staging` + `sql_wa.py`); produção ~23:40 → 00:40 (BANCO + git).

Previsão da P1 (calibrada): começo ~19:45 (depois do G0) → código local (Tasks 0–10) até ~22:45 → staging 23:00 → 23:40 → produção 23:40 →
00:40 → fechar ~00:50. **Se o código não estiver pronto às 22:45 (Task 9 aberta), avisar a LINUX 1 ANTES das 22:45** e pedir as janelas
novas (staging +30 a +60 min e produção logo depois; ou a produção da P1 em 13/10 de manhã). Pior cenário (começo 20:30 e o melhor caso
sem calibrar): staging ~00:20 e produção ~01:00 → 02:00.

## 6. Os riscos do conjunto (spec §8) e o que segura cada um

1. **Tabelas da nutri apagadas de verdade** (C2): SET NULL + retrato; provado na P1 (D12: item, copiar semana, lixeira).
2. **LGPD em cima de corpo velho** (C1): o gerador lê o corpo VIVO de cada schema e PARA se o md5 não for o de 12/10; a migration confere
   (`'aceites'`, `diario-staging`) e a reversa volta ao md5 de antes.
3. **Lembretes** (C3, riscos 1–3): avulsos de 7 dias, prova no G7 pelo `getPending`; a dica de "Alarmes e lembretes" e da bateria.
4. **Escrita entre contas no Treino** (C4): a `treino-acessos` com o vínculo e o `treinoVisivelPelaConta`; a guarda de fonte (uma gravação só).
5. **Guarda da hml-20** (risco 7): toda leitura `acao: "ler"`; as 3 funções registradas na P2.
6. **Janela P4 → P5** (risco 9): a P4 sai logo antes da P5.
7. **Dado de saúde** (risco 10): nada de nome em log/raise/push; canal privado; remédio sem nome na tela bloqueada (Q3); "Sair" limpa.
8. **A janela da P1 hoje** (§5): aviso antes das 22:45 se atrasar.
9. **Pegada em produção** (hml-09): a `staging.pegada_em_producao` lê TODAS as FKs de `public` para `auth.users` — as tabelas novas entram
   sozinhas. Linha de W-A no `public` de um login de TESTE bloquearia a exclusão dele pelo staging → nenhum E2E grava na produção (só leitura).

## 7. Defeitos e ambiguidades achados na spec (anotados; NENHUMA decisão dela mudou)

1. **`docs/e2e-rodadas.md` "só na P6"** (§6 e §10) × a regra H-50 da casa (cada worktree leva as linhas das próprias rodadas no PR dela) e o
   quadro (que já prevê a P1 rebaseando "o topo do `docs/e2e-rodadas.md`"): **cada parte acrescenta as linhas dela no topo** (ponto de
   encontro por acréscimo); a P6 leva, além das dela, a "entrada da W-A". MENOR.
2. **`src/integrations/principal/types.ts` fora de todas as partes:** a casa regenera os tipos quando uma migration do principal muda tabelas
   (W1, W2) → entra na P1 (Task 13, depois do `public`). MENOR.
3. **Padrão 6 (porquê "o push mostra o título na tela bloqueada"):** desde a hml-10 (H-48) o push leva título e corpo FIXOS por tipo
   (`_shared/push-regras.ts`), nunca o texto do aviso. A decisão (sem o nome da rotina no aviso) segue certa para o sino. INFO.
4. **Padrão 8 ("marca hoje ou ontem" × "o ± 1 dia segue o ✓ da refeição"):** o ✓ da refeição aceita amanhã também; a spec decide hoje/ontem
   (§2.2-8, §2.2-10, §5.1) e é o que o banco faz. INFO.
5. **A ordem de aplicação da wa3 na produção não estava escrita:** com o bloco compartilhado (as 2 exclusões do `public`, molde da hml02b), é
   `--so public` e DEPOIS `--compartilhado` (a conferência do compartilhado PARA se vier antes); as exclusões do staging vão guardadas por
   `if '{schema}' = 'staging'` (o `--so public` não toca o staging — a hml02b repetia o bloco do staging). Detalhe de execução.
6. **Quadro com 2 horários para a LINUX 1** (§5): vale o adiantado. INFO.

## 8. Decisões técnicas minhas que valem para mais de uma parte (aparecem na foto; não são do Weslley)

- As RPCs devolvem `{ ok: false, erro }` (nunca exceção) — as funções da P2 só mapeiam o código para o status (§5.2).
- Só quem é aluno (a regra do `meu_paciente_id`: login vivo com matrícula viva) cria rotina para si; o profissional cria pela matrícula.
- Os alimentos e as receitas do aluno exigem a Dieta liberada em ALGUMA matrícula (são do login); o dia exige a da matrícula do dia.
- O "dono sem papel de personal" e a 2ª matrícula das partes P2–P6 = a `Massa` do `e2e/wa/_base.py` (persistente, marcada, com volta).
- O P1 e o P2 não vão ao `staging` do git antes do merge (sem tela): o realinhamento depois do squash é fast-forward.

## 9. Retomar numa sessão nova

Conferir, nesta ordem (tudo só leitura):
1. **Git:** `git -C ~/projetos/physiqcalc-acessos log --oneline -8` (P1) ou `git -C ~/projetos/physiqcalc-wa-p<N> log --oneline -8`; `git -C
   ~/projetos/physiqcalc-acessos fetch origin && git -C ~/projetos/physiqcalc-acessos log origin/main --oneline -8` (as partes que entraram
   têm "W-A P<N>" no título do squash); `git worktree list`; `gh pr list --repo weslleybertoldo/physiqcalc --state open`.
2. **Quadro:** `sed -n 1,12p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md` e a linha "LINUX 3 … W-A" (travas em uso, janelas, o que a
   LINUX 1 está fazendo). Trava minha esquecida → soltar + avisar.
3. **Catálogo:** `cd <worktree com e2e/wa> && python3 e2e/wa/sql_wa.py --so-catalogo --schema staging` e `--schema public` (8/8 = a P1
   aplicada naquele schema; ❌ em K1 = não aplicada).
4. **Massa:** `cat ~/projetos/physiqcalc-scratch/w-a/massa-estado.json` — com algo dentro → `python3 e2e/wa/_base.py --limpar` (sobras 0)
   ANTES de qualquer coisa.
5. **Funções publicadas (P2+):** `curl -s -H "Authorization: Bearer $(cat ~/.pc-pat)" -H "User-Agent: physiq-unificado/1.0" https://api.supabase.com/v1/projects/hkxvtsbwctxkrqzkkdoz/functions | python3 -c "import json,sys; print([(f['slug'], f['version'], f['verify_jwt']) for f in json.load(sys.stdin) if f['slug'] in ('acessos', 'aluno-dia')])"`
   e o mesmo no `uxwpwdbbnlticxgtzcsb` para a `treino-acessos`.
6. **Versões:** `gh release list --repo weslleybertoldo/physiqcalc --limit 3`; `curl -s https://physiqcalc.com.br/health.json` e
   `https://physiqcalc-staging.vercel.app/health.json` (versão, commit).
7. **O andamento:** os `- [ ]` do plano detalhado da parte, as marcas `T<N>-FEITA` em `~/projetos/physiqcalc-scratch/w-a/p<N>/`, o JSON da foto
   (`andamento-physiq-acessos-do-aluno.json`) e as rodadas em `~/projetos/physiqcalc-scratch/e2e-rodadas.tsv` (grep `w-a`).
8. Só então seguir a próxima task não marcada, com a previsão no formato da casa.
