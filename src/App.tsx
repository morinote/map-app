import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline, Circle } from 'react-leaflet';
import { Trash2, MapPin, Menu, Navigation, Battery, Zap } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-control-geocoder';
import './App.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// ID生成ヘルパー（Secure Context以外や古いブラウザ向けのフォールバック付き）
const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
};

// --- 設定定数 ---
const DISTANCE_THRESHOLD = 15; 
const ANGLE_THRESHOLD = 15;    
const ACCURACY_THRESHOLD = 40; 
const STORAGE_KEYS = {
  MARKERS: 'map-app-markers',
  CATEGORIES: 'map-app-categories',
  ROUTES: 'map-app-routes',
  TRACKING_STATE: 'map-app-tracking-active',
  PENDING_PATH: 'map-app-pending-path'
};

const SILENT_AUDIO_BASE64 = "data:audio/wav;base64,UklGRigAAABXQVZFfm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ";

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

function MapClickHandler({ onMapClick }: { onMapClick: (e: any) => void }) {
  useMapEvents({ click: (e) => onMapClick(e) });
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
    return () => { map.removeControl(control) };
  }, [map]);
  return null;
}

function App() {
  const [markers, setMarkers] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [mode, setMode] = useState<'marker' | 'route' | 'tracking'>('marker');
  
  const [newMarkerPos, setNewMarkerPos] = useState<[number, number] | null>(null);
  const [inputName, setInputName] = useState('');
  
  const [isTracking, setIsTracking] = useState(false);
  const [trackingPath, setTrackingPath] = useState<[number, number][]>([]);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [followMe, setFollowMe] = useState(false);
  const [batterySaving, setBatterySaving] = useState(true);
  
  const lastLoggedPositionRef = useRef<[number, number] | null>(null);
  const lastBearingRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [visibleRoutes, setVisibleRoutes] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMapHidden, setIsMapHidden] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // 新しい状態: 保存ダイアル（モバイル安定性のため）
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingRouteName, setPendingRouteName] = useState('');
  const [showResumeDialog, setShowResumeDialog] = useState(false);

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
      setShowResumeDialog(true);
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
    setBatterySaving(true);
    localStorage.setItem(STORAGE_KEYS.TRACKING_STATE, 'true');
    setGpsError(null);
    setCurrentAccuracy(null);

    // iOS等でバックグラウンドでのオーディオ再生を許可させるため、ユーザージェスチャー内（ボタンクリック時）で一度再生・即停止を行う
    if (!audioRef.current) {
      audioRef.current = new Audio(SILENT_AUDIO_BASE64);
      audioRef.current.loop = true;
    }
    audioRef.current.play().then(() => {
      audioRef.current?.pause();
    }).catch((e) => console.log('Audio init failed:', e));
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
          setGpsError(null);
          setCurrentAccuracy(pos.coords.accuracy);

          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setCurrentPosition(newPos); // 精度が悪くても現在地の青丸は更新する

          // 記録するための精度チェック
          if (pos.coords.accuracy > ACCURACY_THRESHOLD) return;

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
            if (dist > 3) {
              setTrackingPath(prev => [...prev, newPos]);
              lastLoggedPositionRef.current = newPos;
            }
          }
        },
        (err) => {
          console.error(err);
          let errorMsg = "GPSエラーが発生しました。";
          if (err.code === err.PERMISSION_DENIED) errorMsg = "位置情報の利用が許可されていません。設定を確認してください。";
          else if (err.code === err.POSITION_UNAVAILABLE) errorMsg = "位置情報が取得できません。空が見える場所に移動してください。";
          else if (err.code === err.TIMEOUT) errorMsg = "位置情報の取得がタイムアウトしました。";
          setGpsError(errorMsg);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 20000, 
          maximumAge: batterySaving ? 5000 : 0 
        }
      );
    }
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isTracking, batterySaving]);

  const handleSaveTrack = () => {
    setPendingRouteName(`ログ ${new Date().toLocaleString()}`);
    setShowSaveDialog(true);
  };

  const confirmSaveTrack = () => {
    if (trackingPath.length <= 1) {
      discardTrack();
      return;
    }

    const finalName = pendingRouteName.trim() || `ログ ${new Date().toLocaleString()}`;
    const newRoute = { id: generateId(), name: finalName, points: trackingPath, color: '#6366f1' };
    setRoutes([...routes, newRoute]);
    setVisibleRoutes([...visibleRoutes, newRoute.id]);
    
    // 状態のリセット
    stopTracking();
    setTrackingPath([]);
    lastLoggedPositionRef.current = null;
    localStorage.removeItem(STORAGE_KEYS.PENDING_PATH);
    setShowSaveDialog(false);
  };

  const discardTrack = () => {
    stopTracking();
    setTrackingPath([]);
    lastLoggedPositionRef.current = null;
    localStorage.removeItem(STORAGE_KEYS.PENDING_PATH);
    setShowSaveDialog(false);
  };

  const formatDistance = (pts: any[]) => {
    let d = 0;
    for (let i = 0; i < pts.length - 1; i++) d += L.latLng(pts[i]).distanceTo(L.latLng(pts[i+1]));
    return d < 1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(2)}km`;
  };

  const handleAddMarker = () => {
    if (newMarkerPos && inputName) {
      const newMarker = {
        id: generateId(),
        position: newMarkerPos,
        name: inputName,
        category: "その他",
      };
      setMarkers([...markers, newMarker]);
      setNewMarkerPos(null);
      setInputName('');
    }
  };

  const handleDeleteMarker = (id: string) => {
    setMarkers(markers.filter(m => m.id !== id));
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
        {isTracking && (
          <button 
            onClick={handleSaveTrack}
            className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-full animate-pulse transition-colors flex items-center gap-1 border border-red-400 font-bold"
            title="追跡を停止して保存"
          >
            <div className="w-2 h-2 bg-white rounded-full"></div>
            REC {formatDistance(trackingPath)}
          </button>
        )}
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <aside className={`${isSidebarOpen ? 'w-72' : 'w-0'} transition-all bg-white border-r z-20 overflow-hidden flex flex-col`}>
          <div className="p-4 min-w-[288px] flex flex-col h-full">
            {mode === 'tracking' && (
              <div className="bg-slate-100 p-3 rounded-xl mb-4 border border-slate-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm flex items-center gap-2"><Battery size={16} className="text-green-500"/> エコ設定</h3>
                  <button onClick={() => setBatterySaving(!batterySaving)} disabled={isTracking} className={`text-[10px] px-2 py-0.5 rounded-full border ${batterySaving ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>
                    {batterySaving ? '省電力モード' : '通常モード'}
                  </button>
                </div>
                {!isTracking ? (
                  <button onClick={startTracking} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold shadow-lg shadow-blue-200">追跡を開始</button>
                ) : (
                  <div className="space-y-2">
                    <button onClick={handleSaveTrack} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">停止して保存</button>
                    {gpsError && (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                        {gpsError}
                      </div>
                    )}
                    {currentAccuracy !== null && (
                      <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>GPS精度: {Math.round(currentAccuracy)}m</span>
                        {currentAccuracy > ACCURACY_THRESHOLD && <span className="text-amber-500 font-bold">待機中</span>}
                      </div>
                    )}
                    <div className="flex flex-col gap-1 mt-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={followMe} onChange={e => setFollowMe(e.target.checked)} /> 自動追従
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer text-blue-600 font-medium">
                        <input type="checkbox" checked={isMapHidden} onChange={e => setIsMapHidden(e.target.checked)} /> 地図を非表示 (節電)
                      </label>
                    </div>
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

        <main className="flex-1 relative bg-slate-200">
          {(!isMapHidden || mode !== 'tracking') ? (
            <MapContainer center={[35.6812, 139.7671]} zoom={13} className="h-full w-full">
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <SearchControl />
              <ChangeView center={followMe ? currentPosition : null} />
              
              {mode === 'marker' && <MapClickHandler onMapClick={(e) => setNewMarkerPos([e.latlng.lat, e.latlng.lng])} />}

              {currentPosition && <Circle center={currentPosition} radius={20} pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.3, color: '#3b82f6', weight: 1 }} />}
              {routes.filter(r => visibleRoutes.includes(r.id)).map(r => <Polyline key={r.id} positions={r.points} color={r.color} weight={4} opacity={0.6} />)}
              {isTracking && trackingPath.length > 0 && <Polyline positions={trackingPath} color="#6366f1" weight={5} opacity={0.8} />}

              {mode !== 'tracking' && markers.map((marker) => (
                <Marker key={marker.id} position={marker.position}>
                  <Popup>
                    <div className="p-2 min-w-[150px]">
                      <h3 className="font-bold text-sm mb-2">{marker.name}</h3>
                      <button onClick={() => handleDeleteMarker(marker.id)} className="flex items-center justify-center gap-1 w-full bg-red-100 text-red-600 hover:bg-red-200 py-1 rounded text-xs transition-colors">
                        <Trash2 size={12} /> 削除
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {mode === 'marker' && newMarkerPos && (
                <Marker position={newMarkerPos}>
                  <Popup closeOnClick={false}>
                    <div className="p-2 min-w-[150px]">
                      <h3 className="font-bold mb-2 text-blue-600 text-sm">新しい傷（地点）</h3>
                      <input type="text" value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="名称..." className="w-full border rounded px-2 py-1 text-sm mb-2 outline-none focus:border-blue-500" autoFocus />
                      <button onClick={handleAddMarker} disabled={!inputName} className="w-full bg-blue-600 text-white rounded py-1.5 text-xs font-bold disabled:bg-slate-300">防犯登録</button>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
              <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-slate-100">
                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Zap size={40} className={isTracking ? "animate-pulse" : ""} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">節電追跡中</h2>
                <p className="text-slate-500 text-sm mb-6">地図の描画を停止してバッテリーを節約しています。位置情報はバックグラウンドで記録されています。</p>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 text-left">走行距離</div>
                    <div className="text-xl font-black text-slate-700 text-left">{formatDistance(trackingPath)}</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 text-left">ステータス</div>
                    <div className="text-xl font-black text-green-600 text-left">{isTracking ? "REC" : "WAIT"}</div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleSaveTrack}
                    className="w-full py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-100 flex items-center justify-center gap-2"
                  >
                    停止して保存
                  </button>
                  <button 
                    onClick={() => setIsMapHidden(false)}
                    className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    地図を表示する
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --- 保存ダイアログ (Mobile用 UI) --- */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Navigation className="text-blue-500" size={20} />
              追跡を停止して保存
            </h3>
            
            {trackingPath.length <= 1 ? (
              <div className="py-4">
                <p className="text-slate-600 mb-6">記録された経路が短すぎます。保存せずに終了しますか？</p>
                <div className="flex flex-col gap-2">
                  <button onClick={discardTrack} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold">保存せずに終了</button>
                  <button onClick={() => setShowSaveDialog(false)} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">追跡を続ける</button>
                </div>
              </div>
            ) : (
              <div className="py-4">
                <p className="text-slate-500 text-sm mb-4">この経路に名前を付けて保存します。</p>
                <input 
                  type="text" 
                  value={pendingRouteName} 
                  onChange={(e) => setPendingRouteName(e.target.value)}
                  className="w-full border-2 border-slate-100 bg-slate-50 rounded-xl px-4 py-3 mb-6 focus:border-blue-500 outline-none font-medium"
                  placeholder="経路の名前..."
                  autoFocus
                />
                <div className="flex flex-col gap-2">
                  <button onClick={confirmSaveTrack} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100">名前を付けて保存</button>
                  <button onClick={discardTrack} className="w-full py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-colors">記録を破棄して終了</button>
                  <button onClick={() => setShowSaveDialog(false)} className="w-full py-2 text-slate-400 text-sm font-medium">キャンセル（追跡を続行）</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- 再開ダイアログ --- */}
      {showResumeDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Zap className="text-amber-500" size={20} />
              追跡の再開
            </h3>
            <p className="text-slate-600 mb-6 py-2">前回の追跡が中断されました。記録を再開しますか？</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { startTracking(); setShowResumeDialog(false); }} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100">再開する</button>
              <button onClick={() => { 
                localStorage.removeItem(STORAGE_KEYS.TRACKING_STATE);
                localStorage.removeItem(STORAGE_KEYS.PENDING_PATH);
                setTrackingPath([]);
                setShowResumeDialog(false);
              }} className="w-full py-3 bg-slate-100 text-red-500 font-bold">破棄して終了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
