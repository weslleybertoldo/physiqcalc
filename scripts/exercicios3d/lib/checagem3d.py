# Checagem automática da cena ANTES de renderizar/mandar (pedido dele 03/10/2026: "Sempre valide antes de me
# enviar"): em cada quadro, (1) cada mão encosta e FECHA em volta da barra e (2) nenhum equipamento entra no corpo.
#   import checagem3d as ck
#   barra_ck = ck.Barra(raiz_da_barra, raio=0.0145, meio_compr=0.625)
#   r = ck.quadro(bon, equipamentos=[raiz], pegadas=[("Left", barra_ck), ("Right", barra_ck)], rotulo="t=0.00")
#   ck.resumo([r, ...])  → imprime CHECAGEM OK / CHECAGEM FALHOU e devolve True/False
import bpy, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

P = "mixamorig:"
# limites (mm / graus) — o que conta como "mão fechada na barra" e "nada entrando no corpo"
ENCOSTO_MAX = 3.0      # vão máximo entre a pele da mão e a barra
AFUNDA_MAX = 5.0       # o quanto a barra pode afundar na pele da mão (dedo apertando)
ENVOLVE_MIN = 200.0    # quanto da volta da barra a mão cobre (palma + dedos + polegar)
FOLGA_MIN = 3.0        # distância mínima entre equipamento e corpo (fora as mãos)

_cache = {}


def _avaliar(obj, niveis=1):
    """Vértices (N×3, mundo) e triângulos (M×3) do objeto com todos os modificadores (pose, relevo)."""
    sub = obj.modifiers.get("Suave")
    antigo = None
    if sub is not None and niveis is not None:
        antigo, sub.levels = sub.levels, niveis
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    M = np.array(obj.matrix_world)
    co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tri)
    tri = tri.reshape(-1, 3)
    chave = (obj.name, len(co))
    if chave not in _cache:                       # parte do corpo de cada vértice (osso de maior peso)
        nomes = [g.name.replace(P, "") for g in obj.vertex_groups]
        osso = {g.index for g in obj.vertex_groups if g.name.startswith(P)}   # fora "body", "joint-*"…
        dono = np.full(len(co), -1)
        for i, v in enumerate(me.vertices):
            gs = [e for e in v.groups if e.group in osso]
            if gs:
                dono[i] = max(gs, key=lambda e: e.weight).group
        _cache[chave] = (nomes, dono)
    ev.to_mesh_clear()
    if sub is not None and antigo is not None:
        sub.levels = antigo
    return co, tri, _cache[chave]


def _bvh(co, tri):
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in tri], all_triangles=True)


def _parte(nomes, dono, i):
    return nomes[dono[i]] if dono[i] >= 0 else "?"


def _malhas(raiz):
    objs = [raiz] if raiz.type == "MESH" else []
    objs += [c for c in raiz.children_recursive if c.type == "MESH"]
    return objs


class Barra:
    """Eixo da barra (ou pegador cilíndrico): centro e direção tirados do objeto raiz (eixo local X)."""

    def __init__(self, raiz, raio, meio_compr, eixo=(1, 0, 0)):
        self.raiz, self.raio, self.meio, self.eixo = raiz, raio, meio_compr, Vector(eixo)

    def linha(self):
        M = self.raiz.matrix_world
        c = M.to_translation()
        u = (M.to_3x3() @ self.eixo).normalized()
        return np.array(c), np.array(u)


