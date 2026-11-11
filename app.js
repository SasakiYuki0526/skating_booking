import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: 請替換為你自己的 Firebase 金鑰設定
const firebaseConfig = {
    apiKey: "AIzaSyBCqdRd1sbSY7o44d_PhvYQUfGZVZg9Tkw",
    authDomain: "skating-class.firebaseapp.com",
    projectId: "skating-class",
    storageBucket: "skating-class.firebasestorage.app",
    messagingSenderId: "215138000944",
    appId: "1:215138000944:web:39a961b1d217e5d2afcdf5",
    measurementId: "G-2TZTT70B6C"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔑 管理員密碼設定
const ADMIN_PASSWORD = "101010";
let isAdmin = false;

let allScheduleData = {};

const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

let selectedDate = getTodayStr();

function formatDate(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const calendarEl = document.getElementById('mini-calendar');
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    const adminPanel = document.getElementById('admin-panel');
    const addSlotForm = document.getElementById('add-slot-form');
    const inputDate = document.getElementById('input-date');
    const repeatWeeklyBtn = document.getElementById('batch-repeat-weekly-btn');

    inputDate.value = selectedDate;

    // 1. 管理者登入切換
    adminToggleBtn.addEventListener('click', () => {
        if (!isAdmin) {
            const pwd = prompt("請輸入管理者密碼：");
            if (pwd === ADMIN_PASSWORD) {
                isAdmin = true;
                adminToggleBtn.textContent = "🔓 已解鎖 (登出)";
                adminToggleBtn.classList.add('unlocked');
                adminPanel.classList.remove('hidden');
                renderRightSlots(selectedDate);
            } else if (pwd !== null) {
                alert("密碼錯誤！");
            }
        } else {
            isAdmin = false;
            adminToggleBtn.textContent = "🔑 管理員登入";
            adminToggleBtn.classList.remove('unlocked');
            adminPanel.classList.add('hidden');
            renderRightSlots(selectedDate);
        }
    });

    // 輔助函式：將 start/end 時間組合為標準字串 (例如 "09:00 - 10:00")
    function getTimeRangeString() {
        const startTime = document.getElementById('input-start-time').value;
        const endTime = document.getElementById('input-end-time').value;
        if (!startTime || !endTime) return null;
        return `${startTime} - ${endTime}`;
    }

    // 2. 單筆時段新增 (預設開放預約，組合時間滾盤)
    addSlotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dateVal = document.getElementById('input-date').value;
        const timeVal = getTimeRangeString();

        if (!dateVal || !timeVal) {
            alert("請完整選擇開始與結束時間！");
            return;
        }

        // 防重檢查
        const existingSlots = allScheduleData[dateVal] || [];
        const isDuplicate = existingSlots.some(slot => slot.time === timeVal);

        if (isDuplicate) {
            alert(`新增失敗：${dateVal} 已經存在「${timeVal}」這個時段了！`);
            return;
        }

        try {
            await addDoc(collection(db, "schedule"), {
                date: dateVal,
                time: timeVal,
                isAvailable: true // 💡 預設皆為開放預約 (綠框)
            });
            alert("新增時段成功！");
        } catch (error) {
            console.error("新增失敗：", error);
            alert("新增失敗，請檢查 console 訊息");
        }
    });

    // 3. ⚡ 一鍵每週反覆新增時段
    if (repeatWeeklyBtn) {
        repeatWeeklyBtn.addEventListener('click', async () => {
            const baseDateStr = inputDate.value;
            const timeVal = getTimeRangeString();
            const weeks = parseInt(document.getElementById('repeat-weeks').value, 10);

            if (!baseDateStr || !timeVal) {
                alert("請先選擇「起始日期」與完整的「開始/結束時間」！");
                return;
            }

            if (!confirm(`確定要從 ${baseDateStr} 開始，將時段「${timeVal}」連續新增未來 ${weeks} 週嗎？`)) {
                return;
            }

            try {
                const batch = writeBatch(db);
                const scheduleRef = collection(db, "schedule");

                const [year, month, day] = baseDateStr.split('-').map(Number);
                let currentDate = new Date(year, month - 1, day);

                let addedCount = 0;
                let skippedCount = 0;

                for (let i = 0; i < weeks; i++) {
                    const y = currentDate.getFullYear();
                    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const d = String(currentDate.getDate()).padStart(2, '0');
                    const targetDateStr = `${y}-${m}-${d}`;

                    const existingSlots = allScheduleData[targetDateStr] || [];
                    const isDuplicate = existingSlots.some(slot => slot.time === timeVal);

                    if (isDuplicate) {
                        skippedCount++;
                    } else {
                        const newDocRef = doc(scheduleRef);
                        batch.set(newDocRef, {
                            date: targetDateStr,
                            time: timeVal,
                            isAvailable: true // 💡 預設皆為開放預約
                        });
                        addedCount++;
                    }

                    currentDate.setDate(currentDate.getDate() + 7);
                }

                if (addedCount > 0) {
                    await batch.commit();
                }

                let resultMessage = `批次處理完成！\n成功新增：${addedCount} 個週次`;
                if (skippedCount > 0) {
                    resultMessage += `\n自動跳過（已存在相同時段）：${skippedCount} 個週次`;
                }
                alert(resultMessage);

            } catch (error) {
                console.error("每週批量新增失敗：", error);
                alert("新增失敗，請檢查 Console 錯誤訊息。");
            }
        });
    }

    // 4. 初始化月曆
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'zh-tw',
        headerToolbar: {
            left: 'prev',
            center: 'title',
            right: 'next'
        },
        dateClick: function (info) {
            selectedDate = info.dateStr;
            inputDate.value = selectedDate;
            renderRightSlots(selectedDate);
        },
        dayCellDidMount: function (info) {
            const dateStr = formatDate(info.date);
            renderCellDots(info.el, dateStr);
        }
    });

    calendar.render();

    // 渲染日曆綠/灰圓點
    function renderCellDots(cellEl, dateStr) {
        const daySlots = allScheduleData[dateStr] || [];

        const frameEl = cellEl.querySelector('.fc-daygrid-day-frame');
        if (!frameEl) return;

        // 先移除舊的圓點容器
        const oldContainer = frameEl.querySelector('.dots-container');
        if (oldContainer) oldContainer.remove();

        // 無時段就不顯示圓點
        if (daySlots.length === 0) return;

        // 只要當天有任意一個 isAvailable === true 就顯示綠點，否則灰點
        const hasAvailable = daySlots.some(s => s.isAvailable);

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'dots-container';

        const dot = document.createElement('span');
        dot.className = hasAvailable ? 'dot-available' : 'dot-booked';
        dot.title = hasAvailable ? '有可預約時段' : '已額滿';

        dotsContainer.appendChild(dot);
        frameEl.appendChild(dotsContainer);
    }

    // 重新更新目前畫面上所有日期儲存格的圓點
    function refreshAllDots() {
        const dayCells = document.querySelectorAll('.fc-daygrid-day');
        dayCells.forEach(cell => {
            const dateStr = cell.getAttribute('data-date');
            if (dateStr) {
                renderCellDots(cell, dateStr);
            }
        });
    }

    // 5. Firebase 即時連動
    onSnapshot(collection(db, "schedule"), (snapshot) => {
        allScheduleData = {};

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!allScheduleData[data.date]) {
                allScheduleData[data.date] = [];
            }
            allScheduleData[data.date].push({ id: doc.id, ...data });
        });

        // 資料更新時，立即重繪圓點與右側清單
        refreshAllDots();
        renderRightSlots(selectedDate);
    });

    // 渲染日曆綠/灰圓點
    function renderCellDots(cellEl, dateStr) {
        const daySlots = allScheduleData[dateStr] || [];
        if (daySlots.length === 0) return;

        const hasAvailable = daySlots.some(s => s.isAvailable);

        const frameEl = cellEl.querySelector('.fc-daygrid-day-frame');
        if (!frameEl) return;

        const oldContainer = frameEl.querySelector('.dots-container');
        if (oldContainer) oldContainer.remove();

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'dots-container';

        const dot = document.createElement('span');
        dot.className = hasAvailable ? 'dot-available' : 'dot-booked';
        dot.title = hasAvailable ? '有可預約時段' : '已額滿';

        dotsContainer.appendChild(dot);
        frameEl.appendChild(dotsContainer);
    }

    // 渲染右側膠囊卡片 (含 🚫 標記已預約 與 ✕ 刪除)
    // 渲染右側膠囊卡片 (含 🚫 標記已預約、✅ 釋出回復可預約 與 ✕ 刪除)
    function renderRightSlots(dateStr) {
        const titleEl = document.getElementById('selected-date-title');
        const container = document.getElementById('slots-container');
        
        titleEl.textContent = `${dateStr} 時段狀況`;
        container.innerHTML = '';

        const slots = allScheduleData[dateStr] || [];

        if (slots.length === 0) {
            container.innerHTML = `<p class="placeholder-text">當天未排定任何時段</p>`;
            return;
        }

        slots.sort((a, b) => a.time.localeCompare(b.time));

        slots.forEach((slot) => {
            const card = document.createElement('div');
            const isAvail = slot.isAvailable;

            card.className = `slot-card ${isAvail ? 'available' : 'booked'} ${isAdmin ? 'clickable' : ''}`;
            
            // 💡 依據狀態顯示對應按鈕：可預約顯示 🚫，已預約顯示 ✅ (釋出回復)
            card.innerHTML = `
                <span>${slot.time}</span>
                <span class="status-subtext">${isAvail ? '可預約' : '已預約'}</span>
                ${isAdmin ? `
                    <div class="admin-actions">
                        ${isAvail 
                            ? `<button class="book-btn" title="標記為已預約">🚫</button>` 
                            : `<button class="release-btn" title="釋出時段 (回復可預約)">✅</button>`
                        }
                        <button class="delete-btn" title="刪除時段">✕</button>
                    </div>
                ` : ''}
            `;

            if (isAdmin) {
                // 點擊卡片本體：切換狀態 (可預約 <-> 已預約)
                card.addEventListener('click', async (e) => {
                    if (e.target.closest('.admin-actions')) return; // 防止點擊按鈕觸發卡片事件
                    try {
                        const slotRef = doc(db, "schedule", slot.id);
                        await updateDoc(slotRef, { isAvailable: !isAvail });
                    } catch (err) {
                        console.error("更新失敗：", err);
                    }
                });

                // 點擊 🚫 按鈕：標記為已預約
                const bookBtn = card.querySelector('.book-btn');
                if (bookBtn) {
                    bookBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            const slotRef = doc(db, "schedule", slot.id);
                            await updateDoc(slotRef, { isAvailable: false });
                        } catch (err) {
                            console.error("更新失敗：", err);
                        }
                    });
                }

                // 💡 點擊 ✅ 按鈕：釋出時段 (回復為可預約)
                const releaseBtn = card.querySelector('.release-btn');
                if (releaseBtn) {
                    releaseBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            const slotRef = doc(db, "schedule", slot.id);
                            await updateDoc(slotRef, { isAvailable: true });
                        } catch (err) {
                            console.error("釋出時段失敗：", err);
                        }
                    });
                }

                // 點擊 ✕ 按鈕：刪除時段
                const delBtn = card.querySelector('.delete-btn');
                if (delBtn) {
                    delBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`確定要刪除 ${slot.time} 這個時段嗎？`)) {
                            try {
                                await deleteDoc(doc(db, "schedule", slot.id));
                            } catch (err) {
                                console.error("刪除失敗：", err);
                            }
                        }
                    });
                }
            }

            container.appendChild(card);
        });
    }


    const startTimeInput = document.getElementById('input-start-time');
    const endTimeInput = document.getElementById('input-end-time');

    // 💡 當開始時間改變時，自動計算 +40 分鐘並帶入結束時間
    startTimeInput.addEventListener('change', () => {
        const val = startTimeInput.value; // 格式如 "14:00"
        if (!val) {
            endTimeInput.value = "";
            return;
        }

        const [hours, minutes] = val.split(':').map(Number);

        // 建立臨時 Date 物件進行加算
        const date = new Date();
        date.setHours(hours, minutes + 40, 0, 0);

        const endHours = String(date.getHours()).padStart(2, '0');
        const endMinutes = String(date.getMinutes()).padStart(2, '0');

        endTimeInput.value = `${endHours}:${endMinutes}`;
    });
});
