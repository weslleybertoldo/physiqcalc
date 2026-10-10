import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  MIN_SEGREDO,
  hashHex,
  segredoAceito,
  segredoParaEnviar,
  type LerAmbiente,
} from "../../supabase-principal/functions/_shared/segredo-servidor";
import * as doTreino from "../../supabase/functions/_shared/segredo-servidor";

// Homologação hml-16c (H-51) — o segredo entre os servidores, 1 por finalidade (_shared/segredo-servidor.ts, as 2 cópias). O
// emissor manda SEGREDO_X (sem ele, nada); o receptor aceita só o sha256 na lista SEGREDO_X_ACEITOS ("lista"); o resto recusa. O
// segredo único de antes (o legado, NOME_DO_LEGADO) saiu na hml-16c: no ambiente, não é aceito nem enviado. Valores falsos,
// feitos aqui; nada vai à rede. No fim, a guarda nas fontes das funções: cada receptor e cada emissor usa o nome da tabela do
// contrato (§1), o log segredo_aceito leva só a finalidade e o resultado, e o comparador antigo não volta.
const raiz = resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(resolve(raiz, rel), "utf-8");

const NOVO = "N1".repeat(32); // 64 caracteres, como o token_urlsafe(48) do script
const ANTERIOR = "A2".repeat(32);
const TERCEIRO = "T3".repeat(32);
/** O segredo único de antes (até a hml-16c, o mesmo valor em todos os canais): o nome só aparece aqui e na guarda. */
const NOME_DO_LEGADO = "ESPELHO_SEGREDO";
const LEGADO = "L4".repeat(32);
const NOME = "SEGREDO_AVISO_ERRO";
const LISTA = `${NOME}_ACEITOS`;
let HASH_NOVO = "";
let HASH_ANTERIOR = "";
let HASH_TERCEIRO = "";

