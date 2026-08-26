#!/usr/bin/env python3
"""Servidor local do COMPARATIVO: GIF atual (Storage do app) × GIF novo (v2) por exercício,
com escolha por rádio; escolhas persistem em escolhas.json (POST /escolha).

  SUPABASE_PAT=sbp_... python3 comparar_server.py /tmp/gif_supino/v2out 8090
"""
import json, os, sys, threading, urllib.request, re, unicodedata
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalogo import E

GIFS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gif_supino/v2out"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8090
ESCOLHAS = os.path.join(GIFS, "escolhas.json")
PAT = os.environ.get("SUPABASE_PAT")
REF = "uxwpwdbbnlticxgtzcsb"
LOCK = threading.Lock()


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": q}).encode(),
                                 headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "supabase-cli/2.0"})
    return json.loads(urllib.request.urlopen(req).read().decode())


# atuais (public) — cache em arquivo pra não depender do PAT a cada subida
CACHE = os.path.join(GIFS, "atuais.json")
if os.path.exists(CACHE):
    ATUAIS = json.load(open(CACHE))
else:
    rows = sql("select id, nome, grupo_muscular, imagem_url from public.tb_exercicios order by nome")
    ATUAIS = {r["nome"]: r for r in rows}
    json.dump(ATUAIS, open(CACHE, "w"), ensure_ascii=False, indent=1)

ITENS = []
for e in E:
    nome = e["nome"]
    g = os.path.join(GIFS, slug(nome) + ".gif")
    if not os.path.exists(g):
        continue
    atual = ATUAIS.get(nome) or {}
    ITENS.append(dict(nome=nome, grupo=e["grupo"], slug=slug(nome), atual=atual.get("imagem_url"), id=atual.get("id")))


def carregar():
    try:
        return json.load(open(ESCOLHAS))
    except Exception:
        return {}


