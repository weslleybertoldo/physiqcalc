# W-A P7 — Política: as rotinas e a dieta liberada no texto em revisão — Plano de implementação

> **Para quem executa:** o coordenador da W-A (LINUX 3) executa direto, task por task, com os passos `- [ ]`. Parte pequena (sem migration,
> sem função, sem massa no banco): **só o 🔒 git** (push no `staging`, merge, realinhar).

**Goal:** a Política de Privacidade EM REVISÃO (`src/publico/legal/politica.ts`, que só existe no build de staging) passa a citar as rotinas e
lembretes e o que o aluno registra na dieta liberada — os dados, os sensíveis, quem vê, o que sai ao excluir, o aparelho e os lembretes. A
produção não muda (o texto novo nem entra no bundle de produção; a guarda `scripts/ci/sem-texto-legal-novo.sh` confere no APK).

**Fonte:** spec W-A §6 "P7" (`docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md`), mestre §3 › P7; a decisão dele Q2 "1"
(12/10 ~17:39: "as linhas novas no texto em revisão … vão ao advogado junto com o resto; a produção não muda nesta W").

**Sem trocar a `VERSAO_TEXTOS`** (`2026-10-08`): o texto segue em revisão; a versão vira a data da publicação na virada
(`docs/textos-legais.md`, "A virada"). O `textos.test.ts` ("a versão dos textos") acusa se mudar.

## Os fatos (conferidos no código da `main` `ee27e14`, a P6 — nada aqui é suposição)

| Fato | Onde |
|---|---|
| Rotina = nome, detalhe (dose), tipo `suplemento·remedio·habito·outro`, horário, dias da semana, quem criou (`criada_por`), dono = o aluno | `supabase-principal/migrations/20261012210000_wa2_rotinas.sql` (`rotinas`, `rotinas_feitas`, `rotinas_historico`) |
| O aluno apaga até a do profissional; a apagada fica e o profissional vê "apagada pelo aluno em dd/mm" + o histórico | `src/painel/aluno/rotinas/regras.ts:106-110`, `FolhaTodasAsRotinas.tsx` |
| A rotina criada por um profissional é da matrícula daquela conta: o profissional de OUTRA conta não a vê; a criada pelo aluno, todos veem | E2E P6 caso P7 (`e2e/wa/telas_painel.py`) |
| A página de rotinas avisa "Seus profissionais veem as suas rotinas." (Q4 "1") | P3 (`src/rotinas/textos.ts`) |
| O personal vê o "Dia a dia" da dieta, só para ler (Q1 "1"); a nutri vê e trava/libera | P6 (`src/painel/aluno/diaADia/**`, aba Dieta da ficha) |
| Dieta liberada: o aluno põe e tira alimentos no dia dele, cria refeições extras e alimentos e receitas só dele | P5 (`src/dieta-livre/**`), `wa3_dieta_livre.sql` (`aluno_alimentos`, `aluno_receitas`, `aluno_dia_refeicoes`, `aluno_dia_itens`) |
| Excluir a conta apaga as rotinas do aluno (todas, com as feitas e o histórico), os alimentos, as receitas, as extras e o que pôs/tirou | `wa_dados_do_aluno(p_uid, true)` em `wa3_dieta_livre.sql:279-302`, chamada pela `excluir_dados_aluno` e pela `excluir_conta_profissional` |
| Lembrete: no APK, notificação LOCAL agendada no aparelho (7 avulsas por rotina); no site, só com a página aberta (toast) | `src/rotinas/aparelho.ts`, `src/ui/avisos/LembreteDasRotinas.tsx:23-30` |
| Sair, trocar de conta e excluir a conta esvaziam os lembretes do aparelho | `limparLembretesDoAparelho()` `src/rotinas/aparelho.ts:74-89` |
| Lembrete de remédio = "Hora do seu remédio · 08:00" (sem o nome); os outros tipos com o nome e a dose (Q3 com a recomendada) | `src/rotinas/textos.ts:7-16` |
| Nenhuma limpeza automática das rotinas nem da dieta liberada (ficam enquanto a conta existir — a linha "Dados da conta e do app" da seção 9 já cobre) | `grep cron/interval` nas 3 migrations da W-A: nada |

## As mudanças no texto (`src/publico/legal/politica.ts`)

