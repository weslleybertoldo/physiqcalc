# Supino Reto no Smith — cena da fábrica 3D (lote 9, 10/10/2026). Máquina: o Smith do Agachamento no Smith (equip3d.smith, lote 4:
# a barra corre presa em 2 trilhos verticais e só sobe e desce) montado em volta do banco reto do Supino Reto com Barra (equip3d.banco),
# sem mudar nada em lib/. As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   ExRx, Smith Bench Press: "Lie supine on bench with chest under bar. Grasp bar with wide oblique overhand grip. Disengage bar by
#   rotating bar back." / "Lower weight to chest. Press bar until arms are extended." / "Range of motion will be compromised if grip
#   is too wide."; Physitrack, Smith machine bench press: "Your chest is under the bar." / "Lower the bar under control until your
#   upper arms are horizontal or slightly lower."; Cotterman, Darby e Skelly 2005: "The Smith machine (SM) (vertical motion of bar on
#   fixed path; fixed-form exercise)"; ExRx, Bench Press Analyses: "Lowering the bar between the lower to mid-chest will typically
#   result in a 45º to 70º angle between the shoulder and torso" e "Keep the scapula back and down."
# t = 0 em cima: braços quase esticados (cotovelo ~10°, sem travar), a barra em cima da linha do peito em que ela vai encostar — no
#   Smith a barra só anda na vertical, então em cima ela fica em cima desse ponto do peito, e não em cima dos ombros como no supino
#   com a barra livre (o "J" do ExRx) · t = 1 embaixo: a barra a FOLGA_PEITO da pele do peito (encosta de leve), na linha dos mamilos,
#   os antebraços em pé e os cotovelos a ~60° do tronco (o embaixo do Supino Reto com Barra aprovado).
# Como o rig faz: as escápulas vão pra trás e pra baixo em pé, antes de deitar (como no Supino Reto na Máquina Deitado), e o corpo
# deita de costas no banco (dt.deitar: cabeça, costas e glúteo no estofado, pés chapados no chão). Embaixo, o ponto da barra sai do
# jeito do Supino Reto com Barra (antebraço em pé, cotovelo ABRE° do tronco, a barra FOLGA_PEITO acima da pele mais alta do peito) e
# dá a LINHA da barra (o y dos trilhos do Smith) e a largura da pegada; em cima, a barra sobe NA MESMA LINHA até o cotovelo ficar
# dobrado COTOVELO_CIMA°. Quadro a quadro o Smith sobe ou desce a barra (sm.mover, só na vertical) e as mãos vão junto (IK analítico
# do braço, o da Remada Invertida, com o cotovelo no ponto mais baixo que o braço deixa: o antebraço o mais em pé possível); a mão,
# com a palma pros pés (pegada pronada) e um pouco virada pra fora, segue o antebraço com o punho firme e rola em volta da barra (que
# não gira): a pegada é a mesma em todo quadro. Os 4 dedos fecham até a pele encostar na barra e o polegar novo dá a volta nela, numa
# postura fixa tirada da própria busca (ver o montar()), uma vez só. Tronco, escápulas, cabeça, quadril, pernas e pés não mexem.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from maos3d import Maos
from cena import Cena

LADOS = dt.LADOS          # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
RAIO = 0.015              # barra do Smith: 30 mm na pegada (Titan Smith Machine: "Barbell Shaft Diameter: 30mm"; a do e3.smith)
TOPO = 0.44               # topo do estofado do banco (o do Supino Reto com Barra)
BANCO_Y = (-0.28, 0.92)   # pé e cabeceira do banco (o do Supino Reto com Barra: com o pé em −0,34 a panturrilha encostava na quina)
ABRE = 60                 # cotovelo × tronco embaixo, vista de cima do peito (graus; 90 = em T): ExRx, Bench Press Analyses, 45–70°
FOLGA_PEITO = 0.007       # barra → pele do peito embaixo: encosta de leve (o Supino Reto com Barra; Saeterbakken 2021: "lightly touch
                          # the chest")
