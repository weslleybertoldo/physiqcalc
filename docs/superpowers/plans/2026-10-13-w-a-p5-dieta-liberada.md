# W-A P5 — App: dieta liberada (a Dieta "Pode mexer": tirar itens do plano só no dia, pôr alimentos e receitas, refeições extras, os alimentos e as receitas do aluno, o anel do que ele comeu; "Só ver" = tudo como hoje; a seção "Rotinas de hoje" na Dieta) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** no app do aluno, quando a Dieta dele está **"Pode mexer"** (a linha da aba Acessos da P4 — a matrícula do plano liberada pelo profissional),
no DIA DE HOJE e no plano atual: na folha de cada refeição do plano, cada item ganha **"Tirar hoje"** (fica riscado, com **"Voltar"**) e embaixo
**"Adicionar alimento"** (a busca: a TACO, os alimentos dele, os do plano dele, as receitas dele; em gramas ou porções); os itens que ele pôs aparecem
com o selo **"você pôs"** e **"Tirar"**; embaixo da lista de refeições, **"Nova refeição"** (nome, horário, "Já comi") e **"Meus alimentos e receitas"**
(criar/mudar/apagar o alimento por 100 g com a porção; a receita com os ingredientes e as porções). O anel e as barras contam o que ele comeu (as
refeições com ✓ — sem o que tirou, com o que pôs — e as extras com "Já comi") contra o plano do dia. **"Só ver" = tudo como hoje.** A Dieta travada
no meio → "A sua dieta voltou a ser só para ver." e a tela volta ao "só ver"; sem internet → os botões desligados. No fim da aba (com nutricionista e
nos pratos prontos do app sem profissional), a seção **"Rotinas de hoje"** (a mesma lista do Início — P3). O plano da nutri NÃO muda (P5 do Weslley:
"só o DIA dele"); o que ele cria é SÓ dele (P6). **Nenhuma migration, nenhuma função:** a `aluno-dia` (P2) e a migration `wa3_dieta_livre` (P1) já fazem
tudo pelo servidor (conferido: nada falta).

**Architecture:** a pasta nova `src/dieta-livre/` (já na guarda da W-A: `src/aluno-dia/semBancoDireto.test.ts` › `DA_W_A.P5`): as regras PURAS
(`regras.ts`: quando a tela é "Pode mexer" — o `meu_dia` de hoje com a matrícula do plano liberada; o dia daquela matrícula; o cartão; a linha e os
totais de cada refeição NO DIA; o que vai para o `dia_adicionar`; os formulários da extra, do alimento e da receita) e os textos (`textos.ts`); as
consultas e a gravação (`useDietaLivre.ts`: o `meu_dia`, a biblioteca, a busca paginada e o `useGravarNoDia` — uma por vez, relê o dia; o
`dieta_travada` vira o toast e a volta ao "só ver"); o que a aba usa (`useDiaLivre.ts`: lê, decide e aplica o dia sobre o plano com o `diaAplicado` da
P2); as telas (`ui/ItensDoDia.tsx` — a lista do dia dentro da folha da refeição; `ui/BuscaDeAlimentos.tsx`; `ui/FolhaAdicionar.tsx`; `ui/FolhaExtra.tsx`;
`ui/FolhaMeusAlimentos.tsx`; `ui/DiaLivre.tsx` — as extras na lista, os 2 botões e as 3 folhas novas pelo `?ver=` da aba). A aba `src/app-aluno/abas/Dieta.tsx`
liga tudo (só quando liberada — travada, o caminho de hoje inteiro) e a folha `src/nutricao/app/ui/SheetRefeicao.tsx` ganha 2 props OPCIONAIS (a lista do
dia no lugar da do plano e os totais do dia; sem elas, a folha é a de antes). Tudo pela porta `src/aluno-dia/api.ts` (P2): `acao: "ler"` nas leituras.

