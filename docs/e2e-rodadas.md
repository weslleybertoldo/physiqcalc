# Rodadas de E2E (Physiq)

Homologação, achado H-50 (hml-13, 08/10/2026). Toda rodada de E2E que serve de prova entra aqui: 1 linha por script por base,
a mais nova em cima. Sem dado pessoal e sem segredo (só o nome do script, a base e o placar).

- **De onde vem a linha:** o `Placar.fim()` (`e2e/w02/_comum.py`) grava cada rodada sozinho em
  `~/projetos/physiqcalc-scratch/e2e-rodadas.tsv` (fora do repo; troca com `PHYSIQ_E2E_REGISTRO`). No fim de cada worktree, as
  linhas dela vão para esta tabela no PR da própria worktree; as de produção (que rodam depois do merge) entram no PR seguinte.
- **Base:** `local` (build ou dev na máquina), `staging` (schema `staging` + `physiqcalc-staging.vercel.app`), `produção`
  (schema `public` + `physiqcalc.com.br`). Atenção: o staging mora nos MESMOS 2 projetos do Supabase da produção (Auth e Storage
  únicos): todo login grava sessão de verdade.
- **Resultado:** o placar que o script imprime (`N/M`). Falhou = o placar + o motivo curto em "obs.".

## Rotina do fim de cada worktree (staging, antes do merge)

1. **Sempre** (só leitura, ~3 min): `python3 e2e/w10/api.py` · `python3 e2e/w07/api.py api` (hoje cai: a conta `excluir1` foi
   excluída na hml-09 — recriar na fase 6) · `python3 e2e/w25/api.py` (lê a massa do DIA: rodar antes o `massa.py` da w25, senão os
   casos com "hoje"/"há N dias" falham). Mexeu em
   migration: `python3 e2e/hml01/banco.py --schema staging` (e `--schema public` depois de aplicar em produção).
2. **Da família que a worktree tocou** (criam massa no staging e limpam): `h5` (cadastro/agenda) · `w11` (diário/dieta) · `w15`
   (treinos do admin) · `w16` (nutri/membros) · `w18` (clínicos/anexos) · `w20` (agenda) · `w21` (pré-consulta) · `w23` (modelos) ·
   `w24` (diário/dietas) · `w26` (lixeira). Rodar o `api.py` da família e o `telas.py` correspondente.
3. **Fora da rotina** (só com a massa do dono da worktree, e sabendo o que fazem): os que criam massa e NÃO limpam — `h4`, `w06`,
   `w07b`, `w13`, `w27`, `w28` (os 3 do Mercado Pago usam o sandbox).
4. **Nunca na rotina** (escrevem em produção): `--schema public` do `w08b`, `w20c` e `w14`; `*/prova_real.py`; `w07b/smoke_prod.py`;
   `h3/emails.py --prod`; `w04/espelho_fila.py --schema public --processar`; os `*/prod.py` que criam dado (lista no parecer, H-68).

## Rodadas

