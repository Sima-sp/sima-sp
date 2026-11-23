// Relatos do cidadão: a pessoa avisa de um problema (bueiro entupido, rua alagando), com foto e
// posição. O relato nasce "em análise"; só o que o administrador aprova aparece no mapa, por 24 h,
// e sem nada de quem enviou.
//
// Rotas do backend (ver backend/README.md, "Relatos do cidadão"):
//   POST /ocorrencias              (logado, multipart) tipo, descricao, latitude, longitude, foto
//   GET  /usuarios/me/ocorrencias  (logado) os meus, com a situação
//   GET  /ocorrencias              (público) os aprovados e ainda válidos
//   GET  /ocorrencias/{id}/foto    (público) a foto de um aprovado
//
// A foto é reduzida no aparelho antes de ir (lado maior de até 1.600 px), para não pesar na rede
// do celular. Redesenhar a imagem também tira dela os dados escondidos (posição, aparelho); o
// servidor faz o mesmo de novo, por garantia.

import { CONFIG } from "../config.js";
import { pedir } from "../dados/api.js";
import { lerData } from "../dados/modelo.js";

/** O que dá para relatar. Os ids são os do backend (TipoOcorrenciaEnum). */
export const TIPOS_DE_RELATO = [
  { id: "BUEIRO_ENTUPIDO", rotulo: "Bueiro entupido" },
  { id: "ALAGAMENTO", rotulo: "Rua alagando" },
  { id: "LIXO_NA_VIA", rotulo: "Lixo na rua" },
  { id: "OUTRO", rotulo: "Outro problema" },
];

export const rotuloDoTipo = (tipo) => TIPOS_DE_RELATO.find((t) => t.id === tipo)?.rotulo ?? "Relato";

/** Como cada situação é dita para quem enviou. */
export const SITUACOES = {
  PENDENTE: { rotulo: "Em análise", detalhe: "Vai aparecer no mapa se for aprovado." },
  APROVADA: { rotulo: "Aprovado", detalhe: "Está no mapa por 24 horas a partir da aprovação." },
  RECUSADA: { rotulo: "Recusado", detalhe: null },
};

export const LIMITES = { descricao: 500, fotoBytes: 5 * 1024 * 1024, ladoDaFoto: 1600 };

const numero = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Confere o relato antes de enviar. Devolve { campo: mensagem }; vazio = pode enviar. A foto é opcional. */
export function validarRelato({ tipo, descricao, latitude, longitude, foto }) {
  const erros = {};
  if (!TIPOS_DE_RELATO.some((t) => t.id === tipo)) erros.tipo = "Escolha o tipo do problema.";
  const texto = String(descricao ?? "").trim();
  if (!texto) erros.descricao = "Descreva em poucas palavras o que está acontecendo.";
  else if (texto.length > LIMITES.descricao) erros.descricao = `A descrição pode ter até ${LIMITES.descricao} caracteres.`;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) erros.posicao = "Diga onde é: use a sua posição ou escolha no mapa.";
  if (foto) {
    if (!["image/jpeg", "image/png"].includes(foto.type)) erros.foto = "A foto precisa ser JPEG ou PNG.";
    else if (foto.size > LIMITES.fotoBytes) erros.foto = "A foto passa de 5 MB. Escolha outra ou tire de novo.";
  }
  return erros;
}

