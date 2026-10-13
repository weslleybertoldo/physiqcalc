# W-A P4 — Painel: aba Acessos (as 6 linhas com rádios, o "Mudado por", o resumo; o Login do aluno ao lado; os cards antigos saem do Resumo; o cadeado sai do editor do Treino; os textos que apontavam para o lugar antigo) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** na ficha do aluno, depois de Financeiro e para TODO aluno, a aba **Acessos**: à esquerda "o que ele pode no app" — 6 linhas (Acesso ao app ·
Treino — séries · Dieta · Diário alimentar com fotos · Envio de fotos pelo link · Rotinas), cada uma com os níveis em botões de rádio de verdade
(cor por nível), salva na hora por QUALQUER profissional do aluno (P4), "Mudado por Ana em 12/10 17:20" embaixo e o resumo no rodapé; à direita
o **Login do aluno** (o card que era do Resumo, igual). O Resumo perde o card de login e o "Ajustes do aluno" vira **"Mensagens automáticas"** (só o
WhatsApp); o editor do Treino perde o cadeado das séries; a aba Treino, o ⋯ do cabeçalho e a faixa das mensagens desligadas apontam para o lugar
novo. **Nenhuma migration, nenhuma função** (a P2 publicou a `acessos` e a `treino-acessos`). **A P4 sai logo antes da P5** (risco 9 da spec).

**Architecture:** a aba é `src/painel/aluno/abas/Acessos.tsx` (registro por convenção — a barra a acha sozinha) e o catálogo `catalogoAbas.ts` ganha
a 7ª aba (`modulo: "ambos"`). As linhas moram em `src/painel/aluno/acessos/`: as regras PURAS (`regras.ts`: o catálogo das 6 linhas, quando cada uma
aparece, o aviso, o "Mudado por", o resumo, o estado da linha das séries), as consultas e as gravações (`useAcessos.ts`, React Query, pela porta da
P2 — `src/acessos/api.ts`: a `acessos` no principal e a `treino-acessos` no Treino, com o token do principal), a linha (`LinhaDeAcesso.tsx`, o molde
`AcessosDoMembro.tsx` do Nativo OS) e a lista (`ListaDeAcessos.tsx`). A linha das séries carrega à parte (Banco do Treino) com o esqueleto e o erro
dela. O card de login muda de pasta para `resumo/acesso/` (subpasta não é card) SEM mudar o que faz — as RPCs dele seguem as de `resumo/acesso/api.ts`
(H-43, a hml-21c leva ao servidor depois). A barra de abas rola até a aba ativa no celular. Telas no visual premium; `useConfirmar` no bloqueio do app.

**Tech Stack:** React 18 + TypeScript (`strict: false`) + React Query 5 + Vite + Tailwind 4; Vitest (`--maxWorkers=2`); Python 3 + Playwright (Edge,
`--canal msedge`). Sem APK de teste, sem emulador, sem G7 (a P4 não tem nada de aparelho: o painel no APK é o mesmo JS — a loja roda no build:loja).

**Entradas:** a spec `docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md` (§2.1 P1–P4, §2.2-2/3/4/5/18, §3, §4.1, §4.2, §4.7, §5.2, §5.3,
§5.6, §5.7, §6 "P4", §7, §8 riscos 5, 6, 9 e 13) — a fonte; a revisão `~/projetos/physiqcalc-scratch/w-a/spec-review-w-a.md` (I7, I10, MENOR 15 e 28);
o mestre `docs/superpowers/plans/2026-10-12-w-a-plano-mestre.md` (§0, §1, §3 › P4, §4, §6, §8, §9); o plano da P3 (o molde:
`docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md`) e o andamento real dela (`~/projetos/physiqcalc-scratch/w-a/p3/progresso.log`); o contrato da
P2 (`src/acessos/{api,tipos}.ts`, `supabase-principal/functions/acessos/index.ts` + `_shared/acessos-regras.ts`, `supabase/functions/treino-acessos/index.ts`
+ `_shared/treino-acessos-regras.ts`, `supabase-principal/migrations/20261012200000_wa1_acessos.sql`); a hml-21 (`~/projetos/physiqcalc-scratch/hml/hml21/{spec,para_linux3}.md`)
e o combinado da 21d (`~/projetos/physiqcalc-scratch/w-a/p4/LINUX1-21d.md`, 13/10 ~08:0x); o quadro `~/projetos/physiqcalc-scratch/quem-toca-o-que.md`.

**Modo:** até o fim (o G0 do mestre vale). Sem gates humanos; validação com evidência (placares, o banco SÓ LEITURA, o Banco do Treino) e prints
conferidos (Read em cada um ANTES de mandar). **O código local começa já; a esteira de staging e o merge vêm DEPOIS da 21d da LINUX 1** (o combinado
de 13/10 ~08:0x: a P4 rebaseia em cima da 21d; BANCO e git do staging sempre pela trava do quadro).

