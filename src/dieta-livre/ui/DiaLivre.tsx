// Physiq W-A P5 — as peças da aba Dieta "Pode mexer" (spec §4.4): as refeições EXTRAS do dia (a mesma linha das refeições do plano), os 2 botões
// embaixo da lista ("Nova refeição" · "Meus alimentos e receitas") e as 3 folhas novas, abertas pelo `?ver=` da aba (o Voltar do aparelho
// fecha): adicionar (`r` = a refeição do plano · `e` = a extra), extra (nova ou `e`) e meus.
import { NotebookTabs, Plus } from "lucide-react";
import { adicionarNoDia, marcarExtra } from "@/aluno-dia/api";
import type { DiaAplicado, ExtraNoDia } from "@/aluno-dia/regras";
import { LinhaRefeicao } from "@/nutricao/app/ui/LinhaRefeicao";
import { Botao } from "@/ui/premium/Botao";
import { fotoDaRefeicao } from "@/ui/premium/fotos";
import { linhaDaExtra, type FolhaDoDia, type Lugar } from "../regras";
import { TEXTOS } from "../textos";
import type { Gravacao } from "../useDietaLivre";
import { FolhaAdicionar } from "./FolhaAdicionar";
import { FolhaExtra } from "./FolhaExtra";
import { FolhaMeusAlimentos } from "./FolhaMeusAlimentos";

type Abrir = (f: FolhaDoDia | "refeicao", extra?: Record<string, string>, substituir?: boolean) => void;

/** As refeições extras do dia, logo depois das do plano (tocar abre; o ✓ verde desmarca o "Já comi"). */
export function ExtrasDoDia({ extras, ocupado, desligado, aoAbrir, gravar }: {
  extras: ExtraNoDia[];
  ocupado: string | null;
  desligado: boolean;
  aoAbrir: (id: string) => void;
  gravar: (g: Gravacao) => Promise<boolean>;
}) {
  if (extras.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2" data-extras={extras.length}>
      {extras.map((e) => {
        const l = linhaDaExtra(e);
        const foto = fotoDaRefeicao(e.extra.nome, e.extra.horario);
        return (
          <div key={e.extra.id} data-extra={e.extra.id} data-extra-concluida={e.concluida ? "1" : "0"}>
            <LinhaRefeicao id={e.extra.id} nome={e.extra.nome} linha={`${l.linha} · extra`} kcal={l.kcal} foto={foto} fotoPadrao={foto}
              estado={e.concluida ? "feita" : "pendente"} salvando={ocupado === `extra-marcar:${e.extra.id}`} desligado={desligado || !!ocupado}
              aoAbrir={() => aoAbrir(e.extra.id)}
              aoMarcar={(c) => void gravar({ chave: `extra-marcar:${e.extra.id}`, fazer: () => marcarExtra(e.extra.id, c) })} />
          </div>
        );
      })}
    </div>
  );
}

/** "Nova refeição" (só quando a matrícula do plano ativo é a da tela — o servidor põe a extra nela) e "Meus alimentos e receitas".
 *  `flex-wrap`: os 2 rótulos (o botão não quebra texto) não cabem lado a lado em 390 px — sem isso a página passava de 431 px e as folhas
 *  (fixas no fundo) ficavam com os botões abaixo da tela. Não cabendo, o 2º desce para a linha de baixo, cada um com a largura toda. */
export function BotoesDoDia({ extra, desligado, aoNovaRefeicao, aoMeus }: { extra: boolean; desligado: boolean; aoNovaRefeicao: () => void; aoMeus: () => void }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2.5" data-dieta-livre="liberada">
      {extra && (
        <Botao variante="g" icone={Plus} className="flex-1" onClick={aoNovaRefeicao} disabled={desligado} data-dieta-nova-refeicao>{TEXTOS.novaRefeicao}</Botao>
      )}
      <Botao variante="g" icone={NotebookTabs} className="flex-1" onClick={aoMeus} data-dieta-meus>{TEXTOS.meus}</Botao>
    </div>
  );
}

export function FolhasDoDia({ folha, params, abrir, fechar, aplicado, hoje, desligado, gravar, ocupado }: {
  folha: string | null;
  params: URLSearchParams;
  abrir: Abrir;
  fechar: () => void;
  aplicado: DiaAplicado;
  hoje: string;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  ocupado: string | null;
}) {
  const r = params.get("r");
  const e = params.get("e");
  const refeicao = r ? aplicado.refeicoes.find((x) => x.refeicao.id === r) ?? null : null;
  const extra = e ? aplicado.extras.find((x) => x.extra.id === e) ?? null : null;
  const lugar: Lugar | null = refeicao
    ? { tipo: "refeicao", id: refeicao.refeicao.id, nome: refeicao.refeicao.nome }
    : extra ? { tipo: "extra", id: extra.extra.id, nome: extra.extra.nome } : null;
  const mudar = (aberta: boolean) => {
    if (!aberta) fechar();
  };
  const por = async (dados: Parameters<typeof adicionarNoDia>[1]) => {
    const ok = await gravar({ chave: "adicionar", fazer: () => adicionarNoDia(hoje, dados), ok: TEXTOS.posto });
    // deu certo → volta para a refeição (no lugar do "adicionar", como o Voltar faria), com o que ele pôs na lista
    if (ok && lugar) abrir(lugar.tipo === "refeicao" ? "refeicao" : "extra", lugar.tipo === "refeicao" ? { r: lugar.id } : { e: lugar.id }, true);
    return ok;
  };
  return (
    <>
      <FolhaAdicionar aberta={folha === "adicionar" && !!lugar} aoMudar={mudar} lugar={lugar} ocupado={!!ocupado} desligado={desligado} aoPor={por} />
      <FolhaExtra aberta={folha === "extra" && (!e || !!extra)} aoMudar={mudar} extra={extra} hoje={hoje} ocupado={ocupado} desligado={desligado}
        gravar={gravar} aoAdicionar={(id) => abrir("adicionar", { e: id }, true)} />
      <FolhaMeusAlimentos aberta={folha === "meus"} aoMudar={mudar} ocupado={ocupado} desligado={desligado} gravar={gravar} />
    </>
  );
}
