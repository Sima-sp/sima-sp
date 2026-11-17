// Testes da notificação no celular, com um navegador de mentira. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";

import { TEXTO_DO_PUSH, chaveParaBytes, desligarPush, ligarPush, situacaoDoPush } from "./push.js";

const EMAIL = "ana@exemplo.com";
const CHAVE_PUBLICA = "BMXWIMYyYgaHilYkF_KK3QsThKafVKmjLyCRyn50o3bGa0vN5XAR0OdlPg_d7EWxXQLxWw1h86WzjstcS5Gt9Ag";

/** Um navegador de mentira: permissão, service worker com pushManager e armazenamento. */
function ambienteFalso({ permissao = "default", respostaDoPedido = "granted", agente = "Android Chrome", instalado = false, comSw = true, comPush = true } = {}) {
  const dados = new Map();
  const estado = { inscricao: null, inscricoesFeitas: 0, pediuPermissao: 0 };
  const pushManager = {
    getSubscription: async () => estado.inscricao,
    subscribe: async (opcoes) => {
      estado.inscricoesFeitas += 1;
      estado.opcoes = opcoes;
      estado.inscricao = {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys: { p256dh: "p", auth: "a" } }),
        unsubscribe: async () => { estado.inscricao = null; return true; },
      };
      return estado.inscricao;
    },
  };
  const registro = { pushManager };
  const Notification = {
    permission: permissao,
    requestPermission: async () => { estado.pediuPermissao += 1; Notification.permission = respostaDoPedido; return respostaDoPedido; },
  };
  return {
    estado,
    Notification: comPush ? Notification : undefined,
    temPushManager: comPush,
    serviceWorker: comSw ? { getRegistration: async () => registro, ready: Promise.resolve(registro) } : undefined,
    agente, toques: 5, instalado,
    armazenamento: { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v), removeItem: (k) => dados.delete(k) },
  };
}

/** Um `pedir` de mentira que anota o que foi pedido. */
function pedidoFalso() {
  const feitos = [];
  const pedido = async (caminho, opcoes = {}) => {
    feitos.push({ caminho, ...opcoes });
    if (caminho === "/push/chave-publica") return { chavePublica: CHAVE_PUBLICA };
    if (caminho === "/usuarios/me/push") return { id: 42 };
    return null;
  };
  return { pedido, feitos };
}

test("chave pública: base64url vira os 65 bytes do ponto P-256", () => {
  const bytes = chaveParaBytes(CHAVE_PUBLICA);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
});

test("ligar: pede a permissão, inscreve com a chave do backend e manda a inscrição", async () => {
  const ambiente = ambienteFalso();
  const { pedido, feitos } = pedidoFalso();
  assert.equal(situacaoDoPush(ambiente, EMAIL), "desligada");
  assert.equal(await ligarPush(EMAIL, ambiente, pedido), "ligada");

  assert.equal(ambiente.estado.pediuPermissao, 1);
  assert.equal(ambiente.estado.opcoes.userVisibleOnly, true);
  assert.equal(ambiente.estado.opcoes.applicationServerKey.length, 65);
  assert.deepEqual(feitos.map((f) => [f.metodo ?? "GET", f.caminho, f.comConta ?? false]), [["GET", "/push/chave-publica", false], ["POST", "/usuarios/me/push", true]]);
  assert.deepEqual(feitos[1].corpo.keys, { p256dh: "p", auth: "a" });
  assert.equal(situacaoDoPush(ambiente, EMAIL), "ligada");
});

test("sem permissão, nada vai para o backend", async () => {
  const negou = ambienteFalso({ respostaDoPedido: "denied" });
  const { pedido, feitos } = pedidoFalso();
  assert.equal(await ligarPush(EMAIL, negou, pedido), "bloqueada");
  assert.equal(feitos.length, 0);
  assert.equal(negou.estado.inscricoesFeitas, 0);

  const fechouOPedido = ambienteFalso({ respostaDoPedido: "default" });
  assert.equal(await ligarPush(EMAIL, fechouOPedido, pedido), "desligada");
  assert.equal(feitos.length, 0);
});

