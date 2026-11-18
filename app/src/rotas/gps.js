// A viagem seguindo o GPS do aparelho (#47). Só contas, sem tela: a tela de viagem
// (src/telas/Viagem.jsx) chama `acompanharGps` a cada posição nova e decide o que fazer.
//
// O que é feito com cada posição:
//   1. ENCAIXE NO CAMINHO: acha o ponto do traçado mais perto do GPS, procurando só para a frente
//      do ponto onde o carro já está (com uma pequena folga para trás, por causa do ruído). O
//      carro NUNCA anda para trás: ruído do GPS, parado no semáforo, não faz ele voltar.
//   2. SAIU DA ROTA: mais de 50 m do caminho por 5 s seguidos. A tela pede um caminho novo a partir
//      de onde o aparelho está. Um ponto isolado longe (o GPS pula às vezes) não basta.
//   3. SINAL FRACO: precisão pior que 50 m por 10 s. A posição imprecisa não conta para "saiu da
//      rota" (não dá para saber) e a tela avisa.
//
// O traçado é a lista de pontos [lon, lat] da rota, já medida por `prepararViagem` (viagem.js).

const METROS_POR_GRAU = 111320;
const paraRad = (graus) => (graus * Math.PI) / 180;

export const REGRAS_GPS = Object.freeze({
  /** Mais longe que isto do caminho conta como fora da rota. */
  foraDaRotaMetros: 50,
  /** Fora da rota por este tempo seguido: pedir um caminho novo. */
  foraDaRotaMs: 5000,
  /** Precisão (raio, em metros) pior que isto: a posição não vale para dizer que saiu da rota. */
  precisaoMinima: 50,
  /** Sinal ruim por este tempo seguido: avisar. */
  sinalFracoMs: 10000,
  /** Folga para trás ao procurar o ponto do caminho (ruído do GPS em volta do carro). */
  folgaParaTras: 15,
  /** Até onde à frente procurar primeiro. Evita pular para a volta de um caminho que passa duas vezes no mesmo lugar. */
  janelaAFrente: 500,
  /** A menos disto do fim, chegou. */
  chegadaMetros: 25,
  /** Acima desta velocidade (m/s) o rumo do próprio GPS vale para girar o carro. */
  velocidadeParaRumo: 2,
});

/**
 * O ponto do caminho mais perto de `posicao`, procurando entre os metros `de` e `ate` da viagem.
 * @returns {{ metro: number, distancia: number }|null}  metro = onde fica no caminho; distancia = do GPS até ele
 */
export function encaixarNoCaminho(viagem, [lon, lat], de = 0, ate = viagem.metros) {
  const { caminho, acumulado } = viagem;
  if (!caminho?.length) return null;
  const escalaX = Math.cos(paraRad(lat)) * METROS_POR_GRAU;
  const emMetros = (p) => [(p[0] - lon) * escalaX, (p[1] - lat) * METROS_POR_GRAU];
  if (caminho.length === 1) {
    const [x, y] = emMetros(caminho[0]);
    return { metro: 0, distancia: Math.hypot(x, y) };
  }
  let melhor = null;
  for (let i = 1; i < caminho.length; i++) {
    if (acumulado[i] < de) continue;
    if (acumulado[i - 1] > ate) break;
    const [ax, ay] = emMetros(caminho[i - 1]);
    const [bx, by] = emMetros(caminho[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const tamanho2 = dx * dx + dy * dy;
    let t = tamanho2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / tamanho2));
    // Só a parte do trecho que fica dentro de [de, ate] conta.
    const comprimento = acumulado[i] - acumulado[i - 1];
    if (comprimento > 0) {
      t = Math.min(Math.max(t, (de - acumulado[i - 1]) / comprimento), (ate - acumulado[i - 1]) / comprimento);
      t = Math.min(1, Math.max(0, t));
    }
    const distancia = Math.hypot(ax + dx * t, ay + dy * t);
    if (!melhor || distancia < melhor.distancia) melhor = { metro: acumulado[i - 1] + comprimento * t, distancia };
  }
  return melhor;
}

/** Estado inicial do acompanhamento: o carro no metro `metro` (0 no começo, ou onde ele estava). */
export function comecarGps(metro = 0) {
  return { metro, distancia: 0, foraDesde: null, fracoDesde: null, fora: false, sinalFraco: false, posicao: null, rumo: null, chegou: false };
}