| data (BRT) | worktree | commit | script (argumentos) | base | resultado | obs. |
|---|---|---|---|---|---|---|
| 12/10 10:52 | exercicios-pf | `c71f2a3` | `e2e/exercicios_pf/sql_exercicios_pf.py --schema public` | produção | 1/17 | só leitura, ANTES da migration `20261012110000` (o vermelho esperado): os 3 não existem e são 144 globais — só o "nenhum nome global repetido" passa. A busca da Biblioteca (`exercicios_da_lista`) foi conferida à parte com um global que já existe (o Supino Inclinado no Smith): acha |
| 12/10 10:52 | exercicios-pf | `c71f2a3` | `e2e/exercicios_pf/sql_exercicios_pf.py --schema staging` | staging | 1/17 | o mesmo, no staging (só leitura, antes da migration) |
| 12/10 10:51 | exercicios-pf | `c71f2a3` | prova local da migration e dos 2 scripts (fora do repo: `~/projetos/physiqcalc-scratch/exercicios-pf/provar_local.py`) | local | 41/41 | Postgres 18 descartável (só socket) com a `tb_exercicios` dos 2 schemas igual à do banco (as 13 colunas, a PK, o CHECK, o índice e as 144 linhas com a mesma soma) + a RPC da Biblioteca. A migration inteira 2×: 147 globais em cada, os 3 certos (globais, sem GIF, sem dica), os 144 de antes iguais, e a 2ª não muda nada. `aplicar.py`: sem `--schema` recusa; o dry-run vai de 144 a 147 dentro da transação e nada fica; nome global repetido ou id com outra classificação param sem gravar; a conferência que não bate volta tudo; de verdade, com backup (144 linhas, arquivo 600, pasta 700); rodar de novo não faz nada. O `sql_treino` não aceita BEGIN … ROLLBACK e o `exec_treino` aceita |
| 12/10 10:51 | exercicios-pf | `c71f2a3` | `e2e/exercicios_pf/sql_exercicios_pf.py --schema staging` (e `--schema public`) | local | 17/17 | dentro da prova local: depois da migration e depois do `aplicar.py` (antes dela, 1/17) |
| 12/10 10:51 | exercicios-pf | `c71f2a3` | `e2e/exercicios_pf/sql_exercicios_pf.py --schema staging --seco` (e `--schema public --seco`) | local | 29/29 | autoteste sem banco: a migration = as 3 linhas decididas, ids uuid5, listas fixas, os blocos do `aplicar.py` |
| 12/10 09:59 | hml-20b | `2c00c39` | `e2e/hml20/rede.py --area aluno --base staging --canal msedge` | staging | 22/22 | F6 (o staging com o `2c00c39`): a 20a igual — 0 leitura direta do principal; o desvio 23 só no Início e na Evolução; logout do Treino do app 204 |
| 12/10 09:52 | hml-20b | `2c00c39` | `e2e/hml20/telas.py --area painel-aluno --base staging --canal msedge --prefixo staging2` | staging | 84/87 | F6, o depois no staging: a Avaliação pela parte do principal 0,58 s (nutri) e 0,49 s (personal) ≤ antes + 0,3; as 3 falhas = TEMPO do Resumo pela parte do principal 0,48 × 0,81 s (nutri) e 0,44 × 0,86 s (personal) e do Anexos 0,46 × 0,79 s — a decisão é da sessão principal; prints `staging2_b_*` conferidos; massa limpa (0 linha, 0 arquivo) |
| 12/10 09:49 | hml-20b | `2c00c39` | `e2e/hml20/rede.py --area painel-aluno --base staging --canal msedge` | staging | 59/60 | F6: 0 leitura direta da área nas 14 telas; 1 `ler` por seção; a falha = a Avaliação da nutri com 2 `ler` (o perfil e a série em lotes separados — o 1º navegador depois do deploy); um diagnóstico só leitura logo depois (fora do repo, 6 aberturas): sempre 1 lote |
| 12/10 09:19 | hml-20b | `574430e` | `e2e/w25/api.py` | staging | 23/30 | regressão: a mesma base da 20a e das 19a–19d (as 7 da massa do dia); o `w25/massa.py` parou na trava dela ("o Carlos tem login no principal") |
| 12/10 09:18 | hml-20b | `574430e` | `e2e/w10/api.py` | staging | 22/22 | regressão |
| 12/10 09:14 | hml-20b | `574430e` | `e2e/w18/telas.py --base http://localhost:8080 --prefixo local20b --canal msedge` | local | 52/52 | regressão: o card Prontuário do Resumo e a aba por papel, as 10 seções, o anexo e o PDF pelo `ler`; a massa da W18 voltou ao começo (SQL só leitura: as mesmas contagens) |
| 12/10 09:13 | hml-20b | `574430e` | `e2e/w18/api.py` | staging | 81/81 | regressão (depois do `w18/massa.py`) |
| 12/10 09:11 | hml-20b | `574430e` | `e2e/hml20/rede.py --area aluno --base local --canal msedge` | local | 22/22 | regressão: a 20a igual (0 leitura direta do principal; o desvio 23 só no Início e na Evolução); logout do Treino do app 204 |
| 12/10 09:09 | hml-20b | `574430e` | `e2e/hml19/rede.py --area avaliacao --base local --canal msedge --prefixo local20b` | local | 22/22 | regressão com os 5 casos (a personal da foto mensal, com Treino, abre a Avaliação pelo hook novo); logout do Treino da personal 204; limpeza 0 |
| 12/10 09:02 | hml-20b | `574430e` | `e2e/hml20/telas.py --area painel-aluno --base local --canal msedge` | local | 85/87 | com o `ec101ce`: a Avaliação pela parte do principal 0,43 s (nutri) e 0,45 s (personal) ≤ antes + 0,3; as 2 falhas = Consultas 0,47 × 0,78 s e Questionários 0,46 × 0,77 s (+0,31: o degrau de ~0,1 s da medição; a mediana das 6 aberturas 0,67/0,72 s) — aceitas pela sessão principal; prints `local_b_*` conferidos |
| 12/10 09:00 | hml-20b | `574430e` | `e2e/hml20/rede.py --area painel-aluno --base local --canal msedge` | local | 60/60 | com o `ec101ce`: a Avaliação com 1 `ler` (aluno_perfil + aluno_evolucao_painel juntos) nas 2 contas; 0 leitura direta da área nas 14 telas |
| 12/10 08:41 | hml-20b | `aabcd22` | `e2e/hml19/rede.py --area prontuario --base local --canal msedge --prefixo local20b` | local | 18/18 | regressão: as gravações do Prontuário seguem pela nutricao |
| 12/10 08:33 | hml-20b | `315a5c0` | `e2e/hml20/telas.py --area painel-aluno --base local --canal msedge` | local | 85/87 | decisão J: 12 de 14 telas ≤ antes + 0,3 s; a Avaliação pela parte do principal 0,50 × 0,91 s (nutri) e 0,59 × 1,00 s (personal) — 2 voltas em série (o perfil, depois a série) → a sessão principal mandou corrigir (`ec101ce`) |
| 12/10 08:26 | hml-20b | `315a5c0` | `e2e/hml20/telas.py --area painel-aluno --base staging --canal msedge --prefixo antes_staging` | staging | 73/73 | o ANTES (o staging com o `ec0ead9`, sem a 20b): prints `antes_staging_b_*` e a referência de tempo |
| 12/10 08:24 | hml-20b | `315a5c0` | `e2e/hml20/rede.py --area painel-aluno --base local --canal msedge` | local | 60/60 | o DEPOIS: 0 leitura direta da área nas 14 telas; 1 `ler` por seção (a Avaliação 360, 2); a Avaliação com 2 `ler` (antes do `ec101ce`); 0 gravação nova ao abrir |
| 12/10 08:22 | hml-20b | `315a5c0` | `e2e/hml20/rede.py --area painel-aluno --base staging --canal msedge` | staging | 44/44 | o ANTES (`ec0ead9`): cada tela lia a área direto (a Avaliação 2, o Resumo 1, as seções 1 a 7); a ordem nova (a Avaliação antes do Resumo) |
| 12/10 08:16 | hml-20b | `56ec422` | `e2e/hml20/rede.py --area painel-aluno --base staging --canal msedge` | staging | 43/44 | o ANTES na ordem velha: a Avaliação da personal abria do cache do Resumo (0 leitura) → a ordem nova (`315a5c0`) |
| 12/10 08:11 | hml-20b | `56ec422` | `e2e/hml20/api.py --area painel-aluno --base local` | staging | 58/58 | P das 27 consultas (= o SQL fixo das libs do `6fd3194`, como a pessoa) e N1–N9 (o `--base local` = o schema staging); o `ler` 231–727 ms; a massa "hml20 e2e" criada e limpa (SQL só leitura: 0 linha, 0 arquivo) |
| 12/10 07:12 | W2 | `0317e33` | `e2e/hml01/banco.py --schema public` | produção | 12/12 | Task 22: sem regressão depois da migration. Junto (fora do repo): as funções da W2 no public 5/5 só leitura (a volta → `?mp=invalido`; o webhook com `&conta=` inventada → 200 `conta_sem_mp`) |
| 12/10 07:12 | W2 | `0317e33` | `e2e/w1b/sql_w1b.py --schema public` | produção | 7/7 | Task 22: depois da migration (4 gatilhos em cobrancas, com o novo trg_cobrancas_guard_mp_conta) |
| 12/10 07:11 | W2 | `0317e33` | `e2e/w1/sql_w1.py --so-catalogo --schema public` | produção | 6/6 | Task 22: a W1 intacta depois da migration |
| 12/10 07:11 | W2 | `0317e33` | `e2e/w2/sql_w2.py --so-catalogo --schema public` | produção | 15/15 | Task 22: logo depois da migration no public (07:11:17–19, uma vez; backup antes): os 10 corpos = os da migration, C1 (a guarda da W1b ligada), I7, a recebimento_mp_confirmar sem o anon, o job mp-renovar-public, as 2 flags (mercadopago_conta `{"liberada": false}`) |
| 12/10 07:10 | W2 | `0317e33` | `e2e/hml01/banco.py --schema public` | produção | 12/12 | Task 22: a linha de base, antes da migration |
| 12/10 07:10 | W2 | `0317e33` | `e2e/w1b/sql_w1b.py --schema public` | produção | 7/7 | Task 22: a linha de base, antes da migration |
| 12/10 07:09 | W2 | `0317e33` | `e2e/w1/sql_w1.py --so-catalogo --schema public` | produção | 6/6 | Task 22: a linha de base do public ANTES da migration `20261011210000` (só leitura) |
| 12/10 06:54 | W2 | `0c9e886` | `e2e/w1/telas.py --base staging --canal msedge --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | staging | 85/85 | Task 21: a W1 sem regressão no site do staging com a W2 (`0c9e886`, v3.104) e as funções do HEAD; os 15 prints conferidos (a InfiniteTag e as outras contas borradas); desfazer igual, sobras 0; a w27-master sem login novo |
| 12/10 06:48 | W2 | `0c9e886` | `e2e/w2/telas.py --base staging --canal msedge --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | staging | 123/123 | Task 21: o site do staging no `0c9e886` (v3.104; Vercel READY e o `health.json` com o sha) + as funções do HEAD; o Pix SIMULADO do staging (o sandbox respondeu 5xx); o passo 7 com "pagamento pelo app indisponível"; os 21 prints conferidos (nada passa da largura, nenhuma página do MP, o QR e o copia e cola borrados, as outras contas borradas); desfazer igual, sobras 0 |
| 12/10 06:39 | W2 | `0c9e886` | `e2e/w2/sql_w2.py` | staging | 33/33 | Task 21: de novo no fim da série de servidor (o catálogo e o "nada gravado" iguais) |
| 12/10 06:36 | W2 | `0c9e886` | `e2e/w06/api.py --casos mp` | staging | 9/12 | Task 21 (tentativa): o sandbox do MP segue recusando pagamento com a credencial de teste — os 3 ❌ = o cartão APRO e o OTHE com 502 `mp_error` + o estorno em cascata (como em 11/10 14:05); o Pix (o simulado do staging), a automática e a volta ao Pix ok; a avulsa de teste que ficou aberta saiu (o soft delete do `limpar_testes`). O `--casos antigo` não rodou: grava uma assinatura `authorized` de mentira no Treino e no principal ANTES do pagamento e só a cancela no fim |
| 12/10 06:34 | W2 | `0c9e886` | `e2e/w1b/api_w1b.py --casos legitimo,outro --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | staging | 2/4 | Task 21 (tentativa): os 2 ❌ = o sandbox recusou criar o Pix de teste (500); o desfazer igual (0 linha de teste, nenhum Pix aberto) |
| 12/10 06:33 | W2 | `0c9e886` | `e2e/w10/api.py --schema staging` | staging | 22/22 | Task 21: regressão |
| 12/10 06:33 | W2 | `0c9e886` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | Task 21: regressão |
| 12/10 06:31 | W2 | `0c9e886` | `e2e/w06/api.py --casos pix,porfora,acesso` | staging | 31/31 | Task 21: regressão (o modo de hoje) |
| 12/10 06:30 | W2 | `0c9e886` | `e2e/wp/api.py --casos planos,periodo,mensal` | staging | 33/33 | Task 21: regressão; sobras 0 |
| 12/10 06:29 | W2 | `0c9e886` | `e2e/w1/api.py --casos recebimento,link` | staging | 19/19 | Task 21: regressão; sobras 0 |
| 12/10 06:26 | W2 | `0c9e886` | `e2e/w2/api.py --local --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 130/130 | Task 21: as funções do HEAD no Deno local + o simulador do MP contra o banco do staging — os 36 casos, com os 2 novos da revisão (`pix_avulsa_de_outra_conta` 4/4, `pix_vivo_sem_escrita` 3/3); a tabela da Task 9 10/10 com o token da conta; 159 pedidos sem mutação com o token de outro dono; sobras 0 |
| 12/10 06:13 | W2 | `0c9e886` | `e2e/w2/api.py --conexao-sql --casos recebimento,guarda,simulada,desconectar,master,erro --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | staging | 37/37 | Task 21: as 7 funções republicadas do `0c9e886` (a `pagamentos-aluno` v47 etc.) com o verify_jwt certo; sobras 0. Junto (script de fora do repo): o smoke das publicadas que não grava 5/5 (a `mp-contas-renovar` com o S10 no `public` → 409 `schema_sem_w2`) |
| 12/10 06:05 | W2 | `0c9e886` | `e2e/w07/smoke_prod.py telas --versao 3.103 --canal msedge` | produção | 13/13 | Task 21: só leitura, logo depois de republicar as 7 |
| 12/10 05:59 | W2 | `0c9e886` | `e2e/w06/smoke_prod.py` | produção | 17/18 | Task 21: só leitura; o ❌ é o antigo (o seletor da tela antiga do Financeiro "até a W19"); a `pagamentos-aluno` v47 respondeu 200 nas 2 telas (o aluno e o painel, que chama o `prof_aluno`) |
| 12/10 05:56 | W2 | `0c9e886` | `e2e/w10/api.py --schema public` | produção | 2/2 | Task 21: só leitura. Junto (scripts de fora do repo): as funções da W2 no `public` 5/5 e o `prof_aluno` com a conta de teste do `w06` — 200 e a mesma forma de antes da publicação (38 caminhos de chave); logs 05:53–06:06 com 0 5xx; as sessões dos smokes fechadas com logout local |
| 12/10 05:52 | W2 | `0c9e886` | `e2e/w2/sql_w2.py` | staging | 33/33 | Task 21: a migration não mudou desde a Task 6 (o mesmo md5) — não reaplicada; o catálogo confere antes de republicar as funções |
| 12/10 05:17 | W2 | `4e4c2b6` | `e2e/w2/telas.py --base local --limpar` | local | 1/1 | rodada 2 da Task 19: conferência só leitura depois das 2 rodadas — nenhum arquivo de estado, 0 plano "W2 e2e …" e 0 automática `sim-w2tela-…` viva no staging |
| 12/10 05:17 | W2 | `4e4c2b6` | `e2e/w2/telas.py --base local --loja --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 64/64 | rodada 2 da Task 19, depois do conserto `4e4c2b6`: o build da LOJA refeito (v3.103, play); passo 7: a linha da mensalidade do aluno termina em "pagamento pelo app indisponível" (sem Pix nem cartão) e a folha só avisa; o 7c verde (origem `apk` → a URL do SITE com `no_site`, nenhuma ida ao MP); prints `7b_erro_aluno`, `5_app_pix`, `5b_app_pago` e `6_app_cartao` conferidos; tudo voltou à foto (sobras 0) |
| 12/10 05:13 | W2 | `4e4c2b6` | `e2e/w2/telas.py --base local --loja --seco` | local | 25/25 | o build da loja refeito no `4e4c2b6` (27 textos: + "pagamento pelo app indisponível" no `Pagamentos.tsx`); nada gravado |
| 12/10 05:13 | W2 | `4e4c2b6` | `e2e/w2/telas.py --base local --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 123/123 | rodada 2 da Task 19, depois do conserto `4e4c2b6` (o achado da rodada 1 FECHADO): o build do SITE refeito (v3.103) contra o banco e as funções do staging (as da Task 14); passo 7: "Venceu em 11/10 · pagamento pelo app indisponível" no cartão e "O pagamento pelo app está indisponível agora. Avise o seu profissional." na folha, sem Pix nem cartão; o Pix SIMULADO do staging (o sandbox do MP recusa a TEST-); prints `7b_erro_aluno`, `5_app_pix`, `5b_app_pago` e `6_app_cartao` conferidos; tudo voltou à foto (sobras 0) |
| 12/10 05:07 | W2 | `4e4c2b6` | `e2e/w2/telas.py --base local --seco` | local | 25/25 | o build do site refeito no `4e4c2b6` (27 textos); nada gravado |
| 12/10 05:04 | hml-20a | `df3e5a6` | `e2e/w26/prod.py --canal msedge` | produção | 17/17 | F8 só leitura (nutri-legado): as públicas, a Lixeira e os Impressos/Modelos/Calculadora; os 2 PDFs com a marca PHYSIQ; 0 escrita barrada; contagens iguais antes/depois |
| 12/10 05:02 | hml-20a | `df3e5a6` | `e2e/hml20/rede.py --area aluno --base prod` | produção | 13/13 | F8 só leitura (aluno-calc; Início e Evolução, pelo invólucro do F8): 0 leitura direta do principal; o `ler` 1 por tela; o desvio 23 do Treino direto; 0 gravação |
| 12/10 05:00 | hml-20a | `df3e5a6` | `e2e/w07/smoke_prod.py telas --versao 3.103 --canal msedge` | produção | 10/10 | F8 só leitura: o rodapé "Physiq 3.103"; 0 escrita barrada |
| 12/10 04:50 | W2 | `aa7140f` | `e2e/w2/telas.py --base local --limpar` | local | 1/1 | Task 19: conferência só leitura depois das 2 rodadas — nenhum arquivo de estado, 0 plano "W2 e2e …" e 0 automática `sim-w2tela-…` viva no staging |
| 12/10 04:49 | W2 | `29aa525` | `e2e/w2/telas.py --base local --loja --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 63/64 | Task 19: o build da LOJA do `8e23866` (v3.103, play; do `8e23866` ao `29aa525` só testes e funções ainda não publicadas): os passos 5 a 7 + o 7c (o Capacitor em modo app: "Conectar de novo" pede origem `apk`, a função devolve a URL do SITE com `no_site`, o site abre por cima, nenhuma ida ao MP, nenhuma conexão criada); os 7 prints conferidos; o ❌ é o mesmo achado do site (a linha "· Pix" com a conexão caída); tudo voltou à foto (sobras 0) |
| 12/10 04:46 | W2 | `29aa525` | `e2e/w2/telas.py --base local --loja --seco` | local | 25/25 | o build da loja do `8e23866`; nada gravado |
| 12/10 04:44 | W2 | `29aa525` | `e2e/w2/telas.py --base local --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 122/123 | Task 19: o build do SITE do `8e23866` (v3.103) contra o banco e as funções do staging (as da Task 14); os 21 prints conferidos (nada passa da largura, nenhuma página do MP, o Pix borrado); jeito 2 medido (0 chamada do navegador às tabelas do Recebimento); a autorização do MP interceptada 1 vez, com a URL conferida; o Pix SIMULADO do staging (o sandbox do MP recusa a TEST- desde 11/10); achado ABERTO (defeito do app): com a conexão do personal caída, a linha da mensalidade do aluno diz "Venceu em 11/10 · Pix" e a folha diz "O pagamento pelo app está indisponível agora" (`src/app-aluno/perfil/Pagamentos.tsx:476`: o `soPix` não olha o `mp.disponivel`; print `7b_erro_aluno`); tudo voltou à foto (sobras 0) |
| 12/10 04:38 | W2 | `29aa525` | `e2e/w2/telas.py --base local --seco` | local | 25/25 | o build do site do `8e23866`; nada gravado |
| 12/10 04:33 | hml-20a | `0933e35` | `e2e/w11/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging20a --canal msedge --casos dieta,sem_internet` | staging | 45/45 | F7 (o staging com o e948962): a Dieta do app pela `ler` e o sem_internet com o helper novo; rodado por um invólucro de fora do repo (1 login por conta e o logout no fim); a limpeza final da W11 |
| 12/10 04:31 | hml-20a | `0933e35` | `e2e/hml20/telas.py --area aluno --base staging --canal msedge --prefixo staging2` | staging | 14/14 | F7, o depois no staging: tempo Início 0,12 · Evolução 0,55 · Dieta 0,11 s; gate (a função ociosa 30 s) Evolução 0,91 s, card do peso 0,96 s; prints staging2_a_* iguais aos antes_staging_a_* e aos local_a_* |
| 12/10 04:22 | hml-20a | `0933e35` | `e2e/hml20/rede.py --area aluno --base staging --canal msedge` | staging | 22/22 | F7, o depois no staging (e948962): 0 leitura direta do principal; o desvio 23 (as 3 GET do Treino) só no Início e na Evolução |
| 12/10 03:58 | hml-20a | `07cd2e1` | `e2e/w11/telas.py --base http://localhost:8080 --prefixo local20a --canal msedge --casos dieta,sem_internet,virada,dia_sem_refeicao,pratos,rotas` | local | 69/69 | regressão: a Dieta do app pela `ler` (plano, ✓, foto pro diário, outro dia); o sem_internet com o helper novo (a dieta barrada nos 2 caminhos) volta sozinha; fora so_nutricao (expectativa velha desde a W12) e nutri_antigo (o site antigo) |
| 12/10 03:52 | hml-20a | `07cd2e1` | `e2e/w25/api.py` | staging | 23/30 | a mesma base das hml-19a–19d (as 7 da massa do dia); o `massa.py` parou na trava dela ("o Carlos tem login no principal") |
| 12/10 03:50 | hml-20a | `07cd2e1` | `e2e/w10/api.py` | staging | 22/22 | regressão |
| 12/10 03:50 | hml-20a | `07cd2e1` | `e2e/w24/telas.py --base http://localhost:8080 --prefixo local20a --canal msedge` | local | 58/59 | o `app` (a reação no app, pela `ler`) ok; a falha "1 aviso no sino do Rafael" é a massa antes das 10:00 (a foto mais nova vira o jantar que a massa reagiu → o gatilho segura o aviso por 10 min) — não é da 20a |
| 12/10 03:43 | hml-20a | `07cd2e1` | `e2e/w24/api.py` | staging | 46/47 | depois do `massa.py --limpar` + `massa.py`; o E3 = a mesma causa (a massa antes das 10:00); só REST + o gatilho `diario_avisar_reacao` |
| 12/10 03:37 | hml-20a | `07cd2e1` | `e2e/w24/api.py` | staging | 44/47 | C6/C7: a massa acumulada (4 fotos da Ana/Bruna em vez de 2); E3: a massa antes das 10:00 |
| 12/10 03:36 | W2 | `8e23866` | `e2e/w2/telas.py --base local --loja --seco` | local | 25/25 | Task 19, Step 1: o build da loja (v3.103); nada gravado |
| 12/10 03:36 | W2 | `8e23866` | `e2e/w2/telas.py --base local --seco` | local | 25/25 | Task 19, Step 1: o build do site (v3.103); nada gravado |
| 12/10 03:33 | hml-20a | `07cd2e1` | `e2e/w19/telas.py --base http://localhost:8080 --prefixo local20a --canal msedge --casos lancamentos,recibos,categorias,aluno_recibo,membro` | local | 36/36 | regressão; `massa.py --limpar` às 03:33 (0 viva, SQL só leitura) |
| 12/10 03:30 | hml-20a | `07cd2e1` | `e2e/w19/massa.py` | staging | 1/1 | a massa da W19 |
| 12/10 03:29 | hml-20a | `07cd2e1` | `e2e/hml19/laco.py --base local --canal msedge --prefixo local20a --secoes app` | local | 4/4 | com a `nutricao` barrada a Dieta do app abre (o `ler` passa) e só a gravação é barrada (a correção da revisão) |
| 12/10 03:17 | hml-20a | `07cd2e1` | `e2e/hml19/rede.py --area financeiro --base local --canal msedge --prefixo local20a` | local | 26/26 | regressão |
| 12/10 03:16 | hml-20a | `07cd2e1` | `e2e/hml19/rede.py --area avaliacao --base local --canal msedge --prefixo local20a --casos antropometria,foto_evolucao` | local | 11/11 | só os casos da nutri (os da personal da tela pediriam o 7º login da etapa) |
| 12/10 03:14 | hml-20a | `07cd2e1` | `e2e/hml19/rede.py --area dieta --base local --canal msedge --prefixo local20a` | local | 27/27 | o app_marcar conta só a gravação (o `ler` do recarregamento fora — a correção da revisão) |
| 12/10 03:13 | hml-20a | `07cd2e1` | `e2e/hml20/telas.py --area aluno --base local --canal msedge --casos tempo` | local | 6/6 | o tempo de novo, sozinho: Evolução 0,80 s ≤ 0,67 + 0,3 |
| 12/10 03:08 | hml-20a | `07cd2e1` | `e2e/hml20/telas.py --area aluno --base local --canal msedge` | local | 13/14 | com o desvio 23 o gate (a função ociosa 30 s) voltou ao antes: Evolução 0,82 s, card do peso 0,97 s; a falha = o tempo da Evolução 1,09 s logo depois do caso de erro (sozinho: 0,80 s) |
| 12/10 02:59 | hml-20a | `07cd2e1` | `e2e/hml20/rede.py --area aluno --base local --canal msedge` | local | 22/22 | 0 leitura direta do principal; o desvio do Treino (as 3 GET) só no Início e na Evolução; 0 `minha_evolucao` |
| 12/10 02:57 | hml-20a | `07cd2e1` | `e2e/hml20/telas.py --area aluno --base staging --canal msedge --casos gate` | staging | 3/3 | o antes do gate pela regra nova (a função ociosa 30 s): Evolução 1,17 s, card do peso 1,02 s |
| 12/10 02:38 | hml-20a | `ba14cfe` | `e2e/hml19/rede.py --area prontuario --base local --canal msedge --prefixo local20a` | local | 18/18 | regressão |
| 12/10 02:21 | hml-20a | `ba14cfe` | `e2e/hml20/telas.py --area aluno --base local --canal msedge` | local | 13/14 | GATE J reprovado (o Treino pela `admin-avaliacoes`): card do peso com o cache vazio 2,57 s × 1,06 s (a Evolução 0,92 s passou) → o desvio 23 |
| 12/10 02:16 | hml-20a | `ba14cfe` | `e2e/hml20/rede.py --area aluno --base local --canal msedge` | local | 18/18 | o Treino ainda pela função: 0 leitura direta da área |
| 12/10 02:14 | hml-20a | `ba14cfe` | `e2e/hml20/telas.py --area aluno --base staging --canal msedge` | staging | 9/9 | o antes (f4db482): os prints staging_a_* e os tempos |
| 12/10 02:09 | hml-20a | `ba14cfe` | `e2e/hml20/rede.py --area aluno --base staging --canal msedge` | staging | 12/12 | o antes (f4db482): as leituras de saúde iam direto do navegador |
| 12/10 02:07 | hml-20a | `ba14cfe` | `e2e/hml20/api.py --area aluno --base local` | staging | 39/39 | P e N1–N10 das 2 funções (o `--base local` = o schema staging); a massa "hml20 e2e" criada e limpa (SQL só leitura: 0 linha, 0 arquivo) |
| 12/10 01:55 | W2 | `7366e3c` | `e2e/w2/api.py --seco` | local | 17/17 | Task 14: o final (+ autotestes 43/43) |
| 12/10 01:54 | W2 | `7366e3c` | `e2e/w2/sql_w2.py` | staging | 33/33 | Task 14: o banco do staging igual depois dos E2E |
| 12/10 01:53 | W2 | `7366e3c` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | Task 14: regressão |
| 12/10 01:53 | W2 | `7366e3c` | `e2e/w06/api.py --casos pix,porfora,acesso` | staging | 31/31 | Task 14: regressão (o modo de hoje) |
| 12/10 01:52 | W2 | `7366e3c` | `e2e/wp/api.py --casos planos,periodo,mensal` | staging | 33/33 | Task 14: regressão |
| 12/10 01:50 | W2 | `7366e3c` | `e2e/w1/api.py --casos recebimento,link --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | staging | 19/19 | Task 14: regressão com as funções da W2 publicadas |
| 12/10 01:48 | W2 | `7366e3c` | `e2e/w2/api.py --conexao-sql --casos recebimento,guarda,simulada,desconectar,master,erro --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | staging | 37/37 | Task 14: as 6 funções publicadas com o verify_jwt certo; a conexão simulada gravada por SQL só no staging; desconectar e o "Desligar" do master com a automática viva → 409 → com o OK cancela; desfazer igual, sobras 0 |
| 12/10 01:44 | W2 | `9621ff9` | `e2e/w2/api.py --seco` | local | 17/17 | Task 14: com a correção do `--conexao-sql` ainda sem commit (o mesmo código do `7366e3c`) |
| 12/10 01:36 | W2 | `9621ff9` | `e2e/w07/smoke_prod.py telas --versao 3.102 --canal msedge` | produção | 13/13 | Task 14: a produção na v3.102 |
| 12/10 01:36 | W2 | `9621ff9` | `e2e/w06/smoke_prod.py --casos aluno` | produção | 8/8 | Task 14: o caso aluno de novo (= os 17/18 de sempre); pagamentos-aluno 200; nada mudou |
| 12/10 01:35 | W2 | `9621ff9` | `e2e/w06/smoke_prod.py` | produção | 16/18 | Task 14: só leitura; o ❌ antigo "Financeiro (tela antiga até a W19)" + "uma troca de token só (2)" = a corrida conhecida do trocar-token (a mesma da W1b) → o caso aluno de novo, abaixo |
| 12/10 01:31 | W2 | `9621ff9` | `e2e/w10/api.py --schema public` | produção | 2/2 | Task 14: só leitura, logo depois de publicar as 7 funções da W2 do `9621ff9` (01:29–01:31) com a W2 desligada no public |
| 12/10 01:17 | W2 | `9621ff9` | `e2e/w2/api.py --seco` | local | 17/17 | Task 13: o final (+ autotestes 41/41) |
| 12/10 01:15 | W2 | `9621ff9` | `e2e/w2/api.py --local --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 123/123 | Task 13, rodada 2: os 34 casos; nenhuma mutação com o token de outro dono (145 pedidos); tudo voltou à foto, sobras 0 |
| 12/10 01:03 | W2 | `9621ff9` | `e2e/w2/api.py --local --casos master --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 11/11 | Task 13, rodada 2a: o master de teste promovido SÓ no staging.profiles durante a rodada e devolvido no desfazer |
| 12/10 01:00 | W2 | `2ff8184` | `e2e/w2/api.py --seco` | local | 17/17 | Task 13: com a correção ainda sem commit (o mesmo código do `9621ff9`); nada vai ao banco |
| 12/10 00:55 | W2 | `2ff8184` | `e2e/w2/api.py --local --sinal ~/…/w2/TRAVA-BANCO-STAGING-OK` | local | 116/123 | Task 13, rodada 1 (as funções no Deno local contra o banco do staging): o caso master deu 403 so_master às 6 chamadas (o master de teste é 'pessoa' fora das rodadas — bug do SCRIPT, não do servidor) e 1 ❌ de tokens por consequência; corrigido no `9621ff9` |
| 12/10 00:35 | W2 | `2ff8184` | `e2e/w1/sql_w1.py --so-catalogo --schema public` | produção | 6/6 | Task 6: só leitura; o public intocado |
| 12/10 00:35 | W2 | `2ff8184` | `e2e/w1b/sql_w1b.py --schema public` | produção | 7/7 | Task 6: só leitura; o public intocado |
| 12/10 00:35 | W2 | `2ff8184` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | Task 6: regressão depois da migration |
| 12/10 00:35 | W2 | `2ff8184` | `e2e/wp/sql_planos.py` | staging | 9/9 | Task 6: regressão depois da migration |
| 12/10 00:34 | W2 | `2ff8184` | `e2e/w1/sql_w1.py` | staging | 11/11 | Task 6: regressão depois da migration (o prólogo com a guarda nova do modo) |
| 12/10 00:34 | W2 | `2ff8184` | `e2e/w1b/sql_w1b.py` | staging | 16/16 | Task 6: regressão depois da migration |
| 12/10 00:34 | W2 | `2ff8184` | `e2e/w2/sql_w2.py` | staging | 33/33 | Task 6: depois da migration SÓ no staging (00:33:00–02, uma vez): os 15 de catálogo (os 10 corpos = os da migration, I7, os 4 gatilhos, o job, as 2 flags, os 2 CHECK) e nada gravado (a foto da conta de TESTE igual) |
| 12/10 00:32 | W2 | `2ff8184` | `e2e/w1/sql_w1.py --so-catalogo --schema public` | produção | 6/6 | Task 6: só leitura, antes da migration no staging |
| 12/10 00:32 | W2 | `2ff8184` | `e2e/w1b/sql_w1b.py --schema public` | produção | 7/7 | Task 6: só leitura, antes da migration no staging |
| 12/10 00:31 | W2 | `2ff8184` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | Task 6: antes da migration |
| 12/10 00:31 | W2 | `2ff8184` | `e2e/wp/sql_planos.py` | staging | 9/9 | Task 6: antes da migration |
| 12/10 00:31 | W2 | `2ff8184` | `e2e/w1/sql_w1.py` | staging | 11/11 | Task 6: antes da migration |
| 12/10 00:31 | W2 | `2ff8184` | `e2e/w1b/sql_w1b.py` | staging | 16/16 | Task 6: antes da migration |
| 12/10 00:30 | W2 | `2ff8184` | `e2e/w2/sql_w2.py` | staging | 4/33 | Task 6: o retrato ANTES da migration `20261011210000` no staging (o vermelho esperado, o mesmo do ensaio local) |
| 11/10 23:51 | hml-20a | `d715fa8` | `e2e/hml20/api.py --area aluno --base prod --so-leitura` | produção | 7/7 | o smoke da sessão principal logo depois de publicar as 2 funções |
| 11/10 23:50 | hml-20a | `d715fa8` | `e2e/hml20/api.py --area aluno --base staging --so-leitura` | staging | 7/7 | o smoke da sessão principal logo depois de publicar as 2 funções |
| 11/10 20:29 | hml-19d | `fed0f0d` | `e2e/w19/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging19d --canal msedge --casos lancamentos,recibos,categorias,aluno_recibo,membro` | staging | 36/36 | F8: as telas da W19 com gravação no staging com o código novo (o local deu 36/36) |
| 11/10 20:27 | hml-19d | `fed0f0d` | `e2e/w19/massa.py` | staging | 1/1 | F8: a massa da W19; `--limpar` às 20:29 (0 linha da massa, SQL só leitura) |
| 11/10 20:26 | hml-19d | `fed0f0d` | `e2e/hml19/rede.py --area financeiro --base staging --canal msedge --casos movimentacao,recibo --prefixo staging2b` | staging | 9/9 | F8: 2ª amostra do tempo — movimentação 967 ms, recibo 1597 ms (a 1ª deu 6360, isolada) |
| 11/10 20:24 | hml-19d | `fed0f0d` | `e2e/hml19/rede.py --area financeiro --base staging --canal msedge --prefixo staging2` | staging | 26/26 | F8, o DEPOIS no staging: cada ação = 1 chamada da `financeiro`, 0 gravação direta; prints staging2_d_* iguais aos local_d_* (o d_erro também) |
| 11/10 20:14 | hml-19d | `e370f1e` | `e2e/wp/telas.py --base local --canal msedge` | local | 125/125 | regressão da W-P (só rodado, sem editar): planos, ficha do aluno, Mensalidades, app do aluno e membro no código novo; o desfazer dela confere (sobras 0) |
| 11/10 20:07 | hml-19d | `e370f1e` | `e2e/w19/telas.py --base http://localhost:8080 --prefixo local19d --canal msedge --casos lancamentos` | local | 12/12 | com a espera nova do harness (o filtro e os totais vêm do banco desde a hml-14b): estornar → total −210 pela `transacao_estornar` |
| 11/10 20:06 | hml-19d | `e370f1e` | `e2e/w19/massa.py` | staging | 1/1 | a massa de novo para a 2ª rodada do caso lancamentos; `--limpar` às 20:08 (0 linha da massa, SQL só leitura) |
| 11/10 20:01 | hml-19d | `e370f1e` | `e2e/w19/telas.py --base http://localhost:8080 --prefixo local19d --canal msedge --casos lancamentos,recibos,categorias,aluno_recibo,membro` | local | 34/36 | as 2 do harness: "filtro pela forma" e "estornar tira dos totais" liam antes de o banco responder (D14 da hml-14b; o `Lancamentos.tsx` não mudou) |
| 11/10 19:59 | hml-19d | `e370f1e` | `e2e/w19/massa.py` | staging | 1/1 | a massa da W19 (tx 23, cob 7, rec 3) |
| 11/10 19:56 | hml-19d | `e370f1e` | `e2e/hml14/telas.py --base local --canal msedge --casos b19-movimentacao,b19-recibo,P1 --prefixo local_19d_b` | local | 115/115 | regressão (massa "HOMOLOG lista 19h50", 14b e aluno, limpa no fim) |
| 11/10 19:52 | hml-19d | `e370f1e` | `e2e/hml14/telas.py --base local --canal msedge --casos lancamentos,recibos --prefixo local_19d` | local | 55/55 | regressão |
| 11/10 19:49 | hml-19d | `e370f1e` | `e2e/w25/api.py` | staging | 23/30 | a mesma base das hml-13/15b/16d/19a/19b/19c (as 7 da massa do dia); nada do Financeiro |
| 11/10 19:48 | hml-19d | `e370f1e` | `e2e/w10/api.py` | staging | 22/22 | regressão |
| 11/10 19:47 | hml-19d | `e370f1e` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | com a migration 20261011120000 no staging |
| 11/10 19:45 | hml-19d | `e370f1e` | `e2e/hml19/rede.py --area financeiro --base local --canal msedge` | local | 26/26 | o DEPOIS: cada ação = 1 chamada da `financeiro`, 0 `rest` nas 4 tabelas e no `pacientes`; prints local_d_* |
| 11/10 19:41 | hml-19d | `e370f1e` | `e2e/hml19/rede.py --area financeiro --base staging --canal msedge --casos movimentacao,recibo --prefixo diag` | staging | 7/7 | o antes de novo, com o diagnóstico novo do harness: recibo 2 `rest` em 1267 ms |
| 11/10 19:39 | hml-19d | `e370f1e` | `e2e/hml19/rede.py --area financeiro --base staging --canal msedge` | staging | 18/19 | o ANTES (7694e8a): a gravação ia direto em todas; a espera do recibo (do E2E) não fechou em 60 s — o recibo saiu certo |
| 11/10 19:35 | hml-19d | `e370f1e` | `e2e/hml19/api.py --area financeiro --base staging` | staging | 47/47 | P e N1–N9 (financeiro v1 + a migration no staging); limpeza conferida |
| 11/10 19:32 | hml-19d | `e370f1e` | `e2e/hml19/api.py --area financeiro --base prod --so-leitura` | produção | 5/5 | sessão principal: smoke só leitura depois de publicar |
| 11/10 18:29 | W1b | `6c44103` | `e2e/w1/telas.py --base prod --canal msedge` | produção | 13/13 | o build 3.101 (`7694e8a`); a InfinitePay escondida pelo servidor; Pagamentos do aluno abre; a Guarda barrou 0; logouts 204 |
| 11/10 18:28 | W1b | `6c44103` | `e2e/w06/smoke_prod.py` | produção | 17/18 | só leitura; o ❌ é o antigo e conhecido "Financeiro (tela antiga até a W19)"; pagamentos-aluno 200; as cobranças iguais |
| 11/10 18:25 | W1b | `6c44103` | `e2e/w07/smoke_prod.py telas --versao 3.101 --canal msedge` | produção | 13/13 | rodapé e Aplicativo v3.101; logout local das 2 sessões |
| 11/10 18:24 | W1b | `6c44103` | `e2e/w10/api.py --schema public` | produção | 2/2 | depois do squash `7694e8a` (PR #184) e da produção v3.101; logout local da sessão que ele abriu |
| 11/10 17:56 | W1b | `6c44103` | `e2e/w10/api.py --schema public` | produção | 2/2 | só leitura, depois da migration |
| 11/10 17:56 | W1b | `6c44103` | `e2e/hml01/banco.py --schema public` | produção | 12/12 | sem regressão depois da migration |
| 11/10 17:56 | W1b | `6c44103` | `e2e/w1b/sql_w1b.py --schema public` | produção | 7/7 | logo depois da migration no public (17:56:01–02, uma vez; backup antes): o gatilho ligado, invoker com search_path vazio, sem EXECUTE para o app e o anon, o corpo = o da migration, as 3 guardas, sinal 0 |
| 11/10 17:54 | W1b | `6c44103` | `e2e/w1b/sql_w1b.py --schema public` | produção | 2/7 | o retrato ANTES da migration `20261011220000` no public (o vermelho esperado: sem o gatilho e sem a função; ✅ as 15 colunas e nenhum sinal do ataque) |
| 11/10 17:25 | hml-19c | `8a911bb` | `e2e/hml19/api.py --area avaliacao --base staging --limpar` | staging | 2/2 | F8: nada pendente; conferência só leitura 0/0 (2 bancos, 2 schemas, 4 buckets, avisos) |
| 11/10 17:24 | hml-19c | `8a911bb` | `e2e/w17/avaliacao_telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging19c --canal msedge` | staging | 63/63 | F8: a aba Avaliação inteira no staging com o código novo (o local deu 64/64) |
| 11/10 17:20 | hml-19c | `8a911bb` | `e2e/hml19/rede.py --area avaliacao --base staging --canal msedge --prefixo staging2` | staging | 21/21 | F8, o DEPOIS no staging: cada ação só pelas funções, 0 gravação direta; prints staging2_c_* + a folha |
| 11/10 17:05 | W1b | `865c87f` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | com a migration nova (M1) no staging e a `pagamentos-aluno` v41 |
| 11/10 17:05 | W1b | `865c87f` | `e2e/w1/api.py --casos recebimento,link --sinal ~/…/w1b/TRAVA-BANCO-STAGING-OK` | staging | 19/19 | regressão com a guarda nova e a `pagamentos-aluno` v41 (igual às 14:02); tudo voltou à foto, sobras 0 |
| 11/10 17:03 | W1b | `865c87f` | `e2e/wp/api.py --casos planos,periodo,mensal` | staging | 33/33 | regressão com a v41 (igual às 09:47); o `mensal` faz o `POST /rest/v1/cobrancas` do dono (avulsa sem MP) que a guarda deixa passar; a massa desfeita |
| 11/10 17:02 | W1b | `865c87f` | `e2e/w06/api.py --casos pix,porfora,acesso` | staging | 31/31 | regressão com a guarda nova e a v41 (igual às 13:59) |
| 11/10 16:59 | W1b | `865c87f` | `e2e/w06/smoke_prod.py --casos aluno` | produção | 8/8 | só leitura; o caso aluno de novo: 1 troca de token (a 2ª das 16:57 foi corrida do teste) |
| 11/10 16:57 | W1b | `865c87f` | `e2e/w06/smoke_prod.py` | produção | 16/18 | só leitura, logo depois de publicar a v41: o antigo "Financeiro (tela antiga até a W19)" + "uma troca de token só (2)" no caso aluno: 2 pedidos ao `trocar-token` do Treino e 1 resposta (o 1º cortado pelo `page.goto` do teste; o caso painel espera a troca antes de navegar, o aluno não). A `pagamentos-aluno` respondeu 200 nas 2 telas; o caso aluno de novo deu 8/8 |
| 11/10 16:54 | W1b | `865c87f` | `e2e/w10/api.py --schema public` | produção | 2/2 | só leitura, logo depois de publicar a `pagamentos-aluno` v41 (16:54:30, vale para staging e produção) |
| 11/10 16:52 | W1b | `865c87f` | `e2e/w1b/sql_w1b.py --schema staging` | staging | 16/16 | com a migration NOVA (M1: a linha do MP não muda de aluno, conta, tipo, autor nem origem pelo app) reaplicada `--so staging` às 16:52:01; o corpo no banco = o da migration; nada ficou gravado |
| 11/10 16:51 | W1b | `865c87f` | `e2e/w1b/sql_w1b.py --schema staging` | staging | 13/16 | o retrato ANTES de reaplicar (a guarda das 13:57, sem o M1): só `[mover]`, `[responsavel]` e o corpo ❌, o esperado; nada ficou gravado |
| 11/10 14:05 | W1b | `93f1c17` | `e2e/w06/api.py --casos mp` | staging | 9/12 | sandbox do MP fora, não é a guarda: os 3 ❌ = cartão APRO e OTHE com 502 `mp_error` + o reembolso em cascata (a avulsa não chegou a ser paga). Log da `pagamentos-aluno` v40: `mp_pix_falhou` 500 `internal_server_error` (o Pix virou o simulado `sim-` do staging) e `mp_cartao_falhou` 500 2×; sonda direta no sandbox (sem função e sem banco) às 14:06: `POST /v1/payments` com o cartão APRO → 500 `internal_error`, o mesmo das 02:50. O resto passou com a guarda: Pix, aprovação simulada, coberto, automática, cancelar e a volta ao `pix_manual`; a avulsa de teste que ficou aberta saiu (`deleted_at`, como o `limpar_testes`) |
| 11/10 14:03 | W1b | `93f1c17` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | com a migration da W1b no staging |
| 11/10 14:02 | W1b | `93f1c17` | `e2e/w1/api.py --casos recebimento,link --sinal ~/…/w1b/TRAVA-BANCO-STAGING-OK` | staging | 19/19 | regressão com a guarda e a `pagamentos-aluno` v40 (sem a conferência nova): 1 link de verdade na InfinitePay (o do aluno, R$ 10,00, reaproveitado no 2º toque), nenhum pago; tudo voltou à foto |
| 11/10 14:01 | W1b | `93f1c17` | `e2e/wp/api.py --casos planos,periodo` | staging | 26/26 | regressão com a guarda (igual às 11:52); a massa desfeita |
| 11/10 13:59 | W1b | `93f1c17` | `e2e/w06/api.py --casos pix,porfora,acesso` | staging | 31/31 | regressão com a guarda (igual às 09:48): o modo de hoje sem mudança |
| 11/10 13:58 | W1b | `93f1c17` | `e2e/w1b/sql_w1b.py --schema staging` | staging | 13/13 | depois da 2ª aplicação da migration `--so staging` (idempotente: 1 gatilho, 1 função); nada ficou gravado |
| 11/10 13:57 | W1b | `93f1c17` | `e2e/w1b/sql_w1b.py --schema staging` | staging | 13/13 | com a migration `20261011220000` SÓ no staging (aplicada às 13:57:15); o `service_role` trocado de verdade; nada ficou gravado |
| 11/10 13:56 | W1b | `93f1c17` | `e2e/w1b/sql_w1b.py --schema staging` | staging | 4/13 | o vermelho esperado, ANTES da migration: o furo C1 aberto no staging (o app gravou `forma mp` e as 7 colunas do MP numa avulsa e mexeu na linha do MP do servidor); nada ficou gravado |
| 11/10 13:43 | hml-19c | `106fc83` | `e2e/w17/avaliacao_telas.py --base http://localhost:8080 --prefixo local19c --canal msedge` | local | 64/64 | regressão: a aba Avaliação inteira no código novo (a foto do mês pelas foto_*, a antropometria pela nutricao) |
| 11/10 13:39 | hml-19c | `106fc83` | `e2e/hml19/rede.py --area avaliacao --base local --canal msedge` | local | 21/21 | o DEPOIS: cada ação só pelas funções (0 rest/Storage/RPC direto); prints local_c_* |
| 11/10 13:27 | hml-19c | `106fc83` | `e2e/hml19/rede.py --area avaliacao --base staging --canal msedge --casos antropometria` | staging | 6/6 | o antes (881480d), de novo para o print do Histórico |
| 11/10 13:26 | hml-19c | `106fc83` | `e2e/w25/api.py` | staging | 23/30 | a mesma base das hml-13/15b/16d/19a/19b (as 7 da massa do dia); nada da Avaliação |
| 11/10 13:24 | hml-19c | `106fc83` | `e2e/w10/api.py` | staging | 22/22 | regressão |
| 11/10 13:23 | hml-19c | `106fc83` | `e2e/hml19/rede.py --area avaliacao --base staging --canal msedge --casos foto_erro` | staging | 6/6 | o antes: 1 aviso com a frase fixa, sem laço |
| 11/10 13:22 | hml-19c | `106fc83` | `e2e/hml19/rede.py --area avaliacao --base staging --canal msedge` | staging | 14/16 | o ANTES (881480d): a gravação ia direto em todas as ações; as 2 do foto_erro = o tempo da conta do E2E (corrigido: 6/6) |
| 11/10 13:18 | hml-19c | `a483a96` | `e2e/hml19/rede.py --area avaliacao --base staging --canal msedge` | staging | 7/14 | o antes, 1ª: erros do E2E (o gravador quebrava no corpo binário; o modal pedia as dobras) — corrigidos em 106fc83 |
| 11/10 13:12 | hml-19c | `a483a96` | `e2e/hml19/api.py --area avaliacao --base staging` | staging | 42/42 | P e N1–N9 nas 2 funções (admin-avaliacoes v41, nutricao v3); o trocar = a mesma linha; limpeza 0/0 |
| 11/10 13:09 | hml-19c | `a483a96` | `e2e/hml19/api.py --area avaliacao --base staging` | staging | 2/4 | parou na guarda do vínculo ANTES de gravar (a w5p-aluna sem usuário do Treino); nada gravou |
| 11/10 13:08 | hml-19c | `a483a96` | `e2e/w17/avaliacao_api.py` | staging | 34/34 | decisão E: a avaliação física de hoje pela admin-avaliacoes v41 |
| 11/10 13:06 | hml-19c | `a483a96` | `e2e/hml19/api.py --area aluno --base staging` | staging | 27/27 | decisão E (nutricao v3) |
| 11/10 13:05 | hml-19c | `a483a96` | `e2e/hml19/api.py --area dieta --base staging` | staging | 102/102 | decisão E (nutricao v3) |
| 11/10 13:02 | hml-19c | `a483a96` | `e2e/hml19/api.py --area prontuario --base staging` | staging | 124/124 | decisão E (nutricao v3) |
| 11/10 12:58 | hml-19c | `a483a96` | `e2e/hml19/api.py --area aluno --base prod --so-leitura` | produção | 6/6 | sessão principal: smoke só leitura depois de publicar |
| 11/10 12:58 | hml-19c | `a483a96` | `e2e/hml19/api.py --area dieta --base prod --so-leitura` | produção | 6/6 | sessão principal: smoke só leitura depois de publicar |
| 11/10 12:58 | hml-19c | `a483a96` | `e2e/hml19/api.py --area prontuario --base prod --so-leitura` | produção | 5/5 | sessão principal: smoke só leitura depois de publicar |
| 11/10 12:58 | hml-19c | `a483a96` | `e2e/hml19/api.py --area avaliacao --base prod --so-leitura` | produção | 6/6 | sessão principal: smoke só leitura depois de publicar |
| 11/10 12:33 | W1 | `881480d` | `e2e/w1/telas.py --base prod` | produção | 13/13 | Task 21: a InfinitePay escondida pelo servidor (a flag desligada; o master vê); Pagamentos do aluno abre; a Guarda barrou 0; 3 prints conferidos |
| 11/10 12:32 | W1 | `881480d` | `e2e/w06/smoke_prod.py` | produção | 17/18 | Task 21: só leitura; o ❌ é o antigo e conhecido "Financeiro (tela antiga até a W19)"; nada mudou nas cobranças |
| 11/10 12:29 | W1 | `881480d` | `e2e/w10/api.py --schema public` | produção | 2/2 | Task 21: só leitura |
| 11/10 12:28 | W1 | `881480d` | `e2e/w10/api.py` | staging | 22/22 | Task 21: regressão, só leitura, com staging = main |
| 11/10 12:27 | W1 | `881480d` | `e2e/w07/smoke_prod.py telas --versao 3.99 --canal msedge` | produção | 13/13 | Task 21: depois do squash `c0d5416` (PR #183) e da release v3.99; rodapé e Aplicativo v3.99 |
| 11/10 12:06 | W1 | `68d5239` | `e2e/hml01/banco.py --schema public` | produção | 12/12 | Task 21: sem regressão depois da migration |
| 11/10 12:06 | W1 | `68d5239` | `e2e/wp/sql_planos.py --so-regressao --schema public --comparar ~/…/w1/regressao-public-antes.json` | produção | 1/1 | Task 21: o "pago até" IGUAL depois da migration (5 alunos, 0 diferentes) |
| 11/10 12:06 | W1 | `68d5239` | `e2e/w1/sql_w1.py --so-catalogo --schema public` | produção | 6/6 | Task 21: logo depois da migration no public (12:06:19–21, uma vez; backup antes); a flag `{"liberada": false}` |
| 11/10 12:05 | W1 | `68d5239` | `e2e/wp/sql_planos.py --so-regressao --schema public --guardar ~/…/w1/regressao-public-antes.json` | produção | 0/0 | Task 21: a foto do "pago até" do public ANTES da migration `20261011200000` (5 alunos; só leitura — o 0/0 = só grava a foto) |
| 11/10 11:54 | W1 | `9ca1da5` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | Task 20, com o `9ca1da5` no staging (a migration da W1 sem mudança: o dry-run deu no-op) |
| 11/10 11:53 | W1 | `9ca1da5` | `e2e/w10/api.py` | staging | 22/22 | Task 20; só leitura |
| 11/10 11:52 | W1 | `9ca1da5` | `e2e/wp/api.py --casos planos,periodo` | staging | 26/26 | Task 20: a W-P sem regressão; a massa desfeita |
| 11/10 11:51 | W1 | `9ca1da5` | `e2e/w1/api.py --casos recebimento,link,forjado --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | staging | 31/31 | Task 20: as funções no ar (`pagamentos-aluno` v40, `infinitepay-webhook-aluno` v1) e a API de verdade da InfinitePay, sem cobrar; o webhook respondeu "registrado" em 333 ms; 1 link de verdade (o do aluno, R$ 10,00, reaproveitado no 2º toque), nenhum pago; tudo voltou à foto |
| 11/10 11:47 | W1 | `9ca1da5` | `e2e/w1/telas.py --base staging --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | staging | 85/85 | Task 20: o site do staging com o `9ca1da5` (v3.99); os 15 prints conferidos: a 390 o "Testar" quebra a linha dentro do cartão, e a frase "Ainda não chegou…" sai dentro da folha, sem nada por cima do "Conferir pagamento"; a InfiniteTag borrada; 3 links de verdade (Testar e Salvar de R$ 1,00 + o do aluno de R$ 10,00), nenhum pago; tudo voltou à foto |
| 11/10 11:44 | W1 | `9ca1da5` | `e2e/w1/telas.py --base staging --seco` | staging | 22/22 | o health do staging com o `9ca1da5`; nada gravado |
| 11/10 11:31 | W1 | `bb043fb` | `e2e/w1/telas.py --base local --loja --seco` | local | 21/21 | depois do rebase na main (`c1dbffe`); nada gravado |
| 11/10 11:31 | W1 | `bb043fb` | `e2e/w1/telas.py --base local --seco` | local | 23/23 | depois do rebase na main (`c1dbffe`); nada gravado |
| 11/10 11:30 | W1 | `bb043fb` | `e2e/w1/api.py --seco` | staging | 7/7 | depois do rebase na main (`c1dbffe`); nada gravado |
| 11/10 11:08 | W1 | `3225e93` | `e2e/w1/telas.py --base local --loja --seco` | local | 21/21 | com o conserto da frase do "Conferir pagamento" dentro da folha; nada gravado |
| 11/10 11:08 | W1 | `3225e93` | `e2e/w1/telas.py --base local --seco` | local | 23/23 | com o conserto da frase do "Conferir pagamento" dentro da folha; nada gravado |
| 11/10 11:01 | W1 | `9a34478` | `e2e/w1/telas.py --base local --seco` | local | 23/23 | a checagem nova do botão livre (o toast por cima do "Conferir pagamento" é pego); nada gravado |
| 11/10 10:58 | W1 | `18a40e1` | `e2e/w1/telas.py --base local --seco` | local | 22/22 | com a InfiniteTag mascarada também no print da falha; nada gravado |
| 11/10 10:57 | W1 | `18a40e1` | `e2e/w1/api.py --seco` | staging | 7/7 | o placar troca a InfiniteTag por `<InfiniteTag>` em toda mensagem (conferido com uma tag inventada); nada gravado |
| 11/10 10:57 | hml-19b | `da9824d` | `e2e/w16/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging2 --canal msedge` | staging | 76/79 | F7: as MESMAS 3 de antes (a prescrição do Treino; [atalhos] expectativa velha; o site antigo não abriu) |
| 11/10 10:46 | W1 | `29d6906` | `e2e/w1/telas.py --base local --seco` | local | 22/22 | com o conserto do "Testar"/"Ativar" a 390 e o autoteste do botão dentro do cartão com o CSS do build; nada gravado |
| 11/10 10:46 | hml-19b | `da9824d` | `e2e/w11/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging2` | staging | 75/79 | F7: as MESMAS 4 de antes ([so_nutricao] ×3: o app abre no Início desde a W12; o site antigo não abriu) |
| 11/10 10:36 | hml-19b | `da9824d` | `e2e/w24/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging2` | staging | 60/60 | F7: o Diário das Dietas pela tela (reagir pela nutricao, o aviso no sino), Alimentos, Receitas, o /d/; harness da9824d |
| 11/10 10:30 | hml-19b | `da9824d` | `e2e/w24/api.py` | staging | 47/47 | F7, com a massa da W24 inteira (o harness da9824d: a sb_secret_ só no apikey) |
| 11/10 10:26 | hml-19b | `da9824d` | `e2e/hml19/laco.py --base staging --canal msedge --prefixo staging2` | staging | 40/40 | F7: a nutricao barrada nas 7 seções + o app (a marca volta + o texto fixo) |
| 11/10 10:22 | hml-19b | `da9824d` | `e2e/hml19/rede.py --area dieta --base staging --canal msedge --prefixo staging2` | staging | 27/27 | F7, o DEPOIS no staging: 1 chamada da nutricao por ação, 0 gravação direta |
| 11/10 10:21 | hml-19b | `da9824d` | `e2e/hml19/api.py --area aluno --base staging` | staging | 27/27 | F7 (balde do IP: o app 0 → 0; o link público 0 → 1) |
| 11/10 10:20 | hml-19b | `da9824d` | `e2e/hml19/api.py --area dieta --base staging` | staging | 102/102 | F7 |
| 11/10 10:17 | hml-19b | `da9824d` | `e2e/hml19/api.py --area prontuario --base staging` | staging | 124/124 | F7 (o staging serve da9824d) |
| 11/10 10:09 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | local | 82/82 | com o `telas.py` deste commit (o alvo do print no meio da tela + "o alvo à vista"); os 15 prints conferidos; achado ABERTO: a 390, o botão "Testar (abre a sua página, sem cobrar)" do Recebimento passa da borda do cartão (o `pq-botao` tem `nowrap` e 44 px) — correção e nova rodada na janela das 13:00; 3 links de verdade na InfinitePay (Testar e Salvar de R$ 1,00 + o do aluno de R$ 10,00), nenhum pago; tudo voltou à foto |
| 11/10 10:06 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --seco` | local | 20/20 | com o `telas.py` deste commit; nada gravado |
| 11/10 10:06 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --loja --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | local | 35/35 | com o `telas.py` deste commit; os 4 prints conferidos; 1 link de verdade na InfinitePay (o do aluno, R$ 10,00), nenhum pago; tudo voltou à foto |
| 11/10 10:03 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --loja --seco` | local | 18/18 | o teste novo do enquadramento passa com o `scrollIntoView` no meio da tela |
| 11/10 10:03 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --loja --seco` | local | 17/18 | esperado: o teste novo do enquadramento falha com o scroll de antes (o alvo por baixo da barra de baixo `[data-tabbar]`) |
| 11/10 10:03 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --loja --seco` | local | 18/18 | erro do teste novo: a página de mentira sem a `meta viewport` não reproduzia o caso — refeito |
| 11/10 10:02 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --loja --seco` | local | 17/18 | erro do script: `data-alvo` e `data-sonner-toaster` fora da lista dos atributos que não moram no `src/` — corrigido |
| 11/10 10:00 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --loja --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | local | 35/35 | os 4 prints conferidos; 1 link de verdade na InfinitePay (o do aluno, R$ 10,00), nenhum pago; tudo voltou à foto |
| 11/10 09:58 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --loja --seco` | local | 17/17 | nada gravado |
| 11/10 09:57 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | local | 82/82 | os prints conferidos: o `8_master_integracoes-390` saiu com a linha da conta por baixo da barra de baixo do celular (erro do script: o scroll "se precisar" não rola o alvo que já está na tela) — corrigido neste commit e refeito às 10:09; 3 links de verdade na InfinitePay, nenhum pago; tudo voltou à foto |
| 11/10 09:53 | W1 | `8b8041d` | `e2e/w1/telas.py --base local --seco` | local | 19/19 | nada gravado |
| 11/10 09:49 | W1 | `f324f98` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 |  |
| 11/10 09:48 | W1 | `f324f98` | `e2e/w06/api.py --casos pix,porfora,acesso` | staging | 31/31 | o modo de hoje sem regressão |
| 11/10 09:47 | W1 | `f324f98` | `e2e/wp/api.py --casos planos,periodo,mensal` | staging | 33/33 | a W-P sem regressão; a massa desfeita |
| 11/10 09:46 | W1 | `f324f98` | `e2e/w1/sql_w1.py` | staging | 11/11 | nada ficou gravado |
| 11/10 09:46 | W1 | `f324f98` | `e2e/w1/api.py --local --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | local | 23/23 | os 11 casos da baixa: as 2 funções no Deno local + o simulador, contra o banco do staging; a rodada de 15 min do staging parada e devolvida; tudo voltou à foto |
| 11/10 09:40 | W1 | `f324f98` | `e2e/w1/api.py --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | staging | 51/51 | as 2 funções publicadas e a API de verdade da InfinitePay (sem cobrar): 7 links de verdade criados (aparecem na conta InfinitePay do Weslley; nenhum pago); tudo voltou à foto |
| 11/10 09:38 | W1 | `f324f98` | `e2e/w1/api.py --seco --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | staging | 6/6 | nada gravado |
| 11/10 09:37 | W1 | `f324f98` | `e2e/w06/smoke_prod.py` | produção | 17/18 | só leitura: o 1 é o antigo e conhecido (o seletor da tela antiga do Financeiro "até a W19"), não é das funções; a `pagamentos-aluno` v40 respondeu 200 |
| 11/10 09:34 | W1 | `f324f98` | `e2e/w10/api.py --schema public` | produção | 2/2 | só leitura |
| 11/10 09:34 | W1 | `f324f98` | `e2e/w10/api.py` | staging | 22/22 | só leitura |
| 11/10 09:33 | W1 | `f324f98` | `POST infinitepay-webhook-aluno?schema=public` (pedido `<uuid>-1`) | produção | 400 `schema_sem_w1` | esperado, logo depois de publicar `infinitepay-webhook-aluno` v1 (09:33:07, verify_jwt false) e `pagamentos-aluno` v40 (09:33:14, verify_jwt true): sem a W1 no `public`, a parte nova fica desligada lá |
| 11/10 09:32 | W1 | `f324f98` | `e2e/w1/api.py --casos recebimento --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | staging | 2/10 | esperado, antes de publicar: a `pagamentos-aluno` v39 → 400 `acao_invalida`; o desfazer voltou à foto |
| 11/10 09:17 | hml-19b | `6d81237` | `e2e/w16/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging19b --casos secoes --canal msedge` | staging | 17/18 | o antes do [atalhos]: a MESMA falha no código antigo |
| 11/10 09:12 | hml-19b | `6d81237` | `e2e/w17/envio_telas.py --base http://localhost:8080 --prefixo local19b` | local | 20/20 |  |
| 11/10 09:11 | hml-19b | `6d81237` | `e2e/w17/envio_api.py` | staging | 19/19 |  |
| 11/10 09:10 | hml-19b | `6d81237` | `e2e/w11/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging19b --casos so_nutricao` | staging | 5/8 | o antes do [so_nutricao]: as MESMAS 3 falhas no código antigo |
| 11/10 09:06 | hml-19b | `6d81237` | `e2e/w25/api.py` | staging | 23/30 | a mesma base da 19a: as 7 falhas são da massa do dia (aniversário, 'há N dias', o Carlos duplicado, o treino de hoje) |
| 11/10 09:05 | hml-19b | `6d81237` | `e2e/w10/api.py` | staging | 22/22 |  |
| 11/10 09:05 | hml-19b | `6d81237` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | mexeu em migration |
| 11/10 09:04 | hml-19b | `6d81237` | `e2e/hml17/api.py --schema staging` | staging | 32/32 |  |
| 11/10 09:04 | hml-19b | `6d81237` | `e2e/w11/telas.py --base http://localhost:8080 --prefixo local19b` | local | 79/83 | as 4 falhas não são da 19b: [so_nutricao] ×3 (o app abre no Início desde a W12; iguais no código antigo) e o site antigo não abriu |
| 11/10 08:56 | hml-19b | `6d81237` | `e2e/w11/api.py` | staging | 34/34 |  |
| 11/10 08:52 | hml-19b | `6d81237` | `e2e/w16/telas.py --base http://localhost:8080 --prefixo local19b --canal msedge` | local | 76/79 | as 3 falhas não são da 19b: a prescrição do Treino; [atalhos] espera 'Registrar consulta' no site antigo (igual no código antigo); o site antigo não abriu |
| 11/10 08:44 | hml-19b | `6d81237` | `e2e/w16/api.py` | staging | 40/41 | a falha é do Treino (a prescrição do treino A do Rafael, treino-leitura), não da Dieta |
| 11/10 08:40 | hml-19b | `6d81237` | `e2e/w24/telas.py --base http://localhost:8080 --prefixo local19b` | local | não rodou | ele chama a massa da W24 primeiro, que para no passo 3: o harness manda a chave de serviço (hoje sb_secret_, não JWT) como Bearer no Storage → recusada (do script da W24, não da 19b) |
| 11/10 08:39 | hml-19b | `6d81237` | `e2e/w24/api.py` | staging | 23 ✅ + 1 ❌, parou | o /d/ (A1–A7) e o envio anônimo pela diario_enviar nova (B1–B3) ok; o ❌ C4 e a parada (IndexError) são da foto da w18-nutri2 que a massa não subiu (acima) |
| 11/10 08:36 | hml-19b | `93dbd4a` | `e2e/hml19/laco.py --base local --canal msedge` | local | 40/40 | a nutricao barrada: Manipulados/Metas/Orientações 1 garantir + o aviso; o app: a marca volta + o texto fixo |
| 11/10 08:30 | hml-19b | `93dbd4a` | `e2e/hml19/laco.py --base local --canal msedge` | local | 22/23 | a guarda do laço fechou em Manipulados com 3 GET profiles — a leitura atrasada do Plano (diagnóstico: só 2 dela); ajuste em 6d81237 |
| 11/10 08:30 | W1 | `f4d6c20` | `e2e/w1/telas.py --base local --loja --seco` | local | 17/17 | só a montagem (nada gravado) |
| 11/10 08:30 | W1 | `f4d6c20` | `e2e/w1/telas.py --base local --seco` | local | 19/19 | só a montagem (nada gravado) |
| 11/10 08:26 | hml-19b | `93dbd4a` | `e2e/hml19/rede.py --area dieta --base local --canal msedge --casos prescricao,item,duplicar --prefixo local2` | local | 14/14 | os tempos de novo, com o cronômetro por pedido: 1415 / 1326 / 1725 ms |
| 11/10 08:24 | hml-19b | `93dbd4a` | `e2e/hml19/rede.py --area dieta --base local --canal msedge` | local | 27/27 | o DEPOIS: 1 chamada da nutricao por ação, 0 rest; item 4180 ms e duplicar 9709 ms nesta rodada (a função fria) |
| 11/10 08:10 | hml-19b | `93dbd4a` | `e2e/hml19/rede.py --area dieta --base staging --canal msedge` | staging | 21/21 | o ANTES (o staging serve 276f75b): rest_dieta 1–8 por ação; o app pela RPC direta |
| 11/10 08:01 | hml-19b | `93dbd4a` | `e2e/hml19/api.py --area aluno --base staging` | staging | 27/27 | o app: ✓ refeição/meta, foto pelo link assinado, o balde do IP (app 0 → 0; link público 0 → 1), N9 |
| 11/10 08:00 | hml-19b | `93dbd4a` | `e2e/hml19/api.py --area dieta --base staging` | staging | 102/102 | as 53 ações da Dieta; N1–N8 (N8: dieta_ordenar e padroes_garantir juntos) |
| 11/10 07:58 | hml-19b | `93dbd4a` | `e2e/hml19/api.py --area prontuario --base staging` | staging | 124/124 | decisão E: a nutricao v2 contra o Prontuário que a produção usa |
| 11/10 07:51 | hml-19b | `081bb61` | `e2e/hml19/api.py --area prontuario --base staging --limpar` | staging | 3/3 | sessão principal: a limpeza da rodada cortada (0 linha / 0 arquivo) |
| 11/10 07:50 | hml-19b | `081bb61` | `e2e/hml19/api.py --area dieta --base staging --so-leitura` | staging | 1/3 | sessão principal: barrado pela rodada que caiu (o incidente do --so-leitura no staging, que rodava a bateria — corrigido em 93dbd4a) |
| 11/10 07:48 | hml-19b | `081bb61` | `e2e/hml19/api.py --area dieta --base prod --so-leitura` | produção | 6/6 | sessão principal, idem |
| 11/10 07:48 | hml-19b | `081bb61` | `e2e/hml19/api.py --area prontuario --base prod --so-leitura` | produção | 5/5 | sessão principal, logo depois de publicar a nutricao v2 (só leitura) |
| 11/10 07:19 | W1 | `dde5190` | `e2e/w1/api.py --local --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | local | 23/23 | com a correção do desfazer (`08d297f`) |
| 11/10 07:13 | W1 | `dde5190` | `e2e/w1/api.py --limpar` | staging | 1/1 | desfez a rodada de 07:12 |
| 11/10 07:12 | W1 | `dde5190` | `e2e/w1/api.py --local --sinal ~/…/w1/TRAVA-BANCO-STAGING-OK` | local | 22/23 | os casos passaram; o desfazer quebrou (erro do script: a foto da conta cobria o id da conta) — corrigido em `08d297f`; o `--limpar` desfez |
| 11/10 06:58 | W1 | `fef9b73` | `e2e/w1/api.py --seco --local` | local | 10/10 | nada gravado |
| 11/10 06:34 | W1 | `fefea01` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | com a migration da W1 inteira no staging |
| 11/10 06:33 | W1 | `fefea01` | `e2e/w1/sql_w1.py --so-catalogo --schema staging` | staging | 6/6 |  |
| 11/10 06:33 | W1 | `fefea01` | `e2e/w1/sql_w1.py` | staging | 11/11 | nada ficou gravado |
| 11/10 06:32 | W1 | `77d1f60` | `e2e/w06/sql_cobertura.py` | staging | 11/11 |  |
| 11/10 06:32 | W1 | `77d1f60` | `e2e/wp/sql_planos.py` | staging | 9/9 |  |
| 11/10 06:31 | W1 | `77d1f60` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 |  |
| 11/10 06:31 | W1 | `77d1f60` | `e2e/w1/sql_w1.py --so-catalogo --schema staging` | staging | 4/6 | antes da 2ª parte (m2) da migration no staging; 6/6 às 06:33 |
| 11/10 06:31 | W1 | `77d1f60` | `e2e/w1/sql_w1.py --so m1` | staging | 9/9 | a 1ª parte (m1) da migration |
| 11/10 05:01 | hml-19a | `f9d0917` | `e2e/h5/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging2 --canal msedge` | staging | 61/63 | F7 (o staging serve 3c539af): o caso prontuario passou inteiro; as 2 falhas são as mesmas do local e não são da 19a: o /c/ do cadastro e o IndexError do script no editor (o Rafael sem plano vivo no staging) |
| 11/10 04:54 | hml-19a | `f9d0917` | `e2e/w18/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging2 --canal msedge` | staging | 52/52 | F7 |
| 11/10 04:49 | hml-19a | `f9d0917` | `e2e/hml19/laco.py --base staging --canal msedge --prefixo staging2 --normal` | staging | 18/18 | F7 |
| 11/10 04:44 | hml-19a | `f4a2cbb` | `e2e/hml19/laco.py --base staging --canal msedge --prefixo staging2 --normal` | staging | 17/18 | erro do script, corrigido em f9d0917: contava a treino-leitura (função de leitura) como outra ação |
| 11/10 04:42 | hml-19a | `f4a2cbb` | `e2e/hml19/laco.py --base staging --canal msedge --prefixo staging2` | staging | 21/21 | F7: a nutricao barrada |
| 11/10 04:38 | hml-19a | `f4a2cbb` | `e2e/hml19/rede.py --base staging --canal msedge --prefixo staging2` | staging | 18/18 | F7, o depois no staging: 0 rest de gravação nas tabelas do Prontuário |
| 11/10 04:36 | hml-19a | `f4a2cbb` | `e2e/hml19/api.py --area prontuario --base staging` | staging | 124/124 | F7 (o staging serve 3c539af) |
| 11/10 04:09 | hml-19a | `9afbf44` | `e2e/h5/telas.py --base http://localhost:8080 --prefixo local --canal msedge` | local | 62/64 | o caso prontuario passou inteiro; as 2 falhas não são da 19a: o /c/ do cadastro (o estado do staging) e o editor da Dieta, que caiu num IndexError do script antes de abrir a tela (o Rafael sem plano vivo no staging) |
| 11/10 04:03 | hml-19a | `9afbf44` | `e2e/h5/api.py` | staging | 25/26 | a falha é do cadastro /c/ (função alunos, fora da 19a): "e-mail e CPF que já existem" voltou cadastro_repetido |
| 11/10 04:01 | hml-19a | `9afbf44` | `e2e/hml19/api.py --area prontuario --casos LX` | staging | 7/7 | a Lixeira (W26) com o excluir pela nutricao |
| 11/10 04:00 | hml-19a | `66b992c` | `e2e/w26/api.py` | staging | 1/6 | ambiente: as contas de teste da W24 com a senha velha nesta máquina e sem o backup de 01/10; a parte da Lixeira que a 19a toca está no caso LX |
| 11/10 03:56 | hml-19a | `66b992c` | `e2e/w18/telas.py --base http://localhost:8080 --prefixo local --canal msedge` | local | 52/52 |  |
| 11/10 03:53 | hml-19a | `66b992c` | `e2e/w18/api.py` | staging | 81/81 |  |
| 11/10 03:25 | hml-19a | `66b992c` | `e2e/w25/api.py` | staging | 23/30 | = base (hml-13, hml-15b, hml-16d): a massa do dia não rodou (o w25/massa.py para: o Carlos tem login no principal) |
| 11/10 03:24 | hml-19a | `66b992c` | `e2e/w10/api.py` | staging | 22/22 |  |
| 11/10 03:23 | hml-19a | `66b992c` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 |  |
| 11/10 03:21 | hml-19a | `6269a9c` | `e2e/hml19/laco.py --base local --canal msedge --normal` | local | 18/18 |  |
| 11/10 03:19 | hml-19a | `6269a9c` | `e2e/hml19/laco.py --base local --canal msedge` | local | 21/21 | a nutricao barrada: 1 garantir por seção e o aviso "Tentar de novo" |
| 11/10 03:16 | hml-19a | `6269a9c` | `e2e/hml19/rede.py --base local --canal msedge` | local | 18/18 | depois: 0 rest de gravação nas tabelas do Prontuário |
| 11/10 03:15 | hml-19a | `6269a9c` | `e2e/hml19/rede.py --base staging --canal msedge --casos anexo` | staging | 7/7 | antes (o código antigo): o anexo |
| 11/10 03:13 | hml-19a | `7027ff5` | `e2e/hml19/rede.py --base staging --canal msedge` | staging | 11/14 | antes: 1 erro do script (corrigido em 6269a9c), as duplicatas do H-81 na conta de teste e o 429 do teto por IP que o laço do código antigo causou |
| 11/10 03:10 | hml-19a | `8a0ba22` | `e2e/hml19/api.py --area prontuario --base staging` | staging | 120/120 |  |
| 11/10 03:01 | W-P | `addbaa7` | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | só leitura, com as migrations 010000–030000 da W-P no staging |
| 11/10 03:01 | W-P | `addbaa7` | `e2e/w10/api.py` | staging | 22/22 | |
| 11/10 02:58 | W-P | `addbaa7` | `e2e/wp/telas.py --base staging --canal msedge` | staging | 125/125 | o deploy do `addbaa7` no `physiqcalc-staging.vercel.app` (health 3.96 · `addbaa7` · schema staging) com a `pagamentos-aluno` v39: o mesmo roteiro do local (painel do dono, app do aluno, o membro sem Planos, o plano de 1 mês); o Brick do MP carregou; 26 prints em `prints/wp/staging/`, nenhum passa da largura; a massa desfeita (foto conferida) |
| 11/10 02:50 | W-P | `addbaa7` | `e2e/wp/api.py --casos mp` | staging | 24/25 | o mesmo 500 do sandbox do MP no pagamento com cartão; a massa desfeita |
| 11/10 02:48 | W-P | `addbaa7` | `e2e/wp/api.py` | staging | 56/57 | com a `pagamentos-aluno` v39 (republicada 02:44:40–02:44:48, o `e65291c`): o 1 = "3× aprovado (APRO) cobre os 12 meses" — o sandbox do MP devolveu 500 `internal_error` no `POST /v1/payments` do cartão (sondado direto na API do MP às 02:51 e às 03:01: 3×, 1× e R$ 99,90 → 500); o caminho é o mesmo da v38 (57/57 às 01:15); a massa desfeita |
| 11/10 02:46 | W-P | `addbaa7` | check `checar-pr` (`workflow_dispatch` no `staging`, run 38115653145) | GitHub | pass | lint, tipos, definer 102/0, `node --test`, Vitest 353 arquivos / 4.210 testes, build e chunks ✔ (o CI do PR não roda no push do `staging`) |
| 11/10 02:22 | W-P | `7753ec5` | `e2e/wp/telas.py --base local --loja --canal msedge` | local | 125/125 | o build da loja (`build:loja`, health.json `play`) no `vite preview` :8080: o aluno pagando o profissional igual ao site; 26 prints em `prints/wp/local/loja/`, nenhum passa da largura; a massa desfeita (foto conferida) |
| 11/10 02:16 | W-P | `7753ec5` | `e2e/wp/telas.py --base local --canal msedge` | local | 125/125 | painel do dono (Planos, ficha, Mensalidades, aviso das automáticas, cartão parcelado), app do aluno (período, parcela 4 de 12, Renovar, faixa "Seu plano vence em 3 dias", Mercado Pago até 3×, o plano de 1 mês falando de mensalidade) e o membro sem a aba Planos; 26 prints em `prints/wp/local/`, nenhum passa da largura; a massa desfeita (foto conferida) |
| 11/10 02:01 | W-P | `e65291c` + `8e66855` | `e2e/wp/telas.py --base local --loja --canal msedge` | local | 111/111 | antes do passo do plano de 1 mês (o "Renovar plano" dele: corrigido em `7753ec5`) |
| 11/10 01:57 | W-P | `e65291c` + `8e66855` | `e2e/wp/telas.py --base local --canal msedge` | local | 111/111 | idem |
| 11/10 01:47 | W-P | `2d0d0e7` | `e2e/wp/telas.py --base local --canal msedge` | local | 109/111 | (1) a faixa leu o resumo guardado no aparelho (10 min, desenho da W6) de antes do pagamento por fora: o E2E limpa o guardado antes de abrir; (2) erro sem dono do Brick do Mercado Pago ao fechar o cartão ("Could not find the Brick container ID"): corrigido em `8e66855` |
| 11/10 01:41 | W-P | `2d0d0e7` | `e2e/wp/telas.py --base local --canal msedge` | local | 16/26 | o painel do `prof2` travado: o teste grátis do plano do profissional da conta de TESTE acabou em 02/10 — o E2E passou a liberar só durante a rodada e devolver no fim |
| 10/10 07:41 | hml-17 | `3c9183a` | `e2e/w07/smoke_prod.py telas --versao 3.92 --canal msedge` | produção | 13/13 |  |
| 10/10 07:40 | hml-17 | `3c9183a` | `e2e/w26/prod.py` | produção | 21/21 |  |
| 10/10 07:40 | hml-17 | `3c9183a` | `e2e/hml17/telas.py --base prod --canal msedge` | produção | 21/23 | P3: a conta de controle `w7b-prod` está com o teste grátis vencido; P5: o roteiro de produção não tem a conta master (os 2 passaram no local e no staging) |
| 10/10 07:27 | hml-17 | `3c9183a` | `e2e/hml17/api.py --schema public` | produção | 12/13 | R3: o papel só leitura do SQL não executa a montadora interna `plano_alimentar_json` (grant só para `authenticated`, por desenho); passou no staging |
| 10/10 07:26 | hml-17 | `0112792` | `e2e/hml17/telas.py --base staging --canal msedge --casos P1` | staging | 9/9 |  |
| 10/10 07:25 | hml-17 | `0112792` | `e2e/hml17/telas.py --base staging --canal msedge --casos P1` | staging | 8/9 | o mesmo P1 'fresco', antes da folga |
| 10/10 07:24 | hml-17 | `0112792` | `e2e/hml17/telas.py --base staging --canal msedge --casos P1` | staging | 9/9 |  |
| 10/10 07:23 | hml-17 | `0112792` | `e2e/hml17/telas.py --base staging --canal msedge` | staging | 48/49 | o P1 'fresco' (aberto a frio com a API caindo) 6,0–6,4 s × limite 6 s: carga do app pelo CDN → folga de 2 s só no 'fresco' fora do local (`3c9183a`) |
| 10/10 07:17 | hml-17 | `0112792` | `e2e/hml17/api.py --schema staging` | staging | 32/32 | os 3 perfis com 1.894 kcal; quem não vê recebe `[]`/`null`; sem login 401 |
| 10/10 07:03 | hml-17 | `8fcc07b` | `e2e/hml17/telas.py --base local --canal msedge --casos P4,P5,N1,N2,N3` | local | 21/21 |  |
| 10/10 07:00 | hml-17 | `8fcc07b` | `e2e/hml17/telas.py --base local --canal msedge --casos T1,P1,P2,P3` | local | 33/33 |  |
| 10/10 06:52 | hml-17 | `01969da` | `e2e/hml17/telas.py --base local --canal msedge --casos P4,P5,N1,N2,N3` | local | 21/21 |  |
| 10/10 06:48 | hml-17 | `01969da` | `e2e/hml17/telas.py --base local --canal msedge --casos T1,P1,P2,P3` | local | 33/33 |  |
| 10/10 06:46 | hml-17 | `01969da` | `e2e/hml17/telas.py --base local --canal msedge --casos N2` | local | 6/6 |  |
| 10/10 06:44 | hml-17 | `01969da` | `e2e/hml17/telas.py --base local --canal msedge --casos N1,N2,N3` | local | 12/13 | N2 refeito em seguida (6/6) |
| 10/10 06:41 | hml-17 | `01969da` | `e2e/hml17/telas.py --base local --canal msedge --casos P4,P5` | local | 12/12 |  |
| 10/10 06:40 | hml-17 | `01969da` | `e2e/hml17/telas.py --base local --canal msedge --casos P1,P2,P3` | local | 14/14 |  |
| 10/10 06:38 | hml-17 | `01969da` | `e2e/hml17/telas.py --base local --canal msedge --casos T1` | local | 20/20 |  |
| 10/10 05:56 | hml-17 | `9313a50` | `e2e/hml17/api.py --schema staging` | staging | 32/32 | os 3 perfis com 1.894 kcal; quem não vê recebe `[]`/`null`; sem login 401 |
| 10/10 04:45 | hml-16c | `3be482b` | `e2e/w07/smoke_prod.py telas --versao 3.90 --canal msedge` | produção | 13/13 | F7 (sem o legado) |
| 10/10 04:44 | hml-16c | `3be482b` | `e2e/w07b/api.py removido` | staging | 7/7 | F7 (sem o legado) |
| 10/10 04:41 | hml-16c | `3be482b` | `e2e/w03/pos_login_api.py --schema staging` | staging | 30/31 | F7 (sem o legado); = base |
| 10/10 04:40 | hml-16c | `3be482b` | `e2e/w16/api.py` | staging | 40/41 | F7 (sem o legado); = base |
| 10/10 04:39 | hml-16c | `3be482b` | `e2e/w02/trocar_token.py` | staging | 24/25 | F7 (sem o legado); = base |
| 10/10 04:22 | hml-16c | `4adacdf` | `e2e/w03/pos_login_api.py --schema staging` | staging | 30/31 | F7 (sem o legado); = base |
| 10/10 03:38 | hml-16c | `4316ae0` | `e2e/w07b/api.py removido` | staging | 7/7 | F6 (o legado fora do ar 03:30) |
| 10/10 03:36 | hml-16c | `4316ae0` | `e2e/w03/pos_login_api.py --schema staging` | staging | 30/31 | F6 (o legado fora do ar 03:30); = base |
| 10/10 03:36 | hml-16c | `4316ae0` | `e2e/w16/api.py` | staging | 40/41 | F6 (o legado fora do ar 03:30); = base |
| 10/10 03:34 | hml-16c | `4316ae0` | `e2e/w02/trocar_token.py` | staging | 24/25 | F6 (o legado fora do ar 03:30); = base |
| 10/10 03:16 | hml-16c | `4316ae0` | `e2e/w07/smoke_prod.py telas --versao 3.90 --canal msedge` | produção | 13/13 | F5 (8 segredos novos) |
| 10/10 03:15 | hml-16c | `4316ae0` | `e2e/w16/api.py` | staging | 40/41 | F5 (8 segredos novos); = base |
| 10/10 03:13 | hml-16c | `4316ae0` | `e2e/w02/trocar_token.py` | staging | 24/25 | F5 (8 segredos novos); = base |
| 10/10 03:11 | hml-16c | `4316ae0` | `e2e/w03/pos_login_api.py --schema staging` | staging | 30/31 | F5 (8 segredos novos); = base |
| 10/10 03:09 | hml-16c | `4316ae0` | `e2e/w07b/api.py removido` | staging | 7/7 | F5 (8 segredos novos) |
| 10/10 03:03 | hml-16c | `4316ae0` | `e2e/w02/trocar_token.py` | staging | 24/25 | F5 (8 segredos novos); = base |
| 10/10 02:57 | hml-16c | `4316ae0` | `e2e/w03/pos_login_api.py --schema staging` | staging | 30/31 | F5 (8 segredos novos); = base |
| 10/10 02:56 | hml-16c | `4316ae0` | `e2e/w16/api.py` | staging | 40/41 | F5 (8 segredos novos); = base |
| 10/10 02:43 | hml-16c | `4316ae0` | `e2e/w02/trocar_token.py` | staging | 24/25 | F5 (8 segredos novos); = base |
| 10/10 02:21 | hml-16c | `c78e3bf` | `e2e/w04/espelho_fila.py --schema staging --dry-run` | staging | ok | F2: depois de publicar as 21 e da migração da fila nos 2 schemas (o cron chamou a `espelho-enviar` pelo pg_net: 200) |
| 10/10 02:21 | hml-16c | `c78e3bf` | `e2e/hml10/aviso.py --schema staging --so segredo,treino` | staging | 4/4 | F2 (C8 pelo legado; log `segredo_aceito` `aviso_erro` `legado`) |
| 10/10 02:20 | hml-16c | `c78e3bf` | `e2e/w13/repasse.py` | staging | caiu | F2 = base: sem a massa da w13 |
| 10/10 02:19 | hml-16c | `c78e3bf` | `e2e/w07b/api.py removido` | staging | 7/7 | F2 (C6 pelo legado) |
| 10/10 02:19 | hml-16c | `c78e3bf` | `e2e/w07/api.py api` | staging | caiu | F2 = base: 12 ✅ e cai na `excluir1` |
| 10/10 02:18 | hml-16c | `c78e3bf` | `e2e/w03/pos_login_api.py --schema staging` | staging | 30/31 | F2: volta a rodar com o login pelo `cab_login`; a 1 = expectativa da W3 ("papel admin do master no Treino") anterior à hml-02 (H-04: no staging o papel vem só do resumo) → atualizar na fase 6; a ponte do Calc (C2) OK |
| 10/10 02:17 | hml-16c | `c78e3bf` | `e2e/w16/api.py` | staging | 40/41 | F2; = base |
| 10/10 02:17 | hml-16c | `c78e3bf` | `e2e/w02/trocar_token.py` | staging | 24/25 | F2; = base (C1, C4 e C9 pelo legado) |
| 10/10 01:54 | hml-16c | `72304d7` | `e2e/w07/smoke_prod.py telas --versao 3.88 --canal msedge` | produção | 13/13 | F0 base |
| 10/10 01:50 | hml-16d | `506fd77` | `e2e/hml14/telas.py --base prod --canal msedge --casos X1 --prefixo prod_16d_c` | produção | 20/22 | reteste com vaga no limite: o Histórico do mês 390 px ✅ (pedido 200); a Biblioteca 390 px ❌ (H-40, já era); os Modelos no desktop ❌ = a leitura pegou o esqueleto (o pedido voltou com 14, 200) — tempo do teste |
| 10/10 01:20 | hml-16c | `72304d7` | `e2e/w04/espelho_fila.py --schema staging --dry-run` | staging | ok | F0 base: 3 pendentes (1 pessoa de teste), sem mudança |
| 10/10 01:19 | hml-16c | `72304d7` | `e2e/hml10/aviso.py --schema staging --so segredo,treino` | staging | 4/4 | F0 base (C8 pelo legado) |
| 10/10 01:18 | hml-16c | `72304d7` | `e2e/w13/repasse.py` | staging | caiu | F0 base: sem a massa da w13 (convite vazio) |
| 10/10 01:18 | hml-16c | `72304d7` | `e2e/w07b/api.py removido` | staging | 7/7 | F0 base (C6) |
| 10/10 01:17 | hml-16c | `72304d7` | `e2e/w07/api.py api` | staging | caiu | F0 base: 12 ✅ e cai na `excluir1` (excluída na hml-09) |
| 10/10 01:17 | hml-16c | `72304d7` | `e2e/w03/pos_login_api.py --schema staging` | staging | caiu | F0 base: o 1º login REST do principal pede captcha desde a hml-05a (`captcha_failed`) |
| 10/10 01:16 | hml-16c | `72304d7` | `e2e/w16/api.py` | staging | 40/41 | F0 base; = antes |
| 10/10 01:15 | hml-16c | `72304d7` | `e2e/w02/trocar_token.py` | staging | 24/25 | F0 base; = antes (a 1 = dado da conta de teste) |
| 10/10 00:52 | hml-16d | `506fd77` | `e2e/hml14/telas.py --base prod --canal msedge --prefixo prod_16d_b` (2ª rodada) | produção | interrompida 01:03 | a conta master já tinha gastado as 20 trocas de token/hora na 1ª rodada (limite por pessoa da `trocar-token`): "Sem conexão com o Treino — Muitas tentativas" |
| 10/10 00:43 | hml-16d | `506fd77` | `e2e/hml14/telas.py --base prod --canal msedge --prefixo prod_16d` | produção | 97/99 | a Biblioteca do master a 390 px (já era) + o Histórico do mês a 390 px: a 21ª troca de token da master na hora (limite de 20/h), não defeito |
| 10/10 00:43 | hml-16d | `506fd77` | `e2e/w26/prod.py --canal msedge` | produção | 21/21 | v3.88 no ar |
| 10/10 00:42 | hml-16d | `506fd77` | `e2e/w07/smoke_prod.py telas --versao 3.88 --canal msedge` | produção | 13/13 | v3.88 no ar |
| 10/10 00:06–00:39 | hml-16d | `ef5325f` | `e2e/hml14/telas.py --base staging --canal msedge --massa --prefixo staging_16d` | staging | 758/770 | as 12 = 390 px do H-40 (= referência 757/769 da hml-14d); paginação, `?pagina=`, Voltar e a busca OK com o React Router 7 |
| 10/10 00:06 | hml-16d | `ef5325f` | `e2e/w26/telas.py --base staging --prefixo staging_16d --casos publicas` | staging | 9/9 | |
| 10/10 00:02–00:06 | hml-16d | `ef5325f` | `e2e/h2/telas.py --base staging --prefixo staging_16d --schema staging` | staging | 49/50 | a conta "só Treino" para nos Termos novos do staging (hml-12) → atualizar a massa na fase 6 |
| 09/10 23:52–00:02 | hml-16d | `ef5325f` | `e2e/w03/telas.py --base staging --prefixo staging_16d --schema staging` | staging | 15/28 | TESTE DESATUALIZADO: login pela API pede captcha desde a hml-05a + o aceite novo do staging (hml-12); sem erro de página → atualizar na fase 6 |
| 09/10 23:52 | hml-16d | `ef5325f` | `e2e/w25/api.py` | staging | 23/30 | = rodadas anteriores (a massa do dia) |
| 09/10 23:51 | hml-16d | `ef5325f` | `e2e/w10/api.py --schema staging` | staging | 22/22 | |
| 09/10 18:36 | hml-16 | `03906a2` | `e2e/h3/emails.py` | staging | 55/57 | H-36 (R2): e-mails reais das 4 funções com a chave só de envio; as 2 = `convite-aluno` 409 `limite_plano` (massa: o plano de teste em 10/10) |
| 09/10 18:28 | hml-16 | `03906a2` | `e2e/w26/prod.py --canal msedge` | produção | 21/21 | F7: depois da revogação do HS256 do principal |
| 09/10 18:28 | hml-16 | `03906a2` | `e2e/w07/smoke_prod.py telas --versao 3.86 --canal msedge` | produção | 13/13 | F7 |
| 09/10 18:27 | hml-16 | `03906a2` | `e2e/w02/proxy_principal.py` | staging | 10/12 | F7; = base (as 2 antigas) |
| 09/10 18:27 | hml-16 | `03906a2` | `e2e/w16/api.py` | staging | 40/41 | F7; = base |
| 09/10 18:26 | hml-16 | `03906a2` | `e2e/w02/trocar_token.py` | staging | 24/25 | F7; = base |
| 09/10 18:21 | hml-16 | `03906a2` | `e2e/w07/smoke_prod.py telas --versao 3.86 --canal msedge` | produção | 13/13 | F6: depois de desligar as legadas do principal |
| 09/10 18:20 | hml-16 | `03906a2` | `e2e/hml05c/limite_ip.py --schema staging --so ip,normal` | staging | 23/23 | F6; = base |
| 09/10 18:20 | hml-16 | `03906a2` | `e2e/w02/proxy_principal.py` | staging | 10/12 | F6; = base |
| 09/10 18:20 | hml-16 | `03906a2` | `e2e/w16/api.py` | staging | 40/41 | F6; = base |
| 09/10 18:19 | hml-16 | `03906a2` | `e2e/w02/trocar_token.py` | staging | 24/25 | F6; = base |
| 09/10 18:10 | hml-16 | `03906a2` | `e2e/w07/smoke_prod.py telas --versao 3.86 --canal msedge` | produção | 13/13 | F5: produção no ar com o PR #170 (`c9b9d31`) |
| 09/10 18:01 | hml-16 | `f6eb484` | `e2e/w08b/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging_16 --casos espera --canal msedge` | staging | 14/14 | F5: o site do staging já com a publishable do principal (build `f6eb484`). O `--canal` é deste PR |
| 09/10 17:58 | hml-16 | `f6eb484` | `e2e/w08b/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging_16 --casos espera` | staging | 5/6 | as 4 tentativas erradas e a espera ✅; a 6ª = o Chromium embutido caiu ("Target crashed") → a rodada de cima, com o Edge |
| 09/10 ~17:57 | hml-16 | `f6eb484` | `e2e/hml12/telas.py --base staging --prefixo staging_16 --canal msedge --casos T13,T8` | staging | 12/12 | F5: o site do staging com a publishable do principal |
| 09/10 17:53 | hml-16 | `a987783` | `e2e/w07/smoke_prod.py telas --versao 3.85 --canal msedge` | produção | 13/13 | F4 (depois da espera de 15 min da troca do `PRINCIPAL_ANON_KEY` do Treino). O `--canal` é deste PR: sem ele, 2 rodadas caíram no print da Conta (o Chromium embutido do Playwright dá SIGSEGV no print da página inteira mais alta que a tela; sem placar) |
| 09/10 17:47 | hml-16 | `a987783` | `e2e/w16/api.py` | staging | 40/41 | F4; = base (a prescrição da tela 8: 0 linhas com reps) |
| 09/10 17:47 | hml-16 | `a987783` | `e2e/w02/trocar_token.py` | staging | 24/25 | F4, 16 min depois da troca; = base (a 1 = dado da conta de teste) |
| 09/10 17:31 | hml-16 | `a987783` | `e2e/w02/trocar_token.py` | staging | 24/25 | F4, logo depois da troca |
| 09/10 17:29 | hml-16 | `a987783` | `e2e/w07/smoke_prod.py telas --versao 3.85` | produção | 13/13 | F3 (Worker do principal com a troca no ar); a base 11/13 era só o '3.6' fixo do teste |
| 09/10 17:28 | hml-16 | `a987783` | `e2e/hml05c/limite_ip.py --schema staging --so ip,normal` | staging | 23/23 | F3; = base (a assinatura do IP intacta) |
| 09/10 17:28 | hml-16 | `a987783` | `e2e/w02/proxy_principal.py` | produção | 10/12 | F3; = base (as 2 falhas são antigas: captcha da hml-05a e `localhost` fora da lista desde a hml-04) |
| 09/10 16:55 | hml-16 | `f7c6194` | `e2e/w07/smoke_prod.py telas` | produção | 11/13 | F0 base: o teste procura a versão '3.6' no rodapé (o site está na 3.85) |
| 09/10 16:54 | hml-16 | `f7c6194` | `e2e/hml05c/limite_ip.py --schema staging --so ip,normal` | staging | 23/23 | F0 base |
| 09/10 16:54 | hml-16 | `f7c6194` | `e2e/w16/api.py` | staging | 40/41 | F0 base |
| 09/10 16:53 | hml-16 | `f7c6194` | `e2e/w02/trocar_token.py` | staging | 24/25 | F0 base |
| 09/10 16:52 | hml-16 | `f7c6194` | `e2e/w02/proxy_principal.py` | produção | 10/12 | F0 base |
| 09/10 16:15 | hml-15b | `3753bd2` | `e2e/hml15b/convite.py --base prod --prefixo prod --canal msedge` | produção | 12/12 | SÓ LEITURA, DEPOIS do merge (#169): C1, C2 e C3 ✅ — o widget do Turnstile monta nos 3 (antes da correção, 10/12) |
| 09/10 16:13 | hml-15b | `596eda5` | `e2e/hml12/telas.py --base staging --prefixo staging_15b --canal msedge --casos T13,T8` | staging | 12/12 | rotina do fim da worktree: o rodapé da entrada e a linha da idade no `/c/`; o captcha do staging voltou ao valor de antes |
| 09/10 16:12 | hml-15b | `596eda5` | `e2e/w08b/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging_15b --casos espera` | staging | 14/14 | rotina do fim da worktree: a escada de espera do login até o bloqueio |
| 09/10 16:10 | hml-15b | `596eda5` | `e2e/w25/api.py` | staging | 23/30 | = a rodada de 08/10: a massa do dia não monta (o Carlos tem login no principal); só API |
| 09/10 16:09 | hml-15b | `596eda5` | `e2e/w10/api.py` | staging | 22/22 | rotina do fim da worktree |
| 09/10 16:09 | hml-15b | `596eda5` | `e2e/hml05a/entrada.py --schema staging` | staging | 14/14 | rotina do fim da worktree |
| 09/10 16:08 | hml-15b | `596eda5` | `e2e/hml15b/convite.py --base staging --prefixo staging --canal msedge --fonte http://localhost:5174` | staging | 24/24 | C1–C3 o widget monta; C4 token REAL → "Cadastro enviado" + 1 pendente, apagado; C5 token inventado → a frase do captcha, nada criado |
| 09/10 16:00 | hml-15b | `d698f24` | `e2e/hml15b/convite.py --base prod --prefixo prod_antes --canal msedge` | produção | 10/12 | SÓ LEITURA, ANTES da correção: C1 (script antes do formulário) e C3 (/entrar/email → /c/) ❌ = o widget do Turnstile não monta (H-78 reproduzido); C2 ✅ |
| 09/10 15:59 | hml-15b | `d698f24`+ | `e2e/hml15b/convite.py --base local --prefixo local --canal msedge --fonte http://localhost:5174` | local | 24/24 | build com a correção (CSP valendo); C4 com token REAL (`e2e/w08b/fonte_turnstile.py --acao cadastro`) → cadastro pendente no staging, apagado; as 2 rodadas de 23/24 antes = o C1 sem a ordem (ver o commit) |
| 09/10 15:16 | hml-15 | `d698f24` | `e2e/hml15/csp.py --base prod --canal msedge --modo valendo` | produção | 128/128 | SÓ LEITURA; CSP VALENDO: 0 violação inesperada; `headers.py` 6/6 |
| 09/10 14:53 | hml-15 | `e9ab5dc` | `e2e/hml15/csp.py --base staging --canal msedge --modo valendo` | staging | 140/140 | 0 violação inesperada; aviso do `/c/` = H-78 |
| 09/10 14:33 | hml-15 | `7780b62` | `e2e/hml15/csp.py --base prod --canal msedge --modo relatorio` | produção | 128/128 | SÓ LEITURA; CSP relatando: 0 violação (inclui o app do aluno a 390 px com o Treino) |
| 09/10 14:17 | hml-15 | `9757a5a` | `e2e/hml15/dominio.py` | produção | 27/28 | a ❌ = o teste do CAA exigia o texto exato (a Cloudflare põe `pki.goog; cansignhttpexchanges=yes`): corrigido no passo 2 → `--so caa` 2/2 |
| 09/10 14:09 | hml-15 | `e237012` | `e2e/hml15/csp.py --base staging --canal msedge --modo relatorio` | staging | 140/140 | 0 violação inesperada; aviso: o Turnstile do `/c/` não monta quando o script carrega antes do formulário (H-78) |
| 09/10 11:26 | hml-15 | `596c2a6` | `e2e/hml05c/limite_ip.py --schema staging --so ip,normal` | staging | 23/23 | regressão depois da Cloudflare (TLS 1.2, Always HTTPS, HSTS, SSL strict) |
| 09/10 11:26 | hml-15 | `596c2a6` | `e2e/hml05a/entrada.py --schema public --so treino` | produção | 6/6 | regressão depois da Cloudflare (só leitura) |
| 09/10 11:25 | hml-15 | `596c2a6` | `e2e/hml05a/entrada.py --schema staging --so treino` | staging | 6/6 | regressão depois da Cloudflare |
| 09/10 11:25 | hml-15 | `596c2a6` | `e2e/w02/proxy_principal.py` | produção | 10/12 | as 2 ❌ já existiam: login por senha → 400 `captcha_failed` também direto no banco (captcha da hml-05a) e o redirect `localhost` fora da lista (hml-04) |
| 09/10 13:45 | hml-15 | `fadbef4` | `e2e/hml15/csp.py --base local --canal msedge --modo relatorio` | local | 142/142 | Report-Only: 14 violações, todas esperadas (as sondas) |
| 09/10 13:28 | hml-15 | `fadbef4` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo --com-sw` | local | 151/151 | SW ligado em todo contexto: a 2ª abertura do / e do /treino sem rede vem do precache; 0 violação vinda do sw.js |
| 09/10 13:09 | hml-15 | `fadbef4` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo --so plano --emular-host physiqcalc.com.br` | local | 10/10 | host emulado `physiqcalc.com.br` com a CSP valendo: o antifraude do MP (variante .br) roda com o nonce, `MP_DEVICE_SESSION_ID` definido, 0 violação |
| 09/10 13:08 | hml-15 | `fadbef4` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo --com-tela --so impressos` | local | 9/9 | D4 com janela (Edge): o PDF dos Impressos abre na aba blob: com `object-src 'none'`, que fica |
| 09/10 13:07 | hml-15 | `fadbef4` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo` | local | 142/142 | CSP valendo: 9 violações, todas esperadas (as sondas barradas); Turnstile, brick do MP, anexo em iframe, 3D, master e app do aluno funcionando |
| 09/10 12:45 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo --so plano --emular-host physiqcalc.com.br --prefixo ensaio` | local | 10/10 | iteração (sem commit), host emulado `physiqcalc.com.br` com a CSP valendo |
| 09/10 12:44 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo --com-sw --so offline --prefixo ensaio` | local | 14/14 | iteração (sem commit) do grupo offline (SW ligado) |
| 09/10 12:42 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo --com-tela --so impressos --prefixo ensaio` | local | 9/9 | iteração (sem commit), D4 com janela |
| 09/10 12:41 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo valendo --prefixo ensaio` | local | 142/142 | iteração (sem commit) com a CSP valendo: 0 violação inesperada |
| 09/10 12:13 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo relatorio --so clinico,treino,master,aluno --prefixo ensaio` | local | 55/55 | iteração (sem commit): 0 violação (anexo em iframe, 3D, master com o papel devolvido) |
| 09/10 12:04 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo relatorio --so plano --emular-host physiqcalc-staging.vercel.app --prefixo ensaio` | local | 10/10 | iteração (sem commit), host emulado do staging: os mesmos hosts do localhost, 0 violação |
| 09/10 12:02 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo relatorio --so plano --emular-host physiqcalc.com.br --prefixo ensaio` | local | 7/10 | iteração (sem commit), host emulado `physiqcalc.com.br`: no domínio .br o antifraude manda o pixel para `www.mercadopago.com.br` (img-src), liberado |
| 09/10 11:58 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo relatorio --so painel,impressos,plano,sondas --prefixo ensaio` | local | 50/54 | iteração (sem commit): o antifraude do MP rodou com o nonce e pediu `www.mercadolibre.com` (connect-src e img-src) e `www.mercadolivre.com` (img-src), liberados; a sonda do `<embed>` de PDF também dá `frame-src blob:` (entrou nas esperadas) |
| 09/10 11:52 | hml-15 | `596c2a6` | `e2e/hml15/csp.py --base local --canal msedge --modo relatorio --so cabecalhos,publicas --prefixo ensaio` | local | 39/41 | iteração (mudanças sem commit): as 2 ❌ = `bluetooth=()` desconhecido no Permissions-Policy do Edge (saiu) e o /c/ sem o widget do Turnstile (corrida do app, fora da CSP: o teste passou a conferir que o script rodou) |
| 09/10 10:19 | hml-14d | `a915c65` | `e2e/hml14/telas.py --base prod --canal msedge` | produção | 98/99 | SÓ LEITURA (rodou da branch `18a5477`, a mesma árvore do squash); a ❌ = a Biblioteca do master a 390 px (469 px, a mesma linha do front antigo: H-40) |
| 09/10 10:08 | hml-14d | `18a5477` | `e2e/hml14/telas.py --base staging --canal msedge` | staging | 757/769 | as 12 ❌ = larguras de 390 px que o front antigo já tinha (H-40) |
| 09/10 09:30 | hml-14d | `3e80932` | `e2e/hml14/telas.py --base local --canal msedge --casos P1 --prefixo local_m4` | local | 55/58 | as 3 ❌ = o Financeiro do aluno a 390 px (427 px, igual ao front antigo: H-40) |
| 09/10 09:25 | hml-14d | `3e80932` | `e2e/hml14/telas.py --base local --canal msedge --casos P1 --prefixo local_m3` | local | 49/50 | a 390 px o clique do teste errava o alvo (corrigido no `18a5477`) |
| 09/10 09:21 | hml-14d | `3e80932` | `e2e/hml14/telas.py --base local --canal msedge --casos P1,P2,P3,P7,P8 --prefixo local_m2` | local | 111/113 | o clique a 390 px (acima) + Exames a 390 px (H-40) |
| 09/10 09:16 | hml-14d | `3e80932` | `e2e/hml14/telas.py --base local --canal msedge --casos M5,M7 --prefixo local_m1` | local | 38/38 | testes do master esperando a resposta do termo |
| 09/10 09:12 | hml-14d | `29603b3` | `e2e/hml14/telas.py --base local --canal msedge --casos T3,T6,T4 --prefixo local_t` | local | 57/58 | a ❌ = o Histórico do mês a 390 px (H-40); testes do Treino corrigidos no `3e80932` |
| 09/10 09:01 | hml-14d | `29603b3` | `e2e/hml14/telas.py --base local --canal msedge` | local | 683/707 | as 24 falhas eram dos TESTES (esperas e massa) → `3e80932` e `18a5477`; sobram as larguras de 390 px |
| 09/10 08:26 | hml-14d | `e19fbac` | `e2e/w15/api.py` | staging | 46/53 | = antes, depois de zerar a sobra do w23 da rodada 'antes' |
| 09/10 08:22 | hml-14d | `e19fbac` | `e2e/w27/api.py` | staging | 79/81 | = antes (o master do staging não grava no Treino — hml-02) |
| 09/10 08:17 | hml-14d | `e19fbac` | `e2e/w23/api.py` | staging | 22/22 | regressão depois das 8 funções |
| 09/10 08:15 | hml-14d | `e19fbac` | `e2e/w17/avaliacao_api.py` | staging | 34/34 | regressão depois |
| 09/10 08:14 | hml-14d | `e19fbac` | `e2e/w16/api.py` | staging | 40/41 | = antes |
| 09/10 08:13 | hml-14d | `e19fbac` | `e2e/w15/api.py` | staging | 45/53 | 1 cópia personalizada que o w23 da rodada 'antes' deixou (o w15 só limpa no fim) |
| 09/10 06:04 | hml-14d | `33cfae9` | `e2e/w27/api.py` | staging | 79/81 | regressão antes (worktree destacada da `main`) |
| 09/10 05:58 | hml-14d | `33cfae9` | `e2e/w23/api.py` | staging | 22/22 | regressão antes |
| 09/10 05:57 | hml-14d | `33cfae9` | `e2e/w17/avaliacao_api.py` | staging | 34/34 | regressão antes |
| 09/10 05:56 | hml-14d | `33cfae9` | `e2e/w16/api.py` | staging | 40/41 | regressão antes |
| 09/10 05:56 | hml-14d | `33cfae9` | `e2e/w15/api.py` | staging | 46/53 | regressão antes |
| 09/10 05:05 | hml-14c | `0e3ea2c` | `e2e/w26/prod.py --canal msedge` | produção | 21/21 | SÓ LEITURA (H-68) |
| 09/10 04:52 | hml-14c | `003df92` | `e2e/w15/api.py` | staging | 45/53 | teste do H-51 item 5 atualizado (`34663cd`) |
| 09/10 04:49 | hml-14c | `003df92` | `e2e/w23/api.py` | staging | 22/22 | regressão depois das 18 funções |
| 09/10 04:47 | hml-14c | `003df92` | `e2e/w17/avaliacao_api.py` | staging | 34/34 | regressão depois |
| 09/10 04:47 | hml-14c | `003df92` | `e2e/w16/api.py` | staging | 40/41 | = antes |
| 09/10 04:46 | hml-14c | `003df92` | `e2e/w15/api.py` | staging | 43/52 | = antes |
| 09/10 04:42 | hml-14c | `003df92` | `e2e/w10/api.py --schema staging` | staging | 22/22 | regressão depois |
| 09/10 04:41 | hml-14c | `003df92` | `e2e/w02/trocar_token.py` | staging | 24/25 | login do Treino = antes; rodou 2× (04:40 e 04:41) |
| 09/10 04:11 | hml-14c | `064d3b8` | `e2e/w23/api.py` | staging | 22/22 | regressão antes |
| 09/10 04:09 | hml-14c | `064d3b8` | `e2e/w17/avaliacao_api.py` | staging | 34/34 | regressão antes |
| 09/10 04:08 | hml-14c | `064d3b8` | `e2e/w16/api.py` | staging | 40/41 | regressão antes |
| 09/10 04:08 | hml-14c | `064d3b8` | `e2e/w15/api.py` | staging | 43/52 | regressão antes |
| 09/10 04:04 | hml-14c | `064d3b8` | `e2e/w10/api.py --schema staging` | staging | 22/22 | regressão antes |
| 09/10 03:12 | hml-14b | `d9fd873` | `e2e/hml14/telas.py --base prod --canal msedge` | produção | 82/82 | SÓ LEITURA; a guarda barrou 18 POST em `modelos_recibo` (nada gravou) |
| 09/10 03:00 | hml-14b | `fac94b7` | `e2e/hml14/telas.py --base staging --canal msedge` | staging | 322/324 | as 2 ❌ a 390 px (Diário e Agenda, H-40) |
| 09/10 02:44 | hml-14b | `fd4baef` | `e2e/hml14/telas.py --base local --canal msedge` | local | 322/326 | as 2 de 390 px + 2 de cache (L5) |
| 08/10 23:50 | hml-14 | `4871ad6` | `e2e/w10/api.py --schema staging` | staging | 22/22 | |
| 08/10 23:50 | hml-14 | `4871ad6` | `e2e/w20c/api.py --schema staging` | staging | 35/35 | |
| 08/10 23:49 | hml-14 | `4871ad6` | `e2e/w07b/api.py tudo` | staging | 52/54 | só massa (fase 6) |
| 08/10 23:46 | hml-14 | `4871ad6` | `e2e/w06/api.py --casos pix,porfora,acesso,nutri,mp,antigo` | staging | 54/55 | só massa (fase 6) |
| 08/10 23:44 | hml-14 | `4871ad6` | `e2e/w04/cobranca_api.py` | staging | 50/50 | |
| 08/10 23:43 | hml-14 | `178f5d6` | `e2e/w26/prod.py --canal msedge` | produção | 21/21 | SÓ LEITURA (H-68); antes do merge da 14a (23:51), com as funções novas já publicadas |
| 08/10 21:06 | hml-13 | `93c6c1b` | `e2e/w25/api.py` | staging | 23/30 | as 7 = massa de outro dia ("hoje", "há N dias"); rodar o `massa.py` antes |
| 08/10 21:05 | hml-13 | `93c6c1b` | `e2e/w10/api.py` | staging | 22/22 | |
| 08/10 21:04 | hml-13 | `93c6c1b` | `e2e/w07/api.py api` | staging | caiu | a conta `excluir1` não existe (excluída na hml-09) |
| 08/10 21:03 | hml-13 | `d3d6f6e` | `e2e/w26/prod.py --canal msedge` | produção | 21/21 | SÓ LEITURA (H-68): 0 escrita tentada, contagens iguais |
| 08/10 20:50 | hml-13 | `c0105a1` | check `checar-pr` (PR #160, escape do `[skip ci]`) | GitHub | pass | `workflow_dispatch` não destrava; commit novo sem marcador destrava |
| 08/10 20:36 | hml-13 | `86f2721` | check `checar-pr` (PR #159, negativo) | GitHub | fail em Tipos | merge recusado (`BLOCKED`) — o esperado |
| 08/10 20:33 | hml-13 | `93c6c1b` | check `checar-pr` (PR #158) | GitHub | pass | lint, tipos, definer 75/0, `node --test` 33/33, Vitest 279 arquivos |
| 08/10 ~19:10 | hml-12 | `c0fc1b0` | `e2e/hml12/telas.py --base prod --canal msedge` | produção | 10/10 | + guarda no JS real (19 marcas) |
| 08/10 ~19:08 | hml-12 | `c0fc1b0` | `e2e/hml12/banco.py --schema public` | produção | 10/10 | |
| 08/10 ~18:00 | hml-12 | `35d0048` | `e2e/hml12/telas.py --base staging --canal msedge` | staging | 113/113 | |
| 08/10 ~18:00 | hml-12 | `35d0048` | `e2e/w07b/api.py entrar` | staging | 12/12 | |
| 08/10 ~18:00 | hml-12 | `35d0048` | `e2e/w21/telas.py --casos nutri,inativo,dono,membro` | staging | 48/48 | |
| 08/10 17:11 | hml-12 | — | `e2e/hml12/banco.py --schema staging` | staging | 60/60 | |
| 08/10 ~17:30 | hml-12 | `35d0048` | `e2e/hml12/telas.py` (build de staging, `vite preview`) | local | 113/113 | build public 10/10 |
| 08/10 15:18 | hml-11 | `8dc0287` | `e2e/hml11/telas.py --base https://physiqcalc.com.br --modo producao --canal msedge --casos S1,S2,S4,S5` | produção | 16/16 | + `JS` (384 arquivos) |
| 08/10 ~15:20 | hml-11 | `8dc0287` | `e2e/w26/prod.py` | produção | caiu no meio | ESCREVE em produção (H-68); o `finally` limpou |
| 08/10 ~15:00 | hml-11 | `aa11d26` | `e2e/hml11/telas.py --base staging --canal msedge` | staging | 106/106 | |
| 08/10 ~15:00 | hml-11 | `aa11d26` | `e2e/w26/telas.py --casos publicas` | staging | 9/9 | |
| 08/10 ~14:30 | hml-11 | `aa11d26` | `e2e/hml11/telas.py` (`--canal msedge`) | local | 106/106 | build public `--casos S1,S2,S4,S5` 17/17 |
| 08/10 ~12:40 | hml-10 | `5ee7770` | `e2e/hml10/telas.py --base prod --p6` | produção | 23/23 | 1 aviso real |
| 08/10 ~12:00 | hml-10 | — | `e2e/hml10/telas.py --base staging` | staging | 61/61 | 1ª rodada caiu o navegador |
| 08/10 ~11:00 | hml-10 | — | `e2e/hml10/telas.py` | local | 81/81 | |
| 08/10 ~08:55 | hml-09 | `538897e` | `e2e/hml09/banco.py --producao` | produção | 21/21 | |
| 08/10 ~08:40 | hml-09 | — | `e2e/hml09/telas.py` | staging | 9/9 | local 9/9 |
| 08/10 ~08:30 | hml-09 | — | `e2e/hml09/guarda.py simular --esperado antes` | staging | 16/16 | |
| 08/10 08:29 | hml-09 | — | `e2e/hml09/banco.py` | staging | 20/20 | |
| 08/10 ~07:00 | hml-08 | — | `e2e/hml08/telas.py` | staging | 36/36 | local: site 12/12, app 24/24 |
| 08/10 ~04:30 | hml-06 | — | `e2e/w04/cobranca_api.py` | staging | 43/45 | 2 falhas = cartão do sandbox do MP fora |
| 08/10 ~02:10 | hml-05b | `2f820d8` | `e2e/hml05b/telas.py --prefixo staging` | staging | 21/21 | h5 telas `cadastro` 5/5; w16b telas `cadastro_link` 4/4; w16b `trava_sql` 31/32 |
| 08/10 ~01:10 | hml-05c | — | `e2e/w24/api.py` | staging | 47/47 | w24 telas `/d/` 13/13; w21 api 42/42 |
| 08/10 ~01:10 | hml-05c | — | `e2e/hml05c/limite_ip.py --so ip` | staging | 5/5 | `hml05a/entrada.py --so treino` 6/6 |
| 08/10 00:08 | hml-05a | — | `e2e/hml05a/entrada.py --so cadastro` | produção | 2/2 | antes 0/2 |
| 08/10 00:06 | hml-05a | — | `e2e/hml05a/entrada.py --so cadastro` | staging | 3/3 | |
| 07/10 ~21:50 | hml-02b | `99ca090` | `e2e/w24/api.py` | staging | 47/47 | w18 15/15; w10 22/22 |
| 07/10 ~20:00 | hml-01 | — | `e2e/hml01/banco.py --schema public` | produção | 12/12 | antes 3/12 |
| 07/10 ~19:40 | hml-01 | — | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | `hml01/equipe_staging.py` 6/6 |

Fonte das linhas de 07/10 e 08/10: o plano da homologação (§5, uma entrada por worktree); hora "~" = aproximada; "—" = commit não
anotado no plano.
