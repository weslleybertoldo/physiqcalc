# Planos do aluno criados pelo profissional — desenho aprovado — 10/10/2026

## 0. Status

- **Desenho APROVADO pelo Weslley em 10/10/2026**, por partes (respostas abaixo). **Nada implementado.**
- Motivo: a migração dos dados do Yuri Ferreira (WebDiet + Personal Fit) precisa disso antes. Palavra dele: *"Antes de migrar vamos
  precisar mexer nessa parte de planos do aluno. Ex: aluno vinculado ao personal, paga ao personal e segue os planos do personal, seja
  mensal/semestral/anual etc. Quem vai criar os planos é o próprio personal."*
- Ordem das entregas (decisão dele, 10/10): **1) Planos do aluno → 2) migração do Yuri → 3) InfinitePay (W1) → 4) Mercado Pago do
  personal (W2)**. W1/W2 = `~/Desktop/Physiq - InfinitePay/Physiq - InfinitePay e Mercado Pago do personal - desenho aprovado - 2026-10-10.md`
  ("Acredito que ele é complemento"): os planos dizem **quanto e por quanto tempo**; W1/W2 dizem **para onde vai o dinheiro**.
- **Atualização 10/10 ~19h20:** a migração do Yuri ficou **pausada** (ele: *"deixa pausado essa task. Vamos seguir somente com as
  que passei"*) → ordem de agora: **Planos → W1 InfinitePay → W2 MP do personal**; a migração (parte 5) volta quando ele pedir.
- Próximos passos: `dev:spec-review` deste desenho e do W1/W2 contra o código e o banco atuais → `superpowers:writing-plans` →
  foto do plano → **OK dele antes de começar** → esteira pessoal (local → link → staging → OK → produção).

## 1. Decisões (respostas dele, 10/10/2026)

| # | Pergunta | Resposta |
|---|---|---|
| P1 | Quem escolhe o plano do aluno? | **O personal, na ficha do aluno** ("1") |
| P2 | Como paga um plano mais longo? | **O personal define em cada plano**: à vista (PIX/cartão), cartão parcelado (o valor cai todo de uma vez) ou mês a mês (1 parcela por mês) ("3"; ele confirmou o entendimento com o exemplo do plano anual) |
| P3 | Fim do período | **O aluno renova sozinho, pagando o mesmo plano no app** ("1") |
| P4 | Preço diferente por aluno | **Sim**: valor negociado na ficha do aluno ("1") |
| P5 | Mês a mês pelo cartão | Aluno paga cada parcela no app **ou** liga a cobrança automática no cartão (que já existe hoje na mensalidade) ("1" depois da minha correção — eu tinha dito, errado, que a automática era parte nova) |
| P6 | Caminho | **Aproveitar o que já existe** ("Vamos seguir com a 1"): cada pagamento empurra o "pago até"; sem calendário de parcelas criado de antemão |
| P7–P11 | Partes 1 a 5 do desenho (seção 3) | "Sim" em cada |

## 2. Como é hoje (conferido no código da `main` v3.94 e no esquema, 10/10)

- `planos_aluno` (`supabase-principal/migrations/20260929030000_w02_nucleo.sql`): `conta_id`, `nome` (único na conta), `valor`,
  `ativo` — **sem duração nem formas**. Usam hoje: os 2 planos do app "sem profissional" e ~3 planos de personal criados só com
  **nome** (a virada do Calc, `scripts/virada/02_pagamentos_alunos.py:300`, e o `plano_novo` do `prof_definir`); o profissional **não
  tem tela de planos**: põe um valor de mensalidade em cada aluno (corrigido pelo spec-review, B1).
- `pacientes` (`…w06_financeiro_aluno.sql`): `plano_aluno_id`, `mensalidade_valor`, `cobranca_pausada`, `mensalidade_desde`,
  `mensalidade_pago_ate` (calculado por gatilho), `financeiro_migrado_em`.
- `cobrancas`: `tipo` mensalidade/avulsa, `status` aberta/paga/cancelada/aguardando_confirmacao, `valor`, `vencimento`, `mes_ref`,
  `pago_em`, `forma` pix_manual/mp/manual, `transacao_id`. **Cada mensalidade paga cobre 1 mês** (`mensalidade_recalcular`,
  `…w06…sql:103-161`); com assinatura MP `authorized`, o dia do próximo débito manda no ciclo.
- `aluno_assinaturas`: cobrança automática no cartão (Mercado Pago, `preapproval`) — o aluno liga em Meu plano/Pagamentos.
- Pagamento do aluno: edge `pagamentos-aluno` (PIX manual com comprovante, PIX/cartão MP com `installments: 1`, assinatura MP);
  telas `src/app-aluno/perfil/MeuPlano.tsx`, `Pagamentos.tsx`, `pagamentos/PagarMercadoPago.tsx`; painel
  `src/financeiro/ui/FinanceiroDoAluno.tsx`, `src/painel/financeiro/Mensalidades.tsx`; regras `src/financeiro/regras.ts`.
- Nada gera mensalidade sozinho (sem cron); "vencido" = cobertura no passado → faixa vermelha, "a receber" e trava do app só se
  `contas.bloquear_app_inadimplente`. O cron `cobrancas-bloqueio` (03:30) age em cobrança `aberta` vencida.

## 3. O desenho (aprovado por partes)

### 3.1 Parte 1 — tela de planos (painel › Financeiro › Planos)
Cada plano tem: **nome** · **duração em meses** (1 = mensal, 3 = trimestral, 6 = semestral, 12 = anual…) · **valor do período
todo** · **formas aceitas** (marca quais): à vista (PIX ou cartão) · cartão parcelado em até X vezes · mês a mês (parcela = valor ÷
meses, ou um valor de parcela escolhido) · **ativo/desativado** (desativado some da lista de novos; quem já está nele continua).

### 3.2 Parte 2 — ficha do aluno (financeiro do aluno, no painel)
O personal escolhe **plano** (só os ativos) · **forma** (só as que o plano aceita) · **valor negociado** (opcional; vazio = valor do
plano) · **início** (vencimento do 1º pagamento; padrão hoje). Vê "pago até", o estado (em dia / vencendo / atrasado / renovar),
"parcela 4 de 12" no mês a mês e o histórico (como hoje). Trocar de plano vale a partir do próximo pagamento; o que já foi pago
continua valendo. "Pausar cobrança" e "registrar pagamento manual" continuam iguais.

### 3.3 Parte 3 — app do aluno (Meu plano / Pagamentos)
Mostra plano, "pago até" e o próximo pagamento (valor e data). "Pagar" cobra conforme a forma: **à vista** = valor todo (PIX ou
cartão 1×), cobre o plano todo · **cartão parcelado** = valor todo em até X vezes, cobre o plano todo · **mês a mês** = a parcela
(PIX ou cartão), "parcela 4 de 12", ou com a cobrança automática ligada. Fim do período → **"Renovar plano"** (mesmo plano e forma,
salvo se o personal trocar). Atraso igual a hoje.

### 3.4 Parte 4 — regras
- Alunos de hoje (só mensalidade, sem plano) continuam iguais; o personal passa cada um para um plano quando quiser.
- Mudar o valor de um plano vale a partir do próximo pagamento de quem está nele; **quem tem valor negociado não muda**.
- Plano com aluno não pode ser apagado, só desativado.
- Quem cria e edita os planos: **o dono da conta**.

### 3.5 Parte 5 — migração do Yuri (entrega 2, depois desta)
Os planos que ele usa viram planos dele no Physiq (eu crio, ele revisa) · cada aluno ativo entra com plano, forma, valor negociado e
"pago até" · pagamentos antigos entram como histórico (pagos), sem gerar cobrança nem aviso · inativos sem cobrança · **ativos com a
cobrança pausada** até o Yuri conferir o "pago até" de cada um.

### 3.6 Formas × forma de receber da conta (achado ao cruzar com o W1/W2, 10/10)
| `contas.recebimento_modo` | À vista | Cartão parcelado | Mês a mês | Cobrança automática |
|---|---|---|---|---|
| `pix_manual` (hoje: 9 contas) | só PIX (comprovante) | — | só PIX | — |
| InfinitePay (W1) | PIX ou cartão | o aluno escolhe até 12× na página da InfinitePay (pela doc, não dá para travar o "até X") | PIX ou cartão | — (a API não tem) |
| Mercado Pago (o do Weslley hoje; o do personal na W2) | PIX ou cartão 1× | até X (o plano manda) | PIX ou cartão | sim (`preapproval`) |
A tela de planos e a ficha do aluno só oferecem o que a conta consegue receber; o app do aluno idem.
**P-B (respondida por ele, 10/10 ~20h25, "1"):** nas contas **InfinitePay**, "à vista" e "cartão parcelado" viram **uma modalidade só,
"pagar o período todo"** (o aluno escolhe Pix ou cartão até 12× na página da InfinitePay).

## 4. Proposta técnica (para o `dev:spec-review` confirmar)

### 4.1 Dados (migration versionada no principal, `staging` e `public`)
- `planos_aluno`: `meses int not null default 1` (1–24), `formas text[] not null default '{avista}'` (⊂ `avista`,
  `cartao_parcelado`, `mensal`), `max_parcelas_cartao int` (2–12, só com `cartao_parcelado`), `valor_parcela_mensal numeric`
  (nulo = `round(valor/meses, 2)`), `desativado_em`. Padrões mantêm os 2 planos do app "sem profissional" iguais (1 mês, à vista).
- `pacientes`: `plano_forma text` (`avista`/`cartao_parcelado`/`mensal`), `plano_valor_negociado numeric` (nulo = segue o plano;
  é o **valor de cada pagamento na forma escolhida**: o período todo no à vista/cartão parcelado, a parcela no mês a mês).
  **`mensalidade_valor` passa a ser o "valor do próximo pagamento"** (o resto do módulo já lê ele: selos, "a receber", vencido),
  recalculado por gatilho quando o plano, a forma ou o valor negociado mudam. `mensalidade_desde` = início.
- `cobrancas`: `meses_cobertos int not null default 1` (à vista/cartão parcelado = `meses` do plano; mês a mês = 1),
  `plano_aluno_id` (retrato), `parcela_num`/`parcelas_total` (só mês a mês, para "parcela 4 de 12").
- `mensalidade_recalcular`: cada cobrança paga empurra o "pago até" em `meses_cobertos` meses (hoje é sempre 1).
- Plano em uso não apaga (FK `restrict` + ação "desativar").

### 4.2 Servidor (`pagamentos-aluno`, mesmo padrão das ações de hoje)
- Profissional: salvar/desativar plano (dono da conta); `prof_definir` aceita `plano_aluno_id` + `plano_forma` +
  `plano_valor_negociado` + início.
- Aluno: `aluno_status` devolve plano, forma, valor e data do próximo pagamento, parcela n/N e "renovar"; `aluno_mp_pix`/`aluno_mp_cartao`
  cobram o valor certo e gravam `meses_cobertos`; cartão parcelado manda `installments` escolhido pelo aluno ≤ `max_parcelas_cartao`;
  `aluno_mp_assinar` só no mês a mês, com o valor da parcela; PIX manual: `prof_confirmar` grava `meses_cobertos` conforme a forma.

### 4.3 Telas
Painel: aba **Planos** no Financeiro (lista + criar/editar/desativar) e o bloco de plano no financeiro do aluno. App: Meu plano e
Pagamentos com o plano, o próximo pagamento, "Pagar"/"Renovar plano" e as formas que a conta aceita. Versão da loja (`ehLoja`):
o pagamento aluno → profissional continua (é serviço do profissional; não libera recurso do app).

### 4.4 Casos e erros
Troca de plano no meio do período (vale no próximo pagamento) · valor do plano muda (só quem segue o plano) · plano desativado com
alunos · pagamento menor que o devido (hoje NÃO existe conferência de valor no MP — ver 7.I1) · assinatura automática ligada e o personal
troca a forma para à vista (cancelar a assinatura antes, avisando o aluno) · aluno sem plano (mensalidade de hoje, tudo igual).

### 4.5 Testes
Vitest das regras puras (cobertura em meses, valor do próximo pagamento, formas × modo de recebimento, parcela n/N, renovar) ·
edge com fetch simulado · E2E do painel (criar plano, pôr aluno no plano, trocar) e do app (pagar à vista, mês a mês, renovar) nas
versões site e loja · staging com o MP de teste.

## 5. Fora do escopo
Calendário de parcelas criado de antemão (caminho 2, recusado) · cobrança automática na InfinitePay (a API não tem) · plano por
profissional dentro da equipe (é da conta) · taxa da plataforma · mudar o MP do Weslley.

## 6. Para fechar no `dev:spec-review`
1. Reaproveitar `mensalidade_valor`/`mensalidade_desde` (proposto) ou colunas novas — conferir todos os leitores.
2. "Parcela n de N": gravada na cobrança (proposto) ou calculada.
3. Os 2 planos do app "sem profissional" em `planos_aluno` continuam idênticos com os padrões novos?
4. Cartão parcelado no MP: `installments` + `issuer_id`, quem paga os juros (configuração da conta MP) e o valor mínimo por parcela.
5. Onde a W1/W2 grava provedor/`order_nsu`/`transaction_nsu` na cobrança sem colidir com as colunas novas daqui.

## 7. Ajustes do `dev:spec-review` (10/10/2026 — valem POR CIMA das seções 3 e 4)

Relatório completo: `~/projetos/physiqcalc-scratch/migracao-yuri/spec-review-planos-e-recebimento.md` (veredito: **pronto com ajustes**).

- **B1 — modo de hoje intacto.** Nome do campo novo: **`pacientes.plano_modalidade`** (`avista` | `cartao_parcelado` | `mensal`; "forma"
  já é o trilho em `cobrancas.forma`). **Modalidade nula = modo de hoje**: nada recalcula, o `mensalidade_valor` digitado manda, e o
  `prof_definir` continua aceitando `plano_novo`/`valor` (APK antigo). Só quem o personal passar para um plano novo ganha modalidade.
  Plano sem valor ou sem meses aparece em Planos como **"completar"** e não é oferecido na ficha.
- **B2 — os 2 planos do app ficam iguais.** Plano de **1 mês** aceita a cobrança automática (com `meses = 1`, à vista = mês a mês); a
  conta do app (`contas.origem = 'app'`) fica **fora** da regra "mudar o valor do plano vale para quem está nele" (lá a matrícula
  guarda o valor, W7b).
- **I1 — valor da cobrança automática.** Toda mudança do valor do próximo pagamento com assinatura `authorized` faz o `PUT
  /preapproval` (molde do `aluno_app_plano`); falhou → aviso ao dono. Conferência de valor pago só onde ele vem de fora (W1).
- **I2 — "pago até" da migração (quando voltar).** Semente por aluno, só servidor (ex.: `pacientes.cobertura_inicial_ate`), no molde
  do `app_teste_ate`.
- **I3 — a função viva é a da w07b** (`mensalidade_recalcular` em `…w07b…sql:503-555`, com o teste grátis do app); partir dela.
- **I4 — tela do aluno = Pagamentos** (`Pagamentos.tsx`, já liberada na loja), não `MeuPlano.tsx` (que é o plano do app sozinho).
- **I5 — trava no banco.** Gatilho-guarda (molde `pacientes_guard_vinculos`) nas colunas de cobrança de `pacientes`
  (`mensalidade_valor`, `mensalidade_pago_ate`, `plano_aluno_id`, `plano_modalidade`, `plano_valor_negociado`, `cobranca_pausada`) e nas
  novas de `cobrancas` (`meses_cobertos`, `parcelas_total`): só `service_role`/master; a **avulsa** gravada direto pelo site antigo do Nutri
  continua. `planos_aluno` passa a só leitura para o app (gravação pela edge, só o dono).
- **I6 — cartão parcelado.** `CartaoPagamento.tsx` ganha `maxInstallments` por prop (padrão 1 — o pagamento do plano do personal ao
  Weslley continua 1×); `DadosCartao` leva `installments`; o servidor confere `1 ≤ installments ≤ max_parcelas_cartao` e só na
  modalidade `cartao_parcelado`. Juros: no parcelado comum paga o comprador; "sem juros" é configuração da conta MP do vendedor; o app
  mostra o total que o Brick calcula. Valor mínimo por parcela: testar no sandbox antes de liberar parcelas em plano barato.
- **Menores:** `cobrancas.plano_aluno_id` já existe (não criar); manter só `ativo` (sem `desativado_em`); evitar o nome
  `planos_do_aluno` (já é do plano alimentar); nome de plano é único também entre os desativados (a tela avisa); parcela = `round(valor
  ÷ meses, 2)` e o total mostrado é parcela × meses (o personal pode digitar a parcela); textos "/mês" mudam conforme a modalidade
  (Mensalidades, CartaoPagamento, WhatsApp, `descricaoMensalidade`, espelho no Treino); quem põe o aluno no plano = **dono da conta e
  master** (como `podeMexerNaMensalidade` hoje); estado **"renovar"** = modalidade do período todo + `vence_em_breve`/`vencida`; o sandbox
  do MP não paga Pix nem assina com cartão (usar `simular_aprovacao` no staging).
- **Respostas da seção 6:** (1) reaproveitar `mensalidade_valor`/`mensalidade_desde` — sim, recalculando num BEFORE UPDATE de
  `pacientes` e só com modalidade; (2) `parcelas_total` gravada na cobrança e `parcela_num` calculada no `mensalidade_recalcular` (junto do
  `cobre_de/cobre_ate`); (3) ver B2; (4) ver I6; (5) a W1/W2 usa colunas com prefixo próprio em `cobrancas`, sem colidir.
- ~~Pedido da LINUX 1 (hml-18b) sobre o import do `pdfDoRecibo`~~ — **retirado por ela** (10/10): o `FinanceiroDoAluno.tsx` importa de
  `painel/financeiro/pdfRecibo.ts`, que já faz `import("./reciboPdf")`; nada a trocar.
- **Regras novas de tela (hml-18a):** `useConfirmar()` de `src/ui/premium/Confirmar.tsx` no lugar de `window.confirm`
  (`semDialogoNativo.test.ts`); grade sempre com `grid-cols-1` + breakpoint (`larguraCelular.test.ts`).
- **P-A (respondida por ele, 10/10 ~20h20, "1"):** plano mês a mês com a cobrança automática ligada → depois da última parcela o
  plano **renova sozinho** e continua cobrando (o aluno ligou a automática para não precisar lembrar).
