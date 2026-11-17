// Telas dos relatos: Reportar (#/reportar) e Meus relatos (#/relatos).
//
// Relatar exige conta (o servidor precisa saber de quem veio para limitar abuso e para a pessoa
// acompanhar a análise), mas o relato aprovado aparece no mapa SEM nada de quem enviou.
// Na demonstração (sem backend) a tela explica que depende do servidor; nada é enviado de mentira.
//
// Um relato não é pedido de socorro: o aviso do 199 e do 193 fica sempre à vista.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useConta } from "../conta/ContaContexto";
import { usePontos } from "../dados/PontosContexto";
import { haQuanto, tituloDoPonto } from "../dados/modelo";
import { LIMITES, SITUACOES, TIPOS_DE_RELATO, buscarMeusRelatos, enviarRelato, reduzirFoto, rotuloDoTipo, validarRelato } from "../relatos/relatos";
import { SeletorDePosicao } from "../relatos/SeletorDePosicao";
import { CabecalhoTela, Tela } from "../componentes/Tela";
import { Campo, SemServidor, pedirPosicao } from "./Conta";

function Emergencia() {
  return (
    <p className="small rl-emergencia">
      <b>A rua está alagando agora?</b> Ligue <a href="tel:199">199</a> (Defesa Civil) ou <a href="tel:193">193</a> (Bombeiros). O relato não chama socorro.
    </p>
  );
}

