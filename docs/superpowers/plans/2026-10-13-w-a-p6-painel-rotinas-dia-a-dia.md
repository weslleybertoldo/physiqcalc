# W-A P6 — Painel: rotinas e dia a dia (o card "Rotinas" no Resumo do aluno — as de hoje com o ✓ que o aluno deu, criar/mudar/apagar as de profissional desta matrícula, "Ver tudo" com as apagadas e o histórico; e o "Dia a dia" na aba Dieta da ficha — o que o aluno registrou no app, dia a dia, para a nutri e, só para ler, para o personal) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** no painel do profissional, na ficha do aluno: (1) o card **"Rotinas"** no Resumo (todo aluno, o 7º — o 1º de baixo, o lugar que a P4 reservou): as
rotinas de HOJE com o ✓ que o aluno deu no app (só leitura), o selo de quem criou ("do aluno" · "de Ana"), **"Nova rotina"** (a folha da P3 no modo do
profissional: cria na matrícula da rota e o aluno recebe o aviso no sino), mudar/apagar **só as criadas por profissional nesta matrícula** e **"Ver tudo"**
(as vivas, as apagadas — "apagada pelo aluno em 12/10" — e o histórico — "horário 08:00 → 09:00"); aluno sem login: "Ele precisa de login para receber
rotinas — crie o acesso na aba Acessos."; (2) o **"Dia a dia"** na aba Dieta da ficha (a seção nova, a 2ª depois do Plano; o personal a vê, só para ler,
embaixo da adesão — Q1): escolhe o dia (últimos 14); por refeição, os itens do plano (riscados os que ele tirou), os que ele pôs ("pelo aluno", com os
macros), o ✓; as refeições extras; o que ficou fora do plano (o retrato, "refeição tirada do plano"); o total comido × plano; as rotinas do dia
(feitas/não); a faixa "A dieta está em “Só ver” (Acessos)." quando travada; vazio: "Nada registrado pelo aluno nestes dias." **Nenhuma migration,
nenhuma função:** a `aluno-dia` (P2) já tem as leituras e as gravações do profissional (`aluno_rotinas`, `aluno_dia`, `prof_rotina_salvar`,
`prof_rotina_arquivar`) e as RPCs da wa2/wa3 (P1) decidem quem vê e quem muda (conferido: nada falta).

**Architecture:** 3 pastas novas, já na guarda da W-A (`src/aluno-dia/semBancoDireto.test.ts` › `DA_W_A.P6`): `src/painel/aluno/rotinas/` — as regras PURAS
(`regras.ts`: a janela de 14 dias de SP, as de hoje com o ✓ do aluno, as que valiam num dia passado, o selo, a apagada, o histórico em frases, o estado
do card), a consulta (`useRotinasDoAluno.ts` — UMA para o card, o "Ver tudo" e o Dia a dia), a linha (`LinhaDaRotina.tsx`) e o "Ver tudo"
(`FolhaTodasAsRotinas.tsx`); `src/painel/aluno/resumo/CardRotinas.tsx` (o card, registrado por convenção; a folha da P3 `src/rotinas/ui/FolhaRotina.tsx`
só importada, no modo `{ tipo: "profissional", aluno }`); `src/painel/aluno/diaADia/` — as regras PURAS (`regras.ts`: os 14 dias, o dia montado com o
`diaAplicado` da P2 sobre o plano atual, o que ficou fora do plano, as rotinas do dia, os dias com registro, os textos e o estado), a consulta
(`useDiaADia.ts`) e a seção (`DiaADia.tsx`, preguiçosa). A aba `src/painel/aluno/abas/Dieta.tsx` ganha a seção (`?secao=dia-a-dia`) e o Dia a dia do
personal embaixo da adesão; `src/nutricao/editor/lib/acesso.ts` ganha o "Dia a dia" nas seções (sem leitura nenhuma — é da área `dieta` da hml-20, base
0). Tudo pela porta `src/aluno-dia/api.ts` (P2: `acao: "ler"` nas leituras) e, o plano e os ✓, pelas consultas que a ficha já usa
(`src/nutricao/editor/lib/consultas.ts` — a `nutricao`).

**Tech Stack:** React 19 + TypeScript (`strict: false`) + React Query 5 + Vite + Tailwind 4; Vitest (`--maxWorkers=2`); Python 3 + Playwright (Edge,
`--canal msedge`). Sem APK de teste, sem emulador, sem G7 (a P6 não tem nada nativo: o painel no APK do profissional é o mesmo JS — a loja roda no
`build:loja`).

**Entradas:** a spec `docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md` (§2.1 P7, P8, P8b, Q1; §2.2-1/6/7/9/12/13; §4.5; §4.7; §5.2 a
`aluno-dia` › `profissional.ts`; §5.3; §5.5; §5.6; §5.7; §6 "P6"; §7; §8; §9; §11) — a fonte; o mestre `docs/superpowers/plans/2026-10-12-w-a-plano-mestre.md`
(§0, §3 › P6, §4, §6, §7, §8); o plano da P5 (o molde: `docs/superpowers/plans/2026-10-13-w-a-p5-dieta-liberada.md`, e o andamento real dela em
`~/projetos/physiqcalc-scratch/w-a/p5/progresso.log`) e o da P4 (o painel: `docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md`); o contrato da P2
(`src/aluno-dia/{api,tipos,regras}.ts`, `supabase-principal/functions/aluno-dia/**` + `_shared/aluno-dia-regras.ts`) e as migrations
`supabase-principal/migrations/20261012210000_wa2_rotinas.sql` (`rotinas_do_aluno`, `rotina_prof_salvar`, `rotina_prof_arquivar`) e
`20261012220000_wa3_dieta_livre.sql` (`dia_do_aluno`) (P1); a folha da P3 (`src/rotinas/ui/FolhaRotina.tsx`); a hml-21
(`~/projetos/physiqcalc-scratch/hml/hml21/{spec,para_linux3}.md` — §6.4 a 21c, §6.5 a 21e, §6.7) e o quadro `~/projetos/physiqcalc-scratch/quem-toca-o-que.md`.

**Modo:** até o fim (o G0 do mestre vale). Sem gates humanos; validação com evidência (placares, o banco SÓ LEITURA) e prints conferidos (Read em cada um
ANTES de mandar). **A P6 só começa o código DEPOIS da P5 em produção** (~19:30–20:00 de 13/10): Task 0 ~20:00; o E2E local com o BANCO (Task 8) e o
staging (Task 10) **combinados com a LINUX 1 na hora** (a 21c dela pode estar no BANCO ou no git) — espera o "livre" da LINUX 1. BANCO e git do staging
sempre pela trava do quadro.

**Conferido ao escrever este plano (13/10/2026 ~13:55–16:45; SÓ LEITURA + um ENSAIO fora do repo):**
- **A base do ensaio:** o HEAD da P5 `99f48b7` (= a `origin/main` `7a59930` v3.117 + a P5 — 4 commits, ainda fora da `main` ao escrever). A P5 não toca nenhum
  arquivo da P6 (`git diff 7a59930 99f48b7` nas pastas da P6 = vazio): a worktree da P6 nasce da `origin/main` do momento (com a P5 e o que mais tiver
  entrado — a 21d da LINUX 1) e o `drift.sh` diz se algo dela mudou.
- **O servidor já faz tudo** (a P6 NÃO muda função nem migration): a `aluno-dia` (P2, em produção desde 13/10 02:38) tem `ler` q=`aluno_rotinas` (a
  `rotinas_do_aluno`: as do aluno — todo profissional que vê uma matrícula viva dele — e as de profissional das matrículas que quem chama pode mexer, com as
  apagadas (50), as feitas do intervalo (≤ 31 dias) e o histórico (100); `tem_login`, `pode_criar` = `w14_pode_editar`, e em cada rotina `pode_editar`
  (só as de profissional DESTA matrícula, vivas), `criada_por_nome`, `arquivada_pelo_aluno`), q=`aluno_dia` (a `dia_do_aluno`: o `nivel` e o `liberada` da
  Dieta, as extras e os itens postos/tirados do intervalo com os retratos — só a matrícula da rota; o personal também lê, Q1), `prof_rotina_salvar` (cria
  com o `paciente_id` da rota e o aviso no sino — 1 por dia; muda só as de profissional desta matrícula: a do aluno → 409 `so_do_aluno`, a de outra
  matrícula → 404) e `prof_rotina_arquivar` (a mesma trava). O `api.py` da P2 provou tudo isso no staging (o grupo R/D; o w13-dono na conta B).
- **A massa de TESTE do staging (SÓ LEITURA, `massa_p6.py`):** a matrícula A da w5p-aluna (nutri w5p-nutri + personal w5p-personal) com o plano ativo (o da
  A) e 5 refeições de hoje com alimento; a Dieta da A em "ver"; 11 alimentos da TACO com "arroz"; a aluna com login e 0 rotina viva; a conta do w13-dono;
  nada da W-A no dia de hoje; sobras da W-A 0; os estados das rodadas vazios → `massa de TESTE pronta para o E2E da P6: True`.
- **As guardas que a P6 encontra (e NÃO edita):** `src/aluno-dia/semBancoDireto.test.ts` (P2) já lista as 3 pastas da P6 (`DA_W_A.P6`);
  `src/nutricao/semLeituraDireta.test.ts` (hml-20: a área `painel-aluno` varre `src/painel/aluno/resumo` — o card novo entra com 0 achado e nenhum `rpc(` —, e a
  área `dieta` varre `src/nutricao/editor/lib` — o `acesso.ts` segue sem leitura); `src/integrations/semBancoNoNavegador.test.ts` (hml-21a: arquivo novo com 0
  achado); `semDialogoNativo` (a confirmação de apagar é a da folha da P3, `useConfirmar`); `larguraCelular` (nenhuma grade nova sem base); `consultasComErro`
  (as consultas moram em `.ts`; as telas leem o erro). A Guarda dos E2E (`e2e/hml17/_base.py`) já conhece a `aluno-dia` (`acao: "ler"` = leitura). Nenhuma
  lista de funções muda.
- **Os E2E antigos que a P6 muda por baixo:** `e2e/w16/telas.py --casos secoes` conta as seções da aba Dieta da ficha (7) → 8 (Task 5). O `e2e/hml20/dieta.py`
  lista as seções que mede numa constante dele (não lê o código) e o `e2e/hml19/laco.py` clica em seções pelo id → seguem iguais. O
  `src/painel/aluno/acessos/ListaDeAcessos.tsx` (P4) já troca a dica da linha "Rotinas" quando o card existe (`existe("resumoAluno", "CardRotinas")`): o teste
  dela finge o registro; a regressão `e2e/wa/telas_acessos.py` (staging) confere a aba com o card.
- **O ENSAIO** (13/10 13:58–16:45, FORA do repo: uma cópia da `99f48b7` em `~/projetos/physiqcalc-scratch/w-a/p6/ensaio` com o `node_modules` da worktree
  `physiqcalc-acessos` por link — o MESMO `package-lock.json`, md5 `b276d24b…`; nada no repo, no banco, na borda nem no registro oficial; a fila do pesado
  respeitou as faixas da P5 — 15:30–16:40 e 17:40–18:30 — pelo `janela.sh`): os blocos deste plano como estão → `tsc` do app **0 erro** · `eslint` dos arquivos da
  P6 **0** · Vitest dos arquivos da P6 **6 arquivos, 43 testes** e das guardas e vizinhos **20 arquivos, 267 testes** · o Vitest do REPO INTEIRO **436 arquivos, 6.163 testes** em 4 fatias (6.163 passaram, 0 falha); no ensaio 2 (a cópia limpa) **436/436 arquivos, 6.163/6.163 testes**, 0 falha ·
  `npm run lint` **0 erro** (24 avisos antigos — os MESMOS arquivos do ensaio da P5, nenhum da P6) · `npm run tipos` **0** · `checar-definer`
  **0 problema** (171) · `test:node` **68/68 (1 pulado)** · `vite build` + `checar-chunks` **ok** (49,86 s; os pedaços da P6: o card `CardRotinas-*.js` 7,29 KB (gzip 2,55); o Dia a dia `DiaADia-*.js` 12,09 KB (gzip 4,21); a aba Dieta da ficha 23,31 → 23,76 KB (gzip 8,36 → 8,50); o fecho estático do card 1025 KB; o fecho sem pdf, xlsx, motor, heic2any nem powersync) · `telas_painel.py --seco` **56/56** · compila · e o
  **ENSAIO 2**: numa cópia LIMPA da `99f48b7` (`p6/ensaio2`), as Tasks 1–6 (+ a entrada da Task 11) como o executor vai fazer (o `copiar.sh` + o `git apply`
  de cada patch, o vermelho → verde de cada task — os placares deste plano são os de lá) reproduzem o ensaio **byte a byte** (T1 `Test Files 1 failed (1)` · FAIL `Failed to resolve import "./regras"` → `Test Files 1 passed (1)` · `Tests 9 passed (9)` · T2 `Test Files 1 failed (1)` · FAIL `Failed to resolve import "./CardRotinas"` → `Test Files 3 passed (3)` · `Tests 25 passed (25)` + eslint 0 · T3 `Test Files 1 failed (1)` · FAIL `Failed to resolve import "./regras"` → `Test Files 1 passed (1)` · `Tests 8 passed (8)` · T4 `Test Files 3 failed (3)` · `Tests 4 failed | 6 passed (10)` · FAIL `Failed to resolve import "./DiaADia"` → `Test Files 4 passed (4)` · `Tests 25 passed (25)` + eslint 0 · T5 compila · T6 `--seco` 56/56 + compila + as guardas `Test Files 16 passed (16)` · `Tests 219 passed (219)` · T11 a entrada aplica), e o `drift.sh` contra ela **rc=0**; a prova
  local inteira na cópia: **`lint=0 tipos=0 definer=0 test-node=0 vitest=0 build=0 chunks=0 seco=0 compila=0`**, o Vitest do repo inteiro **436/436 arquivos, 6.163/6.163 testes**, o `git status` vazio; e a conferência final numa 3ª cópia limpa (`ensaio_arquivos.sh`: as 14 cópias + os 4 patches na ordem; o drift
  rc=0) também deu **byte a byte**. A massa do staging conferida SÓ LEITURA (`massa_p6.py` → True). O ensaio achou e o plano já corrige: (1) a conta de TESTE
  "personal" da A (w5p-personal) é dono E personal → a ficha dela é "ver" (dono), não "só o plano": o caso do personal (P10) tira o papel "dono" pela Massa
  durante o caso e devolve (o molde do "dono sem papel" da P4); (2) a sessão da Tela entra só antes do 1º documento → contas diferentes em contextos diferentes
  (o P12); (3) com o dado na tela, uma releitura que falhou não vira "erro" (o estado olha o dado primeiro); (4) o teste do erro usa um código que a consulta
  não repete (o `retry` dela repete 1 vez o resto — a tela iria direto para a lista); (5) a fila do pesado dividida (outra sessão segurou ~13 min) — e, no
  ensaio, as faixas da P5 (`janela.sh`: a fatia que não cabia antes das 15:30 rodou depois das 16:40).
  **Não rodou (de propósito):** os E2E contra o staging e a produção (nada de banco).

---

## Decisões técnicas minhas (P6 — não são do Weslley; aparecem na foto)

1. **UMA consulta para as rotinas** (o card, o "Ver tudo" e o Dia a dia): `aluno-dia` `{ acao: "ler", q: "aluno_rotinas", aluno, de, ate }` com a janela dos
   últimos **14 dias** de São Paulo (spec §4.5 "últimos 14"; o servidor aceita até 31). O card usa o dia de hoje; o Dia a dia, os 14. A chave leva a janela
   (virou o dia, outra consulta); depois de criar, mudar ou apagar, relê (sem otimismo: o servidor manda o aviso e escreve o histórico).
2. **O card é de TODO aluno** (`modulo: "ambos"` do Resumo; o lugar 7 da P4). Estados (`data-card-rotinas`): carregando · sem internet (a consulta parada,
   sem o dado) · erro (a frase fixa do código; "Tentar de novo", menos em `sem_acesso`/`aluno_inexistente`) · sem login (a frase da spec — a mesma do
   `sem_login_do_aluno` da função — e o atalho "Abrir Acessos") · vazio (nenhuma viva: "Nenhuma rotina ainda." + "Nova rotina") · nenhuma hoje · lista.
3. **As de hoje = a regra do app** (o `rotinasDoDia` da P2: vivas, do dia da semana, pela hora) com o ✓ que o ALUNO deu — **só leitura** (o ícone, sem
   botão: `rotina_marcar` é só do aluno); as que faltam primeiro, depois as feitas, até 4 + "+N" (o molde do card do Início, P3); o chip "N VIVAS".
