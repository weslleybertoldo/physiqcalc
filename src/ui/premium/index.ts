// Sistema visual premium do Physiq (W1) — porte do premium.css/gerar.py das 8 telas aprovadas.
// Toda tela nova usa estes componentes (spec 4.9): tokens em src/ui/tema/tokens.css, fonte Geist,
// ícones Lucide, sem emoji.
export { Cartao, CabecalhoCartao } from "./Cartao";
export { Chip, type TomChip } from "./Chip";
export { Botao, BotaoIcone, type VarianteBotao } from "./Botao";
export { Avatar } from "./Avatar";
export { iniciais, tempoDesde } from "./texto";
export { Marca } from "./Marca";
export { TabBar, RESERVA_TABBAR, type ItemTabBar } from "./TabBar";
export { Anel } from "./Anel";
export { Area, Sparkline } from "./Area";
export { caminhoSuave, pontosDaSerie, type Ponto } from "./grafico";
export { Kpi, KpiCompacto, type TomKpi } from "./Kpi";
export { Segmentado, type OpcaoSegmentado } from "./Segmentado";
export { FaixaDias, type Dia, type EstadoDia } from "./FaixaDias";
export { GrupoLista, ItemLista } from "./Lista";
export { Tabela, TabelaCabeca, TabelaCorpo, TabelaLinha, TabelaTitulo, TabelaCelula } from "./Tabela";
export { PainelDeslizante } from "./Sheet";
export { BuscaGatilho, PaletaBusca, GrupoBusca, ItemBusca } from "./Busca";
export { useAtalhoBusca, teclaAtalho } from "./atalhos";
export { Esqueleto, EstadoCarregando, EstadoVazio, EstadoErro, EstadoSemInternet } from "./Estados";
export { useOnline } from "./useOnline";
export { FotoComCadeado } from "./FotoComCadeado";
export { Sino } from "./Sino";
export { useAvisos, type AvisoSino } from "./useAvisos";
export { FOTOS_TREINO, FOTOS_REFEICAO, fotoDoTreino, fotoDaRefeicao, type GrupoFoto, type TipoRefeicaoFoto } from "./fotos";
