# W-A P3 — App: rotinas e lembretes (o card do Início, a página `/perfil/rotinas`, o item do Perfil, os lembretes no APK e no site, a linha do resumo da exclusão) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** todo aluno (inclusive o do app sem profissional — P9) cria, muda, apaga e marca as próprias rotinas (creatina, remédio, hábito…) no
app — o card **"Rotinas de hoje"** no Início (logo depois da linha Dieta/Metas) e a página Perfil › **"Rotinas e lembretes"** (`/perfil/rotinas`)
— e recebe o lembrete na hora: no APK, notificações locais AVULSAS (as ocorrências dos próximos 7 dias, faixa 40000–40299, botão **"Feito"**
que marca no servidor, "marcou antes não toca", "desmarcou volta", "Sair" esvazia a faixa); no site, um aviso com a página aberta. A rotina
criada pelo profissional aparece com o selo "do seu profissional" e o aluno muda e apaga (P8b). O resumo da exclusão (app e painel) ganha a
linha "Rotinas, alimentos e receitas que você criou (N)". **Nenhuma migration, nenhuma função** (a P2 publicou a `aluno-dia`).

**Architecture:** o front fala só com a função `aluno-dia` da P2 (`src/aluno-dia/api.ts`). Uma consulta (`["rotinas-aluno", uid, hojeSP]`,
`{ acao: "ler", q: "rotinas", de: ontem, ate: hoje }`) serve o card, a página e o aviso global `src/ui/avisos/LembreteDasRotinas.tsx`
(registro por convenção). No APK, o aviso global reconcilia os lembretes do aparelho (`src/rotinas/aparelho.ts`: o plano PURO
`src/rotinas/lembretes.ts` × o `getPending` do plugin → cancela/agenda só a diferença) e atende o toque/"Feito" pelo **ouvinte ÚNICO**
`src/lib/acoesDeNotificacao.ts` (o mesmo que a consulta nova passa a usar — com o app fechado, o Capacitor entrega o toque só ao 1º
ouvinte). No site, confere a hora a cada 30 s. O "Sair" (e a troca de conta, e a exclusão) esvazia a faixa quando a casca desmonta os avisos
(`App.tsx: usuario && <AvisosGlobais />`) e o login guardado no aparelho já não é o de quem estava montado — **sem chamar o Auth** (a guarda
do navegador da hml-21a). Telas no visual premium; a folha da rotina nasce com os 2 modos (aluno e profissional — a P6 só importa).

**Tech Stack:** React 18 + TypeScript (`strict: false`) + React Query 5 + Vite; Capacitor 8.5.3 (`@capacitor/local-notifications` 8.0.2,
`@capacitor/app`); Vitest (`--maxWorkers=2`); Python 3 + Playwright 1.63 (Edge, `--canal msedge`; o `clock` para o relógio adiantado); adb do
Android SDK do notebook (`~/android-sdk`, servidor na porta **5038**); JDK 21 (`~/jdk21`) + Gradle (o APK de teste); o emulador do notebook
(AVD `physiq-video`, Android 15, KVM).

**Entradas:** a spec `docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md` (§2.2-14/15, §4.3, §4.6, §4.7, §5.3, §5.4, §5.6, §5.7,
§6 "P3", §7, §8 riscos 1–3 e 10, §9 Q3/Q4) — a fonte; a revisão `~/projetos/physiqcalc-scratch/w-a/spec-review-w-a.md` (C3, I6, MENOR 9, 14,
19, 23); o mestre `docs/superpowers/plans/2026-10-12-w-a-plano-mestre.md` (§0, §3 › P3, §4, §6, §8, §9); os planos da P1 e da P2 (o molde); o
contrato da P2 (`src/aluno-dia/{api,tipos,regras}.ts`, `supabase-principal/functions/aluno-dia/*`,
`supabase-principal/migrations/20261012210000_wa2_rotinas.sql`); a hml-21 (`~/projetos/physiqcalc-scratch/hml/hml21/{spec,para_linux3}.md`) e a
guarda nova `src/integrations/semBancoNoNavegador.test.ts` (na `main` desde a v3.112); o plugin 8.0.2 e o Capacitor 8.5.3 (o Java no
`node_modules`); as memórias do G7 (`referencia-moto-g7-play-lineageos-servidor-casa`, `setup-carteiro-remoto-telegram-moto-g7`,
`feedback-nao-desligar-acesso-que-ele-ligou`, `Acesso ADB Key Celular`); o quadro `~/projetos/physiqcalc-scratch/quem-toca-o-que.md`.

**Modo:** até o fim (o G0 do mestre vale). Sem gates humanos; validação com evidência (placares, os ids no aparelho, o banco SÓ LEITURA) e
prints conferidos (Read em cada um ANTES de mandar). A pergunta nova (Q5) vai uma vez, pelo coordenador; até a resposta, vale a recomendada.

**Conferido ao escrever este plano (13/10/2026 ~01:45–03:30; SÓ LEITURA + um ENSAIO fora do repo):**
- **A base:** `origin/main` = `origin/staging` = `d357719` (v3.112: a hml-21a, PR #196, squash `88f8bec`). A P2 na worktree
  `~/projetos/physiqcalc-wa-p2` em `1d83367` (rebaseada nessa `main`, com o `src/acessos/api.ts` no `SESSAO_ANTES_DA_FUNCAO`), ainda não
  publicada nem na `main`. A P3 começa da `main` que TERÁ a P2 — a Task 0 confere o drift (`drift.sh`).
- **O contrato da P2, usado como está:** `lerMinhasRotinas(de, ate)` → `{ ok, hoje, rotinas[], feitas[] }` (`minhas_rotinas`: vivas pela hora,
  as feitas do intervalo ≤ 31 dias), `salvarRotina(id|null, dados)` → `{ ok, rotina }` (criar só quem tem matrícula — o `meu_paciente_id`; o
  limite de 30 vivas → `limite`), `arquivarRotina(id)`, `marcarRotina(id, dia, feita)` (hoje ou ontem de SP, no dia da semana dela),
  `profSalvarRotina(aluno, id|null, dados)`, `profArquivarRotina(aluno, id)`, `ErroAlunoDia` (a frase fixa do código), `hojeSP`, `ontemSP`,
  `diaDaSemanaISO`, `rotinasDoDia` (as do dia, vivas, pela hora, com o ✓). O `apaga.principal.rotinas_e_dieta` da `excluir_dados_aluno` (e
  `aluno.apaga.rotinas_e_dieta` da `excluir_conta_profissional`) = rotinas + alimentos + receitas + extras + itens do dia (a wa3, `wa_dados_do_aluno`).
- **A guarda nova da hml-21a** (`semBancoNoNavegador.test.ts:37-46, 141-147`): `.auth.<método>(` fora do LOGIN é achado e arquivo novo com
  achado falha → o `principal.auth.onAuthStateChange` da spec §5.4 não pode ir para `src/rotinas/` (defeito 1).
- **O plugin 8.0.2 e o Capacitor 8.5.3 (Java):** com `schedule.at` o `every` é ignorado (`LocalNotificationManager.java:336-349`); a
  notificação disparada sai do armazenamento (`TimedNotificationPublisher.java:50-51`) — o `getPending` lista só as futuras; o `schedule` do
  mesmo id cancela o alarme e troca (`:147-149`); um `at` no passado não arma nada (`:338-341`); o "Feito" e o toque abrem o app (`PendingIntent.getActivity`, `:247-295`); ao reiniciar, o
  `LocalNotificationRestoreReceiver` (não exportado) reagenda do armazenamento `NOTIFICATION_STORE` e dispara em 15 s o que venceu; sem
  "Alarmes e lembretes", `setAndAllowWhileIdle` (pode atrasar; `:374-397`). **O toque com o app FECHADO fica guardado e vai só ao 1º ouvinte que
  se registrar** (`BridgeActivity.java:51` → `handleOnNewIntent` → `notifyListeners(…, true)`; `Plugin.java:631-643, 712-728`) — e a consulta
  nova (`AvisoConsultaNova.tsx:92`) já tem um ouvinte próprio (defeito 2).
- **O APK do CI é o de PRODUÇÃO** (`build-apk.yml:98` e `build-apk-check.yml:124` — `VITE_DB_SCHEMA: public`); o notebook tem JDK 21, o
  SDK (build-tools 35, platform 36), o Gradle 8.14.3 em cache, o emulador com KVM e o AVD `physiq-video` (Android 15) — a casa já montou AAB e
  rodou o APK ali (W4 da loja, W5 do vídeo) (defeito 3).
- **O G7** (memórias): servidor 24 h da sala (LineageOS 22.2 = Android 15, 2 GB, sem Google), o **carteiro da ponte do Telegram** (o único leitor
  do bot), o WhatsApp do PhysiqNutri e a reserva do WOL rodam no Termux; a tela fica acesa e preta (o bug do Wi-Fi com a tela apagada); a
  **Depuração por Wi-Fi fica SEMPRE ligada** e, se cair (reinício), só ele religa na tela; adb do notebook = 2º servidor na porta 5038 com a
  chave do cofre ("Pessoal — Contas" › "ADB Key Celular") + `adb mdns services` (defeito 4).
- **O ENSAIO** (13/10 02:00–03:15, FORA do repo: uma cópia da P2 `1d83367` em `~/projetos/physiqcalc-scratch/w-a/p3/ensaio` com o
  `node_modules` da P2 por link; nada no repo, no banco, na borda nem no registro oficial): os blocos deste plano como estão → `tsc` do app
  **0 erro** · `eslint` dos arquivos da P3 **0** · Vitest dos 12 arquivos da P3 e dos que ela edita **130/130** (com as 4 guardas: 16 arquivos,
  177) · o Vitest do REPO INTEIRO **423 arquivos, 6.005 testes, 0 falha** · `vite build` + `checar-chunks` **ok** (as 3 telas novas sem pesado
  no fecho) · `telas_rotinas.py --seco` **35/35** · os 2 E2E compilam · o cliente CDP mínimo do `apk_rotinas.py` contra um Edge local **6/6**
  (aperto de mão, máscara, quadro > 64 KB, promessa, exceção, acento) · os patches por task reproduzem os arquivos do ensaio byte a byte ·
  `drift.sh` contra a worktree da P2 **rc=0**. O ensaio achou e o plano já corrige: (1) o erro do `Campo` fica DENTRO do `<label>` — o
  `getByLabelText("Nome")` exato falha depois do erro (regex `^Nome`); (2) o `retry: 1` na consulta segurava o erro 1 s nos testes (a nova
  tentativa fica a do app, `OPCOES_CONSULTAS`); (3) os testes dependiam do fuso da máquina (o "agora" na hora local; o CI roda em UTC); (4) o
  `global` depois do uso no `apk_rotinas.py` (só o `compile` acusa; o `ast.parse` passava); (5) 2 erros de tipo nos falsos do `schedule`.
  **Não rodou (de propósito):** os E2E contra o staging e a produção, o APK, o emulador e o G7.

---

## Decisões técnicas minhas (P3 — não são do Weslley; aparecem na foto)

1. **"Sair" sem `.auth.`:** o aviso global (`LembreteDasRotinas`) é desmontado pela casca quando o login sai (`App.tsx:73`); no desmontar, se o
   login guardado no aparelho (`localStorage["physiq-principal-auth"]`, lido sem o Auth) não é mais o de quem estava montado, a faixa
   40000–40299 é esvaziada (as pendentes e as da bandeja). Cobre "Sair", "trocar de conta" e "excluir a conta" (o `SheetExcluir` chama o
   `sair()`); remontar com o mesmo login (a porta do aceite, o limite de erro) não limpa. Ainda: ao entrar, a reconciliação cancela o que for de
   outro login; ação de notificação de outro login é ignorada.
2. **Ouvinte único do toque** (`src/lib/acoesDeNotificacao.ts`): 1 ouvinte nativo; cada interessado diz se a ação é dele; a que ninguém quis
   fica guardada 2 min para quem montar depois. A consulta nova (`AvisoConsultaNova.tsx`) passa a ouvir por ele (1 trecho).
3. **"As 7 ocorrências":** a janela de 7 dias (hoje → hoje+6), uma por dia da semana marcado (o id = 40000 + posição × 10 + dia da semana);
   hoje entra só se a hora ainda vem e não foi feita → **≤ 7** por rotina (7 na de todo dia com a hora de hoje por vir).
4. **Reconciliar = a diferença:** o `getPending` × o plano; igual (título, corpo, rotina, dono, dia, hora) fica; mudou → o mesmo id troca;
   fora do plano → cancela, menos a de hoje que **já venceu e ainda está pendente** (o alarme inexato atrasando) e continua valendo. Uma
   reconciliação por vez (fila). Sem a permissão de notificação: só cancela.
5. **Canal `rotinas-v1`** com `visibility: 0` (privado), importância 4; `actionTypeId "ROTINA"` com "Feito" (`registerActionTypes` antes de
   agendar); `schedule: { at, allowWhileIdle: true }`; `extra: { rotina_id, dono, dia, hora }` (sem nome).
6. **O "Feito" marca o dia daquela ocorrência** (`extra.dia`; ontem vale — o banco aceita hoje/ontem); mais velho → "Esse lembrete já passou:
   marque a rotina na lista."; o toque no corpo também marca (spec §2.2-14); os 2 abrem a página (`/perfil/rotinas`) com "Creatina feita ·
   Desfazer"; sem internet → "Sem internet — marque quando ela voltar." (sem fila no aparelho).
7. **Uma consulta só** (`["rotinas-aluno", uid, hojeSP]`: ontem..hoje; `staleTime` 60 s; sem rede espera); o ✓ é otimista (volta se a função
   recusar) e relê no fim; o aviso global reconcilia a cada dado novo e ao voltar para a frente (`appStateChange`).
8. **Site:** confere a cada 30 s com a página aberta (o molde do lembrete do treino); avisa da hora até 10 min depois (o navegador segura o
   `setInterval` da aba de fundo); 1 vez por rotina por dia nesta aba (`sessionStorage`); toast "Hora da rotina" com o nome e "Marcar como
   feita" + a notificação do navegador SÓ se já permitida (o site não pede).
9. **Q3 e Q4 = as recomendadas, 1 constante cada** (`src/rotinas/textos.ts`): `REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA = true` (a resposta "sim" =
   `false`) e `LINHA_PROFISSIONAIS_VEEM = "Seus profissionais veem as suas rotinas."` (a resposta "não" = `null`). A linha da Q4 aparece para
   todo aluno (também o do app sem profissional: um profissional que vier depois vê as dele — padrão 9).
10. **Quem tem rotinas = o login com matrícula** (`situacao.matriculas.length > 0` — a regra do `meu_paciente_id` da `rotina_salvar`).
11. **O card no Início** entra na lista `LINHAS` depois de `["CardDietaHoje", "CardMetasHoje"]`, aparece para todo aluno; até 4 (primeiro as
    que faltam, pela hora; depois as feitas) + "+N"; vazio → "Crie a sua 1ª rotina (creatina, remédio, água…)" + "Criar rotina"
    (`/perfil/rotinas?nova=1` abre a folha). A lista é um componente (`src/rotinas/ui/RotinasDeHoje.tsx`) que a P5 põe na Dieta.
12. **A página:** todas as vivas pela hora, o ✓ só nas de hoje, os dias, o sino nas com lembrete, o selo; avisos: notificações bloqueadas
    (APK), "Alarmes e lembretes" desligado com **Ligar** (`changeExactNotificationSetting`), a dica da bateria (APK), "No site (e no iPhone), o
    lembrete aparece quando o Physiq está aberto", o limite de 30 e a linha da Q4. O 1º lembrete ligado pede a permissão (APK).
13. **A folha** (`src/rotinas/ui/FolhaRotina.tsx`): nome (1–60), detalhe (≤ 120), tipo (Suplemento · Remédio · Hábito · Outro), horário
    (opcional), dias (Seg…Dom + "Todos os dias · Seg a Sex · Fim de semana"), lembrete (só com horário; tirar o horário desliga). Manda todos
    os campos (o banco grava no histórico só o que mudou). Apagar com o `useConfirmar` (a do profissional também — P8b). Modo profissional =
    `profSalvarRotina`/`profArquivarRotina(aluno, …)`.
14. **O APK de teste** (Task 13): o build do app com o `.env.local` de staging, a depuração da WebView ligada **só na cópia gerada** do
    `capacitor.config.json` (ignorada pelo git), `assembleDebug` (a chave de debug do notebook). A prova no aparelho por um **cliente CDP mínimo**
    (sem dependência; a sessão de teste e o `getPending` pelo DevTools da WebView), o armazenamento do plugin pelo `run-as` (o que ele reagenda ao
    reiniciar), a bandeja pelo `dumpsys notification` e o "Feito" pelo `uiautomator`.
15. **O "reiniciar mantém" no EMULADOR** (Q5, recomendada): o G7 não reinicia.
16. **A conta da prova no aparelho = `w7b-sozinho`** (o aluno do app sem profissional — P9): o "Sair" do app é GLOBAL nos 2 bancos; hora
    combinada com a LINUX 1 (a sessão guardada dela cai). Se ela estiver numa trava do app (plano, pagamento), `--conta w5p-aluna` com o mesmo
    combinado.
17. **Produção:** smoke SÓ LEITURA (o `w07/smoke_prod.py telas` + `telas_rotinas.py --base prod`, a Guarda no navegador); as rodadas de produção
    da P3 vão no PR da P4 (a regra da casa).

## Defeitos e ambiguidades da spec (anotados; nenhuma decisão dela mudou)

1. **IMPORTANTE — §5.4 "o `src/rotinas/` escuta o `SIGNED_OUT` do principal (`principal.auth.onAuthStateChange`…)":** desde a v3.112 a guarda
   `src/integrations/semBancoNoNavegador.test.ts` (hml-21a; só a hml-21 edita) acusa `.auth.<método>(` fora do LOGIN e arquivo novo com
   achado falha — o CI da P3 ficaria vermelho. Saída sem mexer na guarda: decisão 1 (mesma cobertura).
2. **IMPORTANTE — §5.4 "Ouvinte `localNotificationActionPerformed` próprio… (não mexe no das consultas)":** com o app FECHADO o Capacitor
   guarda o toque e entrega só ao 1º ouvinte (Plugin.java); os avisos globais carregam sob demanda em qualquer ordem → o da consulta nova
   engoliria o "Feito" (ou o contrário). Saída: decisão 2 — a P3 toca 1 trecho do `src/ui/avisos/AvisoConsultaNova.tsx` (fora da lista da §6).
3. **IMPORTANTE — §6/§7 "APK (G7, o APK do CI)":** o do CI é o de PRODUÇÃO (`VITE_DB_SCHEMA: public`); com ele a prova gravaria rotinas no `public`
   (o mestre §6-9: nenhum E2E grava na produção). Saída: o APK de teste de staging montado no notebook (decisão 14); o do CI fica para o smoke.
4. **IMPORTANTE — "reiniciar o aparelho mantém" (§6 P3) no G7:** reiniciar derruba o carteiro da ponte (os testes NÃO podem pará-lo) e a
   Depuração por Wi-Fi pode não voltar (só ele religa na tela). Saída: o emulador do notebook (Q5).
5. **IMPORTANTE (coordenação) — o "Sair" do app é GLOBAL** (`sessao.tsx:475`, `signOut()` sem escopo): a prova "Sair esvazia" derruba as sessões
   da conta de teste em todo lugar, inclusive as guardadas pela LINUX 1 (a regra da casa "logout local" é dos scripts, não do botão). Saída:
   decisão 16.
6. **MENOR — "as 7 ocorrências de cada rotina":** com o id por dia da semana, 7 só na rotina de TODO dia com a hora de hoje ainda por vir;
   depois de tocar (ou marcada) hoje, 6; Seg a Sex, 5. A prova usa rotinas de todo dia para daqui a 4–5 min.
7. **MENOR — `src/app-aluno/abas/abasW12.test.ts:31-34`** lista os 5 cards do Início (igualdade exata): o card novo o quebra → a P3 o edita
   (fora da lista da §6).
8. **MENOR — o `src/app-aluno/abas/Inicio.test.tsx`** precisa do falso da `@/aluno-dia/api` (o card lê) — já está na lista ("+ teste").
9. **INFO — §7 "o APK velho (v3.109) seguindo igual":** a P3 não muda servidor; nada a provar aqui (é da P5).
10. **INFO — o "Feito" sempre abre o app** (o plugin: `PendingIntent.getActivity`); marcar sem abrir exigiria código nativo ("nada nativo novo").
11. **INFO — staging com a porta do aceite pendente (hml-12):** os avisos globais só montam sem pendência → nesse estado, nem reconciliação nem
    limpeza (só o build de staging até a virada; ao aceitar, volta).

## Pontos de encontro com a hml-21 (LINUX 1: 21b → 21d → (P4 da W-A) → 21c → 21e) — e o que combinar ANTES

| # | Arquivo / assunto | P3 | hml-21 | Combinar |
|---|---|---|---|---|
| 1 | `src/integrations/semBancoNoNavegador.test.ts` (só a hml-21 edita) | NÃO edita: os arquivos novos com 0 achado (provado no ensaio; o "Sair" sem `.auth.`) | 21b/21d/21c tiram da `BASE`; 21e `BASE = {}` | só avisar (nenhuma linha pedida) |
| 2 | `src/ui/avisos/AvisoConsultaNova.tsx` (W20) | 1 trecho: o ouvinte do toque pelo `src/lib/acoesDeNotificacao.ts` | em nenhuma sub-W (a 21a mudou o `pecas/api.ts` que ele importa, mesma assinatura) | **avisar ANTES** (fora da §6) |
| 3 | `src/app-aluno/abas/{Inicio,Perfil}.tsx`, `perfil/pecas/SheetExcluir.tsx`, `painel/configuracoes/excluirConta/regras.ts` | acréscimo | não toca (`para_linux3.md` itens 6–8, 11; a 21c muda só o `excluirConta/api.ts`) | sem ordem |
| 4 | `src/app-aluno/abas/{Inicio,Perfil}.test.tsx`, `abasW12.test.ts`, `excluirConta/regras.test.ts` | acréscimo | não toca | sem ordem |
| 5 | a rede e o tempo do Início (`e2e/hml21/{rede,telas}.py`) | +1 `aluno-dia { acao: "ler", q: "rotinas" }` ao abrir o app (o aviso global; o card usa a mesma) e o card novo | o `rede.py` conta como "fora" (não é falha); o TEMPO do Início (a marca é o card da consulta) pode mexer uns décimos | **avisar:** a linha de base da próxima sub-W já com a P3 no staging |
| 6 | a Guarda dos E2E (`hml17/_base.py`, `w26/prod.py`, `guarda_teste.py`) | não toca (a P2 registrou a `aluno-dia`: o `ler` lê) | a 21d põe a `treinos` | nada |
| 7 | contas de TESTE | telas: `w5p-aluna` + `w5p-personal` (massa marcada, limpa); APK: `w7b-sozinho`, que termina com o **Sair GLOBAL** | 21b/21d/21c usam a `w5p-aluna`/`w5p-personal`; a 21d (treinos prontos) provavelmente a `w7b-sozinho`, com sessão guardada | **combinar a HORA do Sair** |
| 8 | 🔒 BANCO do staging | T12 (telas local), T13 (APK no emulador), T14 (staging), T15 (G7) | a 21b aplica `20261013100000_hml21b_*` no staging | janelas; nenhuma migration com E2E da outra |
| 9 | 🔒 git | T14 (push ff no `staging`), T17 (merge, release, realinhar com as 3 condições) | os PRs das sub-W | 1 PR por vez |
| 10 | a máquina (fila do pesado; CPU e RAM do notebook) | o Gradle do APK e o emulador (~20 min) | os E2E pesados | a janela do emulador |
| 11 | `docs/e2e-rodadas.md` | as linhas no topo | as delas | quem entra depois rebaseia |

## Pergunta nova (uma vez, pelo coordenador; até a resposta vale a recomendada)

- **Q5 — A prova "reiniciar o aparelho mantém os lembretes":** reiniciar o G7 derruba o carteiro da ponte por ~2–3 min (o Telegram fica sem
  leitor) e a Depuração por Wi-Fi pode não voltar sozinha (só você religa, na tela). **1) (recomendada)** provar no emulador do notebook
  (Android 15, o mesmo APK de staging): reinicia sem abrir o app e o lembrete toca na hora; no G7 fica todo o resto · 2) reiniciar o G7 com
  você em casa, num horário combinado · 3) não provar (o plugin reagenda sozinho — lido no código).
- Q3 e Q4 continuam sem resposta: valem as recomendadas (decisão 9; trocar = 1 linha).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/acoesDeNotificacao.ts` (+ `.test.ts`) — novo | o ouvinte único do toque nas notificações locais (guarda 2 min o que ninguém quis) |
| `src/ui/avisos/AvisoConsultaNova.tsx` — 1 trecho | a consulta nova ouve pelo ouvinte único |
| `src/rotinas/textos.ts` — novo | os textos fixos; Q3 e Q4 numa constante cada |
| `src/rotinas/lembretes.ts` (+ `.test.ts`) — novo | o plano PURO: os ids, as 7 avulsas, o texto (Q3), a diferença com o `getPending`, o toque, o site, o "Sair" |
| `src/rotinas/regras.ts` (+ `.test.ts`) — novo | as regras puras da tela: quem tem, o ✓ otimista, a ordem do card, o formulário, os dias |
| `src/rotinas/aparelho.ts` (+ `.test.ts`) — novo | o plugin: o canal, o "Feito", reconciliar, limpar, as permissões, o alarme exato; o login guardado; o `sessionStorage` do site |
| `src/rotinas/useRotinas.ts` — novo | a consulta e o ✓ otimista (React Query); a frase do erro |
| `src/rotinas/ui/{DiasDaSemana,RotinasDeHoje,FolhaRotina}.tsx` (+ `FolhaRotina.test.tsx`) — novos | os dias; a lista de hoje (o card do Início e — P5 — a seção da Dieta); a folha com os 2 modos |
| `src/app-aluno/inicio/CardRotinasHoje.tsx` (+ `.test.tsx`) — novo | o card do Início (registro por convenção) |
| `src/app-aluno/abas/Inicio.tsx` + `Inicio.test.tsx`, `abasW12.test.ts` | o lugar do card (`LINHAS`, `APARECE`, `ESQUELETO`) e os testes |
| `src/app-aluno/perfil/Rotinas.tsx` (+ `.test.tsx`) — novo | a página `/perfil/rotinas` (registro por convenção) |
| `src/app-aluno/abas/Perfil.tsx` + `Perfil.test.tsx` | o item "Rotinas e lembretes"; o teste da linha da exclusão |
| `src/ui/avisos/LembreteDasRotinas.tsx` (+ `.test.tsx`) — novo | o aviso global: reconcilia (APK), atende o "Feito", esvazia no "Sair", avisa no site |
| `src/app-aluno/perfil/pecas/SheetExcluir.tsx`, `src/painel/configuracoes/excluirConta/regras.ts` (+ `regras.test.ts`) | a linha "Rotinas, alimentos e receitas que você criou (N)" |
| `e2e/wa/telas_rotinas.py` — novo | o E2E de tela (site, loja, staging; `--base prod` só leitura; `--seco`; `--limpar`) |
| `e2e/wa/apk_rotinas.py` — novo (a mais da §6) | a prova no aparelho (G7 ou emulador) pelo adb + o DevTools da WebView |
| `docs/e2e-rodadas.md` | as linhas no topo |
| `docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md` | este plano |
| fora do repo — `~/projetos/physiqcalc-scratch/w-a/p3/` | os scripts de apoio (Apêndice A), `codigo/` (as cópias conferidas dos arquivos novos + `codigo.md5`), `patches/` (as edições por task), `orig/` (os 9 arquivos editados como eram), `progresso.log`, `T<N>-FEITA`, as saídas e o APK de teste |

**A P3 NÃO toca:** migration, função, `src/aluno-dia/**` e `src/acessos/**` (só importa), `src/nucleo/sessao.tsx`, `src/integrations/**`, a Guarda
dos E2E, `src/lib/logsDasFuncoes*.test.ts`, `capacitor.config.ts` e `android/**` (o APK de teste muda só a cópia gerada, ignorada pelo git),
`docs/{banco-permissoes,desvios}.md`, a lista "não tocar" da spec §5.7 e os arquivos da hml-21.

## Estimativa (minutos de trabalho com testes e checagens; sem as esperas de terceiros — locks, CI, Vercel)

```
+------+-------------------------------------------------------------------+--------+------------------------+
| Task | O quê                                                             | Melhor | Calibrado              |
+------+-------------------------------------------------------------------+--------+------------------------+
|  0   | Preparar: worktree, npm ci, .env.local, o plano, drift, massa,    |   25   |  12–15                 |
|      | os pedidos à LINUX 1                                              |        |                        |
|  1   | O ouvinte único do toque (TDD) + a consulta nova por ele          |   15   |   3–5   (×0,2–0,3)     |
|  2   | O plano dos lembretes: textos + lembretes (TDD)                   |   30   |   4–6                  |
|  3   | As regras da tela (TDD)                                           |   15   |   3–4                  |
|  4   | Os lembretes no aparelho: aparelho.ts (TDD)                       |   20   |   3–5                  |
|  5   | A consulta, os dias, a lista de hoje e a folha (TDD)              |   35   |   5–8                  |
|  6   | O card do Início + Inicio.tsx (TDD)                               |   20   |   5–7                  |
|  7   | A página /perfil/rotinas + o item do Perfil (TDD)                 |   30   |   5–7                  |
|  8   | O aviso global LembreteDasRotinas (TDD) + as guardas              |   30   |   5–7                  |
|  9   | A linha do resumo da exclusão (TDD)                               |   10   |   3–4                  |
| 10   | Os 2 E2E (telas e APK): --seco, compila, commit                   |   30   |   3–5                  |
| 11   | A prova local completa (o CI + as provas da P3)                   |   40   |  25–35  (a máquina)    |
| 12   | E2E de tela LOCAL (5173: site e loja) + os prints                 |   45   |  30–40                 |
| 13   | O APK de teste + o roteiro no EMULADOR (com o reiniciar)          |   60   |  35–50                 |
| 14   | STAGING: push ff, Vercel, E2E de staging                          |   40   |  20–30                 |
| 15   | O G7: o APK de teste e a prova (app fechado, Feito, Sair)         |   40   |  20–30                 |
| 16   | As rodadas + PR + CI                                              |   30   |  15–20                 |
| 17   | Merge → release → bump → staging = main → smoke SÓ LEITURA        |   40   |  25–35                 |
| 18   | Fechar                                                            |   15   |   8–10                 |
+------+-------------------------------------------------------------------+--------+------------------------+
| TOTAL| código 300 (Tasks 0–11) + esteira 270 (Tasks 12–18)               |  570   | 229–323 (3h49 a 5h23)  |
+------+-------------------------------------------------------------------+--------+------------------------+
```

**A calibração:** a P1 levou ×0,47 do melhor caso (o código do plano já rodado num Postgres descartável); a parte LOCAL da P2 levou **43 min
para 470 de melhor caso (×0,09)** porque o código do plano tinha rodado num ensaio e o executor só copiou e rodou os mesmos comandos. Aqui o
código JÁ RODOU no ensaio (os 12 arquivos de teste da P3 e o Vitest inteiro do repo, 423 arquivos) e as cópias estão prontas (`copiar.sh`, `patches/`) → **×0,2–0,3
nas Tasks 1–10**; a prova local, os E2E, o Gradle, o emulador, o G7, o CI e a release são tempo de máquina e de espera (×0,6–1,0). A spec
previa 490 (300 + 190): o código fica nos mesmos 300 de melhor caso (mas cai na calibração — o ensaio) e a esteira sobe 80 (o APK de
teste montado no notebook, o emulador do "reiniciar", a loja local e o smoke da produção). **Previsão: 3h49 a 5h23 de trabalho (pior
cenário 9h30 — o melhor caso sem calibrar)**, mais as esperas das
janelas da LINUX 1 (a P3 começa depois da P2 em produção). Atrasou → avisar antes.

## Comandos (valem em todas as tasks)

- **Todo comando começa com `cd ~/projetos/physiqcalc-wa-p3 &&`** (W) ou `cd ~/projetos/physiqcalc-scratch/w-a/p3 &&` (S) — o cwd volta ao
  inicial a cada chamada. Variável não sobrevive entre chamadas: repetir na mesma linha.
- **Contra o diálogo de permissão (travou um agente 1h30 na P1):** nada de `bash -c '…'`, `sh -c`, subshell `( … )` com `time`, `eval` nem `$(…)`
  na linha de comando; passo complexo = script em arquivo em `~/projetos/physiqcalc-scratch/w-a/p3/` (o conteúdo está no Apêndice A); `rm` só
  com caminho literal ou `"${VAR:?}/…"`. Python de mais de 1 linha = arquivo (nada de heredoc na linha de comando). Valor do dia (sha, nº do PR,
  hora) = ler num comando e escrever o valor no seguinte.
- **Pesado na fila, com 2 workers e o `TMPDIR` do scratch:** Vitest = `bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh <arquivos…>`; o resto
  = `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P <cmd>`. **Rodada
  grande (o lint e o Vitest do repo inteiro, o build) só na Task 11**; entre as rodadas, a fila livre (o caminho crítico da LINUX 1 também usa).
- **Python sem bytecode no repo:** `PYTHONDONTWRITEBYTECODE=1`; sintaxe e símbolos por
  `python3 -c "compile(open('<arq>').read(), '<arq>', 'exec'); print('compila ok')"` (o `ast.parse` não pega `global` fora de ordem).
- **Os arquivos novos vêm das cópias conferidas:** `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh <caminho no repo>…` (não sobrescreve;
  confere o md5 de `codigo.md5`; o conteúdo é o dos blocos deste plano). **As edições** nos arquivos que existem:
  `git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/<task>.patch` (o drift da Task 0 diz se aplicam; se um não aplicar, fazer a edição à
  mão pelo diff do bloco).
- **Commit (o comando INTEIRO, só os arquivos da task):**
  `git add <arquivos> && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`.
- **Aviso de progresso (regra global):** `HHhMM a HHhMM (pior cenário HHhMM)` + as fases (✅ · 🚧 · ⏳), uma por linha, terminal + tópico; a cada
  ~30 min num agente longo. Cada task fechada → `bash ~/projetos/physiqcalc-scratch/w-a/p3/feita.sh <N> "<resumo>" "<linha>"…`.
- **Coordenação (mestre §0, quadro):** trava 🔒 no quadro + `SendMessage` à LINUX 1 (a sessão da linha dela no quadro — em 13/10 ~03h,
  `bertoldo-77`) + esperar o "pode ir" antes de: E2E com massa no staging (Tasks 12–15), push no `staging` (Task 14), merge na `main` e o
  realinhar (Task 17). Soltou → "livre" + aviso. Quem executa as tasks e não é o coordenador anota no `progresso.log` o que é do quadro.
- **O G7:** só na Task 15 e só com o combinado; nunca reiniciar, nunca desligar a Depuração por Wi-Fi (nem `settings put global adb_wifi_enabled`),
  nunca mexer no Termux nem nas permissões dele; o carteiro conferido antes e depois; no fim, o Termux de volta na frente (a tela preta).

---

### Task 0: Preparar (a worktree nova, o plano no repo, o drift, a massa SÓ LEITURA, os pedidos à LINUX 1)

**Files:** o plano (`docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md`); fora do repo, nada novo (os scripts de `p3/` já existem).
**Estimativa:** 25 min (calibrado 12–15).

- [ ] **Step 1: O estado do git e da outra sessão (comando ISOLADO)**

Run: `git -C ~/projetos/physiqcalc fetch origin && git -C ~/projetos/physiqcalc log origin/main --oneline -5 && git -C ~/projetos/physiqcalc log origin/staging --oneline -2 && gh pr list --repo weslleybertoldo/physiqcalc --state open && sed -n 1,12p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md`
Expected: na `origin/main`, o squash "W-A P2: …" e o `chore: bump version …` em cima (a P2 em produção); `origin/staging` = `origin/main`;
nenhum PR aberto mexendo em `src/rotinas`, `src/lib/acoesDeNotificacao.ts`, `src/app-aluno/{abas/Inicio,abas/Perfil,inicio,perfil}`,
`src/ui/avisos/{AvisoConsultaNova,LembreteDasRotinas}.tsx` ou `e2e/wa/`. A P2 ainda não na `main` → PARAR (a P3 depende dela).

- [ ] **Step 2: As funções da W-A publicadas (SÓ LEITURA)**

Run: `python3 ~/projetos/physiqcalc-scratch/w-a/p3/funcoes_wa.py --esperar-publicadas`
Expected: `acessos` e `aluno-dia` (principal, `verify_jwt` True) e `treino-acessos` (Treino, False) ACTIVE → `esperado: True`.

- [ ] **Step 3: A worktree nova da `origin/main`, o `.env.local` do staging e as dependências**

Run: `git -C ~/projetos/physiqcalc worktree add -b feat/w-a-p3-rotinas ~/projetos/physiqcalc-wa-p3 origin/main && cp ~/projetos/physiqcalc-wa-p2/.env.local ~/projetos/physiqcalc-wa-p3/.env.local && grep -c "^VITE_DB_SCHEMA=staging$" ~/projetos/physiqcalc-wa-p3/.env.local`
Expected: a worktree em `~/projetos/physiqcalc-wa-p3` na branch `feat/w-a-p3-rotinas` e `1` (o build local é o de staging). A worktree da P2 já
removida → copiar de `~/projetos/physiqcalc-acessos/.env.local` (o mesmo arquivo). Depois:
`cd ~/projetos/physiqcalc-wa-p3 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp flock $P npm ci`
Expected: `added … packages` sem erro (~3–6 min).

- [ ] **Step 4: O plano no repo**

Run: `cd ~/projetos/physiqcalc-wa-p3 && cp ~/projetos/physiqcalc-scratch/w-a/p3/plano-p3.md docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md && git add docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(w-a): plano da P3 (rotinas e lembretes)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md`
Expected: 1 commit novo.

- [ ] **Step 5: O drift (o que o plano usa ainda é o que era)**

Run: `cd ~/projetos/physiqcalc-wa-p3 && PATH=~/.local/node/bin:$PATH bash ~/projetos/physiqcalc-scratch/w-a/p3/drift.sh`
Expected: `drift: rc=0` — os 9 arquivos que a P3 edita "igual" aos de `p3/orig` e "o patch das edições aplica"; o contrato da P2 "ok" em todos;
a guarda do navegador e o ouvinte da consulta "ok"; o plugin "ok 8.0.2"; os arquivos novos "livre". Alguma linha MUDOU/FALTA → ANTES de
codar: abrir o diff (`git diff --no-index ~/projetos/physiqcalc-scratch/w-a/p3/orig/<arq> <arq>`), ajustar a edição da task daquele arquivo à mão
(o bloco `diff` da task diz o que muda) ou o import que mudou de nome, rodar os testes da task e anotar no `progresso.log`.

- [ ] **Step 6: A massa de TESTE e a saúde (SÓ LEITURA)**

Run: `cd ~/projetos/physiqcalc-wa-p3 && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p3/massa_p3.py && PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p3/saude.py "a P3"`
Expected: `rotinas_aluna 0`, `rotinas_w7b 0`, `matricula_a ≥ 1`, `matricula_app_w7b ≥ 1`, as sobras da W-A todas 0, nenhum estado com massa →
`massa de TESTE pronta para os E2E da P3: True`; o `/health` dos 2 projetos ACTIVE_HEALTHY e `longas 0, esperando 0`. Sobra de outra parte →
o `--limpar` dela (`python3 e2e/wa/api.py --limpar` da P2) antes; rotina viva da aluna sem marca → PARAR e perguntar (não apagar).

- [ ] **Step 7: O quadro (o coordenador escreve; quem executa só anota no `progresso.log`)** — a linha da W-A: "🚧 P3 (app: rotinas e
  lembretes) desde HH:MM — worktree `~/projetos/physiqcalc-wa-p3` (`feat/w-a-p3-rotinas` da `main` com a P2). RESERVADOS: `src/rotinas/**`,
  `src/lib/acoesDeNotificacao.ts` (+ teste), `src/app-aluno/inicio/CardRotinasHoje.tsx` (+ teste), `src/app-aluno/perfil/Rotinas.tsx` (+ teste),
  `src/ui/avisos/LembreteDasRotinas.tsx` (+ teste), `e2e/wa/{telas_rotinas,apk_rotinas}.py`, `docs/superpowers/plans/2026-10-13-w-a-p3-rotinas.md`;
  por ACRÉSCIMO: `src/app-aluno/abas/{Inicio,Perfil}.tsx` + testes, `src/app-aluno/abas/abasW12.test.ts`, `src/app-aluno/perfil/pecas/SheetExcluir.tsx`,
  `src/painel/configuracoes/excluirConta/regras.ts` + teste, `src/ui/avisos/AvisoConsultaNova.tsx` (só o ouvinte do toque), o topo do
  `docs/e2e-rodadas.md`; sem migration, sem função; janelas pedidas: 🔒 BANCO (Tasks 12–15) e 🔒 git (Tasks 14 e 17)".

- [ ] **Step 8: Os pedidos à LINUX 1 (1 `SendMessage`, à sessão da linha dela no quadro)**: "W-A P3 (app: rotinas e lembretes) começou
  (worktree `~/projetos/physiqcalc-wa-p3`, da `main` com a P2). 1) Arquivos — nenhum seu: novos `src/rotinas/**`, `src/lib/acoesDeNotificacao.ts`,
  `src/app-aluno/inicio/CardRotinasHoje.tsx`, `src/app-aluno/perfil/Rotinas.tsx`, `src/ui/avisos/LembreteDasRotinas.tsx`, `e2e/wa/{telas_rotinas,apk_rotinas}.py`;
  edito por acréscimo `src/app-aluno/abas/{Inicio,Perfil}.tsx` (+ testes), `abasW12.test.ts`, `perfil/pecas/SheetExcluir.tsx`,
  `painel/configuracoes/excluirConta/regras.ts` (+ teste) e — fora da lista da spec — 1 trecho do `src/ui/avisos/AvisoConsultaNova.tsx` (o
  ouvinte do toque passa pelo ouvinte único: com o app fechado, o Capacitor entrega o toque só ao 1º ouvinte). A sua guarda do navegador: 0
  achado nos arquivos novos — o 'Sair limpa os lembretes' NÃO usa `.auth.` (troquei o `onAuthStateChange` da spec pelo desmontar do aviso
  global). 2) O Início ganha o card 'Rotinas de hoje' e o app faz +1 `aluno-dia { acao: 'ler', q: 'rotinas' }` ao abrir: o seu `rede.py` conta
  como 'fora'; o tempo do Início no `telas.py` pode mexer uns décimos — a sua linha de base da próxima sub-W já com a P3 no staging. 3) Janelas
  (cada uma com o seu 'pode ir'): 🔒 BANCO do staging ~[hora] → [hora] (telas local na 5173 + o APK no emulador), 🔒 git + BANCO ~[hora]
  (push ff no `staging` + E2E de staging), 🔒 BANCO ~[hora] (~25 min: o APK no G7), e depois o git do merge/realinhar. 4) A prova no G7 termina
  com o 'Sair' do app, que é GLOBAL nos 2 bancos: derruba TODAS as sessões da conta de TESTE `w7b-sozinho` (principal e Treino). Se você guarda
  sessão dela, a próxima rodada sua faz login de novo. Qual hora é boa? (a `w5p-aluna` não sai). 5) O emulador do notebook roda ~20 min (a prova
  do 'reiniciar' — o G7 não reinicia: é o carteiro); o boot na fila do pesado. 6) `docs/e2e-rodadas.md`: só o topo." → a resposta no `progresso.log`.

- [ ] **Step 9: A Q5** — o coordenador manda ao Weslley (uma mensagem; até a resposta, a recomendada).
- [ ] **Step 10: Previsão + marca** — o aviso de progresso (terminal + tópico) com `HHhMM a HHhMM (pior cenário HHhMM)` e as fases;
  `bash ~/projetos/physiqcalc-scratch/w-a/p3/feita.sh 0 "worktree, npm ci, plano, drift rc=0, massa pronta, pedidos à LINUX 1" "<o que o Step 1 e o 6 mostraram>"`.

---

### Task 1: O ouvinte único do toque nas notificações locais (TDD) + a consulta nova por ele

**Files:** Create `src/lib/acoesDeNotificacao.ts`, `src/lib/acoesDeNotificacao.test.ts`; Modify `src/ui/avisos/AvisoConsultaNova.tsx` (1 trecho).
**Estimativa:** 15 min (calibrado 3–5).

- [ ] **Step 1: O teste (vermelho)**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/lib/acoesDeNotificacao.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/lib/acoesDeNotificacao.test.ts`
Expected: FAIL — `Failed to resolve import "./acoesDeNotificacao"` (`Test Files 1 failed`).

`src/lib/acoesDeNotificacao.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  nativo: true,
  ouvintes: [] as ((e: unknown) => void)[],
  addListener: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { addListener: h.addListener } }));

import { GUARDA_DA_ACAO_MS, _zerarAcoesDeNotificacao, ouvirAcoesDeNotificacao } from "./acoesDeNotificacao";

const toque = (id: number, extra: Record<string, unknown>) => ({ actionId: "tap", notification: { id, title: "t", body: "b", extra } });
const doPlugin = (e: unknown) => h.ouvintes.forEach((f) => f(e));

beforeEach(() => {
  _zerarAcoesDeNotificacao();
  h.nativo = true;
  h.ouvintes = [];
  h.addListener.mockReset();
  h.addListener.mockImplementation(async (_n: string, f: (e: unknown) => void) => {
    h.ouvintes.push(f);
    return { remove: vi.fn() };
  });
});
afterEach(() => vi.useRealTimers());

describe("W-A P3 — o ouvinte único do toque nas notificações locais", () => {
  it("1 ouvinte NATIVO só, com 2 interessados (a consulta e as rotinas); cada ação vai para quem a quer", () => {
    const consulta = vi.fn((e: { notification?: { extra?: { rota?: string } } }) => e.notification?.extra?.rota === "/perfil/agenda");
    const rotinas = vi.fn((e: { notification?: { id?: number } }) => (e.notification?.id ?? 0) >= 40000);
    ouvirAcoesDeNotificacao(consulta as never);
    ouvirAcoesDeNotificacao(rotinas as never);
    expect(h.addListener).toHaveBeenCalledTimes(1);
    expect(h.addListener).toHaveBeenCalledWith("localNotificationActionPerformed", expect.any(Function));
    doPlugin(toque(40003, { rotina_id: "r1" }));
    expect(rotinas).toHaveBeenCalledTimes(1);
    doPlugin(toque(3123, { rota: "/perfil/agenda" }));
    expect(consulta).toHaveBeenLastCalledWith(expect.objectContaining({ notification: expect.objectContaining({ id: 3123 }) }));
    // a da consulta foi da consulta: as rotinas não a recebem
    expect(rotinas).toHaveBeenCalledTimes(1);
  });

  it("app FECHADO: o toque chega antes de quem o quer (o plugin entrega ao 1º ouvinte) → fica guardado e vai para quem montar depois", () => {
    const consulta = vi.fn(() => false);
    ouvirAcoesDeNotificacao(consulta);
    doPlugin(toque(40003, { rotina_id: "r1" }));
    expect(consulta).toHaveBeenCalledTimes(1);
    const rotinas = vi.fn(() => true);
    ouvirAcoesDeNotificacao(rotinas);
    expect(rotinas).toHaveBeenCalledTimes(1);
    // já foi de alguém: quem montar depois não recebe de novo
    const outro = vi.fn(() => true);
    ouvirAcoesDeNotificacao(outro);
    expect(outro).not.toHaveBeenCalled();
  });

  it("a guardada vale 2 min; um interessado com erro não derruba o resto; parar de ouvir funciona", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    doPlugin(toque(40003, { rotina_id: "r1" })); // ninguém ouvia ainda — mas o nativo só existe depois do 1º interessado:
    expect(h.ouvintes).toHaveLength(0);
    const ninguem = vi.fn(() => false);
    ouvirAcoesDeNotificacao(ninguem);
    doPlugin(toque(40003, { rotina_id: "r1" }));
    vi.setSystemTime(new Date(Date.now() + GUARDA_DA_ACAO_MS + 1000));
    const tarde = vi.fn(() => true);
    const pararTarde = ouvirAcoesDeNotificacao(tarde);
    expect(tarde).not.toHaveBeenCalled();
    pararTarde();
    const quebra = vi.fn(() => {
      throw new Error("x");
    });
    const parar = ouvirAcoesDeNotificacao(quebra);
    const certo = vi.fn(() => true);
    ouvirAcoesDeNotificacao(certo);
    doPlugin(toque(40004, { rotina_id: "r2" }));
    expect(certo).toHaveBeenCalledTimes(1);
    parar();
    doPlugin(toque(40005, { rotina_id: "r3" }));
    expect(quebra).toHaveBeenCalledTimes(1);
  });

  it("no site: nenhum ouvinte nativo", () => {
    h.nativo = false;
    ouvirAcoesDeNotificacao(() => true);
    expect(h.addListener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: O ouvinte (verde)**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/lib/acoesDeNotificacao.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/lib/acoesDeNotificacao.test.ts`
Expected: `Tests 4 passed (4)`.

`src/lib/acoesDeNotificacao.ts`:
```ts
// Physiq W-A P3 — o OUVINTE ÚNICO do toque nas notificações locais (o `localNotificationActionPerformed` do @capacitor/local-notifications).
// Por quê: com o app FECHADO, o toque (ou o "Feito") abre o app e o plugin guarda o evento até alguém ouvir — e o Capacitor o entrega só
// ao 1º ouvinte que se registrar (Plugin.java: sendRetainedArgumentsForEvent, "only when the first listener for an event is added"). Com 2
// ouvintes próprios (a consulta nova da Agenda e as rotinas), quem montasse primeiro engolia o toque do outro. Aqui há 1 ouvinte nativo só;
// cada interessado diz se a ação é dele (devolve true) e a que ninguém quis fica guardada 2 min para quem montar depois (os avisos globais
// carregam sob demanda, em qualquer ordem). No site não há ouvinte nativo (só o registro de quem ouve).
import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type ActionPerformed } from "@capacitor/local-notifications";

/** Quem ouve: devolve true quando a ação é dele (o hub não a entrega a mais ninguém). */
export type OuvinteDeAcao = (e: ActionPerformed) => boolean;

export const GUARDA_DA_ACAO_MS = 2 * 60_000;
const MAX_GUARDADAS = 10;

const ouvintes = new Set<OuvinteDeAcao>();
let guardadas: { e: ActionPerformed; em: number }[] = [];
let registrado = false;

function quer(o: OuvinteDeAcao, e: ActionPerformed): boolean {
  try {
    return o(e) === true;
  } catch {
    return false;
  }
}

function chegou(e: ActionPerformed): void {
  for (const o of [...ouvintes]) if (quer(o, e)) return;
  const agora = Date.now();
  guardadas = [...guardadas.filter((g) => agora - g.em <= GUARDA_DA_ACAO_MS), { e, em: agora }].slice(-MAX_GUARDADAS);
}

/** Passa a ouvir as ações das notificações locais (as guardadas dos últimos 2 min chegam na hora). Devolve o "parar de ouvir". */
export function ouvirAcoesDeNotificacao(o: OuvinteDeAcao): () => void {
  if (!registrado && Capacitor.isNativePlatform()) {
    registrado = true;
    void LocalNotifications.addListener("localNotificationActionPerformed", chegou);
  }
  ouvintes.add(o);
  const agora = Date.now();
  guardadas = guardadas.filter((g) => agora - g.em <= GUARDA_DA_ACAO_MS && !quer(o, g.e));
  return () => {
    ouvintes.delete(o);
  };
}

/** Só os testes: volta ao começo (sem ouvintes, sem guardadas, sem o ouvinte nativo). */
export function _zerarAcoesDeNotificacao(): void {
  ouvintes.clear();
  guardadas = [];
  registrado = false;
}
```

- [ ] **Step 3: A consulta nova pelo ouvinte único**

Run: `cd ~/projetos/physiqcalc-wa-p3 && git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/T1.patch && grep -c "ouvirAcoesDeNotificacao" src/ui/avisos/AvisoConsultaNova.tsx`
Expected: `2` (o import e o uso). O `LocalNotifications` segue importado (o `schedule`/as permissões da consulta).

`~/projetos/physiqcalc-scratch/w-a/p3/patches/T1.patch`:
```diff
--- a/src/ui/avisos/AvisoConsultaNova.tsx
+++ b/src/ui/avisos/AvisoConsultaNova.tsx
@@ -8,6 +8,7 @@
 import { ROTA_AGENDA, consultasParaAvisar, gravarAvisadas, idDaNotificacao, lerAvisadas, textoDoAviso } from "@/agenda/avisoLocal";
 import { minhaAgenda } from "@/app-aluno/perfil/pecas/api";
 import { inicioDaAgenda } from "@/app-aluno/perfil/pecas/regras";
+import { ouvirAcoesDeNotificacao } from "@/lib/acoesDeNotificacao";
 import { useSessao } from "@/nucleo/sessao";
 import { pushAtivoNoAparelho } from "@/push/regras";
 
@@ -84,20 +85,24 @@
     };
     document.addEventListener("visibilitychange", aoVoltar);
     let estado: Promise<{ remove: () => void }> | null = null;
-    let toque: Promise<{ remove: () => void }> | null = null;
+    let pararDeOuvir: (() => void) | null = null;
     if (nativo()) {
       estado = CapApp.addListener("appStateChange", ({ isActive }) => {
         if (isActive) void conferir();
       });
-      toque = LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
+      // W-A P3: o toque pelo ouvinte ÚNICO do app (src/lib/acoesDeNotificacao.ts) — com o app fechado, o plugin entrega o toque só ao 1º
+      // ouvinte que se registra, e as rotinas também ouvem
+      pararDeOuvir = ouvirAcoesDeNotificacao((e) => {
         const rota = (e.notification?.extra as { rota?: string } | undefined)?.rota;
-        if (rota === ROTA_AGENDA) navigate(ROTA_AGENDA);
+        if (rota !== ROTA_AGENDA) return false;
+        navigate(ROTA_AGENDA);
+        return true;
       });
     }
     return () => {
       document.removeEventListener("visibilitychange", aoVoltar);
       void estado?.then((l) => l.remove());
-      void toque?.then((l) => l.remove());
+      pararDeOuvir?.();
     };
   }, [conferir, navigate]);
 
```

- [ ] **Step 4: Commit** — `feat(notificacoes): o ouvinte único do toque nas notificações locais (com o app fechado o toque vai só ao 1º ouvinte) e a consulta nova por ele`
  com `src/lib/acoesDeNotificacao.ts src/lib/acoesDeNotificacao.test.ts src/ui/avisos/AvisoConsultaNova.tsx`; `feita.sh 1 "ouvinte único 4/4; consulta nova por ele" "<placar>"`.

---

### Task 2: O plano dos lembretes — `src/rotinas/{textos,lembretes}.ts` (TDD)

**Files:** Create `src/rotinas/textos.ts`, `src/rotinas/lembretes.ts`, `src/rotinas/lembretes.test.ts`.
**Estimativa:** 30 min (calibrado 4–6).

- [ ] **Step 1: O teste (vermelho)**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/lembretes.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/lembretes.test.ts`
Expected: FAIL — `Failed to resolve import "./lembretes"`.

`src/rotinas/lembretes.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hojeSP } from "@/aluno-dia/regras";
import type { Rotina, RotinaFeita } from "@/aluno-dia/tipos";
import {
  ACAO_FEITO, CANAL_ROTINAS, FAIXA, JANELA_DO_SITE_MS, acaoDaNotificacao, chaveDoAvisoNoSite, deveLimparAoDesmontar, diferenca, idDoLembrete, instante,
  naFaixa, planoDosLembretes, posicoes, rotinasParaAvisarNoSite, textoDoLembrete, type LembreteNoAparelho,
} from "./lembretes";
import { REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA } from "./textos";

// O relógio dos casos: quarta 30/09/2026 às 9h30 NA HORA LOCAL do aparelho (o alarme usa o relógio do celular — risco 4); o "hoje" do
// plano é o de São Paulo, o mesmo dia para qualquer fuso de UTC−12 a UTC+6 (o CI roda em UTC; o notebook em São Paulo).
const L = (dia: string, hora: string) => instante(dia, hora);
const AGORA = L("2026-09-30", "09:30");
const DONO = "u-aluna";

let n = 0;
function rotina(o: Partial<Rotina> = {}): Rotina {
  n += 1;
  return {
    id: o.id ?? `r${n}`, origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "10:00",
    dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: true, ordem: 0, criada_em: `2026-09-0${Math.min(n, 9)}T12:00:00Z`, alterada_em: "2026-09-01T12:00:00Z",
    arquivada_em: null, ...o,
  };
}
const feita = (rotina_id: string, dia: string): RotinaFeita => ({ rotina_id, dia, feita_em: `${dia}T12:00:00Z` });
const dias = (p: LembreteNoAparelho[]) => p.map((l) => l.extra.dia);

describe("W-A P3 — os ids da faixa própria (40000–40299)", () => {
  it("40000 + posição × 10 + dia da semana: a 1ª rotina na segunda = 40001; a 30ª no domingo = 40297; tudo dentro da faixa", () => {
    expect(idDoLembrete(0, 1)).toBe(40001);
    expect(idDoLembrete(29, 7)).toBe(40297);
    expect(naFaixa(FAIXA.de) && naFaixa(FAIXA.ate)).toBe(true);
    // as outras notificações do app ficam fora: treino 2001, timer 1002, treino longo 1101–1103, consultas 3000–3899 (e 3001/3002 nativos)
    for (const fora of [2001, 1002, 1101, 3000, 3899, 39999, 40300]) expect(naFaixa(fora)).toBe(false);
    expect(naFaixa("40001")).toBe(false);
  });

  it("a posição é a da CRIAÇÃO entre as vivas (a arquivada não ocupa lugar)", () => {
    const a = rotina({ id: "a", criada_em: "2026-09-05T00:00:00Z" });
    const b = rotina({ id: "b", criada_em: "2026-09-01T00:00:00Z" });
    const x = rotina({ id: "x", criada_em: "2026-08-01T00:00:00Z", arquivada_em: "2026-09-10T00:00:00Z" });
    expect([...posicoes([a, b, x]).entries()]).toEqual([["b", 0], ["a", 1]]);
  });
});

describe("W-A P3 — o plano: as próximas 7 ocorrências AVULSAS de cada rotina com lembrete (revisão C3)", () => {
  it("todo dia às 10:00, agora 9h30 de quarta → 7 avisos (qua → ter), 1 por dia da semana, sem `every`, com o dia e o dono no extra", () => {
    const r = rotina({ id: "cre" });
    const p = planoDosLembretes([r], [], DONO, AGORA);
    expect(p).toHaveLength(7);
    expect(dias(p)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(p.map((l) => l.id)).toEqual([40003, 40004, 40005, 40006, 40007, 40001, 40002]);
    expect(new Set(p.map((l) => l.id)).size).toBe(7);
    expect(p[0].at.getTime()).toBe(instante("2026-09-30", "10:00").getTime());
    expect(p[6].at.getTime()).toBe(instante("2026-10-06", "10:00").getTime());
    expect(p[0].extra).toEqual({ rotina_id: "cre", dono: DONO, dia: "2026-09-30", hora: "10:00" });
    for (const l of p) expect(Object.keys(l).sort()).toEqual(["at", "corpo", "extra", "id", "titulo"]);
  });

  it("hoje sai se a hora já passou ou se já foi feita hoje (6 avisos); feita ONTEM não muda nada", () => {
    expect(dias(planoDosLembretes([rotina({ id: "a", horario: "09:00" })], [], DONO, AGORA))).not.toContain("2026-09-30");
    expect(planoDosLembretes([rotina({ id: "a", horario: "09:00" })], [], DONO, AGORA)).toHaveLength(6);
    expect(planoDosLembretes([rotina({ id: "b" })], [feita("b", "2026-09-30")], DONO, AGORA)).toHaveLength(6);
    expect(planoDosLembretes([rotina({ id: "c" })], [feita("c", "2026-09-29")], DONO, AGORA)).toHaveLength(7);
  });

  it("os dias da semana dela: Seg a Sex → 5 nos próximos 7 dias; só sábado → 1", () => {
    expect(dias(planoDosLembretes([rotina({ dias_semana: [1, 2, 3, 4, 5] })], [], DONO, AGORA)))
      .toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"]);
    expect(dias(planoDosLembretes([rotina({ dias_semana: [6] })], [], DONO, AGORA))).toEqual(["2026-10-03"]);
  });

  it("sem lembrete, sem horário, arquivada ou a 31ª viva → nada", () => {
    expect(planoDosLembretes([rotina({ lembrete: false })], [], DONO, AGORA)).toEqual([]);
    expect(planoDosLembretes([rotina({ horario: null, lembrete: true })], [], DONO, AGORA)).toEqual([]);
    expect(planoDosLembretes([rotina({ arquivada_em: "2026-09-29T00:00:00Z" })], [], DONO, AGORA)).toEqual([]);
    const trinta = Array.from({ length: 30 }, (_, i) => rotina({ id: `v${String(i).padStart(2, "0")}`, criada_em: `2026-08-01T00:${String(i).padStart(2, "0")}:00Z`, lembrete: false }));
    const ultima = rotina({ id: "z31", criada_em: "2026-09-29T00:00:00Z" });
    expect(planoDosLembretes([...trinta, ultima], [], DONO, AGORA)).toEqual([]);
  });

  it("2 rotinas: ids que não se cruzam (posição 0 e 1) e a lista pela hora", () => {
    const p = planoDosLembretes([rotina({ id: "b", criada_em: "2026-09-02T00:00:00Z", horario: "08:00" }), rotina({ id: "a", criada_em: "2026-09-01T00:00:00Z" })],
      [], DONO, AGORA);
    expect(p).toHaveLength(13); // a: 7 (10:00 de hoje ainda vem) · b: 6 (8:00 de hoje já passou)
    expect(new Set(p.map((l) => l.id)).size).toBe(13);
    expect(p.filter((l) => l.extra.rotina_id === "a").every((l) => l.id >= 40001 && l.id <= 40007)).toBe(true);
    expect(p.filter((l) => l.extra.rotina_id === "b").every((l) => l.id >= 40011 && l.id <= 40017)).toBe(true);
    expect(p.map((l) => l.at.getTime())).toEqual([...p.map((l) => l.at.getTime())].sort((x, y) => x - y));
  });

  it("o dia é o de São Paulo: às 22h30 de SP (01h30 UTC do dia seguinte) a janela começa no dia de SP (a hora, a do aparelho)", () => {
    const agora = new Date("2026-10-01T01:30:00Z");
    expect(hojeSP(agora)).toBe("2026-09-30");
    const p = planoDosLembretes([rotina({ horario: "23:45" })], [], DONO, agora);
    const primeiro = instante("2026-09-30", "23:45").getTime() > agora.getTime() ? "2026-09-30" : "2026-10-01";
    expect(p[0].extra.dia).toBe(primeiro);
    expect(p.length).toBe(primeiro === "2026-09-30" ? 7 : 6);
  });
});

describe("W-A P3 — o texto (Q3) e o canal", () => {
  it("suplemento: 'Hora da rotina' + 'Creatina · 5 g'; sem detalhe, só o nome", () => {
    expect(textoDoLembrete(rotina())).toEqual({ titulo: "Hora da rotina", corpo: "Creatina · 5 g" });
    expect(textoDoLembrete(rotina({ detalhe: null }))).toEqual({ titulo: "Hora da rotina", corpo: "Creatina" });
  });

  it("remédio (Q3 = 'não', a recomendada): 'Hora do seu remédio · 08:00' e o corpo SEM o nome", () => {
    expect(REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA).toBe(true);
    const t = textoDoLembrete(rotina({ tipo: "remedio", nome: "Losartana", detalhe: "50 mg", horario: "08:00" }));
    expect(t.titulo).toBe("Hora do seu remédio · 08:00");
    expect(`${t.titulo} ${t.corpo}`).not.toMatch(/Losartana|50 mg/);
    expect(CANAL_ROTINAS).toBe("rotinas-v1");
  });
});

describe("W-A P3 — a reconciliação (o que o aparelho tem × o plano)", () => {
  const r = rotina({ id: "cre" });
  const plano = planoDosLembretes([r], [], DONO, AGORA);
  const pendente = (l: LembreteNoAparelho, extra: Record<string, unknown> = {}) => ({ id: l.id, title: l.titulo, body: l.corpo, extra: { ...l.extra, ...extra } });
  const ctx = { rotinas: [r], feitas: [] as RotinaFeita[], dono: DONO, agora: AGORA };

  it("nada agendado → agenda os 7; tudo igual → nada a fazer", () => {
    expect(diferenca([], plano, ctx)).toEqual({ cancelar: [], agendar: plano });
    expect(diferenca(plano.map((l) => pendente(l)), plano, ctx)).toEqual({ cancelar: [], agendar: [] });
  });

  it("o texto ou a hora mudaram → reagenda só o que mudou (o mesmo id troca); fora da faixa (treino 2001, consulta 3123) → nunca mexe", () => {
    const pend = [...plano.map((l) => pendente(l)), { id: 2001, title: "Physiq — Hora do treino!", body: "x" }, { id: 3123, title: "Consulta", body: "y" }];
    pend[0] = { ...pend[0], body: "Creatina · 3 g" };
    const d = diferenca(pend, plano, ctx);
    expect(d.cancelar).toEqual([]);
    expect(d.agendar.map((l) => l.id)).toEqual([plano[0].id]);
  });

  it("de outro login (aparelho compartilhado), de rotina apagada ou de um dia que saiu do plano → cancela", () => {
    const outro = { id: 40011, title: "Hora da rotina", body: "Água", extra: { rotina_id: "x", dono: "outra-pessoa", dia: "2026-10-01", hora: "11:00" } };
    const apagada = { id: 40021, title: "Hora da rotina", body: "Velha", extra: { rotina_id: "sumiu", dono: DONO, dia: "2026-10-05", hora: "07:00" } };
    expect(diferenca([outro, apagada], plano, ctx).cancelar).toEqual([40011, 40021]);
  });

  it("a de HOJE que já venceu e ainda está pendente (alarme inexato atrasando) FICA; se foi feita, ou a hora mudou, sai", () => {
    const venceu = { id: 40003, title: "Hora da rotina", body: "Creatina · 5 g", extra: { rotina_id: "cre", dono: DONO, dia: "2026-09-30", hora: "09:20" } };
    const r920 = rotina({ id: "cre", horario: "09:20" });
    const plano920 = planoDosLembretes([r920], [], DONO, AGORA); // hoje já passou: 6
    expect(plano920.some((l) => l.id === 40003)).toBe(false);
    expect(diferenca([venceu], plano920, { ...ctx, rotinas: [r920] }).cancelar).toEqual([]);
    expect(diferenca([venceu], plano920, { ...ctx, rotinas: [r920], feitas: [feita("cre", "2026-09-30")] }).cancelar).toEqual([40003]);
    expect(diferenca([venceu], plano920, { ...ctx, rotinas: [rotina({ id: "cre", horario: "09:25" })] }).cancelar).toEqual([40003]);
  });
});

describe("W-A P3 — o toque e o 'Feito'", () => {
  const ev = (actionId: string, extra: Record<string, unknown>, id = 40003) => ({ actionId, notification: { id, title: "Hora da rotina", body: "Creatina · 5 g", extra } });
  const extra = { rotina_id: "cre", dono: DONO, dia: "2026-09-30", hora: "10:00" };

  it("'Feito' ou o toque de uma rotina deste login → marcar o dia DAQUELA ocorrência (ontem também)", () => {
    expect(acaoDaNotificacao(ev(ACAO_FEITO, extra), DONO, AGORA)).toEqual({ tipo: "marcar", rotina_id: "cre", dia: "2026-09-30", nome: "Creatina" });
    expect(acaoDaNotificacao(ev("tap", { ...extra, dia: "2026-09-29" }), DONO, AGORA)).toEqual({ tipo: "marcar", rotina_id: "cre", dia: "2026-09-29", nome: "Creatina" });
    // o remédio (Q3) vem sem o nome no corpo: o nome sai da lista quando ela chegar
    const remedio = { actionId: ACAO_FEITO, notification: { id: 40013, title: "Hora do seu remédio · 08:00", body: "Toque para ver e marcar como feito.", extra } };
    expect(acaoDaNotificacao(remedio, DONO, AGORA)).toEqual({ tipo: "marcar", rotina_id: "cre", dia: "2026-09-30", nome: null });
  });

  it("de outro login, sem login ou ação desconhecida → ignorar (ninguém marca)", () => {
    expect(acaoDaNotificacao(ev(ACAO_FEITO, { ...extra, dono: "outra-pessoa" }), DONO, AGORA)).toEqual({ tipo: "ignorar" });
    expect(acaoDaNotificacao(ev(ACAO_FEITO, extra), null, AGORA)).toEqual({ tipo: "ignorar" });
    expect(acaoDaNotificacao(ev("outra", extra), DONO, AGORA)).toEqual({ tipo: "ignorar" });
  });

  it("a consulta nova (extra.rota, id 3000–3899) e o lixo → não é rotina (fica para o outro ouvinte)", () => {
    expect(acaoDaNotificacao(ev("tap", { rota: "/perfil/agenda" }, 3123), DONO, AGORA)).toEqual({ tipo: "nao_e_rotina" });
    expect(acaoDaNotificacao(null, DONO, AGORA)).toEqual({ tipo: "nao_e_rotina" });
    expect(acaoDaNotificacao({ notification: { id: 40003 } }, DONO, AGORA)).toEqual({ tipo: "nao_e_rotina" });
  });
});

describe("W-A P3 — o aviso do site (a página aberta) e o Sair", () => {
  const r = rotina({ id: "cre", horario: "09:25" });
  it("venceu há menos de 10 min, no dia dela, não feita e não avisada → avisa; antes da hora, depois da janela, feita ou já avisada → não", () => {
    expect(rotinasParaAvisarNoSite([r], [], new Set(), AGORA).map((x) => x.id)).toEqual(["cre"]);
    expect(rotinasParaAvisarNoSite([r], [], new Set(), L("2026-09-30", "09:24"))).toEqual([]);
    expect(rotinasParaAvisarNoSite([r], [], new Set(), new Date(instante("2026-09-30", "09:25").getTime() + JANELA_DO_SITE_MS))).toEqual([]);
    expect(rotinasParaAvisarNoSite([r], [feita("cre", "2026-09-30")], new Set(), AGORA)).toEqual([]);
    expect(rotinasParaAvisarNoSite([r], [], new Set([chaveDoAvisoNoSite("cre", "2026-09-30")]), AGORA)).toEqual([]);
    expect(rotinasParaAvisarNoSite([rotina({ id: "sab", horario: "09:25", dias_semana: [6] })], [], new Set(), AGORA)).toEqual([]);
    expect(rotinasParaAvisarNoSite([rotina({ id: "s", horario: "09:25", lembrete: false })], [], new Set(), AGORA)).toEqual([]);
  });

  it("o Sair: desmontou e o login guardado não é mais o dele (saiu, trocou, excluiu) → limpa; o mesmo login guardado (remontou) → não", () => {
    expect(deveLimparAoDesmontar("u1", null)).toBe(true);
    expect(deveLimparAoDesmontar("u1", "u2")).toBe(true);
    expect(deveLimparAoDesmontar("u1", "u1")).toBe(false);
    expect(deveLimparAoDesmontar(null, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Os textos e o plano (verde)**

Run: `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/textos.ts src/rotinas/lembretes.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/lembretes.test.ts`
Expected: `Tests 19 passed (19)`.

`src/rotinas/textos.ts`:
```ts
// Physiq W-A P3 — os textos FIXOS das rotinas e dos lembretes (spec W-A §4.3, §4.6, §4.7). Cada um numa constante: trocar = 1 linha. A tela
// nunca mostra o texto cru do banco (os erros vêm pela frase fixa do código — src/aluno-dia/api.ts).
import type { TipoDeRotina } from "@/aluno-dia/tipos";

/**
 * Q3 (spec W-A §9 — sem resposta do Weslley em 13/10/2026; vale a recomendada, "não"): o lembrete de REMÉDIO sai SEM o nome na tela
 * bloqueada — "Hora do seu remédio · 08:00"; o nome aparece ao abrir o app. Os outros tipos saem com o nome. Resposta "sim" (o nome em
 * todos os tipos, como o NutriTrack) = trocar para false.
 */
export const REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA = true;

/** Q4 (spec W-A §9 — sem resposta; vale a recomendada, "sim"): a linha fixa da página. Resposta "não" = trocar para null. */
export const LINHA_PROFISSIONAIS_VEEM: string | null = "Seus profissionais veem as suas rotinas.";

export const TITULO_DO_LEMBRETE = "Hora da rotina";
export const tituloDoRemedio = (hora: string): string => `Hora do seu remédio · ${hora}`;
export const CORPO_DO_REMEDIO = "Toque para ver e marcar como feito.";
export const ROTULO_FEITO = "Feito";
export const SELO_DO_PROFISSIONAL = "do seu profissional";

export const ROTULO_TIPO: Record<TipoDeRotina, string> = { suplemento: "Suplemento", remedio: "Remédio", habito: "Hábito", outro: "Outro" };

export const TEXTOS = {
  card: "Rotinas de hoje",
  vazio: "Crie a sua 1ª rotina (creatina, remédio, água…)",
  criar: "Criar rotina",
  nenhumaHoje: "Nenhuma rotina hoje",
  nenhumaHojeTexto: "As suas rotinas são de outros dias.",
  verRotinas: "Ver rotinas",
  erroLer: "Não deu para carregar as rotinas.",
  semConexao: "Sem conexão",
  semConexaoTexto: "As rotinas aparecem quando a internet voltar.",
  pagina: "Rotinas e lembretes",
  paginaVazia: "Nenhuma rotina ainda",
  nova: "Nova rotina",
  mudar: "Mudar rotina",
  daProfissional: "Criada pelo seu profissional: você pode mudar ou apagar.",
  limite: "Você chegou a 30 rotinas: apague uma para criar outra.",
  notificacoesBloqueadas: "As notificações do Physiq estão bloqueadas neste aparelho: os lembretes não tocam. Libere nas configurações do celular.",
  alarmeExato: "“Alarmes e lembretes” está desligado para o Physiq: o lembrete pode atrasar.",
  ligar: "Ligar",
  bateria: "Se um lembrete não tocar, tire o Physiq da economia de bateria do celular.",
  site: "No site (e no iPhone), o lembrete aparece quando o Physiq está aberto.",
  semInternetMarcar: "Sem internet — marque quando ela voltar.",
  lembreteAntigo: "Esse lembrete já passou: marque a rotina na lista.",
  marcarComoFeita: "Marcar como feita",
  desfazer: "Desfazer",
  feita: (nome: string): string => `${nome} feita`,
  criada: "Rotina criada.",
  salva: "Rotina salva.",
  apagada: "Rotina apagada.",
  semHorario: "Sem horário",
  lembreteSemHorario: "Escolha um horário para ligar o lembrete.",
  permissaoNegada: "Libere as notificações do Physiq para o lembrete tocar.",
} as const;
```

`src/rotinas/lembretes.ts`:
```ts
// Physiq W-A P3 — o PLANO dos lembretes das rotinas (spec W-A §2.2-14, §4.6, §5.4; revisão C3 e I6). PURO: sem Capacitor, sem rede, sem
// armazenamento (testado em lembretes.test.ts); quem agenda é o aparelho.ts.
// No @capacitor/local-notifications 8.0.2 (Android), com `schedule.at` o `every` é ignorado e o alarme toca 1 vez só
// (LocalNotificationManager.java:336-349) → cada rotina com lembrete vira notificações AVULSAS: uma por dia dos próximos 7 (hoje entra só se
// a hora ainda não passou e ela não foi feita hoje), `at` + `allowWhileIdle`, sem `every` e sem `on`. Ids na faixa própria 40000–40299:
// 40000 + a posição da rotina viva (0–29, pela criação) × 10 + o dia da semana da ocorrência (1–7) — 7 dias seguidos têm 7 dias da semana
// diferentes: 2 ocorrências da mesma rotina nunca dividem um id. O que o aparelho já tem (getPending) × o plano = o que cancelar e o que
// agendar (diferenca). E: o que fazer com o toque/"Feito" (acaoDaNotificacao), o aviso do site com a página aberta (rotinasParaAvisarNoSite)
// e se a saída do login esvazia a faixa (deveLimparAoDesmontar).
import { diaDaSemanaISO, hojeSP } from "@/aluno-dia/regras";
import type { Rotina, RotinaFeita } from "@/aluno-dia/tipos";
import { somarDias } from "@/nutricao/app/dia";
import { CORPO_DO_REMEDIO, REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA, TITULO_DO_LEMBRETE, tituloDoRemedio } from "./textos";

export const FAIXA = { de: 40000, ate: 40299 } as const;
export const MAX_ROTINAS_VIVAS = 30;
export const DIAS_DO_PLANO = 7;
export const CANAL_ROTINAS = "rotinas-v1";
export const TIPO_DE_ACAO = "ROTINA";
export const ACAO_FEITO = "feito";
/** O toque no corpo da notificação (o plugin manda "tap"): também marca como feita (spec §2.2-14). */
export const ACAO_TOQUE = "tap";
/** Site: até quanto tempo depois da hora ainda vale avisar (o navegador segura o setInterval da aba de fundo em até 1 min). */
export const JANELA_DO_SITE_MS = 10 * 60_000;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const naFaixa = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id >= FAIXA.de && id <= FAIXA.ate;
export const idDoLembrete = (posicao: number, diaSemana: number): number => FAIXA.de + posicao * 10 + diaSemana;

/** O que vai junto da notificação (o "Feito" lê daqui; nada de nome). */
export interface ExtraDoLembrete {
  rotina_id: string;
  /** o login de quem é a rotina: ação de notificação de outro login é ignorada (aparelho compartilhado — revisão I6) */
  dono: string;
  /** o dia (yyyy-mm-dd, o de São Paulo) daquela ocorrência: o "Feito" marca esse dia */
  dia: string;
  hora: string;
}

export interface LembreteNoAparelho {
  id: number;
  at: Date;
  titulo: string;
  corpo: string;
  extra: ExtraDoLembrete;
}

/** O que o getPending do plugin devolve (só o que a diferença usa). */
export interface PendenteNoAparelho {
  id: number;
  title?: string;
  body?: string;
  extra?: unknown;
}

/** O instante, no relógio DO APARELHO, do dia (yyyy-mm-dd — o de São Paulo) às HH:MM (risco 4 da spec: fora do fuso, vale a hora local). */
export function instante(dia: string, hora: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(a, m - 1, d, hh, mm, 0, 0);
}

/** O texto da notificação. Remédio (Q3): sem o nome na tela bloqueada; os outros tipos com o nome e o detalhe. */
export function textoDoLembrete(r: Pick<Rotina, "nome" | "detalhe" | "tipo" | "horario">): { titulo: string; corpo: string } {
  if (r.tipo === "remedio" && REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA) return { titulo: tituloDoRemedio(r.horario ?? ""), corpo: CORPO_DO_REMEDIO };
  return { titulo: TITULO_DO_LEMBRETE, corpo: r.detalhe ? `${r.nome} · ${r.detalhe}` : r.nome };
}

/** A posição de cada rotina VIVA pela criação (0–29): a mesma em todo aparelho e a cada abertura enquanto nenhuma nasce nem sai. */
export function posicoes(rotinas: readonly Rotina[]): Map<string, number> {
  const vivas = rotinas.filter((r) => !r.arquivada_em).sort((a, b) => a.criada_em.localeCompare(b.criada_em) || a.id.localeCompare(b.id));
  return new Map(vivas.slice(0, MAX_ROTINAS_VIVAS).map((r, i) => [r.id, i] as [string, number]));
}

const feitaNoDia = (feitas: readonly RotinaFeita[], rotina: string, dia: string): boolean => feitas.some((f) => f.rotina_id === rotina && f.dia === dia);

/** As ocorrências dos próximos 7 dias (hoje incluído) de cada rotina viva com lembrete — sem `every`; hoje sai se a hora passou ou se já foi feita. */
export function planoDosLembretes(rotinas: readonly Rotina[], feitas: readonly RotinaFeita[], dono: string, agora: Date = new Date()): LembreteNoAparelho[] {
  const hoje = hojeSP(agora);
  const pos = posicoes(rotinas);
  const plano: LembreteNoAparelho[] = [];
  for (const r of rotinas) {
    const p = pos.get(r.id);
    if (p === undefined || !r.lembrete || !r.horario || !HORA.test(r.horario)) continue;
    const texto = textoDoLembrete(r);
    for (let k = 0; k < DIAS_DO_PLANO; k++) {
      const dia = somarDias(hoje, k);
      const dow = diaDaSemanaISO(dia);
      if (!r.dias_semana.includes(dow)) continue;
      const at = instante(dia, r.horario);
      if (at.getTime() <= agora.getTime()) continue;
      if (k === 0 && feitaNoDia(feitas, r.id, dia)) continue;
      plano.push({ id: idDoLembrete(p, dow), at, titulo: texto.titulo, corpo: texto.corpo, extra: { rotina_id: r.id, dono, dia, hora: r.horario } });
    }
  }
  return plano.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
}

function extraDe(p: PendenteNoAparelho): Partial<ExtraDoLembrete> {
  return p.extra && typeof p.extra === "object" ? (p.extra as Partial<ExtraDoLembrete>) : {};
}

/**
 * O que o aparelho tem (getPending) × o plano: cancelar = os da faixa fora do plano; agendar = os do plano que faltam ou mudaram (o schedule
 * do mesmo id troca — o plugin cancela o alarme do id antes). Fora da faixa: nunca mexe (treino 2001, timer 1002, consultas 3000–3899).
 * Exceção: a ocorrência que já venceu e ainda está pendente (o alarme inexato pode atrasar uns minutos) FICA se continua valendo — rotina viva,
 * do mesmo dono, mesma hora, no dia dela e não feita —, senão a reconciliação de quem abre o app logo depois da hora mataria o aviso.
 */
export function diferenca(
  pendentes: readonly PendenteNoAparelho[],
  plano: readonly LembreteNoAparelho[],
  ctx: { rotinas: readonly Rotina[]; feitas: readonly RotinaFeita[]; dono: string; agora?: Date },
): { cancelar: number[]; agendar: LembreteNoAparelho[] } {
  const agora = ctx.agora ?? new Date();
  const doPlano = new Map(plano.map((l) => [l.id, l] as [number, LembreteNoAparelho]));
  const comLembrete = new Map(ctx.rotinas.filter((r) => !r.arquivada_em && r.lembrete && r.horario).map((r) => [r.id, r] as [string, Rotina]));
  const cancelar: number[] = [];
  const iguais = new Set<number>();
  for (const p of pendentes) {
    if (!naFaixa(p.id)) continue;
    const x = extraDe(p);
    const l = doPlano.get(p.id);
    if (l) {
      const igual = p.title === l.titulo && p.body === l.corpo && x.rotina_id === l.extra.rotina_id && x.dono === l.extra.dono
        && x.dia === l.extra.dia && x.hora === l.extra.hora;
      if (igual) iguais.add(p.id);
      continue;
    }
    const r = typeof x.rotina_id === "string" ? comLembrete.get(x.rotina_id) : undefined;
    const dia = typeof x.dia === "string" && DIA.test(x.dia) ? x.dia : null;
    const hora = typeof x.hora === "string" && HORA.test(x.hora) ? x.hora : null;
    const venceu = !!dia && !!hora && instante(dia, hora).getTime() <= agora.getTime();
    const vale = !!r && !!dia && x.dono === ctx.dono && r.horario === hora && r.dias_semana.includes(diaDaSemanaISO(dia)) && !feitaNoDia(ctx.feitas, r.id, dia);
    if (venceu && vale) continue;
    cancelar.push(p.id);
  }
  return { cancelar: cancelar.sort((a, b) => a - b), agendar: plano.filter((l) => !iguais.has(l.id)) };
}

export type AcaoDaNotificacao =
  | { tipo: "nao_e_rotina" }
  | { tipo: "ignorar" }
  /** `nome`: o do corpo da notificação (com o app fechado a lista ainda não chegou; o remédio — Q3 — vem sem nome: null) */
  | { tipo: "marcar"; rotina_id: string; dia: string; nome: string | null };

/**
 * O toque e o "Feito" (spec §4.6): de rotina (id na faixa + extra.rotina_id) e deste login → marcar o dia da ocorrência; de outro login (o
 * aparelho de 2 pessoas — revisão I6) ou sem login → ignorar (e ninguém mais trata); o resto (as consultas, o treino) → não é rotina.
 */
export function acaoDaNotificacao(e: unknown, uid: string | null, agora: Date = new Date()): AcaoDaNotificacao {
  const ev = (e && typeof e === "object" ? e : {}) as { actionId?: unknown; notification?: { id?: unknown; title?: unknown; body?: unknown; extra?: unknown } };
  const n = ev.notification && typeof ev.notification === "object" ? ev.notification : {};
  const x = (n.extra && typeof n.extra === "object" ? n.extra : {}) as Partial<ExtraDoLembrete>;
  if (!naFaixa(n.id) || typeof x.rotina_id !== "string") return { tipo: "nao_e_rotina" };
  if (!uid || x.dono !== uid) return { tipo: "ignorar" };
  if (ev.actionId !== ACAO_FEITO && ev.actionId !== ACAO_TOQUE) return { tipo: "ignorar" };
  const nome = n.title === TITULO_DO_LEMBRETE && typeof n.body === "string" ? n.body.split(" · ")[0].trim() || null : null;
  return { tipo: "marcar", rotina_id: x.rotina_id, dia: typeof x.dia === "string" && DIA.test(x.dia) ? x.dia : hojeSP(agora), nome };
}

export const chaveDoAvisoNoSite = (rotina: string, dia: string): string => `${rotina}|${dia}`;

/** Site (a página aberta): as rotinas com lembrete que venceram há menos de 10 min, no dia delas, não feitas hoje e ainda não avisadas nesta aba. */
export function rotinasParaAvisarNoSite(
  rotinas: readonly Rotina[],
  feitas: readonly RotinaFeita[],
  avisadas: ReadonlySet<string>,
  agora: Date = new Date(),
): Rotina[] {
  const hoje = hojeSP(agora);
  const dow = diaDaSemanaISO(hoje);
  const t = agora.getTime();
  return rotinas
    .filter((r) => {
      if (r.arquivada_em || !r.lembrete || !r.horario || !HORA.test(r.horario) || !r.dias_semana.includes(dow)) return false;
      if (feitaNoDia(feitas, r.id, hoje) || avisadas.has(chaveDoAvisoNoSite(r.id, hoje))) return false;
      const hora = instante(hoje, r.horario).getTime();
      return t >= hora && t < hora + JANELA_DO_SITE_MS;
    })
    .sort((a, b) => (a.horario ?? "").localeCompare(b.horario ?? "") || a.criada_em.localeCompare(b.criada_em));
}

/**
 * A casca desmonta os avisos globais quando o login sai (src/App.tsx: `usuario && <AvisosGlobais />`): se, nessa hora, o login guardado no
 * aparelho já não é o de quem estava montado (Sair, trocar de conta, excluir a conta), a faixa inteira é esvaziada. Mesmo login guardado
 * (o aviso só remontou — a porta do aceite, o limite de erro) = nada.
 */
export const deveLimparAoDesmontar = (uidMontado: string | null, loginGuardado: string | null): boolean => !!uidMontado && loginGuardado !== uidMontado;
```

- [ ] **Step 3: Commit** — `feat(w-a): o plano dos lembretes das rotinas (as avulsas dos próximos 7 dias, faixa 40000–40299, a diferença com o getPending, o toque, o site, o Sair) e os textos (Q3/Q4)`
  com os 3 arquivos; `feita.sh 2 "plano dos lembretes 19/19" "<placar>"`.

---

### Task 3: As regras da tela — `src/rotinas/regras.ts` (TDD)

**Files:** Create `src/rotinas/regras.ts`, `src/rotinas/regras.test.ts`.
**Estimativa:** 15 min (calibrado 3–4).

- [ ] **Step 1: O teste (vermelho)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/regras.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/regras.test.ts`
  → FAIL `Failed to resolve import "./regras"`.

`src/rotinas/regras.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { RotinaDoDia } from "@/aluno-dia/regras";
import type { MinhasRotinas, Rotina } from "@/aluno-dia/tipos";
import { matricula, situacao } from "@/test/fixturesNucleo";
import {
  alternarDia, atalhoDosDias, comFeita, dadosDoFormulario, ehAlunoDasRotinas, formularioDe, linhaDaRotina, noLimite, proximasDoDia, validarFormulario,
  type FormularioDaRotina,
} from "./regras";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "r1", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});
const doDia = (id: string, horario: string, feita: boolean): RotinaDoDia => ({ ...rotina({ id, horario }), feita, feita_em: feita ? "2026-09-30T10:00:00Z" : null });
const form = (o: Partial<FormularioDaRotina> = {}): FormularioDaRotina => ({ ...formularioDe(null), nome: "Creatina", ...o });

describe("W-A P3 — quem tem rotinas e o ✓ otimista", () => {
  it("todo login com matrícula (inclusive o aluno do app sem profissional — P9); sem matrícula ou sem situação, não", () => {
    expect(ehAlunoDasRotinas(situacao({ matriculas: [matricula()] }))).toBe(true);
    expect(ehAlunoDasRotinas(situacao({ matriculas: [matricula({ app: true, personal: null })] }))).toBe(true);
    expect(ehAlunoDasRotinas(situacao({ matriculas: [] }))).toBe(false);
    expect(ehAlunoDasRotinas(null)).toBe(false);
  });

  it("comFeita põe e tira o ✓ só daquele dia e daquela rotina (o resto fica igual)", () => {
    const d: MinhasRotinas = { hoje: "2026-09-30", rotinas: [rotina()], feitas: [{ rotina_id: "r1", dia: "2026-09-29", feita_em: "x" }] };
    const com = comFeita(d, "r1", "2026-09-30", true, new Date("2026-09-30T13:00:00Z"));
    expect(com.feitas).toEqual([{ rotina_id: "r1", dia: "2026-09-29", feita_em: "x" }, { rotina_id: "r1", dia: "2026-09-30", feita_em: "2026-09-30T13:00:00.000Z" }]);
    expect(comFeita(com, "r1", "2026-09-30", false).feitas).toEqual([{ rotina_id: "r1", dia: "2026-09-29", feita_em: "x" }]);
    expect(com.rotinas).toBe(d.rotinas);
  });

  it("o limite: 30 vivas (as arquivadas não contam)", () => {
    const trinta = Array.from({ length: 30 }, (_, i) => rotina({ id: `r${i}` }));
    expect(noLimite(trinta)).toBe(true);
    expect(noLimite([...trinta.slice(1), rotina({ id: "x", arquivada_em: "2026-09-01T00:00:00Z" })])).toBe(false);
  });
});

describe("W-A P3 — o card: até 4, primeiro as que faltam", () => {
  it("6 do dia (2 feitas) → as 4 que faltam pela hora e o +2", () => {
    const lista = [doDia("a", "07:00", true), doDia("b", "08:00", false), doDia("c", "09:00", false), doDia("d", "12:00", true), doDia("e", "18:00", false),
      doDia("f", "22:00", false)];
    const { visiveis, resto } = proximasDoDia(lista);
    expect(visiveis.map((r) => r.id)).toEqual(["b", "c", "e", "f"]);
    expect(resto).toBe(2);
  });

  it("3 do dia → todas, sem o +N; as feitas por último", () => {
    const { visiveis, resto } = proximasDoDia([doDia("a", "07:00", true), doDia("b", "08:00", false), doDia("c", "09:00", false)]);
    expect(visiveis.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(resto).toBe(0);
  });

  it("a linha de baixo da página: o detalhe e os dias", () => {
    expect(linhaDaRotina(rotina({ dias_semana: [1, 2, 3, 4, 5] }))).toBe("5 g · Seg a Sex");
    expect(linhaDaRotina(rotina({ detalhe: null, dias_semana: [1, 3] }))).toBe("Seg e Qua");
  });
});

describe("W-A P3 — o formulário da folha (a forma do banco antes da função)", () => {
  it("nova: tipo suplemento, todos os dias, sem horário e sem lembrete; de uma rotina: os campos dela", () => {
    expect(formularioDe(null)).toEqual({ nome: "", detalhe: "", tipo: "suplemento", horario: "", dias: [1, 2, 3, 4, 5, 6, 7], lembrete: false });
    expect(formularioDe(rotina({ detalhe: null, dias_semana: [5, 1] }))).toEqual({ nome: "Creatina", detalhe: "", tipo: "suplemento", horario: "08:00",
      dias: [1, 5], lembrete: true });
  });

  it("recusa: sem nome, nome > 60, detalhe > 120, hora inválida, nenhum dia, lembrete sem horário — cada um no campo dele", () => {
    expect(validarFormulario(form({ nome: "   " }))).toEqual({ campo: "nome", mensagem: "Dê um nome à rotina." });
    expect(validarFormulario(form({ nome: "x".repeat(61) }))?.campo).toBe("nome");
    expect(validarFormulario(form({ nome: `  ${"x".repeat(60)}  ` }))).toBeNull();
    expect(validarFormulario(form({ detalhe: "y".repeat(121) }))?.campo).toBe("detalhe");
    expect(validarFormulario(form({ horario: "25:00" }))?.campo).toBe("horario");
    expect(validarFormulario(form({ dias: [] }))?.campo).toBe("dias");
    expect(validarFormulario(form({ lembrete: true, horario: "" }))).toEqual({ campo: "lembrete", mensagem: "Escolha um horário para ligar o lembrete." });
    expect(validarFormulario(form({ lembrete: true, horario: "08:00" }))).toBeNull();
  });

  it("os dados da função: aparados, detalhe vazio = null, sem horário = null, dias em ordem sem repetir, lembrete só com horário", () => {
    expect(dadosDoFormulario(form({ nome: "  Creatina   pura ", detalhe: "   ", horario: "", dias: [7, 1, 1], lembrete: true }))).toEqual({
      nome: "Creatina pura", detalhe: null, tipo: "suplemento", horario: null, dias_semana: [1, 7], lembrete: false,
    });
    expect(dadosDoFormulario(form({ tipo: "remedio", detalhe: "1 comprimido", horario: "20:00", lembrete: true }))).toEqual({
      nome: "Creatina", detalhe: "1 comprimido", tipo: "remedio", horario: "20:00", dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: true,
    });
  });

  it("os dias: liga/desliga um, e os atalhos das metas", () => {
    expect(alternarDia([1, 2, 3], 2)).toEqual([1, 3]);
    expect(alternarDia([3, 1], 2)).toEqual([1, 2, 3]);
    expect(atalhoDosDias([1, 2, 3, 4, 5, 6, 7])).toBe("todos");
    expect(atalhoDosDias([5, 4, 3, 2, 1])).toBe("semana");
    expect(atalhoDosDias([6, 7])).toBe("fim");
    expect(atalhoDosDias([1, 3])).toBeNull();
  });
});
```

- [ ] **Step 2: As regras (verde)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/regras.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/regras.test.ts`
  → `Tests 10 passed (10)`.

`src/rotinas/regras.ts`:
```ts
// Physiq W-A P3 — regras PURAS da tela das rotinas (o card do Início, a página /perfil/rotinas e a folha — a P5 e a P6 importam daqui):
// quem tem rotinas, o ✓ otimista, a ordem do card, o formulário (validar e montar os dados da função) e os dias da semana. Testado em
// regras.test.ts. Os limites são os do banco (wa_rotina_campos / _shared/aluno-dia-regras.ts): nome 1–60, detalhe ≤ 120, "HH:MM", dias 1–7.
import type { RotinaDoDia } from "@/aluno-dia/regras";
import type { DadosDaRotina, MinhasRotinas, Rotina, TipoDeRotina } from "@/aluno-dia/tipos";
import { ATALHOS_DIAS, TODOS_OS_DIAS, mesmosDias, normalizarDias, textoDias, type AtalhoDias } from "@/nutricao/app/metasUtil";
import type { Situacao } from "@/nucleo/situacao";
import { MAX_ROTINAS_VIVAS } from "./lembretes";
import { TEXTOS } from "./textos";

export const ROTA_ROTINAS = "/perfil/rotinas";
/** O card do Início (e a seção da Dieta, P5): até 4 + "+N" (spec §4.3). */
export const NO_CARD = 4;

/** Quem tem rotinas: o login com alguma matrícula (a regra do meu_paciente_id da rotina_salvar — inclusive o aluno do app sem profissional, P9). */
export const ehAlunoDasRotinas = (s: Situacao | null | undefined): boolean => (s?.matriculas ?? []).length > 0;

export const vivas = (rotinas: readonly Rotina[]): Rotina[] => rotinas.filter((r) => !r.arquivada_em);
export const noLimite = (rotinas: readonly Rotina[]): boolean => vivas(rotinas).length >= MAX_ROTINAS_VIVAS;

/** O ✓ otimista: a lista das feitas com (ou sem) a do dia — o resto igual. */
export function comFeita<T extends MinhasRotinas>(d: T, rotina: string, dia: string, feita: boolean, agora: Date = new Date()): T {
  const sem = d.feitas.filter((f) => !(f.rotina_id === rotina && f.dia === dia));
  return { ...d, feitas: feita ? [...sem, { rotina_id: rotina, dia, feita_em: agora.toISOString() }] : sem };
}

/** O card: primeiro as que faltam (pela hora), depois as feitas; até `limite` e o "+N" do resto. */
export function proximasDoDia(doDia: readonly RotinaDoDia[], limite = NO_CARD): { visiveis: RotinaDoDia[]; resto: number } {
  const ordem = [...doDia.filter((r) => !r.feita), ...doDia.filter((r) => r.feita)];
  return { visiveis: ordem.slice(0, limite), resto: Math.max(0, ordem.length - limite) };
}

/** "5 g · Seg a Sex" (a linha de baixo da página). */
export const linhaDaRotina = (r: Pick<Rotina, "detalhe" | "dias_semana">): string => [r.detalhe, textoDias(r.dias_semana)].filter(Boolean).join(" · ");

// ───────────────────────── o formulário da folha ─────────────────────────
export interface FormularioDaRotina {
  nome: string;
  detalhe: string;
  tipo: TipoDeRotina;
  /** "HH:MM" ou "" (sem horário) */
  horario: string;
  dias: number[];
  lembrete: boolean;
}

export type CampoDaRotina = "nome" | "detalhe" | "horario" | "dias" | "lembrete";
export interface ErroDoFormulario {
  campo?: CampoDaRotina;
  mensagem: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const aparado = (s: string): string => s.trim().replace(/\s+/g, " ");

export function formularioDe(r: Rotina | null): FormularioDaRotina {
  if (!r) return { nome: "", detalhe: "", tipo: "suplemento", horario: "", dias: [...TODOS_OS_DIAS], lembrete: false };
  return { nome: r.nome, detalhe: r.detalhe ?? "", tipo: r.tipo, horario: r.horario ?? "", dias: normalizarDias(r.dias_semana), lembrete: r.lembrete };
}

/** A forma antes de chamar a função (a mesma do banco); null = pode salvar. */
export function validarFormulario(f: FormularioDaRotina): ErroDoFormulario | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome à rotina." };
  if (nome.length > 60) return { campo: "nome", mensagem: "O nome vai até 60 letras." };
  if (aparado(f.detalhe).length > 120) return { campo: "detalhe", mensagem: "O detalhe vai até 120 letras." };
  if (f.horario && !HORA.test(f.horario)) return { campo: "horario", mensagem: "Escolha um horário válido." };
  if (normalizarDias(f.dias).length === 0) return { campo: "dias", mensagem: "Escolha pelo menos 1 dia." };
  if (f.lembrete && !f.horario) return { campo: "lembrete", mensagem: TEXTOS.lembreteSemHorario };
  return null;
}

/** Os dados que a função aluno-dia aceita (rotina_salvar / prof_rotina_salvar): todos os campos (o banco grava só o que mudou no histórico). */
export function dadosDoFormulario(f: FormularioDaRotina): DadosDaRotina {
  const detalhe = aparado(f.detalhe);
  return {
    nome: aparado(f.nome),
    detalhe: detalhe || null,
    tipo: f.tipo,
    horario: f.horario || null,
    dias_semana: normalizarDias(f.dias),
    lembrete: f.lembrete && !!f.horario,
  };
}

/** Liga/desliga um dia (a ordem é a da semana). */
export function alternarDia(dias: readonly number[], n: number): number[] {
  const d = normalizarDias(dias);
  return d.includes(n) ? d.filter((x) => x !== n) : normalizarDias([...d, n]);
}

/** O atalho que os dias formam ("Todos os dias", "Seg a Sex", "Fim de semana"), ou null. */
export function atalhoDosDias(dias: readonly number[]): AtalhoDias | null {
  return ATALHOS_DIAS.find((a) => mesmosDias(a.dias, dias))?.atalho ?? null;
}
```

- [ ] **Step 3: Commit** — `feat(w-a): as regras da tela das rotinas (quem tem, o ✓ otimista, a ordem do card, o formulário, os dias)` com os 2 arquivos;
  `feita.sh 3 "regras da tela 10/10" "<placar>"`.

---

### Task 4: Os lembretes no aparelho — `src/rotinas/aparelho.ts` (TDD)

**Files:** Create `src/rotinas/aparelho.ts`, `src/rotinas/aparelho.test.ts`.
**Estimativa:** 20 min (calibrado 3–5).

- [ ] **Step 1: O teste (vermelho)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/aparelho.test.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/aparelho.test.ts`
  → FAIL `Failed to resolve import "./aparelho"`.

`src/rotinas/aparelho.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";

const h = vi.hoisted(() => ({
  nativo: true,
  plataforma: "android",
  pendentes: [] as { id: number; title?: string; body?: string; extra?: unknown }[],
  naBandeja: [] as { id: number }[],
  permissao: "granted",
  exato: "granted",
  LN: {
    getPending: vi.fn(),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async (_pedido: unknown) => ({ notifications: [] as unknown[] })),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(async () => {}),
    registerActionTypes: vi.fn(async () => {}),
    getDeliveredNotifications: vi.fn(),
    removeDeliveredNotifications: vi.fn(async () => {}),
    checkExactNotificationSetting: vi.fn(),
    changeExactNotificationSetting: vi.fn(),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => h.plataforma } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: h.LN }));

import { PRINCIPAL_STORAGE_KEY } from "@/integrations/principal/client";
import { instante } from "./lembretes";
import {
  _zerarAparelho, alarmeExato, gravarAvisadasNoSite, lerAvisadasNoSite, limparLembretesDoAparelho, loginGuardadoNoAparelho, permissaoDosLembretes,
  reconciliarLembretes,
} from "./aparelho";

const AGORA = instante("2026-09-30", "09:30");
const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "cre", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "10:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});
const agendados = (): Record<string, unknown>[] => {
  const chamadas = h.LN.schedule.mock.calls;
  return (chamadas[chamadas.length - 1]?.[0] as { notifications: Record<string, unknown>[] } | undefined)?.notifications ?? [];
};

beforeEach(() => {
  _zerarAparelho();
  h.nativo = true;
  h.plataforma = "android";
  h.pendentes = [];
  h.naBandeja = [];
  h.permissao = "granted";
  h.exato = "granted";
  for (const f of Object.values(h.LN)) f.mockClear();
  h.LN.getPending.mockImplementation(async () => ({ notifications: h.pendentes }));
  h.LN.checkPermissions.mockImplementation(async () => ({ display: h.permissao }));
  h.LN.requestPermissions.mockImplementation(async () => ({ display: "granted" }));
  h.LN.getDeliveredNotifications.mockImplementation(async () => ({ notifications: h.naBandeja }));
  h.LN.checkExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: h.exato }));
  localStorage.clear();
  sessionStorage.clear();
});

describe("W-A P3 — os lembretes no aparelho (APK)", () => {
  it("sem nada agendado: 7 avulsas (at + allowWhileIdle, SEM every), no canal privado, com o 'Feito'; canal e ação preparados 1 vez", async () => {
    const r = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(r).toEqual({ motivo: "ok", agendados: 7, cancelados: 0, mantidos: 0 });
    const n = agendados();
    expect(n).toHaveLength(7);
    expect(n[0]).toMatchObject({ id: 40003, title: "Hora da rotina", body: "Creatina · 5 g", channelId: "rotinas-v1", actionTypeId: "ROTINA",
      extra: { rotina_id: "cre", dono: "u1", dia: "2026-09-30", hora: "10:00" } });
    for (const x of n) {
      expect(x.schedule).toEqual({ at: expect.any(Date), allowWhileIdle: true });
      expect(x.schedule).not.toHaveProperty("every");
      expect(x.schedule).not.toHaveProperty("on");
    }
    expect(h.LN.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: "rotinas-v1", visibility: 0, importance: 4 }));
    expect(h.LN.registerActionTypes).toHaveBeenCalledWith({ types: [{ id: "ROTINA", actions: [{ id: "feito", title: "Feito" }] }] });
    h.pendentes = n.map((x) => ({ id: x.id as number, title: x.title as string, body: x.body as string, extra: x.extra }));
    const de_novo = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(de_novo).toEqual({ motivo: "ok", agendados: 0, cancelados: 0, mantidos: 7 });
    expect(h.LN.createChannel).toHaveBeenCalledTimes(1);
  });

  it("marcou hoje antes da hora → cancela a de hoje (40003) e não agenda nada; desmarcou → volta a agendar", async () => {
    await reconciliarLembretes([rotina()], [], "u1", AGORA);
    h.pendentes = agendados().map((x) => ({ id: x.id as number, title: x.title as string, body: x.body as string, extra: x.extra }));
    h.LN.schedule.mockClear();
    const feita = await reconciliarLembretes([rotina()], [{ rotina_id: "cre", dia: "2026-09-30", feita_em: "x" }], "u1", AGORA);
    expect(feita).toEqual({ motivo: "ok", agendados: 0, cancelados: 1, mantidos: 6 });
    expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40003 }] });
    h.pendentes = h.pendentes.filter((p) => p.id !== 40003);
    const desfez = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(desfez.agendados).toBe(1);
    expect(agendados().map((x) => x.id)).toEqual([40003]);
  });

  it("sem a permissão de notificação: só cancela (nada é agendado); a do treino (2001) nunca é tocada", async () => {
    h.permissao = "denied";
    h.pendentes = [{ id: 2001, title: "Physiq — Hora do treino!", body: "x" }, { id: 40015, title: "Hora da rotina", body: "Velha", extra: { rotina_id: "x", dono: "u1", dia: "2026-10-01", hora: "07:00" } }];
    const r = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(r.motivo).toBe("sem_permissao");
    expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40015 }] });
    expect(h.LN.schedule).not.toHaveBeenCalled();
  });

  it("Sair: esvazia a faixa (as pendentes e as da bandeja) e só ela", async () => {
    h.pendentes = [{ id: 2001, title: "t", body: "b" }, { id: 3123, title: "t", body: "b" }, { id: 40003, title: "t", body: "b" }, { id: 40297, title: "t", body: "b" }];
    h.naBandeja = [{ id: 40011 }, { id: 3001 }];
    expect(await limparLembretesDoAparelho()).toBe(2);
    expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40003 }, { id: 40297 }] });
    expect(h.LN.removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [{ id: 40011 }] });
  });

  it("um erro do plugin não derruba a tela (motivo 'erro'); reconciliações seguidas vão uma por vez", async () => {
    h.LN.getPending.mockRejectedValueOnce(new Error("plugin"));
    expect((await reconciliarLembretes([rotina()], [], "u1", AGORA)).motivo).toBe("erro");
    const [a, b] = await Promise.all([reconciliarLembretes([rotina()], [], "u1", AGORA), reconciliarLembretes([rotina()], [], "u1", AGORA)]);
    expect([a.motivo, b.motivo]).toEqual(["ok", "ok"]);
  });

  it("as permissões: ligada / bloqueada; 'Alarmes e lembretes' ligado ou desligado (só Android)", async () => {
    expect(await permissaoDosLembretes()).toBe("ligada");
    h.permissao = "denied";
    expect(await permissaoDosLembretes()).toBe("bloqueada");
    h.permissao = "prompt";
    expect(await permissaoDosLembretes()).toBe("perguntar");
    expect(await alarmeExato()).toBe("ligado");
    h.exato = "denied";
    expect(await alarmeExato()).toBe("desligado");
    h.plataforma = "ios";
    expect(await alarmeExato()).toBe("sem_suporte");
  });
});

describe("W-A P3 — o site e o login guardado", () => {
  it("no site, reconciliar e limpar não chamam o plugin", async () => {
    h.nativo = false;
    expect(await reconciliarLembretes([rotina()], [], "u1", AGORA)).toEqual({ motivo: "site", agendados: 0, cancelados: 0, mantidos: 0 });
    expect(await limparLembretesDoAparelho()).toBe(0);
    expect(h.LN.getPending).not.toHaveBeenCalled();
  });

  it("o login guardado sai do armazenamento do principal (sem chamar o Auth); sem nada ou estragado → null", () => {
    expect(loginGuardadoNoAparelho()).toBeNull();
    localStorage.setItem(PRINCIPAL_STORAGE_KEY, JSON.stringify({ access_token: "x", user: { id: "u1" } }));
    expect(loginGuardadoNoAparelho()).toBe("u1");
    localStorage.setItem(PRINCIPAL_STORAGE_KEY, JSON.stringify({ currentSession: { user: { id: "u2" } } }));
    expect(loginGuardadoNoAparelho()).toBe("u2");
    localStorage.setItem(PRINCIPAL_STORAGE_KEY, "{quebrado");
    expect(loginGuardadoNoAparelho()).toBeNull();
  });

  it("o que já foi avisado nesta aba (sessionStorage, as 100 últimas)", () => {
    expect(lerAvisadasNoSite().size).toBe(0);
    gravarAvisadasNoSite(Array.from({ length: 120 }, (_, i) => `r${i}|2026-09-30`));
    const lidas = lerAvisadasNoSite();
    expect(lidas.size).toBe(100);
    expect(lidas.has("r119|2026-09-30") && !lidas.has("r0|2026-09-30")).toBe(true);
  });
});
```

- [ ] **Step 2: O aparelho (verde)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/aparelho.ts && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/aparelho.test.ts`
  → `Tests 9 passed (9)`.

`src/rotinas/aparelho.ts`:
```ts
// Physiq W-A P3 — os lembretes das rotinas NO APARELHO (o lado com efeito; o plano é o lembretes.ts, puro). APK: a notificação local do
// @capacitor/local-notifications 8.0.2 — o canal "rotinas-v1" PRIVADO (visibility 0: a tela bloqueada não mostra o conteúdo — revisão I6), o
// botão "Feito" (registerActionTypes antes de agendar), o plano reconciliado com o que já está agendado (getPending → cancelar/agendar só a
// diferença, uma reconciliação por vez) e o "Sair" que esvazia a faixa 40000–40299 (as pendentes e as que estão na bandeja). Site: o que já
// foi avisado nesta aba (sessionStorage) e a notificação do navegador SÓ se ela já estiver permitida (spec §4.6). Sem rede: quem lê as
// rotinas é o useRotinas (a função aluno-dia). Nunca o nome de uma rotina num log.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Rotina, RotinaFeita } from "@/aluno-dia/tipos";
import { PRINCIPAL_STORAGE_KEY } from "@/integrations/principal/client";
import { ACAO_FEITO, CANAL_ROTINAS, TIPO_DE_ACAO, diferenca, naFaixa, planoDosLembretes, type LembreteNoAparelho } from "./lembretes";
import { ROTULO_FEITO } from "./textos";

export const nativo = (): boolean => Capacitor.isNativePlatform();

let preparado = false;
let fila: Promise<unknown> = Promise.resolve();

/** Uma coisa por vez no plugin (a reconciliação do Início e a da página não se cruzam). */
function naFila<T>(fazer: () => Promise<T>): Promise<T> {
  const vez = fila.then(fazer, fazer);
  fila = vez.catch(() => undefined);
  return vez;
}

async function preparar(): Promise<void> {
  if (preparado) return;
  await LocalNotifications.createChannel({
    id: CANAL_ROTINAS, name: "Rotinas e lembretes", description: "Os lembretes das suas rotinas", importance: 4, visibility: 0, vibration: true,
  });
  await LocalNotifications.registerActionTypes({ types: [{ id: TIPO_DE_ACAO, actions: [{ id: ACAO_FEITO, title: ROTULO_FEITO }] }] });
  preparado = true;
}

function paraOPlugin(l: LembreteNoAparelho) {
  return {
    id: l.id, title: l.titulo, body: l.corpo, channelId: CANAL_ROTINAS, smallIcon: "ic_launcher", actionTypeId: TIPO_DE_ACAO,
    schedule: { at: l.at, allowWhileIdle: true }, extra: { ...l.extra },
  };
}

export interface Reconciliacao {
  motivo: "ok" | "site" | "sem_permissao" | "erro";
  agendados: number;
  cancelados: number;
  /** os do plano que já estavam agendados iguais */
  mantidos: number;
}

/** Replaneja os lembretes deste aparelho para `dono` (APK; no site não faz nada). Sem a permissão de notificação: só cancela. */
export function reconciliarLembretes(rotinas: readonly Rotina[], feitas: readonly RotinaFeita[], dono: string, agora: Date = new Date()): Promise<Reconciliacao> {
  if (!nativo()) return Promise.resolve({ motivo: "site", agendados: 0, cancelados: 0, mantidos: 0 });
  return naFila(async (): Promise<Reconciliacao> => {
    try {
      const { notifications } = await LocalNotifications.getPending();
      const plano = planoDosLembretes(rotinas, feitas, dono, agora);
      const { cancelar, agendar } = diferenca(notifications, plano, { rotinas, feitas, dono, agora });
      if (cancelar.length) await LocalNotifications.cancel({ notifications: cancelar.map((id) => ({ id })) });
      const mantidos = plano.length - agendar.length;
      if ((await LocalNotifications.checkPermissions()).display !== "granted") {
        return { motivo: "sem_permissao", agendados: 0, cancelados: cancelar.length, mantidos };
      }
      if (agendar.length) {
        await preparar();
        await LocalNotifications.schedule({ notifications: agendar.map(paraOPlugin) });
      }
      return { motivo: "ok", agendados: agendar.length, cancelados: cancelar.length, mantidos };
    } catch {
      return { motivo: "erro", agendados: 0, cancelados: 0, mantidos: 0 };
    }
  });
}

/** Esvazia a faixa das rotinas neste aparelho (as pendentes e as que estão na bandeja): o "Sair", a troca de conta e a exclusão. */
export function limparLembretesDoAparelho(): Promise<number> {
  if (!nativo()) return Promise.resolve(0);
  return naFila(async () => {
    try {
      const { notifications } = await LocalNotifications.getPending();
      const ids = notifications.map((n) => n.id).filter(naFaixa);
      if (ids.length) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      const naBandeja = (await LocalNotifications.getDeliveredNotifications()).notifications.filter((n) => naFaixa(n.id));
      if (naBandeja.length) await LocalNotifications.removeDeliveredNotifications({ notifications: naBandeja });
      return ids.length;
    } catch {
      return 0;
    }
  });
}

// ───────────────────────── permissões ─────────────────────────
export type PermissaoDosLembretes = "ligada" | "perguntar" | "bloqueada" | "sem_suporte";
const daPermissao = (estado: string): PermissaoDosLembretes => (estado === "granted" ? "ligada" : estado === "denied" ? "bloqueada" : "perguntar");

export async function permissaoDosLembretes(): Promise<PermissaoDosLembretes> {
  try {
    if (nativo()) return daPermissao((await LocalNotifications.checkPermissions()).display);
    if (typeof window !== "undefined" && "Notification" in window) return daPermissao(Notification.permission);
  } catch {
    /* sem suporte */
  }
  return "sem_suporte";
}

/** APK: pede a permissão (no 1º lembrete ligado — spec §5.4). O site não pede: o aviso do navegador só vale se já estiver permitido. */
export async function pedirPermissaoDosLembretes(): Promise<PermissaoDosLembretes> {
  if (nativo()) {
    try {
      return daPermissao((await LocalNotifications.requestPermissions()).display);
    } catch {
      /* cai na leitura */
    }
  }
  return permissaoDosLembretes();
}

export type AlarmeExato = "ligado" | "desligado" | "sem_suporte";

/** Android 12+: "Alarmes e lembretes" (SCHEDULE_EXACT_ALARM; no 14+ não vem dado — risco 1). Desligado = o lembrete pode atrasar. */
export async function alarmeExato(): Promise<AlarmeExato> {
  if (!nativo() || Capacitor.getPlatform() !== "android") return "sem_suporte";
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted" ? "ligado" : "desligado";
  } catch {
    return "sem_suporte";
  }
}

/** Abre o ajuste "Alarmes e lembretes" do Physiq (e devolve como ficou). */
export async function abrirAjusteDoAlarmeExato(): Promise<AlarmeExato> {
  if (!nativo() || Capacitor.getPlatform() !== "android") return "sem_suporte";
  try {
    return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === "granted" ? "ligado" : "desligado";
  } catch {
    return alarmeExato();
  }
}

// ───────────────────────── o login guardado e o site ─────────────────────────
/** O login guardado neste aparelho (o do principal), lido do armazenamento — sem chamar o Auth (a guarda do navegador da hml-21). */
export function loginGuardadoNoAparelho(): string | null {
  try {
    const bruto = localStorage.getItem(PRINCIPAL_STORAGE_KEY);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as { user?: { id?: unknown }; currentSession?: { user?: { id?: unknown } } };
    const id = s?.user?.id ?? s?.currentSession?.user?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

const CHAVE_DO_SITE = "physiq_rotinas_avisadas";

export function lerAvisadasNoSite(): Set<string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE_DO_SITE) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function gravarAvisadasNoSite(chaves: Iterable<string>): void {
  try {
    sessionStorage.setItem(CHAVE_DO_SITE, JSON.stringify([...chaves].slice(-100)));
  } catch {
    /* sem armazenamento: avisa de novo se a aba recarregar */
  }
}

/** A notificação do navegador, SÓ se já estiver permitida (o site não pede — spec §4.6). */
export function notificarNoNavegador(tag: string, titulo: string, corpo: string): boolean {
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(titulo, { body: corpo, icon: "/icon-192.png", tag });
      return true;
    }
  } catch {
    /* sem suporte */
  }
  return false;
}

/** Só os testes: esquece o canal/ação já preparados e a fila. */
export function _zerarAparelho(): void {
  preparado = false;
  fila = Promise.resolve();
}
```

- [ ] **Step 3: Commit** — `feat(w-a): os lembretes no aparelho (o canal privado, o "Feito", a reconciliação com o getPending, o Sair que esvazia a faixa, as permissões e o alarme exato)`
  com os 2 arquivos; `feita.sh 4 "aparelho 9/9" "<placar>"`.

---

### Task 5: A consulta, os dias, a lista de hoje e a folha (TDD)

**Files:** Create `src/rotinas/useRotinas.ts`, `src/rotinas/ui/DiasDaSemana.tsx`, `src/rotinas/ui/RotinasDeHoje.tsx`, `src/rotinas/ui/FolhaRotina.tsx`,
`src/rotinas/ui/FolhaRotina.test.tsx`.
**Estimativa:** 35 min (calibrado 5–8).

- [ ] **Step 1: O teste da folha (vermelho)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/ui/FolhaRotina.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/ui/FolhaRotina.test.tsx`
  → FAIL `Failed to resolve import "./FolhaRotina"`.

`src/rotinas/ui/FolhaRotina.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({
  salvar: vi.fn(),
  arquivar: vi.fn(),
  profSalvar: vi.fn(),
  profArquivar: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  salvarRotina: (...a: unknown[]) => h.salvar(...a),
  arquivarRotina: (...a: unknown[]) => h.arquivar(...a),
  profSalvarRotina: (...a: unknown[]) => h.profSalvar(...a),
  profArquivarRotina: (...a: unknown[]) => h.profArquivar(...a),
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { ErroAlunoDia } from "@/aluno-dia/api";
import { FolhaRotina, type ModoDaFolha } from "./FolhaRotina";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "r1", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});

function abrir(modo: ModoDaFolha = { tipo: "aluno" }, r: Rotina | null = null) {
  const aoMudar = vi.fn();
  const aoSalvo = vi.fn();
  const aoApagado = vi.fn();
  render(
    <ProvedorConfirmar>
      <FolhaRotina aberta aoMudar={aoMudar} modo={modo} rotina={r} aoSalvo={aoSalvo} aoApagado={aoApagado} />
    </ProvedorConfirmar>,
  );
  return { aoMudar, aoSalvo, aoApagado };
}
// o erro do campo fica DENTRO do <label> (src/entrada/pecas/Campo.tsx): o rótulo é o começo do texto
const campo = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo.replace(/[()]/g, "\\$&")}`)) as HTMLInputElement;

beforeEach(() => {
  for (const f of [h.salvar, h.arquivar, h.profSalvar, h.profArquivar, h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.salvar.mockImplementation(async (_id: string | null, dados: Record<string, unknown>) => ({ ok: true, rotina: rotina({ id: "nova", ...dados }) }));
  h.profSalvar.mockImplementation(async (_a: string, _id: string | null, dados: Record<string, unknown>) => ({ ok: true, rotina: rotina({ id: "p1", origem: "profissional", ...dados }) }));
  h.arquivar.mockResolvedValue({ ok: true });
  h.profArquivar.mockResolvedValue({ ok: true });
});

describe("W-A P3 — a folha da rotina", () => {
  it("nova (aluno): nome, detalhe, tipo, horário, 'Seg a Sex' e o lembrete → a função com os dados certos; fecha e avisa", async () => {
    const { aoMudar, aoSalvo } = abrir();
    expect(screen.getByRole("switch", { name: "Lembrete" })).toBeDisabled();
    expect(screen.getByText("Escolha um horário para ligar o lembrete.")).toBeInTheDocument();
    fireEvent.change(campo("Nome"), { target: { value: " Losartana " } });
    fireEvent.change(campo("Detalhe (opcional)"), { target: { value: "50 mg" } });
    fireEvent.click(screen.getByRole("radio", { name: "Remédio" }));
    fireEvent.change(campo("Horário (opcional)"), { target: { value: "20:00" } });
    fireEvent.click(document.querySelector('[data-rotina-atalho="semana"]')!);
    fireEvent.click(screen.getByRole("switch", { name: "Lembrete" }));
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith(null, {
      nome: "Losartana", detalhe: "50 mg", tipo: "remedio", horario: "20:00", dias_semana: [1, 2, 3, 4, 5], lembrete: true,
    }));
    await waitFor(() => expect(aoSalvo).toHaveBeenCalledWith(expect.objectContaining({ id: "nova" }), true));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(h.toast.success).toHaveBeenCalledWith("Rotina criada.");
  });

  it("sem nome: o erro no campo e NENHUMA chamada; sem dia nenhum: o erro dos dias", async () => {
    abrir();
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    expect(await screen.findByText("Dê um nome à rotina.")).toBeInTheDocument();
    fireEvent.change(campo("Nome"), { target: { value: "Água" } });
    for (const d of [1, 2, 3, 4, 5, 6, 7]) fireEvent.click(document.querySelector(`[data-rotina-dia="${d}"]`)!);
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    expect(await screen.findByText("Escolha pelo menos 1 dia.")).toBeInTheDocument();
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it("tirar o horário desliga o lembrete (lembrete só com horário)", () => {
    abrir({ tipo: "aluno" }, rotina());
    expect(screen.getByRole("switch", { name: "Lembrete" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(campo("Horário (opcional)"), { target: { value: "" } });
    expect(screen.getByRole("switch", { name: "Lembrete" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Lembrete" })).toBeDisabled();
  });

  it("a do profissional, no app do aluno (P8b): avisa que é dele, muda e APAGA com a confirmação do app", async () => {
    const { aoApagado } = abrir({ tipo: "aluno" }, rotina({ origem: "profissional", paciente_id: "pac-1" }));
    expect(screen.getByText("Criada pelo seu profissional: você pode mudar ou apagar.")).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-rotina-apagar]")!);
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("ele vê que você apagou");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.arquivar).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(aoApagado).toHaveBeenCalledWith("r1"));
    expect(h.profArquivar).not.toHaveBeenCalled();
  });

  it("Cancelar na confirmação não apaga", async () => {
    abrir({ tipo: "aluno" }, rotina());
    fireEvent.click(document.querySelector("[data-rotina-apagar]")!);
    fireEvent.click((await screen.findByRole("alertdialog")).querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.arquivar).not.toHaveBeenCalled();
  });

  it("modo profissional (a P6 importa): cria e apaga pela matrícula da rota", async () => {
    const { aoSalvo } = abrir({ tipo: "profissional", aluno: "pac-1" });
    fireEvent.change(campo("Nome"), { target: { value: "Água 2 L" } });
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.profSalvar).toHaveBeenCalledWith("pac-1", null, expect.objectContaining({ nome: "Água 2 L", lembrete: false })));
    await waitFor(() => expect(aoSalvo).toHaveBeenCalled());
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it("a função recusa (limite de 30): a frase fixa do código na folha, a folha fica aberta", async () => {
    h.salvar.mockRejectedValue(new ErroAlunoDia("limite"));
    const { aoMudar } = abrir();
    fireEvent.change(campo("Nome"), { target: { value: "Mais uma" } });
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    expect(await screen.findByText(/Chegou ao limite \(30 rotinas/)).toBeInTheDocument();
    expect(aoMudar).not.toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: A consulta, os dias, a lista e a folha (verde)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/rotinas/useRotinas.ts src/rotinas/ui/DiasDaSemana.tsx src/rotinas/ui/RotinasDeHoje.tsx src/rotinas/ui/FolhaRotina.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/rotinas/ui/FolhaRotina.test.tsx`
  → `Tests 7 passed (7)`. (O `RotinasDeHoje` é provado no card do Início — Task 6.)

`src/rotinas/useRotinas.ts`:
```ts
// Physiq W-A P3 — as rotinas do aluno no React Query: a MESMA consulta no card do Início, na página /perfil/rotinas, no aviso global dos
// lembretes e (P5) na seção da Dieta — aluno-dia { acao: "ler", q: "rotinas", de: ontem, ate: hoje } (as vivas + as feitas de ontem e de
// hoje, o dia de São Paulo). A chave leva o dia: virou o dia, a consulta é outra. O ✓ é otimista (volta se a função recusar).
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ErroAlunoDia, lerMinhasRotinas, marcarRotina, mensagemErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP, ontemSP } from "@/aluno-dia/regras";
import type { MinhasRotinas } from "@/aluno-dia/tipos";
import { useSessao } from "@/nucleo/sessao";
import { comFeita } from "./regras";

export const CHAVE_ROTINAS = "rotinas-aluno";

/** A frase fixa do erro (a do código da função; nunca a mensagem crua). */
export const fraseDoErro = (e: unknown): string => (e instanceof ErroAlunoDia ? e.message : mensagemErroAlunoDia(null));

/** Relê as rotinas deste login (todas as chaves de dia). */
export const atualizarRotinas = (qc: QueryClient, uid: string | null): Promise<void> => qc.invalidateQueries({ queryKey: [CHAVE_ROTINAS, uid] });

export function useMinhasRotinas(ativo = true) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const hoje = hojeSP();
  return useQuery({
    queryKey: [CHAVE_ROTINAS, uid, hoje],
    queryFn: () => lerMinhasRotinas(ontemSP(), hoje),
    enabled: Boolean(uid) && ativo,
    staleTime: 60_000,
    // a nova tentativa é a do app (1, com 1 s — src/integrations/consultas.ts); sem rede, espera ela voltar
    networkMode: "online",
  });
}

export interface MarcarRotina {
  id: string;
  dia: string;
  feita: boolean;
}

/** O ✓ (hoje ou ontem — o banco recusa outro dia): otimista em todas as chaves deste login; erro → volta; no fim, relê. */
export function useMarcarRotina() {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useMutation({
    mutationFn: (v: MarcarRotina) => marcarRotina(v.id, v.dia, v.feita),
    onMutate: async (v: MarcarRotina) => {
      await qc.cancelQueries({ queryKey: [CHAVE_ROTINAS, uid] });
      const antes = qc.getQueriesData<MinhasRotinas>({ queryKey: [CHAVE_ROTINAS, uid] });
      qc.setQueriesData<MinhasRotinas>({ queryKey: [CHAVE_ROTINAS, uid] }, (d) => (d ? comFeita(d, v.id, v.dia, v.feita) : d));
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      for (const [chave, d] of ctx?.antes ?? []) qc.setQueryData(chave, d);
    },
    onSettled: () => atualizarRotinas(qc, uid),
  });
}
```

`src/rotinas/ui/DiasDaSemana.tsx`:
```tsx
// Physiq W-A P3 — os dias da rotina: Seg…Dom (liga/desliga) e os atalhos das metas "Todos os dias · Seg a Sex · Fim de semana" (spec §4.3).
import { cn } from "@/lib/utils";
import { ATALHOS_DIAS, DIAS_SEMANA, normalizarDias, textoDias } from "@/nutricao/app/metasUtil";
import { alternarDia, atalhoDosDias } from "../regras";

export function DiasDaSemana({ dias, aoMudar, erro }: { dias: readonly number[]; aoMudar: (dias: number[]) => void; erro?: string }) {
  const d = normalizarDias(dias);
  const atalho = atalhoDosDias(d);
  return (
    <div className="flex flex-col gap-2" data-rotina-dias={d.join(",")}>
      <span className="text-[12.5px] font-semibold text-texto-2">Dias</span>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Dias da semana">
        {DIAS_SEMANA.map((x) => {
          const ligado = d.includes(x.n);
          return (
            <button key={x.n} type="button" aria-pressed={ligado} title={x.nome} onClick={() => aoMudar(alternarDia(d, x.n))} data-rotina-dia={x.n}
              className={cn("h-9 min-w-0 rounded-[10px] border text-[12px] font-semibold transition-colors",
                ligado ? "border-violeta/60 bg-violeta text-white" : "border-linha-2 bg-superficie text-texto-2 hover:text-texto")}>
              {x.curto}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ATALHOS_DIAS.map((a) => (
          <button key={a.atalho} type="button" aria-pressed={atalho === a.atalho} onClick={() => aoMudar([...a.dias])} data-rotina-atalho={a.atalho}
            className={cn("inline-flex h-7 items-center rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
              atalho === a.atalho ? "border-verde bg-[rgba(16,185,129,.1)] text-verde-3" : "border-linha-2 text-texto-2 hover:text-texto")}>
            {a.rotulo}
          </button>
        ))}
        <span className="ml-auto text-[11.5px] text-texto-3" data-rotina-dias-texto>{textoDias(d)}</span>
      </div>
      {erro && <span role="alert" className="text-[12.5px] font-medium text-rosa-3" data-erro-campo>{erro}</span>}
    </div>
  );
}
```

`src/rotinas/ui/RotinasDeHoje.tsx`:
```tsx
// Physiq W-A P3 — "Rotinas de hoje" (spec §4.3): o card do Início e — na P5 — a seção do fim da aba Dieta (a MESMA lista: `origem` só muda
// o data-*). As rotinas do dia (vivas, do dia da semana, pela hora) com o ✓ otimista; primeiro as que faltam, até 4 + "+N"; hora, nome e
// detalhe; o selo "do seu profissional" nas criadas por profissional. Vazio: "Crie a sua 1ª rotina…" + "Criar rotina". Tocar abre a página.
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, ListChecks, LoaderCircle, Plus, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hojeSP, rotinasDoDia, type RotinaDoDia } from "@/aluno-dia/regras";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { NO_CARD, ROTA_ROTINAS, proximasDoDia, vivas } from "../regras";
import { SELO_DO_PROFISSIONAL, TEXTOS } from "../textos";
import { fraseDoErro, useMarcarRotina, useMinhasRotinas } from "../useRotinas";

export function RotinasDeHoje({ origem = "inicio", limite = NO_CARD }: { origem?: "inicio" | "dieta"; limite?: number }) {
  const navigate = useNavigate();
  const online = useOnline();
  const q = useMinhasRotinas(true);
  const marcar = useMarcarRotina();
  const hoje = hojeSP();
  const atributo = origem === "inicio" ? "data-card-rotinas-hoje" : "data-card-rotinas-dieta";
  const abrir = (nova = false) => navigate(nova ? `${ROTA_ROTINAS}?nova=1` : ROTA_ROTINAS);
  const semRede = !online && !q.data;

  const titulo = (
    <button type="button" onClick={() => abrir()} className="flex w-full items-center gap-[7px] text-left text-[12.5px] font-semibold text-suave hover:text-texto" data-rotinas-abrir>
      <ListChecks aria-hidden className="h-[15px] w-[15px] flex-none text-ciano-3" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{TEXTOS.card}</span>
      {!online && <WifiOff aria-label="Sem conexão" className="h-3.5 w-3.5 flex-none text-ambar-3" strokeWidth={1.75} />}
    </button>
  );
  const moldura = (estado: string, filhos: ReactNode) => (
    <div className="pq-cartao flex min-w-0 flex-col gap-3 p-3.5" {...{ [atributo]: estado }}>
      {titulo}
      {filhos}
    </div>
  );

  if (!q.data) {
    if (semRede) {
      return moldura("sem-internet", (
        <span className="block">
          <b className="block text-[14px] font-semibold leading-snug text-texto">{TEXTOS.semConexao}</b>
          <span className="mt-1 block text-[12px] leading-snug text-texto-2">{TEXTOS.semConexaoTexto}</span>
        </span>
      ));
    }
    if (q.isError) {
      return moldura("erro", (
        <span className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] leading-snug text-texto-2">{TEXTOS.erroLer}</span>
          <Botao tamanho="sm" icone={RefreshCw} onClick={() => void q.refetch()} data-rotinas-tentar>Tentar de novo</Botao>
        </span>
      ));
    }
    return moldura("carregando", (
      <div role="status" aria-busy="true" aria-label="Carregando as rotinas" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => <Esqueleto key={i} className="h-4 w-full" />)}
      </div>
    ));
  }

  if (vivas(q.data.rotinas).length === 0) {
    return moldura("vazio", (
      <span className="flex flex-col items-start gap-2.5">
        <span className="text-[13px] leading-snug text-texto-2">{TEXTOS.vazio}</span>
        <Botao tamanho="sm" variante="w" icone={Plus} onClick={() => abrir(true)} data-rotinas-criar>{TEXTOS.criar}</Botao>
      </span>
    ));
  }

  const doDia = rotinasDoDia(q.data.rotinas, q.data.feitas, hoje);
  if (doDia.length === 0) {
    return moldura("nenhuma-hoje", (
      <span className="block">
        <b className="block text-[14px] font-semibold leading-snug text-texto">{TEXTOS.nenhumaHoje}</b>
        <span className="mt-1 block text-[12px] leading-snug text-texto-2">{TEXTOS.nenhumaHojeTexto}</span>
      </span>
    ));
  }

  const { visiveis, resto } = proximasDoDia(doDia, limite);
  const alternar = (r: RotinaDoDia) => {
    if (!online) {
      toast.error(TEXTOS.semInternetMarcar);
      return;
    }
    marcar.mutate({ id: r.id, dia: hoje, feita: !r.feita }, { onError: (e) => toast.error(fraseDoErro(e)) });
  };

  return moldura("lista", (
    <ul className="flex min-w-0 flex-col gap-2.5" data-rotinas-hoje={doDia.length} data-rotinas-hoje-feitas={doDia.filter((r) => r.feita).length}>
      {visiveis.map((r) => {
        const salvando = marcar.isPending && marcar.variables?.id === r.id;
        const Icone = salvando ? LoaderCircle : CircleCheck;
        return (
          <li key={r.id} className="flex min-w-0 items-center gap-2.5" data-rotina-hoje={r.id} data-rotina-feita={r.feita ? "1" : "0"}>
            <button type="button" onClick={() => alternar(r)} disabled={salvando} aria-pressed={r.feita} data-rotina-marcar={r.id}
              aria-label={`${r.nome}: ${r.feita ? "feita (toque para desmarcar)" : "marcar como feita"}`} className="flex-none">
              <Icone aria-hidden className={cn("h-[19px] w-[19px]", salvando && "animate-spin", r.feita ? "text-verde-2" : "text-texto-4")} strokeWidth={1.9} />
            </button>
            <button type="button" onClick={() => abrir()} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{r.horario ?? "—"}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px] font-medium", r.feita ? "text-texto-3" : "text-texto")}>{r.nome}</span>
                {r.detalhe && <span className="block truncate text-[11.5px] text-texto-3">{r.detalhe}</span>}
              </span>
              {r.origem === "profissional" && <Chip tom="c" className="flex-none" data-rotina-selo>{SELO_DO_PROFISSIONAL}</Chip>}
            </button>
          </li>
        );
      })}
      {resto > 0 && (
        <li>
          <button type="button" onClick={() => abrir()} className="text-[12px] font-semibold text-ciano-3" data-rotinas-mais={resto}>
            +{resto} {resto === 1 ? "rotina" : "rotinas"}
          </button>
        </li>
      )}
    </ul>
  ));
}
```

`src/rotinas/ui/FolhaRotina.tsx`:
```tsx
// Physiq W-A P3 — a folha da rotina (spec §4.3, §4.5, §5.3): nasce com os 2 modos — o do ALUNO (a página /perfil/rotinas: cria e muda
// qualquer rotina viva dele, inclusive a do profissional — P8b) e o do PROFISSIONAL (o card Rotinas do Resumo, P6, só importa: cria na
// matrícula da rota e muda/apaga só as de profissional dela). Nome, detalhe (dose), tipo, horário, dias (com os atalhos das metas) e
// lembrete (só com horário). Apagar = arquivar, com a confirmação do app (useConfirmar). A forma é conferida aqui antes (a mesma do banco)
// e o erro da função vem pela frase fixa do código. Quem abre a folha relê a lista no aoSalvo/aoApagado.
import { useEffect, useState } from "react";
import { BellRing, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { arquivarRotina, profArquivarRotina, profSalvarRotina, salvarRotina } from "@/aluno-dia/api";
import type { Rotina, TipoDeRotina } from "@/aluno-dia/tipos";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
import { Botao } from "@/ui/premium/Botao";
import { Segmentado, type OpcaoSegmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { dadosDoFormulario, formularioDe, validarFormulario, type ErroDoFormulario, type FormularioDaRotina } from "../regras";
import { ROTULO_TIPO, TEXTOS } from "../textos";
import { fraseDoErro } from "../useRotinas";
import { DiasDaSemana } from "./DiasDaSemana";

export type ModoDaFolha = { tipo: "aluno" } | { tipo: "profissional"; aluno: string };

const TIPOS: OpcaoSegmentado<TipoDeRotina>[] = (["suplemento", "remedio", "habito", "outro"] as TipoDeRotina[]).map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] }));

function textoDoApagar(modo: ModoDaFolha, r: Rotina): string {
  if (modo.tipo === "profissional") return "O aluno deixa de ver esta rotina e os lembretes param. O histórico fica no Ver tudo.";
  return r.origem === "profissional"
    ? "Ela foi criada pelo seu profissional: sai da sua lista, os lembretes param e ele vê que você apagou."
    : "Ela sai da sua lista e os lembretes param.";
}

export function FolhaRotina({
  aberta,
  aoMudar,
  modo,
  rotina,
  aoSalvo,
  aoApagado,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  modo: ModoDaFolha;
  /** null = nova */
  rotina: Rotina | null;
  aoSalvo?: (r: Rotina, nova: boolean) => void | Promise<void>;
  aoApagado?: (id: string) => void | Promise<void>;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDaRotina>(() => formularioDe(rotina));
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [ocupado, setOcupado] = useState<"salvar" | "apagar" | null>(null);

  useEffect(() => {
    if (!aberta) return;
    setF(formularioDe(rotina));
    setErro(null);
    setOcupado(null);
  }, [aberta, rotina]);

  const mudar = (p: Partial<FormularioDaRotina>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };

  const salvar = async () => {
    const v = validarFormulario(f);
    if (v) {
      setErro(v);
      return;
    }
    setOcupado("salvar");
    try {
      const dados = dadosDoFormulario(f);
      const id = rotina?.id ?? null;
      const r = modo.tipo === "aluno" ? await salvarRotina(id, dados) : await profSalvarRotina(modo.aluno, id, dados);
      toast.success(rotina ? TEXTOS.salva : TEXTOS.criada);
      aoMudar(false);
      await aoSalvo?.(r.rotina, !rotina);
    } catch (e) {
      setErro({ mensagem: fraseDoErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const apagar = async () => {
    if (!rotina) return;
    if (!(await confirmar({ titulo: "Apagar a rotina?", descricao: textoDoApagar(modo, rotina), rotuloConfirmar: "Apagar", perigo: true }))) return;
    setOcupado("apagar");
    try {
      if (modo.tipo === "aluno") await arquivarRotina(rotina.id);
      else await profArquivarRotina(modo.aluno, rotina.id);
      toast.success(TEXTOS.apagada);
      aoMudar(false);
      await aoApagado?.(rotina.id);
    } catch (e) {
      setErro({ mensagem: fraseDoErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const doCampo = (c: ErroDoFormulario["campo"]) => (erro?.campo === c ? erro.mensagem : undefined);
  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={rotina ? TEXTOS.mudar : TEXTOS.nova}
      descricao={rotina?.origem === "profissional" && modo.tipo === "aluno" ? TEXTOS.daProfissional : undefined}>
      <div className="flex flex-col gap-4 pt-1" data-folha-rotina={rotina ? "mudar" : "nova"} data-folha-modo={modo.tipo}>
        <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={60} autoComplete="off"
          placeholder="Creatina, remédio da pressão, água…" erro={doCampo("nome")} data-rotina-nome />
        <Campo rotulo="Detalhe (opcional)" value={f.detalhe} onChange={(e) => mudar({ detalhe: e.target.value })} maxLength={120} autoComplete="off"
          placeholder="5 g, 1 comprimido, 500 ml…" erro={doCampo("detalhe")} data-rotina-detalhe />
        <div className="flex flex-col gap-1.5" data-rotina-tipo={f.tipo}>
          <span className="text-[12.5px] font-semibold text-texto-2">Tipo</span>
          <Segmentado opcoes={TIPOS} valor={f.tipo} aoMudar={(t) => mudar({ tipo: t })} rotulo="Tipo da rotina" className="self-start" />
        </div>
        <Campo rotulo="Horário (opcional)" type="time" value={f.horario} erro={doCampo("horario")} data-rotina-horario
          onChange={(e) => mudar({ horario: e.target.value, ...(e.target.value ? {} : { lembrete: false }) })} />
        <DiasDaSemana dias={f.dias} aoMudar={(d) => mudar({ dias: d })} erro={doCampo("dias")} />
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie-2 text-suave">
            <BellRing aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-texto">Lembrete</span>
            <span className="block text-[11.5px] leading-snug text-texto-3">{f.horario ? `Toca às ${f.horario} nos dias marcados.` : TEXTOS.lembreteSemHorario}</span>
          </span>
          <Interruptor ligado={f.lembrete} aoMudar={(v) => mudar({ lembrete: v })} rotulo="Lembrete" desligado={!f.horario} data-rotina-lembrete={f.lembrete ? "1" : "0"} />
        </div>
        {erro && (!erro.campo || erro.campo === "lembrete") && <MensagemForm data-rotina-erro>{erro.mensagem}</MensagemForm>}
        <Botao variante="w" onClick={() => void salvar()} disabled={!!ocupado} data-rotina-salvar>
          {ocupado === "salvar" ? "Salvando…" : "Salvar"}
        </Botao>
        {rotina && (
          <button type="button" onClick={() => void apagar()} disabled={!!ocupado} data-rotina-apagar
            className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
            <Trash2 aria-hidden /> {ocupado === "apagar" ? "Apagando…" : "Apagar rotina"}
          </button>
        )}
      </div>
    </PainelDeslizante>
  );
}
```

- [ ] **Step 3: Commit** — `feat(w-a): a consulta das rotinas, os dias, a lista de hoje e a folha (aluno e profissional)` com os 5 arquivos;
  `feita.sh 5 "folha 7/7" "<placar>"`.

---

### Task 6: O card do Início (TDD)

**Files:** Create `src/app-aluno/inicio/CardRotinasHoje.tsx`, `src/app-aluno/inicio/CardRotinasHoje.test.tsx`; Modify `src/app-aluno/abas/Inicio.tsx`,
`src/app-aluno/abas/Inicio.test.tsx`, `src/app-aluno/abas/abasW12.test.ts`.
**Estimativa:** 20 min (calibrado 5–7).

- [ ] **Step 1: Os testes (vermelho)**

Run: `cd ~/projetos/physiqcalc-wa-p3 && git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/T6-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/app-aluno/inicio/CardRotinasHoje.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/app-aluno/inicio/CardRotinasHoje.test.tsx src/app-aluno/abas/Inicio.test.tsx src/app-aluno/abas/abasW12.test.ts`
Expected: `CardRotinasHoje.test.tsx` FAIL (`Failed to resolve import "./CardRotinasHoje"`); `abasW12.test.ts` 1 falha (os 6 cards × 5);
`Inicio.test.tsx` 2 falhas (o card não aparece) e 20 passam.

`~/projetos/physiqcalc-scratch/w-a/p3/patches/T6-teste.patch`:
```diff
--- a/src/app-aluno/abas/Inicio.test.tsx
+++ b/src/app-aluno/abas/Inicio.test.tsx
@@ -43,6 +43,8 @@
     ev: null as null | Record<string, unknown>,
     perfil: null as null | Record<string, unknown>,
     agenda: [] as unknown[],
+    // W-A P3: as rotinas do card "Rotinas de hoje" (a função aluno-dia, falsa)
+    rotinas: { ok: true, hoje: "2026-09-30", rotinas: [] as unknown[], feitas: [] as unknown[] },
     marcarMeta: vi.fn(async () => {}),
     db: {
       getAll: vi.fn(async () => []),
@@ -72,6 +74,11 @@
 vi.mock("@/nutricao/app/useDieta", () => ({ useDieta: () => h.dieta }));
 vi.mock("@/evolucao/useEvolucaoDoAluno", () => ({ useEvolucaoDoAluno: () => h.ev }));
 vi.mock("@/app-aluno/perfil/pecas/api", () => ({ meuPerfilAluno: async () => h.perfil, minhaAgenda: async () => h.agenda }));
+vi.mock("@/aluno-dia/api", async (orig) => ({
+  ...(await orig<typeof import("@/aluno-dia/api")>()),
+  lerMinhasRotinas: async () => h.rotinas,
+  marcarRotina: async () => ({ ok: true, feita: true }),
+}));
 vi.mock("@/ui/premium/Sino", () => ({ Sino: () => <button type="button">Avisos</button> }));
 vi.mock("@/app-aluno/AppAlunoLayout", () => ({ AvisosDoTopo: () => <div data-testid="avisos-topo" /> }));
 vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));
@@ -192,6 +199,7 @@
   h.agenda = [{ id: "ag1", paciente_id: "m1", titulo: "Retorno", inicio: "2026-10-02T13:00:00Z", fim: "2026-10-02T14:00:00Z", dia_inteiro: false, status: "confirmado",
     modulo: "nutricao", profissional: "Camila Rocha", papel: "nutricionista" }];
   h.marcarMeta.mockClear();
+  h.rotinas = { ok: true, hoje: "2026-09-30", rotinas: [], feitas: [] };
   h.buscaCarregando = false;
   vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
   Element.prototype.scrollIntoView = vi.fn();
@@ -256,6 +264,32 @@
     expect(peso.getAttribute("data-peso-periodo")).toBe("6m");
   });
 
+  it("W-A P3: o card 'Rotinas de hoje' entra logo depois da linha Dieta/Metas e antes da próxima consulta (todo aluno)", async () => {
+    h.rotinas = {
+      ok: true, hoje: "2026-09-30", feitas: [],
+      rotinas: [{ id: "r1", origem: "profissional", paciente_id: "m1", nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00",
+        dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: true, ordem: 0, criada_em: "2026-09-01T00:00:00Z", alterada_em: "2026-09-01T00:00:00Z", arquivada_em: null }],
+    };
+    abrir();
+    await waitFor(() => expect(card('data-card-rotinas-hoje="lista"')).not.toBeNull());
+    await waitFor(() => expect(card('data-card-consulta="proxima"')).not.toBeNull());
+    const rotinas = card("data-card-rotinas-hoje")!;
+    expect(rotinas.textContent).toContain("Creatina");
+    expect(rotinas.textContent).toContain("do seu profissional");
+    const antes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
+    expect(antes(card("data-card-metas-hoje")!, rotinas)).toBe(true);
+    expect(antes(rotinas, card("data-card-consulta")!)).toBe(true);
+  });
+
+  it("W-A P3: o aluno do app sem profissional também tem o card (P9) — vazio, com 'Criar rotina'", async () => {
+    h.situacao = { master: false, contas: [], matriculas: [matricula(["treino", "nutricao"], { app: true, app_plano: "app_treino_alimentacao" })],
+      modulos_aluno: ["treino", "nutricao"], nome: "Diego Almeida" };
+    abrir();
+    await waitFor(() => expect(card('data-card-rotinas-hoje="vazio"')).not.toBeNull());
+    fireEvent.click(screen.getByRole("button", { name: /Criar rotina/ }));
+    expect(screen.getByTestId("rota").textContent).toBe("/perfil/rotinas?nova=1");
+  });
+
   it("marcar a meta de hoje usa a MESMA mutação da aba Dieta (aluno_marcar_meta)", async () => {
     abrir();
     const dormir = await screen.findByRole("button", { name: /Dormir 8 horas: marcar como feita/ }, { timeout: 4000 });
--- a/src/app-aluno/abas/abasW12.test.ts
+++ b/src/app-aluno/abas/abasW12.test.ts
@@ -28,9 +28,9 @@
     expect(destinoDaRotaAntiga("/pagamentos", "")).toBe("/perfil/pagamentos");
   });
 
-  it("os 5 cards da tela 1 estão registrados em src/app-aluno/inicio (as peças ficam na subpasta, fora do registro)", () => {
+  it("os 5 cards da tela 1 + o das rotinas (W-A P3) estão registrados em src/app-aluno/inicio (as peças ficam na subpasta, fora do registro)", () => {
     const nomes = listar("inicioApp").map((i) => i.nome).sort();
-    expect(nomes).toEqual(["CardDietaHoje", "CardMetasHoje", "CardPeso", "CardProximaConsulta", "CardTreinoHoje"]);
+    expect(nomes).toEqual(["CardDietaHoje", "CardMetasHoje", "CardPeso", "CardProximaConsulta", "CardRotinasHoje", "CardTreinoHoje"]);
   });
 
   it("a faixa 'Escolha um treino pronto' (W7b) saiu: o card do treino de hoje é que oferece o treino pronto", () => {
```

`src/app-aluno/inicio/CardRotinasHoje.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinhasRotinas, Rotina } from "@/aluno-dia/tipos";
import { matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  dados: null as null | Record<string, unknown>,
  falha: false,
  ler: vi.fn(),
  marcar: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerMinhasRotinas: (...a: unknown[]) => h.ler(...a),
  marcarRotina: (...a: unknown[]) => h.marcar(...a),
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import CardRotinasHoje from "./CardRotinasHoje";

let n = 0;
const rotina = (o: Partial<Rotina> = {}): Rotina => {
  n += 1;
  return {
    id: `r${n}`, origem: "aluno", paciente_id: null, nome: `Rotina ${n}`, detalhe: null, tipo: "habito", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
    lembrete: false, ordem: 0, criada_em: `2026-09-01T12:0${n % 10}:00Z`, alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
  };
};

function Onde() {
  const l = useLocation();
  return <div data-testid="rota">{l.pathname + l.search}</div>;
}
function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<CardRotinasHoje />} />
          <Route path="*" element={<Onde />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const card = () => document.querySelector("[data-card-rotinas-hoje]") as HTMLElement | null;

beforeEach(() => {
  n = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 30, 9, 30, 0)); // quarta 30/09/2026
  h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [matricula()] }) };
  h.dados = { ok: true, hoje: "2026-09-30", rotinas: [], feitas: [] };
  h.falha = false;
  h.ler.mockReset();
  h.ler.mockImplementation(async () => {
    if (h.falha) throw new Error("Failed to fetch");
    return h.dados;
  });
  h.marcar.mockReset();
  for (const f of [h.toast, h.toast.success, h.toast.error]) f.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("W-A P3 — Início › Rotinas de hoje", () => {
  it("lê ontem e hoje (dia de São Paulo) pela função; vazio → 'Crie a sua 1ª rotina…' e 'Criar rotina' abre a página já com a folha", async () => {
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("vazio"));
    expect(h.ler).toHaveBeenCalledWith("2026-09-29", "2026-09-30");
    expect(screen.getByText("Crie a sua 1ª rotina (creatina, remédio, água…)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Criar rotina/ }));
    expect(screen.getByTestId("rota").textContent).toBe("/perfil/rotinas?nova=1");
  });

  it("6 de hoje (1 feita) e 1 só de sábado: as 4 que faltam pela hora + '+2'; o selo na do profissional", async () => {
    const lista = [
      rotina({ nome: "Creatina", detalhe: "5 g", horario: "07:00", tipo: "suplemento" }),
      rotina({ nome: "Água 2 L", horario: "10:00", origem: "profissional", paciente_id: "p1" }),
      rotina({ nome: "Alongar", horario: "12:00" }),
      rotina({ nome: "Ômega 3", horario: "13:00" }),
      rotina({ nome: "Caminhar", horario: "18:00" }),
      rotina({ nome: "Ler", horario: "22:00" }),
      rotina({ nome: "Só sábado", horario: "09:00", dias_semana: [6] }),
    ];
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: lista, feitas: [{ rotina_id: lista[0].id, dia: "2026-09-30", feita_em: "x" }] };
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("lista"));
    const ul = card()!.querySelector("[data-rotinas-hoje]")!;
    expect(ul.getAttribute("data-rotinas-hoje")).toBe("6");
    expect(ul.getAttribute("data-rotinas-hoje-feitas")).toBe("1");
    const linhas = [...card()!.querySelectorAll("[data-rotina-hoje]")].map((li) => li.textContent);
    expect(linhas).toHaveLength(4);
    expect(linhas[0]).toContain("Água 2 L");
    expect(linhas[0]).toContain("do seu profissional");
    expect(card()!.textContent).not.toContain("Só sábado");
    expect(card()!.textContent).not.toContain("Creatina"); // a feita foi para o fim (fora das 4)
    expect(card()!.querySelector("[data-rotinas-mais]")?.textContent).toBe("+2 rotinas");
  });

  it("✓ otimista: marca na hora e chama a função com hoje; a função recusa → volta e avisa com a frase fixa", async () => {
    const r = rotina({ nome: "Creatina" });
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [r], feitas: [] };
    let soltar: (v: unknown) => void = () => {};
    h.marcar.mockImplementation(() => new Promise((ok) => (soltar = ok)));
    abrir();
    const botao = await waitFor(() => {
      const b = card()?.querySelector(`[data-rotina-marcar="${r.id}"]`) as HTMLButtonElement | null;
      expect(b).not.toBeNull();
      return b!;
    });
    fireEvent.click(botao);
    await waitFor(() => expect(card()!.querySelector(`[data-rotina-hoje="${r.id}"]`)?.getAttribute("data-rotina-feita")).toBe("1"));
    expect(h.marcar).toHaveBeenCalledWith(r.id, "2026-09-30", true);
    // a releitura depois do ✓ já traz a feita
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [r], feitas: [{ rotina_id: r.id, dia: "2026-09-30", feita_em: "x" }] };
    soltar({ ok: true, feita: true });
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));

    const { ErroAlunoDia } = await import("@/aluno-dia/api");
    h.marcar.mockRejectedValueOnce(new ErroAlunoDia("nao_encontrado"));
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [r], feitas: [{ rotina_id: r.id, dia: "2026-09-30", feita_em: "x" }] };
    fireEvent.click(card()!.querySelector(`[data-rotina-marcar="${r.id}"]`)!);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Não encontrado: foi apagado ou não é seu."));
    await waitFor(() => expect(card()!.querySelector(`[data-rotina-hoje="${r.id}"]`)?.getAttribute("data-rotina-feita")).toBe("1"));
  });

  it("só rotinas de outros dias → 'Nenhuma rotina hoje'", async () => {
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina({ dias_semana: [6, 7] })], feitas: [] } satisfies MinhasRotinas & { ok: true };
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("nenhuma-hoje"));
    expect(screen.getByText("Nenhuma rotina hoje")).toBeInTheDocument();
  });

  it("a leitura falhou → o aviso com 'Tentar de novo' (relê)", async () => {
    h.falha = true;
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("erro"));
    h.falha = false;
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("vazio"));
  });

  it("quem não tem matrícula (o profissional que abriu o app) não vê o card nem lê", async () => {
    h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [] }) };
    abrir();
    await new Promise((ok) => setTimeout(ok, 20));
    expect(card()).toBeNull();
    expect(h.ler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: O card e o lugar dele (verde)**

Run: `cd ~/projetos/physiqcalc-wa-p3 && git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/T6-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/app-aluno/inicio/CardRotinasHoje.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/app-aluno/inicio/CardRotinasHoje.test.tsx src/app-aluno/abas/Inicio.test.tsx src/app-aluno/abas/abasW12.test.ts`
Expected: `Test Files 3 passed` · `Tests 33 passed (33)` (6 + 22 + 5).

`~/projetos/physiqcalc-scratch/w-a/p3/patches/T6-codigo.patch`:
```diff
--- a/src/app-aluno/abas/Inicio.tsx
+++ b/src/app-aluno/abas/Inicio.tsx
@@ -20,11 +20,11 @@
 import { Sino } from "@/ui/premium/Sino";
 
 /**
- * As linhas do Início na ordem da tela 1: o treino de hoje; a dieta e as metas lado a lado; a próxima consulta; o peso. Cada card
- * é um arquivo em src/app-aluno/inicio/<Card>.tsx (registro por convenção — spec 11.1) e decide sozinho se aparece (módulo do
- * aluno). Card novo de outra worktree entra no fim, numa linha só dele.
+ * As linhas do Início na ordem da tela 1: o treino de hoje; a dieta e as metas lado a lado; as rotinas de hoje (W-A P3 — spec §4.3);
+ * a próxima consulta; o peso. Cada card é um arquivo em src/app-aluno/inicio/<Card>.tsx (registro por convenção — spec 11.1) e decide
+ * sozinho se aparece (módulo do aluno). Card novo de outra worktree entra no fim, numa linha só dele.
  */
-const LINHAS: string[][] = [["CardTreinoHoje"], ["CardDietaHoje", "CardMetasHoje"], ["CardProximaConsulta"], ["CardPeso"]];
+const LINHAS: string[][] = [["CardTreinoHoje"], ["CardDietaHoje", "CardMetasHoje"], ["CardRotinasHoje"], ["CardProximaConsulta"], ["CardPeso"]];
 
 /**
  * hml-18b (H-54, F): quem aparece para quem — a MESMA regra da 1ª linha de cada card (useOQueOAlunoTem: módulos e situação, já
@@ -36,6 +36,8 @@
   CardTreinoHoje: (t) => t.treino,
   CardDietaHoje: (t) => t.nutricao,
   CardMetasHoje: (t) => t.comNutricionista,
+  // W-A P3 (P9): todo aluno, inclusive o do app sem profissional — o card some sozinho para quem não tem matrícula
+  CardRotinasHoje: () => true,
   CardProximaConsulta: (t) => !t.semProfissional,
   CardPeso: (t) => !t.semProfissional,
 };
@@ -45,6 +47,7 @@
   CardTreinoHoje: "h-[212px] rounded-[26px]",
   CardDietaHoje: "h-[150px] rounded-[22px]",
   CardMetasHoje: "h-[150px] rounded-[22px]",
+  CardRotinasHoje: "h-[168px] rounded-[22px]",
   CardProximaConsulta: "h-[66px] rounded-[22px]",
   CardPeso: "h-[84px] rounded-[22px]",
 };
```

`src/app-aluno/inicio/CardRotinasHoje.tsx`:
```tsx
import { useSessao } from "@/nucleo/sessao";
import { ehAlunoDasRotinas } from "@/rotinas/regras";
import { RotinasDeHoje } from "@/rotinas/ui/RotinasDeHoje";

/**
 * Início › "Rotinas de hoje" (W-A P3 — spec §4.3; P9: todo aluno, inclusive o do app sem profissional): logo depois da linha Dieta/Metas
 * (src/app-aluno/abas/Inicio.tsx, LINHAS). A lista é a MESMA da página /perfil/rotinas e da seção da Dieta (P5) — src/rotinas/ui/RotinasDeHoje.
 * Quem não tem matrícula (o profissional que abriu o app) não vê o card.
 */
export default function CardRotinasHoje() {
  const { situacao } = useSessao();
  if (!ehAlunoDasRotinas(situacao)) return null;
  return <RotinasDeHoje origem="inicio" />;
}
```

- [ ] **Step 3: Commit** — `feat(w-a): o card "Rotinas de hoje" no Início (depois da linha Dieta/Metas; todo aluno — P9)` com
  `src/app-aluno/inicio/CardRotinasHoje.tsx src/app-aluno/inicio/CardRotinasHoje.test.tsx src/app-aluno/abas/Inicio.tsx src/app-aluno/abas/Inicio.test.tsx src/app-aluno/abas/abasW12.test.ts`;
  `feita.sh 6 "card do Início 33/33" "<placar>"`.

---

### Task 7: A página `/perfil/rotinas` e o item do Perfil (TDD)

**Files:** Create `src/app-aluno/perfil/Rotinas.tsx`, `src/app-aluno/perfil/Rotinas.test.tsx`; Modify `src/app-aluno/abas/Perfil.tsx`, `src/app-aluno/abas/Perfil.test.tsx`.
**Estimativa:** 30 min (calibrado 5–7).

- [ ] **Step 1: Os testes (vermelho)**

Run: `cd ~/projetos/physiqcalc-wa-p3 && git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/T7-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/app-aluno/perfil/Rotinas.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/app-aluno/perfil/Rotinas.test.tsx src/app-aluno/abas/Perfil.test.tsx`
Expected: `Rotinas.test.tsx` FAIL (`Failed to resolve import "./Rotinas"`); `Perfil.test.tsx` 1 falha (o "Rotinas e lembretes" no completo) e 15 passam.

`~/projetos/physiqcalc-scratch/w-a/p3/patches/T7-teste.patch`:
```diff
--- a/src/app-aluno/abas/Perfil.test.tsx
+++ b/src/app-aluno/abas/Perfil.test.tsx
@@ -125,7 +125,7 @@
     expect(screen.getByText("Personal trainer")).toBeInTheDocument();
     expect(screen.getByText("Nutricionista")).toBeInTheDocument();
     expect(screen.getAllByRole("button", { name: /no WhatsApp/ })).toHaveLength(1);
-    for (const l of ["Agenda", "Pagamentos", "Lembrete de treino", "Som do descanso", "Aparência", "Exportar meus dados", "Excluir minha conta", "Sair"]) {
+    for (const l of ["Agenda", "Pagamentos", "Rotinas e lembretes", "Lembrete de treino", "Som do descanso", "Aparência", "Exportar meus dados", "Excluir minha conta", "Sair"]) {
       expect(screen.getByText(l)).toBeInTheDocument();
     }
     expect(await screen.findByText("sáb, 18/07")).toBeInTheDocument();
@@ -194,7 +194,7 @@
     expect(screen.getByText("Exportar meus dados")).toBeInTheDocument();
     expect(screen.getByText("Excluir minha conta")).toBeInTheDocument();
     expect(screen.getByText("Sair")).toBeInTheDocument();
-    for (const l of ["Meus profissionais", "Agenda", "Pagamentos", "Lembrete de treino", "Som do descanso", "Aparência"]) {
+    for (const l of ["Meus profissionais", "Agenda", "Pagamentos", "Rotinas e lembretes", "Lembrete de treino", "Som do descanso", "Aparência"]) {
       expect(screen.queryByText(l)).toBeNull();
     }
     expect(screen.queryByRole("button", { name: "Conta" })).toBeNull();
```

`src/app-aluno/perfil/Rotinas.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";
import { matricula, situacao } from "@/test/fixturesNucleo";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  dados: null as null | Record<string, unknown>,
  ler: vi.fn(),
  salvar: vi.fn(),
  marcar: vi.fn(),
  nativo: false,
  permissao: "granted",
  exato: "granted",
  LN: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    checkExactNotificationSetting: vi.fn(),
    changeExactNotificationSetting: vi.fn(),
  },
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerMinhasRotinas: (...a: unknown[]) => h.ler(...a),
  salvarRotina: (...a: unknown[]) => h.salvar(...a),
  marcarRotina: (...a: unknown[]) => h.marcar(...a),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: h.LN }));
vi.mock("sonner", () => ({ toast: h.toast }));

import Rotinas from "./Rotinas";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "r1", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});

function Onde() {
  const l = useLocation();
  return <div data-testid="rota">{l.pathname + l.search}</div>;
}
function abrir(rota = "/perfil/rotinas") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false} initialEntries={[rota]}>
          <Routes>
            <Route path="/perfil/rotinas" element={<><Rotinas /><Onde /></>} />
          </Routes>
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const pagina = () => document.querySelector("[data-pagina-rotinas]") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 30, 9, 30, 0)); // quarta
  h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [matricula()] }) };
  h.dados = {
    ok: true, hoje: "2026-09-30",
    rotinas: [
      rotina({ id: "a", nome: "Creatina", horario: "08:00" }),
      rotina({ id: "b", nome: "Água 2 L", detalhe: null, tipo: "habito", horario: "10:00", lembrete: false, origem: "profissional", paciente_id: "p1" }),
      rotina({ id: "c", nome: "Só sábado", detalhe: null, horario: "09:00", dias_semana: [6] }),
    ],
    feitas: [{ rotina_id: "a", dia: "2026-09-30", feita_em: "x" }],
  };
  h.nativo = false;
  h.permissao = "granted";
  h.exato = "granted";
  h.ler.mockReset();
  h.ler.mockImplementation(async () => h.dados);
  h.salvar.mockReset();
  h.marcar.mockReset();
  h.LN.checkPermissions.mockImplementation(async () => ({ display: h.permissao }));
  h.LN.requestPermissions.mockImplementation(async () => ({ display: "denied" }));
  h.LN.checkExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: h.exato }));
  h.LN.changeExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: "granted" }));
  for (const f of [h.toast, h.toast.success, h.toast.error]) f.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("W-A P3 — Perfil › Rotinas e lembretes", () => {
  it("todas as vivas pela hora, com o ✓ só nas de hoje, os dias, o selo da do profissional e a linha 'Seus profissionais veem' (Q4)", async () => {
    abrir();
    await waitFor(() => expect(pagina().getAttribute("data-pagina-rotinas")).toBe("lista"));
    const linhas = [...document.querySelectorAll("[data-rotina-linha]")];
    expect(linhas.map((l) => l.getAttribute("data-rotina-linha"))).toEqual(["a", "b", "c"]);
    expect(linhas[0].querySelector("[data-rotina-marcar]")?.getAttribute("data-rotina-feita")).toBe("1");
    expect(linhas[1].querySelector("[data-rotina-marcar]")?.getAttribute("data-rotina-feita")).toBe("0");
    expect(linhas[2].querySelector("[data-rotina-marcar]")).toBeNull(); // sábado: sem ✓ hoje
    expect(within(linhas[0] as HTMLElement).getByText("5 g · Todos os dias")).toBeInTheDocument();
    expect(within(linhas[1] as HTMLElement).getByText("do seu profissional")).toBeInTheDocument();
    expect(screen.getByText("Seus profissionais veem as suas rotinas.")).toBeInTheDocument();
    // site: o lembrete só com a página aberta; sem os avisos do APK
    expect(document.querySelector("[data-rotinas-site]")).not.toBeNull();
    expect(document.querySelector('[data-rotinas-aviso="bateria"]')).toBeNull();
  });

  it("?nova=1 (o 'Criar rotina' do Início) abre a folha nova e sai do endereço; tocar numa linha abre para mudar", async () => {
    abrir("/perfil/rotinas?nova=1");
    expect(await screen.findByText("Nova rotina", { selector: "h2" })).toBeInTheDocument();
    expect(document.querySelector('[data-folha-rotina="nova"]')).not.toBeNull();
    await waitFor(() => expect(screen.getByTestId("rota").textContent).toBe("/perfil/rotinas"));
  });

  it("tocar numa linha abre a folha para mudar, com os campos dela", async () => {
    abrir();
    await waitFor(() => expect(document.querySelector('[data-rotina-abrir="a"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-rotina-abrir="a"]')!);
    expect(await screen.findByText("Mudar rotina", { selector: "h2" })).toBeInTheDocument();
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Creatina");
    expect((screen.getByLabelText("Horário (opcional)") as HTMLInputElement).value).toBe("08:00");
  });

  it("✓ na página marca hoje (otimista) pela mesma função do Início", async () => {
    h.marcar.mockResolvedValue({ ok: true, feita: true });
    abrir();
    await waitFor(() => expect(document.querySelector('[data-rotina-marcar="b"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-rotina-marcar="b"]')!);
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("b", "2026-09-30", true));
  });

  it("30 vivas: o aviso do limite e 'Nova rotina' desligado", async () => {
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: Array.from({ length: 30 }, (_, i) => rotina({ id: `r${i}`, nome: `R${i}` })), feitas: [] };
    abrir();
    expect(await screen.findByText("Você chegou a 30 rotinas: apague uma para criar outra.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova rotina" })).toBeDisabled();
  });

  it("vazia: 'Nenhuma rotina ainda', o texto da 1ª rotina e o botão", async () => {
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [], feitas: [] };
    abrir();
    await waitFor(() => expect(pagina().getAttribute("data-pagina-rotinas")).toBe("vazia"));
    expect(screen.getByText("Nenhuma rotina ainda")).toBeInTheDocument();
    expect(screen.getByText("Crie a sua 1ª rotina (creatina, remédio, água…)")).toBeInTheDocument();
    expect(document.querySelector("[data-rotinas-criar]")).not.toBeNull();
  });

  it("APK: notificações bloqueadas e 'Alarmes e lembretes' desligado → os 2 avisos, a dica da bateria e o 'Ligar' abre o ajuste", async () => {
    h.nativo = true;
    h.permissao = "denied";
    h.exato = "denied";
    abrir();
    expect(await screen.findByText(/As notificações do Physiq estão bloqueadas/)).toBeInTheDocument();
    expect(await screen.findByText(/“Alarmes e lembretes” está desligado/)).toBeInTheDocument();
    expect(screen.getByText(/economia de bateria/)).toBeInTheDocument();
    expect(document.querySelector("[data-rotinas-site]")).toBeNull();
    fireEvent.click(document.querySelector("[data-rotinas-ligar-alarme]")!);
    await waitFor(() => expect(h.LN.changeExactNotificationSetting).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('[data-rotinas-aviso="alarme-exato"]')).toBeNull());
  });

  it("APK: salvar o 1º lembrete pede a permissão; negada → o aviso", async () => {
    h.nativo = true;
    h.permissao = "prompt";
    h.salvar.mockResolvedValue({ ok: true, rotina: rotina({ id: "n", nome: "Nova" }) });
    abrir();
    await waitFor(() => expect(pagina().getAttribute("data-pagina-rotinas")).toBe("lista"));
    fireEvent.click(screen.getByRole("button", { name: "Nova rotina" }));
    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Nova" } });
    fireEvent.change(screen.getByLabelText("Horário (opcional)"), { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("switch", { name: "Lembrete" }));
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.LN.requestPermissions).toHaveBeenCalled());
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Libere as notificações do Physiq para o lembrete tocar."));
  });

  it("quem não tem matrícula vê o aviso e não lê", async () => {
    h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [] }) };
    abrir();
    expect(await screen.findByText("As rotinas são de quem é aluno no Physiq.")).toBeInTheDocument();
    expect(h.ler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: A página e o item (verde)**

Run: `cd ~/projetos/physiqcalc-wa-p3 && git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/T7-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/app-aluno/perfil/Rotinas.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/app-aluno/perfil/Rotinas.test.tsx src/app-aluno/abas/Perfil.test.tsx`
Expected: `Tests 25 passed (25)` (9 + 16).

`~/projetos/physiqcalc-scratch/w-a/p3/patches/T7-codigo.patch`:
```diff
--- a/src/app-aluno/abas/Perfil.tsx
+++ b/src/app-aluno/abas/Perfil.tsx
@@ -1,7 +1,7 @@
 import { useEffect, useState } from "react";
 import { useNavigate, useSearchParams } from "react-router-dom";
 import { useQuery, useQueryClient } from "@tanstack/react-query";
-import { Ban, BellRing, CalendarDays, Download, Moon, Receipt, Settings, Sun, Trash2, Volume2 } from "lucide-react";
+import { AlarmClock, Ban, BellRing, CalendarDays, Download, Moon, Receipt, Settings, Sun, Trash2, Volume2 } from "lucide-react";
 import { useResumoFinanceiro } from "@/financeiro/useResumoFinanceiro";
 import { lerSomDescanso, nomeDoSom, type SomDescanso } from "@/lib/somDescanso";
 import { useSessao } from "@/nucleo/sessao";
@@ -131,6 +131,8 @@
               } />
             <ItemLista icone={Receipt} rotulo="Pagamentos" para="/perfil/pagamentos"
               valor={chipPag ? <Chip tom={chipPag.tom} data-perfil-pagamentos-chip>{chipPag.texto}</Chip> : undefined} />
+            {/* W-A P3 (spec §4.3, §2.2-15): as rotinas (creatina, remédio…) e os lembretes — todo aluno */}
+            <ItemLista icone={AlarmClock} rotulo="Rotinas e lembretes" para="/perfil/rotinas" />
             {temTreino && (
               <ItemLista icone={BellRing} rotulo="Lembrete de treino" aoTocar={() => setFolha("lembrete")}
                 valor={<span data-perfil-lembrete-valor>{valorDoLembrete(lembrete)}</span>} />
```

`src/app-aluno/perfil/Rotinas.tsx`:
```tsx
// Physiq W-A P3 — Perfil › "Rotinas e lembretes" (/perfil/rotinas — registro por convenção; spec §4.3, §4.6, §2.2-15): todas as rotinas
// vivas (pela hora), o ✓ das de hoje, "Nova rotina" (?nova=1 abre a folha — o atalho do card do Início), tocar abre para mudar ou apagar
// (a do profissional também — P8b). Avisos: notificações bloqueadas, "Alarmes e lembretes" desligado (com "Ligar"), a dica da economia de
// bateria (APK), o lembrete do site só com a página aberta, o limite de 30 e a linha fixa "Seus profissionais veem as suas rotinas" (Q4).
// Os lembretes deste aparelho se replanejam sozinhos depois de cada mudança (o aviso global LembreteDasRotinas lê a mesma consulta).
import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BatteryWarning, Bell, BellOff, CircleCheck, Eye, Info, ListChecks, Plus, TriangleAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hojeSP, rotinasDoDia } from "@/aluno-dia/regras";
import type { Rotina } from "@/aluno-dia/tipos";
import { useSessao } from "@/nucleo/sessao";
import {
  abrirAjusteDoAlarmeExato, alarmeExato, nativo, pedirPermissaoDosLembretes, permissaoDosLembretes, type AlarmeExato, type PermissaoDosLembretes,
} from "@/rotinas/aparelho";
import { ehAlunoDasRotinas, linhaDaRotina, noLimite, vivas } from "@/rotinas/regras";
import { LINHA_PROFISSIONAIS_VEEM, SELO_DO_PROFISSIONAL, TEXTOS } from "@/rotinas/textos";
import { FolhaRotina } from "@/rotinas/ui/FolhaRotina";
import { atualizarRotinas, fraseDoErro, useMarcarRotina, useMinhasRotinas } from "@/rotinas/useRotinas";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { CLASSE_PAGINA_APP, TopoItem } from "./pecas/TopoItem";

function Aviso({ icone: Icone, tom = "text-texto-3", children, ...props }: { icone: LucideIcon; tom?: string; children: ReactNode } & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-texto-2" {...props}>
      <Icone aria-hidden className={cn("mt-0.5 h-4 w-4 flex-none", tom)} strokeWidth={1.75} />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

export default function Rotinas() {
  const { usuario, situacao } = useSessao();
  const uid = usuario?.id ?? null;
  const aluno = ehAlunoDasRotinas(situacao);
  const q = useMinhasRotinas(aluno);
  const qc = useQueryClient();
  const marcar = useMarcarRotina();
  const online = useOnline();
  const app = nativo();
  const [busca, setBusca] = useSearchParams();
  const [folha, setFolha] = useState<{ aberta: boolean; rotina: Rotina | null }>(() => ({ aberta: busca.get("nova") === "1", rotina: null }));
  const [permissao, setPermissao] = useState<PermissaoDosLembretes>("sem_suporte");
  const [exato, setExato] = useState<AlarmeExato>("sem_suporte");

  // ?nova=1 (o "Criar rotina" do Início) abre a folha uma vez e sai do endereço (o Voltar não abre de novo)
  useEffect(() => {
    if (!busca.has("nova")) return;
    const limpa = new URLSearchParams(busca);
    limpa.delete("nova");
    setBusca(limpa, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura
  }, []);

  // as permissões ao abrir e ao voltar de outra tela (a pessoa pode ter mudado nas configurações do celular)
  useEffect(() => {
    const ler = () => {
      void permissaoDosLembretes().then(setPermissao);
      void alarmeExato().then(setExato);
    };
    ler();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") ler();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);

  const hoje = hojeSP();
  const lista = q.data ? vivas(q.data.rotinas) : [];
  const deHoje = new Map(q.data ? rotinasDoDia(q.data.rotinas, q.data.feitas, hoje).map((r) => [r.id, r] as const) : []);
  const cheio = noLimite(lista);
  const comLembrete = lista.some((r) => r.lembrete);

  const abrirNova = () => setFolha({ aberta: true, rotina: null });
  const aoSalvo = async (r: Rotina) => {
    await atualizarRotinas(qc, uid);
    // o 1º lembrete ligado pede a permissão (APK); negada → o aviso da página
    if (r.lembrete && app && permissao === "perguntar") {
      const nova = await pedirPermissaoDosLembretes();
      setPermissao(nova);
      if (nova !== "ligada") toast.error(TEXTOS.permissaoNegada);
    }
  };
  const alternar = (id: string, feita: boolean) => {
    if (!online) {
      toast.error(TEXTOS.semInternetMarcar);
      return;
    }
    marcar.mutate({ id, dia: hoje, feita }, { onError: (e) => toast.error(fraseDoErro(e)) });
  };

  const estado = !situacao ? "carregando" : !aluno ? "sem-matricula" : q.data ? (lista.length ? "lista" : "vazia") : q.isError ? "erro" : !online ? "sem-internet" : "carregando";

  return (
    <div className={CLASSE_PAGINA_APP} data-pagina-rotinas={estado}>
      <TopoItem titulo={TEXTOS.pagina}
        acao={aluno && q.data ? <BotaoIcone icone={Plus} rotulo={TEXTOS.nova} onClick={abrirNova} disabled={cheio || !online} data-rotinas-nova /> : undefined} />

      {LINHA_PROFISSIONAIS_VEEM && aluno && <Aviso icone={Eye} data-rotinas-profissionais-veem="">{LINHA_PROFISSIONAIS_VEEM}</Aviso>}
      {comLembrete && app && permissao === "bloqueada" && (
        <Aviso icone={BellOff} tom="text-rosa-3" data-rotinas-aviso="notificacoes">{TEXTOS.notificacoesBloqueadas}</Aviso>
      )}
      {comLembrete && exato === "desligado" && (
        <div className="flex items-start gap-3" data-rotinas-aviso="alarme-exato">
          <Aviso icone={TriangleAlert} tom="text-ambar-3">{TEXTOS.alarmeExato}</Aviso>
          <Botao tamanho="sm" onClick={() => void abrirAjusteDoAlarmeExato().then(setExato)} data-rotinas-ligar-alarme>{TEXTOS.ligar}</Botao>
        </div>
      )}
      {comLembrete && app && <Aviso icone={BatteryWarning} data-rotinas-aviso="bateria">{TEXTOS.bateria}</Aviso>}
      {comLembrete && !app && <Aviso icone={Info} data-rotinas-site="">{TEXTOS.site}</Aviso>}
      {cheio && <Aviso icone={Info} tom="text-ambar-3" data-rotinas-aviso="limite">{TEXTOS.limite}</Aviso>}

      {estado === "carregando" && <EstadoCarregando linhas={4} rotulo="Carregando as rotinas" />}
      {estado === "sem-matricula" && <EstadoVazio icone={ListChecks} titulo="As rotinas são de quem é aluno no Physiq." />}
      {estado === "erro" && <EstadoErro titulo={TEXTOS.erroLer} aoTentar={() => void q.refetch()} />}
      {estado === "sem-internet" && <EstadoSemInternet texto={TEXTOS.semConexaoTexto} />}
      {estado === "vazia" && (
        <EstadoVazio icone={ListChecks} titulo={TEXTOS.paginaVazia} texto={TEXTOS.vazio}
          acao={<Botao variante="w" icone={Plus} onClick={abrirNova} disabled={!online} data-rotinas-criar>{TEXTOS.nova}</Botao>} />
      )}
      {estado === "lista" && (
        <Cartao className="px-3.5 py-1">
          <ul className="divide-y divide-linha-3">
            {lista.map((r) => {
              const hojeTem = deHoje.get(r.id);
              return (
                <li key={r.id} className="flex min-h-[56px] items-center gap-3 py-2" data-rotina-linha={r.id} data-rotina-origem={r.origem}>
                  {hojeTem ? (
                    <button type="button" onClick={() => alternar(r.id, !hojeTem.feita)} aria-pressed={hojeTem.feita} className="flex-none" data-rotina-marcar={r.id}
                      data-rotina-feita={hojeTem.feita ? "1" : "0"} aria-label={`${r.nome}: ${hojeTem.feita ? "feita hoje (toque para desmarcar)" : "marcar como feita hoje"}`}>
                      <CircleCheck aria-hidden className={cn("h-[20px] w-[20px]", hojeTem.feita ? "text-verde-2" : "text-texto-4")} strokeWidth={1.9} />
                    </button>
                  ) : (
                    <span aria-hidden className="h-[20px] w-[20px] flex-none" />
                  )}
                  <button type="button" onClick={() => setFolha({ aberta: true, rotina: r })} className="flex min-w-0 flex-1 items-center gap-3 text-left" data-rotina-abrir={r.id}>
                    <span className="w-[44px] flex-none text-[13px] font-semibold tabular-nums text-texto-2">{r.horario ?? "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-texto" data-rotina-nome-linha>{r.nome}</span>
                      <span className="block truncate text-[11.5px] text-texto-3">{linhaDaRotina(r)}</span>
                    </span>
                    {r.origem === "profissional" && <Chip tom="c" className="flex-none" data-rotina-selo>{SELO_DO_PROFISSIONAL}</Chip>}
                    {r.lembrete ? <Bell aria-label="Com lembrete" className="h-4 w-4 flex-none text-violeta-3" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <FolhaRotina aberta={folha.aberta} aoMudar={(v) => setFolha((x) => ({ ...x, aberta: v }))} modo={{ tipo: "aluno" }} rotina={folha.rotina}
        aoSalvo={aoSalvo} aoApagado={() => atualizarRotinas(qc, uid)} />
    </div>
  );
}
```

- [ ] **Step 3: Commit** — `feat(w-a): Perfil › Rotinas e lembretes (/perfil/rotinas) e o item no Perfil` com os 4 arquivos; `feita.sh 7 "página 9/9, Perfil 16/16" "<placar>"`.

---

### Task 8: O aviso global dos lembretes — `src/ui/avisos/LembreteDasRotinas.tsx` (TDD) + as guardas

**Files:** Create `src/ui/avisos/LembreteDasRotinas.tsx`, `src/ui/avisos/LembreteDasRotinas.test.tsx`.
**Estimativa:** 30 min (calibrado 5–7).

- [ ] **Step 1: O teste (vermelho)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/ui/avisos/LembreteDasRotinas.test.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/ui/avisos/LembreteDasRotinas.test.tsx`
  → FAIL `Failed to resolve import "./LembreteDasRotinas"`.

`src/ui/avisos/LembreteDasRotinas.test.tsx`:
```tsx
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";
import { PRINCIPAL_STORAGE_KEY } from "@/integrations/principal/client";
import { matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  dados: null as null | Record<string, unknown>,
  ler: vi.fn(),
  marcar: vi.fn(),
  nativo: true,
  acoes: [] as ((e: unknown) => void)[],
  estado: [] as ((e: { isActive: boolean }) => void)[],
  pendentes: [] as { id: number; title?: string; body?: string; extra?: unknown }[],
  LN: {
    getPending: vi.fn(),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async (_pedido: unknown) => ({ notifications: [] as unknown[] })),
    checkPermissions: vi.fn(async () => ({ display: "granted" })),
    createChannel: vi.fn(async () => {}),
    registerActionTypes: vi.fn(async () => {}),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: [] })),
    removeDeliveredNotifications: vi.fn(async () => {}),
    addListener: vi.fn(),
  },
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  notificacao: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerMinhasRotinas: (...a: unknown[]) => h.ler(...a),
  marcarRotina: (...a: unknown[]) => h.marcar(...a),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: h.LN }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (_n: string, f: (e: { isActive: boolean }) => void) => {
      h.estado.push(f);
      return { remove: vi.fn() };
    }),
  },
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { _zerarAcoesDeNotificacao } from "@/lib/acoesDeNotificacao";
import { _zerarAparelho } from "@/rotinas/aparelho";
import { instante } from "@/rotinas/lembretes";
import LembreteDasRotinas from "./LembreteDasRotinas";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "cre", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "10:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});
function Onde() {
  const l = useLocation();
  return <div data-testid="rota">{l.pathname}</div>;
}
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/"]}>
        <LembreteDasRotinas />
        <Routes>
          <Route path="*" element={<Onde />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const sessaoGuardada = (uid: string) => localStorage.setItem(PRINCIPAL_STORAGE_KEY, JSON.stringify({ access_token: "x", user: { id: uid } }));

beforeEach(() => {
  _zerarAcoesDeNotificacao();
  _zerarAparelho();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(instante("2026-09-30", "09:30"));
  localStorage.clear();
  sessionStorage.clear();
  h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [matricula()] }) };
  h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina()], feitas: [] };
  h.nativo = true;
  h.acoes = [];
  h.estado = [];
  h.pendentes = [];
  h.ler.mockReset();
  h.ler.mockImplementation(async () => h.dados);
  h.marcar.mockReset();
  h.marcar.mockResolvedValue({ ok: true, feita: true });
  for (const f of Object.values(h.LN)) f.mockClear();
  h.LN.getPending.mockImplementation(async () => ({ notifications: h.pendentes }));
  h.LN.addListener.mockImplementation(async (_n: string, f: (e: unknown) => void) => {
    h.acoes.push(f);
    return { remove: vi.fn() };
  });
  for (const f of [h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.notificacao.mockReset();
  vi.stubGlobal("Notification", Object.assign(function Notificacao(titulo: string, o: unknown) {
    h.notificacao(titulo, o);
  }, { permission: "granted" }));
  sessaoGuardada("u1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("W-A P3 — o aviso global dos lembretes (APK)", () => {
  it("ao abrir: lê as rotinas e agenda as 7 avulsas deste login (faixa 40000–40299, canal privado, 'Feito')", async () => {
    montar();
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalledTimes(1));
    const n = (h.LN.schedule.mock.calls[0][0] as { notifications: { id: number; extra: { dono: string } }[] }).notifications;
    expect(n.map((x) => x.id)).toEqual([40003, 40004, 40005, 40006, 40007, 40001, 40002]);
    expect(n.every((x) => x.extra.dono === "u1")).toBe(true);
  });

  it("'Feito' de uma rotina deste login: abre a página, marca o dia daquela ocorrência e avisa com 'Desfazer'", async () => {
    montar();
    await waitFor(() => expect(h.acoes).toHaveLength(1));
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalled());
    h.acoes[0]({ actionId: "feito", notification: { id: 40003, extra: { rotina_id: "cre", dono: "u1", dia: "2026-09-30", hora: "10:00" } } });
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("cre", "2026-09-30", true));
    await waitFor(() => expect(document.querySelector("[data-testid=rota]")?.textContent).toBe("/perfil/rotinas"));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Creatina feita", expect.objectContaining({ action: expect.objectContaining({ label: "Desfazer" }) })));
  });

  it("app FECHADO: o 'Feito' chegou antes do aviso montar (o plugin guardou) → marca assim que monta", async () => {
    // a consulta nova montou antes e registrou o ouvinte único; o toque chega e não é dela
    const { ouvirAcoesDeNotificacao } = await import("@/lib/acoesDeNotificacao");
    ouvirAcoesDeNotificacao((e) => (e.notification?.extra as { rota?: string } | undefined)?.rota === "/perfil/agenda");
    h.acoes[0]({ actionId: "feito", notification: { id: 40005, extra: { rotina_id: "cre", dono: "u1", dia: "2026-09-30", hora: "10:00" } } });
    montar();
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("cre", "2026-09-30", true));
  });

  it("ação de rotina de OUTRO login (aparelho de 2 pessoas): ninguém marca", async () => {
    montar();
    await waitFor(() => expect(h.acoes).toHaveLength(1));
    h.acoes[0]({ actionId: "feito", notification: { id: 40003, extra: { rotina_id: "cre", dono: "outra-pessoa", dia: "2026-09-30", hora: "10:00" } } });
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.marcar).not.toHaveBeenCalled();
  });

  it("voltou para a frente: replaneja e relê", async () => {
    montar();
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.estado).toHaveLength(1));
    h.estado[0]({ isActive: true });
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(h.LN.getPending.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("Sair: a casca desmonta o aviso e o login guardado já não é o dele → esvazia a faixa; o mesmo login guardado (só remontou) → não", async () => {
    const tela = montar();
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalled());
    h.pendentes = [{ id: 40003, title: "t", body: "b" }, { id: 2001, title: "t", body: "b" }];
    tela.unmount();
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.LN.cancel).not.toHaveBeenCalled();
    const outra = montar();
    await waitFor(() => expect(h.ler).toHaveBeenCalled());
    localStorage.removeItem(PRINCIPAL_STORAGE_KEY);
    outra.unmount();
    await waitFor(() => expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40003 }] }));
  });

  it("quem não é aluno: nada é lido nem agendado", async () => {
    h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [] }) };
    montar();
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.ler).not.toHaveBeenCalled();
    expect(h.LN.schedule).not.toHaveBeenCalled();
  });
});

describe("W-A P3 — o aviso no site (a página aberta)", () => {
  it("no horário: o toast 'Hora da rotina' com 'Marcar como feita' + a notificação do navegador (já permitida); 1 vez por dia nesta aba", async () => {
    h.nativo = false;
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina({ horario: "09:28", tipo: "remedio", nome: "Losartana", detalhe: "50 mg" })], feitas: [] };
    const tela = montar();
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    const [titulo, op] = h.toast.mock.calls[0] as [string, { description: string; action: { label: string; onClick: () => void } }];
    expect(titulo).toBe("Hora da rotina");
    expect(op.description).toBe("Losartana · 50 mg");
    expect(op.action.label).toBe("Marcar como feita");
    // a notificação do navegador segue a Q3 (remédio sem o nome)
    expect(h.notificacao).toHaveBeenCalledWith("Hora do seu remédio · 09:28", expect.objectContaining({ body: "Toque para ver e marcar como feito." }));
    op.action.onClick();
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("cre", "2026-09-30", true));
    expect(h.LN.schedule).not.toHaveBeenCalled();
    tela.unmount();
    montar();
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(3));
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it("antes da hora: nada", async () => {
    h.nativo = false;
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina({ horario: "09:45" })], feitas: [] };
    montar();
    await waitFor(() => expect(h.ler).toHaveBeenCalled());
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.toast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: O aviso (verde)** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh src/ui/avisos/LembreteDasRotinas.tsx && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/ui/avisos/LembreteDasRotinas.test.tsx`
  → `Tests 9 passed (9)`.

`src/ui/avisos/LembreteDasRotinas.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { App as CapApp } from "@capacitor/app";
import { toast } from "sonner";
import { ErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import type { MinhasRotinas } from "@/aluno-dia/tipos";
import { ouvirAcoesDeNotificacao } from "@/lib/acoesDeNotificacao";
import { useSessao } from "@/nucleo/sessao";
import {
  gravarAvisadasNoSite, lerAvisadasNoSite, limparLembretesDoAparelho, loginGuardadoNoAparelho, nativo, notificarNoNavegador, reconciliarLembretes,
} from "@/rotinas/aparelho";
import { acaoDaNotificacao, chaveDoAvisoNoSite, deveLimparAoDesmontar, rotinasParaAvisarNoSite, textoDoLembrete } from "@/rotinas/lembretes";
import { ROTA_ROTINAS, ehAlunoDasRotinas } from "@/rotinas/regras";
import { TEXTOS, TITULO_DO_LEMBRETE } from "@/rotinas/textos";
import { atualizarRotinas, fraseDoErro, useMarcarRotina, useMinhasRotinas } from "@/rotinas/useRotinas";

/** Site: de quanto em quanto tempo a página aberta confere a hora (spec §5.4: 30 s). */
export const CONFERIR_NO_SITE_MS = 30_000;

/**
 * Os lembretes das ROTINAS (W-A P3 — spec §4.6, §5.4; revisões C3 e I6), aviso global da casca (registrado por convenção em src/ui/avisos —
 * monta para quem entrou; só faz algo para quem é aluno). A consulta é a MESMA do card do Início e da página (useMinhasRotinas).
 *  · APK: a cada dado novo (abrir, voltar para a frente, criar/mudar/apagar/marcar, as feitas de outro aparelho) replaneja as notificações
 *    locais deste aparelho (src/rotinas/aparelho.ts: 7 avulsas por rotina, faixa 40000–40299); o toque e o "Feito" marcam o dia daquela
 *    ocorrência e abrem a página (toast "Creatina feita · Desfazer"; sem internet, avisa — sem fila no aparelho); ação de outro login: nada.
 *  · Sair, trocar de conta, excluir a conta: a casca desmonta os avisos quando o login sai (App.tsx) — sem o login de quem estava aqui
 *    guardado no aparelho, a faixa inteira é esvaziada (sem chamar o Auth: a guarda do navegador da hml-21).
 *  · Site (e iPhone): com a página aberta, confere a cada 30 s e, no horário, um toast com "Marcar como feita" (+ a notificação do
 *    navegador, só se já estiver permitida), 1 vez por rotina por dia nesta aba.
 */
export default function LembreteDasRotinas() {
  const { usuario, situacao } = useSessao();
  const uid = usuario?.id ?? null;
  const aluno = ehAlunoDasRotinas(situacao);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useMinhasRotinas(aluno);
  const marcar = useMarcarRotina();
  const app = nativo();
  const dados = useRef<MinhasRotinas | null>(null);
  dados.current = q.data ?? null;
  const marcarRef = useRef(marcar);
  marcarRef.current = marcar;

  /** Marca pelo aviso (o "Feito", o toque, o toast do site): otimista, com "Desfazer". */
  const marcarPeloAviso = useRef((rotina: string, dia: string, nomeDoAviso: string | null = null) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error(TEXTOS.semInternetMarcar);
      return;
    }
    const nome = dados.current?.rotinas.find((r) => r.id === rotina)?.nome ?? nomeDoAviso ?? "Rotina";
    marcarRef.current.mutate({ id: rotina, dia, feita: true }, {
      onSuccess: () => {
        toast.success(TEXTOS.feita(nome), {
          duration: 8000,
          action: { label: TEXTOS.desfazer, onClick: () => marcarRef.current.mutate({ id: rotina, dia, feita: false }) },
        });
      },
      onError: (e) => toast.error(e instanceof ErroAlunoDia && e.codigo === "dados_invalidos" ? TEXTOS.lembreteAntigo : fraseDoErro(e)),
    });
  }).current;

  // APK: o plano a cada dado novo
  useEffect(() => {
    if (!app || !uid || !aluno || !q.data) return;
    void reconciliarLembretes(q.data.rotinas, q.data.feitas, uid);
  }, [app, uid, aluno, q.data]);

  // APK: de volta para a frente → replaneja na hora (o dia pode ter virado) e relê (as feitas de outro aparelho)
  useEffect(() => {
    if (!app || !uid || !aluno) return;
    const ouvinte = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      const d = dados.current;
      if (d) void reconciliarLembretes(d.rotinas, d.feitas, uid);
      void atualizarRotinas(qc, uid);
    });
    return () => {
      void ouvinte.then((o) => o.remove());
    };
  }, [app, uid, aluno, qc]);

  // APK: o toque e o "Feito" (pelo ouvinte único do app — src/lib/acoesDeNotificacao.ts)
  useEffect(() => {
    if (!app) return;
    return ouvirAcoesDeNotificacao((e) => {
      const a = acaoDaNotificacao(e, uid);
      if (a.tipo === "nao_e_rotina") return false;
      if (a.tipo === "marcar") {
        navigate(ROTA_ROTINAS);
        marcarPeloAviso(a.rotina_id, a.dia, a.nome);
      }
      return true;
    });
  }, [app, uid, navigate, marcarPeloAviso]);

  // Sair / trocar de conta / excluir a conta: a casca desmonta este aviso quando o login sai
  useEffect(() => {
    if (!uid) return;
    return () => {
      if (deveLimparAoDesmontar(uid, loginGuardadoNoAparelho())) void limparLembretesDoAparelho();
    };
  }, [uid]);

  // Site: com a página aberta, no horário
  useEffect(() => {
    if (app || !uid || !aluno) return;
    const conferir = () => {
      const d = dados.current;
      if (!d) return;
      const agora = new Date();
      const hoje = hojeSP(agora);
      const avisadas = lerAvisadasNoSite();
      const devidas = rotinasParaAvisarNoSite(d.rotinas, d.feitas, avisadas, agora);
      if (!devidas.length) return;
      for (const r of devidas) {
        avisadas.add(chaveDoAvisoNoSite(r.id, hoje));
        const t = textoDoLembrete(r);
        notificarNoNavegador(`rotina-${r.id}-${hoje}`, t.titulo, t.corpo);
        toast(TITULO_DO_LEMBRETE, {
          id: `rotina-${r.id}-${hoje}`,
          description: r.detalhe ? `${r.nome} · ${r.detalhe}` : r.nome,
          duration: 60_000,
          action: { label: TEXTOS.marcarComoFeita, onClick: () => marcarPeloAviso(r.id, hoje, r.nome) },
        });
      }
      gravarAvisadasNoSite(avisadas);
    };
    conferir();
    const id = window.setInterval(conferir, CONFERIR_NO_SITE_MS);
    return () => window.clearInterval(id);
  }, [app, uid, aluno, q.data, marcarPeloAviso]);

  return null;
}
```

- [ ] **Step 3: As guardas com todos os arquivos novos no lugar** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/integrations/semBancoNoNavegador.test.ts src/aluno-dia/semBancoDireto.test.ts src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts`
  → `Test Files 4 passed` (a do navegador: nenhum achado novo — o "Sair" sem `.auth.`; a da W-A: os arquivos da P3 sem `.from(`/`.rpc(`/`.storage`;
  nenhum diálogo nativo; a grade dos dias com a coluna base).
- [ ] **Step 4: Commit** — `feat(w-a): o aviso global dos lembretes (APK: replaneja e atende o "Feito"; site: o aviso com a página aberta; Sair esvazia a faixa)`
  com os 2 arquivos; `feita.sh 8 "aviso global 9/9; guardas 4/4 arquivos" "<placar>"`.

---

### Task 9: A linha do resumo da exclusão (TDD)

**Files:** Modify `src/app-aluno/perfil/pecas/SheetExcluir.tsx`, `src/painel/configuracoes/excluirConta/regras.ts`, `src/painel/configuracoes/excluirConta/regras.test.ts`,
`src/app-aluno/abas/Perfil.test.tsx`.
**Estimativa:** 10 min (calibrado 3–4).

- [ ] **Step 1: Os testes (vermelho)** — `cd ~/projetos/physiqcalc-wa-p3 && git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/T9-teste.patch && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/painel/configuracoes/excluirConta/regras.test.ts src/app-aluno/abas/Perfil.test.tsx`
  → `regras.test.ts` 1 falha (13 passam); `Perfil.test.tsx` 1 falha (o "Excluir: confere antes…"; 15 passam).

`~/projetos/physiqcalc-scratch/w-a/p3/patches/T9-teste.patch`:
```diff
--- a/src/painel/configuracoes/excluirConta/regras.test.ts
+++ b/src/painel/configuracoes/excluirConta/regras.test.ts
@@ -75,6 +75,10 @@
     expect(apaga[0]).toMatch(/O seu login no Physiq/);
     expect(apaga).toContain("O seu histórico de treino pessoal: 4 treinos feitos e 30 séries");
     expect(apaga).toContain("O que você enviou como aluno: fotos do diário e refeições/metas marcadas (3)");
+    expect(apaga.some((l) => l.startsWith("Rotinas, alimentos e receitas"))).toBe(false); // sem nada da W-A, sem a linha
+    // W-A P3: o `rotinas_e_dieta` da parte de aluno da excluir_conta_profissional (P1)
+    const comWa = listaApaga(conferencia({ aluno: { matriculas: 1, contas: ["X"], apaga: { rotinas_e_dieta: 7 }, mantem: {} } }));
+    expect(comWa).toContain("Rotinas, alimentos e receitas que você criou como aluno (7)");
     const fica = listaFica(conferencia());
     expect(fica[0]).toMatch(/Res\. CFN 594\/2017 e Lei 13\.787\/2018: 20 anos/);
     expect(fica).toContain("Os treinos e exercícios que você montou para os alunos (4) continuam com eles.");
--- a/src/app-aluno/abas/Perfil.test.tsx
+++ b/src/app-aluno/abas/Perfil.test.tsx
@@ -205,7 +205,7 @@
   it("Excluir: confere antes, o botão só liga com EXCLUIR digitado e então exclui e sai", async () => {
     h.conferencia = {
       ok: true, simulacao: true,
-      apaga: { principal: { diario_alimentar: 2 }, treino: { treino_historico: 6, tb_treino_series: 28 } },
+      apaga: { principal: { diario_alimentar: 2, rotinas_e_dieta: 4 }, treino: { treino_historico: 6, tb_treino_series: 28 } },
       mantem: { principal: { matriculas: 1, cobrancas: 3 }, treino: { physiq_avaliacoes: 5 } },
     };
     h.excluir.mockResolvedValue({ ok: true });
@@ -213,6 +213,8 @@
     fireEvent.click(await screen.findByText("Excluir minha conta"));
     expect(await screen.findByText(/6 treino\(s\) feito\(s\) e 28 série\(s\)/)).toBeInTheDocument();
     expect(screen.getByText(/Avaliações e fotos de avaliação \(5\)/)).toBeInTheDocument();
+    // W-A P3: o que a P1 conta na excluir_dados_aluno (rotinas, alimentos, receitas e o dia)
+    expect(screen.getByText("Rotinas, alimentos e receitas que você criou (4)")).toBeInTheDocument();
     const botao = document.querySelector("[data-excluir-confirmar]") as HTMLButtonElement;
     expect(botao).toBeDisabled();
     fireEvent.change(screen.getByLabelText("Para confirmar, digite EXCLUIR"), { target: { value: "EXCLUI" } });
```

- [ ] **Step 2: As 2 linhas (verde)** — `cd ~/projetos/physiqcalc-wa-p3 && git apply ~/projetos/physiqcalc-scratch/w-a/p3/patches/T9-codigo.patch && bash ~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh src/painel/configuracoes/excluirConta/regras.test.ts src/app-aluno/abas/Perfil.test.tsx`
  → `Tests 30 passed (30)` (14 + 16).

`~/projetos/physiqcalc-scratch/w-a/p3/patches/T9-codigo.patch`:
```diff
--- a/src/app-aluno/perfil/pecas/SheetExcluir.tsx
+++ b/src/app-aluno/perfil/pecas/SheetExcluir.tsx
@@ -45,6 +45,9 @@
   if (proprios) apaga.push(`Treinos, exercícios e academias que você criou (${proprios})`);
   const enviados = soma(ap, ["diario_alimentar", "refeicoes_concluidas", "metas_concluidas"]);
   if (enviados) apaga.push(`O que você enviou: fotos do diário e refeições/metas marcadas (${enviados})`);
+  // W-A (P1: o `rotinas_e_dieta` da excluir_dados_aluno — rotinas, alimentos, receitas e o que pôs e tirou no dia)
+  const criados = soma(ap, ["rotinas_e_dieta"]);
+  if (criados) apaga.push(`Rotinas, alimentos e receitas que você criou (${criados})`);
   apaga.push("A foto do seu perfil e os seus avisos");
   const fica: string[] = [];
   if (Number(mp.matriculas)) fica.push("O seu cadastro e a matrícula (desligados do seu login)");
--- a/src/painel/configuracoes/excluirConta/regras.ts
+++ b/src/painel/configuracoes/excluirConta/regras.ts
@@ -117,6 +117,9 @@
   if (soma(t, ["physiq_recebimentos"])) linhas.push("Os dados de recebimento que estavam no app antigo de treino");
   const enviados = soma(c.aluno?.apaga, ["diario_alimentar", "refeicoes_concluidas", "metas_concluidas"]);
   if (enviados) linhas.push(`O que você enviou como aluno: fotos do diário e refeições/metas marcadas (${enviados})`);
+  // W-A (P1: o `rotinas_e_dieta` da parte de aluno da excluir_conta_profissional)
+  const criados = soma(c.aluno?.apaga, ["rotinas_e_dieta"]);
+  if (criados) linhas.push(`Rotinas, alimentos e receitas que você criou como aluno (${criados})`);
   return linhas;
 }
 
```

- [ ] **Step 3: Commit** — `feat(w-a): a linha "Rotinas, alimentos e receitas que você criou" no resumo da exclusão (app e painel)` com os 4 arquivos;
  `feita.sh 9 "exclusão 30/30" "<placar>"`.

---

### Task 10: Os 2 E2E — `e2e/wa/telas_rotinas.py` e `e2e/wa/apk_rotinas.py` (`--seco`, compila, commit)

**Files:** Create `e2e/wa/telas_rotinas.py`, `e2e/wa/apk_rotinas.py`.
**Estimativa:** 30 min (calibrado 3–5).

- [ ] **Step 1: Os arquivos e as provas sem rede**

Run: `cd ~/projetos/physiqcalc-wa-p3 && bash ~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh e2e/wa/telas_rotinas.py e2e/wa/apk_rotinas.py && PYTHONDONTWRITEBYTECODE=1 python3 e2e/wa/telas_rotinas.py --seco && python3 -c "compile(open('e2e/wa/telas_rotinas.py').read(), 'telas_rotinas.py', 'exec'); compile(open('e2e/wa/apk_rotinas.py').read(), 'apk_rotinas.py', 'exec'); print('compila ok')"`
Expected: `35/35 seletores e textos do E2E no código` e `compila ok`.

`e2e/wa/telas_rotinas.py`:
```python
#!/usr/bin/env python3
"""Physiq W-A P3 — E2E de TELA das rotinas (Edge; celular 390 × 844 e computador 1280 × 883). Spec W-A §4.3, §4.6, §6 "P3", §7.
Contas de TESTE (hml-17): w5p-aluna (a aluna dos 2 profissionais — as rotinas são dela) e w5p-personal (o profissional que SEMEIA a rotina com
selo pela função aluno-dia, prof_rotina_salvar — o "semeada pelo api.py" da spec). Casos (na ordem; cada um depende do anterior):
  R0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  R1  r_inicio_vazio   o Início sem nenhuma rotina: "Crie a sua 1ª rotina…" + "Criar rotina"; ao abrir, 0 gravação e ≥ 1 `ler` q=rotinas
  R2  r_nova           "Criar rotina" → /perfil/rotinas com a folha aberta; salvar sem nome = o erro e 0 POST; a Creatina (detalhe 5 g,
                       suplemento, +30 min, todos os dias, lembrete) → 1 rotina_salvar; no banco: dela, origem aluno, lembrete
  R3  a 2ª rotina pela folha: o Remédio (remédio, 21:00, Seg a Sex, lembrete)
  R4  a do profissional pela função (w5p-personal, a matrícula A): "Água 2 L", hábito, 10:00, todos os dias, sem lembrete → 200 ok
  R5  r_pagina         /perfil/rotinas: as 3 pela hora, o selo "do seu profissional" na Água, a linha "Seus profissionais veem…" (Q4)
                       e a do site ("o lembrete aparece quando o Physiq está aberto")
  R6  mudar: a Creatina 5 g → 3 g pela folha; no banco: o detalhe e o histórico "mudou" (quem: aluno)
  R7  r_inicio         o card "Rotinas de hoje" com as de hoje e o selo; ✓ na Creatina → no banco a feita de hoje; desmarcar → sai;
                       marcar de novo (fica feita)
  R8  r_site_aviso     o aviso do SITE com o relógio da página adiantado (Playwright clock): a rotina "Aviso" (+2 min, lembrete) criada pela
                       função como a aluna; a página aberta; o relógio +3 min → o toast "Hora da rotina" com "Marcar como feita" → no banco,
                       feita hoje. (Perto da meia-noite de SP — 23:45+ — não roda: o dia viraria só na página.)
  R9  apagar a do PROFISSIONAL pelo app (P8b): a folha → "Apagar rotina" → a confirmação do app → some da página; no banco: arquivada, por
      ela, histórico "arquivou" (quem: aluno)
  R10 apagar o Remédio (o dela)
  --loja: R0 (a marca da loja) + R1 + a Creatina pela função + R7 (o card e o ✓) + R5 (a página) — o print com o prefixo loja_.
A massa ("WA E2E P3 <hhmmss>") vai para o estado (~/projetos/physiqcalc-scratch/w-a/p3-estado.json) ANTES de nascer e sai no fim (e no
--limpar): as rotinas da aluna com a marca e os avisos "Seu profissional criou uma rotina para você" da rodada. No fim, as sobras da W-A = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging
(https://physiqcalc-staging.vercel.app) · prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador — nenhuma gravação sai —,
a conta de teste da produção aluno-calc; P1 o card do Início abre sem gravar e com o `ler` q=rotinas, P2 a página abre; prints prod_r_inicio,
prod_r_pagina; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p3/<base>[-loja]/<caso>_<largura>.png.
Saída: ~/projetos/physiqcalc-scratch/w-a/p3/telas_rotinas_<base>.txt (só contagens, status e códigos). Logout local das sessões do teste.
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código (a tela não mudou por baixo dele).
Uso: python3 e2e/wa/telas_rotinas.py --base local|staging|prod [--loja] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
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
ESTADO = B.SCRATCH / "w-a" / "p3-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p3"
TITULO_AVISO_PROF = "Seu profissional criou uma rotina para você"
URL_ALUNO_DIA = f"{B.H.API_P}/functions/v1/aluno-dia"

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/rotinas/ui/RotinasDeHoje.tsx": ["data-card-rotinas-hoje", "data-rotinas-criar", "data-rotina-hoje={r.id}", "data-rotina-marcar={r.id}",
                                         "data-rotina-feita={r.feita ? \"1\" : \"0\"}", "data-rotina-selo", "data-rotinas-hoje={doDia.length}"],
    "src/app-aluno/perfil/Rotinas.tsx": ["data-pagina-rotinas", "data-rotina-linha={r.id}", "data-rotina-abrir={r.id}", "data-rotina-marcar={r.id}",
                                         "data-rotinas-profissionais-veem", "data-rotinas-site", "data-rotina-nome-linha", "data-rotinas-nova"],
    "src/rotinas/ui/FolhaRotina.tsx": ["data-folha-rotina", "data-rotina-nome", "data-rotina-detalhe", "data-rotina-horario", "data-rotina-salvar",
                                       "data-rotina-apagar", "data-rotina-lembrete"],
    "src/rotinas/ui/DiasDaSemana.tsx": ["data-rotina-atalho={a.atalho}"],
    "src/rotinas/regras.ts": ['"Dê um nome à rotina."', 'ROTA_ROTINAS = "/perfil/rotinas"'],
    "src/rotinas/textos.ts": ['"Hora da rotina"', '"Marcar como feita"', '"do seu profissional"', '"Seus profissionais veem as suas rotinas."',
                              '"Crie a sua 1ª rotina (creatina, remédio, água…)"', '"Remédio"'],
    "src/ui/avisos/LembreteDasRotinas.tsx": ["CONFERIR_NO_SITE_MS = 30_000", "TEXTOS.marcarComoFeita"],
    "src/app-aluno/abas/Inicio.tsx": ['["CardRotinasHoje"]'],
    "src/app-aluno/abas/Perfil.tsx": ['rotulo="Rotinas e lembretes" para="/perfil/rotinas"'],
}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p3") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.ids: dict[str, str] = {}

    def tela(self, nav, nome: str, desktop: bool = False) -> B.Tela:
        return B.Tela(nav, self.base, "p3", nome, desktop=desktop)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, caso)
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a limpeza) e a função ─────────────────────────
def uid(conta: str) -> str:
    return B.ler(f"select id::text as id from auth.users where lower(email) = {B.txt(B.CONTAS[conta])}")[0]["id"]


def matricula_a(aluna: str, personal: str) -> str:
    r = B.ler(f"""select p.id::text as id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {B.txt(aluna)} and p.deleted_at is null and c.origem <> 'app' and p.personal_id = {B.txt(personal)}
                  order by p.created_at limit 1""")
    if not r:
        raise SystemExit("a matrícula A da w5p-aluna (com o w5p-personal) não existe no staging — nada foi gravado")
    return r[0]["id"]


def rotinas(e: dict) -> list[dict]:
    return B.ler(f"""select r.id::text as id, r.nome, r.detalhe, r.origem, r.lembrete, to_char(r.horario, 'HH24:MI') as horario,
                            r.arquivada_em is not null as arquivada, r.arquivada_por::text as arquivada_por,
                            (select count(*) from {S}.rotinas_feitas f where f.rotina_id = r.id
                               and f.dia = (now() at time zone 'America/Sao_Paulo')::date) as feita_hoje,
                            (select coalesce(json_agg(json_build_object('o_que', h.o_que, 'quem', h.quem) order by h.em), '[]'::json)
                               from {S}.rotinas_historico h where h.rotina_id = r.id) as historico
                       from {S}.rotinas r where r.dono_user_id = {B.txt(e['aluna'])} and r.nome like {B.txt(e['marca'] + '%')}
                      order by r.criada_em""")


def rotina(e: dict, sufixo: str) -> dict | None:
    return next((r for r in rotinas(e) if r["nome"] == f"{e['marca']} {sufixo}"), None)


def vivas_da_aluna(aluna: str) -> int:
    return B.ler(f"select count(*) as n from {S}.rotinas where dono_user_id = {B.txt(aluna)} and arquivada_em is null")[0]["n"]


def funcao(token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": ORIGEM}
    st, r, _h = B5.http("POST", URL_ALUNO_DIA, corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def agora_sp() -> dt.datetime:
    return dt.datetime.now(SP)


def hora_sp(minutos: int) -> str:
    return (agora_sp() + dt.timedelta(minutes=minutos)).strftime("%H:%M")


def limpar(e: dict | None = None) -> dict:
    """Desfaz a massa do estado (as rotinas da aluna com a marca e os avisos da rodada) e devolve as sobras da W-A (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {})
    if e.get("aluna") and e.get("marca"):
        B.escrever(f"delete from {S}.rotinas where dono_user_id = {B.txt(e['aluna'])} and nome like {B.txt(e['marca'] + '%')}")
        B.escrever(f"""delete from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral' and titulo = {B.txt(TITULO_AVISO_PROF)}
                        and criado_em >= {B.txt(e['inicio'])}""")
    ESTADO.write_text("{}", encoding="utf-8")
    sobras = {k: int(v) for k, v in B.Massa().sobras().items()}
    if e.get("aluna") and e.get("marca"):
        sobras["avisos_da_rodada"] = int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                                                   and titulo = {B.txt(TITULO_AVISO_PROF)} and criado_em >= {B.txt(e['inicio'])}""")[0]["n"])
    return sobras


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas à aluno-dia que NÃO são leitura (a Guarda: leitura = { acao: "ler" })."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] != "ler"]


def leituras_de_rotinas(t: B.Tela) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] == "ler" and '"q":"rotinas"' in (p["corpo"] or "").replace(" ", ""))


def salvar_rotina_pela_folha(t: B.Tela, nome: str, detalhe: str, tipo: str | None, horario: str, atalho: str, lembrete: bool) -> None:
    t.pg.locator("[data-rotina-nome]").fill(nome)
    t.pg.locator("[data-rotina-detalhe]").fill(detalhe)
    if tipo:
        t.pg.get_by_role("radio", name=tipo).click()
    t.pg.locator("[data-rotina-horario]").fill(horario)
    t.clicar(f'[data-rotina-atalho="{atalho}"]')
    ligado = (t.attr("[data-rotina-lembrete]", "data-rotina-lembrete") or ["0"])[0] == "1"
    if ligado != lembrete:
        t.clicar("[data-rotina-lembrete]")


def esperar_linha(t: B.Tela, nome: str, timeout: float = 30) -> bool:
    return t.esperar(lambda: nome in [x.strip() for x in t.pg.locator("[data-rotina-nome-linha]").all_inner_texts()], timeout)


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build", False)
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "R0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"R0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def caso_vazio_e_nova(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "inicio-vazio")
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") == ["vazio"], 45)
        o.ok(ok and "Crie a sua 1ª rotina" in t.texto("[data-card-rotinas-hoje]"), "R1 o Início sem rotina: 'Crie a sua 1ª rotina…' + 'Criar rotina'")
        t.pg.wait_for_timeout(2500)
        o.ok(not gravacoes_ao_abrir(t) and leituras_de_rotinas(t) >= 1,
             f"R1 ao abrir: 0 gravação na aluno-dia ({gravacoes_ao_abrir(t) or '—'}) e {leituras_de_rotinas(t)} `ler` q=rotinas")
        R.print(t, "r_inicio_vazio")
        t.clicar("[data-rotinas-criar]")
        ok = t.esperar(lambda: t.tem('[data-folha-rotina="nova"]'), 20)
        o.ok(ok and t.pg.url.split("?")[0].endswith("/perfil/rotinas"), f"R2 'Criar rotina' → /perfil/rotinas com a folha nova aberta ({t.pg.url})")
        t.zerar_pedidos()
        t.clicar("[data-rotina-salvar]")
        ok = t.esperar(lambda: "Dê um nome à rotina." in t.texto("[data-folha-rotina]"), 10)
        o.ok(ok and t.contar("fn", "aluno-dia") == 0, "R2 salvar sem nome: o erro no campo e NENHUMA ida à função")
        creatina = f"{e['marca']} Creatina"
        salvar_rotina_pela_folha(t, creatina, "5 g", None, hora_sp(30), "todos", True)
        R.print(t, "r_nova")
        t.zerar_pedidos()
        t.clicar("[data-rotina-salvar]")
        ok = esperar_linha(t, creatina)
        n = t.contar("fn", "aluno-dia", lambda p: p["acao"] == "rotina_salvar")
        r = rotina(e, "Creatina")
        o.ok(ok and n == 1 and r and r["origem"] == "aluno" and r["lembrete"] and r["detalhe"] == "5 g",
             f"R2 a Creatina pela folha: 1 rotina_salvar ({n}); no banco: {({k: r[k] for k in ('origem', 'lembrete', 'detalhe', 'horario')} if r else None)}")
        if r:
            R.ids["creatina"] = r["id"]
        remedio = f"{e['marca']} Remédio"
        t.clicar("[data-rotinas-nova]")
        t.esperar(lambda: t.tem('[data-folha-rotina="nova"]'), 15)
        salvar_rotina_pela_folha(t, remedio, "1 comprimido", "Remédio", "21:00", "semana", True)
        t.clicar("[data-rotina-salvar]")
        ok = esperar_linha(t, remedio)
        r = rotina(e, "Remédio")
        o.ok(ok and r and r["horario"] == "21:00" and r["lembrete"], f"R3 o Remédio pela folha (Seg a Sex, 21:00, lembrete): {bool(r)}")
        if r:
            R.ids["remedio"] = r["id"]
    finally:
        t.fim()


def caso_semear_profissional(o, R: Rodada) -> None:
    e = R.e
    st, r = funcao(R.L.token("w5p-personal"), {"acao": "prof_rotina_salvar", "aluno": e["pac_a"],
                                                 "dados": {"nome": f"{e['marca']} Água 2 L", "tipo": "habito", "horario": "10:00",
                                                           "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": False}})
    rot = r.get("rotina") or {}
    o.ok(st == 200 and r.get("ok") is True and rot.get("origem") == "profissional",
         f"R4 a rotina do profissional pela função (w5p-personal, a matrícula A): {st} {json.dumps({'ok': r.get('ok'), 'erro': r.get('erro')})}")
    if rot.get("id"):
        R.ids["agua"] = rot["id"]


def caso_pagina(o, nav, R: Rodada, prefixo: str = "") -> None:
    e = R.e
    t = R.tela(nav, "pagina")
    try:
        t.entrar(R.L, "w5p-aluna", "/perfil/rotinas")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") == ["lista"], 45)
        nomes = [x.strip() for x in t.pg.locator("[data-rotina-nome-linha]").all_inner_texts()]
        da_rodada = [x for x in nomes if x.startswith(e["marca"])]
        agua = R.ids.get("agua")
        selo = bool(agua) and t.n(f'[data-rotina-linha="{agua}"] [data-rotina-selo]') == 1
        o.ok(ok and len(da_rodada) == (3 if not prefixo else 1) and (selo or prefixo != ""),
             f"R5 a página: {len(da_rodada)} da rodada pela hora ({[x.replace(e['marca'] + ' ', '') for x in da_rodada]}); o selo na do profissional: {selo}")
        o.ok(t.tem("[data-rotinas-profissionais-veem]") and t.tem("[data-rotinas-site]"),
             "R5 a linha 'Seus profissionais veem as suas rotinas' (Q4) e a do site (o lembrete com a página aberta)")
        R.print(t, f"{prefixo}r_pagina")
        if prefixo:
            return
        cre = R.ids.get("creatina")
        if cre:
            t.clicar(f'[data-rotina-abrir="{cre}"]')
            t.esperar(lambda: t.tem('[data-folha-rotina="mudar"]'), 15)
            t.pg.locator("[data-rotina-detalhe]").fill("3 g")
            t.clicar("[data-rotina-salvar]")
            t.esperar(lambda: not t.tem('[data-folha-rotina="mudar"]'), 20)
            t.pg.wait_for_timeout(1500)
            r = rotina(e, "Creatina")
            hist = [h["o_que"] + ":" + h["quem"] for h in (r or {}).get("historico") or []]
            o.ok(r and r["detalhe"] == "3 g" and hist == ["criou:aluno", "mudou:aluno"], f"R6 mudar 5 g → 3 g: detalhe {r and r['detalhe']!r}; histórico {hist}")
    finally:
        t.fim()


def caso_inicio(o, nav, R: Rodada, prefixo: str = "") -> None:
    e = R.e
    cre = R.ids.get("creatina")
    t = R.tela(nav, "inicio")
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") == ["lista"], 45)
        texto = t.texto("[data-card-rotinas-hoje]")
        o.ok(ok and "Creatina" in texto and (prefixo or "do seu profissional" in texto),
             "R7 o card 'Rotinas de hoje' com as de hoje (a Creatina; o selo na Água do profissional)")
        if not cre:
            return
        alvo = f'[data-card-rotinas-hoje] [data-rotina-marcar="{cre}"]'
        estado = lambda: (t.attr(f'[data-card-rotinas-hoje] [data-rotina-hoje="{cre}"]', "data-rotina-feita") or [""])[0]  # noqa: E731
        t.clicar(alvo)
        ok = t.esperar(lambda: estado() == "1", 10) and t.esperar(lambda: (rotina(e, "Creatina") or {}).get("feita_hoje") == 1, 20, 2)
        o.ok(ok, "R7 ✓ na Creatina: marcada na hora (otimista) e no banco a feita de hoje")
        R.print(t, f"{prefixo}r_inicio")
        if prefixo:
            return
        t.clicar(alvo)
        ok = t.esperar(lambda: estado() == "0", 10) and t.esperar(lambda: (rotina(e, "Creatina") or {}).get("feita_hoje") == 0, 20, 2)
        o.ok(ok, "R7 desmarcar: sai do banco")
        t.clicar(alvo)
        ok = t.esperar(lambda: (rotina(e, "Creatina") or {}).get("feita_hoje") == 1, 20, 2)
        o.ok(ok, "R7 marcar de novo: fica feita")
    finally:
        t.fim()


def caso_aviso_do_site(o, nav, R: Rodada) -> None:
    e = R.e
    agora = agora_sp()
    if agora.hour == 23 and agora.minute >= 45:
        o.linha("   R8 não rodou: perto da meia-noite de SP (o dia viraria só na página) — rode depois das 00:05")
        return
    hora = hora_sp(2)
    st, r = funcao(R.L.token("w5p-aluna"), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Aviso", "tipo": "habito", "horario": hora,
                                                                             "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
    if not o.ok(st == 200 and r.get("ok") is True, f"R8 a rotina 'Aviso' ({hora}, lembrete) pela função, como a aluna: {st}"):
        return
    t = R.tela(nav, "aviso-site", desktop=True)
    try:
        t.ctx.clock.install(time=dt.datetime.now())
        t.entrar(R.L, "w5p-aluna", "/perfil/rotinas")
        t.caso.fechar_avisos()
        t.esperar(lambda: t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") == ["lista"], 45)
        t.pg.clock.fast_forward("03:00")
        toast = t.pg.locator("[data-sonner-toast]", has_text=f"{e['marca']} Aviso")  # a desta rodada (a das 21:00, se for a hora, é outra)
        if not t.esperar(lambda: toast.count() > 0, 8):
            t.pg.clock.run_for("00:35")
        ok = t.esperar(lambda: toast.count() > 0, 20)
        texto = toast.first.inner_text() if ok else ""
        o.ok(ok and "Hora da rotina" in texto and "Marcar como feita" in texto, "R8 o relógio da página +3 min → o toast 'Hora da rotina' com o nome e 'Marcar como feita'")
        R.print(t, "r_site_aviso")
        if ok:
            toast.first.get_by_role("button", name="Marcar como feita").click()
            ok = t.esperar(lambda: (rotina(e, "Aviso") or {}).get("feita_hoje") == 1, 20, 2)
            o.ok(ok, "R8 'Marcar como feita' no toast → no banco, feita hoje")
    finally:
        t.fim()


def caso_apagar(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "apagar")
    try:
        t.entrar(R.L, "w5p-aluna", "/perfil/rotinas")
        t.caso.fechar_avisos()
        t.esperar(lambda: t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") == ["lista"], 45)
        for chave, rotulo, quem in (("agua", "R9 a do PROFISSIONAL (P8b)", "Água 2 L"), ("remedio", "R10 o Remédio (dela)", "Remédio")):
            rid = R.ids.get(chave)
            if not rid:
                o.ok(False, f"{rotulo}: sem o id (um caso anterior falhou)")
                continue
            t.clicar(f'[data-rotina-abrir="{rid}"]')
            t.esperar(lambda: t.tem('[data-folha-rotina="mudar"]'), 15)
            t.clicar("[data-rotina-apagar]")
            confirmou = t.caso.confirmar_no_app()
            sumiu = t.esperar(lambda: t.n(f'[data-rotina-linha="{rid}"]') == 0, 20)
            r = rotina(e, quem)
            hist = [h["o_que"] + ":" + h["quem"] for h in (r or {}).get("historico") or []]
            o.ok(confirmou and sumiu and r and r["arquivada"] and r["arquivada_por"] == e["aluna"] and hist[-1:] == ["arquivou:aluno"],
                 f"{rotulo}: a confirmação do app ({confirmou}), sumiu da página ({sumiu}); no banco arquivada por ela, histórico {hist}")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: o Início e a página da conta de teste aluno-calc com a Guarda (nenhuma gravação sai do navegador)."""
    guarda = B.Guarda()
    t = B.Tela(nav, R.base, "p3", "prod", desktop=False, guarda=guarda)
    try:
        t.entrar(R.L, "aluno-calc", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: (t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") or [""])[0] in ("vazio", "lista", "nenhuma-hoje"), 60)
        t.pg.wait_for_timeout(2500)
        o.ok(ok, f"P1 produção: o card 'Rotinas de hoje' no Início ({(t.attr('[data-card-rotinas-hoje]', 'data-card-rotinas-hoje') or ['—'])[0]})")
        o.ok(not gravacoes_ao_abrir(t) and leituras_de_rotinas(t) >= 1,
             f"P1 produção: 0 gravação na aluno-dia ao abrir ({gravacoes_ao_abrir(t) or '—'}) e {leituras_de_rotinas(t)} `ler` q=rotinas")
        R.print(t, "prod_r_inicio")
        t.ir("/perfil/rotinas")
        ok = t.esperar(lambda: (t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") or [""])[0] in ("vazia", "lista"), 45)
        o.ok(ok, "P2 produção: a página Rotinas e lembretes abre")
        R.print(t, "prod_r_pagina")
        o.ok(not guarda.bloqueadas, f"P3 produção: nenhuma gravação tentada (a Guarda bloqueou: {guarda.bloqueadas or '—'})")
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
    o = C.Saida(f"telas_rotinas_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas das rotinas")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    R = Rodada(o, base, prefixo)
    aluna = uid("w5p-aluna")
    if vivas_da_aluna(aluna):
        raise SystemExit("a w5p-aluna tem rotina viva no staging (o R1 precisa dela sem nenhuma): conferir quem criou — nada foi gravado")
    R.e = {"marca": f"WA E2E P3 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat(), "aluna": aluna,
           "pac_a": matricula_a(aluna, uid("w5p-personal"))}
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
                if a.loja:
                    rodar(caso_vazio_so_print)
                    st, r = funcao(R.L.token("w5p-aluna"), {"acao": "rotina_salvar", "dados": {"nome": f"{R.e['marca']} Creatina", "detalhe": "5 g",
                                                        "tipo": "suplemento", "horario": hora_sp(30), "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
                    o.ok(st == 200 and r.get("ok") is True, f"loja: a Creatina pela função ({st})")
                    R.ids["creatina"] = (r.get("rotina") or {}).get("id", "")
                    rodar(caso_inicio, "loja_")
                    rodar(caso_pagina, "loja_")
                else:
                    rodar(caso_vazio_e_nova)
                    caso_semear_profissional(o, R)
                    rodar(caso_pagina)
                    rodar(caso_inicio)
                    rodar(caso_aviso_do_site)
                    rodar(caso_apagar)
    finally:
        R.L.fechar(o)
        sobras = limpar(R.e)
        o.ok(all(v == 0 for v in sobras.values()), f"limpeza: as sobras da W-A {sobras}")
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


def producao(a) -> int:
    B.usar_schema("public")
    o = C.Saida("telas_rotinas_prod")
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


def caso_vazio_so_print(o, nav, R: Rodada) -> None:
    """--loja: o Início sem rotina (o print loja_r_inicio_vazio)."""
    t = R.tela(nav, "inicio-vazio")
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") == ["vazio"], 45)
        o.ok(ok, "R1 (loja) o Início sem rotina: 'Crie a sua 1ª rotina…'")
        R.print(t, "loja_r_inicio_vazio")
    finally:
        t.fim()


if __name__ == "__main__":
    raise SystemExit(main())
```

`e2e/wa/apk_rotinas.py`:
```python
#!/usr/bin/env python3
"""Physiq W-A P3 — a prova dos lembretes NO APARELHO (spec §5.4, §6 "P3", §7; plano mestre §3 › P3; revisão C3): o APK de STAGING (debug,
montado no notebook — o do CI é o de PRODUÇÃO) num Android pelo adb — o Moto G7 (a Depuração por Wi-Fi) ou o emulador do notebook — e a
WebView pelo DevTools (a cópia gerada do capacitor.config.json com a depuração ligada SÓ no APK de teste; nada no git).
Conta de TESTE: w7b-sozinho (o aluno do app sem profissional — P9; nenhuma rotina de profissional). Passos:
  A0  o aparelho: fuso −03:00, RAM livre ≥ 300 MB, a Depuração por Wi-Fi (adb_wifi_enabled = 1 — NUNCA desligar), o Termux de pé (o pid) e o
      carteiro da ponte (/saude) — no G7; se o Physiq já estava instalado (com outra assinatura → PARA: não desinstalo app de ninguém)
  A1  a porta do aceite da conta de teste pelo SITE de staging (se pendente; a do APK abre já aceita) e a sessão de teste
  A2  instala o APK (adb install -r), a permissão de notificação e o "Alarmes e lembretes" (o alarme exato — a prova não espera o inexato)
  A3  abre o app, acha a WebView (adb forward + /json/list), põe a sessão e espera o Início
  A4  2 rotinas pela função (como o aluno): "Agora" (+4 min) e "Antes" (+5 min), todos os dias, lembrete → recarrega → o getPending do
      próprio app: 7 ids da faixa para cada uma (40000 + posição × 10 + dia) e o armazenamento do plugin (run-as, o que ele relê depois de
      reiniciar) com os mesmos 14
  A5  marcar ANTES: ✓ na "Antes" na página → o id de hoje dela sai (13); desmarcar → volta (14); marcar de novo → sai (13)
  A6  app FECHADO: HOME + am kill (o processo morre; os alarmes ficam) → na hora da "Agora", a notificação (dumpsys) → r_apk_notificacao (a
      bandeja aberta) → "Feito" (uiautomator) → o app abre e marca → r_apk_feito; no banco, a "Agora" feita hoje
  A7  a "Antes" (marcada antes) NÃO tocou no horário dela
  A8  --reiniciar (SÓ no emulador — o G7 é o carteiro da ponte): uma 3ª rotina "Depois de reiniciar" (+4 min), reinicia o aparelho SEM abrir o
      app → o armazenamento do plugin com os ids dela e, na hora, a notificação
  A9  Sair (o do app: GLOBAL nos 2 bancos — combinado com a LINUX 1): o getPending e o armazenamento sem nenhum id da faixa
  Fim (sempre): apaga as rotinas da rodada, desinstala o APK de teste (se não estava lá), tira o adb forward e — no G7 — põe o Termux de volta na
  frente (a tela preta) e confere de novo o Termux (o MESMO pid), o carteiro e a Depuração por Wi-Fi.
Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p3/apk-<alvo>/r_apk_notificacao.png e r_apk_feito.png. Saída: w-a/p3/apk_rotinas_<alvo>.txt.
Uso: python3 e2e/wa/apk_rotinas.py --alvo g7|emulador --serial <ip:porta | emulator-5554> --apk <app-debug.apk> [--adb-porta 5038]
     [--chave <adbkey>] [--reiniciar] [--site https://physiqcalc-staging.vercel.app] [--canal msedge] | --limpar
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
S = "staging"
SP = ZoneInfo("America/Sao_Paulo")
PACOTE = "com.bertoldo.physiqcalc"
ADB = str(Path.home() / "android-sdk" / "platform-tools" / "adb")
CONTA = "w7b-sozinho"  # --conta troca (a w5p-aluna, se o w7b estiver numa trava do app — o Sair global combinado com a LINUX 1)
ESTADO = B.SCRATCH / "w-a" / "p3-apk-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p3"
URL_ALUNO_DIA = f"{B.H.API_P}/functions/v1/aluno-dia"
FAIXA = (40000, 40299)
PORTA_LOCAL = 9223


# ───────────────────────── o aparelho (adb) ─────────────────────────
class Aparelho:
    def __init__(self, porta: int, serial: str, chave: str | None) -> None:
        self.base = [ADB, "-P", str(porta), "-s", serial]
        self.env = dict(os.environ)
        if chave:
            self.env["ADB_VENDOR_KEYS"] = chave

    def adb(self, *args: str, timeout: int = 120, check: bool = True) -> str:
        r = subprocess.run(self.base + list(args), capture_output=True, text=True, timeout=timeout, env=self.env)
        if check and r.returncode != 0:
            raise RuntimeError(f"adb {args[0]}: {(r.stderr or r.stdout).strip()[:300]}")
        return r.stdout

    def sh(self, comando: str, timeout: int = 60, check: bool = True) -> str:
        """adb shell "<comando>": a string vai inteira para o shell DO APARELHO."""
        return self.adb("shell", comando, timeout=timeout, check=check)

    def print(self, caminho: Path) -> str:
        caminho.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(self.base + ["exec-out", "screencap", "-p"], capture_output=True, timeout=60, env=self.env)
        caminho.write_bytes(r.stdout)
        return str(caminho)

    def pid(self, pacote: str) -> str:
        return self.sh(f"pidof {pacote}", check=False).strip()

    def ids_da_bandeja(self) -> list[int]:
        """As notificações do Physiq na bandeja (dumpsys notification: pkg=… id=…)."""
        saida = self.sh("dumpsys notification", timeout=60)
        return sorted({int(m.group(1)) for m in re.finditer(rf"pkg={re.escape(PACOTE)}\s+user=\S+\s+id=(\d+)", saida)})

    def armazenamento(self) -> list[int]:
        """O que o plugin guardou (o que ele REAGENDA depois de reiniciar — LocalNotificationRestoreReceiver): os ids da faixa."""
        xml = self.sh(f"run-as {PACOTE} cat shared_prefs/NOTIFICATION_STORE.xml", check=False)
        return sorted(i for i in (int(x) for x in re.findall(r'<string name="(\d+)">', xml)) if FAIXA[0] <= i <= FAIXA[1])

    def tocar_no_texto(self, *textos: str) -> bool:
        """uiautomator: toca no 1º nó cujo texto (sem maiúsculas) é um dos `textos`."""
        self.sh("uiautomator dump /data/local/tmp/p3_ui.xml", timeout=90, check=False)
        xml = self.sh("cat /data/local/tmp/p3_ui.xml", check=False)
        alvos = {t.lower() for t in textos}
        for m in re.finditer(r'<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
            if m.group(1).strip().lower() in alvos:
                x = (int(m.group(2)) + int(m.group(4))) // 2
                y = (int(m.group(3)) + int(m.group(5))) // 2
                self.sh(f"input tap {x} {y}")
                return True
        return False


# ───────────────────────── a WebView (o DevTools pelo adb forward; um cliente CDP mínimo, sem dependência) ─────────────────────────
class CDP:
    def __init__(self, url: str) -> None:
        u = urllib.parse.urlparse(url)
        self.s = socket.create_connection((u.hostname, u.port), timeout=30)
        chave = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {chave}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            pedaco = self.s.recv(4096)
            if not pedaco:
                raise RuntimeError("CDP: a WebView fechou a conexão no aperto de mão")
            resp += pedaco
        if b" 101 " not in resp.split(b"\r\n", 1)[0]:
            raise RuntimeError("CDP: a WebView recusou o websocket")
        self.resto = resp.split(b"\r\n\r\n", 1)[1]
        self.n = 0

    def _enviar(self, texto: str) -> None:
        dados = texto.encode("utf-8")
        cab = bytearray([0x81])
        n = len(dados)
        if n < 126:
            cab.append(0x80 | n)
        elif n < 65536:
            cab.append(0x80 | 126)
            cab += struct.pack(">H", n)
        else:
            cab.append(0x80 | 127)
            cab += struct.pack(">Q", n)
        mascara = os.urandom(4)
        self.s.sendall(bytes(cab) + mascara + bytes(b ^ mascara[i % 4] for i, b in enumerate(dados)))

    def _exato(self, n: int) -> bytes:
        while len(self.resto) < n:
            pedaco = self.s.recv(65536)
            if not pedaco:
                raise RuntimeError("CDP: a WebView fechou a conexão")
            self.resto += pedaco
        d, self.resto = self.resto[:n], self.resto[n:]
        return d

    def _receber(self) -> str:
        partes = b""
        while True:
            b1, b2 = self._exato(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._exato(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._exato(8))[0]
            if b2 & 0x80:
                self._exato(4)
            dados = self._exato(n)
            op = b1 & 0x0F
            if op == 0x8:
                raise RuntimeError("CDP: a WebView fechou")
            if op in (0x9, 0xA):
                continue
            partes += dados
            if b1 & 0x80:
                return partes.decode("utf-8", "replace")

    def avaliar(self, expressao: str, timeout: float = 45) -> object:
        """Runtime.evaluate (espera a promessa; devolve o valor)."""
        self.n += 1
        meu = self.n
        self._enviar(json.dumps({"id": meu, "method": "Runtime.evaluate",
                                 "params": {"expression": expressao, "awaitPromise": True, "returnByValue": True}}))
        fim = time.time() + timeout
        while time.time() < fim:
            m = json.loads(self._receber())
            if m.get("id") != meu:
                continue
            r = m.get("result") or {}
            if r.get("exceptionDetails"):
                raise RuntimeError("CDP: " + json.dumps(r["exceptionDetails"].get("text", "erro"))[:200])
            return (r.get("result") or {}).get("value")
        raise TimeoutError("CDP: sem resposta")

    def fechar(self) -> None:
        try:
            self.s.close()
        except OSError:
            pass


def webview(ap: Aparelho, espera: float = 60) -> CDP:
    """A página do app pelo DevTools da WebView (o socket webview_devtools_remote_<pid> do processo do app)."""
    fim = time.time() + espera
    while time.time() < fim:
        pid = ap.pid(PACOTE).split()
        if pid and f"webview_devtools_remote_{pid[0]}" in ap.sh("cat /proc/net/unix", check=False):
            ap.adb("forward", f"tcp:{PORTA_LOCAL}", f"localabstract:webview_devtools_remote_{pid[0]}")
            try:
                lista = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORTA_LOCAL}/json/list", timeout=15).read())
                pagina = next((x for x in lista if x.get("type") == "page" and str(x.get("url", "")).startswith("https://localhost")), None)
                if pagina:
                    return CDP(pagina["webSocketDebuggerUrl"])
            except (OSError, ValueError):
                pass
        time.sleep(2)
    raise RuntimeError("a WebView do app não abriu o DevTools (o APK é o de teste, com a depuração ligada na cópia gerada?)")


def esperar(cond, timeout: float, passo: float = 1.0) -> bool:
    fim = time.time() + timeout
    while time.time() < fim:
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001 — a página recarregando no meio
            pass
        time.sleep(passo)
    return False


def tem(w: CDP, seletor: str) -> bool:
    return bool(w.avaliar(f"!!document.querySelector({json.dumps(seletor)})", timeout=15))


def clicar(w: CDP, seletor: str) -> bool:
    return bool(w.avaliar(f"(() => {{ const e = document.querySelector({json.dumps(seletor)}); if (!e) return false; e.click(); return true; }})()", timeout=15))


def ir(w: CDP, rota: str) -> None:
    w.avaliar(f"(location.assign('https://localhost{rota}'), true)", timeout=15)


PENDENTES_JS = ("(async () => { const r = await window.Capacitor.Plugins.LocalNotifications.getPending();"
                " return r.notifications.map((n) => ({ id: n.id, dia: (n.extra || {}).dia, rotina: (n.extra || {}).rotina_id })); })()")


def pendentes(w: CDP) -> list[dict]:
    lista = w.avaliar(PENDENTES_JS) or []
    return sorted((x for x in lista if FAIXA[0] <= int(x["id"]) <= FAIXA[1]), key=lambda x: x["id"])


# ───────────────────────── o banco e a função ─────────────────────────
def uid(conta: str) -> str:
    return B.ler(f"select id::text as id from auth.users where lower(email) = {B.txt(B.CONTAS[conta])}")[0]["id"]


def rotinas(e: dict) -> list[dict]:
    return B.ler(f"""select r.id::text as id, r.nome, r.criada_em,
                            (select count(*) from {S}.rotinas_feitas f where f.rotina_id = r.id
                               and f.dia = (now() at time zone 'America/Sao_Paulo')::date) as feita_hoje
                       from {S}.rotinas r where r.dono_user_id = {B.txt(e['dono'])} and r.nome like {B.txt(e['marca'] + '%')} order by r.criada_em""")


def funcao(token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": "https://physiqcalc-staging.vercel.app"}
    st, r, _h = B5.http("POST", URL_ALUNO_DIA, corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def hora_sp(minutos: int) -> str:
    return (dt.datetime.now(SP) + dt.timedelta(minutes=minutos)).strftime("%H:%M")


def esperar_ate(hora: str, folga_s: int) -> None:
    """Dorme até a hora (HH:MM de hoje em SP) + a folga."""
    agora = dt.datetime.now(SP)
    alvo = agora.replace(hour=int(hora[:2]), minute=int(hora[3:]), second=0, microsecond=0) + dt.timedelta(seconds=folga_s)
    if alvo > agora:
        time.sleep((alvo - agora).total_seconds())


def dia_da_semana_sp() -> int:
    return dt.datetime.now(SP).isoweekday()


def limpar(e: dict | None = None) -> dict:
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {})
    if e.get("dono") and e.get("marca"):
        B.escrever(f"delete from {S}.rotinas where dono_user_id = {B.txt(e['dono'])} and nome like {B.txt(e['marca'] + '%')}")
    ESTADO.write_text("{}", encoding="utf-8")
    return {k: int(v) for k, v in B.Massa().sobras().items()}


# ───────────────────────── o G7: o carteiro da ponte e o Termux ─────────────────────────
def carteiro() -> dict:
    """/saude do carteiro da ponte do Telegram (no G7) — só o que diz se ele está vivo; o token nunca sai daqui."""
    cfg = json.loads((Path.home() / ".claude" / "remoto-telegram" / "config.json").read_text(encoding="utf-8"))
    for url in str(cfg.get("carteiro_url", "")).split("|"):
        try:
            pedido = urllib.request.Request(url.rstrip("/") + "/saude", headers={"X-Carteiro": cfg["carteiro_token"]})
            d = json.loads(urllib.request.urlopen(pedido, timeout=10).read())
            return {"poll": d.get("poll"), "poll_erro": d.get("poll_erro"), "ultimo_poll_ok_ha_s": d.get("ultimo_poll_ok_ha_s")}
        except (OSError, ValueError, KeyError):
            continue
    return {"poll": None, "poll_erro": "sem resposta"}


def carteiro_ok(c: dict) -> bool:
    return c.get("poll") is True and not c.get("poll_erro") and isinstance(c.get("ultimo_poll_ok_ha_s"), (int, float)) and c["ultimo_poll_ok_ha_s"] < 120


# ───────────────────────── os passos ─────────────────────────
def a0(o, ap: Aparelho, alvo: str, e: dict) -> bool:
    fuso = ap.sh("date +%z").strip()
    livre = int((re.search(r"MemAvailable:\s+(\d+)", ap.sh("cat /proc/meminfo")) or [0, 0])[1])
    instalado = bool(ap.sh(f"pm path {PACOTE}", check=False).strip())
    e["instalado_antes"] = instalado
    ok = o.ok(fuso == "-0300", f"A0 o fuso do aparelho {fuso} (o horário da rotina é o de SP)")
    ok = o.ok(livre >= 300_000, f"A0 RAM livre {livre // 1024} MB (≥ 300)") and ok
    if alvo == "g7":
        wifi = ap.sh("settings get global adb_wifi_enabled").strip()
        e["termux_pid"] = ap.pid("com.termux")
        c = carteiro()
        ok = o.ok(wifi == "1", f"A0 a Depuração por Wi-Fi ligada ({wifi}) — fica ligada no fim") and ok
        ok = o.ok(bool(e["termux_pid"]), f"A0 o Termux de pé (pid {e['termux_pid'] or '—'})") and ok
        ok = o.ok(carteiro_ok(c), f"A0 o carteiro da ponte vivo {c}") and ok
    o.linha(f"   o Physiq já estava instalado: {instalado}")
    return ok


def a1_porta_do_aceite(o, R: dict, site: str, canal: str) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            t = B.Tela(nav, site, "p3", "apk-aceite", desktop=False)
            t.entrar(R["L"], CONTA, "/")
            t.caso.fechar_avisos()
            o.ok(t.esperar(lambda: t.tem("[data-aba-inicio]") or t.tem("[data-card-rotinas-hoje]"), 60),
                 f"A1 a conta de teste ({CONTA}) abre o app no site de staging sem a porta do aceite pendente")
            t.fim()
        finally:
            nav.close()


def a2_instalar(o, ap: Aparelho, apk: str) -> bool:
    try:
        ap.adb("install", "-r", apk, timeout=600)
    except RuntimeError as ex:
        return o.ok(False, f"A2 adb install: {ex} (INSTALL_FAILED_UPDATE_INCOMPATIBLE = há um Physiq de outra assinatura: PARO, não desinstalo)")
    ap.sh(f"pm grant {PACOTE} android.permission.POST_NOTIFICATIONS", check=False)
    ap.sh(f"appops set {PACOTE} SCHEDULE_EXACT_ALARM allow", check=False)
    return o.ok(bool(ap.sh(f"pm path {PACOTE}").strip()), "A2 o APK de teste instalado, com a notificação e o 'Alarmes e lembretes' liberados")


def abrir_app(ap: Aparelho) -> None:
    ap.sh(f"monkey -p {PACOTE} -c android.intent.category.LAUNCHER 1", check=False)


def a3_entrar(o, ap: Aparelho, sessao: dict) -> CDP:
    abrir_app(ap)
    w = webview(ap)
    w.avaliar(f"""(() => {{ localStorage.setItem('physiq-principal-auth', {json.dumps(json.dumps(sessao))});
        localStorage.setItem('physiqcalc-pwa-dismissed', 'true');
        localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
        location.replace('https://localhost/'); return true; }})()""")
    o.ok(esperar(lambda: tem(w, "[data-aba-inicio]"), 90),
         f"A3 o app abriu no Início com a conta de teste {CONTA} (a sessão posta pela WebView) — senão: trava do app? rode com --conta w5p-aluna",
         parar=True)
    return w


def a4_criar_e_pendentes(o, ap: Aparelho, w: CDP, R: dict) -> dict:
    e = R["e"]
    horas = {"Agora": hora_sp(4), "Antes": hora_sp(5)}
    for nome, hora in horas.items():
        st, r = funcao(R["L"].token(CONTA), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} {nome}", "tipo": "habito", "horario": hora,
                                                                         "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
        o.ok(st == 200 and r.get("ok") is True, f"A4 a rotina '{nome}' ({hora}) pela função, como o aluno: {st}")
    e["horas"] = horas
    ids = {x["nome"].replace(e["marca"] + " ", ""): x["id"] for x in rotinas(e)}
    e["ids"] = ids
    ir(w, "/perfil/rotinas")
    esperar(lambda: tem(w, f'[data-rotina-linha="{ids.get("Antes", "x")}"]'), 60)
    dow = dia_da_semana_sp()
    hoje_agora, hoje_antes = 40000 + dow, 40010 + dow
    ok = esperar(lambda: len(pendentes(w)) == 14, 30)
    p = pendentes(w)
    por_rotina = {k: [x["id"] for x in p if x["rotina"] == v] for k, v in ids.items()}
    o.ok(ok and len(por_rotina.get("Agora", [])) == 7 and len(por_rotina.get("Antes", [])) == 7 and hoje_agora in por_rotina["Agora"]
         and hoje_antes in por_rotina["Antes"],
         f"A4 getPending: 7 avulsas de cada uma, na faixa ({por_rotina})")
    guardados = ap.armazenamento()
    o.ok(guardados == sorted(x["id"] for x in p), f"A4 o armazenamento do plugin (o que ele reagenda ao reiniciar) = o getPending ({len(guardados)} ids)")
    return {"hoje_agora": hoje_agora, "hoje_antes": hoje_antes}


def a5_marcar_antes(o, w: CDP, R: dict, ids_hoje: dict) -> None:
    antes = R["e"]["ids"]["Antes"]
    alvo = f'[data-rotina-marcar="{antes}"]'
    sem = lambda: ids_hoje["hoje_antes"] not in [x["id"] for x in pendentes(w)]  # noqa: E731
    clicar(w, alvo)
    o.ok(esperar(sem, 30), f"A5 ✓ ANTES da hora na 'Antes' → o id de hoje dela ({ids_hoje['hoje_antes']}) sai do getPending")
    clicar(w, alvo)
    o.ok(esperar(lambda: not sem(), 30), "A5 desmarcar → volta")
    clicar(w, alvo)
    o.ok(esperar(sem, 30), "A5 marcar de novo → sai (fica marcada)")


def a6_app_fechado(o, ap: Aparelho, R: dict, ids_hoje: dict, pasta: Path) -> None:
    e = R["e"]
    ap.sh("input keyevent KEYCODE_HOME")
    time.sleep(2)
    ap.sh(f"am kill {PACOTE}", check=False)
    o.ok(esperar(lambda: not ap.pid(PACOTE), 20), "A6 o app FECHADO (HOME + am kill: o processo morreu; os alarmes ficam)")
    esperar_ate(e["horas"]["Agora"], 15)
    tocou = esperar(lambda: ids_hoje["hoje_agora"] in ap.ids_da_bandeja(), 120, 5)
    o.ok(tocou, f"A6 na hora da 'Agora' ({e['horas']['Agora']}), com o app fechado, a notificação {ids_hoje['hoje_agora']} está na bandeja")
    ap.sh("cmd statusbar expand-notifications", check=False)
    time.sleep(3)
    R["provas"].append(ap.print(pasta / "r_apk_notificacao.png"))
    feito = ap.tocar_no_texto("Feito")
    if not feito:
        feito = ap.tocar_no_texto("Hora da rotina")
        o.linha("   (o botão 'Feito' não apareceu na bandeja recolhida: toquei no corpo — o toque também marca)")
    o.ok(feito, "A6 toquei no 'Feito' da notificação")
    marcou = esperar(lambda: next((x["feita_hoje"] for x in rotinas(e) if x["id"] == e["ids"]["Agora"]), 0) == 1, 90, 1)
    R["provas"].append(ap.print(pasta / "r_apk_feito.png"))  # logo: o toast "… feita · Desfazer" fica 8 s
    o.ok(marcou, "A6 o app abriu e marcou: no banco, a 'Agora' feita hoje")


def a7_antes_nao_tocou(o, ap: Aparelho, R: dict, ids_hoje: dict) -> None:
    esperar_ate(R["e"]["horas"]["Antes"], 60)
    o.ok(ids_hoje["hoje_antes"] not in ap.ids_da_bandeja(), f"A7 a 'Antes' (marcada antes) NÃO tocou às {R['e']['horas']['Antes']}")


def a8_reiniciar(o, ap: Aparelho, w: CDP, R: dict) -> None:
    e = R["e"]
    hora = hora_sp(4)
    st, r = funcao(R["L"].token(CONTA), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Depois de reiniciar", "tipo": "habito",
                                                                     "horario": hora, "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
    o.ok(st == 200, f"A8 a rotina 'Depois de reiniciar' ({hora}) pela função: {st}")
    ir(w, "/perfil/rotinas")
    time.sleep(8)
    antes = ap.armazenamento()
    w.fechar()
    ap.adb("reboot", check=False)
    time.sleep(10)
    ap.adb("wait-for-device", timeout=600)
    esperar(lambda: ap.sh("getprop sys.boot_completed", check=False).strip() == "1", 600, 5)
    time.sleep(40)
    depois = ap.armazenamento()
    o.ok(depois == antes and len(depois) >= 7, f"A8 reiniciou SEM abrir o app: o armazenamento do plugin igual ({len(antes)} → {len(depois)} ids)")
    dow = dia_da_semana_sp()
    pos = len(e["ids"])  # Agora 0, Antes 1 → a 3ª é a posição 2
    alvo = 40000 + pos * 10 + dow
    esperar_ate(hora, 15)
    o.ok(esperar(lambda: alvo in ap.ids_da_bandeja(), 120, 5), f"A8 na hora, depois de reiniciar e sem abrir o app, a notificação {alvo} tocou")


def a9_sair(o, ap: Aparelho, R: dict) -> None:
    abrir_app(ap)
    w = webview(ap)
    R["w"] = w
    ir(w, "/perfil")
    esperar(lambda: tem(w, "[data-perfil-sair]"), 60)
    clicar(w, "[data-perfil-sair]")
    esperar(lambda: tem(w, "[data-perfil-sair-confirmar]"), 20)
    clicar(w, "[data-perfil-sair-confirmar]")
    # o Sair do app é GLOBAL: a sessão de teste que o script abriu saiu junto (o logout local do fim daria 403)
    R["L"].sessoes.esquecer(R["L"].token(CONTA))
    vazio = esperar(lambda: not pendentes(w), 40, 2)
    o.ok(vazio and not ap.armazenamento(), "A9 Sair: o getPending e o armazenamento do plugin sem nenhum id da faixa 40000–40299")


def fim(o, ap: Aparelho, alvo: str, R: dict) -> None:
    w = R.get("w")
    if w:
        w.fechar()
    ap.adb("forward", "--remove", f"tcp:{PORTA_LOCAL}", check=False)
    if not R["e"].get("instalado_antes"):
        ap.adb("uninstall", PACOTE, check=False)
    ap.sh("rm -f /data/local/tmp/p3_ui.xml", check=False)
    if alvo == "g7":
        ap.sh("am start -n com.termux/.app.TermuxActivity", check=False)
        time.sleep(3)
        wifi = ap.sh("settings get global adb_wifi_enabled", check=False).strip()
        o.ok(ap.pid("com.termux") == R["e"].get("termux_pid"), f"fim: o Termux com o MESMO pid ({ap.pid('com.termux')}) — nada dele parou")
        o.ok(carteiro_ok(carteiro()), "fim: o carteiro da ponte vivo")
        o.ok(wifi == "1", "fim: a Depuração por Wi-Fi continua LIGADA (nunca desligar)")


def main() -> int:
    global CONTA  # noqa: PLW0603 — a conta da rodada (os passos leem daqui)
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--alvo", choices=["g7", "emulador"])
    ap_.add_argument("--serial")
    ap_.add_argument("--apk")
    ap_.add_argument("--adb-porta", type=int, default=5038)
    ap_.add_argument("--chave", default="")
    ap_.add_argument("--reiniciar", action="store_true")
    ap_.add_argument("--site", default="https://physiqcalc-staging.vercel.app")
    ap_.add_argument("--canal", default="msedge")
    ap_.add_argument("--conta", default=CONTA)
    ap_.add_argument("--limpar", action="store_true")
    a = ap_.parse_args()
    B.usar_schema(S)
    CONTA = a.conta
    if a.limpar:
        print("sobras depois de limpar:", limpar())
        return 0
    if not (a.alvo and a.serial and a.apk):
        ap_.error("--alvo, --serial e --apk (ou --limpar)")
    if a.reiniciar and a.alvo == "g7":
        raise SystemExit("--reiniciar é SÓ no emulador: reiniciar o G7 derruba o carteiro da ponte (e a Depuração por Wi-Fi pode não voltar)")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior ({ESTADO}): rode --limpar antes")
    o = C.Saida(f"apk_rotinas_{a.alvo}")
    B.exigir_saude("a prova no aparelho")
    pasta = B.pasta_prints("p3") / f"apk-{a.alvo}"
    ap = Aparelho(a.adb_porta, a.serial, a.chave or None)
    R: dict = {"L": B.Logins(), "provas": [], "e": {"marca": f"WA E2E P3 APK {time.strftime('%H%M%S')}", "dono": uid(CONTA)}}
    vivas = B.ler(f"select count(*) as n from {S}.rotinas where dono_user_id = {B.txt(R['e']['dono'])} and arquivada_em is null")[0]["n"]
    if vivas:
        raise SystemExit(f"a conta {CONTA} tem {vivas} rotina(s) viva(s) no staging: os ids da prova contam com 0 — conferir quem criou (nada foi feito)")
    ESTADO.write_text(json.dumps(R["e"]), encoding="utf-8")
    try:
        if not a0(o, ap, a.alvo, R["e"]):
            o.linha("PAREI no A0: o aparelho não está pronto (nada foi instalado)")
        else:
            ESTADO.write_text(json.dumps(R["e"]), encoding="utf-8")
            a1_porta_do_aceite(o, R, a.site, a.canal)
            if a2_instalar(o, ap, a.apk):
                w = a3_entrar(o, ap, R["L"].sessao(CONTA))
                R["w"] = w
                ids_hoje = a4_criar_e_pendentes(o, ap, w, R)
                a5_marcar_antes(o, w, R, ids_hoje)
                w.fechar()
                R["w"] = None
                a6_app_fechado(o, ap, R, ids_hoje, pasta)
                a7_antes_nao_tocou(o, ap, R, ids_hoje)
                if a.reiniciar:
                    w = webview(ap)
                    a8_reiniciar(o, ap, w, R)
                a9_sair(o, ap, R)
    except Exception as ex:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(ex).__name__}: {str(ex)[:300]}")
    finally:
        try:
            fim(o, ap, a.alvo, R)
        finally:
            R["L"].fechar(o)
            sobras = limpar(R["e"])
            o.ok(all(v == 0 for v in sobras.values()), f"limpeza: as sobras da W-A {sobras}")
    o.linha(f"\nprints: {R['provas']}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Commit** — `test(w-a): o E2E de tela das rotinas e a prova no aparelho (o APK de staging pelo adb + o DevTools da WebView)` com os 2 arquivos;
  `feita.sh 10 "E2E: --seco 35/35, compilam" "<placar>"`.

---

### Task 11: A prova local completa (o que o CI roda + as provas da P3)

**Estimativa:** 40 min (calibrado 25–35 — a máquina; a ÚNICA rodada grande da parte local).

- [ ] **Step 1:** `bash ~/projetos/physiqcalc-scratch/w-a/p3/prova_local.sh`
  Expected (a linha `fim`): `lint=0 tipos=0 definer=0 test-node=0 vitest=0 build=0 chunks=0 seco=0 compila=0` e o `git status --short` vazio. O
  Vitest inteiro sem falha (no ensaio: 423 arquivos, 6.005 testes — a `main` do dia tem mais); o `checar-chunks` com as 3 telas novas
  (`CardRotinasHoje`, `Rotinas`, `LembreteDasRotinas`) sem pesado. Vermelho → a causa (o `prova-<passo>.txt`), corrigir na task dela, commit, de novo.
- [ ] **Step 2:** `feita.sh 11 "prova local: <a linha fim>" "<os placares>"`.

---

### Task 12: E2E de tela LOCAL (5173 — o build de staging; site e loja) + os prints

**Estimativa:** 45 min (calibrado 30–40). **🔒 BANCO do staging** (o E2E cria massa).

- [ ] **Step 1: A trava** — o quadro "🔒 BANCO do staging: LINUX 3 desde HH:MM (W-A P3: telas local na 5173)" + `SendMessage` + esperar o "pode ir";
  `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p3/saude.py "as telas locais"` → 0.
- [ ] **Step 2: O site no 5173** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/preview.sh site` → `physiq-distribuicao" content="site"` e o
  `health.json` com `"schema":"staging"`. (A 5173 ocupada → PARAR: não derrubar o que não é seu.)
- [ ] **Step 3: O E2E do site** — `cd ~/projetos/physiqcalc-wa-p3 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_rotinas.py --base local --canal msedge`
  Expected: `23/23 ok` (R0 · R1 ×2 · R2 ×3 · R3 · R4 · R5 ×2 · R6 · R7 ×4 · R8 ×3 · R9 · R10 · os 2 logouts locais das sessões do teste ·
  a limpeza com as sobras 0). Falhou → o print de
  diagnóstico, a causa; o `--limpar` (`python3 e2e/wa/telas_rotinas.py --limpar` → as sobras 0) antes de rodar de novo.
- [ ] **Step 4: Os prints (Read em cada um)** — `~/projetos/physiqcalc-scratch/prints/w-a/p3/local/`: `r_inicio_vazio_390.png` (o card vazio com
  "Criar rotina"), `r_nova_390.png` (a folha com a Creatina, o horário, "Todos os dias" e o lembrete ligado), `r_pagina_390.png` (3 rotinas pela
  hora, o selo na Água, a linha da Q4 e a do site), `r_inicio_390.png` (o card com o ✓ na Creatina e o selo), `r_site_aviso_1280.png` (o toast
  "Hora da rotina" com "Marcar como feita"). Tela errada, "carregando", login → refazer o caso.
- [ ] **Step 5: A loja** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/preview.sh loja` (→ `content="play"`) e
  `cd ~/projetos/physiqcalc-wa-p3 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_rotinas.py --base local --loja --canal msedge`
  → `10/10 ok`; os prints `local-loja/loja_r_inicio_vazio_390.png`, `loja_r_inicio_390.png`, `loja_r_pagina_390.png` (Read).
- [ ] **Step 6: Soltar** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/preview.sh parar`; `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p3/massa_p3.py`
  → True (as sobras 0). Se a Task 13 vem logo, o BANCO pode ficar (avisar); senão 🔓 + "livre". `feita.sh 12 "telas local: site 23/23, loja 10/10; prints conferidos" "<placares>"`.

---

### Task 13: O APK de teste (staging) + o roteiro no EMULADOR (com o "reiniciar")

**Estimativa:** 60 min (calibrado 35–50: o 1º Gradle baixa dependências; o emulador espera os alarmes). **🔒 BANCO do staging** (rotinas da
`w7b-sozinho`); a janela da máquina combinada (o emulador).

- [ ] **Step 1: O APK de teste** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/apk.sh`
  Expected: `webContentsDebuggingEnabled = true SÓ na cópia gerada`, o `git status --short` VAZIO e o
  `~/projetos/physiqcalc-scratch/w-a/p3/Physiq-p3-staging-debug.apk` (~35–45 MB). O `cap sync` mudou arquivo do git → PARAR (não commitar): ver
  `git diff --stat`, voltar com `git restore <arquivos>` e anotar.
- [ ] **Step 2: O emulador** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/emulador.sh iniciar` → `boot: 1 · fuso: -0300`.
- [ ] **Step 3: O roteiro (com o reiniciar)** — `cd ~/projetos/physiqcalc-wa-p3 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/apk_rotinas.py --alvo emulador --serial emulator-5554 --apk /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/Physiq-p3-staging-debug.apk --reiniciar --canal msedge`
  Expected: `22/22 ok` — A0 ×2 (fuso, RAM) · A1 (a conta abre no site sem a porta pendente) · A2 · A3 · A4 ×4 (as 2 rotinas; **getPending 7 + 7 na
  faixa**; o armazenamento = o getPending) · A5 ×3 (marcar antes sai; desmarcar volta; marcar de novo sai) · A6 ×4 (app fechado; **tocou**;
  "Feito"; **marcou no banco**) · A7 (a marcada antes NÃO tocou) · A8 ×3 (a 3ª rotina; **reiniciou sem abrir o app e o armazenamento ficou**;
  **tocou na hora**) · A9 (**Sair: 0 id da faixa**) · a limpeza. A conta numa trava do app (A3 para) → `--conta w5p-aluna` (combinar o Sair
  global com a LINUX 1 antes). ~15 min (os alarmes).
- [ ] **Step 4: Os prints (Read)** — `~/projetos/physiqcalc-scratch/prints/w-a/p3/apk-emulador/r_apk_notificacao.png` (a bandeja com "Hora da
  rotina" e o "Feito") e `r_apk_feito.png` (o app na página com "… feita · Desfazer").
- [ ] **Step 5: Parar** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/emulador.sh parar` (o servidor adb 5038 sai junto); 🔓 BANCO + "livre" (se a
  Task 14 não vem logo). `feita.sh 13 "APK de teste ok; emulador 22/22 (getPending 7+7, app fechado tocou e Feito marcou, reiniciar manteve, Sair esvaziou)" "<placar>"`.

---

### Task 14: STAGING (🔒 git + BANCO): push ff no `staging`, a Vercel, o E2E de staging

**Estimativa:** 40 min (calibrado 20–30).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p3 fetch origin && git -C ~/projetos/physiqcalc-wa-p3 merge-base --is-ancestor origin/main HEAD && git -C ~/projetos/physiqcalc-wa-p3 merge-base --is-ancestor origin/staging HEAD && echo ok-ff`
  → `ok-ff`. A `main` andou → `git rebase origin/main` (a branch ainda não está no GitHub), a prova local de novo (Task 11) e voltar aqui.
- [ ] **Step 2: As travas** — o quadro "🔒 git staging/main + BANCO do staging: LINUX 3 desde HH:MM (W-A P3: push ff no staging + E2E de staging,
  ~30 min)" + `SendMessage` + esperar o "pode ir".
- [ ] **Step 3: O push e a Vercel** — `git -C ~/projetos/physiqcalc-wa-p3 push origin HEAD:staging && git -C ~/projetos/physiqcalc-wa-p3 rev-parse --short=7 HEAD`
  → o sha; `bash ~/projetos/physiqcalc-scratch/w-a/p3/esperar_vercel.sh <sha>` → "o staging serve <sha>".
- [ ] **Step 4: O E2E de staging (um por vez, o `/health` antes)** — `PYTHONDONTWRITEBYTECODE=1 python3 ~/projetos/physiqcalc-scratch/w-a/p3/saude.py "as telas no staging"`
  e `cd ~/projetos/physiqcalc-wa-p3 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/telas_rotinas.py --base staging --canal msedge`
  → `23/23 ok`; os prints em `prints/w-a/p3/staging/` (Read).
- [ ] **Step 5: Soltar** — `massa_p3.py` → True; o quadro com as travas livres + "livre" (o git volta a ser pedido na Task 17).
  `feita.sh 14 "staging <sha>: telas 23/23; prints conferidos; sobras 0" "<placar>"`.

---

### Task 15: O G7 — o APK de teste e a prova (app fechado, "Feito", marcar antes, desmarcar, getPending, Sair)

**Estimativa:** 40 min (calibrado 20–30). **🔒 BANCO** + o combinado da hora do Sair da `w7b-sozinho` (Step 0). **Nada que pare o carteiro.**

- [ ] **Step 0: O combinado** — a resposta da LINUX 1 ao item 4 da Task 0 (a hora); o quadro "🔒 BANCO do staging: LINUX 3 desde HH:MM (W-A P3:
  o APK no G7; o Sair global da w7b-sozinho às ~HH:MM)" + "pode ir".
- [ ] **Step 1: O carteiro ANTES** — `python3 ~/projetos/physiqcalc-scratch/w-a/p3/carteiro.py` → `VIVO`. Problema → PARAR (o G7 já não está bem:
  avisar o Weslley; não mexer).
- [ ] **Step 2: A chave adb** — `mcp__bcode-segredos__ler_segredo(projeto="Pessoal — Contas", nome="ADB Key Celular")` → gravar SÓ o campo `valor`
  (o PEM em base64) em `~/projetos/physiqcalc-scratch/w-a/p3/adbkey.b64` (Write) → `python3 ~/projetos/physiqcalc-scratch/w-a/p3/adb_chave.py`
  → "p3/adbkey gravada (600)". O valor não vai para mensagem, quadro nem log.
- [ ] **Step 3: Conectar** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/adb_g7.sh conectar` → `modelo: moto g(7) play` e `SERIAL=192.168.31.105:<porta>`.
  O mDNS não acha → PARAR e avisar o Weslley (a Depuração por Wi-Fi caiu; SÓ ele religa, na tela — nunca tentar por outro caminho).
- [ ] **Step 4: A prova** — `cd ~/projetos/physiqcalc-wa-p3 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/wa/apk_rotinas.py --alvo g7 --serial <SERIAL> --apk /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/Physiq-p3-staging-debug.apk --chave /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/adbkey --canal msedge`
  Expected: `25/25 ok` — A0 ×5 (fuso −0300, RAM ≥ 300 MB, **Depuração por Wi-Fi 1**, **o Termux de pé**, **o carteiro vivo**) · A1 · A2 · A3 · A4 ×4
  (**7 + 7 na faixa**, o armazenamento igual) · A5 ×3 · A6 ×4 (**tocou com o app fechado**; "Feito"; **marcou no banco**) · A7 · A9 (**Sair: 0 id**)
  · o fim ×3 (**o Termux com o MESMO pid**, **o carteiro vivo**, **a Depuração por Wi-Fi LIGADA**) · a limpeza. A0 falhou → nada foi instalado:
  ver o motivo (RAM baixa → esperar e tentar 1 vez; o resto → avisar). O Physiq de outra assinatura no G7 → o A2 para (não desinstalo app de ninguém).
- [ ] **Step 5: Os prints (Read)** — `prints/w-a/p3/apk-g7/r_apk_notificacao.png` e `r_apk_feito.png` (a tela do G7 tem o brilho 0: o print sai normal).
- [ ] **Step 6: Fechar o adb** — `bash ~/projetos/physiqcalc-scratch/w-a/p3/adb_g7.sh fim` (o servidor 5038 sai e a chave é apagada; a Depuração
  por Wi-Fi do G7 fica LIGADA) e `python3 ~/projetos/physiqcalc-scratch/w-a/p3/carteiro.py` → `VIVO`; 🔓 BANCO + "livre" + "a `w7b-sozinho` saiu
  de todas as sessões às HH:MM". `feita.sh 15 "G7 25/25 (7+7 na faixa, app fechado tocou, Feito marcou, marcar antes não tocou, Sair 0); carteiro e Depuração intactos" "<placar>"`.

---

### Task 16: As rodadas + PR + CI

**Files:** Modify `docs/e2e-rodadas.md` (o topo da tabela "## Rodadas"); fora: `pr-p3.md`.
**Estimativa:** 30 min (calibrado 15–20).

- [ ] **Step 1: As linhas** — `cd ~/projetos/physiqcalc-scratch/w-a/p3 && python3 rodadas_p3.py --p2-desde "<a hora do squash da P2: AAAA-MM-DD HH:MM>"`
  → as linhas da P3 (local site/loja, emulador, staging, G7) e as de produção da P2 depois do merge dela, se houver; colar logo abaixo da linha
  `|---|---|…` da "## Rodadas", completando as obs. com o que as `T<N>-FEITA` dizem. Commit:
  `cd ~/projetos/physiqcalc-wa-p3 && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(e2e): as rodadas da W-A P3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/e2e-rodadas.md`
- [ ] **Step 2: O corpo do PR** — `~/projetos/physiqcalc-scratch/w-a/p3/pr-p3.md`: o que entra (o card, a página, o item, o aviso global, os lembretes
  no APK e no site, o ouvinte único, a linha da exclusão, os 2 E2E); o que NÃO muda (migration, função, a sessão, a guarda do navegador —
  0 achado novo); as decisões técnicas (a lista do topo) e os defeitos da spec 1–11; Q3/Q4 com as recomendadas (1 linha cada) e a Q5; as provas
  (local 23/23 + loja 10/10, emulador 22/22 com o reiniciar, staging 23/23, G7 25/25 — os prints); a volta (reverter o squash; os lembretes do
  aparelho somem na reconciliação seguinte do APK novo; nada no banco); e no fim `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Push da branch e PR (a `main` não pode ter andado)** —
  `cd ~/projetos/physiqcalc-wa-p3 && git fetch origin && git merge-base --is-ancestor origin/main HEAD && git push -u origin feat/w-a-p3-rotinas && gh pr create --repo weslleybertoldo/physiqcalc --base main --head feat/w-a-p3-rotinas --title "W-A P3: rotinas e lembretes no app (o card do Início, a página, os lembretes no APK e no site)" --body-file /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/pr-p3.md || echo "PAROU: a main andou ou o push/PR falhou (ver acima)"`
  → a URL do PR. A `main` andou depois do push no `staging` → `git merge origin/main` na branch (nunca rebase + força depois de publicada) +
  a prova local (Task 11, `--sem-build`) + push.
- [ ] **Step 4: O CI** — `gh pr checks <n> --repo weslleybertoldo/physiqcalc --watch` → `checar-pr` ✅ (lint, tipos, `checar-definer`, `test:node`,
  Vitest, build + `checar-chunks`) e o preview da Vercel ✅. Vermelho → `gh run view <id> --log-failed | tail -60`, corrigir, commit, push (sem forçar).
- [ ] **Step 5:** `feita.sh 16 "PR #<n>; CI verde" "<link>"`.

---

### Task 17: Merge → release → bump → `staging` = `main` → smoke SÓ LEITURA na produção

**Estimativa:** 40 min (calibrado 25–35; as esperas do CI não contam).

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-wa-p3 fetch origin && git -C ~/projetos/physiqcalc-wa-p3 merge-base --is-ancestor origin/main HEAD && echo main-ok`
  e `gh pr list --repo weslleybertoldo/physiqcalc --state open` (1 PR por vez).
- [ ] **Step 2: A trava** — o quadro "🔒 git staging/main: LINUX 3 desde HH:MM (W-A P3: merge, release, staging = main por lease)" + `SendMessage`
  + o "pode ir" (que vale também para o realinhar — a condição (a)).
- [ ] **Step 3: Merge** — `gh pr merge <n> --repo weslleybertoldo/physiqcalc --squash --delete-branch` → `git -C ~/projetos/physiqcalc-wa-p3 fetch origin && git -C ~/projetos/physiqcalc-wa-p3 log origin/main -1 --format='%h %an <%ae> %s'`
  = o squash "W-A P3: … (#<n>)" do `Weslley Bertoldo <55102421+weslleybertoldo@users.noreply.github.com>` (anotar o sha).
- [ ] **Step 4: O CI da `main`** — `gh run list --repo weslleybertoldo/physiqcalc --branch main --limit 3` → `gh run watch <id> --repo weslleybertoldo/physiqcalc`
  → a release `Physiq v3.1xx` com o APK e o `chore: bump version to v3.1xx [skip ci]` (NUNCA bumpar à mão); `curl -s https://physiqcalc.com.br/health.json`
  com a versão da release e o commit do squash. Deploy com `git_info_fail` → `POST /v13/deployments` (o caminho de sempre).
- [ ] **Step 5: Realinhar `staging` = `main` (as 3 condições do quadro)** — (a) o "pode ir" do Step 2; (b)
  `bash ~/projetos/physiqcalc-scratch/w-a/p3/realinhar_confere.sh <sha do squash>` → os commits no staging que a main não tem = SÓ os da branch
  da P3, a árvore do staging × a do squash VAZIA e o `STAGING_SHA=…`; (c) ISOLADO:
  `git -C ~/projetos/physiqcalc-wa-p3 push origin origin/main:staging --force-with-lease=staging:<STAGING_SHA>`. Qualquer coisa fora disso → PARAR
  e combinar (nada de força).
- [ ] **Step 6: O smoke SÓ LEITURA (a Guarda)** — `cd ~/projetos/physiqcalc-wa-p3 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; TMPDIR=~/projetos/physiqcalc-scratch/tmp PYTHONDONTWRITEBYTECODE=1 flock $P python3 e2e/w07/smoke_prod.py telas --versao <3.1xx> --canal msedge`
  (o Perfil com "Rotinas e lembretes") e `… flock $P python3 e2e/wa/telas_rotinas.py --base prod --canal msedge` → `5/5 ok` (P1 ×2 o card sem gravar e com o
  `ler`; P2 a página; P3 nenhuma gravação tentada; o logout local); os prints `prints/w-a/p3/prod/prod_r_inicio_390.png` e `prod_r_pagina_390.png` (Read). Os logs
  da `aluno-dia` desde o merge sem 5xx (só contagens — o molde do `api.py --so-leitura --desde` da P2).
- [ ] **Step 7: "Pode voltar"** — `SendMessage` à LINUX 1 com o sha da `main`, a release e "git livre"; o quadro com a trava livre.
  `feita.sh 17 "squash <sha> (#<n>); release v3.1xx; bump; staging = main por lease; smoke prod 5/5 + w07" "<placares>"`.

---

### Task 18: Fechar

**Estimativa:** 15 min (calibrado 8–10). (O que é do coordenador — quadro, foto, Validação, memória — quem executa só anota no `progresso.log`.)

- [ ] O quadro: a linha da W-A com "✅ P3 EM PRODUÇÃO HH:MM (PR #…, squash `…`, release v3.1xx, bump …); local 23/23 + loja 10/10, emulador 22/22 (o
  reiniciar), staging 23/23, G7 25/25, produção só leitura 5/5; 0 sobra" e as travas livres; a P4 reserva o que for dela quando começar.
- [ ] A foto: o JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-acessos-do-aluno.json` (P3 `feito`, `duracao_min`, tag `PR #… · v3.1xx`)
  → `python3 ~/.claude/skills/Skill-wbs-ciclo-de-implementação-autonoma/andamento_worktrees.py <json> <pasta> --atual` → Read do PNG → tópico.
- [ ] O resumo no grupo Validação (`remoto_validacao`, tópico do Physiq) com os prints (`r_inicio`, `r_pagina`, `r_nova`, `r_site_aviso`,
  `r_apk_notificacao`, `r_apk_feito` do G7): o que entrou, os placares, Q3/Q4 com as recomendadas, a Q5, o que vem (P4).
- [ ] A memória do projeto (Physiq): "W-A P3 em produção (data, PR, versão); P4 a seguir".
- [ ] `claude-orfaos.sh` (órfã → perguntar); nada de pé: `tmux ls` sem `wa-p3-preview`/`wa-p3-emulador`, `ss -ltn | grep -E ":(5173|5038|9223) "` vazio.
  A limpeza de `p3/` (caminhos literais): `rm -r /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/ensaio` e
  `rm /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/Physiq-p3-staging-debug.apk` (a chave já saiu no Step 6 da Task 15).
  A worktree: `git -C ~/projetos/physiqcalc-wa-p3 status --short` vazio → remover SÓ quando nenhuma sessão estiver dentro dela:
  `git -C ~/projetos/physiqcalc worktree remove ~/projetos/physiqcalc-wa-p3 && git -C ~/projetos/physiqcalc branch -D feat/w-a-p3-rotinas`
  (a remota saiu no merge). `feita.sh 18 "fechada" "<o que foi limpo>"`.

---

## Riscos (e o que segura cada um)

1. **O carteiro da ponte e o G7 (servidor de casa):** RAM curta (2 GB, ~75% usada), tela que não pode apagar, Depuração por Wi-Fi que só ele
   religa. Segura: A0 (RAM ≥ 300 MB, o pid do Termux, o `/saude`) antes de instalar; nada de reiniciar, de mexer no Termux, nas permissões dele ou
   no `adb_wifi_enabled`; o fim confere o MESMO pid do Termux, o carteiro e a Depuração; o APK de teste sai; o Termux volta para a frente.
2. **O "Sair" global da conta de teste** (decisão 16): a hora combinada com a LINUX 1; só a `w7b-sozinho`.
3. **O alarme exato** (risco 1 da spec): na prova, o "Alarmes e lembretes" é dado por `appops` (o inexato atrasaria a espera); no aparelho do aluno,
   a página avisa e o "Ligar" abre o ajuste.
4. **Mais de 7 dias sem abrir o app** (risco 2): os lembretes param (a reconciliação volta ao abrir).
5. **"Feito antes não toca" vale no aparelho que marcou** (risco 3): marcado no site com o celular fechado, o celular toca e se corrige ao abrir.
6. **A ordem dos lembretes muda quando uma rotina sai** (a posição pela criação): a reconciliação troca os ids (cancela os velhos, agenda os
   novos) — coberto no teste da diferença.
7. **A porta do aceite pendente no staging** (defeito 11): o aviso global não monta → a A1 aceita antes pelo site.
8. **O E2E no staging travando o Treino de produção** (incidente de 10/10): um por vez, o `/health` antes; o APK no staging roda sem PowerSync.
9. **O Gradle do APK de teste** (1º build no worktree): baixa dependências (rede) e pesa na máquina — na fila do pesado; falhou por rede → de novo 1 vez.
10. **Fuso do aparelho:** a prova exige −03:00 (o horário da rotina é o de SP; o alarme é o do relógio do aparelho — risco 4 da spec); o
    emulador nasce com `-timezone America/Sao_Paulo`.
11. **A guarda do navegador da hml-21 apertando depois** (a 21e `BASE = {}`): os arquivos da P3 já nascem com 0 achado.
12. **A rede/tempo do Início na hml-21** (ponto de encontro 5): avisado na Task 0; o `aluno-dia` como "fora".

## Self-review (feito ao escrever; o código do plano rodou num ENSAIO fora do repo — nada no repo, no banco, na borda, no registro oficial ou no celular)

- **Cobertura da spec (§4.3, §4.6, §4.7, §5.3, §5.4, §5.6, §6 P3) e da revisão:** o card (Task 6), a página e o item (Task 7), a folha com os 2 modos
  (Task 5 — a P6 importa), os lembretes avulsos de 7 dias na faixa 40000–40299 sem `every` (Task 2; C3), o canal privado, o "Feito" e o
  `registerActionTypes` (Task 4), o toque e o "Feito" que marcam e abrem a página (Task 8, com o ouvinte único da Task 1 — defeito 2), "marcou antes
  não toca"/"desmarcou volta" (Tasks 2 e 4; provado no aparelho na A5/A7), o site com a página aberta (Task 8; R8 com o relógio adiantado), o
  "Sair" que esvazia (Tasks 2, 4 e 8, sem `.auth.` — defeito 1; A9), a ação de outro dono ignorada (Tasks 2 e 8; I6), Q3/Q4 numa constante cada,
  a linha do resumo da exclusão (Task 9), nada de nome de rotina em log (nenhum `console` com dado; o `extra` sem nome), os estados e erros por
  frase fixa (`EstadoErro`, `fraseDoErro`), o `useConfirmar` (nenhum diálogo nativo), as guardas (Task 8, Step 3); os prints da §6 (`r_inicio`,
  `r_inicio_vazio`, `r_pagina`, `r_nova`, `r_site_aviso`, `r_apk_notificacao`, `r_apk_feito`) e a prova do G7 do mestre §3 (toca com o app fechado,
  "Feito" marca no servidor, marcar antes não toca, desmarcar volta, o `getPending` com as 7 de cada rotina, "Sair" esvazia) — o "reiniciar mantém"
  no emulador (Q5).
- **Sem "TBD":** todo arquivo novo está inteiro no plano (e em `p3/codigo/`, com o md5); toda edição é um `diff` que aplica (o `drift.sh` confere);
  os únicos valores do dia são os do ambiente (o sha, o nº do PR e da release, a hora combinada, o serial do G7) — lidos na hora, escritos no
  comando seguinte.
- **Nomes consistentes:** os seletores `data-*` do E2E são os das telas (`--seco` 35/35); as funções da P2 com as assinaturas de `src/aluno-dia/api.ts`;
  os códigos de erro e as frases os de `MENSAGEM_ERRO_ALUNO_DIA`; os ids da faixa iguais no plano, no aparelho, no aviso global e no E2E do APK.
- **Os pontos de encontro só por acréscimo** (o topo do `docs/e2e-rodadas.md`); os arquivos editados fora da lista da spec (`AvisoConsultaNova.tsx`,
  `abasW12.test.ts`) avisados na Task 0; nada da hml-21 editado.
- **Contra o diálogo de permissão:** nenhum comando do plano usa `bash -c`, `sh -c`, subshell com `time`, `eval` nem `$(…)` na linha; o que é complexo
  está em script (`p3/*.sh`, `p3/*.py`); os `rm` com caminho literal ou `"${S:?}/…"`.
- **A fila do pesado:** as tasks de código rodam só os arquivos delas (≤ 1 min cada); as rodadas grandes só na Task 11 e nos E2E (cada uma na fila).

---

## Apêndice A — os scripts de apoio (já em `~/projetos/physiqcalc-scratch/w-a/p3/`; se faltar algum, recriar daqui)

`~/projetos/physiqcalc-scratch/w-a/p3/log.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 — acrescenta "HH:MM | <texto>" no progresso.log da P3 (sem $(…) na linha de comando de quem chama).
# uso: bash ~/projetos/physiqcalc-scratch/w-a/p3/log.sh "T3 | ✅ verde"
set -euo pipefail
printf '%s | %s\n' "$(date +%H:%M)" "${1:?texto}" >> /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/progresso.log
tail -1 /home/bertoldo/projetos/physiqcalc-scratch/w-a/p3/progresso.log
```

`~/projetos/physiqcalc-scratch/w-a/p3/feita.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 — grava a marca T<N>-FEITA (1ª linha com a hora de agora) e a linha no progresso.log.
# uso: bash feita.sh <N> "<resumo de 1 linha para o progresso>" "<linha 1 da marca>" ["<linha 2>" …]
set -euo pipefail
n="${1:?N}"; resumo="${2:?resumo}"; shift 2
pasta=/home/bertoldo/projetos/physiqcalc-scratch/w-a/p3
{ printf 'T%s FEITA %s\n' "$n" "$(date +%H:%M)"; for l in "$@"; do printf '%s\n' "$l"; done; } > "$pasta/T$n-FEITA"
printf '%s | T%s | ✅ %s\n' "$(date +%H:%M)" "$n" "$resumo" >> "$pasta/progresso.log"
tail -1 "$pasta/progresso.log"
```

`~/projetos/physiqcalc-scratch/w-a/p3/vitest.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 — o Vitest na fila do pesado, com 2 workers e o TMPDIR do scratch, na worktree da P3.
# uso: bash vitest.sh <arquivos de teste…>   (sem arquivo: o repo inteiro — só na prova local, Task 11)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
cd "$HOME/projetos/physiqcalc-wa-p3" || exit 9
if ! flock -n "$P" true; then echo "fila do pesado ocupada às $(date +%T); esperando a vez"; fi
flock "$P" npx vitest run --maxWorkers=2 "$@"
```

`~/projetos/physiqcalc-scratch/w-a/p3/copiar.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 — põe na worktree os arquivos NOVOS da P3 a partir das cópias conferidas (p3/codigo/, o ensaio do plano: os mesmos blocos do
# plano). Não sobrescreve arquivo que já existe e confere o md5 de cada cópia (codigo.md5).
# uso: bash copiar.sh <caminho no repo> [<caminho no repo> …]     ex.: bash copiar.sh src/rotinas/lembretes.test.ts
set -u
W="$HOME/projetos/physiqcalc-wa-p3"
S="$HOME/projetos/physiqcalc-scratch/w-a/p3"
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

`~/projetos/physiqcalc-scratch/w-a/p3/drift.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 0) — o "drift": o que o plano usa ainda é o que era ao escrevê-lo (a main com a hml-21a e a P2)? Só leitura.
# 1) os 9 arquivos que a P3 EDITA iguais aos de p3/orig (o retrato de 13/10 ~02:30, P2 1d83367) e o patch das edições aplica (--check);
# 2) o contrato da P2 que a P3 importa (src/aluno-dia/{api,regras,tipos}.ts); 3) a guarda do navegador da 21a; 4) o ouvinte das consultas;
# 5) o plugin de notificação 8.0.2 (a leitura do Java vale); 6) nenhum arquivo NOVO da P3 já existe.
# uso: bash drift.sh   (saída 0 = nada mudou; 1 = conferir a lista e ajustar o plano ANTES de codar)
set -u
W="$HOME/projetos/physiqcalc-wa-p3"
S="$HOME/projetos/physiqcalc-scratch/w-a/p3"
cd "$W" || exit 9
rc=0
echo "── 1) os arquivos que a P3 edita (md5 × p3/orig)"
for f in $(cd "$S/orig" && find . -type f | sort); do
  f="${f#./}"
  if cmp -s "$S/orig/$f" "$W/$f"; then echo "   igual  $f"; else echo "   MUDOU  $f"; rc=1; fi
done
if git apply --check "$S/p3-edicoes.patch"; then echo "   o patch das edições aplica"; else echo "   o patch NÃO aplica: fazer as edições à mão (o plano mostra cada uma)"; rc=1; fi
echo "── 2) o contrato da P2"
for x in "export const lerMinhasRotinas" "export const salvarRotina" "export const arquivarRotina" "export const marcarRotina" \
         "export const profSalvarRotina" "export const profArquivarRotina" "export class ErroAlunoDia" "export function mensagemErroAlunoDia"; do
  grep -q "$x" src/aluno-dia/api.ts && echo "   ok  api.ts › $x" || { echo "   FALTA api.ts › $x"; rc=1; }
done
for x in "export { hojeSP }" "export const ontemSP" "export const diaDaSemanaISO" "export function rotinasDoDia" "export interface RotinaDoDia"; do
  grep -qF "$x" src/aluno-dia/regras.ts && echo "   ok  regras.ts › $x" || { echo "   FALTA regras.ts › $x"; rc=1; }
done
for x in "export interface Rotina " "export interface RotinaFeita" "export interface MinhasRotinas" "export interface DadosDaRotina" "export type TipoDeRotina"; do
  grep -qF "$x" src/aluno-dia/tipos.ts && echo "   ok  tipos.ts › $x" || { echo "   FALTA tipos.ts › $x"; rc=1; }
done
echo "── 3) a guarda do navegador da hml-21a (o .auth. só no login)"
grep -q "export const LOGIN" src/integrations/semBancoNoNavegador.test.ts && grep -q '"src/nucleo/sessao.tsx"' src/integrations/semBancoNoNavegador.test.ts \
  && echo "   ok" || { echo "   MUDOU: reler a guarda"; rc=1; }
echo "── 4) o ouvinte do toque das consultas (a P3 troca pelo ouvinte único)"
grep -q 'LocalNotifications.addListener("localNotificationActionPerformed"' src/ui/avisos/AvisoConsultaNova.tsx && echo "   ok" || { echo "   MUDOU"; rc=1; }
grep -rln "localNotificationActionPerformed" src --include=*.ts --include=*.tsx | grep -v "\.test\." | sed 's/^/   ouvinte em: /'
echo "── 5) o plugin de notificação"
v=$(node -p "require('./node_modules/@capacitor/local-notifications/package.json').version")
[ "$v" = "8.0.2" ] && echo "   ok 8.0.2" || { echo "   MUDOU para $v: reler LocalNotificationManager/TimedNotificationPublisher/LocalNotificationRestoreReceiver"; rc=1; }
echo "── 6) os arquivos novos da P3 ainda não existem"
for f in src/lib/acoesDeNotificacao.ts src/rotinas src/app-aluno/inicio/CardRotinasHoje.tsx src/app-aluno/perfil/Rotinas.tsx \
         src/ui/avisos/LembreteDasRotinas.tsx e2e/wa/telas_rotinas.py e2e/wa/apk_rotinas.py; do
  [ -e "$f" ] && { echo "   JÁ EXISTE $f"; rc=1; } || echo "   livre $f"
done
echo "── drift: rc=$rc"
exit $rc
```

`~/projetos/physiqcalc-scratch/w-a/p3/saude.py`:
```python
#!/usr/bin/env python3
"""W-A P3 — SÓ LEITURA: o /health dos 2 projetos (db, auth, rest) + ninguém segurando o banco (pg_stat_activity). Saída 0 = tudo bem.
Uso: python3 saude.py "<rótulo>"."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path.home() / "projetos" / "physiqcalc-wa-p3" / "e2e" / "wa"))
import _base as B  # noqa: E402

B.exigir_saude(sys.argv[1] if len(sys.argv) > 1 else "a P3")
r = B.ler("""select count(*) filter (where state = 'active' and now() - query_start > interval '30 seconds') as longas,
                    count(*) filter (where wait_event_type = 'Lock') as esperando from pg_stat_activity where datname = current_database()""")
print(r)
raise SystemExit(0 if r and r[0]["longas"] == 0 and r[0]["esperando"] == 0 else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p3/massa_p3.py`:
```python
#!/usr/bin/env python3
"""W-A P3 (Task 0) — SÓ LEITURA (transação read only): o que os E2E da P3 precisam no staging. Só booleanos e contagens (nada pessoal).
Uso: python3 massa_p3.py   (saída 0 = pronta)"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path.home() / "projetos" / "physiqcalc-wa-p3" / "e2e" / "wa"))
import _base as B  # noqa: E402

E, S = B.CONTAS, "staging"
u = lambda k: f"(select id from auth.users where lower(email) = '{E[k]}')"  # noqa: E731
r = B.ler(f"""
select (select count(*) from {S}.rotinas where dono_user_id = {u('w5p-aluna')} and arquivada_em is null) as rotinas_aluna,
       (select count(*) from {S}.rotinas where dono_user_id = {u('w7b-sozinho')} and arquivada_em is null) as rotinas_w7b,
       (select count(*) from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
         where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.personal_id = {u('w5p-personal')}) as matricula_a,
       (select count(*) from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
         where p.user_id = {u('w7b-sozinho')} and p.deleted_at is null and c.origem = 'app') as matricula_app_w7b,
       (select count(*) from {S}.avisos where destino_user_id = {u('w5p-aluna')} and titulo = 'Seu profissional criou uma rotina para você'
         and lido_em is null) as avisos_rotina_nao_lidos""")[0]
print("principal/staging:", r)
sobras = B.Massa().sobras()
print("sobras da W-A (marca 'WA E2E'):", sobras)
estados = {}
for nome in ("p3-estado.json", "p3-apk-estado.json", "api-estado.json", "massa-estado.json"):
    f = B.SCRATCH / "w-a" / nome
    estados[nome] = bool(f.exists() and json.loads(f.read_text(encoding="utf-8") or "{}") not in ({}, {"matriculas": [], "papeis": []}))
print("estados com massa de rodada anterior:", estados)
ok = (r["rotinas_aluna"] == 0 and r["rotinas_w7b"] == 0 and r["matricula_a"] >= 1 and r["matricula_app_w7b"] >= 1
      and all(int(v) == 0 for v in sobras.values()) and not any(estados.values()))
print("massa de TESTE pronta para os E2E da P3:", ok)
raise SystemExit(0 if ok else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p3/funcoes_wa.py`:
```python
#!/usr/bin/env python3
"""W-A P3 (cópia do funcoes_p2.py da P2) — SÓ LEITURA (GET da Management API): as 3 funções da W-A nos 2 projetos — existe?, versão, verify_jwt, status.
Uso: python3 funcoes_wa.py [--esperar-ausentes | --esperar-publicadas]   (saída 0 = o esperado; sem opção: só mostra)"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAT = (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()
UA = "physiq-unificado/1.0 (w-a p3)"
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

`~/projetos/physiqcalc-scratch/w-a/p3/prova_local.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 11) — a prova LOCAL inteira, um passo por vez na fila do pesado (o que o CI do PR roda + as provas da P3); a saída de cada
# passo em prova-<passo>.txt. Rodadas GRANDES (lint e Vitest do repo inteiro, build): SÓ aqui, com a fila livre entre os passos.
# uso: bash prova_local.sh               (tudo)
#      bash prova_local.sh --sem-build   (sem o build + chunks)
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PYTHONDONTWRITEBYTECODE=1 PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p3"
cd "$HOME/projetos/physiqcalc-wa-p3" || exit 9
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
passo seco python3 e2e/wa/telas_rotinas.py --seco
passo compila python3 -c "compile(open('e2e/wa/telas_rotinas.py').read(), 'telas_rotinas.py', 'exec'); compile(open('e2e/wa/apk_rotinas.py').read(), 'apk_rotinas.py', 'exec'); print('compila ok')"
echo "── git status --short (vazio = tudo commitado)"
git status --short
echo "── fim $(date +%T):$resumo"
```

`~/projetos/physiqcalc-scratch/w-a/p3/preview.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 12) — o build de STAGING (o .env.local da worktree: VITE_DB_SCHEMA=staging) servido em http://localhost:5173 (--strictPort; a
# 8080 é da LINUX 1) num tmux "wa-p3-preview" (nada solto em background). site = npm run build · loja = npm run build:loja · parar.
# uso: bash preview.sh site | loja | parar
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
W="$HOME/projetos/physiqcalc-wa-p3"
cd "$W" || exit 9
modo="${1:?site | loja | parar}"
tmux kill-session -t wa-p3-preview 2>/dev/null
if [ "$modo" = "parar" ]; then echo "preview parado"; exit 0; fi
if ss -ltn | grep -q ":5173 "; then echo "PAROU: a porta 5173 está ocupada por outro processo (não derrubo o que não é meu)"; exit 1; fi
case "$modo" in
  site) flock "$P" npm run build > "$HOME/projetos/physiqcalc-scratch/w-a/p3/build-site.txt" 2>&1 || { echo "build do site falhou"; exit 1; } ;;
  loja) flock "$P" npm run build:loja > "$HOME/projetos/physiqcalc-scratch/w-a/p3/build-loja.txt" 2>&1 || { echo "build da loja falhou"; exit 1; } ;;
  *) echo "uso: site | loja | parar"; exit 2 ;;
esac
grep -o 'physiq-distribuicao" content="[a-z]*"' dist/index.html
tmux new-session -d -s wa-p3-preview "cd $W && PATH=$HOME/.local/node/bin:\$PATH $HOME/.local/node/bin/npx vite preview --port 5173 --strictPort"
for _ in $(seq 1 40); do
  if curl -sf http://localhost:5173/health.json > /dev/null; then break; fi
  sleep 1
done
curl -s http://localhost:5173/health.json; echo
```

`~/projetos/physiqcalc-scratch/w-a/p3/apk.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 13) — o APK de TESTE (o do CI é o de PRODUÇÃO: VITE_DB_SCHEMA=public no build-apk.yml): o build do app (VITE_APP_NATIVO=1) com o
# .env.local de STAGING → cap sync → a depuração da WebView ligada SÓ na cópia gerada (android/app/src/main/assets/capacitor.config.json,
# ignorada pelo git) → gradlew assembleDebug (a chave de debug do notebook: não instala por cima de um Physiq de site/loja). Sai em
# p3/Physiq-p3-staging-debug.apk. No fim o git da worktree tem de estar limpo.
# uso: bash apk.sh
set -u
export TMPDIR="$HOME/projetos/physiqcalc-scratch/tmp" PATH="$HOME/.local/node/bin:$PATH"
export JAVA_HOME="$HOME/jdk21" ANDROID_HOME="$HOME/android-sdk" ANDROID_SDK_ROOT="$HOME/android-sdk"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
W="$HOME/projetos/physiqcalc-wa-p3"
S="$HOME/projetos/physiqcalc-scratch/w-a/p3"
cd "$W" || exit 9
flock "$P" env VITE_APP_NATIVO=1 npx vite build > "$S/apk-web.txt" 2>&1 || { echo "o build do app falhou (apk-web.txt)"; exit 1; }
grep -q '"schema":"staging"' dist/health.json || { echo "PAROU: o dist/ não é o de staging (o .env.local da worktree?)"; exit 1; }
bash scripts/ci/sem-master.sh dist > "$S/apk-sem-master.txt" 2>&1 || { echo "PAROU: o painel master no build do app"; exit 1; }
flock "$P" npx cap sync android > "$S/apk-sync.txt" 2>&1 || { echo "cap sync falhou (apk-sync.txt)"; exit 1; }
python3 "$S/apk_debug_config.py" || exit 1
cd "$W/android" || exit 9
flock "$P" ./gradlew --no-daemon assembleDebug > "$S/apk-gradle.txt" 2>&1 || { echo "o gradle falhou (apk-gradle.txt)"; exit 1; }
cp app/build/outputs/apk/debug/app-debug.apk "$S/Physiq-p3-staging-debug.apk"
cd "$W" || exit 9
echo "── git status --short (tem de estar vazio: o cap sync não muda arquivo do git)"
git status --short
ls -la "$S/Physiq-p3-staging-debug.apk"
```

`~/projetos/physiqcalc-scratch/w-a/p3/apk_debug_config.py`:
```python
#!/usr/bin/env python3
"""W-A P3 (Task 13) — liga a depuração da WebView SÓ na cópia GERADA do capacitor.config.json (android/app/src/main/assets/, ignorada pelo
git): o APK de teste deixa o adb ler o DevTools da WebView (a sessão de teste entra por ali e o getPending sai por ali). O capacitor.config.ts
do repo NÃO muda; o APK do CI segue com a depuração desligada. Uso: python3 apk_debug_config.py"""
import json
import subprocess
from pathlib import Path

W = Path.home() / "projetos" / "physiqcalc-wa-p3"
arq = W / "android" / "app" / "src" / "main" / "assets" / "capacitor.config.json"
if subprocess.run(["git", "-C", str(W), "check-ignore", "-q", str(arq)]).returncode != 0:
    raise SystemExit("PAROU: a cópia gerada do capacitor.config.json não está no .gitignore — não mexo")
cfg = json.loads(arq.read_text(encoding="utf-8"))
cfg.setdefault("android", {})["webContentsDebuggingEnabled"] = True
arq.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
print("webContentsDebuggingEnabled = true SÓ na cópia gerada (o APK de teste)")
```

`~/projetos/physiqcalc-scratch/w-a/p3/emulador.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 13) — o emulador do notebook (o AVD "physiq-video" da W5: Android 15 / API 35, x86_64, KVM) para o ensaio do roteiro e a prova
# do "reiniciar mantém" (o G7 NÃO reinicia: é o carteiro da ponte). Fuso de São Paulo, sem janela, num tmux, no servidor adb da P3 (porta
# 5038 — o 5037 é de outra sessão). O boot vai na fila do pesado; o resto não segura a fila.
# uso: bash emulador.sh iniciar | parar
set -u
export ANDROID_HOME="$HOME/android-sdk" ANDROID_SDK_ROOT="$HOME/android-sdk" JAVA_HOME="$HOME/jdk21" ANDROID_ADB_SERVER_PORT=5038
ADB="$HOME/android-sdk/platform-tools/adb"
P="$HOME/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock"
S="$HOME/projetos/physiqcalc-scratch/w-a/p3"
case "${1:?iniciar | parar}" in
  iniciar)
    "$ADB" -P 5038 start-server
    tmux kill-session -t wa-p3-emulador 2>/dev/null
    tmux new-session -d -s wa-p3-emulador "ANDROID_ADB_SERVER_PORT=5038 ANDROID_HOME=$HOME/android-sdk $HOME/android-sdk/emulator/emulator -avd physiq-video -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -memory 1536 -cores 2 -timezone America/Sao_Paulo > $S/emulador.log 2>&1"
    flock "$P" "$ADB" -P 5038 -s emulator-5554 wait-for-device
    for _ in $(seq 1 180); do
      if [ "$("$ADB" -P 5038 -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then break; fi
      sleep 5
    done
    echo "boot: $("$ADB" -P 5038 -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r') · fuso: $("$ADB" -P 5038 -s emulator-5554 shell date +%z | tr -d '\r')"
    ;;
  parar)
    "$ADB" -P 5038 -s emulator-5554 emu kill 2>/dev/null
    tmux kill-session -t wa-p3-emulador 2>/dev/null
    # o servidor adb 5038 sai junto: o do G7 tem de nascer COM a chave (ADB_VENDOR_KEYS no start-server — memória do G7)
    "$ADB" -P 5038 kill-server 2>/dev/null
    echo "emulador parado (e o servidor adb 5038)"
    ;;
  *) echo "uso: iniciar | parar"; exit 2 ;;
esac
```

`~/projetos/physiqcalc-scratch/w-a/p3/adb_chave.py`:
```python
#!/usr/bin/env python3
"""W-A P3 (Task 15) — a chave adb que o G7 aceita (cofre B Code Segredos › "Pessoal — Contas" › "ADB Key Celular", o campo `valor` = o PEM em
base64): lê p3/adbkey.b64 (gravado com o valor do cofre — nunca em mensagem, quadro ou log), grava p3/adbkey (600, CRLF → LF) e apaga o .b64.
Uso: python3 adb_chave.py"""
import base64
import os
from pathlib import Path

S = Path.home() / "projetos" / "physiqcalc-scratch" / "w-a" / "p3"
b64 = S / "adbkey.b64"
pem = base64.b64decode(b64.read_text(encoding="utf-8").strip()).replace(b"\r\n", b"\n")
b64.unlink()
if b"PRIVATE KEY" not in pem:
    raise SystemExit("o valor não é uma chave privada PEM (conferir o item do cofre) — o .b64 já foi apagado")
fd = os.open(S / "adbkey", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "wb") as f:
    f.write(pem)
print("p3/adbkey gravada (600); o .b64 apagado")
```

`~/projetos/physiqcalc-scratch/w-a/p3/adb_g7.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 15) — o adb do NOTEBOOK no G7 pela Depuração por Wi-Fi (memória do G7): um 2º servidor adb na porta 5038 (o 5037 é de outra
# sessão) com a chave do cofre (p3/adbkey — adb_chave.py); o mDNS acha a porta do G7 (muda a cada vez). NUNCA desliga a Depuração por Wi-Fi.
# uso: bash adb_g7.sh conectar   (imprime SERIAL=<ip:porta>) · bash adb_g7.sh fim   (derruba o servidor 5038 e apaga a chave)
set -u
ADB="$HOME/android-sdk/platform-tools/adb"
S="$HOME/projetos/physiqcalc-scratch/w-a/p3"
export ADB_VENDOR_KEYS="$S/adbkey"
case "${1:?conectar | fim}" in
  conectar)
    [ -f "$S/adbkey" ] || { echo "PAROU: falta p3/adbkey (python3 adb_chave.py)"; exit 1; }
    "$ADB" -P 5038 start-server
    serial=""
    for _ in $(seq 1 10); do
      serial=$("$ADB" -P 5038 mdns services | grep "adb-0057785989" | grep "_adb-tls-connect" | grep -m1 -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+')
      if [ -n "$serial" ]; then break; fi
      sleep 3
    done
    if [ -z "$serial" ]; then
      echo "PAROU: o mDNS não achou o G7 (a Depuração por Wi-Fi está ligada? NÃO tentar religar — avisar o Weslley; só ele liga na tela)"
      exit 1
    fi
    "$ADB" -P 5038 connect "$serial"
    echo "modelo: $("$ADB" -P 5038 -s "$serial" shell getprop ro.product.model | tr -d '\r')"
    echo "SERIAL=$serial"
    ;;
  fim)
    "$ADB" -P 5038 kill-server 2>/dev/null
    rm -f "${S:?}/adbkey" "${S:?}/adbkey.b64"
    echo "servidor adb 5038 derrubado; a chave apagada (a Depuração por Wi-Fi do G7 continua LIGADA)"
    ;;
  *) echo "uso: conectar | fim"; exit 2 ;;
esac
```

`~/projetos/physiqcalc-scratch/w-a/p3/carteiro.py`:
```python
#!/usr/bin/env python3
"""W-A P3 (Task 15) — o carteiro da ponte do Telegram (no G7) está vivo? Só leitura (/saude, pela LAN ou pela tailnet); o token nunca sai daqui.
Uso: python3 carteiro.py   (saída 0 = vivo: poll ligado, sem erro, último poll há < 120 s)"""
import json
import urllib.request
from pathlib import Path

cfg = json.loads((Path.home() / ".claude" / "remoto-telegram" / "config.json").read_text(encoding="utf-8"))
saude = {"poll": None, "poll_erro": "sem resposta"}
for url in str(cfg.get("carteiro_url", "")).split("|"):
    try:
        pedido = urllib.request.Request(url.rstrip("/") + "/saude", headers={"X-Carteiro": cfg["carteiro_token"]})
        d = json.loads(urllib.request.urlopen(pedido, timeout=10).read())
        saude = {"poll": d.get("poll"), "poll_erro": d.get("poll_erro"), "ultimo_poll_ok_ha_s": d.get("ultimo_poll_ok_ha_s")}
        break
    except (OSError, ValueError, KeyError):
        continue
vivo = saude.get("poll") is True and not saude.get("poll_erro") and isinstance(saude.get("ultimo_poll_ok_ha_s"), (int, float)) \
    and saude["ultimo_poll_ok_ha_s"] < 120
print("carteiro:", saude, "→", "VIVO" if vivo else "PROBLEMA")
raise SystemExit(0 if vivo else 1)
```

`~/projetos/physiqcalc-scratch/w-a/p3/esperar_vercel.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 14) — espera o staging da Vercel servir o commit empurrado (o /health.json com o sha curto de 7; até 15 min). Só leitura.
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

`~/projetos/physiqcalc-scratch/w-a/p3/realinhar_confere.sh`:
```bash
#!/usr/bin/env bash
# W-A P3 (Task 17) — a condição (b) do quadro para realinhar `staging` = `main` depois do squash: o staging só tem os commits da P3 e a árvore
# dele é a do squash. Só leitura (o push com lease é um comando à parte, com o "pode ir" da LINUX 1).
# uso: bash realinhar_confere.sh <sha do squash da P3 na main>
set -u
cd "$HOME/projetos/physiqcalc-wa-p3" || exit 9
sq="${1:?sha do squash da P3 na main}"
git fetch origin
echo "── commits no staging que a main não tem (têm de ser SÓ os da branch da P3):"
git log --format='   %h %an — %s' origin/main..origin/staging
echo "── a árvore do staging × a do squash (vazio = iguais):"
git diff --stat origin/staging "$sq"
echo "STAGING_SHA=$(git rev-parse origin/staging)"
```

`~/projetos/physiqcalc-scratch/w-a/p3/rodadas_p3.py`:
```python
#!/usr/bin/env python3
"""W-A P3 (Task 16) — as linhas do docs/e2e-rodadas.md (a mais nova em cima, no formato da tabela "## Rodadas"), do e2e-rodadas.tsv OFICIAL:
as da P3 (branch feat/w-a-p3-rotinas) e, se houver, as de PRODUÇÃO da P2 que rodaram DEPOIS do merge dela (a regra: as de produção vão no PR
seguinte; --p2-desde "AAAA-MM-DD HH:MM" = a hora do squash da P2). As obs. saem com um texto-base: conferir e completar com as T<N>-FEITA.
Só imprime. Uso: python3 rodadas_p3.py [--p2-desde "2026-10-13 05:30"]"""
import argparse
from pathlib import Path

TSV = Path.home() / "projetos/physiqcalc-scratch/e2e-rodadas.tsv"
OBS = {
    "e2e/wa/telas_rotinas.py": {
        "local": "telas do site (5173, build de staging): Início vazio, folha (nova/mudar/apagar), página, card com ✓, aviso do site pelo relógio adiantado, a do profissional com selo e apagável; sobras 0",
        "local-loja": "telas da loja (5173, build:loja): Início vazio, card com ✓, página; sobras 0",
        "staging": "telas no staging (Vercel): o mesmo roteiro do local; sobras 0",
        "produção": "SÓ LEITURA (a Guarda): o card e a página da aluno-calc abrem sem gravar",
    },
    "e2e/wa/apk_rotinas.py": {
        "emulador": "APK de staging no emulador (Android 15): 7 avulsas por rotina, marcar antes não toca, app fechado toca e 'Feito' marca, REINICIAR mantém (o armazenamento e a notificação), Sair esvazia",
        "g7": "APK de staging no Moto G7: 7 avulsas por rotina (getPending + armazenamento), marcar antes não toca, desmarcar volta, app fechado toca e 'Feito' marca no servidor, Sair esvazia; o carteiro e a Depuração por Wi-Fi intactos",
    },
}


def base_de(script: str, args: str) -> str:
    if "--base prod" in args or "--schema public" in args or "--so-leitura" in args:
        return "produção"
    if "--alvo g7" in args:
        return "g7"
    if "--alvo emulador" in args:
        return "emulador"
    if "--base local" in args:
        return "local-loja" if "--loja" in args else "local"
    return "staging"


ap = argparse.ArgumentParser()
ap.add_argument("--p2-desde", default="")
a = ap.parse_args()
saida = []
for linha in TSV.read_text(encoding="utf-8").splitlines():
    c = linha.split("\t")
    if len(c) < 6:
        continue
    data, branch, commit, script, args, placar = c[:6]
    if branch == "feat/w-a-p3-rotinas":
        b = base_de(script, args)
        obs = OBS.get(script, {}).get(b, "")
        mostra = {"local": "local", "local-loja": "local", "g7": "staging", "emulador": "staging"}.get(b, b)
        saida.append((data, "W-A P3", commit, script, args, mostra, placar, obs))
    elif branch == "feat/w-a-p2-funcoes" and a.p2_desde and data >= a.p2_desde and base_de(script, args) == "produção":
        saida.append((data, "W-A P2", commit, script, args, "produção", placar, "produção depois do merge da P2 (só leitura)"))
for data, wt, commit, script, args, base, placar, obs in sorted(saida, reverse=True):
    print(f"| {data[8:10]}/{data[5:7]} {data[11:16]} | {wt} | `{commit}` | `{script}{(' ' + args) if args else ''}` | {base} | {placar} | {obs} |")
print(f"\n{len(saida)} linhas ({sum(1 for s in saida if s[1] == 'W-A P3')} da P3, {sum(1 for s in saida if s[1] == 'W-A P2')} da P2)")
```

As cópias conferidas e os retratos (fora do plano, em `p3/`): `codigo/` + `codigo.md5` (os 22 arquivos novos, iguais aos blocos das Tasks
1–10), `patches/T1.patch`, `T6-teste.patch`, `T6-codigo.patch`, `T7-teste.patch`, `T7-codigo.patch`, `T9-teste.patch`, `T9-codigo.patch` (iguais
aos blocos `diff` das tasks) e `orig/` (os 9 arquivos que a P3 edita, como eram na P2 `1d83367` — o `drift.sh` compara).
