// Repasse das leituras do sensor ao backend (#54).
//
// O ESP32 manda uma leitura a cada 2 s. Aqui elas são juntadas e o backend recebe:
// - a MEDIANA de cada janela (30 s por padrão), que tira os picos do ultrassom;
// - um envio NA HORA quando o nível muda de faixa (baixo, médio, alto, crítico), para o
//   alerta chegar rápido. A faixa vem da mediana das últimas leituras, com a folga nos limites
//   (niveis.js), e entre dois envios imediatos há um intervalo mínimo: leitura oscilando na
//   fronteira não vira um envio por segundo.
//
// O envio corre separado da resposta ao ESP32: backend fora ou lento não atrasa o painel.
// Se o backend não responde, as leituras esperam numa fila curta e o envio é tentado de novo
// com espera crescente. Chave errada (401), sensor desconhecido (404) ou inativo (409) não se
// resolvem sozinhos: ficam registrados em `estado()` e a próxima tentativa só vem depois de 1 min.
//
// A chave é de um sensor só, então só o código dele vai ao backend (`codigo`). Leitura de outro
// código (um teste qualquer na rede) é ignorada: se entrasse na fila, voltaria 404 ou 401 e
// seguraria atrás dela as leituras do sensor de verdade.

const { MEDIDAS_PADRAO, classificarComFolga } = require("./niveis");

const PADRAO = {
  intervaloMs: 30_000,
  minImediatoMs: 5_000,
  recentes: 3,
  filaMax: 20,
  esperaMinMs: 2_000,
  esperaMaxMs: 60_000,
  pausaConfiguracaoMs: 60_000,
  tempoLimiteMs: 10_000,
};

const STATUS_DE_CONFIGURACAO = new Set([401, 403, 404, 409]);

