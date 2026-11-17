# Backend do SIMA-SP em contêiner (#12).
#
#   docker build -t sima-backend .
#   docker run --env-file .env -p 8080:8080 sima-backend
#
# Estágio 1: compila com Maven. Estágio 2: só o JRE 21 e o .jar, com usuário sem privilégio.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# As dependências mudam pouco: baixar antes de copiar o código aproveita o cache do Docker.
COPY pom.xml .
RUN mvn -B -ntp -q dependency:go-offline
COPY src ./src
RUN mvn -B -ntp -q -DskipTests package

FROM eclipse-temurin:21-jre
# Horário de São Paulo também no contêiner (#9); o backend já força o fuso, isto deixa os logs certos.
ENV TZ=America/Sao_Paulo \
    SPRING_PROFILES_ACTIVE=prod
RUN groupadd --system sima && useradd --system --gid sima --no-create-home sima \
    && mkdir -p /dados/fotos && chown -R sima:sima /dados
# Fotos dos relatos (#15): monte um volume aqui para não perder a cada nova versão.
VOLUME /dados
WORKDIR /app
COPY --from=build /build/target/*.jar /app/simasp.jar
USER sima
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/simasp.jar"]