COTOVELO_CIMA = 10        # flexão do cotovelo em cima: quase esticado, sem travar ("Press bar until arms are extended", ExRx)
PUNHO = 14                # extensão do punho (graus): a mão inclinada pra cabeça em relação ao antebraço, a barra em cima dele (o do
                          # Supino Reto com Barra embaixo). O punho fica FIRME nesse ângulo o movimento todo (NSCA: "Keep wrists rigid
                          # and directly above elbows"): em cima o antebraço deita ~17° pros pés (a barra em cima do peito, não do
                          # ombro) e, com a mão parada no mundo como no supino livre, o punho dobrava 27–29° pra trás; aqui a mão
                          # acompanha o antebraço no plano do corpo e rola em volta da barra (que não gira), com a pegada igual
VOLTAS_PUNHO = 4          # voltas mão ↔ antebraço até o ângulo do antebraço parar de mudar (cada volta divide o erro por ~3)
PUNHO_FORA = 6.0          # a mão girada um pouco pra fora (graus, no plano da palma: os dedos inclinam pro lado do dedo mínimo e a
                          # barra cruza a palma um pouco na diagonal) — ExRx, Bench Press Analyses: "Position the wrists directly under
                          # the bar by turning the wrists out slightly so bar is placed on lower outer portion of palm. This grip
                          # positioning prevents the wrists from becoming completely hyperextended". Com a mão ⟂ à barra, em cima (o
                          # braço quase esticado e aberto pra fora) o punho desviava 24°/21° pro lado do polegar
                          # (tecnica3d.punho_desvio), além dos 20° de desvio radial normais da AAOS (Norkin & White, a fonte do
                          # limites.py)
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula, em pé antes de deitar
                          # (os do Supino Reto na Máquina Deitado; ExRx: "Keep the scapula back and down")
POLEGAR_FIXO = {"Left": (-12.0, 24.0, 1.0, 28.0, -7.3, 40.0), "Right": (-15.0, 26.0, 4.0, 32.0, -5.3, 46.0)}
                          # polegar NOVO dando a volta na barra, FIXO em todos os quadros: postura anatômica de cada mão (CMC flexão,
                          # abdução, rotação, MCP flexão, abdução, IP flexão, graus — polegar3d.CAMPOS) que a busca do
                          # pg.polegar_em_volta achou do zero em cima (checagem de 10/10/2026 com BUSCAR_POLEGAR = True: 3 posturas
                          # viáveis achadas em cima e embaixo nas 2 mãos, cada uma medida em cima, no meio e embaixo na pele do Blender)
                          # — por mão, a de menos pele esticada sem triângulo do avesso e sem entrar na barra mais que o aperto da mão:
                          # pele da base 1,94× (E) e 2,03× (D), 0 triângulo nos 3 quadros, polegar → barra −1,1 mm (E) e −0,3 mm (D)
BUSCAR_POLEGAR = False    # True = refaz a busca (≈5 min a mais na montagem) e imprime a medida de cada postura
EIXO = Vector((1, 0, 0))  # a barra do Smith fica ao longo do X
PERTO_DA_BARRA = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm")
                          # pele que a barra não pode tocar além de "de leve" (peito, pescoço, rosto, ombros, braços)


