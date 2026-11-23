// Tela "Sobre o SIMA": como ler o mapa, em texto.

import { Link } from "react-router";
import { CabecalhoTela, Tela } from "../componentes/Tela";

export function Sobre() {
  return (
    <Tela titulo="Sobre o SIMA">
      <CabecalhoTela titulo="Sobre o SIMA" />
      <div className="ec">
        <p className="sub" style={{ marginTop: 12 }}>
          O SIMA (Sistema Inteligente de Monitoramento de Alagamentos em São Paulo) acompanha bueiros com sensores e estima a
          chance de cada ponto alagar nas próximas 3 horas.
        </p>
        <div className="plate ec-card">
          <h2 className="label" style={{ color: "var(--bone-50)", fontSize: 15 }}>Como ler o mapa</h2>
          <ul className="ec-lista">
            <li><b>Medido</b> é o que o sensor leu no bueiro: o nível da água, com a hora da leitura.</li>
            <li><b>Previsto</b> é a estimativa da inteligência artificial a partir da chuva e dessas leituras. É uma chance, não uma certeza.</li>
            <li>A tampa enche conforme o risco: baixo, médio, alto e crítico.</li>
            <li>Quando um bueiro está em nível alto ou crítico, a <b>rua em volta dele</b> fica pintada da mesma cor, por cerca de 300 m para cada lado. É onde o risco está, não a mancha exata de um alagamento.</li>
            <li>O <b>aviso por região</b> junta os bueiros de uma subprefeitura e acerta mais do que um bueiro sozinho.</li>
            <li>“Sem previsão” não quer dizer “sem risco”: só que não há estimativa para aquele ponto.</li>
            <li>Os <b>alertas</b> vêm do sensor: aparecem quando ele mede o bueiro em nível crítico e somem quando a água baixa.</li>
            <li>Os losangos são <b>relatos</b> de quem passou pelo lugar, aprovados pela equipe. Ficam no mapa por 24 horas.</li>
            <li>As <b>rotas</b> são de carro e desviam dos bueiros em nível alto ou crítico. Quando não há desvio, o app avisa por onde o caminho passa.</li>
          </ul>
        </div>
        <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link className="btn btn-bone" to="/ia">Como a IA funciona</Link>
          <Link className="btn btn-iron" to="/alertas">Avisos por região</Link>
        </p>
        <p className="small" style={{ marginTop: 16 }}>
          Em emergência, ligue <a href="tel:199">199</a> (Defesa Civil) ou <a href="tel:193">193</a> (Bombeiros).
        </p>
        <p className="micro" style={{ marginTop: 16 }}>
          Projeto de conclusão de curso. Mapa e traçado das ruas: © OpenStreetMap, OpenMapTiles e OpenFreeMap. Rotas: Valhalla, no servidor da FOSSGIS.
          Busca de endereço: Photon, da komoot.
        </p>
      </div>
    </Tela>
  );
}
