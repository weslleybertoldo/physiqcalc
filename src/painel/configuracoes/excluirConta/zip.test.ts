import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conferencia } from "./api";

// W2 da loja — "Baixar prontuários": o ZIP sai com 1 PDF por paciente (o documento do "PDF do prontuário" de sempre), com as
// anotações que o dono vê (a função do banco já filtra), e os pedidos ao banco são por conta/lote.
const h = vi.hoisted(() => ({ pedidos: [] as Array<{ conta: string | null; pacientes: string[] }> }));
vi.mock("@/integrations/principal/client", () => ({
  principal: { auth: { getSession: async () => ({ data: { session: { user: { id: "dona" }, access_token: "t" } } }) } },
  PRINCIPAL_URL: "https://principal.teste.invalid", PRINCIPAL_ANON: "anon", PRINCIPAL_SCHEMA: "staging",
}));
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  prontuariosParaBaixar: async (conta: string | null, pacientes: string[]) => {
    h.pedidos.push({ conta, pacientes });
    return {
      clinico: true,
      emissor: "Diana Dono",
      pacientes: pacientes.map((id) => ({
        id, nome: id === "p1" ? "Alice Aluna" : "Bruno Sem Login", nascimento: "1990-05-12", na_lixeira: false,
        registros: [
          { data: "2026-09-01T12:00:00Z", texto: "## Primeira consulta\n**Queixa:** cansaço", created_at: "2026-09-01T12:00:00Z", autor_id: "dona",
            autor_nome: "Diana Dono", autor_papel: "nutricionista", visibilidade: "nutricionistas" },
          { data: "2026-09-20T12:00:00Z", texto: "Retorno da avaliação física", created_at: "2026-09-20T12:00:00Z", autor_id: "edu",
            autor_nome: "Eduardo Equipe", autor_papel: "personal", visibilidade: "equipe" },
        ],
      })),
    };
  },
}));

import { montarZipDeProntuarios } from "./zip";

const conf = (): Conferencia => ({
  ok: true, simulacao: true, perfil: "dono", nome: "Diana", equipes: [], ex_equipes: 0, sem_conta: null, aluno: null, treino: null, cobrancas_a_cancelar: 0,
  contas: [{
    id: "c1", nome: "W2L Consultoria", origem: "nova", plano: "treino_nutricao", situacao: "teste", eu_nutri: true,
    alunos: { total: 2, para_o_app: 1, guardados: 1, lista: [] }, membros: [], convites_pendentes: 0, cobrancas: { plano: 0, alunos: 0 },
    prontuarios: [
      { paciente_id: "p1", conta_id: "c1", nome: "Alice Aluna", registros: 2, restritos: 0 },
      { paciente_id: "p2", conta_id: "c1", nome: "Bruno Sem Login", registros: 2, restritos: 0 },
    ],
  }],
});

beforeEach(() => {
  h.pedidos = [];
});

describe("Baixar prontuários (ZIP com 1 PDF por paciente)", () => {
  it("2 pacientes → 2 PDFs de verdade dentro do ZIP, com o nome de cada um", async () => {
    const progresso: string[] = [];
    const z = await montarZipDeProntuarios(conf(), (f, t) => progresso.push(`${f}/${t}`), new Date(2026, 9, 6, 19, 30));
    expect(z.nome).toBe("physiq-prontuarios-2026-10-06.zip");
    expect(z.pdfs).toEqual(["prontuario-alice-aluna-2026-10-06.pdf", "prontuario-bruno-sem-login-2026-10-06.pdf"]);
    expect(progresso).toEqual(["0/2", "1/2", "2/2"]);
    expect(h.pedidos).toEqual([{ conta: "c1", pacientes: ["p1", "p2"] }]);
    const dentro = unzipSync(z.bytes);
    expect(Object.keys(dentro).sort()).toEqual(z.pdfs);
    for (const nome of z.pdfs) {
      expect(strFromU8(dentro[nome].subarray(0, 5))).toBe("%PDF-");
      expect(dentro[nome].length).toBeGreaterThan(1500);
    }
  });
});
