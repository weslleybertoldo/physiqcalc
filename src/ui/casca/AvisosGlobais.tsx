import { Suspense } from "react";
import { registro } from "@/rotas/registro";
import { LimiteDeErro } from "./LimiteDeErro";

/**
 * Janelas globais registradas em src/ui/avisos/<Aviso>.tsx (ex.: "o Physiq mudou", W3). A casca
 * monta todas depois do login, em qualquer área; cada uma decide sozinha se aparece.
 */
export function AvisosGlobais() {
  const avisos = Object.values(registro.avisosGlobais);
  if (avisos.length === 0) return null;
  return (
    <>
      {avisos.map(({ nome, Componente }) => (
        <LimiteDeErro key={nome} silencioso nome={`aviso ${nome}`}>
          <Suspense fallback={null}>
            <Componente />
          </Suspense>
        </LimiteDeErro>
      ))}
    </>
  );
}
