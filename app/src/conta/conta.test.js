// Testes da conta: a sessão guardada no aparelho e a conversa com o backend, contra um servidor
// de mentira (http do próprio Node) que responde como o backend responde. Rodar com: npm test

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { CONFIG } from "../config.js";
import { ErroApi, pedir, textoDaEspera } from "../dados/api.js";
import {
  BAIRROS_DE_REFERENCIA, apagarConta, arredondar, atualizarPerfil, cadastrar, contaDisponivel, entrar, sair, soDigitos, telefoneFormatado,
  validarCadastro,
} from "./conta.js";
import { aoMudarSessao, criarSessao, definirSessao, iniciarSessao, lerSessaoGuardada, sessaoAtual, sessaoValida, zerarSessaoParaTeste } from "./sessao.js";

/** Um localStorage de mentira. */
function armazenamentoFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
    dados,
  };
}

const URL_API = "http://servidor.teste";
const AGORA = Date.UTC(2026, 10, 16, 15, 0, 0);
const USUARIO = { email: "ana@exemplo.com", telefone: "11912345678", latitude: -23.515, longitude: -46.584, permissaoAlerta: true, tipoUsuario: "CIDADAO", ativo: true };

/* ───────────── Sessão ───────────── */

test("sessão: guarda, lê de volta e descarta quando venceu", () => {
  zerarSessaoParaTeste();
  const armazenamento = armazenamentoFalso();
  const sessao = criarSessao({ urlApi: URL_API, token: "abc", expiraEmSegundos: 3600, usuario: USUARIO }, AGORA);
  assert.equal(sessao.expiraEm, AGORA + 3600 * 1000);
  definirSessao(sessao, { armazenamento });

  assert.deepEqual(lerSessaoGuardada(URL_API, { armazenamento, agora: AGORA + 60_000 }), sessao);
  // Passou da validade: some do aparelho.
  assert.equal(lerSessaoGuardada(URL_API, { armazenamento, agora: AGORA + 3600 * 1000 }), null);
  assert.equal(armazenamento.getItem("sima.conta"), null);
});

test("sessão: não vale para outro backend, nem sem token, nem com texto estragado", () => {
  const sessao = criarSessao({ urlApi: URL_API, token: "abc", expiraEmSegundos: 3600, usuario: USUARIO }, AGORA);
  assert.equal(sessaoValida(sessao, "http://outro.servidor", AGORA), false);
  assert.equal(sessaoValida({ ...sessao, token: "" }, URL_API, AGORA), false);
  assert.equal(sessaoValida(null, URL_API, AGORA), false);
  assert.equal(lerSessaoGuardada(URL_API, { armazenamento: armazenamentoFalso({ "sima.conta": "{isto não é json" }), agora: AGORA }), null);
});

test("sessão: a que vence com o app aberto deixa de valer e avisa o motivo", () => {
  zerarSessaoParaTeste();
  const armazenamento = armazenamentoFalso();
  definirSessao(criarSessao({ urlApi: URL_API, token: "abc", expiraEmSegundos: 60, usuario: USUARIO }, Date.now()), { armazenamento });
  const avisos = [];
  aoMudarSessao((sessao, motivo) => avisos.push([sessao, motivo]));
  assert.ok(sessaoAtual());
  assert.equal(sessaoAtual(Date.now() + 120_000), null);
  assert.deepEqual(avisos, [[null, "expirada"]]);
});

test("sessão: ao abrir o app, carrega a guardada", () => {
  zerarSessaoParaTeste();
  const sessao = criarSessao({ urlApi: URL_API, token: "abc", expiraEmSegundos: 3600, usuario: USUARIO }, AGORA);
  const armazenamento = armazenamentoFalso({ "sima.conta": JSON.stringify(sessao) });
  assert.deepEqual(iniciarSessao(URL_API, { armazenamento, agora: AGORA }), sessao);
});

/* ───────────── Formulário ───────────── */

