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


# ── checagem completa (spec do visualizador 3D, seção 4): pés, juntas, corpo × corpo, zonas de apoio, equipamento
# rígido, ângulos-chave da ficha, técnica (cotovelo × tronco, pés, pegada — tecnica3d.py) e saltos entre quadros.
# Tudo em mm/graus, todo quadro.
import limites
import tecnica3d as tc

PE_CHAO_MM = 5.0        # planta do pé no chão: 0 ± 5 mm
ESCORREGA_MM = 5.0      # tornozelo parado entre quadros (pé apoiado)
PENETRA_MM = 2.0        # corpo × corpo
RIGIDEZ_MM = 2.0        # peça do equipamento não estica nem solta
SALTO_MM = 80.0         # nenhum osso anda mais que isso entre 2 quadros (1/16 s)
REGIOES = {             # partes do corpo pelo osso dono do vértice
    "tronco": ("Hips", "Spine", "Spine1", "Spine2"),
    "bracoE": ("LeftArm",), "bracoD": ("RightArm",),
    "antebracoE": ("LeftForeArm",), "antebracoD": ("RightForeArm",),
    "coxaE": ("LeftUpLeg",), "coxaD": ("RightUpLeg",),
    "pernaE": ("LeftLeg",), "pernaD": ("RightLeg",),
}
# (parte A, parte B, junta perto da qual o contato é o vinco normal, raio do vinco em m). Medido no agachamento
# (04/10/2026) e conferido no close: a dobra da axila (braço × dorsal) vai até ~16 cm do ombro. Cotovelo dobrado
# a ~120°: os eixos do braço e do antebraço ficam ~1 × d separados a d cm da junta e os dois raios (braço musculoso)
# somam ~10 cm, então a pele de um encosta na do outro perto da junta — é o vinco, não atravessa. Medido no
# agachamento (cotovelo 122°): 11 mm de sobreposição a 10 cm da junta, 4 mm a 12 cm, zero depois.
# Fora desses raios vale o limite de 2 mm.
PARES = (
    ("bracoE", "tronco", "LeftArm", 0.18), ("bracoD", "tronco", "RightArm", 0.18),
    ("antebracoE", "bracoE", "LeftForeArm", 0.13), ("antebracoD", "bracoD", "RightForeArm", 0.13),
    ("coxaE", "coxaD", None, 0), ("pernaE", "pernaD", None, 0),
)


def _cab(rig, nome):
    return np.array(rig.matrix_world @ rig.pose.bones[P + nome].head)


def _ang(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    c = a @ b / max(np.linalg.norm(a) * np.linalg.norm(b), 1e-9)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def medir_juntas(rig):
    """Ângulo de cada junta (graus) nos dois lados: joelho, cotovelo, quadril, ombro, punho + pescoço."""
    c = lambda n: _cab(rig, n)
    tronco = c("Neck") - c("Hips")
    out = {"pescoco": _ang(c("Head") - c("Neck"), tronco)}
    for lado, L in (("E", "Left"), ("D", "Right")):
        out["joelho" + lado] = _ang(c(L + "Leg") - c(L + "UpLeg"), c(L + "Foot") - c(L + "Leg"))
        out["cotovelo" + lado] = _ang(c(L + "ForeArm") - c(L + "Arm"), c(L + "Hand") - c(L + "ForeArm"))
        out["quadril" + lado] = _ang(c(L + "Leg") - c(L + "UpLeg"), -tronco)
        out["ombro" + lado] = _ang(c(L + "ForeArm") - c(L + "Arm"), -tronco)
        mao = np.array(rig.matrix_world @ rig.pose.bones[P + L + "Hand"].tail) - c(L + "Hand")
        out["punho" + lado] = _ang(c(L + "Hand") - c(L + "ForeArm"), mao)
    return out


def juntas(rig):
    falhas = []
    medidas = medir_juntas(rig)
    for nome, v in medidas.items():
        lo, hi = limites.JUNTAS[nome.rstrip("ED") if nome != "pescoco" else nome]
        if not lo - 0.5 <= v <= hi + 0.5:
            falhas.append("%s %.0f° fora de %d–%d°" % (nome, v, lo, hi))
    return medidas, falhas


def pes(co, nomes, dono, no_chao=True, chao_z=0.0):
    """Planta (vértice mais baixo do pé) e calcanhar (vértice mais baixo da metade de trás) no chão, em mm."""
    falhas, medidas = [], {}
    for lado, L in (("E", "Left"), ("D", "Right")):
        eh = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes] + [False])[dono]
        P_ = co[eh]
        if not len(P_):
            continue
        planta = (P_[:, 2].min() - chao_z) * 1000
        tras = P_[P_[:, 1] > np.median(P_[:, 1])]                  # metade de trás (o boneco olha pra -Y)
        calc = (tras[:, 2].min() - chao_z) * 1000
        medidas[lado] = (planta, calc)
        if no_chao and abs(planta) > PE_CHAO_MM:
            falhas.append("pé %s fora do chão (%+.1f mm)" % (lado, planta))
        if no_chao and calc > PE_CHAO_MM:
            falhas.append("calcanhar %s subiu (%+.1f mm)" % (lado, calc))
    return medidas, falhas


