import { useEffect, useState } from "react";
import { BellRing, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Interruptor } from "./Interruptor";
import { aplicarLembreteNoAparelho, gravarLembrete, pedirPermissaoLembrete, permissaoNegada } from "./lembrete";
import { lerHora, valorDoLembrete, type LembreteTreino } from "./regras";

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Perfil › Lembrete de treino (C22): a hora do aviso diário "Hora do treino" e liga/desliga (vale neste aparelho). */
export function SheetLembrete({
  aberto,
  aoMudar,
  valor,
  aoSalvar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  valor: LembreteTreino;
  aoSalvar: (l: LembreteTreino) => void;
}) {
  const [hora, setHora] = useState(`${doisDigitos(valor.hour)}:${doisDigitos(valor.minute)}`);
  const [ligado, setLigado] = useState(valor.enabled);
  const [negada, setNegada] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setHora(`${doisDigitos(valor.hour)}:${doisDigitos(valor.minute)}`);
    setLigado(valor.enabled);
    setErro("");
    void permissaoNegada().then(setNegada);
  }, [aberto, valor]);

  const salvar = async () => {
    const h = lerHora(hora);
    if (!h) return setErro("Escolha uma hora válida.");
    setSalvando(true);
    let enabled = ligado;
    if (enabled && !valor.enabled) {
      const ok = await pedirPermissaoLembrete();
      if (!ok) {
        enabled = false;
        setNegada(true);
      }
    }
    const novo: LembreteTreino = { ...h, enabled };
    gravarLembrete(novo);
    await aplicarLembreteNoAparelho(novo);
    setSalvando(false);
    aoSalvar(novo);
    if (ligado && !enabled) {
      toast.error("Libere as notificações do Physiq para receber o lembrete.");
      setLigado(false);
      return;
    }
    toast.success(enabled ? `Lembrete todo dia às ${valorDoLembrete(novo)}.` : "Lembrete desligado.");
    aoMudar(false);
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Lembrete de treino"
      descricao="Uma notificação por dia, na hora escolhida, para lembrar do treino. Vale neste aparelho.">
      <div className="flex flex-col gap-4 pt-2" data-sheet-lembrete>
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie-2 text-suave">
            <BellRing aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="flex-1 text-[13.5px] font-medium text-texto">Lembrete ligado</span>
          <Interruptor ligado={ligado} aoMudar={(v) => { setLigado(v); setErro(""); }} rotulo="Lembrete ligado" data-lembrete-ligado={ligado ? "1" : "0"} />
        </div>
        <Campo rotulo="Hora" type="time" value={hora} onChange={(e) => { setHora(e.target.value); setErro(""); }} disabled={!ligado} data-lembrete-hora />
        {negada && (
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ambar-3" data-lembrete-bloqueado>
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
            As notificações do Physiq estão bloqueadas neste aparelho. Libere nas configurações do celular (ou do navegador) para o lembrete tocar.
          </p>
        )}
        {erro && <MensagemForm>{erro}</MensagemForm>}
        <Botao variante="w" onClick={() => void salvar()} disabled={salvando} data-lembrete-salvar>{salvando ? "Salvando…" : "Salvar"}</Botao>
      </div>
    </PainelDeslizante>
  );
}
