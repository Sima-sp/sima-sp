package br.com.back_end.simasp.exception;

/** Arquivo enviado como foto que não é JPEG nem PNG de verdade (#15). Vira 400. */
public class FotoInvalidaException extends RuntimeException {

    public FotoInvalidaException(String mensagem)
    {
        super(mensagem);
    }
}
