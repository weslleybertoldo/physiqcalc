# Supino Inclinado com Halteres — cena da fábrica 3D (lote 10, 11/10/2026; 0 usos nos treinos prontos do app, 6 vezes como troca
# equivalente). O supino com halteres no banco inclinado do Supino Inclinado com Barra e do Crucifixo Inclinado com Halteres
# (e3.banco_inclinado a 30° + deitado3d.inclinar), com o polegar novo, sem mudar nada em lib/.
# t = 0 braços quase estendidos, halteres em cima dos ombros, juntos sem encostar · t = 1 halteres do lado da parte de cima do peito,
# antebraços quase em pé e cotovelos a ~50° do tronco, mais baixos que os ombros. O app faz a volta.
# As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   • banco a 30°: Rodríguez-Ridao 2020 (supino com barra livre a 0, 15, 30, 45 e 60°): "An inclination of 30° produces greater
#     activation of the upper portion of the pectoralis major" e, a 45°, a porção de cima não diferiu do banco reto e o deltoide
#     anterior passou a dominar; o Bodybuilding.com (Incline Dumbbell Press, o fonte_en) deixa o ângulo livre ("You can use several
#     angles on the incline bench") e o ExRx não fixa. O ACE (Incline Chest Press) pede "between 45 and 60 degrees": fica de fora
#     (deltoide). É o mesmo banco do Supino Inclinado com Barra e do Crucifixo Inclinado com Halteres;
#   • glúteo no assento, costas e cabeça no encosto, pés chapados (ACE: "Your head, shoulders, butt and feet should make contact
#     with the bench and floor/riser throughout the exercise");
#   • pegada pronada, os 2 cabos em linha, como uma barra (Graham 2000, NSCA: "both handles are in line with one another; simulate a
#     barbell with its center bar running through both dumbbell handles"; ACE: "closed, pronated grip (palms facing forward, thumbs
#     wrapped around the handle)"), punho reto (ACE: "Maintain a neutral wrist position");
#   • em cima os braços quase estendidos, os halteres em cima dos ombros e juntos, sem bater (ExRx: "traveling inward over each
#     shoulder at top"; Graham: "Bring the dumbbells together with control at the completion of the movement; do not bang the
#     dumbbells together"; "until the elbows are fully extended but not locked");
#   • embaixo os halteres do lado da parte de cima do peito, onde a barra encostaria (ExRx: "Lower weight to sides of upper chest";
#     ACE: "towards your upper chest, but moving slightly wider towards the armpits"; Graham: "where a barbell would touch your
#     chest"), o halter em cima do braço, entre o cotovelo e o peito (ExRx: "above upper arm between elbow and chest at bottom"), o
#     antebraço quase em pé (Graham: "the forearms almost perpendicular to the floor"; ACE: "Keep the elbows under your wrists") e o
#     cotovelo a 45–70° do tronco (ExRx, Bench Press Analyses: "a 45º to 70º angle between the shoulder and torso"), mais baixo que o
#     ombro (ExRx, Bench Press Analyses: "a mild stretch at the lowest position which would require the elbows to travel lower than
#     the shoulders").
# O CAMINHO: o braço (ombro → cotovelo) e o antebraço giram cada um por um arco de círculo máximo (slerp) entre a direção de cima e a
# de baixo: o antebraço fica quase em pé o tempo todo e o halter faz o arco leve do ExRx ("Dumbbell should follow slight arch
# pattern"), abrindo pro lado do peito embaixo e voltando pra dentro, em cima dos ombros, em cima. A mão fica presa ao antebraço com
# a linha dos nós no X (cabos em linha) e a palma pros pés: o pouco que o antebraço inclina pra dentro sai do desvio do punho.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from maos3d import Maos
from cena import Cena

RAIO = 0.0145                  # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13                # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05             # a do e3.halter() padrão
ANGULO = 30                    # encosto, graus da horizontal (Rodríguez-Ridao 2020: 30°; o mesmo banco do Crucifixo Inclinado)
ASSENTO = 0.44                 # topo do assento (m), o dos outros bancos da fábrica
COTOVELO_CIMA = 8              # flexão do cotovelo em cima (graus): estendido sem travar
VAO_CIMA = 0.045               # em cima: folga entre as anilhas de dentro dos 2 halteres (m) — juntos, sem bater (as pontas do
                               # eixo passam 1 cm de cada anilha: 25 mm entre elas)
ABRE = 50                      # embaixo: cotovelo × tronco, vista de frente do peito (graus; braco_abertura; 90 = em T)
DENTRO = 6                     # embaixo: antebraço inclinado pra dentro (graus): o punho um pouco pra dentro do cotovelo, o halter em
                               # cima do braço entre o cotovelo e o peito (ExRx)
