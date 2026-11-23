// Tudo o que muda de ambiente para ambiente. Defina no arquivo .env.local (veja .env.example).
// Sem configuração nenhuma o app abre com os dados de demonstração.

// Fora do Vite (testes com node --test) import.meta.env não existe.
const env = import.meta.env ?? {};

import { demoPedida } from "./dados/modoDemo.js";

// `npm run demo` (ou VITE_DEMO=1) força a demonstração mesmo com um backend configurado no
// .env.local: é um app que só tem a demonstração.
const soDemo = env.MODE === "demo" || env.VITE_DEMO === "1";

/** O backend que este app foi gerado para usar (vazio = nenhum). */
const urlApiConfigurada = soDemo ? "" : (env.VITE_API_URL || "").replace(/\/$/, "");

// Com backend configurado, a demonstração continua a um toque: ?demo=1 no endereço ou o item
// "Dados" do Menu (src/dados/modoDemo.js). A escolha é lida uma vez, ao abrir o app.
const emDemo = !urlApiConfigurada || demoPedida() === true;

export const CONFIG = {
  /** Base do backend em uso (ex.: /api ou http://localhost:8080). Vazio = dados de demonstração. */
  urlApi: emDemo ? "" : urlApiConfigurada,

  /** O backend configurado, mesmo com a demonstração ligada. Vazio = este app só tem a demonstração. */
  urlApiConfigurada,

  /** De quanto em quanto tempo o app consulta as previsões de novo. O backend recalcula a cada 10 min. */
  intervaloAtualizacaoMs: Number(env.VITE_INTERVALO_S || 90) * 1000,

  /** Quanto esperar pela resposta do backend antes de desistir. */
  tempoLimiteMs: 6000,

  /**
   * Código do sensor de bancada (o protótipo com o balde). Quando ele existe na resposta do
   * backend, a busca o oferece logo no topo, para achá-lo rápido numa apresentação.
   */
  sensorDeBancada: env.VITE_SENSOR_BANCADA || "bueiro_01",

  /** Janela da previsão do modelo de IA, em horas. Usada quando a resposta não informa. */
  janelaHorasPadrao: 3,

  mapa: {
    /** TileJSON dos tiles vetoriais (esquema OpenMapTiles). Padrão: OpenFreeMap, gratuito e sem chave. */
    urlTiles: env.VITE_MAPA_TILES || "https://tiles.openfreemap.org/planet",
    /** Fontes dos nomes de rua no mapa. */
    urlGlifos: env.VITE_MAPA_GLIFOS || "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    /** Onde o mapa abre quando ainda não há pontos: centro de São Paulo. [longitude, latitude] */
    centro: [-46.635, -23.545],
    zoom: 10.5,
    /** Limites de navegação: Grande São Paulo. [[oeste, sul], [leste, norte]] */
    limites: [[-47.2, -24.1], [-46.0, -23.1]],
  },

  rotas: {
    /** Serviço de rotas (Valhalla). Padrão: servidor público da FOSSGIS, sem chave, uso justo. */
    urlValhalla: (env.VITE_ROTAS_URL || "https://valhalla1.openstreetmap.de").replace(/\/$/, ""),
    /** Busca de endereço (Photon). Padrão: servidor público da komoot, sem chave. */
    urlPhoton: (env.VITE_ENDERECOS_URL || "https://photon.komoot.io").replace(/\/$/, ""),
    /** Espaço mínimo entre dois pedidos de rota: o servidor público pede no máximo um por segundo. */
    intervaloMs: 1100,
    /** Quanto esperar pela resposta antes de desistir. */
    tempoLimiteMs: 12000,
    /**
     * Quanto esperar pela busca de endereço antes de desistir. Menor que o da rota: a busca
     * costuma responder em 1 s e, se falhar, é tentada mais uma vez antes do aviso de erro.
     */
    tempoLimiteEnderecoMs: 6000,
    /** Pausa antes da segunda tentativa da busca de endereço. */
    esperaNovaTentativaMs: 700,
  },
};
