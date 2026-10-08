# Textos legais (Physiq)

Homologação, hml-11 (08/10/2026; H-28). Onde mora cada texto legal, como mudar um texto, o histórico de revisões e os processos à
mão que os textos prometem.

**Regra do dono: o texto legal final só vai para a produção depois que o advogado conferir.**

## Onde mora cada texto hoje (em vigor)

| Texto | Arquivo | Rota |
|---|---|---|
| Política de Privacidade e "Termos de uso" (uma página só) | `src/publico/Privacidade.tsx`. A data fica em `ATUALIZADA_EM`; não há número de versão | `/privacidade` e `/termos` (a mesma página; `/termos` rola até `#termos`) |
| As frases que saem igual em 2 páginas: as cópias de segurança (`FRASE_BACKUPS`), os serviços de terceiros (`SERVICOS_TERCEIROS`; `servicosDaVersao` tira o GitHub na versão da loja) e o "Voltar" do app (`abertaPeloApp`) | `src/publico/privacidade/textos.ts` | entram na Política e na `/excluir-conta` |
| Exclusão de conta: o que é apagado e o que fica guardado | `src/publico/ExcluirConta.tsx` | `/excluir-conta` (a URL da Segurança dos dados na Play) |
| Rodapés e links | `src/publico/PublicoLayout.tsx` (páginas públicas); `src/entrada/pecas/Moldura.tsx` ("Ao continuar você aceita…", sem registro do aceite); `src/publico/privacidade/LinksPrivacidade.tsx` (dentro do app) | — |
| Contato | `src/nucleo/suporte.ts` (`CONTATO_SUPORTE`) | — |
| Cobrança | não há texto próprio, só as frases das telas que vendem | — |

A URL da Política na Google Play é `https://physiqcalc.com.br/privacidade`.

## O texto novo (em revisão, só no staging)

- Mora em `src/publico/legal/`:
  - `versao.ts`: `VERSAO_TEXTOS` e `DATA_DOS_TEXTOS`, uma versão só para os 3 documentos (é a versão que a hml-12 vai gravar no
    aceite); o `VENDEDOR`; as rotas;
  - `politica.ts` (Política de Privacidade), `termos.ts` (Termos de Uso, com o Anexo do tratamento de dados) e `assinatura.ts`
    (Termos de assinatura, com o resumo `resumoDaAssinatura()`), em Markdown;
  - `PaginaLegal.tsx` (a página, com "Imprimir ou salvar em PDF"), `TextoLegal.tsx` e `markdown.ts` (o leitor) e
    `ResumoAntesDePagar.tsx` (o resumo nas telas que vendem).
- **Só no build de staging.** As rotas novas, o resumo antes de pagar e as 2 frases novas das telas (a da desistência ao excluir
  a conta e a da renovação no Plano) só existem com `VITE_DB_SCHEMA === "staging"`, no molde da `/erro-teste`
  (`src/rotas/Rotas.tsx`). Na produção o Rollup corta o `import()`: o texto novo nem entra no bundle, e `/assinatura` dá "Página
  não encontrada".
- No topo das 3 páginas, a faixa "Versão em revisão — ainda não publicada" (atributo `data-texto-em-revisao`).
- **Guarda de CI:** `scripts/ci/sem-texto-legal-novo.sh <pasta>` roda depois de cada build de produção (`build-apk.yml` e
  `build-apk-check.yml`) e falha se achar uma marca do texto novo.
- Os rascunhos com as marcas para o advogado ficam fora do repo. No `.ts` entra o texto limpo.
- O advogado lê no staging: `https://physiqcalc-staging.vercel.app/privacidade`, `/termos` e `/assinatura`.

## Como mudar um texto legal

1. Versão nova: `VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` (`src/publico/legal/versao.ts`). Uma versão vale para os 3 documentos.
2. Rascunho em Markdown, com as marcas do que conferir.
3. O advogado confere.
4. Staging, com a faixa "em revisão".
5. A virada (abaixo).
6. Aviso aos usuários 30 dias antes e aceite no próximo acesso (hml-12).

O que vai sem o advogado:

- **Correção de fato:** a frase que hoje é falsa ou incompleta sobre o que o app faz, sem base legal, papel, direito, prazo,
  preço nem obrigação nova. Exemplo: as 6 de 08/10/2026 (tabela "Revisões"). O advogado confere essas frases de novo no pacote
  da versão nova.
