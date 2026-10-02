// Physiq W25 — os blocos do Painel › Dashboard no padrão da tela 6 (`.kpi`, `.ag`, `.dgrid/.df`, `.feed` do gerador): os 4 números, a
// "Agenda de hoje", "Precisam de atenção", "Diário de hoje" e "Atividade recente". Cada linha leva à tela de origem; todo bloco tem
// carregando (esqueleto), vazio (texto) e erro (tentar de novo), no mesmo visual.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Activity, CalendarCheck, Camera, ClipboardList, Dumbbell, ReceiptText, RefreshCw, Trophy, UserPlus, Users, Wallet } from "lucide-react";
import { infoTipo, textoHojePorTipo, type NumerosAgenda } from "@/agenda/regras";
import { rotuloReacao, tomReacao } from "@/nutricao/app/diarioUtil";
import { formatarHora, nomeDoEvento, type EventoPainel } from "@/painel/agenda/visao";
import { primeiroNomeAluno } from "@/painel/dietas/diarioPainel";
import type { RegistroDiarioNutri } from "@/painel/dietas/diario";
import { fmtBRL } from "@/painel/financeiro/financeiroUtil";
import { nomeDoMesLongo, type KpisFinanceiro } from "@/painel/financeiro/resumo";
import { Avatar } from "@/ui/premium/Avatar";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { tempoDesde } from "@/ui/premium/texto";
import { textoAdesao, type AdesaoMedia, type ItemAtencao, type ItemAtividade } from "./regras";

const curto = (n: number) => fmtBRL(n).replace(/,00$/, "");

function Tentar({ texto, aoTentar }: { texto: string; aoTentar: () => void }) {
  return (
    <div className="flex items-center gap-2 py-3 text-[12.5px] text-texto-3" data-bloco-erro>
      <span className="min-w-0 flex-1">{texto}</span>
      <button type="button" onClick={aoTentar} className="flex flex-none items-center gap-1.5 font-semibold text-violeta-3" data-tentar-de-novo>
        <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar de novo
      </button>
    </div>
  );
}

function Vazio({ children, marca }: { children: ReactNode; marca: string }) {
  return <p className="py-3 text-[12.5px] leading-relaxed text-texto-3" data-bloco-vazio={marca}>{children}</p>;
}

function KpiCarregando({ titulo }: { titulo: string }) {
  return (
    <Cartao className="h-[132px] px-4 pb-3 pt-4" data-kpi-carregando={titulo}>
      <Esqueleto className="h-4 w-1/2" />
      <Esqueleto className="mt-4 h-8 w-2/5" />
      <Esqueleto className="mt-3 h-3 w-3/5" />
    </Cartao>
  );
}

/** O cartão de número inteiro leva à tela de origem (o número dela é o mesmo). */
function KpiLink({ para, children, marca }: { para?: string; children: ReactNode; marca: string }) {
  if (!para) return <div data-kpi-bloco={marca}>{children}</div>;
  return (
    <Link to={para} className="block rounded-[22px] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-violeta/60 hover:-translate-y-px" data-kpi-bloco={marca} data-kpi-link={para}>
      {children}
    </Link>
  );
}

// ───────────────────────── os 4 números ─────────────────────────

export function KpiAlunos({ total, novosMes, serie, carregando, erro }: { total?: number; novosMes?: number; serie?: number[]; carregando: boolean; erro: boolean }) {
  if (carregando) return <KpiCarregando titulo="Alunos ativos" />;
  return (
    <KpiLink para="/painel/alunos" marca="alunos">
      <Kpi icone={Users} titulo="Alunos ativos" tom="violeta" valor={<span data-kpi-alunos={total ?? ""}>{erro || total === undefined ? "—" : total}</span>} serie={serie}
        detalhe={erro ? <span>não deu para carregar</span> : novosMes ? (
          <span data-kpi-novos={novosMes}><b className="font-semibold text-verde-2">+{novosMes}</b> este mês</span>
        ) : <span data-kpi-novos={0}>nenhum novo este mês</span>} />
    </KpiLink>
  );
}

