package br.com.back_end.simasp.sensor;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

/** {@code docs/sensores-capital.sql} roda no MySQL de verdade e pode rodar de novo sem duplicar (#16). */
@SpringBootTest
class SensoresCapitalSqlTest {

    @Autowired
    private DataSource banco;

    private static long contar(Connection conexao, String sql) throws Exception {
        try (Statement st = conexao.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    @Test
    void cadastraOsPontosEOSensorDeBancadaSemDuplicar() throws Exception {
        EncodedResource script = new EncodedResource(new FileSystemResource("docs/sensores-capital.sql"), StandardCharsets.UTF_8);
        try (Connection conexao = banco.getConnection()) {
            ScriptUtils.executeSqlScript(conexao, script);
            long depoisDaPrimeira = contar(conexao, "SELECT COUNT(*) FROM TBL_SENSOR WHERE TX_VIZINHANCA LIKE '% — %'");

            ScriptUtils.executeSqlScript(conexao, script);
            long depoisDaSegunda = contar(conexao, "SELECT COUNT(*) FROM TBL_SENSOR WHERE TX_VIZINHANCA LIKE '% — %'");

            assertThat(depoisDaPrimeira).isGreaterThanOrEqualTo(136);
            assertThat(depoisDaSegunda).isEqualTo(depoisDaPrimeira);
            assertThat(contar(conexao, "SELECT COUNT(*) FROM TBL_SENSOR WHERE TX_CODIGO = 'bueiro_01'")).isEqualTo(1);
        }
    }
}
