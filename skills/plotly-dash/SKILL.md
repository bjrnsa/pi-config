---
name: plotly-dash
description: |
  Comprehensive skill for building Plotly Dash applications in Python. 
  Use whenever the user is creating dashboards, data visualization apps, 
  interactive web applications, or working with the Dash framework.
  
  Covers: Quickstart guide, Dash fundamentals (layout, components), 
  callbacks (basic, pattern-matching, clientside, background), 
  open-source component libraries (dcc, html, DataTable, Bio, Canvas, DAQ), 
  third-party libraries (Bootstrap, AG Grid, Leaflet, Cytoscape), 
  multi-page apps, data persistence, file uploads, production deployment.
  
  Triggers on: Dash, Plotly Dash, dashboard, interactive app, 
  data visualization web app, dcc components, callbacks, 
  Dash deployment, Dash Pages.
---

# Plotly Dash - Complete Development Guide

Build interactive data visualization web applications in pure Python.

---

## Quick Start

### Installation

```bash
# Core packages
pip install dash pandas plotly

# Optional but recommended
pip install dash-ag-grid  # Modern data tables
pip install numpy
```

### Minimal Working Example

```python
from dash import Dash, html, dcc, callback, Output, Input
import plotly.express as px
import pandas as pd

# Load data once at module level
df = pd.read_csv('https://raw.githubusercontent.com/plotly/datasets/master/gapminder_unfiltered.csv')

# Initialize app
app = Dash(__name__)

# Define layout (list syntax requires Dash 2.17+)
app.layout = [
    html.H1('My Dash App', style={'textAlign': 'center'}),
    dcc.Dropdown(df.country.unique(), 'Canada', id='dropdown-selection'),
    dcc.Graph(id='graph-content')
]

# Define callback
@callback(
    Output('graph-content', 'figure'),
    Input('dropdown-selection', 'value')
)
def update_graph(value):
    dff = df[df.country == value]
    return px.line(dff, x='year', y='pop')

# Run the app
if __name__ == '__main__':
    app.run(debug=True)  # Use debug=False in production
```

### Running the App

```bash
# Development (with hot reload)
python app.py

# Jupyter Notebooks (Dash 2.11+)
app.run(debug=True, jupyter_mode='tab')

# Production (with Gunicorn)
gunicorn app:server -b 0.0.0.0:8050 -w 4
```

### File Structure Conventions

**Simple app:**
```
my-dash-app/
├── app.py              # Main application
├── requirements.txt    # Dependencies
└── assets/             # Static files (CSS, images, JS)
    └── style.css
```

**Multi-file app:**
```
my-dash-app/
├── app.py              # App initialization
├── callbacks/          # Callback definitions
│   ├── __init__.py
│   └── data_callbacks.py
├── components/         # Reusable components
│   ├── __init__.py
│   └── charts.py
├── pages/              # Dash Pages (multi-page apps)
│   ├── __init__.py
│   ├── home.py
│   └── analytics.py
├── assets/
└── utils/
```

---

## Dash Fundamentals

### Layout System

The layout is a tree of components. Dash provides:
- `dash.html` - HTML tags (Div, H1, Button, etc.)
- `dash.dcc` - Interactive components (Graph, Dropdown, Store, etc.)

```python
from dash import Dash, html, dcc

app = Dash(__name__)

app.layout = html.Div([
    html.H1('Dashboard Title'),
    html.Div([
        dcc.Dropdown(['Option 1', 'Option 2'], id='dropdown'),
        dcc.Graph(id='graph')
    ], style={'padding': '20px'})
])
```

**Key differences from HTML:**
- `style` takes a dictionary with camelCase keys: `{'textAlign': 'center'}`
- `class` becomes `className` (reserved word in Python)
- `children` is the first argument (can be omitted)

