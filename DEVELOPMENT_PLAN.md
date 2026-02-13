# Windows地図アプリ 開発計画書

## 1. プロジェクト概要
要件定義書に基づき、Leafletを使用したWindowsデスクトップ向け地図管理アプリを開発します。サーバーレス構成（GitHub Pages + LocalStorage）で、個人用途に特化した軽量で高速なツールを目指します。

## 2. 技術スタック
- **Frontend**: React (Vite), TypeScript
- **Styling**: Tailwind CSS v4
- **Map Library**: Leaflet, React-Leaflet
- **Search**: Leaflet-Control-Geocoder
- **Icon**: Lucide React
- **Persistence**: LocalStorage
- **Deployment**: GitHub Pages

## 3. 開発フェーズ

### フェーズ1: 基盤構築 (〇)
- [x] プロジェクトの初期化 (Vite + React + TS)
- [x] Tailwind CSS の導入 (v4)
- [x] Leaflet のインストールと基本地図の表示

### フェーズ2: マーカー管理機能 (〇)
- [x] 地図クリックによる座標取得とマーカー追加機能
- [x] マーカーの名称・カテゴリ設定用ポップアップの実装
- [x] マーカーの削除機能
- [x] 設置済みマーカーのカテゴリ変更機能 (追加実装)

### フェーズ3: カテゴリ・フィルタ機能 (〇)
- [x] サイドバーUIの作成
- [x] カテゴリ一覧表示と表示切替スイッチの実装
- [x] カテゴリの追加・削除機能 (追加実装)
- [x] 「すべて選択/解除」の一括操作機能 (追加実装)

### フェーズ4: データ永続化と最適化 (〇)
- [x] LocalStorage への保存・読み込みロジックの実装
- [x] 住所検索機能 (Geocoder) の実装 (追加実装)
- [x] サイドバーの開閉とUIの最適化

### フェーズ5: アプリ化・公開 (進行中)
- [ ] PWA (Progressive Web App) 対応設定
- [ ] GitHub Actions による自動デプロイ設定
- [ ] 最終動作確認

## 4. TODOリスト (進捗状況)

- [x] **Task 1: プロジェクトセットアップ** (〇)
- [x] **Task 2: 基本地図の実装** (〇)
- [x] **Task 3: マーカー機能** (〇)
- [x] **Task 4: サイドバーとフィルタ** (〇)
- [x] **Task 5: 保存機能と高度な検索** (〇)
- [ ] **Task 6: PWA & デプロイ** (次回の作業)
