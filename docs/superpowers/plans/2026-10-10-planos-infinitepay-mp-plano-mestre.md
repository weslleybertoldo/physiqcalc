# Planos do aluno + recebimento (W-P → W1 → W2) — Plano mestre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o personal cria os planos do aluno (quanto e por quanto tempo — W-P) e passa a receber direto na InfinitePay dele (W1) e no Mercado
Pago dele (W2), tudo dentro da cobrança que já existe (mesmas telas, histórico e avisos).

**Architecture:** banco PRINCIPAL (`hkxvtsbwctxkrqzkkdoz`, schemas `staging` e `public`, migrations com `{schema}`) + a edge
`pagamentos-aluno` (UMA função para os 2 schemas: o que é novo só liga quando a coluna nova existe naquele schema — o molde do
`COLUNAS_MATRICULA_W6`). Regras puras num módulo só (`supabase-principal/functions/_shared/*-regras.ts`), reexportado pela tela.
Cada entrega = 1 worktree/branch, esteira pessoal local → staging → produção.

**Tech Stack:** Postgres (pg_cron e pg_net já existem no principal), Deno edge functions, React + Vite + Capacitor, Vitest, E2E em Python +
Playwright (`--canal msedge`).

**Entradas (valem nesta ordem de precedência):**
- Desenho dos planos: `docs/superpowers/specs/2026-10-10-planos-do-aluno-design.md` (a seção 7 vale por cima das 3 e 4).
- Desenho W1/W2: `~/Desktop/Physiq - InfinitePay/Physiq - InfinitePay e Mercado Pago do personal - desenho aprovado - 2026-10-10.md`
  (a seção 8 vale por cima das 4 e 5).
- Spec-review: `~/projetos/physiqcalc-scratch/migracao-yuri/spec-review-planos-e-recebimento.md`; mapa: `…/migracao-yuri/destino-physiq.md` (E e F).
- Plano detalhado da W-P: `docs/superpowers/plans/2026-10-10-w-p-planos-do-aluno.md`. W1 e W2: o detalhado é escrito na hora de começar
  cada uma (depois da resposta da P-B e da prova da W2).

---

## 0. Regras que valem para as 3 entregas

- **Ordem (decisão dele, 10/10):** W-P → W1 → W2. A migração do Yuri está pausada (volta quando ele pedir; ver §6).
- **Uma worktree por vez.** Cada entrega nasce de `origin/main` atualizado (a W-P reaproveita a `~/projetos/physiqcalc-planos`, branch
  `feat/planos-do-aluno`, rebase na `origin/main` — a hml-18a já entrou, v3.95).
- **Esteira pessoal** (`skill-wbs-deploy-local-staging-prod-pessoal`): local (testes + link com prints) → **OK** → staging (link com
  prints) → **OK** → produção. Commit/PR com autor `Weslley Bertoldo <55102421+weslleybertoldo@users.noreply.github.com>`; a versão
  (package.json + APK) sobe sozinha no merge (job `bump` do `build-apk.yml`) — não bumpar à mão.
- **Sessão paralela (LINUX 1, hml-18b — só front de velocidade, não toca financeiro):** número de migration reservado no quadro
  `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` ANTES de criar; push no `staging` e merge na `main` = um por vez, com
  `SendMessage` à LINUX 1 antes; check anti-sobrescrita (`git fetch` + `git worktree list` + `gh pr list`) num comando isolado antes de
  cada promoção.
- **E2E:** um por vez, leves, com a guarda de `/health` (`saude_treino()` do `e2e/w06/_base.py`) antes de cada um; nada de série longa no
  staging (o banco do Treino travou hoje às 16:07). Linha de cada rodada em `docs/e2e-rodadas.md` no PR da entrega.
- **Telas:** `useConfirmar()` (`src/ui/premium/useConfirmar.ts`), nunca `window.confirm` (`semDialogoNativo.test.ts`); toda grade com
  `grid-cols-1` + breakpoint (`larguraCelular.test.ts`); versão da loja (`ehLoja`): o pagamento aluno → profissional continua, nada
  libera recurso do app.
