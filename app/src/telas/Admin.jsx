// Área do administrador (#/admin): o mínimo para uma apresentação, sem editar o banco na mão.
//   - Relatos em análise: aprovar ou recusar com motivo;
//   - Alertas ativos: encerrar à mão;
//   - Sensores: ativo, em manutenção ou inativo;
//   - Chuva de teste: o modo de demonstração do backend.
// Cadastrar sensor e gerar a chave dele continuam no Swagger do backend.
//
// Só aparece para quem entrou com conta de administrador. Quem protege de verdade é o backend
// (as rotas /admin/** respondem 403 para as outras contas).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useConta } from "../conta/ContaContexto";
import { usePontos } from "../dados/PontosContexto";
import { CONFIG } from "../config";
import { haQuanto, horaCurta, lerData, tituloDoPonto } from "../dados/modelo";
import { textoDoAlerta } from "../dados/alertas";
import { rotuloDoTipo } from "../relatos/relatos";
import {
  CENARIOS_DE_CHUVA, SITUACOES_DO_SENSOR, analisarRelato, baixarFoto, bueiroMaisProximo, buscarFila, buscarSimulacao, desligarSimulacao,
  filtrarSensores, ligarSimulacao, mudarSituacaoDoSensor, resolverAlerta, textoDaDistancia,
} from "../admin/admin";
import { CabecalhoTela, Tela } from "../componentes/Tela";

export default function Admin() {
  const conta = useConta();
  if (!conta.admin) {
    return (
      <Tela titulo="Administração">
        <CabecalhoTela titulo="Administração" />
        <div className="ec">
          <p className="sub" style={{ marginTop: 12 }}>Esta área é só para a conta de administrador do SIMA.</p>
          <p className="ct-botoes">
            {conta.disponivel && !conta.logado ? <Link className="btn btn-bone" to={{ pathname: "/entrar", search: "?de=/admin" }}>Entrar</Link> : null}
            <Link className="btn btn-iron" to="/">Voltar ao mapa</Link>
          </p>
        </div>
      </Tela>
    );
  }
  return (
    <Tela titulo="Administração">
      <CabecalhoTela titulo="Administração" />
      <FilaDeRelatos />
      <AlertasAtivos />
      <Sensores />
      <ChuvaDeTeste />
      <p className="micro ct-nota">
        Cadastrar sensor e gerar a chave dele: pelo Swagger do backend (<span className="mono">/swagger-ui.html</span>).
      </p>
    </Tela>
  );
}

/* ───────────── Relatos em análise ───────────── */

