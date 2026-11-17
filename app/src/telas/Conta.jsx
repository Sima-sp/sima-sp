// Telas da conta: Entrar (#/entrar), Criar conta (#/cadastro) e Perfil (#/perfil).
//
// O mapa continua aberto sem conta. A conta serve para receber o aviso de um bueiro por perto e
// para mandar relatos. Na demonstração (sem backend) as telas explicam isso e não chamam rede.
//
// O que cada dado guarda e para quê está na tela Privacidade (src/telas/Privacidade.jsx); o
// cadastro só segue com a caixa "Li para que meus dados são usados" marcada.

import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useConta } from "../conta/ContaContexto";
import { BAIRROS_DE_REFERENCIA, arredondar, rotuloDoTipo, telefoneFormatado, validarCadastro } from "../conta/conta";
import { CabecalhoTela, Tela } from "../componentes/Tela";
import { IconeSeta } from "../componentes/Icones";

const formatoCoordenada = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Um campo de formulário: rótulo em cima, o controle e, se houver, o erro logo abaixo. */
export function Campo({ rotulo, erro, ajuda, children }) {
  const id = useId();
  return (
    <div className="field ct-campo">
      <label className="label" htmlFor={id}>{rotulo}</label>
      {children({ id, "aria-invalid": erro ? true : undefined, "aria-describedby": erro || ajuda ? `${id}-nota` : undefined })}
      {erro ? <p className="ct-erro" id={`${id}-nota`} role="alert">{erro}</p>
        : ajuda ? <p className="micro" id={`${id}-nota`}>{ajuda}</p> : null}
    </div>
  );
}

/** Aviso das telas da conta quando não há servidor (app de demonstração). */
export function SemServidor({ oQue = "A conta" }) {
  return (
    <div className="plate ec-card">
      <h2 className="label ct-placa-t">Versão de demonstração</h2>
      <p className="small" style={{ marginTop: 6 }}>{oQue} funciona com o servidor do SIMA. Esta é a versão de demonstração: o mapa, a busca e as rotas funcionam normalmente.</p>
      <p style={{ marginTop: 16 }}><Link className="btn btn-iron" to="/">Voltar ao mapa</Link></p>
    </div>
  );
}

