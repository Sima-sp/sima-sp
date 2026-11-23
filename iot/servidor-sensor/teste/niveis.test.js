const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  MEDIDAS_PADRAO,
  FOLGA_CM,
  classificar,
  classificarComFolga,
  descreverRegra,
  lerMedidas,
  percentualDaAgua,
} = require("../niveis");

// Passa uma sequência de distâncias, lembrando do nível anterior, e devolve os níveis.
function seguir(distancias, medidas) {
  let anterior = null;
  return distancias.map((d) => {
    anterior = classificarComFolga(d, anterior, medidas).status;
    return anterior;
  });
}

test("água em %: a mesma conta e os mesmos números do backend e do painel do app", () => {
  // Medidas de exemplo: sensor a 60 cm do fundo, cheio a 25 cm (35 cm de bueiro). Os mesmos
  // casos de app/src/sensor/nivel.test.js.
  assert.deepEqual(MEDIDAS_PADRAO, { profundidade: 60, cheio: 25 });
  assert.equal(percentualDaAgua(60), 0, "água no fundo");
  assert.equal(percentualDaAgua(42.5), 50);
  assert.equal(percentualDaAgua(32), 80);
  assert.equal(percentualDaAgua(25), 100, "no cheio");
  assert.equal(percentualDaAgua(18), 100, "mais perto que o cheio continua 100");
  assert.equal(percentualDaAgua(70), 0, "mais longe que o fundo continua 0");
  assert.equal(percentualDaAgua(50), 28.6, "uma casa, como o backend");
});

test("os níveis mudam em 50, 80 e 100 % (médio, alto e crítico)", () => {
  const casos = [
    [60, "baixo", 1],
    [42.6, "baixo", 1],
    [42.5, "medio", 2],
    [32.1, "medio", 2],
    [32, "alto", 3],
    [25.1, "alto", 3],
    [25, "critico", 4],
    [21, "critico", 4],
  ];
  for (const [d, status, nivel] of casos) {
    const l = classificar(d);
    assert.equal(l.status, status, `${d} cm`);
    assert.equal(l.nivel, nivel, `${d} cm`);
  }
  assert.equal(classificar(32).percentual, 80);
});

test("as medidas do bueiro mudam onde cada nível começa", () => {
  // Um balde com o sensor a 40 cm do fundo e cheio a 20 cm: 20 cm de água.
  const balde = { profundidade: 40, cheio: 20 };
  assert.equal(classificar(30, balde).status, "medio", "metade do balde");
  assert.equal(classificar(24, balde).status, "alto");
  assert.equal(classificar(20, balde).status, "critico");
  assert.equal(classificar(30).status, "alto", "com as medidas de exemplo, 30 cm é outro nível");
});

test("sem nível anterior, é a classificação de sempre", () => {
  for (const d of [10, 20, 25, 30, 40, 45, 60]) {
    assert.deepEqual(classificarComFolga(d, null), classificar(d));
  }
});

test("oscilando em volta do limite, o nível não fica trocando", () => {
  // O médio começa em 42,5 cm. Medidas entre 41,5 e 43,5 são ruído em volta dele.
  assert.deepEqual(seguir([50, 43.5, 41.5, 43.5, 41.5, 42.5, 43.5, 41.5]), Array(8).fill("baixo"));
});

test("passando do limite com folga, o nível muda", () => {
  const limite = 42.5 - FOLGA_CM; // 40,5 cm
  assert.deepEqual(seguir([50, 41.5, limite]), ["baixo", "baixo", "medio"]);
  // E para voltar, a água precisa descer além do limite com a mesma folga.
  assert.deepEqual(seguir([40, 43, 44, 45]), ["medio", "medio", "medio", "baixo"]);
});

test("chegando ao cheio, vai a crítico na hora (é onde o backend cria o alerta)", () => {
  assert.deepEqual(seguir([27, 25]), ["alto", "critico"], "sem esperar a folga");
  // Para sair do crítico, a água precisa descer além do cheio com folga.
  assert.deepEqual(seguir([25, 26, 27, 27.5]), ["critico", "critico", "critico", "alto"]);
  // Com o cheio na beira da zona cega, a folga não pode exigir uma medida que o sensor não faz.
  const balde = { profundidade: 40, cheio: 20 };
  assert.deepEqual(seguir([22, 20], balde), ["alto", "critico"]);
});

test("a água subindo rápido pula níveis sem esperar", () => {
  assert.deepEqual(seguir([60, 15]), ["baixo", "critico"]);
  // Logo acima do limite do alto (32 cm), ela fica no nível que é certo com a folga: médio.
  assert.deepEqual(seguir([60, 31]), ["baixo", "medio"]);
});

test("na zona cega, a mensagem continua a da zona cega", () => {
  const l = classificarComFolga(10, "alto");
  assert.equal(l.status, "critico");
  assert.match(l.mensagem, /zona cega/);
  const cheio = classificarComFolga(24, "critico");
  assert.equal(cheio.status, "critico");
  assert.doesNotMatch(cheio.mensagem, /zona cega/);
});

test("medidas do .env: vazias ou impossíveis viram as de exemplo, com aviso", () => {
  assert.deepEqual(lerMedidas({}), { medidas: MEDIDAS_PADRAO, deExemplo: true, aviso: null });
  assert.deepEqual(lerMedidas({ SENSOR_PROFUNDIDADE_CM: "48,5", SENSOR_CHEIO_CM: " 22 " }), {
    medidas: { profundidade: 48.5, cheio: 22 },
    deExemplo: false,
    aviso: null,
  });
  for (const env of [
    { SENSOR_PROFUNDIDADE_CM: "48" }, // falta o cheio
    { SENSOR_PROFUNDIDADE_CM: "48", SENSOR_CHEIO_CM: "15" }, // cheio na zona cega
    { SENSOR_PROFUNDIDADE_CM: "24", SENSOR_CHEIO_CM: "22" }, // bueiro de 2 cm
    { SENSOR_PROFUNDIDADE_CM: "fundo", SENSOR_CHEIO_CM: "22" },
  ]) {
    const lidas = lerMedidas(env);
    assert.deepEqual(lidas.medidas, MEDIDAS_PADRAO, JSON.stringify(env));
    assert.equal(lidas.deExemplo, true);
    assert.match(lidas.aviso, /não servem/);
  }
});

test("a regra que o /api/limites mostra", () => {
  assert.deepEqual(descreverRegra({ profundidade: 40, cheio: 20 }), {
    regra: "percentual",
    profundidadeCm: 40,
    cheioCm: 20,
    deExemplo: false,
    medio: 50,
    alto: 80,
    critico: 100,
    emCm: { medio: 30, alto: 24, critico: 20 },
    zonaCegaCm: 20,
    folgaCm: 2,
  });
});
