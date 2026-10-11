# W1 — InfinitePay: o aluno paga o personal pela página da InfinitePay — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** em **Configurações › Recebimento** o dono da conta escolhe **InfinitePay**, cola a InfiniteTag e toca em "Testar"; o aluno toca
em "Pagar", a página da InfinitePay abre por cima do app (Pix ou cartão até 12×), volta e a cobrança aparece **paga, sem comprovante** —
a baixa só acontece depois de **conferir o pagamento na API da InfinitePay** —, e o personal recebe **"pagamento confirmado"** no sino.
Vale para a mensalidade/plano (com o retrato da W-P: modalidade, "parcela n de N", meses cobertos) e para a cobrança avulsa. Junto
(combinado com a LINUX 1 na hml-19), **as gravações de Configurações › Recebimento (`recebimento_chaves` e `contas`) saem do navegador e
passam para a função** (jeito 2).

**Architecture:**
1. Banco principal (`{schema}`), numa migration só (revisão I2):
   - `contas.recebimento_modo` e `cobrancas.forma` aceitam `infinitepay`;
   - a própria cobrança é a **tentativa** (colunas `ip_*`, prazo de 72 h — W1-B1);
   - só para o servidor: `recebimento_integracoes` (a InfiniteTag), `infinitepay_links` (um `order_nsu` por link, `<cobranca_id>-<n>`,
     com a InfiniteTag e o preço dele — revisão I4) e `infinitepay_avisos` (a **caixa de avisos** do webhook e da volta da página);
   - guardas por gatilho;
   - `infinitepay_rodada()` no pg_cron a cada 15 min.
2. Servidor: regras puras `_shared/infinitepay-regras.ts` (reexportadas na tela), cliente `_shared/infinitepay.ts` (fetch com tempo) e a
   baixa `_shared/infinitepay-baixa.ts` (**só depois do `payment_check`**, idempotente; numa cobrança já paga, outro NSU só avisa o
   personal — revisão C1). A `pagamentos-aluno` ganha as ações do aluno
   (`aluno_ip_link`, `aluno_ip_volta`, `aluno_ip_conferir`) e do Recebimento (`prof_recebimento`, `prof_recebimento_salvar`,
   `prof_ip_testar`, `prof_chave_salvar`, `prof_chave_ligar`, `prof_chave_excluir` — gravando **como a pessoa**). Função nova
   `infinitepay-webhook-aluno` (verify_jwt false): registra o aviso, responde em < 1 s e confere em segundo plano.
3. Tela: Recebimento pela função (sem `principal.from`); `PagarInfinitePay` (`@capacitor/browser` no APK, aba reservada no toque no site,
   confere ao voltar); os rótulos da P-B ("Período todo"); o master vê e desliga.
4. Uma função para `public` e `staging`: o que é novo só liga com a migration no schema (`schemaTemW1`); na produção a opção fica
   **escondida dos personais** (flag `app_config.infinitepay`) até os 2 testes de R$ 1 do Weslley (Task 22: o do staging e o do APK na
   produção — revisão I7).

**Tech Stack:** Postgres (`{schema}`, pg_cron e pg_net já existem no principal), Deno edge (supabase-js 2.39), React 18 + Vite + TanStack
Query + Capacitor (`@capacitor/browser` já no `package.json`), Vitest, E2E em Python + Playwright (`--canal msedge`), Deno 2.5 local
(`~/.deno/bin/deno`) para o simulador.

**Entradas (nesta ordem de precedência):**
- Desenho aprovado: `~/Desktop/Physiq - InfinitePay/Physiq - InfinitePay e Mercado Pago do personal - desenho aprovado - 2026-10-10.md`
  (a **seção 8 vale por cima** das 4 e 5). Só a W1 entra aqui; a W2 (MP do personal) é outra worktree.
- Spec-review: `~/projetos/physiqcalc-scratch/migracao-yuri/spec-review-planos-e-recebimento.md` (W1-B1, W1-B2, "Importante" da W1).
- Mestre: `docs/superpowers/plans/2026-10-10-planos-infinitepay-mp-plano-mestre.md` (§0 regras, §2 gates, §4.2 W1, §5 riscos, §6).
- API: memória `referencia-infinitepay-api-checkout` (checkout HOSPEDADO; sem chave, sem sandbox, webhook sem assinatura).
- Contrato com a LINUX 1: `~/projetos/physiqcalc-scratch/hml/hml19/para_linux3.md` (b) "Recebimento (`recebimento_chaves` e `contas`:
  forma e bloquear inadimplente) → W1 (`prof_recebimento_salvar`)".
- Formato: o plano detalhado da W-P (`docs/superpowers/plans/2026-10-10-w-p-planos-do-aluno.md`).
- Revisão crítica deste plano (11/10): `~/projetos/physiqcalc-scratch/w1/review-plano-w1.md` — aplicada (seção "Revisão de 11/10").

**Fatos da API sondados em 11/10 (04:44–04:59, curl na API de verdade, sem pagar):**
- (a) Checkout externo DESLIGADO na conta, **ou** InfiniteTag que NÃO existe → o `POST /links` responde HTTP 404:
  `{"success": false, "error": "external_checkout_not_enabled", "message": …, "redirect_url": "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true"}`.
  - A API não separa os 2 casos. O "Testar" e o salvar dizem "Confira a InfiniteTag e ative o checkout externo na InfinitePay", com o
    link de ativar (Task 3: erro `checkout_desligado` + `ativar`; Tasks 9 e 13).
  - No `payment_check`, a mesma resposta é SEM decisão: tenta de novo depois, nunca "não pago" (Tasks 3, 1b e 7).
- (b) Sucesso → HTTP 200 `{"url": "https://checkout.infinitepay.io/<handle>?lenc=…"}`, com ou sem `Authorization` (a chave da API NÃO
  é usada).
  - O link no tamanho máximo (descrição de 100, `order_nsu` de link, volta e webhook longos) deu **486** caracteres.
  - Por isso o teto da url sobe de 500 para **2048** (Task 1b e o CHECK da Task 5).
- (c) `payment_check` de um pedido que não existe → HTTP 200 `{"success": false}` (= não pago, decidido).
- (d) `order_nsu` repetido é ACEITO (2 links com o mesmo deram 200). A unicidade é nossa: um `order_nsu` por link, `<cobranca_id>-<n>`
  (I4: Tasks 1b, 5, 7 e 10).
- A InfiniteTag de teste está no cofre ("InfinitePay — InfiniteTag do Weslley (testes da W1)") e em `~/.physiq-infinitetag-teste` (600).
  O checkout externo dela está LIGADO: os casos do `e2e/w1/api.py` que criam link de verdade rodam (Tasks 12 e 20). A Pergunta 1 está
  respondida.
- Ainda NÃO se sabe (só um pagamento mostra — Task 22):
  - a busca da volta e o host do recibo;
  - o corpo do webhook, e se o `?schema=` chega nele;
  - se o `payment_check` aceita SÓ o `order_nsu`;
  - se o `payment_check` AMARRA o NSU e o slug ao pedido (as sondas do C1).

**Modo:** **até o fim** (decisão dele, 10/10 ~23h35–23h40: *"Segue sozinho wp W1, w2 e fim"* + `Skill-wbs-local-stg-prod-ate-o-fim`):
sem gates G1/G2; validação autônoma com evidência e prints nas 3 fases (local, staging, produção); **as coisas dele ficam para o FIM**
(na W1: os 2 pagamentos de R$ 1 — Task 22). A base é a `main` com a W-P: squash `99ddf94` (PR #180), bump v3.97 `c9be9a0`
(main = staging = `c9be9a0` em 11/10 03:52).

**Decisões fechadas (dele):** D1–D7 do desenho; **P-B = "1"** (10/10 ~20h25): nas contas InfinitePay "à vista" + "cartão parcelado" =
uma forma só, **"pagar o período todo"** (Task 2); ordem W-P → W1 → W2; o R$ 1 de verdade no FIM.

**Decisões técnicas minhas (registradas; aparecem na foto do plano):**
1. **Caixa de avisos** (`infinitepay_avisos`, 1 linha por link + NSU + slug — I4): o webhook e a volta só registram; a conferência no
   `payment_check` decide. Assim um POST forjado nunca apaga nem sobrescreve o aviso verdadeiro (o spec-review pedia "gravar primeiro e
   conferir depois" — gravar o NSU direto na cobrança deixava o forjado apagar o real).
2. **NSU único por (InfiniteTag, NSU)**, não sozinho: a doc não diz se o `transaction_nsu` é único entre contas da InfinitePay.
3. A **tentativa de mensalidade vencida sai do histórico** (`status cancelada` + `deleted_at`; é tentativa, não cobrança); a avulsa volta a
   `aberta`. A InfiniteTag e o preço de cada link ficam em `infinitepay_links` (I4): uma baixa atrasada confere com os do link pago.
4. **O master não liga a InfinitePay** (só o dono, com a InfiniteTag); ele vê e **desliga** (select de hoje + botão "Desligar"):
   `master_conta_acao` não muda (já recusa modo fora da lista). Pela RPC o master ainda CONSEGUE gravar a InfiniteTag de qualquer conta
   (`eh_master() or sou_dono`), e o update direto passa, porque a `contas_guard` pula o master. Não é furo de segurança: é o mesmo poder
   que ele já tem no MP, e a tela dele não oferece ligar (MENOR 15 da revisão).
5. **Flag `app_config 'infinitepay' {"liberada": false}`**: na produção a opção fica escondida dos personais (o master vê) até os testes
   de R$ 1 passarem — os 2 desde a revisão I7: o do staging e o do APK na produção. É a regra dele "sempre testar de ponta a ponta antes
   de finalizar (mock não é prova)". No staging, ligada.
6. **Sem `customer` no link** (LGPD: o mínimo; a página da InfinitePay pede o que precisar).
7. **Nenhuma ação "simular aprovação" da InfinitePay** (nem no staging): o caminho da baixa é provado no **Deno local com o simulador**
   (Task 11); nenhum código publicado dá baixa sem `payment_check`.
8. Avisos: aluno e personal recebem `pagamento_confirmado`. Os de problema vão ao personal como `geral` (o CHECK de `avisos.tipo` não muda):
   outro pagamento, NSU novo, valor diferente, o mesmo pagamento em 2 cobranças, sem confirmação, checkout desligado, já registrado à mão.
9. A **rodada do pg_cron reenvia ao próprio webhook público** (que confere tudo de novo): **nenhum segredo novo**.
10. "Testar" e "salvar a InfiniteTag" criam um **link de R$ 1,00 sem webhook** (é a InfinitePay que diz se a tag existe). A tag que não
    existe e o checkout externo desligado dão a MESMA resposta (fato (a)), então a tela diz as 2 coisas e mostra o link de ativar.
11. **Sair do Mercado Pago com cobrança automática viva cancela com o OK** (a regra cruzada do spec-review, escrita 1 vez em
    `prof_recebimento_salvar` — a W2 reaproveita).
12. **O plano que já tem uma modalidade fica com ela** ao salvar (`modalidadesPermitidasNoPlano`): sem isso o personal que passa do MP
    para a InfinitePay não conseguiria editar um plano com "cartão parcelado" que tem aluno (`modalidade_em_uso`).
13. **A função certa do Recebimento é a `pagamentos-aluno`** (contrato da hml-19); as ações do Recebimento usam um cliente **com a sessão
    de quem chama** (`dbPessoa`): o RLS de `recebimento_chaves`/`contas` e a guarda `contas_guard` valem de 2ª camada. O service_role fica
    no que já era dele (cobrança, aluno, MP) e na leitura da integração (tabela sem grant para o app, que vai guardar os tokens da W2).
14. `_shared/tempo.ts` e `_shared/log.ts` **não mudam** (as 2 têm cópia idêntica no Treino com teste byte a byte): o tempo da InfinitePay
    fica em `_shared/infinitepay.ts` e o log leva só o status HTTP.

**Correções da revisão de 11/10** (`~/projetos/physiqcalc-scratch/w1/review-plano-w1.md`: 1 CRÍTICO, 7 IMPORTANTES, 16 MENORES). Estão
aplicadas neste plano; onde cada uma entrou está na seção "Revisão de 11/10", logo depois da estimativa.

15. **C1 — numa cobrança JÁ paga, outro NSU nunca credita período nem troca o NSU.**
    - O "2º pagamento" (`outro_pagamento`) e o NSU novo numa cobrança paga só pelo pedido (`nsu_novo`) viram só um aviso `geral` ao
      personal, no máximo 1 por cobrança a cada 24 h.
    - A Task 22 sonda o `payment_check` com o R$ 1 pago: NSU errado, slug errado, outro `order_nsu`. Só depois dessa prova uma mudança
      futura pode automatizar.
16. **I1 — o "não pago" não fecha o aviso.**
    - O que vem do webhook ou da volta é REAGENDADO (`proxima_em` + contador; na 24ª fecha calado).
    - O aviso fechado sem pagamento REABRE quando chega de novo com o mesmo NSU e o mesmo slug.
17. **I2 — UMA migration**, `20261011200000_w1_infinitepay.sql`, numa transação por schema. A `201000` deixou de existir. O
    `cuidarDaInfinitePay` só roda na conta InfinitePay, ou quando há tentativa dela aberta.
18. **I3 — a tela não gasta tentativa.**
    - A conferência que a tela dispara só confere o aviso que já está na hora (`proxima_em <= now()`) e só adia 30 s.
    - O `aluno_status` e o `prof_aluno` conferem em 2º plano (`emSegundoPlano` → `EdgeRuntime.waitUntil`) e não esperam por ela.
19. **I4 — um `order_nsu` por link**, `<cobranca_id>-<n>`, na tabela `infinitepay_links` com a InfiniteTag e o preço de cada link. A
    confirmação usa a tag e o preço do próprio link.
20. **I5 — o registro à mão usa a mesma linha.** O `prof_registrar` da mensalidade, com a tentativa da InfinitePay aguardando, marca ESSA
    linha como paga "por fora". A confirmação da InfinitePay que chegar depois vira o aviso "já registrado", sem período a mais.
21. **I6 — a rota pública tem teto:**
    - o limite por IP usa o `ipDoPedido` (cf-connecting-ip);
    - aviso novo só de link com até 72 h + 7 dias;
    - no máximo 20 avisos por cobrança;
    - corpo até 16 KB.
22. **I7 — o 2º R$ 1 na produção, pelo APK**, com a conta do master de teste (a flag desligada não segura o master), ANTES de ligar a flag
    para todos.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase-principal/functions/_shared/infinitepay-regras.ts` (novo) | regras puras: InfiniteTag, centavos, corpo do link, o pedido de cada link (I4), volta, leitura do webhook/volta/`payment_check`, `decidirBaixa` (C1/I5), o que fazer sem baixa (I1/I3), o prazo e o teto da rota pública (I6), 72 h, reaproveitar, textos do sino |
| `supabase-principal/functions/_shared/infinitepay.ts` (novo) | cliente HTTP (`criarLink`, `conferirPagamento`, `pedidoDeTeste`) com tempo; simulador só em `http://127.0.0.1` |
| `supabase-principal/functions/_shared/infinitepay-baixa.ts` (novo) | `schemaTemW1`, `linkDoPedido`, `ultimoLink`, `novoLink`, `registrarAviso`, `conferirAviso`, `conferirAvisosPendentes`, `conferirPeloPedido`, `fecharVencidas` |
| `supabase-principal/functions/_shared/pix-chave-regras.ts` (novo — sai de `src/lib/pixChave.ts`) | validar/normalizar/formatar a chave Pix + `chaveDoPedido` + `COLUNAS_CHAVE` |
| `supabase-principal/functions/_shared/recebimento-regras.ts` (novo) | `lerPedidoDoRecebimento`, `MODOS`, `ROTULO_MODO` |
| `supabase-principal/functions/_shared/planos-regras.ts` | P-B: `modalidadesDaConta('infinitepay')`, `modalidadesOferecidas`, `modalidadesPermitidasNoPlano`, `rotuloDaModalidade` |
| `supabase-principal/functions/_shared/financeiro-mp.ts` | `Cobranca` com `ip_*` opcionais + `COLUNAS_COBRANCA_IP` (só tipo e constante) |
| `supabase-principal/functions/infinitepay-webhook-aluno/index.ts` (novo) | o webhook: forma → caixa → 200 em < 1 s → conferência em 2º plano |
| `supabase-principal/functions/pagamentos-aluno/index.ts` | `dbPessoa`, colunas por schema, `vista` com `ip_*`, 6 ações do Recebimento, 3 do aluno, ganchos no `aluno_status`/`prof_aluno` (em 2º plano), P-B no `prof_plano_salvar`, a tentativa aberta no `prof_registrar` (I5) |
| `supabase-principal/migrations/20261011200000_w1_infinitepay.sql` (novo — UMA migration, revisão I2) | Task 5: modos/formas, `ip_*`, integração, links (I4), caixa, flag, guardas, RPCs, `financeiro_do_aluno`, master, conta encerrada · Task 6 (no fim do mesmo arquivo): `infinitepay_fechar_vencidas`, `infinitepay_rodada`, pg_cron `infinitepay-rodada-{schema}` |
| `src/financeiro/infinitepay.ts`, `src/financeiro/recebimento.ts` (novos) | reexportam as regras do servidor para a tela |
| `src/lib/pixChave.ts` | vira reexport de `_shared/pix-chave-regras.ts` |
| `src/financeiro/abrirPagamento.ts` (novo) | `reservarAba`, `abrirPagina`, `abrirLinkExterno` (Browser no APK; aba reservada no site) |
| `src/financeiro/{tipos,api,regras}.ts` | modo/forma `infinitepay`, `RecebimentoDaConta`, `ChaveRecebimento`, chamadas novas, rótulos, `aguardando_ip`, mensagens |
| `src/painel/configuracoes/Recebimento.tsx`, `src/components/admin/RecebimentosLista.tsx`, `RecebimentoPixDialog.tsx` | Recebimento pela função + InfinitePay (Testar, salvar) |
| `src/master/{regras,tipos}.ts`, `src/master/paginas/Integracoes.tsx` | rótulo, KPI, a InfiniteTag e o "Desligar" |
| `src/painel/financeiro/{PlanoDialog,Planos}.tsx`, `src/financeiro/ui/{PlanoDoAluno,FinanceiroDoAluno}.tsx`, `src/painel/aluno/dados/regras.ts` | rótulos da P-B, o recibo da InfinitePay, a trava do painel com a tentativa vencida |
| `src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx` (novo), `src/app-aluno/perfil/Pagamentos.tsx` | pagar, conferir, a volta (`?order_nsu=`), o cartão "em andamento", o recibo |
| `src/lib/logsDasFuncoesPrincipal.test.ts` | função nova na lista (25) |
| `e2e/w1/sql_w1.py`, `e2e/w1/simulador_ip.py`, `e2e/w1/servir_local.ts`, `e2e/w1/api.py`, `e2e/w1/telas.py` (novos) | banco (blocos desfeitos), simulador, Deno local, servidor (staging + local), telas (site e loja; prod só leitura) |
| `docs/e2e-rodadas.md` | as rodadas da W1 (no PR) |

**Migration proposta** (reservada no quadro — a faixa `2026101120xxxx` é da W1; a LINUX 1 tem `20261011100000`–`140000`):
- **UMA só**, `20261011200000_w1_infinitepay.sql`. Até a revisão I2 eram 2: a `20261011201000` deixou de existir. A Task 5 escreve a 1ª
  parte e a Task 6 acrescenta a 2ª no fim do mesmo arquivo.
- Com `{schema}` e idempotente.
- Aplicada por `scripts/apply_migration_principal.py … --so staging|public`. O bloco de cada schema é UMA transação: entra tudo ou nada.
- **Dry-run antes**; testada por `e2e/w1/sql_w1.py`.

**Função nova:** `infinitepay-webhook-aluno` — **verify_jwt false** (a InfinitePay não manda JWT), sem segredo próprio. A
`pagamentos-aluno` continua **verify_jwt true**. `mp-webhook-aluno` e `automaticas-fila` não mudam (o `financeiro-mp.ts` só ganha tipo e
constante — não precisam ser republicadas).

**Segredos:** **nenhum novo.** A InfinitePay não tem chave (a InfiniteTag é o único identificador e não é segredo); o webhook não tem
assinatura (a defesa é o `payment_check` + a caixa + o limite por IP); a rodada chama o webhook público. Se nos testes de R$ 1 a InfinitePay
mostrar assinatura/segredo de webhook, entra como **S10** no molde do S9 (`scripts/segredos/servidor.py`: cofre + Vault + env, nunca no
repo nem em `VITE_*`) numa task extra. A **InfiniteTag de teste do Weslley** é dado pessoal, não segredo — e NÃO vai para o repo nem
para o log. Ela está no cofre B Code Segredos ("InfinitePay — InfiniteTag do Weslley (testes da W1)") e na cópia local
`~/.physiq-infinitetag-teste` (600), com o checkout externo LIGADO (sondado 11/10). A Pergunta 1 está respondida.

**A W1 NÃO toca (são da LINUX 1, hml-19):** `src/nutricao/prontuario/**`, `src/nutricao/editor/**`, `src/painel/dietas/**`,
`src/painel/aluno/avaliacao/**`, as migrations `20261011100000`–`20261011140000` (principal) e `20261011100000`–`120000` (Treino), a função
`nutricao` e os `_shared` novos dela (`porta-pessoa.ts`, `nutricao-*.ts`, `financeiro-gravar-regras.ts`). Pontos de encontro (combinar no
quadro antes de mexer): `src/lib/logsDasFuncoesPrincipal.test.ts` (as 2 somam função nova: quem entra depois resolve 1 linha no rebase),
`docs/e2e-rodadas.md` (linhas no topo), `src/financeiro/ui/FinanceiroDoAluno.tsx` (a 19d mexe na `:336` e no `TagsDoAluno`; a W1 no
`MODO_TEXTO` e nas ações da linha de cobrança) e `src/painel/aluno/dados/regras.ts` (a W1 só no `resumoDaTrava`).

**Regras de tela (todas as tasks de tela):** confirmação só com `useConfirmar()` (`src/ui/premium/useConfirmar.ts`; nunca
`window.confirm` — `semDialogoNativo.test.ts`); toda grade com `grid-cols-1` + breakpoint (`larguraCelular.test.ts`); textos para o
usuário final em PT-BR simples, sem termo técnico (nada de "webhook", "NSU", "handle" na tela: "InfiniteTag", "confirmação",
"página da InfinitePay"); versão da loja (`ehLoja`): o aluno paga o PROFISSIONAL igual — nada libera recurso do app.

Comandos usados em todo o plano (na worktree `/home/bertoldo/projetos/physiqcalc-w1`):
- **Pesado sempre na fila da máquina** (i3, pedido da LINUX 1): `flock ~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock <cmd>`
  (abaixo `flock $P <cmd>`; o shell não guarda variável entre chamadas: escrever `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock;`
  no começo da mesma linha). Vitest SEMPRE com `--maxWorkers=2`.
- Vitest de um arquivo: `flock $P npx vitest run --maxWorkers=2 <arquivo>` · tudo: `flock $P npx vitest run --maxWorkers=2` · tipos:
  `flock $P npm run tipos` · lint: `flock $P npm run lint` · CI local: `flock $P npm run test:node` (inclui `checar-definer` e `checar-funcoes`).
- Deno: `DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/<slug>/index.ts` (só erro NOVO conta).
- Migration: `python3 scripts/apply_migration_principal.py <arquivo> --so staging|public [--dry-run]` (backup do `public` antes:
  `python3 scripts/backup/backup_principal.py --pasta … --schemas public --tabelas …`).
- Função: `scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions <slug> <verify_jwt>` (`pagamentos-aluno true`,
  `infinitepay-webhook-aluno false`; o script recusa trocar o verify_jwt).
- E2E: um por vez, com a guarda de `/health` (os scripts param sozinhos se o Treino ou o principal não estiverem `ACTIVE_HEALTHY`).
- Commits: o comando inteiro em cada passo. Não há atalho no shell e nada persiste entre chamadas (MENOR 9 da revisão). A mensagem é
  em português e o 2º `-m` é a linha do coautor. Com subagentes na mesma worktree, o `-- <arquivos>` no fim leva só os arquivos da task:
  `git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <arquivos>`.

## Estimativa (minutos de trabalho, com testes e checagens; sem esperas de terceiros)

Revista em 11/10 com a revisão: entrou a Task 1b; as Tasks 5, 7–13, 16 e 22 cresceram. As Tasks 0–4 já estão feitas. A última linha é o
que FALTA.

```
+------+-------------------------------------------------------------+----------------------------+
| Task | O quê                                                       | Min–máx (pior cenário)     |
+------+-------------------------------------------------------------+----------------------------+
|  0   | Preparar a worktree — feita                                 | 15 a 25 (40)               |
|  1   | Regras puras da InfinitePay (TDD) — feita (169925e)         | 25 a 40 (60)               |
|  1b  | Correções da revisão nas regras puras (C1, I1, I3–I6)       | 30 a 45 (70)               |
|  2   | P-B: "período todo" nas contas InfinitePay — feita          | 15 a 25 (35)               |
|  3   | Cliente da InfinitePay (fetch simulado) — feita (d4e89d5)   | 20 a 30 (45)               |
|  4   | Regras do Recebimento no servidor — feita (7e674da)         | 15 a 25 (35)               |
|  5   | Banco: a migration (1ª parte: dados, links, travas) + stg   | 50 a 75 (110)              |
|  6   | Banco: a migration (2ª parte: 72 h e a rodada) + stg        | 20 a 35 (50)               |
|  7   | Servidor: a baixa (links, caixa, payment_check, reagendar)  | 40 a 60 (90)               |
|  8   | Servidor: função nova infinitepay-webhook-aluno (+ teto)    | 25 a 35 (55)               |
|  9   | Servidor: Recebimento pela função (jeito 2)                 | 45 a 65 (95)               |
|  10  | Servidor: o aluno paga pela InfinitePay (+ I5 no registrar) | 45 a 65 (95)               |
|  11  | Simulador local + Deno local + e2e/w1/api.py (19 casos)     | 55 a 80 (120)              |
|  12  | Staging do servidor: publicar + E2E (API real + simulador)  | 40 a 60 (95)               |
|  13  | Painel: Recebimento pela função + InfinitePay (+ ativar)    | 50 a 70 (100)              |
|  14  | Painel: master Integrações (vê e desliga)                   | 15 a 25 (40)               |
|  15  | Painel: rótulos da P-B, recibo e a trava do painel          | 20 a 35 (50)               |
|  16  | App: Pagar pela InfinitePay (site e loja)                   | 50 a 70 (100)              |
|  17  | Guardas de fonte                                            | 10 a 20 (30)               |
|  18  | Testes locais finais + E2E de tela + prints                 | 45 a 70 (110)              |
|  19  | Validação local (modo até o fim: sem gate)                  | 10 a 15 (25)               |
|  20  | Staging (front + funções + E2E um por vez)                  | 35 a 60 (90)               |
|  21  | Produção (banco, PR → squash, release, smoke só leitura)    | 45 a 70 (110)              |
|  22  | FIM: 2 R$ 1 (staging + sondas; APK na produção) + flag      | 45 a 70 (110) do meu lado  |
+------+-------------------------------------------------------------+----------------------------+
| TOTAL|                                                             | 765 a 1170 (1760)          |
| FALTA| 1b e 5–22                                                   | 675 a 1025 (1545)          |
+------+-------------------------------------------------------------+----------------------------+
```

**Total: 12h45 a 19h30 (pior cenário 29h20)** de trabalho. **Falta (1b e 5–22): 11h15 a 17h05 (pior cenário 25h45).**

Antes da revisão o total era 10h45 a 16h55 (pior cenário 25h35). A diferença (+120 a +155 min) vem de:
- a Task 1b;
- a tabela de links (I4);
- a reconferência que não perde pagamento (I1/I3);
- o teto da rota pública (I6);
- o registro à mão na mesma linha (I5);
- os 5 casos novos do `--local`;
- os 2 R$ 1 da Task 22 (I7).

O mestre previa 355–585 min. A diferença para ele é o jeito 2 do Recebimento (Tasks 4, 9 e 13), a caixa de avisos e a rodada (6 e 7), o
simulador com o Deno local (11), o "Desligar" do master e a flag.

Em paralelo, como na W-P (subagentes em arquivos separados):
- 1, 2, 3 e 4 juntas (feitas);
- a **1b** sozinha, antes da 5;
- **5 → 6** (o mesmo arquivo);
- **7 antes da 8**: a 8 importa o módulo da 7 e escreve no mesmo `describe` do `servidor.test.ts` (MENOR 8 da revisão);
- 9 e 10 depois da 7, uma de cada vez (o mesmo `pagamentos-aluno/index.ts`);
- depois de 9 e 10 (o contrato das ações fecha antes), a **13** primeiro (as peças comuns da tela: tipos, chamadas, regras, abrir a
  página) e então **14, 15 e 16 juntas**;
- a esteira (12, 20, 21) não paraleliza.

Com subagentes na mesma worktree, cada commit leva `-- <arquivos>`, só os da task: o `git add` de outro subagente não entra junto.
Atualizar o JSON da foto: `W1.estimativa_min = 1170`.

## Revisão de 11/10 — onde cada achado entrou

Fontes:
- a revisão `~/projetos/physiqcalc-scratch/w1/review-plano-w1.md` (1 CRÍTICO, 7 IMPORTANTES, 16 MENORES);
- os fatos da API sondados em 11/10 (cabeçalho);
- 3 ajustes depois da Task 3: o teto da url em 2048, o checkout desligado no `linkOuFalha` e na tela.

| Achado | O que mudou | Tasks |
|---|---|---|
| **C1** — o "2º pagamento" e a troca de NSU sem prova | Numa cobrança paga, outro NSU vira `outro_pagamento` ou `nsu_novo`: só um aviso `geral` (1 por cobrança a cada 24 h), sem período e sem trocar o NSU. O NSU que a InfinitePay devolver vale mais que o do aviso. O NSU compara sem diferença de maiúsculas. O simulador confere (ou não) o NSU. Sondas com o R$ 1 pago. | 1b, 7, 11 (`repetido`, `forjado_pago`, `pedido`), 22 |
| **I1** — o "não pago" fechava de vez | Reagendado (`proxima_em` + contador; na 24ª fecha calado). O aviso fechado sem pagamento reabre quando chega de novo. | 1b, 5 (CHECK), 6, 7, 11 (`naopago`) |
| **I2** — 2 migrations | UMA, `20261011200000_w1_infinitepay.sql`, numa transação. O `cuidarDaInfinitePay` só roda na conta InfinitePay ou com tentativa dela aberta. | 5, 6, 10, 12, 20, 21 |
| **I3** — a tela gastava as 24 tentativas | A tela só confere o que está na hora e não gasta tentativa (adia 30 s). O `aluno_status` e o `prof_aluno` conferem em 2º plano. | 1b, 7, 10 |
| **I4** — o mesmo `order_nsu` em 2 links | `infinitepay_links`: um pedido por link (`<cobranca_id>-<n>`) com a tag e o preço dele. A confirmação usa os do link. | 1b, 5, 6, 7, 8, 10, 11, 16 |
| **I5** — registro à mão + baixa atrasada = 2 períodos | O `prof_registrar` da mensalidade usa a tentativa aberta (a mesma linha). Depois, a confirmação vira `ja_pago_por_fora`, decidido antes do valor. | 1b, 10, 11 (`registrado`) |
| **I6** — a rota pública | Limite por IP pelo `ipDoPedido`. Aviso novo só de link com até 72 h + 7 dias, até 20 por cobrança, corpo até 16 KB. | 1b, 7, 8, 11 (`forjado`) |
| **I7** — nenhum R$ 1 pelo APK | O 2º R$ 1 na produção, pelo APK, com a conta do master de teste, antes da flag. | 22 |
| O teto da url (486 medidos) | De 500 para 2048, na regra e nos CHECK. | 1b, 5 |
| O checkout desligado (o 404 de 11/10) | O `linkOuFalha` devolve `infinitepay_checkout_desligado` + `ativar`. A tela mostra a frase e o botão de ativar. No `payment_check` é sem decisão. | 7, 9, 11 (`desligado`), 13, 16 |

MENORES aplicados:
- 1: o `criado_por` no caso 5 do `sql_w1`;
- 2: o `deleted_at is null` no `fechar_vencidas`;
- 3: com 0 linhas, relê e decide 1 vez; o 23505 vira `nsu_repetido` + aviso;
- 4: o `schema_sem_w1` responde 400;
- 6: as automáticas pelos `pacientes` da conta; as `falhas` voltam na resposta e o dono é avisado;
- 8: a 7 antes da 8;
- 9: o commit inteiro em cada passo, com `-- <arquivos>`;
- 10 e 16: anotados no PR;
- 12: a rodada do staging fica parada no `--local`;
- 13: o schema também no caminho do webhook;
- 14: a tentativa vencida volta ao "Pagar";
- 15: escrito na Decisão 4.

MENORES pulados:
- 5 (o cliente da hml-19a e a flag por RPC): depende da `porta-pessoa.ts`, que ainda não está na `main`. Fica anotado no PR.
- 7 (o select e o "Desligar" do master tiram a conta do MP sem cancelar as automáticas): é regra antiga da W27 (`master_conta_acao`), fora
  do que a W1 troca. Fica anotado no PR para a W2 (MP do personal), que mexe nas automáticas.
- 11 (`pago_em` = a data da InfinitePay): a doc não mostra data no `payment_check` nem no webhook. A Task 22 anota se vier. O efeito é de
  horas no "pago em", e só no "pago só pelo pedido".

---

### Task 0: Preparar a worktree (depois do merge da W-P)

**Files:** nenhum do app; o quadro `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` e o JSON da foto (fora do repo); a cópia deste plano em
`docs/superpowers/plans/2026-10-11-w1-infinitepay.md`.
**Estimativa:** 15 a 25 min (pior cenário 40 min)
**Status:** ✅ feita (a worktree, o plano no repo — `8a816ee` — e a InfiniteTag local).

- [ ] **Step 1: A W-P entrou na `main` e ninguém está nos mesmos arquivos (comando isolado)**

Run: `git -C ~/projetos/physiqcalc fetch origin && git -C ~/projetos/physiqcalc log origin/main --oneline -4 && git -C ~/projetos/physiqcalc worktree list && gh pr list --repo weslleybertoldo/physiqcalc --state open`
Expected: `origin/main` com o squash da W-P (`99ddf94`, PR #180) e o bump (`c9be9a0`, v3.97) ou mais novo; nenhum PR aberto tocando
`supabase-principal/functions/pagamentos-aluno/**`, `src/financeiro/**`, `src/painel/configuracoes/Recebimento.tsx`,
`src/components/admin/Recebimento*`, `src/app-aluno/perfil/**` ou `src/master/paginas/Integracoes.tsx`. Se houver, parar e combinar.

- [ ] **Step 2: Criar a worktree e o ambiente local**

```bash
git -C ~/projetos/physiqcalc worktree add -b feat/w1-infinitepay ~/projetos/physiqcalc-w1 origin/main
cp ~/projetos/physiqcalc-planos/.env.local ~/projetos/physiqcalc-w1/.env.local     # build de STAGING (VITE_DB_SCHEMA=staging)
cd ~/projetos/physiqcalc-w1 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P npm ci
```
Expected: worktree em `origin/main`; `npm ci` sem erro. (A `~/projetos/physiqcalc-planos` fica até a W-P fechar a Validação — não apagar aqui.)

- [ ] **Step 3: As funções do banco que a W1 troca ainda são as do corpo que este plano copia**

Run: `cd ~/projetos/physiqcalc-w1 && rg -n 'function \{schema\}\.(contas_guard|financeiro_do_aluno|w27_conta_linha|master_integracoes|master_conta_acao)\(' supabase-principal/migrations/ | sort`
Expected: a mais nova de cada uma = `20261002040000_w28_virada.sql` (`contas_guard` :25, `w27_conta_linha` :273),
`20261011010000_wp_planos_modalidades.sql` (`financeiro_do_aluno` :207), `20261009060000_hml14d_master_paginado.sql` (`master_integracoes`
:218), `20261002010000_w27_master.sql` (`master_conta_acao` :212, que a W1 NÃO troca). Uma migration mais nova (ex.: da hml-19) recriou
alguma → partir do corpo dela na Task 5 e anotar no PR.

- [ ] **Step 4: Base verde**

```bash
cd ~/projetos/physiqcalc-w1 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro src/painel/financeiro src/painel/configuracoes src/app-aluno/perfil src/master \
  src/lib/recebimentos.test.ts src/lib/logsDasFuncoesPrincipal.test.ts src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts
```
Expected: tudo PASS (é a base; o que falhar aqui não é da W1 — anotar e avisar antes de seguir).

- [ ] **Step 5: Quadro, aviso à LINUX 1 e a InfiniteTag de teste**

1. Editar `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` (com o Edit, nunca `sed -i`): na linha da LINUX 3, a frente vira "**W1
   InfinitePay** (até o fim)", worktree `~/projetos/physiqcalc-w1` (branch `feat/w1-infinitepay`), toca: `pagamentos-aluno/**`,
   `infinitepay-webhook-aluno/**` (NOVA, verify_jwt false — avisar antes de publicar), `_shared/{infinitepay-regras,infinitepay,
   infinitepay-baixa,pix-chave-regras,recebimento-regras}.ts` (novos), `_shared/{planos-regras,financeiro-mp}.ts`, `src/financeiro/**`,
   `src/painel/financeiro/{Planos,PlanoDialog}.tsx`, `src/painel/configuracoes/Recebimento.tsx`, `src/components/admin/Recebimento*`,
   `src/app-aluno/perfil/**`, `src/master/{regras,tipos}.ts`, `src/master/paginas/Integracoes.tsx`, `src/lib/pixChave.ts`,
   `src/painel/aluno/dados/regras.ts` (só `resumoDaTrava`), `src/lib/logsDasFuncoesPrincipal.test.ts` (1 linha), `e2e/w1/**`;
   migration **RESERVADA** `20261011200000_w1_infinitepay.sql` (eram 2 até a revisão I2 — a `20261011201000` ficou livre: a Task 5,
   Step 0, acerta o quadro); "Desde" = agora.
2. `SendMessage` à LINUX 1: "LINUX 3 começou a W1 (InfinitePay + Recebimento pela função, como combinado em para_linux3.md (b)). Arquivos
   e migrations no quadro. Pontos de encontro: logsDasFuncoesPrincipal.test.ts (1 linha cada), e2e-rodadas.md, FinanceiroDoAluno.tsx (eu:
   MODO_TEXTO e as ações da linha de cobrança), src/painel/aluno/dados/regras.ts (eu: só resumoDaTrava). Peço a trava do BANCO do staging
   só nas Tasks 5, 6, 12 e 20 (aviso antes)."
3. A InfiniteTag de teste: `mcp__bcode-segredos__listar_itens` (busca "InfiniteTag") → existe → `ler_segredo` → gravar em
   `~/.physiq-infinitetag-teste` (`chmod 600`). Não existe → **Pergunta 1** ao Weslley (terminal + tópico) e seguir: só os casos do
   `e2e/w1/api.py` que criam link de verdade esperam por ela. (Feito em 11/10: ela existe no cofre — "InfinitePay — InfiniteTag do
   Weslley (testes da W1)" — e o arquivo local está gravado.)

- [ ] **Step 6: Este plano no repo e a foto**

```bash
cd ~/projetos/physiqcalc-w1
cp ~/projetos/physiqcalc-scratch/w1/2026-10-11-w1-infinitepay.md docs/superpowers/plans/2026-10-11-w1-infinitepay.md
git add docs/superpowers/plans/2026-10-11-w1-infinitepay.md
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "docs(w1): plano detalhado da InfinitePay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/plans/2026-10-11-w1-infinitepay.md
```
No JSON `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-planos-e-recebimento.json`: `W1.status = "andamento"`, `inicio` = agora,
`estimativa_min = 1015` (revista em 11/10: 1170 — ver a Estimativa); mandar a foto da página em andamento
(`andamento_worktrees.py … --atual`) com a previsão no formato "HHhMM a HHhMM (pior cenário HHhMM)" e as fases (✅/🚧/⏳), terminal + tópico.

---

### Task 1: Regras puras da InfinitePay (TDD)

**Files:**
- Create: `supabase-principal/functions/_shared/infinitepay-regras.ts`
- Create: `src/financeiro/infinitepay.ts`
- Test: `src/financeiro/infinitepay.test.ts`

**Status:** ✅ feita — `169925e`. A Task 1b corrige o que a revisão pediu.
**Estimativa:** 25 a 40 min (pior cenário 60 min)

- [x] **Step 1: Escrever o teste que falha**

```ts
// src/financeiro/infinitepay.test.ts
// Physiq W1 — regras puras da InfinitePay (desenho 10/10 §4–§5 com o §8; spec-review W1-B1/W1-B2). O mesmo módulo do servidor.
import { describe, expect, it } from "vitest";
import {
  IP_PRAZO_HORAS, centavos, corpoDoLink, corpoDoPaymentCheck, decidirBaixa, descricaoDoLink, ehNsuDoPedido, expiraEm, lerAvisoDoWebhook,
  lerLink, lerPaymentCheck, lerVolta, metodoDoMeio, normalizarHandle, nsuDoPedido, podeReaproveitar, proximaConferenciaEm, tentativaViva,
  textoPagoAoPersonal, urlDaInfinitePay, urlDeVolta, urlDoWebhook, type ConferenciaIp,
} from "./infinitepay";

const PEDIDO = "11111111-2222-4333-8444-555555555555";
const agora = new Date("2026-10-11T12:00:00Z");

describe("InfiniteTag e valores", () => {
  it("InfiniteTag: sem o $, minúscula, letras/números/._- (2 a 40); o resto é null", () => {
    expect(normalizarHandle(" $Fulano.Treinos ")).toBe("fulano.treinos");
    expect(normalizarHandle("$$ana_personal")).toBe("ana_personal");
    expect(normalizarHandle("a")).toBeNull();
    expect(normalizarHandle("ana personal")).toBeNull();
    expect(normalizarHandle("ana@x")).toBeNull();
    expect(normalizarHandle("x".repeat(41))).toBeNull();
    expect(normalizarHandle(42)).toBeNull();
  });
  it("centavos: 83,33 → 8333; o numeric do banco; vírgula; zero, negativo e lixo → null", () => {
    expect(centavos(83.33)).toBe(8333);
    expect(centavos("1000.00")).toBe(100000);
    expect(centavos("99,90")).toBe(9990);
    expect(centavos(0)).toBeNull();
    expect(centavos(-1)).toBeNull();
    expect(centavos("abc")).toBeNull();
    expect(centavos(null)).toBeNull();
  });
  it("descrição do link: uma linha, até 100", () => {
    expect(descricaoDoLink("Plano ·\n Anual  · 12 meses")).toBe("Plano · Anual · 12 meses");
    expect(descricaoDoLink("")).toBe("Pagamento");
    expect(descricaoDoLink("x".repeat(150))).toHaveLength(100);
  });
});

describe("o link (POST /links) e a volta", () => {
  it("corpo: items (não 'itens'), preço em centavos, order_nsu, volta e webhook; sem customer (LGPD)", () => {
    const webhook = "https://ref.supabase.co/functions/v1/infinitepay-webhook-aluno?schema=public";
    expect(corpoDoLink({ handle: "fulano", centavos: 100000, descricao: "Plano · Anual", pedido: PEDIDO,
      volta: "https://physiqcalc.com.br/perfil/pagamentos", webhook })).toEqual({
      handle: "fulano", items: [{ quantity: 1, price: 100000, description: "Plano · Anual" }], order_nsu: PEDIDO,
      redirect_url: "https://physiqcalc.com.br/perfil/pagamentos", webhook_url: webhook,
    });
    expect(corpoDoLink({ handle: "f1", centavos: 100, descricao: "Teste", pedido: "teste-1", volta: "https://x", webhook: null })).not.toHaveProperty("webhook_url");
  });
  it("volta: o site do mesmo ambiente (ou o local); o APK, outro ambiente e o resto → o site do ambiente (App Link na produção)", () => {
    expect(urlDeVolta("public", "https://physiqcalc.com.br")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("public", "https://www.physiqcalc.com.br")).toBe("https://www.physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("staging", "https://physiqcalc-staging.vercel.app")).toBe("https://physiqcalc-staging.vercel.app/perfil/pagamentos");
    expect(urlDeVolta("staging", "http://localhost:8080")).toBe("http://localhost:8080/perfil/pagamentos");
    expect(urlDeVolta("public", "https://localhost")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("public", "capacitor://localhost")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("staging", "https://physiqcalc.com.br")).toBe("https://physiqcalc-staging.vercel.app/perfil/pagamentos");
    expect(urlDeVolta("public", "https://golpe.com")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("public", null, "/painel/configuracoes/recebimento")).toBe("https://physiqcalc.com.br/painel/configuracoes/recebimento");
  });
  it("webhook: a função do ambiente", () => {
    expect(urlDoWebhook("https://ref.supabase.co/", "staging")).toBe("https://ref.supabase.co/functions/v1/infinitepay-webhook-aluno?schema=staging");
  });
  it("resposta do /links: url (Central de Ajuda) ou payment_url; só https num domínio da InfinitePay", () => {
    expect(lerLink({ url: "https://checkout.infinitepay.com.br/fulano?lenc=abc" })).toBe("https://checkout.infinitepay.com.br/fulano?lenc=abc");
    expect(lerLink({ payment_url: "https://checkout.infinitepay.io/x" })).toBe("https://checkout.infinitepay.io/x");
    expect(lerLink({ url: "http://checkout.infinitepay.com.br/x" })).toBeNull();
    expect(lerLink({ url: "https://infinitepay.com.br.golpe.com/x" })).toBeNull();
    expect(lerLink({ url: "https://golpe.com/?infinitepay.io" })).toBeNull();
    expect(lerLink(null)).toBeNull();
    expect(urlDaInfinitePay("https://recibo.infinitepay.io/abc")).toBe("https://recibo.infinitepay.io/abc");
  });
});

describe("o webhook e a volta (sem assinatura: só a forma)", () => {
  const corpo = { invoice_slug: "abc-123", amount: 100000, paid_amount: 101000, installments: 3, capture_method: "credit_card",
    transaction_nsu: "e6f3c1d2-nsu", order_nsu: PEDIDO, receipt_url: "https://recibo.infinitepay.io/r/1", items: [] };
  it("lê o que importa — amount, paid_amount e items do corpo não valem nada aqui: quem decide é o payment_check", () => {
    expect(lerAvisoDoWebhook(corpo)).toEqual({ pedido: PEDIDO, nsu: "e6f3c1d2-nsu", slug: "abc-123", recibo: "https://recibo.infinitepay.io/r/1", meio: "credit_card" });
  });
  it("recusa o que não é nosso; o recibo fora da InfinitePay vira null", () => {
    expect(lerAvisoDoWebhook({ ...corpo, order_nsu: "teste-1" })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, transaction_nsu: undefined })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, transaction_nsu: "a b" })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, receipt_url: "https://golpe.com/r" })!.recibo).toBeNull();
    expect(lerAvisoDoWebhook("x")).toBeNull();
  });
  it("a volta da página: slug (não invoice_slug) e o NSU numérico vira texto", () => {
    expect(lerVolta({ order_nsu: PEDIDO, transaction_nsu: 12345, slug: "s1", capture_method: "pix" }))
      .toEqual({ pedido: PEDIDO, nsu: "12345", slug: "s1", recibo: null, meio: "pix" });
  });
});

describe("a conferência (payment_check)", () => {
  it("corpo: InfiniteTag + pedido + NSU + slug; o NSU do pedido (W1-B2: sem o NSU de verdade) não vai", () => {
    expect(corpoDoPaymentCheck("fulano", PEDIDO, "n1", "s1")).toEqual({ handle: "fulano", order_nsu: PEDIDO, transaction_nsu: "n1", slug: "s1" });
    expect(corpoDoPaymentCheck("fulano", PEDIDO, nsuDoPedido(PEDIDO), null)).toEqual({ handle: "fulano", order_nsu: PEDIDO });
  });
  it("resposta: success + paid; 400/404/422 ou success false = não pago (decidido); 5xx, 429, 401/403, rede e lixo = sem decisão", () => {
    expect(lerPaymentCheck(200, { success: true, paid: true, amount: 100000, paid_amount: 101000, installments: 3, capture_method: "credit_card" }))
      .toEqual({ pago: true, centavos: 100000, centavosPagos: 101000, parcelas: 3, meio: "credit_card", nsu: null });
    expect(lerPaymentCheck(200, { success: false, paid: false })).toMatchObject({ pago: false });
    expect(lerPaymentCheck(404, { message: "not found" })).toMatchObject({ pago: false });
    expect(lerPaymentCheck(503, null)).toBeNull();
    expect(lerPaymentCheck(429, null)).toBeNull();
    expect(lerPaymentCheck(403, null)).toBeNull();
    expect(lerPaymentCheck(599, null)).toBeNull();
    expect(lerPaymentCheck(200, { success: true })).toBeNull();
  });
});

describe("decidirBaixa — só o payment_check dá baixa", () => {
  const pago = (x: Partial<ConferenciaIp> = {}): ConferenciaIp => ({ pago: true, centavos: 100000, centavosPagos: 100000, parcelas: 1, meio: "pix", nsu: null, ...x });
  const t = (x: Partial<{ status: string; forma: string | null; centavos: number; nsu: string | null }> = {}) =>
    ({ status: "aguardando_confirmacao", forma: "infinitepay", centavos: 100000, nsu: null, ...x });
  it("pago com o preço do link → baixar; não pago → nada; valor diferente (ou sem amount) → nada + aviso", () => {
    expect(decidirBaixa(t(), pago(), "n1")).toBe("baixar");
    expect(decidirBaixa(t(), pago({ pago: false }), "n1")).toBe("nao_pago");
    expect(decidirBaixa(t(), pago({ centavos: 99999 }), "n1")).toBe("valor_diferente");
    expect(decidirBaixa(t(), pago({ centavos: null }), "n1")).toBe("valor_diferente");
    expect(decidirBaixa(t({ status: "cancelada" }), pago(), "n1")).toBe("baixar"); // a vencida paga depois: o dinheiro entrou
  });
  it("o paid_amount maior (as taxas que o personal repassa ao aluno) não atrapalha: compara o amount", () => {
    expect(decidirBaixa(t(), pago({ centavosPagos: 104500 }), "n1")).toBe("baixar");
  });
  it("já paga: o mesmo NSU é repetição; outro NSU é 2º pagamento; paga à mão antes → só avisa", () => {
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago(), "n1")).toBe("ja_feito");
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago(), "n2")).toBe("segundo_pagamento");
    expect(decidirBaixa(t({ status: "paga", forma: "manual" }), pago(), "n1")).toBe("ja_pago_por_fora");
  });
  it("W1-B2: paga só pelo pedido → o 1º NSU de verdade troca o do pedido; o pedido de novo é repetição", () => {
    expect(decidirBaixa(t({ status: "paga", nsu: nsuDoPedido(PEDIDO) }), pago(), "n9")).toBe("trocar_nsu");
    expect(decidirBaixa(t({ status: "paga", nsu: "n9" }), pago(), nsuDoPedido(PEDIDO))).toBe("ja_feito");
    expect(ehNsuDoPedido(nsuDoPedido(PEDIDO))).toBe(true);
    expect(ehNsuDoPedido("n9")).toBe(false);
  });
});

describe("a tentativa (W1-B1: 72 h e o mesmo link enquanto vale)", () => {
  it("vale 72 h", () => {
    expect(IP_PRAZO_HORAS).toBe(72);
    expect(expiraEm(agora)).toBe("2026-10-14T12:00:00.000Z");
  });
  it("viva: aguardando, na InfinitePay e dentro do prazo", () => {
    const viva = { status: "aguardando_confirmacao", forma: "infinitepay", ip_expira_em: "2026-10-11T13:00:00Z" };
    expect(tentativaViva(viva, agora)).toBe(true);
    expect(tentativaViva({ ...viva, ip_expira_em: "2026-10-11T11:59:00Z" }, agora)).toBe(false);
    expect(tentativaViva({ ...viva, forma: "mp" }, agora)).toBe(false);
    expect(tentativaViva({ ...viva, status: "paga" }, agora)).toBe(false);
  });
  it("reaproveita o link com 30 min de folga, o mesmo valor e a mesma InfiniteTag", () => {
    const viva = { status: "aguardando_confirmacao", forma: "infinitepay", tipo: "mensalidade", ip_expira_em: "2026-10-12T12:00:00Z",
      ip_link_url: "https://checkout.infinitepay.com.br/fulano?lenc=1", ip_handle: "fulano", valor: "1000.00" };
    expect(podeReaproveitar(viva, { centavos: 100000, handle: "fulano" }, agora)).toBe(true);
    expect(podeReaproveitar(viva, { centavos: 120000, handle: "fulano" }, agora)).toBe(false);
    expect(podeReaproveitar(viva, { centavos: 100000, handle: "outra" }, agora)).toBe(false);
    expect(podeReaproveitar({ ...viva, ip_expira_em: "2026-10-11T12:20:00Z" }, { centavos: 100000, handle: "fulano" }, agora)).toBe(false);
    expect(podeReaproveitar({ ...viva, ip_link_url: null }, { centavos: 100000, handle: "fulano" }, agora)).toBe(false);
  });
  it("meio → método; a próxima conferência: 5, 15, 30 min e de hora em hora", () => {
    expect(metodoDoMeio("pix")).toBe("pix");
    expect(metodoDoMeio("credit_card")).toBe("cartao");
    expect(metodoDoMeio(null)).toBeNull();
    expect(proximaConferenciaEm(agora, 1)).toBe("2026-10-11T12:05:00.000Z");
    expect(proximaConferenciaEm(agora, 3)).toBe("2026-10-11T12:30:00.000Z");
    expect(proximaConferenciaEm(agora, 9)).toBe("2026-10-11T13:00:00.000Z");
  });
  it("o aviso ao personal diz quem, quanto e como", () => {
    expect(textoPagoAoPersonal("Ana Souza", 100000, "credit_card", 3)).toBe("Pagamento confirmado · Ana Souza · R$ 1000,00 (cartão em 3× na InfinitePay)");
    expect(textoPagoAoPersonal("Ana Souza", 4990, "pix", 1)).toBe("Pagamento confirmado · Ana Souza · R$ 49,90 (Pix na InfinitePay)");
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/infinitepay.test.ts`
Expected: FAIL — `Failed to resolve import "./infinitepay"`.

- [x] **Step 3: Escrever o módulo**

```ts
// supabase-principal/functions/_shared/infinitepay-regras.ts
// Physiq W1 — regras PURAS da InfinitePay (checkout HOSPEDADO: o aluno paga o personal na página da InfinitePay, Pix ou cartão até
// 12×). Desenho aprovado 10/10/2026 (a seção 8 por cima das 4 e 5) + spec-review (W1-B1, W1-B2). Sem Deno, sem rede e sem banco: usadas
// pela pagamentos-aluno e pela infinitepay-webhook-aluno (por _shared/infinitepay.ts e _shared/infinitepay-baixa.ts), reexportadas para
// a tela (src/financeiro/infinitepay.ts) e testadas no Vitest (src/financeiro/infinitepay.test.ts).
// A API (www.infinitepay.io/checkout-documentacao, conferida em 10/10): POST /links {handle sem o $, items[{quantity, price em centavos,
// description}], order_nsu, redirect_url, webhook_url} → a url do checkout; POST /payment_check {handle, order_nsu, transaction_nsu,
// slug} → {success, paid, amount, paid_amount, installments, capture_method}. O webhook NÃO tem assinatura: nada vira "pago" sem o
// payment_check (decidirBaixa). Sem sandbox: o 1º pagamento de verdade (R$ 1, do Weslley — Task 22 do plano da W1) confere o que a doc
// não mostra (o corpo da resposta do /links, a busca da volta, o host do recibo e se o payment_check aceita só o order_nsu).
import type { Schema } from "./financeiro-regras.ts";

export const IP_API = "https://api.checkout.infinitepay.io";
/** W1-B1: a tentativa vale 72 h (o desenho §8; igual ao Pix do Mercado Pago) — depois sai e a trava do inadimplente volta. */
export const IP_PRAZO_HORAS = 72;
/** O mesmo link é reaproveitado se ainda faltam pelo menos 30 min (o aluno toca em "Pagar" de novo). */
export const IP_REAPROVEITAR_MS = 30 * 60_000;
/** Conferência só pelo pedido (sem o NSU — W1-B2): no máximo 1 a cada 30 s por tentativa. */
export const IP_CONFERIR_PEDIDO_MS = 30_000;
/** O "Testar" do personal: um link de R$ 1,00 que ninguém precisa pagar. */
export const IP_TESTE_CENTAVOS = 100;
/** A caixa de avisos desiste depois de 24 conferências sem resposta da InfinitePay e avisa o personal. */
export const IP_MAX_TENTATIVAS = 24;
/** NSU de quem foi pago só pelo pedido (o payment_check sem o NSU de verdade): o 1º NSU que chegar troca este. */
export const NSU_DO_PEDIDO = "pedido:";

export type MeioIp = "pix" | "credit_card";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[A-Za-z0-9_.:-]{1,80}$/;
const HANDLE = /^[a-z0-9][a-z0-9._-]{1,39}$/;
/** Só https num domínio da InfinitePay (o checkout e o recibo): o resto vira null — nada abre fora daqui. */
const HOST_IP = /^https:\/\/([a-z0-9-]+\.)*(infinitepay\.io|infinitepay\.com\.br)(\/|$)/i;
const SITE: Record<Schema, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const SITE_DO_AMBIENTE: Record<Schema, RegExp> = {
  public: /^https:\/\/(www\.)?physiqcalc\.com\.br$/,
  staging: /^https:\/\/physiqcalc-staging\.vercel\.app$/,
};
const LOCAL = /^http:\/\/localhost:(5173|8080)$/;
/** 400, 404, 422: a InfinitePay respondeu e disse "não" (não pago). O resto de 4xx (401, 403, 408, 409, 429) é tentar de novo. */
const RECUSA_DECIDIDA = new Set([400, 404, 422]);

export function normalizarHandle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const h = v.trim().replace(/^\$+/, "").toLowerCase();
  return HANDLE.test(h) ? h : null;
}

/** Reais (número ou o numeric do banco em texto) → centavos inteiros; ≤ 0 ou lixo → null. */
export function centavos(valor: number | string | null | undefined): number | null {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function descricaoDoLink(descricao: string | null | undefined): string {
  const d = String(descricao ?? "").replace(/\s+/g, " ").trim();
  return (d || "Pagamento").slice(0, 100);
}

/** Para onde a página da InfinitePay devolve: o site do mesmo ambiente (ou o local); APK e o resto → o site do ambiente (na produção o
 *  App Link /perfil reabre o app — AndroidManifest.xml). Nunca uma origem de fora (sem redirecionamento aberto). */
export function urlDeVolta(schema: Schema, origin: string | null | undefined, caminho = "/perfil/pagamentos"): string {
  const base = origin && (SITE_DO_AMBIENTE[schema].test(origin) || LOCAL.test(origin)) ? origin : SITE[schema];
  return `${base}${caminho}`;
}

export function urlDoWebhook(supabaseUrl: string, schema: Schema): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/infinitepay-webhook-aluno?schema=${schema}`;
}

export interface PedidoDoLink {
  handle: string;
  centavos: number;
  descricao: string;
  /** order_nsu: o id da cobrança (a tentativa) — ou "teste-<uuid>" no Testar */
  pedido: string;
  volta: string;
  /** null no Testar (ninguém precisa pagar; se pagar, nada a fazer aqui) */
  webhook: string | null;
}

/** O corpo do POST /links ("items": a doc mistura "itens"; o exemplo e a Central de Ajuda usam "items"). Sem `customer`: o mínimo de
 *  dado pessoal (LGPD — a página da InfinitePay pede o que precisar). */
export function corpoDoLink(p: PedidoDoLink): Record<string, unknown> {
  return {
    handle: p.handle,
    items: [{ quantity: 1, price: p.centavos, description: descricaoDoLink(p.descricao) }],
    order_nsu: p.pedido,
    redirect_url: p.volta,
    ...(p.webhook ? { webhook_url: p.webhook } : {}),
  };
}

export function urlDaInfinitePay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.trim();
  return u.length <= 500 && HOST_IP.test(u) ? u : null;
}

/** A url do checkout na resposta do /links: `url` (Central de Ajuda, 22/07/2026) ou `payment_url` (plugin não oficial). */
export function lerLink(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const dentro = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : {};
  return urlDaInfinitePay(b.url) ?? urlDaInfinitePay(b.payment_url) ?? urlDaInfinitePay(dentro.url);
}

export interface AvisoIp {
  /** order_nsu = cobrancas.id */
  pedido: string;
  /** transaction_nsu */
  nsu: string;
  /** invoice_slug (webhook) | slug (volta) */
  slug: string | null;
  /** receipt_url (só domínio da InfinitePay) */
  recibo: string | null;
  meio: MeioIp | null;
}

function meio(v: unknown): MeioIp | null {
  return v === "pix" || v === "credit_card" ? v : null;
}

function codigo(v: unknown): string | null {
  const s = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : typeof v === "string" ? v.trim() : "";
  return CODIGO.test(s) ? s : null;
}

/** O corpo do webhook (SEM assinatura: aqui só a forma — quem decide é o payment_check). Fora do formato → null (200, ignorado). */
export function lerAvisoDoWebhook(body: unknown): AvisoIp | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const pedido = typeof b.order_nsu === "string" && UUID.test(b.order_nsu.trim()) ? b.order_nsu.trim().toLowerCase() : null;
  const nsu = codigo(b.transaction_nsu);
  if (!pedido || !nsu) return null;
  return { pedido, nsu, slug: codigo(b.invoice_slug ?? b.slug), recibo: urlDaInfinitePay(b.receipt_url), meio: meio(b.capture_method) };
}

/** A volta da página (o redirect_url com receipt_url, order_nsu, slug, capture_method e transaction_nsu na busca). */
export function lerVolta(q: Record<string, unknown>): AvisoIp | null {
  return lerAvisoDoWebhook(q);
}

export const nsuDoPedido = (pedido: string) => `${NSU_DO_PEDIDO}${pedido}`;
export const ehNsuDoPedido = (nsu: string | null | undefined) => !!nsu && nsu.startsWith(NSU_DO_PEDIDO);

export function corpoDoPaymentCheck(handle: string, pedido: string, nsu?: string | null, slug?: string | null): Record<string, unknown> {
  return { handle, order_nsu: pedido, ...(nsu && !ehNsuDoPedido(nsu) ? { transaction_nsu: nsu } : {}), ...(slug ? { slug } : {}) };
}

export interface ConferenciaIp {
  pago: boolean;
  /** amount — o PREÇO do link: é ele que se compara (o paid_amount vem com as taxas que o personal repassa ao aluno) */
  centavos: number | null;
  /** paid_amount */
  centavosPagos: number | null;
  parcelas: number | null;
  meio: MeioIp | null;
  /** se a resposta trouxer (a doc não mostra) */
  nsu: string | null;
}

/** A resposta do payment_check → a conferência, ou null quando não deu para decidir (tenta de novo depois). */
export function lerPaymentCheck(status: number, body: unknown): ConferenciaIp | null {
  const naoPago: ConferenciaIp = { pago: false, centavos: null, centavosPagos: null, parcelas: null, meio: null, nsu: null };
  if (status >= 400 && RECUSA_DECIDIDA.has(status)) return naoPago;
  if (status >= 300) return null;
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (b.success === false) return naoPago;
  if (b.success !== true || typeof b.paid !== "boolean") return null;
  const inteiro = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const parcelas = inteiro(b.installments);
  return {
    pago: b.paid, centavos: inteiro(b.amount), centavosPagos: inteiro(b.paid_amount),
    parcelas: parcelas !== null && parcelas >= 1 && parcelas <= 12 ? parcelas : null, meio: meio(b.capture_method), nsu: codigo(b.transaction_nsu),
  };
}

export type Decisao = "baixar" | "trocar_nsu" | "ja_feito" | "ja_pago_por_fora" | "segundo_pagamento" | "nao_pago" | "valor_diferente";

/** A tentativa como o banco tem: status, forma, o valor em centavos e o NSU já gravado (se já foi paga). */
export interface TentativaParaDecidir {
  status: string;
  forma: string | null;
  centavos: number;
  nsu: string | null;
}

/** O que fazer com um aviso conferido. O spec-review: "link pago 2× não se resolve com idempotência por NSU" — na mensalidade o 2º é
 *  mais um pagamento; na avulsa já paga, registra e avisa o personal para devolver. */
export function decidirBaixa(t: TentativaParaDecidir, c: ConferenciaIp, nsu: string): Decisao {
  if (!c.pago) return "nao_pago";
  if (c.centavos === null || c.centavos !== t.centavos) return "valor_diferente";
  if (t.status !== "paga") return "baixar";
  if (t.forma !== "infinitepay") return "ja_pago_por_fora";
  if (t.nsu === nsu || ehNsuDoPedido(nsu)) return "ja_feito";
  if (ehNsuDoPedido(t.nsu)) return "trocar_nsu";
  return "segundo_pagamento";
}

export function expiraEm(agora: Date = new Date()): string {
  return new Date(agora.getTime() + IP_PRAZO_HORAS * 3_600_000).toISOString();
}

/** A tentativa como a cobrança chega (as colunas ip_* são opcionais no tipo Cobranca: o schema sem a migration não as tem). */
export interface TentativaIp {
  status: string;
  forma: string | null;
  tipo?: string;
  ip_expira_em?: string | null;
  ip_link_url?: string | null;
  ip_handle?: string | null;
  valor?: number | string | null;
}

export function tentativaViva(t: Pick<TentativaIp, "status" | "forma" | "ip_expira_em">, agora: Date = new Date()): boolean {
  return t.status === "aguardando_confirmacao" && t.forma === "infinitepay" && !!t.ip_expira_em && new Date(t.ip_expira_em).getTime() > agora.getTime();
}

export function podeReaproveitar(t: TentativaIp, alvo: { centavos: number; handle: string }, agora: Date = new Date()): boolean {
  return tentativaViva(t, new Date(agora.getTime() + IP_REAPROVEITAR_MS)) && !!urlDaInfinitePay(t.ip_link_url)
    && t.ip_handle === alvo.handle && centavos(t.valor ?? null) === alvo.centavos;
}

export function metodoDoMeio(m: MeioIp | null): "pix" | "cartao" | null {
  return m === "pix" ? "pix" : m === "credit_card" ? "cartao" : null;
}

/** Próxima conferência de um aviso que não deu para decidir: 5 min, 15 min, 30 min e depois de hora em hora. */
export function proximaConferenciaEm(agora: Date, tentativas: number): string {
  const min = tentativas <= 1 ? 5 : tentativas === 2 ? 15 : tentativas === 3 ? 30 : 60;
  return new Date(agora.getTime() + min * 60_000).toISOString();
}

// ───────────────────────── textos do sino (o título não vai para o log — _shared/log.ts) ─────────────────────────

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const comoPagou = (m: MeioIp | null, parcelas: number | null) =>
  m === "pix" ? "Pix" : m === "credit_card" ? (parcelas && parcelas > 1 ? `cartão em ${parcelas}×` : "cartão") : "pagamento";

export function textoPagoAoAluno(c: number): string {
  return `Pagamento confirmado · ${reais(c)}`;
}
export function textoPagoAoPersonal(nome: string, c: number, m: MeioIp | null, parcelas: number | null): string {
  return `Pagamento confirmado · ${nome} · ${reais(c)} (${comoPagou(m, parcelas)} na InfinitePay)`.slice(0, 160);
}
export function textoSegundoPagamento(nome: string, c: number): string {
  return `${nome} pagou ${reais(c)} 2 vezes pela InfinitePay. Devolva um pelo app da InfinitePay.`.slice(0, 160);
}
export function textoJaPagoPorFora(nome: string, c: number): string {
  return `A InfinitePay confirmou ${reais(c)} de ${nome}, que você já tinha registrado. Se foram 2 pagamentos, devolva um pelo app da InfinitePay.`.slice(0, 160);
}
export function textoValorDiferente(nome: string): string {
  return `Um pagamento de ${nome} pela InfinitePay veio com valor diferente. Confira no app da InfinitePay.`.slice(0, 160);
}
export function textoSemConfirmacao(nome: string): string {
  return `Não conseguimos confirmar um pagamento de ${nome} pela InfinitePay. Confira no app da InfinitePay e registre à mão se recebeu.`.slice(0, 160);
}
```

```ts
// src/financeiro/infinitepay.ts
// Physiq W1 — as regras da InfinitePay são as do servidor (um módulo só, sem Deno): a tela reexporta.
export * from "../../supabase-principal/functions/_shared/infinitepay-regras";
```

- [x] **Step 4: Rodar e ver passar**

Run: `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/infinitepay.test.ts && flock $P npm run tipos`
Expected: PASS (todos os casos) e `tsc` sem erro.

- [x] **Step 5: Commit**

```bash
git add supabase-principal/functions/_shared/infinitepay-regras.ts src/financeiro/infinitepay.ts src/financeiro/infinitepay.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): regras puras da InfinitePay (link, volta, webhook, conferência, 72 h, baixa)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/infinitepay-regras.ts src/financeiro/infinitepay.ts src/financeiro/infinitepay.test.ts
```

---

### Task 2: P-B — "período todo" nas contas InfinitePay (W1-T03 do mestre)

**Files:**
- Modify: `supabase-principal/functions/_shared/planos-regras.ts`
- Test: `src/financeiro/planos.test.ts` (acrescentar)

**Status:** ✅ feita — `892f8b2`.
**Estimativa:** 15 a 25 min (pior cenário 35 min)

- [x] **Step 1: Escrever o teste que falha** — no fim de `src/financeiro/planos.test.ts` (o `anual` e o `TODAS` já existem no topo do arquivo):

```ts
import { modalidadesPermitidasNoPlano, rotuloDaModalidade } from "./planos";

describe("W1 — P-B (decisão dele 10/10/2026, '1'): na InfinitePay, à vista e cartão parcelado = 'período todo'", () => {
  it("a conta InfinitePay recebe o período todo e o mês a mês", () => {
    expect(modalidadesDaConta("infinitepay")).toEqual(["avista", "mensal"]);
  });
  it("o plano com cartão parcelado é oferecido como período todo (à vista) — a mesma cobertura; nos outros modos, como sempre", () => {
    const soParcelado = { ...anual, modalidades: ["cartao_parcelado"] as Modalidade[] };
    expect(modalidadesOferecidas(soParcelado, "infinitepay")).toEqual(["avista"]);
    expect(modalidadesOferecidas(anual, "infinitepay")).toEqual(["avista", "mensal"]);
    expect(modalidadesOferecidas(soParcelado, "mercadopago")).toEqual(["cartao_parcelado"]);
    expect(modalidadesOferecidas(anual, "pix_manual")).toEqual(["avista", "mensal"]);
  });
  it("rótulo: 'Período todo (Pix ou cartão até 12×)' nas 2 na InfinitePay; o de sempre nos outros modos", () => {
    expect(rotuloDaModalidade("avista", "infinitepay")).toBe("Período todo (Pix ou cartão até 12×)");
    expect(rotuloDaModalidade("cartao_parcelado", "infinitepay")).toBe("Período todo (Pix ou cartão até 12×)");
    expect(rotuloDaModalidade("mensal", "infinitepay")).toBe("Mês a mês");
    expect(rotuloDaModalidade("avista", "mercadopago")).toBe("À vista");
    expect(rotuloDaModalidade("cartao_parcelado", null)).toBe("Cartão parcelado");
  });
  it("salvar um plano que já tinha cartão parcelado não obriga a tirar; plano novo só com o que a conta recebe", () => {
    expect(modalidadesPermitidasNoPlano("infinitepay", ["avista", "cartao_parcelado"])).toEqual(["avista", "cartao_parcelado", "mensal"]);
    expect(modalidadesPermitidasNoPlano("infinitepay", [])).toEqual(["avista", "mensal"]);
    expect(modalidadesPermitidasNoPlano("mercadopago", [])).toEqual(TODAS);
    expect(validarPlano({ nome: "X", meses: 6, valor: 10, modalidades: ["cartao_parcelado"], max_parcelas_cartao: 3 },
      modalidadesPermitidasNoPlano("infinitepay", []))).toEqual({ ok: false, erro: "modalidade_da_conta" });
  });
});
```

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/planos.test.ts` → Expected: FAIL (`modalidadesDaConta("infinitepay")`
devolve `[]`; `rotuloDaModalidade`/`modalidadesPermitidasNoPlano` não existem). (Aqui e abaixo `P=…/pesado.lock` = o caminho inteiro.)

- [x] **Step 2: Implementar** — em `planos-regras.ts`, trocar `modalidadesDaConta` e `modalidadesOferecidas` e acrescentar as 2 funções:

```ts
/** Modalidades que a forma de receber da conta consegue cobrar (desenho 3.6). W1 (P-B "1"): na InfinitePay o período todo (Pix ou
 *  cartão — as parcelas, a página dela escolhe) e o mês a mês; o "cartão parcelado" não é oferecido (é o mesmo período todo). */
export function modalidadesDaConta(modo: string | null | undefined): Modalidade[] {
  if (modo === "mercadopago") return ["avista", "cartao_parcelado", "mensal"];
  if (modo === "pix_manual" || modo === "nenhum" || modo === "infinitepay") return ["avista", "mensal"];
  return [];
}

/** Na ficha do aluno: as modalidades do plano que a conta consegue receber (plano incompleto ou desativado: nenhuma). Na InfinitePay o
 *  "cartão parcelado" do plano vira o período todo (P-B: a mesma cobertura e o mesmo valor). */
export function modalidadesOferecidas(p: ValoresDoPlano & { modalidades: Modalidade[]; ativo: boolean }, modo: string | null | undefined): Modalidade[] {
  if (!p.ativo || !planoCompleto(p)) return [];
  const daConta = modalidadesDaConta(modo);
  const doPlano: Modalidade[] = modo === "infinitepay" ? p.modalidades.map((x) => (x === "cartao_parcelado" ? "avista" : x)) : p.modalidades;
  return MODALIDADES.filter((x) => doPlano.includes(x) && daConta.includes(x));
}

/** O que o prof_plano_salvar aceita: o que a conta recebe hoje + o que o plano JÁ tem (quem troca de forma de receber não fica travado
 *  num plano com aluno numa modalidade que a forma nova não oferece — modalidade_em_uso). Plano novo: só o que a conta recebe. */
export function modalidadesPermitidasNoPlano(modo: string | null | undefined, atuais: readonly unknown[]): Modalidade[] {
  const daConta = modalidadesDaConta(modo);
  return MODALIDADES.filter((x) => daConta.includes(x) || atuais.includes(x));
}

/** O nome da modalidade na tela: na InfinitePay, à vista e cartão parcelado são "Período todo (Pix ou cartão até 12×)" (P-B "1"). */
export function rotuloDaModalidade(m: Modalidade, modo: string | null | undefined): string {
  if (modo === "infinitepay" && (m === "avista" || m === "cartao_parcelado")) return "Período todo (Pix ou cartão até 12×)";
  return ROTULO_MODALIDADE[m];
}
```

- [x] **Step 3: Rodar e commit**

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro && flock $P npm run tipos`
Expected: PASS (os casos da W-P continuam: o `modalidadesOferecidas(anual, "pix_manual")` e o `(…, "mercadopago")` de sempre).
```bash
git add supabase-principal/functions/_shared/planos-regras.ts src/financeiro/planos.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): P-B — na InfinitePay à vista e cartão parcelado viram o período todo (decisão de 10/10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/planos-regras.ts src/financeiro/planos.test.ts
```

---

### Task 3: Cliente da InfinitePay (fetch simulado)

**Files:**
- Create: `supabase-principal/functions/_shared/infinitepay.ts`
- Test: `src/financeiro/infinitepayCliente.test.ts`

**Status:** ✅ feita — `d4e89d5`. **O commit vale por cima do código abaixo.** Ele acrescenta o que a API respondeu em 11/10:
- `ErroIp` (`"checkout_desligado"`), `IP_ATIVAR_CHECKOUT` e `lerCheckoutDesligado`;
- `LinkIp`: o `criarLink` devolve `erro` e `ativar` quando vem o 404 `external_checkout_not_enabled`;
- no `conferirPagamento`, essa mesma resposta é SEM decisão (`conferencia: null`, `erro`), nunca "não pago".

As Tasks 7, 9 e 13 usam esses nomes.

**Estimativa:** 20 a 30 min (pior cenário 45 min)

- [x] **Step 1: Escrever o teste que falha**

```ts
// src/financeiro/infinitepayCliente.test.ts
// Physiq W1 — o cliente da API da InfinitePay com o fetch FALSO: o caminho, o corpo, o tempo (signal), a leitura e o que vira 599.
import { describe, expect, it, vi } from "vitest";
import { baseDaApi, conferirPagamento, criarLink, pedidoDeTeste } from "../../supabase-principal/functions/_shared/infinitepay";
import { prazo } from "../../supabase-principal/functions/_shared/tempo";

const resposta = (status: number, corpo: unknown) =>
  new Response(corpo === undefined ? "" : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const pedido = { handle: "fulano", centavos: 100, descricao: "x", pedido: "p1", volta: "https://v", webhook: null };

describe("cliente da InfinitePay (fetch simulado)", () => {
  it("criarLink: POST /links com o corpo da doc e um signal (tempo); 200 com url → a url", async () => {
    const f = vi.fn(async () => resposta(200, { url: "https://checkout.infinitepay.com.br/fulano?lenc=x" }));
    expect(await criarLink(pedido, { fetch: f as unknown as typeof fetch })).toEqual({ status: 200, url: "https://checkout.infinitepay.com.br/fulano?lenc=x" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.checkout.infinitepay.io/links");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ handle: "fulano", items: [{ quantity: 1, price: 100 }], order_nsu: "p1" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("4xx → sem url (a tela diz 'não aceitou'); 5xx → sem url; rede ou tempo → 599", async () => {
    expect(await criarLink(pedido, { fetch: (async () => resposta(422, { message: "x" })) as unknown as typeof fetch })).toEqual({ status: 422, url: null });
    expect(await criarLink(pedido, { fetch: (async () => resposta(503, null)) as unknown as typeof fetch })).toEqual({ status: 503, url: null });
    expect(await criarLink(pedido, { fetch: (async () => { throw new TypeError("rede"); }) as unknown as typeof fetch })).toEqual({ status: 599, url: null });
    expect(await criarLink(pedido, { fetch: (async () => resposta(200, { url: "https://golpe.com/x" })) as unknown as typeof fetch })).toEqual({ status: 200, url: null });
  });
  it("conferirPagamento: POST /payment_check com a InfiniteTag gravada, o pedido, o NSU e o slug; lê a conferência", async () => {
    const f = vi.fn(async () => resposta(200, { success: true, paid: true, amount: 100, paid_amount: 100, installments: 1, capture_method: "pix" }));
    const r = await conferirPagamento("fulano", "p1", "n1", "s1", { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({ status: 200, conferencia: { pago: true, centavos: 100, centavosPagos: 100, parcelas: 1, meio: "pix", nsu: null } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.checkout.infinitepay.io/payment_check");
    expect(JSON.parse(String(init.body))).toEqual({ handle: "fulano", order_nsu: "p1", transaction_nsu: "n1", slug: "s1" });
  });
  it("o prazo do pedido esgotado: nem chama (599)", async () => {
    const f = vi.fn();
    expect(await conferirPagamento("fulano", "p1", null, null, { fetch: f as unknown as typeof fetch, prazo: prazo(0) })).toEqual({ status: 599, conferencia: null });
    expect(f).not.toHaveBeenCalled();
  });
  it("o simulador só com http://127.0.0.1 ou localhost: outro valor fica na API de verdade", () => {
    expect(baseDaApi("http://127.0.0.1:8799")).toBe("http://127.0.0.1:8799");
    expect(baseDaApi("http://localhost:8799")).toBe("http://localhost:8799");
    expect(baseDaApi("https://golpe.com")).toBe("https://api.checkout.infinitepay.io");
    expect(baseDaApi(undefined)).toBe("https://api.checkout.infinitepay.io");
  });
  it("o Testar do personal: R$ 1,00, sem webhook, pedido teste-<uuid>", () => {
    const p = pedidoDeTeste("fulano", "https://physiqcalc.com.br/painel/configuracoes/recebimento");
    expect(p).toMatchObject({ handle: "fulano", centavos: 100, webhook: null, volta: "https://physiqcalc.com.br/painel/configuracoes/recebimento" });
    expect(p.pedido).toMatch(/^teste-[0-9a-f-]{36}$/);
  });
});
```
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/infinitepayCliente.test.ts` → Expected: FAIL (o módulo não existe).

- [x] **Step 2: Escrever o módulo**

```ts
// supabase-principal/functions/_shared/infinitepay.ts
// Physiq W1 — o cliente da API da InfinitePay (checkout hospedado). Sem chave (a InfiniteTag é o único identificador) e com tempo: cada
// chamada espera no máximo TEMPO_IP_MS (e o que falta do prazo do pedido — _shared/tempo.ts, que NÃO muda: tem cópia no Treino com
// teste byte a byte); rede ou tempo → status 599. O fetch entra por parâmetro (o Vitest passa um falso — src/financeiro/
// infinitepayCliente.test.ts). A base é a da doc; INFINITEPAY_API só troca para o SIMULADOR LOCAL (http://127.0.0.1:<porta> —
// e2e/w1/simulador_ip.py): qualquer outro valor é ignorado. Quem chama loga só o status (nunca o corpo, a InfiniteTag ou a url).
import {
  IP_API, IP_TESTE_CENTAVOS, corpoDoLink, corpoDoPaymentCheck, lerLink, lerPaymentCheck, type ConferenciaIp, type PedidoDoLink,
} from "./infinitepay-regras.ts";
import { buscarComTempo, tempoEsgotado, type Prazo } from "./tempo.ts";

export const TEMPO_IP_MS = 8_000;
const MINIMO_MS = 1_000;

export interface OpcoesIp {
  prazo?: Prazo;
  fetch?: typeof fetch;
  /** INFINITEPAY_API (só o simulador local vale) */
  base?: string | null;
}

export function baseDaApi(env: string | null | undefined): string {
  return env && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(env) ? env : IP_API;
}

async function postar(caminho: string, corpo: Record<string, unknown>, o: OpcoesIp): Promise<{ status: number; body: unknown }> {
  const ms = Math.min(TEMPO_IP_MS, o.prazo ? o.prazo.restante() : TEMPO_IP_MS);
  if (ms < MINIMO_MS) return { status: 599, body: null };
  try {
    const res = await buscarComTempo(`${baseDaApi(o.base)}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo),
    }, ms, o.fetch ?? fetch);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch (e) {
      if (tempoEsgotado(e)) return { status: 599, body: null }; // o tempo vale até ler o corpo
    }
    return { status: res.status, body };
  } catch {
    return { status: 599, body: null };
  }
}

export async function criarLink(p: PedidoDoLink, o: OpcoesIp = {}): Promise<{ status: number; url: string | null }> {
  const r = await postar("/links", corpoDoLink(p), o);
  return { status: r.status, url: r.status < 300 ? lerLink(r.body) : null };
}

export async function conferirPagamento(handle: string, pedido: string, nsu: string | null, slug: string | null, o: OpcoesIp = {}):
  Promise<{ status: number; conferencia: ConferenciaIp | null }> {
  const r = await postar("/payment_check", corpoDoPaymentCheck(handle, pedido, nsu, slug), o);
  return { status: r.status, conferencia: lerPaymentCheck(r.status, r.body) };
}

/** O link do "Testar" (e da conferência da InfiniteTag ao salvar): R$ 1,00, sem webhook — ninguém precisa pagar. */
export function pedidoDeTeste(handle: string, volta: string): PedidoDoLink {
  return { handle, centavos: IP_TESTE_CENTAVOS, descricao: "Teste do Physiq — não precisa pagar", pedido: `teste-${crypto.randomUUID()}`, volta, webhook: null };
}
```

- [x] **Step 3: Rodar, conferir as guardas de CI e commit**

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/infinitepayCliente.test.ts && flock $P npm run tipos && node scripts/ci/checar-funcoes.mjs`
Expected: PASS; `tsc` limpo; `checar-funcoes` sem achado novo (R3: o `fetch` só passa pelo `buscarComTempo`).
```bash
git add supabase-principal/functions/_shared/infinitepay.ts src/financeiro/infinitepayCliente.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): cliente da InfinitePay com tempo (links e payment_check; simulador só local)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/infinitepay.ts src/financeiro/infinitepayCliente.test.ts
```

---

### Task 4: Regras do Recebimento no servidor (Pix na chave e o pedido de salvar)

**Files:**
- Create: `supabase-principal/functions/_shared/pix-chave-regras.ts` (o conteúdo de `src/lib/pixChave.ts` + `chaveDoPedido` + `COLUNAS_CHAVE`)
- Create: `supabase-principal/functions/_shared/recebimento-regras.ts`
- Create: `src/financeiro/recebimento.ts`
- Modify: `src/lib/pixChave.ts` (vira reexport)
- Test: `src/financeiro/recebimento.test.ts` (novo); `src/lib/recebimentos.test.ts` continua igual (é a prova de que nada mudou na validação)

**Status:** ✅ feita — `7e674da`.
**Estimativa:** 15 a 25 min (pior cenário 35 min)

- [x] **Step 1: Escrever o teste que falha**

```ts
// src/financeiro/recebimento.test.ts
// Physiq W1 (jeito 2): o servidor valida o que a tela de Recebimento manda — a chave Pix (a MESMA validação da tela) e o pedido do
// prof_recebimento_salvar (modo, bloquear, InfiniteTag).
import { describe, expect, it } from "vitest";
import { COLUNAS_CHAVE, chaveDoPedido } from "../../supabase-principal/functions/_shared/pix-chave-regras";
import { MODOS, ROTULO_MODO, lerPedidoDoRecebimento } from "./recebimento";

describe("o pedido do Recebimento (prof_recebimento_salvar)", () => {
  it("modo, bloquear e a InfiniteTag normalizada; vazio = tirar; nada = erro", () => {
    expect(lerPedidoDoRecebimento({ modo: "infinitepay", handle: "$Fulano" })).toEqual({ ok: true, pedido: { modo: "infinitepay", handle: "fulano", cancelarAutomaticas: false } });
    expect(lerPedidoDoRecebimento({ bloquear: true })).toEqual({ ok: true, pedido: { bloquear: true, cancelarAutomaticas: false } });
    expect(lerPedidoDoRecebimento({ handle: "" })).toEqual({ ok: true, pedido: { handle: null, cancelarAutomaticas: false } });
    expect(lerPedidoDoRecebimento({ modo: "pix_manual", cancelar_automaticas: true })).toEqual({ ok: true, pedido: { modo: "pix_manual", cancelarAutomaticas: true } });
    expect(lerPedidoDoRecebimento({ modo: "pix" })).toEqual({ ok: false, erro: "modo_invalido" });
    expect(lerPedidoDoRecebimento({ bloquear: "sim" })).toEqual({ ok: false, erro: "bloquear_invalido" });
    expect(lerPedidoDoRecebimento({ handle: "ana personal" })).toEqual({ ok: false, erro: "infinitetag_invalida" });
    expect(lerPedidoDoRecebimento({})).toEqual({ ok: false, erro: "nada_para_salvar" });
  });
  it("os modos da tela são os do banco (contas_recebimento_modo_check da 20261011200000) e todos têm rótulo", () => {
    expect([...MODOS].sort()).toEqual(["infinitepay", "mercadopago", "nenhum", "pix_manual"]);
    for (const m of MODOS) expect(ROTULO_MODO[m]).toBeTruthy();
  });
});

describe("a chave Pix no servidor (a mesma validação da tela)", () => {
  it("normaliza e recusa com a frase da tela", () => {
    expect(chaveDoPedido({ tipo: "cpf", chave: "529.982.247-25", favorecido: "  Ana   Souza ", banco: "" }))
      .toEqual({ ok: true, dados: { tipo: "cpf", chave: "52998224725", favorecido: "Ana Souza", banco: null } });
    expect(chaveDoPedido({ tipo: "telefone", chave: "(82) 99999-9999" })).toMatchObject({ ok: true, dados: { chave: "+5582999999999" } });
    expect(chaveDoPedido({ tipo: "cpf", chave: "123" })).toEqual({ ok: false, mensagem: "CPF precisa ter 11 dígitos." });
    expect(chaveDoPedido({ tipo: "xyz", chave: "a" })).toEqual({ ok: false, mensagem: "Escolha o tipo da chave." });
  });
  it("as colunas que a função devolve são as que a tela lia", () => {
    expect(COLUNAS_CHAVE).toBe("id, conta_id, membro_id, tipo, chave, favorecido, banco, ativa, criado_em");
  });
});
```
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/recebimento.test.ts` → Expected: FAIL (os módulos não existem).

- [x] **Step 2: Mover a chave Pix para o servidor** — `git mv src/lib/pixChave.ts supabase-principal/functions/_shared/pix-chave-regras.ts`; no
arquivo movido, trocar a 1ª linha do comentário por
`// Physiq W1 — a chave Pix (tipos, validação, normalização e formatação) no SERVIDOR (jeito 2: a pagamentos-aluno valida o que a tela de Recebimento manda) e reexportada para a tela (src/lib/pixChave.ts). Sem Deno, sem rede.`
e acrescentar no fim:

```ts
/** As colunas da chave que a função devolve à tela (as mesmas que a tela lia direto — RecebimentoPixDialog até a W1). */
export const COLUNAS_CHAVE = "id, conta_id, membro_id, tipo, chave, favorecido, banco, ativa, criado_em";

const textoOuNull = (v: unknown, max: number): string | null =>
  (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "") || null;

/** O que a tela manda para salvar uma chave → o que vai para recebimento_chaves (ou a frase do erro, a mesma da tela). */
export function chaveDoPedido(b: Record<string, unknown>):
  { ok: true; dados: { tipo: PixTipo; chave: string; favorecido: string | null; banco: string | null } } | { ok: false; mensagem: string } {
  const tipo: PixTipo | "" = PIX_TIPOS.some((t) => t.value === b.tipo) ? (b.tipo as PixTipo) : "";
  const chave = typeof b.chave === "string" ? b.chave : "";
  const problema = validarChavePix(tipo, chave);
  if (problema) return { ok: false, mensagem: problema };
  return { ok: true, dados: { tipo: tipo as PixTipo, chave: normalizarChavePix(tipo as PixTipo, chave), favorecido: textoOuNull(b.favorecido, 120), banco: textoOuNull(b.banco, 80) } };
}
```
E recriar `src/lib/pixChave.ts`:
```ts
// src/lib/pixChave.ts — Physiq W1: a chave Pix mora no servidor (supabase-principal/functions/_shared/pix-chave-regras.ts); a tela reexporta.
export * from "../../supabase-principal/functions/_shared/pix-chave-regras";
```

- [x] **Step 3: As regras do pedido**

```ts
// supabase-principal/functions/_shared/recebimento-regras.ts
// Physiq W1 — regras PURAS de Configurações › Recebimento pela função (jeito 2): os modos e o pedido do prof_recebimento_salvar.
// Reexportadas para a tela (src/financeiro/recebimento.ts) e testadas em src/financeiro/recebimento.test.ts.
import { normalizarHandle } from "./infinitepay-regras.ts";

export type ModoRecebimento = "pix_manual" | "nenhum" | "mercadopago" | "infinitepay";
/** A ordem da tela. 'mercadopago' = o Mercado Pago do Physiq (só o master liga — fica igual); 'infinitepay' = W1. */
export const MODOS: readonly ModoRecebimento[] = ["pix_manual", "infinitepay", "mercadopago", "nenhum"];
export const ROTULO_MODO: Record<ModoRecebimento, string> = {
  pix_manual: "PIX NA CHAVE", infinitepay: "INFINITEPAY", mercadopago: "MERCADO PAGO", nenhum: "POR FORA",
};

export function ehModo(v: unknown): v is ModoRecebimento {
  return typeof v === "string" && (MODOS as readonly string[]).includes(v);
}

export interface PedidoRecebimento {
  modo?: ModoRecebimento;
  bloquear?: boolean;
  /** a InfiniteTag normalizada; null = tirar; ausente = não mexe */
  handle?: string | null;
  /** o OK de quem troca de forma com cobrança automática viva no Mercado Pago (409 automaticas_ativas antes) */
  cancelarAutomaticas: boolean;
}

export function lerPedidoDoRecebimento(b: Record<string, unknown>): { ok: true; pedido: PedidoRecebimento } | { ok: false; erro: string } {
  const pedido: PedidoRecebimento = { cancelarAutomaticas: b.cancelar_automaticas === true };
  if ("modo" in b) {
    if (!ehModo(b.modo)) return { ok: false, erro: "modo_invalido" };
    pedido.modo = b.modo;
  }
  if ("bloquear" in b) {
    if (typeof b.bloquear !== "boolean") return { ok: false, erro: "bloquear_invalido" };
    pedido.bloquear = b.bloquear;
  }
  if ("handle" in b) {
    if (b.handle === null || b.handle === "") pedido.handle = null;
    else {
      const h = normalizarHandle(b.handle);
      if (!h) return { ok: false, erro: "infinitetag_invalida" };
      pedido.handle = h;
    }
  }
  if (pedido.modo === undefined && pedido.bloquear === undefined && pedido.handle === undefined) return { ok: false, erro: "nada_para_salvar" };
  return { ok: true, pedido };
}
```
```ts
// src/financeiro/recebimento.ts
// Physiq W1 — as regras do Recebimento são as do servidor (um módulo só, sem Deno): a tela reexporta.
export * from "../../supabase-principal/functions/_shared/recebimento-regras";
```

- [x] **Step 4: Rodar e commit**

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/recebimento.test.ts src/lib/recebimentos.test.ts src/lib && flock $P npm run tipos`
Expected: PASS (o `recebimentos.test.ts` de sempre passa sem mudar: a validação é a mesma) e `tsc` limpo (os imports de
`@/lib/pixChave` continuam valendo).
```bash
git add supabase-principal/functions/_shared/pix-chave-regras.ts supabase-principal/functions/_shared/recebimento-regras.ts src/lib/pixChave.ts src/financeiro/recebimento.ts src/financeiro/recebimento.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): regras do Recebimento no servidor (chave Pix e o pedido de salvar) — base do jeito 2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/pix-chave-regras.ts supabase-principal/functions/_shared/recebimento-regras.ts src/lib/pixChave.ts src/financeiro/recebimento.ts src/financeiro/recebimento.test.ts
```

---

### Task 1b: Correções da revisão nas regras puras JÁ commitadas (C1, I1, I3, I4, I5, I6 e o teto da url) — TDD

**Files:**
- Modify: `supabase-principal/functions/_shared/infinitepay-regras.ts` (commitado na Task 1, `169925e`)
- Test: `src/financeiro/infinitepay.test.ts`
- **Não tocar:** `supabase-principal/functions/_shared/infinitepay.ts` e `src/financeiro/infinitepayCliente.test.ts` (Task 3, `d4e89d5`).
  Elas importam `urlDaInfinitePay`, `lerLink`, `lerPaymentCheck` e `corpoDoPaymentCheck` daqui: o Step 4 roda o teste delas também.

**Estimativa:** 30 a 45 min (pior cenário 70 min). Vem ANTES da Task 5 (a migration e a Task 7 usam os nomes novos).

O que muda, e por quê:
- **C1:** `decidirBaixa` perde `trocar_nsu` e `segundo_pagamento`. Os 2 davam baixa ou trocavam o NSU confiando num `transaction_nsu` que
  ninguém confere. Numa cobrança JÁ paga, outro NSU vira `nsu_novo` (a cobrança foi paga só pelo pedido) ou `outro_pagamento`. Os 2 só
  avisam o personal (`geral`): não creditam período nem trocam o NSU. Isso vale até as sondas da Task 22 provarem como a InfinitePay amarra
  o NSU ao pedido. O NSU é comparado sem diferença de espaço e de maiúsculas. Se a InfinitePay devolver um NSU (`nsuDaBaixa`), vale mais
  que o do aviso.
- **I5:** a cobrança já paga à mão (forma diferente de `infinitepay`) dá `ja_pago_por_fora` ANTES de olhar o valor, porque o personal
  pode ter registrado outro valor.
- **I1/I3:** `depoisDaConferencia` diz o que fazer quando a conferência não deu baixa:
  - do SERVIDOR (webhook ou rodada): soma 1 e reagenda. O "não pago" também, porque a volta pode chegar antes da aprovação do cartão;
  - na 24ª conferência, fecha: o "não pago" fecha calado e o "sem resposta" fecha como `desistiu` e avisa o personal;
  - da TELA: não soma nem fecha, só adia 30 s.

  `deveReabrir`: o aviso fechado sem pagamento (`nao_pago` ou `desistiu`) reabre quando a mesma confirmação chega de novo.
- **I4:** um `order_nsu` por link, no formato `<cobranca_id>-<n>` (`pedidoDoLink` e `lerPedidoDoLink`). O webhook e a volta só aceitam esse
  formato e devolvem o pedido E a cobrança.
- **I6:** `avisoNoPrazo` (o link aceita aviso até 7 dias depois das 72 h dele), `IP_AVISOS_POR_COBRANCA` (20) e `IP_LIMITE_CORPO` (16 KB).
- **Teto da url:** sobe de 500 para 2048 caracteres (`IP_URL_MAX`). O link de verdade no tamanho máximo deu 486 caracteres (sondado em 11/10).
- **Textos novos do sino:** `textoOutroPagamento`, `textoNsuNovo`, `textoNsuRepetido` e `textoCheckoutDesligado`. O `textoSegundoPagamento`
  sai.

- [ ] **Step 1: Mudar o teste (falha antes do módulo)** — em `src/financeiro/infinitepay.test.ts`:

1. Trocar o `import { … } from "./infinitepay";` do topo e acrescentar o `PEDIDO_LINK` logo depois do `PEDIDO`:
```ts
import {
  IP_AVISOS_POR_COBRANCA, IP_LIMITE_CORPO, IP_MAX_TENTATIVAS, IP_PRAZO_HORAS, IP_URL_MAX, avisoNoPrazo, centavos, corpoDoLink,
  corpoDoPaymentCheck, decidirBaixa, depoisDaConferencia, descricaoDoLink, deveReabrir, ehNsuDoPedido, expiraEm, lerAvisoDoWebhook, lerLink,
  lerPaymentCheck, lerPedidoDoLink, lerVolta, mesmoNsu, metodoDoMeio, normalizarHandle, nsuDaBaixa, nsuDoPedido, pedidoDoLink,
  podeReaproveitar, proximaConferenciaEm, resultadoDaDecisao, tentativaViva, textoCheckoutDesligado, textoNsuNovo, textoOutroPagamento,
  textoPagoAoPersonal, urlDaInfinitePay, urlDeVolta, urlDoWebhook, type ConferenciaIp,
} from "./infinitepay";
```
e, logo depois da linha `const PEDIDO = "11111111-2222-4333-8444-555555555555";` (que fica):
```ts
/** I4: o order_nsu é do LINK — `<cobranca_id>-<n>` */
const PEDIDO_LINK = `${PEDIDO}-1`;
```
2. No `describe("o link (POST /links) e a volta")`, acrescentar no fim:
```ts
  it("o link de verdade cabe: até 2048 caracteres (o maior medido em 11/10 deu 486); acima, null", () => {
    const longa = `https://checkout.infinitepay.io/fulano?lenc=${"x".repeat(600)}`;
    expect(IP_URL_MAX).toBe(2048);
    expect(lerLink({ url: longa })).toBe(longa);
    expect(urlDaInfinitePay(`https://checkout.infinitepay.io/f?lenc=${"x".repeat(2048)}`)).toBeNull();
  });
```
3. Trocar o `describe("o webhook e a volta (sem assinatura: só a forma)")` inteiro por:
```ts
describe("o webhook e a volta (sem assinatura: só a forma)", () => {
  const corpo = { invoice_slug: "abc-123", amount: 100000, paid_amount: 101000, installments: 3, capture_method: "credit_card",
    transaction_nsu: "e6f3c1d2-nsu", order_nsu: PEDIDO_LINK, receipt_url: "https://recibo.infinitepay.io/r/1", items: [] };
  it("lê o que importa — o pedido do LINK e a cobrança dele; amount, paid_amount e items do corpo não valem nada aqui", () => {
    expect(lerAvisoDoWebhook(corpo)).toEqual({ pedido: PEDIDO_LINK, cobranca: PEDIDO, nsu: "e6f3c1d2-nsu", slug: "abc-123",
      recibo: "https://recibo.infinitepay.io/r/1", meio: "credit_card" });
  });
  it("recusa o que não é nosso (o id puro da cobrança também — I4: o order_nsu é por link); o recibo fora da InfinitePay vira null", () => {
    expect(lerAvisoDoWebhook({ ...corpo, order_nsu: PEDIDO })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, order_nsu: "teste-1" })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, order_nsu: `${PEDIDO}-0` })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, transaction_nsu: undefined })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, transaction_nsu: "a b" })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, receipt_url: "https://golpe.com/r" })!.recibo).toBeNull();
    expect(lerAvisoDoWebhook("x")).toBeNull();
  });
  it("a volta da página: slug (não invoice_slug) e o NSU numérico vira texto", () => {
    expect(lerVolta({ order_nsu: PEDIDO_LINK, transaction_nsu: 12345, slug: "s1", capture_method: "pix" }))
      .toEqual({ pedido: PEDIDO_LINK, cobranca: PEDIDO, nsu: "12345", slug: "s1", recibo: null, meio: "pix" });
  });
});
```
4. Trocar o `describe("decidirBaixa — só o payment_check dá baixa")` inteiro por:
```ts
describe("decidirBaixa — só o payment_check dá baixa (C1: numa cobrança já paga, nada credita nem troca o NSU)", () => {
  const pago = (x: Partial<ConferenciaIp> = {}): ConferenciaIp => ({ pago: true, centavos: 100000, centavosPagos: 100000, parcelas: 1, meio: "pix", nsu: null, ...x });
  const t = (x: Partial<{ status: string; forma: string | null; centavos: number; nsu: string | null }> = {}) =>
    ({ status: "aguardando_confirmacao", forma: "infinitepay", centavos: 100000, nsu: null, ...x });
  it("pago com o preço do link → baixar; não pago → nada; valor diferente (ou sem amount) → nada + aviso", () => {
    expect(decidirBaixa(t(), pago(), "n1")).toBe("baixar");
    expect(decidirBaixa(t(), pago({ pago: false }), "n1")).toBe("nao_pago");
    expect(decidirBaixa(t(), pago({ centavos: 99999 }), "n1")).toBe("valor_diferente");
    expect(decidirBaixa(t(), pago({ centavos: null }), "n1")).toBe("valor_diferente");
    expect(decidirBaixa(t({ status: "cancelada" }), pago(), "n1")).toBe("baixar"); // a vencida paga depois: o dinheiro entrou
  });
  it("o paid_amount maior (as taxas que o personal repassa ao aluno) não atrapalha: compara o amount", () => {
    expect(decidirBaixa(t(), pago({ centavosPagos: 104500 }), "n1")).toBe("baixar");
  });
  it("já paga pela InfinitePay: o mesmo NSU (sem diferença de maiúsculas) ou o NSU que a InfinitePay devolveu = repetição; outro = só aviso", () => {
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago(), "n1")).toBe("ja_feito");
    expect(decidirBaixa(t({ status: "paga", nsu: "abc-N1" }), pago(), " ABC-n1 ")).toBe("ja_feito");
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago({ nsu: "n1" }), "forjado")).toBe("ja_feito");
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago(), nsuDoPedido(PEDIDO_LINK))).toBe("ja_feito");
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago(), "n2")).toBe("outro_pagamento");
  });
  it("W1-B2 + C1: paga só pelo pedido → um NSU de verdade depois vira nsu_novo (aviso; o NSU do pedido NÃO é trocado)", () => {
    expect(decidirBaixa(t({ status: "paga", nsu: nsuDoPedido(PEDIDO_LINK) }), pago(), "n9")).toBe("nsu_novo");
    expect(ehNsuDoPedido(nsuDoPedido(PEDIDO_LINK))).toBe(true);
    expect(ehNsuDoPedido("n9")).toBe(false);
  });
  it("I5: paga à mão (forma manual) → só avisa, mesmo com outro valor (o personal registrou o que recebeu)", () => {
    expect(decidirBaixa(t({ status: "paga", forma: "manual" }), pago(), "n1")).toBe("ja_pago_por_fora");
    expect(decidirBaixa(t({ status: "paga", forma: "manual", centavos: 5000 }), pago(), "n1")).toBe("ja_pago_por_fora");
    expect(decidirBaixa(t({ status: "paga", forma: "manual" }), pago({ pago: false }), "n1")).toBe("nao_pago");
  });
  it("o NSU que a baixa grava (o da InfinitePay vale mais) e o resultado que a caixa grava", () => {
    expect(nsuDaBaixa(pago({ nsu: "real" }), "forjado")).toBe("real");
    expect(nsuDaBaixa(pago(), "n1")).toBe("n1");
    expect(resultadoDaDecisao("baixar")).toBe("pago");
    expect(resultadoDaDecisao("ja_feito")).toBe("ja_pago");
    for (const d of ["ja_pago_por_fora", "nsu_novo", "outro_pagamento", "valor_diferente", "nao_pago"] as const) expect(resultadoDaDecisao(d)).toBe(d);
    expect(mesmoNsu(" A1 ", "a1")).toBe(true);
    expect(mesmoNsu(null, "a1")).toBe(false);
  });
});
```
5. No `describe("a tentativa (W1-B1: 72 h e o mesmo link enquanto vale)")`, acrescentar no fim:
```ts
  it("C1: os avisos de 'confira' ao personal (sem baixa) dizem quem e quanto", () => {
    expect(textoOutroPagamento("Ana Souza", 100000))
      .toBe("A InfinitePay avisou outro pagamento de Ana Souza (R$ 1000,00). Confira no app dela: se entraram 2, registre o 2º à mão ou devolva um.");
    expect(textoNsuNovo("Ana Souza", 4990)).toContain("já estava baixado");
    expect(textoCheckoutDesligado("Ana Souza")).toContain("checkout externo");
  });
```
6. No fim do arquivo, os 3 `describe` novos:
```ts
describe("I4 — um order_nsu por link", () => {
  it("<cobranca_id>-<n>: monta e lê; o resto é null", () => {
    expect(pedidoDoLink(PEDIDO, 2)).toBe(`${PEDIDO}-2`);
    expect(lerPedidoDoLink(`${PEDIDO.toUpperCase()}-12`)).toEqual({ pedido: `${PEDIDO}-12`, cobranca: PEDIDO, n: 12 });
    expect(lerPedidoDoLink(PEDIDO)).toBeNull();
    expect(lerPedidoDoLink(`${PEDIDO}-0`)).toBeNull();
    expect(lerPedidoDoLink(`${PEDIDO}-10000`)).toBeNull();
    expect(lerPedidoDoLink("teste-1")).toBeNull();
    expect(lerPedidoDoLink(42)).toBeNull();
  });
});

describe("I6 — o que a rota pública aceita", () => {
  it("aviso só de link com até 72 h + 7 dias; teto de 20 por cobrança e 16 KB de corpo", () => {
    expect(avisoNoPrazo("2026-10-01T12:00:01Z", agora)).toBe(true); // 10 dias menos 1 s
    expect(avisoNoPrazo("2026-10-01T11:59:59Z", agora)).toBe(false);
    expect(avisoNoPrazo(null, agora)).toBe(false);
    expect(IP_AVISOS_POR_COBRANCA).toBe(20);
    expect(IP_LIMITE_CORPO).toBe(16_384);
  });
});

describe("I1/I3 — sem baixa nesta conferência", () => {
  it("servidor: soma 1 e reagenda (o 'não pago' também — a volta antes da aprovação do cartão); na 24ª fecha", () => {
    expect(depoisDaConferencia(0, "nao_pago", "servidor", agora)).toEqual({ tentativas: 1, proxima_em: "2026-10-11T12:05:00.000Z", fechar: null });
    expect(depoisDaConferencia(2, "sem_resposta", "servidor", agora)).toEqual({ tentativas: 3, proxima_em: "2026-10-11T12:30:00.000Z", fechar: null });
    expect(depoisDaConferencia(IP_MAX_TENTATIVAS - 1, "nao_pago", "servidor", agora)).toMatchObject({ tentativas: 24, fechar: "nao_pago" });
    expect(depoisDaConferencia(IP_MAX_TENTATIVAS - 1, "sem_resposta", "servidor", agora)).toMatchObject({ tentativas: 24, fechar: "desistiu" });
  });
  it("tela: não soma nem fecha — só adia 30 s (quem gasta tentativa é o servidor)", () => {
    expect(depoisDaConferencia(5, "sem_resposta", "tela", agora)).toEqual({ tentativas: 5, proxima_em: "2026-10-11T12:00:30.000Z", fechar: null });
    expect(depoisDaConferencia(23, "nao_pago", "tela", agora)).toEqual({ tentativas: 23, proxima_em: "2026-10-11T12:00:30.000Z", fechar: null });
  });
  it("o aviso fechado sem pagamento reabre quando chega de novo; o resolvido não", () => {
    expect(deveReabrir("nao_pago")).toBe(true);
    expect(deveReabrir("desistiu")).toBe(true);
    for (const r of ["pago", "ja_pago", "ja_pago_por_fora", "nsu_novo", "outro_pagamento", "valor_diferente", "nsu_repetido", null]) {
      expect(deveReabrir(r)).toBe(false);
    }
  });
});
```
(O resto do arquivo fica: `normalizarHandle`, `centavos`, `corpoDoLink`, `urlDeVolta`, `lerLink`, `lerPaymentCheck`, `tentativaViva`,
`podeReaproveitar`, `proximaConferenciaEm`, `textoPagoAoPersonal` não mudam.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/infinitepay.test.ts`
Expected: FAIL — `pedidoDoLink is not a function` (e os outros nomes novos) e o `lerAvisoDoWebhook` sem o campo `cobranca`.

- [ ] **Step 3: Mudar o módulo** — em `supabase-principal/functions/_shared/infinitepay-regras.ts`:

1. No comentário do topo, depois da linha `// não mostra (o corpo da resposta do /links, a busca da volta, o host do recibo e se o payment_check aceita só o order_nsu).`:
```ts
// Sondado na API de verdade em 11/10/2026 (curl, 04:44–04:59):
//   · o /links devolve 200 {url: "https://checkout.infinitepay.io/<handle>?lenc=…"}, com ou sem Authorization (sem chave);
//   · o checkout externo desligado OU a InfiniteTag que não existe dão o MESMO 404 {error: "external_checkout_not_enabled", redirect_url};
//   · o payment_check de um pedido que não existe dá 200 {success: false};
//   · o order_nsu repetido é aceito (2 links com o mesmo deram 200): a unicidade é nossa, com um pedido por link (I4);
//   · o link no tamanho máximo deu 486 caracteres (IP_URL_MAX = 2048).
// Revisão de 11/10 (C1): numa cobrança já paga, outro NSU NUNCA credita período nem troca o NSU, só avisa o personal; a Task 22 sonda
// se o payment_check amarra o NSU e o slug ao pedido.
```
2. Trocar o `IP_MAX_TENTATIVAS` (o comentário e a linha) por este bloco de constantes:
```ts
/** A caixa de avisos: o SERVIDOR (webhook e rodada) desiste depois de 24 conferências sem baixa. Elas vêm aos 5, 15 e 30 min e depois de
 *  hora em hora (~22 h). A tela não gasta tentativa (I3). Sem resposta, avisa o personal; "não pago" em todas, fecha calado (I1). */
export const IP_MAX_TENTATIVAS = 24;
/** I3: a conferência que a tela dispara não gasta tentativa, só adia o aviso 30 s (a tela confere a cada 5 s). */
export const IP_TELA_ADIA_MS = 30_000;
/** I6: um link aceita aviso até 7 dias depois das 72 h dele (a baixa atrasada entra; o pedido velho, não). */
export const IP_AVISO_DIAS = 7;
/** I6: no máximo 20 avisos na caixa por cobrança (o POST forjado com NSU novo não enche a tabela nem gasta a InfiniteTag do personal). */
export const IP_AVISOS_POR_COBRANCA = 20;
/** I6: o corpo do webhook vai até 16 KB (o da InfinitePay tem 1 item; é o molde do LIMITE_CORPO da hml-19a). */
export const IP_LIMITE_CORPO = 16_384;
/** A url do checkout e do recibo vai até 2048 caracteres (o link de verdade no tamanho máximo deu 486 — sondado em 11/10). */
export const IP_URL_MAX = 2048;
```
3. Trocar a linha `const UUID = /^[0-9a-f]{8}-…$/i;` (fica sem uso) por:
```ts
/** I4: o order_nsu de cada link — `<cobranca_id>-<n>` (n de 1 a 9999), já em minúsculas. */
const PEDIDO_DO_LINK = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([1-9][0-9]{0,3})$/;
```
4. No `PedidoDoLink`, o comentário do `pedido` vira `/** order_nsu: o pedido DESTE link — `<cobranca_id>-<n>` (I4; a InfinitePay aceita
   order_nsu repetido: a unicidade é nossa) — ou "teste-<uuid>" no Testar */`.
5. No `urlDaInfinitePay`: `return u.length <= IP_URL_MAX && HOST_IP.test(u) ? u : null;`
6. Trocar o `interface AvisoIp` por (o `meio()` e o `codigo()` logo abaixo dele ficam):
```ts
export interface AvisoIp {
  /** order_nsu = o pedido do LINK (`<cobranca_id>-<n>` — I4) */
  pedido: string;
  /** a cobrança do link (o começo do pedido) */
  cobranca: string;
  /** transaction_nsu */
  nsu: string;
  /** invoice_slug (webhook) | slug (volta) */
  slug: string | null;
  /** receipt_url (só domínio da InfinitePay) */
  recibo: string | null;
  meio: MeioIp | null;
}
```
   e trocar o `lerAvisoDoWebhook` (o comentário e a função) por:
```ts
/** I4: o pedido de um link — `<cobranca_id>-<n>`. A InfinitePay aceita order_nsu repetido (sondado em 11/10: 2 links com o mesmo deram
 *  200), então a unicidade é nossa ({schema}.infinitepay_links, com o pedido como chave). */
export function pedidoDoLink(cobrancaId: string, n: number): string {
  return `${cobrancaId.toLowerCase()}-${n}`;
}

export function lerPedidoDoLink(v: unknown): { pedido: string; cobranca: string; n: number } | null {
  if (typeof v !== "string") return null;
  const m = PEDIDO_DO_LINK.exec(v.trim().toLowerCase());
  return m ? { pedido: `${m[1]}-${m[2]}`, cobranca: m[1], n: Number(m[2]) } : null;
}

/** O corpo do webhook (SEM assinatura: aqui só a forma — quem decide é o payment_check). Fora do formato → null (200, ignorado). */
export function lerAvisoDoWebhook(body: unknown): AvisoIp | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const link = lerPedidoDoLink(b.order_nsu);
  const nsu = codigo(b.transaction_nsu);
  if (!link || !nsu) return null;
  return { pedido: link.pedido, cobranca: link.cobranca, nsu, slug: codigo(b.invoice_slug ?? b.slug), recibo: urlDaInfinitePay(b.receipt_url),
    meio: meio(b.capture_method) };
}
```
7. Trocar do `export type Decisao` até o fim do `decidirBaixa` (o comentário, a `TentativaParaDecidir` e a função) por:
```ts
/** C1: o que pode sair de uma conferência. Só "baixar" mexe na cobrança. Numa cobrança JÁ paga, outro NSU nunca credita período nem troca
 *  o NSU, porque o webhook e a volta chegam sem assinatura e a doc não diz que o payment_check amarra o NSU ao pedido. Os 2 casos só
 *  avisam o personal, até as sondas da Task 22 (plano da W1) provarem:
 *    · "nsu_novo": a cobrança foi paga só pelo pedido (quase sempre é o mesmo pagamento);
 *    · "outro_pagamento": já tinha outro NSU. */
export type Decisao = "baixar" | "ja_feito" | "ja_pago_por_fora" | "nsu_novo" | "outro_pagamento" | "nao_pago" | "valor_diferente";

/** A tentativa como o banco tem: status, forma, o PREÇO DO LINK conferido em centavos (I4) e o NSU já gravado (se já foi paga). */
export interface TentativaParaDecidir {
  status: string;
  forma: string | null;
  centavos: number;
  nsu: string | null;
}

/** O NSU sem diferença de espaço e de maiúsculas (o mesmo pagamento escrito de outro jeito não vira "outro pagamento"). */
export function mesmoNsu(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** O que fazer com um aviso conferido. Só o "baixar" dá baixa. */
export function decidirBaixa(t: TentativaParaDecidir, c: ConferenciaIp, nsu: string): Decisao {
  if (!c.pago) return "nao_pago";
  // I5: registrada à mão (a mesma linha — prof_registrar): só avisa, qualquer que seja o valor que o personal escreveu
  if (t.status === "paga" && t.forma !== "infinitepay") return "ja_pago_por_fora";
  if (c.centavos === null || c.centavos !== t.centavos) return "valor_diferente";
  if (t.status !== "paga") return "baixar";
  if (mesmoNsu(t.nsu, nsu) || mesmoNsu(t.nsu, c.nsu) || ehNsuDoPedido(nsu)) return "ja_feito";
  return ehNsuDoPedido(t.nsu) ? "nsu_novo" : "outro_pagamento";
}

/** O NSU que a baixa grava: o que a InfinitePay devolveu (se devolver — a doc não mostra) vale mais que o do aviso. */
export function nsuDaBaixa(c: ConferenciaIp, nsuDoAviso: string): string {
  return c.nsu ?? nsuDoAviso;
}

/** O resultado que a caixa ({schema}.infinitepay_avisos.resultado) grava ao fechar o aviso. */
export function resultadoDaDecisao(d: Decisao): string {
  return d === "baixar" ? "pago" : d === "ja_feito" ? "ja_pago" : d;
}

export type ModoConferencia = "servidor" | "tela";

/** I1/I3: o aviso ficou sem baixa nesta conferência. O motivo é "não pago" ou sem resposta da InfinitePay (rede, tempo, 5xx, 429 ou o
 *  checkout desligado — Task 3): nunca fecha antes da hora.
 *  · SERVIDOR (webhook, rodada): soma 1 e reagenda — o "não pago" também (a volta antes da aprovação do cartão, o atraso logo depois do
 *    webhook). Na 24ª fecha: o "não pago" fecha calado; o "sem resposta" fecha como "desistiu" e avisa o personal.
 *  · TELA: não soma nem fecha, só adia 30 s. A tela confere a cada 5 s; quem gasta tentativa é o servidor. */
export function depoisDaConferencia(tentativas: number, motivo: "nao_pago" | "sem_resposta", modo: ModoConferencia, agora: Date = new Date()):
  { tentativas: number; proxima_em: string; fechar: null | "nao_pago" | "desistiu" } {
  if (modo === "tela") return { tentativas, proxima_em: new Date(agora.getTime() + IP_TELA_ADIA_MS).toISOString(), fechar: null };
  const n = tentativas + 1;
  const fechar = n >= IP_MAX_TENTATIVAS ? (motivo === "nao_pago" ? "nao_pago" : "desistiu") : null;
  return { tentativas: n, proxima_em: proximaConferenciaEm(agora, n), fechar };
}

/** I1: o aviso fechado SEM pagamento reabre quando a mesma confirmação chega de novo (o webhook verdadeiro depois de um "não pago"). */
export function deveReabrir(resultado: string | null | undefined): boolean {
  return resultado === "nao_pago" || resultado === "desistiu";
}

/** I6: o aviso de um link entra até 72 h + 7 dias depois de o link nascer. */
export function avisoNoPrazo(linkCriadoEm: string | null | undefined, agora: Date = new Date()): boolean {
  const t = linkCriadoEm ? new Date(linkCriadoEm).getTime() : Number.NaN;
  return Number.isFinite(t) && agora.getTime() - t < (IP_PRAZO_HORAS + IP_AVISO_DIAS * 24) * 3_600_000;
}
```
8. Nos textos do sino: trocar o `textoSegundoPagamento` (sai) por:
```ts
export function textoOutroPagamento(nome: string, c: number): string {
  return `A InfinitePay avisou outro pagamento de ${nome} (${reais(c)}). Confira no app dela: se entraram 2, registre o 2º à mão ou devolva um.`.slice(0, 160);
}
export function textoNsuNovo(nome: string, c: number): string {
  return `A InfinitePay confirmou de novo o pagamento de ${nome} (${reais(c)}), que já estava baixado. Só se o app dela mostrar 2, registre o 2º à mão.`.slice(0, 160);
}
export function textoNsuRepetido(nome: string): string {
  return `Um pagamento de ${nome} pela InfinitePay apareceu em 2 cobranças. Confira no app dela e ajuste o financeiro do aluno.`.slice(0, 160);
}
export function textoCheckoutDesligado(nome: string): string {
  return `Não conseguimos confirmar um pagamento de ${nome}: o checkout externo da sua InfinitePay está desligado. Ligue de novo no app dela.`.slice(0, 160);
}
```
(`corpoDoPaymentCheck`, `lerPaymentCheck`, `tentativaViva`, `podeReaproveitar`, `proximaConferenciaEm` e os outros textos ficam iguais.)

- [ ] **Step 4: Rodar e ver passar (o teste da Task 3 junto — ele importa daqui)**

Run: `P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/infinitepay.test.ts src/financeiro/infinitepayCliente.test.ts && flock $P npm run tipos && flock $P npm run lint`
Expected: PASS nos 2 arquivos; `tsc` e lint limpos (o `UUID` saiu; nenhum import sobrando).

- [ ] **Step 5: Commit**

```bash
git add supabase-principal/functions/_shared/infinitepay-regras.ts src/financeiro/infinitepay.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "fix(w1): regras da InfinitePay com a revisão — outro NSU só avisa, não pago reagenda, um pedido por link e teto na rota pública" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/infinitepay-regras.ts src/financeiro/infinitepay.test.ts
```

---

### Task 5: Banco — a migration (1ª parte): dados, links, travas e o master (W1-B1, "trava no banco"; revisão I2 e I4)

**Files:**
- Create: `e2e/w1/sql_w1.py` (o teste, primeiro)
- Create: `supabase-principal/migrations/20261011200000_w1_infinitepay.sql` (a 1ª parte, seções 1–12; a Task 6 acrescenta a 2ª no fim)

**Estimativa:** 50 a 75 min (pior cenário 110 min)

- [ ] **Step 0: O quadro** — em `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` (com o Edit), as 2 reservas da W1 viram UMA:
  `20261011200000_w1_infinitepay.sql`. A `20261011201000` fica livre (revisão I2).

- [ ] **Step 1: Escrever o teste do banco (falha antes da migration)**

```python
#!/usr/bin/env python3
"""Physiq W1 — a InfinitePay NO BANCO (20261011200000_w1_infinitepay.sql — UMA migration; a 1ª parte na Task 5, a 2ª na 6). Staging, em
blocos que terminam com erro de propósito (nada fica gravado — o molde do e2e/wp/sql_planos.py). Os passos "como o app" usam o papel
authenticated com o sub da conta de TESTE (prof2 = dono da conta; aluno2 = aluno; admin.teste = master), como o e2e/hml01/banco.py.
Casos (m1 = a 1ª parte da migration, Task 5; m2 = a 2ª parte, Task 6):
  m1  1 modos e formas   o CHECK aceita infinitepay em contas e em cobrancas; o NSU é único por InfiniteTag (outra tag, mesmo NSU: passa);
                         o pedido do link é único (I4)
  m1  2 guarda da conta  o dono (authenticated) liga a InfinitePay SÓ com a integração ativa; sem ela a conta fica como estava
  m1  3 integração       recebimento_infinitepay_salvar: o dono grava (normalizada); o aluno → so_o_dono; InfiniteTag ruim →
                         infinitetag_invalida; flag desligada → infinitepay_em_teste; o app não lê recebimento_integracoes
  m1  4 chave Pix        recebimento_chave_ligar: 1 só ligada; o aluno não liga (chave_inexistente)
  m1  5 guarda cobrança  o app não grava forma infinitepay nem ip_* (ficam no padrão)
  m1  6 aguardando       financeiro_do_aluno: tentativa viva = aguardando; vencida = não; a avulsa vencida volta às abertas
  m1  7 master           w27_conta_linha com a InfinitePay; master_integracoes conta as contas infinitepay
  m1  8 conta encerrada  a conta cancelada perde a integração
  m2  9 fechar vencidas  mensalidade vencida sem aviso → cancelada e fora do histórico (o handle fica); com aviso pendente fica; avulsa → aberta;
                         a apagada não é tocada (MENOR 2)
  m2 10 rodada           infinitepay_rodada(): fecha as vencidas e põe no pg_net os avisos prontos (no bloco desfeito nada sai)
     11 nada ficou gravado
Uso: python3 e2e/w1/sql_w1.py [--so m1|m2|tudo]                     (staging; as escritas são desfeitas)
     python3 e2e/w1/sql_w1.py --so-catalogo --schema staging|public  (só leitura: os objetos existem — o public depois da migration)
Saída sem dado pessoal: só contagens, códigos e os valores dos casos de teste.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w02"))
from _comum import Placar, sql_principal  # noqa: E402

p = Placar()
S = "staging"
DONO, ALUNO, MASTER = "prof2.teste.claude@physiqcalc.app", "aluno2.teste.claude@physiqcalc.app", "admin.teste.claude@physiqcalc.app"
COLUNAS_IP = ("ip_handle", "ip_link_url", "ip_expira_em", "ip_transaction_nsu", "ip_slug", "ip_recibo_url", "ip_valor_pago",
              "ip_parcelas", "ip_meio", "ip_conferido_em")


def _resultado(q: str) -> dict:
    try:
        sql_principal(q)
    except RuntimeError as e:
        m = re.search(r"RESULTADO<<(.*)>>", str(e), re.S)
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado")


def como(uid: str, master: bool = False) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub de `uid` (uma variável do bloco)."""
    meta = ", 'app_metadata', json_build_object('role', 'master')" if master else ""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated'{meta})::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"


def tentativa(tipo: str, expira: str, status: str = "aguardando_confirmacao", var: str = "v_c") -> str:
    """Uma tentativa da InfinitePay da matrícula de teste (como o servidor grava: forma, handle, prazo) e o link 1 dela (I4: o pedido
    `<id>-1` com a InfiniteTag e o preço)."""
    return (f"  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem,"
            f" ip_handle, ip_link_url, ip_expira_em) values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, '{status}', '{tipo}',"
            f" 'infinitepay', 'teste_w1', 'w1teste', 'https://checkout.infinitepay.io/w1teste?lenc=t', {expira}) returning id into {var};\n"
            f"  insert into {S}.infinitepay_links (pedido, cobranca_id, n, handle, centavos) values ({var}::text || '-1', {var}, 1, 'w1teste', 1000);\n")


def bloco(corpo: str) -> dict:
    return _resultado(f"""do $t$
declare v_dono uuid; v_aluno uuid; v_master uuid; v_conta uuid; v_pac uuid; v_c uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_k1 uuid; v_k2 uuid;
        v_j jsonb; v_res jsonb := '{{}}'::jsonb; v_n integer;
begin
  select u.id into v_dono from auth.users u where lower(u.email) = '{DONO}';
  select u.id into v_aluno from auth.users u where lower(u.email) = '{ALUNO}';
  select u.id into v_master from auth.users u where lower(u.email) = '{MASTER}';
  select c.id into v_conta from {S}.contas c where c.dono_id = v_dono and c.origem <> 'app' order by c.criado_em limit 1;
  select pa.id into v_pac from {S}.pacientes pa where pa.user_id = v_aluno and pa.conta_id = v_conta and pa.deleted_at is null limit 1;
  -- ponto de partida (desfeito no fim): Pix manual, sem integração, a flag ligada, nada aguardando para o aluno de teste
  update {S}.contas set recebimento_modo = 'pix_manual' where id = v_conta;
  delete from {S}.recebimento_integracoes where conta_id = v_conta;
  update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'infinitepay';
  update {S}.cobrancas set deleted_at = now() where paciente_id = v_pac and status = 'aguardando_confirmacao' and deleted_at is null;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;""")


def aguardando() -> str:
    return (f"(select (x ->> 'aguardando')::boolean from jsonb_array_elements({S}.financeiro_do_aluno()) x"
            f" where x ->> 'paciente_id' = v_pac::text)")


def casos_m1() -> None:
    # 1. modos e formas; o NSU é único por InfiniteTag
    r = bloco(f"""  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;   -- como o servidor: o CHECK aceita
  v_res := v_res || jsonb_build_object('modo', (select recebimento_modo from {S}.contas where id = v_conta));
  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem, ip_handle, ip_transaction_nsu)
  values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, 'paga', 'avulsa', 'infinitepay', 'teste_w1', 'w1teste', 'NSU-W1-1');
  begin
    insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem, ip_handle, ip_transaction_nsu)
    values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, 'paga', 'avulsa', 'infinitepay', 'teste_w1', 'w1teste', 'NSU-W1-1');
    v_res := v_res || jsonb_build_object('nsu_unico', false);
  exception when unique_violation then v_res := v_res || jsonb_build_object('nsu_unico', true);
  end;
  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem, ip_handle, ip_transaction_nsu)
  values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, 'paga', 'avulsa', 'infinitepay', 'teste_w1', 'outra.tag', 'NSU-W1-1');
  v_res := v_res || jsonb_build_object('outra_tag', true);
""" + tentativa("avulsa", "now() + interval '1 hour'") + f"""  begin
    insert into {S}.infinitepay_links (pedido, cobranca_id, n, handle, centavos) values (v_c::text || '-1', v_c, 1, 'outra.tag', 500);
    v_res := v_res || jsonb_build_object('pedido_unico', false);
  exception when unique_violation then v_res := v_res || jsonb_build_object('pedido_unico', true);
  end;
""")
    p.check(r == {"modo": "infinitepay", "nsu_unico": True, "outra_tag": True, "pedido_unico": True},
            f"1. modo e forma infinitepay; NSU único por InfiniteTag; o pedido do link é único (I4) ({r})")

    # 2. a guarda da conta: o dono só liga a InfinitePay com a integração ativa
    r = bloco(como("v_dono") + f"""  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('sem_integracao', (select recebimento_modo from {S}.contas where id = v_conta));
  insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em) values (v_conta, 'infinitepay', 'w1teste', 'ativa', now());
""" + como("v_dono") + f"""  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('com_integracao', (select recebimento_modo from {S}.contas where id = v_conta));
""")
    p.check(r == {"sem_integracao": "pix_manual", "com_integracao": "infinitepay"}, f"2. o dono liga a InfinitePay só com a integração ativa ({r})")

    # 3. a InfiniteTag pela RPC (como a pessoa)
    r = bloco(como("v_dono") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, ' $W1Teste ');
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('dono', v_j ->> 'handle', 'gravada', (select infinitepay_handle from {S}.recebimento_integracoes
                                       where conta_id = v_conta and provedor = 'infinitepay'));
""" + como("v_aluno") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'outra');
  v_res := v_res || jsonb_build_object('aluno', v_j ->> 'erro');
  begin
    perform 1 from {S}.recebimento_integracoes limit 1;
    v_res := v_res || jsonb_build_object('app_le', true);
  exception when insufficient_privilege then v_res := v_res || jsonb_build_object('app_le', false);
  end;
""" + VOLTA + como("v_dono") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'ana personal');
  v_res := v_res || jsonb_build_object('ruim', v_j ->> 'erro');
""" + VOLTA + f"""  update {S}.app_config set valor = jsonb_build_object('liberada', false) where chave = 'infinitepay';
""" + como("v_dono") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'w1teste');
  v_res := v_res || jsonb_build_object('flag', v_j ->> 'erro');
""" + VOLTA + como("v_master", master=True) + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'w1teste');
  v_res := v_res || jsonb_build_object('master_com_flag_desligada', v_j ->> 'ok');
""" + VOLTA)
    p.check(r == {"dono": "w1teste", "gravada": "w1teste", "aluno": "so_o_dono", "app_le": False, "ruim": "infinitetag_invalida",
                  "flag": "infinitepay_em_teste", "master_com_flag_desligada": "true"},
            f"3. a InfiniteTag: o dono grava, o aluno não, o app não lê a tabela, a flag segura o personal e não o master ({r})")

    # 4. ligar uma chave Pix desliga as outras, numa transação
    r = bloco(f"""  insert into {S}.recebimento_chaves (conta_id, tipo, chave, ativa) values (v_conta, 'email', 'w1a@teste.com', false) returning id into v_k1;
  insert into {S}.recebimento_chaves (conta_id, tipo, chave, ativa) values (v_conta, 'email', 'w1b@teste.com', false) returning id into v_k2;
""" + como("v_dono") + f"""  v_j := {S}.recebimento_chave_ligar(v_conta, v_k1, true);
  v_j := {S}.recebimento_chave_ligar(v_conta, v_k2, true);
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('ligadas', (select count(*) from {S}.recebimento_chaves where conta_id = v_conta and ativa),
                                       'a_ligada', (select id = v_k2 from {S}.recebimento_chaves where conta_id = v_conta and ativa));
""" + como("v_aluno") + f"""  v_j := {S}.recebimento_chave_ligar(v_conta, v_k1, true);
""" + VOLTA + "  v_res := v_res || jsonb_build_object('aluno', v_j ->> 'erro');\n")
    p.check(r == {"ligadas": 1, "a_ligada": True, "aluno": "chave_inexistente"}, f"4. 1 chave ligada por vez; o aluno não liga ({r})")

    # 5. o app não grava a tentativa nem a baixa
    # como o dono pela API: criado_por = ele (a policy da w02 pede — MENOR 1 da revisão; o molde do e2e/wp/api.py:722-724)
    r = bloco(como("v_dono") + f"""  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, criado_por, descricao, valor, vencimento, status, tipo, forma,
                             origem, ip_handle, ip_transaction_nsu, ip_recibo_url)
  values (v_dono, v_pac, v_conta, v_dono, 'teste w1 app', 10, current_date, 'aberta', 'avulsa', 'infinitepay', 'teste_w1', 'w1teste',
          'NSU-APP', 'https://recibo.infinitepay.io/x') returning id into v_c;
""" + VOLTA + f"""  v_res := v_res || (select jsonb_build_object('forma', forma, 'handle', ip_handle, 'nsu', ip_transaction_nsu, 'recibo', ip_recibo_url)
                      from {S}.cobrancas where id = v_c);
""")
    p.check(r == {"forma": None, "handle": None, "nsu": None, "recibo": None}, f"5. o app não grava forma infinitepay nem ip_* ({r})")

    # 6. a trava do inadimplente: a tentativa só conta como aguardando enquanto vale (W1-B1)
    r = bloco(tentativa("mensalidade", "now() + interval '1 hour'") + como("v_aluno")
              + f"  v_res := v_res || jsonb_build_object('viva', {aguardando()});\n" + VOLTA
              + f"  update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = v_c;\n" + como("v_aluno")
              + f"  v_res := v_res || jsonb_build_object('vencida', {aguardando()});\n" + VOLTA
              + tentativa("avulsa", "now() - interval '1 minute'", var="v_c2") + como("v_aluno")
              + f"""  v_res := v_res || jsonb_build_object('avulsa_aberta', exists (select 1 from jsonb_array_elements({S}.financeiro_do_aluno()) x,
                   jsonb_array_elements(x -> 'abertas') a where a ->> 'id' = v_c2::text));
""" + VOLTA)
    p.check(r == {"viva": True, "vencida": False, "avulsa_aberta": True}, f"6. aguardando só enquanto vale; a avulsa vencida volta às abertas ({r})")

    # 7. o master vê a InfinitePay
    r = bloco(f"""  insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em) values (v_conta, 'infinitepay', 'w1teste', 'ativa', now());
  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;
  v_res := v_res || jsonb_build_object('linha', {S}.w27_conta_linha(v_conta) -> 'infinitepay' ->> 'handle');
""" + como("v_master", master=True) + f"""  v_j := {S}.master_integracoes(0, 100);
""" + VOLTA + "  v_res := v_res || jsonb_build_object('resumo', (v_j -> 'resumo' ->> 'infinitepay')::int >= 1);\n")
    p.check(r == {"linha": "w1teste", "resumo": True}, f"7. o master vê a InfiniteTag e a contagem ({r})")

    # 8. a conta encerrada perde a integração (a InfiniteTag não fica guardada)
    r = bloco(f"""  insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em) values (v_conta, 'infinitepay', 'w1teste', 'ativa', now());
  update {S}.contas set situacao = 'cancelada' where id = v_conta;
  v_res := v_res || jsonb_build_object('integracoes', (select count(*) from {S}.recebimento_integracoes where conta_id = v_conta));
""")
    p.check(r == {"integracoes": 0}, f"8. conta encerrada sem integração ({r})")


def casos_m2() -> None:
    # 9. fechar as vencidas
    r = bloco(tentativa("mensalidade", "now() - interval '1 minute'")
              + tentativa("mensalidade", "now() - interval '1 minute'", var="v_c2")
              + f"  insert into {S}.infinitepay_avisos (cobranca_id, pedido, transaction_nsu, origem) values (v_c2, v_c2::text || '-1', 'NSU-PEND', 'webhook');\n"
              + tentativa("avulsa", "now() - interval '1 minute'", var="v_c3")
              + tentativa("mensalidade", "now() - interval '1 minute'", var="v_c4")
              + f"  update {S}.cobrancas set deleted_at = now() where id = v_c4;   -- apagada: não é tocada (MENOR 2)\n"
              + f"""  v_n := {S}.infinitepay_fechar_vencidas(v_pac);
  v_res := jsonb_build_object('fechadas', v_n,
    'mensalidade', (select jsonb_build_object('status', status, 'fora', deleted_at is not null, 'handle', ip_handle) from {S}.cobrancas where id = v_c),
    'com_aviso', (select status from {S}.cobrancas where id = v_c2),
    'avulsa', (select jsonb_build_object('status', status, 'forma', forma, 'handle', ip_handle, 'link', ip_link_url) from {S}.cobrancas where id = v_c3),
    'apagada', (select status from {S}.cobrancas where id = v_c4));
""")
    p.check(r == {"fechadas": 2, "mensalidade": {"status": "cancelada", "fora": True, "handle": "w1teste"}, "com_aviso": "aguardando_confirmacao",
                  "avulsa": {"status": "aberta", "forma": None, "handle": "w1teste", "link": None}, "apagada": "aguardando_confirmacao"},
            f"9. vencidas fecham; com aviso pendente fica; a apagada não é tocada; a InfiniteTag fica para a baixa atrasada ({r})")
    # 10. a rodada (no bloco desfeito o pg_net não manda nada)
    r = bloco(tentativa("mensalidade", "now() + interval '1 hour'")
              + f"""  insert into {S}.infinitepay_avisos (cobranca_id, pedido, transaction_nsu, origem, proxima_em)
  values (v_c, v_c::text || '-1', 'NSU-RODADA', 'webhook', now() - interval '1 minute');
  v_j := {S}.infinitepay_rodada();
  v_res := jsonb_build_object('reenviados', (v_j ->> 'reenviados')::int >= 1,
                              'adiada', (select proxima_em > now() from {S}.infinitepay_avisos where cobranca_id = v_c and transaction_nsu = 'NSU-RODADA'));
""")
    p.check(r == {"reenviados": True, "adiada": True}, f"10. a rodada reenvia o aviso pronto e o adia 15 min ({r})")


def sobras() -> None:
    n = sql_principal(f"""select (select count(*) from {S}.cobrancas where origem = 'teste_w1')
                               + (select count(*) from {S}.recebimento_chaves where chave like 'w1_@teste.com') as n""")[0]["n"]
    p.check(n == 0, f"11. nada ficou gravado ({n})")


def catalogo(s: str) -> None:
    """Só leitura (vale no public): o que a migration criou está lá, o app não alcança as 3 tabelas novas e o job existe."""
    colunas = sql_principal(f"""select count(*)::int as n from information_schema.columns where table_schema = '{s}' and table_name = 'cobrancas'
                                 and column_name in ({", ".join(f"'{c}'" for c in COLUNAS_IP)})""")[0]["n"]
    p.check(colunas == len(COLUNAS_IP), f"[{s}] as {len(COLUNAS_IP)} colunas ip_* em cobrancas ({colunas})")
    t = sql_principal(f"""select c.relname, c.relrowsecurity as rls, has_table_privilege('authenticated', c.oid, 'SELECT') as app_le,
                                 has_table_privilege('anon', c.oid, 'SELECT') as anon_le
                            from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = '{s}' and c.relname in ('recebimento_integracoes', 'infinitepay_avisos', 'infinitepay_links')
                           order by 1""")
    p.check(len(t) == 3 and all(x["rls"] and not x["app_le"] and not x["anon_le"] for x in t), f"[{s}] as 3 tabelas novas: RLS e só o servidor ({t})")
    f = {x["proname"] for x in sql_principal(f"""select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = '{s}'
                and p.proname in ('recebimento_integracao_ativa', 'recebimento_infinitepay_salvar', 'recebimento_chave_ligar', 'cobrancas_guard_infinitepay',
                                  'contas_encerrada_sem_integracao', 'infinitepay_fechar_vencidas', 'infinitepay_rodada')""")}
    p.check(len(f) == 7, f"[{s}] as 7 funções novas ({sorted(f)})")
    job = sql_principal(f"select count(*)::int as n from cron.job where jobname = 'infinitepay-rodada-{s}'")[0]["n"]
    p.check(job == 1, f"[{s}] o pg_cron infinitepay-rodada-{s} ({job})")
    flag = sql_principal(f"select valor::text as v from {s}.app_config where chave = 'infinitepay'")
    p.check(len(flag) == 1, f"[{s}] a flag da InfinitePay existe: {flag[0]['v'] if flag else 'falta'}")
    chk = sql_principal(f"""select count(*)::int as n from pg_constraint c where c.conrelid in ('{s}.contas'::regclass, '{s}.cobrancas'::regclass)
                             and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%infinitepay%'""")[0]["n"]
    p.check(chk >= 2, f"[{s}] os CHECK de contas.recebimento_modo e cobrancas.forma aceitam infinitepay ({chk})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", default="tudo", choices=("m1", "m2", "tudo"))
    ap.add_argument("--so-catalogo", action="store_true")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    a = ap.parse_args()
    if a.so_catalogo:
        catalogo(a.schema)
        return p.fim()
    if a.schema != "staging":
        raise SystemExit("os casos com escrita (desfeita) são só do staging")
    if a.so in ("m1", "tudo"):
        casos_m1()
    if a.so in ("m2", "tudo"):
        casos_m2()
    sobras()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
```

Run: `python3 e2e/w1/sql_w1.py --so m1`
Expected: FAIL — `column "ip_handle" … does not exist` / `function staging.recebimento_infinitepay_salvar … does not exist`.

- [ ] **Step 2: Escrever a migration**

```sql
-- Physiq W1 — InfinitePay (o aluno paga o personal na página HOSPEDADA da InfinitePay). Banco principal, staging + public. Idempotente.
-- UMA migration só (revisão I2 de 11/10). Eram 2, e na produção a 1ª ligava o código novo antes de a RPC da 2ª existir. O
-- apply_migration_principal.py roda o bloco de cada schema numa transação: tudo entra junto, ou nada entra.
--   · seções 1–12: os DADOS E TRAVAS (Task 5 do plano);
--   · seções 13 e 14: o PRAZO DE 72 H E A RODADA (Task 6, acrescentadas no fim deste mesmo arquivo).
-- Desenho: ~/Desktop/Physiq - InfinitePay/…desenho aprovado - 2026-10-10.md (a seção 8 por cima das 4 e 5) + o spec-review (W1-B1; "o dono
-- liga os modos novos sem integração"; colunas com prefixo em cobrancas; "trava no banco") + a revisão de 11/10 (I4: um order_nsu por link).
-- SÓ ACRESCENTA, ou troca uma função a partir do corpo mais novo; para quem não usa a InfinitePay nada muda:
--   · contas.recebimento_modo e cobrancas.forma aceitam 'infinitepay' ('mercadopago' continua = o MP do Physiq, só o master liga);
--   · cobrancas: as colunas ip_* — a TENTATIVA (a InfiniteTag USADA no link, o link, o prazo de 72 h) e a BAIXA (NSU único por tag,
--     slug, recibo, valor pago, parcelas, meio); nulas em tudo o que já existe;
--   · SÓ o servidor (RLS ligado, nada para o app):
--       - recebimento_integracoes: 1 por conta e provedor; na W1 a InfiniteTag (a W2 acrescenta o MP da conta);
--       - infinitepay_links: um order_nsu por link, `<cobranca_id>-<n>`, com a InfiniteTag e o preço dele (a InfinitePay aceita
--         order_nsu repetido: a unicidade é nossa);
--       - infinitepay_avisos: a caixa de avisos do webhook, da volta da página e da conferência só do pedido;
--   · app_config 'infinitepay' {"liberada": false}: o personal só vê a opção com a flag ligada (o master sempre) — o staging liga na
--     Task 12 do plano; a produção, depois dos 2 testes de R$ 1 do Weslley (Task 22);
--   · contas_guard (corpo da 20261002040000_w28_virada.sql) + a InfinitePay só com a integração ativa (o dono não liga pela API sem
--     a InfiniteTag); cobrancas_guard_infinitepay (o app não grava a tentativa nem a baixa);
--   · recebimento_infinitepay_salvar (a InfiniteTag — RPC chamada COMO A PESSOA, confere o dono) e recebimento_chave_ligar (1 chave
--     ligada numa transação só — SECURITY INVOKER: o RLS de recebimento_chaves vale);
--   · financeiro_do_aluno (corpo da 20261011010000_wp_planos_modalidades.sql): a tentativa vencida da InfinitePay não conta como
--     "aguardando" e a avulsa vencida volta às "abertas" (W1-B1: não solta a trava do inadimplente);
--   · w27_conta_linha (corpo da w28) e master_integracoes (corpo da 20261009060000_hml14d_master_paginado.sql): o master vê a InfinitePay;
--   · a conta encerrada (excluir a conta, master) perde a integração;
--   · [Task 6] infinitepay_fechar_vencidas (a tentativa vencida sem aviso pendente sai) e infinitepay_rodada no pg_cron a cada 15 min.
--
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py; dry-run antes de cada):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so public
-- Testes (staging, blocos desfeitos): python3 e2e/w1/sql_w1.py · no public, só leitura: python3 e2e/w1/sql_w1.py --so-catalogo --schema public

-- ============================================================================================================
-- 1. Os modos e as formas (os CHECK de hoje têm nome automático: troca pelo catálogo)
-- ============================================================================================================
do $w1$
declare r record;
begin
  for r in select c.conname from pg_constraint c where c.conrelid = '{schema}.contas'::regclass and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%recebimento_modo%' loop
    execute format('alter table {schema}.contas drop constraint %I', r.conname);
  end loop;
  for r in select c.conname from pg_constraint c where c.conrelid = '{schema}.cobrancas'::regclass and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%forma%' and pg_get_constraintdef(c.oid) ilike '%pix_manual%' loop
    execute format('alter table {schema}.cobrancas drop constraint %I', r.conname);
  end loop;
end $w1$;
alter table {schema}.contas add constraint contas_recebimento_modo_check
  check (recebimento_modo in ('pix_manual', 'nenhum', 'mercadopago', 'infinitepay'));
alter table {schema}.cobrancas add constraint cobrancas_forma_check
  check (forma is null or forma in ('pix_manual', 'mp', 'manual', 'infinitepay'));

-- ============================================================================================================
-- 2. A tentativa e a baixa na própria cobrança (spec-review §7, resposta 2: a cobrança já é a tentativa — o MP guarda ali também)
-- ============================================================================================================
alter table {schema}.cobrancas add column if not exists ip_handle text;            -- a InfiniteTag USADA no link (confere com ela)
alter table {schema}.cobrancas add column if not exists ip_link_url text;          -- o checkout (reaproveitado enquanto vale)
alter table {schema}.cobrancas add column if not exists ip_expira_em timestamptz;   -- 72 h (W1-B1)
alter table {schema}.cobrancas add column if not exists ip_transaction_nsu text;    -- o NSU da baixa ("pedido:<pedido do link>" = pago só pelo pedido)
alter table {schema}.cobrancas add column if not exists ip_slug text;
alter table {schema}.cobrancas add column if not exists ip_recibo_url text;         -- o recibo da InfinitePay (histórico do aluno)
alter table {schema}.cobrancas add column if not exists ip_valor_pago numeric(10,2); -- paid_amount (com as taxas que o personal repassa)
alter table {schema}.cobrancas add column if not exists ip_parcelas integer;
alter table {schema}.cobrancas add column if not exists ip_meio text;
alter table {schema}.cobrancas add column if not exists ip_conferido_em timestamptz; -- a última conferência só pelo pedido (1 a cada 30 s)
alter table {schema}.cobrancas drop constraint if exists cobrancas_ip_check;
alter table {schema}.cobrancas add constraint cobrancas_ip_check check (
      (ip_handle is null or ip_handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$')
  and (ip_link_url is null or (char_length(ip_link_url) <= 2048 and ip_link_url like 'https://%'))   -- o link medido no máximo: 486
  and (ip_recibo_url is null or (char_length(ip_recibo_url) <= 2048 and ip_recibo_url like 'https://%'))
  and (ip_transaction_nsu is null or char_length(ip_transaction_nsu) between 1 and 80)
  and (ip_slug is null or char_length(ip_slug) <= 80)
  and (ip_parcelas is null or ip_parcelas between 1 and 12)
  and (ip_meio is null or ip_meio in ('pix', 'credit_card'))
  and (ip_valor_pago is null or ip_valor_pago > 0));
-- idempotência da baixa: o mesmo NSU da mesma InfiniteTag vale 1 vez (a doc não diz se o NSU é único entre contas da InfinitePay)
create unique index if not exists cobrancas_ip_transaction_uq on {schema}.cobrancas (ip_handle, ip_transaction_nsu) where ip_transaction_nsu is not null;
create index if not exists cobrancas_ip_tentativas_idx on {schema}.cobrancas (paciente_id, ip_expira_em)
  where forma = 'infinitepay' and status = 'aguardando_confirmacao';

-- ============================================================================================================
-- 3. A integração: 1 por conta e provedor (W1: a InfiniteTag; a W2 amplia o CHECK e acrescenta as colunas do MP da conta)
-- ============================================================================================================
create table if not exists {schema}.recebimento_integracoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  provedor text not null,
  infinitepay_handle text,
  status text not null default 'ativa',
  testado_em timestamptz,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (conta_id, provedor)
);
alter table {schema}.recebimento_integracoes drop constraint if exists recebimento_integracoes_check;
alter table {schema}.recebimento_integracoes add constraint recebimento_integracoes_check check (
  provedor in ('infinitepay') and status in ('ativa', 'erro')
  and (provedor <> 'infinitepay' or (infinitepay_handle is not null and infinitepay_handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$')));
comment on table {schema}.recebimento_integracoes is
  'W1: a forma de receber da conta num provedor (a InfiniteTag). Só o servidor; o dono grava pela recebimento_infinitepay_salvar.';
drop trigger if exists trg_recebimento_integracoes_atualizado_em on {schema}.recebimento_integracoes;
create trigger trg_recebimento_integracoes_atualizado_em before update on {schema}.recebimento_integracoes
  for each row execute function {schema}.set_atualizado_em();
alter table {schema}.recebimento_integracoes enable row level security;
revoke all on table {schema}.recebimento_integracoes from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.recebimento_integracoes to service_role;

-- ============================================================================================================
-- 3b. Os links (I4 da revisão): um order_nsu por link — '<cobranca_id>-<n>' — com a InfiniteTag e o preço DAQUELE link. A
--     conferência usa os 2 (o personal pode trocar de tag). A InfinitePay ACEITA order_nsu repetido (sondado em 11/10: 2 links com o
--     mesmo deram 200), então a unicidade é nossa (a chave). Só o servidor.
-- ============================================================================================================
create table if not exists {schema}.infinitepay_links (
  pedido text primary key,
  cobranca_id uuid not null references {schema}.cobrancas(id) on delete cascade,
  n integer not null,
  handle text not null,
  centavos integer not null,
  url text,
  criado_em timestamptz not null default now(),
  unique (cobranca_id, n)
);
alter table {schema}.infinitepay_links drop constraint if exists infinitepay_links_check;
alter table {schema}.infinitepay_links add constraint infinitepay_links_check check (
      pedido = cobranca_id::text || '-' || n::text and n between 1 and 9999
  and handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$' and centavos > 0
  and (url is null or (char_length(url) <= 2048 and url like 'https://%')));
comment on table {schema}.infinitepay_links is
  'W1: um order_nsu por link da InfinitePay (<cobranca_id>-<n>), com a InfiniteTag e o preço daquele link. Só o servidor.';
alter table {schema}.infinitepay_links enable row level security;
revoke all on table {schema}.infinitepay_links from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.infinitepay_links to service_role;

-- ============================================================================================================
-- 4. A caixa de avisos: 1 por (link, NSU, slug) — um POST forjado com o mesmo NSU e outro slug NÃO apaga o aviso verdadeiro;
--    cada um é conferido no payment_check (a InfiniteTag e o preço vêm do LINK, não do aviso)
-- ============================================================================================================
create table if not exists {schema}.infinitepay_avisos (
  id bigint generated always as identity primary key,
  cobranca_id uuid not null references {schema}.cobrancas(id) on delete cascade,
  pedido text not null references {schema}.infinitepay_links(pedido) on delete cascade,
  transaction_nsu text not null,
  slug text not null default '',
  recibo_url text,
  meio text,
  origem text not null,
  recebido_em timestamptz not null default now(),
  tentativas integer not null default 0,
  tentado_em timestamptz,
  proxima_em timestamptz not null default now(),
  conferido_em timestamptz,
  resultado text,
  unique (pedido, transaction_nsu, slug)
);
alter table {schema}.infinitepay_avisos drop constraint if exists infinitepay_avisos_check;
alter table {schema}.infinitepay_avisos add constraint infinitepay_avisos_check check (
      char_length(transaction_nsu) between 1 and 80 and char_length(slug) <= 80
  and (recibo_url is null or (char_length(recibo_url) <= 2048 and recibo_url like 'https://%'))
  and (meio is null or meio in ('pix', 'credit_card'))
  and origem in ('webhook', 'volta', 'pedido') and tentativas >= 0
  and (resultado is null or resultado in ('pago', 'ja_pago', 'ja_pago_por_fora', 'nsu_novo', 'outro_pagamento', 'nsu_repetido', 'nao_pago',
                                         'valor_diferente', 'desistiu')));
comment on table {schema}.infinitepay_avisos is
  'W1: o que chegou da InfinitePay (webhook, volta da página, conferência só do pedido) — a baixa só depois do payment_check. Só o servidor.';
create index if not exists infinitepay_avisos_pendentes_idx on {schema}.infinitepay_avisos (proxima_em) where conferido_em is null;
create index if not exists infinitepay_avisos_cobranca_idx on {schema}.infinitepay_avisos (cobranca_id);   -- o teto de 20 por cobrança (I6)
alter table {schema}.infinitepay_avisos enable row level security;
revoke all on table {schema}.infinitepay_avisos from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.infinitepay_avisos to service_role;

-- ============================================================================================================
-- 5. A flag (o mesmo lugar dos outros ajustes do master; publica = false: só o servidor lê)
-- ============================================================================================================
insert into {schema}.app_config (chave, valor, publica) values ('infinitepay', '{"liberada": false}'::jsonb, false)
on conflict (chave) do nothing;

-- ============================================================================================================
-- 6. A guarda da conta (corpo da 20261002040000_w28_virada.sql:25-49) + a InfinitePay só com a integração ativa
-- ============================================================================================================
-- o ajudante da guarda (que roda como o app): só responde a quem é da conta ou ao master
create or replace function {schema}.recebimento_integracao_ativa(p_conta uuid, p_provedor text) returns boolean
language sql stable security definer set search_path = '' as $$
  select ({schema}.eh_master() or {schema}.sou_membro(p_conta))
     and exists (select 1 from {schema}.recebimento_integracoes i
                  where i.conta_id = p_conta and i.provedor = p_provedor and i.status = 'ativa');
$$;
revoke all on function {schema}.recebimento_integracao_ativa(uuid, text) from public, anon;
grant execute on function {schema}.recebimento_integracao_ativa(uuid, text) to authenticated, service_role;

create or replace function {schema}.contas_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    -- o dono edita nome, recebimento (menos ligar o Mercado Pago; a InfinitePay só com a integração) e o bloqueio do inadimplente
    new.id := old.id; new.dono_id := old.dono_id; new.origem := old.origem; new.plano := old.plano; new.faixa := old.faixa;
    new.periodicidade := old.periodicidade; new.situacao := old.situacao; new.teste_ate := old.teste_ate;
    new.vence_em := old.vence_em; new.tolerancia_dias := old.tolerancia_dias; new.valor_travado := old.valor_travado;
    new.regra_pix := old.regra_pix; new.cobranca_legada := old.cobranca_legada; new.isenta_motivo := old.isenta_motivo;
    new.regras_legadas := old.regras_legadas;
    new.alunos_bloqueados_em := old.alunos_bloqueados_em; new.alunos_bloqueados_msg := old.alunos_bloqueados_msg;
    new.criado_em := old.criado_em;
    if new.recebimento_modo = 'mercadopago' and old.recebimento_modo is distinct from 'mercadopago' then
      new.recebimento_modo := old.recebimento_modo;
    end if;
    -- W1: a InfinitePay só com a InfiniteTag gravada (recebimento_infinitepay_salvar)
    if new.recebimento_modo = 'infinitepay' and old.recebimento_modo is distinct from 'infinitepay'
       and not {schema}.recebimento_integracao_ativa(new.id, 'infinitepay') then
      new.recebimento_modo := old.recebimento_modo;
    end if;
  end if;
  return new;
end;
$function$;

-- ============================================================================================================
-- 7. A InfiniteTag (o dono, COMO A PESSOA): confere dono/master, a conta do app, a flag e o formato; grava ativa e testada
--    (quem chama — a pagamentos-aluno — já criou um link de R$ 1,00 com ela: a InfinitePay disse que a tag existe)
-- ============================================================================================================
create or replace function {schema}.recebimento_infinitepay_salvar(p_conta uuid, p_handle text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c {schema}.contas%rowtype;
  v_h text := lower(btrim(regexp_replace(coalesce(p_handle, ''), '^\s*\$+', '')));
  v_liberada boolean;
  v_i {schema}.recebimento_integracoes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_invalida'); end if;
  if not ({schema}.eh_master() or {schema}.sou_dono(p_conta)) then return jsonb_build_object('ok', false, 'erro', 'so_o_dono'); end if;
  if v_c.origem = 'app' and not {schema}.eh_master() then return jsonb_build_object('ok', false, 'erro', 'conta_do_app'); end if;
  if v_h = '' then
    -- tirar a InfiniteTag: só fora da InfinitePay (troque a forma antes)
    if v_c.recebimento_modo = 'infinitepay' then return jsonb_build_object('ok', false, 'erro', 'em_uso'); end if;
    delete from {schema}.recebimento_integracoes where conta_id = p_conta and provedor = 'infinitepay';
    return jsonb_build_object('ok', true, 'handle', null, 'status', null, 'testado_em', null);
  end if;
  select coalesce((a.valor ->> 'liberada')::boolean, false) into v_liberada from {schema}.app_config a where a.chave = 'infinitepay';
  if not coalesce(v_liberada, false) and not {schema}.eh_master() then
    return jsonb_build_object('ok', false, 'erro', 'infinitepay_em_teste');
  end if;
  if v_h !~ '^[a-z0-9][a-z0-9._-]{1,39}$' then return jsonb_build_object('ok', false, 'erro', 'infinitetag_invalida'); end if;
  insert into {schema}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em, atualizado_por)
  values (p_conta, 'infinitepay', v_h, 'ativa', now(), v_uid)
  on conflict (conta_id, provedor) do update set infinitepay_handle = excluded.infinitepay_handle, status = 'ativa',
    testado_em = excluded.testado_em, atualizado_por = excluded.atualizado_por
  returning * into v_i;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (p_conta, 'outro', '{}'::jsonb, jsonb_build_object('w1', 'infinitetag', 'status', 'ativa'), v_uid);
  return jsonb_build_object('ok', true, 'handle', v_i.infinitepay_handle, 'status', v_i.status, 'testado_em', v_i.testado_em);
end;
$$;
revoke all on function {schema}.recebimento_infinitepay_salvar(uuid, text) from public, anon;
grant execute on function {schema}.recebimento_infinitepay_salvar(uuid, text) to authenticated, service_role;

-- ============================================================================================================
-- 8. Ligar uma chave Pix desliga as outras da conta, numa transação (antes: 2 PATCH do navegador). SECURITY INVOKER: o RLS de
--    recebimento_chaves vale (o dono e o membro dono da chave; o master) — quem não enxerga a chave recebe chave_inexistente
-- ============================================================================================================
create or replace function {schema}.recebimento_chave_ligar(p_conta uuid, p_chave uuid, p_ligar boolean) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_n integer;
begin
  if not exists (select 1 from {schema}.recebimento_chaves k where k.id = p_chave and k.conta_id = p_conta) then
    return jsonb_build_object('ok', false, 'erro', 'chave_inexistente');
  end if;
  if coalesce(p_ligar, false) then
    update {schema}.recebimento_chaves set ativa = false where conta_id = p_conta and ativa and id <> p_chave;
  end if;
  update {schema}.recebimento_chaves set ativa = coalesce(p_ligar, false) where id = p_chave and conta_id = p_conta;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'erro', 'chave_inexistente'); end if;
  return jsonb_build_object('ok', true, 'id', p_chave, 'ativa', coalesce(p_ligar, false));
end;
$$;
revoke all on function {schema}.recebimento_chave_ligar(uuid, uuid, boolean) from public, anon;
grant execute on function {schema}.recebimento_chave_ligar(uuid, uuid, boolean) to authenticated, service_role;

-- ============================================================================================================
-- 9. O app não grava a tentativa nem a baixa da InfinitePay (o molde do cobrancas_guard_periodo da W-P): só o servidor e o master
-- ============================================================================================================
create or replace function {schema}.cobrancas_guard_infinitepay() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      if new.forma = 'infinitepay' then new.forma := null; end if;
      new.ip_handle := null; new.ip_link_url := null; new.ip_expira_em := null; new.ip_transaction_nsu := null; new.ip_slug := null;
      new.ip_recibo_url := null; new.ip_valor_pago := null; new.ip_parcelas := null; new.ip_meio := null; new.ip_conferido_em := null;
    else
      if new.forma is distinct from old.forma and (new.forma = 'infinitepay' or old.forma = 'infinitepay') then
        new.forma := old.forma;
      end if;
      new.ip_handle := old.ip_handle; new.ip_link_url := old.ip_link_url; new.ip_expira_em := old.ip_expira_em;
      new.ip_transaction_nsu := old.ip_transaction_nsu; new.ip_slug := old.ip_slug; new.ip_recibo_url := old.ip_recibo_url;
      new.ip_valor_pago := old.ip_valor_pago; new.ip_parcelas := old.ip_parcelas; new.ip_meio := old.ip_meio;
      new.ip_conferido_em := old.ip_conferido_em;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.cobrancas_guard_infinitepay() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_infinitepay on {schema}.cobrancas;
create trigger trg_cobrancas_guard_infinitepay before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_infinitepay();

-- ============================================================================================================
-- 10. financeiro_do_aluno() (corpo da 20261011010000_wp_planos_modalidades.sql:207-247) — W1-B1: a tentativa da InfinitePay só conta
--     como "aguardando" enquanto vale (72 h); a avulsa com a tentativa vencida volta às "abertas" (a trava e a faixa a enxergam)
-- ============================================================================================================
create or replace function {schema}.financeiro_do_aluno() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) from (
    select p.created_at as criado, jsonb_build_object(
      'paciente_id', p.id,
      'conta_id', p.conta_id,
      'conta_nome', c.nome,
      'recebimento_modo', coalesce(c.recebimento_modo, 'pix_manual'),
      'bloquear_inadimplente', coalesce(c.bloquear_app_inadimplente, false),
      'tem_chave', exists (select 1 from {schema}.recebimento_chaves k where k.conta_id = p.conta_id and k.ativa),
      'profissional', case when c.origem = 'app' then 'Physiq' else
                        (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr
                          where pr.id = coalesce(c.dono_id, p.personal_id, p.nutricionista_id)) end,
      'mensalidade_valor', p.mensalidade_valor,
      'plano_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      'pausada', p.cobranca_pausada,
      'pago_ate', p.mensalidade_pago_ate,
      'desde', p.mensalidade_desde,
      'aguardando', exists (select 1 from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                              and a.status = 'aguardando_confirmacao' and a.tipo = 'mensalidade'
                              and (a.forma is distinct from 'infinitepay' or a.ip_expira_em > now())),
      'assinatura_ativa', exists (select 1 from {schema}.aluno_assinaturas s where s.paciente_id = p.id and s.status = 'authorized'),
      'abertas', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'descricao', a.descricao, 'valor', a.valor,
                          'vencimento', a.vencimento) order by a.vencimento), '[]'::jsonb)
                    from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                     and (a.status = 'aberta'
                          or (a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa' and a.forma = 'infinitepay'
                              and coalesce(a.ip_expira_em, now()) <= now()))),
      'aguardando_avulsas', (select count(*) from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                               and a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa'
                               and (a.forma is distinct from 'infinitepay' or a.ip_expira_em > now())),
      -- W7b
      'app', coalesce(c.origem = 'app', false),
      'teste_ate', case when c.origem = 'app' then p.app_teste_ate end,
      'plano_codigo', (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      -- W-P
      'modalidade', p.plano_modalidade,
      'plano_meses', (select pa.meses from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id)
    ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
  ) x;
$$;
revoke execute on function {schema}.financeiro_do_aluno() from public, anon;
grant execute on function {schema}.financeiro_do_aluno() to authenticated, service_role;

-- ============================================================================================================
-- 11. O master vê a InfinitePay: a linha da conta (corpo da w28:273-306 + 'infinitepay') e a contagem em Integrações (corpo da
--     hml14d:218-249 + 'infinitepay' nos 2 resumos). O master NÃO liga a InfinitePay (só o dono, com a InfiniteTag): ele desliga pela
--     master_conta_acao('recebimento') de hoje, que já recusa modo fora da lista — ela não muda.
-- ============================================================================================================
create or replace function {schema}.w27_conta_linha(p_conta uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano, 'modulos', to_jsonb({schema}.modulos_do_plano(c.plano)),
    'faixa', c.faixa, 'periodicidade', c.periodicidade, 'situacao', c.situacao,
    'situacao_efetiva', {schema}.w27_situacao(c.origem, c.cobranca_legada, c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias),
    'teste_ate', c.teste_ate, 'vence_em', c.vence_em, 'tolerancia_dias', c.tolerancia_dias, 'valor_travado', c.valor_travado,
    'valor_mensal', {schema}.conta_preco(c.id, c.plano, c.faixa, 1), 'regra_pix', c.regra_pix, 'cobranca_legada', c.cobranca_legada,
    'regras_legadas', c.regras_legadas,
    'isenta_motivo', c.isenta_motivo, 'recebimento_modo', c.recebimento_modo, 'bloquear_app_inadimplente', c.bloquear_app_inadimplente,
    'alunos_bloqueados_em', c.alunos_bloqueados_em, 'alunos_bloqueados_msg', c.alunos_bloqueados_msg,
    'criado_em', c.criado_em, 'atualizado_em', c.atualizado_em, 'eh_app', c.origem = 'app',
    'dono', (select jsonb_build_object('id', u.id, 'nome', {schema}.w27_nome(u.id), 'email', lower(u.email),
                     'master', coalesce(u.raw_app_meta_data ->> 'role', '') = 'master' or coalesce(pr.role, '') = 'master')
               from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = c.dono_id),
    'membros', (select count(*) from {schema}.conta_membros m where m.conta_id = c.id and m.status = 'ativo'),
    'convidados', (select count(*) from {schema}.conta_membros m where m.conta_id = c.id and m.status = 'convidado'),
    'alunos_ativos', {schema}.conta_alunos_ativos(c.id),
    'alunos_total', (select count(*) from {schema}.pacientes p where p.conta_id = c.id and p.deleted_at is null),
    'limite_alunos', {schema}.conta_limite_alunos(c.id),
    'assinatura', (select jsonb_build_object('status', a.status, 'valor', a.valor, 'proximo_vencimento', a.proximo_vencimento)
                     from {schema}.conta_assinaturas a where a.conta_id = c.id),
    'legado_nutri', case when c.origem = 'legado_nutri' then (
        select jsonb_build_object('teste_ate', pr.teste_ate, 'pago_ate', pr.pago_ate, 'isento', coalesce(pr.isento_assinatura, false))
          from {schema}.profiles pr where pr.id = c.dono_id) end,
    'ultima_fatura', (select jsonb_build_object('id', f.id, 'valor', f.valor, 'status', f.status, 'forma', f.forma, 'tipo', f.tipo,
                             'criado_em', f.criado_em, 'pago_em', f.pago_em, 'cobre_ate', f.cobre_ate)
                        from {schema}.conta_faturas f where f.conta_id = c.id order by f.criado_em desc limit 1),
    'chave_pix', (select jsonb_build_object('tipo', k.tipo, 'chave', k.chave, 'favorecido', k.favorecido, 'banco', k.banco)
                    from {schema}.recebimento_chaves k where k.conta_id = c.id and k.ativa limit 1),
    -- W1: a InfinitePay da conta (a InfiniteTag e a situação)
    'infinitepay', (select jsonb_build_object('handle', i.infinitepay_handle, 'status', i.status, 'testado_em', i.testado_em)
                      from {schema}.recebimento_integracoes i where i.conta_id = c.id and i.provedor = 'infinitepay'))
  from {schema}.contas c where c.id = p_conta;
$$;

create or replace function {schema}.master_integracoes(p_offset integer default null, p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  -- hml-14d (B21): a página
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_resumo jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  v_resumo := jsonb_build_object(
    'pix_manual', (select count(*) from {schema}.contas c where c.recebimento_modo = 'pix_manual'),
    'mercadopago', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago'),
    'nenhum', (select count(*) from {schema}.contas c where c.recebimento_modo = 'nenhum'),
    'infinitepay', (select count(*) from {schema}.contas c where c.recebimento_modo = 'infinitepay'),  -- W1
    'com_chave', (select count(distinct k.conta_id) from {schema}.recebimento_chaves k where k.ativa));
  if p_offset is null and p_limite is null then
    -- a chamada de hoje (sem página): o texto da W27 (+ a contagem da W1)
    return jsonb_build_object('ok', true, 'contas', coalesce((
      select jsonb_agg({schema}.w27_conta_linha(c.id) order by c.origem = 'app' desc, lower(c.nome)) from {schema}.contas c), '[]'::jsonb),
      'resumo', v_resumo);
  end if;
  return jsonb_build_object('ok', true,
    'total', (select count(*) from {schema}.contas c),
    'contas', coalesce((
      select jsonb_agg({schema}.w27_conta_linha(pg.id) order by pg.eh_app desc, pg.chave, pg.id)
        from (select c.id, c.origem = 'app' as eh_app, lower(c.nome) as chave from {schema}.contas c
               order by c.origem = 'app' desc, lower(c.nome), c.id
              offset v_off limit v_lim) pg), '[]'::jsonb),
    'resumo', v_resumo);
end;
$$;

-- ============================================================================================================
-- 12. A conta encerrada (excluir_conta_profissional; master) perde a integração: a InfiniteTag não fica guardada
-- ============================================================================================================
create or replace function {schema}.contas_encerrada_sem_integracao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from {schema}.recebimento_integracoes where conta_id = new.id;
  return null;
end;
$$;
revoke all on function {schema}.contas_encerrada_sem_integracao() from public, anon, authenticated;
drop trigger if exists trg_contas_encerrada_sem_integracao on {schema}.contas;
create trigger trg_contas_encerrada_sem_integracao after update of situacao on {schema}.contas
  for each row when (new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada')
  execute function {schema}.contas_encerrada_sem_integracao();
```
> Antes de colar a seção 11: conferir que `w27_conta_linha` (w28:273-306) e `master_integracoes` (hml14d:218-249) são iguais ao que está
> aqui fora das linhas marcadas "W1" — `diff` entre o corpo da migration de origem e o daqui (Task 0, Step 3, garante que não há corpo
> mais novo). A assinatura de `master_integracoes(integer, integer)` não muda (os grants da hml14d continuam).

- [ ] **Step 3: Dry-run, aplicar SÓ no staging (com a trava) e rodar os testes do banco**

Pegar a trava "🔒 BANCO do staging" no quadro (a LINUX 1 pode estar com ela: `SendMessage` "preciso aplicar 1 migration da W1 no staging
(~2 min) — pode ir?" e esperar o "pode ir"; com E2E dela rodando, esperar):
```bash
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging --dry-run
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging
python3 e2e/w1/sql_w1.py --so m1
python3 e2e/w1/sql_w1.py --so-catalogo --schema staging     # as funções da 2ª parte e o job ainda faltam: 2 ❌ esperados aqui
python3 e2e/hml01/banco.py --schema staging
python3 e2e/wp/sql_planos.py
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P node scripts/ci/checar-definer.mjs
```
Expected: dry-run sem erro; `sql_w1.py --so m1` com os casos 1–8 ✅ e o 11 ✅ (nada gravado); `hml01/banco.py` sem regressão (o visitante
segue sem privilégio em tabela; as 3 tabelas novas sem grant); `wp/sql_planos.py` ✅ (a W-P intacta); `checar-definer` sem achado (R1–R3b:
`search_path` em todas, `revoke … from public, anon` e o `grant`/`revoke` do authenticated nas 3 definer novas). Soltar a trava + aviso.
Qualquer ❌ → `superpowers:systematic-debugging` antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add supabase-principal/migrations/20261011200000_w1_infinitepay.sql e2e/w1/sql_w1.py
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): banco (1ª parte da migration) — InfinitePay nos modos e formas, a tentativa e a baixa na cobrança, links, integração, caixa de avisos e travas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/migrations/20261011200000_w1_infinitepay.sql e2e/w1/sql_w1.py
```

---

### Task 6: Banco — a migration (2ª parte, no mesmo arquivo): o prazo de 72 h e a rodada (W1-B1, "conferir depois")

**Files:**
- Modify: `supabase-principal/migrations/20261011200000_w1_infinitepay.sql` — acrescentar as seções 13 e 14 no FIM (revisão I2: uma
  migration só; o arquivo inteiro é idempotente e roda de novo no staging)
- Test: `e2e/w1/sql_w1.py` (casos 9 e 10, já escritos na Task 5)

**Estimativa:** 20 a 35 min (pior cenário 50 min)

- [ ] **Step 1: Ver o teste falhar** — Run: `python3 e2e/w1/sql_w1.py --so m2` → Expected: FAIL (`function staging.infinitepay_fechar_vencidas … does not exist`).

- [ ] **Step 2: Acrescentar no fim do arquivo da migration**

```sql
-- ============================================================================================================
-- 13–14. O PRAZO DE 72 H E A RODADA (spec-review W1-B1 e "gravar primeiro e conferir depois") — Task 6 do plano, no FIM deste mesmo
--        arquivo (UMA migration — revisão I2).
-- ============================================================================================================
--   {schema}.infinitepay_fechar_vencidas(p_paciente)  a tentativa vencida SEM aviso pendente sai: mensalidade → cancelada e fora do
--                                                      histórico (deleted_at: é tentativa, não cobrança); avulsa → volta a aberta. A
--                                                      InfiniteTag fica (ip_handle e o link em infinitepay_links): uma baixa atrasada
--                                                      confere com a do link. A
--                                                      pagamentos-aluno chama por aluno (aluno_status, aluno_ip_link, prof_aluno); a
--                                                      rodada, para todos.
--   {schema}.infinitepay_rodada()                     a cada 15 min (pg_cron): fecha as vencidas e reenvia pelo pg_net ao webhook
--                                                      PÚBLICO (…/infinitepay-webhook-aluno?schema={schema}&origem=rodada) até 20 avisos
--                                                      prontos que não deu para conferir — ele confere tudo de novo no payment_check
--                                                      (nenhum segredo novo: o webhook não confia no corpo de ninguém). Os avisos
--                                                      "não pago" também voltam (I1: reagendados até a 24ª). Sem pg_net, só fecha.
-- Só a service_role e o pg_cron: nada para public/anon/authenticated. Testes: python3 e2e/w1/sql_w1.py --so m2

create or replace function {schema}.infinitepay_fechar_vencidas(p_paciente uuid default null) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_m integer;
  v_a integer;
begin
  update {schema}.cobrancas c set status = 'cancelada', deleted_at = now()
   where c.forma = 'infinitepay' and c.status = 'aguardando_confirmacao' and c.tipo = 'mensalidade' and c.deleted_at is null
     and c.ip_expira_em is not null and c.ip_expira_em < now()
     and (p_paciente is null or c.paciente_id = p_paciente)
     and not exists (select 1 from {schema}.infinitepay_avisos v where v.cobranca_id = c.id and v.conferido_em is null);
  get diagnostics v_m = row_count;
  update {schema}.cobrancas c set status = 'aberta', forma = null, metodo = null, ip_link_url = null, ip_expira_em = null
   where c.forma = 'infinitepay' and c.status = 'aguardando_confirmacao' and c.tipo = 'avulsa' and c.deleted_at is null
     and c.ip_expira_em is not null and c.ip_expira_em < now()
     and (p_paciente is null or c.paciente_id = p_paciente)
     and not exists (select 1 from {schema}.infinitepay_avisos v where v.cobranca_id = c.id and v.conferido_em is null);
  get diagnostics v_a = row_count;
  return v_m + v_a;
end;
$$;

create or replace function {schema}.infinitepay_rodada() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_fechadas integer;
  v_n integer := 0;
  r record;
begin
  v_fechadas := {schema}.infinitepay_fechar_vencidas(null);
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    for r in
      update {schema}.infinitepay_avisos v set proxima_em = now() + interval '15 minutes'
       where v.id in (select a.id from {schema}.infinitepay_avisos a
                       where a.conferido_em is null and a.tentativas < 24 and a.proxima_em <= now()
                       order by a.proxima_em limit 20 for update skip locked)
      returning v.pedido, v.transaction_nsu, v.slug
    loop
      perform net.http_post(
        url := 'https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/infinitepay-webhook-aluno?schema={schema}&origem=rodada',
        body := jsonb_build_object('order_nsu', r.pedido, 'transaction_nsu', r.transaction_nsu, 'invoice_slug', nullif(r.slug, '')),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 20000);
      v_n := v_n + 1;
    end loop;
  end if;
  return jsonb_build_object('fechadas', v_fechadas, 'reenviados', v_n);
end;
$$;

-- só o servidor executa (os default privileges do Supabase dão EXECUTE a toda função nova)
revoke all on function {schema}.infinitepay_fechar_vencidas(uuid), {schema}.infinitepay_rodada() from public, anon, authenticated;
grant execute on function {schema}.infinitepay_fechar_vencidas(uuid), {schema}.infinitepay_rodada() to service_role;

-- a cada 15 min (o mesmo nome ATUALIZA o job)
select cron.schedule('infinitepay-rodada-{schema}', '*/15 * * * *', $$select {schema}.infinitepay_rodada()$$);
```

- [ ] **Step 3: Dry-run, aplicar SÓ no staging (com a trava; o arquivo inteiro de novo — é idempotente) e rodar**

```bash
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging --dry-run
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging
python3 e2e/w1/sql_w1.py
python3 e2e/w1/sql_w1.py --so-catalogo --schema staging
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; flock $P node scripts/ci/checar-definer.mjs
```
Expected: `sql_w1.py` (tudo) 11/11 ✅; o catálogo do staging todo ✅ (colunas, 3 tabelas com RLS e sem grant, 7 funções, o job, a flag,
os 2 CHECK); `checar-definer` limpo. Soltar a trava + aviso.

- [ ] **Step 4: Commit**

```bash
git add supabase-principal/migrations/20261011200000_w1_infinitepay.sql
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): banco (2ª parte da migration) — a tentativa vence em 72 h e a rodada de 15 min reconfere os avisos (pg_cron → webhook)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/migrations/20261011200000_w1_infinitepay.sql
```

---

### Task 7: Servidor — a baixa (caixa de avisos + `payment_check`)

**Files:**
- Create: `supabase-principal/functions/_shared/infinitepay-baixa.ts`
- Modify: `supabase-principal/functions/_shared/financeiro-mp.ts` (`Cobranca` com `ip_*` opcionais + `COLUNAS_COBRANCA_IP`)
- Test: `src/financeiro/servidor.test.ts` (guarda de fonte, primeiro); a prova de verdade é o `e2e/w1/api.py --local` (Tasks 11–12)

**Estimativa:** 40 a 60 min (pior cenário 90 min)

- [ ] **Step 1: A guarda que falha** — acrescentar ao fim de `src/financeiro/servidor.test.ts`:

```ts
describe("W1 — a baixa da InfinitePay só depois do payment_check (guarda de fonte)", () => {
  const FUNCOES = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions");
  const ler = (rel: string) => readFileSync(resolve(FUNCOES, rel), "utf8");
  it("conferirAviso chama o payment_check (a tag e o pedido do LINK) antes de aplicar; 'paga' só no 'baixar'; nenhuma cobrança nasce aqui (C1)", () => {
    const b = ler("_shared/infinitepay-baixa.ts");
    const conferir = b.slice(b.indexOf("export async function conferirAviso"), b.indexOf("export async function conferirAvisosPendentes"));
    expect(conferir).toContain("conferirPagamento(link.handle, link.pedido");
    expect(conferir.indexOf("conferirPagamento(")).toBeLessThan(conferir.indexOf("aplicar("));
    expect(b.match(/status: "paga"/g)?.length).toBe(1);
    expect(b).not.toMatch(/from\("cobrancas"\)\s*\.\s*(insert|upsert)/);
    const aplicar = b.slice(b.indexOf("async function aplicar("), b.indexOf("async function avisarPago("));
    expect(aplicar).toContain("conf: ConferenciaIp");
    expect(aplicar).not.toMatch(/ip_transaction_nsu: a\.transaction_nsu/); // o NSU gravado sai do nsuDaBaixa
  });
});
```
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/servidor.test.ts` → Expected: FAIL (`ENOENT … infinitepay-baixa.ts`).

- [ ] **Step 2: `financeiro-mp.ts`** — no `interface Cobranca`, depois de `deleted_at: string | null;`:
```ts
  /** W1 — a tentativa e a baixa da InfinitePay (ausentes no schema sem a migration 20261011200000) */
  ip_handle?: string | null;
  ip_link_url?: string | null;
  ip_expira_em?: string | null;
  ip_transaction_nsu?: string | null;
  ip_slug?: string | null;
  ip_recibo_url?: string | null;
  ip_valor_pago?: number | string | null;
  ip_parcelas?: number | null;
  ip_meio?: "pix" | "credit_card" | null;
  ip_conferido_em?: string | null;
```
e, depois de `COLUNAS_COBRANCA`:
```ts
/** W1: + as colunas da InfinitePay — só no schema que já tem a 20261011200000 (a pagamentos-aluno escolhe pelo schemaTemW1). */
export const COLUNAS_COBRANCA_IP = COLUNAS_COBRANCA + ", ip_handle, ip_link_url, ip_expira_em, ip_transaction_nsu, ip_slug, ip_recibo_url, " +
  "ip_valor_pago, ip_parcelas, ip_meio, ip_conferido_em";
```
(Só tipo e constante: o comportamento da `mp-webhook-aluno` e da `automaticas-fila`, que importam este arquivo, não muda.)

- [ ] **Step 3: Escrever o módulo**

```ts
// supabase-principal/functions/_shared/infinitepay-baixa.ts
// Physiq W1 — a baixa da InfinitePay no banco: o que a pagamentos-aluno e a infinitepay-webhook-aluno fazem igual.
//   · Os LINKS ({schema}.infinitepay_links): um order_nsu por link, `<cobranca_id>-<n>`, com a InfiniteTag e o preço daquele link. A
//     InfinitePay aceita order_nsu repetido (sondado em 11/10), então a unicidade é nossa (I4).
//   · A CAIXA DE AVISOS ({schema}.infinitepay_avisos): o que chegou pelo webhook, pela volta da página ou pela conferência só do pedido.
//   · Cada aviso é conferido no payment_check ANTES de qualquer baixa (o webhook não tem assinatura). A InfiniteTag e o preço vêm do LINK
//     (o personal pode ter trocado de tag depois), nunca do aviso.
// Idempotente: 1 aviso por (link, NSU, slug); o NSU é único por tag em cobrancas (cobrancas_ip_transaction_uq); a "paga" vira uma vez,
// só no "baixar" — C1: numa cobrança já paga, outro NSU só avisa o personal. Quem confere "pega" o aviso antes (tentado_em): 2
// conferências do mesmo aviso não andam juntas.
// Sem baixa (I1/I3 — depoisDaConferencia, _shared/infinitepay-regras.ts):
//   · o SERVIDOR (webhook, rodada) soma 1 e reagenda (5, 15, 30 min, 1 h), o "não pago" também. Na 24ª fecha: o "não pago" fecha calado;
//     o "sem resposta" vira "desistiu" e avisa o personal;
//   · a TELA (aluno_status, prof_aluno, aluno_ip_conferir, aluno_ip_volta) só confere o aviso que já está na hora e não gasta tentativa
//     (adia 30 s);
//   · o aviso fechado sem pagamento reabre quando a mesma confirmação chega de novo (I1).
// Rota pública (I6): só registra aviso novo de link com até 72 h + 7 dias e até 20 por cobrança. O personal recebe no máximo 1 aviso de
// "confira" por cobrança a cada 24 h.
// Log: só ids técnicos, o status HTTP e o resultado (nunca a InfiniteTag, o NSU, o slug ou a url — _shared/log.ts).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisar, carregarMatricula, linkDoAlunoNoPainel, recebedor } from "./financeiro-mp.ts";
import type { Schema } from "./financeiro-regras.ts";
import {
  IP_AVISOS_POR_COBRANCA, IP_CONFERIR_PEDIDO_MS, IP_MAX_TENTATIVAS, avisoNoPrazo, decidirBaixa, depoisDaConferencia, deveReabrir,
  metodoDoMeio, nsuDaBaixa, nsuDoPedido, pedidoDoLink, resultadoDaDecisao, textoCheckoutDesligado, textoJaPagoPorFora, textoNsuNovo,
  textoNsuRepetido, textoOutroPagamento, textoPagoAoAluno, textoPagoAoPersonal, textoSemConfirmacao, textoValorDiferente, urlDaInfinitePay,
  type AvisoIp, type ConferenciaIp, type Decisao, type MeioIp, type ModoConferencia,
} from "./infinitepay-regras.ts";
import { conferirPagamento, type ErroIp, type OpcoesIp } from "./infinitepay.ts";
import type { Log } from "./log.ts";
import type { Prazo } from "./tempo.ts";

export interface ContextoIp {
  schema: Schema;
  log: Log;
  prazo: Prazo;
  ip: OpcoesIp;
}
export type ResultadoAviso = Decisao | "nsu_repetido" | "em_andamento" | "adiado" | "desistiu" | "sem_tentativa";

const TABELA_AUSENTE = /relation .* does not exist|42P01|PGRST20[0-9]|could not find the table/i;
const W1_NO_SCHEMA = new Map<Schema, { tem: boolean; em: number }>();

/** A W1 chegou a este schema? A função é uma só para public e staging: o que é novo só liga com a migration (UMA só — I2), guardado
 *  por 60 s. */
export async function schemaTemW1(db: SupabaseClient, schema: Schema): Promise<boolean> {
  const g = W1_NO_SCHEMA.get(schema);
  if (g && Date.now() - g.em < 60_000) return g.tem;
  const { error } = await db.from("infinitepay_avisos").select("id").limit(1);
  if (error && !TABELA_AUSENTE.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw error;
  W1_NO_SCHEMA.set(schema, { tem: !error, em: Date.now() });
  return !error;
}

const COLUNAS_TENTATIVA = "id, paciente_id, conta_id, tipo, valor, status, forma, deleted_at, ip_handle, ip_transaction_nsu";
const COLUNAS_LINK = "pedido, cobranca_id, n, handle, centavos, criado_em";
const COLUNAS_AVISO = "id, cobranca_id, pedido, transaction_nsu, slug, recibo_url, meio, origem, recebido_em, tentativas";
/** Os resultados que mandaram um aviso de "confira" ao personal (o teto de 1 por cobrança a cada 24 h). */
const AVISA_O_PERSONAL = ["ja_pago_por_fora", "nsu_novo", "outro_pagamento", "valor_diferente", "nsu_repetido", "desistiu"];

interface Tentativa {
  id: string;
  paciente_id: string;
  conta_id: string | null;
  tipo: "mensalidade" | "avulsa";
  valor: number | string;
  status: string;
  forma: string | null;
  deleted_at: string | null;
  ip_handle: string | null;
  ip_transaction_nsu: string | null;
}

/** Um link da InfinitePay (I4): o pedido, a cobrança, a InfiniteTag e o preço DELE. */
export interface LinkDoPedido {
  pedido: string;
  cobranca_id: string;
  n: number;
  handle: string;
  centavos: number;
  criado_em: string;
}

interface Aviso {
  id: number;
  cobranca_id: string;
  pedido: string;
  transaction_nsu: string;
  slug: string;
  recibo_url: string | null;
  meio: string | null;
  origem: string;
  recebido_em: string;
  tentativas: number;
}

// ───────────────────────── os links (I4) ─────────────────────────

/** O link pelo pedido (o order_nsu que voltou da InfinitePay). */
export async function linkDoPedido(db: SupabaseClient, pedido: string): Promise<LinkDoPedido | null> {
  const { data, error } = await db.from("infinitepay_links").select(COLUNAS_LINK).eq("pedido", pedido).maybeSingle();
  if (error) throw error;
  return (data as LinkDoPedido | null) ?? null;
}

/** O link mais novo da cobrança (o que a tela abriu por último). */
export async function ultimoLink(db: SupabaseClient, cobrancaId: string): Promise<LinkDoPedido | null> {
  const { data, error } = await db.from("infinitepay_links").select(COLUNAS_LINK).eq("cobranca_id", cobrancaId)
    .order("n", { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as LinkDoPedido[])[0] ?? null;
}

/** Um pedido novo para a cobrança (n = o último + 1), com a InfiniteTag e o preço deste link. Se 2 toques chegarem ao mesmo tempo, o 2º
 *  dá 23505 e vira erro_interno (a tela tenta de novo e reaproveita o link do 1º). */
export async function novoLink(db: SupabaseClient, cobrancaId: string, handle: string, centavos: number): Promise<string> {
  const n = ((await ultimoLink(db, cobrancaId))?.n ?? 0) + 1;
  const pedido = pedidoDoLink(cobrancaId, n);
  const { error } = await db.from("infinitepay_links").insert({ pedido, cobranca_id: cobrancaId, n, handle, centavos });
  if (error) throw error;
  return pedido;
}

// ───────────────────────── a caixa ─────────────────────────

/** Põe o aviso na caixa e devolve o id dele, ou o motivo de ter ignorado:
 *  · o mesmo (link, NSU, slug) não duplica;
 *  · fechado SEM pagamento (nao_pago, desistiu), reabre — I1: o webhook verdadeiro depois de um "não pago";
 *  · aviso novo (ou reaberto) só de link com até 72 h + 7 dias e até 20 por cobrança — I6.
 *  O aviso ainda pendente volta sempre: a rodada reenvia os dela e não pode ficar presa no prazo. */
export async function registrarAviso(db: SupabaseClient, link: LinkDoPedido, a: AvisoIp, origem: "webhook" | "volta" | "pedido",
  agora: Date = new Date()): Promise<{ id: number } | { ignorado: "prazo" | "teto" }> {
  const slug = a.slug ?? "";
  const { data: ja, error: ej } = await db.from("infinitepay_avisos").select("id, conferido_em, resultado").eq("pedido", link.pedido)
    .eq("transaction_nsu", a.nsu).eq("slug", slug).maybeSingle();
  if (ej) throw ej;
  const existente = ja as { id: number; conferido_em: string | null; resultado: string | null } | null;
  if (existente && (!existente.conferido_em || !deveReabrir(existente.resultado))) return { id: existente.id };
  if (!avisoNoPrazo(link.criado_em, agora)) return { ignorado: "prazo" };
  if (existente) {
    const { error } = await db.from("infinitepay_avisos").update({ conferido_em: null, resultado: null, tentado_em: null, tentativas: 0,
      proxima_em: agora.toISOString() }).eq("id", existente.id).not("conferido_em", "is", null);
    if (error) throw error;
    return { id: existente.id };
  }
  const { count, error: ec } = await db.from("infinitepay_avisos").select("id", { count: "exact", head: true }).eq("cobranca_id", link.cobranca_id);
  if (ec) throw ec;
  if ((count ?? 0) >= IP_AVISOS_POR_COBRANCA) return { ignorado: "teto" };
  const linha = { cobranca_id: link.cobranca_id, pedido: link.pedido, transaction_nsu: a.nsu, slug, recibo_url: a.recibo, meio: a.meio, origem };
  const { data, error } = await db.from("infinitepay_avisos").upsert(linha, { onConflict: "pedido,transaction_nsu,slug", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  const nova = ((data ?? []) as Array<{ id: number }>)[0];
  if (nova) return { id: nova.id };
  // outra chamada gravou o mesmo aviso no meio do caminho: ele já está lá
  const { data: d2, error: e2 } = await db.from("infinitepay_avisos").select("id").eq("pedido", link.pedido).eq("transaction_nsu", a.nsu)
    .eq("slug", slug).single();
  if (e2) throw e2;
  return { id: (d2 as { id: number }).id };
}

/** Confere UM aviso na InfinitePay, com a InfiniteTag e o preço do LINK, e aplica o que ela disse. No modo "tela" (I3), só confere se já
 *  está na hora (proxima_em) e não gasta tentativa. */
export async function conferirAviso(db: SupabaseClient, avisoId: number, ctx: ContextoIp, modo: ModoConferencia = "servidor"):
  Promise<ResultadoAviso> {
  const agora = new Date();
  let q = db.from("infinitepay_avisos").update({ tentado_em: agora.toISOString() }).eq("id", avisoId).is("conferido_em", null)
    .or(`tentado_em.is.null,tentado_em.lt.${new Date(agora.getTime() - 20_000).toISOString()}`);
  if (modo === "tela") q = q.lte("proxima_em", agora.toISOString()).lt("tentativas", IP_MAX_TENTATIVAS);
  const { data: pegos, error: ep } = await q.select(COLUNAS_AVISO);
  if (ep) throw ep;
  const aviso = ((pegos ?? []) as Aviso[])[0];
  if (!aviso) return "em_andamento"; // já conferido, fora da hora (tela) ou outra conferência com ele na mão
  const link = await linkDoPedido(db, aviso.pedido);
  const { data: t, error: et } = await db.from("cobrancas").select(COLUNAS_TENTATIVA).eq("id", aviso.cobranca_id).maybeSingle();
  if (et) throw et;
  const c = t as Tentativa | null;
  if (!c || !link) {
    await fechar(db, aviso, "nao_pago");
    return "sem_tentativa";
  }
  const r = await conferirPagamento(link.handle, link.pedido, aviso.transaction_nsu, aviso.slug || null, { ...ctx.ip, prazo: ctx.prazo });
  // sem resposta que decida (rede, tempo, 5xx, 429 ou o checkout desligado — Task 3): tenta de novo depois, NUNCA fecha antes da hora
  if (!r.conferencia) return await semBaixa(db, aviso, c, ctx, modo, "sem_resposta", r.status, r.erro);
  const decisao = decidirBaixa({ status: c.status, forma: c.forma, centavos: link.centavos, nsu: c.ip_transaction_nsu }, r.conferencia,
    aviso.transaction_nsu);
  if (decisao === "nao_pago") return await semBaixa(db, aviso, c, ctx, modo, "nao_pago", r.status);
  return await aplicar(db, decisao, c, link, aviso, r.conferencia, ctx);
}

/** Os avisos pendentes de uma cobrança ou de um aluno, até `max`, os que estão na hora primeiro. Volta "nenhum" só quando não há aviso
 *  pendente. No modo "tela", o aviso fora da hora volta "em_andamento" e nenhum gasta tentativa (I3). */
export async function conferirAvisosPendentes(db: SupabaseClient, filtro: { cobrancaId?: string; pacienteId?: string }, ctx: ContextoIp,
  max: number, modo: ModoConferencia): Promise<ResultadoAviso | "nenhum"> {
  let q = db.from("infinitepay_avisos").select("id, cobrancas!inner(paciente_id)").is("conferido_em", null);
  if (filtro.cobrancaId) q = q.eq("cobranca_id", filtro.cobrancaId);
  if (filtro.pacienteId) q = q.eq("cobrancas.paciente_id", filtro.pacienteId);
  const { data, error } = await q.order("proxima_em").limit(max);
  if (error) throw error;
  let ultimo: ResultadoAviso | "nenhum" = "nenhum";
  for (const { id } of (data ?? []) as Array<{ id: number }>) ultimo = await conferirAviso(db, id, ctx, modo);
  return ultimo;
}

/** W1-B2: sem nenhum aviso (o webhook não chegou e a página fechou antes do "Continuar"), pergunta à InfinitePay SÓ pelo pedido do link
 *  mais novo, no máximo 1 vez a cada 30 s por tentativa. Se ela disser "pago", vira um aviso (com o NSU que vier, ou o do pedido) e segue
 *  a conferência de sempre, como a tela. */
export async function conferirPeloPedido(db: SupabaseClient, cobrancaId: string, ctx: ContextoIp):
  Promise<ResultadoAviso | "cedo" | "nao_pago_pedido" | "sem_resposta" | "ignorado"> {
  const agora = new Date();
  const limite = new Date(agora.getTime() - IP_CONFERIR_PEDIDO_MS).toISOString();
  const { data, error } = await db.from("cobrancas").update({ ip_conferido_em: agora.toISOString() })
    .eq("id", cobrancaId).eq("forma", "infinitepay").eq("status", "aguardando_confirmacao").not("ip_handle", "is", null)
    .or(`ip_conferido_em.is.null,ip_conferido_em.lt.${limite}`).select("id");
  if (error) throw error;
  if (!((data ?? []) as unknown[]).length) return "cedo";
  const link = await ultimoLink(db, cobrancaId);
  if (!link) return "sem_resposta";
  const r = await conferirPagamento(link.handle, link.pedido, null, null, { ...ctx.ip, prazo: ctx.prazo });
  if (!r.conferencia) return "sem_resposta";
  if (!r.conferencia.pago) return "nao_pago_pedido";
  const reg = await registrarAviso(db, link, {
    pedido: link.pedido, cobranca: cobrancaId, nsu: r.conferencia.nsu ?? nsuDoPedido(link.pedido), slug: null, recibo: null,
    meio: r.conferencia.meio,
  }, "pedido", agora);
  if ("ignorado" in reg) return "ignorado";
  return await conferirAviso(db, reg.id, ctx, "tela");
}

/** A tentativa vencida sem aviso pendente sai (SQL: {schema}.infinitepay_fechar_vencidas). */
export async function fecharVencidas(db: SupabaseClient, pacienteId: string | null): Promise<number> {
  const { data, error } = await db.rpc("infinitepay_fechar_vencidas", { p_paciente: pacienteId });
  if (error) throw error;
  return Number(data) || 0;
}

// ───────────────────────── aplicar a decisão ─────────────────────────

async function aplicar(db: SupabaseClient, d: Decisao, c: Tentativa, link: LinkDoPedido, a: Aviso, conf: ConferenciaIp, ctx: ContextoIp,
  releu = false): Promise<ResultadoAviso> {
  const valor = conf.centavos ?? link.centavos;
  if (d === "baixar") {
    const meio = conf.meio ?? (a.meio === "pix" || a.meio === "credit_card" ? (a.meio as MeioIp) : null);
    const { data, error } = await db.from("cobrancas").update({
      status: "paga", forma: "infinitepay", metodo: metodoDoMeio(meio), pago_em: a.recebido_em, ip_handle: link.handle,
      ip_transaction_nsu: nsuDaBaixa(conf, a.transaction_nsu), ip_slug: a.slug || null, ip_recibo_url: urlDaInfinitePay(a.recibo_url),
      ip_valor_pago: conf.centavosPagos ? conf.centavosPagos / 100 : null, ip_parcelas: conf.parcelas, ip_meio: meio,
      deleted_at: null, recusado_motivo: null, recusado_em: null,
    }).eq("id", c.id).neq("status", "paga").select("id");
    if (error && String(error.code) === "23505") {
      // o mesmo NSU já deu baixa em OUTRA cobrança desta InfiniteTag (o mesmo pagamento em 2 pedidos): sem baixa, com aviso (MENOR 3)
      ctx.log.aviso({ codigo: "ip_nsu_repetido", schema: ctx.schema, ref: c.id });
      await avisarUmaVez(db, c, (nome) => textoNsuRepetido(nome), ctx);
      await fechar(db, a, "nsu_repetido");
      return "nsu_repetido";
    }
    if (error) throw error;
    if (!data?.length) {
      // outra conferência ganhou (0 linhas): relê e decide de novo, 1 vez (MENOR 3) — o 2º NSU de verdade vira "outro pagamento"
      // (aviso) em vez de sumir calado
      if (releu) {
        await fechar(db, a, "ja_pago");
        return "ja_feito";
      }
      const { data: t2, error: e2 } = await db.from("cobrancas").select(COLUNAS_TENTATIVA).eq("id", c.id).single();
      if (e2) throw e2;
      const c2 = t2 as Tentativa;
      const d2 = decidirBaixa({ status: c2.status, forma: c2.forma, centavos: link.centavos, nsu: c2.ip_transaction_nsu }, conf, a.transaction_nsu);
      return await aplicar(db, d2, c2, link, a, conf, ctx, true);
    }
    await avisarPago(db, c, conf, valor, ctx);
  } else if (d === "nsu_novo" || d === "outro_pagamento") {
    // C1: nada credita e o NSU gravado não muda — só o aviso de "confira" ao personal
    ctx.log.aviso({ codigo: d === "nsu_novo" ? "ip_nsu_novo" : "ip_outro_pagamento", schema: ctx.schema, ref: c.id });
    await avisarUmaVez(db, c, (nome) => (d === "nsu_novo" ? textoNsuNovo(nome, valor) : textoOutroPagamento(nome, valor)), ctx);
  } else if (d === "ja_pago_por_fora") {
    await avisarUmaVez(db, c, (nome) => textoJaPagoPorFora(nome, valor), ctx);
  } else if (d === "valor_diferente") {
    ctx.log.aviso({ codigo: "ip_valor_diferente", schema: ctx.schema, ref: c.id });
    await avisarUmaVez(db, c, (nome) => textoValorDiferente(nome), ctx);
  }
  await fechar(db, a, resultadoDaDecisao(d));
  return d;
}

async function avisarPago(db: SupabaseClient, c: Tentativa, conf: ConferenciaIp, valor: number, ctx: ContextoIp): Promise<void> {
  const m = await carregarMatricula(db, c.paciente_id);
  await avisar(db, m?.user_id, "pagamento_confirmado", textoPagoAoAluno(valor), "/perfil/pagamentos", ctx.log, ctx.schema);
  if (m) {
    await avisar(db, recebedor(m), "pagamento_confirmado", textoPagoAoPersonal(m.nome, valor, conf.meio, conf.parcelas),
      linkDoAlunoNoPainel(m), ctx.log, ctx.schema);
  }
  // a trava do Nutri antigo acompanha (o mesmo da pagamentos-aluno)
  const { error } = await db.rpc("cobrancas_atualizar_bloqueio");
  if (error) ctx.log.excecao(error, { codigo: "atualizar_bloqueio_falhou", schema: ctx.schema });
}

/** O aviso de "confira" ao personal: no máximo 1 por cobrança a cada 24 h. Assim o POST forjado em série não vira enxurrada no sino (I6). */
async function avisarUmaVez(db: SupabaseClient, c: Tentativa, texto: (nome: string) => string, ctx: ContextoIp): Promise<void> {
  const { count, error } = await db.from("infinitepay_avisos").select("id", { count: "exact", head: true }).eq("cobranca_id", c.id)
    .in("resultado", AVISA_O_PERSONAL).gt("conferido_em", new Date(Date.now() - 86_400_000).toISOString());
  if (error) throw error;
  if ((count ?? 0) > 0) return;
  const m = await carregarMatricula(db, c.paciente_id);
  if (m) await avisar(db, recebedor(m), "geral", texto(m.nome), linkDoAlunoNoPainel(m), ctx.log, ctx.schema);
}

/** Sem baixa nesta conferência (I1/I3 — depoisDaConferencia): reagenda. Na 24ª conferência do servidor, fecha: "não pago" fecha calado;
 *  sem resposta avisa o personal. O checkout desligado tem o texto próprio. */
async function semBaixa(db: SupabaseClient, a: Aviso, c: Tentativa, ctx: ContextoIp, modo: ModoConferencia, motivo: "nao_pago" | "sem_resposta",
  status: number, erro?: ErroIp): Promise<ResultadoAviso> {
  const p = depoisDaConferencia(a.tentativas, motivo, modo);
  if (erro === "checkout_desligado") ctx.log.aviso({ codigo: "ip_checkout_desligado", schema: ctx.schema, ref: c.id, status });
  if (p.fechar) {
    await fechar(db, a, p.fechar, p.tentativas);
    if (p.fechar === "nao_pago") return "nao_pago";
    ctx.log.erro({ codigo: "ip_conferir_desistiu", schema: ctx.schema, ref: c.id, status, n: p.tentativas });
    await avisarUmaVez(db, c, (nome) => (erro === "checkout_desligado" ? textoCheckoutDesligado(nome) : textoSemConfirmacao(nome)), ctx);
    return "desistiu";
  }
  const { error } = await db.from("infinitepay_avisos").update({ tentativas: p.tentativas, proxima_em: p.proxima_em }).eq("id", a.id);
  if (error) throw error;
  if (modo === "servidor") {
    ctx.log.aviso({ codigo: motivo === "nao_pago" ? "ip_nao_pago_reagendado" : "ip_conferir_adiado", schema: ctx.schema, ref: c.id, status,
      n: p.tentativas });
  }
  return motivo === "nao_pago" ? "nao_pago" : "adiado";
}

async function fechar(db: SupabaseClient, a: Aviso, resultado: string, tentativas = a.tentativas + 1): Promise<void> {
  const { error } = await db.from("infinitepay_avisos").update({ conferido_em: new Date().toISOString(), resultado, tentativas }).eq("id", a.id);
  if (error) throw error;
}
```

- [ ] **Step 4: Rodar e commit**

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/servidor.test.ts && flock $P npm run tipos && flock $P node scripts/ci/checar-funcoes.mjs`
Expected: PASS (a guarda), `tsc` limpo, `checar-funcoes` sem achado novo (todo `{ data… }` com `error`; nenhuma gravação descartada).
(O `deno check` deste módulo vem com a função da Task 8, que o importa.)
```bash
git add supabase-principal/functions/_shared/infinitepay-baixa.ts supabase-principal/functions/_shared/financeiro-mp.ts src/financeiro/servidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): a baixa da InfinitePay — links, caixa de avisos, payment_check antes de tudo; outro NSU só avisa; não pago reagenda" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/_shared/infinitepay-baixa.ts supabase-principal/functions/_shared/financeiro-mp.ts src/financeiro/servidor.test.ts
```

---

### Task 8: Servidor — função nova `infinitepay-webhook-aluno`

**Files:**
- Create: `supabase-principal/functions/infinitepay-webhook-aluno/index.ts`
- Modify: `src/lib/logsDasFuncoesPrincipal.test.ts` (a função nova na lista — "25 funções")
- Test: `src/financeiro/servidor.test.ts` (guarda: o webhook não grava cobrança)

**Estimativa:** 25 a 35 min (pior cenário 55 min)

- [ ] **Step 1: As guardas que falham**

Em `src/financeiro/servidor.test.ts`, dentro do `describe("W1 — a baixa…")` da Task 7:
```ts
  it("o webhook só registra o aviso: não grava cobrança nem diz 'paga'; responde 200/429/413/400 (nunca 5xx)", () => {
    const w = ler("infinitepay-webhook-aluno/index.ts");
    expect(w).not.toMatch(/from\("cobrancas"\)\s*\.\s*(update|insert|upsert|delete)/);
    expect(w).not.toMatch(/"paga"/);
    expect(w).toContain("emSegundoPlano(");
    expect(w).not.toMatch(/responder\(5\d\d/);
  });
  it("I6: o IP pelo ipDoPedido (nunca o cabeçalho de encaminhamento cru), o corpo com teto e o pedido do LINK (I4)", () => {
    const w = ler("infinitepay-webhook-aluno/index.ts");
    expect(w).toContain("ipDoPedido(req.headers, null)");
    expect(w).not.toMatch(/x-forwarded-for/i);
    expect(w).toContain("IP_LIMITE_CORPO");
    expect(w).toContain("linkDoPedido(db, aviso.pedido)");
  });
```
Em `src/lib/logsDasFuncoesPrincipal.test.ts`: acrescentar `"infinitepay-webhook-aluno"` ao fim de `FUNCOES` (depois de `"automaticas-fila"`),
completar o comentário ("… — e a automaticas-fila (W-P, Task 8b) e a infinitepay-webhook-aluno (W1), que seguem o mesmo contrato") e trocar
o título `"o fecho dos imports pega as 24 funções …"` por `"o fecho dos imports pega as 25 funções …"`. (Se a hml-19a entrar antes com a
`nutricao`, ficam 26: resolver no rebase — 1 linha — e avisar a LINUX 1.)

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/servidor.test.ts src/lib/logsDasFuncoesPrincipal.test.ts`
Expected: FAIL (o `index.ts` não existe).

- [ ] **Step 2: Escrever a função**

```ts
// Physiq W1 — infinitepay-webhook-aluno (banco principal): o aviso da InfinitePay de que um link do Physiq foi pago (aluno → personal).
// Chega SEM JWT (verify_jwt = false) e SEM ASSINATURA (a doc não tem). Aqui ele só vira um AVISO na caixa ({schema}.infinitepay_avisos),
// pelo order_nsu de um LINK nosso (`<cobranca_id>-<n>` — {schema}.infinitepay_links, I4), e a resposta sai em < 1 s (a doc: "de
// preferência em menos de 1 segundo"). A conferência no payment_check roda em segundo plano (emSegundoPlano) e só ela dá baixa
// (_shared/infinitepay-baixa.ts). Ela usa a InfiniteTag e o preço GRAVADOS no link, o order_nsu, o transaction_nsu e o slug.
// Quem chama:
//   · a InfinitePay: o webhook_url de cada link, …/infinitepay-webhook-aluno?schema=<public|staging>. O schema também vale no caminho
//     (…/infinitepay-webhook-aluno/<schema>), como reserva se a InfinitePay tirar a busca da url (MENOR 13 da revisão);
//   · a rodada do pg_cron ({schema}.infinitepay_rodada(), a cada 15 min): reenvia os avisos que não deu para conferir (&origem=rodada).
//   Os 2 entram igual: nada do corpo é confiado.
// A rota é pública (I6 da revisão):
//   · limite por IP — o cf-connecting-ip, que a Cloudflare escreve (ipDoPedido: o cabeçalho de encaminhamento que o cliente escreve
//     não vale);
//   · corpo até 16 KB;
//   · aviso NOVO só de link com até 72 h + 7 dias e até 20 por cobrança (o resto: 200 e ignorado).
// Respostas:
//   · 200 { ok, resultado, ms } no que registrou ou ignorou (fora do formato, pedido que não é nosso, fora do prazo, no teto, schema
//     inválido);
//   · 429 no limite por IP; 413 no corpo grande;
//   · 400 no erro do banco e no schema certo ainda sem a W1 (o cache de 60 s logo depois da migration) — a InfinitePay manda de novo
//     (a doc: responder 400 faz reenviar).
//   Nunca 5xx.
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions infinitepay-webhook-aluno false
// Segredos: nenhum (só os automáticos SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY). INFINITEPAY_API: só no Deno local (o simulador).
// Log: _shared/log.ts — o id da cobrança e o resultado; nunca o corpo, a InfiniteTag, a url do recibo, o NSU ou o slug.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { ipDoPedido } from "../_shared/entrar-senha-regras.ts";
import { criarLog, emSegundoPlano } from "../_shared/log.ts";
import type { Schema } from "../_shared/financeiro-regras.ts";
import { IP_LIMITE_CORPO, lerAvisoDoWebhook } from "../_shared/infinitepay-regras.ts";
import { conferirAviso, linkDoPedido, registrarAviso, schemaTemW1 } from "../_shared/infinitepay-baixa.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IP_BASE = Deno.env.get("INFINITEPAY_API") ?? null;
const SCHEMAS: Schema[] = ["public", "staging"];
const log = criarLog("infinitepay-webhook-aluno", { avisar: avisarErro });

function responder(status: number, resultado: string, inicio: number): Response {
  return new Response(JSON.stringify({ ok: status < 300, resultado, ms: Math.round(performance.now() - inicio) }),
    { status, headers: { "Content-Type": "application/json" } });
}

const janela = new Map<string, number[]>();
function permitido(chave: string, max = 120, ms = 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  if (janela.size > 5000) janela.clear();
  return true;
}

const clientes = new Map<Schema, SupabaseClient>();
function dbDe(schema: Schema): SupabaseClient {
  let c = clientes.get(schema);
  if (!c) {
    c = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    clientes.set(schema, c);
  }
  return c;
}

/** O schema da busca (?schema=) ou, de reserva, o último pedaço do caminho (…/infinitepay-webhook-aluno/<schema>). */
function schemaDoPedido(url: URL): Schema | null {
  const bruto = (url.searchParams.get("schema") || url.pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
  return SCHEMAS.includes(bruto as Schema) ? (bruto as Schema) : null;
}

Deno.serve(async (req) => {
  const inicio = performance.now();
  if (req.method !== "POST") return responder(200, "ignorado_metodo", inicio);
  let schema: Schema | null = null;
  try {
    const url = new URL(req.url);
    schema = schemaDoPedido(url);
    if (!schema) {
      log.aviso({ codigo: "ip_webhook_sem_schema" });
      return responder(200, "schema_invalido", inicio);
    }
    const daRodada = url.searchParams.get("origem") === "rodada";
    // I6: a InfinitePay chama o supabase.co direto (sem o proxy): vale o cf-connecting-ip; sem IP conhecido, um balde só
    if (!permitido(ipDoPedido(req.headers, null) ?? "sem-ip")) return responder(429, "limite", inicio);
    if (Number(req.headers.get("content-length") || 0) > IP_LIMITE_CORPO) return responder(413, "corpo_grande", inicio);
    const bruto = await req.text();
    if (bruto.length > IP_LIMITE_CORPO) return responder(413, "corpo_grande", inicio);
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      corpo = null;
    }
    const aviso = lerAvisoDoWebhook(corpo);
    if (!aviso) return responder(200, "ignorado_formato", inicio);
    const db = dbDe(schema);
    // o schema certo ainda sem a W1 (o cache de 60 s logo depois da migration) → 400: a InfinitePay manda de novo (MENOR 4)
    if (!(await schemaTemW1(db, schema))) return responder(400, "schema_sem_w1", inicio);
    // I4: só o link nosso (a InfiniteTag e o preço DELE); o resto não gera conferência
    const link = await linkDoPedido(db, aviso.pedido);
    if (!link || link.cobranca_id !== aviso.cobranca) return responder(200, "ignorado_pedido", inicio);
    const reg = await registrarAviso(db, link, aviso, "webhook");
    if ("ignorado" in reg) {
      log.aviso({ codigo: reg.ignorado === "prazo" ? "aviso_ip_fora_do_prazo" : "aviso_ip_no_teto", schema, ref: link.cobranca_id });
      return responder(200, `ignorado_${reg.ignorado}`, inicio);
    }
    const s = schema;
    const ref = link.cobranca_id;
    emSegundoPlano(conferirAviso(db, reg.id, { schema: s, log, prazo: prazo(ORCAMENTO_MS.servidor), ip: { base: IP_BASE } }, "servidor")
      .then((resultado) => log.info({ codigo: "aviso_ip_conferido", schema: s, ref, resultado }))
      .catch((e) => log.excecao(e, { codigo: "aviso_ip_conferir_falhou", schema: s, ref })));
    log.info({ codigo: daRodada ? "aviso_ip_rodada" : "aviso_ip", schema, ref, resultado: "registrado" });
    return responder(200, "registrado", inicio);
  } catch (e) {
    log.excecao(e, { schema });
    return responder(400, "erro", inicio);
  }
});
```

- [ ] **Step 3: Rodar as guardas, o `deno check` e commit**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro/servidor.test.ts src/lib/logsDasFuncoesPrincipal.test.ts
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/infinitepay-webhook-aluno/index.ts
flock $P node scripts/ci/checar-funcoes.mjs
```
Expected: PASS (o catch final chama `log.excecao`; nenhum `console.`; o log nasce com `criarLog("infinitepay-webhook-aluno", { avisar:
avisarErro })`; nada de `JSON.stringify(` em chamada de log); `deno check` sem erro; `checar-funcoes` sem achado novo.
```bash
git add supabase-principal/functions/infinitepay-webhook-aluno/index.ts src/lib/logsDasFuncoesPrincipal.test.ts src/financeiro/servidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): função infinitepay-webhook-aluno — registra o aviso e responde em menos de 1 s; a conferência em segundo plano" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/infinitepay-webhook-aluno/index.ts src/lib/logsDasFuncoesPrincipal.test.ts src/financeiro/servidor.test.ts
```

---
### Task 9: Servidor — `pagamentos-aluno`: o Recebimento pela função (jeito 2) e as colunas da InfinitePay

**Files:**
- Modify: `supabase-principal/functions/pagamentos-aluno/index.ts`
- Test: `src/financeiro/servidor.test.ts` (guarda: grava como a pessoa); a prova é o `e2e/w1/api.py` (caso `recebimento`, Task 12)

**Estimativa:** 45 a 65 min (pior cenário 95 min)

- [ ] **Step 1: A guarda que falha** — no `describe("W1 — …")` de `src/financeiro/servidor.test.ts`:

```ts
  it("jeito 2: o Recebimento grava COMO A PESSOA (dbPessoa) — recebimento_chaves e contas nunca com o service_role", () => {
    const f = ler("pagamentos-aluno/index.ts");
    expect(f).toContain("createClient(SUPABASE_URL, ANON,");
    expect(f).not.toMatch(/\bdb\.from\("recebimento_chaves"\)\s*\.\s*(insert|update|upsert|delete)/);
    expect(f).not.toMatch(/\bdb\.from\("contas"\)\s*\.\s*(insert|update|upsert|delete)/);
    expect(f).toMatch(/dbPessoa\.from\("recebimento_chaves"\)\s*\.\s*insert/);
    expect(f).toMatch(/dbPessoa\.rpc\("recebimento_infinitepay_salvar"/);
    expect(f).toMatch(/dbPessoa\.rpc\("recebimento_chave_ligar"/);
  });
```
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/servidor.test.ts` → Expected: FAIL.

- [ ] **Step 2: Cabeçalho, imports e constantes**

No comentário do topo, na lista PROFISSIONAL, acrescentar:
```ts
//   prof_recebimento        { conta_id }                    W1 (jeito 2): Configurações › Recebimento numa chamada — a conta (modo,
//                                                            bloquear), as chaves Pix e a InfinitePay (disponível, InfiniteTag) — só o dono
//   prof_recebimento_salvar { conta_id, modo?, bloquear?, handle?, cancelar_automaticas? }   W1: grava COMO A PESSOA (o RLS e a
//                                                            contas_guard valem); InfiniteTag nova → um link de R$ 1,00 (a InfinitePay diz
//                                                            se ela existe); sair do MP com automática viva → 409 automaticas_ativas
//   prof_ip_testar          { conta_id, handle? }           W1: o "Testar" — link de R$ 1,00 sem webhook (não salva)
//   prof_chave_salvar       { conta_id, id?, tipo, chave, favorecido?, banco? }   W1: a chave Pix pela função (antes, direto do navegador)
//   prof_chave_ligar        { conta_id, id, ligar }         W1: 1 ligada por conta, numa transação (recebimento_chave_ligar)
//   prof_chave_excluir      { conta_id, id }
```
Na linha "Segredos:" acrescentar: `+ SUPABASE_ANON_KEY (automático: o cliente com a sessão de quem chama — W1); INFINITEPAY_API só no Deno local (o simulador).`

Nos imports: acrescentar `COLUNAS_COBRANCA_IP` ao import de `../_shared/financeiro-mp.ts`; `modalidadesPermitidasNoPlano` ao de
`../_shared/planos-regras.ts`; `cancelarAssinaturasDasMatriculas` ao de `../_shared/app-sem-profissional.ts`; `emSegundoPlano` ao de
`../_shared/log.ts` (I3 — Task 10); e:
```ts
import { COLUNAS_CHAVE, chaveDoPedido } from "../_shared/pix-chave-regras.ts";
import { lerPedidoDoRecebimento } from "../_shared/recebimento-regras.ts";
import { centavos, descricaoDoLink, expiraEm, lerVolta, normalizarHandle, podeReaproveitar, urlDeVolta, urlDoWebhook } from "../_shared/infinitepay-regras.ts";
import { criarLink, pedidoDeTeste } from "../_shared/infinitepay.ts";
import {
  conferirAviso, conferirAvisosPendentes, conferirPeloPedido, fecharVencidas, linkDoPedido, novoLink, registrarAviso, schemaTemW1,
  type ContextoIp,
} from "../_shared/infinitepay-baixa.ts";
```
Depois de `const SERVICE_ROLE = …`:
```ts
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
/** W1: só no Deno local (e2e/w1/servir_local.ts) — o simulador; publicado, a API de verdade (_shared/infinitepay.ts › baseDaApi). */
const IP_BASE = Deno.env.get("INFINITEPAY_API") ?? null;
```

- [ ] **Step 3: `vista` com a InfinitePay (fora do `Deno.serve`)** — no objeto devolvido por `vista(c, comQr)`, depois de `created_at: c.created_at,`:

```ts
    // W1: a tentativa e o recibo da InfinitePay (nulos no schema sem a migration); a InfiniteTag, o NSU e o slug ficam no servidor
    ip_link: c.status === "aguardando_confirmacao" && c.forma === "infinitepay" ? c.ip_link_url ?? null : null,
    ip_expira_em: c.ip_expira_em ?? null, ip_recibo_url: c.ip_recibo_url ?? null, ip_parcelas: c.ip_parcelas ?? null, ip_meio: c.ip_meio ?? null,
```

- [ ] **Step 4: O cliente como a pessoa e as colunas por schema (dentro do `Deno.serve`, depois de `const db = …`)**

```ts
  // W1 (jeito 2, combinado com a hml-19): o Recebimento grava COMO A PESSOA — o RLS de recebimento_chaves e de contas e a guarda
  // contas_guard valem de 2ª camada; o service_role segue no que já era dele (cobrança, aluno, MP) e na leitura da integração
  const dbPessoa = createClient(SUPABASE_URL, ANON, {
    db: { schema: schema as "public" }, global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const ctxIp = (): ContextoIp => ({ schema, log, prazo: prazoDoPedido, ip: { base: IP_BASE } });
```
(MENOR 5 da revisão, pendente: quando a hml-19a entrar na `main`, o `dbPessoa` passa a ser o cliente da `porta-pessoa.ts` — a chave anon
num lugar só. Fica anotado no PR.)
Depois de `buscarCobranca`, trocar o `select(COLUNAS_COBRANCA)` dele por `select(await colunasCobranca())` e acrescentar:
```ts
  /** W1: as colunas da cobrança + as da InfinitePay no schema que já tem a migration (o public antes dela lê as de sempre). */
  const colunasCobranca = async () => ((await schemaTemW1(db, schema)) ? COLUNAS_COBRANCA_IP : COLUNAS_COBRANCA);

  /** W1: a cobrança mesmo apagada — a tentativa vencida da InfinitePay sai do histórico, mas a baixa atrasada e a volta ainda a acham. */
  const cobrancaComApagada = async (id: unknown): Promise<Cobranca> => {
    if (!ehUuidFin(id)) falhar("cobranca_invalida");
    const { data, error } = await db.from("cobrancas").select(await colunasCobranca()).eq("id", id as string).maybeSingle();
    if (error) throw error;
    if (!data) falhar("cobranca_inexistente", 404);
    return data as unknown as Cobranca;
  };
```
(`colunasCobranca` vem ANTES de `buscarCobranca` no arquivo — a ordem das `const`.) Trocar também `select(COLUNAS_COBRANCA)` por
`select(await colunasCobranca())` em `cobrancasDe` e `select(COLUNAS_COBRANCA, { count: "exact" })` por
`select(await colunasCobranca(), { count: "exact" })` no `aluno_historico` e no `prof_aluno_cobrancas`. Os outros `COLUNAS_COBRANCA`
(os caminhos do MP e do Pix manual) ficam como estão.

- [ ] **Step 5: Os ajudantes do Recebimento (junto dos ajudantes da W-P)**

```ts
  // ───────────────────────── W1 — Configurações › Recebimento (jeito 2) ─────────────────────────

  /** A conta da tela de Recebimento: só o dono e o master (a aba é soDono — catalogoAbas.ts). Lida COMO A PESSOA. */
  const contaDoRecebimento = async (contaId: unknown) => {
    if (!ehUuidFin(contaId)) falhar("conta_invalida");
    const papel = await papelNaConta(String(contaId));
    if (!papel.master && !papel.dono) falhar("so_o_dono", 403);
    const { data, error } = await dbPessoa.from("contas").select("id, nome, origem, recebimento_modo, bloquear_app_inadimplente")
      .eq("id", String(contaId)).maybeSingle();
    if (error) throw error;
    if (!data) falhar("conta_invalida", 404);
    const c = data as { id: string; nome: string; origem: string; recebimento_modo: string; bloquear_app_inadimplente: boolean };
    return { id: c.id, nome: c.nome, origem: c.origem, modo: c.recebimento_modo, bloquear: c.bloquear_app_inadimplente };
  };
  type ContaDoRecebimento = Awaited<ReturnType<typeof contaDoRecebimento>>;

  /** A flag da InfinitePay (app_config 'infinitepay' {liberada}): o personal só vê a opção com ela ligada; o master sempre. */
  const infinitepayLiberada = async (): Promise<boolean> => {
    if (ehMaster) return true;
    const { data, error } = await db.from("app_config").select("valor").eq("chave", "infinitepay").maybeSingle();
    if (error) throw error;
    return (data as { valor: { liberada?: unknown } | null } | null)?.valor?.liberada === true;
  };

  /** A InfiniteTag da conta (null sem a W1 no schema ou sem integração). Service_role: a tabela não tem grant para o app. */
  const integracaoIp = async (contaId: string) => {
    if (!(await schemaTemW1(db, schema))) return null;
    const { data, error } = await db.from("recebimento_integracoes").select("infinitepay_handle, status, testado_em")
      .eq("conta_id", contaId).eq("provedor", "infinitepay").maybeSingle();
    if (error) throw error;
    return (data as { infinitepay_handle: string; status: string; testado_em: string | null } | null) ?? null;
  };

  /** O que a tela mostra, numa chamada: a conta, as chaves Pix (COMO A PESSOA) e a InfinitePay. */
  const recebimentoVista = async (c: ContaDoRecebimento) => {
    const { data: chaves, error } = await dbPessoa.from("recebimento_chaves").select(COLUNAS_CHAVE).eq("conta_id", c.id).order("criado_em");
    if (error) throw error;
    const ip = await integracaoIp(c.id);
    return {
      ok: true, master: ehMaster, pode_editar: ehMaster || c.origem !== "app",
      conta: { id: c.id, nome: c.nome, origem: c.origem, modo: c.modo, bloquear: c.bloquear },
      chaves: chaves ?? [],
      mp_liberado: ehMaster || c.modo === "mercadopago",
      infinitepay: {
        disponivel: (await schemaTemW1(db, schema)) && (await infinitepayLiberada()),
        handle: ip?.infinitepay_handle ?? null, status: ip?.status ?? null, testado_em: ip?.testado_em ?? null,
      },
    };
  };

  /** O id de quem chama em conta_membros (a chave nova guarda o membro que cadastrou, como a tela fazia; master de fora = null). */
  const meuMembroId = async (contaId: string): Promise<string | null> => {
    const { data, error } = await db.from("conta_membros").select("id").eq("conta_id", contaId).eq("user_id", user.id).eq("status", "ativo").maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  };

  /** As matrículas com cobrança automática viva na conta (sair do MP cancela — a regra cruzada do spec-review). Busca pelos PACIENTES da
   *  conta: a aluno_assinaturas antiga pode ter conta_id nulo (MENOR 6 da revisão). */
  const automaticasVivasDaConta = async (contaId: string): Promise<string[]> => {
    const linhas = await todasAsPaginas<{ paciente_id: string }>((de, ate) =>
      db.from("aluno_assinaturas").select("paciente_id, pacientes!inner(conta_id)").eq("pacientes.conta_id", contaId)
        .in("status", ["authorized", "pending", "paused"]).order("paciente_id").range(de, ate));
    return [...new Set(linhas.map((l) => l.paciente_id))];
  };

  const statusDoErroDaRpc = (codigo: string) =>
    ["so_o_dono", "conta_do_app", "infinitepay_em_teste"].includes(codigo) ? 403 : codigo === "em_uso" ? 409 : 400;

  /** Um link na InfinitePay ou o erro dela traduzido:
   *  · o checkout desligado vem antes de tudo. Sondado em 11/10: é a MESMA resposta da InfiniteTag que não existe (o 404
   *    external_checkout_not_enabled); a Task 3 devolve erro "checkout_desligado" + o link de ativar, e a tela mostra os 2;
   *  · 4xx = não aceitou (aviso no log); 5xx, 429, rede ou tempo = fora do ar (erro). */
  const linkOuFalha = async (pedido: Parameters<typeof criarLink>[0], ref: string): Promise<string> => {
    const r = await criarLink(pedido, { prazo: prazoDoPedido, base: IP_BASE });
    if (r.url) return r.url;
    if (r.erro === "checkout_desligado") {
      log.aviso({ codigo: "ip_checkout_desligado", schema, acao, ref, status: r.status });
      return falhar("infinitepay_checkout_desligado", 400, { ativar: r.ativar });
    }
    const fora = r.status >= 500 || r.status === 429;
    if (fora) log.erro({ codigo: "ip_link_falhou", schema, acao, ref, status: r.status });
    else log.aviso({ codigo: "ip_link_recusado", schema, acao, ref, status: r.status });
    return falhar(fora ? "infinitepay_indisponivel" : "infinitepay_recusou", fora ? 502 : 400);
  };

  /** `semAFila` também diz "a RPC não existe neste schema" (o public antes da migration). */
  const semARpc = semAFila;
```

- [ ] **Step 6: As 6 ações (antes de `if (acao === "prof_planos")`)**

```ts
    // ════════════════════════════ W1 — CONFIGURAÇÕES › RECEBIMENTO (jeito 2) ════════════════════════════
    if (acao === "prof_recebimento") {
      return json(await recebimentoVista(await contaDoRecebimento(body.conta_id)), 200, origin);
    }

    if (acao === "prof_recebimento_salvar") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (conta.origem === "app" && !ehMaster) falhar("conta_do_app", 403);
      const lido = lerPedidoDoRecebimento(body);
      if (!lido.ok) return falhar(lido.erro);
      const pedido = lido.pedido;
      let linkTeste: string | null = null;
      if (pedido.handle !== undefined) {
        if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
        if (pedido.handle) {
          if (!(await infinitepayLiberada())) falhar("infinitepay_em_teste", 403);
          // a InfiniteTag existe? um link de R$ 1,00 que ninguém precisa pagar, sem webhook — o mesmo do "Testar"
          linkTeste = await linkOuFalha(pedidoDeTeste(pedido.handle, urlDeVolta(schema, origin, "/painel/configuracoes/recebimento")), conta.id);
        }
        const { data, error } = await dbPessoa.rpc("recebimento_infinitepay_salvar", { p_conta: conta.id, p_handle: pedido.handle });
        if (error) throw error;
        const r = (data ?? {}) as { ok?: boolean; erro?: string };
        if (!r.ok) falhar(r.erro || "erro_interno", statusDoErroDaRpc(r.erro || ""));
      }
      let canceladas = 0;
      let falhasAutomaticas = 0;
      if (pedido.modo !== undefined && pedido.modo !== conta.modo) {
        if (pedido.modo === "mercadopago" && !ehMaster) falhar("mp_so_master", 403);
        if (pedido.modo === "infinitepay") {
          if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
          if (!(await infinitepayLiberada())) falhar("infinitepay_em_teste", 403);
          const ip = await integracaoIp(conta.id);
          if (!ip || ip.status !== "ativa") falhar("sem_infinitetag", 409);
        }
        if (conta.modo === "mercadopago") {
          // a regra cruzada (spec-review): sair do Mercado Pago com cobrança automática viva cancela — com o OK de quem troca
          const ids = await automaticasVivasDaConta(conta.id);
          if (ids.length && !pedido.cancelarAutomaticas) falhar("automaticas_ativas", 409, { alunos: ids.length });
          if (ids.length) {
            const r = await cancelarAssinaturasDasMatriculas(db, credencial, ids, "trocou_a_forma", log, { prazo: prazoDoPedido });
            canceladas = r.canceladas;
            falhasAutomaticas = r.falhas;
            if (r.falhas) {
              // MENOR 6: o MP respondeu e recusou cancelar alguma — a resposta conta, o dono é avisado e o suporte termina no MP
              log.erro({ codigo: "automaticas_nao_canceladas", schema, acao, ref: conta.id, n: r.falhas });
              await avisar(db, user.id, "geral", `${r.falhas} cobrança(s) automática(s) no cartão não desligaram no Mercado Pago. Fale com o suporte.`,
                "/painel/configuracoes/recebimento", log, schema);
            }
            const alunos = await emLotes(ids, 150, async (lote) => {
              const { data, error } = await db.from("pacientes").select("user_id").in("id", lote);
              if (error) throw error;
              return (data ?? []) as Array<{ user_id: string | null }>;
            });
            for (const a of alunos) {
              await avisar(db, a.user_id, "geral", "Seu profissional mudou a forma de receber: a cobrança automática no cartão foi desligada. Veja em Pagamentos.",
                "/perfil/pagamentos", log, schema);
            }
          }
        }
        const { data, error } = await dbPessoa.from("contas").update({ recebimento_modo: pedido.modo }).eq("id", conta.id).select("recebimento_modo");
        if (error) throw error;
        // a contas_guard desfaz em silêncio o que não pode (o APK antigo conta com isso): a resposta diz a verdade
        if (((data ?? []) as Array<{ recebimento_modo: string }>)[0]?.recebimento_modo !== pedido.modo) {
          falhar(pedido.modo === "infinitepay" ? "sem_infinitetag" : "sem_permissao", 409);
        }
      }
      if (pedido.bloquear !== undefined && pedido.bloquear !== conta.bloquear) {
        const { data, error } = await dbPessoa.from("contas").update({ bloquear_app_inadimplente: pedido.bloquear }).eq("id", conta.id)
          .select("bloquear_app_inadimplente");
        if (error) throw error;
        if (((data ?? []) as Array<{ bloquear_app_inadimplente: boolean }>)[0]?.bloquear_app_inadimplente !== pedido.bloquear) falhar("sem_permissao", 403);
      }
      return json({ ...(await recebimentoVista(await contaDoRecebimento(conta.id))), link_teste: linkTeste, automaticas_canceladas: canceladas,
        automaticas_falhas: falhasAutomaticas }, 200, origin);
    }

    if (acao === "prof_ip_testar") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
      if (!(await infinitepayLiberada())) falhar("infinitepay_em_teste", 403);
      if (!permitido(`ip-teste:${user.id}`, 10, 3_600_000)) falhar("rate_limited", 429);
      const salva = body.handle === undefined ? (await integracaoIp(conta.id))?.infinitepay_handle ?? null : null;
      const handle = body.handle === undefined ? salva : normalizarHandle(body.handle);
      if (!handle) falhar(body.handle === undefined ? "sem_infinitetag" : "infinitetag_invalida", body.handle === undefined ? 409 : 400);
      const url = await linkOuFalha(pedidoDeTeste(handle!, urlDeVolta(schema, origin, "/painel/configuracoes/recebimento")), conta.id);
      return json({ ok: true, url }, 200, origin);
    }

    if (acao === "prof_chave_salvar") {
      const conta = await contaDoRecebimento(body.conta_id);
      const v = chaveDoPedido(body);
      if (!v.ok) return falhar("chave_invalida", 400, { mensagem: v.mensagem });
      if (body.id !== undefined) {
        if (!ehUuidFin(body.id)) falhar("chave_inexistente", 404);
        const { data, error } = await dbPessoa.from("recebimento_chaves").update(v.dados).eq("id", String(body.id)).eq("conta_id", conta.id)
          .select(COLUNAS_CHAVE).maybeSingle();
        if (error) throw error;
        if (!data) falhar("chave_inexistente", 404);
        return json({ ok: true, chave: data }, 200, origin);
      }
      const { count, error: ec } = await dbPessoa.from("recebimento_chaves").select("id", { count: "exact", head: true })
        .eq("conta_id", conta.id).eq("ativa", true);
      if (ec) throw ec;
      // sem nenhuma ligada, a nova já nasce ligada (como a tela fazia)
      const { data, error } = await dbPessoa.from("recebimento_chaves")
        .insert({ conta_id: conta.id, membro_id: await meuMembroId(conta.id), ...v.dados, ativa: (count ?? 0) === 0 })
        .select(COLUNAS_CHAVE).single();
      if (error) throw error;
      return json({ ok: true, chave: data }, 200, origin);
    }

    if (acao === "prof_chave_ligar") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (!ehUuidFin(body.id)) falhar("chave_inexistente", 404);
      const id = String(body.id);
      const ligar = body.ligar === true;
      const { data, error } = await dbPessoa.rpc("recebimento_chave_ligar", { p_conta: conta.id, p_chave: id, p_ligar: ligar });
      if (error && !semARpc(error)) throw error;
      if (error) {
        // o schema sem a W1 (o public antes da migration): os 2 passos de antes (a tela fazia assim), como a pessoa
        if (ligar) {
          const { error: e1 } = await dbPessoa.from("recebimento_chaves").update({ ativa: false }).eq("conta_id", conta.id).eq("ativa", true).neq("id", id);
          if (e1) throw e1;
        }
        const { data: d2, error: e2 } = await dbPessoa.from("recebimento_chaves").update({ ativa: ligar }).eq("id", id).eq("conta_id", conta.id).select("id");
        if (e2) throw e2;
        if (!d2?.length) falhar("chave_inexistente", 404);
        return json({ ok: true }, 200, origin);
      }
      const r = (data ?? {}) as { ok?: boolean; erro?: string };
      if (!r.ok) falhar(r.erro || "chave_inexistente", 404);
      return json({ ok: true }, 200, origin);
    }

    if (acao === "prof_chave_excluir") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (!ehUuidFin(body.id)) falhar("chave_inexistente", 404);
      const { data, error } = await dbPessoa.from("recebimento_chaves").delete().eq("id", String(body.id)).eq("conta_id", conta.id).select("id");
      if (error) throw error;
      if (!data?.length) falhar("chave_inexistente", 404);
      return json({ ok: true }, 200, origin);
    }
```

- [ ] **Step 7: Rodar e commit**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro src/lib/logsDasFuncoesPrincipal.test.ts && flock $P npm run tipos
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/pagamentos-aluno/index.ts
flock $P node scripts/ci/checar-funcoes.mjs
```
Expected: PASS; `deno check` sem erro novo; `checar-funcoes` sem achado novo (os itens da base desta função continuam iguais — nenhuma
das linhas deles mudou).
```bash
git add supabase-principal/functions/pagamentos-aluno/index.ts src/financeiro/servidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): Configurações › Recebimento pela função (jeito 2) — chaves Pix, forma, bloqueio e a InfiniteTag como a pessoa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/pagamentos-aluno/index.ts src/financeiro/servidor.test.ts
```

---

### Task 10: Servidor — `pagamentos-aluno`: o aluno paga pela InfinitePay

**Files:**
- Modify: `supabase-principal/functions/pagamentos-aluno/index.ts`
- Test: `src/financeiro/servidor.test.ts` (guardas); a prova é o `e2e/w1/api.py` (casos `link`, `forjado`, `vencida`, `avulsa`, `periodo` e os
  `--local` — entre eles `registrado`, o I5 —, Task 12)

**Estimativa:** 45 a 65 min (pior cenário 95 min)

- [ ] **Step 1: As guardas que falham**

```ts
  it("o aluno_ip_link cria um pedido por link (I4) e desfaz a tentativa quando a InfinitePay não cria o link; a conferência usa a caixa", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const link = f.slice(f.indexOf('acao === "aluno_ip_link"'), f.indexOf('acao === "aluno_ip_volta"'));
    expect(link).toContain("novoLink(db, linha.id, handle");
    expect(link).toContain("desfazerTentativa(linha, pedido)");
    const ip = f.slice(f.indexOf("W1 — O ALUNO PAGA PELA INFINITEPAY"), f.indexOf("════ PROFISSIONAL ════"));
    expect(ip).not.toMatch(/status: "paga"/);
    expect(ip).toContain('conferirAviso(db, reg.id, ctxIp(), "tela")');
  });
  it("I3: o aluno_status e o prof_aluno conferem em 2º plano, como a tela (sem gastar tentativa); I2: só na conta InfinitePay", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const cuidar = f.slice(f.indexOf("const cuidarDaInfinitePay"), f.indexOf("const ehTentativaIp"));
    expect(cuidar).toContain('emSegundoPlano(conferirAvisosPendentes(db, { pacienteId: m.id }, ctx, 2, "tela")');
    const status = f.slice(f.indexOf('acao === "aluno_status"'), f.indexOf("matriculas.push("));
    expect(status).toMatch(/recebimento_modo === "infinitepay" \|\| cobs0\.some\(ehTentativaIp\)\) await cuidarDaInfinitePay/);
  });
  it("I5: o prof_registrar da mensalidade usa a tentativa da InfinitePay aguardando (a mesma linha), em vez de criar outra", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const reg = f.slice(f.indexOf('acao === "prof_registrar"'), f.indexOf('acao === "prof_remover"'));
    expect(reg).toMatch(/\.eq\("forma", "infinitepay"\)[\s\S]*\.update\(linhaManual\)/);
  });
  it("P-B: o prof_plano_salvar valida com modalidadesPermitidasNoPlano (o plano antigo não trava o personal)", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const salvar = f.slice(f.indexOf('acao === "prof_plano_salvar"'), f.indexOf('acao === "prof_plano_ativo"'));
    expect(salvar).toContain("modalidadesPermitidasNoPlano(conta.modo");
  });
```
Run → Expected: FAIL.

- [ ] **Step 2: Cabeçalho** — na lista ALUNO do comentário do topo:
```ts
//   aluno_ip_link     { paciente_id, cobranca_id? }         W1: o link da InfinitePay da mensalidade (ou da avulsa): reaproveita o da
//                                                            tentativa viva (72 h, o mesmo valor e a mesma InfiniteTag); order_nsu = um
//                                                            pedido por LINK, <cobranca_id>-<n> (infinitepay_links — I4); a InfinitePay
//                                                            recusou ou caiu → a tentativa é desfeita (checkout desligado: 400 + ativar)
//   aluno_ip_volta    { order_nsu, transaction_nsu, slug, receipt_url?, capture_method? }   W1: a volta da página — vira um aviso da
//                                                            caixa e é conferido NA HORA, como a tela (I3: sem gastar tentativa)
//   aluno_ip_conferir { cobranca_id }                        W1: confere o aviso pendente que já está na hora (sem gastar tentativa — I3);
//                                                            sem NENHUM aviso, pergunta só pelo pedido (W1-B2, 1 vez a cada 30 s)
```

- [ ] **Step 3: Os ajudantes do aluno (junto dos do Mercado Pago)**

```ts
  // ───────────────────────── W1 — InfinitePay (aluno) ─────────────────────────

  /** A conta do aluno recebe pela InfinitePay e tem a InfiniteTag ativa → a InfiniteTag de agora. (A flag é da tela do personal: o aluno
   *  de uma conta já ligada paga sempre.) */
  const exigirInfinitePay = async (m: Matricula): Promise<string> => {
    if (m.conta?.recebimento_modo !== "infinitepay") falhar("modo_nao_infinitepay");
    if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
    const i = await integracaoIp(m.conta_id!);
    if (!i?.infinitepay_handle || i.status !== "ativa") falhar("infinitepay_nao_ligada", 409);
    return i!.infinitepay_handle;
  };

  type Alvo = Awaited<ReturnType<typeof alvoDoPagamento>>;

  /** A tentativa viva do alvo: a da avulsa é a própria avulsa; a da mensalidade, a mais nova aguardando na InfinitePay. */
  const tentativaVivaDe = async (m: Matricula, alvo: Alvo): Promise<Cobranca | null> => {
    let q = db.from("cobrancas").select(await colunasCobranca()).eq("paciente_id", m.id).eq("forma", "infinitepay")
      .eq("status", "aguardando_confirmacao").is("deleted_at", null);
    q = alvo.avulsa ? q.eq("id", alvo.avulsa.id) : q.eq("tipo", "mensalidade");
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    return ((data ?? []) as unknown as Cobranca[])[0] ?? null;
  };

  /** A linha da tentativa: a avulsa vira a tentativa; a mensalidade nasce com o retrato da W-P (descrição, meses cobertos, "de N"). */
  const linhaParaIp = async (m: Matricula, alvo: Alvo, handle: string): Promise<Cobranca> => {
    const ip = { forma: "infinitepay", ip_handle: handle, ip_link_url: null, ip_expira_em: expiraEm(), ip_conferido_em: null };
    if (alvo.avulsa) {
      const { data, error } = await db.from("cobrancas").update({ status: "aguardando_confirmacao", metodo: null, recusado_motivo: null,
        recusado_em: null, ...ip }).eq("id", alvo.avulsa.id).in("status", ["aberta", "aguardando_confirmacao"]).select(await colunasCobranca()).single();
      if (error) throw error;
      return data as unknown as Cobranca;
    }
    const dono = recebedor(m);
    if (!dono) falhar("sem_profissional");
    const { data, error } = await db.from("cobrancas").insert({
      paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: null, tipo: "mensalidade",
      ...(await linhaDoPlano(m, alvo.mesRef)), valor: alvo.valor, vencimento: alvo.vencimento, mes_ref: alvo.mesRef,
      status: "aguardando_confirmacao", plano_aluno_id: m.plano_aluno_id, origem: "app", ...ip,
    }).select(await colunasCobranca()).single();
    if (error) throw error;
    return data as unknown as Cobranca;
  };

  /** A InfinitePay não criou o link: o pedido dele sai, e a tentativa sai (mensalidade) ou a avulsa volta a aberta, sem rastro. */
  const desfazerTentativa = async (c: Cobranca, pedido: string | null) => {
    if (pedido) {
      const { error: el } = await db.from("infinitepay_links").delete().eq("pedido", pedido);
      if (el) throw el;
    }
    const { error } = c.tipo === "avulsa"
      ? await db.from("cobrancas").update({ status: "aberta", forma: null, metodo: null, ip_handle: null, ip_link_url: null, ip_expira_em: null }).eq("id", c.id)
      : await db.from("cobrancas").delete().eq("id", c.id);
    if (error) throw error;
  };

  /** A tentativa de mensalidade que não serve mais (o valor ou a InfiniteTag mudou): sai do histórico. Paga depois, a baixa atrasada vale. */
  const encerrarTentativa = async (c: Cobranca) => {
    const { error } = await db.from("cobrancas").update({ status: "cancelada", deleted_at: new Date().toISOString() }).eq("id", c.id);
    if (error) throw error;
  };

  /** aluno_status e prof_aluno — só na conta InfinitePay ou com tentativa dela aberta (I2). A tentativa vencida sai, e os avisos que já
   *  estão na hora são conferidos EM 2º PLANO (I3): a resposta não espera, é como a tela (sem gastar tentativa) e o prazo é próprio,
   *  porque roda depois da resposta. */
  const cuidarDaInfinitePay = async (m: Matricula) => {
    if (!(await schemaTemW1(db, schema))) return;
    await fecharVencidas(db, m.id);
    const ctx: ContextoIp = { schema, log, prazo: prazo(ORCAMENTO_MS.servidor), ip: { base: IP_BASE } };
    emSegundoPlano(conferirAvisosPendentes(db, { pacienteId: m.id }, ctx, 2, "tela")
      .catch((e) => log.excecao(e, { codigo: "ip_conferir_2o_plano", schema, acao })));
  };
  const ehTentativaIp = (c: Cobranca) => c.forma === "infinitepay" && c.status === "aguardando_confirmacao";
```

- [ ] **Step 4: As 3 ações do aluno (depois do bloco `detalhe_mp`, logo ANTES da linha `// ════ PROFISSIONAL ════` — a guarda do Step 1
  corta o arquivo entre o título do bloco e essa linha; o `simular_aprovacao`, que grava "paga" no MP do staging, fica fora do corte)**

```ts
    // ════════════════════════════ W1 — O ALUNO PAGA PELA INFINITEPAY ════════════════════════════
    if (acao === "aluno_ip_link") {
      const m = await minhaMatricula(body.paciente_id);
      const handle = await exigirInfinitePay(m);
      if (!permitido(`ip-link:${user.id}`, 10, 600_000)) falhar("rate_limited", 429);
      await fecharVencidas(db, m.id);
      const alvo = await alvoDoPagamento(m, body.cobranca_id);
      // a avulsa com comprovante de Pix esperando o personal não vira tentativa da InfinitePay
      if (alvo.avulsa && alvo.avulsa.status === "aguardando_confirmacao" && alvo.avulsa.forma !== "infinitepay") falhar("cobranca_nao_aberta");
      const valor = centavos(alvo.valor);
      if (!valor) falhar("sem_mensalidade");
      const viva = await tentativaVivaDe(m, alvo);
      if (viva && podeReaproveitar(viva, { centavos: valor!, handle }, new Date())) {
        return json({ ok: true, url: viva.ip_link_url, cobranca: vista(viva), reutilizado: true }, 200, origin);
      }
      if (viva && !alvo.avulsa) await encerrarTentativa(viva);
      const linha = await linhaParaIp(m, alvo, handle);
      // I4: um order_nsu por link (<cobranca_id>-<n>), com a InfiniteTag e o preço DESTE link — a confirmação confere com os 2
      let pedido: string | null = null;
      let url: string;
      try {
        pedido = await novoLink(db, linha.id, handle, valor!);
        url = await linkOuFalha({
          handle, centavos: valor!, descricao: descricaoDoLink(linha.descricao), pedido,
          volta: urlDeVolta(schema, origin), webhook: urlDoWebhook(SUPABASE_URL, schema),
        }, linha.id);
      } catch (e) {
        await desfazerTentativa(linha, pedido);
        throw e;
      }
      const { error: el } = await db.from("infinitepay_links").update({ url }).eq("pedido", pedido!);
      if (el) throw el;
      const { data: salva, error } = await db.from("cobrancas").update({ ip_link_url: url }).eq("id", linha.id).select(await colunasCobranca()).single();
      if (error) throw error;
      return json({ ok: true, url, cobranca: vista(salva as unknown as Cobranca), reutilizado: false }, 200, origin);
    }

    if (acao === "aluno_ip_volta") {
      const aviso = lerVolta(body);
      if (!aviso) falhar("volta_invalida");
      const c = await cobrancaComApagada(aviso!.cobranca);
      await minhaMatricula(c.paciente_id); // só a própria
      const link = await linkDoPedido(db, aviso!.pedido);
      if (!link || link.cobranca_id !== c.id) falhar("cobranca_invalida");
      const reg = await registrarAviso(db, link!, aviso!, "volta");
      // a volta é da tela (I3): confere o aviso que está na hora, sem gastar tentativa; fora do prazo ou no teto (I6), só relê
      const resultado = "ignorado" in reg ? `ignorado_${reg.ignorado}` : await conferirAviso(db, reg.id, ctxIp(), "tela");
      const atual = await cobrancaComApagada(c.id);
      return json({ ok: true, resultado, paga: atual.status === "paga", cobranca: vista(atual) }, 200, origin);
    }

    if (acao === "aluno_ip_conferir") {
      const c = await cobrancaComApagada(body.cobranca_id);
      await minhaMatricula(c.paciente_id);
      if (!c.ip_handle) falhar("cobranca_invalida");
      // I3: da tela — o aviso pendente que já está na hora, 1 por vez, sem gastar tentativa; sem NENHUM aviso, só pelo pedido (W1-B2)
      let resultado: string = await conferirAvisosPendentes(db, { cobrancaId: c.id }, ctxIp(), 1, "tela");
      if (resultado === "nenhum" && c.status === "aguardando_confirmacao") resultado = await conferirPeloPedido(db, c.id, ctxIp());
      const atual = await cobrancaComApagada(c.id);
      return json({ ok: true, resultado, paga: atual.status === "paga", cobranca: vista(atual) }, 200, origin);
    }
```

- [ ] **Step 5: Os ganchos e a P-B no `prof_plano_salvar`**

1. `aluno_status`, no laço das matrículas, logo depois do `for (… cobs0 …) await conferir(c, m);` do MP (antes da `assinatura`):
   `if (m.conta?.recebimento_modo === "infinitepay" || cobs0.some(ehTentativaIp)) await cuidarDaInfinitePay(m);`
   - I2: só na conta InfinitePay, ou com a tentativa dela aberta;
   - o `cobs` relido logo abaixo já vê a tentativa vencida fechada;
   - a conferência é em 2º plano (I3): o `aluno_status` não espera por ela.
2. `prof_aluno`, logo depois do bloco do MP (`if (veMensalidade && m.conta?.recebimento_modo === "mercadopago") { … }`):
   `if (veMensalidade && (m.conta?.recebimento_modo === "infinitepay" || cobs.some(ehTentativaIp))) await cuidarDaInfinitePay(m);`
3. `prof_plano_salvar`: trocar
   `const v = validarPlano(body, modalidadesDaConta(conta.modo));` por
```ts
      // W1 (P-B): o plano que já tem uma modalidade fica com ela, mesmo que a forma de receber de agora não a ofereça (quem passou do MP
      // para a InfinitePay não fica travado num plano com aluno em "cartão parcelado"); plano novo só com o que a conta recebe
      let atuais: unknown[] = [];
      if (ehUuidFin(body.id)) {
        const { data: pl, error: epl } = await db.from("planos_aluno").select("modalidades").eq("id", String(body.id)).eq("conta_id", conta.id).maybeSingle();
        if (epl) throw epl;
        atuais = (pl as { modalidades: string[] } | null)?.modalidades ?? [];
      }
      const v = validarPlano(body, modalidadesPermitidasNoPlano(conta.modo, atuais));
```
4. `prof_registrar` (I5 da revisão), no ramo da mensalidade (o `else` sem `cobranca_id`): trocar o `insert` da mensalidade (do
   `const { data, error } = await db.from("cobrancas").insert({` até o `c = data as unknown as Cobranca;`) por:
```ts
        // W1 (I5): a tentativa da InfinitePay ainda aguardando vira ESTA linha (paga "por fora"). Se a confirmação dela chegar depois, é
        // "já registrado à mão" (aviso ao personal — decidirBaixa), nunca um 2º período. O ip_handle e o link ficam (a conferência acha).
        const linhaManual = {
          ...(await linhaDoPlano(m, mes)), valor, vencimento: dia, mes_ref: mes, status: "paga", forma: "manual", metodo, pago_em: pagoEm,
          confirmado_por: user.id, confirmado_em: new Date().toISOString(), plano_aluno_id: m.plano_aluno_id,
        };
        const { data: ips, error: eip } = await db.from("cobrancas").select("id").eq("paciente_id", m.id).eq("tipo", "mensalidade")
          .eq("forma", "infinitepay").eq("status", "aguardando_confirmacao").is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(1);
        if (eip) throw eip;
        const ip = ((ips ?? []) as Array<{ id: string }>)[0];
        const { data, error } = ip
          ? await db.from("cobrancas").update(linhaManual).eq("id", ip.id).eq("status", "aguardando_confirmacao").select(COLUNAS_COBRANCA).single()
          : await db.from("cobrancas").insert({ paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: user.id,
              tipo: "mensalidade", ...linhaManual, origem: "app" }).select(COLUNAS_COBRANCA).single();
        if (error) throw error;
        c = data as unknown as Cobranca;
```
   No schema sem a migration, a busca por `forma = 'infinitepay'` volta vazia e segue o `insert` de sempre.

- [ ] **Step 6: Rodar e commit**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro && flock $P npm run tipos
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/pagamentos-aluno/index.ts
flock $P node scripts/ci/checar-funcoes.mjs
```
Expected: PASS; `deno check` e `checar-funcoes` sem nada novo.
```bash
git add supabase-principal/functions/pagamentos-aluno/index.ts src/financeiro/servidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): o aluno paga pela InfinitePay — um pedido por link, volta da página, conferência em 2º plano, registro à mão na mesma linha e a P-B no salvar do plano" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase-principal/functions/pagamentos-aluno/index.ts src/financeiro/servidor.test.ts
```

---

### Task 11: Simulador local da InfinitePay + as funções no Deno local + o E2E de servidor

**Files:**
- Create: `e2e/w1/simulador_ip.py`, `e2e/w1/servir_local.ts`, `e2e/w1/api.py`

**Estimativa:** 55 a 80 min (pior cenário 120 min)

> Por quê: não existe sandbox da InfinitePay e o pagamento de verdade (R$ 1) é do Weslley, no FIM. O caminho da **baixa** é provado com o
> código de verdade das 2 funções rodando no **Deno local**, contra o banco do **staging**, com o **simulador** no lugar da API (o
> `INFINITEPAY_API`, que só vale para `http://127.0.0.1`). Tudo o que não cobra (criar link, conferir pedido pendente/inventado, o webhook
> forjado) roda contra a **API de verdade**, pelas funções **publicadas** no staging.

- [ ] **Step 1: O simulador**

```python
#!/usr/bin/env python3
"""Physiq W1 — SIMULADOR LOCAL da API da InfinitePay (só para o e2e/w1/api.py --local). Escuta só em 127.0.0.1.
  POST /links          → {"url": "https://checkout.infinitepay.io/<handle>?lenc=sim-<order_nsu>"} — o formato sondado em 11/10 — ou o
                         status/corpo do cenário (ex.: o 404 external_checkout_not_enabled)
  POST /payment_check  → a resposta do cenário: {success, paid, amount, paid_amount, installments, capture_method[, transaction_nsu]};
                         com "amarra_nsu", o transaction_nsu fora de "nsus" responde 200 {"success": false} (como o pedido que não existe —
                         sondado em 11/10); sem ele, qualquer NSU passa (o PIOR caso do C1: a InfinitePay não amarra o NSU ao pedido)
  POST /_cenario       → troca o cenário INTEIRO (o que não vier volta ao padrão) e zera a lista de pedidos
  GET  /_pedidos       → o que chegou (caminho + corpo)
Nada aqui é a InfinitePay de verdade: o que ela devolve num pagamento é conferido nos R$ 1 da Task 22 do plano da W1.
Uso: python3 e2e/w1/simulador_ip.py --porta 8799
"""
from __future__ import annotations

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PADRAO: dict = {"links_status": 200, "links_corpo": None, "check_status": 200, "check_corpo": None, "pago": True, "amount": None,
                "paid_amount": None, "installments": 1, "capture_method": "pix", "nsu": None, "nsus": [], "amarra_nsu": False}
CENARIO: dict = dict(PADRAO)
PEDIDOS: list[dict] = []
TRAVA = threading.Lock()


class Tratar(BaseHTTPRequestHandler):
    def _json(self, status: int, corpo) -> None:
        dados = json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def log_message(self, *_a) -> None:  # silêncio: nada de corpo no terminal
        pass

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/_pedidos":
            with TRAVA:
                return self._json(200, PEDIDOS)
        return self._json(404, {})

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length") or 0)
        try:
            corpo = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._json(400, {"message": "json"})
        with TRAVA:
            if self.path == "/_cenario":
                CENARIO.clear()
                CENARIO.update({**PADRAO, **corpo})
                PEDIDOS.clear()
                return self._json(200, CENARIO)
            PEDIDOS.append({"caminho": self.path, "corpo": corpo})
            c = dict(CENARIO)
        if self.path == "/links":
            if c["links_corpo"] is not None or c["links_status"] >= 300:
                return self._json(c["links_status"], c["links_corpo"] if c["links_corpo"] is not None else {"message": "simulado"})
            return self._json(200, {"url": f"https://checkout.infinitepay.io/{corpo.get('handle')}?lenc=sim-{corpo.get('order_nsu')}"})
        if self.path == "/payment_check":
            if c["check_corpo"] is not None:
                return self._json(c["check_status"], c["check_corpo"])
            if c["check_status"] >= 300:
                return self._json(c["check_status"], {"message": "simulado"})
            nsu = corpo.get("transaction_nsu")
            if c["amarra_nsu"] and nsu is not None and nsu not in (c["nsus"] or []):
                return self._json(200, {"success": False})
            preco = c["amount"] if c["amount"] is not None else 0
            r = {"success": True, "paid": bool(c["pago"]), "amount": preco, "paid_amount": c["paid_amount"] or preco,
                 "installments": c["installments"], "capture_method": c["capture_method"]}
            if c.get("nsu"):
                r["transaction_nsu"] = c["nsu"]
            return self._json(200, r)
        return self._json(404, {})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8799)
    a = ap.parse_args()
    ThreadingHTTPServer(("127.0.0.1", a.porta), Tratar).serve_forever()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: O Deno local**

```ts
// e2e/w1/servir_local.ts — Physiq W1: sobe UMA função do principal no Deno local (só para o e2e/w1/api.py --local), trocando a porta do
// Deno.serve antes de importar a função. As chaves vêm do ambiente do processo (o api.py põe; nada é impresso).
// Uso: DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno run --allow-net --allow-env --allow-read e2e/w1/servir_local.ts <index.ts> <porta>
const [arquivo, porta] = Deno.args;
if (!arquivo || !/^\d{4,5}$/.test(porta ?? "")) throw new Error("uso: servir_local.ts <caminho do index.ts> <porta>");
const original = Deno.serve.bind(Deno) as unknown as (o: { port: number; hostname: string }, h: unknown) => unknown;
(Deno as unknown as { serve: (h: unknown) => unknown }).serve = (h: unknown) => original({ port: Number(porta), hostname: "127.0.0.1" }, h);
await import(new URL(arquivo, `file://${Deno.cwd()}/`).href);
```

- [ ] **Step 3: O E2E de servidor** — `e2e/w1/api.py`, no molde do `e2e/wp/api.py` (foto → arquivo de estado → casos → desfazer campo a campo;
`--seco`, `--casos`, `--limpar`):

```python
#!/usr/bin/env python3
"""Physiq W1 — E2E de SERVIDOR da InfinitePay (pagamentos-aluno + infinitepay-webhook-aluno) no STAGING, com as contas de TESTE prof2
(dono da conta "Rafael Lima") e aluno2, em série e com a guarda de /health antes.
Casos (padrão — as funções PUBLICADAS e a API DE VERDADE da InfinitePay, só chamadas que NÃO cobram):
  recebimento  jeito 2: o dono lê e grava pela função (chave: criar normalizada, recusar a ruim, ligar 1 só, excluir; bloquear); o aluno
               → 403; a chave de OUTRA conta → 404 e ela fica; o dono grava a InfinitePay direto pelo banco sem integração → a guarda desfaz
  ligar        flag desligada → some e 403; Testar com InfiniteTag inventada → 400 infinitepay_checkout_desligado com o link de ativar
               (a API responde igual para a tag que não existe e para o checkout desligado — sondado 11/10); Testar com a de teste →
               página da InfinitePay (não salva); sem tag → 409; com a tag → InfinitePay ligada + link de teste; tirar a tag em uso →
               409; volta ao Pix
  link         o aluno abre o pagamento: url da InfinitePay; a tentativa (forma, InfiniteTag, 72 h, valor) e o link 1 (pedido <id>-1, I4);
               o 2º toque reaproveita; a trava vê "aguardando"; conferir só pelo pedido (W1-B2) → não pago; o 2º conferir em < 30 s não
               chama de novo; outra pessoa → 404
  forjado      webhook com o pedido vivo e NSU inventado → 200 "registrado" com ms < 1000; o payment_check de verdade → não pago: o
               aviso é REAGENDADO (I1), nada muda, ninguém avisado; formato ruim / o id puro da cobrança (I4) / pedido de fora / schema
               ruim → 200 ignorado; I6: corpo > 16 KB → 413, link velho → ignorado_prazo, 20 avisos → ignorado_teto; a rodada
               (pg_net) reenvia e confere de novo
  vencida      72 h depois (forçado): o aluno_status fecha a tentativa (fora do histórico, a InfiniteTag guardada) e a trava solta o
               "aguardando"; pagar de novo cria outra tentativa
  avulsa       a cobrança avulsa vira a tentativa; vencida, volta a "aberta" com a InfiniteTag guardada; pagar de novo = OUTRO link
               (pedido <id>-2 — I4: a unicidade do order_nsu é nossa)
  trocar       conta no MP com automática (simulada) → trocar para a InfinitePay pede o OK (409 automaticas_ativas); com o OK cancela e avisa
  periodo      P-B: a conta InfinitePay recebe [à vista, mês a mês]; o plano antigo com cartão parcelado salva; plano novo com ele → 400;
               o aluno no cartão parcelado paga o período todo (R$ 120 por 12 meses)
Casos --local (o caminho da BAIXA sem pagar: as 2 funções no Deno local — e2e/w1/servir_local.ts — contra o banco do STAGING e o
SIMULADOR — e2e/w1/simulador_ip.py — no lugar da API):
  baixa        o webhook + o "pago" do simulador: paga (NSU, slug, recibo, meio, valor pago), o "pago até" anda, avisos ao aluno e ao
               personal, o payment_check foi com a InfiniteTag e o pedido do LINK (I4); o mesmo webhook de novo → nada muda
  repetido     C1, o PIOR caso (o simulador não amarra o NSU ao pedido): o mesmo link avisado com outro NSU → nenhum período a mais,
               nenhuma linha nova, 1 aviso "confira" ao personal (o 2º forjado em seguida não repete o sino); a avulsa igual (sem
               "Pagamento repetido")
  forjado_pago C1, o caso negativo (o simulador amarra o NSU): NSU inventado num pedido JÁ pago → "não pago", reagendado, nada muda,
               ninguém avisado
  valor        o payment_check com outro amount → sem baixa + aviso ao personal
  volta        a volta da página (aluno_ip_volta) dá baixa na hora
  atrasado     a tentativa vencida (fechada) paga depois → volta e fica paga
  pedido       W1-B2 + C1: o payment_check só pelo pedido diz "pago" → paga com o NSU do pedido; o webhook de verdade depois NÃO troca
               o NSU nem cria linha: 1 aviso "confirmou de novo" ao personal
  naopago      I1: "não pago" na 1ª conferência (a volta antes da aprovação do cartão) → reagendado; fechado como na 24ª; o mesmo
               aviso chega de novo → reabre e dá baixa
  registrado   I5: o personal registra a mensalidade à mão com a tentativa aberta → a MESMA linha vira paga (sem nascer outra); a
               confirmação da InfinitePay depois → "já registrado" ao personal, sem 2º período
  fora         a InfinitePay fora do ar (503) → o aviso fica para depois (tentativas 1); na 24ª desiste e avisa o personal
  desligado    o checkout externo desligado (o 404 de 11/10): o link → 400 com o link de ativar e a tentativa desfeita; a
               conferência → sem decisão (o aviso fica aberto, nunca "não pago")
Desfazer: ANTES de mexer, a foto (a matrícula do aluno2, a conta do prof2 — forma, bloqueio, chaves, integração — e a flag do staging) vai para
~/projetos/physiqcalc-scratch/w1/api-estado.json; no fim (ou na próxima rodada / --limpar, se esta cair no meio) sai tudo o que a rodada
criou (cobranças e os avisos da caixa delas, avisos do sino, chaves "w1e2e…", assinaturas e planos "W1 e2e …") e o resto volta à foto — o
último ✅ confere campo a campo.
Precisa:
  · a W1 no staging (a migration 20261011200000; a flag é ligada e devolvida pela rodada) e, no padrão, as 2 funções publicadas;
  · ~/.pc-pat e as senhas das contas de TESTE;
  · a InfiniteTag de teste em ~/.physiq-infinitetag-teste (600). Ela já existe e o checkout externo dela está LIGADO (sondado 11/10);
  · no --local, o ~/.deno/bin/deno. A InfiniteTag do --local é inventada (o simulador não confere a tag).
No --local, a rodada de 15 min do staging fica PARADA e volta como estava no desfazer: ela chamaria a função publicada, que fala com
a API de verdade, com a tag inventada (MENOR 12 da revisão).
Uso: python3 e2e/w1/api.py [--local] [--casos …] [--seco | --limpar]
  --seco    só os logins, a montagem dos pedidos e as leituras (no --local, sobe e derruba os 3 processos e cutuca cada um) — nada é gravado
  --limpar  só desfaz uma rodada que caiu no meio (pelo arquivo de estado)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

sys.dont_write_bytecode = True

S = "staging"
DONO, ALUNO = "prof2", "aluno2"
PREFIXO = "W1 e2e"
CASOS_STAGING = ("recebimento", "ligar", "link", "forjado", "vencida", "avulsa", "trocar", "periodo")
CASOS_LOCAL = ("baixa", "repetido", "forjado_pago", "valor", "volta", "atrasado", "pedido", "naopago", "registrado", "fora", "desligado")
PRECISAM_DA_TAG = {"ligar", "link", "forjado", "vencida", "avulsa", "periodo"}
ARQ_TAG = Path.home() / ".physiq-infinitetag-teste"
TAG_LOCAL = "physiq.simulador"
ESTADO_ARQ = Path.home() / "projetos" / "physiqcalc-scratch" / "w1" / "api-estado.json"
LOG_LOCAL = Path.home() / "projetos" / "physiqcalc-scratch" / "w1" / "deno-local.log"
RAIZ = Path(__file__).resolve().parent.parent.parent
PORTA_PAG, PORTA_WEB, PORTA_SIM = 8790, 8791, 8799
HOST_IP = re.compile(r"^https://([a-z0-9-]+\.)*(infinitepay\.io|infinitepay\.com\.br)(/|$)", re.I)
ATIVAR = "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true"
# a resposta de verdade do /links (e do payment_check) com o checkout externo desligado — ou a InfiniteTag que não existe (sondado 11/10)
DESLIGADO = {"success": False, "error": "external_checkout_not_enabled", "message": "External checkout is not enabled for this merchant.",
             "redirect_url": ATIVAR}

B = None  # a base dos E2E da W6 (e2e/w06/_base.py), carregada no main
p = None
CTX: dict = {}


# ───────────────────────── a base, o banco e as chamadas ─────────────────────────

def carregar_base() -> None:
    global B, p
    if B is not None:
        return
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w06"))
    import _base  # noqa: PLC0415

    B, p = _base, _base.p
    B.ESTADO["schema"] = S


def sql(q: str) -> list:
    return B.sql_principal(q)


def um(q: str) -> dict | None:
    r = sql(q)
    return r[0] if r else None


def lit(v) -> str:
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def tag_de_teste() -> str | None:
    v = ARQ_TAG.read_text(encoding="utf-8").strip().lstrip("$").lower() if ARQ_TAG.exists() else ""
    return v if re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,39}", v) else None


def pedir(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    """Uma ação da pagamentos-aluno como a conta de TESTE: a publicada (x-schema staging) ou a do Deno local (--local)."""
    corpo = corpo or {}
    if CTX.get("local"):
        st, r, _ = B.http("POST", f"http://127.0.0.1:{PORTA_PAG}", {"acao": acao, **corpo},
                          {"Authorization": f"Bearer {B.token(conta)}", "x-schema": S, "Origin": "http://localhost:8080"}, timeout=60)
    else:
        st, r = B.pag(conta, acao, corpo)
    return st, (r if isinstance(r, dict) else {})


def webhook(corpo, schema: str = S, metodo: str = "POST") -> tuple[int, dict, float]:
    """O webhook (o publicado ou o local), sem JWT, como a InfinitePay → (status, corpo, segundos medidos daqui)."""
    url = (f"http://127.0.0.1:{PORTA_WEB}?schema={schema}" if CTX.get("local")
           else f"{B.PRINCIPAL_URL}/functions/v1/infinitepay-webhook-aluno?schema={schema}")
    t0 = time.time()
    st, r, _ = B.http(metodo, url, corpo, {}, timeout=30)
    return st, (r if isinstance(r, dict) else {}), time.time() - t0


def esperar(funcao, segundos: float, passo: float = 2.0):
    fim = time.time() + segundos
    while True:
        v = funcao()
        if v or time.time() >= fim:
            return v
        time.sleep(passo)


def cenario(**c) -> None:
    req = urllib.request.Request(f"http://127.0.0.1:{PORTA_SIM}/_cenario", data=json.dumps(c).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        r.read()


def pedidos_do_simulador() -> list:
    with urllib.request.urlopen(f"http://127.0.0.1:{PORTA_SIM}/_pedidos", timeout=10) as r:
        return json.loads(r.read() or b"[]")


# ───────────────────────── o Deno local e o simulador ─────────────────────────

def porta_aberta(porta: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", porta)) == 0


def subir_local() -> list:
    """O simulador e as 2 funções no Deno local, contra o banco do STAGING (as chaves só no ambiente destes processos — nada impresso)."""
    for porta in (PORTA_PAG, PORTA_WEB, PORTA_SIM):
        if porta_aberta(porta):
            raise RuntimeError(f"a porta {porta} já está em uso (ss -ltnp | grep {porta}) — outra sessão?")
    env = {**os.environ, "SUPABASE_URL": B.PRINCIPAL_URL, "SUPABASE_SERVICE_ROLE_KEY": B.service(B.PRINCIPAL_REF),
           "SUPABASE_ANON_KEY": B.anon(B.PRINCIPAL_REF), "INFINITEPAY_API": f"http://127.0.0.1:{PORTA_SIM}",
           "ERROS_AVISO_DESLIGADO": "1", "DENO_NO_PACKAGE_JSON": "1"}
    LOG_LOCAL.parent.mkdir(parents=True, exist_ok=True)
    saida = LOG_LOCAL.open("a", encoding="utf-8")
    deno = str(Path.home() / ".deno" / "bin" / "deno")
    procs = [subprocess.Popen([sys.executable, str(RAIZ / "e2e" / "w1" / "simulador_ip.py"), "--porta", str(PORTA_SIM)], cwd=RAIZ,
                              stdout=saida, stderr=saida)]
    for slug, porta in (("pagamentos-aluno", PORTA_PAG), ("infinitepay-webhook-aluno", PORTA_WEB)):
        procs.append(subprocess.Popen([deno, "run", "--allow-net", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                                       f"supabase-principal/functions/{slug}/index.ts", str(porta)], cwd=RAIZ, env=env, stdout=saida, stderr=saida))
    if not esperar(lambda: all(porta_aberta(x) for x in (PORTA_PAG, PORTA_WEB, PORTA_SIM)), 90, 1.0):
        descer_local(procs)
        raise RuntimeError(f"o Deno local não subiu em 90 s (veja {LOG_LOCAL})")
    return procs


def descer_local(procs: list) -> None:
    for pr in procs:
        pr.terminate()
    for pr in procs:
        try:
            pr.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pr.kill()


# ───────────────────────── a foto e o desfazer ─────────────────────────

def rodada_do_staging(ativa: bool | None = None) -> bool | None:
    """A rodada de 15 min do staging (pg_cron). No --local ela fica parada: chamaria a função PUBLICADA, que fala com a API de verdade
    com a tag inventada do simulador (MENOR 12 da revisão). Sem argumento, só lê."""
    if ativa is not None:
        sql(f"select cron.alter_job(j.jobid, active := {str(ativa).lower()}) from cron.job j where j.jobname = 'infinitepay-rodada-{S}'")
    r = um(f"select active from cron.job where jobname = 'infinitepay-rodada-{S}'")
    return None if not r else bool(r["active"])


def foto(pac: str, conta: str) -> dict:
    pa = um(f"""select plano_aluno_id::text as plano_aluno_id, plano_modalidade, plano_valor_negociado::text as plano_valor_negociado,
                       mensalidade_valor::text as mensalidade_valor, mensalidade_desde::text as mensalidade_desde, cobranca_pausada
                  from {S}.pacientes where id = '{pac}'""")
    co = um(f"select recebimento_modo as modo, bloquear_app_inadimplente as bloquear from {S}.contas where id = '{conta}'")
    chaves = sql(f"select id::text as id, ativa from {S}.recebimento_chaves where conta_id = '{conta}' order by id")
    integ = um(f"""select infinitepay_handle as handle, status from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'infinitepay'""")
    flag = um(f"select valor::text as v from {S}.app_config where chave = 'infinitepay'")
    vivas = [x["id"] for x in sql(f"""select id::text as id from {S}.cobrancas where paciente_id = '{pac}' and tipo = 'mensalidade'
                                         and deleted_at is null order by id""")]
    assin = [x["id"] for x in sql(f"select id::text as id from {S}.aluno_assinaturas where paciente_id = '{pac}' order by id")]
    return {"pacientes": pa, "conta": co, "chaves": chaves, "integracao": integ, "flag": flag and flag["v"], "vivas": vivas, "assinaturas": assin,
            "rodada": rodada_do_staging()}


def preparar() -> None:
    m = um(f"""select p.id::text as id, p.conta_id::text as conta, p.user_id::text as aluno_uid, c.dono_id::text as dono_uid, c.origem
                 from {S}.pacientes p join auth.users u on u.id = p.user_id left join {S}.contas c on c.id = p.conta_id
                where lower(u.email) = {lit(B.CONTAS[ALUNO][0])} and p.deleted_at is null order by p.ativo desc, p.created_at limit 1""")
    if not m or m["origem"] == "app" or m["dono_uid"] != B.uid(DONO):
        raise RuntimeError(f"a matrícula de TESTE do {ALUNO} tem que estar na conta do {DONO} ({m})")
    if not um(f"select to_regclass('{S}.infinitepay_avisos') is not null as ok")["ok"]:
        raise RuntimeError(f"o {S} está sem a W1: aplique a 20261011200000_w1_infinitepay.sql antes")
    pac, conta = m["id"], m["conta"]
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    t0 = um("select clock_timestamp()::text as t0")["t0"]
    est = {"t0": t0, "paciente": pac, "conta": conta, "aluno_uid": m["aluno_uid"], "dono_uid": m["dono_uid"], **foto(pac, conta)}
    ESTADO_ARQ.parent.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    ESTADO_ARQ.chmod(0o600)
    CTX.update(estado=est, pac=pac, conta=conta, aluno_uid=m["aluno_uid"], dono_uid=m["dono_uid"], t0=t0,
               tag_em_uso=TAG_LOCAL if CTX.get("local") else CTX.get("tag"))
    # o ponto de partida: as mensalidades de antes escondidas (voltam no fim), modo de hoje com R$ 10,00 vencida, Pix na chave, flag ligada
    if est["vivas"]:
        sql(f"update {S}.cobrancas set deleted_at = now() where id = any(array[{', '.join(lit(x) for x in est['vivas'])}]::uuid[])")
    sql(f"""update {S}.pacientes set plano_modalidade = null, plano_valor_negociado = null, mensalidade_valor = 10, cobranca_pausada = false,
                   mensalidade_desde = now() - interval '1 day' where id = '{pac}'""")
    sql(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{conta}'")
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'infinitepay'")
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    if CTX.get("local"):
        rodada_do_staging(False)   # MENOR 12: parada durante o --local (volta no desfazer)


def limpar(est: dict) -> None:
    pac, conta, t0 = est["paciente"], est["conta"], lit(est["t0"])
    sql(f"delete from {S}.cobrancas where paciente_id = '{pac}' and created_at >= {t0}::timestamptz")   # a caixa sai junto (cascade)
    sql(f"""delete from {S}.avisos where destino_user_id in ('{est['aluno_uid']}', '{est['dono_uid']}') and criado_em >= {t0}::timestamptz""")
    sql(f"delete from {S}.recebimento_chaves where chave like 'w1e2e%@teste.com'")
    for ch in est["chaves"]:
        sql(f"update {S}.recebimento_chaves set ativa = false where id = '{ch['id']}'")
    for ch in est["chaves"]:
        if ch["ativa"]:
            sql(f"update {S}.recebimento_chaves set ativa = true where id = '{ch['id']}'")
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{conta}'")
    if est["integracao"]:
        sql(f"""insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status)
                values ('{conta}', 'infinitepay', {lit(est['integracao']['handle'])}, {lit(est['integracao']['status'])})""")
    c = est["conta"]
    sql(f"update {S}.contas set recebimento_modo = {lit(c['modo'])}, bloquear_app_inadimplente = {str(bool(c['bloquear'])).lower()} where id = '{conta}'")
    if est["flag"]:
        sql(f"update {S}.app_config set valor = {lit(est['flag'])}::jsonb where chave = 'infinitepay'")
    sql(f"""delete from {S}.aluno_assinaturas where paciente_id = '{pac}'
              and not (id = any(array[{', '.join(lit(x) for x in est['assinaturas']) or ''}]::uuid[]))""")
    a = est["pacientes"]
    sql(f"""update {S}.pacientes set plano_aluno_id = {lit(a['plano_aluno_id'])}, plano_modalidade = {lit(a['plano_modalidade'])},
                   plano_valor_negociado = {lit(a['plano_valor_negociado'])}, mensalidade_valor = {lit(a['mensalidade_valor'])},
                   mensalidade_desde = {lit(a['mensalidade_desde'])}, cobranca_pausada = {str(bool(a['cobranca_pausada'])).lower()}
             where id = '{pac}'""")
    if est["vivas"]:
        sql(f"update {S}.cobrancas set deleted_at = null where id = any(array[{', '.join(lit(x) for x in est['vivas'])}]::uuid[])")
    sql(f"delete from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')}")
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    if est.get("rodada") is not None:
        rodada_do_staging(est["rodada"])


def desfazer(est: dict) -> None:
    print("\n── desfazer: sai o que a rodada criou e a matrícula, a conta e a flag voltam à foto de antes")
    try:
        limpar(est)
        agora = foto(est["paciente"], est["conta"])
        sobra = um(f"""select (select count(*) from {S}.cobrancas where paciente_id = '{est['paciente']}' and created_at >= {lit(est['t0'])}::timestamptz)::int as cobrancas,
                              (select count(*) from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')})::int as planos,
                              (select count(*) from {S}.recebimento_chaves where chave like 'w1e2e%@teste.com')::int as chaves""")
    except Exception as e:  # noqa: BLE001
        p.check(False, f"a limpeza quebrou ({e!r}) — o estado ficou em {ESTADO_ARQ}: rode  python3 e2e/w1/api.py --limpar"[:500])
        return
    antes = {k: est.get(k) for k in ("pacientes", "conta", "chaves", "integracao", "flag", "vivas", "assinaturas", "rodada")}
    difs = [f"{k}: {antes[k]!r} → {agora[k]!r}" for k in antes if antes[k] != agora[k]]
    p.check(not difs and not any(sobra.values()), f"tudo voltou à foto e nada da rodada ficou ({'; '.join(difs) or 'igual'} · sobras {sobra})")
    ESTADO_ARQ.unlink(missing_ok=True)


# ───────────────────────── ajudantes dos casos ─────────────────────────

def garantir_integracao() -> None:
    sql(f"""insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em)
            values ('{CTX['conta']}', 'infinitepay', {lit(CTX['tag_em_uso'])}, 'ativa', now())
            on conflict (conta_id, provedor) do update set infinitepay_handle = excluded.infinitepay_handle, status = 'ativa'""")


def ligar_infinitepay() -> None:
    """Atalho pelo banco (o caso 'ligar' prova o caminho pela função)."""
    garantir_integracao()
    sql(f"update {S}.contas set recebimento_modo = 'infinitepay' where id = '{CTX['conta']}'")


def esconder() -> None:
    """As mensalidades que a rodada criou saem (a cobertura volta a zero e o aluno pode pagar de novo)."""
    sql(f"""update {S}.cobrancas set deleted_at = now() where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade' and deleted_at is null
              and created_at >= {lit(CTX['t0'])}::timestamptz""")
    sql(f"select {S}.mensalidade_recalcular('{CTX['pac']}')")


def garantir_tentativa() -> str:
    ligar_infinitepay()
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    if st != 200 or not c:
        raise RuntimeError(f"aluno_ip_link falhou ({st} {r.get('erro')})")
    return c


def centavos_de(c: str) -> int:
    return round(um(f"select valor::float as v from {S}.cobrancas where id = '{c}'")["v"] * 100)


def avisos(tipo: str, texto: str | None = None) -> dict:
    filtro = f" and titulo like {lit('%' + texto + '%')}" if texto else ""
    r = um(f"""select count(*) filter (where destino_user_id = '{CTX['aluno_uid']}')::int as aluno,
                      count(*) filter (where destino_user_id = '{CTX['dono_uid']}')::int as personal
                 from {S}.avisos where tipo = {lit(tipo)} and criado_em >= {lit(CTX['t0'])}::timestamptz{filtro}""")
    return {"aluno": r["aluno"], "personal": r["personal"]}


def pago_ate() -> str | None:
    return um(f"select mensalidade_pago_ate::text as a from {S}.pacientes where id = '{CTX['pac']}'")["a"]


def aguardando() -> bool | None:
    st, fin = B.rpc(ALUNO, "financeiro_do_aluno")
    return next((x.get("aguardando") for x in (fin or []) if isinstance(x, dict) and x.get("paciente_id") == CTX["pac"]), None)


def aviso_da_caixa(c: str, nsu: str) -> dict | None:
    return um(f"""select resultado, tentativas, conferido_em is not null as conferido, proxima_em > now() as adiado, origem
                    from {S}.infinitepay_avisos where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)} order by id desc limit 1""")


def pedido_de(c: str) -> str:
    """O pedido do link mais novo da cobrança (I4: o order_nsu é por link — `<cobranca_id>-<n>`)."""
    return um(f"select pedido from {S}.infinitepay_links where cobranca_id = '{c}' order by n desc limit 1")["pedido"]


def mensalidades_pagas() -> int:
    return um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade' and status = 'paga'
                    and deleted_at is null and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]


# ───────────────────────── casos (staging, API de verdade) ─────────────────────────

def caso_recebimento() -> None:
    print("\n── recebimento: o jeito 2 — a tela grava pela função, como a pessoa")
    conta, est = CTX["conta"], CTX["estado"]
    st, r = pedir(DONO, "prof_recebimento", {"conta_id": conta})
    p.check(st == 200 and (r.get("conta") or {}).get("id") == conta and isinstance(r.get("chaves"), list) and "infinitepay" in r,
            f"o dono lê a conta, as chaves e a InfinitePay numa chamada ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "prof_recebimento", {"conta_id": conta})
    p.check(st == 403 and r.get("erro") == "so_o_dono", f"o aluno não chega ({st} {r.get('erro')})")
    email = f"w1e2e{secrets.token_hex(3)}@teste.com"
    st, r = pedir(DONO, "prof_chave_salvar", {"conta_id": conta, "tipo": "email", "chave": email.upper(), "favorecido": "  W1   Teste ", "banco": ""})
    ch = r.get("chave") or {}
    p.check(st == 200 and ch.get("chave") == email and ch.get("favorecido") == "W1 Teste" and ch.get("banco") is None,
            f"chave nova normalizada ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_chave_salvar", {"conta_id": conta, "tipo": "cpf", "chave": "123"})
    p.check(st == 400 and r.get("erro") == "chave_invalida" and "11 dígitos" in str(r.get("mensagem")), "chave ruim → a frase da tela")
    st, _ = pedir(DONO, "prof_chave_ligar", {"conta_id": conta, "id": ch.get("id"), "ligar": True})
    lig = [x["id"] for x in sql(f"select id::text as id from {S}.recebimento_chaves where conta_id = '{conta}' and ativa")]
    p.check(st == 200 and lig == [ch.get("id")], f"ligar deixa 1 só ligada ({st} {len(lig)})")
    outra = um(f"""insert into {S}.recebimento_chaves (conta_id, tipo, chave, ativa)
                   select c.id, 'email', 'w1e2e-outra@teste.com', false from {S}.contas c where c.id <> '{conta}' and c.origem <> 'app' limit 1
                   returning id::text as id""")
    st, _ = pedir(DONO, "prof_chave_excluir", {"conta_id": conta, "id": outra["id"]})
    fica = um(f"select count(*)::int as n from {S}.recebimento_chaves where id = '{outra['id']}'")["n"]
    p.check(st == 404 and fica == 1, f"a chave de OUTRA conta: 404 e ela fica ({st} {fica})")
    st, _ = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "bloquear": not est["conta"]["bloquear"]})
    b = um(f"select bloquear_app_inadimplente as b from {S}.contas where id = '{conta}'")["b"]
    p.check(st == 200 and b == (not est["conta"]["bloquear"]), f"bloquear o inadimplente pela função ({st} {b})")
    st, _ = pedir(DONO, "prof_chave_excluir", {"conta_id": conta, "id": ch.get("id")})
    st2, r2 = pedir(DONO, "prof_chave_excluir", {"conta_id": conta, "id": ch.get("id")})
    p.check(st == 200 and st2 == 404 and r2.get("erro") == "chave_inexistente", f"excluir; de novo → 404 ({st} {st2})")
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{conta}'")
    B.rest(DONO, "PATCH", f"contas?id=eq.{conta}", {"recebimento_modo": "infinitepay"})
    modo = um(f"select recebimento_modo as m from {S}.contas where id = '{conta}'")["m"]
    p.check(modo != "infinitepay", f"o dono não liga a InfinitePay direto pelo banco sem a InfiniteTag (contas_guard: {modo})")


def caso_ligar() -> None:
    print("\n── ligar: a InfiniteTag (API de verdade — criar link não cobra)")
    conta, tag = CTX["conta"], CTX["tag"]
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', false) where chave = 'infinitepay'")
    st, r = pedir(DONO, "prof_recebimento", {"conta_id": conta})
    st2, r2 = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "handle": tag})
    p.check(st == 200 and r["infinitepay"]["disponivel"] is False and st2 == 403 and r2.get("erro") == "infinitepay_em_teste",
            f"flag desligada: a opção some e não grava ({st2} {r2.get('erro')})")
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'infinitepay'")
    st, r = pedir(DONO, "prof_ip_testar", {"conta_id": conta, "handle": f"physiq-w1-{secrets.token_hex(6)}"})
    p.check(st == 400 and r.get("erro") == "infinitepay_checkout_desligado" and bool(HOST_IP.match(r.get("ativar") or "")),
            f"InfiniteTag inventada: 'confira a tag e ative o checkout externo', com o link de ativar (sondado 11/10) ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_ip_testar", {"conta_id": conta, "handle": f"${tag.upper()}"})
    p.check(st == 200 and bool(HOST_IP.match(r.get("url") or "")), f"Testar com a InfiniteTag de teste → a página da InfinitePay ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay"})
    p.check(st == 409 and r.get("erro") == "sem_infinitetag", f"InfinitePay sem a InfiniteTag → 409 ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay", "handle": tag})
    p.check(st == 200 and r["conta"]["modo"] == "infinitepay" and r["infinitepay"]["handle"] == tag and bool(HOST_IP.match(r.get("link_teste") or "")),
            f"salvar a InfiniteTag e a forma: InfinitePay ligada ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "handle": None})
    p.check(st == 409 and r.get("erro") == "em_uso", f"tirar a InfiniteTag em uso → 409 ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "pix_manual"})
    p.check(st == 200 and r["conta"]["modo"] == "pix_manual", f"volta ao Pix na chave ({st})")


def caso_link() -> None:
    print("\n── link: o aluno abre o pagamento (API de verdade)")
    ligar_infinitepay()
    pac = CTX["pac"]
    st, r = pedir(ALUNO, "aluno_status")
    m = next((x for x in r.get("matriculas", []) if x.get("paciente_id") == pac), {})
    p.check(st == 200 and (m.get("conta") or {}).get("modo") == "infinitepay" and m.get("chave") is None, "o aluno vê a forma InfinitePay")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": pac})
    c = r.get("cobranca") or {}
    p.check(st == 200 and bool(HOST_IP.match(r.get("url") or "")) and r.get("reutilizado") is False and c.get("forma") == "infinitepay"
            and c.get("status") == "aguardando_confirmacao" and c.get("ip_link") == r.get("url"), f"o link e a tentativa ({st} {r.get('erro')})")
    CTX["tentativa"] = c.get("id")
    linha = um(f"""select ip_handle as h, extract(epoch from ip_expira_em - now())::int as s, valor::float as v from {S}.cobrancas where id = '{c.get('id')}'""")
    p.check(bool(linha) and linha["h"] == CTX["tag_em_uso"] and 72 * 3600 - 600 <= linha["s"] <= 72 * 3600 and linha["v"] == 10.0,
            f"a InfiniteTag usada, 72 h e o valor gravados ({linha and {'s': linha['s'], 'v': linha['v']}})")
    lk = um(f"select pedido, handle, centavos from {S}.infinitepay_links where cobranca_id = '{c.get('id')}'")
    p.check(bool(lk) and lk["pedido"] == f"{c.get('id')}-1" and lk["handle"] == CTX["tag_em_uso"] and lk["centavos"] == 1000,
            "o link 1 (I4): o pedido <id>-1 com a InfiniteTag e o preço dele")
    st, r2 = pedir(ALUNO, "aluno_ip_link", {"paciente_id": pac})
    p.check(st == 200 and r2.get("reutilizado") is True and r2.get("url") == r.get("url") and (r2.get("cobranca") or {}).get("id") == c.get("id"),
            "o 2º toque reaproveita o mesmo link")
    p.check(aguardando() is True, "a trava vê 'aguardando' enquanto a tentativa vale")
    st, r = pedir(ALUNO, "aluno_ip_conferir", {"cobranca_id": c.get("id")})
    t1 = um(f"select ip_conferido_em::text as t from {S}.cobrancas where id = '{c.get('id')}'")["t"]
    p.check(st == 200 and r.get("paga") is False and bool(t1), f"conferir só pelo pedido (W1-B2): não pago ({st} {r.get('resultado')})")
    st, r = pedir(ALUNO, "aluno_ip_conferir", {"cobranca_id": c.get("id")})
    t2 = um(f"select ip_conferido_em::text as t from {S}.cobrancas where id = '{c.get('id')}'")["t"]
    p.check(st == 200 and r.get("resultado") == "cedo" and t2 == t1, "o 2º conferir em < 30 s não chama a InfinitePay de novo")
    st, _ = pedir(DONO, "aluno_ip_conferir", {"cobranca_id": c.get("id")})
    p.check(st == 404, f"outra pessoa não confere a tentativa de quem não é ela ({st})")


def caso_forjado() -> None:
    print("\n── forjado: webhook sem assinatura não dá baixa (o payment_check DE VERDADE decide) e a rota pública tem teto (I6)")
    c = CTX.get("tentativa") or garantir_tentativa()
    ped = pedido_de(c)
    nsu = f"FORJADO-{secrets.token_hex(4)}"
    st, r, seg = webhook({"order_nsu": ped, "transaction_nsu": nsu, "invoice_slug": "forjado", "amount": 1000, "paid_amount": 1000,
                          "capture_method": "pix", "receipt_url": "https://recibo.infinitepay.io/forjado"})
    p.check(st == 200 and r.get("resultado") == "registrado" and isinstance(r.get("ms"), int) and r["ms"] < 1000,
            f"200 'registrado' em < 1 s no servidor (ms {r.get('ms')} · {seg:.2f} s daqui)")
    linha = esperar(lambda: (lambda x: x if x and x["tentativas"] >= 1 else None)(aviso_da_caixa(c, nsu)), 40)
    p.check(bool(linha) and not linha["conferido"] and linha["adiado"] and linha["resultado"] is None,
            f"o payment_check de verdade: não pago → o aviso é REAGENDADO, não fechado (I1) ({linha})")
    est = um(f"select status from {S}.cobrancas where id = '{c}'")["status"]
    p.check(est == "aguardando_confirmacao" and avisos("pagamento_confirmado") == {"aluno": 0, "personal": 0}, f"nada muda, ninguém avisado ({est})")
    for corpo, esperado in (({"order_nsu": "teste-1", "transaction_nsu": "x"}, "ignorado_formato"),
                            ({"order_nsu": c, "transaction_nsu": "x"}, "ignorado_formato"),   # I4: o id puro da cobrança não é pedido
                            ({"order_nsu": f"{uuid.uuid4()}-1", "transaction_nsu": "x"}, "ignorado_pedido"),
                            ("lixo", "ignorado_formato")):
        st, r, _ = webhook(corpo)
        p.check(st == 200 and r.get("resultado") == esperado, f"webhook → {esperado} ({st} {r.get('resultado')})")
    st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": "x"}, schema="producao")
    p.check(st == 200 and r.get("resultado") == "schema_invalido", "schema inválido → 200 ignorado")
    # I6: o corpo grande, o link velho e o teto de avisos por cobrança
    st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": "grande", "lixo": "x" * 17_000})
    p.check(st == 413 and r.get("resultado") == "corpo_grande", f"corpo > 16 KB → 413 ({st} {r.get('resultado')})")
    criado = um(f"select criado_em::text as t from {S}.infinitepay_links where pedido = {lit(ped)}")["t"]
    sql(f"update {S}.infinitepay_links set criado_em = now() - interval '11 days' where pedido = {lit(ped)}")
    try:
        st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": f"VELHO-{secrets.token_hex(3)}"})
    finally:
        sql(f"update {S}.infinitepay_links set criado_em = {lit(criado)}::timestamptz where pedido = {lit(ped)}")
    p.check(st == 200 and r.get("resultado") == "ignorado_prazo", f"link com mais de 72 h + 7 dias → ignorado ({st} {r.get('resultado')})")
    sql(f"""insert into {S}.infinitepay_avisos (cobranca_id, pedido, transaction_nsu, origem, conferido_em, resultado)
            select '{c}', {lit(ped)}, 'TETO-' || g, 'webhook', now(), 'nao_pago' from generate_series(1, 19) g""")
    try:
        st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": f"TETO-X-{secrets.token_hex(3)}"})
    finally:
        sql(f"delete from {S}.infinitepay_avisos where cobranca_id = '{c}' and transaction_nsu like 'TETO-%'")
    p.check(st == 200 and r.get("resultado") == "ignorado_teto", f"20 avisos na cobrança → o 21º é ignorado ({st} {r.get('resultado')})")
    sql(f"""update {S}.infinitepay_avisos set tentado_em = null, proxima_em = now() - interval '1 minute'
             where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)}""")
    antes = (aviso_da_caixa(c, nsu) or {}).get("tentativas", 0)
    rod = um(f"select {S}.infinitepay_rodada() as r")["r"]
    linha = esperar(lambda: (lambda x: x if x and x["tentativas"] > antes else None)(aviso_da_caixa(c, nsu)), 60)
    p.check((rod or {}).get("reenviados", 0) >= 1 and bool(linha) and not linha["conferido"],
            f"a rodada reenviou pelo pg_net e o webhook conferiu de novo — ainda não pago, ainda aberto ({rod} → {linha})")


def caso_vencida() -> None:
    print("\n── vencida: 72 h depois a tentativa sai e a trava volta")
    c = CTX.get("tentativa") or garantir_tentativa()
    sql(f"update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = '{c}'")
    sql(f"update {S}.infinitepay_avisos set conferido_em = coalesce(conferido_em, now()), resultado = coalesce(resultado, 'nao_pago') where cobranca_id = '{c}'")
    st, _ = pedir(ALUNO, "aluno_status")
    linha = um(f"select status, deleted_at is not null as fora, ip_handle as h from {S}.cobrancas where id = '{c}'")
    p.check(st == 200 and linha == {"status": "cancelada", "fora": True, "h": CTX["tag_em_uso"]}, f"o aluno_status fechou a tentativa ({linha})")
    p.check(aguardando() is False, "a trava não vê mais 'aguardando'")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    p.check(st == 200 and r.get("reutilizado") is False and (r.get("cobranca") or {}).get("id") != c, "pagar de novo cria outra tentativa")
    CTX["tentativa"] = (r.get("cobranca") or {}).get("id")


def caso_avulsa() -> None:
    print("\n── avulsa: a cobrança avulsa vira a tentativa; vencida, volta a 'aberta'")
    ligar_infinitepay()
    st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa", "valor": 2, "vencimento": B.hoje()})
    av = (r.get("cobranca") or {}).get("id")
    p.check(st == 200 and bool(av), f"o personal cria a avulsa ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"], "cobranca_id": av})
    c = r.get("cobranca") or {}
    p.check(st == 200 and c.get("id") == av and c.get("forma") == "infinitepay" and bool(HOST_IP.match(r.get("url") or "")),
            f"a avulsa é a tentativa ({st} {r.get('erro')})")
    sql(f"update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = '{av}'")
    pedir(ALUNO, "aluno_status")
    linha = um(f"select status, forma, ip_handle as h, ip_link_url as u from {S}.cobrancas where id = '{av}'")
    p.check(linha == {"status": "aberta", "forma": None, "h": CTX["tag_em_uso"], "u": None}, f"vencida: aberta de novo, a InfiniteTag guardada ({linha})")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"], "cobranca_id": av})
    links = sql(f"select n, handle from {S}.infinitepay_links where cobranca_id = '{av}' order by n")
    p.check(st == 200 and [x["n"] for x in links] == [1, 2] and all(x["handle"] == CTX["tag_em_uso"] for x in links),
            f"pagar de novo: OUTRO link com outro pedido (<id>-2) — a InfinitePay aceita; a unicidade é nossa (I4) ({st} {links})")


def caso_trocar() -> None:
    print("\n── trocar: sair do Mercado Pago com cobrança automática viva pede o OK e cancela")
    conta = CTX["conta"]
    garantir_integracao()
    sql(f"update {S}.contas set recebimento_modo = 'mercadopago' where id = '{conta}'")   # como o master liga
    a = um(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, payload)
               values ('{CTX['pac']}', '{conta}', 'sim-w1e2e-{secrets.token_hex(4)}', 'authorized', 10, '{{"simulada": true, "teste_w1": true}}'::jsonb)
               returning id::text as id""")["id"]
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay"})
    p.check(st == 409 and r.get("erro") == "automaticas_ativas" and r.get("alunos") == 1, f"pede o OK ({st} {r.get('erro')} {r.get('alunos')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay", "cancelar_automaticas": True})
    s = um(f"select status from {S}.aluno_assinaturas where id = '{a}'")["status"]
    p.check(st == 200 and r["conta"]["modo"] == "infinitepay" and r.get("automaticas_canceladas") == 1 and s == "cancelled"
            and avisos("geral", "forma de receber")["aluno"] == 1, f"com o OK: cancela, avisa o aluno e liga a InfinitePay ({st} {s})")


def caso_periodo() -> None:
    print("\n── periodo (P-B): na InfinitePay, à vista e cartão parcelado = o período todo")
    conta = CTX["conta"]
    nome = f"{PREFIXO} anual {secrets.token_hex(3)}"
    plano = um(f"""insert into {S}.planos_aluno (conta_id, nome, valor, meses, modalidades, max_parcelas_cartao)
                   values ('{conta}', {lit(nome)}, 120, 12, array['avista', 'cartao_parcelado', 'mensal'], 3) returning id::text as id""")["id"]
    esconder()
    sql(f"""update {S}.pacientes set plano_aluno_id = '{plano}', plano_modalidade = 'cartao_parcelado', mensalidade_desde = now() - interval '1 day'
             where id = '{CTX['pac']}'""")
    ligar_infinitepay()
    st, r = pedir(DONO, "prof_planos", {"conta_id": conta})
    p.check(st == 200 and r.get("modalidades_da_conta") == ["avista", "mensal"], f"a conta InfinitePay recebe período todo e mês a mês ({r.get('modalidades_da_conta')})")
    st, r = pedir(DONO, "prof_plano_salvar", {"conta_id": conta, "id": plano, "nome": nome, "meses": 12, "valor": 120,
                                               "modalidades": ["avista", "cartao_parcelado", "mensal"], "max_parcelas_cartao": 3})
    p.check(st == 200, f"o plano que já tinha cartão parcelado salva sem tirar ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_plano_salvar", {"conta_id": conta, "nome": f"{PREFIXO} novo {secrets.token_hex(3)}", "meses": 6, "valor": 60,
                                               "modalidades": ["cartao_parcelado"], "max_parcelas_cartao": 3})
    p.check(st == 400 and r.get("erro") == "modalidade_da_conta", f"plano novo com cartão parcelado na InfinitePay → 400 ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    linha = um(f"select valor::float as v, meses_cobertos as m from {S}.cobrancas where id = '{c}'") if c else None
    p.check(st == 200 and linha == {"v": 120.0, "m": 12}, f"o aluno no cartão parcelado paga o período todo: R$ 120 por 12 meses ({st} {r.get('erro')} {linha})")


# ───────────────────────── casos --local (o simulador no lugar da API) ─────────────────────────

def pagar_pelo_webhook(pedido: str, nsu: str, slug: str = "slug-1", **extra) -> None:
    st, r, _ = webhook({"order_nsu": pedido, "transaction_nsu": nsu, "invoice_slug": slug, "receipt_url": "https://recibo.infinitepay.io/w1e2e",
                        "capture_method": "pix", **extra})
    if st != 200 or r.get("resultado") != "registrado":
        raise RuntimeError(f"webhook local não registrou ({st} {r})")


def conferido(c: str, nsu: str, segundos: float = 30):
    return esperar(lambda: (lambda x: x if x and x["conferido"] else None)(aviso_da_caixa(c, nsu)), segundos)


def reagendado(c: str, nsu: str, segundos: float = 30):
    return esperar(lambda: (lambda x: x if x and x["tentativas"] >= 1 else None)(aviso_da_caixa(c, nsu)), segundos)


def caso_baixa() -> None:
    print("\n── baixa (local): o webhook + o 'pago' do simulador dão baixa uma vez")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    nsu = f"NSU-{secrets.token_hex(4)}"
    cenario(pago=True, amount=cts, paid_amount=cts + 45, installments=1, capture_method="pix", nsus=[nsu], amarra_nsu=True)
    antes = pago_ate()
    pagar_pelo_webhook(ped, nsu)
    linha = esperar(lambda: um(f"""select ip_transaction_nsu as nsu, ip_slug as slug, ip_recibo_url as rec, ip_meio as meio, metodo,
                                          ip_valor_pago::float as pago from {S}.cobrancas where id = '{c}' and status = 'paga'"""), 30)
    p.check(bool(linha) and linha["nsu"] == nsu and linha["slug"] == "slug-1" and linha["rec"] == "https://recibo.infinitepay.io/w1e2e"
            and linha["meio"] == "pix" and linha["metodo"] == "pix" and abs(linha["pago"] - (cts + 45) / 100) < 0.001, f"paga com o que a InfinitePay disse ({linha})")
    p.check(pago_ate() != antes, f"o 'pago até' andou ({antes} → {pago_ate()})")
    chk = [x for x in pedidos_do_simulador() if x["caminho"] == "/payment_check"]
    p.check(bool(chk) and chk[-1]["corpo"] == {"handle": CTX["tag_em_uso"], "order_nsu": ped, "transaction_nsu": nsu, "slug": "slug-1"},
            "o payment_check foi com a InfiniteTag e o pedido do LINK (I4), o NSU e o slug")
    p.check(avisos("pagamento_confirmado") == {"aluno": 1, "personal": 1}, "'pagamento confirmado' ao aluno e ao personal")
    pagar_pelo_webhook(ped, nsu)
    time.sleep(4)
    n = um(f"select count(*)::int as n from {S}.cobrancas where ip_transaction_nsu = {lit(nsu)}")["n"]
    p.check(avisos("pagamento_confirmado") == {"aluno": 1, "personal": 1} and n == 1, "o mesmo webhook de novo: nada muda")
    CTX["paga"] = {"id": c, "pedido": ped, "centavos": cts, "nsu": nsu}


def caso_repetido() -> None:
    print("\n── repetido (local, C1): outro NSU no link já pago, no PIOR caso (a InfinitePay não amarra o NSU): só o aviso ao personal")
    if not CTX.get("paga"):
        caso_baixa()
    c, ped, cts = CTX["paga"]["id"], CTX["paga"]["pedido"], CTX["paga"]["centavos"]
    cenario(pago=True, amount=cts, amarra_nsu=False)
    antes, pagas = pago_ate(), mensalidades_pagas()
    nsu2 = f"NSU2-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, nsu2, slug="slug-2")
    linha = conferido(c, nsu2)
    p.check(bool(linha) and linha["resultado"] == "outro_pagamento" and pago_ate() == antes and mensalidades_pagas() == pagas
            and avisos("geral", "outro pagamento")["personal"] == 1,
            f"mensalidade: nenhum período a mais, nenhuma linha nova; 1 aviso 'confira' ao personal ({linha})")
    nsu3 = f"NSU3-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, nsu3, slug="slug-3")
    conferido(c, nsu3)
    p.check(avisos("geral", "outro pagamento")["personal"] == 1, "o forjado seguinte: o sino não repete (1 aviso por cobrança a cada 24 h)")
    st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa 2x", "valor": 3, "vencimento": B.hoje()})
    av = (r.get("cobranca") or {}).get("id")
    pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"], "cobranca_id": av})
    pav = pedido_de(av)
    cenario(pago=True, amount=300, amarra_nsu=False)
    pagar_pelo_webhook(pav, f"A1-{secrets.token_hex(3)}")
    esperar(lambda: um(f"select 1 as ok from {S}.cobrancas where id = '{av}' and status = 'paga'"), 30)
    a2 = f"A2-{secrets.token_hex(3)}"
    pagar_pelo_webhook(pav, a2, slug="slug-a2")
    linha = conferido(av, a2)
    rep = um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and descricao like 'Pagamento repetido%'
                   and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]
    p.check(bool(linha) and linha["resultado"] == "outro_pagamento" and rep == 0 and avisos("geral", "outro pagamento")["personal"] == 2,
            f"avulsa paga 2×: sem 'Pagamento repetido', só o aviso ({linha})")


def caso_forjado_pago() -> None:
    print("\n── forjado_pago (local, C1): NSU inventado num pedido JÁ pago, com a InfinitePay conferindo o NSU → nada muda, ninguém avisado")
    if not CTX.get("paga"):
        caso_baixa()
    c, ped, cts, nsu_ok = (CTX["paga"][k] for k in ("id", "pedido", "centavos", "nsu"))
    cenario(pago=True, amount=cts, nsus=[nsu_ok], amarra_nsu=True)
    antes, geral = pago_ate(), avisos("geral")
    forjado = f"FORJ-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, forjado, slug="forjado")
    linha = reagendado(c, forjado)
    gravado = um(f"select ip_transaction_nsu as n from {S}.cobrancas where id = '{c}'")["n"]
    p.check(bool(linha) and linha["resultado"] is None and linha["adiado"] and pago_ate() == antes and avisos("geral") == geral
            and gravado == nsu_ok, f"'não pago' para o NSU inventado: reagendado; o NSU de verdade fica; ninguém avisado ({linha})")


def caso_valor() -> None:
    print("\n── valor (local): o payment_check com outro amount não dá baixa")
    esconder()
    c = garantir_tentativa()
    cenario(pago=True, amount=centavos_de(c) - 1)
    nsu = f"V-{secrets.token_hex(4)}"
    pagar_pelo_webhook(pedido_de(c), nsu)
    linha = conferido(c, nsu)
    st = um(f"select status from {S}.cobrancas where id = '{c}'")["status"]
    p.check(bool(linha) and linha["resultado"] == "valor_diferente" and st == "aguardando_confirmacao"
            and avisos("geral", "valor diferente")["personal"] == 1, f"sem baixa + aviso ao personal ({linha} {st})")


def caso_volta() -> None:
    print("\n── volta (local): a volta da página dá baixa na hora")
    esconder()
    c = garantir_tentativa()
    cenario(pago=True, amount=centavos_de(c), installments=3, capture_method="credit_card")
    nsu = f"VOLTA-{secrets.token_hex(4)}"
    st, r = pedir(ALUNO, "aluno_ip_volta", {"order_nsu": pedido_de(c), "transaction_nsu": nsu, "slug": "volta-1",
                                             "receipt_url": "https://recibo.infinitepay.io/volta", "capture_method": "credit_card"})
    linha = um(f"select ip_parcelas as n, ip_meio as meio, metodo from {S}.cobrancas where id = '{c}'")
    p.check(st == 200 and r.get("paga") is True and (aviso_da_caixa(c, nsu) or {}).get("origem") == "volta"
            and linha == {"n": 3, "meio": "credit_card", "metodo": "cartao"}, f"paga pela volta, cartão em 3× ({st} {r.get('resultado')} {linha})")


def caso_atrasado() -> None:
    print("\n── atrasado (local): a tentativa vencida (fechada) paga depois")
    esconder()
    c = garantir_tentativa()
    sql(f"update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = '{c}'")
    pedir(ALUNO, "aluno_status")
    fora = um(f"select deleted_at is not null as f from {S}.cobrancas where id = '{c}'")["f"]
    cenario(pago=True, amount=centavos_de(c))
    pagar_pelo_webhook(pedido_de(c), f"ATR-{secrets.token_hex(4)}")
    linha = esperar(lambda: um(f"select status, deleted_at is null as volta from {S}.cobrancas where id = '{c}' and status = 'paga'"), 30)
    p.check(fora is True and linha == {"status": "paga", "volta": True}, f"fechada e depois paga: volta ao histórico ({fora} → {linha})")


def caso_pedido() -> None:
    print("\n── pedido (local, W1-B2 + C1): pago só pelo pedido; o NSU de verdade depois NÃO troca nem cria linha — só o aviso")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    real = f"REAL-{secrets.token_hex(4)}"
    cenario(pago=True, amount=cts, nsus=[real], amarra_nsu=True)
    st, r = pedir(ALUNO, "aluno_ip_conferir", {"cobranca_id": c})
    nsu = um(f"select ip_transaction_nsu as n from {S}.cobrancas where id = '{c}'")["n"]
    p.check(st == 200 and r.get("paga") is True and nsu == f"pedido:{ped}", f"paga pelo pedido ({st} {r.get('resultado')} {nsu})")
    pagar_pelo_webhook(ped, real)
    linha = conferido(c, real)
    depois = um(f"select ip_transaction_nsu as n from {S}.cobrancas where id = '{c}'")["n"]
    p.check(bool(linha) and linha["resultado"] == "nsu_novo" and depois == f"pedido:{ped}" and mensalidades_pagas() == 1
            and avisos("geral", "confirmou de novo")["personal"] == 1,
            f"o NSU de verdade não troca o do pedido, não nasce 2ª linha e o personal recebe 1 aviso ({linha} {depois})")


def caso_naopago() -> None:
    print("\n── naopago (local, I1): 'não pago' na 1ª conferência não fecha o aviso; o mesmo aviso depois reabre e dá baixa")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    nsu = f"NP-{secrets.token_hex(4)}"
    cenario(pago=False, amount=cts, nsus=[nsu], amarra_nsu=True)
    pagar_pelo_webhook(ped, nsu)
    linha = reagendado(c, nsu)
    p.check(bool(linha) and not linha["conferido"] and linha["adiado"] and linha["resultado"] is None, f"'não pago' → reagendado, aberto ({linha})")
    # fechado como na 24ª conferência ("não pago" em todas); o webhook verdadeiro chega de novo depois da aprovação
    sql(f"""update {S}.infinitepay_avisos set conferido_em = now(), resultado = 'nao_pago', tentativas = 24
             where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)}""")
    cenario(pago=True, amount=cts, nsus=[nsu], amarra_nsu=True)
    pagar_pelo_webhook(ped, nsu)
    paga = esperar(lambda: um(f"select 1 as ok from {S}.cobrancas where id = '{c}' and status = 'paga'"), 30)
    p.check(bool(paga) and (aviso_da_caixa(c, nsu) or {}).get("resultado") == "pago", "o mesmo aviso reabriu e deu baixa: o pagamento não se perde")


def caso_registrado() -> None:
    print("\n── registrado (local, I5): registrar à mão com a tentativa aberta usa a MESMA linha; a confirmação depois só avisa")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    st, r = pedir(DONO, "prof_registrar", {"aluno": CTX["pac"], "data": B.hoje(), "metodo": "pix", "valor": 10})
    linha = um(f"select status, forma from {S}.cobrancas where id = '{c}'")
    p.check(st == 200 and (r.get("cobranca") or {}).get("id") == c and linha == {"status": "paga", "forma": "manual"} and mensalidades_pagas() == 1,
            f"a tentativa virou a linha registrada, sem nascer outra ({st} {r.get('erro')} {linha})")
    antes = pago_ate()
    nsu = f"REG-{secrets.token_hex(4)}"
    cenario(pago=True, amount=cts, nsus=[nsu], amarra_nsu=True)
    pagar_pelo_webhook(ped, nsu)
    av = conferido(c, nsu)
    p.check(bool(av) and av["resultado"] == "ja_pago_por_fora" and pago_ate() == antes and mensalidades_pagas() == 1
            and avisos("geral", "já tinha registrado")["personal"] == 1, f"a confirmação depois: 'já registrado' ao personal, sem 2º período ({av})")


def caso_fora() -> None:
    print("\n── fora (local): a InfinitePay fora do ar")
    esconder()
    c = garantir_tentativa()
    ped = pedido_de(c)
    cenario(check_status=503)
    nsu = f"FORA-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, nsu)
    linha = reagendado(c, nsu)
    p.check(bool(linha) and not linha["conferido"] and linha["adiado"], f"fica para depois (tentativas 1, proxima_em adiante) ({linha})")
    sql(f"update {S}.infinitepay_avisos set tentativas = 23, tentado_em = null where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)}")
    pagar_pelo_webhook(ped, nsu)
    linha = conferido(c, nsu)
    p.check(bool(linha) and linha["resultado"] == "desistiu" and avisos("geral", "Não conseguimos confirmar")["personal"] == 1,
            f"na 24ª desiste e avisa o personal ({linha})")


def caso_desligado() -> None:
    print("\n── desligado (local): o checkout externo desligado — o link volta com o 'ativar'; a conferência fica sem decisão (não fecha)")
    esconder()
    ligar_infinitepay()
    cenario(links_status=404, links_corpo=DESLIGADO)
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    sobra = um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and forma = 'infinitepay'
                     and status = 'aguardando_confirmacao' and deleted_at is null and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]
    p.check(st == 400 and r.get("erro") == "infinitepay_checkout_desligado" and r.get("ativar") == ATIVAR and sobra == 0,
            f"o link: 400 com o link de ativar e a tentativa desfeita ({st} {r.get('erro')} {sobra})")
    cenario()
    c = garantir_tentativa()
    nsu = f"DESL-{secrets.token_hex(4)}"
    cenario(check_status=404, check_corpo=DESLIGADO)
    pagar_pelo_webhook(pedido_de(c), nsu)
    linha = reagendado(c, nsu)
    p.check(bool(linha) and not linha["conferido"] and linha["resultado"] is None, f"a conferência: sem decisão, o aviso fica para depois ({linha})")


FUNCOES = {"recebimento": caso_recebimento, "ligar": caso_ligar, "link": caso_link, "forjado": caso_forjado, "vencida": caso_vencida,
           "avulsa": caso_avulsa, "trocar": caso_trocar, "periodo": caso_periodo, "baixa": caso_baixa, "repetido": caso_repetido,
           "forjado_pago": caso_forjado_pago, "valor": caso_valor, "volta": caso_volta, "atrasado": caso_atrasado, "pedido": caso_pedido,
           "naopago": caso_naopago, "registrado": caso_registrado, "fora": caso_fora, "desligado": caso_desligado}


# ───────────────────────── seco, ambiente e main ─────────────────────────

def ambiente(casos: list[str]) -> None:
    """Só leitura: a W1 no staging, a flag, as funções publicadas (no padrão), a InfiniteTag de teste, o deno (no --local)."""
    w1 = um(f"select to_regclass('{S}.infinitepay_avisos') is not null as ok")["ok"]
    p.check(bool(w1), f"{S}: a W1 (20261011200000_w1_infinitepay.sql)")
    if not CTX.get("local"):
        for slug, jwt in (("pagamentos-aluno", True), ("infinitepay-webhook-aluno", False)):
            st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/functions/{slug}", None,
                              {"Authorization": f"Bearer {B.ler('.pc-pat')}"})
            r = r if isinstance(r, dict) else {}
            p.check(st == 200 and r.get("verify_jwt") is jwt, f"função {slug} publicada com verify_jwt {str(jwt).lower()} (versão {r.get('version')})")
        if set(casos) & PRECISAM_DA_TAG:
            p.check(bool(CTX.get("tag")), f"a InfiniteTag de teste em ~/{ARQ_TAG.name} (cofre: 'InfinitePay — InfiniteTag do Weslley (testes da W1)')")
    else:
        p.check((Path.home() / ".deno" / "bin" / "deno").exists(), "o deno local (~/.deno/bin/deno)")


def seco(casos: list[str]) -> int:
    print("── seco: logins, leituras e (no --local) os 3 processos — nenhuma ação é chamada, nada é gravado")
    for conta in (DONO, ALUNO):
        try:
            p.check(bool(B.token(conta)), f"login da conta de TESTE {conta}")
        except Exception as e:  # noqa: BLE001
            p.check(False, f"login {conta}: {type(e).__name__}")
    ambiente(casos)
    if CTX.get("local"):
        procs = subir_local()
        try:
            st, r, _ = webhook(None, metodo="GET")
            p.check(st == 200 and r.get("resultado") == "ignorado_metodo", f"o webhook local responde ({st} {r.get('resultado')})")
            st, _, _ = B.http("OPTIONS", f"http://127.0.0.1:{PORTA_PAG}", None, {"Origin": "http://localhost:8080"})
            p.check(st == 200, f"a pagamentos-aluno local responde ({st})")
            cenario(pago=False)
            p.check(pedidos_do_simulador() == [], "o simulador responde")
        finally:
            descer_local(procs)
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W1 — E2E de servidor da InfinitePay (staging)")
    ap.add_argument("--local", action="store_true", help="as 2 funções no Deno local + o simulador (o caminho da baixa)")
    ap.add_argument("--casos", default=None, help="lista separada por vírgula (padrão: todos do modo)")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true")
    modo.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    CTX["local"] = a.local
    todos = CASOS_LOCAL if a.local else CASOS_STAGING
    casos = [c.strip() for c in (a.casos or ",".join(todos)).split(",") if c.strip()]
    if any(c not in todos for c in casos):
        ap.error(f"casos deste modo: {', '.join(todos)}")
    carregar_base()
    CTX["tag"] = tag_de_teste()
    if not B.saude_treino():
        print("   o banco do Treino não está saudável — parar (regra de 10/10)")
        return 2
    if a.seco:
        return seco(casos)
    pendente = json.loads(ESTADO_ARQ.read_text(encoding="utf-8")) if ESTADO_ARQ.exists() else None
    if pendente:
        print(f"   a rodada anterior não terminou ({ESTADO_ARQ}): desfazendo antes", flush=True)
        desfazer(pendente)
        if ESTADO_ARQ.exists():
            return p.fim()
    if a.limpar:
        return p.fim()
    procs = subir_local() if a.local else []
    try:
        preparar()
        for nome in casos:
            if not a.local and nome in PRECISAM_DA_TAG and not CTX.get("tag"):
                p.check(False, f"[{nome}] falta a InfiniteTag de teste (~/{ARQ_TAG.name} — está no cofre) — pulei")
                continue
            try:
                FUNCOES[nome]()
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {e!r}"[:400])
    finally:
        if CTX.get("estado"):
            desfazer(CTX["estado"])
        descer_local(procs)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Rodar o seco (nada é gravado) e commit**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P python3 e2e/w1/api.py --seco --local
DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check e2e/w1/servir_local.ts
```
Expected: os logins ✅, "a W1 no staging" ✅ (as Tasks 5 e 6 aplicaram), o deno ✅, os 3 processos sobem, respondem e descem
(`ignorado_metodo`, OPTIONS 200, simulador vazio). (O seco do padrão — as funções publicadas — fica para a Task 12.)
```bash
git add e2e/w1/simulador_ip.py e2e/w1/servir_local.ts e2e/w1/api.py
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w1): E2E de servidor da InfinitePay — API de verdade (sem cobrar) e a baixa no Deno local com o simulador" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/w1/simulador_ip.py e2e/w1/servir_local.ts e2e/w1/api.py
```

---

### Task 12: Staging do servidor — publicar as 2 funções e provar (API real + simulador)

**Files:** `docs/e2e-rodadas.md` (as linhas da rodada — no PR)
**Estimativa:** 40 a 60 min (pior cenário 95 min)

> Publicar a `pagamentos-aluno` e a `infinitepay-webhook-aluno` vale para o `public` e o `staging` ao mesmo tempo. No `public` (sem a
> migration) a parte nova fica desligada: `schemaTemW1` = false → colunas de antes, ações novas com 409 `w1_indisponivel`, webhook
> 400 `schema_sem_w1` (MENOR 4: a InfinitePay reenviaria). O modo "até o fim" cobre a publicação (o G0 do mestre); o horário vai para a LINUX 1.

- [ ] **Step 1: Trava e o teste contra a função ANTIGA**

Pegar "🔒 BANCO do staging" com o "pode ir" da LINUX 1 (`SendMessage`; com E2E dela rodando, esperar) e marcar no quadro.
Run: `python3 e2e/w1/api.py --casos recebimento`
Expected: FAIL (`prof_recebimento` → 400 `acao_invalida` na função publicada de antes). O desfazer roda e confere a foto.

- [ ] **Step 2: Publicar**

```bash
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions infinitepay-webhook-aluno false
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions pagamentos-aluno true
```
Expected: `função nova: infinitepay-webhook-aluno` → `verify_jwt/versão/status = false 1 ACTIVE`; `pagamentos-aluno` → `true <v+1> ACTIVE`.
Anotar as versões e o horário (para a LINUX 1 e o PR) e o sha publicado: `git rev-parse --short HEAD` (a Task 20 compara com ele).

- [ ] **Step 3: Smoke só leitura no `public` logo depois de publicar (a parte nova desligada lá)**

```bash
python3 e2e/w10/api.py
python3 e2e/w06/smoke_prod.py
python3 - <<'PY'
import json, uuid, urllib.error, urllib.request
req = urllib.request.Request("https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/infinitepay-webhook-aluno?schema=public",
    data=json.dumps({"order_nsu": f"{uuid.uuid4()}-1", "transaction_nsu": "x"}).encode(), headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req, timeout=20)
    print(r.status, json.loads(r.read()))
except urllib.error.HTTPError as e:   # o 400 do schema sem a W1
    print(e.code, json.loads(e.read()))
PY
```
Expected: `w10/api.py` e `w06/smoke_prod.py` com os placares de sempre (os 2 ❌ antigos e conhecidos do `smoke_prod`, nada novo); o webhook
no `public` → `400 {"ok": false, "resultado": "schema_sem_w1", …}` (MENOR 4: sem a W1, o schema certo responde 400 — a InfinitePay
reenviaria; o pedido `<uuid>-1` passa pelo formato do I4 antes). Algo novo caiu → republicar a versão da `origin/main` (worktree temporária
`git worktree add <scratchpad>/main origin/main` e publicar de lá; nunca `git stash`) e investigar.

- [ ] **Step 4: Os E2E de servidor no staging, um por vez (a guarda de /health em cada um)**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P python3 e2e/w1/api.py --seco
flock $P python3 e2e/w1/api.py
flock $P python3 e2e/w1/api.py --local
flock $P python3 e2e/w1/sql_w1.py
flock $P python3 e2e/wp/api.py --casos planos,periodo,mensal
flock $P python3 e2e/w06/api.py --casos pix,porfora,acesso
flock $P python3 e2e/hml01/banco.py --schema staging
```
Expected:
- `w1/api.py` (staging) todos ✅. A InfiniteTag de teste existe e o checkout externo dela está LIGADO (sondado 11/10), então os casos que
  criam link de verdade rodam. Cada link aparece na conta InfinitePay do Weslley: avisar no relatório.
- `w1/api.py --local` todos ✅ (os 11 casos, com a rodada do staging parada e devolvida).
- `sql_w1.py` 11/11; a W-P e o modo de hoje sem regressão; `hml01` 12/12.

Cada rodada termina com "tudo voltou à foto" (inclusive a rodada do pg_cron). Qualquer ❌ → `superpowers:systematic-debugging`.

- [ ] **Step 5: Soltar a trava, avisar e anotar**

Quadro: "🔒 BANCO do staging: livre" + `SendMessage` à LINUX 1 com as versões publicadas e o horário. As linhas novas do
`~/projetos/physiqcalc-scratch/e2e-rodadas.tsv` vão para o topo da tabela de `docs/e2e-rodadas.md` →
`git add docs/e2e-rodadas.md && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w1): rodadas do servidor no staging (API de verdade e simulador local)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/e2e-rodadas.md`.

---
### Task 13: Painel — as peças comuns da tela e Configurações › Recebimento pela função (jeito 2) + InfinitePay

**Files:**
- Create: `src/financeiro/abrirPagamento.ts` + `src/financeiro/abrirPagamento.test.ts`
- Modify: `src/financeiro/tipos.ts`, `src/financeiro/api.ts`, `src/financeiro/regras.ts` (+ `src/financeiro/regras.test.ts`)
- Modify: `src/painel/configuracoes/Recebimento.tsx` (+ `Recebimento.test.tsx`, reescrito), `src/components/admin/RecebimentosLista.tsx`,
  `src/components/admin/RecebimentoPixDialog.tsx` (+ `src/components/admin/RecebimentosLista.test.tsx`, novo)

**Estimativa:** 50 a 70 min (pior cenário 100 min). As peças comuns (Steps 1–3) vêm ANTES das Tasks 14, 15 e 16 (que rodam juntas depois).

- [ ] **Step 1: Os testes das regras e do abrir a página (falham)**

No fim de `src/financeiro/regras.test.ts` (acrescentar ao import de `./regras`: `CHIP_COBRANCA`, `MENSAGEM_ERRO_FINANCEIRO`, `formasDePagar`,
`linhaDaCobranca`, `podePagarPeloApp`, `rotuloDaForma`, `situacaoDaCobranca` — os que ainda não estiverem):
```ts
describe("W1 — a InfinitePay nas regras da tela", () => {
  const cob = (x: Partial<CobrancaVista> = {}): CobrancaVista => ({
    id: "c1", paciente_id: "p1", tipo: "mensalidade", descricao: "Mensalidade · Outubro/2026", valor: 100, vencimento: "2026-10-10", status: "aberta",
    forma: null, metodo: null, mes_ref: "2026-10-01", pago_em: null, enviado_em: null, cobre_de: null, cobre_ate: null, comprovante: false,
    comprovante_pdf: false, recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false, mp_simulado: false,
    transacao_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null, criado_por: null, confirmado_em: null, created_at: "2026-10-10T12:00:00Z", ...x,
  });
  it("o aluno paga pelo app (Pix ou cartão), sem chave Pix", () => {
    expect(podePagarPeloApp("infinitepay", false)).toBe(true);
    expect(formasDePagar("infinitepay", false)).toBe("Pix ou cartão");
  });
  it("o rótulo da forma: Pix, cartão em N× ou só InfinitePay", () => {
    expect(rotuloDaForma({ forma: "infinitepay", metodo: "pix", ip_meio: "pix" })).toBe("Pix (InfinitePay)");
    expect(rotuloDaForma({ forma: "infinitepay", metodo: "cartao", ip_meio: "credit_card", ip_parcelas: 3 })).toBe("Cartão em 3× (InfinitePay)");
    expect(rotuloDaForma({ forma: "infinitepay", metodo: "cartao", ip_meio: "credit_card", ip_parcelas: 1 })).toBe("Cartão (InfinitePay)");
    expect(rotuloDaForma({ forma: "infinitepay", metodo: null })).toBe("InfinitePay");
  });
  it("aguardando na InfinitePay: PROCESSANDO e o detalhe sem 'comprovante'", () => {
    const c = cob({ status: "aguardando_confirmacao", forma: "infinitepay" });
    expect(situacaoDaCobranca(c)).toBe("aguardando_ip");
    expect(CHIP_COBRANCA.aguardando_ip.texto).toBe("PROCESSANDO");
    expect(linhaDaCobranca(c).detalhe).toBe("InfinitePay · aguardando a confirmação");
  });
  it("as frases dos códigos novos", () => {
    for (const k of ["modo_nao_infinitepay", "infinitepay_nao_ligada", "infinitepay_indisponivel", "infinitepay_recusou",
                     "infinitepay_checkout_desligado", "infinitetag_invalida", "sem_infinitetag", "infinitepay_em_teste", "automaticas_ativas",
                     "mp_so_master", "w1_indisponivel", "chave_inexistente", "volta_invalida", "em_uso", "conta_invalida"]) {
      expect(MENSAGEM_ERRO_FINANCEIRO[k], k).toBeTruthy();
    }
  });
});
```
Novo `src/financeiro/abrirPagamento.test.ts`:
```ts
// Physiq W1 — abrir a página da InfinitePay: APK por cima do app (Browser); site numa aba reservada NO TOQUE (o navegador bloqueia janela
// aberta depois de um await) ou, bloqueada, na mesma aba; nada fora do domínio da InfinitePay.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ nativo: false, abrir: vi.fn(), fechar: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: (...a: unknown[]) => h.abrir(...a), close: () => h.fechar() } }));

import { abrirLinkExterno, abrirPagina, fecharPagina, reservarAba } from "./abrirPagamento";

const URL_IP = "https://checkout.infinitepay.com.br/fulano?lenc=x";

beforeEach(() => {
  h.nativo = false;
  h.abrir.mockReset();
  h.fechar.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

describe("abrir a página da InfinitePay", () => {
  it("site: reserva a aba no toque (sem opener) e leva ao link quando ele chega", async () => {
    const janela = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
    const aba = reservarAba();
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(janela.opener).toBeNull();
    expect(await abrirPagina(URL_IP, aba)).toBe("aba");
    expect(janela.location.href).toBe(URL_IP);
  });
  it("site com a aba bloqueada: a mesma aba (a volta traz o aluno a Pagamentos com a conferência)", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const ir = vi.fn();
    expect(reservarAba()).toBeNull();
    expect(await abrirPagina(URL_IP, null, ir)).toBe("mesma_aba");
    expect(ir).toHaveBeenCalledWith(URL_IP);
  });
  it("APK: por cima do app (Browser), sem aba; fecharPagina fecha o Browser", async () => {
    h.nativo = true;
    const open = vi.spyOn(window, "open");
    expect(reservarAba()).toBeNull();
    expect(await abrirPagina(URL_IP, null)).toBe("app");
    expect(h.abrir).toHaveBeenCalledWith({ url: URL_IP });
    expect(open).not.toHaveBeenCalled();
    await fecharPagina();
    expect(h.fechar).toHaveBeenCalled();
  });
  it("nada fora da InfinitePay (a página e o recibo)", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const fechar = vi.fn();
    expect(await abrirPagina("https://golpe.com/x", { ir: vi.fn(), fechar })).toBe("recusado");
    expect(fechar).toHaveBeenCalled();
    await abrirLinkExterno("https://golpe.com/r");
    expect(open).not.toHaveBeenCalled();
    await abrirLinkExterno("https://recibo.infinitepay.io/r");
    expect(open).toHaveBeenCalledWith("https://recibo.infinitepay.io/r", "_blank", "noopener,noreferrer");
  });
});
```
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro/regras.test.ts src/financeiro/abrirPagamento.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementar as peças comuns**

`src/financeiro/tipos.ts`:
```ts
import type { PixTipo } from "@/lib/pixChave";
export type FormaCobranca = "pix_manual" | "mp" | "manual" | "infinitepay";
export type ModoRecebimento = "pix_manual" | "nenhum" | "mercadopago" | "infinitepay";
```
No `interface CobrancaVista`, depois de `created_at: string;`:
```ts
  /** W1 — a InfinitePay: o link da tentativa viva (só aguardando), o prazo (72 h), o recibo, as parcelas e o meio (ausentes na função de antes) */
  ip_link?: string | null;
  ip_expira_em?: string | null;
  ip_recibo_url?: string | null;
  ip_parcelas?: number | null;
  ip_meio?: "pix" | "credit_card" | null;
```
E no fim do arquivo:
```ts
/** W1 — uma chave Pix da conta (prof_recebimento, prof_chave_salvar). */
export interface ChaveRecebimento {
  id: string;
  conta_id: string;
  membro_id: string | null;
  tipo: PixTipo;
  chave: string;
  favorecido: string | null;
  banco: string | null;
  ativa: boolean;
  criado_em: string;
}

/** W1 — Configurações › Recebimento numa chamada (prof_recebimento / prof_recebimento_salvar). */
export interface RecebimentoDaConta {
  ok: true;
  master: boolean;
  pode_editar: boolean;
  conta: { id: string; nome: string; origem: string; modo: ModoRecebimento; bloquear: boolean };
  chaves: ChaveRecebimento[];
  mp_liberado: boolean;
  infinitepay: { disponivel: boolean; handle: string | null; status: "ativa" | "erro" | null; testado_em: string | null };
  /** só no salvar: o link de R$ 1,00 da InfiniteTag nova, quantas automáticas do MP foram desligadas e quantas o MP recusou (MENOR 6) */
  link_teste?: string | null;
  automaticas_canceladas?: number;
  automaticas_falhas?: number;
}
```
`src/financeiro/api.ts` (no fim; acrescentar `ChaveRecebimento`, `CobrancaVista`, `ModoRecebimento`, `RecebimentoDaConta` ao import de tipos e
`import type { PixTipo } from "@/lib/pixChave";`):
```ts
// ───────────────────────── W1 — Recebimento pela função (jeito 2) e a InfinitePay ─────────────────────────
// A tela não fala mais com o banco: tudo pela pagamentos-aluno, que grava COMO A PESSOA (o RLS segue valendo).

export const buscarRecebimento = (contaId: string) => acaoFinanceiro<RecebimentoDaConta>("prof_recebimento", { conta_id: contaId });
export const salvarRecebimento = (contaId: string, p: { modo?: ModoRecebimento; bloquear?: boolean; handle?: string | null; cancelar_automaticas?: boolean }) =>
  acaoFinanceiro<RecebimentoDaConta>("prof_recebimento_salvar", { conta_id: contaId, ...p });
export const testarInfinitePay = (contaId: string, handle?: string) =>
  acaoFinanceiro<{ ok: true; url: string }>("prof_ip_testar", { conta_id: contaId, ...(handle ? { handle } : {}) });
export const salvarChavePix = (contaId: string, c: { id?: string; tipo: PixTipo; chave: string; favorecido: string | null; banco: string | null }) =>
  acaoFinanceiro<{ ok: true; chave: ChaveRecebimento }>("prof_chave_salvar", { conta_id: contaId, ...c });
export const ligarChavePix = (contaId: string, id: string, ligar: boolean) => acaoFinanceiro<{ ok: true }>("prof_chave_ligar", { conta_id: contaId, id, ligar });
export const excluirChavePix = (contaId: string, id: string) => acaoFinanceiro<{ ok: true }>("prof_chave_excluir", { conta_id: contaId, id });

/** O aluno: o link da página da InfinitePay (o mesmo enquanto a tentativa vale), a volta da página e a conferência. */
export const abrirLinkDaInfinitePay = (pacienteId: string, cobrancaId?: string) =>
  acaoFinanceiro<{ ok: true; url: string; cobranca: CobrancaVista; reutilizado: boolean }>("aluno_ip_link",
    { paciente_id: pacienteId, ...(cobrancaId ? { cobranca_id: cobrancaId } : {}) });
export const voltaDaInfinitePay = (q: Record<string, string>) =>
  acaoFinanceiro<{ ok: true; paga: boolean; resultado: string; cobranca: CobrancaVista }>("aluno_ip_volta", q);
export const conferirInfinitePay = (cobrancaId: string) =>
  acaoFinanceiro<{ ok: true; paga: boolean; resultado: string; cobranca: CobrancaVista }>("aluno_ip_conferir", { cobranca_id: cobrancaId });
```
`src/financeiro/regras.ts`:
- `podePagarPeloApp`: `return modo === "mercadopago" || modo === "infinitepay" || (modo === "pix_manual" && temChave);`
- `formasDePagar`: a 1ª linha vira `if (modo === "mercadopago" || modo === "infinitepay") return "Pix ou cartão";`
- `rotuloDaForma(c: Pick<CobrancaVista, "forma" | "metodo" | "ip_meio" | "ip_parcelas">)`: antes do `if (c.forma === "manual")`:
```ts
  if (c.forma === "infinitepay") {
    const meio = c.ip_meio ?? (c.metodo === "pix" ? "pix" : c.metodo === "cartao" ? "credit_card" : null);
    if (meio === "pix") return "Pix (InfinitePay)";
    if (meio === "credit_card") return c.ip_parcelas && c.ip_parcelas > 1 ? `Cartão em ${c.ip_parcelas}× (InfinitePay)` : "Cartão (InfinitePay)";
    return "InfinitePay";
  }
```
- `SituacaoCobranca` ganha `"aguardando_ip"`; em `situacaoDaCobranca`: `if (c.status === "aguardando_confirmacao") return c.forma === "mp" ?
  "aguardando_mp" : c.forma === "infinitepay" ? "aguardando_ip" : "aguardando";`; em `CHIP_COBRANCA`: `aguardando_ip: { texto: "PROCESSANDO", tom: "c" },`;
  em `linhaDaCobranca`, depois do ramo `aguardando_mp`: `else if (s === "aguardando_ip") detalhe = "InfinitePay · aguardando a confirmação";`
- `MENSAGEM_ERRO_FINANCEIRO`, no fim:
```ts
  // W1 — a InfinitePay e o Recebimento pela função
  modo_nao_infinitepay: "Seu profissional não recebe pela InfinitePay.",
  infinitepay_nao_ligada: "Seu profissional ainda não terminou de ligar a InfinitePay.",
  infinitepay_indisponivel: "A InfinitePay não respondeu agora. Tente de novo em instantes.",
  infinitepay_recusou: "A InfinitePay não aceitou agora. Confira a InfiniteTag no app da InfinitePay e tente de novo.",
  // sondado em 11/10: a InfiniteTag que não existe e o checkout externo desligado dão a MESMA resposta. A frase diz as 2 coisas, e a tela
  // mostra junto o botão de ativar, com o link que a InfinitePay mandou
  infinitepay_checkout_desligado: "Confira a InfiniteTag e ative o checkout externo na InfinitePay.",
  infinitetag_invalida: "Essa InfiniteTag não parece certa: use só letras, números, ponto, traço ou _ (sem o $).",
  sem_infinitetag: "Cole a sua InfiniteTag e salve antes de escolher a InfinitePay.",
  infinitepay_em_teste: "A InfinitePay ainda está em teste. Logo ela aparece para você.",
  automaticas_ativas: "Há alunos com cobrança automática no cartão pelo Mercado Pago.",
  mp_so_master: "O Mercado Pago só é ligado pelo master.",
  w1_indisponivel: "A InfinitePay ainda não chegou a este ambiente.",
  chave_inexistente: "Essa chave não existe mais. Atualize a página.",
  volta_invalida: "Não deu para ler a volta da InfinitePay. Toque em Conferir pagamento.",
  em_uso: "Troque a forma de receber antes de tirar a InfiniteTag.",
  conta_invalida: "Conta não encontrada.",
```
Novo `src/financeiro/abrirPagamento.ts`:
```ts
// Physiq W1 — abrir a página de pagamento da InfinitePay (e o recibo dela). APK: por cima do app (@capacitor/browser — o Custom Tab; a volta
// é o App Link /perfil da produção ou o "fechou a página"). Site: uma aba nova RESERVADA NO TOQUE (o navegador bloqueia janela aberta
// depois de um await) e levada ao link quando ele chega; bloqueada → a mesma aba (a volta traz o aluno a Pagamentos com a conferência).
// Só abre endereço da InfinitePay (urlDaInfinitePay — o mesmo filtro do servidor).
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { urlDaInfinitePay } from "./infinitepay";

export interface Aba {
  ir(url: string): void;
  fechar(): void;
}

export function reservarAba(): Aba | null {
  if (Capacitor.isNativePlatform()) return null;
  const w = window.open("about:blank", "_blank");
  if (!w) return null;
  try {
    w.opener = null;
  } catch {
    /* noop */
  }
  return {
    ir: (url) => {
      w.location.href = url;
    },
    fechar: () => {
      try {
        w.close();
      } catch {
        /* noop */
      }
    },
  };
}

export async function abrirPagina(url: string, aba: Aba | null, irNaMesmaAba: (u: string) => void = (u) => window.location.assign(u)):
  Promise<"app" | "aba" | "mesma_aba" | "recusado"> {
  const seguro = urlDaInfinitePay(url);
  if (!seguro) {
    aba?.fechar();
    return "recusado";
  }
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: seguro });
    return "app";
  }
  if (aba) {
    aba.ir(seguro);
    return "aba";
  }
  irNaMesmaAba(seguro);
  return "mesma_aba";
}

/** A volta chegou (App Link): fecha a página por cima do app, se ainda estiver aberta. */
export async function fecharPagina(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Browser.close();
  } catch {
    /* já fechada */
  }
}

export async function abrirLinkExterno(url: string | null | undefined): Promise<void> {
  const seguro = urlDaInfinitePay(url);
  if (!seguro) return;
  if (Capacitor.isNativePlatform()) await Browser.open({ url: seguro });
  else window.open(seguro, "_blank", "noopener,noreferrer");
}
```
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/financeiro && flock $P npm run tipos` → Expected: PASS (o `pdf.ts` usa o
`CHIP_COBRANCA[situacao]` e continua tipado com a chave nova).
```bash
git add src/financeiro/tipos.ts src/financeiro/api.ts src/financeiro/regras.ts src/financeiro/regras.test.ts src/financeiro/abrirPagamento.ts src/financeiro/abrirPagamento.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): peças da tela — modo e forma InfinitePay, chamadas novas, rótulos, frases e abrir a página por cima do app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/financeiro/tipos.ts src/financeiro/api.ts src/financeiro/regras.ts src/financeiro/regras.test.ts src/financeiro/abrirPagamento.ts src/financeiro/abrirPagamento.test.ts
```

- [ ] **Step 3: Os testes da tela de Recebimento (falham)** — reescrever `src/painel/configuracoes/Recebimento.test.tsx` (os 2 casos da
hml-17 continuam; o `principal` falso agora explode se for usado — a prova do jeito 2 na tela):

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import type { RecebimentoDaConta } from "@/financeiro/tipos";

// hml-17 (H-39) + W1: Configurações › Recebimento — os comprovantes aguardando (a leitura que falha mostra o aviso e "—"); o jeito 2 (a
// tela lê e grava pela função — o cliente do banco falso explode se for usado); a InfinitePay (a opção só com a flag, a InfiniteTag sem o
// $, o Testar abrindo a aba reservada no toque); sair do MP com automática pede o OK (useConfirmar); o bloqueio do inadimplente.
const h = vi.hoisted(() => ({ resumo: vi.fn(), ler: vi.fn(), salvar: vi.fn(), testar: vi.fn(), abrir: vi.fn(), externo: vi.fn(), aba: { ir: vi.fn(), fechar: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: { id: "c1", nome: "Consultoria Teste", membro_id: "m1" }, situacao: { master: false } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarResumoDaConta: (c: string) => h.resumo(c),
  buscarRecebimento: (c: string) => h.ler(c),
  salvarRecebimento: (...a: unknown[]) => h.salvar(...a),
  testarInfinitePay: (...a: unknown[]) => h.testar(...a),
}));
vi.mock("@/financeiro/abrirPagamento", () => ({
  reservarAba: () => h.aba, abrirPagina: (...a: unknown[]) => h.abrir(...a), abrirLinkExterno: (...a: unknown[]) => h.externo(...a),
}));
vi.mock("@/components/admin/RecebimentosLista", () => ({ default: () => <div data-testid="chaves-pix" /> }));
vi.mock("@/components/admin/ComprovantePixCard", () => ({ default: ({ item }: { item: { id: string } }) => <div data-comprovante={item.id}>comprovante {item.id}</div> }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principal: { from: () => { throw new Error("a tela de Recebimento não fala mais com o banco (jeito 2)"); } },
}));

import { ErroFinanceiro } from "@/financeiro/api";
import Recebimento from "./Recebimento";

const REC = (x: Partial<RecebimentoDaConta> = {}, ip: Partial<RecebimentoDaConta["infinitepay"]> = {}): RecebimentoDaConta => ({
  ok: true, master: false, pode_editar: true, conta: { id: "c1", nome: "Consultoria Teste", origem: "nova", modo: "pix_manual", bloquear: false },
  chaves: [], mp_liberado: false, infinitepay: { disponivel: true, handle: null, status: null, testado_em: null, ...ip }, ...x,
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false}>
          <Recebimento />
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const contador = () => document.querySelector("[data-recebimento-pendentes-contador]")?.textContent;
const PENDENTE = { id: "p1", aluno: { nome: "Aluno Teste", paciente_id: "a1", treino_user_id: null } };

beforeEach(() => {
  for (const f of [h.resumo, h.ler, h.salvar, h.testar, h.abrir, h.externo, h.aba.ir, h.aba.fechar]) f.mockReset();
  h.resumo.mockResolvedValue({ pendentes: [] });
  h.ler.mockResolvedValue(REC());
  h.salvar.mockImplementation(async (_c: string, p: { modo?: string }) => REC({ conta: { ...REC().conta, modo: (p.modo as never) ?? "pix_manual" } }));
});

describe("Configurações › Recebimento — os comprovantes aguardando (hml-17)", () => {
  it("a leitura falha → o aviso com Tentar de novo e o contador \"—\"; tocar refaz", async () => {
    h.resumo.mockReset().mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-recebimento-pendentes-erro]")).not.toBeNull());
    expect(screen.queryByText("Nenhum comprovante aguardando.")).toBeNull();
    expect(contador()).toBe("—");
    h.resumo.mockResolvedValueOnce({ pendentes: [PENDENTE] });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("comprovante p1")).toBeInTheDocument();
    expect(contador()).toBe("1");
  });
  it("controle: nenhum comprovante → \"Nenhum comprovante aguardando.\" e 0", async () => {
    montar();
    expect(await screen.findByText("Nenhum comprovante aguardando.")).toBeInTheDocument();
    expect(contador()).toBe("0");
  });
});

describe("Configurações › Recebimento — W1 (jeito 2 e InfinitePay)", () => {
  it("lê pela função (o banco falso explode se for usado) e só mostra a InfinitePay com a flag ou já ligada", async () => {
    h.ler.mockResolvedValue(REC({}, { disponivel: false }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="pix_manual"]')).not.toBeNull());
    expect(h.ler).toHaveBeenCalledWith("c1");
    expect(document.querySelector('[data-opcao="infinitepay"]')).toBeNull();
  });
  it("InfinitePay: a InfiniteTag com $ vai sem ele; Testar reserva a aba no toque e abre o link", async () => {
    h.testar.mockResolvedValue({ ok: true, url: "https://checkout.infinitepay.com.br/fulano?lenc=t" });
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: " $Fulano " } });
    fireEvent.click(document.querySelector("[data-infinitepay-testar]")!);
    await waitFor(() => expect(h.abrir).toHaveBeenCalledWith("https://checkout.infinitepay.com.br/fulano?lenc=t", h.aba));
    expect(h.testar).toHaveBeenCalledWith("c1", "fulano");
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { modo: "infinitepay", handle: "fulano" }));
  });
  it("InfiniteTag ruim não sai da tela; a InfinitePay recusou → a frase embaixo do campo", async () => {
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_recusou"));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "ana personal" } });
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("sem o $");
    expect(h.salvar).not.toHaveBeenCalled();
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "ana.personal" } });
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("não aceitou"));
  });
  it("checkout externo desligado (ou a InfiniteTag que não existe — a API responde igual): a frase das 2 coisas e o botão de ativar", async () => {
    const ATIVAR = "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true";
    h.testar.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_checkout_desligado", { ativar: ATIVAR }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "$fulano" } });
    fireEvent.click(document.querySelector("[data-infinitepay-testar]")!);
    await waitFor(() => expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("ative o checkout externo"));
    expect(h.aba.fechar).toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-infinitepay-ativar]")!);
    expect(h.externo).toHaveBeenCalledWith(ATIVAR);
  });
  it("sair do Mercado Pago com automática: pede o OK do app e manda cancelar_automaticas", async () => {
    h.ler.mockResolvedValue(REC({ mp_liberado: true, conta: { ...REC().conta, modo: "mercadopago" } }));
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("automaticas_ativas", { alunos: 2 }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="pix_manual"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="pix_manual"]')!);
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(document.body.textContent).toContain("2 alunos pagam");
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenLastCalledWith("c1", { modo: "pix_manual", cancelar_automaticas: true }));
  });
  it("o bloqueio do inadimplente grava pela função", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="sim"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="sim"]')!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { bloquear: true }));
  });
});
```
Novo `src/components/admin/RecebimentosLista.test.tsx`:
```tsx
// Physiq W1 (jeito 2): as chaves Pix pela função — salvar (normalizada pela tela e pelo servidor), ligar (1 só), excluir com a confirmação
// do app. A função é falsa; o cliente do banco explode se for usado.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import type { ChaveRecebimento } from "@/financeiro/tipos";

const h = vi.hoisted(() => ({ salvar: vi.fn(), ligar: vi.fn(), excluir: vi.fn(), mudou: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  salvarChavePix: (...a: unknown[]) => h.salvar(...a), ligarChavePix: (...a: unknown[]) => h.ligar(...a), excluirChavePix: (...a: unknown[]) => h.excluir(...a),
}));
vi.mock("@/integrations/principal/client", () => ({ principal: { from: () => { throw new Error("jeito 2: nada de banco na tela"); } } }));

import RecebimentosLista from "./RecebimentosLista";

const K1: ChaveRecebimento = { id: "k1", conta_id: "c1", membro_id: "m1", tipo: "email", chave: "ana@teste.com", favorecido: "Ana", banco: null, ativa: false, criado_em: "2026-10-01T00:00:00Z" };
const montar = (chaves: ChaveRecebimento[] = [K1]) =>
  render(<ProvedorConfirmar><RecebimentosLista contaId="c1" chaves={chaves} podeEditar aoMudar={h.mudou} /></ProvedorConfirmar>);

beforeEach(() => {
  for (const f of [h.salvar, h.ligar, h.excluir, h.mudou]) f.mockReset().mockResolvedValue({ ok: true, chave: { ...K1, id: "k2", ativa: true } });
});

describe("chaves Pix pela função (W1)", () => {
  it("adicionar: valida na tela, manda normalizada e avisa a tela para reler", async () => {
    montar([]);
    fireEvent.click(document.querySelector("[data-btn-adicionar-recebimento]")!);
    await waitFor(() => expect(document.querySelector("[data-pix-tipo]")).not.toBeNull());
    fireEvent.change(document.querySelector("[data-pix-tipo]")!, { target: { value: "email" } });
    fireEvent.change(document.querySelector("[data-pix-chave]")!, { target: { value: " Bia@Teste.com " } });
    fireEvent.click(document.querySelector("[data-btn-salvar-pix]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { tipo: "email", chave: "bia@teste.com", favorecido: null, banco: null }));
    await waitFor(() => expect(h.mudou).toHaveBeenCalled());
  });
  it("ligar pela função (o servidor desliga as outras)", async () => {
    montar();
    fireEvent.click(document.querySelector("[data-recebimento-switch]")!);
    await waitFor(() => expect(h.ligar).toHaveBeenCalledWith("c1", "k1", true));
  });
  it("excluir pede a confirmação do app e só então grava", async () => {
    montar();
    fireEvent.click(document.querySelector("[data-btn-excluir-recebimento]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.excluir).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.excluir).toHaveBeenCalledWith("c1", "k1"));
  });
});
```
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/painel/configuracoes/Recebimento.test.tsx src/components/admin/RecebimentosLista.test.tsx`
Expected: FAIL (a tela ainda lê `contas` pelo `principal`; a lista ainda grava direto).

- [ ] **Step 4: Implementar a tela**

`src/painel/configuracoes/Recebimento.tsx` — reescrever:
```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CreditCard, ExternalLink, Lock, QrCode, Save, Unlock, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useConta } from "@/nucleo/conta";
import RecebimentosLista from "@/components/admin/RecebimentosLista";
import ComprovantePixCard from "@/components/admin/ComprovantePixCard";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { abrirLinkExterno, abrirPagina, reservarAba } from "@/financeiro/abrirPagamento";
import { buscarRecebimento, buscarResumoDaConta, ErroFinanceiro, salvarRecebimento, testarInfinitePay } from "@/financeiro/api";
import { normalizarHandle } from "@/financeiro/infinitepay";
import { ROTULO_MODO } from "@/financeiro/recebimento";
import { mensagemErroFinanceiro } from "@/financeiro/regras";
import type { ModoRecebimento } from "@/financeiro/tipos";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { OpcoesPilula, SecaoForm, type OpcaoPilula } from "./pecas/Form";

const TAG_RUIM = "Cole a sua InfiniteTag sem o $ (só letras, números, ponto, traço ou _).";
const ERROS_DO_CAMPO = new Set(["infinitetag_invalida", "infinitepay_recusou", "infinitepay_checkout_desligado", "sem_infinitetag"]);

/**
 * Configurações › Recebimento (spec 4.6 — W6; C51, N-24, R15, R16, P13): como os alunos pagam — Pix na sua chave, InfinitePay (W1: a
 * InfiniteTag; "Testar" abre a sua página com R$ 1,00, sem cobrar), "não cobrar pelo app" ou Mercado Pago (só quando o master libera) — e
 * o "bloquear o app do aluno com pagamento vencido". Embaixo, os comprovantes aguardando a sua confirmação. Só o dono.
 * W1 (jeito 2, combinado com a hml-19): a tela NÃO fala mais com o banco — lê e grava pela pagamentos-aluno (prof_recebimento,
 * prof_recebimento_salvar, prof_ip_testar e, na lista, prof_chave_*), que grava como a pessoa (o RLS continua valendo).
 * hml-17 (H-39): a leitura dos comprovantes falhou → o aviso com "Tentar de novo" e o contador "—".
 */
export default function Recebimento() {
  const { conta } = useConta();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const chave = ["recebimento-conta", conta?.id] as const;
  const consulta = useQuery({ queryKey: chave, enabled: !!conta?.id, queryFn: () => buscarRecebimento(conta!.id) });
  const pendentes = useQuery({ queryKey: ["financeiro-resumo-conta", conta?.id], enabled: !!conta?.id, queryFn: () => buscarResumoDaConta(conta!.id) });
  const [modo, setModo] = useState<ModoRecebimento>("pix_manual");
  const [tag, setTag] = useState("");
  const [erroTag, setErroTag] = useState("");
  /** o link de ativar o checkout externo que a InfinitePay mandou (só com o erro infinitepay_checkout_desligado) */
  const [ativar, setAtivar] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    if (!consulta.data) return;
    setModo(consulta.data.conta.modo);
    setTag(consulta.data.infinitepay.handle ? `$${consulta.data.infinitepay.handle}` : "");
  }, [consulta.data]);

  if (!conta) {
    return <div data-config-aba="recebimento" data-estado-aba="vazio"><EstadoVazio titulo="Nenhuma conta ativa" texto="O recebimento aparece aqui quando você faz parte de uma conta de profissional." /></div>;
  }
  const r = consulta.data;
  const pendentesFalhou = pendentes.isError && !pendentes.data;
  const opcoes: OpcaoPilula<ModoRecebimento>[] = [
    { valor: "pix_manual", rotulo: "Pix na sua chave", dica: "O aluno paga pelo banco dele e anexa o comprovante; você confirma", icone: QrCode },
    ...(r && (r.infinitepay.disponivel || r.conta.modo === "infinitepay")
      ? [{ valor: "infinitepay" as const, rotulo: "InfinitePay", icone: Wallet,
           dica: "O aluno paga na página da InfinitePay (Pix ou cartão em até 12×) e a confirmação chega sozinha" }]
      : []),
    { valor: "nenhum", rotulo: "Não cobrar pelo app", dica: "Você cobra por fora e registra o pagamento no financeiro do aluno", icone: Ban },
    { valor: "mercadopago", rotulo: "Mercado Pago", dica: "Pix e cartão com confirmação automática", icone: CreditCard, desligada: !r?.mp_liberado,
      porque: "Só quando o master libera para a conta — fale com o suporte" },
  ];

  /** O erro embaixo do campo. O "checkout externo desligado" (ou a InfiniteTag que não existe — a InfinitePay responde igual) traz o
   *  link de ativar. */
  const erroDoCampo = (e: ErroFinanceiro) => {
    setErroTag(mensagemErroFinanceiro(e.codigo));
    setAtivar(e.codigo === "infinitepay_checkout_desligado" && typeof e.extra.ativar === "string" ? e.extra.ativar : null);
  };

  const salvar = async (pedido: Parameters<typeof salvarRecebimento>[1], ok: string): Promise<void> => {
    setSalvando(true);
    try {
      const res = await salvarRecebimento(conta.id, pedido);
      qc.setQueryData(chave, res);
      if (res.automaticas_falhas) toast.error(`${res.automaticas_falhas} cobrança(s) automática(s) não desligaram no Mercado Pago. Fale com o suporte.`);
      else toast.success(ok);
    } catch (e) {
      const codigo = e instanceof ErroFinanceiro ? e.codigo : null;
      if (codigo === "automaticas_ativas" && !pedido.cancelar_automaticas) {
        const n = Number((e as ErroFinanceiro).extra.alunos) || 0;
        const sim = await confirmar({
          titulo: "Desligar as cobranças automáticas?", rotuloConfirmar: "Trocar e desligar", rotuloCancelar: "Voltar", perigo: true,
          descricao: `${n === 1 ? "1 aluno paga" : `${n} alunos pagam`} no cartão todo mês pelo Mercado Pago. Trocar a forma de receber desliga essas cobranças e avisa cada aluno.`,
        });
        if (sim) {
          setSalvando(false);
          return salvar({ ...pedido, cancelar_automaticas: true }, ok);
        }
      } else if (codigo && ERROS_DO_CAMPO.has(codigo)) {
        erroDoCampo(e as ErroFinanceiro);
      } else {
        toast.error(mensagemErroFinanceiro(codigo, "Não deu para salvar agora. Confira a internet e tente de novo."));
      }
    } finally {
      setSalvando(false);
    }
  };

  const salvarForma = () => {
    if (modo === "infinitepay") {
      const h = normalizarHandle(tag);
      if (!h) return setErroTag(TAG_RUIM);
      return void salvar(h === r?.infinitepay.handle ? { modo } : { modo, handle: h }, "Pronto: seus alunos pagam pela InfinitePay.");
    }
    void salvar({ modo }, "Forma de recebimento salva.");
  };

  const testar = async () => {
    const h = normalizarHandle(tag);
    if (!h) return setErroTag(TAG_RUIM);
    const aba = reservarAba(); // no toque: o navegador não bloqueia
    setTestando(true);
    try {
      const { url } = await testarInfinitePay(conta.id, h);
      await abrirPagina(url, aba);
    } catch (e) {
      aba?.fechar();
      const codigo = e instanceof ErroFinanceiro ? e.codigo : null;
      if (codigo && ERROS_DO_CAMPO.has(codigo)) erroDoCampo(e as ErroFinanceiro);
      else toast.error(mensagemErroFinanceiro(codigo, "Não deu para testar agora. Tente de novo."));
    } finally {
      setTestando(false);
    }
  };

  const tagMudou = modo === "infinitepay" && normalizarHandle(tag) !== r?.infinitepay.handle;
  return (
    <div data-config-aba="recebimento" className="flex flex-col gap-3.5">
      <TopoPagina titulo="Recebimento" subtitulo={`${conta.nome} · como os alunos pagam`} />
      {consulta.isLoading ? (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2"><Esqueleto className="h-[260px] rounded-[22px]" /><Esqueleto className="h-[260px] rounded-[22px]" /></div>
      ) : !r ? (
        <EstadoErro titulo="Não deu para carregar o recebimento" aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          <SecaoForm brilho titulo="Como seus alunos pagam" marca="recebimento-modo"
            extra={<Chip tom={r.conta.modo === "nenhum" ? "g" : r.conta.modo === "pix_manual" ? "n" : "c"}>{ROTULO_MODO[r.conta.modo]}</Chip>}
            descricao="Vale para todos os alunos da conta, na tela Pagamentos do app.">
            <div className="flex flex-col gap-4">
              <OpcoesPilula nome="recebimento-modo" rotulo="Forma" colunas={1} opcoes={opcoes} valores={[modo]}
                aoMudar={(v) => { setModo(v[0] ?? modo); setErroTag(""); setAtivar(null); }} />
              {modo === "infinitepay" && (
                <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-recebimento-infinitepay>
                  <Campo rotulo="Sua InfiniteTag" value={tag} placeholder="$seunome" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    onChange={(e) => { setTag(e.target.value); setErroTag(""); setAtivar(null); }} data-infinitetag />
                  <p className="text-[12px] text-texto-2">É o nome da sua conta no app da InfinitePay (começa com $). O dinheiro cai direto lá, sem taxa do Physiq.</p>
                  {erroTag && <MensagemForm data-infinitetag-erro>{erroTag}</MensagemForm>}
                  {ativar && (
                    <Botao variante="g" icone={ExternalLink} className="self-start" onClick={() => void abrirLinkExterno(ativar)} data-infinitepay-ativar>
                      Ativar o checkout externo na InfinitePay
                    </Botao>
                  )}
                  <Botao variante="g" icone={ExternalLink} className="self-start" disabled={testando} onClick={() => void testar()} data-infinitepay-testar>
                    {testando ? "Abrindo…" : "Testar (abre a sua página, sem cobrar)"}
                  </Botao>
                </div>
              )}
              {r.conta.modo === "mercadopago" && modo !== "mercadopago" && !r.master && (
                <p className="text-[12px] text-ambar-3">Saindo do Mercado Pago, voltar a ele depende do master.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
                <Botao variante="w" icone={Save} disabled={salvando || !r.pode_editar || (modo === r.conta.modo && !tagMudou)} onClick={salvarForma}
                  data-recebimento-salvar-modo>
                  {salvando ? "Salvando…" : "Salvar a forma"}
                </Botao>
              </div>
            </div>
          </SecaoForm>

          <div className="flex flex-col gap-3.5">
            <SecaoForm titulo="Chaves Pix" marca="recebimento-chaves" descricao="Só uma fica ligada por vez — é ela que o aluno vê.">
              <RecebimentosLista contaId={conta.id} chaves={r.chaves} podeEditar={r.pode_editar} aoMudar={() => void qc.invalidateQueries({ queryKey: chave })} />
            </SecaoForm>
            <SecaoForm titulo="Aluno com pagamento vencido" marca="recebimento-bloqueio"
              extra={<Chip tom={r.conta.bloquear ? "a" : "g"} icone={r.conta.bloquear ? Lock : Unlock}>{r.conta.bloquear ? "BLOQUEIA" : "SÓ AVISA"}</Chip>}
              descricao="Bloqueado, o app do aluno fecha e só Pagamentos abre, até ele pagar. Desligado, ele só recebe o aviso no topo do app.">
              <OpcoesPilula nome="recebimento-bloqueio" rotulo="Mensalidade ou cobrança vencida" colunas={1}
                opcoes={[
                  { valor: "nao", rotulo: "Só avisar o aluno", dica: "A faixa do topo fica vermelha; o app continua", icone: Unlock },
                  { valor: "sim", rotulo: "Bloquear o app do aluno", dica: "Só a tela Pagamentos abre até ele pagar", icone: Lock },
                ]}
                valores={[r.conta.bloquear ? "sim" : "nao"]}
                aoMudar={(v) => {
                  const novo = v[0] === "sim";
                  if (novo !== r.conta.bloquear) void salvar({ bloquear: novo }, novo ? "Bloqueio do inadimplente ligado." : "Bloqueio do inadimplente desligado.");
                }} />
            </SecaoForm>
          </div>
        </div>
      )}
      {/* "Comprovantes aguardando a sua confirmação": o bloco de hoje, sem mudança (linhas 139–166 da versão anterior) */}
    </div>
  );
}
```
(O bloco dos comprovantes, de `<SecaoForm titulo="Comprovantes aguardando a sua confirmação"` até o `</SecaoForm>` dele, fica exatamente como está.)

`src/components/admin/RecebimentosLista.tsx` — props novas e as gravações pela função:
```tsx
interface Props {
  contaId: string;
  chaves: ChaveRecebimento[];
  podeEditar: boolean;
  /** a tela relê o prof_recebimento (W1: a lista não lê mais o banco) */
  aoMudar: () => void;
}
```
Tirar o `useEffect`/`carregar`/`carregando`/`erro` (quem lê é a tela). `alternar` → `await ligarChavePix(contaId, c.id, ligar)` (o servidor desliga as
outras numa transação) e `excluir` → `await excluirChavePix(contaId, c.id)`, as 2 em `try/catch` com
`toast.error(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null, "Não deu para mudar a chave agora."))` e `aoMudar()` no
`finally`. O `import { principal } …` sai. O diálogo: `<RecebimentoPixDialog aberto={…} item={…} contaId={contaId} onFechar={…} onSalvo={aoMudar} />`.
O comentário do topo: "W1 (jeito 2): as gravações vão pela pagamentos-aluno (prof_chave_salvar/ligar/excluir), como a pessoa".

`src/components/admin/RecebimentoPixDialog.tsx` — sem `membroId` nem `ativarAoCriar` (o servidor decide quem cadastrou e se nasce ligada);
`ChaveRecebimento` passa a vir de `@/financeiro/tipos` (reexportar: `export type { ChaveRecebimento } from "@/financeiro/tipos";`) e o
`COLUNAS_CHAVE` sai daqui (mora no `_shared/pix-chave-regras.ts`). O `salvar`:
```tsx
    setSalvando(true);
    try {
      const r = await salvarChavePix(contaId, { ...(item ? { id: item.id } : {}), ...dados });
      toast.success(item ? "Chave atualizada." : r.chave.ativa ? "Chave salva e ligada." : "Chave salva.");
      onSalvo(r.chave);
      onFechar();
    } catch (e) {
      const erro = e instanceof ErroFinanceiro ? e : null;
      setErro(erro?.codigo === "chave_invalida" && typeof erro.extra.mensagem === "string" ? erro.extra.mensagem
        : mensagemErroFinanceiro(erro?.codigo ?? null, "Não deu para salvar a chave agora. Tente de novo."));
    } finally {
      setSalvando(false);
    }
```
(`dados` continua sendo montado com `validarChavePix`/`normalizarChavePix` na tela — a resposta na hora; o servidor valida de novo.)

- [ ] **Step 5: Rodar e commit**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/painel/configuracoes src/components/admin src/financeiro src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts
flock $P npm run tipos && flock $P npm run lint
```
Expected: PASS (o caso "o banco falso explode" passa porque a tela não usa mais o `principal`); `tsc` e lint limpos.
```bash
git add src/painel/configuracoes/Recebimento.tsx src/painel/configuracoes/Recebimento.test.tsx src/components/admin/RecebimentosLista.tsx src/components/admin/RecebimentosLista.test.tsx src/components/admin/RecebimentoPixDialog.tsx
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): Configurações › Recebimento pela função (jeito 2) e a InfinitePay — InfiniteTag, Testar, chaves Pix e bloqueio" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/painel/configuracoes/Recebimento.tsx src/painel/configuracoes/Recebimento.test.tsx src/components/admin/RecebimentosLista.tsx src/components/admin/RecebimentosLista.test.tsx src/components/admin/RecebimentoPixDialog.tsx
```

---

### Task 14: Painel — master Integrações (vê a InfinitePay e desliga)

**Files:**
- Modify: `src/master/regras.ts` (`ROTULO_RECEBIMENTO`), `src/master/tipos.ts` (`recebimento_modo`, `infinitepay`), `src/master/paginas/Integracoes.tsx`
- Test: `src/master/paginas/Integracoes.test.tsx` (novo), `src/master/regras.test.ts` (acrescentar)

**Estimativa:** 15 a 25 min (pior cenário 40 min)

- [ ] **Step 1: Os testes que falham**

Em `src/master/regras.test.ts`:
```ts
it("W1: o rótulo da InfinitePay", () => {
  expect(ROTULO_RECEBIMENTO.infinitepay).toBe("InfinitePay");
});
```
Novo `src/master/paginas/Integracoes.test.tsx`:
```tsx
// Physiq W1 — master › Integrações: a conta na InfinitePay mostra a InfiniteTag; o master NÃO liga a InfinitePay (a opção só fica ativa
// na conta que já está nela — quem liga é o dono, com a InfiniteTag) e "Desligar" volta ao Pix manual (com chave ativa) ou a "não cobrar",
// com a confirmação do app (o desenho §4.1).
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ lista: vi.fn(), acao: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../api", async (orig) => ({ ...(await orig<typeof import("../api")>()), integracoes: (n: number) => h.lista(n), acaoConta: (...a: unknown[]) => h.acao(...a) }));

import Integracoes from "./Integracoes";

const conta = (x: Record<string, unknown>) => ({ id: "c1", nome: "Rafael Lima", origem: "nova", alunos_ativos: 3, chave_pix: null, bloquear_app_inadimplente: false,
  recebimento_modo: "pix_manual", infinitepay: null, ...x });
const montar = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ProvedorConfirmar><MemoryRouter useTransitions={false}><Integracoes /></MemoryRouter></ProvedorConfirmar>
  </QueryClientProvider>,
);

beforeEach(() => {
  h.lista.mockReset();
  h.acao.mockReset().mockResolvedValue({ ok: true });
});

describe("master › Integrações — W1", () => {
  it("a conta na InfinitePay mostra a InfiniteTag; nas outras a opção InfinitePay fica desligada", async () => {
    h.lista.mockResolvedValue({ ok: true, total: 2, resumo: { infinitepay: 1 }, contas: [
      conta({ id: "c1", recebimento_modo: "infinitepay", infinitepay: { handle: "rafael.treinos", status: "ativa", testado_em: null } }),
      conta({ id: "c2", nome: "Outra", recebimento_modo: "pix_manual" })] });
    montar();
    await waitFor(() => expect(document.querySelector('[data-infinitetag-da-conta="c1"]')?.textContent).toContain("$rafael.treinos"));
    expect((document.querySelector('[data-recebimento="Outra"] option[value="infinitepay"]') as HTMLOptionElement).disabled).toBe(true);
    expect((document.querySelector('[data-recebimento="Rafael Lima"] option[value="infinitepay"]') as HTMLOptionElement).disabled).toBe(false);
  });
  it("Desligar: confirmação do app → Pix manual (tem chave) ou 'não cobrar' (sem chave)", async () => {
    h.lista.mockResolvedValue({ ok: true, total: 1, resumo: {}, contas: [conta({ recebimento_modo: "infinitepay", infinitepay: { handle: "rafael", status: "ativa", testado_em: null } })] });
    montar();
    await waitFor(() => expect(document.querySelector('[data-desligar-infinitepay="c1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-desligar-infinitepay="c1"]')!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.acao).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("c1", "recebimento", { modo: "nenhum" }));
  });
});
```
Run → Expected: FAIL.

- [ ] **Step 2: Implementar**

- `src/master/regras.ts`: `ROTULO_RECEBIMENTO` ganha `infinitepay: "InfinitePay"` (o `DetalheConta.tsx` passa a mostrar sozinho).
- `src/master/tipos.ts`: `recebimento_modo: "pix_manual" | "nenhum" | "mercadopago" | "infinitepay";` e, na `ContaLinha`,
  `/** W1: a InfinitePay da conta (a InfiniteTag) — pode não vir (servidor antigo) */ infinitepay?: { handle: string | null; status: string | null; testado_em: string | null } | null;`
- `src/master/paginas/Integracoes.tsx`: `const confirmar = useConfirmar();`; a grade de KPI passa a `grid grid-cols-2 gap-3 xl:grid-cols-5` com
  `<Kpi icone={Wallet} titulo="InfinitePay" valor={r.infinitepay ?? "…"} tom="ciano" detalhe="ligada pelo dono" />`; no `<select>`, cada opção
  `<option key={v} value={v} disabled={v === "infinitepay" && c.recebimento_modo !== "infinitepay"}>{t}</option>` (o master não liga — só o
  dono, com a InfiniteTag; a `master_conta_acao` já recusa) e, na mesma célula, quando `c.recebimento_modo === "infinitepay"`:
```tsx
  <span className="mt-1 flex items-center gap-2 text-[12px] text-texto-2">
    <span data-infinitetag-da-conta={c.id}>{c.infinitepay?.handle ? `$${c.infinitepay.handle}` : "sem InfiniteTag"}</span>
    <button type="button" className="font-semibold text-rosa-3" disabled={salvando === c.id} data-desligar-infinitepay={c.id}
      onClick={() => void confirmar({ titulo: `Desligar a InfinitePay de ${c.nome}?`, perigo: true, rotuloConfirmar: "Desligar", rotuloCancelar: "Voltar",
        descricao: c.chave_pix ? "Os alunos voltam a pagar por Pix na chave ligada." : "Sem chave Pix ligada: a conta passa a não cobrar pelo app." })
        .then((sim) => { if (sim) void mudar(c.id, c.chave_pix ? "pix_manual" : "nenhum"); })}>
      Desligar
    </button>
  </span>
```
  (O comentário do topo: "W1: a InfinitePay — o master vê a InfiniteTag e desliga; quem liga é o dono, em Configurações › Recebimento".)

- [ ] **Step 3: Rodar e commit**

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/master src/ui/tema/larguraCelular.test.ts && flock $P npm run tipos`
Expected: PASS.
```bash
git add src/master/regras.ts src/master/regras.test.ts src/master/tipos.ts src/master/paginas/Integracoes.tsx src/master/paginas/Integracoes.test.tsx
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): master › Integrações — a InfiniteTag de cada conta e o Desligar (volta ao Pix ou a não cobrar)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/master/regras.ts src/master/regras.test.ts src/master/tipos.ts src/master/paginas/Integracoes.tsx src/master/paginas/Integracoes.test.tsx
```

---

### Task 15: Painel — os rótulos da P-B, o recibo da InfinitePay e a trava do painel

**Files:**
- Modify: `src/painel/financeiro/PlanoDialog.tsx`, `src/painel/financeiro/Planos.tsx`, `src/financeiro/ui/PlanoDoAluno.tsx` (rótulo da modalidade)
- Modify: `src/financeiro/ui/FinanceiroDoAluno.tsx` (`MODO_TEXTO`, o recibo, "registrar por fora" na avulsa da InfinitePay)
- Modify: `src/painel/aluno/dados/regras.ts` (`resumoDaTrava` com a tentativa vencida — o espelho da `financeiro_do_aluno` da Task 5)
- Test: `src/painel/financeiro/Planos.test.tsx`, `src/financeiro/ui/FinanceiroDoAluno.test.tsx`, `src/painel/aluno/dados/regras.test.ts` (acrescentar)

**Estimativa:** 20 a 35 min (pior cenário 50 min)

- [ ] **Step 1: Os testes que falham**

Em `src/painel/financeiro/Planos.test.tsx` (o `resposta`/`montar` de lá):
```tsx
  it("W1 (P-B): conta na InfinitePay — 'Período todo (Pix ou cartão até 12×)' no lugar de à vista; o cartão parcelado desligado no novo plano", async () => {
    h.planos.mockResolvedValue(resposta({ modo: "infinitepay", modalidades_da_conta: ["avista", "mensal"] }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-plano-card="pl1"]')).not.toBeNull());
    expect(document.querySelector('[data-plano-card="pl1"]')!.textContent).toContain("Período todo (Pix ou cartão até 12×)");
    fireEvent.click(document.querySelector("[data-novo-plano]")!);
    await waitFor(() => expect(document.querySelector('[data-plano-modalidade="avista"]')).not.toBeNull());
    expect(document.querySelector('[data-plano-modalidade="avista"]')!.textContent).toContain("Período todo");
    expect((document.querySelector('[data-plano-modalidade="cartao_parcelado"]') as HTMLButtonElement).disabled).toBe(true);
  });
```
Em `src/financeiro/ui/FinanceiroDoAluno.test.tsx` (a fábrica de resposta de lá, com a conta em `infinitepay` e uma cobrança paga com recibo):
```tsx
  it("W1: a forma 'InfinitePay' na ficha e o recibo da InfinitePay na cobrança paga por lá", async () => {
    // conta.modo = "infinitepay"; cobrancas: [{ …, status: "paga", forma: "infinitepay", ip_meio: "pix", ip_recibo_url: "https://recibo.infinitepay.io/r1" }]
    // → o texto "InfinitePay (Pix e cartão, confirmação automática)", a linha "Pix (InfinitePay) · pago em …" e [data-acao="recibo-ip"]
  });
```
(escrever com a fábrica e o `montar` que o arquivo já tem — o mesmo molde dos casos de lá; o `abrirLinkExterno` mockado em
`@/financeiro/abrirPagamento` e o clique no `[data-acao="recibo-ip"]` chama com a url.)
Em `src/painel/aluno/dados/regras.test.ts`:
```ts
describe("W1 — a trava do painel com a tentativa da InfinitePay (espelho da financeiro_do_aluno)", () => {
  it("tentativa viva = aguardando; vencida = não, e a avulsa vencida volta às abertas", () => {
    const agora = new Date("2026-10-11T12:00:00Z");
    const base = /* o FinanceiroProfissional de teste do arquivo, com mensalidade e permissões de dono */ fp();
    const viva = { ...base, cobrancas: [cob({ tipo: "mensalidade", status: "aguardando_confirmacao", forma: "infinitepay", ip_expira_em: "2026-10-12T12:00:00Z" })] };
    expect(resumoDaTrava(viva, agora)!.aguardando).toBe(true);
    const vencida = { ...base, cobrancas: [cob({ tipo: "mensalidade", status: "aguardando_confirmacao", forma: "infinitepay", ip_expira_em: "2026-10-11T11:00:00Z" }),
      cob({ id: "a1", tipo: "avulsa", status: "aguardando_confirmacao", forma: "infinitepay", ip_expira_em: "2026-10-11T11:00:00Z" })] };
    const r = resumoDaTrava(vencida, agora)!;
    expect(r.aguardando).toBe(false);
    expect(r.abertas.map((a) => a.id)).toEqual(["a1"]);
    expect(r.aguardando_avulsas).toBe(0);
  });
});
```
(`fp()`/`cob()`: as fábricas que o arquivo já usa; se não houver, criar no topo do `describe` no molde da Task 13, Step 1.)
Run → Expected: FAIL.

- [ ] **Step 2: Implementar**

- `PlanoDialog.tsx`: receber `modo: ModoRecebimento | null` (o `Planos.tsx` passa `q.data.modo`) e trocar `{ROTULO_MODALIDADE[x]}` por
  `{rotuloDaModalidade(x, modo)}` (import de `@/financeiro/planos`).
- `Planos.tsx`: nos chips do cartão do plano, os rótulos sem repetir (na InfinitePay à vista e cartão parcelado dizem a mesma coisa):
```tsx
  {[...new Set(pl.modalidades.map((x) => rotuloDaModalidade(x, q.data?.modo ?? null)))].map((rot) => (
    <Chip key={rot} tom="g">{rot}{rot === ROTULO_MODALIDADE.cartao_parcelado && pl.max_parcelas_cartao ? ` até ${pl.max_parcelas_cartao}×` : ""}</Chip>
  ))}
```
- `PlanoDoAluno.tsx`: `ROTULO_MODALIDADE[modalidade]` (`:62`) e `ROTULO_MODALIDADE[x]` (`:99`) → `rotuloDaModalidade(…, d.conta.modo)`.
- `FinanceiroDoAluno.tsx`: `MODO_TEXTO` ganha `infinitepay: "InfinitePay (Pix e cartão, confirmação automática)"`; em `acoesDe(c)`, antes do estorno:
```tsx
      {c.ip_recibo_url && <IconeAcao icone={ReceiptText} rotulo="Recibo da InfinitePay" onClick={() => void abrirLinkExterno(c.ip_recibo_url)} marca="recibo-ip" />}
```
  e o "Registrar pago por fora" também na avulsa esperando a InfinitePay (o aluno diz que pagou e a confirmação não veio):
  `{(c.status === "aberta" || (c.tipo === "avulsa" && c.status === "aguardando_confirmacao" && c.forma === "infinitepay")) && <IconeAcao … marca="pago-por-fora" />}`
  (o `prof_registrar` já aceita a avulsa aguardando). Não mexer na `:336` nem no `TagsDoAluno` (hml-19d).
- `src/painel/aluno/dados/regras.ts`: `resumoDaTrava(d, agora = new Date())` e
```ts
  // W1-B1 (o espelho da financeiro_do_aluno): a tentativa da InfinitePay só conta como "aguardando" enquanto vale; vencida, a avulsa volta às abertas
  const vale = (c: CobrancaVista) => c.forma !== "infinitepay" || tentativaViva(c, agora);
```
  `aguardando: d.cobrancas.some((c) => c.tipo === "mensalidade" && c.status === "aguardando_confirmacao" && vale(c))`,
  `abertas: d.cobrancas.filter((c) => c.status === "aberta" || (c.tipo === "avulsa" && c.status === "aguardando_confirmacao" && !vale(c))).map(…)`,
  `aguardando_avulsas: d.cobrancas.filter((c) => c.tipo === "avulsa" && c.status === "aguardando_confirmacao" && vale(c)).length`
  (`tentativaViva` de `@/financeiro/infinitepay`); o `bloqueadoPorPagamento(d, ativo, agora)` passa o `agora` adiante.

- [ ] **Step 3: Rodar e commit**

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/painel/financeiro src/financeiro src/painel/aluno/dados && flock $P npm run tipos`
Expected: PASS.
```bash
git add src/painel/financeiro/PlanoDialog.tsx src/painel/financeiro/Planos.tsx src/painel/financeiro/Planos.test.tsx src/financeiro/ui/PlanoDoAluno.tsx src/financeiro/ui/FinanceiroDoAluno.tsx src/financeiro/ui/FinanceiroDoAluno.test.tsx src/painel/aluno/dados/regras.ts src/painel/aluno/dados/regras.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): painel — 'Período todo' na InfinitePay (P-B), o recibo da InfinitePay e a trava do painel com a tentativa vencida" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/painel/financeiro/PlanoDialog.tsx src/painel/financeiro/Planos.tsx src/painel/financeiro/Planos.test.tsx src/financeiro/ui/PlanoDoAluno.tsx src/financeiro/ui/FinanceiroDoAluno.tsx src/financeiro/ui/FinanceiroDoAluno.test.tsx src/painel/aluno/dados/regras.ts src/painel/aluno/dados/regras.test.ts
```

---

### Task 16: App — pagar pela InfinitePay (site e loja)

**Files:**
- Create: `src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx` + `PagarInfinitePay.test.tsx`
- Modify: `src/app-aluno/perfil/Pagamentos.tsx` (+ `Pagamentos.test.tsx`; novo `PagamentosInfinitePay.loja.test.tsx`)

**Estimativa:** 50 a 70 min (pior cenário 100 min)

- [ ] **Step 1: Os testes que falham**

```tsx
// src/app-aluno/perfil/pagamentos/PagarInfinitePay.test.tsx
// Physiq W1 — pagar pela InfinitePay: o toque reserva a aba, pede o link e abre a página; "Aguardando a confirmação"; "Conferir pagamento" e
// a volta à tela conferem; pago → avisa e fecha; a recusa da InfinitePay vira uma frase para o aluno (não é culpa dele). Tudo falso.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobrancaVista, MatriculaPagamentos } from "@/financeiro/tipos";

const h = vi.hoisted(() => ({ link: vi.fn(), conferir: vi.fn(), abrir: vi.fn(), aba: { ir: vi.fn(), fechar: vi.fn() }, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) } }));
vi.mock("@capacitor/browser", () => ({ Browser: { addListener: vi.fn(async () => ({ remove: vi.fn() })), open: vi.fn(), close: vi.fn() } }));
vi.mock("@/financeiro/abrirPagamento", () => ({ reservarAba: () => h.aba, abrirPagina: (...a: unknown[]) => h.abrir(...a) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  abrirLinkDaInfinitePay: (...a: unknown[]) => h.link(...a), conferirInfinitePay: (...a: unknown[]) => h.conferir(...a), invalidarResumo: () => {},
}));

import { ErroFinanceiro } from "@/financeiro/api";
import { PagarInfinitePay } from "./PagarInfinitePay";

const TENTATIVA = { id: "t1", status: "aguardando_confirmacao", forma: "infinitepay", tipo: "mensalidade", valor: 100, ip_link: "https://checkout.infinitepay.com.br/f?lenc=1",
  ip_expira_em: "2026-10-14T12:00:00Z" } as unknown as CobrancaVista;
const MAT = (cobrancas: CobrancaVista[] = []) => ({
  paciente_id: "p1", nome: "Aluno", conta: { id: "c1", nome: "Consultoria", modo: "infinitepay", bloquear: false, profissional: "Lucas" }, chave: null,
  mensalidade: { valor: 100, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: null, coberta: false }, assinatura: null, cobrancas, recibos: [],
}) as unknown as MatriculaPagamentos;
const aoPago = vi.fn();
const montar = (m = MAT()) => render(<PagarInfinitePay matricula={m} alvo={{ tipo: "mensalidade" }} aoFechar={() => {}} aoPago={aoPago} />);

beforeEach(() => {
  for (const f of [h.link, h.conferir, h.abrir, h.aba.ir, h.aba.fechar, aoPago, h.toast.success, h.toast.error, h.toast.info]) f.mockReset();
  h.link.mockResolvedValue({ ok: true, url: TENTATIVA.ip_link, cobranca: TENTATIVA, reutilizado: false });
  h.conferir.mockResolvedValue({ ok: true, paga: false, resultado: "nao_pago_pedido", cobranca: TENTATIVA });
});

describe("Pagar pela InfinitePay (W1)", () => {
  it("o toque reserva a aba, pede o link e abre a página; fica aguardando a confirmação", async () => {
    montar();
    fireEvent.click(document.querySelector("[data-ip-pagar]")!);
    await waitFor(() => expect(h.abrir).toHaveBeenCalledWith(TENTATIVA.ip_link, h.aba));
    expect(h.link).toHaveBeenCalledWith("p1", undefined);
    expect(document.querySelector('[data-ip-aguardando="t1"]')?.textContent).toContain("Aguardando a confirmação da InfinitePay");
  });
  it("a InfinitePay fora do ar ou recusando: fecha a aba e diz ao aluno, sem culpar a InfiniteTag", async () => {
    h.link.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_recusou"));
    montar();
    fireEvent.click(document.querySelector("[data-ip-pagar]")!);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Não deu para abrir o pagamento agora. Avise o seu profissional."));
    expect(h.aba.fechar).toHaveBeenCalled();
  });
  it("Conferir pagamento: pago → 'Pagamento confirmado!' e fecha; ainda não → a frase de esperar", async () => {
    montar(MAT([TENTATIVA]));
    await waitFor(() => expect(document.querySelector("[data-ip-conferir]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(h.toast.info).toHaveBeenCalled());
    h.conferir.mockResolvedValueOnce({ ok: true, paga: true, resultado: "baixar", cobranca: { ...TENTATIVA, status: "paga" } });
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(aoPago).toHaveBeenCalled());
    expect(h.toast.success).toHaveBeenCalledWith("Pagamento confirmado!");
  });
  it("a tentativa venceu (o servidor devolve 'cancelada'): volta ao 'Pagar' (MENOR 14 da revisão)", async () => {
    h.conferir.mockResolvedValueOnce({ ok: true, paga: false, resultado: "em_andamento", cobranca: { ...TENTATIVA, status: "cancelada" } });
    montar(MAT([TENTATIVA]));
    await waitFor(() => expect(document.querySelector("[data-ip-conferir]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(document.querySelector("[data-ip-pagar]")).not.toBeNull());
  });
  it("a tentativa que já existe abre direto em 'aguardando', com 'Abrir a página de novo'; a aba visível de novo confere", async () => {
    montar(MAT([TENTATIVA]));
    await waitFor(() => expect(document.querySelector("[data-ip-abrir-de-novo]")).not.toBeNull());
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(h.conferir).toHaveBeenCalledWith("t1"));
  });
});
```
Em `src/app-aluno/perfil/Pagamentos.test.tsx` (acrescentar `voltaDaInfinitePay`, `conferirInfinitePay` e `abrirLinkDaInfinitePay` ao mock de
`@/financeiro/api` e `vi.mock("@/financeiro/abrirPagamento", …)` com `reservarAba`/`abrirPagina`/`abrirLinkExterno`/`fecharPagina` falsos):
```tsx
describe("Perfil › Pagamentos — InfinitePay (W1)", () => {
  const IP = (x: Partial<MatriculaPagamentos> = {}) => matricula({
    conta: { id: "c1", nome: "Consultoria", modo: "infinitepay", bloquear: false, profissional: "Lucas Ferreira" },
    mensalidade: { valor: 100, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: dia(-1), coberta: false }, cobrancas: [], ...x });
  it("Pagar abre a folha da InfinitePay (não a do Pix na chave)", async () => {
    h.status.mockResolvedValue(status([IP()]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-pagar-mensalidade]")!);
    await waitFor(() => expect(document.querySelector("[data-pagar-ip]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mp]")).toBeNull();
  });
  it("com a tentativa viva: 'Continuar o pagamento' e o cartão 'em andamento'; ela não entra no histórico", async () => {
    const t = { ...cobranca(1), id: "t1", status: "aguardando_confirmacao", forma: "infinitepay", ip_link: "https://checkout.infinitepay.com.br/x", ip_expira_em: dia(2) } as CobrancaVista;
    h.status.mockResolvedValue(status([IP({ cobrancas: [t] })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")?.textContent).toBe("Continuar o pagamento"));
    expect(document.querySelector('[data-pagamento-ip="t1"]')).not.toBeNull();
    expect(document.querySelector('[data-historico-pagamentos] [data-cobranca="t1"]')).toBeNull();
  });
  it("a volta da página (?order_nsu=…) confere na hora e limpa a busca", async () => {
    h.status.mockResolvedValue(status([IP()]));
    h.volta.mockResolvedValue({ ok: true, paga: true, resultado: "baixar", cobranca: {} });
    montar("/perfil/pagamentos?order_nsu=11111111-2222-4333-8444-555555555555-1&transaction_nsu=n1&slug=s1&capture_method=pix");
    await waitFor(() => expect(h.volta).toHaveBeenCalledWith({ order_nsu: "11111111-2222-4333-8444-555555555555-1", transaction_nsu: "n1", slug: "s1", capture_method: "pix" }));
  });
  it("paga pela InfinitePay: 'Pix (InfinitePay)' e o recibo no detalhe", async () => {
    const pg = { ...cobranca(1), id: "p9", forma: "infinitepay", metodo: "pix", ip_meio: "pix", ip_recibo_url: "https://recibo.infinitepay.io/r" } as CobrancaVista;
    h.status.mockResolvedValue(status([IP({ cobrancas: [pg] })]));
    montar();
    await waitFor(() => expect(document.querySelector('[data-cobranca="p9"]')?.textContent).toContain("Pix (InfinitePay)"));
    fireEvent.click(document.querySelector('[data-cobranca="p9"] [data-cobranca-abrir]')!);
    await waitFor(() => expect(document.querySelector("[data-recibo-infinitepay]")).not.toBeNull());
  });
});
```
(`montar(rota?)`: acrescentar o parâmetro opcional da rota inicial ao `montar` do arquivo — `initialEntries={[rota ?? "/perfil/pagamentos"]}` —
e `volta: vi.fn()` ao `vi.hoisted`.) Novo `src/app-aluno/perfil/PagamentosInfinitePay.loja.test.tsx`: o topo do `Pagamentos.test.tsx` com
`vi.mock("@/lib/distribuicao", () => ({ ehLoja: true, DISTRIBUICAO: "play" }))` e o 1º caso acima ("na versão da loja o aluno paga o
PROFISSIONAL pela InfinitePay igual — não libera recurso do app").
Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/app-aluno/perfil` → Expected: FAIL.

- [ ] **Step 2: O componente** — `src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { abrirPagina, reservarAba } from "@/financeiro/abrirPagamento";
import { abrirLinkDaInfinitePay, conferirInfinitePay, ErroFinanceiro, invalidarResumo } from "@/financeiro/api";
import { dataHoraBR, mensagemErroFinanceiro, reais, tituloDoPagar } from "@/financeiro/regras";
import type { CobrancaVista, MatriculaPagamentos } from "@/financeiro/tipos";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import type { AlvoPagamento } from "./PagarPixManual";

const INTERVALO_MS = 5000;
const CONFERIR_POR_MS = 10 * 60_000;
/** Para o aluno, a recusa da InfinitePay não é culpa dele (a InfiniteTag é do profissional). */
const FRASE_DO_ALUNO: Record<string, string> = {
  infinitepay_recusou: "Não deu para abrir o pagamento agora. Avise o seu profissional.",
  infinitepay_checkout_desligado: "Não deu para abrir o pagamento agora. Avise o seu profissional.",
  infinitepay_indisponivel: "Não deu para abrir o pagamento agora. Tente de novo em instantes.",
};

/**
 * Pagar pela InfinitePay (W1 — desenho 10/10 §4.2 e §4.3): "Pagar com Pix ou cartão" pede o link à função (o MESMO enquanto a tentativa
 * vale, 72 h) e abre a página da InfinitePay por cima do app (APK: @capacitor/browser; site: a aba reservada no toque). O aluno paga lá
 * (Pix ou cartão em até 12×) e volta: a tela confere sozinha quando ele volta (o Browser fechou, o app voltou para a frente, a aba ficou
 * visível) e a cada 5 s com a folha aberta (até 10 min); "Conferir pagamento" confere na hora. Pago → "Pagamento confirmado!" e fecha. Sem
 * comprovante: a InfinitePay avisa o Physiq e o servidor confere com ela antes de dar baixa. Na versão da loja é igual (o serviço do
 * profissional — não libera recurso do app).
 */
export function PagarInfinitePay({ matricula, alvo, aoFechar, aoPago }: {
  matricula: MatriculaPagamentos;
  alvo: AlvoPagamento | null;
  aoFechar: () => void;
  aoPago: () => void;
}) {
  const [tentativa, setTentativa] = useState<CobrancaVista | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const avisou = useRef(false);
  const desde = useRef(Date.now());
  const valor = alvo?.tipo === "avulsa" ? Number(alvo.cobranca.valor) : Number(matricula.mensalidade?.valor ?? 0);

  useEffect(() => {
    avisou.current = false;
    desde.current = Date.now();
    if (!alvo) {
      setTentativa(null);
      return;
    }
    // a tentativa viva que já existe (o aluno voltou depois): começa em "aguardando", com "Abrir a página de novo"
    setTentativa(matricula.cobrancas.find((c) => c.forma === "infinitepay" && c.status === "aguardando_confirmacao"
      && (alvo.tipo === "avulsa" ? c.id === alvo.cobranca.id : c.tipo === "mensalidade")) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o alvo muda
  }, [alvo]);

  const pago = () => {
    if (avisou.current) return;
    avisou.current = true;
    invalidarResumo();
    toast.success("Pagamento confirmado!");
    aoPago();
  };

  const pagar = async () => {
    const aba = reservarAba(); // no toque: o navegador não bloqueia
    setAbrindo(true);
    try {
      const r = await abrirLinkDaInfinitePay(matricula.paciente_id, alvo?.tipo === "avulsa" ? alvo.cobranca.id : undefined);
      setTentativa(r.cobranca);
      desde.current = Date.now();
      if ((await abrirPagina(r.url, aba)) === "recusado") toast.error(FRASE_DO_ALUNO.infinitepay_recusou);
    } catch (e) {
      aba?.fechar();
      const codigo = e instanceof ErroFinanceiro ? e.codigo : null;
      toast.error((codigo && FRASE_DO_ALUNO[codigo]) || mensagemErroFinanceiro(codigo, "Não deu para abrir o pagamento agora. Tente de novo."));
    } finally {
      setAbrindo(false);
    }
  };

  const conferir = async (manual = false) => {
    if (!tentativa) return;
    if (manual) setConferindo(true);
    try {
      const r = await conferirInfinitePay(tentativa.id);
      if (r.paga) return pago();
      if (r.cobranca.status !== "aguardando_confirmacao") {
        // MENOR 14 da revisão: a tentativa venceu (72 h) ou saiu — volta ao "Pagar" (abre outra página)
        setTentativa(null);
        if (manual) toast.info("Essa página de pagamento venceu. Toque em Pagar para abrir outra.");
        return;
      }
      setTentativa((t) => (t ? { ...t, ...r.cobranca } : r.cobranca));
      if (manual) toast.info("Ainda não chegou a confirmação da InfinitePay. Se você já pagou, espere um pouco e confira de novo.");
    } catch {
      if (manual) toast.error("Não deu para conferir agora.");
    } finally {
      if (manual) setConferindo(false);
    }
  };

  // confere sozinho: a cada 5 s com a folha aberta e a página visível (até 10 min) e quando o aluno volta da InfinitePay
  useEffect(() => {
    if (!tentativa || tentativa.status !== "aguardando_confirmacao") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - desde.current < CONFERIR_POR_MS) void conferir(false);
    }, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir(false);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const ouvintes: Array<Promise<{ remove: () => Promise<void> }>> = [];
    if (Capacitor.isNativePlatform()) {
      ouvintes.push(Browser.addListener("browserFinished", () => void conferir(false)));
      ouvintes.push(CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) void conferir(false); }));
    }
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      ouvintes.forEach((o) => void o.then((x) => x.remove()).catch(() => undefined));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a tentativa aberta (o id muda quando nasce outra)
  }, [tentativa?.id, tentativa?.status]);

  const titulo = alvo?.tipo === "avulsa" ? alvo.cobranca.descricao : tituloDoPagar(matricula.mensalidade);
  return (
    <PainelDeslizante aberto={!!alvo} aoMudar={(a) => !a && aoFechar()} titulo={titulo} descricao={`${reais(valor)} · InfinitePay`} lado="baixo">
      <div className="flex flex-col gap-4" data-pagar-ip>
        {!tentativa ? (
          <>
            <p className="text-[13px] text-texto-2">
              Você paga na página da InfinitePay, com Pix ou cartão (em até 12×). Quando ela confirmar, o pagamento aparece aqui sozinho — não precisa mandar comprovante.
            </p>
            <Botao variante="w" icone={ExternalLink} className="w-full" disabled={abrindo} onClick={() => void pagar()} data-ip-pagar>
              {abrindo ? "Abrindo a página…" : `Pagar ${reais(valor)} com Pix ou cartão`}
            </Botao>
          </>
        ) : tentativa.status === "paga" ? (
          <p className="flex items-center gap-2 text-[14px] text-texto"><CheckCircle2 aria-hidden className="h-5 w-5 text-verde-2" /> Pagamento confirmado.</p>
        ) : (
          <div className="flex flex-col gap-3" data-ip-aguardando={tentativa.id}>
            <p className="flex items-center gap-2 text-[13.5px] text-texto" role="status">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin text-ambar-3" /> Aguardando a confirmação da InfinitePay…
            </p>
            <p className="text-[12.5px] text-texto-2">
              Terminou de pagar? Toque em "Conferir pagamento".{tentativa.ip_expira_em ? ` A página vale até ${dataHoraBR(tentativa.ip_expira_em)}.` : ""}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Botao variante="w" icone={RefreshCw} disabled={conferindo} onClick={() => void conferir(true)} data-ip-conferir>
                {conferindo ? "Conferindo…" : "Conferir pagamento"}
              </Botao>
              <Botao variante="g" icone={ExternalLink} disabled={abrindo} onClick={() => void pagar()} data-ip-abrir-de-novo>Abrir a página de novo</Botao>
            </div>
          </div>
        )}
      </div>
    </PainelDeslizante>
  );
}
```

- [ ] **Step 3: `Pagamentos.tsx`**

1. Imports: `PagarInfinitePay`; `conferirInfinitePay`, `voltaDaInfinitePay` (de `@/financeiro/api`); `abrirLinkExterno`, `fecharPagina` (de
   `@/financeiro/abrirPagamento`); `lerPedidoDoLink` (de `@/financeiro/infinitepay`); o ícone `ExternalLink` no import do `lucide-react`.
2. O painel de pagar: trocar o `{pagar && (pagar.m.conta.modo === "mercadopago" ? (…) : (…))}` por 3 ramos — `mercadopago` →
   `PagarMercadoPago`; `infinitepay` → `<PagarInfinitePay matricula={pagar.m} alvo={pagar.alvo} aoFechar={() => setPagar(null)} aoPago={() => { setPagar(null); void recarregar(); }} />`;
   o resto → `PagarPixManual` (como hoje).
3. A volta da página (depois do efeito do `?pagar=`):
```tsx
  // W1: a volta da página da InfinitePay (o redirect traz order_nsu, transaction_nsu, slug, receipt_url, capture_method; no APK pelo App
  // Link): confere na hora e limpa a busca
  const pedidoIp = params.get("order_nsu");
  useEffect(() => {
    if (!pedidoIp) return;
    const q: Record<string, string> = {};
    for (const k of ["order_nsu", "transaction_nsu", "slug", "invoice_slug", "receipt_url", "capture_method"]) {
      const v = params.get(k);
      if (v) q[k] = v;
    }
    setParams((a) => {
      const n = new URLSearchParams(a);
      for (const k of Object.keys(q)) n.delete(k);
      return n;
    }, { replace: true });
    void fecharPagina();
    // sem o NSU, confere a cobrança do pedido (I4: o order_nsu é `<cobranca_id>-<n>`)
    const cobrancaDoPedido = lerPedidoDoLink(q.order_nsu)?.cobranca;
    if (!q.transaction_nsu && !cobrancaDoPedido) return;
    (q.transaction_nsu ? voltaDaInfinitePay(q) : conferirInfinitePay(cobrancaDoPedido!))
      .then((r) => {
        void recarregar();
        if (r.paga) toast.success("Pagamento confirmado!");
        else toast.info("Recebemos a volta da InfinitePay. A confirmação aparece aqui em instantes.");
      })
      .catch(() => toast.info("Não deu para conferir agora. Toque em Atualizar daqui a pouco."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando chega a volta
  }, [pedidoIp]);
```
4. `SecaoMatricula`: `const ipAberta = cobrancas.find((c) => c.forma === "infinitepay" && c.status === "aguardando_confirmacao" && c.tipo === "mensalidade") ?? null;`;
   o `historico` passa a pular também a InfinitePay aguardando: `!(c.status === "aguardando_confirmacao" && (c.forma === "mp" || c.forma === "infinitepay"))`;
   `<CartaoMensalidade … ipAberta={ipAberta} />`; e, abaixo do cartão da mensalidade:
```tsx
      {ipAberta && (
        <Cartao className="flex items-center gap-3 px-4 py-3" data-pagamento-ip={ipAberta.id}>
          <Clock aria-hidden className="h-4 w-4 flex-none text-ciano-3" />
          <span className="min-w-0 flex-1 text-[12.5px] text-texto-2">
            <b className="block text-[13.5px] font-semibold text-texto">Pagamento na InfinitePay em andamento</b>
            {reais(ipAberta.valor)}{ipAberta.ip_expira_em ? ` · a página vale até ${dataHoraBR(ipAberta.ip_expira_em)}` : ""}
          </span>
        </Cartao>
      )}
```
   nas `abertas`, a avulsa esperando a InfinitePay ganha "Continuar":
   `acoes={c.status === "aberta" && pagarNoApp ? (<Botao … data-pagar-cobranca={c.id}>Pagar</Botao>) : c.forma === "infinitepay" && c.status === "aguardando_confirmacao" && pagarNoApp ? (<Botao tamanho="sm" variante="w" onClick={() => aoPagar({ tipo: "avulsa", cobranca: c })} data-continuar-cobranca={c.id}>Continuar</Botao>) : null}`.
5. `CartaoMensalidade({ …, ipAberta }: { …; ipAberta: CobrancaVista | null })`: o texto do botão `data-pagar-mensalidade` passa a
   `{ipAberta ? "Continuar o pagamento" : e.situacao === "teste" ? … : renovar ? … : `Pagar ${reais(ms.valor)}`}` (o resto do botão igual).
6. `DetalheCobranca`: depois do "Ver comprovante anexado":
   `{c.ip_recibo_url && <Botao variante="g" icone={ExternalLink} className="w-full" onClick={() => void abrirLinkExterno(c.ip_recibo_url)} data-recibo-infinitepay>Ver o recibo da InfinitePay</Botao>}`.
7. O comentário do topo: "W1: na conta que recebe pela InfinitePay, o Pagar abre a página dela (PagarInfinitePay); a volta (?order_nsu=)
   confere na hora; a tentativa viva vira 'Continuar o pagamento'; o recibo da InfinitePay no detalhe".

- [ ] **Step 4: Rodar e commit**

Run: `P=…/pesado.lock; flock $P npx vitest run --maxWorkers=2 src/app-aluno src/financeiro src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts && flock $P npm run tipos && flock $P npm run lint`
Expected: PASS (site e loja).
```bash
git add src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx src/app-aluno/perfil/pagamentos/PagarInfinitePay.test.tsx src/app-aluno/perfil/Pagamentos.tsx src/app-aluno/perfil/Pagamentos.test.tsx src/app-aluno/perfil/PagamentosInfinitePay.loja.test.tsx
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "feat(w1): o aluno paga pela InfinitePay — página por cima do app, conferência ao voltar, 'Continuar o pagamento' e o recibo (site e loja)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx src/app-aluno/perfil/pagamentos/PagarInfinitePay.test.tsx src/app-aluno/perfil/Pagamentos.tsx src/app-aluno/perfil/Pagamentos.test.tsx src/app-aluno/perfil/PagamentosInfinitePay.loja.test.tsx
```

---

### Task 17: Guardas de fonte (jeito 2 na tela, logs da InfinitePay, CI local)

**Files:**
- Create: `src/financeiro/recebimentoJeito2.test.ts`
- Modify: `src/financeiro/servidor.test.ts` (o log da InfinitePay)

**Estimativa:** 10 a 20 min (pior cenário 30 min)

- [ ] **Step 1: As guardas**

```ts
// src/financeiro/recebimentoJeito2.test.ts
// Physiq W1 (jeito 2 — combinado com a hml-19, para_linux3.md (b)): Configurações › Recebimento não fala mais com o banco pelo navegador;
// ninguém em src/ grava recebimento_chaves direto. A guarda lê a fonte (o mesmo jeito dos outros testes de fonte do repo).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TELAS = ["painel/configuracoes/Recebimento.tsx", "components/admin/RecebimentosLista.tsx", "components/admin/RecebimentoPixDialog.tsx"];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    if (statSync(c).isDirectory()) return arquivos(c);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [c] : [];
  });
}

describe("W1 — jeito 2 em Configurações › Recebimento", () => {
  it.each(TELAS)("%s: sem o cliente do banco (principal.from / .rpc / .storage)", (rel) => {
    const f = readFileSync(resolve(SRC, rel), "utf8");
    expect(f).not.toMatch(/principal\s*\.\s*(from|rpc|storage)\b/);
    expect(f).not.toContain("@/integrations/principal/client");
  });
  it("ninguém em src/ grava recebimento_chaves direto", () => {
    const achados = arquivos(SRC).filter((a) => /\.from\(\s*["']recebimento_chaves["']\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(readFileSync(a, "utf8")));
    expect(achados).toEqual([]);
  });
});
```
Em `src/financeiro/servidor.test.ts`, no `describe("W1 — …")`:
```ts
  it("nada da InfinitePay vai ao log: InfiniteTag, url, recibo, NSU, slug", () => {
    for (const rel of ["infinitepay-webhook-aluno/index.ts", "_shared/infinitepay-baixa.ts", "_shared/infinitepay.ts", "pagamentos-aluno/index.ts"]) {
      const f = ler(rel);
      for (const m of f.matchAll(/\blog\.(?:info|aviso|erro|excecao)\s*\(([\s\S]*?)\);/g)) {
        expect(m[1], `${rel}: ${m[1].slice(0, 80)}`).not.toMatch(/\b(handle|ip_handle|url|recibo|recibo_url|transaction_nsu|nsu|slug)\b/);
      }
    }
  });
```

- [ ] **Step 2: Rodar as guardas e o CI local e commit**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P npx vitest run --maxWorkers=2 src/financeiro/recebimentoJeito2.test.ts src/financeiro/servidor.test.ts src/lib/logsDasFuncoesPrincipal.test.ts
flock $P npm run test:node
```
Expected: PASS; `test:node` verde (o `checar-definer` na migration nova e o `checar-funcoes` sem achado novo).
```bash
git add src/financeiro/recebimentoJeito2.test.ts src/financeiro/servidor.test.ts
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w1): guardas — o Recebimento sem banco no navegador e nada da InfinitePay no log" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/financeiro/recebimentoJeito2.test.ts src/financeiro/servidor.test.ts
```

---
### Task 18: Testes locais finais + E2E de tela (site e loja) + prints

**Files:**
- Create: `e2e/w1/telas.py`
- Modify: `docs/e2e-rodadas.md`

**Estimativa:** 45 a 70 min (pior cenário 110 min)

- [ ] **Step 1: Suíte inteira, tipos, lint, o CI local e os 2 builds (na fila da máquina)**

```bash
cd ~/projetos/physiqcalc-w1 && P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock && T=~/projetos/physiqcalc-scratch/w1/t18 && mkdir -p $T
flock $P npx vitest run --maxWorkers=2 && flock $P npm run tipos && flock $P npm run lint && flock $P npm run test:node
for f in pagamentos-aluno infinitepay-webhook-aluno; do DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno check supabase-principal/functions/$f/index.ts; done
flock $P npm run build && rm -rf $T/dist-site && cp -r dist $T/dist-site
flock $P npm run build:loja && rm -rf $T/dist-loja && mv dist $T/dist-loja && cp -r $T/dist-site dist
```
Expected: tudo verde (o build usa o `.env.local` de staging); a guarda de chunks do build sem aviso novo.

- [ ] **Step 2: Escrever o E2E de tela** — `e2e/w1/telas.py`, no molde do `e2e/wp/telas.py`: a mesma carga das bases (`_carregar` da W6 e da
hml-18), a classe `Tela` copiada de lá (o print `<pasta>/<nome>.png` com a medida da largura, `fotos` a 1280 e 390, `diagnostico`,
`encerrar` contando erro de página e diálogo nativo), o `conferir_canal` (health.json: `site` × `play`) e a guarda `saude_dos_2()`; o desfazer é
o do `e2e/w1/api.py` (`API.preparar`/`API.desfazer` — a foto da matrícula, da conta e da flag) + as marcas desta rodada. Pasta dos prints:
`~/projetos/physiqcalc-scratch/prints/w1/<base>/` (o build da loja em `…/<base>/loja/`). O que é da W1:

```python
"""Physiq W1 — E2E de TELA da InfinitePay (Task 18 do plano da W1), com o Edge e as contas de TESTE do STAGING, em série, com a guarda de
/health dos 2 projetos antes de cada conta que entra. O painel a 1280 e a 390 (os "-390"); o app do aluno a 390 × 844.
Passos (em ordem; a massa é a conta do prof2 — "Rafael Lima" — com o aluno2):
  1 recebimento   o dono em Configurações › Recebimento: a tela NÃO pede nada ao banco (nenhuma chamada a /rest/v1/recebimento_chaves nem
                  /rest/v1/contas — o jeito 2 medido na rede); chave Pix: adicionar, ligar, excluir (com a confirmação do app)
  2 infinitepay   escolher InfinitePay, colar a InfiniteTag de teste com $, "Testar" abre uma aba da InfinitePay (a url é conferida; a aba é
                  fechada sem pagar), "Salvar a forma" → o chip INFINITEPAY
  3 planos        Financeiro › Planos: "Período todo (Pix ou cartão até 12×)" no plano com à vista e cartão parcelado (P-B)
  4 app_pagar     o aluno em Pagamentos: "Pagar R$ 10,00" → a folha da InfinitePay → a aba da InfinitePay (conferida e fechada) →
                  "Aguardando a confirmação"; "Conferir pagamento" → "Ainda não chegou…" (a API de verdade: não pago)
  5 app_volta     a volta da página (/perfil/pagamentos?order_nsu=<o pedido do link, <id>-1>&transaction_nsu=…): "Recebemos a volta…" e a
                  busca limpa
  6 app_pago      a tentativa marcada paga NO BANCO (o resultado da baixa — o caminho da baixa é provado no api.py --local): "Pix
                  (InfinitePay) · pago em …" e "Ver o recibo da InfinitePay" no detalhe
  7 ficha         a ficha do aluno no painel: "InfinitePay (Pix e cartão, confirmação automática)" e o recibo na linha da cobrança
  8 master        master › Integrações: a InfiniteTag da conta e o "Desligar" (confirmação do app → volta ao Pix ou a não cobrar)
--loja: o localhost:8080 serve o build da loja — só os passos 4 a 6 (o aluno paga o PROFISSIONAL igual na versão da Google Play).
--base prod: SÓ LEITURA (nada clica em salvar, nada é gravado): o master abre Recebimento (a opção InfinitePay aparece para ele) e
Integrações (o KPI); o aluno de teste abre Pagamentos. As contas e senhas do e2e/w07/smoke_prod.py. Prints em …/prints/w1/prod/.
Desfazer: o do e2e/w1/api.py (a foto da matrícula, da conta e da flag ANTES de mexer; no fim, ou --limpar, tudo volta e é conferido).
Precisa: a W1 no staging e as 2 funções publicadas; a InfiniteTag de teste em ~/.physiq-infinitetag-teste (sem ela, os passos 2 e 4 ficam ❌).
Uso: python3 e2e/w1/telas.py --base local|staging|prod [--loja] [--canal msedge] [--limpar]
"""
```
As medidas próprias da W1 (o resto é o molde):
```python
REST_DO_RECEBIMENTO = re.compile(r"/rest/v1/(recebimento_chaves|contas)\b")

def vigiar_rede(t) -> list[str]:
    """Jeito 2 medido: cada pedido do navegador à API REST das 2 tabelas do Recebimento vira uma linha "MÉTODO caminho" (sem a busca)."""
    vistos: list[str] = []
    t.pg.on("request", lambda req: vistos.append(f"{req.method} {urlparse(req.url).path}") if REST_DO_RECEBIMENTO.search(req.url) else None)
    return vistos

def aba_da_infinitepay(t, clicar_em: str) -> str | None:
    """Clica e espera a aba nova; confere que é da InfinitePay e FECHA sem pagar (nunca print da página de fora). → a url."""
    with t.pg.context.expect_page(timeout=30_000) as nova:
        t.clicar(clicar_em)
    pg = nova.value
    pg.wait_for_load_state("domcontentloaded", timeout=30_000)
    url = pg.url
    pg.close()
    return url if API.HOST_IP.match(url or "") else None

def marcar_paga_no_banco(c: str) -> None:
    """O resultado de uma baixa (só para a tela do passo 6): o caminho de verdade da baixa é o do api.py --local."""
    API.sql(f"""update {API.S}.cobrancas set status = 'paga', pago_em = now(), metodo = 'pix', ip_meio = 'pix', ip_transaction_nsu = 'E2E-TELA-' || substr(md5(random()::text), 1, 8),
                ip_recibo_url = 'https://recibo.infinitepay.io/e2e-tela' where id = '{c}'""")
```
Cada passo: `R.ok(...)` com a medida e `t.fotos("<n>_<nome>", alvo)` (1280 e 390) no painel; `t.foto(...)` (390) no app. Os nomes:
`1_recebimento`, `2_recebimento_infinitepay`, `3_planos_periodo_todo`, `4_app_aguardando`, `5_app_volta`, `6_app_pago_recibo`, `7_ficha_infinitepay`,
`8_master_integracoes`. No passo 1, `R.ok(vistos == [], f"jeito 2: nenhuma chamada do navegador a recebimento_chaves/contas ({vistos})")`.

- [ ] **Step 3: Rodar no local, um por vez (site, depois loja)**

```bash
ss -ltnp | grep -E ':(8080|8790|8791|8799)\b' || echo "portas livres"     # a LINUX 1 pode estar com preview na 8080
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock; T=~/projetos/physiqcalc-scratch/w1/t18
tmux new-session -d -s w1-preview "cd ~/projetos/physiqcalc-w1 && npx vite preview --port 8080 --strictPort"   # o dist/ do site
flock $P python3 e2e/w1/telas.py --base local
tmux kill-session -t w1-preview
rm -rf dist && cp -r $T/dist-loja dist
tmux new-session -d -s w1-preview "cd ~/projetos/physiqcalc-w1 && npx vite preview --port 8080 --strictPort"   # o dist/ da loja
flock $P python3 e2e/w1/telas.py --base local --loja
tmux kill-session -t w1-preview
rm -rf dist && cp -r $T/dist-site dist
```
Expected: os 2 placares completos ✅ (sem a InfiniteTag: os passos 2 e 4 ❌ "falta a InfiniteTag" — refazer quando ela chegar).

- [ ] **Step 4: Conferir os prints (Read em CADA um) e registrar a rodada**

Abrir com o Read cada `~/projetos/physiqcalc-scratch/prints/w1/local/*.png` e `…/local/loja/*.png`. Conferir: nada passando da largura,
textos em PT-BR simples e certos ("Período todo (Pix ou cartão até 12×)", "Aguardando a confirmação da InfinitePay…", "Pix (InfinitePay)"),
nenhum dado de pessoa real, nenhuma página de fora. Linhas da rodada no topo de `docs/e2e-rodadas.md` (o `Placar.fim()` grava no `.tsv`).

- [ ] **Step 5: Commit**

```bash
git add e2e/w1/telas.py docs/e2e-rodadas.md
git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "test(w1): E2E de tela da InfinitePay (Recebimento sem banco no navegador, app site e loja, master)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/w1/telas.py docs/e2e-rodadas.md
```

---

### Task 19: Validação local (modo até o fim: sem gate)

**Estimativa:** 10 a 15 min (pior cenário 25 min)

- [ ] **Step 1:** montar as 2 montagens dos prints (painel e app) como na W-P e mandar no tópico do Physiq (terminal + tópico — a regra
  "pergunta/resposta nos 2 lugares"), com o resumo em ≤ 6 linhas: o que mudou para o personal, para o aluno, o jeito 2 medido, os placares
  (Vitest, `sql_w1`, `api.py` staging e `--local`, `telas.py` site e loja) e o que fica para o FIM (os 2 R$ 1 e as sondas do C1). Conferir cada print com o Read
  ANTES de mandar.
- [ ] **Step 2:** foto do andamento (`andamento_worktrees.py … --atual`) com a previsão "HHhMM a HHhMM (pior cenário HHhMM)" e as fases; seguir
  sem esperar (decisão dele de 10/10: até o fim). Se ele responder com ajuste, voltar à task do ajuste, testes, prints de novo.

---

### Task 20: Staging (o front + as funções do HEAD + E2E um por vez)

**Estimativa:** 35 a 60 min (pior cenário 90 min)

- [ ] **Step 1: Check anti-sobrescrita (comando ISOLADO, sozinho)**

Run: `git -C ~/projetos/physiqcalc-w1 fetch origin && git -C ~/projetos/physiqcalc-w1 worktree list && gh pr list --repo weslleybertoldo/physiqcalc --state open && sed -n 1,8p ~/projetos/physiqcalc-scratch/quem-toca-o-que.md`
Depois, num comando separado: `cd ~/projetos/physiqcalc-w1 && (git merge-base --is-ancestor origin/main HEAD && echo main-ok || echo MAIN-ANDOU) && (git merge-base --is-ancestor origin/staging HEAD && echo staging-ff-ok || echo STAGING-NAO-FF)`
Expected: `main-ok` e `staging-ff-ok`. `MAIN-ANDOU` → `git rebase origin/main` (o `logsDasFuncoesPrincipal.test.ts` e o `e2e-rodadas.md` podem
conflitar com a hml-19: 1 linha cada — juntar as 2) e rodar de novo a Task 18, Step 1. `STAGING-NAO-FF` → parar e combinar com a LINUX 1.

- [ ] **Step 2: A trava**

`SendMessage` à LINUX 1: "vou pegar 🔒 staging/main e o BANCO do staging para a W1: push fast-forward no staging, migrations do staging
conferidas (no-op), republicar pagamentos-aluno e infinitepay-webhook-aluno se mudaram, E2E de tela no staging — ~40 min. Pode ir?". Com o
"pode ir": as 2 linhas da trava no quadro (Edit) = "ocupado por LINUX 3 desde HH:MM (W1 Task 20: …)".

- [ ] **Step 3: A migration SÓ no staging (conferir que nada mudou desde as Tasks 5 e 6)**

```bash
git -C ~/projetos/physiqcalc-w1 log --oneline -- supabase-principal/migrations/20261011200000_w1_infinitepay.sql
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging --dry-run
```
Mudou algum arquivo depois da aplicação → aplicar de novo SÓ no staging (idempotente) e `python3 e2e/w1/sql_w1.py`. Nada no `public` aqui.

- [ ] **Step 4: As funções do HEAD**

`git diff --stat <sha publicado na Task 12> HEAD -- supabase-principal/functions/pagamentos-aluno supabase-principal/functions/infinitepay-webhook-aluno supabase-principal/functions/_shared`
→ mudou → `scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions infinitepay-webhook-aluno false` e
`… pagamentos-aluno true`, e logo depois o smoke só leitura do `public` da Task 12, Step 3. Não mudou → nada a publicar.

- [ ] **Step 5: PR e push no staging (fast-forward, sem forçar)**

```bash
cd ~/projetos/physiqcalc-w1
git push -u origin feat/w1-infinitepay
gh pr create --title "feat(recebimento): InfinitePay — o aluno paga o personal pela página da InfinitePay (W1)" --body-file ~/projetos/physiqcalc-scratch/w1/pr-w1.md
git push origin feat/w1-infinitepay:staging
```
O corpo do PR (`~/projetos/physiqcalc-scratch/w1/pr-w1.md`):
- o que muda (personal, aluno, master; o jeito 2 do Recebimento);
- a migration (uma só — I2), a função nova e a republicada (versões e horário);
- a flag (desligada na produção até os 2 R$ 1 da Task 22);
- os placares dos E2E e os fatos da API sondados em 11/10;
- o que fica para o FIM (Task 22).

Anotar também (revisão de 11/10):
- C1: o "outro pagamento" e o NSU novo numa cobrança paga só pelo pedido só AVISAM o personal. O automático só depois das sondas da
  Task 22.
- MENOR 10: por até 72 h, a tentativa da InfinitePay (`aguardando_confirmacao`) acende o selo "COMPROVANTE" na lista de alunos e cala os
  lembretes de WhatsApp "vence amanhã" e "venceu ontem". É igual ao Pix do MP hoje.
- MENOR 16: o OK do "Segue sozinho" (10/10) cobre o endpoint público novo (`verify_jwt false`) e a migration no `public` (o spec-review
  pedia perguntar antes).
- MENOR 5 (pendente): quando a hml-19a entrar na `main`, o `dbPessoa` passa a ser o cliente da `porta-pessoa.ts` (a chave anon num lugar
  só).
- MENOR 7 (pendente, para a W2): o select e o "Desligar" do master (`master_conta_acao('recebimento')`) tiram a conta do MP sem cancelar
  as automáticas. A regra cruzada só está no `prof_recebimento_salvar`.

No fim do corpo, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
Esperar o deploy da Vercel do staging (READY) e conferir `https://physiqcalc-staging.vercel.app/health.json` (versão e o sha da branch). O CI
do PR (`gh pr checks <n> --watch`): `checar-pr` verde (lint, tipos, definer, `node --test`, Vitest, build, chunks).

- [ ] **Step 6: E2E no staging, um por vez (a guarda de /health em cada um)**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P python3 e2e/w1/telas.py --base staging
flock $P python3 e2e/w1/api.py --casos recebimento,link,forjado
flock $P python3 e2e/wp/api.py --casos planos,periodo
flock $P python3 e2e/w10/api.py
flock $P python3 e2e/hml01/banco.py --schema staging
```
Expected: todos ✅ (a loja não roda no staging — só o build do site, como na W-P). Prints em `~/projetos/physiqcalc-scratch/prints/w1/staging/`
(Read em cada um). As linhas no `docs/e2e-rodadas.md` → commit na branch (`git push` só na branch, NÃO no staging).

- [ ] **Step 7: Soltar o BANCO do staging** (a trava de staging/main continua para a Task 21) + aviso; resumo e prints do staging no tópico
  (sem esperar: até o fim).

---

### Task 21: Produção (banco, PR → squash, release, realinhar, smoke só leitura)

**Estimativa:** 45 a 70 min (pior cenário 110 min)

- [ ] **Step 1: Check anti-sobrescrita de novo (isolado)** — o mesmo da Task 20, Step 1.

- [ ] **Step 2: "Pausa E2E" à LINUX 1** → esperar o "pausado" (ela não roda E2E no staging/produção enquanto o banco de produção muda).

- [ ] **Step 3: Backup do `public` e a foto das funções que mudam**

```bash
B=~/backups/physiq/$(date +%F)-w1-infinitepay/principal
python3 scripts/backup/backup_principal.py --pasta $B --schemas public --tabelas contas,cobrancas,recebimento_chaves,app_config,avisos,pacientes
python3 - "$B" <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, "e2e/w02")
from _comum import sql_principal as q
linhas = q("""select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('contas_guard', 'financeiro_do_aluno', 'w27_conta_linha', 'master_integracoes')""")
Path(sys.argv[1], "funcoes-antes.sql").write_text(";\n\n".join(x["d"] for x in linhas) + ";\n", encoding="utf-8")
print(len(linhas), "funções guardadas")
PY
python3 e2e/wp/sql_planos.py --so-regressao --schema public --guardar ~/projetos/physiqcalc-scratch/w1/regressao-public-antes.json
```
Expected: os arquivos das tabelas + as contagens; "4 funções guardadas"; a regressão do "pago até" guardada.

- [ ] **Step 4: Ninguém segurando o banco**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, "e2e/w02")
from _comum import sql_principal as q
print(q("""select count(*) filter (where state <> 'idle' and xact_start < now() - interval '1 minute') as longas,
                  count(*) filter (where wait_event_type = 'Lock') as esperando from pg_stat_activity where datname = current_database()"""))
PY
```
Expected: `longas` 0 e `esperando` 0 (senão esperar e medir de novo).

- [ ] **Step 5: A migration no `public` (dry-run antes; UMA transação — I2) e a conferência de depois**

```bash
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so public --dry-run
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so public
python3 e2e/w1/sql_w1.py --so-catalogo --schema public
python3 e2e/wp/sql_planos.py --so-regressao --schema public --comparar ~/projetos/physiqcalc-scratch/w1/regressao-public-antes.json
python3 e2e/hml01/banco.py --schema public
```
Expected: o catálogo do `public` todo ✅ e a flag `{"liberada": false}` (a InfinitePay escondida dos personais até a Task 22); o "pago até"
IGUAL para todos; `hml01` sem regressão. ❌ → parar, não fazer merge, avisar com o placar (a volta: o backup e o `funcoes-antes.sql`).
Logo depois, o webhook no `public` (só leitura): o POST da Task 12, Step 3 → agora `ignorado_pedido` (a W1 chegou; o pedido inventado
não é nosso) com `ms` < 1000. Até 60 s depois da migration ainda pode vir 400 `schema_sem_w1` (o cache do `schemaTemW1`): repetir.

- [ ] **Step 6: Os tipos do banco e o commit no PR**

Run: `curl -sS -H "Authorization: Bearer $(cat ~/.pc-pat)" -H "User-Agent: physiq-unificado/1.0" "https://api.supabase.com/v1/projects/hkxvtsbwctxkrqzkkdoz/types/typescript?included_schemas=public" | python3 -c "import json,sys; print(json.load(sys.stdin)['types'])" > ~/projetos/physiqcalc-scratch/w1/types.ts`
e trocar o corpo de `src/integrations/principal/types.ts` mantendo as 3 linhas de comentário do topo. `flock $P npm run tipos` limpo →
`git add src/integrations/principal/types.ts && git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "chore(tipos): tipos do principal com a InfinitePay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/integrations/principal/types.ts` → `git push` (na branch).

- [ ] **Step 7: Merge (um PR por vez na main, avisando a LINUX 1)**

`SendMessage` à LINUX 1 ("vou fazer o merge da W1 na main") → CI do PR verde → `gh pr merge <n> --squash --delete-branch=false` → conferir o
autor do squash (`git log origin/main -1 --format='%an <%ae>'` = Weslley Bertoldo <55102421+…@users.noreply.github.com>) → esperar o CI
(`gh run watch`): a release e o `chore: bump version to v3.9x` (o job `bump` do `build-apk.yml`; não bumpar à mão) e o APK da release.

- [ ] **Step 8: Realinhar `staging` = `main` (a única exceção da regra 3 do quadro)**

As 3 condições juntas: (a) o "pode ir" da LINUX 1; (b) `git log origin/main..origin/staging` só com os commits da `feat/w1-infinitepay` e a
árvore do staging igual à do squash (`git diff origin/staging <sha do squash>^{tree}` vazio — conferir antes do bump); (c)
`git push origin origin/main:staging --force-with-lease=staging:<sha conferido do staging>` (nunca `--force` puro).

- [ ] **Step 9: "Pode voltar" à LINUX 1** + o sha do merge + as 2 travas do quadro em "livre".

- [ ] **Step 10: Smoke da produção — SÓ LEITURA**

```bash
P=~/projetos/physiqcalc-scratch/hml/hml12/ferramentas/pesado.lock
flock $P python3 e2e/w07/smoke_prod.py telas --versao <a versão da release> --canal msedge
flock $P python3 e2e/w10/api.py
flock $P python3 e2e/w06/smoke_prod.py
flock $P python3 e2e/w1/telas.py --base prod
```
Expected: os placares de sempre (os ❌ antigos e conhecidos do `w06/smoke_prod` e nada novo); `w1/telas.py --base prod` ✅: o master vê a
InfinitePay em Recebimento (a flag desligada esconde só dos personais) e o KPI em Integrações; o aluno de teste abre Pagamentos. Prints em
`~/projetos/physiqcalc-scratch/prints/w1/prod/` (Read em cada um). Os logs das 2 funções nos últimos 30 min sem erro novo (Management API,
`/v1/projects/hkxvtsbwctxkrqzkkdoz/analytics/endpoints/logs.all`, filtrando `function_id` das 2 — só contagem por nível e os `codigo`).

- [ ] **Step 11: Fechar**

`docs/e2e-rodadas.md` (as linhas da produção vão no próximo PR); o JSON da foto: W1 `status = "feito"` com o item "Teste de verdade" em
`falta` ("no FIM: os seus 2 R$ 1"), `duracao_min`, `tag: "PR #… · v3.9x"` → a página em andamento; quadro (✅ W1 com a hora; a linha da LINUX 3
passa para a W2); memória (`projeto-physiq-unificado` / o plano de retorno: W1 em produção com a flag desligada, faltam os 2 R$ 1); o resumo no
grupo Validação (`remoto_validacao`, tópico do Physiq) com os prints da produção; `claude-orfaos.sh` (órfã → perguntar).

---

### Task 22: FIM (do Weslley) — o R$ 1 no staging com as sondas do C1, o 2º R$ 1 pelo APK na produção e só então a flag

**Estimativa:** do meu lado 45 a 70 min (pior cenário 110 min), mais o tempo dele (~10 min no celular, nos 2 pagamentos)

> São os 2 únicos pagamentos de verdade da W1, e **a flag só liga depois dos 2** (revisão I7: "mock não é prova"). O que já se sabe da API
> está no cabeçalho ("Fatos da API sondados em 11/10"). Falta o que só um pagamento mostra:
> - a busca da volta e o host do recibo;
> - o corpo do webhook, e se o `?schema=` chega nele;
> - se o `payment_check` aceita SÓ o `order_nsu` (W1-B2);
> - o C1: se o `payment_check` AMARRA o NSU e o slug ao pedido (as sondas do Step 3).
>
> A InfinitePay é a conta dele recebendo dele mesmo: cada R$ 1 fica com ele (menos a taxa da InfinitePay).

- [ ] **Step 1: Preparar o staging (eu)** — no staging, com a trava do BANCO:
  - a conta do prof2 na InfinitePay com a InfiniteTag DELE (pela tela ou pelo `prof_recebimento_salvar`);
  - a mensalidade do aluno2 em R$ 1,00, vencida, no modo de hoje (`prof_definir { aluno, valor: 1 }`);
  - a foto do `e2e/w1/api.py` (`preparar`), para desfazer depois;
  - um **magic link curto** do aluno2 para `https://physiqcalc-staging.vercel.app/perfil/pagamentos` (o mesmo jeito dos links de gate —
    memória `feedback-link-de-gate-magic-link-curto`).
- [ ] **Step 2: O roteiro dele no staging (no celular, 1 passo por mensagem — a regra de guiar pelo celular)**
  1. Abrir o link → o Physiq de teste em **Perfil › Pagamentos**, com "Pagar R$ 1,00".
  2. Tocar em **Pagar R$ 1,00** → **Pagar com Pix ou cartão** → a página da InfinitePay abre: conferir que aparece **o nome dele**.
  3. Pagar **R$ 1,00 no Pix** pelo app do banco dele.
  4. Na InfinitePay, tocar em **Continuar** → volta ao Physiq: "Pagamento confirmado!". Se a volta não vier, voltar à aba do Physiq e
     tocar em "Conferir pagamento". Mandar o print.
- [ ] **Step 3: Conferir (eu, só leitura) e as sondas do C1**
  1. A cobrança está `paga`, com `ip_transaction_nsu`, `ip_slug`, `ip_meio` e `ip_valor_pago`. O host do `ip_recibo_url` está no filtro
     `HOST_IP`? Se não, 1 commit alargando o filtro, com teste.
  2. Na caixa:
     - qual aviso chegou primeiro (`webhook` ou `volta`) e quanto tempo levou;
     - se o `?schema=staging` chegou no webhook. Se não chegou, usar a reserva do caminho: o `urlDoWebhook` passa a montar
       `…/infinitepay-webhook-aluno/<schema>` (1 commit).
  3. Os avisos "pagamento confirmado" ao aluno e ao personal; nos logs, o `ms` do webhook.
  4. As sondas. Usam o pedido `<id>-1` PAGO e o NSU e o slug de verdade lidos da cobrança, em Python direto na API. Imprimem só as CHAVES
     e o `paid`, nunca os valores:

     | # | `payment_check` com | `paid: true` quer dizer |
     |---|---|---|
     | a | NSU errado + slug certo | a InfinitePay não confere o NSU |
     | b | NSU certo + slug errado | a InfinitePay não confere o slug |
     | c | NSU e slug certos + OUTRO `order_nsu` (`<id>-2`, que não existe) | o NSU não é amarrado ao pedido (C1, variante d) |
     | d | só o `order_nsu` (W1-B2) | o "Conferir pagamento" sem aviso funciona (e a resposta traz `transaction_nsu`?) |
     | e | um 2º link criado SEM pagar, com o MESMO `order_nsu` e outro preço (aceito — fato (d)); depois, a (d) de novo | qual `amount` volta |

```bash
cd ~/projetos/physiqcalc-w1 && python3 - <<'PY'
# as sondas do C1 (Task 22, Step 3): só as CHAVES e o "paid" de cada resposta — nunca os valores, a InfiniteTag, o NSU ou o slug
import json, sys, urllib.error, urllib.request
sys.path.insert(0, "e2e/w02")
from _comum import sql_principal as q
c = q("""select l.pedido, l.handle, l.centavos, l.cobranca_id::text as cob, c.ip_transaction_nsu as nsu, c.ip_slug as slug
           from staging.cobrancas c join staging.infinitepay_links l on l.cobranca_id = c.id
          where c.status = 'paga' and c.forma = 'infinitepay' order by c.pago_em desc limit 1""")[0]
assert not c["nsu"].startswith("pedido:"), "paga só pelo pedido: as sondas a–c precisam do NSU de verdade (esperar o webhook)"
def post(caminho, corpo):
    req = urllib.request.Request(f"https://api.checkout.infinitepay.io{caminho}", data=json.dumps(corpo).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=20)
        return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")
def mostrar(nome, st, r):
    print(nome, st, sorted(r) if isinstance(r, dict) else type(r).__name__, "paid =", isinstance(r, dict) and r.get("paid"))
base = {"handle": c["handle"], "order_nsu": c["pedido"]}
for nome, corpo in {"a_nsu_errado": {**base, "transaction_nsu": c["nsu"] + "x", "slug": c["slug"]},
                    "b_slug_errado": {**base, "transaction_nsu": c["nsu"], "slug": (c["slug"] or "") + "x"},
                    "c_outro_pedido": {**base, "order_nsu": f"{c['cob']}-2", "transaction_nsu": c["nsu"], "slug": c["slug"]},
                    "d_so_o_pedido": base}.items():
    mostrar(nome, *post("/payment_check", corpo))
st, r = post("/links", {"handle": c["handle"], "items": [{"quantity": 1, "price": c["centavos"] + 100, "description": "Sonda W1"}],
                        "order_nsu": c["pedido"], "redirect_url": "https://physiqcalc-staging.vercel.app/perfil/pagamentos"})
print("e_2o_link", st, sorted(r) if isinstance(r, dict) else type(r).__name__)
st, r = post("/payment_check", base)
mostrar("e_so_o_pedido_depois", st, r)
print("e_amount", "o do link pago" if isinstance(r, dict) and r.get("amount") == c["centavos"] else "outro (ou nenhum)")
PY
```
  5. A decisão das sondas. Anotar tudo no PR seguinte e na memória `referencia-infinitepay-api-checkout`.
     - **(c) com `paid: true` → NÃO ligar a flag.** A InfinitePay não amarra o NSU ao pedido. Um NSU de verdade repetido em outro link do
       mesmo valor daria baixa nele, porque o índice único só segura quando o 1º pagamento foi baixado com o NSU de verdade. Parar e voltar
       ao Weslley com a correção: "NSU já visto na caixa em outro pedido da mesma InfiniteTag = aviso, sem baixa" (~30 min).
     - **(a), (b) ou (e) com `paid: true` → seguir sem baixa automática.** O C1 já segura (outro NSU só avisa). Fica anotado. O "2º
       pagamento" automático só liga numa mudança futura, e só com as 3 recusando.
     - **(d) sem `paid: true` pelo pedido →** o "Conferir pagamento" sem aviso não confirma nada. O personal confirma à mão (o desenho já
       previa) e o texto da tela passa a dizer isso (1 commit).
- [ ] **Step 4: Desfazer a massa do staging** — `python3 e2e/w1/api.py --limpar` (com o estado do Step 1). A mensalidade, a conta e a
  flag do staging voltam.
- [ ] **Step 5: O 2º R$ 1 — na PRODUÇÃO, pelo APK, ANTES da flag (revisão I7).** A flag segue desligada para os personais; o master não é
  segurado por ela.
  1. **Eu**, só nas contas de TESTE de produção (as do `e2e/w07/smoke_prod.py`):
     - a foto: o `recebimento_modo` e a integração da conta do master de teste (`admin.teste`) e a mensalidade do aluno dela
       (`teste@teste.com`);
     - a InfinitePay ligada nessa conta COMO O MASTER (`prof_recebimento_salvar` com a InfiniteTag dele);
     - a mensalidade do aluno de teste em R$ 1,00 (`prof_definir`).
  2. **Ele**, no celular com o APK de PRODUÇÃO (a versão da Task 21), 1 passo por mensagem:
     - entrar como o aluno de teste (a senha vem do cofre);
     - Perfil › Pagamentos → Pagar R$ 1,00 → a página da InfinitePay abre POR CIMA do app;
     - Pix → Continuar → o App Link volta ao app → "Pagamento confirmado!" → print;
     - se a volta não abrir o app: fechar a página — o app confere sozinho no `browserFinished` → print.
  3. **Eu**, só leitura:
     - a cobrança paga no `public`, com o NSU, o slug e o recibo;
     - a caixa: o webhook chegou com o `?schema=public` (`origem webhook`) e a volta pelo App Link (`origem volta`) — e qual chegou
       primeiro;
     - o recibo abre;
     - os logs das 2 funções sem erro novo, e o `ms` do webhook.

     Qualquer ❌ → NÃO ligar a flag: corrigir (task extra) e repetir este Step.
  4. **Desfazer:** a conta e a mensalidade do aluno de teste voltam à foto. A cobrança paga de R$ 1 FICA: é pagamento de verdade, no
     histórico do aluno de teste.
- [ ] **Step 6: Ligar para todos (com o OK dele — Pergunta 2)** —
  `update public.app_config set valor = '{"liberada": true}'::jsonb where chave = 'infinitepay'` (pela Management API, 1 comando).
  - Conferir na tela do Recebimento de uma conta de TESTE de produção que não é master: a opção aparece.
  - Memória e Validação: "InfinitePay liberada para os personais".

---

## Riscos (e o que segura cada um)

1. **Sem sandbox / formato não documentado.**
   - Já sondados em 11/10 (cabeçalho): o `/links`, a recusa (checkout desligado ou tag que não existe) e o `payment_check` de pedido que
     não existe.
   - Os leitores aceitam as 2 formas conhecidas (`url`/`payment_url`, `slug`/`invoice_slug`).
   - O caminho da baixa é provado no Deno local com o simulador (Task 11); o resto, contra a API de verdade sem cobrar (Task 12).
   - O que só um pagamento mostra (a volta, o recibo, o webhook) é conferido nos 2 R$ 1 da Task 22. Até lá, a flag esconde a
     InfinitePay dos personais.
2. **Webhook sem assinatura.**
   - Nada dá baixa sem o `payment_check` com a InfiniteTag e o preço **do link**.
   - Numa cobrança já paga, outro NSU só avisa (C1).
   - A caixa (link + NSU + slug) não deixa o forjado apagar o verdadeiro.
   - O limite por IP usa o `cf-connecting-ip`. Aviso novo só de link com até 72 h + 7 dias, até 20 por cobrança, corpo até 16 KB (I6).
   - A guarda de fonte prova que o webhook não grava cobrança.
3. **Função compartilhada** (a `pagamentos-aluno` e o webhook servem `staging` e `public`).
   - O `schemaTemW1` desliga o que é novo no schema sem a migration — e a migration é UMA, numa transação (I2).
   - O `cuidarDaInfinitePay` só roda na conta InfinitePay.
   - Smoke só leitura do `public` logo depois de publicar (Task 12, Step 3): o webhook do `public` responde 400 `schema_sem_w1`.
4. **A trava do inadimplente (W1-B1):** 72 h + `financeiro_do_aluno` + `resumoDaTrava` + a rodada de 15 min.
   - Fica uma janela de até 15 min no "A receber" do painel (o `dados.ts` lê `cobrancas` direto e é da hml-19d — não mexo). Ninguém
     fica travado por causa dela.
   - Um aviso "não pago" reagendado (I1) segura a tentativa vencida aberta por até ~22 h; a trava ignora a tentativa vencida.
5. **Navegador bloqueando a aba / App Link.**
   - A aba é reservada no toque, com volta na mesma aba se o navegador bloquear.
   - No APK, a tela confere ao fechar o Browser e ao voltar o app (o webhook confirma de qualquer jeito).
   - A rota de volta tem limite (> 500 caracteres, `linksDoApp.rotaValida`). O link no máximo deu 486 e a volta traz o recibo na busca:
     o 2º R$ 1 (Task 22, Step 5) prova pelo APK. Se passar do limite, a conferência ao voltar cobre.
6. **NSU repetido entre contas da InfinitePay:** o NSU é único por (InfiniteTag, NSU). O mesmo NSU em 2 cobranças da mesma tag vira
   `nsu_repetido` (aviso, sem baixa).
7. **Pagamento atrasado ou registrado à mão.**
   - A tentativa fechada que é paga depois volta como paga.
   - Registrar a mensalidade à mão com a tentativa aberta usa a MESMA linha; a confirmação depois só avisa (I5).
   - Sobra o caso da tentativa já FECHADA (72 h) paga depois de um registro à mão: o personal recebe "pagamento confirmado" e remove o
     manual (`prof_remover`).
8. **A LINUX 1 nos mesmos arquivos** (`logsDasFuncoesPrincipal.test.ts`, `e2e-rodadas.md`, `FinanceiroDoAluno.tsx`,
   `src/painel/aluno/dados/regras.ts`):
   - quadro + aviso antes + rebase (1 linha cada);
   - as travas do staging/main, uma por vez;
   - a máquina única (i3): `flock` + `--maxWorkers=2`.
9. **O limite de pedidos da InfinitePay** (não documentado). Poucos pedidos por desenho:
   - o link é reaproveitado;
   - a conferência só pelo pedido roda 1×/30 s;
   - a tela não gasta tentativa e só confere o que está na hora (I3);
   - o "Testar" vai até 10×/hora;
   - a rota pública tem teto (I6).

   Os testes criam poucos links. Cada link aparece na conta InfinitePay do Weslley: avisar no relatório.
10. **O barulho aceito pelo C1:** a cobrança paga só pelo pedido, e depois avisada pelo webhook, manda 1 aviso "confirmou de novo" ao
    personal (no máximo 1 por cobrança a cada 24 h). Vale até a Task 22 provar como a InfinitePay amarra o NSU.
11. **A variante (d) do C1** (o NSU e o slug de verdade usados em OUTRO pedido do mesmo valor, quando o 1º foi pago só pelo pedido): a
    sonda (c) da Task 22 decide. Com `paid: true`, a flag NÃO liga até a correção.

## Perguntas para ele

1. ~~Qual é a sua InfiniteTag?~~ **Respondida em 11/10.** A tag está no cofre ("InfinitePay — InfiniteTag do Weslley (testes da W1)") e
   em `~/.physiq-infinitetag-teste`, com o checkout externo ligado.
2. **Depois dos 2 testes de R$ 1 darem certo** (o do staging e o do APK na produção — Task 22), **posso ligar a InfinitePay para todos os
   personais na produção** (1 comando)? Ou você quer avisar alguém antes? Até lá ela fica escondida dos personais (o master vê).
3. **Devolução pelo app da InfinitePay:** quando o personal devolve um pagamento por lá, o Physiq não fica sabendo (a API não avisa
   estorno). Quer nesta W1 um botão "Marquei como devolvido" no financeiro do aluno (tira a cobertura), ou fica para depois? (O desenho não
   tem; o plano segue sem ele — se for agora, +20 a 30 min.)

---

## Self-review (feito ao escrever)

- **Revisão de 11/10 aplicada:** C1, I1–I7, os fatos da API sondados e os MENORES 1–4, 6, 8–10 e 12–16. Pulados: o 5, o 7 e o 11, com o
  motivo. A tabela "Revisão de 11/10", logo depois da estimativa, diz onde cada um entrou.
- **Cobertura do desenho (a seção 8 por cima):** §4.1 o personal escolhe a InfinitePay, cola a InfiniteTag, "Testar" sem cobrar → T9/T13;
  o master vê e desliga (Pix se houver chave, senão "não cobrar") → T5 (linha e contagem)/T14; o `mercadopago` do Weslley igual → T5
  (CHECK mantém; `contas_guard` só acrescenta)/T9 (`mp_so_master`). §4.2 Pagar → página por cima do app (Browser no APK, aba no site) → Pix ou
  cartão até 12× → volta paga sem comprovante → T10/T16; aviso "pagamento confirmado" ao personal (e ao aluno, como no MP) → T7; avulsa →
  T10/T16; todo mês de novo (sem automática) → T2 (`aceitaAutomatica` só no MP)/T16. §4.3 webhook → `payment_check` antes da baixa → T7/T8;
  sem webhook: "Conferir pagamento" + ao voltar → T10/T16; o recibo no histórico → T7/T15/T16. §4.5 W1: local → staging → R$ 1 → produção
  (em modo até o fim, o R$ 1 no FIM) → T11/T12/T18/T20/T21/T22. §5.1 dados → T5 (decisões 1–3). §5.2 edges → T8/T9/T10 (nomes do desenho:
  `aluno_ip_link`, `aluno_ip_conferir`, `prof_recebimento_salvar`, `prof_ip_testar`; mais `aluno_ip_volta`, `prof_recebimento`, `prof_chave_*`).
  §5.3 casos: troca de InfiniteTag (a gravada vale) → T1/T7/T10; webhook repetido / pago 2× → T1/T7; valor menor → T1/T7; fora do ar → T3/T10/T16;
  loja → T16/T18; logs sem dado → T8/T17. §5.4 testes → T1–T3/T11/T12/T16/T18. **§8:** a tentativa com prazo e o mesmo link → T1/T5/T6/T10;
  a conferência sem webhook (guardar o que vem na volta; testar só pelo pedido no 1º pagamento) → T10 (`aluno_ip_volta`)/T7
  (`conferirPeloPedido`)/T22; a trava no banco → T5 (`contas_guard` + `recebimento_integracao_ativa`); os "fechados" (`infinitepay`; colunas com
  prefixo em `cobrancas`; pg_cron no principal) → T5/T6; **P-B "1"** → T2/T15.
- **Spec-review (W1):** W1-B1 → T5/T6/T15; W1-B2 → T7/T10/T22; "link pago 2×" → T1/T7; "responder em 1 s" → T8 (`ms` na resposta, medido no
  `api.py`); "rota pública: só uuid de tentativa viva + limite por IP" → T8 (o pedido de um LINK nosso; aviso novo só de link com até
  72 h + 7 dias e até 20 por cobrança; limite por IP pelo `cf-connecting-ip` — I6; a baixa atrasada entra dentro da janela); "o dono
  liga os modos novos sem integração" → T5/T9; a lista fixa de modos: `master_conta_acao` (não muda — decisão 4), `master_integracoes` → T5, `ROTULO_RECEBIMENTO`/`tipos.ts` do master → T14, `ModoRecebimento`/`FormaCobranca` → T13,
  `podePagarPeloApp`/`formasDePagar` → T13, `exigirMp` (não muda: a InfinitePay tem o `exigirInfinitePay`), `Pagamentos.tsx:123` (o ramo novo) →
  T16, `situacaoDaCobranca` → T13; menores: a tela é `Recebimento.tsx` → T13; avisos novos como `geral` → T7; a volta ao app pelo App Link → T1
  (`urlDeVolta`)/T16/T22; LGPD (`customer` fora) → T1.
- **Pedidos desta tarefa:** o jeito 2 do `recebimento_chaves` (e de `contas`) → T4/T9/T13/T17 (a gravação do navegador sai; a função grava como
  a pessoa; o RLS fica de 2ª camada; prova na rede no `telas.py`); a migration `20261011200000` (UMA — I2) com `{schema}`, idempotente,
  dry-run, teste SQL no molde do `sql_planos.py` → T5/T6; função com `verify_jwt`, segredos (nenhum novo — e o S10 previsto se a InfinitePay mostrar assinatura),
  conferência na API antes da baixa, idempotência, schema certo → T7/T8/T12; testes Vitest, servidor (`--seco`, `--casos`, `--limpar`, massa
  desfeita) e tela (site, loja, prints em `prints/w1/{local,staging,prod}/`) → T11/T12/T18/T20/T21; validar sem pagar (link e conferência de
  verdade + o simulador) → T11/T12; o roteiro dos 2 R$ 1 (staging + APK na produção) e as sondas do C1 → T22; esteira (anti-sobrescrita
  isolado, quadro, ff no staging, migrations só no staging, publicar, E2E 1 por vez com `/health`; produção com backup, `pg_stat_activity`, PR → squash, release + bump, realinhar por lease,
  smoke só leitura + prints + logs) → T20/T21; pesado no `flock` e `--maxWorkers=2` → todas; arquivos da LINUX 1 intocados → cabeçalho; telas com
  `useConfirmar` e `grid-cols-1` + breakpoint → T13/T14/T16 (as guardas `semDialogoNativo`/`larguraCelular` rodam nelas).
- **Sem marcador pendente:** conferido. Onde o plano manda copiar (o corpo de `w27_conta_linha`/`master_integracoes`, a classe `Tela` do
  `wp/telas.py`, as fábricas de teste dos arquivos que já existem) ele diz de onde, com linha.
- **Nomes iguais em todas as tarefas:** `infinitepay` (modo e forma), `ip_handle`, `ip_link_url`, `ip_expira_em`, `ip_transaction_nsu`, `ip_slug`,
  `ip_recibo_url`, `ip_valor_pago`, `ip_parcelas`, `ip_meio`, `ip_conferido_em`; `recebimento_integracoes` (`infinitepay_handle`, `status`,
  `testado_em`); `infinitepay_links` (`pedido` = `<cobranca_id>-<n>`, `cobranca_id`, `n`, `handle`, `centavos`, `url`); `infinitepay_avisos`
  (`pedido`, `transaction_nsu`, `slug`, `origem`, `tentativas`, `tentado_em`, `proxima_em`, `conferido_em`, `resultado`);
  `recebimento_integracao_ativa`, `recebimento_infinitepay_salvar`, `recebimento_chave_ligar(p_conta, p_chave, p_ligar)`, `cobrancas_guard_infinitepay`,
  `contas_encerrada_sem_integracao`, `infinitepay_fechar_vencidas`, `infinitepay_rodada`, job `infinitepay-rodada-{schema}`; `schemaTemW1`,
  `linkDoPedido`, `ultimoLink`, `novoLink`, `registrarAviso`, `conferirAviso`, `conferirAvisosPendentes`, `conferirPeloPedido`, `fecharVencidas`,
  `decidirBaixa`, `depoisDaConferencia`, `deveReabrir`, `avisoNoPrazo`, `nsuDaBaixa`, `mesmoNsu`, `pedidoDoLink`, `lerPedidoDoLink`, `nsuDoPedido`,
  `podeReaproveitar`, `urlDeVolta`, `urlDoWebhook`, `pedidoDeTeste`, `modalidadesPermitidasNoPlano`, `rotuloDaModalidade`, `lerPedidoDoRecebimento`,
  `chaveDoPedido`, `COLUNAS_CHAVE`, `COLUNAS_COBRANCA_IP`, `dbPessoa`, `colunasCobranca`, `cobrancaComApagada`, `aguardando_ip`; nas telas
  `data-opcao="infinitepay"`, `data-infinitetag`, `data-infinitepay-testar`, `data-pagar-ip`, `data-ip-pagar`, `data-ip-conferir`,
  `data-ip-aguardando`, `data-pagamento-ip`, `data-recibo-infinitepay`, `data-desligar-infinitepay`, `data-infinitetag-da-conta`,
  `data-infinitepay-ativar`; o erro `infinitepay_checkout_desligado` (com o `ativar`).
- **Pontos que conferi no código antes de escrever:** onde o navegador grava hoje (`Recebimento.tsx:75`, `RecebimentosLista.tsx:52/55/70`,
  `RecebimentoPixDialog.tsx:67/68`); o corpo vivo de cada função SQL trocada; a política de `recebimento_chaves` ("dono e membro da chave" +
  master — por isso o `dbPessoa` basta); o `avisos.tipo` com `pagamento_confirmado` e `geral`; `pg_net`/`pg_cron`/Vault no principal e o molde
  `automaticas_disparar`; o `checar-definer` (R1–R3b) e o `checar-funcoes` (R1–R4) do CI; o `logsDasFuncoesPrincipal.test.ts` (a lista de
  funções); o `tempo.ts`/`log.ts` com cópia no Treino (não mexo); o `@capacitor/browser` já no `package.json`; o App Link de `/perfil` e
  `/pagamentos` no `AndroidManifest.xml`; o Deno 2.5.2 em `~/.deno/bin/deno`; a `main` = staging = `c9be9a0` (W-P dentro).
