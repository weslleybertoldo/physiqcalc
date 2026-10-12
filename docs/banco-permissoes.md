# Permissões dos bancos (principal e Treino)

Regras em vigor desde 07/10/2026 (homologação, `hml-01`). Valem para os 2 projetos do Supabase e para os 2 schemas
(`public` e `staging`).

## Tabelas
- **Visitante (`anon`) não ganha nada sozinho.** Os default privileges do `postgres` (quem roda as migrations) não dão mais
  privilégio de tabela nem de sequência ao `anon`. Tabela nova que o visitante precise ler: `GRANT SELECT` explícito na
  migration dela, junto com a policy `TO anon`.
- **Logado (`authenticated`) só lê e grava linhas**: sem `TRUNCATE` (não passa pelo RLS), `TRIGGER`, `REFERENCES` e `MAINTAIN`.
- Hoje o visitante lê só o catálogo global do Treino (`tb_exercicios` e `grupos_musculares` com `professor_id` vazio). No
  principal, o visitante usa só funções (cadastro pelo link, diário, pré-consulta) e o Storage do diário.

## Funções
O Supabase dá `EXECUTE` a `anon` e a `authenticated` em toda função nova. Por isso toda migration escolhe um dos 2 jeitos:

| Quem chama | Grants |
|---|---|
| só o servidor (outra função `SECURITY DEFINER`, Edge Function com a `service_role`, `pg_cron`) | `revoke all on function … from public, anon, authenticated;` + `grant execute … to service_role;` |
| o app, com o login da pessoa | `revoke all on function … from public, anon;` + `grant execute … to authenticated, service_role;` |

- Função do segundo tipo **confere quem chama** dentro dela (`auth.uid()`, papel, vínculo). A conferência não pode cair no
  `NULL`: use `exists (…)` ou `coalesce(…, false)` (ex.: `pode_mexer_no_acesso`, `pode_ver_aluno`).
- Função de gatilho não precisa de `EXECUTE` de ninguém.
- Função `SECURITY DEFINER` sempre com `search_path` fixo (`''` com os nomes completos, ou o schema dela).

## Principal: o plano alimentar do aluno no painel (hml-17, H-38)
- O painel lê o plano pelas RPCs `planos_do_aluno(p_aluno)`, `plano_alimentar(p_plano)` e `planos_favoritos()` (`SECURITY
  DEFINER`, do app com o login da pessoa). Elas conferem `eh_master() or pode_ver_aluno(<o aluno do plano>)` — a mesma regra das
  policies de leitura de planos, refeições e itens — e montam o plano com os alimentos de verdade pela interna
  `plano_alimentar_json(p_plano)` (sem `EXECUTE` para `anon` e `authenticated`; só roda dentro das 3).
- Por quê: quem vê o aluno (dono, personal, nutri que herdou o aluno) nem sempre lê o alimento próprio da nutri que montou o plano
  (o RLS de `alimentos` só deixa a TACO, os próprios e, ao aluno, os da nutri dele). Lido direto das tabelas, o item vinha sem o
  alimento e o total caía (1.894 → 1.540 kcal no staging). O RLS de `alimentos` e de `medidas_caseiras` **não abriu**: o alimento da
  nutri sai só junto do plano que a pessoa já vê (a lista e a busca de alimentos seguem iguais).
- Sem login → erro `sem_login`; quem não vê → `[]` / `null` (a mesma resposta do RLS, sem dizer se existe). As gravações do editor
  seguem pelas tabelas (RLS). Prova: `python3 e2e/hml17/api.py --schema staging|public`.

## Principal: os padrões do 1º acesso da nutrição (hml-19a, H-81 · jeito 2)
- As seções Anamnese, Documentos e Exames do Prontuário (e, na hml-19b, Manipulados, Metas e Orientações) não gravam mais o padrão
  do navegador: a função `nutricao` (ação `padroes_garantir`) chama a RPC `nutricao_garantir_padroes(p_secao, p_itens)` **como a
  pessoa** (a sessão de quem chama; nenhuma chave secreta).
