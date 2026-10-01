// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/documentos/DocumentoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FileDown, Save, Tags } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import { BTN_LINK, BTN_PRI, BTN_SEC, Campo, INPUT, SELECT } from "@/nutricao/editor/ui/estilos";
import { TEXTAREA_CONTEUDO } from "@/nutricao/editor/ui/ModelosDialog";
import { dataValida } from "@/nutricao/editor/lib/agendaUtil";
import { atualizarTextoDocumento, criarDocumento, type Documento, type ModeloDocumento } from "@/nutricao/prontuario/lib/documentos";
import { baixarPDFDocumento } from "@/nutricao/prontuario/lib/documentoPdf";
import {
  CID_MAX, DIAS_MAX, TEXTO_DOCUMENTO_MAX, TITULO_DOCUMENTO_MAX, aplicarTagsDocumento, dadosDoForm, formInicialDocumento, formParaRegistroDocumento, formatarCPF,
  formatarDataDocumento, infoTipo, modeloInicialDoTipo, modelosDoTipo, normalizarConteudo, tagsDoTipo, temTagPendente, validarDocumento,
  type DadosProfissionais, type FormDocumento, type TipoDocumento,
} from "@/nutricao/prontuario/lib/documentosUtil";

// Modal do documento do paciente (referência: atestado/receituário com as tags *|NOME_PACIENTE|*, *|CPF_PACIENTE|*, *|DATA_HOJE|*,
// *|CARIMBO|*). NOVO: o tipo vem do botão ("Novo atestado" / "Novo receituário" / "Nova declaração"); modelo (favoritos do
// tipo primeiro) preenche o texto, que ela pode ajustar — botões inserem as tags no cursor; no atestado, dias de afastamento
// e CID; a PRÉVIA mostra o texto com as tags substituídas ao vivo. Salvar cria o documento com o texto FINAL e baixa o PDF.
// EDIÇÃO: só o texto final (o documento já emitido não tem mais tags).
const schema = z.object({
  modeloId: z.string(),
  titulo: z.string().refine((v) => v.trim().length >= 2, "Informe o título").refine((v) => v.trim().length <= TITULO_DOCUMENTO_MAX, "Título muito longo"),
  texto: z.string().refine((v) => normalizarConteudo(v).length > 0, "Escreva o texto do documento").refine((v) => v.length <= TEXTO_DOCUMENTO_MAX, "Texto muito longo"),
  dias: z.string(),
  cid: z.string().refine((v) => v.trim().length <= CID_MAX, "CID muito longo"),
  data: z.string().refine(dataValida, "Data inválida"),
});
type Valores = z.infer<typeof schema>;

// montado campo a campo: o tsconfig do repo não tem strictNullChecks e o zod infere tudo como opcional
const montarForm = (v: Partial<Valores>): FormDocumento => ({
  modeloId: v.modeloId ?? "",
  titulo: v.titulo ?? "",
  texto: v.texto ?? "",
  dias: v.dias ?? "",
  cid: v.cid ?? "",
  data: v.data ?? "",
});

const BTN_TAG = "inline-flex items-center border border-verde/40 text-verde-3 font-body text-[11px] px-2 py-0.5 hover:bg-[rgba(16,185,129,.08)] transition-colors";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** tipo do documento NOVO (na edição vale o tipo do documento) */
  tipo: TipoDocumento;
  /** documento existente = modo edição (só o texto final) */
  documento?: Documento | null;
  paciente: { id: string; nome: string; cpf: string | null };
  modelos: ModeloDocumento[];
  nomeNutricionista: string | null;
  profissional: DadosProfissionais | null;
  onSalvo: (d: Documento) => void;
  onGerenciarModelos: () => void;
}

