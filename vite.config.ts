import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const UM_ANO = 60 * 60 * 24 * 365;

// Host direto do projeto Supabase: os GIFs do Storage gravados no banco (`imagem_url`) apontam
// pra cá mesmo quando o app fala com a API pelo domínio próprio (api.physiqcalc.com.br).
const SUPABASE_DIRETO = "https://uxwpwdbbnlticxgtzcsb.supabase.co";

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * As regras de cache do service worker precisam casar com a MESMA origem que o client usa
 * (`VITE_SUPABASE_URL`): Supabase direto ou o domínio próprio. Devolve uma RegExp que aceita
 * qualquer uma das origens conhecidas seguida do caminho pedido.
 */
function padraoApi(origens: string[], caminho: string): RegExp {
  const unicas = Array.from(new Set(origens.map((o) => new URL(o).origin)));
  return new RegExp("^(?:" + unicas.map(escaparRegex).join("|") + ")" + caminho);
}

/** O canal do build: "play" só com o valor exato do VITE_DISTRIBUICAO (a mesma regra do src/lib/distribuicao.ts); o resto é o site. */
function distribuicaoDoBuild(valor: string | undefined): "site" | "play" {
  return valor === "play" ? "play" : "site";
}

/**
 * W4 da loja: o canal do build marcado no index.html — `<meta name="physiq-distribuicao" content="play">` no `npm run build:loja`
 * e `content="site"` no resto. Vem do MESMO VITE_DISTRIBUICAO que o código lê (src/lib/distribuicao.ts: "play" só com o valor
 * exato). O CI confere a marca dentro do AAB da Google Play (scripts/ci/aab-loja.sh): o AAB só passa com o site da loja.
 */
function marcaDistribuicao(valor: string | undefined): Plugin {
  const distribuicao = distribuicaoDoBuild(valor);
  return {
    name: "physiq-distribuicao",
    transformIndexHtml: () => [{ tag: "meta", attrs: { name: "physiq-distribuicao", content: distribuicao }, injectTo: "head" }],
  };
}

/** Os 2 schemas do banco que o app conhece (src/integrations/supabase/client.ts e src/integrations/principal/client.ts). */
const SCHEMAS_DO_BANCO = ["public", "staging"];

/**
 * hml-10 (H-25) — build com banco exige o schema. O client.ts do Treino cai em "public" (produção) quando o VITE_DB_SCHEMA falta,
 * e a produção e o CI viviam desse padrão. Build com banco = VITE_SUPABASE_URL ou VITE_PRINCIPAL_URL preenchidos: aí o
 * VITE_DB_SCHEMA tem que ser exatamente "public" ou "staging" (sem espaço nem quebra de linha: o client usa o valor cru). Sem os
 * 2 (o preview de outra branch na Vercel, que não tem variável) o build segue. Falhar aqui é seguro: a Vercel fica no deploy
 * anterior e o CI não solta APK nem AAB. Só no `vite build` (o `vite dev`, o preview e o Vitest não passam por aqui).
 */
function exigirSchemaDoBanco(env: Record<string, string>): Plugin {
  return {
    name: "physiq-exige-schema",
    apply: "build",
    config() {
      const comBanco = ["VITE_SUPABASE_URL", "VITE_PRINCIPAL_URL"].filter((chave) => (env[chave] ?? "").trim() !== "");
      const schema = env.VITE_DB_SCHEMA ?? "";
      if (comBanco.length === 0 || SCHEMAS_DO_BANCO.includes(schema)) return;
      const recebido = schema === "" ? "está vazio (ou não existe)" : `veio ${JSON.stringify(schema.slice(0, 40))}`;
      const erro = new Error(
        [
          `[physiq] Build com banco sem o schema certo: o VITE_DB_SCHEMA ${recebido}.`,
          `  O build tem ${comBanco.join(" e ")}, então o VITE_DB_SCHEMA tem que ser "public" (produção) ou "staging".`,
          `  Sem ele o app cairia em "public" (produção) sem ninguém pedir (hml-10, H-25).`,
          `  Defina o VITE_DB_SCHEMA (Vercel, CI ou .env.local) e rode o build de novo.`,
        ].join("\n"),
      );
      // sem a pilha: é erro de configuração do build, não do código
      erro.stack = erro.message;
      throw erro;
    },
  };
}