4. **O selo de quem criou:** "do aluno" · "de <1º nome de quem criou>" (o `criada_por_nome` do servidor) · "do profissional" (sem o nome).
5. **Mudar/apagar = a folha da P3 no modo do profissional** (só importada — o mestre), aberta só pelas linhas com `pode_editar` (o servidor decide); as do
   aluno e as de outra matrícula não abrem; "Nova rotina" só com `pode_criar` e login. O texto de apagar é o da folha ("O aluno deixa de ver esta rotina e
   os lembretes param. O histórico fica no Ver tudo.").
6. **"Ver tudo"** numa folha à direita (`PainelDeslizante lado="direita"`): as vivas (com "5 g · Seg a Sex"), as **apagadas** ("apagada pelo aluno em 12/10" —
   P8b —; "apagada por Ana em 12/10" pelo histórico; "apagada em 12/10") e o **histórico** em frases (quem — "O aluno" / o 1º nome do profissional —, o quê —
   criou/mudou/apagou —, a rotina e, no "mudou", campo a campo na ordem da folha: "horário 08:00 → 09:00", "dias Todos os dias → Seg a Sex", "lembrete
   desligado → ligado"; o mais novo em cima).
7. **Sem internet:** "Nova rotina" desligada com o aviso; as linhas não abrem a folha; a lista lida continua.
8. **O Dia a dia é uma SEÇÃO da aba Dieta** ("Dia a dia", a 2ª, depois do Plano — `?secao=dia-a-dia`; preguiçosa, como as outras): a nutri responsável, o dono
   (dentro do modo só leitura — os botões dos dias com `data-leitura` seguem trocando o dia) e o master; **o personal (só o plano) o vê embaixo da adesão**
   (Q1). Só leitura para todos (ninguém mexe no dia do aluno).
9. **O dia na ficha = o `diaAplicado` da P2 sobre o plano ATUAL** (`planoAtivo` — o mesmo da adesão de 7 dias, do card Dieta e do app): as refeições que valem
   no dia da semana, os itens (riscado o que ele tirou, com "tirou"), o que ele pôs ("pelo aluno", a quantidade em g ou porções e os macros do RETRATO), o ✓
   (os `refeicoes_concluidas` da ficha), as extras do dia ("refeição extra", "já comeu"), o total **comido × plano** (kcal + P/C/G; comido = o que a P2 conta).
   Pergunta **Q6a** (o plano de um dia passado).
10. **O que ficou FORA do plano** (a nutri tirou a refeição ou o item depois — o SET NULL da P1 — ou o item é de um plano anterior): num bloco tracejado com o
    nome da refeição do retrato e o selo **"refeição tirada do plano"**; o posto com os macros, o tirado riscado.
11. **As rotinas do dia:** as que VALIAM naquele dia (criadas até ele; vivas ou apagadas a partir dele — com o selo "apagada depois"), com o ✓ do aluno.
12. **Os 14 dias em botões** (do mais novo: "Hoje", "Ontem", "Sáb 10/10" — hoje à vista no celular; hoje escolhido; o ponto verde nos dias com registro);
    **vazio** = nada registrado na janela inteira (sem item, extra, ✓ de refeição ou rotina feita); **a faixa** "A dieta está em “Só ver” (Acessos)." quando
    a Dieta não está liberada (o `liberada` da `dia_do_aluno`), com o atalho para a aba Acessos; o selo "PODE MEXER"/"SÓ VER".
13. **Tudo pelo servidor:** a `aluno-dia` pela porta da P2 e o plano e os ✓ pelas consultas da ficha (`usePlanosDoAluno`, `useConcluidas` — a `nutricao`, as
    mesmas da adesão; a de 14 dias é uma consulta a mais do lote). Nenhuma leitura direta, nenhum `rpc(`/`.from(`/`.storage` (as 3 guardas).
14. **Os `data-*` para os E2E** (invisíveis): `data-card-rotinas`, `data-rotina-painel`, `data-rotina-feita`, `data-rotina-editavel`, `data-rotinas-*`,
    `data-rotina-apagada`, `data-rotina-evento`, `data-dia-a-dia`, `data-dia-a-dia-botao`, `data-dia-refeicao(-feita)`, `data-dia-item(-tirado)`, `data-dia-posto`,
    `data-dia-extra(-feita)`, `data-dia-fora`, `data-dia-rotinas`, `data-dia-a-dia-travada`, `data-kcal-comido`/`-plano`.
15. **O E2E `e2e/wa/telas_painel.py`** (o molde do `telas_acessos.py` + o `telas_dieta.py`): a foto da matrícula A (os acessos, os ✓ de hoje) vai ao estado
    ANTES de qualquer escrita; a massa com a marca "WA E2E P6 <hhmmss>" pelas FUNÇÕES (a aluna como ela: a rotina, o ✓, tirar, pôr, a extra; a nutri libera
    pela `acessos`; o personal cria pela tela); **o retrato de verdade:** uma refeição TEMPORÁRIA no plano da A (SQL na massa, marcada), a aluna põe nela e a
    "nutri" a tira (o SET NULL da P1) — o plano da aluna de TESTE fica com ela ~1 s; a conta B pela Massa; tudo volta no fim e no `--limpar` (sobras 0).
    `--loja` (o painel no APK é o mesmo JS), `--base prod` SÓ LEITURA (a Guarda), `--seco` (56).
16. **O E2E antigo tocado:** `e2e/w16/telas.py` — o `--casos secoes` conta 8 seções (1 verificação).
17. **"A entrada da W-A" no `docs/e2e-rodadas.md`** (mestre §3 › P6; §7-1) = o parágrafo da família W-A na "Rotina do fim de cada worktree" (os scripts de
    `e2e/wa/` e como rodar e limpar), junto com as linhas das rodadas no topo (Task 11).
18. **A esteira:** sem APK/emulador/G7; local (site + loja na 5173) → rebase na `main` do dia + a prova de novo → staging (push ff + E2E + as regressões
    `e2e/w16/telas.py --casos secoes` e `e2e/wa/telas_acessos.py`) → PR → produção SÓ LEITURA (`telas_painel.py --base prod`, `telas_acessos.py --base prod`,
    `w07/smoke_prod.py`, `api.py --so-leitura`) → fechar. As rodadas de produção da P5 entram no PR desta (a regra da casa).
19. **O peso:** o card vai no pedaço dele (o registro é preguiçoso) e o Dia a dia num pedaço próprio (o `lazy` da aba): a aba Dieta da ficha não cresce para
    quem não abre a seção; o `checar-chunks` passa (o build do ensaio diz os tamanhos).

## Defeitos e ambiguidades da spec (anotados; nenhuma decisão dela mudou)

1. **MÉDIO — "por refeição, os itens do plano" num dia passado × qual plano:** a `dia_do_aluno` não diz o plano de cada dia; a ficha monta o dia sobre o
   plano ATUAL (o da adesão de 7 dias e do app — decisão 9). Se a nutri trocou o plano dentro dos 14 dias, nos dias antigos o ✓ das refeições do plano
   antigo não aparece e o que ele pôs/tirou nelas vai para "fora do plano" (com o retrato — nada se perde). Pergunta **Q6a** (até a resposta, a recomendada).
2. **MENOR — "riscados os que ele tirou" × item que saiu do plano depois:** o "tirado" fica com `item_refeicao_id` nulo (SET NULL) → aparece no bloco "fora do
   plano", riscado, com o nome do retrato (decisão 10).
3. **MENOR — "Faixa quando travada":** o servidor devolve o `nivel` (a linha) e o `liberada` (a linha "Pode mexer" E a nutricionista de verdade numa conta com
   Nutrição); a faixa usa o `liberada` (é o que vale para o aluno).
4. **MENOR — "Ver tudo: as apagadas e o histórico":** o servidor devolve as 50 apagadas mais novas e os 100 eventos mais novos → é o que o "Ver tudo"
   mostra; um evento de uma rotina fora das 50 aparece como "Rotina apagada".
5. **MENOR — mestre §3 › P6 não cita o teste da aba, o `acesso.test.ts` nem o E2E antigo:** a P6 cria `src/painel/aluno/abas/Dieta.test.tsx` (não havia teste
   da aba), acrescenta 1 caso ao `acesso.test.ts` e muda 1 verificação do `e2e/w16/telas.py` (7 → 8 seções).
6. **INFO — "Nova rotina … avisa o aluno no sino":** o aviso é do servidor, 1 por aluno, título e dia (padrão 6): a 2ª rotina no mesmo dia não gera outro.
7. **INFO — "o personal vê o dia a dia, só para ler":** o Dia a dia é só leitura para todos (ninguém mexe no dia do aluno) → o MESMO componente embaixo da adesão.
8. **INFO — a produção não tem conta de TESTE com nutricionista** (a do "Admin Teste" é só de Treino): o smoke lê só o Resumo com o card; o Dia a dia é provado
   no staging.
9. **INFO — "o retrato de item que a nutri tirou do plano" no E2E** precisa de uma refeição apagada do plano: o E2E usa uma refeição TEMPORÁRIA no plano da
   aluna de TESTE (decisão 15) — a nutri de verdade não é tocada; nenhuma outra W lê esse plano na janela (a trava do BANCO).
10. **INFO — Q4 respondida pelo Weslley em 13/10 ("1", a linha "Seus profissionais veem as suas rotinas" no app — P3); Q3 segue aberta (P3)** — nada muda na P6.

## Pontos de encontro com a hml-21 (LINUX 1: 21c → 21e) — e o que combinar ANTES

**Nenhum arquivo da P6 está nas listas da 21c nem da 21e** (conferido: `hml/hml21/spec.md` §3 e §6.4–6.7, `para_linux3.md` e a linha da LINUX 1 no quadro). O
encontro é por perto (a mesma pasta do Resumo, a mesma função `nutricao` que a 21c republica, os mesmos docs) e nas travas.

| # | Arquivo / assunto | P6 | hml-21 | Combinar |
|---|---|---|---|---|
| 1 | `src/painel/aluno/resumo/` (a pasta) | CRIA `CardRotinas.tsx` (+ teste) | 21c: SÓ o miolo de `resumo/acesso/api.ts` (as 3 RPCs → `conta`, mesmas exportações) | arquivos diferentes; só avisar |
| 2 | `src/nutricao/semLeituraDireta.test.ts` | NÃO edita (o card entra na área `painel-aluno` com 0 achado e nenhum `rpc(`; o `acesso.ts` segue na `dieta` sem leitura) | 21c: a área `painel-aluno` (desvio → 0; `RPCS_DE_OUTRA_W_NO_PAINEL` → `{}`) | nada (a P6 não acrescenta RPC); quem entra depois roda a guarda |
| 3 | `src/integrations/semBancoNoNavegador.test.ts` | NÃO edita (os arquivos novos com 0 achado) | 21c/21e: a `BASE` (21e: `{}`) | nada |
| 4 | `src/test/{nutricaoFalsa,financeiroFalso}.ts` | NÃO usa (os testes da P6 fingem as consultas da ficha e a porta da P2) | 21c: viram 1 falso genérico | nenhuma dependência — avisar |
| 5 | a função `nutricao` (o plano e os ✓ do Dia a dia vêm por ela — `lerNutricao`) | só lê (tela e E2E) | **21c republica** a `nutricao` (o motor comum, H-112, e a opção JWKS) | **avisar:** a 21c não publica a `nutricao` com um E2E da P6 rodando (e vice-versa); a aba Dieta da ficha (com o Dia a dia) é regressão dela |
| 6 | `src/painel/aluno/dados/api.ts` (o perfil que a aba Dieta lê) | NÃO toca (a aba usa o `usePerfilAluno` de sempre) | 21c: o miolo → `conta` (mesma assinatura) | nada |
| 7 | a rede do painel (`e2e/hml21/rede.py --area painel-aluno`, 21c; `e2e/hml20/painel_tela.py`) | o Resumo ganha 1 leitura `aluno-dia` `ler` q=`aluno_rotinas`; a aba Dieta do personal, 2 (`aluno_dia`, `aluno_rotinas`) + 1 `nutricao` `ler` (os ✓ de 14 dias, no lote) | a régua da 21c conta o `ler` da `conta` (a `aluno-dia` fica "de fora"); a da hml-20, a `nutricao(ler)` | **avisar** (a linha de base da 21c com a P6 dentro, se a P6 entrar antes) |
| 8 | a Guarda dos E2E (`e2e/hml17/_base.py`, `e2e/w26/prod.py`) | NÃO toca (a `aluno-dia` já está) | 21c: `whatsapp-conectar(status)` = gravação | se a 21c mudar o que o Resumo grava ao abrir, o `BARRADAS_ACEITAS` do `telas_painel.py` (produção) acompanha — avisar |
| 9 | `docs/e2e-rodadas.md` | a entrada da W-A (o parágrafo na "Rotina", Task 11) + as linhas no topo (as da P6 + as de produção da P5) | 21c/21e: as linhas delas no topo; a 21e fecha a etapa 3 | quem entra depois rebaseia (o topo); o parágrafo é outro trecho |
| 10 | contas de TESTE (staging) | w5p-aluna (a matrícula A: os acessos da Dieta, os ✓ de hoje, o dia, as rotinas e — ~1 s — uma refeição temporária no plano; tudo volta), w5p-nutri, w5p-personal (cria pela tela), w13-dono (a 2ª matrícula da Massa) | a 21c usa a w5p-nutri/w5p-personal no Painel; a 21e (D3) a w5p-aluna/w5p-personal no Treino | **combinar a janela** (nenhum E2E das 2 ao mesmo tempo; nenhum "Sair" global) |
| 11 | 🔒 BANCO do staging | Task 8 (E2E local: site ~25 + loja ~8 min, com a massa) e Task 10 (E2E de staging + regressões, ~40 min) | 21c: publicar `conta`, `nutricao`, `financeiro` + E2E (F6); 21e: o D3 no staging | cada uma com o seu "pode ir" — **espera o "livre" da LINUX 1** |
| 12 | 🔒 git | Task 10 (push ff no `staging`) e Task 12 (merge, release, realinhar) | o PR da 21c (e o da 21e) | 1 PR por vez; quem entra depois rebaseia |
| 13 | a porta 5173 e a fila do pesado | os builds (site, loja), a prova local, os E2E | a 8080 é dela; o Vitest inteiro dela segura a fila ~10–13 min | o `prova_partes.sh fila` antes de cada parte |

**Combinar ANTES (Task 0, 1 `SendMessage`):** os avisos dos itens 1, 4, 5, 7 e 8, e as janelas dos itens 10–12 (a 🔒 BANCO da Task 8 e da 10 e o git da 10 e
da 12 — cada um com o "livre" dela).

## Pergunta nova (até a resposta, vale a recomendada e a P6 segue)

- **Q6a — No "Dia a dia", num dia em que valia OUTRO plano (a nutri trocou o plano dentro dos 14 dias), a ficha mostra o dia sobre qual plano?** 1) **o plano
  atual** (**recomendada**: o mesmo da adesão de 7 dias, do card Dieta e do app; o que ele pôs/tirou nas refeições do plano antigo aparece em "fora do plano",
  com o retrato — nada se perde) · 2) o plano que valia naquele dia (precisa o servidor dizer o plano de cada dia — mudar a `dia_do_aluno` (migration) e a
  leitura; +2–3 h, uma parte pequena depois).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/painel/aluno/rotinas/regras.ts` (+ `.test.ts`) — novo | a janela de 14 dias, as de hoje (a regra do app) e as que valiam num dia passado, o card (4 + "+N"), o selo, a apagada, o histórico em frases, o estado do card, os textos |
| `src/painel/aluno/rotinas/useRotinasDoAluno.ts` — novo | a consulta (`aluno_rotinas`, a janela na chave, o `retry` que não repete o que não passa sozinho) e o "relê" |
| `src/painel/aluno/rotinas/LinhaDaRotina.tsx` — novo | a linha: hora, nome, detalhe/dias, lembrete, selo, o ✓ do aluno (só leitura), o botão quando editável |
| `src/painel/aluno/rotinas/FolhaTodasAsRotinas.tsx` — novo | o "Ver tudo": as vivas, as apagadas e o histórico |
| `src/painel/aluno/resumo/CardRotinas.tsx` (+ `.test.tsx`) — novo | o card do Resumo (registrado por convenção): os estados, as de hoje, "Nova rotina" e mudar/apagar pela folha da P3, o "Ver tudo" |
| `src/painel/aluno/diaADia/regras.ts` (+ `.test.ts`) — novo | os 14 dias e o rótulo, o dia na ficha (o `diaAplicado` da P2 + o fora do plano + as rotinas), os dias com registro, a quantidade e os macros do retrato, o estado, os textos |
| `src/painel/aluno/diaADia/useDiaADia.ts` — novo | a consulta (`aluno_dia`, a janela na chave) |
| `src/painel/aluno/diaADia/DiaADia.tsx` (+ `.test.tsx`) — novo | a seção: a faixa, os dias, as refeições, as extras, o fora do plano, o total, as rotinas, vazio/erro/sem internet |
| `src/painel/aluno/abas/Dieta.tsx` (+ `Dieta.test.tsx` — novo) | a seção "Dia a dia" (`?secao=dia-a-dia`, preguiçosa) e o Dia a dia do personal embaixo da adesão; o teste prova a nutri, o personal e o dono |
| `src/nutricao/editor/lib/acesso.ts` (+ `acesso.test.ts`) | + `{ id: "dia-a-dia", rotulo: "Dia a dia" }` (a 2ª seção) — sem leitura |
| `e2e/wa/telas_painel.py` — novo | o E2E de tela (site, loja, staging; `--base prod` só leitura; `--seco`; `--limpar`) |
| `e2e/w16/telas.py` | 1 verificação: as 8 seções da aba Dieta da ficha |
| `docs/e2e-rodadas.md` | a entrada da W-A (o parágrafo na "Rotina do fim de cada worktree") e as linhas no topo (as da P6 e as de produção da P5) |
| `docs/superpowers/plans/2026-10-13-w-a-p6-painel-rotinas-dia-a-dia.md` | este plano |
| fora do repo — `~/projetos/physiqcalc-scratch/w-a/p6/` | os scripts de apoio (Apêndice A), `codigo/` (as cópias conferidas dos 14 arquivos novos + `codigo.md5`), `patches/` (as edições por task), `orig/` (os 4 arquivos que a P6 edita, como eram na `99f48b7` — o `drift.sh` compara), `progresso.log`, `T<N>-FEITA`, as saídas |

**A P6 NÃO toca:** migration, função, `src/aluno-dia/**` e `src/acessos/**` (só importa), `src/rotinas/**` (só importa a folha, a linha e os textos), as consultas e as
peças da ficha (`src/nutricao/editor/lib/consultas.ts`, `adesao.ts`, `src/nutricao/editor/ui/**`, `src/nutricao/app/**` — só importa), o catálogo das abas e a
ordem do Resumo (`src/painel/aluno/catalogoAbas.ts` — a P4 já reservou o lugar), a aba Acessos (`src/painel/aluno/acessos/**` — a dica já muda sozinha quando o
card existe), as guardas (`semLeituraDireta`, `semGravacaoDireta`, `semBancoNoNavegador`, `semBancoDireto`, `logsDasFuncoes*`), a Guarda dos E2E, o app do aluno,
`docs/{banco-permissoes,desvios}.md`, a lista "não tocar" da spec §5.7 e os arquivos da hml-21.

## Estimativa (minutos de trabalho com testes e checagens; sem as esperas de terceiros — a P5, a LINUX 1, as travas, o CI, a Vercel)

```
+------+-------------------------------------------------------------------+--------+------------------------+
| Task | O quê                                                             | Melhor | Calibrado              |
+------+-------------------------------------------------------------------+--------+------------------------+
|  0   | Preparar: worktree, npm ci, .env.local, o plano, drift, massa,    |   25   |   6–12                 |
|      | o quadro, os pedidos à LINUX 1                                    |        |                        |
|  1   | As regras das rotinas no painel (TDD)                             |   10   |   1–2   (×0,1–0,2)     |
|  2   | O card Rotinas do Resumo e o "Ver tudo" (TDD)                     |   20   |   2–4                  |
|  3   | As regras do Dia a dia (TDD)                                      |   10   |   1–2                  |
|  4   | O Dia a dia e a aba Dieta (TDD)                                   |   20   |   2–4                  |
|  5   | O E2E antigo tocado (w16: as 8 seções)                            |    5   |   1–2                  |
|  6   | O E2E novo (--seco, compila) + as guardas                         |   15   |   2–4                  |
|  7   | A prova local completa (o CI + as provas da P6)                   |   35   |  18–25  (a máquina)    |
|  8   | E2E de tela LOCAL (5173: site e loja) + os prints — 🔒 BANCO       |   55   |  25–45                 |
|  9   | Rebase na main do dia: drift --main, rebase, a prova de novo      |   30   |  15–25                 |
| 10   | STAGING: push ff, Vercel, E2E de staging + as regressões          |   45   |  25–40                 |
| 11   | As rodadas + a entrada da W-A + PR + CI                           |   25   |   8–15                 |
| 12   | Merge → release → bump → staging = main → smoke SÓ LEITURA        |   35   |  20–30                 |
| 13   | Fechar                                                            |   15   |   5–10                 |
+------+-------------------------------------------------------------------+--------+------------------------+
| TOTAL| código 140 (Tasks 0–7) + esteira 205 (Tasks 8–13)                 |  345   | 131–220 (2h11 a 3h40)  |
+------+-------------------------------------------------------------------+--------+------------------------+
```

**A calibração (pelo real de 13/10):** a P4 levou **2h19 de relógio** (09:35 → 11:54) — as Tasks de código em 7 min, a prova local 23, o E2E local (site + loja,
com 2 reruns) 22, o rebase + a prova 16, o staging com a regressão 32, o PR + CI 8, o merge → smoke 21, fechar 2; a P5, com o ensaio pronto, fez a Task 0 em 2
min, as Tasks 1–4 em 3 e a prova local em 19 (**código + prova local em 23 min**). A P6 tem o código já rodado no ensaio e refeito no ensaio 2 (as Tasks 1–6
numa cópia limpa com os mesmos comandos) → **×0,1–0,2 nas Tasks 1–6**; o E2E é do tamanho do da P4 (13 casos com massa + a loja), com 1–2 reruns prováveis →
**×0,5–0,8 na esteira**. O mestre previa **360 (230 + 130 → 3h54 a 4h05, pior 6h00)**: o código cai (o ensaio) e a esteira sobe 75 (o rebase com a prova de novo,
as 2 regressões, a loja). **Previsão: 2h11 a 3h40 de trabalho (pior cenário 5h45 — o melhor caso sem calibrar)**, mais as ESPERAS: a P5 em produção para a Task 0
(~19:30–20:00) e o "livre" da LINUX 1 para as Tasks 8, 10 e 12 (a 21c no BANCO ou no git). Com as janelas de hoje: Task 0 ~20:00 → código + prova local ~20:35
· Task 8 ~20:40 → ~21:25 (com o "livre") · Task 9 ~21:30 → ~21:50 (só se a `main` andou) · staging → produção ~21:50 → ~23:05 · fechar ~23:15 (pior ~01:45).
Atrasou → avisar antes.

## Comandos (valem em todas as tasks)

- **Todo comando começa com `cd ~/projetos/physiqcalc-wa-p6 &&`** (W) ou `cd ~/projetos/physiqcalc-scratch/w-a/p6 &&` (S) — o cwd volta ao inicial a cada
  chamada. Variável não sobrevive entre chamadas: repetir na mesma linha.
- **Contra o diálogo de permissão (travou um agente 1h30 na P1):** nada de `bash -c '…'`, `sh -c`, subshell `( … )` com `time`, `eval` nem `$(…)` na linha de
  comando; passo complexo = script em arquivo em `~/projetos/physiqcalc-scratch/w-a/p6/` (o conteúdo está no Apêndice A); `rm` só com caminho literal ou
  `"${VAR:?}/…"`. Python de mais de 1 linha = arquivo (nada de heredoc na linha de comando). Valor do dia (sha, nº do PR, hora) = ler num comando e escrever
  o valor no seguinte.
- **Pesado na fila, com 2 workers e o `TMPDIR` do scratch:** Vitest = `bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh <arquivos…>`; o resto =
  `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P <cmd>`. **Rodada grande (o lint e o
  Vitest do repo inteiro, o build) só nas Tasks 7 e 9**; entre as rodadas, a fila livre (a LINUX 1 usa a mesma — o Vitest inteiro dela segura ~10–13 min:
  `bash ~/projetos/physiqcalc-scratch/w-a/p6/prova_partes.sh fila` espera até 500 s antes de cada parte).
- **Python sem bytecode no repo:** `PYTHONDONTWRITEBYTECODE=1`; sintaxe por `python3 -c "compile(open('<arq>').read(), '<arq>', 'exec'); print('compila ok')"`.
- **Os arquivos novos vêm das cópias conferidas:** `bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh <caminho no repo>…` (não sobrescreve; confere o md5 de
  `codigo.md5`; o conteúdo é o dos blocos deste plano). **As edições** nos arquivos que existem: `git apply ~/projetos/physiqcalc-scratch/w-a/p6/patches/<task>.patch`
  (o drift da Task 0 diz se aplicam). Se um não aplicar, fazer a edição à mão pelo bloco `diff` da task.
- **Commit (o comando INTEIRO, só os arquivos da task):**
  `git add <arquivos> && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`.
- **Aviso de progresso (regra global):** `HHhMM a HHhMM (pior cenário HHhMM)` + as fases (✅ · 🚧 · ⏳), uma por linha, terminal + tópico; a cada ~30 min num
  agente longo. Cada task fechada → `bash ~/projetos/physiqcalc-scratch/w-a/p6/feita.sh <N> "<resumo>" "<linha>"…`.
- **Coordenação (mestre §0, quadro):** trava 🔒 no quadro + `SendMessage` à LINUX 1 (a sessão da linha dela no quadro) + **esperar o "livre"/"pode ir"** antes
  de: E2E com massa no staging (Tasks 8 e 10), push no `staging` (Task 10), merge na `main` e o realinhar (Task 12). Soltou → "livre" + aviso. Quem executa as
  tasks e não é o coordenador anota no `progresso.log` o que é do quadro. `bash ~/projetos/physiqcalc-scratch/w-a/p6/travas.sh` mostra o estado (só leitura).

---

### Task 0: Preparar (depois da P5 em produção — a worktree nova, o plano no repo, o drift, a massa SÓ LEITURA, o quadro, os pedidos à LINUX 1)

**Files:** o plano (`docs/superpowers/plans/2026-10-13-w-a-p6-painel-rotinas-dia-a-dia.md`); fora do repo, nada novo (os scripts de `p6/` já existem).
**Estimativa:** 25 min (calibrado 6–12). **Espera:** a P5 em produção (a linha da W-A no quadro com "✅ P5 EM PRODUÇÃO"; ~19:30–20:00).

- [ ] **Step 1: O estado do git e das outras sessões (comando ISOLADO)**

Run: `git -C ~/projetos/physiqcalc fetch origin && git -C ~/projetos/physiqcalc log origin/main --oneline -6 && git -C ~/projetos/physiqcalc log origin/staging --oneline -2 && gh pr list --repo weslleybertoldo/physiqcalc --state open && bash ~/projetos/physiqcalc-scratch/w-a/p6/travas.sh`
Expected: na `origin/main`, o squash "W-A P5: …" e o `chore: bump version to v3.1xx` (a P5 em produção; antes dela, o squash da 21d se ela entrou); nenhum
PR aberto mexendo em `src/painel/aluno/**`, `src/nutricao/editor/lib/acesso.ts` ou `e2e/{wa,w16}/`. As travas: em que fase a LINUX 1 está (a 21c no BANCO
ou no git?) — a P6 começa o código já; o BANCO e o git só com o "livre" dela.

- [ ] **Step 2: As funções da W-A publicadas (SÓ LEITURA)**

Run: `python3 ~/projetos/physiqcalc-scratch/w-a/p6/funcoes_wa.py --esperar-publicadas`
Expected: `acessos` e `aluno-dia` (principal, `verify_jwt` True) e `treino-acessos` (Treino, False) ACTIVE → `esperado: True`.

- [ ] **Step 3: A worktree nova da `origin/main`, o `.env.local` do staging e as dependências**

Run: `git -C ~/projetos/physiqcalc worktree add -b feat/w-a-p6-painel-rotinas ~/projetos/physiqcalc-wa-p6 origin/main && cp ~/projetos/physiqcalc-acessos/.env.local ~/projetos/physiqcalc-wa-p6/.env.local && grep -c "^VITE_DB_SCHEMA=staging$" ~/projetos/physiqcalc-wa-p6/.env.local`
Expected: a worktree em `~/projetos/physiqcalc-wa-p6` na branch `feat/w-a-p6-painel-rotinas` (o nome do mestre §0) e `1` (o build local é o de staging). Sem a
worktree `physiqcalc-acessos` → copiar de `~/projetos/physiqcalc-wa-p5/.env.local` ou `~/projetos/physiqcalc-w2/.env.local` (o mesmo arquivo). Depois:
`cd ~/projetos/physiqcalc-wa-p6 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npm ci`
Expected: `added … packages` sem erro (~1–6 min; a fila pode estar com a LINUX 1).

- [ ] **Step 4: O plano no repo**

Run: `cd ~/projetos/physiqcalc-wa-p6 && cp ~/projetos/physiqcalc-scratch/w-a/p6/plano-p6.md docs/superpowers/plans/2026-10-13-w-a-p6-painel-rotinas-dia-a-dia.md && git add docs/superpowers/plans/2026-10-13-w-a-p6-painel-rotinas-dia-a-dia.md && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(w-a): plano da P6 (painel: rotinas e dia a dia)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/plans/2026-10-13-w-a-p6-painel-rotinas-dia-a-dia.md`
Expected: 1 commit novo.

- [ ] **Step 5: O drift (o que o plano usa ainda é o que era)**

Run: `cd ~/projetos/physiqcalc-wa-p6 && PATH=~/.local/node/bin:$PATH bash ~/projetos/physiqcalc-scratch/w-a/p6/drift.sh`
Expected: `drift: rc=0` — os 4 arquivos que a P6 edita "igual" aos de `p6/orig`, "o patch das edições aplica" e "a entrada da W-A no docs/e2e-rodadas.md
aplica"; o contrato da P2 e a folha da P3 "ok"; a ficha (o que a P6 só importa) "ok"; as guardas "ok" (as 3 pastas da P6 na guarda da W-A; o Resumo e a lib do
editor nas áreas da hml-20); os arquivos novos "livre". Alguma linha MUDOU/FALTA → ANTES de codar: abrir o diff (`git diff --no-index ~/projetos/physiqcalc-scratch/w-a/p6/orig/<arq> <arq>`),
ajustar a edição da task daquele arquivo à mão (o bloco `diff` da task diz o que muda), rodar os testes da task e anotar no `progresso.log`.

- [ ] **Step 6: A massa de TESTE e a saúde (SÓ LEITURA)**

Run: `cd ~/projetos/physiqcalc-wa-p6 && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p6/massa_p6.py && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p6/saude.py "a P6"`
Expected: `matricula_a 1`, `plano_ativo_da_a 1`, `refeicoes_hoje_com_alimento ≥ 1`, `nivel_dieta_a 'ver'`, `taco_arroz ≥ 1`, `aluna_com_login 1`,
`rotinas_vivas_aluna ≤ 26`, `contas_do_w13 ≥ 1`, `itens_do_dia_hoje 0`, `extras_hoje 0`, `refeicao_temporaria 0`, as sobras da W-A todas 0, nenhum estado com
massa → `massa de TESTE pronta para o E2E da P6: True`; o `/health` dos 2 projetos ACTIVE_HEALTHY e `longas 0, esperando 0`. `nivel_dieta_a 'mexer'`,
`itens_do_dia_hoje > 0` ou `historico_recente_a > 0` → alguém mexeu na matrícula A (o quadro: quem — a P5 em produção já limpou a dela; não mexer sem saber).

- [ ] **Step 7: O quadro (o coordenador escreve; quem executa só anota no `progresso.log`)** — a linha da W-A: "🚧 P6 (painel: rotinas e dia a dia) desde HH:MM —
  worktree `~/projetos/physiqcalc-wa-p6` (`feat/w-a-p6-painel-rotinas` da `main` `<sha>`). RESERVADOS: `src/painel/aluno/resumo/CardRotinas.tsx` (+ teste),
  `src/painel/aluno/rotinas/**`, `src/painel/aluno/diaADia/**`, `src/painel/aluno/abas/Dieta.test.tsx`, `e2e/wa/telas_painel.py`,
  `docs/superpowers/plans/2026-10-13-w-a-p6-painel-rotinas-dia-a-dia.md`; edita: `src/painel/aluno/abas/Dieta.tsx`, `src/nutricao/editor/lib/acesso.ts` (+ teste),
  `e2e/w16/telas.py` (1 verificação), `docs/e2e-rodadas.md` (a entrada da W-A + o topo); sem migration, sem função; janelas pedidas: 🔒 BANCO (Task 8: E2E
  local; Task 10: staging) e 🔒 git (Tasks 10 e 12) — cada uma com o 'livre' da LINUX 1".

- [ ] **Step 8: Os pedidos à LINUX 1 (1 `SendMessage`, à sessão da linha dela no quadro)**: "W-A P6 (painel: rotinas e dia a dia) começou o código LOCAL
  (worktree `~/projetos/physiqcalc-wa-p6`; sem migration, sem função). 1) Arquivos — nenhum da 21c nem da 21e: novos `src/painel/aluno/resumo/CardRotinas.tsx` (a
  pasta do Resumo — a 21c mexe só no `resumo/acesso/api.ts`), `src/painel/aluno/{rotinas,diaADia}/**`, `src/painel/aluno/abas/Dieta.test.tsx` e
  `e2e/wa/telas_painel.py`; edito `src/painel/aluno/abas/Dieta.tsx`, `src/nutricao/editor/lib/acesso.ts` (+ teste — o 'Dia a dia' nas seções, sem leitura),
  1 verificação do `e2e/w16/telas.py` (8 seções) e o `docs/e2e-rodadas.md` (o parágrafo da W-A na 'Rotina' + o topo). 2) As suas guardas (`semLeituraDireta`,
  `semBancoNoNavegador`) e os falsos (`src/test/{nutricaoFalsa,financeiroFalso}.ts`): não toco nem uso; 0 achado nos arquivos novos. 3) A rede do painel: o
  Resumo ganha 1 `ler` da `aluno-dia` (q=aluno_rotinas) e a aba Dieta do personal 2 (aluno_dia, aluno_rotinas) + 1 `ler` da `nutricao` (os ✓ de 14 dias, no
  lote) — a sua linha de base da 21c com a P6 dentro, se eu entrar antes. 4) A 21c republica a `nutricao`: que não seja com um E2E da P6 rodando (eu aviso
  antes dos meus); a aba Dieta da ficha (com o Dia a dia) entra na sua regressão. 5) Se a 21c mudar o que o Resumo grava ao abrir, me avise (o
  `BARRADAS_ACEITAS` do meu smoke de produção acompanha). 6) Janelas (cada uma com o seu 'livre'): 🔒 BANCO do staging ~35 min para o E2E LOCAL (Task 8; uso a
  w5p-aluna — a matrícula A: os acessos da Dieta, os ✓ de hoje, o dia, as rotinas e, ~1 s, uma refeição temporária no plano dela; tudo volta —, a w5p-nutri, a
  w5p-personal e o w13-dono (a 2ª matrícula da Massa); nenhum 'Sair' global); depois: 🔒 git + BANCO ~40 min (push ff no `staging` + E2E de staging + as
  regressões `e2e/w16/telas.py --casos secoes` e `e2e/wa/telas_acessos.py`) e o git do merge/realinhar." → a resposta no `progresso.log`.

- [ ] **Step 9: Previsão + marca** — o aviso de progresso (terminal + tópico) com `HHhMM a HHhMM (pior cenário HHhMM)` e as fases;
  `bash ~/projetos/physiqcalc-scratch/w-a/p6/feita.sh 0 "worktree, npm ci, plano, drift rc=0, massa pronta, pedidos à LINUX 1" "<o que o Step 1 e o 6 mostraram>"`.

---

### Task 1: As regras das rotinas no painel — `src/painel/aluno/rotinas/regras.ts` (TDD)

**Files:** Create `src/painel/aluno/rotinas/regras.ts`, `src/painel/aluno/rotinas/regras.test.ts`.
**Estimativa:** 10 min (calibrado 1–2).

- [ ] **Step 1: O teste (vermelho)** — `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/rotinas/regras.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/rotinas/regras.test.ts`
  → `Test Files 1 failed (1)` · FAIL `Failed to resolve import "./regras"`.

`src/painel/aluno/rotinas/regras.test.ts`:
```ts
// Physiq W-A P6 — as regras PURAS das rotinas no painel (src/painel/aluno/rotinas/regras.ts): a janela de 14 dias de SP, as de hoje com o ✓ do
// aluno (sem as apagadas), as que valiam num dia passado (criadas até o dia; apagadas depois aparecem com o selo), o selo de quem criou, o texto
// da apagada (pelo aluno / por quem / sem quem), o histórico em frases (campo a campo, na ordem da folha) e o estado do card.
import { describe, expect, it } from "vitest";
import { MENSAGEM_ERRO_ALUNO_DIA } from "@/aluno-dia/api";
import type { EventoDaRotina, RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";
import {
  JANELA_DIAS, TEXTOS, apagadasDoAluno, estadoDoCard, eventoNaTela, fmtDiaMes, fmtDiaMesHora, janelaDoPainel, nomeDaRotina, proximasNoCard,
  rotinasDeHoje, rotinasNoDia, seloDaRotina, textoApagada, valorDoCampo,
} from "./regras";

const TER = "2026-10-13"; // terça-feira (ISO 2)
const AGORA = new Date("2026-10-14T02:30:00Z"); // 23:30 de terça em São Paulo

const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "outro", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});
const evento = (o: Partial<EventoDaRotina> & Pick<EventoDaRotina, "rotina_id" | "o_que">): EventoDaRotina => ({
  quem: "profissional", antes: null, depois: null, em: "2026-10-12T20:20:00Z", por_nome: "Ana Paula Souza", ...o,
});
const dados = (o: Partial<RotinasDoAluno> = {}): RotinasDoAluno => ({
  paciente_id: "p1", tem_login: true, pode_criar: true, rotinas: [], feitas: [], historico: [], ...o,
});

describe("W-A P6: a janela e as datas de São Paulo", () => {
  it("os últimos 14 dias terminando hoje (23:30 de terça em SP ainda é terça); dd/mm e dd/mm hh:mm em SP", () => {
    expect(JANELA_DIAS).toBe(14);
    expect(janelaDoPainel(AGORA)).toEqual({ de: "2026-09-30", ate: TER });
    expect(fmtDiaMes("2026-10-13T02:30:00Z")).toBe("12/10");
    expect(fmtDiaMesHora("2026-10-12T20:20:00Z")).toBe("12/10 17:20");
  });
});

describe("W-A P6: as rotinas de hoje (o card) e as de um dia passado (o dia a dia)", () => {
  const lista = [
    rotina({ id: "agua", horario: "10:00", origem: "profissional", pode_editar: true, criada_por_nome: "Ana Paula" }),
    rotina({ id: "creatina", horario: "08:00" }),
    rotina({ id: "fds", dias_semana: [6, 7] }),
    rotina({ id: "apagada", horario: "07:00", arquivada_em: "2026-10-12T15:00:00Z", arquivada_pelo_aluno: true }),
    rotina({ id: "nova", horario: "09:00", criada_em: "2026-10-13T12:00:00Z" }),
  ];
  const feitas = [
    { rotina_id: "creatina", dia: TER, feita_em: "2026-10-13T11:00:00Z" },
    { rotina_id: "apagada", dia: "2026-10-12", feita_em: "2026-10-12T10:05:00Z" },
    { rotina_id: "agua", dia: "2026-10-12", feita_em: "2026-10-12T13:00:00Z" },
  ];

  it("hoje: as vivas do dia da semana, pela hora, com o ✓ do aluno (a regra do app); sem as apagadas e as de outro dia da semana", () => {
    const hoje = rotinasDeHoje({ rotinas: lista, feitas }, TER);
    expect(hoje.map((r) => [r.id, r.feita])).toEqual([["creatina", true], ["nova", false], ["agua", false]]);
    expect(hoje.find((r) => r.id === "agua")!.pode_editar).toBe(true); // o que o servidor mandou vai junto
  });

  it("um dia passado: as que já existiam e não tinham sido apagadas ANTES dele (a apagada depois vem com o selo); o ✓ daquele dia", () => {
    const seg = rotinasNoDia(lista, feitas, "2026-10-12");
    expect(seg.map((r) => [r.id, r.feita, r.apagada])).toEqual([["apagada", true, true], ["creatina", false, false], ["agua", true, false]]);
    // criada no dia 13 não aparece no 12; a apagada no 12 não aparece no 13
    expect(rotinasNoDia(lista, feitas, TER).map((r) => r.id)).toEqual(["creatina", "nova", "agua"]);
    // a de fim de semana só no sábado e no domingo
    expect(rotinasNoDia(lista, feitas, "2026-10-11").map((r) => r.id)).toEqual(["apagada", "creatina", "agua", "fds"]);
  });

  it("o card: primeiro as que faltam, depois as feitas; até 4 e o '+N'", () => {
    const l = [{ id: "a", feita: true }, { id: "b", feita: false }, { id: "c", feita: false }, { id: "d", feita: true }, { id: "e", feita: false }];
    expect(proximasNoCard(l)).toEqual({ visiveis: [l[1], l[2], l[4], l[0]], resto: 1 });
    expect(proximasNoCard(l.slice(0, 2))).toEqual({ visiveis: [l[1], l[0]], resto: 0 });
  });
});

describe("W-A P6: o selo, as apagadas e o histórico", () => {
  it("o selo: 'do aluno' · 'de <1º nome de quem criou>' · 'do profissional' (sem o nome)", () => {
    expect(seloDaRotina({ origem: "aluno", criada_por_nome: null })).toBe("do aluno");
    expect(seloDaRotina({ origem: "profissional", criada_por_nome: "Ana Paula Souza" })).toBe("de Ana");
    expect(seloDaRotina({ origem: "profissional", criada_por_nome: null })).toBe("do profissional");
  });

  it("a apagada: 'apagada pelo aluno em 12/10' (P8b) · 'apagada por Ana em 12/10' (pelo histórico) · 'apagada em 12/10'; as apagadas, a mais nova primeiro", () => {
    const pelo = rotina({ id: "x", arquivada_em: "2026-10-12T15:00:00Z", arquivada_pelo_aluno: true });
    const porAna = rotina({ id: "y", origem: "profissional", arquivada_em: "2026-10-12T16:00:00Z" });
    const semQuem = rotina({ id: "z", origem: "profissional", arquivada_em: "2026-10-10T16:00:00Z" });
    const hist = [evento({ rotina_id: "y", o_que: "arquivou" })];
    expect(textoApagada(pelo, hist)).toBe("apagada pelo aluno em 12/10");
    expect(textoApagada(porAna, hist)).toBe("apagada por Ana em 12/10");
    expect(textoApagada(semQuem, hist)).toBe("apagada em 10/10");
    expect(textoApagada(rotina({ id: "viva" }), hist)).toBe("");
    expect(apagadasDoAluno([semQuem, rotina({ id: "viva" }), pelo, porAna]).map((r) => r.id)).toEqual(["y", "x", "z"]);
  });

  it("o histórico em frases: quem, o quê e, no 'mudou', cada campo 'antes → depois' na ordem da folha", () => {
    const mudou = eventoNaTela(evento({
      rotina_id: "a", o_que: "mudou", antes: { horario: "08:00", detalhe: null, lembrete: false, dias_semana: [1, 2, 3, 4, 5, 6, 7] },
      depois: { lembrete: true, horario: "09:00", detalhe: "5 g", dias_semana: [1, 2, 3, 4, 5] },
    }));
    expect(mudou).toEqual({
      quem: "Ana", acao: "mudou", quando: "12/10 17:20",
      mudancas: ["detalhe sem detalhe → 5 g", "horário 08:00 → 09:00", "dias Todos os dias → Seg a Sex", "lembrete desligado → ligado"],
    });
    expect(eventoNaTela(evento({ rotina_id: "a", o_que: "arquivou", quem: "aluno", por_nome: null }))).toMatchObject({ quem: "O aluno", acao: "apagou", mudancas: [] });
    expect(eventoNaTela(evento({ rotina_id: "a", o_que: "criou", por_nome: null, depois: { nome: "Água" } }))).toMatchObject({ quem: "Um profissional", acao: "criou", mudancas: [] });
    expect([valorDoCampo("tipo", "remedio"), valorDoCampo("horario", null), valorDoCampo("nome", "Creatina")]).toEqual(["Remédio", "sem horário", "Creatina"]);
    expect(nomeDaRotina([rotina({ id: "a", nome: "Creatina" })], "a")).toBe("Creatina");
    expect(nomeDaRotina([], "sumiu")).toBe("Rotina apagada");
  });
});

describe("W-A P6: o estado do card", () => {
  const hoje = TER;
  it("carregando · sem internet (a consulta parada, sem o dado) · erro · sem login · vazio (nenhuma viva) · nenhuma hoje · lista", () => {
    expect(estadoDoCard({ isLoading: true, isError: false }, hoje)).toBe("carregando");
    expect(estadoDoCard({ isLoading: false, isError: false, fetchStatus: "paused" }, hoje)).toBe("sem-internet");
    expect(estadoDoCard({ isLoading: false, isError: true }, hoje)).toBe("erro");
    // uma releitura que falhou depois não apaga o que já estava na tela
    expect(estadoDoCard({ isLoading: false, isError: true, data: dados({ rotinas: [rotina({ id: "a" })] }) }, hoje)).toBe("lista");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ tem_login: false }) }, hoje)).toBe("sem-login");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ rotinas: [rotina({ id: "x", arquivada_em: "2026-10-01T00:00:00Z" })] }) }, hoje)).toBe("vazio");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ rotinas: [rotina({ id: "fds", dias_semana: [6, 7] })] }) }, hoje)).toBe("nenhuma-hoje");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ rotinas: [rotina({ id: "a" })] }) }, hoje)).toBe("lista");
  });

  it("o texto do 'sem login' é o da função (a mesma frase do sem_login_do_aluno)", () => {
    expect(TEXTOS.semLogin).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_login_do_aluno);
  });
});
```

- [ ] **Step 2: As regras (verde)** — `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/rotinas/regras.ts && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/rotinas/regras.test.ts`
  → `Test Files 1 passed (1)` · `Tests 9 passed (9)`.

`src/painel/aluno/rotinas/regras.ts`:
```ts
// Physiq W-A P6 — regras PURAS das rotinas no PAINEL (o card "Rotinas" do Resumo e o "Ver tudo"; o "Dia a dia" da Dieta lê as rotinas do dia
// daqui também): a janela (os últimos 14 dias de São Paulo — a MESMA consulta do card e do dia a dia), as rotinas de hoje com o ✓ que o ALUNO
// deu (só leitura), as rotinas que valiam num dia passado (as apagadas depois também), o selo de quem criou, as apagadas ("apagada pelo aluno
// em 12/10"), o histórico em frases ("horário 08:00 → 09:00") e o estado do card. Sem rede; testado em regras.test.ts. Quem vê o quê é o
// servidor (rotinas_do_aluno, wa2 — padrão 9): as do aluno + as de profissional das matrículas que quem chama vê; `pode_editar` = as de
// profissional DESTA matrícula, vivas, com o w14_pode_editar (P8b: o aluno muda e apaga todas; o profissional, só as dele daqui).
import { hojeSP, rotinasDoDia, type RotinaDoDia } from "@/aluno-dia/regras";
import type { EventoDaRotina, RotinaDoProfissional, RotinaFeita, RotinasDoAluno } from "@/aluno-dia/tipos";
import { somarDias } from "@/nutricao/app/dia";
import { diaDaSemana, textoDias } from "@/nutricao/app/metasUtil";
import { ROTULO_TIPO } from "@/rotinas/textos";

/** O card e o dia a dia leem os últimos 14 dias (spec §4.5: "escolhe o dia (últimos 14)"); o servidor aceita até 31. */
export const JANELA_DIAS = 14;
/** O card mostra até 4 rotinas de hoje + "+N" (o mesmo do card do Início do app — P3). */
export const NO_CARD = 4;

export const TEXTOS = {
  titulo: "Rotinas",
  nova: "Nova rotina",
  verTudo: "Ver tudo",
  todas: "Todas as rotinas",
  hoje: "Hoje — o ✓ é o que o aluno marcou no app.",
  // = MENSAGEM_ERRO_ALUNO_DIA.sem_login_do_aluno (spec §4.5; o teste confere)
  semLogin: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos.",
  abrirAcessos: "Abrir Acessos",
  vazio: "Nenhuma rotina ainda.",
  vazioTexto: "Crie uma rotina (creatina, remédio, água…): ele recebe o aviso no app.",
  nenhumaHoje: "Nenhuma rotina hoje.",
  erroLer: "Não deu para carregar as rotinas.",
  semInternetLer: "Sem conexão: as rotinas aparecem quando a internet voltar.",
  semInternet: "Sem conexão: criar e mudar rotinas voltam quando a internet voltar.",
  soDoAluno: "As rotinas do aluno só ele muda; as de profissional desta conta você muda tocando nelas.",
  doAluno: "do aluno",
  doProfissional: "do profissional",
  vivas: "Rotinas",
  apagadas: "Apagadas",
  historico: "Histórico",
  nenhumaViva: "Nenhuma rotina viva.",
  nenhumaApagada: "Nenhuma rotina apagada.",
  nenhumEvento: "Nada mudou ainda.",
  feitaPeloAluno: "feita pelo aluno",
  naoFeita: "ainda não feita",
  apagada: "apagada",
  semHorario: "Sem horário",
} as const;

/** Os últimos JANELA_DIAS dias de São Paulo, terminando hoje. */
export function janelaDoPainel(agora: Date = new Date()): { de: string; ate: string } {
  const ate = hojeSP(agora);
  return { de: somarDias(ate, -(JANELA_DIAS - 1)), ate };
}

/** O dia de São Paulo de um instante (yyyy-mm-dd). */
export const diaSP = (iso: string): string => hojeSP(new Date(iso));

const DATA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const HORA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "12/10" (o dia de São Paulo). */
export const fmtDiaMes = (iso: string): string => DATA_SP.format(new Date(iso));
/** "12/10 17:20" (São Paulo). */
export const fmtDiaMesHora = (iso: string): string => `${fmtDiaMes(iso)} ${HORA_SP.format(new Date(iso))}`;

const primeiroNome = (nome: string | null | undefined): string => (nome ?? "").trim().split(/\s+/)[0] ?? "";

export type RotinaDoDiaNoPainel = RotinaDoDia & RotinaDoProfissional;
export interface RotinaNoDia extends RotinaDoDiaNoPainel {
  /** apagada depois (o dia a dia mostra o que valia naquele dia) */
  apagada: boolean;
}

/** As de HOJE no card: vivas, do dia da semana, na ordem do app, com o ✓ que o aluno deu (a regra do app — rotinasDoDia da P2). */
export const rotinasDeHoje = (d: Pick<RotinasDoAluno, "rotinas" | "feitas">, hoje: string): RotinaDoDiaNoPainel[] =>
  rotinasDoDia(d.rotinas, d.feitas, hoje) as RotinaDoDiaNoPainel[];

/** O card: primeiro as que faltam (pela hora), depois as feitas; até `limite` e o "+N" do resto (o molde do card do Início — P3). */
export function proximasNoCard<T extends { feita: boolean }>(lista: readonly T[], limite = NO_CARD): { visiveis: T[]; resto: number } {
  const ordem = [...lista.filter((r) => !r.feita), ...lista.filter((r) => r.feita)];
  return { visiveis: ordem.slice(0, limite), resto: Math.max(0, ordem.length - limite) };
}

/**
 * As rotinas que valiam num dia (o dia a dia): criadas até aquele dia, vivas ou apagadas a partir dele, com o dia da semana marcado — na ordem
 * da tela, com o ✓ daquele dia. A apagada depois aparece com o selo "apagada".
 */
export function rotinasNoDia(rotinas: readonly RotinaDoProfissional[], feitas: readonly RotinaFeita[], dia: string): RotinaNoDia[] {
  const dow = diaDaSemana(dia);
  const doDia = new Map(feitas.filter((f) => f.dia === dia).map((f) => [f.rotina_id, f.feita_em]));
  return rotinas
    .filter((r) => diaSP(r.criada_em) <= dia && (!r.arquivada_em || diaSP(r.arquivada_em) >= dia) && r.dias_semana.includes(dow))
    .map((r) => ({ ...r, feita: doDia.has(r.id), feita_em: doDia.get(r.id) ?? null, apagada: !!r.arquivada_em }))
    .sort((a, b) => (a.horario ?? "99:99").localeCompare(b.horario ?? "99:99") || a.ordem - b.ordem || a.criada_em.localeCompare(b.criada_em));
}

export const vivasDoAluno = (rotinas: readonly RotinaDoProfissional[]): RotinaDoProfissional[] => rotinas.filter((r) => !r.arquivada_em);
export const apagadasDoAluno = (rotinas: readonly RotinaDoProfissional[]): RotinaDoProfissional[] =>
  rotinas.filter((r) => !!r.arquivada_em).sort((a, b) => (b.arquivada_em ?? "").localeCompare(a.arquivada_em ?? ""));

/** O selo de quem criou: "do aluno" · "de Ana" (o profissional que criou) · "do profissional" (sem o nome). */
export function seloDaRotina(r: Pick<RotinaDoProfissional, "origem" | "criada_por_nome">): string {
  if (r.origem === "aluno") return TEXTOS.doAluno;
  const nome = primeiroNome(r.criada_por_nome);
  return nome ? `de ${nome}` : TEXTOS.doProfissional;
}

/** "apagada pelo aluno em 12/10" · "apagada por Ana em 12/10" (quem apagou, pelo histórico) · "apagada em 12/10". */
export function textoApagada(r: Pick<RotinaDoProfissional, "id" | "arquivada_em" | "arquivada_pelo_aluno">, historico: readonly EventoDaRotina[]): string {
  if (!r.arquivada_em) return "";
  const quando = fmtDiaMes(r.arquivada_em);
  if (r.arquivada_pelo_aluno) return `apagada pelo aluno em ${quando}`;
  const ev = historico.find((e) => e.rotina_id === r.id && e.o_que === "arquivou");
  const nome = ev?.quem === "profissional" ? primeiroNome(ev.por_nome) : "";
  return nome ? `apagada por ${nome} em ${quando}` : `apagada em ${quando}`;
}

const ROTULO_CAMPO: Record<string, string> = {
  nome: "nome", detalhe: "detalhe", tipo: "tipo", horario: "horário", dias_semana: "dias", lembrete: "lembrete",
};
const ORDEM_CAMPOS = ["nome", "detalhe", "tipo", "horario", "dias_semana", "lembrete"];

/** Um valor do histórico como a tela mostra. */
export function valorDoCampo(campo: string, v: unknown): string {
  if (campo === "horario") return typeof v === "string" && v ? v : "sem horário";
  if (campo === "detalhe") return typeof v === "string" && v ? v : "sem detalhe";
  if (campo === "tipo") return ROTULO_TIPO[v as keyof typeof ROTULO_TIPO] ?? String(v ?? "");
  if (campo === "dias_semana") return textoDias(v);
  if (campo === "lembrete") return v ? "ligado" : "desligado";
  return typeof v === "string" ? v : String(v ?? "");
}

export interface EventoNaTela {
  quem: string;
  /** criou · mudou · apagou */
  acao: string;
  /** "horário 08:00 → 09:00" (só no mudou, um por campo, na ordem da folha) */
  mudancas: string[];
  quando: string;
}

