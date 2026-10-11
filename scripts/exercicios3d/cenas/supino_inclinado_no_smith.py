# Supino Inclinado no Smith — cena da fábrica 3D (lote 11, 11/10/2026; 0 usos nos treinos prontos do app, 6 vezes como troca
# equivalente). Máquina: o Smith do Agachamento no Smith (equip3d.smith, lote 4: a barra corre presa em 2 trilhos verticais e só sobe
# e desce) montado em volta do banco inclinado do Supino Inclinado com Barra (equip3d.banco_inclinado + deitado3d.inclinar), com a
# trava logo abaixo do carrinho embaixo (equip3d.smith(trava=...), parâmetro do lote 11 com padrão = o de sempre).
# As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   ExRx, Smith Incline Bench Press: "Lie supine on incline bench with upper chest under bar. Grasp bar with wide oblique overhand grip.
#   Disengage bar by rotating bar back." / "Lower weight to upper chest. Press bar until arms are extended."; Bodybuilding.com (o
#   fonte_en), Smith Machine Incline Bench Press: "make sure your upper chest is aligned with the barbell" / "come down slowly until you
#   feel the bar on your upper chest"; Trebs, Brandenburg e Pitney 2010 (o supino inclinado NA MÁQUINA SMITH): "With respect to the
#   clavicular head, a bench angle of 44° seemed ideal" e as travas "set so the bar was positioned as close to the chest as possible
#   without contacting the chest"; ExRx, Bench Press Analyses: "a 45º to 70º angle between the shoulder and torso" e "Keep the scapula
#   back and down."
# t = 0 em cima: braços quase esticados (cotovelo ~10°, sem travar), a barra em cima do alto do peito — no Smith a barra só anda na
#   vertical: em cima ela fica em cima do mesmo ponto do peito em que encosta, e não em cima dos ombros como no supino inclinado com a
#   barra livre · t = 1 embaixo: a barra a FOLGA_PEITO da pele do alto do peito (encosta de leve), logo abaixo das clavículas, com os
#   cotovelos a 45–70° do tronco e os antebraços o mais em pé que o braço deixa.
# Como o rig faz: as escápulas vão pra trás e pra baixo em pé, antes de sentar (como no Supino Reto no Smith), e o corpo senta no banco
# a ANGULO° (dt.inclinar: glúteo no assento, costas e cabeça no encosto, pés chapados no chão). A LINHA da barra (o y dos trilhos) sai
# do alto do peito: o ponto do Supino Inclinado com Barra (ABAIXO m abaixo das articulações dos ombros, ao longo do tronco), com a barra
# a FOLGA_PEITO da pele; embaixo a barra desce na linha até essa folga e, em cima, sobe na MESMA linha até o cotovelo ficar dobrado
# COTOVELO_CIMA°. Quadro a quadro o Smith sobe ou desce a barra (sm.mover, só na vertical) e as mãos vão junto pelo IK analítico do
# braço do Supino Reto no Smith (não depende do quadro anterior), com o cotovelo no ponto do círculo dele que deixa o antebraço o mais
# em pé possível sem sair da faixa ABRE de abertura (dt.polo_cotovelo_faixa, a do Supino Inclinado com Barra: no inclinado o ponto mais
# baixo do círculo cola o cotovelo no tronco embaixo); a mão, com a palma pros pés (pegada pronada) e um pouco virada pra fora, segue o
# antebraço com o punho firme e rola em volta da barra (que não gira): a pegada é a mesma em todo quadro. Os 4 dedos fecham até a pele
# encostar na barra e o polegar novo dá a volta nela numa postura fixa tirada da própria busca (BUSCAR_POLEGAR), uma vez só. Tronco,
# escápulas, cabeça, quadril, pernas e pés não mexem. O info() de cada quadro traz o que a checagem não mede: barra × rosto, pescoço,
# peito e cabelo, mão × carrinho, mão dentro da barra fora da pegada, o polegar e as peças do Smith × mãos, corpo e banco.
import math
import time
import numpy as np
from mathutils import Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from maos3d import Maos
from cena import Cena
from supino_reto_no_smith import _segurar, _polegar_nos_angulos     # IK analítico + mão no vão da barra, polegar fixo
from desenvolvimento_no_smith import _so_ossos                     # esconde o corpo enquanto só os ossos mexem (IK rápido)

