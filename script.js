// Local Database Fallback
let localDB = {};

// Application State
let dailyLog = [];
let chartInstance = null;
let currentPreviewBase64 = null;
let currentAnalysis = null;
let mobilenetModel = null;

// Constants
let GOALS = {
    calories: parseInt(localStorage.getItem('auracal_goal_cals')) || 2000,
    protein: 150,
    carbs: 200,
    fat: 65
};

// DOM Elements
const els = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    cameraBtn: document.getElementById('cameraBtn'),
    imagePreview: document.getElementById('imagePreview'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    manualEntryBtn: document.getElementById('manualEntryBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),

    inputSection: document.getElementById('inputSection'),
    foodNameTitle: document.getElementById('foodNameTitle'),
    foodConfidence: document.getElementById('foodConfidence'),
    manualFoodLabel: document.getElementById('manualFoodLabel'),
    manualFoodName: document.getElementById('manualFoodName'),
    portionGrams: document.getElementById('portionGrams'),
    calculateBtn: document.getElementById('calculateBtn'),
    cancelInputBtn: document.getElementById('cancelInputBtn'),

    resultSection: document.getElementById('resultSection'),
    resultTitle: document.getElementById('resultTitle'),
    resultGrams: document.getElementById('resultGrams'),
    resCal: document.getElementById('resCal'),
    resPro: document.getElementById('resPro'),
    resCarb: document.getElementById('resCarb'),
    resFat: document.getElementById('resFat'),
    logMealBtn: document.getElementById('logMealBtn'),
    cancelMealBtn: document.getElementById('cancelMealBtn'),

    currentDate: document.getElementById('currentDate'),
    totalCal: document.getElementById('totalCal'),
    goalText: document.getElementById('goalText'),
    goalDisplayMode: document.getElementById('goalDisplayMode'),
    goalEditMode: document.getElementById('goalEditMode'),
    goalInput: document.getElementById('goalInput'),
    editGoalBtn: document.getElementById('editGoalBtn'),
    saveGoalBtn: document.getElementById('saveGoalBtn'),
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

    els.analyzeBtn.addEventListener('click', analyzeImageLocal);

    // Manual fallback triggering
    els.manualEntryBtn.addEventListener('click', () => {
        showManualEntry();
    });

    // Inputs & Calculations
    els.calculateBtn.addEventListener('click', calculateNutritionLocal);
    els.cancelInputBtn.addEventListener('click', resetUpload);

    // Results
    els.cancelMealBtn.addEventListener('click', () => {
        els.resultSection.classList.add('hidden');
        els.inputSection.classList.remove('hidden');
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

    // Goal Editing
    els.editGoalBtn.addEventListener('click', () => {
        els.goalDisplayMode.classList.add('hidden');
        els.goalEditMode.classList.remove('hidden');
        els.goalInput.value = GOALS.calories;
        els.goalInput.focus();
    });

    els.saveGoalBtn.addEventListener('click', saveGoal);
    els.goalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveGoal();
    });

    // Meal Deletion
    els.mealList.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-meal-btn');
        if (btn) {
            const id = parseInt(btn.dataset.id, 10);
            if (confirm('Are you sure you want to remove this logged meal?')) {
                dailyLog = dailyLog.filter(meal => meal.id !== id);
                saveState();
            }
        }
    });
}

function saveGoal() {
    const newGoal = parseInt(els.goalInput.value);
    if (!isNaN(newGoal) && newGoal > 0) {
        GOALS.calories = newGoal;
        localStorage.setItem('auracal_goal_cals', newGoal);
        els.goalText.textContent = `/ ${newGoal} kcal`;
        els.goalEditMode.classList.add('hidden');
        els.goalDisplayMode.classList.remove('hidden');

        // Update Chart
        if (chartInstance) {
            let totals = { calories: 0 };
            dailyLog.forEach(m => totals.calories += m.calories);
            chartInstance.data.datasets[0].data = [
                Math.round(totals.calories),
                Math.max(0, GOALS.calories - Math.round(totals.calories))
            ];
            chartInstance.update();
        }
    } else {
        alert("Please enter a valid calorie goal.");
    }
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
    // MobileNet prefers smaller sizes, 224x224 is standard, but keeping slightly larger for user preview
    const MAX_WIDTH = 500;
    const MAX_HEIGHT = 500;
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

    // Lazy load the model in the background right after an image is added, to speed up classification
    if (!mobilenetModel) {
        loadModel();
    }
}

function resetUpload() {
    currentPreviewBase64 = null;
    currentAnalysis = null;
    els.imagePreview.src = '';
    els.imagePreview.classList.add('hidden');
    els.analyzeBtn.classList.add('hidden');
    els.inputSection.classList.add('hidden');
    els.resultSection.classList.add('hidden');
    els.fileInput.value = '';

    els.manualFoodLabel.classList.add('hidden');
    els.manualFoodName.classList.add('hidden');
    els.manualFoodName.value = '';
    els.portionGrams.value = '';
}

// TFJS Local AI Models
async function loadModel() {
    if (mobilenetModel) return;
    try {
        console.log('Loading MobileNet...');
        mobilenetModel = await mobilenet.load();
        console.log('MobileNet Loaded');
    } catch (e) {
        console.error("Failed to load MobileNet model", e);
    }
}

