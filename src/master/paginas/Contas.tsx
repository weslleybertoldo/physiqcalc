import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/ui/premium/Tabela";
import { ErroMaster, listarContas } from "../api";
import { DetalheConta } from "../contas/DetalheConta";
import { NovaContaDialog } from "../contas/NovaContaDialog";
import { cn } from "@/lib/utils";
import { CampoBusca, ChipOrigem, ChipSituacao, ChipsModulos, Filtros, SELECT } from "../pecas/ui";
import { LEGADA, ROTULO_FAIXA, ROTULO_ORIGEM, linhaAlunos, linhaVencimento, textoErro } from "../regras";

type Filtro = "todas" | "ativas" | "vencida" | "teste" | "isenta" | "suspensas";

/**
 * Painel master › Contas (C56 — ex-Professores do Calc + Profissionais do Nutri; R6: conta com membros, N-5, N-8, N-22): todas as
 * contas com dono, membros, módulos, faixa, situação, vencimento, alunos, isenção e origem. A linha abre a folha da conta (ações).
 */
export default function Contas() {
  const [sp, setSp] = useSearchParams();
  const filtro = (sp.get("situacao") as Filtro) || "todas";
  const origem = sp.get("origem") || "";
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false);
  const aberta = sp.get("conta");
  const q = useQuery({
    queryKey: ["master", "contas", filtro, origem],
    queryFn: () => listarContas({ situacao: filtro === "todas" ? null : filtro, origem: origem || null }),
    staleTime: 15_000,
  });
  const todas = q.data?.contas ?? [];
  const termo = busca.trim().toLowerCase();
  const contas = termo ? todas.filter((c) => `${c.nome} ${c.dono?.nome ?? ""} ${c.dono?.email ?? ""}`.toLowerCase().includes(termo)) : todas;
  const r = q.data?.resumo ?? {};
  const mudar = (chave: string, valor: string | null) => {
    const n = new URLSearchParams(sp);
    if (valor) n.set(chave, valor); else n.delete(chave);
    setSp(n, { replace: true });
  };

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="contas" data-total-contas={contas.length}>
      <TopoPagina titulo="Contas" subtitulo={`${r.todas ?? "…"} contas · profissionais, planos e situação`}
        acoes={<Botao variante="w" icone={Plus} onClick={() => setNova(true)} data-master-nova-conta>Nova conta</Botao>} />
      <div className="flex flex-wrap items-center gap-2.5">
        <Filtros rotulo="Situação" valor={filtro} aoMudar={(v) => mudar("situacao", v === "todas" ? null : v)} opcoes={[
          { valor: "todas", rotulo: "Todas", numero: r.todas },
          { valor: "ativas", rotulo: "Ativas", numero: r.ativas },
          { valor: "vencida", rotulo: "Vencidas", numero: r.vencidas },
          { valor: "teste", rotulo: "Em teste" },
          { valor: "isenta", rotulo: "Isentas" },
          { valor: "suspensas", rotulo: "Suspensas", numero: r.suspensas },
        ]} />
        <select className={cn(SELECT, "h-[42px] w-auto min-w-[190px] rounded-[14px]")} value={origem} onChange={(e) => mudar("origem", e.target.value || null)} aria-label="Origem" data-filtro-origem>
          <option value="">Todas as origens</option>
          {(["nova", "legado_calc", "legado_nutri", "app"] as const).map((o) => <option key={o} value={o}>{ROTULO_ORIGEM[o]}</option>)}
        </select>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar conta, dono ou e-mail" data-busca-contas />
      </div>

      <Cartao className="px-4 pb-2 pt-3">
        {q.isLoading ? <EstadoCarregando linhas={6} />
          : q.isError ? <EstadoErro texto={textoErro(q.error instanceof ErroMaster ? q.error.codigo : "erro_interno")} aoTentar={() => void q.refetch()} />
            : contas.length === 0 ? <EstadoVazio icone={Building2} titulo="Nenhuma conta neste filtro" texto="Troque o filtro ou crie uma conta nova." />
              : (
                <Tabela data-tabela-contas>
                  <TabelaCabeca>
                    <tr>
                      <TabelaTitulo>Conta</TabelaTitulo>
                      <TabelaTitulo>Plano</TabelaTitulo>
                      <TabelaTitulo>Situação</TabelaTitulo>
                      <TabelaTitulo>Vencimento</TabelaTitulo>
                      <TabelaTitulo>Alunos</TabelaTitulo>
                      <TabelaTitulo>Origem</TabelaTitulo>
                    </tr>
                  </TabelaCabeca>
                  <TabelaCorpo>
                    {contas.map((c) => (
                      <TabelaLinha key={c.id} className="cursor-pointer" onClick={() => mudar("conta", c.id)} data-linha-conta={c.nome}>
                        <TabelaCelula>
                          <span className="flex min-w-[190px] max-w-[250px] items-center gap-2.5">
                            <Avatar nome={c.nome} tamanho={32} />
                            <span className="min-w-0">
                              <b className="block truncate text-[13.5px] font-semibold">{c.nome}</b>
                              <span className="block truncate text-[12px] text-texto-3">{c.dono?.email ?? "sem dono"}{c.membros > 1 ? ` · ${c.membros} profissionais` : ""}</span>
                            </span>
                          </span>
                        </TabelaCelula>
                        <TabelaCelula>
                          <span className="flex flex-col gap-1">
                            <span className="flex flex-nowrap gap-1"><ChipsModulos modulos={c.modulos} /></span>
                            <span className="whitespace-nowrap text-[11.5px] text-texto-3">{ROTULO_FAIXA[c.faixa]}</span>
                          </span>
                        </TabelaCelula>
                        <TabelaCelula>
                          <span className="flex flex-col items-start gap-1">
                            <ChipSituacao conta={c} />
                            {c.cobranca_legada && <span className="max-w-[150px] text-[11px] font-semibold leading-tight text-ambar-3" data-legada-linha>{LEGADA}</span>}
                          </span>
                        </TabelaCelula>
                        <TabelaCelula className="text-[12.5px] text-texto-2"><span className="line-clamp-2 block max-w-[190px]" title={linhaVencimento(c)}>{linhaVencimento(c)}</span></TabelaCelula>
                        <TabelaCelula className="whitespace-nowrap text-[12.5px]">{linhaAlunos(c)}</TabelaCelula>
                        <TabelaCelula><ChipOrigem origem={c.origem} /></TabelaCelula>
                      </TabelaLinha>
                    ))}
                  </TabelaCorpo>
                </Tabela>
              )}
      </Cartao>
      <DetalheConta contaId={aberta} aoFechar={() => mudar("conta", null)} aoMudou={() => void q.refetch()} />
      <NovaContaDialog aberta={nova} aoMudar={setNova} aoCriada={(id) => { void q.refetch(); mudar("conta", id); }} />
    </div>
  );
}