- A RPC é **`SECURITY INVOKER`** (com `search_path` fixo): o RLS de hoje vale dentro — a pessoa só grava os próprios
  (`nutricionista_id = auth.uid()`) e a restritiva da W3 segue valendo (só quem escreve nutrição grava na biblioteca: o resto recebe o
  42501). Grava os itens **só** se a pessoa não tem nenhum próprio vivo na seção, com trava por pessoa e seção
  (`pg_advisory_xact_lock`: 2 chamadas juntas → 1 conjunto só). Lista fechada de seções (`anamnese`, `documento`, `exame`, `formula`,
  `meta`, `orientacao`); os textos moram com a função (`supabase-principal/functions/_shared/nutricao-padroes.ts`).
- Grants: `revoke all … from public, anon` + `grant execute … to authenticated, service_role` (o 2º jeito da tabela acima — quem
  confere é o RLS, por ser INVOKER). Sem login → `sem_login`; seção fora da lista → `secao_invalida`; itens fora da forma →
  `itens_invalidos`. Migração `20261011100000_hml19a_nutricao_padroes.sql` (reversa em `supabase-principal/reversas/`).
- Os grants e as policies das 18 tabelas do Prontuário **ficam** nesta etapa: a função grava com a sessão da pessoa (precisa deles) e
  os APKs antigos ainda gravam direto (`docs/desvios.md`, desvio 2).

## Principal: a Dieta, as Dietas e o app do aluno pela função `nutricao` (hml-19b, H-41 · jeito 2)
- As 19 tabelas da Dieta e das Dietas (`planos_alimentares`, `refeicoes`, `itens_refeicao`, `registros_diarios`,
  `calculos_energeticos`, `produtos`, `indicacoes_produto`, `formulas_manipuladas`, `modelos_formula`, `metas`, `modelos_meta`,
  `orientacoes`, `modelos_orientacao`, `alimentos`, `medidas_caseiras`, `receitas`, `ingredientes_receita`, `grupos_receita`,
  `diario_alimentar`) não são mais gravadas do navegador: a função `nutricao` (módulos `dieta.ts` e `aluno.ts`) grava **como a
  pessoa**, com o dono vindo do `user` (nunca do corpo). Fora: o link público `/d/:codigo` (sem login), que segue chamando a
  `diario_enviar` direto (decisão 13).
- O que é **tudo ou nada** vai por 7 RPCs **`SECURITY INVOKER`** (search_path fixo; o RLS de hoje vale dentro; o dono de `auth.uid()`):
  `dieta_criar_plano`, `dieta_duplicar_plano`, `dieta_salvar_receita`, `dieta_salvar_alimento`, `dieta_ordenar` (lista fechada:
  `refeicoes`, `indicacoes_produto`), `dieta_excluir_grupo_receita` e `dieta_copiar_semana`. Grants: `revoke all … from public, anon`
  + `grant execute … to authenticated, service_role` (o 2º jeito da tabela acima). Sem login → `sem_login`; corpo fora da forma →
  `dados_invalidos`; o que não existe, está na Lixeira ou o RLS esconde → `nao_encontrado` e **nada muda**.
- O app do aluno chama pela função as **mesmas** RPCs de hoje (`paciente_marcar_refeicao`, `aluno_marcar_meta`, `diario_enviar`),
  como o aluno; a foto sobe pelo link assinado (`createSignedUploadUrl` com a sessão do aluno, depois de `diario_pasta_valida`). A
  `diario_enviar` (definer, chamável pelo visitante e pelo logado — sem mudança de grant) passa a contar o **limite por IP** (hml-05c)
  só para quem **não** é o próprio aluno dono do código: pela função o IP é o da função, comum a todos (decisão da sessão principal,
  11/10/2026). O limite por aluno (30 fotos/h) segue para todos.
- Migração `20261011110000_hml19b_dieta_atomicas.sql` (reversa em `supabase-principal/reversas/`, que devolve a `diario_enviar` de
  hoje byte a byte). Os grants e as policies das 19 tabelas **ficam** nesta etapa (a função grava com a sessão da pessoa; os APKs
  antigos ainda gravam direto — `docs/desvios.md`, desvio 2).