/** O evento do histórico em frases: "Ana" / "O aluno" + "criou" / "mudou" / "apagou" + as mudanças campo a campo. */
export function eventoNaTela(e: EventoDaRotina): EventoNaTela {
  const quem = e.quem === "aluno" ? "O aluno" : primeiroNome(e.por_nome) || "Um profissional";
  const acao = e.o_que === "criou" ? "criou" : e.o_que === "mudou" ? "mudou" : "apagou";
  const depois = (e.depois ?? {}) as Record<string, unknown>;
  const antes = (e.antes ?? {}) as Record<string, unknown>;
  const mudancas = e.o_que !== "mudou" ? [] : ORDEM_CAMPOS.filter((k) => k in depois)
    .map((k) => `${ROTULO_CAMPO[k]} ${valorDoCampo(k, antes[k])} → ${valorDoCampo(k, depois[k])}`);
  return { quem, acao, mudancas, quando: fmtDiaMesHora(e.em) };
}

/** O nome da rotina de um evento (a lista traz as vivas e as 50 apagadas mais novas; fora disso, "Rotina apagada"). */
export const nomeDaRotina = (rotinas: readonly Pick<RotinaDoProfissional, "id" | "nome">[], id: string): string =>
  rotinas.find((r) => r.id === id)?.nome ?? "Rotina apagada";

export type EstadoDoCard = "carregando" | "sem-internet" | "erro" | "sem-login" | "vazio" | "nenhuma-hoje" | "lista";

/**
 * O estado do card (o data-card-rotinas dos E2E). Sem o dado: sem internet a consulta espera a rede ("sem-internet", não o erro); senão, o
 * erro. Com o dado (mesmo se uma releitura falhou depois), o dado.
 */
export function estadoDoCard(
  q: { isLoading: boolean; isError: boolean; fetchStatus?: string; data?: Pick<RotinasDoAluno, "tem_login" | "rotinas" | "feitas"> | null },
  hoje: string,
): EstadoDoCard {
  if (q.isLoading) return "carregando";
  if (!q.data) return !q.isError && q.fetchStatus === "paused" ? "sem-internet" : "erro";
  if (!q.data.tem_login) return "sem-login";
  if (vivasDoAluno(q.data.rotinas).length === 0) return "vazio";
  return rotinasDeHoje(q.data, hoje).length ? "lista" : "nenhuma-hoje";
}
```

- [ ] **Step 3: Commit** — `feat(w-a): as regras das rotinas no painel (a janela de 14 dias, as de hoje com o ✓ do aluno, o selo, a apagada e o histórico em frases)`
  com os 2 arquivos; `feita.sh 1 "regras das rotinas" "<placar>"`.

---

### Task 2: O card "Rotinas" do Resumo e o "Ver tudo" (TDD)

**Files:** Create `src/painel/aluno/resumo/CardRotinas.test.tsx`, `src/painel/aluno/rotinas/useRotinasDoAluno.ts`, `src/painel/aluno/rotinas/LinhaDaRotina.tsx`,
`src/painel/aluno/rotinas/FolhaTodasAsRotinas.tsx`, `src/painel/aluno/resumo/CardRotinas.tsx`.
**Estimativa:** 20 min (calibrado 2–4).

- [ ] **Step 1: O teste (vermelho)** — `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/resumo/CardRotinas.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/resumo/CardRotinas.test.tsx`
  → `Test Files 1 failed (1)` · FAIL `Failed to resolve import "./CardRotinas"`.

`src/painel/aluno/resumo/CardRotinas.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoDaRotina, RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

// W-A P6 — o card "Rotinas" do Resumo (spec §4.5): as de hoje com o ✓ do ALUNO (só leitura), o selo de quem criou, "Nova rotina" pela folha
// da P3 no modo do profissional (na matrícula da rota), mudar só as de profissional desta matrícula (pode_editar), o "Ver tudo" (as apagadas
// — "apagada pelo aluno em …" — e o histórico), sem login, o erro com "Tentar de novo" e sem internet. A função é fingida (a porta da P2).
const h = vi.hoisted(() => ({
  ler: vi.fn(),
  profSalvar: vi.fn(),
  profArquivar: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerRotinasDoAluno: (...a: unknown[]) => h.ler(...a),
  profSalvarRotina: (...a: unknown[]) => h.profSalvar(...a),
  profArquivarRotina: (...a: unknown[]) => h.profArquivar(...a),
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { ErroAlunoDia, MENSAGEM_ERRO_ALUNO_DIA } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import { fmtDiaMes } from "../rotinas/regras";
import CardRotinas from "./CardRotinas";

const HOJE = hojeSP();
const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "suplemento", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});
const dados = (o: Partial<RotinasDoAluno> = {}): RotinasDoAluno => ({
  paciente_id: "p1", tem_login: true, pode_criar: true, rotinas: [], feitas: [], historico: [], ...o,
});
const LISTA = dados({
  rotinas: [
    rotina({ id: "creatina", nome: "Creatina", detalhe: "5 g", horario: "08:00" }),
    rotina({ id: "agua", nome: "Água 2 L", origem: "profissional", paciente_id: "p1", horario: "10:00", pode_editar: true, criada_por_nome: "Ana Paula" }),
    rotina({ id: "magnesio", nome: "Magnésio", origem: "profissional", paciente_id: "p9", horario: "21:00", criada_por_nome: "Bruno Lima" }),
  ],
  feitas: [{ rotina_id: "creatina", dia: HOJE, feita_em: new Date().toISOString() }],
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProvedorConfirmar>
          <CardRotinas alunoId="p1" />
        </ProvedorConfirmar>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`sem ${sel}`);
  return el as HTMLElement;
});
const estado = () => document.querySelector("[data-card-rotinas]")?.getAttribute("data-card-rotinas");
const campo = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo.replace(/[()]/g, "\\$&")}`)) as HTMLInputElement;

beforeEach(() => {
  for (const f of [h.ler, h.profSalvar, h.profArquivar, h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.ler.mockResolvedValue(LISTA);
  h.profSalvar.mockImplementation(async (_a: string, id: string | null, d: Record<string, unknown>) => ({ ok: true, rotina: rotina({ id: id ?? "nova", origem: "profissional", ...d }) }));
});
afterEach(() => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  window.dispatchEvent(new Event("online"));
});

describe("W-A P6 — o card Rotinas do Resumo", () => {
  it("as de hoje: as que faltam pela hora e depois as feitas; o ✓ do aluno (só leitura); o selo de quem criou; lê a janela de 14 dias da rota", async () => {
    montar();
    await achar('[data-card-rotinas="lista"]');
    expect(h.ler).toHaveBeenCalledWith("p1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), HOJE);
    const ul = document.querySelector("[data-rotinas-hoje]")!;
    expect(ul.getAttribute("data-rotinas-hoje")).toBe("3");
    expect(ul.getAttribute("data-rotinas-hoje-feitas")).toBe("1");
    const ids = [...document.querySelectorAll("[data-rotinas-hoje] [data-rotina-painel]")].map((e) => e.getAttribute("data-rotina-painel"));
    expect(ids).toEqual(["agua", "magnesio", "creatina"]);
    const selos = [...document.querySelectorAll("[data-rotina-painel-selo]")].map((e) => e.textContent);
    expect(selos).toEqual(["de Ana", "de Bruno", "do aluno"]);
    expect(document.querySelector('[data-rotina-painel="creatina"]')!.getAttribute("data-rotina-feita")).toBe("1");
    expect(screen.getByLabelText("feita pelo aluno")).toBeInTheDocument();
    // só a de profissional DESTA matrícula abre a folha; as do aluno e a da outra matrícula, não
    expect(document.querySelector('[data-rotina-painel-abrir="agua"]')).not.toBeNull();
    expect(document.querySelector('[data-rotina-painel-abrir="creatina"]')).toBeNull();
    expect(document.querySelector('[data-rotina-painel-abrir="magnesio"]')).toBeNull();
    expect(document.querySelector("[data-card-rotinas]")!.textContent).toContain("3 VIVAS");
  });

  it("mudar a do profissional desta matrícula: a folha da P3 no modo do profissional; salvar → a função com a rota e o id; relê o card", async () => {
    montar();
    fireEvent.click(await achar('[data-rotina-painel-abrir="agua"]'));
    await achar('[data-folha-rotina="mudar"][data-folha-modo="profissional"]');
    expect(campo("Nome").value).toBe("Água 2 L");
    fireEvent.change(campo("Horário (opcional)"), { target: { value: "11:00" } });
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.profSalvar).toHaveBeenCalledWith("p1", "agua", expect.objectContaining({ nome: "Água 2 L", horario: "11:00" })));
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
    expect(h.toast.success).toHaveBeenCalledWith("Rotina salva.");
  });

  it("nenhuma ainda: o texto e 'Nova rotina' → a folha nova (profissional) → cria na matrícula da rota → 'Rotina criada.' e relê", async () => {
    h.ler.mockResolvedValue(dados());
    montar();
    await achar('[data-card-rotinas="vazio"]');
    expect(document.querySelector("[data-card-rotinas]")!.textContent).toContain("Nenhuma rotina ainda.");
    fireEvent.click(await achar("[data-rotinas-nova]"));
    await achar('[data-folha-rotina="nova"][data-folha-modo="profissional"]');
    fireEvent.change(campo("Nome"), { target: { value: "Água 2 L" } });
    fireEvent.click(screen.getByRole("radio", { name: "Hábito" }));
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.profSalvar).toHaveBeenCalledWith("p1", null, {
      nome: "Água 2 L", detalhe: null, tipo: "habito", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
    }));
    expect(h.toast.success).toHaveBeenCalledWith("Rotina criada.");
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
  });

  it("aluno sem login: a frase da spec e o atalho para a aba Acessos; sem 'Nova rotina' nem 'Ver tudo'", async () => {
    h.ler.mockResolvedValue(dados({ tem_login: false, pode_criar: false }));
    montar();
    await achar('[data-card-rotinas="sem-login"]');
    expect(document.querySelector("[data-rotinas-sem-login]")!.textContent).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_login_do_aluno);
    expect(document.querySelector("[data-rotinas-acessos]")!.getAttribute("href")).toBe("/painel/alunos/p1/acessos");
    expect(document.querySelector("[data-rotinas-nova]")).toBeNull();
    expect(document.querySelector("[data-rotinas-ver-tudo]")).toBeNull();
  });

  it("quem só vê (pode_criar = false): a lista sem 'Nova rotina'; nenhuma rotina abre a folha", async () => {
    h.ler.mockResolvedValue({ ...LISTA, pode_criar: false, rotinas: LISTA.rotinas.map((r) => ({ ...r, pode_editar: false })) });
    montar();
    await achar('[data-card-rotinas="lista"]');
    expect(document.querySelector("[data-card-rotinas]")!.getAttribute("data-rotinas-pode-criar")).toBe("0");
    expect(document.querySelector("[data-rotinas-nova]")).toBeNull();
    expect(document.querySelectorAll("[data-rotina-painel-abrir]")).toHaveLength(0);
  });

  it("o erro da função: a frase do código e 'Tentar de novo' (relê)", async () => {
    // um código que não repete sozinho (o "rede" repetiria 1 vez — o retry da consulta — e a tela iria direto para a lista)
    h.ler.mockRejectedValueOnce(new ErroAlunoDia("sem_internet")).mockResolvedValueOnce(LISTA);
    montar();
    await achar('[data-card-rotinas="erro"]');
    expect(document.querySelector("[data-rotinas-erro]")!.textContent).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_internet);
    fireEvent.click(document.querySelector("[data-rotinas-tentar]")!);
    await achar('[data-card-rotinas="lista"]');
  });

  it("sem acesso (outro profissional): a frase e nenhum 'Tentar de novo'", async () => {
    h.ler.mockRejectedValue(new ErroAlunoDia("sem_acesso"));
    montar();
    await achar('[data-card-rotinas="erro"]');
    expect(document.querySelector("[data-rotinas-erro]")!.textContent).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_acesso);
    expect(document.querySelector("[data-rotinas-tentar]")).toBeNull();
  });

  it("'Ver tudo': as vivas, a apagada pelo aluno ('apagada pelo aluno em dd/mm') e o histórico em frases (horário 08:00 → 09:00)", async () => {
    const apagadaEm = "2026-10-12T15:00:00Z";
    const historico: EventoDaRotina[] = [
      { rotina_id: "cha", quem: "aluno", o_que: "arquivou", antes: null, depois: null, em: apagadaEm, por_nome: null },
      { rotina_id: "cha", quem: "profissional", o_que: "mudou", antes: { horario: "08:00" }, depois: { horario: "09:00" }, em: "2026-10-11T12:00:00Z", por_nome: "Ana Paula" },
      { rotina_id: "cha", quem: "profissional", o_que: "criou", antes: null, depois: { nome: "Chá verde" }, em: "2026-10-10T12:00:00Z", por_nome: "Ana Paula" },
    ];
    h.ler.mockResolvedValue({
      ...LISTA,
      rotinas: [...LISTA.rotinas, rotina({ id: "cha", nome: "Chá verde", origem: "profissional", paciente_id: "p1", arquivada_em: apagadaEm, arquivada_pelo_aluno: true })],
      historico,
    });
    montar();
    fireEvent.click(await achar("[data-rotinas-ver-tudo]"));
    await achar("[data-rotinas-tudo]");
    expect(document.querySelector("[data-rotinas-tudo-vivas]")!.getAttribute("data-rotinas-tudo-vivas")).toBe("3");
    const apagada = document.querySelector('[data-rotina-apagada="cha"]')!;
    expect(apagada.getAttribute("data-rotina-apagada-pelo-aluno")).toBe("1");
    expect(apagada.querySelector("[data-rotina-apagada-texto]")!.textContent).toBe(`apagada pelo aluno em ${fmtDiaMes(apagadaEm)}`);
    expect([...document.querySelectorAll("[data-rotina-evento]")].map((e) => e.getAttribute("data-rotina-evento"))).toEqual(["arquivou", "mudou", "criou"]);
    expect(document.querySelector('[data-rotina-evento="mudou"] [data-rotina-evento-mudanca]')!.textContent).toBe("horário 08:00 → 09:00");
    expect(document.querySelector('[data-rotina-evento="arquivou"]')!.textContent).toContain("O aluno apagou Chá verde");
    // da lista do "Ver tudo", a do profissional desta matrícula abre a folha (e o "Ver tudo" fecha)
    fireEvent.click(document.querySelector('[data-rotinas-tudo] [data-rotina-painel-abrir="agua"]')!);
    await achar('[data-folha-rotina="mudar"]');
  });

  it("sem internet: 'Nova rotina' desligada com o aviso; a lista lida antes continua", async () => {
    montar();
    await achar('[data-card-rotinas="lista"]');
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    await achar("[data-rotinas-sem-internet]");
    expect((document.querySelector("[data-rotinas-nova]") as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-rotina-painel-abrir="agua"]')).toBeNull();
    expect(estado()).toBe("lista");
  });
});
```

- [ ] **Step 2: A consulta, a linha, o "Ver tudo" e o card (verde)** — `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/rotinas/useRotinasDoAluno.ts src/painel/aluno/rotinas/LinhaDaRotina.tsx src/painel/aluno/rotinas/FolhaTodasAsRotinas.tsx src/painel/aluno/resumo/CardRotinas.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/resumo/CardRotinas.test.tsx src/painel/aluno/rotinas/regras.test.ts src/rotinas/ui/FolhaRotina.test.tsx`
  → `Test Files 3 passed (3)` · `Tests 25 passed (25)`.

`src/painel/aluno/rotinas/useRotinasDoAluno.ts`:
```ts
// Physiq W-A P6 — as rotinas do aluno da rota no React Query (o card "Rotinas" do Resumo, o "Ver tudo" e o "Dia a dia" da Dieta dividem a MESMA
// consulta): aluno-dia { acao: "ler", q: "aluno_rotinas", aluno, de, ate } — as do aluno e as de profissional que quem chama vê, com as
// apagadas, o ✓ dos últimos 14 dias e o histórico (rotinas_do_aluno, wa2). Pela porta da P2 (src/aluno-dia/api.ts — nunca o banco direto). A
// chave leva a janela: virou o dia, a consulta é outra. Depois de criar, mudar ou apagar pela folha da P3, relê (o servidor é a verdade).
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { ErroAlunoDia, lerRotinasDoAluno } from "@/aluno-dia/api";
import type { RotinasDoAluno } from "@/aluno-dia/tipos";
import { janelaDoPainel } from "./regras";

export const chaveRotinasDoAluno = (alunoId: string) => ["painel-rotinas", alunoId] as const;

/** Repetir 1 vez só o que pode passar sozinho (a rede); quem não pode, o aluno que não existe, sem internet… não repetem. */
const SEM_REPETIR = new Set(["sem_acesso", "aluno_inexistente", "sem_login", "dados_invalidos", "sem_internet"]);
export const repetirLeitura = (n: number, e: unknown): boolean => n < 1 && !(e instanceof ErroAlunoDia && SEM_REPETIR.has(e.codigo));

export function useRotinasDoAluno(alunoId: string) {
  const { de, ate } = janelaDoPainel();
  return useQuery<RotinasDoAluno>({
    queryKey: [...chaveRotinasDoAluno(alunoId), de, ate],
    queryFn: () => lerRotinasDoAluno(alunoId, de, ate),
    enabled: !!alunoId,
    staleTime: 30_000,
    retry: repetirLeitura,
    networkMode: "online",
  });
}

/** Relê as rotinas deste aluno (todas as janelas). */
export const atualizarRotinasDoAluno = (qc: QueryClient, alunoId: string): Promise<void> =>
  qc.invalidateQueries({ queryKey: chaveRotinasDoAluno(alunoId) });
```

`src/painel/aluno/rotinas/LinhaDaRotina.tsx`:
```tsx
// Physiq W-A P6 — a linha de UMA rotina no painel (o card "Rotinas" do Resumo e o "Ver tudo"): hora, nome, detalhe (ou a linha de baixo que
// quem usa passa), o selo de quem criou e — quando pedido — o ✓ que o ALUNO deu (só leitura: o profissional não marca). A de profissional
// desta matrícula (pode_editar) vira um botão que abre a folha da P3; as outras são só texto.
import type { ReactNode } from "react";
import { BellRing, Circle, CircleCheck } from "lucide-react";
import type { RotinaDoProfissional } from "@/aluno-dia/tipos";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/premium/Chip";
import { TEXTOS, seloDaRotina } from "./regras";

export function LinhaDaRotina({
  rotina: r,
  feita,
  sub,
  aoAbrir,
  extra,
}: {
  rotina: RotinaDoProfissional;
  /** o ✓ do dia (undefined = não mostra) */
  feita?: boolean;
  /** a linha de baixo (o detalhe, os dias…) */
  sub?: string | null;
  /** só nas que este profissional muda (pode_editar) */
  aoAbrir?: () => void;
  extra?: ReactNode;
}) {
  const corpo = (
    <>
      {feita !== undefined &&
        (feita ? (
          <CircleCheck aria-label={TEXTOS.feitaPeloAluno} className="h-[18px] w-[18px] flex-none text-verde-2" strokeWidth={1.9} />
        ) : (
          <Circle aria-label={TEXTOS.naoFeita} className="h-[18px] w-[18px] flex-none text-texto-4" strokeWidth={1.9} />
        ))}
      <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{r.horario ?? "—"}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px] font-medium", feita ? "text-texto-3" : "text-texto")}>
          <span className="truncate" data-rotina-painel-nome>{r.nome}</span>
          {r.lembrete && <BellRing aria-label="com lembrete" className="h-3 w-3 flex-none text-texto-3" strokeWidth={1.75} />}
        </span>
        {sub && <span className="block truncate text-[11.5px] text-texto-3">{sub}</span>}
      </span>
      {extra}
      <Chip tom={r.origem === "aluno" ? "c" : "t"} className="flex-none" data-rotina-painel-selo>{seloDaRotina(r)}</Chip>
    </>
  );
  const atributos = {
    "data-rotina-painel": r.id,
    "data-rotina-origem": r.origem,
    "data-rotina-editavel": aoAbrir ? "1" : "0",
    ...(feita !== undefined ? { "data-rotina-feita": feita ? "1" : "0" } : {}),
  };
  return (
    <li className="min-w-0" {...atributos}>
      {aoAbrir ? (
        <button type="button" onClick={aoAbrir} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl py-1 text-left hover:bg-superficie"
          data-rotina-painel-abrir={r.id}>
          {corpo}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2.5 py-1">{corpo}</div>
      )}
    </li>
  );
}
```

`src/painel/aluno/rotinas/FolhaTodasAsRotinas.tsx`:
```tsx
// Physiq W-A P6 — o "Ver tudo" do card Rotinas (spec §4.5): as rotinas vivas (as de profissional desta matrícula abrem a folha da P3 para mudar
// ou apagar), as APAGADAS ("apagada pelo aluno em 12/10" — P8b: o aluno apaga até a do profissional, e o profissional vê) e o HISTÓRICO ("Ana
// mudou: horário 08:00 → 09:00"). Só lê o que o card já trouxe (a mesma consulta).
import { History, Trash2 } from "lucide-react";
import type { RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";
import { linhaDaRotina } from "@/rotinas/regras";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { LinhaDaRotina } from "./LinhaDaRotina";
import { TEXTOS, apagadasDoAluno, eventoNaTela, nomeDaRotina, textoApagada, vivasDoAluno } from "./regras";

function Titulo({ children }: { children: string }) {
  return <h4 className="mb-1.5 mt-4 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-texto-3 first:mt-1">{children}</h4>;
}

export function FolhaTodasAsRotinas({
  aberta,
  aoMudar,
  dados,
  aoEditar,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  dados: RotinasDoAluno;
  aoEditar?: (r: RotinaDoProfissional) => void;
}) {
  const vivas = vivasDoAluno(dados.rotinas);
  const apagadas = apagadasDoAluno(dados.rotinas);
  return (
    <PainelDeslizante aberto={aberta} aoMudar={aoMudar} titulo={TEXTOS.todas} lado="direita">
      <div className="flex flex-col" data-rotinas-tudo>
        <Titulo>{TEXTOS.vivas}</Titulo>
        {vivas.length === 0 ? (
          <p className="text-[12.5px] text-texto-3">{TEXTOS.nenhumaViva}</p>
        ) : (
          <ul className="flex flex-col gap-1" data-rotinas-tudo-vivas={vivas.length}>
            {vivas.map((r) => (
              <LinhaDaRotina key={r.id} rotina={r} sub={linhaDaRotina(r)} aoAbrir={r.pode_editar && aoEditar ? () => aoEditar(r) : undefined} />
            ))}
          </ul>
        )}

        <Titulo>{TEXTOS.apagadas}</Titulo>
        {apagadas.length === 0 ? (
          <p className="text-[12.5px] text-texto-3">{TEXTOS.nenhumaApagada}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-rotinas-apagadas={apagadas.length}>
            {apagadas.map((r) => (
              <li key={r.id} className="flex min-w-0 items-start gap-2.5" data-rotina-apagada={r.id} data-rotina-apagada-pelo-aluno={r.arquivada_pelo_aluno ? "1" : "0"}>
                <Trash2 aria-hidden className="mt-0.5 h-4 w-4 flex-none text-texto-4" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-texto-2 line-through decoration-texto-4">{r.nome}</span>
                  <span className="block text-[11.5px] text-ambar-3" data-rotina-apagada-texto>{textoApagada(r, dados.historico)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <Titulo>{TEXTOS.historico}</Titulo>
        {dados.historico.length === 0 ? (
          <p className="text-[12.5px] text-texto-3">{TEXTOS.nenhumEvento}</p>
        ) : (
          <ul className="flex flex-col gap-2.5" data-rotinas-historico={dados.historico.length}>
            {dados.historico.map((e, i) => {
              const t = eventoNaTela(e);
              return (
                <li key={`${e.rotina_id}-${e.em}-${i}`} className="flex min-w-0 items-start gap-2.5" data-rotina-evento={e.o_que} data-rotina-evento-quem={e.quem}>
                  <History aria-hidden className="mt-0.5 h-4 w-4 flex-none text-texto-4" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-texto-2">
                    <span className="block">
                      <b className="font-semibold text-texto">{t.quem}</b> {t.acao} <span className="text-texto">{nomeDaRotina(dados.rotinas, e.rotina_id)}</span>
                    </span>
                    {t.mudancas.map((m) => (
                      <span key={m} className="block text-[12px] text-texto-2" data-rotina-evento-mudanca>{m}</span>
                    ))}
                    <span className="block text-[11px] text-texto-3">{t.quando}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PainelDeslizante>
  );
}
```

`src/painel/aluno/resumo/CardRotinas.tsx`:
```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, RefreshCw, WifiOff } from "lucide-react";
import { ErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import type { Rotina, RotinaDoProfissional } from "@/aluno-dia/tipos";
import { FolhaRotina } from "@/rotinas/ui/FolhaRotina";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { FolhaTodasAsRotinas } from "../rotinas/FolhaTodasAsRotinas";
import { LinhaDaRotina } from "../rotinas/LinhaDaRotina";
import { TEXTOS, estadoDoCard, proximasNoCard, rotinasDeHoje, vivasDoAluno, type EstadoDoCard } from "../rotinas/regras";
import { atualizarRotinasDoAluno, useRotinasDoAluno } from "../rotinas/useRotinasDoAluno";

/**
 * Card "Rotinas" do Resumo do aluno (W-A P6 — spec §4.5; P7, P8, P8b e o padrão 7/9 do desenho): para TODO aluno (o 7º do Resumo, o 1º de
 * baixo — ORDEM_RESUMO da P4). As de HOJE com o ✓ que o aluno deu no app (só leitura: só o aluno marca), o selo de quem criou, "Nova rotina"
 * (a folha da P3 no modo do profissional: cria na matrícula da rota e o aluno recebe o aviso no sino) e o "Ver tudo" (as vivas, as apagadas
 * — "apagada pelo aluno em 12/10" — e o histórico). Mudar/apagar só as de profissional DESTA matrícula (`pode_editar` do servidor); as do
 * aluno são dele. Sem login: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos." Tudo pela função aluno-dia.
 */
export default function CardRotinas({ alunoId }: { alunoId: string }) {
  const q = useRotinasDoAluno(alunoId);
  const qc = useQueryClient();
  const online = useOnline();
  const [folha, setFolha] = useState<{ aberta: boolean; rotina: Rotina | null }>({ aberta: false, rotina: null });
  const [tudo, setTudo] = useState(false);
  const hoje = hojeSP();
  const estado: EstadoDoCard = estadoDoCard(q, hoje);
  const d = q.data;
  const podeCriar = !!d?.tem_login && !!d.pode_criar;
  const atualizar = () => atualizarRotinasDoAluno(qc, alunoId);
  const abrirFolha = (rotina: Rotina | null) => {
    setTudo(false);
    setFolha({ aberta: true, rotina });
  };

  const verTudo = d?.tem_login ? (
    <button type="button" onClick={() => setTudo(true)} className="text-[12.5px] font-semibold text-violeta-3" data-rotinas-ver-tudo>
      {TEXTOS.verTudo}
    </button>
  ) : undefined;

  const corpo = () => {
    if (estado === "carregando") return <Esqueleto className="h-[160px] w-full" />;
    if (estado === "sem-internet") {
      return (
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-texto-2" data-rotinas-sem-rede>
          <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-ambar-3" /> {TEXTOS.semInternetLer}
        </p>
      );
    }
    if (estado === "erro") {
      const codigo = q.error instanceof ErroAlunoDia ? q.error.codigo : null;
      return (
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-[12.5px] text-texto-2" data-rotinas-erro={codigo ?? ""}>
            {q.error instanceof ErroAlunoDia && codigo !== "erro_interno" ? q.error.message : TEXTOS.erroLer}
          </p>
          {codigo !== "sem_acesso" && codigo !== "aluno_inexistente" && (
            <Botao tamanho="sm" icone={RefreshCw} onClick={() => void q.refetch()} data-rotinas-tentar>Tentar de novo</Botao>
          )}
        </div>
      );
    }
    if (!d) return null;
    if (estado === "sem-login") {
      return (
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-[12.5px] leading-relaxed text-texto-2" data-rotinas-sem-login>{TEXTOS.semLogin}</p>
          <Link to={`/painel/alunos/${encodeURIComponent(alunoId)}/acessos`} className="pq-botao pq-botao-g pq-botao-sm" data-rotinas-acessos>
            <KeyRound aria-hidden /> {TEXTOS.abrirAcessos}
          </Link>
        </div>
      );
    }
    if (estado === "vazio") {
      return (
        <div className="flex flex-col gap-1">
          <b className="text-[13.5px] font-semibold text-texto">{TEXTOS.vazio}</b>
          {podeCriar && <span className="text-[12.5px] leading-relaxed text-texto-2">{TEXTOS.vazioTexto}</span>}
        </div>
      );
    }
    const doDia = rotinasDeHoje(d, hoje);
    if (doDia.length === 0) {
      const n = vivasDoAluno(d.rotinas).length;
      return (
        <p className="text-[12.5px] text-texto-2" data-rotinas-nenhuma-hoje>
          {TEXTOS.nenhumaHoje} {n === 1 ? "1 rotina em outros dias." : `${n} rotinas em outros dias.`}
        </p>
      );
    }
    const { visiveis, resto } = proximasNoCard(doDia);
    return (
      <>
        <p className="mb-1.5 text-[11.5px] text-texto-3">{TEXTOS.hoje}</p>
        <ul className="flex min-w-0 flex-col gap-1" data-rotinas-hoje={doDia.length} data-rotinas-hoje-feitas={doDia.filter((r) => r.feita).length}>
          {visiveis.map((r) => (
            <LinhaDaRotina key={r.id} rotina={r} feita={r.feita} sub={r.detalhe}
              aoAbrir={r.pode_editar && online ? () => abrirFolha(r as RotinaDoProfissional) : undefined} />
          ))}
        </ul>
        {resto > 0 && (
          <button type="button" onClick={() => setTudo(true)} className="mt-1 self-start text-[12px] font-semibold text-violeta-3" data-rotinas-mais={resto}>
            +{resto} {resto === 1 ? "rotina" : "rotinas"}
          </button>
        )}
      </>
    );
  };

  return (
    <Cartao className="flex min-h-[240px] min-w-0 flex-col px-[18px] py-4" data-card-rotinas={estado} data-rotinas-pode-criar={podeCriar ? "1" : "0"}>
      <CabecalhoCartao
        titulo={TEXTOS.titulo}
        extra={d?.tem_login && vivasDoAluno(d.rotinas).length > 0 ? <Chip tom="c">{vivasDoAluno(d.rotinas).length} VIVAS</Chip> : undefined}
        acao={verTudo}
      />
      <div className="flex min-w-0 flex-1 flex-col">{corpo()}</div>
      {(estado === "lista" || estado === "vazio" || estado === "nenhuma-hoje") && (
        <div className="mt-3 flex flex-col items-start gap-2 border-t border-linha pt-3">
          {!online && (
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ambar-3" data-rotinas-sem-internet>
              <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" /> {TEXTOS.semInternet}
            </p>
          )}
          {podeCriar ? (
            <Botao tamanho="sm" variante="w" icone={Plus} onClick={() => abrirFolha(null)} disabled={!online} data-rotinas-nova>{TEXTOS.nova}</Botao>
          ) : null}
        </div>
      )}
      <FolhaRotina
        aberta={folha.aberta}
        aoMudar={(aberta) => setFolha((f) => ({ ...f, aberta }))}
        modo={{ tipo: "profissional", aluno: alunoId }}
        rotina={folha.rotina}
        aoSalvo={atualizar}
        aoApagado={atualizar}
      />
      {d?.tem_login && (
        <FolhaTodasAsRotinas aberta={tudo} aoMudar={setTudo} dados={d} aoEditar={online ? (r) => abrirFolha(r) : undefined} />
      )}
    </Cartao>
  );
}
```

- [ ] **Step 3: O lint** — `cd ~/projetos/physiqcalc-wa-p6 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npx eslint src/painel/aluno/rotinas src/painel/aluno/resumo/CardRotinas.tsx src/painel/aluno/resumo/CardRotinas.test.tsx`
  → nada impresso (0 erro, 0 aviso).
- [ ] **Step 4: Commit** — `feat(w-a): o card Rotinas no Resumo do aluno (as de hoje com o ✓ do aluno, nova rotina e mudar/apagar as de profissional pela folha da P3, ver tudo com as apagadas e o histórico)`
  com os 5 arquivos; `feita.sh 2 "card Rotinas + Ver tudo; eslint 0" "<placar>"`.

---

### Task 3: As regras do Dia a dia — `src/painel/aluno/diaADia/regras.ts` (TDD)

**Files:** Create `src/painel/aluno/diaADia/regras.ts`, `src/painel/aluno/diaADia/regras.test.ts`.
**Estimativa:** 10 min (calibrado 1–2).

- [ ] **Step 1: O teste (vermelho)** — `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/diaADia/regras.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/diaADia/regras.test.ts`
  → `Test Files 1 failed (1)` · FAIL `Failed to resolve import "./regras"`.

