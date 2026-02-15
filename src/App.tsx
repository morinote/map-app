import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline, Circle } from 'react-leaflet';
import { Trash2, Plus, MapPin, Filter, Menu, X, Save, Tag, Route, Eraser, Download, Upload, Navigation, StopCircle, Battery, Zap } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-control-geocoder';
import './App.css';

// --- 設定定数 ---
const DISTANCE_THRESHOLD = 30; 
const ANGLE_THRESHOLD = 15;    
const ACCURACY_THRESHOLD = 60; 
const STORAGE_KEYS = {
  MARKERS: 'map-app-markers',
  CATEGORIES: 'map-app-categories',
  ROUTES: 'map-app-routes',
  TRACKING_STATE: 'map-app-tracking-active',
  PENDING_PATH: 'map-app-pending-path'
};

const SILENT_AUDIO_BASE64 = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ";

const calculateDistance = (p1: [number, number], p2: [number, number]) => {
  return L.latLng(p1).distanceTo(L.latLng(p2));
};

const getBearing = (p1: [number, number], p2: [number, number]) => {
  const lat1 = p1[0] * Math.PI / 180;
  const lon1 = p1[1] * Math.PI / 180;
  const lat2 = p2[0] * Math.PI / 180;
  const lon2 = p2[1] * Math.PI / 180;
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

function ChangeView({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

function SearchControl() {
  const map = useMap();
  useEffect(() => {
    // @ts-ignore
    const geocoder = L.Control.Geocoder.nominatim();
    // @ts-ignore
    const control = L.Control.geocoder({ placeholder: '検索...', defaultMarkGeocode: false, geocoder })
      .on('markgeocode', (e: any) => map.setView(e.geocode.center, 16))
      .addTo(map);
    return () => map.removeControl(control);
  }, [map]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (e: any) => void }) {
  useMapEvents({ click: (e) => onMapClick(e) });
  return null;
}

function App() {
  const [markers, setMarkers] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [mode, setMode] = useState<'marker' | 'route' | 'tracking'>('marker');
  
  const [isTracking, setIsTracking] = useState(false);
  const [trackingPath, setTrackingPath] = useState<[number, number][]>([]);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [followMe, setFollowMe] = useState(false);
  const [batterySaving, setBatterySaving] = useState(true);
  
  const lastLoggedPositionRef = useRef<[number, number] | null>(null);
  const lastBearingRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [visibleRoutes, setVisibleRoutes] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedMarkers = localStorage.getItem(STORAGE_KEYS.MARKERS);
    const savedRoutes = localStorage.getItem(STORAGE_KEYS.ROUTES);
    const savedTrackingActive = localStorage.getItem(STORAGE_KEYS.TRACKING_STATE) === 'true';
    const savedPendingPath = localStorage.getItem(STORAGE_KEYS.PENDING_PATH);

    if (savedMarkers) setMarkers(JSON.parse(savedMarkers));
    if (savedRoutes) {
      const r = JSON.parse(savedRoutes);
      setRoutes(r);
      setVisibleRoutes(r.map((x: any) => x.id));
    }
    if (savedPendingPath) {
      const path = JSON.parse(savedPendingPath);
      setTrackingPath(path);
      if (path.length > 0) lastLoggedPositionRef.current = path[path.length - 1];
    }
    setIsLoaded(true);

    if (savedTrackingActive) {
      setTimeout(() => {
        if (window.confirm("前回の追跡が中断されました。再開しますか？")) {
          startTracking();
        } else {
          localStorage.removeItem(STORAGE_KEYS.TRACKING_STATE);
          localStorage.removeItem(STORAGE_KEYS.PENDING_PATH);
          setTrackingPath([]);
        }
      }, 1000);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEYS.MARKERS, JSON.stringify(markers));
      localStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
      if (isTracking) {
        localStorage.setItem(STORAGE_KEYS.PENDING_PATH, JSON.stringify(trackingPath));
      }
    }
  }, [markers, routes, trackingPath, isLoaded, isTracking]);

  // --- 改良: バックグラウンド時のみオーディオを再生する ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isTracking) {
        if (document.visibilityState === 'hidden') {
          // 隠れたら再生開始
          playAudio();
        } else {
          // 戻ってきたら停止（バッテリー節約）
          pauseAudio();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTracking]);

  const playAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(SILENT_AUDIO_BASE64);
      audioRef.current.loop = true;
    }
    audioRef.current.play().catch(() => {});
  };

  const pauseAudio = () => {
    if (audioRef.current) audioRef.current.pause();
  };

  const startTracking = () => {
    setIsTracking(true);
    localStorage.setItem(STORAGE_KEYS.TRACKING_STATE, 'true');
    // 最初は画面が出ているはずなので再生しない（隠れた時にuseEffectが反応する）
  };

  const stopTracking = () => {
    setIsTracking(false);
    localStorage.setItem(STORAGE_KEYS.TRACKING_STATE, 'false');
    pauseAudio();
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  useEffect(() => {
    if (isTracking) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos.coords.accuracy > ACCURACY_THRESHOLD) return;

          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setCurrentPosition(newPos);

          if (!lastLoggedPositionRef.current) {
            lastLoggedPositionRef.current = newPos;
            setTrackingPath([newPos]);
            return;
          }

          const dist = calculateDistance(lastLoggedPositionRef.current, newPos);
          
          if (batterySaving) {
            const bearing = getBearing(lastLoggedPositionRef.current, newPos);
            const isFarEnough = dist > DISTANCE_THRESHOLD;
            const bearingDiff = lastBearingRef.current !== null 
              ? Math.abs(bearing - lastBearingRef.current) 
              : 0;
            const isTurning = bearingDiff > ANGLE_THRESHOLD && dist > 15;

            if (isFarEnough || isTurning) {
              setTrackingPath(prev => [...prev, newPos]);
              lastLoggedPositionRef.current = newPos;
              lastBearingRef.current = bearing;
            }
          } else {
            if (dist > 5) {
              setTrackingPath(prev => [...prev, newPos]);
              lastLoggedPositionRef.current = newPos;
            }
          }
        },
        (err) => console.error(err),
        { 
          enableHighAccuracy: true, 
          timeout: 15000, 
          maximumAge: batterySaving ? 3000 : 0 
        }
      );
    }
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isTracking, batterySaving]);

  const handleSaveTrack = () => {
    const name = prompt("経路の名前を入力:", `ログ ${new Date().toLocaleString()}`);
    if (name && trackingPath.length > 1) {
      const newRoute = { id: crypto.randomUUID(), name, points: trackingPath, color: '#6366f1' };
      setRoutes([...routes, newRoute]);
      setVisibleRoutes([...visibleRoutes, newRoute.id]);
      setTrackingPath([]);
      lastLoggedPositionRef.current = null;
      stopTracking();
      localStorage.removeItem(STORAGE_KEYS.PENDING_PATH);
    }
  };

  const formatDistance = (pts: any[]) => {
    let d = 0;
    for (let i = 0; i < pts.length - 1; i++) d += L.latLng(pts[i]).distanceTo(L.latLng(pts[i+1]));
    return d < 1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(2)}km`;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden">
      <header className="bg-slate-900 text-white p-3 flex justify-between items-center shadow-md z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu size={20} /></button>
          <h1 className="font-bold flex items-center gap-2"><MapPin size={18} className="text-blue-400"/> MapTrack</h1>
        </div>
        <div className="flex bg-slate-800 p-1 rounded-lg scale-90">
          <button onClick={() => setMode('marker')} className={`px-4 py-1 rounded ${mode === 'marker' ? 'bg-blue-600' : ''}`}><MapPin size={14}/></button>
          <button onClick={() => setMode('tracking')} className={`px-4 py-1 rounded ${mode === 'tracking' ? 'bg-blue-600' : ''}`}><Navigation size={14}/></button>
        </div>
        {isTracking && <div className="text-xs bg-red-600 px-2 py-1 rounded-full animate-pulse">REC {formatDistance(trackingPath)}</div>}
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <aside className={`${isSidebarOpen ? 'w-72' : 'w-0'} transition-all bg-white border-r z-20 overflow-hidden flex flex-col`}>
          <div className="p-4 min-w-[288px] flex flex-col h-full">
            {mode === 'tracking' && (
              <div className="bg-slate-100 p-3 rounded-xl mb-4 border border-slate-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm flex items-center gap-2"><Battery size={16} className="text-green-500"/> エコ設定</h3>
                  <button onClick={() => setBatterySaving(!batterySaving)} className={`text-[10px] px-2 py-0.5 rounded-full border ${batterySaving ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>
                    {batterySaving ? '省電力モード' : '通常モード'}
                  </button>
                </div>
                {!isTracking ? (
                  <button onClick={startTracking} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold shadow-lg shadow-blue-200">追跡を開始</button>
                ) : (
                  <div className="space-y-2">
                    <button onClick={handleSaveTrack} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">停止して保存</button>
                    <label className="flex items-center justify-center gap-2 text-xs py-1 cursor-pointer">
                      <input type="checkbox" checked={followMe} onChange={e => setFollowMe(e.target.checked)} /> 自動追従
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <h4 className="text-[10px] uppercase font-bold text-slate-400 mb-2 border-b pb-1">保存済み経路</h4>
              <div className="space-y-1">
                {routes.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded text-xs">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="checkbox" checked={visibleRoutes.includes(r.id)} onChange={() => setVisibleRoutes(prev => prev.includes(r.id) ? prev.filter(x => x!==r.id) : [...prev, r.id])} />
                      <div className="flex flex-col truncate">
                        <span className="font-bold truncate">{r.name}</span>
                        <span className="text-[10px] text-slate-400">{formatDistance(r.points)}</span>
                      </div>
                    </label>
                    <button onClick={() => setRoutes(routes.filter(x => x.id !== r.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 relative">
          <MapContainer center={[35.6812, 139.7671]} zoom={13} className="h-full w-full">
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <SearchControl />
            <ChangeView center={followMe ? currentPosition : null} />
            {currentPosition && <Circle center={currentPosition} radius={20} pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.3, color: '#3b82f6', weight: 1 }} />}
            {routes.filter(r => visibleRoutes.includes(r.id)).map(r => <Polyline key={r.id} positions={r.points} color={r.color} weight={4} opacity={0.6} />)}
            {isTracking && trackingPath.length > 0 && <Polyline positions={trackingPath} color="#6366f1" weight={5} opacity={0.8} />}
          </MapContainer>
        </main>
      </div>
    </div>
  );
}

export default App;
