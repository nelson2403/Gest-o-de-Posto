import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client = None

def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_KEY"),
        )
    return _client

def get_postos():
    res = get_client().table("postos").select("*").execute()
    return res.data or []

def get_bicos_por_posto(posto_id: str):
    res = (
        get_client()
        .table("bicos")
        .select("*, produtos(nome)")
        .eq("posto_id", posto_id)
        .execute()
    )
    return res.data or []

def get_desconto(posto_id: str, produto_id: str) -> float:
    res = (
        get_client()
        .table("descontos")
        .select("valor")
        .eq("posto_id", posto_id)
        .eq("produto_id", produto_id)
        .execute()
    )
    if res.data:
        return float(res.data[0]["valor"])
    return 0.0

def get_cartoes_pendentes(posto_id: str):
    res = (
        get_client()
        .table("cartoes")
        .select("*")
        .eq("posto_id", posto_id)
        .eq("sincronizado", False)
        .execute()
    )
    return res.data or []

def marcar_cartao_sincronizado(cartao_id: str):
    get_client().table("cartoes").update({"sincronizado": True}).eq("id", cartao_id).execute()

def atualizar_status_posto(posto_id: str, online: bool):
    get_client().table("postos").update({"online": online}).eq("id", posto_id).execute()

def registrar_venda(posto_id: str, venda: dict):
    get_client().table("vendas").insert({**venda, "posto_id": posto_id}).execute()
