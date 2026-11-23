// Testes da leitura do protótipo do sensor: distância em cm → água em % → nível do bueiro,
// com a mesma conta do backend (NivelDaAgua), e o tempo até transbordar.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ALCANCE, LIMITES_PERCENTUAIS, MEDIDAS_PADRAO, arrumarMedidas, distanciaDoPercentual, distanciaFirme, distanciaValida, escalaDoDesenho, lerLeitura,
  lerMedidasDoBackend, lerRegraDoServidor, mediana, medidasValidas, mesmaRegra, mesmasMedidas, naZonaCega, nivelDaDistancia, nivelDoPercentual, percentualDaAgua,
  tempoAteTransbordar, textoDaDistancia, textoDoPercentual, textoDoTempo,
} from "./nivel.js";
import { ENDERECO_PADRAO, arrumarEndereco, ehEsteComputador, podeSerBloqueado } from "./servidor.js";

test("água em %: a mesma conta do backend, entre 0 e 100", () => {
  // Medidas de exemplo: sensor a 60 cm do fundo, cheio a 25 cm. 35 cm de bueiro.
  assert.deepEqual(MEDIDAS_PADRAO, { profundidade: 60, cheio: 25 });
  assert.equal(percentualDaAgua(60), 0, "água no fundo");
  assert.equal(percentualDaAgua(42.5), 50);
  assert.equal(percentualDaAgua(32), 80);
  assert.equal(percentualDaAgua(25), 100, "no cheio");
  assert.equal(percentualDaAgua(18), 100, "mais perto que o cheio continua 100");
  assert.equal(percentualDaAgua(300), 0, "mais fundo que o bueiro: 0, não negativo");
  assert.equal(percentualDaAgua(50), 28.6, "uma casa decimal, como o backend");
  assert.equal(percentualDaAgua(40, { profundidade: 100, cheio: 20 }), 75);
});

test("o nível sai do %, com os limites do backend (50, 80, 100)", () => {
  assert.deepEqual(LIMITES_PERCENTUAIS, { medio: 50, alto: 80, critico: 100 });
  assert.equal(nivelDoPercentual(0), 1);
  assert.equal(nivelDoPercentual(49.9), 1);
  assert.equal(nivelDoPercentual(50), 2, "no limite já é médio");
  assert.equal(nivelDoPercentual(79.9), 2);
  assert.equal(nivelDoPercentual(80), 3);
  assert.equal(nivelDoPercentual(99.9), 3, "quase cheio ainda é alto: crítico é transbordando");
  assert.equal(nivelDoPercentual(100), 4);
  assert.equal(nivelDoPercentual(null), null);
  assert.equal(nivelDaDistancia(1500), 1, "longe da água: baixo");
  assert.equal(nivelDaDistancia(42.5), 2);
  assert.equal(nivelDaDistancia(32), 3);
  assert.equal(nivelDaDistancia(25.1), 3);
  assert.equal(nivelDaDistancia(25), 4);
  assert.equal(nivelDaDistancia(8), 4, "mais perto que o sensor mede: continua crítico");
});

test("as marcas do desenho ficam onde a conta muda de nível", () => {
  for (const pct of [50, 80, 100]) assert.equal(nivelDoPercentual(percentualDaAgua(distanciaDoPercentual(pct))), nivelDoPercentual(pct));
  assert.equal(distanciaDoPercentual(100), 25);
  assert.equal(distanciaDoPercentual(0), 60);
});

test("medida impossível não vira bueiro cheio", () => {
  // Sem o eco de volta, muito sensor de distância devolve 0. Pela regra pura, 0 seria "crítico".
  for (const ruim of [0, -1, 2001, 9999, NaN, Infinity, null, undefined, "32"]) {
    assert.equal(distanciaValida(ruim), false, `${ruim} não é medida`);
    assert.equal(nivelDaDistancia(ruim), null, `${ruim} não tem nível`);
  }
  assert.equal(distanciaValida(0.5), true);
  assert.equal(distanciaValida(601), true, "o sensor alcança 2000 cm");
  assert.equal(distanciaValida(2000), true);
});

