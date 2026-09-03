import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import wasm from "vite-plugin-wasm";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const UM_ANO = 60 * 60 * 24 * 365;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
    wasm(),
    mode === "development" && componentTagger(),
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
        globIgnores: ["**/node_modules/**/*", "**/exercicios/**"],
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
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
            urlPattern: /^https:\/\/uxwpwdbbnlticxgtzcsb\.supabase\.co\/rest\/v1\/.*/,
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
            urlPattern: /^https:\/\/uxwpwdbbnlticxgtzcsb\.supabase\.co\/auth\/.*/,
            handler: "NetworkOnly",
          },
          {
            // GIFs/WebP dos exercícios (Storage público) — CacheFirst longo. A URL muda (?v=)
            // quando o GIF muda, então cache "pra sempre" é seguro. O <img> pede com
            // crossorigin=anonymous → resposta CORS (200), sem o padding de resposta opaca.
            urlPattern: /^https:\/\/uxwpwdbbnlticxgtzcsb\.supabase\.co\/storage\/v1\/object\/public\/exercicios(-staging)?\//,
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
        name: "PhysiqCalc",
        short_name: "PhysiqCalc",
        description: "Calculadora de composição corporal para atletas",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: "#f59e0b",
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
}));