## Principal e Treino: a Avaliação pelas funções (hml-19c, H-41 · jeito 2)
- **Principal:** `antropometrias`, `fotos_evolucao` (e o arquivo no bucket `evolucao`/`evolucao-staging`) não são mais gravadas do
  navegador: a função `nutricao` (módulo `avaliacao.ts`) grava **como a pessoa**, com o dono vindo do `user` (nunca do corpo). A foto
  sobe pelo link assinado (`createSignedUploadUrl` com a sessão da pessoa: a policy do bucket confere a 1ª pasta = quem chama, ou o
  master); o registro confere o arquivo naquele caminho; excluir = a linha à Lixeira e **depois** o arquivo (falhou o remove → log
  `arquivo_orfao`). O aviso "avaliação nova" chama a **mesma** `aluno_avisar_avaliacao` (definer, sem mudança de grant) pela função,
  como a pessoa — ela saiu do navegador (e do `RPC_QUE_GRAVAM` do `src/integrations/repeticao.ts`).
- **Treino:** a foto mensal (`physiq_registros_fotos` + o bucket `registros`/`registros-staging`) vai pela `admin-avaliacoes` (ações
  `foto_preparar`, `foto_salvar`, `foto_excluir`) **como a pessoa** (a chave anon + o token de quem chama; nenhuma chave secreta nessas
  3): o RLS "Staff gerencia registros dos seus alunos" e as policies do bucket decidem como antes. O escopo é a mesma regra da W3,
  perguntada como a pessoa (`pode_ver_aluno_treino`, que já tinha EXECUTE para `authenticated`). As ações de antes da função
  (`list`, `create`, `update`, `proxima`, `delete`) seguem com a `service_role`, sem mudança.
- Atenção (catálogo, 11/10/2026): a policy `registros_professor_write` do Storage do Treino vale para os 2 buckets e lê o vínculo em
  `public.physiq_profiles` **ou** `staging.physiq_profiles` — o vínculo da produção também decide no bucket do staging (e vice-versa).
- Nenhuma migration: os grants e as policies das 3 tabelas e dos 2 buckets **ficam** nesta etapa (a função grava com a sessão da
  pessoa; os APKs antigos ainda gravam direto — `docs/desvios.md`, desvio 2).

## Principal: o Financeiro pela função `financeiro` (hml-19d, H-41 · jeito 2)
- `transacoes`, `categorias_financeiras`, `modelos_recibo`, `recibos` e as tags do aluno (`pacientes.tags`) não são mais gravadas do
  navegador (Painel › Financeiro e o Financeiro do aluno): a função NOVA `financeiro` (porta `_shared/porta-pessoa.ts`, `verify_jwt`
  ligado) grava **como a pessoa**, com o dono vindo do `user` (nunca do corpo) e as colunas numa lista fechada
  (`_shared/financeiro-gravar-regras.ts`). Nas tags, só a coluna `tags` (o gatilho `pacientes_guard_cobranca` da W-P segue segurando
  as colunas de cobrança); a `admin-tags` do Treino segue chamada pela tela.
- O que é **tudo ou nada / 1 vez só** vai por 3 RPCs **`SECURITY INVOKER`** (search_path fixo; o RLS de hoje vale dentro; o dono de
  `auth.uid()`): `financeiro_garantir_padroes` (as 6 categorias e o "Recibo padrão" do 1º acesso, cada conjunto só se a pessoa não tem
  nenhum vivo, sempre com a conta — e só numa conta em que ela trabalha, `sou_membro`; trava por pessoa), `financeiro_emitir_recibo`
  (o recibo — o número segue vindo do gatilho `numerar_recibo` — + a movimentação ligada + o texto com o número real) e
  `financeiro_excluir_recibo` (o recibo à Lixeira + a movimentação solta). Grants: `revoke all … from public, anon` + `grant execute
  … to authenticated, service_role` (o 2º jeito da tabela acima). Sem login → `sem_login`; corpo fora da forma → `dados_invalidos`;
  o que não existe ou o RLS esconde → `nao_encontrado` e **nada muda**; conta de outro nas sementes → `sem_acesso`.