**Tech Stack:** React 19 + TypeScript (`strict: false`) + React Query 5 + Vite + Tailwind 4; Vitest (`--maxWorkers=2`); Python 3 + Playwright (Edge,
`--canal msedge`). Sem APK de teste, sem emulador, sem G7 (a P5 não tem nada nativo: o app no APK é o mesmo JS — a loja roda no `build:loja`; o "APK
velho" é o `build:loja` de ANTES da P5, servido na 5173 pelo `velho.sh`).

**Entradas:** a spec `docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md` (§2.1 P5/P6, §2.2-10/11/12/18, §4.3, §4.4, §4.7, §5.1 wa3, §5.2,
§5.3, §5.4, §5.5, §5.6, §5.7, §6 "P5", §7, §8 riscos 9 e 13, §9, §11) — a fonte; o mestre `docs/superpowers/plans/2026-10-12-w-a-plano-mestre.md` (§0, §1,
§3 › P5, §4, §6, §7, §8, §9); o plano da P4 (o molde: `docs/superpowers/plans/2026-10-13-w-a-p4-aba-acessos.md`, e o andamento real dela em
`~/projetos/physiqcalc-scratch/w-a/p4/progresso.log`) e o da P3 (o app do aluno: `docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md`); o contrato da P2
(`src/aluno-dia/{api,tipos,regras}.ts`, `supabase-principal/functions/aluno-dia/**` + `_shared/aluno-dia-regras.ts`) e a migration
`supabase-principal/migrations/20261012220000_wa3_dieta_livre.sql` (P1); a hml-21 (`~/projetos/physiqcalc-scratch/hml/hml21/{spec,para_linux3}.md`) e o
quadro `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` (linha 8 = as janelas de 13/10).

**Modo:** até o fim (o G0 do mestre vale). Sem gates humanos; validação com evidência (placares, o banco SÓ LEITURA) e prints conferidos (Read em cada
um ANTES de mandar). **O código local começa já; o E2E local com o BANCO entra numa brecha da 21d (antes de ~14:45 ou depois de ~16:45, ou num intervalo
combinado); o staging, o PR e o merge vêm DEPOIS do merge da 21d** (a P5 rebaseia em cima — o molde da Task 11 da P4). BANCO e git do staging sempre
pela trava do quadro.

**Conferido ao escrever este plano (13/10/2026 ~12:00–14:00; SÓ LEITURA + um ENSAIO fora do repo):**
- **A base:** `origin/main` = `origin/staging` = `7a59930` (v3.117: a W-A P4 em produção — PR #200, squash `9687418`). A LINUX 1 está na hml-21d (só local até
  ~14:30 → 🔒 BANCO ~14:45 → ~16:45 → 🔒 git ~17:00–18:30); a 21c vem depois.
- **O servidor já faz tudo** (a P5 NÃO muda função nem migration): a `aluno-dia` (P2, em produção desde 13/10 02:38) tem `ler` q=`dia` (o `meu_dia`: lê mesmo
  travada e devolve `liberada` por matrícula, o `plano_ativo`, as extras e os itens do dia), q=`biblioteca`, q=`alimentos` (20 por página) e as gravações
  `dia_adicionar`, `dia_tirar`, `dia_desfazer`, `extra_salvar/excluir/marcar`, `alimento_salvar/excluir`, `receita_salvar/excluir` — todas exigem a Dieta
  liberada da matrícula do dia (a da refeição; na extra, a do plano ativo), hoje ou ontem, e devolvem `dieta_travada` (409) quando travou. O front da P2
  já tem os clientes (`src/aluno-dia/api.ts`), os tipos (`tipos.ts`) e o `diaAplicado` (`regras.ts`: os riscados, os que ele pôs, as extras e os totais
  "comido × plano"). O `api.py` da P2 provou tudo isso no staging (o grupo D, 14 casos).
- **A massa de TESTE do staging (SÓ LEITURA, `massa_p5.py`):** a matrícula A da w5p-aluna (nutri w5p-nutri + personal w5p-personal) com o plano ativo (o da
  A) e 5 refeições de hoje com alimento (22 itens); a Dieta da A em "ver"; 1 matrícula com nutri; 11 alimentos da TACO com "arroz"; 0 ✓ de hoje; 0 rotina
  viva; a conta do w13-dono COM Nutrição (o caso das 2 matrículas); a w7b-sozinho no plano Treino + Alimentação sem nutri (os pratos prontos); sobras da
  W-A 0; os estados das rodadas vazios → `massa de TESTE pronta para o E2E da P5: True`.
- **As guardas que a P5 encontra (e NÃO edita):** `src/aluno-dia/semBancoDireto.test.ts` (P2) já lista `src/dieta-livre` (`DA_W_A.P5`); `src/nutricao/semLeituraDireta.test.ts`
  (hml-20; a área `dieta` em base 0 e o "ninguém lê direto as RPCs que foram para o servidor" no `src/` inteiro — a dieta livre lê só pela `aluno-dia`);
  `src/integrations/semBancoNoNavegador.test.ts` (hml-21a: arquivo novo com 0 achado); `semDialogoNativo` (as confirmações pelo `useConfirmar`);
  `larguraCelular` (a grade do alimento com `grid-cols-2` base); `consultasComErro` (as consultas da P5 moram em `.ts`; as telas leem o erro). A Guarda dos
  E2E (`e2e/hml17/_base.py`) já conhece a `aluno-dia` (`acao: "ler"` = leitura). Nenhuma lista de funções muda.
- **Os E2E antigos que abrem a Dieta do app** (`e2e/hml20/{rede,telas}.py`, `e2e/w12/telas.py`, `e2e/w16/telas.py`, `e2e/hml18/shell.py`…) não procuram nada que a
  P5 mude (travada = a tela de hoje; as 2 leituras novas da `aluno-dia` são `ler`: a régua da hml-20 conta só a `nutricao(ler)` e as gravações) → nenhum
  E2E antigo é editado; a regressão de staging roda o `e2e/hml20/rede.py --area aluno` (a rede das telas do app, 0 gravação ao abrir).
- **O ENSAIO** (13/10 12:05–13:26, FORA do repo: uma cópia da `7a59930` em `~/projetos/physiqcalc-scratch/w-a/p5/ensaio` com o `node_modules` da worktree
  `physiqcalc-acessos` por link — o MESMO `package-lock.json`, md5 `b276d24b…`; nada no repo, no banco, na borda nem no registro oficial): os blocos deste plano
  como estão → `tsc` do app **0 erro** · `eslint` dos arquivos da P5 **0** · Vitest dos arquivos da P5 (`src/dieta-livre` 12, `Dieta.test.tsx` 24) e das guardas e
  vizinhos **28 arquivos, 375 testes** · o Vitest do REPO INTEIRO **431 arquivos, 6.125 testes** em 4 fatias na 1ª rodada — 1 falha FORA da P5 (`src/painel/configuracoes/Recebimento.test.tsx` › "Conectar no APK…", o intermitente da W2 com a máquina carregada pelo Vitest inteiro da LINUX 1; sozinho 33/33); a rodada final (no ensaio 2, inteira de uma vez) **431/431 arquivos, 6.125/6.125 testes, 0 falha** · `npm run lint` **0 erro** (24 avisos antigos — os mesmos arquivos do ensaio
  da P4, nenhum da P5) · `npm run tipos` **0** · `checar-definer` **0 problema** (171) · `test:node` **68/68 (1 pulado)** · `vite build` + `checar-chunks`
  **ok** (48,96 s; o pedaço da aba Dieta do app `Dieta-*.js` 76,50 KB, gzip 22,21 KB — antes 38,6/11,8, a dieta liberada vai nele (decisão 17); o fecho sem pdf, xlsx, motor, heic2any nem powersync) · `telas_dieta.py --seco` **56/56** · compila · e o **ENSAIO 2**: numa cópia LIMPA da `7a59930` (`p5/ensaio2`), as Tasks 1–4 como o executor
  vai fazer (o `copiar.sh` + o `git apply` de cada patch, o vermelho → verde de cada task — os placares deste plano são os de lá) reproduzem o ensaio **byte a byte** (T1 `./regras` não existe → 9/9 · T2 `../useDietaLivre` não existe → 12/12 + eslint 0 · T3 11 falhas | 13 passam (de 24) → 4 arquivos, 56/56 · T4 `--seco` 56/56 (o E2E final, com o D3 offline, o pão em porções e o D11; a 1ª passada do replay deu 53/53 antes deles) + compila + as guardas 12 arquivos, 195/195), e o
  `drift.sh` contra ela **rc=0**; a prova local inteira na cópia: **`lint=0 tipos=0 definer=0 test-node=0 vitest=0 build=0 chunks=0 seco=0 compila=0`**, o Vitest do repo inteiro **431/431 arquivos, 6.125/6.125 testes**, o `git status` vazio; e, depois do último ajuste no E2E, a conferência final numa 3ª cópia limpa (`ensaio_arquivos.sh`: as cópias + os 2 patches na ordem; o drift rc=0) também deu **byte a byte**. O ensaio achou e o plano já corrige: (1) a fila do pesado é dividida com a
  LINUX 1 (o Vitest inteiro dela segurou a fila ~10 min) — o `timeout` de cada fatia conta só DEPOIS de pegar a fila (o `prova_partes.sh fila` antes de cada
  parte); (2) o `onlineManager` do React Query fica parado depois de um evento `offline` num teste — o `afterEach` da Dieta devolve o `online`; (3) o
  `waitFor(() => querySelector(…))` resolve com `null` (não lança) — os testes novos esperam pelo `achar` (lança até achar); (4) o `eslint` acusou o Fast Refresh
  numa constante exportada junto dos componentes (`FOLHAS_DO_DIA`) — ela mora no `regras.ts`; (5) uma falha FORA da P5 no Vitest inteiro com a máquina carregada
  (`src/painel/configuracoes/Recebimento.test.tsx`, o intermitente da W2; sozinho 33/33) — anotado na Task 5.
  **Não rodou (de propósito):** os E2E contra o staging e a produção (nada de banco).

---

## Decisões técnicas minhas (P5 — não são do Weslley; aparecem na foto)

1. **Quando a tela é "Pode mexer"** (`estadoDaDietaLivre`): o `meu_dia` de HOJE leu, o servidor diz `pode_gravar` e a matrícula do plano que a tela mostra
   está `liberada` (a linha "Pode mexer" + a nutricionista de verdade — `aluno_dieta_liberada`). **O aluno de 2 matrículas segue a do plano ativo:** outra
   matrícula liberada não libera esta; a "Nova refeição" só aparece quando o plano ativo do SERVIDOR (`plano_ativo` — onde a extra vai parar) é o da tela.
   Sem o `meu_dia` (carregando, erro, sem internet) = travada, como hoje. **Só hoje e no plano atual:** outro dia e plano anterior seguem "só para ver"
   (a P5 não toca o `useDieta`, que marca o ✓ só hoje — spec §5.7; ontem = pergunta Q5a).
2. **Travada = o caminho de hoje inteiro:** nada da `src/dieta-livre` aparece; a folha da refeição recebe as 2 props novas só quando liberada (sem elas, o
   mesmo JSX de antes). A única diferença visível travada é a seção "Rotinas de hoje" no fim da aba (decisão 9; defeito 2).
3. **O dia na tela:** a linha de cada refeição e a folha mostram o DIA (os itens que ele tirou saem do resumo e das kcal; os que ele pôs entram); sem
   nada mudado, a MESMA linha de hoje (o teste confere com o `resumoDaRefeicao`). O cartão: o anel e as barras = o `diaAplicado` da P2 (o "comido" contra o
   plano do dia — o plano do dia não muda); o "2 de 4" segue das refeições do plano com alimento.
4. **Refeição do plano sem alimento:** sem "Adicionar alimento" (ela nunca ganha ✓ — `sem_alimentos`; o que ele pusesse nela nunca contaria) e o aviso
   "Esta refeição não tem alimentos no plano: registre o que você comer em “Nova refeição”." (spec §2.2-10).
5. **As gravações uma por vez, sem otimismo:** o botão da linha gira (`ocupado` = a chave da gravação) e os outros ficam desligados; deu certo → relê o dia
   (o React Query espera a releitura antes de soltar — o dado do servidor é a verdade: o retrato, as kcal); o toast só nas que criam/apagam ("Posto no seu
   dia.", "Refeição criada.", "Alimento salvo."…); erro → o toast com a frase fixa do código. **`dieta_travada`** → "A sua dieta voltou a ser só para ver.",
   a folha fecha e o dia relido diz "travada" (a tela volta ao "só ver").
6. **Sem internet:** os botões da dieta liberada desligados (`useOnline`, como o ✓ de hoje); a folha de pôr avisa "Sem conexão · pôr e tirar alimentos
   voltam quando a internet voltar."; a leitura do dia espera a rede (`networkMode: "online"`).
7. **A quantidade:** o alimento em **gramas** ou em **porções da porção de referência** (`porcao_g` do alimento — o servidor só aceita porções na receita:
   no alimento, porções × `porcao_g` viram gramas no app); a receita em porções (0,01–20); as kcal e os macros antes de pôr ("≈ 192 kcal · P 3,8 g…"). A busca
   não traz medidas caseiras (defeito 5).
8. **"Meus alimentos e receitas"** numa folha só (a lista ↔ o formulário): o alimento por 100 g (nome, porção, kcal, proteína, carboidrato, gordura, fibra;
   vazio = 0); a receita (nome, rende N porções inteiras, os ingredientes pela MESMA busca sem as receitas, em gramas; os macros de 1 porção antes de
   salvar). Mudar a receita sem mexer nos ingredientes manda só o nome e as porções (o servidor troca a lista inteira quando ela vai — o ingrediente que
   ele apagou sai dela, com o aviso). Apagar = lixeira, com a confirmação do app: "O que você já pôs nos seus dias continua lá" (o retrato).
9. **"Rotinas de hoje" no fim da aba** (spec §4.3, o "Pronto" da P5): a MESMA lista do Início (`RotinasDeHoje origem="dieta"` da P3, até 4 + "+N", o ✓
   otimista) para quem tem matrícula (`ehAlunoDasRotinas`) — com nutricionista E nos pratos prontos do app sem profissional.
10. **A refeição extra:** a MESMA linha das refeições do plano (`LinhaRefeicao`, o selo "· extra" na linha), logo depois delas; o ✓ verde desmarca o "Já
    comi"; tocar abre a folha da extra (o que ele pôs, "Adicionar alimento", o "Já comi", "Mudar nome e horário", "Apagar refeição" com a confirmação). A
    nova nasce com a hora de agora (São Paulo) e "Já comi" ligado (padrão 10). Só as extras e os itens da matrícula do plano da tela (o mesmo login em 2
    matrículas com Nutrição: o dia de cada uma é dela).
11. **As folhas novas pelo `?ver=` da aba** (`adicionar` com `r` = a refeição do plano ou `e` = a extra · `extra` nova ou `e` · `meus`): o Voltar do aparelho
    fecha, como as de hoje; "Adicionar alimento" troca a folha da refeição pela de pôr (`replace`) e, depois de pôr, volta para a refeição (com o que ele pôs).
12. **O `data-dieta-dia-livre`** na raiz da aba (`sem` · `lendo` · `travada` · `liberada`): os E2E esperam o "travada" DE VERDADE (o dia lido), não o "ainda
    lendo"; invisível na tela.
13. **"APK novo e velho" sem aparelho** (risco 13, defeito 7): a P5 não tem código nativo → o "APK novo" = o `build:loja` com a P5 (o mesmo JS que vai no APK)
    e o **"APK velho" = o `build:loja` de ANTES da P5** (a `main` sem ela, `velho.sh`) com a Dieta LIBERADA: a tela de hoje, nada novo, nenhum `ler` q=dia, o ✓
    do plano marca e desmarca (a `paciente_marcar_refeicao` não mudou). Sem emulador, sem G7.
14. **O E2E `e2e/wa/telas_dieta.py`** (o molde do `telas_rotinas.py` + o `telas_acessos.py`): a foto da matrícula A (os acessos, os ✓ de hoje) vai ao estado ANTES
    de qualquer escrita; a nutri libera/trava pela função `acessos` (o interruptor da P4); a massa com a marca "WA E2E P5 <hhmmss>"; tudo volta no fim e no
    `--limpar` (o que ela pôs/tirou no dia desde o começo, as extras, os alimentos, as receitas, a rotina, os ✓ novos de hoje, os acessos, o histórico e os
    avisos da rodada; a 2ª matrícula da Massa) → as sobras 0. `--loja` (os prints `loja_`), `--velho` (o APK velho), `--base prod` SÓ LEITURA (a Guarda),
    `--seco` (56 seletores e textos no código).
15. **Os limites do front = os do servidor** (`LIMITES_DO_DIA` × `LIMITES` do `_shared/aluno-dia-regras.ts`, o teste confere): o nome da extra até 40, o do
    alimento e o da receita até 80, gramas 0,01–9.999,99, porções do dia 0,01–20, da receita 1–100, os valores por 100 g (kcal 0–1000; o resto 0–100), 1–30
    ingredientes, a busca a partir de 2 letras (até 60).
16. **A esteira:** sem APK/emulador/G7; local (site + loja + velho na 5173) → **esperar a 21d entrar na `main`** → rebase + prova local de novo → staging (push
    ff + E2E + a regressão `hml20/rede.py --area aluno`) → PR → produção SÓ LEITURA (`telas_dieta.py --base prod`, `telas_rotinas.py --base prod`, `w07/smoke_prod.py`,
    `api.py --so-leitura`) → fechar. As rodadas de produção da P4 entram no PR desta (a regra da casa).
17. **A dieta liberada vai no pedaço da aba Dieta** (sem pedaço preguiçoso à parte): a aba do app cresce de 38,6 KB para 76,5 KB minificada (gzip 11,8 → 22,2 KB — ~10 KB
    a mais na rede ao abrir a Dieta), sem nada pesado novo (o `checar-chunks` passa). Separar as 3 folhas num `lazy` só para quem está liberado (~1 h a mais) fica de
    fora — trocável depois sem mexer nas regras.

## Defeitos e ambiguidades da spec (anotados; nenhuma decisão dela mudou)

1. **MÉDIO — "vale hoje e ontem" (§2.2-10, §5.1) × a tela (§4.4 e o "Pronto" só falam do dia):** no app, o ✓ das refeições do plano é só de hoje (o
   `useDieta`, que a §5.7 manda só importar) e o "ontem" exigiria a leitura e o ✓ de ontem → a dieta liberada no app é de HOJE (decisão 1); o servidor segue
   aceitando ontem. Pergunta **Q5a** (até a resposta, a recomendada: só hoje).
2. **MÉDIO — "travada = prints iguais aos de hoje" × "rotinas na Dieta" (o mesmo "Pronto"):** a seção "Rotinas de hoje" entra no fim da aba também travada
   (P9: todo aluno) → o `d_travada` difere do de hoje SÓ por ela (abaixo dos botões); o E2E confere que nada da dieta liberada aparece e o Vitest antigo da Dieta
   segue 13/13 com o mock novo.
3. **MENOR — "quantidade em gramas ou porções" (§4.4) × o servidor:** o `dia_adicionar` só aceita porções na receita → no alimento, as porções viram gramas no
   app (× a porção de referência — decisão 7).
4. **MENOR — "Refeição do plano sem alimento segue sem ✓: ele usa a refeição extra" (§2.2-10):** o servidor aceitaria pôr nela, mas nunca contaria → o app não
   oferece (decisão 4).
5. **MENOR — a busca do aluno (`buscar_alimentos_do_aluno`) não traz as medidas caseiras:** "1 unidade" do ovo não aparece; as porções são a porção de
   referência (`porcao_g`). Trocar = a P2 devolver as medidas (fora daqui).
6. **MENOR — §6 "P5" não cita o `Dieta.test.tsx` como edição de mock:** a invoke falsa dele recusava qualquer função fora da `nutricao` — a P5 ensina a
   `aluno-dia` ao falso (as 13 verificações antigas seguem iguais; +11 novas).
7. **MENOR — "APK novo e velho":** a P5 não tem nada nativo → as 2 provas sem aparelho (decisão 13): o `build:loja` com e sem a P5. O emulador ficaria para quando
   houver código nativo (as regras da P3 valem).
8. **INFO — a produção não tem conta de TESTE com nutricionista** (a `aluno-calc` é só de Treino): o smoke da P5 confere que o Início e a Dieta abrem sem gravar;
   a tela liberada é provada no staging (e o `api.py --so-leitura` lê o q=`dia` na produção).
9. **INFO — a massa de TESTE não tem 2 matrículas com nutricionista:** o caso D10 dá a nutricionista (= o w13-dono, dono da conta B com Nutrição) à 2ª matrícula
   da Massa SÓ durante o caso (a Massa a apaga no fim).
10. **INFO — "Meus alimentos e receitas" é do LOGIN** (o servidor exige a Dieta liberada em ALGUMA matrícula — mestre §8): o botão aparece na tela liberada.
11. **INFO — §2.2-12 "o que ele registrou fica guardado e volta se liberar":** o `meu_dia` devolve o dia mesmo travada; a tela travada ignora e a liberada mostra
    de novo (o Vitest do 2 matrículas e o E2E D9/D10 passam por isso).

## Pontos de encontro com a hml-21 (LINUX 1: 21d agora → 21c depois) — e o que combinar ANTES

O combinado vale como na P4: o **código local da P5 corre em paralelo à 21d**; o **E2E local** (🔒 BANCO, Task 6) numa brecha da 21d; o **staging e o merge da P5
só depois da 21d** (a P5 rebaseia em cima — Task 7). A 21d mexe no Treino (`supabase/functions/treinos/**`, a migration do Treino), na `conta` (q=`aluno_treino`) e
nas telas do Treino/master (`src/treino/servidor.ts`, `src/painel/treinos/**`, `src/painel/busca/Treinos.tsx`, `src/treino/editor/api.ts`, `src/master/app/treinosProntos.ts`,
`src/pages/master/BibliotecaPage.tsx`, `src/app-aluno/sozinho/api.ts`, `src/painel/configuracoes/Perfil.tsx`) + as guardas por acréscimo. A 21c (depois) mexe no
`src/painel/aluno/**/api.ts`, `src/test/{nutricaoFalsa,financeiroFalso}.ts`, republica a `nutricao` e a `financeiro`. **Nenhum arquivo da P5 está nas listas.**

| # | Arquivo / assunto | P5 | hml-21 | Combinar |
|---|---|---|---|---|
| 1 | `src/app-aluno/sozinho/api.ts` | NÃO toca; o `Dieta.test.tsx` FINGE `buscarPratos` e `ErroApp` dele (`vi.mock("@/app-aluno/sozinho/api")`) | 21d muda o `treinosProntos` (e a 21a já mudou as 4 RPCs) | **perguntar ANTES** (Task 0): "a 21d mantém `buscarPratos` e `ErroApp` exportados com os mesmos nomes?" — se não, quem entra depois ajusta o falso (1 linha) |
| 2 | `src/integrations/semBancoNoNavegador.test.ts`, `src/integrations/repeticao.ts`, `src/nutricao/semLeituraDireta.test.ts` | NÃO toca (0 achado nos arquivos novos; a dieta livre só pela `aluno-dia`) | só a hml-21 edita (a 21d tira da BASE; a 21c a área `painel-aluno`) | só avisar |
| 3 | `src/lib/logsDasFuncoes*.test.ts`, a Guarda (`e2e/hml17/_base.py`, `e2e/w26/prod.py`, `e2e/hml19/guarda_teste.py`), `e2e/hml19/_base.py` | NÃO toca (nenhuma função nova; a `aluno-dia` já está) | 21d põe a `treinos` | nada |
| 4 | a `nutricao` (a Dieta do app lê pela `aluno_dieta` dela) | NÃO toca; os E2E da P5 leem por ela | **21c republica** a `nutricao` (o motor comum — H-112) | **avisar:** a 21c não publica a `nutricao` com um E2E da P5 rodando (e vice-versa); a Dieta do app é regressão dela |
| 5 | a rede do app (a régua da hml-20 — `e2e/hml20/rede.py --area aluno`) | a Dieta passa a chamar `aluno-dia` `ler` q=`dia` (com plano) e q=`rotinas` (a seção nova) | a régua conta a `nutricao(ler)` e as gravações (as 2 novas são `ler` de outra função: não mudam o teto) | **avisar** (a linha de base da 21c já é depois da P5 se ela entrar antes) |
| 6 | contas de TESTE e massa (staging) | w5p-aluna (a matrícula A: os acessos da Dieta, os ✓ de hoje, o dia — tudo volta), w5p-nutri (libera/trava pela `acessos`), w13-dono (a 2ª matrícula da Massa, com a nutri = ele SÓ no D10), **w7b-sozinho SÓ LENDO** (os pratos prontos: login + a Dieta + o logout local) | a 21d usa a w5p-aluna/w5p-personal no Treino e a w7b-sozinho (treinos prontos) | **combinar a janela** (a trava do BANCO: nenhum E2E das 2 ao mesmo tempo); nenhum "Sair" global |
| 7 | 🔒 BANCO do staging | Task 6 (E2E local: site ~15 min + loja ~6 + velho ~8, com a massa), Task 8 (E2E de staging + a regressão, ~40 min) | a 21d: a migration do Treino SÓ no `staging` + publicar a `treinos` e a `conta` v4 (~14:45 → ~16:45) | a Task 6 numa brecha (antes de ~14:45 se der, ou depois de ~16:45, ou num intervalo combinado); a Task 8 depois do merge da 21d |
| 8 | 🔒 git | Task 8 (push ff no `staging` — DEPOIS da 21d na `main`), Task 10 (merge, release, realinhar) | o PR da 21d (~17:00–18:30); a 21c depois | 1 PR por vez; a P5 depois da 21d |
| 9 | `docs/e2e-rodadas.md` | as linhas no topo (Task 9: as da P5 + as de produção da P4) | as delas | quem entra depois rebaseia |
| 10 | a porta 5173 (a 8080 é da LINUX 1) e a fila do pesado (`pesado.lock`) | a prova local, os builds do preview e do velho, os E2E | os dela (o Vitest inteiro dela segura a fila ~10 min) | a fila do `flock`; o `prova_partes.sh fila` antes de cada parte |

**Combinar ANTES (Task 0, 1 `SendMessage`):** o item 1 (o `sozinho/api.ts`), os avisos dos itens 2, 4 e 5, e as janelas dos itens 6–8 (a 🔒 BANCO da Task 6 numa
brecha da 21d; a Task 8 e a 10 só DEPOIS da 21d na `main`).

## Pergunta nova (até a resposta, vale a recomendada e a P5 segue)

- **Q5a — Na Dieta "Pode mexer", o aluno mexe também no dia de ONTEM pelo app (pôr/tirar/extra no dia anterior)?** 1) **não nesta parte: só o dia de hoje**
  (**recomendada**: o ✓ das refeições do plano no app já é só de hoje; o servidor aceita ontem — ligar o ontem no app é uma parte pequena depois, ~60–90
  min: a leitura e o ✓ de ontem) · 2) sim, hoje e ontem nesta parte (+ ~60–90 min na P5).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dieta-livre/regras.ts` (+ `.test.ts`) — novo | quando a tela é "Pode mexer", o dia da matrícula, o cartão, a linha e os totais NO DIA, a quantidade (gramas/porções), o que vai para o `dia_adicionar`, os formulários (extra, alimento, receita), os limites |
| `src/dieta-livre/textos.ts` — novo | os textos fixos e o selo de cada resultado da busca |
| `src/dieta-livre/useDietaLivre.ts` — novo | o `meu_dia`, a biblioteca, a busca paginada, o termo atrasado e o `useGravarNoDia` (uma por vez; o `dieta_travada`) |
| `src/dieta-livre/useDiaLivre.ts` — novo | o que a aba usa: lê, decide (só hoje, no plano atual), aplica o dia sobre o plano; o `estado` do `data-*` |
| `src/dieta-livre/ui/ItensDoDia.tsx` — novo | a lista do dia na folha: "Tirar hoje"/"Voltar", "você pôs"/"Tirar", "Adicionar alimento", o aviso da refeição sem alimento |
| `src/dieta-livre/ui/BuscaDeAlimentos.tsx` — novo | a busca (2 letras, 300 ms, 20 por página, "Ver mais"; sem as receitas nos ingredientes) |
| `src/dieta-livre/ui/FolhaAdicionar.tsx` — novo | a busca → a quantidade (com as kcal antes) → "Pôr no dia" |
| `src/dieta-livre/ui/FolhaExtra.tsx` — novo | a refeição extra: nova (nome, horário, "Já comi") e aberta (o que ele pôs, o "Já comi", mudar, apagar) |
| `src/dieta-livre/ui/FolhaMeusAlimentos.tsx` (+ `.test.tsx`) — novo | "Meus alimentos e receitas": a lista e os 2 formulários |
| `src/dieta-livre/ui/DiaLivre.tsx` — novo | as extras na lista, os 2 botões e as 3 folhas pelo `?ver=` |
| `src/app-aluno/abas/Dieta.tsx` (+ `.test.tsx`) | liga a dieta liberada (só liberada), o cartão e as linhas do dia, a folha com a lista do dia, as folhas novas, a seção "Rotinas de hoje"; o teste ensina a `aluno-dia` ao falso e prova a P5 (+11) |
| `src/nutricao/app/ui/SheetRefeicao.tsx` | 2 props OPCIONAIS: a lista do dia no lugar da do plano e os totais do dia (sem elas, igual) |
| `e2e/wa/telas_dieta.py` — novo | o E2E de tela (site, loja, velho, staging; `--base prod` só leitura; `--seco`; `--limpar`) |
| `docs/e2e-rodadas.md` | as linhas no topo (as da P5 e as de produção da P4) |
| `docs/superpowers/plans/2026-10-13-w-a-p5-dieta-liberada.md` | este plano |
| fora do repo — `~/projetos/physiqcalc-scratch/w-a/p5/` | os scripts de apoio (Apêndice A), `codigo/` (as cópias conferidas dos 13 arquivos novos + `codigo.md5`), `patches/` (as edições por task), `orig/` (os 3 arquivos que a P5 edita, como eram na `7a59930` — o `drift.sh` compara), `progresso.log`, `T<N>-FEITA`, as saídas |

**A P5 NÃO toca:** migration, função, `src/aluno-dia/**` e `src/acessos/**` (só importa), `src/rotinas/**` (só importa a lista), `src/nutricao/app/{pacienteApp,useDieta,dia,dietaUtil}.ts`
e as outras folhas/peças da Dieta (só importa — `LinhaRefeicao`, `CartaoPlano`), `src/app-aluno/sozinho/**`, `src/nucleo/**`, `src/integrations/**`, as guardas
(`semLeituraDireta`, `semGravacaoDireta`, `semBancoNoNavegador`, `semBancoDireto`, `logsDasFuncoes*`), a Guarda dos E2E, o painel (`src/painel/**` — a P6),
`docs/{banco-permissoes,desvios}.md`, a lista "não tocar" da spec §5.7 e os arquivos da hml-21.

## Estimativa (minutos de trabalho com testes e checagens; sem as esperas de terceiros — a 21d, as travas, o CI, a Vercel)

```
+------+-------------------------------------------------------------------+--------+------------------------+
| Task | O quê                                                             | Melhor | Calibrado              |
+------+-------------------------------------------------------------------+--------+------------------------+
|  0   | Preparar: worktree, npm ci, .env.local, o plano, drift, massa,    |   25   |  12–15                 |
|      | o quadro, os pedidos à LINUX 1                                    |        |                        |
|  1   | As regras e os textos (TDD)                                       |   10   |   2–3   (×0,2–0,3)     |
|  2   | As consultas, a busca e as folhas (TDD)                           |   20   |   3–5                  |
|  3   | A aba Dieta e a folha da refeição (TDD)                           |   20   |   3–5                  |
|  4   | O E2E novo (--seco, compila) + as guardas                         |   15   |   3–5                  |
|  5   | A prova local completa (o CI + as provas da P5)                   |   35   |  20–30  (a máquina)    |
|  6   | E2E de tela LOCAL (5173: site, loja e o APK velho) + os prints    |   60   |  40–55                 |
|  7   | Depois da 21d na main: drift --main, rebase, a prova local de novo|   30   |  15–25                 |
|  8   | STAGING: push ff, Vercel, E2E de staging + a regressão do app     |   45   |  30–40                 |
|  9   | As rodadas + PR + CI                                              |   25   |  10–15                 |
| 10   | Merge → release → bump → staging = main → smoke SÓ LEITURA        |   35   |  20–30                 |
| 11   | Fechar                                                            |   15   |   5–10                 |
+------+-------------------------------------------------------------------+--------+------------------------+
| TOTAL| código 125 (Tasks 0–5) + esteira 210 (Tasks 6–11)                 |  335   | 163–238 (2h43 a 3h58)  |
+------+-------------------------------------------------------------------+--------+------------------------+
```

**A calibração:** a P4 (o molde mais perto: sem aparelho, o código já rodado no ensaio) levou **2h19 de relógio** (09:35 → 11:54) contra 2h41–3h57 calibrado — as Tasks
1–8 (o código) em 7 min, a prova local 23 min, o E2E local (site + loja, com 2 reruns) 22 min, o rebase + a prova 16, o staging com a regressão e a prova de controle
32, o PR + CI 8, o merge → smoke 21, fechar 2; a P3 (com APK, emulador e G7) levou 4h53. A P5 tem o código maior (13 arquivos novos), mas JÁ RODOU no ensaio e no
ensaio 2 (as Tasks 1–4 refeitas numa cópia limpa com os mesmos comandos) → **×0,2–0,3 nas Tasks 1–4**; o E2E é mais longo que o da P4 (11 casos com massa + a loja
+ o APK velho, com 1–2 reruns prováveis) e a fila do pesado é dividida com a LINUX 1 → **×0,6–1,0 na esteira**. O mestre previa 470 (320 + 150 → 5h06 a 5h20, pior
7h50): o código cai (o ensaio) e a esteira sobe 60 (o velho, o rebase com a prova de novo, a regressão do app). **Previsão: 2h43 a 3h58 de trabalho (pior cenário
5h35 — o melhor caso sem calibrar)**, mais as ESPERAS: a brecha do BANCO para a Task 6 (a 21d segura o BANCO ~14:45 → ~16:45) e o merge da 21d (~17:00–18:30)
para as Tasks 7–10. Com as janelas de hoje: código + prova local ~14:15 → ~15:15 · Task 6 ~16:45 → ~17:40 (ou antes, num intervalo) · Task 7 logo depois do merge
da 21d (~18:30) · staging → produção ~19:00 → ~20:15 · fechar ~20:25 (pior ~22:30). Atrasou → avisar antes.

## Comandos (valem em todas as tasks)

- **Todo comando começa com `cd ~/projetos/physiqcalc-wa-p5 &&`** (W) ou `cd ~/projetos/physiqcalc-scratch/w-a/p5 &&` (S) — o cwd volta ao inicial a cada
  chamada. Variável não sobrevive entre chamadas: repetir na mesma linha.
- **Contra o diálogo de permissão (travou um agente 1h30 na P1):** nada de `bash -c '…'`, `sh -c`, subshell `( … )` com `time`, `eval` nem `$(…)` na linha de
  comando; passo complexo = script em arquivo em `~/projetos/physiqcalc-scratch/w-a/p5/` (o conteúdo está no Apêndice A); `rm` só com caminho literal ou
  `"${VAR:?}/…"`. Python de mais de 1 linha = arquivo (nada de heredoc na linha de comando). Valor do dia (sha, nº do PR, hora) = ler num comando e escrever
  o valor no seguinte.
- **Pesado na fila, com 2 workers e o `TMPDIR` do scratch:** Vitest = `bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh <arquivos…>`; o resto =
  `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P <cmd>`. **Rodada grande (o lint e o
  Vitest do repo inteiro, o build) só nas Tasks 5 e 7**; entre as rodadas, a fila livre (a LINUX 1 usa a mesma — o Vitest inteiro dela segura ~10 min:
  `bash ~/projetos/physiqcalc-scratch/w-a/p5/prova_partes.sh fila` espera até 500 s antes de cada parte).
- **Python sem bytecode no repo:** `PYTHONDONTWRITEBYTECODE=1`; sintaxe por `python3 -c "compile(open('<arq>').read(), '<arq>', 'exec'); print('compila ok')"`.
- **Os arquivos novos vêm das cópias conferidas:** `bash ~/projetos/physiqcalc-scratch/w-a/p5/copiar.sh <caminho no repo>…` (não sobrescreve; confere o md5 de
  `codigo.md5`; o conteúdo é o dos blocos deste plano). **As edições** nos 3 arquivos que existem: `git apply ~/projetos/physiqcalc-scratch/w-a/p5/patches/<task>.patch`
  (o drift da Task 0 diz se aplicam). Se um não aplicar, fazer a edição à mão pelo bloco `diff` da task.
- **Commit (o comando INTEIRO, só os arquivos da task):**
  `git add <arquivos> && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`.
- **Aviso de progresso (regra global):** `HHhMM a HHhMM (pior cenário HHhMM)` + as fases (✅ · 🚧 · ⏳), uma por linha, terminal + tópico; a cada ~30 min num
  agente longo. Cada task fechada → `bash ~/projetos/physiqcalc-scratch/w-a/p5/feita.sh <N> "<resumo>" "<linha>"…`.
- **Coordenação (mestre §0, quadro):** trava 🔒 no quadro + `SendMessage` à LINUX 1 (a sessão da linha dela no quadro) + esperar o "pode ir" antes de: E2E com
  massa no staging (Tasks 6 e 8), push no `staging` (Task 8), merge na `main` e o realinhar (Task 10). Soltou → "livre" + aviso. Quem executa as tasks e não
  é o coordenador anota no `progresso.log` o que é do quadro. **Staging e merge só DEPOIS da 21d na `main`** (Task 7).

---

### Task 0: Preparar (a worktree nova, o plano no repo, o drift, a massa SÓ LEITURA, o quadro, os pedidos à LINUX 1)

**Files:** o plano (`docs/superpowers/plans/2026-10-13-w-a-p5-dieta-liberada.md`); fora do repo, nada novo (os scripts de `p5/` já existem).
**Estimativa:** 25 min (calibrado 12–15).

- [ ] **Step 1: O estado do git e da outra sessão (comando ISOLADO)**

Run: `git -C ~/projetos/physiqcalc fetch origin && git -C ~/projetos/physiqcalc log origin/main --oneline -5 && git -C ~/projetos/physiqcalc log origin/staging --oneline -2 && gh pr list --repo weslleybertoldo/physiqcalc --state open && sed -n 1,12p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md`
Expected: na `origin/main`, o squash "W-A P4: …" (`9687418`) e o `chore: bump version to v3.117` (`7a59930`) — ou mais novo (a 21d já entrou: segue, o drift diz
se mexeu nos arquivos da P5); nenhum PR aberto mexendo em `src/app-aluno/abas/Dieta*`, `src/nutricao/app/**`, `src/dieta-livre/` ou `e2e/wa/`. A linha da LINUX 1 no
quadro: em que fase da 21d ela está (a P5 começa o código já; o BANCO numa brecha; o staging só depois da 21d).

- [ ] **Step 2: As funções da W-A publicadas (SÓ LEITURA)**

Run: `python3 ~/projetos/physiqcalc-scratch/w-a/p5/funcoes_wa.py --esperar-publicadas`
Expected: `acessos` e `aluno-dia` (principal, `verify_jwt` True) e `treino-acessos` (Treino, False) ACTIVE → `esperado: True`.

- [ ] **Step 3: A worktree nova da `origin/main`, o `.env.local` do staging e as dependências**

Run: `git -C ~/projetos/physiqcalc worktree add -b feat/w-a-p5-dieta-livre ~/projetos/physiqcalc-wa-p5 origin/main && cp ~/projetos/physiqcalc-acessos/.env.local ~/projetos/physiqcalc-wa-p5/.env.local && grep -c "^VITE_DB_SCHEMA=staging$" ~/projetos/physiqcalc-wa-p5/.env.local`
Expected: a worktree em `~/projetos/physiqcalc-wa-p5` na branch `feat/w-a-p5-dieta-livre` e `1` (o build local é o de staging). A worktree da P1 já removida →
copiar de `~/projetos/physiqcalc-w2/.env.local` (o mesmo arquivo). Depois:
`cd ~/projetos/physiqcalc-wa-p5 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npm ci`
Expected: `added … packages` sem erro (~1–6 min; a fila pode estar com a LINUX 1).

- [ ] **Step 4: O plano no repo**

Run: `cd ~/projetos/physiqcalc-wa-p5 && cp ~/projetos/physiqcalc-scratch/w-a/p5/plano-p5.md docs/superpowers/plans/2026-10-13-w-a-p5-dieta-liberada.md && git add docs/superpowers/plans/2026-10-13-w-a-p5-dieta-liberada.md && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(w-a): plano da P5 (app: dieta liberada)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/plans/2026-10-13-w-a-p5-dieta-liberada.md`
Expected: 1 commit novo.

- [ ] **Step 5: O drift (o que o plano usa ainda é o que era)**

Run: `cd ~/projetos/physiqcalc-wa-p5 && PATH=~/.local/node/bin:$PATH bash ~/projetos/physiqcalc-scratch/w-a/p5/drift.sh`
Expected: `drift: rc=0` — os 3 arquivos que a P5 edita "igual" aos de `p5/orig` e "o patch das edições aplica"; o contrato da P2 e a lista da P3 "ok"; a Dieta de
hoje (o que a P5 só importa) "ok"; as guardas "ok" (a pasta da P5 na guarda da W-A; fora das áreas da hml-20); os arquivos novos "livre". Alguma linha MUDOU/FALTA
→ ANTES de codar: abrir o diff (`git diff --no-index ~/projetos/physiqcalc-scratch/w-a/p5/orig/<arq> <arq>`), ajustar a edição da task daquele arquivo à mão (o
bloco `diff` da task diz o que muda), rodar os testes da task e anotar no `progresso.log`.

- [ ] **Step 6: A massa de TESTE e a saúde (SÓ LEITURA)**

Run: `cd ~/projetos/physiqcalc-wa-p5 && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p5/massa_p5.py && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p5/saude.py "a P5"`
Expected: `matricula_a 1`, `plano_ativo_da_a 1`, `refeicoes_hoje_com_alimento ≥ 2`, `itens_hoje ≥ 3`, `nivel_dieta_a 'ver'`, `matriculas_com_nutri 1`, `taco_arroz ≥ 1`,
`itens_do_dia_hoje 0`, `extras_hoje 0`, as sobras da W-A todas 0, nenhum estado com massa → `massa de TESTE pronta para o E2E da P5: True`; e, para os casos
D10 e D8: `conta_w13_com_nutricao True`, `sozinho_com_alimentacao 1`, `sozinho_com_nutri 0`; o `/health` dos 2 projetos ACTIVE_HEALTHY e `longas 0, esperando 0`.
`nivel_dieta_a 'mexer'` ou `concluidas_hoje_a > 0` → alguém mexeu na matrícula A (o quadro: quem; não mexer sem saber).

- [ ] **Step 7: O quadro (o coordenador escreve; quem executa só anota no `progresso.log`)** — a linha da W-A: "🚧 P5 (app: dieta liberada) desde HH:MM —
  worktree `~/projetos/physiqcalc-wa-p5` (`feat/w-a-p5-dieta-livre` da `main` `<sha>`). RESERVADOS: `src/dieta-livre/**`, `e2e/wa/telas_dieta.py`,
  `docs/superpowers/plans/2026-10-13-w-a-p5-dieta-liberada.md`; edita: `src/app-aluno/abas/{Dieta.tsx,Dieta.test.tsx}`, `src/nutricao/app/ui/SheetRefeicao.tsx`, o topo do
  `docs/e2e-rodadas.md`; sem migration, sem função; janelas pedidas: 🔒 BANCO (Task 6: E2E local numa brecha da 21d; Task 8: staging) e 🔒 git (Tasks 8 e 10) —
  staging e merge DEPOIS da 21d".

- [ ] **Step 8: Os pedidos à LINUX 1 (1 `SendMessage`, à sessão da linha dela no quadro)**: "W-A P5 (app: dieta liberada) começou o código LOCAL (worktree
  `~/projetos/physiqcalc-wa-p5`; o staging e o merge só DEPOIS da sua 21d na `main` — a P5 rebaseia em cima, como a P4). 1) Arquivos — nenhum da 21d nem da 21c:
  novos `src/dieta-livre/**` e `e2e/wa/telas_dieta.py`; edito `src/app-aluno/abas/{Dieta.tsx,Dieta.test.tsx}` e `src/nutricao/app/ui/SheetRefeicao.tsx` (2 props
  opcionais). **O `Dieta.test.tsx` FINGE o `@/app-aluno/sozinho/api` (`buscarPratos`, `ErroApp`) — a 21d mantém esses 2 nomes?** Se não, quem entra depois ajusta o
  falso. 2) As suas guardas (`semBancoNoNavegador`, `semLeituraDireta`, `repeticao.ts`) e a Guarda dos E2E: não toco; 0 achado nos arquivos novos (a dieta livre só
  pela `aluno-dia`). 3) A rede do app: a Dieta passa a chamar a `aluno-dia` `ler` q=`dia` (quem tem plano) e q=`rotinas` (a seção 'Rotinas de hoje' no fim) — 2
  leituras de outra função: a régua da hml-20 (a `nutricao(ler)` e as gravações) não muda. 4) A 21c republica a `nutricao`: que não seja com um E2E da P5
  rodando (eu aviso antes dos meus). 5) Janelas (cada uma com o seu 'pode ir'): 🔒 BANCO do staging ~45 min para o E2E LOCAL (Task 6 — numa brecha da 21d: antes
  das 14:45 se der, ou depois do seu BANCO ~16:45; uso a w5p-aluna (a matrícula A: os acessos da Dieta, os ✓ de hoje — tudo volta), a w5p-nutri, o w13-dono (a
  2ª matrícula da Massa) e a w7b-sozinho SÓ LENDO (login + a Dieta + o logout local; nenhum 'Sair' global)); depois da 21d na `main`: 🔒 git + BANCO ~40 min (push ff
  no `staging` + E2E de staging + a regressão `e2e/hml20/rede.py --area aluno`) e o git do merge/realinhar. 6) `docs/e2e-rodadas.md`: só o topo." → a resposta no
  `progresso.log`.

- [ ] **Step 9: Previsão + marca** — o aviso de progresso (terminal + tópico) com `HHhMM a HHhMM (pior cenário HHhMM)` e as fases;
  `bash ~/projetos/physiqcalc-scratch/w-a/p5/feita.sh 0 "worktree, npm ci, plano, drift rc=0, massa pronta, pedidos à LINUX 1" "<o que o Step 1 e o 6 mostraram>"`.

---

### Task 1: As regras e os textos — `src/dieta-livre/{regras,textos}.ts` (TDD)

**Files:** Create `src/dieta-livre/regras.ts`, `src/dieta-livre/regras.test.ts`, `src/dieta-livre/textos.ts`.
**Estimativa:** 10 min (calibrado 2–3).

- [ ] **Step 1: O teste (vermelho)** — `cd ~/projetos/physiqcalc-wa-p5 && bash ~/projetos/physiqcalc-scratch/w-a/p5/copiar.sh src/dieta-livre/regras.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh src/dieta-livre/regras.test.ts`
  → FAIL `Failed to resolve import "./regras"`.

`src/dieta-livre/regras.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { LIMITES } from "../../supabase-principal/functions/_shared/aluno-dia-regras";
import { diaAplicado } from "@/aluno-dia/regras";
import type { ItemDaBusca, ItemDoDia, MeuDia, MinhaReceita } from "@/aluno-dia/tipos";
import { resumoDaRefeicao } from "@/nutricao/app/dietaUtil";
import type { ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import {
  LIMITES_DO_DIA, dadosDaEscolha, dadosDaExtra, dadosDaReceita, dadosDoAlimento, diaDaMatricula, escolhaInicial, estadoDaDietaLivre, formularioDaExtra,
  formularioDaReceita, formularioDoAlimento, gramasDaEscolha, ingredienteDaBusca, linhaDaExtra, linhaDaRefeicaoNoDia, macrosDaEscolha,
  macrosDaReceitaNoFormulario, quantidadeDoItemDoDia, resumoDoDiaLivre, totaisDaRefeicaoNoDia, unidadesDe, validarAlimento, validarExtra, validarReceita,
} from "./regras";

// ─── massa: o café da manhã (3 ovos + aveia) e o almoço (frango + arroz) do plano da tela 3 ───
const alimento = (id: string, nome: string, kcal: number, p: number, c: number, l: number) => ({
  id, nome, fonte: "taco", energia_kcal: kcal, proteina_g: p, carboidrato_g: c, lipidio_g: l, fibra_g: 1, sodio_mg: 1, medidas_caseiras: [],
});
const OVO = { ...alimento("ovo", "Ovo, de galinha, inteiro, cozido/10minutos", 145.7, 13.29, 0.61, 9.48), medidas_caseiras: [{ id: "un", descricao: "1 unidade", gramas: 50, ordem: 0 }] };
const AVEIA = alimento("aveia", "Aveia, flocos, crua", 393.82, 13.92, 66.64, 8.5);
const FRANGO = alimento("frango", "Frango, peito, sem pele, grelhado", 159.19, 32.03, 0, 2.48);
const ARROZ = alimento("arroz", "Arroz, integral, cozido", 123.53, 2.59, 25.81, 1);
const it0 = (id: string, a: ReturnType<typeof alimento>, g: number, extra: Partial<ItemDaRefeicao> = {}): ItemDaRefeicao => ({
  id, alimento_id: a.id, quantidade_g: g, medida_caseira_id: null, quantidade_medida: null, ordem: 0, substitutos: [], observacao: null,
  created_at: "2026-09-01T10:00:00Z", alimento: a, ...extra,
});
const ref = (id: string, nome: string, horario: string, ordem: number, itens: ItemDaRefeicao[]): RefeicaoDoPlano => ({
  id, nome, horario, ordem, observacao: null, dias_semana: [], itens,
});
const CAFE = ref("cafe", "Café da manhã", "07:00:00", 0, [it0("i-ovo", OVO, 150, { medida_caseira_id: "un", quantidade_medida: 3 }), it0("i-aveia", AVEIA, 50)]);
const ALMOCO = ref("almoco", "Almoço", "13:00:00", 1, [it0("i-frango", FRANGO, 150), it0("i-arroz", ARROZ, 150)]);
const VAZIA = ref("ceia", "Ceia", "22:00:00", 2, []);
const PLANO: Pick<PlanoAlimentar, "refeicoes"> = { refeicoes: [CAFE, ALMOCO, VAZIA] };
const item = (o: Partial<ItemDoDia>): ItemDoDia => ({
  id: "d1", paciente_id: "pac-1", dia: "2026-09-30", tipo: "adicionado", refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null,
  aluno_alimento_id: null, aluno_receita_id: null, quantidade_g: 100, porcoes: null, refeicao_nome: "Café da manhã", nome: "Banana, prata, crua",
  energia_kcal: 98.25, proteina_g: 1.27, carboidrato_g: 25.96, lipidio_g: 0.07, fibra_g: 2, criado_em: "2026-09-30T10:00:00Z", ...o,
});
const MEU_DIA = (o: Partial<MeuDia> = {}): MeuDia => ({
  dia: "2026-09-30", hoje: "2026-09-30", pode_gravar: true, matriculas: [{ paciente_id: "pac-1", liberada: true }],
  plano_ativo: { plano_id: "plano-atual", paciente_id: "pac-1" }, extras: [], itens: [], ...o,
});
const BUSCA = (o: Partial<ItemDaBusca>): ItemDaBusca => ({
  tipo: "taco", id: "taco-arroz", nome: "Arroz, tipo 1, cozido", porcao_g: 100, energia_kcal: 128.26, proteina_g: 2.52, carboidrato_g: 28.06,
  lipidio_g: 0.23, fibra_g: 1.56, ...o,
});

describe("W-A P5 — regras da dieta liberada (puras)", () => {
  it("os limites são os do servidor (uma fonte só)", () => {
    expect(LIMITES_DO_DIA.extraNome).toBe(LIMITES.extraNome[1]);
    expect(LIMITES_DO_DIA.alimentoNome).toBe(LIMITES.alimentoNome[1]);
    expect(LIMITES_DO_DIA.receitaNome).toBe(LIMITES.receitaNome[1]);
    for (const k of ["gramas", "porcoesDoDia", "porcoesDaReceita", "porcaoG", "kcal", "macro", "itensDaReceita"] as const) {
      expect([...LIMITES_DO_DIA[k]], k).toEqual([...LIMITES[k]]);
    }
    expect(LIMITES_DO_DIA.termo).toBe(LIMITES.termo);
  });

  it("liberada = o dia de HOJE com a matrícula do plano da tela liberada; sem o meu_dia, travada", () => {
    expect(estadoDaDietaLivre(MEU_DIA(), "pac-1", "2026-09-30")).toEqual({ liberada: true, extra: true });
    expect(estadoDaDietaLivre(null, "pac-1", "2026-09-30")).toEqual({ liberada: false, extra: false });
    expect(estadoDaDietaLivre(MEU_DIA({ matriculas: [{ paciente_id: "pac-1", liberada: false }] }), "pac-1", "2026-09-30").liberada).toBe(false);
    expect(estadoDaDietaLivre(MEU_DIA({ pode_gravar: false }), "pac-1", "2026-09-30").liberada).toBe(false);
    // o dia virou só no aparelho (ou o servidor ainda está no de ontem): travada até reler
    expect(estadoDaDietaLivre(MEU_DIA(), "pac-1", "2026-10-01").liberada).toBe(false);
    expect(estadoDaDietaLivre(MEU_DIA(), null, "2026-09-30").liberada).toBe(false);
  });

  it("2 matrículas: segue a do plano ativo — a outra liberada não libera; a extra só quando o plano ativo é o da tela", () => {
    const dois = MEU_DIA({ matriculas: [{ paciente_id: "pac-1", liberada: false }, { paciente_id: "pac-2", liberada: true }] });
    expect(estadoDaDietaLivre(dois, "pac-1", "2026-09-30")).toEqual({ liberada: false, extra: false });
    const inverso = MEU_DIA({ matriculas: [{ paciente_id: "pac-1", liberada: true }, { paciente_id: "pac-2", liberada: false }] });
    expect(estadoDaDietaLivre(inverso, "pac-1", "2026-09-30")).toEqual({ liberada: true, extra: true });
    expect(estadoDaDietaLivre(MEU_DIA({ plano_ativo: { plano_id: "x", paciente_id: "pac-2" } }), "pac-1", "2026-09-30")).toEqual({ liberada: true, extra: false });
    const misturado = MEU_DIA({
      extras: [{ id: "e1", paciente_id: "pac-1", nome: "Lanche", horario: null, concluida_em: null }, { id: "e2", paciente_id: "pac-2", nome: "Outro", horario: null, concluida_em: null }],
      itens: [item({ id: "a" }), item({ id: "b", paciente_id: "pac-2" })],
    });
    const so = diaDaMatricula(misturado, "pac-1");
    expect(so.extras.map((e) => e.id)).toEqual(["e1"]);
    expect(so.itens.map((i) => i.id)).toEqual(["a"]);
  });

  it("o anel conta o que ele comeu: as refeições com ✓ (sem o que tirou, com o que pôs) e as extras com 'Já comi'", () => {
    const dia = MEU_DIA({
      extras: [{ id: "e1", paciente_id: "pac-1", nome: "Lanche", horario: "16:00", concluida_em: "2026-09-30T19:00:00Z" },
        { id: "e2", paciente_id: "pac-1", nome: "Ceia extra", horario: null, concluida_em: null }],
      itens: [
        item({ id: "t-aveia", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: "i-aveia", nome: "Aveia", energia_kcal: 196.91 }),
        item({ id: "p-banana", refeicao_id: "cafe" }),
        item({ id: "p-almoco", refeicao_id: "almoco", energia_kcal: 50 }),
        item({ id: "p-extra", extra_id: "e1", energia_kcal: 200, proteina_g: 10 }),
        item({ id: "p-extra2", extra_id: "e2", energia_kcal: 999 }),
      ],
    });
    const a = diaAplicado(PLANO, dia, new Set(["cafe"]));
    const r = resumoDoDiaLivre(a);
    // o plano do dia: café 218,55 + 196,91 · almoço 238,79 + 185,3 = 839,55 (a ceia sem alimento não conta)
    expect(r.total.energia_kcal).toBe(839.55);
    // o comido: café com ✓ = 218,55 (ovos; a aveia tirada) + 98,25 (a banana) · o almoço sem ✓ não conta · o lanche com "Já comi" = 200
    expect(r.marcado.energia_kcal).toBe(516.8);
    expect([r.concluidas, r.marcaveis]).toEqual([1, 2]);
    const cafe = a.refeicoes.find((x) => x.refeicao.id === "cafe")!;
    expect(totaisDaRefeicaoNoDia(cafe).energia_kcal).toBe(316.8);
    expect(linhaDaRefeicaoNoDia(cafe)).toEqual({ linha: "07:00 · Ovo · Banana", kcal: "317", mudou: true });
    expect(linhaDaExtra(a.extras[0])).toEqual({ linha: "16:00 · Banana", kcal: "200" });
    expect(linhaDaExtra({ extra: { id: "e3", nome: "Vazia", horario: null, concluida_em: null }, adicionados: [], concluida: false })).toEqual({ linha: "Nada ainda", kcal: "—" });
  });

  it("sem nada mudado, a linha da refeição é a de hoje (os mesmos nomes e kcal do plano)", () => {
    const a = diaAplicado(PLANO, MEU_DIA(), new Set());
    const almoco = a.refeicoes.find((x) => x.refeicao.id === "almoco")!;
    expect(linhaDaRefeicaoNoDia(almoco)).toEqual({ linha: `13:00 · ${resumoDaRefeicao(ALMOCO.itens)}`, kcal: "424", mudou: false });
    expect(linhaDaRefeicaoNoDia(a.refeicoes.find((x) => x.refeicao.id === "ceia")!)).toEqual({ linha: "22:00 · Sem alimentos", kcal: "—", mudou: false });
  });

  it("a quantidade do que ele põe: o alimento em gramas ou porções (a porção dele); a receita em porções", () => {
    const arroz = BUSCA({});
    expect(unidadesDe(arroz)).toEqual(["g", "porcao"]);
    expect(unidadesDe(BUSCA({ porcao_g: null }))).toEqual(["g"]);
    expect(unidadesDe(BUSCA({ tipo: "receita", porcao_g: null }))).toEqual(["porcao"]);
    expect(escolhaInicial(arroz)).toEqual({ item: arroz, quantidade: "100", unidade: "g" });
    expect(escolhaInicial(BUSCA({ tipo: "receita", id: "rc", porcao_g: null })).quantidade).toBe("1");
    const lugar = { tipo: "refeicao" as const, id: "cafe", nome: "Café da manhã" };
    expect(dadosDaEscolha(lugar, { item: arroz, quantidade: "150", unidade: "g" })).toEqual({ ok: true, dados: { refeicao_id: "cafe", alimento_id: "taco-arroz", quantidade_g: 150 } });
    expect(gramasDaEscolha({ item: BUSCA({ porcao_g: 30 }), quantidade: "1,5", unidade: "porcao" })).toBe(45);
    const meu = BUSCA({ tipo: "meu", id: "meu-pao", porcao_g: 50 });
    expect(dadosDaEscolha({ tipo: "extra", id: "e1", nome: "Lanche" }, { item: meu, quantidade: "2", unidade: "porcao" }))
      .toEqual({ ok: true, dados: { extra_id: "e1", aluno_alimento_id: "meu-pao", quantidade_g: 100 } });
    const receita = BUSCA({ tipo: "receita", id: "rc", porcao_g: null, energia_kcal: 350 });
    expect(dadosDaEscolha(lugar, { item: receita, quantidade: "0,5", unidade: "porcao" })).toEqual({ ok: true, dados: { refeicao_id: "cafe", aluno_receita_id: "rc", porcoes: 0.5 } });
    expect(dadosDaEscolha(lugar, { item: receita, quantidade: "21", unidade: "porcao" })).toEqual({ ok: false, erro: "De 0,01 a 20 porções." });
    expect(dadosDaEscolha(lugar, { item: arroz, quantidade: "0", unidade: "g" })).toEqual({ ok: false, erro: "Informe a quantidade." });
    expect(dadosDaEscolha(lugar, { item: arroz, quantidade: "10000", unidade: "g" })).toEqual({ ok: false, erro: "De 0,01 a 9.999,99 g." });
    expect(macrosDaEscolha({ item: arroz, quantidade: "200", unidade: "g" })?.energia_kcal).toBe(256.52);
    expect(macrosDaEscolha({ item: receita, quantidade: "2", unidade: "porcao" })?.energia_kcal).toBe(700);
    expect(quantidadeDoItemDoDia({ quantidade_g: 150, porcoes: null })).toBe("150 g");
    expect(quantidadeDoItemDoDia({ quantidade_g: null, porcoes: 1 })).toBe("1 porção");
    expect(quantidadeDoItemDoDia({ quantidade_g: null, porcoes: 1.5 })).toBe("1,5 porções");
  });

  it("a refeição extra: nome 1–40, horário HH:MM ou vazio, 'Já comi' ligado por padrão; criar leva o dia, mudar não", () => {
    const f = formularioDaExtra(null, new Date("2026-09-30T16:05:00-03:00"));
    expect(f).toEqual({ nome: "", horario: "16:05", ja_comi: true });
    expect(validarExtra(f)).toEqual({ campo: "nome", mensagem: "Dê um nome à refeição." });
    expect(validarExtra({ ...f, nome: "x".repeat(41) })?.campo).toBe("nome");
    expect(validarExtra({ ...f, nome: "Lanche", horario: "25:00" })?.campo).toBe("horario");
    expect(validarExtra({ ...f, nome: "  Lanche   da tarde " })).toBeNull();
    expect(dadosDaExtra({ ...f, nome: "  Lanche   da tarde " }, "2026-09-30")).toEqual({ dia: "2026-09-30", nome: "Lanche da tarde", horario: "16:05", ja_comi: true });
    expect(dadosDaExtra({ nome: "Ceia", horario: "", ja_comi: false }, null)).toEqual({ nome: "Ceia", horario: null });
    expect(formularioDaExtra({ nome: "Ceia", horario: "22:00", concluida_em: null })).toEqual({ nome: "Ceia", horario: "22:00", ja_comi: false });
  });

  it("o alimento dele: por 100 g, com a porção; vazio = 0; fora da faixa = o erro do campo", () => {
    const f = { ...formularioDoAlimento(null), nome: "Pão da padaria", energia_kcal: "280", proteina_g: "9,5" };
    expect(validarAlimento({ ...f, nome: " " })?.campo).toBe("nome");
    expect(validarAlimento({ ...f, porcao_g: "0" })?.campo).toBe("porcao_g");
    expect(validarAlimento({ ...f, energia_kcal: "1001" })).toEqual({ campo: "energia_kcal", mensagem: "De 0 a 1000 em 100 g." });
    expect(validarAlimento({ ...f, proteina_g: "101" })?.campo).toBe("proteina_g");
    expect(validarAlimento(f)).toBeNull();
    expect(dadosDoAlimento(f)).toEqual({ nome: "Pão da padaria", porcao_g: 100, energia_kcal: 280, proteina_g: 9.5, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0 });
    expect(formularioDoAlimento({ id: "a", nome: "Whey", porcao_g: 30, energia_kcal: 400, proteina_g: 80, carboidrato_g: 8.5, lipidio_g: 6, fibra_g: 0,
      criado_em: "", alterado_em: "" })).toEqual({ nome: "Whey", porcao_g: "30", energia_kcal: "400", proteina_g: "80", carboidrato_g: "8,5", lipidio_g: "6", fibra_g: "0" });
  });

  it("a receita dele: ingredientes da busca (em gramas) e as porções; os macros de 1 porção; a lista só vai quando muda", () => {
    const vazia = formularioDaReceita(null);
    expect(validarReceita({ ...vazia, nome: "Vitamina" })).toEqual({ campo: "itens", mensagem: "Adicione pelo menos 1 ingrediente." });
    const banana = ingredienteDaBusca(BUSCA({ id: "taco-banana", nome: "Banana", porcao_g: 100, energia_kcal: 98, proteina_g: 1.3, carboidrato_g: 26, lipidio_g: 0.1, fibra_g: 2 }), "n0");
    const leite = { ...ingredienteDaBusca(BUSCA({ tipo: "meu", id: "meu-leite", nome: "Leite", porcao_g: 200, energia_kcal: 60, proteina_g: 3, carboidrato_g: 5, lipidio_g: 3, fibra_g: 0 }), "n1") };
    expect(leite.origem).toEqual({ aluno_alimento_id: "meu-leite" });
    expect(leite.quantidade_g).toBe("200");
    const f = { nome: "Vitamina", porcoes: "2", itens: [banana, leite], itensMudaram: true };
    expect(validarReceita({ ...f, porcoes: "1,5" })?.campo).toBe("porcoes");
    expect(validarReceita({ ...f, itens: [{ ...banana, quantidade_g: "0" }] })?.campo).toBe("itens");
    expect(validarReceita(f)).toBeNull();
    // (98 + 120) / 2 = 109 kcal a porção
    expect(macrosDaReceitaNoFormulario(f, null)?.energia_kcal).toBe(109);
    expect(dadosDaReceita(f, true)).toEqual({ nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: "taco-banana", quantidade_g: 100 }, { aluno_alimento_id: "meu-leite", quantidade_g: 200 }] });
    const salva: MinhaReceita = { id: "rc", nome: "Vitamina", porcoes: 2, por_porcao: { energia_kcal: 109, proteina_g: 3.65, carboidrato_g: 18, lipidio_g: 3.05, fibra_g: 1 },
      itens: [{ id: "x1", alimento_id: "taco-banana", aluno_alimento_id: null, nome: "Banana", quantidade_g: 100 },
        { id: "x2", alimento_id: null, aluno_alimento_id: null, nome: "Leite (apagado)", quantidade_g: 200 }] };
    const ed = formularioDaReceita(salva);
    expect(ed.itens.map((i) => i.origem)).toEqual([{ alimento_id: "taco-banana" }, null]);
    // sem mexer nos ingredientes: só o nome e as porções (o servidor guarda a lista); o preview é o da receita salva
    expect(dadosDaReceita({ ...ed, nome: "Vitamina boa" }, false)).toEqual({ nome: "Vitamina boa", porcoes: 2 });
    expect(macrosDaReceitaNoFormulario(ed, salva)?.energia_kcal).toBe(109);
    expect(macrosDaReceitaNoFormulario({ ...ed, porcoes: "4" }, salva)).toBeNull();
    // mexeu: a lista inteira vai, sem o ingrediente apagado
    expect(dadosDaReceita({ ...ed, itensMudaram: true }, false)).toEqual({ nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: "taco-banana", quantidade_g: 100 }] });
  });
});
```

- [ ] **Step 2: As regras e os textos (verde)** — `cd ~/projetos/physiqcalc-wa-p5 && bash ~/projetos/physiqcalc-scratch/w-a/p5/copiar.sh src/dieta-livre/regras.ts src/dieta-livre/textos.ts && bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh src/dieta-livre/regras.test.ts`
  → `Tests 9 passed (9)`.

`src/dieta-livre/regras.ts`:
```ts
// Physiq W-A P5 — regras PURAS da dieta liberada no app do aluno (spec W-A §2.1 P5/P6, §2.2-10/11/12, §4.4): quando a tela é "Pode mexer" (o
// meu_dia de HOJE com a matrícula do plano que a tela mostra liberada — o aluno de 2 matrículas segue a do plano ativo), o dia daquela
// matrícula, o cartão (o anel conta o que ele comeu), a linha e os totais de cada refeição NO DIA, o que vai para o dia_adicionar (gramas ou
// porções) e os formulários (a refeição extra, o alimento por 100 g, a receita). Os limites são os do banco (migration wa3 — os mesmos de
// LIMITES em _shared/aluno-dia-regras.ts: o teste confere). Sem rede; testado em regras.test.ts.
import { macrosDoRetrato, type DiaAplicado, type ExtraNoDia, type RefeicaoNoDia } from "@/aluno-dia/regras";
import type {
  DadosDaExtra, DadosDaReceita, DadosDoAlimento, DadosDoItemDoDia, ExtraDoDia, ItemDaBusca, ItemDoDia, MacrosDaPorcao, MeuAlimento, MeuDia, MinhaReceita,
} from "@/aluno-dia/tipos";
import type { ResumoDoDia } from "@/nutricao/app/dia";
import { fmtHorario, fmtKcal, fmtQtd, macrosDoItem, nomeCurto, somarMacros, type Totais } from "@/nutricao/app/dietaUtil";
import { arred, numero, type Macros } from "@/nutricao/app/numeros";
import { refeicaoMarcavel } from "@/nutricao/app/refeicaoConcluidaUtil";

/** Os limites do banco (wa3: os checks e as RPCs) — os mesmos do servidor (LIMITES de _shared/aluno-dia-regras.ts; o teste confere). */
export const LIMITES_DO_DIA = {
  extraNome: 40,
  alimentoNome: 80,
  receitaNome: 80,
  gramas: [0.01, 9999.99],
  porcoesDoDia: [0.01, 20],
  porcoesDaReceita: [1, 100],
  porcaoG: [0.01, 9999.99],
  kcal: [0, 1000],
  macro: [0, 100],
  itensDaReceita: [1, 30],
  termoMinimo: 2,
  termo: 60,
} as const;

/** As folhas da Dieta "Pode mexer", abertas pelo `?ver=` da aba (src/dieta-livre/ui/DiaLivre.tsx): adicionar · extra · meus. */
export const FOLHAS_DO_DIA = ["adicionar", "extra", "meus"] as const;
export type FolhaDoDia = (typeof FOLHAS_DO_DIA)[number];

// ───────────────────────── quando a tela é "Pode mexer" ─────────────────────────
export interface EstadoDaDietaLivre {
  /** a tela é "Pode mexer": tirar e pôr nas refeições do plano, os alimentos e as receitas dele */
  liberada: boolean;
  /** dá para criar refeição extra: o servidor põe a extra na matrícula do plano ATIVO — tem de ser a da tela */
  extra: boolean;
}

/**
 * Liberada = o meu_dia de HOJE (o servidor diz `pode_gravar`) com a matrícula do plano que a tela mostra liberada (a linha "Pode mexer" + a
 * nutricionista de verdade — aluno_dieta_liberada). O aluno de 2 matrículas segue a do plano ativo: outra matrícula liberada não libera esta.
 * Sem o meu_dia (carregando, erro, sem internet) = travada, como hoje.
 */
export function estadoDaDietaLivre(
  meuDia: Pick<MeuDia, "dia" | "pode_gravar" | "matriculas" | "plano_ativo"> | null | undefined,
  pacienteDoPlano: string | null | undefined,
  hoje: string,
): EstadoDaDietaLivre {
  if (!meuDia || !pacienteDoPlano || meuDia.dia !== hoje || meuDia.pode_gravar !== true) return { liberada: false, extra: false };
  const liberada = meuDia.matriculas.some((m) => m.paciente_id === pacienteDoPlano && m.liberada === true);
  return { liberada, extra: liberada && meuDia.plano_ativo?.paciente_id === pacienteDoPlano };
}

/** O dia da matrícula do plano da tela (o mesmo login em 2 matrículas com Nutrição: o que ele registrou em cada uma é dela). */
export function diaDaMatricula<T extends Pick<MeuDia, "dia" | "extras" | "itens">>(meuDia: T, pacienteDoPlano: string): T {
  return {
    ...meuDia,
    extras: meuDia.extras.filter((e) => !e.paciente_id || e.paciente_id === pacienteDoPlano),
    itens: meuDia.itens.filter((i) => i.paciente_id === pacienteDoPlano),
  };
}

/** O cartão do plano na tela liberada: o anel e as barras contam o que ele comeu (as refeições com ✓ — sem o que tirou, com o que pôs — e as
 *  extras com "Já comi") contra o plano do dia; o "2 de 4" segue sendo das refeições do plano com alimento. */
export function resumoDoDiaLivre(a: DiaAplicado): ResumoDoDia {
  const marcaveis = a.refeicoes.filter((r) => refeicaoMarcavel(r.refeicao));
  return { total: a.totais.plano, marcado: a.totais.comido, concluidas: marcaveis.filter((r) => r.concluida).length, marcaveis: marcaveis.length };
}

// ───────────────────────── a refeição NO DIA (a linha da lista e a folha) ─────────────────────────
/** Os totais da refeição do plano NO DIA: os itens que ele não tirou + os que ele pôs. */
export const totaisDaRefeicaoNoDia = (r: Pick<RefeicaoNoDia, "itens" | "adicionados">): Totais =>
  somarMacros([...r.itens.filter((x) => !x.tirado).map((x) => macrosDoItem(x.item)), ...r.adicionados.map(macrosDoRetrato)]);

