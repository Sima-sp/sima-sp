// Testes do aviso da busca do mapa, sem tela e sem internet.
// Rodar com: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDaBusca } from "./avisoDaBusca.js";

test("serviço fora do ar e nada no aparelho: aviso de erro, não 'Nada encontrado'", () => {
  assert.equal(avisoDaBusca({ termo: "rua alcantara", fase: "erro", achados: 0 }), "erro");
});

test("serviço responde vazio: 'Nada encontrado'", () => {
  assert.equal(avisoDaBusca({ termo: "rua que nao existe", fase: "pronta", achados: 0 }), "nada");
});

test("erro com bueiro achado: o bueiro aparece e o aviso vai embaixo", () => {
  assert.equal(avisoDaBusca({ termo: "sp-014", fase: "erro", achados: 1 }), "erro-com-resultados");
});

test("com resultados e o serviço respondendo: sem aviso", () => {
  assert.equal(avisoDaBusca({ termo: "paulista", fase: "pronta", achados: 3 }), null);
});

test("ainda procurando: nem 'Nada encontrado' nem erro", () => {
  assert.equal(avisoDaBusca({ termo: "rua alcantara", fase: "procurando", achados: 0 }), null);
});

test("texto curto demais para buscar endereço e nada no aparelho: 'Nada encontrado'", () => {
  assert.equal(avisoDaBusca({ termo: "zq", fase: "parada", achados: 0 }), "nada");
});

test("sem texto: sem aviso", () => {
  assert.equal(avisoDaBusca({ termo: "", fase: "erro", achados: 0 }), null);
});