async function analyzeImageLocal() {
    if (!currentPreviewBase64) return;

    els.loadingOverlay.classList.remove('hidden');
    els.analyzeBtn.disabled = true;

    try {
        if (!mobilenetModel) {
            await loadModel();
        }

        const imgEl = new Image();
        imgEl.src = currentPreviewBase64;
        await new Promise(r => imgEl.onload = r); // Wait for image to load to memory

        // Classify the image.
        const predictions = await mobilenetModel.classify(imgEl);

        console.log('Predictions: ', predictions);

        if (predictions && predictions.length > 0) {
            // Get the highest confidence result
            const topResult = predictions[0];
            const confidence = (topResult.probability * 100).toFixed(1);

            // Extract a cleaner label (often returns comma-separated varieties, e.g. "Granny Smith, apple")
            let label = topResult.className.split(',')[0].trim().toLowerCase();

            // Check if confidence is exceedingly low
            if (topResult.probability < 0.1) {
                showManualEntry("Food not confidently detected. Please enter manually.");
            } else {
                showInputForm(label, confidence);
            }
        } else {
            showManualEntry("No objects detected. Please enter manually.");
        }

    } catch (error) {
        console.error("TFJS Error:", error);
        showManualEntry("Image processing failed. Please enter manually.");
    } finally {
        els.loadingOverlay.classList.add('hidden');
        els.analyzeBtn.disabled = false;
    }
}

function showInputForm(detectedLabel, confidenceStr) {
    els.inputSection.classList.remove('hidden');
    els.resultSection.classList.add('hidden');

    els.foodNameTitle.textContent = detectedLabel.charAt(0).toUpperCase() + detectedLabel.slice(1);
    els.foodConfidence.textContent = confidenceStr ? `Detection confidence: ${confidenceStr}%` : "Manual Entry";

    // Hide manual food name input, show clear portion requests
    els.manualFoodLabel.classList.add('hidden');
    els.manualFoodName.classList.add('hidden');
    els.manualFoodName.value = detectedLabel; // Store it hidden so calculation knows what to match
    els.portionGrams.value = '';
    els.portionGrams.focus();

    // Scroll for mobile
    els.inputSection.scrollIntoView({ behavior: 'smooth' });
}

function showManualEntry(message = "Enter food manually") {
    els.inputSection.classList.remove('hidden');
    els.resultSection.classList.add('hidden');

    els.foodNameTitle.textContent = "Manual Entry";
    els.foodConfidence.textContent = message;

    els.manualFoodLabel.classList.remove('hidden');
    els.manualFoodName.classList.remove('hidden');
    els.manualFoodName.value = '';
    els.portionGrams.value = '';
    els.manualFoodName.focus();
}

function calculateNutritionLocal() {
    let foodQuery = els.manualFoodName.value.trim().toLowerCase();
    const grams = parseFloat(els.portionGrams.value);

    if (!foodQuery) {
        alert("Please provide a food name.");
        return;
    }

    if (isNaN(grams) || grams <= 0) {
        alert("Please enter a valid portion size in grams.");
        return;
    }

    // Fuzzy Match to local database
    let matchedEntry = null;
    let dbKeyUsed = foodQuery;

    if (localDB[foodQuery]) {
        matchedEntry = localDB[foodQuery];
    } else {
        // Find partial match
        const dbKey = Object.keys(localDB).find(k => k.includes(foodQuery) || foodQuery.includes(k));
        if (dbKey) {
            matchedEntry = localDB[dbKey];
            dbKeyUsed = dbKey;
            console.log(`Matched '${foodQuery}' to '${dbKey}' in DB`);
        }
    }

    if (!matchedEntry) {
        alert(`Sorry, "${foodQuery}" is not in our local database yet. Please try another common name (e.g. apple, pizza, rice).`);
        return;
    }

    // Calculate macros based on grams
    const multiplier = grams / 100;

    const calResult = Math.round(matchedEntry.calories_per_100g * multiplier);
    const proResult = Math.round((matchedEntry.protein_per_100g * multiplier) * 10) / 10;
    const carbResult = Math.round((matchedEntry.carbs_per_100g * multiplier) * 10) / 10;
    const fatResult = Math.round((matchedEntry.fat_per_100g * multiplier) * 10) / 10;

    // Show results
    showResult({
        food_name: dbKeyUsed.charAt(0).toUpperCase() + dbKeyUsed.slice(1),
        estimated_quantity: `${grams}g`,
        calories: calResult,
        protein: proResult,
        carbs: carbResult,
        fat: fatResult,
        image: currentPreviewBase64 || matchedEntry.image || ''
    });
}

function showResult(data) {
    currentAnalysis = data;

    els.inputSection.classList.add('hidden');
    els.resultSection.classList.remove('hidden');

    els.resultTitle.textContent = data.food_name;
    els.resultGrams.textContent = `For ${data.estimated_quantity}`;

    els.resCal.textContent = data.calories;
    els.resPro.textContent = data.protein;
    els.resCarb.textContent = data.carbs;
    els.resFat.textContent = data.fat;

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
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="meal-cals">
                    ${Math.round(meal.calories)} kcal
                </div>
                <button class="delete-meal-btn" data-id="${meal.id}" aria-label="Delete Meal" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.2s;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        els.mealList.appendChild(li);
    });

    els.totalCal.textContent = Math.round(totals.calories);
    els.goalText.textContent = `/ ${GOALS.calories} kcal`;
    els.totalPro.textContent = `${Math.round(totals.protein)}g`;
    els.totalCarb.textContent = `${Math.round(totals.carbs)}g`;
    els.totalFat.textContent = `${Math.round(totals.fat)}g`;

    // Update progress bars
    els.proBar.style.width = `${Math.min(100, (totals.protein / GOALS.protein) * 100)}%`;
    els.carbBar.style.width = `${Math.min(100, (totals.carbs / GOALS.carbs) * 100)}%`;
    els.fatBar.style.width = `${Math.min(100, (totals.fat / GOALS.fat) * 100)}%`;

    // Update Chart
    if (chartInstance) {
        chartInstance.data.datasets[0].data = [Math.round(totals.calories), Math.max(0, GOALS.calories - Math.round(totals.calories))];
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
