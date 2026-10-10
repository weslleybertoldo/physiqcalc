import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";
import { ErroMaster, planos, salvarConfig, salvarPreco } from "../api";
import { Campo, INPUT, Janela } from "../pecas/ui";
import { FAIXAS, PLANOS, ROTULO_FAIXA, ROTULO_PLANO, dataHora, moeda, textoErro } from "../regras";
import type { PrecoPlano } from "../tipos";

const numero = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

/**
 * Painel master › Planos (C59, R2, spec 6.1): a tabela de preços por módulo × faixa (anual = 10 mensalidades), os dias e o limite do
 * teste, os dias grátis do app (aluno sem profissional) e o histórico de mudanças. A adesão não existe mais (R2); a tolerância é só do
 * legado Calc (7 dias, só leitura, até a conta trocar de plano).
 */
export default function Planos() {
  const q = useQuery({ queryKey: ["master", "planos"], queryFn: planos, staleTime: 15_000 });
  const [editar, setEditar] = useState<PrecoPlano | null>(null);
  const [mensal, setMensal] = useState("");
  const [anual, setAnual] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [testeDias, setTesteDias] = useState("");
  const [testeMax, setTesteMax] = useState("");
  const [appDias, setAppDias] = useState("");
  const d = q.data;

  useEffect(() => {
    if (!d) return;
    setTesteDias(String(d.config.teste_dias ?? 14));
    setTesteMax(String(d.config.teste_max_alunos ?? 10));
    setAppDias(String(d.config.aluno_do_app?.teste_dias ?? 7));
  }, [d]);
  useEffect(() => {
    if (!editar) return;
    setMensal(String(editar.valor_mensal).replace(".", ","));
    setAnual(editar.valor_anual === null ? "" : String(editar.valor_anual).replace(".", ","));
    setAtivo(editar.ativo);
  }, [editar]);

  async function guardarPreco() {
    if (!editar) return;
    setOcupado(true);
    try {
      await salvarPreco({ plano: editar.plano, faixa: editar.faixa, valor_mensal: numero(mensal), valor_anual: anual.trim() ? numero(anual) : null, ativo });
      toast.success(`${ROTULO_PLANO[editar.plano]} · ${ROTULO_FAIXA[editar.faixa]}: preço salvo (vale para as contas novas e no próximo pagamento).`);
      setEditar(null);
      void q.refetch();
    } catch (e) {
      toast.error(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setOcupado(false);
    }
  }

  async function guardarTeste() {
    setOcupado(true);
    try {
      await salvarConfig("teste_dias", Number(testeDias));
      await salvarConfig("teste_max_alunos", Number(testeMax));
      await salvarConfig("aluno_do_app", { teste_dias: Number(appDias) });
      toast.success("Regras do teste salvas.");
      void q.refetch();
    } catch (e) {
      toast.error(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setOcupado(false);
    }
  }

  const preco = (plano: string, faixa: string) => d?.precos.find((p) => p.plano === plano && p.faixa === faixa) ?? null;

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="planos">
      <TopoPagina titulo="Planos" subtitulo="Preços por módulo e faixa de alunos · sem adesão" />
      {q.isLoading ? <EstadoCarregando linhas={6} /> : q.isError ? <EstadoErro aoTentar={() => void q.refetch()} /> : d && (
        <>
          <Cartao className="px-[18px] pb-4 pt-4" data-tabela-precos>
            <CabecalhoCartao titulo="Tabela de preços" extra={<Chip tom="g">anual = 10 mensalidades</Chip>} />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {PLANOS.map((pl) => (
                <div key={pl} className="rounded-2xl border border-linha bg-superficie-3 p-3.5" data-coluna-plano={pl}>
                  <div className="mb-2.5 flex items-center gap-2">
                    {pl !== "nutricao" && <Chip tom="t">Treino</Chip>}
                    {pl !== "treino" && <Chip tom="n">Nutrição</Chip>}
                    <b className="ml-auto text-[13px] text-texto">{ROTULO_PLANO[pl]}</b>
                  </div>
                  <div className="flex flex-col divide-y divide-linha-3">
                    {FAIXAS.map((fx) => {
                      const p = preco(pl, fx);
                      return (
                        <div key={fx} className="flex items-center gap-2 py-2" data-preco={`${pl}:${fx}`}>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] text-texto-2">{ROTULO_FAIXA[fx]}</span>
                            <b className="block text-[15px] tabular-nums text-texto">{p ? moeda(p.valor_mensal) : "—"}<span className="text-[11.5px] font-medium text-texto-3">/mês</span></b>
                            <span className="block text-[11.5px] text-texto-3">{p?.valor_anual ? `${moeda(p.valor_anual)}/ano` : ""}{p && p.contas ? ` · ${p.contas} conta(s)` : ""}{p && !p.ativo ? " · fora de venda" : ""}</span>
                          </span>
                          {p && <Botao tamanho="sm" icone={Pencil} onClick={() => setEditar(p)} aria-label={`Editar ${ROTULO_PLANO[pl]} ${ROTULO_FAIXA[fx]}`} data-editar-preco={`${pl}:${fx}`}>Editar</Botao>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Cartao>

          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
            <Cartao className="px-[18px] pb-4 pt-4" data-cartao-teste>
              <CabecalhoCartao titulo="Teste grátis e regras" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo rotulo="Dias de teste"><input className={INPUT} inputMode="numeric" value={testeDias} onChange={(e) => setTesteDias(e.target.value)} data-campo-teste-dias /></Campo>
                <Campo rotulo="Alunos no teste"><input className={INPUT} inputMode="numeric" value={testeMax} onChange={(e) => setTesteMax(e.target.value)} data-campo-teste-max /></Campo>
                <Campo rotulo="Dias grátis do app"><input className={INPUT} inputMode="numeric" value={appDias} onChange={(e) => setAppDias(e.target.value)} data-campo-app-dias /></Campo>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-texto-3">
                <Chip tom="g">Tolerância do legado Calc: {d.tolerancia_legado_calc} dias (só leitura)</Chip>
                <Chip tom="g">Adesão: não existe mais</Chip>
                <Botao tamanho="sm" variante="w" className="ml-auto" onClick={() => void guardarTeste()} disabled={ocupado} data-salvar-teste>Salvar regras</Botao>
              </div>
            </Cartao>
            <Cartao className="px-[18px] pb-3 pt-4" data-cartao-historico-precos>
              <CabecalhoCartao titulo="Histórico de mudanças" extra={<Chip tom="g">{d.historico.length}</Chip>} />
              {d.historico.length === 0 ? <p className="py-4 text-[13px] text-texto-3">Nenhuma mudança na tabela ainda.</p> : (
                <ol className="flex flex-col gap-1.5 text-[12.5px]">
                  {d.historico.slice(0, 8).map((h) => {
                    const a = (h.antes ?? {}) as Record<string, unknown>;
                    const n = (h.depois ?? {}) as Record<string, unknown>;
                    return (
                      <li key={h.id} className="flex gap-3" data-historico-preco>
                        <span className="w-[118px] flex-none text-texto-3">{dataHora(h.em)}</span>
                        <span className="min-w-0 flex-1 text-texto-2">
                          {ROTULO_PLANO[(n.plano ?? a.plano) as keyof typeof ROTULO_PLANO] ?? String(n.plano ?? a.plano)} · {ROTULO_FAIXA[(n.faixa ?? a.faixa) as keyof typeof ROTULO_FAIXA] ?? ""}:{" "}
                          {a.valor_mensal !== undefined ? `${moeda(a.valor_mensal as number)} → ` : ""}{moeda(n.valor_mensal as number)}{h.por ? ` · ${h.por}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Cartao>
          </div>
        </>
      )}
      <Janela aberta={Boolean(editar)} aoMudar={(a) => !a && setEditar(null)} titulo={editar ? `${ROTULO_PLANO[editar.plano]} · ${ROTULO_FAIXA[editar.faixa]}` : "Preço"}
        descricao="Vale para contas novas e para o próximo pagamento de quem está na tabela. Os legados mantêm o preço de hoje até trocar de plano." data-janela-preco
        rodape={(
          <>
            <Botao tamanho="sm" onClick={() => setEditar(null)}>Cancelar</Botao>
            <Botao tamanho="sm" variante="w" onClick={() => void guardarPreco()} disabled={ocupado || !(numero(mensal) > 0)} data-salvar-preco>Salvar preço</Botao>
          </>
        )}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Mensal (R$)"><input className={INPUT} inputMode="decimal" value={mensal} onChange={(e) => setMensal(e.target.value)} data-campo-mensal /></Campo>
          <Campo rotulo="Anual (R$)" dica={numero(mensal) > 0 ? `10 mensalidades = ${moeda(numero(mensal) * 10)}` : undefined}>
            <input className={INPUT} inputMode="decimal" value={anual} onChange={(e) => setAnual(e.target.value)} data-campo-anual />
          </Campo>
        </div>
        <label className="flex items-center gap-2.5 text-[13px] text-texto-2">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-violeta" data-campo-ativo />
          À venda (aparece em Configurações › Plano)
        </label>
      </Janela>
    </div>
  );
}
