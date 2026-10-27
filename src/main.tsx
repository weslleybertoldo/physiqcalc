import { createRoot } from "react-dom/client";
import { setupGlobalErrorHandlers } from "@/lib/globalErrorHandler";
import { capturarOrigemNutri } from "@/lib/origemNutri";
import { registrarServiceWorker } from "@/lib/registroDoServiceWorker";
import App from "./App.tsx";
import "./index.css";

setupGlobalErrorHandlers();

// T4: o service worker SÓ do site, com catch (antes era o registerSW.js que o vite-plugin-pwa punha no index.html, sem catch). No build do
// app (VITE_APP_NATIVO=1: o APK e o AAB) esta linha e o registro inteiro saem do bundle; o build feito à mão cai no Capacitor.isNativePlatform().
if (import.meta.env.VITE_APP_NATIVO !== "1") void registrarServiceWorker();

// W28: quem chega do site antigo do Nutri (o 308 de nutri.physiqcalc.com.br traz ?origem=nutri) — a marca vai para a sessão e o
// parâmetro sai da URL ANTES do React Router ler a barra de endereço (o Master › Contas lê ?origem= como filtro)
capturarOrigemNutri();

createRoot(document.getElementById("root")!).render(<App />);
