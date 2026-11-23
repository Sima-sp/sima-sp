// Transforma a medida do protótipo do sensor em nível do bueiro.
//
// O protótipo (ESP32) mede a DISTÂNCIA, em centímetros, do sensor até a água. O sensor fica
// embaixo da tampa, apontado para baixo: quanto MENOR a distância, MAIS CHEIO está o bueiro.
// Ele não mede lixo.
//
// O ALCANCE DO SENSOR (informado pelo grupo em 07/10/2026): ele mede de 20 cm a 2000 cm.
// - Abaixo de 20 cm (a "zona cega") o sensor não mede com precisão. Por isso a distância de
//   "cheio" não pode ficar abaixo de 20 cm: o sensor precisa conseguir medir o bueiro cheio.
// - Acima de 2000 cm a medida não existe: é erro de leitura.
//
// A REGRA É A DO BACKEND (#10, #41): o nível vem da porcentagem de água no bueiro, e não de
// limites em centímetros. Assim o painel, o mapa e o alerta dizem o mesmo para a mesma água.
//
//   água (%) = (profundidade − distância) ÷ (profundidade − distância de cheio) × 100, entre 0 e 100
//
//   água                  nível (mesma escala do mapa)
//   100 %                 4  Crítico (transbordando: é o que dispara o alerta)
//   80 % ou mais          3  Alto
//   50 % ou mais          2  Médio
//   abaixo de 50 %        1  Baixo
//
// As medidas do bueiro (profundidade e distância de cheio) vêm do backend, quando o sensor de
// bancada está cadastrado lá com elas; sem isso, de "Ajustes do sensor" (guardadas no aparelho).
// Os limites em % são os de `sensor.nivel.*` no backend (application.properties).
//
// O servidor do sensor (o programa em Node do grupo do IoT) faz a mesma conta, com as medidas do
// .env dele, e o LED do firmware também, com as medidas gravadas na placa. A página confere as do
// servidor (GET /api/limites) e avisa se forem outras (#41, #55).
//
// Só faz contas: não fala com o servidor (isso é do servidor.js) nem com a tela.

/** O que o sensor consegue medir, em centímetros. */
export const ALCANCE = Object.freeze({ minimo: 20, maximo: 2000 });

/**
 * Medidas do bueiro de exemplo, até a bancada ser medida (#55): sensor a 60 cm do fundo e o bueiro
 * "cheio" quando a água chega a 25 cm do sensor (um pouco abaixo da zona cega).
 */
export const MEDIDAS_PADRAO = Object.freeze({ profundidade: 60, cheio: 25 });

/** Os limites do backend, em % de água (sensor.nivel.medio, .alto e .critico). */
export const LIMITES_PERCENTUAIS = Object.freeze({ medio: 50, alto: 80, critico: 100 });

/** Acima disto (em cm) a medida não é de um bueiro: é erro de leitura. */
export const DISTANCIA_MAXIMA = ALCANCE.maximo;

const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * true se as medidas servem: a distância de cheio dentro do que o sensor mede (20 cm ou mais) e a
 * profundidade maior que ela (pelo menos 5 cm de bueiro), dentro do alcance.
 */
export function medidasValidas(medidas) {
  const profundidade = numero(medidas?.profundidade);
  const cheio = numero(medidas?.cheio);
  return profundidade !== null && cheio !== null && cheio >= ALCANCE.minimo && profundidade >= cheio + 5 && profundidade <= ALCANCE.maximo;
}

/** As medidas escolhidas em Ajustes (ou guardadas no aparelho), ou as de exemplo se não servirem. */
export function arrumarMedidas(escolhidas) {
  return medidasValidas(escolhidas) ? { profundidade: escolhidas.profundidade, cheio: escolhidas.cheio } : MEDIDAS_PADRAO;
}

/**
 * Lê as medidas de um sensor do backend (GET /sensores/{id}: `profundidadeCm`, `distanciaCheioCm`).
 * @returns {{ profundidade: number, cheio: number }|null}  null se o sensor ainda não tem as medidas
 */
export function lerMedidasDoBackend(sensor) {
  const medidas = { profundidade: Number(sensor?.profundidadeCm), cheio: Number(sensor?.distanciaCheioCm) };
  return sensor?.profundidadeCm !== null && sensor?.profundidadeCm !== undefined && medidasValidas(medidas) ? medidas : null;
}

/** true se as duas medidas são iguais. */
export function mesmasMedidas(a, b) {
  return Boolean(a && b) && a.profundidade === b.profundidade && a.cheio === b.cheio;
}

