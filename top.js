import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, doc, setDoc, deleteDoc,
    onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- Firebase 初期化 ----
const firebaseConfig = {
    apiKey: "AIzaSyBTYu_SDoHcQvZj5MdAgC40B4pcZOc3R5E",
    authDomain: "pdtest-6fbb5.firebaseapp.com",
    projectId: "pdtest-6fbb5",
    storageBucket: "pdtest-6fbb5.firebasestorage.app",
    messagingSenderId: "190378284461",
    appId: "1:190378284461:web:f6427c67d31691008f7d24",
    measurementId: "G-N70561CQSK"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const reportsRef = collection(db, 'reports');

// ---- 地図 ----
const map = L.map('map').setView([36.5621, 136.6624], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const markers = [
    { id: 1, lat: 36.5780818, lng: 136.6478206, title: '金沢駅', info: '北陸の玄関口' },
    { id: 2, lat: 36.5621401, lng: 136.6624034, title: '兼六園', info: 'お庭の国宝' },
    { id: 3, lat: 36.5304209, lng: 136.6276301, title: '金沢工業大学', info: '' },
];

// ---- アイコン ----
const iconBase = {
    iconUrl: 'https://unpkg.com/leaflet/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
};
const normalIcon = L.icon(iconBase);
const fullIcon = L.icon({ ...iconBase, className: 'marker-full' });

// ---- 報告状況（Firestore と同期する） ----
let reports = {}; // { ゴミ箱id: 報告時刻(ミリ秒) }

function buildPopup(marker) {
    const reportedAt = reports[marker.id];
    let statusHtml;

    if (reportedAt !== undefined) {
        const time = new Date(reportedAt).toLocaleString('ja-JP');
        statusHtml = `
            <div class="popup-status full">満タン（報告: ${time}）</div>
            <button class="report-btn clear" data-id="${marker.id}" data-action="clear">空になった</button>
        `;
    } else {
        statusHtml = `
            <div class="popup-status">通常</div>
            <button class="report-btn" data-id="${marker.id}" data-action="report">満タンを報告</button>
        `;
    }

    return `
        <div class="popup-title">${marker.title}</div>
        <div class="popup-info">${marker.info}</div>
        ${statusHtml}
    `;
}

const leafletMarkers = {};

markers.forEach(function(marker) {
    const lm = L.marker([marker.lat, marker.lng], { icon: normalIcon }).addTo(map);
    // 開くたびに最新の状態でポップアップを作る
    lm.bindPopup(function() { return buildPopup(marker); });
    leafletMarkers[marker.id] = lm;
});

// ---- Firestore の変更をリアルタイムで受け取る ----
onSnapshot(reportsRef, function(snapshot) {
    const latest = {};
    snapshot.forEach(function(d) {
        const ts = d.data().reportedAt;
        // 書き込み直後はサーバー時刻が未確定のため、現在時刻で代用する
        latest[d.id] = ts ? ts.toMillis() : Date.now();
    });
    reports = latest;

    // 全マーカーのアイコンを最新の状態に更新
    markers.forEach(function(m) {
        const isFull = reports[m.id] !== undefined;
        leafletMarkers[m.id].setIcon(isFull ? fullIcon : normalIcon);
    });
}, function(error) {
    console.error('報告データを取得できませんでした', error);
});

// ---- 報告・解除ボタン ----
map.on('popupopen', function(e) {
    const btn = e.popup.getElement().querySelector('.report-btn');
    if (!btn) return;

    btn.addEventListener('click', async function() {
        const id = btn.dataset.id;
        btn.disabled = true;

        try {
            if (btn.dataset.action === 'report') {
                await setDoc(doc(db, 'reports', id), { reportedAt: serverTimestamp() });
            } else {
                await deleteDoc(doc(db, 'reports', id));
            }
            // 閉じておけば、次に開いたときに最新の内容で表示される
            map.closePopup();
        } catch (error) {
            console.error('更新に失敗しました', error);
            alert('更新に失敗しました。時間をおいて再度お試しください。');
            btn.disabled = false;
        }
    });
});

// ---- 現在地（変更なし） ----
let currentLat = null;
let currentLng = null;
let currentMarker = null;

function updateCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
        function(position) {
            currentLat = position.coords.latitude;
            currentLng = position.coords.longitude;

            if (currentMarker !== null) {
                map.removeLayer(currentMarker);
            }

            currentMarker = L.marker([currentLat, currentLng], {
                icon: L.divIcon({
                    html: '<div class="current-location"></div>',
                    iconAnchor: [10, 10],
                    className: ''
                })
            }).addTo(map);

            map.setView([currentLat, currentLng], 16);
        },
        function(error) {
            console.log('現在地を取得できませんでした', error);
            if (error.code === 1) {
                alert('現在地を取得できません。HTTPSで開いているか、位置情報の許可設定を確認してください。');
            }
        }
    );
}

updateCurrentLocation();

document.getElementById('current-btn').addEventListener('click', function() {
    if (currentLat !== null && currentLng !== null) {
        map.setView([currentLat, currentLng], 16);
    } else {
        updateCurrentLocation();
    }
});