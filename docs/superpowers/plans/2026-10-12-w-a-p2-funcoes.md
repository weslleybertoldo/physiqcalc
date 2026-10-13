# W-A P2 — Funções e contratos: `acessos`, `aluno-dia` e `treino-acessos` (+ os clientes, as listas, a Guarda e o E2E de servidor) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** as 3 funções do jeito 2 da W-A — `acessos` e `aluno-dia` no banco principal (COMO A PESSOA, pela `porta-pessoa`) e `treino-acessos` no
Banco do Treino (com o login do principal, no molde da `treino-leitura`, com o vínculo de identidade e a trava por conta da revisão C4) — com
a FORMA conferida antes de cada RPC da P1, os clientes e as regras puras do front (`src/acessos`, `src/aluno-dia`), as listas de log com a guarda
de fonte, a guarda `semBancoDireto`, a Guarda dos E2E e o `e2e/wa/api.py`; provadas no Deno LOCAL (contra um falso do Supabase), publicadas e
provadas por papel no staging, escuras na produção (smoke só leitura). Nenhuma tela usa ainda (a P3 liga as rotinas; a P4, a aba).

**Architecture:** 3 funções, uma RPC por ação. A função confere a forma (lista fechada de ações e de `q`, uuid, data, "HH:MM", tamanhos e níveis
por chave — os limites DO BANCO), monta os parâmetros com os nomes da migration (`p_*`), chama a RPC COMO A PESSOA (`c.comoPessoa.rpc`: o token
dela; o RLS e a regra da RPC decidem) e traduz `{ ok, … }` / `{ ok: false, erro }` em status (as RPCs da P1 nunca levantam exceção). As regras
moram em `_shared` PUROS (Vitest) e um teste de CONTRATO lê as 3 migrations e confere que cada ação chama a RPC com os parâmetros de lá, nome
por nome. A `treino-acessos` faz os 6 passos da spec §5.2: Auth do principal → `acessos_ler` como a pessoa → o `treino_user_id` guardado ou o
vínculo `physiq_identidades` → `treinoVisivelPelaConta` → lê/grava SÓ `series_travadas` com a chave automática do Treino →
`acessos_registrar_series` como a pessoa. Front: `principal.functions.invoke` (1 chamada, sem repetir, frase fixa por código) e, para a do
Treino, o fetch de 1 tentativa da `treino-leitura` com o token do principal. Prova local: as 3 no Deno (`e2e/w1/servir_local.ts`) contra
`e2e/wa/supabase_falso.py` (o Auth, as RPCs com a assinatura LIDA das migrations, as 2 tabelas do Treino); prova de verdade: `e2e/wa/api.py` no
staging (P/N por papel nos 2 bancos, os negativos da §5.5) e `--so-leitura` na produção.

**Tech Stack:** Deno 2.5 (`~/.deno/bin/deno`: `deno check` e `deno run` local), supabase-js 2.39 (esm.sh), TypeScript, Vitest (`--maxWorkers=2`),
Node 22 (`--experimental-strip-types`, no `--seco`), Python 3 (E2E pelos domínios próprios e pela Management API com `~/.pc-pat`),
`scripts/deploy_function.sh`.

**Entradas:** spec `docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md` (§2.2-4/16, §5.2, §5.5, §5.6, §5.7, §6 "P2", §7, §8) — a
fonte; a revisão `~/projetos/physiqcalc-scratch/w-a/spec-review-w-a.md` (C4, I1, MENOR 22); o mestre `docs/superpowers/plans/2026-10-12-w-a-plano-mestre.md`
(§0, §3 "P2", §4, §8, §9); o plano da P1 (molde) e as notas `~/projetos/physiqcalc-scratch/w-a/p1/{T11-FEITA,P1-PROD-FEITA,progresso.log}`; o quadro
`~/projetos/physiqcalc-scratch/quem-toca-o-que.md`; `~/projetos/physiqcalc-scratch/hml/hml21/para_linux3.md` (a divisão com a hml-21) e a branch
`feat/hml-21a-jeito2-conta-base` (lida com `git show`/`git diff`, sem checkout); os moldes: `supabase-principal/functions/financeiro/index.ts`,
`nutricao/{comum,aluno}.ts`, `supabase/functions/treino-leitura/index.ts`, `src/financeiro/gravar.ts`, `src/treino/editor/api.ts:279-300`,
`e2e/hml19/_base.py` (`funcao_fin`, `regras_fin`) e o `--local` da W2 (`e2e/w2/api.py:534-610`, `e2e/w1/servir_local.ts`).

**Modo:** até o fim (o G0 do mestre vale). Sem gates humanos; validação com evidência (placares, os pedidos do falso, logs, catálogo). Sem prints
(sem tela).

**Conferido ao escrever este plano (12/10 ~22:50–23:30, SÓ LEITURA — Management API `read_only`/GET, `git show`; nada rodou no repo nem no banco):**
- base `110b228` (v3.111) = `origin/main` = `origin/staging`; a P1 em produção (PR #194; catálogo do `public` 8/8; staging 53/53).
- os 3 slugs estão livres (GET `/functions`): o principal tem 30 funções, sem `acessos`/`aluno-dia`; o Treino 22, sem `treino-acessos` (a
  `treino-leitura` é a v20, `verify_jwt` false); a `conta` da hml-21a ainda não foi publicada.
- as 25 RPCs que a P2 chama e os parâmetros delas (lidos das 3 migrations): `acessos_ler(p_aluno)`, `acessos_salvar(p_aluno, p_chave, p_valor)`,
  `acessos_registrar_series(p_aluno, p_de, p_para)`, `minhas_rotinas(p_de, p_ate)`, `rotina_salvar(p_id, p_dados)`, `rotina_arquivar(p_id)`,
  `rotina_marcar(p_id, p_dia, p_feita)`, `rotinas_ordenar(p_ids)`, `rotinas_do_aluno(p_aluno, p_de, p_ate)`, `rotina_prof_salvar(p_aluno, p_id,
  p_dados)`, `rotina_prof_arquivar(p_aluno, p_id)`, `meu_dia(p_dia)`, `dia_adicionar(p_dia, p_dados)`, `dia_tirar(p_dia, p_item)`,
  `dia_desfazer(p_id)`, `dia_extra_salvar(p_id, p_dados)`, `dia_extra_excluir(p_id)`, `dia_extra_marcar(p_id, p_feita)`, `meus_alimentos()`,
  `meu_alimento_salvar(p_id, p_dados)`, `meu_alimento_excluir(p_id)`, `minha_receita_salvar(p_id, p_dados)`, `minha_receita_excluir(p_id)`,
  `buscar_alimentos_do_aluno(p_termo, p_pagina)`, `dia_do_aluno(p_aluno, p_de, p_ate)` — todas `{ ok, … }` ou `{ ok: false, erro }`.
- a massa de TESTE do staging (`read_only`, só booleanos e contagens): a `w5p-aluna` com 1 matrícula viva (A: conta `treino_nutricao`, personal
  `w5p-personal` [dono, personal], nutri `w5p-nutri` [nutricionista]) **SEM `treino_user_id` guardado** — o vínculo `physiq_identidades` existe no
  Treino e o perfil do Treino é da conta A, com `series_travadas = true` (a foto: "ver"); o plano ativo com 5 refeições, todas "todo dia" e com
  alimento; TACO 591; 33 refeições de planos vivos de OUTROS pacientes; a conta do `w13-dono` `treino_nutricao` (ele [dono, personal]); o
  `w7b-sozinho` na conta do app; 0 linha da W-A da aluna (acessos, histórico, rotinas); 0 matrícula `wa_e2e`; nenhum alimento próprio da nutri
  fora do plano da aluna (o `api.py` cria um, com volta).
- a hml-21a (branch local `feat/hml-21a-jeito2-conta-base`; relida 13/10 00:10: 6 commits sobre `110b228`, o último `fe02c27`) **entra na `main` ANTES da P2** (aviso da LINUX 1, 12/10
  ~23:40: o git dela ~01:45 → 03:15; o 🔒 BANCO do staging com ela até ~02:30; a P2 publica depois do "livre" dela): a `porta-pessoa.ts` ganha a
  opção `jwtLeitura` (padrão inalterado) e passa a importar `_shared/jwks-principal.ts`, que importa o `jose` (`https://esm.sh/jose@5.9.6`) — o
  bundle da `acessos` e da `aluno-dia` passa a levar o `jose` (Task 16: rebase, `deno check` e a execução local DEPOIS do rebase, e a prova de que a
  P2 não depende do caminho antigo da porta nem usa a opção nova); a Guarda (`hml17/_base.py` + `conta` + `prof_planos`; `w26/prod.py` + `conta`;
  `guarda_teste.py`); `logsDasFuncoesPrincipal.test.ts` (+ `conta`, o fecho com 4 `_shared` novos); e a guarda NOVA
  `src/integrations/semBancoNoNavegador.test.ts`, que acusa `.auth.<método>(` fora dos arquivos do login e da lista `SESSAO_ANTES_DA_FUNCAO`
  — o `src/acessos/api.ts` precisa do `principal.auth.getSession()` para levar o token à `treino-acessos` (defeito 1).
- o D5 da P1 (hipótese forte — Task 1): o caso lê `planos_alimentares` COMO A ALUNA (policy "paciente: ler os proprios planos" →
  `meu_paciente_id()`, `limit 1` SEM `order by`, `20260920070000_paciente_acesso.sql:46-47,210-212`) e o preâmbulo de cada bloco do
  `sql_wa.py` cria a 2ª matrícula viva dela (`e2e/wa/sql_wa.py:114`); quando a linha da B fica fisicamente antes da A, o plano da A some para ela →
  `matricula: null`. As RPCs (definer) não dependem disso; o teste depende.
- **o ENSAIO do código deste plano (13/10 00:15–00:45, FORA do repo** — uma cópia em `~/projetos/physiqcalc-scratch/tmp/wa-p2-ensaio-plano` e no
  scratchpad, apagada no fim; nada no repo, no banco, na borda nem no registro oficial das rodadas): os blocos do plano copiados como estão →
  `tsc` do app e do node 0 erro · Vitest dos 7 testes novos + as 2 listas com as edições da Task 5: **9 arquivos, 383 testes** · `eslint` nos
  arquivos da P2 0 · `checar-funcoes` 0 novo · `deno check` das 3 funções (e da `financeiro`/`treino-leitura` no repo: 0 erro) · o falso do
  Supabase `--autoteste` **10/10** contra as migrations de verdade · o `--seco` **48/48** · o `--local` (as 3 no Deno 2.5.2) **95/95 três vezes** ·
  o `guarda_teste.py` com as edições da Task 12 **158/158** · o mapa da Task 14 **35/35**. O ensaio achou e o plano já corrige: (1) o
  `aluno-dia-regras.ts` estreitava a união com `!r.ok`/`r.ok ? … : r` — o `tsconfig.app.json` é `strict: false` (sem `strictNullChecks`) e isso não
  estreita: 27 erros no `tsc` → agora `r.ok === false`, como a `nutricao-regras`/`financeiro-gravar-regras`; (2) o L15 (2 MB) mandava os bytes de
  verdade e corria com a resposta (a porta responde 413 pelo tamanho DECLARADO e fecha no meio do envio → `BrokenPipe` na 2ª rodada) → agora só
  os cabeçalhos com o `Content-Length` (`local_grande`). Não rodou: a Task 1 contra o banco, o staging e a produção (de propósito).

---

## Decisões técnicas minhas (P2 — não são do Weslley; aparecem na foto)

1. **Erro = `{ ok: false, erro }` nas 3**, com a frase fixa na tela (os clientes); status por código numa tabela por função; código que a RPC
   devolver e a tabela não conhecer → 500 `erro_interno` + `log.erro rpc_inesperada` (o Weslley fica sabendo).
2. **A volta da `acessos` é uma whitelist:** `paciente_id, tem_login, modulos, conta_modulos, tem_nutricionista, pode_mudar, linhas, mudancas` — a
   P4 precisa dos 2 a mais da spec ("Só com Treino/Nutrição", "Só com nutricionista"; a RPC da P1 já devolve); os ids internos (`user_id`,
   `conta_id`, `treino_user_id`) ficam no servidor (a `treino-acessos` lê do principal).
3. **A forma antes da RPC com os limites DO BANCO** (nome 1–60/1–40/1–80 aparado, detalhe ≤ 120, "HH:MM", dias 1–7, gramas 0,01–9999,99, porções,
   macros por 100 g, 1–30 itens, ≤ 30 ids, janela ≤ 31 dias, termo ≤ 60, página 0–50). Os parâmetros com tipo do PostgREST (`uuid`, `date`,
   `boolean`, `integer`, `uuid[]`) vão SEMPRE conferidos (o cast de um texto cru leva o valor na mensagem do Postgres); o texto do `p_dados` vai CRU
   (o banco apara e grava) — nos casos de borda (tab, NBSP) os 2 lados respondem `dados_invalidos`.
4. **`aluno-dia`: uma regra pura** (`pedidoDoAlunoDia`) devolve `{ modulo, acao, q, rpc, args }`; os 3 módulos (`rotinas`, `dieta`, `profissional`)
   são finos e chamam o `comum.chamar` — ficam pela lista da spec e para as partes seguintes porem o que for da área sem mexer no `index.ts`.
5. **`ler` da `aluno-dia` = 1 consulta por pedido** (`{ acao: "ler", q, … }`), sem lote — o contrato da spec.
6. **`treino-acessos`:** freio 120/min por IP e 60/min por pessoa (os da `treino-leitura`); corpo até 16 KB (413 `corpo_grande`); `x-schema`
   ausente = `public` (como a `treino-leitura` e a `porta-pessoa`); `salvar` sem mudança = nada grava, nada registra, `registrado: false`; o
   principal fora do ar ou com resposta inesperada (5xx, PGRST202, 4xx que não é recusa) = 502 `principal_indisponivel` + `log.erro`.
7. **Os clientes** chamam 1 vez (leitura também — o `ACOES_DE_LEITURA` é da hml-21: defeito 9); a `treino-acessos` sem resposta = `rede`.
8. **Logs:** só código, ação (`ler_<q>` na leitura), schema, o nome do CAMPO recusado, o status e o código do Postgres; nunca nome de rotina,
   alimento ou aluno (o E2E de staging confere no log da borda: a marca da rodada em 0 linha).
9. **Prova local contra um FALSO do Supabase** (o molde do simulador do MP da W2): sem trava do BANCO, a qualquer hora, sem rede; o `api.py` no
   staging é a prova de ponta a ponta.
10. **A massa do `api.py`:** a 2ª matrícula e o "dono sem papel" pela `Massa` do `_base.py`; as matrículas "sem login" e "só nutri" também na `Massa`
    (o id vai para o estado ANTES do insert); o resto (rotinas, alimentos, receitas, extras e itens do dia, os acessos/histórico/avisos da A, o
    `config` da A, o `series_travadas` do Treino e o alimento "fora do plano") num estado próprio (`~/projetos/physiqcalc-scratch/w-a/api-estado.json`)
    com a FOTO de antes; `--limpar` desfaz e as sobras dão 0. A 2ª matrícula vive o mínimo (só os casos de 2 contas) — ver risco 4.
11. **As rodadas de produção da P2** (o smoke só leitura logo depois de publicar, ANTES do PR) entram no PR da própria P2, junto com as de produção
    da P1 (defeito 4).
12. **A P2 não vai ao `staging` do git antes do merge** (sem tela): depois do squash, o `staging` anda por fast-forward (mestre §0).
13. **As 2 do principal SEM a opção `jwtLeitura` da hml-21a:** `servirComoPessoa("acessos", { freio: 120 }, …)` e `("aluno-dia", { freio: 240 }, …)`
    — o `getUser` no Auth em TODO pedido, leitura também (a revogação vale na hora; é o caminho que a LINUX 1 deixou como padrão "para as da W-A").
    A guarda de fonte (Task 5) fixa as 2 linhas e o `--local` (Task 13) prova 1 `GET /auth/v1/user` por pedido e nenhum pedido ao JWKS. Trocar
    para o JWKS no `ler` fica para depois (medir antes), fora da P2.
14. **Rebase na `main` com a hml-21a ANTES de publicar** (Task 16 antes da Task 17): o que vai para a borda é o código já com a porta nova; assim
    não há republicação depois do merge.

## Defeitos e ambiguidades da spec (anotados; nenhuma decisão dela mudou)

1. **IMPORTANTE — o cliente da `treino-acessos` × a guarda nova da hml-21a.** A spec (§5.2, front) manda a `treino-acessos` "pelo
   `criarFetchResiliente(0, TEMPO_FUNCAO_MS)` como a `treino-leitura`" — isso exige `principal.auth.getSession()` no `src/acessos/api.ts` (o token
   do principal). A `src/integrations/semBancoNoNavegador.test.ts` (hml-21a, arquivo da LINUX 1) acusa `.auth.getSession(` em arquivo que não está
   no `SESSAO_ANTES_DA_FUNCAO` → o CI de quem entrar por último fica vermelho (no `fe02c27` a lista ainda tem só 6 arquivos, sem este; e o
   cabeçalho da guarda diz "a W-A não edita esta guarda — só a hml-21 edita"). Saída (Task 0, Step 5): pedir à LINUX 1 a linha
   `"src/acessos/api.ts"` no `SESSAO_ANTES_DA_FUNCAO` (a lista não confere se o arquivo existe: dá para pôr antes); se ela preferir, a P2 põe a
   linha com o "pode ir" EXPLÍCITO dela (regra 6 do quadro) — sem ele, a P2 não edita e para antes do push (Task 16, Step 3).
2. **MENOR — a volta da `acessos`** (§5.2) lista 7 campos; a P4 precisa também de `conta_modulos` e `tem_nutricionista` (decisão 2).
3. **MENOR — `docs/desvios.md`** ("as 17 funções com `verify_jwt=false` … e nenhuma outra") fica desatualizado com a `treino-acessos`; a spec não
   cita; o arquivo é da LINUX 1 e a 21e já prevê "17 → 21" → a P2 NÃO mexe; avisa na mensagem de publicar (Task 17).
4. **MENOR — "as rodadas de produção vão no PR da parte seguinte"** (mestre §0) não serve para a P2: a produção dela (publicar = os 2 schemas)
   acontece ANTES do merge → as rodadas de produção da P2 vão no PR dela (com as de produção da P1); só o que rodar depois do merge vai para a P3.
5. **MENOR — números que a spec não dá:** o freio da `treino-acessos` ("por IP e por pessoa") e o 413 (o código `corpo_grande` da `porta-pessoa`) —
   decisão 6.
6. **INFO — a causa provável do D5** é do TESTE (Task 1); mas o achado vale para o produto, fora da W-A: um aluno com 2 matrículas vivas vê pelo RLS
   as linhas de UMA delas, ao acaso (`meu_paciente_id()` sem `order by`) — afeta leituras diretas como aluno (não as RPCs definer). Vai no resumo
   para o Weslley/a homologação; a W-A não muda nada nisso.
7. **INFO — perfil do Treino SEM conta** (`physiq_profiles.conta_id` nulo) é gravável por quem vê uma matrícula viva do aluno — a mesma regra da
   leitura (`treinoVisivelPelaConta`, revisão C4); fica como está, anotado nos riscos.
8. **INFO — `semBancoDireto` × `Array.from`:** o detector da spec ("nenhum `.from(`") pegaria o `Array.from(` das regras puras; usa o mesmo do
   `semLeituraDireta` da hml-20 (`(?<!\bArray)\.from\(`).
9. **INFO — as leituras da W-A não repetem** (a `ler` da `nutricao`/`financeiro` repete 1 vez pelo `ACOES_DE_LEITURA` do
   `src/integrations/repeticao.ts`, que é da hml-21 e está na lista "não tocar" da spec §5.7). Pedido opcional à LINUX 1 (não bloqueia).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase-principal/functions/_shared/acessos-regras.ts` (novo) | a forma da `acessos` (ações, chaves, níveis), a RPC e os parâmetros, a whitelist da volta, o status |
| `supabase-principal/functions/acessos/index.ts` (novo) | a função `acessos` pela `servirComoPessoa` (freio 120/min) |
| `supabase-principal/functions/_shared/aluno-dia-regras.ts` (novo) | a forma das 6 leituras e das 16 gravações da `aluno-dia` (os limites do banco), a RPC e os `p_*`, a volta, o status |
| `supabase-principal/functions/aluno-dia/{index,comum,rotinas,dieta,profissional}.ts` (novos) | a função `aluno-dia` (freio 240/min): o despacho por módulo e a chamada como a pessoa |
| `supabase/functions/_shared/treino-acessos-regras.ts` (novo) | a forma da `treino-acessos`, o CORS da `treino-leitura`, nível ↔ `series_travadas`, a resposta do principal, os `p_*` das 2 RPCs, o status |
| `supabase/functions/treino-acessos/index.ts` (novo) | a função do Treino (`verify_jwt` false): os 6 passos, UMA gravação, `criarLog` + `log.excecao` |
| `src/acessos/{tipos,api}.ts` (novos) | o contrato e a porta da tela da aba Acessos (P4) |
| `src/aluno-dia/{tipos,api,regras}.ts` (novos) | o contrato, a porta da tela e as regras puras (datas de SP, rotinas de um dia, o dia aplicado sobre o plano) |
| `src/acessos/{acessosRegras,treinoAcessosRegras,api}.test.ts`, `src/aluno-dia/{alunoDiaRegras,regras,api,semBancoDireto}.test.ts` (novos) | os testes (contrato com as migrations, forma, status, clientes, guarda) |
| `src/lib/logsDasFuncoesPrincipal.test.ts`, `src/lib/logsDasFuncoesTreino.test.ts` | as 3 funções nas listas + a guarda de fonte (ponto de encontro: só acréscimo) |
| `e2e/hml17/_base.py`, `e2e/w26/prod.py`, `e2e/hml19/guarda_teste.py` | a Guarda dos E2E: as 3 gravam, o `ler` lê (ponto de encontro) |
| `e2e/wa/sql_wa.py` | o D5 sem depender do RLS do aluno (Task 1) |
| `e2e/wa/supabase_falso.py` (novo) | o falso do Supabase da prova local |
| `e2e/wa/api.py` (novo) | o E2E de servidor: `--seco`, `--local`, staging (padrão), `--so-leitura` (produção), `--limpar` |
| `docs/e2e-rodadas.md` | as linhas no topo: as de produção da P1 + as da P2 (ponto de encontro) |
| `docs/superpowers/plans/2026-10-12-w-a-p2-funcoes.md` | este plano |
| fora do repo — `~/projetos/physiqcalc-scratch/w-a/p2/` | os scripts de apoio (`log.sh`, `vitest.sh`, `deno_check.sh`, `saude.py`, `local.sh`, `publicar.sh`, `volta_funcoes.sh`, `diag_d5_local.py`, `rodadas_p2.py`, `prova_local.sh`), os logs do Deno local, `rodadas-locais.tsv`, `progresso.log`, as marcas `T<N>-FEITA`, `pr-p2.md` |

**A P2 NÃO toca:** nenhuma migration, nenhuma tela, a `porta-pessoa.ts` (só importa), a `nutricao`/`financeiro` e os `_shared` delas (só importa
`ehUuid` e `erroDoBanco` de `nutricao-regras.ts`), a `treino-leitura`, `src/integrations/{repeticao.ts,semBancoNoNavegador.test.ts}`,
`docs/{banco-permissoes,desvios}.md`, o `e2e/wa/_base.py` (usa como está) e os arquivos da hml-20d/21a (mestre §0).

## Estimativa (minutos de trabalho com testes e checagens; sem esperas de terceiros)

```
+------+----------------------------------------------------------------+--------+------------------------+
| Task | O quê                                                          | Melhor | Calibrado              |
+------+----------------------------------------------------------------+--------+------------------------+
|  0   | Preparar: git, quadro, catálogo e massa (só leitura), p2/      |   15   |   7–8   (×0,47–0,55)   |
|  1   | O D5 da P1: a hipótese, o teste local e o caso certo           |   25   |  14–16  (×0,55–0,65)   |
|  2   | _shared/acessos-regras.ts (TDD)                                |   25   |  12–14  (×0,47–0,55)   |
|  3   | _shared/aluno-dia-regras.ts (TDD)                              |   50   |  24–28                 |
|  4   | _shared/treino-acessos-regras.ts — Treino (TDD)                |   25   |  12–14                 |
|  5   | As listas das funções + a guarda de fonte (o vermelho)         |   20   |   9–11                 |
|  6   | A função acessos                                               |   15   |   7–8                  |
|  7   | A função aluno-dia                                             |   25   |  12–14                 |
|  8   | A função treino-acessos                                        |   35   |  16–19                 |
|  9   | A guarda semBancoDireto (o vermelho)                           |   10   |   5–6                  |
| 10   | Os clientes da aba Acessos (src/acessos)                       |   30   |  14–17                 |
| 11   | Os clientes das rotinas e da dieta livre (src/aluno-dia)       |   50   |  24–28                 |
| 12   | A Guarda dos E2E + guarda_teste.py (TDD)                       |   20   |   9–11                 |
| 13   | O falso do Supabase + o api.py inteiro; --seco e --local       |   90   |  42–50                 |
| 14   | api.py: o mapa §5.5/papéis → caso, o --limpar vazio, o commit  |   20   |   9–11                 |
| 15   | A prova local completa (os checadores do CI + as provas)       |   15   |   7–8                  |
| 16   | Rebase na main com a hml-21a + a prova de novo (porta + jose)  |   20   |  11–13  (×0,55–0,65)   |
| 17   | STAGING (🔒 BANCO, depois do "livre" da LINUX 1): publicar+api  |   50   |  28–33                 |
| 18   | PRODUÇÃO: o smoke SÓ LEITURA logo depois de publicar           |   15   |   8–10                 |
| 19   | As rodadas + PR + CI                                           |   20   |  11–13                 |
| 20   | Merge → release → bump → staging = main (fast-forward)         |   25   |  14–16                 |
| 21   | Fechar                                                         |   10   |   6–7                  |
+------+----------------------------------------------------------------+--------+------------------------+
| TOTAL| código 470 (Tasks 0–15) + esteira 140 (Tasks 16–21)            |  610   | 301–355 (5h01 a 5h55)  |
+------+----------------------------------------------------------------+--------+------------------------+
```

**A calibração:** a W1/W2 (código escrito no plano, não provado) levaram ×0,65–0,68 do melhor caso; a P1 levou ×0,47 (3h03 de relógio × 390 de
melhor caso) porque o código do plano JÁ tinha rodado num Postgres descartável. Aqui o código do plano **JÁ RODOU num ensaio fora do repo**
(13/10 00:15–00:45 — ver "Conferido") → **×0,47–0,55 no código** (Tasks 0 e 2–15: o executor copia o que está aqui e roda os mesmos comandos) e
**×0,55–0,65** no que não rodou: a Task 1 (o diagnóstico do D5 contra o banco) e a esteira (Tasks 16–21: o rebase, a borda, o banco, o CI e as
esperas). A spec previa 505 (395 + 110): o código subiu 75 (a prova LOCAL contra o falso, 60, e o D5, 25, que a spec não tinha; −10 nas regras
puras) e a esteira, 30 (o rebase com a 21a e a prova de novo da porta com o `jose`, e o smoke de produção logo depois de publicar).
**Previsão: 5h01 a 5h55 de trabalho (pior cenário 10h10 — o melhor caso sem calibrar) → começando ~00:50: 05h50 a 06h45 (pior cenário 11h00).**

**Horários (13/10; aviso da LINUX 1 de ~23:40):** a hml-21a entra na `main` ANTES da P2 — o 🔒 BANCO do staging fica com ela até **~02:30** e
o git **~01:45 → 03:15**. Este plano fechou ~00:45 → começo ~00:50 → Tasks 0–15 (código local, sem BANCO e sem git) até **~04:35 a ~05:15** →
Task 16 (o rebase na `main` nova, com a 21a, + a prova de novo: `deno check`/`deno info`, `--local` das 2 do principal com o `jose` no bundle,
Vitest) → **🔒 BANCO do staging depois do "livre" da LINUX 1**, com o "pode ir": publicar **~04:45 a ~05:25** (Task 17) → Task 18 logo em seguida
→ PR, merge, release, `staging` = `main` → fechar **~05:50 a ~06:45**. **O mais cedo para publicar: ~03:15 de 13/10** (o fim do git da LINUX 1,
com o rebase feito — antes estava 04:00); pela estimativa, o código fica pronto depois disso (a coordenação não é o gargalo). Pior cenário (sem
calibrar): o código local pronto ~08:40 → publicar ~09:00 → fechar ~11:00.
Atrasou → avisar antes (regra "atrasou → avisa antes"). A LINUX 1 atrasou o git dela além do código da P2 pronto → esperar (a decisão 14: publicar
só com o rebase feito); passou de ~1 h de espera → perguntar à LINUX 1 e, se ela concordar, publicar sem a 21a e republicar as 2 do principal
depois do rebase (Task 16, Step 6).

## Comandos (valem em todas as tasks)

- **Todo comando começa com `cd ~/projetos/physiqcalc-wa-p2 &&`** (W) ou `cd ~/projetos/physiqcalc-scratch/w-a/p2 &&` (S) — o cwd do subagente
  volta ao inicial a cada chamada. Variável não sobrevive entre chamadas: repetir na mesma linha.
- **Contra o diálogo de permissão (travou um agente 1h30 na P1):** nada de `bash -c '…'`, `sh -c`, subshell `( … )` com `time`, `eval` nem `$(…)`
  na linha de comando; passo complexo = script em arquivo em `~/projetos/physiqcalc-scratch/w-a/p2/` (o conteúdo está no plano); `rm` só com caminho
  literal ou `"${VAR:?}/…"`. Python de mais de 1 linha = arquivo (nada de heredoc na linha de comando).
- **Pesado na fila, com 2 workers e o `TMPDIR` do scratch:** Vitest = `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh <arquivos…>`;
  `deno check` = `bash ~/projetos/physiqcalc-scratch/w-a/p2/deno_check.sh <slugs…>`; o resto = `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P <cmd>`.
- **Python sem bytecode no repo:** `PYTHONDONTWRITEBYTECODE=1` (o `__pycache__` NÃO está no `.gitignore`); sintaxe por
  `python3 -c "import ast; ast.parse(open('<arq>').read()); print('sintaxe ok')"`.
- **Rodada local (o `--seco`, o `--local`, o diagnóstico do D5) NÃO vai para o registro oficial:** `PHYSIQ_E2E_REGISTRO=~/projetos/physiqcalc-scratch/w-a/p2/rodadas-locais.tsv`
  (os scripts `local.sh` e `prova_local.sh` já põem). Só staging e produção vão para o `~/projetos/physiqcalc-scratch/e2e-rodadas.tsv` (o padrão).
- **Commit (o comando INTEIRO, só os arquivos da task):**
  `git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`
  (arquivo novo: `git add <arquivos>` antes, na mesma linha).
- **Aviso de progresso (regra global):** `HHhMM a HHhMM (pior cenário HHhMM)` + as fases (✅ · 🚧 · ⏳), uma por linha, terminal + tópico; a cada ~30
  min num agente longo. Cada task fechada → `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T<N> | ✅ …"` e
  `~/projetos/physiqcalc-scratch/w-a/p2/T<N>-FEITA` (o que rodou, placares, desvios).
- **Coordenação (mestre §0, quadro):** trava 🔒 no quadro + `SendMessage` à LINUX 1 (a sessão da linha dela no quadro — hoje `bertoldo-f8`) + esperar
  o "pode ir" antes de: publicar função, rodar o `api.py` no staging (cria massa), push no `staging`, merge na `main`. Soltou → "livre" + aviso.
  Quem executa as tasks e não é o coordenador anota no `progresso.log` o que é do quadro, e o coordenador escreve.

---

### Task 0: Preparar (git, quadro, catálogo e massa SÓ LEITURA, a pasta da P2, os pedidos à LINUX 1)

**Files:** nenhum do repo; o quadro (só a linha da W-A); `~/projetos/physiqcalc-scratch/w-a/p2/` (nova).
**Estimativa:** 15 min (calibrado 8–10).

- [ ] **Step 1: O estado do git e da outra sessão (comando ISOLADO)**

Run: `git -C ~/projetos/physiqcalc-wa-p2 fetch origin && git -C ~/projetos/physiqcalc-wa-p2 log origin/main --oneline -4 && git -C ~/projetos/physiqcalc-wa-p2 log origin/staging --oneline -2 && git -C ~/projetos/physiqcalc-wa-p2 status --short && git -C ~/projetos/physiqcalc-wa-p2 log --oneline -3 && git -C ~/projetos/physiqcalc-wa-p2 worktree list && gh pr list --repo weslleybertoldo/physiqcalc --state open && sed -n 1,12p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md`
Expected: a worktree limpa na `feat/w-a-p2-funcoes` (o commit deste plano em cima de `110b228`); `origin/main` = `110b228` ou já com o squash da
hml-21a + o bump (aí a Task 16 rebaseia); nenhum PR aberto mexendo em `supabase-principal/functions/{acessos,aluno-dia}`,
`supabase/functions/treino-acessos`, `src/{acessos,aluno-dia}` ou `e2e/wa/` (o PR da 21a pode estar aberto: ele toca os pontos de encontro).

- [ ] **Step 2: A linha da W-A no quadro** — já diz "🚧 P2 (funções) desde 22:45" com os arquivos RESERVADOS. Conferir que estão lá também (senão,
  acrescentar SÓ na linha da W-A): `e2e/wa/supabase_falso.py` (novo), `e2e/wa/sql_wa.py` (só o caso D5 — Task 1), `src/lib/logsDasFuncoesTreino.test.ts`
  (por acréscimo) e `docs/superpowers/plans/2026-10-12-w-a-p2-funcoes.md`; e a janela: "🔒 BANCO do staging depois do 'livre' da LINUX 1 e do rebase na `main` com a
  hml-21a (o mais cedo ~03:15; previsto ~05:05 → ~05:55: publicar as 3 + `api.py`), depois o git (PR → squash → release → `staging` = `main` por
  fast-forward)".

- [ ] **Step 3: A pasta da P2 e os scripts de apoio**

```bash
mkdir -p ~/projetos/physiqcalc-scratch/w-a/p2 ~/projetos/physiqcalc-scratch/tmp && ls ~/projetos/physiqcalc-scratch/w-a/p2
```
Gravar em `~/projetos/physiqcalc-scratch/w-a/p2/` (com o Write; os 4 de baixo agora, os outros nas tasks deles):

`log.sh`:
```bash
#!/usr/bin/env bash
# W-A P2 — acrescenta "HH:MM | <texto>" no progresso.log da P2 (sem $(…) na linha de comando de quem chama).
# uso: bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T3 | ✅ verde"
set -euo pipefail
printf '%s | %s\n' "$(date +%H:%M)" "${1:?texto}" >> /home/bertoldo/projetos/physiqcalc-scratch/w-a/p2/progresso.log
tail -1 /home/bertoldo/projetos/physiqcalc-scratch/w-a/p2/progresso.log
```

`vitest.sh`:
```bash
#!/usr/bin/env bash
# W-A P2 — o Vitest na fila do pesado, com 2 workers e o TMPDIR do scratch. uso: bash vitest.sh <arquivos de teste…>   (sem arquivo: tudo)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
cd "$HOME/projetos/physiqcalc-wa-p2" || exit 9
if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
flock "$P" npx vitest run --maxWorkers=2 "$@"
```

`deno_check.sh`:
```bash
#!/usr/bin/env bash
# W-A P2 — deno check das funções pedidas (principal ou Treino, pela pasta), na fila do pesado. uso: bash deno_check.sh acessos aluno-dia treino-acessos
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" DENO_NO_PACKAGE_JSON=1
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
cd "$HOME/projetos/physiqcalc-wa-p2" || exit 9
rc=0
for f in "$@"; do
  alvo="supabase/functions/$f/index.ts"
  if [ -f "supabase-principal/functions/$f/index.ts" ]; then alvo="supabase-principal/functions/$f/index.ts"; fi
  echo "── deno check $alvo"
  flock "$P" "$HOME/.deno/bin/deno" check "$alvo" || rc=1
done
exit $rc
```

`saude.py`:
```python
#!/usr/bin/env python3
"""W-A P2 — SÓ LEITURA: o /health dos 2 projetos (db, auth, rest) + ninguém segurando o banco (pg_stat_activity). Saída 0 = tudo bem.
Uso: python3 saude.py "<rótulo>"."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path.home() / "projetos" / "physiqcalc-wa-p2" / "e2e" / "wa"))
import _base as B  # noqa: E402

B.exigir_saude(sys.argv[1] if len(sys.argv) > 1 else "a P2")
r = B.ler("""select count(*) filter (where state = 'active' and now() - query_start > interval '30 seconds') as longas,
                    count(*) filter (where wait_event_type = 'Lock') as esperando from pg_stat_activity where datname = current_database()""")
print(r)
raise SystemExit(0 if r and r[0]["longas"] == 0 and r[0]["esperando"] == 0 else 1)
```

- [ ] **Step 4: O catálogo e a massa (SÓ LEITURA)** — gravar `~/projetos/physiqcalc-scratch/w-a/p2/massa_p2.py`:

```python
#!/usr/bin/env python3
"""W-A P2 (Task 0) — SÓ LEITURA (transação read only / read_only da Management API): o que o e2e/wa/api.py do staging precisa. Só booleanos,
contagens e códigos (nada pessoal). Uso: python3 massa_p2.py"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path.home() / "projetos" / "physiqcalc-wa-p2" / "e2e" / "wa"))
import _base as B  # noqa: E402

E, S = B.CONTAS, "staging"
u = lambda k: f"(select id from auth.users where lower(email) = '{E[k]}')"  # noqa: E731
r = B.ler(f"""
with a as (select p.id, p.conta_id, p.treino_user_id, p.personal_id, p.nutricionista_id
             from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
            where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' order by p.created_at limit 1),
     pl as (select x.id from {S}.planos_alimentares x, a where x.paciente_id = a.id and x.deleted_at is null
             order by x.favorito desc, x.created_at desc, x.id limit 1)
select (select count(*) from {S}.pacientes p where p.user_id = {u('w5p-aluna')} and p.deleted_at is null) as matriculas_vivas_aluna,
       (select treino_user_id is null from a) as a_sem_treino_user_id,
       (select personal_id = {u('w5p-personal')} and nutricionista_id = {u('w5p-nutri')} from a) as a_responsaveis_ok,
       (select {S}.modulos_do_plano(c.plano) from {S}.contas c, a where c.id = a.conta_id) as conta_a_modulos,
       (select m.papeis from {S}.conta_membros m, a where m.conta_id = a.conta_id and m.user_id = {u('w5p-personal')}) as papeis_personal,
       (select {S}.modulos_do_plano(c.plano) from {S}.contas c where c.dono_id = {u('w13-dono')} and c.origem <> 'app' order by c.criado_em limit 1) as conta_b_modulos,
       (select count(*) from {S}.pacientes p join {S}.contas c on c.id = p.conta_id where p.user_id = {u('w7b-sozinho')} and c.origem = 'app' and p.deleted_at is null) as sozinho_no_app,
       (select count(*) from {S}.refeicoes r, pl where r.plano_id = pl.id and (cardinality(r.dias_semana) = 0 or extract(isodow from (now() at time zone 'America/Sao_Paulo')::date)::smallint = any(r.dias_semana))
           and exists (select 1 from {S}.itens_refeicao i where i.refeicao_id = r.id and i.alimento_id is not null)) as refeicoes_com_item_hoje,
       (select count(*) from {S}.alimentos al where al.fonte = 'taco' and al.deleted_at is null and al.energia_kcal > 0) as taco,
       (select count(*) from {S}.refeicoes r join {S}.planos_alimentares p2 on p2.id = r.plano_id, a where p2.deleted_at is null and p2.paciente_id <> a.id) as refeicoes_de_outros,
       (select count(*) from {S}.aluno_acessos x, a where x.paciente_id = a.id) as aluno_acessos_a,
       (select count(*) from {S}.rotinas r where r.dono_user_id in ({u('w5p-aluna')}, {u('w7b-sozinho')})) as rotinas,
       (select count(*) from {S}.pacientes p where p.config ? 'wa_e2e') as massa_wa""")[0]
print("principal/staging:", r)
pa = B.ler(f"select (select id::text from auth.users where lower(email) = '{E['w5p-aluna']}') as uid")[0]["uid"]
ca = B.ler(f"""select p.conta_id::text as c from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
              where p.user_id = '{pa}' and p.deleted_at is null and c.origem <> 'app' order by p.created_at limit 1""")[0]["c"]
t = B.C.ler(B.TREINO_REF, f"""
select (select count(*) from {S}.physiq_identidades i where i.principal_user_id = '{pa}') as vinculo_aluna,
       (select pf.conta_id::text = '{ca}' from {S}.physiq_profiles pf where pf.id = (select i.treino_user_id from {S}.physiq_identidades i where i.principal_user_id = '{pa}')) as perfil_da_conta_a,
       (select pf.series_travadas from {S}.physiq_profiles pf where pf.id = (select i.treino_user_id from {S}.physiq_identidades i where i.principal_user_id = '{pa}')) as series_travadas""")[0]
print("treino/staging:", t)
ok = (r["matriculas_vivas_aluna"] == 1 and r["a_sem_treino_user_id"] and r["a_responsaveis_ok"] and "treino" in (r["conta_a_modulos"] or [])
      and "nutricao" in (r["conta_a_modulos"] or []) and r["papeis_personal"] == ["dono", "personal"] and "treino" in (r["conta_b_modulos"] or [])
      and r["sozinho_no_app"] == 1 and r["refeicoes_com_item_hoje"] >= 1 and r["taco"] >= 2 and r["refeicoes_de_outros"] >= 1
      and r["massa_wa"] == 0 and t["vinculo_aluna"] == 1 and t["perfil_da_conta_a"] is True and isinstance(t["series_travadas"], bool))
print("massa de TESTE pronta para o api.py:", ok)
raise SystemExit(0 if ok else 1)
```

Run: `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P python3 e2e/wa/sql_wa.py --so-catalogo --schema staging | tail -1 && flock $P python3 e2e/wa/sql_wa.py --so-catalogo --schema public | tail -1 && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p2/massa_p2.py`
Expected: `8/8 ok` 2× (a P1 nos 2 schemas) e `massa de TESTE pronta para o api.py: True` — o retrato de 12/10 23:20: `matriculas_vivas_aluna 1`,
`a_sem_treino_user_id True`, `conta_a_modulos ['treino','nutricao']`, `papeis_personal ['dono','personal']`, `refeicoes_com_item_hoje 5`,
`taco 591`, `refeicoes_de_outros 33`, `aluno_acessos_a 0`, `rotinas 0`, `massa_wa 0`; Treino: `vinculo_aluna 1`, `perfil_da_conta_a True`,
`series_travadas True`. `aluno_acessos_a`/`rotinas` > 0 = sobra de outra rodada → `python3 e2e/wa/api.py --limpar` (depois da Task 14) ou anotar e
seguir (o `api.py` tira a foto antes e devolve a ela). Algo de massa faltando → parar e avisar (não inventar conta).

- [ ] **Step 5: Os pedidos à LINUX 1 (1 `SendMessage`, à sessão da linha dela no quadro — hoje `bertoldo-f8`)**:
  "W-A P2 (funções) começou (worktree `~/projetos/physiqcalc-wa-p2`). 1) Pedido na sua guarda nova `src/integrations/semBancoNoNavegador.test.ts`
  (hml-21a): pôr `"src/acessos/api.ts"` no `SESSAO_ANTES_DA_FUNCAO` — é o `principal.auth.getSession()` que só lê a sessão para levar o token do
  PRINCIPAL à `treino-acessos` (o mesmo do `src/treino/editor/api.ts` e da `treino-leitura`; a lista não confere se o arquivo existe, dá para pôr
  já). Se preferir que eu ponha a linha no meu PR, me dê o 'pode ir'. 2) Pontos de encontro, só acréscimo (quem entra depois rebaseia): a Guarda
  (`e2e/hml17/_base.py`: `acessos`, `aluno-dia`, `treino-acessos` em `FUNCOES_QUE_SEMPRE_GRAVAM` e em `LEITURAS_PELO_CORPO` com `acao: ler`;
  `e2e/w26/prod.py`: as 3 nos 2 regex), `e2e/hml19/guarda_teste.py`, `src/lib/logsDasFuncoes{Principal,Treino}.test.ts` e o topo do
  `docs/e2e-rodadas.md`; a `porta-pessoa.ts` eu só importo. 3) Janela: só código local até o seu 'livre' (BANCO ~02:30, git ~03:15); rebaseio na `main` com a sua 21a e depois peço o 🔒 BANCO do staging (~50 min:
  publicar as 3 funções novas + o E2E de servidor com massa 'WA E2E') e o git (PR → squash → release → `staging` = `main` por fast-forward). 4)
  Opcional, sem pressa: se quiser, a `ler` das 3 da W-A pode entrar no `ACOES_DE_LEITURA` do `repeticao.ts` (seu arquivo) para repetir 1 vez como a
  `ler` da `nutricao`." → anotar a resposta no `progresso.log`.

- [ ] **Step 6: Previsão + marca** — o aviso de progresso (terminal + tópico) com `HHhMM a HHhMM (pior cenário HHhMM)` e as fases;
  `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T0 | ✅ catálogo 8/8 ×2, massa pronta, pedidos à LINUX 1"`; `T0-FEITA` com os placares dos
  Steps 1 e 4 e a resposta da LINUX 1.

---

### Task 1: O D5 intermitente da P1 — a hipótese, o teste local e o caso certo

**Files:** Modify `e2e/wa/sql_wa.py` (só a expressão `matricula` do caso D5); fora do repo: `~/projetos/physiqcalc-scratch/w-a/p2/{diag_d5_catalogo,diag_d5_local}.py`.
**Estimativa:** 25 min (calibrado 14–16).

> **A hipótese:** o `matricula` do D5 (`e2e/wa/sql_wa.py:384-385`) é avaliado COMO A ALUNA e lê `planos_alimentares` pelo RLS — a policy dela é
> `paciente_id = meu_paciente_id()` (`20260920070000_paciente_acesso.sql:210-212`) e o `meu_paciente_id()` é `… limit 1` SEM `order by` (`:46-47`).
> Todo bloco do `sql_wa.py` cria a 2ª matrícula viva da aluna (`:114`). Quando a linha da B vem antes da A na leitura (ordem física: espaço livre
> numa página anterior, uma versão nova da A depois da B, o plano trocando de índice), o `meu_paciente_id()` devolve a B, o plano da A some para a
> aluna e a comparação vira `null` — o resto do D5 (que só usa as RPCs definer) segue certo. Bate com o que se viu: 1 vez em 53 casos × 4 rodadas,
> no staging (tabela grande, com linhas mortas), nunca no local (tabela pequena, sem buraco). **A RPC não tem defeito; o teste tem.**

- [ ] **Step 1: A prova estática (SÓ LEITURA, staging e public)** — `~/projetos/physiqcalc-scratch/w-a/p2/diag_d5_catalogo.py`:

```python
#!/usr/bin/env python3
"""W-A P2 (Task 1) — SÓ LEITURA: o meu_paciente_id() de cada schema sem 'order by' (limit 1), a policy do aluno em planos_alimentares por ele, e o
tamanho/linhas mortas de pacientes (a ordem física varia). Uso: python3 diag_d5_catalogo.py"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path.home() / "projetos" / "physiqcalc-wa-p2" / "e2e" / "wa"))
import _base as B  # noqa: E402

for s in ("staging", "public"):
    r = B.ler(f"""select position('limit 1' in lower(pg_get_functiondef('{s}.meu_paciente_id()'::regprocedure))) > 0 as limit_1,
                         position('order by' in lower(pg_get_functiondef('{s}.meu_paciente_id()'::regprocedure))) = 0 as sem_order_by,
                         exists (select 1 from pg_policy p where p.polrelid = '{s}.planos_alimentares'::regclass
                                  and pg_get_expr(p.polqual, p.polrelid) like '%meu_paciente_id()%') as policy_do_aluno_usa,
                         (select relpages from pg_class where oid = '{s}.pacientes'::regclass) as paginas,
                         (select n_dead_tup from pg_stat_user_tables where relid = '{s}.pacientes'::regclass) as linhas_mortas""")
    print(s, r)
```
Run: `cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p2/diag_d5_catalogo.py`
Expected: nos 2 schemas `limit_1 True`, `sem_order_by True`, `policy_do_aluno_usa True` (e as páginas/linhas mortas do staging, só para o registro).

- [ ] **Step 2: O vermelho LOCAL (a ordem forçada)** — `~/projetos/physiqcalc-scratch/w-a/p2/diag_d5_local.py`:

```python
#!/usr/bin/env python3
"""W-A P2 (Task 1) — o D5 da P1 no principal LOCAL descartável (o local_wa.py da P1): a 2ª matrícula da aluna (o preâmbulo de todo bloco) e
versões NOVAS da linha da A (HOT update) até a B vir primeiro na leitura do meu_paciente_id() (o seq scan forçado, como numa tabela pequena).
Mostra quantas atualizações precisou, o "matricula" de ANTES (o plano lido como a aluna, pelo RLS) e o de DEPOIS (o paciente_id do plano_ativo do
meu_dia, definer — sem RLS). Um bloco DESFEITO (RESULTADO<<…>>): nada fica.
Uso (no p1/): python3 local_wa.py --ate wa3 --repo ~/projetos/physiqcalc-wa-p2 -- python3 ~/projetos/physiqcalc-scratch/w-a/p2/diag_d5_local.py"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path.home() / "projetos" / "physiqcalc-wa-p2" / "e2e" / "wa"))
import _base as B  # noqa: E402
import sql_wa as W  # noqa: E402

S = W.S
ANTES = (f"(v_j -> 'extra' ->> 'paciente_id')::uuid = (select pl.paciente_id from {S}.planos_alimentares pl where pl.id = "
         f"(select (({S}.meu_dia(v_hoje) -> 'plano_ativo') ->> 'plano_id')::uuid))")
DEPOIS = f"(v_j -> 'extra' ->> 'paciente_id') = ({S}.meu_dia(v_hoje) -> 'plano_ativo' ->> 'paciente_id')"
corpo = ("  perform set_config('enable_indexscan', 'off', true);\n  perform set_config('enable_bitmapscan', 'off', true);\n"
         + W.liberar() + W.como("v_aluna")
         + f"  v_j := {S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', 'diag', 'horario', '16:00'));\n"
         + "  v_n := 0;\n  loop\n"
         + W.como("v_aluna")
         + f"    exit when {S}.meu_paciente_id() = v_pac_b or v_n >= 20;\n"
         + "    perform set_config('role', 'postgres', true);\n"
         + f"    update {S}.pacientes set config = config where id = v_pac_a;\n"
         + "    v_n := v_n + 1;\n  end loop;\n"
         + W.res(atualizacoes="v_n", b_primeiro=f"{S}.meu_paciente_id() = v_pac_b", antes=ANTES, depois=DEPOIS)
         + W.VOLTA)
print(json.dumps(B.resultado(W.bloco_sql(corpo)), ensure_ascii=False))
```
Run: `cd ~/projetos/physiqcalc-scratch/w-a/p1 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P python3 local_wa.py --ate wa3 --repo /home/bertoldo/projetos/physiqcalc-wa-p2 -- python3 /home/bertoldo/projetos/physiqcalc-scratch/w-a/p2/diag_d5_local.py`
Expected: `{"atualizacoes": 1, "b_primeiro": true, "antes": null, "depois": true}` (1 a 3 atualizações). `b_primeiro: false` com 20 → "não
reproduzido no local" (anotar): a correção do Step 3 vale do mesmo jeito (ela não depende do RLS da aluna) e a prova estática do Step 1 fica como
a razão.

- [ ] **Step 3: O caso certo** — em `e2e/wa/sql_wa.py`, no `k["D5"]`, trocar a expressão `matricula=` (as 2 linhas `:384-385`) por:

```python
                     # P2 (Task 1): comparado com o paciente_id do plano_ativo do meu_dia (definer) — NÃO com o plano lido como a aluna: o RLS
                     # dela é o meu_paciente_id() (limit 1 sem order by) e o preâmbulo cria a 2ª matrícula viva dela (deu null 1× no staging)
                     matricula=f"(v_j -> 'extra' ->> 'paciente_id') = ({S}.meu_dia(v_hoje) -> 'plano_ativo' ->> 'paciente_id')",
```
(o esperado continua `"matricula": True`; nada mais muda no arquivo).

- [ ] **Step 4: O verde LOCAL**

Run: `cd ~/projetos/physiqcalc-scratch/w-a/p1 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P python3 local_wa.py --ate wa3 --repo /home/bertoldo/projetos/physiqcalc-wa-p2 -- python3 e2e/wa/sql_wa.py | tail -1 && cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 PHYSIQ_E2E_REGISTRO=/home/bertoldo/projetos/physiqcalc-scratch/w-a/p2/rodadas-locais.tsv python3 e2e/wa/sql_wa.py --seco | tail -1 && git status --short`
Expected: `53/53 ok` (45 casos + K1–K8 no local) e `45/45 ok` (`--seco`); o `git status` só com `M e2e/wa/sql_wa.py`. (O D5 corrigido roda 3× no
staging na Task 17, com a trava.)

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w-a): o D5 compara a matrícula da extra com o plano ativo do meu_dia (sem o RLS do aluno — meu_paciente_id sem order by com 2 matrículas)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/wa/sql_wa.py
```

- [ ] **Step 6: Anotar** — `T1-FEITA` com as saídas dos Steps 1, 2 e 4 e a frase para o resumo final (defeito 6, INFO): "o `meu_paciente_id()` sem
  `order by` faz um aluno de 2 matrículas vivas ver pelo RLS as linhas de UMA delas, ao acaso — fora da W-A (as RPCs da W-A são definer); para a
  homologação decidir".

---

### Task 2: `_shared/acessos-regras.ts` — a forma da `acessos` (TDD)

**Files:** Create `supabase-principal/functions/_shared/acessos-regras.ts`, `src/acessos/acessosRegras.test.ts`.
**Estimativa:** 25 min (calibrado 14–16).

- [ ] **Step 1: O teste (o contrato com a migration da P1)** — `src/acessos/acessosRegras.test.ts`:

```ts
// Physiq W-A P2 — as regras PURAS da função acessos (supabase-principal/functions/_shared/acessos-regras.ts): as mesmas que rodam na borda.
// Positivo: ler e salvar montam a RPC certa com os parâmetros DA MIGRATION (lidos do 20261012200000_wa1_acessos.sql, nome por nome); a volta
// só com a whitelist. Negativo: ação fora da lista, aluno que não é uuid, treino_series (vai pela treino-acessos, no Treino), nível que não é
// da chave, campos a mais no corpo (caem), código desconhecido da RPC (vira erro_interno, inesperado) e o status de cada código.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES_DE_ACESSOS, CAMPOS_DA_VOLTA, CHAVES_DE_ACESSO, NIVEIS_DA_CHAVE, RPC_DE_ACESSOS, STATUS_DO_ERRO_ACESSOS, chamadaDeAcessos,
  lerPedidoDeAcessos, statusDoErroAcessos, voltaDosAcessos,
} from "../../supabase-principal/functions/_shared/acessos-regras";

const ALUNO = "11111111-1111-4111-8111-111111111111";
const MIGRATION = readFileSync(resolve(__dirname, "../../supabase-principal/migrations/20261012200000_wa1_acessos.sql"), "utf-8");

/** Os parâmetros de uma função da migration, na ordem (o PostgREST chama a RPC pelo NOME de cada um). */
function parametros(sql: string, funcao: string): string[] {
  const m = new RegExp(`create or replace function \\{schema\\}\\.${funcao}\\(([^)]*)\\)`).exec(sql);
  if (!m) throw new Error(`a migration não tem ${funcao}`);
  return m[1].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
}

describe("W-A P2: as regras da função acessos", () => {
  it("as listas: as 2 ações, as 4 chaves e os níveis de cada uma — as mesmas da acessos_salvar (o banco)", () => {
    expect([...ACOES_DE_ACESSOS]).toEqual(["ler", "salvar"]);
    expect([...CHAVES_DE_ACESSO]).toEqual(["acesso_app", "diario_alimentar", "acesso_link", "dieta"]);
    expect(MIGRATION).toContain("p_chave not in ('acesso_app', 'diario_alimentar', 'acesso_link', 'dieta')");
    expect(MIGRATION).toContain("(p_chave = 'dieta' and p_valor not in ('ver', 'mexer'))");
    expect(MIGRATION).toContain("(p_chave <> 'dieta' and p_valor not in ('bloqueado', 'liberado'))");
    expect(NIVEIS_DA_CHAVE).toEqual({
      acesso_app: ["bloqueado", "liberado"], diario_alimentar: ["bloqueado", "liberado"], acesso_link: ["bloqueado", "liberado"], dieta: ["ver", "mexer"],
    });
  });

  it("a RPC de cada ação com os parâmetros da migration (nome por nome)", () => {
    const ler = lerPedidoDeAcessos({ acao: "ler", aluno: ALUNO });
    const salvar = lerPedidoDeAcessos({ acao: "salvar", aluno: ALUNO, chave: "dieta", valor: "mexer" });
    if (!ler.ok || !salvar.ok) throw new Error("um pedido válido foi recusado");
    const c1 = chamadaDeAcessos(ler.pedido);
    const c2 = chamadaDeAcessos(salvar.pedido);
    expect(c1).toEqual({ rpc: RPC_DE_ACESSOS.ler, args: { p_aluno: ALUNO } });
    expect(c2).toEqual({ rpc: RPC_DE_ACESSOS.salvar, args: { p_aluno: ALUNO, p_chave: "dieta", p_valor: "mexer" } });
    expect(Object.keys(c1.args)).toEqual(parametros(MIGRATION, "acessos_ler"));
    expect(Object.keys(c2.args)).toEqual(parametros(MIGRATION, "acessos_salvar"));
  });

  it("o aluno vai em minúsculas; os campos a mais do corpo caem (paciente_id, user_id, por, alterado_por)", () => {
    const r = lerPedidoDeAcessos({ acao: "salvar", aluno: ALUNO.toUpperCase(), chave: "acesso_app", valor: "bloqueado", paciente_id: ALUNO, user_id: ALUNO, por: ALUNO, alterado_por: ALUNO });
    expect(r).toEqual({ ok: true, pedido: { acao: "salvar", aluno: ALUNO, chave: "acesso_app", valor: "bloqueado" } });
    if (r.ok) expect(chamadaDeAcessos(r.pedido).args).toEqual({ p_aluno: ALUNO, p_chave: "acesso_app", p_valor: "bloqueado" });
  });

  it.each([
    [{}, "acao_invalida", undefined],
    [{ acao: "LER", aluno: ALUNO }, "acao_invalida", undefined],
    [{ acao: "apagar", aluno: ALUNO }, "acao_invalida", undefined],
    [{ acao: ["ler"], aluno: ALUNO }, "acao_invalida", undefined],
    [{ action: "ler", aluno: ALUNO }, "acao_invalida", undefined],
    [{ acao: "ler" }, "dados_invalidos", "aluno"],
    [{ acao: "ler", aluno: "x" }, "dados_invalidos", "aluno"],
    [{ acao: "ler", aluno: 1 }, "dados_invalidos", "aluno"],
    [{ acao: "salvar", aluno: ALUNO, chave: "treino_series", valor: "ver" }, "dados_invalidos", "chave"],
    [{ acao: "salvar", aluno: ALUNO, valor: "ver" }, "dados_invalidos", "chave"],
    [{ acao: "salvar", aluno: ALUNO, chave: "dieta", valor: "liberado" }, "dados_invalidos", "valor"],
    [{ acao: "salvar", aluno: ALUNO, chave: "acesso_app", valor: "mexer" }, "dados_invalidos", "valor"],
    [{ acao: "salvar", aluno: ALUNO, chave: "acesso_link" }, "dados_invalidos", "valor"],
    [{ acao: "salvar", aluno: ALUNO, chave: "acesso_link", valor: true }, "dados_invalidos", "valor"],
  ])("recusa %j → %s (%s)", (corpo, erro, campo) => {
    expect(lerPedidoDeAcessos(corpo as Record<string, unknown>)).toEqual(campo ? { ok: false, erro, campo } : { ok: false, erro });
  });

  it("a volta: só a whitelist (os ids internos ficam no servidor); a recusa da RPC com o código; código desconhecido → erro_interno (inesperado)", () => {
    const daRpc = {
      ok: true, paciente_id: ALUNO, user_id: "u", conta_id: "c", treino_user_id: "t", tem_login: true, conta_modulos: ["treino", "nutricao"],
      modulos: ["treino"], tem_nutricionista: false, pode_mudar: true, linhas: { dieta: "ver" }, mudancas: {},
    };
    const v = voltaDosAcessos(daRpc);
    expect(Object.keys(v).sort()).toEqual(["ok", ...CAMPOS_DA_VOLTA].sort());
    for (const k of ["user_id", "conta_id", "treino_user_id"]) expect(v).not.toHaveProperty(k);
    expect(voltaDosAcessos({ ok: false, erro: "sem_nutricao" })).toEqual({ ok: false, erro: "sem_nutricao", inesperado: false });
    expect(voltaDosAcessos({ ok: false, erro: "xpto" })).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDosAcessos({ ok: false, erro: "erro_interno" })).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDosAcessos(null)).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDosAcessos([])).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
  });

  it("o status de cada código (os da spec §5.2); o desconhecido = 500", () => {
    expect(STATUS_DO_ERRO_ACESSOS).toMatchObject({
      dados_invalidos: 400, acao_invalida: 400, ajuste_invalido: 400, sem_login: 401, sem_acesso: 403, aluno_inexistente: 404,
      sem_login_do_aluno: 409, sem_nutricao: 409, corpo_grande: 413, muitas_acoes: 429, erro_interno: 500,
    });
    expect(statusDoErroAcessos("xpto")).toBe(500);
    expect(statusDoErroAcessos(undefined)).toBe(500);
  });

  it("todo código que a migration devolve de propósito tem status (lidos do SQL)", () => {
    const daMigration = new Set([...MIGRATION.matchAll(/'erro', '([a-z_]+)'/g)].map((m) => m[1]));
    expect(daMigration.size).toBeGreaterThanOrEqual(5);
    for (const c of daMigration) expect(STATUS_DO_ERRO_ACESSOS[c], c).toBeDefined();
  });
});
```

- [ ] **Step 2: O vermelho**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/acessos/acessosRegras.test.ts 2>&1 | tail -6`
Expected: FAIL — `Failed to resolve import "../../supabase-principal/functions/_shared/acessos-regras"`.

- [ ] **Step 3: As regras** — `supabase-principal/functions/_shared/acessos-regras.ts`:

```ts
// Physiq W-A P2 (jeito 2, 13/10/2026) — regras PURAS da função `acessos` (banco principal): a aba Acessos do Painel › Aluno (P4) lê e grava
// "o que o aluno pode no app". Sem Deno e sem rede: usadas pela função (supabase-principal/functions/acessos/) e testadas no Vitest
// (src/acessos/acessosRegras.test.ts, com o contrato da migration). O desenho (spec W-A §5.2, §5.5, §5.6):
//   · a FORMA antes da RPC: a ação numa lista fechada (ler · salvar), o aluno (uuid da rota: a matrícula ou o id do Treino), a chave numa
//     lista fechada (acesso_app · diario_alimentar · acesso_link · dieta — treino_series NÃO: as séries vão pela treino-acessos, no Treino) e o
//     nível de cada chave (bloqueado | liberado; a dieta ver | mexer); nada mais do corpo passa;
//   · a RPC certa, chamada COMO A PESSOA (acessos_ler · acessos_salvar — migration 20261012200000_wa1_acessos.sql), que decide quem lê e quem
//     muda (w14_matricula_da_rota + w14_pode_editar: qualquer profissional do aluno, nunca o aluno) e devolve { ok, … } ou { ok: false, erro };
//   · a volta: só o que a tela usa (os ids internos — user_id, conta_id, treino_user_id — ficam no servidor);
//   · o status de cada código (a tela escreve a frase: src/acessos/api.ts).
import { ehUuid } from "./nutricao-regras.ts";

export const ACOES_DE_ACESSOS = ["ler", "salvar"] as const;
export type AcaoDeAcessos = (typeof ACOES_DE_ACESSOS)[number];

export const CHAVES_DE_ACESSO = ["acesso_app", "diario_alimentar", "acesso_link", "dieta"] as const;
export type ChaveDeAcesso = (typeof CHAVES_DE_ACESSO)[number];

/** Os níveis de cada chave (os mesmos do check da acessos_salvar). */
export const NIVEIS_DA_CHAVE: Readonly<Record<ChaveDeAcesso, readonly string[]>> = {
  acesso_app: ["bloqueado", "liberado"],
  diario_alimentar: ["bloqueado", "liberado"],
  acesso_link: ["bloqueado", "liberado"],
  dieta: ["ver", "mexer"],
};

export const RPC_DE_ACESSOS: Readonly<Record<AcaoDeAcessos, string>> = { ler: "acessos_ler", salvar: "acessos_salvar" };

/** O que volta à tela: a whitelist (o resto do jsonb da RPC fica no servidor). */
export const CAMPOS_DA_VOLTA = ["paciente_id", "tem_login", "modulos", "conta_modulos", "tem_nutricionista", "pode_mudar", "linhas", "mudancas"] as const;

export type PedidoDeAcessos =
  | { acao: "ler"; aluno: string }
  | { acao: "salvar"; aluno: string; chave: ChaveDeAcesso; valor: string };

export type Recusa = { ok: false; erro: string; campo?: string };

const ehChave = (v: unknown): v is ChaveDeAcesso => typeof v === "string" && (CHAVES_DE_ACESSO as readonly string[]).includes(v);

/** O pedido na forma (só os campos conhecidos) ou a recusa: acao_invalida (fora da lista) · dados_invalidos com o campo. */
export function lerPedidoDeAcessos(corpo: Record<string, unknown>): { ok: true; pedido: PedidoDeAcessos } | Recusa {
  const acao = corpo.acao;
  if (acao !== "ler" && acao !== "salvar") return { ok: false, erro: "acao_invalida" };
  if (!ehUuid(corpo.aluno)) return { ok: false, erro: "dados_invalidos", campo: "aluno" };
  const aluno = corpo.aluno.toLowerCase();
  if (acao === "ler") return { ok: true, pedido: { acao, aluno } };
  if (!ehChave(corpo.chave)) return { ok: false, erro: "dados_invalidos", campo: "chave" };
  const valor = corpo.valor;
  if (typeof valor !== "string" || !NIVEIS_DA_CHAVE[corpo.chave].includes(valor)) return { ok: false, erro: "dados_invalidos", campo: "valor" };
  return { ok: true, pedido: { acao, aluno, chave: corpo.chave, valor } };
}

/** A RPC e os parâmetros (os nomes da migration — o teste confere). */
export function chamadaDeAcessos(p: PedidoDeAcessos): { rpc: string; args: Record<string, unknown> } {
  return p.acao === "ler"
    ? { rpc: RPC_DE_ACESSOS.ler, args: { p_aluno: p.aluno } }
    : { rpc: RPC_DE_ACESSOS.salvar, args: { p_aluno: p.aluno, p_chave: p.chave, p_valor: p.valor } };
}

/** Status HTTP de cada código (o corpo leva { ok: false, erro }). */
export const STATUS_DO_ERRO_ACESSOS: Readonly<Record<string, number>> = {
  dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400, ajuste_invalido: 400,
  sem_login: 401,
  sem_acesso: 403,
  nao_encontrado: 404, aluno_inexistente: 404,
  metodo: 405,
  sem_login_do_aluno: 409, sem_nutricao: 409, conflito: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  tempo_esgotado: 504,
};

export function statusDoErroAcessos(erro: unknown): number {
  return STATUS_DO_ERRO_ACESSOS[String(erro ?? "")] ?? 500;
}

/**
 * O que a RPC devolveu, como resposta: { ok: true, …só a whitelist } · { ok: false, erro } com um código conhecido · o resto (não objeto,
 * código desconhecido, erro_interno da wa_rota) → erro_interno com `inesperado` (a função avisa: log.erro).
 */
export function voltaDosAcessos(data: unknown): { ok: true; [campo: string]: unknown } | { ok: false; erro: string; inesperado: boolean } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, erro: "erro_interno", inesperado: true };
  const d = data as Record<string, unknown>;
  if (d.ok !== true) {
    const erro = typeof d.erro === "string" ? d.erro : "";
    return erro && erro !== "erro_interno" && Object.prototype.hasOwnProperty.call(STATUS_DO_ERRO_ACESSOS, erro)
      ? { ok: false, erro, inesperado: false }
      : { ok: false, erro: "erro_interno", inesperado: true };
  }
  const saida: { ok: true; [campo: string]: unknown } = { ok: true };
  for (const k of CAMPOS_DA_VOLTA) if (Object.prototype.hasOwnProperty.call(d, k)) saida[k] = d[k];
  return saida;
}
```

- [ ] **Step 4: O verde**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/acessos/acessosRegras.test.ts 2>&1 | tail -4`
Expected: PASS (todos os casos; ~22 testes).

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git add supabase-principal/functions/_shared/acessos-regras.ts src/acessos/acessosRegras.test.ts && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w-a): as regras puras da função acessos (a forma, a RPC com os parâmetros da migration, a whitelist da volta, o status)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/acessos-regras.ts src/acessos/acessosRegras.test.ts
```

---

### Task 3: `_shared/aluno-dia-regras.ts` — a forma das rotinas e da dieta livre (TDD)

**Files:** Create `supabase-principal/functions/_shared/aluno-dia-regras.ts`, `src/aluno-dia/alunoDiaRegras.test.ts`.
**Estimativa:** 50 min (calibrado 28–33).

- [ ] **Step 1: O teste (o contrato com as 2 migrations + a forma de cada ação)** — `src/aluno-dia/alunoDiaRegras.test.ts`:

```ts
// Physiq W-A P2 — as regras PURAS da função aluno-dia (supabase-principal/functions/_shared/aluno-dia-regras.ts): as mesmas que rodam na borda.
// O CONTRATO: cada leitura (q) e cada gravação chama a RPC da migration com os parâmetros de lá, nome por nome, e a lista cobre TODAS as RPCs da
// pessoa da wa2 e da wa3 (nenhuma esquecida, nenhuma inventada). A FORMA: os limites do banco (nome, detalhe, "HH:MM", dias, gramas, porções,
// macros, itens, ids, janela, termo, página), o texto conferido aparado e mandado CRU, os campos de fora caindo (dono, paciente_id, origem,
// criada_por) e o status de cada código.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES_DO_ALUNO_DIA, LEITURAS, LIMITES, RPCS_DO_ALUNO_DIA, STATUS_DO_ERRO_ALUNO_DIA, ehData, pedidoDoAlunoDia, statusDoErroAlunoDia,
  voltaDoAlunoDia,
} from "../../supabase-principal/functions/_shared/aluno-dia-regras";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const HOJE = "2026-10-13";
const SQL = ["20261012210000_wa2_rotinas.sql", "20261012220000_wa3_dieta_livre.sql"]
  .map((f) => readFileSync(resolve(__dirname, "../../supabase-principal/migrations", f), "utf-8")).join("\n");
/** As funções de LGPD da wa3 (geradas com o corpo vivo, em maiúsculas) não são da aluno-dia. */
const DA_LGPD = new Set(["exportar_dados_aluno", "excluir_dados_aluno", "excluir_conta_profissional"]);

function parametros(funcao: string): string[] {
  const m = new RegExp(`create or replace function \\{schema\\}\\.${funcao}\\(([^)]*)\\)`).exec(SQL);
  if (!m) throw new Error(`as migrations não têm ${funcao}`);
  return m[1].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
}

/** Um corpo VÁLIDO de cada leitura e de cada gravação (o que os clientes mandam). */
const VALIDOS: Record<string, Record<string, unknown>> = {
  "ler:rotinas": { acao: "ler", q: "rotinas", de: HOJE, ate: HOJE },
  "ler:dia": { acao: "ler", q: "dia", dia: HOJE },
  "ler:biblioteca": { acao: "ler", q: "biblioteca" },
  "ler:alimentos": { acao: "ler", q: "alimentos", termo: "arroz", pagina: 0 },
  "ler:aluno_rotinas": { acao: "ler", q: "aluno_rotinas", aluno: A, de: "2026-10-07", ate: HOJE },
  "ler:aluno_dia": { acao: "ler", q: "aluno_dia", aluno: A, de: "2026-09-13", ate: HOJE },
  rotina_salvar: { acao: "rotina_salvar", id: null, dados: { nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: true } },
  rotina_arquivar: { acao: "rotina_arquivar", id: A },
  rotina_marcar: { acao: "rotina_marcar", id: A, dia: HOJE, feita: true },
  rotinas_ordenar: { acao: "rotinas_ordenar", ids: [A, B] },
  dia_adicionar: { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, quantidade_g: 150 } },
  dia_tirar: { acao: "dia_tirar", dia: HOJE, item: A },
  dia_desfazer: { acao: "dia_desfazer", id: A },
  extra_salvar: { acao: "extra_salvar", id: null, dados: { dia: HOJE, nome: "Lanche", horario: "16:00", ja_comi: true } },
  extra_excluir: { acao: "extra_excluir", id: A },
  extra_marcar: { acao: "extra_marcar", id: A, feita: false },
  alimento_salvar: { acao: "alimento_salvar", id: null, dados: { nome: "Pão", porcao_g: 50, energia_kcal: 280, proteina_g: 9, carboidrato_g: 55, lipidio_g: 3, fibra_g: 2 } },
  alimento_excluir: { acao: "alimento_excluir", id: A },
  receita_salvar: { acao: "receita_salvar", id: null, dados: { nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: A, quantidade_g: 200 }, { aluno_alimento_id: B, quantidade_g: 100 }] } },
  receita_excluir: { acao: "receita_excluir", id: A },
  prof_rotina_salvar: { acao: "prof_rotina_salvar", aluno: A, id: null, dados: { nome: "Remédio", tipo: "remedio", horario: "20:00", lembrete: true } },
  prof_rotina_arquivar: { acao: "prof_rotina_arquivar", aluno: A, id: B },
};

const recusa = (corpo: Record<string, unknown>) => pedidoDoAlunoDia(corpo);

describe("W-A P2: o contrato da aluno-dia com as migrations", () => {
  it.each(Object.entries(VALIDOS))("%s → a RPC da lista com os parâmetros da migration (nome por nome)", (_nome, corpo) => {
    const r = pedidoDoAlunoDia(corpo);
    if (!r.ok) throw new Error(`recusado: ${JSON.stringify(r)}`);
    expect(RPCS_DO_ALUNO_DIA).toContain(r.pedido.rpc);
    expect(Object.keys(r.pedido.args)).toEqual(parametros(r.pedido.rpc));
  });

  it("a lista cobre TODAS as RPCs da pessoa da wa2 e da wa3 (nenhuma esquecida, nenhuma inventada) e os casos válidos cobrem cada uma", () => {
    const daPessoa = [...SQL.matchAll(/create or replace function \{schema\}\.([a-z_]+)\(/g)].map((m) => m[1])
      .filter((f) => !f.startsWith("wa_") && !DA_LGPD.has(f));
    expect([...new Set(RPCS_DO_ALUNO_DIA)].sort()).toEqual([...new Set(daPessoa)].sort());
    expect(Object.keys(VALIDOS)).toHaveLength(Object.keys(LEITURAS).length + ACOES_DO_ALUNO_DIA.length);
  });

  it("o módulo de cada pedido: rotinas (as do aluno), dieta (o dia, a biblioteca, a busca) e profissional (aluno_* e prof_*)", () => {
    const modulo = (k: string) => { const r = pedidoDoAlunoDia(VALIDOS[k]); return r.ok ? r.pedido.modulo : null; };
    expect(["ler:rotinas", "rotina_salvar", "rotina_marcar", "rotinas_ordenar"].map(modulo)).toEqual(["rotinas", "rotinas", "rotinas", "rotinas"]);
    expect(["ler:dia", "ler:biblioteca", "ler:alimentos", "dia_adicionar", "receita_salvar"].map(modulo)).toEqual(["dieta", "dieta", "dieta", "dieta", "dieta"]);
    expect(["ler:aluno_rotinas", "ler:aluno_dia", "prof_rotina_salvar", "prof_rotina_arquivar"].map(modulo)).toEqual(["profissional", "profissional", "profissional", "profissional"]);
  });
});

describe("W-A P2: a forma (os limites do banco) — o que cai, o que passa, o que é recusado", () => {
  it("os campos de fora caem: dono, paciente_id, origem, criada_por (no corpo e no dados); o id em minúsculas; o texto vai CRU", () => {
    const r = pedidoDoAlunoDia({ acao: "rotina_salvar", id: A.toUpperCase(), dono_user_id: B, dados: { nome: "  Creatina   da manhã ", dono_user_id: B, paciente_id: B, origem: "profissional", criada_por: B } });
    expect(r).toEqual({ ok: true, pedido: { modulo: "rotinas", acao: "rotina_salvar", q: null, rpc: "rotina_salvar", args: { p_id: A, p_dados: { nome: "  Creatina   da manhã " } } } });
    const p = pedidoDoAlunoDia({ acao: "prof_rotina_salvar", aluno: A, dados: { nome: "X", paciente_id: B } });
    expect(p.ok && p.pedido.args).toEqual({ p_aluno: A, p_id: null, p_dados: { nome: "X" } });
  });

  it("a janela: até 31 dias (ate − de ≤ 30) e na ordem; datas que existem", () => {
    expect(pedidoDoAlunoDia({ acao: "ler", q: "rotinas", de: "2026-09-13", ate: HOJE }).ok).toBe(true);
    expect(recusa({ acao: "ler", q: "rotinas", de: "2026-09-12", ate: HOJE })).toEqual({ ok: false, erro: "dados_invalidos", campo: "ate" });
    expect(recusa({ acao: "ler", q: "rotinas", de: HOJE, ate: "2026-10-12" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "ate" });
    expect(ehData("2026-02-28")).toBe(true);
    for (const d of ["2026-02-30", "13/10/2026", "2026-1-3", "", 20261013, null]) expect(ehData(d), String(d)).toBe(false);
    expect(LIMITES.janelaDias).toBe(31);
  });

  it("a busca: termo ≤ 60 (aparado), página inteira 0–50 (sem página = 0)", () => {
    const sem = pedidoDoAlunoDia({ acao: "ler", q: "alimentos", termo: "arroz" });
    expect(sem.ok && sem.pedido.args).toEqual({ p_termo: "arroz", p_pagina: 0 });
    expect(pedidoDoAlunoDia({ acao: "ler", q: "alimentos", termo: `  ${"a".repeat(60)}  `, pagina: 50 }).ok).toBe(true);
    expect(recusa({ acao: "ler", q: "alimentos", termo: "a".repeat(61) })).toEqual({ ok: false, erro: "dados_invalidos", campo: "termo" });
    for (const pagina of [51, -1, 1.5, "1"]) expect(recusa({ acao: "ler", q: "alimentos", termo: "arroz", pagina })).toEqual({ ok: false, erro: "dados_invalidos", campo: "pagina" });
  });

  it.each([
    ["sem ação", {}, "acao_invalida", undefined],
    ["ação desconhecida", { acao: "apagar_tudo" }, "acao_invalida", undefined],
    ["o disfarçado {action: ler}", { action: "ler", q: "rotinas", de: HOJE, ate: HOJE }, "acao_invalida", undefined],
    ["q desconhecido", { acao: "ler", q: "xpto" }, "dados_invalidos", "q"],
    ["q ausente", { acao: "ler" }, "dados_invalidos", "q"],
    ["dia que não existe", { acao: "ler", q: "dia", dia: "2026-02-30" }, "dados_invalidos", "dia"],
    ["aluno_rotinas sem aluno", { acao: "ler", q: "aluno_rotinas", de: HOJE, ate: HOJE }, "dados_invalidos", "aluno"],
    ["rotina nova sem nome", { acao: "rotina_salvar", dados: { tipo: "habito" } }, "dados_invalidos", "nome"],
    ["nome com 61 (aparado)", { acao: "rotina_salvar", dados: { nome: "a".repeat(61) } }, "dados_invalidos", "nome"],
    ["nome só de espaços", { acao: "rotina_salvar", dados: { nome: "    " } }, "dados_invalidos", "nome"],
    ["detalhe com 121", { acao: "rotina_salvar", dados: { nome: "X", detalhe: "d".repeat(121) } }, "dados_invalidos", "detalhe"],
    ["tipo fora", { acao: "rotina_salvar", dados: { nome: "X", tipo: "vitamina" } }, "dados_invalidos", "tipo"],
    ["horário 8:00", { acao: "rotina_salvar", dados: { nome: "X", horario: "8:00" } }, "dados_invalidos", "horario"],
    ["horário 24:00", { acao: "rotina_salvar", dados: { nome: "X", horario: "24:00" } }, "dados_invalidos", "horario"],
    ["dias vazio", { acao: "rotina_salvar", dados: { nome: "X", dias_semana: [] } }, "dados_invalidos", "dias_semana"],
    ["dia 8", { acao: "rotina_salvar", dados: { nome: "X", dias_semana: [1, 8] } }, "dados_invalidos", "dias_semana"],
    ["8 dias", { acao: "rotina_salvar", dados: { nome: "X", dias_semana: [1, 2, 3, 4, 5, 6, 7, 1] } }, "dados_invalidos", "dias_semana"],
    ["lembrete sem horário (nova)", { acao: "rotina_salvar", dados: { nome: "X", lembrete: true } }, "dados_invalidos", "horario"],
    ["lembrete com horário null", { acao: "rotina_salvar", id: A, dados: { lembrete: true, horario: null } }, "dados_invalidos", "horario"],
    ["lembrete não booleano", { acao: "rotina_salvar", dados: { nome: "X", horario: "08:00", lembrete: "sim" } }, "dados_invalidos", "lembrete"],
    ["dados não objeto", { acao: "rotina_salvar", dados: [1] }, "dados_invalidos", "dados"],
    ["id ruim", { acao: "rotina_salvar", id: "x", dados: { nome: "X" } }, "dados_invalidos", "id"],
    ["marcar sem feita", { acao: "rotina_marcar", id: A, dia: HOJE }, "dados_invalidos", "feita"],
    ["ordenar vazio", { acao: "rotinas_ordenar", ids: [] }, "dados_invalidos", "ids"],
    ["ordenar 31", { acao: "rotinas_ordenar", ids: Array.from({ length: 31 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`) }, "dados_invalidos", "ids"],
    ["ordenar repetido", { acao: "rotinas_ordenar", ids: [A, A] }, "dados_invalidos", "ids"],
    ["adicionar em 2 lugares", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, extra_id: B, alimento_id: A, quantidade_g: 10 } }, "dados_invalidos", "lugar"],
    ["adicionar sem lugar", { acao: "dia_adicionar", dia: HOJE, dados: { alimento_id: A, quantidade_g: 10 } }, "dados_invalidos", "lugar"],
    ["adicionar 2 origens", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: A, aluno_alimento_id: B, quantidade_g: 10 } }, "dados_invalidos", "origem"],
    ["adicionar 0 g", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, quantidade_g: 0 } }, "dados_invalidos", "quantidade_g"],
    ["adicionar 10000 g", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, quantidade_g: 10000 } }, "dados_invalidos", "quantidade_g"],
    ["receita em gramas", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, aluno_receita_id: B, quantidade_g: 100 } }, "dados_invalidos", "quantidade_g"],
    ["receita 21 porções", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, aluno_receita_id: B, porcoes: 21 } }, "dados_invalidos", "porcoes"],
    ["alimento em porções", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, porcoes: 1 } }, "dados_invalidos", "porcoes"],
    ["tirar sem item", { acao: "dia_tirar", dia: HOJE }, "dados_invalidos", "item"],
    ["extra nova sem dia", { acao: "extra_salvar", dados: { nome: "Lanche" } }, "dados_invalidos", "dia"],
    ["extra muda o dia", { acao: "extra_salvar", id: A, dados: { dia: HOJE } }, "dados_invalidos", "dia"],
    ["extra nome 41", { acao: "extra_salvar", dados: { dia: HOJE, nome: "n".repeat(41) } }, "dados_invalidos", "nome"],
    ["alimento 1001 kcal", { acao: "alimento_salvar", dados: { nome: "X", energia_kcal: 1001 } }, "dados_invalidos", "energia_kcal"],
    ["alimento 101 g de proteína", { acao: "alimento_salvar", dados: { nome: "X", proteina_g: 101 } }, "dados_invalidos", "proteina_g"],
    ["alimento porção 0", { acao: "alimento_salvar", dados: { nome: "X", porcao_g: 0 } }, "dados_invalidos", "porcao_g"],
    ["receita nova sem itens", { acao: "receita_salvar", dados: { nome: "X" } }, "dados_invalidos", "itens"],
    ["receita 1,5 porção", { acao: "receita_salvar", dados: { nome: "X", porcoes: 1.5, itens: [{ alimento_id: A, quantidade_g: 10 }] } }, "dados_invalidos", "porcoes"],
    ["receita 31 itens", { acao: "receita_salvar", dados: { nome: "X", itens: Array.from({ length: 31 }, () => ({ alimento_id: A, quantidade_g: 10 })) } }, "dados_invalidos", "itens"],
    ["item com os 2 ids", { acao: "receita_salvar", dados: { nome: "X", itens: [{ alimento_id: A, aluno_alimento_id: B, quantidade_g: 10 }] } }, "dados_invalidos", "itens"],
    ["prof sem aluno", { acao: "prof_rotina_salvar", dados: { nome: "X" } }, "dados_invalidos", "aluno"],
    ["prof arquivar sem id", { acao: "prof_rotina_arquivar", aluno: A }, "dados_invalidos", "id"],
  ])("recusa: %s", (_nome, corpo, erro, campo) => {
    expect(recusa(corpo as Record<string, unknown>)).toEqual(campo ? { ok: false, erro, campo } : { ok: false, erro });
  });

  it("passa: a mudança parcial (só o horário), o detalhe null/vazio, o lembrete sem horário numa rotina que já existe (o banco decide)", () => {
    for (const dados of [{ horario: "09:00" }, { detalhe: null }, { detalhe: "" }, { lembrete: true }]) {
      expect(pedidoDoAlunoDia({ acao: "rotina_salvar", id: A, dados }).ok, JSON.stringify(dados)).toBe(true);
    }
  });
});

describe("W-A P2: a volta e o status", () => {
  it("a volta é o jsonb da RPC; a recusa com o código conhecido; o resto → erro_interno (inesperado)", () => {
    expect(voltaDoAlunoDia({ ok: true, rotinas: [], feitas: [], hoje: HOJE })).toEqual({ ok: true, rotinas: [], feitas: [], hoje: HOJE });
    expect(voltaDoAlunoDia({ ok: false, erro: "dieta_travada" })).toEqual({ ok: false, erro: "dieta_travada", inesperado: false });
    expect(voltaDoAlunoDia({ ok: false, erro: "xpto" })).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDoAlunoDia("x")).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
  });

  it("o status de cada código da spec §5.2 e de cada código que as RPCs da aluno-dia devolvem", () => {
    expect(STATUS_DO_ERRO_ALUNO_DIA).toMatchObject({
      dados_invalidos: 400, acao_invalida: 400, sem_login: 401, sem_acesso: 403, nao_encontrado: 404, aluno_inexistente: 404,
      dieta_travada: 409, sem_login_do_aluno: 409, so_do_aluno: 409, limite: 409, corpo_grande: 413, muitas_acoes: 429, erro_interno: 500,
    });
    const daLgpd = new Set(["assinatura_ativa", "cobranca_ativa", "conta_legada", "nao_profissional", "profissional"]);
    for (const c of new Set([...SQL.matchAll(/'erro', '([a-z_]+)'/g)].map((m) => m[1]))) {
      if (!daLgpd.has(c)) expect(STATUS_DO_ERRO_ALUNO_DIA[c], c).toBeDefined();
    }
    expect(statusDoErroAlunoDia("xpto")).toBe(500);
  });
});
```

- [ ] **Step 2: O vermelho**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/aluno-dia/alunoDiaRegras.test.ts 2>&1 | tail -6`
Expected: FAIL — `Failed to resolve import "../../supabase-principal/functions/_shared/aluno-dia-regras"`.

- [ ] **Step 3: As regras** — `supabase-principal/functions/_shared/aluno-dia-regras.ts`:

```ts
// Physiq W-A P2 (jeito 2, 13/10/2026) — regras PURAS da função `aluno-dia` (banco principal): as ROTINAS (creatina, remédio, hábito…) e a DIETA
// LIVRE (o dia do aluno com a Dieta "Pode mexer") — o app do aluno (P3, P5) e o Painel do profissional (P6). Sem Deno e sem rede: usadas pela
// função (supabase-principal/functions/aluno-dia/) e testadas no Vitest (src/aluno-dia/alunoDiaRegras.test.ts, com o CONTRATO das migrations).
// O desenho (spec W-A §5.2, §5.5, §5.6):
//   · toda LEITURA é { acao: "ler", q, … } (a Guarda dos E2E: leitura pelo corpo) — q numa lista fechada: rotinas { de, ate } · dia { dia } ·
//     biblioteca · alimentos { termo, pagina } · aluno_rotinas { aluno, de, ate } · aluno_dia { aluno, de, ate };
//   · as GRAVAÇÕES numa lista fechada, cada uma com a SUA RPC (migrations 20261012210000_wa2_rotinas e 20261012220000_wa3_dieta_livre) e os
//     campos que aceita, com o tipo e o tamanho DO BANCO; o que vier fora da lista CAI (dono, paciente_id, origem, criada_por nunca vêm do
//     corpo: o dono é o token, a matrícula é o banco que decide);
//   · os parâmetros com tipo do PostgREST (uuid, date, boolean, integer, uuid[]) vão SEMPRE conferidos — o cast de um texto cru leva o valor
//     na mensagem do Postgres, e o log.excecao leva a mensagem; o texto de dentro do p_dados vai CRU (o banco apara e grava; a função só barra
//     o que está fora da forma);
//   · a volta é o jsonb da RPC ({ ok, … }); { ok: false, erro } com o código; o status de cada código (a tela escreve a frase:
//     src/aluno-dia/api.ts). O log leva o código, a ação, o q e o nome do CAMPO recusado — nunca o nome de uma rotina ou de um alimento.
import { ehUuid } from "./nutricao-regras.ts";

type Corpo = Record<string, unknown>;
export type Recusa = { ok: false; erro: string; campo?: string };
type Lido<T> = { ok: true; valor: T } | Recusa;
const certo = <T>(valor: T): Lido<T> => ({ ok: true, valor });
const ruim = (campo: string): Recusa => ({ ok: false, erro: "dados_invalidos", campo });

// ───────────────────────── os limites (os do banco: wa_rotina_campos, wa_texto, wa_numero e os checks das tabelas) ─────────────────────────
export const LIMITES = {
  rotinaNome: [1, 60], detalhe: 120, extraNome: [1, 40], alimentoNome: [1, 80], receitaNome: [1, 80],
  gramas: [0.01, 9999.99], porcoesDoDia: [0.01, 20], porcoesDaReceita: [1, 100], porcaoG: [0.01, 9999.99], kcal: [0, 1000], macro: [0, 100],
  itensDaReceita: [1, 30], idsNaOrdem: 30, termo: 60, pagina: [0, 50], janelaDias: 31,
} as const;
export const TIPOS_DE_ROTINA = ["suplemento", "remedio", "habito", "outro"] as const;
export const MACROS = ["energia_kcal", "proteina_g", "carboidrato_g", "lipidio_g", "fibra_g"] as const;

// ───────────────────────── as leituras e as gravações (cada uma, a sua RPC) ─────────────────────────
export type Modulo = "rotinas" | "dieta" | "profissional";
export const LEITURAS = {
  rotinas: { modulo: "rotinas", rpc: "minhas_rotinas" },
  dia: { modulo: "dieta", rpc: "meu_dia" },
  biblioteca: { modulo: "dieta", rpc: "meus_alimentos" },
  alimentos: { modulo: "dieta", rpc: "buscar_alimentos_do_aluno" },
  aluno_rotinas: { modulo: "profissional", rpc: "rotinas_do_aluno" },
  aluno_dia: { modulo: "profissional", rpc: "dia_do_aluno" },
} as const;
export type Consulta = keyof typeof LEITURAS;

export const ACOES = {
  rotina_salvar: { modulo: "rotinas", rpc: "rotina_salvar" },
  rotina_arquivar: { modulo: "rotinas", rpc: "rotina_arquivar" },
  rotina_marcar: { modulo: "rotinas", rpc: "rotina_marcar" },
  rotinas_ordenar: { modulo: "rotinas", rpc: "rotinas_ordenar" },
  dia_adicionar: { modulo: "dieta", rpc: "dia_adicionar" },
  dia_tirar: { modulo: "dieta", rpc: "dia_tirar" },
  dia_desfazer: { modulo: "dieta", rpc: "dia_desfazer" },
  extra_salvar: { modulo: "dieta", rpc: "dia_extra_salvar" },
  extra_excluir: { modulo: "dieta", rpc: "dia_extra_excluir" },
  extra_marcar: { modulo: "dieta", rpc: "dia_extra_marcar" },
  alimento_salvar: { modulo: "dieta", rpc: "meu_alimento_salvar" },
  alimento_excluir: { modulo: "dieta", rpc: "meu_alimento_excluir" },
  receita_salvar: { modulo: "dieta", rpc: "minha_receita_salvar" },
  receita_excluir: { modulo: "dieta", rpc: "minha_receita_excluir" },
  prof_rotina_salvar: { modulo: "profissional", rpc: "rotina_prof_salvar" },
  prof_rotina_arquivar: { modulo: "profissional", rpc: "rotina_prof_arquivar" },
} as const;
export type AcaoDoAlunoDia = keyof typeof ACOES;
export const ACOES_DO_ALUNO_DIA = Object.keys(ACOES) as AcaoDoAlunoDia[];
/** Todas as RPCs que a função chama (o teste confere com as migrations). */
export const RPCS_DO_ALUNO_DIA: readonly string[] = [...Object.values(LEITURAS).map((l) => l.rpc), ...Object.values(ACOES).map((a) => a.rpc)];

export interface PedidoDoAlunoDia {
  modulo: Modulo;
  acao: "ler" | AcaoDoAlunoDia;
  /** a consulta, na leitura; null na gravação */
  q: Consulta | null;
  rpc: string;
  /** os parâmetros da RPC, com os nomes da migration (p_*) */
  args: Record<string, unknown>;
}

// ───────────────────────── os formatos ─────────────────────────
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** yyyy-mm-dd que existe no calendário (2026-02-30 não). */
export function ehData(v: unknown): v is string {
  if (typeof v !== "string" || !DATA.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export const ehHora = (v: unknown): v is string => typeof v === "string" && HORA.test(v);
/** O texto medido como o banco mede (aparado; espaços seguidos viram 1) cabe em [min, max]? Só confere — o texto vai CRU. */
export function textoNoTamanho(v: unknown, min: number, max: number): v is string {
  if (typeof v !== "string") return false;
  const n = v.trim().replace(/\s+/g, " ").length;
  return n >= min && n <= max;
}
export function numeroEntre(v: unknown, faixa: readonly [number, number], inteiro = false): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= faixa[0] && v <= faixa[1] && (!inteiro || Number.isInteger(v));
}
const ehObjeto = (v: unknown): v is Corpo => !!v && typeof v === "object" && !Array.isArray(v);
const tem = (o: Corpo, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

function idOuNulo(c: Corpo, campo = "id"): Lido<string | null> {
  const v = c[campo];
  if (v === undefined || v === null) return certo(null);
  return ehUuid(v) ? certo(v.toLowerCase()) : ruim(campo);
}
function idObrigatorio(c: Corpo, campo = "id"): Lido<string> {
  const v = c[campo];
  return ehUuid(v) ? certo(v.toLowerCase()) : ruim(campo);
}
function dataDo(c: Corpo, campo = "dia"): Lido<string> {
  const v = c[campo];
  return ehData(v) ? certo(v) : ruim(campo);
}
/** de/ate: datas que existem, na ordem, no máximo 31 dias (ate − de ≤ 30 — o "> 30" das RPCs). */
function janela(c: Corpo): Lido<{ p_de: string; p_ate: string }> {
  if (!ehData(c.de)) return ruim("de");
  if (!ehData(c.ate)) return ruim("ate");
  const dias = (Date.parse(`${c.ate}T00:00:00Z`) - Date.parse(`${c.de}T00:00:00Z`)) / 86_400_000;
  return dias >= 0 && dias <= LIMITES.janelaDias - 1 ? certo({ p_de: c.de, p_ate: c.ate }) : ruim("ate");
}

// ───────────────────────── o p_dados de cada gravação (só os campos conhecidos) ─────────────────────────
/** A rotina (wa_rotina_campos): `criar` exige o nome; lembrete exige horário (na criação, no corpo; na mudança, o banco confere com a linha). */
export function dadosDaRotina(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.rotinaNome[0], LIMITES.rotinaNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "detalhe")) {
    if (v.detalhe !== null && !textoNoTamanho(v.detalhe, 0, LIMITES.detalhe)) return ruim("detalhe");
    s.detalhe = v.detalhe;
  }
  if (tem(v, "tipo")) {
    if (typeof v.tipo !== "string" || !(TIPOS_DE_ROTINA as readonly string[]).includes(v.tipo)) return ruim("tipo");
    s.tipo = v.tipo;
  }
  if (tem(v, "horario")) {
    if (v.horario !== null && !ehHora(v.horario)) return ruim("horario");
    s.horario = v.horario;
  }
  if (tem(v, "dias_semana")) {
    const d = v.dias_semana;
    if (!Array.isArray(d) || d.length < 1 || d.length > 7 || !d.every((x) => Number.isInteger(x) && x >= 1 && x <= 7)) return ruim("dias_semana");
    s.dias_semana = d;
  }
  if (tem(v, "lembrete")) {
    if (typeof v.lembrete !== "boolean") return ruim("lembrete");
    s.lembrete = v.lembrete;
  }
  if (s.lembrete === true && (tem(s, "horario") ? s.horario === null : criar)) return ruim("horario");
  return certo(s);
}

/** O que ele põe no dia: 1 lugar (refeicao_id | extra_id), 1 origem (alimento_id | aluno_alimento_id | aluno_receita_id) e a quantidade
 *  (receita em porções; o resto em gramas). */
export function dadosDoItemDoDia(v: unknown): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const lugares = ["refeicao_id", "extra_id"].filter((k) => tem(v, k));
  if (lugares.length !== 1) return ruim("lugar");
  const origens = ["alimento_id", "aluno_alimento_id", "aluno_receita_id"].filter((k) => tem(v, k));
  if (origens.length !== 1) return ruim("origem");
  const [lugar] = lugares;
  const [origem] = origens;
  const idLugar = v[lugar];
  const idOrigem = v[origem];
  if (!ehUuid(idLugar)) return ruim(lugar);
  if (!ehUuid(idOrigem)) return ruim(origem);
  const s: Corpo = { [lugar]: idLugar.toLowerCase(), [origem]: idOrigem.toLowerCase() };
  if (origem === "aluno_receita_id") {
    if (tem(v, "quantidade_g")) return ruim("quantidade_g");
    if (!numeroEntre(v.porcoes, LIMITES.porcoesDoDia)) return ruim("porcoes");
    s.porcoes = v.porcoes;
  } else {
    if (tem(v, "porcoes")) return ruim("porcoes");
    if (!numeroEntre(v.quantidade_g, LIMITES.gramas)) return ruim("quantidade_g");
    s.quantidade_g = v.quantidade_g;
  }
  return certo(s);
}

/** A refeição extra: criar = dia + nome (a matrícula é a do plano ativo — o banco decide); mudar = nome, horário, "já comi" (o dia, nunca). */
export function dadosDaExtra(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.extraNome[0], LIMITES.extraNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "horario")) {
    if (v.horario !== null && !ehHora(v.horario)) return ruim("horario");
    s.horario = v.horario;
  }
  if (tem(v, "ja_comi")) {
    if (typeof v.ja_comi !== "boolean") return ruim("ja_comi");
    s.ja_comi = v.ja_comi;
  }
  if (criar) {
    if (!ehData(v.dia)) return ruim("dia");
    s.dia = v.dia;
  } else if (tem(v, "dia")) return ruim("dia");
  return certo(s);
}

/** O alimento dele (por 100 g; porcao_g = a porção de referência): criar exige o nome. */
export function dadosDoAlimento(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.alimentoNome[0], LIMITES.alimentoNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "porcao_g")) {
    if (!numeroEntre(v.porcao_g, LIMITES.porcaoG)) return ruim("porcao_g");
    s.porcao_g = v.porcao_g;
  }
  for (const k of MACROS) {
    if (!tem(v, k)) continue;
    if (!numeroEntre(v[k], k === "energia_kcal" ? LIMITES.kcal : LIMITES.macro)) return ruim(k);
    s[k] = v[k];
  }
  return certo(s);
}

/** A receita dele: nome, porções inteiras 1–100 e 1–30 itens (cada um: alimento_id OU aluno_alimento_id + quantidade_g); criar exige nome e itens. */
export function dadosDaReceita(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.receitaNome[0], LIMITES.receitaNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "porcoes")) {
    if (!numeroEntre(v.porcoes, LIMITES.porcoesDaReceita, true)) return ruim("porcoes");
    s.porcoes = v.porcoes;
  }
  if (tem(v, "itens")) {
    const itens = v.itens;
    if (!Array.isArray(itens) || itens.length < LIMITES.itensDaReceita[0] || itens.length > LIMITES.itensDaReceita[1]) return ruim("itens");
    const lista: Corpo[] = [];
    for (const it of itens) {
      if (!ehObjeto(it)) return ruim("itens");
      const chaves = ["alimento_id", "aluno_alimento_id"].filter((k) => tem(it, k));
      const id = chaves.length === 1 ? it[chaves[0]] : null;
      if (!ehUuid(id) || !numeroEntre(it.quantidade_g, LIMITES.gramas)) return ruim("itens");
      lista.push({ [chaves[0]]: id.toLowerCase(), quantidade_g: it.quantidade_g });
    }
    s.itens = lista;
  } else if (criar) return ruim("itens");
  return certo(s);
}

// ───────────────────────── o pedido inteiro ─────────────────────────
function leitura(c: Corpo): Lido<PedidoDoAlunoDia> {
  const q = c.q;
  if (typeof q !== "string" || !Object.prototype.hasOwnProperty.call(LEITURAS, q)) return ruim("q");
  const consulta = q as Consulta;
  const def = LEITURAS[consulta];
  const base = { modulo: def.modulo as Modulo, acao: "ler" as const, q: consulta, rpc: def.rpc };
  switch (consulta) {
    case "rotinas": {
      const j = janela(c);
      return j.ok === false ? j : certo({ ...base, args: { ...j.valor } });
    }
    case "dia": {
      const d = dataDo(c);
      return d.ok === false ? d : certo({ ...base, args: { p_dia: d.valor } });
    }
    case "biblioteca":
      return certo({ ...base, args: {} });
    case "alimentos": {
      if (!textoNoTamanho(c.termo, 0, LIMITES.termo)) return ruim("termo");
      const pagina = c.pagina === undefined ? 0 : c.pagina;
      if (!numeroEntre(pagina, LIMITES.pagina, true)) return ruim("pagina");
      return certo({ ...base, args: { p_termo: c.termo, p_pagina: pagina } });
    }
    case "aluno_rotinas":
    case "aluno_dia": {
      const a = idObrigatorio(c, "aluno");
      if (a.ok === false) return a;
      const j = janela(c);
      return j.ok === false ? j : certo({ ...base, args: { p_aluno: a.valor, ...j.valor } });
    }
  }
}

function gravacao(acao: AcaoDoAlunoDia, c: Corpo): Lido<PedidoDoAlunoDia> {
  const def = ACOES[acao];
  const base = { modulo: def.modulo as Modulo, acao, q: null, rpc: def.rpc };
  const com = (args: Record<string, unknown>) => certo({ ...base, args });
  switch (acao) {
    case "rotina_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const d = dadosDaRotina(c.dados, id.valor === null);
      return d.ok === false ? d : com({ p_id: id.valor, p_dados: d.valor });
    }
    case "rotina_arquivar":
    case "dia_desfazer":
    case "extra_excluir":
    case "alimento_excluir":
    case "receita_excluir": {
      const id = idObrigatorio(c);
      return id.ok === false ? id : com({ p_id: id.valor });
    }
    case "rotina_marcar": {
      const id = idObrigatorio(c);
      if (id.ok === false) return id;
      const d = dataDo(c);
      if (d.ok === false) return d;
      if (typeof c.feita !== "boolean") return ruim("feita");
      return com({ p_id: id.valor, p_dia: d.valor, p_feita: c.feita });
    }
    case "rotinas_ordenar": {
      const ids = c.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > LIMITES.idsNaOrdem || !ids.every(ehUuid)) return ruim("ids");
      const minusculos = ids.map((x) => (x as string).toLowerCase());
      if (new Set(minusculos).size !== minusculos.length) return ruim("ids");
      return com({ p_ids: minusculos });
    }
    case "dia_adicionar": {
      const d = dataDo(c);
      if (d.ok === false) return d;
      const dados = dadosDoItemDoDia(c.dados);
      return dados.ok === false ? dados : com({ p_dia: d.valor, p_dados: dados.valor });
    }
    case "dia_tirar": {
      const d = dataDo(c);
      if (d.ok === false) return d;
      const item = idObrigatorio(c, "item");
      return item.ok === false ? item : com({ p_dia: d.valor, p_item: item.valor });
    }
    case "extra_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDaExtra(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_id: id.valor, p_dados: dados.valor });
    }
    case "extra_marcar": {
      const id = idObrigatorio(c);
      if (id.ok === false) return id;
      if (typeof c.feita !== "boolean") return ruim("feita");
      return com({ p_id: id.valor, p_feita: c.feita });
    }
    case "alimento_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDoAlimento(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_id: id.valor, p_dados: dados.valor });
    }
    case "receita_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDaReceita(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_id: id.valor, p_dados: dados.valor });
    }
    case "prof_rotina_salvar": {
      const aluno = idObrigatorio(c, "aluno");
      if (aluno.ok === false) return aluno;
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDaRotina(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_aluno: aluno.valor, p_id: id.valor, p_dados: dados.valor });
    }
    case "prof_rotina_arquivar": {
      const aluno = idObrigatorio(c, "aluno");
      if (aluno.ok === false) return aluno;
      const id = idObrigatorio(c);
      return id.ok === false ? id : com({ p_aluno: aluno.valor, p_id: id.valor });
    }
  }
}

/** O pedido na forma (a RPC e os p_*) ou a recusa: acao_invalida (fora da lista; o { action: "ler" } também) · dados_invalidos com o campo. */
export function pedidoDoAlunoDia(corpo: Corpo): { ok: true; pedido: PedidoDoAlunoDia } | Recusa {
  if (corpo.acao === "ler") {
    const r = leitura(corpo);
    return r.ok === false ? r : { ok: true, pedido: r.valor };
  }
  const acao = corpo.acao;
  if (typeof acao !== "string" || !Object.prototype.hasOwnProperty.call(ACOES, acao)) return { ok: false, erro: "acao_invalida" };
  const r = gravacao(acao as AcaoDoAlunoDia, corpo);
  return r.ok === false ? r : { ok: true, pedido: r.valor };
}

// ───────────────────────── a volta e o status ─────────────────────────
export const STATUS_DO_ERRO_ALUNO_DIA: Readonly<Record<string, number>> = {
  dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400,
  sem_login: 401,
  sem_acesso: 403,
  nao_encontrado: 404, aluno_inexistente: 404,
  metodo: 405,
  dieta_travada: 409, sem_login_do_aluno: 409, so_do_aluno: 409, limite: 409, conflito: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  tempo_esgotado: 504,
};
export const statusDoErroAlunoDia = (erro: unknown): number => STATUS_DO_ERRO_ALUNO_DIA[String(erro ?? "")] ?? 500;

/** O jsonb da RPC como resposta: { ok: true, … } como veio · { ok: false, erro } conhecido · o resto → erro_interno (inesperado: log.erro). */
export function voltaDoAlunoDia(data: unknown): { ok: true; [campo: string]: unknown } | { ok: false; erro: string; inesperado: boolean } {
  if (!ehObjeto(data)) return { ok: false, erro: "erro_interno", inesperado: true };
  if (data.ok === true) return data as { ok: true; [campo: string]: unknown };
  const erro = typeof data.erro === "string" ? data.erro : "";
  return erro && erro !== "erro_interno" && Object.prototype.hasOwnProperty.call(STATUS_DO_ERRO_ALUNO_DIA, erro)
    ? { ok: false, erro, inesperado: false }
    : { ok: false, erro: "erro_interno", inesperado: true };
}
```

- [ ] **Step 4: O verde**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/aluno-dia/alunoDiaRegras.test.ts 2>&1 | tail -4`
Expected: PASS (~80 testes: 22 do contrato + 2 da cobertura + 48 recusas + o resto). Um caso do contrato falhando = o nome de um `p_*` diferente do
da migration → corrigir a REGRA (nunca a migration).

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git add supabase-principal/functions/_shared/aluno-dia-regras.ts src/aluno-dia/alunoDiaRegras.test.ts && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w-a): as regras puras da função aluno-dia (as 6 leituras e as 16 gravações com os limites do banco e o contrato das migrations)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/aluno-dia-regras.ts src/aluno-dia/alunoDiaRegras.test.ts
```

---

### Task 4: `supabase/functions/_shared/treino-acessos-regras.ts` — a forma da `treino-acessos`, no Treino (TDD)

**Files:** Create `supabase/functions/_shared/treino-acessos-regras.ts`, `src/acessos/treinoAcessosRegras.test.ts`.
**Estimativa:** 25 min (calibrado 14–16).

> Mora no `_shared` do TREINO (o `deploy_function.sh` leva só o `_shared` do projeto): nada importa do principal; o uuid tem a regex própria.

- [ ] **Step 1: O teste** — `src/acessos/treinoAcessosRegras.test.ts`:

```ts
// Physiq W-A P2 — as regras PURAS da treino-acessos (supabase/functions/_shared/treino-acessos-regras.ts), as mesmas da borda: o CORS = o da
// treino-leitura (lido do arquivo dela), a forma do pedido (acao, não o action da treino-leitura), nível ↔ series_travadas, os parâmetros das 2
// RPCs do principal (os nomes da migration 20261012200000_wa1_acessos.sql), a resposta do principal (quem lê, quem muda, o login, a conta, o id
// do Treino guardado, os módulos; as recusas; o 401; o resto = principal_indisponivel) e o status de cada código.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FREIO, LIMITE_CORPO, ORIGENS_PERMITIDAS, STATUS_DO_ERRO_TREINO_ACESSOS, argsDoLer, argsDoRegistro, corsTreinoAcessos, lerPedidoTreinoAcessos,
  nivelDasSeries, pgDaResposta, registroDeu, respostaDoAcessosLer, schemaDoPedido, statusDoErroTreino, temTreino, travadasDoNivel,
} from "../../supabase/functions/_shared/treino-acessos-regras";

const ALUNO = "11111111-1111-4111-8111-111111111111";
const U = "22222222-2222-4222-8222-222222222222";
const CONTA = "c0000000-0000-4000-8000-00000000000a";
const TREINO = "33333333-3333-4333-8333-333333333333";
const RAIZ = resolve(__dirname, "../..");
const WA1 = readFileSync(resolve(RAIZ, "supabase-principal/migrations/20261012200000_wa1_acessos.sql"), "utf-8");
const LEITURA = readFileSync(resolve(RAIZ, "supabase/functions/treino-leitura/index.ts"), "utf-8");

function parametros(funcao: string): string[] {
  const m = new RegExp(`create or replace function \\{schema\\}\\.${funcao}\\(([^)]*)\\)`).exec(WA1);
  if (!m) throw new Error(`a wa1 não tem ${funcao}`);
  return m[1].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
}

describe("W-A P2: as regras da treino-acessos", () => {
  it("o CORS é o da treino-leitura (as mesmas origens); fora da lista → o site", () => {
    const daLeitura = [...LEITURA.split("const ALLOWED_ORIGINS = new Set([")[1].split("]);")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...ORIGENS_PERMITIDAS].sort()).toEqual(daLeitura.sort());
    expect(corsTreinoAcessos("http://localhost:5173")["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(corsTreinoAcessos("https://exemplo.example")["Access-Control-Allow-Origin"]).toBe("https://physiqcalc.com.br");
    expect(corsTreinoAcessos(null)["Access-Control-Allow-Headers"]).toBe("authorization, x-client-info, apikey, content-type, x-schema");
  });

  it("o schema: ausente = public (como a treino-leitura e a porta-pessoa); fora da lista = null (400)", () => {
    expect(schemaDoPedido(null)).toBe("public");
    expect(schemaDoPedido(" STAGING ")).toBe("staging");
    expect(schemaDoPedido("xpto")).toBeNull();
  });

  it("a forma: ler { aluno } e salvar { aluno, valor ver|mexer }; o action da treino-leitura não vale; o aluno em minúsculas", () => {
    expect(lerPedidoTreinoAcessos({ acao: "ler", aluno: ALUNO.toUpperCase() })).toEqual({ ok: true, pedido: { acao: "ler", aluno: ALUNO } });
    expect(lerPedidoTreinoAcessos({ acao: "salvar", aluno: ALUNO, valor: "ver", treino_user_id: TREINO })).toEqual({ ok: true, pedido: { acao: "salvar", aluno: ALUNO, valor: "ver" } });
    for (const corpo of [{ action: "get", aluno: ALUNO }, { acao: "ler2", aluno: ALUNO }, [], null, "ler"]) {
      expect(lerPedidoTreinoAcessos(corpo)).toEqual({ ok: false, erro: "acao_invalida" });
    }
    expect(lerPedidoTreinoAcessos({ acao: "ler", aluno: "x" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "aluno" });
    expect(lerPedidoTreinoAcessos({ acao: "salvar", aluno: ALUNO, valor: "travar" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "valor" });
    expect(lerPedidoTreinoAcessos({ acao: "salvar", aluno: ALUNO, valor: true })).toEqual({ ok: false, erro: "dados_invalidos", campo: "valor" });
  });

  it("nível ↔ series_travadas: 'ver' = travadas (true); o resto (false, null, ausente) = 'mexer' — o padrão do Treino", () => {
    expect([true, false, null, undefined].map(nivelDasSeries)).toEqual(["ver", "mexer", "mexer", "mexer"]);
    expect([travadasDoNivel("ver"), travadasDoNivel("mexer")]).toEqual([true, false]);
  });

  it("os parâmetros das 2 RPCs do principal = os da migration (nome por nome)", () => {
    expect(Object.keys(argsDoLer(ALUNO))).toEqual(parametros("acessos_ler"));
    expect(Object.keys(argsDoRegistro(ALUNO, "ver", "mexer"))).toEqual(parametros("acessos_registrar_series"));
    expect(argsDoRegistro(ALUNO, "ver", "mexer")).toEqual({ p_aluno: ALUNO, p_de: "ver", p_para: "mexer" });
  });

  it("a resposta da acessos_ler: o que a função precisa; as recusas com o código; o 401; o resto = principal_indisponivel (inesperado)", () => {
    const ok = { ok: true, paciente_id: ALUNO, user_id: U, conta_id: CONTA, treino_user_id: null, pode_mudar: true, modulos: ["treino", "nutricao", 7] };
    expect(respostaDoAcessosLer(200, ok)).toEqual({ ok: true, userId: U, contaId: CONTA, treinoUserId: null, podeMudar: true, modulos: ["treino", "nutricao"] });
    expect(respostaDoAcessosLer(200, { ...ok, pode_mudar: "sim" })).toMatchObject({ ok: true, podeMudar: false });
    expect(respostaDoAcessosLer(200, { ok: false, erro: "sem_acesso" })).toEqual({ ok: false, erro: "sem_acesso", inesperado: false });
    expect(respostaDoAcessosLer(200, { ok: false, erro: "aluno_inexistente" })).toEqual({ ok: false, erro: "aluno_inexistente", inesperado: false });
    expect(respostaDoAcessosLer(401, { code: "PGRST301" })).toEqual({ ok: false, erro: "sem_login", inesperado: false });
    for (const [st, corpo] of [[200, { ok: false, erro: "xpto" }], [404, { code: "PGRST202" }], [500, null], [503, {}], [200, null]] as const) {
      expect(respostaDoAcessosLer(st, corpo), `${st}`).toEqual({ ok: false, erro: "principal_indisponivel", inesperado: true });
    }
  });

  it("módulo Treino, o registro, o código do Postgres para o log e os limites", () => {
    expect([temTreino(["treino", "nutricao"]), temTreino(["nutricao"]), temTreino([])]).toEqual([true, false, false]);
    expect([registroDeu(200, { ok: true }), registroDeu(200, { ok: false, erro: "sem_acesso" }), registroDeu(500, { ok: true })]).toEqual([true, false, false]);
    expect([pgDaResposta({ code: "PGRST202" }), pgDaResposta({ code: "42501" }), pgDaResposta({ code: "eyJ…" }), pgDaResposta(null)]).toEqual(["PGRST202", "42501", null, null]);
    expect(LIMITE_CORPO).toBe(16 * 1024);
    expect(FREIO).toEqual({ porIp: 120, porPessoa: 60 });
  });

  it("o status de cada código (spec §5.2: 404 sem_treino, 409 sem_modulo, 502 principal_indisponivel); o desconhecido = 500", () => {
    expect(STATUS_DO_ERRO_TREINO_ACESSOS).toMatchObject({
      dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400, sem_login: 401, sem_acesso: 403, aluno_inexistente: 404, sem_treino: 404,
      metodo: 405, sem_modulo: 409, corpo_grande: 413, muitas_acoes: 429, erro_interno: 500, principal_indisponivel: 502,
    });
    expect(statusDoErroTreino("xpto")).toBe(500);
  });
});
```

- [ ] **Step 2: O vermelho**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/acessos/treinoAcessosRegras.test.ts 2>&1 | tail -6`
Expected: FAIL — `Failed to resolve import "../../supabase/functions/_shared/treino-acessos-regras"`.

- [ ] **Step 3: As regras** — `supabase/functions/_shared/treino-acessos-regras.ts`:

```ts
// Physiq W-A P2 (13/10/2026) — regras PURAS da função `treino-acessos` (Banco do Treino): a linha "Treino — séries" da aba Acessos (P4) lê e muda
// o cadeado das séries do aluno (physiq_profiles.series_travadas). Sem Deno e sem rede: usadas pela função (supabase/functions/treino-acessos/) e
// testadas no Vitest (src/acessos/treinoAcessosRegras.test.ts). Mora no _shared do TREINO (o deploy_function.sh leva só o _shared do projeto):
// nada daqui importa do principal. O desenho (spec W-A §2.2-4, §5.2, §5.5; revisão C4): o CORS (o da treino-leitura), a forma do pedido
// (o campo é `acao`, como nas outras 2 da W-A), o nível ↔ o booleano do Treino ("ver" = travadas), os parâmetros das 2 RPCs do principal, o
// que a acessos_ler respondeu (quem lê, quem muda, o login, a conta, o treino_user_id guardado e os módulos da matrícula) e o status.

/** As origens da treino-leitura (o teste confere com o arquivo dela): o site, o www, o staging, o vercel antigo, o APK e o dev local. */
export const ORIGENS_PERMITIDAS = [
  "https://physiqcalc.com.br", "https://www.physiqcalc.com.br", "https://physiqcalc-staging.vercel.app", "https://physiqcalc.vercel.app",
  "capacitor://localhost", "https://localhost", "http://localhost:8080", "http://localhost:5173",
] as const;

export function corsTreinoAcessos(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && (ORIGENS_PERMITIDAS as readonly string[]).includes(origin) ? origin : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export type SchemaTreino = "public" | "staging";
/** O x-schema: ausente = public (como a treino-leitura e a porta-pessoa do principal); fora da lista = null (400 schema_invalido). */
export function schemaDoPedido(v: string | null | undefined): SchemaTreino | null {
  const s = (v || "public").trim().toLowerCase();
  return s === "public" || s === "staging" ? s : null;
}

/** O maior corpo aceito (o pedido é { acao, aluno, valor }): acima, 413 corpo_grande sem ler o resto. */
export const LIMITE_CORPO = 16 * 1024;
/** O freio no isolate (os da treino-leitura): por IP antes do token e por pessoa depois, por minuto. */
export const FREIO = { porIp: 120, porPessoa: 60 } as const;

export const NIVEIS_DAS_SERIES = ["ver", "mexer"] as const;
export type NivelDasSeries = (typeof NIVEIS_DAS_SERIES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PedidoTreinoAcessos = { acao: "ler"; aluno: string } | { acao: "salvar"; aluno: string; valor: NivelDasSeries };
export type RecusaTreino = { ok: false; erro: string; campo?: string };

/** O pedido na forma ou a recusa: acao_invalida (o action da treino-leitura também) · dados_invalidos com o campo. Nada mais do corpo passa. */
export function lerPedidoTreinoAcessos(corpo: unknown): { ok: true; pedido: PedidoTreinoAcessos } | RecusaTreino {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "acao_invalida" };
  const c = corpo as Record<string, unknown>;
  if (c.acao !== "ler" && c.acao !== "salvar") return { ok: false, erro: "acao_invalida" };
  if (typeof c.aluno !== "string" || !UUID.test(c.aluno)) return { ok: false, erro: "dados_invalidos", campo: "aluno" };
  const aluno = c.aluno.toLowerCase();
  if (c.acao === "ler") return { ok: true, pedido: { acao: "ler", aluno } };
  if (c.valor !== "ver" && c.valor !== "mexer") return { ok: false, erro: "dados_invalidos", campo: "valor" };
  return { ok: true, pedido: { acao: "salvar", aluno, valor: c.valor } };
}

/** "ver" = o cadeado fechado (series_travadas = true: o aluno não põe nem tira séries); o resto = "mexer" (o padrão do Treino é false). */
export const nivelDasSeries = (travadas: unknown): NivelDasSeries => (travadas === true ? "ver" : "mexer");
export const travadasDoNivel = (n: NivelDasSeries): boolean => n === "ver";

/** Os parâmetros das 2 RPCs do principal (os nomes da migration 20261012200000_wa1_acessos.sql — o teste confere). */
export const argsDoLer = (aluno: string): Record<string, unknown> => ({ p_aluno: aluno });
export const argsDoRegistro = (aluno: string, de: NivelDasSeries, para: NivelDasSeries): Record<string, unknown> => ({ p_aluno: aluno, p_de: de, p_para: para });

export type DoPrincipal =
  | { ok: true; userId: string | null; contaId: string | null; treinoUserId: string | null; podeMudar: boolean; modulos: string[] }
  | { ok: false; erro: string; inesperado: boolean };

/** As recusas da acessos_ler que vão à tela como estão (wa_rota: sem_login · sem_acesso · aluno_inexistente · dados_invalidos). */
const RECUSAS_DO_PRINCIPAL = ["sem_login", "sem_acesso", "aluno_inexistente", "dados_invalidos"];

/** O que a acessos_ler (como a pessoa, pelo REST do principal) respondeu — o que a função precisa, ou o código (o resto = principal_indisponivel). */
export function respostaDoAcessosLer(status: number, corpo: unknown): DoPrincipal {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
  if (status === 200 && c?.ok === true) {
    const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);
    return {
      ok: true, userId: id(c.user_id), contaId: id(c.conta_id), treinoUserId: id(c.treino_user_id), podeMudar: c.pode_mudar === true,
      modulos: Array.isArray(c.modulos) ? c.modulos.filter((m): m is string => typeof m === "string") : [],
    };
  }
  if (status === 200 && c?.ok === false && typeof c.erro === "string" && RECUSAS_DO_PRINCIPAL.includes(c.erro)) {
    return { ok: false, erro: c.erro, inesperado: false };
  }
  if (status === 401) return { ok: false, erro: "sem_login", inesperado: false };
  return { ok: false, erro: "principal_indisponivel", inesperado: true };
}

export const temTreino = (modulos: readonly string[]): boolean => modulos.includes("treino");
export const registroDeu = (status: number, corpo: unknown): boolean =>
  status === 200 && !!corpo && typeof corpo === "object" && (corpo as { ok?: unknown }).ok === true;

/** O código do Postgres/PostgREST de uma resposta de erro do principal (o campo pg do log), ou null — nunca a mensagem. */
export function pgDaResposta(corpo: unknown): string | null {
  const code = corpo && typeof corpo === "object" ? (corpo as { code?: unknown }).code : null;
  return typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : null;
}

export const STATUS_DO_ERRO_TREINO_ACESSOS: Readonly<Record<string, number>> = {
  dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400,
  sem_login: 401,
  sem_acesso: 403,
  aluno_inexistente: 404, sem_treino: 404,
  metodo: 405,
  sem_modulo: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  principal_indisponivel: 502,
};
export const statusDoErroTreino = (erro: string): number => STATUS_DO_ERRO_TREINO_ACESSOS[erro] ?? 500;
```

- [ ] **Step 4: O verde**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/acessos/treinoAcessosRegras.test.ts 2>&1 | tail -4`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git add supabase/functions/_shared/treino-acessos-regras.ts src/acessos/treinoAcessosRegras.test.ts && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w-a): as regras puras da treino-acessos (o CORS da treino-leitura, a forma, o nível das séries, a resposta do principal, o status)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase/functions/_shared/treino-acessos-regras.ts src/acessos/treinoAcessosRegras.test.ts
```

---

### Task 5: As listas das funções e a guarda de fonte (o vermelho)

**Files:** Modify `src/lib/logsDasFuncoesPrincipal.test.ts`, `src/lib/logsDasFuncoesTreino.test.ts` (pontos de encontro com a hml-21a: só acréscimo).
**Estimativa:** 20 min (calibrado 11–13).

- [ ] **Step 1: O principal** — em `src/lib/logsDasFuncoesPrincipal.test.ts`:
  - no fim do `FUNCOES` (depois de `"mp-contas-renovar", // W2 Task 11: …`):
    ```ts
      "acessos", // W-A P2: a aba Acessos do Painel › Aluno, pela porta-pessoa
      "aluno-dia", // W-A P2: as rotinas e a dieta livre (o app do aluno e o painel), pela porta-pessoa
    ```
  - o `PESSOA` e o comentário dele:
    ```ts
    /** hml-19a: as do jeito 2 que gravam como a pessoa — servirComoPessoa, da _shared/porta-pessoa.ts (hml-19d: + a financeiro; W-A P2: + a
     *  acessos e a aluno-dia). */
    const PESSOA = ["nutricao", "financeiro", "acessos", "aluno-dia"];
    ```
  - no teste do fecho, depois de `expect(todos).toContain("_shared/financeiro-gravar-regras.ts");`:
    ```ts
        // W-A P2: as regras das 2 da W-A e os módulos da aluno-dia passam pelas mesmas guardas
        for (const s of ["acessos-regras", "aluno-dia-regras"]) expect(todos).toContain(`_shared/${s}.ts`);
        for (const m of ["comum", "rotinas", "dieta", "profissional"]) expect(todos).toContain(`aluno-dia/${m}.ts`);
    ```
  - no FIM do arquivo:
    ```ts
    describe("W-A P2 (spec §5.2, §5.6): acessos e aluno-dia COMO A PESSOA — 1 .rpc( (a RPC sai das regras); nada de tabela, Storage, cliente próprio nem chave", () => {
      const DA_FUNCAO: Record<string, string[]> = {
        acessos: ["acessos/index.ts", "_shared/acessos-regras.ts"],
        "aluno-dia": ["aluno-dia/index.ts", "aluno-dia/comum.ts", "aluno-dia/rotinas.ts", "aluno-dia/dieta.ts", "aluno-dia/profissional.ts", "_shared/aluno-dia-regras.ts"],
      };
      /** sem as linhas de comentário (as que começam com //, /* ou *) */
      const semComentario = (t: string) => t.split("\n").map((l) => (/^\s*(\/\/|\/\*|\*)/.test(l) ? "" : l)).join("\n");

      it.each(Object.keys(DA_FUNCAO))("%s", (f) => {
        const fontes = DA_FUNCAO[f].map((rel) => ({ rel, t: semComentario(ler(rel)) }));
        for (const { rel, t } of fontes) {
          expect(t, rel).not.toMatch(/(?<!\bArray)\.from\s*\(|\.storage\b|createClient\s*\(|SERVICE_ROLE|service_role|Deno\.env/);
        }
        expect(fontes.reduce((n, { t }) => n + (t.match(/\.rpc\s*\(/g) ?? []).length, 0), f).toBe(1);
        expect(arquivosDa(f), f).toEqual(expect.arrayContaining(DA_FUNCAO[f]));
      });

      it("decisão 13: as 2 SEM a opção jwtLeitura da hml-21a — o getUser no Auth em todo pedido, leitura também (a revogação vale na hora)", () => {
        expect(ler("acessos/index.ts")).toContain('servirComoPessoa("acessos", { freio: 120 }, ');
        expect(ler("aluno-dia/index.ts")).toContain('servirComoPessoa("aluno-dia", { freio: 240 }, ');
        for (const f of Object.keys(DA_FUNCAO)) expect(ler(`${f}/index.ts`), f).not.toMatch(/jwtLeitura/);
      });
    });
    ```

- [ ] **Step 2: O Treino** — em `src/lib/logsDasFuncoesTreino.test.ts`:
  - no fim do `PUBLICADAS` (depois de `"delete-my-account",`):
    ```ts
      "treino-acessos", // W-A P2 (nova): a linha "Treino — séries" da aba Acessos, com o login do principal — nasce com o log da hml-10
    ```
  - no `RESPOSTA_DO_CATCH_FINAL`, depois da linha da `delete-my-account`:
    ```ts
      "treino-acessos": 'return json({ ok: false, erro: "erro_interno" }, 500, origin);',
    ```
  - na lista do teste "o leitor segue os imports", depois de `"supabase/functions/_shared/paginas.ts",`:
    ```ts
          // W-A P2: as regras da treino-acessos
          "supabase/functions/_shared/treino-acessos-regras.ts",
    ```
  - no FIM do arquivo (a guarda de fonte — revisão C4, spec §5.6):
    ```ts
    // ───────────────────────── W-A P2: a guarda de fonte da treino-acessos (revisão C4, spec §5.6) ─────────────────────────
    /** Uma gravação pelo supabase-js (na estrutura: comentário e texto não contam). GRAVACOES = a mesma, global, para o matchAll. */
    const GRAVACAO = /\.\s*(update|insert|upsert|delete)\s*\(/;
    const GRAVACOES = new RegExp(GRAVACAO.source, "g");
    const SO_SERIES = /^\{\s*series_travadas\s*:[^,{}]*\}$/;

    describe("W-A P2 (C4, spec §5.6): a treino-acessos grava UMA coisa só — series_travadas do treino_user_id que o principal deu", () => {
      const fonte = ler(indice("treino-acessos"));
      const est = estrutura(fonte);
      const regras = ler(resolve(FUNCOES, "_shared/treino-acessos-regras.ts"));

      it('uma única gravação: .from("physiq_profiles").update({ series_travadas: … }).eq("id", treinoUserId)', () => {
        const todas = [...est.matchAll(GRAVACOES)];
        expect(todas.map((m) => m[1])).toEqual(["update"]);
        const i = todas[0].index ?? 0;
        expect(fonte.slice(Math.max(0, i - 40), i)).toMatch(/\.from\("physiq_profiles"\)\s*$/);
        const abre = i + todas[0][0].length - 1;
        const fim = fechamento(est, abre);
        expect(est.slice(abre + 1, fim - 1).trim()).toMatch(SO_SERIES);
        expect(fonte.slice(fim)).toMatch(/^\s*\.eq\("id", treinoUserId\)/);
        expect(estrutura(regras)).not.toMatch(GRAVACAO);
      });

      it("nada mais: nem .rpc( no Treino, nem Storage; as tabelas são só physiq_identidades e physiq_profiles", () => {
        expect(est).not.toMatch(/\.\s*rpc\s*\(|\.\s*storage\b/);
        expect([...new Set([...fonte.matchAll(/\.from\("([a-z_]+)"\)/g)].map((x) => x[1]))].sort()).toEqual(["physiq_identidades", "physiq_profiles"]);
      });

      it("o principal: só a acessos_ler e a acessos_registrar_series, COMO A PESSOA (o Bearer de quem chama)", () => {
        expect([...new Set([...fonte.matchAll(/rpcDoPrincipal\("([a-z_]+)"/g)].map((x) => x[1]))].sort()).toEqual(["acessos_ler", "acessos_registrar_series"]);
        expect(fonte).toContain("`${PRINCIPAL_URL}/rest/v1/rpc/${nome}`");
        expect(fonte).toContain("Authorization: `Bearer ${token}`");
      });

      it("as chaves: só SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (a automática), PRINCIPAL_URL e PRINCIPAL_ANON_KEY; as regras sem Deno", () => {
        expect([...fonte.matchAll(/Deno\.env\.get\("([A-Z_]+)"\)/g)].map((x) => x[1]).sort())
          .toEqual(["PRINCIPAL_ANON_KEY", "PRINCIPAL_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"]);
        expect(regras).not.toMatch(/\bDeno\./);
      });

      it("controle positivo: o detector acha a 2ª gravação e o update com outra coluna; comentário e texto não contam", () => {
        const duas = 'await admin.from("physiq_profiles").update({ series_travadas: x }).eq("id", t);\nawait admin.from("tb_x").insert({ a: 1 });';
        expect([...estrutura(duas).matchAll(GRAVACOES)].map((m) => m[1])).toEqual(["update", "insert"]);
        const e2 = estrutura('admin.from("physiq_profiles").update({ series_travadas: x, professor_id: y })');
        const [m] = [...e2.matchAll(GRAVACOES)];
        const abre = (m.index ?? 0) + m[0].length - 1;
        expect(e2.slice(abre + 1, fechamento(e2, abre) - 1).trim()).not.toMatch(SO_SERIES);
        expect(estrutura('// .update({ x: 1 })\nconst t = ".insert(";')).not.toMatch(GRAVACAO);
      });
    });
    ```

- [ ] **Step 3: O vermelho** (as funções ainda não existem)

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/lib/logsDasFuncoesPrincipal.test.ts src/lib/logsDasFuncoesTreino.test.ts 2>&1 | tail -8`
Expected: FAIL — `ENOENT … acessos/index.ts` / `aluno-dia/index.ts` no principal; no Treino, "as pastas de supabase/functions são exatamente…" (a
`treino-acessos` na lista sem a pasta) e `ENOENT … treino-acessos/index.ts`. Sem commit ainda (as Tasks 6–8 deixam verde e levam junto).

---

### Task 6: A função `acessos`

**Files:** Create `supabase-principal/functions/acessos/index.ts`.
**Estimativa:** 15 min (calibrado 8–10).

- [ ] **Step 1: A função** — `supabase-principal/functions/acessos/index.ts`:

```ts
// Physiq W-A P2 (jeito 2, 13/10/2026) — acessos (banco principal): a aba Acessos do Painel › Aluno (P4) lê e grava "o que o aluno pode no app"
// — o acesso ao app, o diário com fotos, o envio pelo link e a Dieta (ver | mexer). COMO A PESSOA (_shared/porta-pessoa.ts: o token de quem
// chama, nenhuma chave secreta); a regra de quem lê e de quem muda mora nas RPCs acessos_ler e acessos_salvar (migration
// 20261012200000_wa1_acessos.sql): qualquer profissional do aluno (w14_pode_editar), nunca o aluno. As séries do Treino NÃO passam aqui (a
// treino-acessos, no Banco do Treino). A FORMA (a ação, o aluno, a chave e o nível) é conferida antes (_shared/acessos-regras.ts).
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao: "ler", aluno } ·
// { acao: "salvar", aluno, chave, valor }. 200 → { ok: true, paciente_id, tem_login, modulos, conta_modulos, tem_nutricionista, pode_mudar,
// linhas, mudancas } · 4xx/5xx → { ok: false, erro }. A leitura é sempre `acao: "ler"` (a Guarda dos E2E lê o corpo).
// Log: só código, ação, schema, o campo recusado e o código do Postgres (nunca o nome do aluno). verify_jwt = true. Publicar (vale nos 2 schemas):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions acessos true
// Precisa no banco, no schema do pedido: a migration 20261012200000_wa1_acessos.sql (sem ela, PGRST202 → 500 erro_interno + aviso).
import { json, servirComoPessoa, type ContextoPessoa } from "../_shared/porta-pessoa.ts";
import { chamadaDeAcessos, lerPedidoDeAcessos, statusDoErroAcessos, voltaDosAcessos } from "../_shared/acessos-regras.ts";
import { erroDoBanco } from "../_shared/nutricao-regras.ts";

type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

async function atender(c: ContextoPessoa): Promise<Resposta> {
  const lido = lerPedidoDeAcessos(c.corpo);
  if (!lido.ok) {
    c.log.aviso({ codigo: lido.erro, schema: c.schema, acao: typeof c.corpo.acao === "string" ? c.corpo.acao : null, resultado: lido.campo ?? null });
    return { ok: false, erro: lido.erro };
  }
  const acao = lido.pedido.acao;
  const { rpc, args } = chamadaDeAcessos(lido.pedido);
  const { data, error } = await c.comoPessoa.rpc(rpc, args);
  if (error) {
    // o PostgREST recusou (42501 → sem_acesso; dado ruim → dados_invalidos) ou falhou (PGRST202 sem a migration, tempo → avisa o Weslley)
    const t = erroDoBanco(error);
    if (t.inesperado) c.log.excecao(error, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
    else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof error.code === "string" ? error.code : null });
    return { ok: false, erro: t.erro };
  }
  const v = voltaDosAcessos(data);
  if (v.ok === false) {
    if (v.inesperado) c.log.erro({ codigo: "rpc_inesperada", schema: c.schema, acao });
    else c.log.aviso({ codigo: v.erro, schema: c.schema, acao });
    return { ok: false, erro: v.erro };
  }
  return v;
}

servirComoPessoa("acessos", { freio: 120 }, async (c) => {
  const r = await atender(c);
  return json(r, r.ok ? 200 : statusDoErroAcessos(r.erro), c.origin);
});
```

- [ ] **Step 2: Conferir** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/deno_check.sh acessos` → `Check …/acessos/index.ts` sem erro (só erro NOVO conta: se
  aparecer erro num `_shared` que a função só importa, conferir com `deno_check.sh financeiro` — o mesmo erro lá = herdado, anotar e seguir).

---

### Task 7: A função `aluno-dia`

**Files:** Create `supabase-principal/functions/aluno-dia/{index,comum,rotinas,dieta,profissional}.ts`.
**Estimativa:** 25 min (calibrado 14–16).

- [ ] **Step 1: O comum** — `supabase-principal/functions/aluno-dia/comum.ts`:

```ts
// Physiq W-A P2 — o que os 3 módulos da aluno-dia dividem: chamar a RPC COMO A PESSOA e traduzir a volta (o jsonb { ok, … } da RPC ou o erro do
// PostgREST) em resposta, com o log certo — só código, ação (a gravação, ou ler_<q>), schema, o campo recusado e o código do Postgres; nunca o
// nome de uma rotina ou de um alimento (dado de saúde).
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import { voltaDoAlunoDia, type PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { erroDoBanco } from "../_shared/nutricao-regras.ts";

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

/** O nome da ação no log: a gravação, ou ler_<q> na leitura. */
export const acaoDoLog = (p: Pick<PedidoDoAlunoDia, "acao" | "q">): string => (p.q ? `ler_${p.q}` : p.acao);

/** Recusa esperada (fora da forma): só o código e o nome do campo ao log, como aviso. */
export function recusa(c: ContextoPessoa, acao: string | null, erro: string, campo?: string): Resposta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** A RPC do pedido, como a pessoa: { ok: true, … } como veio · { ok: false, erro } (conhecido → aviso; inesperado → avisa o Weslley). */
export async function chamar(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  const acao = acaoDoLog(p);
  const { data, error } = await c.comoPessoa.rpc(p.rpc, p.args);
  if (error) {
    const t = erroDoBanco(error);
    if (t.inesperado) c.log.excecao(error, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
    else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof error.code === "string" ? error.code : null });
    return { ok: false, erro: t.erro };
  }
  const v = voltaDoAlunoDia(data);
  if (v.ok === false) {
    if (v.inesperado) c.log.erro({ codigo: "rpc_inesperada", schema: c.schema, acao });
    else c.log.aviso({ codigo: v.erro, schema: c.schema, acao });
    return { ok: false, erro: v.erro };
  }
  return v;
}
```

- [ ] **Step 2: Os 3 módulos** (finos de propósito — decisão 4):

`supabase-principal/functions/aluno-dia/rotinas.ts`:
```ts
// Physiq W-A P2 — o módulo das ROTINAS do aluno (o app — P3): ler q=rotinas (minhas_rotinas: as vivas + as feitas do intervalo) · rotina_salvar
// (criar só quem é aluno — inclusive o app sem profissional, P9 — ou mudar qualquer rotina viva dele, as do profissional também — P8b) ·
// rotina_arquivar (apagar = arquivar: o profissional ainda vê) · rotina_marcar (hoje ou ontem de SP, no dia da semana dela; só o aluno marca)
// · rotinas_ordenar. As regras de quem pode moram nas RPCs (migration 20261012210000_wa2_rotinas.sql); a forma, no _shared/aluno-dia-regras.ts.
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import type { PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { chamar, type Resposta } from "./comum.ts";

export function atenderRotinas(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  return chamar(c, p);
}
```

`supabase-principal/functions/aluno-dia/dieta.ts`:
```ts
// Physiq W-A P2 — o módulo da DIETA LIVRE do aluno (o app — P5): ler q=dia (meu_dia: lê mesmo travada e diz se está liberada, por matrícula) ·
// q=biblioteca (meus_alimentos) · q=alimentos (a busca: TACO, os dele, os dos planos dele, as receitas dele) · dia_adicionar · dia_tirar ·
// dia_desfazer · extra_salvar/excluir/marcar · alimento_salvar/excluir · receita_salvar/excluir. Tudo exige a Dieta liberada (a linha "mexer" +
// nutricionista de verdade) da matrícula do dia — a da refeição; na extra, a do plano ativo —, hoje ou ontem: o BANCO decide, nunca o corpo
// (migration 20261012220000_wa3_dieta_livre.sql). Travada no meio → 409 dieta_travada (a tela volta ao "só ver").
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import type { PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { chamar, type Resposta } from "./comum.ts";

export function atenderDieta(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  return chamar(c, p);
}
```

`supabase-principal/functions/aluno-dia/profissional.ts`:
```ts
// Physiq W-A P2 — o módulo do PROFISSIONAL (o painel — P6), pela matrícula da rota: ler q=aluno_rotinas (rotinas_do_aluno: as do aluno + as de
// profissional das matrículas que quem chama vê, com as arquivadas e o histórico) · q=aluno_dia (dia_do_aluno: o dia a dia, só leitura — o
// personal também, Q1) · prof_rotina_salvar (criar na matrícula da rota, com o aviso no sino; mudar só as de profissional DESTA matrícula — a
// do aluno → 409 so_do_aluno; a de outra matrícula → 404) · prof_rotina_arquivar (a mesma trava). Quem pode: w14_pode_editar (as RPCs da wa2/wa3).
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import type { PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { chamar, type Resposta } from "./comum.ts";

export function atenderProfissional(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  return chamar(c, p);
}
```

- [ ] **Step 3: O index** — `supabase-principal/functions/aluno-dia/index.ts`:

```ts
// Physiq W-A P2 (jeito 2, 13/10/2026) — aluno-dia (banco principal): as ROTINAS (creatina, remédio, hábito…, com lembrete) e a DIETA LIVRE (o
// dia do aluno com a Dieta "Pode mexer") — o app do aluno (P3, P5) e o painel do profissional (P6). COMO A PESSOA (_shared/porta-pessoa.ts: o
// token de quem chama, nenhuma chave secreta): as RPCs das migrations 20261012210000_wa2_rotinas e 20261012220000_wa3_dieta_livre decidem quem
// pode (o dono e a matrícula saem do token e do banco, nunca do corpo); a FORMA é conferida antes (_shared/aluno-dia-regras.ts). Módulos por
// área: rotinas.ts (as do aluno), dieta.ts (a dieta livre), profissional.ts (o painel); comum.ts (a chamada e o log).
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao: "ler", q, … } (q = rotinas
// { de, ate } · dia { dia } · biblioteca · alimentos { termo, pagina } · aluno_rotinas { aluno, de, ate } · aluno_dia { aluno, de, ate }) ou
// { acao: <gravação>, … } (rotina_salvar { id?, dados } · rotina_arquivar { id } · rotina_marcar { id, dia, feita } · rotinas_ordenar { ids } ·
// dia_adicionar { dia, dados } · dia_tirar { dia, item } · dia_desfazer { id } · extra_salvar { id?, dados } · extra_excluir { id } ·
// extra_marcar { id, feita } · alimento_salvar { id?, dados } · alimento_excluir { id } · receita_salvar { id?, dados } · receita_excluir { id }
// · prof_rotina_salvar { aluno, id?, dados } · prof_rotina_arquivar { aluno, id }). 200 → { ok: true, … } (o jsonb da RPC) · 4xx/5xx → { ok:
// false, erro }. Toda leitura é `acao: "ler"` (a Guarda dos E2E lê o corpo). Log: nunca o nome de uma rotina ou de um alimento.
// verify_jwt = true. Publicar (vale nos 2 schemas): scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions aluno-dia true
// Precisa no banco, no schema do pedido: as migrations 20261012200000_wa1_acessos, 20261012210000_wa2_rotinas e 20261012220000_wa3_dieta_livre.
import { json, servirComoPessoa } from "../_shared/porta-pessoa.ts";
import { pedidoDoAlunoDia, statusDoErroAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { recusa, type Resposta } from "./comum.ts";
import { atenderDieta } from "./dieta.ts";
import { atenderProfissional } from "./profissional.ts";
import { atenderRotinas } from "./rotinas.ts";

servirComoPessoa("aluno-dia", { freio: 240 }, async (c) => {
  const lido = pedidoDoAlunoDia(c.corpo);
  let r: Resposta;
  if (!lido.ok) {
    const acao = c.corpo.acao === "ler" && typeof c.corpo.q === "string" ? `ler_${c.corpo.q}` : typeof c.corpo.acao === "string" ? c.corpo.acao : null;
    r = recusa(c, acao, lido.erro, lido.campo);
  } else if (lido.pedido.modulo === "rotinas") r = await atenderRotinas(c, lido.pedido);
  else if (lido.pedido.modulo === "dieta") r = await atenderDieta(c, lido.pedido);
  else r = await atenderProfissional(c, lido.pedido);
  return json(r, r.ok ? 200 : statusDoErroAlunoDia(r.erro), c.origin);
});
```

- [ ] **Step 4: Conferir** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/deno_check.sh aluno-dia` → sem erro novo. Depois:
  `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/lib/logsDasFuncoesPrincipal.test.ts 2>&1 | tail -4` → **PASS** (o principal verde; o Treino
  segue vermelho até a Task 8).

---

### Task 8: A função `treino-acessos` (Banco do Treino)

**Files:** Create `supabase/functions/treino-acessos/index.ts`.
**Estimativa:** 35 min (calibrado 19–23).

- [ ] **Step 1: A função** — `supabase/functions/treino-acessos/index.ts`:

```ts
// Physiq W-A P2 (13/10/2026) — treino-acessos (Banco do Treino): a linha "Treino — séries" da aba Acessos do Painel › Aluno (P4) LÊ e MUDA o
// cadeado das séries do aluno (physiq_profiles.series_travadas — a verdade continua no Treino: o app lê pelo PowerSync e o APK velho do
// profissional segue mudando pela admin-semana-treinos › setConfig). Chamada com o token do PRINCIPAL: a nutricionista e o dono sem papel de
// personal não têm sessão no Treino (spec W-A §2.2-4; P4: qualquer profissional do aluno muda).
// POST, headers: Authorization: Bearer <access_token do PRINCIPAL> · x-schema: public|staging. Corpo: { acao: "ler", aluno } ·
// { acao: "salvar", aluno, valor: "ver" | "mexer" } (aluno = o id da rota: a matrícula ou o id do Treino; o campo é `acao`, como nas outras 2 da
// W-A — não o `action` da treino-leitura). 200 → { ok: true, series, pode_mudar } · { ok: true, series, registrado } · 4xx/5xx → { ok: false,
// erro }: 400 dados_invalidos/acao_invalida/schema_invalido · 401 sem_login · 403 sem_acesso · 404 aluno_inexistente/sem_treino · 405 metodo ·
// 409 sem_modulo · 413 corpo_grande · 429 muitas_acoes · 500 erro_interno · 502 principal_indisponivel.
// Os 6 passos (spec §5.2; revisão C4 — os passos 3 e 4 da treino-leitura):
//   1. quem chama: GET /auth/v1/user no principal (assinatura, validade e revogação conferidas lá);
//   2. o principal decide, COMO A PESSOA: acessos_ler (quem lê — w14_matricula_da_rota — e quem muda — w14_pode_editar; o login, a conta, o
//      treino_user_id guardado e os módulos da matrícula); sem o módulo Treino → 409 sem_modulo;
//   3. o usuário do Treino: o guardado na matrícula ou o vínculo physiq_identidades pelo login (sem os 2 → 404 sem_treino);
//   4. a trava por conta: treinoVisivelPelaConta(a conta da matrícula, a do physiq_profiles) — o mesmo login em 2 contas: a conta B NÃO lê nem
//      muda o Treino da conta A (403 sem_acesso);
//   5. lê ou grava SÓ series_travadas daquele treino_user_id, com a chave AUTOMÁTICA do projeto (a única escrita da função — a guarda de fonte do
//      src/lib/logsDasFuncoesTreino.test.ts confere);
//   6. o histórico no principal, como a pessoa: acessos_registrar_series (falhou → registrado: false + log.erro; a gravação vale).
// Prazo de 20 s no pedido inteiro (buscarComTempo em toda ida); freio no isolate por IP (antes do token) e por pessoa. Log em JSON
// (_shared/log.ts): só código, ação, schema, status e o código do Postgres — nunca o corpo do principal nem o nome do aluno.
// verify_jwt = false (o token é do outro banco). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions treino-acessos false
// Segredos: PRINCIPAL_URL, PRINCIPAL_ANON_KEY (os mesmos da treino-leitura e da trocar-token) + os automáticos do Supabase. Precisa no principal,
// no schema do pedido: a migration 20261012200000_wa1_acessos.sql (sem ela: 502 principal_indisponivel + log.erro).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { treinoVisivelPelaConta } from "../_shared/espelho/regras.ts";
import { criarLog } from "../_shared/log.ts";
import { ORCAMENTO_MS, TEMPO_MS, buscarComTempo, prazo, tempoEsgotado, type Prazo } from "../_shared/tempo.ts";
import {
  FREIO, LIMITE_CORPO, argsDoLer, argsDoRegistro, corsTreinoAcessos, lerPedidoTreinoAcessos, nivelDasSeries, pgDaResposta, registroDeu,
  respostaDoAcessosLer, schemaDoPedido, statusDoErroTreino, temTreino, travadasDoNivel,
} from "../_shared/treino-acessos-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRINCIPAL_URL = (Deno.env.get("PRINCIPAL_URL") || "").replace(/\/+$/, "");
const PRINCIPAL_ANON_KEY = Deno.env.get("PRINCIPAL_ANON_KEY") || "";
const log = criarLog("treino-acessos", { avisar: avisarErro });

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsTreinoAcessos(origin) } });
const erro = (codigo: string, origin: string | null) => json({ ok: false, erro: codigo }, statusDoErroTreino(codigo), origin);

// freio no isolate: por IP antes de validar o token e por pessoa depois (a aba lê 1 vez e muda pouco)
const janelas = new Map<string, number[]>();
function freio(chave: string, max: number, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) {
    janelas.set(chave, validos);
    return false;
  }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

/** O corpo JSON lido até o limite (acima → null: 413); JSON ruim → {} (a forma recusa com acao_invalida). */
async function lerCorpo(req: Request): Promise<unknown | null> {
  const declarado = Number(req.headers.get("content-length") || 0);
  if (declarado > LIMITE_CORPO) return null;
  const bruto = await req.text();
  if (bruto.length > LIMITE_CORPO) return null;
  try {
    return JSON.parse(bruto || "{}");
  } catch {
    return {};
  }
}

/** O tempo vale até ler o corpo: estourou no meio dele, lança (o catch responde 500) — nunca vira "sem corpo". */
function semCorpo(e: unknown): null {
  if (tempoEsgotado(e)) throw e;
  return null;
}

async function usuarioDoPrincipal(token: string, p: Prazo): Promise<{ id: string | null; status: number }> {
  const r = await buscarComTempo(`${PRINCIPAL_URL}/auth/v1/user`, { headers: { apikey: PRINCIPAL_ANON_KEY, Authorization: `Bearer ${token}` } },
    Math.min(TEMPO_MS.gotruePrincipal, p.restante()));
  if (r.status === 200) {
    const u = await r.json().catch(semCorpo);
    return { id: typeof u?.id === "string" ? u.id : null, status: 200 };
  }
  await r.body?.cancel();
  return { id: null, status: r.status };
}

/** Uma RPC do principal COMO A PESSOA (o token de quem chama, no schema do pedido): o status e o corpo (nunca vai ao log). */
async function rpcDoPrincipal(
  nome: "acessos_ler" | "acessos_registrar_series", token: string, schema: string, args: Record<string, unknown>, p: Prazo,
): Promise<{ status: number; corpo: unknown }> {
  const r = await buscarComTempo(`${PRINCIPAL_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: PRINCIPAL_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Profile": schema, "Accept-Profile": schema },
    body: JSON.stringify(args),
  }, Math.min(TEMPO_MS.principal, p.restante()));
  return { status: r.status, corpo: await r.json().catch(semCorpo) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsTreinoAcessos(origin) });
  if (req.method !== "POST") return erro("metodo", origin);
  const schema = schemaDoPedido(req.headers.get("x-schema"));
  let acao: string | null = null;
  try {
    if (!PRINCIPAL_URL || !PRINCIPAL_ANON_KEY) {
      log.erro({ codigo: "sem_configuracao", schema });
      return erro("erro_interno", origin);
    }
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";
    if (!freio(`ip:${ip}`, FREIO.porIp)) return erro("muitas_acoes", origin);
    if (!schema) return erro("schema_invalido", origin);
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || auth.length < 20) return erro("sem_login", origin);
    const token = auth.slice(7).trim();
    const corpo = await lerCorpo(req);
    if (corpo === null) return erro("corpo_grande", origin);
    const lido = lerPedidoTreinoAcessos(corpo);
    if (!lido.ok) {
      log.aviso({ codigo: lido.erro, schema, resultado: lido.campo ?? null });
      return erro(lido.erro, origin);
    }
    const pedido = lido.pedido;
    acao = pedido.acao;
    const p = prazo(ORCAMENTO_MS.usuario);

    // 1. quem chama: o login do principal
    const u = await usuarioDoPrincipal(token, p);
    if (!u.id) {
      if (u.status >= 500) log.aviso({ codigo: "principal_indisponivel", schema, acao, status: u.status });
      return erro(u.status >= 500 ? "principal_indisponivel" : "sem_login", origin);
    }
    if (!freio(`u:${u.id}`, FREIO.porPessoa)) {
      log.aviso({ codigo: "muitas_acoes", schema, acao, ref: u.id });
      return erro("muitas_acoes", origin);
    }

    // 2. o principal decide, como a pessoa (quem lê, quem muda, o login, a conta, o id do Treino guardado e os módulos)
    const lidoNoPrincipal = await rpcDoPrincipal("acessos_ler", token, schema, argsDoLer(pedido.aluno), p);
    const a = respostaDoAcessosLer(lidoNoPrincipal.status, lidoNoPrincipal.corpo);
    if (a.ok === false) {
      const campos = { codigo: a.erro, schema, acao, status: lidoNoPrincipal.status, pg: pgDaResposta(lidoNoPrincipal.corpo) };
      if (a.inesperado) log.erro(campos);
      else log.aviso(campos);
      return erro(a.erro, origin);
    }
    if (!temTreino(a.modulos)) {
      log.aviso({ codigo: "sem_modulo", schema, acao });
      return erro("sem_modulo", origin);
    }
    if (pedido.acao === "salvar" && !a.podeMudar) {
      log.aviso({ codigo: "sem_acesso", schema, acao, resultado: "nao_pode_mudar" });
      return erro("sem_acesso", origin);
    }

    // 3. o usuário do Treino: o guardado na matrícula ou o vínculo de identidade (a chave automática, no schema do pedido)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      db: { schema: schema as "public" },
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (entrada: string | URL | Request, init?: RequestInit) =>
          buscarComTempo(entrada, init ?? {}, Math.max(1, Math.min(TEMPO_MS.treino, p.restante()))),
      },
    });
    let treinoUserId = a.treinoUserId;
    if (!treinoUserId && a.userId) {
      const { data: v, error: ev } = await admin.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", a.userId).maybeSingle();
      if (ev) throw ev;
      treinoUserId = (v as { treino_user_id?: string | null } | null)?.treino_user_id ?? null;
    }
    if (!treinoUserId) {
      log.aviso({ codigo: "sem_treino", schema, acao });
      return erro("sem_treino", origin);
    }

    // 4. a trava por conta (o mesmo login em 2 contas — revisão C4): perfil do Treino sem conta = o treino do próprio aluno (mostra)
    const { data: pf, error: epf } = await admin.from("physiq_profiles").select("conta_id, series_travadas").eq("id", treinoUserId).maybeSingle();
    if (epf) throw epf;
    const perfil = pf as { conta_id?: string | null; series_travadas?: boolean | null } | null;
    if (!perfil) {
      log.aviso({ codigo: "sem_treino", schema, acao, resultado: "sem_perfil" });
      return erro("sem_treino", origin);
    }
    if (!treinoVisivelPelaConta(a.contaId, perfil.conta_id ?? null)) {
      log.aviso({ codigo: "sem_acesso", schema, acao, resultado: "outra_conta" });
      return erro("sem_acesso", origin);
    }
    const atual = nivelDasSeries(perfil.series_travadas);
    if (pedido.acao === "ler") return json({ ok: true, series: atual, pode_mudar: a.podeMudar }, 200, origin);

    // 5. a ÚNICA gravação: series_travadas daquele treino_user_id (sem mudança, nada grava nem registra)
    if (pedido.valor === atual) return json({ ok: true, series: atual, registrado: false }, 200, origin);
    const { data: gravado, error: eg } = await admin.from("physiq_profiles").update({ series_travadas: travadasDoNivel(pedido.valor) }).eq("id", treinoUserId)
      .select("series_travadas").maybeSingle();
    if (eg) throw eg;
    if (!gravado) {
      log.aviso({ codigo: "sem_treino", schema, acao, resultado: "sem_perfil" });
      return erro("sem_treino", origin);
    }
    const series = nivelDasSeries((gravado as { series_travadas?: boolean | null }).series_travadas);

    // 6. o histórico no principal, como a pessoa (falhou → registrado: false + log.erro; a gravação vale)
    const reg = await rpcDoPrincipal("acessos_registrar_series", token, schema, argsDoRegistro(pedido.aluno, atual, series), p).catch(() => null);
    const registrado = reg !== null && registroDeu(reg.status, reg.corpo);
    if (!registrado) log.erro({ codigo: "registro_series_falhou", schema, acao, status: reg?.status ?? 0, pg: reg ? pgDaResposta(reg.corpo) : null });
    log.info({ codigo: "series_mudadas", schema, acao, resultado: series });
    return json({ ok: true, series, registrado }, 200, origin);
  } catch (e) {
    log.excecao(e, { acao, schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
```

- [ ] **Step 2: O verde das listas + o `deno check`**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/deno_check.sh treino-leitura treino-acessos && bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/lib/logsDasFuncoesPrincipal.test.ts src/lib/logsDasFuncoesTreino.test.ts src/lib/tempoFuncoes.test.ts src/lib/logServidor.test.ts 2>&1 | tail -5`
Expected: o `deno check` da `treino-acessos` sem erro NOVO (a `treino-leitura` é a linha de base: o que der lá e der igual aqui é herdado); os 4
testes PASS — no Treino, a `treino-acessos` passa pelas guardas da hml-10 (log com o próprio nome, nenhum console, o catch final com
`log.excecao(e` e a resposta da lista) e pela guarda de fonte nova (5 casos).

- [ ] **Step 3: O `checar-funcoes` (R1–R4) nas 3 pastas novas**

Run: `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P node scripts/ci/checar-funcoes.mjs | tail -3`
Expected: sem achado novo (nenhum `{ data } =` sem `error`, nenhuma gravação solta, nenhum `fetch(` sem `signal`, nenhum `.limit` > 1000).

- [ ] **Step 4: Commit (as 3 funções + as listas)**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git add supabase-principal/functions/acessos/index.ts supabase-principal/functions/aluno-dia/index.ts supabase-principal/functions/aluno-dia/comum.ts supabase-principal/functions/aluno-dia/rotinas.ts supabase-principal/functions/aluno-dia/dieta.ts supabase-principal/functions/aluno-dia/profissional.ts supabase/functions/treino-acessos/index.ts src/lib/logsDasFuncoesPrincipal.test.ts src/lib/logsDasFuncoesTreino.test.ts && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w-a): as funções acessos e aluno-dia (como a pessoa) e treino-acessos (Treino, com o vínculo e a trava por conta) + as listas e a guarda de fonte" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/acessos/index.ts supabase-principal/functions/aluno-dia/index.ts supabase-principal/functions/aluno-dia/comum.ts supabase-principal/functions/aluno-dia/rotinas.ts supabase-principal/functions/aluno-dia/dieta.ts supabase-principal/functions/aluno-dia/profissional.ts supabase/functions/treino-acessos/index.ts src/lib/logsDasFuncoesPrincipal.test.ts src/lib/logsDasFuncoesTreino.test.ts
```

---

### Task 9: A guarda `src/aluno-dia/semBancoDireto.test.ts` (o vermelho)

**Files:** Create `src/aluno-dia/semBancoDireto.test.ts`.
**Estimativa:** 10 min (calibrado 6–7).

- [ ] **Step 1: A guarda** — `src/aluno-dia/semBancoDireto.test.ts`:

```ts
// Physiq W-A P2 (spec §5.6) — a guarda do FRONT da W-A: nas pastas e nos arquivos da W-A (os desta parte e os que as partes P3–P6 vão criar — o
// que ainda não existe fica de fora até nascer), nenhum acesso direto ao banco: `.from(` de tabela, `.rpc(` e `.storage`. Tudo passa pelas
// funções (acessos, aluno-dia, treino-acessos). O leitor sem comentários é o da guarda de CI (scripts/ci/checar-funcoes.mjs) e o detector de
// tabela é o da hml-20 (src/nutricao/semLeituraDireta.test.ts): o `Array.from(` não conta. Os testes ficam de fora. A guarda da hml-21a
// (src/integrations/semBancoNoNavegador.test.ts, da LINUX 1) cobre o src/ inteiro; esta é a da W-A, por pasta, com as partes que vêm.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// o mesmo leitor sem comentários da guarda de CI
import { semComentarios } from "../../scripts/ci/checar-funcoes.mjs";

const RAIZ = resolve(__dirname, "../..");
/** As pastas e os arquivos do front da W-A (spec §5.3 e §6), por parte. */
export const DA_W_A: Readonly<Record<string, readonly string[]>> = {
  P2: ["src/acessos", "src/aluno-dia"],
  P3: ["src/rotinas", "src/app-aluno/inicio/CardRotinasHoje.tsx", "src/app-aluno/perfil/Rotinas.tsx", "src/ui/avisos/LembreteDasRotinas.tsx"],
  P4: ["src/painel/aluno/abas/Acessos.tsx", "src/painel/aluno/acessos"],
  P5: ["src/dieta-livre"],
  P6: ["src/painel/aluno/resumo/CardRotinas.tsx", "src/painel/aluno/rotinas", "src/painel/aluno/diaADia"],
};
/** Os arquivos da P2 (fora os testes): a guarda não passa por não achar arquivo. */
const DA_P2 = ["src/acessos/api.ts", "src/acessos/tipos.ts", "src/aluno-dia/api.ts", "src/aluno-dia/regras.ts", "src/aluno-dia/tipos.ts"];

const FROM_DE_TABELA = /(?<!\bArray)(?<!storage\s*)\.from\s*\(/g;
const QUALQUER_RPC = /\.rpc\s*(?:<[^()]*?>)?\s*\(/g;
const STORAGE = /\.storage\b/g;
const ehTeste = (f: string) => /\.(test|spec)\.(ts|tsx)$/.test(f);

/** Os .ts/.tsx (fora os testes) de uma pasta, ou o próprio arquivo; [] se ainda não existe. */
function arquivos(alvo: string): string[] {
  const abs = resolve(RAIZ, alvo);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return /\.(ts|tsx)$/.test(alvo) && !ehTeste(alvo) ? [alvo] : [];
  return (readdirSync(abs, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f) && !ehTeste(f))
    .map((f) => relative(RAIZ, join(abs, f)).replace(/\\/g, "/"))
    .sort();
}

/** Cada acesso direto ao banco no texto sem comentários: "<linha>: from|rpc|storage". */
export function acessosDiretos(fonte: string): string[] {
  const t = semComentarios(fonte);
  const linha = (i: number) => t.slice(0, i).split("\n").length;
  return [
    ...[...t.matchAll(FROM_DE_TABELA)].map((m) => `${linha(m.index ?? 0)}: from`),
    ...[...t.matchAll(QUALQUER_RPC)].map((m) => `${linha(m.index ?? 0)}: rpc`),
    ...[...t.matchAll(STORAGE)].map((m) => `${linha(m.index ?? 0)}: storage`),
  ].sort();
}

const TODOS = [...new Set(Object.values(DA_W_A).flat().flatMap(arquivos))].sort();

describe("W-A P2: a guarda do front da W-A — só as funções, nunca o banco direto", () => {
  it("o detector acha o que procura (controle positivo) e não acha o que não é banco", () => {
    expect(acessosDiretos('const { data, error } = await principal.from("rotinas").select("*");')).toEqual(["1: from"]);
    expect(acessosDiretos('await principal.rpc("minhas_rotinas" as never);')).toEqual(["1: rpc"]);
    expect(acessosDiretos('await supabase.rpc<Json>("x", {});')).toEqual(["1: rpc"]);
    expect(acessosDiretos("await principal.storage.from(B).upload(p, f);")).toEqual(["1: storage"]);
    expect(acessosDiretos('const x = Array.from(new Set(ids));\nawait principal.functions.invoke("aluno-dia", { body });')).toEqual([]);
    expect(acessosDiretos('// await principal.from("rotinas").select()\nconst a = 1;')).toEqual([]);
  });

  it("os arquivos da P2 existem e entram na guarda", () => {
    for (const f of DA_P2) expect(TODOS, f).toContain(f);
  });

  it("nenhum .from( de tabela, .rpc( nem .storage em nenhum arquivo da W-A", () => {
    const achados = TODOS.flatMap((f) => acessosDiretos(readFileSync(resolve(RAIZ, f), "utf-8")).map((a) => `${f}:${a}`));
    expect(achados).toEqual([]);
  });

  it("as funções que os clientes da P2 chamam são só as da W-A (acessos, aluno-dia e — pelo fetch do Treino — treino-acessos)", () => {
    const fontes = TODOS.filter((f) => f.startsWith("src/acessos/") || f.startsWith("src/aluno-dia/"))
      .map((f) => readFileSync(resolve(RAIZ, f), "utf-8")).join("\n");
    expect([...new Set([...fontes.matchAll(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/g)].map((m) => m[1]))].sort()).toEqual(["acessos", "aluno-dia"]);
    expect(fontes).toContain("/functions/v1/treino-acessos");
  });
});
```

- [ ] **Step 2: O vermelho** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/aluno-dia/semBancoDireto.test.ts 2>&1 | tail -6` → FAIL nos
  2 últimos casos ("os arquivos da P2 existem…": `src/acessos/api.ts` fora do `TODOS`; "as funções…": lista vazia); o controle positivo PASS.
  Sem commit (vai com a Task 11, que deixa verde).

---

### Task 10: Os clientes da aba Acessos — `src/acessos/{tipos,api}.ts` (TDD)

**Files:** Create `src/acessos/tipos.ts`, `src/acessos/api.ts`, `src/acessos/api.test.ts`.
**Estimativa:** 30 min (calibrado 17–20).

- [ ] **Step 1: O teste** — `src/acessos/api.test.ts`:

```ts
// Physiq W-A P2 — a porta da TELA da aba Acessos (src/acessos/api.ts): a acessos pela principal.functions.invoke (1 chamada, a ação por ÚLTIMO
// no corpo, a frase fixa de cada código, sem internet ANTES de chamar, a rede que cai) e a treino-acessos pelo fetch de 1 tentativa com o token
// do PRINCIPAL e o x-schema (sem sessão → sem_login sem chamar). O cliente falso quebra o teste se alguém falar com o banco direto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn(), sessao: { access_token: "tok-principal-de-teste" } as { access_token: string } | null }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    auth: { getSession: async () => ({ data: { session: h.sessao } }) },
    from: (t: string) => {
      throw new Error(`tabela direta ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
    storage: {
      from: () => {
        throw new Error("Storage direto");
      },
    },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("@/lib/avisoDeErro", () => ({ avisarErro: vi.fn() }));

import { STATUS_DO_ERRO_ACESSOS } from "../../supabase-principal/functions/_shared/acessos-regras";
import { STATUS_DO_ERRO_TREINO_ACESSOS } from "../../supabase/functions/_shared/treino-acessos-regras";
import { ErroAcessos, MENSAGEM_ERRO_ACESSOS, lerAcessos, lerSeries, salvarAcesso, salvarSeries } from "./api";

const ALUNO = "11111111-1111-4111-8111-111111111111";
const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const online = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.invoke.mockReset();
  h.sessao = { access_token: "tok-principal-de-teste" };
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  online(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  online(true);
});

describe("W-A P2: a porta da tela — acessos (principal)", () => {
  it("ler: 1 chamada à acessos com { aluno, acao: 'ler' } (a ação por último) e devolve o que veio", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, paciente_id: ALUNO, pode_mudar: true }, error: null });
    await expect(lerAcessos(ALUNO)).resolves.toMatchObject({ ok: true, paciente_id: ALUNO, pode_mudar: true });
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("acessos", { body: { aluno: ALUNO, acao: "ler" } });
  });

  it("salvar: { aluno, chave, valor, acao: 'salvar' }", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, linhas: { dieta: "mexer" } }, error: null });
    await salvarAcesso(ALUNO, "dieta", "mexer");
    expect(h.invoke).toHaveBeenCalledWith("acessos", { body: { aluno: ALUNO, chave: "dieta", valor: "mexer", acao: "salvar" } });
  });

  it("o erro da função vira ErroAcessos com a FRASE fixa (nunca a mensagem crua); 1 chamada só", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { name: "FunctionsHttpError", context: resposta(409, { ok: false, erro: "sem_nutricao" }) } });
    const e = await salvarAcesso(ALUNO, "dieta", "mexer").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroAcessos);
    expect((e as ErroAcessos).codigo).toBe("sem_nutricao");
    expect((e as ErroAcessos).message).toBe(MENSAGEM_ERRO_ACESSOS.sem_nutricao);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("a rede caiu (FunctionsFetchError, sem corpo) → rede; { ok: false } com 200 → o código; sem internet → sem_internet SEM chamar", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError" } });
    await expect(lerAcessos(ALUNO)).rejects.toMatchObject({ codigo: "rede" });
    h.invoke.mockResolvedValueOnce({ data: { ok: false, erro: "sem_acesso" }, error: null });
    await expect(lerAcessos(ALUNO)).rejects.toMatchObject({ codigo: "sem_acesso" });
    online(false);
    h.invoke.mockClear();
    await expect(lerAcessos(ALUNO)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("toda frase existe: os códigos das 2 funções e os da porta (sem_internet, rede)", () => {
    for (const c of [...Object.keys(STATUS_DO_ERRO_ACESSOS), ...Object.keys(STATUS_DO_ERRO_TREINO_ACESSOS), "sem_internet", "rede"]) {
      expect(MENSAGEM_ERRO_ACESSOS[c], c).toBeTruthy();
    }
  });
});

describe("W-A P2: a porta da tela — treino-acessos (o Treino, com o token do PRINCIPAL)", () => {
  it("ler: 1 POST na treino-acessos com o Bearer do principal, o x-schema e { acao: 'ler', aluno }", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true, series: "ver", pode_mudar: true }));
    await expect(lerSeries(ALUNO)).resolves.toEqual({ ok: true, series: "ver", pode_mudar: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://treino.teste.invalid/functions/v1/treino-acessos");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-principal-de-teste", "x-schema": "staging" });
    expect(JSON.parse(String(init.body))).toEqual({ acao: "ler", aluno: ALUNO });
  });

  it("salvar: { aluno, valor, acao: 'salvar' } → { series, registrado }", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true, series: "mexer", registrado: true }));
    await expect(salvarSeries(ALUNO, "mexer")).resolves.toEqual({ ok: true, series: "mexer", registrado: true });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ aluno: ALUNO, valor: "mexer", acao: "salvar" });
  });

  it("os erros: 403 sem_acesso e 502 principal_indisponivel com o código; corpo ilegível → erro_interno; a rede → rede; 1 tentativa só", async () => {
    fetchMock.mockResolvedValueOnce(resposta(403, { ok: false, erro: "sem_acesso" }));
    await expect(salvarSeries(ALUNO, "ver")).rejects.toMatchObject({ codigo: "sem_acesso" });
    fetchMock.mockResolvedValueOnce(resposta(502, { ok: false, erro: "principal_indisponivel" }));
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "principal_indisponivel" });
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 500 }));
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "erro_interno" });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "rede" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("sem sessão do principal → sem_login sem chamar; sem internet → sem_internet sem chamar", async () => {
    h.sessao = null;
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "sem_login" });
    h.sessao = { access_token: "tok-principal-de-teste" };
    online(false);
    await expect(salvarSeries(ALUNO, "ver")).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: O vermelho** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/acessos/api.test.ts 2>&1 | tail -5` → FAIL (`Failed to resolve import "./api"`).

- [ ] **Step 3: Os tipos** — `src/acessos/tipos.ts`:

```ts
// Physiq W-A P2 — o contrato da aba Acessos (a P4 usa): o que a função acessos (principal) e a treino-acessos (Treino) devolvem. Os níveis e as
// chaves vêm das regras do servidor (uma fonte só).
import type { ChaveDeAcesso } from "../../supabase-principal/functions/_shared/acessos-regras";
import type { NivelDasSeries } from "../../supabase/functions/_shared/treino-acessos-regras";

export type { ChaveDeAcesso, NivelDasSeries };
export type NivelDoApp = "bloqueado" | "liberado";
export type NivelDaDieta = "ver" | "mexer";

export interface LinhasDeAcesso {
  acesso_app: NivelDoApp;
  diario_alimentar: NivelDoApp;
  acesso_link: NivelDoApp;
  dieta: NivelDaDieta;
}

/** A última mudança de uma chave (o "Mudado por <nome> em dd/mm hh:mm" da linha). */
export interface MudancaDeAcesso {
  de: string;
  para: string;
  em: string;
  por_nome: string | null;
}

/** O que a acessos devolve (ler e salvar): a whitelist da função (os ids internos ficam no servidor). */
export interface AcessosDoAluno {
  paciente_id: string;
  tem_login: boolean;
  /** os módulos do ALUNO (a mesma regra do aluno_perfil) */
  modulos: string[];
  /** os módulos da CONTA (as linhas "Só com Treino/Nutrição") */
  conta_modulos: string[];
  /** nutricionista de verdade na matrícula (a linha da Dieta: "Só com nutricionista") */
  tem_nutricionista: boolean;
  pode_mudar: boolean;
  linhas: LinhasDeAcesso;
  mudancas: Partial<Record<ChaveDeAcesso | "treino_series", MudancaDeAcesso>>;
}

export interface SeriesDoAluno {
  series: NivelDasSeries;
  pode_mudar: boolean;
}

export interface SeriesSalvas {
  series: NivelDasSeries;
  /** a mudança entrou no histórico do principal (false: sem mudança, ou o registro falhou — a gravação vale) */
  registrado: boolean;
}
```

- [ ] **Step 4: A porta** — `src/acessos/api.ts`:

```ts
// Physiq W-A P2 — a porta da TELA para a aba Acessos (P4): a função acessos (principal) e a treino-acessos (Treino). O molde do
// src/financeiro/gravar.ts (1 chamada, sem repetir; sem internet → sem_internet ANTES de chamar; a rede que cai → rede; o erro vira
// ErroAcessos(codigo) com a FRASE fixa do código — a mensagem crua do banco nunca chega à tela) e, na treino-acessos, o da treino-leitura
// (src/treino/editor/api.ts: fetch próprio de 1 tentativa até 25 s, com o token do PRINCIPAL — a nutricionista e o dono sem papel não têm
// sessão no Treino). O getSession daqui só LÊ a sessão guardada para levar o token (a hml-21a lista este arquivo no SESSAO_ANTES_DA_FUNCAO da
// src/integrations/semBancoNoNavegador.test.ts). Nada fala com o banco (src/aluno-dia/semBancoDireto.test.ts).
import { principal } from "@/integrations/principal/client";
import { criarFetchResiliente, TEMPO_FUNCAO_MS } from "@/integrations/repeticao";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import type { AcessosDoAluno, ChaveDeAcesso, NivelDasSeries, SeriesDoAluno, SeriesSalvas } from "./tipos";

/** A frase de cada código (os das 2 funções — STATUS_DO_ERRO_ACESSOS e STATUS_DO_ERRO_TREINO_ACESSOS — e os que nascem aqui). */
export const MENSAGEM_ERRO_ACESSOS: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para mudar os acessos deste aluno.",
  nao_encontrado: "Aluno não encontrado.",
  aluno_inexistente: "Aluno não encontrado.",
  dados_invalidos: "Confira os dados e tente de novo.",
  ajuste_invalido: "Confira os dados e tente de novo.",
  acao_invalida: "Esta ação não está disponível. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  metodo: "Esta ação não está disponível. Atualize o app.",
  sem_login_do_aluno: "Ele ainda não tem login: crie o acesso em Login do aluno.",
  sem_nutricao: "Só vale para aluno com nutricionista numa conta com Nutrição.",
  sem_modulo: "Este aluno não tem Treino nesta conta.",
  sem_treino: "Vale depois do 1º acesso do aluno ao app.",
  principal_indisponivel: "Não deu para ler o Treino agora.",
  conflito: "Já existe um registro igual.",
  corpo_grande: "Dados grandes demais para enviar de uma vez.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroAcessos(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_ACESSOS[codigo]) || padrao;
}

/** O erro de uma chamada da aba Acessos: `codigo` = o da função (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroAcessos extends Error {
  readonly codigo: string;
  constructor(codigo: string) {
    super(mensagemErroAcessos(codigo));
    this.name = "ErroAcessos";
    this.codigo = codigo;
  }
}

const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** O corpo da resposta de erro da função ({ ok: false, erro }), quando houver. */
async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** UMA chamada à função acessos; a ação vai por último no corpo (nenhum campo troca a ação). */
async function chamarAcessos<T>(acao: "ler" | "salvar", corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAcessos("sem_internet");
  const { data, error } = await principal.functions.invoke("acessos", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const rede = (error as { name?: unknown })?.name === "FunctionsFetchError";
    throw new ErroAcessos(typeof c?.erro === "string" ? c.erro : rede ? "rede" : "erro_interno");
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroAcessos(typeof d.erro === "string" ? d.erro : "erro_interno");
  return d as T;
}

/** As linhas da aba Acessos de um aluno (o id da rota: a matrícula ou o id do Treino). */
export const lerAcessos = (aluno: string) => chamarAcessos<AcessosDoAluno & { ok: true }>("ler", { aluno });
/** Muda uma linha (acesso_app/diario_alimentar/acesso_link: bloqueado|liberado; dieta: ver|mexer) e devolve a aba inteira de novo. */
export const salvarAcesso = (aluno: string, chave: ChaveDeAcesso, valor: string) =>
  chamarAcessos<AcessosDoAluno & { ok: true }>("salvar", { aluno, chave, valor });

// ───────────────────────── a treino-acessos (Banco do Treino), com o token do PRINCIPAL ─────────────────────────
const URL_TREINO_ACESSOS = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/treino-acessos`;
// 1 tentativa (0 = não repete), até 25 s (o orçamento da função é 20 s) — o molde da treino-leitura
const buscarTreino = criarFetchResiliente(0, TEMPO_FUNCAO_MS, undefined, { banco: "treino" });

async function chamarTreinoAcessos<T>(corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAcessos("sem_internet");
  const { data } = await principal.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErroAcessos("sem_login");
  let r: Response;
  try {
    r = await buscarTreino(URL_TREINO_ACESSOS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-schema": DB_SCHEMA },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroAcessos("rede");
  }
  const c = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.status !== 200 || !c || c.ok !== true) throw new ErroAcessos(typeof c?.erro === "string" ? c.erro : "erro_interno");
  return c as T;
}

/** A linha "Treino — séries": o nível de hoje e se quem chama pode mudar. */
export const lerSeries = (aluno: string) => chamarTreinoAcessos<SeriesDoAluno & { ok: true }>({ acao: "ler", aluno });
/** Muda o cadeado das séries ("ver" = o aluno não põe nem tira séries); a ação vai por último. */
export const salvarSeries = (aluno: string, valor: NivelDasSeries) => chamarTreinoAcessos<SeriesSalvas & { ok: true }>({ aluno, valor, acao: "salvar" });
```

- [ ] **Step 5: O verde** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/acessos/api.test.ts 2>&1 | tail -4` → PASS (9 testes).

- [ ] **Step 6: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git add src/acessos/tipos.ts src/acessos/api.ts src/acessos/api.test.ts && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w-a): a porta da tela da aba Acessos (acessos pela função do principal; treino-acessos pelo fetch do Treino com o token do principal)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/acessos/tipos.ts src/acessos/api.ts src/acessos/api.test.ts
```

---

### Task 11: Os clientes das rotinas e da dieta livre — `src/aluno-dia/{tipos,api,regras}.ts` (TDD)

**Files:** Create `src/aluno-dia/tipos.ts`, `src/aluno-dia/api.ts`, `src/aluno-dia/regras.ts`, `src/aluno-dia/api.test.ts`, `src/aluno-dia/regras.test.ts`.
**Estimativa:** 50 min (calibrado 28–33).

- [ ] **Step 1: Os testes** — `src/aluno-dia/api.test.ts` (o corpo de CADA porta passa nas regras REAIS do servidor):

```ts
// Physiq W-A P2 — a porta da TELA da aluno-dia (src/aluno-dia/api.ts): cada função exportada chama a aluno-dia com a ação certa, 1 vez, e o
// corpo que ela manda PASSA nas regras REAIS do servidor (supabase-principal/functions/_shared/aluno-dia-regras.ts — as mesmas da borda); toda
// leitura é { acao: "ler", q }. Meta-teste: toda função exportada está na tabela. Os negativos: a frase fixa, sem internet, a rede.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    from: (t: string) => {
      throw new Error(`tabela direta ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
  },
}));

import { STATUS_DO_ERRO_ALUNO_DIA, pedidoDoAlunoDia } from "../../supabase-principal/functions/_shared/aluno-dia-regras";
import * as api from "./api";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const HOJE = "2026-10-13";

/** Cada porta: os argumentos de exemplo e a ação (ou ler:<q>) que ela tem de mandar. */
const PORTAS: Record<string, [unknown[], string]> = {
  lerMinhasRotinas: [[HOJE, HOJE], "ler:rotinas"],
  lerMeuDia: [[HOJE], "ler:dia"],
  lerMinhaBiblioteca: [[], "ler:biblioteca"],
  buscarAlimentosDoAluno: [["arroz", 1], "ler:alimentos"],
  lerRotinasDoAluno: [[A, "2026-10-07", HOJE], "ler:aluno_rotinas"],
  lerDiaDoAluno: [[A, "2026-10-07", HOJE], "ler:aluno_dia"],
  salvarRotina: [[null, { nome: "Creatina", tipo: "suplemento", horario: "08:00", lembrete: true }], "rotina_salvar"],
  arquivarRotina: [[A], "rotina_arquivar"],
  marcarRotina: [[A, HOJE, true], "rotina_marcar"],
  ordenarRotinas: [[[A, B]], "rotinas_ordenar"],
  adicionarNoDia: [[HOJE, { refeicao_id: A, alimento_id: B, quantidade_g: 100 }], "dia_adicionar"],
  tirarDoDia: [[HOJE, A], "dia_tirar"],
  desfazerNoDia: [[A], "dia_desfazer"],
  salvarExtra: [[null, { dia: HOJE, nome: "Lanche", horario: "16:00" }], "extra_salvar"],
  excluirExtra: [[A], "extra_excluir"],
  marcarExtra: [[A, false], "extra_marcar"],
  salvarAlimento: [[null, { nome: "Pão", energia_kcal: 280 }], "alimento_salvar"],
  excluirAlimento: [[A], "alimento_excluir"],
  salvarReceita: [[null, { nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: A, quantidade_g: 200 }] }], "receita_salvar"],
  excluirReceita: [[A], "receita_excluir"],
  profSalvarRotina: [[A, null, { nome: "Remédio", tipo: "remedio" }], "prof_rotina_salvar"],
  profArquivarRotina: [[A, B], "prof_rotina_arquivar"],
};

beforeEach(() => {
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("W-A P2: a porta da tela — aluno-dia", () => {
  it.each(Object.entries(PORTAS))("%s: 1 chamada à aluno-dia; o corpo passa nas regras do servidor com a ação certa (a ação por último)", async (nome, [args, esperado]) => {
    const fn = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[nome];
    await fn(...args);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    const [funcao, opcoes] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(funcao).toBe("aluno-dia");
    expect(Object.keys(opcoes.body).slice(-1)[0]).toBe("acao"); // (sem o .at: o tsconfig do app é ES2020)
    const r = pedidoDoAlunoDia(opcoes.body);
    if (!r.ok) throw new Error(`${nome}: o servidor recusaria (${JSON.stringify(r)})`);
    expect(r.pedido.q ? `ler:${r.pedido.q}` : r.pedido.acao).toBe(esperado);
  });

  it("meta: toda função exportada (fora a frase e o erro) está na tabela", () => {
    const exportadas = Object.entries(api).filter(([n, v]) => typeof v === "function" && /^[a-z]/.test(n) && n !== "mensagemErroAlunoDia").map(([n]) => n);
    expect(exportadas.sort()).toEqual(Object.keys(PORTAS).sort());
  });

  it("o erro vira ErroAlunoDia com a frase fixa; a rede → rede; sem internet → sem_internet sem chamar", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "dieta_travada" }), { status: 409 }) } });
    const e = await api.adicionarNoDia(HOJE, { refeicao_id: A, alimento_id: B, quantidade_g: 100 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(api.ErroAlunoDia);
    expect((e as api.ErroAlunoDia).message).toBe(api.MENSAGEM_ERRO_ALUNO_DIA.dieta_travada);
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError" } });
    await expect(api.lerMeuDia(HOJE)).rejects.toMatchObject({ codigo: "rede" });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    h.invoke.mockClear();
    await expect(api.marcarRotina(A, HOJE, true)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("toda frase existe: os códigos da função e os da porta", () => {
    for (const c of [...Object.keys(STATUS_DO_ERRO_ALUNO_DIA), "sem_internet", "rede"]) expect(api.MENSAGEM_ERRO_ALUNO_DIA[c], c).toBeTruthy();
  });
});
```

`src/aluno-dia/regras.test.ts`:

```ts
// Physiq W-A P2 — as regras PURAS do front das rotinas e da dieta livre (src/aluno-dia/regras.ts): as datas de São Paulo, as rotinas de um dia
// (o dia da semana, a ordem da tela, o ✓ daquele dia, sem as arquivadas) e o dia aplicado sobre o plano (riscado, posto, extras; o plano × o
// comido: só as refeições com ✓ e as extras com "Já comi"; item tirado que saiu do plano não conta; outro dia não entra).
import { describe, expect, it } from "vitest";
import type { ItemDaRefeicao, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import { diaAplicado, diaDaSemanaISO, diaGravavel, hojeSP, ontemSP, rotinasDoDia } from "./regras";
import type { ItemDoDia, Rotina } from "./tipos";

const SEG = "2026-10-12"; // segunda-feira (ISO 1)
const AGORA = new Date("2026-10-13T02:30:00Z"); // 23:30 de segunda em São Paulo

const alimento = (id: string, kcal: number) => ({ id, nome: id, fonte: "taco", energia_kcal: kcal, proteina_g: 1, carboidrato_g: 1, lipidio_g: 1, fibra_g: 1, sodio_mg: 0, medidas_caseiras: [] });
const item = (id: string, kcal: number, ordem = 0): ItemDaRefeicao => ({
  id, alimento_id: `al-${id}`, quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, ordem, substitutos: null, observacao: null,
  created_at: "2026-10-01T00:00:00Z", alimento: alimento(`al-${id}`, kcal),
});
const refeicao = (id: string, ordem: number, itens: ItemDaRefeicao[], dias: number[] = []): RefeicaoDoPlano => ({ id, nome: id, horario: null, ordem, observacao: null, dias_semana: dias, itens });
const doDia = (o: Partial<ItemDoDia> & Pick<ItemDoDia, "id" | "tipo">): ItemDoDia => ({
  paciente_id: "p", dia: SEG, refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null, aluno_alimento_id: null, aluno_receita_id: null,
  quantidade_g: 100, porcoes: null, refeicao_nome: null, nome: "x", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0,
  criado_em: "2026-10-12T12:00:00Z", ...o,
});
const rotina = (o: Partial<Rotina> & Pick<Rotina, "id">): Rotina => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "outro", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, ...o,
});

describe("W-A P2: as datas de São Paulo", () => {
  it("23:30 de segunda em SP (02:30Z de terça) ainda é segunda; ontem = domingo; grava só hoje e ontem", () => {
    expect(hojeSP(AGORA)).toBe(SEG);
    expect(ontemSP(AGORA)).toBe("2026-10-11");
    expect([SEG, "2026-10-11", "2026-10-10", "2026-10-13"].map((d) => diaGravavel(d, AGORA))).toEqual([true, true, false, false]);
    expect(diaDaSemanaISO(SEG)).toBe(1);
    expect(diaDaSemanaISO("2026-10-18")).toBe(7);
  });
});

describe("W-A P2: as rotinas de um dia", () => {
  it("as do dia da semana, vivas, na ordem da tela (horário; sem horário por último; ordem), com o ✓ só daquele dia", () => {
    const lista = rotinasDoDia([
      rotina({ id: "noite", horario: "20:00" }),
      rotina({ id: "manha", horario: "08:00", dias_semana: [1], ordem: 1 }),
      rotina({ id: "sem-hora", dias_semana: [1] }),
      rotina({ id: "terca", horario: "07:00", dias_semana: [2] }),
      rotina({ id: "apagada", horario: "06:00", arquivada_em: "2026-10-11T10:00:00Z" }),
    ], [
      { rotina_id: "manha", dia: SEG, feita_em: "2026-10-12T08:05:00Z" },
      { rotina_id: "noite", dia: "2026-10-11", feita_em: "2026-10-11T20:01:00Z" },
    ], SEG);
    expect(lista.map((r) => [r.id, r.feita])).toEqual([["manha", true], ["noite", false], ["sem-hora", false]]);
    expect(lista[0].feita_em).toBe("2026-10-12T08:05:00Z");
  });
});

describe("W-A P2: o dia aplicado sobre o plano", () => {
  const plano = { refeicoes: [
    refeicao("cafe", 1, [item("i1", 124), item("i2", 76, 1)]),
    refeicao("almoco", 2, [item("i3", 159)]),
    refeicao("jantar-de-terca", 3, [item("i4", 300)], [2]),
  ] };
  const meuDia = {
    dia: SEG,
    extras: [
      { id: "e1", paciente_id: "p", nome: "lanche", horario: "16:00", concluida_em: "2026-10-12T16:10:00Z" },
      { id: "e2", paciente_id: "p", nome: "ceia", horario: null, concluida_em: null },
    ],
    itens: [
      doDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: "i2", energia_kcal: 76 }),
      doDia({ id: "a1", tipo: "adicionado", refeicao_id: "cafe", energia_kcal: 80 }),
      doDia({ id: "a2", tipo: "adicionado", refeicao_id: "almoco", energia_kcal: 50 }),
      doDia({ id: "a3", tipo: "adicionado", extra_id: "e1", energia_kcal: 200 }),
      doDia({ id: "a4", tipo: "adicionado", extra_id: "e2", energia_kcal: 999 }),
      doDia({ id: "t2", tipo: "tirado", refeicao_id: null, item_refeicao_id: null, energia_kcal: 500 }),
      doDia({ id: "a5", tipo: "adicionado", refeicao_id: "cafe", energia_kcal: 1000, dia: "2026-10-11" }),
    ],
  };

  it("as refeições do dia (a de terça fica de fora), o item tirado riscado e o que ele pôs em cada refeição e extra", () => {
    const d = diaAplicado(plano, meuDia, new Set(["cafe"]));
    expect(d.refeicoes.map((r) => r.refeicao.id)).toEqual(["cafe", "almoco"]);
    expect(d.refeicoes[0].itens.map((x) => [x.item.id, x.tirado?.id ?? null])).toEqual([["i1", null], ["i2", "t1"]]);
    expect(d.refeicoes[0].adicionados.map((x) => x.id)).toEqual(["a1"]);
    expect(d.refeicoes[1].adicionados.map((x) => x.id)).toEqual(["a2"]);
    expect(d.extras.map((e) => [e.extra.id, e.concluida, e.adicionados.map((x) => x.id)])).toEqual([["e1", true, ["a3"]], ["e2", false, ["a4"]]]);
  });

  it("os totais: o plano = as refeições com alimento do dia; o comido = as com ✓ (sem o tirado, com o posto) + as extras com 'Já comi'", () => {
    const d = diaAplicado(plano, meuDia, new Set(["cafe"]));
    expect(d.totais.plano.energia_kcal).toBe(124 + 76 + 159);
    expect(d.totais.comido.energia_kcal).toBe(124 + 80 + 200);
    const semMarcar = diaAplicado(plano, meuDia, new Set());
    expect(semMarcar.totais.comido.energia_kcal).toBe(200); // só a extra com "Já comi"
    const tudo = diaAplicado(plano, meuDia, new Set(["cafe", "almoco"]));
    expect(tudo.totais.comido.energia_kcal).toBe(124 + 80 + 159 + 50 + 200);
  });

  it("sem plano: só as extras; o plano zerado", () => {
    const d = diaAplicado(null, meuDia, new Set());
    expect(d.refeicoes).toEqual([]);
    expect(d.totais.plano.energia_kcal).toBe(0);
    expect(d.totais.comido.energia_kcal).toBe(200);
  });
});
```

- [ ] **Step 2: O vermelho** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/aluno-dia/api.test.ts src/aluno-dia/regras.test.ts 2>&1 | tail -5`
  → FAIL (`Failed to resolve import "./api"` / `"./regras"`).

- [ ] **Step 3: Os tipos** — `src/aluno-dia/tipos.ts`:

```ts
// Physiq W-A P2 — o contrato das rotinas e da dieta livre (as partes P3, P5 e P6 usam): o que a função aluno-dia devolve — o jsonb das RPCs das
// migrations 20261012210000_wa2_rotinas (wa_rotina_json, minhas_rotinas, rotinas_do_aluno) e 20261012220000_wa3_dieta_livre (meu_dia,
// wa_dia_item_json, meus_alimentos, buscar_alimentos_do_aluno, dia_do_aluno) — e os dados que as gravações aceitam.
export type TipoDeRotina = "suplemento" | "remedio" | "habito" | "outro";

export interface Rotina {
  id: string;
  origem: "aluno" | "profissional";
  /** a matrícula de onde o profissional criou (nula na do aluno) */
  paciente_id: string | null;
  nome: string;
  detalhe: string | null;
  tipo: TipoDeRotina;
  /** "HH:MM" ou null */
  horario: string | null;
  /** 1 = segunda … 7 = domingo */
  dias_semana: number[];
  lembrete: boolean;
  ordem: number;
  criada_em: string;
  alterada_em: string;
  arquivada_em: string | null;
}

export interface RotinaFeita {
  rotina_id: string;
  dia: string;
  feita_em: string;
}

export interface MinhasRotinas {
  hoje: string;
  rotinas: Rotina[];
  feitas: RotinaFeita[];
}

export interface RotinaDoProfissional extends Rotina {
  pode_editar: boolean;
  criada_por_nome: string | null;
  arquivada_pelo_aluno: boolean;
}

export interface EventoDaRotina {
  rotina_id: string;
  quem: "aluno" | "profissional";
  o_que: "criou" | "mudou" | "arquivou";
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  em: string;
  por_nome: string | null;
}

export interface RotinasDoAluno {
  paciente_id: string;
  tem_login: boolean;
  pode_criar: boolean;
  rotinas: RotinaDoProfissional[];
  feitas: RotinaFeita[];
  historico: EventoDaRotina[];
}

export interface DadosDaRotina {
  nome?: string;
  detalhe?: string | null;
  tipo?: TipoDeRotina;
  horario?: string | null;
  dias_semana?: number[];
  lembrete?: boolean;
}

/** Um item do dia (o que ele pôs ou tirou), com o RETRATO: o nome da refeição, o nome e os macros da quantidade. */
export interface ItemDoDia {
  id: string;
  paciente_id: string;
  dia: string;
  tipo: "adicionado" | "tirado";
  refeicao_id: string | null;
  extra_id: string | null;
  item_refeicao_id: string | null;
  alimento_id: string | null;
  aluno_alimento_id: string | null;
  aluno_receita_id: string | null;
  quantidade_g: number | null;
  porcoes: number | null;
  refeicao_nome: string | null;
  nome: string;
  energia_kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidio_g: number;
  fibra_g: number;
  criado_em: string;
}

export interface ExtraDoDia {
  id: string;
  paciente_id?: string;
  /** só no dia_do_aluno (o painel lê vários dias) */
  dia?: string;
  nome: string;
  horario: string | null;
  concluida_em: string | null;
}

export interface MeuDia {
  dia: string;
  hoje: string;
  pode_gravar: boolean;
  matriculas: { paciente_id: string; liberada: boolean }[];
  plano_ativo: { plano_id: string; paciente_id: string } | null;
  extras: ExtraDoDia[];
  itens: ItemDoDia[];
}

export interface MacrosDaPorcao {
  energia_kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidio_g: number;
  fibra_g: number;
}

export interface MeuAlimento extends MacrosDaPorcao {
  id: string;
  nome: string;
  porcao_g: number;
  criado_em: string;
  alterado_em: string;
}

export interface MinhaReceita {
  id: string;
  nome: string;
  porcoes: number;
  por_porcao: MacrosDaPorcao;
  itens: { id: string; alimento_id: string | null; aluno_alimento_id: string | null; nome: string; quantidade_g: number }[];
}

export interface MinhaBiblioteca {
  alimentos: MeuAlimento[];
  receitas: MinhaReceita[];
}

export interface ItemDaBusca extends MacrosDaPorcao {
  tipo: "receita" | "meu" | "plano" | "taco";
  id: string;
  nome: string;
  /** null na receita (os macros são de 1 porção) */
  porcao_g: number | null;
}

export interface BuscaDoAluno {
  itens: ItemDaBusca[];
  pagina: number;
  tem_mais: boolean;
}

export interface DiaDoAluno {
  paciente_id: string;
  nivel: "ver" | "mexer";
  liberada: boolean;
  extras: ExtraDoDia[];
  itens: ItemDoDia[];
}

export interface DadosDoItemDoDia {
  refeicao_id?: string;
  extra_id?: string;
  alimento_id?: string;
  aluno_alimento_id?: string;
  aluno_receita_id?: string;
  quantidade_g?: number;
  porcoes?: number;
}

export interface DadosDaExtra {
  dia?: string;
  nome?: string;
  horario?: string | null;
  ja_comi?: boolean;
}

export interface DadosDoAlimento {
  nome?: string;
  porcao_g?: number;
  energia_kcal?: number;
  proteina_g?: number;
  carboidrato_g?: number;
  lipidio_g?: number;
  fibra_g?: number;
}

export interface DadosDaReceita {
  nome?: string;
  porcoes?: number;
  itens?: ({ alimento_id: string; quantidade_g: number } | { aluno_alimento_id: string; quantidade_g: number })[];
}
```

- [ ] **Step 4: A porta** — `src/aluno-dia/api.ts`:

```ts
// Physiq W-A P2 — a porta da TELA para a função aluno-dia (as rotinas e a dieta livre): o app do aluno (P3, P5) e o painel (P6) chamam daqui. O
// molde do src/financeiro/gravar.ts: 1 chamada só (função não repete — src/integrations/repeticao.ts: na gravação, o servidor pode ter gravado e
// só a resposta se perdido; a leitura também vai 1 vez — o ACOES_DE_LEITURA é da hml-21); sem internet → sem_internet ANTES de chamar; a rede
// que cai (FunctionsFetchError) → rede; o erro vira ErroAlunoDia(codigo) com a FRASE fixa do código. A ação vai por ÚLTIMO no corpo (nenhum
// campo troca a ação); toda leitura é { acao: "ler", q, … }. Nada fala com o banco daqui (src/aluno-dia/semBancoDireto.test.ts).
import { principal } from "@/integrations/principal/client";
import type { AcaoDoAlunoDia, Consulta } from "../../supabase-principal/functions/_shared/aluno-dia-regras";
import type {
  BuscaDoAluno, DadosDaExtra, DadosDaReceita, DadosDaRotina, DadosDoAlimento, DadosDoItemDoDia, DiaDoAluno, ExtraDoDia, ItemDoDia, MeuAlimento,
  MeuDia, MinhaBiblioteca, MinhaReceita, MinhasRotinas, Rotina, RotinasDoAluno,
} from "./tipos";

/** A frase de cada código (STATUS_DO_ERRO_ALUNO_DIA da função e os que nascem aqui). */
export const MENSAGEM_ERRO_ALUNO_DIA: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para fazer isso.",
  nao_encontrado: "Não encontrado: foi apagado ou não é seu.",
  aluno_inexistente: "Aluno não encontrado.",
  dados_invalidos: "Confira os dados e tente de novo.",
  acao_invalida: "Esta ação não está disponível. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  metodo: "Esta ação não está disponível. Atualize o app.",
  dieta_travada: "A sua dieta voltou a ser só para ver.",
  sem_login_do_aluno: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos.",
  so_do_aluno: "Essa rotina foi criada pelo aluno: só ele muda ou apaga.",
  limite: "Chegou ao limite (30 rotinas; 100 itens e 10 refeições extras por dia; 300 alimentos; 100 receitas).",
  conflito: "Já existe um registro igual.",
  corpo_grande: "Dados grandes demais para enviar de uma vez.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroAlunoDia(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_ALUNO_DIA[codigo]) || padrao;
}

/** O erro de uma chamada da aluno-dia: `codigo` = o da função (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroAlunoDia extends Error {
  readonly codigo: string;
  constructor(codigo: string) {
    super(mensagemErroAlunoDia(codigo));
    this.name = "ErroAlunoDia";
    this.codigo = codigo;
  }
}

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** UMA chamada à aluno-dia; a ação vai por último no corpo. */
async function chamar<T>(acao: AcaoDoAlunoDia | "ler", corpo: Record<string, unknown>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroAlunoDia("sem_internet");
  const { data, error } = await principal.functions.invoke("aluno-dia", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const rede = (error as { name?: unknown })?.name === "FunctionsFetchError";
    throw new ErroAlunoDia(typeof c?.erro === "string" ? c.erro : rede ? "rede" : "erro_interno");
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroAlunoDia(typeof d.erro === "string" ? d.erro : "erro_interno");
  return d as T;
}
const ler = <T>(q: Consulta, params: Record<string, unknown> = {}) => chamar<T & { ok: true }>("ler", { ...params, q });

// ───────────────────────── leituras ─────────────────────────
/** As rotinas vivas do aluno + as feitas do intervalo (≤ 31 dias). */
export const lerMinhasRotinas = (de: string, ate: string) => ler<MinhasRotinas>("rotinas", { de, ate });
/** O dia dele (lê mesmo travada: diz se está liberada, por matrícula). */
export const lerMeuDia = (dia: string) => ler<MeuDia>("dia", { dia });
/** Os alimentos e as receitas dele. */
export const lerMinhaBiblioteca = () => ler<MinhaBiblioteca>("biblioteca");
/** A busca do aluno (TACO, os dele, os dos planos dele, as receitas dele): 20 por página. */
export const buscarAlimentosDoAluno = (termo: string, pagina = 0) => ler<BuscaDoAluno>("alimentos", { termo, pagina });
/** O painel: as rotinas do aluno da rota (com as arquivadas e o histórico). */
export const lerRotinasDoAluno = (aluno: string, de: string, ate: string) => ler<RotinasDoAluno>("aluno_rotinas", { aluno, de, ate });
/** O painel: o dia a dia do aluno da rota (só leitura; o personal também). */
export const lerDiaDoAluno = (aluno: string, de: string, ate: string) => ler<DiaDoAluno>("aluno_dia", { aluno, de, ate });

// ───────────────────────── gravações do aluno ─────────────────────────
export const salvarRotina = (id: string | null, dados: DadosDaRotina) => chamar<{ ok: true; rotina: Rotina }>("rotina_salvar", { id, dados });
export const arquivarRotina = (id: string) => chamar<{ ok: true }>("rotina_arquivar", { id });
export const marcarRotina = (id: string, dia: string, feita: boolean) => chamar<{ ok: true; feita: boolean }>("rotina_marcar", { id, dia, feita });
export const ordenarRotinas = (ids: string[]) => chamar<{ ok: true }>("rotinas_ordenar", { ids });
export const adicionarNoDia = (dia: string, dados: DadosDoItemDoDia) => chamar<{ ok: true; item: ItemDoDia }>("dia_adicionar", { dia, dados });
export const tirarDoDia = (dia: string, item: string) => chamar<{ ok: true; item: ItemDoDia }>("dia_tirar", { dia, item });
export const desfazerNoDia = (id: string) => chamar<{ ok: true }>("dia_desfazer", { id });
export const salvarExtra = (id: string | null, dados: DadosDaExtra) => chamar<{ ok: true; extra: ExtraDoDia }>("extra_salvar", { id, dados });
export const excluirExtra = (id: string) => chamar<{ ok: true }>("extra_excluir", { id });
export const marcarExtra = (id: string, feita: boolean) => chamar<{ ok: true; concluida_em: string | null }>("extra_marcar", { id, feita });
export const salvarAlimento = (id: string | null, dados: DadosDoAlimento) => chamar<{ ok: true; alimento: MeuAlimento }>("alimento_salvar", { id, dados });
export const excluirAlimento = (id: string) => chamar<{ ok: true }>("alimento_excluir", { id });
export const salvarReceita = (id: string | null, dados: DadosDaReceita) => chamar<{ ok: true; receita: MinhaReceita }>("receita_salvar", { id, dados });
export const excluirReceita = (id: string) => chamar<{ ok: true }>("receita_excluir", { id });

// ───────────────────────── gravações do profissional (a matrícula da rota) ─────────────────────────
export const profSalvarRotina = (aluno: string, id: string | null, dados: DadosDaRotina) =>
  chamar<{ ok: true; rotina: Rotina }>("prof_rotina_salvar", { aluno, id, dados });
export const profArquivarRotina = (aluno: string, id: string) => chamar<{ ok: true }>("prof_rotina_arquivar", { aluno, id });
```

- [ ] **Step 5: As regras do front** — `src/aluno-dia/regras.ts`:

```ts
// Physiq W-A P2 — regras PURAS do front das rotinas e da dieta livre (as partes P3, P5 e P6 importam daqui): as datas de São Paulo, as rotinas
// de UM dia (as do dia da semana, vivas, na ordem da tela, com o ✓ daquele dia) e o DIA APLICADO sobre o plano (os itens que ele tirou ficam
// riscados, os que ele pôs entram, as refeições extras; os totais "comido × plano": o anel conta o que ele comeu — as refeições com ✓, com o que
// tirou e pôs, e as extras com "Já comi" — contra o plano do dia; spec §2.2-10, §4.4). Sem rede; testado em regras.test.ts.
import { hojeSP, refeicoesDoDia, somarDias } from "@/nutricao/app/dia";
import { macrosDoItem, somarMacros, type Totais } from "@/nutricao/app/dietaUtil";
import { diaDaSemana } from "@/nutricao/app/metasUtil";
import type { Macros } from "@/nutricao/app/numeros";
import { refeicaoMarcavel } from "@/nutricao/app/refeicaoConcluidaUtil";
import type { ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import type { ExtraDoDia, ItemDoDia, MeuDia, Rotina, RotinaFeita } from "./tipos";

export { hojeSP };
/** Ontem em São Paulo (yyyy-mm-dd). */
export const ontemSP = (agora: Date = new Date()): string => somarDias(hojeSP(agora), -1);
/** O dia da semana ISO (1 = segunda … 7 = domingo) — o das rotinas e das metas. */
export const diaDaSemanaISO = (dia: string): number => diaDaSemana(dia);
/** O banco só grava hoje ou ontem de SP (rotina_marcar e a dieta livre): a tela desliga os botões fora disso. */
export const diaGravavel = (dia: string, agora: Date = new Date()): boolean => dia === hojeSP(agora) || dia === ontemSP(agora);

export interface RotinaDoDia extends Rotina {
  feita: boolean;
  feita_em: string | null;
}

/** A ordem da tela = a do banco (minhas_rotinas): o horário (sem horário por último), a ordem, a criação. */
function ordemDaTela(a: Rotina, b: Rotina): number {
  return (a.horario ?? "99:99").localeCompare(b.horario ?? "99:99") || a.ordem - b.ordem || a.criada_em.localeCompare(b.criada_em);
}

/** As rotinas que valem no dia (vivas, com o dia da semana marcado), na ordem da tela, com o ✓ daquele dia. */
export function rotinasDoDia(rotinas: readonly Rotina[], feitas: readonly RotinaFeita[], dia: string): RotinaDoDia[] {
  const dow = diaDaSemana(dia);
  const doDia = new Map(feitas.filter((f) => f.dia === dia).map((f) => [f.rotina_id, f.feita_em]));
  return rotinas
    .filter((r) => !r.arquivada_em && r.dias_semana.includes(dow))
    .map((r) => ({ ...r, feita: doDia.has(r.id), feita_em: doDia.get(r.id) ?? null }))
    .sort(ordemDaTela);
}

export interface ItemDoPlanoNoDia {
  item: ItemDaRefeicao;
  /** o "tirei hoje" daquele item (riscado), ou null */
  tirado: ItemDoDia | null;
}
export interface RefeicaoNoDia {
  refeicao: RefeicaoDoPlano;
  itens: ItemDoPlanoNoDia[];
  adicionados: ItemDoDia[];
  concluida: boolean;
}
export interface ExtraNoDia {
  extra: ExtraDoDia;
  adicionados: ItemDoDia[];
  concluida: boolean;
}
export interface DiaAplicado {
  refeicoes: RefeicaoNoDia[];
  extras: ExtraNoDia[];
  totais: { plano: Totais; comido: Totais };
}

/** Os macros do RETRATO de um item do dia (a quantidade já calculada no banco). */
export const macrosDoRetrato = (i: Pick<ItemDoDia, "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g">): Macros => ({
  energia_kcal: Number(i.energia_kcal) || 0,
  proteina_g: Number(i.proteina_g) || 0,
  carboidrato_g: Number(i.carboidrato_g) || 0,
  lipidio_g: Number(i.lipidio_g) || 0,
  fibra_g: Number(i.fibra_g) || 0,
  sodio_mg: null,
});

/**
 * O dia aplicado sobre o plano: as refeições do plano que valem no dia (refeicoesDoDia), cada item com o "tirado" daquele dia, o que ele pôs em
 * cada refeição, as extras (com o que ele pôs nelas) e os totais. `concluidas` = as refeições do plano com ✓ no dia. O plano = as refeições com
 * alimento (o que dá para marcar — a regra de hoje); o comido = nas refeições com ✓, os itens que ele NÃO tirou + os que pôs; nas extras com
 * "Já comi", o que ele pôs. Item tirado que já saiu do plano (item_refeicao_id nulo) não conta; item de outro dia não entra.
 */
export function diaAplicado(
  plano: Pick<PlanoAlimentar, "refeicoes"> | null,
  meuDia: Pick<MeuDia, "dia" | "extras" | "itens">,
  concluidas: ReadonlySet<string>,
): DiaAplicado {
  const dia = meuDia.dia;
  const vivos = meuDia.itens.filter((i) => i.dia === dia);
  const tiradoPorItem = new Map(vivos.filter((i) => i.tipo === "tirado" && i.item_refeicao_id).map((i) => [i.item_refeicao_id as string, i]));
  const refeicoes: RefeicaoNoDia[] = refeicoesDoDia(plano, dia).map((r) => ({
    refeicao: r,
    itens: r.itens.map((item) => ({ item, tirado: tiradoPorItem.get(item.id) ?? null })),
    adicionados: vivos.filter((i) => i.tipo === "adicionado" && i.refeicao_id === r.id),
    concluida: concluidas.has(r.id),
  }));
  const extras: ExtraNoDia[] = meuDia.extras.map((e) => ({
    extra: e,
    adicionados: vivos.filter((i) => i.tipo === "adicionado" && i.extra_id === e.id),
    concluida: !!e.concluida_em,
  }));
  const planoDoDia = somarMacros(refeicoes.filter((r) => refeicaoMarcavel(r.refeicao)).flatMap((r) => r.refeicao.itens.map(macrosDoItem)));
  const comido = somarMacros([
    ...refeicoes.filter((r) => r.concluida).flatMap((r) => [
      ...r.itens.filter((x) => !x.tirado).map((x) => macrosDoItem(x.item)),
      ...r.adicionados.map(macrosDoRetrato),
    ]),
    ...extras.filter((e) => e.concluida).flatMap((e) => e.adicionados.map(macrosDoRetrato)),
  ]);
  return { refeicoes, extras, totais: { plano: planoDoDia, comido } };
}
```

- [ ] **Step 6: O verde (as 2 provas + a guarda da Task 9)**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/aluno-dia/api.test.ts src/aluno-dia/regras.test.ts src/aluno-dia/semBancoDireto.test.ts src/acessos 2>&1 | tail -5`
Expected: PASS (a `semBancoDireto` agora acha os 5 arquivos da P2, 0 acesso direto, só `acessos`/`aluno-dia` no `invoke` e a URL da
`treino-acessos`). Se a `macrosDoItem` arredondar diferente (2 casas), os totais do teste são inteiros — devem bater exatos.

- [ ] **Step 7: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git add src/aluno-dia/tipos.ts src/aluno-dia/api.ts src/aluno-dia/regras.ts src/aluno-dia/api.test.ts src/aluno-dia/regras.test.ts src/aluno-dia/semBancoDireto.test.ts && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w-a): a porta da tela da aluno-dia, as regras do dia (rotinas de um dia, o dia aplicado sobre o plano) e a guarda semBancoDireto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/aluno-dia/tipos.ts src/aluno-dia/api.ts src/aluno-dia/regras.ts src/aluno-dia/api.test.ts src/aluno-dia/regras.test.ts src/aluno-dia/semBancoDireto.test.ts
```

---

### Task 12: A Guarda dos E2E (`e2e/hml17/_base.py`, `e2e/w26/prod.py`) + `e2e/hml19/guarda_teste.py` (TDD)

**Files:** Modify `e2e/hml19/guarda_teste.py`, `e2e/hml17/_base.py`, `e2e/w26/prod.py` (pontos de encontro com a hml-21a: só acréscimo; quem entra
depois rebaseia juntando as 2 listas).
**Estimativa:** 20 min (calibrado 11–13).

> Desde a Task 8 o `guarda_teste.py` já está vermelho: "as N funções do repo decididas (sem decisão: acessos, aluno-dia, treino-acessos)". Aqui
> entram os casos (que ficam vermelhos também) e depois as listas.

- [ ] **Step 1: Os casos** — em `e2e/hml19/guarda_teste.py`:
  - no docstring, depois da linha "W2 (LINUX 3): a mp-conectar-retorno e a mp-contas-renovar (Mercado Pago do personal) gravam sempre.":
    ```
                          W-A P2 (LINUX 3): as 3 da W-A (acessos e aluno-dia no principal; treino-acessos no Treino) gravam em TODA ação,
                          menos o { acao: "ler" } (o campo que as 3 leem é o `acao` — a do Treino também, não o `action` da treino-leitura).
    ```
    e, no parágrafo da `e2e/w26/prod.py`, no fim: `W-A P2: as 3 da W-A também (o POST grava; o { acao: "ler" } lê).`
  - em `casos_hml17`, no fim da lista `saida = [...]` (depois do caso "revisão: POST em tabela com /functions/v1/nutricao na query…"):
    ```python
        # W-A P2 (LINUX 3): as 3 da W-A — o `ler` passa; toda gravação (do aluno, da Dieta e do profissional) é barrada; o disfarçado, o corpo
        # sem a ação e o ilegível também; a treino-acessos (Treino) lê o campo `acao`
        ("W-A: acessos › ler", g.escrita(Pedido("POST", f"{P}/functions/v1/acessos", {"acao": "ler", "aluno": "x"})), False),
        ("W-A: acessos › salvar (grava)", fn("acessos", "salvar"), True),
        ("W-A: acessos › sem ação", fn("acessos"), True),
        ("W-A: acessos › disfarçado {action: ler, acao: salvar}", g.escrita(Pedido("POST", f"{P}/functions/v1/acessos", {"action": "ler", "acao": "salvar"})), True),
        ("W-A: acessos › OPTIONS (preflight)", fn("acessos", "salvar", "OPTIONS"), False),
        ("W-A: aluno-dia › ler q=rotinas (o app)", g.escrita(Pedido("POST", f"{P}/functions/v1/aluno-dia", {"acao": "ler", "q": "rotinas"})), False),
        ("W-A: aluno-dia › ler q=aluno_dia (o painel)", g.escrita(Pedido("POST", f"{P}/functions/v1/aluno-dia", {"acao": "ler", "q": "aluno_dia"})), False),
        *[(f"W-A: aluno-dia › {a} (grava)", fn("aluno-dia", a), True) for a in (
            "rotina_salvar", "rotina_arquivar", "rotina_marcar", "rotinas_ordenar", "dia_adicionar", "dia_tirar", "dia_desfazer", "extra_salvar",
            "extra_excluir", "extra_marcar", "alimento_salvar", "alimento_excluir", "receita_salvar", "receita_excluir", "prof_rotina_salvar",
            "prof_rotina_arquivar")],
        ("W-A: aluno-dia › {action: ler} (ela lê o campo acao)", g.escrita(Pedido("POST", f"{P}/functions/v1/aluno-dia", {"action": "ler"})), True),
        ("W-A: aluno-dia › corpo ilegível", g.escrita(Pedido("POST", f"{P}/functions/v1/aluno-dia", cru="{acao: ler")), True),
        ("W-A: treino-acessos (Treino) › ler", g.escrita(Pedido("POST", f"{T}/functions/v1/treino-acessos", {"acao": "ler", "aluno": "x"})), False),
        ("W-A: treino-acessos (Treino) › salvar (grava)", fn("treino-acessos", "salvar", host=T), True),
        ("W-A: treino-acessos › {action: ler} (lê o acao, não o action)", g.escrita(Pedido("POST", f"{T}/functions/v1/treino-acessos", {"action": "ler"})), True),
        ("W-A: funcao_grava SEM o corpo: aluno-dia 'ler' segue gravação (só o corpo libera)", b.funcao_grava("aluno-dia", "ler"), True),
        ("W-A: acessos-x (outra função, desconhecida: grava)", fn("acessos-x", "ler"), True),
    ```
  - depois do `saida.append(("W2: as 2 fora das 'conhecidas' …` (antes do `return saida`):
    ```python
    saida.append(("W-A P2: as 3 fora das 'conhecidas', nas que gravam sempre e com o `ler` pelo corpo", all(
        f not in b.FUNCOES_CONHECIDAS and f in b.FUNCOES_QUE_SEMPRE_GRAVAM and b.LEITURAS_PELO_CORPO.get(f) == ("acao", frozenset({"ler"}))
        for f in ("acessos", "aluno-dia", "treino-acessos")), True, ("sim", "não")))
    ```
  - em `casos_w26`, no fim da lista:
    ```python
        # W-A P2: as 3 da W-A são escrita (antes, função desconhecida = leitura aqui); o `ler` delas passa pelo corpo
        ("w26 · W-A: POST acessos", e("POST", f"{P}/functions/v1/acessos"), True),
        ("w26 · W-A: POST acessos {acao: ler}", e("POST", f"{P}/functions/v1/acessos", json.dumps({"acao": "ler", "aluno": "x"})), False),
        ("w26 · W-A: POST acessos {acao: salvar}", e("POST", f"{P}/functions/v1/acessos", json.dumps({"acao": "salvar"})), True),
        ("w26 · W-A: POST aluno-dia {acao: ler, q: dia}", e("POST", f"{P}/functions/v1/aluno-dia", json.dumps({"acao": "ler", "q": "dia"})), False),
        ("w26 · W-A: POST aluno-dia {acao: rotina_marcar}", e("POST", f"{P}/functions/v1/aluno-dia", json.dumps({"acao": "rotina_marcar"})), True),
        ("w26 · W-A: POST aluno-dia disfarçado {action: ler, acao: dia_adicionar}", e("POST", f"{P}/functions/v1/aluno-dia", json.dumps({"action": "ler", "acao": "dia_adicionar"})), True),
        ("w26 · W-A: POST treino-acessos (Treino) {acao: ler}", e("POST", f"{T}/functions/v1/treino-acessos", json.dumps({"acao": "ler"})), False),
        ("w26 · W-A: POST treino-acessos (Treino) {acao: salvar}", e("POST", f"{T}/functions/v1/treino-acessos", json.dumps({"acao": "salvar"})), True),
        ("w26 · W-A: OPTIONS aluno-dia", e("OPTIONS", f"{P}/functions/v1/aluno-dia"), False),
        ("w26 · W-A: POST aluno-dia-x (outra função)", e("POST", f"{P}/functions/v1/aluno-dia-x"), False),
    ```

- [ ] **Step 2: O vermelho**

Run: `cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 python3 e2e/hml19/guarda_teste.py | grep -c "❌"; PYTHONDONTWRITEBYTECODE=1 python3 e2e/hml19/guarda_teste.py | tail -1`
Expected: ❌ nos casos `ler` da W-A (a função desconhecida grava), nos `w26 · W-A: POST acessos`/`{acao: salvar}`/`rotina_marcar`/`disfarçado`/`salvar`
(a w26 trata função desconhecida como leitura), em "as N funções do repo decididas" e em "W-A P2: as 3 fora das 'conhecidas'…".

- [ ] **Step 3: As listas** — em `e2e/hml17/_base.py`:
  - o `FUNCOES_QUE_SEMPRE_GRAVAM` (e o comentário antes dele, no fim: `# W-A P2 (LINUX 3, 13/10): as 3 da W-A — acessos e aluno-dia (principal) e treino-acessos (Treino) — gravam em TODA ação, menos o ler pelo corpo.`):
    ```python
    FUNCOES_QUE_SEMPRE_GRAVAM = {"nutricao", "automaticas-fila", "infinitepay-webhook-aluno", "financeiro", "mp-conectar-retorno",
                                 "mp-contas-renovar", "acessos", "aluno-dia", "treino-acessos"}
    ```
  - o `LEITURAS_PELO_CORPO` (comentário no fim: `# W-A P2: + o { "acao": "ler" } das 3 da W-A (o campo que as 3 leem é o acao).`):
    ```python
    LEITURAS_PELO_CORPO = {"nutricao": ("acao", frozenset({"ler"})), "financeiro": ("acao", frozenset({"ler"})),
                           "admin-avaliacoes": ("action", frozenset({"minha_evolucao"})), "acessos": ("acao", frozenset({"ler"})),
                           "aluno-dia": ("acao", frozenset({"ler"})), "treino-acessos": ("acao", frozenset({"ler"}))}
    ```
  - no docstring da `Guarda`, depois de "W2: a mp-conectar-retorno e a mp-contas-renovar inteiras": `; W-A P2: a acessos, a aluno-dia e a treino-acessos inteiras, menos o \`ler\` pelo corpo`.

  Em `e2e/w26/prod.py`:
  - o comentário antes do `ESCRITA_FUNCAO` ganha no fim: `W-A P2 (LINUX 3): as 3 da W-A também — acessos, aluno-dia e (no Treino) treino-acessos —; o \`ler\` delas passa pelo corpo.`
  - ```python
    ESCRITA_FUNCAO = re.compile(r"/functions/v1/(?:nutricao|financeiro|mp-contas-renovar|acessos|aluno-dia|treino-acessos)(?:[/?#]|$)")
    ```
  - ```python
    LEITURA_FUNCAO = re.compile(r"/functions/v1/(?:nutricao|financeiro|acessos|aluno-dia|treino-acessos)(?:[/?#]|$)")
    ```
  - nos docstrings de `leitura_da_funcao` e `eh_escrita`, "da nutricao/financeiro" → "da nutricao/financeiro e das 3 da W-A".

  (Depois do rebase na 21a — Task 16 — as linhas viram a UNIÃO: `… "mp-contas-renovar", "conta", "acessos", "aluno-dia", "treino-acessos"` e
  `…|mp-contas-renovar|conta|acessos|aluno-dia|treino-acessos)`, `…|financeiro|conta|acessos|aluno-dia|treino-acessos)`.)

- [ ] **Step 4: O verde**

Run: `cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 python3 e2e/hml19/guarda_teste.py | tail -1 && python3 -c "import ast; [ast.parse(open(f).read()) for f in ('e2e/hml17/_base.py', 'e2e/w26/prod.py', 'e2e/hml19/guarda_teste.py')]; print('sintaxe ok')" && git status --short`
Expected: `guarda_teste: 158/158` (os 117 de hoje + 30 da W-A + 1 resumo + 10 da w26 — o número do ensaio), `sintaxe ok`, sem `__pycache__`.

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(guarda): as 3 funções da W-A na Guarda dos E2E (gravam; o ler pelo corpo lê) + os casos no guarda_teste" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/hml17/_base.py e2e/w26/prod.py e2e/hml19/guarda_teste.py
```

---

### Task 13: O falso do Supabase + o `e2e/wa/api.py` inteiro; `--seco` e `--local` (a prova LOCAL das 3 funções)

**Files:** Create `e2e/wa/supabase_falso.py`, `e2e/wa/api.py`; fora do repo: `~/projetos/physiqcalc-scratch/w-a/p2/local.sh`.
**Estimativa:** 90 min (calibrado 50–59).

> **A prova local, como a casa faz (o `--local` da W2):** as 3 funções no Deno de verdade (`e2e/w1/servir_local.ts` troca só a porta do
> `Deno.serve`), com `--allow-net=127.0.0.1` (os imports do esm.sh entram pela lista padrão de imports do Deno 2), contra um FALSO do Supabase
> que confere os NOMES dos parâmetros de cada RPC lendo as próprias migrations (um `p_*` errado = 404 PGRST202, como o PostgREST). Sem rede,
> sem trava do BANCO, a qualquer hora. O que ele prova: a fiação (a forma antes da RPC, a RPC e os `p_*`, o status de cada código, a
> whitelist, o freio, os 413, o log e os 6 passos da `treino-acessos`). O que ele NÃO prova (fica para o staging, Task 17): a regra de verdade
> das RPCs e do RLS — por isso o `api.py` do staging existe.

- [ ] **Step 1: O vermelho** — `cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/supabase_falso.py --autoteste; echo "saída $?"`
  → `can't open file … e2e/wa/supabase_falso.py` e `saída 2`.

- [ ] **Step 2: O falso** — `e2e/wa/supabase_falso.py`:

```python
#!/usr/bin/env python3
"""Physiq W-A P2 — o FALSO do Supabase para a prova LOCAL das 3 funções da W-A (o e2e/wa/api.py --local). Escuta SÓ em 127.0.0.1, em 2 portas
que dividem o mesmo estado:
  principal (--principal)  GET /auth/v1/user — o Bearer da tabela USUARIOS com o apikey CHAVE_PUBLICA → { id }; outro → 401 (o cenário força
                           outro status por token) · POST /rest/v1/rpc/<nome> — só as 25 RPCs da pessoa das 3 migrations da W-A, com os NOMES dos
                           parâmetros LIDOS das próprias migrations (a mais, a menos ou outro nome → 404 PGRST202, como o PostgREST); a resposta
                           é a do cenário (senão a padrão); o schema (Content-Profile) e o usuário do token ficam no pedido.
  treino    (--treino)     GET /rest/v1/physiq_identidades e /rest/v1/physiq_profiles (o filtro eq. do PostgREST; o cenário) e PATCH
                           /rest/v1/physiq_profiles?id=eq.<id> (grava no cenário) — só com o Bearer e o apikey da CHAVE_SERVICO_TREINO.
Controle (nas 2): GET /_pedidos (tudo o que chegou desde o último zerar, inclusive rota desconhecida) · POST /_cenario (as chaves que vierem
trocam as de antes; "rpc" junta) · POST /_zerar (pedidos vazios e o cenário de base). Nada aqui é o Supabase de verdade; nenhum dado de gente.
Uso: python3 e2e/wa/supabase_falso.py --principal 8795 --treino 8796      (python3 e2e/wa/supabase_falso.py --autoteste: as portas livres do SO)
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = ("20261012200000_wa1_acessos.sql", "20261012210000_wa2_rotinas.sql", "20261012220000_wa3_dieta_livre.sql")
CHAVE_PUBLICA = "anon-falsa-wa-local"
CHAVE_SERVICO_TREINO = "servico-falso-treino-wa-local"
# as contas da prova local (tokens com 13+ caracteres: a porta-pessoa recusa o "Bearer x" curto) — nada de gente
USUARIOS = {
    "tok-local-nutri-0001": "a0000000-0000-4000-8000-000000000001",
    "tok-local-personal-02": "a0000000-0000-4000-8000-000000000002",
    "tok-local-aluna-00003": "a0000000-0000-4000-8000-000000000003",
    "tok-local-dono-b-0005": "a0000000-0000-4000-8000-000000000005",
}
MATRICULA = "b0000000-0000-4000-8000-0000000000a1"
CONTA_A = "c0000000-0000-4000-8000-0000000000a1"
TREINO_ALUNA = "d0000000-0000-4000-8000-0000000000a1"
ASSINATURA = re.compile(r"create or replace function \{schema\}\.([a-z_]+)\(([^)]*)\)\s*returns jsonb")


def assinaturas() -> dict[str, list[str]]:
    """As RPCs da pessoa das 3 migrations (as internas wa_* ficam de fora; as de LGPD da wa3 são em maiúsculas e não casam) e os parâmetros."""
    saida: dict[str, list[str]] = {}
    for m in MIGRATIONS:
        texto = (REPO / "supabase-principal" / "migrations" / m).read_text(encoding="utf-8")
        for nome, params in ASSINATURA.findall(texto):
            if not nome.startswith("wa_"):
                saida[nome] = [p.strip().split()[0] for p in params.split(",") if p.strip()]
    return saida


ACESSOS_PADRAO = {
    "ok": True, "paciente_id": MATRICULA, "user_id": USUARIOS["tok-local-aluna-00003"], "conta_id": CONTA_A, "treino_user_id": None, "tem_login": True,
    "conta_modulos": ["treino", "nutricao"], "modulos": ["treino", "nutricao"], "tem_nutricionista": True, "pode_mudar": True,
    "linhas": {"acesso_app": "liberado", "diario_alimentar": "liberado", "acesso_link": "liberado", "dieta": "ver"}, "mudancas": {},
}
BASE = {
    "rpc": {"acessos_ler": {"status": 200, "corpo": ACESSOS_PADRAO}, "acessos_salvar": {"status": 200, "corpo": ACESSOS_PADRAO}},
    "auth": {},                                                          # token → status forçado no /auth/v1/user (ex.: 500)
    "identidades": {USUARIOS["tok-local-aluna-00003"]: TREINO_ALUNA},   # principal_user_id → treino_user_id
    "perfis": {TREINO_ALUNA: {"conta_id": CONTA_A, "series_travadas": True}},
}


class Estado:
    def __init__(self) -> None:
        self.trava = threading.Lock()
        self.pedidos: list[dict] = []
        self.cenario = copy.deepcopy(BASE)

    def anotar(self, p: dict) -> None:
        with self.trava:
            self.pedidos.append(p)

    def zerar(self) -> None:
        with self.trava:
            self.pedidos = []
            self.cenario = copy.deepcopy(BASE)

    def trocar(self, novo: dict) -> None:
        with self.trava:
            for k, v in novo.items():
                if k == "rpc" and isinstance(v, dict):
                    self.cenario["rpc"].update(v)
                else:
                    self.cenario[k] = v


def manipulador(papel: str, estado: Estado, rpcs: dict[str, list[str]]):
    class Falso(BaseHTTPRequestHandler):
        def log_message(self, *_a) -> None:  # silêncio no console
            pass

        def _responder(self, status: int, corpo: object) -> None:
            dados = json.dumps(corpo).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def _corpo(self) -> object:
            n = int(self.headers.get("Content-Length") or 0)
            bruto = self.rfile.read(n) if n else b""
            try:
                return json.loads(bruto or b"null")
            except ValueError:
                return {"_ilegivel": True}

        def _token(self) -> str:
            a = self.headers.get("Authorization") or ""
            return a[7:].strip() if a.startswith("Bearer ") else ""

        def _anotar(self, metodo: str, caminho: str, corpo: object, **extra: object) -> None:
            estado.anotar({"papel": papel, "metodo": metodo, "caminho": caminho, "corpo": corpo,
                           "schema": self.headers.get("Content-Profile") or self.headers.get("Accept-Profile"),
                           "usuario": USUARIOS.get(self._token()), **extra})

        def do_GET(self) -> None:  # noqa: N802
            u = urlparse(self.path)
            if u.path == "/_pedidos":
                return self._responder(200, estado.pedidos)
            if papel == "principal" and u.path == "/auth/v1/user":
                tok = self._token()
                self._anotar("GET", u.path, None)
                forcado = estado.cenario["auth"].get(tok)
                if forcado:
                    return self._responder(int(forcado), {"msg": "forçado pelo cenário"})
                if self.headers.get("apikey") != CHAVE_PUBLICA or tok not in USUARIOS:
                    return self._responder(401, {"code": 401, "msg": "invalid JWT"})
                return self._responder(200, {"id": USUARIOS[tok], "aud": "authenticated", "role": "authenticated"})
            if papel == "treino" and u.path in ("/rest/v1/physiq_identidades", "/rest/v1/physiq_profiles"):
                return self._tabela_treino("GET", u)
            self._anotar("GET", u.path, None, desconhecida=True)
            return self._responder(404, {"message": "rota do falso desconhecida"})

        def do_POST(self) -> None:  # noqa: N802
            u = urlparse(self.path)
            corpo = self._corpo()
            if u.path == "/_zerar":
                estado.zerar()
                return self._responder(200, {"ok": True})
            if u.path == "/_cenario":
                estado.trocar(corpo if isinstance(corpo, dict) else {})
                return self._responder(200, {"ok": True})
            m = re.match(r"^/rest/v1/rpc/([a-z_]+)$", u.path)
            if papel == "principal" and m:
                return self._rpc(m.group(1), corpo)
            self._anotar("POST", u.path, None, desconhecida=True)
            return self._responder(404, {"message": "rota do falso desconhecida"})

        def do_PATCH(self) -> None:  # noqa: N802
            u = urlparse(self.path)
            if papel == "treino" and u.path == "/rest/v1/physiq_profiles":
                return self._tabela_treino("PATCH", u)
            self._anotar("PATCH", u.path, None, desconhecida=True)
            return self._responder(404, {"message": "rota do falso desconhecida"})

        def _rpc(self, nome: str, corpo: object) -> None:
            self._anotar("POST", f"/rest/v1/rpc/{nome}", corpo, rpc=nome)
            if self.headers.get("apikey") != CHAVE_PUBLICA or self._token() not in USUARIOS:
                return self._responder(401, {"code": "PGRST301", "message": "JWT inválido"})
            params = rpcs.get(nome)
            if params is None or not isinstance(corpo, dict) or sorted(corpo) != sorted(params):
                return self._responder(404, {"code": "PGRST202", "message": f"Could not find the function {nome} in the schema cache"})
            r = estado.cenario["rpc"].get(nome) or {"status": 200, "corpo": {"ok": True}}
            return self._responder(int(r["status"]), r["corpo"])

        def _tabela_treino(self, metodo: str, u) -> None:
            tabela = u.path.rsplit("/", 1)[1]
            filtros = {k: v[0] for k, v in parse_qs(u.query).items()}
            corpo = self._corpo() if metodo == "PATCH" else None
            self._anotar(metodo, u.path, corpo, tabela=tabela, filtros=filtros)
            if self.headers.get("apikey") != CHAVE_SERVICO_TREINO or self._token() != CHAVE_SERVICO_TREINO:
                return self._responder(401, {"code": "PGRST301", "message": "sem a chave de serviço do Treino"})
            if tabela == "physiq_identidades":
                tid = estado.cenario["identidades"].get(filtros.get("principal_user_id", "").removeprefix("eq."))
                linhas = [{"treino_user_id": tid}] if tid else []
            else:
                perfil = estado.cenario["perfis"].get(filtros.get("id", "").removeprefix("eq."))
                if metodo == "PATCH" and perfil is not None and isinstance(corpo, dict):
                    perfil.update(corpo)
                colunas = [c.strip() for c in (filtros.get("select") or "conta_id,series_travadas").split(",")]
                linhas = [{c: perfil.get(c) for c in colunas}] if perfil is not None else []
            if "vnd.pgrst.object+json" in (self.headers.get("Accept") or ""):   # o maybeSingle de um PATCH
                if len(linhas) != 1:
                    return self._responder(406, {"code": "PGRST116", "details": "The result contains 0 rows", "hint": None,
                                                 "message": "JSON object requested, multiple (or no) rows returned"})
                return self._responder(200, linhas[0])
            return self._responder(200, linhas)

    return Falso


def subir(porta_principal: int, porta_treino: int) -> tuple[ThreadingHTTPServer, ThreadingHTTPServer, Estado]:
    rpcs = assinaturas()
    estado = Estado()
    sp = ThreadingHTTPServer(("127.0.0.1", porta_principal), manipulador("principal", estado, rpcs))
    st = ThreadingHTTPServer(("127.0.0.1", porta_treino), manipulador("treino", estado, rpcs))
    return sp, st, estado


def autoteste() -> int:
    """O falso por ele mesmo (portas livres do SO, sem Deno): o Auth, as 25 RPCs com os parâmetros da migration, o PGRST202, as 2 tabelas do Treino."""
    sp, st, _estado = subir(0, 0)
    for s in (sp, st):
        threading.Thread(target=s.serve_forever, daemon=True).start()
    pp, pt = sp.server_address[1], st.server_address[1]

    def pedir(metodo: str, porta: int, caminho: str, corpo: object = None, cab: dict | None = None) -> tuple[int, object]:
        req = urllib.request.Request(f"http://127.0.0.1:{porta}{caminho}", data=None if corpo is None else json.dumps(corpo).encode("utf-8"),
                                     method=metodo, headers={"Content-Type": "application/json", **(cab or {})})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    tok = "tok-local-nutri-0001"
    c = {"apikey": CHAVE_PUBLICA, "Authorization": f"Bearer {tok}"}
    s = {"apikey": CHAVE_SERVICO_TREINO, "Authorization": f"Bearer {CHAVE_SERVICO_TREINO}"}
    rpcs = assinaturas()
    casos = [
        ("as 25 RPCs da pessoa lidas das migrations", len(rpcs) == 25 and rpcs.get("acessos_ler") == ["p_aluno"] and rpcs.get("meus_alimentos") == []
         and rpcs.get("rotina_prof_salvar") == ["p_aluno", "p_id", "p_dados"]),
        ("o Auth: o token da tabela → 200 com o id", pedir("GET", pp, "/auth/v1/user", cab=c)[1] == {"id": USUARIOS[tok], "aud": "authenticated", "role": "authenticated"}),
        ("o Auth: token desconhecido → 401", pedir("GET", pp, "/auth/v1/user", cab={**c, "Authorization": "Bearer tok-local-outro-0000"})[0] == 401),
        ("a RPC com os parâmetros certos → a resposta padrão", pedir("POST", pp, "/rest/v1/rpc/acessos_ler", {"p_aluno": MATRICULA}, c)[1].get("ok") is True),
        ("a RPC com um parâmetro a mais → 404 PGRST202", pedir("POST", pp, "/rest/v1/rpc/acessos_ler", {"p_aluno": MATRICULA, "p_x": 1}, c)[0] == 404),
        ("a RPC sem o apikey → 401", pedir("POST", pp, "/rest/v1/rpc/acessos_ler", {"p_aluno": MATRICULA}, {"Authorization": f"Bearer {tok}"})[0] == 401),
        ("o vínculo do Treino (GET, lista)", pedir("GET", pt, f"/rest/v1/physiq_identidades?select=treino_user_id&principal_user_id=eq.{USUARIOS['tok-local-aluna-00003']}", cab=s)
         == (200, [{"treino_user_id": TREINO_ALUNA}])),
        ("o PATCH grava e devolve o objeto (maybeSingle)", pedir("PATCH", pt, f"/rest/v1/physiq_profiles?id=eq.{TREINO_ALUNA}&select=series_travadas",
                                                                {"series_travadas": False}, {**s, "Accept": "application/vnd.pgrst.object+json"}) == (200, {"series_travadas": False})),
        ("o PATCH sem a linha → 406 PGRST116", pedir("PATCH", pt, "/rest/v1/physiq_profiles?id=eq.x&select=series_travadas", {"series_travadas": False},
                                                     {**s, "Accept": "application/vnd.pgrst.object+json"})[0] == 406),
        ("as tabelas do Treino sem a chave de serviço → 401", pedir("GET", pt, "/rest/v1/physiq_profiles?id=eq.x", cab=c)[0] == 401),
    ]
    for nome, ok in casos:
        print(("✅ " if ok else "❌ ") + nome)
    sp.shutdown()
    st.shutdown()
    falhas = sum(1 for _n, ok in casos if not ok)
    print(f"autoteste do falso: {len(casos) - falhas}/{len(casos)}")
    return 1 if falhas else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--principal", type=int, default=0)
    ap.add_argument("--treino", type=int, default=0)
    ap.add_argument("--autoteste", action="store_true")
    a = ap.parse_args()
    if a.autoteste:
        return autoteste()
    if not a.principal or not a.treino:
        raise SystemExit("uso: supabase_falso.py --principal <porta> --treino <porta>   (ou --autoteste)")
    sp, st, _estado = subir(a.principal, a.treino)
    threading.Thread(target=st.serve_forever, daemon=True).start()
    print(f"falso do Supabase: principal 127.0.0.1:{a.principal} · treino 127.0.0.1:{a.treino}", flush=True)
    try:
        sp.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: O verde do falso** — `cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/supabase_falso.py --autoteste` →
  `autoteste do falso: 10/10`.

- [ ] **Step 4: O `api.py`** — `e2e/wa/api.py` (o arquivo inteiro: os 5 modos; o staging e a produção rodam só nas Tasks 17 e 18):

```python
#!/usr/bin/env python3
"""Physiq W-A P2 — o E2E de SERVIDOR das 3 funções da W-A: acessos e aluno-dia (banco principal, COMO A PESSOA) e treino-acessos (Banco do
Treino, com o login do principal). Spec W-A §5.2, §5.5, §5.6, §7; revisão C4 e I1.
Modos:
  --seco        NADA sai da máquina: as regras dos 3 _shared lidas do PRÓPRIO TS (node --experimental-strip-types) conferem os corpos de
                referência (os válidos passam com a RPC e os p_* certos; os de forma ruim são recusados com o campo certo) + o autoteste do falso.
  --local       as 3 funções no Deno LOCAL (e2e/w1/servir_local.ts) contra o FALSO do Supabase (e2e/wa/supabase_falso.py) — sem rede: a porta
                (CORS, 405, schema, Bearer, 413, o freio), a forma antes da RPC (0 RPC quando recusa), a RPC e os p_* certos, o status de cada
                código, a whitelist, o getUser em todo pedido (a porta sem jwtLeitura), o log só com códigos (nunca o nome da rotina) e a
                treino-acessos inteira (o vínculo, a trava por conta, UMA gravação só com series_travadas, o registro que falha, o schema).
  (padrão)      STAGING, com as funções PUBLICADAS e as contas de TESTE da hml-17 — os grupos A (acessos) · T (treino-acessos) · R (rotinas) ·
                D (dieta livre) · X (o mesmo login em 2 contas) · Y (o dono sem papel de personal) · B (os logs da borda): os P/N por papel nos 2 bancos e os
                negativos da §5.5. A massa ("WA E2E <rodada>") vai para o estado ANTES de nascer e sai no fim (e no --limpar): as rotinas, os
                alimentos, as receitas, as extras e os itens do dia da aluna e do w7b, os acessos, o histórico e os avisos da W-A da matrícula A
                desde o começo da rodada, o config da A e o series_travadas do Treino (as fotos) e o alimento "fora do plano"; a 2ª matrícula, as
                "sem login" e "só nutri" e o dono sem papel pela Massa do _base.py. No fim, as sobras = 0.
  --so-leitura  PRODUÇÃO (x-schema public): SÓ leitura — OPTIONS, sem login, x-schema inválido, ação desconhecida e `acao: "ler"`; NENHUMA
                gravação, nem com corpo inválido (risco 9 do mestre). --desde <ISO UTC>: os logs das 3 desde a publicação (0 5xx; 100% JSON).
  --limpar      desfaz a massa do estado (~/projetos/physiqcalc-scratch/w-a/api-estado.json) e da Massa; imprime as sobras.
Uso: python3 e2e/wa/api.py --seco | --local | [--grupos A,T,R,D,X,Y,B] | --so-leitura [--desde <ISO>] | --limpar
Os ids: S = seco · L = local · A/T/R/D/X/Y/B = os grupos do staging · Z = as sobras · P = produção.
Sem segredo nem dado pessoal na saída: só status, códigos, contagens e booleanos (as chaves pela Management API; as senhas em ~/.physiq-teste-*).
"""
from __future__ import annotations

import argparse
import datetime as dt
import http.client
import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import _base as B  # noqa: E402
import supabase_falso as F  # noqa: E402

REPO = B.REPO
P = B.C.C2.Placar()
B5 = B.B5
S = "staging"
API_P, API_T = B.H.API_P, f"https://{B.H.API_T_HOST}"
URLS = {"acessos": f"{API_P}/functions/v1/acessos", "aluno-dia": f"{API_P}/functions/v1/aluno-dia",
        "treino-acessos": f"{API_T}/functions/v1/treino-acessos"}
ORIGEM, ORIGEM_PROD, ORIGEM_FORA = "https://physiqcalc-staging.vercel.app", "https://physiqcalc.com.br", "https://exemplo-fora-da-lista.example"
ESTADO = B.SCRATCH / "w-a" / "api-estado.json"
P2 = B.SCRATCH / "w-a" / "p2"
DENO = Path.home() / ".deno" / "bin" / "deno"
PORTAS = {"falso_principal": 8795, "falso_treino": 8796, "acessos": 8791, "aluno-dia": 8792, "treino-acessos": 8793}
LOCAL = {f: f"http://127.0.0.1:{PORTAS[f]}" for f in ("acessos", "aluno-dia", "treino-acessos")}
FALSO_P = f"http://127.0.0.1:{PORTAS['falso_principal']}"
TITULOS_WA = ("Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia", "Seu profissional criou uma rotina para você")
FALSO = "00000000-0000-4000-8000-00000000abcd"
GRAVACOES = {"salvar", "rotina_salvar", "rotina_arquivar", "rotina_marcar", "rotinas_ordenar", "dia_adicionar", "dia_tirar", "dia_desfazer",
             "extra_salvar", "extra_excluir", "extra_marcar", "alimento_salvar", "alimento_excluir", "receita_salvar", "receita_excluir",
             "prof_rotina_salvar", "prof_rotina_arquivar"}

# ───────────────────────── os corpos de referência (o --seco confere nas regras do TS; o --local manda às funções) ─────────────────────────
A_, B_ = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
HOJE_FIXO = "2026-10-13"
MARCA_LOCAL = "WA LOCAL creatina"
ROTINA = {"nome": "Creatina", "detalhe": "5 g", "tipo": "suplemento", "horario": "08:00", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}
ITEM = {"refeicao_id": A_, "alimento_id": B_, "quantidade_g": 150}
EXTRA = {"dia": HOJE_FIXO, "nome": "Lanche", "horario": "16:00", "ja_comi": True}
ALIMENTO = {"nome": "Pão", "porcao_g": 50, "energia_kcal": 280, "proteina_g": 9, "carboidrato_g": 55, "lipidio_g": 3, "fibra_g": 2}
RECEITA = {"nome": "Vitamina", "porcoes": 2, "itens": [{"alimento_id": A_, "quantidade_g": 200}, {"aluno_alimento_id": B_, "quantidade_g": 100}]}
ROTINA_PROF = {"nome": "Remédio", "tipo": "remedio", "horario": "20:00", "lembrete": True}
# nome → (o corpo VÁLIDO, a RPC, os p_* que ela tem de receber — os nomes das migrations)
CORPOS_ALUNO_DIA: dict[str, tuple[dict, str, dict]] = {
    "ler:rotinas": ({"acao": "ler", "q": "rotinas", "de": HOJE_FIXO, "ate": HOJE_FIXO}, "minhas_rotinas", {"p_de": HOJE_FIXO, "p_ate": HOJE_FIXO}),
    "ler:dia": ({"acao": "ler", "q": "dia", "dia": HOJE_FIXO}, "meu_dia", {"p_dia": HOJE_FIXO}),
    "ler:biblioteca": ({"acao": "ler", "q": "biblioteca"}, "meus_alimentos", {}),
    "ler:alimentos": ({"acao": "ler", "q": "alimentos", "termo": "arroz", "pagina": 0}, "buscar_alimentos_do_aluno", {"p_termo": "arroz", "p_pagina": 0}),
    "ler:aluno_rotinas": ({"acao": "ler", "q": "aluno_rotinas", "aluno": A_, "de": "2026-10-07", "ate": HOJE_FIXO}, "rotinas_do_aluno",
                          {"p_aluno": A_, "p_de": "2026-10-07", "p_ate": HOJE_FIXO}),
    "ler:aluno_dia": ({"acao": "ler", "q": "aluno_dia", "aluno": A_, "de": "2026-09-13", "ate": HOJE_FIXO}, "dia_do_aluno",
                      {"p_aluno": A_, "p_de": "2026-09-13", "p_ate": HOJE_FIXO}),
    "rotina_salvar": ({"acao": "rotina_salvar", "id": None, "dados": ROTINA}, "rotina_salvar", {"p_id": None, "p_dados": ROTINA}),
    "rotina_arquivar": ({"acao": "rotina_arquivar", "id": A_}, "rotina_arquivar", {"p_id": A_}),
    "rotina_marcar": ({"acao": "rotina_marcar", "id": A_, "dia": HOJE_FIXO, "feita": True}, "rotina_marcar", {"p_id": A_, "p_dia": HOJE_FIXO, "p_feita": True}),
    "rotinas_ordenar": ({"acao": "rotinas_ordenar", "ids": [A_, B_]}, "rotinas_ordenar", {"p_ids": [A_, B_]}),
    "dia_adicionar": ({"acao": "dia_adicionar", "dia": HOJE_FIXO, "dados": ITEM}, "dia_adicionar", {"p_dia": HOJE_FIXO, "p_dados": ITEM}),
    "dia_tirar": ({"acao": "dia_tirar", "dia": HOJE_FIXO, "item": A_}, "dia_tirar", {"p_dia": HOJE_FIXO, "p_item": A_}),
    "dia_desfazer": ({"acao": "dia_desfazer", "id": A_}, "dia_desfazer", {"p_id": A_}),
    "extra_salvar": ({"acao": "extra_salvar", "id": None, "dados": EXTRA}, "dia_extra_salvar", {"p_id": None, "p_dados": EXTRA}),
    "extra_excluir": ({"acao": "extra_excluir", "id": A_}, "dia_extra_excluir", {"p_id": A_}),
    "extra_marcar": ({"acao": "extra_marcar", "id": A_, "feita": False}, "dia_extra_marcar", {"p_id": A_, "p_feita": False}),
    "alimento_salvar": ({"acao": "alimento_salvar", "id": None, "dados": ALIMENTO}, "meu_alimento_salvar", {"p_id": None, "p_dados": ALIMENTO}),
    "alimento_excluir": ({"acao": "alimento_excluir", "id": A_}, "meu_alimento_excluir", {"p_id": A_}),
    "receita_salvar": ({"acao": "receita_salvar", "id": None, "dados": RECEITA}, "minha_receita_salvar", {"p_id": None, "p_dados": RECEITA}),
    "receita_excluir": ({"acao": "receita_excluir", "id": A_}, "minha_receita_excluir", {"p_id": A_}),
    "prof_rotina_salvar": ({"acao": "prof_rotina_salvar", "aluno": A_, "id": None, "dados": ROTINA_PROF}, "rotina_prof_salvar",
                           {"p_aluno": A_, "p_id": None, "p_dados": ROTINA_PROF}),
    "prof_rotina_arquivar": ({"acao": "prof_rotina_arquivar", "aluno": A_, "id": B_}, "rotina_prof_arquivar", {"p_aluno": A_, "p_id": B_}),
}
# (o corpo, o campo recusado — None = acao_invalida): recusados ANTES de qualquer RPC
RECUSAS_ALUNO_DIA: list[tuple[dict, str | None]] = [
    ({"acao": "rotina_salvar", "dados": {"nome": f"{MARCA_LOCAL} {'x' * 60}"}}, "nome"),   # o erro provocado: o nome nunca vai ao log
    ({"acao": "rotina_salvar", "dados": {"nome": "X", "lembrete": True}}, "horario"),
    ({"acao": "rotina_salvar", "dados": {"nome": "X", "dias_semana": [8]}}, "dias_semana"),
    ({"acao": "rotina_salvar", "dados": {"nome": "X", "horario": "8:00"}}, "horario"),
    ({"acao": "ler", "q": "dia", "dia": "2026-02-30"}, "dia"),
    ({"acao": "ler", "q": "rotinas", "de": "2026-09-12", "ate": HOJE_FIXO}, "ate"),
    ({"acao": "rotinas_ordenar", "ids": [f"11111111-1111-4111-8111-{i:012d}" for i in range(31)]}, "ids"),
    ({"acao": "dia_adicionar", "dia": HOJE_FIXO, "dados": {"refeicao_id": A_, "alimento_id": B_, "quantidade_g": 0}}, "quantidade_g"),
    ({"acao": "receita_salvar", "dados": {"nome": "X", "itens": [{"alimento_id": A_, "quantidade_g": 10}] * 31}}, "itens"),
    ({"acao": "extra_salvar", "id": A_, "dados": {"dia": HOJE_FIXO}}, "dia"),
    ({"acao": "ler", "q": "xpto"}, "q"),
    ({"acao": "apagar_tudo"}, None),
    ({"action": "ler", "q": "rotinas", "de": HOJE_FIXO, "ate": HOJE_FIXO}, None),
]
CORPOS_ACESSOS: list[tuple[dict, str, dict]] = [
    ({"acao": "ler", "aluno": A_}, "acessos_ler", {"p_aluno": A_}),
    ({"acao": "salvar", "aluno": A_, "chave": "dieta", "valor": "mexer"}, "acessos_salvar", {"p_aluno": A_, "p_chave": "dieta", "p_valor": "mexer"}),
]
RECUSAS_ACESSOS: list[tuple[dict, str | None]] = [
    ({"acao": "salvar", "aluno": A_, "chave": "treino_series", "valor": "ver"}, "chave"),
    ({"acao": "ler", "aluno": "x"}, "aluno"),
    ({"acao": "salvar", "aluno": A_, "chave": "dieta", "valor": "liberado"}, "valor"),
    ({"acao": "xpto", "aluno": A_}, None),
]
CORPOS_TREINO: list[dict] = [{"acao": "ler", "aluno": A_}, {"acao": "salvar", "aluno": A_, "valor": "mexer"}]
RECUSAS_TREINO: list[tuple[dict, str | None]] = [
    ({"action": "get", "aluno": A_}, None), ({"acao": "ler", "aluno": "x"}, "aluno"), ({"acao": "salvar", "aluno": A_, "valor": "travar"}, "valor"),
]


# ───────────────────────── o comum ─────────────────────────
def pedir(metodo: str, url: str, corpo: object = None, cab: dict | None = None, timeout: int = 60) -> tuple[int, dict, dict]:
    """(status, o corpo JSON quando for objeto — senão {}, os cabeçalhos)."""
    st, r, h = B5.http(metodo, url, corpo, cab or {}, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), (h or {})


def chamar(funcao: str, token: str | None, corpo: object, *, schema: str = S, origem: str = ORIGEM, metodo: str = "POST",
           base: str | None = None) -> tuple[int, dict, dict]:
    """A função como a tela chama: Authorization (o token do PRINCIPAL), x-schema, Origin e — nas do principal — o apikey. base = o Deno local."""
    cab = {"x-schema": schema, "Origin": origem}
    if funcao != "treino-acessos":
        cab["apikey"] = F.CHAVE_PUBLICA if base else B5.anon(B.PRINCIPAL_REF)
    if token:
        cab["Authorization"] = f"Bearer {token}"
    if isinstance(corpo, bytes):
        cab["Content-Type"] = "application/json"
    return pedir(metodo, base or URLS[funcao], corpo, cab)


def preflight(funcao: str, origem: str, base: str | None = None) -> tuple[int, str]:
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema, x-client-info"}
    st, _r, h = pedir("OPTIONS", base or URLS[funcao], None, cab)
    return st, B.C.cabecalho(h, "access-control-allow-origin")


def caso(id_: str, desc: str, st: int, r: dict, esperado: int, *extras: object) -> bool:
    """Um caso: o status esperado e as conferências extras. Da resposta só sai o que é código (ok, erro, series, registrado, pode_mudar)."""
    ok = st == esperado and all(bool(x) for x in extras)
    curto = {k: r.get(k) for k in ("ok", "erro", "series", "registrado", "pode_mudar") if k in r}
    return P.check(ok, f"[{id_}] {desc}: {st} {json.dumps(curto, ensure_ascii=False)}"
                   + ("" if ok else f" (esperado {esperado}; extras {[bool(x) for x in extras]})"))


class _Saida:
    """O que o Logins.fechar da hml-17 pede (o .ok da hml-09), em cima do Placar."""

    def ok(self, cond: bool, texto: str, parar: bool = False) -> bool:  # noqa: ARG002
        return P.check(cond, texto)


# ───────────────────────── --seco ─────────────────────────
_JS_REGRAS = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [ac, ad, ta] = await Promise.all(process.argv.slice(1, 4).map((f) => import(pathToFileURL(f).href)));
const e = JSON.parse(readFileSync(0, "utf8"));
const saida = { acessos: [], alunoDia: [], treino: [] };
for (const c of e.acessos) { const r = ac.lerPedidoDeAcessos(c); saida.acessos.push(r.ok ? { ok: true, ...ac.chamadaDeAcessos(r.pedido) } : r); }
for (const c of e.alunoDia) { const r = ad.pedidoDoAlunoDia(c); saida.alunoDia.push(r.ok ? { ok: true, rpc: r.pedido.rpc, args: r.pedido.args } : r); }
for (const c of e.treino) saida.treino.push(ta.lerPedidoTreinoAcessos(c));
saida.gravacoes = [...ad.ACOES_DO_ALUNO_DIA, ...ac.ACOES_DE_ACESSOS.filter((a) => a !== "ler")];
console.log(JSON.stringify(saida));
"""


def regras(acessos: list, aluno_dia: list, treino: list) -> dict:
    """O que as regras do servidor (o PRÓPRIO TS, pelo node) fazem com cada corpo — sem rede."""
    arquivos = [REPO / "supabase-principal/functions/_shared/acessos-regras.ts", REPO / "supabase-principal/functions/_shared/aluno-dia-regras.ts",
                REPO / "supabase/functions/_shared/treino-acessos-regras.ts"]
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_REGRAS, *map(str, arquivos)],
                       input=json.dumps({"acessos": acessos, "alunoDia": aluno_dia, "treino": treino}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (as regras da W-A): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


def _recusa(campo: str | None) -> dict:
    return {"ok": False, "erro": "acao_invalida"} if campo is None else {"ok": False, "erro": "dados_invalidos", "campo": campo}


def rodada_seca() -> None:
    corpos_ad = list(CORPOS_ALUNO_DIA.values())
    r = regras([c for c, _rpc, _a in CORPOS_ACESSOS] + [c for c, _ in RECUSAS_ACESSOS],
               [c for c, _rpc, _a in corpos_ad] + [c for c, _ in RECUSAS_ALUNO_DIA],
               CORPOS_TREINO + [c for c, _ in RECUSAS_TREINO])
    n = len(CORPOS_ACESSOS)
    for (corpo, rpc, args), x in zip(CORPOS_ACESSOS, r["acessos"][:n]):
        P.check(x == {"ok": True, "rpc": rpc, "args": args}, f"[S1] acessos › {corpo['acao']}: a {rpc} com {sorted(args)}")
    for (_corpo, campo), x in zip(RECUSAS_ACESSOS, r["acessos"][n:]):
        P.check(x == _recusa(campo), f"[S2] acessos › recusa ({campo or 'acao_invalida'}): {x}")
    n = len(corpos_ad)
    for nome, (_corpo, rpc, args), x in zip(CORPOS_ALUNO_DIA, corpos_ad, r["alunoDia"][:n]):
        P.check(x == {"ok": True, "rpc": rpc, "args": args}, f"[S3] aluno-dia › {nome}: a {rpc} com {sorted(args)}" + ("" if x.get("ok") else f" — {x}"))
    for (_corpo, campo), x in zip(RECUSAS_ALUNO_DIA, r["alunoDia"][n:]):
        P.check(x == _recusa(campo), f"[S4] aluno-dia › recusa ({campo or 'acao_invalida'}): {x}")
    n = len(CORPOS_TREINO)
    for corpo, x in zip(CORPOS_TREINO, r["treino"][:n]):
        P.check(x.get("ok") is True, f"[S5] treino-acessos › {corpo['acao']} passa na forma")
    for (_corpo, campo), x in zip(RECUSAS_TREINO, r["treino"][n:]):
        P.check(x == _recusa(campo), f"[S6] treino-acessos › recusa ({campo or 'acao_invalida'}): {x}")
    auto = subprocess.run([sys.executable, str(AQUI / "supabase_falso.py"), "--autoteste"], capture_output=True, text=True, timeout=90, cwd=REPO)
    P.check(auto.returncode == 0, f"[S7] o autoteste do falso do Supabase: {(auto.stdout.strip().splitlines() or ['(sem saída)'])[-1]}")
    P.check(set(r["gravacoes"]) == GRAVACOES, f"[S8] a trava do --so-leitura (GRAVACOES) = as gravações das regras do TS: "
            f"{sorted(set(r['gravacoes']) ^ GRAVACOES) or 'iguais'}")


# ───────────────────────── --local: as 3 no Deno local contra o falso ─────────────────────────
TK = {"nutri": "tok-local-nutri-0001", "personal": "tok-local-personal-02", "aluna": "tok-local-aluna-00003", "dono_b": "tok-local-dono-b-0005"}
M = F.MATRICULA


def porta_livre(p: int) -> bool:
    with socket.socket() as s_:
        s_.settimeout(0.5)
        return s_.connect_ex(("127.0.0.1", p)) != 0


def esperar(cond, segundos: float, passo: float = 0.5) -> bool:
    fim = time.time() + segundos
    while time.time() < fim:
        if cond():
            return True
        time.sleep(passo)
    return False


def ambiente_deno(funcao: str) -> dict:
    """O ambiente de cada função local: só o falso (127.0.0.1) e chaves de mentira; nada de fora entra (SUPABASE_*, PRINCIPAL_*, segredos)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("SUPABASE_", "PRINCIPAL_", "ERROS_", "TELEGRAM_", "SEGREDO_"))}
    env |= {"DENO_NO_PACKAGE_JSON": "1", "ERROS_AVISO_DESLIGADO": "1"}
    if funcao == "treino-acessos":
        env |= {"SUPABASE_URL": f"http://127.0.0.1:{PORTAS['falso_treino']}", "SUPABASE_SERVICE_ROLE_KEY": F.CHAVE_SERVICO_TREINO,
                "PRINCIPAL_URL": FALSO_P, "PRINCIPAL_ANON_KEY": F.CHAVE_PUBLICA}
    else:
        env |= {"SUPABASE_URL": FALSO_P, "SUPABASE_ANON_KEY": F.CHAVE_PUBLICA}
    return env


def subir_local() -> dict:
    for nome, p in PORTAS.items():
        if not porta_livre(p):
            raise SystemExit(f"a porta {p} ({nome}) está em uso (ss -ltnp | grep {p}) — outra rodada? (a 8080 e a 5173 nunca são usadas aqui)")
    P2.mkdir(parents=True, exist_ok=True)
    procs = {"falso": subprocess.Popen([sys.executable, str(AQUI / "supabase_falso.py"), "--principal", str(PORTAS["falso_principal"]),
                                        "--treino", str(PORTAS["falso_treino"])], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)}
    for f in ("acessos", "aluno-dia", "treino-acessos"):
        pasta = "supabase/functions" if f == "treino-acessos" else "supabase-principal/functions"
        saida = (P2 / f"deno-{f}.log").open("w", encoding="utf-8")
        procs[f] = subprocess.Popen([str(DENO), "run", "--allow-net=127.0.0.1", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                                     f"{pasta}/{f}/index.ts", str(PORTAS[f])], cwd=REPO, env=ambiente_deno(f), stdout=saida, stderr=saida)
    if not esperar(lambda: all(not porta_livre(p) for p in PORTAS.values()), 180, 1.0):
        descer_local(procs)
        raise SystemExit(f"o Deno local não subiu em 180 s (veja {P2}/deno-*.log)")
    return procs


def descer_local(procs: dict) -> None:
    for pr in procs.values():
        pr.terminate()
    for pr in procs.values():
        try:
            pr.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pr.kill()


def _falso(caminho: str, corpo: object = None) -> object:
    _st, r, _h = B5.http("POST" if corpo is not None else "GET", FALSO_P + caminho, corpo, {}, timeout=10)
    return r


def local(funcao: str, token: str | None, corpo: object, cenario: dict | None = None, **kw: object) -> tuple[int, dict, list]:
    """Zera o falso (e põe o cenário), chama a função LOCAL e devolve (status, corpo, os pedidos que o falso viu)."""
    _falso("/_zerar", {})
    if cenario:
        _falso("/_cenario", cenario)
    st, r, _h = chamar(funcao, token, corpo, base=LOCAL[funcao], **kw)
    ps = _falso("/_pedidos")
    return st, r, ps if isinstance(ps, list) else []


def local_grande(funcao: str, token: str, tamanho: int) -> tuple[int, dict, list]:
    """O corpo grande sem corrida: SÓ os cabeçalhos, com Content-Length = `tamanho` (acima do limite), e o corpo nunca vai — a porta recusa
    pelo tamanho declarado (413) antes de ler. Mandar os bytes de verdade corre com a resposta: a função responde e fecha no meio do envio
    (BrokenPipe — visto no ensaio do plano). Devolve (status, corpo, os pedidos que o falso viu)."""
    _falso("/_zerar", {})
    u = urllib.parse.urlsplit(LOCAL[funcao])
    cab = {"Content-Type": "application/json", "Content-Length": str(tamanho), "x-schema": S, "Origin": ORIGEM, "Authorization": f"Bearer {token}"}
    if funcao != "treino-acessos":
        cab["apikey"] = F.CHAVE_PUBLICA
    c = http.client.HTTPConnection(u.hostname, u.port, timeout=30)
    try:
        c.putrequest("POST", u.path or "/", skip_accept_encoding=True)
        for k, v in cab.items():
            c.putheader(k, v)
        c.endheaders()
        resp = c.getresponse()
        st, bruto = resp.status, resp.read()
    finally:
        c.close()
    try:
        r = json.loads(bruto or b"{}")
    except ValueError:
        r = {}
    ps = _falso("/_pedidos")
    return st, (r if isinstance(r, dict) else {}), (ps if isinstance(ps, list) else [])


def rpcs(ps: list) -> list:
    return [(p.get("rpc"), p.get("corpo")) for p in ps if p.get("rpc")]


def do_treino(ps: list) -> list:
    return [p for p in ps if p.get("papel") == "treino"]


def patches(ps: list) -> list:
    return [p for p in ps if p.get("metodo") == "PATCH"]


def rodada_local() -> None:
    procs = subir_local()
    try:
        _casos_locais()
    finally:
        descer_local(procs)
    linhas = [ln for f in ("acessos", "aluno-dia", "treino-acessos") for ln in (P2 / f"deno-{f}.log").read_text(encoding="utf-8").splitlines()]
    lidas = []
    for ln in (x for x in linhas if x.lstrip().startswith("{")):
        try:
            lidas.append(json.loads(ln))
        except ValueError:
            lidas.append(None)
    formato = bool(lidas) and all(isinstance(x, dict) and x.get("nivel") in ("info", "aviso", "erro")
                                  and x.get("funcao") in ("acessos", "aluno-dia", "treino-acessos", "avisar-erro") for x in lidas)
    sem_nome = not any(MARCA_LOCAL.lower() in ln.lower() or "creatina" in ln.lower() or "vitamina" in ln.lower() for ln in linhas)
    provocado = any(isinstance(x, dict) and x.get("codigo") == "dados_invalidos" and x.get("acao") == "rotina_salvar" and x.get("resultado") == "nome"
                    for x in lidas)
    P.check(formato and sem_nome and provocado, f"[L40] os logs do Deno local: {len(lidas)} linhas no JSON do _shared/log.ts ({formato}); o nome da "
            f"rotina/receita em 0 linha ({sem_nome}); a recusa do nome com o código, a ação e o campo ({provocado})")


def _casos_locais() -> None:
    funcoes = ("acessos", "aluno-dia", "treino-acessos")
    ler_de = {"acessos": {"acao": "ler", "aluno": M}, "aluno-dia": CORPOS_ALUNO_DIA["ler:rotinas"][0], "treino-acessos": {"acao": "ler", "aluno": M}}
    # ── a porta das 3
    for f in funcoes:
        st, ao = preflight(f, "http://localhost:5173", LOCAL[f])
        _st, ao2 = preflight(f, ORIGEM_FORA, LOCAL[f])
        P.check(st == 200 and ao == "http://localhost:5173" and ao2 == ORIGEM_PROD, f"[L1/{f}] OPTIONS: o CORS ecoa a origem da lista; fora dela, o site ({st})")
        st, r, ps = local(f, TK["nutri"], None, metodo="GET")
        P.check(st == 405 and r.get("erro") == "metodo" and not ps, f"[L2/{f}] GET → 405 metodo, sem tocar no falso ({st}, {len(ps)})")
        st, r, ps = local(f, TK["nutri"], ler_de[f], schema="xpto")
        P.check(st == 400 and r.get("erro") == "schema_invalido" and not ps, f"[L3/{f}] x-schema fora da lista → 400 schema_invalido ({st})")
        st, r, ps = local(f, None, ler_de[f])
        P.check(st == 401 and r.get("erro") == "sem_login" and not ps, f"[L4/{f}] sem o Bearer → 401 sem_login, sem tocar no falso ({st})")
        st, r, ps = local(f, "tok-local-desconhecido-9", ler_de[f])
        P.check(st == 401 and r.get("erro") == "sem_login" and not rpcs(ps), f"[L5/{f}] o token que o Auth recusa → 401 sem_login, 0 RPC ({st})")
    # ── decisão 13: a porta SEM jwtLeitura — o getUser em todo pedido (leitura também); nenhuma ida ao JWKS
    _falso("/_zerar", {})
    for _ in range(3):
        chamar("acessos", TK["nutri"], ler_de["acessos"], base=LOCAL["acessos"])
        chamar("aluno-dia", TK["aluna"], ler_de["aluno-dia"], base=LOCAL["aluno-dia"])
    ps = _falso("/_pedidos")
    ps = ps if isinstance(ps, list) else []
    auth = [p for p in ps if p.get("caminho") == "/auth/v1/user"]
    jwks = [p for p in ps if "jwks" in str(p.get("caminho"))]
    P.check(len(auth) == 6 and not jwks, f"[L6] decisão 13: 1 GET /auth/v1/user por pedido nas 6 leituras ({len(auth)}); {len(jwks)} ida ao JWKS")
    # ── acessos
    st, r, ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": "x"})
    P.check(st == 400 and r.get("erro") == "dados_invalidos" and not rpcs(ps), f"[L7] acessos › aluno que não é uuid → 400, 0 RPC ({st})")
    st, r, ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M})
    P.check(st == 200 and r.get("ok") is True and not ({"user_id", "conta_id", "treino_user_id"} & set(r)) and r.get("pode_mudar") is True
            and rpcs(ps) == [("acessos_ler", {"p_aluno": M})] and ps[-1].get("schema") == "staging" and ps[-1].get("usuario") == F.USUARIOS[TK["nutri"]],
            f"[L8] acessos › ler: a acessos_ler como a pessoa (o schema, o usuário do token); a volta sem os ids internos ({st}, {sorted(r)})")
    st, r, ps = local("acessos", TK["personal"], {"acao": "salvar", "aluno": M, "chave": "dieta", "valor": "mexer", "paciente_id": FALSO, "user_id": FALSO})
    P.check(st == 200 and rpcs(ps) == [("acessos_salvar", {"p_aluno": M, "p_chave": "dieta", "p_valor": "mexer"})],
            f"[L9] acessos › salvar: só p_aluno, p_chave e p_valor (o paciente_id e o user_id do corpo caem) ({rpcs(ps)})")
    st, r, ps = local("acessos", TK["personal"], {"acao": "salvar", "aluno": M, "chave": "treino_series", "valor": "ver"})
    P.check(st == 400 and not rpcs(ps), f"[L10] acessos › treino_series → 400, 0 RPC (vai pela treino-acessos) ({st})")
    for i, (rpc, erro, esperado) in enumerate([("acessos_salvar", "sem_nutricao", 409), ("acessos_salvar", "sem_login_do_aluno", 409),
                                               ("acessos_ler", "sem_acesso", 403), ("acessos_ler", "aluno_inexistente", 404), ("acessos_ler", "xpto", 500)]):
        corpo = {"acao": "salvar", "aluno": M, "chave": "dieta", "valor": "mexer"} if rpc == "acessos_salvar" else {"acao": "ler", "aluno": M}
        st, r, _ps = local("acessos", TK["nutri"], corpo, {"rpc": {rpc: {"status": 200, "corpo": {"ok": False, "erro": erro}}}})
        P.check(st == esperado and r.get("erro") == (erro if esperado != 500 else "erro_interno"), f"[L11.{i}] acessos › a RPC devolve {erro} → {esperado} ({st})")
    st, r, _ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": {"status": 404, "corpo": {"code": "PGRST202", "message": "x"}}}})
    P.check(st == 500 and r.get("erro") == "erro_interno", f"[L12] acessos › sem a migration (PGRST202) → 500 erro_interno ({st})")
    st, r, _ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": {"status": 401, "corpo": {"code": "PGRST301", "message": "x"}}}})
    P.check(st == 401 and r.get("erro") == "sem_login", f"[L13] acessos › o PostgREST recusa o token (PGRST301) → 401 sem_login ({st})")
    st, r, ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M}, schema="public")
    P.check(st == 200 and bool(ps) and ps[-1].get("schema") == "public", f"[L14] acessos › x-schema public → a RPC no public ({st})")
    st, r, ps = local_grande("acessos", TK["nutri"], 2_000_001)
    P.check(st == 413 and r.get("erro") == "corpo_grande" and not ps, f"[L15] acessos › corpo acima de 2 MB → 413 corpo_grande, antes do Auth ({st}, {len(ps)})")
    _falso("/_zerar", {})
    codigos = [chamar("acessos", TK["dono_b"], {"acao": "ler", "aluno": M}, base=LOCAL["acessos"])[0] for _ in range(121)]
    P.check(codigos[:120].count(200) == 120 and codigos[120] == 429, f"[L16] acessos › o freio: 120/min por pessoa passam; o 121º → 429 ({codigos[-2:]})")
    # ── aluno-dia: cada leitura e cada gravação → a RPC e os p_* certos; o que vier a mais no corpo cai
    for nome, (corpo, rpc, args) in CORPOS_ALUNO_DIA.items():
        sujo = dict(corpo, dono_user_id=FALSO, paciente_id=FALSO)
        if isinstance(sujo.get("dados"), dict):
            sujo["dados"] = dict(sujo["dados"], dono_user_id=FALSO, paciente_id=FALSO, origem="profissional", criada_por=FALSO)
        st, r, ps = local("aluno-dia", TK["aluna"], sujo)
        P.check(st == 200 and rpcs(ps) == [(rpc, args)], f"[L17:{nome}] aluno-dia › a {rpc} com os p_* da migration; dono/paciente/origem do corpo caem ({rpcs(ps)})")
    for i, (corpo, campo) in enumerate(RECUSAS_ALUNO_DIA):
        st, r, ps = local("aluno-dia", TK["aluna"], corpo)
        erro = "acao_invalida" if campo is None else "dados_invalidos"
        P.check(st == 400 and r.get("erro") == erro and not rpcs(ps), f"[L18.{i}] aluno-dia › recusa antes da RPC ({campo or erro}) → 400, 0 RPC ({st})")
    for i, (nome, rpc, erro, esperado) in enumerate([
        ("rotina_marcar", "rotina_marcar", "dados_invalidos", 400), ("dia_adicionar", "dia_adicionar", "dieta_travada", 409),
        ("rotina_salvar", "rotina_salvar", "limite", 409), ("prof_rotina_salvar", "rotina_prof_salvar", "so_do_aluno", 409),
        ("rotina_arquivar", "rotina_arquivar", "nao_encontrado", 404), ("prof_rotina_arquivar", "rotina_prof_arquivar", "sem_login_do_aluno", 409),
        ("ler:aluno_dia", "dia_do_aluno", "sem_acesso", 403), ("ler:aluno_rotinas", "rotinas_do_aluno", "aluno_inexistente", 404),
    ]):
        st, r, _ps = local("aluno-dia", TK["aluna"], CORPOS_ALUNO_DIA[nome][0], {"rpc": {rpc: {"status": 200, "corpo": {"ok": False, "erro": erro}}}})
        P.check(st == esperado and r.get("erro") == erro, f"[L19.{i}] aluno-dia › a {rpc} devolve {erro} → {esperado} ({st})")
    volta = {"ok": True, "hoje": HOJE_FIXO, "rotinas": [{"id": FALSO}], "feitas": []}
    st, r, _ps = local("aluno-dia", TK["aluna"], CORPOS_ALUNO_DIA["ler:rotinas"][0], {"rpc": {"minhas_rotinas": {"status": 200, "corpo": volta}}})
    P.check(st == 200 and r == volta, f"[L20] aluno-dia › a volta é o jsonb da RPC como veio ({st})")
    # ── treino-acessos: os 6 passos
    T = "treino-acessos"
    st, r, ps = local_grande(T, TK["nutri"], 17_000)
    P.check(st == 413 and r.get("erro") == "corpo_grande" and not ps, f"[L21] treino-acessos › corpo acima de 16 KB → 413, 0 pedido ({st})")
    for i, (corpo, erro) in enumerate([({"action": "get", "aluno": M}, "acao_invalida"), ({"acao": "ler", "aluno": "x"}, "dados_invalidos"),
                                       ({"acao": "salvar", "aluno": M, "valor": "travar"}, "dados_invalidos")]):
        st, r, ps = local(T, TK["nutri"], corpo)
        P.check(st == 400 and r.get("erro") == erro and not ps, f"[L22.{i}] treino-acessos › {erro} antes de tocar no principal ({st}, {len(ps)})")
    st, r, _ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"auth": {TK["nutri"]: 500}})
    P.check(st == 502 and r.get("erro") == "principal_indisponivel", f"[L23] treino-acessos › o Auth do principal fora (500) → 502 ({st})")
    for i, (cen, esperado) in enumerate([({"status": 200, "corpo": {"ok": False, "erro": "sem_acesso"}}, (403, "sem_acesso")),
                                          ({"status": 200, "corpo": {"ok": False, "erro": "aluno_inexistente"}}, (404, "aluno_inexistente")),
                                          ({"status": 500, "corpo": {}}, (502, "principal_indisponivel")),
                                          ({"status": 404, "corpo": {"code": "PGRST202"}}, (502, "principal_indisponivel"))]):
        st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": cen}})
        P.check((st, r.get("erro")) == esperado and not do_treino(ps), f"[L24.{i}] treino-acessos › a acessos_ler → {esperado}, 0 ida ao Treino ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": {"status": 200, "corpo": dict(F.ACESSOS_PADRAO, modulos=["nutricao"])}}})
    P.check(st == 409 and r.get("erro") == "sem_modulo" and not do_treino(ps), f"[L25] treino-acessos › sem o módulo Treino → 409 sem_modulo ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M})
    tr = do_treino(ps)
    P.check(st == 200 and r == {"ok": True, "series": "ver", "pode_mudar": True}
            and [(p.get("metodo"), p.get("tabela")) for p in tr] == [("GET", "physiq_identidades"), ("GET", "physiq_profiles")]
            and (tr[0].get("filtros") or {}).get("principal_user_id") == f"eq.{F.USUARIOS[TK['aluna']]}"
            and (tr[1].get("filtros") or {}).get("id") == f"eq.{F.TREINO_ALUNA}" and all(p.get("schema") == "staging" for p in tr)
            and rpcs(ps) == [("acessos_ler", {"p_aluno": M})],
            f"[L26] treino-acessos › ler: sem o treino_user_id guardado → o VÍNCULO → o perfil; 'ver' = travadas ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M},
                      {"rpc": {"acessos_ler": {"status": 200, "corpo": dict(F.ACESSOS_PADRAO, treino_user_id=F.TREINO_ALUNA)}}})
    P.check(st == 200 and [p.get("tabela") for p in do_treino(ps)] == ["physiq_profiles"], f"[L27] treino-acessos › com o treino_user_id guardado: sem o vínculo ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"}, {"identidades": {}})
    P.check(st == 404 and r.get("erro") == "sem_treino" and not patches(ps), f"[L28] treino-acessos › sem o vínculo → 404 sem_treino, 0 gravação ({st})")
    outra = {F.TREINO_ALUNA: {"conta_id": "c0000000-0000-4000-8000-0000000000b2", "series_travadas": True}}
    st, r, ps = local(T, TK["dono_b"], {"acao": "salvar", "aluno": M, "valor": "mexer"}, {"perfis": outra})
    P.check(st == 403 and r.get("erro") == "sem_acesso" and not patches(ps), f"[L29] treino-acessos › C4: o Treino de OUTRA conta → 403, 0 gravação ({st})")
    st, r, _ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"perfis": {F.TREINO_ALUNA: {"conta_id": None, "series_travadas": False}}})
    P.check(st == 200 and r.get("series") == "mexer", f"[L30] treino-acessos › perfil do Treino sem conta → mostra (o treino do próprio aluno) ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"},
                      {"rpc": {"acessos_ler": {"status": 200, "corpo": dict(F.ACESSOS_PADRAO, pode_mudar=False)}}})
    P.check(st == 403 and not do_treino(ps), f"[L31] treino-acessos › quem não pode mudar → 403, sem ir ao Treino ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"})
    pt = patches(ps)
    P.check(st == 200 and r == {"ok": True, "series": "mexer", "registrado": True} and len(pt) == 1 and pt[0].get("corpo") == {"series_travadas": False}
            and (pt[0].get("filtros") or {}).get("id") == f"eq.{F.TREINO_ALUNA}"
            and rpcs(ps) == [("acessos_ler", {"p_aluno": M}), ("acessos_registrar_series", {"p_aluno": M, "p_de": "ver", "p_para": "mexer"})],
            f"[L32] treino-acessos › salvar: UMA gravação (só series_travadas, do treino_user_id certo) e o histórico como a pessoa ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "ver"})
    P.check(st == 200 and r == {"ok": True, "series": "ver", "registrado": False} and not patches(ps) and [x for x, _ in rpcs(ps)] == ["acessos_ler"],
            f"[L33] treino-acessos › sem mudança: nada grava nem registra ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"}, {"rpc": {"acessos_registrar_series": {"status": 500, "corpo": {}}}})
    P.check(st == 200 and r.get("registrado") is False and len(patches(ps)) == 1, f"[L34] treino-acessos › o registro falhou → registrado: false; a gravação vale ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, schema="public")
    P.check(st == 200 and all(p.get("schema") == "public" for p in ps if p.get("rpc") or p.get("papel") == "treino"),
            f"[L35] treino-acessos › x-schema public → o principal e o Treino no public ({st})")


# ───────────────────────── staging (o padrão): a massa, o estado e as fotos ─────────────────────────
class Rodada:
    """O estado da rodada de staging (o arquivo vai ANTES de cada escrita): o --limpar desfaz por ele, mesmo depois de uma queda."""

    def __init__(self) -> None:
        self.e: dict = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


def foto() -> dict:
    """SÓ LEITURA: os ids da massa de TESTE e o 'antes' do que a rodada muda (o config e os acessos da A; o series_travadas do Treino)."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id, p.conta_id, p.config from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                  order by p.created_at limit 1)
      select (select id::text from a) as pac_a, (select conta_id::text from a) as conta_a, (select config from a) as config_a,
             {u('w5p-aluna')}::text as aluna, {u('w7b-sozinho')}::text as sozinho, {u('w5p-nutri')}::text as nutri,
             {u('w5p-personal')}::text as personal,
             (select p.id::text from {S}.pacientes p join {S}.contas c on c.id = p.conta_id where p.user_id = {u('w7b-sozinho')}
                 and c.origem = 'app' and p.deleted_at is null order by p.created_at limit 1) as pac_app,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select al.id::text from {S}.alimentos al where al.fonte = 'taco' and al.deleted_at is null and al.energia_kcal > 0
               order by al.codigo limit 1) as taco,
             (select r.id::text from {S}.refeicoes r join {S}.planos_alimentares pl on pl.id = r.plano_id
               where pl.deleted_at is null and pl.paciente_id not in (select p2.id from {S}.pacientes p2 where p2.user_id = {u('w5p-aluna')})
               order by r.id limit 1) as refeicao_alheia,
             (now() at time zone 'America/Sao_Paulo')::date::text as hoje""")[0]
    pl = B.ler(f"""select r.id::text as refeicao, i.id::text as item from {S}.planos_alimentares pl
                     join {S}.refeicoes r on r.plano_id = pl.id join {S}.itens_refeicao i on i.refeicao_id = r.id
                    where pl.paciente_id = {B.txt(r['pac_a'])} and pl.deleted_at is null and i.alimento_id is not null
                      and (cardinality(r.dias_semana) = 0
                           or extract(isodow from (now() at time zone 'America/Sao_Paulo')::date)::smallint = any(r.dias_semana))
                    order by pl.favorito desc, pl.created_at desc, pl.id, r.ordem, i.ordem limit 1""")
    t = B.C.ler(B.TREINO_REF, f"""select i.treino_user_id::text as treino_user_id, pf.series_travadas from {S}.physiq_identidades i
                                   join {S}.physiq_profiles pf on pf.id = i.treino_user_id where i.principal_user_id = {B.txt(r['aluna'])}""")
    if not (r["pac_a"] and r["pac_app"] and r["taco"] and r["refeicao_alheia"] and pl and t):
        raise SystemExit("massa de TESTE incompleta no staging (a Task 0 do plano diz o que conferir) — nada foi gravado")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode python3 e2e/wa/api.py --limpar antes — nada foi gravado")
    return {**r, "refeicao": pl[0]["refeicao"], "item": pl[0]["item"], "treino_user_id": t[0]["treino_user_id"], "series_antes": t[0]["series_travadas"]}


def massa_basica(rod: Rodada, f: dict) -> dict:
    """As matrículas 'sem login' (personal + nutri) e 'só nutri' na conta A — na Massa do _base.py (o id vai ao estado ANTES do insert; o
    --limpar do _base.py também desfaz) — e o alimento 'fora do plano' da nutri (no estado da rodada, ANTES do insert). Só no staging."""
    m = B.Massa()
    ids: dict = {}
    for chave, nome, com_personal in (("pac_sem_login", "sem login", True), ("pac_so_nutri", "só nutri", False)):
        novo = str(uuid.uuid4())
        m.estado["matriculas"].append(novo)
        m._guardar()  # noqa: SLF001 — o mesmo estado do --limpar do _base.py
        B.escrever(f"""insert into {S}.pacientes (id, conta_id, personal_id, nutricionista_id, nome, config)
                       values ({B.txt(novo)}, {B.txt(f['conta_a'])}, {B.txt(f['personal']) if com_personal else 'null'}, {B.txt(f['nutri'])},
                               {B.txt(rod.e['marca'] + ' ' + nome)}, '{{"wa_e2e": true}}'::jsonb)""")
        ids[chave] = novo
    fora = str(uuid.uuid4())
    rod.e["alimentos"].append(fora)
    rod.guardar()
    B.escrever(f"""insert into {S}.alimentos (id, fonte, nutricionista_id, nome, energia_kcal)
                   values ({B.txt(fora)}, 'proprio', {B.txt(f['nutri'])}, {B.txt(rod.e['marca'] + ' fora do plano')}, 100)""")
    ids["alimento_fora"] = fora
    return ids


def dia_menos(dia: str, n: int) -> str:
    return (dt.date.fromisoformat(dia) - dt.timedelta(days=n)).isoformat()


def contar_avisos_hoje(x: dict, titulo: str) -> int:
    """Os avisos da W-A com este título no sino da aluna HOJE (São Paulo) — o banco manda no máximo 1 por dia."""
    return int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(x['f']['aluna'])} and tipo = 'geral'
                           and titulo = {B.txt(titulo)}
                           and criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'""")[0]["n"])


def contar_log(x: dict, chave: str) -> int:
    """As linhas do histórico da matrícula A desta chave desde o começo da rodada."""
    return int(B.ler(f"""select count(*) as n from {S}.aluno_acessos_log where paciente_id = {B.txt(x['f']['pac_a'])} and chave = {B.txt(chave)}
                           and em >= {B.txt(x['inicio'])}""")[0]["n"])


def series_no_treino(x: dict) -> bool | None:
    r = B.C.ler(B.TREINO_REF, f"select series_travadas from {S}.physiq_profiles where id = {B.txt(x['f']['treino_user_id'])}")
    return r[0]["series_travadas"] if r else None


def dono_da_rotina(rid: str | None) -> str | None:
    r = B.ler(f"select dono_user_id::text as d from {S}.rotinas where id = {B.txt(rid)}") if rid else []
    return r[0]["d"] if r else None


def token_do_treino(x: dict) -> str:
    """A sessão do TREINO do w5p-personal (a troca que o app faz) — só para provar que a treino-acessos NÃO aceita o token do Treino (T7)."""
    st, r, _h = pedir("POST", f"{API_T}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {x['tk']['w5p-personal']}", "x-schema": S, "Origin": ORIGEM})
    tok = r.get("access_token") if st == 200 else None
    if not isinstance(tok, str):
        raise SystemExit(f"a troca do Treino do w5p-personal falhou ({st}) — o T7 precisa do token do Treino")
    x["logins"].sessoes.guardar("treino", tok, "w5p-personal (a troca do Treino, T7)")
    return tok


def porta(x: dict, funcao: str, corpo: dict, id_: str) -> None:
    """A porta de cada função: o CORS, sem login, o token falso e o x-schema fora da lista (nada chega a uma RPC)."""
    st, ao = preflight(funcao, ORIGEM)
    _st, ao2 = preflight(funcao, ORIGEM_FORA)
    caso(f"{id_}.1", f"{funcao}: OPTIONS — o CORS ecoa o staging; fora da lista, o site", st, {}, 200, ao == ORIGEM, ao2 == ORIGEM_PROD)
    st, r, _h = chamar(funcao, None, corpo)
    caso(f"{id_}.2", f"{funcao}: sem login → 401 (no principal, a borda — verify_jwt — recusa antes)", st, r, 401,
         funcao != "treino-acessos" or r.get("erro") == "sem_login")
    st, r, _h = chamar(funcao, "eyJhbGciOiJIUzI1NiJ9.e30.token-falso-de-teste", corpo)
    caso(f"{id_}.3", f"{funcao}: token falso → 401", st, r, 401)
    st, r, _h = chamar(funcao, x["tk"]["w5p-nutri"], corpo, schema="xpto")
    caso(f"{id_}.4", f"{funcao}: x-schema fora da lista → 400", st, r, 400, r.get("erro") == "schema_invalido")


# ───────────────────────── staging: os grupos ─────────────────────────
def grupo_a(x: dict) -> None:
    """A — acessos: quem lê e quem muda (nutri, personal, master; nunca a aluna nem outra conta), a Dieta com o aviso 1 por dia, o histórico."""
    tk, f, ids = x["tk"], x["f"], x["ids"]
    a = f["pac_a"]
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})
    caso("A0", "a Dieta começa em 'ver' (sem mudança, nada grava; a foto volta no fim)", st, r, 200, (r.get("linhas") or {}).get("dieta") == "ver")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "ler", "aluno": a})
    link_antes = (r.get("linhas") or {}).get("acesso_link")
    caso("A1", "a nutri lê a aba da matrícula A (pode mudar; a Dieta 'ver'; os módulos; sem os ids internos)", st, r, 200, r.get("pode_mudar") is True,
         r.get("tem_login") is True, (r.get("linhas") or {}).get("dieta") == "ver", {"treino", "nutricao"} <= set(r.get("modulos") or []),
         not ({"user_id", "conta_id", "treino_user_id"} & set(r)))
    for i, conta in enumerate(("w5p-personal", "w27-master")):
        st, r, _h = chamar("acessos", tk[conta], {"acao": "ler", "aluno": a})
        caso(f"A2.{i}", f"{conta} lê a aba (pode mudar)", st, r, 200, r.get("pode_mudar") is True)
    st, r, _h = chamar("acessos", tk["w5p-aluna"], {"acao": "ler", "aluno": a})
    caso("A3", "§5.5: a aluna NÃO lê nem muda os acessos dela", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("acessos", tk["w13-dono"], {"acao": "ler", "aluno": a})
    caso("A4", "§5.5: o profissional de OUTRA conta", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "ler", "aluno": FALSO})
    caso("A5", "aluno que não existe", st, r, 404, r.get("erro") == "aluno_inexistente")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "mexer"})
    caso("A6", "a nutri libera a Dieta → 'mexer', o 'Mudado por' e 1 aviso no sino da aluna", st, r, 200, (r.get("linhas") or {}).get("dieta") == "mexer",
         ((r.get("mudancas") or {}).get("dieta") or {}).get("para") == "mexer", "por_nome" in ((r.get("mudancas") or {}).get("dieta") or {}),
         contar_avisos_hoje(x, TITULOS_WA[0]) == 1)
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "mexer"})
    caso("A7", "liberar de novo não manda o 2º aviso", st, r, 200, contar_avisos_hoje(x, TITULOS_WA[0]) == 1)
    for i, valor in enumerate(("bloqueado", "liberado")):
        st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "chave": "acesso_link", "valor": valor})
        caso(f"A8.{i}", f"P4: o personal muda o envio pelo link → {valor}", st, r, 200, (r.get("linhas") or {}).get("acesso_link") == valor)
    esperado = (0 if link_antes == "bloqueado" else 1) + 1
    caso("A9", f"o histórico: {esperado} mudança(s) do link desde o começo da rodada (pelo gatilho)", 200, {}, 200, contar_log(x, "acesso_link") == esperado)
    for i, corpo in enumerate(({"acao": "salvar", "aluno": a, "chave": "treino_series", "valor": "ver"},
                               {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "liberado"}, {"acao": "xpto", "aluno": a})):
        st, r, _h = chamar("acessos", tk["w5p-nutri"], corpo)
        caso(f"A10.{i}", f"§5.5: chave/valor/ação fora da lista ({corpo.get('chave') or corpo.get('acao')})", st, r, 400)
    st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": ids["pac_sem_login"], "chave": "acesso_app", "valor": "bloqueado"})
    caso("A11", "§5.5: o App de quem não tem login", st, r, 409, r.get("erro") == "sem_login_do_aluno")
    st, r, _h = chamar("acessos", tk["w27-master"], {"acao": "salvar", "aluno": f["pac_app"], "chave": "dieta", "valor": "mexer"})
    caso("A12", "§5.5: a Dieta do aluno do app SEM profissional (o master tenta)", st, r, 409, r.get("erro") == "sem_nutricao")
    for i, chave in enumerate(("diario_alimentar", "acesso_link")):
        st, r, _h = chamar("acessos", tk["w27-master"], {"acao": "salvar", "aluno": f["pac_app"], "chave": chave, "valor": "liberado"})
        caso(f"A12.{i + 1}", f"§5.5: {chave} do aluno do app SEM profissional", st, r, 409, r.get("erro") == "sem_nutricao")
    porta(x, "acessos", {"acao": "ler", "aluno": a}, "A13")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})
    caso("A14", "a nutri trava a Dieta de novo (a dieta livre, no grupo D, começa travada)", st, r, 200, (r.get("linhas") or {}).get("dieta") == "ver")


def grupo_t(x: dict) -> None:
    """T — treino-acessos: a nutri sem sessão no Treino lê e muda pelo vínculo; grava 1 coisa e registra; os negativos da §5.5."""
    tk, f, ids = x["tk"], x["f"], x["ids"]
    a, T = f["pac_a"], "treino-acessos"
    antes = "ver" if f["series_antes"] else "mexer"
    outro = "mexer" if antes == "ver" else "ver"
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "ler", "aluno": a})
    caso("T1", f"a nutri (sem sessão no Treino) lê as séries pelo VÍNCULO (a matrícula A não guarda o treino_user_id) = a foto '{antes}'", st, r, 200,
         r.get("series") == antes, r.get("pode_mudar") is True)
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "valor": outro})
    caso("T2", f"P4: a nutri muda para '{outro}' — grava no Treino e registra no principal", st, r, 200, r.get("series") == outro, r.get("registrado") is True,
         series_no_treino(x) is (outro == "ver"), contar_log(x, "treino_series") == 1)
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "valor": outro})
    caso("T3", "sem mudança: nada grava nem registra", st, r, 200, r.get("registrado") is False, contar_log(x, "treino_series") == 1)
    st, r, _h = chamar(T, tk["w5p-aluna"], {"acao": "ler", "aluno": a})
    caso("T4", "a aluna não lê nem muda", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "ler", "aluno": ids["pac_so_nutri"]})
    caso("T5", "§5.5: matrícula sem o módulo Treino (só nutri)", st, r, 409, r.get("erro") == "sem_modulo")
    st, r, _h = chamar(T, tk["w5p-personal"], {"acao": "ler", "aluno": ids["pac_sem_login"]})
    caso("T6", "§5.5: antes do 1º acesso (sem login, sem vínculo)", st, r, 404, r.get("erro") == "sem_treino")
    st, r, _h = chamar(T, token_do_treino(x), {"acao": "ler", "aluno": a})
    caso("T7", "spec §7: o token do TREINO na treino-acessos (o principal recusa)", st, r, 401, r.get("erro") == "sem_login")
    for i, (corpo, erro) in enumerate((({"action": "get", "aluno": a}, "acao_invalida"), ({"acao": "salvar", "aluno": a, "valor": "travar"}, "dados_invalidos"))):
        st, r, _h = chamar(T, tk["w5p-nutri"], corpo)
        caso(f"T8.{i}", f"forma: {erro}", st, r, 400, r.get("erro") == erro)
    porta(x, T, {"acao": "ler", "aluno": a}, "T9")
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "valor": antes})
    caso("T10", f"de volta à foto ('{antes}')", st, r, 200, r.get("series") == antes, series_no_treino(x) is f["series_antes"])


def grupo_r(x: dict) -> None:
    """R — rotinas: a aluna cria/marca/muda/ordena/apaga; o app sem profissional cria; o profissional cria (com o aviso) e não mexe na da aluna."""
    tk, f, hoje, m = x["tk"], x["f"], x["hoje"], x["marca"]
    a, AD = f["pac_a"], "aluno-dia"
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "id": None, "dono_user_id": f["nutri"], "dados": {
        "nome": f"{m} creatina", "detalhe": "5 g", "tipo": "suplemento", "horario": "08:00", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True,
        "dono_user_id": f["nutri"], "origem": "profissional"}})
    r1 = (r.get("rotina") or {}).get("id")
    caso("R1", "a aluna cria a rotina (o dono = ela, a origem 'aluno' — o que vier no corpo cai)", st, r, 200,
         (r.get("rotina") or {}).get("origem") == "aluno", dono_da_rotina(r1) == f["aluna"])
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "rotinas", "de": hoje, "ate": hoje})
    caso("R2", "ela lê as rotinas de hoje", st, r, 200, any(y.get("id") == r1 for y in r.get("rotinas") or []))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_marcar", "id": r1, "dia": hoje, "feita": True})
    _st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "rotinas", "de": hoje, "ate": hoje})
    caso("R3", "ela marca hoje e o ✓ volta na leitura", st, r, 200, r.get("feita") is True, any(y.get("rotina_id") == r1 for y in r2.get("feitas") or []))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "id": r1, "dados": {"horario": "09:00"}})
    caso("R4", "ela muda o horário", st, r, 200, (r.get("rotina") or {}).get("horario") == "09:00")
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotinas_ordenar", "ids": [r1]})
    caso("R5", "ela ordena", st, r, 200)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} sem hora", "lembrete": True}})
    caso("R6", "§5.5: lembrete sem horário", st, r, 400, r.get("erro") == "dados_invalidos")
    amanha = (dt.date.fromisoformat(hoje) + dt.timedelta(days=1)).isoweekday()
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} só amanhã", "dias_semana": [amanha]}})
    st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_marcar", "id": (r.get("rotina") or {}).get("id"), "dia": hoje, "feita": True})
    caso("R7", "§5.5: marcar fora do dia da semana da rotina", st2, r2, 400, st == 200, r2.get("erro") == "dados_invalidos")
    st, r, _h = chamar(AD, tk["w7b-sozinho"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} água", "tipo": "habito"}})
    caso("R8", "P9: o aluno do app SEM profissional também cria", st, r, 200)
    st, r, _h = chamar(AD, tk["w7b-sozinho"], {"acao": "rotina_arquivar", "id": r1})
    caso("R9", "§5.5: rotina de OUTRO", st, r, 404, r.get("erro") == "nao_encontrado")
    st, r, _h = chamar(AD, tk["w5p-personal"], {"acao": "prof_rotina_salvar", "aluno": a, "dados": {
        "nome": f"{m} remédio", "tipo": "remedio", "horario": "20:00", "lembrete": True}})
    r10 = (r.get("rotina") or {}).get("id")
    caso("R10", "P8: o personal cria uma rotina para ela (origem 'profissional') e o sino avisa (1 por dia)", st, r, 200,
         (r.get("rotina") or {}).get("origem") == "profissional", contar_avisos_hoje(x, TITULOS_WA[1]) == 1)
    st, r, _h = chamar(AD, tk["w5p-personal"], {"acao": "prof_rotina_salvar", "aluno": a, "id": r1, "dados": {"nome": "x"}})
    caso("R11", "§5.5: o profissional não muda a rotina que a aluna criou", st, r, 409, r.get("erro") == "so_do_aluno")
    st, r, _h = chamar(AD, tk["w5p-nutri"], {"acao": "ler", "q": "aluno_rotinas", "aluno": a, "de": dia_menos(hoje, 6), "ate": hoje})
    rot = {y.get("id"): y for y in r.get("rotinas") or []}
    caso("R12", "P7: a nutri vê a da aluna e a do personal (só a do profissional é editável)", st, r, 200, r1 in rot, r10 in rot,
         rot.get(r10, {}).get("pode_editar") is True, rot.get(r1, {}).get("pode_editar") is False)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_arquivar", "id": r10})
    _st2, r2, _h2 = chamar(AD, tk["w5p-nutri"], {"acao": "ler", "q": "aluno_rotinas", "aluno": a, "de": hoje, "ate": hoje})
    arq = next((y for y in r2.get("rotinas") or [] if y.get("id") == r10), {})
    caso("R13", "P8b: a aluna apaga a do profissional e a nutri vê 'apagada pelo aluno'", st, r, 200, arq.get("arquivada_pelo_aluno") is True)
    B.escrever(f"""insert into {S}.rotinas (dono_user_id, origem, nome)
                   select {B.txt(f['aluna'])}, 'aluno', {B.txt(m + ' cheia ')} || g from generate_series(1, greatest(0, 30 - (
                     select count(*) from {S}.rotinas where dono_user_id = {B.txt(f['aluna'])} and arquivada_em is null))::int) g""")
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} a 31ª"}})
    caso("R14", "§5.5: a 31ª rotina viva", st, r, 409, r.get("erro") == "limite")
    for i, (corpo, erro) in enumerate((
        ({"acao": "rotina_salvar", "dados": {"nome": f"{m} {'x' * 60}"}}, "dados_invalidos"),   # o erro PROVOCADO do grupo B (a marca nunca no log)
        ({"acao": "rotinas_ordenar", "ids": [str(uuid.uuid4()) for _ in range(31)]}, "dados_invalidos"),
        ({"acao": "ler", "q": "rotinas", "de": dia_menos(hoje, 31), "ate": hoje}, "dados_invalidos"),
        ({"acao": "ler", "q": "xpto"}, "dados_invalidos"),
        ({"acao": "apagar_tudo"}, "acao_invalida"),
    )):
        st, r, _h = chamar(AD, tk["w5p-aluna"], corpo)
        caso(f"R15.{i}", f"forma: {erro}", st, r, 400, r.get("erro") == erro)
    porta(x, AD, {"acao": "ler", "q": "rotinas", "de": hoje, "ate": hoje}, "R16")


def grupo_d(x: dict) -> None:
    """D — a dieta livre: travada não grava; liberada põe, tira, volta, extra, alimento, receita; os negativos da §5.5; o dia a dia do profissional."""
    tk, f, ids, hoje, m = x["tk"], x["f"], x["ids"], x["hoje"], x["marca"]
    a, AD = f["pac_a"], "aluno-dia"
    no_plano = {"refeicao_id": f["refeicao"], "alimento_id": f["taco"], "quantidade_g": 100}
    st0, _r0, _h0 = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})   # o grupo D sozinho
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": no_plano})
    caso("D1", "§5.5: com a Dieta 'Só ver', ela não põe nada", st, r, 409, st0 == 200, r.get("erro") == "dieta_travada")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "mexer"})
    caso("D2", "a nutri libera a Dieta", st, r, 200, (r.get("linhas") or {}).get("dieta") == "mexer")
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "dia", "dia": hoje})
    mat = {y.get("paciente_id"): y.get("liberada") for y in r.get("matriculas") or []}
    caso("D3", "o dia dela: a matrícula A liberada e o plano ativo da A", st, r, 200, mat.get(a) is True, (r.get("plano_ativo") or {}).get("paciente_id") == a)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_tirar", "dia": hoje, "item": f["item"]})
    st2, _r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "dia_desfazer", "id": (r.get("item") or {}).get("id")})
    caso("D4", "P5: ela tira um item do plano SÓ hoje e volta", st, r, 200, (r.get("item") or {}).get("tipo") == "tirado", st2 == 200)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": no_plano})
    posto = (r.get("item") or {}).get("id")
    caso("D5", "P5: ela põe um alimento da TACO na refeição do plano", st, r, 200, (r.get("item") or {}).get("tipo") == "adicionado")
    for i, (dados, dia, esperado) in enumerate((
        ({"refeicao_id": f["refeicao"], "alimento_id": ids["alimento_fora"], "quantidade_g": 100}, hoje, (404, "nao_encontrado")),   # que ela não enxerga
        ({"refeicao_id": f["refeicao_alheia"], "alimento_id": f["taco"], "quantidade_g": 100}, hoje, (404, "nao_encontrado")),     # de plano que não é dela
        (no_plano, dia_menos(hoje, 2), (400, "dados_invalidos")),                                                                     # anteontem
    )):
        st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": dia, "dados": dados})
        caso(f"D6.{i}", f"§5.5: {esperado[1]}", st, r, esperado[0], r.get("erro") == esperado[1])
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "alimento_salvar", "dados": {"nome": f"{m} pão", "energia_kcal": 280, "proteina_g": 9}})
    alim = (r.get("alimento") or {}).get("id")
    _st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "alimentos", "termo": "e2e", "pagina": 0})
    caso("D7", "P6: ela cria um alimento dela e a busca acha ('meu')", st, r, 200, any(y.get("tipo") == "meu" and y.get("id") == alim for y in r2.get("itens") or []))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "receita_salvar", "dados": {"nome": f"{m} vitamina", "porcoes": 2, "itens": [
        {"alimento_id": f["taco"], "quantidade_g": 200}, {"aluno_alimento_id": alim, "quantidade_g": 100}]}})
    rec = (r.get("receita") or {}).get("id")
    caso("D8", "P6: ela cria uma receita (os macros de 1 porção)", st, r, 200, isinstance((r.get("receita") or {}).get("por_porcao"), dict))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "extra_salvar", "dados": {"dia": hoje, "nome": f"{m} lanche", "horario": "16:00"}})
    ext = (r.get("extra") or {}).get("id")
    st2, _r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": {"extra_id": ext, "aluno_receita_id": rec, "porcoes": 1}})
    st3, r3, _h3 = chamar(AD, tk["w5p-aluna"], {"acao": "extra_marcar", "id": ext, "feita": False})
    st4, _r4, _h4 = chamar(AD, tk["w5p-aluna"], {"acao": "extra_excluir", "id": ext})
    caso("D9", "a refeição extra ('Já comi' ligado), a receita nela, desmarcar e apagar", st, r, 200, (r.get("extra") or {}).get("concluida_em") is not None,
         st2 == 200, st3 == 200 and r3.get("concluida_em") is None, st4 == 200)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "biblioteca"})
    caso("D10", "a biblioteca dela tem o alimento e a receita", st, r, 200, any(y.get("id") == alim for y in r.get("alimentos") or []),
         any(y.get("id") == rec for y in r.get("receitas") or []))
    st, r, _h = chamar(AD, tk["w5p-personal"], {"acao": "ler", "q": "aluno_dia", "aluno": a, "de": dia_menos(hoje, 6), "ate": hoje})
    caso("D11", "Q1: o PERSONAL lê o dia a dia — 'mexer' e o que ela pôs", st, r, 200, r.get("nivel") == "mexer",
         any(y.get("id") == posto for y in r.get("itens") or []))
    st, r, _h = chamar(AD, tk["w5p-nutri"], {"acao": "ler", "q": "aluno_dia", "aluno": a, "de": hoje, "ate": hoje})
    caso("D12", "P7: a nutri lê o dia a dia", st, r, 200, r.get("liberada") is True)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "alimento_excluir", "id": alim})
    st2, _r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "receita_excluir", "id": rec})
    caso("D13", "ela apaga o alimento e a receita (o retrato do dia fica)", st, r, 200, st2 == 200)
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})
    st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": dict(no_plano, quantidade_g=50)})
    _st3, r3, _h3 = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "dia", "dia": hoje})
    caso("D14", "§2.2-12: travada de novo, não põe mais; o que ela registrou fica (a nutri vê)", st2, r2, 409, st == 200, r2.get("erro") == "dieta_travada",
         any(y.get("id") == posto for y in r3.get("itens") or []))


def grupo_x(x: dict) -> None:
    """X — o mesmo login em 2 contas (a 2ª matrícula vive SÓ neste bloco — risco 4): a conta B não lê nem muda o Treino da A (C4), não mexe na
    rotina criada na A (I2), não lê o dia a dia da A; na matrícula dela, lê e pode mudar."""
    tk, f, hoje, m = x["tk"], x["f"], x["hoje"], x["marca"]
    a = f["pac_a"]
    b = B.Massa().segunda_matricula()
    P.check(bool(b), "[X0] a 2ª matrícula da aluna (conta do w13-dono, personal = ele) nasceu")
    st, r, _h = chamar("treino-acessos", tk["w13-dono"], {"acao": "salvar", "aluno": b, "valor": "mexer" if f["series_antes"] else "ver"})
    caso("X1", "C4/§5.5: o dono B não muda o Treino da conta A (pela matrícula B)", st, r, 403, r.get("erro") == "sem_acesso",
         series_no_treino(x) is f["series_antes"])
    st, r, _h = chamar("treino-acessos", tk["w13-dono"], {"acao": "ler", "aluno": b})
    caso("X2", "C4: nem lê", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("aluno-dia", tk["w5p-personal"], {"acao": "prof_rotina_salvar", "aluno": a, "dados": {"nome": f"{m} da conta A", "tipo": "habito"}})
    ra = (r.get("rotina") or {}).get("id")
    st2, r2, _h2 = chamar("aluno-dia", tk["w13-dono"], {"acao": "prof_rotina_salvar", "aluno": b, "id": ra, "dados": {"nome": "x"}})
    st3, _r3, _h3 = chamar("aluno-dia", tk["w13-dono"], {"acao": "prof_rotina_arquivar", "aluno": b, "id": ra})
    caso("X3", "I2/§5.5: a conta B não muda nem apaga a rotina criada na conta A", st2, r2, 404, st == 200, r2.get("erro") == "nao_encontrado", st3 == 404)
    st, r, _h = chamar("aluno-dia", tk["w13-dono"], {"acao": "ler", "q": "aluno_rotinas", "aluno": b, "de": hoje, "ate": hoje})
    caso("X4", "padrão 9: o dono B vê as rotinas da aluna (origem aluno), não as criadas na conta A", st, r, 200,
         ra not in {y.get("id") for y in r.get("rotinas") or []}, {y.get("origem") for y in r.get("rotinas") or []} <= {"aluno"})
    st, r, _h = chamar("aluno-dia", tk["w13-dono"], {"acao": "ler", "q": "aluno_dia", "aluno": a, "de": hoje, "ate": hoje})
    caso("X5", "o dono B não lê o dia a dia da matrícula A", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("acessos", tk["w13-dono"], {"acao": "ler", "aluno": b})
    caso("X6", "na matrícula dele, o dono B lê e pode mudar", st, r, 200, r.get("pode_mudar") is True)


def grupo_y(x: dict) -> None:
    """Y — P4: o DONO sem papel de personal (a Massa troca os papéis com a volta guardada) muda uma linha e as séries (pela admin-semana-treinos
    ele só lia)."""
    tk, f = x["tk"], x["f"]
    a = f["pac_a"]
    B.Massa().trocar_papeis("w5p-personal", "w5p-personal", ["dono"])
    st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "chave": "diario_alimentar", "valor": "bloqueado"})
    st2, _r2, _h2 = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "chave": "diario_alimentar", "valor": "liberado"})
    caso("Y1", "P4: o dono sem papel muda o diário com fotos (e volta)", st, r, 200, (r.get("linhas") or {}).get("diario_alimentar") == "bloqueado", st2 == 200)
    outro, antes = ("mexer", "ver") if f["series_antes"] else ("ver", "mexer")
    st, r, _h = chamar("treino-acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "valor": outro})
    st2, _r2, _h2 = chamar("treino-acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "valor": antes})
    caso("Y2", "P4: o dono sem papel muda as séries pela treino-acessos e volta", st, r, 200, r.get("registrado") is True, st2 == 200,
         series_no_treino(x) is f["series_antes"])


# ───────────────────────── os logs da borda (só contagens; o conteúdo nunca chega aqui) ─────────────────────────
SQL_LINHAS = ("SELECT log_attributes['function_id'] AS fid, count() AS total, "
              "countIf(isValidJSON(event_message) AND startsWith(trimLeft(event_message), '{\"nivel\":')) AS em_json, "
              "countIf(position(event_message, '<MARCA>') > 0) AS com_marca, "
              "countIf(position(event_message, '\"codigo\":\"dados_invalidos\"') > 0 AND position(event_message, '\"acao\":\"rotina_salvar\"') > 0 "
              "AND position(event_message, '\"resultado\":\"nome\"') > 0) AS provocado "
              "FROM logs WHERE source = 'function_logs' AND log_attributes['event_type'] = 'Log' GROUP BY fid")
SQL_BORDA = ("SELECT log_attributes['function_id'] AS fid, log_attributes['response.status_code'] AS st, count() AS n "
             "FROM logs WHERE source = 'function_edge_logs' GROUP BY fid, st")


def _logs():
    esp = importlib.util.spec_from_file_location("_logs_supabase_wa", REPO / "e2e" / "hml10" / "_logs_supabase.py")
    mod = importlib.util.module_from_spec(esp)
    esp.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def contagens_dos_logs(desde: dt.datetime, marca: str) -> dict:
    """Por função da W-A, desde `desde`: as linhas do log (total, em JSON, com a marca, a recusa provocada) e os 5xx da borda."""
    L = _logs()
    fim = L.agora()
    saida = {f: {"total": 0, "em_json": 0, "com_marca": 0, "provocado": 0, "5xx": 0} for f in ("acessos", "aluno-dia", "treino-acessos")}
    for ref in (B.PRINCIPAL_REF, B.TREINO_REF):
        nomes = L.funcoes(ref)
        for linha in L.consulta(ref, SQL_LINHAS.replace("<MARCA>", marca.replace("'", "")), desde, fim):
            f = nomes.get(linha.get("fid") or "")
            if f in saida:
                for k in ("total", "em_json", "com_marca", "provocado"):
                    saida[f][k] += int(linha.get(k) or 0)
        for linha in L.consulta(ref, SQL_BORDA, desde, fim):
            f = nomes.get(linha.get("fid") or "")
            if f in saida and str(linha.get("st") or "").isdigit() and int(linha["st"]) >= 500:
                saida[f]["5xx"] += int(linha.get("n") or 0)
    return saida


def grupo_b(x: dict) -> None:
    """B — §5.6, os logs da borda: a recusa provocada (R15.0: o nome com 61, com a marca) aparece no log da aluno-dia SÓ com o código, a ação e o campo; nenhuma
    linha das 3 tem a marca da rodada; tudo no JSON do _shared/log.ts; nenhum 5xx na borda. A ingestão atrasa: até 5 min, de 30 em 30 s."""
    desde = _logs().ler_iso(x["inicio"])
    c: dict = {}
    for _ in range(10):
        c = contagens_dos_logs(desde, x["marca"])
        if c["aluno-dia"]["provocado"] >= 1:
            break
        time.sleep(30)
    P.check(c["aluno-dia"]["provocado"] >= 1, f"[B1] a recusa provocada está no log da aluno-dia só com o código, a ação e o campo ({c['aluno-dia']['provocado']})")
    P.check(all(v["com_marca"] == 0 for v in c.values()), f"[B2] nenhuma linha das 3 tem a marca da rodada: {[v['com_marca'] for v in c.values()]}")
    P.check(all(v["em_json"] == v["total"] and v["total"] > 0 for v in c.values()),
            f"[B3] 100% das linhas no JSON do _shared/log.ts: {[(k, v['em_json'], v['total']) for k, v in c.items()]}")
    P.check(all(v["5xx"] == 0 for v in c.values()), f"[B4] nenhum 5xx na borda desde o começo da rodada: {[v['5xx'] for v in c.values()]}")


def rodada_staging(grupos: set[str]) -> None:
    B.exigir_saude("o api.py da W-A (staging)")
    rod = Rodada()
    if rod.e:
        raise SystemExit(f"há o estado de uma rodada anterior ({ESTADO}): rode python3 e2e/wa/api.py --limpar antes")
    f = foto()
    rid = time.strftime("%m%d-%H%M")
    rod.e = {"inicio": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "rodada": rid, "marca": f"{B.MARCA} {rid}",
             "aluna": f["aluna"], "sozinho": f["sozinho"], "pac_a": f["pac_a"], "config_a": f["config_a"], "acessos_a": f["acessos_a"],
             "treino_user_id": f["treino_user_id"], "series_antes": f["series_antes"], "alimentos": []}
    rod.guardar()
    logins = B.Logins()
    try:
        tk = {k: logins.token(k) for k in ("w5p-nutri", "w5p-personal", "w5p-aluna", "w7b-sozinho", "w13-dono", "w27-master")}
        x = {"f": f, "tk": tk, "hoje": f["hoje"], "marca": rod.e["marca"], "inicio": rod.e["inicio"], "logins": logins, "ids": massa_basica(rod, f)}
        for g, fn in (("A", grupo_a), ("T", grupo_t), ("R", grupo_r), ("D", grupo_d), ("X", grupo_x), ("Y", grupo_y), ("B", grupo_b)):
            if g in grupos:
                B.exigir_saude(f"o grupo {g}")
                fn(x)
    finally:
        sobras = limpar(rod)
        P.check(all(v == 0 for v in sobras.values()), f"[Z] a massa da rodada desfeita (staging e Treino): sobras {sobras}")
        logins.fechar(_Saida())


# ───────────────────────── --limpar ─────────────────────────
def _config_sql(cfg: object) -> str:
    return "null" if cfg is None else f"{B.txt(json.dumps(cfg))}::jsonb"


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    al, so, ini, marca = B.txt(e["aluna"]), B.txt(e["sozinho"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
    titulos = ", ".join(B.txt(t) for t in TITULOS_WA)
    r = B.ler(f"""select (select count(*) from {S}.rotinas where dono_user_id in ({al}, {so}) and nome like {marca}) as rotinas,
                         (select count(*) from {S}.aluno_alimentos where dono_user_id in ({al}, {so}) and nome like {marca}) as alimentos,
                         (select count(*) from {S}.aluno_receitas where dono_user_id in ({al}, {so}) and nome like {marca}) as receitas,
                         (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id in ({al}, {so}) and nome like {marca}) as extras,
                         (select count(*) from {S}.aluno_dia_itens where dono_user_id in ({al}, {so}) and criado_em >= {ini}) as itens_do_dia,
                         (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and titulo in ({titulos})
                            and criado_em >= {ini}) as avisos,
                         (select count(*) from {S}.alimentos where nome like {marca}) as alimento_fora,
                         ((select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel) order by x.chave), '[]'::jsonb)
                             from {S}.aluno_acessos x where x.paciente_id = {B.txt(e['pac_a'])})
                           is distinct from {B.txt(json.dumps([{'chave': y['chave'], 'nivel': y['nivel']} for y in e.get('acessos_a') or []]))}::jsonb)::int
                           as acessos_diferentes,
                         ((select config from {S}.pacientes where id = {B.txt(e['pac_a'])}) is distinct from {_config_sql(e.get('config_a'))})::int
                           as config_diferente""")[0]
    t = B.C.ler(B.TREINO_REF, f"""select (series_travadas is distinct from {'true' if e.get('series_antes') else 'false'})::int as series_diferente
                                   from {S}.physiq_profiles where id = {B.txt(e.get('treino_user_id'))}""")
    return {**{k: int(v) for k, v in r.items()}, "series_diferente": int(t[0]["series_diferente"]) if t else 0}


def limpar(rod: Rodada | None = None) -> dict:
    """Desfaz a massa do estado (staging e o series_travadas do Treino) e a da Massa do _base.py; devolve as sobras (tudo 0 = limpo)."""
    rod = rod or Rodada()
    e = rod.e
    sobras: dict = {}
    if e:
        al, so, ini, marca = B.txt(e["aluna"]), B.txt(e["sozinho"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
        comandos = [
            f"delete from {S}.aluno_dia_itens where dono_user_id in ({al}, {so}) and criado_em >= {ini}",
            f"delete from {S}.aluno_dia_refeicoes where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"delete from {S}.aluno_receitas where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"delete from {S}.aluno_alimentos where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"delete from {S}.rotinas where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"update {S}.pacientes set config = {_config_sql(e.get('config_a'))} where id = {B.txt(e['pac_a'])}",
            f"delete from {S}.aluno_acessos where paciente_id = {B.txt(e['pac_a'])}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({B.txt(e['pac_a'])}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []],
            f"delete from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}",
            f"""delete from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and criado_em >= {ini}
                 and titulo in ({', '.join(B.txt(t) for t in TITULOS_WA)})""",
        ]
        if e.get("alimentos"):
            comandos.append(f"delete from {S}.alimentos where id = any(array[{', '.join(B.txt(i) for i in e['alimentos'])}]::uuid[]) and nome like {marca}")
        for c in comandos:
            B.escrever(c)
        if e.get("treino_user_id") and isinstance(e.get("series_antes"), bool):
            B.C.C2.sql_mgmt(B.TREINO_REF, f"update {S}.physiq_profiles set series_travadas = {'true' if e['series_antes'] else 'false'} "
                                          f"where id = {B.txt(e['treino_user_id'])}")
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()   # a 2ª matrícula, as "sem login"/"só nutri" e os papéis do w5p-personal
    rod.e = {}
    rod.guardar()
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


# ───────────────────────── --so-leitura: a PRODUÇÃO, só leitura ─────────────────────────
def so_leitura(corpo: object) -> object:
    """A trava do --so-leitura: nenhum corpo com uma GRAVAÇÃO de verdade sai daqui (nem inválido) — risco 9 do mestre."""
    if isinstance(corpo, dict) and corpo.get("acao") in GRAVACOES:
        raise SystemExit(f"PAROU: o --so-leitura ia mandar uma gravação ({corpo.get('acao')}) para a PRODUÇÃO")
    return corpo


def rodada_producao(desde: str | None) -> None:
    B.usar_schema("public")
    B.exigir_saude("o smoke só leitura da W-A (produção)")
    logins = B.Logins()
    pr = lambda f, tok, corpo, **kw: chamar(f, tok, so_leitura(corpo), schema=kw.get("schema", "public"), origem=ORIGEM_PROD)  # noqa: E731
    try:
        tk = {k: logins.token(k) for k in ("w5p-personal", "w5p-aluna")}
        hoje = B.ler("select (now() at time zone 'America/Sao_Paulo')::date::text as d")[0]["d"]
        for f in ("acessos", "aluno-dia", "treino-acessos"):
            st, ao = preflight(f, ORIGEM_PROD)
            caso(f"P1/{f}", "OPTIONS: o CORS do site", st, {}, 200, ao == ORIGEM_PROD)
            st, r, _h = pr(f, None, {"acao": "ler"})
            caso(f"P2/{f}", "sem login → 401", st, r, 401)
            st, r, _h = pr(f, tk["w5p-personal"], {"acao": "ler"}, schema="xpto")
            caso(f"P3/{f}", "x-schema fora da lista → 400", st, r, 400)
            st, r, _h = pr(f, tk["w5p-personal"], {"acao": "acao_que_nao_existe"})
            caso(f"P4/{f}", "ação desconhecida → 400, recusada antes de qualquer RPC", st, r, 400, r.get("erro") == "acao_invalida")
        st, r, _h = pr("acessos", tk["w5p-personal"], {"acao": "ler", "aluno": FALSO})
        caso("P5", "acessos › ler um aluno que não existe (a RPC existe no public)", st, r, 404, r.get("erro") == "aluno_inexistente")
        for i, (q, extra) in enumerate((("rotinas", {"de": hoje, "ate": hoje}), ("dia", {"dia": hoje}), ("biblioteca", {}),
                                        ("alimentos", {"termo": "arroz", "pagina": 0}))):
            st, r, _h = pr("aluno-dia", tk["w5p-aluna"], {**extra, "q": q, "acao": "ler"})
            caso(f"P6.{i}", f"aluno-dia › ler {q} da conta de TESTE no public", st, r, 200, r.get("ok") is True)
        st, r, _h = pr("aluno-dia", tk["w5p-personal"], {"acao": "ler", "q": "aluno_rotinas", "aluno": FALSO, "de": hoje, "ate": hoje})
        caso("P7", "aluno-dia › aluno_rotinas de um aluno que não existe", st, r, 404, r.get("erro") == "aluno_inexistente")
        st, r, _h = pr("treino-acessos", tk["w5p-personal"], {"acao": "ler", "aluno": FALSO})
        caso("P8", "treino-acessos › ler um aluno que não existe (o principal responde pelo Treino)", st, r, 404, r.get("erro") == "aluno_inexistente")
        if desde:
            c = contagens_dos_logs(_logs().ler_iso(desde), "marca-que-nao-existe-wa")
            P.check(all(v["5xx"] == 0 for v in c.values()), f"[P9] nenhum 5xx das 3 na borda desde a publicação: {[v['5xx'] for v in c.values()]}")
            P.check(all(v["em_json"] == v["total"] for v in c.values()), f"[P10] 100% das linhas em JSON: {[(k, v['em_json'], v['total']) for k, v in c.items()]}")
    finally:
        logins.fechar(_Saida())


def main() -> int:
    ap = argparse.ArgumentParser()
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true")
    modo.add_argument("--local", action="store_true")
    modo.add_argument("--so-leitura", action="store_true")
    modo.add_argument("--limpar", action="store_true")
    ap.add_argument("--grupos", default="A,T,R,D,X,Y,B")
    ap.add_argument("--desde", default="")
    a = ap.parse_args()
    if a.seco:
        rodada_seca()
        return P.fim()
    if a.local:
        rodada_local()
        return P.fim()
    if a.limpar:
        print("sobras depois de limpar:", limpar())
        return 0
    if a.so_leitura:
        rodada_producao(a.desde or None)
        return P.fim()
    rodada_staging({g.strip().upper() for g in a.grupos.split(",") if g.strip()})
    return P.fim()


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: O `local.sh`** — `~/projetos/physiqcalc-scratch/w-a/p2/local.sh`:

```bash
#!/usr/bin/env bash
# W-A P2 — o api.py no modo --seco ou --local (as rodadas vão para o rodadas-locais.tsv, NÃO para o oficial), na fila do pesado.
# uso: bash local.sh --seco | --local
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PYTHONDONTWRITEBYTECODE=1
export PHYSIQ_E2E_REGISTRO="$HOME/projetos/physiqcalc-scratch/w-a/p2/rodadas-locais.tsv"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
cd "$HOME/projetos/physiqcalc-wa-p2" || exit 9
if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
flock "$P" python3 e2e/wa/api.py "${1:?--seco ou --local}"
```

- [ ] **Step 6: O seco e o local**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/local.sh --seco | tail -3 && bash ~/projetos/physiqcalc-scratch/w-a/p2/local.sh --local | tail -4`
Expected: o `--seco` com tudo ✅ (2 + 4 + 22 + 13 + 2 + 3 + 1 + 1 = 48/48) e o `--local` com tudo ✅ (os L1–L40: `95/95 ok` — o número do ensaio; a 1ª vez o Deno baixa o
`supabase-js` do esm.sh — até ~1 min a mais). Um ❌ no L17 (`p_*` diferente) = a regra está errada (a migration é a verdade); no L26–L35 = um passo
da `treino-acessos`; no L40 = algo indo ao log que não devia. Corrigir e repetir; o log do Deno fica em `~/projetos/physiqcalc-scratch/w-a/p2/deno-*.log`.

- [ ] **Step 7: Commit**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git status --short && git add e2e/wa/supabase_falso.py e2e/wa/api.py && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w-a): o E2E de servidor da P2 — o falso do Supabase e o api.py (seco, local no Deno, staging por papel, só leitura na produção, limpar)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/wa/supabase_falso.py e2e/wa/api.py
```

---

### Task 14: `api.py` — o mapa §5.5/§7/papéis → caso, o `--limpar` vazio, o commit

**Files:** Modify `e2e/wa/api.py` SÓ se o mapa achar buraco; fora do repo: `~/projetos/physiqcalc-scratch/w-a/p2/mapa_casos.py`.
**Estimativa:** 20 min (calibrado 11–13).

- [ ] **Step 1: O mapa** — gravar `~/projetos/physiqcalc-scratch/w-a/p2/mapa_casos.py`:

```python
#!/usr/bin/env python3
"""W-A P2 (Task 14) — o mapa da spec → os casos do e2e/wa/api.py: §5.5 (cada recusa), §7 (os negativos citados), §5.2 (a porta, a forma, o
status, os 6 passos da treino-acessos), §5.6 (os logs), os papéis (P4–P9, Q1), a C4/I2 da revisão e as decisões 2 e 13. Cada item tem de ter
TODOS os seus casos no arquivo (o id escrito como caso("X…"), [X…] ou o último argumento do porta(…)). Só lê o arquivo, sem rede.
Uso: python3 mapa_casos.py   (saída 0 = nenhum buraco)"""
import re
from pathlib import Path

API = Path.home() / "projetos" / "physiqcalc-wa-p2" / "e2e" / "wa" / "api.py"
MAPA = {
    "§5.5 a aluna mudando acesso/dieta/séries → sem_acesso": ["A3", "T4"],
    "§5.5 o profissional de OUTRA conta → sem_acesso": ["A4", "X5"],
    "§5.5 chave/valor/ação fora da lista": ["A10", "T8", "L10", "S2", "S6"],
    "§5.5 o App de quem não tem login → sem_login_do_aluno": ["A11", "L11"],
    "§5.5 Dieta/Diário/Link sem nutricionista (o app sem profissional) → sem_nutricao": ["A12", "L11"],
    "§5.5 séries sem o módulo Treino → sem_modulo": ["T5", "L25"],
    "§5.5 séries antes do 1º acesso → sem_treino": ["T6", "L28"],
    "§5.5 séries de um Treino de OUTRA conta (C4) → sem_acesso": ["X1", "X2", "L29"],
    "§5.5 dieta travada → dieta_travada": ["D1", "D14", "L19"],
    "§5.5 dieta fora de hoje/ontem, refeição que não é de plano dele, alimento que ele não enxerga": ["D6"],
    "§5.5 acima dos limites (a forma e o banco)": ["R14", "R15", "L18", "S4"],
    "§5.5 rotina de outro → nao_encontrado": ["R9", "L19"],
    "§5.5 o profissional mudando rotina do aluno → so_do_aluno": ["R11", "L19"],
    "§5.5 rotina criada em OUTRA matrícula (I2) → nao_encontrado": ["X3"],
    "§5.5 a 31ª rotina → limite": ["R14"],
    "§5.5 lembrete sem horário": ["R6", "S4"],
    "§5.5 marcar fora do dia da semana": ["R7"],
    "§7 o token do Treino na treino-acessos → 401": ["T7"],
    "§5.2 a porta: CORS, sem login, token falso, x-schema, 405, 413, o freio": ["A13", "T9", "R16", "L1", "L2", "L3", "L4", "L5", "L15", "L16", "L21"],
    "§5.2 a forma antes da RPC, a RPC e os p_* da migration; dono/paciente do corpo caem": ["S1", "S3", "S5", "L7", "L9", "L17", "L18", "L22"],
    "§5.2 o status de cada código; o desconhecido → 500/502": ["L11", "L12", "L13", "L19", "L23", "L24"],
    "§5.2 treino-acessos: vínculo, guardado, trava, UMA gravação, registro que falha, schema": ["L26", "L27", "L30", "L31", "L32", "L33", "L34", "L35",
                                                                                             "T1", "T2", "T3", "T10"],
    "decisão 2: a volta da acessos sem os ids internos": ["A1", "L8"],
    "decisão 13: o getUser em todo pedido, nenhum JWKS (a porta da 21a sem a opção)": ["L6"],
    "§5.6 os logs: só código/ação/campo, nunca o nome, 100% JSON, 0 5xx": ["L40", "B1", "B2", "B3", "B4"],
    "P4: nutri, personal, master e o DONO sem papel mudam (acessos e séries)": ["A2", "A6", "A8", "T2", "Y1", "Y2"],
    "P5/P6: liberada, a aluna põe, tira, volta e cria alimento/receita/extra": ["D3", "D4", "D5", "D7", "D8", "D9", "D10", "D13"],
    "P7/Q1: a nutri e o personal veem o dia a dia e as rotinas": ["D11", "D12", "R12"],
    "P8/P8b: o profissional cria (aviso 1/dia); a aluna apaga e ele vê": ["R10", "R13"],
    "P9: o aluno do app sem profissional cria rotina": ["R8"],
    "o aviso no sino 1 por dia (a Dieta)": ["A6", "A7"],
    "o histórico: pelo gatilho (o link) e pelo registro (as séries)": ["A9", "T2", "T3"],
    "padrão 9: a conta B vê as rotinas da aluna, não as da conta A; lê a matrícula dela": ["X4", "X6"],
    "a massa desfeita (sobras 0)": ["Z"],
    "a produção só leitura: a trava cobre as gravações + os casos": ["S8", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
}
texto = API.read_text(encoding="utf-8")
ids = set(re.findall(r'caso\(f?"([A-Z][0-9]+)', texto)) | set(re.findall(r"\[([A-Z][0-9]+)", texto))
ids |= set(re.findall(r'^\s*porta\(x, .*"([A-Z][0-9]+)"\)\s*$', texto, re.M))
if "[Z]" in texto:
    ids.add("Z")
buracos = {item: [c for c in casos if c not in ids] for item, casos in MAPA.items()}
buracos = {k: v for k, v in buracos.items() if v}
for item, faltam in buracos.items():
    print(f"❌ {item}: falta {faltam}")
print(f"mapa: {len(MAPA) - len(buracos)}/{len(MAPA)} itens com todos os casos ({len(ids)} ids no api.py)")
raise SystemExit(1 if buracos else 0)
```

Run: `cd ~/projetos/physiqcalc-scratch/w-a/p2 && python3 mapa_casos.py`
Expected: `mapa: 35/35 itens com todos os casos`. Um `❌` = um caso que a spec pede e o `api.py` não tem → escrever o caso no grupo certo (o
molde dos vizinhos), rodar o `--seco`/`--local` de novo (Step 3) e repetir. (Fica de fora, de propósito: a escrita direta nas tabelas novas — a
P1 provou no `sql_wa.py`; o limite de 100 itens no dia e o 429 no staging — caros, provados na forma e no `--local`.)

- [ ] **Step 2: O `--limpar` vazio (SÓ LEITURA quando os 2 estados estão vazios)**

Run: `cat ~/projetos/physiqcalc-scratch/w-a/massa-estado.json; ls ~/projetos/physiqcalc-scratch/w-a/api-estado.json`
Expected: `{"matriculas": [], "papeis": []}` (a P1 deixou vazio) e `No such file or directory`. **Só assim** (com id no `massa-estado.json`, o
`--limpar` mandaria um `delete` ao staging — fica para a Task 17, com o 🔒):
`cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/api.py --limpar`
→ `sobras depois de limpar: {'massa_matriculas': 0, 'massa_rotinas': 0, 'massa_aluno_alimentos': 0, 'massa_aluno_receitas': 0, 'massa_aluno_dia_refeicoes': 0}`
(o caminho do `--limpar` roda sem erro; o `api-estado.json` passa a existir com `{}` — o staging aceita `{}` como "sem rodada anterior").

- [ ] **Step 3: Se o Step 1 mexeu no `api.py`** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/local.sh --seco | tail -2 && bash ~/projetos/physiqcalc-scratch/w-a/p2/local.sh --local | tail -3` → tudo ✅.

- [ ] **Step 4: Commit (só se mudou)**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git diff --quiet -- e2e/wa/api.py || git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w-a): o api.py cobre o mapa da §5.5 e dos papéis" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/wa/api.py
```
`bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T14 | ✅ mapa 35/35, --limpar vazio 0"`; `T14-FEITA` com a saída do mapa.

---

### Task 15: A prova local completa (os checadores do CI + as provas da P2)

**Files:** nenhum do repo (só se um checador achar algo — aí a correção vai no commit da task dona do arquivo); fora: `prova_local.sh`.
**Estimativa:** 15 min (calibrado 8–10).

- [ ] **Step 1: O script** — `~/projetos/physiqcalc-scratch/w-a/p2/prova_local.sh`:

```bash
#!/usr/bin/env bash
# W-A P2 (Tasks 15 e 16) — a prova LOCAL inteira, um passo por vez na fila do pesado (o que o CI do PR roda + as provas da P2); a saída de
# cada passo em prova-<passo>.txt. Os scripts que já pegam a fila (deno_check.sh, local.sh) rodam SEM o flock daqui (flock dentro de flock
# no mesmo arquivo = trava para sempre).
# uso: bash prova_local.sh               (tudo)
#      bash prova_local.sh --sem-build   (sem o build + chunks: a Task 16, depois do rebase — as telas não importam nada da P2)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PYTHONDONTWRITEBYTECODE=1 PATH="$HOME/.local/node/bin:$PATH"
export PHYSIQ_E2E_REGISTRO="$HOME/projetos/physiqcalc-scratch/w-a/p2/rodadas-locais.tsv"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p2"
cd "$HOME/projetos/physiqcalc-wa-p2" || exit 9
if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
resumo=""
passo() {
  local nome="$1"
  shift
  echo "── $nome ($(date +%T))"
  "$@" > "$S/prova-$nome.txt" 2>&1
  local rc=$?
  tail -3 "$S/prova-$nome.txt"
  resumo="$resumo $nome=$rc"
}
passo lint flock "$P" npm run lint
passo tipos flock "$P" npm run tipos
passo definer flock "$P" node scripts/ci/checar-definer.mjs
passo test-node flock "$P" npm run test:node
passo vitest flock "$P" npx vitest run --maxWorkers=2
if [ "${1:-}" != "--sem-build" ]; then
  passo build flock "$P" npx vite build
  passo chunks node scripts/ci/checar-chunks.mjs dist
fi
passo deno bash "$S/deno_check.sh" acessos aluno-dia treino-acessos financeiro treino-leitura
passo seco bash "$S/local.sh" --seco
passo local bash "$S/local.sh" --local
passo guarda flock "$P" python3 e2e/hml19/guarda_teste.py
passo mapa python3 "$S/mapa_casos.py"
echo "── git status --short (vazio = tudo commitado)"
git status --short
echo "── fim $(date +%T):$resumo"
```

- [ ] **Step 2: Rodar**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p2/prova_local.sh 2>&1 | tail -40`
Expected: `── fim HH:MM:SS: lint=0 tipos=0 definer=0 test-node=0 vitest=0 build=0 chunks=0 deno=0 seco=0 local=0 guarda=0 mapa=0` e o `git status`
vazio. `deno` ≠ 0 só vale se o erro for o MESMO da `financeiro`/`treino-leitura` (herdado de um `_shared`, anotado nas Tasks 6–8) — erro numa
das 3 novas = corrigir. `vitest`: o total de testes do repo + os da P2 (as 8 provas novas e as listas). Um vermelho → a causa na saída
`~/projetos/physiqcalc-scratch/w-a/p2/prova-<passo>.txt`, corrigir na task dona, commit, rodar de novo SÓ o passo (o comando do `passo`).

- [ ] **Step 3: Marcar** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T15 | ✅ prova local: lint, tipos, definer, test:node, vitest, build, chunks, deno, seco 48/48, local 95/95, guarda, mapa 35/35"`;
  `T15-FEITA` com a linha do `fim` e os placares do `--seco`/`--local`; `touch ~/projetos/physiqcalc-scratch/w-a/p2/PRONTO-PARA-REBASE`; o aviso de
  progresso (a previsão recalculada pelo relógio).

---

### Task 16: Rebase na `main` com a hml-21a + a prova de novo (a porta nova + o `jose`)

**Files:** só os pontos de encontro, na resolução (UNIÃO); `src/integrations/semBancoNoNavegador.test.ts` SÓ com o "pode ir" explícito da
LINUX 1 (defeito 1).
**Estimativa:** 20 min (calibrado 11–13).
**Quando:** com a hml-21a (squash + bump) na `origin/main` — a LINUX 1 avisa; o git dela ~01:45 → ~03:15 — e ANTES do push e da publicação
(decisão 14). A `main` ainda sem a 21a quando o código ficar pronto → esperar (≤ 1 h; depois, perguntar — ver "Horários").

- [ ] **Step 1: A `main` nova (comando ISOLADO)**

Run: `git -C ~/projetos/physiqcalc-wa-p2 fetch origin && git -C ~/projetos/physiqcalc-wa-p2 log origin/main --oneline -4 && git -C ~/projetos/physiqcalc-wa-p2 status --short && git -C ~/projetos/physiqcalc-wa-p2 grep -c "jwtLeitura" origin/main -- supabase-principal/functions/_shared/porta-pessoa.ts`
Expected: no topo, `chore: bump version to v3.1xx [skip ci]` sobre o squash da hml-21a; o `status` vazio; `jwtLeitura` ≥ 1 na porta da `main`
(a 21a entrou). Sem isso → não rebasear ainda.

- [ ] **Step 2: O rebase**

Run: `cd ~/projetos/physiqcalc-wa-p2 && git rebase origin/main`
Expected: conflito provável SÓ nos pontos de encontro que as 2 mexeram: `e2e/hml17/_base.py`, `e2e/w26/prod.py`, `e2e/hml19/guarda_teste.py`,
`src/lib/logsDasFuncoesPrincipal.test.ts` (o topo do `docs/e2e-rodadas.md` só entra na Task 19 — sem conflito aqui). Resolver por **UNIÃO**: as
linhas da 21a (`conta`, `prof_planos`, o fecho com os `_shared` dela, os casos novos do `guarda_teste`) E as da P2 (as 3 funções, `acessos-regras.ts`,
`aluno-dia-regras.ts`, a guarda de fonte, os 30 casos); nada de um lado sai; os totais escritos no texto (ex.: "+ 30 da W-A", a contagem de casos)
somam os 2 lados. Nunca `git checkout --ours/--theirs` no arquivo inteiro. A cada arquivo: `git add <arquivo>`; depois
`cd ~/projetos/physiqcalc-wa-p2 && GIT_EDITOR=true git rebase --continue`. Conflito FORA da lista (um arquivo da P2 que a 21a também mexeu) →
`git rebase --abort`, avisar o coordenador com o nome do arquivo e esperar.

- [ ] **Step 3: A guarda nova da 21a (defeito 1)**

Run: `cd ~/projetos/physiqcalc-wa-p2 && grep -n '"src/acessos/api.ts"' src/integrations/semBancoNoNavegador.test.ts; bash ~/projetos/physiqcalc-scratch/w-a/p2/vitest.sh src/integrations/semBancoNoNavegador.test.ts src/aluno-dia/semBancoDireto.test.ts 2>&1 | tail -6`
Expected: a linha no `SESSAO_ANTES_DA_FUNCAO` (a LINUX 1 pôs) e as 2 guardas PASS. Sem a linha → FAIL com
`src/acessos/api.ts › auth:getSession (1 × 0)`: com o "pode ir" EXPLÍCITO da LINUX 1 (pedido na Task 0, Step 5; sem resposta → perguntar de novo
por `SendMessage` e esperar), acrescentar SÓ `"src/acessos/api.ts",` no fim da lista `SESSAO_ANTES_DA_FUNCAO` (Edit), rodar de novo → PASS e:

```bash
cd ~/projetos/physiqcalc-wa-p2 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(guardas): src/acessos/api.ts no SESSAO_ANTES_DA_FUNCAO — o getSession da treino-acessos (com o ok da hml-21)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/integrations/semBancoNoNavegador.test.ts
```
Sem o "pode ir" → NÃO editar (a guarda é dela); a publicação (Task 17) não depende disto, o push (Task 19) sim → parar antes do push e avisar.

- [ ] **Step 4: A P2 não depende do caminho antigo da porta (a checagem pedida pela LINUX 1)**

Run: `cd ~/projetos/physiqcalc-wa-p2 && git grep -n -e jwtLeitura -e jwks -- supabase-principal/functions/acessos supabase-principal/functions/aluno-dia supabase-principal/functions/_shared/acessos-regras.ts supabase-principal/functions/_shared/aluno-dia-regras.ts; git grep -n "servirComoPessoa(" -- supabase-principal/functions/acessos supabase-principal/functions/aluno-dia && git diff 110b228 origin/main --stat -- supabase-principal/functions/_shared/porta-pessoa.ts && git diff 110b228 origin/main -- supabase-principal/functions/_shared/porta-pessoa.ts | grep -E "^[-+](export|import| *jwtLeitura|async function|  const userId|  if \(!userId)"`
Expected: o 1º `grep` VAZIO (a P2 não usa a opção nova nem o JWKS); as 2 chamadas `servirComoPessoa("acessos", { freio: 120 }, …)` e
`("aluno-dia", { freio: 240 }, …)` (sem `jwtLeitura`); na porta, de código, só: `+import { conferirJwtLocal } …`, `+  jwtLeitura?: "jwks";`,
`+async function quemChama(…)`, `+  const userId = await quemChama(…)`, `+  if (!userId) …` — os `export` (`servirComoPessoa`, `ContextoPessoa`,
`OpcoesPorta`) com os MESMOS campos (`schema, origin, corpo, userId, comoPessoa, log, prazo`). Sem a opção, `quemChama` faz o `getUser` de antes
→ a P2 vê a mesma porta. Algo além disso na porta (outro campo, outro código de erro, outra ordem antes do handler) → ler, anotar no
`T16-FEITA` e conferir no `--local` (Step 5) os casos que dependem dele.

- [ ] **Step 5: A prova de novo, DEPOIS do rebase (o bundle das 2 do principal leva o `jose`)**

Run: `cd ~/projetos/physiqcalc-wa-p2 && DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno info supabase-principal/functions/acessos/index.ts | grep -c "esm.sh/jose" && DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno info supabase-principal/functions/aluno-dia/index.ts | grep -c "esm.sh/jose" && bash ~/projetos/physiqcalc-scratch/w-a/p2/prova_local.sh --sem-build 2>&1 | tail -30`
Expected: `jose` ≥ 1 no grafo das 2 (o `deno info` só lê o grafo); no `prova_local.sh`: `lint=0 tipos=0 definer=0 test-node=0 vitest=0 deno=0
seco=0 local=0 guarda=0 mapa=0` e o `git status` vazio. O que prova a porta nova: o `deno check` das 2 COM o `jose` (Step do `deno`); no
`--local`, as 2 funções SOBEM com o `jose` no grafo (`--allow-env`: o `jwks-principal.ts` lê o `SUPABASE_URL` ao carregar; o `jose` vem do esm.sh
pela lista padrão de imports do Deno 2), a porta (L1–L5, L15, L16) igual, e o **L6: 6 `GET /auth/v1/user` nas 6 leituras e 0 ida ao JWKS** (sem
a opção, nada de JWKS); o Vitest inteiro com o `portaPessoa.test.ts` da 21a junto com os da P2.

- [ ] **Step 6 (SÓ se a Task 17 publicou ANTES do rebase — a exceção dos "Horários", com o OK da LINUX 1): republicar as 2 do principal**
  — com o 🔒 BANCO e o "pode ir": `bash ~/projetos/physiqcalc-scratch/w-a/p2/publicar.sh acessos aluno-dia` → `python3 ~/projetos/physiqcalc-scratch/w-a/p2/funcoes_p2.py --esperar-publicadas`
  → `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/api.py --grupos A,R,B | tail -3`
  (as 2 do principal de novo, com a marca e o log) → a Task 18 de novo.

- [ ] **Step 7: Marcar** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T16 | ✅ rebase em <sha da main>; conflitos: <arquivos> (união); porta sem dependência; jose no grafo; prova local de novo verde"`;
  `T16-FEITA` com os Steps 3–5.

---

### Task 17: STAGING (🔒 BANCO, depois do "livre" da LINUX 1): publicar as 3 + o `api.py` + o D5

**Files:** nenhum do repo; fora: `funcoes_p2.py`, `publicar.sh`, `volta_funcoes.sh`, `saida-*.txt`, `publicado-em.txt`, `publicado-commit.txt`.
**Estimativa:** 50 min (calibrado 28–33).
**Quando:** o "livre" do 🔒 BANCO pela LINUX 1 (~02:30) E a Task 16 feita (o git dela até ~03:15) → o mais cedo ~03:15; pela estimativa ~05:05.
**Publicar vale para os 2 schemas** (a borda é do projeto): a partir daqui as 3 existem também para o `public` — escuras (nenhuma tela chama até
a P3/P4); a Task 18 confere a produção, só leitura.

- [ ] **Step 1: Os scripts** — em `~/projetos/physiqcalc-scratch/w-a/p2/`:

`funcoes_p2.py`:
```python
#!/usr/bin/env python3
"""W-A P2 — SÓ LEITURA (GET da Management API): as 3 funções da W-A nos 2 projetos — existe?, versão, verify_jwt, status.
Uso: python3 funcoes_p2.py [--esperar-ausentes | --esperar-publicadas]   (saída 0 = o esperado; sem opção: só mostra)"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAT = (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()
UA = "physiq-unificado/1.0 (w-a p2)"
ALVOS = (("hkxvtsbwctxkrqzkkdoz", "acessos", True), ("hkxvtsbwctxkrqzkkdoz", "aluno-dia", True), ("uxwpwdbbnlticxgtzcsb", "treino-acessos", False))


def ver(ref: str, slug: str) -> dict:
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/functions/{slug}",
                                 headers={"Authorization": f"Bearer {PAT}", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"existe": False}
        raise
    return {"existe": True, "versao": d.get("version"), "verify_jwt": d.get("verify_jwt"), "status": d.get("status")}


modo = sys.argv[1] if len(sys.argv) > 1 else ""
ok = True
for ref, slug, vj in ALVOS:
    r = ver(ref, slug)
    print(f"{ref[:6]}… {slug}: {r}")
    if modo == "--esperar-ausentes":
        ok = ok and r["existe"] is False
    elif modo == "--esperar-publicadas":
        ok = ok and r.get("existe") is True and r.get("verify_jwt") is vj and r.get("status") == "ACTIVE"
print("esperado:", ok if modo else "(só mostrou)")
raise SystemExit(0 if ok else 1)
```

`publicar.sh`:
```bash
#!/usr/bin/env bash
# W-A P2 — publica as funções da W-A (uma por vez; para no 1º erro) pelo scripts/deploy_function.sh, na fila do pesado. SÓ com o 🔒 BANCO
# do staging e o "pode ir" da LINUX 1. Guarda a hora (UTC, para o --desde dos logs) e o commit publicado.
# uso: bash publicar.sh                      (as 3)
#      bash publicar.sh acessos aluno-dia    (a republicação da Task 16, Step 6)
set -euo pipefail
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p2"
cd "$HOME/projetos/physiqcalc-wa-p2"
if [ -n "$(git status --porcelain)" ]; then echo "PAROU: a worktree tem mudança fora de commit (publicar só o que está commitado)" >&2; exit 3; fi
if [ "$#" -eq 0 ]; then set -- acessos aluno-dia treino-acessos; fi
date -u +%Y-%m-%dT%H:%M:%SZ > "$S/publicado-em.txt"
git rev-parse --short HEAD > "$S/publicado-commit.txt"
for f in "$@"; do
  case "$f" in
    acessos|aluno-dia) flock "$P" bash scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions "$f" true ;;
    treino-acessos) flock "$P" bash scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions treino-acessos false ;;
    *) echo "função fora da W-A: $f" >&2; exit 2 ;;
  esac
  echo "── $f publicada às $(date +%T) do $(cat "$S/publicado-commit.txt")"
done
```

`volta_funcoes.sh`:
```bash
#!/usr/bin/env bash
# W-A P2 — a VOLTA da publicação: apaga as funções da W-A pedidas (nenhuma tela chama: apagar = voltar ao antes; nenhuma migration) e confere
# o 404. uso: bash volta_funcoes.sh acessos aluno-dia treino-acessos   (só estes 3 nomes; o PAT de ~/.pc-pat; a Management API pede User-Agent)
set -euo pipefail
PAT="$(cat "$HOME/.pc-pat")"
UA="physiq-unificado/1.0 (w-a p2 volta)"
for f in "$@"; do
  case "$f" in
    acessos|aluno-dia) ref=hkxvtsbwctxkrqzkkdoz ;;
    treino-acessos) ref=uxwpwdbbnlticxgtzcsb ;;
    *) echo "função fora da W-A: $f (não apago)" >&2; exit 2 ;;
  esac
  curl -sS -o /dev/null -w "DELETE $f → %{http_code}\n" -X DELETE "https://api.supabase.com/v1/projects/$ref/functions/$f" -H "Authorization: Bearer $PAT" -H "User-Agent: $UA"
  curl -sS -o /dev/null -w "GET $f → %{http_code} (404 = apagada)\n" "https://api.supabase.com/v1/projects/$ref/functions/$f" -H "Authorization: Bearer $PAT" -H "User-Agent: $UA"
done
```

- [ ] **Step 2: Check anti-sobrescrita (ISOLADO) + as funções ainda livres**

Run: `git -C ~/projetos/physiqcalc-wa-p2 fetch origin && git -C ~/projetos/physiqcalc-wa-p2 merge-base --is-ancestor origin/main HEAD && echo "main-ok" && python3 ~/projetos/physiqcalc-scratch/w-a/p2/funcoes_p2.py --esperar-ausentes`
Expected: `main-ok` (a P2 em cima da `main` com a 21a) e as 3 com `{'existe': False}` + `esperado: True`. A `main` andou → Task 16 de novo
(Steps 2–5). Uma das 3 já existe → PARAR (alguém publicou com o mesmo nome) e avisar.

- [ ] **Step 3: As travas** — o quadro: "🔒 BANCO do staging: LINUX 3 desde HH:MM (W-A P2: publicar as 3 + `api.py` com massa 'WA E2E' + D5 ×3;
  ~35 min)"; `SendMessage` à LINUX 1: "W-A P2 → posso pegar o 🔒 BANCO do staging (~35 min: publicar `acessos` e `aluno-dia` no principal e
  `treino-acessos` no Treino — valem p/ os 2 schemas, escuras: nenhuma tela chama — + o E2E de servidor com massa 'WA E2E', que volta toda no fim,
  + o D5 da P1 3×)? Obs.: a `treino-acessos` é `verify_jwt=false` → o `docs/desvios.md` (seu; a 21e já prevê '17 → 21') fica com 1 a mais
  (defeito 3 do plano: não mexo)." → esperar o "pode ir".

- [ ] **Step 4: Saúde + publicar**

Run: `cd ~/projetos/physiqcalc-wa-p2 && python3 ~/projetos/physiqcalc-scratch/w-a/p2/saude.py "publicar a W-A P2" && bash ~/projetos/physiqcalc-scratch/w-a/p2/publicar.sh 2>&1 | tee ~/projetos/physiqcalc-scratch/w-a/p2/saida-publicar.txt | grep -E "publicada|PAROU|ATENÇÃO|erro|função nova" ; python3 ~/projetos/physiqcalc-scratch/w-a/p2/funcoes_p2.py --esperar-publicadas`
Expected: `/health …` todo `ACTIVE_HEALTHY` + `[{'longas': 0, 'esperando': 0}]`; 3× `função nova: <slug>` e `publicada: <slug> → verify_jwt/versão/status =
true 1 ACTIVE` (a `treino-acessos`: `false 1 ACTIVE`); `esperado: True`. Saúde ruim → não publicar (esperar e avisar). O deploy de uma parou
(`PAROU`/`ATENÇÃO`, o esm.sh fora…) → as que JÁ publicaram ficam (escuras); tentar a que faltou de novo em 5 min (`bash publicar.sh <slug>`);
persistiu → `bash ~/projetos/physiqcalc-scratch/w-a/p2/volta_funcoes.sh <as publicadas>` (→ `GET … 404`), soltar o 🔒 e avisar.

- [ ] **Step 5: O `api.py` no staging (o padrão: A, T, R, D, X, Y, B)**

Run: `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/api.py 2>&1 | tee ~/projetos/physiqcalc-scratch/w-a/p2/saida-stg-api.txt | tail -8`
Expected: `98/98 ok` — A 24 (A0–A14) · T 14 · R 23 · D 16 · X 7 (X0–X6) · Y 2 · B 4 · Z 1 · os 7 logouts (as 6 contas + a sessão do Treino do T7).
O B espera a ingestão dos logs até 5 min (de 30 em 30 s). Um ❌ → ler o caso (status + `erro`): erro da FUNÇÃO → corrigir na task dona, commit,
`bash publicar.sh <slug>` (com o 🔒 ainda) e rodar de novo; erro de MASSA/ambiente (429 do Auth, `/health`, `LogsFora`) → `python3 e2e/wa/api.py --limpar`
(sobras 0) e repetir só os grupos que faltaram (`--grupos …`; o B precisa do R junto: `--grupos R,B`). A rodada caiu no meio → o `finally` já
limpou; conferir com `--limpar` (sobras 0) antes de repetir.

- [ ] **Step 6: O D5 da P1, 3× seguidas (o caso da Task 1 no banco de verdade)**

Run: `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; for i in 1 2 3; do PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/sql_wa.py --casos D5 | tail -1; done`
Expected: `1/1 ok` 3× (sem a dependência do RLS da aluna; o `matricula: true` pela `meu_dia`). Um ❌ → anotar o resultado inteiro no `T17-FEITA` e
voltar à Task 1 (a hipótese não fechou) — NÃO bloqueia a P2 (é o teste da P1), mas vai no resumo.

- [ ] **Step 7: As sobras e soltar o BANCO** — `cd ~/projetos/physiqcalc-wa-p2 && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/api.py --limpar` → tudo
  0 (o `api.py` já limpou no `finally`; isto confere de novo) → o quadro: "🔓 BANCO do staging: LIVRE desde HH:MM (W-A P2: as 3 publicadas do
  `<publicado-commit>` às HH:MM; `api.py` 98/98; D5 3/3; sobras 0)" + `SendMessage` à LINUX 1 com o mesmo texto ("livre").

- [ ] **Step 8: Marcar** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T17 | ✅ publicadas (v1 ×3) do <commit>; api.py 98/98; D5 3/3; BANCO livre"`;
  `T17-FEITA` com o `publicado-em.txt`, as versões, os placares e o que deu errado no caminho.

---

### Task 18: PRODUÇÃO — o smoke SÓ LEITURA logo depois de publicar

**Files:** nenhum; fora: `saida-prod-*.txt`.
**Estimativa:** 15 min (calibrado 8–10).
Sem trava (só leitura; nenhuma gravação no `public` — a trava `so_leitura` do `api.py` para ANTES de qualquer gravação, mesmo inválida).

- [ ] **Step 1: A hora da publicação** — `cat ~/projetos/physiqcalc-scratch/w-a/p2/publicado-em.txt` → `2026-10-13THH:MM:SSZ` (usar o valor
  escrito, sem `$(…)`, no Step 2).

- [ ] **Step 2: O smoke**

Run: `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/api.py --so-leitura --desde 2026-10-13THH:MM:SSZ 2>&1 | tee ~/projetos/physiqcalc-scratch/w-a/p2/saida-prod-api.txt | tail -6`
Expected: `23/23 ok` — P1–P4 nas 3 (o CORS do site, sem login 401, x-schema fora 400, ação desconhecida 400 antes de qualquer RPC) · P5 (a
`acessos_ler` existe no `public`) · P6.0–3 (as 4 leituras da aluna de TESTE no `public`: `ok`) · P7 · P8 (a `treino-acessos` fala com o principal
no `public`) · P9 (0 5xx das 3 desde a publicação) · P10 (100% das linhas em JSON) · os 2 logouts. Um ❌ de status → a função no `public` →
`bash ~/projetos/physiqcalc-scratch/w-a/p2/volta_funcoes.sh <slug>` (com o 🔒 BANCO de novo e o "pode ir"), avisar, e o PR espera a correção.

- [ ] **Step 3: Os logs gerais (hml-10), informativo das 3 novas**

Run: `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P python3 e2e/hml10/logs.py --desde 2026-10-13THH:MM:SSZ 2>&1 | tee ~/projetos/physiqcalc-scratch/w-a/p2/saida-prod-logs.txt | tail -12`
Expected: as 35 da W com ✅ (nada mudou nelas); as 3 da W-A na parte "só informação": 0 com e-mail, JWT ou chave; 0 5xx.

- [ ] **Step 4 (pendência da P1, só leitura — `P1-PROD-FEITA` item 5: a ingestão estava "impaired" em 12/10):**
  `cd ~/projetos/physiqcalc-wa-p2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P python3 e2e/hml10/logs.py --desde 2026-10-13T00:59:00Z --fim 2026-10-13T01:40:00Z | tail -6`
  → 0 5xx novo na janela da produção da P1 (anotar no `T18-FEITA`; um 5xx → só informar no resumo, a P1 está fechada).

- [ ] **Step 5: Marcar** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T18 | ✅ produção só leitura 23/23; logs 0 5xx; P1 logs repetidos"`; `T18-FEITA`.

---

### Task 19: As rodadas + PR + CI

**Files:** Modify `docs/e2e-rodadas.md` (o topo da tabela "## Rodadas"); fora: `rodadas_p2.py`, `pr-p2.md`.
**Estimativa:** 20 min (calibrado 11–13).

- [ ] **Step 1: As linhas** — `~/projetos/physiqcalc-scratch/w-a/p2/rodadas_p2.py`:

```python
#!/usr/bin/env python3
"""W-A P2 (Task 19) — as linhas do docs/e2e-rodadas.md (a mais nova em cima, no formato da tabela "## Rodadas"), do e2e-rodadas.tsv OFICIAL: as
da P2 (branch feat/w-a-p2-funcoes) e as 6 de PRODUÇÃO da P1 (decisão 11 / defeito 4: rodaram depois do merge dela). As obs. da P1 vão prontas;
as da P2 saem com um texto-base (conferir e completar com o T17/T18-FEITA). Só imprime. Uso: python3 rodadas_p2.py"""
from pathlib import Path

TSV = Path.home() / "projetos/physiqcalc-scratch/e2e-rodadas.tsv"
OBS_P1 = {  # (script, argumentos, commit) → a obs. — as 6 de produção da P1 (12/10 22:01–22:36)
    ("e2e/wa/sql_wa.py", "--so-catalogo --schema public", "0fbfd1f"): "P1 na produção: o catálogo das 3 migrations no `public` (K1–K8), só leitura, logo depois de aplicar",
    ("e2e/hml01/banco.py", "--schema public", "0fbfd1f"): "regressão só leitura: as 10 tabelas novas sem privilégio do visitante e sem TRUNCATE do logado",
    ("e2e/hml12/banco.py", "--schema public", "0fbfd1f"): "regressão só leitura da hml-12 (a exportar com `aceites`) com a P1 no `public`",
    ("e2e/w07/smoke_prod.py", "telas --versao 3.110 --canal msedge", "feb9361"): "smoke só leitura depois do merge da P1 (v3.110 no site)",
    ("e2e/w10/api.py", "--schema public", "feb9361"): "smoke só leitura depois do merge da P1",
    ("e2e/wa/sql_wa.py", "--so-catalogo --schema public", "feb9361"): "o catálogo de novo depois do merge da P1 (só leitura)",
}
OBS_P2 = {
    "e2e/wa/api.py": "as 3 funções publicadas: A/T/R/D/X/Y/B por papel nos 2 bancos + os negativos da §5.5 + os logs da borda; sobras 0",
    "e2e/wa/sql_wa.py": "o D5 da P1 sem depender do RLS da aluna (Task 1 da P2): 3 rodadas seguidas",
}
saida = []
for linha in TSV.read_text(encoding="utf-8").splitlines():
    c = linha.split("\t")
    if len(c) < 6:
        continue
    data, branch, commit, script, args, placar = c[:6]
    if branch == "feat/w-a-p2-funcoes":
        prod = "--so-leitura" in args or "--schema public" in args
        obs = "smoke SÓ LEITURA logo depois de publicar (nenhuma gravação; 0 5xx; 100% JSON)" if "--so-leitura" in args else OBS_P2.get(script, "")
        saida.append((data, "W-A P2", commit, script, args, "produção" if prod else "staging", placar, obs))
    elif branch == "feat/w-a-acessos-do-aluno" and (script, args, commit) in OBS_P1:
        saida.append((data, "W-A P1", commit, script, args, "produção", placar, OBS_P1[(script, args, commit)]))
for data, wt, commit, script, args, base, placar, obs in sorted(saida, reverse=True):
    print(f"| {data[8:10]}/{data[5:7]} {data[11:16]} | {wt} | `{commit}` | `{script}{(' ' + args) if args else ''}` | {base} | {placar} | {obs} |")
print(f"\n{len(saida)} linhas ({sum(1 for s in saida if s[1] == 'W-A P1')} da P1, {sum(1 for s in saida if s[1] == 'W-A P2')} da P2)")
```

Run: `cd ~/projetos/physiqcalc-scratch/w-a/p2 && python3 rodadas_p2.py`
Expected: as linhas da P2 (o `api.py` do staging e o `--so-leitura`, os 3 `sql_wa.py --casos D5`, e as de uma repetição, se houve — a vermelha
também entra, com a causa na obs.) e as 6 da P1 → `N linhas (6 da P1, M da P2)`. Colar no `docs/e2e-rodadas.md` logo abaixo da linha
`|---|---|---|---|---|---|---|` da "## Rodadas" (o bloco: as da P2 em cima, as 6 da P1 embaixo delas), completando as obs. da P2 com o que o
`T17/T18-FEITA` diz (ex.: "98/98: …"). Commit:

```bash
cd ~/projetos/physiqcalc-wa-p2 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(e2e): as rodadas da W-A P2 (staging e produção) e as de produção da P1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/e2e-rodadas.md
```

- [ ] **Step 2: O corpo do PR** — `~/projetos/physiqcalc-scratch/w-a/p2/pr-p2.md`: o que entra (as 3 funções e os 3 `_shared` de regras; os
  clientes `src/acessos` e `src/aluno-dia` — sem tela ainda; as listas de log com a guarda de fonte da `treino-acessos`; a guarda `semBancoDireto`;
  a Guarda dos E2E + `guarda_teste`; `e2e/wa/{supabase_falso,api}.py`; o D5 do `sql_wa.py`; as rodadas); o que NÃO muda (nenhuma tela, nenhuma
  migration, a porta só importada); **as 3 já publicadas** (hora, versão, `verify_jwt`) e escuras até a P3/P4; a prova local (`prova_local.sh`:
  as linhas `fim`), o staging (`api.py` 98/98, D5 3/3) e a produção (`--so-leitura` 23/23, logs); o rebase sobre a hml-21a (a porta com o
  `jwtLeitura` padrão inalterado e o `jose` no bundle: a P2 não usa a opção — o L6 prova); as decisões técnicas (a lista do topo); os defeitos da
  spec (1–9) e a C4/I1/I2/MENOR 22 com os casos que provam; a volta (apagar as 3 — `volta_funcoes.sh`; sem migration); e no fim
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: Push da branch e PR (o push da branch não pede trava; a `main` não pode ter andado)**

```bash
cd ~/projetos/physiqcalc-wa-p2 && git fetch origin && git merge-base --is-ancestor origin/main HEAD && git push -u origin feat/w-a-p2-funcoes && gh pr create --repo weslleybertoldo/physiqcalc --base main --head feat/w-a-p2-funcoes --title "W-A P2: as funções acessos, aluno-dia e treino-acessos (+ os clientes, as listas, a Guarda e o E2E de servidor)" --body-file ~/projetos/physiqcalc-scratch/w-a/p2/pr-p2.md || echo "PAROU: a main andou (Task 16, Steps 2–5, de novo) ou o push/PR falhou (ver acima)"
```
Expected: a URL do PR. A `main` andou → rebase de novo (Task 16) ANTES do 1º push (a branch ainda não está no GitHub: o rebase não reescreve nada
publicado). Depois do PR aberto, a `main` andou → `git merge origin/main` na branch (nunca rebase + força) + push.

- [ ] **Step 4: O CI** — `gh pr checks <n> --repo weslleybertoldo/physiqcalc --watch` → `checar-pr` ✅ (lint, tipos, `checar-definer`, `test:node`,
  Vitest, build + `checar-chunks`) e o preview da Vercel ✅. Vermelho → a causa (`gh run view <id> --log-failed | tail -60`), corrigir, commit, push
  (sem forçar). O `semBancoNoNavegador` vermelho = o defeito 1 sem a linha → Task 16, Step 3.
- [ ] **Step 5: Marcar** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T19 | ✅ PR #<n>; CI verde"`; `T19-FEITA`.

---

### Task 20: Merge → release → bump → `staging` = `main` (fast-forward)

**Estimativa:** 25 min (calibrado 14–16; as esperas do CI/release não contam).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p2 fetch origin && git -C ~/projetos/physiqcalc-wa-p2 merge-base --is-ancestor origin/main HEAD && echo "main-ok"`
  → `main-ok`; e `gh pr list --repo weslleybertoldo/physiqcalc --state open` (1 PR por vez: outro PR prestes a entrar → combinar a ordem).
- [ ] **Step 2: A trava** — o quadro: "🔒 git staging/main: LINUX 3 desde HH:MM (W-A P2: merge, release, `staging` = `main`)"; `SendMessage` à
  LINUX 1: "W-A P2 → posso pegar o git (squash do PR #<n> na `main`, a release do CI e o `staging` = `main` por fast-forward; ~25 min)?" →
  esperar o "pode ir".
- [ ] **Step 3: Merge (main protegida, sem skip)** — `gh pr merge <n> --repo weslleybertoldo/physiqcalc --squash --delete-branch` →
  `git -C ~/projetos/physiqcalc-wa-p2 fetch origin && git -C ~/projetos/physiqcalc-wa-p2 log origin/main -1 --format='%h %an <%ae> %s'` = o squash
  "W-A P2: … (#<n>)" com o autor `Weslley Bertoldo <55102421+weslleybertoldo@users.noreply.github.com>`.
- [ ] **Step 4: O CI da `main`** — `gh run list --repo weslleybertoldo/physiqcalc --branch main --limit 3` → `gh run watch <id> --repo weslleybertoldo/physiqcalc`
  → a release `Physiq v3.1xx` com o APK e o `chore: bump version to v3.1xx [skip ci]` do job `bump` (NUNCA bumpar à mão). →
  `curl -s https://physiqcalc.com.br/health.json` com a versão da release e o commit do squash. Deploy da Vercel com `git_info_fail` →
  `POST /v13/deployments` (o caminho de sempre).
- [ ] **Step 5: `staging` = `main` (fast-forward: a P2 não foi ao `staging` antes — decisão 12)**
  `cd ~/projetos/physiqcalc-wa-p2 && git fetch origin && git merge-base --is-ancestor origin/staging origin/main && git push origin origin/main:staging`
  (o `staging` NÃO é ancestral da `main` — alguém pôs algo lá — → PARAR e combinar; nada de força).
- [ ] **Step 6: O que está na borda = o que entrou** — `cat ~/projetos/physiqcalc-scratch/w-a/p2/publicado-commit.txt` → `<c>`; e
  `cd ~/projetos/physiqcalc-wa-p2 && git diff --stat <c> origin/main -- supabase-principal/functions/acessos supabase-principal/functions/aluno-dia supabase-principal/functions/_shared/acessos-regras.ts supabase-principal/functions/_shared/aluno-dia-regras.ts supabase/functions/treino-acessos supabase/functions/_shared/treino-acessos-regras.ts`
  → VAZIO. Não vazio (uma correção do CI depois de publicar) → com o 🔒 BANCO e o "pode ir": `bash publicar.sh <as mudadas>` + `api.py --grupos <os delas>,B`
  + a Task 18 de novo.
- [ ] **Step 7: "Pode voltar"** — `SendMessage` à LINUX 1 com o sha da `main`, a release e "git livre"; o quadro com a trava livre.
- [ ] **Step 8: Marcar** — `bash ~/projetos/physiqcalc-scratch/w-a/p2/log.sh "T20 | ✅ squash <sha> (#<n>); release v3.1xx; bump; staging = main"`; `T20-FEITA`.

---

### Task 21: Fechar

**Estimativa:** 10 min (calibrado 6–7). (O que é do coordenador — quadro, foto, Validação, memória — quem executa só anota no `progresso.log`.)

- [ ] O quadro: a linha da W-A com "✅ P2 EM PRODUÇÃO HH:MM (PR #…, squash `…`, release v3.1xx, bump …); as 3 funções publicadas HH:MM do `…`
  (escuras até a P3/P4); staging `api.py` 98/98, D5 3/3, produção só leitura 23/23; 0 sobra" e as travas livres; a P3 reserva o que for dela
  quando começar.
- [ ] A foto: o JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-acessos-do-aluno.json` (P2 `feito`, `duracao_min`, tag
  `PR #… · v3.1xx`) → `python3 ~/.claude/skills/Skill-wbs-ciclo-de-implementação-autonoma/andamento_worktrees.py <json> <pasta> --atual` → Read do
  PNG → tópico.
- [ ] O resumo no grupo Validação (`remoto_validacao`, tópico do Physiq): o que entrou, os placares (local, staging 98/98, produção 23/23, D5
  3/3), "escuras até a P3/P4", o achado INFO do `meu_paciente_id()` (defeito 6) para a homologação, o que vem (P3).
- [ ] A memória do projeto (Physiq): "W-A P2 em produção (data, PR, versão); P3 a seguir".
- [ ] `claude-orfaos.sh` (órfã → perguntar); nenhum Deno/falso local de pé (`ss -ltnp | grep -E ":879[1-6]"` vazio). A worktree:
  `git -C ~/projetos/physiqcalc-wa-p2 status --short` vazio e `git -C ~/projetos/physiqcalc-wa-p2 diff origin/main HEAD --stat` só com o bump →
  remover SÓ quando nenhuma sessão estiver dentro dela: `git -C ~/projetos/physiqcalc worktree remove ~/projetos/physiqcalc-wa-p2 && git -C ~/projetos/physiqcalc branch -D feat/w-a-p2-funcoes`
  (a remota saiu no merge). `T21-FEITA`.

---

## Riscos (e o que segura cada um)

1. **Publicar = os 2 schemas** (a borda é do projeto): as 3 existem para o `public` desde a Task 17. Segura: escuras (nenhuma tela chama até a
   P3/P4); a Task 18 só lê, com a trava `so_leitura` (nenhuma gravação sai, nem inválida — risco 9 do mestre); a volta é apagar
   (`volta_funcoes.sh`), sem migration.
2. **O `jose` no bundle das 2 do principal (hml-21a):** a porta importa `jwks-principal.ts` → `esm.sh/jose`. Segura: a Task 16 (o `deno info`, o
   `deno check` e o `--local` DEPOIS do rebase); a P2 não usa a opção (L6: 1 `getUser` por pedido, 0 JWKS); o esm.sh fora na hora do deploy → o
   script para sem função meio publicada (confere versão e status) → tentar em 5 min.
3. **A guarda nova da 21a × o `getSession` do `src/acessos/api.ts`** (defeito 1): o CI do PR vermelho. Segura: o pedido na Task 0; a Task 16,
   Step 3 (a linha só com o "pode ir" explícito da LINUX 1); sem ele, para antes do push — a publicação não depende disso.
4. **A 2ª matrícula da aluna contaminando os casos** (o D5 da P1: o RLS de quem tem 2 matrículas): no `api.py` ela nasce SÓ no grupo X (depois do
   D) e sai no `limpar`; o D lê pelas RPCs definer; o `foto()` não começa com sobra de massa (nem da P1).
5. **O E2E no staging travando o Treino de produção** (incidente de 10/10): o `api.py` chama o Treino só pela `treino-acessos` (~25 pedidos leves) e
   1 troca (T7); `/health` antes de cada grupo; um E2E por vez (flock); o 🔒 BANCO no quadro.
6. **A ingestão de logs atrasada** (12/10: "Log ingestion impaired"): o B espera até 5 min; o endpoint fora (`LogsFora`) → repetir `--grupos R,B`
   depois (o B precisa da recusa provocada no R).
7. **O freio é por instância** (a borda pode abrir várias): o 429 é provado no `--local` (L16); no staging não (121 pedidos e 1 min de pessoa
   travada).
8. **Login das contas de TESTE na produção** (Task 18): só login + leitura + logout local (o `Logins` da hml-17 recusa conta que não é de teste).
9. **A troca do T7 mexe no espelho do `w5p-personal` no Treino do staging** (o mesmo que o login do app faz): 1 por rodada (o limite é 20/h).
10. **O aviso "Sua dieta foi liberada" no sino da aluna de TESTE** (staging): o `limpar` apaga os avisos da W-A da rodada; produção não grava.
11. **Perfil do Treino sem conta** gravável por quem vê uma matrícula viva do aluno (defeito 7; L30): fica como está.
12. **A LINUX 1 atrasar** (o git dela além do código pronto): esperar ≤ 1 h; depois perguntar; publicar sem a 21a só com o OK dela e republicar
    as 2 do principal depois do rebase (Task 16, Step 6).
13. **Nested flock** (um script com fila chamado dentro de outro com fila trava para sempre): o `prova_local.sh` chama `deno_check.sh` e `local.sh`
    SEM o flock dele.

## Self-review (feito ao escrever; o código do plano rodou num ENSAIO fora do repo — nada no repo, no banco, na borda nem no registro oficial)

- **Cobertura da spec (§5.2, §5.5, §5.6, §5.7, §6 P2, §7) e da revisão:** as 3 funções com os contratos e os status (Tasks 2–8; `acao` nas 3 e
  `{ ok: false, erro }` também na `treino-acessos` — MENOR 22); as leituras da `aluno-dia` só por `acao: "ler"` com `q` (I1 — S3, L17, a Guarda da
  Task 12); os 6 passos com o vínculo e a trava por conta (C4 — L26–L35, T1–T10, X1–X2); a rotina de outra matrícula (I2 — X3); cada recusa da §5.5
  com caso (o mapa da Task 14, 35 itens); os logs sem nome (L40, B1–B4) e as listas + a guarda de fonte (Task 5), a Guarda dos E2E (Task 12), a
  `semBancoDireto` (Task 9); os clientes e as regras puras do front (Tasks 10–11); o "não tocar" da §5.7 (a porta, o `repeticao.ts`, a guarda da
  21a — só com o OK dela —, `desvios`/`banco-permissoes`); a prova local, o staging e a produção só leitura (Tasks 13–18); o D5 (Task 1); as
  rodadas de produção da P1 no PR da P2 (Task 19); o rebase com a 21a antes do push e da publicação, o `deno check`/`deno info`/`--local` depois dele
  e a prova de que a P2 não depende do caminho antigo da porta (Task 16 — o pedido da LINUX 1).
- **Sem "TBD":** todo arquivo novo está inteiro no plano; os únicos valores do dia são os do ambiente (o sha, o nº do PR e da release, a hora da
  publicação — lidos na hora, escritos no comando sem `$(…)`).
- **Nomes consistentes:** as RPCs e os `p_*` vêm das 3 migrations (o teste de contrato das Tasks 2–4, o `--seco` e o falso conferem pelo mesmo
  texto); os códigos de erro e os status são os mesmos nas regras, nos clientes (`MENSAGEM_ERRO_*`) e nos casos; os ids dos casos (S, L, A, T,
  R, D, X, Y, B, Z, P) são únicos por modo e o mapa da Task 14 os confere; as contagens esperadas (seco 48, local 95, guarda 158, staging 98, produção 23) somam os casos
  escritos.
- **Os pontos de encontro só por acréscimo** (`hml17/_base.py`, `w26/prod.py`, `guarda_teste.py`, `logsDasFuncoes*`, `e2e-rodadas.md`) e a união no
  rebase; a P2 não edita arquivo da hml-21a.
- **Contra o diálogo de permissão:** nenhum comando do plano usa `bash -c`, `sh -c`, subshell com `time`, `eval` nem `$(…)` na linha; o que é
  complexo está em script (`p2/*.sh`, `p2/*.py`); `rm` não aparece nos comandos (o `deploy_function.sh` do repo limpa a pasta temporária dele).