def corpo_x_corpo(co, tri, nomes, dono):
    """Parte do corpo entrando em outra (fora o vinco da junta): profundidade máxima em mm por par."""
    regiao_v = np.full(len(co), "", dtype=object)
    for reg, ossos in REGIOES.items():
        m = np.array([n in ossos for n in nomes] + [False])[dono]
        regiao_v[m] = reg
    tri_reg = {reg: tri[(regiao_v[tri] == reg).all(axis=1)] for reg in REGIOES}
    falhas, medidas = [], {}
    for a, b, junta, raio in PARES:
        ta, tb = tri_reg[a], tri_reg[b]
        if not len(ta) or not len(tb):
            continue
        bvh_b = _bvh(co, tb)
        pares = _bvh(co, ta).overlap(bvh_b)
        fundo, onde = 0.0, ""
        if pares:
            vs = np.unique(ta[[p[0] for p in pares]].ravel())
            for i in vs:
                v = Vector(co[i])
                if junta and (v - Vector(_JUNTA_POS[junta])).length < raio:
                    continue                                       # vinco da junta: encostar é normal
                loc, nor, idx, dist = bvh_b.find_nearest(v)
                if loc is not None and dist < 0.03 and (v - loc).dot(nor) < 0 and dist * 1000 > fundo:
                    fundo = dist * 1000
                    onde = " a %.0f cm da junta" % ((v - Vector(_JUNTA_POS[junta])).length * 100) if junta else ""
        medidas[a + "×" + b] = fundo
        if fundo > PENETRA_MM:
            falhas.append("%s entra em %s (%.1f mm%s)" % (a, b, fundo, onde))
    return medidas, falhas


_JUNTA_POS = {}


def posicoes_das_juntas(rig):
    """Guarda onde estão as juntas neste quadro (pro vinco do corpo × corpo)."""
    for n in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm"):
        _JUNTA_POS[n] = tuple(_cab(rig, n))


def _zona_no_apoio(V, raizes, nome):
    """Distância (m) da pele da zona até o apoio (banco: caixas fechadas e convexas), − = pele dentro dele.
    Medido dos vértices da pele até o apoio: do apoio até a pele dava profundidade falsa na borda da zona (a pele
    da zona é um pedaço aberto e, perto da borda, a normal do triângulo mais perto aponta de lado — glúteo
    "−29,5 mm" com o glúteo só encostando, supino, 04/10/2026)."""
    perto = 1e9
    for raiz in raizes:
        if raiz.name != nome:
            continue
        for ob in _malhas(raiz):
            eco, etri = _avaliar_simples(ob)
            lo, hi = eco.min(axis=0) - 0.05, eco.max(axis=0) + 0.05
            perto_v = V[((V >= lo) & (V <= hi)).all(axis=1)]
            if not len(perto_v):
                continue
            bvh = _bvh(eco, etri)
            for p in perto_v:
                v = Vector(p)
                loc, nor, idx, dist = bvh.find_nearest(v)
                if loc is not None:
                    perto = min(perto, -dist if (v - loc).dot(nor) < 0 else dist)
    return perto


