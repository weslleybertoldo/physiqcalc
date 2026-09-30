import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ImageUp } from "lucide-react";
import { diarioNoPhysiq, enderecoDoDiario, normalizarCodigoDiario } from "@/nucleo/siteAntigoNutri";

/**
 * /p/:codigo — o "Link do paciente" antigo do Nutri (dava 404 — falha F1, R13) agora abre o diário do aluno (/d/:codigo, spec
 * 4.8 e 9). Enquanto a página nova do diário não existe no Physiq (W24), vai para o /d/ do site antigo, que funciona hoje.
 */
export default function LinkAntigo() {
  const { codigo = "" } = useParams();
  const c = normalizarCodigoDiario(codigo);
  const noPhysiq = diarioNoPhysiq();
  const destino = enderecoDoDiario(c);

  useEffect(() => {
    if (!noPhysiq) window.location.replace(destino);
  }, [noPhysiq, destino]);

  if (noPhysiq) return <Navigate to={`/d/${c}`} replace />;
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col items-center justify-center gap-3 px-6 text-center" data-link-antigo={c}>
      <ImageUp aria-hidden className="h-8 w-8 text-texto-3" strokeWidth={1.6} />
      <h1 className="font-body text-[18px] font-semibold normal-case tracking-[-0.02em] text-texto">Abrindo o seu diário…</h1>
      <p className="text-[13px] text-texto-2">
        Este link agora é o do diário alimentar.{" "}
        <a href={destino} className="font-semibold text-violeta-3" data-link-antigo-destino>
          Abrir o diário
        </a>
      </p>
    </div>
  );
}