export default function DocumentoDialog({ open, onOpenChange, tipo, documento, paciente, modelos, nomeNutricionista, profissional, onSalvo, onGerenciarModelos }: Props) {
  const { user } = useAuth();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const abriuRef = useRef(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const edicao = !!documento;
  const info = infoTipo(tipo);
  const doTipo = useMemo(() => modelosDoTipo(modelos, tipo), [modelos, tipo]);
  const tags = useMemo(() => tagsDoTipo(tipo), [tipo]);

  const { register, handleSubmit, reset, setValue, getValues, watch, formState: { errors, isSubmitting } } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: formInicialDocumento(tipo, null),
  });

  // reinicia SÓ ao abrir (a lista de modelos pode mudar com o modal aberto — "gerenciar modelos" — sem perder o que ela digitou)
  useEffect(() => {
    if (open && !abriuRef.current) {
      setErroGeral(null);
      if (documento) reset({ modeloId: "", titulo: documento.titulo, texto: documento.texto, dias: "", cid: "", data: documento.data });
      else reset(formInicialDocumento(tipo, modeloInicialDoTipo(modelos, tipo)));
    }
    abriuRef.current = open;
  }, [open, documento, tipo, modelos, reset]);

  const v = montarForm(watch());
  const modelo = doTipo.find((m) => m.id === v.modeloId) ?? null;
  const dados = dadosDoForm(tipo, v, paciente, nomeNutricionista);
  const previa = edicao ? normalizarConteudo(v.texto) : aplicarTagsDocumento(v.texto, dados);
  const { ref: refTexto, ...regTexto } = register("texto");
  const modeloReg = register("modeloId");

  /** Trocar o modelo troca o texto (as tags dele entram no lugar do que estava). */
  const trocarModelo = (id: string) => {
    const m = doTipo.find((x) => x.id === id);
    if (m) setValue("texto", m.conteudo, { shouldDirty: true, shouldValidate: true });
  };

  /** Insere a tag onde está o cursor do textarea (ou no fim) e devolve o foco logo depois dela. */
  const inserirTag = (tag: string) => {
    const el = areaRef.current;
    const atual = getValues("texto") ?? "";
    const ini = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    setValue("texto", atual.slice(0, ini) + tag + atual.slice(fim), { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = ini + tag.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onSubmit = async (valores: Valores) => {
    const f = montarForm(valores);
    setErroGeral(null);
    try {
      if (documento) {
        const texto = normalizarConteudo(f.texto);
        if (!texto) return setErroGeral("Escreva o texto do documento");
        const d = await atualizarTextoDocumento(documento.id, texto);
        onSalvo(d);
        toast.success("Texto do documento atualizado");
        onOpenChange(false);
        return;
      }
      const textoFinal = aplicarTagsDocumento(f.texto, dadosDoForm(tipo, f, paciente, nomeNutricionista));
      const msg = validarDocumento(tipo, f, textoFinal);
      if (msg) return setErroGeral(msg);
      if (!user) return setErroGeral("Sessão expirada — entre de novo");
      const d = await criarDocumento(user.id, paciente.id, formParaRegistroDocumento(tipo, f, textoFinal));
      onSalvo(d);
      try {
        const nome = baixarPDFDocumento({
          tipo,
          titulo: d.titulo,
          texto: d.texto,
          data: d.data,
          paciente: paciente.nome,
          cpf: paciente.cpf,
          nutricionista: nomeNutricionista,
          profissional,
          emitidoEm: new Date(),
        });
        toast.success(`${info.rotulo} emitido — PDF ${nome}`);
      } catch {
        toast.success(`${info.rotulo} emitido`);
        toast.error("Não foi possível gerar o PDF agora — use o botão PDF na lista");
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar o documento";
      setErroGeral(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-2xl max-h-[92vh] overflow-y-auto" data-modal-documento={edicao ? "editar" : tipo}>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto flex flex-wrap items-center gap-2">
            {edicao ? "Editar texto do documento" : info.botao}
            <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 border border-verde/50 text-verde-3" data-documento-tipo-modal={tipo}>
              {info.rotulo}
            </span>
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            {edicao
              ? `Ajuste o texto já emitido — as tags foram substituídas na emissão, então aqui é o texto final. ${documento?.titulo ?? ""} · ${formatarDataDocumento(documento?.data ?? "")}.`
              : "Escolha um modelo, ajuste o texto (as tags viram o nome, o CPF e a data na emissão) e emita: o documento guarda o texto final — mudar o modelo depois não mexe nele."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate data-form-documento>
          {!edicao && (
            <Campo rotulo="Modelo">
              <select
                className={SELECT}
                {...modeloReg}
                onChange={(e) => {
                  void modeloReg.onChange(e);
                  trocarModelo(e.target.value);
                }}
                data-campo-modelo-documento
              >
                {doTipo.length === 0 && <option value="">Nenhum modelo de {info.rotulo.toLowerCase()} — crie um em "gerenciar modelos"</option>}
                {doTipo.map((m) => (
                  <option key={m.id} value={m.id}>{m.favorito ? "★ " : ""}{m.titulo}</option>
                ))}
              </select>
              <button type="button" className={`${BTN_LINK} mt-2`} onClick={onGerenciarModelos} data-btn-gerenciar-modelos-documento>
                <Tags size={12} aria-hidden="true" /> gerenciar modelos
              </button>
            </Campo>
          )}

          {!edicao && (
            <div className={`grid grid-cols-1 gap-3 ${tipo === "atestado" ? "sm:grid-cols-[2fr_1fr_1fr_1fr]" : "sm:grid-cols-[2fr_1fr]"}`}>
              <Campo rotulo="Título *" erro={errors.titulo?.message}>
                <input className={INPUT} maxLength={TITULO_DOCUMENTO_MAX} placeholder={`ex.: ${info.rotulo} de hoje`} {...register("titulo")} data-campo-titulo-documento />
              </Campo>
              <Campo rotulo="Data *" erro={errors.data?.message}>
                <input type="date" className={INPUT} {...register("data")} data-campo-data-documento />
              </Campo>
              {tipo === "atestado" && (
                <>
                  <Campo rotulo="Dias de afastamento *">
                    <input type="number" inputMode="numeric" min={1} max={DIAS_MAX} step={1} className={INPUT} placeholder="ex.: 2" {...register("dias")} data-campo-dias />
                  </Campo>
                  <Campo rotulo="CID (opcional)" erro={errors.cid?.message}>
                    <input className={INPUT} maxLength={CID_MAX} placeholder="ex.: Z00.0" {...register("cid")} data-campo-cid />
                  </Campo>
                </>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-[11px] uppercase tracking-wider text-texto-2 font-body">{edicao ? "Texto final" : "Texto do documento"}</label>
              {!edicao && <span className="text-[10px] text-texto-3 font-body">clique numa tag pra inseri-la no cursor</span>}
            </div>
            {!edicao && (
              <div className="flex flex-wrap gap-1.5 mb-2" data-tags-documento>
                {tags.map((t) => (
                  <button key={t.tag} type="button" className={BTN_TAG} onClick={() => inserirTag(t.tag)} title={`${t.tag} → ex.: ${t.exemplo}`} data-btn-tag={t.tag}>
                    {t.rotulo}
                  </button>
                ))}
              </div>
            )}
            <textarea
              className={TEXTAREA_CONTEUDO}
              maxLength={TEXTO_DOCUMENTO_MAX}
              placeholder={edicao ? "Texto do documento" : `ex.: Atesto que *|NOME_PACIENTE|*…`}
              {...regTexto}
              ref={(el) => {
                refTexto(el);
                areaRef.current = el;
              }}
              data-campo-texto-documento
            />
            {errors.texto?.message && <p className="text-xs text-rosa-3 font-body mt-1" role="alert">{errors.texto.message}</p>}
          </div>

          {!edicao && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-texto-2 font-body mb-1">Prévia do {info.rotulo.toLowerCase()}</p>
              <div
                className="rounded-xl border border-linha-2 p-3 text-sm font-body leading-relaxed whitespace-pre-wrap min-h-[120px] max-h-[40vh] overflow-y-auto"
                data-previa-documento
                data-tag-pendente={temTagPendente(previa) ? "1" : "0"}
              >
                {previa || <span className="text-texto-2">{modelo ? "Sem texto ainda." : "Escolha um modelo ou escreva o texto."}</span>}
              </div>
              <p className="text-xs text-texto-2 font-body mt-1">
                Paciente: <span className="text-texto">{paciente.nome}</span> · CPF: <span className="text-texto">{formatarCPF(paciente.cpf)}</span>
                {!paciente.cpf?.trim() && " — cadastre o CPF no perfil pra ele sair no documento."}
              </p>
            </div>
          )}

          {erroGeral && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-documento>{erroGeral}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-documento>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={isSubmitting} data-btn-salvar-documento>
              {edicao ? <Save size={12} aria-hidden="true" /> : <FileDown size={12} aria-hidden="true" />}
              {isSubmitting ? "Salvando..." : edicao ? "Salvar texto" : "Emitir e baixar PDF"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
