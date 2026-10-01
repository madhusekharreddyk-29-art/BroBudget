/**
 * ============================================================================
 * BroBudget - Analytics, Savings Goals & Monthly Reports Module
 * Developer 3 (Analytics, Charts, Insights, Savings Goals, Reports)
 * 
 * GitHub Team Architecture Guidelines:
 * - Function prefixes: `bbAnalytics*`, `bbSavings*`, `bbReports*`
 * - Dual Chart Engine: Chart.js CDN with pure HTML5 Canvas fallback (100% offline-ready)
 * - Reads shared LocalStorage: `brobudget_transactions_v1` and `savingsGoals`
 * - Public API exported at `window.BBAnalytics`
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Constants & Configuration
  // --------------------------------------------------------------------------
  const BB_TRANSACTIONS_KEY = 'brobudget_transactions_v1';
  const BB_SAVINGS_GOALS_KEY = 'savingsGoals';
  const BB_DASHBOARD_KEY = 'brobudget_financial_data_v1';

  const bbMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const bbCategoryColors = {
    food: '#f43f5e',
    rent: '#06b6d4',
    transport: '#8b5cf6',
    shopping: '#ec4899',
    education: '#10b981',
    entertainment: '#f59e0b',
    health: '#3b82f6',
    bills: '#6366f1',
    other: '#94a3b8'
  };

  // --------------------------------------------------------------------------
  // 2. Application State
  // --------------------------------------------------------------------------
  let bbAnalyticsState = {
    transactions: [],
    monthlySummary: {}, // { '2026-0': { income, expenses, savings, categories: {}, count } }
    savingsGoals: [],
    activeReportMonthKey: '2026-9', // Default to October
    historySortColumn: 'month',
    historySortAsc: false,
    chartInstances: {
      categoryDoughnut: null,
      incomeExpenseBar: null,
      savingsLine: null
    }
  };

  // --------------------------------------------------------------------------
  // 3. LocalStorage & Seed Data Handlers
  // --------------------------------------------------------------------------
  /**
   * Retrieves transactions from shared storage or Developer 1's store
   */
  function bbAnalyticsGetTransactions() {
    try {
      const stored = localStorage.getItem(BB_TRANSACTIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('BroBudget Analytics: Unable to read transactions from LocalStorage.', e);
    }
    return [];
  }

  /**
   * Retrieves savings goals from storage or loads initial demo goals
   */
  function bbSavingsGetGoals() {
    try {
      const stored = localStorage.getItem(BB_SAVINGS_GOALS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('BroBudget Analytics: Unable to read savings goals.', e);
    }

    // Default Seed Goals
    const seedGoals = [
      {
        id: 1,
        name: '🎓 New Laptop',
        targetAmount: 80000,
        currentSaved: 35000,
        targetDate: '2026-12-31'
      },
      {
        id: 2,
        name: '🚗 Car Downpayment',
        targetAmount: 200000,
        currentSaved: 110000,
        targetDate: '2027-04-30'
      },
      {
        id: 3,
        name: '🏖️ Bali Vacation',
        targetAmount: 50000,
        currentSaved: 50000,
        targetDate: '2026-11-15'
      }
    ];
    bbSavingsSaveGoals(seedGoals);
    return seedGoals;
  }

  /**
   * Persists savings goals to LocalStorage
   */
  function bbSavingsSaveGoals(goals) {
    try {
      localStorage.setItem(BB_SAVINGS_GOALS_KEY, JSON.stringify(goals));
      bbAnalyticsState.savingsGoals = goals;
    } catch (e) {
      console.error('BroBudget Analytics: Failed to save savings goals.', e);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Monthly Aggregation Engine
  // --------------------------------------------------------------------------
  /**
   * Builds an aggregated multi-month dataset from transactions and dashboard records.
   * Handles empty storage, missing categories, and guarantees zero NaN values.
   */
  function bbAnalyticsBuildMonthlySummary() {
    const summary = {};

    // 1. Seed months from Developer 1's dashboard store if available
    try {
      const storedDash = localStorage.getItem(BB_DASHBOARD_KEY);
      if (storedDash) {
        const dashData = JSON.parse(storedDash);
        if (dashData && dashData.months) {
          Object.keys(dashData.months).forEach(key => {
            const m = dashData.months[key];
            const inc = Number(m.income) || 0;
            const exp = Number(m.expenses) || 0;
            summary[key] = {
              income: inc,
              expenses: exp,
              savings: inc - exp,
              savingsPercentage: inc > 0 ? Number(((inc - exp) / inc * 100).toFixed(1)) : 0,
              categories: { ...(m.categories || {}) },
              transactionsCount: m.transactionsCount || 10
            };
          });
        }
      }
    } catch (e) {
      console.warn('Dashboard data aggregation fallback.', e);
    }

    // Default multi-month baseline if dashboard store was empty
    if (Object.keys(summary).length === 0) {
      const defaultMonths = {
        '2026-6': { income: 52000, expenses: 33000, categories: { rent: 12000, food: 9000, transport: 4000, utilities: 4000, entertainment: 4000 } },
        '2026-7': { income: 54000, expenses: 32000, categories: { rent: 12000, food: 9000, transport: 4000, utilities: 3500, entertainment: 3500 } },
        '2026-8': { income: 54000, expenses: 31000, categories: { rent: 12000, food: 8500, transport: 3800, utilities: 3200, entertainment: 3500 } },
        '2026-9': { income: 50000, expenses: 30000, categories: { rent: 12000, food: 8000, transport: 3500, utilities: 3500, entertainment: 3000 } },
        '2026-10': { income: 55000, expenses: 33000, categories: { rent: 12000, food: 9000, transport: 4000, utilities: 4000, entertainment: 4000 } },
        '2026-11': { income: 60000, expenses: 38000, categories: { rent: 12000, food: 11000, transport: 5000, utilities: 4500, entertainment: 5500 } }
      };

      Object.keys(defaultMonths).forEach(key => {
        const m = defaultMonths[key];
        const inc = m.income;
        const exp = m.expenses;
        summary[key] = {
          income: inc,
          expenses: exp,
          savings: inc - exp,
          savingsPercentage: Number(((inc - exp) / inc * 100).toFixed(1)),
          categories: { ...m.categories },
          transactionsCount: 14
        };
      });
    }

    // 2. Aggregate granular transactions from Developer 2
    const txList = bbAnalyticsState.transactions;
    if (txList.length > 0) {
      txList.forEach(t => {
        if (!t.date) return;
        const d = new Date(t.date);
        const y = d.getFullYear();
        const m = d.getMonth();
        const key = `${y}-${m}`;

        if (!summary[key]) {
          summary[key] = {
            income: 0,
            expenses: 0,
            savings: 0,
            savingsPercentage: 0,
            categories: {},
            transactionsCount: 0
          };
        }

        const amt = Number(t.amount) || 0;
        summary[key].transactionsCount++;

        if (t.type === 'income') {
          summary[key].income += amt;
        } else {
          summary[key].expenses += amt;
          const cat = (t.category || 'other').toLowerCase();
          summary[key].categories[cat] = (summary[key].categories[cat] || 0) + amt;
        }
      });
    }

    // 3. Recalculate savings and percentages safely for all months
    Object.keys(summary).forEach(k => {
      const inc = summary[k].income;
      const exp = summary[k].expenses;
      summary[k].savings = inc - exp;
      summary[k].savingsPercentage = inc > 0 ? Number(((inc - exp) / inc * 100).toFixed(1)) : 0;
      if (!isFinite(summary[k].savingsPercentage)) summary[k].savingsPercentage = 0;
    });

    bbAnalyticsState.monthlySummary = summary;
    return summary;
  }

  // --------------------------------------------------------------------------
  // 5. Formatting Utilities & Safe Math
  // --------------------------------------------------------------------------
  function bbAnalyticsFormatCurrency(amount) {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      return '₹0';
    }
    const isNegative = amount < 0;
    const absVal = Math.abs(Math.round(amount));
    return (isNegative ? '-₹' : '₹') + absVal.toLocaleString('en-IN');
  }

  function bbAnalyticsFormatPercentage(pct) {
    if (typeof pct !== 'number' || isNaN(pct) || !isFinite(pct)) {
      return '0.0%';
    }
    return `${pct.toFixed(1)}%`;
  }

  // --------------------------------------------------------------------------
  // 6. Analytics KPI Overview Render
  // --------------------------------------------------------------------------
  function bbAnalyticsRenderKPIs() {
    const summary = bbAnalyticsState.monthlySummary;
    const keys = Object.keys(summary).sort();

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalSavings = 0;

    keys.forEach(k => {
      totalIncome += summary[k].income;
      totalExpenses += summary[k].expenses;
      totalSavings += summary[k].savings;
    });

    const avgSavingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

    const elInc = document.getElementById('bb-kpi-total-income');
    const elExp = document.getElementById('bb-kpi-total-expenses');
    const elSav = document.getElementById('bb-kpi-total-savings');
    const elRate = document.getElementById('bb-kpi-savings-rate');

    if (elInc) elInc.textContent = bbAnalyticsFormatCurrency(totalIncome);
    if (elExp) elExp.textContent = bbAnalyticsFormatCurrency(totalExpenses);
    if (elSav) {
      elSav.textContent = bbAnalyticsFormatCurrency(totalSavings);
      elSav.style.color = totalSavings < 0 ? 'var(--bb-color-expense-light)' : '#ffffff';
    }
    if (elRate) elRate.textContent = bbAnalyticsFormatPercentage(avgSavingsRate);
  }

  // --------------------------------------------------------------------------
  // 7. Automated Financial Insights Engine
  // --------------------------------------------------------------------------
  /**
   * Generates actionable financial insights based on real user figures.
   * Prevents misleading statements when there is insufficient data.
   */
  function bbAnalyticsGenerateInsights() {
    const container = document.getElementById('bb-insights-grid');
    if (!container) return;

    const summary = bbAnalyticsState.monthlySummary;
    const keys = Object.keys(summary).sort();

    if (keys.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--bb-text-muted);">
          No transaction history available yet. Record income and expenses to unlock automated financial insights.
        </div>
      `;
      return;
    }

    const currentKey = bbAnalyticsState.activeReportMonthKey || keys[keys.length - 1];
    const currentMonth = summary[currentKey] || { income: 0, expenses: 0, savings: 0, categories: {} };

    // Previous month detection
    const currentIdx = keys.indexOf(currentKey);
    const prevKey = currentIdx > 0 ? keys[currentIdx - 1] : null;
    const prevMonth = prevKey ? summary[prevKey] : null;

    const insights = [];

    // 1. Savings Rate Insight
    if (currentMonth.income > 0) {
      if (currentMonth.savingsPercentage >= 30) {
        insights.push({
          icon: '💎',
          tag: 'Savings Benchmark',
          text: `You saved <strong>${bbAnalyticsFormatPercentage(currentMonth.savingsPercentage)}</strong> of your income this month (${bbAnalyticsFormatCurrency(currentMonth.savings)} retained). Outstanding capital accumulation.`
        });
      } else if (currentMonth.savingsPercentage > 0) {
        insights.push({
          icon: '🎯',
          tag: 'Retention Rate',
          text: `You saved <strong>${bbAnalyticsFormatPercentage(currentMonth.savingsPercentage)}</strong> of your earnings this month. Try trimming discretionary categories to push towards 25%.`
        });
      } else {
        insights.push({
          icon: '⚠️',
          tag: 'Deficit Warning',
          text: `Your expenditures exceeded your monthly income by <strong>${bbAnalyticsFormatCurrency(Math.abs(currentMonth.savings))}</strong>. Consider reviewing recurring bills.`
        });
      }
    } else {
      insights.push({
        icon: 'ℹ️',
        tag: 'Income Status',
        text: `No income has been registered for this selected period (${bbAnalyticsFormatCurrency(currentMonth.expenses)} in recorded outflow).`
      });
    }

    // 2. Highest Expense Category Insight
    const categories = currentMonth.categories || {};
    let highestCat = null;
    let highestAmt = 0;
    Object.keys(categories).forEach(c => {
      if (categories[c] > highestAmt) {
        highestAmt = categories[c];
        highestCat = c;
      }
    });

    if (highestCat && highestAmt > 0) {
      const catCapitalized = highestCat.charAt(0).toUpperCase() + highestCat.slice(1);
      const catPct = currentMonth.expenses > 0 ? Math.round((highestAmt / currentMonth.expenses) * 100) : 0;
      insights.push({
        icon: '🍔',
        tag: 'Top Expenditure',
        text: `<strong>${catCapitalized}</strong> is your highest expense category at <strong>${bbAnalyticsFormatCurrency(highestAmt)}</strong> (${catPct}% of total monthly outflows).`
      });
    } else {
      insights.push({
        icon: '📊',
        tag: 'Expense Breakdown',
        text: `Categorized expenditures are balanced across multiple standard allocations with no extreme outliers.`
      });
    }

    // 3. Month-over-Month Comparison
    if (prevMonth && prevMonth.income > 0 && currentMonth.income > 0) {
      const savingsDelta = currentMonth.savings - prevMonth.savings;
      const expenseDelta = currentMonth.expenses - prevMonth.expenses;

      if (savingsDelta > 0) {
        insights.push({
          icon: '📈',
          tag: 'Growth Trend',
          text: `Your savings increased by <strong>${bbAnalyticsFormatCurrency(savingsDelta)}</strong> compared with last month. Upward wealth trajectory confirmed.`
        });
      } else if (savingsDelta < 0) {
        insights.push({
          icon: '📉',
          tag: 'Drawdown Trend',
          text: `Your savings decreased by <strong>${bbAnalyticsFormatCurrency(Math.abs(savingsDelta))}</strong> compared with last month.`
        });
      }

      if (expenseDelta > 0) {
        insights.push({
          icon: '💸',
          tag: 'Spend Velocity',
          text: `Your monthly expenses increased by <strong>${bbAnalyticsFormatCurrency(expenseDelta)}</strong> compared with last month.`
        });
      } else if (expenseDelta < 0) {
        insights.push({
          icon: '🛡️',
          tag: 'Spend Discipline',
          text: `Your expenditures decreased by <strong>${bbAnalyticsFormatCurrency(Math.abs(expenseDelta))}</strong> compared with last month. Great discipline.`
        });
      }
    } else {
      insights.push({
        icon: '📅',
        tag: 'Historical Baseline',
        text: `BroBudget is tracking your financial periods. Trend velocity and month-over-month comparisons activate across multi-month records.`
      });
    }

    // Render top 4 insight cards
    let html = '';
    insights.slice(0, 4).forEach(item => {
      html += `
        <article class="bb-analytics-insight-item">
          <div class="bb-insight-tag">
            <span>${item.icon}</span>
            <span>${item.tag}</span>
          </div>
          <div class="bb-insight-text">${item.text}</div>
        </article>
      `;
    });

    container.innerHTML = html;
  }

  // --------------------------------------------------------------------------
  // 8. Dual Chart Engine (Chart.js CDN + HTML5 Canvas Fallback)
  // --------------------------------------------------------------------------
  /**
   * Renders all 3 required charts:
   * 1. Expense Category Doughnut
   * 2. Income vs Expense Bar Chart
   * 3. Savings Trend Line Chart
   */
  function bbAnalyticsRenderCharts() {
    const hasChartJs = typeof window.Chart !== 'undefined';
    if (hasChartJs) {
      bbAnalyticsRenderChartJs();
    } else {
      bbAnalyticsRenderFallbackCanvas();
    }
  }

  /**
   * Implementation using Chart.js CDN with customized dark glassmorphic palette
   */
  function bbAnalyticsRenderChartJs() {
    const summary = bbAnalyticsState.monthlySummary;
    const sortedKeys = Object.keys(summary).sort();

    // Month Labels & Series Data
    const labels = sortedKeys.map(k => {
      const [year, month] = k.split('-');
      return bbMonthNames[parseInt(month, 10)] ? bbMonthNames[parseInt(month, 10)].substring(0, 3) : k;
    });

    const incomeSeries = sortedKeys.map(k => summary[k].income);
    const expenseSeries = sortedKeys.map(k => summary[k].expenses);
    const savingsSeries = sortedKeys.map(k => summary[k].savings);

    // Active month category breakdown
    const activeKey = bbAnalyticsState.activeReportMonthKey || sortedKeys[sortedKeys.length - 1];
    const activeRecord = summary[activeKey] || { categories: {} };
    const catMap = activeRecord.categories || {};
    const catLabels = Object.keys(catMap).map(c => c.charAt(0).toUpperCase() + c.slice(1));
    const catValues = Object.keys(catMap).map(c => catMap[c]);
    const catPalette = Object.keys(catMap).map(c => bbCategoryColors[c.toLowerCase()] || '#8b5cf6');

    // 1. Expense Category Doughnut
    const ctxCat = document.getElementById('bb-chart-category-doughnut');
    if (ctxCat) {
      if (bbAnalyticsState.chartInstances.categoryDoughnut) {
        bbAnalyticsState.chartInstances.categoryDoughnut.destroy();
      }
      bbAnalyticsState.chartInstances.categoryDoughnut = new window.Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: catLabels.length > 0 ? catLabels : ['No Expenses'],
          datasets: [{
            data: catValues.length > 0 ? catValues : [1],
            backgroundColor: catValues.length > 0 ? catPalette : ['#334155'],
            borderColor: '#0f172a',
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return ` ${context.label}: ₹${Number(context.raw).toLocaleString('en-IN')}`;
                }
              }
            }
          },
          cutout: '70%'
        }
      });
    }

    // 2. Income vs Expense Bar Chart
    const ctxBar = document.getElementById('bb-chart-income-expense-bar');
    if (ctxBar) {
      if (bbAnalyticsState.chartInstances.incomeExpenseBar) {
        bbAnalyticsState.chartInstances.incomeExpenseBar.destroy();
      }
      bbAnalyticsState.chartInstances.incomeExpenseBar = new window.Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Income',
              data: incomeSeries,
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              borderColor: '#10b981',
              borderRadius: 6
            },
            {
              label: 'Expenses',
              data: expenseSeries,
              backgroundColor: 'rgba(244, 63, 94, 0.8)',
              borderColor: '#f43f5e',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => `₹${(v/1000).toFixed(0)}k` } }
          },
          plugins: {
            legend: { position: 'top', labels: { color: '#94a3b8' } }
          }
        }
      });
    }

    // 3. Savings Trend Line Chart
    const ctxLine = document.getElementById('bb-chart-savings-trend-line');
    if (ctxLine) {
      if (bbAnalyticsState.chartInstances.savingsLine) {
        bbAnalyticsState.chartInstances.savingsLine.destroy();
      }
      bbAnalyticsState.chartInstances.savingsLine = new window.Chart(ctxLine, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Net Savings',
            data: savingsSeries,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            borderWidth: 3,
            fill: true,
            tension: 0.38,
            pointBackgroundColor: '#a78bfa',
            pointBorderColor: '#0f172a',
            pointRadius: 5,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => `₹${(v/1000).toFixed(0)}k` } }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  }

  /**
   * High-Performance Pure HTML5 Canvas Fallback Renderer (Zero Dependencies, Offline-Guaranteed)
   */
  function bbAnalyticsRenderFallbackCanvas() {
    const summary = bbAnalyticsState.monthlySummary;
    const sortedKeys = Object.keys(summary).sort();

    // 1. Doughnut Chart Fallback
    const cvsCat = document.getElementById('bb-chart-category-doughnut');
    if (cvsCat && cvsCat.getContext) {
      const ctx = cvsCat.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = cvsCat.getBoundingClientRect();
      cvsCat.width = (rect.width || 300) * dpr;
      cvsCat.height = (rect.height || 260) * dpr;
      ctx.scale(dpr, dpr);

      const activeKey = bbAnalyticsState.activeReportMonthKey || sortedKeys[sortedKeys.length - 1];
      const categories = (summary[activeKey] && summary[activeKey].categories) || {};
      const keys = Object.keys(categories);
      const total = keys.reduce((acc, c) => acc + categories[c], 0);

      const centerX = (rect.width || 300) / 2;
      const centerY = (rect.height || 260) / 2 - 15;
      const radius = Math.min(centerX, centerY) - 20;

      ctx.clearRect(0, 0, rect.width, rect.height);

      if (total <= 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 28;
        ctx.stroke();
      } else {
        let startAngle = -Math.PI / 2;
        keys.forEach(cat => {
          const sliceAngle = (categories[cat] / total) * 2 * Math.PI;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
          ctx.strokeStyle = bbCategoryColors[cat] || '#8b5cf6';
          ctx.lineWidth = 28;
          ctx.stroke();
          startAngle += sliceAngle;
        });
      }

      // Center text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bbAnalyticsFormatCurrency(total), centerX, centerY + 5);
    }

    // 2. Bar Chart Fallback
    const cvsBar = document.getElementById('bb-chart-income-expense-bar');
    if (cvsBar && cvsBar.getContext) {
      const ctx = cvsBar.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = cvsBar.getBoundingClientRect();
      cvsBar.width = (rect.width || 300) * dpr;
      cvsBar.height = (rect.height || 260) * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const maxVal = Math.max(...sortedKeys.map(k => Math.max(summary[k].income, summary[k].expenses)), 1000);
      const chartHeight = (rect.height || 260) - 50;
      const groupWidth = ((rect.width || 300) - 40) / sortedKeys.length;

      sortedKeys.forEach((k, idx) => {
        const x = 30 + idx * groupWidth;
        const incHeight = (summary[k].income / maxVal) * chartHeight;
        const expHeight = (summary[k].expenses / maxVal) * chartHeight;
        const barW = Math.min(groupWidth / 2 - 4, 16);

        // Income Bar
        ctx.fillStyle = '#10b981';
        ctx.fillRect(x, chartHeight - incHeight + 20, barW, incHeight);

        // Expense Bar
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(x + barW + 2, chartHeight - expHeight + 20, barW, expHeight);

        // Month Label
        const [y, m] = k.split('-');
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bbMonthNames[parseInt(m, 10)].substring(0, 3), x + barW, chartHeight + 36);
      });
    }

    // 3. Line Chart Fallback
    const cvsLine = document.getElementById('bb-chart-savings-trend-line');
    if (cvsLine && cvsLine.getContext) {
      const ctx = cvsLine.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = cvsLine.getBoundingClientRect();
      cvsLine.width = (rect.width || 600) * dpr;
      cvsLine.height = (rect.height || 260) * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const savings = sortedKeys.map(k => summary[k].savings);
      const maxSav = Math.max(...savings, 1000);
      const minSav = Math.min(...savings, 0);
      const range = maxSav - minSav || 1;
      const chartH = (rect.height || 260) - 50;
      const stepX = ((rect.width || 600) - 60) / (sortedKeys.length - 1 || 1);

      ctx.beginPath();
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 3;

      sortedKeys.forEach((k, idx) => {
        const x = 30 + idx * stepX;
        const y = chartH - ((summary[k].savings - minSav) / range) * chartH + 20;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Points
      sortedKeys.forEach((k, idx) => {
        const x = 30 + idx * stepX;
        const y = chartH - ((summary[k].savings - minSav) / range) * chartH + 20;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#a78bfa';
        ctx.fill();
      });
    }
  }

  // --------------------------------------------------------------------------
  // 9. Savings Goals Management (bbSavings*)
  // --------------------------------------------------------------------------
  /**
   * Renders the savings goal cards with animated progress bars,
   * hover animations, and the "🎉 Goal Achieved!" banner at 100%.
   */
  function bbSavingsRenderGoals() {
    const container = document.getElementById('bb-savings-goals-grid');
    if (!container) return;

    const goals = bbAnalyticsState.savingsGoals || bbSavingsGetGoals();

    if (goals.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--bb-text-muted);">
          No active savings goals found. Click <strong>+ Create New Goal</strong> to set your first target!
        </div>
      `;
      return;
    }

    let html = '';
    goals.forEach(goal => {
      const target = Number(goal.targetAmount) || 1;
      const current = Number(goal.currentSaved) || 0;
      const pct = Math.min(Math.max(Number(((current / target) * 100).toFixed(2)), 0), 100);
      const isCompleted = pct >= 100;

      html += `
        <article class="bb-savings-card ${isCompleted ? 'bb-goal-completed' : ''}" id="bb-goal-card-${goal.id}">
          <div class="bb-savings-card-header">
            <h3 class="bb-savings-goal-name">${escapeHtml(goal.name)}</h3>
            <span class="bb-savings-goal-tag">${isCompleted ? 'Completed' : 'In Progress'}</span>
          </div>

          <div class="bb-savings-amounts-row">
            <div>
              <div class="bb-savings-saved-label">Current Saved</div>
              <div class="bb-savings-saved-val">${bbAnalyticsFormatCurrency(current)}</div>
            </div>
            <div style="text-align: right;">
              <div class="bb-savings-saved-label">Target Goal</div>
              <div class="bb-savings-target-val">${bbAnalyticsFormatCurrency(target)}</div>
            </div>
          </div>

          <!-- Animated Progress Bar -->
          <div class="bb-savings-progress-track">
            <div class="bb-savings-progress-fill" style="width: ${pct}%;"></div>
          </div>

          <div class="bb-savings-progress-meta">
            <span>Target: ${goal.targetDate || 'Ongoing'}</span>
            <span class="bb-savings-pct-val">${pct.toFixed(1)}%</span>
          </div>

          <!-- Goal Achieved Banner if 100% -->
          <div class="bb-savings-achieved-badge">
            🎉 Goal Achieved!
          </div>

          <!-- Card Actions -->
          <div class="bb-savings-card-actions">
            <button type="button" class="bb-savings-btn-deposit" onclick="window.BBAnalytics.openDepositModal(${goal.id})">
              + Add Funds
            </button>
            <button type="button" class="bb-savings-btn-delete" title="Delete Goal" aria-label="Delete Goal ${escapeHtml(goal.name)}" onclick="window.BBAnalytics.deleteGoal(${goal.id})">
              🗑️
            </button>
          </div>
        </article>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Creates a new savings goal
   */
  function bbSavingsCreateGoal(goalData) {
    const goals = bbSavingsGetGoals();
    const newGoal = {
      id: Date.now(),
      name: goalData.name.trim(),
      targetAmount: Number(goalData.targetAmount),
      currentSaved: Number(goalData.currentSaved) || 0,
      targetDate: goalData.targetDate || ''
    };

    goals.unshift(newGoal);
    bbSavingsSaveGoals(goals);
    bbSavingsRenderGoals();
    bbAnalyticsShowToast('Goal Created', `Target for "${newGoal.name}" established!`, '🎯');
    return newGoal;
  }

  /**
   * Adds deposit funds to an existing savings goal
   */
  function bbSavingsAddDeposit(goalId, amount) {
    const goals = bbSavingsGetGoals();
    const goal = goals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    goal.currentSaved = (Number(goal.currentSaved) || 0) + Number(amount);
    bbSavingsSaveGoals(goals);
    bbSavingsRenderGoals();
    bbAnalyticsShowToast('Funds Deposited', `Added ${bbAnalyticsFormatCurrency(amount)} to "${goal.name}".`, '💰');
  }

  /**
   * Deletes a savings goal
   */
  function bbSavingsDeleteGoal(goalId) {
    let goals = bbSavingsGetGoals();
    const target = goals.find(g => String(g.id) === String(goalId));
    goals = goals.filter(g => String(g.id) !== String(goalId));
    bbSavingsSaveGoals(goals);
    bbSavingsRenderGoals();
    if (target) {
      bbAnalyticsShowToast('Goal Removed', `Deleted "${target.name}".`, '🗑️');
    }
  }

  // --------------------------------------------------------------------------
  // 10. Monthly Report Card (bbReports*)
  // --------------------------------------------------------------------------
  /**
   * Renders the executive report card for a selected month:
   * Month, Total Income, Total Expenses, Savings, Savings %,
   * Largest Expense Category, Number of Transactions
   */
  function bbReportsRenderMonthlyReport() {
    const summary = bbAnalyticsState.monthlySummary;
    const sortedKeys = Object.keys(summary).sort();

    // Populate Report Month Dropdown
    const selectEl = document.getElementById('bb-report-month-select');
    if (selectEl && selectEl.children.length === 0) {
      sortedKeys.forEach(key => {
        const [year, month] = key.split('-');
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${bbMonthNames[parseInt(month, 10)]} ${year}`;
        if (key === bbAnalyticsState.activeReportMonthKey) opt.selected = true;
        selectEl.appendChild(opt);
      });

      selectEl.addEventListener('change', (e) => {
        bbAnalyticsState.activeReportMonthKey = e.target.value;
        bbReportsRenderMonthlyReport();
        bbAnalyticsGenerateInsights();
        bbAnalyticsRenderCharts();
      });
    }

    const activeKey = bbAnalyticsState.activeReportMonthKey || sortedKeys[sortedKeys.length - 1];
    const data = summary[activeKey] || {
      income: 0,
      expenses: 0,
      savings: 0,
      savingsPercentage: 0,
      categories: {},
      transactionsCount: 0
    };

    // Find largest expense category
    let topCat = 'None';
    let topCatAmt = 0;
    Object.keys(data.categories || {}).forEach(c => {
      if (data.categories[c] > topCatAmt) {
        topCatAmt = data.categories[c];
        topCat = c.charAt(0).toUpperCase() + c.slice(1);
      }
    });

    const elInc = document.getElementById('bb-rep-income');
    const elExp = document.getElementById('bb-rep-expenses');
    const elSav = document.getElementById('bb-rep-savings');
    const elRate = document.getElementById('bb-rep-rate');
    const elTop = document.getElementById('bb-rep-top-category');
    const elCount = document.getElementById('bb-rep-tx-count');

    if (elInc) elInc.textContent = bbAnalyticsFormatCurrency(data.income);
    if (elExp) elExp.textContent = bbAnalyticsFormatCurrency(data.expenses);
    if (elSav) {
      elSav.textContent = bbAnalyticsFormatCurrency(data.savings);
      elSav.style.color = data.savings < 0 ? 'var(--bb-color-expense-light)' : 'var(--bb-color-income-light)';
    }
    if (elRate) elRate.textContent = bbAnalyticsFormatPercentage(data.savingsPercentage);
    if (elTop) elTop.textContent = topCatAmt > 0 ? `${topCat} (${bbAnalyticsFormatCurrency(topCatAmt)})` : 'None';
    if (elCount) elCount.textContent = data.transactionsCount;
  }

  // --------------------------------------------------------------------------
  // 11. Monthly History Table with Sorting (bbReports*)
  // --------------------------------------------------------------------------
  /**
   * Renders the comprehensive Monthly History table:
   * Month, Income, Expenses, Savings, Savings %
   * Supports sorting by month, income, expenses, savings, and savings percentage.
   */
  function bbReportsRenderHistoryTable() {
    const tableBody = document.getElementById('bb-history-table-body');
    if (!tableBody) return;

    const summary = bbAnalyticsState.monthlySummary;
    let list = Object.keys(summary).map(key => {
      const [year, month] = key.split('-');
      return {
        key,
        year: parseInt(year, 10),
        monthIndex: parseInt(month, 10),
        monthName: `${bbMonthNames[parseInt(month, 10)]} ${year}`,
        income: summary[key].income,
        expenses: summary[key].expenses,
        savings: summary[key].savings,
        savingsPercentage: summary[key].savingsPercentage
      };
    });

    // Sorting Logic
    const col = bbAnalyticsState.historySortColumn;
    const asc = bbAnalyticsState.historySortAsc;

    list.sort((a, b) => {
      let valA, valB;
      if (col === 'month') {
        valA = a.year * 100 + a.monthIndex;
        valB = b.year * 100 + b.monthIndex;
      } else {
        valA = a[col];
        valB = b[col];
      }
      return asc ? valA - valB : valB - valA;
    });

    let html = '';
    list.forEach(item => {
      const rateColor = item.savingsPercentage >= 20 ? 'var(--bb-color-income-light)' : '#fbbf24';
      const savingsColor = item.savings < 0 ? 'var(--bb-color-expense-light)' : '#ffffff';

      html += `
        <tr>
          <td data-label="Month"><strong>${item.monthName}</strong></td>
          <td data-label="Income" style="color:var(--bb-color-income-light);">${bbAnalyticsFormatCurrency(item.income)}</td>
          <td data-label="Expenses" style="color:var(--bb-color-expense-light);">${bbAnalyticsFormatCurrency(item.expenses)}</td>
          <td data-label="Savings" style="color:${savingsColor};">${bbAnalyticsFormatCurrency(item.savings)}</td>
          <td data-label="Savings %" style="color:${rateColor}; font-weight:700;">${bbAnalyticsFormatPercentage(item.savingsPercentage)}</td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;
  }

  function bbReportsSetupTableSorting() {
    const headers = document.querySelectorAll('.bb-report-table th[data-sort]');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (bbAnalyticsState.historySortColumn === col) {
          bbAnalyticsState.historySortAsc = !bbAnalyticsState.historySortAsc;
        } else {
          bbAnalyticsState.historySortColumn = col;
          bbAnalyticsState.historySortAsc = false;
        }
        bbReportsRenderHistoryTable();
      });
    });
  }

  // --------------------------------------------------------------------------
  // 12. Modal Handlers (New Goal & Add Deposit)
  // --------------------------------------------------------------------------
  let bbActiveDepositGoalId = null;

  function bbAnalyticsSetupModals() {
    // 1. Goal Modal
    const goalModal = document.getElementById('bb-goal-modal');
    const openGoalBtn = document.getElementById('bb-btn-open-goal-modal');
    const closeGoalBtn = document.getElementById('bb-btn-close-goal-modal');
    const goalForm = document.getElementById('bb-goal-form');

    if (openGoalBtn && goalModal) {
      openGoalBtn.addEventListener('click', () => goalModal.classList.add('bb-modal-active'));
    }
    if (closeGoalBtn && goalModal) {
      closeGoalBtn.addEventListener('click', () => goalModal.classList.remove('bb-modal-active'));
    }
    if (goalForm) {
      goalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('bb-input-goal-name').value;
        const target = document.getElementById('bb-input-goal-target').value;
        const saved = document.getElementById('bb-input-goal-saved').value;
        const date = document.getElementById('bb-input-goal-date').value;

        if (!name || !target || Number(target) <= 0) {
          alert('Please enter a valid goal name and positive target amount.');
          return;
        }

        bbSavingsCreateGoal({
          name,
          targetAmount: target,
          currentSaved: saved,
          targetDate: date
        });

        goalForm.reset();
        if (goalModal) goalModal.classList.remove('bb-modal-active');
      });
    }

    // 2. Deposit Modal
    const depositModal = document.getElementById('bb-deposit-modal');
    const closeDepositBtn = document.getElementById('bb-btn-close-deposit-modal');
    const depositForm = document.getElementById('bb-deposit-form');

    if (closeDepositBtn && depositModal) {
      closeDepositBtn.addEventListener('click', () => depositModal.classList.remove('bb-modal-active'));
    }
    if (depositForm) {
      depositForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = document.getElementById('bb-input-deposit-amt').value;
        if (!amt || Number(amt) <= 0) {
          alert('Please enter a valid deposit amount greater than ₹0.');
          return;
        }

        if (bbActiveDepositGoalId) {
          bbSavingsAddDeposit(bbActiveDepositGoalId, amt);
        }
        depositForm.reset();
        if (depositModal) depositModal.classList.remove('bb-modal-active');
      });
    }

    // Close on backdrop click & Escape
    [goalModal, depositModal].forEach(m => {
      if (m) {
        m.addEventListener('click', (e) => {
          if (e.target === m) m.classList.remove('bb-modal-active');
        });
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (goalModal) goalModal.classList.remove('bb-modal-active');
        if (depositModal) depositModal.classList.remove('bb-modal-active');
      }
    });
  }

  function bbSavingsOpenDepositModal(goalId) {
    bbActiveDepositGoalId = goalId;
    const modal = document.getElementById('bb-deposit-modal');
    if (modal) modal.classList.add('bb-modal-active');
  }

  // --------------------------------------------------------------------------
  // 13. Toast Notification System
  // --------------------------------------------------------------------------
  function bbAnalyticsShowToast(title, message, icon = 'ℹ️') {
    let container = document.getElementById('bb-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'bb-toast-container';
      container.className = 'bb-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'bb-toast-message';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="bb-toast-icon">${icon}</div>
      <div class="bb-toast-body">
        <div class="bb-toast-title">${title}</div>
        <div class="bb-toast-desc">${message}</div>
      </div>
      <button type="button" class="bb-toast-close-btn" aria-label="Close notification">&times;</button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('bb-toast-visible'));

    const closeBtn = toast.querySelector('.bb-toast-close-btn');
    const dismiss = () => {
      toast.classList.remove('bb-toast-visible');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    };

    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    setTimeout(dismiss, 3800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --------------------------------------------------------------------------
  // 14. Initialization & Event Bus
  // --------------------------------------------------------------------------
  function bbAnalyticsInit() {
    // 1. Load Data
    bbAnalyticsState.transactions = bbAnalyticsGetTransactions();
    bbAnalyticsState.savingsGoals = bbSavingsGetGoals();
    bbAnalyticsBuildMonthlySummary();

    // 2. Render Components
    bbAnalyticsRenderKPIs();
    bbAnalyticsGenerateInsights();
    bbReportsRenderMonthlyReport();
    bbReportsRenderHistoryTable();
    bbReportsSetupTableSorting();
    bbSavingsRenderGoals();
    bbAnalyticsSetupModals();

    // 3. Render Charts
    setTimeout(() => {
      bbAnalyticsRenderCharts();
    }, 150);

    // 4. Mobile Sidebar Drawer Setup
    const aside = document.getElementById('bb-sidebar');
    const toggleBtn = document.getElementById('bb-sidebar-toggle');
    const backdrop = document.getElementById('bb-sidebar-backdrop');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (aside) aside.classList.toggle('bb-sidebar-mobile-open');
        if (backdrop) backdrop.classList.toggle('bb-sidebar-backdrop-active');
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        if (aside) aside.classList.remove('bb-sidebar-mobile-open');
        if (backdrop) backdrop.classList.remove('bb-sidebar-backdrop-active');
      });
    }

    // 5. Sidebar Badge Counters
    function bbAnalyticsUpdateBadges() {
      const goalsBadge = document.getElementById('bb-sidebar-count-goals');
      if (goalsBadge) {
        goalsBadge.textContent = bbAnalyticsState.savingsGoals.length;
      }
      const txBadge = document.getElementById('bb-sidebar-count-tx');
      if (txBadge) {
        txBadge.textContent = bbAnalyticsState.transactions.length;
      }
    }
    bbAnalyticsUpdateBadges();

    // 6. Listen for external transaction changes
    window.addEventListener('bb:financial-data-updated', () => {
      bbAnalyticsState.transactions = bbAnalyticsGetTransactions();
      bbAnalyticsBuildMonthlySummary();
      bbAnalyticsRenderKPIs();
      bbAnalyticsGenerateInsights();
      bbReportsRenderMonthlyReport();
      bbReportsRenderHistoryTable();
      bbAnalyticsRenderCharts();
      bbAnalyticsUpdateBadges();
      bbAnalyticsShowToast('Analytics Updated', 'New transactions reflected in reports.', '🔄');
    });

    window.addEventListener('resize', () => {
      if (typeof window.Chart === 'undefined') {
        bbAnalyticsRenderFallbackCanvas();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 15. Export Global Public API
  // --------------------------------------------------------------------------
  window.BBAnalytics = {
    version: '1.0.0',
    module: 'Developer 3 - Analytics, Savings Goals & Reports',
    getSummary: () => ({ ...bbAnalyticsState.monthlySummary }),
    getGoals: bbSavingsGetGoals,
    createGoal: bbSavingsCreateGoal,
    deleteGoal: bbSavingsDeleteGoal,
    addDeposit: bbSavingsAddDeposit,
    openDepositModal: bbSavingsOpenDepositModal,
    refresh: () => {
      bbAnalyticsBuildMonthlySummary();
      bbAnalyticsRenderKPIs();
      bbAnalyticsGenerateInsights();
      bbReportsRenderMonthlyReport();
      bbReportsRenderHistoryTable();
      bbAnalyticsRenderCharts();
      bbSavingsRenderGoals();
    }
  };

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bbAnalyticsInit);
  } else {
    bbAnalyticsInit();
  }

})();
