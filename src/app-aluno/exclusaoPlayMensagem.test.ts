import { describe, expect, it } from "vitest";
import { ErroPerfil, mensagemErroConta } from "@/app-aluno/perfil/pecas/api";
import { ErroExclusao, mensagemErroExclusao } from "@/painel/configuracoes/excluirConta/api";

// play-W6, a revisão ⚪14: a assinatura da Google Play é cancelada ANTES de apagar (sem volta). Se a exclusão para depois disso (o Treino
// fora, o banco), a resposta traz play_cancelada e a frase CONTA que a assinatura já foi cancelada — sem ela, a pessoa acha que nada mudou.

const JA_CANCELADA = /assinatura da Google Play já foi cancelada/;

describe("o 502 da exclusão conta que a assinatura da Play já foi cancelada", () => {
  it("o aluno (Perfil › Excluir minha conta)", () => {
    const m = mensagemErroConta(new ErroPerfil("treino_indisponivel", { ok: false, erro: "treino_indisponivel", play_cancelada: true }));
    expect(m).toMatch(/Nada foi apagado/);
    expect(m).toMatch(JA_CANCELADA);
    expect(mensagemErroConta(new ErroPerfil("treino_indisponivel", { ok: false, erro: "treino_indisponivel" }))).not.toMatch(/Google Play/);
  });
  it("o profissional (o painel › Excluir minha conta)", () => {
    const m = mensagemErroExclusao(new ErroExclusao("treino_indisponivel", { ok: false, erro: "treino_indisponivel", play_cancelada: true }));
    expect(m).toMatch(JA_CANCELADA);
    expect(mensagemErroExclusao(new ErroExclusao("treino_indisponivel", {}))).not.toMatch(/Google Play/);
  });
});
