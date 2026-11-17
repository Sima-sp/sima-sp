// Testes dos relatos do cidadão. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { CONFIG } from "../config.js";
import { criarSessao, definirSessao, zerarSessaoParaTeste } from "../conta/sessao.js";
import {
  LIMITES, SITUACOES, TIPOS_DE_RELATO, buscarMeusRelatos, buscarRelatos, dimensoesReduzidas, enviarRelato, montarFormulario,
  normalizarMeuRelato, normalizarRelatoPublico, relatosValidos, rotuloDoTipo, validarRelato,
} from "./relatos.js";

const CERTO = { tipo: "BUEIRO_ENTUPIDO", descricao: "Bueiro cheio de folhas na esquina", latitude: -23.527245, longitude: -46.596878 };

test("tipos: os quatro do backend, cada um com rótulo", () => {
  assert.deepEqual(TIPOS_DE_RELATO.map((t) => t.id), ["BUEIRO_ENTUPIDO", "ALAGAMENTO", "LIXO_NA_VIA", "OUTRO"]);
  assert.equal(rotuloDoTipo("ALAGAMENTO"), "Rua alagando");
  assert.equal(rotuloDoTipo("TIPO_NOVO"), "Relato");
});

test("relato sem tipo, sem descrição e sem posição: a tela pede o que falta", () => {
  assert.deepEqual(validarRelato(CERTO), {});
  assert.deepEqual(Object.keys(validarRelato({})).sort(), ["descricao", "posicao", "tipo"]);
  assert.ok(validarRelato({ ...CERTO, descricao: "   " }).descricao);
  assert.ok(validarRelato({ ...CERTO, descricao: "x".repeat(LIMITES.descricao + 1) }).descricao);
  assert.ok(validarRelato({ ...CERTO, latitude: undefined }).posicao);
});

test("foto: opcional; só JPEG ou PNG e até 5 MB", () => {
  assert.deepEqual(validarRelato({ ...CERTO, foto: { type: "image/jpeg", size: 300_000 } }), {});
  assert.ok(validarRelato({ ...CERTO, foto: { type: "application/pdf", size: 1000 } }).foto);
  assert.ok(validarRelato({ ...CERTO, foto: { type: "image/png", size: LIMITES.fotoBytes + 1 } }).foto);
});

test("foto reduzida: o lado maior cai para 1.600 px, mantendo a proporção, sem aumentar foto pequena", () => {
  assert.deepEqual(dimensoesReduzidas(4000, 3000), { largura: 1600, altura: 1200 });
  assert.deepEqual(dimensoesReduzidas(3000, 4000), { largura: 1200, altura: 1600 });
  assert.deepEqual(dimensoesReduzidas(800, 600), { largura: 800, altura: 600 });
  assert.deepEqual(dimensoesReduzidas(10000, 2), { largura: 1600, altura: 1 });
});

test("formulário: os campos que o backend espera, com a descrição sem espaços nas pontas", () => {
  const formulario = montarFormulario({ ...CERTO, descricao: "  Bueiro cheio  " });
  assert.deepEqual([...formulario.keys()], ["tipo", "descricao", "latitude", "longitude"]);
  assert.equal(formulario.get("descricao"), "Bueiro cheio");
  assert.equal(formulario.get("latitude"), "-23.527245");
  const comFoto = montarFormulario({ ...CERTO, foto: new File([new Uint8Array([255, 216, 255])], "foto.jpg", { type: "image/jpeg" }) });
  assert.equal(comFoto.get("foto").name, "foto.jpg");
});

test("meu relato e relato público: do backend para o app", () => {
  const meu = normalizarMeuRelato({ id: 5, tipo: "ALAGAMENTO", descricao: "Água na calçada", latitude: -23.5, longitude: -46.6, situacao: "RECUSADA",
    motivoRecusa: "Foto não mostra o lugar", dataCriacao: "2026-11-16T14:00:00-03:00", dataAnalise: "2026-11-16T14:30:00-03:00", temFoto: true });
  assert.equal(meu.id, "5");
  assert.equal(SITUACOES[meu.situacao].rotulo, "Recusado");
  assert.equal(meu.motivoRecusa, "Foto não mostra o lugar");
  assert.equal(meu.criadoEm.toISOString(), "2026-11-16T17:00:00.000Z");

  const publico = normalizarRelatoPublico({ id: 5, tipo: "ALAGAMENTO", descricao: "Água na calçada", latitude: -23.5, longitude: -46.6,
    dataCriacao: "2026-11-16T14:00:00-03:00", validaAte: "2026-11-17T14:30:00-03:00", fotoUrl: "/ocorrencias/5/foto" });
  assert.equal(publico.foto, `${CONFIG.urlApi}/ocorrencias/5/foto`);
  assert.equal(normalizarRelatoPublico({ id: 6, tipo: "OUTRO", latitude: null, longitude: -46.6 }), null);
  // Endereço de foto que não é um caminho do backend é ignorado.
  assert.equal(normalizarRelatoPublico({ id: 7, tipo: "OUTRO", latitude: -23.5, longitude: -46.6, fotoUrl: "https://outro.site/x.jpg" }).foto, null);
});

