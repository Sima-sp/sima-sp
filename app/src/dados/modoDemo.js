// A demonstração a um toque, no app publicado com dados reais.
//
// O app publicado fala com o backend (VITE_API_URL). Mas quem apresenta o projeto precisa voltar
// para a demonstração (os 136 bueiros com o clima que troca) sem publicar de novo, e a página do
// projeto e o QR code do cartaz precisam abrir sempre nela. Por isso a escolha é feita ao abrir:
//
//   ?demo=1 ou ?vitrine=1 no endereço  → demonstração, nesta visita
//   ?demo=0                            → dados do servidor, nesta visita
//   Menu → "Dados"                     → troca e recarrega o app
//
// A escolha vale enquanto a aba (ou o app instalado) estiver aberta: fica em sessionStorage. Quem
// recebeu um link com ?demo=1 não fica preso na demonstração para sempre.

const CHAVE = "sima.demo";

/**
 * A demonstração foi pedida para esta visita?
 * @param {{ busca?: string, armazenamento?: Storage|null }} [ambiente]  o endereço (location.search) e o sessionStorage
 * @returns {boolean|null} true = demonstração, false = dados do servidor, null = ninguém pediu nada
 */
export function demoPedida({ busca, armazenamento } = ambienteDoNavegador()) {
  let doEndereco = null;
  try {
    const parametros = new URLSearchParams(busca ?? "");
    if (parametros.get("demo") === "1" || parametros.get("vitrine") === "1") doEndereco = true;
    else if (parametros.get("demo") === "0") doEndereco = false;
  } catch {
    // Endereço que não dá para ler: vale o que estiver guardado.
  }
  try {
    if (doEndereco !== null) {
      armazenamento?.setItem(CHAVE, doEndereco ? "1" : "0");
      return doEndereco;
    }
    const guardado = armazenamento?.getItem(CHAVE);
    if (guardado === "1") return true;
    if (guardado === "0") return false;
  } catch {
    // Sem sessionStorage (aba anônima em alguns navegadores): vale só o endereço.
  }
  return doEndereco;
}

function ambienteDoNavegador() {
  if (typeof window === "undefined") return { busca: "", armazenamento: null };
  let armazenamento = null;
  try {
    armazenamento = window.sessionStorage;
  } catch {
    // Bloqueado pelo navegador.
  }
  return { busca: window.location.search, armazenamento };
}

/**
 * Troca entre demonstração e dados do servidor e recarrega o app (a origem dos dados é decidida
 * ao abrir). O endereço perde o ?demo e o ?vitrine, para a escolha nova valer.
 */
export function escolherDemo(ligada) {
  try {
    window.sessionStorage.setItem(CHAVE, ligada ? "1" : "0");
  } catch {
    // Sem sessionStorage a escolha vai pelo endereço, logo abaixo.
  }
  const endereco = new URL(window.location.href);
  endereco.searchParams.delete("vitrine");
  endereco.searchParams.set("demo", ligada ? "1" : "0");
  endereco.hash = "#/";
  window.location.replace(endereco.href);
}