`src/painel/aluno/diaADia/regras.test.ts`:
```ts
// Physiq W-A P6 — as regras PURAS do "Dia a dia" (src/painel/aluno/diaADia/regras.ts): os 14 dias (hoje primeiro), o rótulo do botão, o dia
// montado sobre o plano (o diaAplicado da P2: riscados, postos, ✓, extras, comido × plano), o que ficou FORA do plano (a nutri tirou a refeição
// depois — o retrato, agrupado pelo nome), as rotinas do dia, os dias com registro, a quantidade e os macros do retrato e o estado.
import { describe, expect, it } from "vitest";
import type { ExtraDoDia, ItemDoDia, RotinaDoProfissional } from "@/aluno-dia/tipos";
import type { ItemDaRefeicao, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import {
  TEXTOS_DIA, diaNaFicha, diasComRegistro, diasDaJanela, estadoDoDiaADia, macrosDoPosto, macrosDoTotal, quantidadeDoPosto, rotuloCurto,
} from "./regras";

const TER = "2026-10-13"; // terça-feira (ISO 2)
const SEG = "2026-10-12";

const alimento = (id: string, kcal: number) => ({ id, nome: `alimento ${id}`, fonte: "taco", energia_kcal: kcal, proteina_g: 10, carboidrato_g: 20, lipidio_g: 5, fibra_g: 1, sodio_mg: 0 });
const item = (id: string, kcal: number, ordem = 0): ItemDaRefeicao => ({
  id, alimento_id: `al-${id}`, quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, ordem, substitutos: null, observacao: null,
  created_at: "2026-10-01T00:00:00Z", alimento: alimento(`al-${id}`, kcal),
});
const refeicao = (id: string, ordem: number, itens: ItemDaRefeicao[], dias: number[] = []): RefeicaoDoPlano => ({
  id, nome: `Refeição ${id}`, horario: `0${ordem + 7}:00`, ordem, observacao: null, dias_semana: dias, itens,
});
const PLANO = { refeicoes: [refeicao("cafe", 0, [item("pao", 200), item("ovo", 100, 1)]), refeicao("almoco", 1, [item("arroz", 300)]), refeicao("sabado", 2, [item("pizza", 800)], [6])] };
const doDia = (o: Partial<ItemDoDia> & Pick<ItemDoDia, "id" | "tipo">): ItemDoDia => ({
  paciente_id: "p1", dia: TER, refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null, aluno_alimento_id: null, aluno_receita_id: null,
  quantidade_g: 100, porcoes: null, refeicao_nome: null, nome: "x", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0,
  criado_em: "2026-10-13T12:00:00Z", ...o,
});
const extra = (o: Partial<ExtraDoDia> & Pick<ExtraDoDia, "id">): ExtraDoDia => ({ nome: "Lanche", horario: "16:00", concluida_em: null, dia: TER, ...o });
const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "outro", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});

describe("W-A P6: os 14 dias e o rótulo do botão", () => {
  it("de hoje para trás (hoje primeiro, à vista no celular); 'Hoje' · 'Ontem' · 'Sáb 10/10'", () => {
    const dias = diasDaJanela(TER);
    expect(dias).toHaveLength(14);
    expect([dias[0], dias[1], dias[13]]).toEqual([TER, SEG, "2026-09-30"]);
    expect([rotuloCurto(TER, TER), rotuloCurto(SEG, TER), rotuloCurto("2026-10-10", TER)]).toEqual(["Hoje", "Ontem", "Sáb 10/10"]);
  });
});

describe("W-A P6: o dia na ficha", () => {
  const itens = [
    doDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", refeicao_nome: "Refeição cafe", item_refeicao_id: "ovo", nome: "alimento al-ovo", energia_kcal: 100 }),
    doDia({ id: "a1", tipo: "adicionado", refeicao_id: "cafe", refeicao_nome: "Refeição cafe", nome: "Banana", quantidade_g: 120, energia_kcal: 107, proteina_g: 1.4,
      carboidrato_g: 27.4, lipidio_g: 0.1 }),
    doDia({ id: "a2", tipo: "adicionado", extra_id: "e1", nome: "Vitamina", quantidade_g: null, porcoes: 2, energia_kcal: 300 }),
    // a nutri tirou a refeição "Ceia" do plano depois: o item ficou com o retrato (refeicao_id nulo)
    doDia({ id: "a3", tipo: "adicionado", refeicao_nome: "Ceia", nome: "Iogurte", energia_kcal: 90 }),
    // o item que ele tirou saiu do plano depois (item_refeicao_id nulo): fica de fora, com o retrato
    doDia({ id: "t2", tipo: "tirado", refeicao_nome: "Ceia", nome: "Granola", energia_kcal: 50 }),
    doDia({ id: "outro-dia", tipo: "adicionado", refeicao_id: "cafe", dia: SEG, nome: "Bolo", energia_kcal: 400 }),
  ];
  const retratos = { extras: [extra({ id: "e1", concluida_em: "2026-10-13T19:00:00Z" }), extra({ id: "e-seg", dia: SEG })], itens };
  const concluidas = [{ refeicao_id: "cafe", data: TER }, { refeicao_id: "almoco", data: SEG }];
  const rotinas = { rotinas: [rotina({ id: "creatina", horario: "08:00" }), rotina({ id: "agua", horario: "10:00" })], feitas: [{ rotina_id: "creatina", dia: TER, feita_em: "2026-10-13T11:00:00Z" }] };

  it("as refeições do dia da semana com os riscados, os postos e o ✓; as extras do dia; comido = ✓ (sem o tirado, com o posto) + extras com 'Já comi'", () => {
    const d = diaNaFicha(PLANO, TER, retratos, concluidas, rotinas);
    expect(d.refeicoes.map((r) => [r.refeicao.id, r.concluida])).toEqual([["cafe", true], ["almoco", false]]);
    const cafe = d.refeicoes[0];
    expect(cafe.itens.map((x) => [x.item.id, !!x.tirado])).toEqual([["pao", false], ["ovo", true]]);
    expect(cafe.adicionados.map((i) => i.id)).toEqual(["a1"]);
    expect(d.extras.map((e) => [e.extra.id, e.concluida, e.adicionados.map((i) => i.id)])).toEqual([["e1", true, ["a2"]]]);
    expect(d.totais.plano.energia_kcal).toBe(600); // café 300 + almoço 300 (o do sábado não vale na terça)
    expect(d.totais.comido.energia_kcal).toBe(200 + 107 + 300); // o pão (sem o ovo tirado) + a banana + a vitamina da extra
    expect(d.registrou).toBe(true);
  });

  it("fora do plano: o retrato agrupado pelo nome da refeição (o posto e o tirado que perderam o lugar); outro dia não entra", () => {
    const d = diaNaFicha(PLANO, TER, retratos, concluidas, rotinas);
    expect(d.foraDoPlano).toEqual([{ refeicao: "Ceia", itens: [itens[3], itens[4]] }]);
  });

  it("as rotinas que valiam no dia, com o ✓ do aluno; sem plano, as extras e o que ficou fora seguem", () => {
    const d = diaNaFicha(null, TER, retratos, [], rotinas);
    expect(d.rotinas.map((r) => [r.id, r.feita])).toEqual([["creatina", true], ["agua", false]]);
    expect(d.refeicoes).toEqual([]);
    expect(d.extras).toHaveLength(1);
    // sem plano, o que era de refeição fica fora (o retrato), agrupado pelo nome da refeição de quando ele mexeu
    expect(d.foraDoPlano.map((g) => [g.refeicao, g.itens.map((i) => i.id)])).toEqual([["Refeição cafe", ["t1", "a1"]], ["Ceia", ["a3", "t2"]]]);
  });

  it("um dia sem nada registrado: registrou = false", () => {
    const d = diaNaFicha(PLANO, "2026-10-08", retratos, concluidas, rotinas);
    expect(d.registrou).toBe(false);
    expect(d.refeicoes.every((r) => !r.concluida && r.adicionados.length === 0)).toBe(true);
  });

  it("os dias com registro (o ponto no botão): itens, extras, ✓ das refeições e rotinas feitas, só dentro da janela", () => {
    const dias = diasDaJanela(TER);
    const com = diasComRegistro(dias, retratos, [...concluidas, { refeicao_id: "cafe", data: "2026-09-01" }], {
      feitas: [{ rotina_id: "x", dia: "2026-10-05", feita_em: "2026-10-05T10:00:00Z" }],
    });
    expect([...com].sort()).toEqual(["2026-10-05", SEG, TER]);
  });
});

describe("W-A P6: os textos do retrato e o estado", () => {
  it("a quantidade (gramas ou porções) e os macros do retrato; os 3 macros do total", () => {
    expect(quantidadeDoPosto({ quantidade_g: 150, porcoes: null })).toBe("150 g");
    expect(quantidadeDoPosto({ quantidade_g: null, porcoes: 2 })).toBe("2 porções");
    expect(quantidadeDoPosto({ quantidade_g: null, porcoes: 1 })).toBe("1 porção");
    expect(macrosDoPosto({ energia_kcal: 192.4, proteina_g: 3.84, carboidrato_g: 41.2, lipidio_g: 0.36, fibra_g: 1 })).toBe("≈ 192 kcal · P 3,8 g · C 41,2 g · G 0,4 g");
    expect(macrosDoTotal({ proteina_g: 120.4, carboidrato_g: 180.6, lipidio_g: 50 })).toBe("P 120 g · C 181 g · G 50 g");
    expect(TEXTOS_DIA.comido(1480.4, 2353)).toBe("1.480 de 2.353 kcal");
    expect(TEXTOS_DIA.travada).toBe("A dieta está em “Só ver” (Acessos).");
    expect(TEXTOS_DIA.vazio).toBe("Nada registrado pelo aluno nestes dias.");
  });

  it("carregando enquanto o dia ou qualquer outra consulta chega · erro sem o dia · vazio sem registro na janela · pronto", () => {
    const ok = { isLoading: false, isError: false, data: {} };
    expect(estadoDoDiaADia({ isLoading: true, isError: false }, [], new Set())).toBe("carregando");
    expect(estadoDoDiaADia(ok, [{ isLoading: true }], new Set([TER]))).toBe("carregando");
    expect(estadoDoDiaADia({ isLoading: false, isError: false, fetchStatus: "paused" }, [{ isLoading: false }], new Set())).toBe("sem-internet");
    expect(estadoDoDiaADia({ isLoading: false, isError: true }, [{ isLoading: false }], new Set())).toBe("erro");
    expect(estadoDoDiaADia({ isLoading: false, isError: true, data: {} }, [{ isLoading: false }], new Set([TER]))).toBe("pronto"); // releitura que falhou
    expect(estadoDoDiaADia(ok, [{ isLoading: false }], new Set())).toBe("vazio");
    expect(estadoDoDiaADia(ok, [{ isLoading: false }], new Set([TER]))).toBe("pronto");
  });
});
```

- [ ] **Step 2: As regras (verde)** — `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/diaADia/regras.ts && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/diaADia/regras.test.ts`
  → `Test Files 1 passed (1)` · `Tests 8 passed (8)`.

`src/painel/aluno/diaADia/regras.ts`:
```ts
// Physiq W-A P6 — regras PURAS do "Dia a dia" da aba Dieta da ficha (spec §4.5; P7 e Q1 do Weslley: a nutri vê, e o personal também, só para
// ler, embaixo da adesão): os 14 dias, o dia escolhido montado sobre o plano (o diaAplicado da P2 — riscados os itens que ele tirou, os que ele
// pôs, o ✓, as refeições extras e o total comido × plano), o que ficou FORA do plano (a nutri tirou a refeição ou o item depois: o retrato,
// com "refeição tirada do plano"), as rotinas do dia (feitas/não) e se o aluno registrou algo. O plano é o atual (planoAtivo: o mesmo da
// adesão de 7 dias e do app). Sem rede; testado em regras.test.ts.
import { diaAplicado, macrosDoRetrato, type DiaAplicado } from "@/aluno-dia/regras";
import type { DiaDoAluno, ExtraDoDia, ItemDoDia, RotinasDoAluno } from "@/aluno-dia/tipos";
import { somarDias } from "@/nutricao/app/dia";
import { fmtKcal, fmtQtd, type Totais } from "@/nutricao/app/dietaUtil";
import { DIAS_SEMANA, diaDaSemana } from "@/nutricao/app/metasUtil";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import type { Concluida } from "@/nutricao/editor/lib/adesao";
import { JANELA_DIAS, rotinasNoDia, type RotinaNoDia } from "../rotinas/regras";

export const TEXTOS_DIA = {
  titulo: "Dia a dia",
  subtitulo: (nome: string): string =>
    `O que ${nome || "o aluno"} registrou no app nos últimos ${JANELA_DIAS} dias: o que tirou e pôs, as refeições extras, o ✓ e as rotinas.`,
  travada: "A dieta está em “Só ver” (Acessos).",
  liberada: "PODE MEXER",
  soVer: "SÓ VER",
  vazio: "Nada registrado pelo aluno nestes dias.",
  erro: "Não deu para carregar o dia a dia.",
  semInternet: "Sem conexão: o dia a dia aparece quando a internet voltar.",
  tirou: "tirou",
  pelo: "pelo aluno",
  extra: "refeição extra",
  refeicaoTirada: "refeição tirada do plano",
  marcou: "marcou ✓",
  naoMarcou: "não marcou",
  comeu: "já comeu",
  naoComeu: "não marcou “Já comi”",
  semPlano: "Sem plano alimentar: aparecem só as refeições extras, o que ficou fora do plano e as rotinas.",
  semRefeicao: "Nenhuma refeição do plano neste dia.",
  rotinas: "Rotinas do dia",
  semRotinas: "Nenhuma rotina neste dia.",
  apagada: "apagada depois",
  comido: (comido: number, plano: number): string => `${fmtKcal(comido)} de ${fmtKcal(plano)} kcal`,
  totalTitulo: "Comido × plano do dia",
} as const;

/** Os 14 dias da janela, do mais novo (hoje) para o mais antigo — a ordem dos botões (hoje à vista no celular). */
export function diasDaJanela(hoje: string): string[] {
  return Array.from({ length: JANELA_DIAS }, (_, i) => somarDias(hoje, -i));
}

/** "Hoje" · "Ontem" · "Qua 01/10" (o botão do dia). */
export function rotuloCurto(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, -1)) return "Ontem";
  return `${DIAS_SEMANA.find((d) => d.n === diaDaSemana(dia))?.curto ?? ""} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export interface GrupoForaDoPlano {
  /** o nome da refeição no retrato (o item guarda o nome da refeição de quando ele pôs/tirou) */
  refeicao: string;
  itens: ItemDoDia[];
}

export interface DiaNaFicha extends DiaAplicado {
  dia: string;
  /** os itens do dia que não acham mais a refeição/o item no plano atual (a nutri tirou depois), agrupados pelo nome do retrato */
  foraDoPlano: GrupoForaDoPlano[];
  rotinas: RotinaNoDia[];
  /** o aluno registrou algo no dia: ✓ de refeição, item posto/tirado, refeição extra ou rotina feita */
  registrou: boolean;
}

type Retratos = Pick<DiaDoAluno, "extras" | "itens">;

/**
 * O dia escolhido na ficha: o diaAplicado da P2 sobre o plano atual (as refeições do dia da semana, os riscados, os postos, as extras daquele
 * dia e os totais comido × plano), o que ficou fora do plano e as rotinas que valiam no dia, com o ✓ do aluno.
 */
export function diaNaFicha(
  plano: Pick<PlanoAlimentar, "refeicoes"> | null,
  dia: string,
  retratos: Retratos | null,
  concluidas: readonly Concluida[],
  rotinas: Pick<RotinasDoAluno, "rotinas" | "feitas"> | null,
): DiaNaFicha {
  const extras: ExtraDoDia[] = (retratos?.extras ?? []).filter((e) => (e.dia ?? dia) === dia);
  const itens = (retratos?.itens ?? []).filter((i) => i.dia === dia);
  const feitas = new Set(concluidas.filter((c) => c.data === dia).map((c) => c.refeicao_id));
  const ap = diaAplicado(plano, { dia, extras, itens }, feitas);
  const refeicoesDoDia = new Set(ap.refeicoes.map((r) => r.refeicao.id));
  const extrasDoDia = new Set(extras.map((e) => e.id));
  const itensDoPlano = new Set(ap.refeicoes.flatMap((r) => r.itens.map((x) => x.item.id)));
  const fora = itens.filter((i) =>
    i.tipo === "adicionado"
      ? !(i.refeicao_id && refeicoesDoDia.has(i.refeicao_id)) && !(i.extra_id && extrasDoDia.has(i.extra_id))
      : !(i.item_refeicao_id && itensDoPlano.has(i.item_refeicao_id)),
  );
  const grupos = new Map<string, ItemDoDia[]>();
  for (const i of fora) {
    const nome = i.refeicao_nome?.trim() || "Refeição";
    grupos.set(nome, [...(grupos.get(nome) ?? []), i]);
  }
  const rotinasDoDia = rotinas ? rotinasNoDia(rotinas.rotinas, rotinas.feitas, dia) : [];
  const registrou = feitas.size > 0 || itens.length > 0 || extras.length > 0 || rotinasDoDia.some((r) => r.feita);
  return {
    ...ap,
    dia,
    foraDoPlano: [...grupos.entries()].map(([refeicao, lista]) => ({ refeicao, itens: lista })),
    rotinas: rotinasDoDia,
    registrou,
  };
}

/** Os dias da janela em que o aluno registrou algo (o ponto no botão do dia) — sem o plano: ✓, item, extra ou rotina feita. */
export function diasComRegistro(
  dias: readonly string[],
  retratos: Retratos | null,
  concluidas: readonly Concluida[],
  rotinas: Pick<RotinasDoAluno, "feitas"> | null,
): Set<string> {
  const janela = new Set(dias);
  const com = new Set<string>();
  for (const i of retratos?.itens ?? []) if (janela.has(i.dia)) com.add(i.dia);
  for (const e of retratos?.extras ?? []) if (e.dia && janela.has(e.dia)) com.add(e.dia);
  for (const c of concluidas) if (janela.has(c.data)) com.add(c.data);
  for (const f of rotinas?.feitas ?? []) if (janela.has(f.dia)) com.add(f.dia);
  return com;
}

/** A quantidade do que ele pôs: "150 g" · "2 porções" · "1 porção". */
export function quantidadeDoPosto(i: Pick<ItemDoDia, "quantidade_g" | "porcoes">): string {
  if (i.porcoes !== null && i.porcoes !== undefined) return `${fmtQtd(Number(i.porcoes))} ${Number(i.porcoes) === 1 ? "porção" : "porções"}`;
  return `${fmtQtd(Number(i.quantidade_g ?? 0))} g`;
}

/** "≈ 192 kcal · P 3,8 g · C 41,2 g · G 0,4 g" (o retrato da quantidade — o banco já calculou). */
export function macrosDoPosto(i: Pick<ItemDoDia, "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g">): string {
  const m = macrosDoRetrato(i);
  const g = (n: number | null) => `${fmtQtd(Math.round((n ?? 0) * 10) / 10)} g`;
  return `≈ ${fmtKcal(m.energia_kcal)} kcal · P ${g(m.proteina_g)} · C ${g(m.carboidrato_g)} · G ${g(m.lipidio_g)}`;
}

/** Os 3 macros do total ("P 120 g · C 180 g · G 50 g"). */
export const macrosDoTotal = (t: Pick<Totais, "proteina_g" | "carboidrato_g" | "lipidio_g">): string =>
  `P ${fmtQtd(Math.round(t.proteina_g))} g · C ${fmtQtd(Math.round(t.carboidrato_g))} g · G ${fmtQtd(Math.round(t.lipidio_g))} g`;

export type EstadoDoDiaADia = "carregando" | "sem-internet" | "erro" | "vazio" | "pronto";

/**
 * O estado da seção (o data-dia-a-dia dos E2E): o dia do aluno é a base (sem ele, o erro; sem internet, a consulta espera a rede); as rotinas,
 * o plano e os ✓ completam (enquanto chegam, "carregando" — nada pisca de "vazio" para "pronto"; se falharem, o dia sai sem eles).
 */
export function estadoDoDiaADia(
  dia: { isLoading: boolean; isError: boolean; fetchStatus?: string; data?: unknown },
  outras: readonly { isLoading: boolean }[],
  comRegistro: ReadonlySet<string>,
): EstadoDoDiaADia {
  if (dia.isLoading || outras.some((o) => o.isLoading)) return "carregando";
  if (!dia.data) return !dia.isError && dia.fetchStatus === "paused" ? "sem-internet" : "erro";
  return comRegistro.size === 0 ? "vazio" : "pronto";
}
```

- [ ] **Step 3: Commit** — `feat(w-a): as regras do dia a dia na ficha (os 14 dias, o dia aplicado sobre o plano atual, o que ficou fora do plano, as rotinas do dia)`
  com os 2 arquivos; `feita.sh 3 "regras do dia a dia" "<placar>"`.

---

### Task 4: O Dia a dia e a aba Dieta da ficha (TDD)

**Files:** Create `src/painel/aluno/diaADia/DiaADia.test.tsx`, `src/painel/aluno/abas/Dieta.test.tsx`, `src/painel/aluno/diaADia/useDiaADia.ts`,
`src/painel/aluno/diaADia/DiaADia.tsx`; Modify `src/nutricao/editor/lib/acesso.test.ts`, `src/nutricao/editor/lib/acesso.ts`, `src/painel/aluno/abas/Dieta.tsx`.
**Estimativa:** 20 min (calibrado 2–4).

- [ ] **Step 1: Os testes (vermelho)**

Run: `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/diaADia/DiaADia.test.tsx src/painel/aluno/abas/Dieta.test.tsx && git apply ~/projetos/physiqcalc-scratch/w-a/p6/patches/T4-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/diaADia/DiaADia.test.tsx src/painel/aluno/abas/Dieta.test.tsx src/nutricao/editor/lib/acesso.test.ts`
Expected: `Test Files 3 failed (3)` · `Tests 4 failed | 6 passed (10)` · FAIL `Failed to resolve import "./DiaADia"`.

`src/painel/aluno/diaADia/DiaADia.test.tsx`:
```tsx
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiaDoAluno, ItemDoDia, RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";

// W-A P6 — o "Dia a dia" da aba Dieta da ficha (spec §4.5; P7 e Q1): os 14 dias (hoje escolhido), por refeição os itens do plano (riscado o que
// ele tirou), o que ele pôs ("pelo aluno", com os macros) e o ✓; a refeição extra; o que ficou fora do plano ("refeição tirada do plano"); o
// total comido × plano; as rotinas do dia; a faixa "Só ver" quando travada; o vazio; o erro; e no modo só leitura os dias continuam trocando.
// A aluno-dia é fingida (a porta da P2) e o plano e os ✓ vêm das consultas da ficha (fingidas aqui — a nutricao é da ficha).
const h = vi.hoisted(() => ({
  lerDia: vi.fn(),
  lerRotinas: vi.fn(),
  planos: { data: [] as unknown[], isLoading: false, isError: false },
  concluidas: { data: [] as { refeicao_id: string; data: string }[], isLoading: false, isError: false },
}));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerDiaDoAluno: (...a: unknown[]) => h.lerDia(...a),
  lerRotinasDoAluno: (...a: unknown[]) => h.lerRotinas(...a),
}));
vi.mock("@/nutricao/editor/lib/consultas", () => ({
  usePlanosDoAluno: () => h.planos,
  useConcluidas: () => h.concluidas,
}));

import { ErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import { somarDias } from "@/nutricao/app/dia";
import { SomenteLeitura } from "@/nutricao/editor/ui/SomenteLeitura";
import DiaADia from "./DiaADia";
import { TEXTOS_DIA } from "./regras";

const HOJE = hojeSP();
const ONTEM = somarDias(HOJE, -1);
const al = (id: string, kcal: number) => ({ id, nome: id === "pao" ? "Pão francês" : id === "ovo" ? "Ovo cozido" : "Arroz", fonte: "taco", grupo: null,
  energia_kcal: kcal, proteina_g: 5, carboidrato_g: 20, lipidio_g: 2, fibra_g: 1, sodio_mg: 0 });
const it_ = (id: string, kcal: number, ordem = 0) => ({ id, alimento_id: id, quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, ordem,
  substitutos: null, observacao: null, created_at: "2026-10-01T00:00:00Z", alimento: al(id, kcal) });
const PLANO = {
  id: "plano", paciente_id: "pac", favorito: true, created_at: "2026-10-01T00:00:00Z", titulo: "Plano", metodo: "alimentos", kcal_alvo: null, observacao: null,
  refeicoes: [
    { id: "cafe", nome: "Café da manhã", horario: "07:00:00", ordem: 0, observacao: null, dias_semana: [], itens: [it_("pao", 300), it_("ovo", 150, 1)] },
    { id: "almoco", nome: "Almoço", horario: "12:00:00", ordem: 1, observacao: null, dias_semana: [], itens: [it_("arroz", 400)] },
  ],
};
const posto = (o: Partial<ItemDoDia> & Pick<ItemDoDia, "id" | "tipo">): ItemDoDia => ({
  paciente_id: "pac", dia: HOJE, refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null, aluno_alimento_id: null, aluno_receita_id: null,
  quantidade_g: 100, porcoes: null, refeicao_nome: null, nome: "x", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0,
  criado_em: new Date().toISOString(), ...o,
});
const DIA: DiaDoAluno = {
  paciente_id: "pac", nivel: "mexer", liberada: true,
  extras: [{ id: "e1", dia: HOJE, nome: "Lanche da tarde", horario: "16:00", concluida_em: new Date().toISOString() }],
  itens: [
    posto({ id: "t1", tipo: "tirado", refeicao_id: "cafe", refeicao_nome: "Café da manhã", item_refeicao_id: "ovo", nome: "Ovo cozido", energia_kcal: 150 }),
    posto({ id: "a1", tipo: "adicionado", refeicao_id: "cafe", refeicao_nome: "Café da manhã", nome: "Banana prata", quantidade_g: 120, energia_kcal: 118.8,
      proteina_g: 1.56, carboidrato_g: 31.2, lipidio_g: 0.12 }),
    posto({ id: "a2", tipo: "adicionado", extra_id: "e1", nome: "Vitamina", quantidade_g: null, porcoes: 2, energia_kcal: 260 }),
    posto({ id: "a3", tipo: "adicionado", refeicao_nome: "Ceia", nome: "Iogurte natural", energia_kcal: 90 }),
    posto({ id: "a4", tipo: "adicionado", refeicao_id: "almoco", refeicao_nome: "Almoço", nome: "Feijão", dia: ONTEM, energia_kcal: 140 }),
  ],
};
const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "suplemento", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});
const ROTINAS: RotinasDoAluno = {
  paciente_id: "pac", tem_login: true, pode_criar: true, historico: [],
  rotinas: [rotina({ id: "creatina", nome: "Creatina", detalhe: "5 g", horario: "08:00" }),
    rotina({ id: "agua", nome: "Água 2 L", origem: "profissional", horario: "10:00", criada_por_nome: "Ana" })],
  feitas: [{ rotina_id: "creatina", dia: HOJE, feita_em: new Date().toISOString() }],
};

function montar(leitura = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const el = <DiaADia alunoId="rota-1" pacienteId="pac" nome="Bianca Souza" />;
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{leitura ? <SomenteLeitura>{el}</SomenteLeitura> : el}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`sem ${sel}`);
  return el as HTMLElement;
});
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

beforeEach(() => {
  h.lerDia.mockReset().mockResolvedValue(DIA);
  h.lerRotinas.mockReset().mockResolvedValue(ROTINAS);
  h.planos = { data: [PLANO], isLoading: false, isError: false };
  h.concluidas = { data: [{ refeicao_id: "cafe", data: HOJE }], isLoading: false, isError: false };
});

describe("W-A P6 — o Dia a dia da ficha", () => {
  it("hoje: o ✓ da refeição, o item que ele tirou riscado, o que ele pôs com os macros, a extra, o que ficou fora do plano, o total e as rotinas", async () => {
    montar();
    await achar('[data-dia-a-dia="pronto"]');
    expect(h.lerDia).toHaveBeenCalledWith("rota-1", somarDias(HOJE, -13), HOJE);
    expect(h.lerRotinas).toHaveBeenCalledWith("rota-1", somarDias(HOJE, -13), HOJE);
    expect(document.querySelectorAll("[data-dia-a-dia-botao]")).toHaveLength(14);
    expect(q("[data-dia-a-dia-botao][aria-pressed=true]")!.textContent).toBe("Hoje");
    expect(q(`[data-dia-a-dia-botao="${HOJE}"]`)!.getAttribute("data-dia-a-dia-com")).toBe("1");
    expect(q("[data-dia-a-dia-conteudo]")!.getAttribute("data-dia-a-dia-conteudo")).toBe(HOJE);
    // o café com ✓, o ovo riscado ("tirou"), a banana "pelo aluno" com os macros; o almoço sem ✓
    expect(q('[data-dia-refeicao="cafe"]')!.getAttribute("data-dia-refeicao-feita")).toBe("1");
    expect(q('[data-dia-refeicao="almoco"]')!.getAttribute("data-dia-refeicao-feita")).toBe("0");
    expect(q('[data-dia-item="ovo"]')!.getAttribute("data-dia-item-tirado")).toBe("1");
    expect(q('[data-dia-item="ovo"] [data-dia-item-tirou]')!.textContent).toBe("tirou");
    expect(q('[data-dia-item="pao"]')!.getAttribute("data-dia-item-tirado")).toBe("0");
    expect(q('[data-dia-refeicao="cafe"] [data-dia-posto="a1"]')!.textContent).toContain("Banana prata");
    expect(q('[data-dia-posto="a1"] [data-dia-posto-macros]')!.textContent).toBe("≈ 119 kcal · P 1,6 g · C 31,2 g · G 0,1 g");
    // a extra com "Já comi" e o que ele pôs nela (em porções)
    expect(q('[data-dia-extra="e1"]')!.getAttribute("data-dia-extra-feita")).toBe("1");
    expect(q('[data-dia-extra="e1"] [data-dia-posto="a2"]')!.textContent).toContain("2 porções");
    // a nutri tirou a "Ceia" do plano depois: o retrato com o selo
    expect(q('[data-dia-fora="Ceia"] [data-dia-fora-selo]')!.textContent).toBe("refeição tirada do plano");
    expect(q('[data-dia-fora="Ceia"] [data-dia-posto="a3"]')).not.toBeNull();
    // ontem não entra no dia de hoje
    expect(q('[data-dia-posto="a4"]')).toBeNull();
    // o total: o café (o pão; o ovo tirado não) + a banana + a vitamina da extra × o plano (café + almoço)
    const total = q("[data-dia-a-dia-total]")!;
    expect([total.getAttribute("data-kcal-comido"), total.getAttribute("data-kcal-plano")]).toEqual(["679", "850"]);
    expect(total.textContent).toContain("679 de 850 kcal");
    // as rotinas do dia: a creatina feita, a água não
    expect(q("[data-dia-rotinas]")!.getAttribute("data-dia-rotinas")).toBe("2");
    expect(q('[data-dia-rotinas] [data-rotina-painel="creatina"]')!.getAttribute("data-rotina-feita")).toBe("1");
    expect(q('[data-dia-rotinas] [data-rotina-painel="agua"]')!.getAttribute("data-rotina-feita")).toBe("0");
    // liberada: sem a faixa, o selo "PODE MEXER"
    expect(q("[data-dia-a-dia-travada]")).toBeNull();
    expect(q("[data-dia-a-dia-nivel]")!.textContent).toBe("PODE MEXER");
  });

  it("trocar de dia: 'Ontem' mostra o que ele pôs ontem (e não o de hoje)", async () => {
    montar();
    fireEvent.click(await achar(`[data-dia-a-dia-botao="${ONTEM}"]`));
    await waitFor(() => expect(q("[data-dia-a-dia-conteudo]")!.getAttribute("data-dia-a-dia-conteudo")).toBe(ONTEM));
    expect(q('[data-dia-refeicao="almoco"] [data-dia-posto="a4"]')).not.toBeNull();
    expect(q('[data-dia-posto="a1"]')).toBeNull();
    expect(q('[data-dia-item="ovo"]')!.getAttribute("data-dia-item-tirado")).toBe("0");
  });

  it("travada ('Só ver'): a faixa com o atalho para a aba Acessos; o que ele registrou antes continua aparecendo (spec §2.2-12)", async () => {
    h.lerDia.mockResolvedValue({ ...DIA, nivel: "ver", liberada: false });
    montar();
    await achar('[data-dia-a-dia="pronto"]');
    expect(q("[data-dia-a-dia-travada]")!.textContent).toBe(TEXTOS_DIA.travada);
    expect(q("[data-dia-a-dia-acessos]")!.getAttribute("href")).toBe("/painel/alunos/rota-1/acessos");
    expect(q("[data-dia-a-dia-nivel]")!.textContent).toBe("SÓ VER");
    expect(q('[data-dia-posto="a1"]')).not.toBeNull();
  });

  it("nada registrado nos 14 dias: 'Nada registrado pelo aluno nestes dias.'", async () => {
    h.lerDia.mockResolvedValue({ ...DIA, extras: [], itens: [] });
    h.lerRotinas.mockResolvedValue({ ...ROTINAS, feitas: [] });
    h.concluidas = { data: [], isLoading: false, isError: false };
    montar();
    await achar('[data-dia-a-dia="vazio"]');
    expect(q("[data-dia-a-dia-vazio]")!.textContent).toBe("Nada registrado pelo aluno nestes dias.");
  });

  it("o erro do dia: o texto e 'Tentar de novo' (relê)", async () => {
    h.lerDia.mockRejectedValueOnce(new ErroAlunoDia("sem_internet")).mockResolvedValueOnce(DIA);
    montar();
    await achar('[data-dia-a-dia="erro"]');
    expect(q('[data-dia-a-dia="erro"]')!.textContent).toContain(TEXTOS_DIA.erro);
    fireEvent.click(q("[data-dia-a-dia-tentar]")!);
    await achar('[data-dia-a-dia="pronto"]');
  });

  it("sem plano: as extras, o que ficou fora e as rotinas seguem, com o aviso", async () => {
    h.planos = { data: [], isLoading: false, isError: false };
    montar();
    await achar('[data-dia-a-dia="pronto"]');
    expect(q("[data-dia-a-dia-sem-plano]")).not.toBeNull();
    expect(q('[data-dia-extra="e1"]')).not.toBeNull();
    expect(q('[data-dia-fora="Café da manhã"]')).not.toBeNull();
  });

  it("dentro do modo só leitura (o dono sem papel de nutri): os botões dos dias continuam trocando o dia (data-leitura)", async () => {
    montar(true);
    const ontem = await achar(`[data-dia-a-dia-botao="${ONTEM}"]`);
    expect((ontem as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(ontem);
    await waitFor(() => expect(q("[data-dia-a-dia-conteudo]")!.getAttribute("data-dia-a-dia-conteudo")).toBe(ONTEM));
  });
});
```

`src/painel/aluno/abas/Dieta.test.tsx`:
```tsx
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PerfilAluno } from "@/painel/aluno/dados/tipos";
import { perfil } from "@/test/fixturesPerfilAluno";

// W-A P6 — a aba Dieta da ficha com o "Dia a dia" (spec §4.5; P7 e Q1 do Weslley): a nutri (e o dono e o master) ganham a seção "Dia a dia" (a
// 2ª, depois do Plano; ?secao=dia-a-dia); o personal (só o plano) vê o dia a dia embaixo da adesão, só para ler; o dono sem papel de nutri, a
// seção dentro do modo só leitura. As seções de verdade e o dia a dia são fingidos (cada um tem o teste dele).
const h = vi.hoisted(() => ({ perfil: null as unknown }));
vi.mock("@/painel/aluno/dados/usePerfilAluno", () => ({
  usePerfilAluno: () => ({ data: h.perfil, isLoading: false, error: null, refetch: vi.fn() }),
  chavePerfilAluno: (id: string) => ["aluno-perfil", id],
}));
vi.mock("@/nutricao/editor/secoes/Planejamento", () => ({ default: () => <div data-plano-falso /> }));
vi.mock("@/nutricao/editor/ui/ConcluidasDoPeriodo", () => ({ ConcluidasDoPeriodo: () => <div data-adesao-falsa /> }));
vi.mock("@/nutricao/editor/lib/consultas", () => ({ usePlanosDoAluno: () => ({ data: [], isLoading: false }) }));
vi.mock("@/painel/aluno/diaADia/DiaADia", () => ({
  default: (p: { alunoId: string; pacienteId: string; nome: string | null }) => <div data-dia-a-dia-falso={`${p.alunoId}|${p.pacienteId}|${p.nome}`} />,
}));

import Dieta from "./Dieta";

const NUTRI = { id: "u2", dono: false, personal: false, nutricionista: true, master: false };
const PERSONAL = { id: "u1", dono: false, personal: true, nutricionista: false, master: false };
const DONO = { id: "u9", dono: true, personal: true, nutricionista: false, master: false };

let local = "";
function Onde() {
  const l = useLocation();
  local = `${l.pathname}${l.search}`;
  return null;
}
function montar(p: PerfilAluno, rota = "/painel/alunos/rota-1/dieta") {
  h.perfil = p;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Dieta alunoId="rota-1" />
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`sem ${sel}`);
  return el as HTMLElement;
});

beforeEach(() => {
  local = "";
});

