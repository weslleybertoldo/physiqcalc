# W-A — Acessos do aluno — desenho escrito — 12/10/2026

**Status:** desenho escrito em 12/10/2026, com as respostas do Weslley (P1–P10 e P8b, todas respondidas). **Nada implementado.**
Base conferida: `ed0d72e` (origin/main v3.109, já com a hml-20c). Próximo: `dev:spec-review` → plano mestre (`writing-plans`) →
foto do plano → OK dele → ciclo das partes (seção 6), uma worktree por vez, com as reservas no quadro
(`~/projetos/physiqcalc-scratch/quem-toca-o-que.md`). Mapa de origem: `~/projetos/physiqcalc-scratch/w-a/mapeamento-e-perguntas-2026-10-12.md`.

## 1. Pedido (palavras dele, 10/10/2026 ~23h20)

> *"Preciso adicionar depois de tudo a parte de acessos do aluno, quando clicar no aluno depois de financeiro, terá uma aba acessos,
> será algo semelhante ao que colocamos no nativo OS, as abas e as permissões, tem algumas permissões separadas, ex: acesso ao app,
> tá na aba resumo, acessos do aluno também, em treino tem a opção de travar as séries, tudo isso vai para aba acessos. E vai entrar
> mais opções, ex: opção travar a dieta, ex: hoje o aluno só pode dá o ok se comeu ou não, ele não consegue criar receitas ou
> alimentos igual ao NutriTrack."*

> *"Quero a opção de manter como está hoje, ou liberar para o aluno poder adicionar os alimentos, criar refeições. Ex: ele irá ter a
> opção de adicionar, remover alimentos, criar refeições, criar receitas. E criar rotinas, ex: creatina, remédios, suplementos etc
> (semelhante ao NutriTrack) onde ele cria a rotina e adicionar um horário e naquele horário ele recebe um lembrete de tomar ou fazer
> aquela rotina e se ele clicar nela ela marca como concluída, se for marcada antes do horário marcado ela não dispara o lembrete. Se
> essa opção estiver travada na aba acessos do personal/nutricionista, o aluno vai ficar igual está hoje, mas terá a opção de
> adicionar, editar ou remover as rotinas. As rotinas apareceram na tela inicial também e na aba dieta."*

Fotos de como é hoje: `~/Desktop/Plano de Retorno Pessoal/Physiq/acessos-do-aluno/2026-10-10-2310-ficha-do-aluno-hoje.jpg` (ficha do
aluno no celular: Avaliação · Prontuário · Financeiro na barra de abas; a "Acessos" entra depois de Financeiro) e
`2026-10-10-2319-dieta-do-aluno-hoje.jpg` (Dieta do app: o anel de kcal, "Refeições de hoje 3 de 3" e a folha da refeição só com
"Desmarcar" e "Foto pro diário").

## 2. Decisões

### 2.1 Respostas dele (12/10/2026)

| # | Pergunta | Resposta |
|---|---|---|
| P1 | Formato da aba | **"1"** — uma linha por parte do app, com níveis, como no Nativo OS (exemplo aprovado: Treino/Dieta "Só ver · Pode mexer", Rotinas sempre, App "Bloqueado · Liberado") (~16:20) |
| P2 | O que vai para Acessos | **"2"** — acesso ao app, login do aluno, travar séries, dieta, rotinas + "Diário alimentar com fotos" + "Envio de fotos pelo link"; "Mensagens automáticas no WhatsApp" FICA no Resumo (~16:25) |
| P3 | O lugar antigo | **"3"** — os controles SAEM do Resumo (cards Ajustes, menos o WhatsApp, e Acesso do aluno) e do editor de Treino (cadeado das séries), SEM aviso (~16:28) |
| P4 | Quem muda | **"2"** — QUALQUER profissional do aluno (personal, nutri, dono, master) muda qualquer linha (~16:33) |
| P5 | O que a dieta liberada muda | **"1"** — só o DIA dele (põe/tira alimento, refeição extra); o plano da nutri NÃO muda e ela vê o que ele mudou (~16:36) |
| P6 | Alimentos e receitas que ele cria | **"1"** — só DELE; a nutri vê quando ele usa no dia (não entram na base dela) (~16:39) |
| P7 | O profissional vê o que ele registrou e as rotinas? | **"1"** — SIM, na aba Dieta da ficha do aluno, dia a dia (~16:42) |
| P8 | Quem cria rotinas | **"2"** — o ALUNO e o PROFISSIONAL (~16:45) |
| P8b | A rotina que o profissional criou, o aluno muda? | **"2"** — pode TUDO: mudar horário, lembrete e nome, e APAGAR (~17:05–17:10) |
| P9 | Rotinas para quem | **"1"** — todo aluno com o app, inclusive quem usa o app SEM profissional (Início sempre; Dieta de quem tem a aba Dieta) (~17:05–17:10) |
| P10 | Lembrete para quem não usa o app Android | **"1"** — SÓ no app Android (notificação local, como o lembrete do treino); no site, aviso na tela se ela estiver aberta; sem WhatsApp e sem e-mail (~17:05–17:10) |

### 2.2 Padrões (decisão minha — não são do Weslley; trocar no spec-review se ele quiser)

1. **Rotinas de quem não tem a aba Dieta:** o profissional cria e vê num **card "Rotinas" no Resumo** (para todo aluno); o aluno vê no
   **Início** (sempre) e na **Dieta** (quem tem a aba). Porquê: o Resumo existe para todo aluno e todo profissional (`modulo: "ambos"`),
   não depende do módulo Nutrição, e a aba Acessos fica só com "quem pode o quê". O dia a dia (P7) também mostra as rotinas de cada dia.
2. **Guarda da hml-20 intacta:** o card "Acesso do aluno" muda de lugar SEM mudar o que faz (segue com as RPCs no navegador, que são da
   H-43/hml-21) e vai para a subpasta `src/painel/aluno/resumo/acesso/` (sai do Resumo — subpasta não é card — e continua na área
   `painel-aluno` da guarda). O WhatsApp do Resumo também segue como está. Porquê: tirar essas RPCs do navegador exige mudar
   `src/nutricao/semLeituraDireta.test.ts` (`:91-96` e `:292-303`), arquivo da hml-20d (LINUX 1); e a área tem `minimo: 100` com 104 hoje.
3. **Onde mora cada linha:** `acesso_app`, `diario_alimentar` e `acesso_link` continuam em `pacientes.config`; a **Dieta** vai numa
   tabela nova `aluno_acessos`. **Histórico de toda mudança por gatilho.** Porquê: a `minha_situacao`, o diário e o link leem as 3 de
   `pacientes.config`; a tabela nova só aceita valor válido, não tem gravação direta e cabe as próximas linhas; o gatilho pega também o
   caminho antigo (o APK velho do profissional e o REST).
4. **Séries:** a verdade continua no Banco do Treino (`physiq_profiles.series_travadas`, padrão `false`); a aba muda pela função nova
   `treino-acessos` (Treino), com o login do principal, no molde da `treino-leitura`. Porquê: o app lê pelo PowerSync e o APK velho segue
   igual; é o único jeito de a nutricionista e o dono sem papel no Treino mudarem (P4) — eles não têm sessão lá. O chip do editor sai (P3).
