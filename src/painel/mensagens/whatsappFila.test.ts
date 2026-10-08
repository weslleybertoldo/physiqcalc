import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reservarFila, type DbFila, type MensagemFila } from "../../../supabase-principal/functions/_shared/whatsapp-fila";

// Homologação hml-06 (H-20) — a fila do WhatsApp (mensagens REAIS a pacientes) sai por reserva com troca condicional: cada saída
// soma 1 em tentativas (o whatsapp_destravar_fila desiste na 3ª) e 2 'tarefas' juntas não pegam a mesma mensagem.

interface Troca { tabela: string; campos: Record<string, unknown>; filtros: Array<[string, unknown]>; colunas?: string }

/** db falso: anota cada troca; `perde` = ids que outra chamada já levou (0 linhas), `falha` = erro do banco. */
function dbFalso(opcoes: { perde?: string[]; falha?: string } = {}) {
  const trocas: Troca[] = [];
  const db: DbFila = {
    from(tabela) {
      return {
        update(campos) {
          const t: Troca = { tabela, campos, filtros: [] };
          trocas.push(t);
          const filtro = {
            eq(coluna: string, valor: string | number) {
              t.filtros.push([coluna, valor]);
              return filtro;
            },
            select(colunas: string) {
              t.colunas = colunas;
              return {
                maybeSingle: async () => {
                  const id = String(t.filtros.find(([c]) => c === "id")?.[1]);
                  if (opcoes.falha === id) return { data: null, error: { message: "banco fora" } };
                  if (opcoes.perde?.includes(id)) return { data: null, error: null };
                  return { data: { ...MSGS.find((m) => m.id === id), ...campos }, error: null };
                },
              };
            },
          };
          return filtro;
        },
      };
    },
  };
  return { db, trocas };
}

const MSGS: MensagemFila[] = [
  { id: "m1", nutricionista_id: "n1", destino_e164: "+5582999990001", texto: "Lembrete da consulta", tentativas: 0, tipo: "lembrete" },
  { id: "m2", nutricionista_id: "n1", destino_e164: "+5582999990002", texto: "Lembrete da consulta", tentativas: 2, tipo: "lembrete" },
];

describe("hml-06: reservarFila (troca condicional)", () => {
  it("2 mensagens e a 2ª perde a troca (outra chamada levou) → devolve só a 1ª", async () => {
    const { db, trocas } = dbFalso({ perde: ["m2"] });
    const fila = await reservarFila(db, MSGS);
    expect(fila.map((m) => m.id)).toEqual(["m1"]);
    expect(trocas).toHaveLength(2);
  });

  it("tentativas soma 1 a cada saída (0 → 1; 2 → 3) e marca 'enviando'", async () => {
    const { db, trocas } = dbFalso();
    const fila = await reservarFila(db, MSGS);
    expect(trocas.map((t) => t.campos)).toEqual([{ status: "enviando", tentativas: 1 }, { status: "enviando", tentativas: 3 }]);
    expect(fila.map((m) => [m.id, m.tentativas, m.destino_e164])).toEqual([["m1", 1, "+5582999990001"], ["m2", 3, "+5582999990002"]]);
  });

  it("filtros da troca: o id, status = pendente e tentativas = a lida (nada de update em lote sem filtro de status)", async () => {
    const { db, trocas } = dbFalso();
    await reservarFila(db, MSGS);
    expect(trocas.map((t) => t.tabela)).toEqual(["mensagens_whatsapp", "mensagens_whatsapp"]);
    expect(trocas[0].filtros).toEqual([["id", "m1"], ["status", "pendente"], ["tentativas", 0]]);
    expect(trocas[1].filtros).toEqual([["id", "m2"], ["status", "pendente"], ["tentativas", 2]]);
    expect(trocas[0].colunas).toBe("id, nutricionista_id, destino_e164, texto, tentativas, tipo");
  });

  it("fila vazia não toca no banco; erro do banco sobe (a função devolve 500 e nada vai ao celular)", async () => {
    const vazio = dbFalso();
    expect(await reservarFila(vazio.db, [])).toEqual([]);
    expect(vazio.trocas).toHaveLength(0);
    const fora = dbFalso({ falha: "m1" });
    await expect(reservarFila(fora.db, MSGS)).rejects.toEqual({ message: "banco fora" });
  });
});

describe("hml-06: o whatsapp-agente usa a reserva (contrato do código — a função roda no Deno)", () => {
  const fonte = readFileSync(resolve(__dirname, "../../../supabase-principal/functions/whatsapp-agente/index.ts"), "utf-8");
  it("tarefas reserva pela reservarFila e não grava mais tentativas fixo nem em lote", () => {
    const tarefas = fonte.slice(fonte.indexOf('if (acao === "tarefas")'), fonte.indexOf("const instanciaId"));
    expect(tarefas).toContain("fila = await reservarFila(db, (msgs ?? []) as MensagemFila[]);");
    expect(tarefas).not.toMatch(/tentativas: 1\b/);
    expect(tarefas).not.toMatch(/\.from\("mensagens_whatsapp"\)\s*\.update\(/);
  });
});
