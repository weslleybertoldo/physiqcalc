// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/exames/ResultadosEditor.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { INPUT, SELECT } from "@/nutricao/editor/ui/estilos";
import SituacaoBadge from "@/nutricao/prontuario/ui/SituacaoBadge";
import type { ExameCatalogo } from "@/nutricao/prontuario/lib/exames";
import {
  LINHAS_RESULTADO_MAX, NOME_EXAME_MAX, OUTRO_EXAME, UNIDADE_MAX, VALOR_TEXTO_MAX, adicionarLinha, atualizarLinha, linhaDoCatalogo, linhaVazia, ordenarCatalogo, removerLinha,
  situacaoDaLinha, textoReferencia, type FormLinhaResultado,
} from "@/nutricao/prontuario/lib/examesUtil";

// Editor das linhas de resultado: "exame (select do catálogo, favoritos primeiro, ou Outro… com nome livre) · valor (número com
// vírgula ou texto) · unidade · referência (só leitura, copiada do catálogo) · prévia da situação · remover" + "Adicionar exame"
// (até 60). Nunca fica sem linha. Usado no lançamento em LOTE e na edição de 1 resultado (`unica`) — quem chama passa o nome
// dos `data-*` pro E2E (mesmo desenho do AtivosEditor da W17; o índice da linha vai no valor do atributo).
const BTN_ICONE = "inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-30";
const BTN_ADD = "inline-flex h-8 items-center gap-1 rounded-[10px] border border-verde/40 bg-[rgba(16,185,129,.1)] px-3 text-[12px] font-semibold text-verde-3 transition-colors hover:bg-[rgba(16,185,129,.16)] disabled:cursor-not-allowed disabled:opacity-40";
const ROTULO = "block text-[10px] uppercase tracking-wider text-texto-2 font-body";

interface Props {
  linhas: FormLinhaResultado[];
  onChange: (linhas: FormLinhaResultado[]) => void;
  catalogo: ExameCatalogo[];
  /** 1 linha fixa (edição de um resultado): sem "Adicionar exame" e sem remover */
  unica?: boolean;
  /** nome do atributo `data-*` de cada linha (valor = índice) — ex.: "data-linha-resultado" */
  attrLinha: string;
  /** select do exame (valor = índice) */
  attrExame: string;
  /** input do nome quando "Outro…" (valor = índice) */
  attrExameOutro: string;
  /** input do valor (valor = índice) */
  attrValor: string;
  /** input da unidade (valor = índice) */
  attrUnidade: string;
  /** texto da referência (valor = índice) */
  attrRef: string;
  /** badge da prévia da situação (valor = índice; a situação vai em `data-situacao`) */
  attrSituacao: string;
  /** botão remover (valor = índice) */
  attrRemover: string;
  /** botão "Adicionar exame" */
  attrAdicionar: string;
}

