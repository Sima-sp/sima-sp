// Guarda a situação dos bueiros para o app inteiro e a mantém atualizada.
//
// De onde vêm os dados:
//   - sem VITE_API_URL  → demonstração (src/dados/demo.js), sempre identificada na tela, com um
//                         "clima" que pode ser trocado na hora (valor.demo);
//   - com VITE_API_URL  → GET /previsoes do backend, consultado a cada CONFIG.intervaloAtualizacaoMs,
//                         e junto dele GET /alertas (os alertas ativos do sensor, src/dados/alertas.js)
//                         e GET /ocorrencias (os relatos aprovados, src/relatos/relatos.js).
//
// Se o backend não responder, o app NÃO troca para a demonstração: mostrar dados inventados num
// app de risco seria pior do que mostrar um aviso. Ele mantém a última resposta boa (guardada no
// aparelho) e avisa que está sem conexão. Como cada previsão tem validade, o que estiver velho
// aparece como "desatualizado" sozinho.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CONFIG } from "../config";
import { buscarAlertas, buscarPontos } from "./api";
import { alertasDaDemo, juntarAlertas } from "./alertas";
import { buscarRelatos, relatosValidos } from "../relatos/relatos";
import { CLIMAS, criarEstadoDemo, emTransicao, gerarPontosDemo, trocarClima } from "./demo";

const CHAVE_GUARDADO = "sima.ultimaResposta";
const CAMPOS_DE_DATA = ["geradaEm", "validaAte", "leituraEm"];

const Contexto = createContext(null);

/** Lê a última resposta boa guardada no aparelho (ou null). */
function lerGuardado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE_GUARDADO) || "null");
    if (!guardado || guardado.urlApi !== CONFIG.urlApi || !Array.isArray(guardado.pontos)) return null;
    const pontos = guardado.pontos.map((p) => {
      const ponto = { ...p };
      for (const campo of CAMPOS_DE_DATA) ponto[campo] = p[campo] ? new Date(p[campo]) : null;
      return ponto;
    });
    return { pontos, atualizadoEm: new Date(guardado.atualizadoEm) };
  } catch {
    return null;
  }
}

function guardar(pontos, atualizadoEm) {
  try {
    localStorage.setItem(CHAVE_GUARDADO, JSON.stringify({ urlApi: CONFIG.urlApi, pontos, atualizadoEm }));
  } catch {
    // Sem espaço ou em aba anônima: o app segue funcionando, só não reabre com os últimos dados.
  }
}

export function ProvedorPontos({ children }) {
  const usaApi = Boolean(CONFIG.urlApi);

  const [estado, setEstado] = useState(() => {
    if (!usaApi) {
      return { pontos: gerarPontosDemo(), alertas: [], relatos: [], fonte: "demo", carregando: false, erro: null, atualizadoEm: new Date(), semPosicao: 0 };
    }
    const guardado = lerGuardado();
    return { pontos: guardado?.pontos ?? [], alertas: [], relatos: [], fonte: "api", carregando: true, erro: null,
      atualizadoEm: guardado?.atualizadoEm ?? null, semPosicao: 0 };
  });

  // Relógio da tela: faz "há 3 min" andar e as previsões vencerem mesmo sem resposta nova.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 30 * 1000);
    return () => clearInterval(relogio);
  }, []);

  // Demonstração: o clima escolhido e, durante a troca, um relógio rápido para a cidade ir mudando.
  const [clima, setClima] = useState(() => criarEstadoDemo("sol"));
  const definirClima = useCallback((id) => {
    const instante = new Date();
    setClima((atual) => trocarClima(atual, id, instante));
    setAgora(instante);
  }, []);
  useEffect(() => {
    if (usaApi || !emTransicao(clima)) return undefined;
    const relogio = setInterval(() => {
      const instante = new Date();
      setAgora(instante);
      if (!emTransicao(clima, instante)) clearInterval(relogio);
    }, 300);
    return () => clearInterval(relogio);
  }, [usaApi, clima]);

  const buscando = useRef(false);
  const atualizar = useCallback(async () => {
    if (!usaApi || buscando.current) return;
    buscando.current = true;
    try {
      // Os alertas e os relatos vão junto, mas não derrubam o mapa: se só eles falharem (um
      // backend antigo, sem a rota), ficam os que já estavam na tela.
      const [{ pontos, semPosicao }, alertas, relatos] = await Promise.all([
        buscarPontos(), buscarAlertas().catch(() => null), buscarRelatos().catch(() => null),
      ]);
      const atualizadoEm = new Date();
      guardar(pontos, atualizadoEm);
      setEstado((anterior) => ({ pontos, alertas: alertas ?? anterior.alertas, relatos: relatos ?? anterior.relatos, fonte: "api",
        carregando: false, erro: null, atualizadoEm, semPosicao }));
    } catch (erro) {
      setEstado((anterior) => ({ ...anterior, carregando: false, erro: erro.message || "Sem conexão com o servidor." }));
    } finally {
      buscando.current = false;
      setAgora(new Date());
    }
  }, [usaApi]);

  useEffect(() => {
    if (!usaApi) return undefined;
    atualizar();
    const relogio = setInterval(() => {
      // Com o app em segundo plano não há por que gastar rede e bateria.
      if (document.visibilityState === "visible") atualizar();
    }, CONFIG.intervaloAtualizacaoMs);
    const aoVoltar = () => { if (document.visibilityState === "visible") atualizar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", atualizar);
    return () => {
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", atualizar);
    };
  }, [usaApi, atualizar]);

  const valor = useMemo(() => {
    // Na demonstração os horários acompanham o relógio, para a tela nunca "envelhecer" sozinha.
    const semAlerta = usaApi ? estado.pontos : gerarPontosDemo(agora, clima);
    const alertas = usaApi ? estado.alertas : alertasDaDemo(semAlerta);
    // Cada ponto leva o alerta ativo dele (`ponto.alerta`): o mapa, o cartão e as listas só leem.
    const pontos = juntarAlertas(semAlerta, alertas);
    return {
      ...estado,
      pontos,
      /** Relatos aprovados e ainda válidos. Na demonstração não há (dependem do servidor). */
      relatos: usaApi ? relatosValidos(estado.relatos, agora) : [],
      /** Alertas ativos do sensor (medição), do mais antigo para o mais novo. */
      alertas: [...alertas].sort((a, b) => (a.desde?.getTime() ?? 0) - (b.desde?.getTime() ?? 0)),
      agora,
      atualizar,
      /** Só na demonstração: clima em vigor, as opções e a função que troca. Com backend é null. */
      demo: usaApi ? null : { clima: clima.clima, climas: CLIMAS, definirClima, mudando: emTransicao(clima, agora) },
      /** true quando alguma previsão foi feita com a chuva simulada do modo de demonstração do backend. */
      simulacao: pontos.some((p) => p.simulada),
      porId: (id) => pontos.find((p) => p.id === String(id)) ?? null,
    };
  }, [usaApi, estado, agora, atualizar, clima, definirClima]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Situação dos bueiros.
 * @returns {{ pontos, alertas, relatos, fonte: "demo"|"api", carregando, erro, atualizadoEm, semPosicao, agora, simulacao, atualizar, porId, demo }}
 */
export function usePontos() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("usePontos precisa estar dentro de <ProvedorPontos>.");
  return valor;
}
