# Verificação em 2 etapas do master (Physiq)

Homologação, achado H-22 (hml-22, 14/10/2026). O master vê os dados de todas as contas, inclusive os de saúde. Com a verificação em
2 etapas ligada, entrar no painel master pede, além da senha ou do Google, um código de 6 números de um app autenticador no celular
(o TOTP do Supabase Auth). Decisão do dono, 14/10/2026: fica **desligada até ele cadastrar o código no celular**.

## Como funciona

- **Desligada** (nenhum fator cadastrado): tudo igual a antes da hml-22. Esse é o estado até o dono ativar.
- **Ligada** (um fator verificado na conta): o login com a senha ou o Google vale como "1ª etapa" (`aal1`). Antes de qualquer área
  logada do site (o app do aluno no site, o painel e o master), aparece a tela **"Digite o código do app autenticador"**. Os 6
  números certos deixam a sessão em `aal2` e o site abre.
- Sem o código, a conta é uma pessoa comum: o banco (`eh_master()` e `sou_master()`), as funções do master (`master-contas`,
  `master-financeiro`, `master-planos`: 403 `precisa_2fa`) e a `pagamentos-aluno` não dão o poder de master, e a `trocar-token` do
  Treino não dá a sessão do Treino a quem é master ou staff (403 `precisa_2fa`).
- Quem não é master não muda nada. O app (APK e AAB) não tem as telas do 2FA: a conta master já sai do app (hml-08).
- A regra mora no banco (migração `supabase-principal/migrations/20261014200000_hml22_master_2fa.sql`) e é repetida nas funções:
  "fator" = qualquer fator verificado da conta; com fator, só o token `aal2` é master.

## Ativar (o dono, no site)

1. Recarregar a página do site antes (a versão antiga guardada no navegador não tem a tela do código).
2. Master › Configurações › cartão **Verificação em 2 etapas** › **Ativar**.
3. No app autenticador (Google Authenticator, Microsoft Authenticator ou outro), ler o QR. Se não der, digitar o código em texto que
   aparece embaixo. Dica: ler o mesmo QR também num 2º aparelho seu, de reserva.
4. Digitar os 6 números que o app mostra. O cartão passa a **Ligada desde dd/mm/aaaa**.
5. Efeito: as outras sessões abertas desta conta (as que entraram só com a senha ou o Google) são encerradas na hora — é a regra do
   Supabase Auth. Os outros navegadores e aparelhos pedem o login de novo.

Conferir (só leitura, sem mostrar dado): a contagem de fatores verificados da conta master é 1.

## Entrar com a verificação ligada

1. Entrar como sempre (senha ou Google).
2. Na tela "Digite o código do app autenticador", digitar os 6 números do Physiq no app. Código errado: "Código errado. Confira o
   app e tente de novo." Muitas tentativas: o Supabase Auth segura por alguns minutos.
3. "Sair" nessa tela encerra só esta sessão.

O relógio do celular precisa estar certo (o código muda a cada 30 segundos).

## Perdeu ou trocou o celular (recuperação)

Desligar pela tela não existe (decisão da hml-22: tirar o fator é pelo suporte). O caminho:

1. Confirmar que quem pede é o próprio dono.
2. Com a chave de serviço do projeto principal (do cofre; nunca no repositório nem no chat), apagar o fator da conta:
   - pelo supabase-js: `auth.admin.mfa.listFactors({ userId })` e `auth.admin.mfa.deleteFactor({ userId, id })`;
   - ou pelo HTTP do Auth: `GET /auth/v1/admin/users/<id da conta>/factors` e `DELETE /auth/v1/admin/users/<id da conta>/factors/<id do fator>`
     (cabeçalhos `apikey` e `Authorization: Bearer` com a chave de serviço);
   - reserva, pela Management API (SQL): `delete from auth.mfa_factors where user_id = '<id da conta>';`
3. Conferir: `select count(*) from auth.mfa_factors where user_id = '<id da conta>'` → 0.
4. O dono entra (sem fator, o master volta a ser como antes) e ativa de novo no celular novo.

Sem o fator, a sessão que já estava aberta e guardada no navegador relê os fatores sozinha ao abrir a tela do código e segue.

## A volta de cada peça (do mais rápido ao mais lento)

1. **Apagar o fator do master** (o passo 2 acima): tudo volta ao comportamento de antes na hora, sem publicar nada.
2. **O banco**: a reversa `supabase-principal/reversas/20261014200000_hml22_master_2fa_reversa.sql`
   (`python3 scripts/apply_migration_principal.py <reversa> --so public`; e `--so staging`). Volta o `eh_master()` e o `sou_master()`
   de antes, letra por letra, e só depois apaga as 2 funções novas.
3. **As 5 funções** na versão anterior (`git show <commit anterior>:<pasta da função>` numa pasta temporária +
   `scripts/deploy_function.sh`, com o MESMO `verify_jwt` de hoje): no principal `master-contas`, `master-financeiro`,
   `master-planos` e `pagamentos-aluno` (`true`); no Treino a `trocar-token` (`false`).
4. **O site**: o deploy anterior na Vercel ou o revert do PR ([voltar-versao.md](voltar-versao.md)). O APK não precisa de volta.

## Onde no código

- Banco: a migração e a reversa acima (`master_aal_regra`, `master_aal_ok`, `eh_master`, `sou_master`).
- Funções: `supabase-principal/functions/_shared/{master-regras,master-porta}.ts`, `supabase-principal/functions/pagamentos-aluno/index.ts`;
  no Treino `supabase/functions/_shared/espelho/regras.ts` e `supabase/functions/trocar-token/index.ts`.
- Site: `src/nucleo/doisFatoresRegras.ts` (a regra pura), `src/nucleo/sessao.tsx` (`doisFatores`), `src/master/doisFatores/`
  (as chamadas, a tela do código e o cartão), `src/rotas/Rotas.tsx` e `src/master/MasterLayout.tsx` (as 2 barreiras).
- Guardas: `scripts/ci/sem-master.sh` (a marca "Verificação em 2 etapas" não pode estar no app) e a lista `LOGIN` de
  `src/integrations/semBancoNoNavegador.test.ts`.
- E2E: `e2e/hml22/dois_fatores.py` (o fator de verdade numa conta de TESTE do staging, com a limpeza garantida).
