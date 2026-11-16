# ADR 0006 — Leitura do sensor na chance e nível crítico só por medição

- **Status:** Aceito (decisões do grupo registradas nas issues #22 e #23)
- **Data:** 16/11/2026
- **Substitui:** a recomendação R5 (o sensor mudava só o nível) e o uso do limiar CRITICO do modelo
- **Relacionadas:** ADR 0001 (contrato), ADR 0004 (modo regras), ADR 0005 (alerta por região)

## Contexto

Até aqui havia duas regras diferentes para o sensor, e o mesmo bueiro podia mostrar um resultado
na demonstração do app e outro com dados reais:

| | App (demonstração e simulador) | Serviço de IA (`v1`) |
|---|---|---|
| O que a leitura muda | a **chance** | só o **nível**; a chance ficava a do modelo (R5) |
| Água até 50 % | nada | nada |
| Água alta | 65 %: chance × 2,5 · 80 %: × 7 · quase cheio: × 12 | 80 % ou mais: sobe um nível |
| Água em 100 % | transbordando agora (medido) | crítico e transbordando agora (medido) |
| Lixo | removido | 60 % ou mais, com chuva, sobe um nível |

O grupo decidiu que **o sensor entra na conta da previsão** e que **ele mede só água**. Decidiu
também que **o alerta nasce da leitura do sensor**, não da previsão.

Além disso, na prática o modelo não tem nível crítico. A meta do limiar CRITICO (precisão de 50 %
na validação) foi inalcançável, e o treino usou o maior corte (`models/thresholds_v1.json`:
"CRITICO: precisão-alvo inalcançável; usado o maior corte"). Com o limiar de 0,25, o nível
apareceu em 0,0013 % das horas da validação e em 0,0009 % das horas do teste 2024–2025, e no
teste acertou 4,8 % das vezes (na Zona Norte, nenhuma) — `models/metadata_v1.json`.

## Decisão

### 1. Uma regra só para o sensor: fator sobre a chance

A mesma conta do app (`chanceComSensor` e `fatorDaAgua`, em `app/src/dados/demo.js`), agora em
`src/sensor_adjust.py`, com a tabela em `src/config.py` (`AJUSTE_SENSOR`):

| Água no bueiro | até 50 % | 65 % | 80 % | 99 % ou mais |
|---|---|---|---|---|
| Fator | 1 | 2,5 | 7 | 12 |

- Entre duas linhas, o fator cresce em escala logarítmica.
- O fator multiplica a **razão de chances** `p / (1 − p)` do modelo, não a chance direto. Assim o
  resultado nunca passa de 100 %. Com chance pequena (o caso comum), o efeito é quase o próprio
  fator.
- O nível final sai da chance ajustada, pelos limiares do modelo. O sensor nunca diminui a chance
  nem o nível.
- Água em 100 % continua sendo **medição**: "transbordando agora", nível CRITICO.
- Sem leitura (sensor inativo, em manutenção ou campo ausente): fator 1 e `semLeituraSensor`.

**Os pesos são escolha do grupo, não aprendizado.** Não existe histórico de leituras de sensor
para treinar: os sensores são novos e, no TCC, simulados. Treinar com as leituras da
demonstração também não serviria, porque elas saem desta mesma regra: o modelo só aprenderia de
volta o que foi escolhido. Quando houver leituras reais acumuladas, com registro de quando
alagou, este é o ponto que o treino substitui.

### 2. Sem lixo e sem `chuvaMm`

`porcentagemLixo` e `chuvaMm` saem da requisição de `POST /predict`, e com eles a fonte de chuva
`INFORMADA_LEGADO`. A requisição **ignora campos que não conhece**, então o backend pode continuar
mandando os dois até ser atualizado (#18). `chuva` (resumo) e `chuvaHoraria` continuam.

### 3. Resposta

- `probabilidadeAlagamento` passa a ser a chance **depois** do sensor.
- Campos novos: `probabilidadeModelo` (só chuva e lugar) e `fatorSensor`. Com eles o app pode dizer
  "só pela chuva e pelo lugar seria 0,3 %; a leitura do sensor levou a 2,2 %".
- Continuam: `nivelRiscoModelo`, `ajusteSensorAplicado` (a leitura subiu o **nível**),
  `motivosAjuste` e `medicaoTransbordando`.

### 4. CRITICO só por medição

- A previsão vai de BAIXO a ALTO. Uma chance acima de 0,25 — do modelo ou depois do sensor —
  continua ALTO (`niveis.nivel_previsto`).
- CRITICO só sai quando a leitura do sensor indica: hoje, água em 100 % (`medicaoTransbordando`).
- O aviso por região (`/predict/regioes`) usa os pontos do modelo, sem sensor: vai até ALTO.
  O limiar CRITICO de região (0,176, com precisão de 35 % e recall de 1,2 % na validação) também
  deixa de ser usado, para a região seguir a mesma escala.
- O modo regras (ADR 0004) segue a mesma ideia: vai até ALTO.
- `thresholds_v1.json` e `thresholds_regiao_v1.json` **mantêm** o valor de CRITICO, para o
  histórico do treino. O serviço deixa de usá-lo; isso fica registrado em `uso_no_servico` nos
  limiares e nos metadados, e no `/model-info` (`limiaresEmUso`, `nivelMaximoPrevisao`). O enum
  não muda.

### 5. Modo regras

Sem modelo não há chance para multiplicar. A leitura de água só muda o resultado quando o bueiro
transborda; `probabilidadeAlagamento`, `probabilidadeModelo` e `fatorSensor` vêm `null`, e a
resposta traz um aviso. Antes, água ≥ 80 % subia um nível também no modo regras.

## Consequências

- O mesmo bueiro, com a mesma chuva e a mesma leitura, dá a mesma chance no simulador do app e no
  `POST /predict`. Os casos do app estão copiados em `tests/test_sensor_adjust.py`; se a tabela
  mudar de um lado, o teste avisa.
- **`probabilidadeAlagamento` deixa de ser a probabilidade calibrada.** A calibrada é
  `probabilidadeModelo`. Brier, curva de calibração e demais métricas do TCC continuam se
  referindo a ela.
- Um alerta CRITICO passa a significar sempre "medido". Isso combina com a regra de alertas do
  backend (#13): o alerta nasce da leitura.
- O backend precisa guardar `probabilidadeModelo` e `fatorSensor` e parar de mandar lixo e chuva
  (#18). Até lá, os campos novos são ignorados pelo DTO (`ignoreUnknown`) e os antigos, pelo
  serviço.
- Sem Open-Meteo e sem cache, `chuvaMm` não serve mais de chuva: a resposta é 503
  `CHUVA_INDISPONIVEL`, como já acontecia sem `chuvaMm`.
- O app precisa seguir as duas regras na demonstração e na tela "Como a IA funciona" (#40): hoje
  ele ainda mostra crítico pela chance.