COTOVELO_BAIXO = 136           # embaixo: flexão do cotovelo (graus) — fixa o quanto o braço desce atrás do plano do tronco: com
                               # 136° ele fica ~25° atrás (cotovelo ~10 cm mais baixo que o ombro, ao longo da normal do tronco) e a
                               # pegada ~9 cm acima da pele mais alta do peito; o braço curto do boneco (0,254 m) não deixa descer
                               # mais com o antebraço em pé sem passar de ~140° (o Supino Reto com Halteres termina em 136°)
PUNHO = 2                      # extensão do eixo do osso da mão (graus): com a linha do 3º metacarpo dá ~5–7° (punho quase reto)
LADOS = dt.LADOS               # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
X = Vector((1, 0, 0))
Z = Vector((0, 0, 1))


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


def _slerp(a, b, t):
    """Direção no arco de círculo máximo de a (t=0) até b (t=1)."""
    w = a.angle(b)
    if w < 1e-6:
        return a.copy()
    return ((a * math.sin((1 - t) * w) + b * math.sin(t * w)) / math.sin(w)).normalized()


def montar(bon):
    pg.usar_polegar("volta")                     # polegar dando a volta no halter (exercícios novos, 05/10/2026)
    rig = bon.rig
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)  # glúteo no assento, costas e cabeça no encosto, pés no chão
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA, larg_anilha=LARG_ANILHA)
                for l, _ in LADOS}
    maos = Maos(bon, RAIO, polegar_modo="volta")
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    cima_t, _ = dt.eixos_tronco(rig)                   # quadril → pescoço (o tronco, a 30° do chão)
    frente_t = Vector((0, -cima_t.z, cima_t.y))        # pra fora do peito, ⟂ ao tronco
    Sm = (S["Left"] + S["Right"]) / 2
    print("GEOMETRIA junta do banco y %.3f | ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | braço %.3f antebraço %.3f" % (
        junta_y, *S["Left"], *S["Right"], Lb, La), flush=True)

    # ── a mão presa ao antebraço: linha dos nós (indicador → mínimo) no X, palma pros pés, punho estendido PUNHO°. Referência (uma
    # vez por mão, com o antebraço em pé): (1) o ângulo, em volta da palma, entre a linha dos nós e o eixo do osso da mão (fixo na
    # mão do boneco: a linha dos nós é oblíqua), (2) o vão da mão − punho no referencial da mão.
    beta, off_local = {}, {}
    for lado, s in LADOS:
        dq, palma = Z.copy(), Vector((0, -1, 0))
        g = S[lado] + Vector((-s * 0.06, 0, 0.56))
        maos.segurar(lado, g, dq, palma, polo=S[lado] + Vector((s * 0.5, -0.3, -0.3)))
        nos = pg._base(rig, lado)[1]
        nos_p = (nos - palma * nos.dot(palma)).normalized()
        beta[lado] = math.atan2(nos_p.cross(dq).dot(palma), nos_p.dot(dq))
        off = g - p3.cabeca(rig, lado + "Hand")
        lat = dq.cross(palma)
        off_local[lado] = (off.dot(dq), off.dot(palma), off.dot(lat))
        print("REF %s: linha dos nós × eixo da mão %.1f° (nós × palma %.1f°) | vão−punho no referencial da mão (%.3f %.3f %.3f) | "
              "vão fora %.1f mm" % (lado, math.degrees(beta[lado]), math.degrees(nos.angle(palma)), *off_local[lado],
                                     maos.erro[lado] * 1000), flush=True)

    ext = Matrix.Rotation(-math.radians(PUNHO), 3, X)  # punho estendido: dedos pra cabeça (+Y), palma pros pés e um pouco pra cima

    def mao(lado, s, f):
        """Dedos (eixo do osso da mão), palma e lado da mão com o antebraço na direção f."""
        palma = (ext @ X.cross(f)).normalized()         # ⟂ ao X; com o antebraço em pé, pros pés (−Y)
        dq = (Matrix.Rotation(beta[lado], 3, palma) @ (X * s)).normalized()
        return dq, palma, dq.cross(palma)

    def vao(lado, s, W, f):
        dq, palma, lat = mao(lado, s, f)
        o = off_local[lado]
        return W + dq * o[0] + palma * o[1] + lat * o[2], dq, palma

    # ── em cima: vão de cada mão na vertical das articulações dos ombros (de lado), com as anilhas de dentro a VAO_CIMA uma da outra;
    # cotovelo dobrado COTOVELO_CIMA°, apontando pra fora (o cotovelo sai da reta ombro → punho pro lado de fora)
    X0 = PEGADA_H / 2 + LARG_ANILHA + VAO_CIMA / 2     # meio da pegada até o meio do corpo
    D0 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO_CIMA)))

    def cotovelo(lado, s, W, fora):
        """Cotovelo no círculo de ombro → punho, do lado `fora` (perpendicular à reta)."""
        d = W - S[lado]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-10))
        n = (fora - u * fora.dot(u)).normalized()
        return S[lado] + u * a + n * rho

    cima, baixo = {}, {}
    for lado, s in LADOS:
        f = Z.copy()
        for _ in range(30):
            dq, palma, lat = mao(lado, s, f)
            o = off_local[lado]
            off = dq * o[0] + palma * o[1] + lat * o[2]
            wx, wy = s * X0 - off.x, S[lado].y - off.y
            W = Vector((wx, wy, S[lado].z + math.sqrt(D0 ** 2 - (wx - S[lado].x) ** 2 - (wy - S[lado].y) ** 2)))
            E = cotovelo(lado, s, W, X * s)
            f = (W - E).normalized()
        cima[lado] = ((E - S[lado]) / Lb, f)

    # ── embaixo: braço a ABRE° do tronco (vista de frente do peito), caindo pra trás do plano do tronco até o cotovelo dobrar
    # COTOVELO_BAIXO° com o antebraço em pé e inclinado DENTRO° pra dentro
    def dir_baixo(s, bv):
        a = math.radians(ABRE)
        b = (-cima_t * math.cos(a) + X * s * math.sin(a)) * math.sqrt(1 - bv * bv) + frente_t * bv
        t = math.radians(DENTRO)
        return b.normalized(), (Z * math.cos(t) - X * s * math.sin(t)).normalized()

    for lado, s in LADOS:
        lo, hi = -0.95, 0.5                              # bv: componente do braço na frente (+) / atrás (−) do plano do tronco
        for _ in range(50):
            m = (lo + hi) / 2
            b, f = dir_baixo(s, m)
            if math.degrees(b.angle(f)) > COTOVELO_BAIXO:
                lo = m                                   # dobrado demais: o braço sobe (pra frente)
            else:
                hi = m
        baixo[lado] = dir_baixo(s, (lo + hi) / 2)
        BV = (lo + hi) / 2

    def bracos(t):
        """Cotovelo, punho, vão, dedos e palma de cada lado no quadro t (0 = em cima, 1 = embaixo)."""
        out = {}
        for lado, s in LADOS:
            b = _slerp(cima[lado][0], baixo[lado][0], t)
            f = _slerp(cima[lado][1], baixo[lado][1], t)
            E = S[lado] + b * Lb
            W = E + f * La
            g, dq, palma = vao(lado, s, W, f)
            out[lado] = (g, dq, palma, E, W)
        return out

    def polo(lado, E, W):
        eixo = (W - S[lado]).normalized()
        fora = (E - S[lado]) - eixo * (E - S[lado]).dot(eixo)
        return E + fora.normalized() * 0.4

    g0, g1 = bracos(0.0), bracos(1.0)
    for nome, gs in (("EM CIMA", g0), ("EMBAIXO", g1)):
        for lado, _ in LADOS:
            g, dq, palma, E, W = gs[lado]
            r = g - Sm
            print("%s %s: vão (%.3f %.3f %.3f) — ao longo do tronco %+.0f mm dos ombros, %.0f mm na frente do plano dos ombros | "
                  "cotovelo (%.3f %.3f %.3f), %+.0f mm do plano dos ombros | punho (%.3f %.3f %.3f)"
                  % (nome, lado, *g, r.dot(cima_t) * 1000, r.dot(frente_t) * 1000, *E, (E - S[lado]).dot(frente_t) * 1000, *W),
                  flush=True)
    print("EMBAIXO o braço fica %.0f mm atrás do plano do tronco por metro (bv %.3f): %.1f° atrás" % (
        -BV * 1000, BV, math.degrees(math.asin(-BV))), flush=True)
    peito_pele = dt.malha(bon, dt.TRONCO)

    def peito_na_altura(g):
        """Pele do tronco mais à frente (m, na frente do plano dos ombros) na faixa do vão ao longo do tronco, |x| < 16 cm."""
        r = peito_pele - np.array(Sm)
        u = r @ np.array(cima_t)
        f = r @ np.array(frente_t)
        ug = (g - Sm).dot(cima_t)
        m = (np.abs(u - ug) < 0.012) & (np.abs(peito_pele[:, 0]) < 0.16)
        return float(f[m].max()) if m.any() else float("nan")

    for lado, _ in LADOS:
        g = g1[lado][0]
        print("EMBAIXO %s: pegada %.0f mm na frente da pele mais alta do peito na mesma altura do tronco" % (
            lado, ((g - Sm).dot(frente_t) - peito_na_altura(g)) * 1000), flush=True)

    def pose(t):
        """t=0 braços quase estendidos, halteres em cima dos ombros; t=1 halteres do lado da parte de cima do peito."""
        gs = bracos(t)
        for lado, _ in LADOS:
            g, dq, palma, E, W = gs[lado]
            maos.segurar(lado, g, dq, palma, polo=polo(lado, E, W))
            eixo = pg._base(rig, lado)[1]                   # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            # polegar perto do quadro anterior (sem salto); t=0 recomeça do zero (checagem e captura saem iguais)
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)
        pose.desvio = {l: (p3.cabeca(rig, l + "ForeArm") - gs[l][3]).length * 1000 for l, _ in LADOS}
        pose.vaos = {l: gs[l][0] for l, _ in LADOS}

    pose.dedos = {}
    pose.desvio = {}
    pose.vaos = {}

    pose(0.5)                                    # polo certo do cotovelo no meio do caminho
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)

    # ── folgas que a checagem não mede (ela ignora o que fica DENTRO da mão e não mede peça × peça) ─────────────────────────
    cabelo_co, cabelo_tri = ck._avaliar_simples(bon.cabelo)
    bvh_cabelo = [("cabelo", cabelo_co, BVHTree.FromPolygons([tuple(p) for p in cabelo_co], [tuple(t) for t in cabelo_tri],
                                                               all_triangles=True))]

    def medidas_extras():
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        out = {}
        hb = {l: _malhas_bvh(halteres[l]) for l, _ in LADOS}
        anilhas = {l: [x for x in hb[l] if "anilha" in x[0]] for l, _ in LADOS}
        for lado, _ in LADOS:
            mao_v = co[np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]]
            out["mão %s × anilhas do halter dela" % lado[0]] = _distancia(mao_v, anilhas[lado])
        pts = {l: np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in ck._malhas(halteres[l])]) for l, _ in LADOS}
        out["halter × halter"] = _distancia(pts["Left"], hb["Right"])
        bb = _malhas_bvh(banco)
        for lado, _ in LADOS:
            out["halter %s × banco" % lado[0]] = _distancia(pts[lado], bb)
            out["halter %s × cabelo" % lado[0]] = _distancia(pts[lado], bvh_cabelo, sinal=False)
        eixos = [(halteres[l].matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized() for l, _ in LADOS]
        out["ângulo entre os halteres (°)"] = (math.degrees(min(eixos[0].angle(eixos[1]), eixos[0].angle(-eixos[1]))), "")
        out["halter × X, cabos em linha (°)"] = (max(math.degrees(min(e.angle(X), e.angle(-X))) for e in eixos), "")
        return out

    def info():
        j = ck.posicoes(rig)
        med = ck.medir_juntas(rig)
        pol = {l: pose.dedos.get(l, {}).get("Thumb") for l, _ in LADOS}
        volta = {l: isinstance(p, tuple) and len(p) > 10 and p[0] == "volta" and p[10] for l, p in pol.items()}
        vao_p = {l: (p[8] if volta[l] else float("nan")) for l, p in pol.items()}
        ex = medidas_extras()
        txt = " | ".join("%s %s" % (k, ("%.1f" % v[0]) if "°" in k else "%.1f mm%s" % (v[0] * 1000, " (%s)" % v[1] if v[1] else ""))
                         for k, v in ex.items())
        alt = []
        for lado, _ in LADOS:
            g = pose.vaos[lado]
            r = g - Sm
            alt.append("%s ao longo do tronco %+.0f mm, %.0f mm na frente do peito" % (
                lado[0], r.dot(cima_t) * 1000, (r.dot(frente_t) - peito_na_altura(g)) * 1000))
        return ("cotovelo E %.0f° D %.0f° | braço: abertura %s°, elevação %s°, frente %s° | antebraço × vertical %s° | palma dentro %s°, "
                "frente %s° | punho flexão %s° desvio %s° | pegada largura %.2f | vão %s | halter E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) "
                "| %s | polegar em volta E %s D %s, × falange média E %.1f D %.1f mm | cotovelo fora do calculado E %.1f D %.1f mm | %s"
                % (med["cotoveloE"], med["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_abertura(j)),
                   "/".join("%.0f" % v for v in tc.braco_elevacao(j)), "/".join("%.0f" % v for v in tc.braco_frente(j)),
                   "/".join("%.0f" % v for v in tc.antebraco_vertical(j)), "/".join("%.0f" % v for v in tc.palma_dentro(j)),
                   "/".join("%.0f" % v for v in tc.palma_frente(j)), "/".join("%.0f" % v for v in tc.punho_flexao(j)),
                   "/".join("%.0f" % v for v in tc.punho_desvio(j)), tc.pegada_largura(j)[0], " · ".join(alt),
                   *halteres["Left"].location, *halteres["Right"].location, txt,
                   "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO", vao_p["Left"], vao_p["Right"],
                   pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), maos.info()))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.2, 0.9),
                camera_video=((2.6, -2.7, 1.6), (0, 0.25, 0.95), 50), info=info, apoios=[banco], afunda_apoio_mm=20)
