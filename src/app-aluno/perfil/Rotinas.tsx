// Physiq W-A P3 — Perfil › "Rotinas e lembretes" (/perfil/rotinas — registro por convenção; spec §4.3, §4.6, §2.2-15): todas as rotinas
// vivas (pela hora), o ✓ das de hoje, "Nova rotina" (?nova=1 abre a folha — o atalho do card do Início), tocar abre para mudar ou apagar
// (a do profissional também — P8b). Avisos: notificações bloqueadas, "Alarmes e lembretes" desligado (com "Ligar"), a dica da economia de
// bateria (APK), o lembrete do site só com a página aberta, o limite de 30 e a linha fixa "Seus profissionais veem as suas rotinas" (Q4).
// Os lembretes deste aparelho se replanejam sozinhos depois de cada mudança (o aviso global LembreteDasRotinas lê a mesma consulta).
import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BatteryWarning, Bell, BellOff, CircleCheck, Eye, Info, ListChecks, Plus, TriangleAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hojeSP, rotinasDoDia } from "@/aluno-dia/regras";
import type { Rotina } from "@/aluno-dia/tipos";
import { useSessao } from "@/nucleo/sessao";
import {
  abrirAjusteDoAlarmeExato, alarmeExato, nativo, pedirPermissaoDosLembretes, permissaoDosLembretes, type AlarmeExato, type PermissaoDosLembretes,
} from "@/rotinas/aparelho";
import { ehAlunoDasRotinas, linhaDaRotina, noLimite, vivas } from "@/rotinas/regras";
import { LINHA_PROFISSIONAIS_VEEM, SELO_DO_PROFISSIONAL, TEXTOS } from "@/rotinas/textos";
import { FolhaRotina } from "@/rotinas/ui/FolhaRotina";
import { atualizarRotinas, fraseDoErro, useMarcarRotina, useMinhasRotinas } from "@/rotinas/useRotinas";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { CLASSE_PAGINA_APP, TopoItem } from "./pecas/TopoItem";