### Dash Core Components (dcc)

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `dcc.Graph` | Display Plotly figures | `figure`, `config`, `id` |
| `dcc.Dropdown` | Select menu | `options`, `value`, `multi`, `searchable` |
| `dcc.Slider` | Numeric range | `min`, `max`, `step`, `value`, `marks` |
| `dcc.RangeSlider` | Dual-handle range | `value=[min, max]` |
| `dcc.Input` | Text/number input | `type`, `value`, `placeholder`, `debounce` |
| `dcc.Textarea` | Multi-line text | `value`, `rows` |
| `dcc.Checklist` | Multiple selection | `options`, `value`, `inline` |
| `dcc.RadioItems` | Single selection | `options`, `value`, `inline` |
| `dcc.DatePickerSingle` | Date selection | `date`, `min_date_allowed` |
| `dcc.DatePickerRange` | Date range | `start_date`, `end_date` |
| `dcc.Tabs` / `dcc.Tab` | Tabbed interface | `value`, `children` |
| `dcc.Store` | Browser storage | `data`, `storage_type` ('memory', 'local', 'session') |
| `dcc.Interval` | Periodic updates | `interval` (ms), `n_intervals` |
| `dcc.Location` | URL handling | `pathname`, `search`, `hash` |
| `dcc.Upload` | File upload | `contents`, `filename`, `multiple` |
| `dcc.Download` | File download | `data` |
| `dcc.Markdown` | Render markdown | `children`, `dangerously_allow_html` |
| `dcc.Loading` | Loading spinner | `children`, `type` ('graph', 'circle', 'dot') |
| `dcc.Tooltip` | Hover tooltips | `children`, `target_id` |

### Dash HTML Components (html)

```python
from dash import html

# Layout containers
html.Div(children, style={})
html.Span(children)
html.Section(children)

# Typography
html.H1(children)  # H1 through H6
html.P(children)
html.Strong(children)  # Bold
html.Em(children)      # Italic

# Lists
html.Ul([html.Li('Item 1'), html.Li('Item 2')])
html.Ol([html.Li('First'), html.Li('Second')])

# Tables
html.Table([
    html.Thead(html.Tr([html.Th('Col 1'), html.Th('Col 2')])),
    html.Tbody([
        html.Tr([html.Td('A1'), html.Td('B1')]),
        html.Tr([html.Td('A2'), html.Td('B2')])
    ])
])

# Interactive elements
html.Button('Click me', id='btn', n_clicks=0)
html.Img(src='/assets/image.png')
html.A('Link', href='https://example.com')
```

**All HTML components have `n_clicks` property for callbacks.**

### DataTable (Deprecated - Use Dash AG Grid)

⚠️ Dash DataTable is deprecated and will be removed in Dash 5.0. Migrate to `dash-ag-grid`.

```python
from dash import dash_table

dash_table.DataTable(
    data=df.to_dict('records'),
    columns=[{'name': i, 'id': i} for i in df.columns],
    sort_action='native',
    filter_action='native',
    page_action='native',
    page_size=10,
    row_selectable='single',
    editable=False
)
```

### Assets Folder

Files in `assets/` are automatically served:
- CSS files are auto-included
- Images referenced as `/assets/filename.png`
- JavaScript files loaded automatically

```python
# Reference image in assets/
html.Img(src='/assets/logo.png')
```

### Dash Initialization Options

```python
from dash import Dash

app = Dash(
    __name__,
    title='My App',
    suppress_callback_exceptions=True,  # For dynamic layouts
    external_stylesheets=['https://codepen.io/...css'],
    external_scripts=['https://example.com/script.js'],
    meta_tags=[{'name': 'viewport', 'content': 'width=device-width'}],
    update_title='Loading...',  # Or None to disable
    serve_locally=True,  # Use local assets vs CDN
)

# Access Flask server for production
server = app.server
```

---

## Dash Callbacks

### Basic Callback Pattern

```python
from dash import callback, Output, Input, State

@callback(
    Output('output-component', 'property'),
    Input('input-component', 'property')
)
def update_output(input_value):
    return f'You selected: {input_value}'
```

### Multiple Inputs and Outputs

```python
@callback(
    Output('graph1', 'figure'),
    Output('graph2', 'figure'),
    Output('text-output', 'children'),
    Input('dropdown', 'value'),
    Input('slider', 'value')
)
def update_all(dropdown_val, slider_val):
    # Return values in same order as Output declarations
    return fig1, fig2, f'Selected: {dropdown_val}'
```