test("cadastro: confere os campos com as regras do backend", () => {
  const certo = { email: "ana@exemplo.com", telefone: "(11) 91234-5678", senha: "senha-segura-1", latitude: -23.5, longitude: -46.6, aceiteTermos: true };
  assert.deepEqual(validarCadastro(certo), {});
  assert.deepEqual(Object.keys(validarCadastro({ ...certo, email: "ana", telefone: "123", senha: "curta", latitude: undefined, aceiteTermos: false })).sort(),
    ["aceiteTermos", "email", "localizacao", "senha", "telefone"]);
  assert.ok(validarCadastro({ ...certo, senha: "x".repeat(73) }).senha);
});

test("telefone e localização: só números, 3 casas decimais", () => {
  assert.equal(soDigitos("(11) 91234-5678"), "11912345678");
  assert.equal(telefoneFormatado("11912345678"), "(11) 91234-5678");
  assert.equal(telefoneFormatado("1132345678"), "(11) 3234-5678");
  assert.equal(arredondar(-23.5152049), -23.515);
  assert.equal(arredondar("-46.58449"), -46.584);
});

test("bairros de referência: em ordem, com posição arredondada dentro de São Paulo", () => {
  assert.ok(BAIRROS_DE_REFERENCIA.length > 10);
  for (const b of BAIRROS_DE_REFERENCIA) {
    assert.ok(b.latitude < -23.3 && b.latitude > -23.9 && b.longitude < -46.3 && b.longitude > -46.9, b.nome);
    assert.equal(b.latitude, arredondar(b.latitude));
  }
  const nomes = BAIRROS_DE_REFERENCIA.map((b) => b.nome);
  assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
});

test("espera do 429 em palavras", () => {
  assert.equal(textoDaEspera(40), "em 40 segundos");
  assert.equal(textoDaEspera(840), "em 14 minutos");
  assert.equal(textoDaEspera(null), "daqui a pouco");
});

/* ───────────── Com o servidor de mentira ───────────── */

/**
 * Sobe um servidor que imita o backend: login, cadastro e /usuarios/me. Guarda cada pedido
 * recebido em `pedidos` para os testes conferirem o que o app mandou.
 */
async function servidorDeMentira() {
  const estado = { pedidos: [], usuario: { ...USUARIO }, tokenValido: "token-bom", errosDeSenha: 0 };
  const servidor = http.createServer((req, res) => {
    let texto = "";
    req.on("data", (pedaco) => { texto += pedaco; });
    req.on("end", () => {
      const corpo = texto ? JSON.parse(texto) : null;
      estado.pedidos.push({ metodo: req.method, caminho: req.url, autorizacao: req.headers.authorization ?? null, corpo });
      const responder = (status, json, cabecalhos = {}) => {
        res.writeHead(status, { "Content-Type": json === undefined ? "text/plain" : "application/json", ...cabecalhos });
        res.end(json === undefined ? "" : JSON.stringify(json));
      };
      const autorizado = req.headers.authorization === `Bearer ${estado.tokenValido}`;

      if (req.method === "POST" && req.url === "/auth/login") {
        if (estado.errosDeSenha >= 5) return responder(429, { detail: "Muitas tentativas de login.", codigo: "TENTATIVAS_EXCEDIDAS" }, { "Retry-After": "840" });
        if (corpo.senha !== "senha-segura-1") { estado.errosDeSenha += 1; return responder(401, { detail: "E-mail ou senha inválidos", codigo: "CREDENCIAIS_INVALIDAS" }); }
        return responder(200, { token: estado.tokenValido, tipo: "Bearer", expiraEmSegundos: 3600 });
      }
      if (req.method === "POST" && req.url === "/usuarios") {
        if (corpo.email === "repetido@exemplo.com") return responder(409, { detail: "Recurso já existe", codigo: "RECURSO_EXISTENTE" });
        if (corpo.aceiteTermos !== true) return responder(400, { detail: "Um ou mais campos estão inválidos.", codigo: "DADOS_INVALIDOS", erros: { aceiteTermos: "Confirme que leu como os seus dados são usados." } });
        estado.usuario = { ...USUARIO, ...corpo, senha: undefined, aceiteTermos: undefined };
        return responder(201, estado.usuario);
      }
      if (req.url === "/usuarios/me") {
        if (!autorizado) return responder(401);
        if (req.method === "GET") return responder(200, estado.usuario);
        if (req.method === "PATCH") { estado.usuario = { ...estado.usuario, ...corpo }; return responder(200, estado.usuario); }
        if (req.method === "DELETE") return responder(204);
      }
      if (req.method === "POST" && req.url === "/auth/logout") {
        if (!autorizado) return responder(401);
        estado.tokenValido = "token-cancelado-no-logout";
        return responder(204);
      }
      if (req.url === "/previsoes") return responder(200, []);
      return responder(404, { detail: "Não encontrado" });
    });
  });
  await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  estado.url = `http://127.0.0.1:${servidor.address().port}`;
  estado.fechar = () => new Promise((pronto) => servidor.close(pronto));
  return estado;
}

