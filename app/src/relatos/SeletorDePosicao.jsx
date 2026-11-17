// Mapa pequeno para dizer ONDE é o problema: a pessoa arrasta o mapa até o lugar ficar debaixo
// da mira, que fica parada no centro. Serve para ajustar a posição do aparelho e para quem não
// liberou a localização.
//
// É um segundo mapa do MapLibre, só enquanto a tela Reportar está aberta, com o mesmo estilo do
// mapa principal e sem os bueiros.

import { useEffect, useRef, useState } from "react";
import { AttributionControl, Map as MapaLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CONFIG } from "../config";
import { lerCoresDoTema, montarEstilo } from "../mapa/estiloMapa";

/**
 * @param {{ latitude: number, longitude: number }|null} posicao  onde o mapa começa (ou muda de fora)
 * @param {(posicao: { latitude: number, longitude: number }) => void} aoMudar  chamada quando a pessoa solta o mapa
 */
export function SeletorDePosicao({ posicao, aoMudar }) {
  const caixa = useRef(null);
  const mapa = useRef(null);
  const aviso = useRef(aoMudar);
  aviso.current = aoMudar;
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let instancia;
    try {
      instancia = new MapaLibre({
        container: caixa.current,
        style: montarEstilo(lerCoresDoTema()),
        center: posicao ? [posicao.longitude, posicao.latitude] : CONFIG.mapa.centro,
        zoom: posicao ? 16 : 11,
        minZoom: 9,
        maxZoom: 18.5,
        maxBounds: CONFIG.mapa.limites,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch {
      setFalhou(true);
      return undefined;
    }
    instancia.touchZoomRotate.disableRotation();
    instancia.addControl(new AttributionControl({ compact: true }), "bottom-left");
    // Só conta quando foi a pessoa que mexeu (o evento traz o gesto); mudança por comando não avisa.
    instancia.on("moveend", (evento) => {
      if (!evento.originalEvent) return;
      const centro = instancia.getCenter();
      aviso.current({ latitude: centro.lat, longitude: centro.lng });
    });
    mapa.current = instancia;
    return () => {
      instancia.remove();
      mapa.current = null;
    };
    // O mapa é criado uma vez; a posição que muda depois é tratada no efeito de baixo.
  }, []);

  // A posição mudou por fora (botão "onde estou agora"): o mapa vai até lá.
  const lat = posicao?.latitude;
  const lon = posicao?.longitude;
  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia || lat === undefined || lon === undefined) return;
    const centro = instancia.getCenter();
    if (Math.abs(centro.lat - lat) < 1e-6 && Math.abs(centro.lng - lon) < 1e-6) return;
    instancia.jumpTo({ center: [lon, lat], zoom: Math.max(instancia.getZoom(), 16) });
  }, [lat, lon]);

  if (falhou) return <p className="small">Não foi possível abrir o mapa neste aparelho. Use “Onde estou agora”.</p>;
  return (
    <div className="rl-mapa">
      <div ref={caixa} className="rl-mapa-caixa" role="application" aria-label="Mapa para marcar o lugar: arraste até o lugar ficar debaixo da mira" />
      <span className="rl-mira" aria-hidden="true" />
    </div>
  );
}
