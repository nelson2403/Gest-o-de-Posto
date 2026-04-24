# Como Rodar o Sistema

## 1. Supabase (Banco de Dados)

1. Acesse https://supabase.com e crie um projeto
2. Vá em **SQL Editor** e execute o conteúdo de `database/schema.sql`
3. Anote:
   - **Project URL** (Settings → API → URL)
   - **service_role key** (Settings → API → Project API keys)

---

## 2. Backend (API NestJS)

```bash
cd api
npm install
cp .env.example .env
# Edite .env com suas credenciais do Supabase e um JWT_SECRET forte
npm run start:dev
```

API disponível em: http://localhost:3001  
Documentação: http://localhost:3001/docs

---

## 3. Frontend (React)

```bash
cd web
npm install
cp .env.example .env
# Edite .env se a API não for localhost:3001
npm run dev
```

Acesse: http://localhost:3000

Login padrão: `admin@sistema.com`  
(Crie o hash da senha no Supabase ou use a API para criar o primeiro admin)

---

## 4. Serviço Python (Comunicação com Equipamentos)

```bash
cd service
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env
# Edite .env com URL e service key do Supabase
python main.py
```

---

## Criar o primeiro usuário admin

No SQL Editor do Supabase, execute:

```sql
INSERT INTO usuarios (email, senha_hash, nome, role)
VALUES (
  'admin@sistema.com',
  -- Gere o hash com: python -c "import bcrypt; print(bcrypt.hashpw(b'SuaSenha123', bcrypt.gensalt(12)).decode())"
  '$2b$12$SEU_HASH_AQUI',
  'Administrador',
  2
);
```
