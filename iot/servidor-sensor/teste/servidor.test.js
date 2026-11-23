const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarApp, lerConfiguracao } = require("../server");
const { Repasse } = require("../repasse");

async function subir(app) {
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, "127.0.0.1", () => ok(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return { base, fechar: () => new Promise((ok) => servidor.close(ok)) };
}

const postar = (base, corpo) =>
  fetch(`${base}/api/leitura`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });

test("backend fora: o painel continua recebendo leituras", async () => {
  const repasse = new Repasse({
    backendUrl: "http://backend.fora",
    chave: "x",
    enviar: () => new Promise(() => {}), // nunca responde
    agendar: () => ({}),
    log: { warn: () => {} },
  });
  const { base, fechar } = await subir(criarApp({ repasse }));
  try {
    // A água subindo de um jeito possível (saltos grandes seriam eco falso e ficariam de fora).
    for (const d of [30, 25, 18]) {
      const r = await postar(base, { device: "bueiro_01", distancia: d });
      assert.equal(r.status, 200);
    }
    const ultima = await (await fetch(`${base}/api/leitura`)).json();
    assert.equal(ultima.distancia, 18);
    assert.equal(ultima.status, "critico");
    const estado = await (await fetch(`${base}/api/estado`)).json();
    assert.equal(estado.naFila >= 1, true);
  } finally {
    await fechar();
  }
});

test("leitura impossível é recusada e não chega ao painel", async () => {
  const { base, fechar } = await subir(criarApp());
  try {
    for (const d of [0, -5, 2500, 99999, "40"]) {
      const r = await postar(base, { device: "bueiro_01", distancia: d });
      assert.equal(r.status, 400, `distância ${JSON.stringify(d)}`);
    }
    assert.equal(await (await fetch(`${base}/api/leitura`)).json(), null);
    const estado = await (await fetch(`${base}/api/estado`)).json();
    assert.equal(estado.backend, "desligado");
  } finally {
    await fechar();
  }
});

// Servidor com relógio de mentira: o tempo só passa quando o teste manda.
async function subirComRelogio(opcoes = {}) {
  let agora = Date.parse("2026-11-24T12:00:00Z");
  const recebidas = [];
  const repasse = { receber: (l) => recebidas.push(l.distanciaCm), estado: () => ({ backend: "desligado", naFila: 0 }) };
  const servidor = await subir(criarApp({ repasse, agora: () => agora, ...opcoes }));
  return {
    ...servidor,
    recebidas,
    passar: (ms) => {
      agora += ms;
    },
    mandar: (d) => postar(servidor.base, { device: "bueiro_01", distancia: d }),
    ultima: async () => (await fetch(`${servidor.base}/api/leitura`)).json(),
  };
}

test("10 s sem leitura nova: o servidor avisa que o sensor parou", async () => {
  const t = await subirComRelogio();
  try {
    await t.mandar(40);
    t.passar(2000);
    let l = await t.ultima();
    assert.equal(l.parado, false);
    assert.equal(l.idadeSegundos, 2);

    t.passar(9000);
    l = await t.ultima();
    assert.equal(l.parado, true, "11 s depois da última leitura");
    assert.equal(l.distancia, 40, "a última leitura continua lá, marcada como parada");
    const estado = await (await fetch(`${t.base}/api/estado`)).json();
    assert.equal(estado.sensor.parado, true);
    assert.equal(estado.sensor.idadeSegundos, 11);

    await t.mandar(41);
    assert.equal((await t.ultima()).parado, false, "a placa voltou");
  } finally {
    await t.fechar();
  }
});

test("o /api/stream avisa uma vez quando o sensor para", async () => {
  const t = await subirComRelogio({ checarParadoMs: 10 });
  const controle = new AbortController();
  try {
    await t.mandar(40);
    const resposta = await fetch(`${t.base}/api/stream`, { signal: controle.signal });
    const leitor = resposta.body.getReader();
    const decodificar = new TextDecoder();
    const proximo = async () => {
      let texto = "";
      while (!texto.includes("\n\n")) texto += decodificar.decode((await leitor.read()).value);
      return JSON.parse(texto.replace(/^data: /, ""));
    };
    assert.equal((await proximo()).parado, false, "ao conectar, a última leitura");
    t.passar(11_000);
    const aviso = await proximo();
    assert.equal(aviso.parado, true);
    assert.equal(aviso.distancia, 40);
  } finally {
    controle.abort();
    await t.fechar();
  }
});

test("eco falso: um salto isolado (40 → 5 → 40 cm) é ignorado", async () => {
  const t = await subirComRelogio();
  try {
    for (const d of [40, 5, 40, 39]) {
      t.passar(2000);
      const r = await t.mandar(d);
      assert.equal(r.status, 200, "o firmware não precisa saber");
      if (d === 5) assert.equal((await t.ultima()).distancia, 40, "o salto não chega ao painel");
    }
    assert.deepEqual(t.recebidas, [40, 40, 39], "nem ao backend");
    assert.equal((await t.ultima()).status, "atencao");
    const estado = await (await fetch(`${t.base}/api/estado`)).json();
    assert.equal(estado.sensor.descartadasPorSalto, 1);
  } finally {
    await t.fechar();
  }
});

test("salto confirmado pela leitura seguinte vale (a água mudou de verdade)", async () => {
  const t = await subirComRelogio();
  try {
    for (const d of [40, 18, 17]) {
      t.passar(2000);
      await t.mandar(d);
    }
    const l = await t.ultima();
    assert.equal(l.distancia, 17);
    assert.equal(l.status, "critico");
    assert.deepEqual(t.recebidas, [40, 17]);
  } finally {
    await t.fechar();
  }
});

test("depois de o sensor parar, a primeira leitura vale sem comparar com a velha", async () => {
  const t = await subirComRelogio();
  try {
    await t.mandar(60);
    t.passar(60_000); // a placa ficou desligada e o balde foi enchido
    await t.mandar(25);
    assert.equal((await t.ultima()).distancia, 25);
  } finally {
    await t.fechar();
  }
});

test("configuração vem das variáveis de ambiente", () => {
  assert.deepEqual(lerConfiguracao({}), {
    porta: 3000,
    backendUrl: "",
    chave: "",
    codigo: "bueiro_01",
    intervaloMs: 30_000,
  });
  const c = lerConfiguracao({
    PORT: "3100",
    BACKEND_URL: " http://localhost:8080 ",
    SENSOR_CHAVE: "abc",
    SENSOR_CODIGO: " bueiro_02 ",
    INTERVALO_REPASSE_S: "10",
  });
  assert.deepEqual(c, {
    porta: 3100,
    backendUrl: "http://localhost:8080",
    chave: "abc",
    codigo: "bueiro_02",
    intervaloMs: 10_000,
  });
  assert.equal(lerConfiguracao({ INTERVALO_REPASSE_S: "zero" }).intervaloMs, 30_000);
});