beforeAll(async () => {
  HASH_NOVO = await hashHex(NOVO);
  HASH_ANTERIOR = await hashHex(ANTERIOR);
  HASH_TERCEIRO = await hashHex(TERCEIRO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** O ambiente falso (o leitor injetado). */
const ambiente =
  (vars: Record<string, string>): LerAmbiente =>
  (nome) =>
    vars[nome];

describe("hashHex", () => {
  it("sha256 do texto em hex minúsculo — o mesmo do hashlib.sha256(valor.encode()).hexdigest() do script", async () => {
    expect(await hashHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await hashHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(HASH_NOVO).toMatch(/^[0-9a-f]{64}$/);
    expect(HASH_NOVO).not.toBe(HASH_ANTERIOR);
  });
});

describe("receptor: segredoAceito", () => {
  it("o sha256 do recebido na lista → lista", async () => {
    expect(await segredoAceito(NOVO, NOME, ambiente({ [LISTA]: HASH_NOVO }))).toBe("lista");
  });

  it("2 hashes (o atual e o anterior, durante a troca) → os 2 passam; outro valor não", async () => {
    const ler2 = ambiente({ [LISTA]: `${HASH_NOVO},${HASH_ANTERIOR}` });
    expect(await segredoAceito(NOVO, NOME, ler2)).toBe("lista");
    expect(await segredoAceito(ANTERIOR, NOME, ler2)).toBe("lista");
    expect(await segredoAceito(TERCEIRO, NOME, ler2)).toBeNull();
  });

  it("o ESPELHO_SEGREDO no ambiente NÃO é aceito: o valor dele recusa, com ou sem a lista e de qualquer tamanho", async () => {
    for (const antigo of [LEGADO, "c".repeat(MIN_SEGREDO), "c".repeat(MIN_SEGREDO + 1)]) {
      expect(await segredoAceito(antigo, NOME, ambiente({ [NOME_DO_LEGADO]: antigo }))).toBeNull();
      expect(await segredoAceito(antigo, NOME, ambiente({ [NOME_DO_LEGADO]: antigo, [LISTA]: HASH_NOVO }))).toBeNull();
    }
    // a lista segue valendo do lado dele
    expect(await segredoAceito(NOVO, NOME, ambiente({ [NOME_DO_LEGADO]: LEGADO, [LISTA]: HASH_NOVO }))).toBe("lista");
  });

  it("só a lista decide: o valor antigo passa apenas se o hash DELE estiver na lista, como qualquer outro valor", async () => {
    const hashDoLegado = await hashHex(LEGADO);
    expect(await segredoAceito(LEGADO, NOME, ambiente({ [LISTA]: hashDoLegado }))).toBe("lista");
    expect(await segredoAceito(LEGADO, NOME, ambiente({ [LISTA]: HASH_NOVO }))).toBeNull();
    expect(await segredoAceito(LEGADO, NOME, ambiente({}))).toBeNull();
  });

  it("recebido curto → recusa, mesmo com o hash dele na lista (o mínimo é MIN_SEGREDO)", async () => {
    expect(MIN_SEGREDO).toBe(32);
    const curto = "c".repeat(MIN_SEGREDO - 1);
    expect(await segredoAceito(curto, NOME, ambiente({ [LISTA]: await hashHex(curto) }))).toBeNull();
    expect(await segredoAceito("abc", NOME, ambiente({ [LISTA]: await hashHex("abc"), [NOME_DO_LEGADO]: "abc" }))).toBeNull();
    const exato = "c".repeat(MIN_SEGREDO);
    expect(await segredoAceito(exato, NOME, ambiente({ [LISTA]: await hashHex(exato) }))).toBe("lista");
  });

  it("recebido vazio, nulo ou ausente → recusa", async () => {
    const tudo = ambiente({ [LISTA]: HASH_NOVO, [NOME_DO_LEGADO]: LEGADO });
    for (const vazio of ["", null, undefined]) expect(await segredoAceito(vazio, NOME, tudo)).toBeNull();
  });

  it("errado → recusa: 1 caractere trocado, a mais ou a menos", async () => {
    const tudo = ambiente({ [LISTA]: HASH_NOVO, [NOME_DO_LEGADO]: LEGADO });
    for (const valor of [NOVO, LEGADO]) {
      expect(await segredoAceito(`${valor.slice(0, -1)}x`, NOME, tudo)).toBeNull();
      expect(await segredoAceito(`${valor}x`, NOME, tudo)).toBeNull();
      expect(await segredoAceito(valor.slice(0, -1), NOME, tudo)).toBeNull();
      expect(await segredoAceito(` ${valor}`, NOME, tudo)).toBeNull();
    }
    expect(await segredoAceito(LEGADO, NOME, tudo)).toBeNull();
  });

  it("o hash não serve de segredo: quem lê a lista do receptor não consegue chamar", async () => {
    expect(await segredoAceito(HASH_NOVO, NOME, ambiente({ [LISTA]: HASH_NOVO }))).toBeNull();
  });

  it("a lista tolera espaço e maiúscula", async () => {
    const ler2 = ambiente({ [LISTA]: `  ${HASH_ANTERIOR.toUpperCase()} ,\t${HASH_NOVO}\n` });
    expect(await segredoAceito(NOVO, NOME, ler2)).toBe("lista");
    expect(await segredoAceito(ANTERIOR, NOME, ler2)).toBe("lista");
  });

  it("item que não é hex de 64 é ignorado e não conta entre os 2", async () => {
    const lixo = ["xyz", HASH_NOVO.slice(1), "", `${HASH_NOVO}0`, `g${HASH_NOVO.slice(1)}`, HASH_NOVO.replace(/^./, "-")];
    const ler2 = ambiente({ [LISTA]: [...lixo, HASH_ANTERIOR, HASH_NOVO].join(",") });
    expect(await segredoAceito(ANTERIOR, NOME, ler2)).toBe("lista");
    expect(await segredoAceito(NOVO, NOME, ler2)).toBe("lista");
  });

  it("mais de 2 válidos → só os 2 primeiros", async () => {
    const ler3 = ambiente({ [LISTA]: `${HASH_NOVO},${HASH_ANTERIOR},${HASH_TERCEIRO}` });
    expect(await segredoAceito(NOVO, NOME, ler3)).toBe("lista");
    expect(await segredoAceito(ANTERIOR, NOME, ler3)).toBe("lista");
    expect(await segredoAceito(TERCEIRO, NOME, ler3)).toBeNull();
  });

  it("lista vazia ou só com lixo → tudo recusa (falha fechada), mesmo com o ESPELHO_SEGREDO no ambiente", async () => {
    for (const lista of ["", " ", ",", "nada,de,hash"]) {
      expect(await segredoAceito(NOVO, NOME, ambiente({ [LISTA]: lista }))).toBeNull();
      expect(await segredoAceito(LEGADO, NOME, ambiente({ [LISTA]: lista, [NOME_DO_LEGADO]: LEGADO }))).toBeNull();
    }
  });

  it("a lista é a do nome pedido: o hash certo na lista de OUTRA finalidade não passa", async () => {
    const ler2 = ambiente({ SEGREDO_ESPELHO_RESUMO_ACEITOS: HASH_NOVO });
    expect(await segredoAceito(NOVO, NOME, ler2)).toBeNull();
    expect(await segredoAceito(NOVO, "SEGREDO_ESPELHO_RESUMO", ler2)).toBe("lista");
  });

  it("o valor do emissor no ambiente do receptor não abre nada: só a lista conta", async () => {
    expect(await segredoAceito(NOVO, NOME, ambiente({ [NOME]: NOVO }))).toBeNull();
  });

  it("leitor que lança → recusa, sem lançar", async () => {
    const quebrado: LerAmbiente = () => {
      throw new Error("sem permissão");
    };
    await expect(segredoAceito(NOVO, NOME, quebrado)).resolves.toBeNull();
  });
});

describe("emissor: segredoParaEnviar", () => {
  it("com o SEGREDO_X (≥ 32) → ele (o ESPELHO_SEGREDO no ambiente não muda nada)", () => {
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: NOVO, [NOME_DO_LEGADO]: LEGADO }))).toBe(NOVO);
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: NOVO }))).toBe(NOVO);
  });

  it("o ESPELHO_SEGREDO no ambiente NÃO é enviado: sem o SEGREDO_X → \"\"", () => {
    expect(segredoParaEnviar(NOME, ambiente({ [NOME_DO_LEGADO]: LEGADO }))).toBe("");
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: "", [NOME_DO_LEGADO]: LEGADO }))).toBe("");
  });

  it("SEGREDO_X curto conta como ausente → \"\" (com ou sem o ESPELHO_SEGREDO)", () => {
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: "curto" }))).toBe("");
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: "c".repeat(MIN_SEGREDO - 1), [NOME_DO_LEGADO]: LEGADO }))).toBe("");
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: "c".repeat(MIN_SEGREDO) }))).toBe("c".repeat(MIN_SEGREDO));
  });

  it("sem nenhum → \"\" (o emissor para com o sem_configuracao / nao_configurada de sempre)", () => {
    expect(segredoParaEnviar(NOME, ambiente({}))).toBe("");
    expect(segredoParaEnviar(NOME, () => undefined)).toBe("");
  });

  it("o segredo de outra finalidade não serve", () => {
    expect(segredoParaEnviar(NOME, ambiente({ SEGREDO_ESPELHO_RESUMO: NOVO }))).toBe("");
  });

  it("leitor que lança → \"\", sem lançar", () => {
    expect(
      segredoParaEnviar(NOME, () => {
        throw new Error("sem permissão");
      }),
    ).toBe("");
  });
});