### State (Form-like Behavior)

```python
from dash import State

@callback(
    Output('output', 'children'),
    Input('submit-btn', 'n_clicks'),
    State('input-field', 'value'),
    prevent_initial_call=True
)
def submit_form(n_clicks, input_value):
    if n_clicks:
        return f'You entered: {input_value}'
    return ''
```

### Callback Context

```python
from dash import callback_context as ctx

@callback(
    Output('output', 'children'),
    Input('btn-1', 'n_clicks'),
    Input('btn-2', 'n_clicks')
)
def handle_buttons(btn1, btn2):
    # Determine which input triggered the callback
    triggered_id = ctx.triggered_id  # 'btn-1' or 'btn-2'
    
    # Get all input values as dict
    all_inputs = ctx.inputs
    
    return f'Triggered by: {triggered_id}'
```

### Preventing Initial Calls

```python
@callback(
    Output('output', 'children'),
    Input('input', 'value'),
    prevent_initial_call=True  # Won't fire on app load
)
def update(value):
    return value
```

### Pattern-Matching Callbacks

For dynamic components with dictionary IDs:

```python
from dash import ALL, MATCH, Patch

# Add dynamic dropdowns
@callback(
    Output('container', 'children'),
    Input('add-btn', 'n_clicks'),
    prevent_initial_call=True
)
def add_dropdown(n):
    patched = Patch()
    new_dropdown = dcc.Dropdown(
        ['A', 'B', 'C'],
        id={'type': 'dynamic-dropdown', 'index': n}
    )
    patched.append(new_dropdown)
    return patched

# Respond to ALL dropdowns
@callback(
    Output('output', 'children'),
    Input({'type': 'dynamic-dropdown', 'index': ALL}, 'value')
)
def handle_all(values):
    # values is a list of all dropdown values
    return str(values)

# MATCH for 1:1 relationships
@callback(
    Output({'type': 'output', 'index': MATCH}, 'children'),
    Input({'type': 'input', 'index': MATCH}, 'value')
)
def handle_match(value):
    return value
```

| Selector | Use Case | Input Receives |
|----------|----------|----------------|
| `ALL` | Respond to any of many | List of all values |
| `MATCH` | 1:1 input/output | Single matching value |
| `ALLSMALLER` | Hierarchical relationships | List with smaller indices |

### Clientside Callbacks

Execute JavaScript in browser for instant response:

```python
from dash import clientside_callback

# Inline JavaScript
clientside_callback(
    """
    function(value) {
        return value.toUpperCase();
    }
    """,
    Output('output', 'children'),
    Input('input', 'value')
)

# External JS file (assets/clientside.js)
clientside_callback(
    ClientsideFunction(namespace='clientside', function_name='transform'),
    Output('output', 'children'),
    Input('input', 'value')
)
```

### Background Callbacks (Long Operations)

For operations longer than 30 seconds:

```python
from dash import DiskcacheManager, CeleryManager
import diskcache

# Local development with DiskCache
cache = diskcache.Cache('./cache')
background_manager = DiskcacheManager(cache)

# Production with Celery + Redis
# celery_app = Celery(__name__, broker='redis://localhost:6379')
# background_manager = CeleryManager(celery_app)

app = Dash(__name__, background_callback_manager=background_manager)

@callback(
    Output('output', 'children'),
    Input('btn', 'n_clicks'),
    background=True,
    manager=background_manager,
    running=[(Output('btn', 'disabled'), True, False)],  # Disable during run
    progress=[Output('progress', 'value'), Output('progress', 'max')],
    cancel=[Input('cancel-btn', 'n_clicks')],  # Cancel button
    prevent_initial_call=True
)
def long_operation(set_progress, n_clicks):
    for i in range(10):
        set_progress((str(i), str(10)))
        time.sleep(1)
    return 'Complete!'
```

### Error Handling

```python
from dash.exceptions import PreventUpdate
from dash import no_update

@callback(
    Output('output', 'children'),
    Output('error', 'children'),
    Input('input', 'value')
)
def safe_callback(value):
    try:
        if value is None:
            raise PreventUpdate  # Don't update anything
        
        result = process(value)
        return result, ''
    except ValueError as e:
        return no_update, f'Error: {str(e)}'  # Partial update
```

