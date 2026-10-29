# Textos legais (Physiq)

Homologação, hml-11 e hml-12 (08/10/2026; H-28 e H-30) e a virada (29/10/2026). Onde mora cada texto legal, o aceite e os
consentimentos, como mudar um texto, o histórico de revisões e os processos à mão que os textos prometem.

**A virada, 29/10/2026 — sem advogado, decisão do dono:** até aqui a regra era "o texto legal final só vai para a produção depois
que o advogado conferir". Em 29/10/2026 o dono decidiu publicar sem advogado ("Não tenho advogado" → "Sim, como estão"): a Política
de Privacidade, os Termos de Uso e os Termos de assinatura foram publicados COMO ESTAVAM no código, junto com o aceite no próximo
acesso, o consentimento de saúde e a regra de idade (hml-12). Nenhuma frase jurídica mudou na virada; na versão da Google Play, a
página dos Termos de assinatura só tira o que vale só no site (abaixo).

## Onde mora cada texto (em vigor desde a virada, 29/10/2026)

| Texto | Arquivo | Rota |
|---|---|---|
| Política de Privacidade, Termos de Uso (com o Anexo do tratamento de dados) e Termos de assinatura | `src/publico/legal/` (`politica.ts`, `termos.ts`, `assinatura.ts`, em Markdown; a página é a `PaginaLegal.tsx`). A versão é uma só para os 3: `VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` em `versao.ts` | `/privacidade`, `/termos` e `/assinatura` (em todo build: site, APK e Google Play) |
| As frases que saem igual em 2 páginas: as cópias de segurança (`FRASE_BACKUPS`), os serviços de terceiros (`SERVICOS_TERCEIROS`; `servicosDaVersao` tira o GitHub na versão da loja), a frase do suporte (`FRASE_SUPORTE`) e o "Voltar" do app (`abertaPeloApp`) | `src/publico/privacidade/textos.ts` | entram na Política e na `/excluir-conta` |
| Exclusão de conta: o que é apagado e o que fica guardado | `src/publico/ExcluirConta.tsx` | `/excluir-conta` (a URL da Segurança dos dados na Play) |
| Rodapés e links | `src/publico/PublicoLayout.tsx` (páginas públicas: Privacidade, Termos e Assinatura); `src/entrada/pecas/Moldura.tsx` (só os links: o aceite é a tela depois do login); `src/publico/privacidade/LinksPrivacidade.tsx` (dentro do app) | — |
| O resumo antes de pagar (Decreto 7.962/2013, art. 4º, I) | `src/publico/legal/ResumoAntesDePagar.tsx` (a seção "Resumo" dos Termos de assinatura) | Configurações › Plano, Treinar sem profissional, Perfil › Meu plano e, na versão da Google Play, a folha da oferta da Play (o resumo "loja") |
| O aceite e os consentimentos (hml-12) | `src/publico/legal/aceite/` (a tela do aceite, a trava de idade e o consentimento de saúde) e `src/publico/legal/responsavel/` (o consentimento do responsável, na ficha do aluno) | antes de qualquer área logada |
| Contato | `src/nucleo/suporte.ts` (`CONTATO_SUPORTE`) | — |

A URL da Política na Google Play é `https://physiqcalc.com.br/privacidade`. A Política de antes (`src/publico/Privacidade.tsx`, uma
página só para a Política e os "Termos de uso") saiu na virada.

## Os textos publicados (a virada)

- Valem em todo build: as 3 páginas, o resumo antes de pagar, as frases das telas (a da desistência ao excluir a conta, a da
  renovação no Plano e a dos aceites guardados 5 anos), o rodapé da entrada só com os links, a declaração do "Sou profissional", a
  linha da idade no `/c/`, as dicas de idade do painel e a porta do aceite. As peças carregam sob demanda (`lazy`): o JS inicial não
  leva o texto. A condição de staging (`VITE_DB_SCHEMA === "staging"`) sobrou só na `/erro-teste`.
- A faixa "Versão em revisão — ainda não publicada" saiu (também do staging).
- **Na versão da Google Play**, a página `/assinatura` mostra os Termos de assinatura SEM o que só vale no site
  (`termosDeAssinatura(loja)` em `assinatura.ts`), pela mesma regra do resumo "loja" da folha da Play (`SO_DO_SITE`): saem os planos e
  preços do banco, o teste pago pelo site, o Mercado Pago (Pix, cartão, cobrança automática), o "bloqueado no dia seguinte", a troca,
  o comprovante do site e a mensalidade ao profissional; ficam quem vende, a vigência, o cancelamento, a desistência (também pela
  Google Play), o reajuste, a seção 15 (Versão da Google Play) e o atendimento. Só tira linhas: nenhuma palavra nova (o
  `resumoLoja.test.ts` confere linha a linha); a numeração das seções fica a do texto publicado. Motivo: a regra de pagamentos da
  Google Play (texto de outro meio de pagamento dentro do app da Play).
- **Guarda de CI:** `scripts/ci/sem-texto-legal-novo.sh <pasta>` roda depois de cada build de produção (`build-apk.yml`,
  `build-apk-check.yml` e o `aab-loja.sh`, também no AAB de staging do notebook). Desde a virada ela falha se achar a faixa "em
  revisão" (`data-texto-em-revisao`, no build ou no `src/`) e, de controle positivo, se o build sair SEM o texto legal (a página, a
  porta do aceite e o resumo) — a virada não volta atrás sem querer. O site da Vercel não roda a guarda: a prova dele é o E2E.
