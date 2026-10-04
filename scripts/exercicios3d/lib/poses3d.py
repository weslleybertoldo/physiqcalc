# Ajudantes de pose (rig Mixamo do MPFB): IK de braço/perna, girar osso no espaço do mundo, fechar a mão.
import bpy, math
from mathutils import Vector, Matrix, Quaternion

P = "mixamorig:"


def atualizar():
    bpy.context.view_layer.update()


def vazio(nome, loc=(0, 0, 0)):
    o = bpy.data.objects.new(nome, None)
    o.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    return o


def mundo_osso(rig, nome):
    """Matriz (mundo) atual do osso, já com pose e restrições."""
    return rig.matrix_world @ rig.pose.bones[P + nome].matrix


def cabeca(rig, nome):
    return mundo_osso(rig, nome).to_translation()


def ponta(rig, nome):
    pb = rig.pose.bones[P + nome]
    return rig.matrix_world @ pb.tail


def girar_osso(rig, nome, R, pivo=None, mover=Vector()):
    """Aplica a rotação R (3x3 ou quaternion, no mundo) ao osso em volta do pivô (padrão: a cabeça dele)
    e desloca `mover`. O rig fica na origem sem rotação, então mundo = espaço do armature."""
    pb = rig.pose.bones[P + nome]
    M = pb.matrix.copy()
    h = M.to_translation() if pivo is None else Vector(pivo)
    R4 = (R.to_matrix() if isinstance(R, Quaternion) else R).to_4x4()
    pb.matrix = Matrix.Translation(h + mover) @ R4 @ Matrix.Translation(-h) @ M
    atualizar()


def rot_x(graus):
    return Matrix.Rotation(math.radians(graus), 3, "X")


def rot_eixo(graus, eixo):
    return Matrix.Rotation(math.radians(graus), 3, Vector(eixo).normalized())


def ik(rig, osso, alvo, polo, cadeia=2, angulo_polo=None):
    c = rig.pose.bones[P + osso].constraints.new("IK")
    c.target = alvo
    c.pole_target = polo
    c.chain_count = cadeia
    if angulo_polo is not None:
        c.pole_angle = math.radians(angulo_polo)
    return c


def acertar_polo(rig, c, osso_meio, osso_base, osso_fim):
    """Escolhe o pole_angle que deixa a articulação do meio no plano (base, fim, polo) e do lado do polo."""
    melhor = None
    for ang in range(-180, 180, 5):
        c.pole_angle = math.radians(ang)
        atualizar()
        a = cabeca(rig, osso_base)
        m = cabeca(rig, osso_meio)
        f = ponta(rig, osso_fim) if osso_fim == osso_meio else cabeca(rig, osso_fim)
        p = c.pole_target.matrix_world.to_translation()
        eixo = (f - a).normalized()
        para_polo = (p - a) - eixo * (p - a).dot(eixo)
        para_meio = (m - a) - eixo * (m - a).dot(eixo)
        if para_polo.length < 1e-6 or para_meio.length < 1e-6:
            continue
        erro = para_polo.normalized().angle(para_meio.normalized())
        if melhor is None or erro < melhor[0]:
            melhor = (erro, ang)
    c.pole_angle = math.radians(melhor[1])
    atualizar()
    return melhor


def travar_rotacao(rig, osso):
    """O osso mantém a orientação de repouso no mundo (ex.: pé chapado no chão)."""
    b = rig.data.bones[P + osso]
    alvo = vazio("rot_" + osso, (0, 0, 0))
    alvo.matrix_world = rig.matrix_world @ b.matrix_local
    c = rig.pose.bones[P + osso].constraints.new("COPY_ROTATION")
    c.target = alvo
    return alvo


DEDOS = ("Index", "Middle", "Ring", "Pinky")


def fechar_mao(rig, lado, angulos=(55, 75, 55), polegar=(10, 30, 25), abrir=0.0):
    """Dobra os dedos pro lado da palma (lado: 'Left'/'Right'). abrir 0..1 reduz a dobra."""
    s = 1 if lado == "Left" else -1
    mao = cabeca(rig, lado + "Hand")
    ind = cabeca(rig, lado + "HandIndex1")
    mind = cabeca(rig, lado + "HandPinky1")
    a, b = ind - mao, mind - mao
    palma = (-(a.cross(b)) * s).normalized()
    eixo_nos = (mind - ind).normalized()
    k = 1 - abrir
    for d in DEDOS:
        for i, ang in enumerate(angulos, start=1):
            nome = "%sHand%s%d" % (lado, d, i)
            f = (ponta(rig, nome) - cabeca(rig, nome)).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
            girar_osso(rig, nome, rot_eixo(ang * k * sinal, eixo_nos))
    for i, ang in enumerate(polegar, start=1):
        nome = "%sHandThumb%d" % (lado, i)
        f = (ponta(rig, nome) - cabeca(rig, nome)).normalized()
        eixo = f.cross(palma).normalized()
        alvo = (cabeca(rig, lado + "HandMiddle1") - cabeca(rig, nome)).normalized()
        sinal = 1 if eixo.cross(f).dot(alvo) > 0 else -1
        girar_osso(rig, nome, rot_eixo(ang * k * sinal, eixo))
    return palma


def suave(t):
    """Ease seno 0→1."""
    return (1 - math.cos(math.pi * t)) / 2


def lerp(a, b, t):
    if isinstance(a, (tuple, list, Vector)):
        return Vector(a).lerp(Vector(b), t)
    return a + (b - a) * t



def soltar_dedos(rig, lado):
    for d in DEDOS + ("Thumb",):
        for i in (1, 2, 3):
            rig.pose.bones[P + "%sHand%s%d" % (lado, d, i)].matrix_basis = Matrix.Identity(4)
    atualizar()
