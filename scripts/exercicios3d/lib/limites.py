# Amplitude articular normal (graus) usada na checagem de TODO quadro: nenhuma junta do boneco passa disso.
# Fonte: Norkin CC, White DJ. Measurement of Joint Motion: A Guide to Goniometry (valores de referência da AAOS —
# American Academy of Orthopaedic Surgeons). Ângulo medido entre os segmentos (0 = alinhado/em pé).
# O quadril tem folga de 10° sobre os 120° da AAOS: no agachamento a pelve inclina junto com o tronco e o ângulo
# coxa × tronco soma as duas coisas (a amplitude da articulação em si continua dentro dos 120°).
JUNTAS = {
    "joelho": (0, 145),          # flexão (AAOS 0–135; até ~145 com a panturrilha comprimindo)
    "cotovelo": (0, 150),        # flexão
    "quadril": (0, 130),         # flexão coxa × tronco (ver nota acima)
    "ombro": (0, 180),           # flexão/abdução do braço em relação ao tronco
    "pescoco": (0, 50),          # flexão/extensão da cabeça em relação ao tronco (AAOS 45/45)
    "punho": (0, 55),            # desvio total da mão em relação ao antebraço (flexão 80, extensão 70, radial 20,
                                 # ulnar 30 — 55 é o teto prático pra mão segurando peso sem dobrar o punho)
}