test("zona cega: abaixo do mínimo do sensor a medida deixa de ser confiável", () => {
  assert.equal(naZonaCega(19.9), true);
  assert.equal(naZonaCega(20), false, "20 cm o sensor ainda mede");
  assert.equal(naZonaCega(0), false, "0 não é medida, então não é zona cega");
});

test("medidas do bueiro em Ajustes: valem quando cabem no sensor; senão, as de exemplo", () => {
  assert.deepEqual(arrumarMedidas({ profundidade: 80, cheio: 22 }), { profundidade: 80, cheio: 22 });
  assert.equal(nivelDaDistancia(30, arrumarMedidas({ profundidade: 80, cheio: 22 })), 3);
  const ruins = [null, undefined, {}, { profundidade: 60 }, { profundidade: 60, cheio: 15 }, { profundidade: 30, cheio: 28 },
    { profundidade: 2001, cheio: 25 }, { profundidade: "60", cheio: 25 }, { profundidade: NaN, cheio: 25 }];
  for (const ruim of ruins) {
    assert.equal(medidasValidas(ruim), false, JSON.stringify(ruim));
    assert.equal(arrumarMedidas(ruim), MEDIDAS_PADRAO);
  }
  assert.equal(medidasValidas({ profundidade: 25, cheio: 20 }), true, "cheio no mínimo do sensor e 5 cm de bueiro");
  assert.equal(mesmasMedidas({ profundidade: 60, cheio: 25 }, MEDIDAS_PADRAO), true);
  assert.equal(mesmasMedidas(null, MEDIDAS_PADRAO), false);
});

test("medidas do backend (GET /sensores/{id}): só quando o sensor foi cadastrado com elas", () => {
  assert.deepEqual(lerMedidasDoBackend({ id: 137, codigo: "bueiro_01", profundidadeCm: 58.5, distanciaCheioCm: 24 }), { profundidade: 58.5, cheio: 24 });
  assert.equal(lerMedidasDoBackend({ id: 137, codigo: "bueiro_01", profundidadeCm: null, distanciaCheioCm: null }), null);
  assert.equal(lerMedidasDoBackend({ profundidadeCm: 60, distanciaCheioCm: 10 }), null, "cheio dentro da zona cega não serve");
  assert.equal(lerMedidasDoBackend(null), null);
});

test("a regra do servidor do sensor: reconhece o servidor e confere se dá o mesmo nível (#41)", () => {
  const resposta = {
    regra: "percentual", profundidadeCm: 60, cheioCm: 25, deExemplo: true, medio: 50, alto: 80, critico: 100,
    emCm: { medio: 42.5, alto: 32, critico: 25 }, zonaCegaCm: 20, folgaCm: 2,
  };
  const regra = lerRegraDoServidor(resposta);
  assert.deepEqual(regra, { regra: "percentual", medidas: { profundidade: 60, cheio: 25 }, deExemplo: true, limites: { medio: 50, alto: 80, critico: 100 } });
  assert.equal(mesmaRegra(regra, MEDIDAS_PADRAO), true);
  assert.equal(mesmaRegra(regra, { profundidade: 40, cheio: 20 }), false, "outras medidas, outro nível para a mesma água");
  assert.equal(mesmaRegra(lerRegraDoServidor({ ...resposta, alto: 75 }), MEDIDAS_PADRAO), false, "outros limites");
  // Servidor de antes de #41, com limites em cm: reconhecido, mas não dá o mesmo nível.
  const antigo = lerRegraDoServidor({ zonaCega: 15, critico: 20, alerta: 30, atencao: 45 });
  assert.deepEqual(antigo, { regra: "cm" });
  assert.equal(mesmaRegra(antigo, MEDIDAS_PADRAO), false);
  for (const ruim of [null, undefined, {}, "ok", { critico: 30, alerta: 20, atencao: 45 }, { critico: 20, alerta: 30 },
    { ...resposta, cheioCm: 70 }, { ...resposta, profundidadeCm: "60" }, { ...resposta, medio: 90 }]) {
    assert.equal(lerRegraDoServidor(ruim), null, JSON.stringify(ruim));
  }
});

