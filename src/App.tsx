import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline, Circle } from 'react-leaflet';
import { Trash2, Plus, MapPin, Filter, Menu, X, Save, Tag, Route, Check, Eraser, Download, Upload, Navigation, StopCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-control-geocoder';
import './App.css';

// Leafletのデフォルトアイコン設定
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// 地図の中心を自動更新するコンポーネント
function ChangeView({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

// 住所検索コンポーネント
function SearchControl() {
  const map = useMap();

  useEffect(() => {
    // @ts-ignore
    const geocoder = L.Control.Geocoder.nominatim();
    // @ts-ignore
    const control = L.Control.geocoder({
      query: '',
      placeholder: '住所または施設名を検索...',
      defaultMarkGeocode: false,
      geocoder
    })
      .on('markgeocode', function(e: any) {
        const latlng = e.geocode.center;
        map.setView(latlng, 16);
      })
      .addTo(map);

    return () => {
      map.removeControl(control);
    };
  }, [map]);

  return null;
}

// 型定義
interface MapMarker {
  id: string;
  position: [number, number];
  name: string;
  category: string;
}

interface MapRoute {
  id: string;
  name: string;
  points: [number, number][];
  color: string;
}

const DEFAULT_CATEGORIES = ["飲食店", "作業場所", "観光", "ショッピング", "その他"];
const MARKERS_STORAGE_KEY = 'map-app-markers';
const CATEGORIES_STORAGE_KEY = 'map-app-categories';
const ROUTES_STORAGE_KEY = 'map-app-routes';

// 地図クリックを処理するコンポーネント
function MapClickHandler({ onMapClick }: { onMapClick: (e: any) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e);
    },
  });
  return null;
}

