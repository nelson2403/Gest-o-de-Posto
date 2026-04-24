import os
import time
import threading
import logging
from dotenv import load_dotenv

import database as db
import dSocket as dsock
import horus
from horus import Identfid

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

INTERVALO = int(os.getenv("INTERVALO_SEGUNDOS", "10"))


def sincronizar_posto(s: dsock.DSocket, posto: dict):
    posto_id = posto["id"]
    nome = posto["nome"]
    decimais_padrao = 3

    # --- Sincronizar preços ---
    bicos = db.get_bicos_por_posto(posto_id)
    for bico in bicos:
        try:
            bico_fc = bico["bico_forecourt"]
            produto_id = bico["produto_id"]
            preco_base = float(bico["preco_base"] or 0)
            decimais = int(bico.get("decimais") or decimais_padrao)
            desconto = db.get_desconto(posto_id, produto_id)

            p1_str, _, _ = horus.get_preco(s, bico_fc)
            if p1_str is None:
                log.warning(f"[{nome}] Bico {bico_fc}: sem resposta do concentrador")
                continue

            p1_fc = horus.preco_str_to_float(p1_str, decimais)

            # Sincroniza preço base com o banco se diferirem
            if abs(p1_fc - preco_base) > 0.001 and p1_fc > 0:
                db.atualizar_preco_base(bico["id"], p1_fc)
                preco_base = p1_fc
                log.info(f"[{nome}] Bico {bico_fc}: preço base atualizado para R$ {p1_fc:.{decimais}f}")

            # Envia preço com desconto ao concentrador (nível 1)
            preco_esperado = round(preco_base - desconto, decimais)
            if desconto > 0 and abs(horus.preco_str_to_float(_, decimais) - preco_esperado) > 0.001:
                if horus.set_preco(s, bico_fc, preco_base, desconto, grade=1, decimais=decimais):
                    log.info(f"[{nome}] Bico {bico_fc}: desconto aplicado → R$ {preco_esperado:.{decimais}f}")

        except Exception as e:
            log.error(f"[{nome}] Erro ao sincronizar bico {bico.get('bico_forecourt')}: {e}")

    # --- Sincronizar cartões RFID ---
    pendentes = db.get_cartoes_pendentes(posto_id)
    if not pendentes:
        return

    try:
        cartoes_fc: list[Identfid] = horus.get_lista_cartoes(s)
    except Exception as e:
        log.error(f"[{nome}] Erro ao listar cartões: {e}")
        return

    for cartao in pendentes:
        try:
            codigo = cartao["codigo"]
            ativo = cartao["ativo"]

            # Remove todas as ocorrências antigas do código no concentrador
            existentes = [idf for idf in cartoes_fc if idf.codigo == codigo]
            for idf in existentes:
                horus.delete_cartao(s, idf)

            # Grava cartão ativo
            if ativo:
                if horus.add_cartao(s, codigo, ativo=True, nivel=1):
                    log.info(f"[{nome}] Cartão {codigo} ({cartao['nome_funcionario']}) enviado")
                else:
                    log.warning(f"[{nome}] Falha ao enviar cartão {codigo}")
                    continue
            else:
                log.info(f"[{nome}] Cartão {codigo} removido do equipamento")

            db.marcar_cartao_sincronizado(cartao["id"])

        except Exception as e:
            log.error(f"[{nome}] Erro ao sincronizar cartão {cartao.get('codigo')}: {e}")


def loop_posto(posto: dict):
    host = posto.get("forecourt_ip")
    port = posto.get("forecourt_port")
    nome = posto["nome"]
    posto_id = posto["id"]

    if not host or not port:
        log.warning(f"[{nome}] IP/porta não configurados — ignorado")
        return

    s = dsock.DSocket()
    conectado = False

    while True:
        try:
            if s.is_socket_closed():
                if conectado:
                    log.warning(f"[{nome}] Conexão perdida — reconectando...")
                    conectado = False
                db.atualizar_status_posto(posto_id, False)
                del s
                s = dsock.DSocket()
                ret = s.tcpConnect(host, int(port))
                if ret == 0:
                    log.warning(f"[{nome}] Falha ao conectar em {host}:{port}")
                    time.sleep(INTERVALO)
                    continue
            else:
                if not conectado:
                    serial = horus.get_serial(s)
                    log.info(f"[{nome}] Conectado — serial: {serial}")
                    db.atualizar_status_posto(posto_id, True)
                    conectado = True
                sincronizar_posto(s, posto)

        except Exception as e:
            log.error(f"[{nome}] Erro inesperado: {e}")
            conectado = False

        time.sleep(INTERVALO)


def main():
    log.info("Serviço iniciado")
    postos = db.get_postos()
    log.info(f"{len(postos)} posto(s) encontrado(s)")

    threads = []
    for posto in postos:
        t = threading.Thread(
            target=loop_posto,
            args=(posto,),
            daemon=True,
            name=posto["nome"],
        )
        t.start()
        threads.append(t)

    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        log.info("Serviço encerrado")


if __name__ == "__main__":
    main()
