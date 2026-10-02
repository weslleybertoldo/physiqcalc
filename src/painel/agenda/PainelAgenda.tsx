// Physiq W20 — painel lateral da agenda (porta do PainelAgenda do PhysiqNutri: "Meus calendários", "Configurações", "Legendas") no
// visual premium + o pedido dele: "Horários e regras" (slot, atendimento, reagendamento, desistência) e "Travas" (recorrentes e
// avulsas, com Liberar). O dono vê também os calendários da equipe.
// W2: o bloco "Tags" (as SUAS: cor, nome e área; Nova; editar; excluir — as 3 prontas não saem) — serve de legenda; o dono vê as da
// equipe só para ler. Sempre filtrado por profissional_id (o master lê as de todos pela RLS).
import type { ReactNode } from "react";
import { format } from "date-fns";
import { CalendarOff, Download, Lock, Pencil, Plus, Settings2, Tag, Trash2, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONFIRMACAO_ORDEM, ESTILO_CONFIRMACAO, ESTILO_STATUS, JANELAS, STATUS_ORDEM, resumoDasRegras, rotuloArea, tagsDe, textoTrava, type RegrasAgenda,
  type TagAgenda, type TravaRecorrente,
} from "@/agenda/regras";
import { Cartao } from "@/ui/premium/Cartao";
import { Esqueleto } from "@/ui/premium/Estados";
import type { Bloqueio, Calendario } from "./dados";
import PilulaTag from "./PilulaTag";
import { hhmm } from "./visao";

interface Props {
  uid: string;
  calendarios: Calendario[];
  ocultos: Set<string>;
  nomes: Map<string, string>;
  /** W2: as tags que a agenda leu (minhas + as dos donos dos calendários da equipe) */
  tags: TagAgenda[];
  tagsCarregando: boolean;
  onNovaTag: () => void;
  onEditarTag: (t: TagAgenda) => void;
  onExcluirTag: (t: TagAgenda) => void;
  regras: RegrasAgenda;
  regrasCarregando: boolean;
  travas: TravaRecorrente[];
  bloqueios: Bloqueio[];
  exportando: boolean;
  onAlternar: (id: string) => void;
  onNovoCalendario: () => void;
  onEditarCalendario: (c: Calendario) => void;
  onEditarRegras: () => void;
  onTravar: () => void;
  onLiberarTrava: (t: TravaRecorrente) => void;
  onExcluirBloqueio: (b: Bloqueio) => void;
  onExportar: () => void;
}

const LINK = "inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-violeta-3 transition-colors hover:text-violeta-2 disabled:opacity-50";
const ACAO = "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-linha-2 bg-[rgba(255,255,255,.03)] text-[12.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:opacity-50";

function Bloco({ titulo, acao, children, marca }: { titulo: string; acao?: ReactNode; children: ReactNode; marca: string }) {
  return (
    <Cartao className="space-y-2.5 px-4 py-3.5" data-painel={marca}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-body text-[13.5px] font-semibold normal-case tracking-[-0.01em] text-texto">{titulo}</h3>
        {acao}
      </header>
      {children}
    </Cartao>
  );
}

const periodoBloqueio = (b: Bloqueio): string => {
  const ini = new Date(b.inicio);
  const fim = new Date(b.fim);
  const inteiro = ini.getHours() === 0 && ini.getMinutes() === 0 && fim.getHours() === 0 && fim.getMinutes() === 0;
  if (inteiro) {
    const ultimo = new Date(fim.getTime() - 1);
    return ini.toDateString() === ultimo.toDateString() ? format(ini, "dd/MM") : `${format(ini, "dd/MM")} – ${format(ultimo, "dd/MM")}`;
  }
  return `${format(ini, "dd/MM HH:mm")} – ${format(fim, ini.toDateString() === fim.toDateString() ? "HH:mm" : "dd/MM HH:mm")}`;
};

