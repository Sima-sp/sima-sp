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

module.exports = { LIMITES, classificar };
