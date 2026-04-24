import socket
import struct

TIMEOUT = 5

def _checksum(data: bytes) -> int:
    total = 0
    for b in data:
        total += b
    return total & 0xFF

def _montar_pacote(index: int, payload: bytes) -> bytes:
    length = len(payload) + 4
    header = struct.pack(">HHH", length, index, 0)
    corpo = header + payload
    cs = _checksum(corpo)
    return b">?" + corpo + bytes([cs])

def _enviar(host: str, port: int, pacote: bytes) -> bytes:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(TIMEOUT)
        s.connect((host, port))
        s.sendall(pacote)
        return s.recv(4096)

# ---------------------------------------------------------------------------

def get_serial(host: str, port: int) -> str:
    pacote = _montar_pacote(0x05, b"\x61\x08\x00\x00")
    resp = _enviar(host, port, pacote)
    return resp[6:14].decode("ascii", errors="replace").strip()

def get_preco(host: str, port: int, bico_forecourt: int) -> tuple:
    """Retorna (preco_base, preco_desconto) lidos do equipamento."""
    payload = struct.pack(">BBH", 0x61, 0x03, bico_forecourt)
    pacote = _montar_pacote(0x05, payload)
    resp = _enviar(host, port, pacote)
    # Formato de resposta: 3 preços de 4 bytes cada (BCD)
    p0 = _bcd_to_float(resp[6:10])
    p1 = _bcd_to_float(resp[10:14])
    p2 = _bcd_to_float(resp[14:18])
    return (p0, p1, p2)

def set_preco(host: str, port: int, bico_forecourt: int, preco_base: float,
              desconto: float, nivel: int, decimais: int = 3):
    """Envia novo preço ao equipamento. nivel=1 ou 2."""
    preco_com_desconto = round(preco_base - desconto, decimais)
    payload = struct.pack(">BBH", 0x61, 0x08, bico_forecourt)
    payload += _float_to_bcd(preco_com_desconto, decimais)
    payload += bytes([nivel])
    pacote = _montar_pacote(0x05, payload)
    _enviar(host, port, pacote)

def get_lista_cartoes(host: str, port: int) -> list:
    """Retorna lista de códigos RFID cadastrados no equipamento."""
    pacote = _montar_pacote(0x05, b"\x61\x0A\x00\x00")
    resp = _enviar(host, port, pacote)
    cartoes = []
    offset = 6
    while offset + 8 <= len(resp) - 1:
        codigo = resp[offset:offset+8].hex().upper()
        cartoes.append(codigo)
        offset += 8
    return cartoes

def add_cartao(host: str, port: int, codigo: str, ativo: bool):
    """Adiciona ou atualiza cartão RFID no equipamento."""
    codigo_bytes = bytes.fromhex(codigo.zfill(16))
    autoriza = 0x01 if ativo else 0x00
    payload = b"\x61\x0B" + codigo_bytes + bytes([autoriza, 0x01])
    pacote = _montar_pacote(0x05, payload)
    _enviar(host, port, pacote)

def delete_cartao(host: str, port: int, codigo: str):
    """Remove cartão RFID do equipamento."""
    codigo_bytes = bytes.fromhex(codigo.zfill(16))
    payload = b"\x61\x0C" + codigo_bytes
    pacote = _montar_pacote(0x05, payload)
    _enviar(host, port, pacote)

# ---------------------------------------------------------------------------

def _bcd_to_float(data: bytes) -> float:
    s = data.hex()
    try:
        return float(s[:-3] + "." + s[-3:])
    except Exception:
        return 0.0

def _float_to_bcd(value: float, decimais: int = 3) -> bytes:
    s = f"{value:.{decimais}f}".replace(".", "").zfill(8)
    return bytes.fromhex(s)