---

## Open Source Component Libraries

### Dash Bio (Bioinformatics)

```bash
pip install dash-bio
```

| Component | Purpose |
|-----------|---------|
| `Molecule3dViewer` | 3D molecular structures |
| `Molecule2dViewer` | 2D chemical structures |
| `Igv` | Genome browser |
| `Pileup` | Sequence alignments |
| `SequenceViewer` | DNA/protein sequences |
| `AlignmentChart` | Multiple sequence alignment |
| `NeedlePlot` | Mutation lollipop plots |
| `OncoPrint` | Cancer genomics |
| `Circos` | Circular genome visualization |
| `Ideogram` | Chromosome bands |

### Dash Canvas (Image Annotation)

```bash
pip install dash-canvas
```

```python
import dash_canvas as dashcanvas

canvas = dashcanvas.DashCanvas(
    id='canvas',
    image_content=img_data,  # Base64 encoded
    width=400,
    height=400,
    tool='rectangle',  # 'line', 'rectangle', 'pencil', 'pan', 'select'
    lineWidth=2,
    lineColor='#FF0000'
)
```

### Dash DAQ (Data Acquisition)

```bash
pip install dash-daq
```

```python
import dash_daq as daq

# Gauges and displays
daq.Gauge(value=65, min=0, max=100, label='Temperature')
daq.LEDDisplay(value='1234')
daq.GraduatedBar(value=75, max=100)
daq.Tank(value=50, min=0, max=100)

# Controls
daq.Knob(value=50, min=0, max=100)
daq.Joystick(angle=45, force=0.5)
daq.BooleanSwitch(on=True)
daq.ColorPicker(value={'hex': '#FF0000'})

# Buttons
daq.PowerButton(on=True)
daq.StopButton(n_clicks=0)
```

---

## Third-Party Libraries

### Dash Bootstrap Components

```bash
pip install dash-bootstrap-components
```

```python
import dash_bootstrap_components as dbc

app = Dash(__name__, external_stylesheets=[dbc.themes.BOOTSTRAP])

layout = dbc.Container([
    dbc.NavbarSimple(brand='My App', color='primary', dark=True),
    dbc.Row([
        dbc.Col(dbc.Card([dbc.CardHeader('Title'), dbc.CardBody('Content')]), width=4),
        dbc.Col(dbc.Alert('Success!', color='success'), width=8)
    ]),
    dbc.Button('Submit', color='primary', className='me-1')
], fluid=True)
```

**Themes:** BOOTSTRAP, CERULEAN, COSMO, CYBORG, DARKLY, FLATLY, etc.

### Dash AG Grid (Modern Tables)

```bash
pip install dash-ag-grid
```

```python
import dash_ag_grid as dag

dag.AgGrid(
    id='grid',
    rowData=df.to_dict('records'),
    columnDefs=[{'field': col} for col in df.columns],
    dashGridOptions={'pagination': True, 'paginationPageSize': 10},
    className='ag-theme-alpine'
)
```

### Dash Leaflet (Maps)

```bash
pip install dash-leaflet
```

```python
import dash_leaflet as dl

dl.Map([
    dl.TileLayer(),
    dl.Marker(position=[56, 10], children=dl.Tooltip('Copenhagen')),
    dl.Circle(center=[55.7, 12.6], radius=5000)
], center=[56, 10], zoom=6, style={'height': '50vh'})
```

### Dash Cytoscape (Network Graphs)

```bash
pip install dash-cytoscape
```

```python
import dash_cytoscape as cyto

cyto.Cytoscape(
    id='cytoscape',
    elements=[
        {'data': {'id': 'a', 'label': 'Node A'}},
        {'data': {'id': 'b', 'label': 'Node B'}},
        {'data': {'id': 'ab', 'source': 'a', 'target': 'b'}}
    ],
    layout={'name': 'cose'},  # or 'grid', 'circle', 'breadthfirst'
    stylesheet=[
        {'selector': 'node', 'style': {'content': 'data(label)', 'background-color': '#0074D9'}},
        {'selector': 'edge', 'style': {'line-color': '#ccc'}}
    ]
)
```

