# Textos legais (Physiq)

Homologação, hml-11 e hml-12 (08/10/2026; H-28 e H-30). Onde mora cada texto legal, o aceite e os consentimentos, como mudar um
texto, o histórico de revisões e os processos à mão que os textos prometem.

**Regra do dono: o texto legal final só vai para a produção depois que o advogado conferir.**

## Onde mora cada texto hoje (em vigor)

| Texto | Arquivo | Rota |
|---|---|---|
| Política de Privacidade e "Termos de uso" (uma página só) | `src/publico/Privacidade.tsx`. A data fica em `ATUALIZADA_EM`; não há número de versão | `/privacidade` e `/termos` (a mesma página; `/termos` rola até `#termos`) |
| As frases que saem igual em 2 páginas: as cópias de segurança (`FRASE_BACKUPS`), os serviços de terceiros (`SERVICOS_TERCEIROS`; `servicosDaVersao` tira o GitHub na versão da loja) e o "Voltar" do app (`abertaPeloApp`) | `src/publico/privacidade/textos.ts` | entram na Política e na `/excluir-conta` |
| Exclusão de conta: o que é apagado e o que fica guardado | `src/publico/ExcluirConta.tsx` | `/excluir-conta` (a URL da Segurança dos dados na Play) |
| Rodapés e links | `src/publico/PublicoLayout.tsx` (páginas públicas); `src/entrada/pecas/Moldura.tsx` ("Ao continuar você aceita…", sem registro do aceite; no build de staging, só os links: o aceite é a tela depois do login, hml-12); `src/publico/privacidade/LinksPrivacidade.tsx` (dentro do app) | — |
| O aceite e os consentimentos (hml-12, só no build de staging até a virada) | `src/publico/legal/aceite/` (a tela do aceite, a trava de idade e o consentimento de saúde) e `src/publico/legal/responsavel/` (o consentimento do responsável, na ficha do aluno) | antes de qualquer área logada |
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
  `build-apk-check.yml`) e falha se achar uma marca do texto novo (desde a hml-12, também as 8 marcas das telas do aceite, do
  consentimento e da idade). O site da Vercel não roda a guarda: a prova dele é o E2E de produção, que procura as marcas nos JS.
- Os rascunhos com as marcas para o advogado ficam fora do repo. No `.ts` entra o texto limpo.
- O advogado lê no staging: `https://physiqcalc-staging.vercel.app/privacidade`, `/termos` e `/assinatura`.

## O aceite e os consentimentos (hml-12)

O formato é o do Nativo OS (dono, 06/10/2026: "Vamos usar esse formato"): versão nova → todos aceitam no próximo acesso → e-mail.
Os códigos Pn e Dn desta página são as perguntas (com o padrão seguido) e as decisões da spec da hml-12.

### O registro: a tabela `aceites`

- Mora no banco principal, uma por schema (`staging.aceites` e `public.aceites`): o aceite de uma conta de teste no staging não
  vale para a produção.
- 1 linha por evento, que só cresce (`aceitou` ou `revogou`), de 3 documentos:

| `documento` | O quê | Quem grava |
|---|---|---|
| `textos` | o aceite dos Termos de Uso e da Política de Privacidade. Os Termos de assinatura fazem parte dos Termos de Uso e têm a mesma versão | a pessoa, na tela do aceite |
| `saude` | o consentimento do dado de saúde do aluno sem profissional | a pessoa, no "Treinar sem profissional" ou na tela do aceite |
| `responsavel` | o consentimento do responsável pelo aluno de 16 ou 17 anos: nome, vínculo e como foi dado | o profissional, na ficha do aluno |

- Cada linha guarda a versão do texto, a data e a hora, a origem (`site`, `apk` ou `loja`; `suporte` = registro do dono pelo SQL)
  e a versão do app. O IP não é guardado.
