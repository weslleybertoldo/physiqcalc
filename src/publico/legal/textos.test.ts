import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLANOS_APP_PADRAO, TESTE_DIAS_APP } from "@/app-aluno/sozinho/regras";
import { FAIXAS, NOME_PLANO, PLANOS, PRECOS_PADRAO, TESTE_DIAS, TESTE_MAX_ALUNOS } from "@/nucleo/cobranca/regras";
import { CONTATO_SUPORTE } from "@/nucleo/suporte";
import { FRASE_BACKUPS, FRASE_SUPORTE, servicosDaVersao } from "@/publico/privacidade/textos";
import { TERMOS_DE_ASSINATURA, TITULO_RESUMO, resumoDaAssinatura } from "./assinatura";
import { lerMarkdown, type Bloco, type Trecho } from "./markdown";
import { ONDE_FICA_O_SERVICO, politicaDePrivacidade } from "./politica";
import { TERMOS_DE_USO, TITULO_ANEXO } from "./termos";
import { DATA_DOS_TEXTOS, ROTA_ASSINATURA, ROTA_POLITICA, ROTA_TERMOS, VENDEDOR, VERSAO_TEXTOS } from "./versao";

// hml-11 (H-28, §3.2) — os 3 textos legais novos conferidos com o app: sem os marcadores do rascunho, o vendedor completo, âncoras
// e links que existem, os serviços de SERVICOS_TERCEIROS, as frases que a página de hoje também diz e os números da cobrança.

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const juntar = (t: Trecho[]) => t.map((x) => x.texto).join("");

/** Todo texto que a tela mostra, bloco por bloco (subitens inclusive); cada linha de tabela vira "a | b | c". */
function textoVisivel(blocos: Bloco[]): string[] {
  return blocos.flatMap((b) => {
    if (b.tipo === "titulo") return [b.texto];
    if (b.tipo === "paragrafo") return [juntar(b.trechos)];
    if (b.tipo === "lista") return b.itens.flatMap((item) => [juntar(item.trechos), ...textoVisivel(item.dentro)]);
    return [b.cabecalho, ...b.linhas].map((linha) => linha.map(juntar).join(" | "));
  });
}

function links(blocos: Bloco[]): string[] {
  const doTrecho = (t: Trecho[]) => t.flatMap((x) => (x.link ? [x.link] : []));
  return blocos.flatMap((b) => {
    if (b.tipo === "paragrafo") return doTrecho(b.trechos);
    if (b.tipo === "lista") return b.itens.flatMap((item) => [...doTrecho(item.trechos), ...links(item.dentro)]);
    if (b.tipo === "tabela") return [...b.cabecalho, ...b.linhas.flat()].flatMap(doTrecho);
    return [];
  });
}

const ids = (blocos: Bloco[]) => blocos.flatMap((b) => (b.tipo === "titulo" ? [b.id] : []));
const tabelas = (blocos: Bloco[]) => blocos.filter((b): b is Extract<Bloco, { tipo: "tabela" }> => b.tipo === "tabela");

/** "R$ 1.499,00" feito à mão (sem o Intl do texto: o teste não repete a conta do código). */
const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const DOCUMENTOS = [
  ["Política de Privacidade (site e APK)", politicaDePrivacidade(false), ROTA_POLITICA],
  ["Política de Privacidade (Google Play)", politicaDePrivacidade(true), ROTA_POLITICA],
  ["Termos de Uso", TERMOS_DE_USO, ROTA_TERMOS],
  ["Termos de assinatura", TERMOS_DE_ASSINATURA, ROTA_ASSINATURA],
] as const;

/** As âncoras de cada página (para conferir os links com #). */
const ANCORAS: Record<string, string[]> = {
  [ROTA_POLITICA]: ids(lerMarkdown(politicaDePrivacidade(false))),
  [ROTA_TERMOS]: ids(lerMarkdown(TERMOS_DE_USO)),
  [ROTA_ASSINATURA]: ids(lerMarkdown(TERMOS_DE_ASSINATURA)),
};