function mediana(valores) {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

const umaCasa = (x) => Math.round(x * 10) / 10;

function explicarStatus(status, corpo) {
  const doBackend = corpo && typeof corpo.mensagem === "string" ? ` (${corpo.mensagem})` : "";
  if (status === 401) return `Chave do sensor recusada: confira SENSOR_CHAVE${doBackend}`;
  if (status === 403) return `Backend recusou o acesso${doBackend}`;
  if (status === 404) return `Sensor não cadastrado no backend${doBackend}`;
  if (status === 409) return `Sensor indisponível no backend${doBackend}`;
  if (status === 400) return `Backend recusou a leitura${doBackend}`;
  return `Backend respondeu ${status}${doBackend}`;
}

class Repasse {
  constructor(opcoes = {}) {
    const o = { ...PADRAO, ...opcoes };
    this.url = o.backendUrl ? `${String(o.backendUrl).replace(/\/+$/, "")}/leituras` : null;
    this.chave = o.chave || "";
    this.codigo = o.codigo || null; // null = aceita qualquer código (só nos testes)
    this.medidas = o.medidas || MEDIDAS_PADRAO; // fundo e cheio do bueiro, para a faixa
    this.o = o;
    this.enviar = o.enviar || ((...args) => fetch(...args));
    this.agora = o.agora || (() => Date.now());
    this.agendar = o.agendar || ((fn, ms) => setTimeout(fn, ms));
    this.cancelar = o.cancelar || ((t) => clearTimeout(t));
    this.log = o.log || console;

    this.sensores = new Map(); // codigo -> { janela, recentes, faixaEnviada, ultimoImediato }
    this.fila = [];
    this.emVoo = null; // o item da fila que está sendo enviado agora
    this.ignorados = new Set(); // códigos que chegaram e não são o deste sensor
    this.enviando = false;
    this.espera = null;
    this.falhasSeguidas = 0;
    this.descartadas = 0;
    this.ultimoSucesso = null;
    this.ultimoErro = null;
    this.falhando = false;
  }

  get ativo() {
    return Boolean(this.url);
  }

  /** Uma leitura do ESP32: { codigo, distanciaCm, em (ms) }. */
  receber({ codigo, distanciaCm, em }) {
    if (!this.ativo) return;
    if (this.codigo && codigo !== this.codigo) {
      if (!this.ignorados.has(codigo)) {
        this.ignorados.add(codigo);
        this.log.warn(`[repasse] Leitura de "${codigo}" não vai ao backend: este servidor repassa só "${this.codigo}" (SENSOR_CODIGO).`);
      }
      return;
    }
    let s = this.sensores.get(codigo);
    if (!s) {
      s = { janela: [], recentes: [], faixaEnviada: null, ultimoImediato: -Infinity };
      this.sensores.set(codigo, s);
    }
    s.janela.push({ distanciaCm, em });
    s.recentes.push(distanciaCm);
    if (s.recentes.length > this.o.recentes) s.recentes.shift();

    const suave = mediana(s.recentes);
    const faixa = classificarComFolga(suave, s.faixaEnviada, this.medidas).status;
    const agora = this.agora();
    const primeira = s.faixaEnviada === null;
    if ((primeira || faixa !== s.faixaEnviada) && agora - s.ultimoImediato >= this.o.minImediatoMs) {
      s.ultimoImediato = agora;
      s.janela = [];
      this.enfileirar(codigo, s, suave, em);
    }
  }

  /** Fecha a janela de cada sensor e manda a mediana. Chamado a cada `intervaloMs`. */
  periodico() {
    if (!this.ativo) return;
    for (const [codigo, s] of this.sensores) {
      if (!s.janela.length) continue;
      const valor = mediana(s.janela.map((l) => l.distanciaCm));
      const em = s.janela[s.janela.length - 1].em;
      s.janela = [];
      this.enfileirar(codigo, s, valor, em);
    }
  }

  enfileirar(codigo, s, distanciaCm, em) {
    s.faixaEnviada = classificarComFolga(distanciaCm, s.faixaEnviada, this.medidas).status;
    this.fila.push({ codigo, distanciaCm: umaCasa(distanciaCm), medidaEm: new Date(em).toISOString() });
    // Fila cheia: sai a mais antiga, menos a que está sendo enviada agora (essa sai pela resposta).
    while (this.fila.length > this.o.filaMax) {
      this.fila.splice(this.fila[0] === this.emVoo ? 1 : 0, 1);
      this.descartadas += 1;
    }
    this.bombear();
  }

  esperar(ms) {
    this.espera = this.agendar(() => {
      this.espera = null;
      this.bombear();
    }, ms);
  }

  async bombear() {
    if (this.enviando || this.espera || !this.fila.length) return;
    this.enviando = true;
    const item = this.fila[0];
    this.emVoo = item;
    try {
      const resposta = await this.enviar(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sensor-Chave": this.chave },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(this.o.tempoLimiteMs),
      });
      if (resposta.ok) {
        this.tirar(item);
        this.falhasSeguidas = 0;
        this.falhando = false;
        this.ultimoSucesso = { em: new Date(this.agora()).toISOString(), ...item };
      } else {
        let corpo = null;
        try {
          corpo = await resposta.json();
        } catch {
          corpo = null;
        }
        // 400: o backend está no ar e recusou só esta leitura; o estado não vira "fora".
        const recusouLeitura = resposta.status === 400;
        this.registrarErro(resposta.status, explicarStatus(resposta.status, corpo), { falha: !recusouLeitura });
        if (recusouLeitura) {
          this.tirar(item); // a leitura em si é inválida: tentar de novo não adianta
        } else if (STATUS_DE_CONFIGURACAO.has(resposta.status)) {
          this.esperar(this.o.pausaConfiguracaoMs);
        } else {
          this.esperarCrescente();
        }
      }
    } catch (erro) {
      this.registrarErro(null, `Backend fora do ar: ${erro.cause?.code || erro.name || erro.message}`);
      this.esperarCrescente();
    } finally {
      this.enviando = false;
      this.emVoo = null;
    }
    if (!this.espera && this.fila.length) this.bombear();
  }

  esperarCrescente() {
    this.falhasSeguidas += 1;
    const ms = Math.min(this.o.esperaMinMs * 2 ** (this.falhasSeguidas - 1), this.o.esperaMaxMs);
    this.esperar(ms);
  }

  /** Tira da fila este item (não "o primeiro": a fila pode ter andado enquanto ele era enviado). */
  tirar(item) {
    const i = this.fila.indexOf(item);
    if (i !== -1) this.fila.splice(i, 1);
  }

  registrarErro(status, mensagem, { falha = true } = {}) {
    const repetido = this.ultimoErro && this.ultimoErro.mensagem === mensagem;
    this.ultimoErro = { em: new Date(this.agora()).toISOString(), status, mensagem };
    this.falhando = falha;
    if (!repetido) this.log.warn(`[repasse] ${mensagem}`);
  }

  estado() {
    let backend = "desligado";
    if (this.ativo) {
      if (this.falhando) backend = "fora";
      else if (this.ultimoSucesso) backend = "ligado";
      else backend = "aguardando";
    }
    return {
      backend,
      codigo: this.codigo,
      intervaloSegundos: this.o.intervaloMs / 1000,
      ultimoSucesso: this.ultimoSucesso,
      ultimoErro: this.ultimoErro,
      naFila: this.fila.length,
      descartadas: this.descartadas,
      ignorados: [...this.ignorados],
    };
  }

  parar() {
    if (this.espera) this.cancelar(this.espera);
    this.espera = null;
  }
}

module.exports = { Repasse, mediana, PADRAO };
