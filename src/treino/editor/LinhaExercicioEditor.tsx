import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MiniaturaGif } from "@/treino/ui/MiniaturaGif";
import { prescricaoComCampo, textoCargaCampo, textoDescansoCampo, type CampoPrescricaoNome } from "./regras";
import type { ExercicioEditor, PrescricaoEditavel } from "./tipos";

type Campo = CampoPrescricaoNome;

const ROTULO: Record<Campo, string> = { series: "SÉRIES", reps: "REPS", descanso: "DESCANSO", carga: "CARGA" };

function textoDe(campo: Campo, ex: ExercicioEditor): string {
  if (campo === "series") return String(ex.series);
  if (campo === "reps") return ex.reps ?? "";
  if (campo === "descanso") return textoDescansoCampo(ex.descanso);
  return textoCargaCampo(ex.carga);
}

const igual = (a: PrescricaoEditavel, b: PrescricaoEditavel) => a.series === b.series && a.reps === b.reps && a.descanso === b.descanso && a.carga === b.carga;

/** Um campo da tela 8 (`.fld`): rótulo pequeno em cima e a caixa de 58 × 32 com o valor; grava ao sair do campo ou no Enter. */
function CampoPrescricao({
  campo,
  ex,
  somenteLeitura,
  vazio,
  aoSalvar,
}: {
  campo: Campo;
  ex: ExercicioEditor;
  somenteLeitura: boolean;
  /** o que aparece apagado quando não há prescrição ("60 s" = o descanso padrão; "—") */
  vazio: string;
  aoSalvar: (p: PrescricaoEditavel) => void;
}) {
  const externo = textoDe(campo, ex);
  const [texto, setTexto] = useState(externo);
  const [erro, setErro] = useState(false);
  const focado = useRef(false);
  useEffect(() => {
    if (!focado.current) setTexto(externo);
  }, [externo]);

  const confirmar = () => {
    focado.current = false;
    if (texto.trim() === externo.trim()) {
      setErro(false);
      setTexto(externo);
      return;
    }
    const r = prescricaoComCampo(ex, campo, texto);
    if (!r.ok || !r.valor) {
      setErro(true);
      toast.error(`${ex.nome}: ${r.erro}`);
      setTexto(externo);
      window.setTimeout(() => setErro(false), 1800);
      return;
    }
    setErro(false);
    const atual = { series: ex.series, reps: ex.reps, descanso: ex.descanso, carga: ex.carga };
    if (!igual(atual, r.valor)) aoSalvar(r.valor);
    // mostra já normalizado ("8 - 12" → "8-12", "60" → "60 s")
    setTexto(textoDe(campo, { ...ex, ...r.valor }));
  };

  const largura = "w-[50px]";
  return (
    <label className="flex flex-none flex-col items-center gap-[3px]" data-campo={campo}>
      <span className="text-[10px] font-semibold tracking-[0.04em] text-texto-3">{ROTULO[campo]}</span>
      {somenteLeitura ? (
        <span
          className={cn(largura, "flex h-8 items-center justify-center rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.05)] text-[13px] font-semibold tabular-nums", externo ? "text-texto" : "text-texto-4")}
          data-campo-valor={campo}
        >
          {externo || vazio}
        </span>
      ) : (
        <input
          value={texto}
          placeholder={vazio}
          inputMode={campo === "series" ? "numeric" : campo === "reps" ? "text" : "decimal"}
          aria-label={`${ROTULO[campo].toLowerCase()} de ${ex.nome}`}
          data-campo-input={campo}
          onFocus={(e) => {
            focado.current = true;
            e.currentTarget.select();
          }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTexto(externo);
              focado.current = false;
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className={cn(
            largura,
            "h-8 rounded-[9px] border bg-[rgba(255,255,255,.05)] text-center text-[13px] font-semibold tabular-nums text-texto outline-none transition-colors placeholder:font-medium placeholder:text-texto-4 focus:border-violeta-3 focus:bg-[rgba(139,92,246,.08)]",
            erro ? "border-rosa" : "border-linha-2",
          )}
        />
      )}
    </label>
  );
}

/**
 * Linha do exercício no editor (tela 8, `.er`): alça de arrastar, miniatura do GIF com play, nome e "grupo · subgrupo", os 4
 * campos (SÉRIES, REPS, DESCANSO, CARGA — NF1; vazio = como hoje: repetições e carga do último treino, descanso padrão do aluno)
 * e as ações editar / tirar do treino.
 */
export function LinhaExercicioEditor({
  ex,
  descansoPadrao,
  somenteLeitura,
  listaFixa,
  alca,
  aoPrescrever,
  aoEditar,
  aoRemover,
}: {
  ex: ExercicioEditor;
  descansoPadrao: number;
  somenteLeitura: boolean;
  /** a lista do treino não muda (treino do próprio aluno): sem arrastar e sem tirar */
  listaFixa: boolean;
  alca?: ReactNode;
  aoPrescrever: (p: PrescricaoEditavel) => void;
  aoEditar: () => void;
  aoRemover: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-[rgba(255,255,255,.06)] py-[9px]" data-exercicio-editor={ex.chave} data-exercicio-nome={ex.nome}>
      <span className="flex w-3.5 flex-none justify-center text-[#52525B]">
        {!somenteLeitura && !listaFixa ? alca : <GripVertical aria-hidden className="h-4 w-4 opacity-30" />}
      </span>
      <MiniaturaGif url={ex.imagem_url} exercicioId={ex.exercicio_id} nome={ex.nome} className="h-[42px] w-[46px] rounded-[11px]" />
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-semibold text-texto" title={ex.nome}>{ex.nome}</b>
        <span className="mt-0.5 block truncate text-[11.5px] text-texto-3" title={ex.subtitulo}>{ex.subtitulo}</span>
      </div>
      <div className="flex flex-none items-end gap-[7px]">
        <CampoPrescricao campo="series" ex={ex} somenteLeitura={somenteLeitura} vazio="3" aoSalvar={aoPrescrever} />
        <CampoPrescricao campo="reps" ex={ex} somenteLeitura={somenteLeitura || ex.corrida} vazio="—" aoSalvar={aoPrescrever} />
        <CampoPrescricao campo="descanso" ex={ex} somenteLeitura={somenteLeitura} vazio={textoDescansoCampo(descansoPadrao)} aoSalvar={aoPrescrever} />
        <CampoPrescricao campo="carga" ex={ex} somenteLeitura={somenteLeitura || ex.corrida} vazio="—" aoSalvar={aoPrescrever} />
      </div>
      <div className="ml-0.5 flex w-[38px] flex-none items-center justify-end gap-1 text-texto-3">
        {!somenteLeitura && (
          <>
            <button type="button" onClick={aoEditar} aria-label={`Editar ${ex.nome}`} title="Editar" className="rounded-md p-0.5 hover:text-texto" data-exercicio-editar>
              <Pencil aria-hidden className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {!listaFixa && (
              <button type="button" onClick={aoRemover} aria-label={`Tirar ${ex.nome} do treino`} title="Tirar do treino" className="rounded-md p-0.5 hover:text-rosa-3" data-exercicio-remover>
                <Trash2 aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
