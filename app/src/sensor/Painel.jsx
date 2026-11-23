// Painel do sensor: a página que mostra o protótipo do sensor (ESP32) funcionando, em tempo real.
//
// É uma página SEPARADA do app (sensor.html), feita para a bancada de uma apresentação: ocupa a
// tela inteira do computador, com o desenho do bueiro de um lado e o nível do outro, e se
// reorganiza em uma coluna no celular.
//
// O protótipo mede a DISTÂNCIA do sensor até a água (em cm) e envia pelo Wi-Fi para o servidor do
// sensor, o programa em Node do grupo do IoT. Esta página pergunta a última leitura a esse
// servidor uma vez por segundo e mostra:
//   - a água em % do bueiro e o nível (baixo, médio, alto, crítico), com a MESMA conta do backend;
//   - quanto falta para transbordar, quando a água sobe de forma consistente ("se continuar assim");
//   - um desenho do bueiro em corte, com a água subindo e as marcas de cada nível;
//   - como aquele bueiro apareceria no mapa;
//   - com o backend configurado, o que o SIMA recebeu e previu para o sensor de bancada (sistema.js),
//     separando o que foi medido do que foi previsto.
//
// De onde vem a leitura:
//   - do servidor do sensor (servidor.js). Se a página foi aberta do PRÓPRIO servidor do sensor
//     (o arquivo único de `npm run painel` dentro da pasta public dele), ela conecta sozinha; nos
//     outros casos, depois de tocar em "Conectar ao sensor"; ou
//   - da simulação ("Simular sem o sensor"), sempre identificada como simulação. É a reserva se o
//     Wi-Fi ou o protótipo falharem.
// A conta da distância para o nível está em nivel.js (com testes). As medidas do bueiro
// (profundidade e distância de cheio) vêm do backend, quando o sensor de bancada está cadastrado
// com elas; senão, de "Ajustes do sensor".

import { useCallback, useEffect, useRef, useState } from "react";
import { rotuloNivel } from "../dados/niveis";
import { usePreferencias } from "../preferencias/PreferenciasContexto";
import { Tampa } from "../componentes/Tampa";
import { CONFIG } from "../config";
import {
  ALCANCE, LIMITES_PERCENTUAIS, MEDIDAS_PADRAO, arrumarMedidas, distanciaDoPercentual, distanciaFirme, escalaDoDesenho, lerLeitura,
  lerRegraDoServidor, medidasValidas, mesmaRegra, mesmasMedidas, naZonaCega, nivelDaDistancia, percentualDaAgua, tempoAteTransbordar, textoDaDistancia,
  textoDoPercentual, textoDoTempo,
} from "./nivel";
import { buscarNoSistema, resumoDoSistema, temBackend } from "./sistema";
import { ENDERECO_PADRAO, acompanharSensor, arrumarEndereco, buscarLimites, podeSerBloqueado } from "./servidor";

const CHAVE = "sima.sensor";
/** Quantas leituras ficam guardadas: no ritmo do firmware (uma a cada 2 s), um pouco mais de 2 minutos, para o tempo até transbordar. */
const GUARDADAS = 70;
/** Quantas aparecem na fileira de pontos (perto de um minuto). */
const NA_FILEIRA = 24;
/** De quanto em quanto tempo a página pergunta ao backend o que o SIMA diz do sensor. */
const INTERVALO_SISTEMA_MS = 15000;
/** A página pergunta ao servidor a cada tanto. */
const INTERVALO_MS = 1000;
/** Quantas perguntas seguidas sem resposta até a página dizer que não achou o servidor. */
const FALHAS_PARA_AVISAR = 3;
/** Procurando o servidor há mais que isto, a página já mostra o que conferir (sem parar de procurar). */
const DEMORA_MS = 8000;
/** Sem leitura nova por este tempo (cinco envios do firmware), a página avisa que o sensor parou. */
const PARADO_MS = 10000;
/**
 * Leituras mais novas que isto (em relação à última) entram na mediana que a página mostra.
 * O firmware do protótipo envia uma leitura a cada 2 s, então hoje aparece a última leitura,
 * sem atraso. A mediana só entra em ação se o envio ficar mais rápido que isto.
 */
const JANELA_MS = 1500;
/** A simulação vai desta distância (já dentro da zona cega do sensor, para dar para mostrá-la) até o fim do desenho. */
const SIMULADA_MINIMA = 10;
/** true quando a página foi gerada como arquivo único (npm run painel): não há app ao lado para onde voltar. */
const ARQUIVO_UNICO = import.meta.env.MODE === "painel";

const DICA_DO_NIVEL = {
  1: "Bueiro com folga.",
  2: "A água está subindo.",
  3: "Água alta: é hora de acompanhar de perto.",
  4: "Bueiro cheio: transbordando. É isto que cria o alerta no SIMA.",
};

