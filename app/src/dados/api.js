// Conversa com o backend Java.
//
// Rotas públicas (o mapa funciona sem conta): GET /previsoes, um item por sensor com a última
// previsão e a última leitura. A conversão para o formato do app fica em modelo.js.
// Rotas da conta: login, cadastro e /usuarios/me (ver src/conta/ContaContexto.jsx).
//
// O que o backend precisa garantir para isto funcionar no navegador:
//   - /previsoes acessível sem login (o mapa é público);
//   - CORS liberado para a origem do app;
//   - latitude, longitude e vizinhança do sensor em cada item.
//
// O TOKEN SÓ VAI NAS ROTAS QUE PRECISAM DELE (`comConta: true`). Nas públicas ele não é enviado:
// o backend recusa com 401 qualquer pedido que leve um token vencido, mesmo numa rota aberta, e o
// mapa não pode parar porque a sessão venceu.

import { CONFIG } from "../config.js";
import { definirSessao, sessaoAtual } from "../conta/sessao.js";
import { normalizarAlerta } from "./alertas.js";
import { normalizarPrevisao } from "./modelo.js";

/**
 * Erro de comunicação com o backend, com uma mensagem que pode ir para a tela.
 *   status   código HTTP (0 quando não houve resposta)
 *   codigo   o `codigo` do erro do backend, ex.: "DADOS_INVALIDOS", "TENTATIVAS_EXCEDIDAS"
 *   campos   { campo: mensagem } quando o backend recusou campos de um formulário
 *   esperaSegundos  quanto esperar antes de tentar de novo (cabeçalho Retry-After do 429)
 */
export class ErroApi extends Error {
  constructor(mensagem, { causa = null, status = 0, codigo = null, campos = null, esperaSegundos = null } = {}) {
    super(mensagem);
    this.name = "ErroApi";
    this.causa = causa;
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
    this.esperaSegundos = esperaSegundos;
  }
}

/** "em 15 minutos", "em 40 segundos" */
export function textoDaEspera(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return "daqui a pouco";
  if (segundos < 90) return `em ${Math.ceil(segundos)} segundos`;
  return `em ${Math.ceil(segundos / 60)} minutos`;
}

/** Transforma uma resposta de erro do backend (ProblemDetail) num ErroApi com texto para a tela. */
async function erroDaResposta(resposta, mensagens) {
  let corpo = null;
  try {
    corpo = await resposta.json();
  } catch {
    // Erro sem corpo (ou que não é JSON): vale a mensagem pelo código.
  }
  const status = resposta.status;
  const codigo = corpo?.codigo ?? null;
  const campos = corpo?.erros && typeof corpo.erros === "object" ? corpo.erros : null;
  const esperaSegundos = Number(resposta.headers.get("Retry-After")) || null;

  let mensagem = mensagens?.[status] ?? null;
  if (!mensagem && status === 429) mensagem = `Muitas tentativas. Tente de novo ${textoDaEspera(esperaSegundos)}.`;
  if (!mensagem && campos) mensagem = Object.values(campos)[0];
  // 4xx traz um texto escrito para a pessoa (`detail`); 5xx não: o detalhe seria técnico.
  if (!mensagem && status >= 400 && status < 500 && typeof corpo?.detail === "string") mensagem = corpo.detail;
  if (!mensagem) mensagem = `O servidor respondeu com erro (${status}).`;
  return new ErroApi(mensagem, { status, codigo, campos, esperaSegundos });
}

/**
 * Faz um pedido ao backend.
 *
 * @param {string} caminho  ex.: "/previsoes"
 * @param {object} [opcoes]
 * @param {string}  [opcoes.metodo]     "GET" (padrão), "POST", "PATCH", "PUT", "DELETE"
 * @param {object}  [opcoes.corpo]      enviado como JSON
 * @param {FormData} [opcoes.formulario] enviado como multipart (foto de um relato)
 * @param {boolean} [opcoes.comConta]   manda o token; sem sessão, nem tenta (erro 401 local)
 * @param {object}  [opcoes.mensagens]  texto para a tela por código HTTP, ex.: { 401: "E-mail ou senha inválidos." }
 * @param {"json"|"blob"|"nada"} [opcoes.resposta]  o que devolver (padrão "json"; 204 devolve null)
 * @param {number}  [opcoes.tempoLimiteMs]
 */
