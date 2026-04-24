import os
import time
import threading
import logging
from dotenv import load_dotenv

import database as db
import horus

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

INTERVALO = int(os.getenv("INTERVALO_SEGUNDOS", "10"))


def sincronizar_posto(posto: dict):
    host = posto.get("forecourt_ip")
    port = posto.get("forecourt_port")
    posto_id = posto["id"]
    nome = posto["nome"]

    if not host or not port:
        return

    try:
        serial = horus.get_serial(host, port)
        log.info(f"[{nome}] Conectado — serial: {serial}")
        db.atualizar_status_posto(posto_id, True)
    except Exception as e:
        log.warning(f"[{nome}] Sem conexão: {e}")
        db.atualizar_status_posto(posto_id, False)
        return

    # --- Sincronizar preços ---
    bicos = db.get_bicos_por_posto(posto_id)
    for bico in bicos:
        try:
            bico_fc = bico["bico_forecourt"]
            produto_id = bico["produto_id"]
            preco_base = float(bico["preco_base"])
            desconto = db.get_desconto(posto_id, produto_id)
            decimais = bico.get("decimais", 3)

            _, p1_fc, p2_fc = horus.get_preco(host, port, bico_fc)

            preco_esperado = round(preco_base - desconto, decimais)

            if abs(p1_fc - preco_esperado) > 0.001:
                horus.set_preco(host, port, bico_fc, preco_base, desconto, nivel=1, decimais=decimais)
                log.info(f"[{nome}] Bico {bico_fc}: preço atualizado → R$ {preco_esperado:.{decimais}f}")

        except Exception as e:
            log.error(f"[{nome}] Erro ao sincronizar bico {bico.get('bico_forecourt')}: {e}")

    # --- Sincronizar cartões RFID ---
    pendentes = db.get_cartoes_pendentes(posto_id)
    if not pendentes:
        return

    try:
        cartoes_fc = horus.get_lista_cartoes(host, port)
    except Exception as e:
        log.error(f"[{nome}] Erro ao listar cartões: {e}")
        return

    for cartao in pendentes:
        try:
            codigo = cartao["codigo"]
            ativo = cartao["ativo"]

            if not ativo and codigo in cartoes_fc:
                horus.delete_cartao(host, port, codigo)
                log.info(f"[{nome}] Cartão {codigo} removido do equipamento")
            elif ativo:
                horus.add_cartao(host, port, codigo, True)
                log.info(f"[{nome}] Cartão {codigo} ({cartao['nome_funcionario']}) enviado")

            db.marcar_cartao_sincronizado(cartao["id"])

        except Exception as e:
            log.error(f"[{nome}] Erro ao sincronizar cartão {cartao.get('codigo')}: {e}")


def loop_posto(posto: dict):
    while True:
        try:
            sincronizar_posto(posto)
        except Exception as e:
            log.error(f"Erro inesperado no posto {posto.get('nome')}: {e}")
        time.sleep(INTERVALO)


def main():
    log.info("Serviço iniciado")
    postos = db.get_postos()
    log.info(f"{len(postos)} posto(s) encontrado(s)")

    threads = []
    for posto in postos:
        t = threading.Thread(target=loop_posto, args=(posto,), daemon=True, name=posto["nome"])
        t.start()
        threads.append(t)

    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        log.info("Serviço encerrado")


if __name__ == "__main__":
    main()
