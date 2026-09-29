import { Suspense, type ReactNode } from "react";
import { EstadoCarregando } from "@/ui/premium/Estados";
import { LimiteDeErro } from "./LimiteDeErro";

/** Tela/aba/card registrado (carregado sob demanda): esqueleto enquanto chega e erro no lugar se quebrar. */
export function Carregavel({ children, esqueleto, nome }: { children: ReactNode; esqueleto?: ReactNode; nome?: string }) {
  return (
    <LimiteDeErro nome={nome}>
      <Suspense fallback={esqueleto ?? <EstadoCarregando />}>{children}</Suspense>
    </LimiteDeErro>
  );
}
