---
layout: default
title: "Simulador de investimento finacneiro"
permalink: /simulador-investmentos/
---


# Investment Simulator

Below is our interactive investment simulation tool. Adjust the parameters and click "Run Simulation."

<!-- BEGIN RAW HTML/JS -->
<div>
  <form id="simulatorForm">
    <div>
      <label for="initialAmount">Initial Investment Amount:</label>
      <input type="number" id="initialAmount" required value="10000">
    </div>
    <div>
      <label for="startYear">Start Year:</label>
      <input type="number" id="startYear" value="2025" required>
    </div>
    <div>
      <label for="simulationYears">Simulation Duration (Years):</label>
      <input type="number" id="simulationYears" value="30" required>
    </div>
    <div>
      <label for="returnRate">Annual Return Rate (%)</label>
      <input type="number" id="returnRate" step="0.1" value="5" required>
    </div>
    <div>
      <label for="inflationRate">Annual Inflation Rate (%)</label>
      <input type="number" id="inflationRate" step="0.1" value="2" required>
    </div>
    <div>
      <label for="taxRate">Tax Rate on Gains (%)</label>
      <input type="number" id="taxRate" step="0.1" value="20" required>
    </div>

    <h3>Extra Investments (Optional)</h3>
    <div id="extraInvestments">
      <div class="investment">
        <label>Date (Year):</label>
        <input type="number" class="investment-year" value="2025">
        <label>Amount:</label>
        <input type="number" class="investment-amount" value="0">
      </div>
    </div>
    <button type="button" id="addInvestment">Add Another Investment</button>

    <br><br>
    <button type="submit">Run Simulation</button>
  </form>
</div>

<div id="results"></div>

<!-- A canvas for the Chart.js chart -->
<canvas id="chartCanvas" width="600" height="400"></canvas>

<!-- Include Chart.js from CDN -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>
  // Add a new extra investment input when the button is clicked.
  document.getElementById('addInvestment').addEventListener('click', function() {
    var container = document.getElementById('extraInvestments');
    var div = document.createElement('div');
    div.className = 'investment';
    div.innerHTML =
      '<label>Date (Year):</label><input type="number" class="investment-year" value="2025"> ' +
      '<label>Amount:</label><input type="number" class="investment-amount" value="0">';
    container.appendChild(div);
  });

  // When the form is submitted, run the simulation.
  document.getElementById('simulatorForm').addEventListener('submit', function(e) {
    e.preventDefault();
    runSimulation();
  });

  function runSimulation() {
    // Retrieve input values.
    var initialAmount = parseFloat(document.getElementById('initialAmount').value);
    var startYear = parseInt(document.getElementById('startYear').value);
    var simulationYears = parseInt(document.getElementById('simulationYears').value);
    var returnRate = parseFloat(document.getElementById('returnRate').value) / 100;
    var inflationRate = parseFloat(document.getElementById('inflationRate').value) / 100;
    var taxRate = parseFloat(document.getElementById('taxRate').value) / 100;

    // Aggregate extra contributions into an object keyed by year.
    var extraInvestmentsElems = document.getElementsByClassName('investment');
    var extraContribs = {};
    for (var i = 0; i < extraInvestmentsElems.length; i++) {
      var year = parseInt(extraInvestmentsElems[i].querySelector('.investment-year').value);
      var amt = parseFloat(extraInvestmentsElems[i].querySelector('.investment-amount').value);
      if (!isNaN(year) && !isNaN(amt) && amt !== 0) {
        if (!extraContribs[year]) {
          extraContribs[year] = 0;
        }
        extraContribs[year] += amt;
      }
    }

    // Prepare arrays to store simulation results.
    var years = [];
    var nominalValues = [];
    var realValues = [];
    var nominalGrowthRates = [];
    var realGrowthRates = [];
    var distributions = [];

    var currentNominal = initialAmount;

    // Year 0
    years.push(startYear);
    nominalValues.push(currentNominal);
    realValues.push(currentNominal); // at the start, nominal == real
    nominalGrowthRates.push(0);
    realGrowthRates.push(0);
    distributions.push(0);

    // Run the simulation for each subsequent year.
    for (var i = 1; i <= simulationYears; i++) {
      var year = startYear + i;
      // Add any extra contribution for the current year.
      var contrib = extraContribs[year] || 0;
      currentNominal += contrib;

      // Pre-growth for nominal comparison
      var preGrowthNom = currentNominal;
      // Apply nominal return
      currentNominal = currentNominal * (1 + returnRate);
      var nominalGrowth = (currentNominal / preGrowthNom) - 1;

      years.push(year);
      nominalValues.push(currentNominal);
      nominalGrowthRates.push(nominalGrowth * 100);

      // Real value after adjusting for cumulative inflation
      var currentReal = currentNominal / Math.pow((1 + inflationRate), i);
      realValues.push(currentReal);

      var previousReal = realValues[i - 1];
      var baseReal = previousReal + contrib;
      var realGrowth = (currentReal / baseReal) - 1;
      realGrowthRates.push(realGrowth * 100);

      // Real earnings above inflation, minus tax
      var realEarnings = currentReal - baseReal;
      var netRealEarnings = realEarnings * (1 - taxRate);
      distributions.push(netRealEarnings);
    }

    // Build results table
    var resultsDiv = document.getElementById('results');
    var html = '<h2>Simulation Results</h2>';
    html += '<table>';
    html += '<tr><th>Year</th><th>Nominal Value</th><th>Real Value</th>' +
            '<th>Nominal Growth (%)</th><th>Real Growth (%)</th>' +
            '<th>Annual Dist. (Real, post-tax)</th>' +
            '<th>Monthly Dist. (Real, post-tax)</th></tr>';

    for (var i = 0; i < years.length; i++) {
      var monthlyDist = distributions[i] / 12;
      html += '<tr>';
      html += '<td>' + years[i] + '</td>';
      html += '<td>' + nominalValues[i].toFixed(2) + '</td>';
      html += '<td>' + realValues[i].toFixed(2) + '</td>';
      html += '<td>' + nominalGrowthRates[i].toFixed(2) + '</td>';
      html += '<td>' + realGrowthRates[i].toFixed(2) + '</td>';
      html += '<td>' + distributions[i].toFixed(2) + '</td>';
      html += '<td>' + monthlyDist.toFixed(2) + '</td>';
      html += '</tr>';
    }
    html += '</table>';
    resultsDiv.innerHTML = html;

    // Plot with Chart.js
    var ctx = document.getElementById('chartCanvas').getContext('2d');
    if (window.simulationChart) {
      window.simulationChart.destroy();
    }
    window.simulationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [
          {
            label: 'Nominal Value',
            data: nominalValues,
            borderColor: 'blue',
            fill: false
          },
          {
            label: 'Real Value',
            data: realValues,
            borderColor: 'green',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
</script>
<!-- END RAW HTML/JS -->