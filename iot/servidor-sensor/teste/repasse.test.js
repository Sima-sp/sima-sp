const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Repasse, mediana } = require("../repasse");

// Relógio e agenda falsos: nada espera de verdade.
function montar(opcoes = {}) {
  const pedidos = [];
  const agenda = [];
  let agora = Date.parse("2026-11-24T12:00:00Z");
  let responder = opcoes.responder || (() => ({ ok: true, status: 201, json: async () => ({}) }));
  const avisos = [];
  const r = new Repasse({
    backendUrl: "http://backend.teste/",
    chave: "chave-de-teste",
    agora: () => agora,
    agendar: (fn, ms) => {
      const t = { fn, ms };
      agenda.push(t);
      return t;
    },
    cancelar: () => {},
    enviar: async (url, init) => {
      pedidos.push({ url, init, corpo: JSON.parse(init.body) });
      return responder(url, init);
    },
    log: { warn: (m) => avisos.push(m) },
    ...opcoes.extra,
  });
  return {
    r,
    pedidos,
    agenda,
    avisos,
    passar: (ms) => {
      agora += ms;
    },
    agora: () => agora,
    trocarResposta: (f) => {
      responder = f;
    },
    // Roda a próxima espera agendada (como se o tempo dela tivesse passado).
    rodarEspera: async () => {
      const t = agenda.shift();
      agora += t.ms;
      t.fn();
      await esvaziar();
      return t.ms;
    },
  };
}

const esvaziar = () => new Promise((ok) => setImmediate(ok));

test("mediana ignora um valor absurdo no meio da janela", () => {
  assert.equal(mediana([40, 41, 900, 39, 40]), 40);
  assert.equal(mediana([10, 20]), 15);
  assert.equal(mediana([]), null);
});

test("a primeira leitura vai na hora e as seguintes esperam a janela", async () => {
  const t = montar();
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 60, em: t.agora() });
  await esvaziar();
  assert.equal(t.pedidos.length, 1);
  assert.equal(t.pedidos[0].url, "http://backend.teste/leituras");
  assert.equal(t.pedidos[0].init.headers["X-Sensor-Chave"], "chave-de-teste");
  assert.deepEqual(Object.keys(t.pedidos[0].corpo).sort(), ["codigo", "distanciaCm", "medidaEm"]);
  assert.equal(t.pedidos[0].corpo.codigo, "bueiro_01");

  for (const d of [61, 59, 900, 60, 58]) {
    t.passar(2000);
    t.r.receber({ codigo: "bueiro_01", distanciaCm: d, em: t.agora() });
  }
  await esvaziar();
  assert.equal(t.pedidos.length, 1, "na mesma faixa, nada sai antes da janela fechar");

  t.r.periodico();
  await esvaziar();
  assert.equal(t.pedidos.length, 2);
  assert.equal(t.pedidos[1].corpo.distanciaCm, 60, "mediana da janela, sem o 900");
  assert.equal(t.pedidos[1].corpo.medidaEm, new Date(t.agora()).toISOString());

  t.r.periodico();
  await esvaziar();
  assert.equal(t.pedidos.length, 2, "janela vazia não manda nada");
});

test("mudança de faixa manda na hora, sem esperar a janela", async () => {
  const t = montar();
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 60, em: t.agora() }); // normal
  await esvaziar();
  for (const d of [18, 18]) {
    t.passar(3000);
    t.r.receber({ codigo: "bueiro_01", distanciaCm: d, em: t.agora() });
  }
  await esvaziar();
  assert.equal(t.pedidos.length, 2);
  assert.equal(t.pedidos[1].corpo.distanciaCm, 18, "a faixa vem da mediana das últimas leituras");
});

test("um pico isolado não troca a faixa", async () => {
  const t = montar();
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 60, em: t.agora() });
  await esvaziar();
  for (const d of [60, 10, 60]) {
    t.passar(2000);
    t.r.receber({ codigo: "bueiro_01", distanciaCm: d, em: t.agora() });
  }
  await esvaziar();
  assert.equal(t.pedidos.length, 1);
});

