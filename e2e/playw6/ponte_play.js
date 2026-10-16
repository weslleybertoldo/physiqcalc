// Physiq play-W6 (E2E) — o plugin da cobrança da Google Play DE MENTIRA, por cima da ponte Android da H2 (e2e/h2/ponte_android.js, que
// faz o @capacitor/core achar que está no APK): o cabeçalho "PlayBilling" entra no Capacitor.PluginHeaders (o que o AAB de verdade injeta
// pelo PlataformaLoja do playRelease) e as chamadas dele respondem como a Play Billing Library responderia. O preço vem DAQUI (o da "Play"
// do teste — de propósito diferente do preço do banco, para provar que a loja mostra SÓ o preço da Play). A compra vai ao simulador da Play
// pelo window.__playSim (o Playwright expõe: cria a compra no e2e/playw6/simulador_play.py e devolve o token — o servidor confere no
// simulador como conferiria no Google). Nada disto vai para o app: é só do teste. Ordem: depois da ponte da H2 (add_init_script).
(() => {
  const C = window.Capacitor;
  if (!C || !Array.isArray(C.PluginHeaders) || typeof C.nativePromise !== "function") return;
  const cfg = Object.assign(
    {
      disponivel: true,
      precos: { app_treino: ["R$ 31,90", 31900000], app_treino_alimentacao: ["R$ 51,90", 51900000] },
      nomes: { app_treino: "Treino", app_treino_alimentacao: "Treino + Alimentação" },
    },
    window.__PLAY_CFG || {},
  );
  const chamadas = [];
  const metodos = ["disponivel", "produtos", "comprar", "compras", "gerenciar"];
  C.PluginHeaders.push({
    name: "PlayBilling",
    methods: [
      ...metodos.map((m) => ({ name: m, rtype: "promise" })),
      { name: "addListener", rtype: "callback" },
      { name: "removeListener", rtype: "promise" },
      { name: "removeAllListeners", rtype: "promise" },
    ],
  });

  // o ProductDetails do plano básico "mensal" (sem oferta extra): 1 fase, P1M, renova sem fim
  const produto = (id) => ({
    id,
    nome: cfg.nomes[id],
    titulo: `${cfg.nomes[id]} (Physiq)`,
    ofertas: [{
      planoBase: "mensal",
      oferta: null,
      token: `oferta-e2e-${id}`,
      tags: [],
      fases: [{ precoFormatado: cfg.precos[id][0], precoMicros: cfg.precos[id][1], moeda: "BRL", periodo: "P1M", ciclos: 0, recorrencia: 1 }],
    }],
  });
  const sim = (acao, dados) =>
    typeof window.__playSim === "function" ? window.__playSim(acao, dados || {}) : Promise.resolve({ resultado: "erro", codigo: 3 });

  const R = {
    disponivel: () => ({ disponivel: !!cfg.disponivel }),
    produtos: (o) => {
      const ids = (o && o.ids) || [];
      return { produtos: ids.filter((i) => cfg.precos[i]).map(produto), naoAchados: ids.filter((i) => !cfg.precos[i]) };
    },
    comprar: (o) => sim("comprar", o),
    compras: () => sim("compras", {}),
    gerenciar: () => undefined,
  };

  const original = C.nativePromise.bind(C);
  C.nativePromise = (plugin, metodo, opcoes) => {
    if (plugin !== "PlayBilling" || !R[metodo]) return original(plugin, metodo, opcoes);
    // só o nome do método e o produto ficam gravados (a matrícula opaca e o token, não)
    chamadas.push({ metodo, produto: (opcoes && opcoes.produto) || null, modo: (opcoes && opcoes.modo) || null, troca: !!(opcoes && opcoes.tokenAntigo) });
    try {
      return Promise.resolve(R[metodo](opcoes));
    } catch (e) {
      return Promise.reject(e);
    }
  };
  window.__play = { chamadas, cfg };
})();