// hml-16d (H-79) — o bundle nunca leva teste nem o Vitest. Na vite 6 a exclusão absoluta com ** do import.meta.glob deixou de valer
// (src/rotas/registro.ts): o build saiu com os *.test-*.js e com os testes dos globs eager DENTRO da entrada — tela preta ("Vitest
// failed to access its internal state"). Vale em todo `vite build` (site, staging, APK, loja). Falhar aqui é seguro: a Vercel fica no
// deploy anterior e o CI não solta APK nem AAB. (Comentário de linha de propósito: o padrão do glob tem "*" + "/" e fecharia um /** */.)
const TESTE_DO_APP = /\/src\/.+\.(test|spec)\.[cm]?[jt]sx?$/;
const DO_VITEST = /\/node_modules\/(vitest|@vitest)\//;
function semTesteNoBundle(): Plugin {
  return {
    name: "physiq-sem-teste-no-bundle",
    apply: "build",
    generateBundle(_opcoes, bundle) {
      const ruins: string[] = [];
      for (const saida of Object.values(bundle)) {
        if (saida.type !== "chunk") continue;
        const modulo = Object.keys(saida.modules).find((id) => (TESTE_DO_APP.test(id) && !id.includes("/node_modules/")) || DO_VITEST.test(id));
        if (modulo) ruins.push(`${saida.fileName} (${path.relative(process.cwd(), modulo)})`);
      }
      if (ruins.length > 0) {
        this.error(`[physiq] teste ou Vitest dentro do bundle (hml-16d): ${ruins.slice(0, 5).join("; ")}${ruins.length > 5 ? ` e mais ${ruins.length - 5}` : ""}`);
      }
    },
  };
}

/**
 * hml-10 (H-27) — o /health do site: o build grava health.json na raiz do dist/ (o vercel.json reescreve /health, /api/health e
 * /status para ele, sem cache). Só o que não é segredo (o repo é público): versão, commit, schema e canal do build. Nada de URL,
 * chave ou segredo. O service worker não o guarda (fora do precache) nem responde o index.html nesses caminhos (abaixo).
 * schema = null só no build sem banco ou sem o VITE_DB_SCHEMA (com banco, o exigirSchemaDoBanco já garantiu public|staging).
 */