/** Os totais da refeição extra (o que ele pôs nela). */
export const totaisDaExtra = (e: Pick<ExtraNoDia, "adicionados">): Totais => somarMacros(e.adicionados.map(macrosDoRetrato));

/** "Ovo · Banana · Aveia · +1" — os nomes curtos sem repetir, até `max` (a MESMA conta do resumoDaRefeicao do plano). */
export function resumoDosNomes(nomes: string[], max = 3): string {
  const unicos: string[] = [];
  for (const n of nomes.map((x) => nomeCurto(x))) if (!unicos.includes(n)) unicos.push(n);
  return unicos.length <= max ? unicos.join(" · ") : `${unicos.slice(0, max).join(" · ")} · +${unicos.length - max}`;
}

/** A linha da refeição na lista quando a tela está liberada: a hora e os nomes DO DIA (sem os tirados, com os que ele pôs) e as kcal do dia.
 *  Sem nada mudado, igual à de hoje ("07:00 · Ovo · Aveia" e as kcal do plano). */
export function linhaDaRefeicaoNoDia(r: RefeicaoNoDia): { linha: string; kcal: string; mudou: boolean } {
  const ficam = r.itens.filter((x) => !x.tirado);
  const nomes = [...ficam.map((x) => x.item.alimento?.nome ?? ""), ...r.adicionados.map((i) => i.nome)];
  const n = ficam.length + r.adicionados.length;
  const hora = fmtHorario(r.refeicao.horario);
  return {
    linha: [hora, n ? resumoDosNomes(nomes) : "Sem alimentos"].filter(Boolean).join(" · "),
    kcal: n ? fmtKcal(totaisDaRefeicaoNoDia(r).energia_kcal) : "—",
    mudou: r.adicionados.length > 0 || r.itens.some((x) => x.tirado),
  };
}

/** A linha da refeição extra: a hora e os nomes do que ele pôs, ou o convite para pôr. */
export function linhaDaExtra(e: ExtraNoDia): { linha: string; kcal: string } {
  const hora = fmtHorario(e.extra.horario);
  return {
    linha: [hora, e.adicionados.length ? resumoDosNomes(e.adicionados.map((i) => i.nome)) : "Nada ainda"].filter(Boolean).join(" · "),
    kcal: e.adicionados.length ? fmtKcal(totaisDaExtra(e).energia_kcal) : "—",
  };
}

/** "100 g" · "1,5 porção" — a quantidade do que ele pôs (o retrato guarda as gramas ou as porções). */
export function quantidadeDoItemDoDia(i: Pick<ItemDoDia, "quantidade_g" | "porcoes">): string {
  if (i.porcoes !== null && i.porcoes !== undefined) {
    const p = Number(i.porcoes);
    return `${fmtQtd(p)} ${p === 1 ? "porção" : "porções"}`;
  }
  return `${fmtQtd(Number(i.quantidade_g) || 0)} g`;
}

// ───────────────────────── o que ele põe: a busca e a quantidade ─────────────────────────
export type Lugar = { tipo: "refeicao"; id: string; nome: string } | { tipo: "extra"; id: string; nome: string };
export type Unidade = "g" | "porcao";
export interface Escolha {
  item: ItemDaBusca;
  /** o texto do campo ("150", "1,5") */
  quantidade: string;
  unidade: Unidade;
}

/** As unidades que a escolha aceita: a receita só em porções; o alimento em gramas ou em porções (a porção de referência dele). */
export const unidadesDe = (item: Pick<ItemDaBusca, "tipo" | "porcao_g">): Unidade[] =>
  item.tipo === "receita" ? ["porcao"] : Number(item.porcao_g) > 0 ? ["g", "porcao"] : ["g"];

/** A escolha ao tocar num resultado: a receita em 1 porção; o alimento em gramas, com a porção de referência dele (ou 100 g). */
export function escolhaInicial(item: ItemDaBusca): Escolha {
  if (item.tipo === "receita") return { item, quantidade: "1", unidade: "porcao" };
  const g = Number(item.porcao_g) > 0 ? Number(item.porcao_g) : 100;
  return { item, quantidade: fmtQtd(g), unidade: "g" };
}

/** O número do campo ("12,5" ou "12.5"); vazio ou inválido → null. */
export const numeroDoCampo = (s: string): number | null => numero(s);

/** As gramas da escolha (o alimento: gramas, ou porções × a porção de referência); a receita → null. */
export function gramasDaEscolha(e: Escolha): number | null {
  if (e.item.tipo === "receita") return null;
  const q = numeroDoCampo(e.quantidade);
  if (q === null) return null;
  return arred(e.unidade === "porcao" ? q * (Number(e.item.porcao_g) || 100) : q, 2);
}

/** Os macros da escolha (o "≈ 280 kcal" antes de pôr): o alimento por 100 g × as gramas; a receita por porção × as porções. */
export function macrosDaEscolha(e: Escolha): Totais | null {
  const q = numeroDoCampo(e.quantidade);
  if (q === null || q <= 0) return null;
  const fator = e.item.tipo === "receita" ? q : (gramasDaEscolha(e) ?? 0) / 100;
  const m = (v: number) => arred((Number(v) || 0) * fator, 2);
  return somarMacros([{ energia_kcal: m(e.item.energia_kcal), proteina_g: m(e.item.proteina_g), carboidrato_g: m(e.item.carboidrato_g),
    lipidio_g: m(e.item.lipidio_g), fibra_g: m(e.item.fibra_g), sodio_mg: null }]);
}

/** O que vai para o dia_adicionar (1 lugar, 1 origem e a quantidade: a receita em porções; o resto em gramas) — ou a frase do erro. */
export function dadosDaEscolha(lugar: Lugar, e: Escolha): { ok: true; dados: DadosDoItemDoDia } | { ok: false; erro: string } {
  const q = numeroDoCampo(e.quantidade);
  if (q === null || q <= 0) return { ok: false, erro: "Informe a quantidade." };
  const onde = lugar.tipo === "refeicao" ? { refeicao_id: lugar.id } : { extra_id: lugar.id };
  if (e.item.tipo === "receita") {
    const p = arred(q, 2);
    if (p < LIMITES_DO_DIA.porcoesDoDia[0] || p > LIMITES_DO_DIA.porcoesDoDia[1]) return { ok: false, erro: "De 0,01 a 20 porções." };
    return { ok: true, dados: { ...onde, aluno_receita_id: e.item.id, porcoes: p } };
  }
  const g = gramasDaEscolha(e) ?? 0;
  if (g < LIMITES_DO_DIA.gramas[0] || g > LIMITES_DO_DIA.gramas[1]) return { ok: false, erro: "De 0,01 a 9.999,99 g." };
  const origem = e.item.tipo === "meu" ? { aluno_alimento_id: e.item.id } : { alimento_id: e.item.id };
  return { ok: true, dados: { ...onde, ...origem, quantidade_g: g } };
}

/** A linha de baixo de um resultado da busca: "Seu alimento · 280 kcal em 100 g" · "Sua receita · 350 kcal a porção". */
export function linhaDaBusca(i: ItemDaBusca, rotulo: string): string {
  return `${rotulo} · ${fmtKcal(Number(i.energia_kcal) || 0)} kcal ${i.tipo === "receita" ? "a porção" : "em 100 g"}`;
}

// ───────────────────────── a refeição extra ─────────────────────────
export interface FormularioDaExtra {
  nome: string;
  /** "HH:MM" ou "" */
  horario: string;
  ja_comi: boolean;
}
export type ErroDoCampo<C extends string> = { campo?: C; mensagem: string };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const aparado = (s: string): string => s.trim().replace(/\s+/g, " ");

/** "16:05" — a hora de agora em São Paulo (a refeição extra nasce com ela). */
export const horaSP = (agora: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);

export function formularioDaExtra(e: Pick<ExtraDoDia, "nome" | "horario" | "concluida_em"> | null, agora: Date = new Date()): FormularioDaExtra {
  if (!e) return { nome: "", horario: horaSP(agora), ja_comi: true };
  return { nome: e.nome, horario: fmtHorario(e.horario), ja_comi: !!e.concluida_em };
}

export function validarExtra(f: FormularioDaExtra): ErroDoCampo<"nome" | "horario"> | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome à refeição." };
  if (nome.length > LIMITES_DO_DIA.extraNome) return { campo: "nome", mensagem: "O nome vai até 40 letras." };
  if (f.horario && !HORA.test(f.horario)) return { campo: "horario", mensagem: "Escolha um horário válido." };
  return null;
}

/** Criar (com o dia — hoje; a matrícula é a do plano ativo, o servidor decide) ou mudar (nome e horário; o "Já comi" vai pelo extra_marcar). */
export function dadosDaExtra(f: FormularioDaExtra, dia: string | null): DadosDaExtra {
  const base = { nome: aparado(f.nome), horario: f.horario || null };
  return dia ? { dia, ...base, ja_comi: f.ja_comi } : base;
}

// ───────────────────────── o alimento dele (por 100 g) ─────────────────────────
export const MACROS_DO_ALIMENTO = [
  { chave: "energia_kcal", rotulo: "Calorias (kcal)", faixa: LIMITES_DO_DIA.kcal },
  { chave: "proteina_g", rotulo: "Proteína (g)", faixa: LIMITES_DO_DIA.macro },
  { chave: "carboidrato_g", rotulo: "Carboidrato (g)", faixa: LIMITES_DO_DIA.macro },
  { chave: "lipidio_g", rotulo: "Gordura (g)", faixa: LIMITES_DO_DIA.macro },
  { chave: "fibra_g", rotulo: "Fibra (g)", faixa: LIMITES_DO_DIA.macro },
] as const;
export type ChaveDoMacro = (typeof MACROS_DO_ALIMENTO)[number]["chave"];
export type FormularioDoAlimento = { nome: string; porcao_g: string } & Record<ChaveDoMacro, string>;
export type CampoDoAlimento = keyof FormularioDoAlimento;

const campoDeNumero = (n: number | null | undefined): string => (n === null || n === undefined ? "" : fmtQtd(Number(n)));

export function formularioDoAlimento(a: MeuAlimento | null): FormularioDoAlimento {
  if (!a) return { nome: "", porcao_g: "100", energia_kcal: "", proteina_g: "", carboidrato_g: "", lipidio_g: "", fibra_g: "" };
  return { nome: a.nome, porcao_g: campoDeNumero(a.porcao_g), energia_kcal: campoDeNumero(a.energia_kcal), proteina_g: campoDeNumero(a.proteina_g),
    carboidrato_g: campoDeNumero(a.carboidrato_g), lipidio_g: campoDeNumero(a.lipidio_g), fibra_g: campoDeNumero(a.fibra_g) };
}

export function validarAlimento(f: FormularioDoAlimento): ErroDoCampo<CampoDoAlimento> | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome ao alimento." };
  if (nome.length > LIMITES_DO_DIA.alimentoNome) return { campo: "nome", mensagem: "O nome vai até 80 letras." };
  const p = numeroDoCampo(f.porcao_g);
  if (p === null || p < LIMITES_DO_DIA.porcaoG[0] || p > LIMITES_DO_DIA.porcaoG[1]) return { campo: "porcao_g", mensagem: "A porção vai de 0,01 a 9.999,99 g." };
  for (const m of MACROS_DO_ALIMENTO) {
    if (!f[m.chave].trim()) continue;
    const v = numeroDoCampo(f[m.chave]);
    if (v === null || v < m.faixa[0] || v > m.faixa[1]) return { campo: m.chave, mensagem: `De ${m.faixa[0]} a ${fmtQtd(m.faixa[1])} em 100 g.` };
  }
  return null;
}

/** Os dados do alimento_salvar: o nome, a porção e os 5 valores por 100 g (vazio = 0). */
export function dadosDoAlimento(f: FormularioDoAlimento): DadosDoAlimento {
  const d: DadosDoAlimento = { nome: aparado(f.nome), porcao_g: arred(numeroDoCampo(f.porcao_g) ?? 100, 2) };
  for (const m of MACROS_DO_ALIMENTO) d[m.chave] = arred(numeroDoCampo(f[m.chave]) ?? 0, 2);
  return d;
}

// ───────────────────────── a receita dele (ingredientes em gramas + nº de porções) ─────────────────────────
export interface IngredienteDoFormulario {
  /** a chave da linha na tela */
  chave: string;
  origem: { alimento_id: string } | { aluno_alimento_id: string } | null;
  nome: string;
  /** os macros por 100 g (o que a busca devolveu); null = o ingrediente já salvo (o retrato está no servidor) */
  por100: MacrosDaPorcao | null;
  quantidade_g: string;
}
export interface FormularioDaReceita {
  nome: string;
  porcoes: string;
  itens: IngredienteDoFormulario[];
  /** a lista de ingredientes mudou (só então ela vai inteira ao servidor) */
  itensMudaram: boolean;
}
export type CampoDaReceita = "nome" | "porcoes" | "itens";

export function formularioDaReceita(r: MinhaReceita | null): FormularioDaReceita {
  if (!r) return { nome: "", porcoes: "1", itens: [], itensMudaram: false };
  return {
    nome: r.nome,
    porcoes: String(r.porcoes),
    itens: r.itens.map((i) => ({
      chave: i.id,
      origem: i.alimento_id ? { alimento_id: i.alimento_id } : i.aluno_alimento_id ? { aluno_alimento_id: i.aluno_alimento_id } : null,
      nome: i.nome,
      por100: null,
      quantidade_g: fmtQtd(Number(i.quantidade_g)),
    })),
    itensMudaram: false,
  };
}

/** O ingrediente que a busca achou (a receita não entra numa receita). */
export function ingredienteDaBusca(i: ItemDaBusca, chave: string): IngredienteDoFormulario {
  const g = Number(i.porcao_g) > 0 ? Number(i.porcao_g) : 100;
  return {
    chave,
    origem: i.tipo === "meu" ? { aluno_alimento_id: i.id } : { alimento_id: i.id },
    nome: i.nome,
    por100: { energia_kcal: Number(i.energia_kcal) || 0, proteina_g: Number(i.proteina_g) || 0, carboidrato_g: Number(i.carboidrato_g) || 0,
      lipidio_g: Number(i.lipidio_g) || 0, fibra_g: Number(i.fibra_g) || 0 },
    quantidade_g: fmtQtd(g),
  };
}

export function validarReceita(f: FormularioDaReceita): ErroDoCampo<CampoDaReceita> | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome à receita." };
  if (nome.length > LIMITES_DO_DIA.receitaNome) return { campo: "nome", mensagem: "O nome vai até 80 letras." };
  const p = numeroDoCampo(f.porcoes);
  if (p === null || !Number.isInteger(p) || p < LIMITES_DO_DIA.porcoesDaReceita[0] || p > LIMITES_DO_DIA.porcoesDaReceita[1]) {
    return { campo: "porcoes", mensagem: "Rende de 1 a 100 porções (número inteiro)." };
  }
  if (f.itensMudaram || f.itens.length === 0) {
    const validos = f.itens.filter((i) => i.origem);
    if (validos.length < LIMITES_DO_DIA.itensDaReceita[0]) return { campo: "itens", mensagem: "Adicione pelo menos 1 ingrediente." };
    if (validos.length > LIMITES_DO_DIA.itensDaReceita[1]) return { campo: "itens", mensagem: "A receita vai até 30 ingredientes." };
    for (const i of validos) {
      const g = numeroDoCampo(i.quantidade_g);
      if (g === null || g < LIMITES_DO_DIA.gramas[0] || g > LIMITES_DO_DIA.gramas[1]) return { campo: "itens", mensagem: "Cada ingrediente vai de 0,01 a 9.999,99 g." };
    }
  }
  return null;
}

/** Os dados do receita_salvar: o nome e as porções; a lista de ingredientes só quando ela mudou (ou é nova) — o ingrediente apagado (sem
 *  origem) sai da lista nova. */
export function dadosDaReceita(f: FormularioDaReceita, nova: boolean): DadosDaReceita {
  const d: DadosDaReceita = { nome: aparado(f.nome), porcoes: Math.trunc(numeroDoCampo(f.porcoes) ?? 1) };
  if (nova || f.itensMudaram) {
    d.itens = f.itens
      .filter((i) => i.origem)
      .map((i) => ({ ...(i.origem as { alimento_id: string } | { aluno_alimento_id: string }), quantidade_g: arred(numeroDoCampo(i.quantidade_g) ?? 0, 2) }));
  }
  return d;
}

/** Os macros de 1 porção da receita no formulário (o preview): só com todos os ingredientes vindos da busca; senão, os da receita salva
 *  (sem mudança nos ingredientes nem nas porções) — ou null ("—"). */
export function macrosDaReceitaNoFormulario(f: FormularioDaReceita, salva: MinhaReceita | null): Macros | null {
  const p = numeroDoCampo(f.porcoes);
  if (!f.itensMudaram && salva && p === salva.porcoes) return { ...salva.por_porcao, sodio_mg: null };
  if (!p || p < 1 || f.itens.length === 0 || f.itens.some((i) => !i.por100)) return null;
  const t = somarMacros(f.itens.map((i) => {
    const g = numeroDoCampo(i.quantidade_g) ?? 0;
    const x = i.por100 as MacrosDaPorcao;
    return { energia_kcal: (x.energia_kcal * g) / 100, proteina_g: (x.proteina_g * g) / 100, carboidrato_g: (x.carboidrato_g * g) / 100,
      lipidio_g: (x.lipidio_g * g) / 100, fibra_g: (x.fibra_g * g) / 100, sodio_mg: null };
  }));
  return { energia_kcal: arred(t.energia_kcal / p, 2), proteina_g: arred(t.proteina_g / p, 2), carboidrato_g: arred(t.carboidrato_g / p, 2),
    lipidio_g: arred(t.lipidio_g / p, 2), fibra_g: arred(t.fibra_g / p, 2), sodio_mg: null };
}

/** "350 kcal · P 20 g · C 40 g · G 10 g" (os macros de uma linha). */
export function textoDosMacros(m: Pick<Macros, "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g"> | null): string {
  if (!m) return "—";
  const g = (v: number | null) => fmtQtd(arred(Number(v) || 0, 1));
  return `${fmtKcal(Number(m.energia_kcal) || 0)} kcal · P ${g(m.proteina_g)} g · C ${g(m.carboidrato_g)} g · G ${g(m.lipidio_g)} g`;
}
```

`src/dieta-livre/textos.ts`:
```ts
// Physiq W-A P5 — os textos FIXOS da dieta liberada no app do aluno (spec W-A §4.4, §4.7). Cada um numa constante: trocar = 1 linha. A tela
// nunca mostra o texto cru do banco: os erros vêm pela frase fixa do código (src/aluno-dia/api.ts — o `dieta_travada` é "A sua dieta voltou a
// ser só para ver.").
import type { ItemDaBusca } from "@/aluno-dia/tipos";

export const TEXTOS = {
  tirarHoje: "Tirar hoje",
  voltar: "Voltar",
  tiradoHoje: "tirado hoje",
  vocePos: "você pôs",
  tirar: "Tirar",
  adicionar: "Adicionar alimento",
  semAlimentoNoPlano: "Esta refeição não tem alimentos no plano: registre o que você comer em “Nova refeição”.",
  novaRefeicao: "Nova refeição",
  meus: "Meus alimentos e receitas",
  jaComi: "Já comi",
  jaComiDica: "Conta no anel do dia.",
  naoComiDica: "Marque quando comer: só então conta no anel.",
  criarRefeicao: "Criar refeição",
  mudarRefeicao: "Mudar nome e horário",
  apagarRefeicao: "Apagar refeição",
  refeicaoCriada: "Refeição criada.",
  refeicaoSalva: "Refeição salva.",
  refeicaoApagada: "Refeição apagada.",
  nadaNaExtra: "Nada nesta refeição ainda: adicione o que você comeu.",
  porNoDia: "Pôr no dia",
  trocar: "Trocar",
  posto: "Posto no seu dia.",
  buscar: "Buscar",
  buscarDica: "Digite 2 letras ou mais.",
  buscarPlaceholder: "Arroz, frango, a sua receita…",
  buscarErro: "Não deu para buscar agora.",
  buscarNada: "Nada encontrado.",
  verMais: "Ver mais",
  quantidade: "Quantidade",
  gramas: "Gramas",
  porcoes: "Porções",
  alimentos: "Alimentos",
  receitas: "Receitas",
  novoAlimento: "Novo alimento",
  novaReceita: "Nova receita",
  mudarAlimento: "Mudar alimento",
  mudarReceita: "Mudar receita",
  semAlimentos: "Nenhum alimento seu ainda. Crie os que não acha na busca (por 100 g).",
  semReceitas: "Nenhuma receita sua ainda. Junte os ingredientes e diga quantas porções rende.",
  bibliotecaErro: "Não deu para carregar os seus alimentos e receitas.",
  por100: "Valores em 100 g",
  porcaoReferencia: "Porção (g)",
  porcaoReferenciaDica: "O peso de 1 porção — dá para pôr no dia em porções.",
  ingredientes: "Ingredientes",
  adicionarIngrediente: "Adicionar ingrediente",
  semIngredientes: "Adicione pelo menos 1 ingrediente.",
  ingredienteApagado: "Um ingrediente foi apagado: ele sai da receita quando você salvar a lista nova.",
  porPorcao: "Por porção",
  salvar: "Salvar",
  salvando: "Salvando…",
  apagar: "Apagar",
  alimentoSalvo: "Alimento salvo.",
  alimentoApagado: "Alimento apagado.",
  receitaSalva: "Receita salva.",
  receitaApagada: "Receita apagada.",
  alimentoApagarTexto: "Ele sai da sua lista. O que você já pôs nos seus dias continua lá.",
  receitaApagarTexto: "Ela sai da sua lista. O que você já pôs nos seus dias continua lá.",
  extraApagarTexto: "Ela sai do seu dia, com o que você pôs nela.",
  semInternet: "Sem conexão · pôr e tirar alimentos voltam quando a internet voltar.",
} as const;

/** O selo de cada resultado da busca (padrão 11 da spec: as receitas dele, os alimentos dele, os do plano, a TACO). */
export const ROTULO_DA_BUSCA: Record<ItemDaBusca["tipo"], string> = {
  receita: "Sua receita",
  meu: "Seu alimento",
  plano: "Do seu plano",
  taco: "TACO",
};
```

- [ ] **Step 3: Commit** — `feat(w-a): as regras da dieta liberada (quando a tela é "Pode mexer", o dia aplicado na linha e no anel, a quantidade, os formulários)` com
  os 3 arquivos; `feita.sh 1 "regras 9/9" "<placar>"`.

---

### Task 2: As consultas, a busca e as folhas (TDD)

**Files:** Create `src/dieta-livre/useDietaLivre.ts`, `src/dieta-livre/useDiaLivre.ts`, `src/dieta-livre/ui/ItensDoDia.tsx`, `src/dieta-livre/ui/BuscaDeAlimentos.tsx`,
`src/dieta-livre/ui/FolhaAdicionar.tsx`, `src/dieta-livre/ui/FolhaExtra.tsx`, `src/dieta-livre/ui/FolhaMeusAlimentos.tsx`, `src/dieta-livre/ui/FolhaMeusAlimentos.test.tsx`,
`src/dieta-livre/ui/DiaLivre.tsx`.
**Estimativa:** 20 min (calibrado 3–5).

- [ ] **Step 1: O teste (vermelho)** — `cd ~/projetos/physiqcalc-wa-p5 && bash ~/projetos/physiqcalc-scratch/w-a/p5/copiar.sh src/dieta-livre/ui/FolhaMeusAlimentos.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh src/dieta-livre/ui/FolhaMeusAlimentos.test.tsx`
  → FAIL `Failed to resolve import "../useDietaLivre"`.

`src/dieta-livre/ui/FolhaMeusAlimentos.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// W-A P5 — "Meus alimentos e receitas" (spec §4.4, P6: só dele): a folha com a lista, o alimento por 100 g e a receita (ingredientes da busca,
// porções), pela aluno-dia falsa (a invoke leva ao h.gravar; as leituras devolvem o "banco" do teste).
const h = vi.hoisted(() => {
  const h = {
    biblioteca: { alimentos: [] as unknown[], receitas: [] as unknown[] },
    busca: [] as unknown[],
    gravar: vi.fn(),
    toastOk: vi.fn(),
    toastErro: vi.fn(),
    invocar: async (nome: string, o: { body: Record<string, unknown> }) => {
      const b = o.body;
      if (nome !== "aluno-dia") throw new Error(`chamada inesperada: ${nome}`);
      if (b.acao === "ler" && b.q === "biblioteca") return { data: { ok: true, ...h.biblioteca }, error: null };
      if (b.acao === "ler" && b.q === "alimentos") return { data: { ok: true, pagina: 0, tem_mais: false, itens: h.busca }, error: null };
      if (b.acao === "ler") return { data: { ok: true, dia: "2026-09-30", hoje: "2026-09-30", pode_gravar: true, matriculas: [], plano_ativo: null, extras: [], itens: [] }, error: null };
      return { data: { ok: true, ...(await h.gravar(b.acao, b)) }, error: null };
    },
  };
  return h;
});
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-diego" } }) }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => h.toastOk(...a), info: vi.fn(), error: (...a: unknown[]) => h.toastErro(...a) } }));
vi.mock("@/integrations/principal/client", () => ({
  principalConfigurado: true,
  PRINCIPAL_SCHEMA: "public",
  principal: { functions: { invoke: (nome: string, o: { body: Record<string, unknown> }) => h.invocar(nome, o) } },
}));

import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import { useGravarNoDia } from "../useDietaLivre";
import { FolhaMeusAlimentos } from "./FolhaMeusAlimentos";

function Folha() {
  const g = useGravarNoDia();
  return <FolhaMeusAlimentos aberta aoMudar={() => {}} ocupado={g.ocupado} desligado={false} gravar={g.gravar} />;
}
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <Folha />
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const achar = <T extends HTMLElement = HTMLElement>(seletor: string, timeout = 3000) =>
  waitFor(() => {
    const el = document.querySelector(seletor);
    if (!el) throw new Error(`sem ${seletor}`);
    return el as T;
  }, { timeout });
const lista = () => achar('[data-folha-meus="lista"] [data-meus-estado="lista"]');

beforeEach(() => {
  h.biblioteca = { alimentos: [], receitas: [] };
  h.busca = [];
  h.gravar.mockReset();
  h.toastOk.mockReset();
  h.toastErro.mockReset();
});

describe("W-A P5 — Meus alimentos e receitas", () => {
  it("cria um alimento por 100 g: sem nome não vai; com nome, o alimento_salvar com a porção e os 5 valores (vazio = 0)", async () => {
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "alimento_salvar") return { alimento: {} };
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    await lista();
    expect(screen.getByText(/Nenhum alimento seu ainda/)).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-meus-novo-alimento]")!);
    const nome = await achar<HTMLInputElement>("[data-alimento-nome]");
    fireEvent.click(document.querySelector("[data-alimento-salvar]")!);
    await waitFor(() => expect(nome.getAttribute("aria-invalid")).toBe("true"));
    fireEvent.change(nome, { target: { value: "Pão da padaria" } });
    fireEvent.change(document.querySelector('[data-alimento-porcao]')!, { target: { value: "50" } });
    fireEvent.change(document.querySelector('[data-alimento-macro="energia_kcal"]')!, { target: { value: "280" } });
    fireEvent.change(document.querySelector('[data-alimento-macro="proteina_g"]')!, { target: { value: "9,5" } });
    fireEvent.click(document.querySelector("[data-alimento-salvar]")!);
    await waitFor(() =>
      expect(h.gravar).toHaveBeenCalledWith("alimento_salvar", expect.objectContaining({
        id: null, dados: { nome: "Pão da padaria", porcao_g: 50, energia_kcal: 280, proteina_g: 9.5, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0 },
      })),
    );
    await lista();
    expect(h.toastOk).toHaveBeenCalledWith("Alimento salvo.");
  });

  it("cria uma receita: o ingrediente vem da busca (sem as receitas), em gramas; as porções; os macros de 1 porção antes de salvar", async () => {
    h.busca = [
      { tipo: "receita", id: "rc-velha", nome: "Arroz da vó", porcao_g: null, energia_kcal: 300, proteina_g: 5, carboidrato_g: 50, lipidio_g: 5, fibra_g: 1 },
      { tipo: "taco", id: "taco-arroz", nome: "Arroz, tipo 1, cozido", porcao_g: 100, energia_kcal: 128.26, proteina_g: 2.52, carboidrato_g: 28.06, lipidio_g: 0.23, fibra_g: 1.56 },
    ];
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "receita_salvar") return { receita: {} };
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    await lista();
    fireEvent.click(screen.getByRole("radio", { name: /Receitas/ }));
    fireEvent.click(await achar("[data-meus-nova-receita]"));
    fireEvent.change(await achar("[data-receita-nome]"), { target: { value: "Arroz de forno" } });
    fireEvent.change(document.querySelector("[data-busca-termo]")!, { target: { value: "arroz" } });
    await achar('[data-busca-item="taco-arroz"]');
    expect(document.querySelector('[data-busca-item="rc-velha"]')).toBeNull();
    fireEvent.click(document.querySelector('[data-busca-item="taco-arroz"]')!);
    const qtd = await achar<HTMLInputElement>('[data-receita-item-qtd="novo-0"]');
    expect(qtd.value).toBe("100");
    fireEvent.change(qtd, { target: { value: "400" } });
    fireEvent.change(document.querySelector("[data-receita-porcoes]")!, { target: { value: "2" } });
    // 128,26 × 4 = 513,04 → 256,52 a porção
    expect(document.querySelector("[data-receita-por-porcao]")!.getAttribute("data-receita-por-porcao")).toBe("257");
    fireEvent.click(document.querySelector("[data-receita-salvar]")!);
    await waitFor(() =>
      expect(h.gravar).toHaveBeenCalledWith("receita_salvar", expect.objectContaining({
        id: null, dados: { nome: "Arroz de forno", porcoes: 2, itens: [{ alimento_id: "taco-arroz", quantidade_g: 400 }] },
      })),
    );
  });

  it("apaga um alimento dele com a confirmação do app (o que já pôs nos dias continua)", async () => {
    h.biblioteca = { alimentos: [{ id: "meu-pao", nome: "Pão da padaria", porcao_g: 50, energia_kcal: 280, proteina_g: 9, carboidrato_g: 50, lipidio_g: 3, fibra_g: 2, criado_em: "", alterado_em: "" }], receitas: [] };
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "alimento_excluir") return {};
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    fireEvent.click(await achar('[data-meu-alimento="meu-pao"]'));
    expect((await achar<HTMLInputElement>("[data-alimento-nome]")).value).toBe("Pão da padaria");
    fireEvent.click(document.querySelector("[data-alimento-apagar]")!);
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Ele sai da sua lista. O que você já pôs nos seus dias continua lá.")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("alimento_excluir", expect.objectContaining({ id: "meu-pao" })));
  });
});
```

- [ ] **Step 2: As consultas, a busca e as folhas (verde)** — `cd ~/projetos/physiqcalc-wa-p5 && bash ~/projetos/physiqcalc-scratch/w-a/p5/copiar.sh src/dieta-livre/useDietaLivre.ts src/dieta-livre/useDiaLivre.ts src/dieta-livre/ui/ItensDoDia.tsx src/dieta-livre/ui/BuscaDeAlimentos.tsx src/dieta-livre/ui/FolhaAdicionar.tsx src/dieta-livre/ui/FolhaExtra.tsx src/dieta-livre/ui/FolhaMeusAlimentos.tsx src/dieta-livre/ui/DiaLivre.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh src/dieta-livre/ui/FolhaMeusAlimentos.test.tsx src/dieta-livre/regras.test.ts`
  → `Test Files 2 passed` · `Tests 12 passed (12)` (3 + 9). (O resto das peças — a lista do dia, a busca do dia, a extra, as folhas na aba — é provado pela aba na Task 3.)

`src/dieta-livre/useDietaLivre.ts`:
```ts
// Physiq W-A P5 — a dieta liberada no React Query (spec W-A §4.4, §5.2): o dia de HOJE (aluno-dia { acao: "ler", q: "dia" } — o meu_dia lê
// mesmo travada e diz, por matrícula, se está liberada), a biblioteca dele (q: "biblioteca") e a busca (q: "alimentos", 20 por página). As
// gravações vão uma por vez pelo useGravarNoDia: deu certo → relê o dia (e a biblioteca, quando mexeu nela); a Dieta travou no meio (409
// dieta_travada) → o toast "A sua dieta voltou a ser só para ver." e relê: a tela volta ao "só ver" (quem chama fecha a folha no `aoTravar`).
// Nada fala com o banco daqui: só a porta da aluno-dia (src/aluno-dia/api.ts; a guarda src/aluno-dia/semBancoDireto.test.ts lê esta pasta).
import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buscarAlimentosDoAluno, ErroAlunoDia, lerMeuDia, lerMinhaBiblioteca, mensagemErroAlunoDia } from "@/aluno-dia/api";
import { useSessao } from "@/nucleo/sessao";
import { LIMITES_DO_DIA } from "./regras";

export const CHAVE_DIA_LIVRE = "dieta-livre-dia";
export const CHAVE_BIBLIOTECA = "dieta-livre-biblioteca";
export const CHAVE_BUSCA = "dieta-livre-busca";

/** A frase fixa do erro (a do código da função; nunca a mensagem crua). */
export const fraseDoErro = (e: unknown): string => (e instanceof ErroAlunoDia ? e.message : mensagemErroAlunoDia(null));
/** A Dieta voltou a "Só ver" no meio (a nutri travou com a tela aberta). */
export const travou = (e: unknown): boolean => e instanceof ErroAlunoDia && e.codigo === "dieta_travada";

/** O dia de hoje dele (lê mesmo travada). `ativo` = a tela tem um plano atual para mostrar. */
export function useMeuDia(hoje: string, ativo: boolean) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useQuery({
    queryKey: [CHAVE_DIA_LIVRE, uid, hoje],
    queryFn: () => lerMeuDia(hoje),
    enabled: Boolean(uid) && ativo,
    staleTime: 30_000,
    // a nova tentativa é a do app (1, com 1 s — src/integrations/consultas.ts); sem rede, espera ela voltar
    networkMode: "online",
    refetchOnWindowFocus: true,
  });
}

/** Os alimentos e as receitas dele (só quando a folha "Meus alimentos e receitas" está aberta). */
export function useMinhaBiblioteca(ativo: boolean) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useQuery({
    queryKey: [CHAVE_BIBLIOTECA, uid],
    queryFn: () => lerMinhaBiblioteca(),
    enabled: Boolean(uid) && ativo,
    staleTime: 60_000,
    networkMode: "online",
  });
}

/** O termo depois de `ms` sem digitar (a busca não vai a cada letra). */
export function useAtrasado<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

/** O termo como o banco mede (aparado; espaços seguidos viram 1). */
export const termoDaBusca = (termo: string): string => termo.trim().replace(/\s+/g, " ").slice(0, LIMITES_DO_DIA.termo);

/** A busca do aluno (TACO, os dele, os dos planos dele, as receitas dele), 20 por página, a partir de 2 letras. */
export function useBuscaDoAluno(termo: string, ativo: boolean) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const t = termoDaBusca(termo);
  return useInfiniteQuery({
    queryKey: [CHAVE_BUSCA, uid, t],
    queryFn: ({ pageParam }) => buscarAlimentosDoAluno(t, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima) => (ultima.tem_mais && ultima.pagina < 50 ? ultima.pagina + 1 : undefined),
    enabled: Boolean(uid) && ativo && t.length >= LIMITES_DO_DIA.termoMinimo,
    staleTime: 60_000,
    networkMode: "online",
  });
}

export interface Gravacao {
  /** quem está gravando (o botão que gira): "tirar:<item>", "extra-nova"… */
  chave: string;
  fazer: () => Promise<unknown>;
  /** mexeu nos alimentos/receitas dele: relê a biblioteca e a busca também */
  biblioteca?: boolean;
  /** o toast de sucesso (sem = nenhum) */
  ok?: string;
}

/** Uma gravação por vez; o resultado é true/false (o erro já virou toast). `aoTravar` = a Dieta voltou a "Só ver" no meio. */
export function useGravarNoDia(aoTravar?: () => void) {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const m = useMutation({
    mutationFn: (g: Gravacao) => g.fazer(),
    networkMode: "online",
    retry: 0,
    onSuccess: (_d, g) => {
      if (g.ok) toast.success(g.ok);
    },
    onError: (e) => {
      if (travou(e)) {
        toast.error(mensagemErroAlunoDia("dieta_travada"));
        aoTravar?.();
      } else toast.error(fraseDoErro(e));
    },
    onSettled: async (_d, _e, g) => {
      await qc.invalidateQueries({ queryKey: [CHAVE_DIA_LIVRE, uid] });
      if (g.biblioteca) {
        await qc.invalidateQueries({ queryKey: [CHAVE_BIBLIOTECA, uid] });
        void qc.invalidateQueries({ queryKey: [CHAVE_BUSCA, uid] });
      }
    },
  });
  return {
    gravar: (g: Gravacao): Promise<boolean> => m.mutateAsync(g).then(() => true, () => false),
    ocupado: m.isPending ? m.variables?.chave ?? null : null,
  };
}
```

`src/dieta-livre/useDiaLivre.ts`:
```ts
// Physiq W-A P5 — o que a aba Dieta precisa para a tela "Pode mexer" (spec §4.4): lê o dia de hoje (useMeuDia), decide se a tela está liberada
// (estadoDaDietaLivre: a matrícula do plano que a tela mostra; só hoje e no plano atual — outro dia e plano anterior seguem "só para ver", como
// hoje) e aplica o dia sobre o plano (diaAplicado da P2: os riscados, os que ele pôs, as extras e os totais). Travada = nada daqui aparece.
import { useMemo } from "react";
import { diaAplicado, type DiaAplicado, type RefeicaoNoDia } from "@/aluno-dia/regras";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { diaDaMatricula, estadoDaDietaLivre } from "./regras";
import { useGravarNoDia, useMeuDia, type Gravacao } from "./useDietaLivre";

