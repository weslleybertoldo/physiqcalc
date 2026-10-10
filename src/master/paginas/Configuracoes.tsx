import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";
import { ErroMaster, planos, salvarConfig } from "../api";
import { Campo, INPUT, TEXTAREA } from "../pecas/ui";
import { dataHora, moeda, textoErro } from "../regras";
import type { AvisoMudanca } from "../tipos";

type Publico = "calc" | "nutri";
const PUBLICOS: Array<{ id: Publico; rotulo: string; dica: string }> = [
  { id: "calc", rotulo: "Quem veio do PhysiqCalc", dica: "Aparece 1 vez para cada pessoa, no 1º acesso depois da mudança." },
  { id: "nutri", rotulo: "Quem veio do PhysiqNutri", dica: "Aparece 1 vez para cada pessoa, no 1º acesso depois da mudança (o site antigo agora abre o Physiq)." },
];

/**
 * Painel master › Configurações (C62): o resumo das regras (só leitura — o que vale em cobrança, teste, legados e login) e o aviso
 * "o Physiq mudou" (W3): liga/desliga geral e por público, com os textos. Quem já viu não vê de novo (a versão não muda aqui).
 */
export default function Configuracoes() {
  const q = useQuery({ queryKey: ["master", "planos"], queryFn: planos, staleTime: 15_000 });
  const [aviso, setAviso] = useState<AvisoMudanca>({});
  const [ocupado, setOcupado] = useState(false);
  const d = q.data;

  useEffect(() => {
    if (d?.config.aviso_mudanca) setAviso(structuredClone(d.config.aviso_mudanca));
  }, [d]);

  const mudarPublico = (p: Publico, campo: "ativo" | "titulo" | "texto", valor: boolean | string) =>
    setAviso((a) => ({ ...a, [p]: { ...(a[p] ?? {}), [campo]: valor } }));

  async function salvar() {
    setOcupado(true);
    try {
      await salvarConfig("aviso_mudanca", {
        ativo: aviso.ativo === true,
        calc: { ativo: aviso.calc?.ativo === true, titulo: aviso.calc?.titulo ?? "", texto: aviso.calc?.texto ?? "" },
        nutri: { ativo: aviso.nutri?.ativo === true, titulo: aviso.nutri?.titulo ?? "", texto: aviso.nutri?.texto ?? "" },
      });
      toast.success("Aviso \"o Physiq mudou\" salvo.");
      void q.refetch();
    } catch (e) {
      toast.error(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setOcupado(false);
    }
  }

  const original = JSON.stringify(d?.config.aviso_mudanca ?? {});
  const mudou = JSON.stringify(aviso) !== original;
  const limite = (d?.config.login_limite ?? {}) as { escada_min?: number[]; erros_ate_bloquear?: number; captcha?: boolean };
  const preco = (plano: string, faixa: string) => d?.precos.find((p) => p.plano === plano && p.faixa === faixa);

  const regras: Array<[string, string]> = d ? [
    ["Teste grátis da conta nova", `${d.config.teste_dias ?? 14} dias no Treino + Nutrição, até ${d.config.teste_max_alunos ?? 10} alunos ativos`],
    ["Quando paga", "Antes de usar; o acesso vai até o vencimento (inclusive). No dia seguinte o painel trava e os alunos seguem usando o app"],
    ["Pix e cartão à vista", "+1 mês a partir do maior entre o vencimento e hoje (código Pix vale 72 h)"],
    ["Anual", "10 mensalidades por 12 meses"],
    ["Preço de entrada", `Só Treino ou Só Nutrição ${moeda(preco("treino", "f10")?.valor_mensal)} · Treino + Nutrição ${moeda(preco("treino_nutricao", "f10")?.valor_mensal)} (1–10 alunos)`],
    ["Legado PhysiqCalc", `Preço de hoje e ${d.tolerancia_legado_calc} dias de tolerância até trocar de plano`],
    ["Legado PhysiqNutri", "Preço de hoje (R$ 80) e Pix de +30 dias até trocar de plano"],
    ["Aluno sem profissional", `${d.config.aluno_do_app?.teste_dias ?? 7} dias grátis · Treino R$ 29,90 · Treino + Alimentação R$ 49,90 · sem pagar o app fecha`],
    ["Entrar com senha", `${limite.erros_ate_bloquear ?? 4} erros → espera de ${(limite.escada_min ?? [1, 5, 15, 30, 60]).join(", ")} min → bloqueia de vez · captcha ${limite.captcha === false ? "desligado" : "ligado"}`],
    ["Adesão", "Não existe mais (para ninguém)"],
  ] : [];

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="configuracoes">
      <TopoPagina titulo="Configurações" subtitulo="Regras do Physiq e o aviso de mudança"
        acoes={<Botao variante="w" icone={Check} disabled={!mudou || ocupado} onClick={() => void salvar()} data-salvar-aviso>Salvar aviso</Botao>} />
      {q.isLoading ? <EstadoCarregando linhas={6} /> : q.isError ? <EstadoErro aoTentar={() => void q.refetch()} /> : d && (
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Cartao className="px-[18px] pb-4 pt-4" data-cartao-regras>
            <CabecalhoCartao titulo="Resumo das regras" extra={<Chip tom="g" icone={ShieldCheck}>Só leitura</Chip>} />
            <dl className="flex flex-col divide-y divide-linha-3">
              {regras.map(([t, v]) => (
                <div key={t} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[170px_minmax(0,1fr)]" data-regra={t}>
                  <dt className="text-[12.5px] font-semibold text-texto-2">{t}</dt>
                  <dd className="text-[13px] text-texto">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] text-texto-3">Preços, teste e dias grátis mudam em Planos.</p>
          </Cartao>

          <Cartao brilho className="px-[18px] pb-4 pt-4" data-cartao-aviso-mudanca data-aviso-ativo={aviso.ativo ? "1" : "0"}>
            <CabecalhoCartao titulo={'Aviso "o Physiq mudou"'} extra={<Chip tom={aviso.ativo ? "n" : "g"} icone={BellRing}>{aviso.ativo ? "Ligado" : "Desligado"}</Chip>}
              acao={<Interruptor ligado={aviso.ativo === true} aoMudar={(v) => setAviso((a) => ({ ...a, ativo: v }))} rotulo="Aviso ligado" data-aviso-geral={aviso.ativo ? "1" : "0"} />} />
            <p className="mb-3 text-[12.5px] text-texto-3">
              Janela que aparece uma vez para cada pessoa. Versão {aviso.versao ?? "1"} · alterado em {dataHora(d.config.aviso_mudanca_em)}.
            </p>
            <div className="flex flex-col gap-4">
              {PUBLICOS.map((p) => (
                <div key={p.id} className="rounded-2xl border border-linha bg-superficie-3 p-3.5" data-aviso-publico={p.id}>
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <b className="block text-[13.5px] text-texto">{p.rotulo}</b>
                      <span className="block text-[12px] text-texto-3">{p.dica}</span>
                    </span>
                    <Interruptor ligado={aviso[p.id]?.ativo === true} aoMudar={(v) => mudarPublico(p.id, "ativo", v)} rotulo={`Aviso para ${p.rotulo}`}
                      data-aviso-publico-ativo={aviso[p.id]?.ativo ? "1" : "0"} />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <Campo rotulo="Título"><input className={INPUT} value={aviso[p.id]?.titulo ?? ""} maxLength={120} onChange={(e) => mudarPublico(p.id, "titulo", e.target.value)} data-aviso-titulo={p.id} /></Campo>
                    <Campo rotulo="Texto"><textarea className={TEXTAREA} value={aviso[p.id]?.texto ?? ""} maxLength={600} onChange={(e) => mudarPublico(p.id, "texto", e.target.value)} data-aviso-texto={p.id} /></Campo>
                  </div>
                </div>
              ))}
            </div>
          </Cartao>
        </div>
      )}
    </div>
  );
}
