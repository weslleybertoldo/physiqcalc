# Contas de teste (31/10/2026)

- **Conta de teste = SÓ `*teste*@physiqcalc.com.br`**: a parte antes do `@` contém "teste" e o domínio é exatamente
  `physiqcalc.com.br` (do dono). A mesma regra no app (`src/nucleo/contasTeste.ts`), nas funções (`_shared/login-regras.ts`,
  `master-regras.ts`, `convites-regras.ts` e o Treino `_shared/espelho/regras.ts`) e no banco (`{schema}.email_de_teste`).
- **As contas antigas dos E2E NÃO EXISTEM MAIS**: `*@physiqnutri.app`, `*@physiqcalc.app` e `teste@teste.com` saíram pelo
  "Excluir minha conta" em 31/10/2026 (os 2 domínios `.app` não são registrados e o `teste.com` é de outra pessoa: com o
  repositório público, quem registrasse um deles entraria nas contas pelo "esqueci a senha").
- **Os scripts antigos não foram reescritos.** O guarda deles (`eh_email_de_teste`, `email_de_teste`, `SUFIXO_TESTE`, `TESTE_SQL`…)
  já usa a regra nova e PARA logo, antes de criar qualquer conta. Para reaproveitar um, troque as contas dele por contas novas.
- **Ficaram, e não são para E2E:** `teste@physiqcalc.com.br` (a conta de teste do dono), `revisao.aluno@physiqcalc.com.br` e
  `revisao.profissional@physiqcalc.com.br` (as da revisão da Google Play; sem "teste": não são contas de teste) e
  `admin.calc@physiqcalc.com.br` (o antigo `admin.teste.claude@physiqcalc.app`: é dono de 1 aluno de verdade, então não saiu).
- **Teste novo:**
  1. crie contas temporárias `<frente>.<papel>.teste.claude@physiqcalc.com.br` (ex.: `w30.aluno.teste.claude@physiqcalc.com.br`)
     pela API admin do Auth, com `email_confirm: true` (não manda e-mail);
  2. a senha num arquivo `~/.physiq-teste-<nome>` (600), nunca no repositório nem na saída;
  3. no fim, apague cada uma pelo próprio "Excluir minha conta" (`excluir-minha-conta`: `{simular: true}` e depois
     `{confirmacao: "EXCLUIR"}`; profissional com `{fluxo: "profissional"}`).
- O domínio `physiqcalc.com.br` **não tem caixa de e-mail** (sem MX): as funções mandam todo e-mail para `@physiqcalc.com.br` à caixa
  de teste do Resend (`delivered@resend.dev`), conta de teste ou não (`_shared/convites-regras.ts › destinoDoEmail`).
