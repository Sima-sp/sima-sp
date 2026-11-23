// Servidor do sensor do SIMA-SP: recebe a leitura do ESP32, mostra no painel da bancada e
// repassa ao backend (#54). Configuração no README e no .env.example.

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { LIMITES, classificar } = require("./niveis");
const { Repasse } = require("./repasse");

// Mesmo limite do backend (POST /leituras recusa acima de 2000 cm).
const DISTANCIA_MAX_CM = 2000;

function criarApp({ repasse } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public"))); // painel web

  let ultima = null;
  const clientes = new Set();

  // O ESP32 envia os dados para cá
  app.post("/api/leitura", (req, res) => {
    const { device, distancia } = req.body || {};

    if (typeof distancia !== "number" || !Number.isFinite(distancia) || distancia <= 0 || distancia > DISTANCIA_MAX_CM) {
      return res.sendStatus(400);
    }

    const em = Date.now();
    ultima = {
      device: device || "desconhecido",
      distancia,
      ...classificar(distancia),
      em: new Date(em).toISOString(),
    };

    console.log(`[${ultima.titulo.toUpperCase()}] ${ultima.distancia} cm`);

    clientes.forEach((c) => c.write(`data: ${JSON.stringify(ultima)}\n\n`));
    res.sendStatus(200);

    // Depois de responder: o repasse nunca atrasa o ESP32 nem o painel.
    if (repasse && device) repasse.receber({ codigo: device, distanciaCm: distancia, em });
  });

  // A página web consulta aqui
  app.get("/api/leitura", (req, res) => res.json(ultima));
  app.get("/api/limites", (req, res) => res.json(LIMITES));
  app.get("/api/estado", (req, res) =>
    res.json(repasse ? repasse.estado() : { backend: "desligado", naFila: 0 }),
  );

  // Tempo real (Server-Sent Events)
  app.get("/api/stream", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    if (ultima) res.write(`data: ${JSON.stringify(ultima)}\n\n`);
    clientes.add(res);
    req.on("close", () => clientes.delete(res));
  });

  return app;
}

function lerConfiguracao(env = process.env) {
  const intervaloS = Number(env.INTERVALO_REPASSE_S || 30);
  return {
    porta: Number(env.PORT || 3000),
    backendUrl: (env.BACKEND_URL || "").trim(),
    chave: (env.SENSOR_CHAVE || "").trim(),
    intervaloMs: Number.isFinite(intervaloS) && intervaloS > 0 ? intervaloS * 1000 : 30_000,
  };
}

if (require.main === module) {
  const arquivoEnv = path.join(__dirname, ".env");
  if (fs.existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

  const cfg = lerConfiguracao();
  const repasse = new Repasse({ backendUrl: cfg.backendUrl, chave: cfg.chave, intervaloMs: cfg.intervaloMs });
  if (repasse.ativo) {
    if (!cfg.chave) console.warn("[repasse] SENSOR_CHAVE vazia: o backend vai recusar as leituras (401).");
    setInterval(() => repasse.periodico(), cfg.intervaloMs);
    console.log(`Repassando ao backend ${cfg.backendUrl} (mediana a cada ${cfg.intervaloMs / 1000} s)`);
  } else {
    console.log("Sem BACKEND_URL: só o painel da bancada, nada vai ao backend.");
  }

  criarApp({ repasse }).listen(cfg.porta, "0.0.0.0", () => console.log(`SIMA rodando na porta ${cfg.porta}`));
}

module.exports = { criarApp, lerConfiguracao, DISTANCIA_MAX_CM };
