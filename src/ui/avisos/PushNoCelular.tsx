import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { BellRing, CalendarClock, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSessao } from "@/nucleo/sessao";
import { ouvir, pedirPermissao, permissaoAtual, pushDisponivel, registrar, salvarToken } from "@/push/aparelho";
import { adiadoRecentemente, adiar, proximoPasso, rotaDoToque } from "@/push/regras";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Marca } from "@/ui/premium/Marca";
import { CHAVE_AVISOS } from "@/ui/premium/useAvisos";

const PONTOS: Array<{ icone: LucideIcon; texto: string }> = [
  { icone: CalendarClock, texto: "Consulta marcada, remarcada ou desmarcada pelo seu profissional." },
  { icone: ClipboardList, texto: "Treino, dieta e avaliação novos assim que forem enviados para você." },
  { icone: BellRing, texto: "Pagamentos e os outros avisos do sino, na hora." },
];

/**
 * Push no celular (W20c — pedido dele 01/10: "o profissional marca personal/nutricionista e chega notificação no celular do
 * usuário"). Só no APK com o Firebase: depois do login e a cada abertura com sessão, registra o aparelho (token no banco
 * principal) se a notificação já está permitida; se a pessoa ainda não decidiu, mostra este pedido (uma vez; "Agora não" volta
 * a perguntar em 7 dias) antes do pedido do Android. Recebe com o app aberto (aviso na tela + sino atualizado) e, ao tocar na
 * notificação — inclusive com o app fechado —, abre a tela do aviso. No site, sem permissão ou sem Firebase: não aparece e o
 * app segue com o sino, o e-mail e a notificação local. A casca monta sozinha (src/ui/avisos).
 */
export default function PushNoCelular() {
  const { usuario, situacao } = useSessao();
  const uid = usuario?.id ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const celular = useIsMobile();
  const [pedir, setPedir] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [toques, setToques] = useState(0);
  const pendente = useRef<string | null>(null);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  // os eventos do FCM (ligados 1 vez por abertura; os handlers leem a pessoa e o navegador atuais)
  useEffect(() => {
    if (!uid) return;
    void ouvir({
      aoToken: (token) => {
        const u = uidRef.current;
        if (u) void salvarToken(u, token);
      },
      aoReceber: (n) => {
        void qc.invalidateQueries({ queryKey: CHAVE_AVISOS });
        const rota = rotaDoToque(n.data);
        if (rota.startsWith("/perfil/agenda") && uidRef.current) void qc.invalidateQueries({ queryKey: ["agenda-aluno", uidRef.current] });
        toast(n.title || "Physiq", {
          description: n.body,
          duration: 9000,
          ...(rota !== "/" ? { action: { label: "Ver", onClick: () => navigate(rota) } } : {}),
        });
      },
      aoTocar: (a) => {
        void qc.invalidateQueries({ queryKey: CHAVE_AVISOS });
        pendente.current = rotaDoToque(a.notification?.data);
        setToques((n) => n + 1);
      },
    });
  }, [uid, qc, navigate]);

  // o toque na notificação: abre a tela do aviso quando a casca já tem a situação (com o app fechado, a abertura carrega antes)
  useEffect(() => {
    const rota = pendente.current;
    if (!rota || !situacao) return;
    pendente.current = null;
    const t = window.setTimeout(() => navigate(rota), 60);
    return () => window.clearTimeout(t);
  }, [toques, situacao, navigate]);

  // depois do login e a cada abertura: registra calado (já permitido) ou pede (ainda não decidiu)
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    let timer: number | undefined;
    void (async () => {
      if (!(await pushDisponivel())) return;
      const passo = proximoPasso(await permissaoAtual());
      if (!vivo) return;
      if (passo === "registrar") {
        await registrar().catch(() => undefined);
        return;
      }
      if (passo !== "pedir" || adiadoRecentemente(uid)) return;
      // espera as outras janelas da entrada (ex.: "o Physiq mudou") e os avisos na tela saírem — o pedido não pode ficar por
      // baixo deles. O aviso da consulta para confirmar (W20, AvisoConsultaNova) nasce logo depois que a agenda do aluno chega
      // (["agenda-aluno", uid]): espera ela chegar há 2 s (ou 8 s de app aberto, para quem não é aluno).
      const inicio = Date.now();
      let tentativas = 0;
      const tentar = () => {
        if (!vivo) return;
        const agenda = qc.getQueryState(["agenda-aluno", uid]);
        const agendaJaVeio = !!agenda && agenda.dataUpdatedAt > 0 && Date.now() - agenda.dataUpdatedAt > 2000;
        const livre = !document.querySelector('[role="dialog"]') && !document.querySelector("[data-sonner-toast]");
        if (livre && (agendaJaVeio || Date.now() - inicio > 8000)) {
          setPedir(true);
          return;
        }
        tentativas += 1;
        if (tentativas < 60) timer = window.setTimeout(tentar, 1000);
      };
      timer = window.setTimeout(tentar, 1200);
    })();
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, [uid, qc]);

  const agoraNao = () => {
    if (uid) adiar(uid);
    setPedir(false);
  };

  const ativar = async () => {
    setAtivando(true);
    const p = await pedirPermissao();
    setAtivando(false);
    setPedir(false);
    if (p === "granted") {
      await registrar().catch(() => undefined);
      toast.success("Avisos ligados neste celular");
    } else {
      if (uid) adiar(uid);
      toast("Notificações desligadas", { description: "Os avisos continuam no sino do app e no seu e-mail." });
    }
  };

  if (!pedir) return null;
  return (
    <PainelDeslizante
      aberto
      lado={celular ? "baixo" : "direita"}
      aoMudar={(aberto) => {
        if (!aberto && !ativando) agoraNao();
      }}
      titulo="Avisos no celular"
      descricao="Receba na hora, mesmo com o app fechado."
      rodape={
        <div className="flex gap-2">
          <button type="button" className="pq-botao pq-botao-g flex-1" onClick={agoraNao} disabled={ativando} data-push-agora-nao>
            Agora não
          </button>
          <button type="button" className="pq-botao pq-botao-w flex-1" onClick={() => void ativar()} disabled={ativando} data-push-ativar>
            {ativando ? "Ativando…" : "Ativar avisos"}
          </button>
        </div>
      }
    >
      <div data-push-pedido className="flex flex-col gap-3 pt-2">
        <div className="flex justify-center py-2">
          <Marca tamanho={44} />
        </div>
        {PONTOS.map(({ icone: Icone, texto }) => (
          <div key={texto} className="flex items-start gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie text-violeta-3">
              <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="pt-1.5 text-[13.5px] leading-relaxed text-texto">{texto}</span>
          </div>
        ))}
        <p className="px-1 text-[12px] leading-relaxed text-texto-3">Dá para mudar depois nas configurações do Android.</p>
      </div>
    </PainelDeslizante>
  );
}