- Ninguém lê nem grava a tabela direto: só as funções do banco. Gravam: `aceitar_no_acesso`, `entrar_sem_profissional` (a de 5
  argumentos) e `aluno_responsavel_registrar`. A pessoa vê os dela em Perfil › Exportar meus dados.
- O aceite dos textos é 1 linha por pessoa e versão: aceitar de novo não duplica.
- Excluir a conta não apaga o registro: ele fica 5 anos, só para provar o aceite (P3; a conferir com o advogado). O registro do
  responsável sai junto com a matrícula apagada.
- A pré-consulta `/f/` não tem login: o consentimento fica na própria resposta (`respostas_preconsulta.consentimento_versao` e
  `consentimento_em`).

### A versão vigente

- Mora no banco, por schema: `app_config`, chave `textos_legais`, valor `{"versao": "AAAA-MM-DD"}`. O staging está em
  `2026-10-08`; a produção está com a versão nula, que desliga tudo: sem a tela do aceite, sem a regra de idade, e as funções de
  antes respondem igual.
- O app manda a versão que a pessoa leu (`VERSAO_TEXTOS`, em `src/publico/legal/versao.ts`). O banco recusa outra
  (`versao_desatualizada`): um app antigo não grava o aceite de um texto velho.
- As 2 têm que ser iguais. No staging, o `e2e/hml12/banco.py` confere; na produção, o passo 6 da virada.

### O que muda nas telas (só no build de staging até a virada)

- **A tela do aceite** vem antes de qualquer área logada (app, Boas-vindas, painel e master) para quem não aceitou a versão
  vigente. Passam sempre: as páginas públicas, o Sair e o Excluir minha conta. Sem internet, o aceite pendente não barra (o treino
  abre); a tela vem quando a internet volta.
- **O consentimento de saúde**, em destaque e separado do aceite, em 3 lugares: "Treinar sem profissional", a tela do aceite (o
  aluno do app que ainda não consentiu) e a pré-consulta `/f/`. Sem ele, o plano sem profissional não começa e a pré-consulta não
  é enviada.
- **A idade:**
  - o banco recusa menor de 16: no cadastro, no link `/c/`, no Editar dados e ao aprovar um pendente;
  - o plano sem profissional pede a data de nascimento e só aceita 18 anos ou mais;
  - o aluno de 16 ou 17 anos fica com o app fechado até o profissional registrar o consentimento do responsável na ficha
    (Resumo › Dados do aluno).
- O rodapé da entrada fica só com os links. "Sou profissional" ganha a linha de declaração (18 anos ou mais e o registro
  profissional válido).
- O E2E de tela é o `e2e/hml12/telas.py`; o do banco, o `e2e/hml12/banco.py`.

## Como mudar um texto legal

1. Versão nova: `VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` (`src/publico/legal/versao.ts`). Uma versão vale para os 3 documentos.
2. Rascunho em Markdown, com as marcas do que conferir.
3. O advogado confere.
4. Staging, com a faixa "em revisão".
5. A virada (abaixo).
6. O aviso por e-mail 30 dias antes e, na data, a versão nova no banco: todos aceitam no próximo acesso (processo 8, abaixo).

O que vai sem o advogado:

- **Correção de fato:** a frase que hoje é falsa ou incompleta sobre o que o app faz, sem base legal, papel, direito, prazo,
  preço nem obrigação nova. Exemplo: as 6 de 08/10/2026 (tabela "Revisões"). O advogado confere essas frases de novo no pacote
  da versão nova.
- **A troca do e-mail de contato** (`CONTATO_SUPORTE`): é um fato, não uma versão nova.

## A virada (depois do OK do advogado)

O texto novo promete o aceite registrado, o consentimento e a regra de idade (hml-12): a virada da hml-11 e a da hml-12 são um
passo só, com 1 PR e 1 migração. **A ordem é: o front, depois o banco, depois o e-mail.** Assim não há janela em que o banco
recusa e o front ainda é o velho.

