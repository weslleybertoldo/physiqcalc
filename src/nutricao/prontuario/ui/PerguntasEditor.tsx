// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/questionarios/PerguntasEditor.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { INPUT, SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import {
  PERGUNTAS_MAX, PERGUNTA_TEXTO_MAX, TIPOS_PERGUNTA, adicionarPergunta, atualizarPergunta, lerTipoPergunta, moverPergunta, perguntaVazia, removerPergunta, type FormPergunta,
} from "@/nutricao/prontuario/lib/questionariosUtil";

// Editor das perguntas de um questionário (padrão do ResultadosEditor da W18): linhas dinâmicas "texto · tipo · campos do
// tipo (máximo da escala / pontos do sim / opções da múltipla, uma por linha 'texto=pontos') · subir · descer · remover" +
// "Adicionar pergunta" (até 60). Nunca fica sem linha. Os `data-*` levam o ÍNDICE da linha no valor.
const BTN_ICONE = "inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-30";
const BTN_ICONE_PERIGO = "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-linha-2 text-texto-2 hover:text-rosa-3 hover:border-[rgba(244,63,94,.45)] transition-colors disabled:opacity-40";
const BTN_ADD = "inline-flex h-8 items-center gap-1 rounded-[10px] border border-verde/40 bg-[rgba(16,185,129,.1)] px-3 text-[12px] font-semibold text-verde-3 transition-colors hover:bg-[rgba(16,185,129,.16)] disabled:cursor-not-allowed disabled:opacity-40";
const ROTULO = "block text-[10px] uppercase tracking-wider text-texto-2 font-body";

interface Props {
  perguntas: FormPergunta[];
  onChange: (perguntas: FormPergunta[]) => void;
}

export default function PerguntasEditor({ perguntas, onChange }: Props) {
  const lista = perguntas.length ? perguntas : [perguntaVazia()];
  const mudar = (i: number, patch: Partial<FormPergunta>) => onChange(atualizarPergunta(lista, i, patch));

  return (
    <div className="space-y-3" data-perguntas-editor data-perguntas-total={lista.length}>
      {lista.map((p, i) => (
        <div key={i} className="rounded-xl border border-linha p-2.5 space-y-2" data-pergunta={i} data-pergunta-tipo={p.tipo}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_auto] gap-2 items-end">
            <div className="space-y-1 min-w-0">
              <span className={ROTULO}>Pergunta {i + 1}</span>
              <input
                className={INPUT}
                maxLength={PERGUNTA_TEXTO_MAX}
                placeholder="ex.: Sente a barriga estufada depois das refeições?"
                value={p.texto}
                onChange={(e) => mudar(i, { texto: e.target.value })}
                aria-label={`Texto da pergunta ${i + 1}`}
                data-campo-pergunta-texto={i}
              />
            </div>
            <div className="space-y-1">
              <span className={ROTULO}>Tipo</span>
              <select className={SELECT} value={p.tipo} onChange={(e) => mudar(i, { tipo: lerTipoPergunta(e.target.value) })} aria-label={`Tipo da pergunta ${i + 1}`} data-campo-pergunta-tipo={i}>
                {TIPOS_PERGUNTA.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className={BTN_ICONE} onClick={() => onChange(moverPergunta(lista, i, -1))} disabled={i === 0} title="Subir" aria-label={`Subir pergunta ${i + 1}`} data-btn-subir-pergunta={i}>
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button type="button" className={BTN_ICONE} onClick={() => onChange(moverPergunta(lista, i, 1))} disabled={i === lista.length - 1} title="Descer" aria-label={`Descer pergunta ${i + 1}`} data-btn-descer-pergunta={i}>
                <ArrowDown size={14} aria-hidden="true" />
              </button>
              <button type="button" className={BTN_ICONE_PERIGO} onClick={() => onChange(removerPergunta(lista, i))} title="Remover pergunta" aria-label={`Remover pergunta ${i + 1}`} data-btn-remover-pergunta={i}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
          {p.tipo === "escala" && (
            <div className="space-y-1 sm:max-w-[14rem]">
              <span className={ROTULO}>Máximo da escala (resposta de 0 até…)</span>
              <input className={INPUT} inputMode="numeric" placeholder="4" value={p.max} onChange={(e) => mudar(i, { max: e.target.value })} aria-label={`Máximo da escala da pergunta ${i + 1}`} data-campo-pergunta-max={i} />
            </div>
          )}
          {p.tipo === "sim_nao" && (
            <div className="space-y-1 sm:max-w-[14rem]">
              <span className={ROTULO}>Pontos quando a resposta é "sim"</span>
              <input className={INPUT} inputMode="decimal" placeholder="1" value={p.pontosSim} onChange={(e) => mudar(i, { pontosSim: e.target.value })} aria-label={`Pontos do sim da pergunta ${i + 1}`} data-campo-pergunta-pontos={i} />
            </div>
          )}
          {p.tipo === "multipla" && (
            <div className="space-y-1">
              <span className={ROTULO}>Opções — uma por linha, no formato texto=pontos (2 a 10)</span>
              <textarea
                className={TEXTAREA}
                rows={4}
                placeholder={"Nunca=0\n1 a 2 vezes por semana=1\n3 a 5 vezes por semana=3\nTodo dia=4"}
                value={p.opcoes}
                onChange={(e) => mudar(i, { opcoes: e.target.value })}
                aria-label={`Opções da pergunta ${i + 1}`}
                data-campo-pergunta-opcoes={i}
              />
            </div>
          )}
          {p.tipo === "texto" && <p className="text-[11px] text-texto-2 font-body">Resposta livre, sem pontos.</p>}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={BTN_ADD} onClick={() => onChange(adicionarPergunta(lista))} disabled={lista.length >= PERGUNTAS_MAX} data-btn-adicionar-pergunta>
          <Plus size={12} aria-hidden="true" /> Adicionar pergunta
        </button>
        <span className="text-[11px] text-texto-2 font-body">{lista.length}/{PERGUNTAS_MAX}</span>
      </div>
    </div>
  );
}