LADOS = dt.LADOS          # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
RAIO = 0.015              # barra do Smith: 30 mm na pegada (a do e3.smith; Titan Smith Machine: "Barbell Shaft Diameter: 30mm")
ANGULO = 44               # encosto, graus da horizontal: Trebs 2010, o supino inclinado NO SMITH ("a bench angle of 44° seemed ideal")
ASSENTO = 0.44            # topo do assento (m), o dos outros bancos da fábrica
ALTO = -0.010             # onde a barra encosta embaixo: o ponto da pele que ela toca fica ALTO m acima (+, pra cabeça) das
                          # articulações dos ombros, ao longo do tronco — 1 cm abaixo delas, ~4 cm abaixo da incisura jugular (o
                          # alto do peito, logo abaixo das clavículas). Sondas de 11/10/2026 (PEGADA 1,74): subir o contato leva a
                          # barra pra perto do ombro sem subir (o perfil do peito cai pra cima) e o cotovelo dobra mais — a −1, +6,
                          # +22 e +29 mm dos ombros, 142→146° com o antebraço entrando 6→11 mm no braço; a −8 mm, com a PEGADA
                          # abaixo, 136/137° sem encostar
FOLGA_PEITO = 0.007      # barra → pele do peito embaixo: encosta de leve (o Supino Inclinado com Barra e o Supino Reto no Smith)
ABRE = (47, 70)           # faixa do cotovelo × tronco que o cotovelo segue (braco_abertura, graus): ExRx, Bench Press Analyses, 45–70°;
                          # embaixo ele fica no limite de baixo da faixa (o braço curto do boneco não deixa o antebraço em pé com o
                          # cotovelo aberto: com 45 ficava 45,0/45,0, na beirada da regra) — 47 deixa margem pra regra de 45–70
PEGADA = 1.86             # distância entre os vãos das mãos ÷ entre as articulações dos ombros (pegada_largura medida 1,83, a do
                          # Supino Reto no Smith): ExRx, Bench Press Analyses, "1.5 to 1.7 times the biacromial width" (a biacromial
                          # é mais larga que a distância entre as articulações). Com 1,74 (a do Supino Inclinado com Barra) o
                          # cotovelo dobrava 140°+ embaixo e o antebraço entrava 3–4 mm no braço (sondas de 11/10/2026)
COTOVELO_CIMA = 10        # flexão do cotovelo em cima: quase esticado, sem travar ("Press bar until arms are extended", ExRx)
PUNHO = 14                # extensão do punho (graus): a mão inclinada pra cabeça em relação ao antebraço, firme o movimento todo (a do
                          # Supino Reto no Smith e do Supino Inclinado com Barra; NSCA: "Keep wrists rigid and directly above elbows")
VOLTAS_PUNHO = 4          # voltas mão ↔ antebraço até o ângulo do antebraço parar de mudar
VOLTAS_MAO = 40           # voltas do _segurar (IK analítico + correção amortecida do vão da mão) em cada volta do punho
PUNHO_FORA = 6.0          # a mão girada um pouco pra fora (graus, no plano da palma) — ExRx, Bench Press Analyses: "Position the wrists
                          # directly under the bar by turning the wrists out slightly so bar is placed on lower outer portion of palm"
                          # (o do Supino Reto no Smith)
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula, em pé antes de sentar
                          # (os do Supino Reto no Smith; ExRx, Bench Press Analyses: "Keep the scapula back and down")
TRAVA = 0.010             # fundo do carrinho → topo da trava com a barra em z_min (m): embaixo (2 mm acima de z_min) a tampa de
                          # borracha do carrinho (8 mm) fica 4 mm acima da trava e a barra apoiada nela ficaria 3 mm acima da pele do
                          # peito — "as close to the chest as possible without contacting the chest" (Trebs 2010)
POLEGAR_FIXO = {"Left": (-12.0, 24.0, 1.0, 28.0, -7.3, 40.0), "Right": (-15.0, 26.0, 4.0, 32.0, -5.3, 46.0)}
                          # polegar NOVO dando a volta na barra, FIXO em todos os quadros: postura anatômica de cada mão (CMC flexão,
                          # abdução, rotação, MCP flexão, abdução, IP flexão, graus — polegar3d.CAMPOS). A busca refeita aqui (11/10/2026,
                          # BUSCAR_POLEGAR = True, exp/busca_polegar_1.log do rascunho) achou em cima e embaixo as mesmas 2 posturas do
                          # Supino Reto no Smith (a mesma barra de 30 mm e a mesma pegada) e, medidas junto com as 2 do Desenvolvimento no
                          # Smith em cima, no meio e embaixo na pele do Blender, ficam as mesmas: E polegar → barra −1,1 mm, pele da base
                          # 1,94×; D −0,3 mm, 2,03×; 0 triângulo do avesso nos 3 quadros
BUSCAR_POLEGAR = False    # True = refaz a busca (≈3–5 min a mais na montagem) e imprime a medida de cada postura
EIXO = Vector((1, 0, 0))  # a barra do Smith fica ao longo do X
PERTO_DA_BARRA = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm")
                          # pele que a barra não pode tocar além de "de leve" (peito, pescoço, rosto, ombros, braços)