1. Aplicar as mudanças do advogado nos `.ts` (os 3 textos e as frases da hml-12).
2. `VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` passam à data da publicação.
3. Tirar as condições de staging:
   - da hml-11: `src/rotas/Rotas.tsx`, as 3 telas que vendem e o `PublicoLayout`;
   - da hml-12: o `App.tsx` (a tela do aceite), `TreinarSemProfissional`, `Formulario`, `CardDadosAluno`, `Pendentes`,
     `NovoAluno`, `CriarConta`, `Cadastro`, `Moldura` e as frases da exclusão.
4. Apagar `src/publico/Privacidade.tsx`. O `textos.ts` fica (`FRASE_BACKUPS`, `SERVICOS_TERCEIROS` e `abertaPeloApp`).
5. A guarda de CI: as marcas da hml-12 saem da lista, e ela passa a conferir só a faixa "em revisão", que sai também do staging.
   Merge → Vercel + APK + AAB.
6. **Depois do front publicado**, a migração de 1 linha que liga a versão no banco (no `public` e a mesma no `staging`):
   `update {schema}.app_config set valor = jsonb_build_object('versao', '<data da publicação>') where chave = 'textos_legais';`
   A reversa: o `public` volta à versão nula; o `staging`, à versão de revisão. Conferir por SQL só leitura que
   `textos_legais.versao` é igual a `VERSAO_TEXTOS` nos 2 schemas. Sem o update, a tela do aceite nem aparece (versão nula =
   desligado); com uma versão atrás da do app, ninguém consegue aceitar: a tela mostra "Não deu para registrar agora" e manda o
   aviso de erro.
7. O e-mail (P1 e P11): `python3 scripts/legal/avisar_textos.py prod` só simula e mostra os números → o dono aprova o texto de
   `scripts/legal/aviso_textos.md` (`aprovado: sim`) → `--enviar`, com a chave do Resend lida do cofre na hora.
8. Prova viva: o dono entra e aceita (o 1º aceite real).

- O APK e o AAB que já estão nos aparelhos seguem com a página antiga e sem a tela do aceite até atualizarem
  ([desvios.md](desvios.md), nº 16). Vale a do site, que é a URL da Play.
- Na Play (passo do dono, no próximo envio do AAB): o Público-alvo com 16–17 anos; a Segurança dos dados com "Registros de
  falhas" (o app manda o aviso de erro desde a hml-10); a frase dos backups corrigida. A URL da Política não muda.

## Revisões

| Data | Versão | O que mudou | Advogado |
|---|---|---|---|
| 08/10/2026 | Política em vigor (`Privacidade.tsx`, sem número de versão) | correções de fato: o push, as cópias de segurança, o Telegram, a lixeira, as séries de 12 meses e o país do us-east-1 | não (são fatos; ele confere no pacote) |
| 08/10/2026 | `2026-10-08` (Política, Termos de Uso e Termos de assinatura) | versão nova, em revisão no staging | pendente |
| 08/10/2026 | `2026-10-08` | o aceite registrado, os consentimentos e a regra de idade (hml-12): no staging; na produção, só o banco, com a versão nula | pendente |

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

### 5. Retirada do consentimento de saúde

A Política diz que o consentimento do dado de saúde se retira pelo e-mail de contato (D13). Não há botão no app.

1. O pedido chega no e-mail de contato. Dá para pedir que a pessoa confirme que é ela.
2. Aluno sem profissional: o dono grava a retirada no banco principal (SQL Editor do Supabase), com a origem `suporte`:

   ```sql
   -- <login> = o id do login da pessoa (select id from auth.users where lower(email) = lower('<e-mail>'));
   -- <dono> = o id do login do dono
   insert into public.aceites (documento, evento, versao, user_id, registrado_por, origem)
   values ('saude', 'revogou', public.versao_dos_textos(), '<login>', '<dono>', 'suporte');
   ```

