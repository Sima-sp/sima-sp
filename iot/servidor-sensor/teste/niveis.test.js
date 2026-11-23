const { test } = require("node:test");
const assert = require("node:assert/strict");
const { LIMITES, FOLGA_CM, classificar, classificarComFolga } = require("../niveis");

// Passa uma sequência de distâncias, lembrando do nível anterior, e devolve os níveis.
function seguir(distancias) {
  let anterior = null;
  return distancias.map((d) => {
    anterior = classificarComFolga(d, anterior).status;
    return anterior;
  });
}

test("sem nível anterior, é a classificação de sempre", () => {
  for (const d of [10, 20, 25, 30, 40, 45, 60]) {
    assert.deepEqual(classificarComFolga(d, null), classificar(d));
  }
});

test("oscilando em volta do limite, o nível não fica trocando", () => {
  // O limite de atenção é 45 cm. Medidas entre 44 e 46 são ruído em volta dele.
  assert.equal(LIMITES.atencao, 45);
  assert.deepEqual(seguir([50, 46, 44, 46, 44, 45, 46, 44]), Array(8).fill("normal"));
});

test("passando do limite com folga, o nível muda", () => {
  const limite = LIMITES.atencao - FOLGA_CM; // 43 cm
  assert.deepEqual(seguir([50, 44, limite]), ["normal", "normal", "atencao"]);
  // E para voltar, a água precisa descer além do limite com a mesma folga.
  assert.deepEqual(seguir([40, 46, 47, 48]), ["atencao", "atencao", "atencao", "normal"]);
});

test("a água subindo rápido pula níveis sem esperar", () => {
  assert.deepEqual(seguir([60, 15]), ["normal", "critico"]);
  // Logo acima do limite do crítico (20 cm), ela fica no nível que é certo: alerta.
  assert.deepEqual(seguir([60, 19]), ["normal", "alerta"]);
});

test("na zona cega, a mensagem continua a da zona cega", () => {
  const l = classificarComFolga(10, "alerta");
  assert.equal(l.status, "critico");
  assert.match(l.mensagem, /zona cega/);
  const parado = classificarComFolga(21, "critico");
  assert.equal(parado.status, "critico", "21 cm ainda não desce do crítico (folga de 2 cm)");
  assert.doesNotMatch(parado.mensagem, /zona cega/);
});
