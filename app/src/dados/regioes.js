// Aviso por região: olha os bueiros de cada região (subprefeitura) em conjunto.
//
// Por que existe: o aviso de um bueiro sozinho erra muito. Nos testes do modelo de IA, de cada 100
// horas com aviso de nível alto num ponto, menos de 2 tiveram alagamento registrado. Juntando os
// pontos da mesma subprefeitura, o aviso de risco alto acertou 8 em cada 100 (5 vezes mais).
// O nível de cada bueiro continua sendo a base do mapa e do desvio de rota; a região é contexto.
//
// A regra é a mesma do serviço de IA (ADR 0005 do ml-service):
//   - só recebe aviso a região com pelo menos 3 pontos monitorados (cobertura mínima);
//   - vale a MAIOR chance entre os pontos da região;
//   - limiares próprios, mais altos que os de um ponto: atenção a partir de 1,02 % e risco alto a
//     partir de 2,10 %. Não existe "crítico" por região.
// O app acrescenta uma coisa que é medição, não previsão: se algum bueiro da região está
// transbordando agora, a região entra em risco alto e o aviso diz isso.
//
// DE ONDE VEM (#50): com backend, o nível de cada região é o de GET /previsoes/regioes (o serviço
// de IA faz a conta; se a regra mudar lá, o app acompanha). O app calcula por conta própria só na
// demonstração, quando a rota responde 503 (IA fora do ar), quando a resposta já venceu ou para
// uma região que o servidor não mandou. As telas só usam o que avisosPorRegiao devolve, e
// `origem` diz de onde veio cada região.
//
// Os nomes das regiões do servidor nem sempre são iguais aos do app ("Freguesia do Ó /
// Brasilândia" e "Freguesia / Brasilândia"): o casamento é pelo primeiro trecho do nome.

import { compararPorGravidade, lerData, nivelVisivel, statusAgora } from "./modelo.js";

export const REGRA_REGIAO = { coberturaMinima: 3, atencao: 0.0102, alto: 0.021 };

/** Nomes do aviso de região. São só dois níveis de aviso; sem aviso, nada é dito. */
export const ROTULO_AVISO = { 2: "Atenção", 3: "Risco alto" };

/* ───────────── A resposta do servidor ───────────── */

const semAcento = (texto) => String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** O primeiro trecho do nome, sem acento: "Freguesia do Ó / Brasilândia" → "freguesia do o". */
const primeiroTrecho = (nome) => semAcento(nome).split("/")[0].replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

/** Nível do aviso de região a partir do texto do servidor: só há "Atenção" (2) e "Risco alto" (3). */
function nivelDoServidor(texto) {
  const t = semAcento(texto).toUpperCase();
  if (t === "ALTO" || t === "CRITICO") return 3;
  if (t === "MEDIO") return 2;
  return null;
}

/**
 * Lê a resposta de GET /previsoes/regioes (RegioesIaResponse do backend).
 * @returns {{ regioes: Array<{ nome, chave, nivel, maiorChance, cobertura }>, validaAte: Date|null, simulada: boolean }|null}
 *   null quando a resposta não tem a lista
 */
export function lerRegioesDoServidor(corpo) {
  if (!corpo || !Array.isArray(corpo.regioes)) return null;
  const regioes = corpo.regioes
    .filter((r) => typeof r?.regiao === "string" && r.regiao.trim())
    .map((r) => ({
      nome: r.regiao.trim(),
      chave: primeiroTrecho(r.regiao),
      cobertura: r.cobertura !== "SEM_COBERTURA",
      nivel: r.cobertura === "SEM_COBERTURA" ? null : nivelDoServidor(r.nivelRisco),
      maiorChance: typeof r.probabilidadeMaxima === "number" ? r.probabilidadeMaxima : null,
    }));
  return { regioes, validaAte: lerData(corpo.validaAte), simulada: corpo.fonteChuva === "INFORMADA" };
}

