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


def sincronizar_precos(s: dsock.DSocket, posto: dict):
    nome = posto["nome"]
    posto_id = posto["id"]
    bicos = db.get_bicos_por_posto(posto_id)

    for bico in bicos:
        try:
            bico_fc = bico["bico_forecourt"]
            decimais = int(bico.get("decimais") or 3)
            desconto_n1 = float(bico.get("desconto_nivel1") or 0)
            desconto_n2 = float(bico.get("desconto_nivel2") or 0)

            p0_str, p1_str, p2_str = horus.get_preco(s, bico_fc)
            if p0_str is None:
                log.warning(f"[{nome}] Bico {bico_fc}: sem resposta")
                continue

            # Preço base lido do concentrador (nível 0 é sempre o preço tabela)
            preco_base_fc = horus.preco_str_to_float(p0_str, decimais)

            # Sincroniza preço base no banco se diferente
            preco_base_db = float(bico.get("preco_base") or 0)
            if preco_base_fc > 0 and abs(preco_base_fc - preco_base_db) > 0.001:
                db.atualizar_preco_base(bico["id"], preco_base_fc)
                preco_base_db = preco_base_fc
                log.info(f"[{nome}] Bico {bico_fc}: preço base atualizado → R$ {preco_base_fc:.{decimais}f}")

            # Sincroniza nível 1 (desconto padrão dos funcionários)
            if desconto_n1 > 0:
                esperado_n1 = round(preco_base_db - desconto_n1, decimais)
                atual_n1 = horus.preco_str_to_float(p1_str, decimais) if p1_str else 0
                if abs(atual_n1 - esperado_n1) > 0.001:
                    if horus.set_preco(s, bico_fc, preco_base_db, desconto_n1, grade=1, decimais=decimais):
                        log.info(f"[{nome}] Bico {bico_fc}: nível 1 → R$ {esperado_n1:.{decimais}f}")

            # Sincroniza nível 2 (desconto especial)
            if desconto_n2 > 0:
                esperado_n2 = round(preco_base_db - desconto_n2, decimais)
                atual_n2 = horus.preco_str_to_float(p2_str, decimais) if p2_str else 0
                if abs(atual_n2 - esperado_n2) > 0.001:
                    if horus.set_preco(s, bico_fc, preco_base_db, desconto_n2, grade=2, decimais=decimais):
                        log.info(f"[{nome}] Bico {bico_fc}: nível 2 → R$ {esperado_n2:.{decimais}f}")

        except Exception as e:
            log.error(f"[{nome}] Erro ao sincronizar bico {bico.get('bico_forecourt')}: {e}")


def sincronizar_cartoes(s: dsock.DSocket, posto: dict):
    nome = posto["nome"]
    posto_id = posto["id"]

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
            nivel = int(cartao.get("nivel") or 1)
            # nivel 0 = sem desconto (preço tabela), 1 = nível1, 2 = nível2
            nivel_concentrador = min(nivel, 2)

            # Remove todas as ocorrências antigas do código no concentrador
            existentes = [idf for idf in cartoes_fc if idf.codigo == codigo]
            for idf in existentes:
                horus.delete_cartao(s, idf)

            if ativo:
                if horus.add_cartao(s, codigo, ativo=True, nivel=nivel_concentrador):
                    log.info(f"[{nome}] Cartão {codigo} ({cartao['nome_funcionario']}) → nível {nivel_concentrador}")
                else:
                    log.warning(f"[{nome}] Falha ao enviar cartão {codigo}")
                    continue
            else:
                log.info(f"[{nome}] Cartão {codigo} removido")

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
                sincronizar_precos(s, posto)
                sincronizar_cartoes(s, posto)

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