def _pegada(co, nomes, dono, lado, barra):
    """Mede a mão `lado` em volta da barra: encosto (mm, + = vão), envolvimento (graus), centro da pegada."""
    mao = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
    H = co[mao]
    c, u = barra.linha()
    d = H - c
    a = d @ u
    rad = d - np.outer(a, u)
    rho = np.linalg.norm(rad, axis=1)
    perto = rho < barra.raio + 0.03
    if not perto.any():
        return dict(encosto=(rho.min() - barra.raio) * 1000, envolve=0.0, x=float("nan"), n=0)
    a_med = np.median(a[perto])
    zona = (np.abs(a - a_med) < 0.06) & (np.abs(a) <= barra.meio)
    encosto = (rho[zona].min() - barra.raio) * 1000
    cola = zona & (rho - barra.raio < 0.010)
    # ângulo de cada ponto encostado em volta do eixo → maior buraco na volta = parte sem mão
    e1 = np.cross(u, [0, 0, 1.0])
    if np.linalg.norm(e1) < 1e-6:
        e1 = np.cross(u, [0, 1.0, 0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(u, e1)
    ang = np.degrees(np.arctan2(rad[cola] @ e2, rad[cola] @ e1)) % 360
    if len(ang) < 3:
        envolve = 0.0
    else:
        s = np.sort(ang)
        buracos = np.diff(np.concatenate([s, [s[0] + 360]]))
        envolve = 360 - buracos.max()
    return dict(encosto=encosto, envolve=envolve, x=float(a_med), n=int(cola.sum()))


def quadro(bon, equipamentos=(), pegadas=(), rotulo="", niveis=1, passo=0.008, apoio_mm=0.0):
    """Mede um quadro (a pose já aplicada). equipamentos: objetos raiz (barra, máquina); pegadas: [(lado, Barra)].
    apoio_mm > 0: o peso fica APOIADO no corpo (barra nas costas) — encostar pode, afundar mais que isso não."""
    bpy.context.view_layer.update()
    co, tri, (nomes, dono) = _avaliar(bon.corpo, niveis)
    eh_mao = np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes] + [False])
    mao_v = eh_mao[dono]
    tri_mao = mao_v[tri].any(axis=1)
    resto = tri[~tri_mao]                         # triângulos sem nenhum vértice da mão
    bvh_corpo = _bvh(co, resto)
    bvh_todo = _bvh(co, tri)                      # corpo inteiro (fechado no punho): sinal dentro/fora confiável
    r = dict(rotulo=rotulo, falhas=[], pegadas={})

    # 1) equipamento × corpo (fora as mãos): cruzamento de triângulos + menor folga
    folga, onde, cruz = 1e9, "", 0
    for raiz in equipamentos:
        for ob in _malhas(raiz):
            eco, etri = _avaliar_simples(ob)
            bvh_eq = _bvh(eco, etri)
            pares = bvh_corpo.overlap(bvh_eq)
            if pares:
                cruz += len(pares)
                i = resto[pares[0][0]][0]
                onde = "%s × %s" % (ob.name, _parte(nomes, dono, i))
            for p in _amostras(eco, etri, passo):
                v = Vector(p)
                loc, nor, idx, dist = bvh_todo.find_nearest(v)
                if loc is None:
                    continue
                if (v - loc).dot(nor) < 0 and _dentro(bvh_todo, v):
                    if tri_mao[idx]:                      # dentro da mão = assunto da pegada
                        continue
                    d, i = -dist, tri[idx][0]
                else:                                     # fora: distância até o corpo sem as mãos
                    loc, nor, idx, dist = bvh_corpo.find_nearest(v)
                    d, i = dist, resto[idx][0]
                if d < folga:
                    folga = d
                    if not cruz:
                        onde = "%s × %s" % (ob.name, _parte(nomes, dono, i))
    r["folga"] = folga * 1000
    r["cruzamentos"] = cruz
    r["onde"] = onde
    if apoio_mm:                                  # peso APOIADO no corpo (barra nas costas): encostar pode
        if folga * 1000 < -apoio_mm:
            r["falhas"].append("peso afundado no corpo (%s, %.1f mm)" % (onde, -folga * 1000))
    elif equipamentos and (cruz or folga * 1000 < FOLGA_MIN):
        r["falhas"].append("peso no corpo (%s, folga %.1f mm, %d cruz.)" % (onde, folga * 1000, cruz))

    # 2) cada mão fechada em volta da barra
    for lado, barra in pegadas:
        g = _pegada(co, nomes, dono, lado, barra)
        r["pegadas"][lado] = g
        if g["encosto"] > ENCOSTO_MAX:
            r["falhas"].append("mão %s longe da barra (%.1f mm)" % (lado, g["encosto"]))
        if g["encosto"] < -AFUNDA_MAX:
            r["falhas"].append("barra atravessa a mão %s (%.1f mm)" % (lado, -g["encosto"]))
        if g["envolve"] < ENVOLVE_MIN:
            r["falhas"].append("mão %s aberta (envolve %.0f°)" % (lado, g["envolve"]))

    txt = " | ".join("%s: encosto %+.1f mm, envolve %3.0f°, x %+.3f" % (l[0], g["encosto"], g["envolve"], g["x"])
                     for l, g in r["pegadas"].items())
    print("CHECK %s | %s | peso×corpo: folga %.1f mm (%s), cruz. %d | %s" % (
        rotulo, txt, r["folga"], r["onde"], r["cruzamentos"], "OK" if not r["falhas"] else "FALHA: " + "; ".join(r["falhas"])),
        flush=True)
    return r


def _dentro(bvh, p, direcao=Vector((0.3, -0.2, -0.93)).normalized()):
    """Paridade do raio: ímpar = ponto dentro da malha fechada (confirma o sinal da normal)."""
    n, o = 0, p.copy()
    for _ in range(64):
        loc, nor, idx, dist = bvh.ray_cast(o, direcao)
        if loc is None:
            break
        n += 1
        o = loc + direcao * 1e-5
    return n % 2 == 1


def _avaliar_simples(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    M = np.array(ob.matrix_world)
    co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tri)
    ev.to_mesh_clear()
    return co, tri.reshape(-1, 3)


def _amostras(co, tri, passo):
    """Pontos espalhados na superfície (a cada `passo` m em cada lado do triângulo) — o eixo da barra só
    tem vértice nas pontas, então só os vértices não bastam."""
    pts = [co]
    for t in tri:
        a, b, c = co[t[0]], co[t[1]], co[t[2]]
        n1 = int(math.ceil(np.linalg.norm(b - a) / passo))
        n2 = int(math.ceil(np.linalg.norm(c - a) / passo))
        if n1 <= 1 and n2 <= 1:
            continue
        i, j = np.meshgrid(np.arange(n1 + 1), np.arange(n2 + 1))
        u, v = (i / max(n1, 1)).ravel(), (j / max(n2, 1)).ravel()
        m = (u + v) <= 1 + 1e-9
        pts.append(a + np.outer(u[m], b - a) + np.outer(v[m], c - a))
    return np.concatenate(pts)


def resumo(resultados):
    ruins = [r for r in resultados if r["falhas"]]
    if ruins:
        print("CHECAGEM FALHOU em %d de %d quadros: %s" % (len(ruins), len(resultados),
              ", ".join(r["rotulo"] for r in ruins)), flush=True)
        return False
    print("CHECAGEM OK (%d quadros)" % len(resultados), flush=True)
    return True