- Migração `20261011120000_hml19d_financeiro_atomicas.sql` (reversa em `supabase-principal/reversas/`). Não toca `cobrancas`,
  `planos_aluno`, `contas`, `recebimento_chaves` nem as colunas de cobrança de `pacientes`. Os grants e as policies das 4 tabelas e
  do `pacientes` **ficam** nesta etapa (a função grava com a sessão da pessoa; os APKs antigos ainda gravam direto —
  `docs/desvios.md`, desvio 2).

## Principal (e o Treino, desvio 23): as leituras de saúde do app do aluno pelas funções (hml-20a, H-42 · jeito 2, etapa 2)
- **Principal:** o app do aluno (Início, Evolução, Dieta/Diário) não lê mais a `minha_dieta`, a `minha_evolucao` nem assina as fotos
  do `diario`/`evolucao` no navegador: a função `nutricao` ganhou a ação **`ler`** (em lote — motor `_shared/leitura-lote.ts`, catálogo
  fechado `_shared/nutricao-leituras.ts`, módulo `nutricao/leituras.ts`), que roda cada consulta **como a pessoa** (o mesmo token): as
  RPCs de leitura de hoje (`minha_dieta`, `minha_evolucao` — definer, com o `auth.uid()` dentro; o EXECUTE do `authenticated` não
  muda) e o select de `diario_alimentar` (`id`, `path`, só as vivas) pelo RLS de hoje ("paciente: ler o proprio diario" + a restritiva
  da W24, que deixa passar o `paciente_do_meu_login`). A URL assinada sai do servidor com a sessão da pessoa (as policies de leitura
  dos buckets de hoje), só para os caminhos que a própria consulta leu, com o prazo de hoje (1 h); volta relativa ao projeto e a tela
  monta com o domínio dela (a mesma URL de antes). Colunas em lista fechada (nenhum `*`); consulta "minha" = o dono vem do `user`.
- **Treino:** a Evolução do próprio aluno (a aba Evolução e o card do peso do Início) **segue lendo direto do navegador**, como antes
  (`physiq_profiles`, `physiq_avaliacoes`, `physiq_registros_fotos` pelo REST, com o RLS "o aluno lê as próprias linhas", e a URL
  assinada do `registros` pela policy `registros_read_own_or_admin`) — o desvio 23 do `docs/desvios.md` (o gate de latência, 12/10/2026).
  A `admin-avaliacoes` tem a ação **`minha_evolucao`** pronta e publicada (antes do `requireAdmin`; o token conferido pelo JWKS; freio
  por pessoa em memória; o cliente **como a pessoa** — a chave anon + o token, nenhuma chave secreta — lê as 3 do `sub` do token, só as
  colunas que a tela usa, e assina as fotos no `registros`/`registros-staging`; qualquer papel lê só o próprio), sem uso pelo front até a
  condição do desvio.
- Nenhuma migration: os grants e as policies de LEITURA **ficam** (decisão 12 da spec hml-20): a função lê com a sessão da pessoa,
  que precisa deles; os APKs antigos e o AAB ainda leem direto (`docs/desvios.md`, desvio 2). Fechar o `rest` é a etapa 4 do jeito 2,
  quando não houver mais leitura direta (H-43) e houver versão mínima de app.
- O fetch dos 2 clientes repete o POST de LEITURA 1 vez, como o GET de hoje (`ACOES_DE_LEITURA` em `src/integrations/repeticao.ts`:
  a `ler` da `nutricao`/`financeiro`, pelo campo `acao`, e a `minha_evolucao` da `admin-avaliacoes`, pelo campo `action` — pronta para
  quando o desvio 23 sair); as gravações dessas funções seguem indo 1 vez.

