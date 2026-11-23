// Faixas de nível do servidor do sensor, pela distância do sensor até a água (cm).
// Quanto MENOR a distância, MAIS ALTA está a água.
//
// Estes limites ainda são os da feira. A regra única, em % do balde (a mesma do backend e do
// app), entra com as medidas da #55.

const LIMITES = {
  zonaCega: 15,
  critico: 20,
  alerta: 30,
  atencao: 45,
};

function classificar(d) {
  if (d <= LIMITES.critico) {
    return {
      status: "critico",
      nivel: 3,
      titulo: "Crítico",
      mensagem:
        d < LIMITES.zonaCega
          ? "Água na zona cega do sensor. Risco imediato de transbordamento."
          : "Nível de água muito alto. Risco iminente de alagamento.",
    };
  }
  if (d <= LIMITES.alerta) {
    return { status: "alerta", nivel: 2, titulo: "Alerta", mensagem: "Nível de água elevado. Acompanhe de perto." };
  }
  if (d <= LIMITES.atencao) {
    return { status: "atencao", nivel: 1, titulo: "Atenção", mensagem: "Nível de água subindo." };
  }
  return { status: "normal", nivel: 0, titulo: "Normal", mensagem: "Nível de água dentro do esperado." };
}

// Folga nos limites (#56): perto de um limite, a medida oscila um ou dois centímetros para lá e
// para cá e o nível ficaria trocando. Com a folga, o nível só muda quando a água passa do limite
// por pelo menos FOLGA_CM.
const FOLGA_CM = 2;

const NIVEL_DO_STATUS = { normal: 0, atencao: 1, alerta: 2, critico: 3 };

/**
 * Como `classificar`, mas lembrando do nível anterior: subir de nível exige que a água passe do
 * limite com folga (a distância mais `folga` ainda cai no nível novo), e descer, o mesmo para o
 * outro lado. Sem nível anterior, é a classificação de sempre.
 * @param {number} d             distância (cm)
 * @param {string|null} anterior o `status` anterior ("normal", "atencao", "alerta", "critico")
 */
function classificarComFolga(d, anterior, folga = FOLGA_CM) {
  const direto = classificar(d);
  const nivelAnterior = NIVEL_DO_STATUS[anterior];
  if (nivelAnterior === undefined || direto.nivel === nivelAnterior) return direto;

  // Subindo, a dúvida é a água estar só um pouco acima do limite: olha a distância um pouco maior.
  const seguro = classificar(direto.nivel > nivelAnterior ? d + folga : d - folga);
  const mudou = direto.nivel > nivelAnterior ? seguro.nivel > nivelAnterior : seguro.nivel < nivelAnterior;
  if (!mudou) return classificar(limiteDoNivel(nivelAnterior, d));
  return seguro.nivel === direto.nivel ? direto : seguro;
}

// Uma distância qualquer dentro do nível pedido, para devolver o objeto completo dele. Para o
// crítico, a própria medida (a mensagem muda na zona cega).
function limiteDoNivel(nivel, d) {
  if (nivel === 3) return Math.min(d, LIMITES.critico);
  if (nivel === 2) return LIMITES.alerta;
  if (nivel === 1) return LIMITES.atencao;
  return LIMITES.atencao + 1;
}

module.exports = { LIMITES, FOLGA_CM, classificar, classificarComFolga };
