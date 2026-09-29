import { lazy } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import AdminLayout from "@/layouts/AdminLayout";
import { Carregavel } from "@/ui/casca/Carregavel";
import type { SubAbaAntiga } from "./catalogoAbas";

// "Configurar aluno" antigo do Calc (grupos por `?ct=`); some na W28, quando todas as abas novas existirem
const AdminUserConfig = lazy(() => import("@/components/AdminUserConfig"));

/**
 * Fallback de uma aba do perfil do aluno: o "Configurar aluno" antigo aberto no grupo da aba. A
 * navegação de grupos dele fica escondida (legado.css) e as sub-abas daqui trocam o `?ct=`.
 */
export function FallbackConfigurar({ alunoId, opcoes }: { alunoId: string; opcoes: SubAbaAntiga[] }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const ct = params.get("ct");
  if (!opcoes.some((o) => o.ct === ct)) {
    const q = new URLSearchParams(params);
    q.set("ct", opcoes[0].ct);
    return <Navigate to={{ search: `?${q.toString()}` }} replace />;
  }
  return (
    <div data-fallback-aluno>
      {opcoes.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Partes da aba">
          {opcoes.map((o) => (
            <button
              key={o.ct}
              type="button"
              role="tab"
              aria-selected={o.ct === ct}
              data-sub-aba={o.ct}
              onClick={() =>
                setParams(
                  (anterior) => {
                    const q = new URLSearchParams(anterior);
                    q.set("ct", o.ct);
                    return q;
                  },
                  { replace: true },
                )
              }
              className={cn("pq-chip h-8 cursor-pointer px-3.5 text-[12px] tracking-[0.02em]", o.ct === ct ? "pq-chip-t" : "pq-chip-g")}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
      <AdminLayout>
        <Carregavel nome="Configurar aluno (antigo)">
          <AdminUserConfig userId={alunoId} onBack={() => navigate("/painel/alunos")} />
        </Carregavel>
      </AdminLayout>
    </div>
  );
}
