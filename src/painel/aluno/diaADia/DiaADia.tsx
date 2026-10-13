import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, RefreshCw, WifiOff } from "lucide-react";
import { hojeSP } from "@/aluno-dia/regras";
import type { ItemDoDia } from "@/aluno-dia/tipos";
import { cn } from "@/lib/utils";
import { planoAtivo } from "@/nutricao/app/dia";
import { fmtHorario, quantidadeCurta } from "@/nutricao/app/dietaUtil";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { useConcluidas, usePlanosDoAluno } from "@/nutricao/editor/lib/consultas";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { LinhaDaRotina } from "../rotinas/LinhaDaRotina";
import { janelaDoPainel } from "../rotinas/regras";
import { useRotinasDoAluno } from "../rotinas/useRotinasDoAluno";
import {
  TEXTOS_DIA, diaNaFicha, diasComRegistro, diasDaJanela, estadoDoDiaADia, macrosDoPosto, macrosDoTotal, quantidadeDoPosto, rotuloCurto,
} from "./regras";
import { useDiaDoAluno } from "./useDiaADia";

const primeiroNome = (nome: string | null | undefined): string => (nome ?? "").trim().split(/\s+/)[0] ?? "";

function ItemPosto({ item: i }: { item: ItemDoDia }) {
  return (
    <li className="flex min-w-0 flex-col text-[12.5px]" data-dia-posto={i.id}>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-texto">{i.nome}</span>
        <span className="flex-none text-[11.5px] tabular-nums text-texto-3">{quantidadeDoPosto(i)}</span>
        <Chip tom="c" className="flex-none">{TEXTOS_DIA.pelo}</Chip>
      </span>
      <span className="text-[11.5px] text-texto-3" data-dia-posto-macros>{macrosDoPosto(i)}</span>
    </li>
  );
}

function Bloco({ children, className, ...resto }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("min-w-0 rounded-2xl border border-linha px-3.5 py-2.5", className)} {...resto}>{children}</section>;
}

/**
 * O "Dia a dia" da aba Dieta da ficha (W-A P6 — spec §4.5; P7 e Q1 do Weslley): o que o aluno registrou no app, dia a dia, nos últimos 14 dias —
 * por refeição do plano, os itens (riscados os que ele tirou), os que ele pôs ("pelo aluno", com os macros) e o ✓; as refeições extras; o que
 * ficou fora do plano (a nutri tirou a refeição depois: o retrato, "refeição tirada do plano"); o total comido × plano e as rotinas do dia
 * (feitas/não). Faixa "A dieta está em “Só ver” (Acessos)." quando travada; vazio: "Nada registrado pelo aluno nestes dias." Só leitura (a
 * nutri, o dono e o master na seção "Dia a dia"; o personal embaixo da adesão). Tudo pelo servidor: a aluno-dia (o dia e as rotinas) e a
 * nutricao (o plano e os ✓, as mesmas consultas da ficha).
 */
