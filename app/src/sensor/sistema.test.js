// Testes do "o que o sistema diz" do painel do sensor. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { CONFIG } from "../config.js";
import { normalizarPrevisao } from "../dados/modelo.js";
import { normalizarAlerta } from "../dados/alertas.js";
import { buscarNoSistema, resumoDoSistema } from "./sistema.js";

const AGORA = new Date("2026-11-16T14:00:00-03:00");
const ITEM = {
  sensorId: 137, latitude: -23.527245, longitude: -46.596878, vizinhanca: "Marginal Tietê — Vila Maria / Vila Guilherme", status: "VALIDA",
  probabilidadeAlagamento: 0.031, nivelRisco: "ALTO", nivelRiscoModelo: "MEDIO", janelaHoras: 3, geradaEm: "2026-11-16T13:58:00-03:00",
  validaAte: "2026-11-16T14:28:00-03:00", semLeituraSensor: false, origem: "MODELO", nivelAgua: 62.5, distanciaCm: 35,
  dataLeitura: "2026-11-16T13:59:00-03:00", statusSensor: "ATIVO", codigo: "bueiro_01",
};

test("medido e previsto em linhas separadas", () => {
  const resumo = resumoDoSistema({ ponto: normalizarPrevisao(ITEM), alerta: null }, AGORA);
  assert.equal(resumo.medido, "Água em 63%, leitura há 1 min");
  assert.equal(resumo.previsto, "Risco alto · 3,1% de chance de alagar nas próximas 3 h");
  assert.equal(resumo.alerta, null);
});

test("com alerta, leitura velha e previsão vencida", () => {
  const ponto = normalizarPrevisao({ ...ITEM, dataLeitura: "2026-11-16T12:00:00-03:00", validaAte: "2026-11-16T13:30:00-03:00" });
  const alerta = normalizarAlerta({ id: 1, sensorId: 137, nivelRisco: "CRITICO", criadoEm: "2026-11-16T13:40:00-03:00" });
  const resumo = resumoDoSistema({ ponto, alerta }, AGORA);
  assert.equal(resumo.medido, "Sem leitura recente (a última foi há 2 h)");
  assert.equal(resumo.alerta, "Alerta ativo desde as 13:40: o sensor mediu o bueiro cheio.");
  assert.equal(resumo.previsto, "Previsão desatualizada (a última foi às 13:58).");
});

test("acha o sensor de bancada pelo código e pega as medidas do bueiro", async () => {
  const servidor = http.createServer((req, res) => {
    const responder = (json) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
    if (req.url === "/previsoes") return responder([{ ...ITEM, sensorId: 2, codigo: "SE-02" }, ITEM]);
    if (req.url === "/alertas?status=ATIVO") return responder([{ id: 9, sensorId: 137, nivelRisco: "CRITICO", criadoEm: "2026-11-16T13:40:00-03:00" }]);
    if (req.url === "/sensores/137") return responder({ id: 137, codigo: "bueiro_01", profundidadeCm: 58, distanciaCheioCm: 24 });
    res.writeHead(404); res.end();
  });
  await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const antes = CONFIG.urlApi;
  CONFIG.urlApi = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const achado = await buscarNoSistema("BUEIRO_01");
    assert.equal(achado.ponto.id, "137");
    assert.equal(achado.alerta.id, "9");
    assert.deepEqual(achado.medidas, { profundidade: 58, cheio: 24 });
    assert.equal(await buscarNoSistema("nao_existe"), null);
  } finally {
    CONFIG.urlApi = antes;
    await new Promise((pronto) => servidor.close(pronto));
  }
});
