// O que a conta faz, sem React: entrar, criar, sair, mudar o perfil e apagar. As telas chegam
// aqui pelo ContaContexto; os testes chamam direto, com um servidor de mentira.
//
// Rotas do backend (ver backend/README.md): POST /auth/login, POST /usuarios, GET e PATCH
// /usuarios/me, DELETE /usuarios/me. Não há rota de logout: sair é apagar o token do aparelho.

import { CONFIG } from "../config.js";
import { buscarPerfilCom, criarContaNoServidor, entrarNoServidor, pedir } from "../dados/api.js";
import { PONTOS_CAPITAL } from "../dados/pontosCapital.js";
import { criarSessao, definirSessao, sessaoAtual } from "./sessao.js";

/** A conta depende do servidor: na demonstração (sem backend) as telas explicam e não chamam rede. */
export const contaDisponivel = () => Boolean(CONFIG.urlApi);

const limparEmail = (email) => String(email ?? "").trim().toLowerCase();

/** Só os números do telefone: "(11) 91234-5678" → "11912345678". */
export const soDigitos = (texto) => String(texto ?? "").replace(/\D/g, "");

/**
 * A localização de referência vai com 3 casas decimais (cerca de 100 m): basta para avisar de um
 * alerta por perto e não aponta a casa de ninguém. O backend arredonda de novo, por garantia.
 */
export const arredondar = (valor) => Math.round(Number(valor) * 1000) / 1000;

/**
 * Bairros para escolher como localização de referência, com o centro dos bueiros monitorados de
 * cada um. É a opção para quem não quer (ou não pode) usar a posição do aparelho.
 */
export const BAIRROS_DE_REFERENCIA = (() => {
  const grupos = new Map();
  for (const p of PONTOS_CAPITAL) {
    const g = grupos.get(p.bairro) ?? { nome: p.bairro, lat: 0, lon: 0, total: 0 };
    g.lat += p.lat; g.lon += p.lon; g.total += 1;
    grupos.set(p.bairro, g);
  }
  return [...grupos.values()]
    .map((g) => ({ nome: g.nome, latitude: arredondar(g.lat / g.total), longitude: arredondar(g.lon / g.total) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
})();

/**
 * Confere o formulário de cadastro antes de mandar, com as mesmas regras do backend
 * (CriarUsuarioRequest). Devolve { campo: mensagem }; vazio = pode enviar.
 */
export function validarCadastro({ email, telefone, senha, latitude, longitude, aceiteTermos }) {
  const erros = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limparEmail(email))) erros.email = "Digite um e-mail válido.";
  const digitos = soDigitos(telefone);
  if (digitos.length < 10 || digitos.length > 11) erros.telefone = "Digite o telefone com DDD (10 ou 11 números).";
  if (String(senha ?? "").length < 8) erros.senha = "A senha precisa ter pelo menos 8 caracteres.";
  else if (String(senha).length > 72) erros.senha = "A senha pode ter até 72 caracteres.";
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) erros.localizacao = "Escolha a localização de referência.";
  if (aceiteTermos !== true) erros.aceiteTermos = "Confirme que leu como os seus dados são usados.";
  return erros;
}

/** Entra com e-mail e senha: pega o token, busca o perfil e guarda a sessão. */
export async function entrar(email, senha) {
  const login = await entrarNoServidor(limparEmail(email), senha);
  const usuario = await buscarPerfilCom(login.token);
  const sessao = criarSessao({ urlApi: CONFIG.urlApi, token: login.token, expiraEmSegundos: login.expiraEmSegundos, usuario });
  definirSessao(sessao);
  return sessao;
}

/** Cria a conta e já entra com ela. */
export async function cadastrar({ email, telefone, senha, latitude, longitude, permissaoAlerta, aceiteTermos }) {
  await criarContaNoServidor({
    email: limparEmail(email),
    telefone: soDigitos(telefone),
    senha,
    latitude: arredondar(latitude),
    longitude: arredondar(longitude),
    permissaoAlerta: permissaoAlerta === true,
    aceiteTermos: aceiteTermos === true,
  });
  return entrar(email, senha);
}

/** Sai: apaga a sessão do aparelho. Não depende do servidor responder. */
export function sair() {
  definirSessao(null, { motivo: "saiu" });
}

/** Muda só os campos enviados (telefone, latitude+longitude, permissaoAlerta) e atualiza a sessão. */
export async function atualizarPerfil(mudancas) {
  const corpo = { ...mudancas };
  if (corpo.telefone !== undefined) corpo.telefone = soDigitos(corpo.telefone);
  if (corpo.latitude !== undefined) corpo.latitude = arredondar(corpo.latitude);
  if (corpo.longitude !== undefined) corpo.longitude = arredondar(corpo.longitude);
  const usuario = await pedir("/usuarios/me", { metodo: "PATCH", corpo, comConta: true,
    mensagens: { 409: "Este telefone já está em outra conta." } });
  const sessao = sessaoAtual();
  if (sessao) definirSessao({ ...sessao, usuario });
  return usuario;
}

/** Apaga a conta no servidor e, dando certo, a sessão do aparelho. */
export async function apagarConta() {
  await pedir("/usuarios/me", { metodo: "DELETE", comConta: true, resposta: "nada" });
  definirSessao(null, { motivo: "excluida" });
}

/** "Cidadão" ou "Administrador". */
export function rotuloDoTipo(tipoUsuario) {
  return tipoUsuario === "ADMIN" ? "Administrador" : "Cidadão";
}

/** "(11) 91234-5678" */
export function telefoneFormatado(telefone) {
  const d = soDigitos(telefone);
  if (d.length < 10) return d;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}