export interface DiaLivre {
  /** o data-* da aba (os E2E esperam o "travada" de verdade, não o "ainda lendo"): sem plano atual · lendo · travada · liberada */
  estado: "sem" | "lendo" | "travada" | "liberada";
  /** a tela é "Pode mexer" (hoje, no plano atual, com a matrícula do plano liberada) */
  liberada: boolean;
  /** dá para criar refeição extra (a matrícula do plano ativo é a da tela) */
  extra: boolean;
  /** o dia aplicado sobre o plano (null = travada) */
  aplicado: DiaAplicado | null;
  /** a refeição do plano NO DIA, pelo id */
  noDia: ReadonlyMap<string, RefeicaoNoDia>;
  gravar: (g: Gravacao) => Promise<boolean>;
  ocupado: string | null;
}

export function useDiaLivre({ plano, ehAtual, hoje, marcavelHoje, concluidas, aoTravar }: {
  plano: PlanoAlimentar | null;
  ehAtual: boolean;
  hoje: string;
  marcavelHoje: boolean;
  concluidas: ReadonlySet<string>;
  /** a Dieta voltou a "Só ver" no meio de uma gravação (fecha a folha aberta) */
  aoTravar: () => void;
}): DiaLivre {
  const ativo = !!plano && ehAtual;
  const q = useMeuDia(hoje, ativo);
  const estado = estadoDaDietaLivre(q.data, plano?.paciente_id, hoje);
  const liberada = estado.liberada && marcavelHoje;
  const aplicado = useMemo(
    () => (liberada && q.data && plano ? diaAplicado(plano, diaDaMatricula(q.data, plano.paciente_id), concluidas) : null),
    [liberada, q.data, plano, concluidas],
  );
  const noDia = useMemo(() => new Map((aplicado?.refeicoes ?? []).map((r) => [r.refeicao.id, r])), [aplicado]);
  const g = useGravarNoDia(aoTravar);
  const marca = !ativo ? "sem" : liberada ? "liberada" : !q.data && !q.isError ? "lendo" : "travada";
  return { estado: marca, liberada, extra: liberada && estado.extra, aplicado, noDia, gravar: g.gravar, ocupado: g.ocupado };
}
```

`src/dieta-livre/ui/ItensDoDia.tsx`:
```tsx
// Physiq W-A P5 — a lista do DIA dentro da folha da refeição (spec §4.4): cada item do plano com "Tirar hoje" (fica riscado, com "Voltar"), os
// que ele pôs com o selo "você pôs" e "Tirar", e embaixo "Adicionar alimento". A mesma peça serve a refeição extra (só os que ele pôs). Os
// substitutos e as observações do plano continuam como na folha de hoje. Sem internet ou com uma gravação correndo, os botões ficam desligados.
import { LoaderCircle, Plus, Repeat, RotateCcw, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { macrosDoRetrato, type ItemDoPlanoNoDia } from "@/aluno-dia/regras";
import type { ItemDoDia } from "@/aluno-dia/tipos";
import { descricaoQuantidade, descricaoSubstituto, fmtKcal, lerSubstitutos, macrosDoItem } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { quantidadeDoItemDoDia } from "../regras";
import { TEXTOS } from "../textos";

function BotaoDaLinha({ rotulo, icone: Icone, girando, desligado, onClick, ...props }: {
  rotulo: string;
  icone: LucideIcon;
  girando: boolean;
  desligado: boolean;
  onClick: () => void;
} & Record<`data-${string}`, string>) {
  return (
    <button type="button" onClick={onClick} disabled={desligado} {...props}
      className="flex h-8 flex-none items-center gap-1 rounded-[10px] border border-linha bg-superficie-2 px-2.5 text-[12px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:opacity-50">
      {girando ? <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Icone aria-hidden className="h-3.5 w-3.5" />}
      {rotulo}
    </button>
  );
}

export function ItensDoDia({
  itensDoPlano,
  adicionados,
  ocupado,
  desligado,
  podeAdicionar,
  aviso,
  vazio = "Sem alimentos nesta refeição.",
  aoTirarDoPlano,
  aoVoltar,
  aoAdicionar,
}: {
  itensDoPlano: ItemDoPlanoNoDia[];
  adicionados: ItemDoDia[];
  /** a chave da gravação que está correndo (useGravarNoDia), ou null */
  ocupado: string | null;
  desligado: boolean;
  podeAdicionar: boolean;
  aviso?: string | null;
  vazio?: string;
  aoTirarDoPlano?: (itemDoPlano: string) => void;
  /** desfaz um registro do dia: o "tirei" (o item do plano volta) ou o "pus" (o que ele pôs sai) */
  aoVoltar: (itemDoDia: string) => void;
  aoAdicionar: () => void;
}) {
  const travado = desligado || !!ocupado;
  const total = itensDoPlano.length + adicionados.length;
  return (
    <div className="flex flex-col gap-3" data-dieta-livre-itens={total}>
      {total === 0 ? (
        <p className="rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] italic text-texto-3" data-refeicao-vazia>{vazio}</p>
      ) : (
        <ul className="divide-y divide-linha-3 rounded-2xl border border-linha bg-superficie px-3.5" data-folha-itens={total}>
          {itensDoPlano.map(({ item, tirado }) => {
            const subs = lerSubstitutos(item.substitutos);
            const m = macrosDoItem(item);
            return (
              <li key={item.id} className="py-2.5" data-item={item.id} data-item-tirado={tirado ? "1" : "0"}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13.5px] font-medium", tirado ? "text-texto-3 line-through" : "text-texto")} data-item-nome>
                      {item.alimento?.nome ?? "Alimento"}
                    </span>
                    <span className="block text-[12px] text-texto-2" data-item-qtd>
                      {tirado ? `${TEXTOS.tiradoHoje} · ` : ""}{descricaoQuantidade(item)} · {fmtKcal(m.energia_kcal)} kcal
                    </span>
                  </span>
                  {tirado ? (
                    <BotaoDaLinha rotulo={TEXTOS.voltar} icone={RotateCcw} girando={ocupado === `voltar:${tirado.id}`} desligado={travado}
                      onClick={() => aoVoltar(tirado.id)} data-item-voltar={item.id} />
                  ) : aoTirarDoPlano ? (
                    <BotaoDaLinha rotulo={TEXTOS.tirarHoje} icone={X} girando={ocupado === `tirar:${item.id}`} desligado={travado}
                      onClick={() => aoTirarDoPlano(item.id)} data-item-tirar={item.id} />
                  ) : null}
                </div>
                {subs.length > 0 && !tirado && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-verde-3" data-item-substitutos={subs.length}>
                    <Repeat aria-hidden className="mt-[2px] h-3.5 w-3.5 flex-none" strokeWidth={2} />
                    <span>ou {subs.map(descricaoSubstituto).join(" · ")}</span>
                  </div>
                )}
                {item.observacao?.trim() && !tirado && <p className="mt-1 text-[12px] italic text-texto-3">{item.observacao.trim()}</p>}
              </li>
            );
          })}
          {adicionados.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2.5" data-item-posto={i.id}>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-texto" data-item-nome>{i.nome}</span>
                  <Chip tom="n" className="flex-none" data-item-selo>{TEXTOS.vocePos}</Chip>
                </span>
                <span className="block text-[12px] text-texto-2" data-item-qtd>
                  {quantidadeDoItemDoDia(i)} · {fmtKcal(macrosDoRetrato(i).energia_kcal)} kcal
                </span>
              </span>
              <BotaoDaLinha rotulo={TEXTOS.tirar} icone={X} girando={ocupado === `voltar:${i.id}`} desligado={travado}
                onClick={() => aoVoltar(i.id)} data-item-posto-tirar={i.id} />
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="text-[12.5px] leading-snug text-texto-2" data-dieta-livre-aviso>{aviso}</p>}
      {podeAdicionar && (
        <Botao variante="g" icone={Plus} onClick={aoAdicionar} disabled={travado} data-dieta-adicionar>{TEXTOS.adicionar}</Botao>
      )}
    </div>
  );
}
```

`src/dieta-livre/ui/BuscaDeAlimentos.tsx`:
```tsx
// Physiq W-A P5 — a busca do aluno (padrão 11 da spec): as receitas dele, os alimentos dele, os dos planos dele e a TACO, 20 por página, a partir
// de 2 letras (300 ms depois de parar de digitar). Serve o "Adicionar alimento" do dia e os ingredientes da receita (sem as receitas). Tocar
// num resultado = escolher. Erro → a frase e "Tentar de novo"; nada achado → o vazio.
import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { ItemDaBusca } from "@/aluno-dia/tipos";
import { Campo } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { LIMITES_DO_DIA, linhaDaBusca } from "../regras";
import { ROTULO_DA_BUSCA, TEXTOS } from "../textos";
import { termoDaBusca, useAtrasado, useBuscaDoAluno } from "../useDietaLivre";

const TOM_DA_BUSCA: Record<ItemDaBusca["tipo"], "n" | "c" | "t" | "g"> = { receita: "t", meu: "n", plano: "c", taco: "g" };

export function BuscaDeAlimentos({ ativo, semReceitas = false, aoEscolher }: { ativo: boolean; semReceitas?: boolean; aoEscolher: (i: ItemDaBusca) => void }) {
  const [termo, setTermo] = useState("");
  const atrasado = useAtrasado(termo, 300);
  const busca = useBuscaDoAluno(atrasado, ativo);
  const curto = termoDaBusca(atrasado).length < LIMITES_DO_DIA.termoMinimo;
  const itens = (busca.data?.pages ?? []).flatMap((p) => p.itens).filter((i) => !semReceitas || i.tipo !== "receita");

  let lista: React.ReactNode;
  if (curto) lista = <p className="text-[12.5px] text-texto-3" data-busca-estado="curto">{TEXTOS.buscarDica}</p>;
  else if (busca.isError && !busca.data) {
    lista = (
      <span className="flex items-center justify-between gap-3" data-busca-estado="erro">
        <span className="text-[12.5px] text-texto-2">{TEXTOS.buscarErro}</span>
        <Botao tamanho="sm" icone={RefreshCw} onClick={() => void busca.refetch()}>Tentar de novo</Botao>
      </span>
    );
  } else if (!busca.data) {
    lista = (
      <div role="status" aria-busy="true" aria-label="Buscando" className="flex flex-col gap-2" data-busca-estado="carregando">
        {[0, 1, 2].map((i) => <Esqueleto key={i} className="h-11 w-full rounded-xl" />)}
      </div>
    );
  } else if (itens.length === 0) lista = <p className="text-[12.5px] text-texto-3" data-busca-estado="vazio">{TEXTOS.buscarNada}</p>;
  else {
    lista = (
      <ul className="flex flex-col gap-1.5" data-busca-estado="lista" data-busca-itens={itens.length}>
        {itens.map((i) => (
          <li key={`${i.tipo}:${i.id}`}>
            <button type="button" onClick={() => aoEscolher(i)} data-busca-item={i.id} data-busca-tipo={i.tipo}
              className="flex w-full items-center gap-3 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-left transition-colors hover:border-linha-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-texto">{i.nome}</span>
                <span className="block truncate text-[11.5px] text-texto-3">{linhaDaBusca(i, ROTULO_DA_BUSCA[i.tipo])}</span>
              </span>
              <Chip tom={TOM_DA_BUSCA[i.tipo]} className="flex-none">{i.tipo === "taco" ? "TACO" : i.tipo === "receita" ? "receita" : i.tipo === "meu" ? "seu" : "plano"}</Chip>
            </button>
          </li>
        ))}
        {busca.hasNextPage && (
          <li>
            <Botao variante="g" tamanho="sm" className="w-full" onClick={() => void busca.fetchNextPage()} disabled={busca.isFetchingNextPage} data-busca-mais>
              {busca.isFetchingNextPage ? "Buscando…" : TEXTOS.verMais}
            </Botao>
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-busca-alimentos={semReceitas ? "ingrediente" : "dia"}>
      <span className="relative">
        <Campo rotulo={TEXTOS.buscar} value={termo} onChange={(e) => setTermo(e.target.value)} maxLength={LIMITES_DO_DIA.termo} autoComplete="off"
          enterKeyHint="search" placeholder={TEXTOS.buscarPlaceholder} className="pl-10" data-busca-termo />
        <Search aria-hidden className="pointer-events-none absolute bottom-[15px] left-3.5 h-4 w-4 text-texto-3" strokeWidth={1.75} />
      </span>
      {lista}
    </div>
  );
}
```

`src/dieta-livre/ui/FolhaAdicionar.tsx`:
```tsx
// Physiq W-A P5 — "Adicionar alimento" (spec §4.4): a busca (TACO, os dele, os do plano, as receitas dele) → a quantidade (o alimento em gramas
// ou em porções da porção de referência; a receita em porções), com as kcal e os macros antes de pôr → "Pôr no dia" (dia_adicionar, na
// refeição do plano ou na extra). O lugar vem de quem abriu; a matrícula do dia o servidor decide.
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { DadosDoItemDoDia } from "@/aluno-dia/tipos";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { fmtQtd } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { dadosDaEscolha, escolhaInicial, macrosDaEscolha, textoDosMacros, unidadesDe, type Escolha, type Lugar, type Unidade } from "../regras";
import { ROTULO_DA_BUSCA, TEXTOS } from "../textos";
import { BuscaDeAlimentos } from "./BuscaDeAlimentos";

export function FolhaAdicionar({
  aberta,
  aoMudar,
  lugar,
  ocupado,
  desligado,
  aoPor,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  lugar: Lugar | null;
  ocupado: boolean;
  desligado: boolean;
  /** grava (dia_adicionar) e devolve se deu certo — quem chama volta para a refeição */
  aoPor: (dados: DadosDoItemDoDia) => Promise<boolean>;
}) {
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberta) return;
    setEscolha(null);
    setErro(null);
  }, [aberta, lugar?.id]);

  const por = async () => {
    if (!escolha || !lugar) return;
    const d = dadosDaEscolha(lugar, escolha);
    if (d.ok === false) {
      setErro(d.erro);
      return;
    }
    await aoPor(d.dados);
  };

  const unidades = escolha ? unidadesDe(escolha.item) : [];
  const macros = escolha ? macrosDaEscolha(escolha) : null;
  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={TEXTOS.adicionar} descricao={lugar ? `Em ${lugar.nome} · só no seu dia` : undefined}>
      <div className="flex flex-col gap-4 pt-1" data-folha-adicionar={lugar?.tipo ?? ""} data-folha-adicionar-passo={escolha ? "quantidade" : "busca"}>
        {!escolha ? (
          <BuscaDeAlimentos ativo={aberta} aoEscolher={(i) => { setEscolha(escolhaInicial(i)); setErro(null); }} />
        ) : (
          <>
            <div className="rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-escolha={escolha.item.id} data-escolha-tipo={escolha.item.tipo}>
              <span className="block text-[11.5px] text-texto-3">{ROTULO_DA_BUSCA[escolha.item.tipo]}</span>
              <b className="block text-[14px] font-semibold text-texto">{escolha.item.nome}</b>
            </div>
            {unidades.length > 1 && (
              <Segmentado<Unidade> rotulo="Unidade" className="self-start" valor={escolha.unidade}
                opcoes={[{ valor: "g", rotulo: TEXTOS.gramas }, { valor: "porcao", rotulo: `${TEXTOS.porcoes} (${fmtQtd(Number(escolha.item.porcao_g))} g)` }]}
                aoMudar={(u) => { setEscolha({ ...escolha, unidade: u, quantidade: u === "porcao" ? "1" : fmtQtd(Number(escolha.item.porcao_g) || 100) }); setErro(null); }} />
            )}
            <Campo rotulo={escolha.unidade === "porcao" ? TEXTOS.porcoes : `${TEXTOS.quantidade} (g)`} inputMode="decimal" autoComplete="off"
              value={escolha.quantidade} onChange={(e) => { setEscolha({ ...escolha, quantidade: e.target.value }); setErro(null); }}
              erro={erro ?? undefined} data-quantidade />
            <p className="text-[12.5px] text-texto-2" data-quantidade-macros={macros ? Math.round(macros.energia_kcal) : ""}>≈ {textoDosMacros(macros)}</p>
            {erro === null && desligado && <MensagemForm tom="aviso">{TEXTOS.semInternet}</MensagemForm>}
            <div className="flex gap-2.5">
              <Botao variante="g" icone={ArrowLeft} onClick={() => { setEscolha(null); setErro(null); }} disabled={ocupado} data-escolha-trocar>{TEXTOS.trocar}</Botao>
              <Botao variante="w" icone={Check} className="flex-1" onClick={() => void por()} disabled={ocupado || desligado || !lugar} data-escolha-por>
                {ocupado ? TEXTOS.salvando : TEXTOS.porNoDia}
              </Botao>
            </div>
          </>
        )}
      </div>
    </PainelDeslizante>
  );
}
```

`src/dieta-livre/ui/FolhaExtra.tsx`:
```tsx
// Physiq W-A P5 — a refeição EXTRA (spec §4.4, padrão 10): "Nova refeição" (nome, horário, "Já comi" ligado por padrão — a extra vai para a
// matrícula do plano ativo: o servidor decide) e, aberta, o que ele pôs nela (com "Tirar" e "Adicionar alimento"), o "Já comi" (só o que tem
// "Já comi" conta no anel), "Mudar nome e horário" e "Apagar refeição" (com a confirmação do app). Só hoje; a Dieta travada no meio fecha a
// folha (useGravarNoDia).
import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { dadosDaExtra, formularioDaExtra, totaisDaExtra, validarExtra, type ErroDoCampo, type FormularioDaExtra } from "../regras";
import { desfazerNoDia, excluirExtra, marcarExtra, salvarExtra } from "@/aluno-dia/api";
import type { ExtraNoDia } from "@/aluno-dia/regras";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
import { fmtKcal } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { TEXTOS } from "../textos";
import type { Gravacao } from "../useDietaLivre";
import { ItensDoDia } from "./ItensDoDia";

export function FolhaExtra({
  aberta,
  aoMudar,
  extra,
  hoje,
  ocupado,
  desligado,
  gravar,
  aoAdicionar,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** null = nova */
  extra: ExtraNoDia | null;
  hoje: string;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  /** abre o "Adicionar alimento" nesta extra */
  aoAdicionar: (id: string) => void;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDaExtra>(() => formularioDaExtra(extra?.extra ?? null));
  const [erro, setErro] = useState<ErroDoCampo<"nome" | "horario"> | null>(null);
  const [mudando, setMudando] = useState(false);

  useEffect(() => {
    if (!aberta) return;
    setF(formularioDaExtra(extra?.extra ?? null));
    setErro(null);
    setMudando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomeça ao abrir ou ao trocar de extra (não a cada releitura do dia)
  }, [aberta, extra?.extra.id]);

  const mudar = (p: Partial<FormularioDaExtra>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };
  const travado = desligado || !!ocupado;

  const salvar = async () => {
    const v = validarExtra(f);
    if (v) {
      setErro(v);
      return;
    }
    const id = extra?.extra.id ?? null;
    const ok = await gravar({ chave: id ? `extra:${id}` : "extra-nova", fazer: () => salvarExtra(id, dadosDaExtra(f, id ? null : hoje)),
      ok: id ? TEXTOS.refeicaoSalva : TEXTOS.refeicaoCriada });
    if (ok && !id) aoMudar(false);
    if (ok && id) setMudando(false);
  };

  const apagar = async () => {
    if (!extra) return;
    if (!(await confirmar({ titulo: "Apagar a refeição?", descricao: TEXTOS.extraApagarTexto, rotuloConfirmar: "Apagar", perigo: true }))) return;
    const ok = await gravar({ chave: `extra-apagar:${extra.extra.id}`, fazer: () => excluirExtra(extra.extra.id), ok: TEXTOS.refeicaoApagada });
    if (ok) aoMudar(false);
  };

  const doCampo = (c: "nome" | "horario") => (erro?.campo === c ? erro.mensagem : undefined);
  const formulario = (
    <>
      <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={40} autoComplete="off"
        placeholder="Lanche, sobremesa, ceia…" erro={doCampo("nome")} data-extra-nome />
      <Campo rotulo="Horário (opcional)" type="time" value={f.horario} onChange={(e) => mudar({ horario: e.target.value })} erro={doCampo("horario")} data-extra-horario />
      {!extra && (
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-texto">{TEXTOS.jaComi}</span>
            <span className="block text-[11.5px] leading-snug text-texto-3">{f.ja_comi ? TEXTOS.jaComiDica : TEXTOS.naoComiDica}</span>
          </span>
          <Interruptor ligado={f.ja_comi} aoMudar={(v) => mudar({ ja_comi: v })} rotulo={TEXTOS.jaComi} data-extra-ja-comi={f.ja_comi ? "1" : "0"} />
        </div>
      )}
      {erro && !erro.campo && <MensagemForm>{erro.mensagem}</MensagemForm>}
      <Botao variante="w" onClick={() => void salvar()} disabled={travado} data-extra-salvar>
        {ocupado === "extra-nova" || ocupado === `extra:${extra?.extra.id}` ? TEXTOS.salvando : extra ? TEXTOS.salvar : TEXTOS.criarRefeicao}
      </Botao>
    </>
  );

  const t = extra ? totaisDaExtra(extra) : null;
  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={extra ? extra.extra.nome : TEXTOS.novaRefeicao}
      descricao={extra ? [extra.extra.horario, t && t.itens ? `${fmtKcal(t.energia_kcal)} kcal` : null, "refeição extra"].filter(Boolean).join(" · ") : "Só no seu dia — o plano não muda."}>
      <div className="flex flex-col gap-4 pt-1" data-folha-extra={extra ? extra.extra.id : "nova"}>
        {!extra || mudando ? (
          formulario
        ) : (
          <>
            <ItensDoDia itensDoPlano={[]} adicionados={extra.adicionados} ocupado={ocupado} desligado={desligado} podeAdicionar vazio={TEXTOS.nadaNaExtra}
              aoVoltar={(id) => void gravar({ chave: `voltar:${id}`, fazer: () => desfazerNoDia(id) })} aoAdicionar={() => aoAdicionar(extra.extra.id)} />
            <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-texto">{TEXTOS.jaComi}</span>
                <span className="block text-[11.5px] leading-snug text-texto-3">{extra.concluida ? TEXTOS.jaComiDica : TEXTOS.naoComiDica}</span>
              </span>
              <Interruptor ligado={extra.concluida} rotulo={TEXTOS.jaComi} desligado={travado} data-extra-feita={extra.concluida ? "1" : "0"}
                aoMudar={(v) => void gravar({ chave: `extra-marcar:${extra.extra.id}`, fazer: () => marcarExtra(extra.extra.id, v) })} />
            </div>
            <div className="flex gap-2.5">
              <Botao variante="g" icone={Pencil} className="flex-1" onClick={() => setMudando(true)} disabled={travado} data-extra-mudar>{TEXTOS.mudarRefeicao}</Botao>
              <button type="button" onClick={() => void apagar()} disabled={travado} data-extra-apagar
                className="pq-botao flex-1 border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
                <Trash2 aria-hidden /> {TEXTOS.apagarRefeicao}
              </button>
            </div>
          </>
        )}
      </div>
    </PainelDeslizante>
  );
}
```

`src/dieta-livre/ui/FolhaMeusAlimentos.tsx`:
```tsx
// Physiq W-A P5 — "Meus alimentos e receitas" (spec §4.4, P6: só DELE — não entram na base da nutri): a lista (Alimentos · Receitas), criar,
// mudar e apagar o alimento por 100 g (com a porção de referência) e a receita (os ingredientes em gramas, achados na busca, e quantas
// porções rende; os macros de 1 porção antes de salvar). Apagar = lixeira, com a confirmação do app: o que ele já pôs nos dias segue pelo
// retrato. Tudo na mesma folha (a lista ↔ o formulário).
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { excluirAlimento, excluirReceita, salvarAlimento, salvarReceita } from "@/aluno-dia/api";
import type { MeuAlimento, MinhaReceita } from "@/aluno-dia/tipos";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { fmtKcal } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { Esqueleto } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import {
  MACROS_DO_ALIMENTO, dadosDaReceita, dadosDoAlimento, formularioDaReceita, formularioDoAlimento, ingredienteDaBusca, macrosDaReceitaNoFormulario,
  textoDosMacros, validarAlimento, validarReceita, type CampoDaReceita, type CampoDoAlimento, type ErroDoCampo, type FormularioDaReceita,
  type FormularioDoAlimento,
} from "../regras";
import { TEXTOS } from "../textos";
import { useMinhaBiblioteca, type Gravacao } from "../useDietaLivre";
import { BuscaDeAlimentos } from "./BuscaDeAlimentos";

type Vista = { tipo: "lista" } | { tipo: "alimento"; alimento: MeuAlimento | null } | { tipo: "receita"; receita: MinhaReceita | null };
type Aba = "alimentos" | "receitas";