**Conferido ao escrever este plano (13/10/2026 ~08:05–09:40; SÓ LEITURA + um ENSAIO fora do repo):**
- **A base:** `origin/main` = `origin/staging` = `f736824` (v3.115: a W-A P3 em produção — PR #198, squash `c042780`). A worktree da P3 já saiu; a da P1
  (`~/projetos/physiqcalc-acessos`) segue (o `.env.local` do staging e o `node_modules` dela serviram ao ensaio). A LINUX 1 está na hml-21b (a 21d vem depois
  dela, e a P4 entra depois da 21d; a 21c depois da P4).
- **O contrato da P2, usado como está:** `lerAcessos(aluno)` → `{ ok, paciente_id, tem_login, modulos, conta_modulos, tem_nutricionista, pode_mudar, linhas,
  mudancas }` (`linhas`: `acesso_app`/`diario_alimentar`/`acesso_link` = bloqueado|liberado, `dieta` = ver|mexer; `mudancas[chave]` = `{ de, para, em, por_nome }`
  — o último do histórico, inclusive `treino_series`); `salvarAcesso(aluno, chave, valor)` → a aba inteira de novo; `lerSeries(aluno)` → `{ ok, series:
  ver|mexer, pode_mudar }`; `salvarSeries(aluno, valor)` → `{ ok, series, registrado }`; `ErroAcessos(codigo)` com a frase fixa (`MENSAGEM_ERRO_ACESSOS`).
  Na `treino-acessos`: sem o módulo Treino → 409 `sem_modulo`; antes do 1º acesso → 404 `sem_treino`; o Treino de OUTRA conta (o mesmo login em 2
  contas) → 403 `sem_acesso` também na LEITURA (o passo 4 vem antes de ler). Na `acessos_salvar`: Dieta/Diário/Link exigem nutricionista DE VERDADE
  (`sem_nutricao`, a `wa_nutricao_de_verdade` = o `tem_nutricionista` da leitura), o App exige login (`sem_login_do_aluno`).
- **As guardas que a P4 encontra (e NÃO edita):** `src/nutricao/semLeituraDireta.test.ts` (hml-20d, LINUX 1): a área `painel-aluno` lê a pasta `src/painel/aluno/resumo`
  INTEIRA (o card movido para `resumo/acesso/` segue nela; `minimo: 100`) e o `RPCS_DE_OUTRA_W_NO_PAINEL` é IGUALDADE EXATA (`dados/api.ts` e `resumo/acesso/api.ts`
  — a P4 não toca nesses 2); `src/integrations/semBancoNoNavegador.test.ts` (hml-21a): arquivo novo com 0 achado; `src/aluno-dia/semBancoDireto.test.ts` (P2) já
  lista as pastas da P4 (`abas/Acessos.tsx`, `acessos/`); `semDialogoNativo`, `larguraCelular` e o `consultasComErro` (toda `useQuery` de `.tsx` lê o erro —
  as consultas da P4 moram num `.ts` e as telas leem o erro).
- **O app do aluno lê as séries pelo PowerSync** (`src/treino/useTreinoDoDia.ts:111-126` → `podeEditar = !seriesTravadas` → `SeriesDoExercicio.tsx:58`: "O número
  de séries é definido pelo seu profissional."), mas **o build de staging NÃO tem PowerSync desde a H-14** (`src/lib/powersync/instancia.ts`) — o Treino do aluno
  não abre no local nem no staging (defeito 2).
- **O ENSAIO** (13/10 08:13–09:40, FORA do repo: uma cópia da `f736824` em `~/projetos/physiqcalc-scratch/w-a/p4/ensaio` com o `node_modules` da worktree da P1 por
  link; nada no repo, no banco, na borda nem no registro oficial): os blocos deste plano como estão → `tsc` do app **0 erro** · `eslint` dos arquivos da P4 **0** ·
  Vitest dos arquivos da P4, dos que ela edita e das 10 guardas **19 arquivos, 190 testes** (+ o `Rotas.test.tsx` 64) · o Vitest do REPO INTEIRO **427 arquivos, 6.036 testes** — a 1ª rodada achou o defeito 1 (3 falhas no `Rotas.test.tsx`); corrigido, a rodada final (no ensaio 2) **427/427 arquivos, 6.036/6.036 testes, 0 falha** ·
  `npm run lint` **0 erro** (24 avisos antigos, nenhum nos arquivos da P4) · `npm run tipos` **0** · `checar-definer` **0 problema** · `test:node` **68/68 (1 pulado)** ·
  `vite build` + `checar-chunks` **ok** (53 s; o pedaço da aba `Acessos-*.js` 21 KB, gzip 7,5 KB; o fecho estático dela 998 KB, sem pdf, xlsx, motor, heic2any nem powersync) · `telas_acessos.py --seco` **44/44** · os 5 E2E compilam · e o **ENSAIO 2**: numa cópia LIMPA da `f736824`
  (`p4/ensaio2`), as Tasks 1–8 como o executor vai fazer (o `copiar.sh` + o `git apply` de cada patch, o vermelho → verde de cada task — os placares deste plano
  são os de lá) reproduzem o ensaio **byte a byte**, e o `drift.sh` contra ela **rc=0**; depois do último ajuste nos E2E, a conferência final numa 3ª cópia limpa
  (`ensaio_arquivos.sh`: as cópias + os 9 patches na ordem) também deu **byte a byte** e o drift **rc=0**. O ensaio achou e o plano já corrige: (1) o `src/rotas/Rotas.test.tsx:324`
  lista as abas do aluno em igualdade exata — a aba nova o quebrava (3 falhas no Vitest inteiro; defeito 1); (2) a consulta das séries repete 1 vez o que pode
  passar sozinho (a rede, o principal fora) — os testes do erro esperam o 2º erro (até 4 s), e `sem_treino`/`sem_acesso`/`sem_modulo` NÃO repetem (são estados,
  não falhas); (3) as ações do cabeçalho vão para o topo da casca por portal (`TopoPagina`) — o teste do ⋯ monta o `TopoCtx` com um alvo próprio.
  **Não rodou (de propósito):** os E2E contra o staging e a produção.

---

## Decisões técnicas minhas (P4 — não são do Weslley; aparecem na foto)

1. **Os níveis como rádios de verdade** (o molde `AcessosDoMembro.tsx` do Nativo OS: um `input type=radio` por nível, o grupo com `role="radiogroup"` e
   `aria-labelledby` — Tab entra, as setas trocam), a cor do marcado pelo tom do chip: **Bloqueado** neutro (g), **Só ver** azul (o ciano do visual
   premium — não há "azul" no tema), **Liberado / Pode mexer / Sempre** verde (n).
2. **Salva na hora, linha por linha, otimista:** o nível muda na tela já; a função recusou → volta e o toast com a frase fixa do código (nunca a mensagem
   crua); deu certo → "Salvo", a aba com a volta do servidor e o perfil do aluno relido (o "Link do diário" e o "Mensagens automáticas" leem os ajustes de
   lá — spec §5.3). As séries: deu certo → relê a aba (o "Mudado por" das séries vem do histórico do principal). Enquanto uma gravação corre, os rádios
   ficam desligados (como os interruptores dos Ajustes de hoje).
3. **"App: Bloqueado" pede a confirmação do app** (`useConfirmar`: "Bloquear o app de <1º nome>?", o texto da spec e "Você libera de novo quando quiser",
   o botão "Bloquear" em rosa); liberar não pede. As outras linhas não pedem (spec §2.2-5).
4. **A linha das séries carrega à parte** (só para aluno com o módulo Treino — sem ele, a linha some e a `treino-acessos` nem é chamada): esqueleto
   próprio; `sem_treino` → o texto "Vale depois do 1º acesso do aluno ao app."; `sem_acesso` (o Treino é de OUTRA conta — o `acessos_ler` desta já passou)
   → só o texto da aba Treino ("Treino de outro personal: só o personal responsável por este aluno e o dono da conta veem o treino dele."), sem os níveis
   (defeito 3); os outros erros → "Não deu para ler o Treino agora." + "Tentar de novo" (relê só as séries). A consulta repete 1 vez só o que pode passar
   sozinho (a rede, o principal fora); `sem_acesso`, `aluno_inexistente`, `sem_login`, `sem_treino`, `sem_modulo`, `dados_invalidos`, `sem_internet` não repetem.
5. **Quando cada linha aparece:** App, Dieta e Rotinas sempre; as séries só com o módulo Treino do aluno; o Diário e o Link só com nutricionista DE
   VERDADE (`tem_nutricionista` — a regra do servidor; defeito 4); a Dieta sem nutricionista mostra "Este aluno não tem dieta" no lugar dos níveis. Os
   avisos para ESTE aluno: o App sem login (desligado) "Ele ainda não tem login: crie o acesso em Login do aluno."; o Link com o Diário bloqueado "Vale
   quando o diário estiver liberado.". As Rotinas: "Sempre liberadas", sem botão.
6. **A dica das Rotinas aponta para o card Rotinas do Resumo só quando ele existe** (`existe("resumoAluno", "CardRotinas")` — a P6 o cria; a aba não
   precisa mudar na P6; defeito 5).
7. **O "Mudado por"** = o 1º nome de `por_nome` + "em dd/mm hh:mm" (horário de São Paulo); sem o nome (o servidor mudou) → "Mudado em …"; as Rotinas
   não têm. **O resumo do rodapé:** "App liberado|bloqueado" (sem login: "App sem login") · "séries: pode mexer|só ver" (quando a linha está pronta) ·
   "dieta: só ver|pode mexer" (com nutricionista) · "rotinas sempre" — o exemplo da spec.
8. **Quem só vê** (`pode_mudar` = false: vê o aluno mas não muda — `w14_pode_editar`) → todos os rádios desligados e a linha "Você vê os acessos; quem
   muda é o dono da conta ou um profissional deste aluno."; **sem internet** → os rádios desligados e "Sem internet: os acessos voltam a mudar quando a
   conexão voltar."; a aba não abriu → `EstadoErro` com "Tentar de novo" (sem ele no `sem_acesso`/`aluno_inexistente`).
9. **O card de login muda de pasta SEM mudar o que faz** (spec §2.2-2): `resumo/CardAcessoAluno.tsx` → `resumo/acesso/CardAcessoAluno.tsx` (só os imports e
   o título, que vira **"Login do aluno"** — o nome que a spec e a frase do `sem_login_do_aluno` usam; defeito 6). Os `data-*` ficam (os E2E e a 21c não
   mudam). O "Ajustes do aluno" vira **"Mensagens automáticas"** no MESMO arquivo e com o MESMO `data-card-ajustes-aluno` (o `AJUSTES` fica só com o
   WhatsApp; o `dados/api.ts` e as RPCs NÃO mudam — o pedido da hml-21).
10. **O ⋯ "Acesso do aluno" abre a aba Acessos** (o rótulo e a marca `acesso` ficam); a aba Treino: "Crie o acesso na aba Acessos (Login do aluno)" +
    "Ir para Acessos"; a faixa das mensagens desligadas: "no card Mensagens automáticas"; o "Link do diário": "… está desligado na aba Acessos.".
11. **A barra de abas rola até a aba ativa** (spec §4.1: no celular a "Acessos", a última, fica fora da tela): a conta pura `rolagemParaMostrar` (testada)
    e um efeito no `AlunoLayout` com as posições do `getBoundingClientRect` (não depende do `offsetParent`); sem rolar quando ela já aparece.
12. **"A nutri trava as séries e o app mostra 'O número de séries é definido pelo seu profissional'"** (o "Pronto" da §6) em 2 provas: o E2E confere no
    Banco do Treino o `series_travadas` que a aba gravou (o campo que o app lê) e o histórico no principal; o Vitest NOVO `src/treino/ui/SeriesDoExercicio.test.tsx`
    prova a tela do app com o campo (defeito 2 — o build de staging não tem PowerSync).
13. **O E2E `e2e/wa/telas_acessos.py`** (o molde do `telas_rotinas.py` da P3): a foto da matrícula A da w5p-aluna (o config, os acessos, o `series_travadas`)
    e o papel do w27-master no estado ANTES de mexer; tudo volta no fim (e no `--limpar`), o histórico e os avisos da rodada saem; a Massa do `_base.py`
    (a "sem login" na conta A, a 2ª matrícula na conta do w13-dono, os papéis do "dono sem papel" — devolvidos logo depois do caso); `--loja` só lendo
    (o print com `loja_`); `--base prod` SÓ LEITURA com a Guarda (o `aluno_acesso` do card de login é a gravação conhecida e aceita — H-43, o molde
    `BARRADAS_ACEITAS` da hml-20); `--seco` (o que tem de estar no código e o que saiu).
14. **Os E2E antigos que procuravam o que mudou** (spec §6): `e2e/w08b/telas.py` e `e2e/w14/telas.py` vão à aba Acessos (`/acessos`) para o card de login e
    para o "Acesso ao app" (agora o rádio com a confirmação); `e2e/w14/prod.py` confere o Resumo sem o card de login e a aba com o App liberado (P15);
    `e2e/w15/telas.py` confere que o cadeado saiu do editor. Na esteira roda só o que a P4 tocou (defeito 7).
15. **A esteira:** sem APK/emulador/G7 (nada de aparelho); local (site + loja na 5173) → **esperar a 21d entrar na `main`** → rebase + prova local de novo →
    staging (push ff + E2E + a regressão das famílias tocadas) → PR → produção SÓ LEITURA (`telas_acessos.py --base prod`, `w14/prod.py`, `w07/smoke_prod.py`)
    → fechar. As rodadas de produção da P3 entram no PR desta (a regra da casa).

## Defeitos e ambiguidades da spec (anotados; nenhuma decisão dela mudou)

1. **IMPORTANTE — `src/rotas/Rotas.test.tsx:324` fora da lista da §6:** o teste das rotas antigas do Calc lista as abas do aluno (conta só de Treino) em
   IGUALDADE EXATA — a aba nova o quebra (o ensaio: 3 falhas no Vitest inteiro). Saída: a P4 acrescenta `"acessos"` no fim da lista (Task 4).
2. **IMPORTANTE — §6 "P4 › Pronto: a nutri trava as séries e o APP mostra 'O número de séries é definido pelo seu profissional'":** desde a H-14 (07/10) o
   build de staging não tem PowerSync — o Treino do aluno não abre no local nem no staging; e o PowerSync de produção lê o `public` (a P4 não grava na
   produção). Saída: decisão 12 (o banco do Treino no E2E + o Vitest da tela do app; o teste novo fica fora da lista da §6).
3. **IMPORTANTE — §4.1 "Treino que esta conta não vê: só para ler, com o texto da aba Treino":** a `treino-acessos` (P2) recusa a LEITURA também (403
   `sem_acesso`, o passo 4 antes de ler) — não há nível para mostrar. Saída: só o texto (decisão 4).
4. **MÉDIO — §4.1 "Diário e Link: Só com Nutrição" × o servidor:** a `acessos_salvar` recusa os 2 sem nutricionista DE VERDADE (`sem_nutricao`) — com o
   `modulos` (que no app sem profissional pode trazer `nutricao`) a linha apareceria e sempre falharia. Saída: decisão 5 (`tem_nutricionista`).
5. **MENOR — a dica das Rotinas "As suas você cria no card Rotinas do Resumo":** o card nasce na P6 (a P5 no meio). Saída: decisão 6.
6. **MENOR — "Login do aluno" × o card "Acesso do aluno" ("o card de hoje, igual"):** a spec chama o card de "Login do aluno" (§4.1, a frase do
   `sem_login_do_aluno` da P2). Saída: decisão 9 (só o título muda).
7. **MENOR — os E2E antigos da §6 têm verificações velhas, de fora da P4** (o `w14/telas.py › resumo` ainda espera os atalhos do Fluxo no site antigo, que
   saiu na W28; o `w08b › criar` apaga e cria logins): a P4 troca só o que procura o que ela mudou; na esteira roda só os casos tocados (`w14 --casos
   acesso,acoes`, `w08b --casos card,celular,negativo`, o `w15` inteiro) e falha numa verificação velha não é da P4 (vai para a obs. das rodadas).
8. **MENOR — a produção só leitura × o card de login:** o card lê E garante pela `aluno_acesso` (H-43): a Guarda a barra na produção — o card mostra o erro
   dele no smoke (aceito, o molde da hml-20; sai com a 21c).
9. **INFO — §6 "ORDEM_RESUMO … com `CardRotinas` na 7ª posição":** = o 1º de baixo (o índice 6, logo depois dos 6 de cima) — o `AbaResumo` separa os 6
   de cima pelo índice.
10. **INFO — revisão, MENOR 28** (a dica "Bloqueado: o app abre fechado" é falsa para o aluno de 2 contas com a outra liberada): mantida a frase da spec
    (é decisão dela; trocar = 1 linha em `acessos/regras.ts`).
11. **INFO — o Resumo deixa de chamar o `aluno_acesso` e a aba Acessos passa a chamar** (+ `acessos { acao: "ler" }` e `treino-acessos { acao: "ler" }`):
    a régua de rede das hml-20/21 que conta o `rpc:aluno_acesso` como "gravação aceita ao abrir o Resumo" passa a ver 0 (é aceita, não exigida — não
    falha); a linha de base da 21c já é depois da P4 (o combinado).
12. **INFO — o master no painel do staging:** o w27-master só é master no `staging.profiles` durante a rodada e não tem conta; nenhum E2E da casa abre um
    aluno pelo painel como master (o `AlunoLayout` cobre o master sem conta ativa — `modulosDoPerfil`, H4) — se a casca não abrir, a regra da Task 10.

## Pontos de encontro com a hml-21 (LINUX 1: 21b → 21d → **P4** → 21c → 21e) — e o que combinar ANTES

O combinado de 13/10 ~08:0x (`p4/LINUX1-21d.md`): o **código local da P4 corre em paralelo à 21d**; o **merge da P4 só depois da 21d** (a P4 rebaseia em
cima); BANCO e git do staging sempre pela trava. A 21d (~26 arquivos) mexe no Treino (`supabase/functions/treinos/**` nova, `_shared/{porta-treino,
treinos-leituras,treinos-regras,leitura-lote}.ts`, a migration do Treino RESERVADA `20261013100000_hml21d_treinos_atomicas.sql` + reversa), no principal (a
`conta` + a consulta `aluno_treino`) e nas telas `src/treino/servidor.ts` (novo), `src/painel/treinos/api.ts` (o PLURAL), `src/painel/busca/Treinos.tsx`,
`src/treino/editor/api.ts` (SÓ o módulo de dados, mesma assinatura — o `EditorTreino.tsx` NÃO), `src/master/app/treinosProntos.ts`, `src/pages/master/BibliotecaPage.tsx`,
`src/app-aluno/sozinho/api.ts`, `src/painel/configuracoes/Perfil.tsx` (só o `espelharNoTreino`) + testes (`src/painel/treinos/*.test.ts*`, `src/master/**/*.test.ts*`);
NADA de `src/painel/aluno/**` nem `src/painel/gates/**`.

| # | Arquivo / assunto | P4 | hml-21 | Combinar |
|---|---|---|---|---|
| 1 | `src/treino/editor/EditorTreino.tsx` | tira o chip do cadeado (Task 6) | a 21d NÃO toca (o combinado) | nada |
| 2 | `src/treino/editor/EditorTreino.test.tsx` | 3 trechos (o chip, a observação, o texto da aba Treino sem login — Task 6) | a 21d muda o `editor/api.ts` que este teste FINGE (`vi.mock("./api")`) — se a 21d precisar mexer no falso, conflito de texto | **perguntar ANTES** (Task 0): "a 21d toca o `EditorTreino.test.tsx`?" — se sim, quem entra depois junta (a P4 rebaseia) |
| 3 | `src/treino/editor/api.ts` | NÃO toca | 21d (`aluno_treino` → `conta`, `exercicios_da_lista` → `treinos`) | nada (a P4 só tira o uso do `salvarConfig({series_travadas})` no editor) |
| 4 | `src/painel/aluno/resumo/acesso/{api.ts, SheetSenhaAluno.tsx}` e `src/painel/aluno/dados/api.ts` | NÃO toca; o card de login passa a morar AO LADO do `api.ts` (`resumo/acesso/CardAcessoAluno.tsx`) | 21c (depois da P4): o miolo → `conta`, mesmas exportações | **avisar** (o card mudou de pasta; o `dados/api.ts` segue com os mesmos nomes de RPC — o pedido dela) |
| 5 | `src/nutricao/semLeituraDireta.test.ts`, `src/integrations/semBancoNoNavegador.test.ts`, `src/integrations/repeticao.ts` | NÃO toca (0 achado nos arquivos novos; o card movido segue na área `painel-aluno`) | só a hml-21 edita | só avisar |
| 6 | `src/lib/logsDasFuncoesTreino.test.ts`, a Guarda (`e2e/hml17/_base.py`, `e2e/w26/prod.py`, `e2e/hml19/guarda_teste.py`) | NÃO toca (nenhuma função nova) | 21d põe a `treinos` | nada |
| 7 | `src/rotas/Rotas.test.tsx` | 1 linha (a lista das abas do aluno + `"acessos"` — Task 4) | não está na lista da 21d | só avisar |
| 8 | `e2e/w08b/telas.py`, `e2e/w14/{telas,prod}.py`, `e2e/w15/telas.py` | as rotas/verificações do que mudou (Task 7) | não usa (os da hml-21 são `e2e/hml21/**`) | só avisar |
| 9 | a rede ao abrir o Resumo e a aba nova | o Resumo perde o `rpc:aluno_acesso` (o card saiu); a aba Acessos chama `aluno_acesso` + `acessos ler` + `treino-acessos ler` | o `rede.py` da hml-21 e a régua da hml-20 contam o `aluno_acesso` como gravação ACEITA (passa a 0 no Resumo — não falha) | **avisar:** a linha de base da 21c com a P4 (já é o plano dela) |
| 10 | contas de TESTE e massa (staging) | w5p-personal (os papéis da conta A trocados e devolvidos no caso C5), w5p-nutri, w5p-aluna (a matrícula A: config, acessos, histórico; o `series_travadas` no Treino — tudo volta), w13-dono (a 2ª matrícula, Massa), w27-master (master só na rodada); **não usa a `w7b-sozinho`** e não faz "Sair" global (só o logout local das sessões do teste) | a 21d usa a `w5p-aluna`/`w5p-personal` no Treino e a `w7b-sozinho` | **combinar a janela** (a trava do BANCO: nenhum E2E das 2 ao mesmo tempo) |
| 11 | 🔒 BANCO do staging | Task 10 (E2E local, ~40 min), Task 12 (E2E de staging + regressão, ~40 min) | a 21d aplica a migration do Treino no `staging` e roda os E2E dela | janelas; nenhuma migration com E2E da outra |
| 12 | 🔒 git | Task 12 (push ff no `staging` — DEPOIS da 21d na `main`), Task 14 (merge, release, realinhar) | os PRs das sub-W (a 21d antes; a 21c depois da P4) | 1 PR por vez; a P4 depois da 21d |
| 13 | `docs/e2e-rodadas.md` | as linhas no topo (Task 13) | as delas | quem entra depois rebaseia |
| 14 | a porta 5173 (a 8080 é da LINUX 1) e a fila do pesado | a prova local, o build do preview, os E2E | os dela | a fila do `flock` |

**Combinar ANTES (Task 0, 1 `SendMessage`):** o item 2 (o `EditorTreino.test.tsx`), os avisos dos itens 4, 7, 8 e 9, e as janelas dos itens 10–12 (a 🔒 BANCO
da Task 10 pode ser já, entre as janelas da 21d; a Task 12 e a 14 só DEPOIS da 21d na `main`).

## Pergunta nova

Nenhuma — a P4 não tem decisão de negócio em aberto (Q3 e Q4 são da P3 e seguem com as recomendadas). O que a spec deixou ambíguo virou decisão técnica
(lista acima), cada uma trocável numa linha.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/painel/aluno/acessos/regras.ts` (+ `.test.ts`) — novo | as 6 linhas, quando aparecem, os avisos, o "Mudado por", o resumo, o estado da linha das séries, o ✓ otimista, a confirmação do bloqueio |
| `src/painel/aluno/acessos/useAcessos.ts` — novo | as consultas (`acessos` e `treino-acessos`, `acao: "ler"`) e as gravações otimistas (React Query) |
| `src/painel/aluno/acessos/LinhaDeAcesso.tsx` — novo | uma linha: o nome, a dica, o aviso, o "Mudado por" e os rádios (ou o texto, o nível fixo, o esqueleto) |
| `src/painel/aluno/acessos/ListaDeAcessos.tsx` (+ `.test.tsx`) — novo | o cartão das linhas: os estados, a confirmação do bloqueio, quem só vê, sem internet, o resumo |
| `src/painel/aluno/abas/Acessos.tsx` (+ `.test.tsx`) — novo | a aba (registro por convenção): o topo, as 2 colunas (as linhas · o Login do aluno) |
| `src/painel/aluno/resumo/CardAcessoAluno.tsx` (+ teste) → `resumo/acesso/` | o card de login muda de pasta (sai do Resumo), igual; o título "Login do aluno" |
| `src/painel/aluno/catalogoAbas.ts` + `.test.ts` | a 7ª aba; o `ORDEM_RESUMO` sem o card de login e com o lugar do `CardRotinas`; a conta da rolagem da barra |
| `src/painel/aluno/AlunoLayout.tsx` | a barra rola até a aba ativa |
| `src/rotas/Rotas.test.tsx` | 1 linha: a lista das abas do aluno com `"acessos"` (defeito 1) |
| `src/painel/aluno/resumo/CardAjustesAluno.tsx`, `src/painel/aluno/dados/regras.ts` (+ `regras.test.ts`), `resumo/cardsW14.test.tsx` | "Mensagens automáticas" só com o WhatsApp; o motivo do link na aba Acessos |
| `src/painel/aluno/Cabecalho.tsx` | o ⋯ "Acesso do aluno" abre a aba Acessos |
| `src/painel/gates/FaixaMensagensDesligadas.tsx` | o texto: "no card Mensagens automáticas" |
| `src/treino/editor/EditorTreino.tsx` + `EditorTreino.test.tsx`, `src/painel/aluno/abas/Treino.tsx` | sem o cadeado das séries; o texto e o link da aba Treino para quem não tem login |
| `src/treino/ui/SeriesDoExercicio.test.tsx` — novo (a mais da §6) | a ponta do app: com as séries travadas, "O número de séries é definido pelo seu profissional." |
| `e2e/wa/telas_acessos.py` — novo | o E2E de tela (site, loja, staging; `--base prod` só leitura; `--seco`; `--limpar`) |
| `e2e/w08b/telas.py`, `e2e/w14/telas.py`, `e2e/w14/prod.py`, `e2e/w15/telas.py` | o que procuravam no lugar antigo |
| `docs/e2e-rodadas.md` | as linhas no topo (as da P4 e as de produção da P3) |
| `docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md` | este plano |
| fora do repo — `~/projetos/physiqcalc-scratch/w-a/p4/` | os scripts de apoio (Apêndice A), `codigo/` (as cópias conferidas dos 10 arquivos novos + `codigo.md5`), `patches/` (as edições por task), `orig/` (os 19 arquivos que a P4 edita, como eram na `f736824` — o `drift.sh` compara), `progresso.log`, `T<N>-FEITA`, as saídas |

**A P4 NÃO toca:** migration, função, `src/acessos/**` e `src/aluno-dia/**` (só importa), `src/painel/aluno/dados/api.ts` e `resumo/acesso/{api,regras}.ts` +
`SheetSenhaAluno.tsx` (H-43 — a 21c), `src/treino/editor/api.ts` (a 21d), `src/nucleo/sessao.tsx`, `src/integrations/**`, as guardas (`semLeituraDireta`,
`semBancoNoNavegador`, `semBancoDireto`, `logsDasFuncoes*`), a Guarda dos E2E, o app do aluno (`src/app-aluno/**`, `src/treino/ui/*.tsx`), `docs/{banco-permissoes,desvios}.md`,
a lista "não tocar" da spec §5.7 e os arquivos da hml-21.

## Estimativa (minutos de trabalho com testes e checagens; sem as esperas de terceiros — a 21d, as travas, o CI, a Vercel)

```
+------+-------------------------------------------------------------------+--------+------------------------+
| Task | O quê                                                             | Melhor | Calibrado              |
+------+-------------------------------------------------------------------+--------+------------------------+
|  0   | Preparar: worktree, npm ci, .env.local, o plano, drift, massa,    |   25   |  12–15                 |
|      | o quadro, os pedidos à LINUX 1                                    |        |                        |
|  1   | As regras da aba (TDD)                                            |   10   |   2–3   (×0,2–0,3)     |
|  2   | As consultas, a linha e a lista (TDD)                             |   25   |   4–6                  |
|  3   | O card de login muda de pasta (TDD)                               |   10   |   2–3                  |
|  4   | A aba, o catálogo e a barra (TDD)                                 |   15   |   3–5                  |
|  5   | O Resumo e o cabeçalho (TDD)                                      |   20   |   4–6                  |
|  6   | O Treino: o editor sem o cadeado + a ponta do app (TDD)           |   15   |   3–5                  |
|  7   | Os E2E antigos (w08b, w14, w15): compila, commit                  |   15   |   3–4                  |
|  8   | O E2E novo (--seco, compila) + as guardas                         |   15   |   3–5                  |
|  9   | A prova local completa (o CI + as provas da P4)                   |   35   |  20–30  (a máquina)    |
| 10   | E2E de tela LOCAL (5173: site e loja) + os prints                 |   45   |  30–40                 |
| 11   | Depois da 21d na main: drift --main, rebase, a prova local de novo|   30   |  15–25                 |
| 12   | STAGING: push ff, Vercel, E2E de staging + a regressão tocada     |   40   |  25–35                 |
| 13   | As rodadas + PR + CI                                              |   25   |  10–15                 |
| 14   | Merge → release → bump → staging = main → smoke SÓ LEITURA        |   35   |  20–30                 |
| 15   | Fechar                                                            |   15   |   5–10                 |
+------+-------------------------------------------------------------------+--------+------------------------+
| TOTAL| código 185 (Tasks 0–9) + esteira 190 (Tasks 10–15)                |  375   | 161–237 (2h41 a 3h57)  |
+------+-------------------------------------------------------------------+--------+------------------------+
```

**A calibração:** na P3 as Tasks 1–10 (o código já rodado no ensaio, as cópias e os patches prontos) levaram **29 min para 245 de melhor caso (×0,12)** —
17 deles num teste intermitente que não era da P3; a prova local 19 min; o E2E local (site + loja) 21 min; o staging 4 min (depois da espera); o PR + CI 9;
o merge → release → realinhar → smoke 25; fechar 2. Aqui o código JÁ RODOU no ensaio e no ensaio 2 (as Tasks 1–8 refeitas numa cópia limpa com os mesmos
comandos — os placares deste plano são os de lá) → **×0,2–0,3 nas Tasks 1–8** (folga para a fila do pesado); a prova local, os E2E, o CI e a release são
tempo de máquina e de espera (×0,6–1,0). O mestre previa 355 (225 + 130); o código cai (o ensaio) e a esteira sobe 60 (o rebase em cima da 21d com a prova de
novo, a regressão das famílias tocadas no staging e a loja). **Previsão: 2h41 a 3h57 de trabalho (pior cenário 6h15 — o melhor caso sem calibrar)**, mais a
ESPERA da 21d (a P4 fica pronta para o staging ao fim da Task 10 e espera o merge da 21d — a hml-21 estima a 21d em 7h a 8h, pior 11h30). Atrasou → avisar antes.

## Comandos (valem em todas as tasks)

- **Todo comando começa com `cd ~/projetos/physiqcalc-wa-p4 &&`** (W) ou `cd ~/projetos/physiqcalc-scratch/w-a/p4 &&` (S) — o cwd volta ao inicial a cada
  chamada. Variável não sobrevive entre chamadas: repetir na mesma linha.
- **Contra o diálogo de permissão (travou um agente 1h30 na P1):** nada de `bash -c '…'`, `sh -c`, subshell `( … )` com `time`, `eval` nem `$(…)` na linha de
  comando; passo complexo = script em arquivo em `~/projetos/physiqcalc-scratch/w-a/p4/` (o conteúdo está no Apêndice A); `rm` só com caminho literal ou
  `"${VAR:?}/…"`. Python de mais de 1 linha = arquivo (nada de heredoc na linha de comando). Valor do dia (sha, nº do PR, hora) = ler num comando e escrever
  o valor no seguinte.
- **Pesado na fila, com 2 workers e o `TMPDIR` do scratch:** Vitest = `bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh <arquivos…>`; o resto =
  `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P <cmd>`. **Rodada grande (o lint e o
  Vitest do repo inteiro, o build) só nas Tasks 9 e 11**; entre as rodadas, a fila livre (a LINUX 1 usa a mesma).
- **Python sem bytecode no repo:** `PYTHONDONTWRITEBYTECODE=1`; sintaxe por `python3 -c "compile(open('<arq>').read(), '<arq>', 'exec'); print('compila ok')"`.
- **Os arquivos novos vêm das cópias conferidas:** `bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh <caminho no repo>…` (não sobrescreve; confere o md5 de
  `codigo.md5`; o conteúdo é o dos blocos deste plano). **As edições** nos arquivos que existem: `git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/<task>.patch`
  (o drift da Task 0 diz se aplicam; o da Task 3 é um RENAME — o `git apply` apaga o caminho velho e cria o novo). Se um não aplicar, fazer a edição à mão pelo
  bloco `diff` da task.
- **Commit (o comando INTEIRO, só os arquivos da task):**
  `git add <arquivos> && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`
  (num rename, os 2 caminhos — o velho e o novo — nos 2 lugares).
- **Aviso de progresso (regra global):** `HHhMM a HHhMM (pior cenário HHhMM)` + as fases (✅ · 🚧 · ⏳), uma por linha, terminal + tópico; a cada ~30 min num
  agente longo. Cada task fechada → `bash ~/projetos/physiqcalc-scratch/w-a/p4/feita.sh <N> "<resumo>" "<linha>"…`.
- **Coordenação (mestre §0, quadro):** trava 🔒 no quadro + `SendMessage` à LINUX 1 (a sessão da linha dela no quadro) + esperar o "pode ir" antes de: E2E com
  massa no staging (Tasks 10 e 12), push no `staging` (Task 12), merge na `main` e o realinhar (Task 14). Soltou → "livre" + aviso. Quem executa as tasks e não
  é o coordenador anota no `progresso.log` o que é do quadro. **Staging e merge só DEPOIS da 21d na `main`** (Task 11).

---

### Task 0: Preparar (a worktree nova, o plano no repo, o drift, a massa SÓ LEITURA, o quadro, os pedidos à LINUX 1)

**Files:** o plano (`docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md`); fora do repo, nada novo (os scripts de `p4/` já existem).
**Estimativa:** 25 min (calibrado 12–15).

- [ ] **Step 1: O estado do git e da outra sessão (comando ISOLADO)**

Run: `git -C ~/projetos/physiqcalc fetch origin && git -C ~/projetos/physiqcalc log origin/main --oneline -5 && git -C ~/projetos/physiqcalc log origin/staging --oneline -2 && gh pr list --repo weslleybertoldo/physiqcalc --state open && sed -n 1,12p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md`
Expected: na `origin/main`, o squash "W-A P3: …" (`c042780`) e o `chore: bump version to v3.115` (`f736824`) — ou mais novo (a 21b ou a 21d já entraram: segue,
o drift diz se mexeram nos arquivos da P4); nenhum PR aberto mexendo em `src/painel/aluno/**`, `src/treino/editor/EditorTreino*`, `src/painel/gates/**`,
`src/rotas/Rotas.test.tsx`, `e2e/wa/` ou `e2e/{w08b,w14,w15}/`. A linha da LINUX 1 no quadro: em que sub-W ela está (a P4 começa o código já; o staging só
depois da 21d).

- [ ] **Step 2: As funções da W-A publicadas (SÓ LEITURA)**

Run: `python3 ~/projetos/physiqcalc-scratch/w-a/p4/funcoes_wa.py --esperar-publicadas`
Expected: `acessos` e `aluno-dia` (principal, `verify_jwt` True) e `treino-acessos` (Treino, False) ACTIVE → `esperado: True`.

- [ ] **Step 3: A worktree nova da `origin/main`, o `.env.local` do staging e as dependências**

Run: `git -C ~/projetos/physiqcalc worktree add -b feat/w-a-p4-aba-acessos ~/projetos/physiqcalc-wa-p4 origin/main && cp ~/projetos/physiqcalc-acessos/.env.local ~/projetos/physiqcalc-wa-p4/.env.local && grep -c "^VITE_DB_SCHEMA=staging$" ~/projetos/physiqcalc-wa-p4/.env.local`
Expected: a worktree em `~/projetos/physiqcalc-wa-p4` na branch `feat/w-a-p4-aba-acessos` e `1` (o build local é o de staging). A worktree da P1 já
removida → copiar de `~/projetos/physiqcalc-w2/.env.local` (o mesmo arquivo; conferido em 13/10). Depois:
`cd ~/projetos/physiqcalc-wa-p4 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npm ci`
Expected: `added … packages` sem erro (~3–6 min).

- [ ] **Step 4: O plano no repo**

Run: `cd ~/projetos/physiqcalc-wa-p4 && cp ~/projetos/physiqcalc-scratch/w-a/p4/plano-p4.md docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md && git add docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(w-a): plano da P4 (aba Acessos)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md`
Expected: 1 commit novo.

- [ ] **Step 5: O drift (o que o plano usa ainda é o que era)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && PATH=~/.local/node/bin:$PATH bash ~/projetos/physiqcalc-scratch/w-a/p4/drift.sh`
Expected: `drift: rc=0` — os 19 arquivos que a P4 edita "igual" aos de `p4/orig` e "o patch das edições aplica"; o contrato da P2 "ok" em todos; as guardas
"ok" (a área `painel-aluno` com a pasta `resumo/`, as RPCs do card de login e do `dados/api.ts` ainda nomeadas, as pastas da P4 na guarda da W-A); o registro
"ok"; os arquivos novos "livre". Alguma linha MUDOU/FALTA → ANTES de codar: abrir o diff (`git diff --no-index ~/projetos/physiqcalc-scratch/w-a/p4/orig/<arq> <arq>`),
ajustar a edição da task daquele arquivo à mão (o bloco `diff` da task diz o que muda), rodar os testes da task e anotar no `progresso.log`. Um "AVISO" (a 21c
entrou e mudou as RPCs do card de login) não para: a P4 não mexe nelas — só conferir que o `resumo/acesso/api.ts` exporta o mesmo (a linha "ok" das 3 funções).

- [ ] **Step 6: A massa de TESTE e a saúde (SÓ LEITURA)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p4/massa_p4.py && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p4/saude.py "a P4"`
Expected: `matricula_a 1`, `conta_a_e_a_do_personal 1`, `personal_dono_e_personal 1`, `nutri_na_conta_a ≥ 1`, `conta_do_w13 ≥ 1`, `master_com_profile 1`,
`master_ja_master 0`, a identidade do Treino da aluna `≥ 1`, as sobras da W-A todas 0, nenhum estado com massa → `massa de TESTE pronta para o E2E da P4: True`;
o `/health` dos 2 projetos ACTIVE_HEALTHY e `longas 0, esperando 0`. Sobra de outra parte → o `--limpar` dela antes; o w27-master já master no staging → alguém
deixou: conferir no quadro quem (não tirar sem saber).

- [ ] **Step 7: O quadro (o coordenador escreve; quem executa só anota no `progresso.log`)** — a linha da W-A: "🚧 P4 (painel: aba Acessos) desde HH:MM —
  worktree `~/projetos/physiqcalc-wa-p4` (`feat/w-a-p4-aba-acessos` da `main` `<sha>`). RESERVADOS: `src/painel/aluno/acessos/**`, `src/painel/aluno/abas/Acessos.tsx`
  (+ teste), `src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx` (+ teste — movidos de `resumo/`), `src/treino/ui/SeriesDoExercicio.test.tsx`, `e2e/wa/telas_acessos.py`,
  `docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md`; edita: `src/painel/aluno/{catalogoAbas.ts,catalogoAbas.test.ts,AlunoLayout.tsx,Cabecalho.tsx,abas/Treino.tsx,
  dados/regras.ts,dados/regras.test.ts,resumo/CardAjustesAluno.tsx,resumo/cardsW14.test.tsx}`, `src/painel/gates/FaixaMensagensDesligadas.tsx`,
  `src/treino/editor/{EditorTreino.tsx,EditorTreino.test.tsx}`, `src/rotas/Rotas.test.tsx` (1 linha), `e2e/{w08b/telas.py,w14/telas.py,w14/prod.py,w15/telas.py}`, o topo do
  `docs/e2e-rodadas.md`; sem migration, sem função; janelas pedidas: 🔒 BANCO (Task 10: E2E local; Task 12: staging) e 🔒 git (Tasks 12 e 14) — staging e merge
  DEPOIS da 21d".

- [ ] **Step 8: Os pedidos à LINUX 1 (1 `SendMessage`, à sessão da linha dela no quadro)**: "W-A P4 (painel: aba Acessos) começou o código LOCAL (worktree
  `~/projetos/physiqcalc-wa-p4`; o staging e o merge só DEPOIS da sua 21d na `main` — a P4 rebaseia em cima, como combinado). 1) Arquivos — nenhum da 21d:
  novos `src/painel/aluno/acessos/**`, `src/painel/aluno/abas/Acessos.tsx`, `src/treino/ui/SeriesDoExercicio.test.tsx`, `e2e/wa/telas_acessos.py`; o card de login
  MUDA DE PASTA para `src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx` (ao lado do `api.ts` que a 21c vai mexer — a P4 não toca o `api.ts`, o
  `SheetSenhaAluno` nem o `dados/api.ts`: os nomes de RPC ficam); edito `src/treino/editor/EditorTreino.tsx` (tiro o cadeado) e **`src/treino/editor/EditorTreino.test.tsx`
  (3 trechos) — a 21d toca nesse teste (o falso do `./api`)? Se sim, quem entra depois junta**; e `src/rotas/Rotas.test.tsx` (1 linha: a lista das abas do aluno
  ganha `"acessos"`), `e2e/{w08b,w14,w15}` (o que mudou de lugar). 2) A sua guarda do navegador: 0 achado nos arquivos novos; a `semLeituraDireta` intocada e verde.
  3) A rede: o Resumo deixa de chamar o `aluno_acesso` (o card foi para a aba Acessos) e a aba nova chama `aluno_acesso` + `acessos ler` + `treino-acessos ler`
  — a sua régua conta o `aluno_acesso` como gravação aceita (passa a 0 no Resumo; não falha) e a linha de base da 21c vem com a P4. 4) Janelas (cada uma com o seu
  'pode ir'): 🔒 BANCO do staging ~40 min para o E2E LOCAL (Task 10 — pode ser já, num intervalo da 21d; uso a w5p-personal/nutri/aluna, o w13-dono e o w27-master
  como master só na rodada; troco e devolvo os papéis da conta A do w5p-personal num caso de ~3 min; NÃO uso a `w7b-sozinho` nem faço 'Sair' global); depois da 21d
  na `main`: 🔒 git + BANCO ~40 min (push ff no `staging` + E2E de staging + a regressão do w15/w08b/w14) e o git do merge/realinhar. 5) `docs/e2e-rodadas.md`:
  só o topo." → a resposta no `progresso.log`.

- [ ] **Step 9: Previsão + marca** — o aviso de progresso (terminal + tópico) com `HHhMM a HHhMM (pior cenário HHhMM)` e as fases;
  `bash ~/projetos/physiqcalc-scratch/w-a/p4/feita.sh 0 "worktree, npm ci, plano, drift rc=0, massa pronta, pedidos à LINUX 1" "<o que o Step 1 e o 6 mostraram>"`.

---

### Task 1: As regras da aba — `src/painel/aluno/acessos/regras.ts` (TDD)

**Files:** Create `src/painel/aluno/acessos/regras.ts`, `src/painel/aluno/acessos/regras.test.ts`.
**Estimativa:** 10 min (calibrado 2–3).

- [ ] **Step 1: O teste (vermelho)** — `cd ~/projetos/physiqcalc-wa-p4 && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh src/painel/aluno/acessos/regras.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/acessos/regras.test.ts`
  → FAIL `Failed to resolve import "./regras"`.

`src/painel/aluno/acessos/regras.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { AcessosDoAluno } from "@/acessos/tipos";
import {
  LINHAS_DE_ACESSO, TEXTOS, avisoDaLinha, comNivel, confirmacaoDoBloqueio, dicaDaLinha, estadoDasSeries, linhasVisiveis, nivelDaLinha, pedeConfirmacao,
  resumoDosAcessos, textoDaMudanca, type EstadoDasSeries,
} from "./regras";

const acessos = (o: Partial<AcessosDoAluno> = {}): AcessosDoAluno => ({
  paciente_id: "p1", tem_login: true, modulos: ["treino", "nutricao"], conta_modulos: ["treino", "nutricao"], tem_nutricionista: true, pode_mudar: true,
  linhas: { acesso_app: "liberado", diario_alimentar: "liberado", acesso_link: "liberado", dieta: "ver" }, mudancas: {}, ...o,
});
const frase = (c: string) => `frase:${c}`;
const pronto = (series: "ver" | "mexer"): EstadoDasSeries => ({ tipo: "pronto", series, podeMudar: true });

describe("W-A P4 — as 6 linhas da aba Acessos (spec §4.1)", () => {
  it("a ordem e os níveis da tabela da spec (com a cor: neutro · azul · verde)", () => {
    expect(LINHAS_DE_ACESSO.map((l) => l.chave)).toEqual(["acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas"]);
    expect(LINHAS_DE_ACESSO.map((l) => l.rotulo)).toEqual([
      "Acesso ao app", "Treino — séries", "Dieta", "Diário alimentar com fotos", "Envio de fotos pelo link", "Rotinas",
    ]);
    const niveis = Object.fromEntries(LINHAS_DE_ACESSO.map((l) => [l.chave, l.niveis.map((n) => `${n.rotulo}/${n.tom}`)]));
    expect(niveis.acesso_app).toEqual(["Bloqueado/neutro", "Liberado/verde"]);
    expect(niveis.treino_series).toEqual(["Só ver/azul", "Pode mexer/verde"]);
    expect(niveis.dieta).toEqual(["Só ver/azul", "Pode mexer/verde"]);
    expect(niveis.rotinas).toEqual(["Sempre liberadas/verde"]);
  });

  it("quando aparece: as séries só com Treino; o diário e o link só com nutricionista de verdade; o resto sempre", () => {
    expect(linhasVisiveis(acessos()).map((l) => l.chave)).toEqual(["acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas"]);
    expect(linhasVisiveis(acessos({ modulos: ["nutricao"] })).map((l) => l.chave)).toEqual(["acesso_app", "dieta", "diario_alimentar", "acesso_link", "rotinas"]);
    expect(linhasVisiveis(acessos({ modulos: ["treino"], tem_nutricionista: false })).map((l) => l.chave)).toEqual(["acesso_app", "treino_series", "dieta", "rotinas"]);
  });

  it("a dica das rotinas só aponta para o card Rotinas do Resumo quando ele existe (a P6)", () => {
    const rotinas = LINHAS_DE_ACESSO.find((l) => l.chave === "rotinas")!;
    expect(dicaDaLinha(rotinas, false)).toBe("Ele cria, muda e apaga as rotinas dele (creatina, remédio…).");
    expect(dicaDaLinha(rotinas, true)).toBe("Ele cria, muda e apaga as rotinas dele (creatina, remédio…). As suas você cria no card Rotinas do Resumo.");
    expect(dicaDaLinha(LINHAS_DE_ACESSO[0], true)).toBe(LINHAS_DE_ACESSO[0].dica);
  });

  it("os avisos: sem login no app; o link sem o diário; as séries antes do 1º acesso, de outra conta ou com erro", () => {
    expect(avisoDaLinha("acesso_app", acessos({ tem_login: false }))).toBe("Ele ainda não tem login: crie o acesso em Login do aluno.");
    expect(avisoDaLinha("acesso_app", acessos())).toBeNull();
    expect(avisoDaLinha("acesso_link", acessos({ linhas: { ...acessos().linhas, diario_alimentar: "bloqueado" } }))).toBe("Vale quando o diário estiver liberado.");
    expect(avisoDaLinha("acesso_link", acessos())).toBeNull();
    expect(avisoDaLinha("treino_series", acessos(), { tipo: "antes_do_acesso" })).toBe("Vale depois do 1º acesso do aluno ao app.");
    expect(avisoDaLinha("treino_series", acessos(), { tipo: "outra_conta" })).toBe(TEXTOS.seriesOutraConta);
    expect(avisoDaLinha("treino_series", acessos(), { tipo: "erro", mensagem: "Não deu para ler o Treino agora." })).toBe("Não deu para ler o Treino agora.");
    expect(avisoDaLinha("treino_series", acessos(), pronto("ver"))).toBeNull();
  });
});

describe("W-A P4 — a linha das séries carrega à parte (Banco do Treino)", () => {
  const erro = (codigo: string) => ({ isLoading: false, isError: true, error: { codigo }, data: undefined });
  it("sem Treino a linha some; carregando; pronto com o nível e quem muda", () => {
    expect(estadoDasSeries(false, { isLoading: true, isError: false, error: null }, frase)).toEqual({ tipo: "fora" });
    expect(estadoDasSeries(true, { isLoading: true, isError: false, error: null }, frase)).toEqual({ tipo: "carregando" });
    expect(estadoDasSeries(true, { isLoading: false, isError: false, error: null, data: { series: "ver", pode_mudar: false } }, frase))
      .toEqual({ tipo: "pronto", series: "ver", podeMudar: false });
  });

  it("sem_treino = antes do 1º acesso; sem_acesso = o Treino de outra conta; o resto = o erro da linha (com a frase só nos códigos que explicam)", () => {
    expect(estadoDasSeries(true, erro("sem_treino"), frase)).toEqual({ tipo: "antes_do_acesso" });
    expect(estadoDasSeries(true, erro("sem_acesso"), frase)).toEqual({ tipo: "outra_conta" });
    expect(estadoDasSeries(true, erro("principal_indisponivel"), frase)).toEqual({ tipo: "erro", mensagem: "Não deu para ler o Treino agora." });
    expect(estadoDasSeries(true, erro("rede"), frase)).toEqual({ tipo: "erro", mensagem: "Não deu para ler o Treino agora." });
    expect(estadoDasSeries(true, erro("sem_internet"), frase)).toEqual({ tipo: "erro", mensagem: "frase:sem_internet" });
    expect(estadoDasSeries(true, { isLoading: false, isError: true, error: new Error("x") }, frase)).toEqual({ tipo: "erro", mensagem: "Não deu para ler o Treino agora." });
  });

  it("o nível marcado de cada linha (as séries só quando prontas; as rotinas sempre)", () => {
    const l = acessos().linhas;
    expect(nivelDaLinha("acesso_app", l, pronto("ver"))).toBe("liberado");
    expect(nivelDaLinha("dieta", l, pronto("ver"))).toBe("ver");
    expect(nivelDaLinha("treino_series", l, pronto("mexer"))).toBe("mexer");
    expect(nivelDaLinha("treino_series", l, { tipo: "carregando" })).toBeNull();
    expect(nivelDaLinha("rotinas", l, { tipo: "fora" })).toBe("sempre");
  });
});

describe("W-A P4 — o 'Mudado por', o resumo do rodapé e o ✓ otimista", () => {
  it("'Mudado por Ana em 12/10 17:20' no horário de São Paulo; sem o nome (o servidor), 'Mudado em'; sem mudança, nada", () => {
    expect(textoDaMudanca({ de: "liberado", para: "bloqueado", em: "2026-10-12T20:20:00Z", por_nome: "Ana Paula Souza" })).toBe("Mudado por Ana em 12/10 17:20");
    expect(textoDaMudanca({ de: "ver", para: "mexer", em: "2026-10-13T02:05:00Z", por_nome: null })).toBe("Mudado em 12/10 23:05");
    expect(textoDaMudanca(undefined)).toBeNull();
    expect(textoDaMudanca({ de: "a", para: "b", em: "não é data", por_nome: "Ana" })).toBeNull();
  });

  it("o resumo: 'App liberado · séries: pode mexer · dieta: só ver · rotinas sempre' (o exemplo da spec) e as variações", () => {
    expect(resumoDosAcessos(acessos(), pronto("mexer"))).toBe("App liberado · séries: pode mexer · dieta: só ver · rotinas sempre");
    expect(resumoDosAcessos(acessos({ linhas: { ...acessos().linhas, acesso_app: "bloqueado", dieta: "mexer" } }), pronto("ver")))
      .toBe("App bloqueado · séries: só ver · dieta: pode mexer · rotinas sempre");
    expect(resumoDosAcessos(acessos({ tem_login: false, tem_nutricionista: false }), { tipo: "antes_do_acesso" })).toBe("App sem login · rotinas sempre");
  });

  it("o ✓ otimista troca só a chave escolhida; só 'App: Bloqueado' pede confirmação (com o nome)", () => {
    const d = acessos();
    const novo = comNivel(d, "dieta", "mexer");
    expect(novo.linhas).toEqual({ ...d.linhas, dieta: "mexer" });
    expect(novo.mudancas).toBe(d.mudancas);
    expect(pedeConfirmacao("acesso_app", "bloqueado")).toBe(true);
    expect(pedeConfirmacao("acesso_app", "liberado")).toBe(false);
    expect(pedeConfirmacao("diario_alimentar", "bloqueado")).toBe(false);
    expect(confirmacaoDoBloqueio("Rafael Moura").titulo).toBe("Bloquear o app de Rafael?");
    expect(confirmacaoDoBloqueio(null).titulo).toBe("Bloquear o app do aluno?");
  });
});
```

- [ ] **Step 2: As regras (verde)** — `cd ~/projetos/physiqcalc-wa-p4 && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh src/painel/aluno/acessos/regras.ts && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/acessos/regras.test.ts`
  → `Tests 10 passed (10)`.

`src/painel/aluno/acessos/regras.ts`:
```ts
// Physiq W-A P4 — regras PURAS da aba Acessos do Painel › Aluno (spec W-A §4.1, §4.7; P1–P4): as 6 linhas na ordem da tabela da spec
// (Acesso ao app · Treino — séries · Dieta · Diário alimentar com fotos · Envio de fotos pelo link · Rotinas), os níveis de cada uma com a
// cor (neutro · azul · verde — o molde AcessosDoMembro do Nativo OS), quando cada linha aparece, o aviso embaixo dela, o "Mudado por <nome>
// em dd/mm hh:mm", o resumo do rodapé e o estado da linha das séries (que carrega à parte, do Banco do Treino). Testado em regras.test.ts.
// Os dados vêm da função acessos (src/acessos/api.ts) e da treino-acessos (as séries); nada aqui fala com a rede.
import type { AcessosDoAluno, ChaveDeAcesso, LinhasDeAcesso, MudancaDeAcesso, NivelDasSeries } from "@/acessos/tipos";
import { primeiroNome } from "../dados/regras";

/** As linhas da aba: as 4 da função acessos, as séries (treino-acessos) e as rotinas (sempre liberadas, sem botão). */
export type ChaveDaLinha = ChaveDeAcesso | "treino_series" | "rotinas";
/** A cor do nível marcado (spec §4.1): neutro (Bloqueado), azul (Só ver), verde (Liberado / Pode mexer / Sempre). */
export type TomDoNivel = "neutro" | "azul" | "verde";

export interface NivelDaLinha {
  valor: string;
  rotulo: string;
  tom: TomDoNivel;
}

export interface DefLinha {
  chave: ChaveDaLinha;
  rotulo: string;
  niveis: readonly NivelDaLinha[];
  dica: string;
}

const APP: readonly NivelDaLinha[] = [
  { valor: "bloqueado", rotulo: "Bloqueado", tom: "neutro" },
  { valor: "liberado", rotulo: "Liberado", tom: "verde" },
];
const VER_MEXER: readonly NivelDaLinha[] = [
  { valor: "ver", rotulo: "Só ver", tom: "azul" },
  { valor: "mexer", rotulo: "Pode mexer", tom: "verde" },
];

/** As 6 linhas, na ordem da tabela da spec §4.1 (os textos são os de lá). */
export const LINHAS_DE_ACESSO: readonly DefLinha[] = [
  {
    chave: "acesso_app", rotulo: "Acesso ao app", niveis: APP,
    dica: "Bloqueado: o app abre fechado com \"Seu acesso ao app está desligado. Fale com seu profissional\".",
  },
  {
    chave: "treino_series", rotulo: "Treino — séries", niveis: VER_MEXER,
    dica: "Só ver: ele não põe nem tira séries (o nº vem do treino). Pode mexer: põe e tira séries no app.",
  },
  {
    chave: "dieta", rotulo: "Dieta", niveis: VER_MEXER,
    dica: "Só ver: como hoje — vê o plano e marca o que comeu. Pode mexer: no dia dele, põe e tira alimentos, cria refeições extras e os próprios alimentos e receitas. O plano não muda.",
  },
  {
    chave: "diario_alimentar", rotulo: "Diário alimentar com fotos", niveis: APP,
    dica: "O aluno manda fotos das refeições (no app e pelo link) e você reage.",
  },
  {
    chave: "acesso_link", rotulo: "Envio de fotos pelo link", niveis: APP,
    dica: "Ele manda as fotos pelo link do diário, sem entrar no app.",
  },
  {
    chave: "rotinas", rotulo: "Rotinas", niveis: [{ valor: "sempre", rotulo: "Sempre liberadas", tom: "verde" }],
    dica: "Ele cria, muda e apaga as rotinas dele (creatina, remédio…).",
  },
];

export const TEXTOS = {
  semLoginApp: "Ele ainda não tem login: crie o acesso em Login do aluno.",
  semDieta: "Este aluno não tem dieta",
  linkSemDiario: "Vale quando o diário estiver liberado.",
  seriesAntesDoAcesso: "Vale depois do 1º acesso do aluno ao app.",
  // o texto da aba Treino para o Treino que esta conta não vê (src/painel/aluno/abas/Treino.tsx, "sem-acesso")
  seriesOutraConta: "Treino de outro personal: só o personal responsável por este aluno e o dono da conta veem o treino dele.",
  seriesErro: "Não deu para ler o Treino agora.",
  /** a 2ª frase da dica das rotinas — só quando o card Rotinas do Resumo existe (a P6 o cria; o registro diz) */
  rotinasDoProfissional: "As suas você cria no card Rotinas do Resumo.",
  soLeitura: "Você vê os acessos; quem muda é o dono da conta ou um profissional deste aluno.",
  semInternet: "Sem internet: os acessos voltam a mudar quando a conexão voltar.",
  salvo: "Salvo",
  erroPadrao: "Não deu certo agora. Tente de novo.",
} as const;

/** O que a linha das séries mostra (ela carrega à parte, do Banco do Treino — spec §4.1 e §4.7). */
export type EstadoDasSeries =
  | { tipo: "fora" }
  | { tipo: "carregando" }
  | { tipo: "pronto"; series: NivelDasSeries; podeMudar: boolean }
  | { tipo: "antes_do_acesso" }
  | { tipo: "outra_conta" }
  | { tipo: "erro"; mensagem: string };

/** Os códigos em que a linha das séries diz o motivo (a frase fixa do código); o resto é "Não deu para ler o Treino agora." */
const ERROS_COM_FRASE = new Set(["sem_internet", "sem_login", "muitas_acoes"]);

/**
 * O estado da linha das séries a partir da consulta: sem o módulo Treino a linha não aparece; sem_treino (antes do 1º acesso) e sem_acesso
 * (o mesmo login em 2 contas: o Treino é de outra conta — o acessos_ler desta já passou) viram o texto da linha; o resto, o erro dela.
 * `fraseDoCodigo` = a frase fixa de src/acessos/api.ts (passada de fora: estas regras não importam o cliente da rede).
 */
export function estadoDasSeries(
  comTreino: boolean,
  q: { isLoading: boolean; isError: boolean; error: unknown; data?: { series: NivelDasSeries; pode_mudar: boolean } | null },
  fraseDoCodigo: (codigo: string) => string,
): EstadoDasSeries {
  if (!comTreino) return { tipo: "fora" };
  if (q.isLoading) return { tipo: "carregando" };
  if (q.isError || !q.data) {
    const codigo = (q.error as { codigo?: unknown } | null)?.codigo;
    if (codigo === "sem_treino") return { tipo: "antes_do_acesso" };
    if (codigo === "sem_acesso") return { tipo: "outra_conta" };
    return { tipo: "erro", mensagem: typeof codigo === "string" && ERROS_COM_FRASE.has(codigo) ? fraseDoCodigo(codigo) : TEXTOS.seriesErro };
  }
  return { tipo: "pronto", series: q.data.series, podeMudar: q.data.pode_mudar };
}

/** As linhas que aparecem para este aluno (spec §4.1, "Quando aparece"): as séries só com Treino; o diário e o link só com nutricionista. */
export function linhasVisiveis(d: Pick<AcessosDoAluno, "modulos" | "tem_nutricionista">): DefLinha[] {
  return LINHAS_DE_ACESSO.filter((l) => {
    if (l.chave === "treino_series") return d.modulos.includes("treino");
    if (l.chave === "diario_alimentar" || l.chave === "acesso_link") return d.tem_nutricionista;
    return true;
  });
}

/** A dica da linha (a das rotinas ganha a 2ª frase quando o card Rotinas do Resumo existe). */
export function dicaDaLinha(l: DefLinha, comCardRotinas: boolean): string {
  return l.chave === "rotinas" && comCardRotinas ? `${l.dica} ${TEXTOS.rotinasDoProfissional}` : l.dica;
}

/** O aviso embaixo da linha (o que muda de verdade para ESTE aluno), ou null. */
export function avisoDaLinha(chave: ChaveDaLinha, d: Pick<AcessosDoAluno, "tem_login" | "linhas">, series?: EstadoDasSeries): string | null {
  if (chave === "acesso_app" && !d.tem_login) return TEXTOS.semLoginApp;
  if (chave === "acesso_link" && d.linhas.diario_alimentar === "bloqueado") return TEXTOS.linkSemDiario;
  if (chave === "treino_series" && series) {
    if (series.tipo === "antes_do_acesso") return TEXTOS.seriesAntesDoAcesso;
    if (series.tipo === "outra_conta") return TEXTOS.seriesOutraConta;
    if (series.tipo === "erro") return series.mensagem;
  }
  return null;
}

/** "12/10 17:20" no horário de São Paulo. */
function diaEHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} ${hora}`;
}

/** "Mudado por Ana em 12/10 17:20" (o 1º nome; sem o nome — o servidor mudou — "Mudado em …"); sem mudança registrada, null. */
export function textoDaMudanca(m: MudancaDeAcesso | null | undefined): string | null {
  if (!m?.em) return null;
  const quando = diaEHora(m.em);
  if (!quando) return null;
  const quem = primeiroNome(m.por_nome);
  return quem ? `Mudado por ${quem} em ${quando}` : `Mudado em ${quando}`;
}

/** O nível marcado: as 4 da função acessos; as séries da treino-acessos; as rotinas, sempre. */
export function nivelDaLinha(chave: ChaveDaLinha, linhas: LinhasDeAcesso, series: EstadoDasSeries): string | null {
  if (chave === "rotinas") return "sempre";
  if (chave === "treino_series") return series.tipo === "pronto" ? series.series : null;
  return linhas[chave];
}

/** "App liberado · séries: pode mexer · dieta: só ver · rotinas sempre" (spec §4.1 — o resumo do rodapé). */
export function resumoDosAcessos(d: Pick<AcessosDoAluno, "tem_login" | "tem_nutricionista" | "linhas">, series: EstadoDasSeries): string {
  const partes = [!d.tem_login ? "App sem login" : d.linhas.acesso_app === "liberado" ? "App liberado" : "App bloqueado"];
  if (series.tipo === "pronto") partes.push(`séries: ${series.series === "mexer" ? "pode mexer" : "só ver"}`);
  if (d.tem_nutricionista) partes.push(`dieta: ${d.linhas.dieta === "mexer" ? "pode mexer" : "só ver"}`);
  partes.push("rotinas sempre");
  return partes.join(" · ");
}

/** O ✓ otimista: a aba com o nível novo de uma chave (o resto igual). */
export function comNivel<T extends Pick<AcessosDoAluno, "linhas">>(d: T, chave: ChaveDeAcesso, valor: string): T {
  return { ...d, linhas: { ...d.linhas, [chave]: valor } };
}

/** Só bloquear o app pede confirmação (spec §2.2-5: é o único nível que fecha algo para o aluno). */
export const pedeConfirmacao = (chave: ChaveDaLinha, valor: string): boolean => chave === "acesso_app" && valor === "bloqueado";

/** O texto da confirmação de "App: Bloqueado". */
export function confirmacaoDoBloqueio(nome: string | null | undefined): { titulo: string; descricao: string } {
  const primeiro = primeiroNome(nome);
  return {
    titulo: primeiro ? `Bloquear o app de ${primeiro}?` : "Bloquear o app do aluno?",
    descricao: "O app abre fechado com \"Seu acesso ao app está desligado. Fale com seu profissional\". Você libera de novo quando quiser.",
  };
}
```

- [ ] **Step 3: Commit** — `feat(w-a): as regras da aba Acessos (as 6 linhas, quando aparecem, os avisos, o "Mudado por", o resumo, a linha das séries)` com os 2
  arquivos; `feita.sh 1 "regras da aba 10/10" "<placar>"`.

---

### Task 2: As consultas, a linha e a lista (TDD)

**Files:** Create `src/painel/aluno/acessos/useAcessos.ts`, `src/painel/aluno/acessos/LinhaDeAcesso.tsx`, `src/painel/aluno/acessos/ListaDeAcessos.tsx`,
`src/painel/aluno/acessos/ListaDeAcessos.test.tsx`.
**Estimativa:** 25 min (calibrado 4–6).

- [ ] **Step 1: O teste (vermelho)** — `cd ~/projetos/physiqcalc-wa-p4 && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh src/painel/aluno/acessos/ListaDeAcessos.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/acessos/ListaDeAcessos.test.tsx`
  → FAIL `Failed to resolve import "./ListaDeAcessos"`.

`src/painel/aluno/acessos/ListaDeAcessos.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcessosDoAluno } from "@/acessos/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({
  ler: vi.fn(),
  series: vi.fn(),
  salvar: vi.fn(),
  salvarSeries: vi.fn(),
  existe: vi.fn(),
  online: true,
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/acessos/api", async (orig) => ({
  ...(await orig<typeof import("@/acessos/api")>()),
  lerAcessos: (...a: unknown[]) => h.ler(...a),
  lerSeries: (...a: unknown[]) => h.series(...a),
  salvarAcesso: (...a: unknown[]) => h.salvar(...a),
  salvarSeries: (...a: unknown[]) => h.salvarSeries(...a),
}));
vi.mock("@/rotas/registro", () => ({ existe: (g: string, n: string) => h.existe(g, n) }));
vi.mock("@/ui/premium/useOnline", () => ({ useOnline: () => h.online }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { ErroAcessos } from "@/acessos/api";
import { ListaDeAcessos } from "./ListaDeAcessos";

const acessos = (o: Partial<AcessosDoAluno> = {}): AcessosDoAluno & { ok: true } => ({
  ok: true, paciente_id: "p1", tem_login: true, modulos: ["treino", "nutricao"], conta_modulos: ["treino", "nutricao"], tem_nutricionista: true,
  pode_mudar: true, linhas: { acesso_app: "liberado", diario_alimentar: "liberado", acesso_link: "liberado", dieta: "ver" },
  mudancas: { acesso_link: { de: "bloqueado", para: "liberado", em: "2026-10-12T20:20:00Z", por_nome: "Ana Paula Souza" } }, ...o,
});

let qc: QueryClient;
function abrir() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <ListaDeAcessos alunoId="p1" nome="Rafael Moura" />
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const linha = (chave: string) => document.querySelector(`[data-acessos-linha="${chave}"]`) as HTMLElement | null;
const radio = (chave: string, rotulo: string) => within(linha(chave)!).getByRole("radio", { name: rotulo }) as HTMLInputElement;
const pronta = () => waitFor(() => expect(document.querySelector('[data-aba-acessos="pronto"]')).not.toBeNull());

beforeEach(() => {
  for (const f of [h.ler, h.series, h.salvar, h.salvarSeries, h.existe, h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.ler.mockResolvedValue(acessos());
  h.series.mockResolvedValue({ ok: true, series: "mexer", pode_mudar: true });
  h.existe.mockReturnValue(false);
  h.online = true;
});

describe("W-A P4 — aba Acessos › as linhas (spec §4.1)", () => {
  it("as 6 linhas na ordem, os níveis marcados, o 'Mudado por', as séries lidas à parte e o resumo do rodapé", async () => {
    abrir();
    await pronta();
    expect(h.ler).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("pronto"));
    expect(h.series).toHaveBeenCalledWith("p1");
    expect([...document.querySelectorAll("[data-acessos-linha]")].map((e) => e.getAttribute("data-acessos-linha"))).toEqual([
      "acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas",
    ]);
    expect(radio("acesso_app", "Liberado").checked).toBe(true);
    expect(radio("treino_series", "Pode mexer").checked).toBe(true);
    expect(radio("dieta", "Só ver").checked).toBe(true);
    expect(within(linha("acesso_link")!).getByText("Mudado por Ana em 12/10 17:20")).toBeInTheDocument();
    expect(within(linha("rotinas")!).queryByRole("radio")).toBeNull();
    expect(within(linha("rotinas")!).getByText("Sempre liberadas")).toBeInTheDocument();
    expect(document.querySelector("[data-acessos-resumo]")?.textContent).toBe("App liberado · séries: pode mexer · dieta: só ver · rotinas sempre");
  });

  it("muda na hora (otimista) e salva pela função; deu certo → 'Salvo' e o perfil do aluno relido", async () => {
    let soltar: (v: unknown) => void = () => {};
    h.salvar.mockImplementation(() => new Promise((ok) => (soltar = ok)));
    abrir();
    await pronta();
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    fireEvent.click(radio("acesso_link", "Bloqueado"));
    await waitFor(() => expect(radio("acesso_link", "Bloqueado").checked).toBe(true));
    expect(h.salvar).toHaveBeenCalledWith("p1", "acesso_link", "bloqueado");
    soltar(acessos({ linhas: { ...acessos().linhas, acesso_link: "bloqueado" } }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Salvo"));
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["aluno-perfil", "p1"] });
    expect(radio("acesso_link", "Bloqueado").checked).toBe(true);
  });

  it("a função recusou → o nível volta e a frase fixa do código aparece", async () => {
    h.salvar.mockRejectedValue(new ErroAcessos("sem_nutricao"));
    abrir();
    await pronta();
    fireEvent.click(radio("dieta", "Pode mexer"));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Só vale para aluno com nutricionista numa conta com Nutrição."));
    await waitFor(() => expect(radio("dieta", "Só ver").checked).toBe(true));
  });

  it("'App: Bloqueado' pede a confirmação do app — Cancelar não grava; 'Bloquear' grava", async () => {
    abrir();
    await pronta();
    fireEvent.click(radio("acesso_app", "Bloqueado"));
    let dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Bloquear o app de Rafael?")).toBeInTheDocument();
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.salvar).not.toHaveBeenCalled();
    expect(radio("acesso_app", "Liberado").checked).toBe(true);
    h.salvar.mockResolvedValue(acessos({ linhas: { ...acessos().linhas, acesso_app: "bloqueado" } }));
    fireEvent.click(radio("acesso_app", "Bloqueado"));
    dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("p1", "acesso_app", "bloqueado"));
  });

  it("sem login: o App fica desligado com o aviso; liberar não pede confirmação", async () => {
    h.ler.mockResolvedValue(acessos({ tem_login: false, linhas: { ...acessos().linhas, acesso_app: "bloqueado" } }));
    h.series.mockRejectedValue(new ErroAcessos("sem_treino"));
    abrir();
    await pronta();
    expect(radio("acesso_app", "Liberado").disabled).toBe(true);
    expect(within(linha("acesso_app")!).getByText("Ele ainda não tem login: crie o acesso em Login do aluno.")).toBeInTheDocument();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("antes_do_acesso"));
    expect(within(linha("treino_series")!).getByText("Vale depois do 1º acesso do aluno ao app.")).toBeInTheDocument();
    expect(within(linha("treino_series")!).queryByRole("radio")).toBeNull();
    expect(document.querySelector("[data-acessos-resumo]")?.textContent).toBe("App sem login · dieta: só ver · rotinas sempre");
  });
});

describe("W-A P4 — a linha das séries (Banco do Treino, à parte)", () => {
  it("a nutri trava as séries pela treino-acessos: 'Só ver' → salva, 'Salvo' e a aba relida (o 'Mudado por' das séries)", async () => {
    h.salvarSeries.mockResolvedValue({ ok: true, series: "ver", registrado: true });
    abrir();
    await pronta();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("pronto"));
    fireEvent.click(radio("treino_series", "Só ver"));
    await waitFor(() => expect(h.salvarSeries).toHaveBeenCalledWith("p1", "ver"));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Salvo"));
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
    expect(radio("treino_series", "Só ver").checked).toBe(true);
  });

  it("o Treino de OUTRA conta (sem_acesso): só o texto da aba Treino, sem os níveis — as outras linhas seguem", async () => {
    h.series.mockRejectedValue(new ErroAcessos("sem_acesso"));
    abrir();
    await pronta();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("outra_conta"));
    expect(linha("treino_series")!.textContent).toContain("Treino de outro personal");
    expect(within(linha("treino_series")!).queryByRole("radio")).toBeNull();
    expect(radio("dieta", "Só ver").disabled).toBe(false);
  });

  it("o erro da linha não derruba as outras; 'Tentar de novo' relê só as séries", async () => {
    // a consulta repete 1 vez o que pode passar sozinho (a rede, o principal fora): as 2 idas falham
    h.series.mockRejectedValue(new ErroAcessos("principal_indisponivel"));
    abrir();
    await pronta();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("erro"), { timeout: 4000 });
    expect(h.series).toHaveBeenCalledTimes(2);
    expect(linha("treino_series")!.textContent).toContain("Não deu para ler o Treino agora.");
    expect(radio("acesso_app", "Liberado").checked).toBe(true);
    h.series.mockResolvedValue({ ok: true, series: "mexer", pode_mudar: true });
    fireEvent.click(document.querySelector("[data-acessos-series-tentar]")!);
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("pronto"));
    expect(h.ler).toHaveBeenCalledTimes(1);
  });

  it("sem o módulo Treino a linha some e a treino-acessos nem é chamada; sem nutricionista: 'Este aluno não tem dieta' e sem diário/link", async () => {
    h.ler.mockResolvedValue(acessos({ modulos: ["nutricao"], tem_nutricionista: false }));
    abrir();
    await pronta();
    expect(linha("treino_series")).toBeNull();
    expect(within(linha("dieta")!).getByText("Este aluno não tem dieta")).toBeInTheDocument();
    expect(within(linha("dieta")!).queryByRole("radio")).toBeNull();
    expect(linha("diario_alimentar")).toBeNull();
    expect(linha("acesso_link")).toBeNull();
    await new Promise((ok) => setTimeout(ok, 20));
    expect(h.series).not.toHaveBeenCalled();
  });
});

describe("W-A P4 — quem só vê, sem internet, as rotinas e o erro da aba", () => {
  it("quem não pode mudar (pode_mudar = false) vê tudo desligado e o aviso", async () => {
    h.ler.mockResolvedValue(acessos({ pode_mudar: false }));
    abrir();
    await pronta();
    expect(document.querySelector("[data-acessos-so-leitura]")).not.toBeNull();
    expect([...document.querySelectorAll<HTMLInputElement>("[data-acessos-radio]")].every((r) => r.disabled)).toBe(true);
  });

  it("sem internet: os níveis desligados com o aviso", async () => {
    h.online = false;
    abrir();
    await pronta();
    expect(document.querySelector("[data-acessos-sem-internet]")?.textContent).toContain("Sem internet");
    expect(radio("acesso_link", "Bloqueado").disabled).toBe(true);
  });

  it("a dica das rotinas aponta para o card Rotinas do Resumo só quando ele existe (a P6)", async () => {
    abrir();
    await pronta();
    expect(linha("rotinas")!.textContent).not.toContain("card Rotinas do Resumo");
    h.existe.mockImplementation((g: string, n: string) => g === "resumoAluno" && n === "CardRotinas");
    abrir();
    await waitFor(() => expect(document.querySelectorAll('[data-acessos-linha="rotinas"]').length).toBe(2));
    expect(document.querySelectorAll('[data-acessos-linha="rotinas"]')[1].textContent).toContain("As suas você cria no card Rotinas do Resumo.");
  });

  it("a aba não abriu (a rede, 2 vezes — a consulta repete 1) → o erro com 'Tentar de novo' (relê); sem acesso não repete", async () => {
    h.ler.mockRejectedValueOnce(new ErroAcessos("rede")).mockRejectedValueOnce(new ErroAcessos("rede"));
    abrir();
    expect(await screen.findByText("Não deu para abrir os acessos", {}, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    await pronta();
    h.ler.mockReset();
    h.ler.mockRejectedValue(new ErroAcessos("sem_acesso"));
    abrir();
    expect(await screen.findByText("Você não tem permissão para mudar os acessos deste aluno.")).toBeInTheDocument();
    expect(h.ler).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("button", { name: /Tentar de novo/ })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: As consultas, a linha e a lista (verde)** — `cd ~/projetos/physiqcalc-wa-p4 && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh src/painel/aluno/acessos/useAcessos.ts src/painel/aluno/acessos/LinhaDeAcesso.tsx src/painel/aluno/acessos/ListaDeAcessos.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/acessos/ListaDeAcessos.test.tsx`
  → `Tests 13 passed (13)` (2 deles esperam o 2º erro da consulta, até 4 s — a nova tentativa da rede).

`src/painel/aluno/acessos/useAcessos.ts`:
```ts
// Physiq W-A P4 — as consultas e as gravações da aba Acessos (React Query), pela porta da P2 (src/acessos/api.ts: a função acessos no
// principal e a treino-acessos no Treino — nunca o banco direto, src/aluno-dia/semBancoDireto.test.ts). Salva na hora, linha por linha
// (spec §2.2-5): o nível muda na tela já (otimista); a função recusou → volta e mostra a frase do código; deu certo → "Salvo", a aba com a
// volta do servidor e o perfil do aluno relido (o card "Link do diário" e o "Mensagens automáticas" leem os ajustes de lá — spec §5.3).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErroAcessos, lerAcessos, lerSeries, salvarAcesso, salvarSeries } from "@/acessos/api";
import type { AcessosDoAluno, ChaveDeAcesso, NivelDasSeries, SeriesDoAluno } from "@/acessos/tipos";
import { chavePerfilAluno } from "../dados/usePerfilAluno";
import { TEXTOS, comNivel } from "./regras";

export const chaveAcessos = (alunoId: string) => ["acessos-aluno", alunoId] as const;
export const chaveSeries = (alunoId: string) => ["acessos-series", alunoId] as const;

/** Repetir 1 vez só o que pode passar sozinho (a rede); quem não pode, o aluno que não existe, antes do 1º acesso… não repetem. */
const SEM_REPETIR = new Set(["sem_acesso", "aluno_inexistente", "sem_login", "sem_treino", "sem_modulo", "dados_invalidos", "sem_internet"]);
const repetir = (n: number, e: unknown) => n < 1 && !(e instanceof ErroAcessos && SEM_REPETIR.has(e.codigo));
const frase = (e: unknown) => (e instanceof ErroAcessos ? e.message : TEXTOS.erroPadrao);

/** As linhas da aba (a função acessos, `acao: "ler"`). */
export function useAcessosDoAluno(alunoId: string) {
  return useQuery<AcessosDoAluno>({
    queryKey: chaveAcessos(alunoId),
    queryFn: () => lerAcessos(alunoId),
    enabled: !!alunoId,
    staleTime: 20_000,
    retry: repetir,
    networkMode: "online",
  });
}

/** A linha das séries (a treino-acessos, `acao: "ler"`) — só para aluno com o módulo Treino (spec §4.1: carrega à parte). */
export function useSeriesDoAluno(alunoId: string, comTreino: boolean) {
  return useQuery<SeriesDoAluno>({
    queryKey: chaveSeries(alunoId),
    queryFn: () => lerSeries(alunoId),
    enabled: !!alunoId && comTreino,
    staleTime: 20_000,
    retry: repetir,
    networkMode: "online",
  });
}

/** Muda uma das 4 linhas da função acessos (acesso_app · diario_alimentar · acesso_link · dieta). */
export function useMudarAcesso(alunoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chave, valor }: { chave: ChaveDeAcesso; valor: string }) => salvarAcesso(alunoId, chave, valor),
    onMutate: async ({ chave, valor }) => {
      await qc.cancelQueries({ queryKey: chaveAcessos(alunoId) });
      const antes = qc.getQueryData<AcessosDoAluno>(chaveAcessos(alunoId));
      if (antes) qc.setQueryData<AcessosDoAluno>(chaveAcessos(alunoId), comNivel(antes, chave, valor));
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData<AcessosDoAluno>(chaveAcessos(alunoId), ctx.antes);
      toast.error(frase(e));
    },
    onSuccess: (novo) => {
      qc.setQueryData<AcessosDoAluno>(chaveAcessos(alunoId), novo);
      toast.success(TEXTOS.salvo);
      void qc.invalidateQueries({ queryKey: chavePerfilAluno(alunoId) });
    },
  });
}

