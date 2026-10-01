import { useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { TIPOS_FOTO, type TipoFoto } from "@/lib/registrosFotos";
import { ROTULO_POSICAO, rotuloSessao } from "@/evolucao/formato";
import { ORDEM_POSICOES, SLOTS, fotoDoSlot } from "@/evolucao/serie";
import type { Foto, Posicao, SessaoFotos } from "@/evolucao/tipos";
import { FotoProgresso } from "@/evolucao/ui/FotoProgresso";
import FotoDialog from "@/nutricao/avaliacao/FotoDialog";
import { excluirFoto } from "@/nutricao/avaliacao/evolucao";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { excluirFotoMensal, subirFotoMensal } from "./avaliacaoApi";
import { mensagemDoErro } from "./mensagens";
import { autorNoPainel, type PermissoesAvaliacao } from "./regras";

const POSICAO_DO_TIPO: Record<TipoFoto, Posicao> = { frente: "frente", costas: "costas", lateral_direita: "lado_d", lateral_esquerda: "lado_e" };
const mesDe = (iso: string) => iso.slice(0, 7);

/**
 * Fotos de progresso no painel (W17 — C36, N-34): as da data mais recente (Frente, Lado e Costas, desfocadas até tocar — fotos de
 * aluno nunca são públicas: URL assinada de 1 h), o Comparar (2 datas) e "Fotos" (subir e excluir): o personal sobe as 4 fotos do
 * mês do Calc; a nutricionista, a evolução fotográfica do Nutri (posição e data). As 2 origens na mesma lista, com o autor.
 */
export function CartaoFotosPainel({ sessoes, total, perm, aoComparar, aoGerenciar }: {
  sessoes: SessaoFotos[];
  total: number;
  perm: PermissoesAvaliacao;
  aoComparar: () => void;
  aoGerenciar: () => void;
}) {
  const sessao = sessoes[0] ?? null;
  const pode = perm.fisica || perm.antropometria;
  return (
    <Cartao className="flex flex-col px-[18px] py-4" data-avaliacao-fotos={sessao?.chave ?? "vazio"}>
      <CabecalhoCartao
        titulo="Fotos de progresso"
        acao={
          <>
            {total > 0 && (
              <button type="button" onClick={aoComparar} className="text-[12.5px] font-semibold text-violeta-3" data-avaliacao-comparar>Comparar</button>
            )}
            {pode && (
              <button type="button" onClick={aoGerenciar} className="text-[12.5px] font-semibold text-violeta-3" data-avaliacao-fotos-gerenciar>
                {total > 0 ? "Fotos" : "Subir fotos"}
              </button>
            )}
          </>
        }
      />
      {sessao ? (
        <>
          <span className="-mt-1.5 mb-2.5 block truncate text-[12px] text-texto-2" data-avaliacao-fotos-sessao data-avaliacao-fotos-total={total}>
            {rotuloSessao(sessao)} · {autorNoPainel(sessao.autor)} · {total} {total === 1 ? "foto" : "fotos"}
          </span>
          <div className="grid grid-cols-3 gap-2" data-avaliacao-fotos-grade>
            {SLOTS.map(({ slot, rotulo }) => {
              const f = fotoDoSlot(sessao, slot);
              return (
                <div key={slot} data-foto-slot={slot}>
                  <FotoProgresso url={f?.url ?? null} rotulo={rotulo} vazia={!f} altura={132} />
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie-3 px-3.5 py-3" data-avaliacao-fotos-vazio>
          <Camera aria-hidden className="h-[18px] w-[18px] flex-none text-texto-3" strokeWidth={1.75} />
          <p className="text-[12.5px] leading-relaxed text-texto-2">
            Nenhuma foto de progresso ainda.{pode ? " Suba as fotos de frente, lado e costas em “Subir fotos”." : " O personal e a nutricionista sobem as fotos."}
          </p>
        </div>
      )}
    </Cartao>
  );
}

function FotoComAcao({ f, podeExcluir, ocupado, aoExcluir }: { f: Foto; podeExcluir: boolean; ocupado: boolean; aoExcluir: (f: Foto) => void }) {
  return (
    <div className="flex flex-col gap-1.5" data-foto-item={f.id}>
      <FotoProgresso url={f.url} rotulo={ROTULO_POSICAO[f.posicao]} altura={120} />
      {podeExcluir && (
        <button type="button" disabled={ocupado} onClick={() => aoExcluir(f)}
          className="inline-flex items-center justify-center gap-1 text-[11.5px] font-semibold text-rosa-3 disabled:opacity-50" data-foto-excluir={f.id}>
          <Trash2 aria-hidden className="h-3.5 w-3.5" /> Excluir
        </button>
      )}
    </div>
  );
}

/** "Fotos" (subir e excluir) — painel da direita no computador, de baixo no celular. */
export function SheetFotos({ aberto, aoMudar, sessoes, perm, treinoUserId, pacienteId, aoMudou }: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  sessoes: SessaoFotos[];
  perm: PermissoesAvaliacao;
  /** o usuário do Treino do aluno (fotos mensais do Calc) — null quando o aluno não tem treino */
  treinoUserId: string | null;
  pacienteId: string | null;
  aoMudou: () => void;
}) {
  const celular = useIsMobile();
  const { user } = useAuth();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [novaNutri, setNovaNutri] = useState(false);
  const entrada = useRef<Partial<Record<TipoFoto, HTMLInputElement | null>>>({});
  const doMes = useMemo(() => sessoes.find((s) => s.origem === "treino" && mesDe(s.data) === mes) ?? null, [sessoes, mes]);
  const podeMensal = perm.fisica && !!treinoUserId;
  const podeNutri = perm.antropometria && !!pacienteId && !!user;

  const subir = async (tipo: TipoFoto, arquivo: File | undefined) => {
    if (!arquivo || !treinoUserId) return;
    setOcupado(tipo);
    try {
      await subirFotoMensal(treinoUserId, mes, tipo, arquivo);
      toast.success("Foto salva. O aluno vê na Evolução do app.");
      aoMudou();
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async (f: Foto) => {
    if (!window.confirm(`Excluir a foto "${ROTULO_POSICAO[f.posicao]}" de ${f.data.split("-").reverse().join("/")}?`)) return;
    setOcupado(f.id);
    try {
      const id = f.id.replace(/^(treino|principal):/, "");
      if (f.origem === "treino") await excluirFotoMensal({ id, caminho: f.caminho });
      else await excluirFoto({ id, path: f.caminho });
      toast.success("Foto excluída.");
      aoMudou();
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <>
      <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado={celular ? "baixo" : "direita"} titulo="Fotos de progresso"
        descricao="As fotos do personal (4 por mês) e da nutricionista (por data), na mesma lista. Só quem vê o aluno abre."
        className="sm:w-[min(560px,94vw)]">
        <div className="flex flex-col gap-5 pb-4" data-sheet-fotos>
          {podeMensal && (
            <section className="flex flex-col gap-2.5 rounded-2xl border border-linha-2 bg-superficie p-3.5" data-fotos-mensais={mes}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[13.5px] font-semibold text-texto">Fotos do mês (treino)</b>
                <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)}
                  className="h-9 rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 text-[13px] text-texto" data-fotos-mes />
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {TIPOS_FOTO.map((t) => {
                  const atual = doMes?.fotos[POSICAO_DO_TIPO[t.key]] ?? null;
                  return (
                    <div key={t.key} className="flex flex-col gap-1.5" data-foto-mensal={t.key}>
                      <FotoProgresso url={atual?.url ?? null} rotulo={t.label} vazia={!atual} altura={110} />
                      <input ref={(el) => { entrada.current[t.key] = el; }} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; void subir(t.key, a); }} data-foto-mensal-input={t.key} />
                      <Botao variante="g" tamanho="sm" icone={Upload} disabled={!!ocupado} onClick={() => entrada.current[t.key]?.click()} data-foto-mensal-subir={t.key}>
                        {ocupado === t.key ? "Enviando…" : atual ? "Trocar" : "Subir"}
                      </Botao>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {podeNutri && (
            <Botao variante="g" icone={ImagePlus} onClick={() => setNovaNutri(true)} data-fotos-nova-nutri className="self-start">
              Nova foto de evolução (nutrição)
            </Botao>
          )}
          {sessoes.length === 0 ? (
            <p className="text-[12.5px] text-texto-3" data-fotos-lista-vazia>Nenhuma foto ainda.</p>
          ) : (
            sessoes.map((s) => {
              const fotos = ORDEM_POSICOES.map((pos) => s.fotos[pos]).filter((x): x is Foto => !!x);
              const podeExcluir = s.origem === "treino" ? perm.fisica : perm.antropometria;
              return (
                <section key={s.chave} className="flex flex-col gap-2" data-fotos-sessao={s.chave}>
                  <div className="flex items-center gap-2">
                    <Chip tom={s.origem === "treino" ? "t" : "n"}>{s.origem === "treino" ? "TREINO" : "NUTRIÇÃO"}</Chip>
                    <span className="text-[12.5px] text-texto-2">{rotuloSessao(s)} · {autorNoPainel(s.autor)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {fotos.map((f) => <FotoComAcao key={f.id} f={f} podeExcluir={podeExcluir} ocupado={!!ocupado} aoExcluir={(x) => void excluir(x)} />)}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </PainelDeslizante>
      {podeNutri && (
        <FotoDialog open={novaNutri} onOpenChange={setNovaNutri} nutricionistaId={user!.id} pacienteId={pacienteId!} foto={null} inicial={null}
          onSalva={() => aoMudou()} />
      )}
    </>
  );
}