3. No próximo acesso, a tela do aceite pede o consentimento de novo. Sem ele, o plano sem profissional não abre (P10): a pessoa
   pode consentir de novo, sair ou excluir a conta.
4. Responder à pessoa. O que fazer com o dado de saúde já guardado: (a conferir com o advogado). A exclusão da conta apaga.
5. Pré-consulta já enviada: encaminhar o pedido ao profissional que recebeu a resposta, como no processo 2 (a conferir com o
   advogado: se a resposta precisa ser apagada).

### 6. O responsável retira o consentimento (aluno de 16 ou 17 anos)

1. O pedido vai ao profissional: foi ele que registrou e é ele que guarda a prova. Se chegar no e-mail de contato, encaminhar.
2. O profissional abre a ficha do aluno (Resumo › Dados do aluno › Consentimento do responsável), clica em "Retirar" e
   confirma. O app do aluno fecha até um novo registro.
3. Se o profissional não puder, o dono grava pelo SQL, com a origem `suporte`:

   ```sql
   -- <matricula> = o id da matrícula do aluno (pacientes.id); <conta> = a conta do profissional; <dono> = o id do login do dono
   insert into public.aceites (documento, evento, versao, paciente_id, conta_id, registrado_por, origem)
   values ('responsavel', 'revogou', public.versao_dos_textos(), '<matricula>', '<conta>', '<dono>', 'suporte');
   ```

### 7. Conta de menor de 16 anos

- Desde a virada, o banco recusa menor de 16 no cadastro, no link `/c/`, no Editar dados e ao aprovar um pendente.
- Se uma conta tiver a data de nascimento de menor de 16, o app do aluno fica fechado ("O Physiq é para quem tem 16 anos ou
  mais") e a ficha mostra o aviso ao profissional.
- Data errada: o profissional corrige em Editar dados.
- Menor de 16 de verdade (Termos §11; Política §11): a conta já está suspensa (o app fechado). Os dados são apagados pela exclusão
  normal: o profissional tira o aluno da lista, e o login é excluído em Perfil › Excluir minha conta ou na página
  `/excluir-conta` (pela pessoa, pelo responsável ou pelo dono, a pedido deles). O registro dos aceites fica 5 anos (P3).
- O mesmo vale para o aluno de 16 ou 17 anos sem o consentimento do responsável que não for regularizado.
- Plano sem profissional com menos de 18: o plano não começa (o banco recusa a data). Quem é emancipado fala com o atendimento
  (P4): (a conferir: hoje o app não tem como liberar o emancipado).

### 8. Aviso de versão nova dos textos

1. O texto novo: rascunho → o advogado confere → o staging com a faixa "em revisão" (`VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` novas, e
   a mesma versão no `staging` do banco, por 1 migração de 1 linha).
2. 30 dias antes da data (P2): o e-mail, com o texto dizendo a data de início ("A partir de …"):
   `python3 scripts/legal/avisar_textos.py prod --previo` só simula → o dono aprova o texto → `--enviar --previo`. O `--previo` só
   envia com a versão de antes ainda valendo no banco.
3. Na data: a virada da versão, na ordem front → banco (1 linha) → conferir, como nos passos 5 e 6 da virada.
4. Cada pessoa aceita a versão nova no próximo acesso. Quem não concordar pode excluir a conta.
5. Para saber quantos faltam: `python3 scripts/legal/avisar_textos.py prod` (só simula; só números). Rodar com `--enviar` manda
   de novo para quem ainda não aceitou.

- A 1ª publicação (a virada) não espera os 30 dias (P1; a conferir com o advogado): o texto em vigor não promete o aviso. O
  e-mail sai no dia, depois do update do banco.
- O consentimento de saúde não renova a cada versão dos textos: vale até ser retirado (D14). Só uma mudança na finalidade do dado
  de saúde pede um consentimento novo (a conferir com o advogado).
