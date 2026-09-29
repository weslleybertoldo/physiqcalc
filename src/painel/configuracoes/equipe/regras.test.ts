import { describe, expect, it } from "vitest";
import {
  acoesDoMembro,
  linkDoAluno,
  linkWhatsApp,
  mensagemErroEquipe,
  normalizarEquipe,
  papeisOferecidos,
  sucessoresPossiveis,
  textoAlunosAfetados,
  textoDoLink,
  textoDosPapeis,
  validarEmailConvite,
  type MembroEquipe,
} from "./regras";

const membro = (o: Partial<MembroEquipe> = {}): MembroEquipe => ({
  id: "m2", user_id: "u2", status: "ativo", papeis: ["personal"], nome: "Lucas", email: "lucas@gmail.com", foto_url: null, dono: false, eu: false,
  codigo_convite: "PROF-LUCAS", desde: "2026-09-29T10:00:00Z", alunos_treino: 3, alunos_nutricao: 0, ...o,
});

describe("Equipe (W5) — regras da tela", () => {
  it("normaliza a resposta da equipe_da_conta (tolerante a campo faltando)", () => {
    const e = normalizarEquipe({
      ok: true, conta: { id: "c1", nome: "Consultoria", origem: "nova", plano: "treino_nutricao", modulos: ["treino", "nutricao"], dono_id: "u1" },
      papeis_do_plano: ["personal", "nutricionista", "xx"], bloqueio: null,
      membros: [{ id: "m1", user_id: "u1", status: "ativo", papeis: ["dono", "personal"], nome: "Dona", dono: true, eu: true, alunos_treino: "2" }],
      convites: [{ id: "v1", email: "nutri@gmail.com", papeis: ["nutricionista"], enviado_em: "2026-09-29T11:00:00Z" }],
      alunos_sem_responsavel: 1,
    });
    expect(e?.papeis_do_plano).toEqual(["personal", "nutricionista"]);
    expect(e?.membros[0]).toMatchObject({ dono: true, eu: true, papeis: ["dono", "personal"], alunos_treino: 2, alunos_nutricao: 0 });
    expect(e?.convites[0]).toMatchObject({ email: "nutri@gmail.com", papeis: ["nutricionista"] });
    expect(normalizarEquipe({ ok: false, erro: "so_dono" })).toBeNull();
  });
  it("o plano decide os papéis do convite (spec 6.4): sem Nutrição, nutricionista fica desligado com o porquê", () => {
    const o = papeisOferecidos(["personal"]);
    expect(o.find((x) => x.papel === "personal")?.disponivel).toBe(true);
    expect(o.find((x) => x.papel === "nutricionista")).toMatchObject({ disponivel: false, porque: "O plano da conta não tem Nutrição." });
  });
  it("e-mail do convite", () => {
    expect(validarEmailConvite("")).toMatch(/Informe/);
    expect(validarEmailConvite("fulano@")).toBe("E-mail inválido.");
    expect(validarEmailConvite(" Nutri@Gmail.com ")).toBeNull();
  });
  it("remover: quem pode receber os alunos e o texto do que acontece com eles", () => {
    const dono = membro({ id: "m1", user_id: "u1", dono: true, papeis: ["dono", "personal"], alunos_treino: 0 });
    const sai = membro();
    const nutri = membro({ id: "m3", user_id: "u3", papeis: ["nutricionista"] });
    expect(sucessoresPossiveis([dono, sai, nutri], sai, "personal").map((m) => m.id)).toEqual(["m1"]);
    expect(sucessoresPossiveis([dono, sai, nutri], sai, "nutricionista").map((m) => m.id)).toEqual(["m3"]);
    expect(textoAlunosAfetados({ alunos_treino: 3, alunos_nutricao: 1 })).toBe("Os 3 alunos de treino e 1 de nutrição dele ficam sem responsável até você escolher outro.");
    expect(textoAlunosAfetados({ alunos_treino: 0, alunos_nutricao: 2 })).toBe("Os 2 alunos de nutrição dele ficam sem responsável até você escolher outro.");
    expect(textoAlunosAfetados({ alunos_treino: 1, alunos_nutricao: 0 })).toBe("O aluno de treino dele fica sem responsável até você escolher outro.");
    expect(textoAlunosAfetados({ alunos_treino: 0, alunos_nutricao: 0 })).toBeNull();
  });
  it("ações por linha: dono não é removido; conta legada e convite não mexem; conta travada só remove", () => {
    expect(acoesDoMembro(membro({ dono: true }), { bloqueio: null })).toEqual({ papeis: true, remover: false });
    expect(acoesDoMembro(membro(), { bloqueio: null })).toEqual({ papeis: true, remover: true });
    expect(acoesDoMembro(membro(), { bloqueio: "conta_legada" })).toEqual({ papeis: false, remover: false });
    expect(acoesDoMembro(membro(), { bloqueio: "conta_travada" })).toEqual({ papeis: false, remover: true });
  });
  it("papéis em texto (lista da equipe)", () => {
    expect(textoDosPapeis(["dono", "personal", "nutricionista"])).toBe("Personal trainer e nutricionista");
    expect(textoDosPapeis(["nutricionista"])).toBe("Nutricionista");
    expect(textoDosPapeis(["dono"])).toBe("Dono (sem módulo)");
  });
  it("Convite: o link de hoje (?prof=) pelo ambiente, o WhatsApp e o texto de quem vira responsável", () => {
    expect(linkDoAluno("PROF-LUCAS-FERREIRA", "public")).toBe("https://physiqcalc.com.br/?prof=PROF-LUCAS-FERREIRA");
    expect(linkDoAluno("PROF-X", "staging")).toBe("https://physiqcalc-staging.vercel.app/?prof=PROF-X");
    expect(linkWhatsApp("https://physiqcalc.com.br/?prof=PROF-X")).toContain("https://wa.me/?text=");
    expect(textoDoLink(["dono", "personal"], "Consultoria")).toContain("responsável de treino");
    expect(textoDoLink(["dono"], "Consultoria")).toContain("sem responsável");
  });
  it("toda recusa do banco tem frase; desconhecida vira 'Não deu certo'", () => {
    for (const c of ["so_dono", "conta_legada", "conta_travada", "papel_sem_modulo", "ja_e_membro", "nao_remove_dono", "tem_alunos", "conta_real_no_staging"]) {
      expect(mensagemErroEquipe(c)).not.toBe(mensagemErroEquipe("erro_interno"));
    }
    expect(mensagemErroEquipe("qualquer")).toBe("Não deu certo agora. Tente de novo.");
  });
});
