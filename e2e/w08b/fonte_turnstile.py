#!/usr/bin/env python3
"""Physiq W8b — fonte de tokens REAIS do Turnstile para os testes de ponta a ponta do login por e-mail e senha.

Sobe um servidor em http://localhost:<porta> com uma página que roda o widget do Physiq (sitekey real, hostname localhost —
o mesmo do APK) e um Microsoft Edge DE VERDADE (sem automação, perfil próprio, sem chaveiro) na tela :0 abrindo essa página.
Cada vez que um teste pede um token (`pedir_token()`), a página roda o widget e manda o token pra cá. O Chromium do
Playwright (automatizado) cai no desafio (erro 600010) — por isso os testes pegam o token aqui e mandam pela página/HTTP.

Uso:  python3 fonte_turnstile.py --porta 5173            (fica rodando; Ctrl+C encerra o Edge e o servidor)
Nos testes: from fonte_turnstile import pedir_token  → pedir_token("http://localhost:5173")
"""
import argparse, json, os, shutil, subprocess, sys, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SITEKEY = "0x4AAAAAAFJzUMo7DzTQWuLP"
PAGINA = """<!doctype html><html><head><meta charset="utf-8"><title>Physiq W8b - fonte de tokens Turnstile</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script></head>
<body style="font-family:sans-serif;background:#111;color:#ddd"><p>Fonte de tokens do Turnstile (testes da W8b). Pode ignorar.</p>
<div id="w"></div><pre id="log"></pre>
<script>
let id=null, ocupado=false, desde=0;
const log=(t)=>{document.getElementById('log').textContent=(new Date().toLocaleTimeString()+' '+t+'\\n'+document.getElementById('log').textContent).slice(0,3000)};
function montarWidget(){
  id=turnstile.render('#w',{sitekey:'%SITEKEY%',action:'entrar',appearance:'interaction-only',execution:'execute',
    callback:async(t)=>{await fetch('/token',{method:'POST',body:t}); log('token enviado'); ocupado=false;},
    'error-callback':(e)=>{log('erro '+e); ocupado=false; try{turnstile.reset(id)}catch(_){} return true;},
    'expired-callback':()=>{log('expirou')},
    'before-interactive-callback':()=>{log('o Cloudflare pediu interação')}});
}
function montar(){ if(!window.turnstile){setTimeout(montar,200);return;}
  montarWidget();
  setInterval(async()=>{
    // vigia: execução sem resposta há 20 s (o widget às vezes não chama nada) → recomeça o widget do zero
    if(ocupado && Date.now()-desde > 20000){ log('sem resposta: recomeçando o widget'); try{turnstile.remove(id)}catch(_){} ocupado=false; montarWidget(); return; }
    if(ocupado) return; const r=await fetch('/precisa'); const n=Number(await r.text());
    if(n>0){ ocupado=true; desde=Date.now(); try{turnstile.reset(id)}catch(_){} turnstile.execute(id); } },700);
}
montar();
</script></body></html>"""

ESTADO = {"pedidos": 0, "tokens": []}
TRAVA = threading.Lock()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _txt(self, codigo, corpo, tipo="text/plain"):
        b = corpo.encode(); self.send_response(codigo); self.send_header("Content-Type", tipo); self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith("/precisa"):
            with TRAVA: n = ESTADO["pedidos"]
            return self._txt(200, str(n))
        if self.path.startswith("/pegar"):
            with TRAVA:
                agora = time.time()
                ESTADO["tokens"] = [t for t in ESTADO["tokens"] if agora - t[0] < 240]
                if ESTADO["tokens"]:
                    t = ESTADO["tokens"].pop(0); return self._txt(200, t[1])
                ESTADO["pedidos"] = max(ESTADO["pedidos"], 1)
            return self._txt(204, "")
        return self._txt(200, PAGINA.replace("%SITEKEY%", SITEKEY), "text/html; charset=utf-8")
    def do_POST(self):
        if self.path.startswith("/token"):
            t = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
            with TRAVA:
                ESTADO["tokens"].append((time.time(), t)); ESTADO["pedidos"] = max(0, ESTADO["pedidos"] - 1)
            return self._txt(200, "ok")
        return self._txt(404, "")

def pedir_token(base="http://localhost:5173", limite=60) -> str:
    """Token novo (uso único, vale ~5 min). Espera a página do Edge gerar."""
    t0 = time.time()
    while time.time() - t0 < limite:
        with urllib.request.urlopen(base + "/pegar") as r:
            if r.status == 200:
                return r.read().decode()
        time.sleep(0.7)
    raise TimeoutError("a fonte do Turnstile não gerou token (o Edge está aberto na tela :0?)")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--porta", type=int, default=5173); ap.add_argument("--sem-edge", action="store_true")
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    # perfil próprio do Edge FORA do repo (cookies do Cloudflare; nada de chaveiro: --password-store=basic)
    perfil = os.path.expanduser("~/projetos/physiqcalc-scratch/w08b/edge-perfil")
    os.makedirs(perfil, exist_ok=True)
    edge = None
    if not a.sem_edge:
        env = dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":0"))
        edge = subprocess.Popen(["microsoft-edge", f"--user-data-dir={perfil}", "--no-first-run", "--no-default-browser-check",
                                 "--password-store=basic", "--disable-sync", "--disable-background-timer-throttling",
                                 "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--new-window",
                                 f"http://localhost:{a.porta}/"],
                                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("edge pid", edge.pid, flush=True)
    print(f"fonte pronta em http://localhost:{a.porta}", flush=True)
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        if edge: edge.terminate()
        srv.shutdown()

if __name__ == "__main__":
    main()