/** Roda um teste com o app apontado para o servidor de mentira e a sessão zerada. */
function comServidor(nome, corpo) {
  test(nome, async () => {
    const servidor = await servidorDeMentira();
    const urlAntes = CONFIG.urlApi;
    CONFIG.urlApi = servidor.url;
    zerarSessaoParaTeste();
    try {
      await corpo(servidor);
    } finally {
      CONFIG.urlApi = urlAntes;
      zerarSessaoParaTeste();
      await servidor.fechar();
    }
  });
}

test("demonstração (sem backend): a conta não está disponível", () => {
  assert.equal(CONFIG.urlApi, "");
  assert.equal(contaDisponivel(), false);
});

comServidor("entrar: guarda a sessão com o perfil e o e-mail vai em minúsculas", async (servidor) => {
  const sessao = await entrar("  Ana@Exemplo.com ", "senha-segura-1");
  assert.equal(sessao.usuario.email, "ana@exemplo.com");
  assert.equal(sessaoAtual().token, "token-bom");
  assert.equal(servidor.pedidos[0].corpo.email, "ana@exemplo.com");
  assert.equal(servidor.pedidos[1].autorizacao, "Bearer token-bom");
});

comServidor("entrar: senha errada dá a mensagem certa e não cria sessão; depois de 5, diz quanto esperar", async () => {
  for (let i = 0; i < 5; i++) {
    await assert.rejects(entrar("ana@exemplo.com", "errada"), (erro) => erro instanceof ErroApi && erro.status === 401 && erro.message === "E-mail ou senha inválidos.");
  }
  assert.equal(sessaoAtual(), null);
  await assert.rejects(entrar("ana@exemplo.com", "senha-segura-1"),
    (erro) => erro.status === 429 && erro.esperaSegundos === 840 && erro.message === "Muitas tentativas. Tente de novo em 14 minutos.");
});

comServidor("cadastrar: manda o que o backend espera e já entra", async (servidor) => {
  await cadastrar({ email: "Nova@Exemplo.com", telefone: "(11) 91234-5678", senha: "senha-segura-1", latitude: -23.5152049, longitude: -46.58449,
    permissaoAlerta: true, aceiteTermos: true });
  assert.deepEqual(servidor.pedidos[0].corpo, { email: "nova@exemplo.com", telefone: "11912345678", senha: "senha-segura-1",
    latitude: -23.515, longitude: -46.584, permissaoAlerta: true, aceiteTermos: true });
  assert.equal(sessaoAtual().usuario.email, "nova@exemplo.com");
});

comServidor("cadastrar: e-mail repetido e campo recusado chegam como texto para a tela", async () => {
  const base = { telefone: "11912345678", senha: "senha-segura-1", latitude: -23.5, longitude: -46.6, permissaoAlerta: false };
  await assert.rejects(cadastrar({ ...base, email: "repetido@exemplo.com", aceiteTermos: true }),
    (erro) => erro.status === 409 && erro.message === "Já existe uma conta com este e-mail ou telefone.");
  await assert.rejects(cadastrar({ ...base, email: "x@exemplo.com", aceiteTermos: false }),
    (erro) => erro.status === 400 && erro.campos.aceiteTermos === "Confirme que leu como os seus dados são usados." && erro.message === erro.campos.aceiteTermos);
  assert.equal(sessaoAtual(), null);
});

comServidor("o token só vai nas rotas da conta; as públicas não levam", async (servidor) => {
  await entrar("ana@exemplo.com", "senha-segura-1");
  await pedir("/previsoes");
  await pedir("/usuarios/me", { comConta: true });
  const [, , previsoes, perfil] = servidor.pedidos;
  assert.equal(previsoes.autorizacao, null);
  assert.equal(perfil.autorizacao, "Bearer token-bom");
});