### Other Popular Libraries

| Library | Purpose | Install |
|---------|---------|---------|
| `dash-player` | Video/media player | `pip install dash-player` |
| `dash-pivottable` | Excel-like pivot tables | `pip install dash-pivottable` |
| `dash-chart-editor` | Visual chart builder (alpha) | `pip install dash-chart-editor` |
| `dash-slicer` | 3D medical imaging (alpha) | `pip install dash-slicer` |

**Note:** `dash-mantine-components` is covered by a separate skill for modern UI components.

---

## Beyond the Basics

### Multi-Page Apps with Dash Pages

```python
# app.py
import dash
from dash import Dash, html, dcc

app = Dash(__name__, use_pages=True)

app.layout = html.Div([
    # Navigation
    html.Div([
        dcc.Link(f"{page['name']}", href=page['relative_path'])
        for page in dash.page_registry.values()
    ]),
    # Page content renders here
    dash.page_container
])

if __name__ == '__main__':
    app.run(debug=True)
```

```python
# pages/home.py
import dash
from dash import html

dash.register_page(__name__, path='/', name='Home')

layout = html.Div('Home page content')
```

```python
# pages/analytics.py
import dash
from dash import html

dash.register_page(
    __name__,
    path='/analytics',
    path_template='/report/<report_id>',  # Dynamic routes
    name='Analytics',
    order=1
)

def layout(report_id=None, **kwargs):
    return html.Div(f'Report: {report_id}')
```

### Persistent Data Storage

**Client-side with dcc.Store:**

```python
# storage_type: 'memory' (default), 'local', 'session'
dcc.Store(id='store', data={'key': 'value'}, storage_type='local')
```

**Server-side with Flask-Caching:**

```python
from flask_caching import Cache

cache = Cache(app.server, config={
    'CACHE_TYPE': 'redis',
    'CACHE_REDIS_URL': 'redis://localhost:6379'
})

@callback(Output('output', 'children'), Input('input', 'value'))
@cache.memoize(timeout=300)
def expensive_function(value):
    # Result cached for 5 minutes
    return result
```

### File Uploads

```python
import base64
import io

def parse_contents(contents, filename):
    content_type, content_string = contents.split(',')
    decoded = base64.b64decode(content_string)
    
    if 'csv' in filename:
        return pd.read_csv(io.StringIO(decoded.decode('utf-8')))
    elif 'xlsx' in filename:
        return pd.read_excel(io.BytesIO(decoded))

@callback(
    Output('output', 'children'),
    Input('upload', 'contents'),
    Input('upload', 'filename')
)
def update_output(contents, filenames):
    if contents:
        df = parse_contents(contents[0], filenames[0])
        return html.Div(f'Loaded {len(df)} rows')
```

### File Downloads

```python
import dash

@callback(
    Output('download', 'data'),
    Input('btn', 'n_clicks'),
    prevent_initial_call=True
)
def download(n_clicks):
    df = get_data()
    return dash.send_data_frame(df.to_csv, 'data.csv')
    # Or: dash.send_file('./report.pdf')
    # Or: dict(content='text', filename='file.txt')
```

### URL Routing

```python
@callback(
    Output('page-content', 'children'),
    Input('url', 'pathname')
)
def display_page(pathname):
    if pathname == '/analytics':
        return analytics_layout
    return home_layout
```

### Authentication (Basic)

```python
import dash_auth

VALID_PAIRS = {'admin': 'password123', 'user': 'password456'}
auth = dash_auth.BasicAuth(app, VALID_PAIRS)

# With public routes
auth = dash_auth.BasicAuth(
    app, VALID_PAIRS,
    public_routes=['/', '/public-info']
)
```

---

## Production Capabilities

### Development vs Production

| Development | Production |
|-------------|------------|
| `debug=True` | `debug=False` |
| `host='127.0.0.1'` | `host='0.0.0.0'` |
| Flask dev server | Gunicorn WSGI server |
| Hot reload | No reload |
| Local assets | CDN/assets optimization |

