import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resumoDaAssinatura } from "./assinatura";

// play-W6, a revisão 🟡4: a folha da oferta da Google Play mostra o resumo dos Termos (no build de staging, até a virada do texto legal)
// SEM o que é do site — o Mercado Pago, o Pix, o cartão, os preços do banco (o preço é o da Play, na própria folha) e o "bloqueado no dia
// seguinte" (na Play, a carência e a suspensão são as do Google). Texto de outro meio de pagamento no app da Play = risco na política.

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const texto = (v: unknown) => JSON.stringify(v);
const DO_SITE = /Mercado Pago|\bPix\b|cart[ãa]o|R\$|bloquead/i;

describe("o resumo dos Termos na folha da Google Play", () => {
  it("sem o Mercado Pago, o Pix, o cartão, o preço do banco e o bloqueio do dia seguinte; com quem vende, o cancelamento e a desistência", () => {
    const loja = texto(resumoDaAssinatura("loja"));
    expect(loja).not.toMatch(DO_SITE);
    for (const deve of [/Quem vende/, /Cancele quando quiser/, /Desistência/, /Os preços podem mudar/]) expect(loja).toMatch(deve);
    // o do site continua com tudo (a página /assinatura e as telas do site)
    expect(texto(resumoDaAssinatura("aluno"))).toMatch(/Mercado Pago/);
  });
  it("a folha da Play (AssinaturaPlay.tsx) usa o resumo da loja", () => {
    const folha = readFileSync(resolve(RAIZ, "src/app-aluno/sozinho/pecas/AssinaturaPlay.tsx"), "utf8");
    expect(folha).toContain('<ResumoAntesDePagar tela="loja" />');
    expect(folha).not.toContain('<ResumoAntesDePagar tela="meu-plano" />');
  });
});
