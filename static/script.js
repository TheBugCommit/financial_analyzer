let allTransactions = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchData();

    document.getElementById('rule-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const concept = document.getElementById('rule-concept').value;
        const category = document.getElementById('rule-category').value;
        
        await addRule(concept, category);
        
        // Reset form and refetch data
        document.getElementById('rule-concept').value = '';
        document.getElementById('loading-summary').classList.remove('hidden');
        document.getElementById('summary-cards').classList.add('hidden');
        fetchData();
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        renderTransactions(e.target.value);
    });
});

async function fetchData() {
    try {
        const start = document.getElementById('filter-start-date').value;
        const end = document.getElementById('filter-end-date').value;
        const cat = document.getElementById('filter-category').value;
        
        let url = '/api/data?';
        if (start) url += `start_date=${start}&`;
        if (end) url += `end_date=${end}&`;
        if (cat) url += `category=${encodeURIComponent(cat)}`;

        const response = await fetch(url);
        const data = await response.json();
        
        allTransactions = data.transactions;
        allRules = data.rules;
        globalSummary = data.summary;
        globalCatSummary = data.cat_summary;
        
        renderSummary(data.summary);
        renderTransactions();
        renderRules(data.rules);
        renderCategories(data.categories);
        renderFilterCategories(data.categories);
        renderAnalytics(data.cat_summary, data.cat_details);
        renderBalanceChart(data.summary);
        renderKeyStats(allTransactions, data.cat_summary);
        
        document.getElementById('loading-summary').classList.add('hidden');
        document.getElementById('summary-cards').classList.remove('hidden');
        document.getElementById('analytics-section').classList.remove('hidden');
        document.getElementById('ai-insights-section').classList.remove('hidden');
        document.getElementById('transactions-table').classList.remove('hidden');
    } catch (error) {
        console.error("Error fetching data:", error);
        document.getElementById('loading-summary').innerText = "Error carregant les dades. Revisa la consola.";
    }
}

function renderSummary(summaryData) {
    const container = document.getElementById('summary-cards');
    container.innerHTML = '';

    // Sort by month
    summaryData.sort((a, b) => a.Mes.localeCompare(b.Mes));

    summaryData.forEach(month => {
        const balanceNomina = parseFloat(month.Balanç_vs_Nomina);
        const balanceColor = balanceNomina >= 0 ? 'positive' : 'negative';
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h3>Mes: ${month.Mes}</h3>
            <div class="card-row">
                <span>Nòmina:</span>
                <span class="amount positive">${formatCurrency(month.Nomina)}</span>
            </div>
            <div class="card-row">
                <span>Altres Ing.:</span>
                <span class="amount positive">${formatCurrency(month.Altres_Ingressos)}</span>
            </div>
            <div class="card-row">
                <span>Despeses:</span>
                <span class="amount negative">-${formatCurrency(month.Despeses)}</span>
            </div>
            <div class="balance">
                <span>Balanç vs Nòmina:</span>
                <span class="${balanceColor}">${formatCurrency(balanceNomina)}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderTransactions(filterText = '') {
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';

    const lowerFilter = filterText.toLowerCase();
    
    const filtered = allTransactions.filter(t => 
        t.Concepto.toLowerCase().includes(lowerFilter) || 
        (t.Categoria && t.Categoria.toLowerCase().includes(lowerFilter))
    );

    filtered.forEach(t => {
        const tr = document.createElement('tr');
        const amountClass = t.Importe > 0 ? 'positive' : 'negative';
        const sign = t.Importe > 0 ? '+' : '';
        
        tr.innerHTML = `
            <td>${t.Fecha}</td>
            <td>${t.Concepto}</td>
            <td class="${amountClass} amount">${sign}${formatCurrency(t.Importe)}</td>
            <td><span class="badge">${t.Categoria || 'Sense Categoria'}</span></td>
            <td>
                <button class="btn-small" onclick="quickRule('${t.Concepto}')">Fixar Regla</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderRules(rules) {
    const list = document.getElementById('rules-list');
    list.innerHTML = '';

    for (const [concept, category] of Object.entries(rules)) {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="rule-info">
                <span class="rule-concept">${concept}</span>
                <span class="rule-cat">→ ${category}</span>
            </div>
            <button class="btn-danger" onclick="deleteRule('${concept}')">X</button>
        `;
        list.appendChild(li);
    }
}

function renderCategories(categories) {
    const dataList = document.getElementById('categories-list');
    dataList.innerHTML = '';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        dataList.appendChild(option);
    });
}

function renderFilterCategories(categories) {
    const select = document.getElementById('filter-category');
    const current = select.value;
    select.innerHTML = '<option value="Totes">Totes</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.innerText = cat;
        if (cat === current) option.selected = true;
        select.appendChild(option);
    });
}

window.applyFilters = function() {
    document.getElementById('loading-summary').classList.remove('hidden');
    document.getElementById('summary-cards').classList.add('hidden');
    document.getElementById('analytics-section').classList.add('hidden');
    document.getElementById('ai-insights-section').classList.add('hidden');
    fetchData();
}

