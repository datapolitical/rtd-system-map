#!/usr/bin/env python3
"""Satellite overlay for map QA.

Esri World Imagery with OpenStreetMap shapes and the map's own stops,
rail lines, terminals, structures and stations drawn on top, so a
builder or reviewer can check that what the map draws sits on the real
structure in the photo.

Usage: python3 qa/sat/render.py DATA_DIR OUT.png [W,S,E,N]

DATA_DIR holds the map's built data (public/data/ or a downloaded
preview's /data/): routes.geojson, stops.geojson, stations.geojson,
and, when present, terminals.geojson and structures.geojson. If no
bounds are given, Union Station is used.

Needs only the standard library and Pillow::

    pip install Pillow
    python3 qa/sat/render.py public/data/ qa/.scratch/sat-union.png
    python3 qa/sat/render.py public/data/ qa/.scratch/sat-civic.png -104.98832,39.73977,-104.98508,39.74233

Tile and OSM requests carry identifying user agents. The OSM export
for a bounds is cached beside the output image (<OUT>.osm.json).
"""
import json, math, io, urllib.request, sys, os

# usage: python3 render.py DATA_DIR OUT.png [W,S,E,N]
# Satellite (Esri World Imagery) with OSM shapes and the map's own stops and rail lines on top.
DATA = sys.argv[1].rstrip('/') + '/'; OUT = sys.argv[2]
from PIL import Image, ImageDraw, ImageFont
W,S,E,N = [float(v) for v in sys.argv[3].split(',')] if len(sys.argv)>3 else (-105.0052, 39.7517, -104.9988, 39.7566)
Z=18
def px(lon,lat):
    n=2**Z; x=(lon+180)/360*n*256
    y=(1-math.log(math.tan(math.radians(lat))+1/math.cos(math.radians(lat)))/math.pi)/2*n*256
    return x,y
x0,y0=px(W,N); x1,y1=px(E,S)
tx0,ty0,tx1,ty1=int(x0//256),int(y0//256),int(x1//256),int(y1//256)
img=Image.new('RGB',((tx1-tx0+1)*256,(ty1-ty0+1)*256))
for tx in range(tx0,tx1+1):
    for ty in range(ty0,ty1+1):
        u=f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}'
        r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'rtd-system-map-qa'}),timeout=30)
        img.paste(Image.open(io.BytesIO(r.read())).convert('RGB'),((tx-tx0)*256,(ty-ty0)*256))
img=img.crop((int(x0-tx0*256),int(y0-ty0*256),int(x1-tx0*256),int(y1-ty0*256)))
SC=1.5; img=img.resize((int(img.width*SC),int(img.height*SC)))
def P(lon,lat):
    x,y=px(lon,lat); return ((x-x0)*SC,(y-y0)*SC)
d=ImageDraw.Draw(img,'RGBA')
try: F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',13)
except: F=None
osmf = OUT + '.osm.json'
if not os.path.exists(osmf):
    u=f'https://api.openstreetmap.org/api/0.6/map.json?bbox={W},{S},{E},{N}'
    open(osmf,'wb').write(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'rtd-system-map/1.0 (+https://github.com/datapolitical/rtd-system-map)'}),timeout=120).read())
osm=json.load(open(osmf))['elements']
nodes={e['id']:(e['lon'],e['lat']) for e in osm if e['type']=='node' and 'lon' in e}
def way(e): return [nodes[n] for n in e.get('nodes',[]) if n in nodes]
for e in osm:
    if e['type']!='way': continue
    t=e.get('tags',{}); pts=way(e)
    if len(pts)<2: continue
    xy=[P(*p) for p in pts]
    if t.get('railway')=='platform' or t.get('public_transport')=='platform':
        c=(0,255,255,255) if t.get('light_rail')=='yes' or 'Track 1' in t.get('name','') and len(t.get('name',''))>17 else (255,0,255,255)
        d.line(xy,fill=c,width=3)
    elif t.get('building')=='train_station' or (t.get('building') and 'Union Station' in t.get('name','') and 'One' not in t.get('name','')):
        d.line(xy,fill=(255,230,0,255),width=4)
        d.text(xy[0],t.get('name',''),fill=(255,230,0),font=F)
    elif t.get('amenity')=='bus_station' or t.get('highway')=='busway' or (t.get('tunnel') and t.get('highway') in ('service','busway')):
        d.line(xy,fill=(0,255,0,255),width=4)
    elif 'building:part' in t or t.get('building')=='roof':
        d.line(xy,fill=(255,140,0,230),width=2)
    elif t.get('railway') in ('rail','light_rail'):
        d.line(xy,fill=(255,255,255,90),width=1)
