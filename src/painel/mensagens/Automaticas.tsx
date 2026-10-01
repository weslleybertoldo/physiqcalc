import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Cake, CalendarCheck, CalendarClock, CalendarPlus, CalendarX, Check, Gem, Loader2, Pencil, RotateCcw, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
import { SELECT, TEXTAREA } from "@/nutricao/editor/ui/estilos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Esqueleto } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { ErroMensagens, salvarConfig } from "./api";
import {
  DISPAROS, HORARIOS, LIMITE_TEXTO, VARIAVEIS_VALIDAS, erroTexto, mesmaConfig, previa, quantosLigados, resumoCard, textoDoMomento,
  type ConfigWhatsapp, type Disparo, type Momento,
} from "./disparosUtil";
import type { DadosMensagens } from "./useMensagens";
import { traduzErro } from "./whatsappUtil";

const ICONE: Record<Momento, LucideIcon> = {
  aniversario: Cake,
  lembrete_vespera: CalendarClock,
  lembrete_dia: CalendarCheck,
  cobranca_vencendo: Wallet,
  cobranca_vencida: CalendarX,
  confirmacao_agendamento: CalendarPlus,
};

const BTN_TEXTO =
  "inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[12px] font-semibold text-texto-2 transition-colors hover:text-texto [&_svg]:h-[14px] [&_svg]:w-[14px]";

/**
 * Physiq W22 — as 6 MENSAGENS AUTOMÁTICAS (spec 4.4: aniversário, véspera, no dia, cobrança D-1, cobrança D+1, confirmação ao agendar),
 * com horário e texto, tudo nascendo DESLIGADO (o interruptor geral e cada momento). A config é a do site antigo do Nutri
 * (profiles.config.whatsapp): quem envia é o banco (whatsapp_enfileirar, a cada 15 min, no relógio de São Paulo), só para os alunos com o
 * ajuste "Mensagens automáticas no WhatsApp" ligado (R12). Mais o aviso do plano por Pix para o próprio profissional (sem interruptor).
 */
