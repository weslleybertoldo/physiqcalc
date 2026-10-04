# O boneco do Physiq, sempre com a mesma receita (cenas, boneco do app e prova): corpo atlético + cabelo curto +
# sobrancelhas + anatomia v4 (relevo suave), músculo alvo em vermelho e auxiliares em vermelho claro.
# Decisões do Weslley (03/10/2026): "Só com cabelo. Sem short."; relevo "2 = suave"; auxiliares em vermelho claro.
import boneco3d as b3
import anatomia3d as an
import cabelo3d as cb


def criar(alvos=(), secundarios=()):
    b3.MACRO.update({"muscle": 1.0, "weight": 0.25})
    b3.limpar_cena()
    bon = b3.Boneco()
    an.corpo_atletico(bon)
    cb.por_cabelo(bon, "short02")
    cb.por_sobrancelhas(bon)
    an.visual_v4(bon, alvos=list(alvos), secundarios=list(secundarios))
    return bon
