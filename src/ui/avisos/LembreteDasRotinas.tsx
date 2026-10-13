import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { App as CapApp } from "@capacitor/app";
import { toast } from "sonner";
import { ErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import type { MinhasRotinas } from "@/aluno-dia/tipos";
import { ouvirAcoesDeNotificacao } from "@/lib/acoesDeNotificacao";
import { useSessao } from "@/nucleo/sessao";
import {
  gravarAvisadasNoSite, lerAvisadasNoSite, limparLembretesDoAparelho, loginGuardadoNoAparelho, nativo, notificarNoNavegador, reconciliarLembretes,
} from "@/rotinas/aparelho";
import { acaoDaNotificacao, chaveDoAvisoNoSite, deveLimparAoDesmontar, rotinasParaAvisarNoSite, textoDoLembrete } from "@/rotinas/lembretes";
import { ROTA_ROTINAS, ehAlunoDasRotinas } from "@/rotinas/regras";
import { TEXTOS, TITULO_DO_LEMBRETE } from "@/rotinas/textos";
import { atualizarRotinas, fraseDoErro, useMarcarRotina, useMinhasRotinas } from "@/rotinas/useRotinas";

/** Site: de quanto em quanto tempo a página aberta confere a hora (spec §5.4: 30 s). */
export const CONFERIR_NO_SITE_MS = 30_000;

/**
 * Os lembretes das ROTINAS (W-A P3 — spec §4.6, §5.4; revisões C3 e I6), aviso global da casca (registrado por convenção em src/ui/avisos —
 * monta para quem entrou; só faz algo para quem é aluno). A consulta é a MESMA do card do Início e da página (useMinhasRotinas).
 *  · APK: a cada dado novo (abrir, voltar para a frente, criar/mudar/apagar/marcar, as feitas de outro aparelho) replaneja as notificações
 *    locais deste aparelho (src/rotinas/aparelho.ts: 7 avulsas por rotina, faixa 40000–40299); o toque e o "Feito" marcam o dia daquela
 *    ocorrência e abrem a página (toast "Creatina feita · Desfazer"; sem internet, avisa — sem fila no aparelho); ação de outro login: nada.
 *  · Sair, trocar de conta, excluir a conta: a casca desmonta os avisos quando o login sai (App.tsx) — sem o login de quem estava aqui
 *    guardado no aparelho, a faixa inteira é esvaziada (sem chamar o Auth: a guarda do navegador da hml-21).
 *  · Site (e iPhone): com a página aberta, confere a cada 30 s e, no horário, um toast com "Marcar como feita" (+ a notificação do
 *    navegador, só se já estiver permitida), 1 vez por rotina por dia nesta aba.
 */
export default function LembreteDasRotinas() {
  const { usuario, situacao } = useSessao();
  const uid = usuario?.id ?? null;
  const aluno = ehAlunoDasRotinas(situacao);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useMinhasRotinas(aluno);
  const marcar = useMarcarRotina();
  const app = nativo();
  const dados = useRef<MinhasRotinas | null>(null);
  dados.current = q.data ?? null;
  const marcarRef = useRef(marcar);
  marcarRef.current = marcar;

  /** Marca pelo aviso (o "Feito", o toque, o toast do site): otimista, com "Desfazer". */
  const marcarPeloAviso = useRef((rotina: string, dia: string, nomeDoAviso: string | null = null) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error(TEXTOS.semInternetMarcar);
      return;
    }
    const nome = dados.current?.rotinas.find((r) => r.id === rotina)?.nome ?? nomeDoAviso ?? "Rotina";
    marcarRef.current.mutate({ id: rotina, dia, feita: true }, {
      onSuccess: () => {
        toast.success(TEXTOS.feita(nome), {
          duration: 8000,
          action: { label: TEXTOS.desfazer, onClick: () => marcarRef.current.mutate({ id: rotina, dia, feita: false }) },
        });
      },
      onError: (e) => toast.error(e instanceof ErroAlunoDia && e.codigo === "dados_invalidos" ? TEXTOS.lembreteAntigo : fraseDoErro(e)),
    });
  }).current;

  // APK: o plano a cada dado novo
  useEffect(() => {
    if (!app || !uid || !aluno || !q.data) return;
    void reconciliarLembretes(q.data.rotinas, q.data.feitas, uid);
  }, [app, uid, aluno, q.data]);

  // APK: de volta para a frente → replaneja na hora (o dia pode ter virado) e relê (as feitas de outro aparelho)
  useEffect(() => {
    if (!app || !uid || !aluno) return;
    const ouvinte = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      const d = dados.current;
      if (d) void reconciliarLembretes(d.rotinas, d.feitas, uid);
      void atualizarRotinas(qc, uid);
    });
    return () => {
      void ouvinte.then((o) => o.remove());
    };
  }, [app, uid, aluno, qc]);

  // APK: o toque e o "Feito" (pelo ouvinte único do app — src/lib/acoesDeNotificacao.ts)
  useEffect(() => {
    if (!app) return;
    return ouvirAcoesDeNotificacao((e) => {
      const a = acaoDaNotificacao(e, uid);
      if (a.tipo === "nao_e_rotina") return false;
      if (a.tipo === "marcar") {
        navigate(ROTA_ROTINAS);
        marcarPeloAviso(a.rotina_id, a.dia, a.nome);
      }
      return true;
    });
  }, [app, uid, navigate, marcarPeloAviso]);

  // Sair / trocar de conta / excluir a conta: a casca desmonta este aviso quando o login sai
  useEffect(() => {
    if (!uid) return;
    return () => {
      if (deveLimparAoDesmontar(uid, loginGuardadoNoAparelho())) void limparLembretesDoAparelho();
    };
  }, [uid]);

  // Site: com a página aberta, no horário
  useEffect(() => {
    if (app || !uid || !aluno) return;
    const conferir = () => {
      const d = dados.current;
      if (!d) return;
      const agora = new Date();
      const hoje = hojeSP(agora);
      const avisadas = lerAvisadasNoSite();
      const devidas = rotinasParaAvisarNoSite(d.rotinas, d.feitas, avisadas, agora);
      if (!devidas.length) return;
      for (const r of devidas) {
        avisadas.add(chaveDoAvisoNoSite(r.id, hoje));
        const t = textoDoLembrete(r);
        notificarNoNavegador(`rotina-${r.id}-${hoje}`, t.titulo, t.corpo);
        toast(TITULO_DO_LEMBRETE, {
          id: `rotina-${r.id}-${hoje}`,
          description: r.detalhe ? `${r.nome} · ${r.detalhe}` : r.nome,
          duration: 60_000,
          action: { label: TEXTOS.marcarComoFeita, onClick: () => marcarPeloAviso(r.id, hoje, r.nome) },
        });
      }
      gravarAvisadasNoSite(avisadas);
    };
    conferir();
    const id = window.setInterval(conferir, CONFERIR_NO_SITE_MS);
    return () => window.clearInterval(id);
  }, [app, uid, aluno, q.data, marcarPeloAviso]);

  return null;
}
