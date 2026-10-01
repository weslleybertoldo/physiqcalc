import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { encerradaPeloVinculo } from "../../../supabase-principal/functions/_shared/app-sem-profissional-regras";

// W19 (herdado da W16b) — "cancelarAssinaturasDoAppEncerrado cancela demais": só a matrícula do app ENCERRADA PELO VÍNCULO com um
// profissional (P7 — o matricular_na_conta da W7b e o script 06 da W16b gravam app_encerrada_em + 'vinculou_profissional') tem a
// assinatura do app cancelada. A desativada à mão (o "Desativar" do site antigo ou do painel) fica inativa SEM o marcador.

const FUNCOES = resolve(__dirname, "../../../supabase-principal/functions");
const codigo = (arq: string) => readFileSync(resolve(FUNCOES, arq), "utf-8");

describe("matrícula do app encerrada pelo vínculo × desativada à mão", () => {
  it("encerrada pelo vínculo (inativa + app_encerrada_em) → cancela; desativada à mão (inativa sem o marcador) → não cancela", () => {
    expect(encerradaPeloVinculo({ ativo: false, app_encerrada_em: "2026-09-30T23:58:00Z" })).toBe(true);
    expect(encerradaPeloVinculo({ ativo: false, app_encerrada_em: null })).toBe(false);
  });

  it("ativa nunca conta (a reativada volta sem o marcador); marcador vazio ou ativo indefinido não contam", () => {
    expect(encerradaPeloVinculo({ ativo: true, app_encerrada_em: "2026-09-30T23:58:00Z" })).toBe(false);
    expect(encerradaPeloVinculo({ ativo: true, app_encerrada_em: null })).toBe(false);
    expect(encerradaPeloVinculo({ ativo: false, app_encerrada_em: "" })).toBe(false);
    expect(encerradaPeloVinculo({ ativo: null, app_encerrada_em: "2026-09-30T23:58:00Z" })).toBe(false);
  });

  it("das matrículas do app de uma pessoa, só as encerradas pelo vínculo entram no cancelamento", () => {
    const linhas = [
      { id: "vinculo", ativo: false, app_encerrada_em: "2026-09-29T20:00:00Z" },
      { id: "manual", ativo: false, app_encerrada_em: null },
      { id: "ativa", ativo: true, app_encerrada_em: null },
    ];
    expect(linhas.filter(encerradaPeloVinculo).map((l) => l.id)).toEqual(["vinculo"]);
  });
});

describe("as funções do banco principal usam o marcador (contrato do código — o módulo com Deno não roda no Vitest)", () => {
  it("cancelarAssinaturasDoAppEncerrado filtra pelo app_encerrada_em no banco e pela regra pura", () => {
    const fonte = codigo("_shared/app-sem-profissional.ts");
    const corpo = fonte.slice(fonte.indexOf("export async function cancelarAssinaturasDoAppEncerrado"), fonte.indexOf("export async function cancelarAssinaturasDasMatriculas"));
    expect(corpo).toContain('.eq("ativo", false).not("app_encerrada_em", "is", null)');
    expect(corpo).toContain(".filter(encerradaPeloVinculo)");
  });

  it("a mp-webhook-aluno só cancela a assinatura de uma matrícula do app inativa quando ela foi encerrada pelo vínculo", () => {
    const fonte = codigo("mp-webhook-aluno/index.ts");
    const corpo = fonte.slice(fonte.indexOf("async function cancelarSeSaiuDoApp"), fonte.indexOf("async function tratarPagamento"));
    expect(corpo.indexOf("matriculaEncerradaPeloVinculo(db, m.id)")).toBeGreaterThan(-1);
    expect(corpo.indexOf("matriculaEncerradaPeloVinculo(db, m.id)")).toBeLessThan(corpo.indexOf("cancelarAssinaturasDasMatriculas("));
  });

  it("as 4 funções que chamam o cancelamento continuam passando pelo mesmo helper (pos-login, pagamentos-aluno, alunos, vincular-aluno)", () => {
    for (const f of ["pos-login", "pagamentos-aluno", "alunos", "vincular-aluno"]) {
      expect(codigo(`${f}/index.ts`), f).toContain("cancelarAssinaturasDoAppEncerrado(");
    }
  });
});
