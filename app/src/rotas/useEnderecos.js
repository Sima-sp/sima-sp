// Busca de endereço enquanto a pessoa digita, usada pela busca do mapa e pela tela de rotas.
// Espera a pessoa parar de digitar, cancela o pedido anterior e só procura a partir de 3 letras.
// Se o serviço falhar, buscarEnderecos já tenta uma segunda vez; depois disso a fase vira "erro"
// e a tela pode oferecer o botão "Tentar de novo" (tentarDeNovo).

import { useCallback, useEffect, useState } from "react";
import { buscarEnderecos } from "./servico";

const PARADA = { fase: "parada", lugares: [] };

/**
 * @param {string} texto  o que foi digitado
 * @returns {{ fase: "parada"|"procurando"|"pronta"|"erro", lugares: Array<{ id, nome, detalhe, lon, lat }>,
 *   tentarDeNovo: () => void }}
 */
export function useEnderecos(texto) {
  const termo = texto.trim();
  const [busca, setBusca] = useState(PARADA);
  // Cada toque em "Tentar de novo" muda este número e faz a busca do mesmo texto correr outra vez.
  const [vez, setVez] = useState(0);
  const tentarDeNovo = useCallback(() => setVez((n) => n + 1), []);

  useEffect(() => {
    if (termo.length < 3) {
      setBusca(PARADA);
      return undefined;
    }
    const controle = new AbortController();
    // Enquanto procura, os resultados anteriores continuam na tela (a lista não pisca).
    setBusca((anterior) => ({ ...anterior, fase: "procurando" }));
    const relogio = setTimeout(async () => {
      try {
        const lugares = await buscarEnderecos(termo, { sinal: controle.signal });
        if (!controle.signal.aborted) setBusca({ fase: "pronta", lugares });
      } catch {
        if (!controle.signal.aborted) setBusca({ fase: "erro", lugares: [] });
      }
    }, 380);
    return () => {
      clearTimeout(relogio);
      controle.abort();
    };
  }, [termo, vez]);

  return { ...busca, tentarDeNovo };
}