describe("a versão dos textos (uma só para os 3)", () => {
  it("2026-10-08 = 8 de outubro de 2026", () => {
    expect(VERSAO_TEXTOS).toBe("2026-10-08");
    const porExtenso = new Date(`${VERSAO_TEXTOS}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    expect(DATA_DOS_TEXTOS).toBe(porExtenso);
  });
});

describe.each(DOCUMENTOS)("%s", (_nome, md) => {
  const blocos = lerMarkdown(md);
  const linhas = textoVisivel(blocos);
  const tudo = linhas.join("\n");

  it("não sobra marcação nem marcador do rascunho ([CONFERIR], [DEPENDE], [Pn], 'rascunho', 'a confirmar')", () => {
    for (const linha of linhas) expect(linha).not.toMatch(/\*\*|\[|\]|^#|`|^\s*-\s/);
    expect(md).not.toMatch(/\[(CONFERIR|DEPENDE|P\d+\]|NOME COMPLETO|CPF\]|ENDEREÇO|E-MAIL)/);
    // \b: o "para confirmar que é uma pessoa" da Cloudflare (SERVICOS_TERCEIROS) não é o "a confirmar" de pendência
    expect(tudo).not.toMatch(/rascunho|\ba confirmar\b|conferir com o advogado|\bhml-\d/i);
  });

  it("diz quem vende: nome, CPF, endereço e e-mail (Decreto 7.962/2013, art. 2º)", () => {
    expect(VENDEDOR.email).toBe(CONTATO_SUPORTE);
    expect(tudo).toContain(VENDEDOR.nome);
    expect(tudo).toContain(`CPF ${VENDEDOR.cpf}`);
    expect(tudo).toContain(VENDEDOR.endereco);
    expect(tudo).toContain(VENDEDOR.email);
  });

  it("as âncoras são únicas", () => {
    const deste = ids(blocos);
    expect(deste.length).toBeGreaterThan(10);
    expect(new Set(deste).size).toBe(deste.length);
  });

  it("os links vão só para as 3 páginas, a /excluir-conta e o mailto: do contato — e a âncora existe na página de destino", () => {
    const todos = links(blocos);
    expect(todos.length).toBeGreaterThan(0);
    for (const link of todos) {
      const [rota, ancora] = link.split("#");
      expect([ROTA_POLITICA, ROTA_TERMOS, ROTA_ASSINATURA, "/excluir-conta", `mailto:${VENDEDOR.email}`]).toContain(rota);
      if (ancora) expect(ANCORAS[rota], link).toContain(ancora);
    }
  });
});

describe("Política de Privacidade × o app", () => {
  it.each([
    ["site e APK", false],
    ["Google Play", true],
  ] as const)("a tabela de serviços é a de servicosDaVersao (%s), com o que cada um recebe e onde fica", (_versao, loja) => {
    const blocos = lerMarkdown(politicaDePrivacidade(loja));
    const tabela = tabelas(blocos).find((t) => juntar(t.cabecalho[0]) === "Serviço");
    expect(tabela).toBeDefined();
    const esperados = servicosDaVersao(loja);
    expect(tabela!.linhas.map((l) => juntar(l[0]))).toEqual(esperados.map((s) => s.nome));
    tabela!.linhas.forEach((linha, i) => {
      expect(juntar(linha[1])).toBe(esperados[i].texto);
      expect(juntar(linha[2])).toBe(ONDE_FICA_O_SERVICO[esperados[i].id]);
      expect(ONDE_FICA_O_SERVICO[esperados[i].id], esperados[i].id).toBeTruthy();
    });
    const tudo = textoVisivel(blocos).join("\n");
    if (loja) expect(tudo).not.toContain("GitHub");
    else expect(tudo).toContain("o GitHub.");
    expect(tudo).toContain("Telegram");
  });

  it("as frases que a página de hoje e a /excluir-conta também dizem: FRASE_BACKUPS e FRASE_SUPORTE (um lugar só)", () => {
    const tudo = textoVisivel(lerMarkdown(politicaDePrivacidade(false))).join("\n");
    expect(tudo).toContain(FRASE_BACKUPS);
    expect(tudo).toContain(FRASE_SUPORTE);
  });

  it("LGPD: os arts. 7º, 11, 14, 18, 33 e 48; o controlador e o operador; a idade de 16 e 18 anos", () => {
    const tudo = textoVisivel(lerMarkdown(politicaDePrivacidade(false))).join("\n");
    for (const art of ["art. 7º", "art. 11", "art. 14", "art. 18", "art. 33", "art. 48"]) expect(tudo).toContain(art);
    expect(tudo).toMatch(/controlador/);
    expect(tudo).toMatch(/operador/);
    expect(tudo).toContain("16 anos");
    expect(tudo).toContain("18 anos");
  });

  it("as séries de 12 meses saem do aparelho e do banco (P2) e a lixeira guarda 30 dias", () => {
    const tudo = textoVisivel(lerMarkdown(politicaDePrivacidade(false))).join("\n");
    expect(tudo).toContain("as com mais de 12 meses são apagadas automaticamente, do aparelho e do banco");
    expect(tudo).toContain("30 dias na lixeira");
  });
});

