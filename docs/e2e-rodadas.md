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
