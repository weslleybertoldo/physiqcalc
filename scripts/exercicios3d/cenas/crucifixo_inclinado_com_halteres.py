# Crucifixo Inclinado com Halteres — cena da fábrica 3D (lote 10, 10/10/2026; 0 usos nos treinos prontos do app, 7 vezes como troca
# equivalente). O crucifixo do Crucifixo com Halteres (lote 2) no banco inclinado do Supino Inclinado com Barra (e3.banco_inclinado a
# 30° + deitado3d.inclinar), com o polegar novo, sem mudar nada em lib/.
# t = 0 braços quase estendidos, halteres em cima da parte de cima do peito, quase encostando um no outro · t = 1 braços abertos pros
# lados, halteres do lado dos ombros, na altura do peito. O app faz a volta.
# As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   • banco a 30°: Bodybuilding.com, Incline Dumbbell Flyes (o nome do catálogo): "lie on an incline bench that is set to an incline
#     angle of no more than 30 degrees"; Reiser et al. 2014 mediram o crucifixo com halteres "inclinado à 30º"; Rodríguez-Ridao 2020
#     (supino): "An inclination of 30° produces greater activation of the upper portion of the pectoralis major";
#   • glúteo no assento, costas e cabeça no encosto, pés chapados (ACE, Lying Chest Fly: "Your head, shoulders, butt and feet should
#     make contact with the bench and floor/riser throughout the exercise");
#   • em cima os halteres ficam em cima da parte de cima do peito, quase juntos (ExRx, Dumbbell Incline Fly: "Support dumbbells above
#     upper chest with arms fixed in slightly bent position" / "bring dumbbells back together in hugging motion above upper chest
#     until dumbbells are nearly together");
#   • embaixo eles descem pros lados, do lado dos ombros (ExRx: "Lower dumbbells outward to sides of shoulders"), não mais fundo que
#     no banco reto (ExRx: "Shoulder will likely have less range of motion in lower position as compared to Fly on flat bench"): o
#     eixo do halter na altura da pele mais alta do peito (ACE: "until they lie level with your shoulders or chest"), com o braço
#     (ombro → cotovelo) na linha dos ombros (Reiser 2014: o ângulo mais aberto, 90° da vertical, foi o de maior atividade);
#   • cotovelo levemente dobrado e PARADO (ExRx: "Keep elbows fixed in slightly bent position"; Solstad 2020: "the elbow angle
#     (150-160º)" / "kept close to constant"), apontando pra fora em cima e pro chão embaixo (ExRx: "Keep shoulders internally rotated
#     so elbows point downward at bottom position and outward at top position");
#   • pegada neutra, halteres paralelos (ACE: "palms to face inward" / "Keep the dumbbells parallel with each other during the
#     movement"); punho reto (ACE: "maintaining a neutral wrist position").
# O ARCO: o braço inteiro (braço, antebraço e mão) gira como uma peça só em volta do ombro, num plano VERTICAL de lado a lado (em
# volta do eixo horizontal cabeça ↔ pés, o EIXO do crucifixo reto): o peso (vertical) fica no plano do movimento, os braços ficam na
# vertical em cima (Reiser 2014 mediu o ângulo do braço "com a vertical" também no banco inclinado) e os halteres ficam paralelos ao
# eixo do arco. Com o tronco a 30°, em cima o braço fica a ~120° do tronco (o mesmo do Supino Inclinado com Barra em cima) e
# embaixo a ~90°, aberto pro lado: o caminho sobe pra cabeça em relação ao tronco, o do peitoral de cima (porção clavicular).
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
ANGULO = 30                    # encosto, graus da horizontal (Bodybuilding.com: "no more than 30 degrees"; Reiser 2014: 30º)
ASSENTO = 0.44                 # topo do assento (m), o dos outros bancos da fábrica
COTOVELO = 25                  # flexão do cotovelo, graus, parada o movimento todo (150–160° por dentro, Solstad 2020)
VAO_CIMA = 0.04                # em cima: folga entre as anilhas de dentro dos 2 halteres (m) — quase juntos, sem encostar
BRACO_BAIXO = 0.0              # embaixo: braço (ombro → cotovelo) a esse ângulo da horizontal (graus): na linha dos ombros, os
                               # halteres do lado dos ombros, na altura do peito (ExRx: "Lower dumbbells outward to sides of
                               # shoulders"; ACE: "level with your shoulders or chest"), sem descer mais que no banco reto (lá o
                               # braço termina ~5° abaixo; ExRx: "less range of motion in lower position as compared to Fly on
                               # flat bench")
PEITO_CIMA = 0.0               # em cima: o meio dos 2 halteres fica na vertical da pele do peito (no meio) que está nessa distância
                               # (m) abaixo das articulações dos ombros, ao longo do tronco — a parte de cima do peito, logo abaixo
                               # das clavículas (ExRx: "above upper chest"); é a altura em que a barra encosta no Supino Inclinado
                               # com Barra embaixo