/**
 * Lê a resposta de GET /api/limites do servidor do sensor (#41):
 *   { "regra": "percentual", "profundidadeCm": 60, "cheioCm": 25, "deExemplo": true,
 *     "medio": 50, "alto": 80, "critico": 100, ... }
 * Serve para reconhecer o servidor do sensor e para conferir se ele faz a mesma conta que este
 * painel. Um servidor de antes de #41 (limites em cm: { "critico": 20, "alerta": 30, "atencao": 45 })
 * também é reconhecido, como `{ regra: "cm" }`. Não entra na conta do nível.
 * @returns {{ regra: "percentual", medidas: { profundidade: number, cheio: number }, deExemplo: boolean,
 *   limites: { medio: number, alto: number, critico: number } } | { regra: "cm" } | null}
 *   null se a resposta não é a esperada
 */
export function lerRegraDoServidor(resposta) {
  const positivo = (v) => (numero(v) !== null && v > 0 ? v : null);
  if (resposta?.regra === "percentual") {
    const medidas = { profundidade: numero(resposta.profundidadeCm), cheio: numero(resposta.cheioCm) };
    const limites = { medio: positivo(resposta.medio), alto: positivo(resposta.alto), critico: positivo(resposta.critico) };
    if (medidas.profundidade === null || medidas.cheio === null || !(medidas.cheio < medidas.profundidade)) return null;
    if (limites.medio === null || limites.alto === null || limites.critico === null || !(limites.medio < limites.alto && limites.alto <= limites.critico)) return null;
    return { regra: "percentual", medidas, deExemplo: resposta.deExemplo === true, limites };
  }
  const critico = positivo(resposta?.critico);
  const alerta = positivo(resposta?.alerta);
  const atencao = positivo(resposta?.atencao);
  if (critico === null || alerta === null || atencao === null || !(critico < alerta && alerta < atencao)) return null;
  return { regra: "cm" };
}

/** true se o servidor do sensor dá o mesmo nível que este painel: mesma conta, medidas e limites. */
export function mesmaRegra(doServidor, medidas) {
  return doServidor?.regra === "percentual" && mesmasMedidas(doServidor.medidas, medidas)
    && doServidor.limites.medio === LIMITES_PERCENTUAIS.medio && doServidor.limites.alto === LIMITES_PERCENTUAIS.alto
    && doServidor.limites.critico === LIMITES_PERCENTUAIS.critico;
}

/**
 * true se a distância pode ser uma medida de verdade.
 * Zero, negativo ou um valor além do alcance é o que o sensor devolve quando não recebe o eco
 * de volta; não pode virar "bueiro cheio".
 */
export function distanciaValida(distancia) {
  return typeof distancia === "number" && Number.isFinite(distancia) && distancia > 0 && distancia <= DISTANCIA_MAXIMA;
}

/**
 * Água no bueiro, em % (de 0 a 100, com uma casa), pela mesma conta do backend. null se a medida não vale.
 */
export function percentualDaAgua(distancia, medidas = MEDIDAS_PADRAO) {
  if (!distanciaValida(distancia)) return null;
  const bruto = ((medidas.profundidade - distancia) / (medidas.profundidade - medidas.cheio)) * 100;
  return Math.round(Math.max(0, Math.min(100, bruto)) * 10) / 10;
}

/** Nível de 1 (baixo) a 4 (crítico) para uma porcentagem de água; null sem porcentagem. */
export function nivelDoPercentual(percentual) {
  if (percentual === null || percentual === undefined) return null;
  if (percentual >= LIMITES_PERCENTUAIS.critico) return 4;
  if (percentual >= LIMITES_PERCENTUAIS.alto) return 3;
  if (percentual >= LIMITES_PERCENTUAIS.medio) return 2;
  return 1;
}

/** Nível de 1 (baixo) a 4 (crítico) para uma distância em cm; null se a medida não vale. */
export function nivelDaDistancia(distancia, medidas = MEDIDAS_PADRAO) {
  return nivelDoPercentual(percentualDaAgua(distancia, medidas));
}

/** A distância (cm) em que a água chega a um percentual: onde fica cada marca no desenho. */
export function distanciaDoPercentual(percentual, medidas = MEDIDAS_PADRAO) {
  return medidas.profundidade - (percentual / 100) * (medidas.profundidade - medidas.cheio);
}

/**
 * true se a água está tão perto do sensor que a medida deixa de ser confiável (abaixo do mínimo
 * que ele mede). O bueiro está cheio de qualquer jeito.
 */
export function naZonaCega(distancia) {
  return distanciaValida(distancia) && distancia < ALCANCE.minimo;
}

/** Valor do meio de uma lista de números (a média dos dois do meio, se a lista for par). */
export function mediana(valores) {
  const ordem = [...valores].sort((a, b) => a - b);
  if (ordem.length === 0) return null;
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : (ordem[meio - 1] + ordem[meio]) / 2;
}

/**
 * A distância que a tela mostra: a mediana das leituras válidas entre as mais recentes.
 * Uma medida isolada fora do lugar (o sensor erra de vez em quando) não faz o nível piscar.
 * @param {number[]} recentes  as últimas distâncias recebidas, da mais antiga para a mais nova
 * @returns {number|null}      null se nenhuma delas é uma medida válida
 */