function FilaDeRelatos() {
  const { pontos, agora, atualizar } = usePontos();
  const [estado, setEstado] = useState({ fase: "carregando", relatos: [], erro: null });

  const carregar = useCallback(() => {
    buscarFila()
      .then((relatos) => setEstado({ fase: "pronto", relatos, erro: null }))
      .catch((falha) => setEstado((e) => ({ ...e, fase: "erro", erro: falha.message })));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const aoAnalisar = (id) => {
    setEstado((e) => ({ ...e, relatos: e.relatos.filter((r) => r.id !== id) }));
    atualizar(); // o aprovado já aparece no mapa
  };

  return (
    <>
      <h2 className="grp-t">Relatos em análise{estado.fase === "pronto" ? ` · ${estado.relatos.length}` : ""}</h2>
      {estado.fase === "carregando" ? <p className="small ct-nota" role="status">Carregando…</p> : null}
      {estado.erro ? <p className="ct-erro ct-nota" role="alert">{estado.erro}</p> : null}
      {estado.fase === "pronto" && !estado.relatos.length ? <p className="small ct-nota">Nenhum relato esperando análise.</p> : null}
      {estado.relatos.map((relato) => <RelatoDaFila key={relato.id} relato={relato} pontos={pontos} agora={agora} aoAnalisar={aoAnalisar} />)}
      <p className="ct-nota"><button type="button" className="btn btn-line" onClick={carregar}>Atualizar a fila</button></p>
    </>
  );
}

function RelatoDaFila({ relato, pontos, agora, aoAnalisar }) {
  const [foto, setFoto] = useState(null);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  // A foto da fila exige o token: é baixada à parte e mostrada por um endereço temporário.
  useEffect(() => {
    if (!relato.foto) return undefined;
    let endereco = null;
    let cancelado = false;
    baixarFoto(relato.foto).then((url) => {
      if (cancelado) URL.revokeObjectURL(url);
      else { endereco = url; setFoto(url); }
    }).catch(() => {});
    return () => {
      cancelado = true;
      if (endereco) URL.revokeObjectURL(endereco);
    };
  }, [relato.foto]);

  const perto = bueiroMaisProximo(pontos, relato.lat, relato.lon);

  async function decidir(aprovar) {
    if (ocupado) return;
    if (!aprovar && !motivo.trim()) { setErro("Escreva o motivo da recusa: quem enviou vai ler."); return; }
    setOcupado(true);
    setErro(null);
    try {
      await analisarRelato(relato.id, { aprovar, motivo });
      aoAnalisar(relato.id);
    } catch (falha) {
      setErro(falha.message);
      setOcupado(false);
    }
  }

  return (
    <article className="grp ct-bloco ad-relato" aria-label={`Relato: ${rotuloDoTipo(relato.tipo)}`}>
      <div className="rl-item-topo"><b>{rotuloDoTipo(relato.tipo)}</b><span className="micro">{haQuanto(relato.criadoEm, agora)}</span></div>
      <p className="small" style={{ color: "var(--bone-100)", overflowWrap: "anywhere" }}>{relato.descricao}</p>
      {foto ? <img className="rl-previa" src={foto} alt="Foto enviada com o relato" /> : relato.foto ? <p className="micro">Carregando a foto…</p> : <p className="micro">Sem foto.</p>}
      <p className="micro">
        {perto ? <>Perto do {tituloDoPonto(perto.ponto)} ({textoDaDistancia(perto.metros)}){perto.ponto.endereco ? ` · ${perto.ponto.endereco}` : ""}. </> : null}
        {relato.lat !== null ? <span className="mono">{relato.lat.toFixed(5)}; {relato.lon.toFixed(5)}</span> : null}
        {relato.emailAutor ? <> · de {relato.emailAutor}</> : null}
      </p>
      {recusando ? (
        <label className="field">
          <span className="label">Motivo da recusa (quem enviou vai ler)</span>
          <input className="input" type="text" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: a foto não mostra o problema" />
        </label>
      ) : null}
      {erro ? <p className="ct-erro" role="alert">{erro}</p> : null}
      <div className="ct-botoes" style={{ marginTop: 0 }}>
        {recusando ? (
          <>
            <button type="button" className="btn btn-iron" disabled={ocupado} onClick={() => { setRecusando(false); setErro(null); }}>Cancelar</button>
            <button type="button" className="btn ct-perigo" disabled={ocupado} onClick={() => decidir(false)}>Recusar</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-iron" disabled={ocupado} onClick={() => setRecusando(true)}>Recusar…</button>
            <button type="button" className="btn btn-bone" disabled={ocupado} onClick={() => decidir(true)}>{ocupado ? "Salvando…" : "Aprovar"}</button>
          </>
        )}
      </div>
    </article>
  );
}

/* ───────────── Alertas ativos ───────────── */

function AlertasAtivos() {
  const { alertas, atualizar, fonte } = usePontos();
  const [ocupado, setOcupado] = useState(null);
  const [erro, setErro] = useState(null);

  async function resolver(id) {
    setOcupado(id);
    setErro(null);
    try {
      await resolverAlerta(id);
      await atualizar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <h2 className="grp-t">Alertas ativos · {alertas.length}</h2>
      {alertas.length ? (
        <div className="grp">
          {alertas.map((alerta) => (
            <div key={alerta.id} className="ad-linha">
              <span className="row-k">{alerta.codigo ? tituloDoPonto(alerta) : `Sensor ${alerta.sensorId}`}<span className="row-sub">{textoDoAlerta(alerta)}</span></span>
              <button type="button" className="btn btn-iron ad-acao" disabled={ocupado === alerta.id || fonte !== "api"} onClick={() => resolver(alerta.id)}>
                {ocupado === alerta.id ? "Encerrando…" : "Encerrar"}
              </button>
            </div>
          ))}
        </div>
      ) : <p className="small ct-nota">Nenhum alerta ativo.</p>}
      {erro ? <p className="ct-erro ct-nota" role="alert">{erro}</p> : null}
      <p className="micro ct-nota">O alerta se encerra sozinho quando a água baixa. Encerrar à mão serve para um sensor que travou; se ele continuar medindo crítico, o alerta volta.</p>
    </>
  );
}

/* ───────────── Sensores ───────────── */

function Sensores() {
  const { pontos, atualizar } = usePontos();
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const [erro, setErro] = useState(null);
  const mostrados = useMemo(() => filtrarSensores(pontos, texto, { bancada: CONFIG.sensorDeBancada }), [pontos, texto]);

  async function mudar(id, status) {
    setOcupado(id);
    setErro(null);
    try {
      await mudarSituacaoDoSensor(id, status);
      await atualizar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <h2 className="grp-t">Sensores · {pontos.length}</h2>
      <div className="ct-nota" style={{ paddingTop: 0 }}>
        <input className="input" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Procurar por código, rua ou bairro" aria-label="Procurar sensor" />
      </div>
      {mostrados.length ? (
        <div className="grp" style={{ marginTop: 10 }}>
          {mostrados.map((p) => (
            <div key={p.id} className="ad-linha ad-sensor">
              <span className="row-k">{tituloDoPonto(p)}<span className="row-sub">{p.endereco ? `${p.endereco} · ${p.bairro}` : p.bairro}</span></span>
              <div className="seg" role="group" aria-label={`Situação do ${tituloDoPonto(p)}`}>
                {SITUACOES_DO_SENSOR.map((s) => (
                  <button key={s.id} type="button" className={p.statusSensor === s.id ? "seg-on" : ""} aria-pressed={p.statusSensor === s.id}
                    disabled={ocupado === p.id} onClick={() => { if (p.statusSensor !== s.id) mudar(p.id, s.id); }}>{s.rotulo}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : <p className="small ct-nota">{texto ? "Nenhum sensor com esse texto." : "Todos os sensores estão ativos. Procure um pelo código para mudar."}</p>}
      {erro ? <p className="ct-erro ct-nota" role="alert">{erro}</p> : null}
      <p className="micro ct-nota">Sem texto, aparecem o sensor de bancada e os que não estão ativos. Em manutenção ou inativo, o servidor recusa as leituras do sensor.</p>
    </>
  );
}

/* ───────────── Chuva de teste ───────────── */

function ChuvaDeTeste() {
  const { atualizar } = usePontos();
  const [situacao, setSituacao] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    buscarSimulacao().then(setSituacao).catch((falha) => setErro(falha.message));
  }, []);

  async function fazer(acao) {
    setOcupado(true);
    setErro(null);
    try {
      setSituacao(await acao());
      await atualizar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  const expira = lerData(situacao?.expiraEm);
  return (
    <>
      <h2 className="grp-t" id="rotulo-chuva-teste">Chuva de teste</h2>
      <div className="grp ct-bloco">
        <p className="small">
          {situacao === null ? "Consultando o servidor…"
            : situacao.habilitado === false ? "Desligada neste servidor (IA_DEMONSTRACAO=false)."
            : situacao.ativo ? <><b>Ligada</b>: {situacao.descricao ?? situacao.cenario}{expira ? `. Desliga sozinha às ${horaCurta(expira)}` : ""}.</>
            : "Desligada: as previsões usam a chuva de verdade."}
        </p>
        <div className="rl-tipos" role="group" aria-labelledby="rotulo-chuva-teste">
          {CENARIOS_DE_CHUVA.map((c) => (
            <button key={c.id} type="button" className={`chip ${situacao?.ativo && situacao.cenario === c.id ? "chip-on" : ""}`}
              aria-pressed={Boolean(situacao?.ativo && situacao.cenario === c.id)} disabled={ocupado || situacao?.habilitado === false}
              onClick={() => fazer(() => ligarSimulacao(c.id))}>{c.rotulo}</button>
          ))}
          <button type="button" className="chip" disabled={ocupado || !situacao?.ativo} onClick={() => fazer(desligarSimulacao)}>Desligar</button>
        </div>
        {ocupado ? <p className="micro" role="status">Recalculando as previsões de todos os sensores. Pode levar um minuto.</p> : null}
        {erro ? <p className="ct-erro" role="alert">{erro}</p> : null}
      </div>
      <p className="micro ct-nota">Troca a chuva real por uma série inventada, por 30 minutos, para mostrar as previsões reagindo. O mapa avisa “Simulação · chuva de teste ligada”. Não mexe nas leituras do sensor nem cria alerta.</p>
    </>
  );
}