- **Função compartilhada:** `pagamentos-aluno`, `mp-webhook-aluno` (e na W1/W2 as novas) servem `public` e `staging` ao mesmo tempo.
  Toda mudança nelas fica DESLIGADA no schema que ainda não tem a migration (fallback de colunas) e é publicada na fase local —
  isso está no OK do plano (gate G0) de cada entrega.
- **Segredos:** nada de token, handle, chave ou segredo em log, repo ou `VITE_*`; credenciais pelo cofre (`mcp__bcode-segredos__ler_segredo`).

## 1. Resumo das 3 entregas (minutos, mínimo–máximo, com testes e checagens finais; sem a espera dos OKs dele)

```
+---------+-----------+--------+----------+--------+--------+---------------+---------------------------+-------------+
| Entrega | Preparar  | Banco  | Servidor | Painel | App    | Testes locais | Local → staging → produção| TOTAL       |
+---------+-----------+--------+----------+--------+--------+---------------+---------------------------+-------------+
| W-P     | 35–60 (1) | 45–75  | 70–110   | 55–90  | 45–75  | 35–60         | 70–130                    | 355–600     |
| W1      | 15–30     | 50–80  | 90–140   | 45–75  | 45–70  | 35–60         | 75–130                    | 355–585     |
| W2      | 35–60 (2) | 50–80  | 150–240  | 40–70  | 40–80  | 45–75         | 70–120                    | 430–725     |
+---------+-----------+--------+----------+--------+--------+---------------+---------------------------+-------------+
| TOTAL   |           |        |          |        |        |               |                           | 1140–1910   |
+---------+-----------+--------+----------+--------+--------+---------------+---------------------------+-------------+
(1) W-P: preparar 10–20 + regras puras com testes 25–40.  (2) W2: inclui a prova da chave pública com usuário de teste do MP.
```

Total: **1.140 a 1.910 min = 19h00 a 31h50** de trabalho (cerca de 3 a 4 dias com as esperas dos OKs).

## 2. Gates do Weslley (iguais nas 3 entregas, mais os específicos)

| Gate | Quando | O que ele faz |
|---|---|---|
| G0 | antes de começar a entrega | OK do plano + OK de publicar as funções compartilhadas na fase local (a parte nova fica desligada no `public` até a migration de produção) |
| G1 | fim do local | valida o link local (`localhost:8080`, build de staging) + os prints (painel e app, site e loja) → "ok" |
| G2 | fim do staging | valida `physiqcalc-staging.vercel.app` + prints → "ok" = pode ir para produção |
| W1-a | antes do G2 da W1 | paga R$ 1,00 de verdade no staging com a conta InfinitePay dele (não existe sandbox) |
| W2-a | antes de começar a W2 | cadastra o endereço de retorno (redirect URI de produção e de staging) na aplicação do MP do Physiq — guiado 1 passo por mensagem |
| P-C | só se a prova da W2 falhar | responde a P-C |

## 3. Decisões dele (fechadas) e a pergunta pendente

- **P-A — FECHADA, "1" (10/10/2026):** plano mês a mês com a cobrança automática ligada: depois da última parcela o plano **renova
  sozinho** e continua cobrando (a assinatura do MP segue sem data de fim; a contagem volta para "parcela 1 de N"). Tarefa 16 da W-P.
- **P-B — FECHADA, "1" (10/10/2026):** nas contas que recebem pela InfinitePay, "à vista" e "cartão parcelado" viram **uma modalidade
  só, "pagar o período todo"** (o aluno escolhe Pix ou cartão até 12× na página da InfinitePay). Na W1: `modalidadesDaConta('infinitepay')`
  = `["avista", "mensal"]`, o `avista` aparece como "Período todo (Pix ou cartão até 12×)" e o aluno que estava em `cartao_parcelado`
  paga como período todo (mesma cobertura). Tarefa W1-T03 (regra + rótulos + teste).
