import os
import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv

def main():
    print("🚀 Iniciant sincronització cap a Supabase...")
    
    # 1. Connect to Local DB
    local_engine = create_engine("sqlite:///local.db")
    
    # 2. Connect to Remote DB
    load_dotenv()
    remote_url = os.getenv("DATABASE_URL")
    
    if not remote_url or remote_url.startswith("sqlite"):
        print("❌ ERROR: No s'ha trobat cap DATABASE_URL de Postgres al fitxer .env.")
        print("👉 Assegura't de posar la URL de Supabase al teu .env com a DATABASE_URL abans d'executar això.")
        return
        
    if remote_url.startswith("postgres://"):
        remote_url = remote_url.replace("postgres://", "postgresql://", 1)
        
    try:
        remote_engine = create_engine(remote_url)
        # Test connection
        remote_engine.connect().close()
        print("✅ Connexió amb Supabase establerta.")
    except Exception as e:
        print(f"❌ Error connectant a Supabase. Revisa la URL: {e}")
        return
    
    # 3. Transfer Tables
    tables = ['rules', 'ai_cache', 'transactions']
    
    for table in tables:
        try:
            print(f"\n📦 Llegint dades locals de la taula '{table}'...")
            df = pd.read_sql_table(table, local_engine)
            
            if df.empty:
                print(f"  -> La taula '{table}' està buida a l'ordinador. Ometent.")
                continue
                
            print(f"☁️ Pujant {len(df)} registres a Supabase...")
            df.to_sql(table, remote_engine, if_exists='replace', index=False)
            print(f"  ✅ Taula '{table}' sincronitzada correctament!")
            
        except ValueError:
            print(f"  -> La taula local '{table}' no existeix a local.db. Ometent.")
        except Exception as e:
            print(f"  ❌ Error pujant la taula '{table}': {e}")

    print("\n🎉 Sincronització completada amb èxit! Les teves dades i regles ja estan al núvol.")

if __name__ == "__main__":
    main()
