// Physiq hml-21b (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES dos Alunos pela função conta, COMO A PESSOA (c.comoPessoa — o token
// de quem chama; nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DOS_ALUNOS:
//   pacote_definir   o pacote de consultas do aluno com um profissional (PacoteDialog): a RPC aluno_definir_pacote(p_aluno, p_profissional,
//                    p_total, p_mes_inicio) de hoje, que confere quem pode (o próprio profissional ou o dono da conta) e o total →
//                    { resultado } (o { ok, pacote } ou o { ok: false, erro } dela, como veio — a tela confere como hoje); o raise da
//                    w14_matricula_da_rota (sem_login, sem_acesso, aluno_inexistente) volta como o código (o que a tela recebia hoje)
// As outras ações dos Alunos (criar, convidar, bloquear, desativar, remover, atribuir, aprovar) seguem pela função `alunos` (verify_jwt
// false por causa do /c/ — decisão C da hml-21b); as leituras dos Alunos vão pelo `ler` (CONSULTAS_ALUNOS em _shared/conta-leituras.ts).
import { ERROS_DA_MATRICULA_DA_ROTA } from "../_shared/conta-leituras.ts";
import { lerCorpoDaAcao, type AcaoDosAlunos } from "../_shared/conta-regras.ts";
import { falha, recusa, type ContextoConta, type Resposta } from "./comum.ts";

export async function atenderAlunos(c: ContextoConta, acao: AcaoDosAlunos): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "pacote_definir": {
      const { data, error } = await c.comoPessoa.rpc("aluno_definir_pacote", {
        p_aluno: v.aluno, p_profissional: v.profissional, p_total: v.total, p_mes_inicio: v.mes_inicio ?? null,
      });
      // a recusa de hoje da w14_matricula_da_rota (sem_login, sem_acesso, aluno_inexistente) volta como o código — não como erro_interno
      if (error) return falha(c, acao, error, ERROS_DA_MATRICULA_DA_ROTA);
      return { ok: true, resultado: data ?? null };
    }
  }
}
