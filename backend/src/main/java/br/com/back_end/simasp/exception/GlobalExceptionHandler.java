package br.com.back_end.simasp.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RecursoNaoEncontradoException.class)
    public ProblemDetail tratarRecursoNaoEncontrado(RecursoNaoEncontradoException exception)
    {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());

        problema.setTitle("Recurso procurado não encontrado.");
        problema.setProperty("codigo", "RECURSO_NAO_ENCONTRADO");

        return problema;
    }

    @ExceptionHandler(CredenciaisInvalidasException.class)
    public ProblemDetail tratarCredenciaisInvalidas(CredenciaisInvalidasException exception)
    {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, exception.getMessage());
        problema.setTitle("Falha na autenticação");
        problema.setProperty("codigo", "CREDENCIAIS_INVALIDAS");

        return problema;
    }

    @ExceptionHandler(LocalizacaoSensorDuplicadaException.class)
    public ProblemDetail tratarSensorComLocalizacaoDuplicada(LocalizacaoSensorDuplicadaException exception)
    {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());

        problema.setTitle("Sensor com latitude e longitude duplicado.");
        problema.setProperty("codigo", "SENSOR_COM_LOCALIZACAO_DUPLICADA");

        return problema;
    }


    @ExceptionHandler(AlteracaoInvalidaException.class)
    public ProblemDetail tratarRecursoRepetido(AlteracaoInvalidaException exception)
    {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problema.setTitle("Alteração inválida");
        problema.setProperty("codigo", "ALTERACAO_INVALIDA");

        return problema;
    }

    @ExceptionHandler(RecursoExistenteException.class)
    public ProblemDetail tratarRecursoExistente(RecursoExistenteException exception)
    {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());
        problema.setTitle("Recurso existente");
        problema.setProperty("codigo", "RECURSO_EXISTENTE");

        return problema;
    }


    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail tratarDadosInvalidos(
            MethodArgumentNotValidException exception
    ) {
        Map<String, String> erros =
                new LinkedHashMap<>();

        exception
                .getBindingResult()
                .getFieldErrors()
                .forEach(erro ->
                        erros.putIfAbsent(
                                erro.getField(),
                                erro.getDefaultMessage()
                        )
                );

        ProblemDetail problema =
                ProblemDetail.forStatusAndDetail(
                        HttpStatus.BAD_REQUEST,
                        "Um ou mais campos estão inválidos."
                );

        problema.setTitle("Dados inválidos");
        problema.setProperty("codigo", "DADOS_INVALIDOS");
        problema.setProperty("erros", erros);

        return problema;
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ProblemDetail tratarParametroAusente(
            MissingServletRequestParameterException exception
    ) {
        ProblemDetail problema =
                ProblemDetail.forStatusAndDetail(
                        HttpStatus.BAD_REQUEST,
                        "O parâmetro '"
                                + exception.getParameterName()
                                + "' é obrigatório."
                );

        problema.setTitle("Parâmetro obrigatório ausente");
        problema.setProperty(
                "codigo",
                "PARAMETRO_OBRIGATORIO_AUSENTE"
        );

        return problema;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail tratarCorpoInvalido(
            HttpMessageNotReadableException exception
    ) {
        ProblemDetail problema =
                ProblemDetail.forStatusAndDetail(
                        HttpStatus.BAD_REQUEST,
                        "O corpo da requisição está ausente ou possui um JSON inválido."
                );

        problema.setTitle("Corpo da requisição inválido");
        problema.setProperty(
                "codigo",
                "CORPO_REQUISICAO_INVALIDO"
        );

        return problema;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail tratarParametroInvalido(
            MethodArgumentTypeMismatchException exception
    ) {
        ProblemDetail problema =
                ProblemDetail.forStatusAndDetail(
                        HttpStatus.BAD_REQUEST,
                        "O valor '"
                                + exception.getValue()
                                + "' é inválido para o parâmetro '"
                                + exception.getName()
                                + "'."
                );

        problema.setTitle("Parâmetro inválido");
        problema.setProperty(
                "codigo",
                "PARAMETRO_INVALIDO"
        );

        return problema;
    }


}