export function Reportar() {
  const conta = useConta();
  const { porId, atualizar } = usePontos();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  // Vindo de "Reportar problema aqui", na tela de um bueiro: a posição já começa nele.
  const bueiro = parametros.get("ponto") ? porId(parametros.get("ponto")) : null;

  const [tipo, setTipo] = useState(bueiro ? "BUEIRO_ENTUPIDO" : "");
  const [descricao, setDescricao] = useState("");
  const [posicao, setPosicao] = useState(bueiro ? { latitude: bueiro.lat, longitude: bueiro.lon } : null);
  const [origemDaPosicao, setOrigemDaPosicao] = useState(bueiro ? "bueiro" : null); // "bueiro" | "aparelho" | "mapa"
  const [buscandoPosicao, setBuscandoPosicao] = useState(false);
  const [foto, setFoto] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const campoFoto = useRef(null);

  // A prévia é um endereço temporário do navegador: é liberado quando a foto muda ou a tela fecha.
  useEffect(() => {
    if (!foto) { setPrevia(null); return undefined; }
    const endereco = URL.createObjectURL(foto);
    setPrevia(endereco);
    return () => URL.revokeObjectURL(endereco);
  }, [foto]);

  const limpar = (campo) => setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));

  async function usarOndeEstou() {
    setBuscandoPosicao(true);
    limpar("posicao");
    try {
      setPosicao(await pedirPosicao());
      setOrigemDaPosicao("aparelho");
    } catch (falha) {
      setErros((e) => ({ ...e, posicao: `${falha.message.replace(", ou escolha um bairro", "")} Arraste o mapa abaixo até o lugar.` }));
    } finally {
      setBuscandoPosicao(false);
    }
  }

  async function escolherFoto(evento) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = ""; // escolher a mesma foto de novo volta a disparar a troca
    if (!arquivo) return;
    limpar("foto");
    if (!["image/jpeg", "image/png"].includes(arquivo.type)) {
      setErros((e) => ({ ...e, foto: "A foto precisa ser JPEG ou PNG." }));
      return;
    }
    setPreparandoFoto(true);
    setFoto(await reduzirFoto(arquivo));
    setPreparandoFoto(false);
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando || preparandoFoto) return;
    const relato = { tipo, descricao, latitude: posicao?.latitude, longitude: posicao?.longitude, foto };
    const achados = validarRelato(relato);
    setErros(achados);
    setErro(null);
    if (Object.keys(achados).length) return;
    setEnviando(true);
    try {
      await enviarRelato(relato);
      setEnviado(true);
      atualizar();
    } catch (falha) {
      // O que a pessoa escreveu e a foto continuam na tela: é só tentar de novo.
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  let conteudo;
  if (!conta.disponivel) {
    conteudo = <SemServidor oQue="Relatar um problema" />;
  } else if (!conta.logado) {
    conteudo = (
      <>
        <p className="sub" style={{ marginTop: 12 }}>Avise de bueiro entupido, lixo na rua ou rua alagando, com foto e o lugar. O relato aparece no mapa depois de analisado, sem o seu nome.</p>
        <div className="plate ec-card">
          <h2 className="label ct-placa-t">Relatar precisa de conta</h2>
          <p className="small" style={{ marginTop: 6 }}>É pela conta que você acompanha a análise do que enviou. Leva um minuto.</p>
          <p className="ct-botoes">
            <Link className="btn btn-bone" to={{ pathname: "/entrar", search: "?de=/reportar" }}>Entrar</Link>
            <Link className="btn btn-iron" to={{ pathname: "/cadastro", search: "?de=/reportar" }}>Criar conta</Link>
          </p>
        </div>
      </>
    );
  } else if (enviado) {
    conteudo = (
      <div className="plate ec-card" role="status">
        <h2 className="label ct-placa-t">Recebido</h2>
        <p className="small" style={{ marginTop: 6 }}>Seu relato está em análise. Vai aparecer no mapa depois de aprovado, sem o seu nome.</p>
        <p className="ct-botoes">
          <Link className="btn btn-bone" to="/relatos" replace>Ver meus relatos</Link>
          <button type="button" className="btn btn-iron" onClick={() => navegar("/", { replace: true })}>Voltar ao mapa</button>
        </p>
      </div>
    );
  } else {
    conteudo = (
      <form className="ct-form" onSubmit={enviar} noValidate>
        <fieldset className="ct-grupo">
          <legend className="label">O que está acontecendo?</legend>
          <div className="rl-tipos" role="radiogroup" aria-label="Tipo do problema">
            {TIPOS_DE_RELATO.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} className={`chip ${tipo === t.id ? "chip-on" : ""}`}
                onClick={() => { setTipo(t.id); limpar("tipo"); }}>{t.rotulo}</button>
            ))}
          </div>
          {erros.tipo ? <p className="ct-erro" role="alert">{erros.tipo}</p> : null}
        </fieldset>

        <Campo rotulo="Descrição" erro={erros.descricao} ajuda={`${descricao.length} de ${LIMITES.descricao} caracteres`}>
          {(p) => <textarea {...p} className="input rl-texto" rows={3} maxLength={LIMITES.descricao} placeholder="Ex.: bueiro tampado por folhas na esquina"
            value={descricao} onChange={(e) => { setDescricao(e.target.value); limpar("descricao"); }} />}
        </Campo>

        <fieldset className="ct-grupo">
          <legend className="label">Onde é?</legend>
          <button type="button" className="btn btn-iron" onClick={usarOndeEstou} disabled={buscandoPosicao}>{buscandoPosicao ? "Procurando…" : "Onde estou agora"}</button>
          <SeletorDePosicao posicao={posicao} aoMudar={(nova) => { setPosicao(nova); setOrigemDaPosicao("mapa"); limpar("posicao"); }} />
          <p className="micro" role="status">
            {posicao
              ? { bueiro: `Marcado no ${bueiro ? tituloDoPonto(bueiro) : "bueiro"}. `, aparelho: "Marcado na sua posição. ", mapa: "Marcado no centro do mapa. " }[origemDaPosicao]
              : "Ainda sem lugar marcado. "}
            Arraste o mapa para ajustar: o lugar é o que fica debaixo da mira.
          </p>
          {erros.posicao ? <p className="ct-erro" role="alert">{erros.posicao}</p> : null}
        </fieldset>

        <fieldset className="ct-grupo">
          <legend className="label">Foto (opcional)</legend>
          {/* Sem "capture": o celular oferece a câmera e a galeria. */}
          <input ref={campoFoto} className="so-leitor" type="file" accept="image/jpeg,image/png" onChange={escolherFoto} tabIndex={-1} aria-hidden="true" />
          {previa ? <img className="rl-previa" src={previa} alt="Prévia da foto escolhida" /> : null}
          <div className="ct-local">
            <button type="button" className="btn btn-iron" onClick={() => campoFoto.current?.click()} disabled={preparandoFoto}>
              {preparandoFoto ? "Preparando a foto…" : foto ? "Trocar a foto" : "Tirar ou escolher foto"}
            </button>
            {foto ? <button type="button" className="btn btn-line" onClick={() => setFoto(null)}>Tirar a foto</button> : null}
          </div>
          <p className="micro">Mostre o problema, evitando rostos e placas. Os dados escondidos da foto (lugar e aparelho) são apagados.</p>
          {erros.foto ? <p className="ct-erro" role="alert">{erros.foto}</p> : null}
        </fieldset>

        {erro ? <p className="ct-erro" role="alert">{erro} O que você escreveu continua aqui.</p> : null}
        <button type="submit" className="btn btn-bone ct-enviar" disabled={enviando || preparandoFoto}>{enviando ? "Enviando…" : "Enviar relato"}</button>
        <p className="micro">O relato passa por análise antes de aparecer no mapa. <Link to="/relatos">Ver meus relatos</Link></p>
      </form>
    );
  }

  return (
    <Tela titulo="Reportar problema">
      <CabecalhoTela titulo="Reportar problema" />
      <div className="ec">
        <Emergencia />
        {conteudo}
      </div>
    </Tela>
  );
}

