# Desenvolvimento no Smith (sentado, pela frente) — cena da fábrica 3D (lote 10, 10/10/2026; 0 usos nos treinos prontos do app, 10
# vezes como troca equivalente). Máquina: o Smith do Agachamento no Smith (equip3d.smith, lote 4: a barra corre presa em 2 trilhos
# verticais e só sobe e desce) montado em volta do banco de encosto quase em pé do Desenvolvimento com Barra (equip3d.banco_inclinado a
# 85° + deitado3d.inclinar + o sentar_no_assento do Desenvolvimento com Halteres), sem mudar nada em lib/.
# Variação: vazia no catálogo (fonte_en "Smith Machine Overhead Shoulder Press", o nome do Bodybuilding.com); vale a decisão do lote 9:
# SENTADO, com o encosto quase em pé, pela frente ("sentado, pela frente", como o Desenvolvimento com Barra).
# As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   ExRx, Smith Shoulder Press: "Sit on bench with bar positioned in front of shoulders. Grasp bar with wide overhand grip. Disengage
#   bar by rotating bar back." / "Press bar upward until arms are extended overhead. Lower bar to front of shoulders and repeat." /
#   "Pull head back slightly so bar does not make contact with head."; Bodybuilding.com, Smith Machine Overhead Shoulder Press: "sit
#   slightly in behind the barbell so that there is an imaginary straight line from the tip of your nose to the barbell" / "Slowly
#   begin to lower the barbell until it is level with your chin"; ACE, Seated Shoulder Press (barra livre): "stopping when the bar is
#   about chin-height"; Cotterman, Darby e Skelly 2005: "The Smith machine (SM) (vertical motion of bar on fixed path; fixed-form
#   exercise)".
# t = 0 barra embaixo, na altura do queixo · t = 1 braços quase esticados em cima. O app faz a volta.
# O que muda do Desenvolvimento com Barra (livre): lá a barra sobe reta na frente do rosto e depois volta pra cima da cabeça (13 cm pra
# trás); no Smith ela fica NA MESMA LINHA vertical (o y dos trilhos) do começo ao fim. A linha é a do Bodybuilding.com, na frente da
# ponta do nariz: a mais pra trás que deixa a superfície da barra a FOLGA_ROSTO de toda a pele do rosto, do pescoço, do peito e do
# cabelo no caminho todo (o nariz é o ponto mais à frente, então é ele que manda; medido no montar()). Embaixo a barra para na altura do
# queixo (Bodybuilding.com e ACE; o lote 9 parou no queixo pelo braço curto do boneco: ver a ficha); em cima ela sobe na mesma linha até
# o cotovelo ficar dobrado COTOVELO_CIMA° — os braços ficam um pouco inclinados pra frente, com a barra na frente da testa e acima dela,
# e não em cima dos ombros como no livre. A cabeça fica no encosto com o pescoço um pouco estendido (o dt.inclinar estende até a nuca
# encostar; ExRx: "Pull head back slightly so bar does not make contact with head").
# Como o rig faz: quadro a quadro o Smith sobe ou desce a barra (sm.mover, só na vertical) e as mãos vão junto pelo IK analítico do
# braço do Supino Reto no Smith (o da Remada Invertida: não depende do quadro anterior), com o cotovelo no ponto mais baixo que o braço
# deixa (antebraço o mais em pé possível, embaixo da barra); a mão, com a palma pra frente (pegada pronada), fica com o punho estendido
# PUNHO° em relação ao antebraço (de embaixo pra cima) e rola em volta da barra, que não gira: a pegada é a mesma em todo quadro. Os 4
# dedos fecham até a pele encostar na barra e o polegar novo dá a volta nela numa postura fixa tirada da própria busca (BUSCAR_POLEGAR),
# uma vez só. Tronco, cabeça, quadril, pernas e pés não mexem. O info() de cada quadro traz o que a checagem não mede: barra × rosto,
# mão × carrinho, mão dentro da barra fora da pegada e o polegar.
import math
import time
import numpy as np
from contextlib import contextmanager
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from maos3d import Maos
from cena import Cena
from desenvolvimento_com_halteres import sentar_no_assento
from supino_reto_no_smith import _ik_braco, _segurar, _polegar_nos_angulos   # IK analítico, mão no vão da barra, polegar fixo

