import { createRoot } from "react-dom/client";
import { setupGlobalErrorHandlers } from "@/lib/globalErrorHandler";
import App from "./App.tsx";
import "./index.css";

setupGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
