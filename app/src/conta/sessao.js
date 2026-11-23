// Sessão da conta: o token que o backend devolve no login, guardado no aparelho.
//
// Fica fora do React de propósito: quem conversa com o backend (src/dados/api.js) precisa do token
// e de apagar a sessão quando o servidor responde 401, e as telas precisam saber quando isso
// acontece. Este arquivo é a fonte única; o ContaContexto só assina as mudanças.
//
// O que é guardado (chave "sima.conta", no padrão das outras chaves "sima.*"):
//   { urlApi, token, expiraEm (ms), usuario: { email, telefone, latitude, longitude, permissaoAlerta, tipoUsuario } }
// A senha nunca é guardada. A sessão vale para UM backend: trocou o endereço, ela é descartada.

const CHAVE = "sima.conta";

/** Folga antes do vencimento: um token que vence em segundos não serve para começar um pedido. */
const FOLGA_MS = 30 * 1000;

let atual = null;        // a sessão em vigor, ou null
let carregada = false;   // a leitura do aparelho já foi feita?
const ouvintes = new Set();

const armazenamentoPadrao = () => (typeof localStorage === "undefined" ? null : localStorage);

/** Uma sessão guardada ainda serve? Precisa ser deste backend, ter token e não ter vencido. */
export function sessaoValida(sessao, urlApi, agora = Date.now()) {
  return Boolean(sessao && typeof sessao.token === "string" && sessao.token && sessao.urlApi === urlApi
    && Number.isFinite(sessao.expiraEm) && sessao.expiraEm - FOLGA_MS > agora);
}

/** Lê a sessão guardada no aparelho; devolve null (e apaga o que estava lá) se não servir mais. */
export function lerSessaoGuardada(urlApi, { armazenamento = armazenamentoPadrao(), agora = Date.now() } = {}) {
  if (!armazenamento) return null;
  try {
    const guardada = JSON.parse(armazenamento.getItem(CHAVE) || "null");
    if (sessaoValida(guardada, urlApi, agora)) return guardada;
    if (guardada) armazenamento.removeItem(CHAVE);
  } catch {
    // Texto estragado ou aparelho sem armazenamento: é como não ter sessão.
  }
  return null;
}

/** Monta a sessão a partir da resposta do login (`expiraEmSegundos`) e do perfil. */
export function criarSessao({ urlApi, token, expiraEmSegundos, usuario }, agora = Date.now()) {
  return { urlApi, token, expiraEm: agora + Number(expiraEmSegundos) * 1000, usuario };
}

/** Carrega a sessão do aparelho uma vez, ao abrir o app. */
export function iniciarSessao(urlApi, opcoes) {
  atual = lerSessaoGuardada(urlApi, opcoes);
  carregada = true;
  return atual;
}

/** A sessão em vigor (ou null). Uma sessão que venceu com o app aberto deixa de valer aqui. */
export function sessaoAtual(agora = Date.now()) {
  if (atual && !sessaoValida(atual, atual.urlApi, agora)) definirSessao(null, { motivo: "expirada" });
  return atual;
}

/**
 * Troca a sessão: guarda no aparelho e avisa quem assina.
 * @param {object|null} sessao
 * @param {{ motivo?: "saiu"|"expirada"|"excluida", armazenamento?: Storage }} [opcoes]
 */
export function definirSessao(sessao, { motivo = null, armazenamento = armazenamentoPadrao() } = {}) {
  atual = sessao;
  carregada = true;
  try {
    if (sessao) armazenamento?.setItem(CHAVE, JSON.stringify(sessao));
    else armazenamento?.removeItem(CHAVE);
  } catch {
    // Sem espaço ou em aba anônima: a sessão vale só enquanto o app estiver aberto.
  }
  for (const ouvinte of ouvintes) ouvinte(sessao, motivo);
}

/** Assina as mudanças de sessão. Devolve a função que cancela. */
export function aoMudarSessao(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Só para os testes: volta ao estado de app recém-aberto. */
export function zerarSessaoParaTeste() {
  atual = null;
  carregada = false;
  ouvintes.clear();
}

export const sessaoFoiCarregada = () => carregada;
