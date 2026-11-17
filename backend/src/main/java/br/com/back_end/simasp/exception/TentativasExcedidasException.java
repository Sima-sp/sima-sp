package br.com.back_end.simasp.exception;

/** Login bloqueado por excesso de tentativas erradas (#19). Vira 429 com Retry-After. */
public class TentativasExcedidasException extends RuntimeException {

    private final long segundosParaTentar;

    public TentativasExcedidasException(String mensagem, long segundosParaTentar)
    {
        super(mensagem);
        this.segundosParaTentar = segundosParaTentar;
    }

    public long getSegundosParaTentar()
    {
        return segundosParaTentar;
    }
}