def zonas(co, tri, nomes, dono, equipamentos, zonas_ficha, apoios=()):
    """Zona de apoio da ficha (barra nas costas, quadril no banco…): o equipamento TEM que encostar ali.
    apoios: nomes dos equipamentos que são apoio do corpo (banco) — medidos da pele até eles (_zona_no_apoio)."""
    falhas, medidas = [], {}
    for z in zonas_ficha:
        ossos = set(z["partes"])
        m = np.array([n in ossos for n in nomes] + [False])[dono]
        if z["equipamento"] in apoios:
            mm = _zona_no_apoio(co[m], equipamentos, z["equipamento"]) * 1000
            medidas[z["nome"]] = mm
            if not z["mm"][0] <= mm <= z["mm"][1]:
                falhas.append("%s: %.1f mm (esperado %g a %g)" % (z["nome"], mm, z["mm"][0], z["mm"][1]))
            continue
        tz = tri[m[tri].all(axis=1)]
        bvh_z = _bvh(co, tz)
        perto = 1e9
        for raiz in equipamentos:
            if raiz.name != z["equipamento"]:
                continue
            for ob in _malhas(raiz):
                eco, etri = _avaliar_simples(ob)
                for p in _amostras(eco, etri, 0.01):
                    loc, nor, idx, dist = bvh_z.find_nearest(Vector(p))
                    if loc is None:
                        continue
                    d = -dist if dist < 0.03 and (Vector(p) - loc).dot(nor) < 0 else dist
                    perto = min(perto, d)
        mm = perto * 1000
        medidas[z["nome"]] = mm
        if not z["mm"][0] <= mm <= z["mm"][1]:
            falhas.append("%s: %.1f mm (esperado %g a %g)" % (z["nome"], mm, z["mm"][0], z["mm"][1]))
    return medidas, falhas


def corpo_no_apoio(co, nomes, dono, apoios, limite_mm):
    """Quanto o corpo afunda no banco (mm, o vértice mais fundo): o banco é convexo, então "do lado de dentro da
    face mais perto" = dentro dele. Encostar é o certo; afundar mais que o estofado cede é o erro."""
    pior, onde = 0.0, ""
    for raiz in apoios:
        for ob in _malhas(raiz):
            eco, etri = _avaliar_simples(ob)
            lo, hi = eco.min(axis=0) - 0.01, eco.max(axis=0) + 0.01
            perto = np.where(((co >= lo) & (co <= hi)).all(axis=1))[0]
            if not len(perto):
                continue
            bvh = _bvh(eco, etri)
            for i in perto:
                v = Vector(co[i])
                loc, nor, idx, dist = bvh.find_nearest(v)
                if loc is not None and (v - loc).dot(nor) < 0 and dist * 1000 > pior:
                    pior, onde = dist * 1000, "%s × %s" % (ob.name, _parte(nomes, dono, i))
    falhas = ["corpo afundado no apoio (%s, %.1f mm)" % (onde, pior)] if pior > limite_mm else []
    return (pior, onde), falhas


def pontos_do_equipamento(equipamentos):
    """Posição de cada peça, separada por equipamento (os 2 halteres andam cada um pro seu lado)."""
    return {raiz.name: {o.name: np.array(o.matrix_world.to_translation()) for o in [raiz] + list(raiz.children_recursive)}
            for raiz in equipamentos}


def rigidez(pontos, ref):
    """Distância entre as peças de cada equipamento igual à do 1º quadro (nada estica nem solta)."""
    pior = 0.0
    for eq, ref_eq in ref.items():
        nomes = sorted(ref_eq)
        for i, a in enumerate(nomes):
            for b in nomes[i + 1:]:
                d0 = np.linalg.norm(ref_eq[a] - ref_eq[b])
                d = np.linalg.norm(pontos[eq][a] - pontos[eq][b])
                pior = max(pior, abs(d - d0) * 1000)
    return pior, (["equipamento deformou (%.1f mm)" % pior] if pior > RIGIDEZ_MM else [])


def angulo_chave(rig, regra):
    """Medida da ficha no quadro atual (os dois lados quando é de membro): devolve a lista de valores."""
    c = lambda n: _cab(rig, n)
    m = regra["medida"]
    if m == "inclinacao":                      # segmento × horizontal (+ = ponta de baixo abaixo da de cima)
        a, b = regra["segmento"]
        vals = []
        for L in ("Left", "Right"):
            d = c(L + b) - c(L + a)
            vals.append(math.degrees(math.atan2(-d[2], math.hypot(d[0], d[1]))))
        return vals
    if m == "flexao":
        junta = {"Leg": "joelho", "ForeArm": "cotovelo", "UpLeg": "quadril",
                 "Hand": "punho"}[regra["junta"]]      # punho: mão × antebraço (crucifixo, lote 2)
        med = medir_juntas(rig)
        return [med[junta + "E"], med[junta + "D"]]
    if m == "tronco":                          # tronco × vertical
        return [_ang(c("Neck") - c("Hips"), (0, 0, 1))]
    if m in tc.MEDIDAS:                        # técnica: cotovelo × tronco, pés, pegada, coluna (tecnica3d.py)
        return tc.MEDIDAS[m](posicoes(rig))
    raise ValueError("medida desconhecida na ficha: %s" % m)