describe("W-A P6 — a aba Dieta da ficha com o Dia a dia", () => {
  it("a nutri: 8 seções (o 'Dia a dia' é a 2ª); tocar abre a seção pelo ?secao= com a rota, a matrícula e o nome", async () => {
    montar(perfil({ eu: NUTRI, nutricionista: { id: "u2", nome: "Camila Rocha" } }));
    await achar('[data-acesso-dieta="editar"]');
    const botoes = [...document.querySelectorAll("[data-secao-dieta-botao]")];
    expect(botoes.map((b) => b.getAttribute("data-secao-dieta-botao"))).toEqual([
      "planejamento", "dia-a-dia", "acompanhamento", "calculo-energetico", "suplementos", "manipulados", "orientacoes", "metas",
    ]);
    expect(botoes[1].textContent).toBe("Dia a dia");
    expect(document.querySelector("[data-dia-a-dia-falso]")).toBeNull();
    fireEvent.click(botoes[1]);
    const dia = await achar("[data-dia-a-dia-falso]");
    expect(dia.getAttribute("data-dia-a-dia-falso")).toBe("rota-1|p1|Rafael Moura");
    expect(local).toBe("/painel/alunos/rota-1/dieta?secao=dia-a-dia");
    expect(document.querySelector('[data-aba-dieta-aluno]')!.getAttribute("data-secao-dieta")).toBe("dia-a-dia");
  });

  it("o personal (só o plano, Q1): sem as seções; o plano, a adesão e, embaixo dela, o dia a dia (só para ler)", async () => {
    montar(perfil({ eu: PERSONAL }));
    await achar('[data-acesso-dieta="so-plano"]');
    expect(document.querySelectorAll("[data-secao-dieta-botao]")).toHaveLength(0);
    const dia = await achar("[data-dia-a-dia-falso]");
    const ordem = [...document.querySelectorAll("[data-plano-falso], [data-adesao-falsa], [data-dia-a-dia-falso]")].map((e) =>
      e.hasAttribute("data-plano-falso") ? "plano" : e.hasAttribute("data-adesao-falsa") ? "adesao" : "dia");
    expect(ordem).toEqual(["plano", "adesao", "dia"]);
    expect(dia.getAttribute("data-dia-a-dia-falso")).toBe("rota-1|p1|Rafael Moura");
  });

  it("o dono sem papel de nutri ('ver'): o Dia a dia pelo ?secao= dentro do modo só leitura", async () => {
    montar(perfil({ eu: DONO }), "/painel/alunos/rota-1/dieta?secao=dia-a-dia");
    await achar('[data-acesso-dieta="ver"]');
    await achar("[data-dieta-leitura] [data-dia-a-dia-falso]");
  });

  it("aluno sem a Nutrição: 'Este aluno não tem dieta' (nada do dia a dia)", async () => {
    montar(perfil({ eu: NUTRI, modulos: ["treino"] }));
    await waitFor(() => expect(document.body.textContent).toContain("Este aluno não tem dieta"));
    expect(document.querySelector("[data-dia-a-dia-falso]")).toBeNull();
  });
});
```

`~/projetos/physiqcalc-scratch/w-a/p6/patches/T4-teste.patch`:
```diff
diff --git a/src/nutricao/editor/lib/acesso.test.ts b/src/nutricao/editor/lib/acesso.test.ts
index 5b9a480..b16bb55 100644
--- a/src/nutricao/editor/lib/acesso.test.ts
+++ b/src/nutricao/editor/lib/acesso.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest";
-import { acessoDaDieta, secaoDaUrl } from "./acesso";
+import { SECOES_DIETA, acessoDaDieta, secaoDaUrl } from "./acesso";
 
 const eu = (x: Partial<{ id: string; dono: boolean; personal: boolean; nutricionista: boolean; master: boolean }>) => ({
   id: "eu", dono: false, personal: false, nutricionista: false, master: false, ...x,
@@ -33,4 +33,10 @@ describe("seção da aba Dieta pela URL (atalhos do Fluxo de consulta — W14)",
     expect(s("secao=qualquer")).toBe("planejamento");
     expect(s("")).toBe("planejamento");
   });
+
+  it("W-A P6: o 'Dia a dia' é a 2ª seção (depois do Plano) e o ?secao=dia-a-dia o abre", () => {
+    expect(SECOES_DIETA.map((x) => x.id)).toEqual(["planejamento", "dia-a-dia", "acompanhamento", "calculo-energetico", "suplementos", "manipulados", "orientacoes", "metas"]);
+    expect(SECOES_DIETA[1].rotulo).toBe("Dia a dia");
+    expect(s("secao=dia-a-dia")).toBe("dia-a-dia");
+  });
 });
```

- [ ] **Step 2: A consulta, a seção, a aba e as seções (verde)**

Run: `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh src/painel/aluno/diaADia/useDiaADia.ts src/painel/aluno/diaADia/DiaADia.tsx && git apply ~/projetos/physiqcalc-scratch/w-a/p6/patches/T4-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/painel/aluno/diaADia/DiaADia.test.tsx src/painel/aluno/abas/Dieta.test.tsx src/nutricao/editor/lib/acesso.test.ts src/painel/aluno/diaADia/regras.test.ts`
Expected: `Test Files 4 passed (4)` · `Tests 25 passed (25)`.

`src/painel/aluno/diaADia/useDiaADia.ts`:
```ts
// Physiq W-A P6 — as consultas do "Dia a dia" (React Query): o dia do aluno da rota pela aluno-dia { acao: "ler", q: "aluno_dia", aluno, de,
// ate } (dia_do_aluno, wa3: o nível da Dieta, se está liberada, as refeições extras e os itens postos/tirados dos 14 dias, com os retratos —
// só leitura, a nutri e o personal; Q1) — pela porta da P2 (src/aluno-dia/api.ts, nunca o banco direto). As rotinas vêm da MESMA consulta do
// card do Resumo (useRotinasDoAluno); o plano e os ✓ das refeições, das consultas da Dieta que a ficha já usa (src/nutricao/editor/lib/
// consultas.ts — a nutricao; nada de leitura direta).
import { useQuery } from "@tanstack/react-query";
import { lerDiaDoAluno } from "@/aluno-dia/api";
import type { DiaDoAluno } from "@/aluno-dia/tipos";
import { janelaDoPainel } from "../rotinas/regras";
import { repetirLeitura } from "../rotinas/useRotinasDoAluno";

export const chaveDiaDoAluno = (alunoId: string) => ["painel-dia-a-dia", alunoId] as const;

export function useDiaDoAluno(alunoId: string) {
  const { de, ate } = janelaDoPainel();
  return useQuery<DiaDoAluno>({
    queryKey: [...chaveDiaDoAluno(alunoId), de, ate],
    queryFn: () => lerDiaDoAluno(alunoId, de, ate),
    enabled: !!alunoId,
    staleTime: 30_000,
    retry: repetirLeitura,
    networkMode: "online",
  });
}
```

`src/painel/aluno/diaADia/DiaADia.tsx`:
```tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, RefreshCw, WifiOff } from "lucide-react";
import { hojeSP } from "@/aluno-dia/regras";
import type { ItemDoDia } from "@/aluno-dia/tipos";
import { cn } from "@/lib/utils";
import { planoAtivo } from "@/nutricao/app/dia";
import { fmtHorario, quantidadeCurta } from "@/nutricao/app/dietaUtil";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { useConcluidas, usePlanosDoAluno } from "@/nutricao/editor/lib/consultas";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { LinhaDaRotina } from "../rotinas/LinhaDaRotina";
import { janelaDoPainel } from "../rotinas/regras";
import { useRotinasDoAluno } from "../rotinas/useRotinasDoAluno";
import {
  TEXTOS_DIA, diaNaFicha, diasComRegistro, diasDaJanela, estadoDoDiaADia, macrosDoPosto, macrosDoTotal, quantidadeDoPosto, rotuloCurto,
} from "./regras";
import { useDiaDoAluno } from "./useDiaADia";

const primeiroNome = (nome: string | null | undefined): string => (nome ?? "").trim().split(/\s+/)[0] ?? "";

function ItemPosto({ item: i }: { item: ItemDoDia }) {
  return (
    <li className="flex min-w-0 flex-col text-[12.5px]" data-dia-posto={i.id}>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-texto">{i.nome}</span>
        <span className="flex-none text-[11.5px] tabular-nums text-texto-3">{quantidadeDoPosto(i)}</span>
        <Chip tom="c" className="flex-none">{TEXTOS_DIA.pelo}</Chip>
      </span>
      <span className="text-[11.5px] text-texto-3" data-dia-posto-macros>{macrosDoPosto(i)}</span>
    </li>
  );
}

function Bloco({ children, className, ...resto }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("min-w-0 rounded-2xl border border-linha px-3.5 py-2.5", className)} {...resto}>{children}</section>;
}

/**
 * O "Dia a dia" da aba Dieta da ficha (W-A P6 — spec §4.5; P7 e Q1 do Weslley): o que o aluno registrou no app, dia a dia, nos últimos 14 dias —
 * por refeição do plano, os itens (riscados os que ele tirou), os que ele pôs ("pelo aluno", com os macros) e o ✓; as refeições extras; o que
 * ficou fora do plano (a nutri tirou a refeição depois: o retrato, "refeição tirada do plano"); o total comido × plano e as rotinas do dia
 * (feitas/não). Faixa "A dieta está em “Só ver” (Acessos)." quando travada; vazio: "Nada registrado pelo aluno nestes dias." Só leitura (a
 * nutri, o dono e o master na seção "Dia a dia"; o personal embaixo da adesão). Tudo pelo servidor: a aluno-dia (o dia e as rotinas) e a
 * nutricao (o plano e os ✓, as mesmas consultas da ficha).
 */
export default function DiaADia({ alunoId, pacienteId, nome }: { alunoId: string; pacienteId: string; nome: string | null }) {
  const dia = useDiaDoAluno(alunoId);
  const rotinas = useRotinasDoAluno(alunoId);
  const planos = usePlanosDoAluno(pacienteId);
  const { de, ate } = janelaDoPainel();
  const concluidas = useConcluidas(pacienteId, de, ate);
  const hoje = hojeSP();
  const dias = useMemo(() => diasDaJanela(hoje), [hoje]);
  const [escolhido, setEscolhido] = useState(hoje);
  const visto = dias.includes(escolhido) ? escolhido : hoje;
  const ativo = useMemo(() => planoAtivo(planos.data ?? []), [planos.data]);
  const com = useMemo(
    () => diasComRegistro(dias, dia.data ?? null, concluidas.data ?? [], rotinas.data ?? null),
    [dias, dia.data, concluidas.data, rotinas.data],
  );
  const d = useMemo(
    () => diaNaFicha((ativo as unknown as PlanoAlimentar | null) ?? null, visto, dia.data ?? null, concluidas.data ?? [], rotinas.data ?? null),
    [ativo, visto, dia.data, concluidas.data, rotinas.data],
  );
  const estado = estadoDoDiaADia(dia, [rotinas, planos, concluidas], com);
  const liberada = dia.data?.liberada;

  return (
    <Cartao className="min-w-0 px-[18px] py-4" data-dia-a-dia={estado} data-dia-a-dia-liberada={dia.data ? (liberada ? "1" : "0") : ""}>
      <CabecalhoCartao
        titulo={TEXTOS_DIA.titulo}
        extra={dia.data ? <Chip tom={liberada ? "n" : "g"} data-dia-a-dia-nivel>{liberada ? TEXTOS_DIA.liberada : TEXTOS_DIA.soVer}</Chip> : undefined}
      />
      <p className="-mt-1 mb-3 text-[12.5px] leading-relaxed text-texto-2">{TEXTOS_DIA.subtitulo(primeiroNome(nome))}</p>
      {dia.data && !liberada && (
        <p className="mb-3 flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5 text-[12.5px] text-texto-2" data-dia-a-dia-travada>
          <Eye aria-hidden className="h-4 w-4 flex-none text-ambar-3" />
          <span>
            A dieta está em “Só ver” (<Link to={`/painel/alunos/${encodeURIComponent(alunoId)}/acessos`} className="font-semibold text-violeta-3" data-dia-a-dia-acessos>Acessos</Link>).
          </span>
        </p>
      )}
      {estado === "carregando" ? (
        <Esqueleto className="h-[220px] w-full" />
      ) : estado === "sem-internet" ? (
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-texto-2" data-dia-a-dia-sem-rede>
          <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-ambar-3" /> {TEXTOS_DIA.semInternet}
        </p>
      ) : estado === "erro" ? (
        <div className="flex flex-col items-start gap-2.5" data-leitura>
          <p className="text-[12.5px] text-texto-2">{TEXTOS_DIA.erro}</p>
          <Botao tamanho="sm" icone={RefreshCw} onClick={() => void Promise.all([dia.refetch(), rotinas.refetch()])} data-dia-a-dia-tentar>Tentar de novo</Botao>
        </div>
      ) : estado === "vazio" ? (
        <p className="text-[12.5px] text-texto-3" data-dia-a-dia-vazio>{TEXTOS_DIA.vazio}</p>
      ) : (
        <>
          <div className="pq-sem-barra -mx-0.5 mb-3 flex min-w-0 gap-1.5 overflow-x-auto px-0.5" role="group" aria-label="Escolha o dia" data-leitura data-dia-a-dia-dias>
            {dias.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={x === visto}
                onClick={() => setEscolhido(x)}
                data-dia-a-dia-botao={x}
                data-dia-a-dia-com={com.has(x) ? "1" : "0"}
                className={cn(
                  "relative h-[32px] flex-none whitespace-nowrap rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors",
                  x === visto ? "border-[#FAFAFA] bg-[#FAFAFA] text-[#09090B]" : "border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto",
                )}
              >
                {rotuloCurto(x, hoje)}
                {com.has(x) && <i aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: "var(--p-verde)" }} />}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2.5" data-dia-a-dia-conteudo={visto} data-dia-a-dia-registrou={d.registrou ? "1" : "0"}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5" data-dia-a-dia-total
              data-kcal-comido={Math.round(d.totais.comido.energia_kcal)} data-kcal-plano={Math.round(d.totais.plano.energia_kcal)}>
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-texto-3">{TEXTOS_DIA.totalTitulo}</span>
              <b className="text-[15px] font-semibold text-texto">{TEXTOS_DIA.comido(d.totais.comido.energia_kcal, d.totais.plano.energia_kcal)}</b>
              <span className="text-[12px] text-texto-3">{macrosDoTotal(d.totais.comido)}</span>
            </div>
            {!ativo && <p className="text-[12.5px] text-texto-3" data-dia-a-dia-sem-plano>{TEXTOS_DIA.semPlano}</p>}
            {ativo && d.refeicoes.length === 0 && <p className="text-[12.5px] text-texto-3">{TEXTOS_DIA.semRefeicao}</p>}
            {d.refeicoes.map((r) => (
              <Bloco key={r.refeicao.id} data-dia-refeicao={r.refeicao.id} data-dia-refeicao-feita={r.concluida ? "1" : "0"}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{fmtHorario(r.refeicao.horario) || "—"}</span>
                  <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto">{r.refeicao.nome}</b>
                  <Chip tom={r.concluida ? "n" : "g"} className="flex-none">{r.concluida ? TEXTOS_DIA.marcou : TEXTOS_DIA.naoMarcou}</Chip>
                </div>
                {(r.itens.length > 0 || r.adicionados.length > 0) && (
                  <ul className="mt-1.5 flex min-w-0 flex-col gap-1">
                    {r.itens.map((x) => (
                      <li key={x.item.id} className="flex min-w-0 items-baseline gap-2 text-[12.5px]" data-dia-item={x.item.id} data-dia-item-tirado={x.tirado ? "1" : "0"}>
                        <span className={cn("min-w-0 flex-1 truncate", x.tirado ? "text-texto-3 line-through" : "text-texto-2")}>{x.item.alimento?.nome ?? "Alimento"}</span>
                        <span className="flex-none text-[11.5px] tabular-nums text-texto-3">{quantidadeCurta(x.item)}</span>
                        {x.tirado && <Chip tom="a" className="flex-none" data-dia-item-tirou>{TEXTOS_DIA.tirou}</Chip>}
                      </li>
                    ))}
                    {r.adicionados.map((i) => <ItemPosto key={i.id} item={i} />)}
                  </ul>
                )}
              </Bloco>
            ))}
            {d.extras.map((e) => (
              <Bloco key={e.extra.id} data-dia-extra={e.extra.id} data-dia-extra-feita={e.concluida ? "1" : "0"}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{fmtHorario(e.extra.horario) || "—"}</span>
                  <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto">{e.extra.nome}</b>
                  <Chip tom="c" className="flex-none">{TEXTOS_DIA.extra}</Chip>
                  <Chip tom={e.concluida ? "n" : "g"} className="flex-none">{e.concluida ? TEXTOS_DIA.comeu : TEXTOS_DIA.naoComeu}</Chip>
                </div>
                {e.adicionados.length > 0 && <ul className="mt-1.5 flex min-w-0 flex-col gap-1">{e.adicionados.map((i) => <ItemPosto key={i.id} item={i} />)}</ul>}
              </Bloco>
            ))}
            {d.foraDoPlano.map((g) => (
              <Bloco key={g.refeicao} className="border-dashed" data-dia-fora={g.refeicao}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto-2">{g.refeicao}</b>
                  <Chip tom="a" className="flex-none" data-dia-fora-selo>{TEXTOS_DIA.refeicaoTirada}</Chip>
                </div>
                <ul className="mt-1.5 flex min-w-0 flex-col gap-1">
                  {g.itens.map((i) =>
                    i.tipo === "adicionado" ? (
                      <ItemPosto key={i.id} item={i} />
                    ) : (
                      <li key={i.id} className="flex min-w-0 items-baseline gap-2 text-[12.5px]" data-dia-fora-tirado={i.id}>
                        <span className="min-w-0 flex-1 truncate text-texto-3 line-through">{i.nome}</span>
                        <Chip tom="a" className="flex-none">{TEXTOS_DIA.tirou}</Chip>
                      </li>
                    ),
                  )}
                </ul>
              </Bloco>
            ))}
            <Bloco data-dia-rotinas={d.rotinas.length} data-dia-rotinas-feitas={d.rotinas.filter((r) => r.feita).length}>
              <b className="block text-[13.5px] font-semibold text-texto">{TEXTOS_DIA.rotinas}</b>
              {d.rotinas.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-texto-3">{TEXTOS_DIA.semRotinas}</p>
              ) : (
                <ul className="mt-1 flex min-w-0 flex-col gap-0.5">
                  {d.rotinas.map((r) => (
                    <LinhaDaRotina key={r.id} rotina={r} feita={r.feita} sub={r.detalhe}
                      extra={r.apagada ? <Chip tom="g" className="flex-none">{TEXTOS_DIA.apagada}</Chip> : undefined} />
                  ))}
                </ul>
              )}
            </Bloco>
          </div>
        </>
      )}
    </Cartao>
  );
}
```

`~/projetos/physiqcalc-scratch/w-a/p6/patches/T4-codigo.patch`:
```diff
diff --git a/src/nutricao/editor/lib/acesso.ts b/src/nutricao/editor/lib/acesso.ts
index 000e64f..6e57e8b 100644
--- a/src/nutricao/editor/lib/acesso.ts
+++ b/src/nutricao/editor/lib/acesso.ts
@@ -1,9 +1,13 @@
 // Physiq W16 — quem vê e quem muda a dieta do aluno no painel (spec 4.1) e as seções da aba Dieta (spec 4.5). Regras puras.
 import type { PerfilAluno } from "@/painel/aluno/dados/tipos";
 