test("permissão já bloqueada: nem pede de novo, e a tela explica como reativar", async () => {
  const ambiente = ambienteFalso({ permissao: "denied" });
  const { pedido, feitos } = pedidoFalso();
  assert.equal(await ligarPush(EMAIL, ambiente, pedido), "bloqueada");
  assert.equal(ambiente.estado.pediuPermissao, 0);
  assert.equal(feitos.length, 0);
  assert.match(TEXTO_DO_PUSH.bloqueada, /permita as notificações/);
});

test("ligar de novo no mesmo aparelho não duplica a inscrição", async () => {
  const ambiente = ambienteFalso();
  const { pedido, feitos } = pedidoFalso();
  await ligarPush(EMAIL, ambiente, pedido);
  // A situação guardada some (app reinstalado, por exemplo), mas o navegador ainda tem a inscrição.
  ambiente.armazenamento.removeItem("sima.push");
  await ligarPush(EMAIL, ambiente, pedido);
  assert.equal(ambiente.estado.inscricoesFeitas, 1); // o navegador reaproveita a inscrição
  assert.equal(feitos.filter((f) => f.caminho === "/usuarios/me/push").length, 2); // o backend atualiza a mesma (endpoint único)
  // Com tudo no lugar, ligar outra vez não manda nada.
  await ligarPush(EMAIL, ambiente, pedido);
  assert.equal(feitos.filter((f) => f.caminho === "/usuarios/me/push").length, 2);
});

test("outra conta no mesmo aparelho: a inscrição é registrada para ela", async () => {
  const ambiente = ambienteFalso();
  const { pedido, feitos } = pedidoFalso();
  await ligarPush(EMAIL, ambiente, pedido);
  assert.equal(situacaoDoPush(ambiente, "outra@exemplo.com"), "desligada");
  await ligarPush("outra@exemplo.com", ambiente, pedido);
  assert.equal(feitos.filter((f) => f.caminho === "/usuarios/me/push").length, 2);
});

test("desligar: remove do backend pelo id e cancela no navegador; não falha com o servidor fora", async () => {
  const ambiente = ambienteFalso();
  const { pedido, feitos } = pedidoFalso();
  await ligarPush(EMAIL, ambiente, pedido);
  await desligarPush(ambiente, pedido);
  assert.deepEqual([feitos.at(-1).metodo, feitos.at(-1).caminho], ["DELETE", "/usuarios/me/push/42"]);
  assert.equal(ambiente.estado.inscricao, null);
  assert.equal(situacaoDoPush(ambiente, EMAIL), "desligada");

  await ligarPush(EMAIL, ambiente, pedido);
  await desligarPush(ambiente, async () => { throw new Error("sem conexão"); });
  assert.equal(ambiente.estado.inscricao, null);
});

test("iPhone fora da tela de início: manda instalar; instalado, funciona", async () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)";
  const { pedido, feitos } = pedidoFalso();
  const noSafari = ambienteFalso({ agente: iphone });
  assert.equal(situacaoDoPush(noSafari, EMAIL), "instalar");
  assert.equal(await ligarPush(EMAIL, noSafari, pedido), "instalar");
  assert.equal(feitos.length, 0);
  assert.match(TEXTO_DO_PUSH.instalar, /Tela de Início/);
  assert.equal(situacaoDoPush(ambienteFalso({ agente: iphone, instalado: true }), EMAIL), "desligada");
});

test("navegador sem push e app sem service worker", () => {
  assert.equal(situacaoDoPush(ambienteFalso({ comPush: false }), EMAIL), "sem-suporte");
  assert.equal(situacaoDoPush(ambienteFalso({ comSw: false }), EMAIL), "sem-app");
});