export default function ResultadosEditor({ linhas, onChange, catalogo, unica = false, attrLinha, attrExame, attrExameOutro, attrValor, attrUnidade, attrRef, attrSituacao, attrRemover, attrAdicionar }: Props) {
  const lista = linhas.length ? linhas : [linhaVazia()];
  const ordenados = useMemo(() => ordenarCatalogo(catalogo), [catalogo]);
  const noCatalogo = (nome: string): boolean => ordenados.some((c) => c.nome === nome);
  /** valor do select: "" (escolher), o nome do catálogo, ou "Outro…" */
  const opcaoDe = (l: FormLinhaResultado): string => (l.outro || (l.exame && !noCatalogo(l.exame)) ? OUTRO_EXAME : l.exame);

  const escolher = (i: number, v: string) => {
    const atual = lista[i];
    if (v === OUTRO_EXAME) {
      onChange(atualizarLinha(lista, i, { exame: "", unidade: "", refMin: null, refMax: null, referenciaTexto: "", outro: true }));
      return;
    }
    if (v === "") {
      onChange(atualizarLinha(lista, i, { ...linhaVazia(), valor: atual.valor, outro: false }));
      return;
    }
    const item = ordenados.find((c) => c.nome === v);
    if (item) onChange(atualizarLinha(lista, i, { ...linhaDoCatalogo(item, atual.valor), outro: false }));
  };

  return (
    <div className="space-y-3" data-resultados-editor data-resultados-total={lista.length}>
      {lista.map((l, i) => {
        const opcao = opcaoDe(l);
        const situacao = situacaoDaLinha(l);
        return (
          <div key={i} className="rounded-xl border border-linha p-2.5 space-y-2" {...{ [attrLinha]: i }}>
            <div className={`grid grid-cols-1 gap-2 items-end ${unica ? "sm:grid-cols-[1fr_6.5rem_6.5rem]" : "sm:grid-cols-[1fr_6.5rem_6.5rem_2.25rem]"}`}>
              <div className="space-y-1 min-w-0">
                <span className={ROTULO}>Exame</span>
                <select className={SELECT} value={opcao} onChange={(e) => escolher(i, e.target.value)} aria-label={`Exame ${i + 1}`} {...{ [attrExame]: i }}>
                  <option value="">Escolha o exame…</option>
                  {ordenados.map((c) => (
                    <option key={c.id} value={c.nome}>{c.favorito ? "★ " : ""}{c.nome}</option>
                  ))}
                  <option value={OUTRO_EXAME}>Outro…</option>
                </select>
                {opcao === OUTRO_EXAME && (
                  <input
                    className={INPUT}
                    maxLength={NOME_EXAME_MAX}
                    placeholder="nome do exame (ex.: Cortisol)"
                    value={l.exame}
                    onChange={(e) => onChange(atualizarLinha(lista, i, { exame: e.target.value, outro: true }))}
                    aria-label={`Nome do exame ${i + 1}`}
                    {...{ [attrExameOutro]: i }}
                  />
                )}
              </div>
              <div className="space-y-1">
                <span className={ROTULO}>Valor</span>
                <input
                  className={INPUT}
                  maxLength={VALOR_TEXTO_MAX}
                  placeholder="ex.: 5,6"
                  inputMode="decimal"
                  value={l.valor}
                  onChange={(e) => onChange(atualizarLinha(lista, i, { valor: e.target.value }))}
                  aria-label={`Valor do exame ${i + 1}`}
                  {...{ [attrValor]: i }}
                />
              </div>
              <div className="space-y-1">
                <span className={ROTULO}>Unidade</span>
                <input
                  className={INPUT}
                  maxLength={UNIDADE_MAX}
                  placeholder="mg/dL"
                  value={l.unidade}
                  onChange={(e) => onChange(atualizarLinha(lista, i, { unidade: e.target.value }))}
                  aria-label={`Unidade do exame ${i + 1}`}
                  {...{ [attrUnidade]: i }}
                />
              </div>
              {!unica && (
                <button type="button" className={BTN_ICONE} onClick={() => onChange(removerLinha(lista, i))} title="Remover exame" aria-label={`Remover exame ${i + 1}`} {...{ [attrRemover]: i }}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-body text-texto-2">
              <span>
                Referência: <span className="text-texto" {...{ [attrRef]: i }}>{textoReferencia(l.refMin, l.refMax, l.referenciaTexto)}</span>
              </span>
              <SituacaoBadge situacao={situacao} curto extras={{ [attrSituacao]: i, "data-situacao": situacao }} />
            </div>
          </div>
        );
      })}
      {!unica && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={BTN_ADD} onClick={() => onChange(adicionarLinha(lista))} disabled={lista.length >= LINHAS_RESULTADO_MAX} {...{ [attrAdicionar]: "" }}>
            <Plus size={12} aria-hidden="true" /> Adicionar exame
          </button>
          <span className="text-[11px] text-texto-2 font-body">{lista.length}/{LINHAS_RESULTADO_MAX}</span>
        </div>
      )}
    </div>
  );
}