-/** As seções da aba (spec 4.5 › Dieta): o editor da tela 8 e as 6 seções do prontuário do Nutri que são da dieta. */
+/**
+ * As seções da aba (spec 4.5 › Dieta): o editor da tela 8 e as 6 seções do prontuário do Nutri que são da dieta. W-A P6 (spec W-A §4.5, P7
+ * do Weslley): + o "Dia a dia" — o que o aluno registrou no app (lê pela função aluno-dia e pelas consultas da ficha; nada direto daqui).
+ */
 export const SECOES_DIETA = [
   { id: "planejamento", rotulo: "Plano" },
+  { id: "dia-a-dia", rotulo: "Dia a dia" },
   { id: "acompanhamento", rotulo: "Acompanhamento" },
   { id: "calculo-energetico", rotulo: "Cálculo energético" },
   { id: "suplementos", rotulo: "Suplementos" },
diff --git a/src/painel/aluno/abas/Dieta.tsx b/src/painel/aluno/abas/Dieta.tsx
index c3f8a33..8b579be 100644
--- a/src/painel/aluno/abas/Dieta.tsx
+++ b/src/painel/aluno/abas/Dieta.tsx
@@ -24,17 +24,24 @@ const Manipulados = lazy(() => import("@/nutricao/editor/secoes/Manipulados"));
 const Metas = lazy(() => import("@/nutricao/editor/secoes/Metas"));
 const Orientacoes = lazy(() => import("@/nutricao/editor/secoes/Orientacoes"));
 const Suplementos = lazy(() => import("@/nutricao/editor/secoes/Suplementos"));
+// W-A P6 (spec §4.5, P7/Q1): o "Dia a dia" — o que o aluno registrou no app (o que tirou e pôs, as extras, o ✓, as rotinas), pelo servidor
+const DiaADia = lazy(() => import("@/painel/aluno/diaADia/DiaADia"));
 
-function Secao({ secao }: { secao: SecaoDieta }) {
+/** O aluno da ficha para o "Dia a dia" (a rota, a matrícula e o nome). */
+type AlunoDoDia = { alunoId: string; pacienteId: string; nome: string | null };
+
+function Secao({ secao, aluno }: { secao: SecaoDieta; aluno: AlunoDoDia }) {
   return (
     <Carregavel nome={`dieta ${secao}`} esqueleto={<EstadoCarregando linhas={4} rotulo="Abrindo a seção" />}>
-      <SecaoPreguicosa secao={secao} />
+      <SecaoPreguicosa secao={secao} aluno={aluno} />
     </Carregavel>
   );
 }
 
-function SecaoPreguicosa({ secao }: { secao: SecaoDieta }) {
+function SecaoPreguicosa({ secao, aluno }: { secao: SecaoDieta; aluno: AlunoDoDia }) {
   switch (secao) {
+    case "dia-a-dia":
+      return <DiaADia {...aluno} />;
     case "acompanhamento":
       return <Acompanhamento />;
     case "calculo-energetico":
@@ -74,6 +81,8 @@ function AdesaoDoPlano({ pacienteId }: { pacienteId: string }) {
  * plano (por dia da semana, macros e fibras, substitutos, "Da receita", modelos ★, PDF) e as seções do site antigo do Nutri que são
  * da dieta — acompanhamento com os ✓ das refeições por dia, cálculo energético, suplementos, manipulados, orientações e metas.
  * Tudo no banco principal, nas mesmas tabelas que o site antigo edita (ele abre o que se grava aqui, e vice-versa, até a W28).
+ * W-A P6 (spec W-A §4.5; P7 e Q1 do Weslley): a seção "Dia a dia" (src/painel/aluno/diaADia/) — o que o aluno registrou no app; o personal
+ * (só o plano) a vê embaixo da adesão, só para ler.
  */
 export default function Dieta({ alunoId }: { alunoId: string }) {
   const q = usePerfilAluno(alunoId);
@@ -95,6 +104,7 @@ export default function Dieta({ alunoId }: { alunoId: string }) {
     if (id !== "planejamento") n.set("secao", id);
     setParams(n, { replace: true });
   };
+  const aluno: AlunoDoDia = { alunoId, pacienteId: perfil.paciente_id, nome: perfil.nome };
   const ctx = {
     paciente: { id: perfil.paciente_id, nome: perfil.nome, nascimento: perfil.nascimento, genero: perfil.genero ? String(perfil.genero) : null },
     recarregar: async () => {
@@ -141,13 +151,15 @@ export default function Dieta({ alunoId }: { alunoId: string }) {
           <>
             <Planejamento objetivo={perfil.objetivo} />
             {acesso === "so-plano" && <AdesaoDoPlano pacienteId={perfil.paciente_id} />}
+            {/* W-A P6 (Q1 do Weslley): o personal vê o dia a dia, só para ler, embaixo da adesão */}
+            {acesso === "so-plano" && <Secao secao="dia-a-dia" aluno={aluno} />}
           </>
         ) : acesso === "ver" ? (
           <SomenteLeitura data-dieta-leitura>
-            <Secao secao={secao} />
+            <Secao secao={secao} aluno={aluno} />
           </SomenteLeitura>
         ) : (
-          <Secao secao={secao} />
+          <Secao secao={secao} aluno={aluno} />
         )}
       </div>
     </PacienteProvider>
```

- [ ] **Step 3: O lint** — `cd ~/projetos/physiqcalc-wa-p6 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npx eslint src/painel/aluno/diaADia src/painel/aluno/abas/Dieta.tsx src/painel/aluno/abas/Dieta.test.tsx src/nutricao/editor/lib/acesso.ts src/nutricao/editor/lib/acesso.test.ts`
  → nada impresso (0 erro, 0 aviso).
- [ ] **Step 4: Commit** — `feat(w-a): o dia a dia na aba Dieta da ficha (o que o aluno registrou no app: o que tirou e pôs, as extras, o ✓, o fora do plano, o total e as rotinas; o personal embaixo da adesão)`
  com `src/painel/aluno/diaADia/useDiaADia.ts src/painel/aluno/diaADia/DiaADia.tsx src/painel/aluno/diaADia/DiaADia.test.tsx src/painel/aluno/abas/Dieta.tsx src/painel/aluno/abas/Dieta.test.tsx src/nutricao/editor/lib/acesso.ts src/nutricao/editor/lib/acesso.test.ts`;
  `feita.sh 4 "dia a dia + aba Dieta; eslint 0" "<placar>"`.

---

### Task 5: O E2E antigo tocado — `e2e/w16/telas.py` (as 8 seções da aba Dieta da ficha)

**Files:** Modify `e2e/w16/telas.py`.
**Estimativa:** 5 min (calibrado 1–2).

- [ ] **Step 1: A verificação** — `cd ~/projetos/physiqcalc-wa-p6 && git apply ~/projetos/physiqcalc-scratch/w-a/p6/patches/T5.patch && python3 -c "compile(open('e2e/w16/telas.py').read(), 'telas.py', 'exec'); print('compila ok')" && grep -c "count() == 8" e2e/w16/telas.py`
  → `compila ok` e `1`. (A rodada dele entra na regressão do staging — Task 10.)

`~/projetos/physiqcalc-scratch/w-a/p6/patches/T5.patch`:
```diff
diff --git a/e2e/w16/telas.py b/e2e/w16/telas.py
index c5fc2da..0f0c0e8 100644
--- a/e2e/w16/telas.py
+++ b/e2e/w16/telas.py
@@ -321,7 +321,9 @@ def caso_secoes(nav) -> None:
         fechar_faixa(c)
         if not esperar_editor_dieta(c, "secoes"):
             return
-        p.check(c.pg.locator("[data-secao-dieta-botao]").count() == 7, "[secoes] as 7 seções (Plano, Acompanhamento, Cálculo, Suplementos, Manipulados, Orientações, Metas)")
+        # W-A P6: + o "Dia a dia" (a 2ª seção, depois do Plano — src/nutricao/editor/lib/acesso.ts)
+        p.check(c.pg.locator("[data-secao-dieta-botao]").count() == 8,
+                "[secoes] as 8 seções (Plano, Dia a dia, Acompanhamento, Cálculo, Suplementos, Manipulados, Orientações, Metas)")
         p.check(c.tem('[data-plano][data-favorito]') and c.tem("[data-btn-novo-plano]") and c.tem("[data-btn-modelo-plano]"), "[secoes] a lista de planos com Nova prescrição e Usar um modelo ★")
         c.print("aba_dieta")
         # acompanhamento: os ✓ de ontem e de hoje (F3)
```

- [ ] **Step 2: Commit** — `test(w16): a aba Dieta da ficha com 8 seções (+ o Dia a dia da W-A P6)` com `e2e/w16/telas.py`; `feita.sh 5 "w16: 8 seções" "compila"`.

---

### Task 6: O E2E novo — `e2e/wa/telas_painel.py` (`--seco`, compila) + as guardas

**Files:** Create `e2e/wa/telas_painel.py`.
**Estimativa:** 15 min (calibrado 2–4).

- [ ] **Step 1: O arquivo e as provas sem rede**

Run: `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh e2e/wa/telas_painel.py && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/telas_painel.py --seco && python3 -c "compile(open('e2e/wa/telas_painel.py').read(), 'telas_painel.py', 'exec'); print('compila ok')"`
Expected: `56/56 seletores e textos do E2E no código` e `compila ok`.

`e2e/wa/telas_painel.py`:
```python
#!/usr/bin/env python3
"""Physiq W-A P6 — E2E de TELA do painel: o card "Rotinas" do Resumo e o "Dia a dia" da aba Dieta da ficha (Edge; painel 1280 × 883, celular
390 × 844; o app da aluna 390 × 844). Spec W-A §4.5, §4.7, §6 "P6", §7. Contas de TESTE (hml-17): w5p-personal (dono + personal da conta A
da w5p-aluna — cria a rotina pelo card), w5p-nutri (a nutricionista dela na conta A: libera/trava a Dieta pela função acessos e vê o "Dia a
dia"), w5p-aluna (o sino, a página de rotinas e o que ela registra no dia — pelas funções, como ela), w13-dono (a conta B: a 2ª matrícula da
aluna, pela Massa) e a matrícula "sem login" (Massa). Casos (na ordem; cada um depende do anterior):
  P0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  P1  p_resumo_rotinas     o personal abre o Resumo: o card Rotinas com a "<marca> Creatina" da aluna (feita hoje — o ✓ dela, só leitura) e o
                           selo "do aluno"; ao abrir, 0 gravação (só `ler` q=aluno_rotinas na aluno-dia)
  P2  p_nova_rotina        "Nova rotina" → a folha da P3 no modo do profissional → "<marca> Água 2 L" (hábito, 10:00, todos os dias) → 1
                           prof_rotina_salvar; no banco: origem profissional na matrícula A, criada pelo personal; o aviso no sino da aluna (hoje)
  P3  mudar a do profissional pelo card: 10:00 → 11:00 (no banco o horário e o histórico "mudou" — quem: profissional)
  P4  p_sino_aluno         a aluna (o app) abre o sino: "Seu profissional criou uma rotina para você"; a /perfil/rotinas com a Água e o selo
                           "do seu profissional" (aparece no app)
  P5  p_apagada_pelo_aluno a aluna apaga a Água (P8b, pela função como ela) → o card não a mostra mais; o "Ver tudo": "apagada pelo aluno em dd/mm"
  P6  p_historico          o "Ver tudo" › Histórico: criou (o personal), mudou ("horário 10:00 → 11:00"), apagou (o aluno)
  P7  a conta B (w13-dono na 2ª matrícula) vê a Creatina da aluna, NÃO vê o "<marca> Ômega 3" que o personal criou na conta A e não o muda
      nem o apaga pela função (404 nao_encontrado)
  P8  p_dia_a_dia          a nutri libera a Dieta; a aluna (pelas funções) tira o último item da 1ª refeição de hoje, põe um arroz da TACO nela,
                           dá o ✓ nela, cria a extra "<marca> Lanche" ("Já comi") com um arroz, e põe um arroz na refeição temporária
                           "<marca> Ceia" do plano — que a nutri tira do plano em seguida (o retrato). A nutri abre Dieta › Dia a dia: o ✓,
                           o riscado, o "pelo aluno", a extra, a "refeição tirada do plano", o total e as rotinas do dia; ao abrir, 0 gravação
  P9  p_dia_a_dia_travada  a nutri trava a Dieta: a faixa "A dieta está em “Só ver” (Acessos)." e o que ela registrou continua lá (§2.2-12)
  P10 p_dia_a_dia_personal o personal (só o plano, Q1 — o w5p-personal SÓ com o papel 'personal': a Massa tira o 'dono' durante o caso e devolve):
                           o Plano, a adesão e, embaixo, o Dia a dia com o mesmo dia — só ler; 0 gravação ao abrir
  P11 p_rotinas_sem_login  a matrícula "sem login" (Massa): "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos."
  P12 p_dia_a_dia_celular  390 px: o card Rotinas e o Dia a dia cabem na tela (nada passa da largura)
  --loja: P0 (a marca da loja) + a massa pelas funções (a Creatina feita; a Dieta liberada, tirar e pôr) + P1 + P8 e P10 SÓ LENDO — os prints
          com o prefixo loja_.
A rodada vai para o estado (~/projetos/physiqcalc-scratch/w-a/p6-estado.json) ANTES de qualquer escrita: a foto da matrícula A (os acessos, os ✓
de hoje). A massa leva a marca "WA E2E P6 <hhmmss>". No fim (e no --limpar): os acessos da A voltam à foto, os ✓ novos de hoje saem, o que a
aluna pôs/tirou no dia e as extras desde o começo, as rotinas com a marca, a refeição temporária (se sobrou), o histórico dos acessos e os
avisos da rodada saem, e a Massa (a 2ª matrícula, a "sem login") é desfeita — as sobras = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging (https://physiqcalc-staging.vercel.app)
· prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador — nenhuma gravação sai —, a conta de teste "master" do Calc
(admin.teste.claude) no aluno da conta "Admin Teste": P1 o Resumo abre com o card Rotinas só com leituras, P2 nenhuma gravação tentada; print
prod_p_resumo_rotinas; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p6/<base>[-loja]/<caso>_<largura>.png.
Saída: ~/projetos/physiqcalc-scratch/w-a/p6/telas_painel_<base>.txt (só contagens, kcal das contas de TESTE, status e códigos). Logout local das
sessões do teste (nunca o global).
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código.
Uso: python3 e2e/wa/telas_painel.py --base local|staging|prod [--loja] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import uuid
from pathlib import Path
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
S = "staging"
SP = ZoneInfo("America/Sao_Paulo")
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
ORIGEM = "https://physiqcalc-staging.vercel.app"
ESTADO = B.SCRATCH / "w-a" / "p6-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p6"
TITULO_ROTINA = "Seu profissional criou uma rotina para você"
TITULO_DIETA = "Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia"
TRAVADA = "A dieta está em “Só ver” (Acessos)."
SEM_LOGIN = "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos."
# na produção (a Guarda), as gravações que já existem ao abrir e não são da W-A (o molde do telas_acessos.py da P4)
BARRADAS_ACEITAS = {"POST rpc:aluno_acesso", "POST fn:nutricao"}

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/painel/aluno/resumo/CardRotinas.tsx": ["data-card-rotinas={estado}", "data-rotinas-pode-criar=", "data-rotinas-hoje={doDia.length}",
                                                "data-rotinas-nova", "data-rotinas-ver-tudo", "data-rotinas-sem-login", "data-rotinas-acessos",
                                                'modo={{ tipo: "profissional", aluno: alunoId }}'],
    "src/painel/aluno/rotinas/LinhaDaRotina.tsx": ['"data-rotina-painel": r.id', '"data-rotina-feita": feita ? "1" : "0"', "data-rotina-painel-abrir={r.id}",
                                                   "data-rotina-painel-selo", '"data-rotina-origem": r.origem'],
    "src/painel/aluno/rotinas/FolhaTodasAsRotinas.tsx": ["data-rotinas-tudo", "data-rotina-apagada={r.id}", "data-rotina-apagada-texto",
                                                        "data-rotina-evento={e.o_que}", "data-rotina-evento-mudanca", 'lado="direita"'],
    "src/painel/aluno/rotinas/regras.ts": ['semLogin: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos."',
                                           "`apagada pelo aluno em ${quando}`", "export const JANELA_DIAS = 14;"],
    "src/painel/aluno/diaADia/DiaADia.tsx": ["data-dia-a-dia={estado}", "data-dia-a-dia-botao={x}", "data-dia-a-dia-conteudo={visto}",
                                             "data-dia-refeicao={r.refeicao.id}", 'data-dia-refeicao-feita={r.concluida ? "1" : "0"}',
                                             "data-dia-item={x.item.id}", 'data-dia-item-tirado={x.tirado ? "1" : "0"}', "data-dia-posto={i.id}",
                                             "data-dia-extra={e.extra.id}", "data-dia-fora={g.refeicao}", "data-dia-fora-selo", "data-dia-rotinas=",
                                             "data-dia-a-dia-travada", "data-dia-a-dia-total", "data-kcal-comido=", "data-leitura"],
    "src/painel/aluno/diaADia/regras.ts": ['travada: "A dieta está em “Só ver” (Acessos)."', 'vazio: "Nada registrado pelo aluno nestes dias."',
                                           'refeicaoTirada: "refeição tirada do plano"'],
    "src/painel/aluno/abas/Dieta.tsx": ['case "dia-a-dia":', '<Secao secao="dia-a-dia" aluno={aluno} />', "data-acesso-dieta={acesso}"],
    "src/nutricao/editor/lib/acesso.ts": ['{ id: "dia-a-dia", rotulo: "Dia a dia" }'],
    "src/painel/aluno/catalogoAbas.ts": ['"CardRotinas",'],
    "src/rotinas/ui/FolhaRotina.tsx": ["data-folha-rotina", "data-folha-modo={modo.tipo}", "data-rotina-nome", "data-rotina-horario", "data-rotina-salvar"],
    "src/app-aluno/perfil/Rotinas.tsx": ["data-pagina-rotinas", "data-rotina-linha={r.id}"],
    "src/rotinas/ui/RotinasDeHoje.tsx": ["data-rotina-selo"],
    "src/ui/premium/Sino.tsx": ["data-sino", "data-sino-lista"],
}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p6") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.ids: dict[str, str] = {}
        self.pre = ""

    def tela(self, nav, nome: str, desktop: bool = True, guarda=None) -> B.Tela:
        return B.Tela(nav, self.base, "p6", nome, desktop=desktop, guarda=guarda)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, f"{self.pre}{caso}")
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a massa e a limpeza) e as funções ─────────────────────────
def funcao(nome: str, token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": ORIGEM}
    st, r, _h = B5.http("POST", f"{B.H.API_P}/functions/v1/{nome}", corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def foto() -> dict:
    """SÓ LEITURA: a matrícula A, o plano ativo de hoje (a 1ª refeição com alimento e o último item dela), um arroz da TACO, os acessos e os ✓
    de hoje da A."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id, p.conta_id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                    and p.personal_id = {u('w5p-personal')} order by p.created_at limit 1),
           hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
      select (select id::text from a) as pac_a, (select conta_id::text from a) as conta_a, {u('w5p-aluna')}::text as aluna,
             {u('w5p-nutri')}::text as nutri, {u('w5p-personal')}::text as personal, {u('w13-dono')}::text as w13,
             (select d::text from hoje) as hoje, {S}.wa_plano_ativo({u('w5p-aluna')})::text as plano,
             (select a2.id::text from {S}.alimentos a2 where a2.fonte = 'taco' and a2.deleted_at is null and a2.busca like '%arroz%'
               order by a2.nome limit 1) as arroz,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select coalesce(jsonb_agg(rc.refeicao_id::text), '[]'::jsonb) from {S}.refeicoes_concluidas rc, a, hoje
               where rc.paciente_id = a.id and rc.data = hoje.d) as concluidas_a,
             (select count(*) from {S}.rotinas ro where ro.dono_user_id = {u('w5p-aluna')} and ro.arquivada_em is null) as rotinas_vivas""")[0]
    refs = B.ler(f"""select r.id::text as id, (select coalesce(json_agg(i.id::text order by i.ordem, i.created_at), '[]'::json)
                                                 from {S}.itens_refeicao i where i.refeicao_id = r.id) as itens
                       from {S}.refeicoes r
                      where r.plano_id = {B.txt(r['plano'])}
                        and (cardinality(r.dias_semana) = 0 or extract(isodow from {B.txt(r['hoje'])}::date)::smallint = any(r.dias_semana))
                      order by r.ordem, to_char(r.horario, 'HH24:MI'), r.nome""") if r["plano"] else []
    com = [x for x in refs if x["itens"]]
    if not (r["pac_a"] and com and r["arroz"]):
        raise SystemExit("massa de TESTE incompleta no staging (a matrícula A da w5p-aluna com 1 refeição de hoje com alimento e a TACO com arroz) — nada foi gravado")
    if int(r["rotinas_vivas"]) > 26:
        raise SystemExit(f"a w5p-aluna tem {r['rotinas_vivas']} rotinas vivas (a rodada cria 3; o limite é 30) — conferir no quadro (nada foi gravado)")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    return {**r, "r1": com[0]["id"], "item1": com[0]["itens"][-1]}


def nivel_dieta(e: dict) -> str:
    r = B.ler(f"select nivel from {S}.aluno_acessos where paciente_id = {B.txt(e['pac_a'])} and chave = 'dieta'")
    return r[0]["nivel"] if r else "ver"


def mudar_dieta(R: Rodada, conta: str, pac: str, valor: str) -> bool:
    st, r = funcao("acessos", R.L.token(conta), {"acao": "salvar", "aluno": pac, "chave": "dieta", "valor": valor})
    return st == 200 and (r.get("linhas") or {}).get("dieta") == valor


def rotina(e: dict, sufixo: str) -> dict | None:
    r = B.ler(f"""select r.id::text as id, r.origem, r.paciente_id::text as paciente_id, r.criada_por::text as criada_por, to_char(r.horario, 'HH24:MI') as horario,
                         r.arquivada_em is not null as arquivada, r.arquivada_por::text as arquivada_por,
                         (select coalesce(json_agg(json_build_object('o_que', h.o_que, 'quem', h.quem) order by h.em), '[]'::json)
                            from {S}.rotinas_historico h where h.rotina_id = r.id) as historico
                    from {S}.rotinas r where r.dono_user_id = {B.txt(e['aluna'])} and r.nome = {B.txt(e['marca'] + ' ' + sufixo)}""")
    return r[0] if r else None


def avisos_rotina_hoje(e: dict) -> int:
    return int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                           and titulo = {B.txt(TITULO_ROTINA)}
                           and criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'""")[0]["n"])


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    al, ini, marca = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
    titulos = ", ".join(B.txt(t) for t in (TITULO_ROTINA, TITULO_DIETA))
    antes = B.txt("{" + ",".join(e.get("concluidas_a") or []) + "}")
    r = B.ler(f"""select (select count(*) from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}) as itens_do_dia,
                         (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}) as extras,
                         (select count(*) from {S}.rotinas where dono_user_id = {al} and nome like {marca}) as rotinas,
                         (select count(*) from {S}.refeicoes where plano_id = {B.txt(e.get('plano'))} and nome like {marca}) as refeicao_temporaria,
                         (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and titulo in ({titulos})
                            and criado_em >= {ini}) as avisos,
                         (select count(*) from {S}.refeicoes_concluidas where paciente_id = {B.txt(e['pac_a'])} and data = {B.txt(e['hoje'])}::date
                            and refeicao_id::text <> all({antes}::text[])) as concluidas_novas,
                         ((select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel) order by x.chave), '[]'::jsonb)
                             from {S}.aluno_acessos x where x.paciente_id = {B.txt(e['pac_a'])})
                           is distinct from {B.txt(json.dumps([{'chave': y['chave'], 'nivel': y['nivel']} for y in e.get('acessos_a') or []]))}::jsonb)::int
                           as acessos_diferentes""")[0]
    return {k: int(v) for k, v in r.items()}


def limpar(e: dict | None = None) -> dict:
    """Desfaz a rodada pelo estado e a Massa do _base.py (a 2ª matrícula, a "sem login"); devolve as sobras (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8") or "{}") if ESTADO.exists() else {})
    sobras: dict = {}
    if e.get("pac_a") and e.get("marca"):
        al, ini, marca, pa = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%"), B.txt(e["pac_a"])
        titulos = ", ".join(B.txt(t) for t in (TITULO_ROTINA, TITULO_DIETA))
        antes = B.txt("{" + ",".join(e.get("concluidas_a") or []) + "}")
        comandos = [
            f"delete from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.rotinas where dono_user_id = {al} and nome like {marca}",
            f"""delete from {S}.refeicoes_concluidas where paciente_id = {pa} and data = {B.txt(e['hoje'])}::date
                 and refeicao_id::text <> all({antes}::text[])""",
            f"delete from {S}.aluno_acessos where paciente_id = {pa}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({pa}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []],
            f"delete from {S}.aluno_acessos_log where paciente_id = {pa} and em >= {ini}",
            f"delete from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and criado_em >= {ini} and titulo in ({titulos})",
        ]
        if e.get("plano"):
            comandos.append(f"delete from {S}.refeicoes where plano_id = {B.txt(e['plano'])} and nome like {marca}")
        for c in comandos:
            B.escrever(c)
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text("{}", encoding="utf-8")
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


def massa_sem_login(R: Rodada) -> str:
    """A matrícula 'sem login' (personal + nutri, na conta A) pela Massa do _base.py: o id vai ao estado ANTES do insert (o molde da P4)."""
    m = B.Massa()
    novo = str(uuid.uuid4())
    m.estado["matriculas"].append(novo)
    m._guardar()  # noqa: SLF001 — o mesmo estado do --limpar do _base.py
    B.escrever(f"""insert into {S}.pacientes (id, conta_id, personal_id, nutricionista_id, nome, config)
                   values ({B.txt(novo)}, {B.txt(R.e['conta_a'])}, {B.txt(R.e['personal'])}, {B.txt(R.e['nutri'])},
                           {B.txt(R.e['marca'] + ' sem login')}, '{{"wa_e2e": true}}'::jsonb)""")
    return novo


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas às funções da W-A que NÃO são leitura (a Guarda: leitura = { acao: "ler" }). A nutricao da ficha não é da P6 (o garantir dela no
    1º acesso é de antes — o BARRADAS_ACEITAS da P4)."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos
            if p["tipo"] == "fn" and p["nome"] in ("aluno-dia", "acessos") and p["acao"] != "ler"]


def leituras(t: B.Tela, q: str) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] == "ler"
               and f'"q":"{q}"' in (p["corpo"] or "").replace(" ", ""))


def estado_card(t: B.Tela) -> str:
    return (t.attr("[data-card-rotinas]", "data-card-rotinas") or [""])[0]


def abrir_resumo(t: B.Tela, R: Rodada, conta: str, pac: str, conta_ativa: str | None) -> bool:
    t.entrar(R.L, conta, f"/painel/alunos/{pac}", conta_ativa=conta_ativa)
    t.caso.fechar_avisos()
    ok = t.esperar(lambda: estado_card(t) not in ("", "carregando"), 60)
    if ok:  # o card fica abaixo dos 6 de cima: o print (só a janela) rola até ele
        t.pg.eval_on_selector("[data-card-rotinas]", "e => e.scrollIntoView({ block: 'center' })")
    return ok


def abrir_dia_a_dia(t: B.Tela, R: Rodada, conta: str, sufixo: str = "?secao=dia-a-dia") -> bool:
    e = R.e
    t.entrar(R.L, conta, f"/painel/alunos/{e['pac_a']}/dieta{sufixo}", conta_ativa=e["conta_a"])
    t.caso.fechar_avisos()
    ok = t.esperar(lambda: (t.attr("[data-dia-a-dia]", "data-dia-a-dia") or ["carregando"])[0] not in ("carregando",), 60)
    if ok:
        t.pg.eval_on_selector("[data-dia-a-dia]", "e => e.scrollIntoView({ block: 'start' })")
    return ok


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build", False)
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "P0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"P0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def semear_rotina_da_aluna(o, R: Rodada) -> None:
    """A rotina DA ALUNA (pela função, como ela) com o ✓ de hoje — o que o card mostra no P1."""
    e = R.e
    tok = R.L.token("w5p-aluna")
    st, r = funcao("aluno-dia", tok, {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Creatina", "detalhe": "5 g", "tipo": "suplemento",
                                                                       "horario": "08:00", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": False}})
    rid = (r.get("rotina") or {}).get("id")
    st2, _r2 = funcao("aluno-dia", tok, {"acao": "rotina_marcar", "id": rid, "dia": e["hoje"], "feita": True}) if rid else (0, {})
    o.ok(st == 200 and bool(rid) and st2 == 200, f"semear: a Creatina da aluna (rotina_salvar {st}) feita hoje (rotina_marcar {st2})")
    if rid:
        R.ids["creatina"] = rid


def caso_resumo_e_nova(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """P1 (+ P2 e P3 no site): o card do personal; criar e mudar a do profissional."""
    e = R.e
    cre = R.ids.get("creatina")
    t = R.tela(nav, "resumo")
    try:
        ok = abrir_resumo(t, R, "w5p-personal", e["pac_a"], e["conta_a"])
        linha = f'[data-card-rotinas] [data-rotina-painel="{cre}"]'
        o.ok(ok and estado_card(t) == "lista" and t.tem(linha), f"P1 o card Rotinas do personal com a Creatina da aluna ({estado_card(t)})")
        o.ok((t.attr(linha, "data-rotina-feita") or [""])[0] == "1" and (t.attr(linha, "data-rotina-editavel") or [""])[0] == "0"
             and "do aluno" in t.texto(f"{linha} [data-rotina-painel-selo]"),
             "P1 o ✓ que a aluna deu (só leitura), o selo 'do aluno' e sem abrir a folha (a rotina é dela)")
        t.pg.wait_for_timeout(1500)
        o.ok(not gravacoes_ao_abrir(t) and leituras(t, "aluno_rotinas") >= 1,
             f"P1 ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'}); `ler` q=aluno_rotinas {leituras(t, 'aluno_rotinas')}")
        R.print(t, "p_resumo_rotinas")
        if so_ler:
            return
        # P2 — "Nova rotina" pela folha da P3 no modo do profissional
        t.clicar("[data-rotinas-nova]")
        ok = t.esperar(lambda: t.tem('[data-folha-rotina="nova"][data-folha-modo="profissional"]'), 15)
        t.pg.locator("[data-rotina-nome]").fill(f"{e['marca']} Água 2 L")
        t.pg.get_by_role("radio", name="Hábito").click()
        t.pg.locator("[data-rotina-horario]").fill("10:00")
        t.clicar('[data-rotina-atalho="todos"]')
        R.print(t, "p_nova_rotina")
        t.zerar_pedidos()
        t.clicar("[data-rotina-salvar]")
        ok = ok and t.esperar(lambda: not t.tem('[data-folha-rotina="nova"]'), 20) and t.esperar(lambda: rotina(e, "Água 2 L") is not None, 20, 1)
        r = rotina(e, "Água 2 L") or {}
        n = t.contar("fn", "aluno-dia", lambda p: p["acao"] == "prof_rotina_salvar")
        o.ok(ok and n == 1 and r.get("origem") == "profissional" and r.get("paciente_id") == e["pac_a"] and r.get("criada_por") == e["personal"],
             f"P2 a Água pela folha do profissional: 1 prof_rotina_salvar ({n}); no banco: {({k: r.get(k) for k in ('origem', 'horario')})}, na matrícula A, criada pelo personal")
        o.ok(avisos_rotina_hoje(e) >= 1, f"P2 o aviso 'Seu profissional criou uma rotina para você' no sino da aluna (hoje: {avisos_rotina_hoje(e)})")
        if r.get("id"):
            R.ids["agua"] = r["id"]
        agua = f'[data-card-rotinas] [data-rotina-painel="{r.get("id")}"]'
        ok = t.esperar(lambda: t.tem(agua), 20)
        o.ok(ok and (t.attr(agua, "data-rotina-editavel") or [""])[0] == "1" and "do aluno" not in t.texto(f"{agua} [data-rotina-painel-selo]"),
             "P2 a Água no card, com o selo de quem criou e editável (a do profissional desta matrícula)")
        # P3 — mudar pelo card: 10:00 → 11:00
        t.clicar(f'[data-rotina-painel-abrir="{r.get("id")}"]')
        t.esperar(lambda: t.tem('[data-folha-rotina="mudar"][data-folha-modo="profissional"]'), 15)
        t.pg.locator("[data-rotina-horario]").fill("11:00")
        t.clicar("[data-rotina-salvar]")
        ok = t.esperar(lambda: (rotina(e, "Água 2 L") or {}).get("horario") == "11:00", 20, 1)
        hist = [h["o_que"] + ":" + h["quem"] for h in (rotina(e, "Água 2 L") or {}).get("historico") or []]
        o.ok(ok and hist == ["criou:profissional", "mudou:profissional"], f"P3 mudar 10:00 → 11:00 pelo card: no banco o horário e o histórico {hist}")
    finally:
        t.fim()


def caso_sino_e_app(o, nav, R: Rodada) -> None:
    """P4: a aluna (o app, 390 px): o sino com o aviso e a página de rotinas com a Água e o selo."""
    agua = R.ids.get("agua")
    t = R.tela(nav, "sino", desktop=False)
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-sino]"), 60)
        if ok:
            t.clicar("[data-sino]")
        ok = ok and t.esperar(lambda: TITULO_ROTINA in t.texto("[data-sino-lista]"), 30)
        o.ok(ok, "P4 o sino da aluna: 'Seu profissional criou uma rotina para você'")
        R.print(t, "p_sino_aluno")
        t.ir("/perfil/rotinas")
        linha = f'[data-rotina-linha="{agua}"]'
        ok = t.esperar(lambda: t.tem(linha), 45)
        o.ok(ok and t.n(f"{linha} [data-rotina-selo]") == 1, "P4 a Água aparece no app (/perfil/rotinas) com o selo 'do seu profissional'")
    finally:
        t.fim()


def caso_apagada_e_historico(o, nav, R: Rodada) -> None:
    """P5 + P6: a aluna apaga a Água (P8b, pela função); o card e o 'Ver tudo' (a apagada e o histórico)."""
    e = R.e
    agua = R.ids.get("agua")
    st, r = funcao("aluno-dia", R.L.token("w5p-aluna"), {"acao": "rotina_arquivar", "id": agua})
    rot = rotina(e, "Água 2 L") or {}
    o.ok(st == 200 and rot.get("arquivada") and rot.get("arquivada_por") == e["aluna"], f"P5 a aluna apaga a Água pela função (P8b): {st}; no banco arquivada por ela")
    t = R.tela(nav, "apagada")
    try:
        abrir_resumo(t, R, "w5p-personal", e["pac_a"], e["conta_a"])
        o.ok(not t.tem(f'[data-card-rotinas] [data-rotinas-hoje] [data-rotina-painel="{agua}"]'), "P5 o card não mostra mais a Água entre as de hoje")
        t.clicar("[data-rotinas-ver-tudo]")
        ok = t.esperar(lambda: t.tem(f'[data-rotina-apagada="{agua}"]'), 20)
        txt = t.texto(f'[data-rotina-apagada="{agua}"] [data-rotina-apagada-texto]')
        hoje_ddmm = f"{e['hoje'][8:10]}/{e['hoje'][5:7]}"
        o.ok(ok and txt == f"apagada pelo aluno em {hoje_ddmm}", f"P5 o 'Ver tudo': {txt!r}")
        R.print(t, "p_apagada_pelo_aluno")
        eventos = t.attr(f'[data-rotinas-historico] [data-rotina-evento]', "data-rotina-evento")
        mudancas = [x.strip() for x in t.pg.locator("[data-rotina-evento-mudanca]").all_inner_texts()]
        o.ok(eventos[:3] == ["arquivou", "mudou", "criou"] and "horário 10:00 → 11:00" in mudancas,
             f"P6 o histórico (o mais novo em cima): {eventos[:3]}; {mudancas[:2]}")
        t.pg.eval_on_selector("[data-rotinas-historico]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "p_historico")
    finally:
        t.fim()


def caso_outra_conta(o, nav, R: Rodada) -> None:
    """P7: o personal cria o Ômega 3 na conta A (pela função); o w13-dono na 2ª matrícula (conta B) não o vê nem o muda."""
    e = R.e
    st, r = funcao("aluno-dia", R.L.token("w5p-personal"), {"acao": "prof_rotina_salvar", "aluno": e["pac_a"],
                                                             "dados": {"nome": f"{e['marca']} Ômega 3", "tipo": "suplemento", "dias_semana": [1, 2, 3, 4, 5, 6, 7]}})
    omega = (r.get("rotina") or {}).get("id")
    o.ok(st == 200 and bool(omega), f"P7 o Ômega 3 do personal na conta A (pela função): {st}")
    b = B.Massa().segunda_matricula()
    tok = R.L.token("w13-dono")
    st1, r1 = funcao("aluno-dia", tok, {"acao": "prof_rotina_salvar", "aluno": b, "id": omega, "dados": {"horario": "07:00"}})
    st2, r2 = funcao("aluno-dia", tok, {"acao": "prof_rotina_arquivar", "aluno": b, "id": omega})
    o.ok((st1, r1.get("erro"), st2, r2.get("erro")) == (404, "nao_encontrado", 404, "nao_encontrado"),
         f"P7 a conta B não muda nem apaga a rotina da conta A: {st1} {r1.get('erro')} · {st2} {r2.get('erro')}")
    t = R.tela(nav, "conta-b")
    try:
        ok = abrir_resumo(t, R, "w13-dono", b, B.Massa().conta_do_dono("w13-dono"))
        cre = R.ids.get("creatina")
        o.ok(ok and t.tem(f'[data-rotina-painel="{cre}"]') and not t.tem(f'[data-rotina-painel="{omega}"]'),
             f"P7 a conta B vê a Creatina da aluna e NÃO vê o Ômega 3 da conta A ({estado_card(t)})")
        R.print(t, "p_rotinas_conta_b")
    finally:
        t.fim()


def semear_dia(o, R: Rodada, so_o_basico: bool = False) -> None:
    """P8 (a massa): a nutri libera; a aluna tira, põe, marca o ✓, cria a extra e põe na refeição temporária — que a nutri tira do plano."""
    e = R.e
    ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
    o.ok(ok, f"P8 a nutri libera a Dieta da A (no banco: {nivel_dieta(e)})")
    tok = R.L.token("w5p-aluna")
    st1, r1 = funcao("aluno-dia", tok, {"acao": "dia_tirar", "dia": e["hoje"], "item": e["item1"]})
    st2, r2 = funcao("aluno-dia", tok, {"acao": "dia_adicionar", "dia": e["hoje"], "dados": {"refeicao_id": e["r1"], "alimento_id": e["arroz"], "quantidade_g": 150}})
    st3, _r3 = funcao("nutricao", tok, {"acao": "aluno_marcar_refeicao", "refeicao_id": e["r1"], "data": e["hoje"], "concluida": True})
    o.ok((st1, st2, st3) == (200, 200, 200), f"P8 a aluna tira o último item da 1ª refeição, põe 150 g de arroz nela e dá o ✓ ({st1} {st2} {st3})")
    R.ids["posto"] = (r2.get("item") or {}).get("id", "")
    if so_o_basico:
        return
    hora = dt.datetime.now(SP).strftime("%H:%M")
    st4, r4 = funcao("aluno-dia", tok, {"acao": "extra_salvar", "dados": {"dia": e["hoje"], "nome": f"{e['marca']} Lanche", "horario": hora, "ja_comi": True}})
    extra = (r4.get("extra") or {}).get("id")
    st5, _r5 = funcao("aluno-dia", tok, {"acao": "dia_adicionar", "dia": e["hoje"], "dados": {"extra_id": extra, "alimento_id": e["arroz"], "quantidade_g": 80}})
    o.ok(st4 == 200 and bool(extra) and st5 == 200, f"P8 a extra '<marca> Lanche' (Já comi) com 80 g de arroz ({st4} {st5})")
    R.ids["extra"] = extra or ""
    # o retrato: uma refeição TEMPORÁRIA no plano (marcada), ela põe nela, a "nutri" tira a refeição do plano (o SET NULL + o retrato da P1)
    ceia = str(uuid.uuid4())
    e["ceia"] = ceia
    R.guardar()
    B.escrever(f"insert into {S}.refeicoes (id, plano_id, nome, horario, ordem) values ({B.txt(ceia)}, {B.txt(e['plano'])}, {B.txt(e['marca'] + ' Ceia')}, '22:00', 99)")
    st6, _r6 = funcao("aluno-dia", tok, {"acao": "dia_adicionar", "dia": e["hoje"], "dados": {"refeicao_id": ceia, "alimento_id": e["arroz"], "quantidade_g": 50}})
    B.escrever(f"delete from {S}.refeicoes where id = {B.txt(ceia)} and nome like {B.txt(e['marca'] + '%')}")
    r = B.ler(f"""select count(*) as n from {S}.aluno_dia_itens where dono_user_id = {B.txt(e['aluna'])} and criado_em >= {B.txt(e['inicio'])}
                   and refeicao_id is null and extra_id is null and refeicao_nome = {B.txt(e['marca'] + ' Ceia')} and deleted_at is null""")[0]
    o.ok(st6 == 200 and int(r["n"]) == 1, f"P8 a refeição temporária: ela pôs ({st6}); a nutri a tirou do plano → o item ficou com o retrato ({r['n']})")


def caso_dia_a_dia(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """P8 (a tela) + P9: a nutri abre Dieta › Dia a dia; trava a Dieta e a faixa aparece."""
    e = R.e
    t = R.tela(nav, "dia-a-dia")
    try:
        ok = abrir_dia_a_dia(t, R, "w5p-nutri")
        estado = (t.attr("[data-dia-a-dia]", "data-dia-a-dia") or [""])[0]
        conteudo = (t.attr("[data-dia-a-dia-conteudo]", "data-dia-a-dia-conteudo") or [""])[0]
        o.ok(ok and estado == "pronto" and conteudo == e["hoje"], f"P8 a nutri abre Dieta › Dia a dia: {estado}, o dia {conteudo} (hoje)")
        r1 = f'[data-dia-refeicao="{e["r1"]}"]'
        o.ok((t.attr(r1, "data-dia-refeicao-feita") or [""])[0] == "1"
             and (t.attr(f'{r1} [data-dia-item="{e["item1"]}"]', "data-dia-item-tirado") or [""])[0] == "1"
             and t.tem(f'{r1} [data-dia-posto="{R.ids.get("posto")}"]'),
             "P8 a 1ª refeição com o ✓, o item que ela tirou riscado e o arroz 'pelo aluno'")
        if not so_ler:
            o.ok((t.attr(f'[data-dia-extra="{R.ids.get("extra")}"]', "data-dia-extra-feita") or [""])[0] == "1"
                 and t.n(f'[data-dia-extra="{R.ids.get("extra")}"] [data-dia-posto]') == 1, "P8 a extra com 'Já comi' e o arroz dela")
            fora = f'[data-dia-fora="{e["marca"]} Ceia"]'
            o.ok(t.tem(fora) and t.texto(f"{fora} [data-dia-fora-selo]") == "refeição tirada do plano",
                 "P8 o retrato: a 'Ceia' que a nutri tirou do plano com 'refeição tirada do plano'")
        cre = R.ids.get("creatina")
        o.ok((t.attr(f'[data-dia-rotinas] [data-rotina-painel="{cre}"]', "data-rotina-feita") or [""])[0] == "1", "P8 as rotinas do dia: a Creatina feita")
        kc = [int(x or 0) for x in (t.attr("[data-dia-a-dia-total]", "data-kcal-comido") + t.attr("[data-dia-a-dia-total]", "data-kcal-plano"))]
        o.ok(len(kc) == 2 and kc[0] > 0 and kc[1] > 0, f"P8 o total comido × plano do dia: {kc[0] if kc else '?'} de {kc[1] if len(kc) > 1 else '?'} kcal")
        o.ok(not t.tem("[data-dia-a-dia-travada]") and not gravacoes_ao_abrir(t) and leituras(t, "aluno_dia") >= 1,
             f"P8 liberada (sem a faixa); ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'}), `ler` q=aluno_dia {leituras(t, 'aluno_dia')}")
        R.print(t, "p_dia_a_dia")
        if so_ler:
            return
        # P9 — a nutri trava: a faixa e o que ela registrou continua
        ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "ver")
        t.ir(f"/painel/alunos/{e['pac_a']}/dieta?secao=dia-a-dia")
        ok = ok and t.esperar(lambda: t.tem("[data-dia-a-dia-travada]"), 45)
        o.ok(ok and t.texto("[data-dia-a-dia-travada]") == TRAVADA and t.tem(f'[data-dia-posto="{R.ids.get("posto")}"]'),
             f"P9 travada: a faixa {t.texto('[data-dia-a-dia-travada]')!r} e o que ela registrou continua (§2.2-12)")
        t.pg.eval_on_selector("[data-dia-a-dia]", "e => e.scrollIntoView({ block: 'start' })")
        R.print(t, "p_dia_a_dia_travada")
    finally:
        t.fim()


def devolver_papeis() -> None:
    """Os papéis que a Massa trocou voltam JÁ (o resto da Massa — as matrículas — fica para o fim; o molde do telas_acessos.py da P4)."""
    m = B.Massa()
    for x in m.estado["papeis"]:
        lista = "array[" + ", ".join(B.txt(p) for p in x["antes"]) + "]::text[]"
        B.escrever(f"update {S}.conta_membros set papeis = {lista} where id = {B.txt(x['id'])}")
    m.estado["papeis"] = []
    m._guardar()  # noqa: SLF001


def caso_personal(o, nav, R: Rodada) -> None:
    """P10: o personal SÓ personal (a Massa tira o papel 'dono' do w5p-personal durante o caso — ele é dono e personal da conta A; o 'só o plano'
    da ficha é de quem é só personal; a volta vai ao estado ANTES): o Dia a dia embaixo da adesão, só para ler (Q1)."""
    e = R.e
    B.Massa().trocar_papeis("w5p-personal", "w5p-personal", ["personal"])
    t = R.tela(nav, "personal")
    try:
        ok = abrir_dia_a_dia(t, R, "w5p-personal", "")
        acesso = (t.attr("[data-aba-dieta-aluno]", "data-acesso-dieta") or [""])[0]
        ordem = t.pg.evaluate("""() => { const a = document.querySelector('[data-card="concluidas"]'), d = document.querySelector('[data-dia-a-dia]');
                                    return !!a && !!d && !!(a.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING); }""")
        o.ok(ok and acesso == "so-plano" and ordem, f"P10 o personal ({acesso}): o Dia a dia embaixo da adesão")
        o.ok(t.tem(f'[data-dia-posto="{R.ids.get("posto")}"]') and t.n("[data-secao-dieta-botao]") == 0,
             "P10 o mesmo dia (o arroz que ela pôs), sem as seções da nutri")
        t.pg.wait_for_timeout(1500)
        o.ok(not gravacoes_ao_abrir(t), f"P10 ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'})")
        R.print(t, "p_dia_a_dia_personal")
    finally:
        t.fim()
        devolver_papeis()


def caso_sem_login(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "sem-login")
    try:
        ok = abrir_resumo(t, R, "w5p-personal", e["sem_login"], e["conta_a"])
        o.ok(ok and estado_card(t) == "sem-login" and t.texto("[data-rotinas-sem-login]") == SEM_LOGIN and t.tem("[data-rotinas-acessos]")
             and not t.tem("[data-rotinas-nova]"), f"P11 sem login: {t.texto('[data-rotinas-sem-login]')!r} e o atalho para a aba Acessos")
        R.print(t, "p_rotinas_sem_login")
    finally:
        t.fim()


JS_LARGURA = "() => [document.documentElement.scrollWidth, window.innerWidth]"


def caso_celular(o, nav, R: Rodada) -> None:
    """P12: 390 px — o card do personal e o Dia a dia da nutri (cada um no seu contexto: a sessão entra antes do 1º documento)."""
    e = R.e
    t = R.tela(nav, "celular-card", desktop=False)
    try:
        ok = abrir_resumo(t, R, "w5p-personal", e["pac_a"], e["conta_a"])
        l1 = t.pg.evaluate(JS_LARGURA)
        R.print(t, "p_resumo_rotinas_celular")
    finally:
        t.fim()
    t = R.tela(nav, "celular-dia", desktop=False)
    try:
        ok2 = abrir_dia_a_dia(t, R, "w5p-nutri")
        l2 = t.pg.evaluate(JS_LARGURA)
        o.ok(ok and ok2 and l1[0] <= l1[1] + 1 and l2[0] <= l2[1] + 1, f"P12 390 px: o card ({l1[0]} × {l1[1]}) e o Dia a dia ({l2[0]} × {l2[1]}) cabem na tela")
        R.print(t, "p_dia_a_dia_celular")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: a conta de teste 'master' do Calc no aluno da conta 'Admin Teste' (o mesmo do telas_acessos.py), com a Guarda."""
    aluno = B.ler("""select coalesce(p.treino_user_id, p.id)::text as rota from public.pacientes p join public.contas c on c.id = p.conta_id
                      where c.dono_id = (select id from auth.users where email = 'admin.teste.claude@physiqcalc.app')
                        and p.deleted_at is null order by p.created_at limit 1""")
    if not o.ok(bool(aluno), "P0 produção: a conta de teste tem 1 aluno para abrir"):
        return
    rota = aluno[0]["rota"]
    guarda = B.Guarda()
    t = R.tela(nav, "prod", guarda=guarda)
    try:
        t.entrar(R.L, "master", f"/painel/alunos/{rota}")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: estado_card(t) not in ("", "carregando"), 90)
        t.pg.wait_for_timeout(2500)
        o.ok(ok and estado_card(t) != "erro" and leituras(t, "aluno_rotinas") >= 1 and not gravacoes_ao_abrir(t),
             f"P1 produção: o Resumo abre com o card Rotinas ({estado_card(t)}), só `ler` na aluno-dia ({leituras(t, 'aluno_rotinas')}); 0 gravação")
        if ok:
            t.pg.eval_on_selector("[data-card-rotinas]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "prod_p_resumo_rotinas")
        outras = [b for b in guarda.bloqueadas if b not in BARRADAS_ACEITAS]
        o.ok(not outras, f"P2 produção: nenhuma gravação tentada fora das conhecidas ({sorted(set(guarda.bloqueadas)) or '—'})")
    finally:
        t.fim()


def seco() -> int:
    raiz = Path(__file__).resolve().parents[2]
    falta = [f"{arq} › {x}" for arq, itens in NO_CODIGO.items() for x in itens
             if not (raiz / arq).exists() or x not in (raiz / arq).read_text(encoding="utf-8")]
    for f in falta:
        print("❌ falta no código:", f)
    total = sum(len(v) for v in NO_CODIGO.values())
    print(f"{total - len(falta)}/{total} seletores e textos do E2E no código")
    return 1 if falta else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", choices=sorted(BASES))
    ap.add_argument("--loja", action="store_true")
    ap.add_argument("--canal", default="msedge")
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    if a.base == "prod":
        return producao(a)
    B.usar_schema(S)
    if a.limpar:
        print("sobras depois de limpar:", limpar())
        return 0
    if not a.base:
        ap.error("--base local|staging|prod (ou --limpar / --seco)")
    prefixo = f"{a.base}{'-loja' if a.loja else ''}"
    o = C.Saida(f"telas_painel_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas do painel (rotinas e dia a dia)")
    agora = dt.datetime.now(SP)
    if agora.hour == 23 and agora.minute >= 30:
        raise SystemExit("perto da meia-noite de SP (o dia de hoje viraria no meio da rodada): rode depois das 00:05 — nada foi gravado")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    f = foto()
    R = Rodada(o, base, prefixo)
    R.pre = "loja_" if a.loja else ""
    R.e = {**f, "marca": f"{B.MARCA} P6 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat()}
    R.guardar()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            def rodar(fn, *args) -> None:
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(o, nav, R, *args)
                except Exception as ex:  # noqa: BLE001
                    o.ok(False, f"{fn.__name__}: {type(ex).__name__}: {str(ex)[:300]}")
                    caso = B5.ESTADO.get("caso")
                    if caso:
                        caso.diagnostico()
                finally:
                    nav.close()

            ok_build = {"v": False}

            def build(o_, nav, R_) -> None:
                ok_build["v"] = caso_build(o_, nav, R_, a.loja)

            rodar(build)
            if ok_build["v"]:
                semear_rotina_da_aluna(o, R)
                if a.loja:
                    semear_dia(o, R, so_o_basico=True)
                    for fn, args in ((caso_resumo_e_nova, (True,)), (caso_dia_a_dia, (True,)), (caso_personal, ())):
                        B.exigir_saude(fn.__name__)
                        rodar(fn, *args)
                else:
                    for fn in (caso_resumo_e_nova, caso_sino_e_app, caso_apagada_e_historico, caso_outra_conta):
                        B.exigir_saude(fn.__name__)
                        rodar(fn)
                    semear_dia(o, R)
                    R.e["sem_login"] = massa_sem_login(R)
                    R.guardar()
                    for fn in (caso_dia_a_dia, caso_personal, caso_sem_login, caso_celular):
                        B.exigir_saude(fn.__name__)
                        rodar(fn)
    finally:
        R.L.fechar(o)
        sobras = limpar(R.e)
        o.ok(all(v == 0 for v in sobras.values()), f"limpeza: as sobras da rodada {sobras}")
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


def producao(a) -> int:
    B.usar_schema("public")
    o = C.Saida("telas_painel_prod")
    R = Rodada(o, BASES["prod"], "prod")
    o.linha(f"base {R.base} · PRODUÇÃO, SÓ LEITURA (a Guarda no navegador) · canal {a.canal}")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                caso_prod(o, nav, R)
            except Exception as ex:  # noqa: BLE001
                o.ok(False, f"caso_prod: {type(ex).__name__}: {str(ex)[:300]}")
            finally:
                nav.close()
    finally:
        R.L.fechar(o)
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: As guardas e os vizinhos (todos verdes, nenhum editado)**

Run: `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh src/aluno-dia/semBancoDireto.test.ts src/nutricao/semLeituraDireta.test.ts src/nutricao/semGravacaoDireta.test.ts src/integrations/semBancoNoNavegador.test.ts src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts src/lib/consultasComErro.test.ts src/rotas/registro.test.ts src/rotas/usePreCarga.test.ts src/painel/aluno/catalogoAbas.test.ts src/painel/aluno/acessos/ListaDeAcessos.test.tsx src/painel/aluno/resumo/cardsW14.test.tsx src/painel/aluno/esqueletos.test.tsx src/rotas/Rotas.test.tsx src/rotinas/regras.test.ts src/aluno-dia/regras.test.ts`
Expected: `Test Files 16 passed (16)` · `Tests 219 passed (219)` — a `semBancoDireto` lendo as 3 pastas da P6 (0 achado), a `semLeituraDireta` intocada e verde (o card na área `painel-aluno`,
o `acesso.ts` na `dieta`), a `semBancoNoNavegador` sem achado novo, a casca (`Rotas.test`) abrindo o Resumo com o card a mais.

- [ ] **Step 3: Commit** — `test(w-a): o E2E de tela do painel (o card Rotinas — criar, mudar, o sino e o app, a apagada pelo aluno, o histórico, a conta B —, o dia a dia da nutri e do personal, travada, sem login, celular; produção só leitura)`
  com `e2e/wa/telas_painel.py`; `feita.sh 6 "E2E: --seco 56/56, compila; guardas <placar>" "<placar>"`.

---

### Task 7: A prova local completa (o que o CI roda + as provas da P6)

**Estimativa:** 35 min (calibrado 18–25 — a máquina; a 1ª rodada grande da parte local).

- [ ] **Step 1:** a `prova_local.sh` inteira num tmux (passa de 10 min; a fila é dividida com a LINUX 1): `bash ~/projetos/physiqcalc-scratch/w-a/p6/prova_tmux.sh`
  e conferir `tail -4 ~/projetos/physiqcalc-scratch/w-a/p6/prova-saida.txt` até `PROVA-FIM rc=0` (~17–25 min; com a fila livre). **Ou** em partes de menos de 10 min
  (os MESMOS passos e saídas), cada uma depois de `bash ~/projetos/physiqcalc-scratch/w-a/p6/prova_partes.sh fila`: `bash ~/projetos/physiqcalc-scratch/w-a/p6/prova_partes.sh a` ·
  `… vitest 1` · `… vitest 2` · `… vitest 3` · `… vitest 4` · `… c` · `… fim` (o teto de cada fatia conta depois de pegar a fila).
  Expected (a linha `fim`): `lint=0 tipos=0 definer=0 test-node=0 vitest=0 build=0 chunks=0 seco=0 compila=0` e o `git status --short` vazio. O Vitest inteiro sem
  falha (no ensaio: 436 arquivos, 6.163 testes, 0 falha — a `main` do dia tem mais: a P5 e o que entrou depois); o `checar-chunks` sem pesado novo (o card e o Dia a dia em pedaços
  próprios). Uma fatia com `rc=124` = o teto de 560 s depois de pegar a fila (a máquina carregada) → refazer só ela. **Intermitente conhecido, de fora da P6:**
  `src/painel/configuracoes/Recebimento.test.tsx` › "Conectar no APK…" (o ouvinte `browserFinished` da W2) falhou 1 vez no ensaio da P5 com a máquina carregada e
  passou sozinho (33/33) → refazer a fatia; se repetir, rodar o arquivo sozinho e anotar no `progresso.log` (não é da P6). Vermelho → a causa (o `prova-<passo>.txt`),
  corrigir na task dela, commit, de novo.
- [ ] **Step 2:** `feita.sh 7 "prova local: <a linha fim>" "<os placares>"` e a marca `~/projetos/physiqcalc-scratch/w-a/p6/PRONTO-PARA-STAGING` (o HEAD, as Tasks 0–7, o
  que esperar: o "livre" da LINUX 1 para o BANCO da Task 8).

---

### Task 8: E2E de tela LOCAL (5173 — o build de staging; site e loja) + os prints

**Estimativa:** 55 min (calibrado 25–45). **🔒 BANCO do staging** (o E2E muda os acessos da Dieta, os ✓ de hoje e o dia da matrícula A, cria rotinas e — por ~1 s —
uma refeição temporária no plano dela; tudo volta). **Espera o "livre" da LINUX 1** (a 21c pode estar no BANCO: publicar a `conta`, a `nutricao` e a `financeiro`
+ os E2E dela).

- [ ] **Step 1: A trava** — `bash ~/projetos/physiqcalc-scratch/w-a/p6/travas.sh`; o quadro "🔒 BANCO do staging: LINUX 3 desde HH:MM (W-A P6: telas local na 5173,
  ~35 min)" + `SendMessage` + esperar o "pode ir"; `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p6/saude.py "as telas locais"` → 0;
  `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p6/massa_p6.py` → True.
- [ ] **Step 2: O site no 5173** — `bash ~/projetos/physiqcalc-scratch/w-a/p6/preview.sh site` → `physiq-distribuicao" content="site"` e o `health.json` com
  `"schema":"staging"`. (A 5173 ocupada → PARAR: não derrubar o que não é seu.)
- [ ] **Step 3: O E2E do site (no tmux — passa de 10 min)** — `bash ~/projetos/physiqcalc-scratch/w-a/p6/e2e_local.sh site` e conferir
  `tail -5 ~/projetos/physiqcalc-scratch/w-a/p6/e2e-local-site.txt` até `E2E-FIM rc=0`.
  Expected: `≈ 40/40 ok` (P0 · a Creatina semeada · P1 ×3 · P2 ×3 · P3 · P4 ×2 · P5 ×3 · P6 · P7 ×3 · P8 ×11 (a massa 4 + a tela 7) · P9 · P10 ×3 · P11 · P12 · os 4
  logouts locais das sessões do teste — a w5p-aluna, a w5p-personal, o w13-dono e a w5p-nutri — · a limpeza com as sobras 0; o placar exato sai da 1ª rodada boa). Falhou →
  o print de diagnóstico, a causa; o `--limpar` (`python3 e2e/wa/telas_painel.py --limpar` → as sobras 0) antes de rodar de novo. Um caso que depende de um anterior
  (P3–P6 do P2; P9 do P8) falha junto — corrigir o 1º. Falha de seletor/tempo = do TESTE (corrigir no E2E, commit); falha da tela = da task dela (o Vitest da tela
  primeiro).
- [ ] **Step 4: Os prints (Read em cada um)** — `~/projetos/physiqcalc-scratch/prints/w-a/p6/local/`: `p_resumo_rotinas_1280.png` (o card com a Creatina feita e o selo
  "do aluno"), `p_nova_rotina_1280.png` (a folha do profissional preenchida), `p_sino_aluno_390.png` (o sino da aluna com o aviso), `p_apagada_pelo_aluno_1280.png` (o
  "Ver tudo" com "apagada pelo aluno em dd/mm"), `p_historico_1280.png` (criou, mudou — "horário 10:00 → 11:00" —, apagou), `p_rotinas_conta_b_1280.png`,
  `p_dia_a_dia_1280.png` (a 1ª refeição com o ✓, o riscado, o "pelo aluno", a extra, a "refeição tirada do plano", o total e as rotinas), `p_dia_a_dia_travada_1280.png`
  (a faixa), `p_dia_a_dia_personal_1280.png` (embaixo da adesão), `p_rotinas_sem_login_1280.png`, `p_resumo_rotinas_celular_390.png` e `p_dia_a_dia_celular_390.png`.
  Tela errada, "carregando", login → refazer o caso.
- [ ] **Step 5: A loja** — `bash ~/projetos/physiqcalc-scratch/w-a/p6/preview.sh loja` (→ `content="play"`) e `bash ~/projetos/physiqcalc-scratch/w-a/p6/e2e_local.sh loja`
  → `E2E-FIM rc=0` e `≈ 20/20 ok` (P0 ×2 · a Creatina · a massa básica ×2 · P1 ×3 · P8 ×5 · P10 ×3 · os 3 logouts · a limpeza); os prints `local-loja/loja_p_resumo_rotinas_1280.png`,
  `loja_p_dia_a_dia_1280.png`, `loja_p_dia_a_dia_personal_1280.png` (Read). Depois `bash ~/projetos/physiqcalc-scratch/w-a/p6/preview.sh parar`.
- [ ] **Step 6: Soltar** — `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p6/massa_p6.py` → True (as sobras 0; a Dieta da A em "ver"; nenhuma
  refeição temporária). 🔓 + "livre". `feita.sh 8 "telas local: site <n>/<n>, loja <n>/<n>; prints conferidos" "<placares>"`.

---

### Task 9: A `main` do dia — o drift da `main`, o rebase e a prova local de novo

**Estimativa:** 30 min (calibrado 15–25; só se a `main` andou depois da Task 0 — a 21c ou outra; a ESPERA não conta).

- [ ] **Step 1: A `main` andou?** — `cd ~/projetos/physiqcalc-wa-p6 && git fetch origin && git log --oneline HEAD..origin/main | head` → vazio = pular para o Step 5 (sem
  rebase, sem prova de novo). Com commits → os Steps 2–4.
- [ ] **Step 2: O que a `main` mudou nos arquivos da P6** — `cd ~/projetos/physiqcalc-wa-p6 && bash ~/projetos/physiqcalc-scratch/w-a/p6/drift.sh --main`
  Expected: os 4 arquivos "igual" (a 21c não toca nenhum) → `rc=0`; as contagens de commits novos nos arquivos do contrato (o `src/nutricao/semLeituraDireta.test.ts` e o
  `src/integrations/semBancoNoNavegador.test.ts` podem ter da 21c — a guarda roda de novo na prova; o `docs/e2e-rodadas.md` terá: o topo — juntar no rebase).
- [ ] **Step 3: O rebase (a branch ainda não está no GitHub)** — `cd ~/projetos/physiqcalc-wa-p6 && git fetch origin && git rebase origin/main` → "Successfully rebased"
  (conflito → resolver juntando, `git add <arq>`, `git rebase --continue`; nunca descartar o lado da LINUX 1).
- [ ] **Step 4: A prova local de novo** — como na Task 7 (`bash ~/projetos/physiqcalc-scratch/w-a/p6/prova_tmux.sh` → `PROVA-FIM rc=0`; ou as partes) → a linha `fim`
  toda 0 e o `git status --short` vazio.
- [ ] **Step 5:** `feita.sh 9 "main do dia <sha> (rebase: sim/não); prova local: <a linha fim>" "<placares>"`.

---

### Task 10: STAGING (🔒 git + BANCO): push ff no `staging`, a Vercel, o E2E de staging e as regressões

**Estimativa:** 45 min (calibrado 25–40). **Espera o "livre" da LINUX 1** (git e BANCO).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p6 fetch origin && git -C ~/projetos/physiqcalc-wa-p6 merge-base --is-ancestor origin/main HEAD && git -C ~/projetos/physiqcalc-wa-p6 merge-base --is-ancestor origin/staging HEAD && echo ok-ff`
  → `ok-ff`. A `main` andou → a Task 9 de novo (Steps 2–4). O `staging` tem commit que a `main` não tem → PARAR (alguém está no staging: o quadro).
- [ ] **Step 2: As travas** — o quadro "🔒 git staging/main + BANCO do staging: LINUX 3 desde HH:MM (W-A P6: push ff no staging + E2E de staging + regressões, ~45 min)"
  + `SendMessage` + esperar o "pode ir".
- [ ] **Step 3: O push e a Vercel** — `git -C ~/projetos/physiqcalc-wa-p6 push origin HEAD:staging && git -C ~/projetos/physiqcalc-wa-p6 rev-parse --short=7 HEAD`
  → o sha; `bash ~/projetos/physiqcalc-scratch/w-a/p6/esperar_vercel.sh <sha>` → "o staging serve <sha>".
- [ ] **Step 4: O E2E de staging (um por vez, o `/health` antes)** — `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p6/saude.py "as telas no staging"`
  e `bash ~/projetos/physiqcalc-scratch/w-a/p6/e2e_tmux.sh staging e2e/wa/telas_painel.py --base staging --canal msedge` → `tail -5 ~/projetos/physiqcalc-scratch/w-a/p6/e2e-staging.txt`
  até `E2E-FIM rc=0` e o placar do local; os prints em `prints/w-a/p6/staging/` (Read).
- [ ] **Step 5: As regressões (o `saude.py` antes de cada uma)** — (a) `bash ~/projetos/physiqcalc-scratch/w-a/p6/e2e_tmux.sh w16 e2e/w16/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging --casos secoes`
  → `E2E-FIM rc=0` com "[secoes] as 8 seções" ✅ (a família w16; o resto do caso segue igual); (b) `bash ~/projetos/physiqcalc-scratch/w-a/p6/e2e_tmux.sh acessos e2e/wa/telas_acessos.py --base staging --canal msedge`
  → `E2E-FIM rc=0` (a aba Acessos da P4 com o card Rotinas existindo; sobras 0). Falha numa verificação que a P6 mudou = corrigir (na task dela, commit, push ff,
  de novo); numa verificação velha de fora da P6 = anotar na obs. das rodadas, sem corrigir (a prova de controle na `main`, como a P4 fez, se houver dúvida).
- [ ] **Step 6: Soltar** — `massa_p6.py` → True; o quadro com as travas livres + "livre" (o git volta a ser pedido na Task 12).
  `feita.sh 10 "staging <sha>: telas <placar>; w16 secoes <placar>; telas_acessos <placar>; prints conferidos; sobras 0" "<placar>"`.

---

### Task 11: As rodadas + a entrada da W-A + PR + CI

**Files:** Modify `docs/e2e-rodadas.md` (a entrada da W-A na "Rotina do fim de cada worktree" + o topo da tabela "## Rodadas"); fora: `pr-p6.md`.
**Estimativa:** 25 min (calibrado 8–15).

- [ ] **Step 1: A entrada da W-A** — `cd ~/projetos/physiqcalc-wa-p6 && git apply ~/projetos/physiqcalc-scratch/w-a/p6/patches/T11-entrada.patch` (não aplicou — a "Rotina"
  mudou → pôr o parágrafo à mão, logo depois do item 2, pelo bloco abaixo).

`~/projetos/physiqcalc-scratch/w-a/p6/patches/T11-entrada.patch`:
```diff
diff --git a/docs/e2e-rodadas.md b/docs/e2e-rodadas.md
index 7bd9285..36037d3 100644
--- a/docs/e2e-rodadas.md
+++ b/docs/e2e-rodadas.md
@@ -20,6 +20,12 @@ a mais nova em cima. Sem dado pessoal e sem segredo (só o nome do script, a bas
 2. **Da família que a worktree tocou** (criam massa no staging e limpam): `h5` (cadastro/agenda) · `w11` (diário/dieta) · `w15`
    (treinos do admin) · `w16` (nutri/membros) · `w18` (clínicos/anexos) · `w20` (agenda) · `w21` (pré-consulta) · `w23` (modelos) ·
    `w24` (diário/dietas) · `w26` (lixeira). Rodar o `api.py` da família e o `telas.py` correspondente.
+   **W-A** (acessos do aluno, rotinas, dieta liberada, o painel das rotinas e do dia a dia — `e2e/wa/`): `wa/api.py` (as 3 funções, por
+   papel; `--so-leitura` na produção) e o `telas_*.py` da tela tocada — `telas_acessos.py` (a aba Acessos), `telas_rotinas.py` (as rotinas no
+   app), `telas_dieta.py` (a Dieta liberada no app), `telas_painel.py` (o card Rotinas do Resumo e o Dia a dia da Dieta da ficha); cada um com
+   `--base local|staging|prod` (prod SÓ LEITURA), `--loja`, `--seco` e `--limpar` (a massa leva a marca "WA E2E"; as sobras têm de dar 0;
+   `python3 e2e/wa/_base.py --limpar` desfaz a Massa compartilhada). O `wa/sql_wa.py` (o banco) e o `wa/apk_rotinas.py` (o aparelho) só
+   quando a parte mexe neles.
 3. **Fora da rotina** (só com a massa do dono da worktree, e sabendo o que fazem): os que criam massa e NÃO limpam — `h4`, `w06`,
    `w07b`, `w13`, `w27`, `w28` (os 3 do Mercado Pago usam o sandbox).
 4. **Nunca na rotina** (escrevem em produção): `--schema public` do `w08b`, `w20c` e `w14`; `*/prova_real.py`; `w07b/smoke_prod.py`;
```

- [ ] **Step 2: As linhas** — `cd ~/projetos/physiqcalc-scratch/w-a/p6 && python3 rodadas_p6.py --p5-desde "<a hora do squash da P5, da T10-FEITA dela: AAAA-MM-DD HH:MM>"`
  → as linhas da P6 (local site/loja, staging, as regressões) e as de produção da P5 depois do merge dela (`telas_dieta --base prod`, `telas_rotinas --base prod`,
  `w07/smoke_prod.py`, `api.py --so-leitura`); colar logo abaixo da linha `|---|---|…` da "## Rodadas", completando as obs. com o que as `T<N>-FEITA` dizem. Commit:
  `cd ~/projetos/physiqcalc-wa-p6 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(e2e): a entrada da W-A e as rodadas da P6 (e as de produção da P5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/e2e-rodadas.md`
- [ ] **Step 3: O corpo do PR** — `~/projetos/physiqcalc-scratch/w-a/p6/pr-p6.md`: o que entra (o card Rotinas no Resumo — as de hoje com o ✓ do aluno, nova rotina,
  mudar/apagar as de profissional desta matrícula, ver tudo com as apagadas e o histórico; o Dia a dia na aba Dieta da ficha — a nutri na seção nova, o personal
  embaixo da adesão; o E2E novo; a entrada da W-A no `docs/e2e-rodadas.md`); o que NÃO muda (migration, função — a `aluno-dia` da P2 já fazia tudo —, o app do aluno,
  as guardas da hml-20/21 — intocadas e verdes); as decisões técnicas (a lista do topo), os defeitos da spec 1–10 e a Q6a (com a recomendada); as provas (local + loja,
  staging, as regressões, os prints); a volta (reverter o squash: o card e o Dia a dia somem do painel; nada no banco muda); **a W-A só com a P7 (a Política) pela
  frente**; e no fim `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 4: Push da branch e PR (a `main` não pode ter andado)** —
  `cd ~/projetos/physiqcalc-wa-p6 && git fetch origin && git merge-base --is-ancestor origin/main HEAD && git push -u origin feat/w-a-p6-painel-rotinas && gh pr create --repo weslleybertoldo/physiqcalc --base main --head feat/w-a-p6-painel-rotinas --title "W-A P6: o card Rotinas no Resumo do aluno e o Dia a dia na aba Dieta da ficha (a nutri e, só para ler, o personal)" --body-file /home/bertoldo/projetos/physiqcalc-scratch/w-a/p6/pr-p6.md || echo "PAROU: a main andou ou o push/PR falhou (ver acima)"`
  → a URL do PR. A `main` andou depois do push no `staging` → `git merge origin/main` na branch (nunca rebase + força depois de publicada) + a prova local
  (`prova_partes.sh a` + as 4 fatias, sem o build) + push.
- [ ] **Step 5: O CI** — `gh pr checks <n> --repo weslleybertoldo/physiqcalc --watch` → `checar-pr` ✅ (lint, tipos, `checar-definer`, `test:node`, Vitest, build +
  `checar-chunks`) e o preview da Vercel ✅. Vermelho → `gh run view <id> --log-failed | tail -60`, corrigir, commit, push (sem forçar).
- [ ] **Step 6:** `feita.sh 11 "PR #<n>; CI verde" "<link>"`.

---

### Task 12: Merge → release → bump → `staging` = `main` → smoke SÓ LEITURA na produção

**Estimativa:** 35 min (calibrado 20–30; as esperas do CI não contam). **Espera o "livre" da LINUX 1** (git).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p6 fetch origin && git -C ~/projetos/physiqcalc-wa-p6 merge-base --is-ancestor origin/main HEAD && echo main-ok`
  e `gh pr list --repo weslleybertoldo/physiqcalc --state open` (1 PR por vez).
- [ ] **Step 2: A trava** — o quadro "🔒 git staging/main: LINUX 3 desde HH:MM (W-A P6: merge, release, staging = main por lease)" + `SendMessage` + o "pode ir"
  (que vale também para o realinhar — a condição (a)).
- [ ] **Step 3: Merge** — `gh pr merge <n> --repo weslleybertoldo/physiqcalc --squash --delete-branch` → `git -C ~/projetos/physiqcalc-wa-p6 fetch origin && git -C ~/projetos/physiqcalc-wa-p6 log origin/main -1 --format='%h %an <%ae> %s'`
  = o squash "W-A P6: … (#<n>)" do `Weslley Bertoldo <55102421+weslleybertoldo@users.noreply.github.com>` (anotar o sha e a hora em UTC — o `--desde` do smoke).
- [ ] **Step 4: O CI da `main`** — `gh run list --repo weslleybertoldo/physiqcalc --branch main --limit 3` → `gh run watch <id> --repo weslleybertoldo/physiqcalc`
  → a release `Physiq v3.1xx` com o APK e o `chore: bump version to v3.1xx [skip ci]` (NUNCA bumpar à mão); `curl -s https://physiqcalc.com.br/health.json`
  com a versão da release e o commit do squash. Deploy com `git_info_fail` → `POST /v13/deployments` (o caminho de sempre).
- [ ] **Step 5: Realinhar `staging` = `main` (as 3 condições do quadro)** — (a) o "pode ir" do Step 2; (b)
  `bash ~/projetos/physiqcalc-scratch/w-a/p6/realinhar_confere.sh <sha do squash>` → os commits no staging que a main não tem = SÓ os da branch da P6, a árvore do
  staging × a do squash VAZIA (ou só as linhas das rodadas — o mesmo da P4) e o `STAGING_SHA=…`; (c) ISOLADO: `git -C ~/projetos/physiqcalc-wa-p6 push origin origin/main:staging --force-with-lease=staging:<STAGING_SHA>`.
  Qualquer coisa fora disso → PARAR e combinar (nada de força).
- [ ] **Step 6: O smoke SÓ LEITURA (a Guarda)** — `bash ~/projetos/physiqcalc-scratch/w-a/p6/smoke_prod.sh <3.1xx> <ISO UTC do merge>` → `tail -12 ~/projetos/physiqcalc-scratch/w-a/p6/smoke-prod.txt`
  até `SMOKE-FIM`: `telas_painel --base prod` `4/4` (P0 o aluno; P1 o Resumo com o card Rotinas, só `ler` na aluno-dia; P2 nenhuma gravação tentada fora das conhecidas;
  o logout local)
  · `telas_acessos --base prod` (a aba Acessos — a dica das rotinas agora aponta para o card) · `w07/smoke_prod.py telas` · `api.py --so-leitura --desde <ISO>` (as funções
  da W-A sem 5xx; o q=`aluno_rotinas` lido) — todos `rc=0`; o print `prints/w-a/p6/prod/prod_p_resumo_rotinas_1280.png` (Read; dados de conta de teste — não mandar ao
  Weslley se aparecer dado de aluno real).
- [ ] **Step 7: "Pode voltar"** — `SendMessage` à LINUX 1 com o sha da `main`, a release, "git livre" e "a 21c/21e pode rebasear em cima da P6"; o quadro com a trava
  livre. `feita.sh 12 "squash <sha> (#<n>); release v3.1xx; bump; staging = main por lease; smoke prod <placares>" "<placares>"`.

---

### Task 13: Fechar

**Estimativa:** 15 min (calibrado 5–10). (O que é do coordenador — quadro, foto, Validação, memória — quem executa só anota no `progresso.log`.)

- [ ] O quadro: a linha da W-A com "✅ P6 EM PRODUÇÃO HH:MM (PR #…, squash `…`, release v3.1xx, bump …); local + loja, staging + as regressões, produção SÓ LEITURA;
  0 sobra" e as travas livres; **a P7 (a Política) reserva o que for dela**.
- [ ] A foto: o JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-acessos-do-aluno.json` (P6 `feito`, `duracao_min`, tag `PR #… · v3.1xx`)
  → `python3 ~/.claude/skills/Skill-wbs-ciclo-de-implementação-autonoma/andamento_worktrees.py <json> <pasta> --atual` → Read do PNG → tópico.
- [ ] O resumo no grupo Validação (`remoto_validacao`, tópico do Physiq) com os prints (`p_resumo_rotinas`, `p_nova_rotina`, `p_apagada_pelo_aluno`, `p_historico`,
  `p_dia_a_dia`, `p_dia_a_dia_personal`, `p_sino_aluno` — os do staging): o que entrou, os placares, os defeitos da spec, a Q6a (com a recomendada), o que vem (P7).
- [ ] A memória do projeto (Physiq): "W-A P6 em produção (data, PR, versão); Q6a aberta (recomendada: o plano atual); P7 a seguir".
- [ ] `claude-orfaos.sh` (órfã → perguntar); nada de pé: `tmux ls` sem `wa-p6-*`, `ss -ltn | grep -E ":5173 "` vazio. A limpeza de `p6/` (caminhos literais):
  `rm -r /home/bertoldo/projetos/physiqcalc-scratch/w-a/p6/ensaio` e `rm -r /home/bertoldo/projetos/physiqcalc-scratch/w-a/p6/ensaio2` (as cópias do ensaio do plano, se
  ainda existirem). A worktree: `git -C ~/projetos/physiqcalc-wa-p6 status --short` vazio → remover SÓ quando nenhuma sessão estiver dentro dela:
  `git -C ~/projetos/physiqcalc worktree remove ~/projetos/physiqcalc-wa-p6 && git -C ~/projetos/physiqcalc branch -D feat/w-a-p6-painel-rotinas`
  (a remota saiu no merge). `feita.sh 13 "fechada" "<o que foi limpo>"`.

---

## Riscos (e o que segura cada um)

1. **As esperas** (a P5 em produção para a Task 0; o "livre" da LINUX 1 para as Tasks 8, 10 e 12 — a 21c no BANCO ou no git): o código parado não estraga; a Task 9
   refaz a prova em cima da `main` do dia. Inverter a ordem com a 21c é do coordenador com a LINUX 1 (nenhum arquivo em comum fora do topo do `docs/e2e-rodadas.md`).
2. **O E2E mexe na matrícula A da w5p-aluna** (os acessos da Dieta, os ✓ de hoje, o dia, as rotinas) **e no plano dela** (a refeição temporária, ~1 s): a foto vai ao
   estado ANTES; tudo volta no fim e no `--limpar` (a refeição temporária também, pelo nome com a marca); a trava do BANCO (nenhum E2E da LINUX 1 nem a publicação da
   `nutricao` ao mesmo tempo); o `massa_p6.py` confere antes e depois.
3. **O aviso do sino é 1 por dia** ("Seu profissional criou uma rotina para você"): se outra rodada de hoje já o criou, o P2 aceita ≥ 1; a limpeza só apaga os da rodada.
4. **A 21c republicando a `nutricao`** (o plano e os ✓ do Dia a dia vêm por ela): nenhum E2E da P6 com a publicação no meio — o aviso antes de cada E2E.
5. **A fila do pesado dividida** (o ensaio viu o Vitest inteiro de outra sessão segurar ~13 min): o `prova_partes.sh fila` antes de cada parte; o teto de cada fatia
   conta só depois de pegar a fila.
6. **O E2E no staging travando o Treino de produção** (incidente de 10/10): um por vez, o `/health` antes de cada caso e de cada regressão (a P6 quase não toca o Treino:
   só o login).
7. **Perto da meia-noite de SP** (o dia de hoje viraria no meio da rodada): o E2E para (23:30+); rodar depois das 00:05.
8. **Q6a sem resposta:** vale a recomendada (o plano atual); se ele escolher "o plano de cada dia", é uma parte pequena depois (o servidor diz o plano do dia).

## Self-review (feito ao escrever; o código do plano rodou num ENSAIO fora do repo e foi refeito numa 2ª cópia limpa — nada no repo, no banco, na borda nem no registro oficial)

- **Cobertura da spec (§4.5, §4.7, §5.2, §5.3, §6 P6) e do mestre §3 › P6:** o card "Rotinas" no Resumo para todo aluno (decisão 2; o lugar 7 da P4) com as de hoje e o
  ✓ do aluno, só leitura (decisão 3; Vitest; P1 `p_resumo_rotinas`), "Nova rotina" pela folha da P3 que avisa o aluno no sino (decisão 5; P2 `p_nova_rotina`, P4
  `p_sino_aluno` — e aparece no app), mudar/apagar só as de profissional desta matrícula (decisão 5; Vitest; P3), "Ver tudo" com as apagadas — "apagada pelo aluno em …"
  — e o histórico (decisão 6; P5 `p_apagada_pelo_aluno`, P6 `p_historico`), sem login (decisão 2; P11), a conta B não muda a da conta A (o servidor; P7 — 404 e não vê);
  o "Dia a dia" na aba Dieta da ficha (decisão 8; Vitest da aba) com os 14 dias, os itens do plano riscados, os postos "pelo aluno" com os macros, o ✓, as extras, o
  total comido × plano, as rotinas do dia e o retrato da refeição tirada do plano (decisões 9–12; Vitest; P8 `p_dia_a_dia`), a faixa travada (P9), vazio (Vitest), o
  personal só para ler embaixo da adesão (decisão 8; Vitest; P10 `p_dia_a_dia_personal`); os 7 prints do mestre (+ travada, conta B, sem login e os 2 de celular).
- **Sem "TBD":** todo arquivo novo está inteiro no plano (e em `p6/codigo/`, com o md5); toda edição é um `diff` que aplica (o `drift.sh` confere; o ensaio 2 aplicou
  todos em ordem e reproduziu o ensaio byte a byte); os únicos valores do dia são os do ambiente (o sha, o nº do PR e da release, a hora combinada, a hora do squash
  da P5) — lidos na hora, escritos no comando seguinte; o placar exato do E2E sai da 1ª rodada boa (o E2E não rodou contra o staging no ensaio — de propósito).
- **Nomes consistentes:** os `data-*` do E2E são os das telas (`--seco` 56/56); as funções da P2 com as assinaturas de `src/aluno-dia/api.ts`; a frase do "sem login"
  a de `MENSAGEM_ERRO_ALUNO_DIA.sem_login_do_aluno` (o teste confere); as chaves (`painel-rotinas`, `painel-dia-a-dia`) iguais nas consultas e nos "relê".
- **Os pontos de encontro só por acréscimo** (o topo e o parágrafo da W-A no `docs/e2e-rodadas.md`); nada da hml-21 editado; nenhuma função, migration, guarda ou
  lista de funções mudou.
- **Contra o diálogo de permissão:** nenhum comando do plano usa `bash -c`, `sh -c`, subshell com `time`, `eval` nem `$(…)` na linha; o que é complexo está em script
  (`p6/*.sh`, `p6/*.py`); os `rm` com caminho literal.
- **A fila do pesado:** as tasks de código rodam só os arquivos delas (≤ 1 min cada); as rodadas grandes só nas Tasks 7 e 9 e nos E2E (cada uma na fila).

---

## Apêndice A — os scripts de apoio (já em `~/projetos/physiqcalc-scratch/w-a/p6/`; se faltar algum, recriar daqui)

`~/projetos/physiqcalc-scratch/w-a/p6/log.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 — acrescenta "HH:MM | <texto>" no progresso.log da P6 (sem $(…) na linha de comando de quem chama).
# uso: bash ~/projetos/physiqcalc-scratch/w-a/p6/log.sh "T3 | ✅ verde"
set -euo pipefail
printf '%s | %s\n' "$(date +%H:%M)" "${1:?texto}" >> /home/bertoldo/projetos/physiqcalc-scratch/w-a/p6/progresso.log
tail -1 /home/bertoldo/projetos/physiqcalc-scratch/w-a/p6/progresso.log
```

`~/projetos/physiqcalc-scratch/w-a/p6/feita.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 — grava a marca T<N>-FEITA (1ª linha com a hora de agora) e a linha no progresso.log.
# uso: bash feita.sh <N> "<resumo de 1 linha para o progresso>" "<linha 1 da marca>" ["<linha 2>" …]
set -euo pipefail
n="${1:?N}"; resumo="${2:?resumo}"; shift 2
pasta=/home/bertoldo/projetos/physiqcalc-scratch/w-a/p6
{ printf 'T%s FEITA %s\n' "$n" "$(date +%H:%M)"; for l in "$@"; do printf '%s\n' "$l"; done; } > "$pasta/T$n-FEITA"
printf '%s | T%s | ✅ %s\n' "$(date +%H:%M)" "$n" "$resumo" >> "$pasta/progresso.log"
tail -1 "$pasta/progresso.log"
```

`~/projetos/physiqcalc-scratch/w-a/p6/vitest.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 — o Vitest na fila do pesado, com 2 workers e o TMPDIR do scratch, na worktree da P6.
# uso: bash vitest.sh <arquivos de teste…>   (sem arquivo: o repo inteiro — só na prova local, Tasks 7 e 9)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
cd "${P6_W:-$HOME/projetos/physiqcalc-wa-p6}" || exit 9  # P6_W: só o ensaio do plano usa
if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
flock "$P" npx vitest run --maxWorkers=2 "$@"
```

`~/projetos/physiqcalc-scratch/w-a/p6/copiar.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 — põe na worktree os arquivos NOVOS da P6 a partir das cópias conferidas (p6/codigo/, o ensaio do plano: os mesmos blocos do
# plano). Não sobrescreve arquivo que já existe e confere o md5 de cada cópia (codigo.md5).
# uso: bash copiar.sh <caminho no repo> [<caminho no repo> …]     ex.: bash copiar.sh src/painel/aluno/rotinas/regras.test.ts
set -u
W="${P6_W:-$HOME/projetos/physiqcalc-wa-p6}"  # P6_W: só o ensaio do plano usa (a cópia fora do repo)
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
rc=0
for f in "$@"; do
  if [ ! -f "$S/codigo/$f" ]; then echo "SEM CÓPIA: $f"; rc=1; continue; fi
  esperado=$(grep " codigo/$f\$" "$S/codigo.md5" | cut -d' ' -f1)
  atual=$(md5sum "$S/codigo/$f" | cut -d' ' -f1)
  if [ "$esperado" != "$atual" ]; then echo "CÓPIA MUDOU depois do plano: $f (conferir com o bloco do plano)"; rc=1; continue; fi
  if [ -e "$W/$f" ]; then echo "JÁ EXISTE na worktree (não sobrescrevo): $f"; rc=1; continue; fi
  mkdir -p "$W/$(dirname "$f")"
  cp "$S/codigo/$f" "$W/$f"
  echo "copiado: $f"
done
exit $rc
```

`~/projetos/physiqcalc-scratch/w-a/p6/drift.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 0, e de novo na Task 9 antes do rebase na main do dia) — o "drift": o que o plano usa ainda é o que era ao escrevê-lo (o HEAD da
# P5 99f48b7 = a main 7a59930 v3.117 + a P5)? Só leitura.
# 1) os 4 arquivos que a P6 EDITA iguais aos de p6/orig (o retrato da 99f48b7) e os patches das edições aplicam (--check), com o da entrada da
#    W-A no docs/e2e-rodadas.md (a tabela de cima cresce a cada PR: só o --check);
# 2) o contrato da P2 que o painel usa (src/aluno-dia/{api,tipos,regras}.ts; as leituras do profissional no _shared/aluno-dia-regras.ts) e a P3
#    (a folha da rotina com o modo do profissional, a linha e os textos);
# 3) as peças da ficha que a P6 só importa (as consultas do plano e dos ✓, a adesão, o modo só leitura, o catálogo com o lugar do CardRotinas);
# 4) as guardas que a P6 encontra (a P6 NÃO edita nenhuma): a da W-A (as 3 pastas da P6 já na lista), a da hml-20 (o Resumo na área
#    painel-aluno; a lib do editor na área dieta) e a do navegador da hml-21a; 5) nenhum arquivo NOVO da P6 já existe.
# uso: bash drift.sh          (Task 0, antes de codar: a worktree × p6/orig; saída 0 = nada mudou; 1 = conferir e ajustar ANTES de codar)
#      bash drift.sh --main   (Task 9, antes do rebase: a origin/main do momento × p6/orig — o que a 21c (ou outra) mudou nos arquivos da P6)
set -u
W="${P6_W:-$HOME/projetos/physiqcalc-wa-p6}"  # P6_W: só o ensaio do plano usa (a cópia fora do repo)
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
cd "$W" || exit 9
rc=0
CONTRATO="src/aluno-dia/api.ts src/aluno-dia/tipos.ts src/aluno-dia/regras.ts supabase-principal/functions/_shared/aluno-dia-regras.ts
  src/rotinas/ui/FolhaRotina.tsx src/rotinas/regras.ts src/rotinas/textos.ts src/nutricao/editor/lib/consultas.ts src/nutricao/editor/lib/adesao.ts
  src/nutricao/app/dietaUtil.ts src/nutricao/app/dia.ts src/painel/aluno/catalogoAbas.ts src/painel/aluno/dados/usePerfilAluno.ts
  src/aluno-dia/semBancoDireto.test.ts src/nutricao/semLeituraDireta.test.ts src/integrations/semBancoNoNavegador.test.ts src/test/fixturesPerfilAluno.ts"
if [ "${1:-}" = "--main" ]; then
  git fetch origin
  echo "── a origin/main ($(git rev-parse --short origin/main)) × p6/orig: os arquivos que a P6 edita"
  for f in $(cd "$S/orig" && find . -type f | sort); do
    f="${f#./}"
    if git show "origin/main:$f" 2>/dev/null | cmp -s - "$S/orig/$f"; then echo "   igual  $f"; else echo "   MUDOU  $f   (o rebase vai mostrar: juntar as 2 mudanças)"; rc=1; fi
  done
  for f in $CONTRATO docs/e2e-rodadas.md; do
    n=$(git log --oneline HEAD..origin/main -- "$f" | wc -l)
    echo "   $f: $n commit(s) novo(s) na main"
  done
  echo "── drift --main: rc=$rc"
  exit $rc
fi
echo "── 1) os arquivos que a P6 edita (md5 × p6/orig) e os patches"
for f in $(cd "$S/orig" && find . -type f | sort); do
  f="${f#./}"
  if cmp -s "$S/orig/$f" "$W/$f"; then echo "   igual  $f"; else echo "   MUDOU  $f"; rc=1; fi
done
if git apply --check "$S/p6-edicoes.patch"; then echo "   o patch das edições aplica"; else echo "   o patch NÃO aplica: fazer as edições à mão (o plano mostra cada uma)"; rc=1; fi
if git apply --check "$S/patches/T11-entrada.patch"; then echo "   a entrada da W-A no docs/e2e-rodadas.md aplica"; else echo "   a entrada da W-A NÃO aplica: pôr à mão (o bloco da Task 11)"; rc=1; fi
confere() {  # arquivo, texto
  if grep -qF "$2" "$1"; then echo "   ok  $1 › $2"; else echo "   FALTA $1 › $2"; rc=1; fi
}
echo "── 2) o contrato da P2 e a folha da P3"
for x in "export const lerRotinasDoAluno" "export const lerDiaDoAluno" "export const profSalvarRotina" "export const profArquivarRotina" \
         "export class ErroAlunoDia" "export const MENSAGEM_ERRO_ALUNO_DIA" \
         'sem_login_do_aluno: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos.",'; do
  confere src/aluno-dia/api.ts "$x"
done
for x in "export interface RotinasDoAluno" "export interface RotinaDoProfissional extends Rotina" "export interface EventoDaRotina" \
         "export interface DiaDoAluno" "pode_editar: boolean;" "arquivada_pelo_aluno: boolean;" "criada_por_nome: string | null;" "pode_criar: boolean;" \
         "tem_login: boolean;" "nivel: \"ver\" | \"mexer\";"; do
  confere src/aluno-dia/tipos.ts "$x"
done
for x in "export function diaAplicado(" "export const macrosDoRetrato" "export function rotinasDoDia(" "export interface RotinaDoDia extends Rotina" \
         "export interface DiaAplicado"; do
  confere src/aluno-dia/regras.ts "$x"
done
confere supabase-principal/functions/_shared/aluno-dia-regras.ts 'aluno_rotinas: { modulo: "profissional", rpc: "rotinas_do_aluno" },'
confere supabase-principal/functions/_shared/aluno-dia-regras.ts 'aluno_dia: { modulo: "profissional", rpc: "dia_do_aluno" },'
confere supabase-principal/functions/_shared/aluno-dia-regras.ts "itensDaReceita: [1, 30], idsNaOrdem: 30, termo: 60, pagina: [0, 50], janelaDias: 31,"
confere src/rotinas/ui/FolhaRotina.tsx 'export type ModoDaFolha = { tipo: "aluno" } | { tipo: "profissional"; aluno: string };'
confere src/rotinas/ui/FolhaRotina.tsx "data-folha-modo={modo.tipo}"
confere src/rotinas/regras.ts "export const linhaDaRotina"
confere src/rotinas/textos.ts "export const ROTULO_TIPO"
echo "── 3) a ficha (a P6 só importa)"
confere src/nutricao/editor/lib/consultas.ts "export function usePlanosDoAluno("
confere src/nutricao/editor/lib/consultas.ts "export function useConcluidas("
confere src/nutricao/editor/lib/adesao.ts "export type Concluida = { refeicao_id: string; data: string };"
confere src/nutricao/app/dietaUtil.ts "export function quantidadeCurta("
confere src/nutricao/app/dietaUtil.ts "export const fmtHorario"
confere src/nutricao/app/dia.ts "export function planoAtivo<"
confere src/nutricao/editor/lib/somenteLeitura.ts 'export const LIBERADO_NA_LEITURA = "[data-leitura]";'
confere src/painel/aluno/catalogoAbas.ts '"CardRotinas",'
confere src/painel/aluno/dados/usePerfilAluno.ts "export function usePerfilAluno("
confere src/test/fixturesPerfilAluno.ts "export function perfil("
echo "── 4) as guardas (a P6 não edita nenhuma)"
confere src/aluno-dia/semBancoDireto.test.ts 'P6: ["src/painel/aluno/resumo/CardRotinas.tsx", "src/painel/aluno/rotinas", "src/painel/aluno/diaADia"],'
confere src/nutricao/semLeituraDireta.test.ts '"src/painel/aluno/Cabecalho.tsx", "src/painel/aluno/AlunoLayout.tsx", "src/painel/aluno/abas/Prontuario.tsx", "src/painel/aluno/resumo",'
confere src/nutricao/semLeituraDireta.test.ts 'pastas: ["src/nutricao/editor/lib", "src/painel/dietas", "src/painel/preconsulta", "src/painel/dashboard/dados.ts"],'
if [ -f src/integrations/semBancoNoNavegador.test.ts ]; then echo "   ok  semBancoNoNavegador existe (a regra: os arquivos novos com 0 achado)"; else echo "   FALTA src/integrations/semBancoNoNavegador.test.ts"; rc=1; fi
echo "── 5) os arquivos novos da P6 ainda não existem"
for f in src/painel/aluno/resumo/CardRotinas.tsx src/painel/aluno/resumo/CardRotinas.test.tsx src/painel/aluno/rotinas src/painel/aluno/diaADia \
         src/painel/aluno/abas/Dieta.test.tsx e2e/wa/telas_painel.py; do
  if [ -e "$f" ]; then echo "   JÁ EXISTE $f"; rc=1; else echo "   livre $f"; fi
done
echo "── drift: rc=$rc"
exit $rc
```

`~/projetos/physiqcalc-scratch/w-a/p6/saude.py`:
```python
#!/usr/bin/env python3
"""W-A P6 — SÓ LEITURA: o /health dos 2 projetos (db, auth, rest) + ninguém segurando o banco (pg_stat_activity). Saída 0 = tudo bem.
Uso: python3 saude.py "<rótulo>"."""
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(os.environ.get("P6_W") or Path.home() / "projetos" / "physiqcalc-wa-p6") / "e2e" / "wa"))  # P6_W: só o ensaio
import _base as B  # noqa: E402

B.exigir_saude(sys.argv[1] if len(sys.argv) > 1 else "a P6")
r = B.ler("""select count(*) filter (where state = 'active' and now() - query_start > interval '30 seconds') as longas,
                    count(*) filter (where wait_event_type = 'Lock') as esperando from pg_stat_activity where datname = current_database()""")
print(r)
raise SystemExit(0 if r and r[0]["longas"] == 0 and r[0]["esperando"] == 0 else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p6/massa_p6.py`:
```python
#!/usr/bin/env python3
"""W-A P6 (Task 0 e antes/depois das Tasks 8 e 10) — SÓ LEITURA (transação read only): o que o E2E do painel (o card Rotinas e o Dia a dia)
precisa no staging. Só booleanos e contagens (nada pessoal). Uso: python3 massa_p6.py   (saída 0 = pronta)
O que confere: a matrícula A da w5p-aluna (nutri w5p-nutri + personal w5p-personal, conta que não é a do app) com o PLANO ATIVO dela
(wa_plano_ativo) e ≥ 1 refeição de HOJE com alimento; o nível da Dieta da A hoje ('ver' — o E2E libera e devolve); a TACO com "arroz" (o
que ela põe no dia); a aluna com login e menos de 27 rotinas vivas (a rodada cria 3; o limite é 30); a conta do w13-dono (a 2ª matrícula
da Massa, o caso da conta B); nada da rodada no dia de hoje (itens, extras, rotinas com a marca, a refeição temporária); as sobras da W-A e
os estados das rodadas (tudo vazio)."""
import json
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(os.environ.get("P6_W") or Path.home() / "projetos" / "physiqcalc-wa-p6") / "e2e" / "wa"))  # P6_W: só o ensaio
import _base as B  # noqa: E402

E, S = B.CONTAS, "staging"
u = lambda k: f"(select id from auth.users where lower(email) = '{E[k]}')"  # noqa: E731
r = B.ler(f"""
with a as (select p.id, p.conta_id, p.user_id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
            where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app'
              and p.nutricionista_id = {u('w5p-nutri')} and p.personal_id = {u('w5p-personal')} order by p.created_at limit 1),
     pl as (select {S}.wa_plano_ativo({u('w5p-aluna')}) as id),
     hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
     refs as (select r.id, (select count(*) from {S}.itens_refeicao i where i.refeicao_id = r.id and i.alimento_id is not null) as itens
                from {S}.refeicoes r, pl, hoje where r.plano_id = pl.id
                 and (cardinality(r.dias_semana) = 0 or extract(isodow from hoje.d)::smallint = any(r.dias_semana)))
select (select count(*) from a) as matricula_a,
       ((select pa.paciente_id from {S}.planos_alimentares pa, pl where pa.id = pl.id) = (select id from a))::int as plano_ativo_da_a,
       (select count(*) from refs where itens > 0) as refeicoes_hoje_com_alimento,
       (select coalesce((select x.nivel from {S}.aluno_acessos x, a where x.paciente_id = a.id and x.chave = 'dieta'), 'ver')) as nivel_dieta_a,
       (select count(*) from {S}.alimentos al where al.fonte = 'taco' and al.deleted_at is null and al.busca like '%arroz%') as taco_arroz,
       (select (user_id is not null)::int from a) as aluna_com_login,
       (select count(*) from {S}.rotinas ro where ro.dono_user_id = {u('w5p-aluna')} and ro.arquivada_em is null) as rotinas_vivas_aluna,
       (select count(*) from {S}.contas c where c.dono_id = {u('w13-dono')} and c.origem <> 'app') as contas_do_w13,
       (select count(*) from {S}.aluno_dia_itens i where i.dono_user_id = {u('w5p-aluna')} and i.dia = (select d from hoje)
           and i.deleted_at is null) as itens_do_dia_hoje,
       (select count(*) from {S}.aluno_dia_refeicoes e where e.dono_user_id = {u('w5p-aluna')} and e.dia = (select d from hoje)
           and e.deleted_at is null) as extras_hoje,
       (select count(*) from {S}.refeicoes rf, pl where rf.plano_id = pl.id and rf.nome like 'WA E2E%') as refeicao_temporaria,
       (select count(*) from {S}.avisos av where av.destino_user_id = {u('w5p-aluna')} and av.tipo = 'geral'
           and av.titulo = 'Seu profissional criou uma rotina para você'
           and av.criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as aviso_rotina_hoje,
       (select count(*) from {S}.aluno_acessos_log l, a where l.paciente_id = a.id and l.em > now() - interval '30 minutes') as historico_recente_a""")[0]
print("principal/staging:", r)
sobras = B.Massa().sobras()
print("sobras da W-A (marca 'WA E2E'):", sobras)
estados = {}
for nome in ("p6-estado.json", "p5-estado.json", "p4-estado.json", "p3-estado.json", "api-estado.json", "massa-estado.json"):
    f = B.SCRATCH / "w-a" / nome
    estados[nome] = bool(f.exists() and json.loads(f.read_text(encoding="utf-8") or "{}") not in ({}, {"matriculas": [], "papeis": []}))
print("estados com massa de rodada anterior:", estados)
ok = (r["matricula_a"] == 1 and r["plano_ativo_da_a"] == 1 and r["refeicoes_hoje_com_alimento"] >= 1 and r["nivel_dieta_a"] == "ver"
      and r["taco_arroz"] >= 1 and r["aluna_com_login"] == 1 and r["rotinas_vivas_aluna"] <= 26 and r["contas_do_w13"] >= 1
      and r["itens_do_dia_hoje"] == 0 and r["extras_hoje"] == 0 and r["refeicao_temporaria"] == 0
      and all(int(v) == 0 for v in sobras.values()) and not any(estados.values()))
print("massa de TESTE pronta para o E2E da P6:", ok,
      "(aviso_rotina_hoje > 0 = o sino já tem o aviso de hoje: o P2 aceita — 1 por dia; historico_recente_a > 0 = alguém mexeu na matrícula A há"
      " pouco: conferir no quadro)")
raise SystemExit(0 if ok else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p6/funcoes_wa.py`:
```python
#!/usr/bin/env python3
"""W-A P6 (a cópia da P3) — SÓ LEITURA (GET da Management API): as 3 funções da W-A nos 2 projetos — existe?, versão, verify_jwt, status.
Uso: python3 funcoes_wa.py [--esperar-ausentes | --esperar-publicadas]   (saída 0 = o esperado; sem opção: só mostra)"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAT = (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()
UA = "physiq-unificado/1.0 (w-a p6)"
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

`~/projetos/physiqcalc-scratch/w-a/p6/travas.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (antes das Tasks 8, 10 e 12) — SÓ LEITURA: o que o quadro diz das travas agora (o 🔒/🔓 do git e do BANCO no topo), a linha da LINUX 1
# (a hml-21: a 21c — que republica a nutricao e a financeiro — e a 21e), os PRs abertos e as últimas da origin/main. A P6 só pega uma trava
# depois do "livre" da LINUX 1 (SendMessage) — este script não decide nada, só mostra.
# uso: bash travas.sh
set -u
Q="$HOME/projetos/physiqcalc-scratch/quem-toca-o-que.md"
echo "── as travas de AGORA no topo do quadro (a 1ª menção de cada uma; o resto da linha é o histórico \"(antes: …)\")"
sed -n 1,12p "$Q" | grep -oE "\*\*(🔒|🔓)[^*]{0,220}" | grep -m1 "git staging/main"
sed -n 1,12p "$Q" | grep -oE "\*\*(🔒|🔓)[^*]{0,220}" | grep -m1 "BANCO do staging"
echo "── a linha da LINUX 1 (hml-21) — o começo do que está 🚧"
grep -m1 "homologação \*\*hml-21\*\*" "$Q" | grep -oE "🚧 \*\*hml-21[a-e]\*\*[^·]{0,300}" | head -4
echo "── PRs abertos:"
gh pr list --repo weslleybertoldo/physiqcalc --state open
echo "── origin/main (as 6 últimas):"
git -C "$HOME/projetos/physiqcalc" fetch -q origin && git -C "$HOME/projetos/physiqcalc" log origin/main --oneline -6
echo "── tmux / portas em uso (a 5173 é da W-A quando a trava é dela; a 8080 é da LINUX 1)"
tmux ls 2>/dev/null | grep -E "wa-|hml" || echo "   (nenhuma sessão wa-/hml)"
ss -ltn | grep -E ":(5173|8080) " || echo "   5173 e 8080 livres"
```

`~/projetos/physiqcalc-scratch/w-a/p6/prova_local.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 7; de novo na Task 9, depois do rebase na main do dia) — a prova LOCAL inteira, um passo por vez na fila do pesado (o que o
# CI do PR roda + as provas da P6); a saída de cada passo em prova-<passo>.txt. Rodadas GRANDES (lint e Vitest do repo inteiro, build): SÓ
# aqui, com a fila livre entre os passos. Leva ~17–20 min: quem tem o limite de 10 min por comando usa o prova_partes.sh (os MESMOS passos).
# uso: bash prova_local.sh               (tudo)
#      bash prova_local.sh --sem-build   (sem o build + chunks)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PYTHONDONTWRITEBYTECODE=1 PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
cd "${P6_W:-$HOME/projetos/physiqcalc-wa-p6}" || exit 9  # P6_W: só o ensaio do plano usa
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
passo seco python3 e2e/wa/telas_painel.py --seco
passo compila python3 -c "[compile(open(a).read(), a, 'exec') for a in ('e2e/wa/telas_painel.py', 'e2e/w16/telas.py')]; print('compila ok (2)')"
echo "── git status --short (vazio = tudo commitado)"
git status --short
echo "── fim $(date +%T):$resumo"
```

`~/projetos/physiqcalc-scratch/w-a/p6/prova_partes.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 7 e Task 9, o executor) — a prova_local.sh em PARTES de menos de 10 min, cada uma em PRIMEIRO PLANO: um comando do
# executor vai até 10 min e a regra é "nada em background"; a prova inteira leva ~17–20 min (ensaio 2: 17 min, o Vitest sozinho 12,5).
# Os MESMOS passos, comandos, fila do pesado (um passo por vez, a fila livre entre eles), ambiente e saídas (prova-<passo>.txt) da
# prova_local.sh; o Vitest do repo inteiro em 4 fatias (--shard=K/4 pelo vitest.sh: a união das 4 = o repo inteiro). Cada passo grava o rc em
# prova-<passo>.rc; a parte "fim" mostra o git status e junta tudo na linha "fim" no formato da prova_local.sh (o vitest = 0 só com as 4
# fatias em 0), com o Vitest somado em prova-vitest.txt (as 4 saídas + o total).
# uso: bash prova_partes.sh fila        (só espera a fila do pesado ficar livre, até 500 s; não roda nada)
#      bash prova_partes.sh a           (lint, tipos, definer, test-node)
#      bash prova_partes.sh vitest K    (a fatia K de 4 do Vitest do repo inteiro)
#      bash prova_partes.sh c           (build, chunks, seco, compila)
#      bash prova_partes.sh fim         (o git status --short + a linha fim)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PYTHONDONTWRITEBYTECODE=1 PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
cd "${P6_W:-$HOME/projetos/physiqcalc-wa-p6}" || exit 9  # P6_W: só o ensaio do plano usa
passo() {
  local nome="$1"
  shift
  echo "── $nome ($(date +%T))"
  "$@" > "$S/prova-$nome.txt" 2>&1
  local rc=$?
  tail -3 "$S/prova-$nome.txt"
  echo "$rc" > "$S/prova-$nome.rc"
  echo "   → $nome=$rc"
}
case "${1:-}" in
  fila)
    if flock -n "$P" true; then echo "fila do pesado livre às $(date +%T)"; exit 0; fi
    echo "fila do pesado ocupada às $(date +%T); esperando até 500 s"
    if flock -w 500 "$P" true; then echo "fila do pesado livre às $(date +%T)"; exit 0; fi
    echo "fila do pesado ainda ocupada às $(date +%T)"
    exit 75
    ;;
  a)
    if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
    passo lint flock "$P" npm run lint
    passo tipos flock "$P" npm run tipos
    passo definer flock "$P" node scripts/ci/checar-definer.mjs
    passo test-node flock "$P" npm run test:node
    ;;
  vitest)
    k="${2:?a fatia: 1, 2, 3 ou 4}"
    # teto de 560 s (o limite do comando é 600) DEPOIS de pegar a fila (a LINUX 1 divide a fila: a espera não conta): estourou → rc 124 e a
    # fatia é refeita (ou fatiada mais fino); o timeout leva o grupo inteiro
    if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
    passo "vitest-$k" flock "$P" timeout -k 20 560 npx vitest run --maxWorkers=2 --shard="$k/4"
    ;;
  c)
    if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
    passo build flock "$P" npx vite build
    passo chunks node scripts/ci/checar-chunks.mjs dist
    passo seco python3 e2e/wa/telas_painel.py --seco
    passo compila python3 -c "[compile(open(a).read(), a, 'exec') for a in ('e2e/wa/telas_painel.py', 'e2e/w16/telas.py')]; print('compila ok (2)')"
    ;;
  fim)
    echo "── git status --short (vazio = tudo commitado)"
    git status --short
    rc_de() { if [ -f "$S/prova-$1.rc" ]; then cat "$S/prova-$1.rc"; else echo "?"; fi; }
    # o Vitest: 0 só com as 4 fatias em 0; a soma dos arquivos e dos testes das 4 (o total entre parênteses de cada fatia)
    vrc=0; arqs=0; arqs_ok=0; testes=0; testes_ok=0
    : > "$S/prova-vitest.txt"
    for k in 1 2 3 4; do
      r=$(rc_de "vitest-$k")
      if [ "$r" != "0" ] && [ "$vrc" = "0" ]; then vrc="$r"; fi
      f="$S/prova-vitest-$k.txt"
      { echo "════ fatia $k/4 (rc=$r)"; cat "$f" 2>/dev/null; } >> "$S/prova-vitest.txt"
      la=$(grep -E '^ +Test Files ' "$f" 2>/dev/null | tail -1)
      lt=$(grep -E '^ +Tests ' "$f" 2>/dev/null | tail -1)
      arqs=$((arqs + $(echo "$la" | sed -nE 's/.*\(([0-9]+)\).*/\1/p' | grep -E '^[0-9]+$' || echo 0)))
      arqs_ok=$((arqs_ok + $(echo "$la" | sed -nE 's/.* ([0-9]+) passed.*/\1/p' | grep -E '^[0-9]+$' || echo 0)))
      testes=$((testes + $(echo "$lt" | sed -nE 's/.*\(([0-9]+)\).*/\1/p' | grep -E '^[0-9]+$' || echo 0)))
      testes_ok=$((testes_ok + $(echo "$lt" | sed -nE 's/.* ([0-9]+) passed.*/\1/p' | grep -E '^[0-9]+$' || echo 0)))
    done
    total="Vitest do repo inteiro (4 fatias somadas): Test Files $arqs_ok passed ($arqs) · Tests $testes_ok passed ($testes)"
    echo "$total" >> "$S/prova-vitest.txt"
    echo "$vrc" > "$S/prova-vitest.rc"
    echo "── $total"
    resumo=""
    for n in lint tipos definer test-node vitest build chunks seco compila; do resumo="$resumo $n=$(rc_de "$n")"; done
    echo "── fim $(date +%T):$resumo"
    ;;
  *)
    echo "uso: bash prova_partes.sh fila | a | vitest K | c | fim"
    exit 2
    ;;
