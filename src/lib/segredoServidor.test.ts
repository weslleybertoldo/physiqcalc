import { readFileSync } from "node:fs";
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
// emissor manda SEGREDO_X (sem ele, até o F7, o legado ESPELHO_SEGREDO); o receptor aceita o sha256 na lista SEGREDO_X_ACEITOS
// ("lista") ou o legado ("legado"); o resto recusa. Valores falsos, feitos aqui; nada vai à rede.
const raiz = resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(resolve(raiz, rel), "utf-8");

const NOVO = "N1".repeat(32); // 64 caracteres, como o token_urlsafe(48) do script
const ANTERIOR = "A2".repeat(32);
const TERCEIRO = "T3".repeat(32);
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

  it("legado ligado: o ESPELHO_SEGREDO passa como legado (com ou sem a lista); a lista vence quando os 2 valem", async () => {
    expect(await segredoAceito(LEGADO, NOME, ambiente({ ESPELHO_SEGREDO: LEGADO }))).toBe("legado");
    expect(await segredoAceito(LEGADO, NOME, ambiente({ ESPELHO_SEGREDO: LEGADO, [LISTA]: HASH_NOVO }))).toBe("legado");
    expect(await segredoAceito(NOVO, NOME, ambiente({ ESPELHO_SEGREDO: LEGADO, [LISTA]: HASH_NOVO }))).toBe("lista");
    const hashDoLegado = await hashHex(LEGADO);
    expect(await segredoAceito(LEGADO, NOME, ambiente({ ESPELHO_SEGREDO: LEGADO, [LISTA]: hashDoLegado }))).toBe("lista");
  });

  it("legado desligado (depois do F6): o valor antigo recusa; a lista segue valendo", async () => {
    expect(await segredoAceito(LEGADO, NOME, ambiente({ [LISTA]: HASH_NOVO }))).toBeNull();
    expect(await segredoAceito(LEGADO, NOME, ambiente({}))).toBeNull();
    expect(await segredoAceito(NOVO, NOME, ambiente({ [LISTA]: HASH_NOVO }))).toBe("lista");
  });

  it("legado curto não vale, nem igual (o mínimo é MIN_SEGREDO)", async () => {
    expect(MIN_SEGREDO).toBe(32);
    expect(await segredoAceito("curto", NOME, ambiente({ ESPELHO_SEGREDO: "curto" }))).toBeNull();
    const quase = "c".repeat(MIN_SEGREDO - 1);
    expect(await segredoAceito(quase, NOME, ambiente({ ESPELHO_SEGREDO: quase }))).toBeNull();
    const exato = "c".repeat(MIN_SEGREDO);
    expect(await segredoAceito(exato, NOME, ambiente({ ESPELHO_SEGREDO: exato }))).toBe("legado");
  });

  it("recebido curto → recusa, mesmo com o hash dele na lista", async () => {
    const curto = "c".repeat(MIN_SEGREDO - 1);
    expect(await segredoAceito(curto, NOME, ambiente({ [LISTA]: await hashHex(curto) }))).toBeNull();
    expect(await segredoAceito("abc", NOME, ambiente({ [LISTA]: await hashHex("abc"), ESPELHO_SEGREDO: "abc" }))).toBeNull();
  });

  it("recebido vazio, nulo ou ausente → recusa", async () => {
    const tudo = ambiente({ [LISTA]: HASH_NOVO, ESPELHO_SEGREDO: LEGADO });
    for (const vazio of ["", null, undefined]) expect(await segredoAceito(vazio, NOME, tudo)).toBeNull();
  });

  it("errado → recusa: 1 caractere trocado, a mais ou a menos (na lista e no legado)", async () => {
    const tudo = ambiente({ [LISTA]: HASH_NOVO, ESPELHO_SEGREDO: LEGADO });
    for (const valor of [NOVO, LEGADO]) {
      expect(await segredoAceito(`${valor.slice(0, -1)}x`, NOME, tudo)).toBeNull();
      expect(await segredoAceito(`${valor}x`, NOME, tudo)).toBeNull();
      expect(await segredoAceito(valor.slice(0, -1), NOME, tudo)).toBeNull();
      expect(await segredoAceito(` ${valor}`, NOME, tudo)).toBeNull();
    }
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

  it("lista vazia ou só com lixo, sem o legado → tudo recusa (falha fechada)", async () => {
    for (const lista of ["", " ", ",", "nada,de,hash"]) {
      expect(await segredoAceito(NOVO, NOME, ambiente({ [LISTA]: lista }))).toBeNull();
    }
  });

  it("a lista é a do nome pedido: o hash certo na lista de OUTRA finalidade não passa", async () => {
    const ler2 = ambiente({ SEGREDO_ESPELHO_RESUMO_ACEITOS: HASH_NOVO });
    expect(await segredoAceito(NOVO, NOME, ler2)).toBeNull();
    expect(await segredoAceito(NOVO, "SEGREDO_ESPELHO_RESUMO", ler2)).toBe("lista");
  });

  it("o valor do emissor no ambiente do receptor não abre nada: só a lista (e o legado) contam", async () => {
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
  it("com o SEGREDO_X (≥ 32) → ele, mesmo com o legado", () => {
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: NOVO, ESPELHO_SEGREDO: LEGADO }))).toBe(NOVO);
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: NOVO }))).toBe(NOVO);
  });

  it("sem o SEGREDO_X → o legado (até o F7)", () => {
    expect(segredoParaEnviar(NOME, ambiente({ ESPELHO_SEGREDO: LEGADO }))).toBe(LEGADO);
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: "", ESPELHO_SEGREDO: LEGADO }))).toBe(LEGADO);
  });

  it("SEGREDO_X curto conta como ausente: cai no legado; sem legado válido → \"\"", () => {
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: "curto", ESPELHO_SEGREDO: LEGADO }))).toBe(LEGADO);
    expect(segredoParaEnviar(NOME, ambiente({ [NOME]: "curto", ESPELHO_SEGREDO: "curto" }))).toBe("");
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
    const tudo = ambiente({ [LISTA]: `${HASH_NOVO},${HASH_ANTERIOR}`, ESPELHO_SEGREDO: LEGADO, [NOME]: NOVO });
    for (const valor of [NOVO, ANTERIOR, LEGADO, TERCEIRO, "curto", ""]) {
      expect(await doTreino.segredoAceito(valor, NOME, tudo)).toBe(await segredoAceito(valor, NOME, tudo));
    }
    expect(doTreino.segredoParaEnviar(NOME, tudo)).toBe(NOVO);
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
