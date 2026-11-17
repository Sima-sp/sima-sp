// Alertas do sensor: o backend cria um quando a LEITURA de um bueiro chega ao nível crítico
// (transbordando) e o encerra quando a água baixa. É medição, não previsão: a IA não gera alerta.
//
// De onde vêm:
//   - com backend  → GET /alertas?status=ATIVO (público), junto com as previsões;
//   - demonstração → dos bueiros que a demonstração mostra transbordando, para a tela ter o que mostrar.
//
// Formato de um alerta no app:
//   id, sensorId (texto, o mesmo `id` do ponto), codigo, endereco, bairro, lat, lon,
//   nivel (1 a 4), mensagem, desde (Date ou null)

import { nivelDeTexto } from "./niveis.js";
import { horaCurta, lerData, separarVizinhanca } from "./modelo.js";

const numero = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Converte um item de GET /alertas (AlertaResponse do backend). Sem id ou sem sensor, devolve null. */
export function normalizarAlerta(item) {
  if (item?.id === null || item?.id === undefined || item?.sensorId === null || item?.sensorId === undefined) return null;
  const { endereco, bairro } = separarVizinhanca(item.vizinhanca);
  return {
    id: String(item.id),
    sensorId: String(item.sensorId),
    codigo: item.codigo ?? null,
    endereco,
    bairro,
    lat: numero(item.latitude),
    lon: numero(item.longitude),
    nivel: nivelDeTexto(item.nivelRisco) ?? 4,
    mensagem: item.mensagem ?? null,
    desde: lerData(item.criadoEm),
  };
}

/** Na demonstração não há servidor: cada bueiro transbordando conta como um alerta ativo. */
export function alertasDaDemo(pontos) {
  return pontos.filter((p) => p.medicaoTransbordando).map((p) => ({
    id: `demo-${p.id}`, sensorId: p.id, codigo: p.codigo, endereco: p.endereco, bairro: p.bairro, lat: p.lat, lon: p.lon,
    nivel: 4, mensagem: null, desde: p.leituraEm ?? null,
  }));
}

/**
 * Põe em cada ponto o alerta ativo dele (`ponto.alerta`, ou null). Com mais de um alerta para o
 * mesmo sensor (não deveria acontecer: o backend garante um ativo por sensor), vale o mais antigo.
 */
export function juntarAlertas(pontos, alertas) {
  const porSensor = new Map();
  for (const alerta of alertas) {
    const atual = porSensor.get(alerta.sensorId);
    if (!atual || (alerta.desde && atual.desde && alerta.desde < atual.desde)) porSensor.set(alerta.sensorId, alerta);
  }
  return pontos.map((p) => ({ ...p, alerta: porSensor.get(p.id) ?? null }));
}

/** "Em alerta desde as 14:20 · medido pelo sensor" */
export function textoDoAlerta(alerta) {
  return `Em alerta${alerta.desde ? ` desde as ${horaCurta(alerta.desde)}` : ""} · medido pelo sensor`;
}

/** Frase do aviso sobre o mapa: "1 bueiro em alerta agora" / "3 bueiros em alerta agora". */
export function resumoDosAlertas(alertas) {
  if (!alertas.length) return null;
  return alertas.length === 1 ? "1 bueiro em alerta agora" : `${alertas.length} bueiros em alerta agora`;
}