function FormAlimento({ alimento, ocupado, desligado, gravar, aoVoltar }: {
  alimento: MeuAlimento | null;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  aoVoltar: () => void;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDoAlimento>(() => formularioDoAlimento(alimento));
  const [erro, setErro] = useState<ErroDoCampo<CampoDoAlimento> | null>(null);
  const mudar = (p: Partial<FormularioDoAlimento>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };
  const travado = desligado || !!ocupado;
  const salvar = async () => {
    const v = validarAlimento(f);
    if (v) {
      setErro(v);
      return;
    }
    const id = alimento?.id ?? null;
    if (await gravar({ chave: "alimento", fazer: () => salvarAlimento(id, dadosDoAlimento(f)), biblioteca: true, ok: TEXTOS.alimentoSalvo })) aoVoltar();
  };
  const apagar = async () => {
    if (!alimento) return;
    if (!(await confirmar({ titulo: "Apagar o alimento?", descricao: TEXTOS.alimentoApagarTexto, rotuloConfirmar: "Apagar", perigo: true }))) return;
    if (await gravar({ chave: "alimento-apagar", fazer: () => excluirAlimento(alimento.id), biblioteca: true, ok: TEXTOS.alimentoApagado })) aoVoltar();
  };
  const doCampo = (c: CampoDoAlimento) => (erro?.campo === c ? erro.mensagem : undefined);
  return (
    <div className="flex flex-col gap-4" data-form-alimento={alimento ? alimento.id : "novo"}>
      <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={80} autoComplete="off"
        placeholder="Pão da padaria, whey da marca X…" erro={doCampo("nome")} data-alimento-nome />
      <Campo rotulo={TEXTOS.porcaoReferencia} inputMode="decimal" value={f.porcao_g} onChange={(e) => mudar({ porcao_g: e.target.value })}
        dica={TEXTOS.porcaoReferenciaDica} erro={doCampo("porcao_g")} data-alimento-porcao />
      <span className="text-[12.5px] font-semibold text-texto-2">{TEXTOS.por100}</span>
      <div className="grid grid-cols-2 gap-3">
        {MACROS_DO_ALIMENTO.map((m) => (
          <Campo key={m.chave} rotulo={m.rotulo} inputMode="decimal" value={f[m.chave]} placeholder="0" onChange={(e) => mudar({ [m.chave]: e.target.value })}
            erro={doCampo(m.chave)} data-alimento-macro={m.chave} />
        ))}
      </div>
      {erro && !erro.campo && <MensagemForm>{erro.mensagem}</MensagemForm>}
      <Botao variante="w" onClick={() => void salvar()} disabled={travado} data-alimento-salvar>{ocupado === "alimento" ? TEXTOS.salvando : TEXTOS.salvar}</Botao>
      {alimento && (
        <button type="button" onClick={() => void apagar()} disabled={travado} data-alimento-apagar
          className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
          <Trash2 aria-hidden /> {TEXTOS.apagar}
        </button>
      )}
    </div>
  );
}

function FormReceita({ receita, ocupado, desligado, gravar, aoVoltar }: {
  receita: MinhaReceita | null;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  aoVoltar: () => void;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDaReceita>(() => formularioDaReceita(receita));
  const [erro, setErro] = useState<ErroDoCampo<CampoDaReceita> | null>(null);
  const [buscando, setBuscando] = useState(() => !receita);
  const [n, setN] = useState(0);
  const mudar = (p: Partial<FormularioDaReceita>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };
  const travado = desligado || !!ocupado;
  const macros = macrosDaReceitaNoFormulario(f, receita);
  const apagadoNaLista = f.itens.some((i) => !i.origem);
  const salvar = async () => {
    const v = validarReceita(f);
    if (v) {
      setErro(v);
      return;
    }
    const id = receita?.id ?? null;
    if (await gravar({ chave: "receita", fazer: () => salvarReceita(id, dadosDaReceita(f, !receita)), biblioteca: true, ok: TEXTOS.receitaSalva })) aoVoltar();
  };
  const apagar = async () => {
    if (!receita) return;
    if (!(await confirmar({ titulo: "Apagar a receita?", descricao: TEXTOS.receitaApagarTexto, rotuloConfirmar: "Apagar", perigo: true }))) return;
    if (await gravar({ chave: "receita-apagar", fazer: () => excluirReceita(receita.id), biblioteca: true, ok: TEXTOS.receitaApagada })) aoVoltar();
  };
  const doCampo = (c: CampoDaReceita) => (erro?.campo === c ? erro.mensagem : undefined);
  return (
    <div className="flex flex-col gap-4" data-form-receita={receita ? receita.id : "nova"}>
      <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={80} autoComplete="off"
        placeholder="Vitamina de banana, bolo de caneca…" erro={doCampo("nome")} data-receita-nome />
      <Campo rotulo="Rende (porções)" inputMode="numeric" value={f.porcoes} onChange={(e) => mudar({ porcoes: e.target.value })} erro={doCampo("porcoes")} data-receita-porcoes />
      <div className="flex flex-col gap-2" data-receita-itens={f.itens.length}>
        <span className="text-[12.5px] font-semibold text-texto-2">{TEXTOS.ingredientes}</span>
        {f.itens.length === 0 && <p className="text-[12.5px] text-texto-3">{TEXTOS.semIngredientes}</p>}
        {f.itens.map((i) => (
          <div key={i.chave} className="flex items-end gap-2" data-receita-item={i.chave}>
            <span className="min-w-0 flex-1 pb-3 text-[13px] font-medium text-texto">
              <span className={i.origem ? "block truncate" : "block truncate text-texto-3 line-through"}>{i.nome}</span>
            </span>
            <span className="w-24 flex-none">
              <Campo rotulo="g" inputMode="decimal" value={i.quantidade_g} disabled={!i.origem}
                onChange={(e) => mudar({ itens: f.itens.map((x) => (x.chave === i.chave ? { ...x, quantidade_g: e.target.value } : x)), itensMudaram: true })}
                data-receita-item-qtd={i.chave} />
            </span>
            <button type="button" aria-label={`Tirar ${i.nome} da receita`} onClick={() => mudar({ itens: f.itens.filter((x) => x.chave !== i.chave), itensMudaram: true })}
              className="mb-1.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie-2 text-texto-3" data-receita-item-tirar={i.chave}>
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ))}
        {apagadoNaLista && <p className="text-[12px] text-ambar-3" data-receita-apagado>{TEXTOS.ingredienteApagado}</p>}
        {doCampo("itens") && <MensagemForm data-receita-erro-itens>{doCampo("itens")}</MensagemForm>}
        {buscando ? (
          <BuscaDeAlimentos ativo semReceitas aoEscolher={(x) => {
            mudar({ itens: [...f.itens, ingredienteDaBusca(x, `novo-${n}`)], itensMudaram: true });
            setN((k) => k + 1);
            setBuscando(false);
          }} />
        ) : (
          <Botao variante="g" tamanho="sm" icone={Plus} className="self-start" onClick={() => setBuscando(true)} disabled={f.itens.length >= 30} data-receita-adicionar>
            {TEXTOS.adicionarIngrediente}
          </Botao>
        )}
      </div>
      <p className="text-[12.5px] text-texto-2" data-receita-por-porcao={macros ? Math.round(Number(macros.energia_kcal) || 0) : ""}>
        {TEXTOS.porPorcao}: {textoDosMacros(macros)}
      </p>
      {erro && !erro.campo && <MensagemForm>{erro.mensagem}</MensagemForm>}
      <Botao variante="w" onClick={() => void salvar()} disabled={travado} data-receita-salvar>{ocupado === "receita" ? TEXTOS.salvando : TEXTOS.salvar}</Botao>
      {receita && (
        <button type="button" onClick={() => void apagar()} disabled={travado} data-receita-apagar
          className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
          <Trash2 aria-hidden /> {TEXTOS.apagar}
        </button>
      )}
    </div>
  );
}

export function FolhaMeusAlimentos({ aberta, aoMudar, ocupado, desligado, gravar }: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
}) {
  const [vista, setVista] = useState<Vista>({ tipo: "lista" });
  const [aba, setAba] = useState<Aba>("alimentos");
  const bib = useMinhaBiblioteca(aberta);
  useEffect(() => {
    if (aberta) setVista({ tipo: "lista" });
  }, [aberta]);

  const titulo = vista.tipo === "alimento" ? (vista.alimento ? TEXTOS.mudarAlimento : TEXTOS.novoAlimento)
    : vista.tipo === "receita" ? (vista.receita ? TEXTOS.mudarReceita : TEXTOS.novaReceita) : TEXTOS.meus;
  const voltar = () => setVista({ tipo: "lista" });

  let corpo: React.ReactNode;
  if (vista.tipo === "alimento") {
    corpo = <FormAlimento key={vista.alimento?.id ?? "novo"} alimento={vista.alimento} ocupado={ocupado} desligado={desligado} gravar={gravar} aoVoltar={voltar} />;
  } else if (vista.tipo === "receita") {
    corpo = <FormReceita key={vista.receita?.id ?? "nova"} receita={vista.receita} ocupado={ocupado} desligado={desligado} gravar={gravar} aoVoltar={voltar} />;
  } else if (!bib.data) {
    corpo = bib.isError ? (
      <span className="flex items-center justify-between gap-3" data-meus-estado="erro">
        <span className="text-[12.5px] text-texto-2">{TEXTOS.bibliotecaErro}</span>
        <Botao tamanho="sm" icone={RefreshCw} onClick={() => void bib.refetch()}>Tentar de novo</Botao>
      </span>
    ) : (
      <div role="status" aria-busy="true" aria-label="Carregando" className="flex flex-col gap-2" data-meus-estado="carregando">
        {[0, 1, 2].map((i) => <Esqueleto key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  } else {
    const alimentos = bib.data.alimentos;
    const receitas = bib.data.receitas;
    corpo = (
      <div className="flex flex-col gap-3" data-meus-estado="lista" data-meus-alimentos={alimentos.length} data-minhas-receitas={receitas.length}>
        <Segmentado<Aba> rotulo="Meus alimentos ou receitas" className="self-start" valor={aba} aoMudar={setAba}
          opcoes={[{ valor: "alimentos", rotulo: `${TEXTOS.alimentos} (${alimentos.length})` }, { valor: "receitas", rotulo: `${TEXTOS.receitas} (${receitas.length})` }]} />
        {aba === "alimentos" ? (
          <>
            {alimentos.length === 0 && <p className="text-[12.5px] leading-snug text-texto-3">{TEXTOS.semAlimentos}</p>}
            <ul className="flex flex-col gap-1.5">
              {alimentos.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setVista({ tipo: "alimento", alimento: a })} data-meu-alimento={a.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-texto">{a.nome}</span>
                      <span className="block truncate text-[11.5px] text-texto-3">{fmtKcal(Number(a.energia_kcal))} kcal em 100 g · porção {Number(a.porcao_g)} g</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Botao variante="g" icone={Plus} onClick={() => setVista({ tipo: "alimento", alimento: null })} disabled={desligado} data-meus-novo-alimento>{TEXTOS.novoAlimento}</Botao>
          </>
        ) : (
          <>
            {receitas.length === 0 && <p className="text-[12.5px] leading-snug text-texto-3">{TEXTOS.semReceitas}</p>}
            <ul className="flex flex-col gap-1.5">
              {receitas.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setVista({ tipo: "receita", receita: r })} data-minha-receita={r.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-texto">{r.nome}</span>
                      <span className="block truncate text-[11.5px] text-texto-3">
                        {r.porcoes} {r.porcoes === 1 ? "porção" : "porções"} · {fmtKcal(Number(r.por_porcao.energia_kcal))} kcal a porção · {r.itens.length} ingrediente{r.itens.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Botao variante="g" icone={Plus} onClick={() => setVista({ tipo: "receita", receita: null })} disabled={desligado} data-meus-nova-receita>{TEXTOS.novaReceita}</Botao>
          </>
        )}
      </div>
    );
  }

  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={titulo}
      descricao={vista.tipo === "lista" ? "Só seus: a nutricionista vê quando você usa no dia." : undefined}>
      <div className="flex flex-col gap-4 pt-1" data-folha-meus={vista.tipo}>
        {vista.tipo !== "lista" && (
          <Botao variante="g" tamanho="sm" icone={ArrowLeft} className="self-start" onClick={voltar} disabled={!!ocupado} data-meus-voltar>{TEXTOS.meus}</Botao>
        )}
        {corpo}
      </div>
    </PainelDeslizante>
  );
}
```

`src/dieta-livre/ui/DiaLivre.tsx`:
```tsx
// Physiq W-A P5 — as peças da aba Dieta "Pode mexer" (spec §4.4): as refeições EXTRAS do dia (a mesma linha das refeições do plano), os 2 botões
// embaixo da lista ("Nova refeição" · "Meus alimentos e receitas") e as 3 folhas novas, abertas pelo `?ver=` da aba (o Voltar do aparelho
// fecha): adicionar (`r` = a refeição do plano · `e` = a extra), extra (nova ou `e`) e meus.
import { NotebookTabs, Plus } from "lucide-react";
import { adicionarNoDia, marcarExtra } from "@/aluno-dia/api";
import type { DiaAplicado, ExtraNoDia } from "@/aluno-dia/regras";
import { LinhaRefeicao } from "@/nutricao/app/ui/LinhaRefeicao";
import { Botao } from "@/ui/premium/Botao";
import { fotoDaRefeicao } from "@/ui/premium/fotos";
import { linhaDaExtra, type FolhaDoDia, type Lugar } from "../regras";
import { TEXTOS } from "../textos";
import type { Gravacao } from "../useDietaLivre";
import { FolhaAdicionar } from "./FolhaAdicionar";
import { FolhaExtra } from "./FolhaExtra";
import { FolhaMeusAlimentos } from "./FolhaMeusAlimentos";

type Abrir = (f: FolhaDoDia | "refeicao", extra?: Record<string, string>, substituir?: boolean) => void;

/** As refeições extras do dia, logo depois das do plano (tocar abre; o ✓ verde desmarca o "Já comi"). */
export function ExtrasDoDia({ extras, ocupado, desligado, aoAbrir, gravar }: {
  extras: ExtraNoDia[];
  ocupado: string | null;
  desligado: boolean;
  aoAbrir: (id: string) => void;
  gravar: (g: Gravacao) => Promise<boolean>;
}) {
  if (extras.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2" data-extras={extras.length}>
      {extras.map((e) => {
        const l = linhaDaExtra(e);
        const foto = fotoDaRefeicao(e.extra.nome, e.extra.horario);
        return (
          <div key={e.extra.id} data-extra={e.extra.id} data-extra-concluida={e.concluida ? "1" : "0"}>
            <LinhaRefeicao id={e.extra.id} nome={e.extra.nome} linha={`${l.linha} · extra`} kcal={l.kcal} foto={foto} fotoPadrao={foto}
              estado={e.concluida ? "feita" : "pendente"} salvando={ocupado === `extra-marcar:${e.extra.id}`} desligado={desligado || !!ocupado}
              aoAbrir={() => aoAbrir(e.extra.id)}
              aoMarcar={(c) => void gravar({ chave: `extra-marcar:${e.extra.id}`, fazer: () => marcarExtra(e.extra.id, c) })} />
          </div>
        );
      })}
    </div>
  );
}

/** "Nova refeição" (só quando a matrícula do plano ativo é a da tela — o servidor põe a extra nela) e "Meus alimentos e receitas". */
export function BotoesDoDia({ extra, desligado, aoNovaRefeicao, aoMeus }: { extra: boolean; desligado: boolean; aoNovaRefeicao: () => void; aoMeus: () => void }) {
  return (
    <div className="mt-2.5 flex gap-2.5" data-dieta-livre="liberada">
      {extra && (
        <Botao variante="g" icone={Plus} className="flex-1" onClick={aoNovaRefeicao} disabled={desligado} data-dieta-nova-refeicao>{TEXTOS.novaRefeicao}</Botao>
      )}
      <Botao variante="g" icone={NotebookTabs} className="flex-1" onClick={aoMeus} data-dieta-meus>{TEXTOS.meus}</Botao>
    </div>
  );
}

export function FolhasDoDia({ folha, params, abrir, fechar, aplicado, hoje, desligado, gravar, ocupado }: {
  folha: string | null;
  params: URLSearchParams;
  abrir: Abrir;
  fechar: () => void;
  aplicado: DiaAplicado;
  hoje: string;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  ocupado: string | null;
}) {
  const r = params.get("r");
  const e = params.get("e");
  const refeicao = r ? aplicado.refeicoes.find((x) => x.refeicao.id === r) ?? null : null;
  const extra = e ? aplicado.extras.find((x) => x.extra.id === e) ?? null : null;
  const lugar: Lugar | null = refeicao
    ? { tipo: "refeicao", id: refeicao.refeicao.id, nome: refeicao.refeicao.nome }
    : extra ? { tipo: "extra", id: extra.extra.id, nome: extra.extra.nome } : null;
  const mudar = (aberta: boolean) => {
    if (!aberta) fechar();
  };
  const por = async (dados: Parameters<typeof adicionarNoDia>[1]) => {
    const ok = await gravar({ chave: "adicionar", fazer: () => adicionarNoDia(hoje, dados), ok: TEXTOS.posto });
    // deu certo → volta para a refeição (no lugar do "adicionar", como o Voltar faria), com o que ele pôs na lista
    if (ok && lugar) abrir(lugar.tipo === "refeicao" ? "refeicao" : "extra", lugar.tipo === "refeicao" ? { r: lugar.id } : { e: lugar.id }, true);
    return ok;
  };
  return (
    <>
      <FolhaAdicionar aberta={folha === "adicionar" && !!lugar} aoMudar={mudar} lugar={lugar} ocupado={!!ocupado} desligado={desligado} aoPor={por} />
      <FolhaExtra aberta={folha === "extra" && (!e || !!extra)} aoMudar={mudar} extra={extra} hoje={hoje} ocupado={ocupado} desligado={desligado}
        gravar={gravar} aoAdicionar={(id) => abrir("adicionar", { e: id }, true)} />
      <FolhaMeusAlimentos aberta={folha === "meus"} aoMudar={mudar} ocupado={ocupado} desligado={desligado} gravar={gravar} />
    </>
  );
}
```

- [ ] **Step 3: O lint da pasta** — `cd ~/projetos/physiqcalc-wa-p5 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npx eslint src/dieta-livre`
  → nada impresso (0 erro, 0 aviso).
- [ ] **Step 4: Commit** — `feat(w-a): a dieta liberada no app — as consultas (o dia, a biblioteca, a busca), a gravação uma por vez e as folhas (pôr, a extra, meus alimentos e receitas)`
  com os 9 arquivos; `feita.sh 2 "consultas e folhas 3/3 (+ regras 9); eslint 0" "<placar>"`.

---

### Task 3: A aba Dieta e a folha da refeição (TDD)

**Files:** Modify `src/app-aluno/abas/Dieta.test.tsx`, `src/app-aluno/abas/Dieta.tsx`, `src/nutricao/app/ui/SheetRefeicao.tsx`.
**Estimativa:** 20 min (calibrado 3–5).

- [ ] **Step 1: O teste (vermelho)**

Run: `cd ~/projetos/physiqcalc-wa-p5 && git apply ~/projetos/physiqcalc-scratch/w-a/p5/patches/T3-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh src/app-aluno/abas/Dieta.test.tsx`
Expected: `Test Files 1 failed` · `Tests 11 failed | 13 passed (24)` — as 13 verificações de hoje passam com o falso novo (a `aluno-dia` ensinada; travada = como hoje) e as da P5 falham (a aba ainda não
tem a dieta liberada nem as rotinas).

`~/projetos/physiqcalc-scratch/w-a/p5/patches/T3-teste.patch`:
```diff
diff --git a/src/app-aluno/abas/Dieta.test.tsx b/src/app-aluno/abas/Dieta.test.tsx
index 9d0937a..fb86f27 100644
--- a/src/app-aluno/abas/Dieta.test.tsx
+++ b/src/app-aluno/abas/Dieta.test.tsx
@@ -8,24 +8,51 @@ import type { DadosDieta, ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from
 // hml-19b (decisão 14): o ✓ da refeição e da meta passa pela função nutricao — o marcarRefeicao/marcarMeta de VERDADE chamam a
 // functions.invoke, e a invoke falsa leva aos mesmos h.marcar/h.meta (o "banco" do teste); a recusa volta como a da função
 // ({ ok: false, erro }), com o código. As leituras (minha_dieta, URLs) seguem falsificadas como antes.
+// W-A P5: a aluno-dia também passa pela invoke falsa — as leituras (q = dia, rotinas, biblioteca, alimentos) devolvem o "banco" do teste
+// (h.meuDia: travada por padrão, como hoje) e cada gravação vai ao h.gravar(acao, corpo) (a recusa: o código, como a função).
 const h = vi.hoisted(() => {
+  const resposta = (dados: unknown) => ({ data: dados, error: null });
+  const recusa = (codigo: string, status = 400) => ({
+    data: null,
+    error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: codigo }), { status, headers: { "Content-Type": "application/json" } }) },
+  });
   const h = {
     sessao: {} as Record<string, unknown>,
     dados: {} as Record<string, unknown>,
     chamadas: [] as string[],
+    alunoDia: [] as string[],
+    meuDia: {} as Record<string, unknown>,
+    busca: [] as Record<string, unknown>[],
     marcar: vi.fn(),
     meta: vi.fn(),
     pratos: vi.fn(),
+    gravar: vi.fn(),
     toastErro: vi.fn(),
+    toastOk: vi.fn(),
     invocar: async (nome: string, o: { body: Record<string, unknown> }) => {
       const b = o.body;
+      if (nome === "aluno-dia") {
+        h.alunoDia.push(b.acao === "ler" ? `ler:${String(b.q)}` : String(b.acao));
+        if (b.acao === "ler") {
+          if (b.q === "dia") return resposta({ ok: true, ...h.meuDia });
+          if (b.q === "rotinas") return resposta({ ok: true, hoje: "2026-09-30", rotinas: [], feitas: [] });
+          if (b.q === "alimentos") return resposta({ ok: true, pagina: 0, tem_mais: false, itens: String(b.termo).length >= 2 ? h.busca : [] });
+          if (b.q === "biblioteca") return resposta({ ok: true, alimentos: [], receitas: [] });
+          throw new Error(`leitura inesperada: ${String(b.q)}`);
+        }
+        try {
+          return resposta({ ok: true, ...(await h.gravar(b.acao, b)) });
+        } catch (e) {
+          const codigo = (e as Error).message;
+          return recusa(codigo, codigo === "dieta_travada" ? 409 : 400);
+        }
+      }
       const f = b.acao === "aluno_marcar_refeicao" ? h.marcar : b.acao === "aluno_marcar_meta" ? h.meta : null;
       if (nome !== "nutricao" || !f) throw new Error(`chamada inesperada: ${nome} ${String(b.acao)}`);
       try {
-        return { data: { ok: true, concluida: await f(b.refeicao_id ?? b.meta_id, b.data, b.concluida) }, error: null };
+        return resposta({ ok: true, concluida: await f(b.refeicao_id ?? b.meta_id, b.data, b.concluida) });
       } catch (e) {
-        const corpo = JSON.stringify({ ok: false, erro: (e as Error).message });
-        return { data: null, error: { name: "FunctionsHttpError", context: new Response(corpo, { status: 400, headers: { "Content-Type": "application/json" } }) } };
+        return recusa((e as Error).message);
       }
     },
   };
@@ -33,7 +60,7 @@ const h = vi.hoisted(() => {
 });
 
 vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
-vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: (...a: unknown[]) => h.toastErro(...a) } }));
+vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => h.toastOk(...a), info: vi.fn(), error: (...a: unknown[]) => h.toastErro(...a) } }));
 vi.mock("@/integrations/principal/client", () => ({
   principalConfigurado: true,
   PRINCIPAL_SCHEMA: "public",
@@ -55,6 +82,7 @@ vi.mock("@/app-aluno/sozinho/api", () => ({
   ErroApp: class extends Error {},
 }));
 
+import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
 import Dieta from "./Dieta";
 
 // ─── massa: o plano da tela 3 (Camila Rocha), café e lanche da manhã feitos ───
@@ -105,6 +133,18 @@ const base = (o: Partial<DadosDieta> = {}): DadosDieta => ({
   ...o,
 });
 
+// W-A P5: o dia dele na aluno-dia (meu_dia): a matrícula pac-1 travada ("Só ver") ou liberada ("Pode mexer"), o plano ativo e o que ele registrou
+const meuDia = (o: { liberada?: boolean; itens?: unknown[]; extras?: unknown[]; matriculas?: { paciente_id: string; liberada: boolean }[] } = {}) => ({
+  dia: "2026-09-30", hoje: "2026-09-30", pode_gravar: true,
+  matriculas: o.matriculas ?? [{ paciente_id: "pac-1", liberada: o.liberada ?? true }],
+  plano_ativo: { plano_id: "plano-atual", paciente_id: "pac-1" }, extras: o.extras ?? [], itens: o.itens ?? [],
+});
+const itemDoDia = (o: Record<string, unknown>) => ({
+  id: "d1", paciente_id: "pac-1", dia: "2026-09-30", tipo: "adicionado", refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null,
+  aluno_alimento_id: null, aluno_receita_id: null, quantidade_g: 100, porcoes: null, refeicao_nome: "Café da manhã", nome: "Banana, prata, crua",
+  energia_kcal: 98.25, proteina_g: 1.27, carboidrato_g: 25.96, lipidio_g: 0.07, fibra_g: 2, criado_em: "2026-09-30T10:00:00Z", ...o,
+});
+
 function Local() {
   const l = useLocation();
   return <span data-testid="local">{l.pathname + l.search}</span>;
@@ -113,11 +153,13 @@ function montar(rota = "/dieta") {
   const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
   return render(
     <QueryClientProvider client={qc}>
-      <MemoryRouter useTransitions={false} initialEntries={[rota]}>
-        <Routes>
-          <Route path="/dieta" element={<><Dieta /><Local /></>} />
-        </Routes>
-      </MemoryRouter>
+      <ProvedorConfirmar>
+        <MemoryRouter useTransitions={false} initialEntries={[rota]}>
+          <Routes>
+            <Route path="/dieta" element={<><Dieta /><Local /></>} />
+          </Routes>
+        </MemoryRouter>
+      </ProvedorConfirmar>
     </QueryClientProvider>,
   );
 }
@@ -140,6 +182,13 @@ beforeEach(() => {
   };
   h.marcar.mockReset().mockImplementation(gravar("refeicoes_concluidas"));
   h.toastErro.mockReset();
+  h.toastOk.mockReset();
+  h.alunoDia = [];
+  h.meuDia = meuDia({ liberada: false });
+  h.busca = [];
+  h.gravar.mockReset().mockImplementation(async (acao: string) => {
+    throw new Error(`gravação inesperada: ${acao}`);
+  });
   h.meta.mockReset().mockImplementation(gravar("metas_concluidas"));
   h.pratos.mockReset();
   h.sessao = {
@@ -322,3 +371,239 @@ describe("aba Dieta (W11 — tela 3)", () => {
     expect(h.chamadas).toEqual([]);
   });
 });
+
+describe("W-A P5 — a Dieta 'Pode mexer' (spec §4.4) e as rotinas na Dieta (§4.3)", () => {
+  const liberar = (o: Parameters<typeof meuDia>[0] = {}) => {
+    h.meuDia = meuDia({ liberada: true, ...o });
+  };
+  const prontoLivre = () => waitFor(() => expect(document.querySelector('[data-dieta-livre="liberada"]')).not.toBeNull());
+  /** espera o elemento aparecer (o waitFor só repete o que lança) */
+  const achar = <T extends HTMLElement = HTMLElement>(seletor: string, timeout = 3000) =>
+    waitFor(() => {
+      const el = document.querySelector(seletor);
+      if (!el) throw new Error(`sem ${seletor}`);
+      return el as T;
+    }, { timeout });
+  afterEach(() => {
+    // o "offline" do teste da internet deixa o onlineManager do React Query parado: volta para os próximos
+    online(true);
+    act(() => {
+      window.dispatchEvent(new Event("online"));
+    });
+  });
+
+  it("'Só ver' (o padrão): tudo como hoje — nenhum botão novo, a folha sem 'Tirar hoje'; só a leitura do dia; as rotinas no fim", async () => {
+    montar();
+    await pronto();
+    await waitFor(() => expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada"));
+    expect(document.querySelector("[data-dieta-livre]")).toBeNull();
+    expect(screen.queryByRole("button", { name: /Nova refeição/ })).toBeNull();
+    expect(screen.queryByRole("button", { name: /Meus alimentos e receitas/ })).toBeNull();
+    expect(document.querySelector("[data-kcal-marcadas]")!.getAttribute("data-kcal-marcadas")).toBe("488");
+    fireEvent.click(screen.getByRole("button", { name: "Ver Café da manhã" }));
+    const folha = await waitFor(() => document.querySelector('[data-folha-refeicao="cafe"]') as HTMLElement);
+    expect(folha.querySelector("[data-item-tirar]")).toBeNull();
+    expect(folha.querySelector("[data-dieta-adicionar]")).toBeNull();
+    expect(folha.querySelectorAll("[data-item]").length).toBe(2);
+    await waitFor(() => expect(document.querySelector("[data-card-rotinas-dieta]")).not.toBeNull());
+    expect(h.alunoDia.filter((x) => x !== "ler:dia" && x !== "ler:rotinas")).toEqual([]);
+    expect(h.gravar).not.toHaveBeenCalled();
+  });
+
+  it("'Pode mexer': tira um item SÓ hoje (riscado, com 'Voltar') e volta — a aluno-dia com o dia de hoje e o item do plano", async () => {
+    liberar();
+    h.gravar.mockImplementation(async (acao: string, b: Record<string, unknown>) => {
+      if (acao === "dia_tirar") {
+        h.meuDia = meuDia({ itens: [itemDoDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: b.item, nome: "Aveia, flocos, crua", energia_kcal: 196.91 })] });
+        return { item: {} };
+      }
+      if (acao === "dia_desfazer") {
+        h.meuDia = meuDia();
+        return {};
+      }
+      throw new Error(`gravação inesperada: ${acao}`);
+    });
+    montar("/dieta?ver=refeicao&r=cafe");
+    await prontoLivre();
+    const folha = (await achar('[data-folha-refeicao="cafe"] [data-item-tirar="i-aveia"]')).closest("[data-folha-refeicao]") as HTMLElement;
+    fireEvent.click(folha.querySelector('[data-item-tirar="i-aveia"]')!);
+    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("dia_tirar", expect.objectContaining({ dia: "2026-09-30", item: "i-aveia" })));
+    await waitFor(() => expect(folha.querySelector('[data-item="i-aveia"]')!.getAttribute("data-item-tirado")).toBe("1"));
+    expect(folha.querySelector('[data-item="i-aveia"] [data-item-nome]')!.className).toContain("line-through");
+    expect(document.querySelector('[data-refeicao="cafe"] [data-refeicao-linha]')!.textContent).toBe("07:00 · Ovo");
+    fireEvent.click(folha.querySelector('[data-item-voltar="i-aveia"]')!);
+    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("dia_desfazer", expect.objectContaining({ id: "t1" })));
+    await waitFor(() => expect(folha.querySelector('[data-item="i-aveia"]')!.getAttribute("data-item-tirado")).toBe("0"));
+  });
+
+  it("o anel e as barras contam o que ele comeu: o café feito sem a aveia que ele tirou e com a banana que pôs; o plano do dia não muda", async () => {
+    liberar({ itens: [itemDoDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: "i-aveia", nome: "Aveia", energia_kcal: 196.91 }), itemDoDia({ id: "p1", refeicao_id: "cafe" })] });
+    montar();
+    await prontoLivre();
+    // café 218,55 (os 3 ovos) + 98,25 (a banana) + o lanche da manhã 72,18 = 388,98 — de 984 (o plano do dia)
+    await waitFor(() => expect(document.querySelector("[data-kcal-marcadas]")!.getAttribute("data-kcal-marcadas")).toBe("389"));
+    expect(document.querySelector("[data-kcal-do-dia]")!.textContent).toBe("de 984 kcal");
+    expect(document.querySelector('[data-refeicao="cafe"] [data-refeicao-linha]')!.textContent).toBe("07:00 · Ovo · Banana");
+    expect(document.querySelector("[data-refeicoes-contagem]")!.textContent).toBe("2 de 4");
+    fireEvent.click(screen.getByRole("button", { name: "Ver Café da manhã" }));
+    const folha = (await achar('[data-folha-refeicao="cafe"] [data-item-posto="p1"]')).closest("[data-folha-refeicao]") as HTMLElement;
+    expect(folha.querySelector('[data-item-posto="p1"] [data-item-selo]')!.textContent).toBe("você pôs");
+    expect(folha.querySelector('[data-item-posto="p1"] [data-item-qtd]')!.textContent).toBe("100 g · 98 kcal");
+  });
+
+  it("põe um alimento: 'Adicionar alimento' → a busca → as gramas (com as kcal antes) → 'Pôr no dia' → volta para a refeição", async () => {
+    liberar();
+    h.busca = [{ tipo: "taco", id: "taco-arroz", nome: "Arroz, tipo 1, cozido", porcao_g: 100, energia_kcal: 128.26, proteina_g: 2.52, carboidrato_g: 28.06, lipidio_g: 0.23, fibra_g: 1.56 }];
+    h.gravar.mockImplementation(async (acao: string) => {
+      if (acao === "dia_adicionar") return { item: {} };
+      throw new Error(`gravação inesperada: ${acao}`);
+    });
+    montar("/dieta?ver=refeicao&r=almoco");
+    await prontoLivre();
+    const adicionar = await achar('[data-folha-refeicao="almoco"] [data-dieta-adicionar]');
+    fireEvent.click(adicionar);
+    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=adicionar&r=almoco"));
+    const busca = await achar<HTMLInputElement>("[data-busca-termo]");
+    fireEvent.change(busca, { target: { value: "ar" } });
+    const achado = await achar('[data-busca-item="taco-arroz"]');
+    expect(achado.textContent).toContain("TACO · 128 kcal em 100 g");
+    fireEvent.click(achado);
+    const qtd = await achar<HTMLInputElement>("[data-quantidade]");
+    expect(qtd.value).toBe("100");
+    fireEvent.change(qtd, { target: { value: "150" } });
+    expect(document.querySelector("[data-quantidade-macros]")!.getAttribute("data-quantidade-macros")).toBe("192");
+    fireEvent.click(document.querySelector("[data-escolha-por]")!);
+    await waitFor(() =>
+      expect(h.gravar).toHaveBeenCalledWith("dia_adicionar", expect.objectContaining({ dia: "2026-09-30", dados: { refeicao_id: "almoco", alimento_id: "taco-arroz", quantidade_g: 150 } })),
+    );
+    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=refeicao&r=almoco"));
+    expect(h.toastOk).toHaveBeenCalledWith("Posto no seu dia.");
+  });
+
+  it("'Nova refeição' (nome, horário, 'Já comi' ligado): sem nome não vai; com nome, a extra de hoje pela aluno-dia e na lista", async () => {
+    liberar();
+    h.gravar.mockImplementation(async (acao: string) => {
+      if (acao === "extra_salvar") {
+        h.meuDia = meuDia({ extras: [{ id: "e1", paciente_id: "pac-1", nome: "Lanche da tarde", horario: "12:00", concluida_em: "2026-09-30T15:00:00Z" }] });
+        return { extra: {} };
+      }
+      throw new Error(`gravação inesperada: ${acao}`);
+    });
+    montar();
+    await prontoLivre();
+    fireEvent.click(document.querySelector("[data-dieta-nova-refeicao]")!);
+    const nome = await achar<HTMLInputElement>("[data-extra-nome]");
+    expect((document.querySelector("[data-extra-horario]") as HTMLInputElement).value).toBe("12:00");
+    expect(document.querySelector("[data-extra-ja-comi]")!.getAttribute("data-extra-ja-comi")).toBe("1");
+    fireEvent.click(document.querySelector("[data-extra-salvar]")!);
+    await waitFor(() => expect(nome.getAttribute("aria-invalid")).toBe("true"));
+    expect(h.gravar).not.toHaveBeenCalled();
+    fireEvent.change(nome, { target: { value: "Lanche da tarde" } });
+    fireEvent.click(document.querySelector("[data-extra-salvar]")!);
+    await waitFor(() =>
+      expect(h.gravar).toHaveBeenCalledWith("extra_salvar", expect.objectContaining({ id: null, dados: { dia: "2026-09-30", nome: "Lanche da tarde", horario: "12:00", ja_comi: true } })),
+    );
+    await waitFor(() => expect(document.querySelector('[data-extra="e1"]')).not.toBeNull());
+    expect(document.querySelector('[data-extra="e1"] [data-refeicao-estado]')!.getAttribute("data-refeicao-estado")).toBe("feita");
+    expect(document.querySelector('[data-extra="e1"] [data-refeicao-linha]')!.textContent).toBe("12:00 · Nada ainda · extra");
+  });
+
+  it("a refeição extra aberta: 'Adicionar alimento' → a receita dele em porções → na extra; o 'Já comi' desmarca pela aluno-dia", async () => {
+    const extra = { id: "e1", paciente_id: "pac-1", nome: "Lanche da tarde", horario: "16:00", concluida_em: "2026-09-30T19:00:00Z" };
+    liberar({ extras: [extra] });
+    h.busca = [{ tipo: "receita", id: "rc1", nome: "Vitamina de banana", porcao_g: null, energia_kcal: 210, proteina_g: 8, carboidrato_g: 30, lipidio_g: 5, fibra_g: 2 }];
+    h.gravar.mockImplementation(async (acao: string) => {
+      if (acao === "dia_adicionar") {
+        h.meuDia = meuDia({ extras: [extra], itens: [itemDoDia({ id: "p9", extra_id: "e1", aluno_receita_id: "rc1", quantidade_g: null, porcoes: 1, nome: "Vitamina de banana", energia_kcal: 210 })] });
+        return { item: {} };
+      }
+      if (acao === "extra_marcar") return { concluida_em: null };
+      throw new Error(`gravação inesperada: ${acao}`);
+    });
+    montar();
+    await prontoLivre();
+    fireEvent.click(await achar('[data-extra="e1"] [data-refeicao-abrir]'));
+    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=extra&e=e1"));
+    fireEvent.click(await achar('[data-folha-extra="e1"] [data-dieta-adicionar]'));
+    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=adicionar&e=e1"));
+    fireEvent.change(await achar<HTMLInputElement>("[data-busca-termo]"), { target: { value: "vitamina" } });
+    fireEvent.click(await achar('[data-busca-item="rc1"]'));
+    expect((await achar<HTMLInputElement>("[data-quantidade]")).value).toBe("1");
+    fireEvent.click(document.querySelector("[data-escolha-por]")!);
+    await waitFor(() =>
+      expect(h.gravar).toHaveBeenCalledWith("dia_adicionar", expect.objectContaining({ dia: "2026-09-30", dados: { extra_id: "e1", aluno_receita_id: "rc1", porcoes: 1 } })),
+    );
+    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=extra&e=e1"));
+    const posto = await achar('[data-folha-extra="e1"] [data-item-posto="p9"]');
+    expect(posto.querySelector("[data-item-qtd]")!.textContent).toBe("1 porção · 210 kcal");
+    fireEvent.click(document.querySelector('[data-folha-extra="e1"] [data-extra-feita]')!);
+    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("extra_marcar", expect.objectContaining({ id: "e1", feita: false })));
+  });
+
+  it("a Dieta travou no meio: 'A sua dieta voltou a ser só para ver.', a folha fecha e a tela volta ao 'só ver'", async () => {
+    liberar();
+    h.gravar.mockImplementation(async () => {
+      h.meuDia = meuDia({ liberada: false });
+      throw new Error("dieta_travada");
+    });
+    montar("/dieta?ver=refeicao&r=cafe");
+    await prontoLivre();
+    const tirar = await achar('[data-folha-refeicao="cafe"] [data-item-tirar="i-ovo"]');
+    fireEvent.click(tirar);
+    await waitFor(() => expect(h.toastErro).toHaveBeenCalledWith("A sua dieta voltou a ser só para ver."));
+    await waitFor(() => expect(document.querySelector("[data-dieta-livre]")).toBeNull());
+    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta"));
+    expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada");
+  });
+
+  it("sem internet: os botões da dieta liberada ficam desligados (como o ✓ de hoje)", async () => {
+    liberar();
+    montar("/dieta?ver=refeicao&r=cafe");
+    await prontoLivre();
+    const tirar = await achar<HTMLButtonElement>('[data-folha-refeicao="cafe"] [data-item-tirar="i-ovo"]');
+    expect(tirar.disabled).toBe(false);
+    online(false);
+    act(() => {
+      window.dispatchEvent(new Event("offline"));
+    });
+    await waitFor(() => expect(tirar.disabled).toBe(true));
+    expect((document.querySelector('[data-folha-refeicao="cafe"] [data-dieta-adicionar]') as HTMLButtonElement).disabled).toBe(true);
+    expect((document.querySelector("[data-dieta-nova-refeicao]") as HTMLButtonElement).disabled).toBe(true);
+  });
+
+  it("2 matrículas: a OUTRA liberada não libera a tela — vale a matrícula do plano ativo", async () => {
+    h.meuDia = meuDia({ matriculas: [{ paciente_id: "pac-1", liberada: false }, { paciente_id: "pac-2", liberada: true }] });
+    const primeira = montar();
+    await pronto();
+    await waitFor(() => expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada"));
+    expect(document.querySelector("[data-dieta-livre]")).toBeNull();
+    primeira.unmount();
+    // o inverso: a do plano ativo liberada e a outra travada → liberada
+    h.meuDia = meuDia({ matriculas: [{ paciente_id: "pac-1", liberada: true }, { paciente_id: "pac-2", liberada: false }] });
+    montar();
+    await prontoLivre();
+  });
+
+  it("outro dia ou plano anterior: só para ver, mesmo liberada (a dieta liberada é do dia de hoje)", async () => {
+    liberar();
+    montar();
+    await prontoLivre();
+    fireEvent.click(screen.getByRole("button", { name: "Ver outro dia" }));
+    fireEvent.click(await achar('[data-dia="2026-10-03"]'));
+    await waitFor(() => expect(screen.getByText("Refeições de sábado · 03/10")).toBeInTheDocument());
+    expect(document.querySelector("[data-dieta-livre]")).toBeNull();
+    expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada");
+  });
+
+  it("pratos prontos (o aluno do app sem profissional): a seção 'Rotinas de hoje' no fim também; o dia livre nem é lido", async () => {
+    h.sessao = {
+      usuario: { id: "u-app" },
+      situacao: situacao({ modulos_aluno: ["treino", "nutricao"], matriculas: [matricula({ app: true, app_plano: "app_treino_alimentacao", objetivo_app: "emagrecer", modulos: ["treino", "nutricao"], nutricionista: null })] }),
+    };
+    h.pratos.mockResolvedValue({ ok: true, objetivo: "emagrecer", pratos: [] });
+    montar();
+    await waitFor(() => expect(document.querySelector('[data-aba-dieta="pratos"]')).not.toBeNull());
+    await waitFor(() => expect(document.querySelector("[data-card-rotinas-dieta]")).not.toBeNull());
+    expect(h.alunoDia).not.toContain("ler:dia");
+  });
+});
```

- [ ] **Step 2: A aba e a folha (verde)**

Run: `cd ~/projetos/physiqcalc-wa-p5 && git apply ~/projetos/physiqcalc-scratch/w-a/p5/patches/T3-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh src/app-aluno/abas/Dieta.test.tsx src/app-aluno/abas/abasW11.test.ts src/app-aluno/abas/Inicio.test.tsx src/app-aluno/inicio/CardRotinasHoje.test.tsx`
Expected: `Test Files 4 passed` · `Tests 56 passed (56)` (24 da aba + 32 dos vizinhos: `abasW11`, `Inicio`, `CardRotinasHoje`).

`~/projetos/physiqcalc-scratch/w-a/p5/patches/T3-codigo.patch`:
```diff
diff --git a/src/app-aluno/abas/Dieta.tsx b/src/app-aluno/abas/Dieta.tsx
index 6a992f3..5e367ab 100644
--- a/src/app-aluno/abas/Dieta.tsx
+++ b/src/app-aluno/abas/Dieta.tsx
@@ -27,9 +27,18 @@ import { Chip } from "@/ui/premium/Chip";
 import { Esqueleto, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
 import { fotoDaRefeicao } from "@/ui/premium/fotos";
 import { useOnline } from "@/ui/premium/useOnline";
+import { desfazerNoDia, tirarDoDia } from "@/aluno-dia/api";
+import { FOLHAS_DO_DIA, linhaDaRefeicaoNoDia, resumoDoDiaLivre, totaisDaRefeicaoNoDia, type FolhaDoDia } from "@/dieta-livre/regras";
+import { TEXTOS as TEXTOS_DO_DIA } from "@/dieta-livre/textos";
+import { useDiaLivre } from "@/dieta-livre/useDiaLivre";
+import { BotoesDoDia, ExtrasDoDia, FolhasDoDia } from "@/dieta-livre/ui/DiaLivre";
+import { ItensDoDia } from "@/dieta-livre/ui/ItensDoDia";
+import { ehAlunoDasRotinas } from "@/rotinas/regras";
+import { RotinasDeHoje } from "@/rotinas/ui/RotinasDeHoje";
 
-type Folha = "orientacoes" | "metas" | "diario" | "plano" | "dia" | "refeicao";
-const FOLHAS: Folha[] = ["orientacoes", "metas", "diario", "plano", "dia", "refeicao"];
+// W-A P5: + as 3 folhas da Dieta "Pode mexer" (adicionar, extra, meus — src/dieta-livre/ui/DiaLivre.tsx)
+type Folha = "orientacoes" | "metas" | "diario" | "plano" | "dia" | "refeicao" | FolhaDoDia;
+const FOLHAS: Folha[] = ["orientacoes", "metas", "diario", "plano", "dia", "refeicao", ...FOLHAS_DO_DIA];
 const SEM_INTERNET = "A dieta aparece quando a internet voltar.";
 
 /**
@@ -39,23 +48,37 @@ const SEM_INTERNET = "A dieta aparece quando a internet voltar.";
  * refeição com os substitutos, o PDF e os planos anteriores, o calendário para ver outro dia, as orientações, as metas com ✓ e a
  * foto pro diário. O aluno sem profissional no Treino + Alimentação vê os pratos prontos (W7b). Online (9A): sem internet, o aviso.
  * As folhas abrem pelo `?ver=` (orientacoes, metas, diario — os links antigos /app/* do Nutri caem aqui), e o Voltar do aparelho fecha.
+ * W-A P5 (spec §4.3, §4.4): com a Dieta "Pode mexer" (a matrícula do plano liberada — src/dieta-livre), hoje e no plano atual, ele tira itens
+ * do plano só no dia, põe alimentos e receitas, cria refeições extras e os próprios alimentos e receitas; o anel conta o que ele comeu. "Só
+ * ver" = tudo como antes. No fim da aba (nutri e pratos prontos), a seção "Rotinas de hoje" (a mesma lista do Início — P3).
  */
 export default function Dieta() {
   const { situacao } = useSessao();
   const doApp = matriculaDoApp(situacao);
   const temNutricionista = (situacao?.matriculas ?? []).some((m) => !m.app && m.modulos.includes("nutricao"));
-  if (!temNutricionista && temAlimentacaoDoApp(doApp)) return <DietaDoApp />;
-  return <DietaDaNutricionista />;
+  const comRotinas = ehAlunoDasRotinas(situacao);
+  if (!temNutricionista && temAlimentacaoDoApp(doApp)) return <DietaDoApp comRotinas={comRotinas} />;
+  return <DietaDaNutricionista comRotinas={comRotinas} />;
+}
+
+/** "Rotinas de hoje" no fim da aba (spec §4.3; P9: todo aluno com matrícula). */
+function RotinasDaDieta() {
+  return (
+    <div className="mt-4" data-dieta-rotinas>
+      <RotinasDeHoje origem="dieta" />
+    </div>
+  );
 }
 
 /** Aluno sem profissional no plano Treino + Alimentação: os pratos prontos pelo objetivo (W7b), agora na aba Dieta. */
-function DietaDoApp() {
+function DietaDoApp({ comRotinas }: { comRotinas: boolean }) {
   return (
     <div className={CLASSE_PAGINA_APP} data-aba-dieta="pratos">
       <div className="mt-1 flex items-center justify-between gap-3">
         <TituloApp>Dieta</TituloApp>
       </div>
       <PratosProntos />
+      {comRotinas && <RotinasDaDieta />}
     </div>
   );
 }
@@ -86,7 +109,7 @@ function EsqueletoDieta() {
   );
 }
 
-function DietaDaNutricionista() {
+function DietaDaNutricionista({ comRotinas }: { comRotinas: boolean }) {
   const d = useDieta();
   const online = useOnline();
   const navigate = useNavigate();
@@ -128,6 +151,9 @@ function DietaDaNutricionista() {
   const diario = dados?.diario ?? [];
   const varia = planoVariaPorDia(plano);
   const desligado = !online;
+  // W-A P5: a Dieta "Pode mexer" (null = travada: tudo como antes)
+  const livre = useDiaLivre({ plano, ehAtual, hoje, marcavelHoje, concluidas, aoTravar: fechar });
+  const resumoDaTela = livre.aplicado ? resumoDoDiaLivre(livre.aplicado) : resumo;
 
   const fotoDe = (r: RefeicaoDoPlano): { foto: string; padrao: string } => {
     const padrao = fotoDaRefeicao(r.nome, r.horario);
@@ -151,6 +177,7 @@ function DietaDaNutricionista() {
   };
 
   const refeicaoAberta = folha === "refeicao" ? refeicoes.find((r) => r.id === params.get("r")) ?? null : null;
+  const noDiaAberta = refeicaoAberta ? livre.noDia.get(refeicaoAberta.id) ?? null : null;
   const estadoDe = (r: RefeicaoDoPlano): EstadoRefeicao => {
     if (!refeicaoMarcavel(r)) return "vazia";
     if (!marcavelHoje) return "leitura";
@@ -213,7 +240,7 @@ function DietaDaNutricionista() {
               nutricionista={nutricionista}
               foto={matricula?.nutricionista.foto_url ?? null}
               atualizadoEm={diaMesCurto(plano.updated_at)}
-              resumo={resumo.marcaveis > 0 ? resumo : null}
+              resumo={resumoDaTela.marcaveis > 0 ? resumoDaTela : null}
               aviso={refeicoes.length === 0 ? `O seu plano não tem refeição para ${rotuloDoDia(dia, hoje)}.` : resumo.marcaveis === 0 ? "As refeições deste dia ainda não têm alimentos." : null}
               leitura={!marcavelHoje}
               aoAbrir={() => abrir("plano")}
@@ -250,13 +277,15 @@ function DietaDaNutricionista() {
                   const hora = fmtHorario(r.horario);
                   const itens = r.itens.length ? resumoDaRefeicao(r.itens) : "Sem alimentos";
                   const { foto, padrao } = fotoDe(r);
+                  const noDia = livre.noDia.get(r.id);
+                  const doDia = noDia ? linhaDaRefeicaoNoDia(noDia) : null;
                   return (
                     <LinhaRefeicao
                       key={r.id}
                       id={r.id}
                       nome={r.nome}
-                      linha={[hora, itens].filter(Boolean).join(" · ")}
-                      kcal={r.itens.length ? fmtKcal(totaisDosItens(r.itens).energia_kcal) : "—"}
+                      linha={doDia ? doDia.linha : [hora, itens].filter(Boolean).join(" · ")}
+                      kcal={doDia ? doDia.kcal : r.itens.length ? fmtKcal(totaisDosItens(r.itens).energia_kcal) : "—"}
                       foto={foto}
                       fotoPadrao={padrao}
                       estado={estadoDe(r)}
@@ -269,6 +298,13 @@ function DietaDaNutricionista() {
                 })}
               </div>
             )}
+            {livre.aplicado && (
+              <>
+                <ExtrasDoDia extras={livre.aplicado.extras} ocupado={livre.ocupado} desligado={desligado} gravar={livre.gravar}
+                  aoAbrir={(id) => abrir("extra", { e: id })} />
+                <BotoesDoDia extra={livre.extra} desligado={desligado} aoNovaRefeicao={() => abrir("extra")} aoMeus={() => abrir("meus")} />
+              </>
+            )}
           </>
         )}
         <div className="mt-3 flex gap-2.5">
@@ -290,7 +326,7 @@ function DietaDaNutricionista() {
   }
 
   return (
-    <div className={CLASSE_PAGINA_APP} data-aba-dieta={marca} data-dieta-dia={dia} data-dieta-hoje={hoje}>
+    <div className={CLASSE_PAGINA_APP} data-aba-dieta={marca} data-dieta-dia={dia} data-dieta-hoje={hoje} data-dieta-dia-livre={livre.estado}>
       <div className="mt-1 flex items-center justify-between gap-3">
         <TituloApp>Dieta</TituloApp>
         {dados && matriculas.length > 0 && (
@@ -303,6 +339,8 @@ function DietaDaNutricionista() {
 
       {conteudo}
 
+      {comRotinas && <RotinasDaDieta />}
+
       {dados && (
         <>
           <SheetRefeicao
@@ -322,7 +360,21 @@ function DietaDaNutricionista() {
                   }
                 : null
             }
+            conteudoDoDia={
+              noDiaAberta ? (
+                <ItensDoDia itensDoPlano={noDiaAberta.itens} adicionados={noDiaAberta.adicionados} ocupado={livre.ocupado} desligado={desligado}
+                  podeAdicionar={refeicaoMarcavel(noDiaAberta.refeicao)} aviso={refeicaoMarcavel(noDiaAberta.refeicao) ? null : TEXTOS_DO_DIA.semAlimentoNoPlano}
+                  aoTirarDoPlano={(item) => void livre.gravar({ chave: `tirar:${item}`, fazer: () => tirarDoDia(hoje, item) })}
+                  aoVoltar={(id) => void livre.gravar({ chave: `voltar:${id}`, fazer: () => desfazerNoDia(id) })}
+                  aoAdicionar={() => abrir("adicionar", { r: noDiaAberta.refeicao.id }, true)} />
+              ) : undefined
+            }
+            totaisDoDia={noDiaAberta ? totaisDaRefeicaoNoDia(noDiaAberta) : undefined}
           />
+          {livre.aplicado && (
+            <FolhasDoDia folha={folha} params={params} abrir={abrir} fechar={fechar} aplicado={livre.aplicado} hoje={hoje} desligado={desligado}
+              gravar={livre.gravar} ocupado={livre.ocupado} />
+          )}
           <SheetPlano
             aberto={folha === "plano"}
             aoMudar={mudarFolha("plano")}
diff --git a/src/nutricao/app/ui/SheetRefeicao.tsx b/src/nutricao/app/ui/SheetRefeicao.tsx
index 2d3ae5e..05a29d7 100644
--- a/src/nutricao/app/ui/SheetRefeicao.tsx
+++ b/src/nutricao/app/ui/SheetRefeicao.tsx
@@ -1,14 +1,17 @@
+import type { ReactNode } from "react";
 import { Camera, Check, Repeat, Undo2 } from "lucide-react";
 import { Botao } from "@/ui/premium/Botao";
 import { PainelDeslizante } from "@/ui/premium/Sheet";
-import { descricaoQuantidade, descricaoSubstituto, fmtHorario, fmtKcal, fmtQtd, lerSubstitutos, macrosDoItem, totaisDosItens } from "../dietaUtil";
+import { descricaoQuantidade, descricaoSubstituto, fmtHorario, fmtKcal, fmtQtd, lerSubstitutos, macrosDoItem, totaisDosItens, type Totais } from "../dietaUtil";
 import { textoDias, normalizarDias } from "../metasUtil";
 import type { RefeicaoDoPlano } from "../tipos";
 
 /**
  * Folha da refeição (N-49): os alimentos com a quantidade (medida caseira ou gramas) e as kcal, os substitutos de cada alimento
  * ("ou 78 g de Pão, trigo, forma, integral" — até 6 por alimento, como o site antigo), as observações, os macros da refeição e,
- * embaixo, o ✓ (só hoje, no plano atual, com alimento) e a foto dela para o diário.
+ * embaixo, o ✓ (só hoje, no plano atual, com alimento) e a foto dela para o diário. W-A P5 (a Dieta "Pode mexer"): a lista do DIA entra no
+ * lugar da lista do plano (`conteudoDoDia` — src/dieta-livre/ui/ItensDoDia.tsx: "Tirar hoje", "Voltar", o que ele pôs e "Adicionar alimento")
+ * e as kcal e os macros passam a ser os do dia (`totaisDoDia`); sem os 2 (travada), a folha é a de antes.
  */
 export function SheetRefeicao({
   refeicao,
@@ -20,6 +23,8 @@ export function SheetRefeicao({
   desligado,
   aoMarcar,
   aoFoto,
+  conteudoDoDia,
+  totaisDoDia,
 }: {
   refeicao: RefeicaoDoPlano | null;
   aoFechar: () => void;
@@ -31,11 +36,16 @@ export function SheetRefeicao({
   desligado?: boolean;
   aoMarcar: (concluida: boolean) => void;
   aoFoto: (() => void) | null;
+  /** W-A P5: a lista do dia (só com a Dieta "Pode mexer") no lugar da lista do plano */
+  conteudoDoDia?: ReactNode;
+  /** W-A P5: os totais da refeição no dia (sem o que ele tirou, com o que pôs) */
+  totaisDoDia?: Totais | null;
 }) {
-  const t = refeicao ? totaisDosItens(refeicao.itens) : null;
+  const t = totaisDoDia ?? (refeicao ? totaisDosItens(refeicao.itens) : null);
+  const temItens = conteudoDoDia ? (t?.itens ?? 0) > 0 : !!refeicao?.itens.length;
   const hora = refeicao ? fmtHorario(refeicao.horario) : "";
   const dias = refeicao ? normalizarDias(refeicao.dias_semana) : [];
-  const partes = [hora, t && refeicao?.itens.length ? `${fmtKcal(t.energia_kcal)} kcal` : null, dias.length ? textoDias(dias) : null].filter(Boolean);
+  const partes = [hora, t && temItens ? `${fmtKcal(t.energia_kcal)} kcal` : null, dias.length ? textoDias(dias) : null].filter(Boolean);
   return (
     <PainelDeslizante
       aberto={!!refeicao}
@@ -62,7 +72,7 @@ export function SheetRefeicao({
       {refeicao && (
         <div className="flex flex-col gap-3" data-folha-refeicao={refeicao.id}>
           {foto && <img src={foto} alt="" aria-hidden className="h-40 w-full rounded-2xl border border-linha object-cover" data-folha-foto-diario />}
-          {refeicao.itens.length === 0 ? (
+          {conteudoDoDia ?? (refeicao.itens.length === 0 ? (
             <p className="rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] italic text-texto-3" data-refeicao-vazia>
               Sem alimentos nesta refeição.
             </p>
@@ -91,8 +101,8 @@ export function SheetRefeicao({
                 );
               })}
             </ul>
-          )}
-          {t && refeicao.itens.length > 0 && (
+          ))}
+          {t && temItens && (
             <div className="grid grid-cols-3 gap-2" data-folha-macros>
               {[
                 ["Proteína", t.proteina_g],
```

- [ ] **Step 3: Commit** — `feat(w-a): a Dieta "Pode mexer" no app do aluno (tirar só hoje, pôr, a refeição extra, meus alimentos e receitas, o anel do que ele comeu) e as rotinas no fim da Dieta`
  com `src/app-aluno/abas/Dieta.tsx src/app-aluno/abas/Dieta.test.tsx src/nutricao/app/ui/SheetRefeicao.tsx`; `feita.sh 3 "aba Dieta 24/24 (+ vizinhos)" "<placar>"`.

---

### Task 4: O E2E novo — `e2e/wa/telas_dieta.py` (`--seco`, compila) + as guardas

**Files:** Create `e2e/wa/telas_dieta.py`.
**Estimativa:** 15 min (calibrado 3–5).

- [ ] **Step 1: O arquivo e as provas sem rede**

Run: `cd ~/projetos/physiqcalc-wa-p5 && bash ~/projetos/physiqcalc-scratch/w-a/p5/copiar.sh e2e/wa/telas_dieta.py && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/telas_dieta.py --seco && python3 -c "compile(open('e2e/wa/telas_dieta.py').read(), 'telas_dieta.py', 'exec'); print('compila ok')"`
Expected: `56/56 seletores e textos do E2E no código` e `compila ok`.

`e2e/wa/telas_dieta.py`:
```python
#!/usr/bin/env python3
"""Physiq W-A P5 — E2E de TELA da dieta liberada no app do aluno (Edge; celular 390 × 844). Spec W-A §4.3, §4.4, §6 "P5", §7.
Contas de TESTE (hml-17): w5p-aluna (a aluna dos 2 profissionais: a matrícula A com o plano de 22 itens), w5p-nutri (libera e trava a Dieta da
A pela função acessos — o interruptor da P4), w13-dono (a 2ª matrícula da aluna na conta dele, com a nutricionista = ele SÓ no caso D10, pela
Massa do _base.py) e w7b-sozinho (o app sem profissional com Alimentação: os pratos prontos — só lê). Casos (na ordem; cada um depende do anterior):
  D0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  D1  d_travada        a Dieta "Só ver" (o padrão): a tela de hoje — nenhum botão da dieta liberada, a folha sem "Tirar hoje"; ao abrir, 0
                       gravação e ≥ 1 `ler` q=dia (data-dieta-dia-livre = travada)
  D2  d_liberada       a nutri libera (acessos › salvar dieta=mexer): "Nova refeição" e "Meus alimentos e receitas" aparecem
  D3  d_tirar          a folha da 1ª refeição com alimento: "Tirar hoje" no último item → riscado + "Voltar"; no banco o "tirado" de hoje;
                       "Voltar" → desfeito; tira de novo (fica para o anel); sem internet (o navegador offline) → os botões desligados
  D4  d_adicionar      "Adicionar alimento" → a busca "arroz" → um da TACO → 150 g → "Pôr no dia"; no banco o "adicionado" com as gramas
  D5  d_receita        "Meus alimentos e receitas": o alimento "<marca> pão" (por 100 g, porção 50 g) e a receita "<marca> vitamina" (o pão +
                       um arroz da TACO, 2 porções); no banco: dela, com os ingredientes
  D6  d_extra          "Nova refeição" "<marca> lanche" ("Já comi" ligado) → abrir → "Adicionar alimento" → a receita (1 porção) e o pão dela
                       em PORÇÕES (2 × 50 g); no banco a extra da matrícula A com a receita e o pão em 100 g
  D7  d_totais         a linha da 1ª refeição = a conta do banco (os itens do plano sem o tirado + o que ela pôs); ✓ nela → o anel sobe o mesmo
                       tanto (o que ela comeu); no banco a refeição feita hoje; desmarca no fim
  D8  d_rotinas        a seção "Rotinas de hoje" no fim da Dieta com a "<marca> Creatina" (pela função, como a aluna) · d_rotinas_pratos: nos
                       pratos prontos (w7b-sozinho), só lendo
  D9  d_voltou_travada com a folha de outra refeição aberta, a nutri trava (dieta=ver) → "Tirar hoje" → o toast "A sua dieta voltou a ser só para
                       ver." e a tela volta ao "só ver"; no banco nada novo
  D10 2 matrículas     a 2ª matrícula (conta do w13-dono, a nutri = ele) liberada pelo dono e a A travada → a tela segue travada (o plano ativo é o
                       da A); a A liberada → liberada
  D11 mudar e apagar   "Meus alimentos e receitas": o pão 280 → 300 kcal (no banco); apagar a receita e o pão com a confirmação do app (no banco a
                       lixeira; o dia segue com o retrato)
  --loja: D0 + D1 + D2 + D3 + D8 (só a aluna) — os prints com o prefixo loja_.
  --velho: o "APK velho" — o build de ANTES da P5 (a main sem ela, servido na 5173 pelo velho.sh) com a Dieta LIBERADA: V1 d_apk_velho a tela de
           hoje (nada da P5, nenhum `ler` q=dia) e o ✓ do plano marca e desmarca como antes.
A rodada vai para o estado (~/projetos/physiqcalc-scratch/w-a/p5-estado.json) ANTES de qualquer escrita: a foto da matrícula A (os acessos, os ✓ de
hoje); a massa leva a marca "WA E2E P5 <hhmmss>". No fim (e no --limpar): os acessos da A voltam à foto, os ✓ de hoje também, o que ela pôs/tirou no
dia desde o começo, as extras, os alimentos, as receitas e as rotinas com a marca, o histórico e os avisos da rodada saem, e a Massa (a 2ª
matrícula) é desfeita — as sobras = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging (https://physiqcalc-staging.vercel.app)
· prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador; a conta de teste da produção aluno-calc é só de Treino — P1 o Início e
a Dieta (se a conta a tiver) abrem sem gravar; print prod_d_inicio; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p5/<base>[-loja|-velho]/.
Saída: ~/projetos/physiqcalc-scratch/w-a/p5/telas_dieta_<base>.txt (só contagens, kcal das contas de TESTE, status e códigos). Logout local das
sessões do teste (nunca o global).
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código.
Uso: python3 e2e/wa/telas_dieta.py --base local|staging|prod [--loja | --velho] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
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
ESTADO = B.SCRATCH / "w-a" / "p5-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p5"
TITULOS_WA = ("Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia", "Seu profissional criou uma rotina para você")
TRAVOU = "A sua dieta voltou a ser só para ver."

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/app-aluno/abas/Dieta.tsx": ["data-dieta-dia-livre={livre.estado}", "data-dieta-rotinas", "<RotinasDeHoje origem=\"dieta\" />",
                                     "conteudoDoDia=", "totaisDoDia="],
    "src/dieta-livre/useDiaLivre.ts": ['"sem" | "lendo" | "travada" | "liberada"'],
    "src/dieta-livre/ui/DiaLivre.tsx": ['data-dieta-livre="liberada"', "data-dieta-nova-refeicao", "data-dieta-meus", "data-extra={e.extra.id}"],
    "src/dieta-livre/ui/ItensDoDia.tsx": ["data-item-tirar={item.id}", "data-item-voltar={item.id}", 'data-item-tirado={tirado ? "1" : "0"}',
                                          "data-item-posto={i.id}", "data-item-posto-tirar={i.id}", "data-dieta-adicionar"],
    "src/dieta-livre/ui/BuscaDeAlimentos.tsx": ["data-busca-termo", "data-busca-item={i.id}", "data-busca-tipo={i.tipo}", "data-busca-alimentos="],
    "src/dieta-livre/ui/FolhaAdicionar.tsx": ["data-folha-adicionar=", "data-quantidade", "data-escolha-por", "data-quantidade-macros="],
    "src/dieta-livre/ui/FolhaExtra.tsx": ["data-folha-extra=", "data-extra-nome", "data-extra-salvar", "data-extra-feita="],
    "src/dieta-livre/ui/FolhaMeusAlimentos.tsx": ["data-folha-meus={vista.tipo}", "data-meus-estado=\"lista\"", "data-meus-novo-alimento", "data-alimento-nome",
                                                  "data-alimento-porcao", "data-alimento-macro={m.chave}", "data-alimento-salvar", "data-meus-nova-receita",
                                                  "data-receita-nome", "data-receita-porcoes", "data-receita-adicionar", "data-receita-item-qtd={i.chave}",
                                                  "data-receita-salvar", "data-meu-alimento={a.id}", "data-minha-receita={r.id}", "data-alimento-apagar",
                                                  "data-receita-apagar"],
    "src/dieta-livre/textos.ts": ['"Tirar hoje"', '"Nova refeição"', '"Meus alimentos e receitas"', '"Pôr no dia"'],
    "src/aluno-dia/api.ts": ['dieta_travada: "A sua dieta voltou a ser só para ver."'],
    "src/rotinas/ui/RotinasDeHoje.tsx": ['"data-card-rotinas-dieta"'],
    "src/nutricao/app/ui/LinhaRefeicao.tsx": ["data-refeicao-abrir", 'data-refeicao-marcar="feito"', 'data-refeicao-marcar="desmarcar"', "data-refeicao-kcal"],
    "src/nutricao/app/ui/CartaoPlano.tsx": ["data-kcal-marcadas="],
}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p5") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.ids: dict[str, str] = {}
        self.pre = ""

    def tela(self, nav, nome: str, desktop: bool = False, guarda=None) -> B.Tela:
        return B.Tela(nav, self.base, "p5", nome, desktop=desktop, guarda=guarda)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, f"{self.pre}{caso}")
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a limpeza) e as funções ─────────────────────────
def funcao(nome: str, token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": ORIGEM}
    st, r, _h = B5.http("POST", f"{B.H.API_P}/functions/v1/{nome}", corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def foto() -> dict:
    """SÓ LEITURA: a matrícula A, o plano ativo de hoje (as refeições com alimento, na ordem da tela, com os itens), os acessos e os ✓ de hoje."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                    and p.personal_id = {u('w5p-personal')} order by p.created_at limit 1),
           hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
      select (select id::text from a) as pac_a, {u('w5p-aluna')}::text as aluna, {u('w5p-nutri')}::text as nutri, {u('w13-dono')}::text as w13,
             (select d::text from hoje) as hoje, {S}.wa_plano_ativo({u('w5p-aluna')})::text as plano,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select coalesce(jsonb_agg(rc.refeicao_id::text), '[]'::jsonb) from {S}.refeicoes_concluidas rc, a, hoje
               where rc.paciente_id = a.id and rc.data = hoje.d) as concluidas_a""")[0]
    refs = B.ler(f"""select r.id::text as id, (select coalesce(json_agg(i.id::text order by i.ordem, i.created_at), '[]'::json)
                                                 from {S}.itens_refeicao i where i.refeicao_id = r.id) as itens
                       from {S}.refeicoes r
                      where r.plano_id = {B.txt(r['plano'])}
                        and (cardinality(r.dias_semana) = 0 or extract(isodow from {B.txt(r['hoje'])}::date)::smallint = any(r.dias_semana))
                      order by r.ordem, to_char(r.horario, 'HH24:MI'), r.nome""") if r["plano"] else []
    com = [x for x in refs if x["itens"]]
    if not (r["pac_a"] and len(com) >= 2):
        raise SystemExit("massa de TESTE incompleta no staging (a matrícula A da w5p-aluna com 2 refeições de hoje com alimento) — nada foi gravado")
    if r["concluidas_a"]:
        raise SystemExit(f"a w5p-aluna já tem {len(r['concluidas_a'])} refeição(ões) feita(s) hoje: o D7 precisa da 1ª pendente — conferir no quadro (nada foi gravado)")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    return {**r, "r1": com[0]["id"], "item1": com[0]["itens"][-1], "r2": com[1]["id"], "item2": com[1]["itens"][0]}


def nivel_dieta(e: dict, pac: str | None = None) -> str:
    r = B.ler(f"select nivel from {S}.aluno_acessos where paciente_id = {B.txt(pac or e['pac_a'])} and chave = 'dieta'")
    return r[0]["nivel"] if r else "ver"


def mudar_dieta(R: Rodada, conta: str, pac: str, valor: str) -> bool:
    st, r = funcao("acessos", R.L.token(conta), {"acao": "salvar", "aluno": pac, "chave": "dieta", "valor": valor})
    return st == 200 and (r.get("linhas") or {}).get("dieta") == valor


def itens_do_dia(e: dict) -> list[dict]:
    return B.ler(f"""select i.id::text as id, i.tipo, i.refeicao_id::text as refeicao_id, i.extra_id::text as extra_id,
                            i.item_refeicao_id::text as item, i.alimento_id::text as alimento_id, i.aluno_receita_id::text as receita_id,
                            i.quantidade_g::float as gramas, i.porcoes::float as porcoes, i.deleted_at is not null as desfeito, i.paciente_id::text as pac
                       from {S}.aluno_dia_itens i
                      where i.dono_user_id = {B.txt(e['aluna'])} and i.dia = {B.txt(e['hoje'])}::date and i.criado_em >= {B.txt(e['inicio'])}
                      order by i.criado_em""")


def da_marca(e: dict, tabela: str) -> list[dict]:
    return B.ler(f"""select x.id::text as id, x.nome from {S}.{tabela} x where x.dono_user_id = {B.txt(e['aluna'])} and x.nome like {B.txt(e['marca'] + '%')}
                      order by x.criado_em""")


def kcal_do_dia(e: dict, refeicao: str) -> float:
    """A conta do BANCO da refeição no dia: os itens do plano que ela não tirou (as gramas pela medida caseira, como o app) + o que ela pôs."""
    r = B.ler(f"""
      with plano as (
        select i.id, round(coalesce((select round(i.quantidade_medida * m.gramas, 2) from {S}.medidas_caseiras m
                                      where m.id = i.medida_caseira_id and m.alimento_id = i.alimento_id and i.quantidade_medida > 0),
                                    i.quantidade_g) * coalesce(a.energia_kcal, 0) / 100, 2) as kcal
          from {S}.itens_refeicao i join {S}.alimentos a on a.id = i.alimento_id where i.refeicao_id = {B.txt(refeicao)}),
      dia as (select * from {S}.aluno_dia_itens x where x.dono_user_id = {B.txt(e['aluna'])} and x.dia = {B.txt(e['hoje'])}::date
                and x.deleted_at is null and x.refeicao_id = {B.txt(refeicao)})
      select ((select coalesce(sum(kcal), 0) from plano where id not in (select item_refeicao_id from dia where tipo = 'tirado' and item_refeicao_id is not null))
             + (select coalesce(sum(energia_kcal), 0) from dia where tipo = 'adicionado'))::float as kcal""")
    return float(r[0]["kcal"] or 0)


def concluida_hoje(e: dict, refeicao: str) -> bool:
    return bool(B.ler(f"""select count(*) as n from {S}.refeicoes_concluidas where paciente_id = {B.txt(e['pac_a'])} and refeicao_id = {B.txt(refeicao)}
                          and data = {B.txt(e['hoje'])}::date""")[0]["n"])


def _acessos_sql(e: dict) -> list[str]:
    pa = B.txt(e["pac_a"])
    return [f"delete from {S}.aluno_acessos where paciente_id = {pa}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({pa}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []]]


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    al, ini, marca = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
    titulos = ", ".join(B.txt(t) for t in TITULOS_WA)
    r = B.ler(f"""select (select count(*) from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}) as itens_do_dia,
                         (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}) as extras,
                         (select count(*) from {S}.aluno_alimentos where dono_user_id = {al} and nome like {marca}) as alimentos,
                         (select count(*) from {S}.aluno_receitas where dono_user_id = {al} and nome like {marca}) as receitas,
                         (select count(*) from {S}.rotinas where dono_user_id = {al} and nome like {marca}) as rotinas,
                         (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and titulo in ({titulos})
                            and criado_em >= {ini}) as avisos,
                         (select count(*) from {S}.refeicoes_concluidas where paciente_id = {B.txt(e['pac_a'])} and data = {B.txt(e['hoje'])}::date
                            and refeicao_id::text <> all({B.txt('{' + ','.join(e.get('concluidas_a') or []) + '}')}::text[])) as concluidas_novas,
                         ((select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel) order by x.chave), '[]'::jsonb)
                             from {S}.aluno_acessos x where x.paciente_id = {B.txt(e['pac_a'])})
                           is distinct from {B.txt(json.dumps([{'chave': y['chave'], 'nivel': y['nivel']} for y in e.get('acessos_a') or []]))}::jsonb)::int
                           as acessos_diferentes""")[0]
    return {k: int(v) for k, v in r.items()}


def limpar(e: dict | None = None) -> dict:
    """Desfaz a rodada pelo estado e a Massa do _base.py (a 2ª matrícula); devolve as sobras (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8") or "{}") if ESTADO.exists() else {})
    sobras: dict = {}
    if e.get("pac_a") and e.get("marca"):
        al, ini, marca, pa = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%"), B.txt(e["pac_a"])
        titulos = ", ".join(B.txt(t) for t in TITULOS_WA)
        antes = B.txt("{" + ",".join(e.get("concluidas_a") or []) + "}")
        for c in (
            f"delete from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.aluno_receitas where dono_user_id = {al} and nome like {marca}",
            f"delete from {S}.aluno_alimentos where dono_user_id = {al} and nome like {marca}",
            f"delete from {S}.rotinas where dono_user_id = {al} and nome like {marca}",
            f"""delete from {S}.refeicoes_concluidas where paciente_id = {pa} and data = {B.txt(e['hoje'])}::date
                 and refeicao_id::text <> all({antes}::text[])""",
            *_acessos_sql(e),
            f"delete from {S}.aluno_acessos_log where paciente_id = {pa} and em >= {ini}",
            f"delete from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and criado_em >= {ini} and titulo in ({titulos})",
        ):
            B.escrever(c)
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text("{}", encoding="utf-8")
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas à aluno-dia que NÃO são leitura (a Guarda: leitura = { acao: "ler" })."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] != "ler"]


def leituras_do_dia(t: B.Tela) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] == "ler" and '"q":"dia"' in (p["corpo"] or "").replace(" ", ""))


def estado_livre(t: B.Tela) -> str:
    return (t.attr("[data-aba-dieta]", "data-dieta-dia-livre") or [""])[0] or ""


def abrir_dieta(t: B.Tela, R: Rodada, conta: str, rota: str = "/dieta", esperar: str | None = "travada") -> bool:
    t.entrar(R.L, conta, rota)
    t.caso.fechar_avisos()
    ok = t.esperar(lambda: t.tem('[data-aba-dieta="plano"]'), 60)
    if ok and esperar:
        ok = t.esperar(lambda: estado_livre(t) == esperar, 45)
    return ok


def ir_dieta(t: B.Tela, rota: str = "/dieta", esperar: str = "liberada") -> bool:
    t.ir(rota)
    return t.esperar(lambda: t.tem('[data-aba-dieta="plano"]'), 60) and t.esperar(lambda: estado_livre(t) == esperar, 45)


def numero(texto: str) -> float:
    m = re.search(r"-?[\d.]+", (texto or "").replace(".", "").replace(",", "."))
    return float(m.group(0)) if m else 0.0


def kcal_marcadas(t: B.Tela) -> float:
    return float((t.attr("[data-kcal-marcadas]", "data-kcal-marcadas") or ["0"])[0] or 0)


def kcal_da_linha(t: B.Tela, refeicao: str) -> float:
    return numero(t.texto(f'[data-refeicao="{refeicao}"] [data-refeicao-kcal] b'))


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build")
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "D0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"D0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def caso_travada(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "travada")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna")
        t.pg.wait_for_timeout(2000)
        o.ok(ok and t.n("[data-dieta-livre]") == 0 and t.n("[data-dieta-nova-refeicao]") == 0 and t.n("[data-dieta-meus]") == 0,
             f"D1 'Só ver': a Dieta de hoje, sem nada da dieta liberada (estado {estado_livre(t)!r})")
        o.ok(not gravacoes_ao_abrir(t) and leituras_do_dia(t) >= 1, f"D1 ao abrir: 0 gravação na aluno-dia ({gravacoes_ao_abrir(t) or '—'}) e {leituras_do_dia(t)} `ler` q=dia")
        R.print(t, "d_travada")
        t.clicar(f'[data-refeicao="{e["r1"]}"] [data-refeicao-abrir]')
        ok = t.esperar(lambda: t.tem(f'[data-folha-refeicao="{e["r1"]}"]'), 20)
        o.ok(ok and t.n("[data-item-tirar]") == 0 and t.n("[data-dieta-adicionar]") == 0, "D1 a folha da refeição como hoje (sem 'Tirar hoje' nem 'Adicionar alimento')")
    finally:
        t.fim()


def caso_liberada_e_tirar(o, nav, R: Rodada) -> None:
    e = R.e
    ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
    o.ok(ok and nivel_dieta(e) == "mexer", "D2 a nutri libera a Dieta da A pela função acessos (no banco: 'mexer')")
    t = R.tela(nav, "liberada")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", esperar="liberada")
        o.ok(ok and t.tem('[data-dieta-livre="liberada"]') and t.n("[data-dieta-meus]") == 1 and t.n("[data-dieta-nova-refeicao]") == 1,
             "D2 'Pode mexer': 'Nova refeição' e 'Meus alimentos e receitas' embaixo das refeições")
        t.pg.eval_on_selector('[data-dieta-livre="liberada"]', "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "d_liberada")
        r1, it = e["r1"], e["item1"]
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-abrir]')
        t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r1}"] [data-item-tirar="{it}"]'), 20)
        t.clicar(f'[data-item-tirar="{it}"]')
        tirado = lambda: (t.attr(f'[data-item="{it}"]', "data-item-tirado") or [""])[0]  # noqa: E731
        ok = t.esperar(lambda: tirado() == "1", 20)
        linhas = [x for x in itens_do_dia(e) if x["tipo"] == "tirado" and x["item"] == it and not x["desfeito"]]
        o.ok(ok and len(linhas) == 1 and linhas[0]["pac"] == e["pac_a"], f"D3 'Tirar hoje': riscado na hora e no banco o 'tirado' de hoje da A ({len(linhas)})")
        R.print(t, "d_tirar")
        t.clicar(f'[data-item-voltar="{it}"]')
        ok = t.esperar(lambda: tirado() == "0", 20)
        desfeitos = [x for x in itens_do_dia(e) if x["tipo"] == "tirado" and x["item"] == it and x["desfeito"]]
        o.ok(ok and len(desfeitos) == 1, "D3 'Voltar': o item volta (no banco, o 'tirado' desfeito)")
        t.clicar(f'[data-item-tirar="{it}"]')
        o.ok(t.esperar(lambda: tirado() == "1", 20), "D3 tira de novo (fica para o anel do D7)")
        desligado = lambda s: bool(t.pg.evaluate("(s) => { const b = document.querySelector(s); return !!b && b.disabled; }", s))  # noqa: E731
        t.ctx.set_offline(True)
        ok = t.esperar(lambda: desligado(f'[data-item-voltar="{it}"]') and desligado(f'[data-folha-refeicao="{r1}"] [data-dieta-adicionar]'), 15)
        t.ctx.set_offline(False)
        o.ok(ok and t.esperar(lambda: not desligado(f'[data-item-voltar="{it}"]'), 15), "D3 sem internet: os botões desligados (como o ✓ de hoje); a rede voltou → ligados")
    finally:
        t.fim()


def caso_adicionar(o, nav, R: Rodada) -> None:
    e = R.e
    r1 = e["r1"]
    t = R.tela(nav, "adicionar")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", f"/dieta?ver=refeicao&r={r1}", esperar="liberada")
        ok = ok and t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r1}"] [data-dieta-adicionar]'), 20)
        t.clicar(f'[data-folha-refeicao="{r1}"] [data-dieta-adicionar]')
        t.esperar(lambda: t.tem('[data-folha-adicionar="refeicao"] [data-busca-termo]'), 20)
        t.pg.locator("[data-busca-termo]").fill("arroz")
        ok = t.esperar(lambda: t.n('[data-busca-tipo="taco"]') > 0, 30)
        o.ok(ok, f"D4 a busca 'arroz' acha a TACO ({t.n('[data-busca-tipo]')} resultados)")
        escolhido = (t.attr('[data-busca-tipo="taco"]', "data-busca-item") or [""])[0]
        t.pg.locator('[data-busca-tipo="taco"]').first.click()
        t.esperar(lambda: t.tem("[data-quantidade]"), 15)
        t.pg.locator("[data-quantidade]").fill("150")
        t.pg.wait_for_timeout(400)
        R.print(t, "d_adicionar")
        t.clicar("[data-escolha-por]")
        ok = t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r1}"] [data-item-posto]'), 30)
        postos = [x for x in itens_do_dia(e) if x["tipo"] == "adicionado" and x["refeicao_id"] == r1 and not x["desfeito"]]
        o.ok(ok and len(postos) == 1 and postos[0]["alimento_id"] == escolhido and abs(postos[0]["gramas"] - 150) < 0.01,
             f"D4 'Pôr no dia': volta à refeição com o 'você pôs'; no banco o adicionado de 150 g ({[(x['alimento_id'] == escolhido, x['gramas']) for x in postos]})")
    finally:
        t.fim()


def caso_meus(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "meus")
    try:
        abrir_dieta(t, R, "w5p-aluna", "/dieta?ver=meus", esperar="liberada")
        t.esperar(lambda: t.tem('[data-folha-meus="lista"] [data-meus-estado="lista"]'), 30)
        t.clicar("[data-meus-novo-alimento]")
        t.esperar(lambda: t.tem("[data-alimento-nome]"), 15)
        pao = f"{e['marca']} pão"
        t.pg.locator("[data-alimento-nome]").fill(pao)
        t.pg.locator("[data-alimento-porcao]").fill("50")
        for chave, valor in (("energia_kcal", "280"), ("proteina_g", "9"), ("carboidrato_g", "50"), ("lipidio_g", "3")):
            t.pg.locator(f'[data-alimento-macro="{chave}"]').fill(valor)
        t.clicar("[data-alimento-salvar]")
        ok = t.esperar(lambda: t.tem('[data-folha-meus="lista"]') and any(x["nome"] == pao for x in da_marca(e, "aluno_alimentos")), 30, 1)
        o.ok(ok, "D5 o alimento dela (por 100 g, porção 50 g) pela folha; no banco: dela")
        t.pg.get_by_role("radio", name=re.compile("Receitas")).click()
        t.clicar("[data-meus-nova-receita]")
        t.esperar(lambda: t.tem("[data-receita-nome]"), 15)
        vitamina = f"{e['marca']} vitamina"
        t.pg.locator("[data-receita-nome]").fill(vitamina)
        t.pg.locator("[data-receita-porcoes]").fill("2")
        termo = e["marca"].split(" ")[-1]   # o hhmmss da marca: acha o pão desta rodada
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-termo]').fill(termo)
        t.esperar(lambda: t.n('[data-busca-alimentos="ingrediente"] [data-busca-tipo="meu"]') > 0, 30)
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-tipo="meu"]').first.click()
        t.clicar("[data-receita-adicionar]")
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-termo]').fill("arroz")
        t.esperar(lambda: t.n('[data-busca-alimentos="ingrediente"] [data-busca-tipo="taco"]') > 0, 30)
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-tipo="taco"]').first.click()
        t.esperar(lambda: t.n("[data-receita-item]") == 2, 10)
        R.print(t, "d_receita")
        t.clicar("[data-receita-salvar]")
        ok = t.esperar(lambda: t.tem('[data-folha-meus="lista"]') and any(x["nome"] == vitamina for x in da_marca(e, "aluno_receitas")), 30, 1)
        rec = next((x for x in da_marca(e, "aluno_receitas") if x["nome"] == vitamina), None)
        n_itens = int(B.ler(f"select count(*) as n from {S}.aluno_receita_itens where receita_id = {B.txt(rec['id'])}")[0]["n"]) if rec else 0
        o.ok(ok and n_itens == 2, f"D5 a receita dela (o pão + a TACO, 2 porções) pela folha; no banco com {n_itens} ingredientes")
        if rec:
            R.ids["receita"] = rec["id"]
    finally:
        t.fim()


def caso_extra(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "extra")
    try:
        abrir_dieta(t, R, "w5p-aluna", esperar="liberada")
        t.clicar("[data-dieta-nova-refeicao]")
        t.esperar(lambda: t.tem('[data-folha-extra="nova"] [data-extra-nome]'), 15)
        lanche = f"{e['marca']} lanche"
        t.pg.locator("[data-extra-nome]").fill(lanche)
        t.clicar("[data-extra-salvar]")
        ok = t.esperar(lambda: any(x["nome"] == lanche for x in B.ler(f"""select nome from {S}.aluno_dia_refeicoes where dono_user_id = {B.txt(e['aluna'])}
                                                                         and criado_em >= {B.txt(e['inicio'])}""")), 30, 1)
        ext = B.ler(f"""select id::text as id, paciente_id::text as pac, concluida_em is not null as comi from {S}.aluno_dia_refeicoes
                         where dono_user_id = {B.txt(e['aluna'])} and nome = {B.txt(lanche)}""")
        o.ok(ok and ext and ext[0]["pac"] == e["pac_a"] and ext[0]["comi"], f"D6 'Nova refeição' com 'Já comi': no banco a extra da matrícula A ({ext[:1]})")
        if not ext:
            return
        eid = ext[0]["id"]
        t.esperar(lambda: t.tem(f'[data-extra="{eid}"] [data-refeicao-abrir]'), 20)
        t.clicar(f'[data-extra="{eid}"] [data-refeicao-abrir]')
        t.esperar(lambda: t.tem(f'[data-folha-extra="{eid}"] [data-dieta-adicionar]'), 20)
        t.clicar(f'[data-folha-extra="{eid}"] [data-dieta-adicionar]')
        t.esperar(lambda: t.tem('[data-folha-adicionar="extra"] [data-busca-termo]'), 20)
        t.pg.locator("[data-busca-termo]").fill(f"{e['marca'].split(' ')[-1]} vitamina")
        t.esperar(lambda: t.n('[data-busca-tipo="receita"]') > 0, 30)
        t.pg.locator('[data-busca-tipo="receita"]').first.click()
        t.esperar(lambda: t.tem("[data-quantidade]"), 15)
        t.clicar("[data-escolha-por]")
        ok = t.esperar(lambda: t.tem(f'[data-folha-extra="{eid}"] [data-item-posto]'), 30)
        R.print(t, "d_extra")
        postos = [x for x in itens_do_dia(e) if x["extra_id"] == eid and not x["desfeito"]]
        o.ok(ok and len(postos) == 1 and postos[0]["receita_id"] == R.ids.get("receita") and postos[0]["porcoes"] == 1,
             f"D6 a receita (1 porção) na extra pela busca; no banco: {[(x['receita_id'] == R.ids.get('receita'), x['porcoes']) for x in postos]}")
        # o alimento DELE em porções (2 × a porção de 50 g = 100 g no banco — o servidor só aceita porções na receita)
        t.clicar(f'[data-folha-extra="{eid}"] [data-dieta-adicionar]')
        t.esperar(lambda: t.tem('[data-folha-adicionar="extra"] [data-busca-termo]'), 20)
        t.pg.locator("[data-busca-termo]").fill(e["marca"].split(" ")[-1])
        t.esperar(lambda: t.n('[data-busca-tipo="meu"]') > 0, 30)
        t.pg.locator('[data-busca-tipo="meu"]').first.click()
        t.esperar(lambda: t.tem("[data-quantidade]"), 15)
        t.pg.get_by_role("radio", name=re.compile("Porções")).click()
        t.pg.locator("[data-quantidade]").fill("2")
        t.clicar("[data-escolha-por]")
        ok = t.esperar(lambda: t.n(f'[data-folha-extra="{eid}"] [data-item-posto]') == 2, 30)
        meus = [x for x in itens_do_dia(e) if x["extra_id"] == eid and not x["desfeito"] and x["receita_id"] is None]
        o.ok(ok and len(meus) == 1 and abs((meus[0]["gramas"] or 0) - 100) < 0.01, f"D6 o pão dela em porções (2 × 50 g) na extra; no banco: {[x['gramas'] for x in meus]} g")
    finally:
        t.fim()


def caso_totais(o, nav, R: Rodada) -> None:
    e = R.e
    r1 = e["r1"]
    t = R.tela(nav, "totais")
    try:
        abrir_dieta(t, R, "w5p-aluna", esperar="liberada")
        t.pg.wait_for_timeout(1500)
        linha, banco = kcal_da_linha(t, r1), kcal_do_dia(e, r1)
        o.ok(abs(linha - round(banco)) <= 1, f"D7 a linha da 1ª refeição = a conta do banco (sem o tirado, com o que ela pôs): tela {linha} × banco {banco:.2f}")
        x0 = kcal_marcadas(t)
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="feito"]')
        estado = lambda: (t.attr(f'[data-refeicao="{r1}"]', "data-refeicao-estado") or [""])[0]  # noqa: E731
        ok = t.esperar(lambda: estado() == "feita", 20) and t.esperar(lambda: concluida_hoje(e, r1), 20, 1)
        t.pg.wait_for_timeout(1500)
        x1 = kcal_marcadas(t)
        o.ok(ok and abs((x1 - x0) - linha) <= 2, f"D7 ✓ na refeição: o anel sobe o que ela comeu nela ({x0} → {x1}; a linha {linha}); no banco feita hoje")
        R.print(t, "d_totais")
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="desmarcar"]')
        o.ok(t.esperar(lambda: not concluida_hoje(e, r1), 20, 1), "D7 desmarca (o ✓ de antes volta)")
    finally:
        t.fim()


def caso_rotinas(o, nav, R: Rodada, so_aluna: bool = False) -> None:
    e = R.e
    hora = (dt.datetime.now(SP) + dt.timedelta(minutes=30)).strftime("%H:%M")
    st, r = funcao("aluno-dia", R.L.token("w5p-aluna"), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Creatina", "detalhe": "5 g",
                                                                                              "tipo": "suplemento", "horario": hora, "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": False}})
    o.ok(st == 200 and r.get("ok") is True, f"D8 a rotina 'Creatina' pela função, como a aluna ({st})")
    t = R.tela(nav, "rotinas")
    try:
        abrir_dieta(t, R, "w5p-aluna", esperar=None)
        ok = t.esperar(lambda: (t.attr("[data-card-rotinas-dieta]", "data-card-rotinas-dieta") or [""])[0] == "lista", 45)
        o.ok(ok and "Creatina" in t.texto("[data-card-rotinas-dieta]"), "D8 'Rotinas de hoje' no fim da Dieta com a Creatina")
        if ok:
            t.pg.eval_on_selector("[data-card-rotinas-dieta]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "d_rotinas")
    finally:
        t.fim()
    if so_aluna:
        return
    t = R.tela(nav, "rotinas-pratos")
    try:
        t.entrar(R.L, "w7b-sozinho", "/dieta")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem('[data-aba-dieta="pratos"]'), 60)
        ok = ok and t.esperar(lambda: (t.attr("[data-card-rotinas-dieta]", "data-card-rotinas-dieta") or [""])[0] not in ("", "carregando"), 45)
        o.ok(ok and not gravacoes_ao_abrir(t), f"D8 nos pratos prontos (o app sem profissional): a seção no fim ({(t.attr('[data-card-rotinas-dieta]', 'data-card-rotinas-dieta') or ['—'])[0]}); 0 gravação")
        if ok:
            t.pg.eval_on_selector("[data-card-rotinas-dieta]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "d_rotinas_pratos")
    finally:
        t.fim()


def caso_travou_no_meio(o, nav, R: Rodada) -> None:
    e = R.e
    r2, it = e["r2"], e["item2"]
    t = R.tela(nav, "travou")
    try:
        abrir_dieta(t, R, "w5p-aluna", f"/dieta?ver=refeicao&r={r2}", esperar="liberada")
        t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r2}"] [data-item-tirar="{it}"]'), 20)
        ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "ver")
        o.ok(ok, "D9 com a folha aberta, a nutri trava a Dieta (dieta=ver)")
        t.clicar(f'[data-item-tirar="{it}"]')
        toast = t.pg.locator("[data-sonner-toast]", has_text=TRAVOU)
        ok = t.esperar(lambda: toast.count() > 0, 20)
        ok = ok and t.esperar(lambda: estado_livre(t) == "travada" and t.n("[data-dieta-livre]") == 0, 30)
        R.print(t, "d_voltou_travada")
        tirados = [x for x in itens_do_dia(e) if x["item"] == it]
        o.ok(ok and not tirados, f"D9 'Tirar hoje' → o toast '{TRAVOU}' e a tela volta ao 'só ver'; no banco nada novo ({len(tirados)})")
    finally:
        t.fim()


def caso_duas_matriculas(o, nav, R: Rodada) -> None:
    e = R.e
    b = B.Massa().segunda_matricula()
    B.escrever(f"update {S}.pacientes set nutricionista_id = {B.txt(e['w13'])} where id = {B.txt(b)} and config ? 'wa_e2e'")
    ok = mudar_dieta(R, "w13-dono", b, "mexer")
    o.ok(ok and nivel_dieta(e) == "ver", f"D10 a 2ª matrícula (conta do w13-dono, a nutri = ele) liberada; a A segue 'ver' ({nivel_dieta(e)})")
    t = R.tela(nav, "duas")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", esperar="travada")
        o.ok(ok and t.n("[data-dieta-livre]") == 0, "D10 a outra matrícula liberada NÃO libera a tela: vale a do plano ativo (a A)")
        mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
        ok = ir_dieta(t, esperar="liberada")
        o.ok(ok and t.tem('[data-dieta-livre="liberada"]'), "D10 a A liberada → a tela liberada")
    finally:
        t.fim()


def caso_mudar_e_apagar(o, nav, R: Rodada) -> None:
    e = R.e
    pao = next((x for x in da_marca(e, "aluno_alimentos") if x["nome"].endswith(" pão")), None)
    rec = R.ids.get("receita")
    t = R.tela(nav, "apagar")
    try:
        abrir_dieta(t, R, "w5p-aluna", "/dieta?ver=meus", esperar="liberada")
        t.esperar(lambda: t.tem('[data-folha-meus="lista"] [data-meus-estado="lista"]'), 30)
        if not (pao and rec):
            o.ok(False, "D11 sem o pão ou a receita (o D5 falhou)")
            return
        t.clicar(f'[data-meu-alimento="{pao["id"]}"]')
        t.esperar(lambda: t.tem("[data-alimento-nome]"), 15)
        t.pg.locator('[data-alimento-macro="energia_kcal"]').fill("300")
        t.clicar("[data-alimento-salvar]")
        kcal = lambda: float((B.ler(f"select energia_kcal::float as k from {S}.aluno_alimentos where id = {B.txt(pao['id'])}") or [{"k": 0}])[0]["k"])  # noqa: E731
        o.ok(t.esperar(lambda: kcal() == 300, 20, 1), f"D11 mudar o pão 280 → 300 kcal em 100 g (no banco: {kcal()})")
        apagado = lambda tab, i: bool(B.ler(f"select deleted_at is not null as a from {S}.{tab} where id = {B.txt(i)}")[0]["a"])  # noqa: E731
        t.pg.get_by_role("radio", name=re.compile("Receitas")).click()
        t.clicar(f'[data-minha-receita="{rec}"]')
        t.esperar(lambda: t.tem("[data-receita-apagar]"), 15)
        t.clicar("[data-receita-apagar]")
        ok1 = t.caso.confirmar_no_app() and t.esperar(lambda: apagado("aluno_receitas", rec), 20, 1)
        t.esperar(lambda: t.tem('[data-folha-meus="lista"]'), 15)
        t.pg.get_by_role("radio", name=re.compile("Alimentos")).click()
        t.clicar(f'[data-meu-alimento="{pao["id"]}"]')
        t.esperar(lambda: t.tem("[data-alimento-apagar]"), 15)
        t.clicar("[data-alimento-apagar]")
        ok2 = t.caso.confirmar_no_app() and t.esperar(lambda: apagado("aluno_alimentos", pao["id"]), 20, 1)
        retrato = [x for x in itens_do_dia(e) if not x["desfeito"] and (x["receita_id"] == rec or x["receita_id"] is None and x["extra_id"])]
        o.ok(ok1 and ok2 and len(retrato) >= 1, f"D11 apagar a receita e o pão com a confirmação do app (no banco a lixeira); o dia segue com o retrato ({len(retrato)})")
    finally:
        t.fim()


def caso_velho(o, nav, R: Rodada) -> None:
    """--velho: o build de ANTES da P5 (o JS do APK de hoje) com a Dieta LIBERADA: a tela de hoje, sem nada novo, e o ✓ como antes."""
    e = R.e
    r1 = e["r1"]
    ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
    o.ok(ok, "V1 a nutri libera a Dieta da A (no banco: 'mexer')")
    t = R.tela(nav, "velho")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", esperar=None)
        t.pg.wait_for_timeout(2500)
        o.ok(ok and t.n("[data-dieta-livre]") == 0 and t.n("[data-dieta-dia-livre]") == 0 and leituras_do_dia(t) == 0,
             f"V1 o app de antes: a Dieta de hoje, sem nada da P5 e sem ler o dia livre ({leituras_do_dia(t)} `ler` q=dia)")
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="feito"]')
        ok = t.esperar(lambda: concluida_hoje(e, r1), 20, 1)
        R.print(t, "d_apk_velho")
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="desmarcar"]')
        ok = ok and t.esperar(lambda: not concluida_hoje(e, r1), 20, 1)
        o.ok(ok, "V1 o ✓ do plano marca e desmarca como antes (paciente_marcar_refeicao), com a Dieta liberada")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: o Início e a Dieta (se a conta a tiver) da conta de teste aluno-calc com a Guarda."""
    guarda = B.Guarda()
    t = R.tela(nav, "prod", guarda=guarda)
    try:
        t.entrar(R.L, "aluno-calc", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-card-rotinas-hoje]"), 60)
        t.pg.wait_for_timeout(2500)
        o.ok(ok, "P1 produção: o Início abre (o card das rotinas da P3)")
        R.print(t, "prod_d_inicio")
        t.ir("/dieta")
        t.pg.wait_for_timeout(4000)
        estado = (t.attr("[data-aba-dieta]", "data-aba-dieta") or ["(sem a aba)"])[0]
        o.linha(f"   P1 produção: /dieta → {estado} (a aluno-calc é só de Treino: a Dieta liberada é provada no staging)")
        o.ok(not guarda.bloqueadas and not gravacoes_ao_abrir(t), f"P2 produção: nenhuma gravação tentada (a Guarda bloqueou: {guarda.bloqueadas or '—'})")
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
    ap.add_argument("--velho", action="store_true")
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
    if a.velho and a.base != "local":
        ap.error("--velho só com --base local (o build de antes da P5 na 5173 — velho.sh)")
    prefixo = f"{a.base}{'-loja' if a.loja else ''}{'-velho' if a.velho else ''}"
    o = C.Saida(f"telas_dieta_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'o build de ANTES da P5' if a.velho else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas da dieta liberada")
    agora = dt.datetime.now(SP)
    if agora.hour == 23 and agora.minute >= 30:
        raise SystemExit("perto da meia-noite de SP (o dia de hoje viraria no meio da rodada): rode depois das 00:05 — nada foi gravado")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    f = foto()
    R = Rodada(o, base, prefixo)
    R.pre = "loja_" if a.loja else ""
    R.e = {**f, "marca": f"{B.MARCA} P5 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat()}
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
                if a.velho:
                    rodar(caso_velho)
                elif a.loja:
                    for fn in (caso_travada, caso_liberada_e_tirar):
                        B.exigir_saude(fn.__name__)
                        rodar(fn)
                    rodar(caso_rotinas, True)
                else:
                    for fn in (caso_travada, caso_liberada_e_tirar, caso_adicionar, caso_meus, caso_extra, caso_totais, caso_rotinas,
                               caso_travou_no_meio, caso_duas_matriculas, caso_mudar_e_apagar):
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
    o = C.Saida("telas_dieta_prod")
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

- [ ] **Step 2: As guardas (todas verdes, nenhuma editada)**

Run: `cd ~/projetos/physiqcalc-wa-p5 && bash ~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh src/aluno-dia/semBancoDireto.test.ts src/nutricao/semLeituraDireta.test.ts src/nutricao/semGravacaoDireta.test.ts src/integrations/semBancoNoNavegador.test.ts src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts src/lib/consultasComErro.test.ts src/rotas/registro.test.ts src/rotas/usePreCarga.test.ts src/aluno-dia/alunoDiaRegras.test.ts src/aluno-dia/regras.test.ts src/rotinas/regras.test.ts`
Expected: `Test Files 12 passed` · `Tests 195 passed (195)` — a `semBancoDireto` lendo a pasta nova (0 achado), a `semLeituraDireta` intocada e verde, a `semBancoNoNavegador` sem achado novo.

- [ ] **Step 3: Commit** — `test(w-a): o E2E de tela da dieta liberada (travada, liberada, tirar, sem internet, pôr, receita, extra, anel, rotinas, travou no meio, 2 matrículas, mudar e apagar, APK velho; produção só leitura)`
  com `e2e/wa/telas_dieta.py`; `feita.sh 4 "E2E: --seco 56/56, compila; guardas <placar>" "<placar>"`.

---

### Task 5: A prova local completa (o que o CI roda + as provas da P5)

**Estimativa:** 35 min (calibrado 20–30 — a máquina; a 1ª rodada grande da parte local).

- [ ] **Step 1:** a `prova_local.sh` inteira num tmux (passa de 10 min; a fila é dividida com a LINUX 1): `bash ~/projetos/physiqcalc-scratch/w-a/p5/prova_tmux.sh`
  e conferir `tail -4 ~/projetos/physiqcalc-scratch/w-a/p5/prova-saida.txt` até `PROVA-FIM rc=0` (~17–25 min; com a fila livre). **Ou** em partes de menos de 10 min
  (os MESMOS passos e saídas), cada uma depois de `bash ~/projetos/physiqcalc-scratch/w-a/p5/prova_partes.sh fila`: `bash ~/projetos/physiqcalc-scratch/w-a/p5/prova_partes.sh a` ·
  `… vitest 1` · `… vitest 2` · `… vitest 3` · `… vitest 4` · `… c` · `… fim` (o teto de cada fatia conta depois de pegar a fila).
  Expected (a linha `fim`): `lint=0 tipos=0 definer=0 test-node=0 vitest=0 build=0 chunks=0 seco=0 compila=0` e o `git status --short` vazio. O Vitest inteiro sem
  falha (no ensaio: 431 arquivos, 6.125 testes, 0 falha — a `main` do dia pode ter mais); o `checar-chunks` sem pesado novo (a Dieta é preguiçosa, por convenção; a dieta livre vai
  no pedaço dela). Uma fatia com `rc=124` = o teto de 560 s depois de pegar a fila (a máquina carregada) → refazer só ela. **Intermitente conhecido, de fora da P5:** `src/painel/configuracoes/Recebimento.test.tsx` › "Conectar no APK…" (o ouvinte `browserFinished` da W2) falhou 1 vez no ensaio com a máquina carregada (o Vitest inteiro da LINUX 1 ao mesmo tempo) e passou sozinho (33/33) → refazer a fatia; se repetir, rodar o arquivo sozinho e anotar no `progresso.log` (não é da P5). Vermelho → a causa (o `prova-<passo>.txt`),
  corrigir na task dela, commit, de novo.
- [ ] **Step 2:** `feita.sh 5 "prova local: <a linha fim>" "<os placares>"` e a marca `~/projetos/physiqcalc-scratch/w-a/p5/PRONTO-PARA-STAGING` (o HEAD, as Tasks 0–5, o
  que esperar: a brecha do BANCO para a Task 6 e a 21d na `main` para a 7).

---

### Task 6: E2E de tela LOCAL (5173 — o build de staging; site, loja e o APK velho) + os prints

**Estimativa:** 60 min (calibrado 40–55). **🔒 BANCO do staging** (o E2E muda os acessos da Dieta e os ✓ de hoje da matrícula A e cria a massa — tudo volta).
**Espera o "livre" da LINUX 1:** numa brecha da 21d (antes de ~14:45 se a Task 5 fechar antes; senão depois do BANCO dela ~16:45, ou num intervalo combinado).

- [ ] **Step 1: A trava** — o quadro "🔒 BANCO do staging: LINUX 3 desde HH:MM (W-A P5: telas local na 5173, ~45 min)" + `SendMessage` + esperar o "pode ir";
  `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p5/saude.py "as telas locais"` → 0; `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p5/massa_p5.py` → True.
- [ ] **Step 2: O site no 5173** — `bash ~/projetos/physiqcalc-scratch/w-a/p5/preview.sh site` → `physiq-distribuicao" content="site"` e o `health.json` com
  `"schema":"staging"`. (A 5173 ocupada → PARAR: não derrubar o que não é seu.)
- [ ] **Step 3: O E2E do site (no tmux — passa de 10 min)** — `bash ~/projetos/physiqcalc-scratch/w-a/p5/e2e_local.sh site` e conferir
  `tail -5 ~/projetos/physiqcalc-scratch/w-a/p5/e2e-local-site.txt` até `E2E-FIM rc=0`.
  Expected: `35/35 ok` (D0 · D1 ×3 · D2 ×2 · D3 ×4 · D4 ×2 · D5 ×2 · D6 ×3 · D7 ×3 · D8 ×3 · D9 ×2 · D10 ×3 · D11 ×2 · os 4 logouts locais das sessões do teste — a
  w5p-aluna, a w5p-nutri, o w13-dono e a w7b-sozinho · a limpeza com as sobras 0). Falhou → o print de diagnóstico, a causa; o `--limpar` (`python3 e2e/wa/telas_dieta.py --limpar` → as sobras 0) antes de rodar de
  novo. Um caso que depende de um anterior (D7 do D3/D4; D6 do D5) falha junto — corrigir o 1º. Falha de seletor/tempo = do TESTE (corrigir no E2E, commit); falha
  da tela = da task dela (o Vitest da tela primeiro).
- [ ] **Step 4: Os prints (Read em cada um)** — `~/projetos/physiqcalc-scratch/prints/w-a/p5/local/`: `d_travada_390.png` (a Dieta de hoje, sem nada novo; as rotinas
  no fim só abaixo dos botões), `d_liberada_390.png` ("Nova refeição" e "Meus alimentos e receitas" embaixo das refeições), `d_tirar_390.png` (o item riscado com
  "Voltar"), `d_adicionar_390.png` (a quantidade com as kcal antes de pôr), `d_receita_390.png` (a receita com os 2 ingredientes e o "Por porção"),
  `d_extra_390.png` (a extra com a receita e o "Já comi"), `d_totais_390.png` (o anel depois do ✓), `d_rotinas_390.png` e `d_rotinas_pratos_390.png` (a seção no
  fim), `d_voltou_travada_390.png` (o toast e a tela "só ver"). Tela errada, "carregando", login → refazer o caso.
- [ ] **Step 5: A loja** — `bash ~/projetos/physiqcalc-scratch/w-a/p5/preview.sh loja` (→ `content="play"`) e `bash ~/projetos/physiqcalc-scratch/w-a/p5/e2e_local.sh loja`
  → `E2E-FIM rc=0` e `16/16 ok` (D0 ×2 · D1 ×3 · D2 ×2 · D3 ×4 · D8 ×2 · os 2 logouts · a limpeza); os prints `local-loja/loja_d_travada_390.png`, `loja_d_liberada_390.png`, `loja_d_tirar_390.png`,
  `loja_d_rotinas_390.png` (Read). Depois `bash ~/projetos/physiqcalc-scratch/w-a/p5/preview.sh parar`.
- [ ] **Step 6: O APK velho** — `bash ~/projetos/physiqcalc-scratch/w-a/p5/velho.sh subir` (a `main` SEM a P5 numa worktree descartável, o `build:loja` dela na 5173 →
  "velho em <sha> (sem a P5)" e o `health.json`) e `bash ~/projetos/physiqcalc-scratch/w-a/p5/e2e_local.sh velho` → `E2E-FIM rc=0` e `7/7 ok` (D0 · V1 ×3 · os 2 logouts · a limpeza); o print
  `local-velho/d_apk_velho_390.png` (Read: a Dieta de hoje, com o ✓); `bash ~/projetos/physiqcalc-scratch/w-a/p5/velho.sh parar` (a worktree descartável sai).
- [ ] **Step 7: Soltar** — `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p5/massa_p5.py` → True (as sobras 0; a Dieta da A em "ver"). 🔓 + "livre".
  `feita.sh 6 "telas local: site <n>/<n>, loja <n>/<n>, velho <n>/<n>; prints conferidos" "<placares>"`.

---

### Task 7: Depois da 21d na `main` — o drift da `main`, o rebase e a prova local de novo

**Estimativa:** 30 min (calibrado 15–25; a ESPERA da 21d não conta).

- [ ] **Step 1: A 21d entrou?** — `bash ~/projetos/physiqcalc-scratch/w-a/p5/espera_21d.sh` → "a 21d ESTÁ na main" (rc 0). Ainda não → anotar no `progresso.log` e
  esperar o aviso da LINUX 1 ("21d em produção, git livre") — a P5 não faz staging nem merge antes (o combinado; inverter a ordem, como a P4 fez, é decisão do
  coordenador com a LINUX 1, não daqui). Previsão de cada ida: o aviso de progresso.
- [ ] **Step 2: O que a `main` mudou nos arquivos da P5** — `cd ~/projetos/physiqcalc-wa-p5 && bash ~/projetos/physiqcalc-scratch/w-a/p5/drift.sh --main`
  Expected: os 3 arquivos "igual" (a 21d não toca nenhum) → `rc=0`; as contagens de commit novos nos arquivos do contrato (o `src/app-aluno/sozinho/api.ts` pode ter
  da 21d: o `Dieta.test.tsx` finge `buscarPratos` e `ErroApp` dele — conferir que os 2 nomes seguem exportados; se não, ajustar o falso, 1 linha, Vitest da Task 3).
- [ ] **Step 3: O rebase (a branch ainda não está no GitHub)** — `cd ~/projetos/physiqcalc-wa-p5 && git fetch origin && git rebase origin/main` → "Successfully rebased"
  (conflito → resolver juntando, `git add <arq>`, `git rebase --continue`; nunca descartar o lado da 21d).
- [ ] **Step 4: A prova local de novo** — como na Task 5 (`bash ~/projetos/physiqcalc-scratch/w-a/p5/prova_tmux.sh` → `PROVA-FIM rc=0`; ou as partes) → a linha `fim`
  toda 0 e o `git status --short` vazio.
- [ ] **Step 5:** `feita.sh 7 "rebase na main <sha> (com a 21d); prova local: <a linha fim>" "<placares>"`.

---

### Task 8: STAGING (🔒 git + BANCO): push ff no `staging`, a Vercel, o E2E de staging e a regressão do app

**Estimativa:** 45 min (calibrado 30–40).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p5 fetch origin && git -C ~/projetos/physiqcalc-wa-p5 merge-base --is-ancestor origin/main HEAD && git -C ~/projetos/physiqcalc-wa-p5 merge-base --is-ancestor origin/staging HEAD && echo ok-ff`
  → `ok-ff`. A `main` andou → a Task 7 de novo (Steps 2–4). O `staging` tem commit que a `main` não tem → PARAR (alguém está no staging: o quadro).
- [ ] **Step 2: As travas** — o quadro "🔒 git staging/main + BANCO do staging: LINUX 3 desde HH:MM (W-A P5: push ff no staging + E2E de staging + regressão, ~45 min)"
  + `SendMessage` + esperar o "pode ir".
- [ ] **Step 3: O push e a Vercel** — `git -C ~/projetos/physiqcalc-wa-p5 push origin HEAD:staging && git -C ~/projetos/physiqcalc-wa-p5 rev-parse --short=7 HEAD`
  → o sha; `bash ~/projetos/physiqcalc-scratch/w-a/p5/esperar_vercel.sh <sha>` → "o staging serve <sha>".
- [ ] **Step 4: O E2E de staging (um por vez, o `/health` antes)** — `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p5/saude.py "as telas no staging"`
  e `bash ~/projetos/physiqcalc-scratch/w-a/p5/e2e_tmux.sh staging e2e/wa/telas_dieta.py --base staging --canal msedge` → `tail -5 ~/projetos/physiqcalc-scratch/w-a/p5/e2e-staging.txt`
  até `E2E-FIM rc=0` e `35/35 ok` (o roteiro do local); os prints em `prints/w-a/p5/staging/` (Read).
- [ ] **Step 5: A regressão do app (a rede das telas; o `saude.py` antes)** — `bash ~/projetos/physiqcalc-scratch/w-a/p5/e2e_tmux.sh rede e2e/hml20/rede.py --area aluno --base staging --canal msedge`
  → `E2E-FIM rc=0`: em cada tela do app (Início, Evolução, Dieta, Diário) 0 gravação ao abrir e o `ler` da `nutricao` no teto (as 2 leituras novas da `aluno-dia` na Dieta
  não contam no teto). (É da família da LINUX 1 — avisar antes; o `pausa.sh` da hml-19 é dela: não rodar.) Falha numa verificação que a P5 mudou = corrigir (na task
  dela, commit, push ff, de novo); numa verificação velha de fora da P5 = anotar na obs. das rodadas, sem corrigir (a prova de controle na `main`, como na P4, se
  houver dúvida).
- [ ] **Step 6: Soltar** — `massa_p5.py` → True; o quadro com as travas livres + "livre" (o git volta a ser pedido na Task 10).
  `feita.sh 8 "staging <sha>: telas <placar>; regressão hml20/rede <placar>; prints conferidos; sobras 0" "<placar>"`.

---

### Task 9: As rodadas + PR + CI

**Files:** Modify `docs/e2e-rodadas.md` (o topo da tabela "## Rodadas"); fora: `pr-p5.md`.
**Estimativa:** 25 min (calibrado 10–15).

- [ ] **Step 1: As linhas** — `cd ~/projetos/physiqcalc-scratch/w-a/p5 && python3 rodadas_p5.py --p4-desde "2026-10-13 11:31"` → as linhas da P5 (local site/loja/velho,
  staging, a regressão) e as 4 de produção da P4 depois do merge dela (`telas_acessos --base prod`, `w14/prod.py`, `w07/smoke_prod.py`, `api.py --so-leitura`); colar logo
  abaixo da linha `|---|---|…` da "## Rodadas", completando as obs. com o que as `T<N>-FEITA` dizem. Commit:
  `cd ~/projetos/physiqcalc-wa-p5 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(e2e): as rodadas da W-A P5 (e as de produção da P4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/e2e-rodadas.md`
- [ ] **Step 2: O corpo do PR** — `~/projetos/physiqcalc-scratch/w-a/p5/pr-p5.md`: o que entra (a Dieta "Pode mexer": tirar só hoje, pôr, a extra, meus alimentos e receitas,
  o anel; a seção "Rotinas de hoje" na Dieta; o E2E novo); o que NÃO muda (migration, função — a `aluno-dia` da P2 já fazia tudo —, o plano da nutri, a Dieta travada,
  as guardas da hml-20/21 — intocadas e verdes); as decisões técnicas (a lista do topo), os defeitos da spec 1–11 e a Q5a (com a recomendada); as provas (local + loja +
  APK velho, staging, a regressão, os prints); a volta (reverter o squash: a Dieta volta ao "só ver" para todos; o que os alunos registraram fica guardado no banco —
  §2.2-12); **o risco 9 fechado (a P4 liga, a P5 mostra)**; e no fim `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Push da branch e PR (a `main` não pode ter andado)** —
  `cd ~/projetos/physiqcalc-wa-p5 && git fetch origin && git merge-base --is-ancestor origin/main HEAD && git push -u origin feat/w-a-p5-dieta-livre && gh pr create --repo weslleybertoldo/physiqcalc --base main --head feat/w-a-p5-dieta-livre --title "W-A P5: a dieta liberada no app do aluno (tirar só hoje, pôr alimentos e receitas, refeições extras, meus alimentos e receitas, o anel do que ele comeu) e as rotinas na Dieta" --body-file /home/bertoldo/projetos/physiqcalc-scratch/w-a/p5/pr-p5.md || echo "PAROU: a main andou ou o push/PR falhou (ver acima)"`
  → a URL do PR. A `main` andou depois do push no `staging` → `git merge origin/main` na branch (nunca rebase + força depois de publicada) + a prova local
  (`prova_partes.sh a` + as 4 fatias, sem o build) + push.
- [ ] **Step 4: O CI** — `gh pr checks <n> --repo weslleybertoldo/physiqcalc --watch` → `checar-pr` ✅ (lint, tipos, `checar-definer`, `test:node`, Vitest, build +
  `checar-chunks`) e o preview da Vercel ✅. Vermelho → `gh run view <id> --log-failed | tail -60`, corrigir, commit, push (sem forçar).
- [ ] **Step 5:** `feita.sh 9 "PR #<n>; CI verde" "<link>"`.

---

### Task 10: Merge → release → bump → `staging` = `main` → smoke SÓ LEITURA na produção

**Estimativa:** 35 min (calibrado 20–30; as esperas do CI não contam).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p5 fetch origin && git -C ~/projetos/physiqcalc-wa-p5 merge-base --is-ancestor origin/main HEAD && echo main-ok`
  e `gh pr list --repo weslleybertoldo/physiqcalc --state open` (1 PR por vez; a 21d JÁ na `main`).
- [ ] **Step 2: A trava** — o quadro "🔒 git staging/main: LINUX 3 desde HH:MM (W-A P5: merge, release, staging = main por lease)" + `SendMessage` + o "pode ir"
  (que vale também para o realinhar — a condição (a)).
- [ ] **Step 3: Merge** — `gh pr merge <n> --repo weslleybertoldo/physiqcalc --squash --delete-branch` → `git -C ~/projetos/physiqcalc-wa-p5 fetch origin && git -C ~/projetos/physiqcalc-wa-p5 log origin/main -1 --format='%h %an <%ae> %s'`
  = o squash "W-A P5: … (#<n>)" do `Weslley Bertoldo <55102421+weslleybertoldo@users.noreply.github.com>` (anotar o sha e a hora em UTC — o `--desde` do smoke).
- [ ] **Step 4: O CI da `main`** — `gh run list --repo weslleybertoldo/physiqcalc --branch main --limit 3` → `gh run watch <id> --repo weslleybertoldo/physiqcalc`
  → a release `Physiq v3.1xx` com o APK e o `chore: bump version to v3.1xx [skip ci]` (NUNCA bumpar à mão); `curl -s https://physiqcalc.com.br/health.json`
  com a versão da release e o commit do squash. Deploy com `git_info_fail` → `POST /v13/deployments` (o caminho de sempre).
- [ ] **Step 5: Realinhar `staging` = `main` (as 3 condições do quadro)** — (a) o "pode ir" do Step 2; (b)
  `bash ~/projetos/physiqcalc-scratch/w-a/p5/realinhar_confere.sh <sha do squash>` → os commits no staging que a main não tem = SÓ os da branch da P5, a árvore do
  staging × a do squash VAZIA (ou só as linhas das rodadas — o mesmo da P4) e o `STAGING_SHA=…`; (c) ISOLADO: `git -C ~/projetos/physiqcalc-wa-p5 push origin origin/main:staging --force-with-lease=staging:<STAGING_SHA>`.
  Qualquer coisa fora disso → PARAR e combinar (nada de força).
- [ ] **Step 6: O smoke SÓ LEITURA (a Guarda)** — `bash ~/projetos/physiqcalc-scratch/w-a/p5/smoke_prod.sh <3.1xx> <ISO UTC do merge>` → `tail -12 ~/projetos/physiqcalc-scratch/w-a/p5/smoke-prod.txt`
  até `SMOKE-FIM`: `telas_dieta --base prod` `3/3` (P1 o Início e a Dieta abrem; P2 nenhuma gravação tentada; o logout local) · `telas_rotinas --base prod` (o card do Início, a página) ·
  `w07/smoke_prod.py telas` · `api.py --so-leitura --desde <ISO>` (as funções da W-A sem 5xx; o q=`dia` lido) — todos `rc=0`; os prints `prints/w-a/p5/prod/prod_d_inicio_390.png`
  (Read; dados de conta de teste — não mandar ao Weslley se aparecer dado de aluno real).
- [ ] **Step 7: "Pode voltar"** — `SendMessage` à LINUX 1 com o sha da `main`, a release, "git livre" e **"a 21c pode rebasear em cima da P5"**; o quadro com a trava livre.
  `feita.sh 10 "squash <sha> (#<n>); release v3.1xx; bump; staging = main por lease; smoke prod <placares>" "<placares>"`.

---

### Task 11: Fechar

**Estimativa:** 15 min (calibrado 5–10). (O que é do coordenador — quadro, foto, Validação, memória — quem executa só anota no `progresso.log`.)

- [ ] O quadro: a linha da W-A com "✅ P5 EM PRODUÇÃO HH:MM (PR #…, squash `…`, release v3.1xx, bump …); local + loja + APK velho, staging + a regressão, produção SÓ
  LEITURA; 0 sobra" e as travas livres; **a P6 (painel: rotinas e dia a dia) reserva o que for dela** (o "Dia a dia" mostra o que a P5 grava).
- [ ] A foto: o JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-acessos-do-aluno.json` (P5 `feito`, `duracao_min`, tag `PR #… · v3.1xx`)
  → `python3 ~/.claude/skills/Skill-wbs-ciclo-de-implementação-autonoma/andamento_worktrees.py <json> <pasta> --atual` → Read do PNG → tópico.
- [ ] O resumo no grupo Validação (`remoto_validacao`, tópico do Physiq) com os prints (`d_travada`, `d_liberada`, `d_adicionar`, `d_tirar`, `d_extra`, `d_receita`,
  `d_totais`, `d_rotinas`, `d_voltou_travada` — os do staging): o que entrou, os placares, os defeitos da spec, a Q5a (com a recomendada), o que vem (P6).
- [ ] A memória do projeto (Physiq): "W-A P5 em produção (data, PR, versão); Q5a aberta (recomendada: só hoje); P6 a seguir".
- [ ] `claude-orfaos.sh` (órfã → perguntar); nada de pé: `tmux ls` sem `wa-p5-*`, `ss -ltn | grep -E ":5173 "` vazio, a worktree do velho fora
  (`git -C ~/projetos/physiqcalc worktree list` sem `physiqcalc-p5-velho`). A limpeza de `p5/` (caminhos literais):
  `rm -r /home/bertoldo/projetos/physiqcalc-scratch/w-a/p5/ensaio` e `rm -r /home/bertoldo/projetos/physiqcalc-scratch/w-a/p5/ensaio2` (as cópias do ensaio do plano, se
  ainda existirem). A worktree: `git -C ~/projetos/physiqcalc-wa-p5 status --short` vazio → remover SÓ quando nenhuma sessão estiver dentro dela:
  `git -C ~/projetos/physiqcalc worktree remove ~/projetos/physiqcalc-wa-p5 && git -C ~/projetos/physiqcalc branch -D feat/w-a-p5-dieta-livre`
  (a remota saiu no merge). `feita.sh 11 "fechada" "<o que foi limpo>"`.

---

## Riscos (e o que segura cada um)

1. **A espera da 21d e a brecha do BANCO** (o combinado): a P5 fica pronta para o E2E local no fim da Task 5 e espera uma brecha (a 21d segura o BANCO ~14:45 → ~16:45);
   o staging espera o merge da 21d (~17:00–18:30). O código parado não estraga; a Task 7 refaz a prova em cima dela. Inverter a ordem é do coordenador com a LINUX 1.
2. **O E2E mexe na matrícula A da w5p-aluna** (os acessos da Dieta, os ✓ de hoje, o dia): a foto vai ao estado ANTES; tudo volta no fim e no `--limpar`; a trava do BANCO
   (nenhum E2E da LINUX 1 ao mesmo tempo); o `massa_p5.py` confere antes e depois. O aviso "Sua dieta foi liberada" (1 por dia) da rodada sai na limpeza.
3. **O caso das 2 matrículas** (D10): a 2ª matrícula da Massa ganha a nutricionista por ~2 min; a Massa a apaga no fim (e no `--limpar`), com os acessos e o histórico dela
   (cascade).
4. **A fila do pesado dividida** (o ensaio viu o Vitest inteiro da LINUX 1 segurar ~10 min): o `prova_partes.sh fila` antes de cada parte; o teto de cada fatia conta só
   depois de pegar a fila.
5. **O E2E no staging travando o Treino de produção** (incidente de 10/10): um por vez, o `/health` antes de cada caso e de cada E2E da regressão (a P5 quase não toca o
   Treino: só o login do app).
6. **O APK velho** (risco 13 da spec): o aviso "Sua dieta foi liberada" chega, o app não muda (provado pelo `velho.sh` + `--velho`); o profissional vê no dia a dia (P6) que
   nada mudou.
7. **A rede do app** (ponto de encontro 5): a Dieta ganha 2 leituras da `aluno-dia` (o `meu_dia` só para quem tem plano; as rotinas para todo aluno) — `ler`, fora do teto
   da hml-20; avisado na Task 0.
8. **A 21c republicando a `nutricao`** (ponto de encontro 4): nenhum E2E da P5 com a publicação no meio — o aviso antes de cada E2E.
9. **Q5a sem resposta:** vale a recomendada (só hoje); se ele escolher "ontem também", é uma parte pequena depois (a leitura e o ✓ de ontem), sem mexer no servidor.

## Self-review (feito ao escrever; o código do plano rodou num ENSAIO fora do repo e foi refeito numa 2ª cópia limpa — nada no repo, no banco, na borda nem no registro oficial)

- **Cobertura da spec (§4.4, §4.7, §5.2, §5.3, §6 P5) e do mestre §3 › P5:** "Só ver" = como hoje (decisão 2; Vitest "Só ver"; D1 `d_travada`); "Pode mexer": "Tirar hoje"
  riscado com "Voltar" (Task 2–3; D3 `d_tirar`), "Adicionar alimento" com a busca da TACO/dos dele/do plano/das receitas dele em gramas ou porções (decisão 7; D4
  `d_adicionar` em gramas; D6 a receita e o alimento DELE em porções), "você pôs" e "Tirar" (ItensDoDia), "Nova refeição" com nome/horário/"Já comi" (decisão 10; D6 `d_extra`), "Meus alimentos e receitas" com o alimento por
  100 g com porção e a receita com ingredientes e porções — criar, mudar e apagar (decisão 8; D5 `d_receita`, D11; o Vitest da folha), o anel e as barras contam o que ele comeu (decisão 3; D7
  `d_totais`; o Vitest do anel), travou no meio → "A sua dieta voltou a ser só para ver" e recarrega (decisão 5; D9 `d_voltou_travada`), sem internet → os botões
  desligados (decisão 6; o Vitest e o D3 com o navegador offline), rotinas na Dieta com nutri e com pratos prontos (decisão 9; D8 `d_rotinas` + `d_rotinas_pratos`), o aluno de 2 matrículas segue a do
  plano ativo (decisão 1; D10; o Vitest), APK novo e velho (decisão 13; a loja + o `--velho`); os 9 prints do mestre (+ `d_rotinas_pratos` e `d_apk_velho`).
- **Sem "TBD":** todo arquivo novo está inteiro no plano (e em `p5/codigo/`, com o md5); toda edição é um `diff` que aplica (o `drift.sh` confere; o ensaio 2 aplicou
  todos em ordem e reproduziu o ensaio byte a byte); os únicos valores do dia são os do ambiente (o sha, o nº do PR e da release, a hora combinada) — lidos na hora,
  escritos no comando seguinte; o placar exato do E2E sai da 1ª rodada boa (o E2E não rodou contra o staging no ensaio — de propósito).
- **Nomes consistentes:** os `data-*` do E2E são os das telas (`--seco` 56/56); as funções da P2 com as assinaturas de `src/aluno-dia/api.ts`; a frase do `dieta_travada`
  a de `MENSAGEM_ERRO_ALUNO_DIA`; as chaves (`dieta-livre-dia`, `dieta-livre-biblioteca`, `dieta-livre-busca`) iguais nas consultas, nas gravações e nos testes; os
  limites iguais aos do servidor (o teste confere).
- **Os pontos de encontro só por acréscimo** (o topo do `docs/e2e-rodadas.md`); nada da hml-21 editado; nenhuma função, migration, guarda ou lista de funções mudou.
- **Contra o diálogo de permissão:** nenhum comando do plano usa `bash -c`, `sh -c`, subshell com `time`, `eval` nem `$(…)` na linha; o que é complexo está em script
  (`p5/*.sh`, `p5/*.py`); os `rm` com caminho literal.
- **A fila do pesado:** as tasks de código rodam só os arquivos delas (≤ 1 min cada); as rodadas grandes só nas Tasks 5 e 7 e nos E2E (cada uma na fila).

---

## Apêndice A — os scripts de apoio (já em `~/projetos/physiqcalc-scratch/w-a/p5/`; se faltar algum, recriar daqui)

`~/projetos/physiqcalc-scratch/w-a/p5/log.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 — acrescenta "HH:MM | <texto>" no progresso.log da P5 (sem $(…) na linha de comando de quem chama).
# uso: bash ~/projetos/physiqcalc-scratch/w-a/p5/log.sh "T3 | ✅ verde"
set -euo pipefail
printf '%s | %s\n' "$(date +%H:%M)" "${1:?texto}" >> /home/bertoldo/projetos/physiqcalc-scratch/w-a/p5/progresso.log
tail -1 /home/bertoldo/projetos/physiqcalc-scratch/w-a/p5/progresso.log
```

`~/projetos/physiqcalc-scratch/w-a/p5/feita.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 — grava a marca T<N>-FEITA (1ª linha com a hora de agora) e a linha no progresso.log.
# uso: bash feita.sh <N> "<resumo de 1 linha para o progresso>" "<linha 1 da marca>" ["<linha 2>" …]
set -euo pipefail
n="${1:?N}"; resumo="${2:?resumo}"; shift 2
pasta=/home/bertoldo/projetos/physiqcalc-scratch/w-a/p5
{ printf 'T%s FEITA %s\n' "$n" "$(date +%H:%M)"; for l in "$@"; do printf '%s\n' "$l"; done; } > "$pasta/T$n-FEITA"
printf '%s | T%s | ✅ %s\n' "$(date +%H:%M)" "$n" "$resumo" >> "$pasta/progresso.log"
tail -1 "$pasta/progresso.log"
```

`~/projetos/physiqcalc-scratch/w-a/p5/vitest.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 — o Vitest na fila do pesado, com 2 workers e o TMPDIR do scratch, na worktree da P5.
# uso: bash vitest.sh <arquivos de teste…>   (sem arquivo: o repo inteiro — só na prova local, Task 5)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
cd "${P5_W:-$HOME/projetos/physiqcalc-wa-p5}" || exit 9  # P5_W: só o ensaio do plano usa
if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
flock "$P" npx vitest run --maxWorkers=2 "$@"
```

`~/projetos/physiqcalc-scratch/w-a/p5/copiar.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 — põe na worktree os arquivos NOVOS da P5 a partir das cópias conferidas (p5/codigo/, o ensaio do plano: os mesmos blocos do
# plano). Não sobrescreve arquivo que já existe e confere o md5 de cada cópia (codigo.md5).
# uso: bash copiar.sh <caminho no repo> [<caminho no repo> …]     ex.: bash copiar.sh src/dieta-livre/regras.test.ts
set -u
W="${P5_W:-$HOME/projetos/physiqcalc-wa-p5}"  # P5_W: só o ensaio do plano usa (a cópia fora do repo)
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
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

`~/projetos/physiqcalc-scratch/w-a/p5/drift.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 0, e de novo na Task 7 depois do rebase na main com a 21d) — o "drift": o que o plano usa ainda é o que era ao escrevê-lo (a main
# 7a59930, v3.117, com a P4)? Só leitura.
# 1) os 3 arquivos que a P5 EDITA iguais aos de p5/orig (o retrato da 7a59930) e o patch das edições aplica (--check);
# 2) o contrato da P2 que a dieta liberada usa (src/aluno-dia/{api,tipos,regras}.ts e os LIMITES do _shared/aluno-dia-regras.ts) e a P3 (a lista
#    "Rotinas de hoje" com a origem "dieta");
# 3) as peças da Dieta de hoje que a P5 só importa (useDieta, pacienteApp, dia.ts, LinhaRefeicao, CartaoPlano — a §5.7 da spec: só importar);
# 4) as guardas que a P5 encontra (a P5 NÃO edita nenhuma): a da W-A (a pasta src/dieta-livre já na lista da P5), a da hml-20 (a área dieta sem
#    a pasta nova) e a do navegador da hml-21a; 5) nenhum arquivo NOVO da P5 já existe.
# uso: bash drift.sh          (Task 0, antes de codar: a worktree × p5/orig; saída 0 = nada mudou; 1 = conferir e ajustar ANTES de codar)
#      bash drift.sh --main   (Task 7, antes do rebase: a origin/main do momento × p5/orig — o que a 21d (ou outra) mudou nos arquivos da P5)
set -u
W="${P5_W:-$HOME/projetos/physiqcalc-wa-p5}"  # P5_W: só o ensaio do plano usa (a cópia fora do repo)
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
cd "$W" || exit 9
rc=0
if [ "${1:-}" = "--main" ]; then
  git fetch origin
  echo "── a origin/main ($(git rev-parse --short origin/main)) × p5/orig: os arquivos que a P5 edita"
  for f in $(cd "$S/orig" && find . -type f | sort); do
    f="${f#./}"
    if git show "origin/main:$f" 2>/dev/null | cmp -s - "$S/orig/$f"; then echo "   igual  $f"; else echo "   MUDOU  $f   (o rebase vai mostrar: juntar as 2 mudanças)"; rc=1; fi
  done
  for f in src/aluno-dia/api.ts src/aluno-dia/tipos.ts src/aluno-dia/regras.ts supabase-principal/functions/_shared/aluno-dia-regras.ts \
           src/rotinas/ui/RotinasDeHoje.tsx src/nutricao/app/useDieta.ts src/nutricao/app/pacienteApp.ts src/nutricao/app/ui/LinhaRefeicao.tsx \
           src/nutricao/app/ui/CartaoPlano.tsx src/app-aluno/sozinho/api.ts src/aluno-dia/semBancoDireto.test.ts src/nutricao/semLeituraDireta.test.ts \
           src/integrations/semBancoNoNavegador.test.ts; do
    n=$(git log --oneline HEAD..origin/main -- "$f" | wc -l)
    echo "   $f: $n commit(s) novo(s) na main"
  done
  echo "── drift --main: rc=$rc"
  exit $rc
fi
echo "── 1) os arquivos que a P5 edita (md5 × p5/orig)"
for f in $(cd "$S/orig" && find . -type f | sort); do
  f="${f#./}"
  if cmp -s "$S/orig/$f" "$W/$f"; then echo "   igual  $f"; else echo "   MUDOU  $f"; rc=1; fi
done
if git apply --check "$S/p5-edicoes.patch"; then echo "   o patch das edições aplica"; else echo "   o patch NÃO aplica: fazer as edições à mão (o plano mostra cada uma)"; rc=1; fi
confere() {  # arquivo, texto
  if grep -qF "$2" "$1"; then echo "   ok  $1 › $2"; else echo "   FALTA $1 › $2"; rc=1; fi
}
echo "── 2) o contrato da P2 e a lista da P3"
for x in "export const lerMeuDia" "export const lerMinhaBiblioteca" "export const buscarAlimentosDoAluno" "export const adicionarNoDia" \
         "export const tirarDoDia" "export const desfazerNoDia" "export const salvarExtra" "export const excluirExtra" "export const marcarExtra" \
         "export const salvarAlimento" "export const excluirAlimento" "export const salvarReceita" "export const excluirReceita" "export class ErroAlunoDia" \
         "export function mensagemErroAlunoDia" 'dieta_travada: "A sua dieta voltou a ser só para ver."'; do
  confere src/aluno-dia/api.ts "$x"
done
for x in "export interface MeuDia" "export interface ItemDoDia" "export interface ExtraDoDia" "export interface ItemDaBusca" "export interface MinhaReceita" \
         "export interface MeuAlimento" "export interface DadosDoItemDoDia" "plano_ativo: { plano_id: string; paciente_id: string } | null;" \
         "matriculas: { paciente_id: string; liberada: boolean }[];"; do
  confere src/aluno-dia/tipos.ts "$x"
done
for x in "export function diaAplicado(" "export const macrosDoRetrato" "export interface RefeicaoNoDia" "export interface ExtraNoDia" "export interface ItemDoPlanoNoDia"; do
  confere src/aluno-dia/regras.ts "$x"
done
confere supabase-principal/functions/_shared/aluno-dia-regras.ts "gramas: [0.01, 9999.99], porcoesDoDia: [0.01, 20], porcoesDaReceita: [1, 100], porcaoG: [0.01, 9999.99], kcal: [0, 1000], macro: [0, 100],"
confere src/rotinas/ui/RotinasDeHoje.tsx 'origem?: "inicio" | "dieta"'
confere src/rotinas/ui/RotinasDeHoje.tsx '"data-card-rotinas-dieta"'
confere src/rotinas/regras.ts "export const ehAlunoDasRotinas"
echo "── 3) a Dieta de hoje (a P5 só importa)"
confere src/nutricao/app/useDieta.ts "export function useDieta()"
confere src/nutricao/app/dia.ts "export function planoAtivo<"
confere src/nutricao/app/dia.ts "export type ResumoDoDia = {"
confere src/nutricao/app/ui/LinhaRefeicao.tsx 'export type EstadoRefeicao = "feita" | "agora" | "pendente" | "vazia" | "leitura";'
confere src/nutricao/app/ui/CartaoPlano.tsx "resumo: ResumoDoDia | null;"
confere src/nutricao/app/dietaUtil.ts "export function nomeCurto("
confere src/nutricao/app/refeicaoConcluidaUtil.ts "export const refeicaoMarcavel"
confere src/ui/premium/useConfirmar.ts "export function useConfirmar(): Confirmar"
echo "── 4) as guardas (a P5 não edita nenhuma)"
confere src/aluno-dia/semBancoDireto.test.ts 'P5: ["src/dieta-livre"],'
if grep -qF "src/dieta-livre" src/nutricao/semLeituraDireta.test.ts; then echo "   MUDOU semLeituraDireta (cita a pasta da P5 — conferir)"; rc=1; else echo "   ok  semLeituraDireta: a pasta da P5 fora das áreas (a dieta livre lê só pela aluno-dia)"; fi
confere src/nutricao/semLeituraDireta.test.ts '"minha_dieta", "minha_evolucao", "aluno_perfil",'
if [ -f src/integrations/semBancoNoNavegador.test.ts ]; then echo "   ok  semBancoNoNavegador existe (a regra: os arquivos novos com 0 achado)"; else echo "   FALTA src/integrations/semBancoNoNavegador.test.ts"; rc=1; fi
echo "── 5) os arquivos novos da P5 ainda não existem"
for f in src/dieta-livre e2e/wa/telas_dieta.py; do
  if [ -e "$f" ]; then echo "   JÁ EXISTE $f"; rc=1; else echo "   livre $f"; fi
done
echo "── drift: rc=$rc"
exit $rc
```

`~/projetos/physiqcalc-scratch/w-a/p5/saude.py`:
```python
#!/usr/bin/env python3
"""W-A P5 — SÓ LEITURA: o /health dos 2 projetos (db, auth, rest) + ninguém segurando o banco (pg_stat_activity). Saída 0 = tudo bem.
Uso: python3 saude.py "<rótulo>"."""
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(os.environ.get("P5_W") or Path.home() / "projetos" / "physiqcalc-wa-p5") / "e2e" / "wa"))  # P5_W: só o ensaio
import _base as B  # noqa: E402

B.exigir_saude(sys.argv[1] if len(sys.argv) > 1 else "a P5")
r = B.ler("""select count(*) filter (where state = 'active' and now() - query_start > interval '30 seconds') as longas,
                    count(*) filter (where wait_event_type = 'Lock') as esperando from pg_stat_activity where datname = current_database()""")
print(r)
raise SystemExit(0 if r and r[0]["longas"] == 0 and r[0]["esperando"] == 0 else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p5/massa_p5.py`:
```python
#!/usr/bin/env python3
"""W-A P5 (Task 0 e antes/depois das Tasks 10 e 12) — SÓ LEITURA (transação read only): o que o E2E da dieta liberada precisa no staging.
Só booleanos e contagens (nada pessoal). Uso: python3 massa_p5.py   (saída 0 = pronta)
O que confere: a matrícula A da w5p-aluna (nutri w5p-nutri + personal w5p-personal, conta que não é a do app) com o PLANO ATIVO dela (a regra
do servidor: wa_plano_ativo) e ≥ 2 refeições de HOJE com alimento (≥ 3 itens no total); o nível da Dieta da A hoje (o E2E fotografa e
devolve — 'ver' é o normal); a TACO com "arroz" (a busca do E2E); a conta do w13-dono com Nutrição (o caso das 2 matrículas: a 2ª matrícula
da Massa ganha a nutricionista = o dono, SÓ durante o caso); a matrícula do app da w7b-sozinho no plano Treino + Alimentação (os pratos
prontos — o caso só lê); as sobras da W-A e os estados das rodadas (tudo vazio)."""
import json
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(os.environ.get("P5_W") or Path.home() / "projetos" / "physiqcalc-wa-p5") / "e2e" / "wa"))  # P5_W: só o ensaio
import _base as B  # noqa: E402

E, S = B.CONTAS, "staging"
u = lambda k: f"(select id from auth.users where lower(email) = '{E[k]}')"  # noqa: E731
r = B.ler(f"""
with a as (select p.id, p.conta_id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
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
       (select coalesce(sum(itens), 0)::int from refs) as itens_hoje,
       (select coalesce((select x.nivel from {S}.aluno_acessos x, a where x.paciente_id = a.id and x.chave = 'dieta'), 'ver')) as nivel_dieta_a,
       (select count(*) from {S}.pacientes p where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and p.nutricionista_id is not null)
         as matriculas_com_nutri,
       (select count(*) from {S}.alimentos al where al.fonte = 'taco' and al.deleted_at is null and al.busca like '%arroz%') as taco_arroz,
       (select count(*) from {S}.refeicoes_concluidas rc, a, hoje where rc.paciente_id = a.id and rc.data = hoje.d) as concluidas_hoje_a,
       (select count(*) from {S}.rotinas ro where ro.dono_user_id = {u('w5p-aluna')} and ro.arquivada_em is null) as rotinas_vivas_aluna,
       (select coalesce(bool_or('nutricao' = any({S}.modulos_do_plano(c.plano))), false) from {S}.contas c
         where c.dono_id = {u('w13-dono')} and c.origem <> 'app') as conta_w13_com_nutricao,
       (select count(*) from {S}.pacientes p join {S}.contas c on c.id = p.conta_id join {S}.planos_aluno pa on pa.id = p.plano_aluno_id
         where p.user_id = {u('w7b-sozinho')} and c.origem = 'app' and p.deleted_at is null and pa.codigo = 'app_treino_alimentacao')
         as sozinho_com_alimentacao,
       (select count(*) from {S}.pacientes p where p.user_id = {u('w7b-sozinho')} and p.deleted_at is null and p.nutricionista_id is not null)
         as sozinho_com_nutri,
       (select count(*) from {S}.aluno_dia_itens i where i.dono_user_id = {u('w5p-aluna')} and i.dia = (select d from hoje)
           and i.deleted_at is null) as itens_do_dia_hoje,
       (select count(*) from {S}.aluno_dia_refeicoes e where e.dono_user_id = {u('w5p-aluna')} and e.dia = (select d from hoje)
           and e.deleted_at is null) as extras_hoje,
       (select count(*) from {S}.aluno_acessos_log l, a where l.paciente_id = a.id and l.em > now() - interval '30 minutes') as historico_recente_a""")[0]
print("principal/staging:", r)
sobras = B.Massa().sobras()
print("sobras da W-A (marca 'WA E2E'):", sobras)
estados = {}
for nome in ("p5-estado.json", "p4-estado.json", "p3-estado.json", "api-estado.json", "massa-estado.json"):
    f = B.SCRATCH / "w-a" / nome
    estados[nome] = bool(f.exists() and json.loads(f.read_text(encoding="utf-8") or "{}") not in ({}, {"matriculas": [], "papeis": []}))
print("estados com massa de rodada anterior:", estados)
ok = (r["matricula_a"] == 1 and r["plano_ativo_da_a"] == 1 and r["refeicoes_hoje_com_alimento"] >= 2 and r["itens_hoje"] >= 3
      and r["nivel_dieta_a"] == "ver" and r["matriculas_com_nutri"] == 1 and r["taco_arroz"] >= 1 and r["itens_do_dia_hoje"] == 0
      and r["extras_hoje"] == 0 and all(int(v) == 0 for v in sobras.values()) and not any(estados.values()))
print("massa de TESTE pronta para o E2E da P5:", ok,
      "(o caso das 2 matrículas precisa de conta_w13_com_nutricao = True; o dos pratos prontos, sozinho_com_alimentacao = 1 e sozinho_com_nutri = 0;"
      " historico_recente_a > 0 = alguém mexeu na matrícula A há pouco: conferir no quadro)")
raise SystemExit(0 if ok else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p5/funcoes_wa.py`:
```python
#!/usr/bin/env python3
"""W-A P5 (a cópia da P3) — SÓ LEITURA (GET da Management API): as 3 funções da W-A nos 2 projetos — existe?, versão, verify_jwt, status.
Uso: python3 funcoes_wa.py [--esperar-ausentes | --esperar-publicadas]   (saída 0 = o esperado; sem opção: só mostra)"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAT = (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()
UA = "physiq-unificado/1.0 (w-a p5)"
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

`~/projetos/physiqcalc-scratch/w-a/p5/prova_local.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 5; de novo na Task 7, depois do rebase na main com a 21d) — a prova LOCAL inteira, um passo por vez na fila do pesado (o que o
# CI do PR roda + as provas da P5); a saída de cada passo em prova-<passo>.txt. Rodadas GRANDES (lint e Vitest do repo inteiro, build): SÓ
# aqui, com a fila livre entre os passos. Leva ~17–20 min: quem tem o limite de 10 min por comando usa o prova_partes.sh (os MESMOS passos).
# uso: bash prova_local.sh               (tudo)
#      bash prova_local.sh --sem-build   (sem o build + chunks)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PYTHONDONTWRITEBYTECODE=1 PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
cd "${P5_W:-$HOME/projetos/physiqcalc-wa-p5}" || exit 9  # P5_W: só o ensaio do plano usa
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
passo seco python3 e2e/wa/telas_dieta.py --seco
passo compila python3 -c "compile(open('e2e/wa/telas_dieta.py').read(), 'telas_dieta.py', 'exec'); print('compila ok')"
echo "── git status --short (vazio = tudo commitado)"
git status --short
echo "── fim $(date +%T):$resumo"
```

`~/projetos/physiqcalc-scratch/w-a/p5/prova_partes.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 5 e Task 7, o executor) — a prova_local.sh em PARTES de menos de 10 min, cada uma em PRIMEIRO PLANO: um comando do
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
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
cd "${P5_W:-$HOME/projetos/physiqcalc-wa-p5}" || exit 9  # P5_W: só o ensaio do plano usa
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
    passo seco python3 e2e/wa/telas_dieta.py --seco
    passo compila python3 -c "compile(open('e2e/wa/telas_dieta.py').read(), 'telas_dieta.py', 'exec'); print('compila ok')"
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

`~/projetos/physiqcalc-scratch/w-a/p5/prova_tmux.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Tasks 5 e 7) — a prova_local.sh inteira dentro de um tmux "wa-p5-prova" (passa de 10 min e a fila do pesado é dividida com a LINUX 1;
# nada solto em background): a saída em prova-saida.txt e a última linha "PROVA-FIM rc=<n>" quando acabar. Conferir com
# `tail -4 ~/projetos/physiqcalc-scratch/w-a/p5/prova-saida.txt` (ou esperar pelo "PROVA-FIM").
# uso: bash prova_tmux.sh [--sem-build]
set -u
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
saida="$S/prova-saida.txt"
: > "$saida"
tmux kill-session -t wa-p5-prova 2>/dev/null
tmux new-session -d -s wa-p5-prova "bash $S/prova_local.sh ${1:-} >> $saida 2>&1; echo \"PROVA-FIM rc=\$?\" >> $saida"
echo "prova rodando no tmux wa-p5-prova → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p5/preview.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 6) — o build de STAGING (o .env.local da worktree: VITE_DB_SCHEMA=staging) servido em http://localhost:5173 (--strictPort; a
# 8080 é da LINUX 1) num tmux "wa-p5-preview" (nada solto em background). site = npm run build · loja = npm run build:loja · parar.
# uso: bash preview.sh site | loja | parar
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
W="${P5_W:-$HOME/projetos/physiqcalc-wa-p5}"  # P5_W: só o ensaio do plano usa (a cópia fora do repo)
cd "$W" || exit 9
modo="${1:?site | loja | parar}"
tmux kill-session -t wa-p5-preview 2>/dev/null
if [ "$modo" = "parar" ]; then echo "preview parado"; exit 0; fi
if ss -ltn | grep -q ":5173 "; then echo "PAROU: a porta 5173 está ocupada por outro processo (não derrubo o que não é meu)"; exit 1; fi
case "$modo" in
  site) flock "$P" npm run build > "$HOME/projetos/physiqcalc-scratch/w-a/p5/build-site.txt" 2>&1 || { echo "build do site falhou"; exit 1; } ;;
  loja) flock "$P" npm run build:loja > "$HOME/projetos/physiqcalc-scratch/w-a/p5/build-loja.txt" 2>&1 || { echo "build da loja falhou"; exit 1; } ;;
  *) echo "uso: site | loja | parar"; exit 2 ;;
