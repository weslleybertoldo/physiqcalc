// Physiq W2 — nova/editar TAG da agenda (o "Tipo" virou tag do profissional — decisão dele de 02/10, D3): nome (1–40, sem repetir
// entre as suas), cor (a paleta dos calendários) e área (Treino · Nutrição · Geral — a área da consulta: o que o app do aluno, o
// pacote, os e-mails e os números da agenda leem). As 3 prontas renomeiam e mudam a cor; a área delas não muda (o banco recusa).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import {
  AREAS_TAG, NOME_TAG_MAX, mensagemErroTag, normalizarNomeTag, validarTag, type AreaTag, type ErrosTag, type TagAgenda,
} from "@/agenda/regras";
import { atualizarTag, criarTag } from "./dados";
import PilulaTag from "./PilulaTag";
import { CORES_CALENDARIO } from "./visao";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** editar esta (null = nova) */
  tag?: TagAgenda | null;
  /** o dono das tags (sempre quem está logado: ninguém cria tag para outro) */
  uid: string;
  /** as tags vivas dele (o "sem repetir") */
  tags: TagAgenda[];
  /** a área sugerida na tag nova (ex.: a da consulta aberta) */
  areaInicial?: AreaTag;
  onSalvo: (t: TagAgenda, modo: "criada" | "editada") => void;
}

interface Form {
  nome: string;
  cor: string;
  area: AreaTag;
}

/** A 1ª cor da paleta que ele ainda não usa (a tag nova já nasce diferente das outras). */
function corLivre(tags: readonly TagAgenda[]): string {
  const usadas = new Set(tags.map((t) => t.cor.toLowerCase()));
  return CORES_CALENDARIO.find((c) => !usadas.has(c)) ?? CORES_CALENDARIO[4];
}

export default function TagDialog({ open, onOpenChange, tag, uid, tags, areaInicial, onSalvo }: Props) {
  const editando = !!tag;
  const [f, setF] = useState<Form>({ nome: "", cor: CORES_CALENDARIO[4], area: "geral" });
  const [erros, setErros] = useState<ErrosTag>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErros({});
    setF(tag ? { nome: tag.nome, cor: tag.cor, area: tag.area } : { nome: "", cor: corLivre(tags), area: areaInicial ?? "geral" });
  }, [open, tag]); // eslint-disable-line react-hooks/exhaustive-deps -- reabrir zera o formulário

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = async () => {
    const e = validarTag(f, tags, tag?.id ?? null);
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    try {
      const nome = normalizarNomeTag(f.nome);
      const salva = tag
        ? await atualizarTag(tag.id, tag.base ? { nome, cor: f.cor } : { nome, cor: f.cor, area: f.area })
        : await criarTag({ profissional_id: uid, nome, cor: f.cor, area: f.area });
      toast.success(tag ? "Tag atualizada" : "Tag criada");
      onSalvo(salva, tag ? "editada" : "criada");
      onOpenChange(false);
    } catch (err) {
      const msg = mensagemErroTag(err instanceof Error ? err.message : null);
      if (/nome/i.test(msg)) setErros({ nome: msg });
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  const areaTravada = !!tag?.base;
  const previa = { id: tag?.id ?? null, nome: normalizarNomeTag(f.nome) || "Nova tag", cor: f.cor };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "sm:max-w-md")} data-modal-tag={editando ? "editar" : "nova"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar tag" : "Nova tag"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            A tag marca o tipo da consulta na sua agenda (ex.: Acompanhamento, Reunião). Ela só aparece no painel: o aluno não vê.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-form-tag>
          <Campo rotulo="Nome *" erro={erros.nome}>
            <input className={INPUT} value={f.nome} maxLength={NOME_TAG_MAX + 10} placeholder="ex.: Reunião" autoFocus
              onChange={(e) => set("nome", e.target.value)} data-campo-nome-tag />
          </Campo>
          <Campo rotulo="Cor" erro={erros.cor}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor da tag">
              {CORES_CALENDARIO.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={f.cor === c} onClick={() => set("cor", c)}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2 transition", f.cor === c ? "border-texto" : "border-transparent")}
                  style={{ background: c }} data-cor-tag={c} aria-label={c}>
                  {f.cor === c && <Check className="h-4 w-4 text-[#09090B]" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Área" dica={areaTravada ? "As tags prontas ficam na área delas." : "É o que o app do aluno mostra (treino, nutrição ou geral) e o que entra nos números da agenda."}>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Área da tag" data-campo-area-tag={f.area}>
              {AREAS_TAG.map((a) => (
                <button key={a.valor} type="button" role="radio" aria-checked={f.area === a.valor} disabled={areaTravada && f.area !== a.valor}
                  onClick={() => !areaTravada && set("area", a.valor)}
                  className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border text-[12.5px] font-semibold transition-colors disabled:opacity-40",
                    f.area === a.valor ? "border-violeta-2/60 bg-[rgba(139,92,246,.16)] text-texto" : "border-linha-2 bg-[rgba(255,255,255,.03)] text-texto-3 hover:text-texto")}
                  data-area-tag-btn={a.valor}>
                  {areaTravada && f.area === a.valor && <Lock className="h-3 w-3" aria-hidden="true" />}
                  {a.rotulo}
                </button>
              ))}
            </div>
          </Campo>
          <p className="flex items-center gap-2 text-[12px] text-texto-3" data-previa-tag>Na agenda: <PilulaTag tag={previa} tamanho="chip" /></p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)}>Cancelar</button>
            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()} data-btn-salvar-tag>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