5. **Salva na hora, linha por linha**, com "Mudado por <nome> em dd/mm hh:mm" embaixo; "App: Bloqueado" pede confirmação
   (`useConfirmar`). Padrões das linhas = os de hoje: App Liberado (com login), Séries Pode mexer, Dieta Só ver, Diário e Link Liberados.
   Porquê: é o jeito dos Ajustes que o profissional já conhece; só bloquear o app fecha algo para o aluno; com vários profissionais
   mexendo (P4), o "mudado por" evita dúvida.
6. **Avisos no sino do aluno** (tipo `geral`, sem mexer na lista fechada de tipos): ao **liberar** a Dieta ("Sua dieta foi liberada:
   agora você pode pôr e tirar alimentos no seu dia") e quando um profissional **cria** uma rotina ("Seu profissional criou uma rotina
   para você"). Travar a Dieta não avisa. Porquê: sem aviso o aluno não descobre a novidade; sem o nome da rotina porque o push mostra o
   título na tela bloqueada e o nome pode ser um remédio.
7. **Rotinas (P8, P8b):** qualquer profissional do aluno cria e muda as rotinas criadas por profissional; as que o aluno criou são só
   dele (o profissional só vê); o aluno muda e apaga qualquer uma dele. **Apagar = arquivar:** some do app do aluno; o profissional ainda
   vê "apagada pelo aluno em dd/mm" e o histórico ("horário 08:00 → 09:00"). Porquê: segue a P4 (qualquer profissional), a P6 (o que é
   dele é dele) e a P7 (o profissional vê); arquivar guarda a história sem segurar o aluno (P8b).
8. **Forma da rotina:** nome, detalhe (dose), tipo (suplemento · remédio · hábito · outro), 1 horário (2 horários = 2 rotinas), dias da
   semana (1 = seg … 7 = dom), lembrete só com horário; até 30 vivas; marca hoje ou ontem (dia de São Paulo); só o aluno marca; dono = o
   login de quem cria. Porquê: o mínimo que cobre creatina e remédio; os dias seguem as metas e o "± 1 dia" segue o ✓ da refeição de
   hoje; o aluno do app sem profissional também tem login (P9).
9. **Quem vê as rotinas:** as do aluno, todo profissional que vê alguma matrícula viva dele; as criadas por profissional, quem vê a
   matrícula de onde ela foi criada. Porquê: a P7 manda mostrar; outra conta não vê o que outra conta criou.
10. **Dieta liberada (P5, P6):** vale hoje e ontem; na refeição do plano ele **tira um item só naquele dia** e **põe** alimento ou
    receita; cria **refeição extra** ("Já comi" ligado por padrão); o anel conta o que ele comeu (refeições com ✓, com o que tirou e pôs)
    contra o plano do dia. Refeição do plano sem alimento segue sem ✓: ele usa a refeição extra. O item do dia guarda o **retrato** (nome
    + macros da quantidade). Porquê: é a P5 com a regra de hoje ("conta o que tem ✓"), sem mexer na `paciente_marcar_refeicao`; o
    retrato faz o passado não mudar quando ele apaga um alimento.
11. **Busca do aluno:** TACO + os alimentos dele + os do plano dele + as receitas dele. **Receita dele** = ingredientes em gramas + nº de
    porções; no dia ele põe porções. Porquê: a base própria da nutri é dela (a P6 ao contrário); porção é como o aluno pensa a receita.
12. **Dieta travada de novo:** o app volta ao "como hoje"; o que ele registrou fica guardado (a nutri vê no dia a dia) e volta se liberar.
    O aluno do app sem profissional não tem dieta liberada. Porquê: "travada = igual hoje" (pedido); sem profissional não há quem libere.
13. **Dia a dia (P7):** seção nova "Dia a dia" na aba Dieta da ficha; para o personal (que hoje vê só o plano e a adesão) ela aparece
    embaixo da adesão. Porquê: a P7 disse "o profissional"; a dúvida sobre o personal virou a pergunta Q1 (seção 9).
14. **Lembretes (P10):** o molde do NutriTrack (repositório `weslleybertoldo/nutritrack`, `src/lib/habitReminders.ts`: `every: 'day'` +
    botão "Sim"): notificação repetida por rotina (diária, ou semanal por dia escolhido), faixa própria de ids, reconciliação ao abrir,
    ao voltar e a cada mudança, botão "Feito" e toque = feita. Porquê: está em produção no app dele e toca sem ele abrir o app.
15. **Lugar no app:** página `/perfil/rotinas` (registro por convenção) + item "Rotinas e lembretes" no Perfil + atalhos no card do
    Início e na seção da Dieta. Porquê: rota própria para o toque do aviso e o Voltar do aparelho.
16. **Funções:** 2 novas no principal (`acessos`, `aluno-dia`) e 1 no Treino (`treino-acessos`); nada na `nutricao`. Porquê: a
    `nutricao` é da homologação (LINUX 1); a parte do Treino mora no outro banco.
17. **LGPD:** "Exportar meus dados" e "Excluir minha conta" passam a levar as tabelas novas do aluno. Porquê: art. 18 (o aluno leva e
    apaga o que é dele).
18. **Ordem das partes:** servidor primeiro (escuro, sem tela), depois a aba Acessos, o app e, por último, o lado do profissional.
    Porquê: cada parte vai para a produção sem quebrar nada, e a aba chega antes do app para haver como liberar a Dieta.

## 3. Como está hoje (conferido no `ed0d72e`)

- **Abas da ficha:** catálogo em `src/painel/aluno/catalogoAbas.ts:11-28` (tipo `:12`, Financeiro `:27`, ordem dos cards `:31-44`;
  teste `catalogoAbas.test.ts:9,15`); barra que rola na horizontal em `AlunoLayout.tsx:53-81`; tela por convenção
  (`src/rotas/registro.ts:18`). As abas seguem os módulos da **conta** (`dados/regras.ts:398-405`): numa conta com Nutrição o aluno só
  do Treino vê a aba Dieta, mas ela diz "Este aluno não tem dieta" (`abas/Dieta.tsx:86-88`); numa conta só de Treino ela some. No app,
  a Dieta segue os módulos do aluno (`src/app-aluno/catalogoAbas.ts:24`, `src/nucleo/casca.ts:39`).
- **Ajustes do aluno** (Resumo): `resumo/CardAjustesAluno.tsx:18-71` (interruptor `:58-64`, travado sem login `:50,62`); textos em
  `dados/regras.ts:281-286`; grava pela RPC `aluno_salvar_ajustes` chamada do navegador (`dados/api.ts:65-68` →
  `migrations/20260930160000_w14_ajustes.sql:895-919`), em `pacientes.config`. Sem a chave, `acesso_app` = tem login (`:40-49`; gatilho
  da P15 `:56-74`). Quem muda: `w14_pode_editar` (`:718-724`: master, `w13_pode_gerir` — dono e responsáveis com o papel, `w13_alunos.sql:35-43`
  — e a nutri dona do registro antigo). O app fecha só se TODAS as matrículas vivas estiverem desligadas
  (`hml12_aceite_e_consentimento.sql:239` → `src/app-aluno/gates/pecas/acessoApp.ts:13-19`, `GateAcessoApp.tsx:16-50`).
- **Acesso do aluno** (Resumo): `resumo/CardAcessoAluno.tsx:44-194` (login, criar acesso, senha provisória, bloqueio, desativar/
  reativar/remover); RPCs do navegador `resumo/acesso/api.ts:14-31` (H-43, `docs/banco-permissoes.md:150-151`); quem pode:
  `pode_mexer_no_acesso` (`w08b_limite_login.sql:289-297`). O ⋯ do cabeçalho rola até ele (`Cabecalho.tsx:87-93,139`).
- **Séries travadas:** chip do editor (`src/treino/editor/EditorTreino.tsx:113,231-241`) → `editor/api.ts:206` → `admin-semana-treinos`
  `setConfig` (`supabase/functions/admin-semana-treinos/index.ts:1032-1064`) → `physiq_profiles.series_travadas` (Banco do Treino). O app lê
  pelo PowerSync (`src/treino/useTreinoDoDia.ts:111-126`) e só a tela trava (`ui/TreinoDoSlot.tsx:201`, `useAcoesSeries.ts:186,199`). Quem
  muda: master, o personal responsável e o dono que também é personal (`useTreinoDoAlunoPainel.ts:11-18`); o dono sem papel no Treino
  entra como leitor (`admin-semana-treinos/index.ts:119-125`) e a nutri lê pela `treino-leitura` (`abas/Treino.tsx:46-60`).
- **Dieta do app:** `src/app-aluno/abas/Dieta.tsx:43-49` (nutri → plano; app sem profissional com Alimentação → pratos prontos
  `:52-61`). Lê pela `nutricao` (`aluno_dieta` = `minha_dieta`, `src/nutricao/app/pacienteApp.ts:94-100`); grava ✓ da refeição, ✓ da meta e
  a foto pela `nutricao` (`functions/nutricao/aluno.ts:22-42`); a refeição só ganha ✓ com alimento no plano. Folha da refeição:
  `src/nutricao/app/ui/SheetRefeicao.tsx:46-57`. O aluno não grava plano, alimento nem receita (`planejamento.sql:11,58,117`,
  `alimentos.sql:17`, `receitas.sql:57,104` são da nutri; `refeicoes_concluidas.sql:13` só por RPC).
- **Dieta da ficha:** `src/painel/aluno/abas/Dieta.tsx:78-155`; acesso `src/nutricao/editor/lib/acesso.ts:32-40` (nutri responsável e master
  editam; dono vê; personal "só plano" + adesão de 7 dias `abas/Dieta.tsx:56-70,143`); seções `acesso.ts:5-13`. Desde a hml-20c tudo isso
  lê pela `nutricao` (`lerNutricao`) e a guarda da área `dieta` está em base 0.
- **Início do app:** linhas `src/app-aluno/abas/Inicio.tsx:27`, quem vê cada card `:35-41`; card novo entra no fim sozinho
  (`:61-73`); "o que o aluno tem" em `inicio/pecas/dados.ts:43-59`. Perfil com itens fixos (`abas/Perfil.tsx:126-141`).
- **Notificações:** push FCM só no APK Android (gatilho `avisos_push`, `w20c_push.sql:123-154` → `functions/push-enviar`); tipos do sino em
  lista fechada (a que vale: `w06_financeiro_aluno.sql:74-76`). Locais: lembrete do treino id 2001 (`perfil/pecas/lembrete.ts:15`,
  `useLembreteDoTreino.ts:17-66`; no site só com a aba aberta `:52-65`), timer 1002 e treino longo 1101–1103 (`src/lib/nativeNotifications.ts:7,13`),
  consultas 3000–3899 (`src/agenda/avisoLocal.ts:9,40-45`); ouvinte de toque que filtra por `extra.rota` (`AvisoConsultaNova.tsx:92-95`).
  Manifest com POST_NOTIFICATIONS e SCHEDULE_EXACT_ALARM (`AndroidManifest.xml:98-99`), targetSdk 36 (`android/variables.gradle:4`),
  plugin `@capacitor/local-notifications` 8 (`package.json:26`); ninguém chama `checkExactNotificationSetting`.
- **Jeito 2:** porta `supabase-principal/functions/_shared/porta-pessoa.ts:115` (como a pessoa, sem chave secreta); molde
  `functions/financeiro/index.ts:147` + `src/financeiro/gravar.ts:72`; leitura do Treino com o login do principal: `supabase/functions/treino-leitura`
  (chamada pela tela em `src/treino/editor/api.ts:275-278`).
- **Guardas que a W-A encontra:** `src/lib/logsDasFuncoesPrincipal.test.ts:22,34` e `logsDasFuncoesTreino.test.ts:24,63,261` (toda função
  numa lista); a Guarda dos E2E `e2e/hml17/_base.py:229-254` e `e2e/w26/prod.py:43-46` (função desconhecida conta como GRAVAÇÃO — o
  `rede` da hml-20 acusaria "gravação ao abrir" no Início); CI `checar-definer`, `checar-funcoes` (R1–R4), `checar-chunks`; telas
  `semDialogoNativo.test.ts` (`useConfirmar` de `src/ui/premium/useConfirmar.ts:31`) e `larguraCelular.test.ts`.
- **O painel do profissional também roda no APK** (só o master sai: `src/lib/plataforma.ts:11-14`, `Rotas.tsx:97-98`): o APK velho de um
  profissional mostra os cards antigos e o cadeado — os caminhos antigos (`aluno_salvar_ajustes`, `setConfig`) ficam funcionando.

**O que mudou em relação ao mapeamento (feito no `ef2bd3c`):** (a) a hml-20c entrou: a lista "não mexer" agora é a da hml-20d (seção
5.7) e a regra "P6/P7 só depois da 20c" caiu; (b) a guarda `semLeituraDireta` cobre o Resumo e os dados do aluno com a lista EXATA de
RPCs → o login e o WhatsApp não vão para o servidor nesta W (padrão 2); (c) a Dieta da ficha lê pelo servidor → o dia a dia nasce no
jeito 2, fora de `src/nutricao/editor/lib/` (área `dieta` em base 0); (d) o `rede` da hml-20 conta função desconhecida como gravação →
as leituras da W-A entram na Guarda; (e) correções: o painel não é só site (APK), o dono só muda séries com papel de personal, a lista de
tipos do sino é a da w06, `gravar.ts:72` (não 74).

## 4. Desenho funcional

### 4.1 Painel › aba **Acessos** (depois de Financeiro, todo aluno)

Topo: "O que <primeiro nome> pode fazer no app. Qualquer profissional dele (personal, nutricionista, dono da conta) muda; cada mudança
fica registrada." Duas colunas no computador (`grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]`): à esquerda as linhas, à
direita **Login do aluno** (o card de hoje, igual). No celular, uma embaixo da outra; a aba ativa rola para a vista na barra.

| Linha | Níveis | Dica | Quando aparece / observação |
|---|---|---|---|
| Acesso ao app | Bloqueado · **Liberado** | Bloqueado: o app abre fechado com "Seu acesso ao app está desligado. Fale com seu profissional". | Sem login: desligada, "Ele ainda não tem login: crie o acesso em Login do aluno." Bloquear pede confirmação |
| Treino — séries | Só ver · **Pode mexer** | Só ver: ele não põe nem tira séries (o nº vem do treino). Pode mexer: põe e tira séries no app. | Só com Treino. Antes do 1º acesso: "Vale depois do 1º acesso do aluno ao app." Carrega à parte (Banco do Treino) |
| Dieta | **Só ver** · Pode mexer | Só ver: como hoje — vê o plano e marca o que comeu. Pode mexer: no dia dele, põe e tira alimentos, cria refeições extras e os próprios alimentos e receitas. O plano não muda. | Só com nutricionista; senão "Este aluno não tem dieta" |
| Diário alimentar com fotos | Bloqueado · **Liberado** | O aluno manda fotos das refeições (no app e pelo link) e você reage. | Só com Nutrição |
| Envio de fotos pelo link | Bloqueado · **Liberado** | Ele manda as fotos pelo link do diário, sem entrar no app. | Só com Nutrição; "Vale quando o diário estiver liberado" |
| Rotinas | **Sempre liberadas** (sem botão) | Ele cria, muda e apaga as rotinas dele (creatina, remédio…). As suas você cria no card Rotinas do Resumo. | Todo aluno |

Cada linha com botões de rádio de verdade (Tab entra, setas trocam — o molde `AcessosDoMembro.tsx` do Nativo OS), cor por nível
(neutro · azul · verde), "Mudado por Ana em 12/10 17:20" e, no rodapé, o resumo: "App liberado · séries: pode mexer · dieta: só ver ·
rotinas sempre". Salvou → toast "Salvo"; deu erro → volta o nível e mostra a frase do código.

### 4.2 O que sai do lugar antigo (P3, sem aviso)
- **Resumo:** o card "Acesso do aluno" sai (vai inteiro para Acessos); o card "Ajustes do aluno" fica só com "Mensagens automáticas no
  WhatsApp" e passa a se chamar **"Mensagens automáticas"**; "Link do diário" fica (é a ferramenta de mandar o link), com o texto
  "desligado na aba Acessos". Entra o card **Rotinas** (4.5).
- **Editor de Treino:** o chip "ALUNO NÃO MUDA/PODE MUDAR AS SÉRIES" sai.
- **Textos que apontavam para o lugar antigo:** "Crie o acesso no Resumo" da aba Treino (`abas/Treino.tsx:39-41`) → "na aba Acessos";
  o "Acesso do aluno" do ⋯ do cabeçalho abre a aba Acessos; a faixa das mensagens desligadas (`FaixaMensagensDesligadas.tsx:101`) aponta
  para o card "Mensagens automáticas".

### 4.3 App do aluno — rotinas (todo aluno, P9)
- **Início:** card "Rotinas de hoje" logo depois da linha Dieta/Metas: até 4 (as próximas pela hora) + "+N"; ✓ na hora (otimista);
  hora, nome e detalhe; selo "do seu profissional" nas criadas por profissional. Vazio: "Crie a sua 1ª rotina (creatina, remédio,
  água…)" + "Criar rotina".
