# Tríceps Testa com Halteres — cena da fábrica 3D (lote 11, 11/10/2026; 0 usos nos treinos prontos do app, 5 vezes como troca
# equivalente). A extensão deitada com 2 halteres ("Lying Dumbbell Tricep Extension", o fonte_en do catálogo) no banco reto do
# Tríceps Testa com Barra e do Supino Reto com Halteres (e3.banco + deitado3d.deitar), com o polegar novo, sem mudar nada em lib/.
# t = 0 braços estendidos na vertical, cada halter em cima do seu ombro · t = 1 cotovelos dobrados, os halteres do lado da cabeça,
# perto das orelhas. O app faz a volta.
# As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   • deitado de costas no banco reto, cabeça, costas e glúteo no banco, os 2 pés chapados (free-exercise-db: "Lie on a flat bench
#     while holding two dumbbells directly in front of you"; CSCS/NSCA: "Lie supine on a bench in the five-point body contact
#     position" — "Head on the bench or pad", "Shoulders/upper back on the bench", "Buttocks on the bench or seat", "Right foot flat
#     on the floor", "Left foot flat on the floor");
#   • em cima os braços esticados NA VERTICAL, a 90° do tronco e do chão (free-exercise-db: "Your arms should be fully extended at a
#     90-degree angle from your torso and the floor"; ExRx: "position dumbbells over head with arms extended");
#   • pegada NEUTRA, as palmas uma pra outra, e os cotovelos fechados (free-exercise-db: "The palms should be facing in and the
#     elbows should be tucked in") — a barra do Tríceps Testa com Barra é pronada (ACE: "palms facing your feet");
#   • o braço PARADO na vertical e só o cotovelo dobra (free-exercise-db: "keep the upper arms stationary with the elbows in"; ACE,
#     com barra: "Your upper arms should remain vertical to the floor as the elbows bend"; CSCS: "keep the upper arms perpendicular
#     to the floor and parallel to each other"), os cotovelos apontando pros joelhos, sem abrir (CSCS: "Point the elbows toward the
#     knees (not out to the sides)"; ACE: "keep your elbows shoulder-width apart"), punho reto (ACE: "Maintain a neutral wrist
#     position (no flexion or extension at the wrist)"; CSCS: "Keep the wrists stiff");
#   • embaixo os halteres ficam DO LADO DA CABEÇA, perto das orelhas (ExRx: "Lower dumbbells by bending elbow until they are to sides
#     of head"; free-exercise-db: "slowly lower the weight until the dumbbells are near your ears") — a barra para logo acima da
#     testa (ACE: "Lower the bar until it sits just above your forehead"), os halteres passam do lado dela e descem mais.
# O CAMINHO: cada braço fica PARADO na vertical, em cima do ombro (cotovelo E = ombro + braço × vertical), e o cotovelo é uma
# dobradiça (FK, sem o IK do Blender: perto de esticado o IK trava o braço reto — Tríceps Francês com Halter, lote 7; Tríceps Coice
# com Halter, lote 10): o antebraço gira no plano cabeça ↔ pés que passa pelo cotovelo, de COTOVELO_CIMA (esticado, sem travar) até
# COTOVELO_BAIXO. A mão fica reta no antebraço (punho neutro) com a palma virada pro meio do corpo; ela fecha no halter UMA vez (o
# halter no vão da mão de referência, na linha dos nós dos dedos, e o polegar novo dando a volta no pegador) e o halter vai junto
# com a mão em todos os quadros.
import math
import os
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from cena import Cena

RAIO = 0.0145                  # pegador do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13                # pegador entre as anilhas (m)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05             # a do e3.halter() padrão
TOPO = 0.44                    # altura do estofado (m), a do Tríceps Testa com Barra e do Supino Reto com Halteres
BANCO_Y = (-0.28, 0.92)        # pé e cabeceira do banco
COTOVELO_CIMA = 5              # flexão do cotovelo em cima (graus): estendido, sem travar (o mesmo do Tríceps Testa com Barra)
COTOVELO_BAIXO = 125           # flexão do cotovelo embaixo (graus): os halteres do lado da cabeça, perto das orelhas. Medido com a
                               # sonda (SONDA_TESTA, abaixo; 11/10/2026): a 125° a anilha de baixo fica do lado da orelha, ~37 mm
                               # acima do estofado e ~3 cm da pele da cabeça; a 130° sobram 14 mm até o banco e a 135° ela entra
                               # nele (−5 mm). A barra do Tríceps Testa com Barra para em ~113°, logo acima da testa: os halteres
                               # passam do lado da cabeça e descem mais