## Principal: as leituras de saúde do Painel › Aluno pela função (hml-20b, H-42 · jeito 2, etapa 2)
- A casca do aluno no painel (o cabeçalho, os KPIs e os cards), o Resumo (as anotações), o Prontuário ×10 (Anotações, Consultas,
  Anamnese, Questionários, Exames, Avaliação 360, Gestacional, Fármaco-nutrientes, Documentos, Anexos), a Avaliação (a série do principal
  e o "Editar") e o PDF "Dados & Evolução" não leem mais as tabelas, as RPCs e o Storage do principal no navegador: as libs mandam a ação
  **`ler`** da `nutricao` (o mesmo motor e o mesmo catálogo da hml-20a — só ganharam as 27 consultas da 20b), que roda cada consulta
  **como a pessoa** (o mesmo token): o select das 18 tabelas da área com as colunas do tipo (o `*` de antes, escrito coluna a coluna), o
  filtro do aluno (`paciente_id` do corpo — o RLS de hoje decide se a pessoa vê; outra conta = lista vazia/`nao_encontrado`, como
  antes), as vivas e a ordem de antes; as RPCs de leitura de hoje (`aluno_perfil`, `aluno_evolucao`, `aluno_anotacoes` — definer, com a
  `w14_matricula_da_rota`, cujos códigos `sem_login`/`sem_acesso`/`aluno_inexistente` voltam como o erro do item —, e `exames_do_aluno`,
  invoker); e o `profiles` de QUEM CHAMA (nome e dados profissionais — a única consulta "minha": o `id` vem do token, nunca do corpo).
  Os modelos e catálogos (anamnese, questionários, exames, interações, documentos) seguem como a lib lia: sem filtro de dono — o RLS
  decide os do sistema + os próprios.
- **Storage:** as fotos de evolução da casca/Avaliação são assinadas na MESMA ida da `aluno_evolucao` (bucket `evolucao`, 1 h — a policy
  de hoje deixa quem vê o aluno assinar); o Ver/Baixar dos anexos é a consulta `anexo_url { id, download }`: o servidor relê a linha
  pelo id como a pessoa e assina SÓ o caminho dela no `anexos` do ambiente, com o prazo de hoje (60 s para baixar com o nome do
  arquivo, 120 s para ver). Nenhum caminho nem nome vem do navegador; a URL volta relativa e a tela monta com o domínio dela.
- Ficam no navegador (de OUTRA W): no Resumo, o plano e os ✓ (`planos_do_aluno`, `refeicoes_concluidas` — 20c) e os compromissos, o
  responsável, o acesso e o "Editar dados" (`aluno_compromissos`, `aluno_responsavel`, `aluno_acesso`, `paciente_dado_livre` — H-43); o
  aviso das mensagens desligadas (`mensagens_desligadas`, H-43); e o Treino do painel (a `treino-leitura`, a `admin-get-user` e a
  `admin-semana-treinos`, já pelo servidor — desvio 22).
- Nenhuma migration; os grants e as policies de LEITURA **ficam** (decisão 12 da spec hml-20: a função lê com a sessão da pessoa, que
  precisa deles; os APKs antigos e o AAB ainda leem direto — desvio 2).

## Principal: a Dieta, as Dietas, a Pré-consulta e o Dashboard de saúde pela função (hml-20c, H-42 + H-102 · jeito 2, etapa 2)
- **Leituras (H-42):** a Dieta do aluno no painel (Planejamento, Acompanhamento, Cálculo energético, Suplementos, Manipulados, Orientações,
  Metas e o "Editar treino e dieta"), as Dietas (Alimentos, Receitas, Diário), a Pré-consulta (Formulários, Respostas, os números e o
  contador do menu), a parte de saúde do Dashboard (o resumo, a "Atividade recente" e o "Diário de hoje") e os ★ da Ferramentas › Modelos
  não leem mais as tabelas, as RPCs e o Storage do principal no navegador: as libs mandam a ação **`ler`** da `nutricao` (o mesmo motor
  e o mesmo catálogo da hml-20a/20b — só ganharam as 34 consultas da 20c), que roda cada consulta **como a pessoa** (o mesmo token): o
  select das tabelas da área com as colunas do tipo (o `*` de antes, escrito coluna a coluna, e os embutidos de antes — as medidas do
  alimento, os ingredientes com o alimento, o aluno do diário com `!inner`), o filtro do aluno (`paciente_id` do corpo — o RLS de hoje
  decide), as vivas, a ordem, a página e o total de antes (o count exato, o HEAD do "só o número" e o total de cada dia que a página do
  Diário partiu, na MESMA ida); o recorte da conta ativa (`conta_id = a conta do corpo` ou o paciente sem conta do próprio — o `.or()` de
  hoje, montado no servidor com o `userId` do token); e as RPCs de leitura de hoje (`planos_do_aluno`, `plano_alimentar`,
  `planos_favoritos`, `grupos_alimentos`, `receitas_da_nutricionista` — com as receitas da página relidas pelos ids na mesma ida —,
  `preconsulta_numeros`, `respostas_da_conta`, `painel_resumo`), com o EXECUTE de hoje. "Minhas": os nomes para a cópia de receita e os
  grupos de receita com o "meus" (o dono = o token, nunca o corpo); os ★ com a conta (H-108) = só os do dono (o token) e da conta do
  corpo. Os modelos, o catálogo de produtos e todas as receitas seguem como a lib lia: sem filtro de dono — o RLS decide.
