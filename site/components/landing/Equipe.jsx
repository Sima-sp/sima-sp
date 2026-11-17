// "Quem fez": a equipe, a orientação, a escola e o curso, e o material para quem avalia o trabalho
// (o código, o vídeo da demonstração, o texto do TCC e o QR code desta página).
// Os dados da equipe ficam em lib/equipe.js; os links que dependem de ambiente, em lib/config.js.
import { CONFIG } from "@/lib/config";
import { EQUIPE } from "@/lib/equipe";

/** "github.com/Sima-sp/sima-sp", sem o "https://". */
const semProtocolo = (url) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

function Material() {
  const itens = [
    CONFIG.repositorio && {
      href: CONFIG.repositorio,
      termo: "O código",
      texto: `${semProtocolo(CONFIG.repositorio)}: o app, a IA, o servidor, o sensor e esta página, num repositório só.`,
    },
    CONFIG.urlVideo && { href: CONFIG.urlVideo, termo: "Vídeo da demonstração", texto: "O sistema funcionando, do sensor ao aviso no celular." },
    CONFIG.urlTcc && { href: CONFIG.urlTcc, termo: "O texto do TCC", texto: "O trabalho escrito, com os métodos e os testes." },
  ].filter(Boolean);
  return (
    <dl className="ld-lista">
      {itens.map((i) => (
        <div key={i.termo}>
          <dt><a href={i.href}>{i.termo}</a></dt>
          <dd>{i.texto}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Equipe() {
  const { curso, ano, orientacao, integrantes } = EQUIPE;
  const qr = `${CONFIG.caminhoBase}/qr-sima.svg`;
  return (
    <section className="ld-faixa ld-ferro thm-dark" id="equipe">
      <div className="wrap">
        <h2 className="ld-h2">Quem fez</h2>
        <p className="sub ld-abre-secao">
          O SIMA é o Trabalho de Conclusão de Curso de um grupo {curso ? <>do curso {curso} </> : null}da{" "}
          {CONFIG.instituicao}, em {ano}.
          {orientacao.length ? <> {orientacao.map((o) => `${o.papel}: ${o.nome}`).join(". ")}.</> : null}
        </p>
        <div className="ld-verdade">
          {integrantes.length ? (
            <div>
              <h3>A equipe</h3>
              <dl className="ld-lista">
                {integrantes.map((p) => (
                  <div key={p.nome}><dt>{p.nome}</dt><dd>{p.fez}</dd></div>
                ))}
              </dl>
            </div>
          ) : null}
          <div>
            <h3>Para a banca</h3>
            <Material />
            <div className="ld-qr">
              <img src={qr} alt="QR code que abre esta página" width="132" height="132" />
              <p className="small">
                Esta página no celular: aponte a câmera. Para o material impresso,{" "}
                <a href={qr} download>baixe o QR code em SVG</a> ou{" "}
                <a href={`${CONFIG.caminhoBase}/qr-sima.png`} download>em PNG</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