- **P-C — PENDENTE, só se a prova da W2 falhar (confirmar com ele):** sem a chave pública do personal o cartão do aluno não roda no
  app. **Padrão:** o cartão abre a **página do Mercado Pago** (checkout do MP com o token da conta, como a InfinitePay). Tarefa isolada W2-T05.

## 4. As entregas

### 4.1 W-P — Planos do aluno (detalhado em `2026-10-10-w-p-planos-do-aluno.md`)

**Objetivo:** aba **Planos** no Financeiro (nome, duração em meses, valor do período, modalidades aceitas, até X parcelas, parcela do mês a
mês, ativo/desativado); o personal põe o aluno num plano na ficha (plano, modalidade, valor negociado, 1º vencimento); o aluno paga em
Perfil › Pagamentos o valor certo (período todo, cartão parcelado ou a parcela "4 de 12") e vê "Renovar plano" no fim; quem está no modo
de hoje continua igual (B1).

| Fase | O que entra | Min–máx |
|---|---|---|
| Preparar | rebase na `origin/main` (v3.95), reservar migrations no quadro, avisar a LINUX 1, testes de base | 10–20 |
| Regras puras | `_shared/planos-regras.ts` (valor do pagamento, meses cobertos, parcelas, formas × modo da conta, automática, renovar, textos, validar plano) + `_shared/planos-automatica.ts` (I1, com o PUT simulado) + Vitest | 25–40 |
| Banco | 2 migrations (colunas, valor por gatilho, propagação, `mensalidade_recalcular` da w07b com `meses_cobertos`/`parcela_num`, `financeiro_do_aluno` + modalidade; trava I5 e a policy de `planos_aluno`) + `e2e/wp/sql_planos.py` (rollback) + regressão "pago até igual para todos" + aplicar no staging + `hml01/banco.py` | 45–75 |
| Servidor | `financeiro-mp.ts` (colunas com fallback, retrato na assinatura), `pagamentos-aluno` (`prof_planos`, `prof_plano_salvar`, `prof_plano_ativo`, `prof_definir` novo + modo de hoje, I1 em toda troca de valor, cartão parcelado, automática só onde cabe, retrato nos 4 inserts, `mensalidade` com modalidade/parcela, resumo com modalidade) + publicar as 2 funções + `e2e/wp/api.py` | 70–110 |
| Painel | aba Planos + diálogo, ficha do aluno (`PlanoDoAluno.tsx`), "/mês" → sufixo + testes (o pedido do `import()` do `pdfDoRecibo` foi retirado pela LINUX 1: o `pdfRecibo.ts` já carrega o `reciboPdf` no clique) | 55–90 |
| App | `CartaoPagamento` com `maxParcelas` (padrão 1), Pagamentos (plano, parcela, Renovar), PagarMercadoPago (parcelas e automática), faixa do topo + testes site e loja | 45–75 |
| Testes locais | Vitest inteiro, `tsc`, lint, build site e loja, `e2e/wp/telas.py` site e loja (1 por vez), prints conferidos | 35–60 |
| Local → staging → produção | G1 (ajustes), PR + push no `staging` (avisando a LINUX 1) + E2E de staging + G2, backup + 2 migrations no `public` + regressão + tipos + merge + smoke de produção + Validação | 70–130 |
| **Total** | | **355–600** |

- **Arquivos:** novos `supabase-principal/functions/_shared/planos-regras.ts`, `…/_shared/planos-automatica.ts`, `src/financeiro/planos.ts`,
  `src/painel/financeiro/Planos.tsx`, `src/painel/financeiro/PlanoDialog.tsx`, `src/financeiro/ui/PlanoDoAluno.tsx`, `e2e/wp/{sql_planos,api,telas}.py`
  + testes; alterados `…/_shared/financeiro-mp.ts`, `…/pagamentos-aluno/index.ts`, `…/pagamentos-aluno/mensalidades.ts`,
  `src/financeiro/{tipos,api,regras}.ts`, `src/financeiro/ui/FinanceiroDoAluno.tsx`, `src/painel/financeiro/{financeiroUtil.ts,Mensalidades.tsx}`,
  `src/painel/paginas/Financeiro.tsx`, `src/painel/configuracoes/plano/CartaoPagamento.tsx`, `src/app-aluno/perfil/Pagamentos.tsx`,
  `src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx`, `src/integrations/principal/types.ts` (gerado), `docs/e2e-rodadas.md`.