test("leitura oscilando na fronteira não vira um envio a cada leitura", async () => {
  const t = montar();
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 46, em: t.agora() });
  await esvaziar();
  // 44/46 cm ficam na fronteira entre normal e atenção (45 cm). Uma leitura por segundo, 20 s.
  for (let i = 0; i < 20; i += 1) {
    t.passar(1000);
    const d = Math.floor(i / 2) % 2 ? 46 : 44;
    t.r.receber({ codigo: "bueiro_01", distanciaCm: d, em: t.agora() });
  }
  await esvaziar();
  assert.ok(t.pedidos.length <= 5, `no máximo um envio imediato a cada 5 s (saíram ${t.pedidos.length})`);
});

test("backend fora: guarda na fila e tenta de novo com espera crescente", async () => {
  const t = montar({
    responder: () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    },
  });
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 60, em: t.agora() });
  await esvaziar();
  assert.equal(t.r.estado().backend, "fora");
  assert.equal(t.r.estado().naFila, 1);
  assert.match(t.r.estado().ultimoErro.mensagem, /ECONNREFUSED/);

  const esperas = [t.agenda[0].ms];
  esperas.push(await t.rodarEspera());
  esperas.push(t.agenda[0].ms);
  assert.deepEqual(esperas.slice(0, 2), [2000, 2000]);
  assert.equal(esperas[2], 4000, "a espera dobra a cada falha");

  // Volta o backend: a fila esvazia e o estado fica ligado.
  t.trocarResposta(() => ({ ok: true, status: 201, json: async () => ({}) }));
  t.passar(2000);
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 59, em: t.agora() });
  await t.rodarEspera();
  assert.equal(t.r.estado().naFila, 0);
  assert.equal(t.r.estado().backend, "ligado");
  assert.equal(t.avisos.length, 1, "o mesmo erro não enche o log");
});

test("a fila é curta: as leituras mais antigas saem primeiro", async () => {
  const t = montar({
    responder: () => {
      throw new TypeError("fetch failed");
    },
    extra: { filaMax: 3 },
  });
  for (let i = 0; i < 6; i += 1) {
    t.passar(30_000);
    t.r.receber({ codigo: "bueiro_01", distanciaCm: 60 + i, em: t.agora() });
    t.r.periodico();
  }
  await esvaziar();
  assert.equal(t.r.estado().naFila, 3);
  assert.ok(t.r.estado().descartadas > 0);
});

test("chave errada (401) não insiste a cada segundo", async () => {
  const t = montar({
    responder: () => ({ ok: false, status: 401, json: async () => ({ mensagem: "Chave do sensor inválida." }) }),
  });
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 60, em: t.agora() });
  await esvaziar();
  assert.equal(t.pedidos.length, 1);
  assert.equal(t.agenda[0].ms, 60_000);
  const e = t.r.estado();
  assert.equal(e.backend, "fora");
  assert.equal(e.ultimoErro.status, 401);
  assert.match(e.ultimoErro.mensagem, /SENSOR_CHAVE/);
  assert.match(t.avisos[0], /Chave do sensor inválida/);
});

test("sensor inativo (409) também espera 1 minuto", async () => {
  const t = montar({ responder: () => ({ ok: false, status: 409, json: async () => ({}) }) });
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 60, em: t.agora() });
  await esvaziar();
  assert.equal(t.agenda[0].ms, 60_000);
  assert.match(t.r.estado().ultimoErro.mensagem, /indisponível/);
});

test("leitura recusada (400) sai da fila", async () => {
  const t = montar({ responder: () => ({ ok: false, status: 400, json: async () => ({}) }) });
  t.r.receber({ codigo: "bueiro_01", distanciaCm: 60, em: t.agora() });
  await esvaziar();
  assert.equal(t.r.estado().naFila, 0);
  assert.equal(t.agenda.length, 0);
});

test("sem BACKEND_URL nenhum pedido sai", async () => {
  let chamadas = 0;
  const r = new Repasse({
    backendUrl: "",
    enviar: async () => {
      chamadas += 1;
      return { ok: true, status: 201 };
    },
  });
  r.receber({ codigo: "bueiro_01", distanciaCm: 18, em: Date.now() });
  r.periodico();
  await esvaziar();
  assert.equal(chamadas, 0);
  assert.equal(r.estado().backend, "desligado");
});
