# O que cada cena de exercício (cenas/<slug>.py) devolve no montar(bon): o resto da fábrica só usa isto.
from mathutils import Vector


class Cena:
    def __init__(self, pose, equipamentos, pegadas=(), apoio_mm=0.0, foco_luz=(0, 0, 0.9),
                 camera_video=((4.0, -2.83, 1.16), (0, 0.10, 0.86), 50), info=None, apoios=(), afunda_apoio_mm=20.0):
        self.pose = pose                        # pose(t): 0 = começo do movimento, 1 = fim (o app faz a volta)
        self.equipamentos = list(equipamentos)  # objetos do equipamento (raiz de cada um), animados junto
        self.pegadas = list(pegadas)            # [(lado, checagem3d.Barra)] — mãos que seguram o equipamento
        self.apoio_mm = apoio_mm                # equipamento pode apoiar no corpo até essa profundidade (barra nas costas)
        self.foco_luz = Vector(foco_luz)        # pra onde o estúdio de luz aponta (vídeo)
        self.camera_video = camera_video        # (posição, alvo, lente) da câmera do vídeo
        self.info = info or (lambda: "")        # texto de diagnóstico do quadro atual (punho, vão da mão…)
        self.apoios = list(apoios)              # onde o corpo se apoia (banco): encostar é o certo, fica fora da
        self.afunda_apoio_mm = afunda_apoio_mm  # folga do peso; a pele pode afundar no estofado até esse tanto
