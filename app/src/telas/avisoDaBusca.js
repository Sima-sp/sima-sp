// Qual aviso a busca do mapa mostra embaixo do campo. Fica fora da tela para poder ser testado
// sem React (avisoDaBusca.test.js).
//
// O ponto principal: quando a busca de endereço NÃO RESPONDE, a tela não pode dizer "Nada
// encontrado". Quem lê isso conclui que o lugar não existe, quando na verdade o serviço caiu.

/**
 * @param {object} busca
 * @param {string} busca.termo    o texto digitado, já normalizado (sem espaços nas pontas)
 * @param {"parada"|"procurando"|"pronta"|"erro"} busca.fase  fase da busca de endereço
 * @param {number} busca.achados  quantos resultados há na tela: lugares (conhecidos e endereços),
 *   bueiros e bairros
 * @returns {"nada"|"erro"|"erro-com-resultados"|null}
 *   - "nada": a busca terminou e não achou nada (ou o texto é curto demais para buscar endereço);
 *   - "erro": o serviço não respondeu e não há nada achado no aparelho: aviso no lugar da lista;
 *   - "erro-com-resultados": o serviço não respondeu, mas há bueiros, bairros ou lugares
 *     conhecidos: eles aparecem e o aviso vai embaixo;
 *   - null: sem aviso (sem texto, com resultados, ou ainda procurando).
 */
export function avisoDaBusca({ termo, fase, achados }) {
  if (!termo) return null;
  if (fase === "erro") return achados > 0 ? "erro-com-resultados" : "erro";
  if (achados > 0) return null;
  if (fase === "pronta" || termo.length < 3) return "nada";
  return null;
}