/**
 * A região do servidor que corresponde a um nome do app, ou null. Igual primeiro; senão, um nome
 * que começa pelo outro seguido de espaço ("freguesia" e "freguesia do o"; mas não "vila maria" e
 * "vila mariana").
 */
export function regiaoDoServidor(nome, doServidor) {
  if (!doServidor?.regioes?.length) return null;
  const chave = primeiroTrecho(nome);
  const iguais = doServidor.regioes.find((r) => r.chave === chave);
  if (iguais) return iguais;
  return doServidor.regioes.find((r) => r.chave.startsWith(`${chave} `) || chave.startsWith(`${r.chave} `)) ?? null;
}

/** A resposta do servidor ainda vale? Vencida, o app volta a calcular. */
export function regioesValidas(doServidor, agora = new Date()) {
  return Boolean(doServidor && (!doServidor.validaAte || doServidor.validaAte.getTime() > agora.getTime()));
}

/* ───────────── O aviso de cada região ───────────── */

/**
 * Situação de cada região.
 * @returns {Array<{
 *   nome: string, total: number,
 *   cobertura: boolean,        // tem pontos suficientes para um aviso de região
 *   nivel: 2|3|null,           // 3 = risco alto, 2 = atenção, null = sem aviso
 *   maiorChance: number|null,  // a maior probabilidade válida entre os pontos
 *   transbordando: number,     // quantos bueiros o sensor mediu transbordando agora
 *   emRisco: number,           // quantos bueiros estão em nível alto ou crítico
 *   pontos: object[],          // do mais grave ao mais tranquilo
 *   origem: "servidor"|"app",  // de onde veio o nível
 * }>} do aviso mais grave para o mais leve; depois as regiões sem aviso, em ordem alfabética.
 *
 * @param {object|null} [doServidor]  o que `lerRegioesDoServidor` devolveu (null = calcular no app)
 */
