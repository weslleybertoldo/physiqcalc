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
        manualChunks: {
          "powersync": ["@powersync/web", "@powersync/react", "@journeyapps/wa-sqlite"],
          "supabase": ["@supabase/supabase-js"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "charts": ["recharts"],
          "pdf": ["jspdf", "html2canvas"],
          "xlsx": ["xlsx"],
          "radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
