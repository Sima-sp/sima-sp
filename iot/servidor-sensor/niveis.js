// Nível da água no servidor do sensor: a MESMA regra do backend e do painel do app (#10, #41).
//
// O sensor mede a distância até a água (cm). Quanto MENOR a distância, MAIS ALTA está a água.
// A distância vira % do bueiro com as duas medidas dele:
//
//   água (%) = (profundidade − distância) ÷ (profundidade − distância de cheio) × 100, entre 0 e 100
//
//   água                  nível (mesma escala do backend, do mapa e do painel)
//   100 %                 4  critico  (cheio: é o que cria o alerta no backend)
//   80 % ou mais          3  alto
//   50 % ou mais          2  medio
//   abaixo de 50 %        1  baixo
//
// As medidas vêm do .env (SENSOR_PROFUNDIDADE_CM e SENSOR_CHEIO_CM) e precisam ser as mesmas
// cadastradas no sensor do backend e as do firmware (o LED). Sem elas, valem as de exemplo,
// iguais às do painel do app (60 cm e 25 cm), até a bancada ser medida (#55).

/** O que o sensor consegue medir, em cm (informado pelo grupo em 07/10/2026). */
const ALCANCE = Object.freeze({ minimo: 20, maximo: 2000 });

/** Medidas de exemplo: sensor a 60 cm do fundo, cheio quando a água chega a 25 cm do sensor. */
const MEDIDAS_PADRAO = Object.freeze({ profundidade: 60, cheio: 25 });

/** Os limites do backend, em % de água (sensor.nivel.medio, .alto e .critico). */
const LIMITES_PERCENTUAIS = Object.freeze({ medio: 50, alto: 80, critico: 100 });

const NIVEIS = {
  1: { status: "baixo", titulo: "Baixo", mensagem: "Nível de água dentro do esperado." },
  2: { status: "medio", titulo: "Médio", mensagem: "Água acima da metade do bueiro." },
  3: { status: "alto", titulo: "Alto", mensagem: "Água perto do cheio. Acompanhe de perto." },
  4: { status: "critico", titulo: "Crítico", mensagem: "Bueiro cheio: risco de transbordar agora." },
};
const NIVEL_DO_STATUS = { baixo: 1, medio: 2, alto: 3, critico: 4 };

const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * true se as medidas servem: o cheio dentro do que o sensor mede (20 cm ou mais) e a profundidade
 * pelo menos 5 cm além dele, dentro do alcance. A mesma regra do painel do app.
 */
function medidasValidas(medidas) {
  const profundidade = numero(medidas?.profundidade);
  const cheio = numero(medidas?.cheio);
  return profundidade !== null && cheio !== null && cheio >= ALCANCE.minimo && profundidade >= cheio + 5 && profundidade <= ALCANCE.maximo;
}

/** Água em %, de 0 a 100 com uma casa, como o NivelDaAgua do backend. */
function percentualDaAgua(d, medidas = MEDIDAS_PADRAO) {
  const bruto = ((medidas.profundidade - d) / (medidas.profundidade - medidas.cheio)) * 100;
  return Math.round(Math.max(0, Math.min(100, bruto)) * 10) / 10;
}

/** Nível de 1 (baixo) a 4 (crítico) para uma porcentagem. */
function nivelDoPercentual(p) {
  if (p >= LIMITES_PERCENTUAIS.critico) return 4;
  if (p >= LIMITES_PERCENTUAIS.alto) return 3;
  if (p >= LIMITES_PERCENTUAIS.medio) return 2;
  return 1;
}

/** A distância (cm) em que a água chega a um percentual. */
function distanciaDoPercentual(p, medidas = MEDIDAS_PADRAO) {
  return medidas.profundidade - (p / 100) * (medidas.profundidade - medidas.cheio);
}

function descrever(nivel, d, percentual) {
  const n = NIVEIS[nivel];
  const mensagem =
    nivel === 4 && d < ALCANCE.minimo ? "Água na zona cega do sensor: bueiro cheio, risco de transbordar agora." : n.mensagem;
  return { status: n.status, nivel, titulo: n.titulo, mensagem, percentual };
}

/**
 * O nível de uma distância.
 * @param {number} d   distância (cm)
 * @returns {{ status: string, nivel: number, titulo: string, mensagem: string, percentual: number }}
 */
function classificar(d, medidas = MEDIDAS_PADRAO) {
  const percentual = percentualDaAgua(d, medidas);
  return descrever(nivelDoPercentual(percentual), d, percentual);
}

