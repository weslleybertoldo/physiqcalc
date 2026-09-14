import { describe, expect, it, vi } from "vitest";

// saasApi importa { supabase, DB_SCHEMA } do client; aqui simulamos o ambiente PUBLIC (prod).
vi.mock("@/integrations/supabase/client", () => ({ supabase: {}, DB_SCHEMA: "public" }));

import { linkConviteProfessor } from "./saasApi";

describe("linkConviteProfessor", () => {
  it("usa o domínio oficial physiqcalc.com.br no ambiente public", () => {
    expect(linkConviteProfessor("PROF-WESLLEY-BERTOLDO")).toBe("https://physiqcalc.com.br/?prof=PROF-WESLLEY-BERTOLDO");
  });
  it("escapa o código do convite", () => {
    expect(linkConviteProfessor("A B")).toBe("https://physiqcalc.com.br/?prof=A%20B");
  });
});