test("a distância mostrada é a mediana das leituras válidas recentes", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([5]), 5);
  assert.equal(mediana([10, 30]), 20);
  assert.equal(mediana([30, 10, 20]), 20);
  assert.equal(distanciaFirme([50, 12, 51]), 50, "uma medida isolada fora do lugar não muda o nível");
  assert.equal(distanciaFirme([50, 0, 52]), 51, "o 0 de uma leitura falha é descartado");
  assert.equal(distanciaFirme([0, 0, 0]), null, "só leituras falhas: não há medida");
  assert.equal(distanciaFirme([]), null);
  assert.equal(distanciaFirme([32]), 32);
});

test("lê a resposta de GET /api/leitura do servidor do sensor", () => {
  const resposta = { device: "esp32-01", distancia: 32.4, status: "atencao", nivel: 1, titulo: "Atenção", mensagem: "Nível de água subindo.", em: "2026-10-07T12:00:00.000Z" };
  assert.deepEqual(lerLeitura(resposta), { distancia: 32.4, em: Date.parse("2026-10-07T12:00:00.000Z"), marca: "2026-10-07T12:00:00.000Z", aparelho: "esp32-01" });
  assert.equal(lerLeitura(null), null, "o servidor responde null antes da primeira leitura");
  assert.equal(lerLeitura({ device: "x" }), null);
  assert.equal(lerLeitura({ distancia: "32" }), null, "o servidor só guarda número");
  assert.deepEqual(lerLeitura({ distancia: 0 }), { distancia: 0, em: null, marca: "", aparelho: null }, "leitura falha chega até a tela, que avisa");
  assert.equal(lerLeitura({ distancia: 10, em: "ontem" }).em, null);
});

test("textos e escala do desenho", () => {
  assert.equal(textoDaDistancia(32.4), "32 cm");
  assert.equal(textoDaDistancia(19.6), "20 cm");
  assert.equal(textoDaDistancia(1873), "1873 cm");
  assert.equal(textoDoPercentual(62.5), "63 %");
  assert.equal(escalaDoDesenho(), 60, "o desenho vai até o fundo do bueiro");
  assert.equal(escalaDoDesenho({ profundidade: 80, cheio: 22 }), 80);
});

/* ───────────── Tempo até transbordar ───────────── */

/** Uma leitura a cada 2 s (o ritmo do firmware), de `inicio` cm, mudando `porSegundo` cm a cada segundo. */
const serie = ({ inicio, porSegundo = 0, segundos = 120, passo = 2, ruido = () => 0 }) =>
  Array.from({ length: Math.floor(segundos / passo) + 1 }, (_, i) => ({ quando: i * passo * 1000, distancia: inicio + porSegundo * i * passo + ruido(i) }));

test("subindo 1 cm a cada 10 s: o tempo bate com a conta à mão", () => {
  // 120 s a 0,1 cm/s: de 50 cm para 38 cm. Faltam 38 − 25 = 13 cm, a 6 cm/min: 130 s.
  const tempo = tempoAteTransbordar(serie({ inicio: 50, porSegundo: -0.1 }));
  assert.ok(tempo, "precisa mostrar o tempo");
  assert.ok(Math.abs(tempo.cmPorMinuto - 6) < 1e-9);
  assert.ok(Math.abs(tempo.segundos - 130) < 1e-6);
  assert.equal(textoDoTempo(tempo.segundos), "em cerca de 2 minutos");
});

test("um eco falso no meio da subida não muda o tempo", () => {
  const comSalto = serie({ inicio: 50, porSegundo: -0.1, ruido: (i) => (i === 30 ? 900 : 0) });
  const tempo = tempoAteTransbordar(comSalto);
  assert.ok(tempo);
  assert.ok(Math.abs(tempo.segundos - 130) < 5);
});

