// Physiq hml-21c (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES do Aluno › Resumo pela função conta, COMO A PESSOA (c.comoPessoa — o
// token de quem chama; nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DO_ALUNO; cada uma chama a MESMA RPC de hoje
// (src/painel/aluno/{resumo/acesso,dados,envio}/api.ts e src/publico/legal/responsavel/api.ts no c6e795b), com os MESMOS argumentos — o
// RLS e as RPCs (definer, pelo auth.uid() lá dentro) decidem quem pode; a função confere a FORMA (o corpo em lista fechada):
//   acesso_ler                   aluno_acesso(p_aluno) — o card "Login do aluno" (aba Acessos desde a W-A P4) ao abrir: lê e confere quem
//                                pode (AÇÃO, não `ler` — decisão 13; a ação não repete)
//   acesso_criar                 paciente_criar_acesso(p_paciente_id, p_email, p_senha) → { resultado: o user_id novo } (a senha nasce
//                                provisória; o servidor NÃO confere o tamanho dela nem o e-mail antes — o senha_curta/email_invalido são da RPC)
//   acesso_redefinir_senha       paciente_redefinir_senha(p_paciente_id, p_senha) (o Master também, pela SheetSenhaAluno: a RPC decide pelo
//                                eh_master() — a função não confere papel)
//   aluno_ajustes_salvar         aluno_salvar_ajustes(p_aluno, p_ajustes) — SÓ { mensagens_automaticas } (as 3 da aba Acessos são recusa)
//   aluno_dados_salvar           aluno_salvar_dados(p_aluno, p_dados) — as 9 chaves que ela lê (a vazia/null limpa, como hoje)
//   aluno_link_novo              aluno_novo_link(p_aluno)
//   aluno_responsavel_registrar  aluno_responsavel_registrar(p_aluno, p_dados) — registrar ou retirar (a RPC confere cada valor)
//   aluno_avisar_plano           aluno_avisar_plano(p_aluno, p_modulos) — a reserva do "Salvar e enviar": só o sino (decisão 22)
// O valor das RPCs volta como veio, no `resultado` (a lib confere o { ok, erro } como hoje). O raise de propósito (a varredura da decisão B:
// ERROS_DO_ACESSO, ERROS_DO_CRIAR_ACESSO, ERROS_DO_REDEFINIR_SENHA, ERROS_DOS_DADOS_DO_ALUNO e a w14_matricula_da_rota) volta como o código,
// nunca 500 + log.excecao. A senha e o e-mail NUNCA vão ao log: na recusa, só o NOME do campo (o recusa do comum.ts); no erro do banco, o
// código (e o log.excecao do inesperado limpa a mensagem — _shared/erros.ts tira e-mail e o valor que o Postgres ecoa).
import { ERROS_DA_MATRICULA_DA_ROTA } from "../_shared/conta-leituras.ts";
import {
  ERROS_DO_ACESSO, ERROS_DO_CRIAR_ACESSO, ERROS_DO_REDEFINIR_SENHA, ERROS_DOS_DADOS_DO_ALUNO, lerCorpoDaAcao, type AcaoDoAluno,
} from "../_shared/conta-regras.ts";
import { recusa, rpcDaAcao, type ContextoConta, type Resposta } from "./comum.ts";

export async function atenderAluno(c: ContextoConta, acao: AcaoDoAluno): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "acesso_ler":
      return await rpcDaAcao(c, acao, "aluno_acesso", { p_aluno: v.aluno }, ERROS_DO_ACESSO);
    case "acesso_criar":
      return await rpcDaAcao(c, acao, "paciente_criar_acesso", { p_paciente_id: v.aluno, p_email: v.email, p_senha: v.senha }, ERROS_DO_CRIAR_ACESSO);
    case "acesso_redefinir_senha":
      return await rpcDaAcao(c, acao, "paciente_redefinir_senha", { p_paciente_id: v.aluno, p_senha: v.senha }, ERROS_DO_REDEFINIR_SENHA);
    case "aluno_ajustes_salvar":
      return await rpcDaAcao(c, acao, "aluno_salvar_ajustes", { p_aluno: v.aluno, p_ajustes: v.ajustes }, ERROS_DA_MATRICULA_DA_ROTA);
    case "aluno_dados_salvar":
      return await rpcDaAcao(c, acao, "aluno_salvar_dados", { p_aluno: v.aluno, p_dados: v.dados }, ERROS_DOS_DADOS_DO_ALUNO);
    case "aluno_link_novo":
      return await rpcDaAcao(c, acao, "aluno_novo_link", { p_aluno: v.aluno }, ERROS_DA_MATRICULA_DA_ROTA);
    case "aluno_responsavel_registrar":
      // a RPC pega o raise da w14_matricula_da_rota e devolve { ok: false, erro: "sem_acesso" } (valor): nenhum código de propósito
      return await rpcDaAcao(c, acao, "aluno_responsavel_registrar", { p_aluno: v.aluno, p_dados: v.dados });
    case "aluno_avisar_plano":
      return await rpcDaAcao(c, acao, "aluno_avisar_plano", { p_aluno: v.aluno, p_modulos: v.modulos }, ERROS_DA_MATRICULA_DA_ROTA);
  }
}