/** Pede a posição do aparelho uma vez. Rejeita com um texto que pode ir para a tela. */
export function pedirPosicao() {
  return new Promise((resolver, rejeitar) => {
    if (!navigator.geolocation) {
      rejeitar(new Error("Este aparelho não informa a localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicao) => resolver({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude }),
      (falha) => rejeitar(new Error(falha.code === 1
        ? "Localização não permitida. Libere o acesso nas configurações do navegador, ou escolha um bairro."
        : "Não foi possível obter sua localização agora.")),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

/* ───────────── Entrar ───────────── */

export function Entrar() {
  const conta = useConta();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  // Para onde voltar depois de entrar (ex.: a tela Reportar, que mandou a pessoa para cá).
  const destino = parametros.get("de")?.startsWith("/") ? parametros.get("de") : "/perfil";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await conta.entrar(email, senha);
      navegar(destino, { replace: true });
    } catch (falha) {
      setErro(falha.message);
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Entrar">
      <CabecalhoTela titulo="Entrar" />
      <div className="ec">
        {conta.disponivel ? (
          <form className="ct-form" onSubmit={enviar} noValidate>
            {conta.recado ? <p className="small ct-recado" role="status">{conta.recado}</p> : null}
            <Campo rotulo="E-mail">
              {(p) => <input {...p} className="input" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" required
                value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Campo>
            <Campo rotulo="Senha">
              {(p) => <input {...p} className="input" type="password" autoComplete="current-password" required
                value={senha} onChange={(e) => setSenha(e.target.value)} />}
            </Campo>
            {erro ? <p className="ct-erro" role="alert">{erro}</p> : null}
            <button type="submit" className="btn btn-bone ct-enviar" disabled={enviando || !email || !senha}>{enviando ? "Entrando…" : "Entrar"}</button>
            <p className="small ct-troca">Ainda não tem conta? <Link to={{ pathname: "/cadastro", search: parametros.toString() ? `?${parametros}` : "" }} replace>Criar conta</Link></p>
            <p className="micro">O mapa, a busca e as rotas funcionam sem conta.</p>
          </form>
        ) : <SemServidor />}
      </div>
    </Tela>
  );
}

/* ───────────── Criar conta ───────────── */

export function Cadastro() {
  const conta = useConta();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const destino = parametros.get("de")?.startsWith("/") ? parametros.get("de") : "/perfil";
  const [campos, setCampos] = useState({ email: "", telefone: "", senha: "", permissaoAlerta: true, aceiteTermos: false });
  // A localização de referência é escolhida pela pessoa: onde ela está agora ou um bairro da lista.
  const [local, setLocal] = useState(null); // { latitude, longitude, nome }
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (campo) => (evento) => {
    const valor = evento.target.type === "checkbox" ? evento.target.checked : evento.target.value;
    setCampos((c) => ({ ...c, [campo]: valor }));
    setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e)); // o erro some quando a pessoa mexe no campo
  };

  async function usarOndeEstou() {
    setBuscandoLocal(true);
    setErros((e) => ({ ...e, localizacao: undefined }));
    try {
      const posicao = await pedirPosicao();
      setLocal({ latitude: arredondar(posicao.latitude), longitude: arredondar(posicao.longitude), nome: "Onde estou agora" });
    } catch (falha) {
      setErros((e) => ({ ...e, localizacao: falha.message }));
    } finally {
      setBuscandoLocal(false);
    }
  }
  function escolherBairro(nome) {
    const bairro = BAIRROS_DE_REFERENCIA.find((b) => b.nome === nome);
    setLocal(bairro ? { latitude: bairro.latitude, longitude: bairro.longitude, nome: bairro.nome } : null);
    setErros((e) => ({ ...e, localizacao: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;
    const dados = { ...campos, latitude: local?.latitude, longitude: local?.longitude };
    const achados = validarCadastro(dados);
    setErros(achados);
    setErro(null);
    if (Object.keys(achados).length) return;
    setEnviando(true);
    try {
      await conta.cadastrar(dados);
      navegar(destino, { replace: true });
    } catch (falha) {
      // Campo recusado pelo servidor volta para o lugar dele no formulário.
      if (falha.campos) setErros({ ...falha.campos, localizacao: falha.campos.latitude ?? falha.campos.longitude });
      setErro(falha.message);
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Criar conta">
      <CabecalhoTela titulo="Criar conta" />
      <div className="ec">
        {conta.disponivel ? (
          <form className="ct-form" onSubmit={enviar} noValidate>
            <p className="sub">Com a conta você recebe o aviso quando um bueiro perto de você entra em alerta e pode relatar problemas.</p>
            <Campo rotulo="E-mail" erro={erros.email}>
              {(p) => <input {...p} className="input" type="email" autoComplete="email" inputMode="email" autoCapitalize="none"
                value={campos.email} onChange={mudar("email")} />}
            </Campo>
            <Campo rotulo="Telefone com DDD" erro={erros.telefone}>
              {(p) => <input {...p} className="input" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="(11) 91234-5678"
                value={campos.telefone} onChange={mudar("telefone")} />}
            </Campo>
            <Campo rotulo="Senha" erro={erros.senha} ajuda="Pelo menos 8 caracteres.">
              {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={campos.senha} onChange={mudar("senha")} />}
            </Campo>

            <fieldset className="ct-grupo">
              <legend className="label">Localização de referência</legend>
              <p className="micro">É por ela que o SIMA sabe quais alertas são perto de você. Fica guardada arredondada (cerca de 100 m), não é o seu endereço.</p>
              <div className="ct-local">
                <button type="button" className="btn btn-iron" onClick={usarOndeEstou} disabled={buscandoLocal}>
                  {buscandoLocal ? "Procurando…" : "Usar onde estou agora"}
                </button>
                <select className="input ct-select" aria-label="Ou escolha um bairro" value={local && local.nome !== "Onde estou agora" ? local.nome : ""}
                  onChange={(e) => escolherBairro(e.target.value)}>
                  <option value="">Ou escolha um bairro</option>
                  {BAIRROS_DE_REFERENCIA.map((b) => <option key={b.nome} value={b.nome}>{b.nome}</option>)}
                </select>
              </div>
              {local ? <p className="small" role="status">Escolhido: <b>{local.nome}</b> <span className="mono">({formatoCoordenada.format(local.latitude)}; {formatoCoordenada.format(local.longitude)})</span></p> : null}
              {erros.localizacao ? <p className="ct-erro" role="alert">{erros.localizacao}</p> : null}
            </fieldset>

            <label className="ct-check">
              <input type="checkbox" checked={campos.permissaoAlerta} onChange={mudar("permissaoAlerta")} />
              <span>Quero receber o aviso quando um bueiro perto de mim entrar em alerta</span>
            </label>
            <label className="ct-check">
              <input type="checkbox" checked={campos.aceiteTermos} onChange={mudar("aceiteTermos")} aria-invalid={erros.aceiteTermos ? true : undefined} />
              <span>Li <Link to="/privacidade">para que meus dados são usados</Link></span>
            </label>
            {erros.aceiteTermos ? <p className="ct-erro" role="alert">{erros.aceiteTermos}</p> : null}

            {erro ? <p className="ct-erro" role="alert">{erro}</p> : null}
            <button type="submit" className="btn btn-bone ct-enviar" disabled={enviando}>{enviando ? "Criando…" : "Criar conta"}</button>
            <p className="small ct-troca">Já tem conta? <Link to={{ pathname: "/entrar", search: parametros.toString() ? `?${parametros}` : "" }} replace>Entrar</Link></p>
          </form>
        ) : <SemServidor />}
      </div>
    </Tela>
  );
}

/* ───────────── Perfil ───────────── */

export function Perfil() {
  const conta = useConta();
  const navegar = useNavigate();
  const { usuario } = conta;
  const [ocupado, setOcupado] = useState(null); // "alerta" | "local" | "apagar"
  const [erro, setErro] = useState(null);
  const [recado, setRecado] = useState(null);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);

  /** Roda uma ação da conta mostrando o que está em andamento e o erro, se houver. */
  async function fazer(qual, acao, feito) {
    if (ocupado) return;
    setOcupado(qual);
    setErro(null);
    setRecado(null);
    try {
      await acao();
      if (feito) setRecado(feito);
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(null);
    }
  }
  const mudarAlerta = (ligado) => fazer("alerta", () => conta.atualizarPerfil({ permissaoAlerta: ligado }));
  const atualizarLocal = () => fazer("local", async () => {
    const posicao = await pedirPosicao();
    await conta.atualizarPerfil({ latitude: posicao.latitude, longitude: posicao.longitude });
  }, "Localização de referência atualizada.");
  const escolherBairro = (nome) => {
    const bairro = BAIRROS_DE_REFERENCIA.find((b) => b.nome === nome);
    if (bairro) fazer("local", () => conta.atualizarPerfil({ latitude: bairro.latitude, longitude: bairro.longitude }), `Localização de referência: ${bairro.nome}.`);
  };
  const sair = () => { conta.sair(); navegar("/", { replace: true }); };
  const apagar = () => fazer("apagar", async () => { await conta.apagarConta(); navegar("/", { replace: true }); });

  if (!conta.disponivel || !usuario) {
    return (
      <Tela titulo="Perfil e conta">
        <CabecalhoTela titulo="Perfil e conta" />
        <div className="ec">
          {conta.recado ? <p className="small ct-recado" role="status">{conta.recado}</p> : null}
          <p className="sub" style={{ marginTop: 12 }}>
            Com uma conta você recebe o aviso quando um bueiro perto de você entra em alerta e pode relatar problemas, com foto. O mapa continua aberto sem conta.
          </p>
          {conta.disponivel ? (
            <p className="ct-botoes">
              <Link className="btn btn-bone" to="/entrar">Entrar</Link>
              <Link className="btn btn-iron" to="/cadastro">Criar conta</Link>
            </p>
          ) : <SemServidor />}
          <p className="small" style={{ marginTop: 20 }}><Link to="/privacidade">Para que os seus dados são usados</Link></p>
        </div>
      </Tela>
    );
  }

  return (
    <Tela titulo="Perfil e conta">
      <CabecalhoTela titulo="Perfil e conta" />
      <div className="grp" style={{ marginTop: 18 }}>
        <div className="bu-fact"><span>E-mail</span><b className="ct-valor">{usuario.email}</b></div>
        <div className="bu-fact"><span>Telefone</span><b className="mono">{telefoneFormatado(usuario.telefone)}</b></div>
        <div className="bu-fact"><span>Tipo de conta</span><b>{rotuloDoTipo(usuario.tipoUsuario)}</b></div>
      </div>

      <h2 className="grp-t" id="rotulo-avisos-conta">Avisos de alerta perto de mim</h2>
      <div className="grp" style={{ padding: 10 }}>
        <div className="seg mu-seg" role="group" aria-labelledby="rotulo-avisos-conta">
          <button type="button" className={usuario.permissaoAlerta ? "" : "seg-on"} aria-pressed={!usuario.permissaoAlerta} disabled={ocupado === "alerta"} onClick={() => mudarAlerta(false)}>Desligados</button>
          <button type="button" className={usuario.permissaoAlerta ? "seg-on" : ""} aria-pressed={usuario.permissaoAlerta} disabled={ocupado === "alerta"} onClick={() => mudarAlerta(true)}>Ligados</button>
        </div>
      </div>
      <p className="micro ct-nota">Ligados, o SIMA pode avisar quando um bueiro perto da sua localização de referência entrar em alerta.</p>

      <h2 className="grp-t">Localização de referência</h2>
      <div className="grp ct-bloco">
        <p className="small">
          <span className="mono">{formatoCoordenada.format(Number(usuario.latitude))}; {formatoCoordenada.format(Number(usuario.longitude))}</span>
          {" "}· arredondada (cerca de 100 m).
        </p>
        <div className="ct-local">
          <button type="button" className="btn btn-iron" onClick={atualizarLocal} disabled={ocupado === "local"}>{ocupado === "local" ? "Atualizando…" : "Usar onde estou agora"}</button>
          <select className="input ct-select" aria-label="Ou escolha um bairro" value="" onChange={(e) => escolherBairro(e.target.value)} disabled={ocupado === "local"}>
            <option value="">Ou escolha um bairro</option>
            {BAIRROS_DE_REFERENCIA.map((b) => <option key={b.nome} value={b.nome}>{b.nome}</option>)}
          </select>
        </div>
      </div>

      <div aria-live="polite">
        {recado ? <p className="small ct-nota" role="status">{recado}</p> : null}
        {erro ? <p className="ct-erro ct-nota" role="alert">{erro}</p> : null}
      </div>

      <h2 className="grp-t">Conta</h2>
      <div className="grp">
        <button type="button" className="row" onClick={() => navegar("/privacidade")}>
          <span className="row-k">Para que os seus dados são usados</span>
          <span className="row-chev"><IconeSeta pequeno /></span>
        </button>
        <button type="button" className="row row-blue" onClick={sair}>Sair</button>
      </div>

      <div className="grp" style={{ marginTop: 14 }}>
        {confirmandoApagar ? (
          <div className="ct-bloco">
            <p className="small"><b>Apagar a conta de vez?</b> Seus dados e as inscrições de aviso são apagados do servidor. Os relatos que você mandou continuam, sem o seu nome. Não dá para desfazer.</p>
            <div className="ct-botoes">
              <button type="button" className="btn btn-iron" onClick={() => setConfirmandoApagar(false)} disabled={ocupado === "apagar"}>Cancelar</button>
              <button type="button" className="btn ct-perigo" onClick={apagar} disabled={ocupado === "apagar"}>{ocupado === "apagar" ? "Apagando…" : "Apagar minha conta"}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="row row-red" onClick={() => setConfirmandoApagar(true)}>Apagar minha conta</button>
        )}
      </div>
      <p className="micro ct-nota">Bairros salvos ainda não existem: entram depois da banca.</p>
    </Tela>
  );
}
