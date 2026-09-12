import { Link } from "react-router-dom";
import { ArrowLeftRight, Library, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/saasApi";
import {
  BTN_SECUNDARIO, Carregando, Dado, ErroCarregar, Etiqueta, REGRA_LABEL, Secao, TituloPagina, nomeDoUser, usePlanosMaster,
} from "@/components/master/masterUi";

// Configurações (master): resumo somente-leitura das regras (edição fica em Planos), conta master e atalhos.
const ConfiguracoesMasterPage = () => {
  const { user } = useAuth();
  const { regras, loading, erro, recarregar } = usePlanosMaster();

  return (
    <div data-pagina="master-configuracoes">
      <TituloPagina titulo="Configurações" sub="Regras gerais (leitura), sua conta e atalhos." />

      <Secao
        titulo="Regras gerais"
        acao={<Link to="/master/planos#regras" className={BTN_SECUNDARIO} data-link-editar-regras>Editar em Planos</Link>}
      >
        {erro && <ErroCarregar texto={erro} onRetry={() => void recarregar()} />}
        {loading && !regras ? <Carregando /> : regras && (
          <div className="border border-muted-foreground/30 p-4" data-regras-leitura>
            <Dado k={REGRA_LABEL.adesao_professor} v={fmtBRL(regras.adesao_professor)} destaque />
            <Dado k={REGRA_LABEL.tolerancia_dias} v={`${regras.tolerancia_dias} dias`} />
            <Dado k={REGRA_LABEL.trial_dias} v={`${regras.trial_dias} dias`} />
            <Dado k={REGRA_LABEL.itens_pagina} v={String(regras.itens_pagina)} />
          </div>
        )}
      </Secao>

      <Secao titulo="Conta master">
        <div className="border border-muted-foreground/30 p-4" data-conta-master>
          <Dado k="Nome" v={nomeDoUser(user) || "—"} />
          <Dado k="E-mail" v={user?.email ?? "—"} />
          <Dado k="Papel" v={<Etiqueta tom="ok">Master</Etiqueta>} />
          <Dado k="Ambiente" v={<Etiqueta tom={DB_SCHEMA === "staging" ? "aviso" : "neutro"}>{DB_SCHEMA === "staging" ? "staging" : "produção"}</Etiqueta>} />
        </div>
        <p className="text-[11px] text-muted-foreground font-body mt-2">
          Login só com Google. O master também é professor dos próprios alunos e está isento da cobrança de plano.
        </p>
      </Secao>

      <Secao titulo="Atalhos">
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/alunos" className={`${BTN_SECUNDARIO} inline-flex items-center gap-2`} data-atalho="/admin/alunos">
            <Users size={12} />Admin dos meus alunos
          </Link>
          <Link to="/master/integracoes" className={`${BTN_SECUNDARIO} inline-flex items-center gap-2`} data-atalho="/master/integracoes">
            <ArrowLeftRight size={12} />Integrações
          </Link>
          <Link to="/master/biblioteca" className={`${BTN_SECUNDARIO} inline-flex items-center gap-2`} data-atalho="/master/biblioteca">
            <Library size={12} />Biblioteca global
          </Link>
        </div>
      </Secao>
    </div>
  );
};

export default ConfiguracoesMasterPage;