- **Página `/perfil/rotinas`** ("Rotinas e lembretes" no Perfil): todas as vivas, por hora; "Nova rotina" (folha: nome, detalhe, tipo,
  horário, dias — atalhos "Todos os dias · Seg a Sex · Fim de semana" das metas —, lembrete); tocar abre para mudar; "Apagar" com
  `useConfirmar` (a do profissional também, P8b). Avisos: notificações bloqueadas; "Alarmes e lembretes" desligado ("o lembrete pode
  atrasar — Ligar"); dica da economia de bateria; limite de 30.
- **Dieta:** seção "Rotinas de hoje" no fim da aba (também nos pratos prontos do app sem profissional), a mesma lista do Início.

### 4.4 App do aluno — dieta liberada (P5, P6)
- **Só ver:** tudo como hoje.
- **Pode mexer:** na folha da refeição, cada item do plano ganha "Tirar hoje" (fica riscado, com "Voltar"), e embaixo "Adicionar
  alimento" (busca: TACO, os dele, os do plano, as receitas dele; quantidade em gramas ou porções). Os itens que ele pôs aparecem com o
  selo "você pôs" e "Tirar". Embaixo da lista de refeições: "Nova refeição" (nome, horário, "Já comi") e "Meus alimentos e receitas"
  (criar/editar/apagar alimento por 100 g com porção; receita com ingredientes e porções). O anel e as barras contam o que ele comeu.
- Erros: a dieta travou no meio → "A sua dieta voltou a ser só para ver" e recarrega; sem internet → botões desligados (como o ✓ hoje).

### 4.5 Profissional vê e cria (P7, P8)
- **Card "Rotinas" no Resumo** (todo aluno): as de hoje com o ✓ que o aluno deu (só leitura), "Nova rotina" (a mesma folha, avisa o
  aluno no sino), editar/apagar só as criadas por profissional; "Ver tudo": as apagadas ("apagada pelo aluno em 12/10") e o histórico.
  Aluno sem login: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos."
- **Aba Dieta da ficha › "Dia a dia"** (alunos com nutri): escolhe o dia (últimos 14); por refeição, os itens do plano (riscados os
  que ele tirou), os que ele pôs ("pelo aluno", com os macros), o ✓; as refeições extras; o total comido × plano; as rotinas do dia
  (feitas/não). Faixa "A dieta está em 'Só ver' (Acessos)" quando travada. Vazio: "Nada registrado pelo aluno nestes dias."

### 4.6 Lembretes (P10)
- **APK Android:** no horário, "Hora da rotina — Creatina · 5 g" com o botão **"Feito"**; tocar no aviso ou em "Feito" abre o app e
  marca (toast "Creatina feita · Desfazer"); marcou antes → aquele dia não toca; desmarcou antes da hora → volta a tocar. Sem internet,
  o toque abre o app e avisa "Sem internet — marque quando ela voltar" (sem fila guardada no aparelho).
- **Site:** com a página aberta, no horário, toast com "Marcar como feita" (+ a notificação do navegador se ela já estiver permitida).
  iPhone usa o site: mesmo comportamento.

### 4.7 Estados e erros comuns
Esqueleto do mesmo tamanho ao carregar; erro com "Tentar de novo" (`EstadoErro`); a linha de séries tem erro próprio ("Não deu para ler
o Treino agora") sem derrubar as outras; sem internet, os controles desligados com o aviso; frases fixas por código (nunca a mensagem
crua do banco).

## 5. Desenho técnico

### 5.1 Banco principal (migrations novas, `staging` e `public`, cada uma com reversa em `supabase-principal/reversas/`)

**`<a reservar>_wa1_acessos.sql`**
- `aluno_acessos` (paciente_id → pacientes on delete cascade, chave `check in ('dieta')`, nivel `check in ('ver','mexer')`,
  alterado_por, alterado_em; pk (paciente_id, chave)). Sem linha = "ver". RLS: SELECT para `pode_ver_aluno(paciente_id)` e o próprio
  aluno; **sem policy de escrita** (só as RPCs).
- `aluno_acessos_log` (id, paciente_id, chave `in ('acesso_app','diario_alimentar','acesso_link','dieta','treino_series')`, de, para, por,
  em). RLS: SELECT para `pode_ver_aluno`. Gatilhos AFTER: em `pacientes` (UPDATE OF config — as 3 chaves) e em `aluno_acessos`.
- RPCs (definer, `search_path = ''`, `revoke … from public, anon` + `grant … to authenticated, service_role`):
  `acessos_ler(p_aluno)` (via `w14_matricula_da_rota`: paciente_id, treino_user_id, tem_login, os `modulos` da `aluno_perfil`,
  `pode_mudar = w14_pode_editar`, as 4 linhas e a última mudança de cada chave com o nome) · `acessos_salvar(p_aluno, p_chave, p_valor)`
  (lista fechada; `w14_pode_editar`; App exige login; Dieta/Diário/Link exigem nutricionista; as 3 chaves pela `aluno_salvar_ajustes`
  de hoje; a Dieta no upsert; liberar → aviso `geral`) · `acessos_registrar_series(p_aluno, p_de, p_para)` (só `treino_series`;
  `w14_pode_editar`; o log). Interna (só servidor): `aluno_dieta_liberada(p_paciente)`.

**`<a reservar>_wa2_rotinas.sql`**
- `rotinas` (id, dono_user_id → auth.users on delete cascade, paciente_id → pacientes on delete set null — nulo = do aluno, criada_por,
  nome 1–60, detalhe ≤ 120, tipo `in ('suplemento','remedio','habito','outro')`, horario time nulo, dias_semana smallint[] `{1..7}` (≥ 1),
  lembrete `check (not lembrete or horario is not null)`, ordem, arquivada_em/por, criada_em, alterada_em/por).
- `rotinas_feitas` (rotina_id on delete cascade, dia, feita_em; pk (rotina_id, dia)) · `rotinas_historico` (rotina_id, por, quem
  `in ('aluno','profissional')`, o_que `in ('criou','mudou','arquivou')`, antes/depois jsonb só com os campos mudados, em).
- RLS: SELECT do dono; do profissional pela regra do padrão 9; **sem policy de escrita**.
- RPCs do aluno: `minhas_rotinas(p_de, p_ate)` (≤ 31 dias), `rotina_salvar(p_id, p_dados)`, `rotina_arquivar(p_id)`,
  `rotina_marcar(p_id, p_dia, p_feita)` (hoje/ontem SP; dia da semana da rotina), `rotinas_ordenar(p_ids)`. Do profissional:
  `rotinas_do_aluno(p_aluno, p_de, p_ate)` (com as arquivadas e o histórico), `rotina_prof_salvar(p_aluno, p_id, p_dados)` (cria com
  `paciente_id` da rota; muda só as de profissional; `w14_pode_editar`; criar → aviso `geral`), `rotina_prof_arquivar(p_aluno, p_id)`.

**`<a reservar>_wa3_dieta_livre.sql`**
- `aluno_alimentos` (dono_user_id, nome 1–80, porcao_g, energia_kcal/proteina_g/carboidrato_g/lipidio_g/fibra_g por 100 g ≥ 0, busca
  gerada por `texto_busca`, deleted_at) · `aluno_receitas` (dono, nome, porcoes ≥ 1, deleted_at) + `aluno_receita_itens` (receita, alimento_id
  → alimentos OU aluno_alimento_id, quantidade_g, ordem; exatamente um dos 2).
- `aluno_dia_refeicoes` (paciente_id, dono, dia, nome 1–40, horario, concluida_em, deleted_at) · `aluno_dia_itens` (paciente_id, dono,
  dia, tipo `in ('adicionado','tirado')`, refeicao_id → refeicoes OU extra_id → aluno_dia_refeicoes, item_refeicao_id → itens_refeicao
  (só no `tirado`, único por dia), a origem (alimento_id | aluno_alimento_id | aluno_receita_id), quantidade_g ou porcoes, o retrato
  nome + 5 macros, deleted_at).
- RLS: SELECT do dono; sem policy de escrita. RPCs do aluno (todas exigem `aluno_dieta_liberada`, dia hoje/ontem, a refeição de um
  plano vivo dele): `meu_dia(p_dia)` (lê mesmo travada: devolve `liberada` por matrícula), `dia_adicionar`, `dia_tirar`, `dia_desfazer`,
  `dia_extra_salvar`, `dia_extra_excluir`, `dia_extra_marcar`, `meus_alimentos()`, `meu_alimento_salvar/excluir`,
  `minha_receita_salvar/excluir`, `buscar_alimentos_do_aluno(p_termo, p_pagina)` (20 por página). Do profissional:
  `dia_do_aluno(p_aluno, p_de, p_ate)` (≤ 31 dias). Limites: 100 itens e 10 extras por dia; 300 alimentos e 100 receitas (30 itens cada).
- `exportar_dados_aluno` e `excluir_dados_aluno` (`w07_perfil.sql:114-194,199-…`): `create or replace` com as tabelas das 3 migrations
  (exportar; contar e apagar as do aluno — o resto já sai pelo `on delete cascade` do login).

### 5.2 Funções (Edge) e contratos — POST, `Authorization: Bearer <token do principal>`, `x-schema: public|staging`, `{ acao, … }`

| Função | Ações (leitura = `ler`) | Volta |
|---|---|---|
| `acessos` (principal, `servirComoPessoa`, freio 120/min, verify_jwt true) | `ler { aluno }` · `salvar { aluno, chave, valor }` | `{ ok, paciente_id, pode_mudar, tem_login, modulos, linhas, mudancas }` |
| `aluno-dia` (principal, `servirComoPessoa`, freio 240/min, verify_jwt true; módulos `rotinas.ts`, `dieta.ts`, `profissional.ts`) | `ler { q }` com q = `rotinas` · `dia { dia }` · `biblioteca` · `alimentos { termo, pagina }` · `aluno_rotinas { aluno, de, ate }` · `aluno_dia { aluno, de, ate }`; aluno: `rotina_salvar`, `rotina_arquivar`, `rotina_marcar`, `rotinas_ordenar`, `dia_adicionar`, `dia_tirar`, `dia_desfazer`, `extra_salvar`, `extra_excluir`, `extra_marcar`, `alimento_salvar`, `alimento_excluir`, `receita_salvar`, `receita_excluir`; profissional: `prof_rotina_salvar`, `prof_rotina_arquivar` | `{ ok, … }` (a linha ou a lista) |
| `treino-acessos` (Treino, verify_jwt **false**: o token é do principal; molde `treino-leitura`) | `ler { aluno }` · `salvar { aluno, valor }` | `{ ok, series: 'ver'\|'mexer', pode_mudar }` · `{ ok, series, registrado }` |

- Cada função confere a FORMA (ação em lista fechada, uuid, data, "HH:MM", tamanhos, níveis por chave) e chama a RPC **como a pessoa**;
  dono/autor saem do token, nunca do corpo. Erros: 400 `dados_invalidos`/`acao_invalida` · 401 `sem_login` · 403 `sem_acesso` · 404
  `nao_encontrado`/`aluno_inexistente`/`sem_treino` · 409 `dieta_travada`/`sem_login_do_aluno`/`sem_nutricao`/`sem_modulo`/`so_do_aluno`/`limite` ·
  413 · 429 `muitas_acoes` · 500 `erro_interno` (+ aviso) · 502 `principal_indisponivel` (Treino).
- `treino-acessos`: GET `/auth/v1/user` no principal → `acessos_ler` como a pessoa (treino_user_id, pode_mudar, módulo Treino) → lê/grava
  SÓ `series_travadas` com a chave de serviço DO TREINO (não há outra: a nutri não tem sessão lá) → `acessos_registrar_series` como a
  pessoa (falhou → `registrado: false` + log.erro; a gravação vale). Prazo 20 s, `buscarComTempo`, freio por IP e por pessoa.
  Publicar: `scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions treino-acessos false` (nunca pelo `deploy-function.yml`).
- Front: `src/acessos/api.ts` (no molde de `src/financeiro/gravar.ts`: 1 chamada, sem repetir, `sem_internet` antes, erro com o código e
  a frase fixa; a `treino-acessos` pelo `criarFetchResiliente(0, TEMPO_FUNCAO_MS)` como a `treino-leitura`) e `src/aluno-dia/{api,tipos,regras}.ts`
  (regras puras: rotinas de um dia, o dia aplicado sobre o plano — riscados, adicionados, extras, totais comido × plano —, datas de SP).

### 5.3 Front (pastas novas; peças do visual premium; `grid-cols-1` + breakpoint; `useConfirmar`)
- Painel: `src/painel/aluno/abas/Acessos.tsx` + `src/painel/aluno/acessos/*` (linhas, rádios, resumo, hook) · `resumo/acesso/CardAcessoAluno.tsx`
  (movido) · `resumo/CardRotinas.tsx` + `src/painel/aluno/rotinas/*` · `src/painel/aluno/diaADia/*`.
- App: `src/app-aluno/inicio/CardRotinasHoje.tsx` · `src/app-aluno/perfil/Rotinas.tsx` · `src/rotinas/*` (hooks, lista, folha, lembretes) ·
  `src/ui/avisos/LembreteDasRotinas.tsx` (aviso global da casca, registrado por convenção — o molde do `AvisoConsultaNova`) ·
  `src/dieta-livre/*` (folhas da busca, refeição extra, meus alimentos, receita).
- Tudo por convenção (lazy) → `checar-chunks` sem pesado novo; o React Query invalida o perfil do aluno depois de salvar um acesso.

### 5.4 APK e lembretes locais
- Vai no APK normal (o JS vai dentro: `capacitor.config.ts:6`; `build-apk.yml` gera a cada merge). Nada nativo novo (plugin e permissões
  já existem). APK velho: tudo "como hoje" (não mostra rotinas nem dieta liberada; as séries seguem pelo PowerSync).
- `src/rotinas/lembretes.ts`: **plano puro** (rotinas + feitas + agora → lista de notificações) e **reconciliar** (cancela as pendentes da
  faixa que não estão no plano e agenda o resto). Faixa **40000–40299**: id = 40000 + posição da rotina (0–29, ordem de criação) × 10 +
  dia (0 = todo dia, `every: 'day'`; 1–7 = dia da semana, `every: 'week'`); `at` = a próxima vez que vale (pula hoje se já feita ou se a
  hora passou); `allowWhileIdle`; canal `rotinas-v1`; `actionTypeId` "ROTINA" com o botão "Feito" (`registerActionTypes` antes de
  agendar); `extra: { rotina_id }`. Roda ao abrir, ao voltar (appStateChange), depois de criar/mudar/apagar/marcar e quando o servidor
  devolve as feitas (o que foi marcado em outro aparelho).
- Permissões: `requestPermissions` no 1º lembrete ligado; `checkExactNotificationSetting` → folha "Alarmes e lembretes" com
  `changeExactNotificationSetting`. Ouvinte `localNotificationActionPerformed` próprio, filtrando `extra.rotina_id` (não mexe no das consultas).
- Site: verificação a cada 30 s com a página aberta (molde `useLembreteDoTreino.ts:52-65`), 1 aviso por rotina por dia (sessionStorage).

### 5.5 O que o servidor recusa
Aluno liberando a própria dieta ou mudando acesso (`sem_acesso`); profissional de outra conta (`sem_acesso`); chave/valor fora da lista;
App sem login; Dieta/Diário/Link sem nutricionista; séries sem Treino (`sem_modulo`) ou antes do 1º acesso (`sem_treino`); escrita da
dieta com ela travada (`dieta_travada`), fora de hoje/ontem, em refeição que não é de plano vivo dele, com alimento que ele não enxerga
ou acima dos limites; rotina de outro (`nao_encontrado`); profissional mudando rotina do aluno (`so_do_aluno`); 31ª rotina; lembrete sem
horário; marcar fora do dia da semana. Escrita direta nas tabelas novas: o RLS recusa (sem policy).

### 5.6 Logs e guardas
- Log em JSON pelo `_shared/log.ts` (a porta-pessoa já faz o catch final); **nunca o nome da rotina nem do alimento no log** (dado de saúde)
  — só código, ação, schema. A `treino-acessos` com `criarLog` + `log.excecao` no catch final.
- Listas: `logsDasFuncoesPrincipal.test.ts` (+ `acessos`, `aluno-dia` em FUNCOES e PESSOA), `logsDasFuncoesTreino.test.ts` (+ `treino-acessos`
  em PUBLICADAS e RESPOSTA_DO_CATCH_FINAL), a Guarda dos E2E (`e2e/hml17/_base.py` e `e2e/w26/prod.py`: as 3 gravam em toda ação, menos
  `ler`). Guarda própria `src/aluno-dia/semBancoDireto.test.ts`: nas pastas da W-A (as que existirem), nenhum `.from(`, `.rpc(` nem
  `.storage` — só as funções.

### 5.7 O que NÃO tocar
- **hml-20d (LINUX 1):** `supabase-principal/functions/financeiro/**`, `_shared/financeiro-leituras.ts` e `financeiro-gravar-regras.ts`,
  `src/financeiro/{ler,lancamentos,recibos,api,gravar}.ts`, `src/painel/financeiro/{dados,useFinanceiro,financeiroUtil,recibosUtil}.ts` e
  `telas.test.tsx`, `src/financeiro/{recibos,gravacoes}.test.ts`, `src/nutricao/semLeituraDireta.test.ts` (e o irmão `semGravacaoDireta.test.ts`),
  `e2e/hml20/**`. Pontos de encontro (só acréscimo, avisando no quadro): `docs/banco-permissoes.md`, `docs/e2e-rodadas.md`, a Guarda dos E2E.
- Também fora: `supabase-principal/functions/nutricao/**`, `_shared/{nutricao-*,leitura-lote}.ts`, `src/nutricao/{leitura,servidor}.ts`,
  `src/nutricao/app/{pacienteApp,useDieta}.ts` (só importar), `src/integrations/repeticao.ts`, `admin-semana-treinos` e `treino-leitura`,
  `paciente_marcar_refeicao`, `minha_situacao`, `minha_dieta`, `pagamentos-aluno`, o master e as pastas dos GIFs.

## 6. Partes = worktrees (1 parte = 1 worktree = 1 PR; um arquivo é de uma parte só — o comum vai para a 1ª que precisa)

| Parte | O que faz | Vem do esboço | Migration | Depende de | Código (min) |
|---|---|---|---|---|---|
| P1 Banco | as 3 migrations + reversas + E2E de SQL + a seção da W-A em `docs/banco-permissoes.md` | P2, P3, P5 (banco) | 3, a reservar no quadro | — | 270 |
| P2 Funções e contratos | `acessos`, `aluno-dia`, `treino-acessos`, os clientes e as regras puras do front, as listas e a Guarda, E2E de servidor | P2, P3, P5 (funções) | — | P1 no staging | 360 |
| P3 Painel: aba Acessos | a aba, mover os cards, tirar o cadeado, os textos | P1 | — | P2 publicada no staging | 220 |
| P4 App: rotinas e lembretes | card do Início, página, item do Perfil, lembretes (APK e site) | P4 | — | P2 | 260 |
| P5 App: dieta liberada | a Dieta liberada + a seção de rotinas na Dieta | P6 | — | P2, P4 | 320 |
| P6 Painel: rotinas e dia a dia | card Rotinas no Resumo, "Dia a dia" na Dieta da ficha, a entrada em `docs/e2e-rodadas.md` | P7 | — | P2, P4 | 230 |

**Total ≈ 1.660 min (~27h40) só de código** — a esteira de cada parte (local → staging → produção, E2E e prints) vem por cima. Ordem:
P1 → P2 → P3 → P4 → P5 → P6. P1 e P2 vão para a produção escuras (nenhuma tela usa). Entre P3 e P5, liberar a Dieta grava mas ainda não
muda nada no app (risco 8.9).

**P1 — Banco.** Arquivos: `supabase-principal/migrations/<a reservar>_wa{1_acessos,2_rotinas,3_dieta_livre}.sql`, as 3 reversas,
`e2e/wa/_base.py` (importa a base da hml-17: contas de TESTE `w5p-nutri`, `w5p-personal`, `w5p-aluna`, `w7b-sozinho`, `w13-dono`, `w27-master`),
`e2e/wa/sql_wa.py`, `docs/banco-permissoes.md` (seção nova no fim). Pronto: `checar-definer` limpo; no staging, `sql_wa.py` verde (cada RPC por
papel; escrita direta nas tabelas = 42501; aluno não libera a própria dieta; outra conta não vê rotina; exportar/excluir com as tabelas);
reversa rodada e reaplicada no staging; produção com backup. Prints: nenhum (sem tela) — vale o relatório com as contagens.

**P2 — Funções e contratos.** Arquivos: `supabase-principal/functions/acessos/index.ts`, `supabase-principal/functions/aluno-dia/{index,rotinas,dieta,profissional,comum}.ts`,
`supabase-principal/functions/_shared/{acessos-regras,aluno-dia-regras}.ts`, `supabase/functions/treino-acessos/index.ts`,
`supabase/functions/_shared/treino-acessos-regras.ts`, `src/acessos/{api,tipos}.ts`, `src/aluno-dia/{api,tipos,regras}.ts` (+ testes),
`src/aluno-dia/semBancoDireto.test.ts` (já com as pastas das partes seguintes), `src/lib/logsDasFuncoes{Principal,Treino}.test.ts`,
`e2e/hml17/_base.py` e `e2e/w26/prod.py` (só as 3 funções; avisar a LINUX 1), `e2e/wa/api.py`. Pronto: vitest verde; publicadas no staging;
`api.py` P/N verde no staging e `--so-leitura` na produção; 1 erro provocado aparece no log só com o código. Prints: nenhum.

**P3 — Painel: aba Acessos.** Arquivos: `src/painel/aluno/catalogoAbas.ts` (+ aba; ORDEM_RESUMO sem `CardAcessoAluno` e com `CardRotinas` na 7ª
posição) + teste, `abas/Acessos.tsx` (+ teste), `src/painel/aluno/acessos/*`, `resumo/CardAcessoAluno.tsx` (+ teste) → `resumo/acesso/`,
`resumo/CardAjustesAluno.tsx` + `cardsW14.test.tsx`, `dados/regras.ts` (+ testes que acusarem), `Cabecalho.tsx`, `AlunoLayout.tsx`,
`abas/Treino.tsx`, `src/treino/editor/EditorTreino.tsx`, `src/painel/gates/FaixaMensagensDesligadas.tsx`, os E2E que procuram o que mudou
(`e2e/w08b/telas.py`, `e2e/w14/{telas,prod}.py`, `e2e/w15/telas.py`), `e2e/wa/telas_acessos.py`. Pronto: as 4 linhas + séries + login por papel
(personal, nutri, dono sem papel, master) no site e na loja; nutri trava as séries e o app mostra "O número de séries é definido pelo seu
profissional"; `semLeituraDireta` intocado e verde. Prints: `a_acessos_personal`, `a_acessos_nutri`, `a_acessos_sem_login`, `a_acessos_celular`,
`a_confirmar_bloqueio`, `a_resumo_depois`, `a_editor_sem_cadeado`.

**P4 — App: rotinas e lembretes.** Arquivos: `src/rotinas/*` (+ `lembretes.test.ts` com o plano puro), `src/app-aluno/inicio/CardRotinasHoje.tsx`,
`src/app-aluno/abas/Inicio.tsx` (+ teste), `src/app-aluno/perfil/Rotinas.tsx`, `src/app-aluno/abas/Perfil.tsx` (+ teste),
`src/ui/avisos/LembreteDasRotinas.tsx` (+ teste), `e2e/wa/telas_rotinas.py`. Pronto: criar/mudar/apagar/marcar no site e na loja; a do
profissional (semeada pelo `api.py`) com o selo e apagável; no APK (G7) o lembrete toca com o app fechado, "Feito" marca no servidor, marcar
antes não toca, desmarcar volta, reiniciar o aparelho mantém. Prints: `r_inicio`, `r_inicio_vazio`, `r_pagina`, `r_nova`, `r_site_aviso`,
`r_apk_notificacao`, `r_apk_feito`.

**P5 — App: dieta liberada.** Arquivos: `src/app-aluno/abas/Dieta.tsx` (+ teste), `src/nutricao/app/ui/SheetRefeicao.tsx` (os botões, só liberada),
`src/dieta-livre/*` (+ testes), `e2e/wa/telas_dieta.py`. Pronto: travada = prints iguais aos de hoje; liberada: pôr, tirar, voltar, extra,
alimento e receita, anel certo; travar no meio → volta; rotinas na Dieta (nutri e pratos prontos); APK novo e velho. Prints: `d_travada`,
`d_liberada`, `d_adicionar`, `d_tirar`, `d_extra`, `d_receita`, `d_totais`, `d_rotinas`, `d_voltou_travada`.

**P6 — Painel: rotinas e dia a dia.** Arquivos: `src/painel/aluno/resumo/CardRotinas.tsx`, `src/painel/aluno/rotinas/*`, `src/painel/aluno/diaADia/*`
(+ testes), `src/painel/aluno/abas/Dieta.tsx`, `src/nutricao/editor/lib/acesso.ts` (+ "Dia a dia" nas seções, sem leitura direta),
`docs/e2e-rodadas.md` (a entrada da W-A), `e2e/wa/telas_painel.py`. Pronto: criar rotina pelo painel → sino do aluno → aparece no app; o
aluno apaga → "apagada pelo aluno em …"; o dia a dia mostra o que ele pôs/tirou e as rotinas; personal vê (padrão 13). Prints:
`p_resumo_rotinas`, `p_nova_rotina`, `p_apagada_pelo_aluno`, `p_historico`, `p_dia_a_dia`, `p_dia_a_dia_personal`, `p_sino_aluno`.

## 7. Testes e prova

- **Vitest (local e no `checar-pr`):** regras dos 3 `_shared` (forma de cada ação, níveis por chave, horário, dias, limites, corpo com
  dono/user_id ignorado); `src/aluno-dia/regras.test.ts` (rotinas de um dia; dia aplicado e totais; virada do dia em SP);
  `src/rotinas/lembretes.test.ts` (ids na faixa, `every`, pula hoje se feita/passou, semana); clientes (código → frase, `sem_internet` sem
  chamar, 1 chamada só); telas (Acessos por módulo e por papel, sem login, confirmação, erro da linha de séries isolado; card do Início;
  página; Dieta travada × liberada; card Rotinas; Dia a dia); listas e guardas (`logsDasFuncoes*`, `semBancoDireto`, `semDialogoNativo`,
  `larguraCelular`, `catalogoAbas` com 7 abas). No CI: lint, tipos, `checar-definer`, `checar-funcoes`, build + `checar-chunks`.
- **E2E de servidor** (staging completo, contas de TESTE, limpeza da própria massa; produção só `--so-leitura`): `sql_wa.py` (P1) e `api.py`
  (P2) com os positivos por papel nos 2 bancos e os negativos da 5.5 (token do Treino na `treino-acessos` → 401; aluno na `acessos` → 403;
  dieta travada → 409; rotina de outro → 404; prof mudando rotina do aluno → 409; antes do 1º acesso → 404).
- **E2E de tela** (Playwright `--canal msedge`, site e loja): `telas_acessos.py`, `telas_rotinas.py` (relógio da página adiantado para o
  aviso do site), `telas_dieta.py`, `telas_painel.py`. O `rede` da hml-20 segue verde (as leituras novas contam como leitura pela Guarda).
- **APK** (G7, o APK do CI): o roteiro da P4 e da P5 + o APK velho (v3.109) seguindo igual (abre, marca refeição, séries com a trava).
- **Banco do Treino = o projeto da produção:** E2E pesado no staging um por vez, em lotes pequenos, conferindo o `/health` dos 2 projetos
  antes (incidente de 10/10). Cada print conferido (Read) antes de ir para o Weslley.

## 8. Riscos e fora do escopo

1. **Alarme exato:** no Android 14+ "Alarmes e lembretes" não vem dado (targetSdk 36); sem ele o lembrete pode atrasar minutos. A tela
   pede; a economia de bateria (Xiaomi, Samsung) pode matar o alarme — dica na página.
2. **`every: 'week'`** não tem prova no NutriTrack (lá é `every: 'day'`): o teste do APK confere 2 dias seguidos e um dia da semana; se
   falhar, cai para notificações avulsas dos próximos 7 dias replanejadas a cada abertura.
3. **"Feito antes não toca" vale no aparelho que marcou**; marcado no site com o celular fechado, o celular toca naquele dia e se corrige
   ao abrir. Sem iPhone nativo: iPhone e site só com a página aberta (P10).
4. **Fuso:** o dia é o de São Paulo e o alarme usa o relógio do celular; aluno fora do Brasil vira o dia na hora errada.
5. **Séries por login:** `series_travadas` é 1 por aluno no Treino — vale para as 2 contas de quem tem 2 personais (como hoje). Mudança
   pelo cadeado do APK velho do profissional não entra no histórico.
6. **Caminho antigo das 3 chaves:** o APK velho do profissional ainda muda pelos cards de antes (entra no histórico pelo gatilho).
7. **Guarda da hml-20:** se a P2 não registrar as funções na Guarda, o `rede` da LINUX 1 acusa "gravação ao abrir" no Início depois da P4.
8. **Funções frias:** 3 funções novas = mais 1 ida no Início e na aba; cada card tem o próprio esqueleto e não segura a tela.
9. **Janela P3 → P5:** liberar a Dieta já grava, mas o app só muda na P5 — fazer as duas em sequência.
10. **Dado de saúde:** rotinas de remédio e os alimentos do aluno são dados sensíveis; o texto do lembrete leva o nome (é o aparelho dele,
    como no NutriTrack); a Política nova ainda não cita (pergunta Q2).

**Fora do escopo:** dieta liberada no app sem profissional; o aluno mexer no plano da nutri (P5); alimentos dele na base da nutri (P6);
lembrete por WhatsApp, e-mail ou push do servidor (P10); app de iPhone; "lembrar em 10 min"; suplementos indicados virando rotina;
vários horários numa rotina; restaurar rotina apagada; levar o login e o WhatsApp para o servidor (H-43, hml-21).

## 9. Perguntas em aberto (novas, achadas ao escrever — uma por vez, a recomendada primeiro)

- **Q1 — O personal vê o "Dia a dia" da dieta?** Hoje ele vê só o plano e a adesão. 1) sim, embaixo da adesão, só para ler (**recomendada**:
  a P7 disse "o profissional" e, pela P4, ele pode liberar a Dieta) · 2) não, só quem vê a dieta inteira (nutri, dono, master).