LADOS = dt.LADOS          # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
RAIO = 0.015              # barra do Smith: 30 mm na pegada (a do e3.smith; Titan Smith Machine: "Barbell Shaft Diameter: 30mm")
ANGULO = 85               # encosto, graus da horizontal (quase em pé): o do Desenvolvimento com Barra e com Halteres
ASSENTO = 0.44            # topo do assento (m); o sentar_no_assento do Desenvolvimento com Halteres usa o mesmo
MEIA = 0.30               # vão de cada mão a 30 cm do meio da barra (~1,45× a distância entre as articulações dos ombros), a do
                          # Desenvolvimento com Barra: ExRx, Smith Shoulder Press: "wide overhand grip"
DZ_QUEIXO = -0.008        # eixo da barra embaixo: 8 mm abaixo do ponto mais baixo do queixo (a barra "level with your chin")
FOLGA_ROSTO = 0.014       # pele (a ponta do nariz, o ponto mais à frente) → superfície da barra, a menor no caminho todo (m): a do
                          # Desenvolvimento com Barra
COTOVELO_CIMA = 6         # flexão do cotovelo em cima (graus): "Press bar upward until arms are extended overhead" (ExRx), sem travar
PUNHO = (29.0, 12.0)      # extensão do punho em relação ao antebraço (graus, dedos inclinados pra trás), embaixo → em cima. Embaixo,
                          # checagem curta de 10/10/2026: com 24° o cotovelo dobrava 137° e o antebraço entrava 3,1/3,4 mm no braço fora
                          # do vinco (limite 2); com 29° (a mão como a do Desenvolvimento com Barra embaixo: 24° da vertical) o cotovelo
                          # fica em 136° e o antebraço encosta 1,5/1,8 mm. O punho medido (tecnica3d.punho_flexao) vai de −33/−35° embaixo
                          # a −16/−17° em cima ("Keep the wrists stiff", NSCA)
VOLTAS_PUNHO = 4          # voltas mão ↔ antebraço até o ângulo do antebraço parar de mudar
VOLTAS_MAO = 40           # voltas do _segurar (IK analítico + correção amortecida do vão da mão) em cada volta do punho
POLEGAR_FIXO = {"Left": (0.0, 40.0, -7.0, 40.0, 8.7, 51.0), "Right": (0.0, 40.0, -4.0, 28.0, -7.3, 57.0)}
                          # polegar NOVO dando a volta na barra, FIXO em todos os quadros: postura anatômica de cada mão (CMC flexão,
                          # abdução, rotação, MCP flexão, abdução, IP flexão, graus — polegar3d.CAMPOS) que a busca do pg.polegar_em_volta
                          # achou do zero embaixo (checagem curta de 10/10/2026 com BUSCAR_POLEGAR = True: 4 posturas viáveis achadas em
                          # cima e embaixo nas 2 mãos, medidas — junto com as 2 do Supino Reto no Smith — em cima, no meio e embaixo na
                          # pele do Blender): por mão, a que ENCOSTA na barra (≤ 0,5 mm) sem triângulo do avesso e com a pele da base
                          # menos esticada — E: polegar → barra −0,2 mm, pele 2,27×; D: +0,4 mm, 2,22×; 0 triângulo nos 3 quadros. As do
                          # Supino (1,94× e 2,03×) ficavam 2,3 e 3,5 mm (E) / 1,2 e 2,7 mm (D) longe da barra
BUSCAR_POLEGAR = False    # True = refaz a busca (≈3 min a mais na montagem) e imprime a medida de cada postura
EIXO = Vector((1, 0, 0))  # a barra do Smith fica ao longo do X


def _malha(bon, niveis=1):
    return ck._avaliar(bon.corpo, niveis)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


@contextmanager
def _so_ossos(bon):
    """Esconde o corpo, o cabelo e as sobrancelhas (hide_viewport) enquanto só os ossos mexem (o IK das mãos): o atualizar() deixa de
    avaliar a malha do corpo — sonda do rascunho (10/10/2026): 25 ms → 0,4 ms por atualizar, e a malha volta a seguir os ossos quando
    aparece de novo. Tudo volta a aparecer no fim (a checagem e o pegada3d medem a malha)."""
    objs = [o for o in (bon.corpo, getattr(bon, "cabelo", None), getattr(bon, "sobrancelhas", None)) if o is not None]
    antes = [o.hide_viewport for o in objs]
    for o in objs:
        o.hide_viewport = True
    try:
        yield
    finally:
        for o, h in zip(objs, antes):
            o.hide_viewport = h
        p3.atualizar()


