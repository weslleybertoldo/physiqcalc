import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CreditCard, Lock, QrCode, Save, Unlock } from "lucide-react";
import { toast } from "sonner";
import { principal } from "@/integrations/principal/client";
import { useConta } from "@/nucleo/conta";
import RecebimentosLista from "@/components/admin/RecebimentosLista";
import ComprovantePixCard from "@/components/admin/ComprovantePixCard";
import { buscarResumoDaConta } from "@/financeiro/api";
import type { ModoRecebimento } from "@/financeiro/tipos";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { OpcoesPilula, SecaoForm, type OpcaoPilula } from "./pecas/Form";

interface ContaRecebimento {
  id: string;
  nome: string;
  origem: string;
  recebimento_modo: ModoRecebimento;
  bloquear_app_inadimplente: boolean;
}

/**
 * Configurações › Recebimento (spec 4.6 — W6; C51, N-24, R15, R16, P13): como os alunos pagam — Pix na chave da conta (só uma
 * ligada; o aluno anexa o comprovante e você confirma), "não cobrar pelo app" ou Mercado Pago (só quando o master libera
 * para a conta) — e o "bloquear o app do aluno com mensalidade vencida". Embaixo, os comprovantes aguardando a sua
 * confirmação (é por aqui que a conta que ainda não tem a página Financeiro nova confere os Pix). Só o dono.
 * hml-17 (H-39): a leitura dos comprovantes falhou → o aviso com "Tentar de novo" e o contador "—" (antes, "0" e "Nenhum comprovante
 * aguardando." com Pix esperando a confirmação).
 */