LADOS = dt.LADOS               # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)


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


def montar(bon):
    pg.usar_polegar("volta")                     # polegar dando a volta no halter (exercícios novos, 05/10/2026)
    rig = bon.rig
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)  # glúteo no assento, costas e cabeça no encosto, pés no chão
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA) for l, _ in LADOS}
    maos = Maos(bon, RAIO, polegar_modo="volta")
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    fi = math.radians(COTOVELO)
    cima_t, _ = dt.eixos_tronco(rig)                   # quadril → pescoço (o tronco, a 30° do chão)
    EIXO = Vector((0, 1, 0))                           # eixo do arco (achado abaixo: o horizontal inclinado de BETA)
    CIMA = Vector((0, 0, 1))                           # pra onde o braço aponta em cima, no plano do arco (⟂ EIXO)
    print("GEOMETRIA junta do banco y %.3f | ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | braço %.3f antebraço %.3f" % (
        junta_y, *S["Left"], *S["Right"], Lb, La), flush=True)

    def bracos(th):
        """Braço, antebraço e palma (mundo) de cada lado com o braço a `th` graus acima da horizontal, no plano ⟂ EIXO
        que passa pelo ombro (quase vertical, de lado a lado). O cotovelo dobra pra dentro do arco (o antebraço vai pro lado que
        o braço fecha) e a palma olha pra esse mesmo lado: o braço todo é uma peça só girando em volta do EIXO."""
        out = {}
        for lado, s in LADOS:
            fora = Vector((s, 0, 0))
            a = math.radians(th)
            braco = fora * math.cos(a) + CIMA * math.sin(a)
            fecha = -fora * math.sin(a) + CIMA * math.cos(a)          # pra onde o braço anda fechando
            ante = braco * math.cos(fi) + fecha * math.sin(fi)
            palma = -braco * math.sin(fi) + fecha * math.cos(fi)
            out[lado] = (braco, ante, palma)
        return out

    def juntas(th):
        """Cotovelo e punho calculados de cada lado (o braço do boneco tem comprimento fixo)."""
        out = {}
        for lado, (braco, ante, palma) in bracos(th).items():
            E = S[lado] + braco * Lb
            out[lado] = (E, E + ante * La)
        return out

    def polo(lado, E, W):
        eixo = (W - S[lado]).normalized()
        fora = (E - S[lado]) - eixo * (E - S[lado]).dot(eixo)
        return E + fora.normalized() * 0.4

    # ── o plano do arco: em cima o meio dos 2 halteres fica na vertical da parte de cima do peito (PEITO_CIMA). Com o eixo
    # horizontal cabeça ↔ pés (o do crucifixo reto) e o tronco a 30°, a vertical dos ombros sai na base do pescoço, uns 7 cm
    # acima disso ao longo do tronco (sonda de 10/10/2026): o eixo inclina BETA em volta do X (a ponta da cabeça sobe), o plano
    # do arco fica BETA fora da vertical e, em cima, os braços se inclinam BETA pros pés. Embaixo nada muda (o braço fica no X).
    # A pele-alvo: a do meio do peito (|x| < 2 cm) mais à frente, na altura dos ombros menos PEITO_CIMA, ao longo do tronco.
    Pm = dt.malha(bon, dt.TRONCO)
    Pm = Pm[np.abs(Pm[:, 0]) < 0.02]
    Sm = (S["Left"] + S["Right"]) / 2
    frente_t = Vector((0, -cima_t.z, cima_t.y))
    faixa = Pm[np.abs((Pm - np.array(Sm)) @ np.array(cima_t) + PEITO_CIMA) < 0.006]
    alvo_peito = Vector(faixa[((faixa - np.array(Sm)) @ np.array(frente_t)).argmax()])

    def com_beta(beta):
        b = math.radians(beta)
        return Vector((0, math.cos(b), math.sin(b))), Vector((0, -math.sin(b), math.cos(b)))

    # ── referência (braço a 45°), como no crucifixo reto: (1) quanto a mão gira em volta da palma pra linha dos nós dos dedos
    # (onde fica o eixo do halter) ficar paralela ao EIXO — o giro fica no punho (desvio de lado, sem dobrar pra frente nem pra
    # trás); (2) onde fica o vão da mão em relação ao punho, no referencial da mão (fixo: a mão não mexe em relação ao antebraço)
    TH_REF = 45.0
    giro, off_local = {}, {}

    def referencia():
        """Giro da mão e vão − punho de cada lado com o eixo atual (o braço a TH_REF°, a meio caminho do arco)."""
        dirs = bracos(TH_REF)
        for lado, _ in LADOS:
            braco, ante, palma = dirs[lado]
            E, W = juntas(TH_REF)[lado]
            maos.segurar(lado, W + ante * 0.08, ante, palma, polo=polo(lado, E, W))
            nos = pg._base(rig, lado)[1]
            nos_p = (nos - palma * nos.dot(palma)).normalized()
            quer = EIXO if nos_p.dot(EIXO) > 0 else -EIXO
            giro[lado] = math.atan2(nos_p.cross(quer).dot(palma), nos_p.dot(quer))
            dq = Matrix.Rotation(giro[lado], 3, palma) @ ante
            maos.segurar(lado, W + dq * 0.08, dq, palma, polo=polo(lado, E, W))
            g = W + dq * 0.08
            off = g - p3.cabeca(rig, lado + "Hand")
            lat = dq.cross(palma)
            off_local[lado] = (off.dot(dq), off.dot(palma), off.dot(lat))
            nos2 = pg._base(rig, lado)[1]
            print("REF %s: giro da mão %.1f° | nós × EIXO antes %.1f° depois %.1f° | vão−punho no referencial da mão "
                  "(%.3f %.3f %.3f)" % (lado, math.degrees(giro[lado]), math.degrees(nos.angle(quer)),
                                        math.degrees(min(nos2.angle(EIXO), nos2.angle(-EIXO))), *off_local[lado]), flush=True)

    def maos_no_angulo(th):
        """Vão da mão (eixo do halter), direção dos dedos e da palma de cada lado com o braço a `th` graus."""
        out = {}
        for lado, (braco, ante, palma) in bracos(th).items():
            E, W = juntas(th)[lado]
            dq = Matrix.Rotation(giro[lado], 3, palma) @ ante
            lat = dq.cross(palma)
            o = off_local[lado]
            out[lado] = (W + dq * o[0] + palma * o[1] + lat * o[2], dq, palma, E, W)
        return out

    def bisseca(f, a, b, n=40):
        fa = f(a)
        for _ in range(n):
            m = (a + b) / 2
            fm = f(m)
            if (fm > 0) == (fa > 0):
                a, fa = m, fm
            else:
                b = m
        return (a + b) / 2

    # ── em cima: halteres quase juntos, sem encostar (folga VAO_CIMA entre as anilhas de dentro) ─────────────
    def folga_cima(th):
        g = maos_no_angulo(th)
        return (g["Left"][0].x - g["Right"][0].x) - 2 * RAIO_ANILHA - VAO_CIMA
    # o BETA: em cima o meio dos halteres na vertical da pele-alvo. O braço, a mão e o halter giram juntos com o plano do arco, então
    # o giro da mão e o vão − punho (no referencial da mão) não dependem do BETA: a referência sai com o eixo horizontal, a busca
    # do BETA é só conta, e a referência é refeita uma vez no eixo final (confere)
    def meio_cima(beta):
        nonlocal EIXO, CIMA
        EIXO, CIMA = com_beta(beta)
        th = bisseca(folga_cima, 45.0, 130.0)
        g = maos_no_angulo(th)
        return (g["Left"][0] + g["Right"][0]) / 2, th

    referencia()
    lo, hi = 0.0, 25.0
    for _ in range(30):
        m = (lo + hi) / 2
        if meio_cima(m)[0].y > alvo_peito.y:
            lo = m                                   # o meio dos halteres ainda está acima (pra cabeça) da pele-alvo
        else:
            hi = m
    BETA = (lo + hi) / 2
    meio_cima(BETA)
    referencia()
    meio0, th0 = meio_cima(BETA)
    # ── embaixo: braço (ombro → cotovelo) a BRACO_BAIXO° da horizontal, na linha dos ombros ─────────────────────
    th1 = BRACO_BAIXO
    g0, g1 = maos_no_angulo(th0), maos_no_angulo(th1)
    # pele do tronco logo embaixo dos halteres em cima (onde eles "se encontram"): a mais alta perto da vertical do meio deles
    P = dt.malha(bon, dt.TRONCO + ("Neck",))
    perto = P[(np.abs(P[:, 0] - meio0.x) < 0.02) & (np.abs(P[:, 1] - meio0.y) < 0.02)]
    pele0 = perto[perto[:, 2].argmax()] if len(perto) else (float("nan"),) * 3
    clav = (p3.cabeca(rig, "LeftShoulder") + p3.cabeca(rig, "RightShoulder")) / 2       # base das clavículas (no tórax)
    print("EIXO do arco inclinado %.1f° do horizontal (a ponta da cabeça sobe): o plano do arco fica %.1f° fora da vertical | "
          "pele-alvo (%.3f %.3f %.3f)" % (BETA, BETA, *alvo_peito), flush=True)
    print("CRUCIFIXO braço de %.1f° (em cima) a %.1f° (embaixo) da horizontal | cotovelo %d° | em cima E (%.3f %.3f %.3f)"
          " D (%.3f %.3f %.3f) | embaixo E (%.3f %.3f %.3f) | peito na linha dos halteres embaixo z %.3f (eixo do halter %.0f mm "
          "acima dele e %.0f mm acima do ombro)"
          % (th0, th1, COTOVELO, *g0["Left"][0], *g0["Right"][0], *g1["Left"][0], dt.peito(bon, g1["Left"][0].y),
             (g1["Left"][0].z - dt.peito(bon, g1["Left"][0].y)) * 1000, (g1["Left"][0].z - S["Left"].z) * 1000), flush=True)
    print("EM CIMA o meio dos halteres fica na vertical da pele em (%.3f %.3f %.3f) — %.0f mm abaixo (pro quadril, ao longo do "
          "tronco) da base das clavículas e %.0f mm abaixo das articulações dos ombros; meio dos halteres %.0f mm acima dessa pele"
          % (*pele0, (Vector(pele0) - clav).dot(-cima_t) * 1000, (Vector(pele0) - Sm).dot(-cima_t) * 1000,
             (meio0.z - pele0[2]) * 1000), flush=True)

    def pose(t):
        """t=0 braços quase estendidos em cima do peito, t=1 braços abertos, halteres do lado dos ombros na altura do peito."""
        gs = maos_no_angulo(p3.lerp(th0, th1, t))
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

    pose.dedos = {}
    pose.desvio = {}

    pose(0.5)                                    # polo certo do cotovelo no meio do arco
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
            outro = "Right" if lado == "Left" else "Left"
            mao = co[np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]]
            out["mão %s × anilhas do halter dela" % lado[0]] = _distancia(mao, anilhas[lado])
            out["mão %s × halter da outra mão" % lado[0]] = _distancia(mao, hb[outro])
        pts = {l: np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in ck._malhas(halteres[l])]) for l, _ in LADOS}
        out["halter × halter"] = _distancia(pts["Left"], hb["Right"])
        bb = _malhas_bvh(banco)
        for lado, _ in LADOS:
            out["halter %s × banco" % lado[0]] = _distancia(pts[lado], bb)
            out["halter %s × cabelo" % lado[0]] = _distancia(pts[lado], bvh_cabelo, sinal=False)
        eixos = [(halteres[l].matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized() for l, _ in LADOS]
        out["ângulo entre os halteres (°)"] = (math.degrees(min(eixos[0].angle(eixos[1]), eixos[0].angle(-eixos[1]))), "")
        out["halter × eixo cabeça ↔ pés (°)"] = (max(math.degrees(min(e.angle(EIXO), e.angle(-EIXO))) for e in eixos), "")
        return out

    def info():
        j = ck.posicoes(rig)
        med = ck.medir_juntas(rig)
        pol = {l: pose.dedos.get(l, {}).get("Thumb") for l, _ in LADOS}
        volta = {l: isinstance(p, tuple) and len(p) > 10 and p[0] == "volta" and p[10] for l, p in pol.items()}
        vao = {l: (p[8] if volta[l] else float("nan")) for l, p in pol.items()}
        incl = ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "ForeArm"]})
        ex = medidas_extras()
        txt = " | ".join("%s %s" % (k, ("%.1f" % v[0]) if "°" in k else "%.1f mm%s" % (v[0] * 1000, " (%s)" % v[1] if v[1] else ""))
                         for k, v in ex.items())
        return ("cotovelo E %.0f° D %.0f° | braço: elevação %s°, plano %s°, abaixo da horizontal %s° | palma dentro %s°, pra cima %s° | "
                "punho flexão %s° desvio %s° | halter E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) | %s | polegar em volta E %s D %s, × falange "
                "média E %.1f D %.1f mm | cotovelo fora do calculado E %.1f D %.1f mm | %s"
                % (med["cotoveloE"], med["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_elevacao(j)),
                   "/".join("%.0f" % v for v in tc.braco_plano(j)), "/".join("%.0f" % v for v in incl),
                   "/".join("%.0f" % v for v in tc.palma_dentro(j)), "/".join("%.0f" % v for v in tc.palma_cima(j)),
                   "/".join("%.0f" % v for v in tc.punho_flexao(j)), "/".join("%.0f" % v for v in tc.punho_desvio(j)),
                   *halteres["Left"].location, *halteres["Right"].location, txt,
                   "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO", vao["Left"], vao["Right"],
                   pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), maos.info()))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.2, 0.9),
                camera_video=((2.4, -2.9, 1.7), (0, 0.2, 0.9), 50), info=info, apoios=[banco], afunda_apoio_mm=20)
