import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // O CI roda os testes SEM .env (e o do dev tem as chaves reais): variáveis de teste fixas, iguais em qualquer máquina.
    // Os clientes do Supabase nascem apontando para endereços inválidos — nenhum teste vai à rede (tudo é mockado).
    // Sem isto, as travas e a casca carregadas junto pelo registro (W3) quebram na importação do cliente do Treino.
    env: {
      VITE_SUPABASE_URL: "https://treino.teste.invalid",
      VITE_SUPABASE_ANON_KEY: "anon-de-teste",
      VITE_DB_SCHEMA: "staging",
      VITE_PRINCIPAL_URL: "https://principal.teste.invalid",
      VITE_PRINCIPAL_ANON_KEY: "anon-principal-de-teste",
      VITE_PRINCIPAL_SCHEMA: "staging",
    },
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