/** Muda o cadeado das séries (a treino-acessos); depois relê a aba (o "Mudado por" das séries vem do histórico do principal). */
export function useMudarSeries(alunoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (valor: NivelDasSeries) => salvarSeries(alunoId, valor),
    onMutate: async (valor) => {
      await qc.cancelQueries({ queryKey: chaveSeries(alunoId) });
      const antes = qc.getQueryData<SeriesDoAluno>(chaveSeries(alunoId));
      if (antes) qc.setQueryData<SeriesDoAluno>(chaveSeries(alunoId), { ...antes, series: valor });
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData<SeriesDoAluno>(chaveSeries(alunoId), ctx.antes);
      toast.error(frase(e));
    },
    onSuccess: (r) => {
      qc.setQueryData<SeriesDoAluno>(chaveSeries(alunoId), (a) => (a ? { ...a, series: r.series } : a));
      toast.success(TEXTOS.salvo);
      void qc.invalidateQueries({ queryKey: chaveAcessos(alunoId) });
    },
  });
}
```

`src/painel/aluno/acessos/LinhaDeAcesso.tsx`:
```tsx
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Esqueleto } from "@/ui/premium/Estados";
import type { DefLinha, TomDoNivel } from "./regras";

/** A cor do nível marcado (spec §4.1): neutro · azul · verde — os tons dos chips do visual premium (g · c · n). */
const COR_MARCADO: Record<TomDoNivel, string> = {
  neutro: "peer-checked:bg-[var(--p-chip-g-fundo)] peer-checked:text-texto peer-checked:shadow-sm",
  azul: "peer-checked:bg-[var(--p-chip-c-fundo)] peer-checked:text-[var(--p-chip-c-texto)]",
  verde: "peer-checked:bg-[var(--p-chip-n-fundo)] peer-checked:text-[var(--p-chip-n-texto)]",
};

/**
 * Uma linha da aba Acessos (W-A P4 — spec §4.1): o nome, a dica, o aviso para ESTE aluno e o "Mudado por <nome> em dd/mm hh:mm"; à
 * direita os níveis como botões de rádio de verdade (Tab entra no grupo, as setas trocam — o molde AcessosDoMembro.tsx do Nativo OS),
 * ou o texto no lugar deles (`semNiveis`: "Este aluno não tem dieta", o Treino de outra conta…), ou o nível fixo (as rotinas), ou o
 * esqueleto (as séries carregando à parte).
 */
export function LinhaDeAcesso({
  def,
  dica,
  valor,
  desligado,
  aviso,
  mudanca,
  aoEscolher,
  carregando = false,
  semNiveis,
  fixo = false,
  acao,
  estado = "pronto",
}: {
  def: DefLinha;
  dica: string;
  valor: string | null;
  desligado: boolean;
  aviso?: string | null;
  mudanca?: string | null;
  aoEscolher: (valor: string) => void;
  carregando?: boolean;
  /** o texto no lugar dos níveis (a linha que não vale para este aluno) */
  semNiveis?: string | null;
  /** o nível que não muda (as rotinas: "Sempre liberadas", sem botão) */
  fixo?: boolean;
  /** uma ação embaixo (o "Tentar de novo" da linha das séries) */
  acao?: ReactNode;
  estado?: string;
}) {
  const id = useId();
  const rotuloId = `acesso-${def.chave}-${id}`;
  return (
    <li
      className="flex min-w-0 flex-col gap-2.5 border-b border-linha py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      data-acessos-linha={def.chave}
      data-acessos-nivel={valor ?? ""}
      data-acessos-estado={estado}
    >
      <div className="min-w-0 flex-1">
        <p id={rotuloId} className="text-[13.5px] font-semibold text-texto">{def.rotulo}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-texto-3">{dica}</p>
        {aviso && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ambar-3" data-acessos-aviso>{aviso}</p>}
        {mudanca && <p className="mt-1 text-[11px] text-texto-3" data-acessos-mudanca>{mudanca}</p>}
        {acao && <div className="mt-1.5">{acao}</div>}
      </div>
      {carregando ? (
        <Esqueleto className="h-8 w-[168px] flex-none self-start rounded-xl" />
      ) : semNiveis ? (
        <p className="flex-none self-start text-[12px] font-medium text-texto-2 sm:max-w-[45%] sm:text-right" data-acessos-sem>{semNiveis}</p>
      ) : fixo ? (
        <span
          className="flex-none self-start rounded-[9px] px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--p-chip-n-fundo)", color: "var(--p-chip-n-texto)" }}
          data-acessos-fixo
        >
          {def.niveis[0]?.rotulo}
        </span>
      ) : (
        <div role="radiogroup" aria-labelledby={rotuloId} className="inline-flex flex-none self-start rounded-xl border border-linha bg-superficie p-[3px]">
          {def.niveis.map((n) => (
            <label key={n.valor} className="relative">
              <input
                type="radio"
                name={rotuloId}
                value={n.valor}
                checked={valor === n.valor}
                onChange={() => aoEscolher(n.valor)}
                disabled={desligado}
                className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
                data-acessos-radio={`${def.chave}:${n.valor}`}
              />
              <span
                className={cn(
                  "block whitespace-nowrap rounded-[9px] px-3 py-1.5 text-xs font-semibold text-texto-2 transition-colors duration-150",
                  "peer-hover:text-texto peer-focus-visible:ring-2 peer-focus-visible:ring-violeta-2/60 peer-disabled:opacity-60",
                  COR_MARCADO[n.tom],
                )}
              >
                {n.rotulo}
              </span>
            </label>
          ))}
        </div>
      )}
    </li>
  );
}
```

`src/painel/aluno/acessos/ListaDeAcessos.tsx`:
```tsx
import { Eye, RefreshCw, WifiOff } from "lucide-react";
import { mensagemErroAcessos } from "@/acessos/api";
import type { ChaveDeAcesso, NivelDasSeries } from "@/acessos/tipos";
import { existe } from "@/rotas/registro";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { useOnline } from "@/ui/premium/useOnline";
import { LinhaDeAcesso } from "./LinhaDeAcesso";
import {
  TEXTOS, avisoDaLinha, confirmacaoDoBloqueio, dicaDaLinha, estadoDasSeries, linhasVisiveis, nivelDaLinha, pedeConfirmacao, resumoDosAcessos,
  textoDaMudanca, type ChaveDaLinha,
} from "./regras";
import { useAcessosDoAluno, useMudarAcesso, useMudarSeries, useSeriesDoAluno } from "./useAcessos";

/**
 * As linhas da aba Acessos (W-A P4 — spec §4.1, §4.7): "o que o aluno pode no app", uma linha por parte, salvas na hora pela função acessos
 * (as 4 do principal) e pela treino-acessos (as séries, no Banco do Treino — carregam à parte, com o esqueleto e o erro delas, sem segurar as
 * outras). "App: Bloqueado" pede a confirmação do app; sem internet, os níveis ficam desligados com o aviso; quem só vê (pode_mudar = false)
 * vê tudo desligado. No rodapé, o resumo ("App liberado · séries: pode mexer · dieta: só ver · rotinas sempre").
 */
export function ListaDeAcessos({ alunoId, nome }: { alunoId: string; nome: string | null }) {
  const q = useAcessosDoAluno(alunoId);
  const d = q.data;
  const comTreino = !!d && d.modulos.includes("treino");
  const s = useSeriesDoAluno(alunoId, comTreino);
  const mudar = useMudarAcesso(alunoId);
  const mudarSeries = useMudarSeries(alunoId);
  const confirmar = useConfirmar();
  const online = useOnline();
  const comCardRotinas = existe("resumoAluno", "CardRotinas");

  if (q.isLoading) {
    return (
      <Cartao className="flex flex-col gap-3 px-[18px] py-4" data-aba-acessos="carregando" aria-busy="true">
        <Esqueleto className="h-5 w-1/3" />
        {[0, 1, 2, 3, 4, 5].map((i) => <Esqueleto key={i} className="h-[58px] w-full" />)}
      </Cartao>
    );
  }
  if (q.isError || !d) {
    const codigo = (q.error as { codigo?: string } | null)?.codigo ?? null;
    return (
      <EstadoErro
        titulo="Não deu para abrir os acessos"
        texto={mensagemErroAcessos(codigo)}
        aoTentar={codigo === "sem_acesso" || codigo === "aluno_inexistente" ? undefined : () => void q.refetch()}
      />
    );
  }

  const series = estadoDasSeries(comTreino, s, (c) => mensagemErroAcessos(c));
  const ocupado = mudar.isPending || mudarSeries.isPending;
  const travado = !d.pode_mudar || !online || ocupado;

  const escolher = async (chave: ChaveDaLinha, valor: string) => {
    if (chave === "rotinas") return;
    if (pedeConfirmacao(chave, valor)) {
      const c = confirmacaoDoBloqueio(nome);
      if (!(await confirmar({ titulo: c.titulo, descricao: c.descricao, rotuloConfirmar: "Bloquear", perigo: true }))) return;
    }
    if (chave === "treino_series") mudarSeries.mutate(valor as NivelDasSeries);
    else mudar.mutate({ chave: chave as ChaveDeAcesso, valor });
  };

  return (
    <Cartao className="flex min-w-0 flex-col px-[18px] py-4" data-aba-acessos="pronto" data-acessos-pode-mudar={d.pode_mudar ? "1" : "0"}>
      <CabecalhoCartao titulo="Acessos no app" />
      {!d.pode_mudar && (
        <p className="mb-1 flex items-start gap-2 text-[12px] leading-relaxed text-texto-2" data-acessos-so-leitura>
          <Eye aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-violeta-3" /> {TEXTOS.soLeitura}
        </p>
      )}
      {!online && (
        <p className="mb-1 flex items-start gap-2 text-[12px] leading-relaxed text-ambar-3" data-acessos-sem-internet>
          <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" /> {TEXTOS.semInternet}
        </p>
      )}
      <ul className="flex flex-col" data-acessos-lista>
        {linhasVisiveis(d).map((l) => {
          const ehSeries = l.chave === "treino_series";
          const semDieta = l.chave === "dieta" && !d.tem_nutricionista;
          const seriesSemNiveis = ehSeries && (series.tipo === "antes_do_acesso" || series.tipo === "outra_conta" || series.tipo === "erro");
          return (
            <LinhaDeAcesso
              key={l.chave}
              def={l}
              dica={dicaDaLinha(l, comCardRotinas)}
              valor={nivelDaLinha(l.chave, d.linhas, series)}
              desligado={travado || (l.chave === "acesso_app" && !d.tem_login) || (ehSeries && series.tipo === "pronto" && !series.podeMudar)}
              aviso={seriesSemNiveis ? null : avisoDaLinha(l.chave, d, series)}
              mudanca={l.chave === "rotinas" ? null : textoDaMudanca(d.mudancas[l.chave])}
              aoEscolher={(v) => void escolher(l.chave, v)}
              carregando={ehSeries && series.tipo === "carregando"}
              semNiveis={semDieta ? TEXTOS.semDieta : seriesSemNiveis ? avisoDaLinha(l.chave, d, series) : null}
              fixo={l.chave === "rotinas"}
              estado={ehSeries ? series.tipo : "pronto"}
              acao={
                ehSeries && series.tipo === "erro" ? (
                  <button type="button" onClick={() => void s.refetch()} className="flex items-center gap-1.5 text-[12px] font-semibold text-violeta-3"
                    data-acessos-series-tentar>
                    <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar de novo
                  </button>
                ) : null
              }
            />
          );
        })}
      </ul>
      <p className="mt-2 border-t border-linha pt-2.5 text-[12.5px] font-medium text-texto-2" aria-live="polite" data-acessos-resumo>
        {resumoDosAcessos(d, series)}
      </p>
    </Cartao>
  );
}
```

- [ ] **Step 3: O lint dos 6 arquivos da pasta** — `cd ~/projetos/physiqcalc-wa-p4 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npx eslint src/painel/aluno/acessos`
  → nada impresso (0 erro, 0 aviso).
- [ ] **Step 4: Commit** — `feat(w-a): a lista da aba Acessos (as consultas e as gravações otimistas, os rádios, as séries à parte, a confirmação do bloqueio)` com
  os 4 arquivos; `feita.sh 2 "lista 13/13; eslint 0" "<placar>"`.

---

### Task 3: O card de login muda de pasta — `resumo/CardAcessoAluno.tsx` → `resumo/acesso/` (TDD)

**Files:** Modify (rename) `src/painel/aluno/resumo/CardAcessoAluno.tsx` → `src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx` e
`src/painel/aluno/resumo/CardAcessoAluno.test.tsx` → `src/painel/aluno/resumo/acesso/CardAcessoAluno.test.tsx`.
**Estimativa:** 10 min (calibrado 2–3).

- [ ] **Step 1: O teste muda de pasta (vermelho)** — `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T3-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/resumo/acesso/CardAcessoAluno.test.tsx`
  → FAIL `Failed to resolve import "./CardAcessoAluno"` (o card ainda está em `resumo/`).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T3-teste.patch`:
```diff
diff --git a/src/painel/aluno/resumo/CardAcessoAluno.test.tsx b/src/painel/aluno/resumo/acesso/CardAcessoAluno.test.tsx
similarity index 88%
rename from src/painel/aluno/resumo/CardAcessoAluno.test.tsx
rename to src/painel/aluno/resumo/acesso/CardAcessoAluno.test.tsx
index d549040..7ba73f8 100644
--- a/src/painel/aluno/resumo/CardAcessoAluno.test.tsx
+++ b/src/painel/aluno/resumo/acesso/CardAcessoAluno.test.tsx
@@ -4,15 +4,15 @@ import { MemoryRouter } from "react-router-dom";
 import { beforeEach, describe, expect, it, vi } from "vitest";
 
 const h = vi.hoisted(() => ({ acesso: vi.fn(), criar: vi.fn(), senha: vi.fn(), perfil: vi.fn(), acao: vi.fn() }));
-vi.mock("../dados/api", () => ({ buscarPerfilAluno: h.perfil, ErroPerfil: class extends Error {} }));
+vi.mock("../../dados/api", () => ({ buscarPerfilAluno: h.perfil, ErroPerfil: class extends Error {} }));
 vi.mock("@/painel/alunos/api", () => ({ acaoNoAluno: h.acao, ErroAlunos: class extends Error {} }));
-vi.mock("./acesso/api", () => ({ acessoDoAluno: h.acesso, criarAcessoDoAluno: h.criar, criarSenhaNovaDoAluno: h.senha }));
+vi.mock("./api", () => ({ acessoDoAluno: h.acesso, criarAcessoDoAluno: h.criar, criarSenhaNovaDoAluno: h.senha }));
 vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
 
 import { perfil } from "@/test/fixturesPerfilAluno";
 import CardAcessoAluno from "./CardAcessoAluno";
 
-// W8b — o card "Acesso do aluno" do Resumo (tela 7): o profissional cria o acesso ou uma senha nova (provisória).
+// W8b — o card "Login do aluno" (era o "Acesso do aluno" do Resumo; W-A P4: na aba Acessos): o profissional cria o acesso ou uma senha nova (provisória).
 const abrir = () =>
   render(
     <MemoryRouter useTransitions={false}>
@@ -32,7 +32,7 @@ beforeEach(() => {
   h.perfil.mockResolvedValue(perfil({ paciente_id: "p1" }));
 });
 
-describe("card Acesso do aluno", () => {
+describe("card Login do aluno", () => {
   it("sem login: 'Criar acesso' com o e-mail do cadastro e a senha gerada; depois mostra o que passar ao aluno", async () => {
     h.acesso.mockResolvedValue(dados(null));
     h.criar.mockResolvedValue("u-novo");
@@ -70,6 +70,12 @@ describe("card Acesso do aluno", () => {
     expect(await screen.findByText("SENHA PROVISÓRIA")).toBeInTheDocument();
     expect(screen.getByText(/Provisória · ele cria a dele ao entrar/)).toBeInTheDocument();
   });
+  it("W-A P4: o título é 'Login do aluno' (o card mora na aba Acessos)", async () => {
+    h.acesso.mockResolvedValue(dados(null));
+    abrir();
+    expect(await screen.findByText("Login do aluno")).toBeInTheDocument();
+    expect(screen.queryByText("Acesso do aluno")).toBeNull();
+  });
   it("quem não mexe no acesso vê a frase (sem botão)", async () => {
     h.acesso.mockRejectedValue(new Error("sem_acesso"));
     abrir();
```

- [ ] **Step 2: O card muda de pasta (verde)** — `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T3-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/resumo/acesso/CardAcessoAluno.test.tsx src/painel/aluno/resumo/cardsW14.test.tsx`
  → `Test Files 2 passed` · `Tests 19 passed (19)` (7 + 12). O card sai do Resumo sozinho (o registro só lê `resumo/*.tsx`; a subpasta não é card).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T3-codigo.patch`:
```diff
diff --git a/src/painel/aluno/resumo/CardAcessoAluno.tsx b/src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx
similarity index 86%
rename from src/painel/aluno/resumo/CardAcessoAluno.tsx
rename to src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx
index 36beb8f..932f193 100644
--- a/src/painel/aluno/resumo/CardAcessoAluno.tsx
+++ b/src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx
@@ -10,10 +10,10 @@ import { Botao } from "@/ui/premium/Botao";
 import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
 import { Chip } from "@/ui/premium/Chip";
 import { Esqueleto } from "@/ui/premium/Estados";