# map data from the preview build
data=DATA
for f in json.load(open(data+'routes.geojson'))['features']:
    p=f['properties']; g=f['geometry']
    rail = str(p.get('mode','')+p.get('kind','')+p.get('type','')).lower()
    if not any(k in rail for k in ('rail','train')): continue
    lines=g['coordinates'] if g['type']=='MultiLineString' else [g['coordinates']]
    col=p.get('color') or '#ff4040'
    if not col.startswith('#'): col='#'+col
    for ln in lines: d.line([P(*c) for c in ln],fill=col,width=3)
for f in json.load(open(data+'stops.geojson'))['features']:
    lon,lat=f['geometry']['coordinates']; n=f['properties']['name']
    if not (S<lat<N and W<lon<E): continue
    x,y=P(lon,lat)
    if 'Track' in n:
        d.ellipse((x-6,y-6,x+6,y+6),fill=(255,40,40,255),outline='white'); d.text((x+8,y-7),n.replace('Union Station ',''),fill=(255,120,120),font=F)
    elif 'Union Station' in n:
        d.ellipse((x-4,y-4,x+4,y+4),fill=(255,255,255,255)); d.text((x+6,y-6),n.replace('Union Station','US').replace('Gate ',''),fill='white',font=F)
    else:
        d.ellipse((x-3,y-3,x+3,y+3),outline=(200,200,200,255))
def dash(dr, xy, fill, width=3, on=6, off=5):
    import math as _m
    for i in range(len(xy)-1):
        (x1,y1),(x2,y2)=xy[i],xy[i+1]
        L=_m.hypot(x2-x1,y2-y1); t=0
        while t<L:
            u=min(1,(t+on)/L) if L else 1
            dr.line([(x1+(x2-x1)*t/L,y1+(y2-y1)*t/L),(x1+(x2-x1)*u,y1+(y2-y1)*u)],fill=fill,width=width)
            t+=on+off
try:
    for f in json.load(open(data+'terminals.geojson'))['features']:
        g=f['geometry']; polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        under=bool(f['properties'].get('underground'))
        for poly in polys:
            xy=[P(*c) for c in poly[0]]
            if under: dash(d,xy,(255,0,0,255),width=4)
            else: d.line(xy,fill=(255,0,0,255),width=5)
except FileNotFoundError: pass
# The map's new station shapes: platforms, canopies and the station building.
try:
    for f in json.load(open(data+'structures.geojson'))['features']:
        k=f['properties'].get('kind'); g=f['geometry']
        polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        col=(0,90,255,255) if k=='platform' else ((0,220,255,255) if k=='canopy' else (255,230,0,255))
        w=2 if k=='canopy' else 3
        for poly in polys: d.line([P(*c) for c in poly[0]],fill=col,width=w)
except FileNotFoundError: pass
for f in json.load(open(data+'stations.geojson'))['features']:
    lon,lat=f['geometry']['coordinates']
    if S<lat<N and W<lon<E:
        x,y=P(lon,lat); d.ellipse((x-11,y-11,x+11,y+11),outline=(255,255,0),width=3)
d.rectangle((0,0,560,140),fill=(0,0,0,170))
for i,(c,s) in enumerate([((255,230,0),'OSM Union Station building / map station building'),((255,140,0),'OSM building parts/roofs'),((0,255,255),'OSM light-rail platform'),((255,0,255),'OSM other platform'),((0,255,0),'OSM bus station / bus tunnel'),((0,90,255),'map platform'),((0,220,255),'map canopy'),((255,0,0),'map terminal (dashed = below ground)'),((255,40,40),'map rail stop (GTFS)  white = map bus gate; yellow ring = station point')]):
    d.text((8,4+i*14),s,fill=c,font=F)
img.save(OUT); print(img.size)
