// Testes da busca de endereço, sem internet: o fetch é trocado por uma função de mentira.
// Rodar com: npm test

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { ErroRota, buscarEnderecos } from "./servico.js";
import { LUGARES } from "./lugares.js";
import { semAcento } from "../dados/niveis.js";

const fetchDeVerdade = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchDeVerdade;
});

/** Troca o fetch por uma lista de respostas, uma por pedido. Devolve quantos pedidos foram feitos. */
function servicoDeMentira(respostas) {
  const pedidos = [];
  globalThis.fetch = async (url) => {
    pedidos.push(url);
    const resposta = respostas[pedidos.length - 1];
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return pedidos;
}

const respostaJson = (dados, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => dados });
const ETEC = {
  features: [{
    geometry: { coordinates: [-46.5963862, -23.5194] },
    properties: {
      name: "Escola Técnica Professor Horácio Augusto da Silveira", street: "Rua Alcântara", district: "Vila Guilherme",
      city: "São Paulo", osm_type: "W", osm_id: 977057806,
    },
  }],
};

test("busca de endereço: falha uma vez e tenta de novo sozinha", async () => {
  const pedidos = servicoDeMentira([new TypeError("Failed to fetch"), respostaJson(ETEC)]);
  const lugares = await buscarEnderecos("etec horacio augusto da silveira", { esperaMs: 1 });
  assert.equal(pedidos.length, 2);
  assert.equal(lugares.length, 1);
  assert.equal(lugares[0].nome, "Escola Técnica Professor Horácio Augusto da Silveira");
  assert.equal(lugares[0].detalhe, "Rua Alcântara · Vila Guilherme");
});

test("busca de endereço: fora do ar nas duas tentativas vira erro de rede", async () => {
  const pedidos = servicoDeMentira([new TypeError("Failed to fetch"), new TypeError("Failed to fetch")]);
  await assert.rejects(
    buscarEnderecos("rua alcantara", { esperaMs: 1 }),
    (erro) => erro instanceof ErroRota && erro.tipo === "rede",
  );
  assert.equal(pedidos.length, 2);
});

test("busca de endereço: resposta 503 também tenta de novo antes de desistir", async () => {
  const pedidos = servicoDeMentira([respostaJson({}, 503), respostaJson({}, 503)]);
  await assert.rejects(
    buscarEnderecos("rua alcantara", { esperaMs: 1 }),
    (erro) => erro instanceof ErroRota && erro.tipo === "servico",
  );
  assert.equal(pedidos.length, 2);
});

test("busca de endereço: resposta 400 não tenta de novo (a consulta daria o mesmo erro)", async () => {
  const pedidos = servicoDeMentira([respostaJson({}, 400)]);
  await assert.rejects(
    buscarEnderecos("rua alcantara", { esperaMs: 1 }),
    (erro) => erro instanceof ErroRota && erro.tipo === "servico" && erro.status === 400,
  );
  assert.equal(pedidos.length, 1);
});

test("busca de endereço: resposta 429 tenta de novo", async () => {
  const pedidos = servicoDeMentira([respostaJson({}, 429), respostaJson(ETEC)]);
  assert.equal((await buscarEnderecos("etec", { esperaMs: 1 })).length, 1);
  assert.equal(pedidos.length, 2);
});

test("busca de endereço: resposta vazia não é erro e não repete o pedido", async () => {
  const pedidos = servicoDeMentira([respostaJson({ features: [] })]);
  assert.deepEqual(await buscarEnderecos("rua que nao existe", { esperaMs: 1 }), []);
  assert.equal(pedidos.length, 1);
});

test("busca de endereço: cancelada por quem chamou não tenta de novo", async () => {
  const controle = new AbortController();
  const pedidos = servicoDeMentira([]);
  globalThis.fetch = async (url) => {
    pedidos.push(url);
    controle.abort();
    throw new DOMException("Pedido cancelado", "AbortError");
  };
  await assert.rejects(buscarEnderecos("rua alcantara", { sinal: controle.signal, esperaMs: 1 }));
  assert.equal(pedidos.length, 1);
});

test("lugares conhecidos: as duas buscas da feira acham a Etec sem internet", () => {
  const normalizar = (texto) => semAcento(texto).toLowerCase().trim();
  for (const busca of ["etec horacio augusto da silveira", "rua alcantara"]) {
    const achados = LUGARES.filter((l) => normalizar(`${l.nome} ${l.detalhe}`).includes(normalizar(busca)));
    assert.deepEqual(achados.map((l) => l.id), ["etec-horacio"], busca);
  }
});
