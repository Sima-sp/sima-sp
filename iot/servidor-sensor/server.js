// Servidor do sensor do SIMA-SP: recebe a leitura do ESP32, mostra no painel da bancada e
// repassa ao backend (#54). Configuração no README e no .env.example.

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { LIMITES, classificarComFolga } = require("./niveis");
const { FiltroDeSalto } = require("./filtro");
const { Repasse } = require("./repasse");

// Mesmo limite do backend (POST /leituras recusa acima de 2000 cm).
const DISTANCIA_MAX_CM = 2000;

// Sem leitura nova por este tempo (cinco envios do firmware, que manda a cada 2 s), o sensor está
// parado (#56): a placa caiu, perdeu o Wi-Fi ou o sensor ficou sem eco. O painel do app usa o
// mesmo tempo.
const PARADO_MS = 10_000;

/**
 * @param {object} [opcoes]
 * @param {Repasse} [opcoes.repasse]     repasse ao backend (sem ele, só o painel)
 * @param {() => number} [opcoes.agora]  relógio, em ms (os testes trocam)
 * @param {FiltroDeSalto} [opcoes.filtro] filtro de eco falso
 * @param {number} [opcoes.checarParadoMs]  de quanto em quanto tempo o /api/stream confere se o sensor parou
 */
function criarApp({ repasse, agora = () => Date.now(), filtro = new FiltroDeSalto(), checarParadoMs = 1000 } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public"))); // painel web

  let ultima = null; // a última leitura aceita, sem a idade (ela muda a cada pedido)
  let avisouParado = false;
  const clientes = new Set();

  // A leitura como sai daqui: com a idade e o aviso de sensor parado.
  const comIdade = () => {
    if (!ultima) return null;
    const idadeMs = Math.max(0, agora() - Date.parse(ultima.em));
    return { ...ultima, idadeSegundos: Math.round(idadeMs / 1000), parado: idadeMs > PARADO_MS };
  };
  const transmitir = () => {
    const dados = `data: ${JSON.stringify(comIdade())}\n\n`;
    clientes.forEach((c) => c.write(dados));
  };

  // O ESP32 envia os dados para cá
  app.post("/api/leitura", (req, res) => {
    const { device, distancia } = req.body || {};

    if (typeof distancia !== "number" || !Number.isFinite(distancia) || distancia <= 0 || distancia > DISTANCIA_MAX_CM) {
      return res.sendStatus(400);
    }

    const em = agora();
    const aparelho = device || "desconhecido";

    // Eco falso: responde 200 (o firmware não precisa saber), mas a leitura não é usada.
    const avaliacao = filtro.avaliar(aparelho, distancia, em);
    if (!avaliacao.aceita) {
      console.log(`[DESCARTADA] ${distancia} cm: salto de ${avaliacao.saltoCm} cm desde a anterior (eco falso?)`);
      return res.sendStatus(200);
    }

    ultima = {
      device: aparelho,
      distancia,
      ...classificarComFolga(distancia, ultima?.device === aparelho ? ultima.status : null),
      em: new Date(em).toISOString(),
    };
    avisouParado = false;

    console.log(`[${ultima.titulo.toUpperCase()}] ${ultima.distancia} cm`);

    transmitir();
    res.sendStatus(200);

    // Depois de responder: o repasse nunca atrasa o ESP32 nem o painel.
    if (repasse && device) repasse.receber({ codigo: device, distanciaCm: distancia, em });
  });

  // A página web consulta aqui
  app.get("/api/leitura", (req, res) => res.json(comIdade()));
  app.get("/api/limites", (req, res) => res.json(LIMITES));
  app.get("/api/estado", (req, res) => {
    const leitura = comIdade();
    res.json({
      ...(repasse ? repasse.estado() : { backend: "desligado", naFila: 0 }),
      sensor: {
        ultimaEm: leitura?.em ?? null,
        idadeSegundos: leitura?.idadeSegundos ?? null,
        parado: leitura?.parado ?? null,
        descartadasPorSalto: filtro.descartadas,
      },
    });
  });

  // Tempo real (Server-Sent Events). Quando o sensor para, quem está ouvindo recebe a última
  // leitura de novo, uma vez, com `parado: true`.
  app.get("/api/stream", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    if (ultima) res.write(`data: ${JSON.stringify(comIdade())}\n\n`);
    clientes.add(res);
    req.on("close", () => clientes.delete(res));
  });

  const vigia = setInterval(() => {
    const leitura = comIdade();
    if (leitura?.parado && !avisouParado) {
      avisouParado = true;
      console.log(`[PARADO] Sem leitura nova há ${leitura.idadeSegundos} s.`);
      transmitir();
    }
  }, checarParadoMs);
  vigia.unref?.(); // não segura o processo (nem os testes) aberto

  return app;
}

function lerConfiguracao(env = process.env) {
  const intervaloS = Number(env.INTERVALO_REPASSE_S || 30);
  return {
    porta: Number(env.PORT || 3000),
    backendUrl: (env.BACKEND_URL || "").trim(),
    chave: (env.SENSOR_CHAVE || "").trim(),
    // O `device` que o firmware manda e o código do sensor no backend (o dono da chave).
    codigo: (env.SENSOR_CODIGO || "").trim() || "bueiro_01",
    intervaloMs: Number.isFinite(intervaloS) && intervaloS > 0 ? intervaloS * 1000 : 30_000,
  };
}

if (require.main === module) {
  const arquivoEnv = path.join(__dirname, ".env");
  if (fs.existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

  const cfg = lerConfiguracao();
  const repasse = new Repasse({
    backendUrl: cfg.backendUrl,
    chave: cfg.chave,
    codigo: cfg.codigo,
    intervaloMs: cfg.intervaloMs,
  });
  if (repasse.ativo) {
    if (!cfg.chave) console.warn("[repasse] SENSOR_CHAVE vazia: o backend vai recusar as leituras (401).");
    setInterval(() => repasse.periodico(), cfg.intervaloMs);
    console.log(
      `Repassando ${cfg.codigo} ao backend ${cfg.backendUrl} (mediana a cada ${cfg.intervaloMs / 1000} s)`,
    );
  } else {
    console.log("Sem BACKEND_URL: só o painel da bancada, nada vai ao backend.");
  }

  criarApp({ repasse }).listen(cfg.porta, "0.0.0.0", () => console.log(`SIMA rodando na porta ${cfg.porta}`));
}

module.exports = { criarApp, lerConfiguracao, DISTANCIA_MAX_CM, PARADO_MS };