### WSGI Deployment with Gunicorn

```python
# app.py - expose Flask server
from dash import Dash

app = Dash(__name__)
server = app.server  # Critical for Gunicorn

app.layout = ...
```

```bash
# Basic
pip install gunicorn
gunicorn app:server -b 0.0.0.0:8050 -w 4

# Production settings
# workers = (2 × CPU_CORES) + 1
gunicorn app:server \
    -b 0.0.0.0:8050 \
    -w 4 \
    --timeout 120 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile -
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Run with Gunicorn
CMD ["gunicorn", "app:server", "-b", "0.0.0.0:8050", "-w", "4"]
```

```
# .dockerignore
__pycache__
*.pyc
.env
.git/
venv/
```

### Cloud Deployment

**Heroku:**
```
# Procfile
web: gunicorn app:server --bind 0.0.0.0:$PORT
```

**Railway:**
- Automatically detects Python apps
- Set start command: `gunicorn app:server -b 0.0.0.0:$PORT`

**Render:**
```yaml
# render.yaml
services:
  - type: web
    name: dash-app
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:server -b 0.0.0.0:$PORT
```

**Google Cloud Run:**
```bash
gcloud run deploy dash-app \
  --image gcr.io/PROJECT/dash-app \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "DEBUG=false"
```

### Environment Variables

```python
import os

DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
PORT = int(os.environ.get('PORT', 8050))
HOST = os.environ.get('HOST', '0.0.0.0')
SECRET_KEY = os.environ.get('SECRET_KEY')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')

app = Dash(__name__)
app.server.secret_key = SECRET_KEY

if __name__ == '__main__':
    app.run(debug=DEBUG, host=HOST, port=PORT)
```

### Performance Tuning

**Caching with Flask-Caching:**
```python
from flask_caching import Cache

cache = Cache(app.server, config={
    'CACHE_TYPE': 'redis',
    'CACHE_REDIS_URL': os.environ.get('REDIS_URL')
})

@callback(Output('graph', 'figure'), Input('dropdown', 'value'))
@cache.memoize(timeout=3600)
def update_graph(value):
    return expensive_computation(value)
```

**Database Connection Pooling:**
```python
from sqlalchemy import create_engine

engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800
)
```

### Security Basics

```python
from flask_talisman import Talisman

# Security headers
Talisman(
    app.server,
    force_https=True,
    content_security_policy={
        'default-src': "'self'",
        'script-src': ["'self'", "'unsafe-eval'"],  # Required for Dash
        'style-src': ["'self'", "'unsafe-inline'"]   # Required for Dash
    }
)

# Generate secret key
import secrets
app.server.secret_key = secrets.token_hex(32)
```

### Health Check Endpoint

```python
from flask import jsonify

@app.server.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'version': '1.0.0'}), 200
```

---

## Common Patterns Quick Reference

### Loading State

```python
from dash import dcc

dcc.Loading(
    id='loading',
    type='circle',  # 'default', 'circle', 'dot', 'cube', 'graph'
    children=html.Div(id='chart-container')
)
```

### Debounced Input

```python
dcc.Input(id='search', type='text', debounce=True)  # Triggers on Enter/blur only
```

### Download Component

```python
html.Button('Download', id='btn'),
dcc.Download(id='download')

@callback(Output('download', 'data'), Input('btn', 'n_clicks'))
def download(n):
    return dash.send_data_frame(df.to_csv, 'data.csv')
```

### Theme Toggle (Clientside)

```python
app.clientside_callback(
    """(checked) => checked ? 'dark' : 'light'""",
    Output('theme-store', 'data'),
    Input('theme-toggle', 'checked')
)
```

---

## Resources

- **Official Documentation:** https://dash.plotly.com
- **Plotly Graphing:** https://plotly.com/python
- **Community Forum:** https://community.plotly.com
- **GitHub:** https://github.com/plotly/dash
- **Dash Bootstrap Components:** https://dash-bootstrap-components.opensource.faculty.ai
- **Dash AG Grid:** https://www.dash-ag-grid.com
- **Awesome Dash:** https://github.com/ucg8j/awesome-dash
