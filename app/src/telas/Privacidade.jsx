// Tela "Privacidade": para que serve cada dado, em palavras simples. É a página que o cadastro
// manda ler antes de aceitar (#45). Só afirma o que o sistema faz de fato; ao mudar o que é
// guardado (backend) ou para onde algum dado vai, mude aqui também.

import { Link } from "react-router";
import { useConta } from "../conta/ContaContexto";
import { CabecalhoTela, Tela } from "../componentes/Tela";

export default function Privacidade() {
  const { logado, disponivel } = useConta();
  return (
    <Tela titulo="Privacidade">
      <CabecalhoTela titulo="Privacidade" />
      <div className="ec">
        <p className="sub" style={{ marginTop: 12 }}>O que o SIMA sabe sobre você, para que serve e como apagar.</p>

        <div className="plate ec-card">
          <h2 className="label ct-placa-t">Sem conta</h2>
          <ul className="ec-lista">
            <li>O mapa, a busca, os avisos por região e as rotas funcionam sem conta e sem pedir seus dados.</li>
            <li><b>A posição do aparelho fica no aparelho.</b> Ela serve para centralizar o mapa e como partida de uma rota.</li>
            <li>Ao traçar uma rota, só a partida e o destino vão ao serviço de rotas. O que você digita na busca de endereço vai ao serviço de endereços. Os dois são serviços abertos, de terceiros (veja “Sobre o SIMA”).</li>
            <li>O tema, as animações e a última situação do mapa ficam guardados só no aparelho.</li>
          </ul>
        </div>

        <div className="plate ec-card">
          <h2 className="label ct-placa-t">Com conta</h2>
          <ul className="ec-lista">
            <li><b>E-mail e senha</b>: para entrar. A senha é guardada embaralhada; ninguém consegue lê-la, nem a equipe.</li>
            <li><b>Telefone</b>: identifica a conta e evita contas repetidas. O SIMA não liga nem manda mensagem para ele.</li>
            <li><b>Localização de referência</b>: é por ela que o SIMA sabe quais alertas são perto de você. Você escolhe (onde está ou um bairro) e ela é guardada arredondada, com cerca de 100 m de precisão. Não é o seu endereço e não acompanha por onde você anda.</li>
            <li><b>Aviso no celular</b>: só se você ligar. O aparelho recebe um endereço de entrega do próprio navegador, que fica guardado até você desligar.</li>
          </ul>
        </div>

        <div className="plate ec-card">
          <h2 className="label ct-placa-t">Relatos</h2>
          <ul className="ec-lista">
            <li>Um relato leva o tipo do problema, a descrição, o lugar e, se você quiser, uma foto.</li>
            <li><b>Os dados escondidos da foto são apagados no servidor</b> (a posição e o aparelho que tirou). Evite fotografar rostos e placas.</li>
            <li>O relato só aparece no mapa depois de analisado, e <b>sem nada de quem enviou</b>.</li>
          </ul>
        </div>

        <div className="plate ec-card">
          <h2 className="label ct-placa-t">Apagar a conta</h2>
          <p className="small" style={{ marginTop: 6 }}>
            No Perfil, em “Apagar minha conta”. Seus dados e as inscrições de aviso são apagados do servidor na hora. Os relatos já enviados continuam, sem ligação com você.
          </p>
          {disponivel ? (
            <p style={{ marginTop: 14 }}><Link className="btn btn-iron" to={logado ? "/perfil" : "/entrar"}>{logado ? "Abrir o Perfil" : "Entrar"}</Link></p>
          ) : null}
        </div>

        <p className="micro" style={{ marginTop: 16 }}>
          O SIMA é um projeto de conclusão de curso, sem fins comerciais. Não vende nem repassa dados.
        </p>
      </div>
    </Tela>
  );
}
