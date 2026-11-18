// Testes da viagem seguindo o GPS, com posições de mentira. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";

import { acompanharGps, comecarGps, encaixarNoCaminho, textoDoErroDoGps } from "./gps.js";
import { prepararViagem } from "./viagem.js";

// Um caminho em L perto da Etec: 1 km para o leste e depois 500 m para o norte.
const M = 111320; // metros por grau de latitude
const LAT = -23.5;
const COS = Math.cos((LAT * Math.PI) / 180);
const deslocar = (leste, norte) => [-46.6 + leste / (M * COS), LAT + norte / M];
const CAMINHO = [deslocar(0, 0), deslocar(500, 0), deslocar(1000, 0), deslocar(1000, 250), deslocar(1000, 500)];
const VIAGEM = prepararViagem({ caminho: CAMINHO, minutos: 3 });

/** Uma leitura do GPS `leste` e `norte` metros da partida, no instante `s` segundos. */
const gps = (leste, norte, s, extra = {}) => {
  const [lon, lat] = deslocar(leste, norte);
  return { lon, lat, precisao: 8, quando: s * 1000, ...extra };
};

test("o caminho de teste tem 1,5 km", () => {
  assert.ok(Math.abs(VIAGEM.metros - 1500) < 1);
});

test("encaixe: em cima da rota, 20 m ao lado e 200 m fora", () => {
  const emCima = encaixarNoCaminho(VIAGEM, deslocar(300, 0));
  assert.ok(Math.abs(emCima.metro - 300) < 0.5 && emCima.distancia < 0.5);
  const aoLado = encaixarNoCaminho(VIAGEM, deslocar(300, 20));
  assert.ok(Math.abs(aoLado.metro - 300) < 0.5 && Math.abs(aoLado.distancia - 20) < 0.5);
  const fora = encaixarNoCaminho(VIAGEM, deslocar(300, 200));
  assert.ok(Math.abs(fora.distancia - 200) < 0.5);
  // Depois da curva: 1000 m para o leste + 100 m para o norte = metro 1100.
  assert.ok(Math.abs(encaixarNoCaminho(VIAGEM, deslocar(1010, 100)).metro - 1100) < 0.5);
});

test("encaixe respeita o trecho pedido", () => {
  const soDepois = encaixarNoCaminho(VIAGEM, deslocar(300, 0), 600, 1500);
  assert.ok(Math.abs(soDepois.metro - 600) < 0.5, "o mais perto dentro do trecho é o começo dele");
  assert.ok(Math.abs(soDepois.distancia - 300) < 0.5);
});

test("andando pela rota, 20 m ao lado: o carro acompanha e não é 'fora da rota'", () => {
  let estado = comecarGps();
  for (let s = 0; s <= 30; s++) estado = acompanharGps(estado, VIAGEM, gps(s * 10, 20, s));
  assert.ok(Math.abs(estado.metro - 300) < 0.5);
  assert.equal(estado.fora, false);
});

test("o carro nunca anda para trás com o ruído do GPS", () => {
  let estado = comecarGps();
  estado = acompanharGps(estado, VIAGEM, gps(400, 0, 0));
  const [frente] = [estado.metro];
  // Parado no semáforo, o GPS "dança" 10 m para trás e para a frente.
  for (let s = 1; s <= 20; s++) {
    estado = acompanharGps(estado, VIAGEM, gps(400 + (s % 2 ? -10 : 3), s % 3, s));
    assert.ok(estado.metro >= frente, `voltou no segundo ${s}`);
  }
  assert.ok(estado.metro - frente <= 3.5);
});

test("200 m fora por 5 s: pede caminho novo; um ponto isolado longe, não", () => {
  let estado = comecarGps();
  estado = acompanharGps(estado, VIAGEM, gps(300, 0, 0));
  // Um pulo do GPS: um ponto longe e volta.
  estado = acompanharGps(estado, VIAGEM, gps(300, 200, 1));
  assert.equal(estado.fora, false);
  estado = acompanharGps(estado, VIAGEM, gps(310, 0, 2));
  assert.equal(estado.foraDesde, null);
  // Agora saiu de verdade: 5 s seguidos a 200 m.
  for (let s = 3; s <= 7; s++) estado = acompanharGps(estado, VIAGEM, gps(310, 200, s));
  assert.equal(estado.fora, false, "4 s ainda não bastam");
  estado = acompanharGps(estado, VIAGEM, gps(310, 200, 8));
  assert.equal(estado.fora, true);
  assert.ok(Math.abs(estado.metro - 310) < 0.5, "fora da rota o carro não anda no caminho");
});

test("sinal fraco: não conta para fora da rota e avisa depois de 10 s", () => {
  let estado = comecarGps();
  for (let s = 0; s <= 9; s++) estado = acompanharGps(estado, VIAGEM, gps(100, 300, s, { precisao: 120 }));
  assert.equal(estado.fora, false);
  assert.equal(estado.sinalFraco, false);
  assert.equal(estado.metro, 0, "posição imprecisa não move o carro");
  estado = acompanharGps(estado, VIAGEM, gps(100, 300, 10, { precisao: 120 }));
  assert.equal(estado.sinalFraco, true);
  estado = acompanharGps(estado, VIAGEM, gps(100, 0, 11));
  assert.equal(estado.sinalFraco, false, "o sinal voltou");
});

test("GPS que volta bem mais à frente (túnel) é achado no resto do caminho", () => {
  let estado = comecarGps();
  estado = acompanharGps(estado, VIAGEM, gps(50, 0, 0));
  estado = acompanharGps(estado, VIAGEM, gps(1000, 300, 60));
  assert.ok(Math.abs(estado.metro - 1300) < 0.5);
  assert.equal(estado.fora, false);
});

test("chega a menos de 25 m do fim", () => {
  let estado = comecarGps(1400);
  estado = acompanharGps(estado, VIAGEM, gps(1000, 480, 0));
  assert.equal(estado.chegou, true);
  assert.equal(estado.metro, VIAGEM.metros);
});

test("o rumo do GPS só vale com o carro andando", () => {
  assert.equal(acompanharGps(comecarGps(), VIAGEM, gps(100, 0, 0, { rumo: 90, velocidade: 8 })).rumo, 90);
  assert.equal(acompanharGps(comecarGps(), VIAGEM, gps(100, 0, 0, { rumo: 90, velocidade: 0.5 })).rumo, null);
  assert.equal(acompanharGps(comecarGps(), VIAGEM, gps(100, 0, 0, { rumo: null, velocidade: 8 })).rumo, null);
});

test("erros do GPS em palavras", () => {
  assert.match(textoDoErroDoGps(1), /não foi permitida/);
  assert.match(textoDoErroDoGps(3), /demorou/);
  assert.match(textoDoErroDoGps("sem-gps"), /não informa/);
  assert.match(textoDoErroDoGps(2), /continua simulada/);
});