comServidor("sem sessão, uma rota da conta nem chega ao servidor", async (servidor) => {
  await assert.rejects(pedir("/usuarios/me", { comConta: true }), (erro) => erro.status === 401 && erro.codigo === "SEM_SESSAO");
  assert.equal(servidor.pedidos.length, 0);
});

comServidor("401 com sessão: a sessão é apagada, o motivo é 'expirada' e o mapa continua", async (servidor) => {
  await entrar("ana@exemplo.com", "senha-segura-1");
  const motivos = [];
  aoMudarSessao((sessao, motivo) => motivos.push(motivo));
  servidor.tokenValido = "outro-token"; // o servidor deixou de aceitar o token (conta desativada, por exemplo)

  await assert.rejects(pedir("/usuarios/me", { comConta: true }), (erro) => erro.codigo === "SESSAO_EXPIRADA" && erro.message === "Sua sessão expirou. Entre de novo.");
  assert.equal(sessaoAtual(), null);
  assert.deepEqual(motivos, ["expirada"]);
  assert.deepEqual(await pedir("/previsoes"), []); // a rota pública segue respondendo
});

comServidor("perfil: muda só o que foi enviado e a sessão acompanha", async (servidor) => {
  await entrar("ana@exemplo.com", "senha-segura-1");
  await atualizarPerfil({ permissaoAlerta: false });
  assert.deepEqual(servidor.pedidos.at(-1).corpo, { permissaoAlerta: false });
  assert.equal(sessaoAtual().usuario.permissaoAlerta, false);
  await atualizarPerfil({ latitude: -23.61234, longitude: -46.70049 });
  assert.deepEqual(servidor.pedidos.at(-1).corpo, { latitude: -23.612, longitude: -46.7 });
});

comServidor("sair apaga a sessão na hora e cancela o token no servidor", async (servidor) => {
  await entrar("ana@exemplo.com", "senha-segura-1");
  let removeuPush = false;
  const push = new Promise((pronto) => setTimeout(() => { removeuPush = true; pronto(); }, 20));
  const fim = sair({ depoisDe: push });
  assert.equal(sessaoAtual(), null, "a sessão some antes de o servidor responder");
  await fim;
  assert.ok(removeuPush, "o logout espera a remoção do push");
  const logout = servidor.pedidos.at(-1);
  assert.equal(logout.metodo, "POST");
  assert.equal(logout.caminho, "/auth/logout");
  assert.equal(logout.autorizacao, "Bearer token-bom");
  assert.equal(servidor.tokenValido, "token-cancelado-no-logout");
});

comServidor("sair com o servidor fora do ar: a sessão some do mesmo jeito", async (servidor) => {
  await entrar("ana@exemplo.com", "senha-segura-1");
  await servidor.fechar(); // servidor fora do ar
  servidor.fechar = async () => {};
  await sair();
  assert.equal(sessaoAtual(), null);
});

comServidor("sair sem estar logado não chama o servidor", async (servidor) => {
  await sair();
  assert.equal(servidor.pedidos.length, 0);
});

comServidor("apagar a conta: DELETE no servidor e a sessão some", async (servidor) => {
  await entrar("ana@exemplo.com", "senha-segura-1");
  const motivos = [];
  aoMudarSessao((sessao, motivo) => motivos.push(motivo));
  await apagarConta();
  assert.equal(servidor.pedidos.at(-1).metodo, "DELETE");
  assert.equal(sessaoAtual(), null);
  assert.deepEqual(motivos, ["excluida"]);
});

test("servidor fora do ar: erro com texto para a tela, sem estourar", async () => {
  const urlAntes = CONFIG.urlApi;
  CONFIG.urlApi = "http://127.0.0.1:1";
  try {
    await assert.rejects(entrar("ana@exemplo.com", "senha-segura-1"), (erro) => erro instanceof ErroApi && erro.status === 0 && erro.message === "Não foi possível falar com o servidor.");
  } finally {
    CONFIG.urlApi = urlAntes;
  }
});
