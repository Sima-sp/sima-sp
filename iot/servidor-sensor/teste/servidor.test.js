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
    for (const d of [60, 40, 18]) {
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
    for (const d of [0, -5, 2500, "40"]) {
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
