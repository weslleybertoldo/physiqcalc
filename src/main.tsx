import { createRoot } from "react-dom/client";
import { setupGlobalErrorHandlers } from "@/lib/globalErrorHandler";
import { capturarOrigemNutri } from "@/lib/origemNutri";
import App from "./App.tsx";
import "./index.css";

setupGlobalErrorHandlers();

// W28: quem chega do site antigo do Nutri (o 308 de nutri.physiqcalc.com.br traz ?origem=nutri) — a marca vai para a sessão e o
// parâmetro sai da URL ANTES do React Router ler a barra de endereço (o Master › Contas lê ?origem= como filtro)
capturarOrigemNutri();

createRoot(document.getElementById("root")!).render(<App />);