esac
grep -o 'physiq-distribuicao" content="[a-z]*"' dist/index.html
tmux new-session -d -s wa-p5-preview "cd $W && PATH=$HOME/.local/node/bin:\$PATH $HOME/.local/node/bin/npx vite preview --port 5173 --strictPort"
for _ in $(seq 1 40); do
  if curl -sf http://localhost:5173/health.json > /dev/null; then break; fi
  sleep 1
done
curl -s http://localhost:5173/health.json; echo
```

`~/projetos/physiqcalc-scratch/w-a/p5/e2e_local.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 6) — o E2E de tela LOCAL (5173) dentro de um tmux "wa-p5-e2e" (o comando passa de 10 min; nada solto em background):
# a saída inteira em e2e-local-<modo>.txt e a última linha "E2E-FIM rc=<n>" quando acabar.
# uso: bash e2e_local.sh site | loja | velho     (velho = o build de ANTES da P5 servido pelo velho.sh — o "APK velho")
set -u
modo="${1:?site | loja | velho}"
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
W="$HOME/projetos/physiqcalc-wa-p5"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
saida="$S/e2e-local-$modo.txt"
extra=""
[ "$modo" = "loja" ] && extra="--loja"
[ "$modo" = "velho" ] && extra="--velho"
: > "$saida"
tmux kill-session -t wa-p5-e2e 2>/dev/null
tmux new-session -d -s wa-p5-e2e "cd $W && TMPDIR=$HOME/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_dieta.py --base local $extra --canal msedge >> $saida 2>&1; echo \"E2E-FIM rc=\$?\" >> $saida"
echo "E2E $modo rodando no tmux wa-p5-e2e → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p5/e2e_tmux.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Tasks 8 e 10) — um E2E dentro do tmux "wa-p5-e2e" (passa de 10 min; nada solto em background), na worktree da P5, na fila do
# pesado, com o TMPDIR do scratch e sem bytecode: a saída em e2e-<rótulo>.txt e a última linha "E2E-FIM rc=<n>".
# uso: bash e2e_tmux.sh <rótulo> <script.py> [args…]    ex.: bash e2e_tmux.sh staging e2e/wa/telas_dieta.py --base staging --canal msedge
set -u
rotulo="${1:?rótulo}"; shift
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
W="$HOME/projetos/physiqcalc-wa-p5"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
saida="$S/e2e-$rotulo.txt"
: > "$saida"
args=""
for a in "$@"; do args="$args '$a'"; done
tmux kill-session -t wa-p5-e2e 2>/dev/null
tmux new-session -d -s wa-p5-e2e "cd $W && TMPDIR=$HOME/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 $args >> $saida 2>&1; echo \"E2E-FIM rc=\$?\" >> $saida"
echo "E2E $rotulo rodando no tmux wa-p5-e2e → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p5/velho.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 6, o "APK velho" — risco 13 da spec) — a main SEM a P5 (origin/main do momento) numa worktree descartável, o build da LOJA de
# staging (VITE_APP_NATIVO=1: o mesmo JS que vai dentro do APK de hoje) servido na 5173 (tmux "wa-p5-velho"), para o telas_dieta.py --velho
# provar que o app de antes segue igual com a Dieta liberada. Só leitura no git (worktree detached; sai no "parar").
# uso: bash velho.sh subir | parar
set -u
W=/home/bertoldo/projetos/physiqcalc-p5-velho
P5=/home/bertoldo/projetos/physiqcalc-wa-p5
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
case "${1:?subir | parar}" in
  subir)
    if ss -ltn | grep -q ":5173 "; then echo "PAROU: a 5173 está ocupada"; exit 1; fi
    if [ -n "$(git -C "$P5" diff origin/main HEAD --stat -- package.json package-lock.json)" ]; then echo "PAROU: a P5 mudou as dependências"; exit 1; fi
    [ -d "$W" ] || git -C /home/bertoldo/projetos/physiqcalc worktree add --detach "$W" origin/main || exit 1
    [ -e "$W/node_modules" ] || ln -s "$P5/node_modules" "$W/node_modules"
    cp "$P5/.env.local" "$W/.env.local"
    cd "$W" || exit 9
    if [ -d src/dieta-livre ]; then echo "PAROU: a worktree do velho já tem a P5 (src/dieta-livre)"; exit 1; fi
    echo "velho em $(git rev-parse --short HEAD) (sem a P5)"
    flock "$P" npm run build:loja > "$HOME/projetos/physiqcalc-scratch/w-a/p5/velho-build.txt" 2>&1 || { echo "build falhou"; exit 1; }
    grep -o 'physiq-distribuicao" content="[a-z]*"' dist/index.html
    tmux kill-session -t wa-p5-velho 2>/dev/null
    tmux new-session -d -s wa-p5-velho "cd $W && PATH=$HOME/.local/node/bin:\$PATH $HOME/.local/node/bin/npx vite preview --port 5173 --strictPort"
    for _ in $(seq 1 40); do curl -sf http://localhost:5173/health.json > /dev/null && break; sleep 1; done
    curl -s http://localhost:5173/health.json; echo ;;
  parar)
    tmux kill-session -t wa-p5-velho 2>/dev/null
    if [ -d "$W" ]; then
      rm "$W/node_modules"
      git -C /home/bertoldo/projetos/physiqcalc worktree remove --force "$W"
    fi
    echo "velho parado e worktree removida" ;;
