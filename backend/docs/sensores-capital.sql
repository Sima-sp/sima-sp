-- Os pontos monitorados da capital como sensores (#16).
--
-- POR QUE: o modelo de IA conhece 137 pontos com histórico de alagamento
-- (ia/models/pontos_v1.csv). Cadastrados como sensores, o mapa inteiro passa a mostrar a
-- previsão real, com a chuva real, mesmo sem leitura. Um sensor a mais de 500 m de um ponto do
-- modelo fica sem histórico e a previsão quase não se mexe: por isso as posições são as do modelo.
--
-- DE ONDE: os 136 pontos de app/src/dados/pontosCapital.js (os mesmos do modelo, com os
-- nomes revisados à mão; o P0076 ficou de fora porque a posição não batia com a região). A
-- vizinhança vai no formato "Via — Região", com travessão: o app separa o endereço por ele.
--
-- O sensor de bancada (bueiro_01) fica no ponto mais perto da Etec: VM-01, Marginal Tietê
-- (874 m da escola).
--
-- NÃO É MIGRAÇÃO: são dados de demonstração. Rode à mão, no banco de demonstração ou no hospedado:
--
--   mysql -u root -p simasp_db < docs/sensores-capital.sql
--
-- Pode rodar mais de uma vez: a tabela tem índice único por posição, e o ponto que já existe só
-- tem o nome atualizado. Nada é apagado.

-- O arquivo é UTF-8. Sem esta linha, um cliente que não usa UTF-8 por padrão (o do Windows, ou
-- o mysql de algumas instalações Linux) grava "TietÃª" no lugar de "Tietê". Rodar de novo
-- corrige os nomes já gravados errado.
SET NAMES utf8mb4;

INSERT INTO TBL_SENSOR (NR_LATITUDE, NR_LONGITUDE, TX_VIZINHANCA, TX_STATUS_SENSOR)
VALUES
    (-23.539846, -46.627407, 'Av. do Estado — Sé', 'ATIVO'),
    (-23.548763, -46.638634, 'Praça da Bandeira — Sé', 'ATIVO'),
    (-23.537922, -46.641590, 'Av. Rio Branco — Sé', 'ATIVO'),
    (-23.537117, -46.648903, 'Av. São João — Sé', 'ATIVO'),
    (-23.556948, -46.628440, 'R. Teixeira Leite — Sé', 'ATIVO'),
    (-23.518959, -46.654050, 'Av. Rudge — Sé', 'ATIVO'),
    (-23.522720, -46.649628, 'R. Visconde de Taunay — Sé', 'ATIVO'),
    (-23.567840, -46.606693, 'R. Pres. Batista Pereira — Sé', 'ATIVO'),
    (-23.523730, -46.628036, 'R. Porto Seguro — Sé', 'ATIVO'),
    (-23.532064, -46.661167, 'Elevado Pres. João Goulart — Sé', 'ATIVO'),
    (-23.555520, -46.646700, 'R. Manoel Dutra — Sé', 'ATIVO'),
    (-23.537320, -46.457016, 'Av. Itaquera — Itaquera', 'ATIVO'),
    (-23.540382, -46.612015, 'Av. Celso Garcia — Mooca', 'ATIVO'),
    (-23.544554, -46.593143, 'Av. Alcântara Machado — Mooca', 'ATIVO'),
    (-23.538120, -46.599045, 'Av. Celso Garcia — Mooca', 'ATIVO'),
    (-23.542265, -46.482162, 'R. Dr. Luiz Ayres — Penha', 'ATIVO'),
    (-23.527344, -46.625618, 'Av. Cruzeiro do Sul — Mooca', 'ATIVO'),
    (-23.543327, -46.587036, 'Av. Alcântara Machado — Mooca', 'ATIVO'),
    (-23.583390, -46.575153, 'Av. Prof. Luiz Ignácio Anhaia Mello — Vila Prudente', 'ATIVO'),
    (-23.548038, -46.526180, 'Av. Aricanduva — Aricanduva / Carrão', 'ATIVO'),
    (-23.535994, -46.551872, 'Av. Conde de Frontin — Aricanduva / Carrão', 'ATIVO'),
    (-23.514698, -46.519860, 'Av. São Miguel — Ermelino Matarazzo', 'ATIVO'),
    (-23.554974, -46.517025, 'Av. Aricanduva — Aricanduva / Carrão', 'ATIVO'),
    (-23.548033, -46.602924, 'Av. Alcântara Machado — Mooca', 'ATIVO'),
    (-23.531912, -46.522686, 'Av. Conde de Frontin — Penha', 'ATIVO'),
    (-23.535254, -46.581516, 'Av. Celso Garcia — Mooca', 'ATIVO'),
    (-23.539518, -46.484737, 'Av. Águia de Haia — Penha', 'ATIVO'),
    (-23.552004, -46.577000, 'Av. Salim Farah Maluf — Mooca', 'ATIVO'),
    (-23.545073, -46.595710, 'Av. Alcântara Machado — Mooca', 'ATIVO'),
    (-23.536703, -46.588990, 'Av. Celso Garcia — Mooca', 'ATIVO'),
    (-23.544157, -46.531094, 'Av. Aricanduva — Aricanduva / Carrão', 'ATIVO'),
    (-23.494862, -46.405666, 'R. Manuel Barbalho de Lima — Itaim Paulista', 'ATIVO'),
    (-23.552559, -46.599100, 'R. Bresser — Mooca', 'ATIVO'),
    (-23.536852, -46.558235, 'R. Melo Freire — Mooca', 'ATIVO'),
    (-23.542055, -46.534680, 'Av. Aricanduva — Aricanduva / Carrão', 'ATIVO'),
    (-23.503717, -46.685085, 'Av. Antônio Munhoz Bonilha — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.518728, -46.630333, 'Marginal Tietê — Santana / Tucuruvi', 'ATIVO'),
    (-23.512827, -46.625122, 'Av. Cruzeiro do Sul — Santana / Tucuruvi', 'ATIVO'),
    (-23.527245, -46.596878, 'Marginal Tietê — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.504080, -46.624783, 'R. Darzan — Santana / Tucuruvi', 'ATIVO'),
    (-23.522220, -46.611046, 'Marginal Tietê — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.508180, -46.705620, 'Marginal Tietê — Freguesia / Brasilândia', 'ATIVO'),
    (-23.508715, -46.600140, 'R. Chico Pontes — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.507210, -46.747470, 'Av. Elísio Cordeiro de Siqueira — Pirituba / Jaraguá', 'ATIVO'),
    (-23.522514, -46.558357, 'Marginal Tietê — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.405922, -46.750700, 'R. Bernardo José de Lorena — Perus', 'ATIVO'),
    (-23.512486, -46.611260, 'R. Cel. Marques Ribeiro — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.472675, -46.571480, 'Av. Edu Chaves — Jaçanã / Tremembé', 'ATIVO'),
    (-23.517973, -46.638493, 'Marginal Tietê — Santana / Tucuruvi', 'ATIVO'),
    (-23.503626, -46.617527, 'Av. Gal. Ataliba Leonel — Santana / Tucuruvi', 'ATIVO'),
    (-23.490013, -46.710007, 'Av. Gal. Edgar Facó — Pirituba / Jaraguá', 'ATIVO'),
    (-23.404425, -46.753130, 'Praça Inácio Dias — Perus', 'ATIVO'),
    (-23.527597, -46.585266, 'Marginal Tietê — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.509037, -46.665787, 'Av. Ordem e Progresso — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.481100, -46.674244, 'Av. Inajar de Souza — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.500680, -46.614513, 'Av. Zaki Narchi — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.518644, -46.616280, 'Av. Morvan Dias de Figueiredo — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.487010, -46.715126, 'Av. Benedito Andrade — Pirituba / Jaraguá', 'ATIVO'),
    (-23.509075, -46.680157, 'R. Maestro Gabriel Migliori — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.510460, -46.609215, 'R. Cel. Marques Ribeiro — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.512098, -46.666298, 'Av. Ordem e Progresso — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.515263, -46.641090, 'Av. Olavo Fontoura — Santana / Tucuruvi', 'ATIVO'),
    (-23.473795, -46.670190, 'Av. Inajar de Souza — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.516493, -46.645206, 'Av. Olavo Fontoura — Santana / Tucuruvi', 'ATIVO'),
    (-23.519941, -46.612972, 'Av. Morvan Dias de Figueiredo — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.506407, -46.602450, 'R. Maria Cândida — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.522228, -46.607807, 'Av. Morvan Dias de Figueiredo — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.445992, -46.590084, 'Tv. Foz do Tejo — Jaçanã / Tremembé', 'ATIVO'),
    (-23.512209, -46.678844, 'Av. Otaviano Alves de Lima — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.426874, -46.724785, 'Av. Raimundo Pereira de Magalhães — Pirituba / Jaraguá', 'ATIVO'),
    (-23.508068, -46.612545, 'R. Cel. Marques Ribeiro — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.495394, -46.661290, 'Av. Eng. Caetano Álvares — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.405289, -46.765427, 'Tv. Tabuleiros de Valença — Perus', 'ATIVO'),
    (-23.502964, -46.630684, 'R. Comendador Joaquim Monteiro — Santana / Tucuruvi', 'ATIVO'),
    (-23.455717, -46.628450, 'R. Francisco Inglês — Jaçanã / Tremembé', 'ATIVO'),
    (-23.509792, -46.628876, 'Av. Santos Dumont — Santana / Tucuruvi', 'ATIVO'),
    (-23.518421, -46.557570, 'R. Paulo Lorenzani — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.504738, -46.680380, 'R. Nelson Francisco — Casa Verde / Cachoeirinha', 'ATIVO'),
    (-23.486765, -46.605988, 'R. Guanapus — Santana / Tucuruvi', 'ATIVO'),
    (-23.478554, -46.620995, 'Av. Água Fria — Santana / Tucuruvi', 'ATIVO'),
    (-23.486336, -46.756420, 'Estrada Turística do Jaraguá — Pirituba / Jaraguá', 'ATIVO'),
    (-23.510120, -46.595913, 'R. Chico Pontes — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.470125, -46.572998, 'Av. Luís Stamatis — Jaçanã / Tremembé', 'ATIVO'),
    (-23.527813, -46.591995, 'Av. Morvan Dias de Figueiredo — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.497421, -46.612038, 'Av. Luiz Dumont Villares — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.507364, -46.710940, 'Av. Raimundo Pereira de Magalhães — Pirituba / Jaraguá', 'ATIVO'),
    (-23.513987, -46.578094, 'Av. Bandeirantes do Sul — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.441750, -46.589645, 'Av. Antonelo da Messina — Jaçanã / Tremembé', 'ATIVO'),
    (-23.493880, -46.610023, 'Av. Gal. Ataliba Leonel — Vila Maria / Vila Guilherme', 'ATIVO'),
    (-23.572212, -46.704292, 'Av. Eusébio Matoso — Butantã', 'ATIVO'),
    (-23.519299, -46.675170, 'Praça Pascoal Martins — Lapa', 'ATIVO'),
    (-23.525503, -46.682068, 'Av. Pompeia — Lapa', 'ATIVO'),
    (-23.529810, -46.677170, 'R. Turiassu — Lapa', 'ATIVO'),
    (-23.619530, -46.682804, 'Av. Santo Amaro — Pinheiros', 'ATIVO'),
    (-23.618866, -46.700573, 'Marginal Pinheiros — Pinheiros', 'ATIVO'),
    (-23.565737, -46.711548, 'R. Alvarenga — Butantã', 'ATIVO'),
    (-23.520264, -46.748585, 'Marginal Tietê — Lapa', 'ATIVO'),
    (-23.524536, -46.702065, 'R. Jeroaquara — Lapa', 'ATIVO'),
    (-23.533577, -46.752260, 'Av. Eng. Billings — Lapa', 'ATIVO'),
    (-23.586096, -46.690105, 'Av. dos Tajurás — Pinheiros', 'ATIVO'),
    (-23.564780, -46.678060, 'Av. Rebouças — Pinheiros', 'ATIVO'),
    (-23.512058, -46.703280, 'R. Ricardo Cavatton — Lapa', 'ATIVO'),
    (-23.580841, -46.684055, 'Túnel Max Feffer — Pinheiros', 'ATIVO'),
    (-23.593650, -46.693127, 'Marginal Pinheiros — Pinheiros', 'ATIVO'),
    (-23.578892, -46.709656, 'Av. Prof. Francisco Morato — Butantã', 'ATIVO'),
    (-23.527382, -46.740380, 'Av. Mofarrej — Lapa', 'ATIVO'),
    (-23.539848, -46.728817, 'Av. Queiroz Filho — Lapa', 'ATIVO'),
    (-23.593147, -46.705467, 'R. Eng. Oscar Americano — Butantã', 'ATIVO'),
    (-23.516157, -46.666584, 'Av. Pres. Castelo Branco — Lapa', 'ATIVO'),
    (-23.586681, -46.724407, 'Av. Jorge João Saad — Butantã', 'ATIVO'),
    (-23.589828, -46.690860, 'Av. das Nações Unidas — Pinheiros', 'ATIVO'),
    (-23.596027, -46.737083, 'Tv. Irmã Dolores Baldi — Butantã', 'ATIVO'),
    (-23.620857, -46.627850, 'Av. Prof. Abraão de Morais — Vila Mariana', 'ATIVO'),
    (-23.584509, -46.653473, 'Av. Vinte e Três de Maio — Vila Mariana', 'ATIVO'),
    (-23.626251, -46.687210, 'Av. Santo Amaro — Santo Amaro', 'ATIVO'),
    (-23.645342, -46.729680, 'Av. Maria Coelho Aguiar — M''Boi Mirim', 'ATIVO'),
    (-23.600994, -46.651176, 'Av. Rubem Berta — Vila Mariana', 'ATIVO'),
    (-23.605606, -46.664200, 'Av. Ibirapuera — Vila Mariana', 'ATIVO'),
    (-23.664290, -46.678436, 'Av. Interlagos — Cidade Ademar', 'ATIVO'),
    (-23.682472, -46.693115, 'Av. das Nações Unidas — Santo Amaro', 'ATIVO'),
    (-23.684473, -46.692100, 'R. Miguel Yunes — Santo Amaro', 'ATIVO'),
    (-23.585314, -46.669970, 'Av. Antônio Joaquim de Moura Andrade — Vila Mariana', 'ATIVO'),
    (-23.678790, -46.684765, 'Av. Nossa Senhora do Sabará — Santo Amaro', 'ATIVO'),
    (-23.625788, -46.691433, 'Av. Roque Petroni Júnior — Santo Amaro', 'ATIVO'),
    (-23.612783, -46.627697, 'Av. Prof. Abraão de Morais — Vila Mariana', 'ATIVO'),
    (-23.660189, -46.704777, 'R. João Alfredo — Santo Amaro', 'ATIVO'),
    (-23.652433, -46.721870, 'Av. das Nações Unidas — Santo Amaro', 'ATIVO'),
    (-23.664547, -46.709990, 'Av. das Nações Unidas — Santo Amaro', 'ATIVO'),
    (-23.675383, -46.699726, 'Av. das Nações Unidas — Santo Amaro', 'ATIVO'),
    (-23.615814, -46.627340, 'Av. Prof. Abraão de Morais — Vila Mariana', 'ATIVO'),
    (-23.664682, -46.721960, 'Av. Guarapiranga — Capela do Socorro', 'ATIVO'),
    (-23.666958, -46.772697, 'Av. Ellis Maas — Campo Limpo', 'ATIVO'),
    (-23.595234, -46.621670, 'Av. Dr. Ricardo Jafet — Vila Mariana', 'ATIVO'),
    (-23.694578, -46.677750, 'R. Miguel Yunes — Cidade Ademar', 'ATIVO'),
    (-23.577190, -46.609108, 'Av. Teresa Cristina — Ipiranga', 'ATIVO'),
    (-23.592714, -46.620950, 'Av. Dr. Ricardo Jafet — Vila Mariana', 'ATIVO')
AS novo
ON DUPLICATE KEY UPDATE TX_VIZINHANCA = novo.TX_VIZINHANCA;

-- Sensor de bancada: o código que o firmware manda. A profundidade e a distância de cheio do
-- balde entram depois da calibração (#55), por PATCH /admin/sensores/{id} (profundidadeCm e distanciaCheioCm)
-- ou descomentando a linha abaixo. Depois, gere a chave em POST /admin/sensores/{id}/chave.
UPDATE TBL_SENSOR SET TX_CODIGO = 'bueiro_01'
 WHERE NR_LATITUDE = -23.527245 AND NR_LONGITUDE = -46.596878
   AND (TX_CODIGO IS NULL OR TX_CODIGO = 'bueiro_01')
   AND NOT EXISTS (SELECT 1 FROM (SELECT ID_SENSOR FROM TBL_SENSOR WHERE TX_CODIGO = 'bueiro_01') AS outro);

-- UPDATE TBL_SENSOR SET NR_PROFUNDIDADE_CM = <cm>, NR_DISTANCIA_CHEIO_CM = <cm> WHERE TX_CODIGO = 'bueiro_01';
