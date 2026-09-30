import { describe, expect, it } from "vitest";

import { abasVisiveis } from "@/app-aluno/catalogoAbas";
import { existe } from "@/rotas/registro";

describe("W7 — a aba Perfil entra na barra pelo registro (src/app-aluno/abas/Perfil.tsx)", () => {
  it("a tela nova existe e os itens do Perfil também (Agenda, Conta, Aparência + Pagamentos da W6)", () => {
    expect(existe("abasApp", "Perfil")).toBe(true);
    for (const item of ["Agenda", "Conta", "Aparencia", "Pagamentos"]) expect(existe("perfilApp", item)).toBe(true);
  });
  it("só Treino → Treino · Evolução · Perfil; só Nutrição → Evolução · Perfil (Início e Dieta ainda não existem)", () => {
    expect(abasVisiveis(["treino"]).map((a) => a.rotulo)).toEqual(["Treino", "Evolução", "Perfil"]);
    expect(abasVisiveis(["nutricao"]).map((a) => a.rotulo)).toEqual(["Evolução", "Perfil"]);
    expect(abasVisiveis(["treino", "nutricao"]).map((a) => a.rotulo)).toEqual(["Treino", "Evolução", "Perfil"]);
  });
});
