# ADR 0004 — Serviço sobe em "modo regras" sem modelo

- **Status:** Aceito
- **Data:** 16/09/2026

## Contexto
O backend precisa ser integrado (dias 14–15) mesmo se o modelo atrasar. O briefing diz que o
serviço de tempo real nunca é cortado.

## Decisão
Sem `models/flood_lgbm_<versao>.joblib`, o serviço usa o baseline de regras de chuva acumulada
(o mesmo do TCC), responde com `origem = "REGRAS"` e `modeloVersao = "regras-v0"` e **não
inventa probabilidade** (`probabilidadeAlagamento = null`). O ajuste do sensor continua
valendo.

> **Atualização (16/11/2026, ADR 0006):** o modo regras vai no máximo até ALTO. Como a leitura do
> sensor agora entra na chance e aqui não há chance, ela só muda o resultado quando o bueiro
> transborda (CRITICO, medido); `fatorSensor` vem `null` e a resposta traz um aviso.

## Consequências
- A integração e a demo podem avançar em paralelo ao treino.
- O backend e o app precisam tratar a probabilidade nula (mostrar só o nível).
