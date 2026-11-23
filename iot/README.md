# SIMA-SP · firmware do sensor

Firmware do sensor de nível de água do SIMA-SP: ESP32 com sensor de distância por ultrassom, que
mede a distância até a água e envia a leitura por Wi-Fi. Junto vem o **servidor do sensor**
(Node), que recebe essa leitura: os dois mudam juntos, porque o formato do envio
(`{"device":"bueiro_01","distancia":32.4}`) é o contrato entre eles.

Código do grupo do IoT, como usado na feira de 07/10/2026. Até 06/11/2026 ficava na pasta `iot/`
do app (hoje a pasta `app/` deste repositório). O painel que mostra a leitura continua no app (`sensor.html`).

```
ESP32 + sensor ──Wi-Fi──▶ servidor do sensor (Node, porta 3000) ◀── painel do sensor (sima-sensor.html)
   firmware/                 servidor-sensor/                         app/src/sensor/        
```

A senha do Wi-Fi e qualquer chave nunca vão para o git. O jeito de trabalhar do grupo está no
[README da raiz](../README.md).

## Firmware (`firmware/sima_sensor/sima_sensor.ino`)

- ESP32 com sensor de distância por ultrassom: `TRIG` no pino 22, `ECHO` no 23, LED no 18.
- Mede cerca de 20 vezes por segundo (um laço a cada 50 ms) e **envia uma leitura a cada 2 s**:
  `POST /api/leitura` com `{"device":"bueiro_01","distancia":32.4}` (cm, do sensor até a água).
- **Só envia leitura válida**: sem eco, ou fora de 2 a 450 cm, não envia nada. O sensor alcança
  2000 cm, mas este código ainda corta em 450 cm (na bancada isso não aparece).
- O LED pisca mais rápido conforme a água chega perto: até 25 cm, até 45 cm e acima disso.
- **Wi-Fi e endereço do servidor ficam escritos no código.** A senha está como `SUA_SENHA`
  (não vai para o repositório): preencha antes de gravar e não envie de volta com a senha.
  `SERVER_URL` aponta para `172.20.10.2`, o endereço que o hotspot do iPhone costuma dar ao
  primeiro aparelho que entra.

Gravar: abra a pasta `firmware/sima_sensor` na Arduino IDE (com o pacote de placas do ESP32),
preencha `WIFI_PASS`, escolha a placa e a porta e envie. O monitor serial (115200) deve mostrar
`Envio -> codigo HTTP: 200` a cada 2 s.

## Servidor do sensor (`servidor-sensor/`)