export default function Automaticas({ d, conectado }: { d: DadosMensagens; conectado: boolean }) {
  const celular = useIsMobile();
  const [cfg, setCfg] = useState<ConfigWhatsapp | null>(null);
  const [editando, setEditando] = useState<Momento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const carregou = d.perfil.data !== undefined;
  const base = useRef<ConfigWhatsapp | null>(null);

  // a config do banco entra uma vez (e de novo depois de salvar); o que ele está mexendo não é atropelado pelo recarregar
  useEffect(() => {
    if (!carregou) return;
    if (cfg === null || (base.current && mesmaConfig(cfg, base.current))) {
      setCfg(d.config);
      base.current = d.config;
    }
  }, [carregou, d.config]); // eslint-disable-line react-hooks/exhaustive-deps -- só quando o banco muda

  if (!cfg) {
    return (
      <Cartao className="p-5" data-card-disparos data-estado="carregando">
        <CabecalhoCartao titulo="Mensagens automáticas" />
        <div className="flex flex-col gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Esqueleto key={i} className="h-[46px] w-full" />)}</div>
      </Cartao>
    );
  }

  const tocado = !mesmaConfig(cfg, base.current ?? d.config);
  const ligados = quantosLigados(cfg);
  const desligado = !conectado;
  const disparoEditando = DISPAROS.find((x) => x.chave === editando) ?? null;
  const erroDeAlgum = DISPAROS.map((x) => erroTexto(cfg.textos[x.chave] ?? "")).find(Boolean) ?? null;
  const alcance = d.resumo.data?.alcance ?? null;

  const mudar = (parcial: Partial<ConfigWhatsapp>) => setCfg((c) => (c ? { ...c, ...parcial } : c));
  const salvar = async () => {
    if (erroDeAlgum) return void toast.error(erroDeAlgum);
    setSalvando(true);
    try {
      const gravado = await salvarConfig(cfg);
      base.current = gravado;
      setCfg((c) => (c ? { ...c } : c));
      await d.recarregar({ perfil: true, resumo: true });
      toast.success("Mensagens automáticas salvas");
    } catch (e) {
      toast.error(traduzErro(e instanceof ErroMensagens ? e.codigo : "config_invalida"));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Cartao className="flex flex-col p-5" data-card-disparos data-disparos-ativo={cfg.ativo ? "1" : "0"} data-disparos-ligados={ligados} data-disparos-tocado={tocado ? "1" : "0"}
      data-salvando-disparos={salvando ? "1" : "0"}>
      <CabecalhoCartao titulo="Mensagens automáticas"
        acao={<Interruptor ligado={cfg.ativo} aoMudar={(v) => mudar({ ativo: v })} rotulo="Mensagens automáticas ligadas" desligado={desligado} data-toggle-geral />} />
      <p className="-mt-1 mb-3 text-[12.5px] text-texto-2" data-resumo-disparos>{resumoCard(cfg, conectado)}</p>

      <div className="mb-3 flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5">
        <label htmlFor="horario-whatsapp" className="flex-1 text-[12.5px] font-semibold text-texto-2">
          Horário de envio
          <span className="block text-[11.5px] font-normal text-texto-3">Lembretes, aniversário e cobranças.</span>
        </label>
        <select id="horario-whatsapp" className={cn(SELECT, "h-9 w-[96px] tabular-nums")} value={cfg.horario} disabled={desligado}
          onChange={(e) => mudar({ horario: e.target.value })} data-select-horario>
          {HORARIOS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      <ul className="divide-y divide-linha-3" data-lista-disparos>
        {DISPAROS.map((x) => {
          const Icone = ICONE[x.chave];
          const ligado = !!cfg.momentos[x.chave];
          const proprio = !!(cfg.textos[x.chave] ?? "").trim() && cfg.textos[x.chave]!.trim() !== x.padrao;
          return (
            <li key={x.chave} className="flex min-h-[54px] items-center gap-2.5 py-2" data-disparo={x.chave} data-disparo-ligado={ligado ? "1" : "0"}>
              <span className={cn("flex h-[32px] w-[32px] flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie", ligado && cfg.ativo ? "text-violeta-3" : "text-texto-3")}>
                <Icone aria-hidden className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <button type="button" className="group min-w-0 flex-1 rounded-lg text-left" onClick={() => setEditando(x.chave)} data-btn-texto={x.chave}
                aria-label={`Texto: ${x.titulo}`} title="Editar o texto">
                <b className="block text-[13px] font-semibold leading-snug text-texto">{x.curto}</b>
                <span className="flex items-center gap-1 text-[11.5px] text-texto-3 group-hover:text-texto-2">
                  <Pencil aria-hidden className="h-3 w-3 flex-none" strokeWidth={2} />
                  <span className="truncate">{x.quando}{x.chave === "confirmacao_agendamento" ? "" : ` · ${cfg.horario}`}{proprio ? " · texto seu" : ""}</span>
                </span>
              </button>
              <Interruptor ligado={ligado} aoMudar={(v) => mudar({ momentos: { ...cfg.momentos, [x.chave]: v } })} rotulo={`Ligar: ${x.titulo}`}
                desligado={desligado} data-toggle-disparo={x.chave} />
            </li>
          );
        })}
        <li className="flex min-h-[54px] items-center gap-2.5 py-2" data-disparo="aviso_plano">
          <span className="flex h-[32px] w-[32px] flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie text-ambar-3">
            <Gem aria-hidden className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13px] font-semibold leading-snug text-texto">Aviso do seu plano</b>
            <span className="block text-[11.5px] leading-snug text-texto-3" data-aviso-plano-texto>Automático · 3 dias antes do Pix vencer, o código chega no seu WhatsApp</span>
          </span>
        </li>
      </ul>

      {alcance && (
        <p className="mt-2 text-[12px] leading-snug text-texto-3" data-alcance={`${alcance.ligadas}/${alcance.com_telefone}`}>
          {alcance.com_telefone === 0 ? (
            <>Nenhum aluno seu tem telefone cadastrado ainda: as automáticas saem só para quem tem.</>
          ) : (
            <>
              Recebem: <b className="font-semibold text-texto-2">{alcance.ligadas} de {alcance.com_telefone}</b> {alcance.com_telefone === 1 ? "aluno" : "alunos"} com telefone (o ajuste
              "Mensagens automáticas no WhatsApp" de cada aluno).
            </>
          )}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <span className="text-[12px] text-texto-3">{conectado ? "Saem do seu WhatsApp, uma por aluno." : "Conecte o WhatsApp para ligar as mensagens."}</span>
        <Botao variante="w" tamanho="sm" icone={salvando ? Loader2 : Check} onClick={() => void salvar()} disabled={salvando || !tocado || desligado}
          className={cn(salvando && "[&_svg]:animate-spin")} data-btn-salvar-disparos>
          Salvar
        </Botao>
      </div>

      {disparoEditando && (
        <TextoDialog disparo={disparoEditando} texto={textoDoMomento(cfg, disparoEditando.chave)} lado={celular ? "baixo" : "direita"}
          aoMudar={(texto) => mudar({ textos: { ...cfg.textos, [disparoEditando.chave]: texto } })} aoFechar={() => setEditando(null)} />
      )}
    </Cartao>
  );
}

/** O texto de um momento: o padrão (o mesmo do banco e do site antigo) ou o do profissional, com as variáveis e a prévia. */
function TextoDialog({ disparo, texto, aoMudar, aoFechar, lado }: { disparo: Disparo; texto: string; aoMudar: (t: string) => void; aoFechar: () => void; lado: "baixo" | "direita" }) {
  const erro = erroTexto(texto);
  const ehPadrao = texto.trim() === disparo.padrao;
  const inserir = (v: string) => aoMudar(`${texto}${texto && !texto.endsWith(" ") ? " " : ""}${v}`);
  return (
    <PainelDeslizante aberto aoMudar={(a) => !a && aoFechar()} titulo={disparo.titulo} descricao={disparo.descricao} lado={lado}
      rodape={
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={cn(BTN_TEXTO, ehPadrao && "opacity-40")} disabled={ehPadrao} onClick={() => aoMudar(disparo.padrao)} data-btn-texto-padrao>
            <RotateCcw aria-hidden /> Usar o texto padrão
          </button>
          <Botao variante="w" tamanho="sm" icone={Check} onClick={aoFechar} data-btn-texto-pronto>Pronto</Botao>
        </div>
      }>
      <div className="flex flex-col gap-3 pt-1" data-editor-texto={disparo.chave}>
        <textarea className={cn(TEXTAREA, "min-h-[132px]")} value={texto} maxLength={LIMITE_TEXTO + 50} onChange={(e) => aoMudar(e.target.value)}
          aria-label={`Texto: ${disparo.titulo}`} data-textarea={disparo.chave} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-texto-3">Você pode usar:</span>
          {disparo.variaveis.map((v) => (
            <button key={v} type="button" onClick={() => inserir(v)} className="pq-chip pq-chip-g h-[22px] text-[11px]" data-variavel={v}>{v}</button>
          ))}
          <span className={cn("ml-auto text-[11.5px] tabular-nums", texto.trim().length > LIMITE_TEXTO ? "text-rosa-3" : "text-texto-4")}>{texto.trim().length}/{LIMITE_TEXTO}</span>
        </div>
        {erro ? (
          <p className="text-[12px] font-medium text-rosa-3" role="alert" data-erro-texto>{erro}</p>
        ) : (
          <div data-previa>
            <span className="text-[11.5px] font-semibold text-texto-3">Prévia (o que o aluno lê)</span>
            <p className="mt-1.5 max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-linha bg-[var(--p-chip-n-fundo)] px-3.5 py-2.5 text-[13px] leading-relaxed text-texto">
              {previa(texto) || previa(disparo.padrao)}
            </p>
          </div>
        )}
        <p className="text-[11.5px] text-texto-4">Variáveis válidas: {VARIAVEIS_VALIDAS.join(" · ")}.</p>
      </div>
    </PainelDeslizante>
  );
}