export function avisosPorRegiao(pontos, agora = new Date(), doServidor = null) {
  const servidor = regioesValidas(doServidor, agora) ? doServidor : null;
  const grupos = new Map();
  for (const ponto of pontos) {
    if (!grupos.has(ponto.bairro)) grupos.set(ponto.bairro, []);
    grupos.get(ponto.bairro).push(ponto);
  }

  const regioes = [...grupos.entries()].map(([nome, lista]) => {
    let maiorChance = null;
    let transbordando = 0;
    let emRisco = 0;
    for (const ponto of lista) {
      if (ponto.medicaoTransbordando) transbordando += 1;
      if (ponto.medicaoTransbordando || (nivelVisivel(ponto, agora) ?? 0) >= 3) emRisco += 1;
      // Só entra na conta a previsão que ainda vale e que veio com probabilidade.
      const chance = statusAgora(ponto, agora) === "VALIDA" ? ponto.probabilidade : null;
      if (chance !== null && chance !== undefined && (maiorChance === null || chance > maiorChance)) maiorChance = chance;
    }
    let cobertura = lista.length >= REGRA_REGIAO.coberturaMinima;
    let nivel = null;
    let origem = "app";
    const daIa = regiaoDoServidor(nome, servidor);
    if (daIa) {
      // O servidor manda: a previsão da região é dele.
      origem = "servidor";
      cobertura = daIa.cobertura;
      nivel = daIa.nivel;
      maiorChance = daIa.maiorChance;
    } else if (cobertura && (maiorChance ?? 0) >= REGRA_REGIAO.alto) nivel = 3;
    else if (cobertura && (maiorChance ?? 0) >= REGRA_REGIAO.atencao) nivel = 2;
    // O que o app acrescenta, nos dois casos: bueiro transbordando agora (medição) põe a região em risco alto.
    if (cobertura && transbordando > 0) nivel = 3;
    return { nome, total: lista.length, cobertura, nivel, maiorChance, transbordando, emRisco, origem, pontos: [...lista].sort(compararPorGravidade) };
  });

  return regioes.sort((a, b) => (b.nivel ?? 0) - (a.nivel ?? 0) || b.transbordando - a.transbordando
    || (b.nivel ? (b.maiorChance ?? 0) - (a.maiorChance ?? 0) : 0) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** "Sé", "Sé e Mooca", "Sé, Mooca e Lapa" */
function listar(nomes) {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * O aviso curto que vai sobre o mapa, ou null quando nenhuma região está em aviso.
 * Mostra o nível mais grave: com alguma região em risco alto, fala só delas.
 * @returns {{ nivel: 2|3, texto: string, descricao: string }|null}
 */
export function resumoDosAvisos(regioes) {
  const emAlto = regioes.filter((r) => r.nivel === 3);
  const emAtencao = regioes.filter((r) => r.nivel === 2);
  const grupo = emAlto.length ? emAlto : emAtencao;
  if (grupo.length === 0) return null;
  const nivel = emAlto.length ? 3 : 2;
  const rotulo = ROTULO_AVISO[nivel];
  // Até duas regiões cabem pelo nome; acima disso, o número.
  const texto = grupo.length <= 2
    ? `${rotulo}: ${listar(grupo.map((r) => r.nome.split(" / ")[0]))}`
    : `${rotulo} em ${grupo.length} regiões`;
  const descricao = `${rotulo} de alagamento nas próximas 3 horas em ${grupo.length === 1 ? "1 região" : `${grupo.length} regiões`}: ${listar(grupo.map((r) => r.nome))}. Ver os avisos por região.`;
  return { nivel, texto, descricao };
}

/**
 * Em que o aviso da região se apoia, numa linha: quantos bueiros estão em risco. Usada nas listas
 * que já dizem o nível no título do grupo.
 */
export function apoioDaRegiao(regiao) {
  const emRisco = regiao.emRisco
    ? `${regiao.emRisco} de ${regiao.total} bueiros em nível alto ou crítico`
    : "Nenhum bueiro em nível alto por enquanto";
  if (regiao.transbordando > 0) {
    return `${regiao.transbordando === 1 ? "1 bueiro transbordando" : `${regiao.transbordando} bueiros transbordando`} agora · ${emRisco}`;
  }
  return emRisco;
}

/** Frase da região para a tela: o que o aviso diz e em que ele se apoia. */
export function fraseDaRegiao(regiao) {
  if (!regiao.cobertura && regiao.total >= REGRA_REGIAO.coberturaMinima) {
    // O servidor da IA conta os pontos dele; pode ter menos nesta região do que o mapa mostra.
    return "O serviço de previsão não tem pontos suficientes nesta região para um aviso dela. Vale o nível de cada bueiro.";
  }
  if (!regiao.cobertura) {
    return `Com ${regiao.total === 1 ? "1 bueiro monitorado" : `${regiao.total} bueiros monitorados`}, esta região não recebe aviso (o mínimo é ${REGRA_REGIAO.coberturaMinima}). Vale o nível de cada bueiro.`;
  }
  const quantos = (n) => `${n} de ${regiao.total} bueiros`;
  if (regiao.transbordando > 0) {
    return `${regiao.transbordando === 1 ? "1 bueiro transbordando" : `${regiao.transbordando} bueiros transbordando`} agora, medido pelo sensor. ${quantos(regiao.emRisco)} em nível alto ou crítico.`;
  }
  if (regiao.nivel === 3) return `Risco alto de alagamento nas próximas 3 horas. ${quantos(regiao.emRisco)} em nível alto ou crítico.`;
  if (regiao.nivel === 2) {
    return regiao.emRisco
      ? `Risco acima do normal nas próximas 3 horas. ${quantos(regiao.emRisco)} em nível alto ou crítico.`
      : "Risco acima do normal nas próximas 3 horas. Nenhum bueiro em nível alto por enquanto.";
  }
  return "Nenhum sinal de risco acima do normal nas próximas 3 horas.";
}
