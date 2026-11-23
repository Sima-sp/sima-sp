// A conta para o app inteiro: quem está logado e as ações (entrar, cadastrar, sair, apagar).
//
// O mapa, a busca e as rotas funcionam SEM conta. A conta serve para o que é da pessoa: receber
// o aviso de um bueiro perto dela e mandar relatos.
//
// A sessão mora em src/conta/sessao.js (fora do React). Este provedor só a espelha no estado e
// guarda o recado de quando ela termina sozinha ("Sua sessão expirou. Entre de novo.").

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CONFIG } from "../config";
import { apagarConta, atualizarPerfil, cadastrar, contaDisponivel, entrar, sair } from "./conta";
import { aoMudarSessao, iniciarSessao, sessaoAtual } from "./sessao";

const Contexto = createContext(null);

const RECADOS = {
  expirada: "Sua sessão expirou. Entre de novo.",
  excluida: "Sua conta foi apagada.",
};

export function ProvedorConta({ children }) {
  const [sessao, setSessao] = useState(() => (contaDisponivel() ? iniciarSessao(CONFIG.urlApi) : null));
  const [recado, setRecado] = useState(null);

  useEffect(() => aoMudarSessao((nova, motivo) => {
    setSessao(nova);
    setRecado(nova ? null : RECADOS[motivo] ?? null);
  }), []);

  // O token vence com o app aberto: de minuto em minuto a sessão é conferida no relógio.
  useEffect(() => {
    if (!sessao) return undefined;
    const relogio = setInterval(() => sessaoAtual(), 60 * 1000);
    return () => clearInterval(relogio);
  }, [sessao]);

  const dispensarRecado = useCallback(() => setRecado(null), []);

  const valor = useMemo(() => ({
    /** false na demonstração: não há servidor para a conta. */
    disponivel: contaDisponivel(),
    usuario: sessao?.usuario ?? null,
    logado: Boolean(sessao),
    admin: sessao?.usuario?.tipoUsuario === "ADMIN",
    recado,
    dispensarRecado,
    entrar,
    cadastrar,
    sair,
    atualizarPerfil,
    apagarConta,
  }), [sessao, recado, dispensarRecado]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * A conta.
 * @returns {{ disponivel, usuario, logado, admin, recado, dispensarRecado, entrar, cadastrar, sair, atualizarPerfil, apagarConta }}
 */
export function useConta() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useConta precisa estar dentro de <ProvedorConta>.");
  return valor;
}