REF = 60                       # flexão do cotovelo na pose de referência (IK uma vez só, pro FK do braço)
LADOS = dt.LADOS               # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
CIMA = Vector((0, 0, 1))       # o braço parado aponta pra cá (vertical)
CABECA = Vector((0, 1, 0))     # pra onde o antebraço dobra (pra cabeça, no plano cabeça ↔ pés)


def _malhas_bvh(raiz):
    """BVH (mundo) de cada malha da peça, com o nome."""
    out = []
    for o in ck._malhas(raiz):
        co, tri = ck._avaliar_simples(o)
        out.append((o.name, co, BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in tri], all_triangles=True)))
    return out


def _distancia(pts, bvhs, sinal=True):
    """Menor distância (m) dos pontos até as malhas (− = dentro: o lado de dentro da face mais perto, confirmado pela paridade do
    raio, como na checagem), e de qual malha. Pontos a mais de 6 cm da caixa de uma malha: a distância até a caixa (≤ a de
    verdade), marcada "(caixa)"."""
    melhor = (9.0, "")
    for nome, co, bvh in bvhs:
        lo, hi = co.min(axis=0) - 0.06, co.max(axis=0) + 0.06
        dentro_caixa = ((pts >= lo) & (pts <= hi)).all(axis=1)
        if not dentro_caixa.any():
            gap = float(np.linalg.norm(np.maximum(0.0, np.maximum(co.min(axis=0)[None] - pts, pts - co.max(axis=0)[None])),
                                       axis=1).min())
            if gap < melhor[0]:
                melhor = (gap, nome + " (caixa)")
            continue
        for v in pts[dentro_caixa]:
            loc, nor, _, d = bvh.find_nearest(Vector(v))
            if loc is None:
                continue
            if sinal and (Vector(v) - loc).dot(nor) < 0 and ck._dentro(bvh, Vector(v)):
                d = -d
            if d < melhor[0]:
                melhor = (d, nome)
    return melhor