esac
```

`~/projetos/physiqcalc-scratch/w-a/p5/espera_21d.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 7) — a 21d (LINUX 1) já entrou na main? Só leitura: o squash "hml-21d" na origin/main, os PRs abertos e a linha da LINUX 1 no
# quadro. A P5 só vai ao staging e à main DEPOIS da 21d (o combinado de 13/10: a 21d antes; a P5 rebaseia em cima dela, o molde da
# Task 11 da P4).
# uso: bash espera_21d.sh   (saída 0 = a 21d está na main; 1 = ainda não)
set -u
cd "${P5_W:-$HOME/projetos/physiqcalc-wa-p5}" || exit 9  # P5_W: só o ensaio do plano usa
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

`~/projetos/physiqcalc-scratch/w-a/p5/esperar_vercel.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 8) — espera o staging da Vercel servir o commit empurrado (o /health.json com o sha curto de 7; até 15 min). Só leitura.
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

`~/projetos/physiqcalc-scratch/w-a/p5/realinhar_confere.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 10) — a condição (b) do quadro para realinhar `staging` = `main` depois do squash: o staging só tem os commits da P5 e a árvore
# dele é a do squash. Só leitura (o push com lease é um comando à parte, com o "pode ir" da LINUX 1).
# uso: bash realinhar_confere.sh <sha do squash da P5 na main>
set -u
cd "${P5_W:-$HOME/projetos/physiqcalc-wa-p5}" || exit 9  # P5_W: só o ensaio do plano usa
sq="${1:?sha do squash da P5 na main}"
git fetch origin
echo "── commits no staging que a main não tem (têm de ser SÓ os da branch da P5):"
git log --format='   %h %an — %s' origin/main..origin/staging
echo "── a árvore do staging × a do squash (vazio = iguais):"
git diff --stat origin/staging "$sq"
echo "STAGING_SHA=$(git rev-parse origin/staging)"
```

`~/projetos/physiqcalc-scratch/w-a/p5/smoke_prod.sh`:
```bash
#!/usr/bin/env bash
# W-A P5 (Task 10) — o smoke SÓ LEITURA na produção, um por vez, no tmux "wa-p5-e2e": a casca e a Dieta da conta de teste (a Guarda), o w07 e
# as funções da W-A sem 5xx desde o merge (o api.py --so-leitura lê também o q=dia). Saída em smoke-prod.txt; a última linha "SMOKE-FIM".
# uso: bash smoke_prod.sh <versão> <ISO UTC do merge>     ex.: bash smoke_prod.sh 3.118 2026-10-13T22:31:00Z
set -u
v="${1:?versão}"; desde="${2:?ISO UTC do merge}"
S="$HOME/projetos/physiqcalc-scratch/w-a/p5"
W="$HOME/projetos/physiqcalc-wa-p5"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
saida="$S/smoke-prod.txt"
: > "$saida"
cat > "$S/smoke_prod_corpo.sh" <<EOT
cd $W
export TMPDIR=$HOME/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1
echo "── telas_dieta --base prod"; flock $P python3 e2e/wa/telas_dieta.py --base prod --canal msedge; echo "rc=\$?"
echo "── telas_rotinas --base prod"; flock $P python3 e2e/wa/telas_rotinas.py --base prod --canal msedge; echo "rc=\$?"
echo "── w07/smoke_prod.py telas"; flock $P python3 e2e/w07/smoke_prod.py telas --versao $v --canal msedge; echo "rc=\$?"
echo "── api.py --so-leitura"; flock $P python3 e2e/wa/api.py --so-leitura --desde $desde; echo "rc=\$?"
echo SMOKE-FIM
EOT
tmux kill-session -t wa-p5-e2e 2>/dev/null
tmux new-session -d -s wa-p5-e2e "bash $S/smoke_prod_corpo.sh >> $saida 2>&1"
echo "smoke da produção rodando no tmux wa-p5-e2e → $saida"
```

`~/projetos/physiqcalc-scratch/w-a/p5/rodadas_p5.py`:
```python
#!/usr/bin/env python3
"""W-A P5 (Task 9) — as linhas do docs/e2e-rodadas.md (a mais nova em cima, no formato da tabela "## Rodadas"), do e2e-rodadas.tsv OFICIAL:
as da P5 (branch feat/w-a-p5-dieta-livre) e as de PRODUÇÃO da P4 que rodaram DEPOIS do merge dela (a regra: as de produção vão no PR seguinte;
--p4-desde "AAAA-MM-DD HH:MM" = a hora do squash da P4 — 13/10 11:31). As obs. saem com um texto-base: conferir e completar com as T<N>-FEITA.
Só imprime. Uso: python3 rodadas_p5.py [--p4-desde "2026-10-13 11:31"]"""
import argparse
from pathlib import Path