- **Storage:** as miniaturas do Diário e do Dashboard (`diario_urls { ids }`, até 60 por lote, 1 h) e a foto grande (`diario_foto_url
  { id }`, por clique, 300 s): o servidor relê as linhas pelo id como a pessoa e assina SÓ o `path` delas no `diario` do ambiente (a policy
  de leitura de hoje). Nenhum caminho vem do navegador; a URL volta relativa e a tela monta com o domínio dela (uma função só — H-106).
- **Gravações da Pré-consulta (H-102):** as 5 que a tela fazia direto passam pela `nutricao` com a sessão da pessoa (o RLS da W21 e os
  gatilhos de hoje seguem valendo): `preconsulta_formulario_criar` (o dono = o token; a conta do corpo, que a policy confere — só membro
  ativo; o `slug` nasce no servidor, no alfabeto e no tamanho da tela, de novo no conflito do índice único, até 5 vezes),
  `preconsulta_formulario_editar` e `preconsulta_resposta_ligar` (só as colunas da lista — dono, conta, slug e as de controle do corpo
  caem; o `importada_em` é o agora do servidor) e `preconsulta_formulario_excluir`/`preconsulta_resposta_excluir` (a Lixeira:
  `deleted_at`). Os códigos dos gatilhos (`aluno_invisivel`, `resposta_imutavel`, `formulario_imutavel`) voltam como eles (403). O
  formulário público `/f/:slug` (`preconsulta_formulario`/`preconsulta_responder`, como anônimo) **fica** como está (decisão 13).
- Ficam no navegador (de OUTRA W): no Dashboard, os alunos, a agenda e o financeiro (H-43 e 20d) e o Treino (`painel-resumo-treino`, já
  pelo servidor); na Pré-consulta, a equipe da conta (H-43); os links públicos do diário e do formulário (anônimos, de propósito).
- Nenhuma migration; os grants e as policies de LEITURA e de ESCRITA **ficam** (decisão 12 da spec hml-20: a função lê e grava com a
  sessão da pessoa, que precisa deles; os APKs antigos e o AAB ainda falam direto — desvio 2).