export function KpiReceita({ k, carregando, erro }: { k: KpisFinanceiro | null; carregando: boolean; erro: boolean }) {
  if (carregando && !k) return <KpiCarregando titulo="Receita do mês" />;
  if (!k) {
    return (
      <KpiLink para="/painel/financeiro" marca="receita">
        <Kpi icone={Wallet} titulo="Receita do mês" tom="verde" valor="—" detalhe={<span>{erro ? "não deu para carregar" : "sem dados"}</span>} />
      </KpiLink>
    );
  }
  const v = k.variacaoMes;
  const c = k.comparacao;
  return (
    <KpiLink para="/painel/financeiro" marca="receita">
      <Kpi icone={Wallet} titulo={`Receita de ${nomeDoMesLongo(k.hoje)}`} tom="verde" valor={<span data-kpi-receita={k.recebidoMes.toFixed(2)}>{curto(k.recebidoMes)}</span>}
        serie={k.series.recebido6m}
        detalhe={<span title={`De 1º até hoje, comparado com ${c.rotuloLongo} (o mesmo período do mês anterior)`} data-comparacao-mes={c.rotulo} data-variacao-mes={v ?? ""}>
          {v === null ? <>nada em {c.rotulo}</> : <><b className={v >= 0 ? "font-semibold text-verde-2" : "font-semibold text-rosa-3"}>{v >= 0 ? "+" : ""}{v}%</b> sobre {c.rotulo}</>}
        </span>} />
    </KpiLink>
  );
}

export function KpiConsultas({ n, carregando, erro }: { n: NumerosAgenda | null; carregando: boolean; erro: boolean }) {
  if (carregando && !n) return <KpiCarregando titulo="Consultas hoje" />;
  return (
    <KpiLink para="/painel/agenda" marca="consultas">
      <Kpi icone={CalendarCheck} titulo="Consultas hoje" tom="ciano" valor={<span data-kpi-consultas={n?.hoje ?? ""}>{n ? n.hoje : "—"}</span>} serie={n?.porDia}
        detalhe={<span data-hoje-por-tipo>{n ? textoHojePorTipo(n) : erro ? "não deu para carregar" : "—"}</span>} />
    </KpiLink>
  );
}

export function KpiAdesao({ m, carregando }: { m: AdesaoMedia; carregando: boolean }) {
  if (carregando) return <KpiCarregando titulo="Adesão média" />;
  return (
    <div data-kpi-bloco="adesao" data-adesao={m.pct ?? ""} data-adesao-alunos={m.alunos}>
      <Kpi icone={Activity} titulo="Adesão média" tom="ambar" valor={m.pct === null ? "—" : `${m.pct}%`} serie={m.pct === null ? undefined : m.serie}
        detalhe={<span title="Média dos alunos nos últimos 7 dias: treinos feitos ÷ programados e refeições marcadas ÷ as do plano">{textoAdesao(m)}</span>} />
    </div>
  );
}

// ───────────────────────── Agenda de hoje ─────────────────────────

export function AgendaHoje({ eventos, carregando, erro, aoTentar, hoje }: {
  eventos: EventoPainel[] | null;
  carregando: boolean;
  erro: boolean;
  aoTentar: () => void;
  hoje: string;
}) {
  const lista = eventos ?? [];
  const linkDia = `/painel/agenda?visao=semana&data=${hoje}`;
  return (
    <Cartao className="flex flex-col px-[18px] pb-3 pt-4" data-cartao-agenda-hoje-dashboard data-agenda-hoje={lista.length}>
      <CabecalhoCartao titulo="Agenda de hoje" acao={<Link to="/painel/agenda" className="text-[12.5px] font-semibold text-violeta-3" data-ver-agenda>Ver agenda</Link>} />
      {carregando && !eventos ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-[46px] w-full" />)}</div>
      ) : erro && !eventos ? (
        <Tentar texto="Não deu para carregar a agenda." aoTentar={aoTentar} />
      ) : lista.length === 0 ? (
        <Vazio marca="agenda">Nenhuma consulta hoje. Quando você marcar na <Link to="/painel/agenda" className="font-semibold text-violeta-3">Agenda</Link>, ela aparece aqui com o horário e o aluno.</Vazio>
      ) : (
        <div className="divide-y divide-linha-3">
          {lista.slice(0, 5).map((ev) => {
            const { nome, sub } = nomeDoEvento(ev);
            const tipo = infoTipo(ev.modulo);
            return (
              <Link key={ev.id} to={linkDia} className="flex min-h-[50px] items-center gap-[11px] py-1" data-agenda-hoje-evento={ev.id}>
                <b className="w-[44px] flex-none text-[12.5px] font-semibold tabular-nums text-texto-2">{formatarHora(ev.inicio)}</b>
                <Avatar src={ev.foto} nome={nome} tamanho={32} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold text-texto">{nome}</b>
                  <span className="block truncate text-[12px] text-texto-3">{sub ?? tipo.rotulo}</span>
                </span>
                <Chip tom={tipo.tom} className="h-[22px] flex-none text-[10.5px]">{tipo.chip}</Chip>
              </Link>
            );
          })}
          {lista.length > 5 && (
            <Link to={linkDia} className="block pt-2 text-[12px] font-semibold text-violeta-3" data-agenda-hoje-mais={lista.length - 5}>+{lista.length - 5} no dia</Link>
          )}
        </div>
      )}
    </Cartao>
  );
}