function App() {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  
  // モード管理
  const [mode, setMode] = useState<'marker' | 'route' | 'tracking'>('marker');
  
  // マーカー入力用
  const [newMarkerPos, setNewMarkerPos] = useState<[number, number] | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputCategory, setInputCategory] = useState('');
  
  // 経路入力用（手動）
  const [currentRoutePoints, setCurrentRoutePoints] = useState<[number, number][]>([]);
  const [inputRouteName, setInputRouteName] = useState('');

  // トラッキング用（自動）
  const [isTracking, setIsTracking] = useState(false);
  const [trackingPath, setTrackingPath] = useState<[number, number][]>([]);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [followMe, setFollowMe] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  
  // UI状態
  const [visibleCategories, setVisibleCategories] = useState<string[]>([]);
  const [visibleRoutes, setVisibleRoutes] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // 初回読み込み
  useEffect(() => {
    const savedMarkers = localStorage.getItem(MARKERS_STORAGE_KEY);
    const savedCategories = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    const savedRoutes = localStorage.getItem(ROUTES_STORAGE_KEY);
    
    let loadedCategories = DEFAULT_CATEGORIES;
    if (savedCategories) {
      try {
        loadedCategories = JSON.parse(savedCategories);
        setCategories(loadedCategories);
      } catch (e) { console.error(e); }
    }
    
    if (savedMarkers) {
      try { setMarkers(JSON.parse(savedMarkers)); } catch (e) { console.error(e); }
    }

    if (savedRoutes) {
      try {
        const loadedRoutes = JSON.parse(savedRoutes);
        setRoutes(loadedRoutes);
        setVisibleRoutes(loadedRoutes.map((r: MapRoute) => r.id));
      } catch (e) { console.error(e); }
    }

    setVisibleCategories(loadedCategories);
    setInputCategory(loadedCategories[0]);
    setIsLoaded(true);
  }, []);

  // 自動保存
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
      localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routes));
    }
  }, [markers, categories, routes, isLoaded]);

  // トラッキング機能の実装
  useEffect(() => {
    if (isTracking) {
      if ("geolocation" in navigator) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const newPos: [number, number] = [latitude, longitude];
            setCurrentPosition(newPos);
            setTrackingPath(prev => {
              if (prev.length > 0) {
                const lastPos = prev[prev.length - 1];
                const distance = L.latLng(lastPos).distanceTo(L.latLng(newPos));
                if (distance < 3) return prev; // 3m未満の移動はノイズとして無視
              }
              return [...prev, newPos];
            });
          },
          (error) => {
            console.error("Tracking error:", error);
            alert("位置情報の取得に失敗しました。");
            setIsTracking(false);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        alert("Geolocation非対応ブラウザです。");
        setIsTracking(false);
      }
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTracking]);

  // 地図クリック時の挙動
  const handleMapClick = (e: any) => {
    const pos: [number, number] = [e.latlng.lat, e.latlng.lng];
    if (mode === 'marker') {
      setNewMarkerPos(pos);
    } else if (mode === 'route') {
      setCurrentRoutePoints([...currentRoutePoints, pos]);
    }
  };

  // マーカー登録
  const handleAddMarker = () => {
    if (newMarkerPos && inputName) {
      const newMarker: MapMarker = {
        id: crypto.randomUUID(),
        position: newMarkerPos,
        name: inputName,
        category: inputCategory || categories[0],
      };
      setMarkers([...markers, newMarker]);
      setNewMarkerPos(null);
      setInputName('');
    }
  };

  // 経路保存（共通）
  const saveRoute = (name: string, points: [number, number][]) => {
    if (points.length > 1 && name) {
      const newRoute: MapRoute = {
        id: crypto.randomUUID(),
        name,
        points,
        color: '#3b82f6',
      };
      setRoutes([...routes, newRoute]);
      setVisibleRoutes([...visibleRoutes, newRoute.id]);
      return true;
    }
    return false;
  };

  const handleSaveManualRoute = () => {
    if (saveRoute(inputRouteName, currentRoutePoints)) {
      setCurrentRoutePoints([]);
      setInputRouteName('');
    }
  };

  const handleSaveTrackingRoute = () => {
    const name = prompt("経路の名前を入力してください", `移動経路 ${new Date().toLocaleString()}`);
    if (name && trackingPath.length > 1) {
      if (saveRoute(name, trackingPath)) {
        setTrackingPath([]);
        setIsTracking(false);
      }
    } else if (trackingPath.length <= 1) {
      alert("経路が短すぎます。");
      setIsTracking(false);
      setTrackingPath([]);
    }
  };

  // 距離計算ヘルパー
  const calculateDistance = (points: [number, number][]) => {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      total += L.latLng(points[i]).distanceTo(L.latLng(points[i + 1]));
    }
    return total;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  // UIイベントハンドラー
  const handleDeleteMarker = (id: string) => setMarkers(markers.filter(m => m.id !== id));
  const handleDeleteRoute = (id: string) => {
    if (window.confirm("この経路を削除しますか？")) {
      setRoutes(routes.filter(r => r.id !== id));
      setVisibleRoutes(visibleRoutes.filter(rid => rid !== id));
    }
  };
  const handleUpdateMarkerCategory = (markerId: string, newCategory: string) => {
    setMarkers(markers.map(m => m.id === markerId ? { ...m, category: newCategory } : m));
  };
  const toggleCategory = (category: string) => setVisibleCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  const toggleRouteVisibility = (id: string) => setVisibleRoutes(prev => prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]);
  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories([...categories, trimmed]);
      setVisibleCategories([...visibleCategories, trimmed]);
      setNewCategoryName('');
    }
  };

  const handleExportData = () => {
    const data = { markers, categories, routes, version: 1, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map-app-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (window.confirm('現在のデータを上書きして復元しますか？')) {
          if (data.categories) { setCategories(data.categories); setVisibleCategories(data.categories); }
          if (data.markers) setMarkers(data.markers);
          if (data.routes) { setRoutes(data.routes); setVisibleRoutes(data.routes.map((r: any) => r.id)); }
          alert('データを復元しました。');
        }
      } catch (e) { alert('失敗しました。'); }
    };
    reader.readAsText(file);
  };

  const center: [number, number] = [35.681236, 139.767125];
  const filteredMarkers = markers.filter(m => visibleCategories.includes(m.category));
  const sortedCategories = [...categories].sort((a, b) => (a === "その他" ? 1 : b === "その他" ? -1 : a.localeCompare(b)));

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-100 font-sans text-gray-800">
      <header className="bg-slate-800 text-white p-3 shadow-lg z-30 flex justify-between items-center border-b border-slate-700">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-slate-700 rounded transition-colors">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <MapPin size={22} className="text-blue-400" />
            <h1 className="text-lg font-bold tracking-tight">Windows Map Manager</h1>
          </div>
        </div>
        
        <div className="flex bg-slate-700 p-1 rounded-lg">
          <button onClick={() => setMode('marker')} className={`px-4 py-1 rounded-md text-xs font-bold flex items-center gap-2 ${mode === 'marker' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><MapPin size={14} /> 地点</button>
          <button onClick={() => setMode('route')} className={`px-4 py-1 rounded-md text-xs font-bold flex items-center gap-2 ${mode === 'route' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Route size={14} /> 経路</button>
          <button onClick={() => setMode('tracking')} className={`px-4 py-1 rounded-md text-xs font-bold flex items-center gap-2 ${mode === 'tracking' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Navigation size={14} /> 追跡</button>
        </div>

        <div className="hidden sm:flex items-center gap-4">
          {isTracking && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-900/50 border border-red-700 rounded-full animate-pulse">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-xs font-bold text-red-200">{formatDistance(calculateDistance(trackingPath))}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs bg-slate-700 px-3 py-1 rounded-full text-slate-300 border border-slate-600">
            <Save size={14} className="text-green-400" /><span>自動保存</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <aside className={`${isSidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 bg-white border-r z-20 flex flex-col shadow-xl overflow-hidden`}>
          <div className="p-4 flex flex-col h-full min-w-[288px]">
            
            {mode === 'tracking' && (
              <div className="mb-6 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <h3 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2"><Navigation size={16} /> GPS追跡</h3>
                {!isTracking ? (
                  <button onClick={() => { setIsTracking(true); setTrackingPath([]); setFollowMe(true); }} className="w-full bg-indigo-600 text-white rounded py-2 font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm"><Navigation size={16} /> 開始</button>
                ) : (
                  <div className="space-y-3">
                    <button onClick={handleSaveTrackingRoute} className="w-full bg-red-600 text-white rounded py-2 font-bold hover:bg-red-700 flex items-center justify-center gap-2 shadow-sm"><StopCircle size={16} /> 停止して保存</button>
                    <label className="flex items-center gap-2 justify-center py-1 cursor-pointer">
                      <input type="checkbox" checked={followMe} onChange={(e) => setFollowMe(e.target.checked)} className="w-3.5 h-3.5" />
                      <span className="text-xs text-indigo-700 font-medium">自動追従</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {mode === 'route' && currentRoutePoints.length > 0 && (
              <div className="mb-6 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2"><Route size={16} /> 経路保存</h3>
                <input type="text" value={inputRouteName} onChange={(e) => setInputRouteName(e.target.value)} placeholder="経路名" className="w-full border rounded px-2 py-1.5 text-sm mb-2 outline-none" />
                <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                  <span className="font-bold text-blue-600">{formatDistance(calculateDistance(currentRoutePoints))}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveManualRoute} disabled={!inputRouteName || currentRoutePoints.length < 2} className="flex-1 bg-blue-600 text-white rounded py-1.5 font-bold disabled:bg-gray-300">保存</button>
                  <button onClick={() => setCurrentRoutePoints([])} className="bg-gray-200 text-gray-600 rounded px-3 py-1.5"><Eraser size={14} /></button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2 text-gray-500 font-semibold border-b pb-1 text-sm"><Filter size={16} /> フィルター</div>
              <div className="space-y-4">
                <section>
                  <h4 className="text-[10px] uppercase font-bold text-gray-400 mb-2">カテゴリー</h4>
                  <div className="space-y-1">
                    {sortedCategories.map(category => (
                      <label key={category} className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={visibleCategories.includes(category)} onChange={() => toggleCategory(category)} className="w-3.5 h-3.5" />
                          <span className="text-xs">{category}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{markers.filter(m => m.category === category).length}</span>
                      </label>
                    ))}
                  </div>
                </section>
                <section>
                  <h4 className="text-[10px] uppercase font-bold text-gray-400 mb-2">保存済み経路</h4>
                  {routes.length === 0 ? <div className="text-[10px] text-gray-400 italic px-2">なし</div> : (
                    <div className="space-y-1">
                      {routes.map(route => (
                        <div key={route.id} className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded group">
                          <label className="flex items-center gap-2 cursor-pointer flex-1 overflow-hidden">
                            <input type="checkbox" checked={visibleRoutes.includes(route.id)} onChange={() => toggleRouteVisibility(route.id)} className="w-3.5 h-3.5" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium truncate">{route.name}</span>
                              <span className="text-[9px] text-gray-400">{formatDistance(calculateDistance(route.points))}</span>
                            </div>
                          </label>
                          <button onClick={() => handleDeleteRoute(route.id)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2 text-gray-500 text-xs"><Tag size={14} /><span>カテゴリ追加</span></div>
                <div className="flex gap-1">
                  <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="名称..." className="flex-1 border rounded px-2 py-1 text-xs" onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} />
                  <button onClick={handleAddCategory} className="bg-slate-100 p-1 rounded"><Plus size={16} /></button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleExportData} className="flex-1 bg-slate-100 text-slate-600 rounded py-1.5 text-xs font-bold border flex items-center justify-center gap-1"><Download size={14} /> 保存</button>
                <label className="flex-1 bg-slate-100 text-slate-600 rounded py-1.5 text-xs font-bold border flex items-center justify-center gap-1 cursor-pointer"><Upload size={14} /> 復元<input type="file" accept=".json" onChange={handleImportData} className="hidden" /></label>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 relative z-10">
          <MapContainer center={center} zoom={13} className="h-full w-full">
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <SearchControl />
            <MapClickHandler onMapClick={handleMapClick} />
            <ChangeView center={followMe ? currentPosition : null} />
            
            {currentPosition && (
              <>
                <Circle center={currentPosition} radius={15} pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.4, color: '#3b82f6', weight: 1 }} />
                <Marker position={currentPosition} icon={L.divIcon({ className: 'bg-blue-600 w-3 h-3 rounded-full border-2 border-white shadow-md' })} />
              </>
            )}

            {filteredMarkers.map((marker) => (
              <Marker key={marker.id} position={marker.position}>
                <Popup>
                  <div className="p-1 min-w-[150px]">
                    <div className="border-b mb-2 pb-1 font-bold text-sm">{marker.name}</div>
                    <select value={marker.category} onChange={(e) => handleUpdateMarkerCategory(marker.id, e.target.value)} className="w-full bg-blue-50 p-1 rounded text-xs mb-2">
                      {sortedCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                    </select>
                    <button onClick={() => handleDeleteMarker(marker.id)} className="text-red-500 w-full text-center text-xs py-1 border border-red-100 rounded">削除</button>
                  </div>
                </Popup>
              </Marker>
            ))}

            {routes.filter(r => visibleRoutes.includes(r.id)).map(route => (
              <Polyline key={route.id} positions={route.points} color={route.color} weight={4} opacity={0.6} />
            ))}

            {isTracking && trackingPath.length > 0 && (
              <Polyline positions={trackingPath} color="#6366f1" weight={5} opacity={0.8} />
            )}

            {currentRoutePoints.length > 0 && (
              <Polyline positions={currentRoutePoints} color="#ef4444" weight={3} dashArray="5, 8" />
            )}

            {newMarkerPos && (
              <Marker position={newMarkerPos}>
                <Popup eventHandlers={{ remove: () => setNewMarkerPos(null) }}>
                  <div className="p-2 min-w-[180px]">
                    <div className="font-bold mb-2 text-blue-600">地点登録</div>
                    <input type="text" value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="名称" className="w-full border-b mb-3 py-1 text-sm outline-none" autoFocus />
                    <select value={inputCategory} onChange={(e) => setInputCategory(e.target.value)} className="w-full bg-gray-50 border rounded p-1 text-sm mb-3">
                      {sortedCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                    </select>
                    <button onClick={handleAddMarker} disabled={!inputName} className="w-full bg-blue-600 text-white rounded py-1.5 text-sm font-bold disabled:bg-gray-300">登録</button>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </main>
      </div>
    </div>
  );
}

export default App;
