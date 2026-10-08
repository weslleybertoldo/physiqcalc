import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileText, LogOut, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { MolduraEntrada } from "@/entrada/pecas/Moldura";
import { ultimoApk } from "@/lib/apkRelease";
import { downloadAndInstall } from "@/lib/apkUpdater";
import { avisarErro } from "@/lib/avisoDeErro";
import { useSessao } from "@/nucleo/sessao";
import type { LegalSituacao } from "@/nucleo/situacao";
import { CONTATO_SUPORTE, linkDoSuporte } from "@/nucleo/suporte";
import { destinoDaExclusao } from "@/painel/configuracoes/excluirConta/regras";
import { ESTADO_ABERTA_PELO_APP } from "@/publico/privacidade/textos";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { useOnline } from "@/ui/premium/useOnline";
import { resumoDosTermos } from "../termos";
import { ListaLegal } from "../TextoLegal";
import { DATA_DOS_TEXTOS, ROTA_ASSINATURA, ROTA_POLITICA, ROTA_TERMOS, VERSAO_TEXTOS } from "../versao";
import { aceitarNoAcesso } from "./api";
import CampoNascimento from "./CampoNascimento";
import ConsentimentoSaude, { type ConsentimentoDado } from "./ConsentimentoSaude";
import { erroDoNascimento, mensagemAceite, origemDoAceite, tratarRecusa } from "./regras";

const CLASSE_LINK = "font-semibold text-violeta-3 underline-offset-2 hover:underline";

/** Os 3 textos completos (os Termos de assinatura fazem parte dos Termos de Uso e têm a mesma versão: o aceite cobre — D2). */
const LINKS = [
  { doc: "termos", rota: ROTA_TERMOS, rotulo: "Termos de Uso" },
  { doc: "privacidade", rota: ROTA_POLITICA, rotulo: "Política de Privacidade" },
  { doc: "assinatura", rota: ROTA_ASSINATURA, rotulo: "Termos de assinatura" },
] as const;

const DESLIGADO: LegalSituacao = { versao: null, aceite_pendente: false, saude_pendente: false, nascimento_pendente: false, menor: null };

/**
 * hml-12 (H-30): os termos mudaram e o APK ainda tem o texto velho — o mesmo caminho do "Atualizar para 3.y" do Perfil (a última
 * release do GitHub, baixada e instalada pelo app). Os avisos globais (o "Nova versão disponível") não montam com a porta na frente.
 */
function AtualizarOApp() {
  const [progresso, setProgresso] = useState<number | null>(null);
  const atualizar = async () => {
    setProgresso(0);
    try {
      const r = await ultimoApk();
      if (!r) {
        toast.error("Não achei a atualização agora. Tente de novo em instantes.");
        return;
      }
      const res = await downloadAndInstall(r.url, (p) => setProgresso(p));
      if (res === "permission") toast.info('Libere "instalar apps desconhecidos" para o Physiq e toque de novo.');
    } catch {
      toast.error("Não foi possível baixar a atualização agora.");
    } finally {
      setProgresso(null);
    }
  };
  return (
    <Botao icone={Download} onClick={() => void atualizar()} disabled={progresso !== null} data-aceite-atualizar>
      {progresso === null ? "Atualizar o app" : `Baixando ${progresso}%…`}
    </Botao>
  );
}

/**
 * hml-12 (H-30) — a tela do aceite no acesso (o formato do Nativo OS: versão nova → todos aceitam no próximo acesso). Mostra o resumo
 * dos Termos de Uso e os links dos 3 textos (na mesma janela, com o Voltar do app), a caixa do aceite (que diz também a idade mínima,
 * P5) e, só para o aluno do app, o consentimento de saúde (em destaque, à parte) e a data de nascimento (18+). "Aceitar e continuar"
 * fica travado até as caixas e a data e enquanto grava; deu certo → a situação recarrega e a porta abre. Quem não concorda exclui a
 * conta ou sai. Só no build de staging até a virada (a porta é carregada pelo App.tsx atrás da condição do Vite).
 */
