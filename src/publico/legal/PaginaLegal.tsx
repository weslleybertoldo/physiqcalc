import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Printer } from "lucide-react";
import { ehLoja } from "@/lib/distribuicao";
import { ESTADO_ABERTA_PELO_APP, abertaPeloApp } from "@/publico/privacidade/textos";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip, type TomChip } from "@/ui/premium/Chip";
import { TERMOS_DE_ASSINATURA } from "./assinatura";
import { politicaDePrivacidade } from "./politica";
import { TERMOS_DE_USO } from "./termos";
import { TextoLegal } from "./TextoLegal";
import { DATA_DOS_TEXTOS, ROTA_ASSINATURA, ROTA_POLITICA, ROTA_TERMOS, VERSAO_TEXTOS } from "./versao";

type Documento = "politica" | "termos" | "assinatura";

const DOCUMENTOS: Record<Documento, { rota: string; titulo: string; rotulo: string; chip: string; tom: TomChip; texto: (loja: boolean) => string }> = {
  politica: { rota: ROTA_POLITICA, titulo: "Política de Privacidade do Physiq", rotulo: "Política de Privacidade", chip: "PRIVACIDADE", tom: "t", texto: politicaDePrivacidade },
  termos: { rota: ROTA_TERMOS, titulo: "Termos de Uso do Physiq", rotulo: "Termos de Uso", chip: "TERMOS DE USO", tom: "n", texto: () => TERMOS_DE_USO },
  assinatura: { rota: ROTA_ASSINATURA, titulo: "Termos de assinatura do Physiq", rotulo: "Termos de assinatura", chip: "ASSINATURA", tom: "c", texto: () => TERMOS_DE_ASSINATURA },
};
const ORDEM: Documento[] = ["politica", "termos", "assinatura"];

function documentoDaRota(pathname: string): Documento {
  const rota = pathname.replace(/\/+$/, "") || "/";
  return ORDEM.find((d) => DOCUMENTOS[d].rota === rota) ?? "politica";
}

function decodificar(ancora: string): string {
  try {
    return decodeURIComponent(ancora);
  } catch {
    return ancora;
  }
}

const CLASSE_VOLTAR = "inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-texto-3 transition-colors hover:text-texto-2";
const CLASSE_LINK = "font-semibold text-violeta-3 underline-offset-2 hover:underline";

/**
 * Impressão ("Imprimir ou salvar em PDF" — o Decreto 7.962/2013, art. 4º, IV, pede o contrato num meio que se guarde): só o
 * documento, em preto no branco, sem a casca pública (marca e rodapé), sem o halo e sem os botões, e a tabela inteira (sem a
 * rolagem do celular). Fica aqui, no pedaço que só o staging baixa, e não no CSS do app.
 */
const CSS_DE_IMPRESSAO = `@media print {
  @page { margin: 16mm 14mm; }
  html, body { background: #fff !important; }
  [data-casca="publico"] > header, [data-casca="publico"] > footer, .pq-halo-web { display: none !important; }
  [data-pagina-legal] { max-width: none !important; padding: 0 !important; }
  [data-pagina-legal], [data-pagina-legal] * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
  [data-pagina-legal] .pq-cartao { border: 0 !important; padding: 0 !important; }
  [data-pagina-legal] [data-tabela-legal] { overflow: visible !important; border-color: #999 !important; }
  [data-pagina-legal] table { min-width: 0 !important; }
  [data-pagina-legal] tr { border-color: #999 !important; break-inside: avoid; }
  [data-pagina-legal] h2, [data-pagina-legal] h3 { break-after: avoid; }
}`;

/**
 * hml-11 (H-28, D3/D4) — /privacidade, /termos e /assinatura com os textos legais NOVOS, na casca pública. Existe SÓ no build de
 * staging até a virada (src/rotas/Rotas.tsx corta o import na produção): o advogado lê no staging, com a faixa "versão em revisão".
 * O documento sai da rota; a versão é a única dos 3 (versao.ts). O "Voltar" volta para o app quando a página foi aberta por um link
 * de dentro dele (o mesmo da Privacidade de hoje), e os links entre os documentos levam esse estado junto, trocando a página no
 * histórico (o Voltar continua voltando para o app).
 */
export default function PaginaLegal() {
  const { pathname, hash, state } = useLocation();
  const navigate = useNavigate();
  const doc = documentoDaRota(pathname);
  const atual = DOCUMENTOS[doc];
  const doApp = abertaPeloApp(state);
  const links = doApp ? { state: ESTADO_ABERTA_PELO_APP, replace: true } : undefined;

  // abre no topo (a rolagem da tela anterior fica na janela) ou na âncora do link (/termos#anexo-…)
  useEffect(() => {
    const alvo = hash ? document.getElementById(decodificar(hash.slice(1))) : null;
    if (alvo) alvo.scrollIntoView?.({ block: "start" });
    else (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  }, [pathname, hash]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 sm:px-8" data-pagina-legal={doc} data-versao={VERSAO_TEXTOS}>
      <style>{CSS_DE_IMPRESSAO}</style>

      {/* sai na virada (D12), junto com a condição das rotas */}
      <p
        role="note"
        className="mb-3 flex items-start gap-2.5 rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] leading-relaxed text-texto"
        style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}
        data-texto-em-revisao
      >
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
        <span>
          <b className="font-semibold">Versão em revisão — ainda não publicada.</b> A versão em vigor está em{" "}
          <a href="https://physiqcalc.com.br/privacidade" className={CLASSE_LINK}>
            physiqcalc.com.br/privacidade
          </a>
          .
        </span>
      </p>

      <div className="print:hidden">
        {doApp ? (
          <button type="button" onClick={() => navigate(-1)} className={CLASSE_VOLTAR} data-voltar="app">
            <ArrowLeft aria-hidden className="h-4 w-4" /> Voltar
          </button>
        ) : (
          <Link to="/" className={CLASSE_VOLTAR} data-voltar>
            <ArrowLeft aria-hidden className="h-4 w-4" /> Voltar
          </Link>
        )}
      </div>

      <header className="mb-4 mt-3">
        <Chip tom={atual.tom}>{atual.chip}</Chip>
        <h1 className="mt-3 font-body text-[26px] font-bold normal-case tracking-[-0.03em] text-texto sm:text-[32px]">{atual.titulo}</h1>
        <p className="mt-1 text-[13px] text-texto-3" data-versao-legal>
          Versão de {DATA_DOS_TEXTOS}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 print:hidden">
          <Botao tamanho="sm" icone={Printer} onClick={() => window.print()} data-imprimir>
            Imprimir ou salvar em PDF
          </Botao>
          <nav aria-label="Outros documentos" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px]">
            {ORDEM.filter((d) => d !== doc).map((d) => (
              <Link key={d} to={DOCUMENTOS[d].rota} state={links?.state} replace={links?.replace} className={CLASSE_LINK} data-link-legal={d}>
                {DOCUMENTOS[d].rotulo}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <Cartao className="p-5 sm:p-7">
        <TextoLegal markdown={atual.texto(ehLoja)} links={links} />
      </Cartao>
    </div>
  );
}