- **Migrations previstas:** `20261011010000_wp_planos_modalidades.sql` e `20261011020000_wp_trava_cobranca.sql` (reservar no quadro; se
  o número já tiver dono, o próximo livre depois de `20261010100000_hml17…`).
- **Depende de:** nada novo (a hml-18a já está na `main`). **Destrava:** W1 e W2 (as modalidades por forma de receber e o retrato na
  linha da cobrança são reaproveitados).
- **Riscos:** (1) régua de cobertura reescrita mexer no "pago até" de alunos de hoje → modalidade nula = nada muda + regressão SQL
  "recalcula todos e compara" (0 diferenças) no staging e no `public` + backup; (2) a função compartilhada com o `public` sem a
  migration → fallback de colunas + smoke só leitura no `public` logo depois de publicar; (3) a cobrança automática do MP ficar com o
  valor velho → I1 em toda troca + aviso ao dono quando o MP recusar; (4) mínimo por parcela no cartão parcelado (não documentado) →
  testar no sandbox com plano barato antes do G1.

### 4.2 W1 — InfinitePay

**Objetivo:** em Configurações › Recebimento o dono escolhe **InfinitePay**, cola a InfiniteTag e toca em "Testar"; o aluno toca em
"Pagar", a página da InfinitePay abre por cima do app (Pix ou cartão até 12×), volta e a cobrança aparece paga (sem comprovante); o
personal recebe "pagamento confirmado". Vale para mensalidade/plano e para a cobrança avulsa.

| Fase | O que entra | Min–máx |
|---|---|---|
| Preparar | rebase, quadro, plano detalhado da W1 (writing-plans; a P-B já está decidida) | 15–30 |
| Banco | migration W1: `recebimento_modo` + `infinitepay`; `recebimento_integracoes` (1 por conta, handle; sem grant para o app); `cobrancas.forma` + `infinitepay`; colunas `ip_handle`, `ip_link_url`, `ip_expira_em` (72 h), `ip_transaction_nsu` (único parcial), `ip_slug`, `ip_recibo_url`, `ip_valor_pago`, `ip_parcelas`, `ip_meio`; `contas_guard` (do corpo da w28) recusa `infinitepay` fora do servidor; `financeiro_do_aluno` ignora tentativa vencida no `aguardando`; `master_conta_acao` (w27) e `master_integracoes` (hml14d) com o modo novo; job do pg_cron que confere tentativas com NSU e não pagas e vence as de 72 h | 50–80 |
| Servidor | `pagamentos-aluno`: `aluno_ip_link` (reaproveita o link enquanto vale; `order_nsu` = `cobrancas.id`; retrato da W-P), `aluno_ip_volta` (grava `transaction_nsu`/`slug`/`receipt_url` da volta), `aluno_ip_conferir`, `prof_recebimento_salvar`, `prof_ip_testar` (link de R$ 1,00); nova `infinitepay-webhook-aluno` (verify_jwt false: grava o NSU pelo `order_nsu` de tentativa viva, limite por IP, responde 200 rápido e confere em 2º plano com o `payment_check` — compara o `amount`; idempotente por `transaction_nsu`; 2º pagamento da mensalidade = mais um pagamento; avulsa já paga = registra e avisa) + Vitest com o fetch simulado | 90–140 |
| Painel | `src/painel/configuracoes/Recebimento.tsx` (InfinitePay + Testar, grava pela função), `src/master/paginas/Integracoes.tsx`, `src/master/regras.ts` (`ROTULO_RECEBIMENTO`), `src/master/tipos.ts`, `FinanceiroDoAluno.tsx` (recibo da InfinitePay, `MODO_TEXTO`) | 45–75 |
| App | `src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx` (novo: `@capacitor/browser` no APK, nova aba no site; "Conferir pagamento"; confere ao voltar), `Pagamentos.tsx` (modo novo), `src/financeiro/tipos.ts` (`FormaCobranca`, `ModoRecebimento`), `src/financeiro/regras.ts` (`podePagarPeloApp`, `formasDePagar`, `situacaoDaCobranca`, `rotuloDaForma`) | 45–70 |
| Testes locais | Vitest, `tsc`, lint, build site e loja, E2E do personal (ligar/testar/desligar) e do aluno (pagar/conferir) — o pagamento em si só no staging | 35–60 |
| Local → staging → produção | G1, staging + **pagamento real de R$ 1,00** com a conta dele (W1-a) + teste do `payment_check` só com `handle` + `order_nsu` + G2, produção | 75–130 |
| **Total** | | **355–585** |