-import { linhaDoPerfil } from "../dados/regras";
-import { useAtualizarAluno, usePerfilAluno } from "../dados/usePerfilAluno";
-import { acessoDoAluno } from "./acesso/api";
-import { SheetSenhaAluno } from "./acesso/SheetSenhaAluno";
+import { linhaDoPerfil } from "../../dados/regras";
+import { useAtualizarAluno, usePerfilAluno } from "../../dados/usePerfilAluno";
+import { acessoDoAluno } from "./api";
+import { SheetSenhaAluno } from "./SheetSenhaAluno";
 import {
   ROTULO_ESTADO,
   TOM_ESTADO,
@@ -21,7 +21,7 @@ import {
   horaDoBloqueio,
   textoErroAcesso,
   textoUltimoAcesso,
-} from "./acesso/regras";
+} from "./regras";
 
 function Linha({ rotulo, children, marca }: { rotulo: string; children: React.ReactNode; marca: string }) {
   return (
@@ -33,13 +33,14 @@ function Linha({ rotulo, children, marca }: { rotulo: string; children: React.Re
 }
 
 /**
- * Card "Acesso do aluno" do Resumo (spec 4.5, padrão da tela 7 — W8b): como o aluno entra (e-mail do login, Google ou senha,
- * último acesso), a senha provisória e o bloqueio por tentativas. O profissional responsável (dono da conta, personal ou
- * nutricionista do aluno) e o master CRIAM O ACESSO ou uma SENHA NOVA — provisória: no 1º login o aluno cria a dele — e a
- * senha nova destrava a conta bloqueada. W14 (N-63): "Desativar"/"Reativar" e "Remover da lista" pela função alunos da W13
- * (a regra nova: dono da conta, responsável ou master; as mesmas confirmações da lista de Alunos) — as RPCs antigas do Nutri
- * (banir/apagar o login) ficam só no site antigo: no Physiq o login é único (pode ser profissional, ter treino ou outra
- * matrícula) e cortar o app é o ajuste "Acesso ao app" (card Ajustes do aluno).
+ * Card "Login do aluno" (W8b; era o "Acesso do aluno" do Resumo — W-A P4: mora na aba Acessos, ao lado das linhas, e saiu do Resumo
+ * — a subpasta não é card: src/rotas/registro.ts; o que ele faz NÃO mudou, as RPCs seguem as de ./api.ts, da hml-21): como o aluno entra
+ * (e-mail do login, Google ou senha, último acesso), a senha provisória e o bloqueio por tentativas. O profissional responsável (dono da
+ * conta, personal ou nutricionista do aluno) e o master CRIAM O ACESSO ou uma SENHA NOVA — provisória: no 1º login o aluno cria a dele — e
+ * a senha nova destrava a conta bloqueada. W14 (N-63): "Desativar"/"Reativar" e "Remover da lista" pela função alunos da W13 (a regra
+ * nova: dono da conta, responsável ou master; as mesmas confirmações da lista de Alunos) — as RPCs antigas do Nutri (banir/apagar o
+ * login) ficam só no site antigo: no Physiq o login é único (pode ser profissional, ter treino ou outra matrícula) e cortar o app é a
+ * linha "Acesso ao app" da aba Acessos.
  */
 export default function CardAcessoAluno({ alunoId }: { alunoId: string }) {
   const q = useQuery({
@@ -66,7 +67,7 @@ export default function CardAcessoAluno({ alunoId }: { alunoId: string }) {
     <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-acesso-aluno data-acesso-estado={q.isLoading ? "carregando" : estado}>
       {/* título longo num card de 1/3 da largura (tela 7): o título não quebra e a ação fica no rodapé, como no card Financeiro */}
       <CabecalhoCartao
-        titulo={<span className="whitespace-nowrap">Acesso do aluno</span>}
+        titulo={<span className="whitespace-nowrap">Login do aluno</span>}
         extra={d ? <Chip tom={TOM_ESTADO[estado]} className="ml-auto" data-acesso-chip>{ROTULO_ESTADO[estado]}</Chip> : undefined}
       />
       {q.isLoading ? (
```

- [ ] **Step 3: Commit (o rename: os 4 caminhos)** — `refactor(w-a): o card de login muda para resumo/acesso/ (sai do Resumo, igual; o título "Login do aluno")` com
  `src/painel/aluno/resumo/CardAcessoAluno.tsx src/painel/aluno/resumo/CardAcessoAluno.test.tsx src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx src/painel/aluno/resumo/acesso/CardAcessoAluno.test.tsx`;
  `feita.sh 3 "card de login em resumo/acesso/ 19/19" "<placar>"`.

---

### Task 4: A aba, o catálogo e a barra (TDD)

**Files:** Create `src/painel/aluno/abas/Acessos.tsx`, `src/painel/aluno/abas/Acessos.test.tsx`; Modify `src/painel/aluno/catalogoAbas.ts`,
`src/painel/aluno/catalogoAbas.test.ts`, `src/painel/aluno/AlunoLayout.tsx`, `src/rotas/Rotas.test.tsx` (defeito 1).
**Estimativa:** 15 min (calibrado 3–5).

- [ ] **Step 1: Os testes (vermelho)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T4-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh src/painel/aluno/abas/Acessos.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/catalogoAbas.test.ts src/painel/aluno/abas/Acessos.test.tsx src/rotas/Rotas.test.tsx`
Expected: `Test Files 3 failed` · `Tests 8 failed | 62 passed (70)` — o `Acessos.test.tsx` não carrega (`Failed to resolve import "./Acessos"`), o `catalogoAbas`
5 falhas (as 7 abas, o "nova" das 7, a rota `/acessos`, o `ORDEM_RESUMO`, a `rolagemParaMostrar`) e o `Rotas.test.tsx` 3 (a lista das abas).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T4-teste.patch`:
```diff
diff --git a/src/painel/aluno/catalogoAbas.test.ts b/src/painel/aluno/catalogoAbas.test.ts
index 7c1f493..7762186 100644
--- a/src/painel/aluno/catalogoAbas.test.ts
+++ b/src/painel/aluno/catalogoAbas.test.ts
@@ -1,18 +1,22 @@
 import { describe, expect, it } from "vitest";
-import { ABAS_ALUNO, abaAtualDaRota, estadoDaAbaAluno } from "./catalogoAbas";
+import { ABAS_ALUNO, ORDEM_RESUMO, abaAtualDaRota, estadoDaAbaAluno, rolagemParaMostrar } from "./catalogoAbas";
 
 const semNovas = () => false;
 const comNovas = () => true;
 
 describe("abas do perfil do aluno (spec 4.5, tela 7)", () => {
-  it("as 6 abas na ordem da tela 7", () => {
-    expect(ABAS_ALUNO.map((a) => a.rotulo)).toEqual(["Resumo", "Treino", "Dieta", "Avaliação", "Prontuário", "Financeiro"]);
+  it("as 7 abas na ordem da tela 7 — W-A P4: Acessos depois de Financeiro, para todo aluno", () => {
+    expect(ABAS_ALUNO.map((a) => a.rotulo)).toEqual(["Resumo", "Treino", "Dieta", "Avaliação", "Prontuário", "Financeiro", "Acessos"]);
+    const acessos = ABAS_ALUNO.find((a) => a.id === "acessos")!;
+    expect(acessos).toMatchObject({ arquivo: "Acessos", rota: "acessos", modulo: "ambos" });
+    expect(estadoDaAbaAluno(acessos, ["treino"], comNovas)).toBe("nova");
+    expect(estadoDaAbaAluno(acessos, ["nutricao"], comNovas)).toBe("nova");
   });
 
   it("sem as abas registradas, só o Resumo (da casca) — o Configurar aluno antigo (fallback) saiu na W28", () => {
     const visiveis = ABAS_ALUNO.filter((a) => estadoDaAbaAluno(a, ["treino"], semNovas) !== null).map((a) => a.id);
     expect(visiveis).toEqual(["resumo"]);
-    expect(ABAS_ALUNO.map((a) => estadoDaAbaAluno(a, ["treino", "nutricao"]))).toEqual(["nova", "nova", "nova", "nova", "nova", "nova"]);
+    expect(ABAS_ALUNO.map((a) => estadoDaAbaAluno(a, ["treino", "nutricao"]))).toEqual(["nova", "nova", "nova", "nova", "nova", "nova", "nova"]);
   });
 
   it("aba registrada aparece; Treino some sem o módulo; o Resumo é sempre da casca", () => {
@@ -28,5 +32,21 @@ describe("abas do perfil do aluno (spec 4.5, tela 7)", () => {
     expect(abaAtualDaRota("/painel/alunos/u1", "u1")).toBe("resumo");
     expect(abaAtualDaRota("/painel/alunos/u1/avaliacao", "u1")).toBe("avaliacao");
     expect(abaAtualDaRota("/painel/alunos/u1/xyz", "u1")).toBe("resumo");
+    expect(abaAtualDaRota("/painel/alunos/u1/acessos", "u1")).toBe("acessos");
+  });
+
+  it("W-A P4: o Resumo sem o card de login (foi para a aba Acessos) e com o lugar do card Rotinas no 7º (o 1º de baixo — a P6 cria)", () => {
+    expect(ORDEM_RESUMO).not.toContain("CardAcessoAluno");
+    expect(ORDEM_RESUMO.indexOf("CardRotinas")).toBe(6);
+    expect(ORDEM_RESUMO.slice(0, 6)).toEqual(["CardTreino", "CardDieta", "CardEvolucao", "CardProntuario", "CardFinanceiro", "CardProximosCompromissos"]);
+    expect(ORDEM_RESUMO.slice(6)).toEqual(["CardRotinas", "CardDadosAluno", "CardAjustesAluno", "CardLinkDiario", "CardResumoPrivado", "CardFluxoConsulta"]);
+  });
+
+  it("W-A P4: a barra rola até a aba ativa (no celular a Acessos fica fora da tela) — e não rola quando ela já aparece", () => {
+    expect(rolagemParaMostrar({ esquerda: 620, largura: 110 }, { rolagem: 0, largura: 358 })).toBe(620 + 110 - 358 + 16);
+    expect(rolagemParaMostrar({ esquerda: 40, largura: 90 }, { rolagem: 300, largura: 358 })).toBe(24);
+    expect(rolagemParaMostrar({ esquerda: 5, largura: 90 }, { rolagem: 300, largura: 358 })).toBe(0);
+    expect(rolagemParaMostrar({ esquerda: 100, largura: 90 }, { rolagem: 0, largura: 358 })).toBeNull();
+    expect(rolagemParaMostrar({ esquerda: 0, largura: 0 }, { rolagem: 0, largura: 0 })).toBeNull();
   });
 });
diff --git a/src/rotas/Rotas.test.tsx b/src/rotas/Rotas.test.tsx
index 73ef251..123ce4b 100644
--- a/src/rotas/Rotas.test.tsx
+++ b/src/rotas/Rotas.test.tsx
@@ -320,8 +320,9 @@ describe("site do profissional: rotas antigas do Calc abrem a mesma função na
     await waitFor(() => expect(onde()).toBe(para), { timeout: 4000 });
     await waitFor(() => expect(document.querySelector(`[data-aba-aluno="${aba}"]`)?.getAttribute("aria-current")).toBe("page"), { timeout: 4000 });
     await waitFor(() => expect(document.querySelector("[data-aba-aluno-conteudo='avaliacao']")).not.toBeNull(), { timeout: 4000 });
-    // W18: o Prontuário (as anotações da equipe) vale também na conta só de Treino — o personal lê e escreve as "Equipe"
-    expect([...document.querySelectorAll("[data-aba-aluno]")].map((a) => a.getAttribute("data-aba-aluno"))).toEqual(["resumo", "treino", "avaliacao", "prontuario", "financeiro"]);
+    // W18: o Prontuário (as anotações da equipe) vale também na conta só de Treino — o personal lê e escreve as "Equipe"; W-A P4: a aba
+    // Acessos depois de Financeiro, para todo aluno
+    expect([...document.querySelectorAll("[data-aba-aluno]")].map((a) => a.getAttribute("data-aba-aluno"))).toEqual(["resumo", "treino", "avaliacao", "prontuario", "financeiro", "acessos"]);
   }, 15_000);
 
   // W6: a aba Financeiro do aluno é a nova (src/painel/aluno/abas/Financeiro.tsx) — o "Plano & Cobrança" antigo não abre mais
```

`src/painel/aluno/abas/Acessos.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ perfil: vi.fn(), ler: vi.fn(), series: vi.fn(), acesso: vi.fn() }));
vi.mock("../dados/api", () => ({ buscarPerfilAluno: h.perfil, ErroPerfil: class extends Error {} }));
vi.mock("@/acessos/api", async (orig) => ({
  ...(await orig<typeof import("@/acessos/api")>()),
  lerAcessos: (...a: unknown[]) => h.ler(...a),
  lerSeries: (...a: unknown[]) => h.series(...a),
  salvarAcesso: vi.fn(),
  salvarSeries: vi.fn(),
}));
vi.mock("../resumo/acesso/api", () => ({ acessoDoAluno: h.acesso, criarAcessoDoAluno: vi.fn(), criarSenhaNovaDoAluno: vi.fn() }));
vi.mock("@/painel/alunos/api", () => ({ acaoNoAluno: vi.fn(), ErroAlunos: class extends Error {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Acessos from "./Acessos";

function abrir() {
  render(
    <MemoryRouter useTransitions={false}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProvedorConfirmar>
          <Acessos alunoId="p1" />
        </ProvedorConfirmar>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.perfil.mockResolvedValue(perfil());
  h.ler.mockResolvedValue({
    ok: true, paciente_id: "p1", tem_login: false, modulos: ["treino", "nutricao"], conta_modulos: ["treino", "nutricao"], tem_nutricionista: true,
    pode_mudar: true, linhas: { acesso_app: "bloqueado", diario_alimentar: "liberado", acesso_link: "liberado", dieta: "ver" }, mudancas: {},
  });
  h.series.mockResolvedValue({ ok: true, series: "mexer", pode_mudar: true });
  h.acesso.mockResolvedValue({ paciente_id: "p1", nome: "Rafael Moura", email: "rafa@teste.com", ativo: true, conta_id: "c1", acesso: null, agora: new Date().toISOString() });
});

describe("W-A P4 — Perfil do aluno › Acessos (spec §4.1)", () => {
  it("o topo com o 1º nome; à esquerda as linhas, à direita o Login do aluno (o card que era do Resumo, igual)", async () => {
    abrir();
    expect(await screen.findByText(/O que Rafael pode fazer no app\. Qualquer profissional dele/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-aba-acessos="pronto"]')).not.toBeNull());
    expect(await screen.findByText("Login do aluno")).toBeInTheDocument();
    expect(await screen.findByText("SEM ACESSO")).toBeInTheDocument();
    const grade = document.querySelector('[data-aba-acessos="pronto"]')!.parentElement!;
    expect(grade.className).toContain("grid-cols-1");
    expect(grade.className).toContain("lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]");
    expect(grade.children[1].matches("[data-card-acesso-aluno]")).toBe(true);
    expect(h.ler).toHaveBeenCalledWith("p1");
    expect(h.acesso).toHaveBeenCalledWith("p1");
  });
});
```

- [ ] **Step 2: A aba, o catálogo e a barra (verde)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T4-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh src/painel/aluno/abas/Acessos.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/catalogoAbas.test.ts src/painel/aluno/abas/Acessos.test.tsx src/rotas/Rotas.test.tsx`
Expected: `Test Files 3 passed` · `Tests 71 passed (71)` (6 + 1 + 64).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T4-codigo.patch`:
```diff
diff --git a/src/painel/aluno/AlunoLayout.tsx b/src/painel/aluno/AlunoLayout.tsx
index fbb07bc..4a17490 100644
--- a/src/painel/aluno/AlunoLayout.tsx
+++ b/src/painel/aluno/AlunoLayout.tsx
@@ -1,4 +1,4 @@
-import { Suspense } from "react";
+import { Suspense, useEffect, useRef } from "react";
 import { Link, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
 import { cn } from "@/lib/utils";
 import { listar, tela } from "@/rotas/registro";
@@ -8,7 +8,7 @@ import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
 import { Cartao } from "@/ui/premium/Cartao";
 import { Esqueleto, EstadoVazio } from "@/ui/premium/Estados";
 import { ModuloForaDoPlano } from "@/ui/casca/ModuloForaDoPlano";
-import { ABAS_ALUNO, ORDEM_RESUMO, abaAtualDaRota, estadoDaAbaAluno } from "./catalogoAbas";
+import { ABAS_ALUNO, ORDEM_RESUMO, abaAtualDaRota, estadoDaAbaAluno, rolagemParaMostrar } from "./catalogoAbas";
 import CabecalhoPadrao from "./CabecalhoPadrao";
 import { AlunoCtx } from "./contexto";
 import { modulosDoPerfil } from "./dados/regras";
@@ -28,7 +28,8 @@ const COR_PONTO = { treino: "var(--p-violeta)", nutricao: "var(--p-verde)" } as
 
 /**
  * Perfil do aluno no painel (tela 7): cabeçalho (o padrão da W1 ou o de src/painel/aluno/Cabecalho.tsx),
- * as 6 abas (Resumo · Treino · Dieta · Avaliação · Prontuário · Financeiro) e o conteúdo da aba.
+ * as 7 abas (Resumo · Treino · Dieta · Avaliação · Prontuário · Financeiro · Acessos) e o conteúdo da aba. W-A P4: no celular a barra
+ * rola na horizontal e a aba ativa rola para a vista (a Acessos, a última, fica fora da tela).
  */
 export default function AlunoLayout() {
   const { id = "" } = useParams();
@@ -38,6 +39,21 @@ export default function AlunoLayout() {
   const abaAtual = abaAtualDaRota(location.pathname, id);
   const abas = ABAS_ALUNO.filter((a) => estadoDaAbaAluno(a, modulos) !== null);
   const base = `/painel/alunos/${encodeURIComponent(id)}`;
+  const barra = useRef<HTMLElement>(null);
+  const nAbas = abas.length;
+
+  useEffect(() => {
+    const nav = barra.current;
+    const el = nav?.querySelector<HTMLElement>(`[data-aba-aluno="${abaAtual}"]`);
+    if (!nav || !el) return;
+    // a posição da aba DENTRO da barra (o getBoundingClientRect não depende de quem é o offsetParent)
+    const r = el.getBoundingClientRect();
+    const esquerda = r.left - nav.getBoundingClientRect().left + nav.scrollLeft;
+    const alvo = rolagemParaMostrar({ esquerda, largura: r.width }, { rolagem: nav.scrollLeft, largura: nav.clientWidth });
+    if (alvo === null) return;
+    if (typeof nav.scrollTo === "function") nav.scrollTo({ left: alvo, behavior: "smooth" });
+    else nav.scrollLeft = alvo;
+  }, [abaAtual, nAbas]);
 
   return (
     <AlunoCtx.Provider value={{ alunoId: id }}>
@@ -50,7 +66,7 @@ export default function AlunoLayout() {
           <CabecalhoPadrao alunoId={id} />
         )}
 
-        <nav aria-label="Abas do aluno" data-abas-aluno className="pq-sem-barra mt-4 flex gap-1 overflow-x-auto border-b border-linha">
+        <nav ref={barra} aria-label="Abas do aluno" data-abas-aluno className="pq-sem-barra mt-4 flex gap-1 overflow-x-auto border-b border-linha">
           {abas.map((a) => {
             const ativa = a.id === abaAtual;
             const Icone = a.icone;
diff --git a/src/painel/aluno/catalogoAbas.ts b/src/painel/aluno/catalogoAbas.ts
index 16a54a3..bee503f 100644
--- a/src/painel/aluno/catalogoAbas.ts
+++ b/src/painel/aluno/catalogoAbas.ts
@@ -1,15 +1,16 @@
-import { ClipboardCheck, Dumbbell, FileText, LayoutDashboard, Salad, Wallet } from "lucide-react";
+import { ClipboardCheck, Dumbbell, FileText, LayoutDashboard, Salad, ShieldCheck, Wallet } from "lucide-react";
 import type { LucideIcon } from "lucide-react";
 import { existe } from "@/rotas/registro";
 import type { Modulo } from "@/ui/casca/dadosCasca";
 
 /**
- * As 6 abas do perfil do aluno (spec 4.5, tela 7). A aba é `src/painel/aluno/abas/<arquivo>.tsx`; o Resumo é da casca e monta os
- * cards de `src/painel/aluno/resumo/`. Sem a tela, a aba some. W28: o fallback do "Configurar aluno" antigo do Calc (os grupos
- * `?ct=`) saiu com o legado — os links antigos com `?ct=` caem na aba certa pelos redirecionamentos (src/rotas/redirecionamentos.ts).
+ * As 7 abas do perfil do aluno (spec 4.5, tela 7; W-A P4: Acessos depois de Financeiro, para todo aluno). A aba é
+ * `src/painel/aluno/abas/<arquivo>.tsx`; o Resumo é da casca e monta os cards de `src/painel/aluno/resumo/`. Sem a tela, a aba some. W28:
+ * o fallback do "Configurar aluno" antigo do Calc (os grupos `?ct=`) saiu com o legado — os links antigos com `?ct=` caem na aba certa
+ * pelos redirecionamentos (src/rotas/redirecionamentos.ts).
  */
 export interface AbaAluno {
-  id: "resumo" | "treino" | "dieta" | "avaliacao" | "prontuario" | "financeiro";
+  id: "resumo" | "treino" | "dieta" | "avaliacao" | "prontuario" | "financeiro" | "acessos";
   arquivo: string | null;
   rotulo: string;
   icone: LucideIcon;
@@ -25,9 +26,14 @@ export const ABAS_ALUNO: AbaAluno[] = [
   { id: "avaliacao", arquivo: "Avaliacao", rotulo: "Avaliação", icone: ClipboardCheck, rota: "avaliacao", modulo: "ambos" },
   { id: "prontuario", arquivo: "Prontuario", rotulo: "Prontuário", icone: FileText, rota: "prontuario", modulo: "ambos" },
   { id: "financeiro", arquivo: "Financeiro", rotulo: "Financeiro", icone: Wallet, rota: "financeiro", modulo: "ambos" },
+  // W-A P4 (spec §4.1): o que o aluno pode no app — todo aluno (o Login do aluno mora aqui)
+  { id: "acessos", arquivo: "Acessos", rotulo: "Acessos", icone: ShieldCheck, rota: "acessos", modulo: "ambos" },
 ];
 
-/** Ordem dos cards do Resumo (tela 7 e spec 4.5): os 6 de cima e, abaixo, os de dados/acesso/ajustes. */
+/**
+ * Ordem dos cards do Resumo (tela 7 e spec 4.5): os 6 de cima e, abaixo, os de dados/mensagens/link. W-A P4: o card de login saiu (mora
+ * na aba Acessos — src/painel/aluno/resumo/acesso/) e o lugar do card Rotinas (a P6 cria) é o 7º, o 1º de baixo.
+ */
 export const ORDEM_RESUMO = [
   "CardTreino",
   "CardDieta",
@@ -35,8 +41,8 @@ export const ORDEM_RESUMO = [
   "CardProntuario",
   "CardFinanceiro",
   "CardProximosCompromissos",
+  "CardRotinas",
   "CardDadosAluno",
-  "CardAcessoAluno",
   "CardAjustesAluno",
   "CardLinkDiario",
   "CardResumoPrivado",
@@ -59,6 +65,21 @@ export function estadoDaAbaAluno(
   return aba.arquivo !== null && temNova(aba.arquivo) ? "nova" : null;
 }
 
+/**
+ * W-A P4 (spec §4.1: "a aba ativa rola para a vista na barra"): o quanto a barra de abas (que rola na horizontal no celular) tem de rolar
+ * para a aba ativa aparecer inteira, com uma folga; null = ela já está toda à vista.
+ */
+export function rolagemParaMostrar(
+  aba: { esquerda: number; largura: number },
+  barra: { rolagem: number; largura: number },
+  folga = 16,
+): number | null {
+  if (barra.largura <= 0 || aba.largura <= 0) return null;
+  if (aba.esquerda < barra.rolagem) return Math.max(0, aba.esquerda - folga);
+  if (aba.esquerda + aba.largura > barra.rolagem + barra.largura) return Math.max(0, aba.esquerda + aba.largura - barra.largura + folga);
+  return null;
+}
+
 export function abaAtualDaRota(pathname: string, alunoId: string): AbaAluno["id"] {
   const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;
   const resto = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, "").split("/")[0] : "";
```

`src/painel/aluno/abas/Acessos.tsx`:
```tsx
import { ListaDeAcessos } from "../acessos/ListaDeAcessos";
import { primeiroNome } from "../dados/regras";
import { usePerfilAluno } from "../dados/usePerfilAluno";
import CardAcessoAluno from "../resumo/acesso/CardAcessoAluno";

/**
 * Perfil do aluno › Acessos (W-A P4 — spec §4.1; P1–P4 do Weslley, 12/10/2026): depois de Financeiro, para todo aluno. À esquerda, "o
 * que ele pode no app" — uma linha por parte (Acesso ao app, Treino — séries, Dieta, Diário alimentar com fotos, Envio de fotos pelo link,
 * Rotinas), salvas na hora por QUALQUER profissional dele (src/painel/aluno/acessos/); à direita, o Login do aluno (o card que era do
 * Resumo, igual). No computador, 2 colunas; no celular, uma embaixo da outra (a barra de abas rola até a aba — AlunoLayout).
 * O nome vem do perfil (a mesma consulta do cabeçalho, já em cache).
 */
export default function Acessos({ alunoId }: { alunoId: string }) {
  const perfil = usePerfilAluno(alunoId).data;
  const nome = primeiroNome(perfil?.nome);
  return (
    <div className="flex flex-col gap-3.5" data-aba-acessos-aluno={alunoId}>
      <p className="text-[13px] leading-relaxed text-texto-2" data-acessos-topo>
        O que {nome || "o aluno"} pode fazer no app. Qualquer profissional dele (personal, nutricionista, dono da conta) muda; cada mudança
        fica registrada.
      </p>
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ListaDeAcessos alunoId={alunoId} nome={perfil?.nome ?? null} />
        <CardAcessoAluno alunoId={alunoId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit** — `feat(w-a): a aba Acessos no perfil do aluno (depois de Financeiro, todo aluno; a barra rola até ela no celular)` com
  `src/painel/aluno/abas/Acessos.tsx src/painel/aluno/abas/Acessos.test.tsx src/painel/aluno/catalogoAbas.ts src/painel/aluno/catalogoAbas.test.ts src/painel/aluno/AlunoLayout.tsx src/rotas/Rotas.test.tsx`;
  `feita.sh 4 "aba + catálogo + barra 71/71" "<placar>"`.

---

### Task 5: O Resumo e o cabeçalho (TDD)

**Files:** Modify `src/painel/aluno/dados/regras.ts`, `src/painel/aluno/dados/regras.test.ts`, `src/painel/aluno/resumo/CardAjustesAluno.tsx`,
`src/painel/aluno/resumo/cardsW14.test.tsx`, `src/painel/aluno/Cabecalho.tsx`, `src/painel/gates/FaixaMensagensDesligadas.tsx`.
**Estimativa:** 20 min (calibrado 4–6).

- [ ] **Step 1: Os testes (vermelho)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T5-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/dados/regras.test.ts src/painel/aluno/resumo/cardsW14.test.tsx`
Expected: `Test Files 2 failed` · `Tests 6 failed | 27 passed (33)` — o `regras.test.ts` 2 (o `AJUSTES` com só o WhatsApp; o motivo do link na aba Acessos) e o
`cardsW14.test.tsx` 4 (o ⋯ que abre a aba Acessos; o card "Mensagens automáticas"; o motivo do link; a frase da faixa).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T5-teste.patch`:
```diff
diff --git a/src/painel/aluno/dados/regras.test.ts b/src/painel/aluno/dados/regras.test.ts
index d3f3210..4c110f0 100644
--- a/src/painel/aluno/dados/regras.test.ts
+++ b/src/painel/aluno/dados/regras.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import type { CobrancaVista, FinanceiroProfissional } from "@/financeiro/tipos";
 import {
-  AJUSTES, ajustesVisiveis, alturaEmMetros, ATALHOS_FLUXO, bloqueadoPorPagamento, cadastroParaTreino, corpoDoAluno, faixaDeIdade, formDoPerfil, idadeDe,
+  AJUSTES, alturaEmMetros, ATALHOS_FLUXO, bloqueadoPorPagamento, cadastroParaTreino, corpoDoAluno, faixaDeIdade, formDoPerfil, idadeDe,
   linhaDoCabecalho, linhaDoPerfil, linkLigado, MENSAGEM_MENOR_DE_16, mensagemErroPerfil, mudancas, objetivoDoAluno, observacaoDoAjuste, resumoDaTrava, rotaDoAtalho,
   textoDoLink, validarCPF, validarForm, whatsappDoAluno,
 } from "./regras";
@@ -95,23 +95,20 @@ describe("hml-12 (H-30) — a faixa de idade da regra dos menores", () => {
   });
 });
 
-describe("W14 (F2, R12) — os 4 ajustes", () => {
-  it("o texto do link fala do envio de fotos (F1); diário e link só com Nutrição", () => {
-    expect(AJUSTES.find((a) => a.chave === "acesso_link")?.rotulo).toBe("Envio de fotos pelo link");
-    expect(ajustesVisiveis(perfil()).map((a) => a.chave)).toEqual(["acesso_app", "mensagens_automaticas", "diario_alimentar", "acesso_link"]);
-    expect(ajustesVisiveis(perfil({ modulos: ["treino"] })).map((a) => a.chave)).toEqual(["acesso_app", "mensagens_automaticas"]);
-  });
-  it("o aviso de cada ajuste para ESTE aluno", () => {
-    expect(observacaoDoAjuste("acesso_app", perfil({ tem_login: false }))).toMatch(/não tem login/);
+describe("W14 (F2, R12) — os ajustes; W-A P4: no Resumo fica só o das mensagens automáticas", () => {
+  it("o card 'Mensagens automáticas' tem só o WhatsApp (o acesso ao app, o diário e o link foram para a aba Acessos)", () => {
+    expect(AJUSTES.map((a) => a.chave)).toEqual(["mensagens_automaticas"]);
+    expect(AJUSTES[0].rotulo).toBe("Mensagens automáticas no WhatsApp");
+  });
+  it("o aviso do ajuste para ESTE aluno: sem telefone, nenhuma mensagem sai", () => {
     expect(observacaoDoAjuste("mensagens_automaticas", perfil({ telefone: null }))).toMatch(/Sem telefone/);
-    expect(observacaoDoAjuste("acesso_link", perfil({ ajustes: { ...perfil().ajustes, diario_alimentar: false } }))).toMatch(/diário/);
-    expect(observacaoDoAjuste("acesso_app", perfil())).toBeNull();
+    expect(observacaoDoAjuste("mensagens_automaticas", perfil())).toBeNull();
   });
-  it("o link do diário só funciona com o diário e o envio pelo link ligados", () => {
+  it("o link do diário só funciona com o diário e o envio pelo link liberados — o motivo aponta para a aba Acessos", () => {
     const a = perfil().ajustes;
     expect(linkLigado(a)).toEqual({ ligado: true, motivo: null });
-    expect(linkLigado({ ...a, diario_alimentar: false }).ligado).toBe(false);
-    expect(linkLigado({ ...a, acesso_link: false }).motivo).toMatch(/pelo link/);
+    expect(linkLigado({ ...a, diario_alimentar: false })).toEqual({ ligado: false, motivo: "O diário alimentar está desligado na aba Acessos." });
+    expect(linkLigado({ ...a, acesso_link: false }).motivo).toBe("O envio de fotos pelo link está desligado na aba Acessos.");
     expect(textoDoLink("Rafael Moura", "https://x/d/abc")).toBe("Oi, Rafael! Este é o link do seu diário alimentar: mande por ele as fotos das suas refeições.\nhttps://x/d/abc");
   });
 });
diff --git a/src/painel/aluno/resumo/cardsW14.test.tsx b/src/painel/aluno/resumo/cardsW14.test.tsx
index 850004a..14c30fd 100644
--- a/src/painel/aluno/resumo/cardsW14.test.tsx
+++ b/src/painel/aluno/resumo/cardsW14.test.tsx
@@ -1,8 +1,9 @@
 import { fireEvent, render, screen, waitFor } from "@testing-library/react";
 import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
-import { MemoryRouter } from "react-router-dom";
+import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
 import { beforeEach, describe, expect, it, vi } from "vitest";
 import { perfil } from "@/test/fixturesPerfilAluno";
+import { TopoCtx } from "@/ui/casca/topoContexto";
 import type { PerfilAluno } from "../dados/tipos";
 
 const h = vi.hoisted(() => ({
@@ -71,6 +72,42 @@ describe("W14 — cabeçalho da tela 7", () => {
     expect(screen.getByText("TREINO · LUCAS")).toBeInTheDocument();
     expect(screen.getByText("NUTRIÇÃO · CAMILA")).toBeInTheDocument();
   });
+  it("W-A P4: ⋯ › 'Acesso do aluno' abre a aba Acessos (o login do aluno mora lá)", async () => {
+    function Onde() {
+      const l = useLocation();
+      return <div data-testid="rota">{l.pathname}</div>;
+    }
+    // as ações do cabeçalho vão para o topo da casca (TopoPagina, por portal): aqui, um alvo próprio
+    const alvo = document.createElement("div");
+    document.body.appendChild(alvo);
+    render(
+      <MemoryRouter useTransitions={false} initialEntries={["/painel/alunos/p1"]}>
+        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
+          <TopoCtx.Provider value={{ alvoTitulo: null, alvoAcoes: alvo, definirProprio: () => {} }}>
+            <Routes>
+              <Route path="/painel/alunos/:id" element={<Cabecalho alunoId="p1" />} />
+              <Route path="*" element={<Onde />} />
+            </Routes>
+          </TopoCtx.Provider>
+        </QueryClientProvider>
+      </MemoryRouter>,
+    );
+    await screen.findByText("Rafael Moura");
+    const menu = await waitFor(() => {
+      const m = document.querySelector("[data-menu-perfil]");
+      if (!m) throw new Error("o ⋯ ainda não apareceu");
+      return m;
+    });
+    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: "mouse" });
+    fireEvent.keyDown(menu, { key: "Enter" });
+    fireEvent.click(await waitFor(() => {
+      const item = document.querySelector('[data-acao-perfil="acesso"]');
+      if (!item) throw new Error("o menu não abriu");
+      return item;
+    }));
+    await waitFor(() => expect(screen.getByTestId("rota").textContent).toBe("/painel/alunos/p1/acessos"));
+    alvo.remove();
+  });
   it("bloqueado e desativado aparecem como chips; erro de acesso vira a frase da tela", async () => {
     h.perfil.mockResolvedValue(perfil({ bloqueado: true }));
     const r = montar(<Cabecalho alunoId="p1" />);
@@ -106,25 +143,30 @@ describe("W14 — cards do Resumo", () => {
     expect(document.querySelector("[data-dados-grade]")!.nextElementSibling).toBe(secao);
     expect(secao.querySelector("[data-responsavel-registrar]")).not.toBeNull();
   });
-  it("Ajustes: os 4 (com o texto novo do link) e o interruptor grava o ajuste", async () => {
+  it("W-A P4: o card 'Mensagens automáticas' (era Ajustes do aluno) tem só o WhatsApp; o interruptor grava o ajuste", async () => {
     h.ajuste.mockResolvedValue({ acesso_app: true, mensagens_automaticas: true, diario_alimentar: true, acesso_link: true });
     montar(<CardAjustesAluno alunoId="p1" />);
-    expect(await screen.findByText("Envio de fotos pelo link")).toBeInTheDocument();
+    expect(await screen.findByText("Mensagens automáticas")).toBeInTheDocument();
+    expect(screen.queryByText("Ajustes do aluno")).toBeNull();
+    expect(document.querySelectorAll("[data-ajuste]").length).toBe(1);
+    for (const fora of ["Acesso ao app", "Diário alimentar com fotos", "Envio de fotos pelo link"]) expect(screen.queryByText(fora)).toBeNull();
     const msgs = screen.getByRole("switch", { name: "Mensagens automáticas no WhatsApp" });
     expect(msgs).toHaveAttribute("aria-checked", "false");
     fireEvent.click(msgs);
     await waitFor(() => expect(h.ajuste).toHaveBeenCalledWith("p1", "mensagens_automaticas", true));
     await waitFor(() => expect(screen.getByRole("switch", { name: "Mensagens automáticas no WhatsApp" })).toHaveAttribute("aria-checked", "true"));
   });
-  it("Ajustes: aluno só de treino não vê diário nem link; sem login, o acesso ao app fica travado com o aviso", async () => {
-    h.perfil.mockResolvedValue(perfil({ modulos: ["treino"], tem_login: false, ajustes: { acesso_app: false, mensagens_automaticas: false, diario_alimentar: true, acesso_link: true } }));
+  it("Mensagens automáticas: sem telefone, o aviso; quem não pode editar vê o interruptor desligado (e o aluno sem login também liga — é só o WhatsApp)", async () => {
+    h.perfil.mockResolvedValue(perfil({ telefone: null, pode_editar: false }));
+    const r = montar(<CardAjustesAluno alunoId="p1" />);
+    expect(await screen.findByText(/Sem telefone no cadastro/)).toBeInTheDocument();
+    expect(screen.getByRole("switch", { name: "Mensagens automáticas no WhatsApp" })).toBeDisabled();
+    r.unmount();
+    h.perfil.mockResolvedValue(perfil({ tem_login: false }));
     montar(<CardAjustesAluno alunoId="p1" />);
-    expect(await screen.findByText("Acesso ao app")).toBeInTheDocument();
-    expect(screen.queryByText("Diário alimentar com fotos")).toBeNull();
-    expect(screen.getByRole("switch", { name: "Acesso ao app" })).toBeDisabled();
-    expect(screen.getByText(/ainda não tem login/)).toBeInTheDocument();
+    expect(await screen.findByRole("switch", { name: "Mensagens automáticas no WhatsApp" })).not.toBeDisabled();
   });
-  it("Link do diário: /d/<código> (F1); desligado nos ajustes mostra o motivo; só com Nutrição", async () => {
+  it("Link do diário: /d/<código> (F1); desligado na aba Acessos mostra o motivo; só com Nutrição", async () => {
     const r = montar(<CardLinkDiario alunoId="p1" />);
     const url = await waitFor(() => document.querySelector("[data-link-diario]")!.getAttribute("data-link-diario"));
     expect(url).toMatch(/\/d\/abc234xyz9$/);
@@ -133,7 +175,7 @@ describe("W14 — cards do Resumo", () => {
     h.perfil.mockResolvedValue(perfil({ ajustes: { acesso_app: true, mensagens_automaticas: false, diario_alimentar: true, acesso_link: false } }));
     const r2 = montar(<CardLinkDiario alunoId="p1" />);
     expect(await screen.findByText("DESLIGADO")).toBeInTheDocument();
-    expect(screen.getByText(/envio de fotos pelo link está desligado/)).toBeInTheDocument();
+    expect(screen.getByText(/envio de fotos pelo link está desligado na aba Acessos/)).toBeInTheDocument();
     r2.unmount();
     h.perfil.mockResolvedValue(perfil({ modulos: ["treino"] }));
     montar(<CardLinkDiario alunoId="p1" />);
@@ -200,6 +242,7 @@ describe("W14 (P15) — aviso único das mensagens desligadas", () => {
     fireEvent.click(screen.getByRole("button", { name: /Ver quais/ }));
     expect(await screen.findByText("Marina Alves")).toBeInTheDocument();
     expect(document.querySelectorAll("[data-mensagens-aluno]").length).toBe(2);
+    expect(screen.getByText(/no perfil do aluno, no card Mensagens automáticas/)).toBeInTheDocument();
     fireEvent.click(screen.getByRole("button", { name: /Ligar para os 2/ }));
     await waitFor(() => expect(h.ligar).toHaveBeenCalledWith(["a", "b"]));
     await waitFor(() => expect(document.querySelector("[data-faixa-mensagens]")).toBeNull());
```

- [ ] **Step 2: O Resumo e o cabeçalho (verde)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T5-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/painel/aluno/dados/regras.test.ts src/painel/aluno/resumo/cardsW14.test.tsx`
Expected: `Test Files 2 passed` · `Tests 33 passed (33)` (20 + 13).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T5-codigo.patch`:
```diff
diff --git a/src/painel/aluno/Cabecalho.tsx b/src/painel/aluno/Cabecalho.tsx
index d65dbe5..4bcf636 100644
--- a/src/painel/aluno/Cabecalho.tsx
+++ b/src/painel/aluno/Cabecalho.tsx
@@ -1,5 +1,5 @@
 import { Suspense, useState } from "react";
-import { useLocation, useNavigate } from "react-router-dom";
+import { useNavigate } from "react-router-dom";
 import { DropdownMenu } from "radix-ui";
 import {
   Ban, ClipboardCheck, Dumbbell, Ellipsis, FileDown, KeyRound, Lock, LockOpen, MessageCircle, PauseCircle, Pencil, RotateCcw, Salad, Users, UserX,
@@ -49,7 +49,6 @@ function destinoNovaAvaliacao(base: string): string | null {
 
 function AcoesDoCabecalho({ perfil, alunoId, aoEditar }: { perfil: PerfilAluno; alunoId: string; aoEditar: () => void }) {
   const navigate = useNavigate();
-  const { pathname } = useLocation();
   const celular = useIsMobile();
   const treinoPronto = useTreinoPronto();
   const atualizar = useAtualizarAluno(alunoId);
@@ -84,13 +83,8 @@ function AcoesDoCabecalho({ perfil, alunoId, aoEditar }: { perfil: PerfilAluno;
     }
   };
 
-  const irParaAcesso = () => {
-    const rolar = () => document.querySelector("[data-card-acesso-aluno]")?.scrollIntoView({ behavior: "smooth", block: "center" });
-    if (pathname.replace(/\/+$/, "") !== base) {
-      navigate(base);
-      window.setTimeout(rolar, 600);
-    } else rolar();
-  };
+  // W-A P4 (spec §4.2): o login do aluno mora na aba Acessos (era o card do Resumo)
+  const irParaAcesso = () => navigate(`${base}/acessos`);
 
   const mensagem = zap ? (
     celular ? (
@@ -164,8 +158,8 @@ function AcoesDoCabecalho({ perfil, alunoId, aoEditar }: { perfil: PerfilAluno;
 
 /**
  * Cabeçalho do perfil do aluno (tela 7 — W14, encaixe da W1 no lugar do CabecalhoPadrao): trilha "Alunos › nome"; à direita
- * Mensagem (WhatsApp do aluno — P24), Nova avaliação e ⋯ (editar dados, PDFs "Dados & Evolução" e "Treino", Acesso do aluno,
- * Bloquear, Desativar, Remover — as ações da W13, com a regra nova); no cartão, foto, nome, "28 anos · 1,78 m · objetivo:
+ * Mensagem (WhatsApp do aluno — P24), Nova avaliação e ⋯ (editar dados, PDFs "Dados & Evolução" e "Treino", Acesso do aluno — a aba
+ * Acessos, W-A P4 —, Bloquear, Desativar, Remover — as ações da W13, com a regra nova); no cartão, foto, nome, "28 anos · 1,78 m · objetivo:
  * definição · aluno desde mar/2026", os chips TREINO · <personal> e NUTRIÇÃO · <nutri> e os números de src/painel/aluno/kpis/.
  * Os dados são da matrícula no banco principal (vale para quem veio do Calc e do Nutri); altura e peso de quem tem treino vêm
  * do Banco do Treino.
diff --git a/src/painel/aluno/dados/regras.ts b/src/painel/aluno/dados/regras.ts
index 1506781..4a48c97 100644
--- a/src/painel/aluno/dados/regras.ts
+++ b/src/painel/aluno/dados/regras.ts
@@ -267,44 +267,36 @@ export function mensagemErroPerfil(codigo: string | null | undefined): string {
   return "Não deu certo agora. Tente de novo.";
 }
 
-// ───────────────────────── Ajustes do aluno (R12) ─────────────────────────
+// ───────────────────────── Mensagens automáticas (R12; W-A P4) ─────────────────────────
 
 export interface DefAjuste {
   chave: ChaveAjuste;
   rotulo: string;
   ajuda: string;
-  /** só aparece para aluno com Nutrição (o diário é da nutricionista) */
-  soNutricao?: boolean;
 }
 
-/** Os 4 ajustes do site antigo, agora valendo (R12); o do link fala do envio de fotos (F1, R13). */
+/**
+ * O ajuste que ficou no Resumo — o card "Mensagens automáticas" (R12). W-A P4 (P2/P3 do Weslley, 12/10/2026): o acesso ao app, o diário
+ * alimentar com fotos e o envio de fotos pelo link (F1, R13) foram para a aba Acessos (src/painel/aluno/acessos/regras.ts).
+ */
 export const AJUSTES: DefAjuste[] = [
-  { chave: "acesso_app", rotulo: "Acesso ao app", ajuda: "Desligado, o app abre fechado: \"Seu acesso ao app está desligado. Fale com seu profissional\"." },
   { chave: "mensagens_automaticas", rotulo: "Mensagens automáticas no WhatsApp", ajuda: "Lembretes de consulta, aniversário e cobrança pelo WhatsApp conectado em Mensagens." },
-  { chave: "diario_alimentar", rotulo: "Diário alimentar com fotos", ajuda: "O aluno manda fotos das refeições (no app e pelo link) e você reage.", soNutricao: true },
-  { chave: "acesso_link", rotulo: "Envio de fotos pelo link", ajuda: "O aluno manda as fotos pelo link do diário, sem entrar no app.", soNutricao: true },
 ];
 
 export function temNutricao(p: Pick<PerfilAluno, "modulos">): boolean {
   return p.modulos.includes("nutricao");
 }
 
-export function ajustesVisiveis(p: Pick<PerfilAluno, "modulos">): DefAjuste[] {
-  return AJUSTES.filter((a) => !a.soNutricao || temNutricao(p));
-}
-
 /** Aviso embaixo do ajuste (o que muda de verdade para ESTE aluno). */
-export function observacaoDoAjuste(chave: ChaveAjuste, p: Pick<PerfilAluno, "tem_login" | "telefone" | "ajustes">): string | null {
-  if (chave === "acesso_app" && !p.tem_login) return "Ele ainda não tem login: crie o acesso no card Acesso do aluno.";
+export function observacaoDoAjuste(chave: ChaveAjuste, p: Pick<PerfilAluno, "telefone">): string | null {
   if (chave === "mensagens_automaticas" && !whatsappDoAluno(p.telefone)) return "Sem telefone no cadastro: nenhuma mensagem sai.";
-  if (chave === "acesso_link" && !p.ajustes.diario_alimentar) return "Vale quando o diário alimentar estiver ligado.";
   return null;
 }
 
-/** O link do diário funciona? (os 2 ajustes ligados) */
+/** O link do diário funciona? (o diário e o envio pelo link liberados — W-A P4: na aba Acessos) */
 export function linkLigado(a: AjustesAluno): { ligado: boolean; motivo: string | null } {
-  if (!a.diario_alimentar) return { ligado: false, motivo: "O diário alimentar está desligado nos ajustes." };
-  if (!a.acesso_link) return { ligado: false, motivo: "O envio de fotos pelo link está desligado nos ajustes." };
+  if (!a.diario_alimentar) return { ligado: false, motivo: "O diário alimentar está desligado na aba Acessos." };
+  if (!a.acesso_link) return { ligado: false, motivo: "O envio de fotos pelo link está desligado na aba Acessos." };
   return { ligado: true, motivo: null };
 }
 
diff --git a/src/painel/aluno/resumo/CardAjustesAluno.tsx b/src/painel/aluno/resumo/CardAjustesAluno.tsx
index f0b6fbf..fcdf36e 100644
--- a/src/painel/aluno/resumo/CardAjustesAluno.tsx
+++ b/src/painel/aluno/resumo/CardAjustesAluno.tsx
@@ -5,15 +5,15 @@ import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
 import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
 import { Esqueleto } from "@/ui/premium/Estados";
 import { ErroPerfil, salvarAjusteAluno } from "../dados/api";
-import { ajustesVisiveis, mensagemErroPerfil, observacaoDoAjuste } from "../dados/regras";
+import { AJUSTES, mensagemErroPerfil, observacaoDoAjuste } from "../dados/regras";
 import type { ChaveAjuste, PerfilAluno } from "../dados/tipos";
 import { chavePerfilAluno, usePerfilAluno } from "../dados/usePerfilAluno";
 
 /**
- * Card "Ajustes do aluno" do Resumo (W14 — N-27; falha F2 / R12): os 4 ajustes do site antigo do Nutri, agora VALENDO —
- * acesso ao app (a trava GateAcessoApp fecha o app), mensagens automáticas no WhatsApp (o enfileirador só manda para quem está
- * ligado), diário alimentar com fotos (app e link) e envio de fotos pelo link (F1). O diário e o link só para aluno com Nutrição.
- * Grava no mesmo pacientes.config do site antigo (as 2 telas mostram o mesmo valor).
+ * Card "Mensagens automáticas" do Resumo (era o "Ajustes do aluno" da W14 — N-27; falha F2 / R12): o ajuste das mensagens automáticas no
+ * WhatsApp (o enfileirador só manda para quem está ligado). W-A P4 (P2/P3 do Weslley, 12/10/2026): o acesso ao app, o diário alimentar com
+ * fotos e o envio de fotos pelo link foram para a aba Acessos — aqui fica só o WhatsApp. Grava no mesmo pacientes.config (dados/api.ts —
+ * a hml-21c troca só o miolo, com a mesma assinatura).
  */
 export default function CardAjustesAluno({ alunoId }: { alunoId: string }) {
   const q = usePerfilAluno(alunoId);
@@ -37,17 +37,16 @@ export default function CardAjustesAluno({ alunoId }: { alunoId: string }) {
 
   return (
     <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-ajustes-aluno={p ? p.paciente_id : "carregando"}>
-      <CabecalhoCartao titulo="Ajustes do aluno" />
+      <CabecalhoCartao titulo="Mensagens automáticas" />
       {q.isLoading ? (
         <Esqueleto className="h-[160px] w-full" />
       ) : !p ? (
         <p className="text-[12.5px] text-texto-3">{mensagemErroPerfil(q.error instanceof Error ? q.error.message : "")}</p>
       ) : (
         <ul className="flex flex-col" data-ajustes-lista>
-          {ajustesVisiveis(p).map((a) => {
+          {AJUSTES.map((a) => {
             const obs = observacaoDoAjuste(a.chave, p);
             const ligado = p.ajustes[a.chave];
-            const semLogin = a.chave === "acesso_app" && !p.tem_login;
             return (
               <li key={a.chave} className="flex items-start gap-3 border-b border-linha py-2.5 last:border-b-0" data-ajuste={a.chave} data-ajuste-ligado={ligado ? "1" : "0"}>
                 <div className="min-w-0 flex-1">
@@ -59,7 +58,7 @@ export default function CardAjustesAluno({ alunoId }: { alunoId: string }) {
                   ligado={ligado}
                   aoMudar={(v) => void mudar(a.chave, v)}
                   rotulo={a.rotulo}
-                  desligado={!p.pode_editar || salvando !== null || semLogin}
+                  desligado={!p.pode_editar || salvando !== null}
                   data-ajuste-botao={a.chave}
                 />
               </li>
diff --git a/src/painel/gates/FaixaMensagensDesligadas.tsx b/src/painel/gates/FaixaMensagensDesligadas.tsx
index 8cb1152..3ca381b 100644
--- a/src/painel/gates/FaixaMensagensDesligadas.tsx
+++ b/src/painel/gates/FaixaMensagensDesligadas.tsx
@@ -98,7 +98,7 @@ export default function FaixaMensagensDesligadas({ children }: { children: React
           ))}
         </ul>
         <p className="mt-3 text-[12px] leading-relaxed text-texto-3">
-          Você também liga ou desliga um por um no perfil do aluno, em Ajustes do aluno.
+          Você também liga ou desliga um por um no perfil do aluno, no card Mensagens automáticas.
         </p>
       </PainelDeslizante>
       {children}
```

- [ ] **Step 3: Commit** — `feat(w-a): o Resumo sem o card de login e com "Mensagens automáticas" (só o WhatsApp); o ⋯ abre a aba Acessos` com
  `src/painel/aluno/dados/regras.ts src/painel/aluno/dados/regras.test.ts src/painel/aluno/resumo/CardAjustesAluno.tsx src/painel/aluno/resumo/cardsW14.test.tsx src/painel/aluno/Cabecalho.tsx src/painel/gates/FaixaMensagensDesligadas.tsx`;
  `feita.sh 5 "Resumo e cabeçalho 33/33" "<placar>"`.

---

### Task 6: O Treino — o editor sem o cadeado, o texto da aba e a ponta do app (TDD)

**Files:** Modify `src/treino/editor/EditorTreino.tsx`, `src/treino/editor/EditorTreino.test.tsx`, `src/painel/aluno/abas/Treino.tsx`; Create
`src/treino/ui/SeriesDoExercicio.test.tsx` (defeito 2).
**Estimativa:** 15 min (calibrado 3–5).

- [ ] **Step 1: Os testes (vermelho)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T6-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh src/treino/ui/SeriesDoExercicio.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/treino/editor/EditorTreino.test.tsx src/treino/ui/SeriesDoExercicio.test.tsx`
Expected: `Test Files 1 failed | 1 passed` · `Tests 3 failed | 16 passed (19)` — o `EditorTreino.test.tsx` 3 (o chip ainda está lá ×2; o texto da aba Treino sem
login) e o `SeriesDoExercicio.test.tsx` 3/3 JÁ passa: ele prova a ponta do app, que a P4 não muda (a corrente da decisão 12).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T6-teste.patch`:
```diff
diff --git a/src/treino/editor/EditorTreino.test.tsx b/src/treino/editor/EditorTreino.test.tsx
index 2fe892c..8a10996 100644
--- a/src/treino/editor/EditorTreino.test.tsx
+++ b/src/treino/editor/EditorTreino.test.tsx
@@ -114,14 +114,15 @@ beforeEach(() => {
 });
 
 describe("W15 — editor do treino (tela 8, lado esquerdo)", () => {
-  it("abas A/B/C, chips (exercícios, séries, duração, cadeado) e os 4 campos de cada exercício", async () => {
+  it("abas A/B/C, chips (exercícios, séries, duração — W-A P4: sem o cadeado, que foi para a aba Acessos) e os 4 campos de cada exercício", async () => {
     montar(<EditorTreino treinoUserId="t1" />);
     expect(await screen.findByText("A · Peito e tríceps")).toBeInTheDocument();
     expect(screen.getByText("B · Costas")).toBeInTheDocument();
     expect(screen.getByText("C · Pernas")).toBeInTheDocument();
     expect(screen.getByText("5 EXERCÍCIOS")).toBeInTheDocument();
     expect(screen.getByText("16 SÉRIES")).toBeInTheDocument();
-    expect(screen.getByText("ALUNO NÃO MUDA AS SÉRIES")).toBeInTheDocument();
+    expect(screen.queryByText("ALUNO NÃO MUDA AS SÉRIES")).toBeNull();
+    expect(document.querySelector("[data-chip-cadeado]")).toBeNull();
     expect(screen.getByText(/DESCANSO PADRÃO 60 S/)).toBeInTheDocument();
     expect(screen.getByText(/TREINO ALTERNADO: NÃO/)).toBeInTheDocument();
     expect(screen.getByText("Adicionar exercício da biblioteca (81 com GIF)")).toBeInTheDocument();
@@ -181,16 +182,16 @@ describe("W15 — editor do treino (tela 8, lado esquerdo)", () => {
     expect(campo.value).toBe("");
   });
 
-  it("cadeado e observação gravam na hora", async () => {
+  it("a observação grava na hora (W-A P4: o cadeado das séries saiu do editor — nenhum caminho daqui grava series_travadas)", async () => {
     montar(<EditorTreino treinoUserId="t1" />);
     await screen.findByText("A · Peito e tríceps");
-    fireEvent.click(screen.getByText("ALUNO NÃO MUDA AS SÉRIES"));
-    await waitFor(() => expect(h.salvarConfig).toHaveBeenCalledWith("t1", { series_travadas: false }));
+    expect(screen.queryByText(/AS SÉRIES$/)).toBeNull();
     const obs = document.querySelector("[data-treino-observacao-campo]") as HTMLTextAreaElement;
     fireEvent.focus(obs);
     fireEvent.change(obs, { target: { value: "Desça a barra em 3 segundos." } });
     fireEvent.blur(obs);
     await waitFor(() => expect(h.salvarObservacao).toHaveBeenCalledWith("t1", { grupo_id: "gA" }, "Desça a barra em 3 segundos."));
+    expect(h.salvarConfig).not.toHaveBeenCalled();
   });
 
   it("trocar de aba mostra o outro treino; treino compartilhado avisa que a lista vira cópia", async () => {
@@ -254,7 +255,9 @@ describe("W15 — card Treino do Resumo (tela 7) e a aba", () => {
     h.estado.mockReturnValue({ tipo: "sem-login", temLogin: false });
     montar(<AbaTreino alunoId="p1" />);
     expect(screen.getByText("O treino nasce no 1º acesso do aluno")).toBeInTheDocument();
-    expect(screen.getByText("Ir para o Resumo")).toBeInTheDocument();
+    // W-A P4: o login do aluno mora na aba Acessos
+    expect(screen.getByText(/Crie o acesso na aba Acessos \(Login do aluno\)/)).toBeInTheDocument();
+    expect(screen.getByText("Ir para Acessos").closest("a")?.getAttribute("href")).toBe("/painel/alunos/p1/acessos");
   });
 
   it("a aba monta o editor, a semana, as séries e a troca, o volume, o histórico e o relatório", async () => {
```

`src/treino/ui/SeriesDoExercicio.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nivelDasSeries } from "../../../supabase/functions/_shared/treino-acessos-regras";
import type { SerieComMemoria } from "../tipos";
import { SeriesDoExercicio } from "./SeriesDoExercicio";

// W-A P4 (spec §6 "P4", o "Pronto": "a nutri trava as séries e o app mostra 'O número de séries é definido pelo seu profissional'"): a
// ponta do APP da corrente. A aba Acessos grava series_travadas pela treino-acessos ("Só ver" = true — nivelDasSeries); o app lê o
// physiq_profiles pelo PowerSync (src/treino/useTreinoDoDia.ts) e o TreinoDoSlot passa podeEditar = !seriesTravadas. No local e no staging o
// build não tem PowerSync (H-14: src/lib/powersync/instancia.ts) — a tela do aluno não abre lá; por isso esta ponta é provada aqui e o E2E
// confere o banco do Treino.
const serie = (n: number): SerieComMemoria => ({ exercicio_id: "e1", numero_serie: n, peso: 40, reps: 10, salva: true });

function abrir(podeEditar: boolean) {
  const acoes = { aoSalvar: vi.fn(), aoConcluir: vi.fn(), aoDesfazer: vi.fn(), aoRemover: vi.fn(), aoAdicionar: vi.fn() };
  render(<SeriesDoExercicio exercicioId="e1" nome="Supino" series={[serie(1), serie(2)]} corrida={false} podeEditar={podeEditar} {...acoes} />);
  return acoes;
}

describe("W-A P4 — as séries travadas pela aba Acessos, no app do aluno", () => {
  it("'Só ver' na aba = series_travadas true; 'Pode mexer' = false (a regra da treino-acessos)", () => {
    expect(nivelDasSeries(true)).toBe("ver");
    expect(nivelDasSeries(false)).toBe("mexer");
    expect(nivelDasSeries(null)).toBe("mexer");
  });

  it("travadas: 'O número de séries é definido pelo seu profissional.', sem 'Adicionar série' e sem tirar série", () => {
    abrir(false);
    expect(screen.getByText("O número de séries é definido pelo seu profissional.")).toBeInTheDocument();
    expect(screen.queryByText("Adicionar série")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tirar série" })).toBeNull();
  });

  it("liberadas: põe e tira série (como hoje)", () => {
    const acoes = abrir(true);
    expect(screen.queryByText("O número de séries é definido pelo seu profissional.")).toBeNull();
    fireEvent.click(screen.getByText("Adicionar série"));
    expect(acoes.aoAdicionar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Tirar série" })[1]);
    expect(acoes.aoRemover).toHaveBeenCalledWith(2, true);
  });
});
```

- [ ] **Step 2: O editor sem o cadeado e o texto da aba (verde)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T6-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/treino/editor/EditorTreino.test.tsx src/treino/ui/SeriesDoExercicio.test.tsx`
Expected: `Test Files 2 passed` · `Tests 19 passed (19)` (16 + 3).

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T6-codigo.patch`:
```diff
diff --git a/src/painel/aluno/abas/Treino.tsx b/src/painel/aluno/abas/Treino.tsx
index 4fff798..cdb95e9 100644
--- a/src/painel/aluno/abas/Treino.tsx
+++ b/src/painel/aluno/abas/Treino.tsx
@@ -10,7 +10,8 @@ import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados"
 
 /**
  * Perfil do aluno › Treino (W15 — spec 4.5, tela 8 lado esquerdo; C37–C39, C41, C45, C84, NF1, NF2, NF7): o editor do treino
- * (treinos A/B/C, exercícios com séries, repetições, descanso e carga, observação, cadeado, descanso padrão, alternado) e, em
+ * (treinos A/B/C, exercícios com séries, repetições, descanso e carga, observação, descanso padrão, alternado — o cadeado das séries foi
+ * para a aba Acessos, W-A P4) e, em
  * volta, a semana do aluno com os extras, o nº de séries padrão × por exercício e a troca do treino, o volume semanal, o
  * histórico e o relatório do mês (PDF e Excel) com o PDF do treino. Grava no Banco do Treino (o aluno vê pelo PowerSync).
  * Substitui os grupos Treino e Configuração do "Configurar aluno" antigo (os componentes antigos ficam até a W28).
@@ -36,9 +37,9 @@ export default function Treino({ alunoId }: { alunoId: string }) {
         texto={
           est.temLogin
             ? "O aluno ainda não abriu o app. Assim que ele entrar pela primeira vez, você monta o treino aqui."
-            : "O aluno ainda não tem acesso ao app. Crie o acesso no Resumo (Acesso do aluno) e, depois do 1º login dele, monte o treino aqui."
+            : "O aluno ainda não tem acesso ao app. Crie o acesso na aba Acessos (Login do aluno) e, depois do 1º login dele, monte o treino aqui."
         }
-        acao={!est.temLogin ? <Link to={base} className="text-[13px] font-semibold text-violeta-3">Ir para o Resumo</Link> : undefined}
+        acao={!est.temLogin ? <Link to={`${base}/acessos`} className="text-[13px] font-semibold text-violeta-3">Ir para Acessos</Link> : undefined}
       />
     );
   }
diff --git a/src/treino/editor/EditorTreino.tsx b/src/treino/editor/EditorTreino.tsx
index 6824f05..53d107f 100644
--- a/src/treino/editor/EditorTreino.tsx
+++ b/src/treino/editor/EditorTreino.tsx
@@ -2,7 +2,7 @@ import { useEffect, useMemo, useRef, useState } from "react";
 import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
 import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
 import { CSS } from "@dnd-kit/utilities";
-import { Bookmark, Dumbbell, GripVertical, Lock, LockOpen, Plus, Repeat, Timer, UserMinus } from "lucide-react";
+import { Bookmark, Dumbbell, GripVertical, Plus, Repeat, Timer, UserMinus } from "lucide-react";
 import { cn } from "@/lib/utils";
 import { formatarDescanso } from "@/treino/prescricao";
 import { Botao } from "@/ui/premium/Botao";
@@ -67,7 +67,7 @@ function AbaTreino({ t, ativa, aoAbrir }: { t: TreinoEditor; ativa: boolean; aoA
 
 /**
  * Editor do treino do aluno (tela 8, lado esquerdo — spec 4.5 › Treino, C37/C41/C84 e NF1/NF2): treinos A/B/C, "+", Modelos;
- * chips de exercícios, séries, duração e o cadeado "Aluno não muda as séries"; por exercício o GIF, nome, grupo · subgrupo,
+ * chips de exercícios, séries e duração (W-A P4: o cadeado "Aluno não muda as séries" foi para a aba Acessos); por exercício o GIF, nome, grupo · subgrupo,
  * séries, repetições, descanso e carga (vazio = como hoje), editar, tirar e arrastar; "Adicionar exercício da biblioteca";
  * observação para o aluno; descanso padrão e treino alternado. Grava no Banco do Treino a cada mudança (o aluno vê pelo
  * PowerSync). A W16 monta a página "Editar treino e dieta" com este mesmo componente.
@@ -110,7 +110,6 @@ export function EditorTreino({ treinoUserId, somenteLeitura = false, nomeAluno,
       treino={treino}
       aoAbrir={(t) => setAberta(t.chave)}
       descansoPadrao={descansoDoAluno(dados.data)}
-      travado={dados.data.config?.series_travadas === true}
       alternado={temAlternado(dados.data)}
       professorDoAluno={dados.data.professorDoAluno}
       treinoUserId={treinoUserId}
@@ -128,7 +127,6 @@ function CorpoEditor({
   treino,
   aoAbrir,
   descansoPadrao,
-  travado,
   alternado,
   professorDoAluno,
   treinoUserId,
@@ -142,7 +140,6 @@ function CorpoEditor({
   treino: TreinoEditor | null;
   aoAbrir: (t: TreinoEditor) => void;
   descansoPadrao: number;
-  travado: boolean;
   alternado: boolean;
   professorDoAluno: string | null;
   treinoUserId: string;
@@ -223,22 +220,11 @@ function CorpoEditor({
         />
       ) : treino ? (
         <>
-          {/* chips: exercícios · séries · duração · cadeado */}
+          {/* chips: exercícios · séries · duração (W-A P4: o cadeado das séries mora na aba Acessos) */}
           <div className="mb-1.5 flex flex-wrap items-center gap-1.5" data-treino-chips>
             <Chip tom="t" data-chip-exercicios>{treino.exercicios.length} {treino.exercicios.length === 1 ? "EXERCÍCIO" : "EXERCÍCIOS"}</Chip>
             <Chip tom="g" data-chip-series>{treino.totalSeries} {treino.totalSeries === 1 ? "SÉRIE" : "SÉRIES"}</Chip>
             {treino.minutos !== null && <Chip tom="g" data-chip-minutos>~{treino.minutos} MIN</Chip>}
-            <button
-              type="button"
-              disabled={somenteLeitura}
-              onClick={() => void acoes.configurar({ series_travadas: !travado }, travado ? "Séries liberadas: o aluno pode pôr e tirar séries." : "Séries travadas: o aluno não muda o nº de séries.")}
-              aria-pressed={travado}
-              className={cn("pq-chip pq-chip-g", !somenteLeitura && "cursor-pointer hover:text-texto")}
-              data-chip-cadeado={travado ? "travado" : "livre"}
-            >
-              {travado ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
-              {travado ? "ALUNO NÃO MUDA AS SÉRIES" : "ALUNO PODE MUDAR AS SÉRIES"}
-            </button>
             {!treino.listaDireta && treino.tipo === "catalogo" && !somenteLeitura && (
               <span className="text-[11px] text-texto-3" data-treino-compartilhado title="Mudar a lista de exercícios cria uma cópia só deste aluno">
                 {treino.global ? "Modelo da biblioteca" : treino.alunos > 1 ? `Também de outros ${treino.alunos - 1} ${treino.alunos - 1 === 1 ? "aluno" : "alunos"}` : "Modelo"}
```

- [ ] **Step 3: Commit** — `feat(w-a): o cadeado das séries sai do editor do Treino (vai para a aba Acessos); a aba Treino aponta para Acessos` com
  `src/treino/editor/EditorTreino.tsx src/treino/editor/EditorTreino.test.tsx src/painel/aluno/abas/Treino.tsx src/treino/ui/SeriesDoExercicio.test.tsx`;
  `feita.sh 6 "editor sem cadeado + a ponta do app 19/19" "<placar>"`.

---

### Task 7: Os E2E antigos que procuravam o que mudou (`w08b`, `w14`, `w15`)

**Files:** Modify `e2e/w08b/telas.py`, `e2e/w14/telas.py`, `e2e/w14/prod.py`, `e2e/w15/telas.py`.
**Estimativa:** 15 min (calibrado 3–4).

- [ ] **Step 1: As edições e a sintaxe**

Run: `cd ~/projetos/physiqcalc-wa-p4 && git apply ~/projetos/physiqcalc-scratch/w-a/p4/patches/T7.patch && python3 -c "[compile(open(f).read(), f, 'exec') for f in ('e2e/w08b/telas.py', 'e2e/w14/telas.py', 'e2e/w14/prod.py', 'e2e/w15/telas.py')]; print('compila ok')"`
Expected: `compila ok`. (Rodam na Task 12 — só os casos que a P4 tocou; defeito 7.)

`~/projetos/physiqcalc-scratch/w-a/p4/patches/T7.patch`:
```diff
diff --git a/e2e/w08b/telas.py b/e2e/w08b/telas.py
index 8db7e73..6120a1a 100644
--- a/e2e/w08b/telas.py
+++ b/e2e/w08b/telas.py
@@ -7,7 +7,8 @@ Casos (na ordem):
   espera       w8b-bloqueio pelo formulário (390 px): 3 erradas → "E-mail ou senha incorretos."; a 4ª → "Muitas tentativas. Tente de
                novo em 1:00" com o botão travado; relógio acelerado → 5:00, 15:00, 30:00, 60:00; a seguinte → "Conta bloqueada por
                tentativas…" + botão do Google; a senha CERTA continua recusada
-  card         w8b-personal no painel (1280 × 883 × 2): Resumo do Rafael (bloqueado de vez) com o card Acesso do aluno; "Criar
+  card         w8b-personal no painel (1280 × 883 × 2): a aba Acessos do Rafael (bloqueado de vez) com o card Login do aluno (W-A P4: era o
+               "Acesso do aluno" do Resumo); "Criar
                senha nova" → a folha com a senha gerada → salva → mostra o que passar ao aluno; o card vira SENHA PROVISÓRIA
   provisoria   Rafael entra com a senha provisória (390 px) → "Crie a sua senha"; "Agora não" → o app abre; entra de novo → a
                tela volta; cria a dele → o app abre; entra com a nova → a tela NÃO aparece
@@ -117,10 +118,10 @@ def entrar_ui(nav, a, nome: str, email: str, senha: str) -> B.Caso:
     return c
 
 
-def esperar_resumo(c: B.Caso, nome: str) -> bool:
-    """O Resumo inteiro carregado (cabeçalho com o nome e o card Financeiro sem o esqueleto) antes do print."""
+def esperar_acessos(c: B.Caso, nome: str) -> bool:
+    """W-A P4: a aba Acessos carregada (cabeçalho com o nome e as linhas sem o esqueleto) antes do print — o card de login mora nela."""
     return c.esperar(lambda: nome in c.pg.locator("[data-perfil-aluno]").inner_text()
-                     and (c.tem("[data-card-financeiro-vazio]") or c.tem("[data-card-financeiro-linhas]")), 60)
+                     and (c.tem('[data-aba-acessos="pronto"]') or c.tem('[data-estado="erro"]')), 60)
 
 
 def caso_card(nav, a) -> None:
@@ -130,11 +131,11 @@ def caso_card(nav, a) -> None:
             on conflict (email) do update set erros = 9, bloqueado_de_vez_em = now(), bloqueado_ate = null""")
     B.q(f"update auth.users set raw_app_meta_data = raw_app_meta_data - 'senha_provisoria' where lower(email) = '{email_a}'")
     c = B.Caso(nav, a.base, a.prefixo, "card", desktop=True)
-    c.entrar("w8b-personal", f"/painel/alunos/{pid}", zerar=False)
+    c.entrar("w8b-personal", f"/painel/alunos/{pid}/acessos", zerar=False)
     c.fechar_avisos()
     ok = c.esperar(lambda: c.tem("[data-card-acesso-aluno][data-acesso-estado='bloqueado_de_vez']"), 60)
-    p.check(ok, "Resumo do aluno mostra o card Acesso do aluno (bloqueado de vez)")
-    esperar_resumo(c, "Rafael Moura")
+    p.check(ok, "a aba Acessos do aluno mostra o card Login do aluno (bloqueado de vez)")
+    esperar_acessos(c, "Rafael Moura")
     card = c.pg.locator("[data-card-acesso-aluno]")
     t = card.inner_text()
     p.check("BLOQUEADO" in t and email_a in t and "Bloqueado de vez por tentativas de senha" in t, "card: chip, e-mail do login e o aviso do bloqueio")
@@ -219,10 +220,10 @@ def caso_criar(nav, a) -> None:
         sp = B.service(B.PRINCIPAL_REF)
         B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{n['u']}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
     c = B.Caso(nav, a.base, a.prefixo, "criar", desktop=True)
-    c.entrar("w8b-personal", f"/painel/alunos/{n['id']}", zerar=False)
+    c.entrar("w8b-personal", f"/painel/alunos/{n['id']}/acessos", zerar=False)
     c.fechar_avisos()
     ok = c.esperar(lambda: c.tem("[data-card-acesso-aluno][data-acesso-estado='sem']"), 60)
-    esperar_resumo(c, B.NOME_NOVO)
+    esperar_acessos(c, B.NOME_NOVO)
     p.check(ok and "SEM ACESSO" in c.pg.locator("[data-card-acesso-aluno]").inner_text(), "aluno sem login: card SEM ACESSO com 'Criar acesso'")
     c.pg.locator("[data-card-acesso-aluno]").scroll_into_view_if_needed()
     c.print("card_sem_acesso")
@@ -241,11 +242,11 @@ def caso_criar(nav, a) -> None:
 
 def caso_celular(nav, a) -> None:
     c = B.Caso(nav, a.base, a.prefixo, "celular", desktop=False)
-    c.entrar("w8b-personal", f"/painel/alunos/{aluno_pid()}", zerar=False)
+    c.entrar("w8b-personal", f"/painel/alunos/{aluno_pid()}/acessos", zerar=False)
     c.fechar_avisos()
     ok = c.esperar(lambda: c.tem("[data-card-acesso-aluno]") and c.pg.locator("[data-card-acesso-aluno]").get_attribute("data-acesso-estado") != "carregando", 60)
-    esperar_resumo(c, "Rafael Moura")
-    p.check(ok, "o card aparece no painel em 390 px")
+    esperar_acessos(c, "Rafael Moura")
+    p.check(ok, "o card aparece no painel em 390 px (na aba Acessos, embaixo das linhas)")
     # o card inteiro entre a barra de cima e a de baixo (a barra flutuante cobre o fim da tela)
     c.pg.evaluate("() => { const el = document.querySelector('[data-card-acesso-aluno]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64); }")
     c.print("card_celular")
@@ -254,7 +255,7 @@ def caso_celular(nav, a) -> None:
 
 def caso_negativo(nav, a) -> None:
     c = B.Caso(nav, a.base, a.prefixo, "negativo", desktop=True)
-    c.entrar("w8b-outro", f"/painel/alunos/{aluno_pid()}", zerar=False)
+    c.entrar("w8b-outro", f"/painel/alunos/{aluno_pid()}/acessos", zerar=False)
     c.fechar_avisos()
     c.esperar(lambda: c.tem("[data-card-acesso-aluno]") or "não" in c.texto().lower(), 40)
     c.pg.wait_for_timeout(2000)
diff --git a/e2e/w14/prod.py b/e2e/w14/prod.py
index a1e5174..d8b3fbe 100644
--- a/e2e/w14/prod.py
+++ b/e2e/w14/prod.py
@@ -2,7 +2,8 @@
 """Physiq W14 — smoke de PRODUÇÃO (https://physiqcalc.com.br, schema public), SÓ LEITURA.
 
   painel   a conta de teste do Calc (admin.teste.claude, dona da "Admin Teste") abre o aluno dela: cabeçalho da tela 7
-           (Mensagem, Nova avaliação, ⋯, linha e chips) e os cards novos do Resumo — nada é clicado que grave
+           (Mensagem, Nova avaliação, ⋯, linha e chips) e os cards novos do Resumo — nada é clicado que grave; W-A P4: o card de login e o
+           "Acesso ao app" moram na aba Acessos (o Resumo fica com "Mensagens automáticas")
   app      o aluno de teste do Calc (teste@teste.com) abre o app normalmente: a P15 não fechou o acesso de quem tem login
   p        /p/abc abre o /d/ do site antigo (a página do diário) — F1
   versao   o site mostra a versão esperada (--versao, ex. 3.17)
@@ -56,16 +57,23 @@ def painel(nav) -> None:
         ok = c.esperar(lambda: c.tem("[data-cabecalho-w14] [data-cabecalho-nome]") and c.tem("[data-card-dados-aluno]"), 90)
         p.check(ok, "[painel] o perfil do aluno abre com o cabeçalho novo e o card Dados do aluno")
         p.check(c.tem("[data-acao-mensagem]") and c.tem("[data-menu-perfil]"), "[painel] Mensagem e ⋯ no topo (tela 7)")
-        p.check(all(c.tem(s) for s in ("[data-card-acesso-aluno]", "[data-card-ajustes-aluno]", "[data-card-resumo-privado]")),
-                "[painel] cards Acesso, Ajustes e Resumo privado")
+        p.check(all(c.tem(s) for s in ("[data-card-ajustes-aluno]", "[data-card-resumo-privado]")),
+                "[painel] cards Mensagens automáticas e Resumo privado")
+        p.check(not c.tem("[data-card-acesso-aluno]") and not c.tem('[data-ajuste="acesso_app"]'),
+                "[painel] W-A P4: o card de login e o \"Acesso ao app\" saíram do Resumo (moram na aba Acessos)")
         p.check(not c.tem("[data-fallback-aluno]"), "[painel] o \"Dados\" antigo saiu do Resumo")
-        ligado = c.pg.locator('[data-ajuste="acesso_app"]').get_attribute("data-ajuste-ligado") if c.tem('[data-ajuste="acesso_app"]') else None
-        p.check(ligado == "1", f"[painel] P15: o aluno com login está com o \"Acesso ao app\" LIGADO ({ligado})")
         c.pg.wait_for_timeout(1500)
         foto(c, "resumo_topo")
         c.pg.locator("[data-card-ajustes-aluno]").scroll_into_view_if_needed()
         c.pg.wait_for_timeout(700)
         foto(c, "resumo_cards")
+        # W-A P4: a aba Acessos (SÓ LEITURA: abrir só lê pela função acessos — `acao: "ler"`)
+        c.ir(f"/painel/alunos/{rota}/acessos")
+        ok = c.esperar(lambda: c.tem('[data-aba-acessos="pronto"]') and c.tem("[data-card-acesso-aluno]"), 90)
+        p.check(ok, "[painel] W-A P4: a aba Acessos abre com as linhas e o Login do aluno")
+        nivel = c.pg.locator('[data-acessos-linha="acesso_app"]').get_attribute("data-acessos-nivel") if c.tem('[data-acessos-linha="acesso_app"]') else None
+        p.check(nivel == "liberado", f"[painel] P15: o aluno com login está com o \"Acesso ao app\" LIBERADO na aba Acessos ({nivel})")
+        foto(c, "acessos")
     finally:
         c.fim()
 
diff --git a/e2e/w14/telas.py b/e2e/w14/telas.py
index 596babd..bea571a 100644
--- a/e2e/w14/telas.py
+++ b/e2e/w14/telas.py
@@ -2,15 +2,17 @@
 """Physiq W14 — E2E de telas do Perfil do aluno no painel (tela 7: cabeçalho e cards do Resumo) e das travas do app (F2).
 
 Casos (em série; /health do Treino antes de cada um):
-  resumo    o cabeçalho (Mensagem, Nova avaliação, ⋯, linha e chips) e os 6 cards novos; o "Dados" antigo saiu (herdado W6)
+  resumo    o cabeçalho (Mensagem, Nova avaliação, ⋯, linha e chips) e os 5 cards novos (W-A P4: o de login foi para a aba Acessos); o
+            "Dados" antigo saiu (herdado W6)
   editar    Editar dados (cadastro no principal) + erro de validação (negativo)
   pdf       ⋯ → Gerar PDF "Dados & Evolução" (quem veio do Nutri, pelas antropometrias)
-  acesso    ajuste "Acesso ao app" desligado → o app do aluno fecha com a mensagem própria; religado → abre
+  acesso    "Acesso ao app" Bloqueado na aba Acessos (W-A P4: com a confirmação do app) → o app do aluno fecha com a mensagem própria;
+            Liberado → abre
   diario    ajuste "Diário" desligado → a aba Dieta do app não oferece a foto (mensagem da spec 9); religado → oferece
   link      o card mostra /d/<código>; /p/<código> e /p/abc abrem o diário (F1 — R13)
   resumo_privado  salvar e voltar
   aviso     aviso único da P15 (Camila): o número = a lista; "Ligar para todos" liga exatamente os da lista
-  acoes     Acesso do aluno › Desativar / Reativar e ⋯ › Remover da lista (função alunos da W13) com a Diego (sem login)
+  acoes     Login do aluno (aba Acessos — W-A P4) › Desativar / Reativar e ⋯ › Remover da lista (função alunos da W13) com a Diego (sem login)
   negativo  P1: o 2º personal não abre o perfil do Rafael
 Prints: site 1280 × 883 × 2 (= 2560 × 1766, tela 7) e app 390 × 844 × 3,4 em ~/projetos/physiqcalc-scratch/prints/w14/.
 Uso: python3 e2e/w14/telas.py --base http://localhost:5173 --prefixo local [--casos resumo,acesso]
@@ -83,13 +85,17 @@ def config(pid: str) -> dict:
     return q(f"select config from {S}.pacientes where id = '{pid}'")[0]["config"] or {}
 
 
-def ajuste_ui(c, chave: str, ligar: bool) -> bool:
-    """Clica no interruptor do ajuste (se precisar) e espera a tela e o banco concordarem."""
-    sel = f'[data-ajuste="{chave}"]'
-    atual = attr(c, sel, "data-ajuste-ligado") == "1"
-    if atual != ligar:
-        c.pg.click(f'[data-ajuste-botao="{chave}"]')
-    return c.esperar(lambda: attr(c, sel, "data-ajuste-ligado") == ("1" if ligar else "0"), 20)
+def acesso_ui(c, liberar: bool) -> bool:
+    """W-A P4: a linha "Acesso ao app" da aba Acessos (rádios; bloquear pede a confirmação do app) — espera a tela concordar."""
+    sel = '[data-acessos-linha="acesso_app"]'
+    alvo = "liberado" if liberar else "bloqueado"
+    if attr(c, sel, "data-acessos-nivel") != alvo:
+        c.pg.click(f'[data-acessos-radio="acesso_app:{alvo}"]')
+        if not liberar:
+            c.confirmar_no_app()
+    livre = f'[data-acessos-radio="acesso_app:{alvo}"]'
+    # a gravação TERMINADA: o nível certo e os rádios ligados de novo (o otimista muda o nível antes do servidor)
+    return c.esperar(lambda: attr(c, sel, "data-acessos-nivel") == alvo and c.pg.locator(livre).first.is_enabled(), 20)
 
 
 # ───────────────────────── casos ─────────────────────────
@@ -98,9 +104,10 @@ def resumo(nav, base, pref):
     raf = rafael()
     c = caso(nav, base, pref, "resumo", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-cabecalho-w14] [data-cabecalho-nome]")
     try:
-        ok = c.esperar(lambda: all(c.tem(s) for s in ("[data-card-dados-aluno]", "[data-card-acesso-aluno]", "[data-card-ajustes-aluno]",
-                                                      "[data-card-link-diario]", "[data-card-resumo-privado]", "[data-card-fluxo-consulta]")), 60)
-        p.check(ok, "[resumo] os 6 cards da W14 no Resumo (dados, acesso, ajustes, link, resumo privado, fluxo de consulta)")
+        ok = c.esperar(lambda: all(c.tem(s) for s in ("[data-card-dados-aluno]", "[data-card-ajustes-aluno]", "[data-card-link-diario]",
+                                                      "[data-card-resumo-privado]", "[data-card-fluxo-consulta]")), 60)
+        p.check(ok, "[resumo] os 5 cards da W14 no Resumo (dados, mensagens automáticas, link, resumo privado, fluxo de consulta)")
+        p.check(not c.tem("[data-card-acesso-aluno]"), "[resumo] W-A P4: o card de login saiu do Resumo (mora na aba Acessos)")
         linha = texto(c, "[data-cabecalho-linha]")
         p.check(linha.startswith("28 anos · 1,78 m · objetivo: definição · aluno desde"), f"[cabeçalho] linha da tela 7: {linha!r}")
         chips = texto(c, "[data-cabecalho-chips]").upper()
@@ -180,11 +187,11 @@ def pdf(nav, base, pref):
 
 def acesso(nav, base, pref):
     raf = rafael()
-    c = caso(nav, base, pref, "acesso", "w13-dono", f"/painel/alunos/{raf['id']}", esperar='[data-ajuste="acesso_app"]')
+    c = caso(nav, base, pref, "acesso", "w13-dono", f"/painel/alunos/{raf['id']}/acessos", esperar='[data-acessos-linha="acesso_app"]')
     try:
-        ok = ajuste_ui(c, "acesso_app", False)
-        p.check(ok and config(raf["id"]).get("acesso_app") is False, "[acesso] o profissional desliga o \"Acesso ao app\" (gravou acesso_app=false)")
-        c.pg.locator("[data-card-ajustes-aluno]").scroll_into_view_if_needed()
+        ok = acesso_ui(c, False)
+        p.check(ok and config(raf["id"]).get("acesso_app") is False,
+                "[acesso] o profissional bloqueia o \"Acesso ao app\" na aba Acessos, com a confirmação (gravou acesso_app=false)")
         foto(c, "ajuste_acesso_desligado")
     finally:
         c.fim()
@@ -199,10 +206,10 @@ def acesso(nav, base, pref):
         foto(a, "app_acesso_desligado")
     finally:
         a.ctx.close()
-    c2 = caso(nav, base, pref, "acesso_religar", "w13-dono", f"/painel/alunos/{raf['id']}", esperar='[data-ajuste="acesso_app"]')
+    c2 = caso(nav, base, pref, "acesso_religar", "w13-dono", f"/painel/alunos/{raf['id']}/acessos", esperar='[data-acessos-linha="acesso_app"]')
     try:
-        ok = ajuste_ui(c2, "acesso_app", True)
-        p.check(ok and config(raf["id"]).get("acesso_app") is True, "[acesso] religado")
+        ok = acesso_ui(c2, True)
+        p.check(ok and config(raf["id"]).get("acesso_app") is True, "[acesso] liberado de novo (sem confirmação)")
     finally:
         c2.fim()
     B.saude_ok("app com o acesso religado")
@@ -320,7 +327,7 @@ def acoes(nav, base, pref):
     assert diego, "Diego"
     did = diego["id"]
     q(f"update {S}.pacientes set ativo = true, deleted_at = null where id = '{did}'")
-    c = caso(nav, base, pref, "acoes", "w13-dono", f"/painel/alunos/{did}", esperar='[data-acesso-acao="desativar"]')
+    c = caso(nav, base, pref, "acoes", "w13-dono", f"/painel/alunos/{did}/acessos", esperar='[data-acesso-acao="desativar"]')
     try:
         c.pg.locator("[data-card-acesso-aluno]").scroll_into_view_if_needed()
         foto(c, "acesso_sem_login")
diff --git a/e2e/w15/telas.py b/e2e/w15/telas.py
index 06d3172..4ac3e9f 100644
--- a/e2e/w15/telas.py
+++ b/e2e/w15/telas.py
@@ -4,7 +4,8 @@
 Positivo (Lucas, dono + personal do Rafael): o editor abre com A/B/C, "+" e Modelos; o professor digita a prescrição dos 5
 exercícios do treino A (séries × repetições · descanso · carga — NF1) e a observação (NF2) e o banco do schema do teste guarda
 exatamente nas colunas que o app lê; arrasta, adiciona da biblioteca e tira exercício (direto no treino só do Rafael); no
-treino compartilhado a lista vira cópia só do Rafael; Modelos dá e tira treino; "+" cria treino; cadeado, descanso padrão,
+treino compartilhado a lista vira cópia só do Rafael; Modelos dá e tira treino; "+" cria treino; descanso padrão (W-A P4: o cadeado
+das séries saiu do editor — vai para a aba Acessos, e2e/wa/telas_acessos.py),
 semana (dias, alternado), padrão N (a prescrição fica), troca do treino (NF7), volume, histórico, relatório (PDF e Excel) e PDF
 do treino baixam. O card Treino do Resumo mostra o MESMO "N de M na semana" do app e as MESMAS séries por grupo da aba.
 Negativo: o Bruno (2º personal, não é o responsável) não abre o Rafael; a Camila (nutricionista) vê a aba como "do módulo
@@ -133,7 +134,7 @@ def caso_editor(nav, base: str, prefixo: str, m: dict, rota: str) -> None:
         p.check(rot == ["A · Peito e tríceps", "B · Costas", "C · Pernas"], f"abas A/B/C na ordem da semana ({rot})")
         p.check(c.tem("[data-treino-novo]") and c.tem("[data-treino-modelos]"), "'+' e Modelos no cabeçalho")
         p.check(c.pg.locator("[data-chip-exercicios]").inner_text().strip() == "5 EXERCÍCIOS", "chip 5 EXERCÍCIOS")
-        p.check(c.pg.locator("[data-chip-cadeado]").get_attribute("data-chip-cadeado") == "travado", "chip ALUNO NÃO MUDA AS SÉRIES")
+        p.check(c.pg.locator("[data-chip-cadeado]").count() == 0, "W-A P4: o cadeado das séries não está mais no editor (mora na aba Acessos)")
         p.check("DESCANSO PADRÃO 60 S" in c.pg.locator("[data-chip-descanso]").inner_text(), "chip DESCANSO PADRÃO 60 S")
         p.check("TREINO ALTERNADO: NÃO" in c.pg.locator("[data-chip-alternado]").inner_text(), "chip TREINO ALTERNADO: NÃO")
         p.check(c.pg.locator("[data-treino-adicionar]").inner_text().strip() == "Adicionar exercício da biblioteca (81 com GIF)", "botão da biblioteca (81 com GIF)")
@@ -223,12 +224,8 @@ def caso_editor(nav, base: str, prefixo: str, m: dict, rota: str) -> None:
                 "a aba segue 'B · Costas', agora com o exercício novo")
         abrir_aba(c, "A · Peito e tríceps")
 
-        # ── cadeado e descanso padrão ──
-        B.saude_ok("cadeado/descanso/modelos")
-        c.pg.locator("[data-chip-cadeado]").click()
-        p.check(bool(B.esperar(lambda: config(rafael)["series_travadas"] is False, 20, 1.5)), "cadeado: o aluno pode mudar as séries (banco)")
-        c.pg.locator("[data-chip-cadeado]").click()
-        p.check(bool(B.esperar(lambda: config(rafael)["series_travadas"] is True, 20, 1.5)), "cadeado de volta: ALUNO NÃO MUDA AS SÉRIES (banco)")
+        # ── descanso padrão (W-A P4: o cadeado das séries foi para a aba Acessos — e2e/wa/telas_acessos.py) ──
+        B.saude_ok("descanso/modelos")
         c.pg.locator("[data-chip-descanso]").click()
         c.esperar(lambda: c.tem("[data-folha-descanso]"), 10)
         c.pg.locator('[data-descanso-atalho="90"]').click()
```

- [ ] **Step 2: Commit** — `test(w-a): os E2E da W8b, W14 e W15 procuram o card de login, o Acesso ao app e o cadeado no lugar novo` com os 4 arquivos;
  `feita.sh 7 "E2E antigos compilam" "compila ok"`.

---

### Task 8: O E2E novo — `e2e/wa/telas_acessos.py` (`--seco`, compila) + as guardas

**Files:** Create `e2e/wa/telas_acessos.py`.
**Estimativa:** 15 min (calibrado 3–5).

- [ ] **Step 1: O arquivo e as provas sem rede**

Run: `cd ~/projetos/physiqcalc-wa-p4 && bash ~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh e2e/wa/telas_acessos.py && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/telas_acessos.py --seco && python3 -c "compile(open('e2e/wa/telas_acessos.py').read(), 'telas_acessos.py', 'exec'); print('compila ok')"`
Expected: `44/44 seletores e textos do E2E no código (e o que saiu, fora)` e `compila ok`.

`e2e/wa/telas_acessos.py`:
```python
#!/usr/bin/env python3
"""Physiq W-A P4 — E2E de TELA da aba Acessos do Painel › Aluno (Edge; computador 1280 × 883 e celular 390 × 844). Spec W-A §4.1, §4.2, §4.7,
§6 "P4", §7. Contas de TESTE (hml-17): w5p-personal (dono + personal da conta A da w5p-aluna), w5p-nutri (a nutricionista dela na conta A),
w27-master (master SÓ no staging.profiles durante a rodada — o molde do api.py), w13-dono (a conta B: a 2ª matrícula da aluna, pela Massa) e o
"dono sem papel" (o w5p-personal só com o papel 'dono', pela Massa, com a volta guardada). Casos (na ordem; cada um depende do anterior):
  A0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  C1  a_acessos_personal   o personal abre a aba: a "Acessos" é a última da barra; as 6 linhas na ordem com os níveis do banco; o Login do
                           aluno à direita; o resumo do rodapé; ao abrir, 0 gravação (só `acao: "ler"` na acessos e na treino-acessos)
  C2  muda o envio pelo link e o diário (Bloqueado → no banco; o "Mudado por" e o histórico com quem mudou; o aviso "Vale quando o diário
      estiver liberado" no link) e volta os 2
  C3  a_confirmar_bloqueio "App: Bloqueado" pede a confirmação do app: Cancelar não grava; "Bloquear" grava; Liberado de novo (sem confirmação)
  C4  a_acessos_nutri      a nutri (sem sessão no Treino) trava/destrava as séries pela treino-acessos: no Banco do Treino o series_travadas (o
                           que o app lê pelo PowerSync — a tela do aluno é provada no Vitest: o build de staging não tem PowerSync) e o
                           histórico no principal; a Dieta "Pode mexer" → o nível e 1 aviso no sino da aluna; volta a "Só ver"; as séries voltam
  C5  o dono SEM papel de personal muda as séries e volta (os papéis voltam logo depois)
  C6  o master abre a aba (pode mudar) — só lê
  C7  a_acessos_sem_login  a matrícula "sem login" (Massa): o App desligado com "Ele ainda não tem login…"; as séries "Vale depois do 1º acesso…";
                           o Login do aluno com "SEM ACESSO" e "Criar acesso"
  C8  a_acessos_outra_conta o w13-dono na 2ª matrícula da aluna (conta B): a linha das séries = "Treino de outro personal…" (sem os níveis)
  C9  a_acessos_celular    390 px: a aba ativa rola para a vista na barra; nada passa da largura da tela
  C10 a_resumo_depois      o Resumo sem o card de login; "Mensagens automáticas" só com o WhatsApp; o ⋯ › Acesso do aluno abre a aba Acessos
  C11 a_editor_sem_cadeado o editor do Treino sem o chip "ALUNO NÃO MUDA AS SÉRIES"
  --loja: A0 + C1, C4, C5 e C6 SÓ LEITURA + C9 + C3 só até o Cancelar (o print com o prefixo loja_).
A rodada vai para o estado (~/projetos/physiqcalc-scratch/w-a/p4-estado.json) ANTES de qualquer escrita: a foto da matrícula A (o config, os acessos,
o series_travadas do Treino) e o papel do w27-master; no fim (e no --limpar) tudo volta à foto, o histórico e os avisos da rodada saem e a Massa
(a 2ª matrícula, a "sem login", os papéis) é desfeita — as sobras = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging (https://physiqcalc-staging.vercel.app)
· prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador — nenhuma gravação sai —, a conta de teste "master" do Calc
(admin.teste.claude) no aluno da conta "Admin Teste": P1 a aba Acessos abre só com leituras, P2 o Resumo sem o card de login, P3 nenhuma
gravação tentada; prints prod_a_acessos, prod_a_resumo; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p4/<base>[-loja]/<caso>_<largura>.png.
Saída: ~/projetos/physiqcalc-scratch/w-a/p4/telas_acessos_<base>.txt (só contagens, níveis, status e códigos). Logout local das sessões do teste.
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código (e o que saiu, saiu).
Uso: python3 e2e/wa/telas_acessos.py --base local|staging|prod [--loja] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
S = "staging"
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
ESTADO = B.SCRATCH / "w-a" / "p4-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p4"
TITULO_DIETA = "Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia"
LINHAS = ["acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas"]
MUDADO = re.compile(r"^Mudado por \S+ em \d{2}/\d{2} \d{2}:\d{2}$")

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/painel/aluno/acessos/LinhaDeAcesso.tsx": ["data-acessos-linha={def.chave}", 'data-acessos-nivel={valor ?? ""}', "data-acessos-estado={estado}",
                                                   "data-acessos-radio={`${def.chave}:${n.valor}`}", "data-acessos-mudanca", "data-acessos-aviso",
                                                   "data-acessos-sem", "data-acessos-fixo", 'role="radiogroup"'],
    "src/painel/aluno/acessos/ListaDeAcessos.tsx": ['data-aba-acessos="pronto"', 'data-acessos-pode-mudar={d.pode_mudar ? "1" : "0"}', "data-acessos-resumo",
                                                    "data-acessos-series-tentar", 'rotuloConfirmar: "Bloquear"'],
    "src/painel/aluno/acessos/regras.ts": ['"Ele ainda não tem login: crie o acesso em Login do aluno."', '"Vale depois do 1º acesso do aluno ao app."',
                                           '"Treino de outro personal: ', '"Vale quando o diário estiver liberado."', '"Este aluno não tem dieta"', 'salvo: "Salvo"'],
    "src/painel/aluno/abas/Acessos.tsx": ["data-aba-acessos-aluno", "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"],
    "src/painel/aluno/catalogoAbas.ts": ['{ id: "acessos", arquivo: "Acessos", rotulo: "Acessos"', '"CardRotinas",'],
    "src/painel/aluno/AlunoLayout.tsx": ["rolagemParaMostrar", "data-aba-aluno={a.id}", "data-abas-aluno"],
    "src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx": ["data-card-acesso-aluno", "Login do aluno", "data-acesso-criar", "data-acesso-estado"],
    "src/painel/aluno/resumo/CardAjustesAluno.tsx": ['titulo="Mensagens automáticas"', "data-card-ajustes-aluno", "data-ajuste={a.chave}"],
    "src/painel/aluno/Cabecalho.tsx": ["navigate(`${base}/acessos`)", 'marca="acesso"'],
    "src/ui/premium/Confirmar.tsx": ["data-confirmar-ok", "data-confirmar-cancelar"],
}
# o que SAIU com a P4 (tem de estar fora)
FORA_DO_CODIGO = {
    "src/treino/editor/EditorTreino.tsx": ["data-chip-cadeado", "ALUNO NÃO MUDA AS SÉRIES"],
    "src/painel/aluno/catalogoAbas.ts": ['"CardAcessoAluno"'],
    "src/painel/aluno/resumo/CardAjustesAluno.tsx": ['titulo="Ajustes do aluno"', "acesso_app"],
}
ARQUIVOS_QUE_SAIRAM = ["src/painel/aluno/resumo/CardAcessoAluno.tsx"]
# na produção (a Guarda), as gravações que já existem ao abrir e não são da W-A: o aluno_acesso do card de login (lê e garante — H-43) e o
# garantir da nutricao (o 1º acesso) — o molde de e2e/hml20/dieta_tela.py
BARRADAS_ACEITAS = {"POST rpc:aluno_acesso", "POST fn:nutricao"}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p4") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.prefixo_print = ""

    def tela(self, nav, nome: str, desktop: bool = True) -> B.Tela:
        return B.Tela(nav, self.base, "p4", nome, desktop=desktop)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, caso)
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a massa e a limpeza) ─────────────────────────
def foto() -> dict:
    """SÓ LEITURA: os ids da massa de TESTE e o 'antes' do que a rodada muda (o config e os acessos da A; o series_travadas do Treino)."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id, p.conta_id, p.config from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                    and p.personal_id = {u('w5p-personal')}
                  order by p.created_at limit 1)
      select (select id::text from a) as pac_a, (select conta_id::text from a) as conta_a, (select config from a) as config_a,
             {u('w5p-aluna')}::text as aluna, {u('w5p-nutri')}::text as nutri, {u('w5p-personal')}::text as personal,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select {S}.ajustes_do_aluno(p.config, p.user_id is not null) from {S}.pacientes p, a where p.id = a.id) as ajustes_a""")[0]
    t = B.C.ler(B.TREINO_REF, f"""select i.treino_user_id::text as treino_user_id, pf.series_travadas from {S}.physiq_identidades i
                                   join {S}.physiq_profiles pf on pf.id = i.treino_user_id where i.principal_user_id = {B.txt(r['aluna'])}""")
    if not (r["pac_a"] and r["conta_a"] and t):
        raise SystemExit("massa de TESTE incompleta no staging (a matrícula A da w5p-aluna com o w5p-personal e a w5p-nutri, e o Treino dela) — nada foi gravado")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    return {**r, "treino_user_id": t[0]["treino_user_id"], "series_antes": bool(t[0]["series_travadas"])}


def master_do_staging() -> dict:
    r = B.ler(f"""select p.id::text as uid, p.role from {S}.profiles p
                   where p.id = (select id from auth.users where lower(email) = {B.txt(B.CONTAS['w27-master'])})""")
    if not r:
        raise SystemExit("o w27-master sem profile no staging — nada foi gravado")
    return r[0]


def ajustes(e: dict) -> dict:
    return B.ler(f"select {S}.ajustes_do_aluno(p.config, p.user_id is not null) as aj from {S}.pacientes p where p.id = {B.txt(e['pac_a'])}")[0]["aj"] or {}


def dieta(e: dict) -> str:
    r = B.ler(f"select nivel from {S}.aluno_acessos where paciente_id = {B.txt(e['pac_a'])} and chave = 'dieta'")
    return r[0]["nivel"] if r else "ver"


def series(e: dict) -> bool | None:
    r = B.C.ler(B.TREINO_REF, f"select series_travadas from {S}.physiq_profiles where id = {B.txt(e['treino_user_id'])}")
    return r[0]["series_travadas"] if r else None


def ultimo_log(e: dict, chave: str) -> dict:
    """A última linha do histórico da chave desde o começo da rodada (para/por) e quantas houve."""
    r = B.ler(f"""select count(*) over () as n, l.para, l.por::text as por from {S}.aluno_acessos_log l
                   where l.paciente_id = {B.txt(e['pac_a'])} and l.chave = {B.txt(chave)} and l.em >= {B.txt(e['inicio'])}
                   order by l.em desc, l.id desc limit 1""")
    return r[0] if r else {"n": 0, "para": None, "por": None}


def avisos_dieta(e: dict) -> int:
    return int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                           and titulo = {B.txt(TITULO_DIETA)} and criado_em >= {B.txt(e['inicio'])}""")[0]["n"])


def massa_sem_login(R: Rodada) -> str:
    """A matrícula 'sem login' (personal + nutri, na conta A) pela Massa do _base.py: o id vai ao estado ANTES do insert."""
    m = B.Massa()
    novo = str(uuid.uuid4())
    m.estado["matriculas"].append(novo)
    m._guardar()  # noqa: SLF001 — o mesmo estado do --limpar do _base.py
    B.escrever(f"""insert into {S}.pacientes (id, conta_id, personal_id, nutricionista_id, nome, config)
                   values ({B.txt(novo)}, {B.txt(R.e['conta_a'])}, {B.txt(R.e['personal'])}, {B.txt(R.e['nutri'])},
                           {B.txt(R.e['marca'] + ' sem login')}, '{{"wa_e2e": true}}'::jsonb)""")
    return novo


def devolver_papeis() -> None:
    """Os papéis que a Massa trocou voltam JÁ (o resto da Massa — as matrículas — fica para o fim)."""
    m = B.Massa()
    for x in m.estado["papeis"]:
        lista = "array[" + ", ".join(B.txt(p) for p in x["antes"]) + "]::text[]"
        B.escrever(f"update {S}.conta_membros set papeis = {lista} where id = {B.txt(x['id'])}")
    m.estado["papeis"] = []
    m._guardar()  # noqa: SLF001


def _config_sql(cfg: object) -> str:
    return "null" if cfg is None else f"{B.txt(json.dumps(cfg))}::jsonb"


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    r = B.ler(f"""select (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {B.txt(e['inicio'])}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                            and titulo = {B.txt(TITULO_DIETA)} and criado_em >= {B.txt(e['inicio'])}) as avisos,
                         ((select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel) order by x.chave), '[]'::jsonb)
                             from {S}.aluno_acessos x where x.paciente_id = {B.txt(e['pac_a'])})
                           is distinct from {B.txt(json.dumps([{'chave': y['chave'], 'nivel': y['nivel']} for y in e.get('acessos_a') or []]))}::jsonb)::int
                           as acessos_diferentes,
                         ((select config from {S}.pacientes where id = {B.txt(e['pac_a'])}) is distinct from {_config_sql(e.get('config_a'))})::int
                           as config_diferente""")[0]
    t = B.C.ler(B.TREINO_REF, f"""select (series_travadas is distinct from {'true' if e.get('series_antes') else 'false'})::int as series_diferente
                                   from {S}.physiq_profiles where id = {B.txt(e.get('treino_user_id'))}""")
    mestre = 0
    if e.get("master_uid"):
        mestre = int(B.ler(f"""select ((select role from {S}.profiles where id = {B.txt(e['master_uid'])})
                                       is distinct from {B.txt(e.get('master_papel'))})::int as d""")[0]["d"])
    return {**{k: int(v) for k, v in r.items()}, "series_diferente": int(t[0]["series_diferente"]) if t else 0, "master_diferente": mestre}


def limpar(e: dict | None = None) -> dict:
    """Desfaz a rodada pelo estado (o config, os acessos e o histórico da A, os avisos, o series_travadas do Treino, o papel do master) e a
    Massa do _base.py (a 2ª matrícula, a 'sem login', os papéis); devolve as sobras (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8") or "{}") if ESTADO.exists() else {})
    sobras: dict = {}
    if e.get("pac_a"):
        pa, ini = B.txt(e["pac_a"]), B.txt(e["inicio"])
        comandos = [
            f"update {S}.pacientes set config = {_config_sql(e.get('config_a'))} where id = {pa}",
            f"delete from {S}.aluno_acessos where paciente_id = {pa}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({pa}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []],
            f"delete from {S}.aluno_acessos_log where paciente_id = {pa} and em >= {ini}",
            f"""delete from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral' and criado_em >= {ini}
                 and titulo = {B.txt(TITULO_DIETA)}""",
        ]
        if e.get("master_uid") and e.get("master_papel") != "master":
            comandos.append(f"update {S}.profiles set role = {B.txt(e['master_papel'])} where id = {B.txt(e['master_uid'])} and role = 'master'")
        for c in comandos:
            B.escrever(c)
        if e.get("treino_user_id") and isinstance(e.get("series_antes"), bool):
            B.C.C2.sql_mgmt(B.TREINO_REF, f"update {S}.physiq_profiles set series_travadas = {'true' if e['series_antes'] else 'false'} "
                                          f"where id = {B.txt(e['treino_user_id'])}")
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text("{}", encoding="utf-8")
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas às 2 funções da aba que NÃO são leitura (a Guarda: leitura = { acao: "ler" })."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos
            if p["tipo"] == "fn" and p["nome"] in ("acessos", "treino-acessos") and p["acao"] != "ler"]


def leituras(t: B.Tela, funcao: str) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == funcao and p["acao"] == "ler")


def nivel(t: B.Tela, chave: str) -> str:
    return (t.attr(f'[data-acessos-linha="{chave}"]', "data-acessos-nivel") or [""])[0]


def estado_series(t: B.Tela) -> str:
    return (t.attr('[data-acessos-linha="treino_series"]', "data-acessos-estado") or [""])[0]


def esperar_aba(t: B.Tela, series_pronta: bool = True, timeout: float = 60) -> bool:
    """A aba carregada (as linhas) e — quando o aluno tem Treino — a linha das séries fora do esqueleto."""
    ok = t.esperar(lambda: t.tem('[data-aba-acessos="pronto"]'), timeout)
    if ok and series_pronta and t.n('[data-acessos-linha="treino_series"]'):
        ok = t.esperar(lambda: estado_series(t) not in ("", "carregando"), 45)
    return ok


def livre(t: B.Tela, chave: str, valor: str) -> bool:
    """O rádio está ligado de novo (enquanto uma gravação corre, a lista desliga todos — decisão 2 do plano)."""
    return bool(t.pg.evaluate("(s) => { const r = document.querySelector(s); return !!r && !r.disabled; }",
                              f'[data-acessos-radio="{chave}:{valor}"]'))


def escolher(t: B.Tela, chave: str, valor: str, confirmar: bool = False) -> bool:
    """Toca no nível (o rádio) e espera a tela concordar com a gravação TERMINADA (o nível certo e os rádios ligados de novo — o otimista
    sozinho muda o nível antes do servidor; se ele recusar, o nível volta); o bloqueio do app pede a confirmação do app."""
    if nivel(t, chave) == valor:
        return True
    t.clicar(f'[data-acessos-radio="{chave}:{valor}"]')
    if confirmar and not t.caso.confirmar_no_app():
        return False
    return t.esperar(lambda: nivel(t, chave) == valor and livre(t, chave, valor), 30)


def rodar_caso(R: Rodada, fn, *args) -> None:
    try:
        fn(*args)
    except Exception as ex:  # noqa: BLE001
        R.o.ok(False, f"{fn.__name__}: {type(ex).__name__}: {str(ex)[:300]}")
        caso = B5.ESTADO.get("caso")
        if caso:
            caso.diagnostico()


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build", False)
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "A0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"A0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def caso_personal(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """C1 (+ C2 e C3 no site): a aba do personal."""
    e = R.e
    t = R.tela(nav, "personal")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        abas = t.attr("[data-aba-aluno]", "data-aba-aluno")
        atual = t.attr('[data-aba-aluno][aria-current="page"]', "data-aba-aluno")
        o.ok(ok and abas[-1:] == ["acessos"] and atual == ["acessos"], f"C1 a aba Acessos é a última da barra e a atual ({abas})")
        linhas = t.attr("[data-acessos-linha]", "data-acessos-linha")
        aj = ajustes(e)
        esperado = {"acesso_app": "liberado" if aj.get("acesso_app") else "bloqueado", "diario_alimentar": "liberado" if aj.get("diario_alimentar") else "bloqueado",
                    "acesso_link": "liberado" if aj.get("acesso_link") else "bloqueado", "dieta": dieta(e), "treino_series": "ver" if e["series_antes"] else "mexer",
                    "rotinas": "sempre"}
        na_tela = {k: nivel(t, k) for k in LINHAS}
        o.ok(linhas == LINHAS and na_tela == esperado, f"C1 as 6 linhas na ordem com os níveis do banco: {na_tela}")
        o.ok(t.tem("[data-card-acesso-aluno]") and "Login do aluno" in t.texto("[data-card-acesso-aluno]"), "C1 o Login do aluno à direita (o card de antes)")
        resumo = t.texto("[data-acessos-resumo]")
        o.ok(resumo.endswith("rotinas sempre") and "séries:" in resumo and "dieta:" in resumo, f"C1 o resumo do rodapé: {resumo!r}")
        t.pg.wait_for_timeout(1500)
        o.ok(not gravacoes_ao_abrir(t) and leituras(t, "acessos") >= 1 and leituras(t, "treino-acessos") >= 1,
             f"C1 ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'}); `ler` na acessos {leituras(t, 'acessos')} e na treino-acessos {leituras(t, 'treino-acessos')}")
        R.print(t, f"{R.prefixo_print}a_acessos_personal")
        if so_ler:
            return
        # C2 — o envio pelo link e o diário
        ok = escolher(t, "acesso_link", "bloqueado")
        salvo = t.pg.locator("[data-sonner-toast]", has_text="Salvo").count() > 0
        ok = ok and t.esperar(lambda: ajustes(e).get("acesso_link") is False, 20, 1.5)
        mud = t.texto('[data-acessos-linha="acesso_link"] [data-acessos-mudanca]')
        lg = ultimo_log(e, "acesso_link")
        o.ok(ok and salvo and bool(MUDADO.match(mud)) and lg["para"] == "bloqueado" and lg["por"] == e["personal"],
             f"C2 o link → Bloqueado: 'Salvo' ({salvo}), no banco, o 'Mudado por' ({mud!r}) e o histórico com quem mudou ({lg['para']}, pelo personal: {lg['por'] == e['personal']})")
        ok = escolher(t, "diario_alimentar", "bloqueado") and t.esperar(lambda: ajustes(e).get("diario_alimentar") is False, 20, 1.5)
        aviso = t.texto('[data-acessos-linha="acesso_link"] [data-acessos-aviso]')
        o.ok(ok and aviso == "Vale quando o diário estiver liberado.", f"C2 o diário → Bloqueado e o aviso no link: {aviso!r}")
        ok = escolher(t, "diario_alimentar", "liberado") and escolher(t, "acesso_link", "liberado")
        ok = ok and t.esperar(lambda: ajustes(e).get("diario_alimentar") is True and ajustes(e).get("acesso_link") is True, 20, 1.5)
        o.ok(ok, "C2 os 2 de volta a Liberado (no banco)")
        # C3 — o bloqueio do app pede a confirmação do app
        if nivel(t, "acesso_app") != "liberado":
            escolher(t, "acesso_app", "liberado")
        t.clicar('[data-acessos-radio="acesso_app:bloqueado"]')
        dialogo = t.esperar(lambda: t.tem("[role=alertdialog][data-state=open]"), 10)
        texto = t.texto("[role=alertdialog]")
        o.ok(dialogo and "Bloquear o app de" in texto and "Seu acesso ao app está desligado" in texto, f"C3 'Bloqueado' pede a confirmação do app ({texto[:60]!r})")
        R.print(t, f"{R.prefixo_print}a_confirmar_bloqueio")
        t.clicar("[role=alertdialog] [data-confirmar-cancelar]")
        t.esperar(lambda: not t.tem("[role=alertdialog]"), 10)
        t.pg.wait_for_timeout(1500)
        o.ok(nivel(t, "acesso_app") == "liberado" and ajustes(e).get("acesso_app") is True, "C3 Cancelar: nada mudou (tela e banco)")
        ok = escolher(t, "acesso_app", "bloqueado", confirmar=True) and t.esperar(lambda: ajustes(e).get("acesso_app") is False, 20, 1.5)
        o.ok(ok, "C3 'Bloquear' na confirmação: o app bloqueado (no banco)")
        ok = escolher(t, "acesso_app", "liberado") and t.esperar(lambda: ajustes(e).get("acesso_app") is True, 20, 1.5)
        o.ok(ok and not t.tem("[role=alertdialog]"), "C3 Liberado de novo, sem confirmação (no banco)")
    finally:
        t.fim()


def caso_confirmar_e_cancelar(o, nav, R: Rodada) -> None:
    """--loja: o bloqueio do app pede a confirmação; Cancelar não grava (nada mais)."""
    e = R.e
    t = R.tela(nav, "confirmar")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        esperar_aba(t)
        if nivel(t, "acesso_app") != "liberado":
            o.ok(False, "C3 (loja) o App não está liberado na foto — não mexo")
            return
        t.clicar('[data-acessos-radio="acesso_app:bloqueado"]')
        ok = t.esperar(lambda: t.tem("[role=alertdialog][data-state=open]"), 10)
        R.print(t, f"{R.prefixo_print}a_confirmar_bloqueio")
        t.clicar("[role=alertdialog] [data-confirmar-cancelar]")
        t.esperar(lambda: not t.tem("[role=alertdialog]"), 10)
        t.pg.wait_for_timeout(1500)
        o.ok(ok and nivel(t, "acesso_app") == "liberado" and ajustes(e).get("acesso_app") is True, "C3 (loja) a confirmação abre; Cancelar não grava")
    finally:
        t.fim()


def caso_nutri(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """C4: a nutri (sem sessão no Treino) — as séries pela treino-acessos e a Dieta."""
    e = R.e
    t = R.tela(nav, "nutri")
    try:
        t.entrar(R.L, "w5p-nutri", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        pode = (t.attr("[data-aba-acessos]", "data-acessos-pode-mudar") or [""])[0]
        o.ok(ok and pode == "1" and estado_series(t) == "pronto", f"C4 a nutri abre a aba (pode mudar: {pode}; as séries: {estado_series(t)})")
        if so_ler:
            R.print(t, f"{R.prefixo_print}a_acessos_nutri")
            return
        antes = "ver" if e["series_antes"] else "mexer"
        outro = "mexer" if antes == "ver" else "ver"
        ok = escolher(t, "treino_series", outro) and t.esperar(lambda: series(e) is (outro == "ver"), 30, 2)
        lg = ultimo_log(e, "treino_series")
        t.esperar(lambda: bool(MUDADO.match(t.texto('[data-acessos-linha="treino_series"] [data-acessos-mudanca]'))), 20)
        mud = t.texto('[data-acessos-linha="treino_series"] [data-acessos-mudanca]')
        o.ok(ok and lg["para"] == outro and lg["por"] == e["nutri"] and bool(MUDADO.match(mud)),
             f"C4 a nutri muda as séries → '{outro}': no Treino series_travadas = {series(e)} (o que o app lê); o histórico pela nutri; {mud!r}")
        R.print(t, f"{R.prefixo_print}a_acessos_nutri")
        ok = escolher(t, "dieta", "mexer") and t.esperar(lambda: dieta(e) == "mexer", 20, 1.5)
        o.ok(ok and avisos_dieta(e) == 1, f"C4 a Dieta → 'Pode mexer' (no banco) e 1 aviso no sino da aluna ({avisos_dieta(e)})")
        ok = escolher(t, "dieta", "ver") and t.esperar(lambda: dieta(e) == "ver", 20, 1.5)
        o.ok(ok, "C4 a Dieta de volta a 'Só ver'")
        ok = escolher(t, "treino_series", antes) and t.esperar(lambda: series(e) is e["series_antes"], 30, 2)
        o.ok(ok, f"C4 as séries de volta à foto ('{antes}')")
    finally:
        t.fim()


def caso_dono_sem_papel(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """C5: o w5p-personal SÓ com o papel 'dono' (a Massa troca e devolve) muda as séries — pela admin-semana-treinos ele só lia."""
    e = R.e
    B.Massa().trocar_papeis("w5p-personal", "w5p-personal", ["dono"])
    t = R.tela(nav, "dono-sem-papel")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        pode = (t.attr("[data-aba-acessos]", "data-acessos-pode-mudar") or [""])[0]
        desligado = t.pg.evaluate("() => [...document.querySelectorAll('[data-acessos-radio^=\"treino_series:\"]')].some((r) => r.disabled)")
        o.ok(ok and pode == "1" and estado_series(t) == "pronto" and not desligado, f"C5 o dono sem papel abre a aba (pode mudar: {pode}; séries {estado_series(t)})")
        if so_ler:
            return
        antes = "ver" if e["series_antes"] else "mexer"
        outro = "mexer" if antes == "ver" else "ver"
        ok = escolher(t, "treino_series", outro) and t.esperar(lambda: series(e) is (outro == "ver"), 30, 2)
        ok2 = escolher(t, "treino_series", antes) and t.esperar(lambda: series(e) is e["series_antes"], 30, 2)
        o.ok(ok and ok2 and ultimo_log(e, "treino_series")["por"] == e["personal"], "C5 o dono sem papel muda as séries e volta (o histórico pelo dono)")
    finally:
        t.fim()
        devolver_papeis()


def caso_master(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "master")
    try:
        t.entrar(R.L, "w27-master", f"/painel/alunos/{e['pac_a']}/acessos")
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        pode = (t.attr("[data-aba-acessos]", "data-acessos-pode-mudar") or [""])[0]
        o.ok(ok and pode == "1" and t.attr("[data-acessos-linha]", "data-acessos-linha") == LINHAS,
             f"C6 o master abre a aba com as 6 linhas (pode mudar: {pode}) — só lê")
    finally:
        t.fim()


def caso_sem_login(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "sem-login")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['sem_login']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        app_desligado = t.pg.evaluate("() => [...document.querySelectorAll('[data-acessos-radio^=\"acesso_app:\"]')].every((r) => r.disabled)")
        aviso = t.texto('[data-acessos-linha="acesso_app"] [data-acessos-aviso]')
        o.ok(ok and app_desligado and aviso == "Ele ainda não tem login: crie o acesso em Login do aluno.",
             f"C7 sem login: o App desligado com o aviso ({aviso!r})")
        o.ok(estado_series(t) == "antes_do_acesso" and "Vale depois do 1º acesso do aluno ao app." in t.texto('[data-acessos-linha="treino_series"]'),
             f"C7 as séries: 'Vale depois do 1º acesso…' ({estado_series(t)})")
        ok = t.esperar(lambda: (t.attr("[data-card-acesso-aluno]", "data-acesso-estado") or [""])[0] == "sem", 30)
        o.ok(ok and "SEM ACESSO" in t.texto("[data-card-acesso-aluno]") and t.tem("[data-acesso-criar]"), "C7 o Login do aluno: SEM ACESSO e 'Criar acesso'")
        R.print(t, f"{R.prefixo_print}a_acessos_sem_login")
    finally:
        t.fim()


def caso_outra_conta(o, nav, R: Rodada) -> None:
    e = R.e
    b = B.Massa().segunda_matricula()
    t = R.tela(nav, "outra-conta")
    try:
        t.entrar(R.L, "w13-dono", f"/painel/alunos/{b}/acessos", conta_ativa=B.Massa().conta_do_dono("w13-dono"))
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        o.ok(ok and estado_series(t) == "outra_conta" and "Treino de outro personal" in t.texto('[data-acessos-linha="treino_series"]')
             and t.n('[data-acessos-radio^="treino_series:"]') == 0,
             f"C8 a conta B (o mesmo login): a linha das séries só com o texto do Treino de outra conta ({estado_series(t)})")
        R.print(t, f"{R.prefixo_print}a_acessos_outra_conta")
    finally:
        t.fim()


JS_ABA_A_VISTA = """() => { const nav = document.querySelector('[data-abas-aluno]'); const a = nav && nav.querySelector('[data-aba-aluno="acessos"]');
  if (!nav || !a) return false; const rn = nav.getBoundingClientRect(), ra = a.getBoundingClientRect();
  return ra.left >= rn.left - 1 && ra.right <= rn.right + 1; }"""


def caso_celular(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "celular", desktop=False)
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        a_vista = t.esperar(lambda: bool(t.pg.evaluate(JS_ABA_A_VISTA)), 10)
        largura = t.pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
        o.ok(ok and a_vista, "C9 390 px: a aba Acessos (a última) rolou para a vista na barra")
        o.ok(largura[0] <= largura[1] + 1, f"C9 nada passa da largura da tela ({largura[0]} × {largura[1]})")
        R.print(t, f"{R.prefixo_print}a_acessos_celular")
    finally:
        t.fim()


def caso_resumo_depois(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "resumo")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-card-ajustes-aluno]") and t.tem("[data-card-dados-aluno]"), 60)
        o.ok(ok and not t.tem("[data-card-acesso-aluno]"), "C10 o Resumo sem o card de login (mora na aba Acessos)")
        card = t.texto("[data-card-ajustes-aluno]")
        o.ok("Mensagens automáticas" in card and t.n("[data-card-ajustes-aluno] [data-ajuste]") == 1
             and t.attr("[data-card-ajustes-aluno] [data-ajuste]", "data-ajuste") == ["mensagens_automaticas"],
             "C10 o card 'Mensagens automáticas' só com o WhatsApp")
        R.print(t, f"{R.prefixo_print}a_resumo_depois")
        t.clicar("[data-menu-perfil]")
        t.esperar(lambda: t.tem('[data-acao-perfil="acesso"]'), 10)
        t.clicar('[data-acao-perfil="acesso"]')
        ok = t.esperar(lambda: t.pg.url.split("?")[0].endswith("/acessos") and t.tem('[data-aba-acessos="pronto"]'), 30)
        o.ok(ok, f"C10 ⋯ › Acesso do aluno abre a aba Acessos ({t.pg.url})")
    finally:
        t.fim()


def caso_editor(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "editor")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/treino", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-editor-treino]") and (t.attr("[data-editor-treino]", "data-editor-treino") or ["carregando"])[0] != "carregando", 90)
        quais = (t.attr("[data-editor-treino]", "data-editor-treino") or ["—"])[0]
        o.ok(ok and t.n("[data-chip-cadeado]") == 0 and "AS SÉRIES" not in t.texto("[data-editor-treino]"),
             f"C11 o editor do Treino sem o cadeado das séries (o treino: {quais})")
        R.print(t, f"{R.prefixo_print}a_editor_sem_cadeado")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: a conta de teste 'master' do Calc no aluno da conta 'Admin Teste' (o mesmo do w14/prod.py), com a Guarda."""
    aluno = B.ler("""select coalesce(p.treino_user_id, p.id)::text as rota from public.pacientes p join public.contas c on c.id = p.conta_id
                      where c.dono_id = (select id from auth.users where email = 'admin.teste.claude@physiqcalc.app')
                        and p.deleted_at is null order by p.created_at limit 1""")
    if not o.ok(bool(aluno), "P0 produção: a conta de teste tem 1 aluno para abrir"):
        return
    rota = aluno[0]["rota"]
    guarda = B.Guarda()
    t = B.Tela(nav, R.base, "p4", "prod", desktop=True, guarda=guarda)
    try:
        t.entrar(R.L, "master", f"/painel/alunos/{rota}/acessos")
        t.caso.fechar_avisos()
        ok = esperar_aba(t, timeout=90)
        t.pg.wait_for_timeout(2500)
        o.ok(ok and t.attr("[data-acessos-linha]", "data-acessos-linha")[:1] == ["acesso_app"] and t.tem("[data-card-acesso-aluno]"),
             f"P1 produção: a aba Acessos abre com as linhas e o Login do aluno ({len(t.attr('[data-acessos-linha]', 'data-acessos-linha'))} linhas)")
        o.ok(not gravacoes_ao_abrir(t) and leituras(t, "acessos") >= 1, f"P1 produção: só `ler` na acessos ({leituras(t, 'acessos')}); 0 gravação")
        R.print(t, "prod_a_acessos")
        t.ir(f"/painel/alunos/{rota}")
        ok = t.esperar(lambda: t.tem("[data-card-ajustes-aluno]"), 60)
        o.ok(ok and not t.tem("[data-card-acesso-aluno]"), "P2 produção: o Resumo sem o card de login; 'Mensagens automáticas' no lugar dos Ajustes")
        R.print(t, "prod_a_resumo")
        # o card de login lê E garante pela aluno_acesso (H-43 — a hml-21c leva ao servidor): a Guarda a barra (o molde BARRADAS_ACEITAS da
        # hml-20, e2e/hml20/dieta_tela.py) e o card mostra o erro dele; fora ela (e o garantir da nutricao), nenhuma gravação
        outras = [b for b in guarda.bloqueadas if b not in BARRADAS_ACEITAS]
        o.ok(not outras, f"P3 produção: nenhuma gravação tentada fora das conhecidas ({sorted(set(guarda.bloqueadas)) or '—'})")
    finally:
        t.fim()


def seco() -> int:
    raiz = Path(__file__).resolve().parents[2]
    falta = [f"{arq} › {x}" for arq, itens in NO_CODIGO.items() for x in itens
             if not (raiz / arq).exists() or x not in (raiz / arq).read_text(encoding="utf-8")]
    sobra = [f"{arq} › {x}" for arq, itens in FORA_DO_CODIGO.items() for x in itens
             if (raiz / arq).exists() and x in (raiz / arq).read_text(encoding="utf-8")]
    sobra += [f"{arq} (o arquivo)" for arq in ARQUIVOS_QUE_SAIRAM if (raiz / arq).exists()]
    for f in falta:
        print("❌ falta no código:", f)
    for f in sobra:
        print("❌ ainda no código (a P4 tirou):", f)
    total = sum(len(v) for v in NO_CODIGO.values()) + sum(len(v) for v in FORA_DO_CODIGO.values()) + len(ARQUIVOS_QUE_SAIRAM)
    print(f"{total - len(falta) - len(sobra)}/{total} seletores e textos do E2E no código (e o que saiu, fora)")
    return 1 if falta or sobra else 0


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
    o = C.Saida(f"telas_acessos_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas da aba Acessos")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    f = foto()
    mu = master_do_staging()
    R = Rodada(o, base, prefixo)
    R.prefixo_print = "loja_" if a.loja else ""
    R.e = {**{k: f[k] for k in ("pac_a", "conta_a", "config_a", "acessos_a", "aluna", "nutri", "personal", "treino_user_id", "series_antes")},
           "marca": f"{B.MARCA} P4 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat(),
           "master_uid": mu["uid"], "master_papel": mu["role"]}
    R.guardar()
    # o w27-master vira master SÓ durante a rodada (C6); o fim (e o --limpar) devolve o papel de antes
    B.escrever(f"update {S}.profiles set role = 'master' where id = {B.txt(mu['uid'])} and role is distinct from 'master'")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            def rodar(fn, *args) -> None:
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    rodar_caso(R, fn, o, nav, R, *args)
                finally:
                    nav.close()

            ok_build = {"v": False}

            def build(o_, nav, R_) -> None:
                ok_build["v"] = caso_build(o_, nav, R_, a.loja)

            rodar(build)
            if ok_build["v"]:
                if a.loja:
                    rodar(caso_personal, True)
                    rodar(caso_nutri, True)
                    rodar(caso_dono_sem_papel, True)
                    rodar(caso_master)
                    rodar(caso_celular)
                    rodar(caso_confirmar_e_cancelar)
                else:
                    R.e["sem_login"] = massa_sem_login(R)
                    R.guardar()
                    for fn in (caso_personal, caso_nutri, caso_dono_sem_papel, caso_master, caso_sem_login, caso_outra_conta, caso_celular,
                               caso_resumo_depois, caso_editor):
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
    o = C.Saida("telas_acessos_prod")
    R = Rodada(o, BASES["prod"], "prod")
    R.prefixo_print = "prod_"
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

- [ ] **Step 2: As guardas (todas verdes, nenhuma editada)**

Run: `cd ~/projetos/physiqcalc-wa-p4 && bash ~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh src/aluno-dia/semBancoDireto.test.ts src/nutricao/semLeituraDireta.test.ts src/integrations/semBancoNoNavegador.test.ts src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts src/lib/consultasComErro.test.ts src/rotas/registro.test.ts src/rotas/usePreCarga.test.ts src/painel/PainelLayout.test.tsx src/painel/aluno/esqueletos.test.tsx`
Expected: `Test Files 10 passed` · `Tests 101 passed (101)` — a `semLeituraDireta` intocada e verde (o "Pronto" da §6), a `semBancoNoNavegador` sem achado novo
(nenhum aviso de BASE que diminuiu), a `semBancoDireto` lendo as pastas da P4.

- [ ] **Step 3: Commit** — `test(w-a): o E2E de tela da aba Acessos (por papel, site e loja; staging; produção só leitura)` com `e2e/wa/telas_acessos.py`;
  `feita.sh 8 "E2E: --seco 44/44, compila; guardas 101/101" "<placar>"`.

---

### Task 9: A prova local completa (o que o CI roda + as provas da P4)

**Estimativa:** 35 min (calibrado 20–30 — a máquina; a 1ª rodada grande da parte local).

- [ ] **Step 1:** `bash ~/projetos/physiqcalc-scratch/w-a/p4/prova_local.sh`
  Expected (a linha `fim`): `lint=0 tipos=0 definer=0 test-node=0 vitest=0 build=0 chunks=0 seco=0 compila=0` e o `git status --short` vazio. O Vitest inteiro sem
  falha (no ensaio 2: 427 arquivos, 6.036 testes, 0 falha — a `main` do dia pode ter mais); o `checar-chunks` sem pesado novo (a aba nova é preguiçosa, por convenção). Vermelho → a
  causa (o `prova-<passo>.txt`), corrigir na task dela, commit, de novo.
- [ ] **Step 2:** `feita.sh 9 "prova local: <a linha fim>" "<os placares>"` e a marca `~/projetos/physiqcalc-scratch/w-a/p4/PRONTO-PARA-STAGING` (o HEAD, as Tasks 0–9, o
  que esperar: a 21d).

---

### Task 10: E2E de tela LOCAL (5173 — o build de staging; site e loja) + os prints

**Estimativa:** 45 min (calibrado 30–40). **🔒 BANCO do staging** (o E2E muda a matrícula A, o Treino e cria a massa — tudo volta). Pode ser ANTES da 21d entrar
(é só o BANCO, num intervalo combinado com a LINUX 1).

- [ ] **Step 1: A trava** — o quadro "🔒 BANCO do staging: LINUX 3 desde HH:MM (W-A P4: telas local na 5173, ~40 min)" + `SendMessage` + esperar o "pode ir";
  `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p4/saude.py "as telas locais"` → 0; `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p4/massa_p4.py` → True.
- [ ] **Step 2: O site no 5173** — `bash ~/projetos/physiqcalc-scratch/w-a/p4/preview.sh site` → `physiq-distribuicao" content="site"` e o `health.json` com
  `"schema":"staging"`. (A 5173 ocupada → PARAR: não derrubar o que não é seu.)
- [ ] **Step 3: O E2E do site** — `cd ~/projetos/physiqcalc-wa-p4 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_acessos.py --base local --canal msedge`
  Expected: `36/36 ok` (A0 · C1 ×5 · C2 ×3 · C3 ×4 · C4 ×5 · C5 ×2 · C6 · C7 ×3 · C8 · C9 ×2 · C10 ×3 · C11 · os 4 logouts locais das sessões do teste · a limpeza com
  as sobras 0). Falhou → o print de diagnóstico, a causa; o `--limpar` (`python3 e2e/wa/telas_acessos.py --limpar` → as sobras 0) antes de rodar de novo. **O C6
  (master) não abriu a casca do painel** (o w27-master sem conta — defeito 12): conferir à mão uma vez (`/painel` como w27-master no build local); se a casca do
  painel não abre para master sem conta, isso é do painel, não da aba: anotar no `progresso.log` e seguir (o master na aba = o servidor, P2 A2.1) — o placar vira
  35/36 com o motivo na obs. das rodadas.
- [ ] **Step 4: Os prints (Read em cada um)** — `~/projetos/physiqcalc-scratch/prints/w-a/p4/local/`: `a_acessos_personal_1280.png` (as 6 linhas, os níveis, o "Mudado
  por", o resumo; o Login do aluno à direita), `a_confirmar_bloqueio_1280.png` (a confirmação "Bloquear o app de …"), `a_acessos_nutri_1280.png` (as séries na nutri,
  com o "Mudado por"), `a_acessos_sem_login_1280.png` (o App desligado com o aviso, "Vale depois do 1º acesso…", SEM ACESSO), `a_acessos_outra_conta_1280.png` (a linha
  das séries com o texto do Treino de outra conta), `a_acessos_celular_390.png` (a aba ativa à vista na barra, as linhas uma embaixo da outra),
  `a_resumo_depois_1280.png` (o Resumo sem o card de login, "Mensagens automáticas"), `a_editor_sem_cadeado_1280.png` (o editor sem o chip). Tela errada,
  "carregando", login → refazer o caso.
- [ ] **Step 5: A loja** — `bash ~/projetos/physiqcalc-scratch/w-a/p4/preview.sh loja` (→ `content="play"`) e
  `cd ~/projetos/physiqcalc-wa-p4 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_acessos.py --base local --loja --canal msedge`
  → `17/17 ok` (A0 ×2 · C1 ×5 · C4 · C5 · C6 · C9 ×2 · C3 · os 3 logouts · a limpeza); os prints `local-loja/loja_a_acessos_personal_1280.png`,
  `loja_a_acessos_nutri_1280.png`, `loja_a_acessos_celular_390.png`, `loja_a_confirmar_bloqueio_1280.png` (Read).
- [ ] **Step 6: Soltar** — `bash ~/projetos/physiqcalc-scratch/w-a/p4/preview.sh parar`; `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p4/massa_p4.py`
  → True (as sobras 0; o w27-master de volta). 🔓 + "livre". `feita.sh 10 "telas local: site 36/36, loja 17/17; prints conferidos" "<placares>"`.

---

### Task 11: Depois da 21d na `main` — o drift da `main`, o rebase e a prova local de novo

**Estimativa:** 30 min (calibrado 15–25; a ESPERA da 21d não conta).

- [ ] **Step 1: A 21d entrou?** — `bash ~/projetos/physiqcalc-scratch/w-a/p4/espera_21d.sh` → "a 21d ESTÁ na main" (rc 0). Ainda não → anotar no `progresso.log` e
  esperar o aviso da LINUX 1 ("21d em produção, git livre") — a P4 não faz staging nem merge antes (o combinado). Previsão de cada ida: o aviso de progresso.
- [ ] **Step 2: O que a `main` mudou nos arquivos da P4** — `cd ~/projetos/physiqcalc-wa-p4 && bash ~/projetos/physiqcalc-scratch/w-a/p4/drift.sh --main`
  Expected: os 19 arquivos "igual" (a 21d não toca nenhum — o combinado) → `rc=0`. Algum MUDOU (o `EditorTreino.test.tsx`, item 2 dos pontos de encontro) → o
  rebase do Step 3 mostra o conflito: juntar as 2 mudanças (a da 21d no falso do `./api` e a da P4 nos 3 trechos), os testes da Task 6 de novo.
- [ ] **Step 3: O rebase (a branch ainda não está no GitHub)** — `cd ~/projetos/physiqcalc-wa-p4 && git fetch origin && git rebase origin/main` → "Successfully rebased"
  (conflito → resolver juntando, `git add <arq>`, `git rebase --continue`; nunca descartar o lado da 21d).
- [ ] **Step 4: A prova local de novo** — `bash ~/projetos/physiqcalc-scratch/w-a/p4/prova_local.sh` → a linha `fim` toda 0 e o `git status --short` vazio. (A pasta
  `android/app/build` de algum APK de teste no worktree não existe aqui — a P4 não monta APK.)
- [ ] **Step 5:** `feita.sh 11 "rebase na main <sha> (com a 21d); prova local: <a linha fim>" "<placares>"`.

---

### Task 12: STAGING (🔒 git + BANCO): push ff no `staging`, a Vercel, o E2E de staging e a regressão tocada

**Estimativa:** 40 min (calibrado 25–35).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p4 fetch origin && git -C ~/projetos/physiqcalc-wa-p4 merge-base --is-ancestor origin/main HEAD && git -C ~/projetos/physiqcalc-wa-p4 merge-base --is-ancestor origin/staging HEAD && echo ok-ff`
  → `ok-ff`. A `main` andou → a Task 11 de novo (Steps 2–4). O `staging` tem commit que a `main` não tem → PARAR (alguém está no staging: o quadro).
- [ ] **Step 2: As travas** — o quadro "🔒 git staging/main + BANCO do staging: LINUX 3 desde HH:MM (W-A P4: push ff no staging + E2E de staging + regressão, ~40 min)"
  + `SendMessage` + esperar o "pode ir".
- [ ] **Step 3: O push e a Vercel** — `git -C ~/projetos/physiqcalc-wa-p4 push origin HEAD:staging && git -C ~/projetos/physiqcalc-wa-p4 rev-parse --short=7 HEAD`
  → o sha; `bash ~/projetos/physiqcalc-scratch/w-a/p4/esperar_vercel.sh <sha>` → "o staging serve <sha>".
- [ ] **Step 4: O E2E de staging (um por vez, o `/health` antes)** — `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p4/saude.py "as telas no staging"`
  e `cd ~/projetos/physiqcalc-wa-p4 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_acessos.py --base staging --canal msedge`
  → `36/36 ok`; os prints em `prints/w-a/p4/staging/` (Read).
- [ ] **Step 5: A regressão das famílias que a P4 tocou (um por vez, o `saude.py` antes de cada)** —
  `cd ~/projetos/physiqcalc-wa-p4 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/w15/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging --canal msedge`
  (o editor sem o cadeado), depois `… flock $P python3 e2e/w08b/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging --casos card,celular,negativo --canal msedge`
  (o card de login na aba Acessos) e `… flock $P python3 e2e/w14/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging --casos acesso,acoes`
  (o Acesso ao app pela aba, com a confirmação, fecha e abre o app; Desativar/Reativar pelo card). Cada falha → a linha: numa verificação que a P4 mudou =
  corrigir (na task dela, commit, push ff, de novo); numa verificação velha de fora da P4 (defeito 7) = anotar na obs. das rodadas, sem corrigir.
- [ ] **Step 6: Soltar** — `massa_p4.py` → True; o quadro com as travas livres + "livre" (o git volta a ser pedido na Task 14).
  `feita.sh 12 "staging <sha>: telas 36/36; regressão w15/w08b/w14 <placares>; prints conferidos; sobras 0" "<placar>"`.

---

### Task 13: As rodadas + PR + CI

**Files:** Modify `docs/e2e-rodadas.md` (o topo da tabela "## Rodadas"); fora: `pr-p4.md`.
**Estimativa:** 25 min (calibrado 10–15).

- [ ] **Step 1: As linhas** — `cd ~/projetos/physiqcalc-scratch/w-a/p4 && python3 rodadas_p4.py --p3-desde "2026-10-13 07:34"` → as linhas da P4 (local site/loja,
  staging, a regressão) e as de produção da P3 depois do merge dela (a `w07/smoke_prod.py`, o `api.py --so-leitura`, o `telas_rotinas.py --base prod`); colar logo
  abaixo da linha `|---|---|…` da "## Rodadas", completando as obs. com o que as `T<N>-FEITA` dizem. Commit:
  `cd ~/projetos/physiqcalc-wa-p4 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(e2e): as rodadas da W-A P4 (e as de produção da P3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/e2e-rodadas.md`
- [ ] **Step 2: O corpo do PR** — `~/projetos/physiqcalc-scratch/w-a/p4/pr-p4.md`: o que entra (a aba e as 6 linhas, o card de login movido, "Mensagens automáticas", o
  editor sem o cadeado, os textos, a barra que rola, o E2E novo e os 4 antigos ajustados); o que NÃO muda (migration, função, as RPCs do card de login e do
  `dados/api.ts`, as guardas da hml-20/21 — intocadas e verdes); as decisões técnicas (a lista do topo) e os defeitos da spec 1–12; as provas (local 36/36 +
  loja 17/17, staging 36/36, a regressão, os prints); a volta (reverter o squash: a aba some, o card de login e os Ajustes voltam ao Resumo, o cadeado volta ao
  editor; nada no banco); **o risco 9 (a P5 vem LOGO depois: liberar a Dieta grava, mas o app só muda na P5)**; e no fim
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Push da branch e PR (a `main` não pode ter andado)** —
  `cd ~/projetos/physiqcalc-wa-p4 && git fetch origin && git merge-base --is-ancestor origin/main HEAD && git push -u origin feat/w-a-p4-aba-acessos && gh pr create --repo weslleybertoldo/physiqcalc --base main --head feat/w-a-p4-aba-acessos --title "W-A P4: a aba Acessos no perfil do aluno (as 6 linhas, o login do aluno; os cards antigos saem do Resumo e o cadeado do editor)" --body-file /home/bertoldo/projetos/physiqcalc-scratch/w-a/p4/pr-p4.md || echo "PAROU: a main andou ou o push/PR falhou (ver acima)"`
  → a URL do PR. A `main` andou depois do push no `staging` → `git merge origin/main` na branch (nunca rebase + força depois de publicada) + a prova local
  (`prova_local.sh --sem-build`) + push.
- [ ] **Step 4: O CI** — `gh pr checks <n> --repo weslleybertoldo/physiqcalc --watch` → `checar-pr` ✅ (lint, tipos, `checar-definer`, `test:node`, Vitest, build +
  `checar-chunks`) e o preview da Vercel ✅. Vermelho → `gh run view <id> --log-failed | tail -60`, corrigir, commit, push (sem forçar).
- [ ] **Step 5:** `feita.sh 13 "PR #<n>; CI verde" "<link>"`.

---

### Task 14: Merge → release → bump → `staging` = `main` → smoke SÓ LEITURA na produção

**Estimativa:** 35 min (calibrado 20–30; as esperas do CI não contam).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p4 fetch origin && git -C ~/projetos/physiqcalc-wa-p4 merge-base --is-ancestor origin/main HEAD && echo main-ok`
  e `gh pr list --repo weslleybertoldo/physiqcalc --state open` (1 PR por vez; a 21d JÁ na `main`).
- [ ] **Step 2: A trava** — o quadro "🔒 git staging/main: LINUX 3 desde HH:MM (W-A P4: merge, release, staging = main por lease)" + `SendMessage` + o "pode ir"
  (que vale também para o realinhar — a condição (a)).
- [ ] **Step 3: Merge** — `gh pr merge <n> --repo weslleybertoldo/physiqcalc --squash --delete-branch` → `git -C ~/projetos/physiqcalc-wa-p4 fetch origin && git -C ~/projetos/physiqcalc-wa-p4 log origin/main -1 --format='%h %an <%ae> %s'`
  = o squash "W-A P4: … (#<n>)" do `Weslley Bertoldo <55102421+weslleybertoldo@users.noreply.github.com>` (anotar o sha).
- [ ] **Step 4: O CI da `main`** — `gh run list --repo weslleybertoldo/physiqcalc --branch main --limit 3` → `gh run watch <id> --repo weslleybertoldo/physiqcalc`
  → a release `Physiq v3.1xx` com o APK e o `chore: bump version to v3.1xx [skip ci]` (NUNCA bumpar à mão); `curl -s https://physiqcalc.com.br/health.json`
  com a versão da release e o commit do squash. Deploy com `git_info_fail` → `POST /v13/deployments` (o caminho de sempre).
- [ ] **Step 5: Realinhar `staging` = `main` (as 3 condições do quadro)** — (a) o "pode ir" do Step 2; (b)
  `bash ~/projetos/physiqcalc-scratch/w-a/p4/realinhar_confere.sh <sha do squash>` → os commits no staging que a main não tem = SÓ os da branch da P4, a árvore do
  staging × a do squash VAZIA e o `STAGING_SHA=…`; (c) ISOLADO: `git -C ~/projetos/physiqcalc-wa-p4 push origin origin/main:staging --force-with-lease=staging:<STAGING_SHA>`.
  Qualquer coisa fora disso → PARAR e combinar (nada de força).
- [ ] **Step 6: O smoke SÓ LEITURA (a Guarda)** — `cd ~/projetos/physiqcalc-wa-p4 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_acessos.py --base prod --canal msedge`
  → `6/6 ok` (P0 · P1 ×2 a aba abre só lendo · P2 o Resumo sem o card de login · P3 nenhuma gravação fora das conhecidas · o logout local); os prints
  `prints/w-a/p4/prod/prod_a_acessos_1280.png` e `prod_a_resumo_1280.png` (Read); depois `… flock $P python3 e2e/w14/prod.py --versao <3.1xx> --casos versao,painel`
  (o Resumo sem o card de login e a aba com o App liberado — P15) e `… flock $P python3 e2e/w07/smoke_prod.py telas --versao <3.1xx> --canal msedge`. As funções
  da W-A sem 5xx desde o merge (só contagens): `… python3 e2e/wa/api.py --so-leitura --desde <ISO UTC do merge>`.
- [ ] **Step 7: "Pode voltar"** — `SendMessage` à LINUX 1 com o sha da `main`, a release, "git livre" e **"a 21c pode rebasear em cima da P4"**; o quadro com a trava livre.
  `feita.sh 14 "squash <sha> (#<n>); release v3.1xx; bump; staging = main por lease; smoke prod 6/6 + w14 + w07 + funções" "<placares>"`.

---

### Task 15: Fechar

**Estimativa:** 15 min (calibrado 5–10). (O que é do coordenador — quadro, foto, Validação, memória — quem executa só anota no `progresso.log`.)

- [ ] O quadro: a linha da W-A com "✅ P4 EM PRODUÇÃO HH:MM (PR #…, squash `…`, release v3.1xx, bump …); local 36/36 + loja 17/17, staging 36/36 + a regressão,
  produção SÓ LEITURA 6/6 + w14 + w07; 0 sobra" e as travas livres; **a P5 (app: dieta liberada) reserva o que for dela e começa LOGO** (risco 9 — sem parte da
  W-A no meio).
- [ ] A foto: o JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-acessos-do-aluno.json` (P4 `feito`, `duracao_min`, tag `PR #… · v3.1xx`)
  → `python3 ~/.claude/skills/Skill-wbs-ciclo-de-implementação-autonoma/andamento_worktrees.py <json> <pasta> --atual` → Read do PNG → tópico.
- [ ] O resumo no grupo Validação (`remoto_validacao`, tópico do Physiq) com os prints (`a_acessos_personal`, `a_acessos_nutri`, `a_acessos_sem_login`,
  `a_acessos_celular`, `a_confirmar_bloqueio`, `a_resumo_depois`, `a_editor_sem_cadeado` — os do staging): o que entrou, os placares, os defeitos da spec, o que
  vem (P5, já).
- [ ] A memória do projeto (Physiq): "W-A P4 em produção (data, PR, versão); P5 a seguir, sem parte no meio".
- [ ] `claude-orfaos.sh` (órfã → perguntar); nada de pé: `tmux ls` sem `wa-p4-preview`, `ss -ltn | grep -E ":5173 "` vazio. A limpeza de `p4/` (caminhos literais):
  `rm -r /home/bertoldo/projetos/physiqcalc-scratch/w-a/p4/ensaio` e `rm -r /home/bertoldo/projetos/physiqcalc-scratch/w-a/p4/ensaio2` (as cópias do ensaio do
  plano). A worktree: `git -C ~/projetos/physiqcalc-wa-p4 status --short` vazio → remover SÓ quando nenhuma sessão estiver dentro dela:
  `git -C ~/projetos/physiqcalc worktree remove ~/projetos/physiqcalc-wa-p4 && git -C ~/projetos/physiqcalc branch -D feat/w-a-p4-aba-acessos`
  (a remota saiu no merge). `feita.sh 15 "fechada" "<o que foi limpo>"`.

---

## Riscos (e o que segura cada um)

1. **A janela P4 → P5** (risco 9 da spec): liberar a Dieta grava e avisa o aluno, mas o app só muda na P5 — a P5 começa LOGO depois (Task 15); nada da W-A no meio.
2. **A espera da 21d** (o combinado): a P4 fica pronta para o staging no fim da Task 10 e espera o merge da 21d (estimada em 7h a 8h, pior 11h30) — o código
   parado não estraga; a Task 11 refaz a prova em cima dela. Se a 21d atrasar muito, a decisão de inverter a ordem é do coordenador com a LINUX 1 (não daqui).
3. **O `EditorTreino.test.tsx` nas 2 frentes** (ponto de encontro 2): perguntado na Task 0; o rebase da Task 11 mostra; juntar as 2 mudanças.
4. **O E2E mexe na matrícula A da w5p-aluna e no Treino dela** (o config, a Dieta, as séries): a foto vai ao estado ANTES; tudo volta no fim e no `--limpar`;
   a trava do BANCO (nenhum E2E da LINUX 1 ao mesmo tempo); o `massa_p4.py` confere antes e depois.
5. **O "dono sem papel"** (C5): os papéis da conta A inteira do w5p-personal mudam por ~3 min — a volta vai ao estado da Massa ANTES e o caso devolve logo
   depois (o `--limpar` também).
6. **O master no painel** (defeito 12): a regra do Step 3 da Task 10.
7. **O E2E no staging travando o Treino de produção** (incidente de 10/10): um por vez, o `/health` antes de cada caso e de cada E2E da regressão.
8. **A régua de rede das hml-20/21** (ponto de encontro 9): o Resumo perde o `aluno_acesso` (aceito, não exigido) — avisado na Task 0.
9. **O APK velho do profissional** (risco 6 da spec): mostra o card antigo, os Ajustes e o cadeado; os caminhos antigos (`aluno_salvar_ajustes`, `setConfig`)
   seguem funcionando e o histórico pega pelo gatilho (as séries pelo cadeado velho não entram no histórico — risco 5, aceito).
10. **A Dieta liberada para aluno com APK velho** (risco 13): o aviso chega, o app não muda — o profissional vê no dia a dia (P6).

## Self-review (feito ao escrever; o código do plano rodou num ENSAIO fora do repo e foi refeito numa 2ª cópia limpa — nada no repo, no banco, na borda nem no registro oficial)

- **Cobertura da spec (§4.1, §4.2, §4.7, §5.3, §6 P4) e do mestre §3 › P4:** a aba depois de Financeiro para todo aluno (Task 4), as 6 linhas com os níveis da
  tabela, as dicas, o "Quando aparece" e as observações (Tasks 1–2; decisões 4–6), os rádios de verdade com a cor por nível (decisão 1), o "Mudado por" e o
  resumo do rodapé (decisão 7), "Salvou → Salvo; erro → volta e a frase" (decisão 2), a confirmação do bloqueio (decisão 3), o Login do aluno à direita e 2
  colunas / 1 no celular com a aba ativa à vista (Tasks 3–4; decisão 11), o card de login saindo do Resumo para a subpasta, "Mensagens automáticas", o "Link do
  diário" com "desligado na aba Acessos" (Tasks 3, 5), o cadeado fora do editor (Task 6), os 3 textos que apontavam para o lugar antigo (Tasks 5–6), o perfil
  relido depois de salvar (decisão 2), os estados e erros da §4.7 (esqueleto, `EstadoErro`, o erro próprio das séries, sem internet, frases fixas), o
  `semLeituraDireta` intocado e verde (Task 8), "a nutri trava as séries e o app mostra…" (decisão 12; Tasks 6 e 10), os E2E da §6 (Tasks 7–8) e os prints da §6
  (`a_acessos_personal`, `a_acessos_nutri`, `a_acessos_sem_login`, `a_acessos_celular`, `a_confirmar_bloqueio`, `a_resumo_depois`, `a_editor_sem_cadeado`) —
  "por papel (personal, nutri, dono sem papel, master) no site e na loja" (C1, C4, C5, C6 e o `--loja`).
- **Sem "TBD":** todo arquivo novo está inteiro no plano (e em `p4/codigo/`, com o md5); toda edição é um `diff` que aplica (o `drift.sh` confere; o ensaio 2 aplicou
  todos em ordem e reproduziu o ensaio byte a byte); os únicos valores do dia são os do ambiente (o sha, o nº do PR e da release, a hora combinada) — lidos na hora,
  escritos no comando seguinte.
- **Nomes consistentes:** os `data-*` do E2E são os das telas (`--seco` 44/44); as funções da P2 com as assinaturas de `src/acessos/api.ts`; as frases dos códigos
  as de `MENSAGEM_ERRO_ACESSOS`; as chaves (`acessos-aluno`, `acessos-series`, `aluno-perfil`) iguais nas consultas, nas gravações e nos testes.
- **Os pontos de encontro só por acréscimo** (o topo do `docs/e2e-rodadas.md`); os arquivos editados fora da lista da spec (`src/rotas/Rotas.test.tsx`,
  `src/treino/ui/SeriesDoExercicio.test.tsx`) avisados na Task 0; nada da hml-21 editado; nenhum nome de RPC mudou.
- **Contra o diálogo de permissão:** nenhum comando do plano usa `bash -c`, `sh -c`, subshell com `time`, `eval` nem `$(…)` na linha; o que é complexo está em script
  (`p4/*.sh`, `p4/*.py`); os `rm` com caminho literal.
- **A fila do pesado:** as tasks de código rodam só os arquivos delas (≤ 1 min cada); as rodadas grandes só nas Tasks 9 e 11 e nos E2E (cada uma na fila).

---

## Apêndice A — os scripts de apoio (já em `~/projetos/physiqcalc-scratch/w-a/p4/`; se faltar algum, recriar daqui)

`~/projetos/physiqcalc-scratch/w-a/p4/log.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 — acrescenta "HH:MM | <texto>" no progresso.log da P4 (sem $(…) na linha de comando de quem chama).
# uso: bash ~/projetos/physiqcalc-scratch/w-a/p4/log.sh "T3 | ✅ verde"
set -euo pipefail
printf '%s | %s\n' "$(date +%H:%M)" "${1:?texto}" >> /home/bertoldo/projetos/physiqcalc-scratch/w-a/p4/progresso.log
tail -1 /home/bertoldo/projetos/physiqcalc-scratch/w-a/p4/progresso.log
```

`~/projetos/physiqcalc-scratch/w-a/p4/feita.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 — grava a marca T<N>-FEITA (1ª linha com a hora de agora) e a linha no progresso.log.
# uso: bash feita.sh <N> "<resumo de 1 linha para o progresso>" "<linha 1 da marca>" ["<linha 2>" …]
set -euo pipefail
n="${1:?N}"; resumo="${2:?resumo}"; shift 2
pasta=/home/bertoldo/projetos/physiqcalc-scratch/w-a/p4
{ printf 'T%s FEITA %s\n' "$n" "$(date +%H:%M)"; for l in "$@"; do printf '%s\n' "$l"; done; } > "$pasta/T$n-FEITA"
printf '%s | T%s | ✅ %s\n' "$(date +%H:%M)" "$n" "$resumo" >> "$pasta/progresso.log"
tail -1 "$pasta/progresso.log"
```

`~/projetos/physiqcalc-scratch/w-a/p4/vitest.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 — o Vitest na fila do pesado, com 2 workers e o TMPDIR do scratch, na worktree da P4.
# uso: bash vitest.sh <arquivos de teste…>   (sem arquivo: o repo inteiro — só na prova local, Task 9)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
cd "${P4_W:-$HOME/projetos/physiqcalc-wa-p4}" || exit 9  # P4_W: só o ensaio do plano usa
if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
flock "$P" npx vitest run --maxWorkers=2 "$@"
```

`~/projetos/physiqcalc-scratch/w-a/p4/copiar.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 — põe na worktree os arquivos NOVOS da P4 a partir das cópias conferidas (p4/codigo/, o ensaio do plano: os mesmos blocos do
# plano). Não sobrescreve arquivo que já existe e confere o md5 de cada cópia (codigo.md5).
# uso: bash copiar.sh <caminho no repo> [<caminho no repo> …]     ex.: bash copiar.sh src/painel/aluno/acessos/regras.test.ts
set -u
W="${P4_W:-$HOME/projetos/physiqcalc-wa-p4}"  # P4_W: só o ensaio do plano usa (a cópia fora do repo)
S="$HOME/projetos/physiqcalc-scratch/w-a/p4"
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

`~/projetos/physiqcalc-scratch/w-a/p4/drift.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 (Task 0, e de novo na Task 11 depois do rebase na main com a 21d) — o "drift": o que o plano usa ainda é o que era ao escrevê-lo (a
# main f736824, v3.115, com a P3)? Só leitura.
# 1) os 20 arquivos que a P4 EDITA iguais aos de p4/orig (o retrato da f736824) e o patch das edições aplica (--check);
# 2) o contrato da P2 que a aba usa (src/acessos/{api,tipos}.ts) e a regra do nível das séries (o teste do app importa);
# 3) as guardas que a P4 encontra: a da hml-20 (a área painel-aluno com a subpasta resumo/ e as RPCs nomeadas — a P4 NÃO a edita), a da W-A
#    (as pastas da P4 já listadas) e a do navegador da hml-21a (o resumo/acesso/api.ts na BASE: a 21c tira — mesma assinatura);
# 4) o registro por convenção (a aba nasce sozinha em src/painel/aluno/abas/); 5) nenhum arquivo NOVO da P4 já existe.
# uso: bash drift.sh          (Task 0, antes de codar: a worktree × p4/orig; saída 0 = nada mudou; 1 = conferir e ajustar ANTES de codar)
#      bash drift.sh --main   (Task 11, antes do rebase: a origin/main do momento × p4/orig — o que a 21d (ou outra) mudou nos arquivos da P4)
set -u
W="${P4_W:-$HOME/projetos/physiqcalc-wa-p4}"  # P4_W: só o ensaio do plano usa (a cópia fora do repo)
S="$HOME/projetos/physiqcalc-scratch/w-a/p4"
cd "$W" || exit 9
rc=0
if [ "${1:-}" = "--main" ]; then
  git fetch origin
  echo "── a origin/main ($(git rev-parse --short origin/main)) × p4/orig: os arquivos que a P4 edita"
  for f in $(cd "$S/orig" && find . -type f | sort); do
    f="${f#./}"
    if git show "origin/main:$f" 2>/dev/null | cmp -s - "$S/orig/$f"; then echo "   igual  $f"; else echo "   MUDOU  $f   (o rebase vai mostrar: juntar as 2 mudanças)"; rc=1; fi
  done
  for f in src/aluno-dia/semBancoDireto.test.ts src/nutricao/semLeituraDireta.test.ts src/integrations/semBancoNoNavegador.test.ts src/acessos/api.ts \
           src/acessos/tipos.ts src/painel/aluno/resumo/acesso/api.ts src/painel/aluno/dados/api.ts src/treino/editor/api.ts; do
    n=$(git log --oneline HEAD..origin/main -- "$f" | wc -l)
    echo "   $f: $n commit(s) novo(s) na main"
  done
  echo "── drift --main: rc=$rc"
  exit $rc
fi
echo "── 1) os arquivos que a P4 edita (md5 × p4/orig)"
for f in $(cd "$S/orig" && find . -type f | sort); do
  f="${f#./}"
  if cmp -s "$S/orig/$f" "$W/$f"; then echo "   igual  $f"; else echo "   MUDOU  $f"; rc=1; fi
done
if git apply --check "$S/p4-edicoes.patch"; then echo "   o patch das edições aplica"; else echo "   o patch NÃO aplica: fazer as edições à mão (o plano mostra cada uma)"; rc=1; fi
echo "── 2) o contrato da P2"
for x in "export const lerAcessos" "export const salvarAcesso" "export const lerSeries" "export const salvarSeries" "export class ErroAcessos" \
         "export function mensagemErroAcessos" "sem_login_do_aluno: \"Ele ainda não tem login: crie o acesso em Login do aluno.\""; do
  grep -qF "$x" src/acessos/api.ts && echo "   ok  api.ts › $x" || { echo "   FALTA api.ts › $x"; rc=1; }
done
for x in "export interface AcessosDoAluno" "export interface LinhasDeAcesso" "export interface MudancaDeAcesso" "export interface SeriesDoAluno" \
         "tem_nutricionista: boolean" "conta_modulos: string[]"; do
  grep -qF "$x" src/acessos/tipos.ts && echo "   ok  tipos.ts › $x" || { echo "   FALTA tipos.ts › $x"; rc=1; }
done
grep -qF "export const nivelDasSeries" supabase/functions/_shared/treino-acessos-regras.ts && echo "   ok  treino-acessos-regras.ts › nivelDasSeries" \
  || { echo "   FALTA treino-acessos-regras.ts › nivelDasSeries"; rc=1; }
echo "── 3) as guardas (a P4 não edita nenhuma)"
grep -qF '"src/painel/aluno/AlunoLayout.tsx", "src/painel/aluno/abas/Prontuario.tsx", "src/painel/aluno/resumo",' src/nutricao/semLeituraDireta.test.ts \
  && echo "   ok  semLeituraDireta: a área painel-aluno lê a pasta resumo/ inteira (o card movido segue nela)" || { echo "   MUDOU semLeituraDireta (a área painel-aluno)"; rc=1; }
grep -qF '"src/painel/aluno/resumo/acesso/api.ts": ["aluno_acesso", "paciente_criar_acesso", "paciente_redefinir_senha"]' src/nutricao/semLeituraDireta.test.ts \
  && echo "   ok  semLeituraDireta: as RPCs do card de login (H-43) ainda nomeadas — a 21c ainda não entrou" \
  || echo "   AVISO semLeituraDireta: as RPCs do card de login mudaram (a 21c entrou?) — a P4 não mexe nelas; só conferir que o resumo/acesso/api.ts exporta o mesmo"
for x in "export async function acessoDoAluno" "export async function criarAcessoDoAluno" "export async function criarSenhaNovaDoAluno"; do
  grep -qF "$x" src/painel/aluno/resumo/acesso/api.ts && echo "   ok  resumo/acesso/api.ts › $x" || { echo "   FALTA resumo/acesso/api.ts › $x (a 21c mudou a assinatura?)"; rc=1; }
done
grep -qF 'P4: ["src/painel/aluno/abas/Acessos.tsx", "src/painel/aluno/acessos"],' src/aluno-dia/semBancoDireto.test.ts \
  && echo "   ok  semBancoDireto: as pastas da P4 já na guarda da W-A" || { echo "   MUDOU semBancoDireto (DA_W_A.P4)"; rc=1; }
grep -qF '"aluno_novo_link", "aluno_salvar_ajustes", "aluno_salvar_dados", "mensagens_aviso_fechar", "mensagens_desligadas"' src/nutricao/semLeituraDireta.test.ts \
  && echo "   ok  semLeituraDireta: o dados/api.ts com as mesmas RPCs (a P4 não muda os nomes)" \
  || echo "   AVISO semLeituraDireta: o dados/api.ts mudou de lista (a 21c?) — a P4 não edita o dados/api.ts"
echo "── 4) o registro por convenção"
grep -qF 'abasAluno: montarGrupo(import.meta.glob(["/src/painel/aluno/abas/*.tsx"' src/rotas/registro.ts && echo "   ok  abasAluno (a aba Acessos nasce sozinha)" \
  || { echo "   MUDOU o registro das abas do aluno"; rc=1; }
grep -qF 'resumoAluno: montarGrupo(import.meta.glob(["/src/painel/aluno/resumo/*.tsx"' src/rotas/registro.ts && echo "   ok  resumoAluno (subpasta não é card)" \
  || { echo "   MUDOU o registro dos cards do Resumo"; rc=1; }
echo "── 5) os arquivos novos da P4 ainda não existem"
for f in src/painel/aluno/acessos src/painel/aluno/abas/Acessos.tsx src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx src/treino/ui/SeriesDoExercicio.test.tsx \
         e2e/wa/telas_acessos.py; do
  [ -e "$f" ] && { echo "   JÁ EXISTE $f"; rc=1; } || echo "   livre $f"
done
echo "── drift: rc=$rc"
exit $rc
```

`~/projetos/physiqcalc-scratch/w-a/p4/saude.py`:
```python
#!/usr/bin/env python3
"""W-A P4 — SÓ LEITURA: o /health dos 2 projetos (db, auth, rest) + ninguém segurando o banco (pg_stat_activity). Saída 0 = tudo bem.
Uso: python3 saude.py "<rótulo>"."""
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(os.environ.get("P4_W") or Path.home() / "projetos" / "physiqcalc-wa-p4") / "e2e" / "wa"))  # P4_W: só o ensaio
import _base as B  # noqa: E402

B.exigir_saude(sys.argv[1] if len(sys.argv) > 1 else "a P4")
r = B.ler("""select count(*) filter (where state = 'active' and now() - query_start > interval '30 seconds') as longas,
                    count(*) filter (where wait_event_type = 'Lock') as esperando from pg_stat_activity where datname = current_database()""")
print(r)
raise SystemExit(0 if r and r[0]["longas"] == 0 and r[0]["esperando"] == 0 else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p4/massa_p4.py`:
```python
#!/usr/bin/env python3
"""W-A P4 (Task 0) — SÓ LEITURA (transação read only): o que o E2E da aba Acessos precisa no staging. Só booleanos e contagens (nada pessoal).
Uso: python3 massa_p4.py   (saída 0 = pronta)"""
import json
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(os.environ.get("P4_W") or Path.home() / "projetos" / "physiqcalc-wa-p4") / "e2e" / "wa"))  # P4_W: só o ensaio
import _base as B  # noqa: E402

E, S = B.CONTAS, "staging"
u = lambda k: f"(select id from auth.users where lower(email) = '{E[k]}')"  # noqa: E731
r = B.ler(f"""
with a as (select p.id, p.conta_id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
            where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app'
              and p.nutricionista_id = {u('w5p-nutri')} and p.personal_id = {u('w5p-personal')} order by p.created_at limit 1)
select (select count(*) from a) as matricula_a,
       (select count(*) from {S}.conta_membros m, a where m.conta_id = a.conta_id and m.user_id = {u('w5p-personal')}
           and 'dono' = any(m.papeis) and 'personal' = any(m.papeis)) as personal_dono_e_personal,
       (select count(*) from {S}.conta_membros m, a where m.conta_id = a.conta_id and m.user_id = {u('w5p-nutri')}) as nutri_na_conta_a,
       ((select c.id from {S}.contas c where c.dono_id = {u('w5p-personal')} and c.origem <> 'app' order by c.criado_em limit 1)
          = (select conta_id from a))::int as conta_a_e_a_do_personal,
       (select count(*) from {S}.contas c where c.dono_id = {u('w13-dono')} and c.origem <> 'app') as conta_do_w13,
       (select count(*) from {S}.profiles p where p.id = {u('w27-master')}) as master_com_profile,
       (select count(*) from {S}.profiles p where p.id = {u('w27-master')} and p.role = 'master') as master_ja_master,
       (select count(*) from {S}.aluno_acessos_log l, a where l.paciente_id = a.id and l.em > now() - interval '30 minutes') as historico_recente_a""")[0]
print("principal/staging:", r)
t = B.C.ler(B.TREINO_REF, f"""select count(*) as n from {S}.physiq_identidades i join {S}.physiq_profiles pf on pf.id = i.treino_user_id
                               where i.principal_user_id = {u('w5p-aluna')}""")
print("treino/staging: identidade + perfil da aluna:", t[0]["n"] if t else 0)
sobras = B.Massa().sobras()
print("sobras da W-A (marca 'WA E2E'):", sobras)
estados = {}
for nome in ("p4-estado.json", "p3-estado.json", "api-estado.json", "massa-estado.json"):
    f = B.SCRATCH / "w-a" / nome
    estados[nome] = bool(f.exists() and json.loads(f.read_text(encoding="utf-8") or "{}") not in ({}, {"matriculas": [], "papeis": []}))
print("estados com massa de rodada anterior:", estados)
ok = (r["matricula_a"] == 1 and r["conta_a_e_a_do_personal"] == 1 and r["personal_dono_e_personal"] == 1 and r["nutri_na_conta_a"] >= 1 and r["conta_do_w13"] >= 1
      and r["master_com_profile"] == 1 and r["master_ja_master"] == 0 and t and t[0]["n"] >= 1
      and all(int(v) == 0 for v in sobras.values()) and not any(estados.values()))
print("massa de TESTE pronta para o E2E da P4:", ok, "(historico_recente_a > 0 = alguém mexeu na matrícula A há pouco: conferir no quadro)")
raise SystemExit(0 if ok else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p4/funcoes_wa.py`:
```python
#!/usr/bin/env python3
"""W-A P4 (a cópia da P3) — SÓ LEITURA (GET da Management API): as 3 funções da W-A nos 2 projetos — existe?, versão, verify_jwt, status.
Uso: python3 funcoes_wa.py [--esperar-ausentes | --esperar-publicadas]   (saída 0 = o esperado; sem opção: só mostra)"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAT = (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()
UA = "physiq-unificado/1.0 (w-a p4)"
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

`~/projetos/physiqcalc-scratch/w-a/p4/prova_local.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 (Task 9; de novo na Task 11, depois do rebase na main com a 21d) — a prova LOCAL inteira, um passo por vez na fila do pesado (o que o
# CI do PR roda + as provas da P4); a saída de cada passo em prova-<passo>.txt. Rodadas GRANDES (lint e Vitest do repo inteiro, build): SÓ
# aqui, com a fila livre entre os passos.
# uso: bash prova_local.sh               (tudo)
#      bash prova_local.sh --sem-build   (sem o build + chunks)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PYTHONDONTWRITEBYTECODE=1 PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p4"
cd "${P4_W:-$HOME/projetos/physiqcalc-wa-p4}" || exit 9  # P4_W: só o ensaio do plano usa
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
passo seco python3 e2e/wa/telas_acessos.py --seco
passo compila python3 -c "[compile(open(f).read(), f, 'exec') for f in ('e2e/wa/telas_acessos.py', 'e2e/w08b/telas.py', 'e2e/w14/telas.py', 'e2e/w14/prod.py', 'e2e/w15/telas.py')]; print('compila ok')"
echo "── git status --short (vazio = tudo commitado)"
git status --short
echo "── fim $(date +%T):$resumo"
```

`~/projetos/physiqcalc-scratch/w-a/p4/preview.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 (Task 10) — o build de STAGING (o .env.local da worktree: VITE_DB_SCHEMA=staging) servido em http://localhost:5173 (--strictPort; a
# 8080 é da LINUX 1) num tmux "wa-p4-preview" (nada solto em background). site = npm run build · loja = npm run build:loja · parar.
# uso: bash preview.sh site | loja | parar
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
W="${P4_W:-$HOME/projetos/physiqcalc-wa-p4}"  # P4_W: só o ensaio do plano usa (a cópia fora do repo)
cd "$W" || exit 9
modo="${1:?site | loja | parar}"
tmux kill-session -t wa-p4-preview 2>/dev/null
if [ "$modo" = "parar" ]; then echo "preview parado"; exit 0; fi
if ss -ltn | grep -q ":5173 "; then echo "PAROU: a porta 5173 está ocupada por outro processo (não derrubo o que não é meu)"; exit 1; fi
case "$modo" in
  site) flock "$P" npm run build > "$HOME/projetos/physiqcalc-scratch/w-a/p4/build-site.txt" 2>&1 || { echo "build do site falhou"; exit 1; } ;;
  loja) flock "$P" npm run build:loja > "$HOME/projetos/physiqcalc-scratch/w-a/p4/build-loja.txt" 2>&1 || { echo "build da loja falhou"; exit 1; } ;;
  *) echo "uso: site | loja | parar"; exit 2 ;;
esac
grep -o 'physiq-distribuicao" content="[a-z]*"' dist/index.html
tmux new-session -d -s wa-p4-preview "cd $W && PATH=$HOME/.local/node/bin:\$PATH $HOME/.local/node/bin/npx vite preview --port 5173 --strictPort"
for _ in $(seq 1 40); do
  if curl -sf http://localhost:5173/health.json > /dev/null; then break; fi
  sleep 1
done
curl -s http://localhost:5173/health.json; echo
```

`~/projetos/physiqcalc-scratch/w-a/p4/espera_21d.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 (Task 11) — a 21d (LINUX 1) já entrou na main? Só leitura: o squash "hml-21d" na origin/main, os PRs abertos e a linha da LINUX 1 no
# quadro. A P4 só faz merge DEPOIS da 21d (o combinado de 13/10 ~08:0x) — e rebaseia em cima dela.
# uso: bash espera_21d.sh   (saída 0 = a 21d está na main; 1 = ainda não)
set -u
cd "${P4_W:-$HOME/projetos/physiqcalc-wa-p4}" || exit 9  # P4_W: só o ensaio do plano usa
git fetch origin
echo "── origin/main (as 8 últimas):"
git log origin/main --oneline -8
echo "── PRs abertos:"
gh pr list --repo weslleybertoldo/physiqcalc --state open
echo "── a linha da LINUX 1 no quadro (a hml-21):"
grep -m1 "hml-21\*\*" "$HOME/projetos/physiqcalc-scratch/quem-toca-o-que.md" | cut -c1-400
if git log origin/main --format=%s -60 | grep -qi "hml-21d"; then echo "── a 21d ESTÁ na main"; exit 0; fi
echo "── a 21d ainda NÃO está na main"
exit 1
```

`~/projetos/physiqcalc-scratch/w-a/p4/esperar_vercel.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 (Task 12) — espera o staging da Vercel servir o commit empurrado (o /health.json com o sha curto de 7; até 15 min). Só leitura.
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

`~/projetos/physiqcalc-scratch/w-a/p4/realinhar_confere.sh`:
```bash
#!/usr/bin/env bash
# W-A P4 (Task 14) — a condição (b) do quadro para realinhar `staging` = `main` depois do squash: o staging só tem os commits da P4 e a árvore
# dele é a do squash. Só leitura (o push com lease é um comando à parte, com o "pode ir" da LINUX 1).
# uso: bash realinhar_confere.sh <sha do squash da P4 na main>
set -u
cd "${P4_W:-$HOME/projetos/physiqcalc-wa-p4}" || exit 9  # P4_W: só o ensaio do plano usa
sq="${1:?sha do squash da P4 na main}"
git fetch origin
echo "── commits no staging que a main não tem (têm de ser SÓ os da branch da P4):"
git log --format='   %h %an — %s' origin/main..origin/staging
echo "── a árvore do staging × a do squash (vazio = iguais):"
git diff --stat origin/staging "$sq"
echo "STAGING_SHA=$(git rev-parse origin/staging)"
```

`~/projetos/physiqcalc-scratch/w-a/p4/rodadas_p4.py`:
```python
#!/usr/bin/env python3
"""W-A P4 (Task 13) — as linhas do docs/e2e-rodadas.md (a mais nova em cima, no formato da tabela "## Rodadas"), do e2e-rodadas.tsv OFICIAL:
as da P4 (branch feat/w-a-p4-aba-acessos) e as de PRODUÇÃO da P3 que rodaram DEPOIS do merge dela (a regra: as de produção vão no PR seguinte;
--p3-desde "AAAA-MM-DD HH:MM" = a hora do squash da P3 — 13/10 07:34). As obs. saem com um texto-base: conferir e completar com as T<N>-FEITA.
Só imprime. Uso: python3 rodadas_p4.py [--p3-desde "2026-10-13 07:34"]"""
import argparse
from pathlib import Path

TSV = Path.home() / "projetos/physiqcalc-scratch/e2e-rodadas.tsv"
OBS = {
    "e2e/wa/telas_acessos.py": {
        "local": "telas do site (5173, build de staging): a aba por papel (personal, nutri, dono sem papel, master), o link/diário e o App com a confirmação, as séries pela treino-acessos (o Treino gravou), sem login, a conta B, o celular, o Resumo depois e o editor sem o cadeado; sobras 0",
        "local-loja": "telas da loja (5173, build:loja): a aba por papel só lendo, o celular e a confirmação até o Cancelar; sobras 0",
        "staging": "telas no staging (Vercel): o mesmo roteiro do local; sobras 0",
        "produção": "SÓ LEITURA (a Guarda): a aba Acessos e o Resumo do aluno da conta de teste do Calc abrem sem gravar (fora o aluno_acesso do card de login — H-43)",
    },
    "e2e/w15/telas.py": {"staging": "regressão do editor do Treino (família w15): sem o cadeado das séries (foi para a aba Acessos)"},
    "e2e/w08b/telas.py": {"staging": "regressão do card de login (família w08b), agora na aba Acessos"},
    "e2e/w14/telas.py": {"staging": "regressão da W14: o Acesso ao app (aba Acessos, com a confirmação) fecha e abre o app; Desativar/Reativar pelo card"},
    "e2e/w14/prod.py": {"produção": "SÓ LEITURA: o Resumo sem o card de login e a aba Acessos com o App liberado (P15)"},
}


def base_de(script: str, args: str) -> str:
    if "--base prod" in args or "--schema public" in args or "--so-leitura" in args or script.endswith("prod.py") or "smoke_prod" in script:
        return "produção"
    if "--base local" in args or "localhost" in args:
        return "local-loja" if "--loja" in args else "local"
    return "staging"


ap = argparse.ArgumentParser()
ap.add_argument("--p3-desde", default="")
a = ap.parse_args()
saida = []
for linha in TSV.read_text(encoding="utf-8").splitlines():
    c = linha.split("\t")
    if len(c) < 6:
        continue
    data, branch, commit, script, args, placar = c[:6]
    if branch == "feat/w-a-p4-aba-acessos":
        b = base_de(script, args)
        obs = OBS.get(script, {}).get(b, "")
        mostra = {"local": "local", "local-loja": "local"}.get(b, b)
        saida.append((data, "W-A P4", commit, script, args, mostra, placar, obs))
    elif branch == "feat/w-a-p3-rotinas" and a.p3_desde and data >= a.p3_desde and base_de(script, args) == "produção":
        saida.append((data, "W-A P3", commit, script, args, "produção", placar, "produção depois do merge da P3 (só leitura)"))
for data, wt, commit, script, args, base, placar, obs in sorted(saida, reverse=True):
    print(f"| {data[8:10]}/{data[5:7]} {data[11:16]} | {wt} | `{commit}` | `{script}{(' ' + args) if args else ''}` | {base} | {placar} | {obs} |")
print(f"\n{len(saida)} linhas ({sum(1 for s in saida if s[1] == 'W-A P4')} da P4, {sum(1 for s in saida if s[1] == 'W-A P3')} da P3)")
```

As cópias conferidas e os retratos (fora do plano, em `p4/`): `codigo/` + `codigo.md5` (os 10 arquivos novos, iguais aos blocos das Tasks 1–8), `patches/T3-teste.patch`,
`T3-codigo.patch`, `T4-teste.patch`, `T4-codigo.patch`, `T5-teste.patch`, `T5-codigo.patch`, `T6-teste.patch`, `T6-codigo.patch`, `T7.patch` (iguais aos blocos `diff`
das tasks), `p4-edicoes.patch` (todos juntos — o `drift.sh` confere que aplica) e `orig/` (os 19 arquivos que a P4 edita, como eram na `f736824`). O ensaio:
`ensaio/` e `ensaio2/` (as cópias; saem na Task 15), `ensaio_prova.sh`, `ensaio_replay.sh` (o ensaio 2), `ensaio_arquivos.sh` (a conferência sem Vitest),
`replay.txt` + `replay-*.txt` (os placares de cada task), `ensaio-*.txt` e `ensaio2-prova-*.txt` (as saídas das rodadas grandes) e `gerar_plano.py` +
`plano.tmpl.md` (este plano montado com os blocos conferidos).
