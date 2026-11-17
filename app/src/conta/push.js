// Notificação no celular (Web Push): quando um bueiro perto da pessoa entra em alerta, o backend
// manda um aviso para o aparelho, mesmo com o app fechado.
//
// Como liga (sempre depois de um toque da pessoa, nunca ao abrir o app):
//   1. o navegador pede a permissão de notificação;
//   2. o app pega a chave pública do backend (GET /push/chave-publica) e inscreve o aparelho no
//      serviço de push do próprio navegador;
//   3. manda a inscrição para o backend (POST /usuarios/me/push) e guarda o id devolvido, para
//      poder remover depois (DELETE /usuarios/me/push/{id}).
// Quem mostra a notificação é o service worker (public/sw.js), que só existe no app publicado.
//
// Limites que a tela precisa dizer (ver `situacaoDoPush`):
//   - iPhone e iPad: só com o app instalado na tela de início (iOS 16.4 ou mais novo);
//   - sem https o navegador não deixa inscrever;
//   - permissão negada só volta nas configurações do navegador.
//
// As funções recebem o `ambiente` (o navegador) por parâmetro para os testes usarem um de mentira.

import { pedir } from "../dados/api.js";

const CHAVE = "sima.push"; // { id, endpoint, email } da inscrição deste aparelho

/** O navegador de verdade, no formato que as funções abaixo esperam. */
export function ambienteDoNavegador() {
  const temJanela = typeof window !== "undefined";
  return {
    Notification: temJanela ? window.Notification : undefined,
    serviceWorker: temJanela ? navigator.serviceWorker : undefined,
    temPushManager: temJanela && "PushManager" in window,
    agente: temJanela ? navigator.userAgent : "",
    // iPad novo se apresenta como Mac; o toque denuncia.
    toques: temJanela ? navigator.maxTouchPoints ?? 0 : 0,
    instalado: temJanela && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true),
    armazenamento: typeof localStorage === "undefined" ? null : localStorage,
  };
}

const ehIos = (ambiente) => /iPad|iPhone|iPod/.test(ambiente.agente) || (/Macintosh/.test(ambiente.agente) && ambiente.toques > 1);

/** Converte a chave pública (base64url) no formato que `pushManager.subscribe` pede. */
export function chaveParaBytes(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const texto = atob(base64);
  return Uint8Array.from(texto, (letra) => letra.charCodeAt(0));
}

function lerGuardada(ambiente) {
  try {
    return JSON.parse(ambiente.armazenamento?.getItem(CHAVE) || "null");
  } catch {
    return null;
  }
}
function guardar(ambiente, valor) {
  try {
    if (valor) ambiente.armazenamento?.setItem(CHAVE, JSON.stringify(valor));
    else ambiente.armazenamento?.removeItem(CHAVE);
  } catch {
    // Sem armazenamento: a inscrição funciona, só não dá para remover pelo id depois.
  }
}

/**
 * Em que pé está a notificação neste aparelho.
 *   "ligada"       inscrito e registrado no backend para esta conta
 *   "desligada"    dá para ligar
 *   "bloqueada"    a pessoa negou a permissão no navegador
 *   "instalar"     iPhone/iPad fora da tela de início
 *   "sem-suporte"  o navegador não tem notificação por push
 *   "sem-app"      o service worker não está ativo (app em desenvolvimento ou sem https)
 */
export function situacaoDoPush(ambiente, email) {
  if (ehIos(ambiente) && !ambiente.instalado) return "instalar";
  if (!ambiente.Notification || !ambiente.temPushManager) return "sem-suporte";
  if (!ambiente.serviceWorker) return "sem-app";
  if (ambiente.Notification.permission === "denied") return "bloqueada";
  const guardada = lerGuardada(ambiente);
  return ambiente.Notification.permission === "granted" && guardada?.email === email ? "ligada" : "desligada";
}

/** O que dizer na tela em cada situação (null = nada a explicar). */
export const TEXTO_DO_PUSH = {
  ligada: "Este aparelho recebe a notificação, mesmo com o app fechado.",
  desligada: null,
  bloqueada: "As notificações do SIMA estão bloqueadas neste navegador. Para reativar, toque no cadeado ao lado do endereço (ou abra as configurações do site) e permita as notificações.",
  instalar: "No iPhone e no iPad a notificação só funciona com o app instalado: no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra o SIMA pelo ícone e ligue os avisos de novo. Precisa do iOS 16.4 ou mais novo.",
  "sem-suporte": "Este navegador não recebe notificações. Os alertas continuam aparecendo no app.",
  "sem-app": "A notificação funciona no app publicado (com https). Os alertas continuam aparecendo no app.",
};

/** O service worker ativo, ou null se não houver em alguns segundos (app em desenvolvimento). */
async function registroAtivo(ambiente, esperaMs = 4000) {
  if (!ambiente.serviceWorker) return null;
  const existente = await ambiente.serviceWorker.getRegistration?.();
  if (!existente) return null;
  return Promise.race([ambiente.serviceWorker.ready, new Promise((resolver) => setTimeout(() => resolver(null), esperaMs))]);
}

/**
 * Liga a notificação neste aparelho para a conta `email`. Chamar SÓ a partir de um toque.
 * Devolve a situação final. Sem permissão, nada é enviado ao backend.
 */
export async function ligarPush(email, ambiente = ambienteDoNavegador(), pedido = pedir) {
  const antes = situacaoDoPush(ambiente, email);
  if (antes !== "desligada") return antes;

  const permissao = await ambiente.Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueada" : "desligada";

  const registro = await registroAtivo(ambiente);
  if (!registro?.pushManager) return "sem-app";

  let inscricao = await registro.pushManager.getSubscription();
  if (!inscricao) {
    const { chavePublica } = await pedido("/push/chave-publica", { mensagens: { 503: "O servidor está sem as notificações ligadas." } });
    inscricao = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica) });
  }

  // O mesmo aparelho, já registrado para esta conta: não manda de novo (não duplica).
  const guardada = lerGuardada(ambiente);
  if (guardada?.endpoint === inscricao.endpoint && guardada.email === email) return "ligada";

  const { id } = await pedido("/usuarios/me/push", { metodo: "POST", corpo: inscricao.toJSON(), comConta: true });
  guardar(ambiente, { id, endpoint: inscricao.endpoint, email });
  return "ligada";
}

/**
 * Desliga neste aparelho: remove a inscrição do backend e do navegador. Não falha se o servidor
 * não responder (ao sair da conta, por exemplo): o aparelho deixa de estar inscrito de qualquer jeito.
 */
export async function desligarPush(ambiente = ambienteDoNavegador(), pedido = pedir) {
  const guardada = lerGuardada(ambiente);
  guardar(ambiente, null);
  if (guardada?.id !== undefined && guardada?.id !== null) {
    try {
      await pedido(`/usuarios/me/push/${encodeURIComponent(guardada.id)}`, { metodo: "DELETE", comConta: true, resposta: "nada" });
    } catch {
      // Sem conexão ou sessão vencida: a inscrição do navegador é cancelada logo abaixo, e o
      // backend desativa sozinho uma inscrição que o serviço de push diz não existir mais.
    }
  }
  try {
    const registro = await registroAtivo(ambiente, 1500);
    const inscricao = await registro?.pushManager?.getSubscription();
    await inscricao?.unsubscribe();
  } catch {
    // Nada a cancelar.
  }
}
