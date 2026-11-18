// Tela "Avisos por região": o que os bueiros de cada região (subprefeitura) dizem em conjunto.
// A regra e o motivo estão em src/dados/regioes.js. Aqui é só a apresentação:
//   - as regiões em risco alto e em atenção, cada uma com a frase do aviso;
//   - as regiões sem aviso e as que não têm bueiros suficientes para um aviso de região;
//   - por que o aviso por região existe, em palavras simples.
// Aberta pelo aviso que aparece sobre o mapa, pelo Menu e pela tela da IA. Tocar numa região
// abre a lista dos bueiros dela (tela Bairros).
//
// Acima das regiões ficam os ALERTAS DO SENSOR (src/dados/alertas.js): bueiros que o sensor mediu
// em nível crítico. É medição, não previsão, e a tela diz isso.
//
// A notificação no celular é ligada no Perfil (precisa de conta e do servidor).

import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { usePontos } from "../dados/PontosContexto";
import { REGRA_REGIAO, ROTULO_AVISO, apoioDaRegiao, avisosPorRegiao } from "../dados/regioes";
import { horaCurta, tituloDoPonto } from "../dados/modelo";
import { textoDoAlerta } from "../dados/alertas";
import { useConta } from "../conta/ContaContexto";
import { Tampa } from "../componentes/Tampa";
import { CabecalhoTela, Tela } from "../componentes/Tela";
import { IconeSeta } from "../componentes/Icones";

