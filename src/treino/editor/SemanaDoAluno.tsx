import { useState } from "react";
import { Plus, Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { indiceRotacao, segundaDaSemana } from "@/lib/semanaSlots";
import { chaveData } from "@/treino/datas";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { DIAS_EDITOR, alternadoLigado, extrasPorDia, treinosPorDia } from "./regras";
import { useAcoesEditor, useDadosEditor } from "./useEditorTreino";
import type { ConfigDia, TreinoEditor } from "./tipos";

/**
 * A semana do aluno (C37/C84 — o "Treino Diário" do Configurar antigo): os treinos de cada dia (repetem toda semana), o treino
 * alternado (um por semana, na ordem marcada) e os extras do alternado (toda semana ou junto de um treino). Grava na hora.
 */
export function SemanaDoAluno({ treinoUserId, somenteLeitura, id }: { treinoUserId: string; somenteLeitura: boolean; id?: string }) {
  const dados = useDadosEditor(treinoUserId);
  const acoes = useAcoesEditor(treinoUserId);
  const [extraNovo, setExtraNovo] = useState<{ dia: string; chave: string; atrelado: string } | null>(null);
  const d = dados.data;
  const treinos = dados.treinos;
  if (!d) return <Cartao className="p-5"><Esqueleto className="h-[260px] w-full" /></Cartao>;
  const porDia = treinosPorDia(d);
  const extras = extrasPorDia(d);
  const cfg: Record<string, ConfigDia> = {};
  d.diasConfig.forEach((c) => (cfg[c.dia_semana] = c));
  const porChave = new Map(treinos.map((t) => [t.chave, t]));
  const hoje = chaveData(new Date());
  const nome = (k: string | null) => (k ? porChave.get(k)?.rotulo ?? "(treino)" : "");

  const alternar = (dia: string, t: TreinoEditor) => {
    const atual = porDia[dia] ?? [];
    const nova = atual.includes(t.chave) ? atual.filter((k) => k !== t.chave) : [...atual, t.chave];
    void acoes.salvarDia(dia, nova);
  };

  return (
    <Cartao className="px-[18px] py-4" id={id} data-semana-aluno>
      <CabecalhoCartao titulo="Semana do aluno" extra={<Chip tom="g">{Object.values(porDia).filter((l) => l.length).length} DIAS COM TREINO</Chip>} />
      <p className="-mt-1 mb-2 text-[12px] text-texto-3">Os treinos de cada dia repetem toda semana. Com o alternado, o aluno faz um por semana, na ordem marcada.</p>
      {treinos.length === 0 ? (
        <p className="py-3 text-[13px] text-texto-3">Dê um treino ao aluno no editor para montar a semana.</p>
      ) : (
        DIAS_EDITOR.map((dia) => {
          const marcados = porDia[dia.codigo] ?? [];
          const c = cfg[dia.codigo];
          const alt = !!c?.alternado;
          const rot = marcados.map((k) => porChave.get(k)).filter((t): t is TreinoEditor => !!t);
          const estaSemana = alternadoLigado(c) && rot.length ? rot[indiceRotacao(hoje, c!.alternado_inicio!, rot.length)] : null;
          const ext = extras[dia.codigo] ?? [];
          return (
            <div key={dia.codigo} className="border-t border-[rgba(255,255,255,.06)] py-2.5" data-semana-dia={dia.codigo}>
              <div className="flex items-start gap-3">
                <span className="w-[66px] flex-none pt-1 text-[13px] font-semibold text-texto">{dia.nome}</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {treinos.map((t) => {
                    const i = marcados.indexOf(t.chave);
                    const on = i >= 0;
                    if (somenteLeitura && !on) return null;
                    return (
                      <button
                        key={t.chave}
                        type="button"
                        disabled={somenteLeitura}
                        aria-pressed={on}
                        onClick={() => alternar(dia.codigo, t)}
                        className={cn("pq-chip h-7 px-2.5 text-[11.5px] tracking-normal", on ? "pq-chip-t" : "pq-chip-g opacity-70", !somenteLeitura && "cursor-pointer hover:opacity-100")}
                        data-semana-treino={t.chave}
                        data-marcado={on || undefined}
                      >
                        {alt && on ? `${i + 1}. ` : ""}
                        {t.rotulo}
                      </button>
                    );
                  })}
                  {marcados.length === 0 && somenteLeitura && <span className="pt-1 text-[12px] text-texto-3">Descanso</span>}
                </div>
                {!somenteLeitura && (
                  <button
                    type="button"
                    disabled={!alt && marcados.length < 2}
                    title={!alt && marcados.length < 2 ? "Marque 2 ou mais treinos para alternar" : undefined}
                    onClick={() => void acoes.salvarAlternado(dia.codigo, !alt, segundaDaSemana(hoje))}
                    aria-pressed={alt}
                    className={cn("pq-chip h-7 flex-none px-2.5 text-[11px]", alt ? "pq-chip-t" : "pq-chip-g", "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40")}
                    data-semana-alternar={dia.codigo}
                  >
                    <Repeat aria-hidden />
                    {alt ? "ALTERNADO" : "ALTERNAR"}
                  </button>
                )}
                {somenteLeitura && alt && <Chip tom="t" icone={Repeat}>ALTERNADO</Chip>}
              </div>
              {alt && (
                <div className="ml-[78px] mt-1.5 flex flex-col gap-1.5 text-[12px] text-texto-2">
                  {estaSemana && <span className="text-violeta-3" data-semana-esta={dia.codigo}>Esta semana: {estaSemana.rotulo}</span>}
                  {ext.map((e, i) => (
                    <span key={`${e.chave}-${i}`} className="flex items-center gap-1.5" data-semana-extra={e.chave}>
                      + Extra: {nome(e.chave)} {e.atrelado ? `(junto com ${nome(e.atrelado)})` : "(toda semana)"}
                      {!somenteLeitura && (
                        <button type="button" aria-label="Tirar o extra" className="text-texto-3 hover:text-rosa-3" onClick={() => void acoes.salvarExtras(dia.codigo, ext.filter((_, j) => j !== i))}>
                          <X aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {!somenteLeitura &&
                    (extraNovo?.dia === dia.codigo ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={extraNovo.chave} onChange={(e) => setExtraNovo({ ...extraNovo, chave: e.target.value })} className="h-8 rounded-lg border border-linha-2 bg-superficie px-2 text-[12px] text-texto" data-extra-treino>
                          <option value="">Treino extra…</option>
                          {treinos.map((t) => <option key={t.chave} value={t.chave}>{t.rotulo}</option>)}
                        </select>
                        <select value={extraNovo.atrelado} onChange={(e) => setExtraNovo({ ...extraNovo, atrelado: e.target.value })} className="h-8 rounded-lg border border-linha-2 bg-superficie px-2 text-[12px] text-texto" data-extra-atrelado>
                          <option value="">Toda semana</option>
                          {rot.map((t) => <option key={t.chave} value={t.chave}>Junto com {t.rotulo}</option>)}
                        </select>
                        <Botao
                          tamanho="sm"
                          variante="w"
                          disabled={!extraNovo.chave}
                          onClick={() => {
                            void acoes.salvarExtras(dia.codigo, [...ext, { chave: extraNovo.chave, atrelado: extraNovo.atrelado || null }]);
                            setExtraNovo(null);
                          }}
                          data-extra-salvar
                        >
                          Salvar extra
                        </Botao>
                        <Botao tamanho="sm" variante="g" onClick={() => setExtraNovo(null)}>Cancelar</Botao>
                      </div>
                    ) : (
                      <button type="button" className="flex w-fit items-center gap-1 text-[12px] font-semibold text-violeta-3" onClick={() => setExtraNovo({ dia: dia.codigo, chave: "", atrelado: "" })} data-extra-novo={dia.codigo}>
                        <Plus aria-hidden className="h-3.5 w-3.5" /> Treino extra
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </Cartao>
  );
}