- **Migration prevista:** `20261012010000_w1_infinitepay.sql` (reservar no quadro).
- **Depende de:** W-P (retrato do plano, `modalidadesDaConta`). **Destrava:** W2 (guarda de `recebimento_modo`, `prof_recebimento_salvar`,
  a tela de Recebimento pela função).
- **P-B decidida ("1"):** "período todo" nas contas `infinitepay` (ver §3) — tarefa W1-T03.
- **Riscos:** sem sandbox (só pagamento real); webhook sem assinatura (só baixa depois do `payment_check`); resposta do `POST /links`
  não documentada (ler `url`, reserva `payment_url`) e valor mínimo desconhecido (o "Testar" usa R$ 1,00); tentativa "aguardando" sem
  prazo soltaria a trava do inadimplente (72 h + `aguardando` ignora vencida); a volta ao app por App Link só no domínio de produção
  (no staging, "o app voltou → confere").

### 4.3 W2 — Mercado Pago do personal

**Objetivo:** o dono toca em "Conectar Mercado Pago" (OAuth), volta conectado, e o aluno paga como hoje no MP (Pix, cartão e cobrança
automática) com o dinheiro caindo na conta do personal; renovação automática do acesso; desconectar/trocar de forma cancela as
automáticas dos alunos na conta dele (com aviso).

| Fase | O que entra | Min–máx |
|---|---|---|
| Preparar | pré-requisito dele (W2-a); usuários de teste do MP (vendedor + comprador); **prova**: trocar um `code` de teste no `/oauth/token` e ver se vem `public_key` (se não vier → P-C); plano detalhado | 35–60 |
| Banco | migration W2: `recebimento_modo` + `mercadopago_conta`; `recebimento_integracoes` + `mp_user_id`, `mp_public_key`, tokens **cifrados**, `mp_expira_em`, `status` (ativa · erro · desconectada), sem grant para `anon`/`authenticated`; tabela do `state` de uso único (10 min); `mp_credencial` em `cobrancas` e `aluno_assinaturas`; guarda; master; job diário do pg_cron (pg_net → edge) que renova o que vence em < 30 dias | 50–80 |
| Servidor | `_shared/cifra.ts` (AES-GCM `v1:<iv>:<cifrado>`, `conta_id` como dado associado, chave nos segredos das funções) + testes; `_shared/credencial-mp.ts` (qual token usar por matrícula/cobrança; 401 → `erro` + aviso ao dono); `prof_mp_conectar` (URL com `state` assinado de uso único + PKCE), `prof_mp_desconectar` (cancela as automáticas na conta dele + avisos); o token da conta em TODAS as chamadas do MP (`conferir`, `conferirAssinatura`, `aluno_mp_*`, `prof_cobranca_cancelar`, `prof_reembolsar`, `detalhe_mp`, `exigirMp` e os `=== "mercadopago"`); `aluno_status` com a chave pública do vendedor; nova `mp-conectar-retorno` (GET, verify_jwt false); `mp-webhook-aluno` (`&conta=<id>` + confere o `user_id`; tópico `mp-connect`); `_shared/exclusao-profissional.ts`; edge de renovação | 150–240 |
| Painel | Recebimento: "Conectar Mercado Pago", situação, "Desconectar"; master Integrações (vê e desliga) | 40–70 |
| App | `src/components/pagamentos/mpInit.ts` reinicia o SDK pela chave do vendedor; `CartaoPagamento` recebe a chave por prop — ou, com a P-C, o cartão abre a página do MP | 40–80 |
| Testes locais | Vitest (cifra, state, escolha da credencial, cancelamento ao trocar), edge com fetch simulado (`/oauth/token`, renovação, 401), E2E com os usuários de teste (site e loja) | 45–75 |
| Local → staging → produção | G1, staging com os usuários de teste + G2, produção | 70–120 |
| **Total** | | **430–725** |