def posicoes(rig):
    return {n: _cab(rig, n) for n in tc.JUNTAS}


def angulos_chave(rig, regras, t):
    """Regras da ficha + regras padrão que valem neste quadro (t: número, [t0, t1] ou "todos")."""
    falhas, medidas = [], {}
    for r in regras:
        if not tc.vale_no_quadro(r["t"], t):
            continue
        vals = angulo_chave(rig, r)
        medidas[r["nome"]] = tc.valores(r["medida"], vals)
        if tc.fora_da_faixa(r, vals):
            falhas.append("%s: %s (esperado %g a %g)" % (r["nome"], medidas[r["nome"]], *tc.faixa(r)))
    return medidas, falhas


def ossos_no_mundo(rig):
    return {pb.name: np.array(rig.matrix_world @ pb.head) for pb in rig.pose.bones}


def saltos(antes, agora):
    osso = max(agora, key=lambda n: np.linalg.norm(agora[n] - antes[n]))
    pior = np.linalg.norm(agora[osso] - antes[osso]) * 1000
    return pior, (["salto de %.0f mm entre quadros (%s)" % (pior, osso.replace(P, ""))] if pior > SALTO_MM else [])


def completa(bon, cena, checagens, t, rotulo, estado):
    """Todos os itens num quadro (a pose já aplicada). estado: dict guardado entre quadros (anterior, referência)."""
    r = quadro(bon, equipamentos=cena.equipamentos, pegadas=cena.pegadas, rotulo=rotulo, apoio_mm=cena.apoio_mm)
    rig = bon.rig
    co, tri, (nomes, dono) = _avaliar(bon.corpo, 1)
    posicoes_das_juntas(rig)
    itens = {}
    for nome, (med, f) in (("juntas", juntas(rig)),
                           ("pes", pes(co, nomes, dono, checagens.get("pes_no_chao", True))),
                           ("corpo", corpo_x_corpo(co, tri, nomes, dono)),
                           ("zonas", zonas(co, tri, nomes, dono, cena.equipamentos + cena.apoios,
                                           checagens.get("zonas", []), apoios=[a.name for a in cena.apoios])),
                           ("angulos", angulos_chave(rig, checagens.get("angulos", []) + tc.regras_padrao(checagens),
                                                     t))):
        itens[nome] = med
        r["falhas"] += f
    itens["tecnica"] = tc.medir(posicoes(rig))
    itens["apoio"], f = corpo_no_apoio(co, nomes, dono, cena.apoios, cena.afunda_apoio_mm)
    r["falhas"] += f
    pts = pontos_do_equipamento(cena.equipamentos + cena.apoios)
    estado.setdefault("ref_eq", pts)
    itens["rigidez"], f = rigidez(pts, estado["ref_eq"])
    r["falhas"] += f
    ossos = ossos_no_mundo(rig)
    if "ossos" in estado:
        itens["salto"], f = saltos(estado["ossos"], ossos)
        r["falhas"] += f
        tz = {k: ossos[P + k] for k in ("LeftFoot", "RightFoot")}
        if checagens.get("pes_no_chao", True):
            for k, p in tz.items():
                d = np.linalg.norm((p - estado["tornozelos"][k])[:2]) * 1000
                if d > ESCORREGA_MM:
                    r["falhas"].append("pé %s escorregou %.1f mm" % (k, d))
    estado["ossos"] = ossos
    estado["tornozelos"] = {k: ossos[P + k] for k in ("LeftFoot", "RightFoot")}
    r["itens"] = itens
    print("COMPLETA %s | juntas %s | pés %s | corpo×corpo %s | zonas %s | ângulos %s | técnica %s | apoio %.1f mm"
          " | rigidez %.1f mm | %s" % (
              rotulo, " ".join("%s %.0f" % (k, v) for k, v in itens["juntas"].items()),
              " ".join("%s %+.0f/%+.0f" % (k, *v) for k, v in itens["pes"].items()),
              " ".join("%s %.1f" % (k, v) for k, v in itens["corpo"].items()),
              " ".join("%s %.1f" % (k, v) for k, v in itens["zonas"].items()),
              " ".join("%s %s" % kv for kv in itens["angulos"].items()) or "-",
              tc.texto(itens["tecnica"]), itens["apoio"][0], itens["rigidez"],
              "OK" if not r["falhas"] else "FALHA: " + "; ".join(r["falhas"])), flush=True)
    return r
