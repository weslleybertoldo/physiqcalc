# Foto parada e prints de checagem de UM exercício, tirados do PRÓPRIO visualizador (bancada no dev server do app):
#   python3 foto.py <uuid> [base=http://127.0.0.1:5195]
# Sai: public/exercicios3d/<uuid>-<v>.webp (600×400, fundo escuro, t=0, câmera da ficha — a troca foto → 3D não
# pula) e relatorios/<cena>/*.png (frente/lado/costas/cima em t=0, 0,5 e 1; fundo claro; closes de mãos e pés
# quando relatorios/<cena>.json traz os pontos). Conferir TODOS os prints antes de mandar.
import io, json, os, re, sys
from PIL import Image
from playwright.sync_api import TimeoutError as Demorou, sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(AQUI, "..", "..", "public", "exercicios3d")
UUID = sys.argv[1]
BASE = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:5195").rstrip("/")
ficha = json.load(open(os.path.join(AQUI, "fichas", UUID + ".json")))
IDS = json.load(open(os.path.join(AQUI, "musculos_ids.json")))


def unico(padrao):
    achados = sorted(f for f in os.listdir(PUB) if re.fullmatch(padrao, f))
    if not achados:
        raise SystemExit("FOTO: falta %s em public/exercicios3d" % padrao)
    return achados[-1]


boneco, mapa = unico(r"boneco-\d+\.glb"), unico(r"musculos-\d+\.png")
movimento = unico(re.escape(UUID) + r"-\d+\.glb")
v = re.search(r"-(\d+)\.glb$", movimento).group(1)
cam = ficha["camera"]
base_q = "boneco=/exercicios3d/%s&mapa=/exercicios3d/%s&m=/exercicios3d/%s&alvos=%s&aux=%s" % (
    boneco, mapa, movimento, ",".join(str(IDS[n]) for n in ficha["alvos"]),
    ",".join(str(IDS[n]) for n in ficha["auxiliares"]))
URL = BASE + "/scripts/exercicios3d/bancada/index.html?" + base_q

saida_prints = os.path.join(AQUI, "relatorios", ficha["cena"])
os.makedirs(saida_prints, exist_ok=True)
pedidos = {"foto": dict(t=0, az=cam["az"], el=cam["el"], fundo="escuro", w=600, h=400)}
for t in (0, 0.5, 1):
    for nome, az, el in (("frente", 0, 7), ("lado", 90, 7), ("costas", 180, 7), ("cima", cam["az"], 55)):
        pedidos["%s_%03d" % (nome, int(t * 100))] = dict(t=t, az=az, el=el, fundo="claro", w=600, h=600)
pontos = os.path.join(AQUI, "relatorios", ficha["cena"] + ".json")
if os.path.exists(pontos):                       # closes: alvo da câmera no ponto (coordenadas do Blender)
    for nome, quadros in json.load(open(pontos)).items():
        for t, p in quadros.items():
            pedidos["close_%s_%03d" % (nome, int(float(t) * 100))] = dict(
                t=t, az=cam["az"], el=12, dist=0.55, alvo="%.3f,%.3f,%.3f" % tuple(p), fundo="claro", w=500, h=500)

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pag = nav.new_page(device_scale_factor=2, viewport={"width": 700, "height": 700})
    erros = []
    pag.on("pageerror", lambda e: erros.append(str(e)))
    for nome, p in pedidos.items():
        q = "&".join("%s=%s" % (k, val) for k, val in p.items())
        pag.goto(URL + "&" + q, wait_until="domcontentloaded", timeout=180000)
        pag.wait_for_function("document.body.dataset['3d'] === 'pronto' || document.body.dataset['3d'] === 'erro'",
                              timeout=120000)
        if pag.evaluate("document.body.dataset['3d']") == "erro":
            raise SystemExit("FOTO: o visualizador deu erro em %s: %s" % (nome, pag.inner_text("#erro")))
        for tentativa in range(3):             # CPU dividida com os exports: o SwiftShader atrasa o quadro e o print
            try:                               # estoura esperando o canvas ficar "estável" (04/10/2026, 2 vezes)
                png = pag.locator("canvas").screenshot(timeout=180000)
                break
            except Demorou:
                if tentativa == 2:
                    raise
                print("PRINT %s demorou, tentando de novo" % nome, flush=True)
        if nome == "foto":
            img = Image.open(io.BytesIO(png)).convert("RGB").resize((600, 400), Image.LANCZOS)
            destino = os.path.join(PUB, "%s-%s.webp" % (UUID, v))
            img.save(destino, "WEBP", quality=85, method=6)
            print("FOTO", destino, "%d KB" % (os.path.getsize(destino) // 1024))
        else:
            open(os.path.join(saida_prints, nome + ".png"), "wb").write(png)
    nav.close()
if erros:
    raise SystemExit("FOTO: erro de página: %s" % erros[:3])
print("PRINTS", saida_prints, len(pedidos) - 1)
