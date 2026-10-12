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

## Principal e Treino: as leituras de saúde do app do aluno pelas funções (hml-20a, H-42 · jeito 2, etapa 2)
- **Principal:** o app do aluno (Início, Evolução, Dieta/Diário) não lê mais a `minha_dieta`, a `minha_evolucao` nem assina as fotos
  do `diario`/`evolucao` no navegador: a função `nutricao` ganhou a ação **`ler`** (em lote — motor `_shared/leitura-lote.ts`, catálogo
  fechado `_shared/nutricao-leituras.ts`, módulo `nutricao/leituras.ts`), que roda cada consulta **como a pessoa** (o mesmo token): as
  RPCs de leitura de hoje (`minha_dieta`, `minha_evolucao` — definer, com o `auth.uid()` dentro; o EXECUTE do `authenticated` não
  muda) e o select de `diario_alimentar` (`id`, `path`, só as vivas) pelo RLS de hoje ("paciente: ler o proprio diario" + a restritiva
  da W24, que deixa passar o `paciente_do_meu_login`). A URL assinada sai do servidor com a sessão da pessoa (as policies de leitura
  dos buckets de hoje), só para os caminhos que a própria consulta leu, com o prazo de hoje (1 h); volta relativa ao projeto e a tela
  monta com o domínio dela (a mesma URL de antes). Colunas em lista fechada (nenhum `*`); consulta "minha" = o dono vem do `user`.
- **Treino:** a Evolução do próprio aluno vai pela `admin-avaliacoes`, ação **`minha_evolucao`** (antes do `requireAdmin`; o token
  conferido pelo JWKS; freio por pessoa em memória): o cliente **como a pessoa** (a chave anon + o token; nenhuma chave secreta) lê
  `physiq_profiles` (as 37 colunas), `physiq_avaliacoes` (as colunas que a série usa) e `physiq_registros_fotos` (5 colunas) do `sub`
  do token — o RLS "o aluno lê as próprias linhas" — e assina as fotos no `registros`/`registros-staging` (policy
  `registros_read_own_or_admin`). Qualquer papel lê só o próprio.
- Nenhuma migration: os grants e as policies de LEITURA **ficam** (decisão 12 da spec hml-20): a função lê com a sessão da pessoa,
  que precisa deles; os APKs antigos e o AAB ainda leem direto (`docs/desvios.md`, desvio 2). Fechar o `rest` é a etapa 4 do jeito 2,
  quando não houver mais leitura direta (H-43) e houver versão mínima de app.
- O fetch dos 2 clientes repete o POST de LEITURA 1 vez, como o GET de hoje (`ACOES_DE_LEITURA` em `src/integrations/repeticao.ts`:
  a `ler` da `nutricao`/`financeiro`, pelo campo `acao`, e a `minha_evolucao` da `admin-avaliacoes`, pelo campo `action`); as
  gravações dessas funções seguem indo 1 vez.

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