1. **Seção 3, a tabela** — a linha "Alimentação" ganha o que o aluno registra com a dieta liberada; uma linha NOVA "Rotinas e lembretes" logo
   depois dela:
   - `| Alimentação | plano alimentar, refeições marcadas, metas, as fotos e comentários do diário alimentar e, quando o nutricionista libera a dieta, o que você muda no seu dia: os alimentos que você põe e tira, as refeições extras e os alimentos e receitas que você cria | acompanhar a dieta com o nutricionista |`
   - `| Rotinas e lembretes | nome, dose, tipo (suplemento, remédio, hábito ou outro), horário, dias da semana, quem criou, o que você marcou como feito e o histórico de mudanças, inclusive das rotinas apagadas | lembrar você no horário e mostrar as rotinas a você e aos seus profissionais |`
2. **Seção 4, os sensíveis** — "a alimentação e o diário;" vira "a alimentação e o diário, inclusive o que você muda na dieta do seu dia;" e
   entra, logo depois, "as rotinas, como remédios e suplementos, e o que você marcou como feito;".
3. **Seção 6, quem vê** — 2 itens novos depois do do personal/nutricionista:
   - "Os seus profissionais veem as rotinas que você cria e as que foram criadas na conta deles, inclusive as apagadas, o que você marcou como
     feito e o histórico de mudanças. A página das rotinas avisa isso."
   - "O seu nutricionista vê o que você muda na dieta do seu dia. O seu personal também vê esse dia a dia, só para ler."
4. **Seção 10, a exclusão do aluno** — o 1º subitem passa a listar "as rotinas (inclusive as criadas pelos seus profissionais, com o que você
   marcou e o histórico), os alimentos e receitas que você criou, o que você mudou na dieta do seu dia" e "os lembretes e a cópia do treino
   guardados no aparelho".
5. **(decisão minha — o mesmo assunto, em 2 lugares que o texto já tinha)** Seção 12: o item "os lembretes das suas rotinas, agendados no
   aparelho pelo app Android; saem quando você sai da conta;". Seção 13: "As notificações não mostram nome nem valor." ganha a frase dos
   lembretes ("Os lembretes das rotinas mostram o nome da rotina e a dose; o de remédio mostra só a hora, e o nome do remédio aparece ao abrir o app.") — sem ela,
   a frase de hoje fica ambígua com o lembrete "Hora da rotina — Creatina · 5 g". Se ele preferir sem os 2, sai 1 commit.

## Arquivos

- Editar: `src/publico/legal/politica.ts`, `src/publico/legal/textos.test.ts` (+1 `it`), `docs/textos-legais.md` (a linha em "Revisões" e a
  menção da P7 em "O texto novo"), `docs/e2e-rodadas.md` (o topo: as rodadas de produção da P6 + as da P7).
- Novo: `e2e/wa/telas_politica.py` (a /privacidade: no staging, as frases novas com a faixa "em revisão"; na produção, nenhuma — prints
  `t_politica_<base>_*`), `docs/superpowers/plans/2026-10-13-w-a-p7-politica.md` (este plano).
- Fora do repo: o pacote do advogado (`~/Desktop/Plano de Retorno Pessoal/Physiq/advogado/politica-de-privacidade.md` + `LEIA-ME.md`) com as
  mesmas linhas, marcadas `[W-A]` (nada é enviado: quem manda ao advogado é ele).
- Não tocar: `versao.ts` (a `VERSAO_TEXTOS`), `src/publico/privacidade/**` (a Política EM VIGOR), nada da hml-21 (o `src/publico/legal/responsavel/api.ts`
  é da 21c).

## Comandos (todas as tasks)

- W = `~/projetos/physiqcalc-wa-p7`, S = `~/projetos/physiqcalc-scratch/w-a/p7`. Sem `bash -c`, subshell com `time`, `eval` nem `$(…)` na linha.
- Pesado na fila: `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P <cmd>`;
  Vitest = `bash S/vitest.sh <arquivos>` (2 workers).
- Commit: `git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<msg>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`.
- Travas: `python3 S/quadro_travas.py pegar-git "<o que faz>"` / `soltar git "<texto>"` + `SendMessage` à LINUX 1 (a sessão da linha dela no quadro).
- Cada task fechada → `bash S/feita.sh <N> "<resumo>" "<linha>"`.

---

### Task 0: Preparar (10 min) — depois da P6 em produção

