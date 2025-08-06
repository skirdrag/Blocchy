import webview
import os
import re
import webbrowser
import json
from flask import Flask, render_template, request, jsonify
from threading import Thread
from waitress import serve # NUOVA IMPORTAZIONE: Il server veloce

# --- Configurazione dei percorsi ---
APPDATA_PATH = os.getenv('APPDATA')
BLOCCHY_DATA_DIR = os.path.join(APPDATA_PATH, 'Blocchy')
NOTES_DIR = os.path.join(BLOCCHY_DATA_DIR, 'notes')
CONFIG_FILE_PATH = os.path.join(BLOCCHY_DATA_DIR, 'config.json')

# Variabile globale per mantenere l'ultimo stato conosciuto dalla UI
_last_known_state = {}

def load_config():
    """Carica la configurazione da config.json, usa i default se non esiste."""
    global _last_known_state
    try:
        with open(CONFIG_FILE_PATH, 'r') as f:
            config = json.load(f)
            config.setdefault('window', {})
            config.setdefault('ui', {})
            _last_known_state = config
            return config
    except (FileNotFoundError, json.JSONDecodeError):
        default_config = {'window': {}, 'ui': {}}
        _last_known_state = default_config
        return default_config

# --- BACKEND CON FLASK ---
app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# --- API PER IL FRONTEND ---
class Api:
    def __init__(self):
        if not os.path.exists(NOTES_DIR):
            os.makedirs(NOTES_DIR, exist_ok=True)

    def sync_state(self, state):
        """Sincronizza lo stato ricevuto dal frontend nella variabile globale."""
        global _last_known_state
        # I messaggi di debug sono stati rimossi da qui
        if 'window' in state:
            _last_known_state.setdefault('window', {}).update(state['window'])
        if 'ui' in state:
            _last_known_state.setdefault('ui', {}).update(state['ui'])

    def get_config(self):
        """Restituisce la configurazione corrente al frontend."""
        return _last_known_state

    # ... (le altre funzioni dell'API non cambiano) ...
    def open_external_link(self, url):
        try:
            webbrowser.open(url)
            return {'status': 'success'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_notes(self):
        try:
            notes = [f for f in os.listdir(NOTES_DIR) if f.endswith('.md')]
            return sorted([note.replace('.md', '') for note in notes])
        except Exception as e:
            return []

    def get_note_content(self, filename):
        try:
            if not filename.endswith('.md'): filename += '.md'
            filepath = os.path.join(NOTES_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as f: return f.read()
        except Exception as e: return {'error': str(e)}

    def save_note(self, data):
        filename, content = data['filename'], data['content']
        if '..' in filename or '/' in filename or '\\' in filename:
            return {'status': 'error', 'message': 'Nome file non valido.'}
        if not filename.endswith('.md'): filename += '.md'
        try:
            filepath = os.path.join(NOTES_DIR, filename)
            with open(filepath, 'w', encoding='utf-8') as f: f.write(content)
            return {'status': 'success', 'filename': filename.replace('.md', '')}
        except Exception as e: return {'status': 'error', 'message': str(e)}

    def delete_note(self, filename):
        try:
            if not filename.endswith('.md'): filename += '.md'
            filepath = os.path.join(NOTES_DIR, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
                return {'status': 'success'}
            else:
                return {'status': 'error', 'message': 'File non trovato.'}
        except Exception as e: return {'status': 'error', 'message': str(e)}
            
    def get_graph_data(self):
        notes = self.get_notes()
        nodes = [{'id': note, 'label': note} for note in notes]
        edges, link_pattern = [], re.compile(r'\[\[(.*?)\]\]')
        for note_name in notes:
            content = self.get_note_content(note_name)
            if isinstance(content, str):
                for link in link_pattern.findall(content):
                    if link in notes and note_name != link:
                        edge = {'from': note_name, 'to': link}
                        if edge not in edges: edges.append(edge)
        return {'nodes': nodes, 'edges': edges}

# --- ROUTE FLASK ---
@app.route('/')
def index():
    return render_template('index.html')

# --- AVVIO APPLICAZIONE ---
def run_flask():
    # MODIFICA: Usiamo il server veloce 'waitress' invece di app.run()
    serve(app, host='127.0.0.1', port=5000)

def on_closing():
    """Salva l'ultimo stato conosciuto nel file di configurazione."""
    global _last_known_state
    try:
        os.makedirs(BLOCCHY_DATA_DIR, exist_ok=True)
        with open(CONFIG_FILE_PATH, 'w') as f:
            json.dump(_last_known_state, f, indent=4)
        # Messaggio di debug rimosso anche da qui
    except Exception as e:
        print(f"Errore critico nel salvataggio della configurazione alla chiusura: {e}")

if __name__ == '__main__':
    api = Api()
    flask_thread = Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()

    config = load_config()
    window_config = config.get('window', {})

    window = webview.create_window(
        'Blocchy',
        'http://127.0.0.1:5000',
        js_api=api,
        width=window_config.get('width', 1200),
        height=window_config.get('height', 800),
        x=window_config.get('x', None),
        y=window_config.get('y', None),
        min_size=(800, 600),
        background_color='#171719'
    )

    window.events.closing += on_closing
    
    webview.start(debug=False)