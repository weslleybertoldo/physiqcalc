import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, Inbox, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { EstadoVazio } from "@/ui/premium/Estados";
import type { FormularioPreconsulta } from "@/painel/preconsulta/dados";
import FormularioDialog from "@/painel/preconsulta/FormularioDialog";
import Formularios from "@/painel/preconsulta/Formularios";
import Respostas from "@/painel/preconsulta/Respostas";
import ResumoPreConsulta from "@/painel/preconsulta/ResumoPreConsulta";
import { ehNova } from "@/painel/preconsulta/respostasUtil";
import { useContextoPreConsulta, useDadosPreConsulta } from "@/painel/preconsulta/usePreConsulta";

type IdAba = "formularios" | "respostas";
const ABAS: { id: IdAba; rotulo: string; icone: LucideIcon }[] = [
  { id: "formularios", rotulo: "Formulários", icone: ClipboardList },
  { id: "respostas", rotulo: "Respostas", icone: Inbox },
];

/**
 * Painel › Pré-consulta (W21 — spec 4.4, telas 6 e 7; N-7, N-12, N-13, N-55, R7): comum aos 2 módulos (o personal ganha a pré-consulta).
 * Formulários (a partir de um modelo de anamnese ou de um questionário de saúde — da nutricionista — ou em branco, com o link público
 * /f/<slug> no domínio do Physiq) e Respostas (a caixa de entrada: ligar a um aluno; importar para a anamnese/questionário — só a
 * nutricionista com Nutrição). O número do menu são as respostas novas (sem aluno ligado). As MESMAS tabelas do site antigo do Nutri.
 * Estado na URL: ?aba=respostas (o /respostas-pre-consulta antigo chega assim), &formulario=, &q=, &sem=1 (novas) e &aluno=<id>.
 */
export default function PreConsulta() {
  const ctx = useContextoPreConsulta();
  const d = useDadosPreConsulta(ctx);
  const [sp, setSp] = useSearchParams();
  const aba: IdAba = sp.get("aba") === "respostas" ? "respostas" : "formularios";
  const [modal, setModal] = useState<{ aberto: boolean; formulario: FormularioPreconsulta | null }>({ aberto: false, formulario: null });
  const novas = d.respostas.filter(ehNova).length;

  const irPara = (id: IdAba, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(id === "respostas" ? extra : {});
    q.set("aba", id);
    setSp(q, { replace: false });
  };

  if (!ctx.conta) {
    return (
      <div data-pagina-preconsulta-painel data-estado="sem-conta">
        <TopoPagina titulo="Pré-consulta" />
        <EstadoVazio icone={ClipboardList} titulo="Nenhuma conta ativa" texto="A pré-consulta aparece aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }
  const subtitulo = `${ctx.conta.nome}${!ctx.dono ? " · o que é seu" : ctx.conta.profissionais > 1 ? " · toda a equipe" : ""}`;

  return (
    <div className="flex flex-col" data-pagina-preconsulta-painel data-aba-preconsulta={aba} data-dono={ctx.dono ? "1" : "0"} data-nutri={ctx.souNutri ? "1" : "0"}>
      <TopoPagina titulo="Pré-consulta" subtitulo={<span data-subtitulo-preconsulta>{subtitulo}</span>}
        acoes={<Botao variante="w" icone={Plus} onClick={() => setModal({ aberto: true, formulario: null })} disabled={!ctx.pronto} data-btn-novo-formulario>Novo formulário</Botao>} />

      <ResumoPreConsulta ctx={ctx} d={d} />

      <nav aria-label="Abas da pré-consulta" data-abas-preconsulta className="pq-sem-barra mt-5 flex gap-1 overflow-x-auto border-b border-linha">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          const Icone = a.icone;
          return (
            <button key={a.id} type="button" role="tab" aria-selected={ativa} onClick={() => irPara(a.id)} data-aba-preconsulta-botao={a.id}
              className={cn("relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors", ativa ? "text-texto" : "text-texto-3 hover:text-texto-2")}>
              <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              {a.rotulo}
              {a.id === "respostas" && novas > 0 && (
                <span className="rounded-full bg-ambar/20 px-1.5 text-[11px] font-bold text-ambar-3" data-contador-novas>{novas}</span>
              )}
              {ativa && (
                <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                  style={{ background: "linear-gradient(90deg,var(--p-violeta-2),var(--p-verde-2))", boxShadow: "0 0 12px rgba(167,139,250,.9)" }} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 min-w-0">
        {aba === "formularios" ? (
          <Formularios ctx={ctx} d={d} aoNovo={() => setModal({ aberto: true, formulario: null })} aoEditar={(f) => setModal({ aberto: true, formulario: f })}
            aoVerRespostas={(titulo) => irPara("respostas", { formulario: titulo })} />
        ) : (
          <Respostas ctx={ctx} d={d} params={sp} setParams={setSp} />
        )}
      </div>

      <FormularioDialog open={modal.aberto} onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))} formulario={modal.formulario} uid={ctx.uid} contaId={ctx.contaId}
        souNutri={ctx.souNutri} modelos={d.modelos} questionarios={d.questionarios} onSalvo={() => void d.recarregar("formularios")} />
    </div>
  );
}
