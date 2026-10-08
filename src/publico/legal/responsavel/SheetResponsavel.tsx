import { useEffect, useState } from "react";
import { Check, ShieldOff, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { ErroResponsavel, registrarResponsavel, retirarResponsavel } from "./api";
import {
  FORM_VAZIO, FORMAS, mensagemErroResponsavel, NOME_MAX, problemaDoResponsavel, VINCULOS, type FormResponsavel, type ResponsavelAluno,
} from "./regras";

export type ModoFolha = "registrar" | "retirar";

/** Escolha única em pílulas (vínculo e "como foi dado"), com a marca do E2E em cada opção. */
function Escolha<T extends string>({ rotulo, opcoes, valor, aoMudar, marca }: {
  rotulo: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T | "";
  aoMudar: (v: T) => void;
  marca: "vinculo" | "forma";
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[12.5px] font-semibold text-texto-2">{rotulo}</legend>
      <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const ativo = o.valor === valor;
          return (
            <button key={o.valor} type="button" role="radio" aria-checked={ativo} onClick={() => aoMudar(o.valor)}
              data-responsavel-vinculo={marca === "vinculo" ? o.valor : undefined}
              data-responsavel-forma={marca === "forma" ? o.valor : undefined}
              className={cn("flex h-9 items-center rounded-xl border px-3 text-[12.5px] font-semibold transition-colors",
                ativo ? "border-transparent text-[var(--p-botao-w-texto)]" : "border-linha bg-superficie text-texto-2 hover:text-texto")}
              style={ativo ? { background: "var(--p-botao-w-fundo)" } : undefined}>
              {o.rotulo}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * hml-12 (H-30, §4.3 T9; P7) — a folha do consentimento do responsável (o molde é o "Editar dados"): `registrar` pede o nome, o
 * vínculo, como foi dado e a caixa "conferi a idade… guardo a prova comigo" (sem CPF e sem anexo: a prova fica com o profissional);
 * `retirar` confirma que o app do aluno fecha até um novo registro. O banco confere tudo de novo e devolve a seção atualizada.
 */
export function SheetResponsavel({ aberto, modo, alunoId, aoFechar, aoFeito }: {
  aberto: boolean;
  modo: ModoFolha;
  /** o id da rota (matrícula ou Treino) */
  alunoId: string;
  aoFechar: () => void;
  aoFeito: (novo: ResponsavelAluno) => void;
}) {
  const celular = useIsMobile();
  const [f, setF] = useState<FormResponsavel>(FORM_VAZIO);
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    if (aberto) {
      setF(FORM_VAZIO);
      setErro("");
    }
  }, [aberto]);

  const muda = <K extends keyof FormResponsavel>(k: K, v: FormResponsavel[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErro("");
  };

  const enviar = async () => {
    if (indo) return;
    if (modo === "registrar") {
      const problema = problemaDoResponsavel(f);
      if (problema) return setErro(mensagemErroResponsavel(problema));
    }
    setIndo(true);
    setErro("");
    try {
      const novo = modo === "registrar" ? await registrarResponsavel(alunoId, f) : await retirarResponsavel(alunoId);
      toast.success(modo === "registrar" ? "Consentimento registrado." : "Consentimento retirado.");
      aoFeito(novo);
    } catch (e) {
      setErro(mensagemErroResponsavel(e instanceof ErroResponsavel ? e.codigo : e instanceof Error ? e.message : ""));
    } finally {
      setIndo(false);
    }
  };

  const lado = celular ? "baixo" : "direita";
  if (modo === "retirar") {
    return (
      <PainelDeslizante aberto={aberto} aoMudar={(a) => !a && aoFechar()} lado={lado} titulo="Retirar o consentimento"
        rodape={
          <div className="flex gap-2">
            <button type="button" className="pq-botao pq-botao-g border-rosa/40 text-rosa-3" onClick={() => void enviar()} disabled={indo} data-responsavel-retirar-confirmar>
              <ShieldOff aria-hidden /> {indo ? "Retirando…" : "Retirar"}
            </button>
            <Botao icone={X} onClick={aoFechar}>Cancelar</Botao>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-2" data-sheet-responsavel="retirar">
          <div className="flex items-start gap-2.5 rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] leading-relaxed text-texto"
            style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}>
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
            <span>O app do aluno fecha até um novo registro.</span>
          </div>
          {erro && <MensagemForm data-responsavel-erro>{erro}</MensagemForm>}
        </div>
      </PainelDeslizante>
    );
  }
  return (
    <PainelDeslizante aberto={aberto} aoMudar={(a) => !a && aoFechar()} lado={lado} titulo="Consentimento do responsável"
      descricao="Aluno de 16 ou 17 anos: o app dele abre depois deste registro."
      rodape={
        <div className="flex gap-2">
          <Botao variante="w" icone={Check} onClick={() => void enviar()} disabled={indo} data-responsavel-salvar>
            {indo ? "Registrando…" : "Registrar"}
          </Botao>
          <Botao icone={X} onClick={aoFechar}>Cancelar</Botao>
        </div>
      }
    >
      <form className="flex flex-col gap-3.5 pt-1" data-sheet-responsavel="registrar" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <Campo rotulo="Nome do responsável" value={f.nome} onChange={(e) => muda("nome", e.target.value)} maxLength={NOME_MAX} autoComplete="off"
          data-responsavel-nome />
        <Escolha rotulo="Vínculo" opcoes={VINCULOS} valor={f.vinculo} aoMudar={(v) => muda("vinculo", v)} marca="vinculo" />
        <Escolha rotulo="Como foi dado" opcoes={FORMAS} valor={f.forma} aoMudar={(v) => muda("forma", v)} marca="forma" />
        <label className="flex items-start gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] leading-relaxed text-texto">
          <input type="checkbox" checked={f.confirmo} onChange={(e) => muda("confirmo", e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-violeta"
            data-responsavel-confirmo />
          <span>
            Conferi a idade do aluno, e um dos pais ou o responsável legal consentiu com o acompanhamento no Physiq e com o uso dos dados de
            saúde dele. Guardo a prova comigo.
          </span>
        </label>
        {erro && <MensagemForm data-responsavel-erro>{erro}</MensagemForm>}
      </form>
    </PainelDeslizante>
  );
}
