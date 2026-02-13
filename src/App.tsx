import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { Trash2, Plus, MapPin, Filter, Layers, Menu, X, Save, Tag, XCircle, ChevronRight, CheckSquare, Square, Search } from 'lucide-react';
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

// マーカーの型定義
interface MapMarker {
  id: string;
  position: [number, number];
  name: string;
  category: string;
}

const DEFAULT_CATEGORIES = ["飲食店", "作業場所", "観光", "ショッピング", "その他"];
const MARKERS_STORAGE_KEY = 'map-app-markers';
const CATEGORIES_STORAGE_KEY = 'map-app-categories';

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
  const [newCategoryName, setNewCategoryName] = useState('');
  
  const [newMarkerPos, setNewMarkerPos] = useState<[number, number] | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputCategory, setInputCategory] = useState('');
  
  // フィルタリング用の状態
  const [visibleCategories, setVisibleCategories] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  // 初回読み込み
  useEffect(() => {
    const savedMarkers = localStorage.getItem(MARKERS_STORAGE_KEY);
    const savedCategories = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    
    let loadedCategories = DEFAULT_CATEGORIES;
    if (savedCategories) {
      try {
        loadedCategories = JSON.parse(savedCategories);
        setCategories(loadedCategories);
      } catch (e) {
        console.error("Failed to load categories:", e);
      }
    }
    
    if (savedMarkers) {
      try {
        setMarkers(JSON.parse(savedMarkers));
      } catch (e) {
        console.error("Failed to load markers:", e);
      }
    }

    // 初回は全てのカテゴリを表示対象にする
    setVisibleCategories(loadedCategories);
    setInputCategory(loadedCategories[0]);
    setIsLoaded(true);
  }, []);

  // データ保存
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    }
  }, [markers, categories, isLoaded]);

  // マーカー追加処理
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

  // カテゴリ変更処理
  const handleUpdateMarkerCategory = (markerId: string, newCategory: string) => {
    setMarkers(markers.map(m => 
      m.id === markerId ? { ...m, category: newCategory } : m
    ));
  };

  // カテゴリ追加処理
  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (trimmed && !categories.includes(trimmed)) {
      const updatedCategories = [...categories, trimmed];
      setCategories(updatedCategories);
      setVisibleCategories([...visibleCategories, trimmed]);
      setNewCategoryName('');
    }
  };

  // カテゴリ削除処理
  const handleDeleteCategory = (categoryToDelete: string) => {
    if (categoryToDelete === "その他") return;
    
    if (window.confirm(`カテゴリ「${categoryToDelete}」を削除しますか？\nこのカテゴリのマーカーは「その他」に移動されます。`)) {
      const updatedCategories = categories.filter(c => c !== categoryToDelete);
      setCategories(updatedCategories);
      setVisibleCategories(visibleCategories.filter(c => c !== categoryToDelete));
      const updatedMarkers = markers.map(m => 
        m.category === categoryToDelete ? { ...m, category: "その他" } : m
      );
      setMarkers(updatedMarkers);
      if (inputCategory === categoryToDelete) {
        setInputCategory(updatedCategories[0] || "その他");
      }
    }
  };

  // マーカー削除処理
  const handleDeleteMarker = (id: string) => {
    setMarkers(markers.filter(m => m.id !== id));
  };

  // フィルタ切り替え
  const toggleCategory = (category: string) => {
    setVisibleCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category) 
        : [...prev, category]
    );
  };

  const selectAllCategories = () => setVisibleCategories(categories);
  const deselectAllCategories = () => setVisibleCategories([]);

  const center: [number, number] = [35.681236, 139.767125];
  const filteredMarkers = markers.filter(m => visibleCategories.includes(m.category));
  const sortedCategories = [...categories].sort((a, b) => {
    if (a === "その他") return 1;
    if (b === "その他") return -1;
    return a.localeCompare(b);
  });

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
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-700 px-3 py-1 rounded-full text-slate-300 border border-slate-600">
            <Save size={14} className="text-green-400" />
            <span>自動保存中</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <aside className={`${isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none'} transition-all duration-300 ease-in-out bg-white border-r border-gray-200 z-20 flex flex-col shadow-xl overflow-hidden`}>
          <div className="p-4 flex flex-col h-full min-w-[256px]">
            <div className="flex items-center gap-2 mb-2 text-gray-500 font-semibold border-b pb-2">
              <Filter size={18} />
              <span>カテゴリーフィルター</span>
            </div>
            <div className="flex gap-4 mb-3 px-1">
              <button onClick={selectAllCategories} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors">
                <CheckSquare size={12} />すべて選択
              </button>
              <button onClick={deselectAllCategories} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-gray-700 transition-colors">
                <Square size={12} />すべて解除
              </button>
            </div>
            <div className="space-y-1 flex-1 overflow-y-auto pr-1">
              {sortedCategories.map(category => (
                <div key={category} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded group transition-colors border-l-2 border-transparent hover:border-blue-200">
                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <input type="checkbox" checked={visibleCategories.includes(category)} onChange={() => toggleCategory(category)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" />
                    <span className="text-sm font-medium">{category}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full group-hover:bg-gray-200">
                      {markers.filter(m => m.category === category).length}
                    </span>
                    {category !== "その他" && (
                      <button onClick={() => handleDeleteCategory(category)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-0.5">
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2 text-gray-500 font-semibold text-xs"><Tag size={14} /><span>新しいカテゴリ</span></div>
              <div className="flex gap-1">
                <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="カテゴリ名..." className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} />
                <button onClick={handleAddCategory} className="bg-slate-100 hover:bg-slate-200 p-1 rounded text-slate-600 transition-colors"><Plus size={16} /></button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 relative z-10">
          <MapContainer center={center} zoom={13} className="h-full w-full">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <SearchControl />
            <MapClickHandler onMapClick={(e) => setNewMarkerPos([e.latlng.lat, e.latlng.lng])} />
            {filteredMarkers.map((marker) => (
              <Marker key={marker.id} position={marker.position}>
                <Popup>
                  <div className="p-1 min-w-[180px]">
                    <div className="flex justify-between items-start border-b mb-3 pb-1"><h3 className="font-bold text-base leading-tight">{marker.name}</h3></div>
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">カテゴリー</label>
                      <div className="relative">
                        <select value={marker.category} onChange={(e) => handleUpdateMarkerCategory(marker.id, e.target.value)} className="w-full bg-blue-50 text-blue-700 text-xs font-bold py-1.5 px-2 rounded border border-blue-100 outline-none appearance-none cursor-pointer hover:bg-blue-100 transition-colors">
                          {sortedCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400"><ChevronRight size={12} className="rotate-90" /></div>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteMarker(marker.id)} className="flex items-center gap-2 text-red-500 hover:text-white hover:bg-red-500 transition-all w-full justify-center border border-red-100 rounded px-2 py-1.5 text-xs font-medium"><Trash2 size={12} /><span>地点を削除</span></button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {newMarkerPos && (
              <Marker position={newMarkerPos}>
                <Popup closeOnClick={false} onClose={() => setNewMarkerPos(null)}>
                  <div className="p-2 min-w-[200px]">
                    <h3 className="font-bold mb-3 flex items-center gap-2 text-blue-600 border-b pb-2"><Plus size={18} /> 新しい地点</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">名称</label>
                        <input type="text" value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="例: お気に入りの場所" className="w-full border-b border-gray-300 focus:border-blue-500 px-1 py-1 text-sm outline-none transition-colors" autoFocus />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">カテゴリー</label>
                        <select value={inputCategory} onChange={(e) => setInputCategory(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500">
                          {sortedCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                        </select>
                      </div>
                      <button onClick={handleAddMarker} disabled={!inputName} className="w-full bg-blue-600 text-white rounded shadow-md py-2 text-sm font-bold hover:bg-blue-700 disabled:bg-gray-300 transition-all active:scale-95">地点を登録</button>
                    </div>
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