def _malha(bon, niveis=1):
    return ck._avaliar(bon.corpo, niveis)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _polegar_nos_angulos(bon, lado, q):
    """Polegar da mão `lado` na postura anatômica q = (cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex), em graus — a mesma
    conta do pg.polegar_em_volta quando ele acha a postura (polegar3d.eixos_do_polegar + rotacoes, osso por osso); a do Agachamento
    no Smith (lote 4) e da Remada Invertida (lote 9)."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, np.array(p3.ponta(rig, ossos[2])))
    for o, R in zip(ossos, P3.rotacoes(eixos, q)):
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))


def _ik_braco(rig, lado, W, polo):
    """IK analítico do braço (2 ossos), no lugar do IK do Blender — o da Remada Invertida (lote 9, 10/10/2026), copiado: o punho
    (cabeça do osso Hand) em W e o cotovelo no plano (ombro, W, polo), do lado do polo — sempre, até com o braço quase esticado (aqui
    o IK do Blender dependia do quadro anterior: na 3ª prévia, 10/10, o polo achado embaixo mudou de −45° pra 50° depois da busca do
    em cima e o cotovelo esquerdo ficou 55° aberto contra 58° do direito, com o antebraço 4° fora da vertical). Parte do braço de
    repouso (base zerada): o braço gira até o cotovelo, levando o plano da dobra do repouso pro plano novo (o mesmo giro do braço que
    o IK do Blender faz com o polo), e o antebraço gira só na dobra do cotovelo até o punho."""
    S = p3.cabeca(rig, lado + "Arm")
    E0, W0 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
    Lb, La = (E0 - S).length, (W0 - E0).length
    d = W - S
    dl = min(d.length, Lb + La - 1e-6)
    u = d.normalized()
    a = (Lb * Lb - La * La + dl * dl) / (2 * dl)
    h = math.sqrt(max(Lb * Lb - a * a, 0.0))
    v = polo - S
    v = (v - u * v.dot(u)).normalized()
    E = S + u * a + v * h
    # braço: a direção (E − S) e a normal do plano da dobra (v × u: a do repouso, (E0 − S) × (W0 − E0), vira esta)
    b0, n0 = (E0 - S).normalized(), (E0 - S).cross(W0 - E0)
    n0 = (n0 - b0 * n0.dot(b0)).normalized()
    b1, n1 = (E - S).normalized(), v.cross(u)
    n1 = (n1 - b1 * n1.dot(b1)).normalized()
    F0 = Matrix((b0, n0, b0.cross(n0))).transposed()
    F1 = Matrix((b1, n1, b1.cross(n1))).transposed()
    p3.girar_osso(rig, lado + "Arm", F1 @ F0.transposed())
    f0 = p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")
    p3.girar_osso(rig, lado + "ForeArm", f0.rotation_difference(W - p3.cabeca(rig, lado + "ForeArm")).to_matrix())


def _segurar(maos, lado, g, dedos_q, palma_q, polo, alinhar=0.0, voltas=40, passo=0.6, eixo=None):
    """O da Remada Invertida (lote 9), copiado. O maos3d.Maos.segurar (IK do braço até o punho → antebraço gira pra palma → o resto
    no punho → corrige o punho até o vão da mão cair em g), com 3 mudanças: o IK é o analítico (_ik_braco), partindo do repouso a
    cada volta (o resultado não depende do quadro anterior); a correção é AMORTECIDA (`passo` < 1: perto do braço esticado a mão,
    que segue o antebraço, anda quase o mesmo tanto que o punho, e a correção cheia oscilava — o vão da mão pulava entre 1 e 13 mm);
    e, com `eixo` (o da barra), os dedos ficam ⟂ a ele — a linha dos nós dos dedos fica ao longo da barra e o punho desvia pro lado
    o que o antebraço sair do plano ⟂ à barra (com os dedos seguindo o antebraço inteiro, embaixo, com o braço aberto ~11° pra fora, a
    barra cortava a mão na diagonal: entrava 6,7 mm). A pronação fica toda no antebraço: a mão volta pro repouso antes do giro dele
    (sem isso o giro dependia da mão da volta anterior e a pele da base do polegar torcia embaixo)."""
    rig, PB = maos.rig, maos.rig.pose.bones
    dedos_q = Vector(dedos_q).normalized()
    palma_q = Vector(palma_q)
    palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
    maos.iks[lado].mute = True                       # o IK do Blender fica desligado (o _ik_braco faz o braço)
    pg.mao_de_referencia(rig, lado)
    alvo = g - dedos_q * (maos.palma * 0.92)
    erro = Vector()
    for _ in range(voltas):
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + lado + n].matrix_basis = Matrix()
        p3.atualizar()
        _ik_braco(rig, lado, alvo, polo)
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        h0 = p3.cabeca(rig, lado + "Hand")
        y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
        n_m = pg._base(rig, lado)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        dq = (dedos_q * (1 - alinhar) + ax * alinhar).normalized()
        if eixo is not None:
            dq = (dq - eixo * dq.dot(eixo)).normalized()
        pq = (palma_q - dq * palma_q.dot(dq)).normalized()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        erro = g - p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]
        if erro.length < 0.0003:
            break
        alvo = alvo + erro * passo
    maos.erro[lado] = erro.length
    fa = p3.ponta(rig, lado + "ForeArm") - p3.cabeca(rig, lado + "ForeArm")
    mo = p3.ponta(rig, lado + "Hand") - p3.cabeca(rig, lado + "Hand")
    maos.punho[lado] = math.degrees(fa.angle(mo))


def _orientacao(graus, s):
    """Dedos e palma da mão do lado s (+1 esquerdo, −1 direito) com os dedos `graus` pra cabeça da vertical (a mão rola em volta da
    barra, que fica ao longo do X) e PUNHO_FORA° pra fora, pro lado do dedo mínimo (em volta da normal da palma): palma pros pés
    (pegada pronada de quem está deitado). A pegada na barra é a mesma em todo `graus`."""
    a, b = math.radians(graus), math.radians(PUNHO_FORA)
    dq = Vector((0, math.sin(a), math.cos(a))) * math.cos(b) + Vector((s * math.sin(b), 0, 0))
    return dq, Vector((0, -math.cos(a), math.sin(a)))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)     # mão de referência da barra de 30 mm (Shimawaki 2019, interpolada) — antes do Maos
    rig = bon.rig

    def cab(n):
        return p3.cabeca(rig, n)

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (ExRx, Bench Press Analyses: "Keep the scapula back and down"):
    # cada clavícula gira RETRAI° em volta do eixo do tronco e DESCE° em volta do eixo da frente, em pé, antes de deitar ───────────
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    ombro_antes = {L: cab(L + "Arm") for L, _ in LADOS}
    for L, s in LADOS:
        if RETRAI:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        if DESCE:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro E andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (cab("LeftArm") - ombro_antes["Left"]).dot(-frente0) * 1000,
        -(cab("LeftArm") - ombro_antes["Left"]).dot(cima0) * 1000), flush=True)

    # ── 2) deitado de costas no banco reto: cabeça, costas e glúteo no estofado, pés chapados no chão ───────────────────────────
    dt.deitar(bon, TOPO)
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
    maos = Maos(bon, RAIO, polegar_modo="volta")
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço

    OFF = {}                     # vão da mão − punho no referencial da mão (dedos, palma, dedos × palma): igual em toda orientação
    for L, s in LADOS:
        dq0, pq0 = _orientacao(PUNHO, s)
        g = S[L] + Vector((s * 0.15, 0, 0.55))
        _segurar(maos, L, g, dq0, pq0, polo=S[L] + Vector((s * 0.5, -0.3, -0.3)))
        o = g - cab(L + "Hand")
        OFF[L] = (o.dot(dq0), o.dot(pq0), o.dot(dq0.cross(pq0)))
    print("vão da mão − punho E %.1f/%.1f/%.1f mm D %.1f/%.1f/%.1f mm (ao longo dos dedos, pra palma, de lado)" % (
        *(x * 1000 for x in OFF["Left"]), *(x * 1000 for x in OFF["Right"])), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    off = {L: vao_menos_punho(L, *_orientacao(PUNHO, s)) for L, s in LADOS}     # embaixo o antebraço fica em pé: a mão em PUNHO°
    MEIA = 0.75 - 0.0375         # até onde a barra da pegada vai (e3.smith padrão: x_trilho − raio de fora do carrinho; o Smith ainda
                                 # não existe aqui — depois, sm.meia, o mesmo número)

    def maos_em(z):
        """As 2 mãos na barra com o eixo em (0, Y_BARRA, z), sem fechar os dedos: o punho firme em PUNHO° (a mão acompanha o
        antebraço no plano do corpo, girando em volta da barra, um pouco virada pra fora) e o cotovelo no ponto mais baixo que o braço
        deixa (o antebraço o mais em pé possível, embaixo da barra, como no supino com barra), pelo IK analítico (_segurar: não depende
        do quadro anterior). Devolve o centro da barra."""
        centro = Vector((0.0, Y_BARRA, z))
        for L, s in LADOS:
            g = centro + Vector((s * GRIP, 0, 0))
            fi = 0.0                                         # antebraço: graus pra cabeça da vertical (no plano YZ)
            for _ in range(VOLTAS_PUNHO):
                dq, pq = _orientacao(fi + PUNHO, s)
                W = g - vao_menos_punho(L, dq, pq)
                _segurar(maos, L, g, dq, pq, polo=dt.polo_cotovelo_baixo(S[L], W, Lb, La))
                ax = cab(L + "Hand") - cab(L + "ForeArm")
                fi = math.degrees(math.atan2(ax.y, ax.z))
            maos_em.fi[L] = fi
        return centro

    maos_em.fi = {}

    def folga_barra(y, z, meia=MEIA, malha=None):
        """Pele (fora as mãos e os antebraços) → superfície da barra da pegada com o eixo em (y, z) (m, − = entrou): o mais perto e
        de que parte. A checagem mede a barra junto com o resto do Smith; aqui é só a barra × peito, pescoço, rosto e braços."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        m = _grupo(nomes_, dono_, PERTO_DA_BARRA)
        P = co_[m]
        d = np.hypot(P[:, 1] - y, P[:, 2] - z) - RAIO
        d[np.abs(P[:, 0]) > meia] = 1e9
        k = int(np.argmin(d))
        return float(d[k]), nomes_[dono_[np.where(m)[0][k]]]

    # ── 3) embaixo: antebraço na vertical e cotovelo a ABRE° do tronco → largura da pegada e LINHA da barra (a do Supino Reto com
    # Barra: a barra encosta de leve no peito, na linha dos mamilos) ───────────────────────────────────────────────────────────────
    y1 = S["Left"].y - 0.08
    for _ in range(5):
        z1 = dt.peito(bon, y1) + FOLGA_PEITO + RAIO
        gs = {}
        for L, s in LADOS:
            wz = z1 - off[L].z
            cot = dt.cotovelo_embaixo(S[L], wz, Lb, La, ABRE, s)
            gs[L] = Vector((cot.x, cot.y, wz)) + off[L]
        y1 = (gs["Left"].y + gs["Right"].y) / 2
    GRIP = (gs["Left"].x - gs["Right"].x) / 2
    Y_BARRA = y1
    # a pele do peito muda um pouco com os braços embaixo (a do peitoral acompanha o braço): a barra desce até FOLGA_PEITO da pele
    # medida JÁ na pose de baixo (com o dt.peito da pose de prova sobravam 10 mm) — a linha e a pegada acompanham a nova altura
    for volta in range(6):
        maos_em(z1)
        folga, parte = folga_barra(Y_BARRA, z1)
        print("   embaixo, volta %d: barra em y %.4f z %.4f → pele %.1f mm (%s) | meia pegada %.4f" % (
            volta, Y_BARRA, z1, folga * 1000, parte, GRIP), flush=True)
        if abs(folga - FOLGA_PEITO) < 0.0003:
            break
        z1 += FOLGA_PEITO - folga
        for _ in range(3):
            for L, s in LADOS:
                wz = z1 - off[L].z
                cot = dt.cotovelo_embaixo(S[L], wz, Lb, La, ABRE, s)
                gs[L] = Vector((cot.x, cot.y, wz)) + off[L]
            Y_BARRA = (gs["Left"].y + gs["Right"].y) / 2
        GRIP = (gs["Left"].x - gs["Right"].x) / 2

    # ── 4) em cima: a barra sobe NA MESMA LINHA (o Smith só anda na vertical) até o cotovelo ficar dobrado COTOVELO_CIMA° (bissecção
    # com o braço de verdade: a mão em cima gira junto com o antebraço e o vão da mão muda de lugar em relação ao punho) ──────────
    def cotovelo_medio():
        jj = ck.medir_juntas(rig)
        return (jj["cotoveloE"] + jj["cotoveloD"]) / 2

    lo, hi = z1 + 0.15, z1 + 0.60
    for _ in range(16):
        meio = (lo + hi) / 2
        maos_em(meio)
        if cotovelo_medio() > COTOVELO_CIMA and max(maos.erro.values()) < 0.002:
            lo = meio                       # ainda dobrado: sobe mais
        else:
            hi = meio
    z0 = lo
    maos_em(z0)
    print("EM CIMA | barra z %.4f | cotovelo %.1f° | antebraço %.1f/%.1f° da vertical (− = pros pés) | vão da mão %.1f/%.1f mm" % (
        z0, cotovelo_medio(), maos_em.fi["Left"], maos_em.fi["Right"], maos.erro["Left"] * 1000, maos.erro["Right"] * 1000),
        flush=True)

    # ── 5) o Smith em volta do corpo: os trilhos na linha da barra, o curso de embaixo (peito) até em cima (braços esticados) ──────
    sm = e3.smith("smith", y=Y_BARRA, z=z0, curso=(z1 - 0.002, z0 + 0.002))
    co, _, (nomes, dono) = _malha(bon)
    T = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2"))]
    rel = T - np.array(S["Left"])
    f = T[(np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (rel[:, 1] < 0.0) & (rel[:, 1] > -0.20)]
    mam = Vector(f[f[:, 2].argmax()])       # a parte mais alta (saliente) do peitoral, perto da linha dos mamilos
    M = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2", "Neck"))]
    M = M[np.abs(M[:, 0]) < 0.012]
    perfil = []
    for dy in range(6, -26, -2):            # pele na linha do meio (o esterno), de 6 cm pra cabeça a 24 cm pros pés do ombro
        y_ = S["Left"].y + dy / 100
        fx = M[np.abs(M[:, 1] - y_) < 0.006]
        perfil.append("%+d:%s" % (dy, "%.0f" % (float(fx[:, 2].max()) * 1000) if len(fx) else "-"))
    print("PERFIL do peito na linha do meio (cm do ombro: altura da pele em mm): %s" % " ".join(perfil), flush=True)
    print("SMITH | linha da barra y %.4f = %.0f mm pros pés da articulação do ombro, %+.0f mm da parte mais saliente do peitoral "
          "(%.3f %.3f %.3f) | barra em cima z %.3f, embaixo z %.3f (curso %.0f mm) | meia pegada %.3f m (mão até o carrinho %.0f mm) | "
          "ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (
              Y_BARRA, (S["Left"].y - Y_BARRA) * 1000, (Y_BARRA - mam.y) * 1000, *mam, z0, z1, (z0 - z1) * 1000, GRIP,
              (sm.meia - GRIP) * 1000, *S["Left"], *S["Right"]), flush=True)

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

    # ── 6) polegar NOVO dando a volta na barra, FIXO em todos os quadros: a mão só gira em volta da barra (junto com o antebraço, o
    # punho firme), então a pegada é a mesma em todo quadro. A busca do pg.polegar_em_volta, refeita quadro a quadro, fica na
    # beirada do viável nessas pegadas (o Agachamento no Smith e a Remada Invertida acharam o polegar trocando no meio do movimento
    # e fixaram a postura; na 1ª prévia daqui, com a mão parada no mundo, ela só achou postura em cima): a postura sai da própria
    # busca, feita em cima e embaixo, e cada uma é medida em cima, no meio e embaixo (abaixo) ───────────────────────────────────────
    POLEGAR = dict(POLEGAR_FIXO)
    if BUSCAR_POLEGAR:
        AMOSTRAS = (0.0, 0.5, 1.0)              # onde cada postura é medida
        cands = {L: [] for L, _ in LADOS}
        for tt in (0.0, 1.0):                   # a busca (cara) só em cima e embaixo: a pegada é a mesma em todo quadro
            c_ = bracos(tt)
            for L, _ in LADOS:
                r = pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="volta")["Thumb"]
                if isinstance(r, tuple) and r and r[0] == "volta" and r[-1]:
                    cands[L].append((tuple(float(x) for x in r[1:7]), tt, r[7], r[8], r[9]))
                print("   busca do polegar %s em t = %.1f: %s" % (L, tt, r), flush=True)
        # as posturas achadas nas 2 mãos servem às 2 (polegar3d: "a mão direita sai espelhada da esquerda sem trocar sinal nenhum");
        # cada uma é posta nos 3 quadros e medida na pele de VERDADE (pg.pele_do_polegar, a malha do Blender): na 1ª prévia (10/10) a
        # postura que só entrava menos na barra deixava a pele da base do polegar direito esticada 2,9–3,2× com 10–11 triângulos do
        # avesso (na conta da busca, 2,38×). Fica, por mão, a que não entra na barra mais que o aperto da mão (pg.APERTO) em nenhum
        # quadro e, entre essas, a de menos triângulos do avesso e menos pele esticada no pior quadro
        todas = []
        for L, _ in LADOS:
            for cand in cands[L]:
                if all(max(abs(a - b) for a, b in zip(cand[0], c2[0])) > 0.5 for c2 in todas):
                    todas.append(cand)
        if not todas:
            raise RuntimeError("polegar novo sem postura viável nas 2 mãos (t = 0; 0,5; 1)")
        medidas = {L: [[None] * len(AMOSTRAS) for _ in todas] for L, _ in LADOS}
        for k, tt in enumerate(AMOSTRAS):       # cada postura, posta nos 3 quadros: quanto o polegar entra na barra e a pele da base
            c_ = bracos(tt)
            for L, _ in LADOS:
                pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="busca")
                for i, cand in enumerate(todas):
                    _polegar_nos_angulos(bon, L, cand[0])
                    pp = pg.pele_do_polegar(bon, L)
                    medidas[L][i][k] = (polegar_na_barra(L, c_.z), pp["alonga_max"], pp["viradas"])
        for L, _ in LADOS:
            def nota(i):
                m = medidas[L][i]
                return (any(x[0] < -pg.APERTO for x in m), max(x[2] for x in m), round(max(x[1] for x in m), 2),
                        -min(x[0] for x in m))
            i = min(range(len(todas)), key=nota)
            q, tt, alvo_mm, vao_mm, alonga = todas[i]
            POLEGAR[L] = q
            for j, cand in enumerate(todas):
                print("   polegar %s, postura %d %s (achada em t = %.1f): em cima/meio/embaixo → barra %s mm | pele da base %s× | "
                      "triângulos do avesso %s" % (L, j, cand[0], cand[1], "/".join("%+.1f" % (x[0] * 1000) for x in medidas[L][j]),
                                                   "/".join("%.2f" % x[1] for x in medidas[L][j]),
                                                   "/".join("%d" % x[2] for x in medidas[L][j])), flush=True)
            print("POLEGAR %s | %d postura(s) viável(is) nas 2 mãos | fica a %d, achada em t = %.1f: (CMC flex, abd, rot, MCP "
                  "flex, abd, IP flex) %s | alvo %.1f mm, vão %.1f mm na busca" % (L, len(todas), i, tt, q, alvo_mm, vao_mm),
                  flush=True)

    print("POLEGAR | novo, fixo: (CMC flex, abd, rot, MCP flex, abd, IP flex) E %s D %s" % (POLEGAR["Left"], POLEGAR["Right"]),
          flush=True)

    # os 4 dedos fecham até a pele encostar na barra e o polegar novo fica na postura escolhida — UMA vez, em cima: a mão só gira em
    # volta da barra (com o vão no eixo dela e os dedos ⟂ a ela), então a pegada é a mesma em todo quadro (como a mão rígida no
    # pegador redondo do Supino Reto na Máquina Deitado); a checagem confere a mão fechada em todo quadro
    PB = rig.pose.bones
    DEDOS = {}
    c_ = bracos(0.0)
    dedos_info = {}
    for L, _ in LADOS:
        dedos_info[L] = pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="busca")
        _polegar_nos_angulos(bon, L, POLEGAR[L])
        dedos_info[L]["Thumb"] = ("volta fixo",) + POLEGAR[L]
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, dedos_info[L]), flush=True)

    def pose(t):
        """t=0 braços quase esticados em cima, t=1 barra embaixo, quase no peito (na mesma linha vertical)."""
        bracos(t)
        for L, _ in LADOS:                  # a mão fechada de sempre (o _segurar põe a mão de referência a cada volta)
            for n, M in DEDOS[L].items():
                PB[n].matrix_basis = M.copy()
        p3.atualizar()
        pose.t = t

    pose.dedos = dedos_info
    pose.t = 0.0


    def barra_no_corpo(malha=None):
        return folga_barra(Y_BARRA, sm.barra.matrix_world.to_translation().z, sm.meia, malha)

    def maos_na_barra(malha=None):
        """Por mão: (borda de dentro do carrinho − pele da mão, pelo X; pele da mão mais funda dentro da barra da pegada, − = entrou),
        em m — a checagem não olha o que fica dentro da mão."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        z = sm.barra.matrix_world.to_translation().z
        out = []
        for L, s in LADOS:
            H = co_[np.array([n.startswith(L + "Hand") for n in nomes_] + [False])[dono_]]
            out.append((sm.meia - float((s * H[:, 0]).max()), float((np.hypot(H[:, 1] - Y_BARRA, H[:, 2] - z) - RAIO).min())))
        return out

    def pecas_perto():
        """Mãos × cada peça do Smith fora a barra da pegada (carrinho, tampa, gancho, luva, colar, anilha, trilho, trava, pino,
        coluna, base) e o banco × as mesmas peças: a menor distância de verdade (BVH), em m, e de que peça."""
        from mathutils.bvhtree import BVHTree
        co_, tri_, (nomes_, dono_) = _malha(bon)
        H = co_[np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes_] + [False])[dono_]]
        B = np.concatenate([ck._avaliar_simples(o)[0] for o in ck._malhas(banco)])
        pecas = [o for raiz in (sm.raizes["estrutura"], sm.raizes["barra"]) for o in ck._malhas(raiz)
                 if o.name != "smith_barra_pegada"]
        melhor = {"mãos": (1e9, ""), "banco": (1e9, "")}
        for o in pecas:
            eco, etri = ck._avaliar_simples(o)
            bvh = None
            for chave, P in (("mãos", H), ("banco", B)):
                # distância entre as caixas envolventes: longe (> 5 cm) = ela mesma basta (é ≤ a distância de verdade)
                gap = float(np.linalg.norm(np.maximum(0.0, np.maximum(eco.min(axis=0) - P.max(axis=0),
                                                                      P.min(axis=0) - eco.max(axis=0)))))
                if gap > 0.05:
                    if gap < melhor[chave][0]:
                        melhor[chave] = (gap, o.name + " (caixa)")
                    continue
                if bvh is None:
                    bvh = BVHTree.FromPolygons([tuple(p) for p in eco], [tuple(t) for t in etri], all_triangles=True)
                for v in P:
                    d = bvh.find_nearest(Vector(v))[3]
                    if d is not None and d < melhor[chave][0]:
                        melhor[chave] = (d, o.name)
        return melhor

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        b = sm.barra.matrix_world.to_translation()
        malha = _malha(bon)                 # a malha do quadro, avaliada uma vez só (o exportador chama o info() todo quadro)
        folga, parte = barra_no_corpo(malha)
        mnb = maos_na_barra(malha)
        braco_h = [math.degrees(math.atan2(float(jj[L + "Arm"][2] - jj[L + "ForeArm"][2]),
                                           float(np.hypot(*(jj[L + "ForeArm"][:2] - jj[L + "Arm"][:2]))))) for L, _ in LADOS]

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            pp = pg.pele_do_polegar(bon, lado)
            return "%s, pele da base %.2f× e %d triângulo(s) do avesso, polegar → barra %+.1f mm" % (
                v[0] if isinstance(v, tuple) and v else v, pp["alonga_max"], pp["viradas"],
                polegar_na_barra(lado, b.z, malha) * 1000)
        return ("barra z %.3f (y %.4f, saiu da linha %.1f mm) | barra → pele %.1f mm (%s) | cotovelo %.0f/%.0f°, E %.0f mm abaixo do "
                "topo do banco | braço × horizontal %s° (+ = cotovelo abaixo do ombro) | abertura %s° | elevação %s° | antebraço × "
                "vertical %s° | punho %.0f/%.0f° (flexão %s) | palma: frente %s°, dentro %s° | pegada %.2f | escápula %s mm | tronco "
                "%.1f° | coluna %.1f° | cabeça %.1f° | mão → carrinho %s mm, mão mais funda na barra %s mm | polegar E %s | D %s | "
                "%s" % (
                    b.z, b.y, math.hypot(b.x, b.y - Y_BARRA) * 1000, folga * 1000, parte, juntas["cotoveloE"],
                    juntas["cotoveloD"], (TOPO - float(jj["LeftForeArm"][2])) * 1000, "/".join("%.0f" % v for v in braco_h),
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)), ck.angulo_chave(rig, {"medida": "tronco"})[0],
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], "/".join("%.0f" % (v[0] * 1000) for v in mnb),
                    "/".join("%+.1f" % (v[1] * 1000) for v in mnb), pol("Left"), pol("Right"), maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
        pp = pecas_perto()
        print("      peças do Smith (fora a barra da pegada): → mãos %.0f mm (%s) | → banco %.0f mm (%s) | anilha mais baixa z %.3f" % (
            pp["mãos"][0] * 1000, pp["mãos"][1], pp["banco"][0] * 1000, pp["banco"][1],
            min(float(ck._avaliar_simples(o)[0][:, 2].min()) for o in ck._malhas(sm.raizes["barra"]) if "anilha" in o.name)),
            flush=True)
    pose(0.0)

    bk = ck.Barra(sm.barra, raio=RAIO, meio_compr=sm.meia)
    # a barra é EQUIPAMENTO (não apoio, como no Agachamento no Smith): no supino ela fica nas mãos e só chega perto do peito — com a
    # barra de equipamento a checagem cobra 3 mm de folga dela até o resto do corpo em todo quadro (encostar "de leve" embaixo = os
    # 7 mm do Supino Reto com Barra); de apoio, ela poderia afundar na pele. O banco é o apoio.
    return Cena(pose, sm.equipamentos + [sm.barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, Y_BARRA, 0.65), camera_video=((3.3, -2.5, 1.75), (0, Y_BARRA, 0.72), 45), info=info,
                apoios=[banco], afunda_apoio_mm=20)