- **Q2 — A Política de Privacidade nova (em revisão, só no staging) precisa citar as rotinas (remédios, suplementos) e os alimentos do
  aluno?** 1) sim: acrescento as 2 linhas no texto em revisão numa parte pequena depois da P6, e vai ao advogado junto com o resto
  (**recomendada**; a produção não muda nesta W) · 2) deixo anotado para a revisão do advogado, sem mexer agora.

## 10. Self-review

- **Conferido no `ed0d72e`:** todos os arquivo:linha da seção 3 (lidos agora, não copiados do mapa); as regras de quem muda (SQL das
  w02/w08b/w13/w14 e `useTreinoDoAlunoPainel`); a guarda da hml-20 (áreas, a lista exata de RPCs e o `minimo` 100 com 104 hoje); a Guarda dos
  E2E e as listas de funções; os ids de notificação em uso; o NutriTrack (`habitReminders.ts` pelo `gh api`) e o Nativo OS (`AcessosDoMembro.tsx`,
  `lib/acessos.ts`, a rota `PUT`, no `origin/main` b4324fe, sem checkout); a lista da hml-20d (`hml/hml20/spec.md` §2.5.4, a lista de arquivos e
  §6.4); os textos da Política; o proxy da API (transparente — função nova passa sem cadastro).
- **Cada arquivo é de uma parte só:** conferido na seção 6 (docs: `banco-permissoes` só na P1 e `e2e-rodadas` só na P6; a Guarda e as
  listas de funções só na P2; `catalogoAbas.ts` só na P3, já com o lugar do `CardRotinas`).
- **Incerto:** (a) `every: 'week'` do plugin (risco 2); (b) os nomes das RPCs e das tabelas podem mudar no spec-review (nenhum colide com o
  que existe — conferido); (c) os limites (30 rotinas, 100 itens/dia, 300 alimentos) são palpite meu; (d) as estimativas não têm medida de
  referência para a parte de lembretes no APK; (e) se a LINUX 1 mexer na Guarda dos E2E na hml-20d, a P2 combina a ordem pelo quadro.
