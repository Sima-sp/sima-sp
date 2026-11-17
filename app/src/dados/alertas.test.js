// Testes dos alertas do sensor. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";

import { alertasDaDemo, juntarAlertas, normalizarAlerta, resumoDosAlertas, textoDoAlerta } from "./alertas.js";

const ITEM = { id: 7, sensorId: 137, codigo: "bueiro_01", vizinhanca: "Marginal Tietê — Vila Maria / Vila Guilherme", latitude: -23.527245,
  longitude: -46.596878, nivelRisco: "CRITICO", status: "ATIVO", mensagem: "Bueiro bueiro_01 transbordando.", criadoEm: "2026-11-16T14:20:00-03:00", resolvidoEm: null };

test("alerta do backend vira o formato do app", () => {
  const alerta = normalizarAlerta(ITEM);
  assert.equal(alerta.id, "7");
  assert.equal(alerta.sensorId, "137");
  assert.equal(alerta.nivel, 4);
  assert.equal(alerta.endereco, "Marginal Tietê");
  assert.equal(alerta.bairro, "Vila Maria / Vila Guilherme");
  assert.equal(alerta.desde.toISOString(), "2026-11-16T17:20:00.000Z");
  assert.equal(textoDoAlerta(alerta), "Em alerta desde as 14:20 · medido pelo sensor");
});

test("alerta sem id ou sem sensor é ignorado; sem data, o texto não inventa hora", () => {
  assert.equal(normalizarAlerta({ ...ITEM, id: null }), null);
  assert.equal(normalizarAlerta({ ...ITEM, sensorId: undefined }), null);
  assert.equal(normalizarAlerta(null), null);
  assert.equal(textoDoAlerta(normalizarAlerta({ ...ITEM, criadoEm: null })), "Em alerta · medido pelo sensor");
});

test("cada ponto recebe o alerta do sensor dele; os outros ficam com null", () => {
  const pontos = [{ id: "137", codigo: "bueiro_01" }, { id: "2", codigo: "SE-02" }];
  const juntos = juntarAlertas(pontos, [normalizarAlerta(ITEM)]);
  assert.equal(juntos[0].alerta.id, "7");
  assert.equal(juntos[1].alerta, null);
  assert.equal(pontos[0].alerta, undefined); // não mexe na lista original
});

test("demonstração: só os bueiros transbordando viram alerta", () => {
  const leituraEm = new Date("2026-11-16T17:00:00Z");
  const alertas = alertasDaDemo([
    { id: "a", codigo: "VG-01", bairro: "Vila Guilherme", medicaoTransbordando: true, leituraEm },
    { id: "b", codigo: "VG-02", bairro: "Vila Guilherme", medicaoTransbordando: false, nivel: 3 },
  ]);
  assert.equal(alertas.length, 1);
  assert.deepEqual([alertas[0].id, alertas[0].sensorId, alertas[0].desde], ["demo-a", "a", leituraEm]);
});

test("resumo para o aviso do mapa", () => {
  assert.equal(resumoDosAlertas([]), null);
  assert.equal(resumoDosAlertas([{}]), "1 bueiro em alerta agora");
  assert.equal(resumoDosAlertas([{}, {}, {}]), "3 bueiros em alerta agora");
});