esac
```

`~/projetos/physiqcalc-scratch/w-a/p6/prova_tmux.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Tasks 7 e 9) — a prova_local.sh inteira dentro de um tmux "wa-p6-prova" (passa de 10 min e a fila do pesado é dividida com a LINUX 1;
# nada solto em background): a saída em prova-saida.txt e a última linha "PROVA-FIM rc=<n>" quando acabar. Conferir com
# `tail -4 ~/projetos/physiqcalc-scratch/w-a/p6/prova-saida.txt` (ou esperar pelo "PROVA-FIM").
# uso: bash prova_tmux.sh [--sem-build]
set -u
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
saida="$S/prova-saida.txt"
: > "$saida"
tmux kill-session -t wa-p6-prova 2>/dev/null
tmux new-session -d -s wa-p6-prova "bash $S/prova_local.sh ${1:-} >> $saida 2>&1; echo \"PROVA-FIM rc=\$?\" >> $saida"
echo "prova rodando no tmux wa-p6-prova → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p6/preview.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 8) — o build de STAGING (o .env.local da worktree: VITE_DB_SCHEMA=staging) servido em http://localhost:5173 (--strictPort; a
# 8080 é da LINUX 1) num tmux "wa-p6-preview" (nada solto em background). site = npm run build · loja = npm run build:loja · parar.
# uso: bash preview.sh site | loja | parar
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
W="${P6_W:-$HOME/projetos/physiqcalc-wa-p6}"  # P6_W: só o ensaio do plano usa (a cópia fora do repo)
cd "$W" || exit 9
modo="${1:?site | loja | parar}"
tmux kill-session -t wa-p6-preview 2>/dev/null
if [ "$modo" = "parar" ]; then echo "preview parado"; exit 0; fi
if ss -ltn | grep -q ":5173 "; then echo "PAROU: a porta 5173 está ocupada por outro processo (não derrubo o que não é meu)"; exit 1; fi
case "$modo" in
  site) flock "$P" npm run build > "$HOME/projetos/physiqcalc-scratch/w-a/p6/build-site.txt" 2>&1 || { echo "build do site falhou"; exit 1; } ;;
  loja) flock "$P" npm run build:loja > "$HOME/projetos/physiqcalc-scratch/w-a/p6/build-loja.txt" 2>&1 || { echo "build da loja falhou"; exit 1; } ;;
  *) echo "uso: site | loja | parar"; exit 2 ;;