export default function Recebimento() {
  const { conta, situacao } = useConta();
  const qc = useQueryClient();
  const master = !!situacao?.master;
  const chave = ["recebimento-conta", conta?.id] as const;
  const consulta = useQuery({
    queryKey: chave,
    enabled: !!conta?.id,
    queryFn: async () => {
      const { data, error } = await principal.from("contas").select("id, nome, origem, recebimento_modo, bloquear_app_inadimplente").eq("id", conta!.id).single();
      if (error) throw error;
      return data as unknown as ContaRecebimento;
    },
  });
  const pendentes = useQuery({ queryKey: ["financeiro-resumo-conta", conta?.id], enabled: !!conta?.id, queryFn: () => buscarResumoDaConta(conta!.id) });
  const [modo, setModo] = useState<ModoRecebimento>("pix_manual");
  const [bloquear, setBloquear] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!consulta.data) return;
    setModo(consulta.data.recebimento_modo);
    setBloquear(consulta.data.bloquear_app_inadimplente);
  }, [consulta.data]);

  if (!conta) {
    return <div data-config-aba="recebimento" data-estado-aba="vazio"><EstadoVazio titulo="Nenhuma conta ativa" texto="O recebimento aparece aqui quando você faz parte de uma conta de profissional." /></div>;
  }
  const c = consulta.data;
  const pendentesFalhou = pendentes.isError && !pendentes.data;
  const mpLiberado = master || c?.recebimento_modo === "mercadopago";
  const opcoes: OpcaoPilula<ModoRecebimento>[] = [
    { valor: "pix_manual", rotulo: "Pix na sua chave", dica: "O aluno paga pelo banco dele e anexa o comprovante; você confirma", icone: QrCode },
    { valor: "nenhum", rotulo: "Não cobrar pelo app", dica: "Você cobra por fora e registra o pagamento no financeiro do aluno", icone: Ban },
    { valor: "mercadopago", rotulo: "Mercado Pago", dica: "Pix e cartão com confirmação automática", icone: CreditCard, desligada: !mpLiberado,
      porque: "Só quando o master libera para a conta — fale com o suporte" },
  ];

  const salvar = async (patch: Partial<Pick<ContaRecebimento, "recebimento_modo" | "bloquear_app_inadimplente">>, ok: string) => {
    setSalvando(true);
    try {
      const { data, error } = await principal.from("contas").update(patch).eq("id", conta.id).select("recebimento_modo, bloquear_app_inadimplente");
      if (error) throw error;
      const linha = (data ?? [])[0] as Pick<ContaRecebimento, "recebimento_modo" | "bloquear_app_inadimplente"> | undefined;
      if (!linha) throw new Error("sem permissão");
      if (patch.recebimento_modo && linha.recebimento_modo !== patch.recebimento_modo) {
        toast.error("O Mercado Pago só é ligado pelo master.");
      } else {
        toast.success(ok);
      }
      await qc.invalidateQueries({ queryKey: chave });
    } catch (e) {
      console.error("[Recebimento] salvar:", e);
      toast.error("Não deu para salvar agora. Confira a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div data-config-aba="recebimento" className="flex flex-col gap-3.5">
      <TopoPagina titulo="Recebimento" subtitulo={`${conta.nome} · como os alunos pagam`} />
      {consulta.isLoading || !c ? (
        <div className="grid gap-3.5 lg:grid-cols-2"><Esqueleto className="h-[260px] rounded-[22px]" /><Esqueleto className="h-[260px] rounded-[22px]" /></div>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          <SecaoForm brilho titulo="Como seus alunos pagam" marca="recebimento-modo"
            extra={<Chip tom={c.recebimento_modo === "mercadopago" ? "c" : c.recebimento_modo === "nenhum" ? "g" : "n"}>{c.recebimento_modo === "mercadopago" ? "MERCADO PAGO" : c.recebimento_modo === "nenhum" ? "POR FORA" : "PIX NA CHAVE"}</Chip>}
            descricao="Vale para todos os alunos da conta, na tela Pagamentos do app (e para os pacientes do Nutri, que passam a ter o Pagar).">
            <div className="flex flex-col gap-4">
              <OpcoesPilula nome="recebimento-modo" rotulo="Forma" colunas={1} opcoes={opcoes} valores={[modo]} aoMudar={(v) => setModo(v[0] ?? modo)} />
              {c.recebimento_modo === "mercadopago" && modo !== "mercadopago" && !master && (
                <p className="text-[12px] text-ambar-3">Saindo do Mercado Pago, voltar a ele depende do master.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
                <Botao variante="w" icone={Save} disabled={salvando || modo === c.recebimento_modo} onClick={() => void salvar({ recebimento_modo: modo }, "Forma de recebimento salva.")} data-recebimento-salvar-modo>
                  {salvando ? "Salvando…" : "Salvar a forma"}
                </Botao>
              </div>
            </div>
          </SecaoForm>

          <div className="flex flex-col gap-3.5">
            <SecaoForm titulo="Chaves Pix" marca="recebimento-chaves" descricao="Só uma fica ligada por vez — é ela que o aluno vê.">
              <RecebimentosLista contaId={conta.id} membroId={conta.membro_id ?? null} podeEditar />
            </SecaoForm>
            <SecaoForm titulo="Aluno com pagamento vencido" marca="recebimento-bloqueio"
              extra={<Chip tom={c.bloquear_app_inadimplente ? "a" : "g"} icone={c.bloquear_app_inadimplente ? Lock : Unlock}>{c.bloquear_app_inadimplente ? "BLOQUEIA" : "SÓ AVISA"}</Chip>}
              descricao="Bloqueado, o app do aluno fecha e só Pagamentos abre, até ele pagar. Desligado, ele só recebe o aviso no topo do app.">
              <OpcoesPilula nome="recebimento-bloqueio" rotulo="Mensalidade ou cobrança vencida" colunas={1}
                opcoes={[
                  { valor: "nao", rotulo: "Só avisar o aluno", dica: "A faixa do topo fica vermelha; o app continua", icone: Unlock },
                  { valor: "sim", rotulo: "Bloquear o app do aluno", dica: "Só a tela Pagamentos abre até ele pagar", icone: Lock },
                ]}
                valores={[bloquear ? "sim" : "nao"]}
                aoMudar={(v) => {
                  const novo = v[0] === "sim";
                  setBloquear(novo);
                  void salvar({ bloquear_app_inadimplente: novo }, novo ? "Bloqueio do inadimplente ligado." : "Bloqueio do inadimplente desligado.");
                }} />
            </SecaoForm>
          </div>
        </div>
      )}

      <SecaoForm titulo="Comprovantes aguardando a sua confirmação" marca="recebimento-pendentes"
        extra={
          <Chip tom={(pendentes.data?.pendentes.length ?? 0) > 0 ? "c" : "g"} data-recebimento-pendentes-contador>
            {pendentesFalhou ? "—" : pendentes.data?.pendentes.length ?? 0}
          </Chip>
        }
        descricao="O aluno pagou o Pix na sua chave e anexou o comprovante. Confira o valor antes de confirmar.">
        {pendentes.isLoading ? (
          <Esqueleto className="h-[92px] w-full rounded-2xl" />
        ) : pendentesFalhou ? (
          <div data-recebimento-pendentes-erro>
            <EstadoErro titulo="Não deu para carregar os comprovantes" aoTentar={() => void pendentes.refetch()} />
          </div>
        ) : !(pendentes.data?.pendentes.length) ? (
          <p className="text-[13px] text-texto-2" data-recebimento-sem-pendentes>Nenhum comprovante aguardando.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pendentes.data.pendentes.map((p) => (
              <div key={p.id} className="flex flex-col gap-1.5">
                <ComprovantePixCard item={p} onResolvido={() => void qc.invalidateQueries({ queryKey: ["financeiro-resumo-conta", conta.id] })} />
                <Link to={`/painel/alunos/${p.aluno.treino_user_id ?? p.aluno.paciente_id}/financeiro`} className="px-1 text-[12px] font-semibold text-violeta-3" data-link-financeiro-aluno>
                  Abrir o financeiro de {p.aluno.nome ?? "aluno"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </SecaoForm>
    </div>
  );
}
