import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { abaDaRota, abaDeAbertura, abasVisiveis } from "@/app-aluno/catalogoAbas";
import { existe, listar } from "@/rotas/registro";
import { destinoDaRotaAntiga } from "@/rotas/redirecionamentos";
import { destinoDepoisDoLogin } from "@/nucleo/situacao";

const raiz = resolve(__dirname, "../../..");

describe("W12 — a aba Início entra pelo registro e vira a tela de abertura (tela 1)", () => {
  it("src/app-aluno/abas/Inicio.tsx está registrada; as 5 abas por tipo de aluno (spec 4.3)", () => {
    expect(existe("abasApp", "Inicio")).toBe(true);
    expect(abasVisiveis(["treino", "nutricao"]).map((a) => a.rotulo)).toEqual(["Início", "Treino", "Dieta", "Evolução", "Perfil"]);
    expect(abasVisiveis(["treino"]).map((a) => a.rotulo)).toEqual(["Início", "Treino", "Evolução", "Perfil"]);
    expect(abasVisiveis(["nutricao"]).map((a) => a.rotulo)).toEqual(["Início", "Dieta", "Evolução", "Perfil"]);
  });

  it("o Início é a abertura de todo aluno (depois do login e ao abrir o APK: '/')", () => {
    for (const m of [["treino"], ["nutricao"], ["treino", "nutricao"]] as const) expect(abaDeAbertura([...m])?.id).toBe("inicio");
    expect(abaDaRota("/")).toBe("inicio");
    expect(destinoDepoisDoLogin({ sem_nada: false } as never, null)).toBe("/");
    // os links de antes continuam: /app do Nutri e as abas do Calc
    expect(destinoDaRotaAntiga("/app", "")).toBe("/");
    expect(destinoDaRotaAntiga("/treinos", "")).toBe("/treino");
    expect(destinoDaRotaAntiga("/avaliacao", "")).toBe("/evolucao");
    expect(destinoDaRotaAntiga("/app/plano", "")).toBe("/dieta");
    expect(destinoDaRotaAntiga("/pagamentos", "")).toBe("/perfil/pagamentos");
  });

  it("os 5 cards da tela 1 estão registrados em src/app-aluno/inicio (as peças ficam na subpasta, fora do registro)", () => {
    const nomes = listar("inicioApp").map((i) => i.nome).sort();
    expect(nomes).toEqual(["CardDietaHoje", "CardMetasHoje", "CardPeso", "CardProximaConsulta", "CardTreinoHoje"]);
  });

  it("a faixa 'Escolha um treino pronto' (W7b) saiu: o card do treino de hoje é que oferece o treino pronto", () => {
    expect(existe("avisosApp", "SugestaoTreinoPronto")).toBe(false);
    expect(existsSync(resolve(raiz, "src/app-aluno/avisos/SugestaoTreinoPronto.tsx"))).toBe(false);
    expect(existe("avisosApp", "FaixaMensalidade")).toBe(true);
    const card = readFileSync(resolve(raiz, "src/app-aluno/inicio/CardTreinoHoje.tsx"), "utf-8");
    expect(card).toContain('navigate("/perfil/treinos-prontos")');
  });

  it("o card do treino lê a MESMA fonte da aba Treino (useTreinoDoDia) e o do peso a da Evolução (src/evolucao) — sem consulta nova", () => {
    const treino = readFileSync(resolve(raiz, "src/app-aluno/inicio/CardTreinoHoje.tsx"), "utf-8");
    expect(treino).toContain('from "@/treino/useTreinoDoDia"');
    expect(treino).not.toMatch(/useQuery\(\s*["'`]SELECT/);
    const peso = readFileSync(resolve(raiz, "src/app-aluno/inicio/CardPeso.tsx"), "utf-8");
    expect(peso).toContain('from "@/evolucao/useEvolucaoDoAluno"');
    for (const c of ["CardDietaHoje", "CardMetasHoje"]) {
      expect(readFileSync(resolve(raiz, `src/app-aluno/inicio/${c}.tsx`), "utf-8")).toContain('from "@/nutricao/app/useDieta"');
    }
  });
});