esac
grep -o 'physiq-distribuicao" content="[a-z]*"' dist/index.html
tmux new-session -d -s wa-p6-preview "cd $W && PATH=$HOME/.local/node/bin:\$PATH $HOME/.local/node/bin/npx vite preview --port 5173 --strictPort"
for _ in $(seq 1 40); do
  if curl -sf http://localhost:5173/health.json > /dev/null; then break; fi
  sleep 1
done
curl -s http://localhost:5173/health.json; echo
```

`~/projetos/physiqcalc-scratch/w-a/p6/e2e_local.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 8) — o E2E de tela LOCAL (5173) dentro de um tmux "wa-p6-e2e" (o comando passa de 10 min; nada solto em background):
# a saída inteira em e2e-local-<modo>.txt e a última linha "E2E-FIM rc=<n>" quando acabar.
# uso: bash e2e_local.sh site | loja
set -u
modo="${1:?site | loja}"
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
W="$HOME/projetos/physiqcalc-wa-p6"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
saida="$S/e2e-local-$modo.txt"
extra=""
[ "$modo" = "loja" ] && extra="--loja"
: > "$saida"
tmux kill-session -t wa-p6-e2e 2>/dev/null
tmux new-session -d -s wa-p6-e2e "cd $W && TMPDIR=$HOME/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_painel.py --base local $extra --canal msedge >> $saida 2>&1; echo \"E2E-FIM rc=\$?\" >> $saida"
echo "E2E $modo rodando no tmux wa-p6-e2e → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p6/e2e_tmux.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Tasks 10 e 12) — um E2E dentro do tmux "wa-p6-e2e" (passa de 10 min; nada solto em background), na worktree da P6, na fila do
# pesado, com o TMPDIR do scratch e sem bytecode: a saída em e2e-<rótulo>.txt e a última linha "E2E-FIM rc=<n>".
# uso: bash e2e_tmux.sh <rótulo> <script.py> [args…]    ex.: bash e2e_tmux.sh staging e2e/wa/telas_painel.py --base staging --canal msedge
set -u
rotulo="${1:?rótulo}"; shift
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
W="$HOME/projetos/physiqcalc-wa-p6"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
saida="$S/e2e-$rotulo.txt"
: > "$saida"
args=""
for a in "$@"; do args="$args '$a'"; done
tmux kill-session -t wa-p6-e2e 2>/dev/null
tmux new-session -d -s wa-p6-e2e "cd $W && TMPDIR=$HOME/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 $args >> $saida 2>&1; echo \"E2E-FIM rc=\$?\" >> $saida"
echo "E2E $rotulo rodando no tmux wa-p6-e2e → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p6/esperar_vercel.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 10) — espera o staging da Vercel servir o commit empurrado (o /health.json com o sha curto de 7; até 15 min). Só leitura.
# uso: bash esperar_vercel.sh <sha curto de 7>
set -u
sha="${1:?sha curto (git rev-parse --short=7 HEAD)}"
h=""
for _ in $(seq 1 90); do
  h=$(curl -s https://physiqcalc-staging.vercel.app/health.json)
  case "$h" in
    *"\"commit\":\"$sha\""*) echo "$(date +%T) o staging serve $sha: $h"; exit 0 ;;
  esac
  sleep 10
done
echo "TEMPO ESGOTADO: o staging não serviu $sha em 15 min (último: $h) — ver o deploy na Vercel (git_info_fail → POST /v13/deployments)"
exit 1
```

`~/projetos/physiqcalc-scratch/w-a/p6/realinhar_confere.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 12) — a condição (b) do quadro para realinhar `staging` = `main` depois do squash: o staging só tem os commits da P6 e a árvore
# dele é a do squash. Só leitura (o push com lease é um comando à parte, com o "pode ir" da LINUX 1).
# uso: bash realinhar_confere.sh <sha do squash da P6 na main>
set -u
cd "${P6_W:-$HOME/projetos/physiqcalc-wa-p6}" || exit 9  # P6_W: só o ensaio do plano usa
sq="${1:?sha do squash da P6 na main}"
git fetch origin
echo "── commits no staging que a main não tem (têm de ser SÓ os da branch da P6):"
git log --format='   %h %an — %s' origin/main..origin/staging
echo "── a árvore do staging × a do squash (vazio = iguais):"
git diff --stat origin/staging "$sq"
echo "STAGING_SHA=$(git rev-parse origin/staging)"
```

`~/projetos/physiqcalc-scratch/w-a/p6/smoke_prod.sh`:
```bash
#!/usr/bin/env bash
# W-A P6 (Task 12) — o smoke SÓ LEITURA na produção, um por vez, no tmux "wa-p6-e2e": o Resumo com o card Rotinas da conta de teste (a Guarda),
# a aba Acessos (a dica das rotinas aponta para o card agora), o w07 e as funções da W-A sem 5xx desde o merge (o api.py --so-leitura lê também
# o q=aluno_rotinas e o q=aluno_dia). Saída em smoke-prod.txt; a última linha "SMOKE-FIM".
# uso: bash smoke_prod.sh <versão> <ISO UTC do merge>     ex.: bash smoke_prod.sh 3.120 2026-10-14T00:31:00Z
set -u
v="${1:?versão}"; desde="${2:?ISO UTC do merge}"
S="$HOME/projetos/physiqcalc-scratch/w-a/p6"
W="$HOME/projetos/physiqcalc-wa-p6"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
saida="$S/smoke-prod.txt"
: > "$saida"
cat > "$S/smoke_prod_corpo.sh" <<EOT
cd $W
export TMPDIR=$HOME/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1
echo "── telas_painel --base prod"; flock $P python3 e2e/wa/telas_painel.py --base prod --canal msedge; echo "rc=\$?"
echo "── telas_acessos --base prod"; flock $P python3 e2e/wa/telas_acessos.py --base prod --canal msedge; echo "rc=\$?"
echo "── w07/smoke_prod.py telas"; flock $P python3 e2e/w07/smoke_prod.py telas --versao $v --canal msedge; echo "rc=\$?"
echo "── api.py --so-leitura"; flock $P python3 e2e/wa/api.py --so-leitura --desde $desde; echo "rc=\$?"
echo SMOKE-FIM
EOT
tmux kill-session -t wa-p6-e2e 2>/dev/null
tmux new-session -d -s wa-p6-e2e "bash $S/smoke_prod_corpo.sh >> $saida 2>&1"
echo "smoke da produção rodando no tmux wa-p6-e2e → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p6/rodadas_p6.py`:
```python
#!/usr/bin/env python3
"""W-A P6 (Task 11) — as linhas do docs/e2e-rodadas.md (a mais nova em cima, no formato da tabela "## Rodadas"), do e2e-rodadas.tsv OFICIAL:
as da P6 (branch feat/w-a-p6-painel-rotinas) e as de PRODUÇÃO da P5 que rodaram DEPOIS do merge dela (a regra: as de produção vão no PR seguinte;
--p5-desde "AAAA-MM-DD HH:MM" = a hora do squash da P5 — a T10-FEITA da P5 diz). As obs. saem com um texto-base: conferir e completar com as
T<N>-FEITA. Só imprime. Uso: python3 rodadas_p6.py --p5-desde "2026-10-13 19:40"
"""
import argparse
from pathlib import Path

TSV = Path.home() / "projetos/physiqcalc-scratch/e2e-rodadas.tsv"
OBS = {
    "e2e/wa/telas_painel.py": {
        "local": "telas do painel (5173, build de staging): o card Rotinas do Resumo (o ✓ da aluna, só leitura), criar e mudar a do profissional (o sino e a página do app), a apagada pelo aluno e o histórico, a conta B sem ver nem mudar a da conta A, o Dia a dia da nutri (o ✓, o riscado, o posto, a extra, a refeição tirada do plano, o total, as rotinas), travada com a faixa, o personal embaixo da adesão, sem login, 390 px; sobras 0",
        "local-loja": "telas da loja (5173, build:loja): o card Rotinas, o Dia a dia da nutri e o do personal (só lendo, com a massa pelas funções); sobras 0",
        "staging": "telas no staging (Vercel): o mesmo roteiro do local; sobras 0",
        "produção": "SÓ LEITURA (a Guarda): o Resumo da conta de teste com o card Rotinas, só `ler` na aluno-dia; nenhuma gravação tentada",
    },
    "e2e/w16/telas.py": {"staging": "regressão da W16 (--casos secoes): a aba Dieta da ficha com as 8 seções (+ o Dia a dia da P6)"},
    "e2e/wa/telas_acessos.py": {"staging": "regressão da aba Acessos (P4): a dica das rotinas aponta para o card Rotinas do Resumo (a P6 o criou)",
                                "produção": "produção depois do merge da P6 (só leitura): a aba Acessos com a dica do card Rotinas"},
}


def base_de(script: str, args: str) -> str:
    if "--base prod" in args or "--schema public" in args or "--so-leitura" in args or script.endswith("prod.py") or "smoke_prod" in script:
        return "produção"
    if "--base local" in args or "localhost" in args:
        return "local-loja" if "--loja" in args else "local"
    return "staging"


ap = argparse.ArgumentParser()
ap.add_argument("--p5-desde", default="")
a = ap.parse_args()
saida = []
for linha in TSV.read_text(encoding="utf-8").splitlines():
    c = linha.split("\t")
    if len(c) < 6:
        continue
    data, branch, commit, script, args, placar = c[:6]
    if branch == "feat/w-a-p6-painel-rotinas":
        b = base_de(script, args)
        obs = OBS.get(script, {}).get(b, "")
        mostra = {"local": "local", "local-loja": "local"}.get(b, b)
        saida.append((data, "W-A P6", commit, script, args, mostra, placar, obs))
    elif branch == "feat/w-a-p5-dieta-livre" and a.p5_desde and data >= a.p5_desde and base_de(script, args) == "produção":
        saida.append((data, "W-A P5", commit, script, args, "produção", placar, "produção depois do merge da P5 (só leitura)"))
for data, wt, commit, script, args, base, placar, obs in sorted(saida, reverse=True):
    print(f"| {data[8:10]}/{data[5:7]} {data[11:16]} | {wt} | `{commit}` | `{script}{(' ' + args) if args else ''}` | {base} | {placar} | {obs} |")
print(f"\n{len(saida)} linhas ({sum(1 for s in saida if s[1] == 'W-A P6')} da P6, {sum(1 for s in saida if s[1] == 'W-A P5')} da P5)")
```

As cópias conferidas e os retratos (fora do plano, em `p6/`): `codigo/` + `codigo.md5` (os 14 arquivos novos, iguais aos blocos das Tasks 1–6), `patches/T4-teste.patch`,
`T4-codigo.patch`, `T5.patch`, `T11-entrada.patch` (iguais aos blocos `diff` das Tasks 4, 5 e 11), `p6-edicoes.patch` (os 3 primeiros juntos — o `drift.sh` confere que
aplica) e `orig/` (os 4 arquivos que a P6 edita, como eram na `99f48b7`). O ensaio: `ensaio/` e `ensaio2/` (as cópias; saem na Task 13), `janela.sh` (as faixas da P5),
`ensaio_prova.sh`, `ensaio_resto.sh`, `ensaio_replay.sh` (o ensaio 2), `ensaio_arquivos.sh` (a conferência sem Vitest), `ensaio2_tudo.sh`, `montar_codigo.sh` (monta
`codigo/`, `orig/` e `patches/` do ensaio), `replay.txt` + `replay-*.txt` (os placares de cada task), `ensaio-*.txt` e `ensaio2-*.txt` (as saídas das rodadas grandes)
e `gerar_plano.py` + `preencher.py` + `plano.tmpl.md` (este plano montado com os blocos conferidos).
