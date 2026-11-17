// Testes do que a área do administrador calcula. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";

import { bueiroMaisProximo, filtrarSensores, normalizarRelatoDaFila, textoDaDistancia } from "./admin.js";

const PONTOS = [
  { id: "137", codigo: "bueiro_01", endereco: "Marginal Tietê", bairro: "Vila Maria / Vila Guilherme", lat: -23.527245, lon: -46.596878, statusSensor: "ATIVO" },
  { id: "2", codigo: "SE-02", endereco: "Av. Tiradentes", bairro: "Sé", lat: -23.5329, lon: -46.6395, statusSensor: "ATIVO" },
  { id: "3", codigo: "SE-03", endereco: "Av. Paulista", bairro: "Sé", lat: -23.5613, lon: -46.6565, statusSensor: "MANUTENCAO" },
];

test("item da fila: do backend para o app; a foto fica como caminho (precisa do token)", () => {
  const relato = normalizarRelatoDaFila({ id: 4, tipo: "ALAGAMENTO", descricao: "Água na rua", latitude: "-23.532900", longitude: "-46.639500", situacao: "PENDENTE",
    emailAutor: "ana@exemplo.com", dataCriacao: "2026-11-16T14:00:00-03:00", fotoUrl: "/admin/ocorrencias/4/foto" });
  assert.deepEqual([relato.id, relato.lat, relato.lon, relato.foto], ["4", -23.5329, -46.6395, "/admin/ocorrencias/4/foto"]);
  assert.equal(normalizarRelatoDaFila({ id: 5, tipo: "OUTRO", fotoUrl: null }).foto, null);
  assert.equal(normalizarRelatoDaFila({ tipo: "OUTRO" }), null);
});

test("bueiro mais perto de um relato", () => {
  const perto = bueiroMaisProximo(PONTOS, -23.5331, -46.6395);
  assert.equal(perto.ponto.codigo, "SE-02");
  assert.ok(perto.metros > 10 && perto.metros < 40);
  assert.equal(bueiroMaisProximo([], -23.5, -46.6), null);
  assert.equal(bueiroMaisProximo(PONTOS, null, null), null);
});

test("distância em palavras", () => {
  assert.equal(textoDaDistancia(4), "no mesmo lugar");
  assert.equal(textoDaDistancia(124), "a 120 m");
  assert.equal(textoDaDistancia(1430), "a 1,4 km");
});

test("lista de sensores: sem texto, o de bancada e os que não estão ativos; com texto, os que batem", () => {
  assert.deepEqual(filtrarSensores(PONTOS, "").map((p) => p.codigo), ["bueiro_01", "SE-03"]);
  assert.deepEqual(filtrarSensores(PONTOS, "tiradentes").map((p) => p.codigo), ["SE-02"]);
  assert.deepEqual(filtrarSensores(PONTOS, "sé", { limite: 1 }).map((p) => p.codigo), ["SE-02"]);
});