- [ ] `git -C ~/projetos/physiqcalc fetch origin && git -C ~/projetos/physiqcalc log origin/main --oneline -3 && gh pr list --repo weslleybertoldo/physiqcalc --state open && bash S/travas.sh`
  → a `main` com o squash da P6 + o bump v3.120; 0 PR mexendo em `src/publico/legal/**` ou `docs/textos-legais.md`.
- [ ] `git -C ~/projetos/physiqcalc worktree add -b feat/w-a-p7-politica ~/projetos/physiqcalc-wa-p7 origin/main && cp ~/projetos/physiqcalc-acessos/.env.local ~/projetos/physiqcalc-wa-p7/.env.local && grep -c "^VITE_DB_SCHEMA=staging$" ~/projetos/physiqcalc-wa-p7/.env.local`
  → `1`; `npm ci` na fila.
- [ ] O plano no repo (`docs/superpowers/plans/2026-10-13-w-a-p7-politica.md`, 1 commit).
- [ ] Drift: as linhas que a Task 1 edita ainda são as da `ee27e14` (`grep -c` de cada frase original = 1).
- [ ] Quadro (linha da W-A: "🚧 P7 (Política) desde HH:MM — worktree …; RESERVADOS: `src/publico/legal/politica.ts`, `src/publico/legal/textos.test.ts`,
  `docs/textos-legais.md`, `e2e/wa/telas_politica.py`, o plano; o topo do `docs/e2e-rodadas.md` por acréscimo; sem migration, sem função, sem BANCO; 🔒 git nas Tasks 4 e 6")
  + `SendMessage` à LINUX 1 (os arquivos; nenhum da 21c; o git ~15 min no push do staging e ~25 min no merge, cada um com o "pode ir" dela).

### Task 1: O teste (vermelho) e o texto (verde) — TDD (15 min)

- [ ] `textos.test.ts`, no `describe("Política de Privacidade × o app")`: o `it("W-A: a Política cita as rotinas e a dieta liberada (os dados, os
  sensíveis, quem vê, o que sai ao excluir, o aparelho e os lembretes)")` com um `toContain` por frase nova (as do bloco acima, como a tela
  mostra: `textoVisivel(lerMarkdown(politicaDePrivacidade(false)))`; a linha da tabela no formato "a | b | c") + a versão da Google Play
  (`politicaDePrivacidade(true)`) com as mesmas.
- [ ] `bash S/vitest.sh src/publico/legal/textos.test.ts` → VERMELHO só no `it` novo.
- [ ] As 6 edições do `politica.ts` (as frases exatas do bloco "As mudanças"; o recuo das continuações como o texto de hoje).
- [ ] `bash S/vitest.sh src/publico/legal` → verde (o `it` novo + os de sempre: sem marcador, âncoras, links, a versão 2026-10-08).
- [ ] `npx eslint src/publico/legal/politica.ts src/publico/legal/textos.test.ts` → 0. Commit `feat(legal): a Política em revisão cita as rotinas e a dieta liberada (W-A P7)`.

### Task 2: Os docs e o pacote do advogado (10 min)

- [ ] `docs/textos-legais.md`: em "Revisões", a linha `| 13/10/2026 | \`2026-10-08\` (em revisão) | W-A: as rotinas e lembretes e a dieta liberada
  (os dados, os sensíveis, quem vê, o que sai ao excluir, o aparelho e os lembretes): no staging | pendente |`. Commit `docs(legal): …`.
- [ ] O pacote do advogado (fora do repo): as mesmas linhas no `advogado/politica-de-privacidade.md`, cada uma com `[W-A]`, a legenda do `[W-A]`
  no "Como ler" e 1 linha no `LEIA-ME.md` ("13/10/2026: entraram as rotinas e a dieta liberada (W-A); ver o ponto 6").

### Task 3: O E2E da página e a prova local (20 min)

- [ ] `e2e/wa/telas_politica.py` (Playwright, Edge; sem login; nada grava): `--base local|staging|prod`; local/staging: `/privacidade` com
  `[data-pagina-legal='politica']` e `[data-texto-em-revisao]`, cada frase nova presente (1280 e 390 px), a página cabe em 390 px; prints
  `t_politica_<base>_tabela_1280`, `_quem_ve_1280`, `_exclusao_1280` e `_390`; prod: `/privacidade` SEM `[data-pagina-legal]` e sem nenhuma
  frase nova (a Política em vigor). `--seco`: as frases do E2E existem no `politica.ts`. Commit `test(e2e): …`.
- [ ] Prova local na fila: lint, tipos, definer, test:node, Vitest do repo inteiro (4 fatias), build + chunks; o build de PRODUÇÃO
  (`VITE_DB_SCHEMA=public npm run build:apk`) + `bash scripts/ci/sem-texto-legal-novo.sh dist` → verde (e no build de staging → FALHA = o
  controle positivo); o `--seco`.
- [ ] E2E local na 5173 (o build de staging): `python3 e2e/wa/telas_politica.py --base local --canal msedge` → tudo ✅; prints conferidos (Read).

### Task 4: Staging (🔒 git; 10 min)

- [ ] Check ISOLADO (`git -C W fetch origin && git -C W merge-base --is-ancestor origin/main HEAD && echo main-ok`; e o staging = a main) →
  🔒 git (quadro + `SendMessage` + o "pode ir") → `git -C W push origin HEAD:staging` (fast-forward) → `bash S/esperar_vercel.sh <sha7>`.
- [ ] `python3 e2e/wa/telas_politica.py --base staging --canal msedge` → ✅; prints `prints/w-a/p7/staging/` (Read) — o `t_politica_staging`
  do mestre = `t_politica_staging_tabela_1280`.
- [ ] Regressão: `python3 e2e/hml11/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging-wa-p7 --modo staging --casos S3,S4,S5 --canal msedge`
  (as 3 páginas novas abrem, sem marcador de rascunho). 🔓 git (o merge vem logo depois — manter se a LINUX 1 não precisar).

### Task 5: As rodadas, o PR e o CI (10 min)

- [ ] O topo do `docs/e2e-rodadas.md`: as rodadas de produção da P6 (o smoke da Task 12 da P6) + as da P7 (local, staging, regressão). Commit.
- [ ] Push da branch + PR "W-A P7: a Política em revisão cita as rotinas e a dieta liberada (só staging)" (corpo: o que muda, as 6 edições, a
  decisão minha do item 5, a produção não muda, os placares, o rodapé 🤖) → CI (`checar-pr` + Vercel + o `build-apk-check` com a guarda).

### Task 6: Merge → release → bump → `staging` = `main` → smoke SÓ LEITURA (25 min; 🔒 git)

- [ ] Check isolado + só este PR aberto → `gh pr merge <n> --squash --delete-branch --match-head-commit <sha completo>` → o squash (autor noreply)
  e a hora UTC → o CI da `main`: release v3.120 com o APK + o bump v3.121 → `curl -s https://physiqcalc.com.br/health.json`.
- [ ] `bash S/realinhar_confere.sh <squash>` (o staging fora da main = SÓ os commits da P7; a árvore × o squash = só as rodadas) → ISOLADO
  `git -C W push origin origin/main:staging --force-with-lease=staging:<STAGING_SHA>`.
- [ ] Smoke SÓ LEITURA: `python3 e2e/wa/telas_politica.py --base prod --canal msedge` (a /privacidade em vigor, sem as frases novas) +
  `python3 e2e/hml11/telas.py --base https://physiqcalc.com.br --prefixo prod-wa-p7 --modo producao --casos S1,JS --canal msedge` (nenhuma marca
  do texto novo no HTML nem nos JS) + `python3 e2e/w07/smoke_prod.py telas --versao 3.120 --canal msedge`.
- [ ] 🔓 git + "livre" + o sha da `main` nova à LINUX 1.

### Task 7: Fechar a P7 e a W-A (15 min)

- [ ] Quadro (✅ P7 …; a linha da W-A: ✅ W-A FECHADA), foto (P7 `feito`; todas as páginas), Validação › Physiq (o resumo + os prints do staging),
  memória (`projeto-physiq-unificado` + `MEMORY.md`), o plano mestre da W-A (`Physiq - acessos do aluno (W-A) - 2026-10-12.md`) CONCLUÍDO →
  `concluidos/`, `claude-orfaos.sh`, worktree e branch removidas (a `physiqcalc-acessos` também: o mestre manda sair no fim da W-A).

## Riscos

1. Trocar a versão sem querer → o `textos.test.ts` acusa (a versão 2026-10-08).
2. O texto novo vazar para a produção → a guarda do CI (`sem-texto-legal-novo.sh` no APK) + o smoke `hml11 --modo producao --casos JS` no site.
3. Uma frase dizer o que o app não faz → cada frase tem a linha na tabela "Os fatos" (o código da P6).
4. A LINUX 1 no git na hora do merge → o "pode ir" antes; ela não usa o git até ~0h.