def _malha(bon, niveis=1):
    return ck._avaliar(bon.corpo, niveis)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _orientacao(graus, s):
    """Dedos e palma da mão do lado s (+1 esquerdo, −1 direito) com os dedos `graus` pra cabeça da vertical (a mão rola em volta da
    barra, que fica ao longo do X) e PUNHO_FORA° pra fora, pro lado do dedo mínimo (em volta da normal da palma): palma pros pés
    (pegada pronada de quem está deitado). A conta do Supino Reto no Smith; a pegada na barra é a mesma em todo `graus`."""
    a, b = math.radians(graus), math.radians(PUNHO_FORA)
    dq = Vector((0, math.sin(a), math.cos(a))) * math.cos(b) + Vector((s * math.sin(b), 0, 0))
    return dq, Vector((0, -math.cos(a), math.sin(a)))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)     # mão de referência da barra de 30 mm (Shimawaki 2019, interpolada) — antes do Maos
    rig = bon.rig
    PB = rig.pose.bones
    T0 = time.time()

    def cab(n):
        return p3.cabeca(rig, n)

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (ExRx, Bench Press Analyses: "Keep the scapula back and down"):
    # cada clavícula gira RETRAI° em volta do eixo do tronco e DESCE° em volta do eixo da frente, em pé, antes de sentar ────────────
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    ombro_antes = {L: cab(L + "Arm") for L, _ in LADOS}
    for L, s in LADOS:
        if RETRAI:
            p3.girar_osso(rig, L + "Shoulder", p3.rot_eixo(s * RETRAI, cima0))
        if DESCE:
            p3.girar_osso(rig, L + "Shoulder", p3.rot_eixo(-s * DESCE, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro E andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (cab("LeftArm") - ombro_antes["Left"]).dot(-frente0) * 1000,
        -(cab("LeftArm") - ombro_antes["Left"]).dot(cima0) * 1000), flush=True)

    # ── 2) sentado no banco inclinado: glúteo no assento, costas e cabeça no encosto, pés chapados no chão ────────────────────────
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    maos = Maos(bon, RAIO, polegar_modo="volta")
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço
    cima_t, _ = dt.eixos_tronco(rig)                        # quadril → pescoço (o tronco, a ANGULO° do chão)
    frente_t = Vector((0, -cima_t.z, cima_t.y))             # pra fora do peito, ⟂ ao tronco
    Sm = (S["Left"] + S["Right"]) / 2
    GRIP = PEGADA * (S["Left"] - S["Right"]).length / 2     # do meio da barra até o vão de cada mão
    print("GEOMETRIA | junta do banco y %.3f | ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | braço %.3f antebraço %.3f | tronco a "
          "%.1f° do chão | meia pegada %.3f" % (junta_y, *S["Left"], *S["Right"], Lb, La,
                                                math.degrees(math.asin(max(-1.0, min(1.0, cima_t.z)))), GRIP), flush=True)

    # ── 3) a mão na barra: o vão da mão − punho no referencial da mão (igual em toda orientação) ─────────────────────────────────
    OFF = {}
    for L, s in LADOS:
        dq0, pq0 = _orientacao(PUNHO, s)
        g = S[L] + Vector((s * 0.15, -0.05, 0.50))
        _segurar(maos, L, g, dq0, pq0, polo=S[L] + Vector((s * 0.5, -0.3, -0.3)))
        o = g - cab(L + "Hand")
        OFF[L] = (o.dot(dq0), o.dot(pq0), o.dot(dq0.cross(pq0)))
    print("vão da mão − punho E %.1f/%.1f/%.1f mm D %.1f/%.1f/%.1f mm (ao longo dos dedos, pra palma, de lado)" % (
        *(x * 1000 for x in OFF["Left"]), *(x * 1000 for x in OFF["Right"])), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    # ── 4) pele que a barra não pode encostar (fora as mãos e os antebraços) e o cabelo; partes do rosto pela altura ──────────────
    co, _, (nomes, dono) = _malha(bon)
    cabeca = co[_grupo(nomes, dono, ("Head",))]
    meio_cab = cabeca[np.abs(cabeca[:, 0]) < 0.03]
    nariz = Vector(meio_cab[meio_cab[:, 1].argmin()])                       # ponta do nariz (o ponto mais pros pés do rosto)
    frente_rosto = cabeca[cabeca[:, 1] < cabeca[:, 1].min() + 0.03]
    queixo = Vector(frente_rosto[frente_rosto[:, 2].argmin()])              # ponto mais baixo da frente do rosto
    cab_co, _ = ck._avaliar_simples(bon.cabelo)
    print("ROSTO | ponta do nariz (%.4f %.4f %.4f) | queixo (%.4f %.4f %.4f)" % (*nariz, *queixo), flush=True)

    def folga_barra(y, z, meia=None, malha=None):
        """Pele (fora as mãos e os antebraços) e cabelo → superfície da barra da pegada com o eixo em (y, z) (m, − = entrou): o mais
        perto e de que parte. A checagem mede a barra junto com o resto do Smith; aqui é só a barra × peito, pescoço, rosto e braços."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        m = _grupo(nomes_, dono_, PERTO_DA_BARRA)
        P = co_[m]
        lim = meia if meia is not None else 0.75 - 0.0375
        d = np.hypot(P[:, 1] - y, P[:, 2] - z) - RAIO
        d[np.abs(P[:, 0]) > lim] = 1e9
        k = int(np.argmin(d))
        dc = np.hypot(cab_co[:, 1] - y, cab_co[:, 2] - z) - RAIO
        dc[np.abs(cab_co[:, 0]) > lim] = 1e9
        if dc.min() < d[k]:
            return float(dc.min()), "cabelo", Vector(cab_co[int(np.argmin(dc))])
        return float(d[k]), nomes_[dono_[np.where(m)[0][k]]], Vector(P[k])

    def polo_cotovelo(L, s, W):
        return dt.polo_cotovelo_faixa(rig, S[L], W, Lb, La, s, ABRE)

    def maos_em(z):
        """As 2 mãos na barra com o eixo em (0, Y_BARRA, z), sem fechar os dedos: o punho firme em PUNHO° (a mão acompanha o antebraço
        no plano do corpo, girando em volta da barra, um pouco virada pra fora) e o cotovelo no ponto do círculo dele que deixa o
        antebraço o mais em pé possível dentro da faixa ABRE (polo_cotovelo), pelo IK analítico (_segurar: não depende do quadro
        anterior). Devolve o centro da barra."""
        centro = Vector((0.0, Y_BARRA, z))
        with _so_ossos(bon):
            for L, s in LADOS:
                g = centro + Vector((s * GRIP, 0, 0))
                fi = 0.0                                     # antebraço: graus pra cabeça da vertical (no plano YZ)
                for _ in range(VOLTAS_PUNHO):
                    dq, pq = _orientacao(fi + PUNHO, s)
                    W = g - vao_menos_punho(L, dq, pq)
                    _segurar(maos, L, g, dq, pq, polo=polo_cotovelo(L, s, W), voltas=VOLTAS_MAO)
                    ax = cab(L + "Hand") - cab(L + "ForeArm")
                    fi = math.degrees(math.atan2(ax.y, ax.z))
                maos_em.fi[L] = fi
        return centro

    maos_em.fi = {}

    def medidas():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        return ("cotovelo %.0f/%.0f° | antebraço × vertical %s° (%s° no plano YZ, + = pra cabeça) | punho flexão %s° desvio %s° | braço: "
                "abertura %s°, elevação %s°, frente %s°, plano %s° | palma frente %s° dentro %s° | pegada %.2f | escápula %s mm | vão da "
                "mão %.1f/%.1f mm" % (
                    juntas["cotoveloE"], juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)),
                    "/".join("%.0f" % maos_em.fi.get(L, 0) for L, _ in LADOS),
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.punho_desvio(jj)),
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    tc.pegada_largura(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)), maos.erro["Left"] * 1000,
                    maos.erro["Right"] * 1000))

    # ── 5) embaixo: a LINHA da barra sai do alto do peito, logo abaixo das clavículas — a barra descendo na vertical encosta (a
    # FOLGA_PEITO da pele) no ponto da pele que fica ALTO m acima das articulações dos ombros, ao longo do tronco; depois ela desce na
    # linha até essa folga medida JÁ com os braços embaixo (a pele do peito acompanha um pouco o braço) ─────────────────────────────
    peito_pele = dt.malha(bon, dt.TRONCO + ("Neck",))
    peito_pele = peito_pele[np.abs(peito_pele[:, 0]) < 0.16]           # entre as mãos, fora os braços

    def toque(y):
        """Barra descendo na vertical na linha y: a altura do eixo quando ela fica a FOLGA_PEITO da pele do peito e o ponto tocado."""
        d2 = (RAIO + FOLGA_PEITO) ** 2 - (peito_pele[:, 1] - y) ** 2
        m = d2 > 0
        zz = peito_pele[m, 2] + np.sqrt(d2[m])
        k = int(np.argmax(zz))
        return float(zz[k]), Vector(peito_pele[m][k])

    lo, hi = Sm.y - 0.30, Sm.y + 0.02                     # a linha: o ponto tocado sobe no tronco quando ela vai pra cabeça
    for _ in range(40):
        y_ = (lo + hi) / 2
        if (toque(y_)[1] - Sm).dot(cima_t) < ALTO:
            lo = y_
        else:
            hi = y_
    Y_BARRA = (lo + hi) / 2
    z1 = toque(Y_BARRA)[0]
    for volta in range(8):
        maos_em(z1)
        folga, parte, ponto = folga_barra(Y_BARRA, z1)
        print("   embaixo, volta %d: barra em y %.4f z %.4f → pele %.1f mm (%s, em (%.3f %.3f %.3f)) | %s" % (
            volta, Y_BARRA, z1, folga * 1000, parte, *ponto, medidas()), flush=True)
        if abs(folga - FOLGA_PEITO) < 0.0003:
            break
        z1 += FOLGA_PEITO - folga
    # onde a barra encosta: ao longo do tronco a partir das articulações dos ombros e das bases das clavículas (cabeça dos ossos
    # Shoulder), e o perfil da pele na linha do meio
    clav = (cab("LeftShoulder") + cab("RightShoulder")) / 2
    co, _, (nomes, dono) = _malha(bon)
    M = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"))]
    M = M[np.abs(M[:, 0]) < 0.012]
    perfil = []
    for du in range(10, -22, -2):           # pele na linha do meio (o esterno), de 10 cm acima a 20 cm abaixo dos ombros, ao longo do tronco
        u_ = (M - np.array(Sm)) @ np.array(cima_t)
        fx = M[np.abs(u_ - du / 100) < 0.006]
        perfil.append("%+d:%s" % (du, "%.0f" % (float(((fx - np.array(Sm)) @ np.array(frente_t)).max()) * 1000) if len(fx) else "-"))
    print("EMBAIXO | barra y %.4f z %.4f | encosta (%s) em (%.3f %.3f %.3f): %+.0f mm dos ombros e %+.0f mm das bases das clavículas "
          "ao longo do tronco | barra %.0f mm pros pés dos ombros (y) | %s" % (
              Y_BARRA, z1, parte, *ponto, (ponto - Sm).dot(cima_t) * 1000, (ponto - clav).dot(cima_t) * 1000, (Sm.y - Y_BARRA) * 1000,
              medidas()), flush=True)
    print("PERFIL do peito na linha do meio (cm ao longo do tronco a partir dos ombros: pele na frente do plano dos ombros, mm): %s"
          % " ".join(perfil), flush=True)
    # incisura jugular (o "V" do esterno entre as clavículas): na linha do meio, subindo do peito, onde a pele chega perto da do pescoço
    # — 15% do caminho entre o pescoço (a pele mais baixa de 0 a +12 cm) e o peito (a mais alta de −12 a 0 cm), a cada 5 mm
    us = np.arange(-0.12, 0.1201, 0.005)
    uu = (M - np.array(Sm)) @ np.array(cima_t)
    ff = (M - np.array(Sm)) @ np.array(frente_t)
    prof = np.array([ff[np.abs(uu - u_) < 0.004].max() if (np.abs(uu - u_) < 0.004).any() else np.nan for u_ in us])
    pesc = np.nanmin(prof[us >= 0])
    lim_inc = pesc + 0.15 * (np.nanmax(prof[us <= 0]) - pesc)
    u_inc = next(float(u_) for u_, p_ in zip(us, prof) if u_ >= 0 and not p_ >= lim_inc)
    print("INCISURA JUGULAR (a pele do peito sai da do pescoço) a %+.0f mm dos ombros ao longo do tronco: a barra encosta %.0f mm abaixo "
          "dela" % (u_inc * 1000, (u_inc - (ponto - Sm).dot(cima_t)) * 1000), flush=True)

    # ── 6) em cima: a barra sobe NA MESMA LINHA (o Smith só anda na vertical) até o cotovelo ficar dobrado COTOVELO_CIMA° ──────────
    def cotovelo_medio():
        jj = ck.medir_juntas(rig)
        return (jj["cotoveloE"] + jj["cotoveloD"]) / 2

    lo, hi = z1 + 0.15, z1 + 0.65
    for _ in range(16):
        meio = (lo + hi) / 2
        maos_em(meio)
        if cotovelo_medio() > COTOVELO_CIMA and max(maos.erro.values()) < 0.002:
            lo = meio                       # ainda dobrado: sobe mais
        else:
            hi = meio
    z0 = lo
    maos_em(z0)
    jj = ck.posicoes(rig)
    mao_v = [math.degrees((Vector((s * GRIP, Y_BARRA, z0)) - S[L]).angle(Vector((0, 0, 1)))) for L, s in LADOS]
    print("EM CIMA | barra z %.4f | %s | ombro → vão da mão %.1f/%.1f° da vertical (%.0f s)" % (z0, medidas(), *mao_v,
                                                                                             time.time() - T0), flush=True)

    # ── folga barra × pele parada (peito, pescoço, rosto, cabelo) no caminho todo (400 pontos): o tronco e a cabeça não mexem ──────
    co, _, (nomes, dono) = _malha(bon)
    partes = {"queixo e boca": cabeca[cabeca[:, 2] < nariz.z - 0.015], "nariz": cabeca[np.abs(cabeca[:, 2] - nariz.z) <= 0.015],
              "testa e alto da cabeça": cabeca[cabeca[:, 2] > nariz.z + 0.015],
              "pescoço": co[_grupo(nomes, dono, ("Neck",))],
              "peito": co[_grupo(nomes, dono, ("Spine2", "Spine1", "LeftShoulder", "RightShoulder"))], "cabelo": cab_co}
    zs = np.linspace(z1, z0, 400)
    txt = []
    for nome, P in partes.items():
        P = P[np.abs(P[:, 0]) < 0.22]
        d = np.hypot(P[None, :, 1] - Y_BARRA, P[None, :, 2] - zs[:, None]) - RAIO
        k = int(d.min(axis=1).argmin())
        txt.append("%s %.1f mm (barra em z %.3f)" % (nome, d.min() * 1000, zs[k]))
    print("FOLGAS no caminho (barra → pele, menor de cada parte, |x| < 22 cm): %s" % " | ".join(txt), flush=True)

    # ── 7) o Smith em volta do corpo: os trilhos na linha da barra, o curso de embaixo (peito) até em cima (braços esticados) ──────
    sm = e3.smith("smith", y=Y_BARRA, z=z0, curso=(z1 - 0.002, z0 + 0.002), trava=TRAVA)
    z_trava_topo = z1 - 0.002 - 0.08 - TRAVA
    print("SMITH | linha da barra y %.4f (%.0f mm pros pés da linha dos ombros) | barra embaixo z %.3f, em cima z %.3f (curso %.0f mm) | "
          "topo das travas z %.3f: com a barra embaixo, tampa do carrinho %.1f mm acima da trava; a barra apoiada na trava ficaria a "
          "%.1f mm da pele | meia pegada %.3f m (mão até o carrinho %.0f mm) | junta do banco y %.3f" % (
              Y_BARRA, (Sm.y - Y_BARRA) * 1000, z1, z0, (z0 - z1) * 1000, z_trava_topo,
              (z1 - 0.08 - 0.008 - z_trava_topo) * 1000, (FOLGA_PEITO - (z1 - 0.08 - 0.008 - z_trava_topo)) * 1000, GRIP,
              (sm.meia - GRIP) * 1000, junta_y), flush=True)

    def bracos(t):
        """Barra do Smith na altura do quadro t (só na vertical) e as 2 mãos nela (sem fechar os dedos)."""
        z = p3.lerp(z0, z1, t)
        sm.mover(z)
        return maos_em(z)

    def polegar_na_barra(lado, z, malha=None):
        """Pele do polegar → superfície da barra (m), a mais funda (− = entrou na barra)."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        P = co_[_grupo(nomes_, dono_, tuple(lado + "HandThumb%d" % i for i in (1, 2, 3)))]
        return float((np.hypot(P[:, 1] - Y_BARRA, P[:, 2] - z) - RAIO).min())

    # ── 8) polegar NOVO dando a volta na barra, FIXO em todos os quadros: a mão só gira em volta da barra (junto com o antebraço),
    # então a pegada é a mesma em todo quadro. A postura sai da própria busca do pg.polegar_em_volta, feita em cima e embaixo, e
    # cada uma é medida em cima, no meio e embaixo na pele de verdade (o jeito do Supino Reto e do Desenvolvimento no Smith) ──────
    POLEGAR = dict(POLEGAR_FIXO)
    if BUSCAR_POLEGAR:
        AMOSTRAS = (0.0, 0.5, 1.0)
        cands = {L: [] for L, _ in LADOS}
        for tt in (0.0, 1.0):
            c_ = bracos(tt)
            for L, _ in LADOS:
                r = pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="volta")["Thumb"]
                if isinstance(r, tuple) and r and r[0] == "volta" and r[-1]:
                    cands[L].append((tuple(float(x) for x in r[1:7]), tt, r[7], r[8], r[9]))
                print("   busca do polegar %s em t = %.1f: %s" % (L, tt, r), flush=True)
        todas = []
        for L, _ in LADOS:
            for cand in cands[L]:
                if all(max(abs(a - b) for a, b in zip(cand[0], c2[0])) > 0.5 for c2 in todas):
                    todas.append(cand)
        from desenvolvimento_no_smith import POLEGAR_FIXO as POL_DEV
        for q in list(POLEGAR_FIXO.values()) + list(POL_DEV.values()):   # as posturas do Supino Reto e do Desenvolvimento no Smith
            if all(max(abs(a - b) for a, b in zip(q, c2[0])) > 0.5 for c2 in todas):
                todas.append((tuple(q), -1.0, 0.0, 0.0, 0.0))
        medidas_p = {L: [[None] * len(AMOSTRAS) for _ in todas] for L, _ in LADOS}
        for k, tt in enumerate(AMOSTRAS):
            c_ = bracos(tt)
            for L, _ in LADOS:
                pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="busca")
                for i, cand in enumerate(todas):
                    _polegar_nos_angulos(bon, L, cand[0])
                    pp = pg.pele_do_polegar(bon, L)
                    medidas_p[L][i][k] = (polegar_na_barra(L, c_.z), pp["alonga_max"], pp["viradas"])
        for L, _ in LADOS:
            def nota(i):
                m = medidas_p[L][i]               # entra na barra além do aperto, triângulos do avesso, longe da barra (> 0,5 mm),
                return (any(x[0] < -pg.APERTO for x in m), max(x[2] for x in m), max(x[0] for x in m) > 0.0005,   # pele esticada
                        round(max(x[1] for x in m), 2), -min(x[0] for x in m))
            i = min(range(len(todas)), key=nota)
            POLEGAR[L] = todas[i][0]
            for j, cand in enumerate(todas):
                print("   polegar %s, postura %d %s (achada em t = %.1f): em cima/meio/embaixo → barra %s mm | pele da base %s× | "
                      "triângulos do avesso %s" % (L, j, cand[0], cand[1], "/".join("%+.1f" % (x[0] * 1000) for x in medidas_p[L][j]),
                                                   "/".join("%.2f" % x[1] for x in medidas_p[L][j]),
                                                   "/".join("%d" % x[2] for x in medidas_p[L][j])), flush=True)
            print("POLEGAR %s | %d postura(s) | fica a %d: %s" % (L, len(todas), i, POLEGAR[L]), flush=True)
    print("POLEGAR | novo, fixo: (CMC flex, abd, rot, MCP flex, abd, IP flex) E %s D %s" % (POLEGAR["Left"], POLEGAR["Right"]),
          flush=True)

    # os 4 dedos fecham até a pele encostar na barra e o polegar novo fica na postura escolhida — UMA vez, em cima: a mão só gira em
    # volta da barra (com o vão no eixo dela), então a pegada é a mesma em todo quadro
    DEDOS = {}
    c_ = bracos(0.0)
    dedos_info = {}
    for L, _ in LADOS:
        dedos_info[L] = pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="busca")
        _polegar_nos_angulos(bon, L, POLEGAR[L])
        dedos_info[L]["Thumb"] = ("volta fixo",) + tuple(POLEGAR[L])
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, dedos_info[L]), flush=True)

    def pose(t):
        """t=0 braços quase esticados em cima, t=1 barra embaixo, encostando de leve no alto do peito (na mesma linha vertical)."""
        bracos(t)
        for L, _ in LADOS:                  # a mão fechada de sempre (o _segurar põe a mão de referência a cada volta)
            for n, Mb in DEDOS[L].items():
                PB[n].matrix_basis = Mb.copy()
        p3.atualizar()
        pose.t = t

    pose.dedos = dedos_info
    pose.t = 0.0

    # ── folgas que a checagem não mede (ela ignora o que fica DENTRO da mão e não mede peça × peça) ─────────────────────────────
    def maos_na_barra(malha=None):
        """Por mão: (borda de dentro do carrinho − pele da mão, pelo X; pele da mão mais funda dentro da barra, − = entrou; pele da
        mão a mais de 3,5 cm do meio da mão, ao longo da barra, mais perto dela), em m."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        z = sm.barra.matrix_world.to_translation().z
        out = []
        for L, s in LADOS:
            H = co_[np.array([n.startswith(L + "Hand") for n in nomes_] + [False])[dono_]]
            rad = np.hypot(H[:, 1] - Y_BARRA, H[:, 2] - z) - RAIO
            longe = np.abs(H[:, 0] - s * GRIP) > 0.035
            out.append((sm.meia - float((s * H[:, 0]).max()), float(rad.min()), float(rad[longe].min()) if longe.any() else 9.0))
        return out

    def pecas_perto():
        """Mãos e corpo (fora as mãos) × cada peça do Smith fora a barra da pegada (carrinho, tampa, gancho, luva, colar, anilha,
        trilho, trava, pino, coluna, base) e o banco × as mesmas peças: a menor distância de verdade (BVH), em m, e de que peça."""
        from mathutils.bvhtree import BVHTree
        co_, tri_, (nomes_, dono_) = _malha(bon)
        eh_mao = np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes_] + [False])[dono_]
        H, C = co_[eh_mao], co_[~eh_mao]
        B = np.concatenate([ck._avaliar_simples(o)[0] for o in ck._malhas(banco)])
        pecas = [o for raiz in (sm.raizes["estrutura"], sm.raizes["barra"]) for o in ck._malhas(raiz)
                 if o.name != "smith_barra_pegada"]
        melhor = {"mãos": (1e9, ""), "corpo": (1e9, ""), "banco": (1e9, "")}
        for o in pecas:
            eco, etri = ck._avaliar_simples(o)
            bvh = None
            for chave, P in (("mãos", H), ("corpo", C), ("banco", B)):
                Pn = P[((P >= eco.min(axis=0) - 0.05) & (P <= eco.max(axis=0) + 0.05)).all(axis=1)]
                if not len(Pn):             # longe (> 5 cm da caixa da peça): a distância até a caixa basta (é ≤ a de verdade)
                    gap = float(np.linalg.norm(np.maximum(0.0, np.maximum(eco.min(axis=0)[None] - P, P - eco.max(axis=0)[None])),
                                               axis=1).min())
                    if gap < melhor[chave][0]:
                        melhor[chave] = (gap, o.name + " (caixa)")
                    continue
                if bvh is None:
                    bvh = BVHTree.FromPolygons([tuple(p) for p in eco], [tuple(t) for t in etri], all_triangles=True)
                for v in Pn:
                    d = bvh.find_nearest(Vector(v))[3]
                    if d is not None and d < melhor[chave][0]:
                        melhor[chave] = (d, o.name)
        return melhor

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        b = sm.barra.matrix_world.to_translation()
        malha = _malha(bon)                 # a malha do quadro, avaliada uma vez só (o exportador chama o info() todo quadro)
        folga, parte, _ = folga_barra(Y_BARRA, b.z, sm.meia, malha)
        mnb = maos_na_barra(malha)

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            pp = pg.pele_do_polegar(bon, lado)
            return "%s, pele da base %.2f× e %d triângulo(s) do avesso, polegar → barra %+.1f mm" % (
                v[0] if isinstance(v, tuple) and v else v, pp["alonga_max"], pp["viradas"], polegar_na_barra(lado, b.z, malha) * 1000)
        return ("barra z %.3f (y %.4f, saiu da linha %.1f mm) | barra → pele/cabelo %.1f mm (%s) | cotovelo %.0f/%.0f° | braço: abertura "
                "%s°, elevação %s°, frente %s° | antebraço × vertical %s° | punho %.0f/%.0f° (flexão %s, desvio %s) | palma: frente %s°, "
                "dentro %s° | pegada %.2f | escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça %.1f° | mão → carrinho %s mm, mão mais "
                "funda na barra %s mm, fora da pegada %s mm | polegar E %s | D %s | %s" % (
                    b.z, b.y, math.hypot(b.x, b.y - Y_BARRA) * 1000, folga * 1000, parte, juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)),
                    juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)), ck.angulo_chave(rig, {"medida": "tronco"})[0],
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], "/".join("%.0f" % (v[0] * 1000) for v in mnb),
                    "/".join("%+.1f" % (v[1] * 1000) for v in mnb), "/".join("%+.1f" % (v[2] * 1000) for v in mnb), pol("Left"),
                    pol("Right"), maos.info()))

    print("DEDOS fechados (%.0f s)" % (time.time() - T0), flush=True)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
        pp = pecas_perto()
        print("      peças do Smith (fora a barra da pegada): → mãos %.0f mm (%s) | → corpo %.0f mm (%s) | → banco %.0f mm (%s) | "
              "anilha mais baixa z %.3f" % (pp["mãos"][0] * 1000, pp["mãos"][1], pp["corpo"][0] * 1000, pp["corpo"][1],
                                            pp["banco"][0] * 1000, pp["banco"][1],
                                            min(float(ck._avaliar_simples(o)[0][:, 2].min()) for o in ck._malhas(sm.raizes["barra"])
                                                if "anilha" in o.name)), flush=True)
    print("DIAGNÓSTICO pronto (%.0f s)" % (time.time() - T0), flush=True)
    pose(0.0)

    bk = ck.Barra(sm.barra, raio=RAIO, meio_compr=sm.meia)
    # a barra é EQUIPAMENTO (não apoio), como no Supino Reto e no Desenvolvimento no Smith: ela fica nas mãos e só chega perto do
    # peito — a checagem cobra 3 mm de folga dela até o resto do corpo em todo quadro (encostar "de leve" embaixo = os 7 mm do
    # Supino Inclinado com Barra). O banco é o apoio.
    return Cena(pose, sm.equipamentos + [sm.barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, Y_BARRA, 0.95), camera_video=((3.0, -2.6, 1.7), (0, Y_BARRA + 0.1, 0.95), 45), info=info,
                apoios=[banco], afunda_apoio_mm=20)