window.uploadCSV = async function() {
    const fileInput = document.getElementById('csv-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert("Selecciona un arxiu CSV primer.");
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    const btn = document.getElementById('upload-btn');
    btn.innerText = "Pujant...";
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (response.ok) {
            alert("Arxiu pujat i processat correctament!");
            // Reset filters to view all data from new file
            document.getElementById('filter-start-date').value = '';
            document.getElementById('filter-end-date').value = '';
            document.getElementById('filter-category').value = 'Totes';
            applyFilters();
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        alert("Error de connexió.");
    } finally {
        btn.innerText = "Pujar";
        btn.disabled = false;
        fileInput.value = '';
    }
}

window.quickRule = function(concept) {
    // Fill the form and focus
    const input = document.getElementById('rule-concept');
    input.value = concept;
    input.focus();
}

let chartInstance = null;
let balanceChartInstance = null;

function renderBalanceChart(summary) {
    const ctx = document.getElementById('balanceChart').getContext('2d');
    
    // Sort summary by month
    summary.sort((a, b) => a.Mes.localeCompare(b.Mes));

    const labels = summary.map(s => s.Mes);
    const inData = summary.map(s => s.Nomina + s.Altres_Ingressos);
    const outData = summary.map(s => s.Despeses);
    const balanceData = summary.map(s => (s.Nomina + s.Altres_Ingressos) - s.Despeses);

    if (balanceChartInstance) balanceChartInstance.destroy();

    balanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ingressos',
                    data: inData,
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Despeses',
                    data: outData,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Balanç Final',
                    data: balanceData,
                    type: 'line',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 3,
                    pointBackgroundColor: 'white',
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#f8fafc' } },
                x: { grid: { display: false }, ticks: { color: '#f8fafc' } }
            },
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            }
        }
    });
}

function renderKeyStats(transactions, catSummary) {
    // Filter to only expenses (Importe < 0 and not Hucha)
    // Wait, the API returns transactions with negative amounts for expenses.
    // Bizums are positive amounts, but mapped to expense categories.
    // To make it easy, we will calculate stats from transactions directly.
    const expenseCats = catSummary.map(c => c.Categoria);
    const expenses = transactions.filter(t => expenseCats.includes(t.Categoria));
    
    // Average daily spend
    let totalSpend = catSummary.reduce((sum, cat) => sum + cat.Importe, 0);
    
    // Find unique days
    const uniqueDays = new Set(expenses.map(t => t.Fecha)).size;
    const avgDaily = uniqueDays > 0 ? (totalSpend / uniqueDays).toFixed(2) : '0.00';
    document.getElementById('stat-daily-avg').innerText = avgDaily + ' €/dia actiu';
    
    // Max single expense (Importe is negative, so min value)
    let maxExpense = null;
    expenses.forEach(t => {
        if (t.Importe < 0) {
            if (!maxExpense || t.Importe < maxExpense.Importe) {
                maxExpense = t;
            }
        }
    });
    
    if (maxExpense) {
        document.getElementById('stat-max-exp').innerHTML = `${Math.abs(maxExpense.Importe).toFixed(2)} €<br><small style="font-size:0.8rem; opacity:0.7">${maxExpense.Concepto}</small>`;
    } else {
        document.getElementById('stat-max-exp').innerText = '-';
    }
    
    document.getElementById('stat-cat-count').innerText = catSummary.length;
}

window.fetchInsights = async function() {
    const btn = document.getElementById('ai-btn');
    btn.innerText = "🧠 Analitzant...";
    btn.disabled = true;
    document.getElementById('ai-content').classList.add('hidden');
    
    try {
        const response = await fetch('/api/insights', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                summary: globalSummary,
                cat_summary: globalCatSummary
            })
        });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        
        const alist = document.getElementById('ai-analysis-list');
        const rlist = document.getElementById('ai-recommendations-list');
        alist.innerHTML = '';
        rlist.innerHTML = '';
        
        if (data.analisi) {
            data.analisi.forEach(p => {
                const li = document.createElement('li');
                li.innerText = p;
                alist.appendChild(li);
            });
        }
        
        if (data.recomanacions) {
            data.recomanacions.forEach(p => {
                const li = document.createElement('li');
                li.innerText = p;
                rlist.appendChild(li);
            });
        }
        
        document.getElementById('ai-content').classList.remove('hidden');
    } catch(e) {
        alert("Error obtenint insights: " + e);
    } finally {
        btn.innerText = "Re-analitzar";
        btn.disabled = false;
    }
}

function renderAnalytics(catSummary, catDetails) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    // Sort summary to get top categories
    catSummary.sort((a, b) => b.Importe - a.Importe);
    
    const labels = catSummary.map(c => c.Categoria);
    const data = catSummary.map(c => c.Importe);
    const colors = labels.map((_, i) => `hsl(${(i * 360) / labels.length}, 70%, 60%)`);

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right', labels: { color: '#f8fafc' } }
            }
        }
    });

    const drillContainer = document.getElementById('category-drill-down');
    drillContainer.innerHTML = '';
    
    catSummary.forEach(cat => {
        const catName = cat.Categoria;
        const catTotal = cat.Importe;
        
        const details = catDetails.filter(d => d.Categoria === catName);
        
        const el = document.createElement('div');
        el.className = 'drill-category';
        
        let detailsHtml = details.map(d => `
            <div class="drill-item">
                <span class="concept" title="${d.Concepto}">${d.Concepto}</span>
                <span class="amount negative">-${formatCurrency(d.Importe)}</span>
            </div>
        `).join('');
        
        el.innerHTML = `
            <div class="drill-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                <span>${catName}</span>
                <span class="amount negative">-${formatCurrency(catTotal)}</span>
            </div>
            <div class="drill-details hidden">
                ${detailsHtml}
            </div>
        `;
        
        drillContainer.appendChild(el);
    });
}

window.deleteRule = async function(concept) {
    if(confirm(`Eliminar regla per "${concept}"?`)) {
        await fetch('/api/rules', {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ concept })
        });
        
        document.getElementById('loading-summary').classList.remove('hidden');
        document.getElementById('summary-cards').classList.add('hidden');
        fetchData();
    }
}

async function addRule(concept, category) {
    await fetch('/api/rules', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ concept, category })
    });
}

function formatCurrency(value) {
    return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' }).format(value);
}