export async function pedir(caminho, { metodo = "GET", corpo, formulario, comConta = false, mensagens, resposta: tipo = "json", tempoLimiteMs = CONFIG.tempoLimiteMs } = {}) {
  const cabecalhos = { Accept: tipo === "blob" ? "*/*" : "application/json" };
  let sessao = null;
  if (comConta) {
    sessao = sessaoAtual();
    if (!sessao) throw new ErroApi("Entre na sua conta para continuar.", { status: 401, codigo: "SEM_SESSAO" });
    cabecalhos.Authorization = `Bearer ${sessao.token}`;
  }
  if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
  try {
    const resposta = await fetch(`${CONFIG.urlApi}${caminho}`, {
      method: metodo,
      signal: controle.signal,
      headers: cabecalhos,
      body: formulario ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
    });
    if (!resposta.ok) {
      // 401 num pedido que levou o token: a sessão não vale mais (venceu, a conta foi desativada
      // ou excluída). Ela é apagada aqui, num lugar só; as telas ficam sabendo pelo ContaContexto.
      if (resposta.status === 401 && sessao) {
        if (sessaoAtual()?.token === sessao.token) definirSessao(null, { motivo: "expirada" });
        throw new ErroApi("Sua sessão expirou. Entre de novo.", { status: 401, codigo: "SESSAO_EXPIRADA" });
      }
      throw await erroDaResposta(resposta, mensagens);
    }
    if (tipo === "nada" || resposta.status === 204) return null;
    return tipo === "blob" ? await resposta.blob() : await resposta.json();
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro;
    if (erro.name === "AbortError") throw new ErroApi("O servidor demorou demais para responder.", { causa: erro });
    throw new ErroApi("Não foi possível falar com o servidor.", { causa: erro });
  } finally {
    clearTimeout(relogio);
  }
}

const pedirJson = (caminho) => pedir(caminho);

/* ───────────── Conta ───────────── */

/** POST /auth/login → { token, tipo, expiraEmSegundos } */
export function entrarNoServidor(email, senha) {
  return pedir("/auth/login", { metodo: "POST", corpo: { email, senha }, mensagens: { 401: "E-mail ou senha inválidos." } });
}

/** POST /usuarios: cria a conta. `dados` no formato do CriarUsuarioRequest do backend. */
export function criarContaNoServidor(dados) {
  return pedir("/usuarios", { metodo: "POST", corpo: dados, mensagens: { 409: "Já existe uma conta com este e-mail ou telefone." } });
}

/**
 * GET /usuarios/me com um token que ainda não virou sessão (logo depois do login).
 * Depois que a sessão existe, use `pedir("/usuarios/me", { comConta: true })`.
 */
export async function buscarPerfilCom(token) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), CONFIG.tempoLimiteMs);
  try {
    const resposta = await fetch(`${CONFIG.urlApi}/usuarios/me`, {
      signal: controle.signal, headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) throw await erroDaResposta(resposta, { 401: "Não foi possível abrir a conta. Tente entrar de novo." });
    return await resposta.json();
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro;
    throw new ErroApi("Não foi possível falar com o servidor.", { causa: erro });
  } finally {
    clearTimeout(relogio);
  }
}

/* ───────────── Mapa ───────────── */

/**
 * Busca a situação de todos os sensores.
 * @returns {Promise<{ pontos: object[], semPosicao: number }>} `semPosicao` conta os itens que
 *   vieram sem latitude/longitude e por isso ficaram fora do mapa.
 */
export async function buscarPontos() {
  const corpo = await pedirJson("/previsoes");
  // Aceita lista direta ou página do Spring ({ content: [...] }).
  const itens = Array.isArray(corpo) ? corpo : corpo?.content;
  if (!Array.isArray(itens)) throw new ErroApi("O servidor respondeu num formato inesperado.");

  const pontos = itens.map(normalizarPrevisao).filter(Boolean);
  const semPosicao = itens.length - pontos.length;
  if (semPosicao > 0) {
    console.warn(`[SIMA] ${semPosicao} item(ns) de /previsoes vieram sem id ou posição e ficaram fora do mapa.`);
  }
  return { pontos, semPosicao };
}

/**
 * Alertas ativos (GET /alertas?status=ATIVO, público). São criados pelo backend a partir da
 * leitura do sensor; a previsão da IA não gera alerta.
 */
export async function buscarAlertas() {
  const corpo = await pedirJson("/alertas?status=ATIVO");
  const itens = Array.isArray(corpo) ? corpo : corpo?.content;
  if (!Array.isArray(itens)) throw new ErroApi("O servidor respondeu num formato inesperado.");
  return itens.map(normalizarAlerta).filter(Boolean);
}