export function MeusRelatos() {
  const conta = useConta();
  const { agora } = usePontos();
  const [estado, setEstado] = useState({ fase: "carregando", relatos: [], erro: null });

  const carregar = () => {
    setEstado((e) => ({ ...e, fase: "carregando", erro: null }));
    buscarMeusRelatos()
      .then((relatos) => setEstado({ fase: "pronto", relatos, erro: null }))
      .catch((falha) => setEstado({ fase: "erro", relatos: [], erro: falha.message }));
  };
  useEffect(() => {
    if (conta.logado) carregar();
  }, [conta.logado]);

  let conteudo;
  if (!conta.disponivel) conteudo = <div className="ec"><SemServidor oQue="Relatar um problema" /></div>;
  else if (!conta.logado) {
    conteudo = (
      <div className="ec">
        <p className="sub" style={{ marginTop: 12 }}>Entre na conta para ver os relatos que você enviou.</p>
        <p className="ct-botoes"><Link className="btn btn-bone" to={{ pathname: "/entrar", search: "?de=/relatos" }}>Entrar</Link></p>
      </div>
    );
  } else if (estado.fase === "carregando") conteudo = <p className="sub ct-nota" role="status">Carregando…</p>;
  else if (estado.fase === "erro") {
    conteudo = (
      <div className="ec">
        <p className="ct-erro" role="alert">{estado.erro}</p>
        <p className="ct-botoes"><button type="button" className="btn btn-iron" onClick={carregar}>Tentar de novo</button></p>
      </div>
    );
  } else if (!estado.relatos.length) {
    conteudo = (
      <div className="ec">
        <p className="sub" style={{ marginTop: 12 }}>Você ainda não enviou nenhum relato.</p>
        <p className="ct-botoes"><Link className="btn btn-bone" to="/reportar">Reportar um problema</Link></p>
      </div>
    );
  } else {
    conteudo = (
      <>
        <ul className="grp rl-lista" style={{ marginTop: 18 }}>
          {estado.relatos.map((r) => (
            <li key={r.id} className="rl-item">
              <div className="rl-item-topo">
                <b>{rotuloDoTipo(r.tipo)}</b>
                <span className={`rl-situacao rl-situacao-${r.situacao.toLowerCase()}`}>{SITUACOES[r.situacao].rotulo}</span>
              </div>
              <p className="small">{r.descricao}</p>
              <p className="micro">
                Enviado {haQuanto(r.criadoEm, agora)}{r.temFoto ? " · com foto" : ""}.{" "}
                {r.situacao === "RECUSADA" && r.motivoRecusa ? <>Motivo: {r.motivoRecusa}</> : SITUACOES[r.situacao].detalhe}
              </p>
            </li>
          ))}
        </ul>
        <p className="ct-nota"><Link className="btn btn-iron" to="/reportar">Reportar outro problema</Link></p>
      </>
    );
  }

  return (
    <Tela titulo="Meus relatos">
      <CabecalhoTela titulo="Meus relatos" />
      {conteudo}
    </Tela>
  );
}
