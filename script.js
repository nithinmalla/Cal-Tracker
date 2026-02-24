// Local Database Fallback
let localDB = {};

// Application State
let dailyLog = [];
let apiKey = localStorage.getItem('auracal_apikey') || '';
let chartInstance = null;
let currentPreviewBase64 = null;
let currentAnalysis = null;

// Constants
const GOALS = {
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65
};

// DOM Elements
const els = {
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    apiKeyInput: document.getElementById('apiKey'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),

    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    cameraBtn: document.getElementById('cameraBtn'),
    imagePreview: document.getElementById('imagePreview'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),

    resultSection: document.getElementById('resultSection'),
    foodNameTitle: document.getElementById('foodNameTitle'),
    foodQuantity: document.getElementById('foodQuantity'),
    resCal: document.getElementById('resCal'),
    resPro: document.getElementById('resPro'),
    resCarb: document.getElementById('resCarb'),
    resFat: document.getElementById('resFat'),
    logMealBtn: document.getElementById('logMealBtn'),
    cancelMealBtn: document.getElementById('cancelMealBtn'),

    currentDate: document.getElementById('currentDate'),
    totalCal: document.getElementById('totalCal'),
    totalPro: document.getElementById('totalPro'),
    totalCarb: document.getElementById('totalCarb'),
    totalFat: document.getElementById('totalFat'),
    proBar: document.getElementById('proBar'),
    carbBar: document.getElementById('carbBar'),
    fatBar: document.getElementById('fatBar'),
    calChart: document.getElementById('calChart'),

    mealList: document.getElementById('mealList')
};

// Initialization
async function init() {
    await loadLocalDB();
    loadState();
    checkMidnightReset();
    updateUI();
    setupEventListeners();
    initChart();
}

async function loadLocalDB() {
    try {
        const res = await fetch('calories.json');
        localDB = await res.json();
    } catch (e) {
        console.warn('Could not load local localDB', e);
    }
}

function loadState() {
    const saved = localStorage.getItem('auracal_log');
    if (saved) {
        try {
            dailyLog = JSON.parse(saved);
        } catch (e) {
            dailyLog = [];
        }
    }
}

function saveState() {
    localStorage.setItem('auracal_log', JSON.stringify(dailyLog));
    localStorage.setItem('auracal_last_date', new Date().toDateString());
    updateUI();
}

function checkMidnightReset() {
    const lastDate = localStorage.getItem('auracal_last_date');
    const today = new Date().toDateString();
    if (lastDate && lastDate !== today) {
        dailyLog = [];
        saveState();
    }
}

// Event Listeners
function setupEventListeners() {
    // Settings
    els.settingsBtn.addEventListener('click', () => {
        els.apiKeyInput.value = apiKey;
        els.settingsModal.classList.remove('hidden');
    });

    els.closeSettingsBtn.addEventListener('click', () => els.settingsModal.classList.add('hidden'));

    els.saveSettingsBtn.addEventListener('click', () => {
        apiKey = els.apiKeyInput.value.trim();
        localStorage.setItem('auracal_apikey', apiKey);
        els.settingsModal.classList.add('hidden');
    });

    // Upload
    els.dropZone.addEventListener('click', (e) => {
        if (e.target !== els.cameraBtn) els.fileInput.click();
    });

    els.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.dropZone.classList.add('dragover');
    });

    els.dropZone.addEventListener('dragleave', () => {
        els.dropZone.classList.remove('dragover');
    });

    els.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        els.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    els.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    els.cameraBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.fileInput.setAttribute('capture', 'environment');
        els.fileInput.click();
        els.fileInput.removeAttribute('capture');
    });

    els.analyzeBtn.addEventListener('click', analyzeImage);

    // Result
    els.cancelMealBtn.addEventListener('click', () => {
        resetUpload();
    });

    els.logMealBtn.addEventListener('click', () => {
        if (currentAnalysis) {
            dailyLog.push({
                ...currentAnalysis,
                id: Date.now(),
                timestamp: new Date().toISOString()
            });
            saveState();
            resetUpload();
        }
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === els.settingsModal) {
            els.settingsModal.classList.add('hidden');
        }
    });
}

// Image Handling
function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => compressImage(img);
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function compressImage(img) {
    const MAX_WIDTH = 800;
    const MAX_HEIGHT = 800;
    let width = img.width;
    let height = img.height;

    if (width > height) {
        if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
        }
    } else {
        if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    // Get base64 (JPEG, quality 0.8)
    const base64Str = canvas.toDataURL('image/jpeg', 0.8);
    currentPreviewBase64 = base64Str;

    // Show preview
    els.imagePreview.src = base64Str;
    els.imagePreview.classList.remove('hidden');
    els.analyzeBtn.classList.remove('hidden');
}

function resetUpload() {
    currentPreviewBase64 = null;
    currentAnalysis = null;
    els.imagePreview.src = '';
    els.imagePreview.classList.add('hidden');
    els.analyzeBtn.classList.add('hidden');
    els.resultSection.classList.add('hidden');
    els.fileInput.value = '';
}