def _orientacao(graus):
    """Dedos e palma (mundo) com os dedos `graus` inclinados pra trás da vertical (pro encosto) e a palma pra frente e pra cima:
    pegada pronada. A mão só gira em volta do X (o eixo da barra): a pegada é a mesma em todo `graus`."""
    a = math.radians(graus)
    return Vector((0.0, math.sin(a), math.cos(a))), Vector((0.0, -math.cos(a), math.sin(a)))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)     # mão de referência da barra de 30 mm (Shimawaki 2019, interpolada) — antes do Maos
    rig = bon.rig
    PB = rig.pose.bones
    T0 = time.time()

    def cab(n):
        return p3.cabeca(rig, n)

    # ── 1) sentado no banco de encosto quase em pé: glúteo no assento, costas e cabeça no encosto, pés chapados ─────────────────
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)
    sentar_no_assento(bon, junta_y)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    maos = Maos(bon, RAIO, polegar_modo="volta")
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço

    # ── 2) pele que a barra não pode encostar: rosto e pescoço, peito (|x| < 0,22: fora braços e mãos) e o cabelo; as partes do
    # rosto pela altura (nariz = o ponto mais à frente, queixo = o mais baixo da frente, testa = acima dos olhos) ─────────────────
    co, _, (nomes, dono) = _malha(bon)
    cabeca = co[_grupo(nomes, dono, ("Head",))]
    pescoco = co[_grupo(nomes, dono, ("Neck",))]
    peito = co[_grupo(nomes, dono, ("Spine2", "Spine1", "LeftShoulder", "RightShoulder"))]
    peito = peito[np.abs(peito[:, 0]) < 0.22]
    cab_co, _ = ck._avaliar_simples(bon.cabelo)
    cabelo = cab_co[np.abs(cab_co[:, 0]) < 0.22]
    meio = cabeca[np.abs(cabeca[:, 0]) < 0.03]
    nariz = Vector(meio[meio[:, 1].argmin()])                  # ponta do nariz
    frente = cabeca[cabeca[:, 1] < cabeca[:, 1].min() + 0.025]  # a frente do rosto (queixo, boca, nariz, testa)
    z_queixo = float(frente[:, 2].min())
    Z0 = z_queixo + DZ_QUEIXO
    partes = {"queixo e boca": cabeca[cabeca[:, 2] < nariz.z - 0.015], "nariz": cabeca[np.abs(cabeca[:, 2] - nariz.z) <= 0.015],
              "testa e alto da cabeça": cabeca[cabeca[:, 2] > nariz.z + 0.015], "pescoço": pescoco, "peito": peito,
              "cabelo": cabelo}
    pele = np.concatenate(list(partes.values()))
    Z_TETO = Z0 + 0.80                                         # acima de onde a barra chega em cima (só pra medir a linha)

    def folga_linha(y, P=pele, z0=Z0, z1=Z_TETO):
        """Menor distância (m) da superfície da barra (eixo ao longo de X em y, de z0 a z1) até os pontos P."""
        dz = np.maximum(0.0, np.maximum(z0 - P[:, 2], P[:, 2] - z1))
        return float((np.hypot(P[:, 1] - y, dz) - RAIO).min())

    perto = pele[(pele[:, 2] > Z0 - 0.03) & (pele[:, 2] < Z_TETO)]     # a pele na altura do caminho (a barriga, mais à frente e lá
    lo, hi = float(perto[:, 1].min()) - 0.10, float(perto[:, 1].min())  # embaixo, não serve de limite): lo longe, hi encostando
    for _ in range(30):
        m = (lo + hi) / 2
        if folga_linha(m) > FOLGA_ROSTO:
            lo = m
        else:
            hi = m
    Y_LINHA = lo                     # a linha mais pra trás com a FOLGA_ROSTO de toda a pele no caminho todo
    lim = []
    for nome, P in partes.items():
        dz = np.maximum(0.0, np.maximum(Z0 - P[:, 2], P[:, 2] - Z_TETO))
        d = np.hypot(P[:, 1] - Y_LINHA, dz) - RAIO
        k = int(d.argmin())
        lim.append("%s %.1f mm em (%.3f %.3f %.3f)" % (nome, d[k] * 1000, *P[k]))
    print("ROSTO | ponta do nariz (%.4f %.4f %.4f) | queixo z %.4f | linha da barra y %.4f: %.1f mm na frente da ponta do nariz "
          "(superfície %.1f mm) | barra embaixo z %.4f | folga da linha a cada parte: %s" % (
              *nariz, z_queixo, Y_LINHA, (nariz.y - Y_LINHA) * 1000, (nariz.y - Y_LINHA - RAIO) * 1000, Z0, " | ".join(lim)),
          flush=True)

    # ── 3) a mão na barra: o vão da mão − punho no referencial da mão (igual em toda orientação) ─────────────────────────────────
    OFF = {}
    for L, s in LADOS:
        dq0, pq0 = _orientacao(PUNHO[0])
        g = S[L] + Vector((s * 0.10, -0.15, 0.35))
        _segurar(maos, L, g, dq0, pq0, polo=S[L] + Vector((s * 0.4, -0.2, -0.4)))
        o = g - cab(L + "Hand")
        OFF[L] = (o.dot(dq0), o.dot(pq0), o.dot(dq0.cross(pq0)))
    print("vão da mão − punho E %.1f/%.1f/%.1f mm D %.1f/%.1f/%.1f mm (ao longo dos dedos, pra palma, de lado)" % (
        *(x * 1000 for x in OFF["Left"]), *(x * 1000 for x in OFF["Right"])), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def maos_em(z, punho):
        """As 2 mãos na barra com o eixo em (0, Y_LINHA, z), sem fechar os dedos: o punho estendido `punho` graus em relação ao
        antebraço (a mão rola em volta da barra junto com o antebraço) e o cotovelo no ponto mais baixo que o braço deixa (o antebraço
        o mais em pé possível, embaixo da barra), pelo IK analítico (_segurar: não depende do quadro anterior)."""
        centro = Vector((0.0, Y_LINHA, z))
        with _so_ossos(bon):
            for L, s in LADOS:
                g = centro + Vector((s * MEIA, 0, 0))
                fi = 0.0                                     # antebraço: graus pra trás da vertical (no plano YZ)
                for _ in range(VOLTAS_PUNHO):
                    dq, pq = _orientacao(fi + punho)
                    W = g - vao_menos_punho(L, dq, pq)
                    _segurar(maos, L, g, dq, pq, polo=dt.polo_cotovelo_baixo(S[L], W, Lb, La), voltas=VOLTAS_MAO)
                    ax = cab(L + "Hand") - cab(L + "ForeArm")
                    fi = math.degrees(math.atan2(ax.y, ax.z))
                maos_em.fi[L] = fi
        return centro

    maos_em.fi = {}

    def cotovelo_medio():
        jj = ck.medir_juntas(rig)
        return (jj["cotoveloE"] + jj["cotoveloD"]) / 2

    def medidas():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        return ("cotovelo %.0f/%.0f° | antebraço × vertical %s° (%s° no plano YZ, − = pra frente) | punho flexão %s° desvio %s° | braço: "
                "elevação %s°, plano %s°, abertura %s° | palma frente %s° dentro %s° | pegada %.2f | vão da mão %.1f/%.1f mm" % (
                    juntas["cotoveloE"], juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)),
                    "/".join("%.0f" % maos_em.fi.get(L, 0) for L, _ in LADOS),
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.punho_desvio(jj)),
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0], maos.erro["Left"] * 1000,
                    maos.erro["Right"] * 1000))

    # ── 4) embaixo: a barra na altura do queixo ──────────────────────────────────────────────────────────────────────────────
    maos_em(Z0, PUNHO[0])
    E0 = {L: cab(L + "ForeArm") for L, _ in LADOS}
    print("EMBAIXO | barra z %.4f | %s | cotovelo E %.0f mm %s da barra (y) e %.0f mm abaixo" % (
        Z0, medidas(), abs(E0["Left"].y - Y_LINHA) * 1000, "na frente" if E0["Left"].y < Y_LINHA else "atrás",
        (Z0 - E0["Left"].z) * 1000), flush=True)

    # ── 5) em cima: a barra sobe NA MESMA LINHA (o Smith só anda na vertical) até o cotovelo ficar dobrado COTOVELO_CIMA° ──────────
    lo, hi = Z0 + 0.33, Z0 + 0.53                  # o braço esticado alcança ~0,43 m acima do queixo (sonda de 10/10/2026)
    for _ in range(16):
        m = (lo + hi) / 2
        maos_em(m, PUNHO[1])
        if cotovelo_medio() > COTOVELO_CIMA and max(maos.erro.values()) < 0.002:
            lo = m                          # ainda dobrado: sobe mais
        else:
            hi = m
    Z1 = lo
    maos_em(Z1, PUNHO[1])
    ombro_y = (S["Left"].y + S["Right"].y) / 2
    jj = ck.posicoes(rig)
    braco_v = [math.degrees((Vector(jj[L + "ForeArm"]) - Vector(jj[L + "Arm"])).angle(Vector((0, 0, 1)))) for L, _ in LADOS]
    mao_v = [math.degrees((Vector((s * MEIA, Y_LINHA, Z1)) - S[L]).angle(Vector((0, 0, 1)))) for L, s in LADOS]
    print("EM CIMA | barra z %.4f | %s | barra %.0f mm na frente da linha dos ombros (y %.4f) | braço (ombro → cotovelo) %.1f/%.1f° e "
          "ombro → vão da mão %.1f/%.1f° da vertical (%.0f s)" % (Z1, medidas(), (ombro_y - Y_LINHA) * 1000, ombro_y, *braco_v, *mao_v,
                                                               time.time() - T0), flush=True)

    # folga barra × cada parte no caminho todo (400 pontos): o tronco e a cabeça não mexem, só os braços
    zs = np.linspace(Z0, Z1, 400)
    txt = []
    for nome, P in partes.items():
        d = np.hypot(P[None, :, 1] - Y_LINHA, P[None, :, 2] - zs[:, None]) - RAIO
        k = int(d.min(axis=1).argmin())
        txt.append("%s %.1f mm (barra em z %.3f)" % (nome, d.min() * 1000, zs[k]))
    # clavículas: a pele mais à frente do peito na altura da base das clavículas (cabeça dos ossos Shoulder)
    z_clav = (cab("LeftShoulder").z + cab("RightShoulder").z) / 2
    fc = peito[(np.abs(peito[:, 2] - z_clav) < 0.01) & (np.abs(peito[:, 0]) < 0.12)]
    clav = Vector(fc[fc[:, 1].argmin()])
    print("FOLGAS no caminho (barra → pele, menor de cada parte): %s | CLAVÍCULAS: pele da frente em (%.4f %.4f %.4f) → embaixo o eixo "
          "da barra fica %.0f mm na frente e %.0f mm acima dela" % (" | ".join(txt), *clav, (clav.y - Y_LINHA) * 1000,
                                                                    (Z0 - clav.z) * 1000), flush=True)

    # ── 6) o Smith em volta do corpo: os trilhos na linha da barra, o curso de embaixo (queixo) até em cima (braços esticados) ────
    sm = e3.smith("smith", y=Y_LINHA, z=Z0, curso=(Z0 - 0.002, Z1 + 0.002))
    print("SMITH | linha da barra y %.4f | barra embaixo z %.3f, em cima z %.3f (curso %.0f mm) | travas: centro do colar z %.3f | "
          "meia pegada %.3f m (mão até o carrinho %.0f mm) | junta do banco y %.3f | ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (
              Y_LINHA, Z0, Z1, (Z1 - Z0) * 1000, Z0 - 0.002 - 0.08 - 0.03 - 0.025, MEIA, (sm.meia - MEIA) * 1000, junta_y,
              *S["Left"], *S["Right"]), flush=True)

    def bracos(t):
        """Barra do Smith na altura do quadro t (só na vertical) e as 2 mãos nela (sem fechar os dedos)."""
        z = p3.lerp(Z0, Z1, t)
        sm.mover(z)
        return maos_em(z, p3.lerp(PUNHO[0], PUNHO[1], t))

    def polegar_na_barra(lado, z, malha=None):
        """Pele do polegar → superfície da barra (m), a mais funda (− = entrou na barra)."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        P = co_[_grupo(nomes_, dono_, tuple(lado + "HandThumb%d" % i for i in (1, 2, 3)))]
        return float((np.hypot(P[:, 1] - Y_LINHA, P[:, 2] - z) - RAIO).min())

    # ── 7) polegar NOVO dando a volta na barra, FIXO em todos os quadros: a mão só gira em volta da barra (junto com o antebraço),
    # então a pegada é a mesma em todo quadro. A postura sai da própria busca do pg.polegar_em_volta, feita em cima e embaixo, e
    # cada uma é medida em cima, no meio e embaixo na pele de verdade (o jeito do Supino Reto no Smith) ──────────────────────────
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
        for q in POLEGAR_FIXO.values():            # as posturas do Supino Reto no Smith (barra de 30 mm) entram na comparação
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

    # os 4 dedos fecham até a pele encostar na barra e o polegar novo fica na postura escolhida — UMA vez, embaixo: a mão só gira em
    # volta da barra (com o vão no eixo dela e os dedos ⟂ a ela), então a pegada é a mesma em todo quadro
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
        """t=0 barra embaixo, na altura do queixo; t=1 braços quase esticados em cima (na mesma linha vertical)."""
        bracos(t)
        for L, _ in LADOS:                  # a mão fechada de sempre (o _segurar põe a mão de referência a cada volta)
            for n, M in DEDOS[L].items():
                PB[n].matrix_basis = M.copy()
        p3.atualizar()
        pose.t = t

    pose.dedos = dedos_info
    pose.t = 0.0

    # ── folgas que a checagem não mede (ela ignora o que fica DENTRO da mão e não mede peça × peça) ─────────────────────────────
    def barra_no_rosto(z, malha=None):
        """Barra (eixo em (Y_LINHA, z)) → pele do rosto, pescoço e peito (|x| < 0,22) e o cabelo, a menor (m) e de que parte."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        melhor = (9.0, "")
        for nome_, ossos in (("cabeça", ("Head",)), ("pescoço", ("Neck",)),
                             ("peito", ("Spine2", "Spine1", "LeftShoulder", "RightShoulder"))):
            P = co_[_grupo(nomes_, dono_, ossos)]
            P = P[np.abs(P[:, 0]) < 0.22]
            d = float((np.hypot(P[:, 1] - Y_LINHA, P[:, 2] - z) - RAIO).min())
            melhor = min(melhor, (d, nome_))
        d = float((np.hypot(cabelo[:, 1] - Y_LINHA, cabelo[:, 2] - z) - RAIO).min())
        return min(melhor, (d, "cabelo"))

    def maos_na_barra(malha=None):
        """Por mão: (borda de dentro do carrinho − pele da mão, pelo X; pele da mão mais funda dentro da barra, − = entrou; pele da
        mão a mais de 3,5 cm do meio da mão, ao longo da barra, mais perto dela), em m."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        z = sm.barra.matrix_world.to_translation().z
        out = []
        for L, s in LADOS:
            H = co_[np.array([n.startswith(L + "Hand") for n in nomes_] + [False])[dono_]]
            rad = np.hypot(H[:, 1] - Y_LINHA, H[:, 2] - z) - RAIO
            longe = np.abs(H[:, 0] - s * MEIA) > 0.035
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
        folga, parte = barra_no_rosto(b.z, malha)
        mnb = maos_na_barra(malha)

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            pp = pg.pele_do_polegar(bon, lado)
            return "%s, pele da base %.2f× e %d triângulo(s) do avesso, polegar → barra %+.1f mm" % (
                v[0] if isinstance(v, tuple) and v else v, pp["alonga_max"], pp["viradas"], polegar_na_barra(lado, b.z, malha) * 1000)
        return ("barra z %.3f (y %.4f, saiu da linha %.1f mm) | barra → rosto/pescoço/peito/cabelo %.1f mm (%s) | cotovelo %.0f/%.0f° | "
                "antebraço × vertical %s° | punho %.0f/%.0f° (flexão %s, desvio %s) | braço: elevação %s°, plano %s° | palma: frente %s°, "
                "dentro %s° | pegada %.2f | tronco %.1f° | cabeça %.1f° | mão → carrinho %s mm, mão mais funda na barra %s mm, fora da "
                "pegada %s mm | polegar E %s | D %s | %s" % (
                    b.z, b.y, math.hypot(b.x, b.y - Y_LINHA) * 1000, folga * 1000, parte, juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.punho_desvio(jj)),
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    tc.pegada_largura(jj)[0], ck.angulo_chave(rig, {"medida": "tronco"})[0], tc.cabeca_tronco(jj)[0],
                    "/".join("%.0f" % (v[0] * 1000) for v in mnb), "/".join("%+.1f" % (v[1] * 1000) for v in mnb),
                    "/".join("%+.1f" % (v[2] * 1000) for v in mnb), pol("Left"), pol("Right"), maos.info()))

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
    # a barra é EQUIPAMENTO (não apoio), como no Supino Reto no Smith: ela fica nas mãos e só passa perto do rosto — a checagem cobra
    # 3 mm de folga dela até o resto do corpo em todo quadro (e a ficha, 10 mm do rosto e do cabelo). O banco é o apoio.
    return Cena(pose, sm.equipamentos + [sm.barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, Y_LINHA, 1.15), camera_video=((2.6, -3.9, 1.35), (0, Y_LINHA + 0.1, 1.12), 50), info=info,
                apoios=[banco], afunda_apoio_mm=20)
