"""Physiq W8b — base dos testes de ponta a ponta do limite de tentativas no login (NO SERVIDOR), da senha provisória criada pelo
profissional e da tela "crie a sua senha". Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE
em ~/.physiq-teste-<nome>.

Contas de TESTE da W8b (SÓ *.teste.claude@physiqnutri.app — P26; criadas por e2e/w08b/contas.py):
  staging
    w8b-personal  w8b.personal.teste.claude@physiqnutri.app  "Lucas Ferreira" — dono + personal da "Consultoria Ferreira W8b"
    w8b-outro     w8b.outro.teste.claude@physiqnutri.app     "Outra Profissional" — dona de OUTRA conta (não mexe no acesso do aluno)
    w8b-aluno     w8b.aluno.teste.claude@physiqnutri.app     "Rafael Moura" — aluno do Lucas (Treino); a senha nova provisória
    w8b-novo      (sem login)                                "Bruno Novo" — matrícula sem login: "Criar acesso" cria com o e-mail
                  w8b.novo.teste.claude@physiqnutri.app
    w8b-bloqueio  w8b.bloqueio.teste.claude@physiqnutri.app  a escada 1 → 5 → 15 → 30 → 60 min → de vez (tela e API)
    w8b-google    w8b.google.teste.claude@physiqnutri.app    "entrar com o Google destrava" (pos-login com JWT de login Google)
  produção (só o que o smoke precisa, descartáveis — apagadas no fim do smoke)
    w8b-prod-bloqueio / w8b-prod-google  w8b.prod.bloqueio/google.teste.claude@physiqnutri.app
Nenhuma conta real e nenhuma conta de outra W (as provas dele — prova.teste.claude e w7b.prod.teste.claude — ficam intocadas).

Captcha: o Chromium do Playwright é automação e o Turnstile de verdade recusa (erro 600010). Os tokens vêm do Edge de verdade
(e2e/w08b/fonte_turnstile.py, na tela :0, hostname localhost — o mesmo do APK) e a página do teste troca SÓ o script do widget
por um que entrega esses tokens reais: quem confere o token é a função entrar-senha, de verdade.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import importlib.util
import json
import sys
import time
import urllib.request
from pathlib import Path

_ESPEC = importlib.util.spec_from_file_location("_base_w05", Path(__file__).parent.parent / "w05" / "_base.py")
B5 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w05"] = B5
_ESPEC.loader.exec_module(B5)  # type: ignore[union-attr]

sys.path.insert(0, str(Path(__file__).parent))
from fonte_turnstile import pedir_token  # noqa: E402

API_P, CONTAS, ESTADO, PRINCIPAL_REF, PRINCIPAL_URL = B5.API_P, B5.CONTAS, B5.ESTADO, B5.PRINCIPAL_REF, B5.PRINCIPAL_URL
Caso, anon, http, p, service = B5.Caso, B5.anon, B5.http, B5.p, B5.service
sql_principal, senha_de, sessao, rpc, uid, garantir_usuario = B5.sql_principal, B5.senha_de, B5.sessao, B5.rpc, B5.uid, B5.garantir_usuario

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w08b"
B5.PRINTS = PRINTS
FONTE = "http://localhost:5173"  # a fonte de tokens (fonte_turnstile.py --porta 5173) — o app local roda na 8080
TURNSTILE_JS = "https://challenges.cloudflare.com/turnstile/v0/api.js"

NOMES = {
    "w8b-personal": "Lucas Ferreira",
    "w8b-outro": "Outra Profissional",
    "w8b-aluno": "Rafael Moura",
    "w8b-bloqueio": "Bloqueio W8b",
    "w8b-google": "Google W8b",
    "w8b-prod-bloqueio": "Bloqueio Prod W8b",
    "w8b-prod-google": "Google Prod W8b",
}
EMAIL = {k: f"{k.replace('w8b-prod-', 'w8b.prod.').replace('w8b-', 'w8b.')}.teste.claude@physiqnutri.app" for k in NOMES}
for k in NOMES:
    CONTAS.setdefault(k, (EMAIL[k], senha_de(k)))
EMAIL_NOVO = "w8b.novo.teste.claude@physiqnutri.app"
NOME_NOVO = "Bruno Novo"
NOME_CONTA = "Consultoria Ferreira W8b"


def schema() -> str:
    return ESTADO["schema"]


def q(sql: str) -> list:
    return sql_principal(sql)


# ───────────────────────── a função entrar-senha ─────────────────────────

def token_real() -> str:
    return pedir_token(FONTE, limite=60)


def entrar_senha(email: str, senha: str, captcha: str | None = "real", origem: str = "https://physiqcalc-staging.vercel.app",
                 pelo_proxy: bool = True) -> tuple[int, dict]:
    """Uma tentativa pela função (como o app). captcha="real" pega um token do Edge; None/"" manda sem."""
    tok = token_real() if captcha == "real" else (captcha or "")
    base = API_P if pelo_proxy else PRINCIPAL_URL
    st, r, _ = http("POST", f"{base}/functions/v1/entrar-senha", {"email": email, "senha": senha, "captcha": tok},
                    {"apikey": anon(PRINCIPAL_REF), "x-schema": schema(), "Origin": origem}, timeout=40)
    return st, (r if isinstance(r, dict) else {"_": r})


def estado(email: str) -> dict | None:
    r = q(f"select erros, bloqueado_ate, bloqueado_de_vez_em, em_andamento_ate from {schema()}.login_bloqueios where email = lower('{email}')")
    return r[0] if r else None


def acelerar(email: str) -> None:
    """Acelera o relógio: o bloqueio temporário acaba agora (não espera de verdade)."""
    q(f"update {schema()}.login_bloqueios set bloqueado_ate = now() - interval '1 second', em_andamento_ate = null where email = lower('{email}')")


def zerar(email: str) -> None:
    q(f"delete from {schema()}.login_bloqueios where email = lower('{email}')")


def hash_do_meu_ip() -> str:
    """O hash que a função grava para o IP DESTE aparelho (mesmo sal e formato de _shared/entrar-senha-regras.ts)."""
    with urllib.request.urlopen("https://api.ipify.org", timeout=20) as r:
        ip = r.read().decode().strip().lower()
    sal = Path.home().joinpath(".physiq-login-ip-sal").read_text().strip()
    return hashlib.sha256(f"physiq-login:{sal}:{ip}".encode()).hexdigest()


def zerar_ips() -> None:
    """As tentativas DESTA máquina (o limite por IP) — os testes fazem muitas de propósito. Só a linha deste IP: em produção a
    tabela tem as tentativas de gente de verdade."""
    q(f"delete from {schema()}.login_tentativas_ip where ip_hash = '{hash_do_meu_ip()}'")


def meta(email: str) -> dict:
    r = q(f"select raw_app_meta_data as m from auth.users where lower(email) = lower('{email}')")
    return (r[0]["m"] or {}) if r else {}


# ───────────────────────── o widget do Turnstile na página do teste ─────────────────────────

STUB_TURNSTILE = """(function(){
  var widgets = {}; var n = 0;
  function rodar(id){ var w = widgets[id]; if (!w) return; w.token = null;
    window.__tokenReal().then(function(t){ if (widgets[id] === w) { w.token = t; if (w.o.callback) w.o.callback(t); } })
      .catch(function(){ if (w.o['error-callback']) w.o['error-callback']('teste'); }); }
  window.turnstile = {
    render: function(el, o){ var id = 'w' + (++n); widgets[id] = { el: el, o: o, token: null }; if ((o.execution || 'render') === 'render') rodar(id); return id; },
    reset: function(id){ rodar(id || Object.keys(widgets)[0]); },
    execute: function(el){ var id = Object.keys(widgets).find(function(k){ return widgets[k].el === el || k === el; }) || Object.keys(widgets)[0]; rodar(id); },
    remove: function(id){ delete widgets[id]; },
    getResponse: function(id){ var w = widgets[id || Object.keys(widgets)[0]]; return w ? w.token : undefined; },
    isExpired: function(){ return false; }
  };
  window.__turnstileDeTeste = true;
})();"""


def ligar_turnstile_real(c: "Caso") -> None:
    """Troca SÓ o script do widget: os tokens são reais (Edge) e a função confere de verdade."""
    c.pg.expose_function("__tokenReal", lambda: token_real())
    c.pg.route(f"{TURNSTILE_JS}*", lambda rota: rota.fulfill(status=200, content_type="application/javascript", body=STUB_TURNSTILE))


# ───────────────────────── "entrar com o Google" para a prova do destravar ─────────────────────────

def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _segredo_jwt_legado() -> str:
    st, r, _ = http("GET", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/postgrest", None, {"Authorization": f"Bearer {B5.pat() if hasattr(B5, 'pat') else Path.home().joinpath('.pc-pat').read_text().strip()}"})
    assert st == 200 and r.get("jwt_secret"), (st, r)
    return r["jwt_secret"]


def jwt_de_login_google(sess: dict) -> str:
    """O access_token desta sessão com o claim amr de um login pelo Google (oauth), assinado com a chave HS256 legada (o Auth do
    principal ainda aceita — status previously_used). Mesma pessoa e mesma sessão: o GET /auth/v1/user confere de verdade."""
    cab, corpo, _ = sess["access_token"].split(".")
    claims = json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4)))
    claims["amr"] = [{"method": "oauth", "timestamp": int(time.time())}]
    claims["exp"] = int(time.time()) + 600
    h = {"alg": "HS256", "typ": "JWT"}
    msg = f"{_b64url(json.dumps(h, separators=(',', ':')).encode())}.{_b64url(json.dumps(claims, separators=(',', ':')).encode())}"
    ass = hmac.new(_segredo_jwt_legado().encode(), msg.encode(), hashlib.sha256).digest()
    return f"{msg}.{_b64url(ass)}"


def identidade_google(conta: str) -> None:
    """Identidade Google (e-mail verificado) na conta de TESTE — como se ela tivesse entrado uma vez com o Google."""
    email = CONTAS[conta][0]
    u = uid(conta)
    assert u and email.endswith(".teste.claude@physiqnutri.app"), conta
    if q(f"select 1 from auth.identities where user_id = '{u}' and provider = 'google'"):
        return
    sub = str(int(hashlib.sha256(email.encode()).hexdigest()[:15], 16))
    q(f"""insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          values (gen_random_uuid(), '{u}', '{sub}', jsonb_build_object('sub', '{sub}', 'email', '{email}', 'email_verified', true,
                  'full_name', '{NOMES[conta]}'), 'google', now(), now(), now())""")


def pos_login(token: str, origem: str = "https://physiqcalc-staging.vercel.app") -> tuple[int, dict]:
    st, r, _ = http("POST", f"{API_P}/functions/v1/pos-login", {}, {"Authorization": f"Bearer {token}", "apikey": anon(PRINCIPAL_REF),
                                                                    "x-schema": schema(), "Origin": origem}, timeout=60)
    return st, (r if isinstance(r, dict) else {"_": r})


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def fonte_viva() -> bool:
    try:
        with urllib.request.urlopen(FONTE + "/precisa", timeout=5) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False
