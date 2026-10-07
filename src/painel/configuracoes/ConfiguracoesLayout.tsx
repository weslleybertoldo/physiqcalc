import { useEffect, useRef } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LinksPrivacidade } from "@/publico/privacidade/LinksPrivacidade";
import { tela } from "@/rotas/registro";
import { Carregavel } from "@/ui/casca/Carregavel";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { ABAS_CONFIG, estadoDaAbaConfig } from "./catalogoAbas";

/**
 * Configurações do profissional (spec 4.6): Perfil · Conta · Equipe · Plano · Recebimento · Convite ·
 * Aplicativo · Excluir minha conta (W2 da loja). A aba é `src/painel/configuracoes/<arquivo>.tsx`; sem ela, a aba some. Conta, Equipe, Plano
 * e Recebimento são do dono. A Configurações antiga (`?s=`) saiu na W6: o link antigo cai na aba nova; a
 * Planos do Calc (o fallback do Plano) saiu na W28. W3 da loja: no rodapé, "Política de privacidade · Termos de uso" (as páginas
 * públicas, com o Voltar que volta para a aba aberta).
 */
export default function ConfiguracoesLayout() {
  const dados = useDadosCasca();
  const { pathname } = useLocation();
  const abas = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, dados) !== null);
  const atual = pathname.replace(/^\/painel\/configuracoes\/?/, "").split("/")[0];
  // no celular as abas rolam de lado: a aberta (ex.: "Excluir minha conta", a última — W2 da loja) fica à vista
  const barra = useRef<HTMLElement>(null);
  useEffect(() => {
    barra.current?.querySelector<HTMLElement>(`[data-aba-config="${atual}"]`)?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [atual]);
  return (
    <div data-configuracoes className="flex flex-col">
      <nav ref={barra} aria-label="Abas das configurações" className="pq-sem-barra flex gap-1 overflow-x-auto border-b border-linha">
        {abas.map((a) => {
          const ativa = a.id === atual;
          const Icone = a.icone;
          return (
            <Link
              key={a.id}
              to={`/painel/configuracoes/${a.id}`}
              aria-current={ativa ? "page" : undefined}
              data-aba-config={a.id}
              className={cn(
                "relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors",
                ativa ? "text-texto" : "text-texto-3 hover:text-texto-2",
              )}
            >
              <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              {a.rotulo}
              {ativa && (
                <span
                  aria-hidden
                  className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                  style={{ background: "linear-gradient(90deg,var(--p-violeta-2),var(--p-verde-2))", boxShadow: "0 0 12px rgba(167,139,250,.9)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-5 min-w-0">
        <Outlet />
      </div>
      {/* W3 da loja: a política e os termos à mão em todas as abas (dono e membro; também com o painel travado na aba Excluir) */}
      <footer className="mt-8 border-t border-linha pt-2" data-config-rodape>
        <LinksPrivacidade />
      </footer>
    </div>
  );
}

/** /painel/configuracoes → a primeira aba disponível. */
export function PrimeiraAbaConfig() {
  const dados = useDadosCasca();
  const primeira = ABAS_CONFIG.find((a) => estadoDaAbaConfig(a, dados) !== null);
  return <Navigate to={primeira ? `/painel/configuracoes/${primeira.id}` : "/painel"} replace />;
}

/** Uma aba das Configurações (a registrada); sem ela, a primeira disponível. */
export function AbaConfiguracoes() {
  const { aba = "" } = useParams();
  const dados = useDadosCasca();
  const def = ABAS_CONFIG.find((a) => a.id === aba);
  const Nova = def && estadoDaAbaConfig(def, dados) === "nova" ? tela("abasConfig", def.arquivo) : null;
  if (!def || !Nova) return <PrimeiraAbaConfig />;
  return (
    <Carregavel nome={`configurações ${def.arquivo}`}>
      <Nova />
    </Carregavel>
  );
}