- Os rascunhos com as marcas para o advogado ficaram fora do repo (`physiqcalc-scratch/hml/hml11/rascunhos/`). Se um dia houver
  advogado, a volta dele é uma versão nova (abaixo, "Como mudar um texto legal").

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

- Mora no banco, por schema: `app_config`, chave `textos_legais`, valor `{"versao": "AAAA-MM-DD"}`. A virada liga a versão
  `2026-10-29` nos 2 schemas pela migração `supabase-principal/migrations/20261029200000_virada_textos_legais.sql` (o staging
  antes; o `public` SÓ depois do front publicado). Antes dela, o staging estava em `2026-10-08` e a produção com a versão nula, que
  desliga tudo: sem a tela do aceite, sem a regra de idade, e as funções de antes respondem igual.
- O app manda a versão que a pessoa leu (`VERSAO_TEXTOS`, em `src/publico/legal/versao.ts`). O banco recusa outra
  (`versao_desatualizada`): um app antigo não grava o aceite de um texto velho.
- As 2 têm que ser iguais: o `src/publico/legal/textos.test.ts` confere a versão do `versao.ts` com a da migração da virada; no
  banco, o `e2e/hml12/banco.py` (staging) e o passo 6 da virada (produção). A data da publicação mudou? Troque as 2 constantes do
  `versao.ts` e a data da migração, juntas.

### O que muda nas telas (em todo build desde a virada, 29/10/2026)

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
4. Staging. A faixa "em revisão" saiu na virada e a guarda de CI hoje recusa a marca dela até no `src/`: para mostrar uma versão
   em revisão no staging de novo, a faixa volta só no build de staging E a guarda muda junto (as marcas do texto em revisão).
5. A virada (abaixo).
6. O aviso por e-mail 30 dias antes e, na data, a versão nova no banco: todos aceitam no próximo acesso (processo 8, abaixo).

O que vai sem o advogado:

- **Correção de fato:** a frase que hoje é falsa ou incompleta sobre o que o app faz, sem base legal, papel, direito, prazo,
  preço nem obrigação nova. Exemplo: as 6 de 08/10/2026 (tabela "Revisões"). O advogado confere essas frases de novo no pacote
  da versão nova.
- **A troca do e-mail de contato** (`CONTATO_SUPORTE`): é um fato, não uma versão nova.

## A virada (29/10/2026, sem advogado — decisão do dono)

O texto promete o aceite registrado, o consentimento e a regra de idade (hml-12): a virada da hml-11 e a da hml-12 são um passo
só, com 1 PR (`feat/virada-textos-legais`) e 1 migração (`20261029200000_virada_textos_legais.sql`). **A ordem é: o front, depois
o banco, depois o e-mail.** Assim não há janela em que o banco recusa e o front ainda é o velho. Feito no PR: os passos 2 a 5 e a
migração no `staging`; o resto (o merge, a migração no `public`, o e-mail, a prova viva e a Play) fica com quem publica.

1. ~~Aplicar as mudanças do advogado nos `.ts`~~ — sem advogado: os textos foram publicados como estavam (decisão do dono, 29/10/2026).
2. `VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` passam à data da publicação.
3. Tirar as condições de staging:
   - da hml-11: `src/rotas/Rotas.tsx`, as 3 telas que vendem e o `PublicoLayout`;
   - da hml-12: o `App.tsx` (a tela do aceite), `TreinarSemProfissional`, `Formulario`, `CardDadosAluno`, `Pendentes`,
     `NovoAluno`, `CriarConta`, `Cadastro`, `Moldura` e as frases da exclusão.
4. Apagar `src/publico/Privacidade.tsx`. O `textos.ts` fica (`FRASE_BACKUPS`, `SERVICOS_TERCEIROS` e `abertaPeloApp`).
5. A guarda de CI: as marcas da hml-12 saem da lista, e ela passa a conferir só a faixa "em revisão", que sai também do staging (e,
   de controle positivo, que o build tem o texto legal). Merge → Vercel + APK + AAB.
6. **Depois do front publicado**, a migração de 1 linha que liga a versão no banco (no `public` e a mesma no `staging`) —
   `supabase-principal/migrations/20261029200000_virada_textos_legais.sql` (`--so staging` já aplicado no PR; `--so public` na virada):
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
| 13/10/2026 | `2026-10-08` (em revisão) | W-A: as rotinas e lembretes e o que o aluno registra com a dieta liberada — os dados, os sensíveis, quem vê, o que sai ao excluir, o aparelho e os lembretes: no staging (a Política em vigor não muda) | pendente |
| 29/10/2026 | `2026-10-29` (publicada) | **a virada**: a Política, os Termos de Uso e os Termos de assinatura publicados como estavam no código (a revisão de 08/10 + W-A + play-W6), com o aceite no próximo acesso, o consentimento de saúde e a regra de idade (hml-12), em todo build; a faixa "em revisão" saiu; a Política de antes (`Privacidade.tsx`) saiu; na versão da Google Play, a `/assinatura` sem o que só vale no site (só tira linhas) | **não — sem advogado: decisão do dono em 29/10/2026** ("Não tenho advogado" → "Sim, como estão") |

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

Até a virada as telas diziam "sem reembolso do que já foi pago" ao excluir a conta do profissional, o que conflitava com o art. 49.
Desde 29/10/2026 dizem "o que já foi pago não volta, salvo a desistência em até 7 dias depois do pagamento".

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

1. O texto novo: rascunho → (o advogado confere, se houver) → o staging (ver "Como mudar um texto legal", passo 4) (`VERSAO_TEXTOS` e `DATA_DOS_TEXTOS` novas, e
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