export default function Avisos() {
  const { pontos, alertas, regioesDoServidor, agora, carregando, fonte, demo } = usePontos();
  const conta = useConta();
  const navegar = useNavigate();
  const regioes = useMemo(() => avisosPorRegiao(pontos, agora, regioesDoServidor), [pontos, agora, regioesDoServidor]);
  const doServidor = regioes.some((r) => r.origem === "servidor");

  const emAlto = regioes.filter((r) => r.nivel === 3);
  const emAtencao = regioes.filter((r) => r.nivel === 2);
  const semAviso = regioes.filter((r) => r.cobertura && !r.nivel);
  const semCobertura = regioes.filter((r) => !r.cobertura);
  const abrir = (nome) => navegar({ pathname: "/bairros", search: `?b=${encodeURIComponent(nome)}` });

  const linha = (regiao) => (
    <button key={regiao.nome} type="button" className="row row-2" onClick={() => abrir(regiao.nome)}>
      <span className={`av-marca av-marca-${regiao.nivel}`} aria-hidden="true" />
      <span className="row-k">
        {regiao.nome}
        <span className="row-sub">{apoioDaRegiao(regiao)}</span>
      </span>
      <span className="row-chev"><IconeSeta pequeno /></span>
    </button>
  );
  const grupo = (nivel, lista) => (lista.length ? (
    <>
      <h2 className="grp-t av-titulo"><span className={`av-marca av-marca-${nivel}`} aria-hidden="true" />{ROTULO_AVISO[nivel]} · {lista.length === 1 ? "1 região" : `${lista.length} regiões`}</h2>
      <div className="grp">{lista.map(linha)}</div>
    </>
  ) : null);

  let situacao = "Nenhuma região em aviso agora.";
  if (carregando && pontos.length === 0) situacao = "Carregando os bueiros…";
  else if (pontos.length === 0) situacao = "Ainda não há bueiros monitorados para avisar.";
  else if (emAlto.length || emAtencao.length) {
    const partes = [];
    if (emAlto.length) partes.push(`${emAlto.length === 1 ? "1 região" : `${emAlto.length} regiões`} em risco alto`);
    if (emAtencao.length) partes.push(`${emAtencao.length} em atenção`);
    situacao = `${partes.join(" e ")} para as próximas 3 horas.`;
  }

  return (
    <Tela titulo="Avisos">
      <CabecalhoTela titulo="Avisos" />
      <p className="sub av-intro" role="status">{situacao}</p>
      <p className="micro av-fonte">
        {fonte === "demo"
          ? `Demonstração${demo ? ` · ${demo.climas.find((c) => c.id === demo.clima)?.rotulo.toLowerCase()}` : ""}. Mude o clima no mapa para ver os avisos mudarem.`
          : doServidor
            ? `Atualizado às ${horaCurta(agora)}, pelo serviço de previsão do SIMA.`
            : `Calculado às ${horaCurta(agora)} com as previsões de cada bueiro.`}
      </p>

      {alertas.length ? (
        <>
          <h2 className="grp-t av-titulo"><span className="av-marca av-marca-4" aria-hidden="true" />Alertas do sensor · {alertas.length === 1 ? "1 bueiro" : `${alertas.length} bueiros`}</h2>
          <div className="grp">
            {alertas.map((alerta) => (
              <button key={alerta.id} type="button" className="row row-2" onClick={() => navegar({ pathname: "/", search: `?ponto=${encodeURIComponent(alerta.sensorId)}` })}>
                <Tampa nivel={4} tamanho={30} />
                <span className="row-k">
                  {alerta.codigo ? tituloDoPonto(alerta) : "Bueiro"}
                  <span className="row-sub">{alerta.endereco ? `${alerta.endereco} · ${alerta.bairro}` : alerta.bairro ?? ""}</span>
                  <span className="row-sub">{textoDoAlerta(alerta)}</span>
                </span>
                <span className="row-chev"><IconeSeta pequeno /></span>
              </button>
            ))}
          </div>
          <p className="micro av-alerta-nota">
            Alerta é <b>medição</b>: o sensor leu o bueiro cheio. Não é previsão. Ele sai da lista quando a água baixa.
          </p>
        </>
      ) : null}

      {grupo(3, emAlto)}
      {grupo(2, emAtencao)}

      {semAviso.length ? (
        <>
          <h2 className="grp-t">Sem aviso agora</h2>
          <div className="av-chips">
            {semAviso.map((r) => <button key={r.nome} type="button" className="chip" onClick={() => abrir(r.nome)}>{r.nome}</button>)}
          </div>
        </>
      ) : null}

      <h2 className="grp-t">Por que avisar por região</h2>
      <div className="plate av-porque">
        <p className="small">
          Um bueiro sozinho engana: nos testes, de cada 100 avisos de nível alto num ponto, menos de 2 foram seguidos de alagamento registrado.
          Juntando os bueiros da mesma região, foram 8 em cada 100.
        </p>
        <p className="small" style={{ marginTop: 10 }}>
          Por isso o SIMA dá os dois: o nível de cada bueiro, para saber <b>onde</b>, e o aviso da região, para saber <b>quando se preparar</b>.
        </p>
        <p className="micro" style={{ marginTop: 10 }}>
          A região é a subprefeitura. Só recebe aviso a que tem pelo menos {REGRA_REGIAO.coberturaMinima} bueiros monitorados.
          {semCobertura.length ? ` Ainda sem bueiros suficientes: ${semCobertura.map((r) => r.nome).join(", ")}.` : ""}
        </p>
      </div>

      <div className="grp" style={{ marginTop: 14 }}>
        <button type="button" className="row row-2" onClick={() => navegar("/ia")}>
          <span className="row-k">Como a IA funciona<span className="row-sub">Mude a chuva e o sensor e veja a resposta dela.</span></span>
          <span className="row-chev"><IconeSeta pequeno /></span>
        </button>
      </div>
      <p className="micro av-rodape">
        {conta.disponivel
          ? <>Para receber no celular o alerta de um bueiro perto de você, ligue os avisos no <Link to="/perfil">Perfil</Link>.</>
          : "A notificação no celular depende do servidor do SIMA; esta é a versão de demonstração."}{" "}
        Em emergência, ligue <a href="tel:199">199</a> (Defesa Civil) ou <a href="tel:193">193</a> (Bombeiros).
      </p>
    </Tela>
  );
}