describe("o ambiente da função é lido na hora (sem o global do Deno no topo do módulo)", () => {
  it("sem leitor: lê o ambiente do Deno de agora; mudou o ambiente, muda a resposta", async () => {
    const env: Record<string, string> = { [NOME]: NOVO };
    vi.stubGlobal("Deno", { env: { get: (nome: string) => env[nome] } });
    expect(segredoParaEnviar(NOME)).toBe(NOVO);
    env[NOME] = ANTERIOR;
    expect(segredoParaEnviar(NOME)).toBe(ANTERIOR);
    expect(await segredoAceito(ANTERIOR, NOME)).toBeNull();
    env[LISTA] = HASH_ANTERIOR;
    expect(await segredoAceito(ANTERIOR, NOME)).toBe("lista");
  });

  it("fora do Supabase (sem o Deno) → nada a enviar e tudo recusado", async () => {
    vi.stubGlobal("Deno", undefined);
    expect(segredoParaEnviar(NOME)).toBe("");
    expect(await segredoAceito(NOVO, NOME)).toBeNull();
  });
});

describe("as 2 cópias (cada banco publica só o _shared dele)", () => {
  const COPIAS = ["supabase/functions/_shared/segredo-servidor.ts", "supabase-principal/functions/_shared/segredo-servidor.ts"];

  it("são iguais byte a byte", () => {
    expect(ler(COPIAS[0])).toBe(ler(COPIAS[1]));
  });

  it("a do Treino responde igual", async () => {
    const tudo = ambiente({ [LISTA]: `${HASH_NOVO},${HASH_ANTERIOR}`, [NOME_DO_LEGADO]: LEGADO, [NOME]: NOVO });
    for (const valor of [NOVO, ANTERIOR, LEGADO, TERCEIRO, "curto", ""]) {
      expect(await doTreino.segredoAceito(valor, NOME, tudo)).toBe(await segredoAceito(valor, NOME, tudo));
    }
    expect(doTreino.segredoParaEnviar(NOME, tudo)).toBe(NOVO);
    expect(doTreino.segredoParaEnviar(NOME, ambiente({ [NOME_DO_LEGADO]: LEGADO }))).toBe("");
    expect(await doTreino.segredoAceito(LEGADO, NOME, tudo)).toBeNull();
    expect(await doTreino.hashHex(NOVO)).toBe(HASH_NOVO);
  });

  it("sem import de URL, sem o Deno.env direto e sem console (o Vitest importa; a guarda do log das funções)", () => {
    for (const copia of COPIAS) {
      const fonte = ler(copia);
      expect(fonte).not.toMatch(/from\s+["']https?:/);
      expect(fonte).not.toMatch(/\bDeno\.env\b/);
      expect(fonte).not.toMatch(/\bconsole\b/);
    }
  });
});

// ───────────────────────── a guarda nas fontes das funções (contrato hml-16c §1) ─────────────────────────

const P = "supabase-principal/functions";
const T = "supabase/functions";
const PECA_COMUM = [`${T}/_shared/segredo-servidor.ts`, `${P}/_shared/segredo-servidor.ts`];

interface Canal {
  /** O segredo do EMISSOR (a lista do receptor é `${nome}_ACEITOS`). */
  nome: string;
  /** A finalidade (o nome do script): vai no `acao` do log segredo_aceito. */
  finalidade: string;
  /** Onde o receptor aceita (segredoAceito com o nome) → quantas entradas aceitam. */
  aceite: Record<string, number>;
  /** Onde o x-espelho-segredo é lido e o log segredo_aceito sai → quantos logs (sem isto: o mesmo arquivo do aceite). */
  log?: Record<string, number>;
  /** Quem manda (segredoParaEnviar com o nome). O S8 sai do banco (espelho_disparar, pg_net): nenhum arquivo daqui. */
  emissores: string[];
}

const CANAIS: Canal[] = [
  { nome: "SEGREDO_ESPELHO_NUCLEO", finalidade: "espelho_nucleo", aceite: { [`${T}/espelho-nucleo/index.ts`]: 1 }, emissores: [`${P}/espelho-enviar/index.ts`] },
  { nome: "SEGREDO_PONTE_CALC", finalidade: "ponte_calc", aceite: { [`${T}/vincular-professor/index.ts`]: 1 }, emissores: [`${P}/pos-login/index.ts`] },
  { nome: "SEGREDO_CONTA_TREINO", finalidade: "conta_treino", aceite: { [`${T}/delete-my-account/index.ts`]: 1 }, emissores: [`${P}/_shared/treino-servidor.ts`] },
  { nome: "SEGREDO_ESPELHO_RESUMO", finalidade: "espelho_resumo", aceite: { [`${P}/espelho-resumo/index.ts`]: 1 }, emissores: [`${T}/trocar-token/index.ts`] },
  {
    nome: "SEGREDO_REPASSE_VINCULO",
    finalidade: "repasse_vinculo",
    aceite: { [`${P}/vincular-aluno/index.ts`]: 2 }, // o vínculo e o desvincular
    emissores: [`${T}/admin-delete-user/index.ts`, `${T}/vincular-professor/index.ts`],
  },
  { nome: "SEGREDO_REPASSE_CONVITES", finalidade: "repasse_convites", aceite: { [`${P}/alunos/index.ts`]: 1 }, emissores: [`${T}/professor-convites/index.ts`] },
  {
    nome: "SEGREDO_AVISO_ERRO",
    finalidade: "aviso_erro",
    aceite: { [`${P}/erro-avisar/index.ts`]: 1 }, // a função liga o segredoAceito ao atenderPedido (DepsPedido.segredo)
    log: { [`${P}/_shared/erro-avisar-regras.ts`]: 1 },
    emissores: [`${T}/_shared/avisar-erro.ts`],
  },
  { nome: "SEGREDO_ESPELHO_FILA", finalidade: "espelho_fila", aceite: { [`${P}/espelho-enviar/index.ts`]: 1 }, emissores: [] },
];

/** O código sem comentário: sem as linhas de bloco (as que começam com /* ou *) e sem o // de fim de linha (fora de URL). */
function semComentario(fonte: string): string {
  return fonte
    .split("\n")
    .map((linha) => (/^\s*(\/\*|\*)/.test(linha) ? "" : linha.replace(/(?<![:\\])\/\/.*$/, "")))
    .join("\n");
}

/** Todos os .ts das funções dos 2 projetos, com o código sem comentário. */
function fontesDasFuncoes(): Array<{ arquivo: string; codigo: string }> {
  const saida: Array<{ arquivo: string; codigo: string }> = [];
  const andar = (rel: string) => {
    for (const e of readdirSync(resolve(raiz, rel), { withFileTypes: true })) {
      const caminho = `${rel}/${e.name}`;
      if (e.isDirectory()) andar(caminho);
      else if (e.name.endsWith(".ts")) saida.push({ arquivo: caminho, codigo: semComentario(ler(caminho)) });
    }
  };
  andar(P);
  andar(T);
  return saida.sort((a, b) => (a.arquivo < b.arquivo ? -1 : 1));
}

const FONTES = fontesDasFuncoes();
const codigoDe = (arquivo: string) => FONTES.find((f) => f.arquivo === arquivo)?.codigo ?? "";
const linhasCom = (codigo: string, ...pedacos: Array<string | RegExp>) =>
  codigo.split("\n").filter((l) => pedacos.every((p) => (typeof p === "string" ? l.includes(p) : p.test(l)))).length;
const arquivosCom = (...pedacos: Array<string | RegExp>) => FONTES.filter((f) => linhasCom(f.codigo, ...pedacos) > 0).map((f) => f.arquivo).sort();
const logDoCanal = (c: Canal) => c.log ?? c.aceite;
/** O log do aceite tem esta forma e nada mais: o código, o schema (quando a função já sabe), a finalidade e o resultado (lista). */
const formaDoLog = (finalidade: string) =>
  new RegExp(String.raw`\blog\.info\(\{ codigo: "segredo_aceito"(?:, schema(?:: currentSchema\(\))?)?, acao: "${finalidade}", resultado: [a-z]+ \}\);`);

describe("a guarda nas fontes: os 8 segredos do contrato (hml-16c §1) nos receptores e nos emissores", () => {
  it("8 nomes e 8 finalidades, sem repetir; a finalidade é o nome sem o SEGREDO_, em minúsculas", () => {
    expect(new Set(CANAIS.map((c) => c.nome)).size).toBe(8);
    expect(new Set(CANAIS.map((c) => c.finalidade)).size).toBe(8);
    for (const c of CANAIS) expect(c.finalidade).toBe(c.nome.replace(/^SEGREDO_/, "").toLowerCase());
    expect(FONTES.length).toBeGreaterThan(40); // o leitor achou as funções dos 2 projetos
  });

  it.each(CANAIS)("$nome: o receptor aceita com este nome e loga a finalidade ($finalidade), só onde a tabela diz", (c) => {
    for (const [arquivo, n] of Object.entries(c.aceite)) {
      expect(linhasCom(codigoDe(arquivo), "segredoAceito(", `"${c.nome}"`), arquivo).toBe(n);
    }
    for (const [arquivo, n] of Object.entries(logDoCanal(c))) {
      expect(linhasCom(codigoDe(arquivo), formaDoLog(c.finalidade)), arquivo).toBe(n);
    }
    expect(arquivosCom("segredoAceito(", `"${c.nome}"`)).toEqual(Object.keys(c.aceite).sort());
    expect(arquivosCom(`acao: "${c.finalidade}"`, "segredo_aceito")).toEqual(Object.keys(logDoCanal(c)).sort());
  });

  it.each(CANAIS)("$nome: o emissor manda este nome (1 vez em cada), e só ele", (c) => {
    for (const arquivo of c.emissores) expect(linhasCom(codigoDe(arquivo), `segredoParaEnviar("${c.nome}")`), arquivo).toBe(1);
    expect(arquivosCom(`segredoParaEnviar("${c.nome}")`)).toEqual([...c.emissores].sort());
  });

  it("todo log segredo_aceito tem a forma certa (nunca o valor nem o hash) e são 9 (o S5 tem 2 entradas)", () => {
    const todos = FONTES.reduce((n, f) => n + linhasCom(f.codigo, '"segredo_aceito"'), 0);
    const certos = CANAIS.reduce((n, c) => n + FONTES.reduce((m, f) => m + linhasCom(f.codigo, formaDoLog(c.finalidade)), 0), 0);
    expect(todos).toBe(9);
    expect(certos).toBe(9);
  });

  it("quem lê o x-espelho-segredo é um receptor da tabela; quem o manda, um emissor da tabela", () => {
    const leitores = [...new Set(CANAIS.flatMap((c) => Object.keys(logDoCanal(c))))].sort();
    expect(arquivosCom('headers.get("x-espelho-segredo")')).toEqual(leitores);
    const emissores = [...new Set(CANAIS.flatMap((c) => c.emissores))].sort();
    expect(arquivosCom('"x-espelho-segredo":')).toEqual(emissores);
  });

  it("todo aceite espera a resposta (sem o await, a Promise seria 'verdadeira' e aceitaria qualquer valor)", () => {
    const chamadas = FONTES.filter((f) => !PECA_COMUM.includes(f.arquivo)).flatMap((f) =>
      f.codigo.split("\n").filter((l) => l.includes("segredoAceito(")).map((l) => `${f.arquivo}: ${l.trim()}`),
    );
    expect(chamadas).toHaveLength(9);
    // a erro-avisar passa a função adiante (DepsPedido.segredo) e o atenderPedido é quem espera
    const semAwait = chamadas.filter((c) => !c.includes("await segredoAceito(") && !c.includes("=> segredoAceito(recebido, "));
    expect(semAwait).toEqual([]);
    expect(linhasCom(codigoDe(`${P}/_shared/erro-avisar-regras.ts`), "const aceito = await deps.segredo(segredo);")).toBe(1);
    expect(linhasCom(codigoDe(`${P}/erro-avisar/index.ts`), "=> segredoAceito(recebido, ")).toBe(1);
  });

  it("quem usa a peça comum importa dela o que usa (o tsc do app não lê as index.ts das funções)", () => {
    const usam = FONTES.filter((f) => !PECA_COMUM.includes(f.arquivo) && /\bsegredo(?:Aceito|ParaEnviar)\(/.test(f.codigo));
    expect(usam.length).toBe(14);
    for (const f of usam) {
      const importados = /import \{([^}]*)\} from "(?:\.\.\/_shared|\.)\/segredo-servidor\.ts";/.exec(f.codigo)?.[1] ?? "";
      for (const nome of ["segredoAceito", "segredoParaEnviar"]) {
        if (new RegExp(String.raw`\b${nome}\(`).test(f.codigo)) expect(importados, `${f.arquivo}: ${nome}`).toMatch(new RegExp(String.raw`\b${nome}\b`));
      }
    }
  });

  it("nenhum código das funções lê o ESPELHO_SEGREDO (nem a peça comum); o comparador antigo só ficou no push (PUSH_SEGREDO)", () => {
    expect(arquivosCom(NOME_DO_LEGADO)).toEqual([]);
    expect(arquivosCom("function segredoConfere(")).toEqual([`${P}/_shared/push-regras.ts`]);
  });
});