describe("Termos de assinatura × o que o app cobra", () => {
  const blocos = lerMarkdown(TERMOS_DE_ASSINATURA);
  const tudo = textoVisivel(blocos).join("\n");

  it("o plano do profissional: cada preço mensal de PRECOS_PADRAO, linha a linha, e cada anual", () => {
    for (const plano of PLANOS) {
      const mensais = FAIXAS.map((faixa) => reais(PRECOS_PADRAO.find((l) => l.plano === plano && l.faixa === faixa)!.valor_mensal));
      expect(tudo).toContain(`${NOME_PLANO[plano]} | ${mensais.join(" | ")}`);
    }
    for (const linha of PRECOS_PADRAO) expect(tudo, `${linha.plano}/${linha.faixa}`).toContain(reais(linha.valor_anual ?? linha.valor_mensal * 10));
  });

  it("o teste do profissional: TESTE_DIAS dias e até TESTE_MAX_ALUNOS alunos", () => {
    expect(tudo).toContain(`${TESTE_DIAS} dias grátis no Treino + Nutrição, com até ${TESTE_MAX_ALUNOS} alunos`);
  });

  it("os 2 planos do app e os dias grátis: PLANOS_APP_PADRAO e TESTE_DIAS_APP, iguais à seed da W7b", () => {
    const seed = readFileSync(resolve(RAIZ, "supabase-principal/migrations/20260929190000_w07b_sem_profissional.sql"), "utf8");
    for (const p of PLANOS_APP_PADRAO) {
      expect(seed).toContain(`('${p.codigo}', '${p.nome}', ${p.valor.toFixed(2)}::numeric`);
      expect(tudo).toContain(`${p.nome} | ${reais(p.valor)} |`);
      expect(tudo).toContain(`${p.nome}, ${reais(p.valor)} por mês`);
    }
    expect(seed).toContain(`jsonb_build_object('teste_dias', ${TESTE_DIAS_APP})`);
    expect(tudo).toContain(`${TESTE_DIAS_APP} dias grátis, sem cartão`);
  });

  it("Pix de 72 h, desistência em 7 dias depois de um pagamento, reajuste com 30 dias e Maceió/AL", () => {
    expect(tudo).toContain("72 h");
    expect(tudo).toContain("7 dias depois de um pagamento");
    expect(tudo).toContain("30 dias");
    expect(tudo).toContain("Maceió/AL");
    expect(tudo).toContain("Código de Defesa do Consumidor, art. 49");
  });

  it("o resumo antes de pagar é a seção Resumo deste texto; cada tela tira o bloco do outro público", () => {
    const texto = (itens: ReturnType<typeof resumoDaAssinatura>) => itens.map((i) => juntar(i.trechos));
    const todos = resumoDaAssinatura();
    expect(todos.length).toBeGreaterThan(8);
    expect(texto(todos)).toEqual(expect.arrayContaining(["Profissional:", "Aluno sem profissional:"]));
    expect(texto(resumoDaAssinatura("profissional"))).not.toContain("Aluno sem profissional:");
    expect(texto(resumoDaAssinatura("profissional"))).toContain("Profissional:");
    expect(texto(resumoDaAssinatura("aluno"))).not.toContain("Profissional:");
    expect(texto(resumoDaAssinatura("aluno"))).toContain("Aluno sem profissional:");
    expect(resumoDaAssinatura().length - resumoDaAssinatura("aluno").length).toBe(1);
    expect(ids(blocos)).toContain("resumo-o-mais-importante-antes-de-pagar");
  });

  it("as cláusulas que limitam direitos ficam em negrito no resumo (Decreto 7.962/2013, art. 4º, I)", () => {
    const negritos = resumoDaAssinatura().flatMap((i) => i.trechos).filter((t) => t.negrito).map((t) => t.texto);
    expect(negritos).toContain("Fora desse prazo, o que já foi pago não é devolvido, nem em parte");
    expect(negritos).toContain("cobrança automática no cartão, que renova todo mês até você cancelar");
    expect(negritos).toContain("7 dias depois de um pagamento");
  });

  it("sem a seção Resumo no texto = erro (o teste acusa antes de a tela de pagar sair sem resumo)", () => {
    expect(() => resumoDaAssinatura(undefined, "## Outra seção\n\n- um item qualquer")).toThrow(TITULO_RESUMO);
  });
});

describe("Termos de Uso", () => {
  const blocos = lerMarkdown(TERMOS_DE_USO);
  const tudo = textoVisivel(blocos).join("\n");

  it("o Anexo do tratamento de dados existe, com os 8 itens", () => {
    expect(tudo).toContain(TITULO_ANEXO);
    expect(blocos.filter((b) => b.tipo === "titulo" && b.nivel === 3).map((b) => (b.tipo === "titulo" ? b.texto.slice(0, 3) : ""))).toEqual([
      "A1.", "A2.", "A3.", "A4.", "A5.", "A6.", "A7.", "A8.",
    ]);
  });

  it("'não é um dispositivo médico', o limite de 3 mensalidades (P5) e o foro de Maceió/AL", () => {
    expect(tudo).toContain("não é um dispositivo médico");
    expect(tudo).toContain("3 mensalidades");
    expect(tudo).toContain("foro de Maceió/AL");
  });
});