test("relato que passou da validade com o app aberto sai do mapa", () => {
  const agora = new Date("2026-11-17T18:00:00Z");
  const relatos = [{ id: "1", validoAte: new Date("2026-11-17T17:00:00Z") }, { id: "2", validoAte: new Date("2026-11-17T19:00:00Z") }, { id: "3", validoAte: null }];
  assert.deepEqual(relatosValidos(relatos, agora).map((r) => r.id), ["2", "3"]);
});

/* ───────────── Com um servidor de mentira ───────────── */

async function comServidor(tratar, corpo) {
  const pedidos = [];
  const servidor = http.createServer((req, res) => {
    const partes = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => {
      const pedido = { metodo: req.method, caminho: req.url, autorizacao: req.headers.authorization ?? null, tipo: req.headers["content-type"] ?? "", corpo: Buffer.concat(partes).toString("latin1") };
      pedidos.push(pedido);
      const [status, json] = tratar(pedido);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(json === undefined ? "" : JSON.stringify(json));
    });
  });
  await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const urlAntes = CONFIG.urlApi;
  CONFIG.urlApi = `http://127.0.0.1:${servidor.address().port}`;
  zerarSessaoParaTeste();
  definirSessao(criarSessao({ urlApi: CONFIG.urlApi, token: "token-bom", expiraEmSegundos: 3600, usuario: { email: "ana@exemplo.com" } }), { armazenamento: null });
  try {
    await corpo(pedidos);
  } finally {
    CONFIG.urlApi = urlAntes;
    zerarSessaoParaTeste();
    await new Promise((pronto) => servidor.close(pronto));
  }
}

test("enviar: vai como multipart, com o token, e volta 'em análise'", async () => {
  await comServidor(() => [201, { id: 9, ...CERTO, situacao: "PENDENTE", motivoRecusa: null, dataCriacao: "2026-11-16T14:00:00-03:00", dataAnalise: null, temFoto: false }], async (pedidos) => {
    const criado = await enviarRelato(CERTO);
    assert.equal(criado.situacao, "PENDENTE");
    assert.equal(pedidos[0].metodo, "POST");
    assert.equal(pedidos[0].caminho, "/ocorrencias");
    assert.equal(pedidos[0].autorizacao, "Bearer token-bom");
    assert.match(pedidos[0].tipo, /^multipart\/form-data; boundary=/);
    assert.match(pedidos[0].corpo, /name="tipo"\r\n\r\nBUEIRO_ENTUPIDO/);
  });
});

test("enviar: foto grande demais (413) e relatos demais (429) viram texto para a tela", async () => {
  await comServidor(() => [413, { detail: "O arquivo passa do tamanho máximo (5 MB).", codigo: "ARQUIVO_GRANDE" }], async () => {
    await assert.rejects(enviarRelato(CERTO), (erro) => erro.status === 413 && /5 MB/.test(erro.message));
  });
  await comServidor(() => [429, { detail: "Você já mandou 5 relatos na última hora.", codigo: "TENTATIVAS_EXCEDIDAS" }], async () => {
    await assert.rejects(enviarRelato(CERTO), (erro) => erro.status === 429 && /muitos relatos/.test(erro.message));
  });
});

test("os relatos do mapa são públicos (sem token); os meus levam o token", async () => {
  await comServidor((pedido) => (pedido.caminho === "/ocorrencias"
    ? [200, [{ id: 1, tipo: "OUTRO", descricao: "x", latitude: -23.5, longitude: -46.6, fotoUrl: null }, { id: 2, tipo: "OUTRO", latitude: null, longitude: null }]]
    : [200, [{ id: 1, tipo: "OUTRO", descricao: "x", latitude: -23.5, longitude: -46.6, situacao: "APROVADA", temFoto: false }]]), async (pedidos) => {
    assert.deepEqual((await buscarRelatos()).map((r) => r.id), ["1"]);
    assert.equal(pedidos[0].autorizacao, null);
    assert.equal((await buscarMeusRelatos())[0].situacao, "APROVADA");
    assert.equal(pedidos[1].autorizacao, "Bearer token-bom");
  });
});