- **A troca do e-mail de contato** (`CONTATO_SUPORTE`): é um fato, não uma versão nova.

## A virada (depois do OK do advogado)

Um PR curto, junto ou logo depois da hml-12: o texto novo promete o aceite registrado, o consentimento e a regra de idade, que
são dela.

1. Aplicar as mudanças do advogado nos `.ts`.
2. Tirar a condição de staging de `src/rotas/Rotas.tsx` e das 3 telas que vendem.
3. Apagar `src/publico/Privacidade.tsx`. O `textos.ts` fica (`FRASE_BACKUPS`, `SERVICOS_TERCEIROS` e `abertaPeloApp`).
4. `VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` passam à data da publicação.
5. Inverter a guarda de CI: as marcas da faixa "em revisão" saem também do staging.
6. O aviso aos usuários e o aceite no próximo acesso (hml-12).

- O APK e o AAB que já estão nos aparelhos seguem com a página antiga até atualizarem. Vale a do site, que é a URL da Play.
- Na Play (passo do dono, no próximo envio do AAB): o Público-alvo com 16–17 anos; a Segurança dos dados com "Registros de
  falhas" (o app manda o aviso de erro desde a hml-10); a frase dos backups corrigida. A URL da Política não muda.

## Revisões

| Data | Versão | O que mudou | Advogado |
|---|---|---|---|
| 08/10/2026 | Política em vigor (`Privacidade.tsx`, sem número de versão) | correções de fato: o push, as cópias de segurança, o Telegram, a lixeira, as séries de 12 meses e o país do us-east-1 | não (são fatos; ele confere no pacote) |
| 08/10/2026 | `2026-10-08` (Política, Termos de Uso e Termos de assinatura) | versão nova, em revisão no staging | pendente |

## Os processos à mão que os textos prometem

### 1. Desistência em 7 dias

A lei (CDC, art. 49) dá ao consumidor 7 dias para desistir. Os Termos de assinatura novos dão esse prazo a todos, inclusive ao
profissional. Hoje o pedido é só por e-mail.

1. O pedido chega no e-mail de contato (`CONTATO_SUPORTE`).
2. Conferir a data do pagamento: vale até 7 dias depois dele (painel master › Financeiro, ou o Mercado Pago).
3. Devolver o valor inteiro desse pagamento no painel do Mercado Pago (o pagamento › Devolver).
4. Encerrar o acesso pago por ele e cancelar a cobrança automática, se houver. Na conta do profissional: painel master ›
   Financeiro (cancelar a cobrança automática) e Contas (vencimento). No aluno sem profissional: (a conferir: o caminho no
   painel).
5. Responder em até 5 dias (Decreto nº 7.962/2013, art. 4º, parágrafo único).

As telas de hoje dizem "sem reembolso do que já foi pago" ao excluir a conta do profissional. Isso conflita com o art. 49 e muda
na virada.

### 2. Pedido do titular dos dados

1. O app já resolve sozinho: Perfil › Exportar meus dados (acesso e portabilidade) e Excluir minha conta, ou a página
   `/excluir-conta`.
2. O resto chega no e-mail de contato. Responder em até 15 dias (LGPD, art. 19, II; o texto novo escreve o mesmo prazo).
3. Se o dado é do atendimento (o profissional é o controlador), encaminhar o pedido ao profissional e ajudar com o que ele
   precisar.
4. Dá para pedir que a pessoa confirme que é ela.

### 3. Reajuste de preço

Os Termos de assinatura novos prometem o aviso por e-mail e no app 30 dias antes.

- O master muda os preços sem deploy (painel master › Planos, função `master-planos`):
  - `plano_precos`: os planos do profissional;
  - os `planos_aluno` da conta do app: o plano do aluno sem profissional. Os `planos_aluno` das outras contas são os preços de
    cada profissional para os alunos dele, não venda do Physiq.
- A ordem: avisar → esperar 30 dias → mudar o preço. O preço novo só vale nos pagamentos feitos depois do prazo.
- Os Termos de assinatura listam os preços: mudar o preço pede mudar também o texto e as constantes que o teste confere
  (`PRECOS_PADRAO` em `src/nucleo/cobranca/regras.ts`; `PLANOS_APP_PADRAO` em `src/app-aluno/sozinho/regras.ts`). O teste não
  olha o banco.
- O meio do aviso no app: (a conferir).

### 4. Incidente de segurança

O roteiro está em [incidente.md](incidente.md).
