// O que o administrador faz pelo app, na tela #/admin: analisar relatos, encerrar alertas, mudar
// a situação de um sensor e ligar a chuva de teste do backend. Só o necessário para uma
// apresentação; cadastrar sensor e gerar a chave dele continuam no Swagger do backend.
//
// Todas as rotas são /admin/** e exigem conta de administrador: o backend responde 403 para
// quem não é. Esconder a tela de quem não é admin é só conforto; quem protege é o servidor.

import { pedir } from "../dados/api.js";
import { lerData } from "../dados/modelo.js";
import { metros } from "../rotas/geometria.js";

const lista = (corpo) => (Array.isArray(corpo) ? corpo : Array.isArray(corpo?.content) ? corpo.content : []);
const numero = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const NAO_E_ADMIN = { 403: "Esta conta não é de administrador." };

/** Um item da fila de análise (OcorrenciaAdminResponse). */
export function normalizarRelatoDaFila(item) {
  if (item?.id === null || item?.id === undefined) return null;
  return {
    id: String(item.id),
    tipo: item.tipo,
    descricao: item.descricao ?? "",
    lat: numero(item.latitude),
    lon: numero(item.longitude),
    situacao: item.situacao,
    emailAutor: item.emailAutor ?? null,
    criadoEm: lerData(item.dataCriacao),
    // Caminho da foto no backend; ela exige o token, então é baixada com `baixarFoto`, não por <img src>.
    foto: typeof item.fotoUrl === "string" && item.fotoUrl.startsWith("/") ? item.fotoUrl : null,
  };
}

/** Relatos esperando análise, do mais antigo para o mais novo (quem mandou primeiro é visto primeiro). */
export async function buscarFila() {
  const itens = lista(await pedir("/admin/ocorrencias?situacao=PENDENTE", { comConta: true, mensagens: NAO_E_ADMIN }));
  return itens.map(normalizarRelatoDaFila).filter(Boolean).sort((a, b) => (a.criadoEm?.getTime() ?? 0) - (b.criadoEm?.getTime() ?? 0));
}

/** Aprova o relato, ou recusa com o motivo (obrigatório na recusa). */
export function analisarRelato(id, { aprovar, motivo }) {
  const corpo = aprovar ? { situacao: "APROVADA" } : { situacao: "RECUSADA", motivo: String(motivo ?? "").trim() };
  return pedir(`/admin/ocorrencias/${encodeURIComponent(id)}`, { metodo: "PATCH", corpo, comConta: true, mensagens: NAO_E_ADMIN });
}

/** Baixa a foto de um relato da fila (com o token) e devolve um endereço temporário para <img>. */
export async function baixarFoto(caminho) {
  const arquivo = await pedir(caminho, { comConta: true, resposta: "blob", tempoLimiteMs: 20000 });
  return URL.createObjectURL(arquivo);
}

/** Encerra um alerta à mão (o normal é ele se encerrar sozinho quando a água baixa). */
export function resolverAlerta(id) {
  return pedir(`/admin/alertas/${encodeURIComponent(id)}/resolver`, { metodo: "PATCH", comConta: true, mensagens: NAO_E_ADMIN });
}

export const SITUACOES_DO_SENSOR = [
  { id: "ATIVO", rotulo: "Ativo" },
  { id: "MANUTENCAO", rotulo: "Manutenção" },
  { id: "INATIVO", rotulo: "Inativo" },
];

/** Muda a situação de um sensor. Em manutenção ou inativo, o backend recusa as leituras dele. */
export function mudarSituacaoDoSensor(id, status) {
  return pedir(`/admin/sensores/${encodeURIComponent(id)}`, { metodo: "PATCH", corpo: { status }, comConta: true, mensagens: NAO_E_ADMIN });
}

/** Cenários da chuva de teste do backend (CenarioChuvaEnum). */
export const CENARIOS_DE_CHUVA = [
  { id: "SECO", rotulo: "Sem chuva" },
  { id: "CHUVA_MODERADA", rotulo: "Chuva moderada" },
  { id: "CHUVA_FORTE", rotulo: "Pancada forte" },
];

const MENSAGENS_DA_SIMULACAO = { 403: "A chuva de teste está desligada neste servidor (IA_DEMONSTRACAO=false), ou esta conta não é de administrador." };

/** Situação da chuva de teste: { habilitado, ativo, cenario, descricao, expiraEm }. */
export const buscarSimulacao = () => pedir("/admin/demonstracao", { comConta: true, mensagens: NAO_E_ADMIN });

/** Liga a chuva de teste por `minutos` (depois ela desliga sozinha). Recalcula as previsões: pode demorar. */
export function ligarSimulacao(cenario, minutos = 30) {
  return pedir("/admin/demonstracao/iniciar", { metodo: "POST", corpo: { cenario, minutos }, comConta: true, tempoLimiteMs: 60000, mensagens: MENSAGENS_DA_SIMULACAO });
}

export function desligarSimulacao() {
  return pedir("/admin/demonstracao/encerrar", { metodo: "POST", comConta: true, tempoLimiteMs: 60000, mensagens: MENSAGENS_DA_SIMULACAO });
}

/**
 * O bueiro monitorado mais perto de um lugar, para o admin se situar sem abrir o mapa:
 * { ponto, metros }, ou null sem pontos ou sem posição.
 */
export function bueiroMaisProximo(pontos, lat, lon) {
  if (lat === null || lon === null || !pontos.length) return null;
  let melhor = null;
  for (const ponto of pontos) {
    const distancia = metros([ponto.lon, ponto.lat], [lon, lat]);
    if (!melhor || distancia < melhor.metros) melhor = { ponto, metros: distancia };
  }
  return melhor;
}

/** "a 120 m", "a 1,4 km", "no mesmo lugar" */
export function textoDaDistancia(valor) {
  if (valor < 15) return "no mesmo lugar";
  if (valor < 1000) return `a ${Math.round(valor / 10) * 10} m`;
  return `a ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

/**
 * Sensores para a lista do admin: com texto, os que batem com ele; sem texto, o de bancada e os
 * que não estão ativos (são os que pedem atenção). No máximo `limite`.
 */
export function filtrarSensores(pontos, texto, { bancada = "bueiro_01", limite = 12 } = {}) {
  const termo = String(texto ?? "").trim().toLowerCase();
  const achados = termo
    ? pontos.filter((p) => `${p.codigo} ${p.endereco ?? ""} ${p.bairro}`.toLowerCase().includes(termo))
    : pontos.filter((p) => p.codigo.toLowerCase() === bancada.toLowerCase() || (p.statusSensor && p.statusSensor !== "ATIVO"));
  return achados.slice(0, limite);
}
