import { useMemo, useRef, useState } from "react";
import { Camera, Eye, ImagePlus, PenLine, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { TIPOS_FOTO, type TipoFoto } from "@/lib/registrosFotos";
import { ROTULO_POSICAO, rotuloSessao } from "@/evolucao/formato";
import { ORDEM_POSICOES, SLOTS, fotoDoSlot } from "@/evolucao/serie";
import type { Foto, Posicao, SessaoFotos } from "@/evolucao/tipos";
import { FotoProgresso } from "@/evolucao/ui/FotoProgresso";
import FotoDialog from "@/nutricao/avaliacao/FotoDialog";
import { excluirFoto, type FotoEvolucao } from "@/nutricao/avaliacao/evolucao";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { excluirFotoMensal, subirFotoMensal } from "./avaliacaoApi";
import { mensagemDoErro } from "./mensagens";
import { autorNoPainel, type PermissoesAvaliacao } from "./regras";
import { VisualizarFoto } from "./VisualizarFoto";

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

const MINI = "inline-flex items-center justify-center gap-1 text-[11.5px] font-semibold disabled:opacity-50";

/** Uma foto da lista: Ver (grande, anterior/próxima, Baixar — H5, N-34), Editar (as da nutrição: posição, data e observação) e Excluir. */
function FotoComAcao({ f, podeExcluir, podeEditar, ocupado, aoVer, aoEditar, aoExcluir }: {
  f: Foto;
  podeExcluir: boolean;
  podeEditar: boolean;
  ocupado: boolean;
  aoVer: (f: Foto) => void;
  aoEditar: (f: Foto) => void;
  aoExcluir: (f: Foto) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-foto-item={f.id}>
      <FotoProgresso url={f.url} rotulo={ROTULO_POSICAO[f.posicao]} altura={120} />
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => aoVer(f)} disabled={!f.url} className={`${MINI} text-texto-2 hover:text-texto`} data-leitura data-foto-ver={f.id}>
          <Eye aria-hidden className="h-3.5 w-3.5" /> Ver
        </button>
        {podeEditar && (
          <button type="button" disabled={ocupado} onClick={() => aoEditar(f)} className={`${MINI} text-texto-2 hover:text-texto`} data-foto-editar={f.id}>
            <PenLine aria-hidden className="h-3.5 w-3.5" /> Editar
          </button>
        )}
        {podeExcluir && (
          <button type="button" disabled={ocupado} onClick={() => aoExcluir(f)} className={`${MINI} text-rosa-3`} data-foto-excluir={f.id}>
            <Trash2 aria-hidden className="h-3.5 w-3.5" /> Excluir
          </button>
        )}
      </div>
    </div>
  );
}

const idDaLinha = (f: Pick<Foto, "id">): string => f.id.replace(/^(treino|principal):/, "");

/** "Fotos" (subir e excluir) — painel da direita no computador, de baixo no celular. */
export function SheetFotos({ aberto, aoMudar, sessoes, perm, treinoUserId, pacienteId, aoMudou, fotosPrincipal = [], nomeAluno = "" }: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  sessoes: SessaoFotos[];
  perm: PermissoesAvaliacao;
  /** o usuário do Treino do aluno (fotos mensais do Calc) — null quando o aluno não tem treino */
  treinoUserId: string | null;
  pacienteId: string | null;
  aoMudou: () => void;
  /** as linhas das fotos de evolução do principal (aluno_evolucao): a observação e o que o Editar precisa (H5) */
  fotosPrincipal?: { id: string; posicao: string; data: string; observacao?: string | null; path?: string }[];
  /** o nome do aluno no arquivo do Baixar */
  nomeAluno?: string;
}) {
  const celular = useIsMobile();
  const { user } = useAuth();
  const confirmar = useConfirmar();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [novaNutri, setNovaNutri] = useState(false);
  // H5 (N-34): ver grande (com anterior/próxima da mesma data) e editar a foto da nutrição
  const [ver, setVer] = useState<Foto | null>(null);
  const [editar, setEditar] = useState<FotoEvolucao | null>(null);
  const linhaPrincipal = (f: Foto) => (f.origem === "principal" ? fotosPrincipal.find((x) => x.id === idDaLinha(f)) ?? null : null);
  const irmasDe = (f: Foto | null): Foto[] => {
    if (!f) return [];
    const s = sessoes.find((x) => Object.values(x.fotos).some((y) => y?.id === f.id));
    return s ? ORDEM_POSICOES.map((pos) => s.fotos[pos]).filter((x): x is Foto => !!x) : [f];
  };
  const abrirEdicao = (f: Foto) => {
    const l = linhaPrincipal(f);
    if (!l) return;
    setVer(null);
    // o formulário do Nutri lê posição, data e observação; grava pelo id (a imagem não muda)
    setEditar({ ...l, observacao: l.observacao ?? null } as unknown as FotoEvolucao);
  };
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
    if (!(await confirmar({ titulo: `Excluir a foto "${ROTULO_POSICAO[f.posicao]}" de ${f.data.split("-").reverse().join("/")}?`, rotuloConfirmar: "Excluir", perigo: true }))) return;
    setOcupado(f.id);
    try {
      const id = idDaLinha(f);
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
              const podeEditar = s.origem === "principal" && perm.antropometria;
              return (
                <section key={s.chave} className="flex flex-col gap-2" data-fotos-sessao={s.chave}>
                  <div className="flex items-center gap-2">
                    <Chip tom={s.origem === "treino" ? "t" : "n"}>{s.origem === "treino" ? "TREINO" : "NUTRIÇÃO"}</Chip>
                    <span className="text-[12.5px] text-texto-2">{rotuloSessao(s)} · {autorNoPainel(s.autor)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {fotos.map((f) => (
                      <FotoComAcao key={f.id} f={f} podeExcluir={podeExcluir} podeEditar={podeEditar && !!linhaPrincipal(f)} ocupado={!!ocupado} aoVer={setVer}
                        aoEditar={abrirEdicao} aoExcluir={(x) => void excluir(x)} />
                    ))}
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
      <VisualizarFoto foto={ver} irmas={irmasDe(ver)} observacao={ver ? linhaPrincipal(ver)?.observacao ?? null : null} nomeAluno={nomeAluno}
        podeEditar={!!ver && ver.origem === "principal" && perm.antropometria && !!linhaPrincipal(ver)} aoTrocar={setVer} aoFechar={() => setVer(null)}
        aoEditar={abrirEdicao} />
      {perm.antropometria && pacienteId && user && (
        <FotoDialog open={!!editar} onOpenChange={(v) => !v && setEditar(null)} nutricionistaId={user.id} pacienteId={pacienteId} foto={editar} inicial={null}
          onSalva={() => { setEditar(null); aoMudou(); }} />
      )}
    </>
  );
}