// ───────────────────────── Precisam de atenção ─────────────────────────

/** A tela 6 mostra 4; o resto abre no "Ver todas". */
const VISIVEIS_ATENCAO = 4;
const ICONE_ATENCAO: Partial<Record<ItemAtencao["tipo"], LucideIcon>> = { cadastro: UserPlus, preconsulta: ClipboardList };

export function Atencao({ itens, carregando, avisos, vazio }: { itens: ItemAtencao[]; carregando: boolean; avisos?: ReactNode; vazio: string }) {
  const [todos, setTodos] = useState(false);
  const mostrar = todos ? itens : itens.slice(0, VISIVEIS_ATENCAO);
  return (
    <Cartao className="flex flex-col px-[18px] pb-3 pt-4" data-cartao-atencao-dashboard data-atencao-total={itens.length}>
      <CabecalhoCartao titulo="Precisam de atenção" acao={itens.length ? <Chip tom="r" data-atencao-contador>{itens.length}</Chip> : undefined} />
      {carregando && itens.length === 0 ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-[46px] w-full" />)}</div>
      ) : itens.length === 0 ? (
        <Vazio marca="atencao">{vazio}</Vazio>
      ) : (
        <div className="divide-y divide-linha-3">
          {mostrar.map((i) => {
            const Icone = ICONE_ATENCAO[i.tipo];
            return (
              <Link key={i.chave} to={i.link} className="flex min-h-[50px] items-center gap-[11px] py-1" data-atencao-item={i.tipo} data-atencao-link={i.link} title={`${i.nome} · ${i.texto}`}>
                {Icone ? (
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-linha bg-superficie text-texto-2">
                    <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                ) : (
                  <Avatar src={i.foto} nome={i.nome} tamanho={32} />
                )}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold text-texto">{i.nome}</b>
                  <span className="block truncate text-[12px] text-texto-3">{i.texto}</span>
                </span>
                <Chip tom={i.tom} className="h-[22px] flex-none text-[10.5px]">{i.chip}</Chip>
              </Link>
            );
          })}
          {itens.length > VISIVEIS_ATENCAO && (
            <button type="button" onClick={() => setTodos((t) => !t)} className="block w-full pt-2 text-left text-[12px] font-semibold text-violeta-3" data-atencao-ver-todas>
              {todos ? "Mostrar menos" : `Ver todas (${itens.length})`}
            </button>
          )}
        </div>
      )}
      {avisos}
    </Cartao>
  );
}

// ───────────────────────── Diário de hoje ─────────────────────────

