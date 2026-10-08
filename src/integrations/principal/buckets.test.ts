import { describe, it, expect } from "vitest";
import { bucketDoAmbiente } from "./buckets";

describe("hml-02b (H-14): bucketDoAmbiente", () => {
  it("produção usa o bucket de sempre", () => {
    expect(bucketDoAmbiente("anexos", "public")).toBe("anexos");
    expect(bucketDoAmbiente("diario", "public")).toBe("diario");
    expect(bucketDoAmbiente("evolucao", "public")).toBe("evolucao");
  });
  it("staging usa o -staging", () => {
    expect(bucketDoAmbiente("anexos", "staging")).toBe("anexos-staging");
    expect(bucketDoAmbiente("diario", "staging")).toBe("diario-staging");
    expect(bucketDoAmbiente("evolucao", "staging")).toBe("evolucao-staging");
  });
});