// Folga nos limites (#56): perto de um limite, a medida oscila um ou dois centímetros para lá e
// para cá e o nível ficaria trocando. Com a folga, o nível só muda quando a água passa do limite
// por pelo menos FOLGA_CM.
const FOLGA_CM = 2;

/**
 * Como `classificar`, mas lembrando do nível anterior: mudar de nível exige que a água passe do
 * limite com folga. A exceção é chegar ao CHEIO: aí o nível vai a crítico na hora, como no
 * backend, que cria o alerta nesse ponto (com cheio a 20 cm, a folga cairia na zona cega).
 * Para sair do crítico, a água precisa descer além do cheio com a mesma folga.
 * @param {number} d             distância (cm)
 * @param {string|null} anterior o `status` anterior ("baixo", "medio", "alto", "critico")
 */
function classificarComFolga(d, anterior, medidas = MEDIDAS_PADRAO, folga = FOLGA_CM) {
  const percentual = percentualDaAgua(d, medidas);
  const direto = nivelDoPercentual(percentual);
  const nivelAnterior = NIVEL_DO_STATUS[anterior];
  if (nivelAnterior === undefined || direto === nivelAnterior || direto === 4) return descrever(direto, d, percentual);

  // Subindo, a dúvida é a água estar só um pouco acima do limite: olha a distância um pouco maior.
  const subindo = direto > nivelAnterior;
  const seguro = nivelDoPercentual(percentualDaAgua(subindo ? d + folga : d - folga, medidas));
  const mudou = subindo ? seguro > nivelAnterior : seguro < nivelAnterior;
  return descrever(mudou ? seguro : nivelAnterior, d, percentual);
}

/**
 * As medidas do .env (SENSOR_PROFUNDIDADE_CM e SENSOR_CHEIO_CM). Vazias ou fora do que o sensor
 * mede: as de exemplo, com o motivo em `aviso`.
 * @returns {{ medidas: { profundidade: number, cheio: number }, deExemplo: boolean, aviso: string|null }}
 */
function lerMedidas(env = process.env) {
  const texto = (v) => String(v ?? "").trim().replace(",", ".");
  const profundidade = texto(env.SENSOR_PROFUNDIDADE_CM);
  const cheio = texto(env.SENSOR_CHEIO_CM);
  if (!profundidade && !cheio) {
    return { medidas: MEDIDAS_PADRAO, deExemplo: true, aviso: null };
  }
  const medidas = { profundidade: Number(profundidade), cheio: Number(cheio) };
  if (!medidasValidas(medidas)) {
    return {
      medidas: MEDIDAS_PADRAO,
      deExemplo: true,
      aviso:
        `SENSOR_PROFUNDIDADE_CM=${profundidade || "(vazio)"} e SENSOR_CHEIO_CM=${cheio || "(vazio)"} não servem: ` +
        `o cheio precisa ser ${ALCANCE.minimo} cm ou mais e a profundidade, pelo menos 5 cm além dele. ` +
        `Usando as de exemplo (${MEDIDAS_PADRAO.profundidade} e ${MEDIDAS_PADRAO.cheio} cm).`,
    };
  }
  return { medidas, deExemplo: false, aviso: null };
}

/** A regra inteira, para o GET /api/limites (o painel do app compara com a dele). */
function descreverRegra(medidas = MEDIDAS_PADRAO, deExemplo = false) {
  const umaCasa = (v) => Math.round(v * 10) / 10;
  return {
    regra: "percentual",
    profundidadeCm: medidas.profundidade,
    cheioCm: medidas.cheio,
    deExemplo,
    ...LIMITES_PERCENTUAIS,
    // Onde cada limite cai em cm, com estas medidas (é o que vai no firmware, para o LED).
    emCm: {
      medio: umaCasa(distanciaDoPercentual(LIMITES_PERCENTUAIS.medio, medidas)),
      alto: umaCasa(distanciaDoPercentual(LIMITES_PERCENTUAIS.alto, medidas)),
      critico: medidas.cheio,
    },
    zonaCegaCm: ALCANCE.minimo,
    folgaCm: FOLGA_CM,
  };
}

module.exports = {
  ALCANCE,
  MEDIDAS_PADRAO,
  LIMITES_PERCENTUAIS,
  FOLGA_CM,
  medidasValidas,
  percentualDaAgua,
  classificar,
  classificarComFolga,
  lerMedidas,
  descreverRegra,
};
