// physiqcalc-api (api.physiqcalc.com.br → Banco do Treino). A lógica e o porquê estão em proxy.js.
// Teste: node --test infra/cloudflare/physiqcalc-api/proxy.test.mjs · Publicar: infra/cloudflare/physiqcalc-api/deploy.sh
import { criarProxy } from "./proxy.js";

export default criarProxy();