/** Tamanho final de uma foto para o lado maior caber em `maximo`, sem nunca aumentar. */
export function dimensoesReduzidas(largura, altura, maximo = LIMITES.ladoDaFoto) {
  const escala = Math.min(1, maximo / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

/**
 * Reduz a foto no aparelho e a devolve como JPEG. Só roda no navegador. Se o aparelho não
 * conseguir (formato que ele não abre, falta de memória), devolve a foto original: o servidor
 * confere e reduz de qualquer jeito.
 */
export async function reduzirFoto(arquivo) {
  try {
    const imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height);
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const pincel = tela.getContext("2d");
    pincel.fillStyle = "#ffffff"; // PNG com transparência vira fundo branco no JPEG
    pincel.fillRect(0, 0, largura, altura);
    pincel.drawImage(imagem, 0, 0, largura, altura);
    imagem.close?.();
    const reduzida = await new Promise((resolver) => tela.toBlob(resolver, "image/jpeg", 0.85));
    if (!reduzida) return arquivo;
    return new File([reduzida], "foto.jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

/** Monta o formulário (multipart) que o backend espera. A posição vai com 6 casas decimais. */
export function montarFormulario({ tipo, descricao, latitude, longitude, foto }) {
  const formulario = new FormData();
  formulario.append("tipo", tipo);
  formulario.append("descricao", String(descricao).trim());
  formulario.append("latitude", Number(latitude).toFixed(6));
  formulario.append("longitude", Number(longitude).toFixed(6));
  if (foto) formulario.append("foto", foto, foto.name || "foto.jpg");
  return formulario;
}

/** Envia o relato. Devolve o relato criado, no formato de `normalizarMeuRelato`. */
export async function enviarRelato(relato) {
  const criado = await pedir("/ocorrencias", {
    metodo: "POST", formulario: montarFormulario(relato), comConta: true, tempoLimiteMs: 30000,
    mensagens: {
      413: "A foto passa de 5 MB. Escolha outra ou tire de novo.",
      429: "Você já mandou muitos relatos na última hora. Tente mais tarde.",
    },
  });
  return normalizarMeuRelato(criado);
}

/** Um item de GET /usuarios/me/ocorrencias. */
export function normalizarMeuRelato(item) {
  if (item?.id === null || item?.id === undefined) return null;
  return {
    id: String(item.id),
    tipo: item.tipo,
    descricao: item.descricao ?? "",
    lat: numero(item.latitude),
    lon: numero(item.longitude),
    situacao: SITUACOES[item.situacao] ? item.situacao : "PENDENTE",
    motivoRecusa: item.motivoRecusa ?? null,
    criadoEm: lerData(item.dataCriacao),
    analisadoEm: lerData(item.dataAnalise),
    temFoto: item.temFoto === true,
  };
}

/** Um item de GET /ocorrencias (aprovado). Sem posição não há o que pôr no mapa: devolve null. */
export function normalizarRelatoPublico(item) {
  const lat = numero(item?.latitude);
  const lon = numero(item?.longitude);
  if (item?.id === null || item?.id === undefined || lat === null || lon === null) return null;
  return {
    id: String(item.id),
    tipo: item.tipo,
    descricao: item.descricao ?? "",
    lat,
    lon,
    criadoEm: lerData(item.dataCriacao),
    validoAte: lerData(item.validaAte),
    // O backend devolve o caminho; o endereço completo depende de onde o backend está.
    foto: typeof item.fotoUrl === "string" && item.fotoUrl.startsWith("/") ? `${CONFIG.urlApi}${item.fotoUrl}` : null,
  };
}

const lista = (corpo) => (Array.isArray(corpo) ? corpo : Array.isArray(corpo?.content) ? corpo.content : []);

/** Relatos aprovados e ainda válidos, para o mapa. */
export async function buscarRelatos() {
  return lista(await pedir("/ocorrencias")).map(normalizarRelatoPublico).filter(Boolean);
}

/** Os relatos de quem está logado, do mais novo para o mais antigo. */
export async function buscarMeusRelatos() {
  return lista(await pedir("/usuarios/me/ocorrencias", { comConta: true })).map(normalizarMeuRelato).filter(Boolean);
}

/** Tira da lista os relatos que passaram da validade enquanto o app estava aberto. */
export function relatosValidos(relatos, agora = new Date()) {
  return relatos.filter((r) => !r.validoAte || r.validoAte.getTime() > agora.getTime());
}
