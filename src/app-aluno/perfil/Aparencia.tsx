import { Check, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTema, type Tema } from "@/ui/tema/useTema";
import { CLASSE_PAGINA_APP, TopoItem } from "./pecas/TopoItem";

const OPCOES: { valor: Tema; rotulo: string; texto: string; icone: typeof Moon }[] = [
  { valor: "escuro", rotulo: "Escuro", texto: "O padrão do Physiq", icone: Moon },
  { valor: "claro", rotulo: "Claro", texto: "Fundo claro, as mesmas cores", icone: Sun },
];

/** Miniatura do tema (o fundo, um cartão e as cores de Treino e Nutrição). */
function Amostra({ tema }: { tema: Tema }) {
  const escuro = tema === "escuro";
  return (
    <span aria-hidden className="flex h-[76px] w-full flex-col gap-1.5 rounded-[14px] border p-2"
      style={{ background: escuro ? "#09090B" : "#FAFAFA", borderColor: escuro ? "rgba(255,255,255,.12)" : "rgba(9,9,11,.12)" }}>
      <span className="h-2 w-1/2 rounded-full" style={{ background: escuro ? "#FAFAFA" : "#09090B", opacity: 0.85 }} />
      <span className="flex flex-1 items-end gap-1.5 rounded-[10px] p-1.5"
        style={{ background: escuro ? "rgba(255,255,255,.06)" : "rgba(9,9,11,.05)", border: `1px solid ${escuro ? "rgba(255,255,255,.08)" : "rgba(9,9,11,.08)"}` }}>
        <span className="h-2.5 w-7 rounded-full" style={{ background: "#8B5CF6" }} />
        <span className="h-2.5 w-7 rounded-full" style={{ background: "#10B981" }} />
      </span>
    </span>
  );
}

/** Perfil › Aparência (P21): Escuro (padrão) ou Claro. A escolha fica no aparelho (a mesma do painel, chave physiq_tema). */
export default function Aparencia() {
  const { tema, definirTema } = useTema();
  return (
    <div data-pagina-aparencia={tema} className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Aparência" />
      <p className="-mt-1 px-0.5 text-[13px] text-texto-2">O escuro é o padrão do Physiq. A escolha vale neste aparelho.</p>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-2.5">
        {OPCOES.map((o) => {
          const ativo = o.valor === tema;
          return (
            <button key={o.valor} type="button" role="radio" aria-checked={ativo} onClick={() => definirTema(o.valor)} data-tema-opcao={o.valor}
              className={cn("pq-cartao flex flex-col gap-2.5 p-3 text-left transition-colors", ativo && "pq-brilho")}>
              <Amostra tema={o.valor} />
              <span className="flex items-center gap-2">
                <o.icone aria-hidden className="h-4 w-4 text-suave" strokeWidth={1.75} />
                <span className="flex-1 text-[13.5px] font-semibold text-texto">{o.rotulo}</span>
                {ativo && <Check aria-hidden className="h-4 w-4 text-verde-3" strokeWidth={2.4} />}
              </span>
              <span className="-mt-1.5 text-[12px] text-texto-2">{o.texto}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
