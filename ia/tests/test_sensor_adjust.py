"""Regra do sensor (ADR 0006): fator da água sobre a razão de chances; crítico só por medição."""

import math

import pytest

from src.niveis import NivelRisco as N
from src.niveis import nivel_previsto
from src.sensor_adjust import ajustar_por_sensor, chance_com_fator, fator_da_agua

# Limiares do modelo v1 (models/thresholds_v1.json). O CRITICO fica no arquivo só como histórico.
LIM_V1 = {"MEDIO": 0.004064554692169755, "ALTO": 0.011904761904761904, "CRITICO": 0.25}


def _ajustar(p, agua, limiares=LIM_V1):
    return ajustar_por_sensor(p, nivel_previsto(p, limiares), agua, limiares)


# --- o fator -------------------------------------------------------------------------------


def test_agua_ate_a_metade_nao_muda_nada():
    for agua in (0, 30, 40, 50):
        r = _ajustar(0.006, agua)
        assert r.fator_sensor == 1
        assert r.probabilidade_final == r.probabilidade_modelo == 0.006
        assert r.nivel_final == r.nivel_modelo == N.MEDIO
        assert not r.ajuste_aplicado and not r.motivos and not r.medicao_transbordando


def test_fatores_da_tabela():
    assert math.isclose(fator_da_agua(65), 2.5)
    assert math.isclose(fator_da_agua(80), 7)
    assert math.isclose(fator_da_agua(99), 12)
    assert fator_da_agua(100) == fator_da_agua(150) == 12
    assert fator_da_agua(None) == 1


def test_fator_cresce_e_nunca_diminui():
    anterior = fator_da_agua(0)
    for agua in range(1, 201):
        atual = fator_da_agua(agua)
        assert atual >= anterior, agua
        anterior = atual


def test_chance_nunca_passa_de_um():
    for p in (0.0, 1e-6, 0.01, 0.3, 0.9, 0.999999, 1.0):
        for agua in (65, 80, 99, 100, 200):
            final = _ajustar(p, agua).probabilidade_final
            assert 0 <= final <= 1
            assert final >= p  # o sensor nunca diminui a chance
    assert chance_com_fator(1.0, 12) == 1.0
    assert chance_com_fator(0.0, 12) == 0.0


def test_fator_e_sobre_a_razao_de_chances():
    p = 0.02
    esperado = (p / (1 - p) * 7) / (1 + p / (1 - p) * 7)
    r = _ajustar(p, 80)
    assert math.isclose(r.probabilidade_final, esperado)
    assert math.isclose(r.fator_sensor, 7)
    assert len(r.motivos) == 1 and "nivelAgua 80%" in r.motivos[0]


# --- mesmos casos do app ----------------------------------------------------------------------
# Valores obtidos rodando o código do app (app/src/dados/demo.js, fatorDaAgua e preverComSensor)
# com o Node, no commit b43a51f. Se a tabela mudar num lado, este teste avisa.

CASOS_FATOR_APP = [
    (0, 1), (30, 1), (50, 1), (57.5, 1.5811388300841898), (65, 2.5), (72, 4.042162387555854),
    (80, 7), (82, 7.408638044977852), (90, 9.296077322148212), (99, 12), (99.5, 12), (100, 12),
    (120, 12),
]

# (chance só pela chuva e pelo lugar, água %, chance com o sensor no app)
CASOS_CHANCE_APP = [
    (0.018, 40, 0.018),
    (0.018, 65, 0.043816942551119765),
    (0.018, 80, 0.11371841155234656),
    (0.018, 99, 0.18030050083472454),
    (0.3, 99, 0.8372093023255814),
    (0.9, 99, 0.9908256880733946),
    (0.0007, 72, 0.0028235009873356686),
]


@pytest.mark.parametrize("agua,fator", CASOS_FATOR_APP)
def test_mesmo_fator_do_app(agua, fator):
    assert math.isclose(fator_da_agua(agua), fator, rel_tol=1e-12)


@pytest.mark.parametrize("p,agua,esperada", CASOS_CHANCE_APP)
def test_mesma_chance_do_app(p, agua, esperada):
    assert math.isclose(_ajustar(p, agua).probabilidade_final, esperada, rel_tol=1e-12)


def test_sem_leitura_no_app_e_aqui():
    """No app, chanceComSensor(0.02, { agua: null }) devolve 0,02."""
    r = _ajustar(0.02, None)
    assert r.probabilidade_final == 0.02 and r.fator_sensor == 1 and r.sem_leitura


# --- níveis ---------------------------------------------------------------------------------


def test_nivel_sai_da_chance_ajustada():
    # 0,005 é MEDIO no v1; com água em 80 % (fator 7) passa de 1,19 % e vira ALTO
    r = _ajustar(0.005, 80)
    assert r.nivel_modelo == N.MEDIO and r.nivel_final == N.ALTO and r.ajuste_aplicado
    # com água em 65 % (fator 2,5) chega a ~1,25 %: também ALTO
    assert _ajustar(0.005, 65).nivel_final == N.ALTO
    # com água em 55 % não chega
    r = _ajustar(0.005, 55)
    assert r.fator_sensor > 1 and r.nivel_final == N.MEDIO and not r.ajuste_aplicado
    assert r.motivos  # a chance mudou, mesmo sem mudar o nível


def test_chance_acima_do_antigo_limiar_critico_continua_alto():
    """#23: a previsão vai até ALTO, mesmo com a chance ajustada acima de 25 %."""
    r = _ajustar(0.30, 99)
    assert r.probabilidade_final > 0.8
    assert r.nivel_modelo == N.ALTO and r.nivel_final == N.ALTO
    assert not r.medicao_transbordando and not r.ajuste_aplicado


def test_sem_leitura_e_chance_alta_fica_alto():
    r = _ajustar(0.6, None)
    assert r.sem_leitura and r.nivel_final == N.ALTO and r.probabilidade_final == 0.6


@pytest.mark.parametrize("agua", [100, 100.0, 120, 200])
def test_transbordando_e_medicao_e_unico_caminho_para_critico(agua):
    r = _ajustar(0.001, agua)
    assert r.nivel_final == N.CRITICO and r.medicao_transbordando
    assert r.nivel_modelo == N.BAIXO and r.ajuste_aplicado
    assert r.fator_sensor == 12
    assert any("transbordando agora (medido)" in m for m in r.motivos)


def test_nenhuma_chance_sem_medicao_vira_critico():
    for i in range(0, 1001):
        p = i / 1000
        for agua in (None, 0, 50, 65, 80, 99, 99.9):
            assert _ajustar(p, agua).nivel_final != N.CRITICO, (p, agua)


# --- modo regras (sem probabilidade) ----------------------------------------------------------


def test_modo_regras_sem_chance_so_a_medicao_muda():
    r = ajustar_por_sensor(None, N.MEDIO, 85, None)
    assert r.probabilidade_final is None and r.fator_sensor is None
    assert r.nivel_final == N.MEDIO and not r.ajuste_aplicado
    r = ajustar_por_sensor(None, N.MEDIO, 100, None)
    assert r.nivel_final == N.CRITICO and r.medicao_transbordando and r.ajuste_aplicado


def test_modo_regras_sem_leitura():
    r = ajustar_por_sensor(None, N.ALTO, None, None)
    assert r.sem_leitura and r.fator_sensor is None and r.nivel_final == N.ALTO
