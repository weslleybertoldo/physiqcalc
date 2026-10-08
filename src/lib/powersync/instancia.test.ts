import { describe, expect, it } from "vitest";
import { INSTANCIA_PRODUCAO, instanciaPowerSync } from "./instancia";

describe("instanciaPowerSync", () => {
  it("produção (build com schema public) usa a instância de produção", () => {
    expect(instanciaPowerSync({ PROD: true }, "public")).toBe(INSTANCIA_PRODUCAO);
  });

  it("build de staging sem instância própria fica sem PowerSync", () => {
    expect(instanciaPowerSync({ PROD: true }, "staging")).toBe("");
    expect(instanciaPowerSync({ PROD: true, VITE_POWERSYNC_URL: "  " }, "staging")).toBe("");
  });

  it("VITE_POWERSYNC_URL manda em qualquer build", () => {
    expect(instanciaPowerSync({ PROD: true, VITE_POWERSYNC_URL: "https://stg.powersync.journeyapps.com" }, "staging"))
      .toBe("https://stg.powersync.journeyapps.com");
    expect(instanciaPowerSync({ PROD: true, VITE_POWERSYNC_URL: "https://outra.powersync.journeyapps.com" }, "public"))
      .toBe("https://outra.powersync.journeyapps.com");
  });

  it("vite dev local (não PROD) continua como antes", () => {
    expect(instanciaPowerSync({ PROD: false }, "staging")).toBe(INSTANCIA_PRODUCAO);
    expect(instanciaPowerSync({}, "public")).toBe(INSTANCIA_PRODUCAO);
  });
});
