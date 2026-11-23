// "O que o sistema diz" sobre o sensor da bancada, ao lado do que o painel mede.
//
// O painel recebe a distância direto do servidor do sensor (Node, na rede local). O mesmo ESP32
// também manda a leitura ao backend do SIMA, que a guarda, calcula a previsão e cria o alerta.
// Quando o painel sabe o endereço do backend (VITE_API_URL), ele procura o sensor de bancada
// (CONFIG.sensorDeBancada, "bueiro_01") e mostra, SEPARADOS:
//   - medido:   a última leitura que o backend recebeu e o alerta, se houver;
//   - previsto: a chance de alagar que a IA calculou.
// Também pega as medidas do bueiro cadastradas no backend, para o painel fazer a mesma conta.
//
// Rotas públicas: GET /previsoes, GET /sensores/{id} e GET /alertas?status=ATIVO.

import { CONFIG } from "../config.js";
import { buscarAlertas, buscarPontos, pedir } from "../dados/api.js";
import { rotuloNivel } from "../dados/niveis.js";
import { TEXTO_SEM_LEITURA, haQuanto, horaCurta, motivoSemLeitura, porcento, statusAgora, textoProbabilidade } from "../dados/modelo.js";
import { lerMedidasDoBackend } from "./nivel.js";

/** O painel consegue perguntar ao backend? (sem endereço configurado, a seção nem aparece) */
export const temBackend = () => Boolean(CONFIG.urlApi);

/**
 * Procura o sensor de bancada no backend.
 * @returns {Promise<{ ponto: object, alerta: object|null, medidas: object|null }|null>}  null se ele não está cadastrado
 */
export async function buscarNoSistema(codigo = CONFIG.sensorDeBancada) {
  const [{ pontos }, alertas] = await Promise.all([buscarPontos(), buscarAlertas().catch(() => [])]);
  const ponto = pontos.find((p) => p.codigo.toLowerCase() === codigo.toLowerCase());
  if (!ponto) return null;
  let medidas = null;
  try {
    medidas = lerMedidasDoBackend(await pedir(`/sensores/${encodeURIComponent(ponto.id)}`));
  } catch {
    // Sem as medidas, o painel usa as de Ajustes; o resto continua.
  }
  return { ponto, alerta: alertas.find((a) => a.sensorId === ponto.id) ?? null, medidas };
}

/**
 * As linhas da seção, prontas para a tela. Medido e previsto ficam em linhas separadas.
 * @returns {{ medido: string, alerta: string|null, previsto: string }}
 */
export function resumoDoSistema({ ponto, alerta }, agora = new Date()) {
  const motivo = motivoSemLeitura(ponto, agora);
  const medido = motivo
    ? `${TEXTO_SEM_LEITURA[motivo]}${motivo === "velha" && ponto.leituraEm ? ` (a última foi ${haQuanto(ponto.leituraEm, agora)})` : ""}`
    : `Água em ${porcento(ponto.agua)}${ponto.leituraEm ? `, leitura ${haQuanto(ponto.leituraEm, agora)}` : ""}`;

  const status = statusAgora(ponto, agora);
  let previsto;
  if (status === "SEM_PREVISAO") previsto = "Ainda sem previsão para este ponto.";
  else if (status === "DESATUALIZADA") previsto = `Previsão desatualizada (a última foi às ${horaCurta(ponto.geradaEm)}).`;
  else {
    const chance = textoProbabilidade(ponto.probabilidade);
    previsto = `Risco ${rotuloNivel(ponto.nivel).toLowerCase()} · ${chance ? `${chance} de chance de alagar nas próximas ${ponto.janelaHoras} h` : "estimado por regras, sem a IA"}`;
  }
  return {
    medido,
    alerta: alerta ? `Alerta ativo${alerta.desde ? ` desde as ${horaCurta(alerta.desde)}` : ""}: o sensor mediu o bueiro cheio.` : null,
    previsto,
  };
}
