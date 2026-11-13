# -*- coding: utf-8 -*-
"""Configuracoes e tabelas de apoio do projeto (nao precisa mexer aqui)."""

ANOS = list(range(2020, 2026))          # periodo analisado: jan/2020 a dez/2025
GRUPOS = ['TAM', 'GLO', 'AZU', 'OUT']   # LATAM, Gol, Azul e "Outras"
NOMES_GRUPO = {'TAM': 'LATAM', 'GLO': 'Gol', 'AZU': 'Azul', 'OUT': 'Outras'}
N_ROTAS = 250                           # rotas (pares de aeroportos) no painel
N_AEROPORTOS = 40                       # aeroportos (por origem) no painel

# IPCA mensal (% ao mes), fonte: IBGE. Usado para corrigir as tarifas para reais de dez/2025.
# Conferido: o IPCA composto de cada ano reproduz o acumulado oficial abaixo.
IPCA = {
    2020: [0.21, 0.25, 0.07, -0.31, -0.38, 0.26, 0.36, 0.24, 0.64, 0.86, 0.89, 1.35],
    2021: [0.25, 0.86, 0.93, 0.31, 0.83, 0.53, 0.96, 0.87, 1.16, 1.25, 0.95, 0.73],
    2022: [0.54, 1.01, 1.62, 1.06, 0.47, 0.67, -0.68, -0.36, -0.29, 0.59, 0.41, 0.62],
    2023: [0.53, 0.84, 0.71, 0.61, 0.23, -0.08, 0.12, 0.23, 0.26, 0.24, 0.28, 0.56],
    2024: [0.42, 0.83, 0.16, 0.38, 0.46, 0.21, 0.38, -0.02, 0.44, 0.56, 0.39, 0.52],
    2025: [0.16, 1.31, 0.56, 0.43, 0.26, 0.24, 0.26, -0.11, 0.48, 0.09, 0.18, 0.33],
}
IPCA_ANUAL_OFICIAL = {2020: 4.52, 2021: 10.06, 2022: 5.78, 2023: 4.62, 2024: 4.83, 2025: 4.26}

# ICAO -> (cidade, IATA, latitude, longitude). Coordenadas aproximadas, so para o mapa esquematico.
AEROPORTOS = {
    'SBGR': ('São Paulo', 'GRU', -23.44, -46.47), 'SBSP': ('São Paulo', 'CGH', -23.63, -46.66),
    'SBKP': ('Campinas', 'VCP', -23.01, -47.13), 'SBRJ': ('Rio de Janeiro', 'SDU', -22.91, -43.16),
    'SBGL': ('Rio de Janeiro', 'GIG', -22.81, -43.25), 'SBBR': ('Brasília', 'BSB', -15.87, -47.92),
    'SBCF': ('Belo Horizonte', 'CNF', -19.62, -43.97), 'SBRF': ('Recife', 'REC', -8.13, -34.92),
    'SBSV': ('Salvador', 'SSA', -12.91, -38.32), 'SBPA': ('Porto Alegre', 'POA', -29.99, -51.17),
    'SBFZ': ('Fortaleza', 'FOR', -3.78, -38.53), 'SBCT': ('Curitiba', 'CWB', -25.53, -49.18),
    'SBFL': ('Florianópolis', 'FLN', -27.67, -48.55), 'SBBE': ('Belém', 'BEL', -1.38, -48.48),
    'SBGO': ('Goiânia', 'GYN', -16.63, -49.22), 'SBVT': ('Vitória', 'VIX', -20.26, -40.29),
    'SBEG': ('Manaus', 'MAO', -3.04, -60.05), 'SBCY': ('Cuiabá', 'CGB', -15.65, -56.12),
    'SBMO': ('Maceió', 'MCZ', -9.51, -35.79), 'SBNF': ('Navegantes', 'NVT', -26.88, -48.65),
    'SBSG': ('Natal', 'NAT', -5.77, -35.38), 'SBSL': ('São Luís', 'SLZ', -2.59, -44.23),
    'SBPS': ('Porto Seguro', 'BPS', -16.44, -39.08), 'SBCG': ('Campo Grande', 'CGR', -20.47, -54.67),
    'SBJP': ('João Pessoa', 'JPA', -7.15, -34.95), 'SBFI': ('Foz do Iguaçu', 'IGU', -25.60, -54.49),
    'SBTE': ('Teresina', 'THE', -5.06, -42.82), 'SBAR': ('Aracaju', 'AJU', -10.98, -37.07),
    'SBUL': ('Uberlândia', 'UDI', -18.88, -48.23), 'SBMQ': ('Macapá', 'MCP', 0.05, -51.07),
    'SBPJ': ('Palmas', 'PMW', -10.29, -48.36), 'SBLO': ('Londrina', 'LDB', -23.33, -51.13),
    'SBMG': ('Maringá', 'MGF', -23.48, -52.02), 'SBSR': ('São José do Rio Preto', 'SJP', -20.82, -49.41),
    'SBPV': ('Porto Velho', 'PVH', -8.71, -63.90), 'SBIL': ('Ilhéus', 'IOS', -14.82, -39.03),
    'SBRP': ('Ribeirão Preto', 'RAO', -21.14, -47.78), 'SBCH': ('Chapecó', 'XAP', -27.13, -52.66),
    'SBSN': ('Santarém', 'STM', -2.42, -54.79), 'SBJU': ('Juazeiro do Norte', 'JDO', -7.22, -39.27),
    'SBPL': ('Petrolina', 'PNZ', -9.36, -40.57), 'SBJV': ('Joinville', 'JOI', -26.22, -48.80),
    'SBBV': ('Boa Vista', 'BVB', 2.85, -60.69), 'SBCA': ('Cascavel', 'CAC', -25.00, -53.50),
    'SBMA': ('Marabá', 'MAB', -5.37, -49.14), 'SBIZ': ('Imperatriz', 'IMP', -5.53, -47.46),
    'SBFN': ('Fernando de Noronha', 'FEN', -3.85, -32.42), 'SBRB': ('Rio Branco', 'RBR', -9.87, -67.90),
    'SBMK': ('Montes Claros', 'MOC', -16.71, -43.82), 'SBVC': ('Vitória da Conquista', 'VDC', -14.91, -40.86),
    'SBCX': ('Caxias do Sul', 'CXJ', -29.20, -51.19), 'SBDN': ('Presidente Prudente', 'PPB', -22.18, -51.42),
    'SBKG': ('Campina Grande', 'CPV', -7.27, -35.90), 'SBJE': ('Jericoacoara', 'JJD', -2.91, -40.36),
    'SBPF': ('Passo Fundo', 'PFB', -28.24, -52.33), 'SBHT': ('Altamira', 'ATM', -3.25, -52.25),
    'SBTT': ('Tabatinga', 'TBT', -4.26, -69.94), 'SWPI': ('Parintins', 'PIN', -2.67, -56.78),
    'SBCO': ('Canoas', 'SBCO', -29.95, -51.15),
}