def _sdf_halter(P, M, partes=False):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até o halter (pegador + 2 anilhas: 3 cilindros), com a matriz de
    mundo M da raiz (eixo local X). partes=True: (pegador, anilha −, anilha +) separados."""
    M = np.array(M)
    c0, w = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c0
    a = d @ w
    rho = np.linalg.norm(d - np.outer(a, w), axis=1)

    def cil(a0, meia, R):
        qx, qy = rho - R, np.abs(a - a0) - meia
        return np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))

    ma = PEGADA_H / 2 + LARG_ANILHA / 2
    eixo = cil(0.0, (PEGADA_H + 2 * LARG_ANILHA + 0.02) / 2, RAIO)
    am, ap = cil(-ma, LARG_ANILHA / 2, RAIO_ANILHA), cil(ma, LARG_ANILHA / 2, RAIO_ANILHA)
    if partes:
        return eixo, am, ap
    return np.minimum(np.minimum(eixo, am), ap)


def montar(bon):
    pg.usar_polegar("volta")                     # polegar dando a volta no halter (exercícios novos, 05/10/2026)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    dt.deitar(bon, TOPO)                         # cabeça, costas e glúteo no estofado, pés chapados no chão
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA, larg_anilha=LARG_ANILHA)
                for l, _ in LADOS}
    for h in halteres.values():
        h.rotation_mode = "QUATERNION"

    # ── braços por IK, só pra referência do FK: alvos nascem no punho de repouso (alvo = polo dá NaN) ─────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, _ in LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, c(lado + "ForeArm") + Vector((0, -0.6, 0.3)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])

    # ── o braço PARADO na vertical, em cima do ombro: o cotovelo fica em E o movimento todo ──────────────────────────────────
    G = {}
    for lado, _ in LADOS:
        S = c(lado + "Arm")
        Lb = (c(lado + "ForeArm") - S).length
        La = (c(lado + "Hand") - c(lado + "ForeArm")).length
        G[lado] = dict(S=S, E=S + CIMA * Lb, Lb=Lb, La=La)
    print("GEOMETRIA ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | braço %.3f antebraço %.3f | cotovelo E (%.4f %.4f %.4f)" % (
        *G["Left"]["S"], *G["Right"]["S"], G["Left"]["Lb"], G["Left"]["La"], *G["Left"]["E"]), flush=True)

    def antebraco(b):
        """Direção do antebraço (cotovelo → punho) com o cotovelo dobrado b graus: 0 = na linha do braço (pra cima), 90 = deitado
        pra cabeça, mais que 90 = descendo do lado da cabeça."""
        r = math.radians(b)
        return CIMA * math.cos(r) + CABECA * math.sin(r)

    def _congelar(lado):
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    # referência do FK: o braço dobrado que o IK acha com o cotovelo a REF graus, com o cotovelo levado exatamente pro E
    ref = {}
    for lado, _ in LADOS:
        S, E, La = G[lado]["S"], G[lado]["E"], G[lado]["La"]
        Wr = E + antebraco(REF) * La
        iks[lado].mute = False
        punhos[lado].location = Wr
        eixo = (Wr - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)
        _congelar(lado)
        Rr = (c(lado + "ForeArm") - S).normalized().rotation_difference(CIMA).to_matrix().to_4x4()
        Rs = Matrix.Translation(S) @ Rr @ Matrix.Translation(-S)          # cotovelo exatamente em E
        r = dict(MA=Rs @ PB[p3.P + lado + "Arm"].matrix, MF=Rs @ PB[p3.P + lado + "ForeArm"].matrix)
        fr = (Rs @ c(lado + "Hand") - Rs @ c(lado + "ForeArm")).normalized()
        r["n"], r["b"] = CIMA.cross(fr).normalized(), CIMA.angle(fr)
        ref[lado] = r

    def braco_fk(lado, Wq):
        """Braço parado (só gira em volta do próprio eixo se o plano da dobra mudar) e o cotovelo dobrando como dobradiça (eixo
        fixo no braço) até o punho cair em Wq — exato, sem o IK do Blender (como no Tríceps Coice com Halter)."""
        r = ref[lado]
        S, E = G[lado]["S"], G[lado]["E"]
        f = (Wq - E).normalized()
        n = CIMA.cross(f)
        n = n.normalized() if n.length > 1e-6 else r["n"]
        fi = math.atan2(r["n"].cross(n).dot(CIMA), r["n"].dot(n))
        Rt = Matrix.Translation(S) @ Matrix.Rotation(fi, 4, CIMA) @ Matrix.Translation(-S)
        Rh = Matrix.Translation(E) @ Matrix.Rotation(CIMA.angle(f) - r["b"], 4, n) @ Matrix.Translation(-E)
        PB[p3.P + lado + "Arm"].matrix = Rt @ r["MA"]
        p3.atualizar()
        PB[p3.P + lado + "ForeArm"].matrix = Rh @ Rt @ r["MF"]
        p3.atualizar()

    def _girar_antebraco(lado, quer):
        """Prona/supina o antebraço pra palma (com a mão reta no antebraço) ir pra `quer` (projetado ⟂ antebraço)."""
        f0, f1 = c(lado + "ForeArm"), c(lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = (quer - ax * quer.dot(ax)).normalized()
        tem = pg._base(rig, lado)[0]
        tem = (tem - ax * tem.dot(ax)).normalized()
        ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
        p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
        return math.degrees(ang)

    # pegada neutra (as palmas uma pra outra, viradas pro meio do corpo), com a mão reta no antebraço: o antebraço gira em volta do
    # próprio eixo uma vez, na referência, e a dobradiça mantém o giro em todos os quadros (o eixo da dobra fica no X)
    for lado, s in LADOS:
        Wr = G[lado]["E"] + antebraco(REF) * G[lado]["La"]
        braco_fk(lado, Wr)
        pg.mao_de_referencia(rig, lado)
        giro = _girar_antebraco(lado, Vector((-s, 0, 0)))
        ref[lado]["MF"] = PB[p3.P + lado + "ForeArm"].matrix.copy()
        braco_fk(lado, Wr)
        print("PEGADA NEUTRA %s: antebraço girou %.0f° em volta do próprio eixo | eixo da dobra (%.3f %.3f %.3f)" % (
            lado, giro, *ref[lado]["n"]), flush=True)

    # a mão fecha no halter UMA vez (o halter no vão da mão de referência, na linha dos nós dos dedos, e o polegar novo dando a volta
    # no pegador); depois ela e o halter só acompanham o antebraço
    pose_dedos, H_rel, dedos = {}, {}, {}
    for lado, _ in LADOS:
        pg.mao_de_referencia(rig, lado)
        g, envolve = pg.ponto_na_mao(bon, lado, RAIO)
        eixo_h = pg._base(rig, lado)[1]
        h = halteres[lado]
        h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo_h)
        h.location = g
        p3.atualizar()
        dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo_h, RAIO)
        print("PEGADA %s vão (%.3f %.3f %.3f) envolve %.0f° | dedos %s" % (lado, *g, envolve, dedos[lado]), flush=True)
        ossos_mao = [pb.name for pb in PB if pb.name[len(p3.P):].startswith(lado + "Hand") and pb.name != p3.P + lado + "Hand"]
        pose_dedos[lado] = {n: PB[n].matrix_basis.copy() for n in ossos_mao}
        H_rel[lado] = p3.mundo_osso(rig, lado + "Hand").inverted() @ h.matrix_world

    def posicionar(b):
        """Os 2 braços parados e os cotovelos dobrados b graus; mãos e halteres juntos com os antebraços."""
        for lado, _ in LADOS:
            braco_fk(lado, G[lado]["E"] + antebraco(b) * G[lado]["La"])
            for n, M in pose_dedos[lado].items():
                PB[n].matrix_basis = M
        p3.atualizar()
        for lado, _ in LADOS:
            loc, rot, _ = (p3.mundo_osso(rig, lado + "Hand") @ H_rel[lado]).decompose()
            halteres[lado].location = loc
            halteres[lado].rotation_quaternion = rot
        p3.atualizar()

    def pose(t):
        """t=0 braços estendidos na vertical, halteres em cima dos ombros; t=1 cotovelos dobrados, halteres do lado da cabeça."""
        b = p3.lerp(COTOVELO_CIMA, COTOVELO_BAIXO, t)
        posicionar(b)
        pose.b = b

    pose.b = COTOVELO_CIMA

    # ── folgas que a checagem não mede (ela ignora o que fica DENTRO da mão e não mede peça × peça) ─────────────────────────────
    cabelo_co, cabelo_tri = ck._avaliar_simples(bon.cabelo)
    bvh_cabelo = BVHTree.FromPolygons([tuple(p) for p in cabelo_co], [tuple(t) for t in cabelo_tri], all_triangles=True)
    bb = _malhas_bvh(banco)

    def medidas():
        """mm: halter × banco (anilha de baixo), × pele da cabeça e do pescoço, × cabelo, × ombro/braço/antebraço; mão × anilhas do
        halter dela; halter × halter; mão/antebraço × cabeça e cabelo."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        out = {}
        cabeca = co[np.array([n in ("Head", "Neck") for n in nomes] + [False])[dono]]
        for lado, _ in LADOS:
            M = halteres[lado].matrix_world
            pts = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.008) for o in ck._malhas(halteres[lado])])
            d_b = _distancia(pts, bb)
            out["halter %s × banco" % lado[0]] = (d_b[0] * 1000, d_b[1])
            out["halter %s × cabeça (pele)" % lado[0]] = (float(_sdf_halter(cabeca, M).min()) * 1000, "")
            out["halter %s × cabelo" % lado[0]] = (min(bvh_cabelo.find_nearest(Vector(v))[3] for v in pts[::2]) * 1000, "")
            braco = co[np.array([n in (lado + "Arm", lado + "Shoulder") for n in nomes] + [False])[dono]]
            out["halter %s × ombro/braço" % lado[0]] = (float(_sdf_halter(braco, M).min()) * 1000, "")
            ante = co[np.array([n == lado + "ForeArm" for n in nomes] + [False])[dono]]
            out["halter %s × antebraço" % lado[0]] = (float(_sdf_halter(ante, M).min()) * 1000, "")
            mao = co[np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]]
            _, am, ap = _sdf_halter(mao, M, partes=True)
            out["mão %s × anilhas" % lado[0]] = (float(np.minimum(am, ap).min()) * 1000, "")
            mao_ante = co[np.array([n.startswith(lado + "Hand") or n == lado + "ForeArm" for n in nomes] + [False])[dono]]
            P = mao_ante[np.linalg.norm(mao_ante - np.array(c("Head")), axis=1) < 0.35]
            out["mão/antebraço %s × cabelo" % lado[0]] = (
                min(bvh_cabelo.find_nearest(Vector(v))[3] for v in P[::2]) * 1000 if len(P) else 999.0, "")
        pts_e = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.008) for o in ck._malhas(halteres["Left"])])
        out["halter × halter"] = (float(_sdf_halter(pts_e, halteres["Right"].matrix_world).min()) * 1000, "")
        return out

    def onde_halter(lado):
        """Centro do halter e das 2 anilhas (mundo) e a anilha de baixo."""
        M = halteres[lado].matrix_world
        w = (M.to_3x3() @ Vector((1, 0, 0))).normalized()
        ma = PEGADA_H / 2 + LARG_ANILHA / 2
        a1, a2 = M.to_translation() - w * ma, M.to_translation() + w * ma
        return M.to_translation(), (a1, a2) if a1.z <= a2.z else (a2, a1), w

    # orelhas: a pele da cabeça mais pro lado de fora (|x| máximo) de cada lado
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    pele_cab = co0[np.array([n == "Head" for n in nomes0] + [False])[dono0]]
    orelha = {}
    for lado, s in LADOS:
        lado_pts = pele_cab[pele_cab[:, 0] * s > 0]
        orelha[lado] = Vector(lado_pts[np.argmax(np.abs(lado_pts[:, 0]))])
    print("CABEÇA pele: x %.3f a %.3f, y %.3f a %.3f, z %.3f a %.3f | orelha E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) | cabelo x %.3f "
          "a %.3f, z até %.3f" % (pele_cab[:, 0].min(), pele_cab[:, 0].max(), pele_cab[:, 1].min(), pele_cab[:, 1].max(),
                                pele_cab[:, 2].min(), pele_cab[:, 2].max(), *orelha["Left"], *orelha["Right"],
                                cabelo_co[:, 0].min(), cabelo_co[:, 0].max(), cabelo_co[:, 2].max()), flush=True)

    # tabela de folgas por ângulo do cotovelo, pra escolher o COTOVELO_BAIXO (só com a variável SONDA_TESTA="120,125,130"; na
    # exportação normal não roda)
    if os.environ.get("SONDA_TESTA"):
        for b in [float(x) for x in os.environ["SONDA_TESTA"].split(",")]:
            posicionar(b)
            ctr, (baixa, alta), w = onde_halter("Left")
            m = medidas()
            print("SONDA b=%.0f | halter E centro (%.3f %.3f %.3f) anilha de baixo (%.3f %.3f %.3f) eixo (%.2f %.2f %.2f) | %s" % (
                b, *ctr, *baixa, *w, " | ".join("%s %.1f%s" % (k, v[0], " (%s)" % v[1] if v[1] else "") for k, v in m.items())),
                flush=True)

    for t in (0.0, 0.5, 1.0):
        pose(t)
        ctr, (baixa, alta), w = onde_halter("Left")
        print("POSE t=%.1f b=%.0f | halter E centro (%.3f %.3f %.3f) anilha de baixo (%.3f %.3f %.3f)" % (t, pose.b, *ctr, *baixa),
              flush=True)

    def info():
        j = ck.posicoes(rig)
        med = ck.medir_juntas(rig)
        pol = {l: dedos[l].get("Thumb") for l, _ in LADOS}
        volta = {l: isinstance(p, tuple) and len(p) > 10 and p[0] == "volta" and p[10] for l, p in pol.items()}
        vao = {l: (p[8] if volta[l] else float("nan")) for l, p in pol.items()}
        m = medidas()
        txt = " | ".join("%s %.1f mm%s" % (k, v[0], " (%s)" % v[1] if v[1] else "") for k, v in m.items())
        desvio = {l: (c(l + "ForeArm") - G[l]["E"]).length * 1000 for l, _ in LADOS}
        ctr = {l: onde_halter(l)[0] for l, _ in LADOS}
        return ("cotovelo E %.1f° D %.1f° (pedido %.1f°) | braço frente %s°, cotovelo × tronco %s°, cotovelos largura %.2f | "
                "antebraço × vertical %s° | palma dentro %s° | punho flexão %s° desvio %s° | halter E (%.3f %.3f %.3f) D (%.3f %.3f "
                "%.3f) | %s | polegar em volta E %s D %s, × falange média E %.1f D %.1f mm | cotovelo fora do calculado E %.1f D %.1f "
                "mm" % (med["cotoveloE"], med["cotoveloD"], pose.b, "/".join("%.0f" % v for v in tc.braco_frente(j)),
                        "/".join("%.0f" % v for v in tc.cotovelo_tronco(j)), tc.cotovelos_largura(j)[0],
                        "/".join("%.0f" % v for v in tc.antebraco_vertical(j)), "/".join("%.0f" % v for v in tc.palma_dentro(j)),
                        "/".join("%.0f" % v for v in tc.punho_flexao(j)), "/".join("%.0f" % v for v in tc.punho_desvio(j)),
                        *ctr["Left"], *ctr["Right"], txt, "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO",
                        vao["Left"], vao["Right"], desvio["Left"], desvio["Right"]))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.5, 0.75),
                camera_video=((3.0, 0.3, 1.4), (0, 0.5, 0.75), 50), info=info, apoios=[banco], afunda_apoio_mm=20)
