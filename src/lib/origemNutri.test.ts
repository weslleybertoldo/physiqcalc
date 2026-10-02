import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHAVE_NUTRI_FECHADA,
  CHAVE_VEIO_DO_NUTRI,
  EVENTO_VEIO_DO_NUTRI,
  assinarMarcaNutri,
  capturarOrigemNutri,
  chegouDoNutriPor,
  esquecerChegadaNutri,
  fecharBoasVindasNutri,
  tirarMarcaDaUrl,
  veioDoNutri,
} from "./origemNutri";

// W28: o nutri.physiqcalc.com.br responde 308 para https://physiqcalc.com.br/<caminho>?<query>&origem=nutri (com o #)
function chegar(url: string) {
  window.history.replaceState(null, "", url);
}
const atual = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

beforeEach(() => {
  sessionStorage.clear();
  esquecerChegadaNutri();
  chegar("/");
});
afterEach(() => chegar("/"));

describe("tirarMarcaDaUrl (pura)", () => {
  it("só o origem=nutri sai; o resto da query fica como veio, na mesma ordem", () => {
    expect(tirarMarcaDaUrl("/dashboard", "?origem=nutri", "")).toEqual({ veio: true, url: "/dashboard" });
    expect(tirarMarcaDaUrl("/configuracoes", "?aba=assinatura&preapproval_id=a%2Bb&origem=nutri", "")).toEqual({
      veio: true, url: "/configuracoes?aba=assinatura&preapproval_id=a%2Bb",
    });
    expect(tirarMarcaDaUrl("/f/abc", "?origem=nutri&x=1+2", "")).toEqual({ veio: true, url: "/f/abc?x=1+2" });
    expect(tirarMarcaDaUrl("/", "?origem=NUTRI", "")).toEqual({ veio: true, url: "/" });
  });
  it("o # vai junto (o link 'já logado' leva os tokens nele)", () => {
    expect(tirarMarcaDaUrl("/app", "?origem=nutri", "#access_token=abc&refresh_token=def&type=magiclink")).toEqual({
      veio: true, url: "/app#access_token=abc&refresh_token=def&type=magiclink",
    });
  });
  it("sem a marca não muda nada (o ?origem=legado_nutri do filtro do master não é a marca)", () => {
    expect(tirarMarcaDaUrl("/master/contas", "?origem=legado_nutri", "")).toEqual({ veio: false, url: "/master/contas?origem=legado_nutri" });
    expect(tirarMarcaDaUrl("/treino", "", "")).toEqual({ veio: false, url: "/treino" });
    expect(tirarMarcaDaUrl("/treino", "?x=1", "#")).toEqual({ veio: false, url: "/treino?x=1" });
  });
});

describe("capturarOrigemNutri (antes do React Router — src/main.tsx)", () => {
  it("guarda a marca com o caminho de chegada e tira o origem=nutri da barra de endereço", () => {
    chegar("/pacientes/p1/anamnese?origem=nutri&x=1#topo");
    let avisos = 0;
    const parar = assinarMarcaNutri(() => { avisos += 1; });
    expect(capturarOrigemNutri(1000)).toBe(true);
    parar();
    expect(atual()).toBe("/pacientes/p1/anamnese?x=1#topo");
    expect(veioDoNutri()).toEqual({ caminho: "/pacientes/p1/anamnese", em: 1000 });
    expect(avisos).toBe(1);
  });
  it("com #access_token=… o # fica (o Supabase lê os tokens depois)", () => {
    chegar("/?origem=nutri#access_token=abc&refresh_token=def");
    capturarOrigemNutri();
    expect(atual()).toBe("/#access_token=abc&refresh_token=def");
    expect(veioDoNutri()?.caminho).toBe("/");
  });
  it("sem origem=nutri: não marca e não mexe na URL", () => {
    chegar("/master/contas?origem=legado_nutri");
    expect(capturarOrigemNutri()).toBe(false);
    expect(atual()).toBe("/master/contas?origem=legado_nutri");
    expect(veioDoNutri()).toBeNull();
  });
  it("fechar apaga a marca e ela não volta na mesma sessão do navegador (a URL continua sendo limpa)", () => {
    chegar("/dashboard?origem=nutri");
    capturarOrigemNutri();
    let avisou = false;
    window.addEventListener(EVENTO_VEIO_DO_NUTRI, () => { avisou = true; }, { once: true });
    fecharBoasVindasNutri();
    expect(avisou).toBe(true);
    expect(veioDoNutri()).toBeNull();
    expect(sessionStorage.getItem(CHAVE_NUTRI_FECHADA)).toBe("1");
    chegar("/agenda?origem=nutri");
    expect(capturarOrigemNutri()).toBe(true);
    expect(atual()).toBe("/agenda");
    expect(sessionStorage.getItem(CHAVE_VEIO_DO_NUTRI)).toBeNull();
  });
  it("a chegada pelo Nutri desta carga da página vale mesmo depois de fechar a tela (sem 'Página não encontrada')", () => {
    chegar("/dashboard?origem=nutri");
    capturarOrigemNutri();
    fecharBoasVindasNutri();
    chegar("/rota-antiga-do-nutri?origem=nutri");
    capturarOrigemNutri();
    expect(veioDoNutri()).toBeNull(); // a tela não abre de novo nesta aba...
    expect(chegouDoNutriPor("/rota-antiga-do-nutri")).toBe(true); // ...mas a rota que não existe vai para o início
    expect(chegouDoNutriPor("/outra")).toBe(false);
  });
  it("sem chegada pelo Nutri nesta carga, nenhum caminho conta", () => {
    expect(chegouDoNutriPor("/")).toBe(false);
    expect(chegouDoNutriPor("/qualquer")).toBe(false);
  });
  it("marca estragada no armazenamento ainda conta como 'veio do Nutri'", () => {
    sessionStorage.setItem(CHAVE_VEIO_DO_NUTRI, "{lixo");
    expect(veioDoNutri()).toEqual({ caminho: "/", em: 0 });
  });
});