test("parada, descendo, oscilando ou com um salto isolado: não mostra tempo", () => {
  assert.equal(tempoAteTransbordar(serie({ inicio: 40 })), null, "parada");
  assert.equal(tempoAteTransbordar(serie({ inicio: 30, porSegundo: 0.1 })), null, "descendo");
  assert.equal(tempoAteTransbordar(serie({ inicio: 40, ruido: (i) => (i % 2 ? 1.5 : -1.5) })), null, "oscilando em volta do mesmo lugar");
  assert.equal(tempoAteTransbordar(serie({ inicio: 40, ruido: (i) => (i === 50 ? -14 : 0) })), null, "parada com um salto (eco falso)");
  assert.equal(tempoAteTransbordar(serie({ inicio: 40, ruido: (i) => (i >= 55 ? -12 : 0) })), null, "um degrau no fim não é subida consistente");
});

test("subida lenta demais, leituras de menos ou já cheio: não mostra tempo", () => {
  assert.equal(tempoAteTransbordar(serie({ inicio: 50, porSegundo: -0.002 })), null, "0,12 cm/min: ruído do sensor, não subida");
  assert.equal(tempoAteTransbordar(serie({ inicio: 50, porSegundo: -0.1, segundos: 20 })), null, "menos de 30 s de leituras");
  assert.equal(tempoAteTransbordar(serie({ inicio: 30, porSegundo: -0.1 })), null, "a água já passou do cheio");
  assert.equal(tempoAteTransbordar([]), null);
  // Mais de uma hora até encher: não é informação útil na bancada.
  assert.equal(tempoAteTransbordar(serie({ inicio: 1500, porSegundo: -0.01 })), null);
});

test("só os últimos 2 minutos contam: uma subida antiga, já parada, não mostra tempo", () => {
  const subiu = serie({ inicio: 55, porSegundo: -0.1, segundos: 100 });
  const parou = serie({ inicio: subiu.at(-1).distancia, segundos: 150 }).map((l) => ({ ...l, quando: l.quando + 102000 }));
  assert.equal(tempoAteTransbordar([...subiu, ...parou]), null);
});

test("tempo em palavras", () => {
  assert.equal(textoDoTempo(40), "em menos de 1 minuto");
  assert.equal(textoDoTempo(75), "em cerca de 1 minuto");
  assert.equal(textoDoTempo(720), "em cerca de 12 minutos");
});

test("endereço do servidor do sensor digitado em Ajustes", () => {
  assert.equal(arrumarEndereco(""), ENDERECO_PADRAO);
  assert.equal(arrumarEndereco("  "), ENDERECO_PADRAO);
  assert.equal(arrumarEndereco("192.168.0.10"), "http://192.168.0.10:3000", "sem porta vale a 3000 do código do grupo");
  assert.equal(arrumarEndereco("192.168.0.10:8080"), "http://192.168.0.10:8080");
  assert.equal(arrumarEndereco("http://localhost:3000/"), "http://localhost:3000");
  assert.equal(arrumarEndereco("http://192.168.0.10:3000/api/leitura"), "http://192.168.0.10:3000", "o caminho é descartado");
  assert.equal(arrumarEndereco("https://sensor.exemplo.com"), "https://sensor.exemplo.com");
  assert.equal(arrumarEndereco("http://"), null);
  assert.equal(arrumarEndereco("isto não é endereço"), null);
  assert.equal(arrumarEndereco("localhost 3000"), null, "com espaço não é endereço");
  assert.equal(arrumarEndereco("http://[::1]:3000"), "http://[::1]:3000");
  assert.equal(arrumarEndereco("notebook-do-grupo.local"), "http://notebook-do-grupo.local:3000");
});

test("https só fala com http quando o servidor está neste computador", () => {
  assert.equal(ehEsteComputador("http://localhost:3000"), true);
  assert.equal(ehEsteComputador("http://127.0.0.1:3000"), true);
  assert.equal(ehEsteComputador("http://192.168.0.10:3000"), false);
  assert.equal(podeSerBloqueado("http://localhost:3000", "https:"), false);
  assert.equal(podeSerBloqueado("http://192.168.0.10:3000", "https:"), true);
  assert.equal(podeSerBloqueado("http://192.168.0.10:3000", "http:"), false, "pelo npm run demo não há bloqueio");
  assert.equal(podeSerBloqueado("https://sensor.exemplo.com", "https:"), false);
});