export function distanciaFirme(recentes) {
  const validas = recentes.filter(distanciaValida);
  return validas.length ? mediana(validas) : null;
}

/**
 * Lê a resposta de GET /api/leitura do servidor do sensor:
 *   { "device": "esp32-01", "distancia": 32.4, "status": "atencao", "nivel": 1, "titulo": "Atenção",
 *     "mensagem": "...", "em": "2026-10-07T12:00:00.000Z" }
 * O app usa `distancia` (cm), `em` (para saber se a leitura é nova) e `device`. A classificação
 * do servidor não é usada: o app faz a conta com os limites desta página.
 * @returns {{ distancia: number, em: number|null, marca: string, aparelho: string|null }|null}
 *   null quando ainda não há leitura (o servidor responde `null`) ou a resposta não tem a medida.
 */
export function lerLeitura(resposta) {
  if (!resposta || typeof resposta !== "object" || typeof resposta.distancia !== "number" || Number.isNaN(resposta.distancia)) return null;
  const em = typeof resposta.em === "string" ? Date.parse(resposta.em) : NaN;
  return {
    distancia: resposta.distancia,
    em: Number.isFinite(em) ? em : null,
    marca: typeof resposta.em === "string" ? resposta.em : "",
    aparelho: typeof resposta.device === "string" && resposta.device.trim() ? resposta.device.trim() : null,
  };
}

/** Até que distância o desenho do bueiro vai: o fundo dele (a profundidade). */
export function escalaDoDesenho(medidas = MEDIDAS_PADRAO) {
  return medidas.profundidade;
}

/* ───────────── Tempo até transbordar ───────────── */

/**
 * Quanto falta para a água chegar ao "cheio", se continuar subindo no mesmo ritmo.
 *
 * Usa as leituras válidas dos últimos `janelaMs` (2 min). A velocidade é a mediana das inclinações
 * entre todos os pares de leituras (o estimador de Theil-Sen): uma medida errada no meio, como um
 * eco falso, não muda o resultado. Só responde quando a subida é CONSISTENTE: a maior parte dos
 * pares mostra a água subindo, numa velocidade que dá para notar. Parada, descendo, oscilando
 * ou com um salto isolado: null, e a tela não mostra nada.
 *
 * @param {{ quando: number, distancia: number }[]} leituras  da mais antiga para a mais nova; `quando` em ms
 * @returns {{ segundos: number, cmPorMinuto: number }|null}
 */
export function tempoAteTransbordar(leituras, medidas = MEDIDAS_PADRAO, {
  janelaMs = 120000, minimoMs = 30000, minimoLeituras = 6, velocidadeMinima = 0.3, concordancia = 0.7, limiteSegundos = 3600,
} = {}) {
  const validas = leituras.filter((l) => distanciaValida(l.distancia) && Number.isFinite(l.quando));
  if (!validas.length) return null;
  const fim = validas[validas.length - 1].quando;
  const janela = validas.filter((l) => fim - l.quando <= janelaMs);
  if (janela.length < minimoLeituras || fim - janela[0].quando < minimoMs) return null;

  // Inclinação (cm por minuto) de cada par de leituras. Negativa = a distância diminui = a água sobe.
  const inclinacoes = [];
  for (let i = 0; i < janela.length; i++) {
    for (let j = i + 1; j < janela.length; j++) {
      const minutos = (janela[j].quando - janela[i].quando) / 60000;
      if (minutos > 0) inclinacoes.push((janela[j].distancia - janela[i].distancia) / minutos);
    }
  }
  if (!inclinacoes.length) return null;
  const subindo = inclinacoes.filter((v) => v < 0).length / inclinacoes.length;
  const cmPorMinuto = -mediana(inclinacoes);
  if (subindo < concordancia || cmPorMinuto < velocidadeMinima) return null;

  // Onde a água está agora: o ponto da mesma reta no instante da última leitura. O intercepto é a
  // mediana dos resíduos, então um eco falso na última leitura também não pesa.
  const porMs = -cmPorMinuto / 60000;
  const atual = mediana(janela.map((l) => l.distancia - porMs * (l.quando - fim)));
  const falta = atual - medidas.cheio;
  if (falta <= 0) return null; // já está cheio: o painel diz "transbordando", não "em quanto tempo"
  const segundos = (falta / cmPorMinuto) * 60;
  return segundos > limiteSegundos ? null : { segundos, cmPorMinuto };
}

/** "em menos de 1 minuto", "em cerca de 4 minutos" */
export function textoDoTempo(segundos) {
  if (segundos < 60) return "em menos de 1 minuto";
  const minutos = Math.round(segundos / 60);
  return minutos === 1 ? "em cerca de 1 minuto" : `em cerca de ${minutos} minutos`;
}

/** "62 %" */
export function textoDoPercentual(percentual) {
  return `${Math.round(percentual)} %`;
}

/** Distância escrita para a tela: "32 cm". */
export function textoDaDistancia(distancia) {
  return `${Math.round(distancia)} cm`;
}