function lerAjustes() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE) || "{}") || {};
    // (Os limites em cm de antes de #41 ficam para trás: a regra agora é em % do bueiro.)
    return { endereco: arrumarEndereco(guardado.endereco) ?? ENDERECO_PADRAO, ligar: guardado.ligar === true, medidas: arrumarMedidas(guardado.medidas) };
  } catch {
    return { endereco: ENDERECO_PADRAO, ligar: false, medidas: MEDIDAS_PADRAO };
  }
}

/** As duas medidas como texto, para os campos de Ajustes. */
const emTexto = (medidas) => ({ profundidade: String(medidas.profundidade).replace(".", ","), cheio: String(medidas.cheio).replace(".", ",") });
/** O que foi digitado nos campos, como números (vírgula vale como ponto); campo vazio vira NaN. */
const emNumeros = (digitados) => Object.fromEntries(Object.entries(digitados).map(([nome, texto]) => [nome, texto.trim() === "" ? NaN : Number(texto.replace(",", "."))]));

const haQuanto = (quando, agora) => {
  const s = Math.max(0, Math.round((agora - quando) / 1000));
  if (s < 2) return "agora";
  return s < 60 ? `há ${s} s` : `há ${Math.round(s / 60)} min`;
};

export default function Painel() {
  const { tema, mudar: mudarPreferencias } = usePreferencias();
  const [ajustes, setAjustes] = useState(lerAjustes);
  // A página veio do próprio servidor do sensor? null = ainda conferindo.
  const [servidorProprio, setServidorProprio] = useState(null);
  const [conexao, setConexao] = useState("fora"); // "fora" | "procurando" | "ligado" | "sem-servidor"
  const [leituras, setLeituras] = useState([]); // do servidor: { distancia, quando, marca, aparelho }
  // O que o SIMA diz do sensor de bancada (só com o backend configurado): { ponto, alerta, medidas } ou null.
  const [sistema, setSistema] = useState(null);
  const [sistemaFalhou, setSistemaFalhou] = useState(false);
  // As medidas do bueiro: as do backend, quando ele as tem; senão, as de Ajustes.
  const medidas = sistema?.medidas ?? ajustes.medidas;
  const medidasDoBackend = Boolean(sistema?.medidas);
  const [medidasDigitadas, setMedidasDigitadas] = useState(() => emTexto(ajustes.medidas));
  // A regra do servidor do sensor (Node): para conferir se ele dá o mesmo nível que o painel (#41).
  const [regraDoServidor, setRegraDoServidor] = useState(null);
  const [resposta, setResposta] = useState(undefined); // a última resposta crua do servidor
  const [permissao, setPermissao] = useState("desconhecida"); // o que o navegador diz sobre acessar a rede local
  const [buscaDesde, setBuscaDesde] = useState(0); // quando a página começou a procurar o servidor
  const [simulada, setSimulada] = useState(null); // null (desligada) ou a distância simulada, em cm
  const [enderecoDigitado, setEnderecoDigitado] = useState(ajustes.endereco);
  const [enderecoErrado, setEnderecoErrado] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [telaCheia, setTelaCheia] = useState(false);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);

  // Tela cheia do navegador (o mesmo que F11), para a bancada. Nem todo navegador deixa (o do
  // iPhone não deixa): nesse caso o botão não aparece.
  const podeTelaCheia = typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen);
  useEffect(() => {
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);
  const alternarTelaCheia = () => {
    const pedido = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    pedido?.catch?.(() => {}); // o navegador pode recusar; a página segue igual
  };

  // Relógio da página: faz o "há 3 s" andar e percebe quando o sensor para de mandar.
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, []);

  // O que o SIMA diz do sensor de bancada: pergunta ao backend de tempos em tempos. Sem backend
  // configurado (ou fora do ar), a seção não aparece e o painel segue só com o servidor do sensor.
  useEffect(() => {
    if (!temBackend()) return undefined;
    let vivo = true;
    const perguntar = () => buscarNoSistema()
      .then((achado) => { if (vivo) { setSistema(achado); setSistemaFalhou(false); } })
      .catch(() => { if (vivo) setSistemaFalhou(true); });
    perguntar();
    const relogio = setInterval(perguntar, INTERVALO_SISTEMA_MS);
    return () => { vivo = false; clearInterval(relogio); };
  }, []);

  // Ao abrir: o endereço desta página responde como o servidor do sensor? Então a página está
  // dentro dele (pasta public) e conecta sozinha, sem botão e sem permissão do navegador.
  useEffect(() => {
    let vivo = true;
    const aqui = globalThis.location;
    if (!aqui || !/^https?:$/.test(aqui.protocol)) {
      setServidorProprio(false);
      return undefined;
    }
    buscarLimites(aqui.origin)
      .then((recebidos) => { if (vivo) setServidorProprio(lerRegraDoServidor(recebidos) !== null); })
      .catch(() => { if (vivo) setServidorProprio(false); });
    return () => { vivo = false; };
  }, []);

  const mudarAjustes = useCallback((parcial) => {
    setAjustes((anterior) => {
      const novo = { ...anterior, ...parcial };
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novo));
      } catch {
        // Sem espaço ou aba anônima: vale só até fechar a página.
      }
      return novo;
    });
  }, []);

  const endereco = servidorProprio ? globalThis.location.origin : ajustes.endereco;
  const ligar = servidorProprio === true || (servidorProprio === false && ajustes.ligar);

  // Enquanto "ligar" valer, pergunta a leitura ao servidor. Fora do próprio servidor do sensor, a
  // escolha fica guardada: no computador da bancada a página volta a conectar sozinha; em
  // qualquer outro aparelho ela só procura o servidor depois que alguém toca em conectar.
  const falhas = useRef(0);
  useEffect(() => {
    if (!ligar) {
      setConexao("fora");
      return undefined;
    }
    let vivo = true;
    let pedirLimites = true;
    falhas.current = 0;
    setConexao("procurando");
    setBuscaDesde(Date.now());
    setLeituras([]);
    setResposta(undefined);
    const parar = acompanharSensor({
      endereco,
      intervalo: INTERVALO_MS,
      aoVerPermissao: setPermissao,
      aoReceber: (crua) => {
        falhas.current = 0;
        setConexao("ligado");
        setResposta(crua);
        if (pedirLimites) {
          // Uma vez por conexão (e de novo se o servidor cair e voltar, pois pode ter mudado).
          pedirLimites = false;
          buscarLimites(endereco)
            .then((recebidos) => { if (vivo) setRegraDoServidor(lerRegraDoServidor(recebidos)); })
            .catch(() => { if (vivo) setRegraDoServidor(null); });
        }
        const lida = lerLeitura(crua);
        if (!lida) {
          // O servidor responde `null` quando não tem leitura: acabou de ligar (ou foi reiniciado).
          if (crua === null) setLeituras((anteriores) => (anteriores.length ? [] : anteriores));
          return;
        }
        setLeituras((anteriores) => {
          const ultima = anteriores[anteriores.length - 1];
          // O servidor carimba cada leitura com a hora (`em`): carimbo igual é a mesma leitura de antes.
          if (ultima && lida.marca && ultima.marca === lida.marca) return anteriores;
          // A primeira leitura pode ser antiga (o servidor guarda a última para sempre): vale a
          // hora em que o servidor a recebeu. As seguintes chegaram agora, diante da página.
          const quando = anteriores.length === 0 && lida.em !== null ? Math.min(Date.now(), lida.em) : Date.now();
          return [...anteriores.slice(-(GUARDADAS - 1)), { ...lida, quando }];
        });
      },
      aoFalhar: () => {
        falhas.current += 1;
        if (falhas.current >= FALHAS_PARA_AVISAR) {
          setConexao("sem-servidor");
          pedirLimites = true;
        }
      },
    });
    return () => { vivo = false; parar(); };
  }, [ligar, endereco]);

  // No celular o desenho fica no alto da página: ao ligar a simulação, a página sobe até ele.
  const palco = useRef(null);
  const ligarSimulacao = () => {
    setSimulada((atual) => atual ?? Math.round(distanciaDoPercentual(30, medidas)));
    requestAnimationFrame(() => palco.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  // Os ajustes abrem embaixo da página; ao abrir, a página desce até eles.
  const ajustesNaTela = useRef(null);
  const alternarAjustes = () => {
    setAjustesAbertos((abertos) => !abertos);
    if (!ajustesAbertos) setTimeout(() => ajustesNaTela.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };

  // Medidas do bueiro: o que é digitado vale na hora, se couber no sensor; senão, a página segue
  // com as medidas anteriores e diz o que está errado.
  const mudarMedida = (nome, texto) => {
    const digitadas = { ...medidasDigitadas, [nome]: texto };
    setMedidasDigitadas(digitadas);
    const numeros = emNumeros(digitadas);
    if (medidasValidas(numeros)) mudarAjustes({ medidas: arrumarMedidas(numeros) });
  };
  const voltarAsMedidasDeExemplo = () => {
    setMedidasDigitadas(emTexto(MEDIDAS_PADRAO));
    mudarAjustes({ medidas: MEDIDAS_PADRAO });
  };
  const medidasErradas = !medidasValidas(emNumeros(medidasDigitadas));

  const usarEndereco = () => {
    const arrumado = arrumarEndereco(enderecoDigitado);
    setEnderecoErrado(arrumado === null);
    if (arrumado === null) return;
    setEnderecoDigitado(arrumado);
    if (arrumado !== ajustes.endereco) mudarAjustes({ endereco: arrumado });
  };

  // O que o sensor está dizendo agora.
  const ligado = conexao === "ligado";
  const ultima = leituras[leituras.length - 1] ?? null;
  const penultima = leituras[leituras.length - 2] ?? null;
  // O sensor "parou" quando passa bem mais tempo que o normal dele sem leitura nova.
  // (O ritmo só vale a partir da terceira leitura: a primeira pode ser antiga.)
  const ritmo = leituras.length >= 3 ? Math.min(ultima.quando - penultima.quando, 40000) : 0;
  const parado = ligado && ultima !== null && agora - ultima.quando > Math.max(PARADO_MS, 3 * ritmo);
  const recentes = ultima ? leituras.filter((l) => ultima.quando - l.quando <= JANELA_MS).slice(-3) : [];
  const doSensor = ligado && ultima && !parado ? distanciaFirme(recentes.map((l) => l.distancia)) : null;
  const invalida = ligado && ultima !== null && !parado && doSensor === null;

  // O que a página mostra: a simulação, quando ligada, ou a medida do sensor.
  const simulando = simulada !== null;
  const distancia = simulando ? simulada : doSensor;
  const percentual = distancia === null ? null : percentualDaAgua(distancia, medidas);
  const nivel = distancia === null ? null : nivelDaDistancia(distancia, medidas);
  const escala = escalaDoDesenho(medidas);
  // Quanto falta para transbordar: só com leituras do sensor (a simulação é arrastada à mão) e só
  // quando a água sobe de forma consistente. Sem isso, a página não diz nada.
  const tempo = !simulando && doSensor !== null && nivel !== 4 ? tempoAteTransbordar(leituras, medidas) : null;

  // O que conferir quando o servidor não aparece. Com o navegador negando o acesso, o motivo é esse.
  const negado = ligar && !ligado && permissao === "denied";
  const demorando = conexao === "procurando" && agora - buscaDesde > DEMORA_MS;
  const semServidor = !simulando && (conexao === "sem-servidor" || demorando || negado);

  let titulo = "Sem leitura";
  let frase = servidorProprio === null ? "Abrindo…" : "Conecte ao sensor para começar.";
  if (nivel !== null) {
    titulo = `Nível ${rotuloNivel(nivel).toLowerCase()}`;
    frase = DICA_DO_NIVEL[nivel];
    if (naZonaCega(distancia)) frase += ` A menos de ${textoDaDistancia(ALCANCE.minimo)}, o sensor já não mede com precisão.`;
  } else if (invalida) {
    titulo = "Leitura inválida";
    frase = `O sensor mandou ${String(ultima.distancia).replace(".", ",")} cm, que não é uma medida possível (ele alcança até ${ALCANCE.maximo} cm). Em geral é o sensor sem receber o eco de volta: confira se ele está apontado para a água.`;
  } else if (parado) {
    titulo = "Sensor parado";
    // O firmware só envia quando consegue medir: silêncio pode ser a placa desligada, o Wi-Fi ou o sensor sem eco.
    frase = `A última leitura chegou ${haQuanto(ultima.quando, agora)}. O ESP32 só envia quando consegue medir: confira se ele está ligado, no Wi-Fi e com o sensor apontado para a água.`;
  } else if (ligado) frase = "O servidor respondeu. Esperando a primeira medida do sensor…";
  else if (negado) frase = "O navegador não deixou a página falar com o servidor do sensor.";
  else if (conexao === "procurando") frase = "Procurando o servidor do sensor…";
  else if (conexao === "sem-servidor") frase = "O servidor do sensor não respondeu.";

  // O selo do alto da página: de onde vem o que está na tela, em poucas palavras.
  let selo = { tipo: "fora", texto: "Desconectado" };
  if (simulando) selo = { tipo: "simulacao", texto: "Simulação" };
  else if (nivel !== null) selo = { tipo: "vivo", texto: `Ao vivo · leitura ${haQuanto(ultima.quando, agora)}` };
  else if (ligado) selo = { tipo: "espera", texto: parado ? "Sensor parado" : invalida ? "Leitura inválida" : "Esperando o sensor" };
  else if (conexao === "procurando") selo = { tipo: "espera", texto: "Procurando o servidor" };
  else if (conexao === "sem-servidor" || negado) selo = { tipo: "erro", texto: "Sem o servidor do sensor" };

  const maximaSimulada = Math.round(escala);
  const posicaoSimulada = simulando ? maximaSimulada + SIMULADA_MINIMA - simulada : 0;
  const nivelDaUltima = ultima ? nivelDaDistancia(ultima.distancia, medidas) : null;
  const naFileira = leituras.slice(-NA_FILEIRA);
  const doSistema = sistema ? resumoDoSistema(sistema, new Date(agora)) : null;

  return (
    <div className="ps">
      <header className="ps-topo">
        <p className="ps-marca"><span className="stamp">SIMA</span><span className="ps-marca-tela">Sensor ao vivo</span></p>
        <p className={`ps-selo ps-selo-${selo.tipo}`} role="status"><i aria-hidden="true" />{selo.texto}</p>
        <div className="ps-topo-acoes">
          {podeTelaCheia ? (
            <button type="button" className="btn btn-iron ps-botao" onClick={alternarTelaCheia}>{telaCheia ? "Sair da tela cheia" : "Tela cheia"}</button>
          ) : null}
          <button type="button" className="btn btn-iron ps-botao" onClick={() => mudarPreferencias({ tema: tema === "claro" ? "escuro" : "claro" })}>
            {tema === "claro" ? "Tema escuro" : "Tema claro"}
          </button>
          {ARQUIVO_UNICO ? null : <a className="btn btn-iron ps-botao" href="./">Abrir o mapa</a>}
        </div>
      </header>

      <main className="ps-corpo">
        <h1 className="so-leitor">Sensor ao vivo: o protótipo do sensor do SIMA</h1>

        <section className="plate ps-palco" aria-label="Desenho do bueiro" ref={palco}>
          <BueiroEmCorte distancia={distancia} nivel={nivel} medidas={medidas} escala={escala} />
          {simulando ? (
            // O controle da simulação fica colado no desenho, para a pessoa ver a água subir enquanto arrasta.
            <div className="ps-faixa">
              <label className="ps-rotulo" htmlFor="ps-simulada">Simulação: arraste para a água subir</label>
              <input id="ps-simulada" className="ps-desliza" type="range" min="0" max={maximaSimulada} step="1" value={posicaoSimulada}
                aria-valuetext={`Água a ${textoDaDistancia(simulada)} do sensor`}
                style={{ "--pct": `${(posicaoSimulada / maximaSimulada) * 100}%` }}
                onChange={(e) => setSimulada(maximaSimulada + SIMULADA_MINIMA - Number(e.target.value))} />
            </div>
          ) : null}
        </section>

        <section className="ps-leitura" aria-label="Leitura do sensor">
          <div className="ps-estado" role="status">
            <p className="label ps-olho">{simulando ? "Simulação: não vem do sensor" : ultima?.aparelho && ligado ? `Bueiro monitorado · ${ultima.aparelho}` : "Bueiro monitorado"}</p>
            <p className={`ps-titulo ${nivel ? `ps-n${nivel}` : ""}`}>{titulo}</p>
            {nivel !== null ? (
              <p className="ps-medida"><b>{Math.round(percentual)}</b><span>%</span><em>de água no bueiro · {textoDaDistancia(distancia)} do sensor até a água</em></p>
            ) : null}
            <p className="ps-frase">{frase}</p>
            {tempo ? (
              <p className="ps-tempo"><b>Transborda {textoDoTempo(tempo.segundos)}</b>, se continuar assim. A água sobe {String(Math.round(tempo.cmPorMinuto * 10) / 10).replace(".", ",")} cm por minuto.</p>
            ) : null}
          </div>

          <div className="ps-no-mapa">
            <Tampa nivel={nivel} tamanho={56} />
            <p className="small">
              <b>No mapa do SIMA</b>
              {nivel !== null ? `A tampa deste bueiro apareceria assim: nível ${rotuloNivel(nivel).toLowerCase()}.` : "O bueiro aparece sem leitura até o sensor responder."}
            </p>
          </div>

          {naFileira.length && !simulando ? (
            <div className="ps-historico">
              <p className="label">Últimas leituras <span>· a mais recente à direita</span></p>
              <div className="ps-pontos" role="img"
                aria-label={`Últimas ${naFileira.length} leituras do sensor. A mais recente: ${nivelDaUltima ? `${textoDaDistancia(ultima.distancia)}, nível ${rotuloNivel(nivelDaUltima).toLowerCase()}` : "inválida"}.`}>
                {naFileira.map((l) => <i key={`${l.quando}-${l.marca}`} className={`ps-ponto ps-ponto-n${nivelDaDistancia(l.distancia, medidas) ?? 0}`} />)}
              </div>
            </div>
          ) : null}

          {/* O que o SIMA (backend) diz deste sensor: medido e previsto separados. */}
          {doSistema ? (
            <div className="ps-sistema">
              <p className="label">No SIMA <span>· sensor {sistema.ponto.codigo}</span></p>
              <dl>
                <div><dt>Medido</dt><dd>{doSistema.medido}</dd></div>
                {doSistema.alerta ? <div className="ps-sistema-alerta"><dt>Alerta</dt><dd>{doSistema.alerta}</dd></div> : null}
                <div><dt>Previsto pela IA</dt><dd>{doSistema.previsto}</dd></div>
              </dl>
            </div>
          ) : temBackend() && (sistemaFalhou || sistema === null) ? (
            <p className="micro ps-sistema-nada">
              {sistemaFalhou ? "O servidor do SIMA não respondeu; o painel segue com o sensor." : `O sensor ${CONFIG.sensorDeBancada} não está cadastrado no servidor do SIMA.`}
            </p>
          ) : null}

          {/* Conectado, este bloco some (desconectar fica em Ajustes): a leitura é o que importa. */}
          {servidorProprio === false && !ligado ? (
            <div className="ps-conexao">
              {ajustes.ligar ? null
                : <button type="button" className="btn btn-bone" onClick={() => { setSimulada(null); mudarAjustes({ ligar: true }); }}>Conectar ao sensor</button>}
              <p className="micro ps-situacao" role="status">
                {conexao === "fora" ? `A página procura o servidor do sensor em ${endereco}. O endereço muda em Ajustes.` : null}
                {conexao === "procurando" ? `Procurando em ${endereco}…${permissao === "prompt" ? " Se o navegador perguntar se esta página pode acessar a rede local ou outros apps deste dispositivo, permita." : ""}` : null}
              </p>
            </div>
          ) : null}

          {semServidor ? (
            <div className="small ps-erro" role="alert">
              {negado ? (
                <>
                  <p>O navegador está impedindo esta página de falar com o servidor do sensor.</p>
                  <ul>
                    <li>Clique no ícone à esquerda do endereço da página e libere o acesso à rede local (ou a outros apps deste dispositivo).</li>
                    <li>Depois recarregue a página.</li>
                  </ul>
                </>
              ) : (
                <>
                  <p>Não achei o servidor do sensor em {endereco}. A página continua tentando.</p>
                  <ul>
                    <li>O programa do servidor está rodando?</li>
                    {servidorProprio ? null : <li>Se o navegador perguntou sobre a rede local, é preciso permitir.</li>}
                    {servidorProprio ? null : podeSerBloqueado(endereco)
                      ? <li>Este endereço é de outro computador, e o navegador pode bloquear esse pedido na página publicada. Rode o servidor neste computador ou abra a página pelo próprio servidor do sensor.</li>
                      : <li>O endereço em Ajustes está certo?</li>}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </section>
      </main>

      <section className="ps-como" aria-labelledby="ps-como-titulo">
        <h2 className="label" id="ps-como-titulo">Como funcionaria no bueiro</h2>
        <ol className="ps-passos">
          <li className="plate"><span aria-hidden="true">1</span><p className="small">O sensor fica preso embaixo da tampa, apontado para baixo, e mede a distância até a água.</p></li>
          <li className="plate"><span aria-hidden="true">2</span><p className="small">Quanto menor a distância, mais cheio o bueiro. O ESP32 envia a medida pelo Wi-Fi.</p></li>
          <li className="plate"><span aria-hidden="true">3</span><p className="small">O app mostra o nível do bueiro no mapa, e a IA usa essa leitura para calcular a chance de alagar.</p></li>
        </ol>
      </section>

      <footer className="ps-rodape">
        <div className="ps-simular">
          <span className="label" id="ps-rotulo-simular">Simular sem o sensor</span>
          <div className="seg" role="group" aria-labelledby="ps-rotulo-simular">
            <button type="button" className={simulando ? "" : "seg-on"} aria-pressed={!simulando} onClick={() => setSimulada(null)}>Desligada</button>
            <button type="button" className={simulando ? "seg-on" : ""} aria-pressed={simulando} onClick={ligarSimulacao}>Ligada</button>
          </div>
        </div>
        <p className="micro ps-aviso">
          {temBackend() ? "O painel lê a medida do servidor do sensor, na rede local, e pergunta ao servidor do SIMA o que ele recebeu e previu." : "Protótipo: o painel lê a medida do servidor do sensor, na rede local."}
        </p>

        <button type="button" className="btn btn-line ps-abre-ajustes" aria-expanded={ajustesAbertos} aria-controls="ps-ajustes" onClick={alternarAjustes}>
          {ajustesAbertos ? "Fechar os ajustes" : "Ajustes do sensor"}
        </button>
      </footer>

      {ajustesAbertos ? (
        <section className="ps-ajustes-corpo" id="ps-ajustes" aria-label="Ajustes do sensor" ref={ajustesNaTela}>
          <div className="plate ps-ajuste">
            {servidorProprio ? (
              <p className="small"><b>Servidor do sensor</b>Esta página foi aberta do próprio servidor do sensor ({endereco}): conecta sozinha.</p>
            ) : (
              <>
                <label className="ps-rotulo" htmlFor="ps-endereco">Endereço do servidor do sensor</label>
                <div className="ps-endereco-linha">
                  <input id="ps-endereco" className="ps-campo" type="text" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck="false"
                    value={enderecoDigitado} aria-invalid={enderecoErrado} aria-describedby="ps-endereco-ajuda"
                    onChange={(e) => { setEnderecoDigitado(e.target.value); setEnderecoErrado(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") usarEndereco(); }} />
                  <button type="button" className="btn btn-iron" onClick={usarEndereco}>Usar</button>
                </div>
                <p className="micro" id="ps-endereco-ajuda">
                  {enderecoErrado
                    ? "Isso não parece um endereço. Exemplo: 192.168.0.10:3000"
                    : `Com o servidor neste computador: ${ENDERECO_PADRAO}. Em outro computador da rede: o número dele, como 192.168.0.10. Sem a porta, vale 3000.`}
                </p>
                {ajustes.ligar ? <button type="button" className="btn btn-line ps-desconectar" onClick={() => mudarAjustes({ ligar: false })}>Desconectar do sensor</button> : null}
              </>
            )}
          </div>
          <div className="plate ps-ajuste">
            <p className="small"><b>Medidas do bueiro</b>Distâncias do sensor, em centímetros. A água em % e o nível saem delas, com a mesma conta do servidor do SIMA: médio a partir de {LIMITES_PERCENTUAIS.medio} %, alto a partir de {LIMITES_PERCENTUAIS.alto} %, crítico em {LIMITES_PERCENTUAIS.critico} % (cheio).</p>
            {medidasDoBackend ? (
              <p className="small" role="status">
                Vêm do servidor do SIMA (sensor {sistema.ponto.codigo}): fundo a {textoDaDistancia(medidas.profundidade)}, cheio a {textoDaDistancia(medidas.cheio)}.
                Para trocar, mude no cadastro do sensor (<span className="mono">PATCH /admin/sensores/{sistema.ponto.id}</span>): assim o painel, o mapa e o alerta continuam iguais.
              </p>
            ) : (
              <>
                <div className="ps-limites">
                  {[["profundidade", "Fundo do bueiro"], ["cheio", "Bueiro cheio"]].map(([nome, rotulo]) => (
                    <label key={nome} className="ps-limite">
                      <span className="ps-rotulo">{rotulo}</span>
                      <input className="ps-campo" type="text" inputMode="decimal" autoComplete="off" value={medidasDigitadas[nome]}
                        aria-invalid={medidasErradas} aria-describedby="ps-medidas-ajuda" onChange={(e) => mudarMedida(nome, e.target.value)} />
                    </label>
                  ))}
                </div>
                <p className="micro" id="ps-medidas-ajuda" role={medidasErradas ? "alert" : undefined}>
                  {medidasErradas
                    ? `O cheio precisa ser ${ALCANCE.minimo} cm ou mais (abaixo disso o sensor não mede) e o fundo, pelo menos 5 cm além do cheio, até ${ALCANCE.maximo} cm. Enquanto isso, valem as medidas anteriores (${textoDaDistancia(medidas.profundidade)} e ${textoDaDistancia(medidas.cheio)}).`
                    : mesmasMedidas(medidas, MEDIDAS_PADRAO)
                      ? "São medidas de exemplo, até a bancada ser medida. Meça do sensor até o fundo do balde e até onde a água conta como cheio, e cadastre os mesmos números no sensor do servidor do SIMA."
                      : "Use os mesmos números no cadastro do sensor no servidor do SIMA, para o painel e o mapa darem o mesmo nível."}
                </p>
                {mesmasMedidas(medidas, MEDIDAS_PADRAO) && !medidasErradas ? null
                  : <button type="button" className="btn btn-line ps-desconectar" onClick={voltarAsMedidasDeExemplo}>Voltar às medidas de exemplo</button>}
              </>
            )}
            <RegraDoServidor regra={regraDoServidor} medidas={medidas} />
          </div>
          <div className="plate ps-ajuste">
            <p className="small"><b>O que o servidor respondeu</b></p>
            <pre className="ps-cru" aria-live="off">{resposta === undefined ? "Nada ainda." : JSON.stringify(resposta, null, 1)}</pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Desenho do bueiro em corte: a rua em cima, a tampa, o poço, o sensor embaixo da tampa e a
 * água. A água sobe conforme a distância diminui; as três marcas na parede mostram onde começam
 * os níveis médio (50 %), alto (80 %) e o cheio (100 %, crítico). A linha tracejada logo abaixo do sensor marca o mínimo que ele
 * mede: dali para cima a medida não é confiável. Sem medida, a água fica no fundo, apagada, e a
 * régua some.
 */
/**
 * O servidor do sensor dá o mesmo nível que este painel? (#41) Ele faz a mesma conta em %, com as
 * medidas do .env dele; se forem outras, os dois discordam para a mesma água.
 */
function RegraDoServidor({ regra, medidas }) {
  if (!regra) return null;
  if (regra.regra === "cm") {
    return (
      <p className="micro">
        Este servidor do sensor é de uma versão antiga, que classifica por centímetros, com números próprios. Atualize a pasta iot/servidor-sensor para ele dar o mesmo nível que este painel. O nível que vale é este, em %.
      </p>
    );
  }
  if (mesmaRegra(regra, medidas)) {
    return <p className="micro">O servidor do sensor faz a mesma conta, com as mesmas medidas: os dois dão o mesmo nível para a mesma água.</p>;
  }
  const { limites } = regra;
  const outrosLimites = limites.medio !== LIMITES_PERCENTUAIS.medio || limites.alto !== LIMITES_PERCENTUAIS.alto || limites.critico !== LIMITES_PERCENTUAIS.critico;
  return (
    <p className="micro" role="status">
      {mesmasMedidas(regra.medidas, medidas)
        ? `O servidor do sensor usa outros limites (médio a partir de ${limites.medio} %, alto a partir de ${limites.alto} %, crítico em ${limites.critico} %).`
        : `O servidor do sensor está com outras medidas: fundo a ${textoDaDistancia(regra.medidas.profundidade)} e cheio a ${textoDaDistancia(regra.medidas.cheio)}${regra.deExemplo ? " (as de exemplo)" : ""}. Elas ficam no .env dele (SENSOR_PROFUNDIDADE_CM e SENSOR_CHEIO_CM).`}
      {outrosLimites && !mesmasMedidas(regra.medidas, medidas) ? " Os limites em % também são outros." : ""}
      {" "}Assim, os dois dão níveis diferentes para a mesma água. O nível que vale é este.
    </p>
  );
}

function BueiroEmCorte({ distancia, nivel, medidas, escala }) {
  const SENSOR = 62; // onde o sensor termina: dali para baixo ele mede
  const FUNDO = 190; // a água mais baixa que o desenho mostra
  const yDe = (cm) => SENSOR + (Math.min(Math.max(cm, 0), escala) / escala) * (FUNDO - SENSOR);
  const topo = distancia === null ? FUNDO : yDe(distancia);
  const meio = Math.max((SENSOR + topo) / 2, SENSOR + 12);
  const marcas = [[4, distanciaDoPercentual(LIMITES_PERCENTUAIS.critico, medidas), "cheio"], [3, distanciaDoPercentual(LIMITES_PERCENTUAIS.alto, medidas), "alto"],
    [2, distanciaDoPercentual(LIMITES_PERCENTUAIS.medio, medidas), "médio"]];
  const cega = yDe(ALCANCE.minimo);
  const descricao = distancia === null
    ? "Desenho do bueiro em corte, com o sensor embaixo da tampa, sem medida"
    : `Desenho do bueiro em corte: a água está a ${textoDaDistancia(distancia)} do sensor (${textoDoPercentual(percentualDaAgua(distancia, medidas))} do bueiro), no nível ${rotuloNivel(nivel).toLowerCase()}`;
  return (
    <svg className={`ps-desenho ${distancia === null ? "ps-desenho-vazio" : ""}`} viewBox="0 0 320 212" role="img" aria-label={descricao}>
      <defs><clipPath id="ps-poco"><rect x="92" y="50" width="136" height="146" /></clipPath></defs>
      {/* Terra dos dois lados e o poço no meio */}
      <rect x="0" y="50" width="92" height="162" className="ps-terra" />
      <rect x="228" y="50" width="92" height="162" className="ps-terra" />
      <rect x="92" y="196" width="136" height="16" className="ps-terra" />
      <rect x="92" y="50" width="136" height="146" className="ps-oco" />
      {/* Água */}
      <g clipPath="url(#ps-poco)">
        <rect x="92" y="0" width="136" height="160" className="ps-agua" style={{ transform: `translateY(${topo}px)` }} />
      </g>
      {/* O mínimo que o sensor mede: acima da linha tracejada, ele não mede com precisão */}
      <g className="ps-cega">
        <path d={`M92 ${cega}h136`} />
        {marcas[0][1] > ALCANCE.minimo && yDe(marcas[0][1]) - cega >= 13 ? <text x="84" y={cega + 4} textAnchor="end" className="ps-letra">mín. {textoDaDistancia(ALCANCE.minimo)}</text> : null}
      </g>
      {/* Onde começa cada nível */}
      {marcas.map(([n, cm, nome], i) => (
        <g key={n} className={`ps-lim ps-lim-n${n}`}>
          <path d={`M92 ${yDe(cm)}h18`} />
          {i === 0 || yDe(cm) - yDe(marcas[i - 1][1]) >= 13 ? <text x="84" y={yDe(cm) + 4} textAnchor="end" className="ps-letra">{nome}</text> : null}
        </g>
      ))}
      {/* Rua e tampa */}
      <rect x="0" y="40" width="320" height="10" className="ps-rua" />
      <rect x="92" y="38" width="136" height="12" rx="2" className="ps-tampa" />
      <path d="M104 40v8M118 40v8M132 40v8M146 40v8M160 40v8M174 40v8M188 40v8M202 40v8M216 40v8" className="ps-frestas" />
      {/* Sensor embaixo da tampa, o fio e a placa */}
      <path d="M174 56h36V30h42" className="ps-fio" />
      <rect x="252" y="18" width="52" height="24" rx="5" className="ps-placa" />
      <text x="278" y="34" textAnchor="middle" className="ps-letra">ESP32</text>
      <rect x="146" y="50" width="28" height="12" rx="3" className="ps-sensor" />
      <text x="20" y="33" className="ps-letra">rua</text>
      <text x="84" y="60" textAnchor="end" className="ps-letra">sensor</text>
      {/* A medida: do sensor até a água */}
      {distancia === null ? null : (
        <g className="ps-regua">
          <rect x="0" y="0" width="1.5" height="1" className="ps-regua-linha" style={{ transform: `translate(159.25px, ${SENSOR}px) scaleY(${Math.max(topo - SENSOR, 0)})` }} />
          <g className="ps-regua-anda" style={{ transform: `translateY(${topo}px)` }}><path d="M153 0h14" /></g>
          <g className="ps-regua-anda" style={{ transform: `translateY(${meio}px)` }}>
            <text x="238" y="5" className="ps-letra ps-letra-medida">{textoDaDistancia(distancia)}</text>
          </g>
        </g>
      )}
    </svg>
  );
}
