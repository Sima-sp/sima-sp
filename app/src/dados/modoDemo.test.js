// Testes da escolha entre demonstração e dados do servidor ao abrir o app. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";

import { demoPedida } from "./modoDemo.js";

function armazenamentoFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v), dados };
}

test("sem nada no endereço nem guardado: ninguém pediu", () => {
  assert.equal(demoPedida({ busca: "", armazenamento: armazenamentoFalso() }), null);
});

test("?demo=1 e ?vitrine=1 pedem a demonstração; ?demo=0 pede os dados do servidor", () => {
  assert.equal(demoPedida({ busca: "?demo=1", armazenamento: armazenamentoFalso() }), true);
  assert.equal(demoPedida({ busca: "?vitrine=1", armazenamento: armazenamentoFalso() }), true);
  assert.equal(demoPedida({ busca: "?demo=0", armazenamento: armazenamentoFalso() }), false);
  assert.equal(demoPedida({ busca: "?outra=coisa", armazenamento: armazenamentoFalso() }), null);
});

test("a escolha do endereço fica valendo nas próximas telas da mesma visita", () => {
  const armazenamento = armazenamentoFalso();
  assert.equal(demoPedida({ busca: "?demo=1", armazenamento }), true);
  assert.equal(demoPedida({ busca: "", armazenamento }), true);
  // E o endereço manda mais que o guardado.
  assert.equal(demoPedida({ busca: "?demo=0", armazenamento }), false);
  assert.equal(demoPedida({ busca: "", armazenamento }), false);
});

test("sem sessionStorage: vale só o endereço, sem estourar", () => {
  assert.equal(demoPedida({ busca: "?demo=1", armazenamento: null }), true);
  assert.equal(demoPedida({ busca: "", armazenamento: null }), null);
  const quebrado = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
  assert.equal(demoPedida({ busca: "?vitrine=1", armazenamento: quebrado }), true);
});