// AI Analysis
async function analyzeImage() {
    if (!apiKey) {
        alert('Please set your OpenAI API Key in settings first.');
        els.settingsModal.classList.remove('hidden');
        return;
    }

    if (!currentPreviewBase64) return;

    els.loadingOverlay.classList.remove('hidden');
    els.analyzeBtn.disabled = true;

    try {
        const base64Data = currentPreviewBase64.split(',')[1];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert nutritionist AI. Analyze the food image. Provide a conservative estimate of calories and macros.
Assume Indian food possibilities if spicy/curry looking. 
If multiple foods, list the primary one only.
You MUST return ONLY strictly structured JSON:
{
  "food_name": "Name of food",
  "estimated_quantity": "e.g., 1 bowl or 200g",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0
}`
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}`, detail: 'low' } }
                        ]
                    }
                ],
                max_tokens: 300,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        let parsed = JSON.parse(content);

        // Ensure numbers
        parsed.calories = Number(parsed.calories) || 0;
        parsed.protein = Number(parsed.protein) || 0;
        parsed.carbs = Number(parsed.carbs) || 0;
        parsed.fat = Number(parsed.fat) || 0;
        parsed.image = currentPreviewBase64;

        showResult(parsed);

    } catch (error) {
        console.error(error);
        if (confirm('AI analysis failed. Fallback to local database estimation?')) {
            fallbackEstimation();
        }
    } finally {
        els.loadingOverlay.classList.add('hidden');
        els.analyzeBtn.disabled = false;
    }
}

function fallbackEstimation() {
    const foodName = prompt("Could not detect image (or API error). Enter food name:");
    if (!foodName) return;

    const key = foodName.toLowerCase().replace(/ /g, '_');
    let entry = localDB[key];

    if (!entry) {
        // Find partial match
        const dbKey = Object.keys(localDB).find(k => k.includes(key) || key.includes(k));
        if (dbKey) entry = localDB[dbKey];
    }

    if (entry) {
        showResult({
            food_name: foodName,
            estimated_quantity: "1 standard serving",
            calories: entry.calories,
            protein: entry.protein,
            carbs: entry.carbs,
            fat: entry.fat,
            image: entry.image || ''
        });
    } else {
        alert("Food not found in local database.");
    }
}

function showResult(data) {
    currentAnalysis = data;
    els.foodNameTitle.textContent = data.food_name || 'Unknown Food';
    els.foodQuantity.textContent = `Estimated portion: ${data.estimated_quantity || '-'}`;

    els.resCal.textContent = data.calories;
    els.resPro.textContent = data.protein;
    els.resCarb.textContent = data.carbs;
    els.resFat.textContent = data.fat;

    els.resultSection.classList.remove('hidden');
    els.resultSection.scrollIntoView({ behavior: 'smooth' });
}

// UI Updates
function updateUI() {
    els.currentDate.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    els.mealList.innerHTML = '';

    if (dailyLog.length === 0) {
        els.mealList.innerHTML = '<li class="meal-item"><center style="width:100%; color: var(--text-secondary)">No meals logged today yet.</center></li>';
    }

    dailyLog.forEach(meal => {
        totals.calories += meal.calories;
        totals.protein += meal.protein;
        totals.carbs += meal.carbs;
        totals.fat += meal.fat;

        const li = document.createElement('li');
        li.className = 'meal-item';
        const time = new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const imgHtml = meal.image ? `<img src="${meal.image}" alt="${meal.food_name}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; margin-right: 14px; flex-shrink: 0; box-shadow: 2px 2px 4px var(--shadow-dark);">` : `<div style="width: 44px; height: 44px; border-radius: 8px; background: var(--bg-dark); box-shadow: inset 2px 2px 4px var(--shadow-dark); margin-right: 14px; display:flex; align-items:center; justify-content:center; flex-shrink: 0;">🍽️</div>`;

        li.innerHTML = `
            <div style="display: flex; align-items: center; overflow: hidden;">
                ${imgHtml}
                <div class="meal-info">
                    <h4>${meal.food_name}</h4>
                    <p>${time} • ${meal.estimated_quantity}</p>
                </div>
            </div>
            <div class="meal-cals">
                ${meal.calories} kcal
            </div>
        `;
        els.mealList.appendChild(li);
    });

    els.totalCal.textContent = totals.calories;
    els.totalPro.textContent = `${totals.protein}g`;
    els.totalCarb.textContent = `${totals.carbs}g`;
    els.totalFat.textContent = `${totals.fat}g`;

    // Update progress bars
    els.proBar.style.width = `${Math.min(100, (totals.protein / GOALS.protein) * 100)}%`;
    els.carbBar.style.width = `${Math.min(100, (totals.carbs / GOALS.carbs) * 100)}%`;
    els.fatBar.style.width = `${Math.min(100, (totals.fat / GOALS.fat) * 100)}%`;

    // Update Chart
    if (chartInstance) {
        chartInstance.data.datasets[0].data = [totals.calories, Math.max(0, GOALS.calories - totals.calories)];
        chartInstance.update();
    }
}

function initChart() {
    if (!window.Chart) {
        setTimeout(initChart, 100);
        return;
    }

    const ctx = els.calChart.getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Consumed', 'Remaining'],
            datasets: [{
                data: [0, GOALS.calories],
                backgroundColor: ['#2e2842', '#e2e8f0'],
                borderWidth: 0,
                borderRadius: 4,
                cutout: '80%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
    // Trigger update for initial data
    updateUI();
}

// Start App
document.addEventListener('DOMContentLoaded', init);