/**
 * Atualiza o acompanhamento com uma posição nova do GPS.
 *
 * @param {object} estado    o que `comecarGps` ou a chamada anterior devolveu
 * @param {object} viagem    `prepararViagem(rota)`
 * @param {{ lon: number, lat: number, precisao?: number, rumo?: number|null, velocidade?: number|null, quando: number }} leitura
 *   `precisao` em metros (coords.accuracy), `rumo` em graus (coords.heading), `velocidade` em m/s, `quando` em ms
 * @returns {object} o estado novo:
 *   metro      onde o carro está no caminho (nunca menor que antes)
 *   distancia  do GPS até o caminho, em metros
 *   fora       está fora da rota há tempo bastante: pedir um caminho novo
 *   sinalFraco a precisão está ruim há tempo bastante: avisar
 *   posicao    [lon, lat] do GPS (para desenhar o carro quando ele está fora da rota)
 *   rumo       o rumo do GPS, se ele estiver andando; null para usar o do caminho
 *   chegou     a menos de 25 m do fim do caminho
 */
export function acompanharGps(estado, viagem, leitura, regras = REGRAS_GPS) {
  const posicao = [leitura.lon, leitura.lat];
  const precisaoBoa = !(leitura.precisao > regras.precisaoMinima);

  // Procura primeiro perto de onde o carro está; se não achar nada razoável ali, no resto do caminho
  // (o GPS pode ter ficado sem sinal num túnel e voltado bem mais à frente).
  const de = Math.max(0, estado.metro - regras.folgaParaTras);
  let achado = encaixarNoCaminho(viagem, posicao, de, estado.metro + regras.janelaAFrente);
  if (!achado || achado.distancia > regras.foraDaRotaMetros) {
    const noResto = encaixarNoCaminho(viagem, posicao, de, viagem.metros);
    if (noResto && (!achado || noResto.distancia < achado.distancia)) achado = noResto;
  }
  const distancia = achado?.distancia ?? Infinity;
  const longe = distancia > regras.foraDaRotaMetros;

  // O carro só anda para a frente, e só com uma posição que está no caminho.
  let metro = estado.metro;
  if (achado && !longe && precisaoBoa) metro = Math.max(estado.metro, achado.metro);
  const chegou = viagem.metros - metro <= regras.chegadaMetros;
  if (chegou) metro = viagem.metros;

  // Fora da rota: só conta com sinal bom (com sinal ruim não dá para saber).
  const foraDesde = longe && precisaoBoa ? estado.foraDesde ?? leitura.quando : null;
  const fracoDesde = precisaoBoa ? null : estado.fracoDesde ?? leitura.quando;

  const andando = Number.isFinite(leitura.velocidade) && leitura.velocidade >= regras.velocidadeParaRumo;
  return {
    metro,
    distancia,
    foraDesde,
    fracoDesde,
    fora: !chegou && foraDesde !== null && leitura.quando - foraDesde >= regras.foraDaRotaMs,
    sinalFraco: fracoDesde !== null && leitura.quando - fracoDesde >= regras.sinalFracoMs,
    posicao,
    rumo: andando && Number.isFinite(leitura.rumo) ? leitura.rumo : null,
    chegou,
  };
}

/** A posição do navegador (GeolocationPosition) no formato de `acompanharGps`. */
export function lerPosicao(posicao) {
  const c = posicao.coords;
  return {
    lon: c.longitude, lat: c.latitude, precisao: c.accuracy,
    rumo: c.heading ?? null, velocidade: c.speed ?? null, quando: posicao.timestamp || Date.now(),
  };
}

/** Texto para quando o GPS não pode ser usado (o código do erro do navegador). */
export function textoDoErroDoGps(codigo) {
  if (codigo === 1) return "A localização não foi permitida. Para seguir o GPS, libere a localização nas configurações do navegador. A viagem continua simulada.";
  if (codigo === 3) return "O GPS demorou demais para responder. A viagem continua simulada.";
  if (codigo === "sem-gps") return "Este aparelho não informa a localização. A viagem continua simulada.";
  return "Não foi possível usar o GPS agora. A viagem continua simulada.";
}
