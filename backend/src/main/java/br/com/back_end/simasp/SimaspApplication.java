package br.com.back_end.simasp;

import br.com.back_end.simasp.config.FusoHorario;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

@SpringBootApplication
public class SimaspApplication {

	public static void main(String[] args) {
		// Horário de São Paulo mesmo num servidor em UTC (#9).
		TimeZone.setDefault(TimeZone.getTimeZone(FusoHorario.FUSO));
		SpringApplication.run(SimaspApplication.class, args);
	}

}