## Principal: o Financeiro pela função `financeiro` — as leituras (hml-20d, H-42 · jeito 2, etapa 2, parte 4)
- **Leituras (H-42, a última parte):** as 6 abas do Financeiro (Resumo, Mensalidades, Planos, Lançamentos, Recibos, Categorias), o
  Financeiro do aluno (Painel › Aluno), a parte do Financeiro do Dashboard e o resumo leve do app do aluno (a faixa do Início, a trava do
  inadimplente e o chip do Perfil) não leem mais as tabelas e as RPCs do principal no navegador: as libs mandam a ação **`ler`** da
  `financeiro` (o MESMO motor da `nutricao` — `_shared/leitura-lote.ts`, sem mudança — com o catálogo novo `_shared/financeiro-leituras.ts`,
  12 consultas, e o módulo `functions/financeiro/leituras.ts`), que roda cada consulta **como a pessoa** (o mesmo token; nenhuma chave
  secreta), no lote da tela (as comuns e as da aba aberta numa ida): o select das tabelas com as colunas do select de hoje (`categorias_
  financeiras`, `modelos_recibo`, `recibos`, `profiles`, `cobrancas` com o nome do aluno, `transacoes` com a categoria), as vivas, a
  ordem, a página com o count exato do Financeiro do aluno e as RPCs de leitura de hoje (`financeiro_resumo_periodo`,
  `financeiro_lancamentos`, `financeiro_recibos`, `financeiro_totais_do_aluno`, `financeiro_do_aluno`), com o EXECUTE de hoje — os
  `{ ok: false, erro }` de propósito das 3 da conta voltam como o erro do item. "Minhas" (o dono = o token, nunca o corpo): as categorias,
  os modelos, o último nº do recibo (sem o filtro das vivas — os da Lixeira contam, o número não volta) e o nome do profissional; as
  cobranças do Resumo/Dashboard com o recorte da conta ativa (`conta_id = a conta do corpo` ou sem conta e do próprio — o `.or()` de hoje,
  montado no servidor com o `userId` do token) e o "em aberto OU vence no mês", em leituras de 1000 até 20 no servidor (passou → a frase
  de hoje). O aluno e a conta vêm do corpo e o RLS/a RPC decide (outra conta → lista vazia / `sem_acesso`, como hoje). A aluna também
  chama a `financeiro` (a porta aceita qualquer pessoa logada, como a `nutricao`).
- **Gravações:** as 14 de antes (hml-19d) seguem iguais — o `ler` é despachado antes da lista delas. O comprovante do Pix (o PUT no link
  que o servidor assinou) é gravação e fica; a cobrança, o Pix e o Mercado Pago seguem pela `pagamentos-aluno`. Sem Storage nas leituras.
- Ficam no navegador (de OUTRA W): a equipe da conta das telas do Financeiro (`equipe_da_conta`, H-43).
- Nenhuma migration; os grants e as policies de LEITURA **ficam** (decisão 12 da spec hml-20: a função lê com a sessão da pessoa, que
  precisa deles; os APKs antigos e o AAB ainda leem direto — desvio 2).

## Treino: quem lê os treinos montados
- `tb_grupos_treino` e `tb_grupos_exercicios` (`physiq_pode_ler_grupo`): o master; o professor dono; qualquer profissional,
  se o grupo é do catálogo global do master (`professor_id` vazio); e o aluno que recebe o grupo (`tb_grupos_treino_perfis`).
  O app do aluno recebe os treinos pelo PowerSync e pelas Edge Functions (`service_role`).
- `tb_pastas_treino`: o master, o dono e, nas pastas globais, os profissionais. `tb_pastas_treino_grupos` segue a pasta.
- `tb_exercicios` e `grupos_musculares`: o visitante, só o global; o profissional, todos; o aluno, o global e o do professor dele.
- `physiq_profiles`: o próprio aluno não muda `professor_id`, `conta_id` nem as colunas de controle (`status`, `admin_locked`,
  `plano_nome`, `plano_expiracao`, `mensalidade_valor`, `cobranca_pausada`) — o gatilho `physiq_profiles_guard` mantém o valor.

## Testes
- `python3 e2e/hml01/banco.py --schema staging|public` — só leitura; confere tudo acima nos 2 bancos (vale em produção).
- `python3 e2e/hml01/equipe_staging.py` — só no staging: convite e papéis da equipe (dono pode, membro não).

## O CI confere (hml-13)
Todo PR roda `scripts/ci/checar-definer.mjs` (check `checar-pr`) nas migrations da hml-01 em diante. Fica vermelho: definer NOVA
sem `revoke … from public` e `from anon`, sem dizer o que faz com o logado (`revoke … from authenticated` ou `grant execute … to
authenticated`), ou qualquer definer sem `SET search_path`. Troca de função que já existe (mesmo nome e nº de argumentos) mantém os
grants e só precisa do `search_path`. Definer que o visitante chama de propósito entra na lista `ANONIMAS_DE_PROPOSITO` do script
(decisão escrita no PR). O estado do banco vivo continua com o `e2e/hml01/banco.py`.