export function DiarioHoje({ registros, urls, carregando, erro, aoTentar, aoFalharFoto }: {
  registros: RegistroDiarioNutri[];
  urls: Record<string, string>;
  carregando: boolean;
  erro: boolean;
  aoTentar: () => void;
  aoFalharFoto: (id: string) => void;
}) {
  const total = registros.length;
  const visiveis = total > 6 ? registros.slice(0, 5) : registros;
  return (
    <Cartao className="flex flex-col px-[18px] pb-4 pt-4" data-cartao-diario-hoje data-diario-hoje={total}>
      <CabecalhoCartao titulo="Diário de hoje" acao={<Link to="/painel/dietas?aba=diario" className="text-[12.5px] font-semibold text-violeta-3" data-ver-diario>Ver todos</Link>} />
      {carregando && total === 0 ? (
        <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-[96px] w-full rounded-[14px]" />)}</div>
      ) : erro && total === 0 ? (
        <Tentar texto="Não deu para carregar as fotos do diário." aoTentar={aoTentar} />
      ) : total === 0 ? (
        <Vazio marca="diario">Nenhuma foto hoje. Quando o aluno mandar a foto da refeição (pelo app ou pelo link do diário), ela aparece aqui para você reagir.</Vazio>
      ) : (
        <div className="grid grid-cols-3 gap-2" data-grade-diario>
          {visiveis.map((r) => {
            const reacao = rotuloReacao(r.reacao_nutri);
            return (
              <Link key={r.id} to={`/painel/dietas?aba=diario&dias=7&aluno=${encodeURIComponent(r.paciente_id)}`}
                className="group relative h-[96px] overflow-hidden rounded-[14px] border border-linha-2 bg-superficie-2" data-diario-foto={r.id}>
                {urls[r.id] ? (
                  <img src={urls[r.id]} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" onError={() => aoFalharFoto(r.id)} />
                ) : (
                  <span className="absolute inset-0 animate-pulse bg-superficie-2" />
                )}
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg,transparent 40%,rgba(0,0,0,.85))" }} />
                {reacao && (
                  <Chip tom={tomReacao(r.reacao_nutri)} className="absolute right-1.5 top-1.5 h-[20px] px-2 text-[10px] normal-case tracking-[0.02em] !bg-[rgba(9,9,11,.78)] backdrop-blur-sm" data-diario-reacao={r.reacao_nutri ?? ""}>
                    {reacao}
                  </Chip>
                )}
                <span className="absolute bottom-1.5 left-2 right-2 truncate text-[11px] font-semibold text-white">{primeiroNomeAluno(r)}</span>
              </Link>
            );
          })}
          {total > 6 && (
            <Link to="/painel/dietas?aba=diario" className="flex h-[96px] flex-col items-center justify-center gap-1 rounded-[14px] border border-linha-2 bg-[rgba(255,255,255,.03)] text-[12px] text-texto-2" data-diario-mais={total - 5}>
              <Camera aria-hidden className="h-4 w-4" strokeWidth={1.75} />+ {total - 5} fotos
            </Link>
          )}
        </div>
      )}
    </Cartao>
  );
}

// ───────────────────────── Atividade recente ─────────────────────────

const ICONE_ATIVIDADE: Record<ItemAtividade["tipo"], LucideIcon> = {
  treino: Dumbbell, recorde: Trophy, comprovante: ReceiptText, preconsulta: ClipboardList, foto: Camera,
};

export function AtividadeRecente({ itens, carregando }: { itens: ItemAtividade[]; carregando: boolean }) {
  const agora = Date.now();
  return (
    <Cartao className="flex flex-col px-[18px] pb-3 pt-4" data-cartao-atividade data-atividade-total={itens.length}>
      <CabecalhoCartao titulo="Atividade recente" />
      {carregando && itens.length === 0 ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-[40px] w-full" />)}</div>
      ) : itens.length === 0 ? (
        <Vazio marca="atividade">Nada novo nos últimos 7 dias. Treinos concluídos, recordes, comprovantes do Pix, pré-consultas respondidas e fotos do diário aparecem aqui.</Vazio>
      ) : (
        <div className="divide-y divide-linha-3">
          {itens.map((i) => {
            const Icone = ICONE_ATIVIDADE[i.tipo];
            return (
              <Link key={i.chave} to={i.link} className="flex min-h-[48px] items-center gap-[11px] py-1 text-[13px]" data-atividade-item={i.tipo} data-atividade-link={i.link} title={`${i.quem} ${i.texto}`}>
                <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-[rgba(255,255,255,.06)] text-texto-2">
                  <Icone aria-hidden className="h-[15px] w-[15px]" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1 truncate text-texto-2"><b className="font-semibold text-texto">{i.quem}</b> {i.texto}</span>
                <span className="flex-none whitespace-nowrap text-[11.5px] text-texto-4">{tempoDesde(i.quando, agora)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}

