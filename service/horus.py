import time
from dataclasses import dataclass
from dSocket import DSocket


@dataclass
class Identfid:
    codigo: str
    posicao: str


# ---------------------------------------------------------------------------
# Protocolo ASCII Horus
# Formato: >?CCCCDDPPP...KK
#   >?  = marcador de início
#   CCCC = comprimento hex (len(params) + 2)
#   DD  = índice do comando em hex
#   PPP = parâmetros em ASCII hex
#   KK  = checksum (soma dos ord() de todos os chars a partir do '?', mod 256)
# ---------------------------------------------------------------------------

def _monta_comando(indice: int, parametros: str) -> str:
    count_bytes = len(parametros) + 2
    st_indice = "%0.2X" % indice
    return _adiciona_check(">?" + "%0.4X" % count_bytes + st_indice + parametros)


def _adiciona_check(st: str) -> str:
    check = 0
    for a in st[1:]:
        check += ord(a)
    check = check % 256
    return st + "%0.2X" % check


def _verifica_string_horus(st: bytes) -> bool:
    try:
        if not isinstance(st, bytes) or len(st) <= 6:
            return False
        data = st[0:6] + st[6:len(st) - 3]
        checked = _adiciona_check(data.decode())
        return checked.encode() == st[0:len(st) - 1]
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Leitura
# ---------------------------------------------------------------------------

def get_serial(s: DSocket) -> str:
    """Retorna número de série do concentrador."""
    cmd = _monta_comando(18, '')
    resp = s.tcpSend(cmd.encode())
    if isinstance(resp, bytes) and len(resp) >= 154:
        return resp.decode()[75:92]
    return "0"


def get_preco(s: DSocket, bico_forecourt: int) -> tuple:
    """Retorna (p1_str, p2_str, p3_str) como strings de 6 chars (ex: '005800').
    Retorna (None, None, None) em caso de falha."""
    cmd = _monta_comando(5, str(bico_forecourt).zfill(2) + "08")
    resp = s.tcpSend(cmd.encode())
    if isinstance(resp, bytes) and _verifica_string_horus(resp) and len(resp) > 50:
        p1 = resp[32:38].decode()
        p2 = resp[38:44].decode()
        p3 = resp[44:50].decode()
        return p1, p2, p3
    return None, None, None


def preco_str_to_float(preco_str: str, decimais: int = 3) -> float:
    """Converte string '005800' → 5.8 conforme número de decimais."""
    try:
        int_part = preco_str[0:6 - decimais]
        dec_part = preco_str[6 - decimais:6 - decimais + decimais]
        return float(int_part + '.' + dec_part)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Atualização de preço
# ---------------------------------------------------------------------------

def set_preco(s: DSocket, bico_forecourt: int, preco_base: float,
              desconto: float, grade: int, decimais: int = 3) -> bool:
    """Envia novo preço ao concentrador. grade=1 ou 2. Retorna True se sucesso."""
    new_price = round(preco_base - desconto, 3)
    parts = str(new_price).split('.')
    hi = parts[0]
    lo = parts[1] if len(parts) > 1 else "0"
    if decimais == 2:
        fmt_price = hi.zfill(4) + lo.ljust(2, '0')
    else:
        fmt_price = hi.zfill(3) + lo.ljust(3, '0')
    fmt_price = fmt_price[:6]

    print(f"  Bico {bico_forecourt} grade {grade}: {preco_base} - {desconto} = {new_price} → {fmt_price}")
    cmd = _monta_comando(50, str(bico_forecourt).zfill(2) + str(grade) + fmt_price)
    resp = s.tcpSend(cmd.encode())
    if isinstance(resp, bytes):
        resp_str = resp.decode()
        if len(resp_str) == 13 and resp_str[8:10] == "00":
            return True
        print(f"  Falha ao alterar preço: {resp_str}")
    return False


# ---------------------------------------------------------------------------
# Cartões RFID
# ---------------------------------------------------------------------------

def get_lista_cartoes(s: DSocket, timeout: int = 60) -> list:
    """Retorna lista de Identfid cadastrados no concentrador."""
    try:
        try:
            s.s.settimeout(0.01)
            s.s.recv(250)
        except OSError:
            time.sleep(0.01)
        s.s.settimeout(timeout)
        cmd = _monta_comando(31, '04')
        s.s.send(cmd.encode())
        data = ""
        output_list = []
        time_end = time.monotonic() + timeout
        while time.monotonic() < time_end:
            b = s.s.recv(1).decode()
            if b not in (chr(0), '\n', '\r'):
                data += b
            if b == '\r':
                if data.upper() != "#ENDOFFILE":
                    parts = data.split(";")
                    if len(parts) > 2:
                        output_list.append(Identfid(codigo=parts[1], posicao=parts[0]))
                else:
                    return output_list
                data = ""
        return output_list
    except OSError as e:
        print(e)
        return []


def add_cartao(s: DSocket, codigo: str, ativo: bool, nivel: int = 1) -> bool:
    """Adiciona/atualiza cartão RFID no concentrador."""
    s.tcpClear(10)
    if nivel >= 3:
        return False
    time.sleep(1)
    perm = "2" if ativo else "0"
    nivel_adj = nivel + 7 if ativo else nivel + 4
    cmd = _monta_comando(13, str(codigo) + str(perm) + str(nivel_adj))
    try:
        resp = s.tcpSend(cmd.encode())
        if isinstance(resp, bytes):
            resp_str = resp.decode()
            return resp_str[14:30] == codigo and len(resp_str) == 33
        return False
    except OSError:
        return False


def delete_cartao(s: DSocket, idf: Identfid) -> bool:
    """Remove cartão RFID do concentrador pela posição."""
    cmd = _monta_comando(14, str(idf.posicao).zfill(6) + idf.codigo)
    resp = s.tcpSend(cmd.encode())
    if isinstance(resp, bytes):
        return resp.decode()[8:10] == "00"
    return False