TSV = Path.home() / "projetos/physiqcalc-scratch/e2e-rodadas.tsv"
OBS = {
    "e2e/wa/telas_dieta.py": {
        "local": "telas do app (5173, build de staging): a Dieta 'Só ver' como hoje; liberada pela nutri: tirar só hoje e voltar, pôr da TACO, o alimento e a receita dela, a refeição extra com a receita, o anel = o que ela comeu, as rotinas na Dieta (e nos pratos prontos), travou no meio → volta ao 'só ver', 2 matrículas segue a do plano ativo; sobras 0",
        "local-loja": "telas da loja (5173, build:loja): travada, liberada, tirar/voltar e as rotinas na Dieta; sobras 0",
        "local-velho": "o 'APK velho' (o build da loja de ANTES da P5 na 5173) com a Dieta liberada: a tela de hoje, sem nada novo e sem ler o dia livre; o ✓ do plano marca e desmarca; sobras 0",
        "staging": "telas no staging (Vercel): o mesmo roteiro do local; sobras 0",
        "produção": "SÓ LEITURA (a Guarda): o Início e a Dieta da conta de teste aluno-calc abrem sem gravar (a conta é só de Treino: a dieta liberada é provada no staging)",
    },
    "e2e/hml20/rede.py": {"staging": "regressão da rede do app (família hml-20, --area aluno): 0 gravação ao abrir; a Dieta com as 2 leituras novas da aluno-dia (dia, rotinas)"},
}


def base_de(script: str, args: str) -> str:
    if "--base prod" in args or "--schema public" in args or "--so-leitura" in args or script.endswith("prod.py") or "smoke_prod" in script:
        return "produção"
    if "--base local" in args or "localhost" in args:
        return "local-loja" if "--loja" in args else "local-velho" if "--velho" in args else "local"
    return "staging"


ap = argparse.ArgumentParser()
ap.add_argument("--p4-desde", default="")
a = ap.parse_args()
saida = []
for linha in TSV.read_text(encoding="utf-8").splitlines():
    c = linha.split("\t")
    if len(c) < 6:
        continue
    data, branch, commit, script, args, placar = c[:6]
    if branch == "feat/w-a-p5-dieta-livre":
        b = base_de(script, args)
        obs = OBS.get(script, {}).get(b, "")
        mostra = {"local": "local", "local-loja": "local", "local-velho": "local"}.get(b, b)
        saida.append((data, "W-A P5", commit, script, args, mostra, placar, obs))
    elif branch == "feat/w-a-p4-aba-acessos" and a.p4_desde and data >= a.p4_desde and base_de(script, args) == "produção":
        saida.append((data, "W-A P4", commit, script, args, "produção", placar, "produção depois do merge da P4 (só leitura)"))
for data, wt, commit, script, args, base, placar, obs in sorted(saida, reverse=True):
    print(f"| {data[8:10]}/{data[5:7]} {data[11:16]} | {wt} | `{commit}` | `{script}{(' ' + args) if args else ''}` | {base} | {placar} | {obs} |")
print(f"\n{len(saida)} linhas ({sum(1 for s in saida if s[1] == 'W-A P5')} da P5, {sum(1 for s in saida if s[1] == 'W-A P4')} da P4)")
```

As cópias conferidas e os retratos (fora do plano, em `p5/`): `codigo/` + `codigo.md5` (os 13 arquivos novos, iguais aos blocos das Tasks 1–4), `patches/T3-teste.patch`,
`T3-codigo.patch` (iguais aos blocos `diff` da Task 3), `p5-edicoes.patch` (os 2 juntos — o `drift.sh` confere que aplica) e `orig/` (os 3 arquivos que a P5 edita, como
eram na `7a59930`). O ensaio: `ensaio/` e `ensaio2/` (as cópias; saem na Task 11), `ensaio_prova.sh`, `ensaio_resto.sh`, `ensaio_replay.sh` (o ensaio 2),
`ensaio_arquivos.sh` (a conferência sem Vitest), `replay.txt` + `replay-*.txt` (os placares de cada task), `ensaio-*.txt` e `ensaio2-*.txt` (as saídas das rodadas grandes)
e `gerar_plano.py` + `plano.tmpl.md` (este plano montado com os blocos conferidos).
