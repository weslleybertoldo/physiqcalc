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