- **Migration prevista:** `20261013010000_w2_mp_da_conta.sql` (reservar no quadro).
- **Depende de:** W1 (guarda e tela de Recebimento) e W-P. **Pré-requisito dele:** W2-a.
- **Tarefa isolada P-C (só se a prova falhar; confirmar com ele):** padrão = abrir a página do MP (ver §3).
- **Riscos:** a chave pública do vendedor pode não vir no OAuth (P-C muda o fluxo do cartão); vazamento de token (cifra fora do banco,
  nada em log); renovação falhar (acesso de 180 dias) → aviso ao dono e "conectar de novo"; automáticas órfãs ao desconectar → cancelar
  antes de trocar o modo.

## 5. Os 3 maiores riscos do conjunto (e o que segura cada um)

1. **Função compartilhada entre staging e produção** (as 3 entregas publicam `pagamentos-aluno`/webhooks antes do `public` ter a
   migration): tudo o que é novo só liga com a coluna nova presente (fallback testado), smoke só leitura no `public` logo depois de
   publicar, e o OK do G0 cobre a publicação.
2. **"Pago até" e valor de alunos de hoje** (W-P reescreve `mensalidade_recalcular` e põe gatilho no valor): modalidade nula = modo de
   hoje, regressão SQL que recalcula todos dentro de um bloco desfeito e compara (tem que dar 0 diferenças), backup antes do `public`.
3. **APIs de fora sem rede de proteção** (InfinitePay sem sandbox e sem assinatura no webhook, resposta do `/links` não documentada;
   MP sem a `public_key` na doc do OAuth): pagamento real de R$ 1,00 no staging, baixa só depois do `payment_check`, prova da chave
   pública ANTES do plano da W2 e a tarefa isolada P-C (com o padrão pronto).

## 6. Decisões técnicas minhas (aparecem no OK do plano)

- FK de `plano_aluno_id` continua `ON DELETE SET NULL` (o desenho 4.1 pedia `restrict`): a regra "plano com aluno não apaga" fica
  garantida por não existir ação de apagar e pela escrita direta em `planos_aluno` ficar só para o master (I5). O `restrict` poderia
  travar a exclusão de conta do profissional (que apaga os planos em cascata) — não verificado o bastante para mexer.
- Texto do WhatsApp ("Sua mensalidade de {valor}…") **fica como está** nesta fase: é o modelo editável pelo personal e já serve à
  avulsa; trocar exigiria reescrever o `whatsapp_enfileirar` (cron de 170 linhas) por uma palavra.
- I2 (semente do "pago até" da migração do Yuri) **fica para quando a migração voltar**: o desenho dela (histórico × semente) não está
  fechado e uma coluna sem uso agora seria chute.

## 7. Depois de cada entrega

- Foto do andamento (`andamento_worktrees.py … --atual`) no tópico; `~/Desktop/Plano de Retorno Pessoal/Physiq/andamento-physiq-planos-e-recebimento.json`
  atualizado (status, `duracao_min`, tag `PR #… · v3.xx`).
- Resumo no grupo Validação (`remoto_validacao`, tópico do Physiq); linha ✅ no quadro `quem-toca-o-que.md`; `claude-orfaos.sh`.
