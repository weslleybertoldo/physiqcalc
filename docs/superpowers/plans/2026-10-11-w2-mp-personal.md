# W2 — Mercado Pago do personal: o personal conecta o Mercado Pago dele e recebe direto — Plano de implementação

> **Task 0 feita (11/10 18:45–19:00, LINUX 3) — o que o Step 3b e o Step 6 mandam anotar no topo:**
> - **Base:** `origin/main` = `origin/staging` = `87205e1` (v3.102), com W-P, W1 (`c0d5416`), hml-19c (`c0a7ea6`) e **W1b** (`7694e8a`) dentro.
>   Worktree `~/projetos/physiqcalc-w2`, branch `feat/w2-mp-personal` (sem upstream).
> - **W1b no catálogo:** `trg_cobrancas_guard_mp` → `cobrancas_guard_mp`, LIGADO no `public` e no `staging` (os nomes deste plano).
> - **W1b no código** (`pagamentos-aluno` v41 de 16:54 = o código da `main`): além de `pagamentoDaLinha`, `exigirDaCobranca` e da regra pura
>   `pagamentoEDaCobranca` (`_shared/financeiro-regras.ts:98`), a W1b tem **`outroPagamento`** (o `log.erro cobranca_de_outro_pagamento`) e
>   **`cancelarNoMp`** (GET pelo `pagamentoDaLinha` → PUT `cancelled` só se o pagamento for DESTA cobrança; devolve `cancelado|outro|sem_resposta`),
>   usado no `prof_cobranca_cancelar` (`outro` → 409), no **`simular_aprovacao`** (`outro` → 409; só staging) e no laço do Pix aberto do
>   `aluno_mp_pix`/`aluno_mp_cartao` (sem lançar). O `conferir` (sem lançar) roda no `aluno_status`, no `aluno_mp_pix`/`aluno_mp_cartao`, no
>   `aluno_mp_conferir` e no `prof_aluno`. **A Task 9 mantém os 5 ajudantes** (`pagamentoDaLinha`, `outroPagamento`, `exigirDaCobranca`,
>   `cancelarNoMp`, `conferir`) trocando a `credencial` do schema pela escolhida; o texto `cobranca_de_outro_pagamento` já está em
>   `src/financeiro/regras.ts`.
> - **Linhas citadas que andaram** desde o `f324f98` (onde o plano foi escrito): `pagamentos-aluno/index.ts` (W1b, +82/−17),
>   `_shared/financeiro-regras.ts` (W1b, +42), `src/financeiro/regras.ts` (W1b, +2) e `src/painel/configuracoes/Recebimento.tsx` (W1: a
>   constante `BOTAO_LONGO`, +5/−2) — achar pelo nome, não pelo número. Os corpos SQL que a Task 6 copia NÃO mudaram (Step 3 igual).
> - **Client Secret no cofre:** sem item próprio (listagem só de metadados); se está dentro do "Mercado Pago — PhysiqCalc", a Task 0b diz
>   (`cofre campos`). Segredos das funções: só `MP_ACCESS_TOKEN_PROD`, `MP_ACCESS_TOKEN_TEST` e `MP_TEST_PAYER_EMAIL` (nenhum da W2); o
>   cofre também não tem item da W2.
> - **Sandbox do MP:** recusa a credencial `TEST-` da conta real desde 11/10 ~02:47 (`~/projetos/physiqcalc-scratch/w1b/diagnostico-sandbox-mp.md`)
>   → os testes de pagamento do MP passam a ser com USUÁRIOS DE TESTE (Task 1).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** em **Configurações › Recebimento** o dono da conta escolhe **"Mercado Pago (sua conta)"**, toca em **"Conectar com o Mercado
Pago"**, entra na conta dele no MP, autoriza o Physiq (OAuth), volta à mesma tela, **confirma a conta do MP** ("Conectar a conta X?" — só
quem começou a conexão, logado; revisão I8) e fica **conectado** (no APK, o Conectar abre o site no navegador por cima do app e o fluxo
inteiro acontece lá). A partir daí o aluno paga **como hoje no MP** — Pix,
cartão (no app, com a chave pública DO PERSONAL) e cobrança automática mensal no cartão — e o dinheiro cai **direto na conta do personal**
(D3: sem taxa do Physiq). O acesso **renova sozinho** (vale 180 dias); se cair (revogado/vencido), o dono recebe aviso e vê "Conectar de
novo". **Desconectar ou trocar de forma cancela antes as automáticas** dos alunos na conta dele (com o OK e aviso aos alunos) — e isso vale
também para o "Desligar" do master (MENOR 7 da revisão da W1).

**Architecture:**
1. Banco principal (`{schema}`), **UMA migration** (`20261011210000_w2_mp_personal.sql`, lição I2 da W1):
   - `contas.recebimento_modo` + `'mercadopago_conta'` (`'mercadopago'` continua = o MP do Physiq, só o master liga);
   - `recebimento_integracoes` (W1) + o provedor `'mercadopago'`: `mp_user_id`, `mp_apelido`, `mp_public_key`, **tokens CIFRADOS no servidor**
     (AES-256-GCM, chave fora do banco), `mp_expira_em`, a renovação (trava, tentativas), `mp_erro`, `status` ativa · erro · desconectada —
     sem grant para `anon`/`authenticated` (como na W1);
   - `mp_conexoes`: o `state` de uso único do OAuth (10 min; só o sha256) + o PKCE cifrado + **o par de tokens cifrado até a CONFIRMAÇÃO
     pela sessão de quem começou** (revisão I8); só o servidor;
   - `cobrancas.mp_collector_id` e `aluno_assinaturas.mp_collector_id`: **qual conta do MP recebeu** (nulo = o MP do Physiq);
   - guardas por gatilho para TODO mundo (dono, master, servidor): entrar no `mercadopago_conta` só com a integração ativa; **sair de um MP
     com automática viva, não**; sair do `mercadopago_conta` marca a integração `desconectada`; o app não grava `mp_collector_id` (as outras
     colunas do MP em `cobrancas` já estão congeladas pela **W1b**, pré-requisito — revisão C1);
   - `recebimento_mp_confirmar` (RPC chamada COMO A PESSOA: só quem começou a conexão e é dono grava a integração — I8, jeito 2);
   - master (`w27_conta_linha`, `master_integracoes`, `master_conta_acao`) e o pg_cron de hora em hora da renovação e da conferência diária
     (pg_net → edge, S10).
2. Servidor: regras puras `_shared/mp-conta-regras.ts` (reexportadas na tela), a cifra `_shared/cifra-mp.ts`, o cliente `_shared/mp-conta.ts`
   (credencial da conta, troca do `code`, renovação com trava, 401 → `/users/me` → renova → 1 nova tentativa, a credencial certa de cada
   cobrança/assinatura que já existe, a "regra da coluna nova" do `mp_collector_id`). **O token da conta em TODAS as chamadas do MP** —
   `pagamentos-aluno`, `mp-webhook-aluno` (por conta: `&conta=<id>` ou o `user_id` de uma integração conhecida + `collector_id` + `x-signature`),
   `automaticas-fila`, a exclusão do personal e o `master-contas`. Funções novas: `mp-conectar-retorno` (GET, a volta do OAuth: troca o code e
   guarda o par para a confirmação) e `mp-contas-renovar` (o job: renova, confere o acesso 1×/dia e busca as cobranças das automáticas).
3. Tela: Recebimento pela função (jeito 2 — já é desde a W1) com Conectar/Confirmar/Desconectar/situação (no APK, o Conectar abre o SITE no
   navegador por cima do app — I8); o cartão do aluno com a chave pública do vendedor (`initMercadoPago` reinicia por chave); o master vê e
   desliga com o OK.
4. Uma função para `public` e `staging`: o que é novo só liga com a migration no schema (`schemaTemW2`); na produção a opção fica
   **escondida dos personais** (flag `app_config.mercadopago_conta`) até o teste de produção do FIM.

**Tech Stack:** Postgres (`{schema}`, pg_cron, pg_net, Vault — já no principal), Deno edge (supabase-js 2.39, Web Crypto), React 18 + Vite +
TanStack Query + Capacitor (`@capacitor/browser` já no `package.json`), `@mercadopago/sdk-react` 1.0.7, Vitest, E2E em Python + Playwright
(`--canal msedge`), Deno 2.5.2 local (`~/.deno/bin/deno`) para o simulador.

**Entradas (nesta ordem de precedência):**
- Desenho aprovado: `~/Desktop/Physiq - InfinitePay/Physiq - InfinitePay e Mercado Pago do personal - desenho aprovado - 2026-10-10.md`
  (a **seção 8 vale por cima** das 4 e 5); a W2 é a §4.4 + §5.
- Spec-review: `~/projetos/physiqcalc-scratch/migracao-yuri/spec-review-planos-e-recebimento.md` (W2: "token da conta em TODAS as
  chamadas", "W2 no front", "W2 segredos", "forma de receber × formas do plano", resposta 4–6 da §7).
- Mestre: `docs/superpowers/plans/2026-10-10-planos-infinitepay-mp-plano-mestre.md` (§0, §2 gates W2-a e P-C, §3 P-C, §4.3 W2, §5).
- Modelo de formato e esteira: o plano da W1 (`docs/superpowers/plans/2026-10-11-w1-infinitepay.md`) e a revisão que ele recebeu
  (`~/projetos/physiqcalc-scratch/w1/review-plano-w1.md`) — o "Lições da W1" abaixo diz onde cada tipo de erro foi evitado.
- O código da `main` com a W1 dentro (este plano foi escrito lendo a worktree `~/projetos/physiqcalc-w1`, branch `feat/w1-infinitepay`,
  HEAD `f324f98`; a revisão conferiu na `3225e93` e na `origin/main` `c1dbffe` — nenhum arquivo da W2 mudou).
- **Revisão crítica deste plano (11/10):** `~/projetos/physiqcalc-scratch/w2/review-plano-w2.md` (2 CRÍTICOS, 12 IMPORTANTES, 36 MENORES) —
  aplicada; onde cada achado entrou está na seção "Revisão de 11/10", logo depois da estimativa.
- **A W1b (correção à parte do C1, ANTES da W2):** a verificação na produção (C1 CONFIRMADO; R$ 0 em risco hoje — nenhum plano pago pelo MP
  ainda) e o que ela leva estão em `~/projetos/physiqcalc-scratch/w2/c1-verificacao.md` §5: a migration `20261011220000_w1b_guarda_cobrancas_mp.sql`
  (o gatilho `trg_cobrancas_guard_mp` → `{schema}.cobrancas_guard_mp()`: para o app, congela `forma 'mp'`, o `status` e o `reembolsado_em` da
  linha mp, `mp_payment_id`, `mp_status`, `mp_preapproval_id` e `pix_*` — sem citar a `mp_collector_id`, que ainda não existe) + a 2ª camada na
  `pagamentos-aluno` (a regra pura `pagamentoEDaCobranca` em `_shared/financeiro-regras.ts` e o ajudante `pagamentoDaLinha`/`exigirDaCobranca`:
  409 `cobranca_de_outro_pagamento` no `prof_reembolsar`, `prof_cobranca_cancelar` e `detalhe_mp`; no `conferir` e no laço do Pix aberto do
  `aluno_mp_pix`, sem lançar — só não aplica e loga) + os testes `e2e/w1/sql_w1b.py` e `e2e/w1/api_w1b.py`. **A W2 parte com a W1b em
  produção** (Task 0, conferido no catálogo) e não reescreve nada dela: a guarda da W2 (`cobrancas_guard_mp_conta`) vai AO LADO, só com a
  coluna nova, e a Task 9 mantém o `pagamentoDaLinha` somando o collector da conta.
- O quadro `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` (as 6 regras LINUX 1 × LINUX 3) e o contrato
  `~/projetos/physiqcalc-scratch/hml/hml19/para_linux3.md`.

**Fatos sondados em 11/10 (só leitura — nada criado, nada alterado):**
- (a) **A aplicação PhysiqCalc do MP JÁ tem um redirect cadastrado: `https://www.mercadopago.com`** (o padrão do MP), e só ele.
  `GET https://api.mercadopago.com/applications/<client_id>` com o token de TESTE da própria aplicação (o `client_id` é o 2º pedaço do token):
  `name: PhysiqCalc`, `site_id: MLB`, `callback_url: ""`, `callback_urls: ["https://www.mercadopago.com"]`, `notifications_callback_url:
  null`, `notifications_topics: []`, `scopes` com `offline_access`, `read`, `write`, `payments`; `sandbox_mode: true`, `certification_status:
  not_certified`, `active: true`, `max_requests_per_hour: 18000`. **→ a prova da `public_key` NÃO precisa esperar o redirect dele** (Task 1).
- (b) `GET https://auth.mercadopago.com/authorization?...` SEM login devolve 200 com a página de escolha de país para qualquer
  `redirect_uri` (e até para um `client_id` inventado): o MP só diz se o redirect vale DEPOIS do login. Sem atalho por `curl`. **Medido na
  revisão (11/10, só GET):** o mesmo pedido em `https://auth.mercadopago.com.br/authorization?…` → 302 direto para o login do MLB
  (`www.mercadolivre.com/jms/mlb/lgz/login?platform_id=MP&go=<a URL de autorização>`) — NÃO documentado (a doc usa o `.com`); e
  **`https://www.mercadopago.com/?code=TG-…&state=…` responde 302 para `https://www.mercadopago.com.br` SEM a query** — o `code` some da URL
  final: quem lê o `code` tem de olhar o PEDIDO, não a URL de chegada (Task 1).
- (c) Doc oficial do `POST /oauth/token` (referência da API): a resposta de exemplo traz `access_token`, `token_type`, `expires_in:
  15552000`, `scope: "read write offline_access"`, `user_id`, `refresh_token`, **`public_key`** e `live_mode` — mas a `public_key` não é
  descrita nem garantida; um guia não oficial diz "may also be present — don't depend on it". O guia oficial de marketplace manda usar
  "a public_key e o access_token do vendedor (obtidos no passo 1 — OAuth)". O `code` vale 10 min; o acesso, 180 dias; a renovação devolve um
  refresh_token NOVO a cada vez e exige o escopo `offline_access` (a aplicação tem). `test_token: "true"` na troca = credenciais de teste.
  PKCE (S256) é opcional e, ligado no painel, passa a ser exigido.
- (d) Usuários de teste: **`POST https://api.mercadopago.com/users/test`** `{site_id: "MLB", description}` com o token de PRODUÇÃO da
  aplicação devolve `id`, `nickname`, `password`, `email` (referência oficial). Pelo painel ("Suas integrações › app › Contas de teste") o
  login pede um "código de verificação" de 6 dígitos mostrado lá; uma página do MP de outro país manda usar "os 6 últimos dígitos do User ID".
  Até 15 contas de teste; não dá para apagar. O MCP do MP (`create_test_user`) exige o login dele por OAuth — fora. **A revisão (doc do
  Brasil):** o código de 6 dígitos é o que o PAINEL mostra (não "o fim do id"); para usuário criado pela API não há garantia de ele aparecer
  lá; a página de contas de teste tem o tipo **Integrador** (marketplace) — sinal de que o OAuth de teste espera uma aplicação de TESTE; e
  "Checkout Bricks não aceita contas de teste".
- (e) Webhook: o MP manda `x-signature: ts=…,v1=…` + `x-request-id` assinados com a "assinatura secreta" do painel (Webhooks › Configurar
  notificações). **Hoje a aplicação não tem webhook no painel** (`notifications_topics: []`) → não existe assinatura secreta: validar o
  `x-signature` depende do passo 6 da W2-a (que a revisão I1 tornou OBRIGATÓRIO). A `notification_url` do pagamento tem prioridade sobre a do
  painel. O tópico `mp-connect` (vinculação/desvinculação) só chega pela URL do painel. **A revisão (I1):** o exemplo oficial do `POST
  /preapproval` não tem `notification_url` e a doc se contradiz sobre os avisos de assinatura pelo painel — o aviso da cobrança de cada mês da
  automática pode só vir pela URL do PAINEL (sem `&conta=`); o MP espera 200 em até 22 s e reenvia a cada 15 min, espaçando até ~96 h.
- (f) Segredos das funções do principal (nomes): `MP_ACCESS_TOKEN_PROD`, `MP_ACCESS_TOKEN_TEST`, `MP_TEST_PAYER_EMAIL`, `PROXY_SEGREDO`,
  `SUPABASE_ANON_KEY`, os `SEGREDO_*` da hml-16c — **sem `MP_CLIENT_ID`/`MP_CLIENT_SECRET`**. Vault: 4 segredos (nenhum da W2).
- (g) Cofre B Code Segredos › PhysiqCalc (só nomes): **"Mercado Pago — PhysiqCalc"** (token; os campos dentro dele a Task 0b confere pelo
  script, só os nomes),
  "Physiq — conta de teste da prova do cartão (W4)" e "… da prova do app (W7b)" (logins do Physiq, não do MP). **Não há item de usuário de
  teste do MP nem do Client Secret.** Locais: `~/.physiq-mp-test` e `~/.physiq-mp-public-test` (600, a credencial de TESTE da aplicação).
- (h) Banco (catálogo e contagens): `public` 3 contas `mercadopago` (as do Weslley) e 9 `pix_manual`; `public.aluno_assinaturas`: 1 linha,
  cancelada (nenhuma automática viva); o `staging` tem as tabelas da W1, o `public` ainda não (a W1 vai antes); `aluno_assinaturas` já tem
  `mp_preapproval_id` único, RLS só de leitura para aluno/dono/responsável (o app não grava); 17 jobs do pg_cron, nenhum `mp-*`.

**Modo:** **até o fim** (decisão dele, 10/10 ~23h35: *"Segue sozinho wp W1, w2 e fim"* + `Skill-wbs-local-stg-prod-ate-o-fim`): sem gates
G1/G2; validação autônoma com evidência e prints nas 3 fases (local, staging, produção). **As coisas dele ficam para o FIM** (Task 23): na W2,
**cadastrar o redirect da W2 no painel do MP (W2-a)** e o teste de produção com a conta MP dele (Pergunta 2). A base é a `main` com a W1
(o squash da W1 + o bump) **e com a W1b** (a correção do C1 da revisão — a guarda das colunas do MP em `cobrancas` e as conferências do
estorno/cancelamento/detalhe; sai ANTES, à parte, com o OK dele: o furo está aberto HOJE na produção e não depende da W2).

**Decisões fechadas (dele):** D1–D7 do desenho (D5: o MP do personal = o mesmo que o MP faz hoje — Pix, cartão e automática); P-A "1" (a
automática renova sozinha depois da última parcela); P-B "1" (só da InfinitePay); ordem W-P → W1 → W2; as coisas dele no FIM.
**P-C — pendente, só se a prova falhar (Task 1):** padrão = o cartão abre a página do MP (Task 5).

**Decisões técnicas minhas (registradas; aparecem na foto do plano):**
1. **Cifra no servidor, AES-256-GCM, chave fora do banco** (`MP_TOKENS_CHAVE`, segredo das funções; cópia no cofre). Por que não o Vault/
   pgsodium: o Vault do principal guarda segredos FIXOS lidos por função SQL (`physiq_espelho_fila_segredo`, `physiq_automaticas_fila_segredo`,
   `physiq_proxy_segredo`, `physiq_push_segredo`); com N contas viram N segredos e quem tem a senha do `postgres` lê tudo em
   `vault.decrypted_secrets` — e o backup diário do notebook (`physiq-backup-diario`) leva o banco. Com a chave fora, a cópia do banco ou a senha
   não abrem os tokens. O Web Crypto já é usado no repo (`_shared/segredo-servidor.ts`, o Worker). pgsodium está descontinuado na Supabase.
   Formato `v1:<iv>:<cifra>` (versão para trocar a chave depois) e **dado associado** `physiq:w2:<schema>:<conta_id>:<campo>`: cifra copiada para
   outra conta/campo/schema não abre.
2. **A volta do OAuth no domínio próprio**: `https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/<schema>` (o Worker
   `physiq-principal-api` repassa GET com a busca e devolve o 302 sem seguir — `redirect: "manual"`). É a regra dele do domínio próprio
   (memória `feedback-dominio-proprio-na-api-apps-com-apk`): trocar o host do backend não obriga a mexer no MP. **2 URIs fixas (uma por
   schema, o schema no CAMINHO)** — o MP exige redirect estático e nada de dado na URI.
3. **`REDIRECT_TESTE_MP = https://www.mercadopago.com` SÓ no staging** (prova e E2E): a autorização manda o navegador para a página inicial
   do MP com o `?code=`; o teste lê o code **no PEDIDO que o navegador faz** (o servidor do MP responde 302 para o `.com.br` e apaga a query
   — medido na revisão, I6) e o entrega à `mp-conectar-retorno/staging`, que troca com o MESMO redirect (gravado na conexão). Assim o OAuth
   real com o vendedor de teste roda ANTES da W2-a. No `public`, o CHECK de `mp_conexoes` só aceita a URI própria.
4. **O state**: 32 bytes aleatórios (43 caracteres), só o sha256 no banco, 10 min, uso único por UPDATE condicional (`usado_em is null and
   expira_em > now()`). **PKCE S256 sempre** (o verifier cifrado na conexão); `MP_OAUTH_PKCE=0` desliga sem código se o MP recusar sem o
   PKCE ligado no painel (a Task 1 mede).
5. **Só a TROCA do code é do servidor (service_role) — a exceção da regra global, agora menor (revisão I8)**: a volta vem do MP sem a
   sessão de ninguém. A conexão foi criada pelo `prof_mp_conectar` com a sessão do DONO (jeito 2) e a volta só aceita o state dela; troca o
   code e guarda o par CIFRADO na própria `mp_conexoes` (`resultado = 'confirmar'`). **A gravação da integração é COMO A PESSOA**: a tela,
   logada, chama `prof_mp_confirmar` → `dbPessoa.rpc("recebimento_mp_confirmar")` (SECURITY DEFINER que confere `user_id` da conexão =
   `auth.uid()`, `sou_dono` e o prazo de 15 min — o molde da `recebimento_infinitepay_salvar` da W1). O resto do Recebimento segue como a
   pessoa (`dbPessoa`, RLS + guardas de 2ª camada).
6. **A CONFIRMAÇÃO liga o modo quando é seguro** (sem automática viva no MP de antes); senão fica "conectado" e a tela pede "Salvar a forma"
   (o 409 `automaticas_ativas` + OK de sempre). Destino fixo por schema (`SITE[schema]`), nada vem da URL (sem open redirect). **A volta
   SEMPRE cai no site**: `/painel/configuracoes/recebimento?mp=confirmar&c=<id da conexão>` (os erros: `?mp=<resultado>`). **No APK, o
   "Conectar" abre o SITE** (`<SITE>/painel/configuracoes/recebimento?mp=conectar`) no navegador por cima do app (`Browser.open`) e o fluxo
   inteiro (começar, autorizar, confirmar) acontece nele, com a sessão do site (o login volta à tela com a busca — H2); o app só confere no
   `browserFinished`. Por quê: no APK a sessão do Physiq mora no app e quem completa o OAuth é o navegador — confirmar pelo app, com um id que
   o próprio app recebeu, deixaria o I8 aberto (quem começa é justamente o atacante). Sai a página pública `/mp/conectado` (MENOR 18).
7. **`mp_collector_id` em `cobrancas` e `aluno_assinaturas`** (o mestre chamava de `mp_credencial`): diz QUAL conta do MP recebeu, não só
   "conta". Nulo = o MP do Physiq. Se o personal reconectar OUTRA conta do MP, o que é da antiga vira "faça pelo app do Mercado Pago" (o Physiq
   não alcança) — e reconectar outra conta é recusado (`outra_conta`) enquanto a antiga tiver, **nos alunos desta conta**, automática viva OU
   cobrança do MP em aberto (Pix até vencer, cartão em análise) — revisão I5 e MENOR 29; vale também dentro dos 7 dias depois de desconectar
   (decisão 10). **A coluna só entra em select/insert pela "regra da coluna nova"** (revisão C2): `colunasAssinatura()`, `comCollector(…)` e
   `COLUNAS_COBRANCA_W2`, todos atrás do `schemaTemW2` — nunca escrita solta (a guarda de fonte da Task 18 mede).
8. **Renovação**: job de hora em hora (minuto 41) que renova quem vence em < 30 dias + na hora do uso (vence em < 1 dia → renova antes, **só
   com ≥ 10 s de prazo no pedido** — MENOR 12: o refresh "can only be used once"; sem prazo, segue com o token que ainda vale e o job renova).
   **401 → `GET /users/me` com o MESMO token** (revisão I2: o MP devolve 401 também para recurso de OUTRA conta): 200 → o recurso não é desta
   conta (nada muda, sem renovar); 401 → renova (**no máximo 1× a cada 10 min por conta**, pelo `mp_renovado_em`) → 1 nova tentativa.
   **Trava de 2 min por conta** (`mp_integracao_reservar`) e **gravação condicional** (só grava o par novo se o refresh da linha ainda é o que
   foi usado): `invalid_grant` com a linha já trocada = outra renovação ganhou, não é erro. Renovação recusada com o acesso ainda valendo →
   fica `ativa` + `mp_erro = renovacao_recusada` + aviso "reconecte até dd/mm"; vencido ou 401 sem conserto → `erro` + aviso (no máximo 1
   por dia). **E 1×/dia por integração ativa** (`mp_conferido_em`): `GET /users/me` (o acesso tirado no MP é descoberto sem esperar um
   aluno pagar — MENOR 27) e a busca das cobranças das automáticas da conta (I1).
9. **Webhook por conta**: `notification_url = <domínio próprio>/functions/v1/mp-webhook-aluno?schema=<s>&conta=<id>`. O aviso nunca é a
   verdade (como hoje): busca o recurso com o token DA CONTA, confere `collector_id` = `mp_user_id`, `live_mode` do schema, a referência
   `physiq:<schema>:aluno:<paciente>…` de um aluno DESSA conta e então aplica (idempotente: `mp_payment_id` único, "paga" final). Conta em
   `erro` → 500 (o MP manda de novo; quando o dono reconectar, entra). **O `user_id` do aviso só vai ao log** (quem decide é o
   `collector_id` do recurso) e **não há cache de "repetido"** (revisão I4: o `payment.created` e o `payment.updated` do mesmo id chegam em
   segundos). **Aviso SEM `&conta=`** (a URL do painel — o `mp-connect` e, talvez, a cobrança mensal da automática) com o `user_id` de uma
   integração conhecida que não é a conta do Physiq → o mesmo caminho da conta (revisão I1, MENOR 5). Prazo de 18 s no caminho da conta e
   nada de renovação dentro do aviso (MENOR 34: o MP espera 22 s; o 401 vira 500 e o job renova). **`x-signature`**: confere com a
   assinatura secreta (passo 6 da W2-a, agora obrigatório) — primeiro só registra (`valida|invalida|ausente`); exige (401) só com
   `app_config.mp_webhook.exigir_assinatura = true`, ligado na Task 23 depois de ver as notificações de verdade assinadas.
10. **Desconectar**: cancela as automáticas na conta dele (todas têm de cancelar; falhou uma → nada muda, 502) → troca o modo (Pix se houver
    chave ligada, senão "não cobrar") → a integração fica `desconectada` e **o acesso fica 7 dias SÓ para LER** o que já estava em andamento
    (o Pix de 72 h pago depois da troca ainda dá baixa); depois o job apaga os tokens. Reembolso de conta desconectada: "faça pelo app do
    Mercado Pago". **Conectar OUTRA conta do MP dentro desses 7 dias** só passa quando a antiga não tiver mais nada em aberto (decisão 7 — o
    `upsert` da integração apagaria o token que ainda tem de ler o Pix aberto).
11. **MENOR 7 (pendente da W1) resolvido em 3 camadas**: o gatilho `contas_guard_mp` recusa sair de `mercadopago`/`mercadopago_conta` com
    automática viva (vale para dono, master e servidor); a `master_conta_acao('recebimento')` devolve `automaticas_ativas` antes do gatilho; a
    `master-contas` cancela com o OK (a credencial certa de cada assinatura) e só então troca. Sem acesso ao MP da conta (revogado), o master
    pode **forçar** (marca as assinaturas como canceladas no Physiq, com evento, e avisa o personal que ele desliga no app do MP **e os
    alunos** — "se o cartão continuar sendo cobrado, fale com o seu profissional"; MENOR 17: passados os 7 dias, essas cobranças não dão mais
    baixa — `conta_sem_mp` —, o que vai escrito no PR).
12. **`prof_mp_simular_conexao` (SÓ staging, só master)**: grava como "conectada" a credencial de TESTE da aplicação (`MP_ACCESS_TOKEN_TEST`,
    lida do ambiente — nada passa pelo navegador) com `mp_origem = 'teste_sem_oauth'`. Prova contra o sandbox de verdade que a GRAVAÇÃO e os
    caminhos da conta funcionam — antes e independente do OAuth real. O job não toca nela (sem refresh). **Ela NÃO prova que o token da conta
    chega em cada chamada** (o collector e o token são os mesmos do Physiq — MENOR 16): quem prova é o `--local`, com tokens diferentes no
    simulador e o `/_pedidos` conferindo o token de CADA ação da tabela da Task 9 (dito assim no PR).
13. **Flag** `app_config 'mercadopago_conta' {"liberada": false}`: na produção a opção fica escondida dos personais (o master vê) até o teste
    de produção do FIM. No staging, ligada (Task 14).
14. **O cartão sem `public_key`** (antes da Task 5, se ela for necessária): o app esconde o cartão e a automática daquela conta e oferece só o
    Pix — nunca abre o Brick com a chave do Physiq para pagar o personal (o token do cartão não valeria na conta dele).
15. **I5 da W1 estendido ao MP**: o `prof_registrar` da mensalidade com um Pix do MP aguardando usa a MESMA linha (paga "por fora") e cancela o
    Pix no MP (melhor esforço, credencial certa): a aprovação atrasada cai em "paga é final" e não vira 2º período.
16. **Pix sem chave na conta MP do personal** (`Collector user without key enabled for QR render`): erro `mp_conta_sem_chave_pix` ao aluno
    ("o Pix do seu profissional não está pronto — use o cartão") + aviso ao dono (1/dia).
17. Avisos novos ao dono como `geral` (o CHECK de `avisos.tipo` não muda); eventos em `conta_eventos` como `outro` com `{w2: …}`.
18. `_shared/tempo.ts` e `_shared/log.ts` **não mudam** (cópias no Treino com teste byte a byte); o `mpTransitorio` e o resto dos avisos de
    `cobranca-regras.ts` também não (cópia no Treino). O que é novo mora em arquivos novos.

**Correções da revisão de 11/10** (`~/projetos/physiqcalc-scratch/w2/review-plano-w2.md`: 2 CRÍTICOS, 12 IMPORTANTES, 36 MENORES). Estão
aplicadas neste plano; onde cada uma entrou está na seção "Revisão de 11/10", logo depois da estimativa.

19. **C1 — a W1b vem antes, à parte.** O app gravava `mp_payment_id`, `forma`, `status` (e o resto do MP) em `cobrancas`, e o estorno, o
    cancelamento e o detalhe agiam sobre o `mp_payment_id` da linha: dava para estornar o plano do próprio personal no MP do Physiq. O furo
    está aberto HOJE na produção e não depende da W2 → a guarda + as conferências saem na **W1b** (`20261011220000_w1b_guarda_cobrancas_mp.sql`
    + a `pagamentos-aluno` — `c1-verificacao.md` §5), com o OK dele, ANTES da W2. A W2: confere a W1b no catálogo (Task 0:
    `trg_cobrancas_guard_mp`); a guarda dela (`cobrancas_guard_mp_conta`) acrescenta SÓ o `mp_collector_id`, ao lado; a reescrita das ações
    (Task 9) MANTÉM o `pagamentoDaLinha` da W1b com a credencial escolhida e soma o collector da conta; o `sql_w2`, o `--local`
    (`reembolso_forjado`) e os testes da própria W1b (`sql_w1b`, `api_w1b`) provam de novo com a W2 por cima.
20. **C2 — a "regra da coluna nova".** `mp_collector_id` só entra em select/insert por `colunasAssinatura()`, `comCollector(…)` e
    `COLUNAS_COBRANCA_W2` (atrás do `schemaTemW2`): sem isso, entre a Task 14 (publicar) e a 22 (migration no `public`) a produção quebrava
    (PGRST204 depois do `POST /preapproval` = automática em dobro) — ou, sem a coluna no select, a automática da conta ia ao MP com o token
    do Physiq. Vitest com o db SEM a W2 + guarda de fonte (Task 18) + o caso `cancelar_automatica` no `--local`.
21. **I1 — a cobrança de cada mês da automática na conta tem rede.** Busca das cobranças da automática (`/authorized_payments/search`, o
    molde da `cobranca-conta`) no `conferirAssinatura` (os 2 MPs) e na conferência diária do `mp-contas-renovar`; o aviso SEM `&conta=` com o
    `user_id` de uma integração conhecida segue o caminho da conta; o passo 6 da W2-a (webhook no painel: Pagamentos + Planos e assinaturas +
    Vinculação, produção e teste) passa a OBRIGATÓRIO; a automática de R$ 1 da Task 23 prova antes da flag.
22. **I2 — o 401 não derruba a conexão sozinho**: `/users/me` com o mesmo token antes de renovar; renovar no máximo 1× a cada 10 min.
23. **I3 — conferir não derruba a tela**: nas conferências de LEITURA (`aluno_status`, `prof_aluno`, `aluno_mp_conferir`), integração em
    `erro` não confere e `MpContaSemAcesso`/`MpIndisponivel` viram `log.aviso` + a linha do banco; o 409 `mp_conta_indisponivel` fica só nas
    ações que criam/alteram.
24. **I4 — sem cache de "repetido" no aviso** e o `user_id` diferente só vai ao log.
25. **I5 — trocar de conta do MP espera o que está aberto** (decisões 7 e 10), contado só nos alunos desta conta (MENOR 29) — dentro do
    `recebimento_mp_confirmar`.
26. **I6 — a prova pega o `code` no PEDIDO** (o 302 do MP apaga a query), passa pela escolha de país ("Brasil" ou o `.com.br`), o código
    de verificação vem do cofre (painel) e, se a aplicação real recusar o vendedor de teste, o plano B é uma aplicação de TESTE de um
    integrador de teste (client só no `staging`: `MP_CLIENT_ID_STAGING`/`MP_CLIENT_SECRET_STAGING`).
27. **I7 — a migration NÃO devolve a `w27_conta_linha` ao `authenticated`** (H-02 da hml-01: só o `service_role`).
28. **I8 — a conexão só grava com a sessão de quem começou** (decisões 5 e 6): sem isso, um link do atacante autorizado pela vítima guardava o
    MP da vítima na conta do atacante. Caso novo `confirmar_outro`.
29. **I9 e I10 — segredo nunca passa pela conversa do agente**: o `scripts/segredos/mp_conta.py` nasce na Task 0b (o cofre pelo MCP por stdio,
    na tela só ✅/❌, nomes de campo, tamanho e sha8; o token de produção só em memória); o `chave gerar` só cria a `MP_TOKENS_CHAVE` quando
    ela não existe em lugar nenhum (igual → "já existe"; diferente → para).
30. **I11 — a automática antiga tem de estar CANCELADA (conferido) antes da nova**; senão 409 `assinatura_antiga_viva`.
31. **I12 — o teste de produção prova também o cartão (com a chave do vendedor) e a automática** (com a cobrança do mês entrando), antes da
    flag.

**Lições da revisão da W1 aplicadas aqui (o mesmo tipo de erro não entra):**

| Lição da W1 | Como a W2 evita | Tasks |
|---|---|---|
| C1 — pagamento forjado dando período grátis | Nada do corpo do aviso vale: o recurso é buscado com o token da conta; `collector_id` = `mp_user_id`; `live_mode` do schema; a referência tem de ser de um aluno DESSA conta; "paga" é final; `simular_aprovacao` e `prof_mp_simular_conexao` só no staging | 4, 10, 13 (`forjado_*`) |
| I1 — "não pago" fechava de vez | O webhook devolve 500 no que não dá para decidir (MP fora, conta em erro, schema sem W2): o MP reenvia; 200 só no que tratou ou ignorou de verdade | 10, 13 |
| I2 — migration em 2 partes = 500 entre elas | UMA migration, uma transação por schema; `schemaTemW2` olha a tabela nova; cada caminho novo só liga com ela | 6, 9, 14, 22 |
| I3 — a tela gastava as tentativas | Contador de renovação só o job mexe; a tela no máximo 1 renovação por pedido, com a trava; nada de laço da tela no MP | 4, 11 |
| I4 — o mesmo id em 2 lugares | Um state por conexão (uso único); `mp_payment_id`/`mp_preapproval_id` únicos já existem; a conexão guarda o redirect usado | 6, 8 |
| I5 — registro à mão + baixa atrasada = 2 períodos | Decisão 15 (a mesma linha) | 9, 13 (`registrado`) |
| I6 — rota pública inundável | Limite por conta (Maps separados; a conta só conta depois de achada a integração — MENOR 26) e por IP só no que vem sem `user_id`/fora do formato (MENOR 6), corpo ≤ 16 KB medido ANTES de ler (MENOR 4), conta tem de ser uuid de integração existente ANTES de qualquer ida ao MP, id no formato do MP. **Sem cache de "repetido"** (revisão I4: engolia o `updated` depois do `created`) | 8, 10, 13 (`teto`) |
| I7 — nenhum teste de verdade antes da flag | OAuth real com vendedor de teste no staging (Task 14) + a conta MP DELE na produção com R$ 1 de Pix, R$ 1 no cartão (a chave do vendedor) e uma automática de R$ 1 com a cobrança do mês entrando — tudo devolvido — ANTES da flag (Task 23; revisão I12) | 14, 23 |
| MENOR 4 — 200 no schema sem a migration perdia aviso | Webhook com `&conta=` no schema sem W2 → 500 (o MP reenvia) | 10 |
| MENOR 7 — o master tirava do MP sem cancelar | Decisão 11 | 6, 12, 16 |
| MENOR 9 — commit sem a linha do coautor | O `git -c … commit -m … -m "Co-Authored-By: …" -- <arquivos>` inteiro em cada passo | todas |
| MENOR 12 — a rodada do staging pegava teste local | No `--local`, o job `mp-renovar-staging` fica PARADO e volta no desfazer; linhas locais com `mp_origem = 'teste_local'` (o job pula) | 13 |
| MENOR 16 — publicar endpoint público "perguntando antes" | O "Segue sozinho" (10/10) cobre as 2 funções públicas novas e a migration no `public`; registrado no PR | 21 |
| "o desfazer do E2E guarda o id à parte" (`08d297f`) | O estado do `api.py` guarda os ids (conta, matrícula, integração, cobranças) num campo próprio, fora da foto | 13 |

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase-principal/functions/_shared/mp-conta-regras.ts` (novo) | regras puras: URL de autorização (state + PKCE S256), redirect por schema e o de teste, leitura do `/oauth/token` (public_key opcional), quando renovar, espera da renovação, destino e textos da volta, aviso por conta, `x-signature`, qual credencial, situação da conexão, Pix sem chave |
| `supabase-principal/functions/_shared/cifra-mp.ts` (novo) | AES-256-GCM `v1:<iv>:<cifra>` com dado associado; chave do ambiente (`MP_TOKENS_CHAVE`) |
| `supabase-principal/functions/_shared/mp-conta.ts` (novo) | `ContextoMpConta`, `schemaTemW2`, `colunasAssinatura`/`comCollector` (a regra da coluna nova — C2), `integracaoMp` (sem token), `credencialDaConta`, `trocarCodigo`, `guardarParaConfirmar` (I8), `renovarConta`, `mpContaFetch` (401 → `/users/me` → renova → 1× — I2), `chamarMp`, `buscarNaConta`, `marcarErro`, `avisarDonoDaConexao`, `credencialDaCobranca`/`credencialDaAssinatura` (escrita × leitura — I3), `registrarCobrancasDaAutomatica` (I1), `conferirConta` (o diário — MENOR 27), `pacientesComAutomaticaViva`, `cancelarAssinaturasPorCredencial`, `oauthDoAmbiente(schema)` |
| `supabase-principal/functions/_shared/cobranca-mp.ts` | `CredencialConta`, `CredencialMp`; **TROCA** o `tokenMp` de hoje (MENOR 1) e o `mpFetch` passa a aceitar a da conta; `schemaDaCredencialMp`, base do simulador SÓ em `http://127.0.0.1` |
| `supabase-principal/functions/_shared/financeiro-mp.ts` | `Cobranca.mp_collector_id?`, `COLUNAS_COBRANCA_W2`, `registrarPagamentoAvulsoDoMp` grava o collector só pelo `comCollector` |
| `supabase-principal/functions/_shared/app-sem-profissional.ts` | `cancelarAssinaturasDasMatriculas` aceita a credencial da conta e um filtro opcional por collector (acréscimo) |
| `supabase-principal/functions/_shared/planos-automatica-mp.ts` | `trocarValorDaAutomatica`/`assinaturaComoNoMp` recebem `CredencialMp` (MENOR 2: o `ContextoMp` DELE fica com o nome; o novo é `ContextoMpConta`) |
| `supabase-principal/functions/_shared/exclusao-profissional.ts` | `cancelarDosAlunos` pela credencial de cada assinatura |
| `supabase-principal/functions/_shared/recebimento-regras.ts`, `…/planos-regras.ts` | modo `mercadopago_conta` (rótulo; modalidades iguais às do MP) |
| `supabase-principal/functions/pagamentos-aluno/index.ts` | `prof_mp_conectar`, `prof_mp_confirmar` (I8), `prof_mp_desconectar`, `prof_mp_simular_conexao` (staging), Recebimento com o MP da conta; o token da conta em TODAS as chamadas do MP; `aluno_status` com `mp`; I5 da W1 no `prof_registrar`; a automática antiga cancelada antes (I11) |
| `supabase-principal/functions/mp-conectar-retorno/index.ts` (novo) | a volta do OAuth (GET, verify_jwt false): troca o code e guarda o par cifrado para a confirmação |
| `supabase-principal/functions/mp-contas-renovar/index.ts` (novo) | o job (POST, verify_jwt false, segredo S10): renova + a conferência diária (`/users/me` e as cobranças das automáticas — I1, MENOR 27) |
| `supabase-principal/functions/mp-webhook-aluno/index.ts` | o caminho por conta (`&conta=` ou o `user_id` de uma integração — I1), `x-signature`, `mp-connect`, teto, corpo lido com limite |
| `supabase-principal/functions/automaticas-fila/index.ts` | a credencial de cada assinatura (o PUT do valor vai à conta certa) |
| `supabase-principal/functions/master-contas/index.ts` | `acao recebimento`: 409 → OK → cancela pela credencial certa → troca; "forçar sem acesso" (+ aviso aos alunos — MENOR 17) |
| `supabase-principal/migrations/20261011210000_w2_mp_personal.sql` (novo — UMA) | modo, integração MP, `mp_conexoes` (+ o par até a confirmação), `mp_collector_id`, guardas, flags, master, `recebimento_mp_confirmar`, renovação + pg_cron |
| `scripts/segredos/servidor.py` | a finalidade **S10 `mp_renovar`** (molde do S9) |
| `scripts/segredos/mp_conta.py` (novo) + `scripts/segredos/test_mp_conta.py` | Task 0b: `cofre campos`, `oauth local|copiar|conferir`, `usuarios-teste criar`; Task 11: `chave gerar|conferir` (gera só se não existir — I10) e `assinatura copiar|conferir` |
| `src/financeiro/mpConta.ts` (novo) | reexporta as regras de tela (`situacaoDoMp`, `TEXTO_DO_RETORNO`, `ehResultadoDoRetorno`, `ehUrlDeAutorizacaoMp`, `ehUuidMp`) |
| `src/financeiro/{tipos,api,regras}.ts` | modo novo, `RecebimentoDaConta.mercadopago_conta`, `MatriculaPagamentos.mp`, `conectarMercadoPago`/`conexaoMercadoPago`/`confirmarMercadoPago`/`desconectarMercadoPago`, mensagens |
| `src/financeiro/recebimento.ts` | (reexport — muda junto com `recebimento-regras.ts`) |
| `src/financeiro/abrirPagamento.ts` | Task 15: abrir o MP só em `https://auth.mercadopago.com(.br)/authorization` e o site só no `SITE` (MENOR 9); Task 5 (se entrar): o checkout do MP |
| `src/painel/configuracoes/Recebimento.tsx` | opção "Mercado Pago (sua conta)", Conectar/Confirmar/Desconectar/situação, a volta `?mp=` (no APK, o Conectar abre o site) |
| `src/components/pagamentos/mpInit.ts`, `src/painel/configuracoes/plano/CartaoPagamento.tsx` | o SDK reinicia pela chave; o Brick recebe a chave por prop |
| `src/app-aluno/perfil/Pagamentos.tsx`, `…/pagamentos/PagarMercadoPago.tsx` | o modo novo; cartão com a chave do vendedor; "indisponível" |
| `src/financeiro/ui/FinanceiroDoAluno.tsx` | 1 linha no `MODO_TEXTO` (ponto de encontro com a hml-19d) |
| `src/master/{regras,tipos}.ts`, `src/master/paginas/Integracoes.tsx` | rótulos ("do Physiq" × "do personal"), KPI, situação e o "Desligar" com o OK |
| `src/lib/logsDasFuncoesPrincipal.test.ts` | as 2 funções novas na lista (ponto de encontro) |
| `e2e/w2/prova_public_key.py`, `e2e/w2/sql_w2.py`, `e2e/w2/simulador_mp.py` (+ `test_simulador_mp.py`), `e2e/w2/api.py`, `e2e/w2/telas.py` (novos) | prova, banco, simulador, servidor (staging + local + OAuth real), telas |
| `docs/e2e-rodadas.md` | as rodadas da W2 (no PR) |

**Migration** (reservada no quadro — faixa `20261011200000`–`230000` da LINUX 3; a W1 tem a `200000`):
- **UMA só**, `20261011210000_w2_mp_personal.sql`, com `{schema}`, idempotente, cada schema numa transação
  (`scripts/apply_migration_principal.py … --so staging|public`). **Dry-run antes**; testada por `e2e/w2/sql_w2.py`. Primeiro SÓ no
  `staging` (Task 6); no `public` só na Task 22, depois do backup. **MENOR 23:** o que mudar numa TABELA depois de a Task 6 aplicar no
  staging entra como `alter table … add column if not exists` (o `create table if not exists` não leva coluna nova de uma 2ª versão do
  arquivo) — as colunas do par da confirmação (I8) já nascem assim.

**Funções novas:** `mp-conectar-retorno` (**verify_jwt false**: quem chega é o navegador vindo do MP) e `mp-contas-renovar` (**verify_jwt
false**: quem chama é o pg_net, com o segredo S10). Republicadas: `pagamentos-aluno` (true), `mp-webhook-aluno` (false), `automaticas-fila`
(false), `master-contas` (true), `excluir-minha-conta` (true — empacota `_shared/exclusao-profissional.ts`). A `pagamentos-aluno` que a W2
publica já tem a W1b dentro (a base é a `main` com a W1b).

**Segredos (nenhum valor no repo, no log, em `VITE_*`, no plano — nem na conversa do agente, revisão I9):** todo segredo passa pelo
`scripts/segredos/mp_conta.py` (Task 0b), que lê o cofre pelo MCP local por stdio e grava direto (segredo das funções pela Management API;
arquivo local 600 desde o 1º byte — o `gravar_arquivo` do `servidor.py`); na tela só ✅/❌, nomes de campo, tamanho e sha8. **Nunca**
`mcp__bcode-segredos__ler_segredo` + Write nos passos do plano (o valor ficaria no transcrito da sessão).
- `MP_CLIENT_ID` (o número da aplicação — o 2º pedaço do token; não é segredo, mas fica junto) e **`MP_CLIENT_SECRET`** (do cofre; se não
  estiver lá, é o passo 5 da W2-a) → segredos das funções (`mp_conta.py oauth copiar`, Task 14). Cópia local para os testes:
  `~/.physiq-mp-oauth.json` (600, `mp_conta.py oauth local`, Task 0b).
- Plano B do I6 (só se a aplicação real recusar o vendedor de teste): `MP_CLIENT_ID_STAGING`/`MP_CLIENT_SECRET_STAGING` — o client de uma
  aplicação de TESTE de um integrador de teste (W2-a, passo 8); o `oauthDoAmbiente("staging")` usa este par quando existe, o `public` nunca.
- **`MP_TOKENS_CHAVE`** (32 bytes, base64url) → criada pelo `mp_conta.py chave gerar` **só quando ela não existe nem nas funções nem no cofre**
  (revisão I10: existindo igual → ✅ "já existe", sai 0; diferente → ❌ e para) — PRIMEIRO no cofre ("Physiq — chave dos tokens do MP do
  personal (W2)"), depois nos segredos das funções; conferida pelo digest. Perder ou trocar a chave = todos os personais reconectam: trocar é
  outro comando (`chave trocar`, fora da W2 — exige ler `v1` e `v2` lado a lado e recifrar as linhas).
- **S10 `mp_renovar`**: Vault `physiq_mp_renovar_segredo` (o pg_net manda) + `SEGREDO_MP_RENOVAR_ACEITOS` (a `mp-contas-renovar` confere só o
  sha256) — `scripts/segredos/servidor.py mp_renovar gerar → aceitar → (publicar) → trocar → conferir` (o molde do S9).
- `MP_WEBHOOK_ASSINATURA` (a assinatura secreta do painel — o passo 6 da W2-a, obrigatório desde a revisão I1) → `mp_conta.py assinatura
  copiar` (Task 23).
- Só no Deno local: `MP_API_BASE` e `MP_AUTH_BASE` (o simulador; qualquer valor que não seja `http://127.0.0.1:<porta>` é ignorado).
- Usuários de teste do MP: cofre "Mercado Pago — PhysiqCalc — usuários de teste (W2)" (com o `codigo_verificacao` do painel quando ele
  salvar — W2-a, passo 7) + `~/.physiq-mp-vendedor-teste.json` e `~/.physiq-mp-comprador-teste.json` (600, `mp_conta.py usuarios-teste
  criar`). São do ambiente de TESTE (dinheiro de mentira).

**A W2 NÃO toca (LINUX 1, hml-19):** `src/nutricao/**`, `src/painel/dietas/**`, `src/painel/aluno/avaliacao/**`, `src/integrations/repeticao.ts`,
as migrations `20261011100000`–`140000` (principal) e `20261011100000`–`120000` (Treino), a função `nutricao` e a futura `financeiro` (19d), os
`_shared` dela (`porta-pessoa.ts`, `nutricao-*.ts`, `financeiro-gravar-regras.ts`, `master-porta.ts`, `master-regras.ts`). **Pontos de encontro
(avisar no quadro antes):** `src/lib/logsDasFuncoesPrincipal.test.ts` (+2 funções), `docs/e2e-rodadas.md` (linhas no topo),
`src/financeiro/ui/FinanceiroDoAluno.tsx` (só o `MODO_TEXTO`; a 19d mexe na `:336`),
`supabase-principal/functions/master-contas/index.ts` e `excluir-minha-conta` (publicar = avisar antes; não estão na linha de nenhuma).
(O `src/rotas/registro.ts` saiu da lista: sem a página pública `/mp/conectado` — decisão 6.)

**Regras de tela (todas as tasks de tela):** confirmação só com `useConfirmar()` (nunca `window.confirm` — `semDialogoNativo.test.ts`); toda
grade com `grid-cols-1` + breakpoint (`larguraCelular.test.ts`); texto para o usuário em PT-BR simples, sem termo técnico (nada de "OAuth",
"token", "webhook", "redirect": "conectar", "sua conta do Mercado Pago", "conexão"); versão da loja (`ehLoja`): o aluno paga o PROFISSIONAL
igual (nada libera recurso do app) e o personal conecta o MP dele igual (é receber, não comprar).

Comandos usados em todo o plano (na worktree `/home/bertoldo/projetos/physiqcalc-w2`):
- **Todo bloco de comandos começa com `cd ~/projetos/physiqcalc-w2 &&`** (MENOR 31: o cwd do subagente volta ao inicial a cada chamada do
  Bash — `python3 scripts/…`, `e2e/…` e o `sys.path.insert(0, "e2e/w02")` quebram fora da worktree). Onde um bloco abaixo não traz o `cd`,
  ele vale do mesmo jeito.
- **Pesado sempre na fila da máquina** (i3): `flock ~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock <cmd>` (o shell não guarda
  variável: escrever `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock;` no começo da mesma linha). Vitest SEMPRE com
  `--maxWorkers=2`; builds, `tipos`, `lint`, `test:node`, E2E e `deno check` dentro do `flock`.
- Vitest de um arquivo: `flock $P npx vitest run --maxWorkers=2 <arquivo>` · tipos: `flock $P npm run tipos` · lint: `flock $P npm run lint` · CI
  local: `flock $P npm run test:node` (os testes dos checadores e o `checar-funcoes` R1–R4 no repo: `{ data, error }` + `if (error) throw error;`
  em toda leitura, nenhuma gravação com o resultado jogado fora, `fetch` só pelo `buscarComTempo`, `.limit` ≤ 1000) **+ `node
  scripts/ci/checar-definer.mjs`** (MENOR 7: o `test:node` NÃO roda o `checar-definer` no repo — o CI roda à parte, `.github/workflows/ci-pr.yml`).
- Deno: `DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/<slug>/index.ts` (só erro NOVO conta).
- Migration: `python3 scripts/apply_migration_principal.py <arquivo> --so staging|public [--dry-run]`.
- Função: `scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions <slug> <verify_jwt>` (recusa trocar o verify_jwt).
- E2E: um por vez, com a guarda de `/health` (os scripts param sozinhos se o Treino ou o principal não estiverem `ACTIVE_HEALTHY`).
- Commit (o comando INTEIRO em cada passo; com subagentes na mesma worktree, o `-- <arquivos>` leva só os da task):
  `git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`.
- Aviso de progresso (regra global, 06/10): previsão `HHhMM a HHhMM (pior cenário HHhMM)` + as fases, uma por linha (✅ · 🚧 · ⏳), terminal +
  tópico; agente longo → progresso a cada ~30 min.

## Estimativa (minutos de trabalho, com testes e checagens; sem esperas de terceiros)

Revista em 11/10 com a revisão: entrou a **Task 0b** (o script dos segredos — I9); as Tasks 0–4, 6–15, 18, 19 e 21–23 cresceram (e a 5, fora
do total); nenhuma task saiu nem foi renumerada. **A W1b (C1) é à parte e NÃO está nesta conta**: 110 a 175 min (pior cenário 265) pela `c1-verificacao.md`
§5.4 — 1h50 a 2h55 (pior 4h25); só a migration, que já fecha o furo, 45 a 70 (100).

```
+------+----------------------------------------------------------------+------------------------------+
| Task | O quê                                                          | Melhor a máx (pior cenário)  |
+------+----------------------------------------------------------------+------------------------------+
|  0   | Preparar a worktree (W1 e W1b na main, conferidas), quadro     | 25 a 35 (50)                 |
|  0b  | O script dos segredos: cofre → funções/arquivo 600 (I9)        | 20 a 30 (45)                 |
|  1   | PROVA da public_key (o code no PEDIDO, o país, o código — I6)  | 35 a 70 (115)                |
|  2   | Regras puras do MP da conta (TDD)                              | 40 a 60 (90)                 |
|  3   | Cifra AES-GCM dos tokens (TDD)                                 | 20 a 35 (50)                 |
|  4   | Cliente do MP da conta: credencial, troca, renovação, 401, C2  | 80 a 120 (180)               |
|  5   | P-C — SÓ se faltar a public_key: o cartão pela página do MP    | 55 a 90 (130)  fora do total |
|  6   | Banco: a migration única (+ a confirmação I8/I5) + SÓ staging  | 95 a 140 (210)               |
|  7   | Servidor: Recebimento (conectar, confirmar, desconectar)       | 55 a 80 (120)                |
|  8   | Servidor: função nova mp-conectar-retorno                      | 45 a 65 (105)                |
|  9   | Servidor: o token da conta em TODAS as chamadas (pagamentos)   | 105 a 155 (225)              |
| 10   | Servidor: webhook por conta + fila das automáticas + exclusão  | 80 a 125 (175)               |
| 11   | Servidor: mp-contas-renovar (+ o diário) + a chave e o S10     | 55 a 90 (130)                |
| 12   | Servidor: master-contas (MENOR 7: desligar cancela antes)      | 25 a 35 (60)                 |
| 13   | Simulador do MP + Deno local + e2e/w2/api.py (~35 casos)       | 135 a 200 (285)              |
| 14   | Staging do servidor: segredos, publicar 7, E2E + OAuth real    | 50 a 85 (130)                |
| 15   | Painel: Recebimento (Conectar, confirmar, situação, volta)     | 60 a 90 (130)                |
| 16   | Painel: master Integrações (vê e desliga com o OK)             | 15 a 25 (40)                 |
| 17   | App: cartão com a chave do vendedor (site e loja)              | 35 a 55 (85)                 |
| 18   | Guardas de fonte (segredos, log e a coluna nova — C2)          | 15 a 30 (40)                 |
| 19   | Testes locais finais + E2E de tela (site e loja) + prints      | 50 a 80 (125)                |
| 20   | Validação local (modo até o fim: sem gate)                     | 10 a 15 (25)                 |
| 21   | Staging (front + funções do HEAD + E2E um por vez)             | 35 a 65 (95)                 |
| 22   | Produção (backup, migration, PR → squash, smoke) — flag OFF    | 45 a 75 (115)                |
| 23   | FIM (dele): W2-a, prova se pendente, Pix + cartão + automática | 65 a 105 (170) do meu lado   |
+------+----------------------------------------------------------------+------------------------------+
| TOTAL| 0, 0b, 1–4 e 6–23                                              | 1195 a 1865 (2795)           |
| + 5  | só se a prova mostrar que falta a public_key                   | + 55 a 90 (130)              |
+------+----------------------------------------------------------------+------------------------------+
```

**Total: 19h55 a 31h05 (pior cenário 46h35)** de trabalho, mais ~25 min dele no FIM (a W2-a com o passo 6 agora obrigatório e os 3 testes
de R$ 1). Com a Task 5: **20h50 a 32h35 (pior cenário 48h45)**.

Antes da revisão: 14h00 a 21h45 (pior cenário 33h05). A diferença (+355 a +560 min; pior +810), por achado (a soma bate com a tabela):
- C1, só o que fica na W2 (a W1b conferida no catálogo, o collector esperado nas 3 ações reescritas, 2 casos) — 20 a 30 (45);
- C2 (a regra da coluna nova, o Vitest sem a W2, a guarda de fonte, o caso) — 20 a 35 (50);
- I1 (a busca das cobranças da automática no `conferirAssinatura` e no diário; o aviso sem `&conta=` pelo `user_id`) — 45 a 75 (110);
- I2 (o `/users/me` antes de renovar + o caso) — 15 a 25 (35); I3 — 15 a 20 (30); I4 — 10 a 15 (20);
- I5 + I8 (a confirmação pela sessão de quem começou, como RPC da pessoa; o APK pelo site; o I5 dentro dela; 4 casos) — 70 a 100 (145);
- I6 (a prova pegando o pedido, o país, o código; o plano B do client de teste) — 15 a 40 (60);
- I9–I11 (o script na Task 0b, a trava do `chave gerar`, a automática antiga cancelada antes) — 35 a 50 (70);
- I12 (cartão e automática de verdade antes da flag, do meu lado) — 15 a 25 (40);
- a Task 13 mais larga (a revisão: 90–130 era o honesto já antes dos casos novos) — 20 a 30 (30);
- os 36 MENORES contados um a um (a maioria custa 0–5 min; os que pesam: 4, 9, 11, 13, 16, 20 e 27) — 75 a 115 (175).

A revisão sugeria 18h20 a 28h50 (pior cenário 43h20). A diferença para ela (+95 a +135; pior +195): ela não contou os MENORES um a um (só
a Task 13 mais larga), e a confirmação COMO A PESSOA com o APK pelo site (+15 a +20; pior +30) não estava nela; o C1 que foi para a W1b sai
(−15 a −20; pior −30). O roteamento pelo `user_id` do I1 FICA mesmo que o aviso da automática chegue no `notification_url` dela: é ele que
leva o `mp-connect` (MENOR 5).

O mestre previa 430–725 min. A diferença vem do que o mestre não contava e as revisões ensinaram a contar:
- o token da conta também na `automaticas-fila`, na exclusão do personal e no `master-contas` (não só na `pagamentos-aluno`);
- a cifra com a chave fora do banco + os scripts de segredo (chave, client, S10, usuários de teste — sem valor na conversa);
- a renovação com a trava e a gravação condicional (o refresh gira) + o diário;
- o webhook por conta com teto, `x-signature` e o caminho pelo `user_id`;
- o MENOR 7 (gatilho + RPC + master + tela);
- a confirmação da conexão pela sessão de quem começou (I8);
- o simulador local do MP (OAuth inteiro: autorizar, trocar, confirmar, renovar, 401) e o OAuth REAL com vendedor de teste no staging;
- o teste de produção antes da flag com Pix, cartão e automática (I7 da W1, I12).
Calibração: a W1 fez as Tasks 0–18 em ~6h20 (03:56 → ~10:14) contra 10h00 do melhor caso dela, e a W-P real levou 417 min contra 690
estimados — com subagentes em paralelo, **o melhor caso é o mais provável**. Atualizar o JSON da foto: `W2.estimativa_min = 1865`.

Em paralelo (subagentes, arquivos separados; cada commit com `-- <arquivos>`):
- **0 → 0b** (o script dos segredos é da 1); a **1** antes de qualquer código do app;
- **2 e 3 juntas**; a 4 depois delas (importa as 2); a **6** pode andar junto com 2–4 (SQL), mas a aplicação no staging espera a trava;
- 7 e 9 mexem na mesma `pagamentos-aluno/index.ts`: **7 antes da 9**; a 8 (função nova) e a 11 (função nova + scripts) andam junto da 7;
- a 10 depois da 4 (o `financeiro-mp.ts`, o `cobranca-mp.ts` e o `planos-automatica-mp.ts` mudam SÓ na 4 — a 9 e a 10 só usam); a 12 sozinha;
- a **13** depois de 4 e 6–12 (o `--local` roda as 4 funções);
- depois do contrato das ações (7 e 9): a **15 primeiro** (tipos, chamadas, regras), então **16 e 17 juntas**;
- a esteira (14, 21, 22, 23) não paraleliza. A 5 só se a Task 1 mandar (antes da 15) ou dentro da 23.

## Revisão de 11/10 — onde cada achado entrou

Fontes: a revisão `~/projetos/physiqcalc-scratch/w2/review-plano-w2.md` (2 CRÍTICOS, 12 IMPORTANTES, 36 MENORES), as medições dela (o 302 do
`?code`, a escolha de país, o `.com.br`) e a verificação do C1 na produção (`~/projetos/physiqcalc-scratch/w2/c1-verificacao.md`, a W1b).

| Achado | O que mudou | Tasks |
|---|---|---|
| **C1** — o app gravava `mp_payment_id`/`forma`/`status` e o estorno, o cancelamento e o detalhe agiam sobre o pagamento que a linha dissesse (dava para estornar o plano do próprio personal no MP do Physiq) | A guarda das colunas do MP em `cobrancas` + as conferências (o pagamento é DESTA cobrança, o collector é o esperado) saem na **W1b** (`20261011220000_w1b_guarda_cobrancas_mp.sql`), à parte e ANTES — o furo está aberto hoje na produção. Na W2: a W1b é pré-requisito conferido no catálogo (Task 0, Step 3b: `trg_cobrancas_guard_mp`); o `cobrancas_guard_mp_conta` acrescenta só o `mp_collector_id`, ao lado; a reescrita das ações MANTÉM o `pagamentoDaLinha` da W1b (estorno, cancelamento, detalhe, `conferir` e o laço do Pix) com a credencial escolhida e o collector da conta; `sql_w2` caso 15 + o `sql_w1b`/`api_w1b` da W1b como regressão, e `--local` `reembolso_forjado` | 0, 6, 9, 13, 14, 21, 22 |
| **C2** — a `mp_collector_id` sem regra escrita (500 entre a Task 14 e a 22; ou a automática da conta com o token do Physiq) | "Regra da coluna nova": `colunasAssinatura()`, `comCollector(…)` e `COLUNAS_COBRANCA_W2`, tudo atrás do `schemaTemW2`; `cancelarAssinaturasPorCredencial` sem a W2 = o caminho de antes (sem agrupar); Vitest com o db SEM a W2 (o select com a coluna devolve 42703); guarda de fonte; caso `cancelar_automatica` | 4, 9, 10, 13, 18 |
| **I1** — a cobrança do mês da automática na conta dependia de um aviso nunca provado | `registrarCobrancasDaAutomatica` (a busca `/authorized_payments/search`, molde da `cobranca-conta`) no `conferirAssinatura` (os 2 MPs) e no diário do `mp-contas-renovar`; aviso SEM `&conta=` com o `user_id` de integração conhecida (que não é a conta do Physiq) → o caminho da conta; o passo 6 da W2-a obrigatório (produção e teste); a automática de R$ 1 antes da flag; casos `rede_automatica` e `sem_conta_pelo_user_id` | 4, 6, 9, 10, 11, 13, 23 |
| **I2** — qualquer 401 virava "a conexão caiu" (um aviso forjado derrubava o MP de um personal) | `mpContaFetch`: 401 → `GET /users/me` com o mesmo token (200 = recurso de outra conta: nada muda); renovar no máximo 1×/10 min; o `buscarNaConta` lê esse 401 como "não achado"; casos no Vitest e `webhook_401_alheio` | 4, 10, 13 |
| **I3** — o `aluno_status`/`prof_aluno` davam 409 inteiro com a conexão caída | Conferências de LEITURA com a integração em `erro` não conferem; `MpContaSemAcesso`/`MpIndisponivel` ali viram `log.aviso` + a linha do banco; o 409 `mp_conta_indisponivel` só nas ações que criam/alteram; o caso `erro` confere `aluno_status` 200 com `mp.disponivel false` e o histórico inteiro | 4, 9, 13 |
| **I4** — o cache de 60 s engolia o 2º aviso do mesmo pagamento; o `user_id` decidia antes da busca | Sem o `recente()`; o `user_id` diferente só vai ao log (quem decide é o `collector_id` do recurso); caso `criado_e_atualizado` | 10, 13 |
| **I5** — trocar de conta do MP (ou reconectar outra nos 7 dias) apagava o token que ainda tinha de ler o Pix aberto | A confirmação (`recebimento_mp_confirmar`) conta, na conta antiga com token guardado, as automáticas vivas e as cobranças do MP em aberto — só dos alunos desta conta (MENOR 29) — → `outra_conta` com o texto novo; caso `trocar_com_pix` | 2, 6, 13 |
| **I6** — a prova falhava: o `https://www.mercadopago.com/?code=…` responde 302 sem a query, e a autorização para na escolha de país | O `code` lido no PEDIDO (evento `request` + uma rota que devolve 200 "ok"), comparando o host EXATO; "Brasil" clicado ou o `.com.br` (medido; não documentado); o código de verificação do cofre (o painel), nunca "o fim do id" como regra; plano B: aplicação de TESTE de um integrador de teste com o client SÓ no staging; o app segue com o `.com` da doc | 1, 4, 13, 14, 15, 23 |
| **I7** — a migration devolvia o EXECUTE da `w27_conta_linha` ao `authenticated` (desfazia o H-02 da hml-01) | Sai das 2 linhas; só `revoke … from public, anon, authenticated` + `grant … to service_role`; o `sql_w2 --so-catalogo` e o `hml01/banco.py` conferem | 6, 22 |
| **I8** — o `state` sem amarra com a sessão: o link do atacante, autorizado pela vítima, guardava o MP da vítima na conta do atacante | A volta troca o code e guarda o par CIFRADO na `mp_conexoes` (`resultado = 'confirmar'`) → `?mp=confirmar&c=<id>`; a tela, logada, chama `prof_mp_confirmar` → `recebimento_mp_confirmar` COMO A PESSOA (`user_id` da conexão = `auth.uid()`, `sou_dono`, até 15 min); "Conectar a conta X do Mercado Pago?" com o apelido; caso `confirmar_outro`. **A mais do que a revisão pedia:** no APK, confirmar pelo `browserFinished` não fecharia o I8 (o app só teria o id que ele mesmo recebeu — e quem começa é o atacante); por isso o Conectar do APK abre o SITE e o fluxo todo acontece no navegador, com a sessão do site; a página pública `/mp/conectado` sai | 2, 6, 7, 8, 13, 15, 19 |
| **I9** — o client secret e o token de produção passavam pela conversa do agente | `scripts/segredos/mp_conta.py` na Task 0b (o cofre pelo MCP por stdio; na tela só nomes de campo, tamanho e sha8; o token de produção só em memória), usado nas Tasks 0b, 1, 14 e 23; nenhum passo usa `ler_segredo` + Write | 0, 0b, 1, 11, 14, 23 |
| **I10** — `chave gerar` rodado de novo trocava a `MP_TOKENS_CHAVE` | Só cria quando não existe nas funções nem no cofre; igual → ✅ "já existe" (sai 0); diferente → ❌ e para; trocar é outro comando (fora da W2); teste "a 2ª vez não gera" | 11, 14 |
| **I11** — a automática podia cobrar 2 vezes (a antiga sumia do banco sem cancelar) | Antes do `POST /preapproval`: a antiga viva tem de virar `cancelled` (conferido no GET) com a credencial DELA; credencial `null` ou falha → 409 `assinatura_antiga_viva`; caso | 9, 13, 15 |
| **I12** — o teste de produção só provava o Pix | Task 23: cartão de R$ 1 no APK (o `card_token` com a chave do vendedor aceito; `mp_collector_id` dele) e automática de R$ 1 com a cobrança do mês entrando pelo aviso `&conta=` ou pela busca do I1 — tudo devolvido/cancelado, antes da flag | 23 |

MENORES aplicados (todos):
- 0: o verifier certo da RFC 7636 no teste do PKCE (Task 2);
- 0b: `de64(): Uint8Array<ArrayBuffer>` (Task 3 — conferido de novo em 11/10: passa no Deno 2.5.2 e no TS 5.8.3 do app);
- 1: "TROCAR o `tokenMp` de hoje" (Task 4);
- 2: `planos-automatica-mp.ts` no mapa e no quadro; o contexto novo é `ContextoMpConta` (Tasks 0, 4, 10);
- 3: `permitido`/`PROXY_SEGREDO`/`JSON_H` criados; `ipDoPedido`/`idDoAvisoValido` importados (Task 10);
- 4: o corpo lido com `lerAte(req, 16_384)` antes de qualquer `json()` (Task 10);
- 5: o `mp-connect` entra pelo caminho sem `conta` (o `user_id` — I1) (Task 10);
- 6: o teto por IP só para o que vem sem `user_id`/fora do formato (Task 10);
- 7: `node scripts/ci/checar-definer.mjs` ("Comandos"; Tasks 6 e 19);
- 8: `e2e/w10/api.py --schema public` (Tasks 14 e 22);
- 9: o filtro do MP no `abrirPagamento.ts` (Tasks 5 e 15);
- 10: `prof_mp_desconectar` com o modo fora do MP da conta marca `desconectada` direto (Task 7);
- 11: `MpIndisponivel`/`MpContaSemAcesso` tratados por grupo no `cancelarAssinaturasPorCredencial` (viram `falhas`/`semAcesso`, nunca 500)
  (Tasks 4, 7, 10, 12);
- 12: renovar na hora do uso só com ≥ 10 s de prazo (decisão 8, Task 4);
- 13: 2xx fora do formato na renovação → `log.erro` com as CHAVES e guarda ao menos o `refresh_token` (Task 4);
- 14: a troca recusada volta `invalido` (Task 8);
- 15: `Referrer-Policy: no-referrer` na volta (Task 8);
- 16: o `--local` confere o token de CADA ação no `/_pedidos`; o PR diz que a `simulada` prova só a gravação (decisão 12, Task 13);
- 17: o "forçar" avisa também os alunos e vai ao PR (decisão 11, Task 12);
- 18: resolvido por outro caminho — a página pública `/mp/conectado` saiu (I8: no APK o Conectar abre o site);
- 19: `prof_mp_conectar` e a confirmação só para o dono (Tasks 6 e 7);
- 20: o `live_mode` da conexão conferido com o schema (`conta_de_teste`) e o `aluno_mp_cartao` com o `modoConfere` antes de aplicar
  (Tasks 2, 8, 9);
- 21: o e-mail do COMPRADOR de teste no `oauth_real`, configurável (Task 13);
- 22: o passo 6 da W2-a com a URL de teste (`?schema=staging`) (Task 23);
- 23: coluna nova depois da Task 6 = `alter table … add column if not exists` ("Migration"; Tasks 6 e 21);
- 24: a hml-19d na conferência da Task 0 (Step 3b);
- 25: a trava do BANCO também nas Tasks 13 e 19 (com `--sinal`) e o aviso à LINUX 1 corrigido (Tasks 0, 13, 19);
- 26: Maps separados (IP × conta) e a conta só conta depois de achada a integração (Task 10);
- 27: `GET /users/me` 1×/dia por integração ativa (`mp_conferido_em`) (decisão 8; Tasks 6 e 11);
- 28: `schemaDaCredencialMp(cred) === "staging"` no lugar de `credencial === "test"` (Task 9);
- 29: o `outra_conta` só pelos alunos desta conta; a prova mede se a 2ª autorização derruba a 1ª (Tasks 1 e 6);
- 30: o check anti-sobrescrita repetido, isolado, logo antes do push no `staging` (Task 21);
- 31: `cd ~/projetos/physiqcalc-w2 &&` em todo bloco ("Comandos"; Tasks 6, 13, 14, 22);
- 32: medir a cobrança de validação do cartão na automática de R$ 1 (Task 23);
- 33: "o dono autorizar a própria aplicação" escrito na Pergunta 2 (Task 23 e "Perguntas");
- 34: prazo de 18 s e nada de renovação dentro do aviso (decisão 9, Task 10).

MENORES pulados: nenhum (o 18 foi resolvido por outro caminho, acima).

Achados novos ao aplicar a revisão (não estavam nela; corrigidos aqui):
- **I8 no APK** (acima, na linha do I8): o Conectar do APK abre o site — a confirmação pelo app não fecharia o furo.
- **I1 × o teste de produção**: o caminho pelo `user_id` nunca pega a conta do Physiq (lida por `/users/me`); sem isso, na Task 23 — a conta
  do MP dele é a dona da aplicação E a integração do `admin.teste` — os avisos do MP do Physiq iriam para o `admin.teste` (Task 10).
- **O CHECK da integração** recusava a conexão OAuth `ativa` sem `refresh_token` (que a doc permite): passa com `mp_erro = 'sem_renovacao'`
  (Task 6, caso 8).
- **O log do webhook** levava `externo: { assinatura }`, que o `_shared/log.ts` descarta calado (chaves fechadas do `ExternoLog`): foi para o
  `msg`; idem as chaves do corpo fora do formato (MENOR 13) (Tasks 4 e 10).
- **`PagamentoMp` sem `collector_id`**: o tipo mora no `cobranca-regras.ts` (cópia no Treino — decisão 18: não muda); o `mp-conta.ts` usa um
  tipo local (Task 4).

---

### Task 0: Preparar a worktree (depois da W1 e da W1b em produção)

**Files:** nenhum do app; o quadro e o JSON da foto (fora do repo); a cópia deste plano em `docs/superpowers/plans/2026-10-11-w2-mp-personal.md`.
**Estimativa:** 25 a 35 min (pior cenário 50 min)

- [ ] **Step 1: A W1 e a W1b entraram na `main` e ninguém está nos mesmos arquivos (comando ISOLADO)**

Run: `git -C ~/projetos/physiqcalc fetch origin && git -C ~/projetos/physiqcalc log origin/main --oneline -8 && git -C ~/projetos/physiqcalc worktree list && gh pr list --repo weslleybertoldo/physiqcalc --state open && sed -n 1,10p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md`
Expected: `origin/main` com o squash da W1, o da **W1b** (a correção do C1: `20261011220000_w1b_guarda_cobrancas_mp.sql` + a `pagamentos-aluno`)
e os `chore: bump version` depois deles; nenhum PR aberto tocando `pagamentos-aluno/**`, `mp-webhook-aluno/**`, `automaticas-fila/**`,
`master-contas/**`, `_shared/{cobranca-mp,financeiro-mp,app-sem-profissional,exclusao-profissional,planos-automatica-mp}.ts`, `src/financeiro/**`,
`src/painel/configuracoes/Recebimento.tsx`, `src/app-aluno/perfil/**`, `src/master/**`. Se houver, parar e combinar. **Sem a W1b na `main`
→ a W2 NÃO começa** (o C1 está aberto na produção e a W2 reescreve exatamente as 3 ações dele): avisar e esperar a W1b.

- [ ] **Step 2: Criar a worktree e o ambiente local**

```bash
git -C ~/projetos/physiqcalc worktree add -b feat/w2-mp-personal ~/projetos/physiqcalc-w2 origin/main
cp ~/projetos/physiqcalc-w1/.env.local ~/projetos/physiqcalc-w2/.env.local     # build de STAGING (VITE_DB_SCHEMA=staging)
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P npm ci
```
Expected: worktree em `origin/main`; `npm ci` sem erro. (A `~/projetos/physiqcalc-w1` fica até a W1 fechar o FIM — não apagar.)

- [ ] **Step 3: Os corpos que a W2 recria ainda são os que este plano copia**

Run: `cd ~/projetos/physiqcalc-w2 && rg -n 'function \{schema\}\.(w27_conta_linha|master_integracoes|master_conta_acao|contas_guard)\(' supabase-principal/migrations/ | sort`
Expected: a mais nova de cada = `20261011200000_w1_infinitepay.sql` (`contas_guard` :193 — a W2 NÃO recria; `w27_conta_linha` :372;
`master_integracoes` :408) e `20261002010000_w27_master.sql` (`master_conta_acao` :212–358, o ramo `recebimento` em :330–336). Uma migration
mais nova (ex.: da W1b ou da hml-19c/d) recriou alguma → partir do corpo dela na Task 6 e anotar no PR.

- [ ] **Step 3b: A W1b está VIVA nos 2 schemas (catálogo, só leitura) e a hml-19d não mexeu em `cobrancas` (revisão C1 e MENOR 24)**

```bash
cd ~/projetos/physiqcalc-w2 && python3 - <<'PY'
# só leitura (set transaction read only): o gatilho da W1b que congela as colunas do MP em cobrancas para o app, nos 2 schemas
import sys
sys.path.insert(0, "/home/bertoldo/projetos/physiqcalc-w2/e2e/w02")
from _comum import sql_principal as q
r = q("""set transaction read only;
select n.nspname as schema, t.tgname as gatilho, p.proname as funcao, t.tgenabled <> 'D' as ligado
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
 where c.relname = 'cobrancas' and n.nspname in ('public', 'staging') and not t.tgisinternal
   and p.prosrc like '%mp_payment_id%' and p.prosrc like '%authenticated%' and p.prosrc like '%pix_copia_cola%'
 order by 1, 2""")
for x in r:
    print(x["schema"], x["gatilho"], x["funcao"], "ligado" if x["ligado"] else "DESLIGADO")
ok = {x["schema"] for x in r if x["ligado"]} == {"public", "staging"}
print("W1b no catálogo:", "✅ public e staging" if ok else "❌ FALTA — a W2 não começa")
sys.exit(0 if ok else 1)
PY
rg -n 'cobrancas|aluno_assinaturas' supabase-principal/migrations/2026101112*.sql supabase-principal/migrations/2026101113*.sql 2>/dev/null | rg -v '^\s*--' | head -20
```
Expected: 1 gatilho LIGADO por schema — `trg_cobrancas_guard_mp` → `cobrancas_guard_mp` (os nomes da W1b, `c1-verificacao.md` §5.1; a
consulta acha pelo corpo, então um nome diferente no fim também aparece — anotar no topo deste plano) — e `W1b no catálogo: ✅`; ❌ → parar
(a W2 não começa sem a W1b em produção). O `rg` da hml-19c/d: nenhuma policy nem gatilho novo em `cobrancas`/
`aluno_assinaturas` (o contrato da 19d diz que ela não toca; se tocou, ler a migration e anotar o que muda para a Task 6/9 antes de seguir).
A conferência da W1b na `pagamentos-aluno`: `rg -n 'pagamentoDaLinha|exigirDaCobranca|pagamentoEDaCobranca' supabase-principal/functions/` →
o ajudante no `prof_reembolsar`, no `prof_cobranca_cancelar`, no `detalhe_mp`, no `conferir` e no laço do Pix do `aluno_mp_pix`, e a regra pura
em `_shared/financeiro-regras.ts` (`c1-verificacao.md` §5.2). Outro nome no PR da W1b → anotar no topo deste plano; a Task 9 a mantém.

- [ ] **Step 4: Base verde**

```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro src/painel/configuracoes src/app-aluno/perfil src/master src/lib/logsDasFuncoesPrincipal.test.ts \
  src/lib/segredoServidor.test.ts src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts
```
Expected: tudo PASS (o que falhar aqui não é da W2 — anotar e avisar antes de seguir).

- [ ] **Step 5: Quadro e aviso à LINUX 1** (com o Edit, nunca `sed -i`)

1. Na linha da LINUX 3 de `~/projetos/physiqcalc-scratch/quem-toca-o-que.md`: ✅ W1 e ✅ W1b (com a hora); frente nova "**W2 MP do personal** (até o
   fim)", worktree `~/projetos/physiqcalc-w2` (branch `feat/w2-mp-personal`); toca: `pagamentos-aluno/**`, `mp-webhook-aluno/**`,
   `mp-conectar-retorno/**` (NOVA, verify_jwt false), `mp-contas-renovar/**` (NOVA, verify_jwt false), `automaticas-fila/**`,
   `master-contas/index.ts` (avisar antes de publicar), `excluir-minha-conta` (só republicar), `_shared/{mp-conta-regras,cifra-mp,mp-conta}.ts`
   (novos), `_shared/{cobranca-mp,financeiro-mp,app-sem-profissional,exclusao-profissional,planos-automatica-mp,recebimento-regras,planos-regras}.ts`,
   `src/financeiro/**` (inclusive `abrirPagamento.ts`), `src/painel/configuracoes/Recebimento.tsx`, `src/components/pagamentos/mpInit.ts`,
   `src/painel/configuracoes/plano/CartaoPagamento.tsx`, `src/app-aluno/perfil/**`, `src/master/**`,
   `scripts/segredos/{servidor,mp_conta,test_mp_conta}.py`, `e2e/w2/**`; pontos de encontro: `logsDasFuncoesPrincipal.test.ts` (+2),
   `e2e-rodadas.md`, `FinanceiroDoAluno.tsx` (`MODO_TEXTO`); migration **RESERVADA** `20261011210000_w2_mp_personal.sql` (UMA; faixa
   200000–230000; a `220000` é da W1b); "Desde" = agora.
2. `SendMessage` à LINUX 1: "LINUX 3 começou a W2 (MP do personal), com a W1b já em produção. Arquivos e a migration 20261011210000 no quadro.
   Pontos de encontro: logsDasFuncoesPrincipal.test.ts (+2 funções), e2e-rodadas.md, FinanceiroDoAluno.tsx (só MODO_TEXTO). Vou publicar
   master-contas e excluir-minha-conta além das minhas — aviso antes. Trava do BANCO do staging nas Tasks 6 (migration), 13 (api.py --local:
   grava linhas de teste e PARA o job mp-renovar-staging), 14 (publicar + E2E), 19 (telas locais contra o staging, com prof2/aluno2) e 21 —
   sempre com aviso antes e o --sinal." (MENOR 25: o aviso antigo dizia só 6, 14 e 21.)

- [ ] **Step 6: O cofre — SÓ pelo script, nunca pela conversa (revisão I9)**

Nada de `mcp__bcode-segredos__ler_segredo` nem de Write com valor de segredo nesta W2: o valor iria para o transcrito da sessão. Os nomes
dos campos do item "Mercado Pago — PhysiqCalc", o Client Secret e a cópia local `~/.physiq-mp-oauth.json` (600) saem do
`scripts/segredos/mp_conta.py`, escrito na **Task 0b** (logo a seguir), com `cofre campos` e `oauth local`. **Sem o Client Secret no cofre:**
a troca do `code` (Task 1, Step 3 em diante; o OAuth real das Tasks 14/21) espera o passo 5 da W2-a (FIM) — o resto da W2 segue (o simulador e a
conexão simulada não precisam dele). Registrar no topo deste plano ("Client Secret no cofre: sim/não" — só isso).

- [ ] **Step 7: Este plano no repo e a foto**

```bash
cd ~/projetos/physiqcalc-w2
cp ~/projetos/physiqcalc-scratch/w2/2026-10-11-w2-mp-personal.md docs/superpowers/plans/2026-10-11-w2-mp-personal.md
git add docs/superpowers/plans/2026-10-11-w2-mp-personal.md
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(w2): plano detalhado do Mercado Pago do personal (com a revisão de 11/10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/plans/2026-10-11-w2-mp-personal.md
```
No JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-planos-e-recebimento.json`: `W2.status = "andamento"`, `inicio` = agora,
`estimativa_min = 1865`; o item "Pré-requisito seu" fica `falta` com o resumo "no FIM: o endereço de retorno e os avisos no painel do MP". Foto
da página em andamento (`andamento_worktrees.py … --atual`) com a previsão e as fases, terminal + tópico.

---

### Task 0b: O script dos segredos do MP do personal — `scripts/segredos/mp_conta.py` (revisão I9)

**Files:**
- Create: `scripts/segredos/mp_conta.py`, `scripts/segredos/test_mp_conta.py`
- Fora do repo: `~/.physiq-mp-oauth.json` (600 — `oauth local`)

**Estimativa:** 20 a 30 min (pior cenário 45 min). Vem antes da Task 1 (a prova lê o client e os usuários de teste por ele).

O que ele resolve: o client secret (Task 0) e o token de PRODUÇÃO (os usuários de teste da Task 1) passavam pela conversa do agente
(`ler_segredo` devolve o VALOR; o Write deixa a entrada no transcrito `~/.claude/projects/…`). Aqui o cofre é lido pelo MCP local por stdio
— o mesmo cliente do `servidor.py` (importado) —, o valor só vive na memória do processo e sai direto para onde vai (segredo das funções pela
Management API; arquivo 600 desde o 1º byte). Na tela: ✅/❌, nomes de campo, tamanho e sha8. A Task 11 acrescenta `chave gerar|conferir` e a
Task 23 o `assinatura copiar|conferir`.

- [ ] **Step 1: O teste primeiro** (`scripts/segredos/test_mp_conta.py`, o molde do `test_servidor.py`: o cofre e a Management API na memória,
  valores falsos feitos na hora — NENHUM pode aparecer na saída):
  1. `cofre campos` com um item de campos `valor` (`APP_USR-<16 díg.>-…`), extras `client_secret` e `public_key_teste` → a saída tem os 3 NOMES,
     o "tipo" de cada (`token de produção`, `client secret`, `chave pública`) e o tamanho — e nenhum valor nem sha256 inteiro;
  2. `oauth local` grava `~/.physiq-mp-oauth.json` (no `HOME` de um diretório temporário) com modo 600 e `client_id` = o 2º pedaço do token
     quando não há campo `client_id`; sem campo de secret → ❌ "sem o Client Secret no cofre (W2-a, passo 5)" e sai 2, sem arquivo;
  3. `oauth copiar` grava `MP_CLIENT_ID`/`MP_CLIENT_SECRET` no principal (e os `_STAGING` só se o item "Mercado Pago — PhysiqCalc —
     aplicação de teste (W2)" existir); `oauth conferir` compara os digests (o falso devolve sha256) — diferente → sai 1;
  4. `usuarios-teste criar`: o item de usuários já existe → só grava os 2 arquivos 600 (nenhum `POST /users/test`); não existe → 2 POSTs com
     `Authorization: Bearer <o token de produção>` (o urlopen falso confere o cabeçalho) → `salvar_segredo` tipo login → os 2 arquivos 600; a
     saída mostra só papel, id e as chaves da resposta;
  5. `--dry-run` não grava nada (nem cofre, nem funções, nem arquivo).
  Run: `cd ~/projetos/physiqcalc-w2 && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_mp_conta.py` → FAIL (não existe).

- [ ] **Step 2: O script**

```python
#!/usr/bin/env python3
"""Physiq W2 — os segredos do Mercado Pago do personal, sem valor na tela, no log ou na conversa (revisão I9 e I10 do plano da W2).

Uso:  python3 scripts/segredos/mp_conta.py <grupo> <subcomando> [--dry-run]
  cofre campos            os NOMES dos campos do item "Mercado Pago — PhysiqCalc" e o que cada um parece ser (token de produção/teste,
                          chave pública, client id, client secret) + o tamanho. Nunca o valor.
  oauth local             ~/.physiq-mp-oauth.json (600) com client_id e client_secret (a prova da Task 1 e o oauth_real).
  oauth copiar|conferir   MP_CLIENT_ID e MP_CLIENT_SECRET (+ os _STAGING do item "… — aplicação de teste (W2)", se existir: o plano B do I6)
                          nos segredos das funções do principal / o digest das funções = sha256 do cofre (sai 1 se não bate).
  usuarios-teste criar    vendedor e comprador de TESTE (POST /users/test, MLB) com o token de PRODUÇÃO só na memória → cofre ("Mercado
                          Pago — PhysiqCalc — usuários de teste (W2)", tipo login) → ~/.physiq-mp-{vendedor,comprador}-teste.json (600).
                          Já no cofre → só os 2 arquivos (o MP não apaga usuário de teste: até 15 por aplicação — não criar outro par).
  chave gerar|conferir    (Task 11) a MP_TOKENS_CHAVE — gera SÓ quando não existe em lugar nenhum (I10).
  assinatura copiar|conferir (Task 23) a MP_WEBHOOK_ASSINATURA do item "… — assinatura dos avisos (W2)".
Credenciais: o PAT em ~/.pc-pat (Management API) e o cofre pelo MCP local por stdio — o Remoto do servidor.py.
Testes: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_mp_conta.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import servidor as S  # noqa: E402  (Remoto, Falha, guardar, ok, nota, sha8, sha256_hex, gravar_arquivo, PROJETO_COFRE)

ITEM = "Mercado Pago — PhysiqCalc"
ITEM_TESTE_APP = "Mercado Pago — PhysiqCalc — aplicação de teste (W2)"
ITEM_USUARIOS = "Mercado Pago — PhysiqCalc — usuários de teste (W2)"
TOKEN_PROD = re.compile(r"APP_USR-(\d{6,20})-\d{6}-[0-9a-f]{20,64}-\d{3,20}")
TOKEN_TESTE = re.compile(r"TEST-(\d{6,20})-\d{6}-[0-9a-f]{20,64}-\d{3,20}")
CHAVE_PUBLICA = re.compile(r"(APP_USR|TEST)-[0-9a-f]{8}-[0-9a-f-]{20,40}")
SECRET = re.compile(r"[A-Za-z0-9]{20,64}")
CASA = Path.home()


def ler_item(r: S.Remoto, nome: str) -> list[tuple[str, str]] | None:
    """[(nome do campo, valor)] de QUALQUER tipo de item (os campos de topo + os extras) — os valores só na memória; None = não existe."""
    erro, texto = r._mcp().ferramenta("ler_segredo", {"projeto": S.PROJETO_COFRE, "nome": nome})
    if erro:
        if texto.startswith("ITEM_NAO_ENCONTRADO"):
            return None
        raise S.Falha(f"cofre: ler \"{nome}\" falhou — {texto[:120]}")
    campos = (json.loads(texto) or {}).get("campos") or {}
    pares: list[tuple[str, str]] = []
    for k, v in campos.items():
        if k == "extras":
            pares += [(str(e.get("nome")), str(e.get("valor") or "")) for e in (v or []) if isinstance(e, dict)]
        elif isinstance(v, (str, int)) and str(v).strip():
            pares.append((k, str(v).strip()))
    for _, v in pares:
        S.guardar(v)                                  # nenhuma mensagem que sai daqui leva um valor (o limpo() do servidor.py)
    return pares


def tipo_de(nome: str, valor: str) -> str:
    n = nome.lower()
    if TOKEN_PROD.fullmatch(valor):
        return "token de produção"
    if TOKEN_TESTE.fullmatch(valor):
        return "token de teste"
    if CHAVE_PUBLICA.fullmatch(valor):
        return "chave pública"
    if "secret" in n and SECRET.fullmatch(valor):
        return "client secret"
    if ("client" in n or "app" in n) and valor.isdigit():
        return "client id"
    return "outro"


def cliente(pares: list[tuple[str, str]]) -> tuple[str | None, str | None]:
    """(client_id, client_secret): o id do campo ou do 2º pedaço do token de produção; o secret só do campo."""
    tipos = [(tipo_de(n, v), v) for n, v in pares]
    cid = next((v for t, v in tipos if t == "client id"), None)
    if not cid:
        tok = next((v for t, v in tipos if t == "token de produção"), None)
        cid = TOKEN_PROD.fullmatch(tok).group(1) if tok else None
    return cid, next((v for t, v in tipos if t == "client secret"), None)


def cofre_campos(r: S.Remoto, a: argparse.Namespace) -> int:
    pares = ler_item(r, ITEM)
    if pares is None:
        return 0 if S.ok(False, f"o item \"{ITEM}\" não existe no cofre") else 1
    for n, v in pares:
        S.nota(f"campo \"{n}\": {tipo_de(n, v)} · {len(v)} caracteres")
    cid, sec = cliente(pares)
    S.ok(cid, "client id: " + ("achado" if cid else "NÃO achado"))
    return 0 if S.ok(sec, "client secret: " + ("achado" if sec else "NÃO achado — é o passo 5 da W2-a (FIM)")) else 2


def oauth_local(r: S.Remoto, a: argparse.Namespace) -> int:
    cid, sec = cliente(ler_item(r, ITEM) or [])
    if not (cid and sec):
        S.ok(False, "sem o Client Secret no cofre (W2-a, passo 5): a troca do code espera o FIM — nada gravado")
        return 2
    destino = CASA / ".physiq-mp-oauth.json"
    if not a.dry_run:
        S.gravar_arquivo(destino, json.dumps({"client_id": cid, "client_secret": sec}))
    return 0 if S.ok(a.dry_run or (destino.stat().st_mode & 0o777) == 0o600,
                     f"~/{destino.name} (600): client_id {len(cid)} dígitos, client_secret {len(sec)} caracteres (sha8 {S.sha8(sec)})") else 1


def oauth_pares(r: S.Remoto) -> dict[str, str]:
    cid, sec = cliente(ler_item(r, ITEM) or [])
    if not (cid and sec):
        raise S.Falha("sem o Client Secret no cofre (W2-a, passo 5)")
    segredos = {"MP_CLIENT_ID": cid, "MP_CLIENT_SECRET": sec}
    teste = ler_item(r, ITEM_TESTE_APP)
    if teste:
        tcid, tsec = cliente(teste)
        if tcid and tsec:
            segredos |= {"MP_CLIENT_ID_STAGING": tcid, "MP_CLIENT_SECRET_STAGING": tsec}
    return segredos


def oauth_copiar(r: S.Remoto, a: argparse.Namespace) -> int:
    for nome, valor in oauth_pares(r).items():
        if a.dry_run:
            S.nota(f"--dry-run: gravaria {nome} ({len(valor)} caracteres, sha8 {S.sha8(valor)}) no principal")
        else:
            r.gravar_segredo("principal", nome, valor)
    return 0 if a.dry_run else oauth_conferir(r, a)


def oauth_conferir(r: S.Remoto, a: argparse.Namespace) -> int:
    nas_funcoes = r.segredos("principal")
    certo = True
    for nome, valor in oauth_pares(r).items():
        certo = S.ok(nas_funcoes.get(nome) == S.sha256_hex(valor), f"{nome} nas funções = o cofre (sha8 {S.sha8(valor)})") and certo
    return 0 if certo else 1


def usuarios_criar(r: S.Remoto, a: argparse.Namespace) -> int:
    def gravar_os_2(dados: dict[str, dict]) -> bool:
        certo = True
        for papel, d in dados.items():
            destino = CASA / f".physiq-mp-{papel}-teste.json"
            if not a.dry_run:
                S.gravar_arquivo(destino, json.dumps(d))
            certo = S.ok(a.dry_run or (destino.stat().st_mode & 0o777) == 0o600, f"~/{destino.name} (600): chaves {sorted(d)}") and certo
        return certo

    existentes = ler_item(r, ITEM_USUARIOS)
    if existentes:
        c = dict(existentes)
        dados = {p: {"id": c.get(f"{p}_id"), "nickname": c.get(f"{p}_usuario"), "email": c.get(f"{p}_email"), "password": c.get(f"{p}_senha"),
                     "codigo_verificacao": c.get(f"{p}_codigo_verificacao")} for p in ("vendedor", "comprador")}
        S.nota("os usuários de teste já estão no cofre: só os 2 arquivos (nenhum POST /users/test)")
        return 0 if gravar_os_2(dados) else 1
    tok = next((v for n, v in (ler_item(r, ITEM) or []) if tipo_de(n, v) == "token de produção"), None)
    if not tok:
        return 0 if S.ok(False, "sem o token de produção no cofre: os usuários de teste vão para o FIM (W2-a, passo 7)") else 2
    if a.dry_run:
        S.nota("--dry-run: criaria 2 usuários de teste (POST /users/test, MLB)")
        return 0
    dados: dict[str, dict] = {}
    for papel in ("vendedor", "comprador"):
        req = urllib.request.Request("https://api.mercadopago.com/users/test", method="POST",
                                     data=json.dumps({"site_id": "MLB", "description": f"Physiq W2 {papel}"}).encode(),
                                     headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:  # 4xx → a exceção sai pelo limpo() do main (sem valor)
            corpo = json.loads(resp.read())
        dados[papel] = {k: corpo.get(k) for k in ("id", "nickname", "password", "email")}
        for v in dados[papel].values():
            S.guardar(str(v) if v is not None else None)
        S.nota(f"{papel}: id {corpo.get('id')} | chaves da resposta {sorted(corpo)}")
    v, c = dados["vendedor"], dados["comprador"]
    erro, texto = r._mcp().ferramenta("salvar_segredo", {"projeto": S.PROJETO_COFRE, "nome": ITEM_USUARIOS, "tipo": "login", "campos": {
        "usuario": str(v["nickname"] or v["email"]), "senha": str(v["password"]), "url": "https://www.mercadopago.com.br",
        "extras": [{"nome": f"{p}_{k}", "valor": str(d[k2] or ""), "oculto": k in ("senha",)} for p, d in (("vendedor", v), ("comprador", c))
                   for k, k2 in (("id", "id"), ("usuario", "nickname"), ("email", "email"), ("senha", "password"))]}})
    if erro:
        raise S.Falha(f"cofre: salvar \"{ITEM_USUARIOS}\" falhou — {texto[:120]}")
    return 0 if gravar_os_2(dados) else 1


COMANDOS = {("cofre", "campos"): cofre_campos, ("oauth", "local"): oauth_local, ("oauth", "copiar"): oauth_copiar,
            ("oauth", "conferir"): oauth_conferir, ("usuarios-teste", "criar"): usuarios_criar}


def main(argv: list[str] | None = None, remoto: S.Remoto | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("grupo")
    ap.add_argument("subcomando")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    f = COMANDOS.get((a.grupo, a.subcomando))
    if not f:
        ap.error(f"comando desconhecido: {a.grupo} {a.subcomando}")
    r = remoto or S.Remoto()
    try:
        return f(r, a)
    except (S.Falha, OSError, ValueError) as e:
        S.ok(False, str(e))            # o ok() passa pelo limpo(): nenhum valor guardado sai
        return 1
    finally:
        r.fechar()


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Verde + rodar** (o cofre de verdade, só leitura e o arquivo local):
```bash
cd ~/projetos/physiqcalc-w2 && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_mp_conta.py scripts/segredos/test_servidor.py
python3 scripts/segredos/mp_conta.py cofre campos
python3 scripts/segredos/mp_conta.py oauth local
```
Expected: os testes PASS (o do `servidor.py` sem regressão); `cofre campos` lista os NOMES e tipos (registrar no topo deste plano: "Item do
MP: campos …; Client Secret no cofre: sim/não"); `oauth local` ✅ (sim) ou ❌ + sai 2 (não — a troca do code espera o FIM). Nenhum valor na tela.

- [ ] **Step 4: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add scripts/segredos/mp_conta.py scripts/segredos/test_mp_conta.py
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): o script dos segredos do Mercado Pago do personal — cofre, client e usuários de teste sem valor na tela" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/segredos/mp_conta.py scripts/segredos/test_mp_conta.py
```

---

### Task 1: PROVA da `public_key` (antes de qualquer código do app)

**Files:**
- Create: `e2e/w2/prova_public_key.py`
- Fora do repo: `~/projetos/physiqcalc-scratch/w2/prova-public-key.json` (só chaves e booleanos); os arquivos 600 dos usuários de teste e do
  client (`scripts/segredos/mp_conta.py` — nenhum valor passa pela conversa); prints em `~/projetos/physiqcalc-scratch/prints/w2/prova/`.

**Estimativa:** 35 a 70 min (pior cenário 115 min)

> **Ainda dá para fazer SEM o redirect dele — agora pelo caminho que a revisão MEDIU (I6).** A aplicação já tem `https://www.mercadopago.com`
> cadastrado (fato (a)) e o MP exige o `redirect_uri` IGUAL ao cadastrado: antes da W2-a a volta NÃO pode ir para um servidor nosso, então
> quem lê o `code` é o próprio navegador do Playwright (Edge), logado como o **vendedor de TESTE**:
> 1. **A URL** — a da doc, a mesma que o app vai usar: `https://auth.mercadopago.com/authorization?client_id=<APP_ID>&response_type=code&
>    platform_id=mp&state=<aleatório>&redirect_uri=https://www.mercadopago.com&code_challenge=<S256>&code_challenge_method=S256`.
> 2. **A escolha de país** (o `.com` para nela — fato (b)): o script clica em **"Brasil"**. Travou ali → de novo com `--auth-br`, que abre
>    direto `https://auth.mercadopago.com.br/authorization?…` (medido: 302 para o login do MLB; NÃO documentado — o app só troca para ele
>    se o `.com` não fechar o ciclo nem clicando "Brasil").
> 3. **O login** do vendedor de teste: usuário e senha do arquivo 600; **o código de verificação de 6 dígitos vem do cofre**
>    (`vendedor_codigo_verificacao` — o que o PAINEL mostra; W2-a, passo 7). Sem ele, UMA tentativa com os 6 últimos dígitos do id (a regra de
>    uma página de outro país, não documentada no Brasil); recusado → para com print.
> 4. **"Autorizar"** → o MP manda o navegador para `https://www.mercadopago.com/?code=TG-…&state=…`, e o servidor do MP responde **302 para
>    `https://www.mercadopago.com.br` SEM a query** (medido em 11/10). Por isso **o script lê o PEDIDO, não a URL de chegada**: o evento
>    `request` do Playwright registra a URL do pedido ao redirect (com o `code` e o `state`) ANTES de a resposta chegar, e uma rota
>    (`page.route`) devolve 200 "ok" a esse endereço sem deixar o navegador seguir. Comparação pelo host EXATO (`www.mercadopago.com`, caminho
>    `/`) — nunca por prefixo de texto (o `https://www.mercadopago.com.br/` também começa com `https://www.mercadopago.com`).
> 5. **A troca**: `POST https://api.mercadopago.com/oauth/token` com o MESMO `redirect_uri` e o `code_verifier`; `test_token` "true" (o
>    staging) na 1ª autorização e "false" (o formato da produção) na 2ª; a 1ª é renovada 1 vez (o refresh gira?); depois da 2ª, o
>    `GET /users/me` com o access da 1ª mede se a 2ª autorização derruba a 1ª (MENOR 29).
>
> Precisa: o Client Secret (Task 0b, `oauth local`) e o vendedor de teste (Step 1). **Se travar, vai para o FIM (Task 23, com a W2-a):**
> (1) sem o Client Secret no cofre; (2) o login para no código de verificação (usuário criado pela API pode não aparecer no painel); (3) o MP
> recusa um vendedor de teste autorizando uma aplicação de conta REAL (provável: a doc tem o tipo "Integrador" para o marketplace de teste);
> (4) captcha. No FIM: (2) ele salva o código do painel (passo 7) e a prova roda de novo; (3) o **plano B** — ele cria pelo painel um
> **Integrador de teste + uma aplicação de TESTE dele** (passo 8) e o client dela vai SÓ para o staging (`MP_CLIENT_ID_STAGING`/
> `MP_CLIENT_SECRET_STAGING`, escolhidos pelo schema no `oauthDoAmbiente`): a prova e o `oauth_real` deixam de depender de a aplicação real
> aceitar vendedor de teste. O código do app segue com o Brick enquanto isso (a decisão 14 cobre a falta da chave).

- [ ] **Step 1: Os 2 usuários de teste (vendedor e comprador) — pelo script, com o token de produção só na memória dele (I9)**

```bash
cd ~/projetos/physiqcalc-w2 && python3 scripts/segredos/mp_conta.py usuarios-teste criar
```
Expected: `vendedor: id <n> | chaves da resposta [...]`, `comprador: …` e os 2 arquivos 600 ✅ — ou "os usuários de teste já estão no cofre:
só os 2 arquivos". ❌ (token recusado, endpoint fora) → a prova vai para o FIM: no passo 7 da W2-a ele abre "Contas de teste" e salva usuário,
senha e código de verificação no cofre pela tela; depois o mesmo comando só regrava os arquivos.

- [ ] **Step 2: Escrever o script da prova**

```python
#!/usr/bin/env python3
"""Physiq W2 — Task 1: a PROVA da public_key (antes de qualquer código do app). O vendedor de TESTE do Mercado Pago autoriza a aplicação
PhysiqCalc pelo redirect que ela JÁ tem cadastrado (https://www.mercadopago.com — GET /applications/<id>, 11/10). O code é lido do PEDIDO
que o navegador faz ao redirect — o servidor do MP responde 302 para o .com.br e APAGA a query (medido em 11/10; revisão I6) —, nunca da
URL de chegada; a escolha de país ("Brasil") é clicada (ou --auth-br abre direto o auth.mercadopago.com.br). Troca no POST /oauth/token —
1ª autorização com test_token "true" (o que o staging usa), 2ª com "false" (o formato da produção) —, renova a 1ª 1 vez (o refresh gira?) e,
depois da 2ª, confere se o access da 1ª ainda vale (a 2ª autorização derruba a 1ª? — MENOR 29). Imprime e grava SÓ as chaves das respostas
e booleanos: nunca token, code, chave, id, usuário ou senha.
Precisa: ~/.physiq-mp-oauth.json e ~/.physiq-mp-vendedor-teste.json (600 — scripts/segredos/mp_conta.py oauth local / usuarios-teste criar).
Saída: ~/projetos/physiqcalc-scratch/w2/prova-public-key.json · prints (do MP, sem dado real) em ~/projetos/physiqcalc-scratch/prints/w2/prova/.
Uso: python3 e2e/w2/prova_public_key.py [--canal msedge] [--sem-pkce] [--com-tela] [--auth-br]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BOTAO_ENTRAR = re.compile(r"continuar|entrar|iniciar", re.I)
BRASIL = re.compile(r"^\s*brasil\s*$", re.I)

CASA = Path.home()
SAIDA = CASA / "projetos/physiqcalc-scratch/w2/prova-public-key.json"
PRINTS = CASA / "projetos/physiqcalc-scratch/prints/w2/prova"
REDIRECT = "https://www.mercadopago.com"                    # o ÚNICO redirect cadastrado hoje (fato (a))
AUTH = "https://auth.mercadopago.com/authorization"         # o da doc — o mesmo do app (MP_AUTH)
AUTH_BR = "https://auth.mercadopago.com.br/authorization"   # medido 11/10: vai direto ao login do MLB (NÃO documentado)
TOKEN = "https://api.mercadopago.com/oauth/token"
SEGURAR = re.compile(r"^https://www\.mercadopago\.com/?(\?.*)?$")   # a rota que segura o redirect (o .com.br NÃO casa)


def ler_600(nome: str) -> dict:
    p = CASA / nome
    assert p.exists() and (p.stat().st_mode & 0o077) == 0, f"{nome}: falta ou não está 600"
    return json.loads(p.read_text(encoding="utf-8"))


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def post_token(corpo: dict) -> tuple[int, dict]:
    req = urllib.request.Request(TOKEN, data=json.dumps(corpo).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def status_do_eu(access: str) -> int:
    """GET /users/me com um access → só o status (200 = ainda vale)."""
    req = urllib.request.Request("https://api.mercadopago.com/users/me", headers={"Authorization": f"Bearer {access}"})
    try:
        return urllib.request.urlopen(req, timeout=30).status
    except urllib.error.HTTPError as e:
        return e.code


def resumo(st: int, r: dict, vendedor: dict) -> dict:
    """Só o formato: as chaves, os prefixos e booleanos."""
    pre = lambda v: v.split("-", 1)[0] if isinstance(v, str) and "-" in v else None  # noqa: E731
    return {"status": st, "chaves": sorted(r), "erro": r.get("error") if isinstance(r.get("error"), str) else None,
            "tem_public_key": isinstance(r.get("public_key"), str) and len(r["public_key"]) > 8, "prefixo_public_key": pre(r.get("public_key")),
            "prefixo_access": pre(r.get("access_token")), "tem_refresh": isinstance(r.get("refresh_token"), str),
            "live_mode": r.get("live_mode") if isinstance(r.get("live_mode"), bool) else None, "expires_in": r.get("expires_in"),
            "offline_access": "offline_access" in str(r.get("scope", "")).split(), "user_id_e_o_vendedor": str(r.get("user_id")) == str(vendedor["id"])}


def chegada(url: str) -> dict | None:
    """O PEDIDO ao redirect cadastrado com o code (ou o error): host EXATO www.mercadopago.com e caminho "/" (ou vazio)."""
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname != "www.mercadopago.com" or u.path not in ("", "/"):
        return None
    q = urllib.parse.parse_qs(u.query)
    return q if ("code" in q or "error" in q) else None


def autorizar(pg, cliente: dict, vendedor: dict, pkce: bool, rotulo: str, auth: str = AUTH) -> tuple[str | None, str | None]:
    """→ (code, verifier) da prova: monta a URL com o redirect que a aplicação já tem e segue até o code."""
    estado, verificador = b64u(secrets.token_bytes(32)), b64u(secrets.token_bytes(48))
    q = {"client_id": cliente["client_id"], "response_type": "code", "platform_id": "mp", "state": estado, "redirect_uri": REDIRECT}
    if pkce:
        q |= {"code_challenge": b64u(hashlib.sha256(verificador.encode()).digest()), "code_challenge_method": "S256"}
    code = seguir_ate_o_code(pg, f"{auth}?{urllib.parse.urlencode(q)}", estado, vendedor, rotulo)
    return code, (verificador if pkce and code else None)


def seguir_ate_o_code(pg, url_de_autorizacao: str, estado: str, vendedor: dict, rotulo: str) -> str | None:
    """Abre a URL de autorização (a da prova ou a que o prof_mp_conectar devolveu — o e2e/w2/api.py --casos oauth_real reusa), passa pela
    escolha de país, entra como o vendedor de teste, autoriza e devolve o code LIDO DO PEDIDO ao redirect (o evento request + a rota que
    devolve 200). O login do MP muda de cara: tenta os campos conhecidos; passo desconhecido → print e None (a prova vai para o FIM)."""
    capturado: dict = {}

    def ao_pedir(req) -> None:
        q = chegada(req.url)
        if q is not None:
            capturado.setdefault("q", q)

    def segurar(rota) -> None:
        ao_pedir(rota.request)
        rota.fulfill(status=200, content_type="text/plain; charset=utf-8", body="ok — pode fechar")

    pg.on("request", ao_pedir)
    pg.route(SEGURAR, segurar)
    codigo_tentado = False
    try:
        pg.goto(url_de_autorizacao, wait_until="domcontentloaded", timeout=60_000)
        fim = time.time() + 150
        while time.time() < fim:
            if "q" in capturado:
                q = capturado["q"]
                if q.get("state", [None])[0] != estado:
                    print(rotulo, "o state voltou diferente — PARAR")
                    return None
                if "error" in q:
                    print(rotulo, "o MP devolveu error na volta:", (q["error"][0] or "")[:40])
                    return None
                return q["code"][0]
            pais = pg.get_by_role("link", name=BRASIL).or_(pg.get_by_role("button", name=BRASIL)).first
            if pais.count() and pais.is_visible():
                pais.click()
                pg.wait_for_timeout(1_500)
                continue
            for sel, valor in (("input[name=user_id], #user_id", vendedor.get("nickname") or vendedor.get("email")),
                               ("input[name=password], #password", vendedor["password"])):
                campo = pg.locator(sel).first
                if campo.count() and campo.is_visible() and not campo.input_value():
                    campo.fill(str(valor))
                    pg.get_by_role("button", name=BOTAO_ENTRAR).first.click()
                    break
            else:
                codigo = pg.locator("input[autocomplete=one-time-code], input[name*=code]").first
                if codigo.count() and codigo.is_visible() and not codigo.input_value():
                    if codigo_tentado:
                        print(rotulo, "o código de verificação foi recusado — salvar o do PAINEL no cofre (W2-a, passo 7)")
                        break
                    # o do painel (cofre); sem ele, 1 tentativa com os 6 últimos dígitos do id (regra de outro país — não documentada aqui)
                    codigo.fill(str(vendedor.get("codigo_verificacao") or str(vendedor["id"])[-6:]))
                    codigo_tentado = True
                for nome in ("Autorizar", "Permitir", "Aceitar", "Continuar"):
                    b = pg.get_by_role("button", name=nome).first
                    if b.count() and b.is_visible():
                        b.click()
                        break
            pg.wait_for_timeout(1_000)
    finally:
        pg.remove_listener("request", ao_pedir)
        pg.unroute(SEGURAR, segurar)
    PRINTS.mkdir(parents=True, exist_ok=True)
    pg.screenshot(path=str(PRINTS / f"{rotulo}-parou.png"))
    print(rotulo, "o país/login/consentimento não chegou ao code (print guardado) — a prova vai para o FIM")
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--canal", default="msedge")
    ap.add_argument("--sem-pkce", action="store_true")
    ap.add_argument("--com-tela", action="store_true", help="o MP barra navegador sem tela? abre a janela (o notebook tem tela)")
    ap.add_argument("--auth-br", action="store_true", help="abre direto o auth.mercadopago.com.br (pula a escolha de país; não documentado)")
    a = ap.parse_args()
    cliente, vendedor = ler_600(".physiq-mp-oauth.json"), ler_600(".physiq-mp-vendedor-teste.json")
    assert cliente.get("client_secret"), "sem o Client Secret no cofre: a prova vai para o FIM (W2-a, passo 5)"
    auth = AUTH_BR if a.auth_br else AUTH
    saida: dict = {"quando": time.strftime("%Y-%m-%d %H:%M"), "pkce": not a.sem_pkce, "auth_usado": urllib.parse.urlparse(auth).hostname}
    acessos: dict[str, str] = {}
    with sync_playwright() as p:
        nav = p.chromium.launch(channel=a.canal, headless=not a.com_tela)
        pg = nav.new_context(locale="pt-BR").new_page()
        for rotulo, teste in (("teste", "true"), ("producao", "false")):
            code, verif = autorizar(pg, cliente, vendedor, not a.sem_pkce, rotulo, auth)
            if not code:
                saida[rotulo] = {"parou": "pais_login_codigo_ou_consentimento"}
                continue
            corpo = {"client_id": cliente["client_id"], "client_secret": cliente["client_secret"], "grant_type": "authorization_code",
                     "code": code, "redirect_uri": REDIRECT, "test_token": teste}
            if verif:
                corpo["code_verifier"] = verif
            st, r = post_token(corpo)
            saida[rotulo] = resumo(st, r, vendedor)
            if st == 200 and isinstance(r.get("access_token"), str):
                acessos[rotulo] = r["access_token"]
            if rotulo == "teste" and st == 200 and isinstance(r.get("refresh_token"), str):
                st2, r2 = post_token({"client_id": cliente["client_id"], "client_secret": cliente["client_secret"],
                                      "grant_type": "refresh_token", "refresh_token": r["refresh_token"]})
                saida["renovacao"] = resumo(st2, r2, vendedor) | {"refresh_girou": r2.get("refresh_token") not in (None, r["refresh_token"])}
                if st2 == 200 and isinstance(r2.get("access_token"), str):
                    acessos["teste"] = r2["access_token"]
            print(rotulo, json.dumps(saida[rotulo], ensure_ascii=False))
        nav.close()
    if "teste" in acessos and "producao" in acessos:
        # MENOR 29: a 2ª autorização do MESMO vendedor na MESMA aplicação derruba o acesso da 1ª? (aqui a 1ª é de teste e a 2ª, não —
        # é o sinal mais próximo que dá para medir sem a W2-a; a Task 23 confere com 2 conexões de verdade se precisar)
        saida["primeira_vale_depois_da_segunda"] = status_do_eu(acessos["teste"]) == 200
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    print("renovação:", json.dumps(saida.get("renovacao"), ensure_ascii=False), "| a 1ª vale depois da 2ª:", saida.get("primeira_vale_depois_da_segunda"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Rodar**

Run: `cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P python3 e2e/w2/prova_public_key.py`
Expected: `teste {… "status": 200, "tem_public_key": true|false, "prefixo_access": "TEST", "live_mode": false, …}` e `producao {…, "live_mode":
true}`; a renovação com `"refresh_girou": true`; `primeira_vale_depois_da_segunda` true|false. Os desvios, um por vez (Read em cada print de
`…/prints/w2/prova/` antes de decidir):
- parou na escolha de país (o print mostra a lista) → de novo com `--auth-br`;
- parou no login sem tela → de novo com `--com-tela`;
- um 400 `invalid_request`/`invalid_grant` citando o verifier → de novo com `--sem-pkce` (e anotar: `MP_OAUTH_PKCE=0` até ele ligar o PKCE
  no painel — passo 4 da W2-a);
- "o código de verificação foi recusado" → o passo 7 da W2-a pode ser pedido JÁ (1 passo no celular, sem esperar o FIM: "abra Contas de
  teste e salve no cofre o código do Vendedor") → `mp_conta.py usuarios-teste criar` (só regrava os arquivos) → rodar de novo. Sem resposta
  dele → a prova vai para a Task 23.

- [ ] **Step 4: A decisão**

| O que a prova mostrou | O que fazer |
|---|---|
| `tem_public_key: true` nas 2 (`teste` e `producao`) | Brick com a chave do vendedor (Task 17). **Task 5 não entra.** |
| falta em uma ou nas 2 | **Task 5 entra** (P-C, padrão "o cartão abre a página do MP"), antes da Task 15; Pergunta 1 vai ao Weslley com o padrão já aplicado. |
| `auth_usado: auth.mercadopago.com.br` (o `.com` não fechou nem clicando "Brasil") | O `MP_AUTH` do app passa a ser o `.com.br` e o filtro da Task 15 (`ehUrlDeAutorizacaoMp`) já aceita os 2; anotar no PR (não documentado). Com o `.com` fechando, o app fica com ele (o personal escolhe o país 1 vez). |
| `parou` (código de verificação sem resposta, captcha) | A prova vai para a **Task 23** (depois da W2-a): ele salva o código do painel (passo 7) e eu rodo de novo — ou ele entra como o vendedor de teste no navegador dele (a volta cai na nossa função). O código segue com o Brick (decisão 14) e a Task 5 fica pronta para entrar no FIM. |
| 4xx do vendedor de teste na aplicação real (`invalid_client`, "usuário de teste não pode…") | **Plano B (I6)** no FIM: o integrador de teste + a aplicação de teste dele (W2-a, passo 8) → `mp_conta.py oauth copiar` leva `MP_CLIENT_ID_STAGING`/`…_SECRET_STAGING` → o `oauthDoAmbiente("staging")` usa esse par → a prova roda na Task 23 pelo fluxo de verdade do staging (o `oauth_real`). |
| `offline_access: false` ou `tem_refresh: false` | A renovação automática não existe para essa credencial: a decisão 8 já cobre (aviso "reconecte até dd/mm" 30 dias antes) — anotar no PR. |
| `refresh_girou: false` | Ainda vale a gravação condicional (ela não depende de girar); anotar. |
| `primeira_vale_depois_da_segunda: false` | A 2ª autorização derruba a 1ª (MENOR 29): a Task 6 LIGA, no `recebimento_mp_confirmar`, o bloco "MENOR 29" (recusa `mp_em_outra_conta`: "essa conta do Mercado Pago já está ligada em outra conta do Physiq"). `true` ou não medido → o bloco fica desligado (2 contas do Physiq podem usar a mesma conta do MP). |
| `live_mode` diferente do esperado (`teste` false, `producao` true) | Anotar: a regra `modoDaConexaoConfere` (MENOR 20, Task 2) usa o que a prova mostrou — `live_mode` ausente = não confere. |

- [ ] **Step 5: Registrar** — o resultado (só o JSON de chaves e booleanos) no topo deste plano ("Prova da public_key: …") e na memória
  `projeto-physiq-unificado`; foto do andamento. Commit do script:

```bash
cd ~/projetos/physiqcalc-w2 && git add e2e/w2/prova_public_key.py
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w2): a prova da public_key do vendedor no OAuth do Mercado Pago (o code lido no pedido, a escolha de país e o código do painel)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/w2/prova_public_key.py
```

---

### Task 2: Regras puras do MP da conta (TDD)

**Files:**
- Create: `supabase-principal/functions/_shared/mp-conta-regras.ts`, `src/financeiro/mpConta.ts`
- Test: `src/financeiro/mpConta.test.ts`

**Estimativa:** 40 a 60 min (pior cenário 90 min)

- [ ] **Step 1: Os testes primeiro** (`src/financeiro/mpConta.test.ts`, `// @vitest-environment node` — Web Crypto e `URL`):

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  REDIRECT_TESTE_MP, TEXTO_DO_RETORNO, assinaturaMp, desafioPkce, destinoDoRetorno, ehEstado, ehUrlDeAutorizacaoMp, lerAvisoDaConta,
  lerAvisoDoMp, lerTokenDoMp, manifestoDaAssinatura, modoDaConexaoConfere, motivoDoOauth, novoSegredoUrl, precisaRenovar, proximaTentativa, qualCredencial,
  redirectDoSchema, situacaoDoMp, urlDeAutorizacao, erroPixSemChave,
} from "../../supabase-principal/functions/_shared/mp-conta-regras";

const AGORA = Date.parse("2026-10-12T12:00:00Z");

describe("OAuth — a ida", () => {
  it("o state tem 43 caracteres base64url e não repete", () => {
    const a = novoSegredoUrl(), b = novoSegredoUrl();
    expect(ehEstado(a) && ehEstado(b) && a !== b).toBe(true);
    expect(ehEstado("curto")).toBe(false);
  });
  it("PKCE S256 = base64url(sha256) do verifier (vetor da RFC 7636, Apêndice B)", async () => {
    // MENOR 0 da revisão: o verifier certo da RFC (os octetos do Apêndice B) — o que estava aqui antes dava 3nniMPBp…, e o subagente do TDD
    // "corrigiria" um desafioPkce que está certo. Conferido com node e openssl em 11/10.
    expect(await desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("a URL de autorização leva client, code, platform mp, state, o redirect certo e o desafio; o simulador só em 127.0.0.1", () => {
    const u = new URL(urlDeAutorizacao({ clientId: "123", redirect: redirectDoSchema("staging"), estado: "s".repeat(43), desafio: "d" }));
    expect(u.origin + u.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "123", response_type: "code", platform_id: "mp", state: "s".repeat(43),
      redirect_uri: "https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging", code_challenge: "d", code_challenge_method: "S256" });
    expect(urlDeAutorizacao({ base: "http://127.0.0.1:8798", clientId: "1", redirect: REDIRECT_TESTE_MP, estado: "e", desafio: null }))
      .toMatch(/^http:\/\/127\.0\.0\.1:8798\/authorization\?/);
    expect(urlDeAutorizacao({ base: "https://evil.example", clientId: "1", redirect: REDIRECT_TESTE_MP, estado: "e", desafio: null }))
      .toMatch(/^https:\/\/auth\.mercadopago\.com\/authorization\?/);
  });
  it("o filtro da tela (MENOR 9): só a autorização do MP, host EXATO (.com ou .com.br — I6), https", () => {
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com/authorization?client_id=1")).toBe(true);
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com.br/authorization?client_id=1")).toBe(true);
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com.evil.example/authorization")).toBe(false);
    expect(ehUrlDeAutorizacaoMp("http://auth.mercadopago.com/authorization")).toBe(false);
    expect(ehUrlDeAutorizacaoMp("https://auth.mercadopago.com/logout")).toBe(false);
    expect(ehUrlDeAutorizacaoMp("javascript:alert(1)")).toBe(false);
  });
});

describe("OAuth — a resposta do /oauth/token", () => {
  const ok = { access_token: "APP_USR-4934588586838432-101212-abcdef-241983636", token_type: "bearer", expires_in: 15552000,
               scope: "read write offline_access", user_id: 241983636, refresh_token: "TG-abcdefgh-241983636",
               public_key: "APP_USR-d0a26210-1111-2222-3333-479f0400869e", live_mode: true };
  it("lê o exemplo da doc: 180 dias, renovável, com a chave pública", () => {
    expect(lerTokenDoMp(ok, AGORA)).toEqual({ access: ok.access_token, refresh: ok.refresh_token, userId: 241983636,
      expiraEm: new Date(AGORA + 15552000 * 1000).toISOString(), publicKey: ok.public_key, live: true, renovavel: true });
  });
  it("sem public_key → publicKey null (a P-C decide o cartão); sem offline_access → não renovável", () => {
    const { public_key: _p, ...sem } = ok;
    expect(lerTokenDoMp(sem, AGORA)?.publicKey).toBeNull();
    expect(lerTokenDoMp({ ...ok, scope: "read write" }, AGORA)?.renovavel).toBe(false);
  });
  it("recusa token fora do formato, user_id ruim e validade absurda", () => {
    expect(lerTokenDoMp({ ...ok, access_token: "x" })).toBeNull();
    expect(lerTokenDoMp({ ...ok, user_id: "abc" })).toBeNull();
    expect(lerTokenDoMp({ ...ok, expires_in: 10 })).toBeNull();
  });
  it("o motivo da falha: 4xx = recusado; 5xx, 429 e rede (599) = fora", () => {
    expect([400, 401, 403].map(motivoDoOauth)).toEqual(["recusado", "recusado", "recusado"]);
    expect([500, 503, 429, 599].map(motivoDoOauth)).toEqual(["fora", "fora", "fora", "fora"]);
  });
  it("MENOR 20: a conta conectada tem de ser do mundo do schema (produção no public, teste no staging); sem live_mode, não confere", () => {
    expect(modoDaConexaoConfere(true, "public")).toBe(true);
    expect(modoDaConexaoConfere(false, "public")).toBe(false);
    expect(modoDaConexaoConfere(false, "staging")).toBe(true);
    expect(modoDaConexaoConfere(true, "staging")).toBe(false);
    expect(modoDaConexaoConfere(null, "public")).toBe(true);
  });
});

describe("renovação", () => {
  it("o job renova com menos de 30 dias; o uso, com menos de 1 dia", () => {
    expect(precisaRenovar(new Date(AGORA + 31 * 86_400_000).toISOString(), AGORA)).toBe(false);
    expect(precisaRenovar(new Date(AGORA + 29 * 86_400_000).toISOString(), AGORA)).toBe(true);
    expect(precisaRenovar(new Date(AGORA + 2 * 86_400_000).toISOString(), AGORA, 86_400_000)).toBe(false);
    expect(precisaRenovar(null, AGORA)).toBe(false);
  });
  it("a espera do MP fora: 1 h, 2 h, 4 h… até 24 h", () => {
    expect([0, 1, 2, 5, 9].map((n) => (Date.parse(proximaTentativa(n, AGORA)) - AGORA) / 3_600_000)).toEqual([1, 2, 4, 24, 24]);
  });
});

describe("a volta (I8: sempre no site, e a conexão boa espera a confirmação de quem começou)", () => {
  it("destino fixo por schema (sem open redirect); o 'confirmar' leva o id da conexão; id fora do formato não entra", () => {
    expect(destinoDoRetorno("https://physiqcalc.com.br", "negado")).toBe("https://physiqcalc.com.br/painel/configuracoes/recebimento?mp=negado");
    expect(destinoDoRetorno("https://physiqcalc-staging.vercel.app", "confirmar", "0b6f6c66-1111-4222-8333-944455556666"))
      .toBe("https://physiqcalc-staging.vercel.app/painel/configuracoes/recebimento?mp=confirmar&c=0b6f6c66-1111-4222-8333-944455556666");
    expect(destinoDoRetorno("https://physiqcalc.com.br", "confirmar", "x&mp=ok")).toBe("https://physiqcalc.com.br/painel/configuracoes/recebimento?mp=invalido");
  });
  it("os textos novos existem e não têm termo técnico", () => {
    for (const r of ["confirmar", "conta_de_teste", "outra_pessoa", "outra_conta"] as const) {
      expect(TEXTO_DO_RETORNO[r]).toBeTruthy();
      expect(TEXTO_DO_RETORNO[r]).not.toMatch(/oauth|token|webhook|redirect/i);
    }
  });
});

describe("o aviso por conta e a assinatura", () => {
  it("lê ?conta=<uuid>, o tópico, o id e o user_id; conta fora do formato → null", () => {
    const u = new URL("https://x/f?schema=staging&conta=0b6f6c66-1111-4222-8333-944455556666&data.id=123&type=payment");
    expect(lerAvisoDaConta(u, { user_id: 777 })).toEqual({ conta: "0b6f6c66-1111-4222-8333-944455556666", topico: "payment", id: "123", userId: 777 });
    expect(lerAvisoDaConta(new URL("https://x/f?conta=1"), {})).toBeNull();
  });
  it("sem a conta (a URL do painel — I1): o tópico, o id e o user_id; user_id ruim → null", () => {
    expect(lerAvisoDoMp(new URL("https://x/f?schema=public&data.id=9&type=payment"), { user_id: 5 })).toEqual({ topico: "payment", id: "9", userId: 5 });
    expect(lerAvisoDoMp(new URL("https://x/f?schema=public"), { type: "mp-connect", user_id: "x" })).toEqual({ topico: "mp-connect", id: "", userId: null });
  });
  it("o manifesto da doc (id em minúsculas; o que falta sai) e o HMAC", async () => {
    expect(manifestoDaAssinatura("ABC123", "rid-1", "1704908010")).toBe("id:abc123;request-id:rid-1;ts:1704908010;");
    expect(manifestoDaAssinatura(null, null, "1")).toBe("ts:1;");
    const segredo = "segredo-de-teste";
    const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode("id:123;request-id:r;ts:9;")));
    const v1 = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${v1}`, requestId: "r", dataId: "123", segredo })).toBe("valida");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${"0".repeat(64)}`, requestId: "r", dataId: "123", segredo })).toBe("invalida");
    expect(await assinaturaMp({ cabecalho: null, requestId: "r", dataId: "123", segredo })).toBe("ausente");
    expect(await assinaturaMp({ cabecalho: `ts=9,v1=${v1}`, requestId: "r", dataId: "123", segredo: "" })).toBe("ausente");
  });
});

describe("credencial de quem já existe, situação e erros", () => {
  it("collector nulo = Physiq; igual ao da integração = conta; outro = outra conta", () => {
    expect(qualCredencial(null, { mp_user_id: 5 })).toBe("physiq");
    expect(qualCredencial("5", { mp_user_id: 5 })).toBe("conta");
    expect(qualCredencial(6, { mp_user_id: 5 })).toBe("outra_conta");
    expect(qualCredencial(6, null)).toBe("outra_conta");
  });
  it("a situação que o dono vê", () => {
    expect(situacaoDoMp(null).acao).toBe("conectar");
    expect(situacaoDoMp({ status: "erro", mp_erro: "acesso_recusado", mp_expira_em: null, mp_apelido: "TESTE1" }).acao).toBe("reconectar");
    expect(situacaoDoMp({ status: "ativa", mp_erro: "renovacao_recusada", mp_expira_em: "2026-12-01T12:00:00Z", mp_apelido: null }).texto).toMatch(/01\/12\/2026/);
    expect(situacaoDoMp({ status: "ativa", mp_erro: null, mp_expira_em: "2027-01-01T00:00:00Z", mp_apelido: "X" }).tom).toBe("verde");
  });
  it("o Pix sem chave na conta do personal", () => {
    expect(erroPixSemChave({ message: "Collector user without key enabled for QR render" })).toBe(true);
    expect(erroPixSemChave({ message: "outra coisa" })).toBe(false);
  });
});
```
Run: `flock $P npx vitest run --maxWorkers=2 src/financeiro/mpConta.test.ts` → Expected: FAIL (módulo não existe).

- [ ] **Step 2: O módulo** (`supabase-principal/functions/_shared/mp-conta-regras.ts`):

```ts
// supabase-principal/functions/_shared/mp-conta-regras.ts
// Physiq W2 — regras PURAS do Mercado Pago DA CONTA do personal (OAuth): a URL de autorização (state + PKCE S256), o redirect por schema e o
// de teste, a leitura do POST /oauth/token (a public_key é OPCIONAL — a prova da Task 1 decide o cartão), quando renovar (o acesso vale 180
// dias; o refresh_token GIRA a cada renovação), a volta para o site (destino fixo por schema), o aviso do MP por conta (?conta=<uuid>), a
// x-signature (manifesto "id:…;request-id:…;ts:…;" + HMAC-SHA256), qual credencial vale para o que já existe e a situação que o dono vê.
// Sem import de URL e sem o global Deno: o Vitest importa (src/financeiro/mpConta.test.ts) e a tela reexporta (src/financeiro/mpConta.ts).
// Fontes (11/10/2026): mercadopago.com.br/developers/pt/docs/security/oauth/creation · …/en/reference/authentication/oauth/_oauth_token/post ·
// …/pt/docs/security/oauth/renewal · …/pt/docs/your-integrations/notifications/webhooks.

export type Schema = "public" | "staging";
/** A autorização da doc (o personal escolhe o país 1 vez). O auth.mercadopago.com.br vai direto ao login do MLB (medido em 11/10, NÃO
 *  documentado): só vira o padrão se a prova (Task 1) mostrar que o .com não fecha o ciclo — o filtro da tela já aceita os 2 (I6). */
export const MP_AUTH = "https://auth.mercadopago.com/authorization";
const HOSTS_DE_AUTORIZACAO = new Set(["auth.mercadopago.com", "auth.mercadopago.com.br"]);
/** O filtro da tela (MENOR 9): só abre a autorização do MP — https, host EXATO e o caminho /authorization. */
export function ehUrlDeAutorizacaoMp(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS_DE_AUTORIZACAO.has(u.hostname) && u.pathname === "/authorization";
  } catch {
    return false;
  }
}
/** MENOR 20: a conta conectada tem de ser do mundo do schema — produção (live_mode true) no public, teste no staging. Sem a informação,
 *  não dá para conferir (true): a prova (Task 1) mostra se o MP manda. */
export function modoDaConexaoConfere(live: boolean | null | undefined, schema: Schema): boolean {
  return typeof live !== "boolean" || live === (schema === "public");
}
/** O domínio próprio da API (Worker api-principal — docs/api-dominio-proprio.md). */
export const URL_API_PROPRIA = "https://api-principal.physiqcalc.com.br";
/** A volta do OAuth cadastrada no MP (W2-a): fixa, uma por schema (o MP exige estática e nada de dado nela). */
export function redirectDoSchema(schema: Schema): string {
  return `${URL_API_PROPRIA}/functions/v1/mp-conectar-retorno/${schema}`;
}
/** O ÚNICO redirect que a aplicação já tinha (GET /applications/<id>, 11/10). SÓ no staging: prova e E2E do OAuth real antes da W2-a. */
export const REDIRECT_TESTE_MP = "https://www.mercadopago.com";
/** A notification_url de um pagamento/assinatura NA CONTA do personal. */
export function notificacaoDaConta(schema: Schema, contaId: string): string {
  return `${URL_API_PROPRIA}/functions/v1/mp-webhook-aluno?schema=${schema}&conta=${contaId}`;
}
export const ESTADO_MS = 10 * 60_000;
export const RENOVAR_ANTES_MS = 30 * 86_400_000;
export const RENOVAR_NA_HORA_MS = 86_400_000;
export const AVISO_DONO_MS = 86_400_000;
const SIMULADOR = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;

export function base64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** state (32 bytes → 43 caracteres) e verifier do PKCE (48 bytes → 64 caracteres; a RFC pede 43–128). */
export function novoSegredoUrl(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function sha256Hex(texto: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function desafioPkce(verificador: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))));
}
export function ehEstado(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
}

export function urlDeAutorizacao(p: { base?: string | null; clientId: string; redirect: string; estado: string; desafio: string | null }): string {
  const u = new URL(p.base && SIMULADOR.test(p.base) ? `${p.base}/authorization` : MP_AUTH);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("platform_id", "mp");
  u.searchParams.set("state", p.estado);
  u.searchParams.set("redirect_uri", p.redirect);
  if (p.desafio) {
    u.searchParams.set("code_challenge", p.desafio);
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

export interface TokenMp {
  access: string;
  refresh: string | null;
  expiraEm: string;
  userId: number;
  publicKey: string | null;
  live: boolean | null;
  /** tem refresh E o escopo offline_access (a doc da renovação pede) */
  renovavel: boolean;
}
const TOKEN = /^(APP_USR|TEST)-[A-Za-z0-9_-]{10,300}$/;
const REFRESH = /^[A-Za-z0-9_-]{8,300}$/;
const CHAVE_PUBLICA = /^(APP_USR|TEST)-[A-Za-z0-9-]{8,72}$/;

export function lerTokenDoMp(corpo: unknown, agora = Date.now()): TokenMp | null {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
  if (!c || typeof c.access_token !== "string" || !TOKEN.test(c.access_token)) return null;
  const userId = Number(c.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const segundos = Number(c.expires_in);
  if (!Number.isFinite(segundos) || segundos < 60 || segundos > 400 * 86_400) return null;
  const refresh = typeof c.refresh_token === "string" && REFRESH.test(c.refresh_token) ? c.refresh_token : null;
  const escopo = typeof c.scope === "string" ? c.scope.split(/\s+/) : [];
  return {
    access: c.access_token, refresh, userId, expiraEm: new Date(agora + segundos * 1000).toISOString(),
    publicKey: typeof c.public_key === "string" && CHAVE_PUBLICA.test(c.public_key) ? c.public_key : null,
    live: typeof c.live_mode === "boolean" ? c.live_mode : null, renovavel: !!refresh && escopo.includes("offline_access"),
  };
}
export type MotivoOauth = "recusado" | "fora";
export function motivoDoOauth(status: number): MotivoOauth {
  return status >= 500 || status === 429 ? "fora" : "recusado";
}
/** Só o código do erro do OAuth (invalid_grant…) — vai para o log no campo mp_erro; a mensagem nunca. */
export function codigoDoOauth(corpo: unknown): string | null {
  const e = (corpo as { error?: unknown } | null)?.error;
  return typeof e === "string" && /^[a-z_]{1,40}$/.test(e) ? e : null;
}

export function precisaRenovar(expiraEm: string | null | undefined, agora = Date.now(), antesMs = RENOVAR_ANTES_MS): boolean {
  const t = expiraEm ? Date.parse(expiraEm) : NaN;
  return Number.isFinite(t) && t - agora < antesMs;
}
export function proximaTentativa(tentativas: number, agora = Date.now()): string {
  const horas = Math.min(24, 2 ** Math.max(0, Math.min(5, tentativas)));
  return new Date(agora + horas * 3_600_000).toISOString();
}

export type ResultadoDoRetorno = "ok" | "negado" | "vencido" | "invalido" | "falhou" | "outra_conta" | "conectado_sem_trocar"
  | "confirmar" | "conta_de_teste" | "outra_pessoa" | "mp_em_outra_conta";
export const TEXTO_DO_RETORNO: Record<ResultadoDoRetorno, string> = {
  ok: "Pronto: o seu Mercado Pago está conectado. Os alunos pagam por Pix ou cartão e o dinheiro cai direto na sua conta.",
  negado: "Você não autorizou o Physiq no Mercado Pago. Toque em Conectar para tentar de novo.",
  vencido: "Passaram mais de 10 minutos. Toque em Conectar de novo.",
  invalido: "Esse link de conexão já foi usado ou não vale mais. Toque em Conectar de novo.",
  falhou: "O Mercado Pago não respondeu agora. Tente de novo em instantes.",
  // I5: a conta antiga ainda tem algo em andamento nos alunos desta conta (automática ou Pix aberto / cartão em análise)
  outra_conta: "Essa é outra conta do Mercado Pago, e a de antes ainda tem pagamento em andamento (cobrança automática ou Pix aberto). Desligue as cobranças automáticas (Desconectar) e espere o Pix aberto vencer — até 3 dias — ou peça ao aluno para pagar de outro jeito; depois conecte a nova.",
  conectado_sem_trocar: "Conectado. Toque em \"Salvar a forma\" para os alunos passarem a pagar pelo seu Mercado Pago.",
  // I8: a volta não grava nada; quem começou confirma, logado (a pergunta mostra a conta do Mercado Pago)
  confirmar: "Falta confirmar: é esta a conta do Mercado Pago que vai receber dos seus alunos?",
  // MENOR 20: conta de teste na produção (ou de verdade no ambiente de teste)
  conta_de_teste: "Essa conta do Mercado Pago não serve aqui (é uma conta de teste). Conecte a sua conta de verdade.",
  outra_pessoa: "Essa conexão foi começada por outra conta do Physiq. Se foi você, entre nela; se não foi, ignore — nada foi ligado.",
  // MENOR 29 (só se a prova mostrar que a 2ª autorização derruba a 1ª)
  mp_em_outra_conta: "Essa conta do Mercado Pago já está ligada em outra conta do Physiq. Desconecte lá antes.",
};
export function ehResultadoDoRetorno(v: unknown): v is ResultadoDoRetorno {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TEXTO_DO_RETORNO, v);
}
/** A volta SEMPRE cai no site (decisão 6): no APK, o Conectar abre o site no navegador e o fluxo todo acontece nele. O "confirmar" leva o id
 *  da conexão (uuid); qualquer outra coisa vira "invalido" (nada da URL do MP chega aqui). */
export function destinoDoRetorno(site: string, r: ResultadoDoRetorno, conexao?: string): string {
  const base = `${site}/painel/configuracoes/recebimento`;
  if (r !== "confirmar") return `${base}?mp=${r}`;
  return ehUuidMp(conexao) ? `${base}?mp=confirmar&c=${conexao}` : `${base}?mp=invalido`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function ehUuidMp(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
export interface AvisoDoMp { topico: string; id: string; userId: number | null }
export interface AvisoDaConta extends AvisoDoMp { conta: string }
/** O tópico, o id e o user_id de um aviso do MP (corpo novo ou IPN na query) — sem a conta (o caminho pelo user_id do painel — I1). */
export function lerAvisoDoMp(url: URL, corpo: unknown): AvisoDoMp {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  const dados = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
  const topico = String(c.type || c.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
  const id = String(dados.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  const userId = Number(c.user_id);
  return { topico, id, userId: Number.isSafeInteger(userId) && userId > 0 ? userId : null };
}
export function lerAvisoDaConta(url: URL, corpo: unknown): AvisoDaConta | null {
  const conta = (url.searchParams.get("conta") || "").toLowerCase();
  if (!UUID.test(conta)) return null;
  return { conta, ...lerAvisoDoMp(url, corpo) };
}

export function manifestoDaAssinatura(dataId: string | null, requestId: string | null, ts: string): string {
  return `${dataId ? `id:${dataId.toLowerCase()};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
}
export async function assinaturaMp(p: { cabecalho: string | null; requestId: string | null; dataId: string | null; segredo: string | null | undefined }):
  Promise<"valida" | "invalida" | "ausente"> {
  const segredo = (p.segredo ?? "").trim();
  if (!segredo || !p.cabecalho) return "ausente";
  const partes = new Map(p.cabecalho.split(",").map((x) => x.trim().split("=", 2)).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const ts = partes.get("ts") ?? "";
  const v1 = (partes.get("v1") ?? "").toLowerCase();
  if (!/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/.test(v1)) return "invalida";
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifestoDaAssinatura(p.dataId, p.requestId, ts))));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  let dif = 0;
  for (let i = 0; i < 64; i++) dif |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0 ? "valida" : "invalida";
}

export function qualCredencial(collector: number | string | null | undefined, integ: { mp_user_id: number | string | null } | null):
  "physiq" | "conta" | "outra_conta" {
  if (collector === null || collector === undefined || collector === "") return "physiq";
  return integ?.mp_user_id != null && Number(collector) === Number(integ.mp_user_id) ? "conta" : "outra_conta";
}

export interface SituacaoMp { tom: "verde" | "ambar" | "rosa" | "cinza"; titulo: string; texto: string; acao: "conectar" | "reconectar" | null }
export function situacaoDoMp(i: { status: string | null; mp_erro: string | null; mp_expira_em: string | null; mp_apelido: string | null } | null): SituacaoMp {
  if (!i?.status || i.status === "desconectada") {
    return { tom: "cinza", titulo: "Desconectado", texto: "Toque em Conectar e entre na sua conta do Mercado Pago.", acao: "conectar" };
  }
  const conta = i.mp_apelido ? ` (conta ${i.mp_apelido})` : "";
  if (i.status === "erro") {
    return { tom: "rosa", titulo: "Conexão caiu", acao: "reconectar",
      texto: `A conexão com o Mercado Pago${conta} caiu: o acesso foi retirado no Mercado Pago ou venceu. Os alunos não conseguem pagar pelo app até você conectar de novo.` };
  }
  if (i.mp_erro === "renovacao_recusada" || i.mp_erro === "sem_renovacao") {
    const ate = i.mp_expira_em ? new Date(i.mp_expira_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "o vencimento";
    return { tom: "ambar", titulo: "Conectado — renove", acao: "reconectar",
      texto: `Conectado ao Mercado Pago${conta}, mas o Mercado Pago não renovou o acesso sozinho. Conecte de novo até ${ate} para não parar.` };
  }
  return { tom: "verde", titulo: "Conectado", acao: null, texto: `Conectado ao Mercado Pago${conta}. O dinheiro cai direto na sua conta, sem taxa do Physiq.` };
}

export function erroPixSemChave(corpo: unknown): boolean {
  const m = String((corpo as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return m.includes("without key enabled for qr") || m.includes("collector user without key");
}
```
E `src/financeiro/mpConta.ts` (a tela só pega o que é de tela):
```ts
// Physiq W2 — o que a tela usa das regras do MP da conta (as mesmas do servidor: supabase-principal/functions/_shared/mp-conta-regras.ts).
export {
  TEXTO_DO_RETORNO, ehResultadoDoRetorno, ehUrlDeAutorizacaoMp, ehUuidMp, situacaoDoMp, type ResultadoDoRetorno, type SituacaoMp,
} from "../../supabase-principal/functions/_shared/mp-conta-regras";
```

- [ ] **Step 3: Verde** — `flock $P npx vitest run --maxWorkers=2 src/financeiro/mpConta.test.ts` → PASS; `flock $P npm run tipos` limpo.
- [ ] **Step 4: Commit**

```bash
git add supabase-principal/functions/_shared/mp-conta-regras.ts src/financeiro/mpConta.ts src/financeiro/mpConta.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): regras puras do Mercado Pago do personal — OAuth com state e PKCE, a resposta do token, renovação, volta, aviso por conta e x-signature" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/mp-conta-regras.ts src/financeiro/mpConta.ts src/financeiro/mpConta.test.ts
```

---

### Task 3: Cifra AES-256-GCM dos tokens (TDD)

**Files:** Create `supabase-principal/functions/_shared/cifra-mp.ts` · Test `src/financeiro/cifraMp.test.ts`
**Estimativa:** 20 a 35 min (pior cenário 50 min)

- [ ] **Step 1: Os testes** (`// @vitest-environment node`):

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chaveDoAmbiente, cifrar, dadoAssociado, decifrar, ehCifra, importarChave } from "../../supabase-principal/functions/_shared/cifra-mp";

const CHAVE_B64 = Buffer.alloc(32, 7).toString("base64url");

describe("cifra-mp", () => {
  it("cifra e decifra; o mesmo texto dá cifras diferentes (iv novo); o formato é v1:<iv 16>:<cifra>", async () => {
    const k = await importarChave(CHAVE_B64);
    const ad = dadoAssociado("staging", "conta-1", "access");
    const a = await cifrar("APP_USR-123-segredo", ad, k), b = await cifrar("APP_USR-123-segredo", ad, k);
    expect(ehCifra(a) && ehCifra(b) && a !== b).toBe(true);
    expect(a).not.toContain("APP_USR");
    expect(await decifrar(a, ad, k)).toBe("APP_USR-123-segredo");
  });
  it("outro dado associado (outra conta, outro campo, outro schema) NÃO abre", async () => {
    const k = await importarChave(CHAVE_B64);
    const c = await cifrar("x".repeat(30), dadoAssociado("staging", "conta-1", "access"), k);
    await expect(decifrar(c, dadoAssociado("staging", "conta-2", "access"), k)).rejects.toThrow();
    await expect(decifrar(c, dadoAssociado("staging", "conta-1", "refresh"), k)).rejects.toThrow();
    await expect(decifrar(c, dadoAssociado("public", "conta-1", "access"), k)).rejects.toThrow();
  });
  it("outra chave não abre; chave fora de 32 bytes é recusada; o ambiente sem a chave → null", async () => {
    const k = await importarChave(CHAVE_B64), k2 = await importarChave(Buffer.alloc(32, 8).toString("base64url"));
    const ad = dadoAssociado("public", "c", "access");
    await expect(decifrar(await cifrar("t".repeat(20), ad, k), ad, k2)).rejects.toThrow();
    await expect(importarChave(Buffer.alloc(16, 1).toString("base64url"))).rejects.toThrow("chave_invalida");
    expect(await chaveDoAmbiente(() => undefined)).toBeNull();
    expect(await chaveDoAmbiente(() => CHAVE_B64)).not.toBeNull();
  });
  it("cifra adulterada → erro (a tag do GCM)", async () => {
    const k = await importarChave(CHAVE_B64);
    const ad = dadoAssociado("public", "c", "refresh");
    const c = await cifrar("TG-abcdefgh-1", ad, k);
    const ruim = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    await expect(decifrar(ruim, ad, k)).rejects.toThrow();
  });
});
```
Run → FAIL (módulo não existe).

- [ ] **Step 2: O módulo**

```ts
// supabase-principal/functions/_shared/cifra-mp.ts
// Physiq W2 — a cifra dos tokens do Mercado Pago do personal (e do code_verifier do PKCE): AES-256-GCM pelo Web Crypto (o mesmo no Deno e no
// Node — o Vitest testa este arquivo). A chave (32 bytes, base64url) é o segredo MP_TOKENS_CHAVE das funções — FORA do banco: uma cópia do
// banco (o backup diário) ou a senha do postgres não abrem os tokens (decisão 1 do plano da W2; por que não o Vault: lá).
// Formato "v1:<iv base64url, 12 bytes>:<cifra + tag base64url>" — o "v1" deixa trocar a chave depois (uma "v2" lida ao lado).
// Dado associado (AD) "physiq:w2:<schema>:<conta_id>:<campo>": a cifra copiada para outra conta, outro campo ou outro schema não abre.
// Sem import de URL e sem o global Deno no topo. Nunca loga nada.
export type LerAmbiente = (nome: string) => string | undefined;
type ComDeno = { Deno?: { env: { get: (nome: string) => string | undefined } } };
const lerDaFuncao: LerAmbiente = (nome) => (globalThis as ComDeno).Deno?.env.get(nome);

const FORMATO = /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$/;
// MENOR 0b da revisão: Uint8Array<ArrayBuffer> (não o Uint8Array solto = <ArrayBufferLike>) — o Deno 2.5.2 (TS 5.9) recusa o solto no
// importKey e no decrypt (TS2769/TS2322) e as 7 funções que importam este arquivo herdariam o erro. Passa também no TS 5.8.3 do app
// (conferido em 11/10 nas 2 pontas).
const de64 = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const para64 = (u: Uint8Array): string => {
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const texto = new TextEncoder();

export function ehCifra(v: unknown): v is string {
  return typeof v === "string" && FORMATO.test(v);
}
export function dadoAssociado(schema: string, contaId: string, campo: "access" | "refresh" | "pkce"): string {
  return `physiq:w2:${schema}:${contaId}:${campo}`;
}
export async function importarChave(base64url: string): Promise<CryptoKey> {
  const bruta = de64(base64url.trim());
  if (bruta.length !== 32) throw new Error("chave_invalida");
  return await crypto.subtle.importKey("raw", bruta, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
/** A chave das funções (MP_TOKENS_CHAVE); sem ela (ou fora do formato) → null: quem chama responde "não configurado". */
export async function chaveDoAmbiente(ler: LerAmbiente = lerDaFuncao): Promise<CryptoKey | null> {
  const v = ler("MP_TOKENS_CHAVE");
  if (!v) return null;
  try {
    return await importarChave(v);
  } catch {
    return null;
  }
}
export async function cifrar(claro: string, ad: string, chave: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: texto.encode(ad) }, chave, texto.encode(claro)));
  return `v1:${para64(iv)}:${para64(c)}`;
}
export async function decifrar(cifra: string, ad: string, chave: CryptoKey): Promise<string> {
  if (!ehCifra(cifra)) throw new Error("cifra_invalida");
  const [, iv, c] = cifra.split(":");
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: de64(iv), additionalData: texto.encode(ad) }, chave, de64(c));
  return new TextDecoder().decode(claro);
}
```

- [ ] **Step 3: Verde** — `cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P npx vitest run
  --maxWorkers=2 src/financeiro/cifraMp.test.ts` → PASS; `DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/_shared/cifra-mp.ts`
  → sem erro (MENOR 0b).
- [ ] **Step 4: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add supabase-principal/functions/_shared/cifra-mp.ts src/financeiro/cifraMp.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): a cifra dos tokens do Mercado Pago do personal (AES-256-GCM, chave fora do banco, dado associado por conta e campo)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/cifra-mp.ts src/financeiro/cifraMp.test.ts
```

---

### Task 4: Cliente do MP da conta — credencial, troca do code, renovação, 401 (TDD com db e fetch falsos)

**Files:**
- Modify: `supabase-principal/functions/_shared/cobranca-mp.ts` (troca o `tokenMp` + acréscimos), `…/_shared/financeiro-mp.ts`,
  `…/_shared/app-sem-profissional.ts`, `…/_shared/planos-automatica-mp.ts` (MENOR 2)
- Create: `supabase-principal/functions/_shared/mp-conta.ts`
- Test: `src/financeiro/mpContaServidor.test.ts` (`// @vitest-environment node`)

**Estimativa:** 80 a 120 min (pior cenário 180 min) — cresceu com a regra da coluna nova (C2), o 401 com `/users/me` (I2), a busca das
cobranças da automática (I1), as leituras que não derrubam a tela (I3) e os MENORES 1, 2, 11, 12 e 13.

- [ ] **Step 1: `cobranca-mp.ts`** — **TROCAR o `tokenMp` de hoje** (`export function tokenMp(c: Credencial)` com `Deno.env.get`, :24-26) por
  este; o resto são acréscimos (MENOR 1: escrever como "acréscimo" deixaria 2 declarações e o `deno check`/`tsc` quebraria). Nada do que
  existe muda de comportamento; as 6 funções que empacotam este arquivo sem republicar seguem iguais:

```ts
/** W2 — o MP DA CONTA do personal (OAuth): o token já decifrado (só em memória, nunca no log) e de quem ele é (o collector). */
export interface CredencialConta { tipo: "conta"; schema: Schema; contaId: string; collectorId: number; token: string }
export type CredencialMp = Credencial | CredencialConta;
type ComDeno = { Deno?: { env: { get: (n: string) => string | undefined } } };
const ambiente = (n: string) => (globalThis as ComDeno).Deno?.env.get(n);

export function tokenMp(c: CredencialMp): string {
  if (typeof c !== "string") return c.token;
  return (c === "test" ? ambiente("MP_ACCESS_TOKEN_TEST") : ambiente("MP_ACCESS_TOKEN_PROD")) || "";
}
/** O schema de uma credencial (o log e o modoConfere): a da conta diz o dela; prod → public; test → staging. */
export function schemaDaCredencialMp(c: CredencialMp): Schema {
  return typeof c === "string" ? (c === "prod" ? "public" : "staging") : c.schema;
}
/** W2: só o SIMULADOR local troca a base (MP_API_BASE = http://127.0.0.1:<porta>); publicada, a do MP. */
export function baseDoMp(): string {
  const b = ambiente("MP_API_BASE") ?? "";
  return /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(b) ? b : MP_API;
}
```
No `mpFetch`: o 1º parâmetro vira `c: CredencialMp`, a URL `${baseDoMp()}${caminho}` (era `${MP_API}${caminho}`). `buscarNoMp` não muda (é só do
MP do Physiq). Em `app-sem-profissional.ts`, `cancelarAssinaturasDasMatriculas(db, credencial: CredencialMp, ids, motivo, log, opcoes, filtro?:
{ collector: number | null })`: com `filtro`, a leitura das assinaturas soma `.is("mp_collector_id", null)` ou `.eq("mp_collector_id", n)` (só no
schema com a W2 — quem passa o filtro é o `mp-conta.ts`, que já confere; linha com o comentário `// W2: depois do schemaTemW2` — a guarda da
Task 18); o log usa `schemaDaCredencialMp(credencial)`. Em **`planos-automatica-mp.ts`** (MENOR 2): `trocarValorDaAutomatica` e
`assinaturaComoNoMp` recebem `credencial: CredencialMp` (hoje `Credencial`, :50-56 e :87-92 — elas chamam o `mpFetch` direto); o
`ContextoMp` que JÁ existe nesse arquivo (:25) fica com o nome e a forma dele — o contexto novo da W2 se chama `ContextoMpConta`.

- [ ] **Step 2: `financeiro-mp.ts`** — `Cobranca.mp_collector_id?: number | string | null`; `export const COLUNAS_COBRANCA_W2 =
  COLUNAS_COBRANCA_IP + ", mp_collector_id";`; `registrarPagamentoAvulsoDoMp(…, extra: { …, colunasW2?: { mp_collector_id?: number } })` → o
  insert leva `...(extra.colunasW2 ?? {})`. **Regra da coluna nova (C2):** quem chama passa `colunasW2: await comCollector(db, schema,
  collector)` (o `comCollector` do `mp-conta.ts` devolve `{}` no schema sem a W2 ou sem collector) — o `financeiro-mp.ts` nunca escreve a
  coluna por conta própria (sem import do `mp-conta.ts`: não cria import circular).

- [ ] **Step 3: Os testes de `mp-conta.ts`** — um `db` falso (as chamadas `from(...).select/update/upsert/eq/is/or/gt` e `rpc` gravadas numa lista, com
  as respostas do cenário) e um `fetch` falso: o do `/oauth/token` entra pelo `ctx.fetch`; o das rotas do MP, por `vi.stubGlobal("fetch", …)` (o
  `mpFetch` usa o global — e o `vi.unstubAllGlobals()` no `afterEach`). Casos:
  1. `credencialDaConta`: ativa → decifra (o token NÃO aparece em nenhuma chamada ao db nem ao log falso); `erro` com `exigirAtiva` → lança
     `MpContaSemAcesso`; sem token → `MpContaSemAcesso("sem_token")`; vence em < 1 dia → renova ANTES (1 `POST /oauth/token`).
  2. `trocarCodigo`: manda `client_id`, `client_secret`, `grant_type authorization_code`, `code`, o `redirect_uri` da conexão, o `code_verifier` e
     `test_token "true"` (staging); 400 `invalid_grant` → `{ ok: false, motivo: "recusado" }` e o log só com `mp_erro: invalid_grant`.
  3. `renovarConta` feliz: a trava (`rpc mp_integracao_reservar`) → `POST refresh_token` → o UPDATE condicional `.eq("mp_refresh_token", <cifra
     antiga>)` com o par NOVO cifrado e `mp_renovando_ate: null` → `"renovada"`.
  4. trava ocupada → `"ocupada"` sem ida ao MP.
  5. `invalid_grant` com a linha já trocada (a releitura devolve outra cifra) → `"outra_renovou"`, status NÃO muda.
  6. `invalid_grant` com a linha igual e o acesso ainda valendo → `mp_erro renovacao_recusada`, `mp_renovar_proxima_em` +24 h, 1 aviso ao dono;
     com o acesso vencido → `status erro` + aviso.
  7. MP fora (503) → `mp_renovar_tentativas + 1`, `proxima_em` +1 h, status igual, trava solta.
  8. `mpContaFetch` (revisão I2): 401 → `GET /users/me` com o MESMO token → 200 (o mesmo collector) → devolve o 401 como veio, **0** `POST
     /oauth/token`, a integração segue `ativa` (o recurso é de outra conta); 401 → `/users/me` 401 → renova → refaz com o token NOVO → 200;
     `/users/me` 401 com `mp_renovado_em` há < 10 min → NÃO renova → `marcarErro` + `MpContaSemAcesso`; 401 de novo depois de renovar →
     `marcarErro` + `MpContaSemAcesso`; com `{ renovar: false }` (o webhook — MENOR 34) → `MpContaSemAcesso("token_recusado")` sem renovar
     e sem `marcarErro`; `/users/me` 5xx/599 → `MpIndisponivel` (sem decisão).
  9. `marcarErro` 2× no mesmo dia → 1 aviso só (o `mp_avisado_em` condicional).
  10. `credencialDaCobranca`: collector nulo → a do Physiq; igual → a da conta; outro → `null` ("outra conta"); `escrita` com a integração
      `desconectada` → `null` (decisão 10: depois de desligar, só leitura); **`leitura` (I3)** com a integração em `erro` ou sem token → `null`
      (não confere: quem chama devolve a linha do banco) e `desconectada` com token → a credencial com `renovar: false`.
  11. `cancelarAssinaturasPorCredencial`: 2 alunos no MP do Physiq + 1 na conta → 2 chamadas, cada uma com a credencial certa e o filtro do
      collector; a conta sem acesso → `semAcesso: 1` e nenhuma ida ao MP para ela; **MENOR 11:** um grupo que lança `MpIndisponivel` → `falhas
      += n` e o outro grupo `MpContaSemAcesso` → `semAcesso += n` — a função NUNCA lança por causa do MP (quem chama responde 502/409, não 500).
  12. **C2 — sem a W2 no schema** (o db falso responde 42P01 ao `mp_conexoes` e **42703 a qualquer select com `mp_collector_id`**):
      `colunasAssinatura()` = as colunas de antes; `comCollector(…, 123)` = `{}`; `cancelarAssinaturasPorCredencial` chama
      `cancelarAssinaturasDasMatriculas(db, physiq, ids, …)` UMA vez, sem filtro e sem nenhum select com a coluna. Com a W2: a coluna entra e
      `comCollector(…, 123)` = `{ mp_collector_id: 123 }`; `comCollector(…, null)` = `{}`.
  13. **MENOR 12:** vence em < 1 dia e `ctx.prazo.restante() < 10_000` → NÃO renova (segue com o token que ainda vale; 0 `POST /oauth/token`).
  14. **MENOR 13:** a renovação responde 2xx com o corpo fora do formato mas com um `refresh_token` → o refresh novo é gravado (cifrado, pela
      mesma gravação condicional) com `mp_erro: "renovacao_formato"`; o `log.erro` leva só as CHAVES do corpo; sem `refresh_token` → "recusada".
  15. **I1 — `registrarCobrancasDaAutomatica`**: a busca devolve 3 pagamentos, 1 já em `cobrancas` → 2 `GET /v1/payments/{id}`; só os
      `approved` viram `registrarPagamentoAvulsoDoMp` (com `preapprovalId`, `origem: "assinatura"` e o `colunasW2` do `comCollector`); a busca
      5xx → `MpIndisponivel`; a assinatura sem `authorized` → nenhuma busca.
  16. **I6 — `oauthDoAmbiente`**: `"staging"` com `MP_CLIENT_ID_STAGING`/`MP_CLIENT_SECRET_STAGING` → esse par; `"public"` → sempre o
      `MP_CLIENT_ID`/`MP_CLIENT_SECRET`; faltando um dos 2 → `null`.

- [ ] **Step 4: O módulo** — o esqueleto com os pontos de segurança escritos (o resto segue o molde do `infinitepay-baixa.ts`):

```ts
// supabase-principal/functions/_shared/mp-conta.ts
// Physiq W2 — o Mercado Pago DA CONTA do personal no servidor: ler a integração (nunca devolve token), montar a credencial (token decifrado
// só em memória), trocar o code (OAuth), renovar (o refresh GIRA: trava de 2 min + gravação condicional), chamar o MP com 401 → /users/me
// com o mesmo token (o 401 também é "recurso de outra conta" — revisão I2) → renova → 1 nova tentativa, marcar "erro" e avisar o dono (no
// máximo 1 por dia), achar a credencial certa de uma cobrança/assinatura que já existe (o collector; escrita × leitura — I3), a regra da
// coluna nova (colunasAssinatura/comCollector — C2), as cobranças da automática pela busca (I1) e cancelar automáticas pela credencial de
// cada uma. Só `import type` de URL: o Vitest importa com db e fetch falsos (src/financeiro/mpContaServidor.test.ts). Nunca no log: token,
// code, state, verifier, chave pública ou corpo do MP (só status, códigos e, no máximo, as CHAVES de um corpo fora do formato).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { cancelarAssinaturasDasMatriculas } from "./app-sem-profissional.ts";
import { cifrar, dadoAssociado, decifrar } from "./cifra-mp.ts";
import { MpIndisponivel, baseDoMp, credencialDoSchema, mpFetch, type Credencial, type CredencialConta, type CredencialMp, type RespostaMp, type Schema } from "./cobranca-mp.ts";
import { modoConfere, mpTransitorio, type PagamentoMp } from "./cobranca-regras.ts";
import { avisar, registrarPagamentoAvulsoDoMp, type Matricula } from "./financeiro-mp.ts";
import type { Log } from "./log.ts";
import { emLotes, todasAsPaginas } from "./paginas.ts";
import { AVISO_DONO_MS, RENOVAR_NA_HORA_MS, codigoDoOauth, lerTokenDoMp, motivoDoOauth, precisaRenovar, proximaTentativa, qualCredencial,
  type TokenMp } from "./mp-conta-regras.ts";
import { TEMPO_MS, buscarComTempo, tempoEsgotado, type Prazo } from "./tempo.ts";

export interface ContextoMpConta {
  schema: Schema;
  log: Log;
  prazo: Prazo;
  /** MP_TOKENS_CHAVE importada (cifra-mp.ts › chaveDoAmbiente) */
  chave: CryptoKey;
  /** oauthDoAmbiente(schema): MP_CLIENT_ID / MP_CLIENT_SECRET (no staging, o par _STAGING quando existe — plano B do I6); null = sem
   *  configuração (a troca e a renovação respondem "fora") */
  oauth: { clientId: string; clientSecret: string } | null;
  /** o Vitest passa um falso; publicado, o fetch de sempre */
  fetch?: typeof fetch;
}
export class MpContaSemAcesso extends Error {
  constructor(public contaId: string, public motivo: string) {
    super(`mp_conta_sem_acesso_${motivo}`);
    this.name = "MpContaSemAcesso";
  }
}

const TABELA_AUSENTE = /relation|does not exist|42P01|PGRST20|schema cache/i;
const W2_NO_SCHEMA = new Map<Schema, { tem: boolean; em: number }>();
/** O schema já tem a migration da W2? (a função é uma só para public e staging — lição I2 da W1). Guardado 60 s por instância. */
export async function schemaTemW2(db: SupabaseClient, schema: Schema): Promise<boolean> {
  const g = W2_NO_SCHEMA.get(schema);
  if (g && Date.now() - g.em < 60_000) return g.tem;
  const { error } = await db.from("mp_conexoes").select("id").limit(1);
  if (error && !TABELA_AUSENTE.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw error;
  W2_NO_SCHEMA.set(schema, { tem: !error, em: Date.now() });
  return !error;
}

export interface IntegracaoMp {
  conta_id: string; status: "ativa" | "erro" | "desconectada"; mp_user_id: number; mp_apelido: string | null; mp_public_key: string | null;
  mp_expira_em: string | null; mp_erro: string | null; mp_origem: string; mp_teste: boolean | null; conectado_em: string | null;
  desconectada_em: string | null; tem_acesso: boolean;
}
const COLUNAS = "conta_id, status, mp_user_id, mp_apelido, mp_public_key, mp_expira_em, mp_erro, mp_origem, mp_teste, conectado_em, desconectada_em";

/** A integração SEM token (o tem_acesso diz só se ainda há token guardado). */
export async function integracaoMp(db: SupabaseClient, contaId: string): Promise<IntegracaoMp | null> {
  const { data, error } = await db.from("recebimento_integracoes").select(`${COLUNAS}, mp_access_token`).eq("conta_id", contaId)
    .eq("provedor", "mercadopago").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { mp_access_token, ...resto } = data as Record<string, unknown>;
  return { ...(resto as Omit<IntegracaoMp, "tem_acesso">), mp_user_id: Number(resto.mp_user_id), tem_acesso: typeof mp_access_token === "string" };
}

/** A credencial da conta. exigirAtiva (padrão): só a ativa. renovar (padrão): vence em < 1 dia → renova antes. */
export async function credencialDaConta(db: SupabaseClient, ctx: ContextoMpConta, contaId: string,
  op: { exigirAtiva?: boolean; renovar?: boolean } = {}): Promise<CredencialConta> {
  const { data, error } = await db.from("recebimento_integracoes").select("status, mp_user_id, mp_access_token, mp_expira_em, mp_origem")
    .eq("conta_id", contaId).eq("provedor", "mercadopago").maybeSingle();
  if (error) throw error;
  const l = data as { status: string; mp_user_id: number; mp_access_token: string | null; mp_expira_em: string | null; mp_origem: string } | null;
  if (!l?.mp_access_token) throw new MpContaSemAcesso(contaId, l ? "sem_token" : "sem_integracao");
  if (op.exigirAtiva !== false && l.status !== "ativa") throw new MpContaSemAcesso(contaId, l.status);
  // MENOR 12: o refresh "can only be used once" — renovar no pedido de alguém só com ≥ 10 s de prazo; senão segue com o token que ainda vale
  if (op.renovar !== false && l.status === "ativa" && l.mp_origem === "oauth" && precisaRenovar(l.mp_expira_em, Date.now(), RENOVAR_NA_HORA_MS)
      && ctx.prazo.restante() >= 10_000) {
    const r = await renovarConta(db, ctx, contaId);
    if (r === "renovada" || r === "outra_renovou") return await credencialDaConta(db, ctx, contaId, { ...op, renovar: false });
  }
  if (l.mp_expira_em && Date.parse(l.mp_expira_em) <= Date.now()) throw new MpContaSemAcesso(contaId, "vencido");
  const token = await decifrar(l.mp_access_token, dadoAssociado(ctx.schema, contaId, "access"), ctx.chave);
  return { tipo: "conta", schema: ctx.schema, contaId, collectorId: Number(l.mp_user_id), token };
}

/** POST /oauth/token (client_id + client_secret sempre; o resto por chamada). Rede/tempo → 599. */
async function postOauth(ctx: ContextoMpConta, corpo: Record<string, string>): Promise<{ status: number; body: unknown }> {
  if (!ctx.oauth) return { status: 599, body: null };
  const ms = Math.min(TEMPO_MS.mp, ctx.prazo.restante());
  if (ms < 1_000) return { status: 599, body: null };
  try {
    const res = await buscarComTempo(`${baseDoMp()}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: ctx.oauth.clientId, client_secret: ctx.oauth.clientSecret, ...corpo }),
    }, ms, ctx.fetch ?? fetch);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch (e) {
      if (tempoEsgotado(e)) throw e;
    }
    return { status: res.status, body };
  } catch {
    return { status: 599, body: null };
  }
}

export async function trocarCodigo(ctx: ContextoMpConta, p: { codigo: string; redirect: string; verificador: string | null; teste: boolean }):
  Promise<{ ok: true; token: TokenMp } | { ok: false; motivo: "recusado" | "fora"; status: number }> {
  const corpo: Record<string, string> = { grant_type: "authorization_code", code: p.codigo, redirect_uri: p.redirect, test_token: p.teste ? "true" : "false" };
  if (p.verificador) corpo.code_verifier = p.verificador;
  const r = await postOauth(ctx, corpo);
  const t = r.status >= 200 && r.status < 300 ? lerTokenDoMp(r.body) : null;
  if (t) return { ok: true, token: t };
  ctx.log.aviso({ codigo: "mp_oauth_troca_falhou", schema: ctx.schema, status: r.status, externo: { mp_erro: codigoDoOauth(r.body) } });
  return { ok: false, motivo: r.status >= 200 && r.status < 300 ? "recusado" : motivoDoOauth(r.status), status: r.status };
}

export type ResultadoRenovar = "renovada" | "outra_renovou" | "recusada" | "fora" | "ocupada" | "sem_refresh";

/** Renova o acesso da conta. A trava (2 min) e a gravação condicional seguram a corrida do refresh que GIRA. */
export async function renovarConta(db: SupabaseClient, ctx: ContextoMpConta, contaId: string): Promise<ResultadoRenovar> {
  const { data: pegou, error: et } = await db.rpc("mp_integracao_reservar", { p_conta: contaId, p_segundos: 120 });
  if (et) throw et;
  if (pegou !== true) return "ocupada";
  let soltar = true;
  // toda gravação abaixo é pela MESMA chave: conta + provedor
  try {
    const { data, error } = await db.from("recebimento_integracoes").select("mp_refresh_token, mp_origem, mp_expira_em, mp_renovar_tentativas")
      .eq("conta_id", contaId).eq("provedor", "mercadopago").maybeSingle();
    if (error) throw error;
    const l = data as { mp_refresh_token: string | null; mp_origem: string; mp_expira_em: string | null; mp_renovar_tentativas: number } | null;
    if (!l?.mp_refresh_token || l.mp_origem !== "oauth") return "sem_refresh";
    const refresh = await decifrar(l.mp_refresh_token, dadoAssociado(ctx.schema, contaId, "refresh"), ctx.chave);
    const r = await postOauth(ctx, { grant_type: "refresh_token", refresh_token: refresh });
    const t = r.status >= 200 && r.status < 300 ? lerTokenDoMp(r.body) : null;
    if (t) {
      const novo = {
        mp_access_token: await cifrar(t.access, dadoAssociado(ctx.schema, contaId, "access"), ctx.chave),
        mp_refresh_token: t.refresh ? await cifrar(t.refresh, dadoAssociado(ctx.schema, contaId, "refresh"), ctx.chave) : l.mp_refresh_token,
        mp_expira_em: t.expiraEm, mp_public_key: t.publicKey ?? undefined, mp_renovado_em: new Date().toISOString(), mp_renovando_ate: null,
        mp_renovar_tentativas: 0, mp_renovar_proxima_em: null, mp_erro: t.renovavel ? null : "sem_renovacao", status: "ativa",
      };
      // o MP JÁ girou o refresh: a gravação tenta 3× (a perda do par novo = o dono reconecta — log.excecao avisa o Weslley)
      for (let i = 0; i < 3; i++) {
        const { data: g, error: eg } = await db.from("recebimento_integracoes").update(novo).eq("conta_id", contaId).eq("provedor", "mercadopago")
          .eq("mp_refresh_token", l.mp_refresh_token).select("conta_id");
        if (!eg) {
          soltar = false;
          ctx.log.info({ codigo: "mp_conta_renovada", schema: ctx.schema, ref: contaId });
          return (g ?? []).length ? "renovada" : "outra_renovou";
        }
        if (i === 2) ctx.log.excecao(eg, { codigo: "mp_renovacao_nao_gravada", schema: ctx.schema, ref: contaId });
        await new Promise((ok) => setTimeout(ok, 300 * (i + 1)));
      }
      return "fora";
    }
    if (r.status >= 200 && r.status < 300) {
      // MENOR 13: 2xx (o MP JÁ girou o refresh) com o corpo fora do formato do lerTokenDoMp (ex.: expires_in > 400 d): guarda ao menos o
      // refresh novo — sem ele a próxima renovação morre — e avisa o Weslley com as CHAVES do corpo (o msg do log; nunca os valores)
      const corpo = (r.body && typeof r.body === "object" && !Array.isArray(r.body) ? r.body : {}) as Record<string, unknown>;
      ctx.log.erro({ codigo: "mp_renovacao_formato", schema: ctx.schema, ref: contaId, status: r.status,
        msg: `chaves: ${Object.keys(corpo).slice(0, 20).join(", ")}` });
      const novoRefresh = typeof corpo.refresh_token === "string" && /^[A-Za-z0-9_-]{8,300}$/.test(corpo.refresh_token) ? corpo.refresh_token : null;
      if (novoRefresh) {
        const { error: eg } = await db.from("recebimento_integracoes").update({
          mp_refresh_token: await cifrar(novoRefresh, dadoAssociado(ctx.schema, contaId, "refresh"), ctx.chave), mp_erro: "renovacao_formato",
          mp_renovando_ate: null, mp_renovar_proxima_em: new Date(Date.now() + 3_600_000).toISOString(),
        }).eq("conta_id", contaId).eq("provedor", "mercadopago").eq("mp_refresh_token", l.mp_refresh_token);
        if (eg) throw eg;
        soltar = false;
      }
      return "recusada";
    }
    if (motivoDoOauth(r.status) === "recusado") {
      // invalid_grant pode ser OUTRA renovação que girou o refresh: relê — mudou = não é erro
      const { data: d2, error: e2 } = await db.from("recebimento_integracoes").select("mp_refresh_token").eq("conta_id", contaId)
        .eq("provedor", "mercadopago").maybeSingle();
      if (e2) throw e2;
      if ((d2 as { mp_refresh_token: string | null } | null)?.mp_refresh_token !== l.mp_refresh_token) return "outra_renovou";
      ctx.log.aviso({ codigo: "mp_renovacao_recusada", schema: ctx.schema, ref: contaId, status: r.status, externo: { mp_erro: codigoDoOauth(r.body) } });
      if (l.mp_expira_em && Date.parse(l.mp_expira_em) > Date.now()) {
        const { error: ea } = await db.from("recebimento_integracoes").update({ mp_erro: "renovacao_recusada",
          mp_renovar_proxima_em: new Date(Date.now() + 86_400_000).toISOString() }).eq("conta_id", contaId).eq("provedor", "mercadopago");
        if (ea) throw ea;
        await avisarDonoDaConexao(db, ctx, contaId, "O Mercado Pago não renovou sozinho o acesso do Physiq à sua conta. Conecte de novo em Configurações › Recebimento para os alunos não pararem de pagar pelo app.");
      } else {
        await marcarErro(db, ctx, contaId, "renovacao_recusada");
      }
      return "recusada";
    }
    const { error: ef } = await db.from("recebimento_integracoes").update({ mp_renovar_tentativas: l.mp_renovar_tentativas + 1,
      mp_renovar_proxima_em: proximaTentativa(l.mp_renovar_tentativas) }).eq("conta_id", contaId).eq("provedor", "mercadopago");
    if (ef) throw ef;
    return "fora";
  } finally {
    if (soltar) {
      const { error } = await db.from("recebimento_integracoes").update({ mp_renovando_ate: null }).eq("conta_id", contaId).eq("provedor", "mercadopago");
      if (error) ctx.log.excecao(error, { codigo: "mp_trava_nao_solta", schema: ctx.schema, ref: contaId });
    }
  }
}
```
E mais, no mesmo arquivo — **com código** onde a revisão achou furo:

```ts
// ── C2: a REGRA DA COLUNA NOVA. mp_collector_id só entra em select/insert por aqui (ou pelo COLUNAS_COBRANCA_W2): a função é uma só para
// o public e o staging, e entre a Task 14 (publicar) e a 22 (a migration no public) o public NÃO tem a coluna — o select com ela dá 42703
// (o aluno_status inteiro em 500) e o insert dá PGRST204 DEPOIS do POST /preapproval (a automática nasce no MP e o banco recusa: o aluno
// tenta de novo = cobrança em dobro). A guarda de fonte da Task 18 acusa a coluna escrita fora daqui.
export const COLUNAS_ASSINATURA = "id, paciente_id, conta_id, mp_preapproval_id, status, valor, proximo_vencimento, payload, criado_em";
export async function colunasAssinatura(db: SupabaseClient, schema: Schema): Promise<string> {
  return (await schemaTemW2(db, schema)) ? `${COLUNAS_ASSINATURA}, mp_collector_id` : COLUNAS_ASSINATURA;
}
export async function comCollector(db: SupabaseClient, schema: Schema, collector: number | null | undefined): Promise<{ mp_collector_id?: number }> {
  return (await schemaTemW2(db, schema)) && collector ? { mp_collector_id: collector } : {};
}
export const collectorDe = (cred: CredencialMp): number | null => (typeof cred === "string" ? null : cred.collectorId);

// ── I2: o 401 NÃO é "a conexão caiu" sozinho. O MP devolve 401 também para recurso de OUTRA conta (o buscarNoMp de hoje já trata assim —
// cobranca-mp.ts:120,128), e o id buscado pode vir de um aviso público forjado. Antes de renovar, GET /users/me com o MESMO token decide.
export async function mpContaFetch<T>(db: SupabaseClient, ctx: ContextoMpConta, cred: CredencialConta, caminho: string,
  init: RequestInit = {}, op: { renovar?: boolean } = {}): Promise<RespostaMp<T>> {
  const r = await mpFetch<T>(cred, caminho, init, { prazo: ctx.prazo });
  if (r.status !== 401) return r;
  const eu = await mpFetch<{ id?: number | string }>(cred, "/users/me", {}, { prazo: ctx.prazo });
  if (eu.status === 200) {
    if (Number(eu.body?.id) === cred.collectorId) return r;                 // o token vale: o recurso é de outra conta — nada muda
    await marcarErro(db, ctx, cred.contaId, "conta_trocada");               // o token é de OUTRO usuário do MP: não confiar nele
    throw new MpContaSemAcesso(cred.contaId, "conta_trocada");
  }
  if (eu.status !== 401 && eu.status !== 403) throw new MpIndisponivel(eu.status);   // sem decisão (MP fora/prazo): ninguém marca nada
  if (op.renovar === false) throw new MpContaSemAcesso(cred.contaId, "token_recusado"); // o webhook (MENOR 34): 500 e o job renova
  const { data, error } = await db.from("recebimento_integracoes").select("mp_renovado_em").eq("conta_id", cred.contaId)
    .eq("provedor", "mercadopago").maybeSingle();
  if (error) throw error;
  const ultima = Date.parse((data as { mp_renovado_em: string | null } | null)?.mp_renovado_em ?? "");
  const renovouHaPouco = Number.isFinite(ultima) && Date.now() - ultima < 10 * 60_000;   // no máximo 1 renovação a cada 10 min por conta
  if (!renovouHaPouco) {
    if (ctx.prazo.restante() < 10_000) throw new MpIndisponivel(599);       // MENOR 12: sem prazo para girar o refresh com segurança
    let res = await renovarConta(db, ctx, cred.contaId);
    if (res === "ocupada") {
      await new Promise((ok) => setTimeout(ok, 1_500));
      res = "outra_renovou";                                                // outra renovação estava no meio: relê a credencial
    }
    if (res === "fora") throw new MpIndisponivel(599);
    if (res === "renovada" || res === "outra_renovou") {
      const nova = await credencialDaConta(db, ctx, cred.contaId, { renovar: false });
      const r2 = await mpFetch<T>(nova, caminho, init, { prazo: ctx.prazo });   // POST refeito = X-Idempotency-Key nova (o 1º deu 401)
      if (r2.status !== 401) return r2;
    }
  }
  await marcarErro(db, ctx, cred.contaId, "acesso_recusado");
  throw new MpContaSemAcesso(cred.contaId, "acesso_recusado");
}

// ── I1: a REDE da cobrança de cada mês da automática na conta. O aviso dela pode nunca vir para o notification_url da assinatura (o exemplo
// oficial do POST /preapproval não tem o campo; a doc se contradiz) — então a busca das cobranças da automática (o molde da cobranca-conta,
// :250-271) registra as aprovadas que faltam (idempotente: mp_payment_id único). Quem chama: o conferirAssinatura (os 2 MPs) e o diário do
// mp-contas-renovar. `chamar` = o chamarMp com a credencial da assinatura já escolhida. O PagamentoMp do cobranca-regras.ts não muda (cópia no
// Treino — decisão 18): o collector_id vem pelo tipo local abaixo.
type PagamentoDaConta = PagamentoMp & { collector_id?: number | string | null };
export async function registrarCobrancasDaAutomatica(db: SupabaseClient, schema: Schema, log: Log,
  chamar: <T>(caminho: string) => Promise<RespostaMp<T>>, m: Matricula,
  a: { mp_preapproval_id: string | null; status: string }, colunasW2: { mp_collector_id?: number }): Promise<number> {
  if (!a.mp_preapproval_id || a.status !== "authorized") return 0;
  const busca = await chamar<{ results?: Array<{ payment?: { id?: number | string | null } | null }> }>(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(a.mp_preapproval_id)}&sort=date_created&criteria=desc&limit=6`);
  if (mpTransitorio(busca.status)) throw new MpIndisponivel(busca.status);
  if (busca.status !== 200) return 0;
  const ids = [...new Set((busca.body?.results ?? []).map((x) => x.payment?.id).filter((x) => x !== null && x !== undefined).map(String))];
  if (!ids.length) return 0;
  const { data: ja, error } = await db.from("cobrancas").select("mp_payment_id").in("mp_payment_id", ids);
  if (error) throw error;
  const conhecidos = new Set(((ja ?? []) as Array<{ mp_payment_id: string }>).map((x) => x.mp_payment_id));
  let n = 0;
  for (const pid of ids.filter((x) => !conhecidos.has(x))) {
    const { status, body: pay } = await chamar<PagamentoDaConta>(`/v1/payments/${encodeURIComponent(pid)}`);
    if (mpTransitorio(status)) throw new MpIndisponivel(status);
    if (status !== 200 || !pay?.id || pay.status !== "approved") continue;
    if (colunasW2.mp_collector_id && Number(pay.collector_id) !== colunasW2.mp_collector_id) continue;   // só o que caiu NESTA conta
    await registrarPagamentoAvulsoDoMp(db, m, pay, { preapprovalId: a.mp_preapproval_id, origem: "assinatura", colunasW2 }, log, schema);
    n++;
  }
  if (n) log.info({ codigo: "mp_automatica_rede", schema, ref: a.mp_preapproval_id, n });
  return n;
}

// ── C2 + MENOR 11: cancelar as automáticas vivas, cada uma com a credencial DELA. Sem a W2 no schema → o caminho de antes (sem agrupar, sem
// ler a coluna nova). O MP sem resposta (MpIndisponivel) vira `falhas` e a conta sem acesso (MpContaSemAcesso — inclusive a MP_TOKENS_CHAVE
// ausente) vira `semAcesso`: a função NUNCA lança por causa do MP (quem chama responde 502/409, nunca 500). Erro do banco lança (500 antes
// de mudar qualquer coisa — o hml-14 de sempre).
export async function cancelarAssinaturasPorCredencial(db: SupabaseClient, base: { schema: Schema; log: Log; prazo: Prazo },
  ctx: () => ContextoMpConta, physiq: Credencial, pacienteIds: string[], motivo: string):
  Promise<{ canceladas: number; falhas: number; semAcesso: number }> {
  const t = { canceladas: 0, falhas: 0, semAcesso: 0 };
  const cancelar = async (cred: CredencialMp, ids: string[], filtro?: { collector: number | null }) => {
    try {
      const r = await cancelarAssinaturasDasMatriculas(db, cred, ids, motivo, base.log, { prazo: base.prazo }, filtro);
      t.canceladas += r.canceladas;
      t.falhas += r.falhas;
    } catch (e) {
      if (e instanceof MpIndisponivel) t.falhas += ids.length;
      else if (e instanceof MpContaSemAcesso) t.semAcesso += ids.length;
      else throw e;
    }
  };
  if (!pacienteIds.length) return t;
  if (!(await schemaTemW2(db, base.schema))) {
    await cancelar(physiq, pacienteIds);
    return t;
  }
  type Viva = { paciente_id: string; conta_id: string | null; mp_collector_id: number | null };
  const vivas = await emLotes(pacienteIds, 150, (lote) => todasAsPaginas<Viva>((de, ate) =>
    db.from("aluno_assinaturas").select("paciente_id, conta_id, mp_collector_id") // W2: depois do schemaTemW2
      .in("paciente_id", lote).in("status", ["authorized", "pending", "paused"]).order("id").range(de, ate)));
  const grupos = new Map<string, { collector: number | null; conta: string | null; ids: Set<string> }>();
  for (const v of vivas) {
    const chave = `${v.mp_collector_id ?? "physiq"}:${v.mp_collector_id === null ? "" : v.conta_id ?? ""}`;
    const g = grupos.get(chave) ?? { collector: v.mp_collector_id === null ? null : Number(v.mp_collector_id), conta: v.conta_id, ids: new Set<string>() };
    g.ids.add(v.paciente_id);
    grupos.set(chave, g);
  }
  for (const g of grupos.values()) {
    if (g.collector === null) {
      await cancelar(physiq, [...g.ids], { collector: null });
      continue;
    }
    try {
      const cred = await credencialDaCobranca(db, ctx, { conta_id: g.conta, mp_collector_id: g.collector }, physiq, { escrita: true });
      if (!cred || typeof cred === "string") {
        t.semAcesso += g.ids.size;                                          // outra conta do MP ou desconectada: o Physiq não alcança
        continue;
      }
      await cancelar(cred, [...g.ids], { collector: g.collector });
    } catch (e) {
      if (e instanceof MpContaSemAcesso || e instanceof MpIndisponivel) t[e instanceof MpIndisponivel ? "falhas" : "semAcesso"] += g.ids.size;
      else throw e;
    }
  }
  return t;
}
```

E, em prosa (o molde de sempre):
- `marcarErro(db, ctx, contaId, motivo)` — `update({ status: "erro", mp_erro: motivo, mp_renovando_ate: null }).eq(conta).eq(provedor).eq("status","ativa").select("conta_id")`; mudou → `log.erro({ codigo: "mp_conta_sem_acesso", … resultado: motivo })` + `avisarDonoDaConexao(…, "Seu Mercado Pago desconectou do Physiq. Conecte de novo em Configurações › Recebimento para os alunos continuarem pagando pelo app.")`.
- `avisarDonoDaConexao` — só quem ganha o `update({ mp_avisado_em: agora }).or("mp_avisado_em.is.null,mp_avisado_em.lt.<agora-24h>")` avisa
  (`avisar(db, dono, "geral", texto, "/painel/configuracoes/recebimento", log, schema)`): no máximo 1 por dia.
- `chamarMp(db, ctx, cred: CredencialMp, caminho, init, op?)` — string → `mpFetch(cred, …, { prazo: ctx.prazo })`; da conta → `mpContaFetch(…, op)`.
- `buscarNaConta<T>(db, ctx, cred, caminho, op?)` — GET pelo `mpContaFetch`; 200 + `modoConfere(credencialDoSchema(cred.schema), corpo)` → o
  recurso; **401 que voltou do `mpContaFetch` (o `/users/me` disse que o token vale — I2) → null, ANTES do `mpTransitorio`** (que conta o 401
  como "MP fora"); 404/403 → null; `mpTransitorio` → `throw new MpIndisponivel(status)` (o webhook devolve 500 e o MP reenvia).
- `credencialDaCobranca(db, ctx: () => ContextoMpConta, c: { conta_id; mp_collector_id? }, physiq: Credencial, op: { escrita?: boolean; leitura?:
  boolean } = {})` → `qualCredencial`: physiq → `physiq` (o getter `ctx` nem é chamado: o MP do Physiq não precisa da `MP_TOKENS_CHAVE`);
  conta → a integração (`tem_acesso`) → `escrita` exige `status ativa` → `credencialDaConta(…, { exigirAtiva: !!op.escrita })`; **`leitura`
  (I3): `status erro` ou sem token → `null` (não confere); `desconectada` com token → `credencialDaConta(…, { exigirAtiva: false, renovar:
  false })`**; senão → `null` (quem chama responde `mp_outra_conta` / "faça pelo app do Mercado Pago", ou — na leitura — devolve a linha).
- `credencialDaAssinatura(db, ctx, a: { paciente_id; conta_id; mp_collector_id? }, physiq, op)` — o mesmo, pelo `conta_id` da assinatura (nulo →
  o da matrícula).
- `pacientesComAutomaticaViva(db, contaId)` — o `automaticasVivasDaConta` da W1 (busca pelos PACIENTES da conta; MENOR 6 da W1) movido para cá.
- `conferirConta(db, ctx, integ)` (o diário — MENOR 27 e I1; quem chama é o `mp-contas-renovar`): `GET /users/me` com o token da conta (401 →
  `renovarConta` → recusada/sem refresh → `marcarErro(…, "acesso_recusado")`); depois, as automáticas vivas `authorized` dos pacientes da conta
  com `mp_collector_id = integ.mp_user_id` (até 50) → `registrarCobrancasDaAutomatica` com a credencial da conta; no fim
  `update({ mp_conferido_em: agora })`. `MpIndisponivel` → não grava o `mp_conferido_em` (a próxima hora tenta de novo).
- `oauthDoAmbiente(schema)` — `MP_CLIENT_ID` e `MP_CLIENT_SECRET` (os 2 ou null); **no `staging`, o par `MP_CLIENT_ID_STAGING`/
  `MP_CLIENT_SECRET_STAGING` quando os 2 existem** (o plano B do I6: a aplicação de TESTE de um integrador de teste); o `public` nunca lê o
  par de teste. `pkceLigado()` — `MP_OAUTH_PKCE !== "0"`.
- `guardarParaConfirmar(db, ctx, con, t, apelido)` — Task 8 (I8: a volta guarda o par cifrado na `mp_conexoes`; quem grava a integração é a
  RPC `recebimento_mp_confirmar`, COMO A PESSOA — Task 6).

- [ ] **Step 5: Verde e o Deno**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro/mpContaServidor.test.ts src/financeiro/servidor.test.ts
for f in pagamentos-aluno mp-webhook-aluno automaticas-fila master-contas excluir-minha-conta; do DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/$f/index.ts; done
```
  Expected: PASS; os 5 `deno check` sem erro NOVO (o tipo do `mpFetch`/`tokenMp` ficou mais largo e o `planos-automatica-mp.ts` aceita a
  `CredencialMp`: as chamadas de hoje compilam igual — a revisão conferiu o esqueleto contra os `_shared` reais).
- [ ] **Step 6: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add supabase-principal/functions/_shared/{cobranca-mp,financeiro-mp,app-sem-profissional,planos-automatica-mp,mp-conta}.ts src/financeiro/mpContaServidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): o cliente do Mercado Pago da conta — credencial cifrada, troca do code, renovação com trava, o 401 que confere antes de renovar e a regra da coluna nova" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/cobranca-mp.ts supabase-principal/functions/_shared/financeiro-mp.ts supabase-principal/functions/_shared/app-sem-profissional.ts supabase-principal/functions/_shared/planos-automatica-mp.ts supabase-principal/functions/_shared/mp-conta.ts src/financeiro/mpContaServidor.test.ts
```

---

### Task 5: P-C — o cartão pela página do Mercado Pago (SÓ se a prova mostrar que falta a `public_key`)

**Files:** `supabase-principal/functions/pagamentos-aluno/index.ts` (ação `aluno_mp_cartao_pagina`), `src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx`,
`src/financeiro/api.ts`, **`src/financeiro/abrirPagamento.ts`** (MENOR 9) + o teste dele, `e2e/w2/api.py` (+ caso), `e2e/w2/simulador_mp.py`
(+ `/checkout/preferences`)
**Estimativa:** 55 a 90 min (pior cenário 130 min) — **fora do total**

> Entra se a Task 1 (ou a 23) mostrar `tem_public_key: false` em alguma das 2 respostas. Padrão da P-C (mestre §3): **o cartão abre a página do
> MP** com o token da conta. Pergunta 1 vai ao Weslley com o padrão já aplicado.

- [ ] **Step 1: A regra** (lição W1-B1 — nada de "aguardando" sem prazo): a página do MP **não cria linha antes de pagar**.
  - Mensalidade: `POST /checkout/preferences` (token da conta) com `items [{ title, quantity 1, unit_price, currency_id "BRL" }]`,
    `external_reference physiq:<schema>:aluno:<paciente>:mensalidade` (SEM o id da cobrança), `notification_url` da conta, `back_urls`
    `<SITE>/perfil/pagamentos?mp=retorno`, `auto_return "approved"`, `payment_methods { excluded_payment_types [{id:"ticket"},{id:"atm"}],
    installments <max do plano> }`, `expires true` + `expiration_date_to` +72 h → devolve só o `init_point` (`sandbox_init_point` no staging). O
    pagamento chega pelo webhook da conta como "recorrente" (`registrarPagamentoAvulsoDoMp` com o `colunasW2` do `comCollector` — C2): a linha nasce PAGA, com o
    retrato da W-P.
  - Avulsa: `external_reference …:avulsa:<cobranca_id>`; a avulsa continua `aberta` até o webhook (o caminho de hoje acha pela referência).
  - Automática sem chave: `aluno_mp_assinar { checkout: true }` (o caminho que já existe — preapproval `pending` + `init_point`) com o token da conta.
- [ ] **Step 2: O app** — sem `mp.chave_publica`: "Pagar com cartão" → `aluno_mp_cartao_pagina` → `abrirPagina(url, reservarAba())` (o
  `abrirPagamento.ts` da W1: Browser no APK, aba reservada no site) → ao voltar confere o `aluno_status`; "Cobrança automática todo mês" →
  `aluno_mp_assinar { checkout: true }` → `abrirPagina(init_point)`. **MENOR 9:** o `abrirPagina` de hoje SÓ abre endereço da InfinitePay
  (`urlDaInfinitePay`, `src/financeiro/abrirPagamento.ts:38-43`) — o link do MP voltaria "recusado". Acrescentar o filtro do MP no mesmo
  arquivo (o `abrirPagina` aceita a InfinitePay OU o MP):
```ts
/** W2 (P-C): o checkout do MP — https, host EXATO (o de produção e o do sandbox), sem credencial na URL. */
const HOSTS_DO_CHECKOUT_MP = new Set(["www.mercadopago.com.br", "sandbox.mercadopago.com.br"]);
export function urlDoCheckoutMp(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.length > 2048) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS_DO_CHECKOUT_MP.has(u.hostname) && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}
// no abrirPagina: const seguro = urlDaInfinitePay(url) ?? urlDoCheckoutMp(url);
```
  Teste: o `init_point` de produção e o de sandbox abrem; `https://www.mercadopago.com.br.evil.example/…`, `http://…` e `javascript:` → "recusado".
- [ ] **Step 3: Testes** — Vitest do corpo da preferência (sem id da cobrança na mensalidade; teto de parcelas); `api.py --local --casos pagina`
  (simulador: preferência → pagamento aprovado → webhook da conta → mensalidade paga com `mp_collector_id`; 2º pagamento da mesma preferência =
  mais um período, como a P6).
- [ ] **Step 4: Commit** — `"feat(w2): P-C — sem a chave pública do personal, o cartão abre a página do Mercado Pago"`.

---

### Task 6: Banco — a migration única + `e2e/w2/sql_w2.py` + SÓ no staging

**Files:**
- Create: `e2e/w2/sql_w2.py` (o teste, primeiro)
- Create: `supabase-principal/migrations/20261011210000_w2_mp_personal.sql`

**Estimativa:** 95 a 140 min (pior cenário 210 min) — cresceu com a confirmação como a pessoa (I8, com o I5 dentro dela), o I7, o
`mp_conferido_em` (MENOR 27) e os casos novos.

- [ ] **Step 1: O teste do banco** — `e2e/w2/sql_w2.py`, no molde do `e2e/w1/sql_w1.py` (o `bloco()` que termina com `RESULTADO<<…>>` de
  propósito — nada fica gravado; `como(uid)` roda como o app; as contas de TESTE prof2/aluno2/admin.teste). Ponto de partida de cada bloco: a
  conta do prof2 em `pix_manual`, sem integração MP, a flag ligada, nenhuma assinatura viva do aluno2. Um ajudante `integracao(status, origem)`
  insere como o servidor com cifras falsas no formato (`v1:` + 16 + `:` + 24 caracteres). Casos:

| # | Caso | Esperado |
|---|---|---|
| 1 | CHECK do modo | `mercadopago_conta` aceito (como o servidor) |
| 2 | entrar sem integração | o dono (authenticated) → exceção `mp_conta_sem_integracao`; o servidor também (vale para todos) |
| 3 | entrar com integração ativa | o dono liga; `desconectada` ou `erro` → exceção |
| 4 | sair com automática viva | assinatura `authorized` do aluno2 → o dono tenta `pix_manual` → `automaticas_ativas:1`; cancelada → passa; do `mercadopago` do Physiq também |
| 5 | sair do MP da conta | a integração vira `desconectada` com `desconectada_em` |
| 6 | master_conta_acao | `mercadopago_conta` → `modo_invalido`; sair do MP com automática → `{ok:false, erro:automaticas_ativas, alunos:1}`; sem → ok |
| 7 | o app não alcança | `select` em `recebimento_integracoes` e `mp_conexoes` como o dono → `insufficient_privilege`; o insert/update do dono em `cobrancas` com `mp_collector_id` → fica nulo/igual; `rpc w27_conta_linha` como o dono → `insufficient_privilege` (I7) |
| 8 | CHECK da integração | token sem `v1:` → violação; ativa sem token → violação; `teste_sem_oauth` sem refresh → passa; `desconectada` sem token → passa; `oauth` ativa sem refresh → violação, e com `mp_erro 'sem_renovacao'` → passa (o MP não mandou o refresh — decisão 8) |
| 9 | mp_conexoes no staging | o redirect próprio do staging passa; `https://www.mercadopago.com` passa; o do `public` → violação |
| 10 | trava | `mp_integracao_reservar` 1ª `true`, 2ª `false`; com `mp_renovando_ate` no passado → `true` |
| 11 | faxina | `mp_contas_renovar_disparar()`: desconectada há 8 dias perde os 2 tokens; há 6 dias, não; state vencido há 2 dias sai; **o par de uma conexão `confirmar` com `usado_em` há 16 min perde os tokens e vira `vencido`** (I8; no bloco desfeito o pg_net não manda nada) |
| 12 | master vê sem token | `w27_conta_linha(conta)->'mercadopago_conta'` com status/apelido e SEM nenhuma chave com "token"; `master_integracoes` conta `mercadopago_conta` |
| 13 | conta encerrada | a integração MP sai (o gatilho da W1) |
| 14 | nada ficou gravado | contagens por marca |
| 15 | **C1 — a guarda da W1b (`trg_cobrancas_guard_mp`) segue de pé** com o gatilho novo em `cobrancas` | o dono (como a pessoa): insert de uma avulsa do aluno2 com `forma 'mp'`, `status 'paga'`, `mp_payment_id 'X1'`, `reembolsado_em`, `mp_collector_id 9` → a linha nasce SEM `forma mp`, sem `mp_payment_id`, sem `reembolsado_em` e sem collector; numa linha `mp` criada como o servidor, o update do dono em `mp_payment_id`, `status`, `pix_copia_cola`, `reembolsado_em` e `mp_collector_id` → tudo igual (o `e2e/w1/sql_w1b.py` roda junto no Step 3 — os 2 gatilhos juntos) |
| 16 | **I8 — confirmar COMO A PESSOA** | conexão `confirmar` do prof2 (inserida como o servidor, com cifras falsas no formato, `mp_user_id` 777, `usado_em` agora): `recebimento_mp_confirmar` como o **aluno2** → `{ok:false, erro:'outra_pessoa'}` e nada na integração; como o prof2 → `{ok:true, resultado:'ok'}`, integração `ativa`, `mp_origem 'oauth'`, as 2 cifras IGUAIS às da conexão, a conexão `ok` e sem tokens, o modo `mercadopago_conta`; a mesma de novo → `invalido`; outra com `usado_em` há 16 min → `vencido` |
| 17 | **I5 + MENOR 29 — trocar de conta com algo aberto** | integração ativa (collector 777) + cobrança `mp` `aguardando_confirmacao` do aluno2 com `mp_collector_id 777` e `pix_expira_em` amanhã → confirmar uma conexão do collector 888 → `outra_conta` (a integração segue 777); o Pix vencido ontem → passa; a automática viva do collector 777 numa OUTRA conta do Physiq não conta; a integração `desconectada` há 3 dias COM token e o Pix aberto → `outra_conta` (decisão 10) |
| 18 | **o modo na confirmação** | prof2 no `mercadopago` (do Physiq) com automática viva do aluno2 → confirmar → `resultado:'conectado_sem_trocar'` (o gatilho recusou dentro do bloco; a integração ficou gravada); sem automática → `ok` e o modo trocado |

`--so-catalogo --schema staging|public` (só leitura): as colunas novas (inclusive `mp_conferido_em` e as do par em `mp_conexoes`); `mp_conexoes`
com RLS e sem grant para app/anon; as 6 funções internas novas (`mp_automaticas_vivas`, `contas_guard_mp`, `contas_saiu_do_mp_conta`,
`cobrancas_guard_mp_conta`, `mp_integracao_reservar`, `mp_contas_renovar_disparar`) com `search_path` e sem EXECUTE para
`authenticated`/`anon`; a `recebimento_mp_confirmar` com `search_path`, EXECUTE para `authenticated` e `service_role` e NÃO para `anon`;
**a `w27_conta_linha` sem EXECUTE para `authenticated`** (I7); **o gatilho da W1b em `cobrancas` ligado** (C1 — a mesma consulta da Task 0,
Step 3b); o job `mp-renovar-<s>`; as 2 flags; o CHECK com `mercadopago_conta`.

Run: `cd ~/projetos/physiqcalc-w2 && python3 e2e/w2/sql_w2.py` → Expected: FAIL (`mercadopago_conta` fora do CHECK / tabela `mp_conexoes`
não existe) — os blocos são desfeitos de propósito: nada fica gravado.

- [ ] **Step 2: A migration**

```sql
-- Physiq W2 — o Mercado Pago DO PERSONAL (OAuth): o dono conecta a conta dele no MP e o aluno paga como hoje no MP (Pix, cartão e a
-- cobrança automática), com o dinheiro direto na conta do personal. Banco principal, staging + public. Idempotente. UMA migration (lição I2
-- da W1): o apply_migration_principal.py roda o bloco de cada schema numa transação — entra tudo ou nada.
-- SÓ ACRESCENTA, ou troca uma função a partir do corpo mais novo; para quem não usa o MP da conta nada muda:
--   · contas.recebimento_modo aceita 'mercadopago_conta' ('mercadopago' continua = o MP do Physiq, só o master liga);
--   · recebimento_integracoes (W1) ganha o provedor 'mercadopago' (1 por conta): mp_user_id, mp_apelido, mp_public_key, os tokens CIFRADOS
--     no servidor (AES-256-GCM, a chave MP_TOKENS_CHAVE fica FORA do banco — 'v1:<iv>:<cifra>'), mp_expira_em, a renovação (trava,
--     tentativas, próxima), mp_erro, mp_origem e o status ativa · erro · desconectada; sem grant para anon/authenticated (como na W1);
--   · mp_conexoes: o state de uso único do OAuth (10 min; só o sha256) + o PKCE cifrado + o redirect usado + o PAR de tokens cifrado até a
--     confirmação de quem começou (15 min — revisão I8); só o servidor;
--   · cobrancas.mp_collector_id e aluno_assinaturas.mp_collector_id: QUAL conta do MP recebeu (nulo = o MP do Physiq);
--   · contas_guard_mp (TODO MUNDO: dono, master, servidor): entrar no 'mercadopago_conta' só com a integração ativa; sair de um MP com
--     cobrança automática viva, não (MENOR 7 da revisão da W1); contas_saiu_do_mp_conta: sair do MP da conta → integração 'desconectada';
--     cobrancas_guard_mp_conta: o app não grava mp_collector_id (o resto do MP em cobrancas já é da guarda da W1b — revisão C1);
--   · recebimento_mp_confirmar: a CONFIRMAÇÃO da conexão COMO A PESSOA (só quem começou e é dono; até 15 min) grava a integração — e só
--     troca de conta do MP sem nada em andamento na antiga (revisão I8 e I5);
--   · master: w27_conta_linha e master_integracoes (corpos da W1, 20261011200000) com o MP da conta (sem token); master_conta_acao (corpo da
--     w27, 20261002010000:212-358) recusa ligar o MP da conta (só o dono, pelo OAuth) e devolve automaticas_ativas antes do gatilho;
--   · app_config 'mercadopago_conta' {"liberada": false} (o personal só vê com a flag; o master sempre) e 'mp_webhook' {"exigir_assinatura":
--     false} (a x-signature só é EXIGIDA depois de provada nas notificações de verdade — Task 23 do plano);
--   · a renovação: mp_integracao_reservar (a trava de 2 min por conta — o refresh_token GIRA) e mp_contas_renovar_disparar() de hora em hora
--     (pg_cron → pg_net → mp-contas-renovar com o segredo S10 do Vault physiq_mp_renovar_segredo) — também 1×/dia por integração ativa, a
--     conferência do acesso e das cobranças das automáticas (mp_conferido_em; MENOR 27 e I1) — + a faxina (tokens da desconectada há 7
--     dias; o par não confirmado em 15 min; states vencidos há 1 dia).
-- NÃO devolve a w27_conta_linha ao authenticated (H-02 da hml-01 — revisão I7).
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py; dry-run antes de cada):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so public
-- Testes (staging, blocos desfeitos): python3 e2e/w2/sql_w2.py · no public, só leitura: python3 e2e/w2/sql_w2.py --so-catalogo --schema public

-- ============================================================================================================
-- 1. O modo (o CHECK tem nome desde a W1)
-- ============================================================================================================
alter table {schema}.contas drop constraint if exists contas_recebimento_modo_check;
alter table {schema}.contas add constraint contas_recebimento_modo_check
  check (recebimento_modo in ('pix_manual', 'nenhum', 'mercadopago', 'infinitepay', 'mercadopago_conta'));

-- ============================================================================================================
-- 2. A integração do MP da conta (na tabela da W1: 1 linha por conta e provedor)
-- ============================================================================================================
alter table {schema}.recebimento_integracoes add column if not exists mp_user_id bigint;              -- o collector (dono da conta no MP)
alter table {schema}.recebimento_integracoes add column if not exists mp_apelido text;                -- o nickname do MP (o dono confere a conta)
alter table {schema}.recebimento_integracoes add column if not exists mp_public_key text;             -- pública (o cartão no app); pode faltar (P-C)
alter table {schema}.recebimento_integracoes add column if not exists mp_access_token text;           -- CIFRADO (v1:…)
alter table {schema}.recebimento_integracoes add column if not exists mp_refresh_token text;          -- CIFRADO (v1:…)
alter table {schema}.recebimento_integracoes add column if not exists mp_expira_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_teste boolean;               -- live_mode false (staging: test_token)
alter table {schema}.recebimento_integracoes add column if not exists mp_origem text;                 -- oauth | teste_sem_oauth | teste_local
alter table {schema}.recebimento_integracoes add column if not exists mp_renovado_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_renovando_ate timestamptz;   -- a trava da renovação
alter table {schema}.recebimento_integracoes add column if not exists mp_renovar_tentativas integer not null default 0;
alter table {schema}.recebimento_integracoes add column if not exists mp_renovar_proxima_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_erro text;                   -- o motivo (código), nunca a resposta
alter table {schema}.recebimento_integracoes add column if not exists mp_avisado_em timestamptz;      -- o último aviso ao dono (1 por dia)
alter table {schema}.recebimento_integracoes add column if not exists conectado_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists desconectada_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_conferido_em timestamptz;    -- a conferência diária (MENOR 27, I1)
alter table {schema}.recebimento_integracoes drop constraint if exists recebimento_integracoes_check;
alter table {schema}.recebimento_integracoes add constraint recebimento_integracoes_check check (
      provedor in ('infinitepay', 'mercadopago')
  and status in ('ativa', 'erro', 'desconectada')
  and (provedor <> 'infinitepay' or (status in ('ativa', 'erro') and infinitepay_handle is not null
                                     and infinitepay_handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$'))
  and (provedor <> 'mercadopago' or (
        mp_user_id is not null and mp_user_id > 0
    and mp_origem in ('oauth', 'teste_sem_oauth', 'teste_local')
    and (mp_access_token is null or mp_access_token ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
    and (mp_refresh_token is null or mp_refresh_token ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
    -- o MP pode não mandar o refresh (a doc diz que todos os campos da resposta são opcionais): a conexão vale até o vencimento, marcada
    -- 'sem_renovacao' (decisão 8 — aviso "reconecte até dd/mm"); sem essa marca, ativa por OAuth exige o refresh
    and (status <> 'ativa' or (mp_access_token is not null and mp_expira_em is not null
                               and (mp_refresh_token is not null or mp_origem <> 'oauth' or mp_erro = 'sem_renovacao')))
    and (mp_public_key is null or (char_length(mp_public_key) <= 80 and mp_public_key ~ '^(APP_USR|TEST)-[A-Za-z0-9-]+$'))
    and (mp_apelido is null or char_length(mp_apelido) <= 80)
    and (mp_erro is null or mp_erro ~ '^[a-z_]{1,40}$')
    and mp_renovar_tentativas >= 0)));
create index if not exists recebimento_integracoes_mp_renovar_idx on {schema}.recebimento_integracoes (mp_expira_em)
  where provedor = 'mercadopago' and status = 'ativa';
comment on table {schema}.recebimento_integracoes is
  'W1/W2: a forma de receber da conta num provedor (a InfiniteTag; o MP da conta com os tokens CIFRADOS — a chave fica fora do banco). Só o servidor.';

-- ============================================================================================================
-- 3. O state de uso único do OAuth (10 min). O state em si nunca fica guardado; o verifier do PKCE, cifrado. E o PAR da volta até a
--    confirmação (I8). Sem coluna de origem: a volta sempre cai no site (no APK, o Conectar abre o site — decisão 6).
-- ============================================================================================================
create table if not exists {schema}.mp_conexoes (
  id uuid primary key default gen_random_uuid(),
  estado_hash text not null unique,
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verificador text not null,
  redirect_uri text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '10 minutes',
  usado_em timestamptz,
  resultado text
);
-- I8 (revisão): a volta troca o code e guarda o par AQUI, cifrado com o MESMO dado associado da integração (physiq:w2:<schema>:<conta>:
-- access|refresh — a confirmação só copia), com resultado 'confirmar'; quem grava a integração é a recebimento_mp_confirmar, COMO A
-- PESSOA, em até 15 min. MENOR 23: colunas que chegam depois do create entram por alter … add column if not exists.
alter table {schema}.mp_conexoes add column if not exists token_access text;          -- CIFRADO (v1:…)
alter table {schema}.mp_conexoes add column if not exists token_refresh text;         -- CIFRADO (v1:…)
alter table {schema}.mp_conexoes add column if not exists token_expira_em timestamptz;
alter table {schema}.mp_conexoes add column if not exists mp_user_id bigint;
alter table {schema}.mp_conexoes add column if not exists mp_apelido text;
alter table {schema}.mp_conexoes add column if not exists public_key text;
alter table {schema}.mp_conexoes add column if not exists live boolean;
alter table {schema}.mp_conexoes add column if not exists renovavel boolean;
alter table {schema}.mp_conexoes drop constraint if exists mp_conexoes_check;
alter table {schema}.mp_conexoes add constraint mp_conexoes_check check (
      estado_hash ~ '^[0-9a-f]{64}$' and verificador ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$'
  and (redirect_uri = 'https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/{schema}'
       or ('{schema}' = 'staging' and redirect_uri = 'https://www.mercadopago.com'))
  and (resultado is null or resultado ~ '^[a-z_]{1,40}$')
  and (token_access is null or token_access ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
  and (token_refresh is null or token_refresh ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
  and (resultado is distinct from 'confirmar' or (token_access is not null and mp_user_id > 0 and token_expira_em is not null
                                                  and usado_em is not null))
  and (public_key is null or (char_length(public_key) <= 80 and public_key ~ '^(APP_USR|TEST)-[A-Za-z0-9-]+$'))
  and (mp_apelido is null or char_length(mp_apelido) <= 80));
create index if not exists mp_conexoes_expira_idx on {schema}.mp_conexoes (expira_em);
comment on table {schema}.mp_conexoes is
  'W2: o state de uso único do OAuth do MP (10 min), o PKCE cifrado, o redirect usado e o par CIFRADO até a confirmação de quem começou (15 min). Só o servidor.';
alter table {schema}.mp_conexoes enable row level security;
revoke all on table {schema}.mp_conexoes from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.mp_conexoes to service_role;

-- ============================================================================================================
-- 4. Qual conta do MP recebeu (nulo = o MP do Physiq) — o app não grava. As OUTRAS colunas do MP em cobrancas (forma 'mp', o status da
--    linha mp, reembolsado_em, mp_payment_id, mp_status, mp_preapproval_id, pix_*) já estão congeladas para o app pelo gatilho da W1b
--    (trg_cobrancas_guard_mp → cobrancas_guard_mp(), 20261011220000_w1b_guarda_cobrancas_mp.sql — revisão C1, pré-requisito conferido na
--    Task 0): este acrescenta SÓ a coluna nova, que a guarda da W1b não cita (antes da W2 ela não existia: o NEW.mp_collector_id quebraria
--    toda gravação do app). O corpo da W1b NÃO é trocado aqui. Os BEFORE rodam em ordem alfabética — guard_infinitepay → guard_mp →
--    guard_mp_conta → guard_periodo — e nenhum desfaz o outro (cada um mexe nas suas colunas).
-- ============================================================================================================
alter table {schema}.cobrancas add column if not exists mp_collector_id bigint;
alter table {schema}.aluno_assinaturas add column if not exists mp_collector_id bigint;

create or replace function {schema}.cobrancas_guard_mp_conta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then new.mp_collector_id := null; else new.mp_collector_id := old.mp_collector_id; end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.cobrancas_guard_mp_conta() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_mp_conta on {schema}.cobrancas;
create trigger trg_cobrancas_guard_mp_conta before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_mp_conta();

-- ============================================================================================================
-- 5. As flags (só o servidor lê)
-- ============================================================================================================
insert into {schema}.app_config (chave, valor, publica) values ('mercadopago_conta', '{"liberada": false}'::jsonb, false) on conflict (chave) do nothing;
insert into {schema}.app_config (chave, valor, publica) values ('mp_webhook', '{"exigir_assinatura": false}'::jsonb, false) on conflict (chave) do nothing;

-- ============================================================================================================
-- 6. As guardas do modo — para TODO MUNDO (o gatilho da W1, contas_guard, segue só para o app; este roda depois dele: o nome ordena)
-- ============================================================================================================
create or replace function {schema}.mp_automaticas_vivas(p_conta uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(distinct a.paciente_id)::integer
    from {schema}.aluno_assinaturas a join {schema}.pacientes p on p.id = a.paciente_id
   where p.conta_id = p_conta and a.status in ('authorized', 'pending', 'paused');
$$;
revoke all on function {schema}.mp_automaticas_vivas(uuid) from public, anon, authenticated;
grant execute on function {schema}.mp_automaticas_vivas(uuid) to service_role;

create or replace function {schema}.contas_guard_mp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if new.recebimento_modo is not distinct from old.recebimento_modo then return new; end if;
  if new.recebimento_modo = 'mercadopago_conta' and not exists (
       select 1 from {schema}.recebimento_integracoes i where i.conta_id = new.id and i.provedor = 'mercadopago' and i.status = 'ativa') then
    raise exception 'mp_conta_sem_integracao' using errcode = 'P0001', hint = 'w2';
  end if;
  if old.recebimento_modo in ('mercadopago', 'mercadopago_conta') then
    v_n := {schema}.mp_automaticas_vivas(new.id);
    if v_n > 0 then raise exception 'automaticas_ativas:%', v_n using errcode = 'P0001', hint = 'w2'; end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.contas_guard_mp() from public, anon, authenticated;
drop trigger if exists trg_contas_guard_mp on {schema}.contas;
create trigger trg_contas_guard_mp before update of recebimento_modo on {schema}.contas
  for each row execute function {schema}.contas_guard_mp();

create or replace function {schema}.contas_saiu_do_mp_conta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update {schema}.recebimento_integracoes set status = 'desconectada', desconectada_em = now(), mp_renovando_ate = null
   where conta_id = new.id and provedor = 'mercadopago' and status <> 'desconectada';
  return null;
end;
$$;
revoke all on function {schema}.contas_saiu_do_mp_conta() from public, anon, authenticated;
drop trigger if exists trg_contas_saiu_do_mp_conta on {schema}.contas;
create trigger trg_contas_saiu_do_mp_conta after update of recebimento_modo on {schema}.contas
  for each row when (old.recebimento_modo = 'mercadopago_conta' and new.recebimento_modo is distinct from 'mercadopago_conta')
  execute function {schema}.contas_saiu_do_mp_conta();

-- ============================================================================================================
-- 7. O master: a linha da conta e Integrações (corpos da W1) com o MP da conta, sem token; a ação 'recebimento' (corpo da w27)
-- ============================================================================================================
-- w27_conta_linha: COPIAR o corpo de 20261011200000_w1_infinitepay.sql:372-406 INTEIRO e acrescentar, depois da chave 'infinitepay':
--     'mercadopago_conta', (select jsonb_build_object('status', i.status, 'apelido', i.mp_apelido, 'mp_user_id', i.mp_user_id,
--                             'expira_em', i.mp_expira_em, 'erro', i.mp_erro, 'chave_publica', i.mp_public_key is not null,
--                             'conectado_em', i.conectado_em, 'teste', i.mp_teste)
--                             from {schema}.recebimento_integracoes i where i.conta_id = c.id and i.provedor = 'mercadopago')
-- master_integracoes: COPIAR o corpo de 20261011200000_w1_infinitepay.sql:408-438 e acrescentar no v_resumo:
--     'mercadopago_conta', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago_conta'),
--     'mp_conta_erro', (select count(*) from {schema}.recebimento_integracoes i where i.provedor = 'mercadopago' and i.status = 'erro'),
-- master_conta_acao: COPIAR o corpo de 20261002010000_w27_master.sql:212-358 INTEIRO e trocar SÓ o ramo de :330-336 por:
--   elsif p_acao = 'recebimento' then
--     v_txt := v_a ->> 'modo';
--     -- W2: o master liga o MP do Physiq, o Pix e o "não cobrar"; a InfinitePay e o MP da conta, só o dono (a InfiniteTag / o OAuth)
--     if v_txt not in ('pix_manual', 'nenhum', 'mercadopago') then return jsonb_build_object('ok', false, 'erro', 'modo_invalido'); end if;
--     -- W2 (MENOR 7 da W1): sair de um MP com automática viva → a master-contas cancela antes, com o OK; aqui só recusa (antes do gatilho)
--     if v_c.recebimento_modo in ('mercadopago', 'mercadopago_conta') and v_txt is distinct from v_c.recebimento_modo
--        and {schema}.mp_automaticas_vivas(p_conta) > 0 then
--       return jsonb_build_object('ok', false, 'erro', 'automaticas_ativas', 'alunos', {schema}.mp_automaticas_vivas(p_conta));
--     end if;
--     update {schema}.contas set recebimento_modo = v_txt where id = p_conta returning * into v_novo;
--     insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
--     values (p_conta, 'outro', jsonb_build_object('recebimento_modo', v_c.recebimento_modo), jsonb_build_object('w27', 'recebimento', 'recebimento_modo', v_txt), v_uid);
-- (os 3 com create or replace — as assinaturas não mudam e o create or replace MANTÉM os grants de hoje.)
-- I7 da revisão: a w27_conta_linha é SÓ do service_role desde a hml-01 (H-02, 20261007200100_hml01b_funcoes_internas_e_perfil.sql:19-36):
-- é SECURITY DEFINER, não confere o master e devolve o e-mail do dono, a chave Pix, a InfiniteTag e, com a W2, o MP da conta — NUNCA grant
-- ao authenticated (o e2e/hml01/banco.py › INTERNAS e o sql_w2 --so-catalogo conferem). A master_conta_acao segue como a w27 deixou.
revoke all on function {schema}.w27_conta_linha(uuid) from public, anon, authenticated;
grant execute on function {schema}.w27_conta_linha(uuid) to service_role;
revoke execute on function {schema}.master_conta_acao(uuid, text, jsonb) from public, anon;
grant execute on function {schema}.master_conta_acao(uuid, text, jsonb) to authenticated, service_role;

-- ============================================================================================================
-- 8. A renovação: a trava por conta e o disparo de hora em hora (o molde da automaticas_disparar, W-P) + a faxina
-- ============================================================================================================
create or replace function {schema}.mp_integracao_reservar(p_conta uuid, p_segundos integer default 120) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update {schema}.recebimento_integracoes
     set mp_renovando_ate = now() + make_interval(secs => least(greatest(coalesce(p_segundos, 120), 10), 600))
   where conta_id = p_conta and provedor = 'mercadopago' and status in ('ativa', 'erro')
     and (mp_renovando_ate is null or mp_renovando_ate < now());
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

create or replace function {schema}.mp_contas_renovar_disparar() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_segredo text;
  v_id bigint;
begin
  -- a faxina (só SQL): o acesso da desligada some depois de 7 dias; os states vencidos há 1 dia saem
  update {schema}.recebimento_integracoes set mp_access_token = null, mp_refresh_token = null
   where provedor = 'mercadopago' and status = 'desconectada' and desconectada_em < now() - interval '7 days'
     and (mp_access_token is not null or mp_refresh_token is not null);
  -- I8: o par que ninguém confirmou em 15 min perde os tokens (a linha sai com a faxina de 1 dia)
  update {schema}.mp_conexoes set token_access = null, token_refresh = null, resultado = 'vencido'
   where resultado = 'confirmar' and usado_em < now() - interval '15 minutes';
  delete from {schema}.mp_conexoes where expira_em < now() - interval '1 day';
  -- chama a função só quando há o que fazer: renovar (vence em < 30 dias, na hora da tentativa) OU a conferência diária (MENOR 27 e I1)
  if not exists (select 1 from {schema}.recebimento_integracoes i
                  where i.provedor = 'mercadopago' and i.mp_origem = 'oauth' and i.status = 'ativa'
                    and ((i.mp_expira_em < now() + interval '30 days'
                          and (i.mp_renovar_proxima_em is null or i.mp_renovar_proxima_em <= now()))
                         or i.mp_conferido_em is null or i.mp_conferido_em < now() - interval '1 day')) then
    return null;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return null; end if;
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_mp_renovar_segredo' limit 1;
  if v_segredo is null or length(v_segredo) < 32 then return null; end if;
  select net.http_post(
    url := 'https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/mp-contas-renovar',
    body := jsonb_build_object('schema', '{schema}'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-espelho-segredo', v_segredo),
    timeout_milliseconds := 120000) into v_id;
  return v_id;
end;
$$;
revoke all on function {schema}.mp_integracao_reservar(uuid, integer), {schema}.mp_contas_renovar_disparar() from public, anon, authenticated;
grant execute on function {schema}.mp_integracao_reservar(uuid, integer), {schema}.mp_contas_renovar_disparar() to service_role;

-- de hora em hora, no minuto 41 (o mesmo nome ATUALIZA o job)
select cron.schedule('mp-renovar-{schema}', '41 * * * *', $$select {schema}.mp_contas_renovar_disparar()$$);

-- ============================================================================================================
-- 9. A CONFIRMAÇÃO da conexão, COMO A PESSOA (revisão I8, com o I5 e o MENOR 29 dentro). A volta do OAuth (mp-conectar-retorno, service_role)
--    só troca o code e guarda o par CIFRADO na mp_conexoes ('confirmar'); a integração é gravada AQUI, chamada pela pagamentos-aluno com a
--    sessão de quem está na tela (dbPessoa). Só passa quem COMEÇOU a conexão (user_id = auth.uid()) e é dono da conta (MENOR 19), em até
--    15 min. Um link de conexão do atacante, autorizado pela vítima no MP, não liga nada: a vítima volta ao site com a sessão DELA, e o
--    atacante não conhece o id da conexão. Molde: recebimento_infinitepay_salvar (W1).
-- ============================================================================================================
create or replace function {schema}.recebimento_mp_confirmar(p_conexao uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_con {schema}.mp_conexoes%rowtype;
  v_c {schema}.contas%rowtype;
  v_atual {schema}.recebimento_integracoes%rowtype;
  v_liberada boolean;
  v_abertos integer := 0;
  v_resultado text := 'ok';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_con from {schema}.mp_conexoes where id = p_conexao for update;
  if not found or v_con.resultado is distinct from 'confirmar' or v_con.token_access is null then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;
  -- I8: só quem começou — e dono (nem o master liga o MP DELE na conta de um personal)
  if v_con.user_id is distinct from v_uid or not {schema}.sou_dono(v_con.conta_id) then
    return jsonb_build_object('ok', false, 'erro', 'outra_pessoa');
  end if;
  if v_con.usado_em < now() - interval '15 minutes' then
    update {schema}.mp_conexoes set resultado = 'vencido', token_access = null, token_refresh = null where id = v_con.id;
    return jsonb_build_object('ok', false, 'erro', 'vencido');
  end if;
  select * into v_c from {schema}.contas where id = v_con.conta_id;
  if not found or v_c.origem = 'app' then return jsonb_build_object('ok', false, 'erro', 'conta_invalida'); end if;
  select coalesce((a.valor ->> 'liberada')::boolean, false) into v_liberada from {schema}.app_config a where a.chave = 'mercadopago_conta';
  if not coalesce(v_liberada, false) and not {schema}.eh_master() then
    return jsonb_build_object('ok', false, 'erro', 'mp_conta_em_teste');
  end if;
  select * into v_atual from {schema}.recebimento_integracoes where conta_id = v_con.conta_id and provedor = 'mercadopago' for update;
  -- I5 (+ MENOR 29): OUTRA conta do MP com o acesso da antiga ainda guardado (ativa, erro ou os 7 dias de desconectada — decisão 10) → só
  -- troca se a antiga não tiver nada em andamento NOS ALUNOS DESTA CONTA: automática viva ou cobrança do MP aberta (Pix até vencer; cartão
  -- em análise). O upsert abaixo apagaria o token que ainda tem de ler esse Pix.
  if found and v_atual.mp_user_id is distinct from v_con.mp_user_id
     and (v_atual.mp_access_token is not null or v_atual.mp_refresh_token is not null) then
    select (select count(*) from {schema}.aluno_assinaturas a join {schema}.pacientes p on p.id = a.paciente_id
             where p.conta_id = v_con.conta_id and a.mp_collector_id = v_atual.mp_user_id and a.status in ('authorized', 'pending', 'paused'))
         + (select count(*) from {schema}.cobrancas co join {schema}.pacientes p on p.id = co.paciente_id
             where p.conta_id = v_con.conta_id and co.deleted_at is null and co.forma = 'mp' and co.status = 'aguardando_confirmacao'
               and co.mp_collector_id = v_atual.mp_user_id and (co.pix_expira_em is null or co.pix_expira_em > now()))
      into v_abertos;
    if v_abertos > 0 then
      update {schema}.mp_conexoes set resultado = 'outra_conta', token_access = null, token_refresh = null where id = v_con.id;
      return jsonb_build_object('ok', false, 'erro', 'outra_conta', 'abertos', v_abertos);
    end if;
  end if;
  -- MENOR 29 — LIGAR (tirar os comentários) SÓ se a prova da Task 1 mostrar primeira_vale_depois_da_segunda = false (a 2ª autorização do
  -- mesmo vendedor derruba a 1ª): a mesma conta do MP já ligada em OUTRA conta do Physiq é recusada.
  -- if exists (select 1 from {schema}.recebimento_integracoes i where i.provedor = 'mercadopago' and i.mp_user_id = v_con.mp_user_id
  --            and i.conta_id <> v_con.conta_id and i.status in ('ativa', 'erro')) then
  --   update {schema}.mp_conexoes set resultado = 'mp_em_outra_conta', token_access = null, token_refresh = null where id = v_con.id;
  --   return jsonb_build_object('ok', false, 'erro', 'mp_em_outra_conta');
  -- end if;
  insert into {schema}.recebimento_integracoes (conta_id, provedor, status, mp_user_id, mp_apelido, mp_public_key, mp_access_token,
    mp_refresh_token, mp_expira_em, mp_teste, mp_origem, mp_renovado_em, mp_renovando_ate, mp_renovar_tentativas, mp_renovar_proxima_em,
    mp_erro, mp_avisado_em, mp_conferido_em, conectado_em, desconectada_em, atualizado_por)
  values (v_con.conta_id, 'mercadopago', 'ativa', v_con.mp_user_id, v_con.mp_apelido, v_con.public_key, v_con.token_access,
    v_con.token_refresh, v_con.token_expira_em, v_con.live is false, 'oauth', null, null, 0, null,
    case when v_con.renovavel and v_con.token_refresh is not null then null else 'sem_renovacao' end, null, now(), now(), null, v_uid)
  on conflict (conta_id, provedor) do update set status = 'ativa', mp_user_id = excluded.mp_user_id, mp_apelido = excluded.mp_apelido,
    mp_public_key = excluded.mp_public_key, mp_access_token = excluded.mp_access_token, mp_refresh_token = excluded.mp_refresh_token,
    mp_expira_em = excluded.mp_expira_em, mp_teste = excluded.mp_teste, mp_origem = 'oauth', mp_renovado_em = null, mp_renovando_ate = null,
    mp_renovar_tentativas = 0, mp_renovar_proxima_em = null, mp_erro = excluded.mp_erro, mp_avisado_em = null, mp_conferido_em = now(),
    conectado_em = now(), desconectada_em = null, atualizado_por = v_uid;
  update {schema}.mp_conexoes set resultado = 'ok', token_access = null, token_refresh = null where id = v_con.id;   -- o par sai daqui
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (v_con.conta_id, 'outro', '{}'::jsonb, jsonb_build_object('w2', 'mp_conectado', 'mp_user_id', v_con.mp_user_id,
          'teste', v_con.live is false, 'chave_publica', v_con.public_key is not null), v_uid);
  -- liga o modo quando é seguro (decisão 6): com automática viva no MP de antes, o contas_guard_mp recusa (P0001) → 'conectado_sem_trocar'
  -- (a integração fica gravada; a tela pede "Salvar a forma", com o OK de cancelar as automáticas)
  if v_c.recebimento_modo is distinct from 'mercadopago_conta' then
    begin
      update {schema}.contas set recebimento_modo = 'mercadopago_conta' where id = v_con.conta_id;
    exception when sqlstate 'P0001' then
      v_resultado := 'conectado_sem_trocar';
    end;
  end if;
  return jsonb_build_object('ok', true, 'resultado', v_resultado, 'apelido', v_con.mp_apelido);
end;
$$;
revoke all on function {schema}.recebimento_mp_confirmar(uuid) from public, anon;
grant execute on function {schema}.recebimento_mp_confirmar(uuid) to authenticated, service_role;
```
(A Task 6 escreve os 3 corpos copiados por inteiro no arquivo — o comentário acima diz de onde e o que muda; o `sql_w2` caso 12 e o
`checar-definer` conferem. A `recebimento_mp_confirmar` é a única definer nova com EXECUTE para o `authenticated`: ela confere a pessoa por
dentro — `auth.uid()` = quem começou e `sou_dono` —, como a `recebimento_infinitepay_salvar` da W1.)

- [ ] **Step 3: A trava do banco e o staging (regras 1 e 5 do quadro)** — pegar "🔒 BANCO do staging" (quadro + `SendMessage` à LINUX 1 + esperar
  o "pode ir"; nunca com E2E dela rodando); o número já está reservado (Task 0):

```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so staging --dry-run
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so staging
flock $P python3 e2e/w2/sql_w2.py && flock $P python3 e2e/w1/sql_w1.py && flock $P python3 e2e/w1/sql_w1b.py && flock $P python3 e2e/wp/sql_planos.py && flock $P python3 e2e/hml01/banco.py --schema staging
```
Expected: dry-run limpo; `sql_w2` 18/18; a W1b (`sql_w1b`) sem regressão com o gatilho novo ao lado; a W1 (`sql_w1`), a W-P e o `hml01` sem regressão (o `contas_guard` da W1 não mudou; o CHECK novo
inclui os 4 de antes; **a `w27_conta_linha` segue só do servidor** — I7). Soltar a trava + aviso. **Nada no `public` aqui.**

- [ ] **Step 4: O CI local dos 2 checadores** — `cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock;
  flock $P npm run test:node && node scripts/ci/checar-definer.mjs` (MENOR 7: o `test:node` não roda o `checar-definer` no repo; o CI roda à
  parte — as definer novas com `search_path` e revoke/grant) → verde.
- [ ] **Step 5: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add e2e/w2/sql_w2.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): banco — o MP da conta (tokens cifrados fora do banco), o state do OAuth com a confirmação de quem começou, o collector nas cobranças, as guardas do modo para todos (MENOR 7) e a renovação de hora em hora" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/w2/sql_w2.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql
```

---

### Task 7: Servidor — `pagamentos-aluno`: o Recebimento do MP da conta (conectar, confirmar, desconectar, salvar, simular)

**Files:** Modify `supabase-principal/functions/pagamentos-aluno/index.ts`, `…/_shared/recebimento-regras.ts`, `…/_shared/planos-regras.ts`; Test `src/financeiro/servidor.test.ts` (+ casos das regras de recebimento)
**Estimativa:** 55 a 80 min (pior cenário 120 min) — cresceu com o `prof_mp_confirmar` (I8), o APK pelo site e os MENORES 10, 11 e 19.

- [ ] **Step 1: As regras** — `recebimento-regras.ts`: `ModoRecebimento` + `"mercadopago_conta"`; `MODOS = ["pix_manual", "infinitepay",
  "mercadopago_conta", "mercadopago", "nenhum"]`; `ROTULO_MODO.mercadopago_conta = "MERCADO PAGO (SUA CONTA)"`. `planos-regras.ts`:
  `modalidadesDaConta("mercadopago_conta")` = as 3 do MP (mesmo ramo do `mercadopago`). Testes: o pedido com `modo: "mercadopago_conta"` é lido;
  as modalidades iguais às do MP.
- [ ] **Step 2: O contexto do MP da conta no pedido** (perto do `ctxIp`):

```ts
// W2: o contexto do MP DA CONTA — a chave da cifra e o client do OAuth vêm do ambiente; sem a chave, nada do MP da conta funciona (503)
const chaveMp = await chaveDoAmbiente();
const ctxMp = (): ContextoMpConta => {
  if (!chaveMp) falhar("mp_conta_nao_configurado", 503);
  return { schema, log, prazo: prazoDoPedido, chave: chaveMp!, oauth: oauthDoAmbiente(schema) };   // no staging, o client de teste se houver (I6)
};
const mpContaLiberada = async (): Promise<boolean> => {
  if (ehMaster) return true;
  const { data, error } = await db.from("app_config").select("valor").eq("chave", "mercadopago_conta").maybeSingle();
  if (error) throw error;
  return (data as { valor: { liberada?: unknown } | null } | null)?.valor?.liberada === true;
};
```
- [ ] **Step 3: `prof_recebimento` / `recebimentoVista`** — acrescenta (só no schema com a W2; sem → `disponivel: false`):

```ts
mercadopago_conta: w2 ? {
  disponivel: await mpContaLiberada(),
  status: mp?.status ?? null, apelido: mp?.mp_apelido ?? null, expira_em: mp?.mp_expira_em ?? null, erro: mp?.mp_erro ?? null,
  conectado_em: mp?.conectado_em ?? null, chave_publica: !!mp?.mp_public_key, teste: mp?.mp_teste ?? null,
} : { disponivel: false, status: null, apelido: null, expira_em: null, erro: null, conectado_em: null, chave_publica: false, teste: null },
```
(`mp = await integracaoMp(db, c.id)` — NUNCA o token; o `tem_acesso` não sai.) E `mp_liberado` (o MP do Physiq) segue igual.

- [ ] **Step 4: `prof_mp_conectar { conta_id, origem?: "site"|"apk", redirect_teste?: true }`**:

```ts
if (acao === "prof_mp_conectar") {
  const conta = await contaDoRecebimento(body.conta_id);              // dono e master leem — lido COMO A PESSOA
  // MENOR 19: SÓ o dono liga (o desenho D4); o master só na conta em que é dono (o admin.teste da Task 23 continua funcionando) — senão o
  // master ligaria o MP DELE na conta de um personal (às vezes com consentimento automático do MP)
  if (!(await papelNaConta(conta.id)).dono) falhar("so_o_dono", 403);
  if (conta.origem === "app") falhar("conta_do_app", 403);           // a conta do app é o MP do Physiq: nunca OAuth
  if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
  if (!(await mpContaLiberada())) falhar("mp_conta_em_teste", 403);
  // decisão 6 (I8): no APK o fluxo inteiro acontece no SITE, no navegador por cima do app (a sessão do app não chega ao navegador — e a
  // confirmação tem de vir da sessão de quem começou). Nada é criado aqui: o site, logado, chama esta ação de novo com origem "site".
  if (body.origem === "apk") return json({ ok: true, url: `${SITE[schema]}/painel/configuracoes/recebimento?mp=conectar`, no_site: true }, 200, origin);
  const oauth = oauthDoAmbiente(schema);
  if (!oauth || !chaveMp) falhar("mp_oauth_nao_configurado", 503);
  if (!permitido(`mp-conectar:${user.id}`, 10, 3_600_000)) falhar("rate_limited", 429);
  // SÓ staging: o redirect que a aplicação já tem (decisão 3) — a prova e o E2E do OAuth real antes da W2-a
  const redirect = body.redirect_teste === true && schema === "staging" ? REDIRECT_TESTE_MP : redirectDoSchema(schema);
  const estado = novoSegredoUrl(32);
  const verificador = novoSegredoUrl(48);
  const { error } = await db.from("mp_conexoes").insert({
    estado_hash: await sha256Hex(estado), conta_id: conta.id, user_id: user.id, redirect_uri: redirect,
    verificador: await cifrar(verificador, dadoAssociado(schema, conta.id, "pkce"), chaveMp!),
  });
  if (error) throw error;
  const url = urlDeAutorizacao({ base: MP_AUTH_BASE, clientId: oauth!.clientId, redirect, estado,
    desafio: pkceLigado() ? await desafioPkce(verificador) : null });
  log.info({ codigo: "mp_conectar_inicio", schema, acao, ref: conta.id });
  return json({ ok: true, url, expira_em: new Date(Date.now() + ESTADO_MS).toISOString() }, 200, origin);
}
```
(`MP_AUTH_BASE = Deno.env.get("MP_AUTH_BASE") ?? null` — só o simulador local vale; `urlDeAutorizacao` ignora o resto. `SITE` é o mapa que a
`pagamentos-aluno` já tem — o `back_url` da automática usa. O `prof_mp_conectar` NÃO devolve o id da conexão: só a URL do MP — I8.)

- [ ] **Step 4b: `prof_mp_confirmar { conexao_id, confirmar?: true }` — a confirmação de quem começou (revisão I8)**

```ts
if (acao === "prof_mp_confirmar") {
  if (!ehUuidMp(body.conexao_id)) falhar("mp_conexao_invalida", 400);
  if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
  if (body.confirmar !== true) {
    // a pergunta da tela ("Conectar a conta X do Mercado Pago?"): só o apelido, só para QUEM COMEÇOU — a mesma regra da RPC
    const { data, error } = await db.from("mp_conexoes").select("user_id, resultado, usado_em, mp_apelido, live")
      .eq("id", body.conexao_id).maybeSingle();
    if (error) throw error;
    const c = data as { user_id: string; resultado: string | null; usado_em: string | null; mp_apelido: string | null; live: boolean | null } | null;
    if (!c || c.resultado !== "confirmar") falhar("mp_invalido", 409);
    if (c!.user_id !== user.id) falhar("mp_outra_pessoa", 403);
    if (!c!.usado_em || Date.parse(c!.usado_em) < Date.now() - 15 * 60_000) falhar("mp_vencido", 409);
    return json({ ok: true, apelido: c!.mp_apelido, teste: c!.live === false }, 200, origin);
  }
  // a gravação é COMO A PESSOA (jeito 2): a RPC confere auth.uid() = quem começou, sou_dono, 15 min, a flag e o I5 (outra conta com algo aberto)
  const { data, error } = await dbPessoa.rpc("recebimento_mp_confirmar", { p_conexao: body.conexao_id });
  if (error) throw error;
  const r = data as { ok: boolean; resultado?: "ok" | "conectado_sem_trocar"; erro?: string; abertos?: number; apelido?: string | null };
  if (!r.ok) {
    const erro = r.erro ?? "invalido";
    log.aviso({ codigo: "mp_confirmar_recusado", schema, acao, resultado: erro });
    falhar(erro.startsWith("mp_") ? erro : `mp_${erro}`, erro === "outra_pessoa" ? 403 : 409, erro === "outra_conta" ? { abertos: r.abertos ?? 0 } : {});
  }
  log.info({ codigo: "mp_conectado", schema, acao, resultado: r.resultado });
  const contaId = await contaDaConexao(body.conexao_id);              // service_role: conta_id da conexão (para a vista)
  return json({ ok: true, resultado: r.resultado, apelido: r.apelido ?? null, recebimento: await recebimentoVista(await contaDoRecebimento(contaId)) }, 200, origin);
}
```
(`contaDaConexao` = `db.from("mp_conexoes").select("conta_id").eq("id", …).maybeSingle()` com o `if (error) throw error`. Os erros na tela
— Task 15: `mp_outra_pessoa` → o texto `outra_pessoa`; `mp_vencido` → `vencido`; `mp_invalido` → `invalido`; `mp_outra_conta` → `outra_conta`;
`mp_em_outra_conta` (MENOR 29, se ligado) → `mp_em_outra_conta`; `mp_conta_em_teste` → o de sempre; `mp_conta_invalida`/`mp_sem_login` →
`invalido`.)

- [ ] **Step 5: `prof_mp_desconectar { conta_id, cancelar_automaticas? }`**:
  1. `contaDoRecebimento` (dono/master); integração existe e `status <> desconectada` (senão 409 `mp_nao_conectado`);
  2. `ids = await pacientesComAutomaticaViva(db, conta.id)` → `ids.length && !cancelar_automaticas` → 409 `automaticas_ativas { alunos }`;
  3. com o OK: `cancelarAssinaturasPorCredencial(db, { schema, log, prazo: prazoDoPedido }, ctxMp, credencial, ids,
     "personal_desconectou_o_mp")` (ela não lança por causa do MP — MENOR 11) → `semAcesso` → 409 `mp_sem_acesso` ("conecte de novo para
     desligar as automáticas, ou desligue no app do Mercado Pago e fale com o suporte"); `falhas` → 502 `automaticas_nao_canceladas { falhas }`
     (nada mais muda);
  4. **o modo já não é o MP da conta** (o "conectado_sem_trocar": ligou e não salvou a forma — MENOR 10): a troca de modo não aconteceria e o
     gatilho não rodaria → marcar direto (service_role) `update recebimento_integracoes set status = 'desconectada', desconectada_em = now(),
     mp_renovando_ate = null where conta_id = … and provedor = 'mercadopago' and status <> 'desconectada'` (com o `if (error) throw error`);
     **o modo é o MP da conta** → troca o modo COMO A PESSOA (`dbPessoa.from("contas").update({ recebimento_modo: <pix_manual com chave ligada |
     nenhum> })`) — o gatilho marca `desconectada`; o erro `automaticas_ativas` do gatilho (corrida) → 409;
  5. aviso a cada aluno cancelado (o texto da W1: "Seu profissional mudou a forma de receber: a cobrança automática no cartão foi desligada.");
     `conta_eventos` `{w2: "mp_desconectado"}`;
  6. responde o `recebimentoVista`.
- [ ] **Step 6: `prof_recebimento_salvar`** (W1) — `modo: "mercadopago_conta"` só com a integração ativa (senão 409 `mp_nao_conectado`) e a
  flag (403 `mp_conta_em_teste`); o "sair do MP com automática viva" da W1 (`conta.modo === "mercadopago"`) passa a valer para os 2 MPs
  (`["mercadopago", "mercadopago_conta"].includes(conta.modo)`) e cancela por `cancelarAssinaturasPorCredencial` (`semAcesso` → 409
  `mp_sem_acesso`; `falhas` → 502 `automaticas_nao_canceladas` — MENOR 11); o erro do gatilho (`mp_conta_sem_integracao` /
  `automaticas_ativas:<n>`) vira 409 com o código, nunca 500.
- [ ] **Step 7: `prof_mp_simular_conexao { conta_id, chave_publica? }` — SÓ staging, só master (decisão 12; MENOR 16: ela prova a GRAVAÇÃO e
  os caminhos da conta, NÃO que o token da conta chega em cada chamada — collector e token são os do Physiq; quem prova isso é o `--local`)**:

```ts
if (acao === "prof_mp_simular_conexao") {
  if (schema !== "staging") falhar("so_staging", 403);
  if (!ehMaster) falhar("so_master", 403);
  if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
  const conta = await contaDoRecebimento(body.conta_id);
  const token = tokenMp("test");                                      // do ambiente — nada vem do navegador
  if (!token || !chaveMp) falhar("mp_conta_nao_configurado", 503);
  const { status: st, body: eu } = await mpFetch<{ id?: number; nickname?: string }>("test", "/users/me", {}, { prazo: prazoDoPedido });
  if (st !== 200 || !eu?.id) falhar("mp_error", 502, { status_mp: st });
  const chavePublica = typeof body.chave_publica === "string" && /^TEST-[A-Za-z0-9-]{8,72}$/.test(body.chave_publica) ? body.chave_publica : null;
  const { error } = await db.from("recebimento_integracoes").upsert({
    conta_id: conta.id, provedor: "mercadopago", status: "ativa", mp_user_id: eu!.id, mp_apelido: "TESTE (simulada)", mp_public_key: chavePublica,
    mp_access_token: await cifrar(token, dadoAssociado(schema, conta.id, "access"), chaveMp!), mp_refresh_token: null,
    mp_expira_em: new Date(Date.now() + 180 * 86_400_000).toISOString(), mp_teste: true, mp_origem: "teste_sem_oauth", mp_erro: null,
    mp_renovar_tentativas: 0, conectado_em: new Date().toISOString(), desconectada_em: null, atualizado_por: user.id,
  }, { onConflict: "conta_id,provedor" });
  if (error) throw error;
  return json(await recebimentoVista(await contaDoRecebimento(conta.id)), 200, origin);
}
```
- [ ] **Step 8: Testes e commit**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/pagamentos-aluno/index.ts
flock $P npx vitest run --maxWorkers=2 src/financeiro/servidor.test.ts src/financeiro/mpConta.test.ts
git add supabase-principal/functions/pagamentos-aluno/index.ts supabase-principal/functions/_shared/recebimento-regras.ts supabase-principal/functions/_shared/planos-regras.ts src/financeiro/servidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): Recebimento — conectar (state de uso único + PKCE; no APK pelo site), confirmar como quem começou, desconectar e salvar com o Mercado Pago do personal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/pagamentos-aluno/index.ts supabase-principal/functions/_shared/recebimento-regras.ts supabase-principal/functions/_shared/planos-regras.ts src/financeiro/servidor.test.ts
```
  Expected: `deno check` sem erro novo; PASS.

---

### Task 8: Servidor — função nova `mp-conectar-retorno` (a volta do OAuth)

**Files:** Create `supabase-principal/functions/mp-conectar-retorno/index.ts`; Modify `…/_shared/mp-conta.ts` (`guardarParaConfirmar`), `src/lib/logsDasFuncoesPrincipal.test.ts` (+1)
**Estimativa:** 45 a 65 min (pior cenário 105 min)

> **Revisão I8:** a volta NÃO grava mais a integração (antes: `gravarConexao` com service_role, para qualquer navegador que trouxesse um state
> válido — o "login CSRF" do OAuth). Agora ela troca o code e guarda o par CIFRADO na própria conexão (`resultado = 'confirmar'`) e manda o
> navegador para `<SITE>/painel/configuracoes/recebimento?mp=confirmar&c=<id>`; quem grava é o `prof_mp_confirmar` (Task 7) → a RPC
> `recebimento_mp_confirmar` (Task 6), COMO A PESSOA, e só para quem começou. O I5 (trocar de conta com algo aberto) mora na RPC.

- [ ] **Step 1: `guardarParaConfirmar`** (`_shared/mp-conta.ts`):

```ts
/** I8: a volta do MP deu certo (a troca valeu) — guarda o par CIFRADO na própria conexão até a confirmação de quem começou (15 min; a RPC
 *  recebimento_mp_confirmar copia as cifras como estão — o dado associado já é o da integração: physiq:w2:<schema>:<conta>:access|refresh).
 *  MENOR 20: conta de TESTE na produção (ou de verdade no staging) → "conta_de_teste" e nada guardado (o cartão APRO "pagaria" de mentira). */
export async function guardarParaConfirmar(db: SupabaseClient, ctx: ContextoMpConta, con: { id: string; conta_id: string }, t: TokenMp):
  Promise<ResultadoDoRetorno> {
  if (!modoDaConexaoConfere(t.live, ctx.schema)) {
    ctx.log.aviso({ codigo: "mp_conexao_modo_errado", schema: ctx.schema, ref: con.conta_id, resultado: t.live ? "conta_real" : "conta_de_teste" });
    return "conta_de_teste";
  }
  const apelido = await apelidoDoMp(ctx, t.access);   // GET /users/me com o token novo — melhor esforço (null), só o nickname (≤ 80)
  const ad = (campo: "access" | "refresh") => dadoAssociado(ctx.schema, con.conta_id, campo);
  const { error } = await db.from("mp_conexoes").update({
    resultado: "confirmar", mp_user_id: t.userId, mp_apelido: apelido, public_key: t.publicKey, live: t.live,
    renovavel: t.renovavel, token_expira_em: t.expiraEm,
    token_access: await cifrar(t.access, ad("access"), ctx.chave),
    token_refresh: t.refresh ? await cifrar(t.refresh, ad("refresh"), ctx.chave) : null,
  }).eq("id", con.id);
  if (error) throw error;
  return "confirmar";
}
```
(`apelidoDoMp(ctx, access)`: `buscarComTempo(`${baseDoMp()}/users/me`, { headers: { Authorization: `Bearer ${access}` } }, …, ctx.fetch ??
fetch)` → `nickname` string ≤ 80 ou `null` — nunca lança. Import de `modoDaConexaoConfere` e `ResultadoDoRetorno` das regras.)

- [ ] **Step 2: A função**

```ts
// Physiq W2 — mp-conectar-retorno (banco principal): a VOLTA do OAuth do Mercado Pago. O dono tocou em "Conectar com o Mercado Pago"
// (pagamentos-aluno › prof_mp_conectar: o state de uso único em {schema}.mp_conexoes + o PKCE cifrado), entrou na conta dele no MP e
// autorizou; o MP manda o NAVEGADOR para cá:
//   GET https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/<public|staging>?code=TG-…&state=…   (ou ?error=…&state=…)
// Sem JWT (verify_jwt = false). A segurança é o state: 32 bytes aleatórios, só o sha256 no banco, vale 10 min e UMA vez (UPDATE condicional).
// Com o state certo: troca o code no POST /oauth/token (o client das funções; o redirect GRAVADO na conexão; o verifier decifrado;
// test_token "true" só no staging) → guarda o par CIFRADO na própria conexão (resultado 'confirmar') → 302 para o site do schema
// (/painel/configuracoes/recebimento?mp=confirmar&c=<id da conexão>). NÃO grava a integração (revisão I8): quem grava é a confirmação, COMO
// A PESSOA que começou (prof_mp_confirmar → recebimento_mp_confirmar). A volta é FIXA por schema: nada da URL decide para onde vai (sem open
// redirect); o schema vem do CAMINHO (a URI cadastrada no MP é uma por schema). Sempre o site (no APK, o Conectar abre o site — decisão 6).
// Nunca: code, state, verifier ou token no log, na resposta ou na URL de volta (o log leva o id da conta, o resultado e o ms); a resposta leva
// Referrer-Policy: no-referrer (MENOR 15: o site não recebe o Referer com o code e o state).
// Rota pública: limite por IP — ipDoPedido com o PROXY_SEGREDO (o caminho cadastrado é o domínio próprio, pelo Worker api-principal).
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-conectar-retorno false
// Segredos: MP_CLIENT_ID, MP_CLIENT_SECRET (no staging, os _STAGING se existirem), MP_TOKENS_CHAVE, PROXY_SEGREDO (+ os automáticos).
// MP_API_BASE: só no Deno local (o simulador).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { chaveDoAmbiente, dadoAssociado, decifrar } from "../_shared/cifra-mp.ts";
import { ipDoPedido } from "../_shared/entrar-senha-regras.ts";
import { criarLog } from "../_shared/log.ts";
import { guardarParaConfirmar, oauthDoAmbiente, schemaTemW2, trocarCodigo, type ContextoMpConta } from "../_shared/mp-conta.ts";
import { destinoDoRetorno, ehEstado, sha256Hex, type ResultadoDoRetorno, type Schema } from "../_shared/mp-conta-regras.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROXY_SEGREDO = Deno.env.get("PROXY_SEGREDO") ?? null;
const SITE: Record<Schema, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const log = criarLog("mp-conectar-retorno", { avisar: avisarErro });
const clientes = new Map<Schema, SupabaseClient>();
const dbDe = (s: Schema) => clientes.get(s) ?? clientes.set(s, createClient(SUPABASE_URL, SERVICE_ROLE, {
  db: { schema: s as "public" }, auth: { persistSession: false } })).get(s)!;
const janela = new Map<string, number[]>();
function permitido(chave: string, max = 30, ms = 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  if (janela.size > 5000) janela.clear();
  return true;
}
const voltar = (schema: Schema | null, r: ResultadoDoRetorno, conexao?: string) =>
  new Response(null, { status: 302, headers: { Location: destinoDoRetorno(SITE[schema ?? "public"], r, conexao), "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer" } });

Deno.serve(async (req) => {
  const inicio = performance.now();
  const url = new URL(req.url);
  const ultimo = (url.pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
  const schema: Schema | null = ultimo === "public" || ultimo === "staging" ? ultimo : null;
  if (req.method !== "GET" || !schema) return voltar(schema, "invalido");
  if (!permitido(ipDoPedido(req.headers, PROXY_SEGREDO) ?? "sem-ip")) return new Response("muitos pedidos", { status: 429 });
  const estado = url.searchParams.get("state");
  if (!ehEstado(estado)) return voltar(schema, "invalido");
  const db = dbDe(schema);
  try {
    if (!(await schemaTemW2(db, schema))) return voltar(schema, "invalido");
    const hash = await sha256Hex(estado);
    const { data, error } = await db.from("mp_conexoes").update({ usado_em: new Date().toISOString() }).eq("estado_hash", hash)
      .is("usado_em", null).gt("expira_em", new Date().toISOString()).select("id, conta_id, user_id, verificador, redirect_uri").maybeSingle();
    if (error) throw error;
    const con = data as { id: string; conta_id: string; user_id: string; verificador: string; redirect_uri: string } | null;
    if (!con) {
      const { data: velho, error: ev } = await db.from("mp_conexoes").select("usado_em").eq("estado_hash", hash).maybeSingle();
      if (ev) throw ev;
      const v = velho as { usado_em: string | null } | null;
      return voltar(schema, v && !v.usado_em ? "vencido" : "invalido");
    }
    const fim = async (r: ResultadoDoRetorno) => {
      // o "confirmar" já foi gravado pelo guardarParaConfirmar; os outros fecham a conexão aqui
      if (r !== "confirmar") {
        const { error: er } = await db.from("mp_conexoes").update({ resultado: r }).eq("id", con.id);
        if (er) log.excecao(er, { codigo: "mp_conexao_resultado_falhou", schema, ref: con.conta_id });
      }
      log.info({ codigo: "mp_conectar_volta", schema, ref: con.conta_id, resultado: r, ms: Math.round(performance.now() - inicio) });
      return voltar(schema, r, r === "confirmar" ? con.id : undefined);
    };
    if (url.searchParams.get("error")) return await fim("negado");
    const codigo = url.searchParams.get("code") ?? "";
    if (!/^[A-Za-z0-9_-]{8,300}$/.test(codigo)) return await fim("invalido");
    const chave = await chaveDoAmbiente();
    const oauth = oauthDoAmbiente(schema);
    if (!chave || !oauth) {
      log.erro({ codigo: "mp_oauth_nao_configurado", schema, ref: con.conta_id });
      return await fim("falhou");
    }
    const ctx: ContextoMpConta = { schema, log, prazo: prazo(ORCAMENTO_MS.usuario), chave, oauth };
    const verificador = await decifrar(con.verificador, dadoAssociado(schema, con.conta_id, "pkce"), chave);
    const troca = await trocarCodigo(ctx, { codigo, redirect: con.redirect_uri, verificador: Deno.env.get("MP_OAUTH_PKCE") === "0" ? null : verificador,
      teste: schema === "staging" });
    // MENOR 14: o MP recusou (invalid_grant — o code já usado, o PKCE, o redirect) → "invalido" ("Toque em Conectar de novo"); fora → "falhou"
    if (!troca.ok) return await fim(troca.motivo === "recusado" ? "invalido" : "falhou");
    return await fim(await guardarParaConfirmar(db, ctx, con, troca.token));
  } catch (e) {
    log.excecao(e, { schema, acao: "mp_conectar_volta" });
    return voltar(schema, "falhou");
  }
});
```
- [ ] **Step 3: A lista dos logs** — `src/lib/logsDasFuncoesPrincipal.test.ts`: `"mp-conectar-retorno"` no `FUNCOES` (o texto do comentário: "+ a
  mp-conectar-retorno e a mp-contas-renovar (W2)"). Ponto de encontro: avisar no quadro.
- [ ] **Step 4: Verde**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/mp-conectar-retorno/index.ts
flock $P npx vitest run --maxWorkers=2 src/lib/logsDasFuncoesPrincipal.test.ts src/financeiro/mpContaServidor.test.ts
```
  (+ 2 casos no `mpContaServidor.test.ts`: `guardarParaConfirmar` grava as 2 cifras e `resultado 'confirmar'` SEM tocar em
  `recebimento_integracoes`; `live: false` no `public` → `conta_de_teste` e nada gravado.)
- [ ] **Step 5: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add supabase-principal/functions/mp-conectar-retorno/index.ts supabase-principal/functions/_shared/mp-conta.ts src/lib/logsDasFuncoesPrincipal.test.ts src/financeiro/mpContaServidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): função nova mp-conectar-retorno — a volta do OAuth com state de uso único e PKCE guarda o par cifrado até a confirmação de quem começou" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/mp-conectar-retorno/index.ts supabase-principal/functions/_shared/mp-conta.ts src/lib/logsDasFuncoesPrincipal.test.ts src/financeiro/mpContaServidor.test.ts
```

---

### Task 9: Servidor — o token da conta em TODAS as chamadas do MP da `pagamentos-aluno` (+ I5 da W1 no registrar)

**Files:** Modify `supabase-principal/functions/pagamentos-aluno/index.ts` (a base já tem a W1b dentro — Task 0); Test `src/financeiro/servidor.test.ts`
**Estimativa:** 105 a 155 min (pior cenário 225 min) — cresceu com a regra da coluna nova (C2), a conferência da W1b com o collector da conta
(C1), a rede da automática (I1), as leituras que não derrubam a tela (I3), a automática antiga cancelada antes (I11) e os MENORES 20 e 28.

> A lista do spec-review ("W2: o token da conta em TODAS as chamadas"), conferida no código da W1 (`f324f98`; as linhas andam — achar pelo nome).
> **Escrita × leitura (revisão I3):** as ações que CRIAM ou ALTERAM (`aluno_mp_pix|cartao|assinar|cancelar`, `prof_*`) respondem 409
> `mp_conta_indisponivel` quando a conexão do personal caiu; as CONFERÊNCIAS de leitura (`aluno_status`, `prof_aluno`, `aluno_mp_conferir`,
> `detalhe_mp`) nunca: com a integração em `erro` não conferem, e o `MpContaSemAcesso`/`MpIndisponivel` dentro delas vira `log.aviso` + a linha
> do banco — o aluno abre Pagamentos (histórico e "combine com seu profissional") mesmo com a conexão caída.

| Onde | Hoje | W2 |
|---|---|---|
| `colunasCobranca` | `COLUNAS_COBRANCA_IP` com a W1 | `COLUNAS_COBRANCA_W2` com a W2 (e o `select(COLUNAS_COBRANCA)` do `linhaParaMp`/Pix aberto/`prof_registrar` também por ela) |
| `assinaturaDe` (`aluno_assinaturas`, :591-597) | as colunas fixas | **`colunasAssinatura(db, schema)`** (C2): a `mp_collector_id` só entra com a W2 no schema — sem isso, entre a Task 14 e a 22 todo `aluno_status`/`prof_aluno` do `public` dava 500; e sem a coluna no select, a automática da conta caía no token do Physiq |
| `conferir(c, m)` (`GET /v1/payments`) | `credencial` + o `pagamentoDaLinha` da W1b (sem lançar: diferente → não aplica e loga) | `credencialDaCobranca(db, ctxMp, c, credencial, { leitura: true })`; `null` → devolve `c` sem conferir; o `pagamentoDaLinha` da W1b FICA (com a credencial escolhida e o collector — abaixo); dentro do `lerSemDerrubar` (I3) |
| `conferirAssinatura` (`GET /preapproval`) | `credencial`; só espelha o status | `credencialDaAssinatura(…, { leitura: true })` (`null` → a linha do banco); depois do espelho, `authorized` → **`registrarCobrancasDaAutomatica`** (I1 — os 2 MPs, a credencial da assinatura, `colunasW2: await comCollector(db, schema, collectorDe(cred))`); tudo dentro do `lerSemDerrubar` |
| `exigirMp(m)` | só `mercadopago` | `credencialParaPagar(m)`: `mercadopago` → a do Physiq; `mercadopago_conta` → `credencialDaConta` (ativa; `MpContaSemAcesso` → 409 `mp_conta_indisponivel`); outro → 400 `modo_nao_mercadopago` |
| `linhaParaMp` (antes do MP) | sem a coluna | o insert leva `...(await comCollector(db, schema, collectorDe(cred)))` (C2) |
| `aluno_mp_pix` / `aluno_mp_cartao` | `credencial`, `notificacao` fixa | a credencial de `credencialParaPagar`; `notification_url = notificacaoDaConta(schema, contaId)` na conta; a linha nasce com o collector (`linhaParaMp(…, cred)` → `comCollector`); o Pix aberto antigo fecha com a credencial DELE (`credencialDaCobranca(atual, { escrita: true })`) e só depois do `pagamentoDaLinha` da W1b (sem lançar — o laço de :1043-1061); `erroPixSemChave` → 400 `mp_conta_sem_chave_pix` + `avisarDonoDaConexao`; **MENOR 20:** o `aluno_mp_cartao` só aplica a resposta do `POST` (hoje :1117, sem conferir o modo) com `modoConfere(credencialDoSchema(schemaDaCredencialMp(cred)), pay)` — pagamento de sandbox no `public` (ou real no `staging`) → `log.erro` + 502 `mp_error`, nada aplicado |
| `aluno_mp_assinar` | `credencial`; a antiga cancelada sem conferir e a linha reaproveitada (:1131-1136, :1162-1164) | a de `credencialParaPagar`; **I11** (código abaixo): antes do `POST /preapproval`, a antiga viva é cancelada com a credencial DELA e só segue com o GET de conferência em `cancelled` — credencial `null` (outra conta/desconectada) ou falha → 409 `assinatura_antiga_viva`, sem POST; insert/update com `...(await comCollector(…))` (C2: o PGRST204 aqui vinha DEPOIS do POST = automática em dobro); **MENOR 28:** a rede do sandbox (:1151) testa `schemaDaCredencialMp(cred) === "staging"` (com a credencial da conta, `credencial === "test"` nunca ligava → 502 em vez da pendente) |
| `aluno_mp_cancelar` / `prof_cancelar_assinatura` | `credencial` | `credencialDaAssinatura(a, { escrita: true })` (`null` → 409 `mp_outra_conta`) |
| `cancelarAutomatica` / `sincronizarAutomatica` (`trocarValorDaAutomatica`) | `credencial` | `credencialDaAssinatura(a, { escrita: true })` |
| `aluno_mp_conferir` | `credencial` | `credencialDaCobranca(c, { leitura: true })` dentro do `lerSemDerrubar` (I3); `simular_aprovacao` (staging) → `credencialDaCobranca(c)` |
| `detalhe_mp` | `credencial` + o `pagamentoDaLinha`/`exigirDaCobranca` da W1b (409 `cobranca_de_outro_pagamento`) | `credencialDaCobranca(c, { leitura: true })`; `null` → `{ ok: true, mp: null, motivo: "outra_conta_mp" }`; **o `pagamentoDaLinha` da W1b FICA** (C1) com a credencial escolhida e, na conta, o collector (abaixo) |
| `prof_cobranca_cancelar` | `credencial` + o `pagamentoDaLinha` da W1b antes do `PUT` | `credencialDaCobranca(c, { escrita: true })` + **o `pagamentoDaLinha` da W1b com a credencial e o collector** antes do `PUT` (C1) |
| `prof_reembolsar` | `credencial` + o `pagamentoDaLinha` da W1b antes do `/refunds` | `credencialDaCobranca(c, { escrita: true })` + **o `pagamentoDaLinha` da W1b com a credencial e o collector** antes do `/refunds` (C1: o estorno do plano alheio com o token do Physiq — e, com a conta, com o token de OUTRO personal — não passa); `null` com a integração desconectada → 409 `mp_reembolso_pelo_app_do_mp` |
| `aluno_status` / `prof_aluno` (`=== "mercadopago"` para conferir; :895, :899, :1640) | só `mercadopago` | os 2 MPs (`ehModoMp(modo)`); as conferências daqui são de LEITURA (I3) |
| `aluno_status` (a resposta) | — | `mp: { disponivel, chave_publica }` na matrícula do `mercadopago_conta` (`integracaoMp`; a chave é pública; `disponivel` = integração `ativa`) |
| `aluno_app_plano`, `cancelarAssinaturasDoAppEncerrado` | a do Physiq | **não mudam** (conta do app = MP do Physiq) |

- [ ] **Step 1: Os ajudantes** — `ehModoMp = (m?: string|null) => m === "mercadopago" || m === "mercadopago_conta"`; `credencialParaPagar(m)`
  (acima); `collectorDe` (do `mp-conta.ts`); `notificacaoDe(cred)` (Physiq → a URL de hoje; conta → `notificacaoDaConta`); toda ida ao MP passa
  por um `mp(cred, caminho, init)` local: `typeof cred === "string" ? mpFetch(cred, caminho, init, { prazo: prazoDoPedido }) : mpContaFetch(db,
  ctxMp(), cred, caminho, init)` — o `ctxMp()` (que exige a `MP_TOKENS_CHAVE`) só é chamado no caminho da conta, então o MP do Physiq segue
  funcionando mesmo sem ela; os `credencialDa*` recebem o `ctxMp` como GETTER pelo mesmo motivo. E o de leitura (I3):
```ts
/** I3: conferência de LEITURA — a conexão do personal caída (ou o MP fora) não derruba a resposta: log.aviso e a linha do banco. */
const lerSemDerrubar = async <T>(ref: string, ler: () => Promise<T>, doBanco: T): Promise<T> => {
  try {
    return await ler();
  } catch (e) {
    if (!(e instanceof MpContaSemAcesso) && !(e instanceof MpIndisponivel)) throw e;   // erro do banco: o 500 de sempre
    log.aviso({ codigo: "mp_conferir_sem_mp", schema, acao, ref, resultado: e instanceof MpContaSemAcesso ? e.motivo : "mp_fora" });
    return doBanco;
  }
};
```
  `MpContaSemAcesso` no catch final → 409 `mp_conta_indisponivel` (nunca 500) — só as ações que criam/alteram chegam lá.
  **O `pagamentoDaLinha(c, m)` da W1b** (o `GET /v1/payments/{id}` + a regra `pagamentoEDaCobranca`) passa a receber a credencial escolhida
  (`pagamentoDaLinha(c, m, cred)`: o `GET` vai pelo `mp(cred, …)`) e, quando a credencial é da CONTA, soma `Number(pay.collector_id) ===
  cred.collectorId` à conferência (`c1-verificacao.md` §5.2, item 4: no MP do Physiq o `GET` 200 já prova a conta; na do personal o collector
  amarra também o token de OUTRO personal — I8 da revisão); a regra pura `pagamentoEDaCobranca` não muda.
- [ ] **Step 2: Trocar cada linha da tabela** — uma por vez, com o `deno check` entre elas. O `aluno_mp_assinar` (I11 + C2 + MENOR 28):
```ts
const atual = await assinaturaDe(m.id);                    // colunasAssinatura (C2)
if (atual?.mp_preapproval_id && ["authorized", "pending", "paused"].includes(atual.status) && !simulado(atual.mp_preapproval_id)) {
  // I11: a antiga é cancelada com a credencial DELA (pode ser do MP do Physiq ou de outra conta do personal) e CONFERIDA — senão ela some do
  // banco (a linha é reaproveitada abaixo) e segue cobrando no MP: o aluno pagaria 2 automáticas
  const credAntiga = await credencialDaAssinatura(db, ctxMp, atual, credencial, { escrita: true });
  if (!credAntiga) falhar("assinatura_antiga_viva", 409);  // outra conta do MP / desconectada: o Physiq não alcança
  const caminho = `/preapproval/${encodeURIComponent(atual.mp_preapproval_id)}`;
  const { status: sa, body: pre } = await mp<AssinaturaMp>(credAntiga!, caminho);
  if (sa === 200 && pre?.status === "authorized" && atual.payload?.sandbox !== true) falhar("assinatura_ja_ativa");
  if (sa === 200 && pre?.status !== "cancelled") {
    await mp(credAntiga!, caminho, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    const { status: s2, body: depois } = await mp<AssinaturaMp>(credAntiga!, caminho);
    if (s2 !== 200 || depois?.status !== "cancelled") {
      log.erro({ codigo: "mp_assinatura_antiga_viva", schema, acao, ref: m.id, status: s2 });
      falhar("assinatura_antiga_viva", 409);
    }
  } else if (sa !== 200 && sa !== 404) {
    falhar("assinatura_antiga_viva", 409);                 // sem resposta que decida: não cria outra por cima
  }
}
// … o POST /preapproval com a credencial de credencialParaPagar(m) (cred) …
if (!checkout && (st >= 300 || !pre?.id) && schemaDaCredencialMp(cred) === "staging" && recusaDoSandbox(st, pre)) { /* a pendente de hoje */ }
const linha = { paciente_id: m.id, conta_id: m.conta_id, valor, ...(await comCollector(db, schema, collectorDe(cred))),
  ...espelhoAssinaturaAluno(pre!, { sandbox, checkout, inicio, criada_por: user.id }) };
```
- [ ] **Step 3: I5 da W1 no `prof_registrar` (decisão 15)** — a mensalidade com um Pix do MP `aguardando` (forma `mp`, tipo `mensalidade`, não vencido):
  a MESMA linha vira `paga`/`manual` (como a W1 faz com a InfinitePay) e o Pix é cancelado no MP (`PUT /v1/payments/{id} {status: cancelled}`,
  melhor esforço, com a credencial da linha — `credencialDaCobranca(c, { escrita: true })`; `null` → não cancela, só registra). A aprovação
  atrasada do MP cai em "paga é final" no `aplicarPagamentoMp` (já é assim). A gravação da linha `paga` é pelo servidor: a guarda da W1b não
  segura (ela só vale para o app).
- [ ] **Step 4: Verde**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/pagamentos-aluno/index.ts
flock $P npx vitest run --maxWorkers=2 src/financeiro
rg -n 'mpFetch\(credencial' supabase-principal/functions/pagamentos-aluno/index.ts
rg -n 'mp_collector_id' supabase-principal/functions/pagamentos-aluno/index.ts
rg -n 'credencial === "test"|credencial === "prod"' supabase-principal/functions/pagamentos-aluno/index.ts
```
  Expected: `deno check` sem erro novo; PASS; o 1º `rg` só nas linhas da conta do app (`aluno_app_plano`) e do `cancelarAssinaturasDoAppEncerrado`; o
  2º, NENHUMA linha (a coluna só entra pelos ajudantes do `mp-conta.ts` — C2) ou só linhas com `// W2: depois do schemaTemW2`; o 3º, só as do
  MP do Physiq que não recebem a credencial da conta (o `pagador` de :294 vira `schemaDaCredencialMp(cred) === "staging"` no caminho da conta).
- [ ] **Step 5: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add supabase-principal/functions/pagamentos-aluno/index.ts src/financeiro/servidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): o token da conta em todas as chamadas do Mercado Pago do aluno — Pix, cartão, automática (a antiga cancelada antes), conferir sem derrubar a tela, detalhe, cancelar e reembolsar com a conferência da W1b" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/pagamentos-aluno/index.ts src/financeiro/servidor.test.ts
```

---

### Task 10: Servidor — `mp-webhook-aluno` por conta + `automaticas-fila` + exclusão do personal

**Files:** Modify `supabase-principal/functions/mp-webhook-aluno/index.ts`, `…/automaticas-fila/index.ts`, `…/_shared/exclusao-profissional.ts`
**Estimativa:** 80 a 125 min (pior cenário 175 min) — cresceu com o caminho pelo `user_id` (I1, MENOR 5), o fim do cache (I4), o corpo lido com
limite (MENOR 4), os tetos separados (MENORES 6 e 26), o prazo de 18 s (MENOR 34) e a regra da coluna nova na fila (C2).

- [ ] **Step 1: O webhook** — os ajudantes que a `mp-webhook-aluno` NÃO tem hoje (MENOR 3): `permitidoIp`/`permitidoConta` (2 Maps
  separados, o molde do `permitido` da `mp-conectar-retorno`, cada um com o seu `clear()` aos 5.000 — MENOR 26: POSTs com uuids inventados não
  zeram o contador do IP), `PROXY_SEGREDO` (`Deno.env.get("PROXY_SEGREDO") ?? null`), `JSON_H` e `resposta(http, resultado)` (o `ok()` de
  hoje fica para o 200); `lerAte` = cópia das 25 linhas do `lerCorpo` de `_shared/erro-avisar-regras.ts:260-285` (lá não é exportado; o
  arquivo não muda). **Importar, não recriar:** `ipDoPedido` (`_shared/entrar-senha-regras.ts:50`) e `idDoAvisoValido`
  (`_shared/cobranca-regras.ts:246`). A entrada do `Deno.serve` passa a ser:

```ts
    // MENOR 4: o corpo é MEDIDO antes de ler — o `await req.json()` de hoje lia tudo, e o content-length pode faltar (chunked)
    const texto = await lerAte(req, 16_384);
    if (texto === null) return resposta(413, "corpo_grande");
    let corpo: Record<string, unknown> = {};
    try {
      corpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      corpo = {}; // IPN antigo: tudo na query
    }
    const ip = ipDoPedido(req.headers, PROXY_SEGREDO) ?? "sem-ip";
    const daConta = lerAvisoDaConta(url, corpo);
    if (daConta) {
      if (!schema) return ok("schema_invalido");
      // MENOR 6: o teto por IP só para o que vem SEM user_id (os avisos de TODOS os personais saem de poucos IPs do MP)
      if (daConta.userId === null && !permitidoIp(ip)) return resposta(429, "limite");
      const r = await tratarDaConta(req, url, schema, daConta, prazo(18_000));   // MENOR 34: o MP espera 22 s
      return resposta(r.http, r.resultado);
    }
    // I1 + MENOR 5: SEM &conta= (a URL do PAINEL — o mp-connect e, talvez, a cobrança mensal da automática) com o user_id de uma integração
    // conhecida que NÃO é a conta do Physiq → o caminho da conta; nenhuma conta bateu → o caminho de hoje (o MP do Physiq), igual
    if (schema) {
      const r = await pelaContaDoUserId(req, url, schema, corpo, ip);
      if (r) return resposta(r.http, r.resultado);
    }
    // … daqui para baixo, o caminho de hoje (o `dados`, o `topico`, o `id` e os 3 tratar*) sem mudança …
```
  E as 2 funções novas no mesmo arquivo:

```ts
// W2 — o aviso de um pagamento/assinatura NA CONTA do personal (?conta=<uuid>, ou o user_id de uma integração pela URL do painel — I1). O
// aviso nunca é a verdade (como o caminho de hoje): o recurso é buscado com o token DA CONTA; vale só se o collector é o da integração, o
// live_mode é o do schema e a referência é de um aluno DESSA conta. 500 no que não dá para decidir (o MP manda de novo): MP fora, conta em
// erro, schema sem a W2 (MENOR 4 da W1). SEM cache de "repetido" (revisão I4: o payment.created e o payment.updated do MESMO id chegam em
// segundos, e o reenvio depois de um 500 também cairia nele) — o tratamento é idempotente e o teto por conta segura a enxurrada.
async function tratarDaConta(req: Request, url: URL, schema: Schema, a: AvisoDaConta, p: Prazo): Promise<{ http: number; resultado: string }> {
  const db = dbDe(schema);
  if (!(await schemaTemW2(db, schema))) return { http: 500, resultado: "schema_sem_w2" };
  const integ = await integracaoMp(db, a.conta);
  if (!integ?.tem_acesso) return { http: 200, resultado: "conta_sem_mp" };              // nenhuma ida ao MP para conta que não é nossa
  if (!permitidoConta(a.conta, 60)) return { http: 429, resultado: "limite" };            // MENOR 26: só conta DEPOIS de achada a integração
  const assinatura = await assinaturaMp({ cabecalho: req.headers.get("x-signature"), requestId: req.headers.get("x-request-id"),
    dataId: url.searchParams.get("data.id"), segredo: Deno.env.get("MP_WEBHOOK_ASSINATURA") });
  if (assinatura !== "valida" && (await exigeAssinatura(db))) {
    log.aviso({ codigo: "aviso_mp_conta_sem_assinatura", schema, ref: a.conta, resultado: assinatura });
    return { http: 401, resultado: "assinatura" };
  }
  // I4: o user_id NÃO decide — quem forja manda o certo ou nenhum, e nada garante o campo nos tópicos de assinatura; quem decide é o collector
  if (a.userId !== null && a.userId !== integ.mp_user_id) log.aviso({ codigo: "aviso_mp_conta_user_id_diferente", schema, ref: a.conta });
  if (integ.status === "erro") return { http: 500, resultado: "conta_em_erro" };         // quando o dono reconectar, o reenvio entra
  const ctx = await contextoMp(schema, p);                                                // sem a MP_TOKENS_CHAVE → MpContaSemAcesso → 500
  if (a.topico === "mp-connect") return await conferirAcesso(db, ctx, a.conta);          // MENOR 5 (abaixo)
  if (!idDoAvisoValido(a.topico, a.id)) return { http: 200, resultado: "sem_id" };
  try {
    const cred = await credencialDaConta(db, ctx, a.conta, { exigirAtiva: false, renovar: false });   // desconectada < 7 dias: só leitura
    // payment → buscarNaConta(db, ctx, cred, `/v1/payments/${id}`, { renovar: false }) → null → 200 "nao_achado" (I2: o 401 de recurso
    //   alheio; nada muda na integração) → collector_id === integ.mp_user_id → lerReferenciaAluno → paciente.conta_id === a.conta (senão
    //   "referencia_de_outra_conta") → com cobrancaId: a cobrança (mp_collector_id === integ.mp_user_id; mp_payment_id igual ou vazio, como
    //   o caminho de hoje) → aplicarPagamentoMp; recorrente → registrarPagamentoAvulsoDoMp(db, m, pay, { preapprovalId, origem: "assinatura",
    //   colunasW2: await comCollector(db, schema, integ.mp_user_id) }, log, schema)
    // subscription_preapproval → buscarNaConta(`/preapproval/${id}`) → collector_id → o espelho (a linha de hoje) ou o insert com o comCollector
    // subscription_authorized_payment → buscarNaConta(`/authorized_payments/${id}`) → o payment acima
    // log.info({ codigo: "aviso_mp_conta", schema, acao: a.topico, ref: a.id, resultado, msg: `assinatura ${assinatura}` })
  } catch (e) {
    if (e instanceof MpContaSemAcesso) return { http: 500, resultado: "conta_sem_acesso" };   // o job renova/marca; o reenvio entra depois
    if (e instanceof MpIndisponivel) return { http: 500, resultado: "mp_fora" };
    throw e;                                                                              // banco: o catch final de hoje (500 + aviso)
  }
}

/** I1 + MENOR 5: o aviso SEM &conta= com o user_id de uma integração conhecida. NUNCA a conta do Physiq (lida 1× por GET /users/me com o
 *  token do schema e guardada na instância): no teste de produção (Task 23) a conta do MP DELE é a dona da aplicação E a da integração do
 *  admin.teste — sem esta trava, os avisos do MP do Physiq iriam para a conta do admin.teste. Mais de uma conta do Physiq com a mesma conta
 *  do MP → tenta cada uma até a referência bater. Nenhuma bateu → null (o caminho de hoje). */
async function pelaContaDoUserId(req: Request, url: URL, schema: Schema, corpo: Record<string, unknown>, ip: string):
  Promise<{ http: number; resultado: string } | null> {
  const userId = Number(corpo.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const db = dbDe(schema);
  if (!(await schemaTemW2(db, schema))) return null;
  const physiq = await collectorDoPhysiq(schema);                                         // null = o MP não respondeu: não arrisca
  if (physiq === null || physiq === userId) return null;
  const { data, error } = await db.from("recebimento_integracoes").select("conta_id").eq("provedor", "mercadopago")
    .eq("mp_user_id", userId).not("mp_access_token", "is", null).limit(5);
  if (error) throw error;
  const contas = ((data ?? []) as Array<{ conta_id: string }>).map((x) => x.conta_id);
  if (!contas.length) return null;
  if (!permitidoIp(ip)) return { http: 429, resultado: "limite" };
  const base = lerAvisoDoMp(url, corpo);                                                  // { topico, id, userId } — o lerAvisoDaConta sem a conta
  let ultimo: { http: number; resultado: string } | null = null;
  for (const conta of contas) {
    ultimo = await tratarDaConta(req, url, schema, { ...base, conta }, prazo(18_000));
    if (ultimo.resultado !== "referencia_de_outra_conta") return ultimo;
  }
  return ultimo;
}
```
  Ajudantes pequenos no mesmo arquivo: `exigeAssinatura` — a flag `mp_webhook` lida e guardada 60 s; `collectorDoPhysiq(schema)` — `mpFetch(
  credencialDoSchema(schema), "/users/me")` → o `id` guardado num `Map` por instância (falhou → `null`, sem guardar); `conferirAcesso(db, ctx,
  conta)` (o `mp-connect`, MENOR 5) — `GET /users/me` com o token da conta: 200 → `{200, "acesso_ok"}`; 401 → `marcarErro(…, "acesso_revogado")`
  SEM renovar (a revogação apaga os tokens e o grant — a doc de gestão do OAuth) → `{200, "acesso_revogado"}`; 5xx → `{500, "mp_fora"}`;
  `contextoMp(schema, p)` — a `MP_TOKENS_CHAVE` (`chaveDoAmbiente()`; sem ela → `throw new MpContaSemAcesso("-", "nao_configurado")`) + o
  `oauthDoAmbiente(schema)`. Nas regras (`mp-conta-regras.ts`, Task 2): `lerAvisoDoMp(url, corpo)` = o `lerAvisoDaConta` sem a conta (o
  `lerAvisoDaConta` passa a usá-lo). O `PROXY_SEGREDO`: o aviso chega pelo domínio próprio — o Worker manda o IP de verdade.
- [ ] **Step 2: `automaticas-fila`** — `assinaturaDoAluno` lê por `colunasAssinatura(r.db, schema)` (C2: a `mp_collector_id` só com a W2 no
  schema) + `conta_id`; por pendência, `cred = await credencialDaAssinatura(r.db, ctxMp, a, r.credencial, { escrita: true })` → `null`/
  `MpContaSemAcesso` = `resultado "falhou"`, `erro "mp_conta_sem_acesso"` (a fila tenta de hora em hora; na 24ª desiste e avisa — o de hoje);
  senão `assinaturaComoNoMp(r.db, cred, …)` e `trocarValorDaAutomatica(r.db, cred, …)` (a `CredencialMp` da Task 4 — MENOR 2). O `ctxMp` é um
  getter que precisa da `MP_TOKENS_CHAVE` (sem ela, lança `MpContaSemAcesso(…, "nao_configurado")`: as da conta falham com o código acima; as do
  Physiq seguem).
- [ ] **Step 3: Exclusão do personal** — `exclusao-profissional.ts › cancelarDosAlunos: (ids) => cancelarAssinaturasPorCredencial(db, { schema:
  p.schema, log: p.log, prazo: mp.prazo! }, ctxMp, credencial, ids, "profissional_excluiu_a_conta")` → `{ canceladas, falhas: falhas + semAcesso }`
  (sem acesso ao MP da conta = a falha de sempre: 502 `cobranca_nao_cancelada` e nada é apagado — o personal reconecta ou fala com o suporte;
  Risco 7). O `try/catch` do `MpIndisponivel` que está lá (:141-148) pode ficar: a função nova já não lança por causa do MP (MENOR 11).
- [ ] **Step 4: Verde**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
for f in mp-webhook-aluno automaticas-fila excluir-minha-conta; do DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/$f/index.ts; done
flock $P npx vitest run --maxWorkers=2 src/financeiro src/nucleo/cobranca/avisosMp.test.ts
```
  (o `cobranca-regras.ts` não mudou). Commit:
```bash
cd ~/projetos/physiqcalc-w2 && git add supabase-principal/functions/mp-webhook-aluno/index.ts supabase-principal/functions/automaticas-fila/index.ts supabase-principal/functions/_shared/exclusao-profissional.ts supabase-principal/functions/_shared/mp-conta-regras.ts src/financeiro/mpConta.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): o aviso do Mercado Pago por conta (collector, referência da conta, x-signature, teto, o user_id do painel) e a fila e a exclusão com a credencial de cada assinatura" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/mp-webhook-aluno/index.ts supabase-principal/functions/automaticas-fila/index.ts supabase-principal/functions/_shared/exclusao-profissional.ts supabase-principal/functions/_shared/mp-conta-regras.ts src/financeiro/mpConta.test.ts
```

---

### Task 11: Servidor — função nova `mp-contas-renovar` (+ o diário) + a chave dos tokens e o S10

**Files:** Create `supabase-principal/functions/mp-contas-renovar/index.ts`; Modify `scripts/segredos/mp_conta.py` + `scripts/segredos/test_mp_conta.py`
(da Task 0b), `scripts/segredos/servidor.py`, `src/lib/logsDasFuncoesPrincipal.test.ts` (+1)
**Estimativa:** 55 a 90 min (pior cenário 130 min) — cresceu com a conferência diária (I1 + MENOR 27) e a trava do `chave gerar` (I10); o
`oauth` e os usuários de teste já saíram na Task 0b (I9).

- [ ] **Step 1: A função** (o molde da `automaticas-fila`):

```ts
// Physiq W2 — mp-contas-renovar (banco principal): renova o acesso do Mercado Pago das contas (o OAuth vale 180 dias; o refresh GIRA a cada
// renovação) e, 1×/dia por integração ativa, CONFERE a conta (mp_conferido_em): GET /users/me (o acesso tirado no MP é descoberto sem esperar
// um aluno pagar — MENOR 27) e a busca das cobranças das automáticas da conta (a rede do I1: a cobrança do mês que o aviso não trouxe).
// Quem chama: {schema}.mp_contas_renovar_disparar() pelo pg_net, de hora em hora (pg_cron mp-renovar-<schema>, minuto 41), só quando há o que
// fazer. POST { schema, forcar_conta? } — forcar_conta SÓ no staging (o E2E da renovação de verdade).
// Por rodada: até 50 integrações oauth ativas que vencem em < 30 dias (e com a próxima tentativa na hora), 5 por vez, cada uma pela
// renovarConta (_shared/mp-conta.ts: a trava de 2 min, a gravação condicional, recusada → aviso "reconecte até dd/mm" ou erro, MP fora → espera
// crescente); as que JÁ venceram ainda "ativas" → marcarErro("vencido") + aviso; depois, até 50 ativas com mp_conferido_em nulo ou de > 1 dia,
// 5 por vez, pela conferirConta.
// Segredo (S10 · contrato hml-16c): RECEBE o do Vault physiq_mp_renovar_segredo no x-espelho-segredo; aqui só o hash
// (SEGREDO_MP_RENOVAR_ACEITOS). Sem ou errado → 401. Trocar: scripts/segredos/servidor.py mp_renovar.
// + MP_CLIENT_ID, MP_CLIENT_SECRET (no staging, os _STAGING se existirem), MP_TOKENS_CHAVE (sem algum → 500 nao_configurada, antes de mexer
// em qualquer conta).
// verify_jwt = false. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-contas-renovar false
// Log: só ids de conta e resultados; a resposta, só contagens.
```
  Corpo: segredo → schema → `chave`/`oauthDoAmbiente(schema)` → `forcar_conta` (staging) ou a lista (`.eq("provedor","mercadopago").eq("mp_origem",
  "oauth").eq("status","ativa").lt("mp_expira_em", +30d).or("mp_renovar_proxima_em.is.null,mp_renovar_proxima_em.lte.<agora>").order("mp_expira_em")
  .limit(50)`) → grupos de 5 com `Promise.all` e `renovarConta` → as vencidas (`.lt("mp_expira_em", agora)`) → `marcarErro(…, "vencido")` → **o
  diário**: `.eq("provedor","mercadopago").eq("mp_origem","oauth").eq("status","ativa").or("mp_conferido_em.is.null,mp_conferido_em.lt.<agora-1d>")
  .order("mp_conferido_em", { nullsFirst: true }).limit(50)` → grupos de 5 com `conferirConta` (Task 4; `MpIndisponivel` numa conta não para as
  outras — conta em `fora`) → responde `{ renovadas, outras, recusadas, fora, ocupadas, vencidas, conferidas, cobrancas_da_rede }`. Orçamento
  `ORCAMENTO_MS.loteEspelho`; sobrou → a próxima hora pega (o diário vem DEPOIS da renovação: sem tempo, fica para a hora seguinte).
- [ ] **Step 2: S10 no `servidor.py`** — a finalidade nova no molde do S9:
```python
Finalidade("mp_renovar", "S10", "SEGREDO_MP_RENOVAR", "principal", "principal", (), ("mp-contas-renovar",),
           vault="physiq_mp_renovar_segredo", arquivo=".physiq-segredo-mp-renovar", disparo="mp_contas_renovar_disparar",
           ciclo="pg_cron de hora em hora, no minuto 41", descricao_vault=DESCRICAO_VAULT_S10,
           rotulo="Physiq — renovação do MP do personal (W2)", origem="W2 (Mercado Pago do personal)"),
```
  (+ a linha S10 na tabela do cabeçalho e o `DESCRICAO_VAULT_S10`). O `src/lib/segredoServidor.test.ts` confere as finalidades: +1 caso.
- [ ] **Step 3: `scripts/segredos/mp_conta.py` — `chave gerar|conferir` e `assinatura copiar|conferir`** (o script da Task 0b; mesmo jeito: só
  ✅/❌, sha8 e tamanho):
```python
ITEM_CHAVE = "Physiq — chave dos tokens do MP do personal (W2)"
ITEM_ASSINATURA = "Mercado Pago — PhysiqCalc — assinatura dos avisos (W2)"


def chave_gerar(r: S.Remoto, a: argparse.Namespace) -> int:
    """I10 da revisão: SÓ cria quando a MP_TOKENS_CHAVE não existe em lugar nenhum. Existindo igual nas 2 pontas → ✅ "já existe" e sai 0, sem
    gerar; só num lado, ou diferente → ❌ e para. Gerar de novo por cima apagaria o acesso de TODOS os personais (o código só conhece a v1, e
    os segredos das funções valem para o staging e o public juntos). Trocar a chave é outro comando (chave trocar), fora da W2."""
    no_cofre = dict(ler_item(r, ITEM_CHAVE) or []).get("valor")
    nas_funcoes = r.segredos("principal").get("MP_TOKENS_CHAVE")
    if no_cofre and nas_funcoes:
        igual = nas_funcoes == S.sha256_hex(no_cofre)
        S.ok(igual, "a MP_TOKENS_CHAVE já existe" + (" e as funções = o cofre: nada a fazer" if igual else " e as funções ≠ o cofre — PARAR (não gerar)"))
        return 0 if igual else 1
    if no_cofre or nas_funcoes:
        S.ok(False, "a MP_TOKENS_CHAVE existe só " + ("no cofre" if no_cofre else "nas funções") + " — PARAR: conferir à mão (gerar apagaria o acesso)")
        return 1
    nova = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    S.guardar(nova)
    if a.dry_run:
        S.nota("--dry-run: geraria a chave (32 bytes) → cofre → funções")
        return 0
    erro, texto = r._mcp().ferramenta("salvar_segredo", {"projeto": S.PROJETO_COFRE, "nome": ITEM_CHAVE, "tipo": "token", "campos": {
        "valor": nova, "notas": "W2: AES-256-GCM dos tokens do MP do personal (v1). Perder ou trocar = todos os personais reconectam."}})
    if erro:
        raise S.Falha(f"cofre: salvar \"{ITEM_CHAVE}\" falhou — {texto[:120]}")
    if dict(ler_item(r, ITEM_CHAVE) or []).get("valor") != nova:
        S.ok(False, "o cofre não devolveu a chave igual — nada foi para as funções")
        return 1
    r.gravar_segredo("principal", "MP_TOKENS_CHAVE", nova)              # PRIMEIRO no cofre, DEPOIS nas funções
    return chave_conferir(r, a)


def chave_conferir(r: S.Remoto, a: argparse.Namespace) -> int:
    no_cofre = dict(ler_item(r, ITEM_CHAVE) or []).get("valor")
    certo = bool(no_cofre) and r.segredos("principal").get("MP_TOKENS_CHAVE") == S.sha256_hex(no_cofre or "")
    return 0 if S.ok(certo, f"MP_TOKENS_CHAVE nas funções = o cofre ({len(no_cofre or '')} caracteres, sha8 {S.sha8(no_cofre or '')})") else 1


def assinatura_copiar(r: S.Remoto, a: argparse.Namespace) -> int:
    valor = dict(ler_item(r, ITEM_ASSINATURA) or []).get("valor")
    if not valor:
        return 0 if S.ok(False, f"sem \"{ITEM_ASSINATURA}\" no cofre (W2-a, passo 6)") else 2
    if not a.dry_run:
        r.gravar_segredo("principal", "MP_WEBHOOK_ASSINATURA", valor)
    return 0 if a.dry_run else assinatura_conferir(r, a)


def assinatura_conferir(r: S.Remoto, a: argparse.Namespace) -> int:
    valor = dict(ler_item(r, ITEM_ASSINATURA) or []).get("valor") or ""
    certo = bool(valor) and r.segredos("principal").get("MP_WEBHOOK_ASSINATURA") == S.sha256_hex(valor)
    return 0 if S.ok(certo, f"MP_WEBHOOK_ASSINATURA nas funções = o cofre (sha8 {S.sha8(valor)})") else 1


COMANDOS |= {("chave", "gerar"): chave_gerar, ("chave", "conferir"): chave_conferir,
             ("assinatura", "copiar"): assinatura_copiar, ("assinatura", "conferir"): assinatura_conferir}
```
  (`import base64` e `import secrets` no topo; o bloco vai logo DEPOIS do `COMANDOS = {…}` da Task 0b e antes do `main` — o `|=` acrescenta
  os 4 comandos. Conferido numa pasta de rascunho em 11/10: compila, e com falsos a 2ª vez não gera, "só num lado" para e a saída não leva a
  chave.) Testes novos no `test_mp_conta.py`: **a 2ª vez não gera** (cofre e funções iguais → 0, nenhum
  `salvar_segredo` nem `gravar_segredo`); só no cofre ou só nas funções → 1 e nada gravado; diferentes → 1 e nada gravado; a 1ª vez grava o
  cofre ANTES das funções (a ordem das chamadas no falso) e o `conferir` bate; nenhuma saída leva a chave nem o sha256 inteiro.
- [ ] **Step 4: Logs e verde**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/mp-contas-renovar/index.ts
flock $P npx vitest run --maxWorkers=2 src/lib/segredoServidor.test.ts src/lib/logsDasFuncoesPrincipal.test.ts
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_mp_conta.py scripts/segredos/test_servidor.py
```
  (`"mp-contas-renovar"` no `FUNCOES`.)
- [ ] **Step 5: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add supabase-principal/functions/mp-contas-renovar/index.ts scripts/segredos/mp_conta.py scripts/segredos/test_mp_conta.py scripts/segredos/servidor.py src/lib/logsDasFuncoesPrincipal.test.ts src/lib/segredoServidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): função nova mp-contas-renovar (de hora em hora + a conferência diária, S10) e a chave dos tokens que só nasce uma vez" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/mp-contas-renovar/index.ts scripts/segredos/mp_conta.py scripts/segredos/test_mp_conta.py scripts/segredos/servidor.py src/lib/logsDasFuncoesPrincipal.test.ts src/lib/segredoServidor.test.ts
```

---

### Task 12: Servidor — `master-contas`: o "Desligar" cancela antes (MENOR 7)

**Files:** Modify `supabase-principal/functions/master-contas/index.ts`, `src/master/regras.ts` (`textoErro`)
**Estimativa:** 25 a 35 min (pior cenário 60 min) — + o aviso aos alunos no "forçar" (MENOR 17).

- [ ] **Step 1:** no `case "acao"`, para `corpo.tipo === "recebimento"`:
  1. `r = rpc(c.comoPessoa, "master_conta_acao", …)`; `r.erro === "automaticas_ativas"` e sem `args.cancelar_automaticas` → `json({ ok: false, erro:
     "automaticas_ativas", alunos: r.alunos }, 409, origin)` (a `master-regras.ts` é da porta — não muda; o 409 sai daqui);
  2. com `args.cancelar_automaticas === true` → `ids = pacientesComAutomaticaViva(c.db, conta)` → `cancelarAssinaturasPorCredencial(c.db, { schema:
     c.schema, log, prazo }, ctxMp, credencialDoSchema(c.schema), ids, "master_trocou_a_forma")` (ela não lança por causa do MP — MENOR 11; o
     `ctxMp` é um getter que, sem a `MP_TOKENS_CHAVE`, lança `MpContaSemAcesso` → conta em `semAcesso`); `falhas` → 502
     `automaticas_nao_canceladas`; `semAcesso` sem `args.forcar_sem_acesso` → 409 `automaticas_sem_acesso`; com `forcar_sem_acesso` (decisão
     11) → as assinaturas daquela conta marcadas `cancelled` no Physiq com `payload { cancelada_por: <master>, motivo_cancelamento:
     "sem_acesso_ao_mp_do_personal" }` + `conta_eventos {w2: "forcou_sem_acesso", n}` + aviso ao dono ("desligue no app do Mercado Pago as
     cobranças automáticas de N aluno(s)") **+ aviso a CADA aluno dessas assinaturas** (MENOR 17: "Seu profissional mudou a forma de receber.
     Se o seu cartão continuar sendo cobrado pela cobrança automática, fale com o seu profissional.") — e no PR: "forçar sem acesso deixa a
     automática viva no MP do personal; passados os 7 dias de leitura, essas cobranças não dão mais baixa no Physiq (`conta_sem_mp`)";
  3. a RPC de novo → ok → aviso a cada aluno cancelado (o texto da W1).
- [ ] **Step 2:** `textoErro` (`src/master/regras.ts`): `automaticas_ativas`, `automaticas_nao_canceladas`, `automaticas_sem_acesso`, `modo_invalido`
  ("o Mercado Pago do personal e a InfinitePay só o dono liga").
- [ ] **Step 3: Verde e commit**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/master-contas/index.ts
flock $P npx vitest run --maxWorkers=2 src/master
git add supabase-principal/functions/master-contas/index.ts src/master/regras.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): o master desliga o Mercado Pago só depois de cancelar as automáticas (com o OK) — MENOR 7 da W1; forçar sem acesso avisa os alunos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/master-contas/index.ts src/master/regras.ts
```

---

### Task 13: Simulador do MP + Deno local + `e2e/w2/api.py`

**Files:** Create `e2e/w2/simulador_mp.py`, `e2e/w2/test_simulador_mp.py`, `e2e/w2/api.py` (reusa `e2e/w1/servir_local.ts`)
**Estimativa:** 135 a 200 min (pior cenário 285 min) — a revisão já achava 90–130 (180) o honesto para os ~25 casos de antes; agora são ~35
(C1, C2, I1, I2, I4, I5, I8, I11 e o token de cada ação — MENOR 16).

- [ ] **Step 1: O simulador** (`127.0.0.1` só; o molde do `simulador_ip.py`; `/_cenario` e `/_pedidos` iguais):

```python
"""Physiq W2 — SIMULADOR LOCAL do Mercado Pago (só para o e2e/w2/api.py --local). Escuta só em 127.0.0.1. Nada aqui é o MP de verdade.
  GET  /authorization          → 302 <redirect_uri>?code=SIM-<uuid>&state=<state> (o code guarda client, redirect e o code_challenge);
                                  cenário "negar" → ?error=access_denied&state=…
  POST /oauth/token            → authorization_code: confere client_id/secret, code (uso único, 10 min), redirect IGUAL ao da autorização e
                                  o PKCE S256 (verifier → challenge) → {access_token APP_USR-sim-<n>, token_type, expires_in, scope "offline_access
                                  read write", user_id <vendedor>, refresh_token TG-sim-<n>, public_key (cenário "sem_public_key" tira),
                                  live_mode}; refresh_token: o refresh vivo → par NOVO e o velho MORRE (gira); senão 400 invalid_grant;
                                  cenários "troca_status"/"renovar_status" (400/500); "renovar_formato" (2xx sem access_token, com refresh — MENOR 13)
  GET  /users/me               → {id, nickname} do token vivo; token morto → 401
  POST /v1/payments            → pagamento do vendedor do token (collector_id), pix (qr) ou cartão (approved/rejected pelo cenário); live_mode
                                  pelo cenário (MENOR 20)
  GET  /v1/payments/<id>       → o pagamento (collector_id, external_reference, live_mode, status); token de OUTRO vendedor → 404, ou 401 com
                                  o cenário "alheio_401" (o MP de verdade pode fazer assim — I2: o /users/me desse token segue 200)
  PUT  /v1/payments/<id>       → cancelled · POST /v1/payments/<id>/refunds → refunded
  POST /preapproval · GET|PUT /preapproval/<id> · GET /authorized_payments/<id> · GET /authorized_payments/search?preapproval_id= (a lista das
       cobranças da automática — I1; o cenário "cobranca_mensal" cria 1 cobrança APROVADA na automática SEM mandar aviso) · POST /checkout/preferences (Task 5)
  POST /_cenario · GET /_pedidos (caminho, método, e o Authorization só como "token vivo/morto/outro" + o NOME do token: "physiq_teste",
       "conta_<vendedor>" — para conferir QUAL token foi em cada ação, MENOR 16 —, corpo SEM token)
  POST /_avisar                → manda um aviso ao webhook local (POST <webhook>?schema=staging[&conta=<id>] com {type, action, data.id,
                                  user_id}) — os casos created/updated (I4) e sem conta (I1)
  cenário "expirar_token" → o access token atual passa a dar 401 (o 401 da hora do uso)
Testes: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/w2/test_simulador_mp.py   Uso: python3 e2e/w2/simulador_mp.py --porta 8798
"""
```
- [ ] **Step 2: `e2e/w2/api.py`** — cabeçalho e casos (o molde do `e2e/w1/api.py`: foto ANTES em `~/projetos/physiqcalc-scratch/w2/api-estado.json`, ids à
  parte; desfazer no fim / `--limpar`; `--seco`; `--sinal` da trava; a guarda de `/health`; `--pagador-email` (MENOR 21: o padrão no `oauth_real` é
  o e-mail do COMPRADOR de teste de `~/.physiq-mp-comprador-teste.json`, não o `MP_TEST_PAYER_EMAIL` do ambiente do Physiq — no sandbox, pagador e
  vendedor são usuários de teste diferentes do mesmo país; conferir no 1º cartão APRO)):

```
Casos (padrão — as funções PUBLICADAS no staging e o MP de verdade em SANDBOX, com a conta do prof2 e o aluno2):
  recebimento  o dono vê "mercadopago_conta" (flag do staging ligada); prof_mp_conectar → a URL do MP (auth.mercadopago.com, client certo,
               response_type, platform_id, o redirect PRÓPRIO do staging, state de 43, S256) e SEM id de conexão na resposta (I8); origem
               "apk" → a URL do SITE (…/painel/configuracoes/recebimento?mp=conectar) e nenhuma conexão criada; sem o Client Secret no
               ambiente → 503 mp_oauth_nao_configurado (anotar); o aluno → 403; o master numa conta que não é dele → 403 so_o_dono (MENOR 19);
               flag desligada → 403 mp_conta_em_teste
  guarda       o dono grava mercadopago_conta direto pelo banco (REST como a pessoa) sem integração → recusado (mp_conta_sem_integracao); o app
               não lê recebimento_integracoes nem mp_conexoes; rpc w27_conta_linha como o dono → recusado (I7)
  simulada     o master: prof_mp_simular_conexao (a credencial de TESTE da aplicação, teste_sem_oauth) → prof_recebimento_salvar mercadopago_conta
               pelo dono → aluno_status com mp {disponivel: true, chave_publica: TEST-…} (MENOR 16: prova a GRAVAÇÃO; o token por ação é o --local)
  pix          aluno_mp_pix → Pix no MP (sandbox) com mp_collector_id e a notification_url com &conta= (lida de volta no GET do pagamento);
               simular_aprovacao → paga pela credencial da conta
  cartao       APRO → paga (mp_collector_id); detalhe_mp pela conta; prof_reembolsar pela conta → refunded
  automatica   aluno_mp_assinar (o sandbox não assina com cartão: pendente com init_point — a rede do sandbox pelo schema, MENOR 28) →
               aluno_assinaturas com mp_collector_id; aluno_mp_cancelar pela conta
  webhook      POST na mp-webhook-aluno PUBLICADA com ?schema=staging&conta=<id> e o id do pagamento do caso cartao → "cobranca_approved"
               (já paga: nada muda); a mesma conta com user_id de outro → segue e trata (I4: o user_id só vai ao log); conta inventada →
               conta_sem_mp (nenhuma ida ao MP); corpo de 17 KB SEM content-length (chunked) → 413 (MENOR 4); ms < 1000
  desconectar  com a automática viva → 409 automaticas_ativas; com o OK → cancelada no MP, modo pix_manual, integração desconectada, aviso ao aluno;
               "conectado_sem_trocar" (modo ainda Pix) → desconectar marca desconectada direto (MENOR 10)
  master       o master troca uma conta do MP com automática viva → 409; com cancelar_automaticas → cancela e troca (MENOR 7)
  erro         a integração em status erro (SQL) → aluno_mp_pix 409 mp_conta_indisponivel; **aluno_status 200** com mp.disponivel false E o
               histórico inteiro; prof_aluno 200 (I3: a leitura não derruba a tela)
  oauth_real   (só com o Client Secret e o vendedor de teste — Task 1 passou) prof_mp_conectar { redirect_teste: true } → o Playwright entra como o
               vendedor de teste (reusa o `seguir_ate_o_code` do e2e/w2/prova_public_key.py — o code lido no PEDIDO, a escolha de país — I6) →
               GET mp-conectar-retorno/staging?code&state → 302 ?mp=confirmar&c=<id> → **prof_mp_confirmar { conexao_id, confirmar: true }
               como o prof2** (I8) → resultado ok; integração oauth ativa, mp_teste true, collector = o vendedor; aluno paga cartão APRO com a
               chave do vendedor (o pagador = o COMPRADOR de teste — MENOR 21); mp-contas-renovar { forcar_conta } → renovada (refresh girou);
               desconectar. Depois da W2-a (Task 23) também `--redirect-proprio`: o prof_mp_conectar SEM redirect_teste, e o Playwright segue até
               o site e pega o ?mp=confirmar&c=… da chegada (a volta é a nossa função)
Casos --local (as funções no Deno local contra o banco do STAGING, com o SIMULADOR no lugar do MP — MP_API_BASE/MP_AUTH_BASE; MP_CLIENT_*
falsos; uma MP_TOKENS_CHAVE da rodada; linhas com mp_origem teste_local; o job mp-renovar-staging PARADO e devolvido no desfazer;
**rodam COM a trava "🔒 BANCO do staging"** (--sinal — MENOR 25: gravam linhas de teste e param o job):
  conectar     prof_mp_conectar → GET simulador /authorization → a volta (Location) entregue à mp-conectar-retorno LOCAL → ?mp=confirmar&c=<id>
               (nada em recebimento_integracoes ainda — I8) → prof_mp_confirmar (sem confirmar) → o apelido → prof_mp_confirmar { confirmar:
               true } COMO O PROF2 → ok; o simulador conferiu o redirect e o PKCE; a integração tem as 2 cifras (v1:, sem o token em claro) e a
               conexão ficou sem elas; o modo virou mercadopago_conta
  confirmar_outro  I8: a conexão `confirmar` do prof2 confirmada com a sessão do ALUNO2 → 403 mp_outra_pessoa e NADA na integração; a do
               prof2 com 16 min → vencido; a mesma 2× → invalido
  reusado      o mesmo state de novo → ?mp=invalido (uso único); state vencido (expira_em no passado) → ?mp=vencido; error=access_denied → negado
  troca_ruim   o simulador recusa a troca (400 invalid_grant) → ?mp=invalido (MENOR 14) e nada gravado; 500 → ?mp=falhou
  modo_errado  cenário live_mode true no staging → ?mp=conta_de_teste e nada guardado (MENOR 20)
  sem_chave    cenário sem_public_key → mp_public_key nulo; aluno_status mp.chave_publica null (o app esconde o cartão — decisão 14)
  outra_conta  conectada com a automática viva e a volta de OUTRO vendedor → a confirmação → outra_conta e a integração antiga intacta
  trocar_com_pix  I5: conectada (vendedor A) + um Pix do MP aberto de um aluno da conta (aguardando, vence amanhã) → conectar o vendedor B →
               confirmar → outra_conta (o token de A segue na integração; o Pix pago DEPOIS no simulador + o aviso → paga pela conta A)
  renovar      mp_expira_em +10 dias → mp-contas-renovar local (com o segredo da rodada) → renovada, expira +180 d, o refresh velho morto no
               simulador; 2 renovações juntas → 1 só no simulador (a trava), nenhuma "erro"
  recusada     o simulador recusa a renovação com o acesso ainda valendo → ativa + mp_erro renovacao_recusada + 1 aviso ao dono; vencida → erro + aviso;
               "renovar_formato" → o refresh novo gravado + mp_erro renovacao_formato (MENOR 13)
  uso_401      cenário expirar_token → aluno_mp_pix: 401 → /users/me 401 → renova na hora e passa; 401 + renovação recusada → erro, 1 aviso, 409
               ao aluno; o mesmo 401 com mp_renovado_em há 5 min → NÃO renova (I2: 1× a cada 10 min) → erro
  webhook_401_alheio  I2: o aviso &conta= com o id de um pagamento de OUTRO vendedor e o cenário alheio_401 → 200 "nao_achado", a integração
               segue ATIVA e 0 POST /oauth/token no simulador
  webhook      aviso por conta com o pagamento do simulador → paga; collector de outro → ignorado; referência de aluno de OUTRA conta → ignorado;
               a conta em erro → 500; x-signature com o segredo local e a flag exigir: sem → 401, com → passa
  criado_e_atualizado  I4: /_avisar payment.created (o pagamento ainda pendente) e, 2 s depois, payment.updated (aprovado) do MESMO id → paga
               (sem o cache de 60 s; antes o 2º caía em "repetido_60s")
  sem_conta_pelo_user_id  I1 + MENOR 5: o aviso SEM &conta= com o user_id do vendedor da integração (a URL do painel) → tratado pela conta → paga;
               com o user_id da conta do PHYSIQ (o do token de teste) → o caminho de hoje; mp-connect sem conta com o token morto → integração
               em erro (acesso_revogado) e 1 aviso ao dono
  rede_automatica  I1: automática da conta authorized + o cenário cobranca_mensal (a cobrança do mês aprovada, SEM aviso) → aluno_status (o
               conferirAssinatura) → a cobrança entra paga com mp_collector_id; mp-contas-renovar local (o diário, mp_conferido_em nulo) → a
               2ª cobrança do mês seguinte também entra; rodar de novo → nada dobra (mp_payment_id único)
  diario       MENOR 27: integração ativa vencendo em 90 dias com mp_conferido_em nulo e o token morto no simulador → mp-contas-renovar →
               /users/me 401 → renovação recusada → erro + 1 aviso (o personal fica sabendo sem esperar um aluno pagar)
  teto         130 avisos SEM user_id do mesmo IP num minuto → 429 nos últimos; 70 avisos da MESMA conta → 429 nos últimos; 200 avisos com
               uuids inventados NÃO zeram o teto do IP (MENOR 26); corpo > 16 KB → 413
  fila         plano com automática na conta → automaticas-fila local → o PUT foi ao simulador com o token DA CONTA
  cancelar_automatica  C2: aluno_mp_cancelar, prof_cancelar_assinatura e o prof_definir para o período todo numa automática DA CONTA → o
               simulador recebe o PUT /preapproval com o token "conta_<vendedor>" (nunca o "physiq_teste")
  assinatura_antiga_viva  I11: automática pending na conta A; o simulador recusa o PUT de cancelamento → aluno_mp_assinar → 409
               assinatura_antiga_viva e NENHUM POST /preapproval novo; a automática antiga de OUTRA conta (desconectada) → 409 igual
  reembolso_forjado  C1 (a W1b + a W2; o molde do servidor_forjado do e2e/w1/api_w1b.py): uma cobrança da conta com mp_payment_id trocado POR
               SQL (como o servidor — a guarda da W1b segura o app, então o teste simula o furo por baixo) para um pagamento de OUTRO vendedor
               no simulador → prof_reembolsar 409 cobranca_de_outro_pagamento (o código da W1b), prof_cobranca_cancelar 409, detalhe_mp 409 —
               e 0 /refunds e 0 PUT no simulador; e um pagamento do MESMO vendedor com a referência de outra cobrança → 409 igual (a regra
               pura da W1b)
  registrado   I5 da W1: o personal registra à mão com o Pix do MP aguardando → a MESMA linha paga; a aprovação depois não cria 2º período
  tokens       MENOR 16: ao fim do --local, o /_pedidos confere o NOME do token de CADA ação da tabela da Task 9 (conferir, conferirAssinatura,
               pix, cartão, assinar, cancelar, detalhe, cancelar cobrança, reembolsar, fila): as da conta com "conta_<vendedor>", as do MP do Physiq
               com "physiq_teste" — nenhuma trocada
```
- [ ] **Step 3: Rodar** — com a trava (MENOR 25: "🔒 BANCO do staging" no quadro + `SendMessage` à LINUX 1 + o "pode ir"):
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/w2/test_simulador_mp.py
flock $P python3 e2e/w2/api.py --seco
flock $P python3 e2e/w2/api.py --local --sinal
```
  (o padrão roda na Task 14, com as funções publicadas). Expected: o simulador PASS; `--local` todos ✅ e "tudo voltou à foto" (inclusive o
  job). Soltar a trava + aviso.
- [ ] **Step 4: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add e2e/w2/simulador_mp.py e2e/w2/test_simulador_mp.py e2e/w2/api.py
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w2): simulador do Mercado Pago (OAuth inteiro) e o E2E de servidor (staging, local com o token de cada ação e OAuth real)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/w2/simulador_mp.py e2e/w2/test_simulador_mp.py e2e/w2/api.py
```

---

### Task 14: Staging do servidor — segredos, publicar as 7 funções, E2E (+ o OAuth real se a Task 1 passou)

**Files:** `docs/e2e-rodadas.md` (no PR)
**Estimativa:** 50 a 85 min (pior cenário 130 min)

> Publicar vale para o `public` e o `staging` ao mesmo tempo. No `public` (sem a migration da W2) a parte nova fica DESLIGADA: `schemaTemW2` =
> false → colunas de antes, ações novas com 409 `w2_indisponivel`, a volta → `?mp=invalido`, o webhook com `&conta=` → 500 `schema_sem_w2` (não
> existe pagamento de conta no `public` ainda). O "até o fim" cobre a publicação; o horário vai à LINUX 1.

- [ ] **Step 1: A trava** — "🔒 BANCO do staging" + `SendMessage` (inclui: "vou publicar master-contas e excluir-minha-conta também") + "pode ir".
- [ ] **Step 2: Os segredos** (pelo script — nenhum valor na tela nem na conversa, I9):
```bash
cd ~/projetos/physiqcalc-w2
python3 scripts/segredos/mp_conta.py chave gerar && python3 scripts/segredos/mp_conta.py chave conferir
python3 scripts/segredos/mp_conta.py oauth copiar && python3 scripts/segredos/mp_conta.py oauth conferir     # sem o Client Secret: ❌ anotado (FIM)
python3 scripts/segredos/servidor.py mp_renovar gerar && python3 scripts/segredos/servidor.py mp_renovar aceitar
```
  O `chave gerar` é seguro de repetir (I10): com a chave já nas 2 pontas e igual, sai ✅ "já existe" sem gerar; diferente ou só num lado → ❌ e
  PARA (não rodar `--forcar` nem apagar nada: investigar com o `chave conferir`).
- [ ] **Step 3: Publicar (as novas primeiro)**
```bash
cd ~/projetos/physiqcalc-w2
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-conectar-retorno false
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-contas-renovar false
python3 scripts/segredos/servidor.py mp_renovar trocar && python3 scripts/segredos/servidor.py mp_renovar conferir
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-webhook-aluno false
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions automaticas-fila false
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions pagamentos-aluno true
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions master-contas true
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions excluir-minha-conta true
```
  Anotar versões, horário e o sha (`git rev-parse --short HEAD`). A flag do staging: `update staging.app_config set valor = '{"liberada": true}'
  where chave = 'mercadopago_conta'` (Management API, 1 comando).
- [ ] **Step 4: Smoke só leitura no `public` logo depois de publicar** — `cd ~/projetos/physiqcalc-w2 && python3 e2e/w10/api.py --schema public`
  (MENOR 8: o padrão dele é o `staging`), `python3 e2e/w06/smoke_prod.py`, `python3 e2e/w1/telas.py --base prod` (os placares de sempre);
  `GET …/mp-conectar-retorno/public?state=<43 inventados>` → 302 `?mp=invalido` (com `Referrer-Policy: no-referrer`); POST no webhook com
  `?schema=public&conta=<uuid inventado>` → 500 `schema_sem_w2`; POST no webhook SEM `conta` com um `user_id` inventado → o caminho de hoje
  (200). **O que este smoke NÃO pega** (é só leitura): a gravação do `public` sem a coluna nova — quem segura é a regra da coluna nova (C2) com
  o Vitest SEM a W2 (Task 4) e a guarda de fonte (Task 18). Algo novo caiu → republicar a versão da `origin/main` (worktree temporária
  `git worktree add <scratchpad>/main origin/main`; nunca `git stash`) e investigar.
- [ ] **Step 5: Os E2E, um por vez**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P python3 e2e/w2/api.py
flock $P python3 e2e/w2/api.py --local --sinal
flock $P python3 e2e/w2/api.py --casos oauth_real      # só se a Task 1 passou e o Client Secret está no ambiente (o code no PEDIDO — I6)
flock $P python3 e2e/w2/sql_w2.py
flock $P python3 e2e/w1/api.py --casos recebimento,trocar
flock $P python3 e2e/w1/sql_w1b.py && flock $P python3 e2e/w1/api_w1b.py --casos servidor_forjado,legitimo   # a W1b sem regressão (C1)
flock $P python3 e2e/wp/api.py --casos planos,mensal
flock $P python3 e2e/w06/api.py --casos pix,acesso
flock $P python3 e2e/hml01/banco.py --schema staging
```
  Expected: todos ✅ e "tudo voltou à foto"; a W1, a W-P e o MP do Physiq sem regressão. Qualquer ❌ → `superpowers:systematic-debugging`.
- [ ] **Step 6: Soltar a trava, avisar, registrar** — quadro "livre" + `SendMessage` com as versões; as linhas do `e2e-rodadas.tsv` no topo de
  `docs/e2e-rodadas.md` →
```bash
cd ~/projetos/physiqcalc-w2 && git add docs/e2e-rodadas.md
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w2): rodadas do servidor no staging (sandbox do MP, simulador local e OAuth real)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/e2e-rodadas.md
```

---

### Task 15: Painel — Recebimento: Conectar, confirmar, situação, Desconectar e a volta (+ as peças comuns)

**Files:** Modify `src/financeiro/{tipos,api,regras}.ts`, `src/financeiro/recebimento.ts`, `src/financeiro/abrirPagamento.ts` (MENOR 9),
`src/painel/configuracoes/Recebimento.tsx`; Test `src/painel/configuracoes/Recebimento.test.tsx` (ou o arquivo de teste que já cobre a tela),
`src/financeiro/regras.test.ts`, o teste do `abrirPagamento`. **Sem** página pública nova nem rota no `src/rotas/registro.ts` (decisão 6: a
volta sempre cai nesta tela — a `/mp/conectado` saiu, e com ela o MENOR 18).
**Estimativa:** 60 a 90 min (pior cenário 130 min)

- [ ] **Step 1: As peças comuns** — `ModoRecebimento` + `"mercadopago_conta"`; `RecebimentoDaConta.mercadopago_conta: { disponivel; status; apelido;
  expira_em; erro; conectado_em; chave_publica: boolean; teste: boolean | null }`; `MatriculaPagamentos.mp?: { disponivel: boolean; chave_publica:
  string | null } | null`; `api.ts`: `conectarMercadoPago(contaId, origem)` → `{ url, no_site? }`, `conexaoMercadoPago(conexaoId)` → `{ apelido,
  teste }` (o `prof_mp_confirmar` sem `confirmar`), `confirmarMercadoPago(conexaoId)` → `{ resultado, apelido, recebimento }` e
  `desconectarMercadoPago(contaId, cancelar?)`; `regras.ts`: `podePagarPeloApp`/`formasDePagar` com `mercadopago_conta` ("Pix ou cartão"),
  `mensagemDoRecebimento` e `mensagemErroFinanceiro` com `mp_nao_conectado`, `mp_conta_em_teste`, `mp_oauth_nao_configurado` ("A conexão com o
  Mercado Pago ainda está sendo preparada. Tente mais tarde."), `mp_sem_acesso`, `automaticas_nao_canceladas`, `mp_conta_indisponivel` ("O
  pagamento pelo app está indisponível agora. Avise o seu profissional."), `mp_conta_sem_chave_pix` ("O Pix do seu profissional ainda não está
  pronto. Use o cartão ou avise ele."), `mp_outra_conta`, `mp_reembolso_pelo_app_do_mp`, **`assinatura_antiga_viva`** (I11: "Cancele a cobrança
  automática antiga no app do Mercado Pago ou fale com o seu profissional."), **`so_o_dono`** (MENOR 19: "Só o dono da conta conecta o Mercado
  Pago."), e os da confirmação (`mp_outra_pessoa`, `mp_vencido`, `mp_invalido`, `mp_em_outra_conta` → o `TEXTO_DO_RETORNO` de mesmo nome, sem
  o `mp_`). Testes de cada mensagem. **MENOR 9** — `abrirPagamento.ts`: `abrirConexaoMp(url)` só abre o que passa no `ehUrlDeAutorizacaoMp`
  (site: `window.location.assign`); e `abrirSiteNoApp(url)` (APK: `Browser.open`) só abre `https://physiqcalc.com.br/…` ou
  `https://physiqcalc-staging.vercel.app/…` (host EXATO) — o resto, "recusado" (o mesmo filtro que a W1 fez para a InfinitePay).
- [ ] **Step 2: A tela** (`Recebimento.tsx`):
  - opção `{ valor: "mercadopago_conta", rotulo: "Mercado Pago (sua conta)", icone: CreditCard, dica: "O aluno paga por Pix ou cartão no app e o
    dinheiro cai direto no seu Mercado Pago" }` quando `r.mercadopago_conta.disponivel || r.conta.modo === "mercadopago_conta"`; a opção
    "Mercado Pago" de hoje vira "Mercado Pago do Physiq" e só aparece para o master ou para a conta que já está nele;
  - com `modo === "mercadopago_conta"`: o bloco `data-recebimento-mp-conta` com o `Chip` da `situacaoDoMp` (`data-mp-situacao`), o texto, e o botão
    "Conectar com o Mercado Pago" (`data-mp-conectar`) / "Conectar de novo" (`data-mp-reconectar`) / "Desconectar" (`data-mp-desconectar`, com
    `useConfirmar` "Desconectar o Mercado Pago?" e, no 409 `automaticas_ativas`, a 2ª confirmação "Desligar as cobranças automáticas de N aluno(s)?");
  - **Conectar no SITE**: `const { url } = await conectarMercadoPago(conta.id, "site")` → `abrirConexaoMp(url)` (a volta traz de novo para
    esta tela);
  - **Conectar no APK** (decisão 6 — I8): `const { url } = await conectarMercadoPago(conta.id, "apk")` → `abrirSiteNoApp(url)` (o SITE,
    `…/painel/configuracoes/recebimento?mp=conectar`, no navegador por cima do app: o personal entra no site se precisar — o login volta a esta
    tela com a busca, H2 — e o fluxo inteiro acontece lá) + `Browser.addListener("browserFinished", () => qc.invalidateQueries({ queryKey: chave }))`
    (o ouvinte sai no desmontar) + o texto "Conecte no navegador que abriu e volte ao app";
  - **`?mp=conectar`** (o APK abriu o site): só destaca o botão Conectar (`data-mp-conectar-destaque`) — NUNCA começa sozinho (um link com
    `?mp=conectar` não pode disparar nada);
  - **`?mp=confirmar&c=<id>`** (a volta boa — I8): `ehUuidMp(c)` → `conexaoMercadoPago(c)` → `useConfirmar` "Conectar a conta **<apelido>**
    do Mercado Pago? Os alunos passam a pagar direto nela." (`data-mp-confirmar`) → sim → `confirmarMercadoPago(c)` → o toast do resultado (`ok`
    ou `conectado_sem_trocar`; erro → o `TEXTO_DO_RETORNO` do erro) → no fim, "Pronto. Se você começou pelo app, pode fechar esta janela e voltar
    a ele." quando a tela não está no APK; não → nada gravado (a conexão vence em 15 min). Depois, `navigate(pathname, { replace: true })` (limpa
    a busca) → refetch;
  - **a volta com erro**: `?mp=<resultado>` válido (`ehResultadoDoRetorno`) → toast com `TEXTO_DO_RETORNO[mp]` (`data-mp-retorno`) → limpa a busca
    → refetch;
  - "Salvar a forma" com `mercadopago_conta` sem conexão ativa → desabilitado com "Conecte o Mercado Pago primeiro";
  - **jeito 2**: nada de `principal.from(…)` aqui (a guarda da Task 18).
- [ ] **Step 3: Testes** — renderização com os 4 estados (sem conexão, ativa, renove, erro); conectar no site chama `location.assign` com a url da
  autorização e RECUSA uma url fora do `ehUrlDeAutorizacaoMp`; no APK (`Capacitor.isNativePlatform` mockado) abre o SITE pelo `Browser.open`;
  `?mp=conectar` só destaca (nenhuma chamada à api); `?mp=confirmar&c=<uuid>` mostra a pergunta com o apelido, confirma, mostra o resultado e
  limpa a busca; `?mp=confirmar&c=lixo` → "invalido" sem chamar a api; `?mp=negado` mostra o texto e limpa; desconectar com 409 pede a 2ª
  confirmação; `semDialogoNativo` e `larguraCelular` verdes.
- [ ] **Step 4: Commit**
```bash
cd ~/projetos/physiqcalc-w2 && git add src/financeiro/tipos.ts src/financeiro/api.ts src/financeiro/regras.ts src/financeiro/regras.test.ts src/financeiro/recebimento.ts src/financeiro/abrirPagamento.ts src/financeiro/abrirPagamento.test.ts src/painel/configuracoes/Recebimento.tsx src/painel/configuracoes/Recebimento.test.tsx
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w2): Configurações › Recebimento — conectar o Mercado Pago da conta, confirmar a conta, a situação da conexão, desconectar e a volta (no APK pelo site)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/financeiro/tipos.ts src/financeiro/api.ts src/financeiro/regras.ts src/financeiro/regras.test.ts src/financeiro/recebimento.ts src/financeiro/abrirPagamento.ts src/financeiro/abrirPagamento.test.ts src/painel/configuracoes/Recebimento.tsx src/painel/configuracoes/Recebimento.test.tsx
```
  (Os nomes dos arquivos de teste: os que já cobrem a tela e o `abrirPagamento` — se o nome for outro, o `git add`/`--` leva o de verdade.)

---

### Task 16: Painel — master Integrações (vê e desliga com o OK)

**Files:** Modify `src/master/{regras,tipos}.ts`, `src/master/paginas/Integracoes.tsx`
**Estimativa:** 15 a 25 min (pior cenário 40 min)

- [ ] `ROTULO_RECEBIMENTO`: `mercadopago: "Mercado Pago do Physiq"`, `mercadopago_conta: "Mercado Pago do personal"`; `tipos.ts`: o modo + `mercadopago_conta?: {
  status; apelido; mp_user_id; expira_em; erro; chave_publica; conectado_em; teste } | null`; KPI "MP do personal" (`r.mercadopago_conta`, detalhe
  `${r.mp_conta_erro} com a conexão caída`); no `select`, `mercadopago_conta` desabilitado se não for o atual (o dono conecta); na linha da conta
  `mercadopago_conta`: o apelido + a situação (`data-mp-conta-da-conta`) + "Desligar" (`data-desligar-mp-conta`) → `useConfirmar` → `mudar(c.id,
  chave ? "pix_manual" : "nenhum")`; `mudar` trata `ErroMaster` `automaticas_ativas` (2ª confirmação → `{ modo, cancelar_automaticas: true }`) e
  `automaticas_sem_acesso` (3ª, com perigo: "forçar" → `{ …, forcar_sem_acesso: true }`). Teste da tela; commit `"feat(w2): master › Integrações — o MP do personal (situação e Desligar com o OK das automáticas)"`.

---

### Task 17: App — o cartão com a chave do vendedor (site e loja)

**Files:** Modify `src/components/pagamentos/mpInit.ts`, `src/painel/configuracoes/plano/CartaoPagamento.tsx`, `src/app-aluno/perfil/Pagamentos.tsx`, `src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx`, `src/financeiro/ui/FinanceiroDoAluno.tsx` (1 linha); Test `src/app-aluno/perfil/Pagamentos.test.tsx` (+ casos), um `.loja.test.tsx`
**Estimativa:** 35 a 55 min (pior cenário 85 min)

- [ ] **Step 1: O SDK por chave** (o `sdk-react` 1.0.7 já zera a instância quando a chave muda — `initMercadoPago`, `MercadoPagoInstance`):

```ts
let chaveEmUso: string | null = null;
/** W2: a chave do vendedor (o MP do personal) ou a do Physiq (padrão: o plano do personal, o modo de hoje). Trocou → o próximo Brick nasce com a nova. */
export function ensureMpInit(chave: string | undefined = MP_PUBLIC_KEY) {
  if (!chave || chave === chaveEmUso) return;
  const opcoes: OpcoesMercadoPago = { locale: "pt-BR", deviceProfileCspNonce: MP_CSP_NONCE };
  initMercadoPago(chave, opcoes);
  chaveEmUso = chave;
}
```
- [ ] **Step 2: `CartaoPagamento`** — prop `chavePublica?: string` (`const chave = chavePublica ?? MP_PUBLIC_KEY`); `useEffect(() => { if (aberto)
  ensureMpInit(chave); }, [aberto, chave])`; o `key` do `CardPayment` inclui a chave; `data-brick-chave={chavePublica ? "conta" : "physiq"}` (o
  E2E confere QUAL, sem expor o valor); sem chave → a mensagem de hoje.
- [ ] **Step 3: O aluno** — `Pagamentos.tsx`: `mercadopago` OU `mercadopago_conta` → `PagarMercadoPago`. `PagarMercadoPago`: na conta
  (`matricula.conta.modo === "mercadopago_conta"`): `mp.disponivel === false` → só o aviso "O pagamento pelo app está indisponível agora. Avise o
  seu profissional." (`data-mp-indisponivel`); `mp.chave_publica` → o Brick com ela; sem chave (antes da Task 5, se ela vier) → só o Pix (decisão
  14). `FinanceiroDoAluno.tsx` `MODO_TEXTO.mercadopago_conta = "Mercado Pago do personal (Pix e cartão, confirmação automática)"` (avisar a
  LINUX 1 no quadro: 1 linha).
- [ ] **Step 4: Testes** — o Brick recebe a chave da conta (o `initMercadoPago` mockado é chamado com a chave da matrícula e, depois, com a do
  Physiq no `PlanoContaNova`); indisponível; sem chave só Pix; a versão da loja (`ehLoja`) igual. Commit `"feat(w2): o aluno paga o MP do personal no app — o cartão com a chave pública do vendedor (site e loja)"`.

---

### Task 18: Guardas de fonte (segredo fora do navegador, da resposta e do log; a coluna nova só pelos ajudantes)

**Files:** Create `src/financeiro/mpContaGuardas.test.ts`
**Estimativa:** 15 a 30 min (pior cenário 40 min)

- [ ] Um teste que lê as fontes (o molde do `recebimentoJeito2.test.ts`):
  1. `src/**` (fora de testes) não tem `from("recebimento_integracoes")`, `from("mp_conexoes")`, `MP_CLIENT_SECRET`, `MP_TOKENS_CHAVE`, `client_secret`;
     nenhum `.env*` do repo tem `VITE_MP_CLIENT` ou `VITE_MP_TOKENS`;
  2. em `supabase-principal/functions/**`, `mp_access_token`/`mp_refresh_token`/`token_access`/`token_refresh`/`verificador` só aparecem em
     `_shared/mp-conta.ts`, `mp-conectar-retorno/index.ts`, `mp-contas-renovar/index.ts` e no `prof_mp_simular_conexao`/`prof_mp_conectar` da
     `pagamentos-aluno` (gravação), e nunca dentro de um `json(` de resposta;
  3. nenhuma chamada de log (`log.info|aviso|erro|excecao`) nesses arquivos leva `token`, `code`, `state`, `verificador` ou `public_key` como campo;
  4. `Recebimento.tsx` e `PagarMercadoPago.tsx` sem `principal.from(`;
  5. **a regra da coluna nova (revisão C2):** `mp_collector_id` fica livre só no `_shared/mp-conta.ts` (o dono da regra: tudo lá passa pelo
     `schemaTemW2`, e o Vitest da Task 4 roda com o db SEM a W2) e, no `_shared/financeiro-mp.ts`, só no `COLUNAS_COBRANCA_W2` e nos tipos
     (`Cobranca.mp_collector_id?`, o `colunasW2?`). Em `pagamentos-aluno`, `mp-webhook-aluno`, `automaticas-fila`, `master-contas` e
     `_shared/{app-sem-profissional,exclusao-profissional,planos-automatica-mp}.ts`, TODA linha com `mp_collector_id` (fora de comentário) leva o
     comentário `// W2: depois do schemaTemW2` (ex.: o filtro do `cancelarAssinaturasDasMatriculas`, a comparação do collector no
     `tratarDaConta`) — sem ele, o teste falha com o arquivo:linha (o select/insert solto com a coluna quebraria o `public` entre a Task 14 e a
     22). Caso de controle no próprio teste: uma linha inventada `select("id, mp_collector_id")` sem a marca é acusada.
- [ ] **Verde e commit**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro/mpContaGuardas.test.ts
git add src/financeiro/mpContaGuardas.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w2): guardas — tokens do MP do personal fora do navegador, das respostas e do log; a coluna nova só pelos ajudantes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/financeiro/mpContaGuardas.test.ts
```

---

### Task 19: Testes locais finais + E2E de tela (site e loja) + prints

**Files:** Create `e2e/w2/telas.py`; Modify `docs/e2e-rodadas.md`
**Estimativa:** 50 a 80 min (pior cenário 125 min)

- [ ] **Step 1: Suíte inteira, tipos, lint, CI local e os 2 builds (na fila da máquina)**
```bash
cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock && T=~/projetos/physiqcalc-scratch/w2/t19 && mkdir -p $T
flock $P npx vitest run --maxWorkers=2 && flock $P npm run tipos && flock $P npm run lint && flock $P npm run test:node && node scripts/ci/checar-definer.mjs
for f in pagamentos-aluno mp-webhook-aluno mp-conectar-retorno mp-contas-renovar automaticas-fila master-contas excluir-minha-conta; do DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/$f/index.ts; done
flock $P npm run build && rm -rf $T/dist-site && cp -r dist $T/dist-site
flock $P npm run build:loja && rm -rf $T/dist-loja && mv dist $T/dist-loja && cp -r $T/dist-site dist
```
- [ ] **Step 2: `e2e/w2/telas.py`** — o molde do `e2e/w1/telas.py` (a classe `Tela`, `fotos` a 1280 e 390, a guarda dos 2 `/health`, o desfazer do
  `api.py`). Passos:
  1 `recebimento` — o dono vê "Mercado Pago (sua conta)"; jeito 2 medido na rede (nenhum pedido do navegador a `/rest/v1/(contas|recebimento_chaves|
    recebimento_integracoes|mp_conexoes)`);
  2 `conectar` — "Conectar com o Mercado Pago" → a navegação para `auth.mercadopago.com` (ou `.com.br`) é INTERCEPTADA (`page.route`) e
    abortada; a URL conferida (client, redirect próprio do staging, state, S256) — nunca a página do MP no print;
  3 `conectado` — depois do `prof_mp_simular_conexao` (pelo `api.py`) + "Salvar a forma": o chip "Conectado", o apelido;
  4 `volta` — `/painel/configuracoes/recebimento?mp=negado` → o texto e a busca limpa; `?mp=conectar` → só o destaque do botão (nenhum pedido à
    função); `?mp=confirmar&c=<uuid inventado>` → "Esse link de conexão já foi usado ou não vale mais" (I8: a confirmação de verdade, com a
    pergunta e o apelido, é provada no `api.py --local` `conectar` e no Vitest da Task 15 — aqui só a tela); `?mp=confirmar&c=lixo` → o mesmo
    texto sem pedido à função;
  5 `app_pix` — o aluno: "Pagar" → o Pix do MP (QR) → "Simular aprovação (teste)" → pago;
  6 `app_cartao` — o Brick abre com `data-brick-chave="conta"` (nada é pago aqui — o cartão é provado no `api.py`);
  7 `erro` — a integração em erro: o dono vê "Conexão caiu" + "Conectar de novo"; o aluno vê "indisponível";
  8 `desconectar` — com uma automática pendente: 2 confirmações do app → o chip "PIX NA CHAVE";
  9 `master` — Integrações: "Mercado Pago do personal", o KPI, "Desligar" com as confirmações.
  `--loja`: os passos 5–7 e o `conectar` do APK (o build da loja no preview: o Conectar pede a URL do SITE — `no_site: true` — e não a do MP).
  `--base prod`: SÓ LEITURA (o master vê a opção em Recebimento e o KPI; o aluno de teste abre Pagamentos).
- [ ] **Step 3: Rodar no local, um por vez** (o `vite preview` do `dist/` do site, depois o da loja — o molde da Task 18 da W1; as portas
  conferidas antes com `ss -ltnp`), **com a trava "🔒 BANCO do staging"** (MENOR 25: as telas locais falam com o banco e as funções do
  staging — conexão simulada, Pix, desconectar — com o prof2/aluno2 que a LINUX 1 também usa): quadro + `SendMessage` + "pode ir", `--sinal`.
  Expected: os 2 placares completos ✅; soltar a trava + aviso.
- [ ] **Step 4: Conferir os prints** (Read em CADA um de `~/projetos/physiqcalc-scratch/prints/w2/local/` e `…/local/loja/`): nada passando da largura,
  textos simples e certos, nenhuma página do MP, nenhum dado real. Linhas da rodada no topo do `docs/e2e-rodadas.md`.
- [ ] **Step 5: Commit** — `git add e2e/w2/telas.py docs/e2e-rodadas.md` + `git -c … commit -m "test(w2): E2E de tela do MP do personal (Recebimento sem banco no navegador, app site e loja, master)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/w2/telas.py docs/e2e-rodadas.md`.

---

### Task 20: Validação local (modo até o fim: sem gate)

**Estimativa:** 10 a 15 min (pior cenário 25 min)

- [ ] As 2 montagens dos prints (painel e app) + resumo em ≤ 6 linhas (o que muda para o personal, para o aluno, para o master; jeito 2 medido;
  os placares: Vitest, `sql_w2`, `api.py` staging/local/`oauth_real`, `telas.py` site e loja; o que fica para o FIM) no tópico do Physiq
  (terminal + tópico; Read em cada print antes). Foto do andamento com a previsão e as fases; seguir sem esperar.

---

### Task 21: Staging (front + funções do HEAD + E2E um por vez)

**Estimativa:** 35 a 65 min (pior cenário 95 min)

- [ ] **Step 1: Check anti-sobrescrita (ISOLADO)** — `git -C ~/projetos/physiqcalc-w2 fetch origin && git -C ~/projetos/physiqcalc-w2 worktree list && gh pr list --repo weslleybertoldo/physiqcalc --state open && sed -n 1,10p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md`;
  depois, noutro comando: `cd ~/projetos/physiqcalc-w2 && (git merge-base --is-ancestor origin/main HEAD && echo main-ok || echo MAIN-ANDOU) && (git merge-base --is-ancestor origin/staging HEAD && echo staging-ff-ok || echo STAGING-NAO-FF)`.
  `MAIN-ANDOU` → `git rebase origin/main` (os pontos de encontro: 1 linha cada) e de novo a Task 19, Step 1. `STAGING-NAO-FF` → parar e combinar
  (regra 2 do quadro: nunca forçar).
- [ ] **Step 2: A trava** (regra 1) — "🔒 staging/main" e "🔒 BANCO do staging" com o "pode ir" da LINUX 1 (~40 min).
- [ ] **Step 3: A migration SÓ no staging** — `cd ~/projetos/physiqcalc-w2 && git log --oneline -- supabase-principal/migrations/20261011210000_w2_mp_personal.sql`;
  mudou depois da Task 6 → conferir que toda coluna NOVA de tabela entrou como `alter table … add column if not exists` (MENOR 23: o `create
  table if not exists` não leva coluna de uma 2ª versão) → aplicar de novo SÓ no staging (idempotente; dry-run antes) + `sql_w2.py`. Nada no
  `public`.
- [ ] **Step 4: As funções do HEAD** — `git diff --stat <sha da Task 14> HEAD -- supabase-principal/functions` → mudou → republicar SÓ as que
  mudaram (o mesmo `deploy_function.sh`) + o smoke só leitura do `public` da Task 14, Step 4.
- [ ] **Step 5: PR e push no staging (fast-forward, sem forçar)** — entre o Step 1 e aqui passaram os Steps 2–4 (dezenas de minutos): o check
  anti-sobrescrita é REPETIDO, isolado, logo antes do push no `staging` (MENOR 30 — a regra 2 do quadro: "antes de cada push"):
```bash
cd ~/projetos/physiqcalc-w2
git push -u origin feat/w2-mp-personal
gh pr create --title "feat(recebimento): Mercado Pago do personal — o personal conecta a conta dele e recebe direto (W2)" --body-file ~/projetos/physiqcalc-scratch/w2/pr-w2.md
```
```bash
cd ~/projetos/physiqcalc-w2 && git fetch origin && git merge-base --is-ancestor origin/staging HEAD || { echo STAGING-ANDOU; exit 1; }
```
```bash
cd ~/projetos/physiqcalc-w2 && git push origin feat/w2-mp-personal:staging
```
  `STAGING-ANDOU` → parar e combinar (nunca forçar).
  O corpo (`~/projetos/physiqcalc-scratch/w2/pr-w2.md`): o que muda (personal, aluno, master); a migration única; as 2 funções novas
  (verify_jwt false) e as 5 republicadas (versões e horário); os segredos novos (só os nomes); a flag (desligada na produção até o FIM); a
  prova da public_key (e o que ela mediu: `auth_usado`, a 2ª autorização, o `live_mode`); os placares; o MENOR 7 resolvido; **a revisão de
  11/10 (a tabela "onde cada achado entrou"), com a W1b já em produção antes** e: a conexão simulada prova só a GRAVAÇÃO — o token de cada ação
  é provado no `--local` (MENOR 16); o "forçar" do master deixa a automática viva no MP do personal e, passados 7 dias, essas cobranças não dão
  mais baixa (MENOR 17); o "Conectar" do APK abre o site (I8); o "Segue sozinho" (10/10) cobrindo os 2 endpoints públicos e a migration no
  `public` (MENOR 16 da W1); o MENOR 5 da W1 (o `dbPessoa` → `porta-pessoa.ts`) ainda pendente; no fim
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  Esperar a Vercel do staging (READY) + `https://physiqcalc-staging.vercel.app/health.json` (o sha); `gh pr checks <n> --watch` (`checar-pr` verde).
- [ ] **Step 6: E2E no staging, um por vez** — `flock $P python3 e2e/w2/telas.py --base staging`; `… e2e/w2/api.py --casos recebimento,simulada,pix,webhook,desconectar`;
  `… e2e/w2/api.py --casos oauth_real` (se a Task 1 passou); `… e2e/w1/telas.py --base staging` (a W1 sem regressão); `… e2e/w1/api_w1b.py
  --casos servidor_forjado,legitimo` (a W1b sem regressão); `… e2e/w10/api.py --schema staging`;
  `… e2e/hml01/banco.py --schema staging`. Prints em `~/projetos/physiqcalc-scratch/prints/w2/staging/` (Read em cada um). As linhas no
  `docs/e2e-rodadas.md` → commit na branch (`git push` só na branch).
- [ ] **Step 7:** soltar o BANCO do staging (a trava de staging/main fica para a 22) + aviso; resumo e prints no tópico (sem esperar).

---

### Task 22: Produção (backup, migration, PR → squash, release, realinhar, smoke só leitura) — a flag fica DESLIGADA

**Estimativa:** 45 a 75 min (pior cenário 115 min)

- [ ] **Step 1:** o check anti-sobrescrita isolado de novo (Task 21, Step 1).
- [ ] **Step 2:** "pausa E2E" à LINUX 1 → esperar o "pausado" (ninguém roda E2E enquanto o banco de produção muda).
- [ ] **Step 3: Backup do `public` e a foto das funções que mudam**
```bash
cd ~/projetos/physiqcalc-w2 && B=~/backups/physiq/$(date +%F)-w2-mp-personal/principal
python3 scripts/backup/backup_principal.py --pasta $B --schemas public --tabelas contas,recebimento_integracoes,cobrancas,aluno_assinaturas,app_config,avisos,conta_eventos,pacientes
python3 - "$B" <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, "/home/bertoldo/projetos/physiqcalc-w2/e2e/w02")   # MENOR 31: caminho absoluto (o cwd do subagente volta ao inicial)
from _comum import sql_principal as q
linhas = q("""select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('w27_conta_linha', 'master_integracoes', 'master_conta_acao')""")
Path(sys.argv[1], "funcoes-antes.sql").write_text(";\n\n".join(x["d"] for x in linhas) + ";\n", encoding="utf-8")
print(len(linhas), "funções guardadas")
PY
```
  Expected: os arquivos das tabelas + "3 funções guardadas" (o backup fica SÓ no notebook — regra dele).
- [ ] **Step 4: Ninguém segurando o banco** — `pg_stat_activity` (o mesmo script da Task 21 da W1): `longas` 0 e `esperando` 0.
- [ ] **Step 5: A migration no `public` (dry-run antes; UMA transação)**
```bash
cd ~/projetos/physiqcalc-w2
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so public --dry-run
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so public
python3 e2e/w2/sql_w2.py --so-catalogo --schema public
python3 e2e/w1/sql_w1.py --so-catalogo --schema public
python3 e2e/w1/sql_w1b.py --so-catalogo --schema public
python3 e2e/hml01/banco.py --schema public
```
  Expected: catálogo ✅ (inclusive: a guarda da W1b em `cobrancas` ligada — C1; a `w27_conta_linha` sem EXECUTE para o `authenticated` — I7; a
  `recebimento_mp_confirmar` só para `authenticated`/`service_role`), a flag `mercadopago_conta` = `{"liberada": false}`, o job
  `mp-renovar-public`; a W1 intacta; `hml01` sem regressão.
  ❌ → parar, sem merge, avisar com o placar (a volta: o backup + o `funcoes-antes.sql`). Depois, só leitura: a volta no `public` com state
  inventado → `?mp=invalido` (agora pela tabela); o webhook com `&conta=<uuid inventado>` → 200 `conta_sem_mp` (até 60 s pode vir o 500
  `schema_sem_w2` do cache: repetir).
- [ ] **Step 6: Os tipos do banco** — o `curl …/types/typescript?included_schemas=public` da W1 → `src/integrations/principal/types.ts` (mantendo as 3
  linhas do topo) → `flock $P npm run tipos` → commit `"chore(tipos): tipos do principal com o MP do personal"` -- o arquivo → `git push` na branch.
- [ ] **Step 7: Merge (regra 4: um PR por vez)** — `SendMessage` à LINUX 1 → CI verde → `gh pr merge <n> --squash --delete-branch=false` → o autor do
  squash = Weslley Bertoldo → `gh run watch` (release + `chore: bump version to v3.xx` do job `bump`; não bumpar à mão).
- [ ] **Step 8: Realinhar `staging` = `main` (regra 3: as 3 condições juntas)** — (a) "pode ir" da LINUX 1; (b) `git log origin/main..origin/staging` só
  com os commits da `feat/w2-mp-personal` e a árvore do staging = a do squash (`git diff origin/staging <squash>^{tree}` vazio); (c)
  `git push origin origin/main:staging --force-with-lease=staging:<sha conferido>` (nunca `--force` puro).
- [ ] **Step 9:** "pode voltar" à LINUX 1 + o sha + as 2 travas em "livre".
- [ ] **Step 10: Smoke da produção — SÓ LEITURA** — `cd ~/projetos/physiqcalc-w2 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock;
  flock $P python3 e2e/w07/smoke_prod.py telas --versao <a da release> --canal msedge`; `… e2e/w10/api.py --schema public` (MENOR 8); `… e2e/w06/smoke_prod.py`; `… e2e/w1/telas.py --base prod`; `… e2e/w2/telas.py --base prod`. Expected: os placares de sempre
  (os ❌ antigos e conhecidos, nada novo); o master vê o MP do personal em Recebimento e o KPI (a flag esconde só dos personais). Os logs das 7
  funções nos últimos 30 min sem erro novo (só contagens e `codigo`).
- [ ] **Step 11: Fechar** — o JSON da foto: W2 `status = "feito"` com o item "Teste sem dinheiro real"/"Pré-requisito seu" em `falta` ("no FIM:
  o endereço de retorno e o R$ 1 com a sua conta"), `duracao_min`, `tag: "PR #… · v3.xx"`; o quadro (✅ W2 com a hora); a memória
  (`projeto-physiq-unificado`: W2 em produção com a flag desligada; o FIM pendente); o resumo no grupo Validação (`remoto_validacao`, tópico do
  Physiq) com os prints da produção; `claude-orfaos.sh` (órfã → perguntar).

---

### Task 23: FIM (do Weslley) — o endereço de retorno e os avisos, a prova se pendente, o teste de produção e só então a flag

**Estimativa:** do meu lado 65 a 105 min (pior cenário 170 min), mais ~25 min dele (no computador e no celular)

> As coisas DELE da W2, juntas no fim (como a Task 22 da W1). Até aqui tudo foi provado sem ele: o sandbox com a conexão simulada, o simulador
> local e — se a Task 1 passou — o OAuth real com o vendedor de teste pelo redirect `https://www.mercadopago.com`. Falta o que só ele faz: o
> redirect da W2 e os avisos no painel do MP (para os personais de verdade) e o 1º personal de verdade (a conta MP dele) na produção — com
> **Pix, cartão e a automática** (revisão I12), antes da flag.

- [ ] **Step 1: A W2-a — 1 passo por mensagem, com o link direto da tela** (regra "guiar portal pelo celular": print a cada passo; chave/segredo
  colado no chat → cofre + apagar a mensagem). Mandar um passo, esperar o "ok"/print, mandar o próximo:
  1. "Abra **https://www.mercadopago.com.br/developers/panel/app** e entre com a SUA conta do Mercado Pago (a dona da aplicação PhysiqCalc). Me
     mande o print da lista **Suas integrações**."
  2. "Toque no cartão **PhysiqCalc** (link direto: `https://www.mercadopago.com.br/developers/panel/app/<APP_ID>` — eu monto com o número da
     aplicação na hora) → **Editar** (em **Detalhes da aplicação**)."
  3. "Em **URLs de redirecionamento**, deixe a `https://www.mercadopago.com` que já está e ACRESCENTE estas 2, exatamente assim:
     `https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/public` e
     `https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging` → **Salvar**. Print."
  4. (recomendado) "Na mesma tela, ligue o **PKCE** → **Salvar**." (o app já manda o PKCE; ligado, o MP passa a exigir — mais seguro.)
  5. (só se a Task 0b não achou) "Em **Credenciais de produção**, copie o **Client Secret** e salve no cofre pela tela
     (https://b-code-segredos.vercel.app → PhysiqCalc → 'Mercado Pago — PhysiqCalc' → campo `client_secret`). **Não cole aqui.**"
  6. **(OBRIGATÓRIO desde a revisão I1)** "Em **Webhooks › Configurar notificações**: na aba **Modo produtivo**, a URL
     `https://api-principal.physiqcalc.com.br/functions/v1/mp-webhook-aluno?schema=public`; na aba **Modo de teste**, a URL
     `https://api-principal.physiqcalc.com.br/functions/v1/mp-webhook-aluno?schema=staging` (MENOR 22); eventos **Pagamentos**, **Planos e
     assinaturas** e **Vinculação de aplicações** → Salvar → **Assinatura secreta** → copiar para o cofre pela tela (item 'Mercado Pago —
     PhysiqCalc — assinatura dos avisos (W2)', campo `valor`). Não cole aqui." — por quê: a doc NÃO garante que o aviso da cobrança de cada mês
     da automática venha pelo `notification_url` da assinatura (o exemplo oficial do `POST /preapproval` não tem o campo); sem o painel, esse
     aviso não chega e o mês pago no cartão não dá baixa (a busca do I1 é a rede, não o caminho). O `mp-connect` (o personal tirou o acesso)
     também só chega por aqui.
  7. (só se a Task 1 não conseguiu o login do vendedor de teste — e pode ser pedido JÁ na Task 1, sem esperar o FIM) "Em **Contas de teste**,
     salve no cofre pela tela (item 'Mercado Pago — PhysiqCalc — usuários de teste (W2)') o **código de verificação** do **Vendedor**
     (`vendedor_codigo_verificacao`) — e, se as contas foram criadas pelo painel, usuário e senha do Vendedor e do Comprador."
  8. (plano B do I6 — só se a aplicação real recusou o vendedor de teste na Task 1) "Em **Contas de teste**, crie uma conta do tipo
     **Integrador**; entre nela no painel de desenvolvedor e crie uma aplicação **PhysiqCalc Teste** (Checkout API / Marketplace) com a URL de
     redirecionamento `https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging`; salve no cofre pela tela o Client ID e
     o Client Secret dela (item 'Mercado Pago — PhysiqCalc — aplicação de teste (W2)', campos `client_id` e `client_secret`)."
  Depois (eu): conferir pela API, só leitura — `GET /applications/<id>` → `callback_urls` com as 3; `notifications_topics` (passo 6);
  `cd ~/projetos/physiqcalc-w2 && python3 scripts/segredos/mp_conta.py oauth copiar && python3 scripts/segredos/mp_conta.py oauth conferir`
  (passos 5 e 8); `python3 scripts/segredos/mp_conta.py assinatura copiar && python3 scripts/segredos/mp_conta.py assinatura conferir` (passo 6) e
  republicar a `mp-webhook-aluno` (o segredo é lido no boot); `python3 scripts/segredos/mp_conta.py usuarios-teste criar` (passo 7: só regrava os
  arquivos); `MP_OAUTH_PKCE` conforme o passo 4; com o passo 8, republicar `pagamentos-aluno`, `mp-conectar-retorno` e `mp-contas-renovar` (o
  `oauthDoAmbiente("staging")` passa a usar o client de teste).
- [ ] **Step 2: A prova (se a Task 1 ficou para cá)** — com o redirect novo, pelo fluxo de verdade do staging: `cd ~/projetos/physiqcalc-w2 &&
  P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P python3 e2e/w2/api.py --casos oauth_real --redirect-proprio`
  (o Playwright entra como o vendedor de teste — o código do painel no cofre —, autoriza, a volta cai na `mp-conectar-retorno/staging` →
  `?mp=confirmar&c=…` → `prof_mp_confirmar` como o prof2). Travou no login → ELE abre no navegador dele o link curto do `prof_mp_conectar`
  (eu rodo como o prof2 e mando), entra como o vendedor de teste e autoriza — a volta cai no site, ele toca "Conectar" na pergunta. Eu confiro
  (só leitura): integração `oauth`, `mp_teste`, collector = o vendedor, `mp_public_key` presente ou não. Sem a chave → a **Task 5** entra agora
  (o padrão da P-C), com Task 21/22 para ela (staging → produção, flag ainda desligada) e a Pergunta 1. Com a chave → o resto do `oauth_real`
  (o pagamento e a renovação) no staging.
- [ ] **Step 3: O teste de produção — o 1º personal de verdade = a conta MP DELE (Pergunta 2), com a flag desligada (o master não é segurado).
  Pix, cartão e a automática — tudo de R$ 1,00 e devolvido (revisão I12)**
  1. **Eu**: a foto do modo e da integração da conta "Admin Teste" (`admin.teste`, master de teste — hoje `mercadopago`) e da mensalidade do aluno
     de teste (`teste@teste.com`: valor, `mensalidade_pago_ate`, a assinatura); a mensalidade em R$ 1,00 (`prof_definir`).
  2. **Ele**, no **SITE** de produção (celular ou PC — conta master não entra no APK desde a hml-08), 1 passo por mensagem: entrar como `admin.teste`
     (a senha está no cofre) → Configurações › Recebimento → **Mercado Pago (sua conta)** → **Conectar com o Mercado Pago** → entrar na conta MP
     DELE → **Autorizar** → volta para a tela com a pergunta "Conectar a conta <apelido> do Mercado Pago?" → **Conectar** → "Pronto: o seu
     Mercado Pago está conectado" → print. (MENOR 33: a conta dele é a DONA da aplicação PhysiqCalc — a doc não diz se o MP deixa o dono
     autorizar a própria aplicação; recusou → a opção (2) da Pergunta 2: um personal de verdade que ele indicar.)
  3. **Ele**, no celular, no **APK de PRODUÇÃO** (o caminho do aluno com o dinheiro de verdade — I7 da W1), como o aluno de teste (`teste@teste.com`,
     senha no cofre) → Perfil › Pagamentos:
     a. **Pix**: **Pagar R$ 1,00** → **Pix** → copiar o código → pagar no app do banco → voltar ao app → "Pagamento confirmado!" → print;
     b. **cartão** (I12a): **Pagar R$ 1,00** → **Cartão** (o formulário do cartão abre com a chave pública DELE) → um cartão de verdade dele →
        "Pagamento confirmado!" → print;
     (O "Conectar" pelo APK não tem personal NÃO master de teste na produção para provar: é o `Browser.open` do SITE + `browserFinished` — o mesmo
     da W1 no APK com a InfinitePay; anotado no PR como risco aceito.)
  4. **Eu**, só leitura: as 2 cobranças `paga` no `public` com `mp_collector_id` = o user dele; o aviso do MP chegou na
     `mp-webhook-aluno?schema=public&conta=…` (o log `aviso_mp_conta` e a `x-signature`: `valida|ausente`); no log da `pagamentos-aluno`, o
     `aluno_mp_cartao` sem `cartao_recusado` (o `card_token` gerado com a chave do vendedor foi aceito na conta dele); o "pagamento confirmado"
     ao aluno; os logs das funções sem erro novo.
  5. **Eu**: `prof_reembolsar` das 2 como `admin.teste` (o token DA CONTA dele) → os R$ 1 voltam; a cobertura do aluno de teste volta à foto
     (VENCIDA — para a automática cobrar na hora, sem `start_date`).
  6. **A automática (I12b)** — **Ele**, no APK, como o aluno de teste: **Cobrança automática todo mês** → o cartão dele → print. **Eu**, só
     leitura: a `aluno_assinaturas` `authorized` com `mp_collector_id` = o dele; esperar a cobrança do mês (a 1ª, na hora) entrar como `paga` —
     pelo aviso `&conta=` OU pelo aviso SEM conta do painel (o `user_id` dele — I1) OU pela busca do I1 (o `aluno_status` do aluno / o diário):
     anotar QUAL caminho trouxe (o log `aviso_mp_conta` × `mp_automatica_rede`) — isso decide se o roteamento pelo `user_id` é o caminho ou só
     a rede. **MENOR 32:** a doc diz que, ao criar com cartão, o MP faz "uma cobrança de valor mínimo, que é estornada" — se ela aparecer com a
     referência `…:recorrente` e virar mensalidade `paga` (+1 período), anotar o `status_detail`/`operation_type` dela e abrir uma task extra
     para o `registrarPagamentoAvulsoDoMp` ignorar o que não é cobrança da automática (com R$ 1, a validação e a 1ª cobrança podem ter o mesmo
     valor: comparar pela data e pelo tipo). Depois: `aluno_mp_cancelar` (o token da conta dele) → `cancelled` no MP; `prof_reembolsar` da
     cobrança da automática.
  7. **Eu**: `prof_mp_desconectar` → o modo volta; o master devolve `mercadopago` à "Admin Teste" (`master_conta_acao`) e a mensalidade do aluno de
     teste volta à foto. As cobranças de R$ 1 (reembolsadas) FICAM no histórico de teste.
  Qualquer ❌ → NÃO ligar a flag: corrigir (task extra), repetir este Step. (Se o MP recusar porque é ele pagando ele mesmo, o R$ 1 sai do cartão/
  da conta de outra pessoa que ele escolher — no Pix e no cartão.)
- [ ] **Step 4: A assinatura dos avisos** — nas notificações de verdade do Step 3 (e do staging), a `x-signature` veio `valida` em TODAS → `update
  public.app_config set valor = '{"exigir_assinatura": true}' where chave = 'mp_webhook'` (e no staging). Veio `ausente`/`invalida` em alguma
  (ex.: as do `notification_url` por pagamento — a doc não diz se vêm assinadas) → fica só registrando (anotar no PR seguinte).
- [ ] **Step 5: Ligar para todos (com o OK dele — Pergunta 2)** — `update public.app_config set valor = '{"liberada": true}'::jsonb where chave =
  'mercadopago_conta'` (Management API, 1 comando); conferir na tela de Recebimento de uma conta de TESTE de produção que não é master: a opção
  aparece. Memória + Validação: "Mercado Pago do personal liberado"; o JSON da foto: W2 inteira "feito".

---

## Riscos (e o que segura cada um)

0. **A W2 começar sem a W1b** (o C1 da revisão: o estorno/cancelamento/detalhe sobre o pagamento que a linha dissesse). A Task 0 confere a W1b
   na `main` e o gatilho dela LIGADO nos 2 schemas (catálogo) — sem isso a W2 não começa; o `sql_w2` (caso 15), o `--local`
   (`reembolso_forjado`) e o `--so-catalogo` da Task 22 conferem de novo com a W2 por cima.
1. **A `public_key` não vir, ou o MP não aceitar um vendedor de teste na aplicação de conta real.** A prova é a Task 1 (antes do código), agora
   pelo caminho medido (o code no PEDIDO, a escolha de país, o código do painel — I6); a decisão 14 deixa o app seguro sem a chave (só Pix); a
   Task 5 está desenhada (P-C, padrão "página do MP"); se a aplicação real recusar o vendedor de teste, o plano B (a aplicação de TESTE de um
   integrador, client só no staging) tira essa dependência; o pior caso empurra a prova para a Task 23.
2. **O refresh_token GIRA — perder o par novo trava a conta.** Trava de 2 min por conta, gravação condicional pelo refresh antigo, 3 tentativas de
   gravar, `invalid_grant` relido antes de marcar erro, 2xx fora do formato guarda ao menos o refresh (MENOR 13), renovar no pedido só com ≥ 10 s
   de prazo (MENOR 12), e o pior caso vira "conecte de novo" com aviso (nunca um erro calado). Testado no Vitest e no simulador (`renovar`, 2
   renovações juntas, `renovar_formato`).
3. **Função compartilhada staging × produção** (7 funções publicadas antes da migration no `public`): `schemaTemW2` + UMA migration + **a regra
   da coluna nova** (C2: a `mp_collector_id` só por `colunasAssinatura`/`comCollector`/`COLUNAS_COBRANCA_W2`, com o Vitest SEM a W2 e a guarda de
   fonte — o smoke só leitura não pega a gravação) + smoke só leitura no `public` logo depois de publicar (Task 14, Step 4) e depois da
   migration (Task 22, Step 5).
4. **Vazamento de token.** Cifra com a chave fora do banco e dado associado; a tabela sem grant para o app; nada em log, resposta ou `VITE_*`;
   as guardas de fonte (Task 18); a chave no cofre (perder = todos reconectam) e o `chave gerar` que nunca gera por cima (I10); nenhum segredo
   passa pela conversa do agente — tudo pelo `mp_conta.py` (I9).
5. **Aviso forjado ou enxurrada no webhook.** Recurso buscado com o token da conta + collector + live_mode + referência da conta; conta
   desconhecida não gera ida ao MP; o 401 de recurso alheio não derruba a conexão (`/users/me` antes — I2); teto por conta (depois de achada a
   integração) e por IP só no que vem sem `user_id` (MENORES 6 e 26); corpo ≤ 16 KB medido antes de ler (MENOR 4); **sem cache de "repetido"**
   (I4 — o tratamento é idempotente); `x-signature` (exigida só depois de provada).
6. **Automáticas órfãs (MENOR 7) e em dobro (I11).** Gatilho para todos + RPC + master-contas com o OK + desconectar que não troca se uma não
   cancelar + a automática antiga cancelada e CONFERIDA antes de criar a nova. Sobra o caso "o personal revogou o acesso no MP e tem automática
   viva": o Physiq não alcança — reconectar resolve; senão o master força (decisão 11), avisando os alunos (MENOR 17).
7. **A conexão cai (revogada, senha trocada, 180 dias).** 401 → `/users/me` → renova → erro + aviso (1/dia) + "Conectar de novo"; o diário
   (`/users/me` 1×/dia — MENOR 27) e o `mp-connect` pelo painel descobrem sem esperar um aluno pagar; webhook 500 até reconectar; a fila tenta
   24 h. A exclusão do personal com a conexão caída e automática viva para com o 502 de sempre (suporte). O aluno não consegue PAGAR pelo app
   enquanto isso — mas a tela Pagamentos abre (I3); a trava do inadimplente é a Pergunta 3.
8. **Pix sem chave na conta MP do personal** → erro claro ao aluno + aviso ao dono (decisão 16).
9. **A aplicação aparece com `sandbox_mode: true` e `not_certified`** (fato (a)). Hoje ela já cobra em produção com o token dele; se o OAuth de
   um vendedor real exigir algo a mais no painel, o teste de produção (Task 23, Step 3) mostra antes da flag.
10. **O limite da aplicação no MP (18.000 pedidos/hora) é de todos os personais juntos.** Renovação só quem vence em < 30 dias, o diário 1×/dia
    por conta (até 50 por hora), conferências limitadas como hoje, webhook com teto.
11. **Login automático no MP (Task 1 e `oauth_real`)** pode cair em captcha ou no código de verificação: o script para com print; o código vem do
    cofre (o painel — W2-a, passo 7, que pode ser pedido já na Task 1); a prova vai para o FIM se precisar.
12. **A LINUX 1 nos pontos de encontro** (`logsDasFuncoesPrincipal.test.ts`, `e2e-rodadas.md`, `FinanceiroDoAluno.tsx`) e as funções
    `master-contas`/`excluir-minha-conta`: quadro + aviso antes + rebase de 1 linha; a trava do BANCO também nas Tasks 13 e 19 (MENOR 25);
    travas uma por vez; a máquina única (`flock` + `--maxWorkers=2`).
13. **O teste de produção é ele pagando ele mesmo** (Pix e cartão para a própria conta) **e autorizando a própria aplicação** (MENOR 33): se o
    MP recusar, outra pessoa paga o R$ 1 / um personal de verdade conecta (ele escolhe — Pergunta 2).
14. **O aviso da cobrança mensal da automática pode não vir** (I1: a doc não garante o `notification_url` na assinatura). Três caminhos: o aviso
    `&conta=`, o aviso do painel pelo `user_id` (o passo 6 da W2-a, obrigatório) e a busca das cobranças (no `conferirAssinatura` e no diário);
    a automática de R$ 1 da Task 23 mostra qual funciona antes da flag. A cobrança de validação do cartão (MENOR 32) é medida ali.
15. **Login CSRF no OAuth (I8).** A volta não grava nada: só a sessão de quem começou confirma (RPC como a pessoa); no APK, o fluxo inteiro
    acontece no site, no navegador, com a sessão do site.

## Perguntas para ele

1. **P-C (só se a prova mostrar que falta a chave pública do personal):** sem ela o cartão do aluno não roda dentro do app. **(1)** o cartão
   abre a **página do Mercado Pago** (o padrão — já fica pronto) · **(2)** essas contas ficam **só com o Pix**.
2. **Teste de produção e liberar:** posso usar a **SUA conta do Mercado Pago**, conectada à conta de teste "Admin Teste" (pelo site), para 3
   testes de R$ 1,00 pagos pelo aluno de teste no APK — **Pix, cartão e a cobrança automática** (todos devolvidos na hora pelo próprio app; a
   automática cancelada) — e, dando certo, **ligar o Mercado Pago do personal para todos** (1 comando)? Até lá a opção fica escondida dos
   personais (o master vê). Atenção: a sua conta é a dona da aplicação do Physiq no Mercado Pago, e a documentação não diz se ele deixa o dono
   conectar a própria aplicação — se recusar, preciso de um personal de verdade para o teste (já me diga quem, se tiver alguém em mente).
   **(1)** sim (padrão) · **(2)** não — a flag fica desligada até um personal de verdade testar com você.
3. **Quando a conexão do MP de um personal cair** (ele tirou o acesso no MP ou venceu) e ele demorar a reconectar, os alunos dele não conseguem
   pagar pelo app (a tela Pagamentos continua abrindo). Nesse tempo: **(1)** a trava do inadimplente continua valendo (o padrão — é o que
   acontece hoje quando o MP cai) · **(2)** o app do aluno só avisa (não trava) até o personal reconectar.

---

## Self-review (feito ao escrever; refeito em 11/10 com a revisão)

- **Revisão de 11/10 aplicada** (`review-plano-w2.md`): os 2 CRÍTICOS, os 12 IMPORTANTES e os 36 MENORES — a tabela "Revisão de 11/10", logo
  depois da estimativa, diz onde cada um entrou. O **C1** saiu como a **W1b** (à parte, ANTES — o furo está aberto hoje na produção): aqui ele é
  pré-requisito conferido no catálogo (Task 0, Step 3b) e a W2 mantém a conferência da W1b nas ações que reescreve (Task 9), sem reescrever
  nada dela — os nomes e os testes da W1b vêm da verificação do C1 na produção (`c1-verificacao.md` §5: `trg_cobrancas_guard_mp` →
  `cobrancas_guard_mp()`, `pagamentoEDaCobranca` + `pagamentoDaLinha`/`exigirDaCobranca`, `e2e/w1/sql_w1b.py` e `api_w1b.py`; a W1b leva 1h50 a
  2h55, pior 4h25, fora da conta da W2). MENORES pulados: nenhum (o 18 foi resolvido por outro caminho: a página pública saiu com o I8).
- **O que mudei a mais do que a revisão pediu (achado ao aplicar):**
  - **I8 no APK:** confirmar pelo `browserFinished` (o que a revisão sugeria para o APK) não fecharia o furo — o app só teria o id da conexão
    que ele mesmo recebeu, e quem começa o fluxo é justamente o atacante. Por isso o Conectar do APK abre o SITE no navegador e o fluxo inteiro
    (começar, autorizar, confirmar) acontece lá, com a sessão do site (o login volta à tela com a busca — o H2 do repo, conferido em
    `src/rotas/entradaVoltaAoLink.test.tsx`). Sai a página pública `/mp/conectado` e a rota no `registro.ts` (um ponto de encontro a menos).
  - **I8 como a pessoa:** a gravação final é a RPC `recebimento_mp_confirmar` chamada com a sessão (jeito 2 — a regra global pede o service_role
    só onde não houver alternativa; com a sessão de volta, há); o I5 e o MENOR 29 moram dentro dela.
  - **I1 com trava do Physiq:** o roteamento pelo `user_id` do painel NUNCA pega a conta do Physiq (lida por `/users/me` com o token do
    schema) — no teste de produção (Task 23) a conta do MP dele é a dona da aplicação E a da integração do `admin.teste`; sem a trava, os avisos
    do MP do Physiq iriam para a conta do `admin.teste`.
  - **CHECK da integração:** o original recusava a conexão OAuth `ativa` sem `refresh_token` (que a decisão 8 e a prova preveem — "todos os
    campos da resposta são opcionais"): agora passa com `mp_erro = 'sem_renovacao'`.
  - **`externo: { assinatura }` no log do webhook:** o `_shared/log.ts` só aceita as chaves do `ExternoLog` (o `assinatura` sumiria calado) —
    foi para o `msg`; o mesmo para as CHAVES do corpo fora do formato (MENOR 13).
  - **`PagamentoMp` sem `collector_id`:** o tipo é do `cobranca-regras.ts` (cópia no Treino — não muda, decisão 18); o `mp-conta.ts` usa um tipo
    local (`PagamentoDaConta`).
- **Conferido rodando (11/10, numa pasta de rascunho — nada no repo):** o vetor da RFC 7636 (`node` e `openssl`); a Task 2 inteira no Vitest
  (19/19, com o node_modules da W1 por link) e no `deno check`; o `cifra-mp.ts` com o `Uint8Array<ArrayBuffer>` no Deno 2.5.2 E no `tsc`
  5.8.3 (o antigo dá TS2769/TS2322, como a revisão disse); o `mp-conta.ts` (esqueleto + o código novo da Task 4) e a `mp-conectar-retorno` da
  Task 8 no `deno check` contra os `_shared` REAIS da W1 com o Step 1/2 aplicados (só os ajudantes em prosa como esboço); a migration da Task 6
  inteira e as 6 funções plpgsql (inclusive a RPC nova) no parser do Postgres (`pglast` 8.5); os 2 scripts Python compilam, e o `chave gerar`
  com falsos: a 2ª vez não gera, "só num lado" para, a 1ª grava o cofre antes das funções, nenhuma saída leva a chave.
- **O pedido original desta tarefa, item por item:**
  - Task de PROVA logo no começo, antes de código → **Task 1**. Como obter o `code`, agora pelo que a revisão MEDIU: o `redirect_uri` tem de ser o
    cadastrado (`https://www.mercadopago.com`), então quem lê é o Playwright, **no PEDIDO** ao redirect (evento `request` + rota que devolve 200 —
    o servidor do MP responde 302 e apaga a query); a escolha de país ("Brasil" ou o `.com.br`); o código de verificação do painel (cofre).
    **Continua dando para fazer sem o endereço de retorno dele**, desde que o Client Secret esteja no cofre, o login do vendedor de teste passe
    e a aplicação real aceite o vendedor de teste; se travar, vai para o FIM com o plano B (a aplicação de teste de um integrador). Sem
    `public_key` → **Task 5**.
  - W2-a no FIM → **Task 23, Step 1** (8 passos: entrar, a aplicação, as 2 URIs e o **webhook do painel** obrigatórios; PKCE recomendado; Client
    Secret, código de verificação e o integrador de teste, condicionais).
  - Migration ÚNICA `20261011210000_w2_mp_personal.sql` na faixa reservada → **Task 6** (a `220000` é da W1b).
  - Jeito 2 → o navegador só fala com as funções; a gravação final da conexão é COMO A PESSOA; a exceção do service_role ficou só na troca do code.
  - MENOR 7 da W1 → decisão 11 (Tasks 6, 12, 16).
  - Webhook por conta → decisões 8–10 e 9 (sem cache, o `user_id` só no log, o caminho do painel), Tasks 4, 10, 11, 15.
  - Estimativa por task refeita (19h55 a 31h05, pior 46h35; a soma confere com a tabela) e o porquê da diferença para a da revisão.
  - "Perguntas para ele" (3, só negócio — a 2 agora com o cartão, a automática e o "dono autorizar a própria aplicação") e este Self-review.
- **Cobertura do desenho (§8 por cima):** §4.4.1–2 conectar e voltar conectado → T7/T8/T15 (+ a confirmação — I8); §4.4.3 Pix, cartão e automática
  → T9/T17 (+ T5); §4.4.4 dinheiro direto, sem taxa → token da conta, sem `marketplace_fee`/`application_fee`; "renova sozinho; caiu → aviso" →
  T4/T11/T15 (+ o diário); "desconectar ou trocar → cancela as automáticas + avisa os alunos" → T6/T7/T12; pré-requisito W2-a → T23; testes com
  usuários de teste (vendedor + comprador, sem dinheiro) → T1/T13/T14/T23; §5.1 dados → T6; §5.2 edges → T7–T11 (os nomes do desenho:
  `prof_mp_conectar`, `prof_mp_desconectar`, `mp-conectar-retorno`; `notification_url` com `&conta=` + `user_id`); §5.3 casos (trocar de forma com
  automática; trocar de conta com Pix aberto — I5) → T6/T7/T12; logs sem dado → T8/T10/T11/T18; Play (`ehLoja`) → T17/T19. **§8:** token da conta
  em TODAS as chamadas → T9 (a tabela) + T10 (webhook, fila, exclusão) + T12 (master), provado ação por ação no `--local` (MENOR 16); a prova
  antes do plano → T1; a trava no banco → T6 (`contas_guard_mp`); pg_cron no principal → T6; 180 dias → T4/T11.
- **Spec-review (W2):** "o token da conta em todas as chamadas" → T9/T10/T12; "W2 no front" (SDK uma vez só, chave do build) → T17; "W2
  segredos" (RLS não esconde coluna → tabela sem grant; client_id/secret; chave de cifra; o state de uso único) → T0b/T6/T7/T11; "forma de
  receber × formas do plano" → T6/T12; "gravar qual credencial em cobrancas e aluno_assinaturas" → `mp_collector_id` (decisão 7) com a regra da
  coluna nova (C2); respostas 4 (PKCE; refresh novo a cada vez; `mp-connect`) → decisões 4, 8, 9 e o passo 6 da W2-a; 5 (AES-GCM) → T3; 6
  (pg_cron) → T6.
- **Lições da W1:** a tabela do cabeçalho (C1, I1–I7, MENORES 4/7/9/12/16 e o desfazer com ids à parte) — o I6 dela atualizado (sem cache).
- **Sem marcador pendente:** onde o plano manda copiar (os 3 corpos SQL, a classe `Tela`, o `lerCorpo` da `erro-avisar-regras.ts`, o `api.py`)
  ele diz de onde e quais linhas; os nomes da W1b vêm do `c1-verificacao.md` §5 e a Task 0, Step 3b os confere no catálogo e no código (outro
  nome no PR da W1b → anotar no topo). O código escrito segue as regras R1–R4 do `checar-funcoes` (`{ data, error }` + `throw`, nenhuma gravação descartada, `fetch` só pelo
  `buscarComTempo`/`mpFetch`, `.limit(50)`); o que ficou em prosa (`marcarErro`, `avisarDonoDaConexao`, `credencialDaCobranca`, `conferirConta`,
  `apelidoDoMp`, o corpo do `tratarDaConta`) tem o molde e o comportamento escritos.
- **Nomes iguais em todas as tasks:** `mercadopago_conta`; `mp_user_id`, `mp_apelido`, `mp_public_key`, `mp_access_token`, `mp_refresh_token`,
  `mp_expira_em`, `mp_teste`, `mp_origem` (`oauth`·`teste_sem_oauth`·`teste_local`), `mp_renovado_em`, `mp_renovando_ate`, `mp_renovar_tentativas`,
  `mp_renovar_proxima_em`, `mp_erro`, `mp_avisado_em`, `mp_conferido_em`, `conectado_em`, `desconectada_em`; `mp_conexoes` (`estado_hash`,
  `verificador`, `redirect_uri`, `expira_em`, `usado_em`, `resultado`, `token_access`, `token_refresh`, `token_expira_em`, `mp_user_id`,
  `mp_apelido`, `public_key`, `live`, `renovavel`); `mp_collector_id`; `mp_automaticas_vivas`, `contas_guard_mp`, `contas_saiu_do_mp_conta`,
  `cobrancas_guard_mp_conta`, `mp_integracao_reservar`, `mp_contas_renovar_disparar`, `recebimento_mp_confirmar`, job `mp-renovar-{schema}`,
  Vault `physiq_mp_renovar_segredo`, S10 `SEGREDO_MP_RENOVAR`; flags `mercadopago_conta` e `mp_webhook`; `MP_CLIENT_ID`, `MP_CLIENT_SECRET`,
  `MP_CLIENT_ID_STAGING`, `MP_CLIENT_SECRET_STAGING`, `MP_TOKENS_CHAVE`, `MP_WEBHOOK_ASSINATURA`, `MP_OAUTH_PKCE`, `MP_API_BASE`, `MP_AUTH_BASE`;
  `REDIRECT_TESTE_MP`, `redirectDoSchema`, `notificacaoDaConta`, `URL_API_PROPRIA`, `ehUrlDeAutorizacaoMp`, `modoDaConexaoConfere`, `ehUuidMp`,
  `lerAvisoDoMp`, `lerAvisoDaConta`; `CredencialConta`, `CredencialMp`, `ContextoMpConta` (o `ContextoMp` do `planos-automatica-mp.ts` é outro),
  `MpContaSemAcesso`, `schemaTemW2`, `COLUNAS_ASSINATURA`, `colunasAssinatura`, `comCollector`, `collectorDe`, `integracaoMp`,
  `credencialDaConta`, `trocarCodigo`, `guardarParaConfirmar`, `renovarConta`, `mpContaFetch`, `chamarMp`, `buscarNaConta`, `marcarErro`,
  `avisarDonoDaConexao`, `credencialDaCobranca`, `credencialDaAssinatura`, `registrarCobrancasDaAutomatica`, `conferirConta`,
  `pacientesComAutomaticaViva`, `cancelarAssinaturasPorCredencial`, `oauthDoAmbiente`, `lerSemDerrubar`, `tratarDaConta`, `pelaContaDoUserId`,
  `collectorDoPhysiq`, `lerAte`; as ações `prof_mp_conectar`, `prof_mp_confirmar`, `prof_mp_desconectar`, `prof_mp_simular_conexao`; os
  retornos `ok`·`negado`·`vencido`·`invalido`·`falhou`·`outra_conta`·`conectado_sem_trocar`·`confirmar`·`conta_de_teste`·`outra_pessoa`·
  `mp_em_outra_conta`; os erros novos `assinatura_antiga_viva`, `so_o_dono`, `mp_outra_pessoa`, `mp_vencido`, `mp_invalido`; na tela
  `data-recebimento-mp-conta`, `data-mp-situacao`, `data-mp-conectar`, `data-mp-conectar-destaque`, `data-mp-confirmar`, `data-mp-reconectar`,
  `data-mp-desconectar`, `data-mp-retorno`, `data-mp-indisponivel`, `data-brick-chave`, `data-mp-conta-da-conta`, `data-desligar-mp-conta`; o script
  `scripts/segredos/mp_conta.py` (`cofre campos`, `oauth local|copiar|conferir`, `usuarios-teste criar`, `chave gerar|conferir`,
  `assinatura copiar|conferir`).
- **Conferido no código e no banco antes de escrever:** os corpos vivos de `w27_conta_linha`/`master_integracoes` (W1 :372/:408), `master_conta_acao`
  (w27 :212–358, o ramo :330–336) e o `contas_guard` (W1 :193 — a W2 não recria); o CHECK nomeado `contas_recebimento_modo_check` (W1); a tabela
  `recebimento_integracoes` e o gatilho da conta encerrada (W1 :86–109 e :443–454); o `mpTransitorio` com o 401 e a cópia no Treino (não muda);
  o `mpFetch`/`tokenMp`/`credencialDoSchema` (`cobranca-mp.ts`; o 401 "recurso de outra conta" em :120/128); as 13+ idas ao MP da
  `pagamentos-aluno` com a `credencial` do schema (o `assinaturaDe` :591-597, o `conferirAssinatura` :617-627, o `aluno_mp_assinar` :1121-1170, o
  cartão :1100-1117); a busca `/authorized_payments/search` da `cobranca-conta` (:250-271); o `mp-webhook-aluno` lendo o corpo com `req.json()`
  (:196-200) e sem `permitido`/`PROXY_SEGREDO`/`JSON_H`; o `lerCorpo` com limite da `erro-avisar-regras.ts` (:260); o `ExternoLog` fechado do
  `log.ts`; a `automaticas-fila` e a exclusão com a credencial do schema (o `try/catch` de :141-148); o `cancelarAssinaturasDasMatriculas` que
  lança no MP sem resposta (:139-141); o `master-contas` → `master_conta_acao` como a pessoa; a hml-01 (H-02) tirando a `w27_conta_linha` do
  `authenticated` e o `e2e/hml01/banco.py` (`INTERNAS`) que confere; o `checar-definer` fora do `test:node` (o CI roda à parte); o
  `e2e/w10/api.py` com `--schema staging` de padrão; o `abrirPagamento.ts` que só abre a InfinitePay; o login que volta à tela com a busca (H2);
  o `servidor.py` (o cliente do cofre por stdio, o `gravar_arquivo` 600, o `Remoto`) e o MCP do cofre (`salvar_segredo`: login/token/…); o
  `sdk-react` 1.0.7 que reinicia pela chave; o Worker `physiq-principal-api` (GET com busca, `redirect: "manual"`, `x-physiq-ip`/`x-physiq-proxy`);
  os segredos das funções (sem client do MP) e os 4 do Vault; os 17 jobs do pg_cron; o `aluno_assinaturas` (RLS sem escrita para o app,
  `mp_preapproval_id` único); no `public`, 3 contas `mercadopago` e nenhuma automática viva; e a aplicação do MP (só leitura:
  `callback_urls = ["https://www.mercadopago.com"]`, sem webhook no painel, escopo `offline_access`).
- **Fontes externas consultadas (11/10/2026):** mercadopago.com.br/developers/pt/docs/security/oauth/creation ·
  …/en/reference/authentication/oauth/_oauth_token/post · …/pt/reference/authentication/oauth/overview.md · …/pt/docs/security/oauth/renewal ·
  …/pt/docs/security/oauth/management · …/pt/docs/your-integrations/test/accounts ·
  …/pt/docs/checkout-api-payments/additional-content/your-integrations/test/accounts · …/pt/reference/test_user/_users_test/post ·
  …/pt/docs/your-integrations/notifications/webhooks (e a versão em inglês) · …/pt/docs/your-integrations/notifications/additional-info ·
  …/pt/docs/checkout-pro/payment-notifications · …/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments ·
  …/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks · …/en/docs/checkout-pro/how-tos/integrate-marketplace ·
  …/pt/docs/checkout-api-payments/how-tos/integrate-marketplace · …/en/docs/mcp-server/tools · …/en/docs/mcp-server/connection ·
  mercadopago.com.pe/developers/pt/docs/checkout-pro/integration-test/test-purchases (os 6 últimos dígitos do id — outro país) ·
  RFC 7636 Apêndice B · cesarayala.dev/blog/mercado-pago-split-payments-marketplace (não oficial: "public_key may also be present — don't depend
  on it"). Medido pela revisão (só GET): o 302 do `https://www.mercadopago.com/?code=…` sem a query; a escolha de país no `auth.mercadopago.com`;
  o `auth.mercadopago.com.br` → login do MLB.
