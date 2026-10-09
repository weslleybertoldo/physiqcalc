import "@testing-library/jest-dom";

// hml-14: os testes com `// @vitest-environment node` (AbortSignal.timeout/any do Node, que o jsdom não tem) não têm `window`.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