HTML = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PhysiqCalc · GIFs: atual × novo</title>
<style>
 :root{--bg:#0d0d0d;--card:#171717;--acc:#FFBF00;--txt:#e5e5e5;--mut:#9ca3af;--ok:#22c55e}
 body{margin:0;background:var(--bg);color:var(--txt);font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif}
 header{position:sticky;top:0;background:#0d0d0dee;backdrop-filter:blur(6px);padding:12px 16px;border-bottom:1px solid #333;z-index:9}
 h1{font-size:18px;margin:0 0 4px;color:var(--acc);text-transform:uppercase;letter-spacing:.06em}
 .prog{font-size:13px;color:var(--mut)} .prog b{color:var(--txt)}
 .filtros{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}
 .filtros button{background:#222;border:1px solid #444;color:var(--txt);padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer}
 .filtros button.on{border-color:var(--acc);color:var(--acc)}
 main{padding:12px;display:grid;gap:14px}
 .card{background:var(--card);border:1px solid #2a2a2a;border-radius:10px;padding:12px}
 .card.decidido{border-color:#2f4f2f}
 .card h2{font-size:15px;margin:0 0 2px} .card .g{font-size:12px;color:var(--mut);margin-bottom:8px}
 .par{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 @media(max-width:640px){.par{grid-template-columns:1fr}}
 .lado{border:2px solid #333;border-radius:8px;padding:8px;background:#111;cursor:pointer}
 .lado.sel{border-color:var(--ok);box-shadow:0 0 0 2px #22c55e33}
 .lado .t{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
 .lado img{width:100%;border-radius:6px;background:#000;display:block;aspect-ratio:3/2;object-fit:contain}
 .lado label{display:flex;gap:6px;align-items:center;margin-top:8px;font-size:14px;cursor:pointer}
 .rodape{padding:20px;text-align:center;color:var(--mut);font-size:12px}
 .sem{color:#f87171;font-size:12px}
</style></head><body>
<header><h1>PhysiqCalc · escolha o GIF de cada exercício</h1>
<div class="prog">Decididos: <b id="n">0</b>/<b id="tot">0</b> · manter atual: <b id="na">0</b> · usar novo: <b id="nn">0</b> · <span id="st"></span></div>
<div class="filtros"><button data-f="todos" class="on">Todos</button><button data-f="pend">Pendentes</button><button data-f="novo">Escolhi novo</button><button data-f="atual">Escolhi atual</button></div>
</header><main id="m"></main>
<div class="rodape">As escolhas são salvas automaticamente a cada clique. Quando terminar, é só me avisar.</div>
<script>
const ITENS = __ITENS__; let ESC = __ESC__;
const m = document.getElementById('m');
function render(){
  const f = document.querySelector('.filtros .on').dataset.f;
  m.innerHTML = '';
  for (const it of ITENS){
    const e = ESC[it.nome];
    if (f==='pend' && e) continue; if (f==='novo' && e!=='novo') continue; if (f==='atual' && e!=='atual') continue;
    const c = document.createElement('div'); c.className = 'card' + (e ? ' decidido' : ''); c.dataset.nome = it.nome;
    c.innerHTML = `<h2>${it.nome}</h2><div class="g">${it.grupo}</div><div class="par">
      <div class="lado ${e==='atual'?'sel':''}" data-v="atual"><div class="t"><span>Atual (no app)</span>${it.atual?'':'<span class="sem">sem imagem</span>'}</div>
        ${it.atual?`<img loading="lazy" src="${it.atual}" alt="atual">`:'<div style="aspect-ratio:3/2"></div>'}
        <label><input type="radio" name="r-${it.slug}" value="atual" ${e==='atual'?'checked':''}> Manter atual</label></div>
      <div class="lado ${e==='novo'?'sel':''}" data-v="novo"><div class="t"><span>Novo (v2 · 3D)</span></div>
        <img loading="lazy" src="/novo/${it.slug}.gif" alt="novo">
        <label><input type="radio" name="r-${it.slug}" value="novo" ${e==='novo'?'checked':''}> Usar novo</label></div></div>`;
    c.querySelectorAll('.lado').forEach(l => l.addEventListener('click', () => escolher(it.nome, l.dataset.v)));
    m.appendChild(c);
  }
  const vals = Object.values(ESC);
  document.getElementById('n').textContent = vals.length; document.getElementById('tot').textContent = ITENS.length;
  document.getElementById('na').textContent = vals.filter(v=>v==='atual').length; document.getElementById('nn').textContent = vals.filter(v=>v==='novo').length;
}
async function escolher(nome, v){
  ESC[nome] = v; document.getElementById('st').textContent = 'salvando…';
  try { const r = await fetch('/escolha', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome, escolha: v})});
        ESC = await r.json(); document.getElementById('st').textContent = 'salvo ✓'; }
  catch(e){ document.getElementById('st').textContent = 'erro ao salvar — tenta de novo'; }
  const f = document.querySelector('.filtros .on').dataset.f;
  if (f === 'pend') { render(); } else {
    const card = m.querySelector(`[data-nome="${CSS.escape(nome)}"]`); if (card){ card.classList.add('decidido');
      card.querySelectorAll('.lado').forEach(l => l.classList.toggle('sel', l.dataset.v===v));
      card.querySelectorAll('input').forEach(i => i.checked = (i.value===v)); }
    const vals = Object.values(ESC);
    document.getElementById('n').textContent = vals.length;
    document.getElementById('na').textContent = vals.filter(x=>x==='atual').length; document.getElementById('nn').textContent = vals.filter(x=>x==='novo').length;
  }
}
document.querySelectorAll('.filtros button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.filtros button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); render(); }));
render();
</script></body></html>"""


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):  # silencioso
        pass
    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/" or p == "/index.html":
            esc = carregar()
            html = HTML.replace("__ITENS__", json.dumps(ITENS, ensure_ascii=False)).replace("__ESC__", json.dumps(esc, ensure_ascii=False)).encode()
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(html))); self.end_headers(); self.wfile.write(html)
        elif p == "/escolhas":
            self._json(carregar())
        elif p.startswith("/novo/"):
            f = os.path.join(GIFS, os.path.basename(p))
            if not os.path.exists(f):
                self.send_response(404); self.end_headers(); return
            data = open(f, "rb").read()
            self.send_response(200); self.send_header("Content-Type", "image/gif"); self.send_header("Cache-Control", "no-cache"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        if urlparse(self.path).path != "/escolha":
            self.send_response(404); self.end_headers(); return
        n = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(n).decode() or "{}")
        nome, esc = body.get("nome"), body.get("escolha")
        if esc not in ("atual", "novo") or nome not in {i["nome"] for i in ITENS}:
            self._json({"erro": "inválido"}, 400); return
        with LOCK:
            cur = carregar(); cur[nome] = esc
            json.dump(cur, open(ESCOLHAS, "w"), ensure_ascii=False, indent=1)
        self._json(cur)


if __name__ == "__main__":
    print(f"{len(ITENS)} exercícios · http://0.0.0.0:{PORT}/ · escolhas em {ESCOLHAS}")
    HTTPServer(("0.0.0.0", PORT), H).serve_forever()
