import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TERMOS_DE_ASSINATURA, TITULO_RESUMO, resumoDaAssinatura, termosDeAssinatura } from "./assinatura";
import { lerMarkdown, type Bloco, type Trecho } from "./markdown";
import { VENDEDOR } from "./versao";

// play-W6, a revisão 🟡4: a folha da oferta da Google Play mostra o resumo dos Termos SEM o que é do site — o Mercado Pago, o Pix, o
// cartão, os preços do banco (o preço é o da Play, na própria folha) e o "bloqueado no dia seguinte" (na Play, a carência e a suspensão
// são as do Google). Texto de outro meio de pagamento no app da Play = risco na política.
// A virada (29/10/2026, pedido da LINUX 1): a PÁGINA /assinatura da versão da Google Play segue a mesma regra — o mesmo texto publicado,
// só com o que é do site tirado (por seção e por item; nenhuma palavra nova).

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

const juntar = (t: Trecho[]) => t.map((x) => x.texto).join("");
/** Todo texto que a tela mostra (subitens e tabelas inclusive). */
function visivel(blocos: Bloco[]): string {
  return blocos
    .flatMap((b): string[] => {
      if (b.tipo === "titulo") return [b.texto];
      if (b.tipo === "paragrafo") return [juntar(b.trechos)];
      if (b.tipo === "lista") return b.itens.flatMap((item) => [juntar(item.trechos), visivel(item.dentro)]);
      return [b.cabecalho, ...b.linhas].map((linha) => linha.map(juntar).join(" | "));
    })
    .join("\n");
}
const titulos = (md: string) => lerMarkdown(md).flatMap((b) => (b.tipo === "titulo" ? [b.texto] : []));

describe("a página /assinatura da versão da Google Play (termosDeAssinatura)", () => {
  const loja = termosDeAssinatura(true);
  const blocos = lerMarkdown(loja);
  const tudo = visivel(blocos);

  it("o site continua com o texto inteiro", () => {
    expect(termosDeAssinatura(false)).toBe(TERMOS_DE_ASSINATURA);
  });

  it("só TIRA linhas do texto publicado: cada linha da loja é uma linha do texto do site, na mesma ordem (nenhuma palavra nova)", () => {
    const doSite = TERMOS_DE_ASSINATURA.split("\n");
    let j = 0;
    for (const linha of loja.split("\n").filter((l) => l.trim() !== "")) {
      while (j < doSite.length && doSite[j] !== linha) j++;
      expect(j, `linha que não existe no texto do site (ou fora de ordem): ${linha}`).toBeLessThan(doSite.length);
      j++;
    }
    expect(loja.length).toBeLessThan(TERMOS_DE_ASSINATURA.length);
  });

  it("sem o Mercado Pago, o Pix, o cartão, a cobrança automática, os preços do banco (R$), o bloqueio do dia seguinte e as tabelas", () => {
    expect(tudo).not.toMatch(/Mercado Pago|\bPix\b|cart[ãa]o|autom[áa]tic|R\$|bloquead/i);
    expect(blocos.some((b) => b.tipo === "tabela")).toBe(false);
  });

  it("as seções que ficam: quem vende, a vigência, o bloqueio que não apaga dados, o cancelamento, a desistência, o reajuste, a §15 e o atendimento", () => {
    expect(titulos(loja)).toEqual([
      TITULO_RESUMO,
      "1. Quem vende",
      "5. Vigência e renovação",
      "6. Avisos de vencimento e bloqueio",
      "8. Cancelamento",
      "9. Desistência (direito de arrependimento)",
      "10. Fora do prazo de desistência",
      "11. Reajuste",
      "12. Preço especial e contas antigas",
      "13. Conta isenta e conta suspensa",
      "15. Versão da Google Play",
      "17. Atendimento",
    ]);
    // as seções inteiras do site saíram: os planos e preços do banco, o teste pago pelo site, o Mercado Pago, a troca, o comprovante do
    // site e a mensalidade ao profissional
    for (const fora of ["2. Os planos e os preços", "3. Teste grátis", "4. Formas de pagamento", "7. Troca de plano", "14. Comprovante", "16. O que não é venda do Physiq"]) {
      expect(titulos(TERMOS_DE_ASSINATURA)).toContain(fora);
      expect(titulos(loja)).not.toContain(fora);
    }
  });

  it("fica o que vale na loja: quem vende (nome, CPF, endereço, e-mail), a §15 inteira, o cancelamento e a desistência pela Google Play", () => {
    for (const parte of [VENDEDOR.nome, `CPF ${VENDEDOR.cpf}`, VENDEDOR.endereco, VENDEDOR.email]) expect(tudo).toContain(parte);
    const secao15 = TERMOS_DE_ASSINATURA.slice(TERMOS_DE_ASSINATURA.indexOf("## 15. Versão da Google Play"), TERMOS_DE_ASSINATURA.indexOf("## 16."));
    expect(loja).toContain(secao15.trim());
    expect(tudo).toContain("cancele quando quiser na Google Play");
    expect(tudo).toContain("devolvemos o valor inteiro do pagamento pela Google Play");
    expect(tudo).toContain("A Google Play também recebe pedidos de reembolso pelas regras dela.");
    // da desistência, o que acontece fica sem o Mercado Pago: o acesso termina e a resposta em 5 dias
    expect(tudo).toContain("o acesso pago por ele termina;");
    expect(tudo).toContain("respondemos em até 5 dias.");
  });

  it("o Resumo da página da loja é o mesmo resumo da folha da Google Play", () => {
    const inicio = blocos.findIndex((b) => b.tipo === "titulo" && b.texto === TITULO_RESUMO);
    expect(blocos[inicio + 1]).toEqual({ tipo: "lista", itens: resumoDaAssinatura("loja") });
  });
});
