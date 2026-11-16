"""Leitura do sensor na conta da chance — **regra escolhida pelo grupo, não treinada** (ADR 0006).

Por que regra? Não existe histórico de leituras de sensor (``nivelAgua``) para treinar: os
sensores são novos e, no TCC, simulados. O modelo aprende só com chuva + características do
ponto; o sensor entra depois, por uma regra transparente e testada. É a mesma conta do app
(``chanceComSensor`` e ``fatorDaAgua``, em ``app/src/dados/demo.js``), para o mesmo bueiro dar o
mesmo número no simulador do app e no ``POST /predict``.

Regras (valores em ``src/config.py`` → ``AJUSTE_SENSOR``):

1. A água no bueiro vira um **fator** (tabela ``fator_por_nivel_agua``): até 50 % o fator é 1;
   2,5 em 65 %; 7 em 80 %; 12 a partir de 99 %. Entre duas linhas da tabela o fator cresce em
   escala logarítmica.
2. O fator multiplica a **razão de chances** do modelo, ``p / (1 − p)``, e não a chance direto:
   assim o resultado nunca passa de 100 %. Com chance pequena, o efeito é quase o próprio fator.
3. O nível final sai da chance ajustada, pelos limiares do modelo, com teto em ALTO
   (``niveis.nivel_previsto``). O sensor nunca diminui a chance nem o nível.
4. ``nivelAgua >= 100 %`` → **medição** "transbordando agora": nível CRITICO e
   ``medicao_transbordando = True``. É o único caminho para CRITICO.
5. Sem leitura (sensor INATIVO/MANUTENÇÃO ou campo ausente): fator 1, a chance é a do modelo e
   ``sem_leitura = True`` (o app mostra "sem leitura do sensor").
6. Sem probabilidade (modo regras, ADR 0004): não há chance para multiplicar, mas a leitura de
   água continua contando para o nível. ``nivelAgua >= 80 %`` (``nivel_agua_alerta_regras``)
   sobe um nível, até ALTO; é a regra que o serviço já usava. O fator vem ``None``. A medição
   de transbordamento (regra 4) vale igual.

O sensor não mede lixo, e a chuva é do próprio serviço: a regra só usa a água.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from src.config import AJUSTE_SENSOR
from src.niveis import (
    NIVEL_MAXIMO,
    NivelRisco,
    maior_nivel,
    menor_nivel,
    nivel_previsto,
    subir_nivel,
)


@dataclass
class ResultadoAjuste:
    nivel_final: NivelRisco
    nivel_modelo: NivelRisco
    probabilidade_final: float | None = None  # depois do sensor
    probabilidade_modelo: float | None = None  # só chuva e lugar
    fator_sensor: float | None = None  # None quando não há chance (modo regras)
    medicao_transbordando: bool = False
    ajuste_aplicado: bool = False  # True = a leitura do sensor subiu o NÍVEL
    sem_leitura: bool = False
    motivos: list[str] = field(default_factory=list)


def fator_da_agua(nivel_agua: float | None, tabela=AJUSTE_SENSOR["fator_por_nivel_agua"]) -> float:
    """Quantas vezes a leitura de água multiplica a razão de chances (1 = não muda nada)."""
    valor = 0.0 if nivel_agua is None else float(nivel_agua)
    if valor <= tabela[0][0]:
        return float(tabela[0][1])
    for (x0, f0), (x1, f1) in zip(tabela, tabela[1:], strict=False):
        if valor <= x1:
            fracao = (valor - x0) / (x1 - x0)
            return math.exp(math.log(f0) + (math.log(f1) - math.log(f0)) * fracao)
    return float(tabela[-1][1])


def chance_com_fator(probabilidade: float, fator: float) -> float:
    """Aplica o fator sobre a razão de chances ``p / (1 − p)``; o resultado fica em [0, 1]."""
    if fator == 1 or probabilidade <= 0:
        return probabilidade
    if probabilidade >= 1:
        return 1.0
    razao = probabilidade / (1 - probabilidade) * fator
    return razao / (1 + razao)


def _num(valor: float, casas: int = 1) -> str:
    return f"{valor:.{casas}f}".replace(".", ",")


def ajustar_por_sensor(
    probabilidade_modelo: float | None,
    nivel_modelo: NivelRisco,
    nivel_agua: float | None,
    limiares: dict | None = None,
    regras: dict = AJUSTE_SENSOR,
) -> ResultadoAjuste:
    """Aplica a leitura do sensor sobre a chance do modelo (ver docstring do módulo).

    ``nivel_modelo`` é o nível só pela chuva e pelo lugar (já com teto em ALTO). ``limiares``
    são os do modelo, usados para tirar o nível da chance ajustada. No modo regras não há chance
    nem limiares: a água alta sobe um nível (regra 6).
    """
    resultado = ResultadoAjuste(nivel_final=nivel_modelo, nivel_modelo=nivel_modelo,
                                probabilidade_final=probabilidade_modelo,
                                probabilidade_modelo=probabilidade_modelo)
    tem_chance = probabilidade_modelo is not None and limiares is not None
    if nivel_agua is None:
        resultado.sem_leitura = True
        resultado.fator_sensor = 1.0 if tem_chance else None
        return resultado

    fator = fator_da_agua(nivel_agua, regras["fator_por_nivel_agua"])
    if tem_chance:
        resultado.fator_sensor = fator
        resultado.probabilidade_final = chance_com_fator(probabilidade_modelo, fator)
        resultado.nivel_final = maior_nivel(nivel_modelo,
                                            nivel_previsto(resultado.probabilidade_final, limiares))
        if fator > 1:
            resultado.motivos.append(
                f"nivelAgua {nivel_agua:.0f}%: chance multiplicada por {_num(fator)} "
                "(regra do grupo, sobre a razão de chances)")
    elif regras["nivel_agua_alerta_regras"] <= nivel_agua < regras["nivel_agua_transbordando"]:
        # Modo regras: sem chance para multiplicar, a água alta sobe um nível (até ALTO).
        resultado.nivel_final = maior_nivel(
            nivel_modelo, menor_nivel(subir_nivel(nivel_modelo), NIVEL_MAXIMO))
        resultado.motivos.append(
            f"nivelAgua {nivel_agua:.0f}% >= {regras['nivel_agua_alerta_regras']:.0f}%: "
            "sobe um nível, até ALTO (modo regras, sem chance para multiplicar)")

    if nivel_agua >= regras["nivel_agua_transbordando"]:
        resultado.nivel_final = NivelRisco.CRITICO
        resultado.medicao_transbordando = True
        resultado.motivos.append(
            f"nivelAgua {nivel_agua:.0f}% >= {regras['nivel_agua_transbordando']:.0f}%: "
            "transbordando agora (medido)")

    resultado.ajuste_aplicado = resultado.nivel_final != nivel_modelo
    return resultado
