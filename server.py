import json
import pandas as pd
import os
from flask import Flask, jsonify, request, render_template
from google import genai
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
app = Flask(__name__)

client = genai.Client(api_key=API_KEY)

DATA_FILE = 'data.csv'
DEFAULT_DATA_FILE = 'extractDocument_20260805.csv'
RULES_FILE = 'rules.json'

def get_data_file_path():
    if os.path.exists(DATA_FILE):
        return DATA_FILE
    return DEFAULT_DATA_FILE

def load_rules():
    if os.path.exists(RULES_FILE):
        with open(RULES_FILE, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {}
    return {}

def save_rules(rules):
    with open(RULES_FILE, 'w', encoding='utf-8') as f:
        json.dump(rules, f, indent=4, ensure_ascii=False)

AI_CACHE_FILE = 'ai_cache.json'

def load_ai_cache():
    if os.path.exists(AI_CACHE_FILE):
        with open(AI_CACHE_FILE, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {}
    return {}

def save_ai_cache(cache):
    with open(AI_CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=4, ensure_ascii=False)

def get_all_categories(rules, ai_cache):
    base_categories = ["Supermercat", "Transport", "Oci", "Llar", "Subscripcions", "Ingressos", "Moviment Hucha", "Nòmina", "Altres"]
    all_cats = set(base_categories)
    for cat in rules.values(): all_cats.add(cat)
    for cat in ai_cache.values(): all_cats.add(cat)
    return sorted(list(all_cats))

def categoritzar_amb_ia(conceptes, available_categories):
    """Envia els conceptes a la IA i retorna un diccionari amb les categories."""
    if not conceptes: return {}
    prompt = f"""
    Actua com un expert financer. Categoritza els següents conceptes bancaris en una d'aquestes categories: 
    {available_categories}.
    
    Tingues en compte que els ingressos com 'NOMINA' van a 'Nòmina'.
    
    Retorna NOMÉS un diccionari en format JSON vàlid on la clau sigui el concepte exacte de la llista 
    i el valor sigui la categoria assignada. No afegeixis text addicional.
    
    Conceptes a categoritzar: {list(conceptes)}
    """
    try:
        response = client.models.generate_content(
            model='gemini-3.5-flash-lite',
            contents=prompt,
        )
        text_json = response.text.replace('```json', '').replace('```', '').strip()
        return json.loads(text_json)
    except Exception as e:
        print(f"Error parsejant la resposta de la IA: {e}")
        return {}

def process_data(start_date=None, end_date=None, filter_category=None):
    df = pd.read_csv(get_data_file_path(), sep=';')
    
    df['Importe'] = df['Importe'].astype(str).str.replace('EUR', '').str.replace('.', '', regex=False).str.replace(',', '.', regex=False).astype(float)
    df['Saldo'] = df['Saldo'].astype(str).str.replace('EUR', '').str.replace('.', '', regex=False).str.replace(',', '.', regex=False).astype(float)
    
    df['Fecha'] = pd.to_datetime(df['Fecha'], format='%d/%m/%Y')
    df['Mes'] = df['Fecha'].dt.strftime('%Y-%m')
    
    df['Tret_Hucha'] = df.apply(
        lambda row: row['Importe'] if 'HUCHA' in str(row['Concepto']).upper() and row['Importe'] > 0 else 0, 
        axis=1
    )
    
    rules = load_rules()
    ai_cache = load_ai_cache()
    available_categories = get_all_categories(rules, ai_cache)
    
    def apply_category(concepto):
        concepto_str = str(concepto)
        # Apply exact match from rules
        if concepto_str in rules:
            return rules[concepto_str]
        # Allow sub-string matching rule logic: if key is in concept (case insensitive)
        for rule_key, rule_cat in rules.items():
            if rule_key.lower() in concepto_str.lower():
                return rule_cat
        # Apply AI cache
        if concepto_str in ai_cache:
            return ai_cache[concepto_str]
        return None

    df['Categoria'] = df['Concepto'].apply(apply_category)
    
    uncategorized = df[df['Categoria'].isnull()]['Concepto'].dropna().unique()
    
    if len(uncategorized) > 0:
        print(f"Categoritzant {len(uncategorized)} conceptes amb IA...")
        ia_categories = categoritzar_amb_ia(uncategorized, available_categories)
        
        if ia_categories:
            ai_cache.update(ia_categories)
            save_ai_cache(ai_cache)
        
        # Mapejar-ho per aquells que encara no tenien categoria
        df.loc[df['Categoria'].isnull(), 'Categoria'] = df['Concepto'].map(ia_categories).fillna('Altres')
    
    # Apply filters
    if start_date:
        df = df[df['Fecha'] >= pd.to_datetime(start_date)]
    if end_date:
        df = df[df['Fecha'] <= pd.to_datetime(end_date)]
    if filter_category and filter_category != 'Totes':
        df = df[df['Categoria'] == filter_category]
    
    # Process summary
    # Despeses: Importe < 0 and not Hucha
    gastos_regulars = df[(df['Importe'] < 0) & (df['Categoria'] != 'Moviment Hucha')].copy()
    gastos_regulars['Importe'] = gastos_regulars['Importe'].abs()
    
    # Ingressos (sense nomina ni hucha)
    ingressos_altres = df[(df['Importe'] > 0) & (df['Categoria'] != 'Moviment Hucha') & (df['Categoria'] != 'Nòmina')].copy()
    
    # Nòmina
    ingressos_nomina = df[(df['Importe'] > 0) & (df['Categoria'] == 'Nòmina')].copy()

    total_despeses_mes = gastos_regulars.groupby('Mes')['Importe'].sum().reset_index().rename(columns={'Importe': 'Despeses'})
    total_nomina_mes = ingressos_nomina.groupby('Mes')['Importe'].sum().reset_index().rename(columns={'Importe': 'Nomina'})
    total_altres_ing = ingressos_altres.groupby('Mes')['Importe'].sum().reset_index().rename(columns={'Importe': 'Altres_Ingressos'})
    
    resum_hucha = df.groupby('Mes')['Tret_Hucha'].sum().reset_index().rename(columns={'Tret_Hucha': 'Hucha_Extreta'})

    resum_mensual = pd.merge(total_nomina_mes, total_despeses_mes, on='Mes', how='outer').fillna(0)
    resum_mensual = pd.merge(resum_mensual, total_altres_ing, on='Mes', how='outer').fillna(0)
    resum_mensual = pd.merge(resum_mensual, resum_hucha, on='Mes', how='outer').fillna(0)
    
    resum_mensual['Balanç_vs_Nomina'] = resum_mensual['Nomina'] - resum_mensual['Despeses']
    resum_mensual['Balanç_Total'] = (resum_mensual['Nomina'] + resum_mensual['Altres_Ingressos']) - resum_mensual['Despeses']

    # Convert to dict
    transactions = df.fillna("").to_dict(orient='records')
    summary = resum_mensual.to_dict(orient='records')
    
    cat_summary = gastos_regulars.groupby('Categoria')['Importe'].sum().reset_index().to_dict(orient='records')
    cat_trend = gastos_regulars.groupby(['Mes', 'Categoria'])['Importe'].sum().reset_index().to_dict(orient='records')
    
    cat_details = gastos_regulars.groupby(['Categoria', 'Concepto'])['Importe'].sum().reset_index()
    cat_details = cat_details.sort_values(by=['Categoria', 'Importe'], ascending=[True, False]).to_dict(orient='records')
    
    return transactions, summary, cat_summary, cat_trend, cat_details

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def get_data():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    category = request.args.get('category')
    
    transactions, summary, cat_summary, cat_trend, cat_details = process_data(start_date, end_date, category)
    rules = load_rules()
    ai_cache = load_ai_cache()
    categories = get_all_categories(rules, ai_cache)
    return jsonify({
        'transactions': transactions,
        'summary': summary,
        'rules': rules,
        'categories': categories,
        'cat_summary': cat_summary,
        'cat_trend': cat_trend,
        'cat_details': cat_details
    })

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and file.filename.endswith('.csv'):
        file.save(DATA_FILE)
        return jsonify({'success': True, 'message': 'Fitxer pujat correctament'})
    
    return jsonify({'error': 'Invalid file format. Must be CSV.'}), 400

@app.route('/api/rules', methods=['POST'])
def add_rule():
    data = request.json
    concept = data.get('concept')
    category = data.get('category')
    
    if concept and category:
        rules = load_rules()
        rules[concept] = category
        save_rules(rules)
        return jsonify({'status': 'ok'})
    return jsonify({'status': 'error', 'message': 'Missing data'}), 400

@app.route('/api/rules', methods=['DELETE'])
def delete_rule():
    data = request.json
    concept = data.get('concept')
    if concept:
        rules = load_rules()
        if concept in rules:
            del rules[concept]
            save_rules(rules)
        return jsonify({'status': 'ok'})
    return jsonify({'status': 'error'}), 400

if __name__ == '__main__':
    app.run(debug=True, port=5000)
