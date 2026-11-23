// Filtro de eco falso (#56).
//
// O ultrassom erra de vez em quando: no meio de leituras de 40 cm aparece uma de 5 cm (o eco
// voltou de outra coisa) e depois tudo volta a 40. Água de verdade não sobe 35 cm em 2 s. Uma
// leitura que salta mais que `saltoMaxCm` em relação à anterior fica em suspeita e não é usada:
// nem no painel, nem na classificação, nem no repasse ao backend.
//
// Se a leitura seguinte confirmar o salto (fica perto da suspeita), a mudança era de verdade
// (alguém mexeu no balde ou no sensor) e passa a valer. Depois de um tempo sem leitura aceita
// (`janelaMs`), a próxima vale de novo sem comparação: o sensor pode ter ficado desligado.

const PADRAO = {
  saltoMaxCm: 15,
  janelaMs: 10_000,
};

class FiltroDeSalto {
  constructor(opcoes = {}) {
    this.o = { ...PADRAO, ...opcoes };
    this.sensores = new Map(); // codigo -> { distancia, em, suspeita: { distancia, em } | null }
    this.descartadas = 0;
  }

  /**
   * @param {string} codigo     o `device` da leitura
   * @param {number} distancia  cm
   * @param {number} em         ms
   * @returns {{ aceita: boolean, saltoCm?: number }}
   */
  avaliar(codigo, distancia, em) {
    const s = this.sensores.get(codigo);
    if (!s || em - s.em > this.o.janelaMs) {
      this.sensores.set(codigo, { distancia, em, suspeita: null });
      return { aceita: true };
    }
    const salto = Math.abs(distancia - s.distancia);
    if (salto <= this.o.saltoMaxCm) {
      return this.aceitar(s, distancia, em);
    }
    const confirma =
      s.suspeita &&
      Math.abs(distancia - s.suspeita.distancia) <= this.o.saltoMaxCm &&
      em - s.suspeita.em <= this.o.janelaMs;
    if (confirma) return this.aceitar(s, distancia, em);

    s.suspeita = { distancia, em };
    this.descartadas += 1;
    return { aceita: false, saltoCm: Math.round(salto * 10) / 10 };
  }

  aceitar(s, distancia, em) {
    s.distancia = distancia;
    s.em = em;
    s.suspeita = null;
    return { aceita: true };
  }
}

module.exports = { FiltroDeSalto, PADRAO };