function Aviso({ icone: Icone, tom = "text-texto-3", children, ...props }: { icone: LucideIcon; tom?: string; children: ReactNode } & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-texto-2" {...props}>
      <Icone aria-hidden className={cn("mt-0.5 h-4 w-4 flex-none", tom)} strokeWidth={1.75} />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

export default function Rotinas() {
  const { usuario, situacao } = useSessao();
  const uid = usuario?.id ?? null;
  const aluno = ehAlunoDasRotinas(situacao);
  const q = useMinhasRotinas(aluno);
  const qc = useQueryClient();
  const marcar = useMarcarRotina();
  const online = useOnline();
  const app = nativo();
  const [busca, setBusca] = useSearchParams();
  const [folha, setFolha] = useState<{ aberta: boolean; rotina: Rotina | null }>(() => ({ aberta: busca.get("nova") === "1", rotina: null }));
  const [permissao, setPermissao] = useState<PermissaoDosLembretes>("sem_suporte");
  const [exato, setExato] = useState<AlarmeExato>("sem_suporte");

  // ?nova=1 (o "Criar rotina" do Início) abre a folha uma vez e sai do endereço (o Voltar não abre de novo)
  useEffect(() => {
    if (!busca.has("nova")) return;
    const limpa = new URLSearchParams(busca);
    limpa.delete("nova");
    setBusca(limpa, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura
  }, []);

  // as permissões ao abrir e ao voltar de outra tela (a pessoa pode ter mudado nas configurações do celular)
  useEffect(() => {
    const ler = () => {
      void permissaoDosLembretes().then(setPermissao);
      void alarmeExato().then(setExato);
    };
    ler();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") ler();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);

  const hoje = hojeSP();
  const lista = q.data ? vivas(q.data.rotinas) : [];
  const deHoje = new Map(q.data ? rotinasDoDia(q.data.rotinas, q.data.feitas, hoje).map((r) => [r.id, r] as const) : []);
  const cheio = noLimite(lista);
  const comLembrete = lista.some((r) => r.lembrete);

  const abrirNova = () => setFolha({ aberta: true, rotina: null });
  const aoSalvo = async (r: Rotina) => {
    await atualizarRotinas(qc, uid);
    // o 1º lembrete ligado pede a permissão (APK); negada → o aviso da página
    if (r.lembrete && app && permissao === "perguntar") {
      const nova = await pedirPermissaoDosLembretes();
      setPermissao(nova);
      if (nova !== "ligada") toast.error(TEXTOS.permissaoNegada);
    }
  };
  const alternar = (id: string, feita: boolean) => {
    if (!online) {
      toast.error(TEXTOS.semInternetMarcar);
      return;
    }
    marcar.mutate({ id, dia: hoje, feita }, { onError: (e) => toast.error(fraseDoErro(e)) });
  };

  const estado = !situacao ? "carregando" : !aluno ? "sem-matricula" : q.data ? (lista.length ? "lista" : "vazia") : q.isError ? "erro" : !online ? "sem-internet" : "carregando";

  return (
    <div className={CLASSE_PAGINA_APP} data-pagina-rotinas={estado}>
      <TopoItem titulo={TEXTOS.pagina}
        acao={aluno && q.data ? <BotaoIcone icone={Plus} rotulo={TEXTOS.nova} onClick={abrirNova} disabled={cheio || !online} data-rotinas-nova /> : undefined} />

      {LINHA_PROFISSIONAIS_VEEM && aluno && <Aviso icone={Eye} data-rotinas-profissionais-veem="">{LINHA_PROFISSIONAIS_VEEM}</Aviso>}
      {comLembrete && app && permissao === "bloqueada" && (
        <Aviso icone={BellOff} tom="text-rosa-3" data-rotinas-aviso="notificacoes">{TEXTOS.notificacoesBloqueadas}</Aviso>
      )}
      {comLembrete && exato === "desligado" && (
        <div className="flex items-start gap-3" data-rotinas-aviso="alarme-exato">
          <Aviso icone={TriangleAlert} tom="text-ambar-3">{TEXTOS.alarmeExato}</Aviso>
          <Botao tamanho="sm" onClick={() => void abrirAjusteDoAlarmeExato().then(setExato)} data-rotinas-ligar-alarme>{TEXTOS.ligar}</Botao>
        </div>
      )}
      {comLembrete && app && <Aviso icone={BatteryWarning} data-rotinas-aviso="bateria">{TEXTOS.bateria}</Aviso>}
      {comLembrete && !app && <Aviso icone={Info} data-rotinas-site="">{TEXTOS.site}</Aviso>}
      {cheio && <Aviso icone={Info} tom="text-ambar-3" data-rotinas-aviso="limite">{TEXTOS.limite}</Aviso>}

      {estado === "carregando" && <EstadoCarregando linhas={4} rotulo="Carregando as rotinas" />}
      {estado === "sem-matricula" && <EstadoVazio icone={ListChecks} titulo="As rotinas são de quem é aluno no Physiq." />}
      {estado === "erro" && <EstadoErro titulo={TEXTOS.erroLer} aoTentar={() => void q.refetch()} />}
      {estado === "sem-internet" && <EstadoSemInternet texto={TEXTOS.semConexaoTexto} />}
      {estado === "vazia" && (
        <EstadoVazio icone={ListChecks} titulo={TEXTOS.paginaVazia} texto={TEXTOS.vazio}
          acao={<Botao variante="w" icone={Plus} onClick={abrirNova} disabled={!online} data-rotinas-criar>{TEXTOS.nova}</Botao>} />
      )}
      {estado === "lista" && (
        <Cartao className="px-3.5 py-1">
          <ul className="divide-y divide-linha-3">
            {lista.map((r) => {
              const hojeTem = deHoje.get(r.id);
              return (
                <li key={r.id} className="flex min-h-[56px] items-center gap-3 py-2" data-rotina-linha={r.id} data-rotina-origem={r.origem}>
                  {hojeTem ? (
                    <button type="button" onClick={() => alternar(r.id, !hojeTem.feita)} aria-pressed={hojeTem.feita} className="flex-none" data-rotina-marcar={r.id}
                      data-rotina-feita={hojeTem.feita ? "1" : "0"} aria-label={`${r.nome}: ${hojeTem.feita ? "feita hoje (toque para desmarcar)" : "marcar como feita hoje"}`}>
                      <CircleCheck aria-hidden className={cn("h-[20px] w-[20px]", hojeTem.feita ? "text-verde-2" : "text-texto-4")} strokeWidth={1.9} />
                    </button>
                  ) : (
                    <span aria-hidden className="h-[20px] w-[20px] flex-none" />
                  )}
                  <button type="button" onClick={() => setFolha({ aberta: true, rotina: r })} className="flex min-w-0 flex-1 items-center gap-3 text-left" data-rotina-abrir={r.id}>
                    <span className="w-[44px] flex-none text-[13px] font-semibold tabular-nums text-texto-2">{r.horario ?? "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-texto" data-rotina-nome-linha>{r.nome}</span>
                      <span className="block truncate text-[11.5px] text-texto-3">{linhaDaRotina(r)}</span>
                    </span>
                    {r.origem === "profissional" && <Chip tom="c" className="flex-none" data-rotina-selo>{SELO_DO_PROFISSIONAL}</Chip>}
                    {r.lembrete ? <Bell aria-label="Com lembrete" className="h-4 w-4 flex-none text-violeta-3" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <FolhaRotina aberta={folha.aberta} aoMudar={(v) => setFolha((x) => ({ ...x, aberta: v }))} modo={{ tipo: "aluno" }} rotina={folha.rotina}
        aoSalvo={aoSalvo} aoApagado={() => atualizarRotinas(qc, uid)} />
    </div>
  );
}