Node + Express, porta 3000, aceita pedidos de qualquer endereço (CORS aberto). Recebe a leitura do
ESP32, mostra no painel da bancada e **repassa ao backend** (#54).

| Rota | O que faz |
|---|---|
| `POST /api/leitura` | Recebe a leitura do ESP32, classifica e guarda a última em memória. Distância que não é número, ou fora de 0 a 2000 cm (o limite do backend), volta `400`. Eco falso responde `200`, mas não é usado (ver abaixo) |
| `GET /api/leitura` | A última leitura (ou `null` se ainda não chegou nenhuma), com `idadeSegundos` e `parado` (`true` depois de 10 s sem leitura nova) |
| `GET /api/limites` | `{ "zonaCega": 15, "critico": 20, "alerta": 30, "atencao": 45 }` |
| `GET /api/estado` | Como está o repasse: `backend` (`desligado`, `aguardando`, `ligado` ou `fora`), o código repassado, último envio que deu certo, último erro, leituras na fila e códigos ignorados. Em `sensor`: hora e idade da última leitura, `parado` e quantas leituras saíram por eco falso |
| `GET /api/stream` | A leitura em tempo real (Server-Sent Events). Quando o sensor para, manda a última leitura de novo, uma vez, com `parado: true` |
| `/` | Arquivos da pasta `public/` |

### Sensor parado, eco falso e folga nos limites (#56)

- **Sensor parado:** passados **10 s** sem leitura nova (cinco envios do firmware), a última
  leitura continua disponível, mas sai com `parado: true`. É a placa desligada, sem Wi-Fi ou sem
  eco. O painel do app usa o mesmo tempo e mostra "Sensor parado".
- **Eco falso:** uma leitura que salta mais de **15 cm** em relação à anterior (água de verdade não
  sobe isso em 2 s) fica em suspeita e não vai ao painel, à classificação nem ao backend. Se a
  leitura seguinte confirmar o salto, a mudança era de verdade e passa a valer. Depois de o sensor
  ficar parado, a primeira leitura vale sem comparação. O log mostra `[DESCARTADA]`.
- **Folga nos limites:** perto de um limite, a medida oscila e o nível ficaria trocando. O nível
  só muda quando a água passa do limite por pelo menos **2 cm** (para subir e para descer). Vale
  para o nível do servidor e para a troca de faixa que dispara o envio imediato ao backend.

### Repasse ao backend

O ESP32 continua mandando a cada 2 s, e o painel continua lendo daqui. Ao backend vai:

- a **mediana a cada 30 s**, que tira os picos do ultrassom (gravar a cada 2 s seriam 43 mil
  linhas por dia por sensor);
- um envio **na hora** quando o nível muda de faixa (normal, atenção, alerta, crítico), para o
  alerta chegar rápido. A faixa vem da mediana das 3 últimas leituras, então um pico isolado não
  conta, e entre dois envios imediatos há pelo menos 5 s;
- `POST {BACKEND_URL}/leituras` com o cabeçalho `X-Sensor-Chave` e
  `{ "codigo": "bueiro_01", "distanciaCm": 32.4, "medidaEm": "2026-11-24T17:20:00.000Z" }`. O
  `codigo` é o `device` que o firmware manda.

A chave é de um sensor só, então só vai ao backend o código de `SENSOR_CODIGO` (`bueiro_01`). Uma
leitura com outro `device` (um teste qualquer na rede) aparece no painel, mas não é repassada: ela
voltaria `404` e seguraria na fila as leituras do sensor de verdade. O código ignorado aparece uma
vez no log e em `/api/estado`.

O repasse corre depois da resposta ao ESP32: backend lento ou fora não atrasa o painel. Sem
resposta do backend, as leituras esperam numa fila curta (as 20 últimas) e o envio é tentado de
novo com espera crescente (2 s, 4 s, 8 s… até 1 min). Chave errada (`401`), sensor não cadastrado
(`404`) ou inativo (`409`) aparecem no log e em `/api/estado`, e a próxima tentativa só vem depois
de 1 min.

### Configuração

Copie `servidor-sensor/.env.example` para `servidor-sensor/.env` e preencha. O `.env` não vai para
o git.

| Variável | Padrão | Para quê |
|---|---|---|
| `BACKEND_URL` | vazio | Endereço do backend, ex.: `http://localhost:8080`. Vazio = só o painel, nada vai ao backend (o plano B da banca) |
| `SENSOR_CHAVE` | vazio | Chave do sensor, gerada pelo admin em `POST /admin/sensores/{id}/chave`. Nunca no código, em print ou no grupo |
| `SENSOR_CODIGO` | `bueiro_01` | O sensor dono da chave (o `device` do firmware). Só ele vai ao backend |
| `INTERVALO_REPASSE_S` | `30` | A cada quantos segundos a mediana vai ao backend |
| `PORT` | `3000` | Porta deste servidor |

Rodar (Node 20.12 ou mais novo):

```
cd servidor-sensor
npm install
cp .env.example .env   # e preencha BACKEND_URL e SENSOR_CHAVE
npm start
npm test               # testes do servidor e do repasse
```

Para conferir de ponta a ponta: com o servidor ligado ao backend, mande uma leitura e veja o estado.

```
curl -X POST localhost:3000/api/leitura -H 'Content-Type: application/json' -d '{"device":"bueiro_01","distancia":40}'
curl localhost:3000/api/estado     # "backend": "ligado"
```

O painel do SIMA vem do app: na pasta [`app/`](../app),
`npm run painel` gera `dist-painel/sima-sensor.html`; copie para `servidor-sensor/public/` e abra
`http://localhost:3000/sima-sensor.html`. Ele
conecta sozinho, sem internet.

## Na bancada

1. Hotspot do iPhone ligado, com "Maximizar Compatibilidade" (o ESP32 só vê Wi-Fi de 2,4 GHz).
2. O notebook do servidor entra no hotspot **primeiro** e precisa ficar com `172.20.10.2`.
3. `npm start` na pasta `servidor-sensor/` do notebook, com o `.env` preenchido.
4. Liga a placa. `http://localhost:3000/api/leitura` passa a mostrar a distância, e
   `http://localhost:3000/api/estado` deve dizer `"backend": "ligado"` em até 30 s.
5. Desligando a placa, em até 10 s `/api/leitura` diz `"parado": true` e o painel mostra "Sensor
   parado".

## Diferenças que valem lembrar

- **Limites.** O servidor classifica com crítico 20, alerta 30, atenção 45 cm (zona cega 15). O
  painel do SIMA usa crítico 30, alto 45, médio 60 cm, porque o sensor só mede a partir de 20 cm
  (informado em 07/10); o painel não usa os limites do servidor para dar o nível, só avisa que
  são diferentes. O LED do firmware usa 25 e 45 cm.
- **Leitura impossível.** O servidor recusa distância zero, negativa ou acima de 2000 cm (`400`) e
  ignora o eco falso. O firmware também não manda leitura fora de 2 a 450 cm.
- **Firmware (#56, ainda não feito):** ele ainda manda uma medida solta a cada 2 s, e não a
  mediana; sem eco, fica calado (não dá para distinguir de placa desligada, e o servidor diz
  "parado" nos dois casos); e não reconecta ao Wi-Fi sozinho.
- **Nível do servidor.** O campo `nivel` do servidor vai de 0 (Normal) a 3 (Crítico); o do app vai
  de 1 (Baixo) a 4 (Crítico). O painel não usa o do servidor.
- **Só a última leitura fica aqui.** O histórico fica no backend, que recebe a mediana. Qualquer
  aparelho da rede pode mandar leitura para este servidor; ao backend só chega com a chave do sensor.
- O pacote de onde este código veio não trazia o painel original do grupo (`public/index.html`
  do servidor); se ele existir, pode entrar em `servidor-sensor/public/`.