export default function TelaDoAceite({ legal, aoAceitar }: { legal: LegalSituacao; aoAceitar: (legal: LegalSituacao | null) => void }) {
  const { situacao, sair, recarregarSituacao } = useSessao();
  const online = useOnline();
  const resumo = useMemo(() => resumoDosTermos(), []);
  const origem = useMemo(() => origemDoAceite(), []);
  const [aceite, setAceite] = useState(false);
  const [saude, setSaude] = useState<ConsentimentoDado | null>(null);
  const [nascimento, setNascimento] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<{ codigo: string; recarregar: boolean } | null>(null);
  const pedeSaude = legal.saude_pendente;
  const pedeNascimento = legal.nascimento_pendente;
  const pronto = aceite && (!pedeSaude || !!saude) && (!pedeNascimento || nascimento !== "");

  // a porta pode aparecer com o app rolado (a internet voltou no meio do treino): a tela abre no topo
  useEffect(() => {
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  }, []);

  const aceitar = async () => {
    if (!pronto || enviando) return;
    setErro(null);
    if (!online) return setErro({ codigo: "sem_internet", recarregar: false });
    const erroDaData = pedeNascimento ? erroDoNascimento(nascimento) : null;
    if (erroDaData) return setErro({ codigo: erroDaData, recarregar: false });
    setEnviando(true);
    try {
      const r = await aceitarNoAcesso({
        versao: VERSAO_TEXTOS,
        origem,
        saude: pedeSaude && !!saude,
        nascimento: pedeNascimento ? nascimento : null,
      });
      if (r.ok) {
        await recarregarSituacao();
        aoAceitar(r.legal);
        return;
      }
      const falha = r as Extract<typeof r, { ok: false }>;
      // o banco desligou os textos (versão nula): não há o que aceitar
      if (falha.erro === "textos_desligados") {
        await recarregarSituacao();
        aoAceitar(DESLIGADO);
        return;
      }
      // a tela não pediu o que o banco quer (situação velha): a nova traz a caixa de saúde ou a data
      if (falha.erro === "sem_consentimento_saude" || falha.erro === "nascimento_invalido") void recarregarSituacao();
      const recusa = tratarRecusa(falha.erro, falha.versao, VERSAO_TEXTOS, origem);
      if (recusa.avisar) {
        avisarErro({
          origem: "tela",
          mensagem: `aceitar_no_acesso: versao_desatualizada com o banco em ${falha.versao}, atrás do app (${VERSAO_TEXTOS})`,
          lugar: "porta do aceite",
        });
      }
      setErro({ codigo: recusa.codigo, recarregar: recusa.recarregar });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MolduraEntrada rodape={false}>
      <div className="flex flex-col gap-4" data-aceite-no-acesso={legal.versao ?? ""}>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-body text-[24px] font-bold normal-case leading-[1.15] tracking-[-0.03em] text-texto">
            Termos de Uso e Política de Privacidade
          </h1>
          <p className="mt-1 text-[14px] leading-relaxed text-texto-2">
            Para continuar no Physiq, leia e aceite os Termos de Uso e a Política de Privacidade (versão de {DATA_DOS_TEXTOS}).
          </p>
        </div>

        <Cartao className="flex flex-col gap-2.5 p-4">
          <h2 className="flex items-center gap-2 font-body text-[13.5px] font-semibold normal-case tracking-[-0.01em] text-texto">
            <FileText aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
            Resumo dos Termos de Uso
          </h2>
          <div className="text-[13px] leading-relaxed text-texto-2" data-aceite-resumo>
            <ListaLegal itens={resumo} links={{ state: ESTADO_ABERTA_PELO_APP }} />
          </div>
          <nav aria-label="Os textos completos" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {LINKS.map((l) => (
              <Link key={l.doc} to={l.rota} state={ESTADO_ABERTA_PELO_APP} className={CLASSE_LINK} data-aceite-link={l.doc}>
                {l.rotulo}
              </Link>
            ))}
          </nav>
        </Cartao>

        {pedeSaude && (
          <ConsentimentoSaude
            variante="app"
            marcado={!!saude}
            aoMudar={(c) => {
              setSaude(c);
              setErro(null);
            }}
            novaAba={false}
            desabilitado={enviando}
          />
        )}
        {pedeNascimento && (
          <CampoNascimento
            valor={nascimento}
            aoMudar={(valor) => {
              setNascimento(valor);
              setErro(null);
            }}
            desabilitado={enviando}
          />
        )}

        <label className="flex items-start gap-2.5 text-[13.5px] font-medium leading-relaxed text-texto">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 flex-none accent-violeta"
            checked={aceite}
            disabled={enviando}
            onChange={(e) => {
              setAceite(e.target.checked);
              setErro(null);
            }}
            data-aceite-caixa
          />
          <span>Li e aceito os Termos de Uso e a Política de Privacidade, e tenho 16 anos ou mais.</span>
        </label>

        {erro && (
          <div className="flex flex-col gap-2">
            <MensagemForm data-aceite-erro={erro.codigo}>{mensagemAceite(erro.codigo)}</MensagemForm>
            {erro.recarregar && (
              <Botao icone={RotateCw} onClick={() => window.location.reload()} data-aceite-recarregar>
                Recarregar
              </Botao>
            )}
            {/* hml-12 (H-30): no APK, a atualização pelo app; na loja, quem atualiza é a Google Play (só a frase, com o Sair e o Excluir) */}
            {erro.codigo === "atualize_o_app" && origem === "apk" && <AtualizarOApp />}
          </div>
        )}

        <Botao variante="w" className="h-12 w-full rounded-2xl" disabled={!pronto || enviando} onClick={() => void aceitar()} data-aceitar>
          {enviando ? "Registrando…" : "Aceitar e continuar"}
        </Botao>

        <div className="flex flex-col items-center gap-2.5 text-center text-[12.5px] leading-relaxed text-texto-3">
          <p>
            Não concorda?{" "}
            <Link to={destinoDaExclusao(situacao)} className="font-medium text-texto-2 underline underline-offset-2" data-aceite-excluir>
              Excluir minha conta
            </Link>
          </p>
          <button type="button" onClick={() => void sair()} className="pq-botao pq-botao-g pq-botao-sm" data-aceite-sair>
            <LogOut aria-hidden /> Sair
          </button>
          <p>
            Dúvidas:{" "}
            <a href={linkDoSuporte("Termos de Uso do Physiq")} className="font-medium text-texto-2 underline underline-offset-2">
              {CONTATO_SUPORTE}
            </a>
          </p>
        </div>
      </div>
    </MolduraEntrada>
  );
}