function LinhaCalendario({ c, visivel, dono, onAlternar, onEditar }: { c: Calendario; visivel: boolean; dono: string | null; onAlternar: () => void; onEditar?: () => void }) {
  return (
    <li className="flex items-center gap-2" data-calendario={c.id} data-visivel={visivel ? "1" : "0"} data-padrao={c.padrao ? "1" : undefined}>
      <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[#8B5CF6]" checked={visivel} onChange={onAlternar} aria-label={`Mostrar ${c.nome}`} data-check-calendario={c.id} />
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.cor, boxShadow: `0 0 8px ${c.cor}66` }} aria-hidden="true" />
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", visivel ? "text-texto" : "text-texto-4 line-through")}
        title={`${c.nome} · ${hhmm(c.faixa_inicio)}–${hhmm(c.faixa_fim)}${c.slot_minutos ? ` · slot de ${c.slot_minutos} min` : ""}`}>
        {c.nome}
        {dono && <span className="block truncate text-[11px] text-texto-3">{dono}</span>}
      </span>
      {c.slot_minutos ? <span className="text-[10.5px] tabular-nums text-texto-4">{c.slot_minutos} min</span> : null}
      {onEditar && (
        <button type="button" onClick={onEditar} className="rounded-lg p-1 text-texto-3 transition-colors hover:text-texto" aria-label={`Editar ${c.nome}`} data-btn-editar-calendario={c.id}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function LinhaTag({ t, onEditar, onExcluir }: { t: TagAgenda; onEditar: () => void; onExcluir?: () => void }) {
  return (
    <li className="flex items-center gap-2" data-tag-item={t.id} data-tag-base={t.base ? "1" : undefined} data-tag-area={t.area}>
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.cor, boxShadow: `0 0 8px ${t.cor}66` }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13px] font-semibold text-texto" data-tag-item-nome>{t.nome}</b>
        <span className="block truncate text-[11px] text-texto-3">{rotuloArea(t.area)}{t.base ? " · pronta" : ""}</span>
      </span>
      <button type="button" onClick={onEditar} className="rounded-lg p-1 text-texto-3 transition-colors hover:text-texto" aria-label={`Editar a tag ${t.nome}`} data-btn-editar-tag={t.id}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {onExcluir ? (
        <button type="button" onClick={onExcluir} className="rounded-lg p-1 text-texto-3 transition-colors hover:text-rosa-3" aria-label={`Excluir a tag ${t.nome}`} data-btn-excluir-tag={t.id}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : (
        <span className="w-[22px]" title="As tags prontas não podem ser excluídas" aria-hidden="true" />
      )}
    </li>
  );
}

export default function PainelAgenda(p: Props) {
  const meus = p.calendarios.filter((c) => c.nutricionista_id === p.uid);
  const equipe = p.calendarios.filter((c) => c.nutricionista_id !== p.uid);
  const janela = JANELAS.find((j) => j.valor === p.regras.janela_reagendamento)?.rotulo ?? "";
  const minhasTags = tagsDe(p.tags, p.uid);
  // o dono: as tags de cada membro da equipe com calendário aqui (só leitura)
  const donosEquipe = [...new Set(equipe.map((c) => c.nutricionista_id))];
  const tagsEquipe = donosEquipe.map((id) => ({ id, nome: p.nomes.get(id) ?? "Equipe", tags: tagsDe(p.tags, id) })).filter((x) => x.tags.length > 0);
  return (
    <div className="flex flex-col gap-3" data-painel-agenda>
      <Bloco titulo="Meus calendários" marca="calendarios"
        acao={<button type="button" onClick={p.onNovoCalendario} className={LINK} data-btn-novo-calendario><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Novo</button>}>
        <ul className="space-y-2">
          {meus.map((c) => (
            <LinhaCalendario key={c.id} c={c} visivel={!p.ocultos.has(c.id)} dono={null} onAlternar={() => p.onAlternar(c.id)} onEditar={() => p.onEditarCalendario(c)} />
          ))}
        </ul>
        {equipe.length > 0 && (
          <>
            <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-texto-4">Equipe</p>
            <ul className="space-y-2" data-calendarios-equipe>
              {equipe.map((c) => (
                <LinhaCalendario key={c.id} c={c} visivel={!p.ocultos.has(c.id)} dono={p.nomes.get(c.nutricionista_id) ?? "Equipe"} onAlternar={() => p.onAlternar(c.id)} />
              ))}
            </ul>
          </>
        )}
      </Bloco>

      <Bloco titulo="Tags" marca="tags"
        acao={<button type="button" onClick={p.onNovaTag} disabled={p.tagsCarregando} className={LINK} data-btn-nova-tag><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nova</button>}>
        {p.tagsCarregando && minhasTags.length === 0 ? (
          <div className="space-y-2" data-tags-carregando><Esqueleto className="h-3.5 w-4/5" /><Esqueleto className="h-3.5 w-3/5" /><Esqueleto className="h-3.5 w-2/3" /></div>
        ) : minhasTags.length === 0 ? (
          <p className="flex items-center gap-1.5 text-[12px] text-texto-3" data-tags-vazio><Tag className="h-3.5 w-3.5" aria-hidden="true" /> As tags (Treino, Nutrição e Geral) aparecem aqui.</p>
        ) : (
          <ul className="space-y-2" data-tags-minhas>
            {minhasTags.map((t) => (
              <LinhaTag key={t.id} t={t} onEditar={() => p.onEditarTag(t)} onExcluir={t.base ? undefined : () => p.onExcluirTag(t)} />
            ))}
          </ul>
        )}
        {tagsEquipe.length > 0 && (
          <div className="space-y-2 pt-1" data-tags-equipe>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-texto-4">Equipe</p>
            {tagsEquipe.map((m) => (
              <div key={m.id} className="space-y-1" data-tags-membro={m.id}>
                <span className="block truncate text-[11.5px] text-texto-3">{m.nome}</span>
                <div className="flex flex-wrap gap-1">
                  {m.tags.map((t) => <PilulaTag key={t.id} tag={t} tamanho="chip" className="h-[20px] text-[10px]" />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Bloco titulo="Horários e regras" marca="regras"
        acao={<button type="button" onClick={p.onEditarRegras} disabled={p.regrasCarregando} className={LINK} data-btn-editar-regras><Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Editar</button>}>
        {p.regrasCarregando ? (
          <div className="space-y-2" data-regras-carregando><Esqueleto className="h-3.5 w-4/5" /><Esqueleto className="h-3 w-3/5" /></div>
        ) : (
          <>
            <p className="text-[12.5px] leading-relaxed text-texto-2" data-resumo-regras>{resumoDasRegras(p.regras)}</p>
            <ul className="space-y-1 text-[12px] text-texto-3">
              <li data-regra-reagendar>Reagendar pelo app: {p.regras.reagendamentos_max === 0 ? "não" : p.regras.reagendamentos_max === 1 ? "1 vez" : `${p.regras.reagendamentos_max} vezes`} · {janela.toLowerCase()}</li>
              <li data-regra-desistir>Desistir pelo app: {p.regras.desistencia ? "sim" : "não"}</li>
            </ul>
          </>
        )}
      </Bloco>

      <Bloco titulo="Travas e bloqueios" marca="travas"
        acao={<button type="button" onClick={p.onTravar} className={LINK} data-btn-travar><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Travar</button>}>
        {p.travas.length === 0 && p.bloqueios.length === 0 ? (
          <p className="text-[12px] text-texto-3">Nada travado. Trave o almoço (todo dia) ou um horário só de um dia.</p>
        ) : (
          <ul className="space-y-1.5">
            {p.travas.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12px]" data-trava-item={t.id}>
                <Lock className="h-3.5 w-3.5 flex-none text-texto-3" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-semibold text-texto">{t.motivo ?? "Travado"}</b>
                  <span className="block truncate text-texto-3">{textoTrava(t)}</span>
                </span>
                {t.profissional_id === p.uid && (
                  <button type="button" onClick={() => p.onLiberarTrava(t)} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11.5px] font-semibold text-texto-3 hover:text-texto" aria-label="Liberar" data-btn-liberar-trava={t.id}>
                    <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> Liberar
                  </button>
                )}
              </li>
            ))}
            {p.bloqueios.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-[12px]" data-bloqueio-item={b.id}>
                <CalendarOff className="h-3.5 w-3.5 flex-none text-texto-3" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-semibold text-texto">{b.motivo ?? "Bloqueado"}</b>
                  <span className="block truncate text-texto-3">{periodoBloqueio(b)}</span>
                </span>
                {b.nutricionista_id === p.uid && (
                  <button type="button" onClick={() => p.onExcluirBloqueio(b)} className="rounded-lg p-1 text-texto-3 hover:text-rosa-3" aria-label="Remover bloqueio" data-btn-excluir-bloqueio={b.id}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <button type="button" onClick={p.onExportar} disabled={p.exportando} className={ACAO} data-btn-exportar-ics>
        <Download className="h-3.5 w-3.5" aria-hidden="true" /> {p.exportando ? "Exportando…" : "Exportar (.ics)"}
      </button>

      <Bloco titulo="Legenda" marca="legendas">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-texto-4">Cor de fundo</p>
        <ul className="space-y-1">
          {STATUS_ORDEM.map((k) => (
            <li key={k} className="flex items-center gap-2 text-[12px] text-texto-2" data-legenda-status={k}>
              <span className={cn("inline-block h-3 w-5 rounded-[4px]", ESTILO_STATUS[k].fundo)} aria-hidden="true" />
              {ESTILO_STATUS[k].rotulo}
            </li>
          ))}
        </ul>
        <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-texto-4">Cor da borda</p>
        <ul className="space-y-1">
          {CONFIRMACAO_ORDEM.map((k) => (
            <li key={k} className="flex items-center gap-2 text-[12px] text-texto-2" data-legenda-confirmacao={k}>
              <span className={cn("inline-block h-3 w-5 rounded-[4px] border-l-[3px] bg-superficie-2", ESTILO_CONFIRMACAO[k].borda)} aria-hidden="true" />
              {ESTILO_CONFIRMACAO[k].rotulo}
            </li>
          ))}
        </ul>
      </Bloco>
    </div>
  );
}