function arquivoDeSaude(env: Record<string, string>): Plugin {
  return {
    name: "physiq-health",
    apply: "build",
    generateBundle() {
      const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "";
      const schema = env.VITE_DB_SCHEMA ?? "";
      const saude = {
        ok: true,
        app: "physiq",
        versao: String(pkg.version),
        commit: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : "local",
        schema: SCHEMAS_DO_BANCO.includes(schema) ? schema : null,
        distribuicao: distribuicaoDoBuild(env.VITE_DISTRIBUICAO),
        gerado_em: new Date().toISOString(),
      };
      // JSON compacto: o monitor do painel procura a palavra `"schema":"public"`
      this.emitFile({ type: "asset", fileName: "health.json", source: JSON.stringify(saude) + "\n" });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // URL da API que o client usa (mesma fonte do `import.meta.env.VITE_SUPABASE_URL`).
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const urlApi = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || SUPABASE_DIRETO;
  const origensApi = [urlApi, SUPABASE_DIRETO];
  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // Tailwind 4: a configuração mora no CSS (`@theme` em src/index.css), sem tailwind.config/postcss
    tailwindcss(),
    wasm(),
    exigirSchemaDoBanco(env),
    semTesteNoBundle(),
    marcaDistribuicao(env.VITE_DISTRIBUICAO),
    arquivoDeSaude(env),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // 6 MB: o wasm do SQLite (PowerSync) tem até 2,3 MB
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Precache = tudo que a abertura precisa, inclusive fontes locais e o wasm do SQLite
        // que o PowerSync usa de fato (IDBBatchAtomicVFS → wa-sqlite-async; as variantes
        // sync e `mc-*` cifradas ficam de fora) → 2ª abertura sem rede.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}", "**/wa-sqlite-async-*.wasm"],
        // WebP dos exercícios embutidos (public/exercicios, vários MB) ficam FORA do precache:
        // a 1ª visita web não pode pesar; entram no cache em runtime conforme o aluno abre
        // (rota abaixo). No APK são arquivos locais do bundle — nem passam pela rede.
        // O 3D dos exercícios (public/exercicios3d: boneco ~2,5 MB + movimentos + transcoder) segue a mesma regra.
        // hml-10 (H-27): o health.json também fica fora (o .json já não entra no globPatterns; aqui fica escrito): no precache ele
        // seria a cópia da instalação do service worker, velha a cada deploy.
        globIgnores: ["**/node_modules/**/*", "**/exercicios/**", "**/exercicios3d/**", "**/health.json"],
        // hml-10 (H-27): /health, /api/ e /status são do servidor (vercel.json → health.json); o service worker não pode responder
        // o index.html do app nesses caminhos. Nenhuma rota do app começa com eles (src/rotas).
        navigateFallbackDenylist: [/^\/~oauth/, /^\/health/, /^\/api\//, /^\/status/],
        runtimeCaching: [
          {
            // 3D dos exercícios (boneco, movimentos, fotos; nome com a versão → imutável) — o transcoder também
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/exercicios3d/"),
            handler: "CacheFirst",
            options: {
              cacheName: "exercicios3d-local-cache",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // WebP dos exercícios servidos pela própria origem (nome do arquivo leva a versão → imutável)
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/exercicios/"),
            handler: "CacheFirst",
            options: {
              cacheName: "exercicios-local-cache",
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 180,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            // Supabase REST API — NetworkFirst com fallback ao cache
            urlPattern: padraoApi(origensApi, "/rest/v1/.*"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                // Apenas 200 — status 0 (opaque/CORS-blocked) pode poisonar cache
                statuses: [200],
              },
            },
          },
          {
            // Supabase Auth — nunca cachear
            urlPattern: padraoApi(origensApi, "/auth/.*"),
            handler: "NetworkOnly",
          },
          {
            // GIFs/WebP dos exercícios (Storage público) — CacheFirst longo. A URL muda (?v=)
            // quando o GIF muda, então cache "pra sempre" é seguro. O <img> pede com
            // crossorigin=anonymous → resposta CORS (200), sem o padding de resposta opaca.
            urlPattern: padraoApi(origensApi, "/storage/v1/object/public/exercicios(-staging)?/"),
            handler: "CacheFirst",
            options: {
              cacheName: "exercicios-cache",
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 180,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            // wasm com hash no nome (SQLite) que ficou fora do precache — imutável
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-cache",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: UM_ANO,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            // Imagens externas — CacheFirst (aceita query string, ex.: ?v=123)
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)(\?.*)?$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      manifest: {
        name: "Physiq",
        short_name: "Physiq",
        description: "App focado em saúde e performance",
        start_url: "/",
        display: "standalone",
        background_color: "#09090B",
        theme_color: "#09090B",
        orientation: "portrait",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@journeyapps/wa-sqlite", "@powersync/web"],
    include: [],
  },
  build: {
    rollupOptions: {
      output: {
        // Função (não objeto): o objeto puxava dependências COMPARTILHADAS pro chunk manual —
        // o `clsx` (usado pelo `cn()` do app e pelo recharts) foi parar dentro de `charts`, e a
        // entrada passou a pré-carregar os 373 KB do recharts só por causa dele. Com a função,
        // cada chunk nomeado recebe SÓ os arquivos daquela lib; o resto o Rollup agrupa sozinho
        // por quem usa (o que só a rota lazy usa vai junto com ela).
        manualChunks(id: string) {
          if (!id.includes("node_modules/")) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run\/router)\//.test(id)) return "react-vendor";
          // utilitários minúsculos usados pela abertura E por libs pesadas (ex.: clsx = cva + recharts):
          // soltos, o Rollup os funde no chunk pesado e a entrada passa a pré-carregá-lo inteiro
          if (/node_modules\/(clsx|class-variance-authority|tailwind-merge|react-is|prop-types|tslib|tiny-invariant)\//.test(id)) return "react-vendor";
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (id.includes("node_modules/@powersync/")) return "powersync";
          // API do wa-sqlite vai junto; as variantes que carregam o wasm (sync/async/mc-*) ficam
          // como chunks dinâmicos — só a que o PowerSync usa é baixada
          if (id.includes("node_modules/@journeyapps/wa-sqlite/") && !/\/dist\/(mc-)?wa-sqlite(-async)?\.mjs/.test(id)) return "powersync";
          if (id.includes("node_modules/recharts/")) return "charts";
          if (/node_modules\/(jspdf|jspdf-autotable|html2canvas)\//.test(id)) return "pdf";
          if (id.includes("node_modules/xlsx/")) return "xlsx";
          if (/node_modules\/@radix-ui\/react-(dialog|dropdown-menu|select|tabs|toast)\//.test(id)) return "radix";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  };
});
