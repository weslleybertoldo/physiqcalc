import { describe, expect, it } from "vitest";
import { codigosDaBusca } from "./equivalenciaBusca";

describe("codigosDaBusca (hml-14d — rótulos de movimento/equipamento → chaves do banco)", () => {
  it("termo vazio, só espaços ou nulo → nenhuma chave", () => {
    expect(codigosDaBusca("")).toEqual([]);
    expect(codigosDaBusca("   ")).toEqual([]);
    expect(codigosDaBusca(null)).toEqual([]);
    expect(codigosDaBusca(undefined)).toEqual([]);
  });

  it("parte do rótulo do movimento → as chaves dos movimentos", () => {
    expect(codigosDaBusca("supino")).toEqual(["supino_reto", "supino_inclinado", "supino_declinado"]);
    expect(codigosDaBusca("rosca")).toEqual(["rosca_direta", "rosca_scott", "rosca_martelo", "rosca_punho"]);
  });

  it("sem acento e sem maiúsculas casa com o rótulo acentuado", () => {
    expect(codigosDaBusca("MAQUINA")).toEqual(["maquina"]);
    expect(codigosDaBusca("elevacao")).toEqual(["elevacao_lateral", "elevacao_frontal", "elevacao_pelvica"]);
    expect(codigosDaBusca("Elevação")).toEqual(codigosDaBusca("elevacao"));
    expect(codigosDaBusca("triceps")).toEqual(["triceps_frances", "triceps_extensao"]);
  });

  it("o rótulo do equipamento vale (\"cabo\" → polia), e movimento vem antes de equipamento", () => {
    expect(codigosDaBusca("cabo")).toEqual(["polia"]);
    expect(codigosDaBusca("barra")).toEqual(["puxada_vertical", "barra"]);
  });

  it("chave que existe nas 2 listas (cardio) sai uma vez só; nada casa → vazio", () => {
    expect(codigosDaBusca("cardio")).toEqual(["cardio"]);
    expect(codigosDaBusca("xyz")).toEqual([]);
  });

  it("espaços sobrando no termo não atrapalham", () => {
    expect(codigosDaBusca("  peso   corporal ")).toEqual(["peso_corporal"]);
  });
});