export default function DiaADia({ alunoId, pacienteId, nome }: { alunoId: string; pacienteId: string; nome: string | null }) {
  const dia = useDiaDoAluno(alunoId);
  const rotinas = useRotinasDoAluno(alunoId);
  const planos = usePlanosDoAluno(pacienteId);
  const { de, ate } = janelaDoPainel();
  const concluidas = useConcluidas(pacienteId, de, ate);
  const hoje = hojeSP();
  const dias = useMemo(() => diasDaJanela(hoje), [hoje]);
  const [escolhido, setEscolhido] = useState(hoje);
  const visto = dias.includes(escolhido) ? escolhido : hoje;
  const ativo = useMemo(() => planoAtivo(planos.data ?? []), [planos.data]);
  const com = useMemo(
    () => diasComRegistro(dias, dia.data ?? null, concluidas.data ?? [], rotinas.data ?? null),
    [dias, dia.data, concluidas.data, rotinas.data],
  );
  const d = useMemo(
    () => diaNaFicha((ativo as unknown as PlanoAlimentar | null) ?? null, visto, dia.data ?? null, concluidas.data ?? [], rotinas.data ?? null),
    [ativo, visto, dia.data, concluidas.data, rotinas.data],
  );
  const estado = estadoDoDiaADia(dia, [rotinas, planos, concluidas], com);
  const liberada = dia.data?.liberada;

  return (
    <Cartao className="min-w-0 px-[18px] py-4" data-dia-a-dia={estado} data-dia-a-dia-liberada={dia.data ? (liberada ? "1" : "0") : ""}>
      <CabecalhoCartao
        titulo={TEXTOS_DIA.titulo}
        extra={dia.data ? <Chip tom={liberada ? "n" : "g"} data-dia-a-dia-nivel>{liberada ? TEXTOS_DIA.liberada : TEXTOS_DIA.soVer}</Chip> : undefined}
      />
      <p className="-mt-1 mb-3 text-[12.5px] leading-relaxed text-texto-2">{TEXTOS_DIA.subtitulo(primeiroNome(nome))}</p>
      {dia.data && !liberada && (
        <p className="mb-3 flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5 text-[12.5px] text-texto-2" data-dia-a-dia-travada>
          <Eye aria-hidden className="h-4 w-4 flex-none text-ambar-3" />
          <span>
            A dieta está em “Só ver” (<Link to={`/painel/alunos/${encodeURIComponent(alunoId)}/acessos`} className="font-semibold text-violeta-3" data-dia-a-dia-acessos>Acessos</Link>).
          </span>
        </p>
      )}
      {estado === "carregando" ? (
        <Esqueleto className="h-[220px] w-full" />
      ) : estado === "sem-internet" ? (
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-texto-2" data-dia-a-dia-sem-rede>
          <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-ambar-3" /> {TEXTOS_DIA.semInternet}
        </p>
      ) : estado === "erro" ? (
        <div className="flex flex-col items-start gap-2.5" data-leitura>
          <p className="text-[12.5px] text-texto-2">{TEXTOS_DIA.erro}</p>
          <Botao tamanho="sm" icone={RefreshCw} onClick={() => void Promise.all([dia.refetch(), rotinas.refetch()])} data-dia-a-dia-tentar>Tentar de novo</Botao>
        </div>
      ) : estado === "vazio" ? (
        <p className="text-[12.5px] text-texto-3" data-dia-a-dia-vazio>{TEXTOS_DIA.vazio}</p>
      ) : (
        <>
          <div className="pq-sem-barra -mx-0.5 mb-3 flex min-w-0 gap-1.5 overflow-x-auto px-0.5" role="group" aria-label="Escolha o dia" data-leitura data-dia-a-dia-dias>
            {dias.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={x === visto}
                onClick={() => setEscolhido(x)}
                data-dia-a-dia-botao={x}
                data-dia-a-dia-com={com.has(x) ? "1" : "0"}
                className={cn(
                  "relative h-[32px] flex-none whitespace-nowrap rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors",
                  x === visto ? "border-[#FAFAFA] bg-[#FAFAFA] text-[#09090B]" : "border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto",
                )}
              >
                {rotuloCurto(x, hoje)}
                {com.has(x) && <i aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: "var(--p-verde)" }} />}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2.5" data-dia-a-dia-conteudo={visto} data-dia-a-dia-registrou={d.registrou ? "1" : "0"}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5" data-dia-a-dia-total
              data-kcal-comido={Math.round(d.totais.comido.energia_kcal)} data-kcal-plano={Math.round(d.totais.plano.energia_kcal)}>
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-texto-3">{TEXTOS_DIA.totalTitulo}</span>
              <b className="text-[15px] font-semibold text-texto">{TEXTOS_DIA.comido(d.totais.comido.energia_kcal, d.totais.plano.energia_kcal)}</b>
              <span className="text-[12px] text-texto-3">{macrosDoTotal(d.totais.comido)}</span>
            </div>
            {!ativo && <p className="text-[12.5px] text-texto-3" data-dia-a-dia-sem-plano>{TEXTOS_DIA.semPlano}</p>}
            {ativo && d.refeicoes.length === 0 && <p className="text-[12.5px] text-texto-3">{TEXTOS_DIA.semRefeicao}</p>}
            {d.refeicoes.map((r) => (
              <Bloco key={r.refeicao.id} data-dia-refeicao={r.refeicao.id} data-dia-refeicao-feita={r.concluida ? "1" : "0"}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{fmtHorario(r.refeicao.horario) || "—"}</span>
                  <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto">{r.refeicao.nome}</b>
                  <Chip tom={r.concluida ? "n" : "g"} className="flex-none">{r.concluida ? TEXTOS_DIA.marcou : TEXTOS_DIA.naoMarcou}</Chip>
                </div>
                {(r.itens.length > 0 || r.adicionados.length > 0) && (
                  <ul className="mt-1.5 flex min-w-0 flex-col gap-1">
                    {r.itens.map((x) => (
                      <li key={x.item.id} className="flex min-w-0 items-baseline gap-2 text-[12.5px]" data-dia-item={x.item.id} data-dia-item-tirado={x.tirado ? "1" : "0"}>
                        <span className={cn("min-w-0 flex-1 truncate", x.tirado ? "text-texto-3 line-through" : "text-texto-2")}>{x.item.alimento?.nome ?? "Alimento"}</span>
                        <span className="flex-none text-[11.5px] tabular-nums text-texto-3">{quantidadeCurta(x.item)}</span>
                        {x.tirado && <Chip tom="a" className="flex-none" data-dia-item-tirou>{TEXTOS_DIA.tirou}</Chip>}
                      </li>
                    ))}
                    {r.adicionados.map((i) => <ItemPosto key={i.id} item={i} />)}
                  </ul>
                )}
              </Bloco>
            ))}
            {d.extras.map((e) => (
              <Bloco key={e.extra.id} data-dia-extra={e.extra.id} data-dia-extra-feita={e.concluida ? "1" : "0"}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{fmtHorario(e.extra.horario) || "—"}</span>
                  <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto">{e.extra.nome}</b>
                  <Chip tom="c" className="flex-none">{TEXTOS_DIA.extra}</Chip>
                  <Chip tom={e.concluida ? "n" : "g"} className="flex-none">{e.concluida ? TEXTOS_DIA.comeu : TEXTOS_DIA.naoComeu}</Chip>
                </div>
                {e.adicionados.length > 0 && <ul className="mt-1.5 flex min-w-0 flex-col gap-1">{e.adicionados.map((i) => <ItemPosto key={i.id} item={i} />)}</ul>}
              </Bloco>
            ))}
            {d.foraDoPlano.map((g) => (
              <Bloco key={g.refeicao} className="border-dashed" data-dia-fora={g.refeicao}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto-2">{g.refeicao}</b>
                  <Chip tom="a" className="flex-none" data-dia-fora-selo>{TEXTOS_DIA.refeicaoTirada}</Chip>
                </div>
                <ul className="mt-1.5 flex min-w-0 flex-col gap-1">
                  {g.itens.map((i) =>
                    i.tipo === "adicionado" ? (
                      <ItemPosto key={i.id} item={i} />
                    ) : (
                      <li key={i.id} className="flex min-w-0 items-baseline gap-2 text-[12.5px]" data-dia-fora-tirado={i.id}>
                        <span className="min-w-0 flex-1 truncate text-texto-3 line-through">{i.nome}</span>
                        <Chip tom="a" className="flex-none">{TEXTOS_DIA.tirou}</Chip>
                      </li>
                    ),
                  )}
                </ul>
              </Bloco>
            ))}
            <Bloco data-dia-rotinas={d.rotinas.length} data-dia-rotinas-feitas={d.rotinas.filter((r) => r.feita).length}>
              <b className="block text-[13.5px] font-semibold text-texto">{TEXTOS_DIA.rotinas}</b>
              {d.rotinas.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-texto-3">{TEXTOS_DIA.semRotinas}</p>
              ) : (
                <ul className="mt-1 flex min-w-0 flex-col gap-0.5">
                  {d.rotinas.map((r) => (
                    <LinhaDaRotina key={r.id} rotina={r} feita={r.feita} sub={r.detalhe}
                      extra={r.apagada ? <Chip tom="g" className="flex-none">{TEXTOS_DIA.apagada}</Chip> : undefined} />
                  ))}
                </ul>
              )}
            </Bloco>
          </div>
        </>
      )}
    </Cartao>
  );
}
